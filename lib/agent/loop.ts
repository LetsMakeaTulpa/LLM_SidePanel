import { saveEvidenceNode } from '../cache/db';
import { EvidenceGraph } from '../evidence/graph';
import { extractDomain } from '../fetch/domain';
import { ensureSnapshot } from '../fetch/wayback';
import { clamp01 } from '../hash';
import { chatJson } from '../llm';
import { commonCrawlTool } from '../tools/common_crawl';
import { crtshTool } from '../tools/crt_sh';
import { fetchPageTool } from '../tools/fetch_page';
import { githubCodeTool } from '../tools/github_code';
import { errorMessage, runTool, type ToolRun } from '../tools/run';
import { waybackCdxTool } from '../tools/wayback_cdx';
import { webSearchTool } from '../tools/web_search';
import type {
  AgentEvent,
  Evidence,
  Gap,
  InvestigationResult,
  SourceTool,
  Tool,
  ToolContext,
} from '../types';
import { buildPlannerMessages, gapfinderMessages, synthesisMessages } from './prompts';
import { GapListSchema, PlanSchema, SynthesisSchema, type Synthesis } from './schema';

const CONFIDENCE: Record<SourceTool, number> = {
  web_search: 0.4,
  wayback_cdx: 0.6,
  crt_sh: 0.55,
  github_code: 0.65,
  common_crawl: 0.5,
  fetch_page: 0.75,
};

const MAX_QUERIES = 4;
const DEFAULT_MAX_TOOL_CALLS = 12;
const MAX_FETCH_PAGES = 4;
const TECHNICAL_RE =
  /\b(code|repo|repository|github|api|sdk|library|function|error|typescript|javascript|python|rust|sql|cve|commit|package)\b/i;

export interface InvestigateInput {
  question: string;
  signal?: AbortSignal;
  emit?: (event: AgentEvent) => void;
  maxToolCalls?: number;
  maxFetchPages?: number;
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Investigation driver: plan -> gather -> synthesise -> validate -> gaps -> snapshot.
 * Nothing reaches the LLM unless it exists in the evidence graph.
 */
export async function investigate(input: InvestigateInput): Promise<InvestigationResult> {
  const question = String(input.question || '').trim();
  if (!question) throw new Error('question is required');

  const emit = input.emit ?? (() => {});
  const started = Date.now();
  const graph = new EvidenceGraph();
  const gaps: Gap[] = [];
  const gapKeys = new Set<string>();

  const addGap = (gap: Gap) => {
    const topic = gap.topic.trim();
    const key = topic.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || gapKeys.has(key)) return;
    gapKeys.add(key);
    gaps.push({ ...gap, topic });
    emit({ type: 'gap', gap: { ...gap, topic } });
  };

  const ctx: ToolContext = { signal: input.signal, reportGap: addGap };
  const maxToolCalls = input.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  let toolCalls = 0;
  // Started as soon as page evidence is fetched; awaited before the result.
  const snapshotJobs: Promise<void>[] = [];

  const callTool = async <Args>(tool: Tool<Args>, args: Args): Promise<Evidence[]> => {
    if (input.signal?.aborted) throw abortError();
    if (toolCalls >= maxToolCalls) return [];
    toolCalls += 1;

    const run: ToolRun = await runTool(tool, args, ctx);
    for (const item of run.evidence) {
      const added = graph.add(item, { confidence: CONFIDENCE[item.source_tool], provenance: [item.source_tool] });
      if (!added.node || added.duplicateOf) continue;
      try {
        saveEvidenceNode(added.node);
      } catch {
        // Cache writes are best effort and must not fail an investigation.
      }
      emit({ type: 'evidence', evidence: added.node });

      if (added.node.source_tool === 'fetch_page') {
        const node = added.node;
        snapshotJobs.push(
          (async () => {
            const snapshot = await ensureSnapshot(node.url);
            if (!snapshot) return;
            graph.setSnapshot(node.id, snapshot);
            try {
              saveEvidenceNode({ ...node, snapshot_url: snapshot });
            } catch {
              /* best effort */
            }
          })()
        );
      }
    }
    return run.evidence;
  };

  const finish = (result: InvestigationResult): InvestigationResult => {
    emit({ type: 'result', result });
    emit({ type: 'done' });
    return result;
  };

  emit({ type: 'status', message: 'Planning the investigation' });

  let queries: string[] = [question];
  try {
    const plan = await chatJson('planner', buildPlannerMessages(question), PlanSchema);
    const cleaned = [...new Set(plan.queries.map((query) => query.trim()).filter(Boolean))].slice(0, MAX_QUERIES);
    if (cleaned.length) queries = cleaned;
  } catch (error) {
    addGap({
      topic: 'query planning',
      reason: `Planner unavailable; fell back to the raw question. ${errorMessage(error).slice(0, 200)}`,
    });
  }
  emit({ type: 'plan', queries });

  emit({ type: 'status', message: `Searching ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}` });
  const searchEvidence: Evidence[] = [];
  for (const query of queries) {
    searchEvidence.push(...(await callTool(webSearchTool, { query })));
  }

  const domains = [
    ...new Set(queries.map((query) => extractDomain(query)).filter((domain): domain is string => Boolean(domain))),
  ].slice(0, 2);

  if (domains.length) {
    emit({ type: 'status', message: `Checking archives and certificates for ${domains.join(', ')}` });
    await Promise.all(
      domains.flatMap((domain) => [
        callTool(waybackCdxTool, { target: domain }),
        callTool(commonCrawlTool, { target: domain }),
        callTool(crtshTool, { domain }),
      ])
    );
  }

  if (queries.some((query) => TECHNICAL_RE.test(query))) {
    await callTool(githubCodeTool, { query: queries[0] ?? question });
  }

  const pageUrls = [...new Set(searchEvidence.map((item) => item.url))]
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, Math.min(input.maxFetchPages ?? MAX_FETCH_PAGES, MAX_FETCH_PAGES));

  if (pageUrls.length) {
    emit({ type: 'status', message: `Reading ${pageUrls.length} page${pageUrls.length === 1 ? '' : 's'}` });
    await Promise.all(pageUrls.map((url) => callTool(fetchPageTool, { url })));
  }

  if (graph.size === 0) {
    addGap({
      topic: 'no evidence retrieved',
      reason: 'Every configured source returned nothing or failed for the planned queries.',
    });
    return finish({
      question,
      answer: 'No evidence could be retrieved, so this question cannot be answered from sources.',
      citations: [],
      gaps,
      confidence: 0,
      evidence_count: 0,
      duration_ms: Date.now() - started,
    });
  }

  emit({ type: 'status', message: `Synthesising from ${graph.size} evidence items` });

  let synthesis: Synthesis;
  try {
    synthesis = await chatJson('synthesizer', synthesisMessages(question, graph.list(), gaps), SynthesisSchema);
  } catch (error) {
    addGap({
      topic: 'synthesis',
      reason: `Synthesis failed, so no answer was produced: ${errorMessage(error).slice(0, 200)}`,
    });
    return finish({
      question,
      answer: 'Evidence was collected, but no answer could be synthesised from it.',
      citations: [],
      gaps,
      confidence: 0,
      evidence_count: graph.size,
      duration_ms: Date.now() - started,
    });
  }

  for (const gap of synthesis.gaps) addGap(gap);

  let check = graph.validateCitations(synthesis.citations);
  if (check.invalid.length) {
    const feedback = check.invalid
      .slice(0, 4)
      .map((entry) => `${entry.citation.evidence_id || '(missing id)'}: ${entry.reason}`)
      .join('; ');

    try {
      const retry = await chatJson(
        'synthesizer',
        synthesisMessages(question, graph.list(), gaps, feedback),
        SynthesisSchema
      );
      const retryCheck = graph.validateCitations(retry.citations);
      if (retryCheck.invalid.length < check.invalid.length) {
        synthesis = retry;
        check = retryCheck;
        for (const gap of retry.gaps) addGap(gap);
      }
    } catch {
      // Keep the first synthesis; its invalid citations are reported below.
    }
  }

  if (check.invalid.length) {
    addGap({
      topic: 'citation integrity',
      reason: `${check.invalid.length} citation(s) failed validation: ${[
        ...new Set(check.invalid.map((entry) => entry.reason)),
      ].join(', ')}`,
    });
  }

  emit({ type: 'status', message: 'Reviewing for gaps' });
  try {
    const extra = await chatJson(
      'gapfinder',
      gapfinderMessages(question, synthesis.answer, graph.list(), gaps),
      GapListSchema
    );
    for (const gap of extra.gaps) addGap(gap);
  } catch (error) {
    addGap({ topic: 'gap review', reason: `Gap review unavailable: ${errorMessage(error).slice(0, 160)}` });
  }

  await Promise.all(snapshotJobs);

  const citedIds = [...new Set(check.valid.map((citation) => citation.evidence_id))];
  if (citedIds.length) {
    emit({ type: 'status', message: 'Snapshotting cited URLs to Wayback' });
    await Promise.all(
      citedIds.map(async (id) => {
        const node = graph.get(id);
        if (!node || node.snapshot_url) return;
        const snapshot = await ensureSnapshot(node.url);
        if (snapshot) {
          graph.setSnapshot(id, snapshot);
          try {
            saveEvidenceNode({ ...node, snapshot_url: snapshot });
          } catch {
            /* best effort */
          }
        } else {
          addGap({ topic: 'archival snapshot', reason: `Wayback snapshot failed for ${node.url}` });
        }
      })
    );
  }

  // Co-citation edges: these sources jointly support the answer.
  for (let i = 0; i < citedIds.length; i += 1) {
    for (let j = i + 1; j < citedIds.length; j += 1) {
      graph.addEdge(citedIds[i]!, citedIds[j]!, 'supports', 0.3);
    }
  }

  const confidence = clamp01((synthesis.confidence + graph.confidence()) / 2);

  return finish({
    question,
    answer: synthesis.answer.trim(),
    citations: check.valid,
    gaps,
    confidence,
    evidence_count: graph.size,
    duration_ms: Date.now() - started,
  });
}
