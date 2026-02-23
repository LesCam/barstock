import { auth } from "@/lib/auth";
import { scanImportEmitter } from "@barstock/api/src/lib/scan-import-emitter";
import type { ScanImportEvent } from "@barstock/api/src/lib/scan-import-emitter";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanSessionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { scanSessionId } = await params;
  const encoder = new TextEncoder();
  let listenerCleanup: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
      );

      // Listen for scan import events
      const eventKey = `scan:${scanSessionId}`;
      const listener = (event: ScanImportEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };
      scanImportEmitter.on(eventKey, listener);
      listenerCleanup = () => scanImportEmitter.off(eventKey, listener);

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
