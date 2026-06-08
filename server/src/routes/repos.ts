import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { RepoConfig } from '../types';
import { loadState, saveState } from '../store/state';

export const repoRouter = Router();

repoRouter.get('/', (_req: Request, res: Response) => {
  const state = loadState();
  res.json(state.repos);
});

repoRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { url, name, branch } = req.body;
    if (!url) return res.status(400).json({ error: 'Repository URL is required' });

    const state = loadState();
    const repoName = name || url.split('/').pop()?.replace('.git', '') || `repo-${Date.now()}`;
    const repoPath = join(state.config.workspacePath, repoName);

    if (!existsSync(state.config.workspacePath)) {
      mkdirSync(state.config.workspacePath, { recursive: true });
    }

    if (existsSync(repoPath)) {
      rmSync(repoPath, { recursive: true, force: true });
    }

    const git = simpleGit();
    await git.clone(url, repoPath, branch ? ['--branch', branch, '--depth', '1'] : ['--depth', '1']);

    const repo: RepoConfig = {
      id: uuidv4(),
      name: repoName,
      url,
      branch: branch || 'main',
      localPath: repoPath,
      addedAt: new Date().toISOString()
    };

    state.repos.push(repo);
    saveState(state);
    res.status(201).json(repo);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clone repository' });
  }
});

repoRouter.post('/:id/pull', async (req: Request, res: Response) => {
  try {
    const state = loadState();
    const repo = state.repos.find(r => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const git = simpleGit(repo.localPath);
    await git.pull();
    res.json({ message: 'Repository updated successfully', repo });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to pull repository' });
  }
});

repoRouter.delete('/:id', (req: Request, res: Response) => {
  const state = loadState();
  const repo = state.repos.find(r => r.id === req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });

  if (existsSync(repo.localPath)) {
    rmSync(repo.localPath, { recursive: true, force: true });
  }

  const repoId = req.params.id as string;
  state.repos = state.repos.filter(r => r.id !== repoId);
  delete state.checkResults[repoId];
  saveState(state);
  res.json({ message: 'Repository removed' });
});

repoRouter.post('/pull-all', async (_req: Request, res: Response) => {
  const state = loadState();
  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const repo of state.repos) {
    try {
      const git = simpleGit(repo.localPath);
      await git.pull();
      results.push({ name: repo.name, success: true });
    } catch (error: any) {
      results.push({ name: repo.name, success: false, error: error.message });
    }
  }

  res.json({ results });
});
