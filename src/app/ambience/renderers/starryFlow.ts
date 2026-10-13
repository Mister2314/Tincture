/**
 * Starry flow — the real *Starry Night*, advected by a curl-noise flow field.
 *
 * The painting is not a wallpaper here, it is the **source of the motion**. Its luminance
 * is sampled into a small grid, the gradient of that grid is taken, and the flow is set
 * along the *tangent* of the gradient — which is to say, along the brushwork rather than
 * across it. A curl-noise term is layered on top to supply the swirl the still image implies
 * but cannot encode. Particles are then advected through that field and drawn as short
 * streaks, so what moves is the painting's own structure.
 *
 * The image itself is not drawn on this canvas. It is a CSS layer underneath, so the canvas
 * only carries the particles and their trails — which is what keeps this cheap: no
 * full-screen `drawImage` per frame.
 *
 * Until the image arrives the field is absent and the motion falls back to pure curl noise,
 * so the theme is never blank while a 618 KB JPEG is in flight.
 */

import { curl2, rng } from '../noise';
import { withAlpha, type AmbienceFrame, type MotifFactory } from '../types';

/** x, y, previous x, previous y, hue, speed, direction. */
const STRIDE = 7;

/** Luminance grid resolution. Big enough to hold the composition, small enough to scan once. */
const FIELD_WIDTH = 132;

export const createStarryFlow: MotifFactory = (ctx, initial) => {
  let env = initial;
  let cols = 0;
  let rows = 0;
  let field: Float32Array | null = null;
  let particles: Float32Array | null = null;
  let count = 0;
  let elapsed = 0;
  let fieldFor: HTMLImageElement | null = null;
  const swirl: [number, number] = [0, 0];

  const drawCover = (
    g: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
  ): void => {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };

  /**
   * Sample the painting into a vector field.
   *
   * `(-dy, dx)` of the luminance gradient is the direction *along* an edge — the direction
   * a brush travelled. That is the whole trick: a generic flow field would ignore the
   * painting, and a naive gradient would push particles across the strokes instead of with
   * them.
   */
  const buildField = (): void => {
    const img = env.image;
    if (!img || !img.naturalWidth) {
      field = null;
      cols = 0;
      rows = 0;
      return;
    }

    const targetW = FIELD_WIDTH;
    const targetH = Math.max(24, Math.round(FIELD_WIDTH * (env.height / Math.max(1, env.width))));
    const probe = document.createElement('canvas');
    probe.width = targetW;
    probe.height = targetH;
    const g = probe.getContext('2d', { willReadFrequently: true });
    if (!g) return;

    drawCover(g, img, targetW, targetH);

    let data: Uint8ClampedArray;
    try {
      data = g.getImageData(0, 0, targetW, targetH).data;
    } catch {
      // A tainted canvas is not a crash — it just means no field, and the curl fallback runs.
      field = null;
      return;
    }

    cols = targetW;
    rows = targetH;

    const lum = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i += 1) {
      const p = i * 4;
      lum[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
    }

    field = new Float32Array(cols * rows * 2);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const xm = x > 0 ? x - 1 : x;
        const xp = x < cols - 1 ? x + 1 : x;
        const ym = y > 0 ? y - 1 : y;
        const yp = y < rows - 1 ? y + 1 : y;

        const gx = lum[y * cols + xp] - lum[y * cols + xm];
        const gy = lum[yp * cols + x] - lum[ym * cols + x];

        const vx = -gy;
        const vy = gx;
        const magnitude = Math.hypot(vx, vy) || 1;
        // Flat paint barely moves; a hard edge carries the particle. Without this the whole
        // sky drifts at one speed and the composition disappears.
        const strength = Math.min(1, magnitude * 6);

        const o = (y * cols + x) * 2;
        field[o] = (vx / magnitude) * strength;
        field[o + 1] = (vy / magnitude) * strength;
      }
    }

    fieldFor = img;
  };

  const rebuild = (): void => {
    const r = rng((env.seed || 1) * 2654435761 + 5);
    count = Math.round(420 + env.density * 900);
    particles = new Float32Array(count * STRIDE);

    for (let i = 0; i < count; i += 1) {
      const o = i * STRIDE;
      const x = r.next() * env.width;
      const y = r.next() * env.height;
      particles[o] = x;
      particles[o + 1] = y;
      particles[o + 2] = x;
      particles[o + 3] = y;
      particles[o + 4] = r.next();
      particles[o + 5] = r.range(0.7, 1.6);
      particles[o + 6] = r.range(0, Math.PI * 2);
    }

    if (env.image && env.image !== fieldFor) buildField();
    else if (!env.image) field = null;

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

      // Trails: erase a slice of alpha instead of painting a background, so the painting
      // underneath stays visible and the particles glow over it.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = f.animate ? 0.085 : 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      const p = particles;
      if (!p) return;

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (let i = 0; i < count; i += 1) {
        const o = i * STRIDE;
        let x = p[o];
        let y = p[o + 1];
        const hue = p[o + 4];
        const dir = p[o + 6];

        let tailX: number;
        let tailY: number;

        if (f.animate) {
          let fvx = 0;
          let fvy = 0;

          if (field && cols > 1 && rows > 1) {
            const u = (x / w) * (cols - 1);
            const v = (y / h) * (rows - 1);
            const x0 = Math.max(0, Math.min(cols - 1, Math.floor(u)));
            const y0 = Math.max(0, Math.min(rows - 1, Math.floor(v)));
            const x1 = Math.min(cols - 1, x0 + 1);
            const y1 = Math.min(rows - 1, y0 + 1);
            const fx = u - x0;
            const fy = v - y0;

            const i00 = (y0 * cols + x0) * 2;
            const i10 = (y0 * cols + x1) * 2;
            const i01 = (y1 * cols + x0) * 2;
            const i11 = (y1 * cols + x1) * 2;

            fvx =
              (field[i00] * (1 - fx) + field[i10] * fx) * (1 - fy) +
              (field[i01] * (1 - fx) + field[i11] * fx) * fy;
            fvy =
              (field[i00 + 1] * (1 - fx) + field[i10 + 1] * fx) * (1 - fy) +
              (field[i01 + 1] * (1 - fx) + field[i11 + 1] * fx) * fy;
          }

          curl2(x * 0.0042, y * 0.0042, env.seed || 1, swirl);

          const speed = p[o + 5];
          x += (fvx * 42 + swirl[0] * 30) * dt * speed;
          y += (fvy * 42 + swirl[1] * 30) * dt * speed;

          let wrapped = false;
          if (x < -12) {
            x += w + 24;
            wrapped = true;
          } else if (x > w + 12) {
            x -= w + 24;
            wrapped = true;
          }
          if (y < -12) {
            y += h + 24;
            wrapped = true;
          } else if (y > h + 12) {
            y -= h + 24;
            wrapped = true;
          }

          // A wrapped particle must not draw a streak across the whole screen.
          tailX = wrapped ? x : p[o + 2];
          tailY = wrapped ? y : p[o + 3];

          p[o] = x;
          p[o + 1] = y;
          p[o + 2] = x;
          p[o + 3] = y;
        } else {
          // Reduced motion: the field freezes into a still of itself — short strokes along
          // each particle's seeded direction, not an empty sky.
          const len = 3 + p[o + 5] * 6;
          tailX = x + Math.cos(dir) * len;
          tailY = y + Math.sin(dir) * len;
        }

        const color =
          hue > 0.86 ? palette.accent : hue > 0.45 ? palette.accentHover : palette.bgElevated;

        ctx.strokeStyle = withAlpha(color, 0.32 * env.ambience);
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
    },

    dispose() {
      particles = null;
      field = null;
      fieldFor = null;
    },
  };
};
