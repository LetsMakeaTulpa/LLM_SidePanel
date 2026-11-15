import { z } from 'zod';
import { makeEvidence } from '../evidence/evidence';
import { commonCrawlLookup } from '../fetch/commoncrawl';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  target: z.string().min(3).max(500),
});

type Args = z.infer<typeof argsSchema>;

export const commonCrawlTool: Tool<Args> = {
  name: 'common_crawl',
  description: 'Check the Common Crawl index for archived crawls of a URL or domain.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    try {
      const records = await commonCrawlLookup(args.target);
      if (!records.length) {
        ctx.reportGap({
          topic: 'common crawl coverage',
          reason: `The Common Crawl index has no rows for ${args.target}.`,
          suggested_query: args.target,
        });
        return [];
      }

      const first = records[0];
      const evidence = makeEvidence({
        url: first?.url || args.target,
        text: records
          .map((record) => `${record.url} | HTTP ${record.status} | ${record.mime} | crawl ${record.timestamp}`)
          .join('\n'),
        source_tool: 'common_crawl',
        extractor_version: 'common-crawl-index-v1',
      });
      return evidence ? [evidence] : [];
    } catch (error) {
      ctx.reportGap({ topic: 'common crawl lookup failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
