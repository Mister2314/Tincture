/**
 * The phase-end tone.
 *
 * Synthesised with the Web Audio API rather than shipped as a file: an audio asset is a
 * download, a cache entry and a licence question for something that is two sine waves. The
 * context is created lazily on the first phase end — a browser will not start one before a
 * user gesture anyway, and a user who never finishes a session never pays for it.
 *
 * Every failure path returns silently. Audio is a nicety; it must never be able to break
 * the timer, and an autoplay policy refusing to start is a normal outcome, not an error.
 */

type Tone = 'focus' | 'break';

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Two short notes: rising when a break begins, falling when it ends. The direction is the
 * only information the tone carries, so the two are deliberately not the same sound.
 */
export function playPhaseTone(ended: Tone): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.02;
    const notes = ended === 'focus' ? [660, 880] : [880, 660];

    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * 0.17;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.085, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    });
  } catch {
    /* no audio, no problem */
  }
}
