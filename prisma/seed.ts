import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, Level, Currency, Source } from '@prisma/client';
import { normalizeCompanyName, slugify } from '../src/lib/company';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaNeon(pool);
const prisma = new PrismaClient({ adapter });
// ────────────────────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────────────────────

function computeTC(base: bigint, bonus: bigint, stock: bigint): bigint {
  return base + bonus + stock;
}

// ────────────────────────────────────────────────────────────────────────────
// Company seed data
// NOTE: "Google India", "GOOGLE", "google." all normalise → "google"
//       This is intentional — it proves normalisation works.
// ────────────────────────────────────────────────────────────────────────────

const COMPANY_INPUTS = [
// All three normalise to "google" — demonstrating normalisation
{ rawName: 'Google',        industry: 'Technology',    headquarters: 'Mountain View, CA' },
{ rawName: 'GOOGLE',        industry: 'Technology',    headquarters: 'Mountain View, CA' },
{ rawName: 'google.',       industry: 'Technology',    headquarters: 'Mountain View, CA' },

  { rawName: 'Amazon',        industry: 'Technology',    headquarters: 'Seattle, WA',       founded_year: 1994 },
  { rawName: 'Meta',          industry: 'Technology',    headquarters: 'Menlo Park, CA',    founded_year: 2004 },
  { rawName: 'Microsoft',     industry: 'Technology',    headquarters: 'Redmond, WA',       founded_year: 1975 },
  { rawName: 'Flipkart',      industry: 'E-Commerce',    headquarters: 'Bengaluru, India',  founded_year: 2007 },
  { rawName: 'Meesho',        industry: 'E-Commerce',    headquarters: 'Bengaluru, India',  founded_year: 2015 },
  { rawName: 'NVIDIA',        industry: 'Semiconductors',headquarters: 'Santa Clara, CA',   founded_year: 1993 },
  { rawName: 'TCS',           industry: 'IT Services',   headquarters: 'Mumbai, India',     founded_year: 1968 },
  { rawName: 'Infosys',       industry: 'IT Services',   headquarters: 'Bengaluru, India',  founded_year: 1981 },
  { rawName: 'Wipro',         industry: 'IT Services',   headquarters: 'Bengaluru, India',  founded_year: 1945 },
  { rawName: 'Razorpay',      industry: 'Fintech',       headquarters: 'Bengaluru, India',  founded_year: 2014 },
  { rawName: 'Zepto',         industry: 'Quick Commerce',headquarters: 'Mumbai, India',     founded_year: 2021 },
];

// ────────────────────────────────────────────────────────────────────────────
// Salary records
// ────────────────────────────────────────────────────────────────────────────

type SalaryInput = {
  companyNorm: string;  // normalized_name of the company
  role: string;
  level: Level;
  location: string;
  currency: Currency;
  experience_years: number;
  base_salary: bigint;
  bonus: bigint;
  stock: bigint;
  source: Source;
  confidence_score: number;
  is_verified?: boolean;
};

const SALARY_RECORDS: SalaryInput[] = [
  // ── Google ──────────────────────────────────────────────────────────────
  { companyNorm: 'google', role: 'Software Engineer',       level: 'L3',      location: 'Bengaluru',    currency: 'INR', experience_years: 1,  base_salary: 2000000n, bonus: 300000n,  stock: 500000n,    source: 'CONTRIBUTOR', confidence_score: 0.95, is_verified: true },
  { companyNorm: 'google', role: 'Software Engineer',       level: 'L4',      location: 'Bengaluru',    currency: 'INR', experience_years: 3,  base_salary: 3500000n, bonus: 600000n,  stock: 1200000n,   source: 'CONTRIBUTOR', confidence_score: 0.92, is_verified: true },
  { companyNorm: 'google', role: 'Software Engineer',       level: 'L5',      location: 'Bengaluru',    currency: 'INR', experience_years: 6,  base_salary: 5500000n, bonus: 1000000n, stock: 3000000n,   source: 'CONTRIBUTOR', confidence_score: 0.90, is_verified: true },
  { companyNorm: 'google', role: 'Software Engineer',       level: 'L6',      location: 'Bengaluru',    currency: 'INR', experience_years: 10, base_salary: 8000000n, bonus: 1800000n, stock: 6000000n,   source: 'CONTRIBUTOR', confidence_score: 0.88, is_verified: true },
  { companyNorm: 'google', role: 'Staff Engineer',          level: 'STAFF',   location: 'San Francisco', currency: 'USD', experience_years: 14, base_salary: 280000n,  bonus: 80000n,   stock: 200000n,    source: 'CONTRIBUTOR', confidence_score: 0.87, is_verified: true },
  { companyNorm: 'google', role: 'Principal Engineer',      level: 'PRINCIPAL',location: 'San Francisco', currency: 'USD', experience_years: 18, base_salary: 350000n,  bonus: 150000n,  stock: 800000n,    source: 'SCRAPED',     confidence_score: 0.75 }, // HIGH EQUITY edge case
  { companyNorm: 'google', role: 'Software Engineer',       level: 'L4',      location: 'Hyderabad',    currency: 'INR', experience_years: 4,  base_salary: 3200000n, bonus: 0n,       stock: 1000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85 }, // ZERO BONUS edge case
  { companyNorm: 'google', role: 'Senior Engineer',         level: 'L5',      location: 'Mumbai',       currency: 'INR', experience_years: 7,  base_salary: 5000000n, bonus: 900000n,  stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.80 }, // ZERO STOCK edge case

  // ── Amazon ──────────────────────────────────────────────────────────────
  { companyNorm: 'amazon', role: 'SDE I',                   level: 'SDE_I',   location: 'Bengaluru',    currency: 'INR', experience_years: 1,  base_salary: 1800000n, bonus: 200000n,  stock: 600000n,    source: 'CONTRIBUTOR', confidence_score: 0.90, is_verified: true },
  { companyNorm: 'amazon', role: 'SDE II',                  level: 'SDE_II',  location: 'Bengaluru',    currency: 'INR', experience_years: 4,  base_salary: 3000000n, bonus: 500000n,  stock: 1500000n,   source: 'CONTRIBUTOR', confidence_score: 0.88, is_verified: true },
  { companyNorm: 'amazon', role: 'SDE III',                 level: 'SDE_III', location: 'Bengaluru',    currency: 'INR', experience_years: 8,  base_salary: 5000000n, bonus: 800000n,  stock: 3000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85 },
  { companyNorm: 'amazon', role: 'SDE II',                  level: 'SDE_II',  location: 'Hyderabad',    currency: 'INR', experience_years: 5,  base_salary: 2800000n, bonus: 450000n,  stock: 1200000n,   source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'amazon', role: 'Principal Engineer',      level: 'PRINCIPAL',location: 'Seattle',     currency: 'USD', experience_years: 15, base_salary: 300000n,  bonus: 120000n,  stock: 400000n,    source: 'SCRAPED',     confidence_score: 0.70 },
  { companyNorm: 'amazon', role: 'SDE III',                 level: 'SDE_III', location: 'London',       currency: 'GBP', experience_years: 9,  base_salary: 160000n,  bonus: 30000n,   stock: 80000n,     source: 'CONTRIBUTOR', confidence_score: 0.83 },

  // ── Meta ─────────────────────────────────────────────────────────────────
  { companyNorm: 'meta', role: 'Software Engineer',         level: 'IC4',     location: 'Bengaluru',    currency: 'INR', experience_years: 5,  base_salary: 4500000n, bonus: 900000n,  stock: 2500000n,   source: 'CONTRIBUTOR', confidence_score: 0.88, is_verified: true },
  { companyNorm: 'meta', role: 'Software Engineer',         level: 'IC5',     location: 'Bengaluru',    currency: 'INR', experience_years: 9,  base_salary: 7000000n, bonus: 1500000n, stock: 5000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85, is_verified: true },
  { companyNorm: 'meta', role: 'Staff Engineer',            level: 'STAFF',   location: 'San Francisco', currency: 'USD', experience_years: 13, base_salary: 300000n,  bonus: 100000n,  stock: 350000n,    source: 'CONTRIBUTOR', confidence_score: 0.87 },
  { companyNorm: 'meta', role: 'Software Engineer',         level: 'IC4',     location: 'London',       currency: 'GBP', experience_years: 6,  base_salary: 140000n,  bonus: 30000n,   stock: 70000n,     source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'meta', role: 'Research Engineer',         level: 'IC5',     location: 'San Francisco', currency: 'USD', experience_years: 11, base_salary: 250000n,  bonus: 80000n,   stock: 300000n,    source: 'SCRAPED',     confidence_score: 0.72 },

  // ── Microsoft ───────────────────────────────────────────────────────────
  { companyNorm: 'microsoft', role: 'Software Engineer',    level: 'SDE_I',   location: 'Hyderabad',    currency: 'INR', experience_years: 2,  base_salary: 2200000n, bonus: 300000n,  stock: 700000n,    source: 'CONTRIBUTOR', confidence_score: 0.90, is_verified: true },
  { companyNorm: 'microsoft', role: 'Software Engineer',    level: 'SDE_II',  location: 'Hyderabad',    currency: 'INR', experience_years: 5,  base_salary: 3500000n, bonus: 600000n,  stock: 1500000n,   source: 'CONTRIBUTOR', confidence_score: 0.88 },
  { companyNorm: 'microsoft', role: 'Principal Engineer',   level: 'PRINCIPAL',location: 'Hyderabad',   currency: 'INR', experience_years: 16, base_salary: 9000000n, bonus: 2000000n, stock: 5000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85 }, // PRINCIPAL level
  { companyNorm: 'microsoft', role: 'Staff Engineer',       level: 'STAFF',   location: 'Bengaluru',    currency: 'INR', experience_years: 12, base_salary: 7000000n, bonus: 1500000n, stock: 4000000n,   source: 'CONTRIBUTOR', confidence_score: 0.83 },
  { companyNorm: 'microsoft', role: 'Software Engineer',    level: 'SDE_III', location: 'Pune',         currency: 'INR', experience_years: 8,  base_salary: 4500000n, bonus: 800000n,  stock: 2000000n,   source: 'CONTRIBUTOR', confidence_score: 0.82 },

  // ── Flipkart ────────────────────────────────────────────────────────────
  { companyNorm: 'flipkart', role: 'Software Engineer',     level: 'SDE_I',   location: 'Bengaluru',    currency: 'INR', experience_years: 2,  base_salary: 1500000n, bonus: 200000n,  stock: 400000n,    source: 'CONTRIBUTOR', confidence_score: 0.88 },
  { companyNorm: 'flipkart', role: 'Software Engineer',     level: 'SDE_II',  location: 'Bengaluru',    currency: 'INR', experience_years: 5,  base_salary: 2800000n, bonus: 400000n,  stock: 900000n,    source: 'CONTRIBUTOR', confidence_score: 0.85 },
  { companyNorm: 'flipkart', role: 'Senior Engineer',       level: 'SDE_III', location: 'Bengaluru',    currency: 'INR', experience_years: 9,  base_salary: 4500000n, bonus: 700000n,  stock: 2000000n,   source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'flipkart', role: 'Staff Engineer',        level: 'STAFF',   location: 'Bengaluru',    currency: 'INR', experience_years: 13, base_salary: 6500000n, bonus: 1200000n, stock: 3500000n,   source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'flipkart', role: 'Data Scientist',        level: 'L4',      location: 'Bengaluru',    currency: 'INR', experience_years: 4,  base_salary: 2500000n, bonus: 350000n,  stock: 800000n,    source: 'CONTRIBUTOR', confidence_score: 0.78 },

  // ── Meesho ──────────────────────────────────────────────────────────────
  { companyNorm: 'meesho', role: 'Software Engineer',       level: 'SDE_I',   location: 'Bengaluru',    currency: 'INR', experience_years: 1,  base_salary: 1200000n, bonus: 150000n,  stock: 300000n,    source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'meesho', role: 'Software Engineer',       level: 'SDE_II',  location: 'Bengaluru',    currency: 'INR', experience_years: 4,  base_salary: 2200000n, bonus: 300000n,  stock: 700000n,    source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'meesho', role: 'Backend Engineer',        level: 'SDE_III', location: 'Bengaluru',    currency: 'INR', experience_years: 7,  base_salary: 3500000n, bonus: 500000n,  stock: 1200000n,   source: 'CONTRIBUTOR', confidence_score: 0.78 },

  // ── NVIDIA ──────────────────────────────────────────────────────────────
  { companyNorm: 'nvidia', role: 'Software Engineer',       level: 'L4',      location: 'Pune',         currency: 'INR', experience_years: 4,  base_salary: 4000000n, bonus: 700000n,  stock: 2000000n,   source: 'CONTRIBUTOR', confidence_score: 0.88 },
  { companyNorm: 'nvidia', role: 'Senior Engineer',         level: 'L5',      location: 'Pune',         currency: 'INR', experience_years: 8,  base_salary: 7000000n, bonus: 1500000n, stock: 5000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85, is_verified: true },
  { companyNorm: 'nvidia', role: 'ML Engineer',             level: 'L5',      location: 'San Francisco', currency: 'USD', experience_years: 7,  base_salary: 240000n,  bonus: 80000n,   stock: 250000n,    source: 'CONTRIBUTOR', confidence_score: 0.87 },
  { companyNorm: 'nvidia', role: 'Staff Engineer',          level: 'STAFF',   location: 'Pune',         currency: 'INR', experience_years: 12, base_salary: 10000000n,bonus: 2500000n, stock: 8000000n,   source: 'CONTRIBUTOR', confidence_score: 0.83 },

  // ── TCS ─────────────────────────────────────────────────────────────────
  { companyNorm: 'tcs', role: 'Software Engineer',          level: 'L3',      location: 'Mumbai',       currency: 'INR', experience_years: 1,  base_salary: 700000n,  bonus: 50000n,   stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.85 },
  { companyNorm: 'tcs', role: 'Systems Analyst',            level: 'L4',      location: 'Mumbai',       currency: 'INR', experience_years: 5,  base_salary: 1100000n, bonus: 100000n,  stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'tcs', role: 'IT Analyst',                 level: 'L4',      location: 'Delhi',        currency: 'INR', experience_years: 4,  base_salary: 1000000n, bonus: 80000n,   stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'tcs', role: 'Technical Lead',             level: 'L5',      location: 'Hyderabad',    currency: 'INR', experience_years: 9,  base_salary: 1600000n, bonus: 150000n,  stock: 100000n,    source: 'CONTRIBUTOR', confidence_score: 0.78 },
  { companyNorm: 'tcs', role: 'Project Manager',            level: 'L6',      location: 'Pune',         currency: 'INR', experience_years: 14, base_salary: 2200000n, bonus: 250000n,  stock: 200000n,    source: 'CONTRIBUTOR', confidence_score: 0.75 },

  // ── Infosys ─────────────────────────────────────────────────────────────
  { companyNorm: 'infosys', role: 'Software Engineer',      level: 'L3',      location: 'Bengaluru',    currency: 'INR', experience_years: 1,  base_salary: 800000n,  bonus: 60000n,   stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.83 },
  { companyNorm: 'infosys', role: 'Senior Engineer',        level: 'L4',      location: 'Bengaluru',    currency: 'INR', experience_years: 5,  base_salary: 1300000n, bonus: 120000n,  stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'infosys', role: 'Tech Lead',              level: 'L5',      location: 'Pune',         currency: 'INR', experience_years: 10, base_salary: 2000000n, bonus: 200000n,  stock: 150000n,    source: 'CONTRIBUTOR', confidence_score: 0.77 },

  // ── Wipro ───────────────────────────────────────────────────────────────
  { companyNorm: 'wipro', role: 'Software Engineer',        level: 'SDE_I',   location: 'Bengaluru',    currency: 'INR', experience_years: 2,  base_salary: 750000n,  bonus: 50000n,   stock: 0n,         source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'wipro', role: 'Senior Engineer',          level: 'SDE_II',  location: 'Hyderabad',    currency: 'INR', experience_years: 6,  base_salary: 1400000n, bonus: 130000n,  stock: 50000n,     source: 'CONTRIBUTOR', confidence_score: 0.79 },
  { companyNorm: 'wipro', role: 'Project Lead',             level: 'L5',      location: 'Delhi',        currency: 'INR', experience_years: 11, base_salary: 2100000n, bonus: 200000n,  stock: 100000n,    source: 'CONTRIBUTOR', confidence_score: 0.76 },

  // ── Razorpay ────────────────────────────────────────────────────────────
  { companyNorm: 'razorpay', role: 'Software Engineer',     level: 'SDE_I',   location: 'Bengaluru',    currency: 'INR', experience_years: 1,  base_salary: 1400000n, bonus: 150000n,  stock: 500000n,    source: 'CONTRIBUTOR', confidence_score: 0.87 },
  { companyNorm: 'razorpay', role: 'Software Engineer',     level: 'SDE_II',  location: 'Bengaluru',    currency: 'INR', experience_years: 4,  base_salary: 2600000n, bonus: 350000n,  stock: 1000000n,   source: 'CONTRIBUTOR', confidence_score: 0.85, is_verified: true },
  { companyNorm: 'razorpay', role: 'Staff Engineer',        level: 'STAFF',   location: 'Bengaluru',    currency: 'INR', experience_years: 11, base_salary: 5500000n, bonus: 1000000n, stock: 3000000n,   source: 'CONTRIBUTOR', confidence_score: 0.82 },
  { companyNorm: 'razorpay', role: 'Backend Engineer',      level: 'SDE_III', location: 'Bengaluru',    currency: 'INR', experience_years: 8,  base_salary: 4000000n, bonus: 600000n,  stock: 1800000n,   source: 'CONTRIBUTOR', confidence_score: 0.83 },

  // ── Zepto ───────────────────────────────────────────────────────────────
  { companyNorm: 'zepto', role: 'Software Engineer',        level: 'SDE_I',   location: 'Mumbai',       currency: 'INR', experience_years: 1,  base_salary: 1100000n, bonus: 100000n,  stock: 300000n,    source: 'CONTRIBUTOR', confidence_score: 0.80 },
  { companyNorm: 'zepto', role: 'Software Engineer',        level: 'SDE_II',  location: 'Mumbai',       currency: 'INR', experience_years: 3,  base_salary: 2000000n, bonus: 250000n,  stock: 700000n,    source: 'CONTRIBUTOR', confidence_score: 0.78 },
  { companyNorm: 'zepto', role: 'Senior Engineer',          level: 'SDE_III', location: 'Mumbai',       currency: 'INR', experience_years: 7,  base_salary: 3200000n, bonus: 400000n,  stock: 1200000n,   source: 'CONTRIBUTOR', confidence_score: 0.76 },
  { companyNorm: 'zepto', role: 'Staff Engineer',           level: 'STAFF',   location: 'Mumbai',       currency: 'INR', experience_years: 12, base_salary: 5000000n, bonus: 800000n,  stock: 2500000n,   source: 'CONTRIBUTOR', confidence_score: 0.74 },

  // Extra records to reach 61+
{ companyNorm: 'google',    role: 'ML Engineer',          level: 'L5',     location: 'Bengaluru',  currency: 'INR', experience_years: 7,  base_salary: 6000000n, bonus: 1200000n, stock: 3500000n, source: 'CONTRIBUTOR', confidence_score: 0.88 },
{ companyNorm: 'amazon',    role: 'Data Engineer',         level: 'SDE_II', location: 'Pune',       currency: 'INR', experience_years: 5,  base_salary: 2900000n, bonus: 400000n,  stock: 1100000n, source: 'CONTRIBUTOR', confidence_score: 0.83 },
{ companyNorm: 'meta',      role: 'Frontend Engineer',     level: 'IC4',    location: 'Hyderabad',  currency: 'INR', experience_years: 5,  base_salary: 4200000n, bonus: 800000n,  stock: 2200000n, source: 'CONTRIBUTOR', confidence_score: 0.85 },
{ companyNorm: 'microsoft', role: 'DevOps Engineer',       level: 'SDE_II', location: 'Delhi',      currency: 'INR', experience_years: 4,  base_salary: 3200000n, bonus: 500000n,  stock: 1300000n, source: 'CONTRIBUTOR', confidence_score: 0.82 },
{ companyNorm: 'nvidia',    role: 'AI Research Engineer',  level: 'IC5',    location: 'Bengaluru',  currency: 'INR', experience_years: 10, base_salary: 9000000n, bonus: 2000000n, stock: 6000000n, source: 'CONTRIBUTOR', confidence_score: 0.90 },
{ companyNorm: 'razorpay',  role: 'Platform Engineer',     level: 'L4',     location: 'Bengaluru',  currency: 'INR', experience_years: 3,  base_salary: 2400000n, bonus: 300000n,  stock: 800000n,  source: 'CONTRIBUTOR', confidence_score: 0.81 },
];

// ────────────────────────────────────────────────────────────────────────────
// Seed runner
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding TalentDash database...\n');

  // ── 1. Upsert companies (by normalized_name) ──────────────────────────────
  //   The three Google variants will all resolve to the same Company row.
  const companyIdMap = new Map<string, string>(); // normalized_name → id

  for (const c of COMPANY_INPUTS) {
    const normalized = normalizeCompanyName(c.rawName);
    const slug = slugify(normalized);

    if (companyIdMap.has(normalized)) {
      console.log(`  ↩  "${c.rawName}" → already exists as "${normalized}" (slug: ${slug})`);
      continue;
    }

    const company = await prisma.company.upsert({
      where:  { slug },
      update: {},
      create: {
        name:            c.rawName,
        slug,
        normalized_name: normalized,
        industry:        c.industry ?? null,
        headquarters:    c.headquarters ?? null,
        founded_year:    (c as any).founded_year ?? null,
      },
    });

    companyIdMap.set(normalized, company.id);
    console.log(`  ✔  Company: "${c.rawName}" → normalized: "${normalized}", slug: "${slug}"`);
  }

  // Verify normalisation: all three Google variants → one company
  const googleVariants = ['Google India', 'GOOGLE', 'google.'];
  const googleIds = googleVariants.map(n => companyIdMap.get(normalizeCompanyName(n)));
  const uniqueGoogleIds = new Set(googleIds.filter(Boolean));
  console.log(`\n  🔍  Normalisation check: ${googleVariants.join(', ')} → ${uniqueGoogleIds.size} unique company record(s)`);
  if (uniqueGoogleIds.size !== 1) {
    throw new Error('NORMALISATION FAILURE: Google variants resolved to multiple companies!');
  }
  console.log(`  ✅  Normalisation confirmed: all Google variants → same company ID\n`);

  // ── 2. Insert salary records ──────────────────────────────────────────────
  let created = 0;
  for (const s of SALARY_RECORDS) {
    const companyId = companyIdMap.get(s.companyNorm);
    if (!companyId) {
      console.warn(`  ⚠️  No company found for normalized name: "${s.companyNorm}" — skipping`);
      continue;
    }

    const totalComp = computeTC(s.base_salary, s.bonus, s.stock);

    await prisma.salary.create({
      data: {
        company_id:          companyId,
        role:                s.role,
        level:               s.level,
        location:            s.location,
        currency:            s.currency,
        experience_years:    s.experience_years,
        base_salary:         s.base_salary,
        bonus:               s.bonus,
        stock:               s.stock,
        total_compensation:  totalComp,
        source:              s.source,
        confidence_score:    s.confidence_score,
        is_verified:         s.is_verified ?? false,
      },
    });
    created++;
  }

  console.log(`\n  💰  ${created} salary records seeded`);
  console.log('\n  Edge cases present in seed:');
  console.log('    • Zero bonus:  Google L4 Hyderabad');
  console.log('    • Zero stock:  Google L5 Mumbai');
  console.log('    • Very high equity (800k stock): Google Principal San Francisco');
  console.log('    • Principal level: Google, Amazon, Microsoft');
  console.log('    • All levels L3→Principal covered');
  console.log('    • Multiple currencies: INR, USD, GBP');
  console.log('    • Multiple cities: Bengaluru, Mumbai, Hyderabad, Pune, Delhi, SF, London');
  console.log('\n✅  Seed complete!\n');
}

main()
  .catch(e => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
