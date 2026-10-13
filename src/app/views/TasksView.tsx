/**
 * Tasks.
 *
 * Two things were wrong here before, and both are fixed in the markup rather than patched
 * with CSS:
 *
 * 1. **The active task was marked with a 3px accent bar down the left edge.** A coloured
 *    inset bar is the single most recognisable generated-UI tell, and in the default theme
 *    the accent is amber, so it read as a stray brown smudge on the first task you created —
 *    which is exactly when the first task becomes active, because `task/add` sets
 *    `activeTaskId` when it is null. The row is now tinted and carries a dot.
 * 2. **Adding a task gave no signal at all.** The list re-rendered and that was it. The new
 *    row now enters with a short lift and keeps a highlight for a moment, so the answer to
 *    "did that work?" is visible in the place the answer belongs.
 *
 * The progress pips are gone too. Eight anonymous dots could not express "3 of 12"; the row
 * now prints the count and draws a proportional track.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';

import { Button, EmptyState, Field, ViewHeader } from '../../ui/primitives';
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

      <form
        className="card composer"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="What are you working on?" htmlFor="task-title">
          <input
            id="task-title"
            ref={inputRef}
            className="input"
            value={title}
            maxLength={160}
            placeholder="Write the introduction"
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

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

        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Add
        </Button>
      </form>

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
