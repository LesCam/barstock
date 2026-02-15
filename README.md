# BarStock — Beverage Inventory Platform

Real-time inventory tracking for bars and restaurants. Immutable ledger, POS-agnostic depletion, Bluetooth scale integration.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Backend API | Next.js 15 API Routes + tRPC |
| Web Admin | Next.js 15, React 19, Tailwind CSS |
| Mobile | React Native (Expo) with Expo Router |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js v5 (JWT, Argon2) |
| Background Jobs | BullMQ + Redis |
| Validation | Zod (shared web + mobile) |
| Language | TypeScript everywhere |

## Project Structure

```
barstock/
├── apps/
│   ├── web/                    # Next.js 15 — API + Web Admin
│   │   └── src/
│   │       ├── app/            # App Router (pages + API routes)
│   │       ├── components/     # React components
│   │       └── lib/            # Auth, tRPC client
│   └── mobile/                 # React Native (Expo)
│       └── src/
│           ├── app/            # Expo Router (tabs + session flow)
│           ├── components/     # Scanner, Scale, Variance modal
│           └── lib/            # tRPC client, scale manager
├── packages/
│   ├── database/               # Prisma schema + client
│   │   ├── prisma/schema.prisma
│   │   ├── sql/schema.sql      # PostgreSQL v1.1 (source of truth)
│   │   └── src/                # Client singleton + immutable ledger extension
│   ├── api/                    # tRPC routers + business services
│   │   └── src/
│   │       ├── routers/        # 11 tRPC routers
│   │       ├── services/       # 6 business services
│   │       └── adapters/       # POS integrations (Toast SFTP)
│   ├── types/                  # Shared enums matching PostgreSQL
│   ├── validators/             # Zod schemas (shared web + mobile)
│   ├── ui/                     # Shared React components
│   └── jobs/                   # BullMQ workers
│       └── src/jobs/           # POS import, depletion, snapshots
└── docker/
    ├── docker-compose.yml
    └── Dockerfile.web
```

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis 7+
- pnpm 9+

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your DATABASE_URL, SECRET_KEY, etc.

# Generate Prisma client
pnpm db:generate

# Apply schema to PostgreSQL
psql -U postgres -c "CREATE DATABASE barstock;"
psql -U postgres barstock < packages/database/sql/schema.sql

# Push Prisma schema (alternative to raw SQL)
pnpm db:push

# Start development
pnpm dev
```

### Docker (All Services)

```bash
cd docker
docker compose up -d
# Starts: postgres, redis, web (port 3000), worker
```

## Architecture

### Immutable Ledger

```
POS Sales → Canonical SalesLine → Depletion Engine → ConsumptionEvent (append-only)
```

The `consumption_events` table is the source of truth for all inventory movements. It is protected by:
- PostgreSQL triggers blocking UPDATE/DELETE
- Prisma client extension blocking mutations at the application layer

Corrections use the **reversal + replacement** pattern — never modify existing events.

### POS-Agnostic Design

```
Toast SFTP → ToastAdapter  ─┐
Square API → SquareAdapter  ─┼──→ Canonical SalesLine → Depletion Engine
Manual CSV → ManualAdapter  ─┘
```

The depletion engine only sees canonical `SalesLine` records. Adding a new POS vendor means writing one adapter — no changes to business logic.

### Multi-Tenant Hierarchy

```
Organization
└── Location
    ├── Inventory Items + Price History
    ├── Kegs, Tap Lines, Pour Profiles
    ├── POS Connections + Mappings
    └── Inventory Sessions
```

Users have per-location roles via `user_locations` (admin > manager > staff).

### Session Workflow

1. **Start session** (shift/daily/weekly/monthly)
2. **Count items** — packaged units, draft % remaining, liquor by weight
3. **Close session** — calculates theoretical vs actual variance
4. **Require reasons** if variance exceeds threshold
5. **Create adjustment events** in the immutable ledger

## API (tRPC Routers)

All API endpoints are type-safe via tRPC. The 11 routers:

| Router | Purpose |
|--------|---------|
| `auth` | Login, refresh, user CRUD, location access grants |
| `orgs` | Organization CRUD |
| `locations` | Location CRUD + dashboard stats |
| `inventory` | Item catalog, price history, on-hand calculation |
| `pos` | POS connections, sales lines, unmapped items |
| `mappings` | POS item → inventory item mappings |
| `draft` | Keg sizes, instances, tap lines, assignments, pour profiles |
| `sessions` | Session lifecycle, count lines, close with variance |
| `events` | Audit log, depletion processing, event correction |
| `scale` | Bottle templates, measurements, liquid calculation |
| `reports` | Variance, on-hand, usage, org rollup |

## Background Jobs

BullMQ workers with scheduled recurring jobs:

| Job | Schedule | Description |
|-----|----------|-------------|
| `import-pos` | 5:00 AM daily | Fetch sales data from POS adapters |
| `depletion` | 5:30 AM daily | Process sales lines → consumption events |
| `snapshot` | 6:00 AM daily | Calculate and log inventory snapshots |

## Mobile App

React Native (Expo) with:
- **Expo Router** tab navigation + session stack
- **Barcode scanner** (expo-camera) for item lookup
- **Bluetooth scale** (react-native-ble-plx) for bottle weighing
- **Variance reason modal** for session close

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/barstock
SECRET_KEY=your-secret-key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
REDIS_URL=redis://localhost:6379
TOAST_SFTP_HOST=sftp.toasttab.com
TOAST_SFTP_USER=your-user
TOAST_SFTP_PASS=your-password
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Security

- **Passwords**: Argon2 hashing
- **Tokens**: JWT (access + refresh)
- **RBAC**: Role hierarchy (admin > manager > staff) enforced at tRPC middleware
- **Location scoping**: Users can only access assigned locations

## License

Proprietary — All Rights Reserved
