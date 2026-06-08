import { Router, Request, Response } from 'express';
import { loadState, saveState } from '../store/state';

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
  const categories = [
    { id: 'code-review', name: 'Code Review', name_zh: '代码审查', severity: 'critical', weight: 10, description: 'Check that code review is required before merging', description_zh: '检查合并前是否要求代码审查' },
    { id: 'branch-protection', name: 'Branch Protection', name_zh: '分支保护', severity: 'critical', weight: 10, description: 'Check that branches are protected', description_zh: '检查分支是否受保护' },
    { id: 'dangerous-workflow', name: 'Dangerous Workflow', name_zh: '危险工作流', severity: 'critical', weight: 10, description: 'Check for dangerous CI/CD patterns', description_zh: '检查危险的 CI/CD 模式' },
    { id: 'permissions', name: 'Token Permissions', name_zh: '令牌权限', severity: 'critical', weight: 10, description: 'Check workflow token permissions', description_zh: '检查工作流令牌权限' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', name_zh: '漏洞', severity: 'critical', weight: 10, description: 'Check for known vulnerabilities', description_zh: '检查已知漏洞' },
    { id: 'maintained', name: 'Maintained', name_zh: '维护状态', severity: 'high', weight: 7.5, description: 'Check if the project is actively maintained', description_zh: '检查项目是否积极维护' },
    { id: 'ci-tests', name: 'CI/Tests', name_zh: 'CI/测试', severity: 'high', weight: 7.5, description: 'Check that tests run in CI', description_zh: '检查测试是否在 CI 中运行' },
    { id: 'pinned-dependencies', name: 'Pinned Dependencies', name_zh: '依赖锁定', severity: 'high', weight: 7.5, description: 'Check dependency pinning', description_zh: '检查依赖锁定' },
    { id: 'sast', name: 'SAST', name_zh: '静态分析', severity: 'high', weight: 7.5, description: 'Check for static analysis tools', description_zh: '检查静态分析工具' },
    { id: 'security-policy', name: 'Security Policy', name_zh: '安全策略', severity: 'high', weight: 7.5, description: 'Check for security policy', description_zh: '检查安全策略' },
    { id: 'signed-releases', name: 'Signed Releases', name_zh: '签名发布', severity: 'high', weight: 7.5, description: 'Check for signed releases', description_zh: '检查签名发布' },
    { id: 'dependency-update', name: 'Dependency Update', name_zh: '依赖更新', severity: 'medium', weight: 5, description: 'Check for dependency update tools', description_zh: '检查依赖更新工具' },
    { id: 'license', name: 'License', name_zh: '许可证', severity: 'medium', weight: 5, description: 'Check for recognized license', description_zh: '检查认可的许可证' },
    { id: 'packaging', name: 'Packaging', name_zh: '打包', severity: 'medium', weight: 5, description: 'Check for automated packaging', description_zh: '检查自动化打包' },
    { id: 'binary-artifacts', name: 'Binary Artifacts', name_zh: '二进制制品', severity: 'medium', weight: 5, description: 'Check for binary files in source', description_zh: '检查源代码中的二进制文件' },
    { id: 'fuzzing', name: 'Fuzzing', name_zh: '模糊测试', severity: 'low', weight: 2.5, description: 'Check if the project uses fuzzing', description_zh: '检查项目是否使用模糊测试' },
    { id: 'contributors', name: 'Contributors', name_zh: '贡献者', severity: 'low', weight: 2.5, description: 'Check for diverse contributors', description_zh: '检查多样化的贡献者' },
    { id: 'sbom', name: 'SBOM', name_zh: 'SBOM', severity: 'low', weight: 2.5, description: 'Check for Software Bill of Materials', description_zh: '检查软件物料清单' }
  ];
  res.json(categories);
});
