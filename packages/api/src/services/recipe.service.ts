import type { ExtendedPrismaClient } from "@barstock/database";
import type { RecipeCreateInput, RecipeUpdateInput } from "@barstock/validators";

export class RecipeService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async create(input: RecipeCreateInput) {
    return this.prisma.recipe.create({
      data: {
        locationId: input.locationId,
        name: input.name,
        category: input.category ?? null,
        ingredients: {
          create: input.ingredients.map((ing) => ({
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            uom: ing.uom as any,
          })),
        },
      },
      include: {
        ingredients: {
          include: { inventoryItem: { select: { name: true } } },
        },
      },
    });
  }

  async update(recipeId: string, input: RecipeUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.ingredients) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
        await tx.recipeIngredient.createMany({
          data: input.ingredients.map((ing) => ({
            recipeId,
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            uom: ing.uom as any,
          })),
        });
      }

      return tx.recipe.update({
        where: { id: recipeId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.category !== undefined && { category: input.category ?? null }),
          ...(input.active !== undefined && { active: input.active }),
        },
        include: {
          ingredients: {
            include: { inventoryItem: { select: { name: true } } },
          },
        },
      });
    });
  }

  async listCategories(locationId: string) {
    const results = await this.prisma.recipe.findMany({
      where: { locationId, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    return results.map((r) => r.category!);
  }

  async list(locationId: string) {
    return this.prisma.recipe.findMany({
      where: { locationId },
      include: {
        ingredients: {
          include: {
            inventoryItem: {
              select: { name: true, category: { select: { name: true } } },
            },
          },
        },
        _count: { select: { posMappings: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    });
  }

  async listWithCosts(locationId: string) {
    const recipes = await this.list(locationId);

    // Get latest unit costs for all inventory items used in recipes
    const itemIds = [
      ...new Set(
        recipes.flatMap((r) => r.ingredients.map((ing) => ing.inventoryItemId))
      ),
    ];

    if (itemIds.length === 0) {
      return recipes.map((r) => ({
        ...r,
        ingredientCosts: r.ingredients.map((ing) => ({
          inventoryItemId: ing.inventoryItemId,
          unitCost: null as number | null,
          lineCost: null as number | null,
        })),
        totalCost: null as number | null,
      }));
    }

    const costs = await this.prisma.$queryRaw<
      Array<{ inventory_item_id: string; unit_cost: number }>
    >`
      SELECT DISTINCT ON (ph.inventory_item_id)
        ph.inventory_item_id,
        ph.unit_cost::float as unit_cost
      FROM price_history ph
      WHERE ph.inventory_item_id = ANY(${itemIds}::uuid[])
      ORDER BY ph.inventory_item_id, ph.effective_from_ts DESC
    `;

    const costMap = new Map(costs.map((c) => [c.inventory_item_id, c.unit_cost]));

    return recipes.map((r) => {
      const ingredientCosts = r.ingredients.map((ing) => {
        const unitCost = costMap.get(ing.inventoryItemId) ?? null;
        const qty = Number(ing.quantity);
        return {
          inventoryItemId: ing.inventoryItemId,
          unitCost,
          lineCost: unitCost != null ? unitCost * qty : null,
        };
      });

      const knownCosts = ingredientCosts.filter((c) => c.lineCost != null);
      const totalCost =
        knownCosts.length > 0
          ? knownCosts.reduce((sum, c) => sum + c.lineCost!, 0)
          : null;

      return { ...r, ingredientCosts, totalCost };
    });
  }

  async getById(recipeId: string) {
    return this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: {
          include: {
            inventoryItem: {
              select: { name: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });
  }
}
