type Role = "staff" | "manager" | "business_admin" | "platform_admin" | "curator" | "accounting";

export interface TipDefinition {
  id: string;
  title: string;
  description: string;
  order: number;
  page: string;
  prerequisite?: string; // tipId that must be dismissed first
  roles?: Role[];
  actionLabel?: string;
  actionHref?: string;
}

/**
 * Central tip registry. Tips appear in `order` sequence, and a tip only shows
 * if its `prerequisite` (if any) has been dismissed. Tips are also filtered
 * by the user's role.
 */
export const TIP_REGISTRY: TipDefinition[] = [
  {
    id: "welcome-dashboard",
    title: "Welcome to Your Dashboard",
    description: "This is your inventory command center. Start by adding items, then create a counting session.",
    order: 1,
    page: "/",
    actionLabel: "Add inventory",
    actionHref: "/inventory",
  },
  {
    id: "inventory-setup",
    title: "Set Up Your Inventory",
    description: "Add items with categories, bottle sizes, and costs. Categories determine the counting method.",
    order: 2,
    page: "/inventory",
    prerequisite: "welcome-dashboard",
    roles: ["manager", "business_admin", "platform_admin"],
    actionLabel: "Learn about categories",
    actionHref: "/help#counting-methods",
  },
  {
    id: "pos-connection",
    title: "Connect Your POS",
    description: "Link your point-of-sale system to auto-track sales and calculate expected depletion.",
    order: 3,
    page: "/pos",
    prerequisite: "inventory-setup",
    roles: ["manager", "business_admin", "platform_admin"],
  },
  {
    id: "first-session",
    title: "Start Counting",
    description: "Create a counting session, then use the mobile app to scan and weigh items in each area.",
    order: 4,
    page: "/sessions",
    prerequisite: "inventory-setup",
    actionLabel: "View help",
    actionHref: "/help#sessions",
  },
  {
    id: "variance-review",
    title: "Review Your Variance",
    description: "After closing a session, check variance reports to spot shrinkage and over-pours.",
    order: 5,
    page: "/reports",
    prerequisite: "first-session",
    roles: ["manager", "business_admin", "platform_admin", "accounting"],
  },
  {
    id: "par-levels",
    title: "Set Par Levels",
    description: "Define minimum stock levels for each item. Get alerts when inventory drops below par.",
    order: 6,
    page: "/par-levels",
    prerequisite: "first-session",
    roles: ["manager", "business_admin", "platform_admin"],
    actionLabel: "Learn about par levels",
    actionHref: "/help#par-levels",
  },
  {
    id: "expected-inventory",
    title: "Track Expected Levels",
    description: "See predicted inventory levels based on POS sales, receiving, and transfers.",
    order: 7,
    page: "/inventory/expected",
    prerequisite: "first-session",
    roles: ["manager", "business_admin", "platform_admin"],
  },
  {
    id: "art-gallery-start",
    title: "Manage Your Gallery",
    description: "Add artworks, upload photos, and print QR labels for the wall.",
    order: 2,
    page: "/art",
    roles: ["curator", "manager", "business_admin", "platform_admin"],
  },
  {
    id: "analytics-overview",
    title: "Explore Analytics",
    description: "Dive into forecasting, anomaly detection, and variance trend analysis.",
    order: 8,
    page: "/analytics",
    prerequisite: "variance-review",
    roles: ["manager", "business_admin", "platform_admin", "accounting"],
  },
  {
    id: "inventory-overview",
    title: "Your Inventory Catalog",
    description: "Browse and manage all inventory items. Add items, set categories, and track bottle sizes and costs.",
    order: 2,
    page: "/inventory",
    prerequisite: "welcome-dashboard",
    roles: ["manager", "business_admin", "platform_admin"],
  },
  {
    id: "recipes-intro",
    title: "Recipe Mapping",
    description: "Map cocktails and multi-ingredient POS items to their recipe components for accurate depletion tracking.",
    order: 5,
    page: "/recipes",
    prerequisite: "pos-connection",
    roles: ["manager", "business_admin", "platform_admin"],
  },
  {
    id: "reports-intro",
    title: "Reports & Insights",
    description: "View variance, COGS, and shrinkage reports to understand where inventory is going.",
    order: 5,
    page: "/reports",
    prerequisite: "first-session",
    roles: ["manager", "business_admin", "platform_admin", "accounting"],
  },
  {
    id: "notifications-intro",
    title: "Notification Center",
    description: "Real-time alerts for variance thresholds, low stock, shrinkage patterns, and more are delivered here.",
    order: 6,
    page: "/notifications",
    roles: ["manager", "business_admin", "platform_admin"],
  },
  {
    id: "portfolio-intro",
    title: "Portfolio Overview",
    description: "Compare performance across all your locations — on-hand value, COGS, variance, and mapping coverage.",
    order: 7,
    page: "/portfolio",
    roles: ["business_admin", "platform_admin"],
  },
  {
    id: "receipts-intro",
    title: "Receipt Capture",
    description: "Capture vendor invoices to track receiving. Scan or upload receipts and auto-match line items to inventory.",
    order: 4,
    page: "/receipts",
    prerequisite: "inventory-setup",
    roles: ["manager", "business_admin", "platform_admin"],
  },
];
