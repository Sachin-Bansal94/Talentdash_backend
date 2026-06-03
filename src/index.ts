import express from 'express';
import { json } from 'express';

import ingestSalaryRouter from './routes/ingest-salary';
import salariesRouter     from './routes/salaries';
import companiesRouter    from './routes/companies';
import compareRouter      from './routes/compare';

const app = express();

app.use(json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/ingest-salary', ingestSalaryRouter);
app.use('/api/salaries',      salariesRouter);
app.use('/api/companies',     companiesRouter);
app.use('/api/compare',       compareRouter);

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: true, message: 'Route not found' }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`TalentDash API running on port ${PORT}`);
});

export default app;
