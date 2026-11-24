// End-to-end, offline: the loop, citation validation, gap recording, the
// empty-graph branch, the key-free degradation path and SSE framing against a
// stubbed LLM and canned tool responses on an in-memory cache.
// No keys and no network: an unexpected URL fails the test loudly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDb } from '../cache/db';
import { investigate } from './loop';
import { POST } from '../../app/api/investigate/route';
import type { AgentEvent, EvidenceNode } from '../types';

process.env.CACHE_DB = ':memory:';
// A placeholder, not a credential: the stub below answers every completion.
process.env.FEATHERLESS_API_KEY = 'offline-test-key';
process.env.SEARXNG_URL = 'https://search.test';

const LLM_URL = 'https://api.featherless.ai/v1/chat/completions';
const SEARCH_URL = 'https://example.com/teapot';
const PAGE_URL = `${SEARCH_URL}/full-article`;
const QUESTION = 'What does the 418 teapot status mean and when was it published?';

const SEARCH_RESULTS = [
  {
    title: 'Teapot status in RFC 2324',
    url: SEARCH_URL,
    content: 'RFC 2324 defines the 418 teapot status; the memo was published in 1998.',
  },
];

const PAGE_HTML = [
  '<html><head><title>Full article: the 418 teapot memo</title></head>',
  '<body><article><p>HTTP status 418 means the server refuses to brew coffee because it is',
  'a teapot. The joke specification was written by Larry Masinter for April Fools 1998 and',
  'was never an official standard, although clients still print the phrase.</p></article></body></html>',
].join('\n');

type SynthesisMode = 'valid' | 'invalid';

interface Call {
  url: string;
}

const calls: Call[] = [];
let synthesisMode: SynthesisMode = 'valid';
let synthesizerCalls = 0;
// Empty-source fixture: search returns no hits and any page fetch returns nothing.
let emptySources = false;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** OpenAI-compatible completion envelope: chat() reads choices[0].message.content. */
function completion(content: unknown): Response {
  return jsonResponse({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

function htmlResponse(body: string, url?: string): Response {
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  // Stands in for a redirect: fetch_page records the final URL as the evidence URL.
  if (url) Object.defineProperty(response, 'url', { value: url });
  return response;
}

interface PromptEvidence {
  id: string;
  url: string;
  tool: string;
  text: string;
}

/** Read the EVIDENCE block the synthesizer prompt actually received. */
function promptEvidence(userMessage: string): PromptEvidence[] {
  const block = userMessage.slice(userMessage.indexOf('\nEVIDENCE\n'));
  return block
    .split('\n\n---\n\n')
    .flatMap((part) => {
      const header = /^\[(ev_[^\]]+)\] (\S+) \| tool=([^ |]+)/.exec(part.trim());
      const id = header?.[1];
      const url = header?.[2];
      const tool = header?.[3];
      if (!id || !url || !tool) return [];
      const text = part.trim().split('\n').slice(1).join('\n').trim();
      return [{ id, url, tool, text }];
    });
}

function synthesisPayload(userMessage: string): string {
  const nodes = promptEvidence(userMessage);
  const usable = nodes.filter((node) => node.url.startsWith('http'));
  const citations = usable.slice(0, 2).map((node) => ({
    evidence_id: node.id,
    quote: node.text.slice(0, 60).trim(),
  }));

  if (!citations.length) {
    return JSON.stringify({
      answer: 'The evidence block was empty.',
      citations: [],
      gaps: [{ topic: 'no evidence in prompt', reason: 'The fixture expected at least one evidence item.' }],
      confidence: 0,
    });
  }

  if (synthesisMode === 'invalid') {
    citations.push({ evidence_id: 'ev_deadbeefdead', quote: 'this evidence id was never retrieved' });
  }

  return JSON.stringify({
    answer: 'RFC 2324 defines 418 as the teapot status, published as an April Fools memo in 1998.',
    citations,
    gaps:
      synthesisMode === 'invalid'
        ? []
        : [{ topic: 'official standard status', reason: 'Only one memo is available; no RFC index was fetched.' }],
    confidence: 0.72,
  });
}

function llmResponse(rawBody: string): Response {
  const body = JSON.parse(rawBody) as { messages?: Array<{ role: string; content: string }> };
  const messages = body.messages ?? [];
  const system = messages.find((message) => message.role === 'system')?.content ?? '';
  const user = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';

  if (system.includes('You plan evidence-first investigations.')) {
    return completion({ queries: ['teapot status RFC 2324'] });
  }
  if (system.includes('You are an investigator who answers ONLY from the supplied EVIDENCE.')) {
    synthesizerCalls += 1;
    return completion(JSON.parse(synthesisPayload(user)));
  }
  if (system.includes('You review an investigation for missing angles.')) {
    return completion({ gaps: [{ topic: 'recency', reason: 'The fixture has no source newer than 1998.' }] });
  }
  throw new Error('unexpected LLM prompt in offline test');
}

async function stubFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  calls.push({ url });

  if (url === LLM_URL) return llmResponse(typeof init?.body === 'string' ? init.body : '{}');
  if (url.startsWith('https://search.test/search?')) {
    return jsonResponse({ results: emptySources ? [] : SEARCH_RESULTS });
  }
  if (url === SEARCH_URL) {
    // In the empty-graph fixture a page fetch yields nothing either.
    return emptySources
      ? new Response('', { status: 404, headers: { 'content-type': 'text/html' } })
      : htmlResponse(PAGE_HTML, PAGE_URL);
  }
  // Wayback is unavailable: the loop should record a gap, not fail.
  if (url.startsWith('https://web.archive.org/save/')) {
    return new Response('wayback is unavailable in this fixture', {
      status: 503,
      headers: { 'content-type': 'text/html' },
    });
  }
  throw new Error(`unexpected network request in offline test: ${url}`);
}

globalThis.fetch = stubFetch as typeof fetch;

const ALLOWED_PREFIXES = [
  'https://api.featherless.ai/v1/chat/completions',
  'https://search.test/search?',
  'https://example.com/',
  'https://web.archive.org/save/',
];

function resetFixture(mode: SynthesisMode = 'valid', empty = false): void {
  resetDb();
  calls.length = 0;
  synthesizerCalls = 0;
  synthesisMode = mode;
  emptySources = empty;
}

test('investigate plans, gathers, synthesises and validates citations offline', async () => {
  resetFixture('valid');
  const events: AgentEvent[] = [];
  const result = await investigate({ question: QUESTION, emit: (event) => events.push(event) });

  const evidence = events.flatMap((event) => (event.type === 'evidence' ? [event.evidence] : []));
  const evidenceIds = new Set(evidence.map((node: EvidenceNode) => node.id));

  assert.match(result.answer, /teapot status/);
  assert.equal(result.question, QUESTION);
  assert.ok(result.evidence_count >= 2, `expected search and page evidence, got ${result.evidence_count}`);
  assert.ok(evidence.some((node) => node.source_tool === 'web_search'), 'search evidence was gathered');
  assert.ok(evidence.some((node) => node.source_tool === 'fetch_page'), 'page evidence was gathered');

  // Citation validation: only graph ids with verbatim quotes survive.
  assert.ok(result.citations.length >= 1);
  for (const citation of result.citations) {
    assert.ok(evidenceIds.has(citation.evidence_id), `citation id ${citation.evidence_id} came from the graph`);
    const node = evidence.find((item) => item.id === citation.evidence_id);
    assert.ok(node && node.text.includes(citation.quote), 'quoted text is verbatim evidence');
  }

  // Gap recording: the synthesis gap and the gapfinder gap are both kept, once.
  const topics = result.gaps.map((gap) => gap.topic);
  assert.ok(topics.includes('official standard status'), 'synthesis gap recorded');
  assert.ok(topics.includes('recency'), 'gapfinder gap recorded');
  assert.equal(new Set(topics).size, topics.length, 'gap topics are deduplicated');

  // Event stream: plan, evidence, result and done, in that order.
  const types = events.map((event) => event.type);
  assert.equal(types[0], 'status');
  assert.ok(types.includes('plan'));
  assert.ok(types.lastIndexOf('done') === types.length - 1, 'done is the last event');
  assert.equal(events.filter((event) => event.type === 'result').length, 1);
  const emitted = events.find((event) => event.type === 'result');
  assert.deepEqual(emitted?.type === 'result' ? emitted.result : null, result);
  assert.equal(types.filter((type) => type === 'error').length, 0);

  assert.ok(result.confidence > 0 && result.confidence <= 1);
  assert.ok(calls.every((call) => ALLOWED_PREFIXES.some((prefix) => call.url.startsWith(prefix))), 'no stray network');
});

test('invalid citations are dropped and recorded as a gap', async () => {
  resetFixture('invalid');
  const result = await investigate({ question: QUESTION });

  // The retry returned the same invalid citation, so the first answer is kept
  // and the failure is reported instead of silently trusting the model.
  const integrity = result.gaps.find((gap) => gap.topic === 'citation integrity');
  assert.ok(integrity, 'citation integrity gap recorded');
  assert.match(integrity.reason, /unknown_evidence_id/);
  assert.ok(
    result.citations.every((citation) => citation.evidence_id !== 'ev_deadbeefdead'),
    'the invented id never reaches the result'
  );
  assert.ok(result.citations.length >= 1, 'valid citations are still returned');
  assert.equal(synthesizerCalls, 2, 'the loop retried the synthesis once');
});

test('the SSE route frames each agent event as one data: line', async () => {
  resetFixture('valid');
  const request = {
    json: async () => ({ question: QUESTION }),
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof POST>[0];

  const response = await POST(request);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');

  const body = await response.text();
  const frames = body.split('\n\n').filter((frame) => frame.length > 0);
  assert.ok(frames.length > 0);
  for (const frame of frames) {
    assert.ok(frame.startsWith('data: '), `frame is prefixed: ${frame.slice(0, 40)}`);
    assert.doesNotThrow(() => JSON.parse(frame.slice('data: '.length)));
  }

  const events = frames.map((frame) => JSON.parse(frame.slice('data: '.length)) as AgentEvent);
  const types = events.map((event) => event.type);
  assert.equal(types[0], 'status');
  assert.ok(types.includes('plan'));
  assert.ok(types.includes('evidence'));
  assert.ok(types.includes('result'));
  assert.equal(types.at(-1), 'done');
});

test('an empty evidence graph answers truthfully without calling the synthesiser', async () => {
  resetFixture('valid', true);
  const events: AgentEvent[] = [];
  const result = await investigate({ question: QUESTION, emit: (event) => events.push(event) });

  // Nothing was retrieved, so there is no prompt worth paying for.
  assert.equal(synthesizerCalls, 0, 'the synthesiser is never called with an empty graph');
  assert.equal(calls.filter((call) => call.url === LLM_URL).length, 1, 'only the planner reached the LLM');
  assert.equal(result.evidence_count, 0);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.citations, []);

  // Truthful answer: it reports the failed retrieval rather than claiming to answer.
  assert.equal(
    result.answer,
    'No evidence could be retrieved, so this question cannot be answered from sources.'
  );
  assert.doesNotMatch(result.answer, /418/);

  const gap = result.gaps.find((entry) => entry.topic === 'no evidence retrieved');
  assert.ok(gap, 'the no-evidence gap is recorded');
  assert.match(gap.reason, /nothing or failed/i);

  // The search ran and returned nothing, so no page fetch was attempted.
  assert.equal(calls.filter((call) => call.url.startsWith('https://search.test/search?')).length, 1);
  assert.equal(calls.filter((call) => call.url === SEARCH_URL).length, 0);

  // Event stream: no evidence, the no-evidence gap, one result, then done.
  assert.equal(events.filter((event) => event.type === 'evidence').length, 0);
  assert.ok(events.some((event) => event.type === 'gap' && event.gap.topic === 'no evidence retrieved'));
  assert.equal(events.filter((event) => event.type === 'result').length, 1);
  const emitted = events.find((event) => event.type === 'result');
  assert.deepEqual(emitted?.type === 'result' ? emitted.result : null, result);
  assert.equal(events.at(-1)?.type, 'done');
  assert.equal(events.filter((event) => event.type === 'error').length, 0);
  assert.ok(calls.every((call) => ALLOWED_PREFIXES.some((prefix) => call.url.startsWith(prefix))), 'no stray network');
});

test('with no API key the loop still gathers evidence and reports honestly', async () => {
  resetFixture('valid');
  // Not even a placeholder key: chat() must refuse before a request leaves.
  const savedKey = process.env.FEATHERLESS_API_KEY;
  delete process.env.FEATHERLESS_API_KEY;

  try {
    const events: AgentEvent[] = [];
    const result = await investigate({ question: QUESTION, emit: (event) => events.push(event) });
    // Let the background Wayback job from the page fetch settle before the next
    // test closes this in-memory cache.
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(calls.filter((call) => call.url === LLM_URL).length, 0, 'no key means no LLM request');
    assert.equal(calls.filter((call) => call.url === SEARCH_URL).length, 1, 'the canned page was fetched');
    assert.ok(result.evidence_count >= 2, `search and page evidence still gathered, got ${result.evidence_count}`);
    assert.equal(result.question, QUESTION);

    // Honest degradation: evidence exists, but no answer is invented from it.
    assert.equal(result.citations.length, 0);
    assert.equal(result.confidence, 0);
    assert.equal(result.answer, 'Evidence was collected, but no answer could be synthesised from it.');
    assert.doesNotMatch(result.answer, /418/);

    // Both model boundaries report their absence as gaps; tools fail open.
    const topics = result.gaps.map((gap) => gap.topic);
    assert.ok(topics.includes('query planning'), 'planner unavailability is recorded');
    assert.ok(topics.includes('synthesis'), 'synthesis unavailability is recorded');
    assert.ok(topics.indexOf('query planning') < topics.indexOf('synthesis'), 'gaps follow the loop order');

    // The stream still completes: evidence arrived, one result, done last.
    assert.ok(events.filter((event) => event.type === 'evidence').length >= 2);
    assert.ok(events.some((event) => event.type === 'gap' && event.gap.topic === 'synthesis'));
    const emitted = events.find((event) => event.type === 'result');
    assert.deepEqual(emitted?.type === 'result' ? emitted.result : null, result);
    assert.equal(events.at(-1)?.type, 'done');
    assert.equal(events.filter((event) => event.type === 'error').length, 0);
    assert.ok(calls.every((call) => ALLOWED_PREFIXES.some((prefix) => call.url.startsWith(prefix))), 'no stray network');
  } finally {
    process.env.FEATHERLESS_API_KEY = savedKey;
  }
});

test('an empty question is rejected before any work', async () => {
  resetFixture('valid');
  await assert.rejects(() => investigate({ question: '   ' }), /question is required/);
  assert.equal(calls.length, 0);
});
