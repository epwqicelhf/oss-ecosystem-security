import type { Platform } from '../types';

type PathMap = Record<Platform, string[]> & { common?: string[] };

export const PR_TEMPLATE_PATHS: PathMap = {
  github: [
    '.github/pull_request_template.md',
    '.github/pull_request_template.txt',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/PULL_REQUEST_TEMPLATE/',
  ],
  gitlab: [
    '.gitlab/merge_request_templates/',
    'merge_request_templates/',
  ],
  atomgit: [
    '.atomgit/pull_request_template.md',
    '.atomgit/merge_request_template.md',
  ],
  gitcode: [
    '.gitcode/pull_request_template.md',
    '.gitcode/merge_request_template.md',
  ],
  common: [
    'pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    'merge_request_template.md',
    'docs/pull_request_template.md',
  ],
};

export const CODEOWNERS_PATHS: PathMap = {
  github: ['.github/CODEOWNERS'],
  gitlab: ['.gitlab/CODEOWNERS'],
  atomgit: ['.atomgit/CODEOWNERS'],
  gitcode: ['.gitcode/CODEOWNERS'],
  common: ['CODEOWNERS', 'docs/CODEOWNERS'],
};

export const CONTRIBUTING_PATHS: PathMap = {
  github: ['.github/CONTRIBUTING.md'],
  gitlab: ['.gitlab/CONTRIBUTING.md'],
  atomgit: ['.atomgit/CONTRIBUTING.md'],
  gitcode: ['.gitcode/CONTRIBUTING.md'],
  common: ['CONTRIBUTING.md', 'docs/CONTRIBUTING.md'],
};

export const SECURITY_POLICY_PATHS: PathMap = {
  github: ['.github/SECURITY.md'],
  gitlab: ['.gitlab/SECURITY.md'],
  atomgit: ['.atomgit/SECURITY.md'],
  gitcode: ['.gitcode/SECURITY.md'],
  common: ['SECURITY.md', 'docs/SECURITY.md', 'security.md'],
};

export const ISSUE_TEMPLATE_PATHS: PathMap = {
  github: ['.github/ISSUE_TEMPLATE/', '.github/ISSUE_TEMPLATE.md', '.github/issue_template.md', 'ISSUE_TEMPLATE.md'],
  gitlab: ['.gitlab/issue_templates/'],
  atomgit: ['.atomgit/ISSUE_TEMPLATE/', '.atomgit/issue_template.md', 'ISSUE_TEMPLATE.md'],
  gitcode: ['.gitcode/ISSUE_TEMPLATE/', '.gitcode/issue_template.md', 'ISSUE_TEMPLATE.md'],
  common: [],
};

export const MAINTAINERS_PATHS: PathMap = {
  github: ['.github/MAINTAINERS.md'],
  gitlab: ['.gitlab/MAINTAINERS.md'],
  atomgit: ['.atomgit/MAINTAINERS.md'],
  gitcode: ['.gitcode/MAINTAINERS.md'],
  common: ['MAINTAINERS.md', 'MAINTAINERS', 'docs/MAINTAINERS.md', 'OWNERS', 'OWNERS.md'],
};

export const WORKFLOW_PATHS: PathMap = {
  github: ['.github/workflows/'],
  gitlab: ['.gitlab-ci.yml', '.gitlab/ci/'],
  atomgit: ['.atomgit/ci/', '.atomgit/workflows/', '.gitee/ci/'],
  gitcode: ['.gitcode/ci/', '.gitcode/workflows/'],
  common: ['.travis.yml', 'Jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'buildspec.yml'],
};

export const DEPENDABOT_PATHS = [
  '.github/dependabot.yml',
  '.github/dependabot.yaml',
  '.github/dependabot.json',
];

export const RENOVATE_PATHS = [
  '.renovaterc',
  '.renovaterc.json',
  'renovate.json',
  'renovate.json5',
  '.github/renovate.json',
  '.gitlab/renovate.json',
];

export const LOCK_FILES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'go.sum', 'Cargo.lock', 'Pipfile.lock', 'poetry.lock',
  'Gemfile.lock', 'gradle.lockfile',
];

export const PACKAGE_CONFIG_FILES = [
  'package.json', 'setup.py', 'setup.cfg', 'pyproject.toml',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Gemfile', '.gemspec', 'Dockerfile', 'docker-compose.yml',
  '*.csproj', '*.nuspec',
];

export const LICENSE_FILES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt',
  'NOTICE',
];

export const SBOM_PATTERNS = ['sbom', 'bom', 'spdx', 'cyclonedx', 'cdx'];

export const BINARY_EXTENSIONS = [
  '.exe', '.dll', '.so', '.dylib', '.a', '.o', '.obj',
  '.pyc', '.class', '.jar', '.war', '.ear',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
];

export const BINARY_SKIP_DIRS = ['.git/', 'node_modules/', 'vendor/', 'venv/', '__pycache__/'];
export const BINARY_SKIP_FILES = ['gradle-wrapper.jar'];

export const SAST_TOOLS = [
  { pattern: 'codeql', name: 'CodeQL' },
  { pattern: 'sonarqube', name: 'SonarQube' },
  { pattern: 'sonarcloud', name: 'SonarCloud' },
  { pattern: 'snyk', name: 'Snyk' },
  { pattern: 'semgrep', name: 'Semgrep' },
  { pattern: 'trivy', name: 'Trivy' },
  { pattern: 'bandit', name: 'Bandit' },
  { pattern: 'eslint-plugin-security', name: 'ESLint Security' },
  { pattern: 'brakeman', name: 'Brakeman' },
  { pattern: 'gosec', name: 'GoSec' },
  { pattern: 'coverity', name: 'Coverity' },
];

export const FUZZ_INDICATORS = [
  'oss-fuzz', 'clusterfuzz', 'clusterfuzzlite',
  'go-fuzz', 'afl', 'libfuzzer', 'honggfuzz', 'jazzer',
  'fuzz_test', 'fuzz.test', 'FuzzTest', 'fuzzing', 'fuzz_target',
];

export const FUZZ_FILE_PATHS = [
  '.clusterfuzzlite/Dockerfile',
  '.clusterfuzzlite/dockerfile',
  '.oss-fuzz/',
  'fuzz/',
  'fuzzers/',
  'fuzz_targets/',
  'fuzz-test/',
];

export interface FuzzLangSpec {
  language: string;
  language_zh: string;
  extensions: string[];
  patterns: RegExp[];
  fuzzer: string;
}

export const FUZZ_LANG_SPECS: FuzzLangSpec[] = [
  {
    language: 'Go', language_zh: 'Go',
    extensions: ['.go'],
    patterns: [/func\s+Fuzz\w+\s*\(\w+\s+\*testing\.F\)/],
    fuzzer: 'GoBuiltInFuzzer',
  },
  {
    language: 'Python', language_zh: 'Python',
    extensions: ['.py'],
    patterns: [/import\s+atheris/],
    fuzzer: 'PythonAtherisFuzzer',
  },
  {
    language: 'C', language_zh: 'C',
    extensions: ['.c'],
    patterns: [/LLVMFuzzerTestOneInput/],
    fuzzer: 'CLibFuzzer',
  },
  {
    language: 'C++', language_zh: 'C++',
    extensions: ['.cc', '.cpp', '.cxx'],
    patterns: [/LLVMFuzzerTestOneInput/],
    fuzzer: 'CppLibFuzzer',
  },
  {
    language: 'Swift', language_zh: 'Swift',
    extensions: ['.swift'],
    patterns: [/LLVMFuzzerTestOneInput/],
    fuzzer: 'SwiftLibFuzzer',
  },
  {
    language: 'Rust', language_zh: 'Rust',
    extensions: ['.rs'],
    patterns: [/libfuzzer_sys/],
    fuzzer: 'RustCargoFuzzer',
  },
  {
    language: 'Java', language_zh: 'Java',
    extensions: ['.java'],
    patterns: [/com\.code_intelligence\.jazzer\.api\.FuzzedDataProvider/],
    fuzzer: 'JavaJazzerFuzzer',
  },
  {
    language: 'JavaScript', language_zh: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs'],
    patterns: [/from\s+['"](fast-check|@fast-check\/)/, /require\s*\(\s*['"](fast-check|@fast-check\/)/, /jsfuzz/],
    fuzzer: 'JavaScriptPropertyBasedTesting',
  },
  {
    language: 'TypeScript', language_zh: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    patterns: [/from\s+['"](fast-check|@fast-check\/)/, /require\s*\(\s*['"](fast-check|@fast-check\/)/, /jsfuzz/],
    fuzzer: 'TypeScriptPropertyBasedTesting',
  },
  {
    language: 'C#', language_zh: 'C#',
    extensions: ['.cs'],
    patterns: [/using\s+(FsCheck|FsCheck\.(NUnit|Xunit)|Expecto\.ExpectoFsCheck)/],
    fuzzer: 'CSharpPropertyBasedTesting',
  },
  {
    language: 'Erlang', language_zh: 'Erlang',
    extensions: ['.erl', '.hrl'],
    patterns: [/-include_lib\s*\(\s*"(eqc|proper)\/include\//],
    fuzzer: 'ErlangPropertyBasedTesting',
  },
  {
    language: 'Haskell', language_zh: 'Haskell',
    extensions: ['.hs', '.lhs'],
    patterns: [/import\s+(qualified\s+)?Test\.((Hspec|Tasty)\.)?(QuickCheck|Hedgehog|Validity|SmallCheck)/],
    fuzzer: 'HaskellPropertyBasedTesting',
  },
];

export const SCRIPT_INJECTION_PATTERNS = [
  /\$\{\{\s*github\.event\.issue\.title\s*\}\}/,
  /\$\{\{\s*github\.event\.issue\.body\s*\}\}/,
  /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/,
  /\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/,
  /\$\{\{\s*github\.event\.comment\.body\s*\}\}/,
  /\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/,
  /\$\{\{\s*github\.event\.pages\[\*\]\.page_name\s*\}\}/,
];

export const PUBLISH_COMMANDS = [
  'npm publish', 'npx semantic-release',
  'twine upload', 'pip publish', 'flit publish',
  'cargo publish', 'docker push', 'docker buildx',
  'mvn deploy', 'gem push', 'dotnet nuget push',
  'gh release create', 'goreleaser',
  'upload_pypi', 'pypi-publish',
];

export const SIGNATURE_EXTENSIONS = [
  '.sig', '.asc', '.gpg', '.pem', '.minisig', '.sign', '.sigstore', '.cosign.bundle',
];

export const KNOWN_LICENSES: { id: string; patterns: string[] }[] = [
  { id: 'MIT', patterns: ['mit license', 'permission is hereby granted, free of charge'] },
  { id: 'Apache-2.0', patterns: ['apache license', 'version 2.0'] },
  { id: 'BSD-2-Clause', patterns: ['bsd 2-clause', 'redistribution and use'] },
  { id: 'BSD-3-Clause', patterns: ['bsd 3-clause'] },
  { id: 'ISC', patterns: ['isc license'] },
  { id: 'GPL-2.0', patterns: ['gnu general public license', 'version 2'] },
  { id: 'GPL-3.0', patterns: ['gnu general public license', 'version 3'] },
  { id: 'LGPL', patterns: ['gnu lesser general public license'] },
  { id: 'MPL-2.0', patterns: ['mozilla public license'] },
  { id: 'Unlicense', patterns: ['this is free and unencumbered software'] },
  { id: '0BSD', patterns: ['zero-clause bsd'] },
];

export const CI_TEST_KEYWORDS = ['test', 'lint', 'check', 'build', 'ci', 'verify'];

export function getAllPaths(pathMap: PathMap, platform: Platform): string[] {
  const platformPaths = pathMap[platform] || [];
  const commonPaths = pathMap.common || [];
  return [...platformPaths, ...commonPaths];
}

export function getGroupedPaths(pathMap: PathMap, platform: Platform): { group: string; group_zh: string; paths: string[] }[] {
  const platformPaths = pathMap[platform] || [];
  const commonPaths = pathMap.common || [];
  const result: { group: string; group_zh: string; paths: string[] }[] = [];
  if (platformPaths.length > 0) {
    result.push({ group: platform, group_zh: `${platform} 平台专属`, paths: platformPaths });
  }
  if (commonPaths.length > 0) {
    result.push({ group: 'common', group_zh: '通用路径', paths: commonPaths });
  }
  return result;
}

export function getWorkflowFiles(files: string[], platform: Platform): string[] {
  const wfPaths = getAllPaths(WORKFLOW_PATHS, platform);
  return files.filter(f => {
    const lower = f.toLowerCase();
    return wfPaths.some(p => {
      if (p.endsWith('/')) return lower.startsWith(p.toLowerCase());
      return lower === p.toLowerCase();
    });
  });
}
