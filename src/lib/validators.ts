import { z } from 'zod';

export const VALID_LEVELS = [
  'L3', 'L4', 'L5', 'L6',
  'SDE_I', 'SDE_II', 'SDE_III',
  'STAFF', 'PRINCIPAL',
  'IC4', 'IC5',
] as const;

export const VALID_CURRENCIES = ['INR', 'USD', 'GBP', 'EUR'] as const;
export const VALID_SOURCES = ['CONTRIBUTOR', 'SCRAPED', 'AI_INFERRED'] as const;

// ─── Ingest Salary ────────────────────────────────────────────────────────────

export const IngestSalarySchema = z.object({
  company_name: z.string().min(1, 'company_name is required'),
  role: z.string().min(1, 'role is required'),
  level: z.enum(VALID_LEVELS, {
    errorMap: () => ({
      message: `Level must be one of: ${VALID_LEVELS.join(', ')}`,
    }),
  }),
  location: z.string().min(1, 'location is required'),
  currency: z.enum(VALID_CURRENCIES, {
    errorMap: () => ({ message: `Currency must be one of: ${VALID_CURRENCIES.join(', ')}` }),
  }),
  experience_years: z
    .number({ invalid_type_error: 'experience_years must be a number' })
    .int('experience_years must be an integer')
    .gt(0, 'experience_years must be greater than 0')
    .lt(51, 'experience_years must be less than 51'),
  base_salary: z
    .number({ invalid_type_error: 'base_salary must be a number' })
    .gt(0, 'base_salary must be greater than 0'),
  bonus: z.number().min(0, 'bonus cannot be negative').optional().default(0),
  stock: z.number().min(0, 'stock cannot be negative').optional().default(0),
  // total_compensation from client is intentionally stripped — we recompute it
  total_compensation: z.number().optional(),
  source: z.enum(VALID_SOURCES, {
    errorMap: () => ({ message: `Source must be one of: ${VALID_SOURCES.join(', ')}` }),
  }),
  confidence_score: z
    .number({ invalid_type_error: 'confidence_score must be a number' })
    .min(0.0, 'confidence_score must be >= 0.0')
    .max(1.0, 'confidence_score must be <= 1.0'),
  is_verified: z.boolean().optional().default(false),
  submitted_at: z.string().datetime().optional(),
});

export type IngestSalaryInput = z.infer<typeof IngestSalarySchema>;

// ─── Query Salaries ───────────────────────────────────────────────────────────

export const SalaryQuerySchema = z.object({
  company: z.string().optional(),
  role: z.string().optional(),
  level: z.enum(VALID_LEVELS).optional(),
  location: z.string().optional(),
  currency: z.enum(VALID_CURRENCIES).optional(),
  sort: z.enum(['total_comp_desc', 'total_comp_asc', 'date_desc']).optional().default('total_comp_desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type SalaryQueryInput = z.infer<typeof SalaryQuerySchema>;
