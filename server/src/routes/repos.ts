import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadState, saveState } from '../store/state';
import { detectPlatform, parseRepoUrl } from '../types';
import type { Platform } from '../types';

export const repoRouter = Router();

repoRouter.get('/', (_req: Request, res: Response) => {
  const state = loadState();
  res.json(state.repos.map(r => ({ ...r, apiToken: undefined })));
});

repoRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { url, name, branch, platform: manualPlatform, apiToken } = req.body;
    if (!url) return res.status(400).json({ error: 'Repository URL is required' });

    const state = loadState();
    const parsed = parseRepoUrl(url);
    const repoName = name || parsed.repo || `repo-${Date.now()}`;
    const platform: Platform = manualPlatform || parsed.platform;
    const localDir = parsed.owner ? join(parsed.owner, repoName) : repoName;
    const repoPath = join(state.config.workspacePath, localDir);

    if (!existsSync(state.config.workspacePath)) mkdirSync(state.config.workspacePath, { recursive: true });
    if (existsSync(repoPath)) rmSync(repoPath, { recursive: true, force: true });

    const proxyUrl = state.config.proxy?.https || state.config.proxy?.http;
    const gitOpts: Record<string, any> = { timeout: { block: 300000 } };
    if (proxyUrl) {
      gitOpts.config = [
        { key: 'http.proxy', value: proxyUrl },
        { key: 'https.proxy', value: proxyUrl },
      ];
    }
    const git = simpleGit(gitOpts);

    let clonedBranch = branch || '';
    let cloneArgs = ['--depth', '1'];
    if (branch) cloneArgs.push('--branch', branch);

    try {
      await git.clone(url, repoPath, cloneArgs);
    } catch (branchErr: any) {
      const msg = (branchErr.message || '').toLowerCase();
      if (msg.includes('remote error') || msg.includes('not found') || msg.includes('could not find') || msg.includes('fatal')) {
        if (existsSync(repoPath)) rmSync(repoPath, { recursive: true, force: true });
        cloneArgs = ['--depth', '1'];
        await git.clone(url, repoPath, cloneArgs);
        clonedBranch = '';
      } else {
        throw branchErr;
      }
    }

    const repoGit = simpleGit(repoPath);
    let actualBranch = clonedBranch;
    if (!actualBranch) {
      try {
        actualBranch = (await repoGit.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
      } catch { actualBranch = branch || 'main'; }
    }

    const repo = {
      id: uuidv4(), name: repoName, url,
      owner: parsed.owner, repo: parsed.repo,
      branch: actualBranch, localPath: repoPath,
      addedAt: new Date().toISOString(),
      platform, apiToken,
    };

    state.repos.push(repo);
    saveState(state);
    const { apiToken: _, ...safe } = repo;
    res.status(201).json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clone repository' });
  }
});

repoRouter.post('/:id/pull', async (req: Request, res: Response) => {
  try {
    const state = loadState();
    const repo = state.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    const proxyUrl = state.config.proxy?.https || state.config.proxy?.http;
    const gitOpts: Record<string, any> = { timeout: { block: 120000 } };
    if (proxyUrl) {
      gitOpts.config = [
        { key: 'http.proxy', value: proxyUrl },
        { key: 'https.proxy', value: proxyUrl },
      ];
    }
    const git = simpleGit(repo.localPath, gitOpts);
    await git.pull();
    res.json({ message: 'Repository updated', repo: { ...repo, apiToken: undefined } });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to pull' });
  }
});

repoRouter.delete('/:id', (req: Request, res: Response) => {
  const state = loadState();
  const repoId = req.params.id as string;
  const repo = state.repos.find(r => r.id === repoId);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  if (existsSync(repo.localPath)) rmSync(repo.localPath, { recursive: true, force: true });
  state.repos = state.repos.filter(r => r.id !== repoId);
  delete state.checkResults[repoId];
  saveState(state);
  res.json({ message: 'Repository removed' });
});

repoRouter.post('/pull-all', async (_req: Request, res: Response) => {
  const state = loadState();
  const results: { name: string; success: boolean; error?: string }[] = [];
  const proxyUrl = state.config.proxy?.https || state.config.proxy?.http;
  const gitOpts: Record<string, any> = { timeout: { block: 120000 } };
  if (proxyUrl) {
    gitOpts.config = [
      { key: 'http.proxy', value: proxyUrl },
      { key: 'https.proxy', value: proxyUrl },
    ];
  }
  for (const repo of state.repos) {
    try {
      const git = simpleGit(repo.localPath, gitOpts);
      await git.pull();
      results.push({ name: repo.name, success: true });
    }
    catch (error: any) { results.push({ name: repo.name, success: false, error: error.message }); }
  }
  res.json({ results });
});
