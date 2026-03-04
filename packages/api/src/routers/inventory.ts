import { router, protectedProcedure, requireRole, forceBusinessId, requireBusinessAccess, requireLocationAccess, isPlatformAdmin } from "../trpc";
import { TRPCError } from "@trpc/server";
import { inventoryItemCreateSchema, inventoryItemUpdateSchema, inventoryItemBulkCreateSchema, priceHistoryCreateSchema, onHandQuerySchema, setItemVendorsSchema } from "@barstock/validators";
import { InventoryService } from "../services/inventory.service";
import { AuditService } from "../services/audit.service";
import { AlertService } from "../services/alert.service";
import { z } from "zod";

export const inventoryRouter = router({
  create: protectedProcedure
    .use(requireRole("manager"))
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

  bulkCreate: protectedProcedure
    .use(requireRole("manager"))
    .input(inventoryItemBulkCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { locationId, items } = input;

      // Find existing items by name in this location for dedup
      const existingItems = await ctx.prisma.inventoryItem.findMany({
        where: { locationId, active: true },
        select: { name: true },
      });
      const existingNames = new Set(
        existingItems.map((i) => i.name.toLowerCase())
      );

      const toCreate = items.filter(
        (item) => !existingNames.has(item.name.toLowerCase())
      );
      const skipped = items.length - toCreate.length;

      let created = 0;
      if (toCreate.length > 0) {
        const result = await ctx.prisma.inventoryItem.createMany({
          data: toCreate.map((item) => ({
            locationId,
            name: item.name,
            categoryId: item.categoryId,
            barcode: item.barcode ?? null,
            baseUom: item.baseUom,
            packSize: item.packSize ?? null,
            packUom: item.packUom ?? null,
            containerSize: item.containerSize ?? null,
            containerUom: item.containerUom ?? null,
          })),
        });
        created = result.count;

        // Create bottle templates for items with weight data
        const itemsWithWeightData = toCreate.filter(
          (item) => item.containerSizeMl && item.emptyBottleWeightG
        );
        if (itemsWithWeightData.length > 0) {
          // Query just-created items to get their IDs
          const createdItems = await ctx.prisma.inventoryItem.findMany({
            where: {
              locationId,
              name: { in: itemsWithWeightData.map((i) => i.name) },
              active: true,
            },
            select: { id: true, name: true },
          });
          const nameToId = new Map(createdItems.map((i) => [i.name.toLowerCase(), i.id]));

          const templateData = itemsWithWeightData
            .map((item) => {
              const itemId = nameToId.get(item.name.toLowerCase());
              if (!itemId) return null;
              return {
                businessId: ctx.user.businessId,
                inventoryItemId: itemId,
                containerSizeMl: item.containerSizeMl!,
                emptyBottleWeightG: item.emptyBottleWeightG ?? null,
                fullBottleWeightG: item.fullBottleWeightG ?? null,
                densityGPerMl: item.densityGPerMl ?? null,
              };
            })
            .filter(Boolean) as {
              businessId: string;
              inventoryItemId: string;
              containerSizeMl: number;
              emptyBottleWeightG: number | null;
              fullBottleWeightG: number | null;
              densityGPerMl: number | null;
            }[];

          if (templateData.length > 0) {
            await ctx.prisma.bottleTemplate.createMany({ data: templateData });
          }
        }
      }

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "inventory_item.bulk_created",
        objectType: "inventory_item",
        objectId: locationId,
        metadata: { created, skipped, total: items.length },
      });

      return { created, skipped };
    }),

  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findMany({
        where: { locationId: input.locationId, active: true },
        include: {
          category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      })
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
          vendor: { select: { id: true, name: true } },
          itemVendors: { include: { vendor: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
          priceHistory: { orderBy: { effectiveFromTs: "desc" }, take: 5 },
          bottleTemplates: { where: { enabled: true }, take: 1 },
        },
      });
      if (!isPlatformAdmin(ctx.user) && !ctx.user.locationIds.includes(item.locationId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }
      return item;
    }),

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
    .mutation(async ({ ctx, input }) => {
      const { entryMode, containerCost, containerSizeOz, ...rest } = input;
      let price;
      if (entryMode === "per_container") {
        const unitCost = containerCost! / containerSizeOz!;
        price = await ctx.prisma.priceHistory.create({
          data: { ...rest, unitCost, containerCost },
        });
      } else {
        price = await ctx.prisma.priceHistory.create({
          data: { ...rest, unitCost: rest.unitCost! },
        });
      }

      const audit = new AuditService(ctx.prisma);
      await audit.log({
        businessId: ctx.user.businessId,
        actorUserId: ctx.user.userId,
        actionType: "price.added",
        objectType: "price_history",
        objectId: price.id,
        metadata: {
          inventoryItemId: input.inventoryItemId,
          unitCost: Number(price.unitCost),
          containerCost: price.containerCost ? Number(price.containerCost) : undefined,
          effectiveFromTs: input.effectiveFromTs,
        },
      });

      // Fire price change alert (fire-and-forget)
      const alertSvc = new AlertService(ctx.prisma);
      const item = await ctx.prisma.inventoryItem.findUnique({
        where: { id: input.inventoryItemId },
        select: { location: { select: { name: true } } },
      });
      alertSvc.checkPriceChange(ctx.user.businessId, input.inventoryItemId, Number(price.unitCost), item?.location.name ?? "").catch(() => {});

      return price;
    }),

  kegSizesForItem: protectedProcedure
    .use(forceBusinessId())
    .use(requireBusinessAccess())
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
    .use(requireLocationAccess())
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

  setVendors: protectedProcedure
    .input(setItemVendorsSchema)
    .mutation(async ({ ctx, input }) => {
      const { inventoryItemId, vendors } = input;

      return ctx.prisma.$transaction(async (tx) => {
        // Delete existing item_vendors for this item
        await tx.itemVendor.deleteMany({ where: { inventoryItemId } });

        // Insert new rows
        if (vendors.length > 0) {
          await tx.itemVendor.createMany({
            data: vendors.map((v) => ({
              inventoryItemId,
              vendorId: v.vendorId,
              vendorSku: v.vendorSku ?? null,
              isPreferred: v.isPreferred ?? false,
            })),
          });
        }

        // Sync preferred vendor to InventoryItem.vendorId
        const preferred = vendors.find((v) => v.isPreferred);
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { vendorId: preferred?.vendorId ?? null },
        });

        return tx.itemVendor.findMany({
          where: { inventoryItemId },
          include: { vendor: { select: { id: true, name: true } } },
        });
      });
    }),

  listWithStock: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [items, stockRows] = await Promise.all([
        ctx.prisma.inventoryItem.findMany({
          where: { locationId: input.locationId, active: true },
          include: {
            category: { select: { id: true, name: true, countingMethod: true, defaultDensity: true } },
            vendor: { select: { id: true, name: true } },
          },
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
