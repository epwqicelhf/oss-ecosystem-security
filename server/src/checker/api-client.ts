import type { Platform } from '../types';

interface ProxyConfig {
  http?: string;
  https?: string;
}

export interface PRReview {
  number: number;
  title: string;
  state: string;
  hasApproval: boolean;
  approvalCount: number;
  author: string;
  mergedBy?: string;
  labels: string[];
  createdAt: string;
  mergedAt?: string;
  htmlUrl?: string;
  reviewers?: { login: string; accepted: boolean; isCodeOwner: boolean }[];
}

export interface BranchInfo {
  name: string;
  protected: boolean;
  defaultBranch: boolean;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function fetchJson(url: string, token?: string, proxy?: ProxyConfig): Promise<ApiResponse<any>> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const origHttpProxy = process.env.HTTP_PROXY;
    const origHttpsProxy = process.env.HTTPS_PROXY;
    const proxyUrl = proxy?.https || proxy?.http;
    if (proxyUrl) {
      process.env.HTTPS_PROXY = proxyUrl;
      process.env.HTTP_PROXY = proxyUrl;
    }

    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, data };
    } finally {
      if (proxyUrl) {
        if (origHttpProxy !== undefined) process.env.HTTP_PROXY = origHttpProxy;
        else delete process.env.HTTP_PROXY;
        if (origHttpsProxy !== undefined) process.env.HTTPS_PROXY = origHttpsProxy;
        else delete process.env.HTTPS_PROXY;
      }
    }
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function parseAtomGitPR(raw: any): PRReview {
  const labels = (raw.labels || []).map((l: any) => l.name || l.title || '');
  let approvalCount = 0;
  if (raw.mergeable_state?.approval_approvers_result !== undefined) {
    approvalCount = raw.mergeable_state.approval_approvers_result;
  } else if (raw.approval_approvers_result !== undefined) {
    approvalCount = raw.approval_approvers_result;
  } else {
    approvalCount = (raw.assignees || []).filter((a: any) => a.accept === true).length;
  }
  const reviewers = (raw.assignees || []).map((a: any) => ({
    login: a.login || '',
    accepted: a.accept === true,
    isCodeOwner: a.code_owner === true,
  }));
  return {
    number: raw.number || raw.iid,
    title: raw.title || '',
    state: raw.state || '',
    hasApproval: approvalCount >= 1,
    approvalCount,
    author: raw.user?.login || '',
    mergedBy: raw.merged_by?.login,
    labels,
    createdAt: raw.created_at || '',
    mergedAt: raw.merged_at || undefined,
    htmlUrl: raw.html_url || raw.web_url || '',
    reviewers,
  };
}

function parseGitHubPR(raw: any): PRReview {
  return {
    number: raw.number,
    title: raw.title || '',
    state: raw.state || '',
    hasApproval: false,
    approvalCount: 0,
    author: raw.user?.login || '',
    mergedBy: raw.merged_by?.login,
    labels: (raw.labels || []).map((l: any) => l.name || ''),
    createdAt: raw.created_at || '',
    mergedAt: raw.merged_at || undefined,
    htmlUrl: raw.html_url || '',
    reviewers: [],
  };
}

function parseGitLabPR(raw: any): PRReview {
  return {
    number: raw.iid,
    title: raw.title || '',
    state: raw.state || '',
    hasApproval: (raw.approved_by || []).length > 0,
    approvalCount: (raw.approved_by || []).length,
    author: raw.author?.username || '',
    mergedBy: raw.merged_by?.username,
    labels: raw.labels || [],
    createdAt: raw.created_at || '',
    mergedAt: raw.merged_at || undefined,
    htmlUrl: raw.web_url || '',
    reviewers: (raw.approved_by || []).map((a: any) => ({
      login: a.user?.username || '',
      accepted: true,
      isCodeOwner: false,
    })),
  };
}

export async function fetchPRs(
  platform: Platform, owner: string, repo: string,
  token?: string, count: number = 30, proxy?: ProxyConfig,
): Promise<ApiResponse<PRReview[]>> {
  let prs: PRReview[] = [];

  const buildRequests = (): { url: string; parser: (raw: any) => PRReview }[] => {
    switch (platform) {
      case 'atomgit':
      case 'gitcode':
        return [
          { url: `https://api.${platform}.com/api/v5/repos/${owner}/${repo}/pulls?state=merged&per_page=${count}`, parser: parseAtomGitPR },
        ];
      case 'github':
        return [
          { url: `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=${count}&sort=updated&direction=desc`, parser: parseGitHubPR },
        ];
      case 'gitlab':
        return [
          { url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/merge_requests?state=merged&per_page=${count}&order_by=updated_at`, parser: parseGitLabPR },
        ];
      default:
        return [];
    }
  };

  const requests = buildRequests();
  if (requests.length === 0) return { ok: false, error: 'Unknown platform' };

  for (const req of requests) {
    const res = await fetchJson(req.url, token, proxy);
    if (res.ok && Array.isArray(res.data)) {
      prs.push(...res.data.map(req.parser));
    }
  }

  const seen = new Set<number>();
  prs = prs.filter(pr => {
    if (seen.has(pr.number)) return false;
    seen.add(pr.number);
    return true;
  });

  if (platform === 'github') {
    prs = prs.filter(pr => pr.mergedAt);
  }

  prs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  prs = prs.slice(0, count);

  if (platform === 'github') {
    for (const pr of prs) {
      const reviewUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews`;
      const reviewRes = await fetchJson(reviewUrl, token, proxy);
      if (reviewRes.ok && Array.isArray(reviewRes.data)) {
        const approvals = reviewRes.data.filter((r: any) => r.state === 'APPROVED' && r.user?.login !== pr.author);
        pr.approvalCount = approvals.length;
        pr.hasApproval = approvals.length >= 1;
        pr.reviewers = approvals.map((r: any) => ({
          login: r.user?.login || '',
          accepted: true,
          isCodeOwner: false,
        }));
      }
    }
  }

  return { ok: true, data: prs };
}

export async function fetchBranches(
  platform: Platform, owner: string, repo: string,
  token?: string, proxy?: ProxyConfig,
): Promise<ApiResponse<BranchInfo[]>> {
  let url: string;

  switch (platform) {
    case 'atomgit':
    case 'gitcode':
      url = `https://api.${platform}.com/api/v5/repos/${owner}/${repo}/branches`;
      break;
    case 'github':
      url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
      break;
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/repository/branches?per_page=100`;
      break;
    default:
      return { ok: false, error: 'Unknown platform' };
  }

  const res = await fetchJson(url, token, proxy);
  if (!res.ok) return res;

  const branches: BranchInfo[] = (Array.isArray(res.data) ? res.data : []).map((raw: any) => ({
    name: raw.name || '',
    protected: raw.protected === true,
    defaultBranch: raw.default_branch === true || raw.default === true,
  }));

  return { ok: true, data: branches };
}

export async function fetchReleases(
  platform: Platform, owner: string, repo: string,
  token?: string, count: number = 5, proxy?: ProxyConfig,
): Promise<ApiResponse<any[]>> {
  let url: string;
  switch (platform) {
    case 'atomgit': case 'gitcode':
      url = `https://api.${platform}.com/api/v5/repos/${owner}/${repo}/releases?per_page=${count}`;
      break;
    case 'github':
      url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${count}`;
      break;
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/releases?per_page=${count}`;
      break;
    default:
      return { ok: false, error: 'Unknown platform' };
  }
  const res = await fetchJson(url, token, proxy);
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data) ? res.data : [] };
}

export async function fetchCommits(
  platform: Platform, owner: string, repo: string,
  token?: string, count: number = 30, proxy?: ProxyConfig,
): Promise<ApiResponse<{ date: string; author: string }[]>> {
  let url: string;
  switch (platform) {
    case 'atomgit': case 'gitcode':
      url = `https://api.${platform}.com/api/v5/repos/${owner}/${repo}/commits?per_page=${count}`;
      break;
    case 'github':
      url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${count}`;
      break;
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/repository/commits?per_page=${count}`;
      break;
    default:
      return { ok: false, error: 'Unknown platform' };
  }
  const res = await fetchJson(url, token, proxy);
  if (!res.ok) return res;
  const commits = (Array.isArray(res.data) ? res.data : []).map((raw: any) => ({
    date: raw.created_at || raw.commit?.committer?.date || raw.commit?.author?.date || '',
    author: raw.author?.login || raw.author?.username || raw.commit?.author?.name || '',
  }));
  return { ok: true, data: commits };
}

export async function fetchIssues(
  platform: Platform, owner: string, repo: string,
  token?: string, count: number = 10, proxy?: ProxyConfig,
): Promise<ApiResponse<{ updatedAt: string; comments: number }[]>> {
  let url: string;
  switch (platform) {
    case 'atomgit': case 'gitcode':
      url = `https://api.${platform}.com/api/v5/repos/${owner}/${repo}/issues?state=all&per_page=${count}&sort=updated`;
      break;
    case 'github':
      url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=${count}&sort=updated`;
      break;
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/issues?state=all&per_page=${count}&order_by=updated_at`;
      break;
    default:
      return { ok: false, error: 'Unknown platform' };
  }
  const res = await fetchJson(url, token, proxy);
  if (!res.ok) return res;
  const issues = (Array.isArray(res.data) ? res.data : []).map((raw: any) => ({
    updatedAt: raw.updated_at || '',
    comments: raw.comments || raw.user_notes_count || 0,
  }));
  return { ok: true, data: issues };
}
