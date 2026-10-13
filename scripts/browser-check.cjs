/**
 * The browser pass `AGENTS.md` asks for, as a script.
 *
 * > "`npm run build` passing is not 'it works'. Drive it in a browser with Playwright."
 *
 * The previous pass was written ad hoc each time and swept afterwards, so the checks were
 * re-invented — and re-forgotten — every session. This is that list, committed:
 *
 *   onboarding completes · the timer runs and survives a reload · every theme applies and
 *   its motif actually paints · Space activates the focused control instead of the timer ·
 *   the dialog traps Tab and marks the background inert · "Erase everything" really erases ·
 *   the builder's JSON tab does not desync · a malformed theme is refused with a readable
 *   reason · the wheels open and Done commits while Cancel cancels · deleting a theme asks
 *   first · 360px has no overflow and no undersized targets.
 *
 * ## Running it
 *
 * Playwright is **not a dependency of this project** — it is a ~100 MB browser download, and
 * `AGENTS.md` requires a reason for every dependency that survives "what breaks without it".
 * So it uses a globally installed Playwright instead, and the preview server has to be up:
 *
 *     npm run build
 *     npm run preview            # in one terminal
 *     npm run check:browser      # in another
 *
 * Point it at a different origin with `TINCTURE_URL` (e.g. a Vercel preview deploy).
 *
 * ## Two things that cost real time
 *
 * 1. **Test against `vite preview`, not the dev server.** A `useStore must be used inside
 *    <StoreProvider>` crash looked like a real bug and was an HMR artifact of editing files
 *    while the test ran. Against the production build: zero errors.
 * 2. **Playwright's `click()` does not account for a `position: sticky` header.** It scrolls
 *    the element into view and the header lands on top, so the click times out. Three phantom
 *    failures came from this.
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Playwright is not a project dependency, so resolve it from wherever it lives rather than
 * pretending `require('playwright')` will work: the project's own `node_modules` first, then
 * the global root, then `PLAYWRIGHT_PATH`. A missing install gets one sentence, not a stack.
 */
function loadPlaywright() {
  const candidates = [() => require('playwright')];

  if (process.env.PLAYWRIGHT_PATH) {
    candidates.push(() => require(path.join(process.env.PLAYWRIGHT_PATH, 'playwright')));
  }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (globalRoot) candidates.push(() => require(path.join(globalRoot, 'playwright')));
  } catch {
    /* no npm on PATH — the other candidates may still work */
  }

  for (const load of candidates) {
    try {
      return load();
    } catch {
      /* try the next one */
    }
  }

  console.error(
    'Playwright is not installed where this script can find it.\n' +
      'Install it once with:  npm i -g playwright && npx playwright install chromium\n' +
      'Or point at an existing copy:  PLAYWRIGHT_PATH=/path/to/node_modules npm run check:browser',
  );
  process.exit(1);
}

const { chromium } = loadPlaywright();

const BASE = process.env.TINCTURE_URL || 'http://127.0.0.1:4173/';
const KEY = 'tincture.v1';

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail });

/** A complete, valid store — so a test never depends on onboarding having been run. */
const SEED = {
  settings: {
    config: {
      focusMs: 1500000,
      shortBreakMs: 300000,
      longBreakMs: 900000,
      longBreakEvery: 4,
      autoStartBreaks: true,
      autoStartFocus: false,
    },
    themeId: 'midnight',
    soundEnabled: false,
    notificationsEnabled: false,
    dailyGoal: 8,
    reduceMotion: false,
    onboarded: true,
    name: 'Tester',
  },
  timer: {
    status: 'idle',
    phase: 'focus',
    startedAt: null,
    durationMs: 1500000,
    pausedTotalMs: 0,
    pausedAt: null,
    completedFocus: 0,
  },
  tasks: [{ id: 't1', title: 'Audit me', estimate: 3, done: 1, completed: false, createdAt: Date.now() }],
  sessions: [{ id: 's1', phase: 'focus', startedAt: Date.now() - 3600000, durationMs: 1500000, taskId: 't1' }],
  activeTaskId: 't1',
  customThemes: [],
};

const THEMES = ['midnight', 'daylight', 'van-gogh', 'terminal-amber', 'ember', 'neon-rain', 'sakura-tree', 'herbarium', 'frost'];
const CANVAS_MOTIFS = new Set(['van-gogh', 'ember', 'neon-rain', 'sakura-tree', 'frost']);
const CSS_MOTIFS = new Set(['terminal-amber', 'herbarium']);

async function newPage(browser, seed, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  if (seed !== null) {
    // Seed only when the key is absent. `addInitScript` runs on every navigation, so an
    // unconditional write would restore the seed on reload and hide the very persistence
    // behaviour these tests exist to check.
    await ctx.addInitScript(
      ([k, s]) => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, s);
      },
      [KEY, JSON.stringify(seed)],
    );
  } else {
    await ctx.addInitScript((k) => localStorage.removeItem(k), KEY);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  return { ctx, page, errors };
}

const nav = (page, name) => page.getByRole('button', { name, exact: true }).first();
const state = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);

/** Colour spread across the ambience canvas — 0 means nothing was painted. */
const canvasSpread = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.ambience__canvas');
    if (!c || !c.width) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4 * 41) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return Math.round(max - min);
  });

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. Onboarding completes ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, null);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const first = await page.locator('.onboarding__step').innerText();
    // `innerText` returns the CSS-transformed text, and the step line is uppercased.
    ok('onboarding: starts at step 1', /step 1 of 5/i.test(first), first);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start focusing' }).click();
    await page.waitForSelector('.nav', { timeout: 5000 });
    ok('onboarding: completes into the shell', await page.locator('.nav').isVisible());
    ok('onboarding: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 2. The timer runs and survives a reload ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Start' }).click();
    await page.waitForTimeout(1500);
    ok('timer: start persists status running', (await state(page)).timer.status === 'running');
    await page.reload({ waitUntil: 'networkidle' });
    const after = await state(page);
    ok('timer: survives a reload as running', after.timer.status === 'running', JSON.stringify(after.timer));
    await ctx.close();
  }

  /* ---------- 3. Every theme applies, and its motif paints ---------- */
  {
    const running = structuredClone(SEED);
    running.timer = { ...running.timer, status: 'running', startedAt: Date.now() - 120000 };
    const { ctx, page, errors } = await newPage(browser, running);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Themes').click();
    await page.waitForTimeout(500);

    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('.theme-card__id .theme-card__name')].map((el) => el.textContent),
    );
    ok('themes: all nine cards render', cards.length === 9, cards.join(', '));

    for (const id of THEMES) {
      const found = await page.evaluate((t) => {
        for (const c of document.querySelectorAll('.theme-card')) {
          const name = c.querySelector('.theme-card__name');
          if (name && name.textContent.toLowerCase().replace(/\s+/g, '-') === t) {
            const btn = c.querySelector('button');
            if (btn) {
              btn.setAttribute('data-audit-target', '1');
              return true;
            }
          }
        }
        return false;
      }, id);
      if (found) {
        await page.locator('[data-audit-target="1"]').click();
        await page.evaluate(() =>
          document.querySelectorAll('[data-audit-target]').forEach((e) => e.removeAttribute('data-audit-target')),
        );
      }
      await page.waitForTimeout(500);
      const applied = await page.evaluate(() => document.documentElement.dataset.themeId);
      ok(`theme ${id}: applied to <html>`, applied === id, String(applied));

      if (CANVAS_MOTIFS.has(id)) {
        await page.waitForTimeout(1100);
        const spread = await canvasSpread(page);
        ok(`theme ${id}: motif actually paints pixels`, spread > 8, `colour spread ${spread}`);
      } else if (CSS_MOTIFS.has(id)) {
        const opacity = await page.evaluate(() => {
          const el = document.querySelector('.ambience--fixed');
          const layers = [...(el?.children ?? [])].map((c) => parseFloat(getComputedStyle(c).opacity) || 0);
          return Math.max(...layers, 0);
        });
        ok(`theme ${id}: CSS motif layer is visible`, opacity > 0, `max layer opacity ${opacity}`);
      }
    }
    ok('themes: no console errors while switching', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 4. Space activates the focused control, not the timer ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const before = await state(page);

    await nav(page, 'Tasks').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const view = await page.evaluate(() => document.querySelector('.view-title')?.textContent);
    const after = await state(page);
    ok('space: navigates when a nav button has focus', view === 'Tasks', String(view));
    ok('space: does NOT toggle the timer in that case', after.timer.status === before.timer.status, `${before.timer.status} -> ${after.timer.status}`);

    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    ok('space: still toggles the timer from a non-interactive area', (await state(page)).timer.status === 'running');
    await ctx.close();
  }

  /* ---------- 5. The dialog traps Tab and marks the background inert ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Themes').click();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.waitForSelector('.dialog', { timeout: 4000 });

    let escaped = null;
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const d = document.querySelector('.dialog');
        return d ? d.contains(document.activeElement) : false;
      });
      if (!inside) {
        escaped = i;
        break;
      }
    }
    ok('dialog: Tab never escapes', escaped === null, escaped === null ? 'stayed inside for 18 tabs' : `escaped on tab ${escaped}`);
    ok('dialog: background is inert', (await page.evaluate(() => document.querySelectorAll('[inert]').length)) > 0);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => !document.querySelector('.dialog'));
    const stillInert = await page.evaluate(() => document.querySelectorAll('[inert]').length);
    ok('dialog: Escape closes it and clears inert', closed && stillInert === 0, `closed=${closed} inert=${stillInert}`);
    await ctx.close();
  }

  /* ---------- 6. Erase everything actually erases ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Settings').click();
    await page.getByRole('button', { name: 'Erase everything' }).first().click();
    await page.waitForSelector('.dialog', { timeout: 4000 });
    await page.locator('.dialog').getByRole('button', { name: 'Erase everything' }).click();
    await page.waitForTimeout(600);

    const afterReset = await state(page);
    ok('erase: tasks gone from storage', Array.isArray(afterReset.tasks) && afterReset.tasks.length === 0);
    ok('erase: sessions gone from storage', Array.isArray(afterReset.sessions) && afterReset.sessions.length === 0);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    ok('erase: reload lands on first-run, not the old data', (await page.locator('.onboarding__step').count()) === 1);
    await ctx.close();
  }

  /* ---------- 7. Builder: the JSON tab does not desync ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Themes').click();
    await page.getByRole('button', { name: 'Build a theme' }).click();
    await page.waitForSelector('.builder', { timeout: 4000 });

    await page.getByRole('tab', { name: 'JSON' }).click();
    await page.waitForTimeout(300);
    ok('builder: JSON tab shows the document', (await page.locator('.builder textarea').inputValue()).includes('"tokens"'));

    await page.locator('.builder textarea').fill('{ "id": "half"');
    await page.waitForTimeout(300);
    ok(
      'builder: half-typed JSON is kept, not reverted',
      (await page.locator('.builder textarea').inputValue()) === '{ "id": "half"',
    );
    ok('builder: invalid JSON is reported', (await page.locator('.builder .field__error').count()) > 0);
    await ctx.close();
  }

  /* ---------- 8. A malformed theme is refused, with a readable reason ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Themes').click();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.waitForSelector('.dialog', { timeout: 4000 });
    await page.locator('.dialog textarea').fill('{ "id": "bad", "name": "Bad" }');
    await page.waitForTimeout(300);
    const text = await page.locator('.dialog .issue-list').innerText();
    ok('import: malformed theme is refused', text.length > 0, text.replace(/\n/g, ' / ').slice(0, 120));
    ok('import: the reason is not "Invalid input"', !/Invalid input/i.test(text), text.slice(0, 80));
    ok('import: the action is disabled while invalid', await page.getByRole('button', { name: 'Import and apply' }).isDisabled());
    await ctx.close();
  }

  /* ---------- 9. The wheels open; Done commits, Cancel cancels ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Settings').click();
    await page.waitForSelector('.value-pill', { timeout: 5000 });
    const pills = page.locator('.value-pill');
    ok('wheels: the settings wheels are present', (await pills.count()) >= 4, `${await pills.count()} value pills`);

    const before = (await state(page)).settings.config.focusMs;
    await pills.first().click();
    await page.waitForSelector('.dialog [data-rwp]', { timeout: 4000 });
    // Scroll the wheel the way a person does. Most of the 190 options are outside the visible
    // band, so clicking a specific one is not a real interaction.
    const box = await page.locator('.dialog [data-rwp]').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(500);
    const after = (await state(page)).settings.config.focusMs;
    ok('wheels: scrolling then Done commits', after !== before, `${before} -> ${after}`);

    await pills.first().click();
    await page.waitForSelector('.dialog [data-rwp]', { timeout: 4000 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
    ok('wheels: Cancel really cancels', (await state(page)).settings.config.focusMs === after, `still ${after}`);
    await ctx.close();
  }

  /* ---------- 10. Deleting a theme asks first ---------- */
  {
    const seed = structuredClone(SEED);
    seed.customThemes = [
      {
        id: 'mine',
        name: 'Mine',
        author: 'me',
        date: '2026-10-13',
        version: '1.0.0',
        license: 'MIT',
        appearance: 'dark',
        tokens: {
          color: {
            bg: '#101010', bgElevated: '#181818', surface: '#1a1a1a', surfaceHover: '#222222',
            surfaceActive: '#2a2a2a', text: '#eeeeee', textMuted: '#aaaaaa', textSubtle: '#8c8c8c',
            accent: '#ff8800', accentHover: '#ffaa33', accentText: '#101010', border: '#333333',
            borderStrong: '#666666', focusRing: '#ff8800', success: '#44bb88', danger: '#ee5566',
          },
          dimension: {
            radiusSm: '6px', radiusMd: '12px', radiusLg: '20px', radiusFull: '9999px',
            spaceXs: '4px', spaceSm: '8px', spaceMd: '16px', spaceLg: '24px', spaceXl: '40px',
          },
          fontFamily: { display: 'manrope', body: 'manrope', mono: 'jetbrains-mono' },
          shadow: {
            card: { x: 0, y: 1, blur: 2, spread: 0, color: '#00000066' },
            elevated: [{ x: 0, y: 8, blur: 24, spread: -4, color: '#00000099' }],
          },
        },
      },
    ];
    const { ctx, page } = await newPage(browser, seed);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await nav(page, 'Themes').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Delete Mine' }).click();
    await page.waitForTimeout(400);
    ok('delete: asks for confirmation', (await page.locator('.dialog').count()) > 0);
    ok('delete: nothing removed before confirming', (await state(page)).customThemes.length === 1);
    await page.locator('.dialog').getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(500);
    ok('delete: removed after confirming', (await state(page)).customThemes.length === 0);
    await ctx.close();
  }

  /* ---------- 11. Mobile 360px ---------- */
  {
    const { ctx, page } = await newPage(browser, SEED, { width: 360, height: 780 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const bad = [];
    for (const v of ['Timer', 'Tasks', 'Stats', 'Themes', 'Community', 'Settings']) {
      await nav(page, v).click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const vw = window.innerWidth;
        const over = [...document.querySelectorAll('body *')].filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && (b.right > vw + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed';
        }).map((el) => el.className);
        const small = [...document.querySelectorAll('button, [role="checkbox"], a[href]')]
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && (b.width < 24 || b.height < 24);
          })
          .map((el) => `${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
        return { over, small, scrollW: document.documentElement.scrollWidth, vw };
      });
      if (r.over.length || r.scrollW > r.vw + 1) bad.push(`${v}: overflow ${r.over.join(',')} (scroll ${r.scrollW}/${r.vw})`);
      if (r.small.length) bad.push(`${v}: small ${r.small.join(', ')}`);
    }
    ok('mobile 360px: no overflow and no undersized controls', bad.length === 0, bad.join(' | '));
    await ctx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  -> ' + r.detail}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
