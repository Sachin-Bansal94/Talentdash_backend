import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { SalaryQuerySchema } from '../lib/validators';
import { prisma } from '../lib/prisma';
import { serializeSalary } from './ingest-salary';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  // ── Parse & validate query params ──────────────────────────────────────
  let query;
  try {
    query = SalaryQuerySchema.parse(req.query);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: true, message: err.errors[0].message });
    }
    return res.status(400).json({ error: true, message: 'Invalid query parameters' });
  }

  const { company, role, level, location, currency, sort, page, limit } = query;

  // ── Build WHERE clause ──────────────────────────────────────────────────
  const where: any = {};

  if (company) {
    where.company = {
      name: { contains: company, mode: 'insensitive' },  // ILIKE
    };
  }
  if (role)     where.role     = { contains: role,     mode: 'insensitive' };
  if (level)    where.level    = level;
  if (location) where.location = { contains: location, mode: 'insensitive' };
  if (currency) where.currency = currency;

  // ── Build ORDER BY ──────────────────────────────────────────────────────
  const orderBy =
    sort === 'total_comp_asc'  ? { total_compensation: 'asc'  as const } :
    sort === 'date_desc'       ? { submitted_at:        'desc' as const } :
                                 { total_compensation: 'desc' as const }; // default

  // ── Pagination — HARD REQUIRED: never return unbounded rows ────────────
  const safePage  = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit)); // cap at 100
  const skip = (safePage - 1) * safeLimit;

  // ── Execute count + data in parallel ───────────────────────────────────
  const [total, rows] = await Promise.all([
    prisma.salary.count({ where }),
    prisma.salary.findMany({
      where,
      orderBy,
      skip,
      take: safeLimit,
      include: { company: true },
    }),
  ]);

  return res.json({
    data: rows.map(serializeSalary),
    meta: {
      total,
      page:       safePage,
      limit:      safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
});

export default router;
