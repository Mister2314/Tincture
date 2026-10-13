/**
 * Frost growth — crystals anchored at the screen edges.
 *
 * The anchoring is the point. A centred glow is the default background of a thousand
 * generated pages; frost that creeps *inward from the frame*, the way it does on a window,
 * is a different object. Each edge carries a few seeded nucleation points, and every crystal
 * grows from one of them on a shared timeline so the pane freezes progressively rather than
 * appearing finished.
 *
 * Drawn with `source-over` rather than additive blending on purpose: this is a light theme,
 * and adding light to a near-white background erases the crystal instead of drawing it.
 */

import { rng, smoothstep } from '../noise';
import { withAlpha, type AmbienceFrame, type MotifFactory } from '../types';

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  /** Position in the growth timeline, 0–1, when this segment starts and finishes. */
  t0: number;
  t1: number;
  depth: number;
};

/** How long the pane takes to freeze. Long enough to notice, short enough to forget. */
const GROWTH_MS = 7200;

export const createFrostGrowth: MotifFactory = (ctx, initial) => {
  let env = initial;
  let segments: Segment[] = [];
  let elapsed = 0;

  const build = () => {
    const r = rng((env.seed || 1) * 15485863 + 3);
    segments = [];

    const perEdge = Math.max(2, Math.round(1.5 + env.density * 4));
    const anchors: Array<{ x: number; y: number; a: number }> = [];
    for (let i = 0; i < perEdge; i += 1) {
      const t = (i + 0.5) / perEdge;
      anchors.push({ x: env.width * t, y: -2, a: Math.PI / 2 });
      anchors.push({ x: env.width * t, y: env.height + 2, a: -Math.PI / 2 });
      anchors.push({ x: -2, y: env.height * t, a: 0 });
      anchors.push({ x: env.width + 2, y: env.height * t, a: Math.PI });
    }

    const reach = Math.min(env.width, env.height) * 0.17 * env.scale;

    const grow = (
      x: number,
      y: number,
      angle: number,
      len: number,
      width: number,
      depth: number,
      t0: number,
    ): void => {
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      const t1 = Math.min(1, t0 + (1 - t0) * r.range(0.3, 0.5));
      segments.push({ x1: x, y1: y, x2, y2, w: width, t0, t1, depth });

      if (depth >= 4 || len < 5) return;

      const kids = r.chance(0.35) ? 3 : 2;
      for (let i = 0; i < kids; i += 1) {
        const spread =
          kids === 2 ? (i === 0 ? -1 : 1) * r.range(0.5, 0.85) : (i - 1) * r.range(0.45, 0.8);
        grow(x2, y2, angle + spread, len * r.range(0.5, 0.72), width * 0.62, depth + 1, t1);
      }
    };

    for (const a of anchors) {
      grow(a.x, a.y, a.a + r.range(-0.22, 0.22), reach * r.range(0.7, 1.15), Math.max(1.1, 2.4 * env.scale), 0, 0);
    }
  };

  build();

  return {
    resize(next) {
      env = next;
      build();
      elapsed = 0;
    },

    frame(f: AmbienceFrame) {
      const { width: w, height: h, palette } = env;
      const dt = f.animate ? f.dt / 1000 : 0;
      elapsed += dt;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);

      // Reduced motion gets the finished pane, not an empty one — the motif stops moving,
      // it does not disappear.
      const growth = f.animate
        ? smoothstep(0, 1, Math.min(1, (elapsed * 1000) / GROWTH_MS))
        : 1;

      // The halo the crystals sit in: brightest at the frame, fading inward. This is what
      // sells "the window is freezing" before a single crystal has finished growing.
      const edge = Math.min(w, h) * 0.22;
      ctx.fillStyle = withAlpha(palette.bgElevated, 0.6 * env.ambience);
      ctx.fillRect(0, 0, w, edge * 0.35);
      ctx.fillRect(0, h - edge * 0.35, w, edge * 0.35);
      ctx.fillRect(0, 0, edge * 0.35, h);
      ctx.fillRect(w - edge * 0.35, 0, edge * 0.35, h);

      ctx.lineCap = 'round';

      for (const s of segments) {
        if (growth <= s.t0) continue;
        const local = Math.min(1, (growth - s.t0) / Math.max(0.0001, s.t1 - s.t0));
        const alpha = (0.5 - s.depth * 0.07) * env.ambience;
        if (alpha <= 0.01) continue;

        ctx.strokeStyle = withAlpha(s.depth === 0 ? palette.success : palette.accent, alpha);
        ctx.lineWidth = s.w * (0.45 + 0.55 * local);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x1 + (s.x2 - s.x1) * local, s.y1 + (s.y2 - s.y1) * local);
        ctx.stroke();
      }
    },

    dispose() {
      segments = [];
    },
  };
};
