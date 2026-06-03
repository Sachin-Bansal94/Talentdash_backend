import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { serializeSalary } from './ingest-salary';

const router = Router();

router.get('/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  const company = await prisma.company.findUnique({
    where: { slug },
    include: {
      salaries: {
        orderBy: { total_compensation: 'desc' },
      },
    },
  });

  if (!company) {
    return res.status(404).json({ error: true, message: 'Company not found' });
  }

  const salaries = company.salaries;

  // ── True statistical median of total_compensation ──────────────────────
  // Salaries are already sorted desc; we need asc for median
  const sorted = [...salaries].sort((a, b) =>
    a.total_compensation < b.total_compensation ? -1 :
    a.total_compensation > b.total_compensation ?  1 : 0
  );

  let medianTC: bigint | null = null;
  if (sorted.length > 0) {
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      // Odd: middle element
      medianTC = sorted[mid].total_compensation;
    } else {
      // Even: average of two middle elements
      medianTC = (sorted[mid - 1].total_compensation + sorted[mid].total_compensation) / 2n;
    }
  }

  // ── Level distribution ─────────────────────────────────────────────────
  const levelDistribution: Record<string, number> = {};
  for (const s of salaries) {
    levelDistribution[s.level] = (levelDistribution[s.level] ?? 0) + 1;
  }

  return res.json({
    company: {
      id:              company.id,
      name:            company.name,
      slug:            company.slug,
      normalized_name: company.normalized_name,
      industry:        company.industry,
      headquarters:    company.headquarters,
      founded_year:    company.founded_year,
      headcount_range: company.headcount_range,
      created_at:      company.created_at,
      updated_at:      company.updated_at,
    },
    median_total_compensation: medianTC?.toString() ?? null,
    level_distribution:        levelDistribution,
    salaries:                  salaries.map(serializeSalary),
  });
});

export default router;
