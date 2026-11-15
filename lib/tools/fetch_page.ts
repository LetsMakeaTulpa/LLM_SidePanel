import { z } from 'zod';
import { getOrFetch } from '../cache/fetch-cache';
import { makeEvidence } from '../evidence/evidence';
import { EXTRACTOR_VERSION, extractText } from '../fetch/extract';
import { isHttpUrl } from '../fetch/domain';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  url: z.string().url().max(2000).refine(isHttpUrl, 'Only http(s) URLs can be fetched'),
});

type Args = z.infer<typeof argsSchema>;

export const fetchPageTool: Tool<Args> = {
  name: 'fetch_page',
  description: 'Fetch a page and extract its readable text as evidence.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    try {
      const page = await getOrFetch(args.url, { accept: 'text/html,text/plain,application/json;q=0.9' });
      if (!page) {
        ctx.reportGap({ topic: 'page fetch', reason: `Could not fetch ${args.url}.` });
        return [];
      }
      if (page.status >= 400) {
        ctx.reportGap({ topic: 'page fetch', reason: `${args.url} returned HTTP ${page.status}.` });
        return [];
      }

      const { text, title } = extractText(page.body, page.contentType);
      if (!text) {
        ctx.reportGap({ topic: 'page extraction', reason: `No readable text extracted from ${args.url}.` });
        return [];
      }

      const evidence = makeEvidence({
        url: page.finalUrl || args.url,
        text: title ? `${title}\n\n${text}` : text,
        source_tool: 'fetch_page',
        extractor_version: EXTRACTOR_VERSION,
      });
      return evidence ? [evidence] : [];
    } catch (error) {
      ctx.reportGap({ topic: 'page fetch failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
