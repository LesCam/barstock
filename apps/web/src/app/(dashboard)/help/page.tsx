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
    "receipt capture scan OCR Gemini camera photo auto-match alias barcode vendor SKU fuzzy confirm skipped items price history",
  "product-guide":
    "product guide menu public QR code image lookup barcode drag reorder categories catalog browse",
  "art-gallery":
    "art gallery artwork artist consignment agreement sale tracking status lifecycle QR label printing photo capture",
  "voice-commands":
    "voice commands mic button continuous listening weight input say weight session add item confirm retry shorthand numbers",
  "session-planning":
    "session planning assignment manager staff sub-area focus items accept decline auto-claim upcoming assignments",
  verification:
    "verification dual-count blind second count auto-flag variance threshold queue resolve original average close guard",
  notifications:
    "notifications real-time SSE delivery alert rules system events notification center dedup admin",
  portfolio:
    "portfolio analytics cross-location performance comparison on-hand value COGS variance pour cost mapping coverage trend",
  "usage-trends":
    "usage trends charts filter category item date range trend visualization over time",
  "scan-import":
    "barcode scanning import mobile web pairing bridge relay quick-create modal CSV bulk find image",
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
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Adaptive Learning</h4>
            <p>
              The system tracks implied ingredient ratios from each count session and uses an EWMA
              (exponentially weighted moving average) to auto-adjust recipe depletion ratios over
              time. Per-ingredient trend charts show how ratios evolve, improving accuracy without
              manual tuning.
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
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Session Planning</h4>
            <p>
              Managers can plan sessions ahead of time and assign staff to specific sub-areas with focus items.
              See <a href="/help#session-planning" className="text-[#E9B44C] hover:underline">Session Planning & Assignment</a> for
              details on the full planning and assignment workflow.
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
  {
    id: "draft-kegs",
    title: "Draft & Kegs",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          The Draft / Kegs page manages your tap lines and keg inventory lifecycle.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Tap Board</h4>
            <p>
              See which product is on each tap at a glance. Assign kegs to empty taps or swap out
              finished kegs. Tap assignments automatically update POS depletion routing.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Keg Lifecycle</h4>
            <p>
              Kegs move through four statuses: <strong>In Storage</strong> (received but not tapped),{" "}
              <strong>In Service</strong> (currently on a tap), <strong>Empty</strong> (kicked), and{" "}
              <strong>Returned</strong> (sent back to distributor). Receive new kegs with a product,
              size, and volume.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Keg Sizes</h4>
            <p>
              Standard sizes (half barrel, sixth barrel, etc.) are preconfigured. Each size defines a
              total volume used for tracking remaining beer.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "alerts",
    title: "Alerts & Monitoring",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          The alert system evaluates configurable rules against your data and generates
          notifications when thresholds are exceeded.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Rule Types</h4>
            <p>
              Available rules: variance percent, low stock, stale count days, keg near empty,
              login failures, large adjustment, shrinkage pattern, par reorder, and price anomaly.
              Enable or disable each rule and set custom thresholds in Settings.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Evaluation & Notifications</h4>
            <p>
              Rules are evaluated periodically and on demand. Triggered alerts are delivered via
              real-time notifications (see <a href="/help#notifications" className="text-[#E9B44C] hover:underline">Notifications</a>).
              The Alert Dashboard shows frequency charts and top triggered items.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "analytics",
    title: "Analytics & Forecasting",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Predictive analytics help you spot problems before they become costly.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Anomaly Detection</h4>
            <p>
              Usage anomalies are detected using z-score analysis against rolling averages. Spikes
              or drops more than 2 standard deviations from the mean are flagged. Day-of-week
              anomalies highlight unusual patterns on specific days.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Risk Scoring</h4>
            <p>
              Each location receives an overall risk score based on anomaly count, depletion
              mismatches, and variance forecast risk. Scores range from 0 (low) to 100 (critical).
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Demand Forecasting</h4>
            <p>
              The Forecast page projects daily usage using historical consumption with day-of-week
              weighting. Items show projected days to stockout, reorder dates, and forecast accuracy
              validated against actual counts.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "transfers",
    title: "Transfers & Receiving",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Stock movements are recorded as consumption events, feeding into the expected inventory
          model.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Stock Receiving</h4>
            <p>
              When inventory arrives from vendors, record it as a receiving event. This increases the
              predicted level for the item. Receiving can also be recorded through purchase order
              pickups.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Inter-Location Transfers</h4>
            <p>
              Move stock between sub-areas or locations. Transfers create paired consumption events
              — one negative (source) and one positive (destination) — keeping the ledger balanced.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "audit",
    title: "Audit & Accountability",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Every significant action in Barstock is logged to the audit trail for accountability and
          compliance.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Activity Log</h4>
            <p>
              The Audit Log page shows a filterable, paginated feed of all actions: logins,
              inventory changes, session events, settings updates, and more. Filter by actor, action
              type, object type, or date range. Export to CSV for external analysis.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Event Ledger</h4>
            <p>
              The consumption events ledger is append-only and immutable. Corrections are made by
              creating a reversal event followed by a replacement, preserving a complete history of
              all stock movements.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "orders",
    title: "Orders & Purchasing",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Create and track purchase orders from par-level reorder suggestions through to vendor
          fulfillment.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">PO Workflow</h4>
            <p>
              Generate orders from the Par Levels page when items fall below reorder thresholds.
              Orders track line items with ordered quantities, received quantities, and fulfillment
              progress. Copy the order as text to send to vendors.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Vendor Management</h4>
            <p>
              Track spend by vendor, view monthly purchasing trends, and see top ordered items. The
              Trends view shows total spend, order count, average fulfillment time, and vendor
              breakdowns over configurable time periods.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "benchmarking",
    title: "Benchmarking",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Compare your performance against industry averages with opt-in anonymized benchmarking.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Opt-In Comparisons</h4>
            <p>
              Enable benchmarking in Settings to contribute anonymized metrics and receive industry
              percentile rankings. Metrics include pour cost %, variance impact, mapping coverage,
              count frequency, and more. Your data is never shared individually.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Portfolio Metrics</h4>
            <p>
              Multi-location businesses can compare performance across their own locations in the My
              Locations table. See on-hand value, COGS, variance, pour cost, and mapping coverage
              side by side. The Trend view tracks your business vs. industry median over time.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "receipt-capture",
    title: "Receipt Capture",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Scan vendor receipts using your camera or upload a photo. Gemini OCR extracts line items
          automatically, then Barstock matches them to your inventory.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Auto-Matching</h4>
            <p>
              Each extracted line is matched using a cascade: vendor alias, barcode, vendor SKU, then
              fuzzy name matching. Matched items are pre-filled for quick confirmation. Unmatched items
              can be manually assigned or skipped.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Skipped Items</h4>
            <p>
              Items that couldn&apos;t be matched are marked as skipped. Managers can create new
              inventory items directly from skipped lines, or staff can request their creation.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Learning & Price History</h4>
            <p>
              Each confirmed match teaches the system — vendor aliases and barcode associations are
              saved for future receipts. Price history is tracked per item per vendor for cost
              trend analysis.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "product-guide",
    title: "Product Guide & Menu",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          The Product Guide is your internal catalog of items with images, descriptions, prices,
          and tasting notes. It also powers the public-facing menu.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Public Menu</h4>
            <p>
              Each location has a shareable public menu page. Customers scan a QR code (with your
              business logo embedded) to browse your offerings on their phone. Categories display
              as sticky pills with card layouts and thumbnails.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Image Lookup & Bulk Import</h4>
            <p>
              Use &quot;Find Image&quot; to search external databases by barcode and auto-import
              product photos. Bulk import lets you add multiple inventory items to the guide at
              once by selecting from your catalog.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Drag-to-Reorder</h4>
            <p>
              Reorder categories and items within a category by dragging. The sort order is
              reflected on the public menu.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "art-gallery",
    title: "Art Gallery",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Manage artwork displayed in your venue — track artists, consignment agreements, sales,
          and generate QR labels for customers.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Artwork Lifecycle</h4>
            <p>
              Each piece moves through statuses: on wall, reserved, sold, or removed. Status
              transitions are tracked with timestamps for a complete audit trail.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Artist Profiles</h4>
            <p>
              Create artist profiles with contact info, default commission percentages, payout
              method, and bio. Each artist&apos;s artworks are listed on their detail page.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">QR Labels & Photos</h4>
            <p>
              Print wall labels with QR codes that link to the artwork&apos;s public page. Upload
              up to 3 photos per piece. Labels include title, artist, medium, dimensions, and price.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "voice-commands",
    title: "Voice Commands",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Use voice input on mobile to speed up counting sessions and weight entry.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Continuous Listening</h4>
            <p>
              Long-press the mic button for continuous listening mode. Speak item names to add them
              to the current session. The system is session-aware and matches spoken names to your
              inventory.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Voice Weight Input</h4>
            <p>
              Tap &quot;Say Weight&quot; during manual entry to speak the weight value. Handles
              digits, decimals, compound words, and shorthand (e.g. &quot;seven twenty&quot; becomes
              720g). After capture, say &quot;submit&quot; to confirm or &quot;retry&quot; to
              re-record.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "session-planning",
    title: "Session Planning & Assignment",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Managers can plan counting sessions in advance and assign staff to specific areas.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Planning a Session</h4>
            <p>
              From the web dashboard, click &quot;Plan Session&quot; to schedule a future count. Assign
              staff members to sub-areas (e.g. Well, Back Bar, Walk-in Cooler) and optionally add
              focus items for each assignment.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Accept / Decline</h4>
            <p>
              Assigned staff see upcoming assignments on their mobile app. They can accept or decline
              each assignment. When they join the session, their assigned sub-area is auto-claimed.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Assignment Banners</h4>
            <p>
              During a session, a banner on the mobile screen shows the staff member&apos;s assigned
              area and focus items, keeping everyone aligned on what to count.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "verification",
    title: "Dual-Count Verification",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Dual-count verification adds a second layer of accuracy by having a different person
          recount flagged items without seeing the original count.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Flagging Items</h4>
            <p>
              Managers can manually flag any counted item for verification. You can also enable
              auto-flagging in Settings — items exceeding a configurable variance threshold are
              automatically flagged when previewing session close.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Blind Verification</h4>
            <p>
              The verification queue on mobile hides the original count from the verifier, ensuring
              an unbiased second count. The verifier enters their count independently.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Resolving & Close Guard</h4>
            <p>
              After verification, resolve each item as: use the original count, the verification
              count, or an average of both. Sessions cannot be closed while flagged or disputed
              items remain unresolved.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Notifications keep you informed of important events in real time.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Real-Time Delivery</h4>
            <p>
              Notifications are delivered instantly via Server-Sent Events (SSE). When an alert
              rule fires or a system event occurs, you see it immediately in the notification
              center without refreshing.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Notification Center</h4>
            <p>
              The Notifications page shows all notifications with rule-type badges, timestamps,
              and read/unread status. Click a notification to navigate to the relevant page. Use
              &quot;Mark All as Read&quot; to clear the unread indicator.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Deduplication</h4>
            <p>
              Duplicate notifications for the same event are suppressed within a 24-hour window
              to avoid alert fatigue.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "portfolio",
    title: "Portfolio Analytics",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          For multi-location businesses, Portfolio Analytics provides a cross-location performance
          overview from the dashboard.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Location Comparison</h4>
            <p>
              Compare key metrics across all your locations side by side: on-hand value, COGS,
              variance impact, pour cost percentage, and POS mapping coverage. Quickly identify
              which locations need attention.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Trend Analysis</h4>
            <p>
              Track your business performance vs. industry benchmarks over time. The trend view
              shows how your aggregate metrics compare to the industry median, helping you gauge
              overall operational health.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "usage-trends",
    title: "Usage Trends",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Usage Trends visualizes how your inventory is consumed over time.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Charts & Filters</h4>
            <p>
              View usage charts filtered by category or individual item. Select a date range to
              zoom into specific periods. Trend lines help you spot seasonal patterns, unusual
              spikes, or declining demand.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Actionable Insights</h4>
            <p>
              Use trend data to inform purchasing decisions, adjust par levels, and identify
              products that may need menu changes or promotions.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "scan-import",
    title: "Barcode Scanning & Import",
    content: (
      <div className="space-y-3 text-sm text-[#EAF0FF]/70">
        <p>
          Barcode scanning accelerates inventory management on both mobile and web.
        </p>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Mobile Scanning</h4>
            <p>
              Scan barcodes on the mobile app to quickly find items, add them to sessions, or
              create new inventory entries. The quick-create modal adapts its form based on the
              item&apos;s category type (weighable, unit count, or keg).
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Web Pairing Bridge</h4>
            <p>
              Pair your phone with the web dashboard for real-time barcode relay. Scan on mobile
              and the barcode appears instantly on the web interface — useful for data entry at
              a desktop while scanning at the shelf.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#EAF0FF]/90">Bulk CSV Import</h4>
            <p>
              Import inventory items in bulk via CSV upload. Map columns to fields, preview the
              import, and confirm. Use &quot;Find Image&quot; to auto-fetch product images by
              barcode after import.
            </p>
          </div>
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
