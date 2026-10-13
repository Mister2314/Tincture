/**
 * The renderer table.
 *
 * A motif name that is absent from here is not an error — it falls back to `none` (see
 * `kindOf` in `../types`). That is deliberate: a build that predates a motif still has to
 * paint a theme that names it, so the failure mode is "no background", never a throw.
 */

import type { Motif } from '../../../theme/schema';
import type { MotifFactory } from '../types';
import { createFrostGrowth } from './frostGrowth';
import { createHearth } from './hearth';
import { createNeonRain } from './neonRain';
import { createSakuraTree } from './sakuraTree';
import { createStarryFlow } from './starryFlow';

/** Motifs that need the canvas. */
export const CANVAS_RENDERERS: Partial<Record<Motif, MotifFactory>> = {
  'starry-flow': createStarryFlow,
  hearth: createHearth,
  'neon-rain': createNeonRain,
  'sakura-tree': createSakuraTree,
  'frost-growth': createFrostGrowth,
};

export const rendererFor = (motif: Motif): MotifFactory | null => CANVAS_RENDERERS[motif] ?? null;
