import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import type {
  CheckProbe, ProbeFinding, CheckCategory, ScoringRule,
  Remediation, ReferenceItem, Platform, ApiInfo, CATEGORY_SEVERITY as _, SEVERITY_WEIGHTS as __
} from '../types';
import { CATEGORY_SEVERITY, SEVERITY_WEIGHTS } from '../types';
import {
  getAllPaths, getGroupedPaths, getWorkflowFiles,
  PR_TEMPLATE_PATHS, CODEOWNERS_PATHS, CONTRIBUTING_PATHS,
  SECURITY_POLICY_PATHS, ISSUE_TEMPLATE_PATHS, MAINTAINERS_PATHS,
  DEPENDABOT_PATHS, RENOVATE_PATHS, LOCK_FILES,
  PACKAGE_CONFIG_FILES, LICENSE_FILES, SBOM_PATTERNS,
  BINARY_EXTENSIONS, BINARY_SKIP_DIRS, BINARY_SKIP_FILES,
  SAST_TOOLS, FUZZ_INDICATORS, FUZZ_FILE_PATHS, FUZZ_LANG_SPECS, SCRIPT_INJECTION_PATTERNS,
  PUBLISH_COMMANDS, SIGNATURE_EXTENSIONS, KNOWN_LICENSES, CI_TEST_KEYWORDS,
} from './paths';
import {
  fetchPRs, fetchBranches, fetchReleases, fetchCommits, fetchIssues,
} from './api-client';

export interface CheckContext {
  repoPath: string;
  repoName: string;
  files: string[];
  commitDepth: number;
  platform: Platform;
  owner: string;
  repo: string;
  apiToken?: string;
  proxy?: { http?: string; https?: string };
}

export function createCheckContext(
  repoPath: string, repoName: string, commitDepth: number,
  platform: Platform, owner: string, repo: string,
  apiToken?: string, proxy?: { http?: string; https?: string },
): CheckContext {
  return {
    repoPath, repoName, files: getAllFiles(repoPath),
    commitDepth, platform, owner, repo, apiToken, proxy,
  };
}

function getAllFiles(dir: string, base?: string): string[] {
  const result: string[] = [];
  const baseDir = base || dir;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...getAllFiles(fullPath, baseDir));
      else result.push(fullPath.replace(baseDir, '').replace(/\\/g, '/'));
    }
  } catch { }
  return result;
}

function fileExists(ctx: CheckContext, ...patterns: string[]): boolean {
  return patterns.some(p => ctx.files.some(f => f.toLowerCase() === p.toLowerCase() || f.toLowerCase().endsWith('/' + p.toLowerCase())));
}

function readFileSafe(ctx: CheckContext, relPath: string): string | null {
  try { return readFileSync(join(ctx.repoPath, relPath), 'utf-8'); }
  catch { return null; }
}

function findFileByPatterns(ctx: CheckContext, patterns: string[]): { found: boolean; path?: string } {
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    if (lower.endsWith('/')) {
      const match = ctx.files.find(f => f.toLowerCase().startsWith(lower));
      if (match) return { found: true, path: match };
    } else {
      const match = ctx.files.find(f => f.toLowerCase() === lower);
      if (match) return { found: true, path: match };
    }
  }
  return { found: false };
}

function makeRule(cfg: {
  id: string; name: string; name_zh: string;
  description: string; description_zh: string;
  check_method: string; check_method_zh: string;
  pass_condition?: string; pass_condition_zh?: string;
  max_points: number; deduction: number;
  deduction_reason: string; deduction_reason_zh: string;
  passed: boolean;
  api_sources?: ApiInfo[];
  detection_fields?: { field: string; description: string; description_zh: string }[];
  reasoning?: string; reasoning_zh?: string;
  reference_format?: string; reference_format_zh?: string;
}): ScoringRule {
  const pts_deducted = cfg.passed ? 0 : cfg.deduction;
  return {
    id: cfg.id, name: cfg.name, name_zh: cfg.name_zh,
    description: cfg.description, description_zh: cfg.description_zh,
    check_method: cfg.check_method, check_method_zh: cfg.check_method_zh,
    pass_condition: cfg.pass_condition || '', pass_condition_zh: cfg.pass_condition_zh || '',
    reference_format: cfg.reference_format, reference_format_zh: cfg.reference_format_zh,
    api_sources: cfg.api_sources,
    detection_fields: cfg.detection_fields,
    reasoning: cfg.reasoning, reasoning_zh: cfg.reasoning_zh,
    max_points: cfg.max_points, deduction: cfg.deduction,
    deduction_reason: cfg.deduction_reason, deduction_reason_zh: cfg.deduction_reason_zh,
    passed: cfg.passed, points_earned: cfg.max_points - pts_deducted, points_deducted: pts_deducted,
  };
}

function buildProbe(
  id: string, name: string, name_zh: string,
  description: string, description_zh: string,
  category: CheckCategory,
  findings: ProbeFinding[],
  rules: ScoringRule[],
  referenceItems?: ReferenceItem[],
  remediation?: Remediation,
): CheckProbe {
  const severity = CATEGORY_SEVERITY[category];
  const weight = SEVERITY_WEIGHTS[severity];
  const maxScore = rules.reduce((s, r) => s + r.max_points, 0);
  const score = rules.reduce((s, r) => s + r.points_earned, 0);
  const outcome = score >= maxScore * 0.8 ? 'pass' : score >= maxScore * 0.5 ? 'warning' : 'fail';
  return {
    id, name, name_zh, description, description_zh,
    category, severity, weight, maxScore, score, outcome,
    findings, scoring_rules: rules, reference_items: referenceItems, remediation,
  };
}

function makeRefItem(
  name: string, name_zh: string, found: boolean,
  pathsChecked: string[],
  reference_format?: string, reference_format_zh?: string,
  paths_grouped?: { group: string; group_zh: string; paths: string[] }[],
): ReferenceItem {
  return { name, name_zh, found, paths_checked: pathsChecked, reference_format, reference_format_zh, paths_grouped };
}

export async function runAllChecks(ctx: CheckContext): Promise<CheckProbe[]> {
  const [prs, branches, releases, commits, issues] = await Promise.all([
    fetchPRs(ctx.platform, ctx.owner, ctx.repo, ctx.apiToken, 30, ctx.proxy),
    fetchBranches(ctx.platform, ctx.owner, ctx.repo, ctx.apiToken, ctx.proxy),
    fetchReleases(ctx.platform, ctx.owner, ctx.repo, ctx.apiToken, 5, ctx.proxy),
    fetchCommits(ctx.platform, ctx.owner, ctx.repo, ctx.apiToken, 30, ctx.proxy),
    fetchIssues(ctx.platform, ctx.owner, ctx.repo, ctx.apiToken, 10, ctx.proxy),
  ]);

  return [
    checkMaintained(ctx, commits.data, issues.data),
    checkCodeReview(ctx, prs.data),
    checkBranchProtection(ctx, branches.data),
    checkCITests(ctx, prs.data),
    checkDangerousWorkflow(ctx),
    checkDependencyUpdate(ctx),
    checkFuzzing(ctx),
    checkLicense(ctx),
    checkPackaging(ctx),
    checkPermissions(ctx),
    checkPinnedDependencies(ctx),
    checkSAST(ctx),
    checkSecurityPolicy(ctx),
    checkSignedReleases(ctx, releases.data),
    checkVulnerabilities(ctx),
    checkBinaryArtifacts(ctx),
    checkContributors(ctx),
    checkSBOM(ctx),
  ];
}

// ==================== 1. MAINTAINED ====================
function checkMaintained(
  ctx: CheckContext,
  commits?: { date: string; author: string }[],
  issues?: { updatedAt: string; comments: number }[],
): CheckProbe {
  const findings: ProbeFinding[] = [];
  const days90 = 90 * 24 * 60 * 60 * 1000;
  const days180 = 180 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let hasRecentCommit = false;
  let hasRecentCommit180 = false;
  if (commits && commits.length > 0) {
    for (const c of commits) {
      const age = now - new Date(c.date).getTime();
      if (age < days90) { hasRecentCommit = true; break; }
      if (age < days180) { hasRecentCommit180 = true; }
    }
    if (hasRecentCommit) findings.push({ path: '.', severity: 'info', message: `Commits found within 90 days` });
    else if (hasRecentCommit180) findings.push({ path: '.', severity: 'medium', message: `Commits found within 180 days but not 90` });
    else findings.push({ path: '.', severity: 'high', message: 'No commits in 180 days' });
  } else {
    const recentFiles = ctx.files.filter(f => {
      try { return (now - statSync(join(ctx.repoPath, f)).mtimeMs) < days90; }
      catch { return false; }
    });
    hasRecentCommit = recentFiles.length > 0;
    if (hasRecentCommit) findings.push({ path: '.', severity: 'info', message: `${recentFiles.length} files modified within 90 days (API unavailable)` });
    else findings.push({ path: '.', severity: 'high', message: 'No recent activity detected' });
  }

  let hasRecentIssue = false;
  let hasRecentIssue180 = false;
  if (issues && issues.length > 0) {
    for (const iss of issues) {
      const age = now - new Date(iss.updatedAt).getTime();
      if (age < days90) { hasRecentIssue = true; break; }
      if (age < days180) { hasRecentIssue180 = true; }
    }
  }

  const commitPassed = hasRecentCommit ? true : false;
  const commitScore = hasRecentCommit ? 5 : hasRecentCommit180 ? 2.5 : 0;
  const issuePassed = hasRecentIssue ? true : false;

  const issueTemplatePaths = getAllPaths(ISSUE_TEMPLATE_PATHS, ctx.platform);
  const issueTemplateResult = findFileByPatterns(ctx, issueTemplatePaths);

  const refItems: ReferenceItem[] = [
    makeRefItem('Issue Template', 'Issue 模板', issueTemplateResult.found, issueTemplatePaths, undefined, undefined, getGroupedPaths(ISSUE_TEMPLATE_PATHS, ctx.platform)),
  ];

  const apiSources: ApiInfo[] = [
    { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
    { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/issues?state=all&per_page=10&sort=updated', description: 'Recent issues', description_zh: '近期问题' },
    { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
    { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/repository/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
  ];

  const rules = [
    makeRule({
      id: 'maintained-commits', name: 'Recent Commit Activity', name_zh: '近期提交活跃度',
      description: 'Check if the project has commits within 90 days',
      description_zh: '检查项目是否在90天内有提交',
      check_method: 'Fetch recent commits via platform API, check if any commit date is within 90 days',
      check_method_zh: '通过平台 API 获取近期提交，检查是否有提交日期在90天内',
      pass_condition: 'At least 1 commit within 90 days → full score; within 180 days → 50%; otherwise → 0',
      pass_condition_zh: '90天内有提交 → 满分；180天内有 → 50%；否则 → 0分',
      max_points: 5, deduction: commitPassed ? 0 : (hasRecentCommit180 ? 2.5 : 5),
      deduction_reason: commitPassed ? '' : (hasRecentCommit180 ? 'No commits in 90 days, only in 180 days' : 'No commits in 180 days'),
      deduction_reason_zh: commitPassed ? '' : (hasRecentCommit180 ? '90天内无提交，仅180天内有' : '180天内无提交'),
      passed: commitPassed,
      api_sources: apiSources,
      detection_fields: [
        { field: 'created_at', description: 'Commit timestamp', description_zh: '提交时间戳' },
      ],
      reasoning: 'Projects with recent commits are actively maintained and receiving security patches',
      reasoning_zh: '有近期提交的项目正在积极维护并接收安全补丁',
    }),
    makeRule({
      id: 'maintained-issues', name: 'Issue Response Activity', name_zh: '问题响应活跃度',
      description: 'Check if project members respond to issues within 90 days',
      description_zh: '检查项目成员是否在90天内响应问题',
      check_method: 'Fetch recent issues via platform API, check if any issue has updates or comments within 90 days',
      check_method_zh: '通过平台 API 获取近期问题，检查是否有问题在90天内有更新或评论',
      pass_condition: 'Issue activity within 90 days → full score; 180 days → 50%; otherwise → 0',
      pass_condition_zh: '90天内有问题活动 → 满分；180天内 → 50%；否则 → 0分',
      max_points: 5, deduction: issuePassed ? 0 : (hasRecentIssue180 ? 2.5 : 5),
      deduction_reason: issuePassed ? '' : 'No issue activity detected in 90 days',
      deduction_reason_zh: issuePassed ? '' : '90天内未检测到问题活动',
      passed: issuePassed,
      api_sources: apiSources,
      detection_fields: [
        { field: 'updated_at', description: 'Issue update timestamp', description_zh: '问题更新时间' },
        { field: 'comments', description: 'Number of comments', description_zh: '评论数量' },
      ],
      reasoning: 'Active issue response indicates the project is maintained and responsive to users',
      reasoning_zh: '积极的问题响应表明项目正在维护并对用户做出回应',
    }),
  ];

  return buildProbe('maintained', 'Maintained', '维护状态',
    'Check if the project is actively maintained',
    '检查项目是否被积极维护',
    'maintained', findings, rules, refItems,
    rules.some(r => !r.passed) ? {
      description: 'Ensure the project is actively maintained', description_zh: '确保项目被积极维护',
      steps: ['Maintain regular commit schedule', 'Respond to issues promptly', 'Create release roadmap'],
      steps_zh: ['保持定期提交计划', '及时响应问题', '创建发布路线图'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained'],
    } : undefined,
  );
}

// ==================== 2. CODE REVIEW ====================
function checkCodeReview(ctx: CheckContext, prs?: any[]): CheckProbe {
  const findings: ProbeFinding[] = [];

  const prTemplatePaths = getAllPaths(PR_TEMPLATE_PATHS, ctx.platform);
  const prTemplateResult = findFileByPatterns(ctx, prTemplatePaths);

  const codeownerPaths = getAllPaths(CODEOWNERS_PATHS, ctx.platform);
  const codeownerResult = findFileByPatterns(ctx, codeownerPaths);

  const contributingPaths = getAllPaths(CONTRIBUTING_PATHS, ctx.platform);
  const contributingResult = findFileByPatterns(ctx, contributingPaths);

  let totalPRs = 0;
  let reviewedPRs = 0;
  if (prs && prs.length > 0) {
    const scoredPRs = prs;
    totalPRs = scoredPRs.length;
    reviewedPRs = scoredPRs.filter((pr: any) => pr.hasApproval).length;
    const scorePerPR = totalPRs > 0 ? (10 / totalPRs) : 0;

    findings.push({ path: '.', severity: 'info', message: `Fetched ${totalPRs} merged PRs, Reviewed: ${reviewedPRs}, Score per PR: ${scorePerPR.toFixed(1)} pts` });

    for (const pr of scoredPRs) {
      const reviewers = pr.reviewers || [];
      const approvedReviewers = reviewers.filter((r: any) => r.accepted);
      const reviewerNames = approvedReviewers.map((r: any) => {
        const ownerTag = r.isCodeOwner ? ' (Code Owner)' : '';
        return `${r.login}${ownerTag}`;
      });
      const unreviewedAssignees = reviewers.filter((r: any) => !r.accepted);
      const unreviewedNames = unreviewedAssignees.map((r: any) => r.login);

      const title = `"${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}"`;
      const isMerged = pr.state === 'merged' || pr.mergedAt;
      const stateInfo = isMerged ? `Merged by ${pr.mergedBy || 'unknown'}` : `State: ${pr.state}`;

      const lines = [
        `PR #${pr.number}: ${title}`,
        `Author: ${pr.author}`,
      ];

      if (pr.hasApproval) {
        lines.push(`[SCORE:+${scorePerPR.toFixed(1)}]`);
        lines.push(`Approval count: ${pr.approvalCount}`);
        if (reviewerNames.length > 0) lines.push(`Approved by: ${reviewerNames.join(', ')}`);
      } else {
        lines.push(`[SCORE:-${scorePerPR.toFixed(1)}]`);
        lines.push(`Approval count: 0`);
      }

      lines.push(stateInfo);

      if (!pr.hasApproval && unreviewedNames.length > 0) {
        lines.push(`Assigned reviewers (not approved): ${unreviewedNames.join(', ')}`);
      }

      if (pr.labels.length > 0) lines.push(`Labels: [${pr.labels.join(', ')}]`);
      if (pr.htmlUrl) lines.push(pr.htmlUrl);

      findings.push({
        path: `PR#${pr.number}`,
        severity: pr.hasApproval ? 'info' : 'medium',
        message: lines.join('\n'),
      });
    }
  } else {
    findings.push({ path: '.', severity: 'info', message: 'No PR data available from API' });
  }

  const reviewRatio = totalPRs > 0 ? reviewedPRs / totalPRs : 0;
  const reviewPassed = totalPRs === 0 || reviewRatio >= 0.8;
  const reviewDeduction = totalPRs === 0 ? 0 : Math.round((1 - reviewRatio) * 10);

  const apiSources: ApiInfo[] = [
    { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/pulls?state=merged&per_page=30', description: 'Fetch only merged PRs', description_zh: '仅获取已合并的PR' },
    { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/pulls?state=closed&per_page=30 + GET .../reviews', description: 'Fetch closed PRs, filter merged_at is not null, + per-PR review records', description_zh: '获取 closed PR，筛选 merged_at 非空，+ 每个PR的审查记录' },
    { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/merge_requests?state=merged&per_page=30', description: 'Fetch only merged MRs', description_zh: '仅获取已合并的MR' },
  ];

  const rules = [
    makeRule({
      id: 'cr-pr-review', name: 'Human Review on Recent PRs', name_zh: '近期PR人工审核',
      description: 'Check if recent 30 merged PRs have been reviewed by a human',
      description_zh: '检查近30次已合并的PR是否有人工审核',
      check_method: 'Fetch 30 merged PRs via platform API (only merged state, exclude open/closed-not-merged), check approval_approvers_result >= 1',
      check_method_zh: '通过平台 API 获取30次已合并的PR（仅请求 merged 状态，排除 open 和 closed-not-merged），检查 approval_approvers_result >= 1',
      pass_condition: 'Score = (reviewed PRs / total merged PRs) × max_points',
      pass_condition_zh: '得分 = (已审核PR数 / 已合并PR总数) × 满分',
      max_points: 10, deduction: reviewDeduction,
      deduction_reason: totalPRs === 0 ? 'No PR data available' : `${totalPRs - reviewedPRs} PRs without human review`,
      deduction_reason_zh: totalPRs === 0 ? '无法获取PR数据' : `${totalPRs - reviewedPRs} 个PR未经人工审核`,
      passed: reviewPassed,
      api_sources: apiSources,
      detection_fields: [
        { field: 'approval_approvers_result', description: 'Number of approvers (AtomGit)', description_zh: '批准人数（AtomGit）' },
        { field: 'reviews[].state === "APPROVED"', description: 'Review approval status (GitHub)', description_zh: '审查批准状态（GitHub）' },
        { field: 'approved_by[].user', description: 'Approval users (GitLab)', description_zh: '批准用户（GitLab）' },
      ],
      reasoning: 'Only fetch merged PRs at the API level. On AtomGit/GitCode/GitLab, request state=merged directly. On GitHub, request state=closed then filter merged_at is not null. This guarantees all PRs are actually merged. approval_approvers_result >= 1 means at least one user clicked "Approve", a real human action. The platform validates that the approver is not the PR author.',
      reasoning_zh: '在 API 层面仅请求 merged 状态的PR。AtomGit/GitCode/GitLab 直接请求 state=merged，GitHub 请求 state=closed 后筛选 merged_at 非空。确保所有PR都是实际已合并的。approval_approvers_result >= 1 表示至少有1个用户在平台上点击了"批准"，这是真实的人工操作。平台会验证批准人不是PR作者本人。',
    }),
    makeRule({
      id: 'cr-pr-template', name: 'PR Template', name_zh: 'PR 模板',
      description: 'Check if a PR template file exists in the repository',
      description_zh: '检查仓库中是否存在 PR 模板文件',
      check_method: 'Scan repository for PR template files at platform-specific and common paths',
      check_method_zh: '扫描仓库中平台专属和通用路径下的 PR 模板文件',
      pass_condition: 'At least 1 PR template file found → pass',
      pass_condition_zh: '至少找到1个 PR 模板文件 → 通过',
      max_points: 0, deduction: 0,
      deduction_reason: prTemplateResult.found ? `Found at ${prTemplateResult.path}` : 'No PR template file found',
      deduction_reason_zh: prTemplateResult.found ? `已找到: ${prTemplateResult.path}` : '未找到 PR 模板文件',
      passed: prTemplateResult.found,
      reference_format: `# Pull Request Template\n## Description\n<!-- Describe changes -->\n## Type of Change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n## Testing\n<!-- Describe testing -->\n## Checklist\n- [ ] Code follows project style\n- [ ] Tests added/updated\n- [ ] Documentation updated`,
      reference_format_zh: `# 拉取请求模板\n## 描述\n<!-- 描述所做的更改 -->\n## 变更类型\n- [ ] 缺陷修复\n- [ ] 新功能\n- [ ] 破坏性变更\n## 测试\n<!-- 描述已完成的测试 -->\n## 检查清单\n- [ ] 代码遵循项目风格\n- [ ] 测试已添加/更新\n- [ ] 文档已更新`,
      detection_fields: prTemplatePaths.map(p => ({ field: p, description: `Check path: ${p}`, description_zh: `检测路径: ${p}` })),
    }),
    makeRule({
      id: 'cr-codeowners', name: 'CODEOWNERS', name_zh: 'CODEOWNERS 文件',
      description: 'Check if a CODEOWNERS file exists in the repository',
      description_zh: '检查仓库中是否存在 CODEOWNERS 文件',
      check_method: 'Scan repository for CODEOWNERS files at platform-specific and common paths',
      check_method_zh: '扫描仓库中平台专属和通用路径下的 CODEOWNERS 文件',
      pass_condition: 'At least 1 CODEOWNERS file found → pass',
      pass_condition_zh: '至少找到1个 CODEOWNERS 文件 → 通过',
      max_points: 0, deduction: 0,
      deduction_reason: codeownerResult.found ? `Found at ${codeownerResult.path}` : 'No CODEOWNERS file found',
      deduction_reason_zh: codeownerResult.found ? `已找到: ${codeownerResult.path}` : '未找到 CODEOWNERS 文件',
      passed: codeownerResult.found,
      reference_format: `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
      reference_format_zh: `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
      detection_fields: codeownerPaths.map(p => ({ field: p, description: `Check path: ${p}`, description_zh: `检测路径: ${p}` })),
    }),
    makeRule({
      id: 'cr-contributing', name: 'CONTRIBUTING.md', name_zh: 'CONTRIBUTING.md 贡献指南',
      description: 'Check if a CONTRIBUTING.md file exists in the repository',
      description_zh: '检查仓库中是否存在 CONTRIBUTING.md 贡献指南文件',
      check_method: 'Scan repository for CONTRIBUTING files at platform-specific and common paths',
      check_method_zh: '扫描仓库中平台专属和通用路径下的 CONTRIBUTING 文件',
      pass_condition: 'At least 1 CONTRIBUTING file found → pass',
      pass_condition_zh: '至少找到1个 CONTRIBUTING 文件 → 通过',
      max_points: 0, deduction: 0,
      deduction_reason: contributingResult.found ? `Found at ${contributingResult.path}` : 'No CONTRIBUTING file found',
      deduction_reason_zh: contributingResult.found ? `已找到: ${contributingResult.path}` : '未找到 CONTRIBUTING 文件',
      passed: contributingResult.found,
      detection_fields: contributingPaths.map(p => ({ field: p, description: `Check path: ${p}`, description_zh: `检测路径: ${p}` })),
    }),
  ];

  const refItems: ReferenceItem[] = [
    makeRefItem('PR Template', 'PR 模板', prTemplateResult.found, prTemplatePaths,
      `# Pull Request Template\n## Description\n<!-- Describe changes -->\n## Type of Change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n## Testing\n<!-- Describe testing -->\n## Checklist\n- [ ] Code follows project style\n- [ ] Tests added/updated\n- [ ] Documentation updated`,
      `# 拉取请求模板\n## 描述\n<!-- 描述所做的更改 -->\n## 变更类型\n- [ ] 缺陷修复\n- [ ] 新功能\n- [ ] 破坏性变更\n## 测试\n<!-- 描述已完成的测试 -->\n## 检查清单\n- [ ] 代码遵循项目风格\n- [ ] 测试已添加/更新\n- [ ] 文档已更新`,
      getGroupedPaths(PR_TEMPLATE_PATHS, ctx.platform),
    ),
    makeRefItem('CODEOWNERS', 'CODEOWNERS 文件', codeownerResult.found, codeownerPaths,
      `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
      `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
      getGroupedPaths(CODEOWNERS_PATHS, ctx.platform),
    ),
    makeRefItem('CONTRIBUTING.md', 'CONTRIBUTING.md 贡献指南', contributingResult.found, contributingPaths, undefined, undefined, getGroupedPaths(CONTRIBUTING_PATHS, ctx.platform)),
  ];

  return buildProbe('code-review', 'Code Review', '代码审查',
    'Check that the project requires code review before merging',
    '检查项目是否要求合并前进行代码审查',
    'code-review', findings, rules, refItems,
    rules.some(r => !r.passed) ? {
      description: 'Implement code review practices', description_zh: '实施代码审查实践',
      steps: ['Ensure all PRs are reviewed before merge', 'Add CODEOWNERS for dedicated reviewers', 'Add PR template'],
      steps_zh: ['确保所有PR在合并前被审查', '添加CODEOWNERS定义专用审查者', '添加PR模板'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#code-review'],
    } : undefined,
  );
}

// ==================== 3. BRANCH PROTECTION ====================
function checkBranchProtection(ctx: CheckContext, branches?: any[]): CheckProbe {
  const findings: ProbeFinding[] = [];

  let defaultProtected = false;
  let hasProtectedBranch = false;
  if (branches && branches.length > 0) {
    for (const b of branches) {
      if (b.defaultBranch && b.protected) { defaultProtected = true; hasProtectedBranch = true; }
      if (b.protected) hasProtectedBranch = true;
    }
    if (defaultProtected) findings.push({ path: '.', severity: 'info', message: 'Default branch is protected' });
    else findings.push({ path: '.', severity: 'high', message: 'Default branch is NOT protected' });
  } else {
    findings.push({ path: '.', severity: 'info', message: 'Branch data unavailable from API' });
  }

  const workflowFiles = getWorkflowFiles(ctx.files, ctx.platform);
  const hasCI = workflowFiles.length > 0;
  if (hasCI) findings.push({ path: '.', severity: 'info', message: `${workflowFiles.length} CI workflow(s) found` });
  else findings.push({ path: '.', severity: 'medium', message: 'No CI workflow files found' });

  const apiSources: ApiInfo[] = [
    { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/branches', description: 'Branch list with protection status', description_zh: '分支列表，含保护状态' },
    { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/branches + /branches/{branch}/protection', description: 'Branch list + protection rules', description_zh: '分支列表 + 保护规则' },
    { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/repository/branches + /protected_branches', description: 'Branch list + protected branches', description_zh: '分支列表 + 受保护分支' },
  ];

  const rules = [
    makeRule({
      id: 'bp-default-protected', name: 'Default Branch Protected', name_zh: '默认分支受保护',
      description: 'Check if the default branch has protection enabled',
      description_zh: '检查默认分支是否启用了保护',
      check_method: 'Fetch branches via API, check protected field on default_branch',
      check_method_zh: '通过 API 获取分支，检查 default_branch 的 protected 字段',
      pass_condition: 'Default branch protected === true → full score',
      pass_condition_zh: '默认分支 protected === true → 满分',
      max_points: 4, deduction: 4,
      deduction_reason: defaultProtected ? '' : 'Default branch is not protected',
      deduction_reason_zh: defaultProtected ? '' : '默认分支未受保护',
      passed: defaultProtected,
      api_sources: apiSources,
      detection_fields: [
        { field: 'protected', description: 'Branch protection status', description_zh: '分支保护状态' },
        { field: 'default_branch', description: 'Whether this is the default branch', description_zh: '是否为默认分支' },
      ],
      reasoning: 'Protected branches cannot be directly pushed to, requiring PR/MR workflow which enforces review and CI checks',
      reasoning_zh: '受保护的分支不能直接推送，需要通过 PR/MR 流程，强制执行审查和 CI 检查',
    }),
    makeRule({
      id: 'bp-force-push', name: 'Force Push Protection', name_zh: '禁止强制推送',
      description: 'Check if force pushes are blocked on protected branches',
      description_zh: '检查受保护分支是否阻止强制推送',
      check_method: 'Check branch protection API for force push settings',
      check_method_zh: '检查分支保护 API 中的强制推送设置',
      pass_condition: 'Force push blocked → full score (inferred from protected status)',
      pass_condition_zh: '禁止强制推送 → 满分（从保护状态推断）',
      max_points: 3, deduction: 3,
      deduction_reason: hasProtectedBranch ? '' : 'Cannot verify - no protected branches found',
      deduction_reason_zh: hasProtectedBranch ? '' : '无法验证 - 未找到受保护分支',
      passed: hasProtectedBranch,
      api_sources: apiSources,
      reasoning: 'Allowing force push lets anyone with write access overwrite history, potentially hiding malicious changes',
      reasoning_zh: '允许强制推送让有写权限的人覆盖历史，可能隐藏恶意更改',
    }),
    makeRule({
      id: 'bp-ci-config', name: 'CI Workflow Configured', name_zh: 'CI 工作流配置',
      description: 'Check if CI/CD workflow files exist',
      description_zh: '检查是否存在 CI/CD 工作流文件',
      check_method: 'Scan repository for workflow files in platform-specific paths',
      check_method_zh: '扫描仓库中平台特定路径的工作流文件',
      pass_condition: 'At least 1 CI config file found → full score',
      pass_condition_zh: '至少检测到1个 CI 配置文件 → 满分',
      max_points: 3, deduction: 3,
      deduction_reason: hasCI ? '' : 'No CI workflow files detected',
      deduction_reason_zh: hasCI ? '' : '未检测到 CI 工作流文件',
      passed: hasCI,
    }),
  ];

  return buildProbe('branch-protection', 'Branch Protection', '分支保护',
    'Check that the project uses branch protection',
    '检查项目是否使用分支保护',
    'branch-protection', findings, rules, undefined,
    rules.some(r => !r.passed) ? {
      description: 'Enable branch protection on default branch', description_zh: '在默认分支上启用分支保护',
      steps: ['Enable branch protection on default branch', 'Require status checks', 'Block force pushes', 'Require PR reviews'],
      steps_zh: ['在默认分支上启用分支保护', '要求状态检查', '阻止强制推送', '要求PR审查'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection'],
    } : undefined,
  );
}

// ==================== 4. CI/TESTS ====================
function checkCITests(ctx: CheckContext, prs?: any[]): CheckProbe {
  const findings: ProbeFinding[] = [];
  const workflowFiles = getWorkflowFiles(ctx.files, ctx.platform);

  let hasCIKeyword = false;
  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (content && CI_TEST_KEYWORDS.some(k => content.toLowerCase().includes(k))) {
      hasCIKeyword = true;
      findings.push({ path: wf, severity: 'info', message: `CI keyword found in workflow` });
    }
  }

  let ciPRCount = 0;
  let totalPRCount = 0;
  if (prs && prs.length > 0) {
    totalPRCount = prs.length;
    for (const pr of prs) {
      if (pr.labels?.some((l: string) => l.includes('ci_successful') || l.includes('ci_passed') || l.includes('pipeline'))) {
        ciPRCount++;
      }
    }
  }

  const testFiles = ctx.files.filter(f => {
    const lower = f.toLowerCase();
    return lower.includes('/test/') || lower.includes('/tests/') || lower.includes('/__tests__/') ||
      lower.endsWith('_test.go') || lower.includes('test_') || lower.includes('_spec.') ||
      lower.includes('/src/test/') || lower.endsWith('_test.rs');
  });
  const hasTestFiles = testFiles.length > 0;

  let hasTestScript = false;
  const pkgJson = readFileSafe(ctx, 'package.json');
  if (pkgJson) { try { const p = JSON.parse(pkgJson); if (p.scripts?.test || p.scripts?.['test:unit']) hasTestScript = true; } catch { } }
  const makefile = readFileSafe(ctx, 'Makefile');
  if (makefile && (makefile.includes('test') || makefile.includes('check'))) hasTestScript = true;
  const cargoToml = readFileSafe(ctx, 'Cargo.toml');
  if (cargoToml && cargoToml.includes('[dev-dependencies]')) hasTestScript = true;

  const rules = [
    makeRule({
      id: 'ci-workflow', name: 'CI Workflow with Tests', name_zh: 'CI 工作流含测试',
      description: 'Check if CI workflows contain test execution',
      description_zh: '检查 CI 工作流是否包含测试执行',
      check_method: 'Scan workflow files for test/lint/check/build/ci/verify keywords',
      check_method_zh: '扫描工作流文件中的 test/lint/check/build/ci/verify 关键字',
      max_points: 4, deduction: 4,
      deduction_reason: hasCIKeyword ? '' : 'No CI test workflow detected',
      deduction_reason_zh: hasCIKeyword ? '' : '未检测到 CI 测试工作流',
      passed: hasCIKeyword,
    }),
    makeRule({
      id: 'ci-test-files', name: 'Test Files Exist', name_zh: '测试文件存在',
      description: 'Check if test files exist in the project',
      description_zh: '检查项目中是否存在测试文件',
      check_method: 'Search for files/dirs containing test, spec, _test in their paths',
      check_method_zh: '搜索路径中包含 test、spec、_test 的文件/目录',
      max_points: 3, deduction: 3,
      deduction_reason: hasTestFiles ? '' : 'No test files detected',
      deduction_reason_zh: hasTestFiles ? '' : '未检测到测试文件',
      passed: hasTestFiles,
    }),
    makeRule({
      id: 'ci-test-script', name: 'Test Script Configured', name_zh: '测试脚本配置',
      description: 'Check if test scripts are configured in project metadata',
      description_zh: '检查项目元数据中是否配置了测试脚本',
      check_method: 'Check package.json scripts.test, Makefile test targets, Cargo.toml dev-dependencies, etc.',
      check_method_zh: '检查 package.json scripts.test、Makefile test 目标、Cargo.toml dev-dependencies 等',
      max_points: 3, deduction: 3,
      deduction_reason: hasTestScript ? '' : 'No test script found in project configuration',
      deduction_reason_zh: hasTestScript ? '' : '项目配置中未找到测试脚本',
      passed: hasTestScript,
    }),
  ];

  return buildProbe('ci-tests', 'CI/Tests', 'CI/测试',
    'Check that the project runs tests in CI',
    '检查项目是否在 CI 中运行测试',
    'ci-tests', findings, rules, undefined,
    rules.some(r => !r.passed) ? {
      description: 'Set up CI to run tests', description_zh: '设置 CI 运行测试',
      steps: ['Add CI workflow', 'Add test files', 'Configure test scripts'],
      steps_zh: ['添加 CI 工作流', '添加测试文件', '配置测试脚本'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-tests'],
    } : undefined,
  );
}

// ==================== 5. DANGEROUS WORKFLOW ====================
function checkDangerousWorkflow(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const workflowFiles = getWorkflowFiles(ctx.files, ctx.platform);

  let hasUntrustedCheckout = false;
  let injectionCount = 0;

  for (const wf of workflowFiles) {
    const content = readFileSafe(ctx, wf);
    if (!content) continue;

    if ((content.includes('pull_request_target') || content.includes('workflow_run')) &&
      content.match(/uses:\s*actions\/checkout[\s\S]*?ref:\s*\$\{\{\s*github\.event\.pull_request/)) {
      hasUntrustedCheckout = true;
      findings.push({ path: wf, severity: 'high', message: 'Untrusted checkout detected' });
    }

    for (const pattern of SCRIPT_INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        injectionCount++;
        findings.push({ path: wf, severity: 'high', message: `Script injection pattern found` });
      }
    }
  }

  if (workflowFiles.length === 0) findings.push({ path: '.', severity: 'info', message: 'No workflow files to analyze' });

  const rules = [
    makeRule({
      id: 'dw-untrusted-checkout', name: 'No Untrusted Checkout', name_zh: '无不受信任的检出',
      description: 'Check for untrusted code checkout in privileged triggers',
      description_zh: '检查特权触发器中是否存在不受信任的代码检出',
      check_method: 'Scan for pull_request_target/workflow_run + actions/checkout with PR ref',
      check_method_zh: '扫描 pull_request_target/workflow_run 与使用 PR ref 的 actions/checkout 的组合',
      max_points: 5, deduction: 5,
      deduction_reason: hasUntrustedCheckout ? 'Untrusted checkout detected - attackers could execute arbitrary code' : '',
      deduction_reason_zh: hasUntrustedCheckout ? '检测到不受信任的检出 - 攻击者可执行任意代码' : '',
      passed: !hasUntrustedCheckout,
    }),
    makeRule({
      id: 'dw-script-injection', name: 'No Script Injection', name_zh: '无脚本注入',
      description: 'Check for script injection via untrusted input',
      description_zh: '检查是否存在通过不受信任输入的脚本注入',
      check_method: 'Scan for github.event.* context vars used directly in run: blocks',
      check_method_zh: '扫描 run: 块中直接使用的 github.event.* 上下文变量',
      max_points: 5, deduction: Math.min(5, injectionCount * 2),
      deduction_reason: injectionCount > 0 ? `${injectionCount} injection pattern(s) found` : '',
      deduction_reason_zh: injectionCount > 0 ? `检测到 ${injectionCount} 个注入模式` : '',
      passed: injectionCount === 0,
    }),
  ];

  return buildProbe('dangerous-workflow', 'Dangerous Workflow', '危险工作流',
    'Check for dangerous CI/CD workflow patterns',
    '检查危险的 CI/CD 工作流模式',
    'dangerous-workflow', findings, rules, undefined,
    rules.some(r => !r.passed) ? {
      description: 'Fix dangerous workflow patterns', description_zh: '修复危险的工作流模式',
      steps: ['Use env vars for user input', 'Avoid checkout in pull_request_target', 'Pin actions to SHA'],
      steps_zh: ['使用环境变量处理用户输入', '避免在 pull_request_target 中检出', '将 actions 固定到 SHA'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#dangerous-workflow'],
    } : undefined,
  );
}

// ==================== 6. DEPENDENCY UPDATE ====================
function checkDependencyUpdate(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasDepTool = false;
  for (const f of [...DEPENDABOT_PATHS, ...RENOVATE_PATHS]) {
    if (fileExists(ctx, f)) { hasDepTool = true; findings.push({ path: f, severity: 'info', message: `Dependency tool config: ${f}` }); }
  }
  if (!hasDepTool) findings.push({ path: '.', severity: 'high', message: 'No dependency update tool found' });

  let hasLockFile = false;
  for (const f of LOCK_FILES) {
    if (fileExists(ctx, f)) { hasLockFile = true; findings.push({ path: f, severity: 'info', message: `Lock file: ${f}` }); }
  }

  const rules = [
    makeRule({
      id: 'dep-tool', name: 'Dependency Update Tool', name_zh: '依赖更新工具',
      description: 'Check if a dependency update tool is configured',
      description_zh: '检查是否配置了依赖更新工具',
      check_method: 'Search for Dependabot, Renovate, PyUp config files',
      check_method_zh: '搜索 Dependabot、Renovate、PyUp 配置文件',
      max_points: 5, deduction: 5,
      deduction_reason: hasDepTool ? '' : 'No dependency update tool configured',
      deduction_reason_zh: hasDepTool ? '' : '未配置依赖更新工具',
      passed: hasDepTool,
      reference_format: `# .github/dependabot.yml\nversion: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"`,
      reference_format_zh: `# .github/dependabot.yml\nversion: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"`,
    }),
    makeRule({
      id: 'dep-lock', name: 'Lock Files', name_zh: '锁定文件',
      description: 'Check if dependency lock files exist',
      description_zh: '检查是否存在依赖锁定文件',
      check_method: 'Search for package-lock.json, yarn.lock, go.sum, Cargo.lock, etc.',
      check_method_zh: '搜索 package-lock.json、yarn.lock、go.sum、Cargo.lock 等',
      max_points: 5, deduction: 5,
      deduction_reason: hasLockFile ? '' : 'No lock files found',
      deduction_reason_zh: hasLockFile ? '' : '未找到锁定文件',
      passed: hasLockFile,
    }),
  ];

  return buildProbe('dependency-update', 'Dependency Update', '依赖更新',
    'Check that a dependency update tool is configured',
    '检查是否配置了依赖更新工具',
    'dependency-update', findings, rules, undefined,
    rules.some(r => !r.passed) ? {
      description: 'Configure dependency update tool', description_zh: '配置依赖更新工具',
      steps: ['Enable Dependabot or Renovate', 'Add lock files', 'Review updates regularly'],
      steps_zh: ['启用 Dependabot 或 Renovate', '添加锁定文件', '定期审查更新'],
      expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0),
      effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#dependency-update-tool'],
    } : undefined,
  );
}

// ==================== 7-18: Remaining checks (same pattern) ====================

function checkFuzzing(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const detectedFuzzers: string[] = [];
  const detectedPaths: string[] = [];

  for (const fp of FUZZ_FILE_PATHS) {
    const matched = ctx.files.find(f => f.toLowerCase() === fp.toLowerCase() || f.toLowerCase().startsWith(fp.toLowerCase()));
    if (matched) {
      detectedPaths.push(matched);
      findings.push({ path: matched, severity: 'info', message: `Fuzz config file found: ${matched}` });
    }
  }

  for (const ind of FUZZ_INDICATORS) {
    const matched = ctx.files.find(f => f.toLowerCase().includes(ind.toLowerCase()));
    if (matched && !detectedPaths.includes(matched)) {
      if (!detectedFuzzers.includes(ind)) detectedFuzzers.push(ind);
      findings.push({ path: matched, severity: 'info', message: `Fuzz indicator in filename: "${ind}" in ${matched}` });
    }
  }

  for (const spec of FUZZ_LANG_SPECS) {
    const langFiles = ctx.files.filter(f => spec.extensions.some(ext => f.toLowerCase().endsWith(ext)));
    for (const file of langFiles) {
      const content = readFileSafe(ctx, file);
      if (!content) continue;
      for (const pattern of spec.patterns) {
        if (pattern.test(content)) {
          if (!detectedFuzzers.includes(spec.fuzzer)) detectedFuzzers.push(spec.fuzzer);
          findings.push({ path: file, severity: 'info', message: `${spec.language} fuzzing detected: "${pattern.source}" in ${file} (fuzzer: ${spec.fuzzer})` });
          break;
        }
      }
    }
  }

  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  for (const wf of wfFiles) {
    const c = readFileSafe(ctx, wf);
    if (c && FUZZ_INDICATORS.some(i => c.toLowerCase().includes(i.toLowerCase()))) {
      const matched = FUZZ_INDICATORS.filter(i => c.toLowerCase().includes(i.toLowerCase()));
      for (const m of matched) {
        if (!detectedFuzzers.includes(m)) detectedFuzzers.push(m);
      }
      findings.push({ path: wf, severity: 'info', message: `Fuzzing in CI workflow: ${wf} (${matched.join(', ')})` });
    }
  }

  const hasFuzz = detectedFuzzers.length > 0 || detectedPaths.length > 0;
  const totalDetected = detectedFuzzers.length + detectedPaths.length;

  if (hasFuzz) {
    findings.push({ path: '.', severity: 'info', message: `Total fuzzers/tools detected: ${totalDetected} (${[...detectedFuzzers, ...detectedPaths].join(', ')})` });
  }

  const rules = [makeRule({
    id: 'fuzz-tools', name: 'Fuzzing Tools', name_zh: '模糊测试工具',
    description: 'Check if fuzzing tools or configurations are present', description_zh: '检查是否存在模糊测试工具或配置',
    check_method: `1) Scan specific file paths: .clusterfuzzlite/Dockerfile, fuzz/, fuzzers/, fuzz_targets/. 2) Scan filename keywords: oss-fuzz, clusterfuzz, go-fuzz, afl, libfuzzer, honggfuzz, jazzer, fuzz_test, FuzzTest, fuzzing, fuzz_target. 3) Language-specific detection by file extension + function/import pattern: Go (*_test.go, func Fuzz*(*testing.F)), Python (*.py, import atheris), C (*.c, LLVMFuzzerTestOneInput), C++ (*.cc/*.cpp, LLVMFuzzerTestOneInput), Rust (*.rs, libfuzzer_sys), Java (*.java, com.code_intelligence.jazzer), JS/TS (*.js/*.ts, fast-check), C# (*.cs, FsCheck), Erlang (*.erl, eqc/proper), Haskell (*.hs, QuickCheck/Hedgehog), Swift (*.swift, LLVMFuzzerTestOneInput). 4) Scan CI workflow files for fuzz-related keywords.`,
    check_method_zh: `1) 扫描特定文件路径：.clusterfuzzlite/Dockerfile、fuzz/、fuzzers/、fuzz_targets/。2) 扫描文件名关键字：oss-fuzz、clusterfuzz、go-fuzz、afl、libfuzzer、honggfuzz、jazzer、fuzz_test、FuzzTest、fuzzing、fuzz_target。3) 按语言检测（文件扩展名 + 函数/导入模式匹配）：Go (*_test.go, func Fuzz*(*testing.F))、Python (*.py, import atheris)、C (*.c, LLVMFuzzerTestOneInput)、C++ (*.cc/*.cpp, LLVMFuzzerTestOneInput)、Rust (*.rs, libfuzzer_sys)、Java (*.java, com.code_intelligence.jazzer)、JS/TS (*.js/*.ts, fast-check)、C# (*.cs, FsCheck)、Erlang (*.erl, eqc/proper)、Haskell (*.hs, QuickCheck/Hedgehog)、Swift (*.swift, LLVMFuzzerTestOneInput)。4) 扫描 CI 工作流文件中的模糊测试关键字。`,
    pass_condition: 'At least 1 fuzzing tool or configuration detected → full score',
    pass_condition_zh: '检测到至少1个模糊测试工具或配置 → 满分',
    max_points: 10, deduction: 10,
    deduction_reason: hasFuzz ? '' : 'No fuzzing tools detected',
    deduction_reason_zh: hasFuzz ? '' : '未检测到模糊测试工具',
    passed: hasFuzz,
    detection_fields: [
      ...FUZZ_FILE_PATHS.map(p => ({ field: p, description: `Fuzz config path: ${p}`, description_zh: `模糊测试配置路径: ${p}` })),
      ...FUZZ_LANG_SPECS.map(s => ({ field: s.fuzzer, description: `${s.language}: ${s.extensions.join(', ')} → ${s.patterns.map(p => p.source).join(' | ')}`, description_zh: `${s.language_zh}：${s.extensions.join(', ')} → ${s.patterns.map(p => p.source).join(' | ')}` })),
    ],
  })];

  return buildProbe('fuzzing', 'Fuzzing', '模糊测试', 'Check that the project uses fuzzing', '检查项目是否使用模糊测试', 'fuzzing', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Integrate fuzzing', description_zh: '集成模糊测试', steps: ['Add ClusterFuzzLite (.clusterfuzzlite/Dockerfile)', 'Write language-specific fuzz targets (Go: testing.F, Python: atheris, C/C++: LLVMFuzzer)', 'Add fuzzing to CI workflow'], steps_zh: ['添加 ClusterFuzzLite (.clusterfuzzlite/Dockerfile)', '编写语言特定的模糊测试目标（Go: testing.F，Python: atheris，C/C++: LLVMFuzzer）', '在 CI 工作流中添加模糊测试'], expectedScoreImprovement: 10, effort: 'high', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#fuzzing'] } : undefined);
}

function checkLicense(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const licResult = findFileByPatterns(ctx, LICENSE_FILES);
  const hasLic = licResult.found;
  if (hasLic) findings.push({ path: licResult.path!, severity: 'info', message: `License: ${licResult.path}` });
  else findings.push({ path: '.', severity: 'high', message: 'No license file found' });

  let isRecognized = false;
  if (hasLic) {
    const content = readFileSafe(ctx, licResult.path!);
    if (content) {
      const lower = content.toLowerCase();
      for (const lic of KNOWN_LICENSES) {
        if (lic.patterns.every(p => lower.includes(p))) { isRecognized = true; findings.push({ path: licResult.path!, severity: 'info', message: `License type: ${lic.id}` }); break; }
      }
    }
  }

  let hasPkgLicense = false;
  const pkgJson = readFileSafe(ctx, 'package.json');
  if (pkgJson) { try { if (JSON.parse(pkgJson).license) hasPkgLicense = true; } catch { } }
  const cargoToml = readFileSafe(ctx, 'Cargo.toml');
  if (cargoToml && cargoToml.includes('license')) hasPkgLicense = true;

  const rules = [
    makeRule({ id: 'lic-file', name: 'License File', name_zh: '许可证文件', description: 'Check if LICENSE file exists', description_zh: '检查是否存在 LICENSE 文件', check_method: 'Search for LICENSE, COPYING files in root', check_method_zh: '在根目录搜索 LICENSE、COPYING 文件', max_points: 5, deduction: 5, deduction_reason: hasLic ? '' : 'No license file found', deduction_reason_zh: hasLic ? '' : '未找到许可证文件', passed: hasLic }),
    makeRule({ id: 'lic-recognized', name: 'Recognized License', name_zh: '认可的许可证', description: 'Check if license is OSI/FSF approved', description_zh: '检查许可证是否为 OSI/FSF 批准的', check_method: 'Parse license file content for known types', check_method_zh: '解析许可证文件内容中的已知类型', max_points: 3, deduction: 3, deduction_reason: isRecognized ? '' : 'License type not recognized', deduction_reason_zh: isRecognized ? '' : '许可证类型未被认可', passed: isRecognized }),
    makeRule({ id: 'lic-metadata', name: 'License in Metadata', name_zh: '元数据中的许可证', description: 'Check if license declared in package metadata', description_zh: '检查包元数据中是否声明了许可证', check_method: 'Check package.json license field, Cargo.toml, etc.', check_method_zh: '检查 package.json license 字段、Cargo.toml 等', max_points: 2, deduction: 2, deduction_reason: hasPkgLicense ? '' : 'License not in metadata', deduction_reason_zh: hasPkgLicense ? '' : '元数据中未声明许可证', passed: hasPkgLicense }),
  ];

  return buildProbe('license', 'License', '许可证', 'Check that the project has a recognized license', '检查项目是否具有认可的许可证', 'license', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Add recognized license', description_zh: '添加认可的许可证', steps: ['Choose OSI-approved license', 'Add LICENSE file', 'Add to metadata'], steps_zh: ['选择 OSI 认可的许可证', '添加 LICENSE 文件', '添加到元数据'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#license'] } : undefined);
}

function checkPackaging(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let hasPkgConfig = false;
  for (const f of PACKAGE_CONFIG_FILES) {
    if (f.includes('*')) {
      const ext = f.replace('*', '');
      if (ctx.files.some(cf => cf.endsWith(ext))) { hasPkgConfig = true; }
    } else if (fileExists(ctx, f)) { hasPkgConfig = true; findings.push({ path: f, severity: 'info', message: `Package config: ${f}` }); }
  }

  let hasReleaseWf = false;
  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  for (const wf of wfFiles) {
    const c = readFileSafe(ctx, wf);
    if (c && PUBLISH_COMMANDS.some(p => c.includes(p))) { hasReleaseWf = true; findings.push({ path: wf, severity: 'info', message: 'Release workflow detected' }); }
  }

  const rules = [
    makeRule({ id: 'pkg-config', name: 'Package Config', name_zh: '包配置', description: 'Check if package manager config exists', description_zh: '检查是否存在包管理器配置', check_method: 'Search for package.json, Cargo.toml, pom.xml, Dockerfile, etc.', check_method_zh: '搜索 package.json、Cargo.toml、pom.xml、Dockerfile 等', max_points: 5, deduction: 5, deduction_reason: hasPkgConfig ? '' : 'No package config found', deduction_reason_zh: hasPkgConfig ? '' : '未找到包配置', passed: hasPkgConfig }),
    makeRule({ id: 'pkg-release', name: 'Release Workflow', name_zh: '发布工作流', description: 'Check if automated release workflow exists', description_zh: '检查是否存在自动化发布工作流', check_method: 'Scan workflows for publish commands', check_method_zh: '扫描工作流中的发布命令', max_points: 5, deduction: 5, deduction_reason: hasReleaseWf ? '' : 'No release workflow found', deduction_reason_zh: hasReleaseWf ? '' : '未找到发布工作流', passed: hasReleaseWf }),
  ];

  return buildProbe('packaging', 'Packaging', '打包', 'Check that the project uses automated packaging', '检查项目是否使用自动化打包', 'packaging', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Set up automated packaging', description_zh: '设置自动化打包', steps: ['Create release workflow', 'Add package config'], steps_zh: ['创建发布工作流', '添加包配置'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#packaging'] } : undefined);
}

function checkPermissions(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  let hasExplicit = false, hasTopWrite = false, hasReadAll = false;
  for (const wf of wfFiles) {
    const c = readFileSafe(ctx, wf);
    if (!c) continue;
    if (/^permissions:/m.test(c)) hasExplicit = true;
    if (/permissions:\s*read-all/.test(c)) hasReadAll = true;
    if (/^permissions:\s*\n\s*(contents|packages|issues|pull-requests|actions):\s*write/m.test(c)) {
      hasTopWrite = true;
      findings.push({ path: wf, severity: 'high', message: 'Top-level write permission' });
    }
  }

  const rules = [
    makeRule({ id: 'perm-explicit', name: 'Explicit Permissions', name_zh: '显式权限声明', description: 'Check if workflows have explicit permissions', description_zh: '检查工作流是否有显式权限声明', check_method: 'Scan workflows for permissions: block', check_method_zh: '扫描工作流中的 permissions: 块', max_points: 4, deduction: 4, deduction_reason: hasExplicit || wfFiles.length === 0 ? '' : 'No explicit permissions', deduction_reason_zh: hasExplicit || wfFiles.length === 0 ? '' : '无显式权限声明', passed: hasExplicit || wfFiles.length === 0 }),
    makeRule({ id: 'perm-no-top-write', name: 'No Top-Level Write', name_zh: '无顶层写权限', description: 'Check no workflow has top-level write', description_zh: '检查是否没有顶层写权限', check_method: 'Scan for write permissions at top level', check_method_zh: '扫描顶层写权限', max_points: 4, deduction: 4, deduction_reason: hasTopWrite ? 'Top-level write detected' : '', deduction_reason_zh: hasTopWrite ? '检测到顶层写权限' : '', passed: !hasTopWrite }),
    makeRule({ id: 'perm-read-all', name: 'Read-All Baseline', name_zh: 'Read-All 基线', description: 'Check if any workflow uses read-all', description_zh: '检查是否有工作流使用 read-all', check_method: 'Scan for permissions: read-all', check_method_zh: '扫描 permissions: read-all', max_points: 2, deduction: 2, deduction_reason: hasReadAll || wfFiles.length === 0 ? '' : 'No read-all baseline', deduction_reason_zh: hasReadAll || wfFiles.length === 0 ? '' : '无 read-all 基线', passed: hasReadAll || wfFiles.length === 0 }),
  ];

  return buildProbe('permissions', 'Token Permissions', '令牌权限', 'Check workflows follow least privilege', '检查工作流是否遵循最小权限', 'permissions', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Apply least privilege', description_zh: '应用最小权限', steps: ['Add permissions block', 'Use read-all at top', 'Grant write at job level only'], steps_zh: ['添加权限块', '顶层使用 read-all', '仅在工作级别授予写权限'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions'] } : undefined);
}

function checkPinnedDependencies(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  let totalActions = 0, pinnedActions = 0;
  for (const wf of wfFiles) {
    const c = readFileSafe(ctx, wf);
    if (!c) continue;
    const uses = c.match(/uses:\s*[^#\n]+/g);
    if (uses) for (const line of uses) {
      totalActions++;
      const ref = line.replace('uses:', '').trim();
      if (/[a-f0-9]{40}/.test(ref)) pinnedActions++;
      else findings.push({ path: wf, severity: 'medium', message: `Not pinned: ${ref}` });
    }
  }

  const dockerfiles = ctx.files.filter(f => basename(f).toLowerCase().includes('dockerfile'));
  let totalDocker = 0, pinnedDocker = 0;
  for (const df of dockerfiles) {
    const c = readFileSafe(ctx, df);
    if (!c) continue;
    const froms = c.match(/^FROM\s+.+/gim);
    if (froms) for (const line of froms) {
      totalDocker++;
      if (line.includes('@sha256:') || (line.includes(':') && !line.includes(':latest'))) pinnedDocker++;
      else findings.push({ path: df, severity: 'high', message: `Unpinned: ${line.trim()}` });
    }
  }

  let hasLockFile = LOCK_FILES.some(f => fileExists(ctx, f));

  const rules = [
    makeRule({ id: 'pin-actions', name: 'Actions Pinned to SHA', name_zh: 'Actions 固定到 SHA', description: 'Check if GitHub Actions are pinned to SHA', description_zh: '检查 GitHub Actions 是否固定到 SHA', check_method: 'Parse uses: lines, verify 40-char hex SHA', check_method_zh: '解析 uses: 行，验证40字符十六进制 SHA', max_points: 4, deduction: totalActions === 0 ? 0 : Math.round((1 - pinnedActions / totalActions) * 4), deduction_reason: totalActions === 0 || pinnedActions === totalActions ? '' : `${totalActions - pinnedActions} actions not pinned`, deduction_reason_zh: totalActions === 0 || pinnedActions === totalActions ? '' : `${totalActions - pinnedActions} 个 action 未固定`, passed: totalActions === 0 || pinnedActions === totalActions }),
    makeRule({ id: 'pin-docker', name: 'Docker Images Pinned', name_zh: 'Docker 镜像固定', description: 'Check if Docker images are pinned', description_zh: '检查 Docker 镜像是否固定', check_method: 'Parse FROM lines in Dockerfiles', check_method_zh: '解析 Dockerfile 中的 FROM 行', max_points: 3, deduction: totalDocker === 0 ? 0 : Math.round((1 - pinnedDocker / totalDocker) * 3), deduction_reason: totalDocker === 0 || pinnedDocker === totalDocker ? '' : 'Docker images not pinned', deduction_reason_zh: totalDocker === 0 || pinnedDocker === totalDocker ? '' : 'Docker 镜像未固定', passed: totalDocker === 0 || pinnedDocker === totalDocker }),
    makeRule({ id: 'pin-lock', name: 'Lock Files', name_zh: '锁定文件', description: 'Check if lock files exist', description_zh: '检查是否存在锁定文件', check_method: 'Search for lock files', check_method_zh: '搜索锁定文件', max_points: 3, deduction: 3, deduction_reason: hasLockFile ? '' : 'No lock files', deduction_reason_zh: hasLockFile ? '' : '无锁定文件', passed: hasLockFile }),
  ];

  return buildProbe('pinned-dependencies', 'Pinned Dependencies', '依赖锁定', 'Check dependencies are pinned', '检查依赖是否固定', 'pinned-dependencies', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Pin all dependencies', description_zh: '固定所有依赖', steps: ['Pin Actions to SHA', 'Pin Docker to SHA256', 'Use lock files'], steps_zh: ['将 Actions 固定到 SHA', '将 Docker 固定到 SHA256', '使用锁定文件'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies'] } : undefined);
}

function checkSAST(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const detected: string[] = [];
  for (const tool of SAST_TOOLS) {
    if (ctx.files.some(f => basename(f).toLowerCase().includes(tool.pattern.toLowerCase()))) { detected.push(tool.name); }
  }
  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  for (const wf of wfFiles) {
    const c = readFileSafe(ctx, wf);
    if (c) for (const tool of SAST_TOOLS) {
      if (c.toLowerCase().includes(tool.pattern.toLowerCase()) && !detected.includes(tool.name)) detected.push(tool.name);
    }
  }
  if (detected.length > 0) findings.push({ path: '.', severity: 'info', message: `SAST tools: ${detected.join(', ')}` });
  else findings.push({ path: '.', severity: 'high', message: 'No SAST tools detected' });

  const inCI = wfFiles.some(wf => { const c = readFileSafe(ctx, wf); return c && SAST_TOOLS.some(t => c.toLowerCase().includes(t.pattern.toLowerCase())); });

  const rules = [
    makeRule({ id: 'sast-configured', name: 'SAST Tool Configured', name_zh: 'SAST 工具配置', description: 'Check if SAST tools are configured', description_zh: '检查是否配置了 SAST 工具', check_method: 'Search for CodeQL, SonarQube, Semgrep, etc.', check_method_zh: '搜索 CodeQL、SonarQube、Semgrep 等', max_points: 5, deduction: 5, deduction_reason: detected.length > 0 ? '' : 'No SAST tools detected', deduction_reason_zh: detected.length > 0 ? '' : '未检测到 SAST 工具', passed: detected.length > 0 }),
    makeRule({ id: 'sast-in-ci', name: 'SAST in CI', name_zh: 'CI 中的 SAST', description: 'Check if SAST is integrated into CI', description_zh: '检查 SAST 是否集成到 CI', check_method: 'Scan workflows for SAST tool references', check_method_zh: '扫描工作流中的 SAST 工具引用', max_points: 5, deduction: 5, deduction_reason: inCI ? '' : 'SAST not in CI', deduction_reason_zh: inCI ? '' : 'SAST 未集成到 CI', passed: inCI }),
  ];

  return buildProbe('sast', 'SAST', '静态分析', 'Check project uses SAST tools', '检查项目是否使用 SAST 工具', 'sast', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Integrate SAST tools', description_zh: '集成 SAST 工具', steps: ['Add CodeQL', 'Or integrate SonarCloud', 'Run on all PRs'], steps_zh: ['添加 CodeQL', '或集成 SonarCloud', '在所有 PR 上运行'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#sast'] } : undefined);
}

function checkSecurityPolicy(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const paths = getAllPaths(SECURITY_POLICY_PATHS, ctx.platform);
  const result = findFileByPatterns(ctx, paths);
  const hasFile = result.found;
  let hasLinks = false, hasEmail = false, hasDisclosure = false, hasContent = false;
  if (hasFile) {
    findings.push({ path: result.path!, severity: 'info', message: `Security policy: ${result.path}` });
    const c = readFileSafe(ctx, result.path!);
    if (c) {
      if (/https?:\/\/[^\s]+/.test(c)) hasLinks = true;
      if (/[^\s]+@[^\s]+\.[^\s]+/.test(c)) hasEmail = true;
      if (/disclos|vuln|report|披露|漏洞|报告/i.test(c)) hasDisclosure = true;
      if (c.length > 200) hasContent = true;
    }
  } else findings.push({ path: '.', severity: 'high', message: 'No SECURITY.md found' });

  const rules = [
    makeRule({ id: 'sp-present', name: 'SECURITY.md Present', name_zh: 'SECURITY.md 存在', description: 'Check if security policy file exists', description_zh: '检查是否存在安全策略文件', check_method: 'Search for SECURITY.md in platform paths', check_method_zh: '在平台路径中搜索 SECURITY.md', max_points: 4, deduction: 4, deduction_reason: hasFile ? '' : 'No security policy file', deduction_reason_zh: hasFile ? '' : '未找到安全策略文件', passed: hasFile }),
    makeRule({ id: 'sp-links', name: 'Contact Links', name_zh: '联系链接', description: 'Check if security policy has contact info', description_zh: '检查安全策略是否有联系信息', check_method: 'Regex match URLs and emails', check_method_zh: '正则匹配 URL 和邮箱', max_points: 2, deduction: 2, deduction_reason: hasLinks || hasEmail ? '' : 'No contact info', deduction_reason_zh: hasLinks || hasEmail ? '' : '无联系信息', passed: hasLinks || hasEmail }),
    makeRule({ id: 'sp-disclosure', name: 'Disclosure Process', name_zh: '披露流程', description: 'Check if disclosure process documented', description_zh: '检查是否记录了披露流程', check_method: 'Search for disclos/vuln/report keywords', check_method_zh: '搜索 disclos/vuln/report 关键字', max_points: 2, deduction: 2, deduction_reason: hasDisclosure ? '' : 'No disclosure process', deduction_reason_zh: hasDisclosure ? '' : '无披露流程', passed: hasDisclosure }),
    makeRule({ id: 'sp-content', name: 'Substantial Content', name_zh: '实质内容', description: 'Check if content is substantial (>200 chars)', description_zh: '检查内容是否充实（>200字符）', check_method: 'Verify content length > 200', check_method_zh: '验证内容长度 > 200', max_points: 2, deduction: 2, deduction_reason: hasContent ? '' : 'Content too short', deduction_reason_zh: hasContent ? '' : '内容过短', passed: hasContent }),
  ];

  const refItems = [makeRefItem('SECURITY.md', 'SECURITY.md', hasFile, paths,
    `# Security Policy\n## Reporting a Vulnerability\nPlease report vulnerabilities to security@example.com\nWe will respond within 48 hours.\n## Supported Versions\n| Version | Supported |\n|---------|----------|\n| 1.x     | Yes      |`,
    `# 安全策略\n## 报告漏洞\n请将漏洞报告发送至 security@example.com\n我们将在48小时内响应。\n## 支持的版本\n| 版本 | 是否支持 |\n|------|----------|\n| 1.x  | 是       |`,
    getGroupedPaths(SECURITY_POLICY_PATHS, ctx.platform),
  )];

  return buildProbe('security-policy', 'Security Policy', '安全策略', 'Check project has security policy', '检查项目是否有安全策略', 'security-policy', findings, rules, refItems,
    rules.some(r => !r.passed) ? { description: 'Create security policy', description_zh: '创建安全策略', steps: ['Create SECURITY.md', 'Include disclosure process', 'Add contact info'], steps_zh: ['创建 SECURITY.md', '包含披露流程', '添加联系信息'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#security-policy'] } : undefined);
}

function checkSignedReleases(ctx: CheckContext, releases?: any[]): CheckProbe {
  const findings: ProbeFinding[] = [];
  let signedCount = 0, totalReleases = 0;
  if (releases && releases.length > 0) {
    totalReleases = releases.length;
    for (const rel of releases) {
      const assets = rel.assets || [];
      if (assets.some((a: any) => SIGNATURE_EXTENSIONS.some(ext => (a.name || a.browser_download_url || '').endsWith(ext)))) signedCount++;
    }
  }

  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  let hasSigning = wfFiles.some(wf => { const c = readFileSafe(ctx, wf); return c && (c.includes('sigstore') || c.includes('cosign') || c.includes('sign')); });
  let hasProvenance = ctx.files.some(f => f.includes('.sigstore') || f.includes('provenance') || f.includes('attestation'));

  const rules = [
    makeRule({ id: 'sr-signatures', name: 'Release Signatures', name_zh: '发布签名', description: 'Check if releases have signatures', description_zh: '检查发布是否有签名', check_method: 'Check release assets for .sig, .asc, .gpg, .sigstore files', check_method_zh: '检查发布资产中的 .sig、.asc、.gpg、.sigstore 文件', max_points: 5, deduction: totalReleases === 0 ? 0 : (signedCount > 0 || hasSigning ? 0 : 5), deduction_reason: totalReleases === 0 || signedCount > 0 || hasSigning ? '' : 'No signed releases', deduction_reason_zh: totalReleases === 0 || signedCount > 0 || hasSigning ? '' : '无签名发布', passed: totalReleases === 0 || signedCount > 0 || hasSigning }),
    makeRule({ id: 'sr-provenance', name: 'Provenance Attestation', name_zh: '来源证明', description: 'Check if provenance attestations exist', description_zh: '检查是否存在来源证明', check_method: 'Search for provenance/attestation files and workflow references', check_method_zh: '搜索来源证明/认证文件和工作流引用', max_points: 5, deduction: 5, deduction_reason: hasProvenance || hasSigning ? '' : 'No provenance found', deduction_reason_zh: hasProvenance || hasSigning ? '' : '未找到来源证明', passed: hasProvenance || hasSigning }),
  ];

  return buildProbe('signed-releases', 'Signed Releases', '签名发布', 'Check releases are signed', '检查发布是否签名', 'signed-releases', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Sign releases', description_zh: '签名发布', steps: ['Use Sigstore/cosign', 'Generate SLSA provenance'], steps_zh: ['使用 Sigstore/cosign', '生成 SLSA 来源证明'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#signed-releases'] } : undefined);
}

function checkVulnerabilities(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const secPaths = getAllPaths(SECURITY_POLICY_PATHS, ctx.platform);
  const hasAdvisory = findFileByPatterns(ctx, secPaths).found;
  let hasAudit = ['npm-audit.json', 'audit.json', 'safety-check.json'].some(f => fileExists(ctx, f));
  let hasDepTool = [...DEPENDABOT_PATHS, ...RENOVATE_PATHS].some(f => fileExists(ctx, f));
  let hasResponse = false;
  if (hasAdvisory) {
    const secFile = findFileByPatterns(ctx, secPaths);
    if (secFile.path) { const c = readFileSafe(ctx, secFile.path); if (c && /disclos|vuln|report|披露|漏洞|报告/i.test(c)) hasResponse = true; }
  }

  const rules = [
    makeRule({ id: 'vuln-advisory', name: 'Security Advisory', name_zh: '安全公告', description: 'Check if security advisory configured', description_zh: '检查是否配置了安全公告', check_method: 'Check for SECURITY.md or advisory config', check_method_zh: '检查 SECURITY.md 或公告配置', max_points: 4, deduction: 4, deduction_reason: hasAdvisory ? '' : 'No security advisory', deduction_reason_zh: hasAdvisory ? '' : '无安全公告', passed: hasAdvisory }),
    makeRule({ id: 'vuln-monitoring', name: 'Vulnerability Monitoring', name_zh: '漏洞监控', description: 'Check if automated vulnerability monitoring set up', description_zh: '检查是否设置了自动化漏洞监控', check_method: 'Check for Dependabot, audit files, vulnerability scanning', check_method_zh: '检查 Dependabot、审计文件、漏洞扫描', max_points: 3, deduction: 3, deduction_reason: hasAudit || hasDepTool ? '' : 'No monitoring', deduction_reason_zh: hasAudit || hasDepTool ? '' : '无监控', passed: hasAudit || hasDepTool }),
    makeRule({ id: 'vuln-response', name: 'Response Process', name_zh: '响应流程', description: 'Check if vulnerability response process documented', description_zh: '检查是否记录了漏洞响应流程', check_method: 'Check SECURITY.md for response procedures', check_method_zh: '检查 SECURITY.md 中的响应程序', max_points: 3, deduction: 3, deduction_reason: hasResponse ? '' : 'No response process', deduction_reason_zh: hasResponse ? '' : '无响应流程', passed: hasResponse }),
  ];

  return buildProbe('vulnerabilities', 'Vulnerabilities', '漏洞', 'Check for vulnerability management', '检查漏洞管理', 'vulnerabilities', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Set up vulnerability management', description_zh: '设置漏洞管理', steps: ['Enable advisories', 'Set up Dependabot', 'Create response process'], steps_zh: ['启用安全公告', '设置 Dependabot', '创建响应流程'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#vulnerabilities'] } : undefined);
}

function checkBinaryArtifacts(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  let count = 0;
  for (const file of ctx.files) {
    if (BINARY_SKIP_DIRS.some(d => file.includes(d))) continue;
    if (BINARY_SKIP_FILES.some(f => basename(file) === f)) continue;
    if (BINARY_EXTENSIONS.includes(extname(file).toLowerCase())) {
      count++;
      findings.push({ path: file, severity: 'medium', message: `Binary: ${file}` });
    }
  }

  const rules = [makeRule({
    id: 'ba-none', name: 'No Binary Artifacts', name_zh: '无二进制制品',
    description: 'Check if source contains binary artifacts', description_zh: '检查源代码是否包含二进制制品',
    check_method: 'Scan files for binary extensions, excluding .git/, node_modules/, vendor/',
    check_method_zh: '扫描文件的二进制扩展名，排除 .git/、node_modules/、vendor/',
    max_points: 10, deduction: Math.min(10, count),
    deduction_reason: count === 0 ? '' : `${count} binary artifact(s) found`,
    deduction_reason_zh: count === 0 ? '' : `发现 ${count} 个二进制制品`,
    passed: count === 0,
  })];

  return buildProbe('binary-artifacts', 'Binary Artifacts', '二进制制品', 'Check source has no binary artifacts', '检查源代码无二进制制品', 'binary-artifacts', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Remove binary artifacts', description_zh: '移除二进制制品', steps: ['Remove binary files', 'Use package managers', 'Use Git LFS'], steps_zh: ['移除二进制文件', '使用包管理器', '使用 Git LFS'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#binary-artifacts'] } : undefined);
}

function checkContributors(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const contrPaths = getAllPaths(CONTRIBUTING_PATHS, ctx.platform);
  const coPaths = getAllPaths(CODEOWNERS_PATHS, ctx.platform);
  const mainPaths = getAllPaths(MAINTAINERS_PATHS, ctx.platform);
  const hasContributing = findFileByPatterns(ctx, contrPaths).found;
  const hasCodeowners = findFileByPatterns(ctx, coPaths).found;
  const hasMaintainers = findFileByPatterns(ctx, mainPaths).found;

  const rules = [
    makeRule({ id: 'contrib-guide', name: 'Contributing Guidelines', name_zh: '贡献指南', description: 'Check if contributing guidelines exist', description_zh: '检查是否存在贡献指南', check_method: 'Search for CONTRIBUTING.md', check_method_zh: '搜索 CONTRIBUTING.md', max_points: 4, deduction: 4, deduction_reason: hasContributing ? '' : 'No CONTRIBUTING.md', deduction_reason_zh: hasContributing ? '' : '无 CONTRIBUTING.md', passed: hasContributing }),
    makeRule({ id: 'contrib-owners', name: 'Code Owners', name_zh: '代码所有者', description: 'Check if CODEOWNERS exists', description_zh: '检查是否存在 CODEOWNERS', check_method: 'Search for CODEOWNERS file', check_method_zh: '搜索 CODEOWNERS 文件', max_points: 3, deduction: 3, deduction_reason: hasCodeowners ? '' : 'No CODEOWNERS', deduction_reason_zh: hasCodeowners ? '' : '无 CODEOWNERS', passed: hasCodeowners }),
    makeRule({ id: 'contrib-maintainers', name: 'Maintainers List', name_zh: '维护者列表', description: 'Check if maintainers file exists', description_zh: '检查是否存在维护者文件', check_method: 'Search for MAINTAINERS file', check_method_zh: '搜索 MAINTAINERS 文件', max_points: 3, deduction: 3, deduction_reason: hasMaintainers ? '' : 'No MAINTAINERS', deduction_reason_zh: hasMaintainers ? '' : '无 MAINTAINERS', passed: hasMaintainers }),
  ];

  return buildProbe('contributors', 'Contributors', '贡献者', 'Check project has diverse contributors', '检查项目是否有多样化贡献者', 'contributors', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Encourage contributions', description_zh: '鼓励贡献', steps: ['Add CONTRIBUTING.md', 'Create MAINTAINERS', 'Define CODEOWNERS'], steps_zh: ['添加 CONTRIBUTING.md', '创建 MAINTAINERS', '定义 CODEOWNERS'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'medium', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#contributors'] } : undefined);
}

function checkSBOM(ctx: CheckContext): CheckProbe {
  const findings: ProbeFinding[] = [];
  const sbomFiles = ctx.files.filter(f => SBOM_PATTERNS.some(p => basename(f).toLowerCase().includes(p)));
  const hasSBOM = sbomFiles.length > 0;

  const wfFiles = getWorkflowFiles(ctx.files, ctx.platform);
  let hasGenWf = wfFiles.some(wf => { const c = readFileSafe(ctx, wf); return c && (c.includes('sbom') || c.includes('syft') || c.includes('cyclonedx')); });

  const rules = [
    makeRule({ id: 'sbom-file', name: 'SBOM File', name_zh: 'SBOM 文件', description: 'Check if SBOM file exists', description_zh: '检查是否存在 SBOM 文件', check_method: 'Search for sbom/bom/spdx/cyclonedx in filenames', check_method_zh: '搜索文件名中的 sbom/bom/spdx/cyclonedx', max_points: 5, deduction: 5, deduction_reason: hasSBOM ? '' : 'No SBOM file', deduction_reason_zh: hasSBOM ? '' : '无 SBOM 文件', passed: hasSBOM }),
    makeRule({ id: 'sbom-generation', name: 'SBOM Generation', name_zh: 'SBOM 生成', description: 'Check if SBOM generation is automated', description_zh: '检查 SBOM 生成是否自动化', check_method: 'Scan workflows for sbom/syft/cyclonedx', check_method_zh: '扫描工作流中的 sbom/syft/cyclonedx', max_points: 5, deduction: 5, deduction_reason: hasGenWf ? '' : 'No SBOM generation', deduction_reason_zh: hasGenWf ? '' : '无 SBOM 生成', passed: hasGenWf }),
  ];

  return buildProbe('sbom', 'SBOM', 'SBOM', 'Check project provides SBOM', '检查项目是否提供 SBOM', 'sbom', findings, rules, undefined,
    rules.some(r => !r.passed) ? { description: 'Generate SBOM', description_zh: '生成 SBOM', steps: ['Use Syft or CycloneDX', 'Automate in CI/CD'], steps_zh: ['使用 Syft 或 CycloneDX', '在 CI/CD 中自动化'], expectedScoreImprovement: rules.filter(r => !r.passed).reduce((s, r) => s + r.deduction, 0), effort: 'low', references: ['https://github.com/ossf/scorecard/blob/main/docs/checks.md#sbom'] } : undefined);
}
