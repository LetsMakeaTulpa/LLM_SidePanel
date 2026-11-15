import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRun, gapMatches, type EvalQuestion, type EvalRun } from './score';
import { EvidenceGraph } from '../lib/evidence/graph';
import { makeEvidence } from '../lib/evidence/evidence';
import { Semaphore } from '../lib/queue';
import { parseJsonLoose } from '../lib/llm';
import type { InvestigationResult } from '../lib/types';

function question(overrides: Partial<EvalQuestion> = {}): EvalQuestion {
  return {
    id: 'q1',
    question: 'What is the teapot status?',
    known_good_answer: 'Teapot, per RFC 2324.',
    answer_keywords: ['teapot'],
    expected_domains: ['example.com'],
    expected_gaps: ['current pricing'],
    ...overrides,
  };
}

function result(overrides: Partial<InvestigationResult> = {}): InvestigationResult {
  return {
    question: 'What is the teapot status?',
    answer: 'It is a teapot (RFC 2324).',
    citations: [],
    gaps: [],
    confidence: 0.8,
    evidence_count: 1,
    duration_ms: 1,
    ...overrides,
  };
}

function run(overrides: { result?: Partial<InvestigationResult>; question?: Partial<EvalQuestion> } = {}): EvalRun {
  return {
    question: question(overrides.question),
    result: result(overrides.result),
    evidence: [
      {
        id: 'ev_1',
        url: 'https://www.example.com/teapot',
        text: 'HTTP 418 means the server is a teapot, defined in RFC 2324.',
      },
    ],
  };
}

test('valid citation and matching gap score 1.0', () => {
  const scored = scoreRun(
    run({
      result: {
        citations: [{ evidence_id: 'ev_1', quote: 'the server is a teapot, defined in RFC 2324' }],
        gaps: [{ topic: 'current pricing', reason: 'No source gives a price.' }],
      },
    })
  );
  assert.equal(scored.citation_validity, 1);
  assert.equal(scored.gap_recall, 1);
  assert.equal(scored.composite, 1);
});

test('unknown evidence id counts against citation validity', () => {
  const scored = scoreRun(
    run({ result: { citations: [{ evidence_id: 'ev_missing', quote: 'the server is a teapot, defined' }] } })
  );
  assert.equal(scored.citation_audit.unknown_ids, 1);
  assert.equal(scored.citation_validity, 0);
});

test('quote must appear in the evidence text', () => {
  const scored = scoreRun(
    run({
      result: {
        citations: [{ evidence_id: 'ev_1', quote: 'this quote was never in the evidence' }],
        gaps: [{ topic: 'current pricing', reason: 'missing' }],
      },
    })
  );
  assert.equal(scored.citation_audit.quote_mismatches, 1);
  assert.equal(scored.citation_validity, 0);
});

test('short quotes are rejected even when present', () => {
  const scored = scoreRun(run({ result: { citations: [{ evidence_id: 'ev_1', quote: 'teapot' }] } }));
  assert.equal(scored.citation_audit.quote_mismatches, 1);
});

test('no citations scores zero validity; empty expected gaps score 1 recall', () => {
  const scored = scoreRun(run({ question: { expected_gaps: [] } }));
  assert.equal(scored.citation_validity, 0);
  assert.equal(scored.gap_recall, 1);
  assert.equal(scored.composite, 0.4);
});

test('gap recall is fractional and token-overlap tolerant', () => {
  const scored = scoreRun(
    run({
      result: { gaps: [{ topic: 'Pricing data', reason: 'Current prices change frequently.' }] },
      question: { expected_gaps: ['current pricing', 'unavailable private data'] },
    })
  );
  assert.equal(scored.gap_recall, 0.5);
  assert.deepEqual(scored.missed_gaps, ['unavailable private data']);
  // Token overlap counts: "private data" covers two of three expected tokens.
  assert.equal(gapMatches('unavailable private data', [{ topic: 'private data', reason: 'not public' }]), true);
  assert.equal(
    gapMatches('current pricing', [{ topic: 'pricing data', reason: 'Current prices change frequently.' }]),
    true
  );
  assert.equal(gapMatches('unrelated payroll records', [{ topic: 'archive coverage', reason: 'partial' }]), false);
});

test('answer keywords and domain hits are diagnostics, not score inputs', () => {
  const scored = scoreRun(
    run({
      result: {
        citations: [{ evidence_id: 'ev_1', quote: 'the server is a teapot, defined in RFC 2324' }],
        gaps: [{ topic: 'current pricing', reason: 'none' }],
      },
    })
  );
  assert.deepEqual(scored.answer_keyword_hits, ['teapot']);
  assert.deepEqual(scored.domain_hits, ['example.com']);
});

test('canonical URL dedupe keeps one node', () => {
  const graph = new EvidenceGraph();
  const first = makeEvidence({
    url: 'https://example.com/a?utm_source=x',
    text: 'A reasonably long body about teapots and RFC 2324.',
    source_tool: 'fetch_page',
    extractor_version: 'test-v1',
  });
  const second = makeEvidence({
    url: 'https://www.example.com/a/?ref=other',
    text: 'A reasonably long body about teapots and RFC 2324.',
    source_tool: 'web_search',
    extractor_version: 'test-v1',
  });
  assert.ok(first && second);

  const a = graph.add(first, { confidence: 0.5 });
  const b = graph.add(second, { confidence: 0.7 });
  assert.equal(graph.size, 1);
  assert.ok(b.duplicateOf);
  assert.equal(b.node?.confidence, 0.7);
  assert.ok(a.node);
});

test('simhash dedupe catches near-identical text on different URLs', () => {
  const graph = new EvidenceGraph();
  const body =
    'The server refuses to brew coffee because it is permanently a teapot. This behaviour is defined in RFC 2324 and is an April Fools joke.';
  const first = makeEvidence({
    url: 'https://a.example.com/one',
    text: body,
    source_tool: 'fetch_page',
    extractor_version: 'test-v1',
  });
  const second = makeEvidence({
    url: 'https://b.example.org/two',
    text: `${body} Slight extra sentence for variation.`,
    source_tool: 'web_search',
    extractor_version: 'test-v1',
  });
  assert.ok(first && second);
  graph.add(first);
  const added = graph.add(second);
  assert.equal(graph.size, 1);
  assert.ok(added.duplicateOf);
});

test('graph citation validation enforces ids and quotes', () => {
  const graph = new EvidenceGraph();
  const evidence = makeEvidence({
    url: 'https://example.com/teapot',
    text: 'HTTP 418 means the server is a teapot, defined in RFC 2324.',
    source_tool: 'fetch_page',
    extractor_version: 'test-v1',
  });
  assert.ok(evidence);
  graph.add(evidence);

  const check = graph.validateCitations([
    { evidence_id: evidence.id, quote: 'the server is a teapot, defined in RFC 2324' },
    { evidence_id: 'nope', quote: 'anything at all that is long enough' },
    { evidence_id: evidence.id, quote: 'short' },
    { evidence_id: evidence.id, quote: 'the server is a teapot, defined in RFC 2324' },
  ]);
  assert.equal(check.valid.length, 1);
  assert.deepEqual(
    check.invalid.map((entry) => entry.reason),
    ['unknown_evidence_id', 'quote_too_short', 'duplicate_citation']
  );
});

test('semaphore never exceeds three concurrent calls', async () => {
  const semaphore = new Semaphore(3);
  let active = 0;
  let maxActive = 0;

  await Promise.all(
    Array.from({ length: 12 }, () =>
      semaphore.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 8));
        active -= 1;
      })
    )
  );

  assert.equal(maxActive, 3);
  assert.equal(semaphore.active, 0);
});

test('parseJsonLoose accepts fenced and prose-wrapped JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Here you go: {"a":2} thanks'), { a: 2 });
});
