/**
 * UI primitives.
 *
 * Small, unstyled-by-default components that read their appearance entirely from the theme
 * tokens in `styles/app.css`. Nothing here knows what a theme is; nothing here can be
 * reached by theme data.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { AnimatePresence, m } from 'motion/react';

import { EASE_OUT } from '../app/motion';

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'icon';
};

export function Button({ variant = 'default', size = 'md', className = '', ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button type="button" className={classes} {...rest} />;
}

/* ------------------------------------------------------------------ *
 * Field
 * ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Select
 * ------------------------------------------------------------------ */

/**
 * A `<select>` with a chevron we drew.
 *
 * The native arrow cannot be styled, and it cannot be recoloured either — a `background-image`
 * chevron would need a hard-coded colour, which would be wrong in half the themes. Drawing it
 * on a wrapper's pseudo-element from `border` + `transform` means it is two token-driven
 * lines, and it inherits the theme like everything else.
 */
export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <span className="select-wrap">
      <select className={`select ${className}`.trim()} {...rest}>
        {children}
      </select>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Switch
 * ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="visually-hidden"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__text">
        <span className="switch__title">{title}</span>
        {description ? <span className="switch__desc">{description}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

/**
 * The focusable set, in document order. Kept deliberately small: this is only used to
 * decide where Tab wraps, so a missing exotic selector degrades to "Tab escapes", which is
 * what happened before the trap existed.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({
  open,
  onClose,
  title,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `wide` is for dialogs that are a workspace rather than a question — the theme builder. */
  size?: 'md' | 'wide';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const node = ref.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? node.contains(active) : false;

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);

    /*
      `aria-modal="true"` is a promise that nothing outside the dialog is reachable, and a
      Tab trap alone does not keep it — the content behind is still in the accessibility
      tree and still clickable. So every sibling along the ancestor chain, from the dialog
      out to `<body>`, is marked `inert` for as long as the dialog is open. A dialog cannot
      be portalled to `<body>` here without restructuring how views mount, and `inert` on
      the siblings gets the same result with none of that.
    */
    const inerted: HTMLElement[] = [];
    const node = ref.current;
    let cursor: HTMLElement | null = node?.parentElement ?? null;
    while (node && cursor && cursor !== document.body) {
      for (const sibling of Array.from(cursor.children)) {
        if (sibling === node || sibling.contains(node)) continue;
        if (sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '');
          inerted.push(sibling);
        }
      }
      cursor = cursor.parentElement;
    }

    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      for (const el of inerted) el.removeAttribute('inert');
      previous?.focus?.();
    };
  }, [open, onClose]);

  /*
    The dialog stays mounted through its exit animation, which is why this is
    `AnimatePresence` rather than an early `return null`. A modal that vanishes instantly
    reads as a page reload; one that shrinks away reads as a thing you closed.

    The body is its own scroll container. That is not a detail: the theme builder needs a
    `position: sticky` preview, and a sticky element can only stick inside the box that
    scrolls. Scrolling the dialog itself would leave the preview with nowhere to stick.
  */
  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <m.div
            className={size === 'wide' ? 'dialog dialog--wide' : 'dialog'}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            ref={ref}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
          >
            <div className="dialog__head">
              <h2 className="dialog__title">{title}</h2>
              <button
                type="button"
                className="dialog__close"
                aria-label="Close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
            <div className="dialog__body">{children}</div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

type Toast = { id: number; message: string; tone: 'info' | 'success' | 'error' };

type ToastApi = {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = (nextId.current += 1);
    setToasts((prev) => [...prev, { id, message, tone }].slice(-3));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      info: (m) => push(m, 'info'),
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        One live region, not two. The container announces; the toasts inside it are plain
        nodes. Giving each toast `role="status"` as well nested a live region inside a live
        region, which reads the message twice in most screen readers.
      */}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p>{body}</p>
    </div>
  );
}

export function ViewHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="view-header">
      <div>
        <h1 className="view-title">{title}</h1>
        {subtitle ? <p className="view-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}
