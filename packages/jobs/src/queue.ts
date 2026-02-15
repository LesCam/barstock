import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const importPOSQueue = new Queue("import-pos", { connection });
export const depletionQueue = new Queue("depletion", { connection });
export const snapshotQueue = new Queue("snapshot", { connection });

/**
 * Schedule recurring jobs.
 * Call once on application startup.
 */
export async function scheduleRecurringJobs() {
  // Daily POS import at 5:00 AM
  await importPOSQueue.upsertJobScheduler(
    "daily-pos-import",
    { pattern: "0 5 * * *" },
    { name: "daily-import", data: {} }
  );

  // Nightly depletion run at 5:30 AM (after import)
  await depletionQueue.upsertJobScheduler(
    "daily-depletion",
    { pattern: "30 5 * * *" },
    { name: "daily-depletion", data: {} }
  );

  // Nightly inventory snapshot at 6:00 AM
  await snapshotQueue.upsertJobScheduler(
    "nightly-snapshot",
    { pattern: "0 6 * * *" },
    { name: "nightly-snapshot", data: {} }
  );
}
