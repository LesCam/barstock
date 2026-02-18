import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { businessesRouter } from "./routers/businesses";
import { locationsRouter } from "./routers/locations";
import { inventoryRouter } from "./routers/inventory";
import { posRouter } from "./routers/pos";
import { mappingsRouter } from "./routers/mappings";
import { draftRouter } from "./routers/draft";
import { sessionsRouter } from "./routers/sessions";
import { eventsRouter } from "./routers/events";
import { scaleRouter } from "./routers/scale";
import { reportsRouter } from "./routers/reports";
import { areasRouter } from "./routers/areas";
import { auditRouter } from "./routers/audit";
import { settingsRouter } from "./routers/settings";
import { notificationsRouter } from "./routers/notifications";
import { artistsRouter } from "./routers/artists";
import { artworksRouter } from "./routers/artworks";
import { artSalesRouter } from "./routers/art-sales";
import { usersRouter } from "./routers/users";
import { vendorsRouter } from "./routers/vendors";
import { productGuideRouter } from "./routers/product-guide";
import { transfersRouter } from "./routers/transfers";
import { receivingRouter } from "./routers/receiving";

export const appRouter = router({
  auth: authRouter,
  businesses: businessesRouter,
  locations: locationsRouter,
  inventory: inventoryRouter,
  pos: posRouter,
  mappings: mappingsRouter,
  draft: draftRouter,
  sessions: sessionsRouter,
  events: eventsRouter,
  scale: scaleRouter,
  reports: reportsRouter,
  areas: areasRouter,
  audit: auditRouter,
  settings: settingsRouter,
  notifications: notificationsRouter,
  artists: artistsRouter,
  artworks: artworksRouter,
  artSales: artSalesRouter,
  users: usersRouter,
  vendors: vendorsRouter,
  productGuide: productGuideRouter,
  transfers: transfersRouter,
  receiving: receivingRouter,
});

export type AppRouter = typeof appRouter;

export { createContext } from "./context-factory";
export type { Context, UserPayload } from "./context";
