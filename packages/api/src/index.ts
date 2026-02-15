import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { orgsRouter } from "./routers/orgs";
import { locationsRouter } from "./routers/locations";
import { inventoryRouter } from "./routers/inventory";
import { posRouter } from "./routers/pos";
import { mappingsRouter } from "./routers/mappings";
import { draftRouter } from "./routers/draft";
import { sessionsRouter } from "./routers/sessions";
import { eventsRouter } from "./routers/events";
import { scaleRouter } from "./routers/scale";
import { reportsRouter } from "./routers/reports";

export const appRouter = router({
  auth: authRouter,
  orgs: orgsRouter,
  locations: locationsRouter,
  inventory: inventoryRouter,
  pos: posRouter,
  mappings: mappingsRouter,
  draft: draftRouter,
  sessions: sessionsRouter,
  events: eventsRouter,
  scale: scaleRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;

export { createContext } from "./context-factory";
export type { Context, UserPayload } from "./context";
