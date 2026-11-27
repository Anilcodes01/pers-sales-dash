"use client";
import { VirtualTableBody } from "./virtual-table-body";
import {
  dailyRecovery,
  summarizeRecovery,
  recoveryLeaderboard,
  type RecoverySummaryRow,
} from "@/lib/recovery/summary";
import { RecoveryStatusBadge } from "./recovery-status-badge";
const percentage = (value: number) => `${value.toFixed(1)}%`;
function RecoveryProgress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="recovery-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(value.toFixed(1))}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
function StatusCounts({ statuses }: { statuses: Record<string, number> }) {
  return (
    <div className="recovery-status-counts">
      {Object.entries(statuses).map(([status, count]) => (
        <span key={status}>
          <RecoveryStatusBadge field="leadStatus" value={status} />
          <strong>{count}</strong>
        </span>
      ))}
    </div>
  );
}
export type RecoveryStatisticsData = { summary: ReturnType<typeof summarizeRecovery>; leaders: ReturnType<typeof recoveryLeaderboard>; daily: ReturnType<typeof dailyRecovery>; unassigned: ReturnType<typeof summarizeRecovery>; months: string[]; period?: { startedAt: string; endedAt: string | null } | null };
export function RecoveryLeaderboard({
  rows = [],
  executives = [],
  individual = false,
  statistics,
}: {
  rows?: RecoverySummaryRow[];
  statistics?: RecoveryStatisticsData;
  executives?: { id: string; name: string; email: string }[];
  individual?: boolean;
}) {
  const summary = statistics?.summary ?? summarizeRecovery(rows);
  const leaders = statistics?.leaders ?? (individual ? [] : recoveryLeaderboard(rows, executives));
  const daily = statistics?.daily ?? dailyRecovery(rows);
  const unassigned = statistics?.unassigned ?? summarizeRecovery(rows.filter((row) => !row.assignedTo));
  return (
    <section
      className="recovery-results"
      aria-label={
        individual ? "My recovery performance" : "Recovery leaderboard"
      }
    >
      <div className="recovery-stat-cards">
        {[
          ["Recovery %", percentage(summary.recoveryPercentage)],
          ["Students", summary.total],
          ["Paid", summary.paid],
          ["Unpaid", summary.unpaid],
          ["Default", summary.default],
          ...(summary.otherPayment
            ? [["Other / no payment status", summary.otherPayment]]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            {label === "Recovery %" && (
              <RecoveryProgress
                value={summary.recoveryPercentage}
                label="Overall recovery percentage"
              />
            )}
          </div>
        ))}
      </div>
     
      {!individual && (
        <section className="daily-recovery">
          <h2>Cumulative recovery</h2>
          {statistics?.period && <p className="recovery-metric-note">{new Date(statistics.period.startedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} – {statistics.period.endedAt ? new Date(statistics.period.endedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "Today (active)"} · Paid during this period ÷ students in the selected batch</p>}
    
         
          {daily.undated > 0 && (
            <p className="recovery-metric-note">
              {daily.undated} paid students have no recorded recovery date and
              are excluded from the daily chart.
            </p>
          )}
          {daily.days.length > 0 && <div className="recovery-pie-legend"><span><i className="recovery-pie-previous"/>Recovered before this day</span><span><i className="recovery-pie-today"/>Recovered this day</span><span><i className="recovery-pie-remaining"/>Remaining in selected batch</span></div>}
          {!daily.days.length ? (
            <p>No recovery period recorded yet. Use Start recovery in the navbar to begin.</p>
          ) : (
            <div className="daily-recovery-charts">
              {daily.days.map((day) => {
                const today = summary.total ? day.paid / summary.total * 100 : 0;
                const previous = Math.max(0, day.recoveryPercentage - today);
                const dateLabel = new Date(`${day.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
                return <figure className="daily-recovery-chart" key={day.date}>
                  <figcaption>{dateLabel}</figcaption>
                  <svg viewBox="0 0 120 120" role="img" aria-label={`${dateLabel}: ${percentage(day.recoveryPercentage)} cumulative recovery, ${day.paid} paid today, ${day.cumulativePaid} paid during the period out of ${summary.total} students`}>
                    <title>{dateLabel}: {day.cumulativePaid} of {summary.total} recovered</title>
                    <g transform="rotate(-90 60 60)" fill="none" strokeWidth="12">
                      <circle cx="60" cy="60" r="46" className="recovery-pie-remaining"/>
                      <circle cx="60" cy="60" r="46" pathLength="100" className="recovery-pie-previous" strokeDasharray={`${previous} ${100 - previous}`}/>
                      <circle cx="60" cy="60" r="46" pathLength="100" className="recovery-pie-today" strokeDasharray={`${today} ${100 - today}`} strokeDashoffset={-previous}/>
                    </g>
                    <text x="60" y="58" textAnchor="middle" className="recovery-pie-value">{percentage(day.recoveryPercentage)}</text>
                    <text x="60" y="75" textAnchor="middle" className="recovery-pie-label">cumulative</text>
                  </svg>
                  <strong>{day.paid} paid today</strong>
                  <span>{day.cumulativePaid} / {summary.total} students recovered</span>
                </figure>;
              })}
            </div>
          )}
        </section>
      )}
      {!individual && (
        <>
          <h2 className="recovery-leaderboard-title">Executive leaderboard</h2>
          <div className="recovery-leaderboard-scroll virtual-table-scroll" data-virtual-scroll>
            <table className="recovery-leaderboard-table">
              <thead>
                <tr>
                  {[
                    "Rank",
                    "Executive",
                    "Recovery %",
                    "Students",
                    "Paid",
                    "Unpaid",
                    "Default",
                    "Called",
                    "Not answered",
                    "Affirmed",
                    "All statuses",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <VirtualTableBody rows={leaders} columns={11} rowKey={person => person.id}>
                {(person, index) => (
                  <tr key={person.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>
                      {percentage(person.recoveryPercentage)}
                      <RecoveryProgress
                        value={person.recoveryPercentage}
                        label={`${person.name} recovery percentage`}
                      />
                    </td>
                    <td>{person.total}</td>
                    <td>{person.paid}</td>
                    <td>{person.unpaid}</td>
                    <td>{person.default}</td>
                    <td>{person.statuses.called}</td>
                    <td>{person.statuses["not answered"]}</td>
                    <td>{person.statuses.affirmed}</td>
                    <td>
                      <details>
                        <summary>View breakdown</summary>
                        <StatusCounts statuses={person.statuses} />
                      </details>
                    </td>
                  </tr>
                )}
              </VirtualTableBody>
            </table>
          </div>
          {!leaders.length && <p>No recovery executives found.</p>}
          {unassigned.total > 0 && (
            <details className="recovery-status-summary">
              <summary>
                Unassigned students ({unassigned.total})
              </summary>
              <StatusCounts statuses={unassigned.statuses} />
            </details>
          )}
        </>
      )}
      <details className="recovery-status-summary" open>
        <summary>
          {individual ? "My lead statuses" : "Overall lead statuses"}
        </summary>
        <StatusCounts statuses={summary.statuses} />
      </details>

    </section>
  );
}
