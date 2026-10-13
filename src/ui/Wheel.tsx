/**
 * Wheel picker.
 *
 * A number you choose by scrolling, not by typing. The app used `<input type="number">`
 * before, whose desktop spinner arrows are easy to mis-click and look like a form control
 * from 2009.
 *
 * The wheel itself is `@ncdai/react-wheel-picker` — unstyled, MIT, real inertia, real
 * keyboard handling. Everything you can see is ours: the value button, the sheet, the
 * highlight band, the type. The library owns the physics; the theme owns the appearance.
 *
 * Two behaviours worth stating, because they are choices:
 *
 * 1. **The value is committed on Done, not on scroll.** A wheel that writes through on every
 *    tick makes "did that save?" unanswerable, and it makes Cancel a lie. Cancel here really
 *    does nothing.
 * 2. **The picker does not read `prefers-reduced-motion`.** The package has no support for
 *    it, so the flattening lives in `styles/app.css` next to the rest of the wheel styling.
 */

import { useEffect, useId, useMemo, useState } from 'react';

import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from '@ncdai/react-wheel-picker';

/*
  The package ships its own stylesheet and does not import it for you. Without this line
  nothing about the wheel is laid out: `[data-rwp-options]` never becomes `position: absolute`,
  so the options stack in normal flow — 190 of them at 44px each is an 8360px column — the
  highlight band is pushed thousands of pixels down, and the wheel renders as an empty box.

  It is a one-line omission that produces no error and no warning. It was found by taking a
  screenshot, which is the only thing that would have found it: every measurement I had taken
  up to that point was consistent with a working wheel, because the DOM was all there.
*/
import '@ncdai/react-wheel-picker/style.css';

import { Button, Dialog } from './primitives';

/** Must match the `--wheel-item-height` used in `styles/app.css`. */
const ITEM_HEIGHT = 44;
/** The library requires a multiple of 4. Twenty shows five above and five below. */
const VISIBLE_COUNT = 20;

type WheelProps = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  /** Describes the wheel to a screen reader. The visible label is not enough on its own. */
  label: string;
};

/**
 * One wheel. Scrolls, snaps, loops.
 *
 * `infinite` is on because the alternative — a hard stop at 1 and at 180 — makes the common
 * values in the middle of the range annoying to reach.
 */
export function Wheel({ value, onChange, min, max, label }: WheelProps) {
  const options = useMemo<WheelPickerOption<number>[]>(() => {
    const out: WheelPickerOption<number>[] = [];
    for (let n = min; n <= max; n += 1) {
      out.push({ value: n, label: String(n), textValue: String(n) });
    }
    return out;
  }, [min, max]);

  return (
    <WheelPickerWrapper className="wheel">
      <WheelPicker
        value={value}
        onValueChange={(next) => onChange(Number(next))}
        options={options}
        infinite
        visibleCount={VISIBLE_COUNT}
        optionItemHeight={ITEM_HEIGHT}
        dragSensitivity={12}
        scrollSensitivity={12}
      />
      <span className="visually-hidden">{label}</span>
    </WheelPickerWrapper>
  );
}

/* ------------------------------------------------------------------ *
 * The field: a value button that opens the wheel
 * ------------------------------------------------------------------ */

/**
 * A labelled row that shows the current value and opens the wheel when pressed.
 *
 * The trigger is deliberately a button showing the value, not a fake text input. Nothing
 * here pretends to be typeable, so nobody tries to type into it.
 */
export function WheelField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  unit,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const labelId = `${useId()}-label`;

  // Reopening must start from what is actually set, not from a draft left over from a
  // cancelled edit.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const commit = () => {
    if (draft !== value) onChange(draft);
    setOpen(false);
  };

  return (
    <div className="field">
      <span className="field__label" id={labelId}>
        {label}
      </span>

      <button
        type="button"
        className="value-pill"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen(true)}
      >
        <span className="value-pill__value">{value}</span>
        {unit ? <span className="value-pill__unit">{unit}</span> : null}
      </button>

      {hint ? <span className="field__hint">{hint}</span> : null}

      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <Wheel value={draft} onChange={setDraft} min={min} max={max} label={label} />

        <div className="row row--between dialog__actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={commit}>
            Done
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
