/**
 * Sakura tree — a seeded L-system tree with falling petals.
 *
 * The seed is the feature, not a detail. A background that rearranges itself on every visit
 * reads as a bug, so the *tree* is drawn once from `seed` alone and never re-derived from
 * time. Only the petals move. Two loads with the same seed must produce the same tree down
 * to the branch, which is why every angle and length comes from the seeded source and the
 * canvas is built before the first frame is painted.
 */

import { rng, type Rng } from '../noise';
import { withAlpha, type AmbienceEnv, type AmbienceFrame, type MotifFactory } from '../types';

type Petal = {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  rot: number;
  spin: number;
  sway: number;
  phase: number;
  hue: number;
};

/** Deep enough to read as a tree, shallow enough that the branch count stays bounded. */
const MAX_DEPTH = 9;

export const createSakuraTree: MotifFactory = (ctx, initial) => {
  let env = initial;
  let tree: HTMLCanvasElement | null = null;
  let petals: Petal[] = [];
  let source: Rng = rng(0);
  let elapsed = 0;

  /** One branch, then its children. Every random draw comes from the seeded source. */
  const drawBranch = (
    g: CanvasRenderingContext2D,
    r: Rng,
    x: number,
    y: number,
    angle: number,
    len: number,
    width: number,
    depth: number,
  ): void => {
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;

    g.strokeStyle = withAlpha(env.palette.text, Math.max(0.12, 0.5 - depth * 0.045));
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();

    if (depth >= MAX_DEPTH || len < 5) {
      // A blossom cluster at the tip, which is what makes the silhouette read as a tree
      // rather than as a diagram of one.
      const blossoms = r.int(3, 7);
      for (let i = 0; i < blossoms; i += 1) {
        const bx = x2 + r.range(-len, len) * 0.95;
        const by = y2 + r.range(-len, len) * 0.95;
        g.fillStyle = withAlpha(
          r.chance(0.45) ? env.palette.accentHover : env.palette.accent,
          r.range(0.28, 0.6),
        );
        g.beginPath();
        g.arc(bx, by, r.range(1.6, 3.6), 0, Math.PI * 2);
        g.fill();
      }
      return;
    }

    const children = r.chance(0.3) ? 3 : 2;
    for (let i = 0; i < children; i += 1) {
      const spread =
        children === 2
          ? (i === 0 ? -1 : 1) * r.range(0.24, 0.55)
          : (i - 1) * r.range(0.24, 0.5);
      drawBranch(g, r, x2, y2, angle + spread, len * r.range(0.66, 0.82), width * 0.68, depth + 1);
    }
  };

  /** Draw the tree once, at device resolution, so the frame loop only blits it. */
  const buildTree = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(env.width * env.dpr));
    canvas.height = Math.max(1, Math.round(env.height * env.dpr));
    const g = canvas.getContext('2d');
    if (!g) return canvas;

    g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    const r = rng((env.seed || 1) * 31 + 17);
    const trunk = Math.min(env.height * 0.34, env.width * 0.34) * env.scale;
    drawBranch(g, r, env.width * 0.5, env.height * 1.02, -Math.PI / 2, trunk, Math.max(3, 9 * env.scale), 0);
    return canvas;
  };

  const spawnPetal = (r: Rng, e: AmbienceEnv, scatter: boolean): Petal => {
    const canopy = Math.min(e.width * 0.42, 420) * e.scale;
    return {
      x: e.width / 2 + r.range(-canopy, canopy),
      y: scatter ? r.range(0, e.height) : r.range(-70, -10),
      vy: r.range(16, 46),
      vx: r.range(-12, 12),
      size: r.range(2.6, 6.4) * (0.7 + e.scale * 0.3),
      rot: r.range(0, Math.PI * 2),
      spin: r.range(-1.4, 1.4),
      sway: r.range(0.6, 1.9),
      phase: r.range(0, Math.PI * 2),
      hue: r.next(),
    };
  };

  const rebuild = () => {
    tree = buildTree();
    source = rng((env.seed || 1) * 8191 + 41);
    const count = Math.round(26 + env.density * 84);
    petals = [];
    for (let i = 0; i < count; i += 1) petals.push(spawnPetal(source, env, true));
    elapsed = 0;
  };

  rebuild();

  return {
    resize(next) {
      env = next;
      rebuild();
    },

    frame(f: AmbienceFrame) {
      const { width: w, height: h, palette } = env;
      const dt = f.animate ? f.dt / 1000 : 0;
      elapsed += dt;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);

      if (tree) ctx.drawImage(tree, 0, 0, w, h);

      if (f.animate) {
        for (const p of petals) {
          p.y += p.vy * dt;
          p.x += (p.vx + Math.sin(elapsed * p.sway + p.phase) * 22) * dt;
          p.rot += p.spin * dt;
          if (p.y - 20 > h) Object.assign(p, spawnPetal(source, env, false));
        }
      }

      for (const p of petals) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = withAlpha(p.hue > 0.5 ? palette.accent : palette.accentHover, 0.52 * env.ambience);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    dispose() {
      petals = [];
      tree = null;
    },
  };
};
