import { z } from 'zod';

export const GapSchema = z.object({
  topic: z.string().min(1).max(160),
  reason: z.string().min(1).max(600),
  suggested_query: z.string().max(300).optional(),
});

export const PlanSchema = z.object({
  queries: z.array(z.string().min(4).max(300)).min(1).max(8),
});

/** GAPS is a required field: a missing gaps key is a validation failure. */
export const SynthesisSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(
    z.object({
      evidence_id: z.string().min(1).max(80),
      quote: z.string().min(1).max(1000),
    })
  ),
  gaps: z.array(GapSchema),
  confidence: z.number().min(0).max(1),
});

export const GapListSchema = z.object({
  gaps: z.array(GapSchema),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Synthesis = z.infer<typeof SynthesisSchema>;
