import { Router, Request, Response } from 'express';
import { CATEGORY_SEVERITY, SEVERITY_WEIGHTS } from '../types';
import type { CheckCategory, Severity } from '../types';

export const rulesRouter = Router();

interface RuleCategoryData {
  id: CheckCategory;
  name: string;
  name_zh: string;
  severity: Severity;
  weight: number;
  description: string;
  description_zh: string;
  scoring_items: {
    name: string;
    name_zh: string;
    is_deduction: boolean;
    check_method: string;
    check_method_zh: string;
    pass_condition?: string;
    pass_condition_zh?: string;
    api_sources?: { platform: string; endpoint: string; description: string; description_zh: string }[];
    detection_fields?: { field: string; description: string; description_zh: string }[];
    reasoning?: string;
    reasoning_zh?: string;
    max_points: number;
    reference_format?: string;
    reference_format_zh?: string;
  }[];
}

const allRules: RuleCategoryData[] = [
  {
    id: 'maintained', name: 'Maintained', name_zh: '维护状态',
    severity: CATEGORY_SEVERITY['maintained'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['maintained']],
    description: 'Check if the project is actively maintained',
    description_zh: '检查项目是否被积极维护',
    scoring_items: [
      {
        name: 'Recent Commit Activity', name_zh: '近期提交活跃度', is_deduction: true,
        check_method: 'Fetch recent commits via platform API, check if any commit date is within 90 days',
        check_method_zh: '通过平台 API 获取近期提交，检查是否有提交日期在90天内',
        pass_condition: 'At least 1 commit within 90 days → full score; within 180 days → 50%; otherwise → 0',
        pass_condition_zh: '90天内有提交 → 满分；180天内 → 50%；否则 → 0分',
        max_points: 5,
        api_sources: [
          { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
          { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
          { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/repository/commits?per_page=30', description: 'Recent commits', description_zh: '近期提交' },
        ],
        detection_fields: [{ field: 'created_at', description: 'Commit timestamp', description_zh: '提交时间戳' }],
        reasoning: 'Projects with recent commits are actively maintained and receiving security patches',
        reasoning_zh: '有近期提交的项目正在积极维护并接收安全补丁',
      },
      {
        name: 'Issue Response Activity', name_zh: '问题响应活跃度', is_deduction: true,
        check_method: 'Fetch recent issues via API, check updates within 90 days',
        check_method_zh: '通过 API 获取近期问题，检查90天内更新',
        pass_condition: 'Issue activity within 90 days → full score; 180 days → 50%; otherwise → 0',
        pass_condition_zh: '90天内有问题活动 → 满分；180天内 → 50%；否则 → 0分',
        max_points: 5,
        api_sources: [
          { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/issues?state=all&per_page=10&sort=updated', description: 'Recent issues', description_zh: '近期问题' },
          { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/issues?state=all&per_page=10&sort=updated', description: 'Recent issues', description_zh: '近期问题' },
        ],
        detection_fields: [
          { field: 'updated_at', description: 'Issue update timestamp', description_zh: '问题更新时间' },
          { field: 'comments', description: 'Number of comments', description_zh: '评论数量' },
        ],
        reasoning: 'Active issue response indicates maintained project',
        reasoning_zh: '积极的问题响应表明项目正在维护',
      },
    ],
  },
  {
    id: 'code-review', name: 'Code Review', name_zh: '代码审查',
    severity: CATEGORY_SEVERITY['code-review'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['code-review']],
    description: 'Check that the project requires code review before merging',
    description_zh: '检查项目是否要求合并前进行代码审查',
    scoring_items: [
      {
        name: 'Human Review on Recent PRs', name_zh: '近期PR人工审核', is_deduction: true,
        check_method: `Fetch 30 merged PRs via platform API. AtomGit/GitCode: state=merged (1 request). GitHub: state=closed (1 request), then filter merged_at is not null to get only merged PRs. GitLab: state=merged (1 request). All results deduplicated by PR number, sorted by creation time descending, take top 30. For each PR check approval_approvers_result >= 1 (AtomGit) or reviews[].state === 'APPROVED' (GitHub) or approved_by[].length > 0 (GitLab). Score = (reviewed PRs / total merged PRs) × 10 pts.`,
        check_method_zh: `通过平台 API 获取30次已合并的PR。AtomGit/GitCode：state=merged（1次请求）。GitHub：state=closed（1次请求），筛选 merged_at 非空的才是已合并PR。GitLab：state=merged（1次请求）。所有结果按 PR 编号去重，按创建时间降序排列，取前30次。对每个PR检查 approval_approvers_result >= 1（AtomGit）或 reviews[].state === 'APPROVED'（GitHub）或 approved_by[].length > 0（GitLab）。得分 = (已审核PR数 / 已合并PR总数) × 10分。`,
        pass_condition: `Score = (reviewed PRs / total merged PRs) × 10 pts. Pass threshold >= 80% review ratio. Only merged PRs are included, closed-not-merged and open PRs are excluded.`,
        pass_condition_zh: `得分 = (已审核PR数 / 已合并PR总数) × 10分。通过阈值 >= 80% 审核比例。仅包含已合并的PR，排除关闭未合并和 open 状态的PR。`,
        max_points: 10,
        api_sources: [
          { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/pulls?state=merged&per_page=30', description: 'Fetch only merged PRs', description_zh: '仅获取已合并的PR' },
          { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/pulls?state=closed&per_page=30 + GET /pulls/{number}/reviews', description: 'Fetch closed PRs, filter merged_at is not null, + per-PR review records', description_zh: '获取 closed PR，筛选 merged_at 非空为已合并，+ 每个PR的审查记录' },
          { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/merge_requests?state=merged&per_page=30', description: 'Fetch only merged MRs', description_zh: '仅获取已合并的MR' },
        ],
        detection_fields: [
          { field: 'mergeable_state.approval_approvers_result', description: 'Number of approvers on AtomGit (>= 1 means human approved)', description_zh: 'AtomGit 上的审批人数（>= 1 表示人工审批通过）' },
          { field: 'assignees[].accept', description: 'Assignee acceptance status on AtomGit (true = approved)', description_zh: 'AtomGit 上指派人的接受状态（true = 已批准）' },
          { field: 'assignees[].code_owner', description: 'Whether assignee is a code owner on AtomGit', description_zh: 'AtomGit 上指派人是否为代码所有者' },
          { field: 'reviews[].state === "APPROVED"', description: 'Review approval status on GitHub (APPROVED = human approved)', description_zh: 'GitHub 上的审查批准状态（APPROVED = 人工审批通过）' },
          { field: 'approved_by[].user', description: 'Approval users on GitLab from approved_by array', description_zh: 'GitLab 上 approved_by 数组中的批准用户' },
          { field: 'state', description: 'PR/MR state: closed (GitHub), merged (AtomGit/GitLab), rejected (AtomGit)', description_zh: 'PR/MR 状态：closed（GitHub）、merged（AtomGit/GitLab）、rejected（AtomGit）' },
          { field: 'merged_by', description: 'User who merged the PR/MR', description_zh: '合并 PR/MR 的用户' },
          { field: 'labels[]', description: 'PR labels like ci_successful, stat/needs-squash, etc.', description_zh: 'PR 标签，如 ci_successful、stat/needs-squash 等' },
        ],
        reasoning: `Only fetch merged PRs. AtomGit/GitCode/GitLab request state=merged directly. GitHub requests state=closed then filters merged_at is not null. This guarantees all 30 PRs are actually merged into the codebase. approval_approvers_result >= 1 means at least one user clicked "Approve", a real human action. The platform validates that the approver is not the PR author. Each merged PR is scored individually: approved PRs get +scorePerPR pts, unreviewed PRs get -scorePerPR pts.`,
        reasoning_zh: `仅获取已合并的PR。AtomGit/GitCode/GitLab 直接请求 state=merged，GitHub 请求 state=closed 后筛选 merged_at 非空。确保30次PR都是实际合并到代码库的。approval_approvers_result >= 1 表示至少有1个用户在平台上点击了"批准"，这是真实的人工操作。平台会验证批准人不是PR作者本人。每个已合并的PR单独评分：已审核的PR获得 +scorePerPR 分，未审核的PR扣除 -scorePerPR 分。`,
      },
      {
        name: 'PR Template', name_zh: 'PR 模板', is_deduction: false,
        check_method: `Scan repository for PR/MR template files at platform-specific and common paths. Platform paths: AtomGit (.atomgit/pull_request_template.md, .atomgit/merge_request_template.md), GitHub (.github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md, .github/PULL_REQUEST_TEMPLATE/), GitLab (.gitlab/merge_request_templates/), GitCode (.gitcode/pull_request_template.md). Common paths: pull_request_template.md, PULL_REQUEST_TEMPLATE.md, merge_request_template.md, docs/pull_request_template.md. Pass if any one file found.`,
        check_method_zh: `扫描仓库中平台专属和通用路径下的 PR/MR 模板文件。平台路径：AtomGit (.atomgit/pull_request_template.md, .atomgit/merge_request_template.md)，GitHub (.github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md, .github/PULL_REQUEST_TEMPLATE/)，GitLab (.gitlab/merge_request_templates/)，GitCode (.gitcode/pull_request_template.md)。通用路径：pull_request_template.md, PULL_REQUEST_TEMPLATE.md, merge_request_template.md, docs/pull_request_template.md。找到任一文件即通过。`,
        max_points: 0,
        reference_format: `# Pull Request Template\n## Description\n<!-- Describe changes -->\n## Type of Change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n## Testing\n<!-- Describe testing -->\n## Checklist\n- [ ] Code follows project style\n- [ ] Tests added/updated\n- [ ] Documentation updated`,
        reference_format_zh: `# 拉取请求模板\n## 描述\n<!-- 描述所做的更改 -->\n## 变更类型\n- [ ] 缺陷修复\n- [ ] 新功能\n- [ ] 破坏性变更\n## 测试\n<!-- 描述已完成的测试 -->\n## 检查清单\n- [ ] 代码遵循项目风格\n- [ ] 测试已添加/更新\n- [ ] 文档已更新`,
      },
      {
        name: 'CODEOWNERS', name_zh: 'CODEOWNERS 文件', is_deduction: false,
        check_method: `Scan repository for CODEOWNERS file at platform-specific and common paths. Platform paths: AtomGit (.atomgit/CODEOWNERS), GitHub (.github/CODEOWNERS), GitLab (.gitlab/CODEOWNERS), GitCode (.gitcode/CODEOWNERS). Common paths: CODEOWNERS, docs/CODEOWNERS. Pass if any one file found.`,
        check_method_zh: `扫描仓库中平台专属和通用路径下的 CODEOWNERS 文件。平台路径：AtomGit (.atomgit/CODEOWNERS)，GitHub (.github/CODEOWNERS)，GitLab (.gitlab/CODEOWNERS)，GitCode (.gitcode/CODEOWNERS)。通用路径：CODEOWNERS, docs/CODEOWNERS。找到任一文件即通过。`,
        max_points: 0,
        reference_format: `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
        reference_format_zh: `# .github/CODEOWNERS\n* @org/core-team\n/frontend/ @org/frontend-team\n/api/ @org/backend-team\n/.github/workflows/ @org/devops-team`,
      },
      {
        name: 'CONTRIBUTING.md', name_zh: 'CONTRIBUTING.md 贡献指南', is_deduction: false,
        check_method: `Scan repository for CONTRIBUTING files at platform-specific and common paths. Platform paths: AtomGit (.atomgit/CONTRIBUTING.md), GitHub (.github/CONTRIBUTING.md), GitLab (.gitlab/CONTRIBUTING.md), GitCode (.gitcode/CONTRIBUTING.md). Common paths: CONTRIBUTING.md, docs/CONTRIBUTING.md. Pass if any one file found.`,
        check_method_zh: `扫描仓库中平台专属和通用路径下的 CONTRIBUTING 文件。平台路径：AtomGit (.atomgit/CONTRIBUTING.md)，GitHub (.github/CONTRIBUTING.md)，GitLab (.gitlab/CONTRIBUTING.md)，GitCode (.gitcode/CONTRIBUTING.md)。通用路径：CONTRIBUTING.md, docs/CONTRIBUTING.md。找到任一文件即通过。`,
        max_points: 0,
      },
    ],
  },
  {
    id: 'branch-protection', name: 'Branch Protection', name_zh: '分支保护',
    severity: CATEGORY_SEVERITY['branch-protection'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['branch-protection']],
    description: 'Check that the project uses branch protection',
    description_zh: '检查项目是否使用分支保护',
    scoring_items: [
      {
        name: 'Default Branch Protected', name_zh: '默认分支受保护', is_deduction: true,
        check_method: 'Fetch branches via API, check protected field on default_branch',
        check_method_zh: '通过 API 获取分支，检查 default_branch 的 protected 字段',
        pass_condition: 'Default branch protected === true → full score',
        pass_condition_zh: '默认分支 protected === true → 满分',
        max_points: 4,
        api_sources: [
          { platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/branches', description: 'Branch list with protection', description_zh: '分支列表，含保护状态' },
          { platform: 'GitHub', endpoint: 'GET /repos/{owner}/{repo}/branches + /protection', description: 'Branch list + rules', description_zh: '分支列表 + 保护规则' },
          { platform: 'GitLab', endpoint: 'GET /api/v4/projects/{id}/protected_branches', description: 'Protected branches', description_zh: '受保护分支' },
        ],
        detection_fields: [
          { field: 'protected', description: 'Branch protection status', description_zh: '分支保护状态' },
          { field: 'default_branch', description: 'Whether default branch', description_zh: '是否为默认分支' },
        ],
        reasoning: 'Protected branches cannot be directly pushed to, requiring PR/MR workflow',
        reasoning_zh: '受保护的分支不能直接推送，需要通过 PR/MR 流程',
      },
      {
        name: 'Force Push Protection', name_zh: '禁止强制推送', is_deduction: true,
        check_method: 'Inferred from branch protection status',
        check_method_zh: '从分支保护状态推断',
        pass_condition: 'Protected branch exists → force push blocked (inferred)',
        pass_condition_zh: '存在受保护分支 → 推断禁止强制推送',
        max_points: 3,
        reasoning: 'Force push allows overwriting history, potentially hiding malicious changes',
        reasoning_zh: '强制推送允许覆盖历史，可能隐藏恶意更改',
      },
      {
        name: 'CI Workflow Configured', name_zh: 'CI 工作流配置', is_deduction: true,
        check_method: 'Scan for workflow files in platform-specific paths',
        check_method_zh: '扫描平台特定路径的工作流文件',
        max_points: 3,
      },
    ],
  },
  {
    id: 'ci-tests', name: 'CI/Tests', name_zh: 'CI/测试',
    severity: CATEGORY_SEVERITY['ci-tests'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['ci-tests']],
    description: 'Check that the project runs tests in CI',
    description_zh: '检查项目是否在 CI 中运行测试',
    scoring_items: [
      { name: 'CI Workflow with Tests', name_zh: 'CI 工作流含测试', is_deduction: true, check_method: 'Scan workflows for test/lint/check/build keywords', check_method_zh: '扫描工作流中的 test/lint/check/build 关键字', max_points: 4 },
      { name: 'Test Files Exist', name_zh: '测试文件存在', is_deduction: true, check_method: 'Search for test/spec directories and files', check_method_zh: '搜索 test/spec 目录和文件', max_points: 3 },
      { name: 'Test Script Configured', name_zh: '测试脚本配置', is_deduction: true, check_method: 'Check package.json, Makefile, Cargo.toml for test config', check_method_zh: '检查 package.json、Makefile、Cargo.toml 的测试配置', max_points: 3 },
    ],
  },
  {
    id: 'dangerous-workflow', name: 'Dangerous Workflow', name_zh: '危险工作流',
    severity: CATEGORY_SEVERITY['dangerous-workflow'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['dangerous-workflow']],
    description: 'Check for dangerous CI/CD workflow patterns',
    description_zh: '检查危险的 CI/CD 工作流模式',
    scoring_items: [
      { name: 'No Untrusted Checkout', name_zh: '无不受信任的检出', is_deduction: true, check_method: 'Scan for pull_request_target + actions/checkout with PR ref', check_method_zh: '扫描 pull_request_target 与使用 PR ref 的 checkout 组合', max_points: 5, reasoning: 'pull_request_target has write permission + PR code checkout = arbitrary code execution', reasoning_zh: 'pull_request_target 有写权限 + PR 代码检出 = 可执行任意代码' },
      { name: 'No Script Injection', name_zh: '无脚本注入', is_deduction: true, check_method: 'Scan for github.event.* in run: blocks', check_method_zh: '扫描 run: 块中的 github.event.*', max_points: 5, reasoning: 'Untrusted input in scripts enables command injection', reasoning_zh: '脚本中不受信任的输入导致命令注入' },
    ],
  },
  {
    id: 'dependency-update', name: 'Dependency Update', name_zh: '依赖更新',
    severity: CATEGORY_SEVERITY['dependency-update'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['dependency-update']],
    description: 'Check that a dependency update tool is configured',
    description_zh: '检查是否配置了依赖更新工具',
    scoring_items: [
      { name: 'Dependency Update Tool', name_zh: '依赖更新工具', is_deduction: true, check_method: 'Search for Dependabot/Renovate config files', check_method_zh: '搜索 Dependabot/Renovate 配置文件', max_points: 5, reference_format: `# .github/dependabot.yml\nversion: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"`, reference_format_zh: `# .github/dependabot.yml\nversion: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"` },
      { name: 'Lock Files', name_zh: '锁定文件', is_deduction: true, check_method: 'Search for lock files', check_method_zh: '搜索锁定文件', max_points: 5 },
    ],
  },
  {
    id: 'fuzzing', name: 'Fuzzing', name_zh: '模糊测试',
    severity: CATEGORY_SEVERITY['fuzzing'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['fuzzing']],
    description: 'Check that the project uses fuzzing',
    description_zh: '检查项目是否使用模糊测试',
    scoring_items: [
      {
        name: 'Fuzzing Tools', name_zh: '模糊测试工具', is_deduction: true,
        check_method: `1) Scan specific file paths: .clusterfuzzlite/Dockerfile, fuzz/, fuzzers/, fuzz_targets/. 2) Scan filename keywords: oss-fuzz, clusterfuzz, go-fuzz, afl, libfuzzer, honggfuzz, jazzer, fuzz_test, FuzzTest, fuzzing, fuzz_target. 3) Language-specific detection by file extension + function/import pattern: Go (*_test.go, func Fuzz*(*testing.F)), Python (*.py, import atheris), C (*.c, LLVMFuzzerTestOneInput), C++ (*.cc/*.cpp, LLVMFuzzerTestOneInput), Rust (*.rs, libfuzzer_sys), Java (*.java, com.code_intelligence.jazzer), JS/TS (*.js/*.ts, fast-check), C# (*.cs, FsCheck), Erlang (*.erl, eqc/proper), Haskell (*.hs, QuickCheck/Hedgehog), Swift (*.swift, LLVMFuzzerTestOneInput). 4) Scan CI workflow files for fuzz-related keywords.`,
        check_method_zh: `1) 扫描特定文件路径：.clusterfuzzlite/Dockerfile、fuzz/、fuzzers/、fuzz_targets/。2) 扫描文件名关键字：oss-fuzz、clusterfuzz、go-fuzz、afl、libfuzzer、honggfuzz、jazzer、fuzz_test、FuzzTest、fuzzing、fuzz_target。3) 按语言检测（文件扩展名 + 函数/导入模式匹配）：Go (*_test.go, func Fuzz*(*testing.F))、Python (*.py, import atheris)、C (*.c, LLVMFuzzerTestOneInput)、C++ (*.cc/*.cpp, LLVMFuzzerTestOneInput)、Rust (*.rs, libfuzzer_sys)、Java (*.java, com.code_intelligence.jazzer)、JS/TS (*.js/*.ts, fast-check)、C# (*.cs, FsCheck)、Erlang (*.erl, eqc/proper)、Haskell (*.hs, QuickCheck/Hedgehog)、Swift (*.swift, LLVMFuzzerTestOneInput)。4) 扫描 CI 工作流文件中的模糊测试关键字。`,
        pass_condition: 'At least 1 fuzzing tool or configuration detected → full score (10 pts). Binary scoring: all or nothing.',
        pass_condition_zh: '检测到至少1个模糊测试工具或配置 → 满分（10分）。二元评分：全部通过或全部不通过。',
        max_points: 10,
        reasoning: 'Fuzzing provides random inputs that can find edge cases, crashes, and security vulnerabilities that normal testing cannot detect. The OpenSSF Scorecard supports 17 fuzzer tools across multiple languages.',
        reasoning_zh: '模糊测试提供随机输入，可以发现常规测试无法检测的边界情况、崩溃和安全漏洞。OpenSSF Scorecard 支持跨多种语言的17种模糊测试工具。',
      },
    ],
  },
  {
    id: 'license', name: 'License', name_zh: '许可证',
    severity: CATEGORY_SEVERITY['license'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['license']],
    description: 'Check that the project has a recognized license',
    description_zh: '检查项目是否具有认可的许可证',
    scoring_items: [
      { name: 'License File', name_zh: '许可证文件', is_deduction: true, check_method: 'Search for LICENSE/COPYING files', check_method_zh: '搜索 LICENSE/COPYING 文件', max_points: 5 },
      { name: 'Recognized License', name_zh: '认可的许可证', is_deduction: true, check_method: 'Parse license content for known types', check_method_zh: '解析许可证内容中的已知类型', max_points: 3 },
      { name: 'License in Metadata', name_zh: '元数据中的许可证', is_deduction: true, check_method: 'Check package.json/Cargo.toml for license field', check_method_zh: '检查 package.json/Cargo.toml 的 license 字段', max_points: 2 },
    ],
  },
  {
    id: 'packaging', name: 'Packaging', name_zh: '打包',
    severity: CATEGORY_SEVERITY['packaging'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['packaging']],
    description: 'Check that the project uses automated packaging',
    description_zh: '检查项目是否使用自动化打包',
    scoring_items: [
      { name: 'Package Config', name_zh: '包配置', is_deduction: true, check_method: 'Search for package.json, Cargo.toml, pom.xml, etc.', check_method_zh: '搜索 package.json、Cargo.toml、pom.xml 等', max_points: 5 },
      { name: 'Release Workflow', name_zh: '发布工作流', is_deduction: true, check_method: 'Scan workflows for publish commands', check_method_zh: '扫描工作流中的发布命令', max_points: 5 },
    ],
  },
  {
    id: 'permissions', name: 'Token Permissions', name_zh: '令牌权限',
    severity: CATEGORY_SEVERITY['permissions'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['permissions']],
    description: 'Check workflows follow least privilege',
    description_zh: '检查工作流是否遵循最小权限',
    scoring_items: [
      { name: 'Explicit Permissions', name_zh: '显式权限声明', is_deduction: true, check_method: 'Scan workflows for permissions: block', check_method_zh: '扫描工作流中的 permissions: 块', max_points: 4 },
      { name: 'No Top-Level Write', name_zh: '无顶层写权限', is_deduction: true, check_method: 'Scan for write permissions at top level', check_method_zh: '扫描顶层写权限', max_points: 4, reasoning: 'Top-level write means all jobs have write access, violating least privilege', reasoning_zh: '顶层写权限意味着所有工作都有写权限，违反最小权限' },
      { name: 'Read-All Baseline', name_zh: 'Read-All 基线', is_deduction: true, check_method: 'Scan for permissions: read-all', check_method_zh: '扫描 permissions: read-all', max_points: 2 },
    ],
  },
  {
    id: 'pinned-dependencies', name: 'Pinned Dependencies', name_zh: '依赖锁定',
    severity: CATEGORY_SEVERITY['pinned-dependencies'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['pinned-dependencies']],
    description: 'Check that dependencies are pinned',
    description_zh: '检查依赖是否固定',
    scoring_items: [
      { name: 'Actions Pinned to SHA', name_zh: 'Actions 固定到 SHA', is_deduction: true, check_method: 'Parse uses: lines, verify 40-char SHA', check_method_zh: '解析 uses: 行，验证40字符 SHA', pass_condition: 'Score = (pinned / total) × max_points', pass_condition_zh: '得分 = (已固定 / 总数) × 满分', max_points: 4 },
      { name: 'Docker Images Pinned', name_zh: 'Docker 镜像固定', is_deduction: true, check_method: 'Parse FROM lines in Dockerfiles', check_method_zh: '解析 Dockerfile 中的 FROM 行', max_points: 3 },
      { name: 'Lock Files', name_zh: '锁定文件', is_deduction: true, check_method: 'Search for lock files', check_method_zh: '搜索锁定文件', max_points: 3 },
    ],
  },
  {
    id: 'sast', name: 'SAST', name_zh: '静态分析',
    severity: CATEGORY_SEVERITY['sast'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['sast']],
    description: 'Check project uses SAST tools',
    description_zh: '检查项目是否使用 SAST 工具',
    scoring_items: [
      { name: 'SAST Tool Configured', name_zh: 'SAST 工具配置', is_deduction: true, check_method: 'Search for CodeQL, SonarQube, Semgrep, etc.', check_method_zh: '搜索 CodeQL、SonarQube、Semgrep 等', max_points: 5 },
      { name: 'SAST in CI', name_zh: 'CI 中的 SAST', is_deduction: true, check_method: 'Scan workflows for SAST tool references', check_method_zh: '扫描工作流中的 SAST 工具引用', max_points: 5 },
    ],
  },
  {
    id: 'security-policy', name: 'Security Policy', name_zh: '安全策略',
    severity: CATEGORY_SEVERITY['security-policy'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['security-policy']],
    description: 'Check project has security policy',
    description_zh: '检查项目是否有安全策略',
    scoring_items: [
      { name: 'SECURITY.md Present', name_zh: 'SECURITY.md 存在', is_deduction: true, check_method: 'Search for SECURITY.md in platform paths', check_method_zh: '在平台路径中搜索 SECURITY.md', max_points: 4, reference_format: `# Security Policy\n## Reporting a Vulnerability\nPlease report to security@example.com\nWe respond within 48 hours.\n## Supported Versions\n| Version | Supported |\n|---------|----------|\n| 1.x     | Yes      |`, reference_format_zh: `# 安全策略\n## 报告漏洞\n请发送至 security@example.com\n我们将在48小时内响应。\n## 支持的版本\n| 版本 | 是否支持 |\n|------|----------|\n| 1.x  | 是       |` },
      { name: 'Contact Links', name_zh: '联系链接', is_deduction: true, check_method: 'Regex match URLs and emails', check_method_zh: '正则匹配 URL 和邮箱', max_points: 2 },
      { name: 'Disclosure Process', name_zh: '披露流程', is_deduction: true, check_method: 'Search for disclos/vuln/report keywords', check_method_zh: '搜索 disclos/vuln/report 关键字', max_points: 2 },
      { name: 'Substantial Content', name_zh: '实质内容', is_deduction: true, check_method: 'Verify content length > 200 chars', check_method_zh: '验证内容长度 > 200 字符', max_points: 2 },
    ],
  },
  {
    id: 'signed-releases', name: 'Signed Releases', name_zh: '签名发布',
    severity: CATEGORY_SEVERITY['signed-releases'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['signed-releases']],
    description: 'Check releases are signed',
    description_zh: '检查发布是否签名',
    scoring_items: [
      { name: 'Release Signatures', name_zh: '发布签名', is_deduction: true, check_method: 'Check release assets for .sig/.asc/.gpg/.sigstore files', check_method_zh: '检查发布资产中的签名文件', max_points: 5, api_sources: [{ platform: 'AtomGit', endpoint: 'GET /api/v5/repos/{owner}/{repo}/releases', description: 'Release list with assets', description_zh: 'Release列表含资产' }] },
      { name: 'Provenance Attestation', name_zh: '来源证明', is_deduction: true, check_method: 'Search for provenance/attestation files', check_method_zh: '搜索来源证明文件', max_points: 5 },
    ],
  },
  {
    id: 'vulnerabilities', name: 'Vulnerabilities', name_zh: '漏洞',
    severity: CATEGORY_SEVERITY['vulnerabilities'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['vulnerabilities']],
    description: 'Check for vulnerability management',
    description_zh: '检查漏洞管理',
    scoring_items: [
      { name: 'Security Advisory', name_zh: '安全公告', is_deduction: true, check_method: 'Check for SECURITY.md or advisory config', check_method_zh: '检查 SECURITY.md 或公告配置', max_points: 4 },
      { name: 'Vulnerability Monitoring', name_zh: '漏洞监控', is_deduction: true, check_method: 'Check for Dependabot, audit files', check_method_zh: '检查 Dependabot、审计文件', max_points: 3 },
      { name: 'Response Process', name_zh: '响应流程', is_deduction: true, check_method: 'Check SECURITY.md for response procedures', check_method_zh: '检查 SECURITY.md 的响应程序', max_points: 3 },
    ],
  },
  {
    id: 'binary-artifacts', name: 'Binary Artifacts', name_zh: '二进制制品',
    severity: CATEGORY_SEVERITY['binary-artifacts'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['binary-artifacts']],
    description: 'Check source has no binary artifacts',
    description_zh: '检查源代码无二进制制品',
    scoring_items: [
      { name: 'No Binary Artifacts', name_zh: '无二进制制品', is_deduction: true, check_method: 'Scan files for binary extensions, excluding .git/, node_modules/', check_method_zh: '扫描文件的二进制扩展名，排除 .git/、node_modules/', max_points: 10, reasoning: 'Binary files are not human-readable, may hide malicious code', reasoning_zh: '二进制文件不可读，可能隐藏恶意代码' },
    ],
  },
  {
    id: 'contributors', name: 'Contributors', name_zh: '贡献者',
    severity: CATEGORY_SEVERITY['contributors'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['contributors']],
    description: 'Check project has diverse contributors',
    description_zh: '检查项目是否有多样化贡献者',
    scoring_items: [
      { name: 'Contributing Guidelines', name_zh: '贡献指南', is_deduction: true, check_method: 'Search for CONTRIBUTING.md', check_method_zh: '搜索 CONTRIBUTING.md', max_points: 4 },
      { name: 'Code Owners', name_zh: '代码所有者', is_deduction: true, check_method: 'Search for CODEOWNERS', check_method_zh: '搜索 CODEOWNERS', max_points: 3 },
      { name: 'Maintainers List', name_zh: '维护者列表', is_deduction: true, check_method: 'Search for MAINTAINERS', check_method_zh: '搜索 MAINTAINERS', max_points: 3 },
    ],
  },
  {
    id: 'sbom', name: 'SBOM', name_zh: 'SBOM',
    severity: CATEGORY_SEVERITY['sbom'], weight: SEVERITY_WEIGHTS[CATEGORY_SEVERITY['sbom']],
    description: 'Check project provides SBOM',
    description_zh: '检查项目是否提供 SBOM',
    scoring_items: [
      { name: 'SBOM File', name_zh: 'SBOM 文件', is_deduction: true, check_method: 'Search for sbom/bom/spdx/cyclonedx files', check_method_zh: '搜索 sbom/bom/spdx/cyclonedx 文件', max_points: 5 },
      { name: 'SBOM Generation', name_zh: 'SBOM 生成', is_deduction: true, check_method: 'Scan workflows for sbom/syft/cyclonedx', check_method_zh: '扫描工作流中的 sbom/syft/cyclonedx', max_points: 5 },
    ],
  },
];

rulesRouter.get('/', (_req: Request, res: Response) => {
  res.json(allRules);
});

rulesRouter.get('/severity-weights', (_req: Request, res: Response) => {
  res.json({
    formula: { en: 'Total = ∑(item_score × weight) / ∑(weights)', zh: '总分 = ∑(单项得分 × 权重) / ∑(权重和)' },
    weights: {
      critical: { weight: 10, categories: allRules.filter(r => r.severity === 'critical').map(r => ({ id: r.id, name: r.name, name_zh: r.name_zh })) },
      high: { weight: 7.5, categories: allRules.filter(r => r.severity === 'high').map(r => ({ id: r.id, name: r.name, name_zh: r.name_zh })) },
      medium: { weight: 5, categories: allRules.filter(r => r.severity === 'medium').map(r => ({ id: r.id, name: r.name, name_zh: r.name_zh })) },
      low: { weight: 2.5, categories: allRules.filter(r => r.severity === 'low').map(r => ({ id: r.id, name: r.name, name_zh: r.name_zh })) },
    },
  });
});
