import { router, protectedProcedure, requireRole } from "../trpc";
import { posMappingCreateSchema, posMappingUpdateSchema } from "@barstock/validators";
import { z } from "zod";

export const mappingsRouter = router({
  create: protectedProcedure
    .use(requireRole("manager"))
    .input(posMappingCreateSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.pOSItemMapping.create({ data: input })
    ),

  list: protectedProcedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.pOSItemMapping.findMany({
        where: { locationId: input.locationId },
        include: {
          inventoryItem: { select: { name: true, type: true } },
          pourProfile: { select: { name: true, oz: true } },
          tapLine: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    ),

  update: protectedProcedure
    .use(requireRole("manager"))
    .input(z.object({ id: z.string().uuid() }).merge(posMappingUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.pOSItemMapping.update({ where: { id }, data });
    }),
});
