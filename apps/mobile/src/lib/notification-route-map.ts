/**
 * Maps web linkUrl paths to mobile Expo Router routes.
 * Returns null for paths that have no mobile equivalent.
 */
export function mapNotificationRoute(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;

  // Strip origin if present (e.g. "https://app.barstock.com/sessions/abc")
  const path = linkUrl.replace(/^https?:\/\/[^/]+/, "");

  // Session detail: /sessions/:id → /session/:id
  const sessionMatch = path.match(/^\/sessions\/([a-f0-9-]+)/);
  if (sessionMatch) return `/session/${sessionMatch[1]}`;

  // Inventory item detail: /inventory/:id
  const inventoryMatch = path.match(/^\/inventory\/([a-f0-9-]+)/);
  if (inventoryMatch) return `/inventory/${inventoryMatch[1]}`;

  // Top-level tab routes
  if (path === "/sessions" || path === "/") return "/(tabs)";
  if (path === "/inventory") return "/(tabs)/inventory";
  if (path === "/settings") return "/(tabs)/settings";
  if (path === "/audit") return "/audit-log";
  if (path === "/reports") return "/(tabs)";
  if (path === "/draft") return "/(tabs)";
  if (path === "/par") return "/shopping-list";
  if (path === "/staff") return "/(tabs)/settings";

  return null;
}
