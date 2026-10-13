/**
 * A file input that looks like it belongs to the app.
 *
 * `<input type="file">` cannot be styled past its border: the button inside it, its label
 * and its layout are the browser's, and they follow the operating system rather than the
 * theme. Dropping a native control into a themed dialog is how an app ends up looking
 * assembled from two different products — which is exactly how it looked here.
 *
 * So the input is kept, and hidden. It stays the accessible control: the whole drop zone is
 * its `<label>`, so a click anywhere opens the picker and the focus ring lands on the zone
 * via `:focus-within`. One focusable element, no keyboard trap, and the browser still does
 * the file handling — which is the part that must not be reimplemented.
 */

import { useRef, useState, type DragEvent, type ReactNode } from 'react';

export function FileDrop({
  accept,
  onFile,
  title,
  hint,
  icon,
}: {
  accept: string;
  onFile: (file: File) => void;
  title: string;
  hint: string;
  icon?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer?.files?.[0]);
  };

  return (
    <label
      className="dropzone"
      data-over={over}
      onDragOver={(event) => {
        // Without this the browser navigates to the dropped file instead of firing `drop`.
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="dropzone__input"
        accept={accept}
        onChange={(event) => take(event.target.files?.[0])}
      />

      <span className="dropzone__icon" aria-hidden="true">
        {icon}
      </span>

      <span className="dropzone__title">{name ?? title}</span>
      <span className="dropzone__hint">{name ? 'Selected — press Import to apply it.' : hint}</span>
    </label>
  );
}
