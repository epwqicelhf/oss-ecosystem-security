export type Platform = 'atomgit' | 'github' | 'gitlab' | 'gitcode';

export interface PlatformConfig {
  id: Platform;
  name: string;
  name_zh: string;
  apiBase: string;
}

export const PLATFORMS: PlatformConfig[] = [
  { id: 'atomgit', name: 'AtomGit', name_zh: 'AtomGit', apiBase: 'https://api.atomgit.com/api/v5' },
  { id: 'github', name: 'GitHub', name_zh: 'GitHub', apiBase: 'https://api.github.com' },
  { id: 'gitlab', name: 'GitLab', name_zh: 'GitLab', apiBase: '' },
  { id: 'gitcode', name: 'GitCode', name_zh: 'GitCode', apiBase: 'https://api.gitcode.com/api/v5' },
];

export function detectPlatform(url: string): Platform {
  const lower = url.toLowerCase();
  if (lower.includes('atomgit.com')) return 'atomgit';
  if (lower.includes('github.com')) return 'github';
  if (lower.includes('gitlab.com') || lower.includes('gitlab')) return 'gitlab';
  if (lower.includes('gitcode.com') || lower.includes('gitcode')) return 'gitcode';
  return 'atomgit';
}

export function parseRepoUrl(url: string): { owner: string; repo: string; platform: Platform } {
  const platform = detectPlatform(url);
  const cleaned = url.replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  const repo = parts[parts.length - 1] || '';
  const owner = parts[parts.length - 2] || '';
  return { owner, repo, platform };
}

export interface RepoConfig {
  id: string;
  name: string;
  url: string;
  owner: string;
  repo: string;
  branch: string;
  localPath: string;
  addedAt: string;
  lastChecked?: string;
  platform: Platform;
  apiToken?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 7.5,
  medium: 5,
  low: 2.5
};

export interface ApiInfo {
  platform: string;
  endpoint: string;
  description: string;
  description_zh: string;
}

export interface ScoringRule {
  id: string;
  name: string;
  name_zh: string;
  description: string;
  description_zh: string;
  check_method: string;
  check_method_zh: string;
  pass_condition: string;
  pass_condition_zh: string;
  reference_format?: string;
  reference_format_zh?: string;
  api_sources?: ApiInfo[];
  detection_fields?: { field: string; description: string; description_zh: string }[];
  reasoning?: string;
  reasoning_zh?: string;
  max_points: number;
  deduction: number;
  deduction_reason: string;
  deduction_reason_zh: string;
  passed: boolean;
  points_earned: number;
  points_deducted: number;
}

export interface CheckProbe {
  id: string;
  name: string;
  name_zh: string;
  description: string;
  description_zh: string;
  category: CheckCategory;
  severity: Severity;
  weight: number;
  maxScore: number;
  score: number;
  outcome: 'pass' | 'fail' | 'warning' | 'not_applicable';
  findings: ProbeFinding[];
  scoring_rules: ScoringRule[];
  reference_items?: ReferenceItem[];
  remediation?: Remediation;
}

export interface ReferenceItem {
  name: string;
  name_zh: string;
  found: boolean;
  reference_format?: string;
  reference_format_zh?: string;
  paths_checked: string[];
  paths_grouped?: { group: string; group_zh: string; paths: string[] }[];
}

export interface ProbeFinding {
  path: string;
  line?: number;
  snippet?: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  message: string;
}

export interface Remediation {
  description: string;
  description_zh: string;
  steps: string[];
  steps_zh: string[];
  expectedScoreImprovement: number;
  effort: 'low' | 'medium' | 'high';
  references: string[];
}

export type CheckCategory =
  | 'maintained'
  | 'code-review'
  | 'branch-protection'
  | 'ci-tests'
  | 'dangerous-workflow'
  | 'dependency-update'
  | 'fuzzing'
  | 'license'
  | 'packaging'
  | 'permissions'
  | 'pinned-dependencies'
  | 'sast'
  | 'security-policy'
  | 'signed-releases'
  | 'vulnerabilities'
  | 'binary-artifacts'
  | 'contributors'
  | 'sbom';

export const CATEGORY_SEVERITY: Record<CheckCategory, Severity> = {
  'maintained': 'high',
  'code-review': 'critical',
  'branch-protection': 'critical',
  'ci-tests': 'high',
  'dangerous-workflow': 'critical',
  'dependency-update': 'medium',
  'fuzzing': 'low',
  'license': 'medium',
  'packaging': 'medium',
  'permissions': 'critical',
  'pinned-dependencies': 'high',
  'sast': 'high',
  'security-policy': 'high',
  'signed-releases': 'high',
  'vulnerabilities': 'critical',
  'binary-artifacts': 'medium',
  'contributors': 'low',
  'sbom': 'low'
};

export interface CheckResult {
  repoId: string;
  repoName: string;
  platform: Platform;
  checkedAt: string;
  totalWeightedScore: number;
  totalWeightSum: number;
  normalizedScore: number;
  probes: CheckProbe[];
  summary: CheckSummary;
  scoreFormula: string;
  scoreFormula_zh: string;
}

export interface CheckSummary {
  pass: number;
  fail: number;
  warning: number;
  notApplicable: number;
  criticalRisk: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

export interface AppState {
  repos: RepoConfig[];
  checkResults: Record<string, CheckResult[]>;
  config: AppConfig;
}

export interface AppConfig {
  workspacePath: string;
  cloneDepth: number;
  commitDepth: number;
  enabledCategories: CheckCategory[];
  theme: string;
  proxy?: {
    http?: string;
    https?: string;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  workspacePath: './repos',
  cloneDepth: 1,
  commitDepth: 30,
  enabledCategories: [
    'maintained', 'code-review', 'branch-protection', 'ci-tests',
    'dangerous-workflow', 'dependency-update', 'fuzzing', 'license',
    'packaging', 'permissions', 'pinned-dependencies', 'sast',
    'security-policy', 'signed-releases', 'vulnerabilities',
    'binary-artifacts', 'contributors', 'sbom'
  ],
  theme: 'tech-blue'
};
