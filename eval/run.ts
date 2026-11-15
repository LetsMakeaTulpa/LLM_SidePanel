import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { investigate } from '../lib/agent/loop';
import { llmAvailable } from '../lib/llm';
import type { AgentEvent, InvestigationResult } from '../lib/types';
import { QUESTIONS } from './questions';
import {
  aggregateScores,
  round,
  scoreRun,
  type EvalRecord,
  type EvalRun,
  type EvidenceLite,
} from './score';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : QUESTIONS.length;

function validateQuestions(): void {
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const question of QUESTIONS) {
    if (!question.id || ids.has(question.id)) problems.push(`duplicate/empty id: ${question.id}`);
    ids.add(question.id);
    if (!question.question || question.question.length < 10) problems.push(`${question.id}: question too short`);
    if (!question.known_good_answer) problems.push(`${question.id}: known_good_answer missing`);
    if (!Array.isArray(question.expected_gaps)) problems.push(`${question.id}: expected_gaps missing`);
    if (!Array.isArray(question.answer_keywords)) problems.push(`${question.id}: answer_keywords missing`);
  }
  if (QUESTIONS.length < 20) problems.push(`only ${QUESTIONS.length} questions; the harness requires 20`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`${QUESTIONS.length} eval questions valid (${ids.size} unique ids).`);
}

function emptyResult(question: string): InvestigationResult {
  return {
    question,
    answer: '',
    citations: [],
    gaps: [],
    confidence: 0,
    evidence_count: 0,
    duration_ms: 0,
  };
}

async function main(): Promise<void> {
  if (dryRun) {
    validateQuestions();
    return;
  }

  if (!llmAvailable()) {
    console.error('FEATHERLESS_API_KEY is not set. Live evals need it; use --dry-run to validate the harness only.');
    process.exit(1);
  }
  if (!process.env.SEARXNG_URL) {
    console.warn('SEARXNG_URL is not set: web search will return no evidence and scores will be low.');
  }

  const questions = QUESTIONS.slice(0, Number.isFinite(limit) && limit > 0 ? limit : QUESTIONS.length);
  const records: EvalRecord[] = [];

  for (const [index, question] of questions.entries()) {
    process.stderr.write(`[${index + 1}/${questions.length}] ${question.id}\n`);
    const evidence = new Map<string, EvidenceLite>();

    const emit = (event: AgentEvent) => {
      if (event.type === 'evidence') {
        evidence.set(event.evidence.id, {
          id: event.evidence.id,
          url: event.evidence.url,
          text: event.evidence.text,
        });
      }
      if (verbose && event.type === 'status') process.stderr.write(`  · ${event.message}\n`);
      if (verbose && event.type === 'gap') process.stderr.write(`  ! ${event.gap.topic}\n`);
    };

    let result: InvestigationResult = emptyResult(question.question);
    let error: string | undefined;
    try {
      result = await investigate({ question: question.question, emit });
    } catch (thrown) {
      error = thrown instanceof Error ? thrown.message : String(thrown);
      result = emptyResult(question.question);
    }

    const base: EvalRun = {
      question,
      result,
      evidence: [...evidence.values()],
      ...(error ? { error } : {}),
    };
    const record: EvalRecord = { ...base, score: scoreRun(base) };
    records.push(record);

    process.stderr.write(
      `      citations ${record.score.citation_validity.toFixed(2)} · gaps ${record.score.gap_recall.toFixed(2)} · composite ${record.score.composite.toFixed(2)}${error ? ` · error: ${error}` : ''}\n`
    );
  }

  const aggregate = aggregateScores(records.map((record) => record.score));

  console.log('\nid                     cite   gaps   comp');
  for (const record of records) {
    const { citation_validity, gap_recall, composite } = record.score;
    console.log(
      `${record.question.id.padEnd(22)} ${round(citation_validity).toFixed(3)}  ${round(gap_recall).toFixed(3)}  ${round(composite).toFixed(3)}`
    );
  }
  console.log(
    `\nAggregate: citation_validity ${round(aggregate.citation_validity)} · gap_recall ${round(aggregate.gap_recall)} · composite ${round(aggregate.composite)} (${aggregate.runs} runs)`
  );

  const outDir = path.join(process.cwd(), 'eval', 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ aggregate, records }, null, 2));
  console.log(`Wrote ${outFile}`);

  const minimum = Number(process.env.EVAL_MIN_COMPOSITE || 0);
  if (minimum && aggregate.composite < minimum) {
    console.error(`Composite ${aggregate.composite} is below EVAL_MIN_COMPOSITE=${minimum}`);
    process.exit(1);
  }
}

void main();
