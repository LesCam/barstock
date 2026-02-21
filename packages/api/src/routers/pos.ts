import { router, protectedProcedure, requireRole } from "../trpc";
import { posConnectionCreateSchema, posConnectionUpdateSchema, salesLineCreateSchema, csvImportSchema, csvImportHistorySchema } from "@barstock/validators";
import { z } from "zod";
import { CSVImportService } from "../services/csv-import.service";

export const posRouter = router({
  createConnection: protectedProcedure
    .use(requireRole("business_admin"))
    .input(posConnectionCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.pOSConnection.create({ data: input })
    ),

  listConnections: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.pOSConnection.findMany({
        where: { locationId: input.locationId },
      })
    ),

  updateConnection: protectedProcedure
    .use(requireRole("business_admin"))
    .input(z.object({ id: z.string().uuid() }).merge(posConnectionUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.pOSConnection.update({ where: { id }, data });
    }),

  createSalesLine: protectedProcedure
    .input(salesLineCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.salesLine.create({ data: input })
    ),

  listSalesLines: protectedProcedure
    .input(z.object({
      locationId: z.string().uuid(),
      fromDate: z.coerce.date().optional(),
      toDate: z.coerce.date().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(({ ctx, input }) =>
      ctx.prisma.salesLine.findMany({
        where: {
          locationId: input.locationId,
          ...(input.fromDate && { soldAt: { gte: input.fromDate } }),
          ...(input.toDate && { soldAt: { lt: input.toDate } }),
        },
        orderBy: { soldAt: "desc" },
        take: input.limit,
      })
    ),

  /** Get unmapped POS items (sold but no mapping) */
  unmapped: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const unmapped = await ctx.prisma.$queryRaw<
        Array<{
          pos_item_id: string;
          pos_item_name: string;
          source_system: string;
          qty_sold_7d: number;
          first_seen: Date;
          last_seen: Date;
        }>
      >`
        SELECT
          sl.pos_item_id,
          sl.pos_item_name,
          sl.source_system::text,
          SUM(sl.quantity)::float as qty_sold_7d,
          MIN(sl.sold_at) as first_seen,
          MAX(sl.sold_at) as last_seen
        FROM sales_lines sl
        LEFT JOIN pos_item_mappings pim
          ON pim.location_id = sl.location_id
          AND pim.source_system = sl.source_system
          AND pim.pos_item_id = sl.pos_item_id
          AND pim.active = true
        WHERE sl.location_id = ${input.locationId}::uuid
          AND pim.id IS NULL
          AND sl.sold_at >= NOW() - INTERVAL '7 days'
        GROUP BY sl.pos_item_id, sl.pos_item_name, sl.source_system
        ORDER BY qty_sold_7d DESC
      `;
      return unmapped;
    }),

  /** Bulk import parsed CSV sales lines */
  importSalesLines: protectedProcedure
    .use(requireRole("business_admin"))
    .input(csvImportSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new CSVImportService(ctx.prisma);
      return service.importSalesLines(
        input.locationId,
        input.sourceSystem,
        input.lines.map((l) => ({
          ...l,
          rawPayloadJson: (l.rawPayloadJson as Record<string, unknown>) ?? undefined,
        })),
        input.fileName,
        input.runDepletion,
        ctx.user.userId,
        input.templateName
      );
    }),

  /** List past CSV import history */
  importHistory: protectedProcedure
    .use(requireRole("business_admin"))
    .input(csvImportHistorySchema)
    .query(async ({ ctx, input }) => {
      const service = new CSVImportService(ctx.prisma);
      return service.listImports(input.locationId, input.limit);
    }),
});
