import express from 'express';
import cors from 'cors';
import { repoRouter } from './routes/repos';
import { checkRouter } from './routes/checks';
import { configRouter } from './routes/config';

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.use('/api/repos', repoRouter);
app.use('/api/checks', checkRouter);
app.use('/api/config', configRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
