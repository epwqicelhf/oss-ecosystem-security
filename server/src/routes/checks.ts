import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import { runAllChecks, createCheckContext } from '../checker/engine';
import { loadState, saveState } from '../store/state';
import type { CheckResult, CheckSummary } from '../types';
import { SEVERITY_WEIGHTS } from '../types';

export const checkRouter = Router();

function computeResult(repo: { id: string; name: string }, probes: ReturnType<typeof runAllChecks>, enabledCategories: string[]): CheckResult {
  const filteredProbes = probes.filter(p => enabledCategories.includes(p.category));

  let totalWeightedScore = 0;
  let totalWeightSum = 0;

  for (const probe of filteredProbes) {
    const probeScore = probe.maxScore > 0 ? (probe.score / probe.maxScore) * 10 : 0;
    totalWeightedScore += probeScore * probe.weight;
    totalWeightSum += probe.weight;
  }

  const normalizedScore = totalWeightSum > 0 ? Math.round(totalWeightedScore / totalWeightSum * 10) / 10 : 0;

  const summary: CheckSummary = {
    pass: filteredProbes.filter(p => p.outcome === 'pass').length,
    fail: filteredProbes.filter(p => p.outcome === 'fail').length,
    warning: filteredProbes.filter(p => p.outcome === 'warning').length,
    notApplicable: filteredProbes.filter(p => p.outcome === 'not_applicable').length,
    criticalRisk: filteredProbes.filter(p => p.severity === 'critical' && p.outcome !== 'pass').length,
    highRisk: filteredProbes.filter(p => p.severity === 'high' && p.outcome !== 'pass').length,
    mediumRisk: filteredProbes.filter(p => p.severity === 'medium' && p.outcome !== 'pass').length,
    lowRisk: filteredProbes.filter(p => p.severity === 'low' && p.outcome !== 'pass').length
  };

  return {
    repoId: repo.id,
    repoName: repo.name,
    checkedAt: new Date().toISOString(),
    totalWeightedScore: Math.round(totalWeightedScore * 100) / 100,
    totalWeightSum: Math.round(totalWeightSum * 100) / 100,
    normalizedScore,
    probes: filteredProbes,
    summary,
    scoreFormula: 'Total = ∑(item_score × weight) / ∑(weights). Critical=10, High=7.5, Medium=5, Low=2.5',
    scoreFormula_zh: '总分 = ∑(单项得分 × 权重) / ∑(权重和)。Critical=10, High=7.5, Medium=5, Low=2.5'
  };
}

checkRouter.post('/run/:repoId', (req: Request, res: Response) => {
  try {
    const state = loadState();
    const repo = state.repos.find(r => r.id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (!existsSync(repo.localPath)) return res.status(404).json({ error: 'Repository path does not exist' });

    const ctx = createCheckContext(repo.localPath, repo.name, state.config.commitDepth);
    const probes = runAllChecks(ctx);
    const result = computeResult(repo, probes, state.config.enabledCategories);

    if (!state.checkResults[repo.id]) state.checkResults[repo.id] = [];
    state.checkResults[repo.id].unshift(result);
    if (state.checkResults[repo.id].length > 50) state.checkResults[repo.id] = state.checkResults[repo.id].slice(0, 50);

    repo.lastChecked = result.checkedAt;
    saveState(state);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Check failed' });
  }
});

checkRouter.post('/run-all', (_req: Request, res: Response) => {
  const state = loadState();
  const results: CheckResult[] = [];
  const errors: { repo: string; error: string }[] = [];

  for (const repo of state.repos) {
    try {
      if (!existsSync(repo.localPath)) { errors.push({ repo: repo.name, error: 'Path does not exist' }); continue; }
      const ctx = createCheckContext(repo.localPath, repo.name, state.config.commitDepth);
      const probes = runAllChecks(ctx);
      const result = computeResult(repo, probes, state.config.enabledCategories);

      if (!state.checkResults[repo.id]) state.checkResults[repo.id] = [];
      state.checkResults[repo.id].unshift(result);
      repo.lastChecked = result.checkedAt;
      results.push(result);
    } catch (error: any) {
      errors.push({ repo: repo.name, error: error.message });
    }
  }

  saveState(state);
  res.json({ results, errors });
});

checkRouter.get('/results/:repoId', (req: Request, res: Response) => {
  const state = loadState();
  const repoId = req.params.repoId as string;
  res.json(state.checkResults[repoId] || []);
});

checkRouter.get('/results', (_req: Request, res: Response) => {
  const state = loadState();
  const allResults: Record<string, CheckResult[]> = {};
  for (const repo of state.repos) {
    const results = state.checkResults[repo.id];
    if (results && results.length > 0) allResults[repo.id] = [results[0]];
  }
  res.json(allResults);
});
