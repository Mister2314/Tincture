/**
 * The app's motion vocabulary.
 *
 * One page transition, used by every view, defined here so there is exactly one place to
 * change it. The curves are the same three the stylesheet names as tokens — a JS animation
 * and a CSS animation that disagree about easing is the kind of detail nobody can name but
 * everybody can feel.
 */

/** Mirrors `--t-ease-out`. Decelerating: fast to leave, soft to arrive. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Mirrors `--t-ease-in`. Accelerating: used for exits, which should feel like letting go. */
export const EASE_IN: [number, number, number, number] = [0.55, 0, 1, 0.45];

/** Mirrors `--t-ease-in-out`. For anything that both starts and stops on screen. */
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

/**
 * A spring that settles without overshooting.
 *
 * Overshoot is the tell of a default spring: it reads as "bouncy" on a row that has no
 * reason to bounce. Damping is high enough that the movement is felt but never seen twice.
 */
export const SETTLE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } as const;

/** A lighter spring, for small things: a checkmark, a pill, a chip. */
export const TAP = { type: 'spring', stiffness: 700, damping: 34, mass: 0.5 } as const;
