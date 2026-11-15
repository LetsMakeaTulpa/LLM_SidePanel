import { withTimeout } from '../async';
import { TOOL_TIMEOUT_MS } from '../fetch/http';
import type { Evidence, SourceTool, Tool, ToolContext } from '../types';

export interface ToolRun {
  tool: SourceTool;
  evidence: Evidence[];
  duration_ms: number;
  timed_out: boolean;
  error?: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate args, enforce the tool deadline and fail open. A failed or timed-out
 * tool yields an empty evidence array and a gap, never a thrown request.
 */
export async function runTool<Args>(tool: Tool<Args>, input: unknown, ctx: ToolContext): Promise<ToolRun> {
  const started = Date.now();

  let args: Args;
  try {
    args = tool.parseArgs(input);
  } catch (error) {
    const message = `Invalid ${tool.name} arguments: ${errorMessage(error)}`.slice(0, 300);
    ctx.reportGap({ topic: `${tool.name} arguments`, reason: message });
    return { tool: tool.name, evidence: [], duration_ms: Date.now() - started, timed_out: false, error: message };
  }

  const execution = tool.execute(args, ctx).catch((error: unknown) => {
    ctx.reportGap({ topic: `${tool.name} failed`, reason: errorMessage(error).slice(0, 300) });
    return [] as Evidence[];
  });

  const evidence = await withTimeout(execution, TOOL_TIMEOUT_MS);
  if (evidence === null) {
    ctx.reportGap({
      topic: `${tool.name} timed out`,
      reason: `No response within ${TOOL_TIMEOUT_MS}ms; treated as empty evidence.`,
    });
    return { tool: tool.name, evidence: [], duration_ms: Date.now() - started, timed_out: true };
  }

  return { tool: tool.name, evidence, duration_ms: Date.now() - started, timed_out: false };
}
