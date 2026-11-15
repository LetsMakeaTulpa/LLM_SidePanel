import { z } from 'zod';
import { makeEvidence } from '../evidence/evidence';
import { searchWeb } from '../fetch/searxng';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  query: z.string().min(2).max(300),
});

type Args = z.infer<typeof argsSchema>;

export const webSearchTool: Tool<Args> = {
  name: 'web_search',
  description: 'Search the web through a configured SearXNG instance; returns one snippet evidence per result.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    try {
      const hits = await searchWeb(args.query);
      if (!hits.length) {
        ctx.reportGap({
          topic: 'web search',
          reason: `No search results for "${args.query}".`,
          suggested_query: args.query,
        });
        return [];
      }

      return hits.flatMap((hit) => {
        const evidence = makeEvidence({
          url: hit.url,
          text: `${hit.title}\n${hit.snippet}\n${hit.url}`.trim(),
          source_tool: 'web_search',
          extractor_version: 'search-snippet-v1',
        });
        return evidence ? [evidence] : [];
      });
    } catch (error) {
      ctx.reportGap({ topic: 'web search failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
