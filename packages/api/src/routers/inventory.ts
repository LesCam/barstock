import { router, protectedProcedure } from "../trpc";
import { inventoryItemCreateSchema, inventoryItemUpdateSchema, priceHistoryCreateSchema, onHandQuerySchema } from "@barstock/validators";
import { InventoryService } from "../services/inventory.service";
import { AuditService } from "../services/audit.service";
import { z } from "zod";

export const inventoryRouter = router({
  create: protectedProcedure
    .input(inventoryItemCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.inventoryItem.create({ data: input });
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "inventory_item.created",
        objectType: "inventory_item",
        objectId: item.id,
        metadata: { name: input.name, categoryId: input.categoryId },
      });
      return item;
    }),

  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findMany({
        where: { locationId: input.locationId, active: true },
        include: { category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } } },
        orderBy: { name: "asc" },
      })
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
          priceHistory: { orderBy: { effectiveFromTs: "desc" }, take: 5 },
          bottleTemplates: { where: { enabled: true }, take: 1 },
        },
      })
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(inventoryItemUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const item = await ctx.prisma.inventoryItem.update({ where: { id }, data });
      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "inventory_item.updated",
        objectType: "inventory_item",
        objectId: id,
        metadata: data,
      });
      return item;
    }),

  addPrice: protectedProcedure
    .input(priceHistoryCreateSchema)
    .mutation(({ ctx, input }) => {
      const { entryMode, containerCost, containerSizeOz, ...rest } = input;
      if (entryMode === "per_container") {
        const unitCost = containerCost! / containerSizeOz!;
        return ctx.prisma.priceHistory.create({
          data: { ...rest, unitCost, containerCost },
        });
      }
      return ctx.prisma.priceHistory.create({
        data: { ...rest, unitCost: rest.unitCost! },
      });
    }),

  kegSizesForItem: protectedProcedure
    .input(z.object({ inventoryItemId: z.string().uuid(), businessId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get keg sizes used by this item's keg instances
      const itemSizes = await ctx.prisma.kegInstance.findMany({
        where: { inventoryItemId: input.inventoryItemId },
        select: { kegSizeId: true },
        distinct: ["kegSizeId"],
      });
      const itemSizeIds = itemSizes.map((k) => k.kegSizeId);

      // Fetch those sizes, or fall back to all business keg sizes
      if (itemSizeIds.length > 0) {
        return ctx.prisma.kegSize.findMany({
          where: { id: { in: itemSizeIds } },
          orderBy: { totalOz: "asc" },
        });
      }
      return ctx.prisma.kegSize.findMany({
        where: { businessId: input.businessId },
        orderBy: { totalOz: "asc" },
      });
    }),

  getByBarcode: protectedProcedure
    .input(z.object({ locationId: z.string().uuid(), barcode: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findFirst({
        where: { locationId: input.locationId, barcode: input.barcode, active: true },
        include: { category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } } },
      })
    ),

  onHand: protectedProcedure
    .input(onHandQuerySchema)
    .query(({ ctx, input }) => {
      const svc = new InventoryService(ctx.prisma);
      return svc.calculateOnHand(input.locationId, input.asOf);
    }),

  lastLocation: protectedProcedure
    .input(z.object({ inventoryItemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const line = await ctx.prisma.inventorySessionLine.findFirst({
        where: { inventoryItemId: input.inventoryItemId, subAreaId: { not: null } },
        orderBy: { createdAt: "desc" },
        include: { subArea: { include: { barArea: true } } },
      });
      if (!line?.subArea) return null;
      return {
        areaName: line.subArea.barArea.name,
        subAreaName: line.subArea.name,
      };
    }),

  listWithStock: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [items, stockRows] = await Promise.all([
        ctx.prisma.inventoryItem.findMany({
          where: { locationId: input.locationId, active: true },
          include: { category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } } },
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
