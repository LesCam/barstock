import { Prisma } from "@prisma/client";

/**
 * Prisma client extension that blocks mutations on consumption_events.
 *
 * The PostgreSQL schema already has triggers blocking UPDATE/DELETE,
 * but this extension enforces immutability at the application layer too,
 * giving clearer error messages before hitting the database.
 */
export const immutableLedger = Prisma.defineExtension({
  query: {
    consumptionEvent: {
      async update({ args, query }) {
        throw new Error(
          "consumption_events is immutable. Use the correction pattern: create a reversal event + replacement event."
        );
      },
      async updateMany({ args, query }) {
        throw new Error(
          "consumption_events is immutable. Use the correction pattern: create a reversal event + replacement event."
        );
      },
      async delete({ args, query }) {
        throw new Error(
          "consumption_events is immutable. Events cannot be deleted."
        );
      },
      async deleteMany({ args, query }) {
        throw new Error(
          "consumption_events is immutable. Events cannot be deleted."
        );
      },
    },
  },
});
