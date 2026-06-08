export interface RepoConfig {
  id: string;
  name: string;
  url: string;
  branch: string;
  localPath: string;
  addedAt: string;
  lastChecked?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 7.5,
  medium: 5,
  low: 2.5
};

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
  remediation?: Remediation;
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
