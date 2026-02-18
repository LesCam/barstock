import { router, protectedProcedure } from "../trpc";
import { inventoryItemCreateSchema, inventoryItemUpdateSchema, priceHistoryCreateSchema, onHandQuerySchema } from "@barstock/validators";
import { InventoryService } from "../services/inventory.service";
import { z } from "zod";

export const inventoryRouter = router({
  create: protectedProcedure
    .input(inventoryItemCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.inventoryItem.create({ data: input })),

  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findMany({
        where: { locationId: input.locationId, active: true },
        orderBy: { name: "asc" },
      })
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          priceHistory: { orderBy: { effectiveFromTs: "desc" }, take: 5 },
        },
      })
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(inventoryItemUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.inventoryItem.update({ where: { id }, data });
    }),

  addPrice: protectedProcedure
    .input(priceHistoryCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.priceHistory.create({ data: input })),

  getByBarcode: protectedProcedure
    .input(z.object({ locationId: z.string().uuid(), barcode: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findFirst({
        where: { locationId: input.locationId, barcode: input.barcode, active: true },
      })
    ),

  onHand: protectedProcedure
    .input(onHandQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new InventoryService(ctx.prisma);
      return svc.calculateOnHand(input.locationId, input.asOf);
    }),

  listWithStock: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [items, stockRows] = await Promise.all([
        ctx.prisma.inventoryItem.findMany({
          where: { locationId: input.locationId, active: true },
          orderBy: { name: "asc" },
        }),
        ctx.prisma.consumptionEvent.groupBy({
          by: ["inventoryItemId"],
          where: { locationId: input.locationId },
          _sum: { quantityDelta: true },
        }),
      ]);

      const stockMap = new Map(
        stockRows.map((r) => [r.inventoryItemId, Number(r._sum.quantityDelta ?? 0)])
      );

      return items.map((item) => ({
        ...item,
        onHandQty: stockMap.get(item.id) ?? null,
      }));
    }),
});
