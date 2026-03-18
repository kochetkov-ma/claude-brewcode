import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const GITHUB_REPO = 'kochetkov-ma/claude-brewcode';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

let cachedStars: number | null | undefined;

export async function getGitHubStars(): Promise<number | null> {
  if (cachedStars !== undefined) {
    return cachedStars;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { 'User-Agent': 'brewcode-docs' },
    });
    if (!res.ok) {
      console.warn(`GitHub API returned ${res.status}: ${res.statusText}`);
      cachedStars = null;
      return null;
    }
    const data = await res.json();
    cachedStars = data.stargazers_count > 0 ? data.stargazers_count : null;
  } catch (error) {
    console.warn(`Failed to fetch GitHub stars: ${error}`);
    cachedStars = null;
  }

  return cachedStars ?? null;
}

let cachedVersion: string | undefined;

export function getPluginVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;

  try {
    const pluginJson = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../brewcode/.claude-plugin/plugin.json'), 'utf-8'),
    );
    cachedVersion = pluginJson.version;
    return cachedVersion;
  } catch {
    // Docker builds cannot access the plugin directory outside the build context
  }

  const envVersion = import.meta.env.PUBLIC_VERSION;
  if (envVersion) {
    cachedVersion = envVersion;
    return cachedVersion;
  }

  console.warn('Plugin version unavailable: filesystem read failed and PUBLIC_VERSION env var is not set');
  cachedVersion = '0.0.0';
  return cachedVersion;
}
