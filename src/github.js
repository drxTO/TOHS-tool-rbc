'use strict';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Commits a single file to a GitHub repo via the Contents API: reads the
 * current SHA (if the file exists) then PUTs the new content, so this
 * works whether the file is new or being updated. Same get-SHA-then-PUT
 * pattern as the legacy Apps Script's commitToGitHub().
 *
 * In GitHub Actions, pass the workflow's automatically-provided
 * `GITHUB_TOKEN` — no personal token needs to be stored or rotated for
 * this step.
 *
 * @param {object} opts
 * @param {string} opts.owner GitHub username/org, e.g. "drxTO"
 * @param {string} opts.repo repo name
 * @param {string} opts.token a token with contents:write on the repo
 * @param {string} opts.path repo-relative file path, e.g. "data/a.json"
 * @param {string} opts.content file content (raw text, will be base64-encoded)
 * @param {string} opts.message commit message
 * @returns {Promise<{updated: boolean, status: number}>}
 */
async function commitFile({ owner, repo, token, path, content, message }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  let sha;
  const getResponse = await fetch(url, { headers });
  if (getResponse.ok) {
    const existing = await getResponse.json();
    sha = existing.sha;
  }

  const payload = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) payload.sha = sha;

  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!putResponse.ok) {
    const body = await putResponse.text();
    console.warn(`Commit blocked on ${path} (HTTP ${putResponse.status}): ${body}`);
    return { updated: false, status: putResponse.status };
  }

  console.log(`Updated data partition: ${path}`);
  return { updated: true, status: putResponse.status };
}

module.exports = { commitFile };
