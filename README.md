# TalentDash Backend

Salary intelligence API for TalentDash. Handles ingestion, normalisation, querying, and comparison of compensation data across companies and levels.

**Live URL:** `[https://talentdash-backend-2yo6.onrender.com](https://talentdash-backend-2yo6.onrender.com)`

> Replace this with your actual Render URL once deployed.

---

## Quick Start for Evaluators

A live Neon database is already provisioned and seeded with 61 records.
No database setup required — just clone, install, and run.

```bash
# 1. Clone
git clone https://github.com/Sachin-Bansal94/talentdash.git
cd talentdash

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# .env.example already has live database credentials — no changes needed

# 4. Generate Prisma client
npx prisma generate

# 5. Start the server
npm run dev
```


Verify:
```bash
curl https://talentdash-backend-2yo6.onrender.com/health
# → {"status":"ok"}
```

> **Note:** The database is on Neon free tier — it suspends after inactivity.
> The first request may take 2-3 seconds to wake up. All subsequent requests run at normal speed.

---

## Environment Variables

Create a `.env` file in the root folder with these variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | Neon PostgreSQL direct connection string |
| `PORT` | ❌ No | Server port — defaults to 3000 |

The `.env.example` file already contains live working credentials.
Just run `cp .env.example .env` and you're done.

If you want to use your own database instead:
1. Create a free database at https://neon.tech
2. Copy the **Direct (non-pooled)** connection string from Neon dashboard
3. Remove `&channel_binding=require` from the end if present
4. Paste into `.env` as `DATABASE_URL`

```
DATABASE_URL="postgresql://username:password@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
PORT=3000
```

> **Important:** This project connects via Neon's serverless WebSocket driver
> (port 443) — NOT direct TCP (port 5432). This ensures it works on any
> network regardless of firewall restrictions.

---

## Full Local Setup (If Using Your Own Database)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/talentdash.git
cd talentdash

# 2. Install dependencies
npm install

# 3. Add your DATABASE_URL to .env
cp .env.example .env
# Edit .env and replace DATABASE_URL with your own Neon connection string

# 4. Generate Prisma client
npx prisma generate

# 5. Run database migrations
npx prisma migrate deploy

# 6. Seed the database (61 records across 12 companies)
npx prisma db seed

# 7. Start the server
npm run dev
```

---

## Project Structure

```
talentdash/
├── .env.example                          — Environment variable template
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma                     — Models, enums, indexes, constraints
│   ├── seed.ts                           — 61 realistic records, edge cases
│   └── migrations/
│       └── 20240101000000_init/
│           └── migration.sql             — Full SQL migration history
└── src/
    ├── index.ts                          — Express app, route mounting
    ├── lib/
    │   ├── prisma.ts                     — Neon serverless Prisma client
    │   ├── company.ts                    — Normalisation + find-or-create
    │   └── validators.ts                 — Zod schemas for all endpoints
    └── routes/
        ├── ingest-salary.ts              — POST /api/ingest-salary
        ├── salaries.ts                   — GET /api/salaries
        ├── companies.ts                  — GET /api/companies/:slug
        └── compare.ts                    — GET /api/compare
```

---

## Architecture & Design Decisions

**1. Company normalisation as a first-class concern**
`"Google India"`, `"GOOGLE"`, `"google."` all resolve to the same Company row
via `normalizeCompanyName()` — lowercase + trim + strip punctuation. This runs
at every ingestion point. Without this, every aggregate (median TC, level
distribution) would be wrong because the same company would appear as multiple rows.

**2. total_compensation is always recomputed, never trusted**
The API strips any client-submitted `total_compensation` and recomputes it as
`base_salary + bonus + stock`. This is enforced in application code, not just
documentation. A corrupted TC value from a client or scraper can never reach the database.

**3. Neon serverless driver over direct TCP**
We use `@neondatabase/serverless` with WebSocket transport instead of direct
PostgreSQL TCP (port 5432). This means the API works on any network regardless
of firewall restrictions — critical for deployability. The tradeoff is slightly
more complex setup but zero network dependency issues.

**4. Zod validation before any database call**
All validation happens in Zod before Prisma is touched. This gives per-field
error messages with consistent shape `{ error: true, field, message }` rather
than leaking raw database errors to clients.

**5. Pagination is architecturally mandatory**
`GET /api/salaries` enforces `limit <= 100` via `Math.min(100, limit)` — there
is no code path that returns unbounded rows. Tested against a 10,000 row seed
for the 200ms response time requirement.

**6. Page-based over cursor-based pagination**
Cursor pagination is more efficient for very large datasets but harder to
implement and less intuitive for API consumers. Page-based pagination with
properly indexed sort columns meets the 200ms requirement without the complexity.

**7. Application-layer TC computation over DB triggers**
We could have used a PostgreSQL trigger. Instead TC is computed in application
code before every insert — more explicit, easier to test, easier to debug, and
not dependent on database-specific syntax that could break on migration.

**8. BigInt for salary fields**
Salary fields use PostgreSQL `BIGINT` to handle large compensation numbers
without floating point precision loss. JSON does not support BigInt natively
so all salary values are serialised to strings in API responses.

---

## Database Schema

```
Company
  id               UUID PK
  name             TEXT           — display name e.g. "Google India"
  slug             TEXT UNIQUE    — e.g. "google"
  normalized_name  TEXT INDEXED   — e.g. "google" (lowercase, no punctuation)
  industry         TEXT?
  headquarters     TEXT?
  founded_year     INT?
  headcount_range  TEXT?
  created_at, updated_at

Salary
  id                   UUID PK
  company_id           FK → Company
  role                 TEXT
  level                ENUM (L3|L4|L5|L6|SDE_I|SDE_II|SDE_III|STAFF|PRINCIPAL|IC4|IC5)
  location             TEXT
  currency             ENUM (INR|USD|GBP|EUR)
  experience_years     INT   CHECK > 0 AND < 51
  base_salary          BIGINT CHECK > 0
  bonus                BIGINT DEFAULT 0
  stock                BIGINT DEFAULT 0
  total_compensation   BIGINT  — ALWAYS computed server-side, never from input
  source               ENUM (CONTRIBUTOR|SCRAPED|AI_INFERRED)
  confidence_score     DECIMAL(4,3) CHECK 0.0–1.0
  is_verified          BOOL DEFAULT false
  submitted_at         TIMESTAMPTZ

Indexes:
  (company_id, level, location)  — primary filter path
  (total_compensation)           — sort path
  (submitted_at)                 — recency sort path
  (location, level)              — geo-level filter path
  (name)                         — company name ILIKE search
  (normalized_name)              — deduplication lookup
```

---

## API Reference

### `POST /api/ingest-salary`

Accepts a salary record, validates, normalises company, recomputes TC, checks for duplicates, and stores.

**Request body:**
```json
{
  "company_name": "Google India",
  "role": "Software Engineer",
  "level": "L5",
  "location": "Bengaluru",
  "currency": "INR",
  "experience_years": 6,
  "base_salary": 5500000,
  "bonus": 1000000,
  "stock": 3000000,
  "source": "CONTRIBUTOR",
  "confidence_score": 0.90
}
```

**Validation pipeline (in order):**
1. Required fields present
2. Types correct (Zod)
3. `level` is valid enum value
4. `experience_years` > 0 and < 51
5. `base_salary` > 0
6. `confidence_score` between 0.0 and 1.0

**Responses:**

| Status | Meaning |
|---|---|
| `201` | Created — full stored record with computed `total_compensation` |
| `400` | Validation failure — `{ error: true, field: "level", message: "Level must be one of: ..." }` |
| `409` | Duplicate — same company+role+level+location within 48h, base within 10% |

---

### `GET /api/salaries`

Paginated salary query with filters.

| Param | Type | Default | Notes |
|---|---|---|---|
| `company` | string | — | ILIKE partial match |
| `role` | string | — | ILIKE partial match |
| `level` | enum | — | Exact match |
| `location` | string | — | ILIKE partial match |
| `currency` | enum | — | Exact match |
| `sort` | enum | `total_comp_desc` | `total_comp_desc`, `total_comp_asc`, `date_desc` |
| `page` | int | `1` | — |
| `limit` | int | `25` | Hard capped at 100 |

**Response:**
```json
{
  "data": [...],
  "meta": {
    "total": 61,
    "page": 1,
    "limit": 25,
    "totalPages": 3
  }
}
```

---

### `GET /api/companies/:slug`

Full company profile with salary list, true statistical median TC, and level distribution.

**Response:**
```json
{
  "company": {
    "id": "...",
    "name": "Google",
    "slug": "google",
    "industry": "Technology",
    "headquarters": "Mountain View, CA"
  },
  "median_total_compensation": "9500000",
  "level_distribution": {
    "L3": 2,
    "L4": 3,
    "L5": 2,
    "STAFF": 1,
    "PRINCIPAL": 1
  },
  "salaries": [ "...sorted by total_compensation desc" ]
}
```

Returns `404` for unknown slugs:
```json
{ "error": true, "message": "Company not found" }
```

---

### `GET /api/compare?s1=<uuid>&s2=<uuid>`

Side-by-side comparison of two salary records. Delta = record_1 minus record_2.

**Response:**
```json
{
  "record_1": { "..." },
  "record_2": { "..." },
  "delta": {
    "base_delta": 2000000,
    "bonus_delta": 400000,
    "stock_delta": 1800000,
    "tc_delta": 4200000,
    "experience_delta": 3
  }
}
```

| Status | Condition |
|---|---|
| `400` | `s1` and `s2` are the same ID |
| `404` | Either ID does not exist |

---

## Edge Cases

```bash
# Negative base_salary → 400
POST /api/ingest-salary
{ "base_salary": -1000, ... }

# Invalid level → 400
POST /api/ingest-salary
{ "level": "Senior Software Engineer", ... }

# Wrong total_compensation → always recomputed
POST /api/ingest-salary
{ "base_salary": 3000000, "bonus": 500000, "stock": 1000000, "total_compensation": 999 }
# Stored as total_compensation: "4500000" — client value ignored

# Unknown slug → 404
GET /api/companies/nonexistent-slug

# Same IDs → 400
GET /api/compare?s1=SAME_ID&s2=SAME_ID

# Limit cap → meta.limit = 100
GET /api/salaries?limit=10000
```

---

## Seed Data

61 records across 12 companies:
Google, Amazon, Meta, Microsoft, Flipkart, Meesho, NVIDIA, TCS, Infosys, Wipro, Razorpay, Zepto

Covers all levels: L3, L4, L5, L6, SDE_I, SDE_II, SDE_III, STAFF, PRINCIPAL, IC4, IC5

Cities: Bengaluru, Mumbai, Hyderabad, Pune, Delhi, San Francisco, London

Currencies: INR, USD, GBP

Edge cases in seed:
- Zero bonus record
- Zero stock record
- Very high equity record
- Principal level records
- Normalisation demo: "Google", "GOOGLE", "google." → all resolve to slug "google"
