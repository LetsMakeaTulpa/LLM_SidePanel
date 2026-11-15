'use client';

import { useRef, useState } from 'react';
import type { AgentEvent, EvidenceNode, Gap, InvestigationResult } from '../../lib/types';

const TOOL_LABELS: Record<string, string> = {
  web_search: 'web',
  wayback_cdx: 'archive',
  crt_sh: 'crt.sh',
  github_code: 'github',
  common_crawl: 'crawl',
  fetch_page: 'page',
};

function hostOf(url?: string): string {
  if (!url) return 'unknown source';
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function Investigator() {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function apply(event: AgentEvent) {
    switch (event.type) {
      case 'status':
        setStatus(event.message);
        break;
      case 'plan':
        setQueries(event.queries);
        break;
      case 'evidence':
        setEvidence((prev) => (prev.some((item) => item.id === event.evidence.id) ? prev : [...prev, event.evidence]));
        break;
      case 'gap':
        setGaps((prev) => [...prev, event.gap]);
        break;
      case 'result':
        setResult(event.result);
        setGaps(event.result.gaps);
        setStatus('');
        break;
      case 'error':
        setError(event.message);
        break;
      case 'done':
        break;
    }
  }

  async function run(event?: React.FormEvent) {
    event?.preventDefault();
    const asked = question.trim();
    if (!asked || busy) return;

    setBusy(true);
    setError('');
    setStatus('Starting');
    setQueries([]);
    setEvidence([]);
    setGaps([]);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: asked }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed with HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('This browser cannot read a streaming response.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
          if (!line) continue;
          try {
            apply(JSON.parse(line.slice(5).trim()) as AgentEvent);
          } catch {
            /* ignore a malformed frame rather than dropping the stream */
          }
        }
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus('Stopped');
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const cited = result?.citations.length ?? 0;

  return (
    <>
      <form className="ask" onSubmit={run}>
        <label className="visually-hidden" htmlFor="question">
          Question to investigate
        </label>
        <textarea
          id="question"
          rows={2}
          value={question}
          placeholder="What does HTTP 418 mean and which RFC defines it?"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void run();
            }
          }}
        />
        <div className="ask-row">
          <p className="hint">Enter to investigate · Shift+Enter for a new line</p>
          {busy ? (
            <button type="button" className="secondary" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : null}
          <button type="submit" disabled={busy || !question.trim()}>
            {busy ? 'Investigating…' : 'Investigate'}
          </button>
        </div>
      </form>

      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}

      {busy || status ? (
        <div className="status" role="status">
          <span className={busy ? 'dot pulse' : 'dot'} aria-hidden="true" />
          {status || 'Working'}
        </div>
      ) : null}

      {queries.length ? (
        <section className="card">
          <div className="card-head">
            <h2>Plan</h2>
            <span className="count">{queries.length} queries</span>
          </div>
          <ul className="queries">
            {queries.map((query) => (
              <li key={query}>{query}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result ? (
        <section className="card answer">
          <div className="card-head">
            <h2>Answer</h2>
            <span className="count">{Math.round(result.confidence * 100)}% confidence</span>
          </div>
          <p className="answer-text">{result.answer}</p>
          <p className="meta">
            {cited} {cited === 1 ? 'citation' : 'citations'} · {result.evidence_count} evidence items ·{' '}
            {Math.round(result.duration_ms)} ms
          </p>
          {result.citations.length ? (
            <ol className="citations">
              {result.citations.map((citation, index) => {
                const source = evidenceById.get(citation.evidence_id);
                return (
                  <li key={`${citation.evidence_id}-${index}`}>
                    <blockquote>{citation.quote}</blockquote>
                    <div className="citation-links">
                      <a href={source?.url} target="_blank" rel="noreferrer">
                        {hostOf(source?.url)}
                      </a>
                      {source?.snapshot_url ? (
                        <a href={source.snapshot_url} target="_blank" rel="noreferrer">
                          Wayback snapshot
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="empty">No citation survived validation, so there is nothing to stand behind.</p>
          )}
        </section>
      ) : null}

      {gaps.length ? (
        <section className="card">
          <div className="card-head">
            <h2>Gaps</h2>
            <span className="count">{gaps.length}</span>
          </div>
          <ul className="gaps">
            {gaps.map((gap, index) => (
              <li key={`${gap.topic}-${index}`}>
                <strong>{gap.topic}</strong>
                <span>{gap.reason}</span>
                {gap.suggested_query ? <code>{gap.suggested_query}</code> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evidence.length ? (
        <section className="card">
          <div className="card-head">
            <h2>Evidence</h2>
            <span className="count">{evidence.length}</span>
          </div>
          <ul className="evidence">
            {evidence.map((item) => (
              <li key={item.id}>
                <details>
                  <summary>
                    <span className={`badge badge-${item.source_tool}`}>{TOOL_LABELS[item.source_tool] ?? item.source_tool}</span>
                    <span className="evidence-host">{hostOf(item.url)}</span>
                    <span className="evidence-id">{item.id.slice(0, 10)}</span>
                  </summary>
                  <p className="evidence-text">{item.text.slice(0, 700)}</p>
                  <div className="citation-links">
                    <a href={item.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                    {item.snapshot_url ? (
                      <a href={item.snapshot_url} target="_blank" rel="noreferrer">
                        Wayback snapshot
                      </a>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
