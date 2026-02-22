"use client";

import { useState, useEffect, useRef } from "react";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
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

const sections: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>Barstock tracks your bar inventory from bottle to glass. Here&apos;s the typical setup workflow:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li>
            <strong className="text-[#EAF0FF]/90">Add Inventory</strong> — Create items in your catalog with
            category, bottle size, and cost. Categories determine the counting method (weighable, unit count, or keg).
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Connect POS</strong> — Link your point-of-sale system so
            Barstock can pull sales data and calculate expected depletion.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Map POS Items</strong> — Match each POS menu item to its
            inventory item (direct mapping), tap (draft), or recipe (cocktails).
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Count Inventory</strong> — Start a session, weigh or count
            each item. Multiple staff can count simultaneously in different sub-areas.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Review Variance</strong> — Compare counted stock vs. expected
            levels. Investigate discrepancies and track shrinkage trends over time.
          </li>
        </ol>
      </div>
    ),
  },
  {
    id: "counting-methods",
    title: "Counting Methods",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>Each inventory category uses one of three counting methods:</p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Weighable</h4>
            <p>
              For open bottles of spirits, wine, etc. Place the bottle on a BLE scale, subtract the tare weight
              (empty bottle weight), and the remaining liquid is calculated using the product&apos;s density
              (g/mL). Each category can set a default density.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Unit Count</h4>
            <p>
              For sealed bottles, cans, and packaged items. Simply enter the quantity on hand. Best for items
              sold by the unit (e.g. bottled beer, canned soda).
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Keg</h4>
            <p>
              For draft systems. Kegs are tracked via tap flow meters or manual percentage estimates. Connected
              taps report real-time depletion.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "pos-mapping",
    title: "POS Mapping",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          POS mapping connects your point-of-sale menu items to your inventory so that each sale automatically
          depletes the correct products. Without mapping, Barstock can&apos;t calculate expected usage.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Direct Mapping</h4>
            <p>
              One POS item maps to one inventory item with a fixed pour size. Best for simple items like
              &quot;Jameson 1oz&quot; or bottled beer.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Draft by Tap</h4>
            <p>
              Maps a POS item to a specific tap. When the keg on that tap changes, depletion automatically
              follows the new product.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Recipe Mapping</h4>
            <p>
              Maps a POS item to a recipe (e.g. &quot;Margarita&quot;), which depletes multiple ingredients at
              once — tequila, triple sec, lime juice, etc.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "recipes",
    title: "Recipes & Split Ratios",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Recipes define multi-ingredient drinks for accurate depletion. When a cocktail is sold, each
          ingredient is depleted by its specified quantity.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Creating Recipes</h4>
            <p>
              Add a recipe name, then list each ingredient with its quantity and unit. For example, a Margarita
              might use 2oz tequila, 1oz triple sec, and 1oz lime juice.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Split Ratios</h4>
            <p>
              For ambiguous POS buttons like &quot;Rail Tequila Shot&quot; that could be multiple products, use
              a recipe with fractional quantities. Example: 60% silver tequila + 40% gold tequila distributes
              depletion proportionally based on actual usage patterns.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "variance",
    title: "Variance & Shrinkage",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Variance is the difference between expected inventory (based on sales data) and actual counted stock.
          Persistent negative variance indicates shrinkage — product loss from over-pouring, theft, waste, or
          unrecorded use.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Variance Reasons</h4>
            <p>
              When closing a session with significant variance, you&apos;ll be prompted to provide a reason for
              each flagged item: spillage, breakage, staff consumption, theft, or other. This builds an audit
              trail.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Shrinkage Detection</h4>
            <p>
              Barstock tracks variance patterns over time. Items that consistently show negative variance are
              flagged as shrinkage suspects on the dashboard. Worsening trends trigger alerts.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "sessions",
    title: "Counting Sessions",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          A session is a single counting event — typically done daily, weekly, or as needed. Sessions capture
          every item counted and calculate variance against expected levels.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Multi-User Counting</h4>
            <p>
              Multiple staff can join the same session and count simultaneously. Each person works in their
              assigned sub-area (e.g. &quot;Well&quot;, &quot;Back Bar&quot;, &quot;Walk-in Cooler&quot;).
              Participant badges show who&apos;s active and where.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Closing & Verification</h4>
            <p>
              When closing a session, the system checks for items with significant variance. You must provide
              variance reasons for flagged items before the session can be finalized. Closed sessions become
              part of the permanent audit trail.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "par-levels",
    title: "Par Levels & Reorder",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Par levels define how much of each product you want to keep on hand. When stock drops below the
          minimum, Barstock flags it for reorder.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Par & Min Levels</h4>
            <p>
              <strong>Par</strong> is your ideal stocking level. <strong>Min</strong> is the threshold that
              triggers a reorder alert. Set these based on your typical usage and delivery schedule.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Auto-Suggest</h4>
            <p>
              Barstock can suggest par levels based on your historical usage data. Review and adjust these
              suggestions to match your needs.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Lead Time & Safety Stock</h4>
            <p>
              Account for supplier delivery times by setting lead time. Safety stock adds a buffer to ensure
              you don&apos;t run out while waiting for deliveries.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "expected-inventory",
    title: "Expected Inventory",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Expected inventory predicts your current stock levels between counts using the formula:
        </p>
        <p className="rounded bg-[#0B1623] px-3 py-2 font-mono text-xs text-[#E9B44C]">
          Predicted Level = Last Count + Net Signed Change
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Data Sources</h4>
            <p>
              Net change includes POS sales (negative), tap flow (negative), receiving (positive), transfers
              (positive or negative), and manual adjustments. All sourced from the consumption events ledger.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Confidence Scoring</h4>
            <p>
              <strong>High</strong>: counted within 3 days with depletion data.{" "}
              <strong>Medium</strong>: counted within 7 days, or within 14 days with receiving data.{" "}
              <strong>Low</strong>: stale count or negative predicted stock.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Days to Stockout</h4>
            <p>
              Estimated days until you run out, based on average daily usage. Helps prioritize reorders and
              flag items needing attention.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "reports",
    title: "Reports",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>Barstock provides several report types accessible from the Reports page:</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <strong className="text-[#EAF0FF]/90">COGS</strong> — Cost of goods sold over a date range, broken
            down by category.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Usage</strong> — Product consumption over time, useful for
            spotting trends and seasonal patterns.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Variance</strong> — Detailed variance analysis by item,
            session, or time period.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Variance Patterns</strong> — Identifies items with
            persistent or worsening variance trends.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Staff Accountability</strong> — Session performance by
            counter, including items counted and variance attribution.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Recipe Analytics</strong> — Recipe usage and ingredient
            depletion breakdown.
          </li>
          <li>
            <strong className="text-[#EAF0FF]/90">Pour Cost</strong> — Revenue vs. cost analysis to track
            profitability by product.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "settings-roles",
    title: "Settings & Roles",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <div>
          <h4 className="font-medium text-[#EAF0FF]/90">Role Hierarchy</h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <strong className="text-[#EAF0FF]/90">Staff</strong> — Can count inventory and view assigned sessions.
            </li>
            <li>
              <strong className="text-[#EAF0FF]/90">Manager</strong> — Can manage inventory, tare weights,
              recipes, POS mappings, and close sessions.
            </li>
            <li>
              <strong className="text-[#EAF0FF]/90">Business Admin</strong> — Full access to all features
              including settings, staff management, and reports.
            </li>
            <li>
              <strong className="text-[#EAF0FF]/90">Platform Admin</strong> — System-level access across all
              businesses.
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-[#EAF0FF]/90">Key Settings</h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <strong className="text-[#EAF0FF]/90">Categories</strong> — Custom inventory categories with counting
              method (weighable, unit count, keg) and default density for weighable items.
            </li>
            <li>
              <strong className="text-[#EAF0FF]/90">Locations</strong> — Multi-location support with per-location
              staff assignments and inventory.
            </li>
            <li>
              <strong className="text-[#EAF0FF]/90">Auto-Lock</strong> — Configure mobile app lock timeout, PIN,
              and biometric settings.
            </li>
          </ul>
        </div>
      </div>
    ),
  },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setOpenSections(new Set([hash]));
      requestAnimationFrame(() => {
        sectionRefs.current[hash]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

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
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#EAF0FF]">Help Center</h1>
      <p className="mb-6 text-sm text-[#EAF0FF]/60">
        Reference guide for Barstock concepts and features.
      </p>

      <input
        type="text"
        placeholder="Search help topics..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-6 w-full rounded-lg border border-white/10 bg-[#0B1623] px-4 py-2.5 text-sm text-[#EAF0FF] placeholder-[#EAF0FF]/30 focus:border-[#E9B44C]/50 focus:outline-none"
      />

      <div className="space-y-3">
        {filteredSections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <div
              key={section.id}
              id={section.id}
              ref={(el) => { sectionRefs.current[section.id] = el; }}
              className="rounded-lg border border-white/10 bg-[#16283F]"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-base font-semibold text-[#EAF0FF]">{section.title}</span>
                <span className="text-sm text-[#EAF0FF]/40">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && <div className="border-t border-white/10 px-5 py-4">{section.content}</div>}
            </div>
          );
        })}

        {filteredSections.length === 0 && (
          <p className="py-8 text-center text-sm text-[#EAF0FF]/40">
            No help topics match &quot;{search}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
