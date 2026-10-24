import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

// The time now, every second. When the earliest of `resets` passes, `queryKey` is loaded again
// (its ticks clear). If this computer's clock is ahead of the server's, the answer can still have
// the old period: then it's asked again every 10 seconds (not every second) until the reset moves.
export function useResetClock(queryKey: QueryKey, resets: Date[]) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const next = Math.min(...resets.map((r) => r.getTime()));
  const asked = useRef({ reset: 0, at: 0 });
  const key = JSON.stringify(queryKey);
  useEffect(() => {
    const timer = setInterval(() => {
      const t = new Date();
      if (t.getTime() >= next && (asked.current.reset !== next || t.getTime() - asked.current.at >= 10_000)) {
        asked.current = { reset: next, at: t.getTime() };
        void qc.invalidateQueries({ queryKey: JSON.parse(key) as QueryKey });
      }
      setNow(t);
    }, 1000);
    return () => clearInterval(timer);
  }, [next, key, qc]);
  return now;
}
