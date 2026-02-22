import { auth } from "@/lib/auth";
import { sessionEmitter } from "@barstock/api/src/lib/session-emitter";
import type { SessionEvent } from "@barstock/api/src/lib/session-emitter";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { sessionId } = await params;
  const encoder = new TextEncoder();
  let listenerCleanup: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
      );

      // Listen for session events
      const eventKey = `session:${sessionId}`;
      const listener = (event: SessionEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };
      sessionEmitter.on(eventKey, listener);
      listenerCleanup = () => sessionEmitter.off(eventKey, listener);

      // 30s heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
          );
        } catch {
          // Stream closed
        }
      }, 30_000);
    },
    cancel() {
      if (listenerCleanup) listenerCleanup();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
