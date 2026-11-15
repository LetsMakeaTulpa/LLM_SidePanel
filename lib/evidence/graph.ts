import { canonicalUrl } from '../canonical';
import { clamp01 } from '../hash';
import { hammingDistance, simhash64 } from '../simhash';
import type { Citation, EdgeRelation, Evidence, EvidenceEdge, EvidenceNode } from '../types';

export const SIMHASH_DISTANCE = Number(process.env.SIMHASH_DISTANCE || 6);

export interface AddResult {
  node: EvidenceNode | null;
  duplicateOf?: string;
  similarity?: number;
}

export interface CitationCheck {
  valid: Citation[];
  invalid: Array<{ citation: Citation; reason: string }>;
}

function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class EvidenceGraph {
  readonly nodes = new Map<string, EvidenceNode>();
  readonly edges: EvidenceEdge[] = [];
  private readonly byCanonical = new Map<string, string>();

  get size(): number {
    return this.nodes.size;
  }

  list(): EvidenceNode[] {
    return [...this.nodes.values()];
  }

  get(id: string): EvidenceNode | undefined {
    return this.nodes.get(id);
  }

  /** Dedupe by canonical URL first, then by simhash proximity. */
  add(evidence: Evidence, options: { confidence?: number; provenance?: string[] } = {}): AddResult {
    const canonical = canonicalUrl(evidence.url);
    const existingByUrl = this.byCanonical.get(canonical);
    if (existingByUrl) {
      const existing = this.nodes.get(existingByUrl);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, options.confidence ?? 0.5);
        existing.provenance = [...new Set([...existing.provenance, ...(options.provenance ?? [evidence.source_tool])])];
        return { node: existing, duplicateOf: existingByUrl, similarity: 1 };
      }
    }

    const hash = simhash64(evidence.text);
    for (const node of this.nodes.values()) {
      const distance = hammingDistance(node.simhash, hash);
      if (distance <= SIMHASH_DISTANCE) {
        node.confidence = Math.max(node.confidence, options.confidence ?? 0.5);
        node.provenance = [...new Set([...node.provenance, ...(options.provenance ?? [evidence.source_tool])])];
        return { node, duplicateOf: node.id, similarity: 1 - distance / 64 };
      }
    }

    const node: EvidenceNode = {
      ...evidence,
      canonical_url: canonical,
      simhash: hash,
      confidence: clamp01(options.confidence ?? 0.5),
      provenance: [...new Set(options.provenance ?? [evidence.source_tool])],
    };
    this.nodes.set(node.id, node);
    this.byCanonical.set(canonical, node.id);
    return { node };
  }

  setSnapshot(id: string, snapshotUrl: string): void {
    const node = this.nodes.get(id);
    if (node) node.snapshot_url = snapshotUrl;
  }

  addEdge(from: string, to: string, relation: EdgeRelation, weight = 0.5): void {
    if (from === to || !this.nodes.has(from) || !this.nodes.has(to)) return;
    const exists = this.edges.some((edge) => edge.from === from && edge.to === to && edge.relation === relation);
    if (!exists) this.edges.push({ from, to, relation, weight: clamp01(weight) });
  }

  /** The model may cite only IDs present in the graph, and only verbatim quotes. */
  validateCitations(citations: Citation[]): CitationCheck {
    const valid: Citation[] = [];
    const invalid: Array<{ citation: Citation; reason: string }> = [];
    const seen = new Set<string>();

    for (const citation of citations) {
      const id = String(citation.evidence_id || '').trim();
      if (!id) {
        invalid.push({ citation, reason: 'empty_evidence_id' });
        continue;
      }

      // Multiple distinct quotes from one source are fine; exact repeats are not.
      const key = `${id}\u0000${normalizeQuote(citation.quote || '')}`;
      if (seen.has(key)) {
        invalid.push({ citation, reason: 'duplicate_citation' });
        continue;
      }
      seen.add(key);

      const node = this.nodes.get(id);
      if (!node) {
        invalid.push({ citation, reason: 'unknown_evidence_id' });
        continue;
      }

      const quote = normalizeQuote(citation.quote || '');
      if (quote.length < 12) {
        invalid.push({ citation, reason: 'quote_too_short' });
        continue;
      }
      if (!normalizeQuote(node.text).includes(quote)) {
        invalid.push({ citation, reason: 'quote_not_in_evidence' });
        continue;
      }
      valid.push({ evidence_id: id, quote: citation.quote.trim() });
    }

    return { valid, invalid };
  }

  confidence(): number {
    if (!this.nodes.size) return 0;
    const total = this.list().reduce((sum, node) => sum + node.confidence, 0);
    return clamp01(total / this.nodes.size);
  }
}
