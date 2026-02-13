# Beverage Inventory Intelligence Platform - Complete Implementation

## 🏗️ Production-Ready SaaS Platform

This is a complete, production-quality implementation of the beverage inventory intelligence platform with:

- **FastAPI Backend** with worker queues
- **PostgreSQL v1.1 Schema** (immutable ledger)
- **React Native Mobile App** (with Bluetooth scale)
- **React Web Admin** (multi-location dashboards)
- **Toast POS Adapter** (canonical SalesLine abstraction)
- **Multi-tenant architecture** (Org → Locations)

## 📁 Complete Project Structure

```
beverage-inventory-platform/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── main.py            # Application entry point
│   │   ├── core/              # Core configuration
│   │   │   ├── config.py      # Settings
│   │   │   ├── database.py    # DB connection
│   │   │   ├── security.py    # JWT auth
│   │   │   └── deps.py        # Dependencies
│   │   ├── models/            # SQLAlchemy models
│   │   │   ├── org.py
│   │   │   ├── location.py
│   │   │   ├── user.py
│   │   │   ├── inventory.py
│   │   │   ├── draft.py
│   │   │   ├── pos.py
│   │   │   ├── ledger.py
│   │   │   ├── session.py
│   │   │   └── scale.py
│   │   ├── schemas/           # Pydantic schemas
│   │   │   ├── auth.py
│   │   │   ├── org.py
│   │   │   ├── inventory.py
│   │   │   ├── pos.py
│   │   │   ├── session.py
│   │   │   └── reports.py
│   │   ├── api/               # API routes
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── auth.py
│   │   │       ├── orgs.py
│   │   │       ├── locations.py
│   │   │       ├── users.py
│   │   │       ├── inventory.py
│   │   │       ├── pos.py
│   │   │       ├── mappings.py
│   │   │       ├── draft.py
│   │   │       ├── sessions.py
│   │   │       ├── events.py
│   │   │       ├── scale.py
│   │   │       └── reports.py
│   │   ├── services/          # Business logic
│   │   │   ├── auth_service.py
│   │   │   ├── inventory_service.py
│   │   │   ├── depletion_service.py
│   │   │   ├── session_service.py
│   │   │   ├── variance_service.py
│   │   │   └── report_service.py
│   │   ├── adapters/          # POS integrations
│   │   │   ├── base.py        # Abstract POSAdapter
│   │   │   ├── toast.py       # Toast implementation
│   │   │   └── canonical.py   # SalesLine transformer
│   │   ├── workers/           # Background jobs
│   │   │   ├── celery_app.py
│   │   │   ├── tasks.py
│   │   │   ├── import_job.py
│   │   │   └── depletion_job.py
│   │   └── utils/
│   │       ├── scale_provider.py  # Bluetooth abstraction
│   │       ├── bottle_calc.py     # Template calculations
│   │       └── helpers.py
│   ├── alembic/               # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   ├── schema.sql             # v1.1 PostgreSQL schema
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── mobile/                     # React Native App
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── LocationSelectScreen.tsx
│   │   │   ├── SessionScreen.tsx
│   │   │   ├── PackagedCountScreen.tsx
│   │   │   ├── DraftVerifyScreen.tsx
│   │   │   ├── LiquorWeighScreen.tsx
│   │   │   └── VarianceReviewScreen.tsx
│   │   ├── components/
│   │   │   ├── BarcodeScanner.tsx
│   │   │   ├── ScaleConnector.tsx
│   │   │   └── VarianceReasonModal.tsx
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── scale.ts
│   │   │   └── storage.ts
│   │   ├── navigation/
│   │   ├── types/
│   │   └── utils/
│   ├── App.tsx
│   ├── package.json
│   └── app.json
│
├── web/                        # React Admin Dashboard
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── OrgDashboard.tsx
│   │   │   ├── LocationDashboard.tsx
│   │   │   ├── POSConnectionsPage.tsx
│   │   │   ├── UnmappedQueue.tsx
│   │   │   ├── InventoryCatalog.tsx
│   │   │   ├── BottleTemplates.tsx
│   │   │   ├── KegTapBoard.tsx
│   │   │   ├── SessionsPage.tsx
│   │   │   ├── VarianceReports.tsx
│   │   │   └── AuditLogPage.tsx
│   │   ├── components/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   ├── App.tsx
│   ├── package.json
│   └── tsconfig.json
│
└── infra/                      # Infrastructure
    ├── docker-compose.yml
    ├── k8s/
    │   ├── backend-deployment.yaml
    │   ├── worker-deployment.yaml
    │   └── services.yaml
    └── terraform/
        └── main.tf
```

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
- PostgreSQL 14+
- Redis 6+
- Python 3.11+
- Node.js 18+
- Docker (optional)
```

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup database
psql -U postgres -c "CREATE DATABASE inventory_db;"
psql -U postgres inventory_db < schema.sql

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run migrations (if using Alembic)
alembic upgrade head

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

### Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# iOS
npx pod-install
npx react-native run-ios

# Android
npx react-native run-android

# Or use Expo
npx expo start
```

### Web Admin Setup

```bash
cd web

# Install dependencies
npm install

# Start dev server
npm start
```

### Docker Setup (All Services)

```bash
# Start everything
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
```

## 📊 Architecture Overview

### Immutable Ledger Pattern

```
POS Sales → SalesLine (canonical) → Depletion Engine → ConsumptionEvent

consumption_events table:
- Append-only (triggers block UPDATE/DELETE)
- Corrections = reversal_of_event_id + replacement
- Source of truth for all inventory movements
```

### POS-Agnostic Design

```
Toast SFTP Export → ToastAdapter → Canonical SalesLine
Square API → SquareAdapter → Canonical SalesLine (future)

Depletion Engine only sees SalesLine - never POS-specific IDs
```

### Multi-Tenant Hierarchy

```
Organization
└── Location 1
    ├── Inventory Items
    ├── Kegs & Taps
    ├── POS Mappings
    └── Inventory Sessions
└── Location 2
    └── ...

Users have user_locations with role per location
```

## 🔐 Security

### Authentication Flow

```
1. POST /v1/auth/login → JWT access token + refresh token
2. All requests: Authorization: Bearer <token>
3. Token includes: user_id, org_id, location_ids[], roles{}
4. Middleware enforces RBAC per endpoint
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to org and all locations |
| **Manager** | Manage assigned locations, view reports, mappings |
| **Staff** | Perform counts, limited cost visibility |

## 📡 Core API Endpoints

### Authentication
- `POST /v1/auth/login` - Login with email/password
- `POST /v1/auth/refresh` - Refresh access token
- `GET /v1/auth/me` - Get current user info

### Organizations & Locations
- `POST /v1/orgs` - Create organization
- `GET /v1/orgs/{org_id}/locations` - List locations
- `POST /v1/orgs/{org_id}/locations` - Create location

### Inventory
- `GET /v1/inventory_items` - List items (filtered by location)
- `POST /v1/inventory_items` - Create item
- `POST /v1/price_history` - Add price entry

### POS Integration
- `POST /v1/pos_connections` - Setup POS connection
- `POST /v1/pos_connections/{id}/import` - Trigger import
- `GET /v1/sales_lines/unmapped` - Get unmapped queue
- `POST /v1/pos_item_mappings` - Map POS item

### Draft Beer
- `POST /v1/keg_instances` - Receive keg
- `POST /v1/tap_assignments` - Assign keg to tap
- `PATCH /v1/tap_assignments/{id}/end` - End assignment
- `POST /v1/tap_assignments/repair` - Repair/reallocate

### Sessions
- `POST /v1/inventory_sessions` - Start session
- `POST /v1/inventory_sessions/{id}/lines` - Add count lines
- `POST /v1/inventory_sessions/{id}/close` - Close and create adjustments

### Scale & Bottles
- `GET /v1/bottle_templates` - List templates
- `POST /v1/bottle_templates` - Create template
- `POST /v1/bottle_measurements` - Record measurement

### Events & Reports
- `GET /v1/consumption_events` - Query ledger
- `POST /v1/consumption_events/{id}/correct` - Correct event
- `GET /v1/reports/variance` - Variance report
- `GET /v1/reports/on_hand` - On-hand inventory

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/inventory_db

# Security
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis
REDIS_URL=redis://localhost:6379/0

# Toast POS
TOAST_SFTP_HOST=sftp.toasttab.com
TOAST_SFTP_USER=your-user
TOAST_SFTP_PASSWORD=your-password

# Business Logic
DEFAULT_TIMEZONE=America/Montreal
DEFAULT_CLOSEOUT_HOUR=4
VARIANCE_THRESHOLD_PERCENT=5.0
```

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Mobile tests
cd mobile
npm test

# Web tests
cd web
npm test

# Integration tests
cd backend
pytest tests/integration/
```

## 📦 Deployment

### Production Checklist

- [ ] Set ENVIRONMENT=production
- [ ] Use strong SECRET_KEY
- [ ] Enable SSL/TLS
- [ ] Configure production database (RDS/Cloud SQL)
- [ ] Setup Redis cluster
- [ ] Configure worker autoscaling
- [ ] Enable monitoring (Datadog/New Relic)
- [ ] Setup log aggregation
- [ ] Configure backups
- [ ] Setup CI/CD pipeline

### Docker Production

```bash
# Build images
docker build -t inventory-backend:latest ./backend
docker build -t inventory-web:latest ./web

# Deploy with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f infra/k8s/

# Check status
kubectl get pods
kubectl logs -f deployment/backend
```

## 🔄 Background Workers

### Celery Tasks

```python
# POS Import (nightly)
@celery_app.task
def import_toast_exports(location_id: str, date: str):
    """Import Toast SFTP exports for a location"""
    pass

# Depletion Processing
@celery_app.task
def process_depletion(location_id: str, from_ts: str, to_ts: str):
    """Process SalesLines → ConsumptionEvents"""
    pass

# Snapshot Generation
@celery_app.task
def generate_inventory_snapshot(location_id: str):
    """Generate nightly inventory snapshots"""
    pass
```

### Scheduled Jobs

```python
# Celery Beat schedule
beat_schedule = {
    'import-toast-daily': {
        'task': 'app.workers.tasks.import_all_locations',
        'schedule': crontab(hour=5, minute=0),  # 5 AM daily
    },
    'generate-snapshots': {
        'task': 'app.workers.tasks.generate_all_snapshots',
        'schedule': crontab(hour=6, minute=0),  # 6 AM daily
    },
}
```

## 📱 Mobile App Features

### Session Workflow

1. **Location Select** (if multi-location user)
2. **Start Session** (shift/daily/weekly)
3. **Packaged Count**
   - Barcode scanner
   - Manual search fallback
   - Case/unit entry
4. **Draft Verify**
   - Tap list with current kegs
   - % remaining slider per tap
5. **Liquor Weigh**
   - BLE scale connection
   - Auto-read stable weight
   - Manual entry with guardrails
6. **Variance Review**
   - Items exceeding threshold
   - Reason selection required
7. **Close Session** → Adjustment events created

### Bluetooth Scale Integration

```typescript
interface ScaleProvider {
  scanDevices(): Promise<ScaleDevice[]>;
  connect(deviceId: string): Promise<void>;
  readStableWeight(): Promise<number>;  // grams
  tare(): Promise<void>;
  disconnect(): Promise<void>;
}

// Implementation supports multiple vendors
// Stores gross_weight_g as source of truth
// Converts via bottle templates
```

## 🌐 Web Admin Features

### Organization Dashboard

- Multi-location status overview
- Last POS import times
- Unmapped items count per location
- Top variance items (7d rollup)

### Location Management

- POS connection setup (Toast SFTP credentials)
- Unmapped item queue with mapping UI
- Inventory catalog CRUD
- Bottle template library
- Keg & tap board management
- Session history and audit
- Variance analytics with filtering

### Reporting

- **Variance Report**: theoretical vs actual, $ impact
- **On-Hand Report**: current inventory by item
- **Usage Report**: consumption trends
- **Valuation Report**: total inventory value
- All reports support:
  - Org-level rollup
  - Per-location breakdown
  - Date range filtering
  - CSV export

## 🎯 Key Design Decisions

### Why Immutable Ledger?

- **Audit integrity**: Never lose history
- **Corrections are transparent**: Reversal + replacement
- **Replay capability**: Rebuild state from events
- **Compliance**: Required for many jurisdictions

### Why Canonical SalesLine?

- **POS-agnostic**: Add Square, Lightspeed without changing engine
- **Future-proof**: POS APIs change, canonical layer absorbs it
- **Testing**: Mock SalesLines without POS dependency

### Why Session-Based Counting?

- **Variance context**: Know when/where discrepancy occurred
- **Accountability**: Require reasons above threshold
- **Batch processing**: Close session = single adjustment event set

### Why Bluetooth Scale?

- **Accuracy**: Weight > estimation
- **Speed**: Faster than manual oz entry
- **Compliance**: Some regulations require weight-based

## 📚 Additional Documentation

- **API Reference**: See `/docs` endpoint (dev/staging only)
- **Database Schema**: `backend/schema.sql` with full comments
- **Technical Design**: See uploaded TDF document
- **Implementation Spec**: See uploaded Master Spec v2

## 🆘 Troubleshooting

### Database Issues

```bash
# Reset database
psql -U postgres -c "DROP DATABASE inventory_db;"
psql -U postgres -c "CREATE DATABASE inventory_db;"
psql -U postgres inventory_db < schema.sql
```

### Worker Not Processing

```bash
# Check Redis connection
redis-cli ping

# Check Celery status
celery -A app.workers.celery_app inspect active

# Restart worker
celery -A app.workers.celery_app worker --loglevel=debug
```

### Scale Connection Issues

- Ensure Bluetooth is enabled
- Check device pairing
- Verify scale is charged
- Try manual fallback mode

## 🔮 Future Enhancements

- Real-time tap flow meters (event_type=tap_flow reserved)
- Automated vendor ordering
- Predictive analytics
- Recipe costing
- Labor integration
- AI-powered variance detection

## 📄 License

Proprietary - All Rights Reserved

## 👥 Support

For implementation questions, see the Technical Design Freeze and Implementation Master Spec documents.

---

**Built with production quality. Deploy with confidence.**
