import { Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "@barstock/database";
import { DepletionEngine } from "@barstock/api/src/services/depletion.service";

interface DepletionData {
  locationId?: string;
  fromTs?: string;
  toTs?: string;
}

export function depletionWorker(connection: IORedis) {
  return new Worker<DepletionData>(
    "depletion",
    async (job: Job<DepletionData>) => {
      console.log(`[depletion] Processing job ${job.id}`);

      const engine = new DepletionEngine(prisma);

      // Default: process last 24 hours
      const toTs = job.data.toTs ? new Date(job.data.toTs) : new Date();
      const fromTs = job.data.fromTs
        ? new Date(job.data.fromTs)
        : new Date(toTs.getTime() - 24 * 60 * 60 * 1000);

      // Get locations to process
      const locations = job.data.locationId
        ? [{ id: job.data.locationId }]
        : await prisma.location.findMany({ select: { id: true } });

      const results: Record<string, any> = {};

      for (const loc of locations) {
        const stats = await engine.processSalesLines(loc.id, fromTs, toTs);
        results[loc.id] = stats;
        console.log(`[depletion] Location ${loc.id}: ${JSON.stringify(stats)}`);
      }

      return results;
    },
    { connection, concurrency: 1 }
  );
}
