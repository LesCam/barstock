import { Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "@barstock/database";
import { InventoryService } from "@barstock/api/src/services/inventory.service";

export function snapshotWorker(connection: IORedis) {
  return new Worker(
    "snapshot",
    async (job: Job) => {
      console.log(`[snapshot] Processing nightly snapshot ${job.id}`);

      const svc = new InventoryService(prisma);
      const locations = await prisma.location.findMany({ select: { id: true, name: true } });

      for (const loc of locations) {
        const onHand = await svc.calculateOnHand(loc.id);
        const totalValue = onHand.reduce((sum, item) => sum + (item.totalValue ?? 0), 0);

        console.log(
          `[snapshot] ${loc.name}: ${onHand.length} items, $${totalValue.toFixed(2)} total value`
        );

        // Snapshot data could be stored in a snapshots table or sent to
        // an analytics service. For now, it's logged for observability.
      }

      return { locations: locations.length, timestamp: new Date().toISOString() };
    },
    { connection, concurrency: 1 }
  );
}
