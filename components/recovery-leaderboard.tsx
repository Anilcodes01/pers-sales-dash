import {
  dailyRecovery,
  summarizeRecovery,
  recoveryLeaderboard,
  type RecoverySummaryRow,
} from "@/lib/recovery/summary";
import { RecoveryStatusBadge } from "./recovery-status-badge";
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
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
export type RecoveryStatisticsData = { summary: ReturnType<typeof summarizeRecovery>; leaders: ReturnType<typeof recoveryLeaderboard>; daily: ReturnType<typeof dailyRecovery>; unassigned: ReturnType<typeof summarizeRecovery>; months: string[] };
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
  const dailyMax = Math.max(1, ...daily.days.map((day) => day.recoveredPaise));
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
          ...(!individual
            ? [["Overall recovered", money(summary.recoveredPaise)]]
            : []),
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
    
         
          {daily.undated > 0 && (
            <p className="recovery-metric-note">
              {daily.undated} paid students have no recorded recovery date and
              are excluded from the daily chart.
            </p>
          )}
          {!daily.days.length ? (
            <p>No dated recoveries recorded for this selection yet.</p>
          ) : (
            <div className="daily-recovery-rows">
              {daily.days.map((day) => (
                <div className="daily-recovery-row" key={day.date}>
                  <strong>{day.date}</strong>
                  <div
                    className="daily-amount-bar"
                    title={`${money(day.recoveredPaise)} recovered`}
                  >
                    <span
                      style={{
                        width: `${(day.recoveredPaise / dailyMax) * 100}%`,
                      }}
                    />
                  </div>
                  <span>{money(day.recoveredPaise)}</span>
                  <span>
                    {day.paid} paid · {percentage(day.recoveryPercentage)}
                  </span>
                  <RecoveryProgress
                    value={day.recoveryPercentage}
                    label={`${day.date} recovery rate`}
                  />
                  {day.excludedAmounts > 0 && (
                    <small>
                      {day.excludedAmounts} unreadable amounts excluded
                    </small>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {!individual && (
        <>
          <h2 className="recovery-leaderboard-title">Executive leaderboard</h2>
          <div className="recovery-leaderboard-scroll">
            <table className="recovery-leaderboard-table">
              <thead>
                <tr>
                  {[
                    "Rank",
                    "Executive",
                    "Recovered",
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
              <tbody>
                {leaders.map((person, index) => (
                  <tr key={person.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>
                      {money(person.recoveredPaise)}
                      {person.excludedAmounts > 0 && (
                        <small>
                          {person.excludedAmounts} unreadable amounts
                        </small>
                      )}
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
                ))}
              </tbody>
            </table>
          </div>
          {!leaders.length && <p>No recovery executives found.</p>}
          {unassigned.total > 0 && (
            <details className="recovery-status-summary">
              <summary>
                Unassigned students ({unassigned.total}) ·{" "}
                {money(unassigned.recoveredPaise)} recovered
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
