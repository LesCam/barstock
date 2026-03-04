import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useHelpProgress } from "@/lib/use-help-progress";

type Role = "staff" | "manager" | "business_admin" | "platform_admin" | "curator" | "accounting";

const ROLE_HIERARCHY: Record<Role, number> = {
  staff: 0,
  curator: 1,
  accounting: 1,
  manager: 2,
  business_admin: 3,
  platform_admin: 4,
};

function hasAccess(userRole: Role | undefined, sectionRoles?: Role[]): boolean {
  if (!sectionRoles) return true;
  if (!userRole) return true;
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  return sectionRoles.some((r) => {
    if (r === userRole) return true;
    return ROLE_HIERARCHY[r] !== undefined && userLevel >= ROLE_HIERARCHY[r];
  });
}

const SECTION_ROLES: Record<string, Role[]> = {
  "getting-started": ["staff", "manager", "business_admin", "platform_admin", "curator", "accounting"],
  "counting-methods": ["staff", "manager", "business_admin", "platform_admin"],
  "pos-mapping": ["manager", "business_admin", "platform_admin"],
  recipes: ["manager", "business_admin", "platform_admin"],
  variance: ["staff", "manager", "business_admin", "platform_admin"],
  sessions: ["staff", "manager", "business_admin", "platform_admin"],
  "par-levels": ["manager", "business_admin", "platform_admin"],
  "expected-inventory": ["manager", "business_admin", "platform_admin"],
  reports: ["manager", "business_admin", "platform_admin", "accounting"],
  "settings-roles": ["manager", "business_admin", "platform_admin"],
  "draft-kegs": ["staff", "manager", "business_admin", "platform_admin"],
  alerts: ["manager", "business_admin", "platform_admin"],
  analytics: ["manager", "business_admin", "platform_admin", "accounting"],
  transfers: ["staff", "manager", "business_admin", "platform_admin"],
  audit: ["manager", "business_admin", "platform_admin", "accounting"],
  orders: ["manager", "business_admin", "platform_admin", "accounting"],
  benchmarking: ["business_admin", "platform_admin"],
  "receipt-capture": ["manager", "business_admin", "platform_admin"],
  "product-guide": ["staff", "manager", "business_admin", "platform_admin", "curator", "accounting"],
  "art-gallery": ["curator", "manager", "business_admin", "platform_admin"],
  "voice-commands": ["staff", "manager", "business_admin", "platform_admin"],
  "session-planning": ["manager", "business_admin", "platform_admin"],
  verification: ["staff", "manager", "business_admin", "platform_admin"],
  notifications: ["staff", "manager", "business_admin", "platform_admin"],
  portfolio: ["business_admin", "platform_admin"],
  "usage-trends": ["manager", "business_admin", "platform_admin"],
  "scan-import": ["staff", "manager", "business_admin", "platform_admin"],
};

interface HelpSection {
  id: string;
  title: string;
  content: { heading?: string; text: string }[];
}

const SECTION_SEARCH_TEXT: Record<string, string> = {
  "getting-started":
    "getting started workflow add inventory connect POS map items count review variance setup onboarding",
  "counting-methods":
    "counting methods weighable BLE scale tare weight density unit count bottles cans keg draft tap flow",
  "pos-mapping":
    "POS mapping point of sale direct packaged unit draft tap recipe mapping depletion sales",
  recipes:
    "recipes cocktails multi-ingredient split ratios ambiguous POS items fractional quantities depletion",
  variance:
    "variance shrinkage over-pour theft waste loss breakage spillage trend detection patterns reasons",
  sessions:
    "sessions counting inventory multi-user participants sub-areas close verification variance reasons",
  "par-levels":
    "par levels reorder min auto-suggest alerts lead time safety stock ordering",
  "expected-inventory":
    "expected inventory predicted level last count net change confidence scoring days stockout sources",
  reports:
    "reports COGS usage variance patterns staff accountability recipe analytics pour cost",
  "settings-roles":
    "settings roles staff manager business admin platform admin permissions categories locations",
  "draft-kegs":
    "draft kegs tap lines keg tracking keg sizes storage tapped empty returned tap board beer",
  alerts:
    "alerts monitoring rules variance low stock stale count keg near empty shrinkage pattern evaluation notifications",
  analytics:
    "analytics forecasting anomaly detection risk scoring z-score POS depletion ratios variance forecast trend",
  transfers:
    "transfers receiving stock incoming inter-location movement consumption events ledger",
  audit:
    "audit accountability activity log event ledger action types actors timeline CSV export",
  orders:
    "orders purchasing purchase order PO vendor management fulfillment pickup trends spend",
  benchmarking:
    "benchmarking industry comparison portfolio metrics opt-in anonymized pour cost snapshot trend",
  "receipt-capture":
    "receipt capture scan OCR Gemini camera photo upload JPEG PNG PDF auto-match alias barcode vendor SKU fuzzy confirm skipped items price history field mapping purchase order PO link error handling",
  "product-guide":
    "product guide menu public QR code image lookup find image barcode drag reorder categories catalog browse pricing bulk import quick-create scan tasting notes labels print",
  "usage-trends":
    "usage trends charts filter category item date range trend visualization over time breakdown export CSV forecast seasonality day-of-week stacked consumption",
};

const sections: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: [
      {
        text: "Barstock tracks your bar inventory from bottle to glass. Here's the typical setup workflow:",
      },
      {
        heading: "1. Add Inventory",
        text: "Create items in your catalog with category, bottle size, and cost. Categories determine the counting method (weighable, unit count, or keg).",
      },
      {
        heading: "2. Connect POS",
        text: "Link your point-of-sale system so Barstock can pull sales data and calculate expected depletion.",
      },
      {
        heading: "3. Map POS Items",
        text: "Match each POS menu item to its inventory item (direct mapping), tap (draft), or recipe (cocktails).",
      },
      {
        heading: "4. Count Inventory",
        text: "Start a session, weigh or count each item. Multiple staff can count simultaneously in different sub-areas.",
      },
      {
        heading: "5. Review Variance",
        text: "Compare counted stock vs. expected levels. Investigate discrepancies and track shrinkage trends over time.",
      },
    ],
  },
  {
    id: "counting-methods",
    title: "Counting Methods",
    content: [
      {
        text: "Each inventory category uses one of three counting methods:",
      },
      {
        heading: "Weighable",
        text: "For open bottles of spirits, wine, etc. Place the bottle on a BLE scale, subtract the tare weight (empty bottle weight), and the remaining liquid is calculated using the product's density (g/mL). Each category can set a default density.",
      },
      {
        heading: "Unit Count",
        text: "For sealed bottles, cans, and packaged items. Simply enter the quantity on hand. Best for items sold by the unit (e.g. bottled beer, canned soda).",
      },
      {
        heading: "Keg",
        text: "For draft systems. Kegs are tracked via tap flow meters or manual percentage estimates. Connected taps report real-time depletion.",
      },
    ],
  },
  {
    id: "pos-mapping",
    title: "POS Mapping",
    content: [
      {
        text: "POS mapping connects your point-of-sale menu items to your inventory so that each sale automatically depletes the correct products. Without mapping, Barstock can't calculate expected usage.",
      },
      {
        heading: "Direct Mapping",
        text: 'One POS item maps to one inventory item with a fixed pour size. Best for simple items like "Jameson 1oz" or bottled beer.',
      },
      {
        heading: "Draft by Tap",
        text: "Maps a POS item to a specific tap. When the keg on that tap changes, depletion automatically follows the new product.",
      },
      {
        heading: "Recipe Mapping",
        text: 'Maps a POS item to a recipe (e.g. "Margarita"), which depletes multiple ingredients at once — tequila, triple sec, lime juice, etc.',
      },
    ],
  },
  {
    id: "recipes",
    title: "Recipes & Split Ratios",
    content: [
      {
        text: "Recipes define multi-ingredient drinks for accurate depletion. When a cocktail is sold, each ingredient is depleted by its specified quantity.",
      },
      {
        heading: "Creating Recipes",
        text: "Add a recipe name, then list each ingredient with its quantity and unit. For example, a Margarita might use 2oz tequila, 1oz triple sec, and 1oz lime juice.",
      },
      {
        heading: "Split Ratios",
        text: 'For ambiguous POS buttons like "Rail Tequila Shot" that could be multiple products, use a recipe with fractional quantities. Example: 60% silver tequila + 40% gold tequila distributes depletion proportionally based on actual usage patterns.',
      },
    ],
  },
  {
    id: "variance",
    title: "Variance & Shrinkage",
    content: [
      {
        text: "Variance is the difference between expected inventory (based on sales data) and actual counted stock. Persistent negative variance indicates shrinkage — product loss from over-pouring, theft, waste, or unrecorded use.",
      },
      {
        heading: "Variance Reasons",
        text: "When closing a session with significant variance, you'll be prompted to provide a reason for each flagged item: spillage, breakage, staff consumption, theft, or other. This builds an audit trail.",
      },
      {
        heading: "Shrinkage Detection",
        text: "Barstock tracks variance patterns over time. Items that consistently show negative variance are flagged as shrinkage suspects on the dashboard. Worsening trends trigger alerts.",
      },
    ],
  },
  {
    id: "sessions",
    title: "Counting Sessions",
    content: [
      {
        text: "A session is a single counting event — typically done daily, weekly, or as needed. Sessions capture every item counted and calculate variance against expected levels.",
      },
      {
        heading: "Multi-User Counting",
        text: 'Multiple staff can join the same session and count simultaneously. Each person works in their assigned sub-area (e.g. "Well", "Back Bar", "Walk-in Cooler"). Participant badges show who\'s active and where.',
      },
      {
        heading: "Closing & Verification",
        text: "When closing a session, the system checks for items with significant variance. You must provide variance reasons for flagged items before the session can be finalized. Closed sessions become part of the permanent audit trail.",
      },
    ],
  },
  {
    id: "par-levels",
    title: "Par Levels & Reorder",
    content: [
      {
        text: "Par levels define how much of each product you want to keep on hand. When stock drops below the minimum, Barstock flags it for reorder.",
      },
      {
        heading: "Par & Min Levels",
        text: "Par is your ideal stocking level. Min is the threshold that triggers a reorder alert. Set these based on your typical usage and delivery schedule.",
      },
      {
        heading: "Auto-Suggest",
        text: "Barstock can suggest par levels based on your historical usage data. Review and adjust these suggestions to match your needs.",
      },
      {
        heading: "Lead Time & Safety Stock",
        text: "Account for supplier delivery times by setting lead time. Safety stock adds a buffer to ensure you don't run out while waiting for deliveries.",
      },
    ],
  },
  {
    id: "expected-inventory",
    title: "Expected Inventory",
    content: [
      {
        text: "Expected inventory predicts your current stock levels between counts using the formula:",
      },
      {
        heading: "Predicted Level = Last Count + Net Signed Change",
        text: "",
      },
      {
        heading: "Data Sources",
        text: "Net change includes POS sales (negative), tap flow (negative), receiving (positive), transfers (positive or negative), and manual adjustments. All sourced from the consumption events ledger.",
      },
      {
        heading: "Confidence Scoring",
        text: "High: counted within 3 days with depletion data. Medium: counted within 7 days, or within 14 days with receiving data. Low: stale count or negative predicted stock.",
      },
      {
        heading: "Days to Stockout",
        text: "Estimated days until you run out, based on average daily usage. Helps prioritize reorders and flag items needing attention.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    content: [
      {
        text: "Barstock provides several report types accessible from the Reports page:",
      },
      {
        heading: "COGS",
        text: "Cost of goods sold over a date range, broken down by category.",
      },
      {
        heading: "Usage",
        text: "Product consumption over time, useful for spotting trends and seasonal patterns.",
      },
      {
        heading: "Variance",
        text: "Detailed variance analysis by item, session, or time period.",
      },
      {
        heading: "Variance Patterns",
        text: "Identifies items with persistent or worsening variance trends.",
      },
      {
        heading: "Staff Accountability",
        text: "Session performance by counter, including items counted and variance attribution.",
      },
      {
        heading: "Recipe Analytics",
        text: "Recipe usage and ingredient depletion breakdown.",
      },
      {
        heading: "Pour Cost",
        text: "Revenue vs. cost analysis to track profitability by product.",
      },
    ],
  },
  {
    id: "settings-roles",
    title: "Settings & Roles",
    content: [
      {
        heading: "Role Hierarchy",
        text: "",
      },
      {
        heading: "Staff",
        text: "Can count inventory and view assigned sessions.",
      },
      {
        heading: "Manager",
        text: "Can manage inventory, tare weights, recipes, POS mappings, and close sessions.",
      },
      {
        heading: "Business Admin",
        text: "Full access to all features including settings, staff management, and reports.",
      },
      {
        heading: "Platform Admin",
        text: "System-level access across all businesses.",
      },
      {
        heading: "Key Settings",
        text: "",
      },
      {
        heading: "Categories",
        text: "Custom inventory categories with counting method (weighable, unit count, keg) and default density for weighable items.",
      },
      {
        heading: "Locations",
        text: "Multi-location support with per-location staff assignments and inventory.",
      },
      {
        heading: "Auto-Lock",
        text: "Configure mobile app lock timeout, PIN, and biometric settings.",
      },
    ],
  },
  {
    id: "draft-kegs",
    title: "Draft & Kegs",
    content: [
      {
        text: "The Draft / Kegs page manages your tap lines and keg inventory lifecycle.",
      },
      {
        heading: "Tap Board",
        text: "See which product is on each tap at a glance. Assign kegs to empty taps or swap out finished kegs. Tap assignments automatically update POS depletion routing.",
      },
      {
        heading: "Keg Lifecycle",
        text: "Kegs move through four statuses: In Storage (received but not tapped), In Service (currently on a tap), Empty (kicked), and Returned (sent back to distributor). Receive new kegs with a product, size, and volume.",
      },
      {
        heading: "Keg Sizes",
        text: "Standard sizes (half barrel, sixth barrel, etc.) are preconfigured. Each size defines a total volume used for tracking remaining beer.",
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts & Monitoring",
    content: [
      {
        text: "The alert system evaluates configurable rules against your data and generates notifications when thresholds are exceeded.",
      },
      {
        heading: "Rule Types",
        text: "Available rules: variance percent, low stock, stale count days, keg near empty, login failures, large adjustment, shrinkage pattern, and par reorder. Enable or disable each rule and set custom thresholds in Settings.",
      },
      {
        heading: "Evaluation & Notifications",
        text: "Rules are evaluated periodically and on demand. Triggered alerts appear as notifications on the dashboard and in the alert history. The Alert Dashboard shows frequency charts and top triggered items.",
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics & Forecasting",
    content: [
      {
        text: "Predictive analytics help you spot problems before they become costly.",
      },
      {
        heading: "Anomaly Detection",
        text: "Usage anomalies are detected using z-score analysis against rolling averages. Spikes or drops more than 2 standard deviations from the mean are flagged. Day-of-week anomalies highlight unusual patterns on specific days.",
      },
      {
        heading: "Risk Scoring",
        text: "Each location receives an overall risk score based on anomaly count, depletion mismatches, and variance forecast risk. Scores range from 0 (low) to 100 (critical).",
      },
      {
        heading: "Demand Forecasting",
        text: "The Forecast page projects daily usage using historical consumption with day-of-week weighting. Items show projected days to stockout, reorder dates, and forecast accuracy validated against actual counts.",
      },
    ],
  },
  {
    id: "transfers",
    title: "Transfers & Receiving",
    content: [
      {
        text: "Stock movements are recorded as consumption events, feeding into the expected inventory model.",
      },
      {
        heading: "Stock Receiving",
        text: "When inventory arrives from vendors, record it as a receiving event. This increases the predicted level for the item. Receiving can also be recorded through purchase order pickups.",
      },
      {
        heading: "Inter-Location Transfers",
        text: "Move stock between sub-areas or locations. Transfers create paired consumption events — one negative (source) and one positive (destination) — keeping the ledger balanced.",
      },
    ],
  },
  {
    id: "audit",
    title: "Audit & Accountability",
    content: [
      {
        text: "Every significant action in Barstock is logged to the audit trail for accountability and compliance.",
      },
      {
        heading: "Activity Log",
        text: "The Audit Log page shows a filterable, paginated feed of all actions: logins, inventory changes, session events, settings updates, and more. Filter by actor, action type, object type, or date range. Export to CSV for external analysis.",
      },
      {
        heading: "Event Ledger",
        text: "The consumption events ledger is append-only and immutable. Corrections are made by creating a reversal event followed by a replacement, preserving a complete history of all stock movements.",
      },
    ],
  },
  {
    id: "orders",
    title: "Orders & Purchasing",
    content: [
      {
        text: "Create and track purchase orders from par-level reorder suggestions through to vendor fulfillment.",
      },
      {
        heading: "PO Workflow",
        text: "Generate orders from the Par Levels page when items fall below reorder thresholds. Orders track line items with ordered quantities, received quantities, and fulfillment progress. Copy the order as text to send to vendors.",
      },
      {
        heading: "Vendor Management",
        text: "Track spend by vendor, view monthly purchasing trends, and see top ordered items. The Trends view shows total spend, order count, average fulfillment time, and vendor breakdowns over configurable time periods.",
      },
    ],
  },
  {
    id: "benchmarking",
    title: "Benchmarking",
    content: [
      {
        text: "Compare your performance against industry averages with opt-in anonymized benchmarking.",
      },
      {
        heading: "Opt-In Comparisons",
        text: "Enable benchmarking in Settings to contribute anonymized metrics and receive industry percentile rankings. Metrics include pour cost %, variance impact, mapping coverage, count frequency, and more. Your data is never shared individually.",
      },
      {
        heading: "Portfolio Metrics",
        text: "Multi-location businesses can compare performance across their own locations in the My Locations table. See on-hand value, COGS, variance, pour cost, and mapping coverage side by side. The Trend view tracks your business vs. industry median over time.",
      },
    ],
  },
  {
    id: "receipt-capture",
    title: "Receipt Capture",
    content: [
      {
        text: "Scan vendor receipts using your camera or upload a photo. Gemini OCR extracts line items automatically, then Barstock matches them to your inventory.",
      },
      {
        heading: "Upload Workflow",
        text: "Navigate to Receipts and tap + New Receipt. Snap a photo with your camera or upload an image (JPEG, PNG, or PDF). The OCR engine extracts vendor name, date, line items, quantities, and prices. Review the parsed results, correct any misreads, then confirm to create receiving events.",
      },
      {
        heading: "Supported Formats",
        text: "JPEG and PNG images work best — ensure receipts are well-lit and flat. PDF invoices are also supported. Handwritten or thermal-faded receipts may need manual correction after OCR.",
      },
      {
        heading: "Auto-Matching",
        text: "Each extracted line is matched using a cascade: vendor alias, barcode, vendor SKU, then fuzzy name matching. Matched items are pre-filled for quick confirmation. Unmatched items can be manually assigned or skipped.",
      },
      {
        heading: "Field Mapping",
        text: "The OCR extracts product name, quantity, unit price, and total per line. If fields are mis-parsed, you can manually reassign them before confirming. The system learns from your corrections for that vendor's format.",
      },
      {
        heading: "Linking to Purchase Orders",
        text: "If you have an open purchase order for the vendor, the receipt can be matched against it. Received quantities update the PO fulfillment status, and any discrepancies are flagged for review.",
      },
      {
        heading: "Skipped Items",
        text: "Items that couldn't be matched are marked as skipped. Managers can create new inventory items directly from skipped lines.",
      },
      {
        heading: "Learning & Price History",
        text: "Each confirmed match teaches the system — vendor aliases and barcode associations are saved for future receipts. Price history is tracked per item per vendor for cost trend analysis.",
      },
      {
        heading: "Error Handling",
        text: "If OCR fails or returns no results, you'll be prompted to retake the photo or enter items manually. Partially parsed receipts show a warning — review flagged lines before confirming.",
      },
    ],
  },
  {
    id: "product-guide",
    title: "Product Guide & Menu",
    content: [
      {
        text: "The Product Guide is your internal catalog of items with images, descriptions, prices, and tasting notes. It also powers the public-facing menu.",
      },
      {
        heading: "Managing Items",
        text: "Add items to the guide from your inventory catalog. Each guide entry can include a display name, description, tasting notes, price, and photo. Items are organized by category and displayed in custom sort order.",
      },
      {
        heading: "Image Management",
        text: "Upload product photos directly or use Find Image to search external databases by barcode — matching images are auto-imported. On mobile, tap Find Image on the item detail screen.",
      },
      {
        heading: "Pricing",
        text: "Set display prices per item. Prices show on the public menu and internal guide. Price changes are tracked so you can review pricing history over time.",
      },
      {
        heading: "Bulk Operations",
        text: "Use Bulk Import to add multiple inventory items to the guide at once — select items from your catalog and they're added with default information.",
      },
      {
        heading: "Drag-to-Reorder",
        text: "Reorder categories and items within a category by dragging on the web. The sort order is reflected on the public menu.",
      },
      {
        heading: "Public Menu",
        text: "Each location has a shareable public menu page. Customers scan a QR code (with your business logo embedded) to browse your offerings. Categories display as sticky pills with card layouts and thumbnails.",
      },
      {
        heading: "QR Codes",
        text: "Generate and print QR codes from the web (Print Labels) or mobile (QR tab). QR codes include your business logo overlay and use high error correction so they scan reliably.",
      },
      {
        heading: "Quick-Create from Scan",
        text: "On mobile, scanning a barcode that isn't in your catalog opens the quick-create modal. Select a category, enter basic details, and the item is added to both inventory and the guide in one step.",
      },
    ],
  },
  {
    id: "usage-trends",
    title: "Usage Trends",
    content: [
      {
        text: "Usage Trends visualizes how your inventory is consumed over time, helping you spot patterns and make data-driven purchasing decisions.",
      },
      {
        heading: "Chart Interpretation",
        text: "The main chart shows daily or weekly consumption units over your selected date range. Look for consistent patterns (e.g. higher weekend usage), sudden spikes (possible over-pouring), or declining trends (items losing popularity).",
      },
      {
        heading: "Filtering & Date Range",
        text: "Filter by category to compare usage across product types. Drill into a single item to see its individual trend. Adjust the date range picker to zoom in on a specific week or expand to a full quarter. The default view shows the last 30 days.",
      },
      {
        heading: "Category Breakdown",
        text: "The category breakdown view shows a stacked chart with each category's contribution to total usage. This helps identify which product groups drive the most volume and how the mix changes over time.",
      },
      {
        heading: "Export",
        text: "Export usage data as CSV for further analysis. The export includes item name, category, date, quantity, and source (POS, manual adjustment, etc.). Exports are logged in the audit trail.",
      },
      {
        heading: "Relationship to Forecast",
        text: "Usage trends feed directly into the Forecast engine. Historical consumption patterns — including day-of-week seasonality — are used to project future demand and calculate days-to-stockout.",
      },
    ],
  },
];

export default function HelpScreen() {
  const { user } = useAuth();
  const userRole = user?.highestRole as Role | undefined;
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const { visitedSections, percentComplete, markVisited } = useHelpProgress(sections.length);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        markVisited(id);
      }
      return next;
    });
  };

  const roleFiltered = showAll
    ? sections
    : sections.filter((s) => hasAccess(userRole, SECTION_ROLES[s.id]));

  const filteredSections = search.trim()
    ? roleFiltered.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          (SECTION_SEARCH_TEXT[s.id] ?? "").toLowerCase().includes(q)
        );
      })
    : roleFiltered;

  const hiddenCount = sections.length - roleFiltered.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        Reference guide for Barstock concepts and features.
      </Text>

      {/* Progress bar */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>
            {visitedSections.size}/{sections.length} sections explored
          </Text>
          <Text style={styles.progressPercent}>{percentComplete}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percentComplete}%` }]} />
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { flex: 1, marginBottom: 0 }]}
          placeholder="Search help topics..."
          placeholderTextColor="rgba(234, 240, 255, 0.3)"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {hiddenCount > 0 && (
          <TouchableOpacity
            style={styles.showAllBtn}
            onPress={() => setShowAll(!showAll)}
          >
            <Text style={styles.showAllText}>
              {showAll ? "Relevant" : `All (${sections.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {filteredSections.map((section) => {
        const isOpen = openSections.has(section.id);
        return (
          <View key={section.id} style={styles.card}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => toggleSection(section.id)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <Text style={styles.cardTitle}>{section.title}</Text>
                {visitedSections.has(section.id) && (
                  <Text style={{ color: "#16a34a", fontSize: 12 }}>✓</Text>
                )}
              </View>
              <Text style={styles.expandIcon}>{isOpen ? "−" : "+"}</Text>
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.cardBody}>
                {section.content.map((block, i) => (
                  <View key={i} style={i > 0 ? styles.blockSpacing : undefined}>
                    {block.heading ? (
                      <Text style={styles.blockHeading}>{block.heading}</Text>
                    ) : null}
                    {block.text ? (
                      <Text style={styles.blockText}>{block.text}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {filteredSections.length === 0 && (
        <Text style={styles.emptyText}>
          No help topics match "{search}".
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 32 },
  subtitle: {
    fontSize: 13,
    color: "rgba(234, 240, 255, 0.5)",
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: "#0B1623",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#EAF0FF",
    marginBottom: 16,
  },
  showAllBtn: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  showAllText: {
    fontSize: 11,
    color: "rgba(234, 240, 255, 0.6)",
  },
  card: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAF0FF",
  },
  expandIcon: {
    fontSize: 16,
    color: "rgba(234, 240, 255, 0.4)",
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  blockSpacing: {
    marginTop: 10,
  },
  blockHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(234, 240, 255, 0.9)",
    marginBottom: 2,
  },
  blockText: {
    fontSize: 13,
    color: "rgba(234, 240, 255, 0.6)",
    lineHeight: 19,
  },
  emptyText: {
    textAlign: "center",
    color: "rgba(234, 240, 255, 0.4)",
    fontSize: 14,
    marginTop: 32,
  },
  progressCard: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3550",
    padding: 12,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: "rgba(234, 240, 255, 0.6)",
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: "600",
    color: "#E9B44C",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0B1623",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E9B44C",
  },
});
