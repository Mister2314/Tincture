/**
 * Tasks.
 *
 * The composer is one panel, not a row of three form controls. It reads top to bottom the
 * way the thought arrives — *what* you are working on, then *how long* — and the two are
 * separated by a hairline rather than by a grid gap, so it looks like one object instead of
 * three things that happen to be adjacent.
 *
 * Three deliberate details:
 *
 * 1. **The panel responds to focus, not to hover.** `:focus-within` lifts it, colours the
 *    border and turns the mark a quarter turn. Hover states on a form are decoration; focus
 *    is the state that actually means something.
 * 2. **The Add button wakes up when it becomes usable.** It sits at 0.94 scale until there
 *    is something to add, then springs to full size. That is the answer to "why is nothing
 *    happening?" — the button tells you it was waiting for you.
 * 3. **The active task is a tint and a dot, never a coloured bar down the left edge.** A
 *    coloured inset bar is the most recognisable generated-UI tell there is, and in the
 *    default theme the accent is amber, so it read as a stray smudge.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, m } from 'motion/react';

import { TAP } from '../motion';
import { Button, EmptyState, ViewHeader } from '../../ui/primitives';
import { WheelField } from '../../ui/Wheel';
import { useStore } from '../state/store';
import type { Task } from '../state/persistence';

/** How long a freshly added row stays highlighted. Long enough to catch the eye, short
 *  enough that it is gone before you start working. */
const NEW_ROW_MS = 1600;

function TaskRow({ task, active, isNew, onSettled }: {
  task: Task;
  active: boolean;
  isNew: boolean;
  onSettled: () => void;
}) {
  const { dispatch } = useStore();
  const [lit, setLit] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;
    const timer = window.setTimeout(() => {
      setLit(false);
      onSettled();
    }, NEW_ROW_MS);
    return () => window.clearTimeout(timer);
  }, [isNew, onSettled]);

  const progress = task.estimate > 0 ? Math.min(1, task.done / task.estimate) : 0;

  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
      className="task"
      data-done={task.completed}
      data-active={active}
      data-new={lit}
    >
      <button
        type="button"
        className="task__check"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
        onClick={() => dispatch({ type: 'task/toggle', id: task.id })}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <m.path
            d="M2.6 6.2 4.9 8.4 9.4 3.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: task.completed ? 1 : 0, opacity: task.completed ? 1 : 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </button>

      <button
        type="button"
        className="task__body"
        aria-pressed={active}
        onClick={() =>
          dispatch({ type: 'task/setActive', id: active ? null : task.id })
        }
      >
        <span className="task__line">
          {active ? <span className="task__dot" aria-hidden="true" /> : null}
          <span className="task__title">{task.title}</span>
        </span>

        <span className="task__progress">
          <span className="task__count">
            {task.done}
            <span className="task__count-sep">/</span>
            {task.estimate}
          </span>
          <span className="task__track" aria-hidden="true">
            <m.span
              className="task__fill"
              initial={false}
              animate={{ scaleX: progress }}
              transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            />
          </span>
        </span>
      </button>

      <span className="task__actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete "${task.title}"`}
          onClick={() => dispatch({ type: 'task/remove', id: task.id })}
        >
          ✕
        </Button>
      </span>
    </m.li>
  );
}

/* ------------------------------------------------------------------ *
 * Composer
 * ------------------------------------------------------------------ */

function Composer({
  title,
  setTitle,
  estimate,
  setEstimate,
  onSubmit,
  inputRef,
}: {
  title: string;
  setTitle: (next: string) => void;
  estimate: number;
  setEstimate: (next: number) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const ready = title.trim().length > 0;

  return (
    <form
      className="composer"
      data-ready={ready}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="composer__main">
        <span className="composer__mark" aria-hidden="true">
          <svg viewBox="0 0 12 12" focusable="false">
            <path
              d="M6 2.4v7.2M2.4 6h7.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <label className="visually-hidden" htmlFor="task-title">
          What are you working on?
        </label>
        <input
          id="task-title"
          ref={inputRef}
          className="composer__input"
          value={title}
          maxLength={160}
          placeholder="What are you working on?"
          autoComplete="off"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            // Escape empties the field. A form you cannot back out of without the mouse is
            // a form that punishes the keyboard.
            if (event.key === 'Escape' && title) {
              event.preventDefault();
              setTitle('');
            }
          }}
        />
      </div>

      <div className="composer__foot">
        <div className="composer__estimate">
          <WheelField
            label="Estimate"
            value={estimate}
            onChange={setEstimate}
            min={1}
            max={99}
            unit="pomodoros"
          />
        </div>

        {/* The button is present the whole time, so the layout never shifts; it just wakes
            up when there is something to submit. */}
        <m.div
          className="composer__submit"
          animate={{ scale: ready ? 1 : 0.94, opacity: ready ? 1 : 0.55 }}
          transition={TAP}
        >
          <Button type="submit" variant="primary" disabled={!ready}>
            Add
          </Button>
        </m.div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export function TasksView() {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState(1);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state.tasks.filter((t) => !t.completed);
  const done = state.tasks.filter((t) => t.completed);

  const add = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    dispatch({ type: 'task/add', title: trimmed, estimate });
    setTitle('');
    setEstimate(1);
    inputRef.current?.focus();

    // `task/add` builds the id, so the newest task is the one at the head of the list.
    // Reading it back from state would race the reducer; taking it after the dispatch is
    // the same value the row will be keyed by.
    setJustAdded(trimmed);
  };

  // Clear the "new" marker once the row has had its moment.
  const newest = state.tasks[0];
  const isNewest = (task: Task) => justAdded !== null && task === newest && task.title === justAdded;

  return (
    <section aria-labelledby="tasks-heading">
      <ViewHeader
        title="Tasks"
        subtitle="Give a job an estimate in pomodoros. Each focus session you finish fills one."
      />

      <Composer
        title={title}
        setTitle={setTitle}
        estimate={estimate}
        setEstimate={setEstimate}
        onSubmit={add}
        inputRef={inputRef}
      />

      {state.tasks.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tasks yet"
            body="Add one above, then tap it to make it active. Every focus session you finish fills a pomodoro."
          />
        </div>
      ) : (
        <div className="card card--flush">
          <ul className="task-list">
            <AnimatePresence initial={false}>
              {[...open, ...done].map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active={task.id === state.activeTaskId}
                  isNew={isNewest(task)}
                  onSettled={() => setJustAdded(null)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {/* The row animating in is the visual answer; this is the same answer for a screen
          reader, which cannot see it. */}
      <span className="visually-hidden" role="status">
        {justAdded ? `Task added: ${justAdded}` : ''}
      </span>
    </section>
  );
}
