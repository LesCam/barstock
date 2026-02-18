import type { ExtendedPrismaClient } from "@barstock/database";
import type {
  GuideCategoryCreateInput,
  GuideCategoryUpdateInput,
  GuideCategoryListInput,
  GuideItemCreateInput,
  GuideItemUpdateInput,
  GuideItemListInput,
} from "@barstock/validators";
import { AuditService } from "./audit.service";
import { createStorageAdapter } from "./storage";

export class ProductGuideService {
  private audit: AuditService;

  constructor(private prisma: ExtendedPrismaClient) {
    this.audit = new AuditService(prisma);
  }

  // ─── Categories ───────────────────────────────────────────

  async createCategory(data: GuideCategoryCreateInput, actorUserId: string) {
    const category = await this.prisma.productGuideCategory.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
      },
    });

    const location = await this.prisma.location.findUnique({
      where: { id: data.locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_category.created",
        objectType: "guide_category",
        objectId: category.id,
        metadata: { name: data.name },
      });
    }

    return category;
  }

  async listCategories(params: GuideCategoryListInput) {
    const where: Record<string, unknown> = { locationId: params.locationId };
    if (params.activeOnly) where.active = true;

    return this.prisma.productGuideCategory.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    });
  }

  async updateCategory(data: GuideCategoryUpdateInput, actorUserId: string) {
    const { id, locationId, ...fields } = data;

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updateData[key] = value;
    }

    const category = await this.prisma.productGuideCategory.update({
      where: { id },
      data: updateData,
    });

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_category.updated",
        objectType: "guide_category",
        objectId: id,
        metadata: updateData,
      });
    }

    return category;
  }

  // ─── Items ────────────────────────────────────────────────

  async createItem(data: GuideItemCreateInput, actorUserId: string) {
    const item = await this.prisma.productGuideItem.create({
      data: {
        locationId: data.locationId,
        categoryId: data.categoryId,
        inventoryItemId: data.inventoryItemId,
        description: data.description,
        sortOrder: data.sortOrder,
        prices: data.prices,
        abv: data.abv,
        producer: data.producer,
        region: data.region,
        vintage: data.vintage,
        varietal: data.varietal,
      },
      include: {
        inventoryItem: { select: { name: true, category: { select: { name: true } } } },
        category: { select: { name: true } },
      },
    });

    const location = await this.prisma.location.findUnique({
      where: { id: data.locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_item.created",
        objectType: "guide_item",
        objectId: item.id,
        metadata: { inventoryItemId: data.inventoryItemId, categoryId: data.categoryId },
      });
    }

    return item;
  }

  async listItems(params: GuideItemListInput) {
    const where: Record<string, unknown> = { locationId: params.locationId };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.activeOnly) where.active = true;

    return this.prisma.productGuideItem.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        inventoryItem: { select: { name: true, category: { select: { name: true } } } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async getItem(id: string) {
    return this.prisma.productGuideItem.findUniqueOrThrow({
      where: { id },
      include: {
        inventoryItem: { select: { name: true, barcode: true, category: { select: { name: true } } } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async updateItem(data: GuideItemUpdateInput, actorUserId: string) {
    const { id, locationId, ...fields } = data;

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        if (key === "categoryId") {
          updateData.category = { connect: { id: value } };
        } else {
          updateData[key] = value;
        }
      }
    }

    const item = await this.prisma.productGuideItem.update({
      where: { id },
      data: updateData,
      include: {
        inventoryItem: { select: { name: true, category: { select: { name: true } } } },
        category: { select: { id: true, name: true } },
      },
    });

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_item.updated",
        objectType: "guide_item",
        objectId: id,
        metadata: updateData,
      });
    }

    return item;
  }

  async uploadItemImage(
    id: string,
    locationId: string,
    buffer: Buffer,
    filename: string,
    actorUserId: string
  ) {
    // Remove existing image if any
    const existing = await this.prisma.productGuideItem.findUniqueOrThrow({
      where: { id },
      select: { imageKey: true },
    });

    const storage = createStorageAdapter();

    if (existing.imageKey) {
      await storage.delete(existing.imageKey);
    }

    const key = `guide/${id}/${Date.now()}-${filename}`;
    const url = await storage.upload(buffer, key);

    const item = await this.prisma.productGuideItem.update({
      where: { id },
      data: { imageUrl: url, imageKey: key },
      include: {
        inventoryItem: { select: { name: true, category: { select: { name: true } } } },
        category: { select: { id: true, name: true } },
      },
    });

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_item.image_uploaded",
        objectType: "guide_item",
        objectId: id,
        metadata: { filename },
      });
    }

    return item;
  }

  async removeItemImage(id: string, locationId: string, actorUserId: string) {
    const existing = await this.prisma.productGuideItem.findUniqueOrThrow({
      where: { id },
      select: { imageKey: true },
    });

    if (existing.imageKey) {
      const storage = createStorageAdapter();
      await storage.delete(existing.imageKey);
    }

    const item = await this.prisma.productGuideItem.update({
      where: { id },
      data: { imageUrl: null, imageKey: null },
    });

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_item.image_removed",
        objectType: "guide_item",
        objectId: id,
      });
    }

    return item;
  }

  async deleteItem(id: string, locationId: string, actorUserId: string) {
    // Remove stored image if any
    const existing = await this.prisma.productGuideItem.findUniqueOrThrow({
      where: { id },
      select: { imageKey: true, inventoryItem: { select: { name: true } } },
    });

    if (existing.imageKey) {
      const storage = createStorageAdapter();
      await storage.delete(existing.imageKey);
    }

    await this.prisma.productGuideItem.delete({ where: { id } });

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { businessId: true },
    });

    if (location) {
      await this.audit.log({
        businessId: location.businessId,
        actorUserId,
        actionType: "guide_item.deleted",
        objectType: "guide_item",
        objectId: id,
        metadata: { name: existing.inventoryItem.name },
      });
    }
  }

  // ─── Public API ───────────────────────────────────────────

  async getPublicGuide(locationId: string) {
    const categories = await this.prisma.productGuideCategory.findMany({
      where: { locationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        items: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            description: true,
            imageUrl: true,
            prices: true,
            abv: true,
            producer: true,
            region: true,
            vintage: true,
            varietal: true,
            sortOrder: true,
            inventoryItem: {
              select: { name: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });

    return categories;
  }
}
