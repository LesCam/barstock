import IORedis from "ioredis";
import { importPOSWorker } from "./jobs/import-pos.job";
import { depletionWorker } from "./jobs/depletion.job";
import { snapshotWorker } from "./jobs/snapshot.job";
import { alertsWorker } from "./jobs/alerts.job";
import { scheduleRecurringJobs } from "./queue";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

async function main() {
  console.log("Starting BarStock workers...");

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  // Start workers
  importPOSWorker(connection);
  depletionWorker(connection);
  snapshotWorker(connection);
  alertsWorker(connection);

  console.log("All workers running. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});
