# Kos Coast Transfers

A connected transfer-booking MVP for Kos, Greece: customer requests, server-priced quotes, persistent relational records, and authenticated operations. The public experience uses an original abstract Aegean artwork, deep blue, ivory and sand. Business identity, prices, fleet and customers are demonstration data.

## Run locally

Requires Node 22.13+ and npm. The repository includes a lockfile. From this directory:

```sh
npm ci
cp .env.example .dev.vars
npm run db:migrate:local
npm run dev -- --port 5186
```

PowerShell: use `Copy-Item .env.example .dev.vars` instead of `cp` if preferred. If this computer's npm launcher fails, invoke `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"` instead of `npm`.

Open the exact address printed by the server. The demo automatically seeds an empty database on the first catalog request when `SEED_ENABLED=true`. Seeding is explicit, bounded, transactional and idempotent; schema creation is handled only by migrations. The persistent local database lives in `.wrangler/state`, not browser storage.

Open `/admin`, then **Sign in with ChatGPT**. In local development only, the bundled preview simulates `seedy@sites.test`; `.dev.vars` explicitly allowlists this identity. There is no password, hard-coded production login, or production auth bypass. The built Worker does not include the development sign-in simulator.

Three fictional seeded bookings are available as `KOS-DEMO-0001` / `guest1@example.com`, `KOS-DEMO-0002` / `guest2@example.com`, and `KOS-DEMO-0003` / `guest3@example.com`. All dates are relative to first seed. A real demo booking can be created immediately using any future date at least two hours ahead. No email or actual transfer is arranged.

If you already applied SQL manually, do not replay it with the migration helper on the same database without first recording its migration ledger. The initial workspace database was migrated manually during development; new checkouts should use the migration helper from the start. Never delete a production database to resolve a migration mismatch.

## Implemented flows

- Homepage, service descriptions, four-step booking, one-way/return, named Kos destinations, property addresses, passenger/luggage capacity, seats, flight/ferry numbers, extras, vehicle options, itemised EUR quote, contact details, requests, privacy acknowledgement and optional marketing preference.
- Confirmation reference and reference-plus-email status lookup. A pending request is clearly distinguished from a confirmed reservation. Email is never falsely reported as sent.
- Operations dashboard, request list and per-leg date-grouped schedule, search/status/date filters, detail and contact editing, manual booking creation, notes, payment records, driver/vehicle allocation, adjusted pickup time and operational progression.
- New/pending → confirmed → assigned → completed, with cancellation paths and server-enforced transitions. Every leg must have an assignment before the booking can be marked assigned, and every leg must be complete before completion. Closed bookings cannot be dispatched.
- In-app notifications, read state, persistent delivery outbox and an HTTPS provider adapter. Booking creation and status updates persist notifications atomically. Journey changes also create delivery events.
- Configurable business/cancellation/privacy text, recipients, lead time, turnaround time, seats, destinations, zones, bidirectional routes, prices, extras, drivers, vehicles and vehicle classes.
- Audit history for booking/contact/payment/notes and leg changes, optimistic version checks, atomic conflict rollback and spreadsheet-safe CSV export.

## Architecture and database

TypeScript, React 19, Next-compatible App Router through Vinext, Vite, Cloudflare Workers, Drizzle migrations and Cloudflare D1 (relational SQLite). The provided Sites runtime uses Vinext `1.0.0-beta.5`; review its compatibility and upgrade policy before a customer production launch.

**This implementation uses D1, not PostgreSQL.** It was selected for the integrated persistent hosting runtime. There is no pretend Postgres connection. Database access is concentrated in `lib/db.ts` and services, and SQL is parameterised. Moving to PostgreSQL is a separate adapter/migration effort: translate the schema and conflict guards, use transactional row/advisory locking or exclusion constraints, and rerun the integration suite. Do not assume SQL can be copied unchanged.

Sixteen related tables model zones, destinations, routes, vehicle classes, fleet, drivers, customers, bookings, legs, extras, booked extras, notifications, outbox, audit, business settings and rate limits. Indexes support schedule, assignment, status, customer and outbox queries. See `db/schema.ts` and the append-only `drizzle/` migrations. The custom migration adds database-level assignment overlap triggers, so competing requests cannot both reserve the same driver or vehicle. A D1 batch transaction rolls back all related writes if a conflict occurs.

Money is stored as integer EUR cents. Each quote is computed on the server from a route price × vehicle-class multiplier plus extras and seats per leg. The booking submit recomputes the price and rejects a stale total; the original itemisation, cancellation policy and price version are retained. Changing settings never reprices existing bookings. Prices and drive times are illustrative and require operator review.

Journey times are UTC epoch milliseconds; inputs and displays are Europe/Athens. The conversion explicitly rejects invalid dates and skipped/repeated daylight-saving wall times instead of silently selecting an offset. Airport pickup time is scheduled landing + chosen collection buffer. Operations can adjust pickup for a delay; no live flight provider is connected. Airport departure guidance asks travellers to allow sufficient airline check-in time. Return legs have independent times and assignments.

## Security and privacy boundaries

All operations APIs enforce the server-side allowlist from `ADMIN_EMAILS`. Production authentication is owned by the Sites dispatcher. **Do not expose the Worker directly to untrusted traffic that can spoof `oai-authenticated-user-*` headers.** A standalone hosting migration requires a trusted reverse proxy that strips client headers and injects verified identity, or replacement of `app/chatgpt-auth.ts` with a verified OIDC/session integration. Do not deploy this auth header trust model directly to an ordinary public Worker URL.

Writes require same-origin JSON, schema validation and bounded request bodies. Public quote/book/lookup endpoints have persistent rate limits. Lookup returns only status, price and journey information after matching a high-entropy booking reference and email; internal notes, contact details and driver identity are excluded. State mutation is transactional and versioned. Public clients cannot set price, payment status or assignments. React escapes rendered input. CSV cells neutralise formula prefixes. Admin/API responses are not cached.

Privacy acknowledgement is versioned and timestamped; marketing permission is independent. No card details are stored. Customer special requests should not contain sensitive medical information. The privacy page is an editable draft, not an assertion of legal compliance. Retention and subject-access/deletion handling must be operationally approved and implemented for the real business before collecting real personal data. Exports contain personal data and are restricted to admins. Logs must not be used to store request bodies or contact details.

## Notification integration

Default: demo/manual-payment mode. In-app notifications are saved immediately. Email/push events remain `queued` until a real provider is configured. Operations → Notifications → **Process delivery queue** invokes the adapter; it does not claim email delivery without a provider.

Set both server-only environment values:

```dotenv
NOTIFICATION_WEBHOOK_URL=https://your-provider.example/transfer-events
NOTIFICATION_WEBHOOK_TOKEN=your-server-side-token
```

The adapter posts JSON containing `id`, `event`, reference, status/journey data and recipients with `Authorization: Bearer …` and `Idempotency-Key: <outbox id>`. A successful 2xx records acceptance by the provider, not arrival in an inbox. The provider can render a customer confirmation email and notify operator email/push recipients. Configure its credentials outside this repository. Use text-safe templates and validate recipients. Never point it at an arbitrary URL entered by a public visitor.

Delivery is at-least-once; the receiver must deduplicate the idempotency key. Attempts are recorded, failures are retryable up to five attempts, and a 15-minute lease recovers interrupted sends. Exhausted attempts need operator investigation. Automatic queue scheduling and provider delivery/bounce receipts are deployment integration work; the MVP provides the manual authenticated drain. No real payment, SMS, email or push provider credentials are included.

## Checks

```sh
npm run typecheck
npm run test:domain
# Keep the local dev server running first:
npm run test:integration
npm run build
```

Integration checks only accept a localhost origin. Set `TEST_ORIGIN` if using another port. They create fictional demo requests and leave them cancelled for inspection. Checks cover a round-trip quote, arrival buffer, capacity and flight validation, price tampering, duplicate submissions, auth, CSRF, lookup data minimisation, invalid transitions, stale edits, overlap transaction rollback, cancellation release, queued notifications and CSV. Domain checks cover DST gaps/ambiguity, summer/winter offsets, invalid dates and CSV escaping. Do not run repeated integration suites against production.

## Deployment

The source has a registered private Sites project in `.openai/hosting.json`. A successful build emits `dist/server/index.js`, client assets and migration metadata. The initial project is private; public visitors are not enabled merely by creating the customer-facing pages.

For Sites: use the Sites source workflow to push this exact source, build/package the matching version, save it and deploy. Sites applies the checked-in migrations and provisions the declared `DB` binding. Set production `ADMIN_EMAILS` to the real authorised sign-in email(s), comma-separated. It currently uses the placeholder `admin@example.com`, so the hosted operations dashboard remains inaccessible until configured. Configure `PUBLIC_ORIGIN` to the final trusted origin and update sitemap/canonical URLs when changing domains. The source files alone do not establish a live deployment; refer to the deployment status returned by Sites.

For a demo deployment, set `SEED_ENABLED=true` once so the first catalog request fills the empty database. For the real service use a clean production database with reviewed configuration, real drivers/vehicles and no sample bookings; disable automatic demo seeding. Keep migrations immutable once applied. Back up the database and test restore/rollback procedures before publishing changes. Secrets belong in the runtime, never in the hosting manifest or browser.

Before opening to customers: configure a real administrator, business identity/contact information, verified prices/tax treatment, cancellation terms, privacy/retention process, notification provider and delivery monitoring. Review capacity and transport operations, run mobile/keyboard/screen-reader and load tests, and measure Core Web Vitals on the actual deployed origin. Responsive layouts, visible focus, semantic forms, reduced-motion handling and a compressed local hero asset are implemented; a formal accessibility audit or field CWV score is not claimed.

## MVP boundaries

No payment gateway, refunds, flight tracking, driver mobile app, map geocoding or route optimiser is connected. Schedule is a chronological per-day agenda, not a drag-and-drop month planner. List and KPI queries currently use the latest 1,000 bookings; schedule uses 2,000 legs. CSV exports all records. Larger operations should add server-side pagination, aggregate reporting and streaming exports. Route or passenger changes to an existing priced booking should be handled by cancellation/rebooking; contact, pickup address/time, flight number, assignment, notes and payment records are editable. Historical audit data is stored but not cryptographically tamper-evident. These are explicit extension points rather than fake integrations.
