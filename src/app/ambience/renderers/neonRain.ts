/**
 * Neon rain — rain streaks mirrored at a horizon.
 *
 * The reflection is the whole idea. Rain falling on its own is a stock effect; rain falling
 * *and landing* — mirrored below a horizon line, dimmer, wobbling as the water surface
 * moves — is a wet street at night, and that is the part a generic neon particle layer
 * never has. Everything below the horizon is the above-horizon streak, flipped about the
 * horizon and displaced by a travelling wave.
 */

import { rng, type Rng } from '../noise';
import { withAlpha, type AmbienceEnv, type AmbienceFrame, type MotifFactory } from '../types';

type Drop = {
  x: number;
  y: number;
  len: number;
  speed: number;
  /** 0–1; selects one of the theme's three neon tokens. */
  hue: number;
  width: number;
};

/** Fall direction. Not vertical — a slight slant is what makes it read as weather. */
const SLANT_X = 0.21;
const SLANT_Y = 0.978;
const HORIZON = 0.62;

export const createNeonRain: MotifFactory = (ctx, initial) => {
  let env = initial;
  let drops: Drop[] = [];
  let source: Rng = rng(0);
  let elapsed = 0;

  const horizonY = () => env.height * HORIZON;

  const spawn = (r: Rng, e: AmbienceEnv, scatter: boolean): Drop => {
    const horizon = e.height * HORIZON;
    const len = r.range(26, 132) * (0.55 + e.scale * 0.5);
    return {
      x: r.range(-60, e.width + 60),
      y: scatter ? r.range(-e.height * 0.5, horizon) : r.range(-len * 2.4, -len),
      len,
      speed: r.range(230, 720),
      hue: r.next(),
      width: r.range(0.7, 1.9),
    };
  };

  const rebuild = () => {
    source = rng((env.seed || 1) * 104729 + 7);
    const count = Math.round(56 + env.density * 210);
    drops = [];
    for (let i = 0; i < count; i += 1) drops.push(spawn(source, env, true));
    elapsed = 0;
  };

  rebuild();

  const hueOf = (hue: number): string => {
    if (hue > 0.86) return env.palette.borderStrong; // the violet, used sparingly
    return hue > 0.48 ? env.palette.success : env.palette.accent;
  };

  return {
    resize(next) {
      env = next;
      rebuild();
    },

    frame(f: AmbienceFrame) {
      const { width: w, height: h, palette } = env;
      const dt = f.animate ? f.dt / 1000 : 0;
      elapsed += dt;
      const horizon = horizonY();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);

      if (f.animate) {
        for (const d of drops) {
          d.y += d.speed * dt;
          d.x += d.speed * dt * SLANT_X;
          if (d.y - d.len > horizon || d.x > w + 80) Object.assign(d, spawn(source, env, false));
        }
      }

      // The wet ground. A band of the accent under the horizon, so the reflection has
      // something to sit in rather than floating on flat black.
      ctx.globalCompositeOperation = 'lighter';
      const ground = ctx.createLinearGradient(0, horizon, 0, h);
      ground.addColorStop(0, withAlpha(palette.accent, 0.1 * env.ambience));
      ground.addColorStop(0.5, withAlpha(palette.success, 0.045 * env.ambience));
      ground.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, w, h - horizon);

      // Reflections first, so the streaks that land on the horizon sit on top of them.
      ctx.lineCap = 'round';
      for (const d of drops) {
        const tailX = d.x - SLANT_X * d.len;
        const tailY = d.y - SLANT_Y * d.len;

        // Only the part above the horizon reflects — water does not mirror the sky it
        // cannot see. Mirrored about the horizon, then pushed by a travelling wave whose
        // amplitude grows with depth, which is what makes it read as liquid.
        const headY = d.y;
        if (headY > horizon + 2) continue;
        const mHeadY = 2 * horizon - headY;
        const mTailY = 2 * horizon - tailY;
        const depth = Math.max(0, mHeadY - horizon);
        const wave = Math.sin(elapsed * 1.7 + depth * 0.055 + d.x * 0.01) * depth * 0.09;

        const color = hueOf(d.hue);
        ctx.strokeStyle = withAlpha(color, 0.3 * env.ambience);
        ctx.lineWidth = d.width * 0.85;
        ctx.beginPath();
        ctx.moveTo(d.x + wave, mHeadY);
        ctx.lineTo(tailX + wave * 0.4, mTailY);
        ctx.stroke();
      }

      // The horizon itself — a thin bright seam where the two halves meet.
      ctx.strokeStyle = withAlpha(palette.success, 0.16 * env.ambience);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(w, horizon);
      ctx.stroke();

      // The rain.
      for (const d of drops) {
        if (d.y < -d.len) continue;
        const tailX = d.x - SLANT_X * d.len;
        const tailY = d.y - SLANT_Y * d.len;
        const fade = Math.min(1, Math.max(0, (horizon - d.y) / (d.len * 0.9)));
        const alpha = (0.24 + 0.5 * fade) * env.ambience;
        if (alpha <= 0.01) continue;

        ctx.strokeStyle = withAlpha(hueOf(d.hue), alpha);
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
    },

    dispose() {
      drops = [];
    },
  };
};
