import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GITHUB_REPO = 'kochetkov-ma/claude-brewcode';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

const STARS_TIMEOUT_MS = 5000;

async function fetchStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { 'User-Agent': 'brewcode-docs' },
      signal: AbortSignal.timeout(STARS_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`GitHub API returned ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data.stargazers_count > 0 ? data.stargazers_count : null;
  } catch (error) {
    console.warn(`Failed to fetch GitHub stars: ${error}`);
    return null;
  }
}

// One in-flight promise per build: a hanging endpoint costs the cap once, not once per page.
let starsPromise: Promise<number | null> | undefined;

export function getGitHubStars(): Promise<number | null> {
  starsPromise ??= Promise.race([
    fetchStars(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), STARS_TIMEOUT_MS).unref()),
  ]);
  return starsPromise;
}

let cachedVersion: string | undefined;

export function getPluginVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;

  try {
    const pluginJson: { version?: string } = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../brewcode/.claude-plugin/plugin.json'), 'utf-8'),
    );
    if (pluginJson.version) {
      cachedVersion = pluginJson.version;
      return pluginJson.version;
    }
  } catch {
    // Docker builds cannot access the plugin directory outside the build context
  }

  const envVersion: string | undefined = import.meta.env.PUBLIC_VERSION;
  if (envVersion) {
    cachedVersion = envVersion;
    return envVersion;
  }

  console.warn('Plugin version unavailable: filesystem read failed and PUBLIC_VERSION env var is not set');
  cachedVersion = '0.0.0';
  return cachedVersion;
}
