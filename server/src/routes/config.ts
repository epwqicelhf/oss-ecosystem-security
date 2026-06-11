import { Router, Request, Response } from 'express';
import { loadState, saveState } from '../store/state';
import { CATEGORY_SEVERITY, SEVERITY_WEIGHTS, PLATFORMS } from '../types';
import type { CheckCategory } from '../types';

export const configRouter = Router();

configRouter.get('/', (_req: Request, res: Response) => {
  const state = loadState();
  res.json(state.config);
});

configRouter.put('/', (req: Request, res: Response) => {
  const state = loadState();
  state.config = { ...state.config, ...req.body };
  saveState(state);
  res.json(state.config);
});

configRouter.get('/categories', (_req: Request, res: Response) => {
  const categories = Object.entries(CATEGORY_SEVERITY).map(([id, severity]) => ({
    id, severity, weight: SEVERITY_WEIGHTS[severity],
    name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    name_zh: ({
      'maintained': '维护状态', 'code-review': '代码审查', 'branch-protection': '分支保护',
      'ci-tests': 'CI/测试', 'dangerous-workflow': '危险工作流', 'dependency-update': '依赖更新',
      'fuzzing': '模糊测试', 'license': '许可证', 'packaging': '打包',
      'permissions': '令牌权限', 'pinned-dependencies': '依赖锁定', 'sast': '静态分析',
      'security-policy': '安全策略', 'signed-releases': '签名发布', 'vulnerabilities': '漏洞',
      'binary-artifacts': '二进制制品', 'contributors': '贡献者', 'sbom': 'SBOM',
    } as Record<CheckCategory, string>)[id as CheckCategory] || id,
    description: `Check ${id}`,
    description_zh: `检查 ${id}`,
  }));
  categories.sort((a, b) => b.weight - a.weight);
  res.json(categories);
});

configRouter.get('/platforms', (_req: Request, res: Response) => {
  res.json(PLATFORMS);
});
