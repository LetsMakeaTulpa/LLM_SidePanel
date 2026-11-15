/** Boundary types shared by the agent, tools, evidence graph and API route. */

export const SOURCE_TOOLS = [
  'web_search',
  'wayback_cdx',
  'crt_sh',
  'github_code',
  'common_crawl',
  'fetch_page',
] as const;

export type SourceTool = (typeof SOURCE_TOOLS)[number];

/** The mandatory evidence contract. Nothing reaches a prompt without one. */
export interface Evidence {
  id: string;
  url: string;
  fetched_at: string;
  sha256: string;
  source_tool: SourceTool;
  extractor_version: string;
  text: string;
}

export interface EvidenceNode extends Evidence {
  canonical_url: string;
  simhash: string;
  confidence: number;
  provenance: string[];
  snapshot_url?: string;
}

export type EdgeRelation = 'supports' | 'contradicts';

export interface EvidenceEdge {
  from: string;
  to: string;
  relation: EdgeRelation;
  weight: number;
}

export interface Citation {
  evidence_id: string;
  quote: string;
}

/** Gaps are a required output field, never prose inside the answer. */
export interface Gap {
  topic: string;
  reason: string;
  suggested_query?: string;
}

export interface InvestigationResult {
  question: string;
  answer: string;
  citations: Citation[];
  gaps: Gap[];
  confidence: number;
  evidence_count: number;
  duration_ms: number;
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'plan'; queries: string[] }
  | { type: 'evidence'; evidence: EvidenceNode }
  | { type: 'gap'; gap: Gap }
  | { type: 'result'; result: InvestigationResult }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ToolContext {
  signal?: AbortSignal;
  reportGap: (gap: Gap) => void;
}

export interface Tool<Args> {
  name: SourceTool;
  description: string;
  /** Zod validation at the tool boundary. Throws on invalid input. */
  parseArgs: (input: unknown) => Args;
  /** Every tool returns Evidence[], and fails open to an empty array. */
  execute: (args: Args, ctx: ToolContext) => Promise<Evidence[]>;
}

export type LlmRole = 'planner' | 'synthesizer' | 'gapfinder';

export interface RoleConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_ms: number;
}
