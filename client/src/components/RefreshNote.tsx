import { useRefreshStatus } from "../api/hooks";
import { fmtWhen } from "../lib/format";

// When Nexon's rankings were last checked (every 4 hours, by the always-on app), or what went wrong.
export function RefreshNote() {
  const { data } = useRefreshStatus();
  if (!data) return null;
  const last = data.last;
  if (!last) return <span className="updated muted small">Not checked yet: the always-on app checks Nexon every 4 hours.</span>;
  const when = fmtWhen(new Date(last.startedAt), new Date());
  if (last.problem) {
    return (
      <span className="updated error small" role="status">
        Last check ({when}) had a problem: {last.problem}
      </span>
    );
  }
  return <span className="updated muted small">Checked Nexon {when}</span>;
}
