# TalentDash Backend

Salary intelligence API for TalentDash. Handles ingestion, deduplication, querying, and comparison of compensation data.

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Install & Run

```bash
npm install
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed the database (60+ records, edge cases, normalisation demo)
npx prisma db seed

# Start dev server
npm run dev
```

### Environment Variables

```
DATABASE_URL="postgresql://user:password@localhost:5432/talentdash"
PORT=3000
```

---

## Architecture Decisions

### Data Integrity Guarantees

**`total_compensation` is always recomputed.** The API strips any client-submitted value and recomputes `base_salary + bonus + stock`. No client can corrupt the aggregate data. This is enforced in `POST /api/ingest-salary`.

**Company normalisation prevents duplicates.** `"Google India"`, `"GOOGLE"`, `"google."` all resolve to the same `Company` row via `normalizeCompanyName()` (lowercase + trim + strip punctuation → slug). Enforced at every ingestion point and in the seed.

**Enum rejection at schema level.** `Level` and `Currency` are Prisma enums backed by PostgreSQL `ENUM` types. Invalid values are rejected before reaching application code.

**Pagination is mandatory.** `GET /api/salaries` enforces `limit ≤ 100` with no bypass. Returning unbounded rows is architecturally impossible.

---

## API Reference

### `POST /api/ingest-salary`

Accepts a salary record, validates, normalises, deduplicates, recomputes TC, and stores.

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
3. `level` is valid enum value (L3|L4|L5|L6|SDE_I|SDE_II|SDE_III|STAFF|PRINCIPAL|IC4|IC5)
4. `experience_years` > 0 and < 51
5. `base_salary` > 0
6. `confidence_score` between 0.0 and 1.0

**Normalisation pipeline:**
1. Company name → `normalizeCompanyName()` → find or create Company
2. Strip client `total_compensation` → recompute as `base + bonus + stock`

**Responses:**
- `201` — stored record with computed `total_compensation`
- `400` — validation failure: `{ error: true, field: "level", message: "Level must be one of: L3, L4..." }`
- `409` — duplicate (same company+role+level+location, last 48h, base within 10%)

---

### `GET /api/salaries`

Paginated salary query with filters.

**Query params:**
| Param | Type | Notes |
|-------|------|-------|
| `company` | string | ILIKE partial match |
| `role` | string | ILIKE partial match |
| `level` | enum | exact match |
| `location` | string | ILIKE partial match |
| `currency` | enum | exact match |
| `sort` | `total_comp_desc\|total_comp_asc\|date_desc` | default: `total_comp_desc` |
| `page` | int | default: 1 |
| `limit` | int | default: 25, **max: 100** |

**Response:**
```json
{
  "data": [...],
  "meta": { "total": 420, "page": 1, "limit": 25, "totalPages": 17 }
}
```

> `limit=10000` is capped to 100 silently. `meta.limit` reflects the enforced cap.

---

### `GET /api/companies/:slug`

Full company profile with salary list, true statistical median TC, and level distribution.

**Response:**
```json
{
  "company": { "id": "...", "name": "Google", "slug": "google", ... },
  "median_total_compensation": "9500000",
  "level_distribution": { "L3": 5, "L4": 12, "L5": 8, "PRINCIPAL": 2 },
  "salaries": [ ... sorted by total_compensation desc ]
}
```

**404** for unknown slugs: `{ "error": true, "message": "Company not found" }`

---

### `GET /api/compare?s1=<uuid>&s2=<uuid>`

Side-by-side comparison of two salary records.

**Response:**
```json
{
  "record_1": { ... },
  "record_2": { ... },
  "delta": {
    "base_delta": 2000000,
    "bonus_delta": 400000,
    "stock_delta": 1800000,
    "tc_delta": 4200000,
    "experience_delta": 3
  }
}
```

- `400` if `s1 === s2`
- `404` if either ID not found

---

## Testing Edge Cases (B7)

```bash
# ❌ Negative base_salary → 400
curl -X POST http://localhost:3000/api/ingest-salary \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Google","role":"SWE","level":"L3","location":"Bengaluru","currency":"INR","experience_years":2,"base_salary":-1000,"source":"CONTRIBUTOR","confidence_score":0.9}'

# ❌ Invalid level → 400
curl -X POST http://localhost:3000/api/ingest-salary \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Google","role":"SWE","level":"Senior Software Engineer","location":"Bengaluru","currency":"INR","experience_years":2,"base_salary":1000000,"source":"CONTRIBUTOR","confidence_score":0.9}'

# ✅ Wrong total_compensation → recomputed correctly
curl -X POST http://localhost:3000/api/ingest-salary \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Google","role":"SWE","level":"L4","location":"Pune","currency":"INR","experience_years":4,"base_salary":3000000,"bonus":500000,"stock":1000000,"total_compensation":999,"source":"CONTRIBUTOR","confidence_score":0.9}'
# Returns total_compensation: "4500000" (3M + 500K + 1M), not 999

# ❌ Unknown company slug → 404
curl http://localhost:3000/api/companies/nonexistent-slug

# ❌ Same IDs in compare → 400
curl "http://localhost:3000/api/compare?s1=SAME_ID&s2=SAME_ID"

# ⚠️ limit=10000 → capped at 100
curl "http://localhost:3000/api/salaries?limit=10000"
# meta.limit = 100

# ✅ All filters at once
curl "http://localhost:3000/api/salaries?company=google&role=engineer&level=L5&location=bengaluru&currency=INR&sort=total_comp_desc&page=1&limit=10"
```

---

## Schema

```
Company
  id               UUID PK
  name             TEXT           (display name, e.g. "Google India")
  slug             TEXT UNIQUE    (e.g. "google")
  normalized_name  TEXT INDEXED   (e.g. "google")
  industry         TEXT?
  headquarters     TEXT?
  founded_year     INT?
  headcount_range  TEXT?
  created_at/updated_at

Salary
  id                   UUID PK
  company_id           FK → Company
  role                 TEXT
  level                ENUM (L3..PRINCIPAL)
  location             TEXT
  currency             ENUM (INR|USD|GBP|EUR)
  experience_years     INT  CHECK > 0 AND < 51
  base_salary          BIGINT CHECK > 0
  bonus                BIGINT DEFAULT 0
  stock                BIGINT DEFAULT 0
  total_compensation   BIGINT  ← ALWAYS computed, never trusted from input
  source               ENUM (CONTRIBUTOR|SCRAPED|AI_INFERRED)
  confidence_score     DECIMAL(4,3) CHECK 0.0–1.0
  is_verified          BOOL DEFAULT false
  submitted_at         TIMESTAMPTZ

Indexes:
  (company_id, level, location) — primary filter path
  (total_compensation)           — sort path
  (submitted_at)                 — recency path
  (location, level)              — geo-level filter path
```
