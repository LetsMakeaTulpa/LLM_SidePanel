import { z } from 'zod';
import { makeEvidence } from '../evidence/evidence';
import { archiveUrl, cdxQueryUrl, waybackLookup } from '../fetch/wayback';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  target: z.string().min(3).max(500),
});

type Args = z.infer<typeof argsSchema>;

export const waybackCdxTool: Tool<Args> = {
  name: 'wayback_cdx',
  description: 'Look up historical Wayback Machine snapshots (CDX index) for a URL or domain.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    try {
      const rows = await waybackLookup(args.target);
      if (!rows.length) {
        ctx.reportGap({
          topic: 'historical snapshot',
          reason: `The Wayback CDX index returned no snapshots for ${args.target}.`,
          suggested_query: args.target,
        });
        return [];
      }

      const first = rows[0];
      const evidence = makeEvidence({
        url: first ? archiveUrl(first.timestamp, first.original) : cdxQueryUrl(args.target),
        text: rows
          .map((row) => `${archiveUrl(row.timestamp, row.original)} | ${row.mimetype} | HTTP ${row.statuscode} | digest ${row.digest.slice(0, 12)}`)
          .join('\n'),
        source_tool: 'wayback_cdx',
        extractor_version: 'wayback-cdx-v1',
      });
      return evidence ? [evidence] : [];
    } catch (error) {
      ctx.reportGap({ topic: 'wayback lookup failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
