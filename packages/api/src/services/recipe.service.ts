import type { ExtendedPrismaClient } from "@barstock/database";
import type { RecipeCreateInput, RecipeUpdateInput } from "@barstock/validators";

export class RecipeService {
  constructor(private prisma: ExtendedPrismaClient) {}

  async create(input: RecipeCreateInput) {
    return this.prisma.recipe.create({
      data: {
        locationId: input.locationId,
        name: input.name,
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
