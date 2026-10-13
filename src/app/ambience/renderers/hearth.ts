/**
 * Hearth — a fire whose glow follows the timer phase.
 *
 * The whole point is that it is **state-driven**, not a decorative loop: a steady burn
 * while a focus session runs, dimming coals on a break, a banked fire while idle. A
 * background that burns the same way regardless of what the timer is doing is a screensaver,
 * not an ambience layer.
 *
 * The burn level is eased rather than switched, because a phase change happens eight or
 * more times a day and a hard cut reads as a bug the eighth time you see it.
 */

import { fbm2, rng, type Rng } from '../noise';
import { withAlpha, type AmbienceEnv, type AmbienceFrame, type MotifFactory } from '../types';

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  warmth: number;
  drift: number;
};

export const createHearth: MotifFactory = (ctx, initial) => {
  let env = initial;
  let embers: Ember[] = [];
  let source: Rng = rng(0);
  let elapsed = 0;
  /** Smoothed burn level, 0–1. Not the target — the target is what the phase asks for. */
  let level = 0.5;

  const spawnEmber = (r: Rng, e: AmbienceEnv, scatter: boolean): Ember => {
    const maxLife = r.range(2.2, 6.4);
    const spread = Math.min(e.width * 0.3, 240) * e.scale;
    return {
      x: e.width / 2 + r.range(-spread * 0.5, spread * 0.5),
      // Embers that already exist are spread through their lifetime, so the first frame
      // after a theme switch is not a burst of sparks all born at once.
      y: e.height * 1.0 - (scatter ? r.next() * maxLife * 34 : r.range(0, 10)),
      vx: r.range(-7, 7),
      vy: -r.range(14, 48),
      r: r.range(0.7, 2.2),
      life: scatter ? r.next() * maxLife : 0,
      maxLife,
      warmth: r.next(),
      drift: r.range(0.4, 1.6),
    };
  };

  const rebuild = () => {
    source = rng((env.seed || 1) * 7919 + 13);
    const count = Math.round(16 + env.density * 54);
    embers = [];
    for (let i = 0; i < count; i += 1) embers.push(spawnEmber(source, env, true));
    elapsed = 0;
    level = 0.5;
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

      // What the phase asks for: a steady fire while focusing, dimming coals on a break,
      // a banked fire while idle. Eased, never snapped.
      const target = !f.running ? 0.62 : f.phase === 'focus' ? 1 : 0.3;
      if (f.animate) level += (target - level) * Math.min(1, dt * 1.5);
      else level = target;

      // A fire flickers. Under reduced motion it does not, and the frame is still painted.
      const flick = f.animate ? fbm2(elapsed * 1.1, 0.37, env.seed || 1, 2) : 0.5;
      const strength = (0.2 + 0.68 * level) * (0.9 + 0.16 * flick) * env.ambience;

      const cx = w / 2;
      const cy = h * 1.0;
      const radius = Math.min(w, h) * 0.68 * env.scale;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      // The broad glow — this is the light the fire throws on the room.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, withAlpha(palette.accentHover, 0.5 * strength));
      glow.addColorStop(0.32, withAlpha(palette.accent, 0.26 * strength));
      glow.addColorStop(1, withAlpha(palette.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // A tighter core, so the fire has a heart rather than a haze.
      const core = ctx.createRadialGradient(cx, cy - radius * 0.05, 0, cx, cy, radius * 0.32);
      core.addColorStop(0, withAlpha(palette.accentHover, 0.4 * strength));
      core.addColorStop(1, withAlpha(palette.accent, 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      if (f.animate) {
        for (const e of embers) {
          e.life += dt;
          if (e.life >= e.maxLife) Object.assign(e, spawnEmber(source, env, false));
          e.x += (e.vx + Math.sin(elapsed * e.drift + e.y * 0.02) * 10) * dt;
          e.y += e.vy * dt;
        }
      }

      for (const e of embers) {
        const t = Math.min(1, Math.max(0, e.life / e.maxLife));
        const alpha = Math.sin(Math.PI * t) * 0.72 * strength;
        if (alpha <= 0.006) continue;
        ctx.fillStyle = withAlpha(e.warmth > 0.55 ? palette.accentHover : palette.accent, alpha);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (0.6 + 0.7 * (1 - t)), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
    },

    dispose() {
      embers = [];
    },
  };
};
