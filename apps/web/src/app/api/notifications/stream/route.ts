import { auth } from "@/lib/auth";
import { notificationEmitter } from "@barstock/api/src/lib/notification-emitter";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = session.user as any;
  const userId: string = user.id;

  const encoder = new TextEncoder();
  let listenerCleanup: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`));

      // Listen for new notifications
      const eventKey = `user:${userId}`;
      const listener = () => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "notification" })}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };
      notificationEmitter.on(eventKey, listener);
      listenerCleanup = () => notificationEmitter.off(eventKey, listener);

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
