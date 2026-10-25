// Shared GitHub REST API helper for Gist (text) and repository (screenshot) sync.
// Tokens are only ever sent to api.github.com, never logged, and never put in error messages.

const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(message, status = 0, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter; // seconds GitHub asked us to wait, if any
  }
}

const PERM_HELP = {
  gists: 'The token is not allowed to use Gists. When you make it, set Account permissions → Gists → Read and write.',
  contents: 'The token is not allowed to change that repository. Give it access to the repository and set Repository permissions → Contents → Read and write.',
};

function describe(res, detail, perm) {
  const code = res.status;
  if (code === 401) return 'GitHub rejected the token. It may have expired or been deleted. Make a new one and paste it in Settings → Sync.';
  if (code === 403 || code === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)) return 'GitHub says too many requests. Waiting a few minutes, then trying again.';
    return PERM_HELP[perm] || PERM_HELP.gists;
  }
  if (code === 404) return 'Not found on GitHub.';
  if (code === 409) return 'GitHub was busy with another change. Trying again shortly.';
  if (code === 422) return `GitHub refused the update${detail ? ` (${detail})` : ''}.`;
  if (code >= 500) return 'GitHub is having problems right now. Your data is safe on this device. Try again later.';
  return `GitHub error ${code}${detail ? `: ${detail}` : ''}.`;
}

function retryAfterSeconds(res) {
  const ra = Number(res.headers.get('retry-after'));
  if (Number.isFinite(ra) && ra > 0) return ra;
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset)) return Math.max(1, reset - Math.floor(Date.now() / 1000));
  return 0;
}

// as: 'json' (default) or 'blob' (raw file contents). perm: which permission an error message should mention.
export async function ghRequest(token, path, { method = 'GET', body, as = 'json', perm = 'gists' } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: as === 'blob' ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError("Couldn't reach GitHub. Check your internet connection.");
  }
  if (res.ok) {
    if (as === 'blob') return res.blob();
    return res.status === 204 ? null : res.json();
  }
  let detail = '';
  try {
    const j = await res.json();
    if (j && typeof j.message === 'string') detail = j.message.slice(0, 160);
  } catch { /* no JSON body */ }
  throw new SyncError(describe(res, detail, perm), res.status, retryAfterSeconds(res));
}
