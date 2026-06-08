import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { RepoConfig, AppConfig, CheckResult, AppState, DEFAULT_CONFIG } from '../types';

const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadState(): AppState {
  ensureDataDir();
  if (!existsSync(STATE_FILE)) {
    return { repos: [], checkResults: {}, config: getDefaultConfig() };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { repos: [], checkResults: {}, config: getDefaultConfig() };
  }
}

function saveState(state: AppState): void {
  ensureDataDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getDefaultConfig(): AppConfig {
  return {
    workspacePath: join(process.cwd(), 'repos'),
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
}

export { loadState, saveState, DATA_DIR, STATE_FILE };
