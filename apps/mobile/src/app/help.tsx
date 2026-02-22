import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";

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
];

export default function HelpScreen() {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredSections = search.trim()
    ? sections.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          (SECTION_SEARCH_TEXT[s.id] ?? "").toLowerCase().includes(q)
        );
      })
    : sections;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        Reference guide for Barstock concepts and features.
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search help topics..."
        placeholderTextColor="rgba(234, 240, 255, 0.3)"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {filteredSections.map((section) => {
        const isOpen = openSections.has(section.id);
        return (
          <View key={section.id} style={styles.card}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => toggleSection(section.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.cardTitle}>{section.title}</Text>
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
});
