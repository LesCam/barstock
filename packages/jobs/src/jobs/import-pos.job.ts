import { Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "@barstock/database";
import { ToastAdapter } from "@barstock/api/src/adapters/toast.adapter";

interface ImportPOSData {
  locationId?: string;
  fromDate?: string;
  toDate?: string;
}

export function importPOSWorker(connection: IORedis) {
  return new Worker<ImportPOSData>(
    "import-pos",
    async (job: Job<ImportPOSData>) => {
      console.log(`[import-pos] Processing job ${job.id}`);

      // Get all active POS connections (or filter by locationId)
      const connections = await prisma.pOSConnection.findMany({
        where: {
          status: "active",
          ...(job.data.locationId && { locationId: job.data.locationId }),
        },
        include: { location: true },
      });

      let totalImported = 0;

      for (const conn of connections) {
        try {
          const adapter = createAdapter(conn.sourceSystem);
          if (!adapter) continue;

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const fromDate = job.data.fromDate ? new Date(job.data.fromDate) : yesterday;
          const toDate = job.data.toDate ? new Date(job.data.toDate) : new Date();

          const salesLines = await adapter.fetchSalesLines(
            conn.locationId,
            fromDate,
            toDate
          );

          // Upsert sales lines (idempotent via unique constraint)
          for (const line of salesLines) {
            try {
              await prisma.salesLine.create({
                data: {
                  ...line,
                  locationId: conn.locationId,
                  sourceSystem: line.sourceSystem as any,
                  businessDate: line.businessDate,
                },
              });
              totalImported++;
            } catch (err: any) {
              // Skip duplicates (unique constraint violation)
              if (err.code !== "P2002") throw err;
            }
          }

          // Update connection status
          await prisma.pOSConnection.update({
            where: { id: conn.id },
            data: { lastSuccessTs: new Date(), lastError: null },
          });
        } catch (err: any) {
          console.error(`[import-pos] Error for connection ${conn.id}:`, err.message);
          await prisma.pOSConnection.update({
            where: { id: conn.id },
            data: { lastError: err.message },
          });
        }
      }

      console.log(`[import-pos] Imported ${totalImported} sales lines`);
      return { totalImported };
    },
    { connection, concurrency: 1 }
  );
}

function createAdapter(sourceSystem: string) {
  switch (sourceSystem) {
    case "toast":
      return new ToastAdapter();
    default:
      console.warn(`[import-pos] No adapter for source system: ${sourceSystem}`);
      return null;
  }
}
