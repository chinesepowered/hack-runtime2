import { runFriday } from '@/lib/agent';
import { getRule } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One Friday run, streamed as NDJSON so the page can show each step as the
 * agent takes it. A per-instance lock stops two runs racing the same wallet
 * nonce (in-memory, so it resets per serverless instance).
 */
let running = false;

export async function POST() {
  if (running) return Response.json({ error: 'The agent is already running — give it a moment.' }, { status: 429 });
  running = true;
  const rule = await getRule();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runFriday(rule)) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: (err as Error).message?.slice(0, 200) }) + '\n'));
      } finally {
        running = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
