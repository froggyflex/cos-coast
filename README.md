# Kos Coast Transfers

A working booking and operations MVP for Kos, Greece. Modern abstract Mediterranean artwork, a mobile-first booking flow, and a Google-authenticated operations dashboard. This repository runs independently of ChatGPT/Sites.

**Stack:** Next.js 16 App Router, React 19, TypeScript, MongoDB Atlas (native driver), NextAuth Google OAuth, Tailwind/CSS. Deploy on Vercel using the Node.js runtime.

## Local setup

Use Node.js 22 LTS and npm. From this repository:

```sh
npm ci
cp .env.example .env.local
# Fill in your Atlas URI and Google OAuth credentials privately.
npm run db:setup
npm run db:seed
npm run dev
```

On Windows, copy the file with `Copy-Item .env.example .env.local`. **Keep an existing `.env.local`; do not overwrite it.** Open http://localhost:3000 and http://localhost:3000/admin.

`MONGODB_URI` is the preferred connection variable; `MONGO_URI` is accepted for existing setups. Database name defaults to `coscoast`. The app creates `transfer_*` collections and does not read or modify an existing collection called `coscoast`. A database and a collection are separate things in MongoDB.

The Atlas database user needs read/write and index creation access to this database. Permit the development machine and deployment's outbound network in Atlas Network Access. Use a suitable private or fixed-egress configuration for production where available. Do not disable TLS or certificate verification. URL-encode special characters in database credentials.

Generate a session secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Put the result in `NEXTAUTH_SECRET`. Never commit or share `.env.local`. No secret uses a `NEXT_PUBLIC_` prefix.

## Google admin sign-in

1. Create a Google Cloud OAuth **Web application** client. Configure the consent screen and add your account as a test user if the application is in testing mode.
2. Add the exact redirect URI `http://localhost:3000/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL=http://localhost:3000`.
4. Set `ADMIN_EMAILS=andrea.tallaros7@gmail.com`. Additional admins may be listed with commas.

Only verified Google email addresses on this server-side allowlist can sign in. Every admin API checks the session and current allowlist. Sessions expire after eight hours; production cookies are secure and HTTP-only. OAuth uses state and PKCE, and NextAuth protects its POST endpoints against CSRF. No password or development login bypass is included. Old Sites cookies/headers grant no access.

Google's callback configuration is documented at https://next-auth.js.org/providers/google.

## Deploy to a new Vercel project

1. Import `froggyflex/cos-coast` from GitHub. Select **Next.js**, repository root `./`, Node.js **22.x**. Build: `npm run build`; install: `npm ci`. No custom output directory.
2. Add the server environment variables from `.env.example` to Vercel. Copy secret values directly from your private local file to Vercel's environment settings, never to the repository or chat.
3. Use the project's stable domain for both `NEXTAUTH_URL` and `PUBLIC_ORIGIN`, for example `https://YOUR-PROJECT.vercel.app`. Do not include a trailing path. Keep `ALLOW_INDEXING=false` for testing and `SEED_ENABLED=false` after the demo seed has run.
4. Add `https://YOUR-PROJECT.vercel.app/api/auth/callback/google` to the Google OAuth client's authorized redirect URIs. Add the custom-domain equivalent if/when you use one.
5. Ensure Atlas allows the Vercel deployment to connect. The successful local connection does not establish Vercel network access.
6. Deploy. Changing environment variables requires a redeployment. Database setup and seeding are explicit commands, **not** build steps. This prevents every deployment from mutating business data.
7. Test the public quote → review → request → reference → status-lookup flow. Sign in as the allowed Google account, confirm the request, assign a matching vehicle/driver, update its operational steps and payment status, then export CSV.

Prefer a separate Atlas database or collection prefix and OAuth client for Preview deployments. A stable staging domain avoids continually adding callback URLs for ephemeral preview domains. Never point untrusted branch previews at live customer data. Region `fra1` is configured as a European default; choose a region near your Atlas cluster if different.

## What works

- Airport, port, hotel/villa, private and business journeys; one-way and return; exact property addresses; passengers, luggage, child seats, flight/ferry numbers and extras.
- Validated Athens-local dates, airport arrival buffers, vehicle capacity filtering, route-based EUR quotes, saved price/cancellation snapshots, contact/consent capture, idempotent requests and reference/email lookup.
- Operations overview, list/search/filter, dated journey schedule, manual booking creation, contact and request editing, internal notes, payment tracking, driver/vehicle dispatch, in-app notifications and CSV export.
- Configurable destinations, zones, routes, prices, extras, vehicle classes, resources, business details, cancellation wording and notification recipients.
- Atomic booking/customer/journey/outbox/audit writes; optimistic booking versions; safe concurrent availability checks; auditable status and dispatch changes.
- Demo/manual payment mode. No card charge, refund, automatic flight monitoring, email or SMS is invented.

Requests are **pending** until operations confirms them. Vehicle selection checks capacity/class; it does not reserve a particular car. Dispatch reserves driver and vehicle time, including turnaround. The schedule/list currently displays the latest 2,000 journey legs; CSV exports all legs. Add server pagination/aggregated KPIs before growing beyond this operating volume.

## Database setup and schema

`lib/setup-db.ts` is the versioned, additive MongoDB schema/index setup (version 1); `npm run db:setup` is repeatable. MongoDB does not use SQL migrations. Old D1/Drizzle code was removed from the active project and remains in Git history. No existing remote D1 database was changed by this migration.

| Collections (prefix `transfer_`) | Purpose |
| --- | --- |
| `bookings`, `customers`, `legs`, `booking_extras` | Booking header, contact, outbound/return journeys, purchased extras |
| `zones`, `destinations`, `routes`, `vehicle_types`, `extras` | Configurable catalogue and integer-cent pricing |
| `drivers`, `vehicles` | Operational resources and vehicle class |
| `notifications`, `outbox` | In-app events and provider delivery queue |
| `audit`, `settings`, `locks`, `rate_limits` | Audit history, business/schema settings, dispatch serialization, expiring abuse limits |

All records have string `id` values. Booking references and idempotency keys are unique; a route's unordered zone pair and a vehicle's registration are unique. Legs reference bookings/destinations/resources. Times are UTC epoch milliseconds; currency is EUR integer cents. Rate-limit expiry is a BSON Date with a TTL index. Business settings and immutable quoted line items are embedded objects. Request schemas and reference validation live in `lib/domain.ts`, `lib/bookings.ts`, and `lib/settings.ts`; MongoDB additionally validates record IDs. Direct database edits bypass application invariants and should be restricted to operators who understand them.

Atlas transactions use snapshot reads and majority writes. Dispatch/settings transactions first update a shared schedule lock document. That makes competing assignments conflict and retry before checking availability, avoiding snapshot write-skew. Reservation intervals are half-open (`start < otherEnd && end > otherStart`). Cancelled/completed bookings and completed/no-show legs release reservations. For a larger fleet, replace the single serialization document with consistently ordered resource locks.

The demo seed uses upserts with `$setOnInsert`, so rerunning does not overwrite edits. It includes ten destinations, four vehicle classes, example rates and extras, two fictional drivers, four vehicles and three fictional bookings. Demo rates are illustrative and must be reviewed before real bookings.

## Notification provider adapter

Without `NOTIFICATION_WEBHOOK_URL` and `NOTIFICATION_WEBHOOK_TOKEN`, external events remain queued. In-app notifications still work. With those configured, the admin notification screen can drain a small batch. The provider receives an HTTPS JSON POST with a bearer token and stable `Idempotency-Key`:

```json
{"id":"event-uuid","event":"booking.requested","reference":"KOS-...","customerEmail":"guest@example.com","recipients":["operations@example.com"],"status":"pending","demo":false}
```

Events: `booking.requested`, `booking.status_changed`, `journey.updated`. Request events also include the quote total, customer name and journey details. The receiver should validate the token, deduplicate IDs, render email/push templates and return 2xx after accepting delivery. Never expose the token to a client. Failed events retry up to five attempts; stale delivery leases recover after 15 minutes. Demo events stay held unless `NOTIFICATION_SEND_DEMO=true` is explicitly set. Delivery is at-least-once, not exactly-once. No provider is configured by default.

For unattended production delivery, invoke the same adapter from an authenticated queue/worker or scheduler and monitor exhausted retries. Manual drain is intentional for this testing MVP; setting a URL alone does not enable background delivery. Payment statuses are administrative records only; add a payment provider with signed webhooks and idempotent reconciliation before taking cards online.

## Verification

```sh
npm run lint
npm run typecheck
npm run test:domain
npm run test:integration
npm run build
npm start
```

Integration tests use the configured Atlas connection but create a unique `test_<uuid>_` collection namespace, exercise the real database and remove only that namespace in `finally`. They never drop the database or application collections. Interrupted test runs may leave their isolated test namespace for explicit cleanup. Tests include concurrent idempotency, resource contention, transactional rollback, cancellation release, operational workflow, quote rejection, rate limits, origin validation and Google allowlist rules. Actual Google consent/sign-in must also be tested interactively by the account owner.

## Before accepting real customers

Review real prices, fleet/contact details, cancellation/retention policies and the privacy notice. Replace visible demo copy, switch business demo mode off, disable demo seeding, and enable indexing only when public launch is intended. Configure backup/restore, error and queue monitoring, production network access, and any external provider contracts/credentials. The privacy page is a draft, not legal certification. Accessibility and load behaviour should be validated with representative devices and real traffic; no measured Core Web Vitals guarantee is claimed.
