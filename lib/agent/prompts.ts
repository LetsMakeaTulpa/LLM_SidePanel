import type { ChatMessage } from '../llm';
import type { EvidenceNode, Gap } from '../types';

const EVIDENCE_BUDGET = Number(process.env.PROMPT_EVIDENCE_CHARS || 16_000);

export function evidenceBlock(nodes: EvidenceNode[]): string {
  const chunks: string[] = [];
  let used = 0;

  for (const node of nodes) {
    const header = `[${node.id}] ${node.url} | tool=${node.source_tool} | fetched=${node.fetched_at}`;
    const room = Math.max(300, Math.min(2500, EVIDENCE_BUDGET - used - header.length));
    const chunk = `${header}\n${node.text.slice(0, room)}`;
    if (used + chunk.length > EVIDENCE_BUDGET) break;
    chunks.push(chunk);
    used += chunk.length;
  }

  return chunks.join('\n\n---\n\n');
}

export function buildPlannerMessages(question: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You plan evidence-first investigations.',
        'Return JSON only, matching {"queries": string[]}.',
        'Give 2 to 4 short search queries that each target a checkable fact, name, number, date or domain.',
        'Do not answer the question and do not add commentary.',
      ].join('\n'),
    },
    { role: 'user', content: `Question: ${question}` },
  ];
}

const SYNTH_SYSTEM = [
  'You are an investigator who answers ONLY from the supplied EVIDENCE.',
  '',
  'Rules:',
  '1. No outside knowledge. If EVIDENCE does not support a statement, do not make it.',
  '2. citations[].evidence_id MUST be an ID that appears in EVIDENCE. Never invent or guess IDs.',
  '3. citations[].quote MUST be a verbatim substring (at least 20 characters) of that evidence text.',
  '4. gaps is REQUIRED on every response. List what is missing or unverifiable with a topic and reason.',
  '   Use [] only when the question is fully answered by the evidence.',
  '5. If the evidence cannot answer the question, say so plainly and put each missing piece in gaps.',
  '',
  'Return JSON only:',
  '{"answer": string, "citations": [{"evidence_id": string, "quote": string}], "gaps": [{"topic": string, "reason": string, "suggested_query": string}], "confidence": number}',
].join('\n');

export function synthesisMessages(
  question: string,
  nodes: EvidenceNode[],
  knownGaps: Gap[],
  retryFeedback?: string
): ChatMessage[] {
  const gapText = knownGaps.length
    ? knownGaps.map((gap) => `- ${gap.topic}: ${gap.reason}`).join('\n')
    : '(none recorded yet)';

  const user = [
    `Question: ${question}`,
    '',
    'EVIDENCE',
    evidenceBlock(nodes),
    '',
    'GAPS ALREADY KNOWN',
    gapText,
    retryFeedback ? `\nCORRECTION REQUIRED: ${retryFeedback}` : '',
  ].join('\n');

  return [
    { role: 'system', content: SYNTH_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function gapfinderMessages(
  question: string,
  answer: string,
  nodes: EvidenceNode[],
  knownGaps: Gap[]
): ChatMessage[] {
  const summaries = nodes
    .map((node) => `[${node.id}] ${node.url} (${node.source_tool}) — ${node.text.slice(0, 220).replace(/\s+/g, ' ')}`)
    .join('\n');

  const existing = knownGaps.length ? knownGaps.map((gap) => `- ${gap.topic}: ${gap.reason}`).join('\n') : '(none)';

  return [
    {
      role: 'system',
      content: [
        'You review an investigation for missing angles.',
        'Return JSON only, matching {"gaps": [{"topic": string, "reason": string, "suggested_query": string}]}.',
        'Report 0 to 4 gaps that would materially change the answer: missing sources, single-source claims, stale data, unstated assumptions.',
        'Never repeat an existing gap. Never add prose outside the JSON.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Question: ${question}\n\nDraft answer:\n${answer}\n\nEvidence available:\n${summaries}\n\nExisting gaps:\n${existing}`,
    },
  ];
}
