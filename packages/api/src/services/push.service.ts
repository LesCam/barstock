import type { ExtendedPrismaClient } from "@barstock/database";

interface PushPayload {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

interface PushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export class PushService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async sendPush(
    userId: string,
    title: string,
    body?: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    });

    if (tokens.length === 0) return;

    const messages: PushPayload[] = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data,
      sound: "default" as const,
    }));

    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) return;

      const json = (await res.json()) as { data: PushReceipt[] };
      const receipts = json.data;

      // Clean up invalid tokens
      const toDelete: string[] = [];
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        if (
          receipt.status === "error" &&
          receipt.details?.error === "DeviceNotRegistered"
        ) {
          toDelete.push(tokens[i].id);
        }
      }

      if (toDelete.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    } catch {
      // Push delivery is best-effort — don't throw
    }
  }
}
