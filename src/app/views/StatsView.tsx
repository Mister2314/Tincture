import { computeStats, formatFocusTime } from '../stats/compute';
import { useStore } from '../state/store';
import { EmptyState, ViewHeader } from '../../ui/primitives';

export function StatsView() {
  const { state, now } = useStore();
  const stats = computeStats(state.sessions, now);

  const goal = state.settings.dailyGoal;
  const goalPct = Math.min(100, Math.round((stats.todayFocusSessions / goal) * 100));
  const peak = Math.max(1, ...stats.recent.map((d) => d.focusSessions));

  return (
    <section aria-labelledby="stats-heading">
      <ViewHeader
        title="Statistics"
        subtitle="Kept on this device only. Nothing leaves the browser."
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
        <div className="stat">
          <div className="stat__value">{stats.todayFocusSessions}</div>
          <div className="stat__label">
            Today · goal {goal} ({goalPct}%)
          </div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatFocusTime(stats.todayFocusMs)}</div>
          <div className="stat__label">Focused today</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.streak}</div>
          <div className="stat__label">
            Day streak · best {stats.bestStreak}
          </div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totalFocusSessions}</div>
          <div className="stat__label">
            All time · {formatFocusTime(stats.totalFocusMs)}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 'var(--t-dimension-space-xs)' }}>Last 14 days</h2>
        <p className="subtle" style={{ fontSize: 12.5 }}>
          {stats.averagePerActiveDay === 0
            ? 'No sessions recorded yet.'
            : `${stats.averagePerActiveDay} focus sessions per active day on average.`}
        </p>

        {stats.totalFocusSessions === 0 ? (
          <EmptyState
            title="Nothing to chart yet"
            body="Finish a focus session and this fills in."
          />
        ) : (
          <>
            {/*
              Each bar carries its own name. The container used to be the only thing with an
              accessible label, and it said "Focus sessions per day, last 14 days" — no
              numbers. So the chart reached neither a screen reader nor a touch user, since
              a `title` needs a pointer to appear.
            */}
            <div className="chart" role="group" aria-label="Focus sessions per day, last 14 days">
              {stats.recent.map((day, index) => (
                <div
                  key={day.date}
                  className="chart__bar"
                  data-today={index === stats.recent.length - 1}
                  role="img"
                  aria-label={`${day.date}: ${day.focusSessions} focus session${day.focusSessions === 1 ? '' : 's'}`}
                  style={{ height: `${Math.max(2, (day.focusSessions / peak) * 100)}%` }}
                  title={`${day.date}: ${day.focusSessions} session${day.focusSessions === 1 ? '' : 's'}`}
                />
              ))}
            </div>
            <div className="chart__axis">
              <span>{stats.recent[0]?.date.slice(5)}</span>
              <span>today</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
