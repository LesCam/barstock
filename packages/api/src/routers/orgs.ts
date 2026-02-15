import { router, protectedProcedure, requireRole } from "../trpc";
import { orgCreateSchema, orgUpdateSchema, locationCreateSchema, locationUpdateSchema } from "@barstock/validators";
import { z } from "zod";

export const orgsRouter = router({
  create: protectedProcedure
    .use(requireRole("admin"))
    .input(orgCreateSchema)
    .mutation(({ ctx, input }) => ctx.prisma.org.create({ data: input })),

  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.orgId) {
      return ctx.prisma.org.findMany({ where: { id: ctx.user.orgId } });
    }
    return ctx.prisma.org.findMany();
  }),

  getById: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.org.findUniqueOrThrow({ where: { id: input.orgId } })
    ),

  update: protectedProcedure
    .use(requireRole("admin"))
    .input(z.object({ orgId: z.string().uuid() }).merge(orgUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { orgId, ...data } = input;
      return ctx.prisma.org.update({ where: { id: orgId }, data });
    }),
});
