import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { IngestSalarySchema } from '../lib/validators';
import { findOrCreateCompany } from '../lib/company';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  // ── Step 1: Validate input ──────────────────────────────────────────────
  let parsed;
  try {
    parsed = IngestSalarySchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.errors[0];
      return res.status(400).json({
        error: true,
        field: first.path.join('.') || 'unknown',
        message: first.message,
      });
    }
    return res.status(400).json({ error: true, field: 'unknown', message: 'Invalid request body' });
  }

  // ── Step 2: Normalise company & find/create ─────────────────────────────
  let companyId: string;
  try {
    companyId = await findOrCreateCompany(parsed.company_name);
  } catch (err) {
    return res.status(500).json({ error: true, message: 'Failed to resolve company' });
  }

  // ── Step 3: Recompute total_compensation — NEVER trust client value ──────
  const baseSalary = BigInt(Math.round(parsed.base_salary));
  const bonus = BigInt(Math.round(parsed.bonus ?? 0));
  const stock = BigInt(Math.round(parsed.stock ?? 0));
  const totalComp = baseSalary + bonus + stock;

  // ── Step 4: Duplicate check (same company+role+level+location, last 48h, base within 10%) ──
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const lowerBound = baseSalary * 90n / 100n;
  const upperBound = baseSalary * 110n / 100n;

  const duplicate = await prisma.salary.findFirst({
    where: {
      company_id: companyId,
      role: parsed.role,
      level: parsed.level,
      location: parsed.location,
      submitted_at: { gte: fortyEightHoursAgo },
      base_salary: { gte: lowerBound, lte: upperBound },
    },
  });

  if (duplicate) {
    return res.status(409).json({
      error: true,
      message: `A similar salary record for ${parsed.role} at this company was already submitted in the last 48 hours (ID: ${duplicate.id}). If this is a different record, please wait 48 hours or adjust the base salary.`,
    });
  }

  // ── Step 5: Store ───────────────────────────────────────────────────────
  try {
    const salary = await prisma.salary.create({
      data: {
        company_id: companyId,
        role: parsed.role,
        level: parsed.level,
        location: parsed.location,
        currency: parsed.currency,
        experience_years: parsed.experience_years,
        base_salary: baseSalary,
        bonus,
        stock,
        total_compensation: totalComp,
        source: parsed.source,
        confidence_score: parsed.confidence_score,
        is_verified: parsed.is_verified ?? false,
        submitted_at: new Date(), // Always server-side timestamp, never trust client
      },
      include: { company: true },
    });

    return res.status(201).json(serializeSalary(salary));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: true, message: 'Duplicate record' });
    }
    console.error('ingest-salary error:', err);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
});

// BigInt-safe serializer
export function serializeSalary(salary: any) {
  return {
    ...salary,
    base_salary: salary.base_salary.toString(),
    bonus: salary.bonus.toString(),
    stock: salary.stock.toString(),
    total_compensation: salary.total_compensation.toString(),
    confidence_score: Number(salary.confidence_score),
  };
}

export default router;