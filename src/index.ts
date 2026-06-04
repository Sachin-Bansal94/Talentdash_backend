import express from 'express';
import { json } from 'express';

import ingestSalaryRouter from './routes/ingest-salary';
import salariesRouter     from './routes/salaries';
import companiesRouter    from './routes/companies';
import compareRouter      from './routes/compare';

const app = express();

app.use(json());

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  name: 'TalentDash API',
  version: '1.0.0',
  status: 'running',
  endpoints: {
    health:  'GET /health',
    salaries: 'GET /api/salaries',
    ingest:  'POST /api/ingest-salary',
    company: 'GET /api/companies/:slug',
    compare: 'GET /api/compare?s1=uuid&s2=uuid',
  },
  live_examples: {
    health:       'https://talentdash-backend-2yo6.onrender.com/health',
    salaries:     'https://talentdash-backend-2yo6.onrender.com/api/salaries',
    google:       'https://talentdash-backend-2yo6.onrender.com/api/companies/google',
    filter:       'https://talentdash-backend-2yo6.onrender.com/api/salaries?company=google&level=L5',
  },
  docs: 'https://github.com/Sachin-Bansal94/Talentdash_backend',
}));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/ingest-salary', ingestSalaryRouter);
app.use('/api/salaries',      salariesRouter);
app.use('/api/companies',     companiesRouter);
app.use('/api/compare',       compareRouter);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: true, message: 'Route not found' }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`TalentDash API running on port ${PORT}`);
});

export default app;