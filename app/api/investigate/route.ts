import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { investigate } from '../../../lib/agent/loop';
import type { AgentEvent } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const InvestigateRequestSchema = z.object({
  question: z.string().min(3).max(2000),
});

export async function POST(request: NextRequest): Promise<Response> {
  const payload = await request.json().catch(() => null);
  const parsed = InvestigateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json({ error: 'A question is required.', issues: parsed.error.issues }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await investigate({
          question: parsed.data.question,
          signal: request.signal,
          emit: send,
        });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* client already disconnected */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
