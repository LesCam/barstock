# Barstock — Beverage Inventory Platform

## What It Is

Barstock is a real-time inventory tracking platform built for bars and restaurants. It replaces clipboard counts and spreadsheet guesswork with Bluetooth scale integration, multi-user counting sessions, POS-driven depletion, and variance analytics — all on a dark, low-light-friendly interface designed for bar environments.

---

## Target Audience

- **Bar managers**: Inventory oversight, variance investigation, shrinkage detection
- **Bartenders & staff**: Mobile-first counting during shifts
- **General managers**: Multi-location dashboard, KPI tracking
- **Venue owners**: Portfolio reporting, benchmarking, COGS control
- **Accountants**: Audit trails, cost reports

**Venues**: Full-service bars, nightclubs, restaurants with bars, breweries, wine bars, hotels

---

## Core Features

### Inventory Counting Sessions
- Multi-user real-time counting — staff count simultaneously with live activity feeds
- Three counting methods: **packaged units** (bottles/cans), **weight-based** (Bluetooth scales for pour bottles), **draft/kegs** (tap tracking)
- Barcode scanning for instant item lookup
- Smart sorting (priority-based or A-Z), quick-empty one-tap for out-of-stock items
- Session timer, items/hr pacing, progress bars per area

### Bluetooth Scale Integration
- Native BLE support for **Skale 2** and standard Bluetooth weight services
- Weight-to-liquid conversion (grams → mL → oz with density)
- Bottle templates with tare weights for precision
- Auto-reconnect with exponential backoff

### Voice Commands
- Floating mic button on session screens
- "Connect to scale", "add [item name]", "transfer", "receive", navigation commands
- Long-press for continuous hands-free listening (auto-restart, 60s idle timeout)
- Confirmation alerts for destructive actions

### Immutable Ledger
- Append-only `consumption_events` table — PostgreSQL trigger-protected
- Every change (POS sale, count adjustment, transfer, receiving) is an event
- Corrections use reversal + replacement pattern — never mutates history
- Full audit trail for compliance

### POS Integration & Depletion
- POS-agnostic: supports **Toast**, **Square**, **Lightspeed**, **Clover**, manual CSV
- Three depletion modes: packaged unit mapping, draft by tap, recipe-based
- Unmapped item queue with bulk mapping workflow
- Automatic daily depletion runs

### Recipe Management
- Multi-ingredient recipes with fractional quantities
- Recipe-based depletion: selling a cocktail auto-depletes all ingredients
- **Auto-learning**: Tracks pour accuracy per ingredient across sessions
- Split ratios for ambiguous POS items (e.g., "Rail Tequila" = 60% silver / 40% gold)
- Identifies over-pouring and under-pouring trends per staff

### Variance Tracking & Analytics
- Automatic variance calculation: expected (from ledger) vs actual (counted)
- Configurable thresholds with mandatory reason collection
- Variance reasons: waste/foam, comp, staff drink, theft, breakage, line cleaning, transfer, unknown
- Shrinkage pattern detection across sessions
- Variance heatmap (7-day × 24-hour grid)
- 4-week rolling trend charts

### Multi-Source Expected Inventory
- Predicted level = last count + net change from ALL sources (POS, tap flow, receiving, transfers, adjustments)
- Confidence scoring: High (≤3d), Medium (≤7d), Low (stale/negative)
- Days-to-stockout predictions
- Per-source breakdown (expandable rows)

### Dashboard & Reports
- **4 KPI cards**: On-hand value, 7d COGS, 7d variance impact, shrinkage suspects
- Variance trend charts, flagged items, recent sessions
- COGS by recipe, usage analytics, staff accountability scorecards
- Anomaly detection with risk scoring

### Par Levels & Reorder
- Per-item par level, min level, reorder quantity, lead time
- Traffic-light status indicators (green/yellow/red)
- AI-generated reorder suggestions
- Purchase order tracking with vendor trends

### Real-Time Alerts & Notifications
- SSE-powered live notifications (web) + push notifications (mobile)
- Configurable alert rules: variance %, low stock, stale counts, keg empty, large adjustments, shrinkage patterns, usage spikes
- Email alerts via Resend (fire-and-forget)
- 24-hour deduplication
- Alert dashboard with frequency charts and top-triggered items

### Public Menu
- `/menu/[locationId]` — no auth required, dark theme, QR-code friendly
- Drag-to-reorder categories and items
- Item details: producer, region, ABV, tasting notes, images, pricing tiers
- Staff manage via admin; patrons scan QR to browse

### Art Gallery & Consignment
- Track artwork on walls: on-wall, reserved, sold, removed statuses
- Artist management with payment methods and agreement terms
- Sale recording with proof photos
- Label printing with barcodes

### Auto-Lock Security
- Admin-controlled timeout policy
- PIN pad + Face ID unlock
- Protects shared bar tablets in high-traffic environments

### Multi-Tenant & RBAC
- Multi-location support with per-location user roles
- Roles: platform_admin, business_admin, manager, curator, staff, accounting
- Fine-grained permissions (canManageTareWeights, canAccessSessions, etc.)
- business_admin and platform_admin bypass permission checks

---

## Mobile vs Web

### Mobile App (iOS)
- Barcode scanning, BLE scale connectivity
- Offline-first counting with sync-on-reconnect
- Voice commands, haptic feedback, biometric unlock
- Session-centric UI with area/sub-area navigation
- 30s heartbeat for multi-user presence tracking

### Web Dashboard
- Full CRUD, bulk operations, CSV import
- Complex reporting with Recharts visualizations
- Drag-to-reorder menu management
- Multi-location administration
- Business settings, role management, alert configuration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Backend | Next.js 15 + tRPC |
| Database | PostgreSQL 16+ with Prisma 6 |
| Auth | NextAuth.js v5 (JWT, Argon2) |
| Background Jobs | BullMQ + Redis |
| Web Frontend | React 19, Tailwind CSS 4, Recharts |
| Mobile | Expo + React Native 0.81 |
| BLE | react-native-ble-plx |
| Voice | expo-speech-recognition v3 |
| Barcode | expo-camera |
| Biometric | expo-local-authentication |
| Email | Resend API |
| Validation | Zod (shared schemas) |

---

## Branding

| Element | Value |
|---------|-------|
| Primary Gold | #E9B44C |
| Dark Navy (background) | #0B1623 |
| Card Background | #16283F |
| Primary Text | #EAF0FF |
| Muted Text | #5A6A7A |
| Accent Teal | #2BA8A0 |
| Font | Inter (system fallback) |
| Tone | Dark, professional, operational — readable in low-light bar environments |

**Logo assets**: `apps/web/public/assets/brand/` — barstock-icon.png, barstock-full-logo.png, barstock-transparent-style-icon.png

---

## Key Differentiators

1. **Immutable ledger** — append-only events with PostgreSQL triggers, full audit trail
2. **BLE scale integration** — native Bluetooth for weight-based inventory, no manual guessing
3. **Multi-user real-time sessions** — concurrent counting with activity feeds and sub-area tracking
4. **Voice commands** — hands-free operation during busy shifts
5. **Recipe auto-learning** — tracks pour accuracy, identifies over/under-pouring trends
6. **POS-agnostic** — single depletion engine handles Toast, Square, Lightspeed, Clover
7. **Variance pattern detection** — shrinkage suspects, anomaly alerts, heatmaps
8. **Public menu via QR** — no extra app needed for patrons
9. **Art consignment** — unique hospitality feature for venues with local art
10. **Dark theme** — designed for low-light bar environments

---

## Current Demo Data

- 88 inventory items, 77 sessions, 83 recipes
- 5 bar areas, 129 POS mappings, 8 users, 431 consumption events
- Public menu: `/menu/62815fcb-deab-4698-9c65-b94649673cdc` (T's Pub)

---

## Subscription Tiers

- **Starter**: Basic inventory tracking, single location
- **Pro**: Full feature set, multi-location, advanced analytics
- **Enterprise**: White-label, custom integrations, dedicated support

---

## Roadmap

**Completed (MVP)**: Dashboard KPIs, COGS, variance, on-hand, sessions, audit, multi-user sessions, voice commands v3, public menu, auto-lock, recipes, art gallery, expected inventory, par levels, purchase orders, alerts

**Next (P1)**: Usage over time trends, POS cocktail auto-mapping, forecasting

**Planned (P2)**: Staff scorecards, team collaboration, offline sync, benchmarking

**Future (P3)**: ML variance forecasting, unusual pattern alerts, cross-tenant analytics
