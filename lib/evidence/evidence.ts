import { canonicalUrl } from '../canonical';
import { EVIDENCE_MAX_CHARS } from '../fetch/extract';
import { nowIso, sha256, shortHash } from '../hash';
import type { Evidence, SourceTool } from '../types';

export interface MakeEvidenceInput {
  url: string;
  text: string;
  source_tool: SourceTool;
  extractor_version: string;
  fetched_at?: string;
}

/** Build the mandatory evidence object. Returns null instead of empty evidence. */
export function makeEvidence(input: MakeEvidenceInput): Evidence | null {
  const url = String(input.url || '').trim();
  const text = String(input.text || '').trim().slice(0, EVIDENCE_MAX_CHARS);
  if (!url || !text) return null;

  const digest = sha256(text);
  return {
    id: `ev_${shortHash(`${canonicalUrl(url)}\n${digest}`, 12)}`,
    url,
    fetched_at: input.fetched_at ?? nowIso(),
    sha256: digest,
    source_tool: input.source_tool,
    extractor_version: input.extractor_version,
    text,
  };
}
