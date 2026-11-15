import { z } from 'zod';
import { makeEvidence } from '../evidence/evidence';
import { githubCodeSearch, githubConfigured } from '../fetch/github';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  query: z.string().min(2).max(256),
});

type Args = z.infer<typeof argsSchema>;

export const githubCodeTool: Tool<Args> = {
  name: 'github_code',
  description: 'Search public GitHub code with the authenticated code-search API; returns matched snippets.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    if (!githubConfigured()) {
      ctx.reportGap({
        topic: 'github code search',
        reason: 'GITHUB_TOKEN is not configured, so code search was skipped.',
        suggested_query: args.query,
      });
      return [];
    }

    try {
      const hits = await githubCodeSearch(args.query);
      if (!hits.length) {
        ctx.reportGap({
          topic: 'github code search',
          reason: `GitHub returned no code matches for "${args.query}".`,
        });
        return [];
      }

      return hits.flatMap((hit) => {
        const evidence = makeEvidence({
          url: hit.url,
          text: `${hit.repo}/${hit.path}\n${hit.fragment || 'Matched file (no snippet returned by the API).'}`,
          source_tool: 'github_code',
          extractor_version: 'github-code-search-v1',
        });
        return evidence ? [evidence] : [];
      });
    } catch (error) {
      ctx.reportGap({ topic: 'github code search failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
