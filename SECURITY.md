# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **Email:** security@barstock.app
- **Response SLA:** We aim to acknowledge within 48 hours and provide a fix timeline within 5 business days.
- **Do not** file a public GitHub issue for security vulnerabilities.

See also: `/.well-known/security.txt` (served at `https://barstock.app/.well-known/security.txt`)

## Secret Rotation Procedures

### 1. AUTH_SECRET / NEXTAUTH_SECRET (JWT signing)

```bash
# Generate a new secret
openssl rand -base64 48

# Update in production environment (Vercel / hosting provider)
# All existing user sessions will be invalidated immediately.
# Users will need to log in again.
```

**Impact:** All active sessions invalidated. No data loss.

### 2. CRON_SECRET (cron job authentication)

```bash
# Generate a new secret
openssl rand -hex 16

# Update in two places simultaneously:
# 1. Server environment variable
# 2. External cron service (Vercel Cron / EasyCron / cron-job.org) Authorization header
```

**Impact:** Cron jobs fail until both sides updated. Schedule during low-traffic window.

### 3. MFA_ENCRYPTION_KEY (AES-256-GCM for TOTP secrets)

```bash
# Generate a new 32-byte hex key
openssl rand -hex 32

# WARNING: Rotating this key invalidates ALL enrolled MFA devices.
# Users will need to re-enroll MFA after rotation.
# Plan a coordinated migration if MFA is widely deployed.
```

**Impact:** All MFA enrollments broken. Requires user re-enrollment.

### 4. DATABASE_URL (PostgreSQL connection string)

```bash
# 1. Create new credentials in PostgreSQL
# 2. Update DATABASE_URL in environment
# 3. Restart application
# 4. Revoke old credentials after confirming connectivity
```

**Impact:** Brief downtime during restart. Roll back by reverting env var.

### 5. RESEND_API_KEY (transactional email)

```bash
# 1. Generate new key in Resend dashboard
# 2. Update RESEND_API_KEY in environment
# 3. Revoke old key in Resend dashboard
```

**Impact:** Emails fail between revoke and deploy. Generate new key first.

### 6. GEMINI_API_KEY (receipt OCR)

```bash
# 1. Generate new key in Google AI Studio
# 2. Update GEMINI_API_KEY in environment
# 3. Revoke old key
```

**Impact:** Receipt scanning unavailable during gap. Non-critical feature.

## Environment Validation

The server validates all secrets at startup (`apps/web/src/lib/assert-server-env.ts`):

- `AUTH_SECRET` / `NEXTAUTH_SECRET`: minimum 32 characters, rejects default placeholder
- `MFA_ENCRYPTION_KEY`: exactly 64 hex characters (32 bytes)
- `CRON_SECRET`: minimum 16 characters (production only)
- `DATABASE_URL`: must use `postgresql://` or `postgres://` protocol
- `NEXTAUTH_URL`: must use `https://` in production
- Secrets are blocked from `NEXT_PUBLIC_*` exposure

## Architecture Notes

- **Authentication:** NextAuth with JWT strategy (8-hour token lifetime)
- **Authorization:** Layered tRPC middleware — role, business, location, permission checks
- **Multi-tenant isolation:** All SSE streams, file uploads, and data queries enforce `businessId` scoping
- **Audit trail:** All mutations logged to `audit_logs` table (append-only); CSV exports audited via `report.exported` events
- **Rate limiting:** Edge middleware — auth (10/15min), reports/exports (30/min), cron (6/5min), public endpoints (60/min); distributed via Upstash Redis when configured, in-memory fallback
- **CSP:** Environment-aware — `unsafe-eval` removed in production, `connect-src` restricted to HTTPS
- **Response caching:** All authenticated routes return `Cache-Control: no-store`; tRPC responses include `cache-control: no-store` via `responseMeta`
- **Log redaction:** Sensitive fields (password, pin, token, secret) auto-redacted in tRPC error logs; auth endpoint inputs fully redacted
- **CSV export safety:** Formula injection prevention — cells starting with `=`, `+`, `-`, `@`, `|` are neutralized
- **CSRF:** Origin header validation on all mutations; Bearer tokens exempt
- **Headers:** HSTS, X-Frame-Options DENY, CSP, Permissions-Policy via next.config.js
