import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import type { CheckProbe, ProbeFinding, CheckCategory, Severity, ScoringRule, Remediation, CATEGORY_SEVERITY as CategorySeverityType, SEVERITY_WEIGHTS as SeverityWeightsType } from '../types';
import { CATEGORY_SEVERITY, SEVERITY_WEIGHTS } from '../types';

export interface CheckContext {
  repoPath: string;
  repoName: string;
  files: string[];
  commitDepth: number;
}

export function createCheckContext(repoPath: string, repoName: string, commitDepth: number): CheckContext {
  const files = getAllFiles(repoPath);
  return { repoPath, repoName, files, commitDepth };
}

function getAllFiles(dir: string, base?: string): string[] {
  const result: string[] = [];
  const baseDir = base || dir;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...getAllFiles(fullPath, baseDir));
      } else {
        result.push(fullPath.replace(baseDir, '').replace(/\\/g, '/'));
      }
    }
  } catch { }
  return result;
}

function fileExists(ctx: CheckContext, ...patterns: string[]): boolean {
  return patterns.some(p => ctx.files.some(f => f.toLowerCase().endsWith(p.toLowerCase())));
}

function readFileSafe(ctx: CheckContext, relPath: string): string | null {
  try {
    return readFileSync(join(ctx.repoPath, relPath), 'utf-8');
  } catch { return null; }
}

function findFilesByPattern(ctx: CheckContext, pattern: string): string[] {
  return ctx.files.filter(f => f.toLowerCase().includes(pattern.toLowerCase()));
}

function makeRule(cfg: {
  id: string; name: string; name_zh: string;
  description: string; description_zh: string;
  check_method: string; check_method_zh: string;
  pass_condition?: string; pass_condition_zh?: string;
  max_points: number; deduction: number;
  deduction_reason: string; deduction_reason_zh: string;
  passed: boolean;
  reference_format?: string; reference_format_zh?: string;
}): ScoringRule {
  const pts_deducted = cfg.passed ? 0 : cfg.deduction;
  const pts_earned = cfg.max_points - pts_deducted;
  return {
    id: cfg.id, name: cfg.name, name_zh: cfg.name_zh,
    description: cfg.description, description_zh: cfg.description_zh,
    check_method: cfg.check_method, check_method_zh: cfg.check_method_zh,
    pass_condition: cfg.pass_condition || '', pass_condition_zh: cfg.pass_condition_zh || '',
    reference_format: cfg.reference_format, reference_format_zh: cfg.reference_format_zh,
    max_points: cfg.max_points, deduction: cfg.deduction,
    deduction_reason: cfg.deduction_reason, deduction_reason_zh: cfg.deduction_reason_zh,
    passed: cfg.passed, points_earned: pts_earned, points_deducted: pts_deducted
  };
}

function buildProbe(
  id: string, name: string, name_zh: string,
  description: string, description_zh: string,
  category: CheckCategory,
  findings: ProbeFinding[],
  rules: ScoringRule[],
  remediation?: Remediation
): CheckProbe {
  const severity = CATEGORY_SEVERITY[category];
  const weight = SEVERITY_WEIGHTS[severity];
  const maxScore = rules.reduce((s, r) => s + r.max_points, 0);
  const score = rules.reduce((s, r) => s + r.points_earned, 0);
  const outcome = score >= maxScore * 0.8 ? 'pass' : score >= maxScore * 0.5 ? 'warning' : 'fail';
  return {
    id, name, name_zh, description, description_zh,
    category, severity, weight, maxScore, score, outcome,
    findings, scoring_rules: rules, remediation
  };
}

export function runAllChecks(ctx: CheckContext): CheckProbe[] {
  return [
    checkMaintained(ctx),
    checkCodeReview(ctx),
    checkBranchProtection(ctx),
    checkCITests(ctx),
    checkDangerousWorkflow(ctx),
    checkDependencyUpdate(ctx),
    checkFuzzing(ctx),
    checkLicense(ctx),
    checkPackaging(ctx),
    checkPermissions(ctx),
    checkPinnedDependencies(ctx),
    checkSAST(ctx),
    checkSecurityPolicy(ctx),
    checkSignedReleases(ctx),
    checkVulnerabilities(ctx),
    checkBinaryArtifacts(ctx),
    checkContributors(ctx),
    checkSBOM(ctx)
  ];
}

function checkMaintained(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasGitHistory = false;
  let hasRecentFiles = false;
  let hasIssueActivity = false;

  if (existsSync(join(ctx.repoPath, '.git'))) {
    try {
      const headContent = readFileSync(join(ctx.repoPath, '.git', 'HEAD'), 'utf-8').trim();
      if (headContent) { hasGitHistory = true; findings.push({ path: '.git/HEAD', severity: 'info', message: 'Repository has active git history' }); }
    } catch { }
  }

  const recentCount = ctx.files.filter(f => {
    try {
      const stat = statSync(join(ctx.repoPath, f));
      return (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24) < 90;
    } catch { return false; }
  }).length;
  hasRecentFiles = recentCount > 0;
  if (hasRecentFiles) findings.push({ path: '.', severity: 'info', message: `${recentCount} files modified within 90 days` });
  else findings.push({ path: '.', severity: 'medium', message: 'No files modified in the last 90 days' });

  if (fileExists(ctx, '.github/ISSUE_TEMPLATE') || fileExists(ctx, '.github/issue_template')) {
    hasIssueActivity = true;
    findings.push({ path: '.github/ISSUE_TEMPLATE', severity: 'info', message: 'Issue templates found - indicates active issue tracking' });
  }

  const rules = [
    makeRule({
      id: 'maintained-git',
      name: 'Active Git History',
      name_zh: '活跃的 Git 历史',
      description: 'Check if repository has active git history',
      description_zh: '检查仓库是否有活跃的 Git 历史',
      check_method: 'Read .git/HEAD to verify git repository is initialized and active',
      check_method_zh: '读取 .git/HEAD 验证 Git 仓库已初始化且活跃',
      pass_condition: '.git/HEAD exists and contains valid ref',
      pass_condition_zh: '.git/HEAD 存在并包含有效的引用',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'No active git history detected',
      deduction_reason_zh: '未检测到活跃的 Git 历史',
      passed: hasGitHistory,
    }),
    makeRule({
      id: 'maintained-recent',
      name: 'Recent File Modifications',
      name_zh: '近期文件修改',
      description: 'Check if files were modified within 90 days',
      description_zh: '检查是否有文件在90天内被修改',
      check_method: 'Scan file modification timestamps, count files modified within 90 days',
      check_method_zh: '扫描文件修改时间戳，统计90天内修改的文件数',
      pass_condition: 'At least 1 file modified in the last 90 days',
      pass_condition_zh: '过去90天内至少有1个文件被修改',
      max_points: 4,
      deduction: 4,
      deduction_reason: `No files modified in 90 days (${recentCount} files checked)`,
      deduction_reason_zh: `90天内无文件修改（检查了${recentCount}个文件）`,
      passed: hasRecentFiles,
    }),
    makeRule({
      id: 'maintained-issues',
      name: 'Issue Tracking',
      name_zh: '问题追踪',
      description: 'Check if project has issue tracking infrastructure',
      description_zh: '检查项目是否有问题追踪基础设施',
      check_method: 'Look for .github/ISSUE_TEMPLATE/ directory or issue-related config files',
      check_method_zh: '查找 .github/ISSUE_TEMPLATE/ 目录或问题相关配置文件',
      pass_condition: 'Issue template directory or issue tracking config exists',
      pass_condition_zh: '存在问题模板目录或问题追踪配置',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No issue tracking infrastructure found',
      deduction_reason_zh: '未找到问题追踪基础设施',
      passed: hasIssueActivity,
    })
  ];

  return buildProbe('maintained', 'Maintained', '维护状态',
    'Check if the project is actively maintained',
    '检查项目是否被积极维护',
    'maintained', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Ensure the project is actively maintained with regular commits and issue responses',
      description_zh: '确保项目通过定期提交和问题响应保持积极维护',
      steps: ['Establish a regular commit schedule', 'Respond to issues within 90 days', 'Create a release roadmap'],
      steps_zh: ['建立定期提交计划', '在90天内响应问题', '创建发布路线图'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained']
    } : undefined
  );
}

function checkCodeReview(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];

  const prTemplateFiles = ['.github/pull_request_template.md', '.github/pull_request_template.txt', '.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE', 'docs/pull_request_template.md'];
  const hasPRTemplate = prTemplateFiles.some(f => ctx.files.some(cf => cf.toLowerCase() === f.toLowerCase()));
  let prTemplateContent = '';
  if (hasPRTemplate) {
    const found = prTemplateFiles.find(f => ctx.files.some(cf => cf.toLowerCase() === f.toLowerCase()));
    if (found) prTemplateContent = readFileSafe(ctx, found) || '';
    findings.push({ path: found || '.github/', severity: 'info', message: 'PR template found' });
  } else {
    findings.push({ path: '.github/', severity: 'medium', message: 'No PR template found' });
  }

  const codeownerFiles = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
  const hasCodeowners = codeownerFiles.some(f => ctx.files.some(cf => cf.toLowerCase() === f.toLowerCase()));
  let codeownerContent = '';
  if (hasCodeowners) {
    const found = codeownerFiles.find(f => ctx.files.some(cf => cf.toLowerCase() === f.toLowerCase()));
    if (found) codeownerContent = readFileSafe(ctx, found) || '';
    findings.push({ path: found || '.', severity: 'info', message: 'CODEOWNERS file found' });
  } else {
    findings.push({ path: '.', severity: 'medium', message: 'No CODEOWNERS file found' });
  }

  const hasContributing = fileExists(ctx, 'CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md');
  if (hasContributing) findings.push({ path: 'CONTRIBUTING.md', severity: 'info', message: 'CONTRIBUTING.md found' });
  else findings.push({ path: '.', severity: 'low', message: 'No CONTRIBUTING.md found' });

  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));
  let hasRequiredReviews = false;
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && (content.includes('required_approving_review_count') || content.includes('pull-request-review') || content.includes('reviewers'))) {
      hasRequiredReviews = true;
      findings.push({ path: wf, severity: 'info', message: 'PR review requirement detected in workflow' });
      break;
    }
  }

  const rules = [
    makeRule({
      id: 'cr-pr-template',
      name: 'PR Template',
      name_zh: 'PR 模板',
      description: 'Check if a pull request template exists with proper structure',
      description_zh: '检查是否存在具有正确结构的拉取请求模板',
      check_method: 'Search for .github/pull_request_template.md or .github/PULL_REQUEST_TEMPLATE.md',
      check_method_zh: '搜索 .github/pull_request_template.md 或 .github/PULL_REQUEST_TEMPLATE.md',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No PR template found',
      deduction_reason_zh: '未找到 PR 模板',
      passed: hasPRTemplate,
      reference_format: `# Pull Request Template
## Description
<!-- Describe the changes -->
## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
## Testing
<!-- Describe testing done -->
## Checklist
- [ ] Code follows project style
- [ ] Tests added/updated
- [ ] Documentation updated`,
      reference_format_zh: `# 拉取请求模板
## 描述
<!-- 描述所做的更改 -->
## 变更类型
- [ ] 缺陷修复
- [ ] 新功能
- [ ] 破坏性变更
## 测试
<!-- 描述已完成的测试 -->
## 检查清单
- [ ] 代码遵循项目风格
- [ ] 测试已添加/更新
- [ ] 文档已更新`,
    }),
    makeRule({
      id: 'cr-codeowners',
      name: 'CODEOWNERS File',
      name_zh: 'CODEOWNERS 文件',
      description: 'Check if CODEOWNERS file exists defining code ownership',
      description_zh: '检查是否存在定义代码所有权的 CODEOWNERS 文件',
      check_method: 'Search for CODEOWNERS in .github/, root, or docs/ directory',
      check_method_zh: '在 .github/、根目录或 docs/ 目录中搜索 CODEOWNERS',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No CODEOWNERS file found - no dedicated code owners defined',
      deduction_reason_zh: '未找到 CODEOWNERS 文件 - 未定义专用代码所有者',
      passed: hasCodeowners,
      reference_format: `# CODEOWNERS file example
# .github/CODEOWNERS
# Global owners
* @org/core-team

# Frontend
/frontend/ @org/frontend-team

# Backend API
/api/ @org/backend-team

# CI/CD
/.github/workflows/ @org/devops-team`,
      reference_format_zh: `# CODEOWNERS 文件示例
# .github/CODEOWNERS
# 全局所有者
* @org/core-team

# 前端
/frontend/ @org/frontend-team

# 后端 API
/api/ @org/backend-team

# CI/CD
/.github/workflows/ @org/devops-team`,
    }),
    makeRule({
      id: 'cr-contributing',
      name: 'CONTRIBUTING.md',
      name_zh: 'CONTRIBUTING.md 贡献指南',
      description: 'Check if contributing guidelines exist',
      description_zh: '检查是否存在贡献指南',
      check_method: 'Search for CONTRIBUTING.md in root, .github/, or docs/',
      check_method_zh: '在根目录、.github/ 或 docs/ 中搜索 CONTRIBUTING.md',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No CONTRIBUTING.md found',
      deduction_reason_zh: '未找到 CONTRIBUTING.md',
      passed: hasContributing,
    }),
    makeRule({
      id: 'cr-review-required',
      name: 'PR Review Required',
      name_zh: 'PR 审查要求',
      description: 'Check if PR reviews are required before merge (at least 1 approval)',
      description_zh: '检查是否要求 PR 合并前至少1次批准审查',
      check_method: 'Scan GitHub workflow files for required_approving_review_count or pull-request-review configuration. For non-GitHub repos, check branch protection config files.',
      check_method_zh: '扫描 GitHub 工作流文件中的 required_approving_review_count 或 pull-request-review 配置。对于非 GitHub 仓库，检查分支保护配置文件。',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No PR review requirement detected - changes can be merged without approval',
      deduction_reason_zh: '未检测到 PR 审查要求 - 更改可未经批准即合并',
      passed: hasRequiredReviews || hasCodeowners,
    })
  ];

  return buildProbe('code-review', 'Code Review', '代码审查',
    'Check that the project requires code review before merging',
    '检查项目是否要求合并前进行代码审查',
    'code-review', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Implement code review practices to ensure all changes are reviewed before merging',
      description_zh: '实施代码审查实践，确保所有更改在合并前都经过审查',
      steps: [
        'Add a CODEOWNERS file to define code owners',
        'Configure branch protection to require PR reviews',
        'Add a pull request template',
        'Require at least 1 approving review before merge'
      ],
      steps_zh: [
        '添加 CODEOWNERS 文件定义代码所有者',
        '配置分支保护要求 PR 审查',
        '添加拉取请求模板',
        '要求合并前至少有1个批准审查'
      ],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#code-review']
    } : undefined
  );
}

function checkBranchProtection(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];

  const hasGithubDir = ctx.files.some(f => f.startsWith('.github/'));
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));
  const hasWorkflow = workflowFiles.length > 0;

  let hasBranchProtectionConfig = false;
  const branchProtectionPatterns = ['branch_protection', 'required_status_checks', 'enforce_admins', 'required_pull_request_reviews', 'restrictions'];
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && branchProtectionPatterns.some(p => content.includes(p))) {
      hasBranchProtectionConfig = true;
      findings.push({ path: wf, severity: 'info', message: 'Branch protection configuration detected' });
      break;
    }
  }

  const hasCODEOWNERS = fileExists(ctx, '.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS');

  if (hasWorkflow) findings.push({ path: '.github/workflows/', severity: 'info', message: `${workflowFiles.length} GitHub workflows found` });
  else findings.push({ path: '.github/workflows/', severity: 'medium', message: 'No GitHub workflows found' });

  const rules = [
    makeRule({
      id: 'bp-workflows',
      name: 'CI Workflows Exist',
      name_zh: 'CI 工作流存在',
      description: 'Check if CI/CD workflows are configured',
      description_zh: '检查是否配置了 CI/CD 工作流',
      check_method: 'Scan .github/workflows/ directory for .yml/.yaml files',
      check_method_zh: '扫描 .github/workflows/ 目录中的 .yml/.yaml 文件',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No CI workflows configured',
      deduction_reason_zh: '未配置 CI 工作流',
      passed: hasWorkflow,
    }),
    makeRule({
      id: 'bp-protection-config',
      name: 'Branch Protection Rules',
      name_zh: '分支保护规则',
      description: 'Check if branch protection rules are configured',
      description_zh: '检查是否配置了分支保护规则',
      check_method: 'Scan workflow files for branch_protection, required_status_checks, enforce_admins, required_pull_request_reviews keywords',
      check_method_zh: '扫描工作流文件中的 branch_protection、required_status_checks、enforce_admins、required_pull_request_reviews 关键字',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No branch protection rules detected in workflows',
      deduction_reason_zh: '工作流中未检测到分支保护规则',
      passed: hasBranchProtectionConfig || hasCODEOWNERS,
    }),
    makeRule({
      id: 'bp-status-checks',
      name: 'Status Checks Required',
      name_zh: '要求状态检查',
      description: 'Check if status checks are required before merging',
      description_zh: '检查合并前是否要求状态检查通过',
      check_method: 'Look for required_status_checks or status check configurations in workflow or branch protection files',
      check_method_zh: '在工作流或分支保护文件中查找 required_status_checks 或状态检查配置',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No required status checks configuration found',
      deduction_reason_zh: '未找到必需的状态检查配置',
      passed: hasBranchProtectionConfig,
    }),
    makeRule({
      id: 'bp-signed-commits',
      name: 'Signed Commits',
      name_zh: '签名提交',
      description: 'Check if signed commits are required',
      description_zh: '检查是否要求签名提交',
      check_method: 'Search workflow and config files for commit signing requirements (gpg, signed_commits, commit_signing)',
      check_method_zh: '搜索工作流和配置文件中的提交签名要求（gpg、signed_commits、commit_signing）',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No signed commit requirement found',
      deduction_reason_zh: '未找到签名提交要求',
      passed: ctx.files.some(f => {
        const c = readFileSafe(ctx, f);
        return c && (c.includes('signed_commits') || c.includes('commit_signing') || c.includes('gpg'));
      }),
    })
  ];

  return buildProbe('branch-protection', 'Branch Protection', '分支保护',
    'Check that the project uses branch protection',
    '检查项目是否使用分支保护',
    'branch-protection', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Enable branch protection on default and release branches',
      description_zh: '在默认分支和发布分支上启用分支保护',
      steps: [
        'Enable branch protection on the default branch',
        'Require status checks to pass before merging',
        'Require signed commits',
        'Block force pushes and branch deletion',
        'Require pull request reviews before merging'
      ],
      steps_zh: [
        '在默认分支上启用分支保护',
        '要求合并前状态检查通过',
        '要求签名提交',
        '阻止强制推送和分支删除',
        '要求合并前进行拉取请求审查'
      ],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection']
    } : undefined
  );
}

function checkCITests(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));

  const ciPatterns = ['test', 'lint', 'check', 'build', 'ci', 'verify'];
  let hasCI = false;
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;
    const lower = content.toLowerCase();
    for (const pattern of ciPatterns) {
      if (lower.includes(pattern)) {
        hasCI = true;
        findings.push({ path: wf, severity: 'info', message: `CI pattern "${pattern}" found in workflow` });
        break;
      }
    }
  }
  if (!hasCI && workflowFiles.length > 0) findings.push({ path: '.github/workflows/', severity: 'high', message: 'No CI test pattern detected in workflows' });
  if (workflowFiles.length === 0) findings.push({ path: '.github/workflows/', severity: 'high', message: 'No CI workflow files found' });

  const testFiles = findFilesByPattern(ctx, 'test').concat(findFilesByPattern(ctx, 'spec')).concat(findFilesByPattern(ctx, '_test'));
  const hasTestFiles = testFiles.length > 0;
  if (hasTestFiles) findings.push({ path: '.', severity: 'info', message: `Found ${testFiles.length} test-related files` });
  else findings.push({ path: '.', severity: 'medium', message: 'No test files detected' });

  let hasTestScript = false;
  const pkgJson = readFileSafe(ctx, 'package.json');
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      if (pkg.scripts && (pkg.scripts.test || pkg.scripts['test:unit'] || pkg.scripts['test:e2e'])) {
        hasTestScript = true;
        findings.push({ path: 'package.json', severity: 'info', message: 'Test script found in package.json' });
      }
    } catch { }
  }
  const makefile = readFileSafe(ctx, 'Makefile');
  if (makefile && (makefile.includes('test') || makefile.includes('check'))) {
    hasTestScript = true;
    findings.push({ path: 'Makefile', severity: 'info', message: 'Test target found in Makefile' });
  }

  const rules = [
    makeRule({
      id: 'ci-workflow',
      name: 'CI Workflow',
      name_zh: 'CI 工作流',
      description: 'Check if CI workflow runs tests automatically',
      description_zh: '检查 CI 工作流是否自动运行测试',
      check_method: 'Scan .github/workflows/*.yml for test/lint/check/build/ci/verify keywords',
      check_method_zh: '扫描 .github/workflows/*.yml 中的 test/lint/check/build/ci/verify 关键字',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'No CI test workflow detected',
      deduction_reason_zh: '未检测到 CI 测试工作流',
      passed: hasCI,
    }),
    makeRule({
      id: 'ci-test-files',
      name: 'Test Files Exist',
      name_zh: '测试文件存在',
      description: 'Check if test files exist in the project',
      description_zh: '检查项目中是否存在测试文件',
      check_method: 'Search for files/directories containing "test", "spec", or "_test" in their names',
      check_method_zh: '搜索文件名中包含 "test"、"spec" 或 "_test" 的文件/目录',
      max_points: 3,
      deduction: 3,
      deduction_reason: `No test files detected`,
      deduction_reason_zh: `未检测到测试文件`,
      passed: hasTestFiles,
    }),
    makeRule({
      id: 'ci-test-script',
      name: 'Test Script Configured',
      name_zh: '测试脚本配置',
      description: 'Check if test scripts are configured in project metadata',
      description_zh: '检查项目元数据中是否配置了测试脚本',
      check_method: 'Check package.json scripts.test, Makefile test targets, or equivalent test runner configs',
      check_method_zh: '检查 package.json scripts.test、Makefile test 目标或等效测试运行器配置',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No test script found in project configuration',
      deduction_reason_zh: '项目配置中未找到测试脚本',
      passed: hasTestScript,
    })
  ];

  return buildProbe('ci-tests', 'CI/Tests', 'CI/测试',
    'Check that the project runs tests in CI',
    '检查项目是否在 CI 中运行测试',
    'ci-tests', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Set up CI to run tests on all pull requests and commits',
      description_zh: '设置 CI 在所有拉取请求和提交上运行测试',
      steps: ['Add a CI workflow', 'Configure tests on every PR', 'Require status checks to pass', 'Add unit tests for critical paths'],
      steps_zh: ['添加 CI 工作流', '配置在每个 PR 上运行测试', '要求状态检查通过', '为关键路径添加单元测试'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-tests']
    } : undefined
  );
}

function checkDangerousWorkflow(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));

  let hasUntrustedCheckout = false;
  let hasScriptInjection = false;
  const injectionPatterns = [
    /\$\{\{\s*github\.event\.issue\.title\s*\}\}/,
    /\$\{\{\s*github\.event\.issue\.body\s*\}\}/,
    /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/,
    /\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/,
    /\$\{\{\s*github\.event\.comment\.body\s*\}\}/,
    /\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/,
    /\$\{\{\s*github\.event\.pages\[\*\]\.page_name\s*\}\}/
  ];

  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;
    if ((content.includes('pull_request_target') || content.includes('workflow_run')) &&
        content.match(/uses:\s*actions\/checkout[\s\S]*?ref:\s*\$\{\{\s*github\.event\.pull_request/)) {
      hasUntrustedCheckout = true;
      findings.push({ path: wf, severity: 'high', message: 'Untrusted checkout in pull_request_target/workflow_run' });
    }
    for (const pattern of injectionPatterns) {
      if (pattern.test(content)) {
        hasScriptInjection = true;
        findings.push({ path: wf, severity: 'high', message: `Script injection: ${pattern.source.substring(0, 60)}` });
      }
    }
  }

  const rules = [
    makeRule({
      id: 'dw-untrusted-checkout',
      name: 'No Untrusted Checkout',
      name_zh: '无不受信任的检出',
      description: 'Check for untrusted code checkout in privileged workflow triggers',
      description_zh: '检查特权工作流触发器中是否存在不受信任的代码检出',
      check_method: 'Scan workflow files for pull_request_target/workflow_run triggers combined with actions/checkout using PR ref',
      check_method_zh: '扫描工作流文件中 pull_request_target/workflow_run 触发器与使用 PR ref 的 actions/checkout 的组合',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'Untrusted checkout detected - attackers could execute arbitrary code',
      deduction_reason_zh: '检测到不受信任的检出 - 攻击者可执行任意代码',
      passed: !hasUntrustedCheckout,
    }),
    makeRule({
      id: 'dw-script-injection',
      name: 'No Script Injection',
      name_zh: '无脚本注入',
      description: 'Check for script injection via untrusted input in workflow scripts',
      description_zh: '检查工作流脚本中是否存在通过不受信任输入的脚本注入',
      check_method: 'Scan for direct use of github.event.* context variables (issue.title, pr.body, comment.body, etc.) in run: blocks',
      check_method_zh: '扫描 run: 块中是否直接使用 github.event.* 上下文变量（issue.title、pr.body、comment.body 等）',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'Script injection vulnerability detected - untrusted input used directly in scripts',
      deduction_reason_zh: '检测到脚本注入漏洞 - 不受信任的输入直接在脚本中使用',
      passed: !hasScriptInjection,
    })
  ];

  if (workflowFiles.length === 0) findings.push({ path: '.', severity: 'info', message: 'No workflows to analyze' });

  return buildProbe('dangerous-workflow', 'Dangerous Workflow', '危险工作流',
    'Check for dangerous CI/CD workflow patterns',
    '检查危险的 CI/CD 工作流模式',
    'dangerous-workflow', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Fix dangerous workflow patterns to prevent script injection and untrusted checkouts',
      description_zh: '修复危险的工作流模式，防止脚本注入和不受信任的检出',
      steps: ['Use env vars for user input', 'Avoid checkout in pull_request_target', 'Use SHA for actions/checkout'],
      steps_zh: ['使用环境变量处理用户输入', '避免在 pull_request_target 中检出', '使用 SHA 进行 actions/checkout'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#dangerous-workflow']
    } : undefined
  );
}

function checkDependencyUpdate(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];

  const depConfigs: [string, string][] = [
    ['.github/dependabot.yml', 'Dependabot'], ['.github/dependabot.yaml', 'Dependabot'],
    ['.renovaterc', 'Renovate'], ['renovate.json', 'Renovate'],
  ];
  let hasDepTool = false;
  for (const [config, tool] of depConfigs) {
    if (fileExists(ctx, config)) {
      hasDepTool = true;
      findings.push({ path: config, severity: 'info', message: `${tool} config found` });
    }
  }
  if (!hasDepTool) findings.push({ path: '.', severity: 'high', message: 'No dependency update tool found' });

  const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'Cargo.lock', 'Pipfile.lock', 'poetry.lock'];
  let lockCount = 0;
  for (const lock of lockFiles) {
    if (fileExists(ctx, lock)) { lockCount++; findings.push({ path: lock, severity: 'info', message: `Lock file: ${lock}` }); }
  }

  const rules = [
    makeRule({
      id: 'dep-tool',
      name: 'Dependency Update Tool',
      name_zh: '依赖更新工具',
      description: 'Check if a dependency update tool is configured (Dependabot, Renovate, etc.)',
      description_zh: '检查是否配置了依赖更新工具（Dependabot、Renovate 等）',
      check_method: 'Search for .github/dependabot.yml, .renovaterc, renovate.json, etc.',
      check_method_zh: '搜索 .github/dependabot.yml、.renovaterc、renovate.json 等',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No dependency update tool configured',
      deduction_reason_zh: '未配置依赖更新工具',
      passed: hasDepTool,
      reference_format: `# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10`,
      reference_format_zh: `# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10`,
    }),
    makeRule({
      id: 'dep-lock',
      name: 'Lock Files',
      name_zh: '锁定文件',
      description: 'Check if dependency lock files exist',
      description_zh: '检查是否存在依赖锁定文件',
      check_method: 'Search for package-lock.json, yarn.lock, go.sum, Cargo.lock, etc.',
      check_method_zh: '搜索 package-lock.json、yarn.lock、go.sum、Cargo.lock 等',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No dependency lock files found',
      deduction_reason_zh: '未找到依赖锁定文件',
      passed: lockCount > 0,
    })
  ];

  return buildProbe('dependency-update', 'Dependency Update', '依赖更新',
    'Check that a dependency update tool is configured',
    '检查是否配置了依赖更新工具',
    'dependency-update', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Configure a dependency update tool',
      description_zh: '配置依赖更新工具',
      steps: ['Enable Dependabot or Renovate', 'Set up automated security PRs', 'Review updates regularly'],
      steps_zh: ['启用 Dependabot 或 Renovate', '设置自动化安全 PR', '定期审查更新'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low',
      references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#dependency-update-tool']
    } : undefined
  );
}

function checkFuzzing(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasFuzz = false;
  const fuzzIndicators = ['oss-fuzz', 'clusterfuzz', 'go-fuzz', 'afl', 'libfuzzer', 'honggfuzz', 'jazzer', 'fuzz_test', 'FuzzTest', 'fuzzing'];
  for (const indicator of fuzzIndicators) {
    if (ctx.files.some(f => f.toLowerCase().includes(indicator.toLowerCase()))) {
      hasFuzz = true;
      findings.push({ path: '.', severity: 'info', message: `Fuzzing indicator: "${indicator}"` });
    }
  }
  const rules = [
    makeRule({
      id: 'fuzz-tools',
      name: 'Fuzzing Tools',
      name_zh: '模糊测试工具',
      description: 'Check if fuzzing tools or configurations are present',
      description_zh: '检查是否存在模糊测试工具或配置',
      check_method: 'Search for oss-fuzz, clusterfuzz, go-fuzz, afl, libfuzzer, honggfuzz, jazzer, FuzzTest, etc.',
      check_method_zh: '搜索 oss-fuzz、clusterfuzz、go-fuzz、afl、libfuzzer、honggfuzz、jazzer、FuzzTest 等',
      max_points: 10,
      deduction: 10,
      deduction_reason: 'No fuzzing tools detected',
      deduction_reason_zh: '未检测到模糊测试工具',
      passed: hasFuzz,
    })
  ];
  return buildProbe('fuzzing', 'Fuzzing', '模糊测试',
    'Check that the project uses fuzzing testing', '检查项目是否使用模糊测试',
    'fuzzing', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Integrate fuzzing into the project', description_zh: '将模糊测试集成到项目中',
      steps: ['Add ClusterFuzzLite', 'Or submit to OSS-Fuzz', 'Write fuzz targets'],
      steps_zh: ['添加 ClusterFuzzLite', '或提交到 OSS-Fuzz', '编写模糊测试目标'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'high', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#fuzzing']
    } : undefined
  );
}

function checkLicense(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const licenseFiles = ctx.files.filter(f => {
    const name = basename(f).toLowerCase();
    return ['license', 'license.md', 'license.txt', 'licence', 'copying', 'copying.md'].includes(name);
  });
  const hasLicense = licenseFiles.length > 0;
  if (hasLicense) findings.push({ path: licenseFiles[0], severity: 'info', message: `License: ${licenseFiles[0]}` });
  else findings.push({ path: '.', severity: 'high', message: 'No license file found' });

  let isRecognized = false;
  if (hasLicense) {
    const content = readFileSafe(ctx, licenseFiles[0]);
    if (content) {
      const known = ['mit', 'apache', 'bsd', 'isc', 'gpl', 'lgpl', 'mpl', 'artistic', 'unlicense', '0bsd', 'zlib'];
      if (known.some(l => content.toLowerCase().includes(l))) {
        isRecognized = true;
        findings.push({ path: licenseFiles[0], severity: 'info', message: 'Recognized license type detected' });
      }
    }
  }

  let hasPkgLicense = false;
  const pkgJson = readFileSafe(ctx, 'package.json');
  if (pkgJson) {
    try { const pkg = JSON.parse(pkgJson); if (pkg.license) { hasPkgLicense = true; findings.push({ path: 'package.json', severity: 'info', message: `license: ${pkg.license}` }); } } catch { }
  }

  const rules = [
    makeRule({
      id: 'lic-file',
      name: 'License File',
      name_zh: '许可证文件',
      description: 'Check if a LICENSE file exists in the repository',
      description_zh: '检查仓库中是否存在 LICENSE 文件',
      check_method: 'Search for LICENSE, LICENSE.md, LICENSE.txt, COPYING in repository root',
      check_method_zh: '在仓库根目录搜索 LICENSE、LICENSE.md、LICENSE.txt、COPYING',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No license file found',
      deduction_reason_zh: '未找到许可证文件',
      passed: hasLicense,
    }),
    makeRule({
      id: 'lic-recognized',
      name: 'Recognized License',
      name_zh: '认可的许可证',
      description: 'Check if the license is a recognized OSI/FSF approved license',
      description_zh: '检查许可证是否为认可的 OSI/FSF 批准的许可证',
      check_method: 'Parse license file content for known license types (MIT, Apache, BSD, GPL, etc.)',
      check_method_zh: '解析许可证文件内容中的已知许可类型（MIT、Apache、BSD、GPL 等）',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'License type not recognized',
      deduction_reason_zh: '许可证类型未被认可',
      passed: isRecognized,
    }),
    makeRule({
      id: 'lic-metadata',
      name: 'License in Package Metadata',
      name_zh: '包元数据中的许可证',
      description: 'Check if license is declared in package metadata',
      description_zh: '检查包元数据中是否声明了许可证',
      check_method: 'Check package.json license field, setup.py, Cargo.toml, go.mod, etc.',
      check_method_zh: '检查 package.json license 字段、setup.py、Cargo.toml、go.mod 等',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'License not declared in package metadata',
      deduction_reason_zh: '包元数据中未声明许可证',
      passed: hasPkgLicense,
    })
  ];

  return buildProbe('license', 'License', '许可证',
    'Check that the project has a recognized license',
    '检查项目是否具有认可的许可证',
    'license', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Add a recognized open source license', description_zh: '添加认可的开源许可证',
      steps: ['Choose OSI-approved license', 'Add LICENSE file', 'Add to package metadata', 'Use SPDX identifiers'],
      steps_zh: ['选择 OSI 认可的许可证', '添加 LICENSE 文件', '添加到包元数据', '使用 SPDX 标识符'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#license']
    } : undefined
  );
}

function checkPackaging(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasPkgConfig = false;
  const indicators = ['package.json', 'setup.py', 'setup.cfg', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', '.gemspec', 'Dockerfile'];
  for (const ind of indicators) {
    if (fileExists(ctx, ind)) { hasPkgConfig = true; findings.push({ path: ind, severity: 'info', message: `Package config: ${ind}` }); }
  }

  let hasReleaseWorkflow = false;
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/'));
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && ['npm publish', 'pip publish', 'docker push', 'cargo publish', 'mvn deploy', 'gem push', 'release'].some(p => content.includes(p))) {
      hasReleaseWorkflow = true;
      findings.push({ path: wf, severity: 'info', message: 'Release/packaging workflow detected' });
    }
  }

  const rules = [
    makeRule({
      id: 'pkg-config',
      name: 'Package Config',
      name_zh: '包配置',
      description: 'Check if package manager configuration exists',
      description_zh: '检查是否存在包管理器配置',
      check_method: 'Search for package.json, setup.py, Cargo.toml, go.mod, pom.xml, Dockerfile, etc.',
      check_method_zh: '搜索 package.json、setup.py、Cargo.toml、go.mod、pom.xml、Dockerfile 等',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No package manager configuration found',
      deduction_reason_zh: '未找到包管理器配置',
      passed: hasPkgConfig,
    }),
    makeRule({
      id: 'pkg-release',
      name: 'Release Workflow',
      name_zh: '发布工作流',
      description: 'Check if automated release/packaging workflow exists',
      description_zh: '检查是否存在自动化发布/打包工作流',
      check_method: 'Scan workflow files for npm publish, docker push, cargo publish, mvn deploy, release keywords',
      check_method_zh: '扫描工作流文件中的 npm publish、docker push、cargo publish、mvn deploy、release 关键字',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No automated release/packaging workflow found',
      deduction_reason_zh: '未找到自动化发布/打包工作流',
      passed: hasReleaseWorkflow,
    })
  ];

  return buildProbe('packaging', 'Packaging', '打包',
    'Check that the project uses automated packaging',
    '检查项目是否使用自动化打包',
    'packaging', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Set up automated packaging', description_zh: '设置自动化打包',
      steps: ['Create release workflow', 'Use trusted publishing', 'Automate versioning', 'Sign artifacts'],
      steps_zh: ['创建发布工作流', '使用可信发布', '自动化版本管理', '签名制品'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#packaging']
    } : undefined
  );
}

function checkPermissions(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));

  let hasTopLevelWrite = false;
  let hasExplicitPermissions = false;
  let hasReadAll = false;
  const totalWf = workflowFiles.length;

  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;
    if (/^permissions:/m.test(content)) hasExplicitPermissions = true;
    if (/permissions:\s*read-all/.test(content)) hasReadAll = true;
    if (/^permissions:\s*\n\s*(contents|packages|issues|pull-requests|actions):\s*write/m.test(content)) {
      hasTopLevelWrite = true;
      findings.push({ path: wf, severity: 'high', message: 'Top-level write permission' });
    }
  }

  if (totalWf === 0) findings.push({ path: '.', severity: 'info', message: 'No workflows to analyze' });

  const rules = [
    makeRule({
      id: 'perm-explicit',
      name: 'Explicit Permissions',
      name_zh: '显式权限声明',
      description: 'Check if workflows have explicit permissions blocks',
      description_zh: '检查工作流是否有显式的权限声明块',
      check_method: 'Scan all workflow files for permissions: block',
      check_method_zh: '扫描所有工作流文件中的 permissions: 块',
      max_points: 4,
      deduction: 4,
      deduction_reason: totalWf === 0 ? 'No workflows found' : 'Workflows lack explicit permissions block - defaults may be overly permissive',
      deduction_reason_zh: totalWf === 0 ? '未找到工作流' : '工作流缺少显式权限声明 - 默认权限可能过于宽松',
      passed: hasExplicitPermissions || totalWf === 0,
    }),
    makeRule({
      id: 'perm-no-top-write',
      name: 'No Top-Level Write',
      name_zh: '无顶层写权限',
      description: 'Check that no workflow has top-level write permissions',
      description_zh: '检查是否没有工作流具有顶层写权限',
      check_method: 'Scan for permissions: followed by contents/packages/issues/pull-requests/actions: write at top level',
      check_method_zh: '扫描顶层 permissions: 后跟 contents/packages/issues/pull-requests/actions: write',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'Top-level write permission detected - violates least privilege',
      deduction_reason_zh: '检测到顶层写权限 - 违反最小权限原则',
      passed: !hasTopLevelWrite,
    }),
    makeRule({
      id: 'perm-read-all',
      name: 'Read-All Baseline',
      name_zh: 'Read-All 基线',
      description: 'Check if any workflow uses permissions: read-all as a secure baseline',
      description_zh: '检查是否有工作流使用 permissions: read-all 作为安全基线',
      check_method: 'Scan for permissions: read-all pattern in workflow files',
      check_method_zh: '扫描工作流文件中的 permissions: read-all 模式',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No read-all permissions baseline found',
      deduction_reason_zh: '未找到 read-all 权限基线',
      passed: hasReadAll || totalWf === 0,
    })
  ];

  return buildProbe('permissions', 'Token Permissions', '令牌权限',
    'Check that workflows follow least privilege principle',
    '检查工作流是否遵循最小权限原则',
    'permissions', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Apply least privilege to workflow tokens', description_zh: '对工作流令牌应用最小权限',
      steps: ['Add permissions block', 'Use read-all at top level', 'Grant write only at job level'],
      steps_zh: ['添加权限块', '顶层使用 read-all', '仅在工作级别授予写权限'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions']
    } : undefined
  );
}

function checkPinnedDependencies(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let totalDeps = 0, pinnedDeps = 0;

  const dockerfiles = ctx.files.filter(f => basename(f).toLowerCase().includes('dockerfile'));
  for (const df of dockerfiles) {
    const content = readFileSafe(ctx, df);
    if (!content) continue;
    const fromLines = content.match(/^FROM\s+.+/gim);
    if (fromLines) for (const line of fromLines) {
      totalDeps++;
      if (line.includes('@sha256:')) pinnedDeps++;
      else if (!line.includes(':') || line.includes(':latest')) {
        findings.push({ path: df, severity: 'high', message: `Unpinned Docker image: ${line.trim()}` });
      } else pinnedDeps++;
    }
  }

  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')));
  let unpinnedActions = 0;
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;
    const usesLines = content.match(/uses:\s*[^#\n]+/g);
    if (usesLines) for (const line of usesLines) {
      totalDeps++;
      const ref = line.replace('uses:', '').trim();
      if (ref.includes('@') && /[a-f0-9]{40}/.test(ref)) pinnedDeps++;
      else { unpinnedActions++; findings.push({ path: wf, severity: 'medium', message: `Not pinned to SHA: ${ref}` }); }
    }
  }

  const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'Cargo.lock', 'Pipfile.lock', 'poetry.lock'];
  let hasLockFile = false;
  for (const lock of lockFiles) { if (fileExists(ctx, lock)) { hasLockFile = true; findings.push({ path: lock, severity: 'info', message: `Lock file: ${lock}` }); } }

  if (totalDeps > 0) findings.push({ path: '.', severity: 'info', message: `Dependencies: ${pinnedDeps}/${totalDeps} pinned` });

  const pinRatio = totalDeps > 0 ? pinnedDeps / totalDeps : 1;
  const rules = [
    makeRule({
      id: 'pin-actions',
      name: 'GitHub Actions Pinned to SHA',
      name_zh: 'GitHub Actions 固定到 SHA',
      description: 'Check if GitHub Actions are pinned to full commit SHA hashes',
      description_zh: '检查 GitHub Actions 是否固定到完整的提交 SHA 哈希',
      check_method: 'Parse uses: lines in workflow files, verify each action ref contains a 40-char hex SHA',
      check_method_zh: '解析工作流文件中的 uses: 行，验证每个 action 引用包含40字符十六进制 SHA',
      max_points: 4,
      deduction: unpinnedActions > 0 ? Math.min(4, unpinnedActions) : 0,
      deduction_reason: `${unpinnedActions} action(s) not pinned to SHA`,
      deduction_reason_zh: `${unpinnedActions} 个 action 未固定到 SHA`,
      passed: unpinnedActions === 0 || totalDeps === 0,
    }),
    makeRule({
      id: 'pin-docker',
      name: 'Docker Images Pinned',
      name_zh: 'Docker 镜像固定',
      description: 'Check if Docker images are pinned to SHA256 digests',
      description_zh: '检查 Docker 镜像是否固定到 SHA256 摘要',
      check_method: 'Parse FROM lines in Dockerfiles, verify image refs contain @sha256:',
      check_method_zh: '解析 Dockerfile 中的 FROM 行，验证镜像引用包含 @sha256:',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'Docker images not pinned to SHA256 digests',
      deduction_reason_zh: 'Docker 镜像未固定到 SHA256 摘要',
      passed: dockerfiles.length === 0 || pinRatio >= 0.8,
    }),
    makeRule({
      id: 'pin-lock',
      name: 'Dependency Lock Files',
      name_zh: '依赖锁定文件',
      description: 'Check if lock files exist for package managers',
      description_zh: '检查包管理器是否存在锁定文件',
      check_method: 'Search for package-lock.json, yarn.lock, go.sum, Cargo.lock, Pipfile.lock, etc.',
      check_method_zh: '搜索 package-lock.json、yarn.lock、go.sum、Cargo.lock、Pipfile.lock 等',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No dependency lock files found',
      deduction_reason_zh: '未找到依赖锁定文件',
      passed: hasLockFile,
    })
  ];

  return buildProbe('pinned-dependencies', 'Pinned Dependencies', '依赖锁定',
    'Check that dependencies are pinned to specific versions',
    '检查依赖是否固定到特定版本',
    'pinned-dependencies', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Pin all dependencies to specific versions', description_zh: '将所有依赖固定到特定版本',
      steps: ['Pin Actions to SHA', 'Pin Docker to SHA256', 'Use lock files', 'Use StepSecurity'],
      steps_zh: ['将 Actions 固定到 SHA', '将 Docker 固定到 SHA256', '使用锁定文件', '使用 StepSecurity'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies']
    } : undefined
  );
}

function checkSAST(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const sastTools = [
    { pattern: 'codeql', name: 'CodeQL' }, { pattern: 'sonarqube', name: 'SonarQube' },
    { pattern: 'sonarcloud', name: 'SonarCloud' }, { pattern: 'snyk', name: 'Snyk' },
    { pattern: 'semgrep', name: 'Semgrep' }, { pattern: 'trivy', name: 'Trivy' },
    { pattern: 'bandit', name: 'Bandit' }, { pattern: 'eslint-plugin-security', name: 'ESLint Security' },
    { pattern: 'brakeman', name: 'Brakeman' }, { pattern: 'gosec', name: 'GoSec' }
  ];
  const detected: string[] = [];
  for (const tool of sastTools) {
    if (ctx.files.some(f => basename(f).toLowerCase().includes(tool.pattern.toLowerCase()))) {
      detected.push(tool.name);
      findings.push({ path: '.', severity: 'info', message: `SAST tool: ${tool.name}` });
    }
  }
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/'));
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;
    for (const tool of sastTools) {
      if (content.toLowerCase().includes(tool.pattern.toLowerCase()) && !detected.includes(tool.name)) {
        detected.push(tool.name);
        findings.push({ path: wf, severity: 'info', message: `SAST "${tool.name}" in workflow` });
      }
    }
  }
  if (detected.length === 0) findings.push({ path: '.', severity: 'high', message: 'No SAST tools detected' });

  const rules = [
    makeRule({
      id: 'sast-configured',
      name: 'SAST Tool Configured',
      name_zh: 'SAST 工具配置',
      description: 'Check if at least one SAST tool is configured in the project',
      description_zh: '检查项目中是否至少配置了一个 SAST 工具',
      check_method: 'Search for CodeQL, SonarQube, SonarCloud, Snyk, Semgrep, Trivy, Bandit, Brakeman, GoSec configs and workflow references',
      check_method_zh: '搜索 CodeQL、SonarQube、SonarCloud、Snyk、Semgrep、Trivy、Bandit、Brakeman、GoSec 的配置和工作流引用',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No SAST tools detected',
      deduction_reason_zh: '未检测到 SAST 工具',
      passed: detected.length > 0,
    }),
    makeRule({
      id: 'sast-in-ci',
      name: 'SAST in CI Workflow',
      name_zh: 'CI 工作流中的 SAST',
      description: 'Check if SAST tools are integrated into CI workflows',
      description_zh: '检查 SAST 工具是否集成到 CI 工作流中',
      check_method: 'Scan .github/workflows/ for SAST tool references (codeql, sonarcloud, semgrep, etc.)',
      check_method_zh: '扫描 .github/workflows/ 中的 SAST 工具引用（codeql、sonarcloud、semgrep 等）',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'SAST not integrated into CI workflows',
      deduction_reason_zh: 'SAST 未集成到 CI 工作流中',
      passed: workflowFiles.some(wf => {
        const c = readFileSafe(ctx, wf);
        return c && sastTools.some(t => c.toLowerCase().includes(t.pattern.toLowerCase()));
      }),
    })
  ];

  return buildProbe('sast', 'SAST', '静态分析',
    'Check that the project uses static analysis tools',
    '检查项目是否使用静态分析工具',
    'sast', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Integrate SAST tools', description_zh: '集成 SAST 工具',
      steps: ['Add CodeQL to GitHub Actions', 'Or integrate SonarCloud', 'Configure Semgrep', 'Run on all PRs'],
      steps_zh: ['将 CodeQL 添加到 GitHub Actions', '或集成 SonarCloud', '配置 Semgrep', '在所有 PR 上运行'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#sast']
    } : undefined
  );
}

function checkSecurityPolicy(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const securityFiles = ctx.files.filter(f => basename(f).toLowerCase() === 'security.md' || basename(f).toLowerCase() === 'security');
  const hasSecPolicy = securityFiles.length > 0;
  let hasLinks = false, hasEmail = false, hasDisclosure = false, hasContent = false;

  if (hasSecPolicy) {
    findings.push({ path: securityFiles[0], severity: 'info', message: `Security policy: ${securityFiles[0]}` });
    const content = readFileSafe(ctx, securityFiles[0]);
    if (content) {
      if (/https?:\/\/[^\s]+/.test(content)) { hasLinks = true; findings.push({ path: securityFiles[0], severity: 'info', message: 'Contains web links' }); }
      if (/[^\s]+@[^\s]+\.[^\s]+/.test(content)) { hasEmail = true; findings.push({ path: securityFiles[0], severity: 'info', message: 'Contains email contact' }); }
      if (/disclos/i.test(content) || /vuln/i.test(content) || /report/i.test(content)) { hasDisclosure = true; findings.push({ path: securityFiles[0], severity: 'info', message: 'Vulnerability disclosure documented' }); }
      if (content.length > 200) { hasContent = true; findings.push({ path: securityFiles[0], severity: 'info', message: 'Substantial content' }); }
    }
  } else {
    findings.push({ path: '.', severity: 'high', message: 'No SECURITY.md found' });
  }

  const rules = [
    makeRule({
      id: 'sp-present',
      name: 'SECURITY.md Present',
      name_zh: 'SECURITY.md 存在',
      description: 'Check if a security policy file exists',
      description_zh: '检查是否存在安全策略文件',
      check_method: 'Search for SECURITY.md or security file in repository root or .github/',
      check_method_zh: '在仓库根目录或 .github/ 中搜索 SECURITY.md 或 security 文件',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'No security policy file found',
      deduction_reason_zh: '未找到安全策略文件',
      passed: hasSecPolicy,
    }),
    makeRule({
      id: 'sp-links',
      name: 'Contact Links',
      name_zh: '联系链接',
      description: 'Check if security policy contains web links or email contacts',
      description_zh: '检查安全策略是否包含网站链接或邮箱联系方式',
      check_method: 'Regex match for http(s):// URLs and email patterns in SECURITY.md',
      check_method_zh: '正则匹配 SECURITY.md 中的 http(s):// URL 和邮箱模式',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No contact information in security policy',
      deduction_reason_zh: '安全策略中无联系信息',
      passed: hasLinks || hasEmail,
    }),
    makeRule({
      id: 'sp-disclosure',
      name: 'Disclosure Process',
      name_zh: '披露流程',
      description: 'Check if vulnerability disclosure process is documented',
      description_zh: '检查是否记录了漏洞披露流程',
      check_method: 'Search for keywords: disclos, vuln, report in SECURITY.md content',
      check_method_zh: '搜索 SECURITY.md 内容中的关键字：disclos、vuln、report',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'No vulnerability disclosure process documented',
      deduction_reason_zh: '未记录漏洞披露流程',
      passed: hasDisclosure,
    }),
    makeRule({
      id: 'sp-content',
      name: 'Substantial Content',
      name_zh: '实质内容',
      description: 'Check if security policy has substantial content (not just links)',
      description_zh: '检查安全策略是否有实质内容（不仅仅是链接）',
      check_method: 'Verify SECURITY.md content length > 200 characters',
      check_method_zh: '验证 SECURITY.md 内容长度 > 200 字符',
      max_points: 2,
      deduction: 2,
      deduction_reason: 'Security policy lacks substantial content',
      deduction_reason_zh: '安全策略缺乏实质内容',
      passed: hasContent,
    })
  ];

  return buildProbe('security-policy', 'Security Policy', '安全策略',
    'Check that the project has a security policy',
    '检查项目是否有安全策略',
    'security-policy', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Create a comprehensive security policy', description_zh: '创建全面的安全策略',
      steps: ['Create SECURITY.md', 'Include disclosure process', 'Add contact info', 'Define response timelines'],
      steps_zh: ['创建 SECURITY.md', '包含披露流程', '添加联系信息', '定义响应时间线'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#security-policy']
    } : undefined
  );
}

function checkSignedReleases(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const sigExt = ['.sig', '.asc', '.gpg', '.pem', '.minisig', '.sign', '.sigstore'];
  const hasSigFiles = ctx.files.some(f => sigExt.some(e => f.endsWith(e)));
  if (hasSigFiles) findings.push({ path: '.', severity: 'info', message: 'Signature files found' });

  let hasSigningWorkflow = false;
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/'));
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && (content.includes('sigstore') || content.includes('cosign') || content.includes('sign'))) {
      hasSigningWorkflow = true;
      findings.push({ path: wf, severity: 'info', message: 'Release signing in workflow' });
    }
  }

  const hasProvenance = ctx.files.some(f => f.includes('.sigstore') || f.includes('provenance') || f.includes('attestation'));
  if (hasProvenance) findings.push({ path: '.', severity: 'info', message: 'Provenance attestation detected' });

  const rules = [
    makeRule({
      id: 'sr-signatures',
      name: 'Release Signatures',
      name_zh: '发布签名',
      description: 'Check if releases have signature files or signing workflows',
      description_zh: '检查发布是否有签名文件或签名工作流',
      check_method: 'Search for .sig, .asc, .gpg files and cosign/sigstore workflow references',
      check_method_zh: '搜索 .sig、.asc、.gpg 文件以及 cosign/sigstore 工作流引用',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No release signatures or signing workflows found',
      deduction_reason_zh: '未找到发布签名或签名工作流',
      passed: hasSigFiles || hasSigningWorkflow,
    }),
    makeRule({
      id: 'sr-provenance',
      name: 'Provenance Attestation',
      name_zh: '来源证明',
      description: 'Check if provenance attestations are provided',
      description_zh: '检查是否提供了来源证明',
      check_method: 'Search for .sigstore files, provenance, or attestation references',
      check_method_zh: '搜索 .sigstore 文件、provenance 或 attestation 引用',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No provenance attestations found',
      deduction_reason_zh: '未找到来源证明',
      passed: hasProvenance || hasSigningWorkflow,
    })
  ];

  return buildProbe('signed-releases', 'Signed Releases', '签名发布',
    'Check that releases are cryptographically signed',
    '检查发布是否经过加密签名',
    'signed-releases', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Sign all releases and provide provenance', description_zh: '签名所有发布并提供来源证明',
      steps: ['Use Sigstore/cosign', 'Generate SLSA provenance', 'Include .sig files', 'Use GitHub attestations'],
      steps_zh: ['使用 Sigstore/cosign', '生成 SLSA 来源证明', '包含 .sig 文件', '使用 GitHub 证明'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#signed-releases']
    } : undefined
  );
}

function checkVulnerabilities(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasAdvisories = fileExists(ctx, '.github/SECURITY.md');
  let hasAuditFile = ['npm-audit.json', 'audit.json', 'safety-check.json'].some(f => fileExists(ctx, f));
  let hasVulnConfig = ctx.files.some(f => {
    const name = basename(f).toLowerCase();
    return name.includes('vulnerability') || name.includes('advisory') || name.includes('cve');
  });

  if (hasAdvisories) findings.push({ path: '.github/SECURITY.md', severity: 'info', message: 'Security advisories configured' });
  if (hasAuditFile) findings.push({ path: '.', severity: 'info', message: 'Audit file found' });

  const hasDepTool = fileExists(ctx, '.github/dependabot.yml', '.github/dependabot.yaml', '.renovaterc', 'renovate.json');

  const rules = [
    makeRule({
      id: 'vuln-advisory',
      name: 'Security Advisory',
      name_zh: '安全公告',
      description: 'Check if project has GitHub Security Advisory support',
      description_zh: '检查项目是否支持 GitHub 安全公告',
      check_method: 'Check for .github/SECURITY.md or security advisory configuration',
      check_method_zh: '检查 .github/SECURITY.md 或安全公告配置',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'No security advisory configuration found',
      deduction_reason_zh: '未找到安全公告配置',
      passed: hasAdvisories || hasVulnConfig,
    }),
    makeRule({
      id: 'vuln-monitoring',
      name: 'Vulnerability Monitoring',
      name_zh: '漏洞监控',
      description: 'Check if automated vulnerability monitoring is set up',
      description_zh: '检查是否设置了自动化漏洞监控',
      check_method: 'Check for Dependabot alerts, audit files, or vulnerability scanning configs',
      check_method_zh: '检查 Dependabot 警报、审计文件或漏洞扫描配置',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No automated vulnerability monitoring detected',
      deduction_reason_zh: '未检测到自动化漏洞监控',
      passed: hasAuditFile || hasDepTool,
    }),
    makeRule({
      id: 'vuln-response',
      name: 'Vulnerability Response Process',
      name_zh: '漏洞响应流程',
      description: 'Check if a vulnerability response process is documented',
      description_zh: '检查是否记录了漏洞响应流程',
      check_method: 'Check SECURITY.md for vulnerability reporting and response procedures',
      check_method_zh: '检查 SECURITY.md 中的漏洞报告和响应程序',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No vulnerability response process documented',
      deduction_reason_zh: '未记录漏洞响应流程',
      passed: hasAdvisories,
    })
  ];

  return buildProbe('vulnerabilities', 'Vulnerabilities', '漏洞',
    'Check for known vulnerabilities in the project',
    '检查项目中的已知漏洞',
    'vulnerabilities', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Monitor and fix known vulnerabilities', description_zh: '监控并修复已知漏洞',
      steps: ['Enable Security Advisories', 'Set up Dependabot alerts', 'Check OSV.dev', 'Create response process'],
      steps_zh: ['启用安全公告', '设置 Dependabot 警报', '检查 OSV.dev', '创建响应流程'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#vulnerabilities']
    } : undefined
  );
}

function checkBinaryArtifacts(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const binaryExt = ['.exe', '.dll', '.so', '.dylib', '.a', '.o', '.obj', '.pyc', '.class', '.jar', '.war', '.ear', '.zip', '.tar', '.gz', '.7z', '.rar'];
  const skip = ['gradle-wrapper.jar', '.git/', 'node_modules/', 'vendor/'];
  let binaryCount = 0;

  for (const file of ctx.files) {
    if (skip.some(s => file.includes(s))) continue;
    if (binaryExt.includes(extname(file).toLowerCase())) {
      binaryCount++;
      findings.push({ path: file, severity: 'medium', message: `Binary artifact: ${file}` });
    }
  }

  const rules = [
    makeRule({
      id: 'ba-none',
      name: 'No Binary Artifacts',
      name_zh: '无二进制制品',
      description: 'Check if the source tree contains binary artifacts',
      description_zh: '检查源代码树是否包含二进制制品',
      check_method: 'Scan all files for binary extensions (.exe, .dll, .so, .jar, .zip, etc.), excluding .git/, node_modules/, vendor/',
      check_method_zh: '扫描所有文件的二进制扩展名（.exe、.dll、.so、.jar、.zip 等），排除 .git/、node_modules/、vendor/',
      max_points: 10,
      deduction: Math.min(10, binaryCount),
      deduction_reason: `${binaryCount} binary artifact(s) found in source tree`,
      deduction_reason_zh: `源代码树中发现 ${binaryCount} 个二进制制品`,
      passed: binaryCount === 0,
    })
  ];

  return buildProbe('binary-artifacts', 'Binary Artifacts', '二进制制品',
    'Check that source does not contain binary artifacts',
    '检查源代码是否不包含二进制制品',
    'binary-artifacts', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Remove binary artifacts from source', description_zh: '从源代码中移除二进制制品',
      steps: ['Remove binary files', 'Use package managers', 'Provide checksums', 'Use Git LFS'],
      steps_zh: ['移除二进制文件', '使用包管理器', '提供校验和', '使用 Git LFS'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#binary-artifacts']
    } : undefined
  );
}

function checkContributors(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const hasContributing = fileExists(ctx, 'CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md');
  const hasCodeowners = fileExists(ctx, 'CODEOWNERS', '.github/CODEOWNERS');
  const hasMaintainers = fileExists(ctx, 'MAINTAINERS.md', 'MAINTAINERS', '.github/MAINTAINERS.md');

  if (hasContributing) findings.push({ path: 'CONTRIBUTING.md', severity: 'info', message: 'Contributing guidelines found' });
  else findings.push({ path: '.', severity: 'medium', message: 'No CONTRIBUTING.md' });

  const rules = [
    makeRule({
      id: 'contrib-guide',
      name: 'Contributing Guidelines',
      name_zh: '贡献指南',
      description: 'Check if contributing guidelines exist',
      description_zh: '检查是否存在贡献指南',
      check_method: 'Search for CONTRIBUTING.md in root, .github/, or docs/',
      check_method_zh: '在根目录、.github/ 或 docs/ 中搜索 CONTRIBUTING.md',
      max_points: 4,
      deduction: 4,
      deduction_reason: 'No CONTRIBUTING.md found',
      deduction_reason_zh: '未找到 CONTRIBUTING.md',
      passed: hasContributing,
    }),
    makeRule({
      id: 'contrib-owners',
      name: 'Code Owners',
      name_zh: '代码所有者',
      description: 'Check if CODEOWNERS file exists indicating organizational diversity',
      description_zh: '检查是否存在 CODEOWNERS 文件表明组织多样性',
      check_method: 'Search for CODEOWNERS in .github/, root, or docs/',
      check_method_zh: '在 .github/、根目录或 docs/ 中搜索 CODEOWNERS',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No CODEOWNERS file found',
      deduction_reason_zh: '未找到 CODEOWNERS 文件',
      passed: hasCodeowners,
    }),
    makeRule({
      id: 'contrib-maintainers',
      name: 'Maintainers List',
      name_zh: '维护者列表',
      description: 'Check if a maintainers file exists',
      description_zh: '检查是否存在维护者文件',
      check_method: 'Search for MAINTAINERS.md or MAINTAINERS file',
      check_method_zh: '搜索 MAINTAINERS.md 或 MAINTAINERS 文件',
      max_points: 3,
      deduction: 3,
      deduction_reason: 'No MAINTAINERS file found',
      deduction_reason_zh: '未找到 MAINTAINERS 文件',
      passed: hasMaintainers,
    })
  ];

  return buildProbe('contributors', 'Contributors', '贡献者',
    'Check that the project has diverse contributors',
    '检查项目是否有多样化的贡献者',
    'contributors', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Encourage diverse contributions', description_zh: '鼓励多样化贡献',
      steps: ['Add CONTRIBUTING.md', 'Create MAINTAINERS', 'Encourage multi-org contributions', 'Define CODEOWNERS'],
      steps_zh: ['添加 CONTRIBUTING.md', '创建 MAINTAINERS', '鼓励多组织贡献', '定义 CODEOWNERS'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#contributors']
    } : undefined
  );
}

function checkSBOM(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const sbomPatterns = ['sbom', 'bom', 'spdx', 'cyclonedx', 'cdx'];
  const sbomFiles = ctx.files.filter(f => sbomPatterns.some(p => basename(f).toLowerCase().includes(p)));
  const hasSBOM = sbomFiles.length > 0;
  if (hasSBOM) for (const sf of sbomFiles) findings.push({ path: sf, severity: 'info', message: `SBOM: ${sf}` });

  let hasGenWorkflow = false;
  const workflowFiles = ctx.files.filter(f => f.includes('.github/workflows/'));
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && (content.includes('sbom') || content.includes('syft') || content.includes('cyclonedx'))) {
      hasGenWorkflow = true;
      findings.push({ path: wf, severity: 'info', message: 'SBOM generation in workflow' });
    }
  }
  if (!hasSBOM && !hasGenWorkflow) findings.push({ path: '.', severity: 'medium', message: 'No SBOM found' });

  const rules = [
    makeRule({
      id: 'sbom-file',
      name: 'SBOM File',
      name_zh: 'SBOM 文件',
      description: 'Check if an SBOM file exists in the repository',
      description_zh: '检查仓库中是否存在 SBOM 文件',
      check_method: 'Search for files containing sbom, bom, spdx, cyclonedx, cdx in their names',
      check_method_zh: '搜索文件名中包含 sbom、bom、spdx、cyclonedx、cdx 的文件',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No SBOM file found',
      deduction_reason_zh: '未找到 SBOM 文件',
      passed: hasSBOM,
    }),
    makeRule({
      id: 'sbom-generation',
      name: 'SBOM Generation Workflow',
      name_zh: 'SBOM 生成工作流',
      description: 'Check if SBOM generation is automated in CI/CD',
      description_zh: '检查 SBOM 生成是否在 CI/CD 中自动化',
      check_method: 'Scan workflow files for sbom, syft, cyclonedx references',
      check_method_zh: '扫描工作流文件中的 sbom、syft、cyclonedx 引用',
      max_points: 5,
      deduction: 5,
      deduction_reason: 'No SBOM generation workflow found',
      deduction_reason_zh: '未找到 SBOM 生成工作流',
      passed: hasGenWorkflow,
    })
  ];

  return buildProbe('sbom', 'SBOM', 'SBOM',
    'Check that the project provides a Software Bill of Materials',
    '检查项目是否提供软件物料清单',
    'sbom', findings, rules,
    rules.some(r => !r.passed) ? {
      description: 'Generate and publish an SBOM', description_zh: '生成并发布 SBOM',
      steps: ['Use Syft or CycloneDX', 'Include as release artifact', 'Automate in CI/CD', 'Use SPDX/CycloneDX format'],
      steps_zh: ['使用 Syft 或 CycloneDX', '作为发布制品包含', '在 CI/CD 中自动化', '使用 SPDX/CycloneDX 格式'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#sbom']
    } : undefined
  );
}
