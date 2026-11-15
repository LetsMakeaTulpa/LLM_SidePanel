import { hostOf } from '../lib/canonical';
import type { Gap, InvestigationResult } from '../lib/types';

export interface EvalQuestion {
  id: string;
  question: string;
  /** Human-checkable known-good answer. Diagnostics only; not scored. */
  known_good_answer: string;
  /** Known-good answer facts. Diagnostics only; not part of the score. */
  answer_keywords: string[];
  /** Domains that a well-sourced answer should cite evidence from. */
  expected_domains: string[];
  /** Missing/uncertain topics the agent must flag. Empty means no gap is required. */
  expected_gaps: string[];
}

export interface EvidenceLite {
  id: string;
  url: string;
  text: string;
}

export interface EvalRun {
  question: EvalQuestion;
  result: InvestigationResult;
  evidence: EvidenceLite[];
  error?: string;
}

export interface CitationAudit {
  total: number;
  valid: number;
  unknown_ids: number;
  quote_mismatches: number;
}

export interface EvalRecord extends EvalRun {
  score: EvalScore;
}

export interface EvalScore {
  citation_validity: number;
  gap_recall: number;
  composite: number;
  citation_audit: CitationAudit;
  matched_gaps: string[];
  missed_gaps: string[];
  answer_keyword_hits: string[];
  domain_hits: string[];
}

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((token) => token.length > 2)
  );
}

/** A gap matches when the expected topic appears, or most of its tokens do. */
export function gapMatches(expected: string, gaps: Gap[]): boolean {
  const target = normalize(expected);
  if (!target) return false;
  const targetTokens = [...tokenSet(expected)];

  return gaps.some((gap) => {
    const haystack = normalize(`${gap.topic} ${gap.reason} ${gap.suggested_query ?? ''}`);
    if (haystack.includes(target)) return true;
    if (!targetTokens.length) return false;
    const hayTokens = tokenSet(haystack);
    const hits = targetTokens.filter((token) => hayTokens.has(token)).length;
    return hits / targetTokens.length >= 0.6;
  });
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Citation validity and gap recall are the only scored metrics. */
export function scoreRun(run: EvalRun): EvalScore {
  const evidenceById = new Map(run.evidence.map((item) => [item.id, item]));
  const audit: CitationAudit = {
    total: run.result.citations.length,
    valid: 0,
    unknown_ids: 0,
    quote_mismatches: 0,
  };

  for (const citation of run.result.citations) {
    const evidence = evidenceById.get(citation.evidence_id);
    if (!evidence) {
      audit.unknown_ids += 1;
      continue;
    }
    const quote = normalize(citation.quote);
    if (quote.length < 12 || !normalize(evidence.text).includes(quote)) {
      audit.quote_mismatches += 1;
      continue;
    }
    audit.valid += 1;
  }

  const citationValidity = audit.total ? audit.valid / audit.total : 0;

  const matched_gaps: string[] = [];
  const missed_gaps: string[] = [];
  for (const expected of run.question.expected_gaps) {
    if (gapMatches(expected, run.result.gaps)) matched_gaps.push(expected);
    else missed_gaps.push(expected);
  }
  const gapRecall = run.question.expected_gaps.length
    ? matched_gaps.length / run.question.expected_gaps.length
    : 1;

  const answer = normalize(run.result.answer);
  const answer_keyword_hits = run.question.answer_keywords.filter((keyword) =>
    answer.includes(normalize(keyword))
  );

  const hosts = new Set(run.evidence.map((item) => hostOf(item.url)));
  const domain_hits = run.question.expected_domains.filter((domain) =>
    [...hosts].some((host) => hostMatches(host, domain))
  );

  return {
    citation_validity: citationValidity,
    gap_recall: gapRecall,
    composite: 0.6 * citationValidity + 0.4 * gapRecall,
    citation_audit: audit,
    matched_gaps,
    missed_gaps,
    answer_keyword_hits,
    domain_hits,
  };
}

export interface AggregateScore {
  citation_validity: number;
  gap_recall: number;
  composite: number;
  runs: number;
}

export function aggregateScores(scores: EvalScore[]): AggregateScore {
  if (!scores.length) return { citation_validity: 0, gap_recall: 0, composite: 0, runs: 0 };
  const mean = (pick: (score: EvalScore) => number) =>
    scores.reduce((sum, score) => sum + pick(score), 0) / scores.length;
  return {
    citation_validity: mean((score) => score.citation_validity),
    gap_recall: mean((score) => score.gap_recall),
    composite: mean((score) => score.composite),
    runs: scores.length,
  };
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
