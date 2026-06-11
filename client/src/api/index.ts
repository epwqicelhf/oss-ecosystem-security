import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000
});

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
  platform: string;
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
  api_sources?: { platform: string; endpoint: string; description: string; description_zh: string }[];
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

export interface ReferenceItem {
  name: string;
  name_zh: string;
  found: boolean;
  paths_checked: string[];
  reference_format?: string;
  reference_format_zh?: string;
  paths_grouped?: { group: string; group_zh: string; paths: string[] }[];
}

export interface CheckProbe {
  id: string;
  name: string;
  name_zh: string;
  description: string;
  description_zh: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  weight: number;
  maxScore: number;
  score: number;
  outcome: 'pass' | 'fail' | 'warning' | 'not_applicable';
  findings: ProbeFinding[];
  scoring_rules: ScoringRule[];
  reference_items?: ReferenceItem[];
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
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  weight: number;
  maxScore: number;
  score: number;
  outcome: 'pass' | 'fail' | 'warning' | 'not_applicable';
  findings: ProbeFinding[];
  scoring_rules: ScoringRule[];
  remediation?: Remediation;
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

export interface CheckResult {
  repoId: string;
  repoName: string;
  platform: string;
  checkedAt: string;
  totalWeightedScore: number;
  totalWeightSum: number;
  normalizedScore: number;
  probes: CheckProbe[];
  summary: CheckSummary;
  scoreFormula: string;
  scoreFormula_zh: string;
}

export interface CategoryInfo {
  id: string;
  name: string;
  name_zh: string;
  description: string;
  description_zh: string;
  severity: string;
  weight: number;
}

export interface PlatformInfo {
  id: string;
  name: string;
  name_zh: string;
  apiBase: string;
}

export interface RuleScoringItem {
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
}

export interface RuleCategory {
  id: string;
  name: string;
  name_zh: string;
  severity: string;
  weight: number;
  description: string;
  description_zh: string;
  scoring_items: RuleScoringItem[];
}

export interface SeverityWeights {
  formula: { en: string; zh: string };
  weights: Record<string, { weight: number; categories: { id: string; name: string; name_zh: string }[] }>;
}

export interface AppConfig {
  workspacePath: string;
  cloneDepth: number;
  commitDepth: number;
  enabledCategories: string[];
  theme: string;
  proxy?: {
    http?: string;
    https?: string;
  };
}

export const reposApi = {
  list: () => api.get<RepoConfig[]>('/repos').then(r => r.data),
  add: (url: string, name?: string, branch?: string, platform?: string, apiToken?: string) =>
    api.post<RepoConfig>('/repos', { url, name, branch, platform, apiToken }).then(r => r.data),
  pull: (id: string) => api.post(`/repos/${id}/pull`).then(r => r.data),
  remove: (id: string) => api.delete(`/repos/${id}`).then(r => r.data),
  pullAll: () => api.post('/repos/pull-all').then(r => r.data)
};

export const checksApi = {
  run: (repoId: string) => api.post<CheckResult>(`/checks/run/${repoId}`).then(r => r.data),
  runAll: () => api.post<{ results: CheckResult[]; errors: { repo: string; error: string }[] }>('/checks/run-all').then(r => r.data),
  getResults: (repoId: string) => api.get<CheckResult[]>(`/checks/results/${repoId}`).then(r => r.data),
  getAllResults: () => api.get<Record<string, CheckResult[]>>('/checks/results').then(r => r.data)
};

export const configApi = {
  get: () => api.get<AppConfig>('/config').then(r => r.data),
  update: (config: Partial<AppConfig>) => api.put<AppConfig>('/config', config).then(r => r.data),
  getCategories: () => api.get<CategoryInfo[]>('/config/categories').then(r => r.data),
  getPlatforms: () => api.get<PlatformInfo[]>('/config/platforms').then(r => r.data)
};

export const rulesApi = {
  getAll: () => api.get<RuleCategory[]>('/rules').then(r => r.data),
  getSeverityWeights: () => api.get<SeverityWeights>('/rules/severity-weights').then(r => r.data)
};
