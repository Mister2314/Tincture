/**
 * The community gallery.
 *
 * Reads themes straight from the public repository over the GitHub API — no backend, no
 * server to run, and every submission is a reviewable commit.
 *
 * Three rules this view follows, all of them consequences of the same idea:
 *
 * 1. **Every downloaded theme is validated before it is shown.** A merged theme is trusted
 *    by the repository's CI, not by this app. The app re-runs the full validator, because
 *    the app is what paints it.
 * 2. **Nothing is applied automatically.** Downloading a theme adds it to the list; applying
 *    it is a separate, explicit click.
 * 3. **The cache is also validated.** It is `localStorage`, so it is untrusted input like
 *    anything else.
 */

import { useCallback, useEffect, useState } from 'react';

import { parseTheme, type ResolvedTheme } from '../../theme/validate';
import { Button, EmptyState, ViewHeader } from '../../ui/primitives';
import { useStore } from '../state/store';
import { ThemeCard } from './ThemeCard';

/** Where community themes live. Change these two to point at your own fork. */
export const REPO_OWNER = 'Mister2314';
export const REPO_NAME = 'tincture';
export const THEMES_DIR = 'themes';

const CACHE_KEY = 'tincture.gallery.v1';
const MAX_THEME_BYTES = 256 * 1024;

type GalleryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; themes: ResolvedTheme[]; source: 'network' | 'cache' }
  | { status: 'error'; message: string };

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

/**
 * A non-2xx response from GitHub.
 *
 * The status is carried rather than flattened into a message, because the gallery's failures
 * are not interchangeable. A 404 means the repository has no `themes/` folder — nothing to do
 * with the user's connection. Telling someone to check their network sends them looking in
 * the wrong place, and a wrong explanation is worse than a vague one.
 */
type HttpFailure = Error & { status: number };

function httpFailure(status: number, statusText: string): HttpFailure {
  const error = new Error(`${status} ${statusText}`.trim()) as HttpFailure;
  error.name = 'HttpFailure';
  error.status = status;
  return error;
}

function statusOf(error: unknown): number | null {
  return error instanceof Error && error.name === 'HttpFailure'
    ? (error as HttpFailure).status
    : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw httpFailure(response.status, response.statusText);
  return response.json();
}

/** Say what actually happened, not what usually happens. */
function describeFailure(error: unknown): string {
  const status = statusOf(error);

  if (status === 404) {
    return `Nothing to read — ${REPO_OWNER}/${REPO_NAME} has no "${THEMES_DIR}" folder yet. That is not a problem on your side, and everything else in the app works offline.`;
  }
  if (status === 403 || status === 429) {
    return `GitHub is rate-limiting this browser (${status}). Unauthenticated requests are capped at 60 an hour, so this clears on its own. Everything else in the app works offline.`;
  }
  if (status !== null) {
    return `GitHub answered ${status}. Everything else in the app works offline.`;
  }

  const detail = error instanceof Error ? error.message : 'unknown error';
  return `Could not reach GitHub (${detail}). The gallery needs a network connection; everything else in the app works offline.`;
}

/** List `themes/*.json` in the repo, newest commit first. */
async function listThemeFiles(): Promise<string[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${THEMES_DIR}`;
  const listing = await fetchJson(url);
  if (!Array.isArray(listing)) return [];
  return listing
    .filter(
      (entry): entry is { name: string; download_url: string; type: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { type?: string }).type === 'file' &&
        typeof (entry as { name?: unknown }).name === 'string' &&
        (entry as { name: string }).name.endsWith('.json'),
    )
    .map((entry) => entry.download_url);
}

async function fetchThemes(): Promise<ResolvedTheme[]> {
  const urls = await listThemeFiles();
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const raw = await fetchJson(url);
      // Guard the size before validating: a hostile file should not get to be parsed.
      const size = JSON.stringify(raw).length;
      if (size > MAX_THEME_BYTES) return null;
      const parsed = parseTheme(raw);
      return parsed.ok ? parsed.value : null;
    }),
  );

  return results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((t): t is ResolvedTheme => t !== null);
}

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

function readCache(): ResolvedTheme[] {
  try {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text) return [];
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    // Re-validate: the cache is user-writable.
    return raw
      .map((item) => parseTheme(item))
      .filter((r) => r.ok)
      .map((r) => (r as { value: ResolvedTheme }).value);
  } catch {
    return [];
  }
}

function writeCache(themes: ResolvedTheme[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(themes));
  } catch {
    /* a full quota must not break the gallery */
  }
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function GalleryCard({
  theme,
  installed,
  onInstall,
}: {
  theme: ResolvedTheme;
  installed: boolean;
  onInstall: () => void;
}) {
  return (
    <ThemeCard
      theme={theme}
      selected={installed}
      action={
        installed ? (
          <span className="badge">Added</span>
        ) : (
          <Button variant="primary" onClick={onInstall}>
            Add
          </Button>
        )
      }
      footer={theme.description ? <p className="theme-card__desc">{theme.description}</p> : null}
    />
  );
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export function GalleryView() {
  const { state, dispatch } = useStore();
  const [gallery, setGallery] = useState<GalleryState>({ status: 'idle' });

  const load = useCallback(async (force: boolean) => {
    const cached = readCache();
    if (!force && cached.length > 0) {
      setGallery({ status: 'ready', themes: cached, source: 'cache' });
    } else {
      setGallery({ status: 'loading' });
    }

    try {
      const themes = await fetchThemes();
      writeCache(themes);
      setGallery({ status: 'ready', themes, source: 'network' });
    } catch (error) {
      if (cached.length > 0) {
        setGallery({ status: 'ready', themes: cached, source: 'cache' });
      } else {
        setGallery({ status: 'error', message: describeFailure(error) });
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const installedIds = new Set(state.customThemes.map((t) => t.id));

  return (
    <section aria-labelledby="gallery-heading">
      <ViewHeader
        title="Community"
        subtitle={`Themes contributed to ${REPO_OWNER}/${REPO_NAME}. Each one is validated before it is shown, and again before it is applied.`}
        actions={
          <Button onClick={() => void load(true)} disabled={gallery.status === 'loading'}>
            {gallery.status === 'loading' ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {gallery.status === 'error' ? (
        <div className="card">
          <EmptyState title="Gallery unavailable" body={gallery.message} />
        </div>
      ) : gallery.status === 'loading' ? (
        <div className="card">
          <EmptyState title="Loading themes…" body="Reading the repository index." />
        </div>
      ) : gallery.status === 'ready' && gallery.themes.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No community themes yet"
            body="The folder is empty. Build one, then open a pull request — the contributing guide explains how."
          />
        </div>
      ) : gallery.status === 'ready' ? (
        <>
          {gallery.source === 'cache' ? (
            <p className="field__hint" style={{ marginBottom: 'var(--t-dimension-space-md)' }}>
              Showing a cached copy. Refresh for the latest.
            </p>
          ) : null}
          <div className="theme-grid">
            {gallery.themes.map((theme) => (
              <GalleryCard
                key={theme.id}
                theme={theme}
                installed={installedIds.has(theme.id)}
                onInstall={() => dispatch({ type: 'theme/add', theme })}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
