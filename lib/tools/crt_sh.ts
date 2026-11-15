import { z } from 'zod';
import { makeEvidence } from '../evidence/evidence';
import { crtshLookup, crtshQueryUrl } from '../fetch/crtsh';
import type { Evidence, Tool } from '../types';
import { errorMessage } from './run';

const argsSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Expected a bare domain such as example.com'),
});

type Args = z.infer<typeof argsSchema>;

export const crtshTool: Tool<Args> = {
  name: 'crt_sh',
  description: 'Query certificate transparency (crt.sh) for certificates and hostnames of a domain.',
  parseArgs: (input) => argsSchema.parse(input),
  async execute(args, ctx): Promise<Evidence[]> {
    try {
      const records = await crtshLookup(args.domain);
      if (!records.length) {
        ctx.reportGap({
          topic: 'certificate transparency',
          reason: `crt.sh returned no certificate records for ${args.domain}.`,
        });
        return [];
      }

      const evidence = makeEvidence({
        url: crtshQueryUrl(args.domain),
        text: records
          .map((record) => `${record.names.join(', ')} | issuer: ${record.issuer} | not before: ${record.notBefore}`)
          .join('\n'),
        source_tool: 'crt_sh',
        extractor_version: 'crt-sh-v1',
      });
      return evidence ? [evidence] : [];
    } catch (error) {
      ctx.reportGap({ topic: 'crt.sh lookup failed', reason: errorMessage(error).slice(0, 300) });
      return [];
    }
  },
};
