/**
 * The ambience layer — one canvas behind the app.
 *
 * This component owns every decision the individual renderers are not allowed to make:
 * when to run, how big the canvas is, and what the parameters are. A renderer just paints
 * a frame; the policy lives here, in one place, so it cannot drift per motif.
 *
 * The gates, in order:
 *
 * - **Reduced motion wins, always.** `prefers-reduced-motion` or the app's own setting stop
 *   the animation. They do not remove the motif — one static frame is painted, so the
 *   background is still the theme's background.
 * - **`effects.motion === 0` stops it**, and any other value scales the clock.
 * - **A hidden tab paints nothing.** No `requestAnimationFrame` runs while
 *   `document.visibilityState === 'hidden'`.
 * - **A phase-driven motif parks while the timer is idle**, and wakes when it starts.
 * - **`effects.ambience === 0` switches the motif off** without changing `motif`.
 *
 * The canvas is `position: fixed` and `pointer-events: none`, so it cannot intercept a
 * click or move the layout. Everything it draws comes from the resolved theme, which means
 * a community theme moves the ambience too — the motif is a theme decision, not an app one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Motif } from '../../theme/schema';
import { findTheme } from '../../theme/registry';
import { progress, type Phase } from '../timer/engine';
import { useStore } from '../state/store';
import { rendererFor } from './renderers';
import {
  kindOf,
  paletteOf,
  type AmbienceEnv,
  type AmbienceFrame,
  type MotifRenderer,
} from './types';

/** Motifs that read the timer phase, and therefore have nothing to do while it is idle. */
const PHASE_DRIVEN: ReadonlySet<Motif> = new Set<Motif>(['hearth']);

/** The one bundled image. Loaded only when `van-gogh` is the active theme. */
const ART_SRC = `${import.meta.env.BASE_URL}art/starry-night.jpg`;

export function Ambience() {
  const { state, now } = useStore();
  const id = state.previewThemeId ?? state.settings.themeId;
  const theme = useMemo(() => findTheme(id, state.customThemes), [id, state.customThemes]);

  const motif: Motif = theme.motif ?? 'none';
  const kind = kindOf(motif);
  const ambience = theme.effects?.ambience ?? 0;
  const density = theme.effects?.density ?? 0.5;
  const scale = theme.effects?.scale ?? 1;
  const seed = theme.effects?.seed ?? 1;
  const motion = theme.effects?.motion ?? 1;

  /** A motif the canvas is responsible for, and that the theme has not switched off. */
  const active = kind === 'canvas' && ambience > 0 && rendererFor(motif) !== null;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLDivElement>(null);

  /** Wakes the parked loop — set by the main effect, called by the watchers below. */
  const wakeRef = useRef<(() => void) | null>(null);

  /** Latest timer state, read by the loop without restarting it. */
  const live = useRef<{ phase: Phase; running: boolean; progress: number }>({
    phase: 'focus',
    running: false,
    progress: 0,
  });

  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const reduced = state.settings.reduceMotion || systemReduced;

  useEffect(() => {
    live.current.phase = state.timer.phase;
    live.current.running = state.timer.status === 'running';
    live.current.progress = progress(state.timer, now);
  });

  // The motif is a property of the theme, so the container always states it — the CSS-only
  // motifs and the art layer key off this attribute, and it survives a switch to `none`.
  useEffect(() => {
    const container = containerRef.current;
    if (container) container.dataset.motif = motif;

    const art = artRef.current;
    if (art) art.style.backgroundImage = motif === 'starry-flow' && active ? `url("${ART_SRC}")` : '';
  }, [motif, active]);

  // A phase-driven motif parks itself while the timer is idle. Nothing else re-runs the
  // effect when the timer starts, so it is woken explicitly.
  useEffect(() => {
    wakeRef.current?.();
  }, [state.timer.status, reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !ctx) return;

    const factory = active ? rendererFor(motif) : null;

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    if (!factory) {
      clear();
      return;
    }

    let disposed = false;
    let raf = 0;
    let ticking = true;
    let image: HTMLImageElement | null = null;
    let last = performance.now();
    const started = last;

    const buildEnv = (): AmbienceEnv => {
      // Capped at 2: a 3× buffer on a phone is four times the fill rate for a background
      // nobody is looking at directly.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      return {
        width: Math.max(1, Math.round(window.innerWidth)),
        height: Math.max(1, Math.round(window.innerHeight)),
        dpr,
        palette: paletteOf(theme),
        ambience,
        density,
        scale,
        seed,
        image,
      };
    };

    const sizeCanvas = (): AmbienceEnv => {
      const env = buildEnv();
      canvas.width = Math.max(1, Math.round(env.width * env.dpr));
      canvas.height = Math.max(1, Math.round(env.height * env.dpr));
      canvas.style.width = `${env.width}px`;
      canvas.style.height = `${env.height}px`;
      // Draw in CSS pixels; the transform carries the device ratio.
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      return env;
    };

    let env = sizeCanvas();
    const instance: MotifRenderer = factory(ctx, env);

    const loop = (time: number) => {
      if (disposed) return;
      const dt = Math.min(64, Math.max(0, time - last));
      last = time;

      const visible = document.visibilityState !== 'hidden';
      const moving = !reduced && motion > 0;
      const parked = PHASE_DRIVEN.has(motif) && !live.current.running;
      const animate = moving && visible && !parked;

      const frame: AmbienceFrame = {
        now: time - started,
        // Motion scales the clock, so a theme that asks for 0.5 simply runs everything at
        // half speed rather than each renderer interpreting the number differently.
        dt: animate ? dt * motion : 0,
        animate,
        phase: live.current.phase,
        running: live.current.running,
        progress: live.current.progress,
      };
      instance.frame(frame);

      if (animate) {
        raf = requestAnimationFrame(loop);
      } else {
        // Parked. The watchers below wake it — a hidden tab and an idle phase-driven motif
        // must not hold a frame loop open.
        raf = 0;
        ticking = false;
      }
    };

    const wake = () => {
      if (disposed || ticking) return;
      ticking = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') wake();
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (disposed) return;
        env = sizeCanvas();
        instance.resize(env);
        last = performance.now();
        wake();
      }, 140);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    if (motif === 'starry-flow') {
      // Lazy by construction: the request only exists while this theme is selected, so a
      // theme nobody picked never costs a download.
      const art = new Image();
      art.decoding = 'async';
      art.onload = () => {
        if (disposed) return;
        image = art;
        env = { ...env, image };
        instance.resize(env);
        wake();
      };
      // A failed load is not fatal: the field is absent and the curl-noise fallback runs.
      art.onerror = () => undefined;
      art.src = ART_SRC;
    }

    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      instance.dispose();
      if (wakeRef.current === wake) wakeRef.current = null;
      clear();
    };
    // Rebuilt only when a theme decision changes — never on a timer tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, motif, active, ambience, density, scale, seed, motion, reduced]);

  return (
    <div className="ambience" ref={containerRef} data-motif={motif} aria-hidden="true">
      <div className="ambience__art" ref={artRef} />
      <canvas className="ambience__canvas" ref={canvasRef} />
      {motif === 'specimen' ? <SpecimenArt /> : null}
      {/*
        The contrast floor. The motif is allowed to be characterful; the timer is not
        allowed to become unreadable. This sits above every motif layer and below the
        content, and washes the theme's own background over the centre of the viewport,
        where the readout lives. `--t-color-bg` rather than a fixed colour, so it is the
        theme's paper that protects the theme's text.
      */}
      <div className="ambience__scrim" />
    </div>
  );
}

/**
 * The pressed botanical silhouette for `specimen`.
 *
 * Inline SVG rather than a `url()` in the stylesheet, for one reason: a data-URI cannot
 * read the theme's custom properties, so the plant would be the same green in every theme.
 * Drawn here it is painted from the theme's own tokens, exactly like every canvas motif.
 *
 * Not exported, so the file still has a single component export.
 */
function SpecimenArt() {
  return (
    <svg className="ambience__specimen" viewBox="0 0 140 220" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="var(--t-color-success)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M70 216 L70 24" />
        {/* leaf pairs, shrinking toward the tip */}
        <path d="M70 182 C50 180 34 168 28 148 C51 146 65 160 70 178 Z" />
        <path d="M70 182 C90 180 106 168 112 148 C89 146 75 160 70 178 Z" />
        <path d="M70 142 C54 140 42 130 37 114 C55 112 67 124 70 138 Z" />
        <path d="M70 142 C86 140 98 130 103 114 C85 112 73 124 70 138 Z" />
        <path d="M70 106 C58 104 48 96 44 84 C58 82 68 92 70 102 Z" />
        <path d="M70 106 C82 104 92 96 96 84 C82 82 72 92 70 102 Z" />
        {/* the root, cut short the way a pressed specimen is */}
        <path d="M70 216 C64 220 60 222 56 224" />
      </g>
      <g fill="var(--t-color-accent)" opacity="0.55">
        <circle cx="70" cy="26" r="4.5" />
        <circle cx="60" cy="32" r="3.2" />
        <circle cx="80" cy="32" r="3.2" />
        <circle cx="70" cy="38" r="2.6" />
      </g>
    </svg>
  );
}
