import { useState } from 'react';

import { useStore } from '../state/store';
import { Button, EmptyState, Field, ViewHeader } from '../../ui/primitives';

export function TasksView() {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState(1);

  const open = state.tasks.filter((t) => !t.completed);
  const done = state.tasks.filter((t) => t.completed);

  const add = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    dispatch({ type: 'task/add', title: trimmed, estimate });
    setTitle('');
    setEstimate(1);
  };

  return (
    <section aria-labelledby="tasks-heading">
      <ViewHeader
        title="Tasks"
        subtitle="Each task carries an estimate in pomodoros. Finishing a focus session fills one."
      />

      <div className="card stack" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
        <Field label="What are you working on?" htmlFor="task-title">
          <input
            id="task-title"
            className="input"
            value={title}
            maxLength={160}
            placeholder="Write the introduction"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
        </Field>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 120 }}>
            <Field label="Estimate" htmlFor="task-estimate">
              <input
                id="task-estimate"
                className="input"
                type="number"
                min={1}
                max={99}
                value={estimate}
                onChange={(e) => setEstimate(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
              />
            </Field>
          </div>
          <Button variant="primary" onClick={add} disabled={!title.trim()}>
            Add task
          </Button>
        </div>
      </div>

      {state.tasks.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tasks yet"
            body="Add one above, then pick it as active — every focus session you finish will fill a pip."
          />
        </div>
      ) : (
        <div className="card card--flush">
          <ul className="task-list">
            {[...open, ...done].map((task) => (
              <li
                key={task.id}
                className="task"
                data-done={task.completed}
                data-active={task.id === state.activeTaskId}
              >
                <button
                  type="button"
                  className="task__check"
                  role="checkbox"
                  aria-checked={task.completed}
                  aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
                  onClick={() => dispatch({ type: 'task/toggle', id: task.id })}
                >
                  {task.completed ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        fill="none"
                        stroke="var(--t-color-accent-text)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>

                <button
                  type="button"
                  className="task__title"
                  style={{ background: 'none', textAlign: 'left' }}
                  onClick={() =>
                    dispatch({
                      type: 'task/setActive',
                      id: task.id === state.activeTaskId ? null : task.id,
                    })
                  }
                  title={task.id === state.activeTaskId ? 'Clear active task' : 'Make active'}
                >
                  {task.title}
                </button>

                <span className="task__pips" aria-label={`${task.done} of ${task.estimate} pomodoros`}>
                  {Array.from({ length: Math.min(task.estimate, 8) }, (_, i) => (
                    <span key={i} className="pip" data-filled={i < task.done} />
                  ))}
                </span>

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
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
