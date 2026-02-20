import { Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "@barstock/database";
import { AlertService } from "@barstock/api/src/services/alert.service";

export function alertsWorker(connection: IORedis) {
  return new Worker(
    "alerts",
    async (job: Job) => {
      console.log(`[alerts] Processing alert evaluation ${job.id}`);

      const alertSvc = new AlertService(prisma);

      // Process all active businesses
      const businesses = await prisma.business.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      let totalSent = 0;
      for (const biz of businesses) {
        try {
          const sent = await alertSvc.evaluateAndNotify(biz.id);
          if (sent > 0) {
            console.log(`[alerts] ${biz.name}: sent ${sent} notification(s)`);
          }
          totalSent += sent;
        } catch (err) {
          console.error(`[alerts] Error processing ${biz.name}:`, err);
        }
      }

      console.log(`[alerts] Done. ${totalSent} total notifications sent.`);
      return { businesses: businesses.length, notificationsSent: totalSent };
    },
    { connection, concurrency: 1 }
  );
}
