import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { serializeSalary } from './ingest-salary';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { s1, s2 } = req.query;

  if (!s1 || !s2) {
    return res.status(400).json({ error: true, message: 's1 and s2 query parameters are required' });
  }

  if (s1 === s2) {
    return res.status(400).json({ error: true, message: 's1 and s2 must be different salary record IDs' });
  }

  const [record1, record2] = await Promise.all([
    prisma.salary.findUnique({ where: { id: s1 as string }, include: { company: true } }),
    prisma.salary.findUnique({ where: { id: s2 as string }, include: { company: true } }),
  ]);

  if (!record1) {
    return res.status(404).json({ error: true, message: `Salary record not found: ${s1}` });
  }
  if (!record2) {
    return res.status(404).json({ error: true, message: `Salary record not found: ${s2}` });
  }

  // Delta = record1 value − record2 value
  // Positive = record 1 is higher; Negative = record 2 is higher
  const delta = {
    base_delta:       Number(record1.base_salary)        - Number(record2.base_salary),
    bonus_delta:      Number(record1.bonus)              - Number(record2.bonus),
    stock_delta:      Number(record1.stock)              - Number(record2.stock),
    tc_delta:         Number(record1.total_compensation) - Number(record2.total_compensation),
    experience_delta: record1.experience_years           - record2.experience_years,
  };

  return res.json({
    record_1: serializeSalary(record1),
    record_2: serializeSalary(record2),
    delta,
  });
});

export default router;
