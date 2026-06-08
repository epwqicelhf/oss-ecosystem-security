import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000
});

export interface RepoConfig {
  id: string;
  name: string;
  url: string;
  branch: string;
  localPath: string;
  addedAt: string;
  lastChecked?: string;
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
  description: string;
  weight: number;
}

export interface AppConfig {
  workspacePath: string;
  cloneDepth: number;
  commitDepth: number;
  enabledCategories: string[];
  theme: string;
}

export const reposApi = {
  list: () => api.get<RepoConfig[]>('/repos').then(r => r.data),
  add: (url: string, name?: string, branch?: string) =>
    api.post<RepoConfig>('/repos', { url, name, branch }).then(r => r.data),
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
  getCategories: () => api.get<CategoryInfo[]>('/config/categories').then(r => r.data)
};
