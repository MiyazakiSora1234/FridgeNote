import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLLS = 30;

export function usePollingAnalysis<T extends { status: string }>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: { intervalMs?: number; maxPolls?: number },
): { data: T | null; timedOut: boolean; error: unknown } {
  const [data, setData] = useState<T | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pollCount = useRef(0);
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxPolls = options?.maxPolls ?? DEFAULT_MAX_POLLS;

  useEffect(() => {
    let cancelled = false;
    let deferredWhileBackground = false;
    pollCount.current = 0;
    setData(null);
    setTimedOut(false);
    setError(null);

    const poll = async () => {
      if (cancelled) return;
      if (AppState.currentState !== "active") {
        // バックグラウンド中は無駄なAPIコールを避け、フォアグラウンド復帰時に再開する。
        deferredWhileBackground = true;
        return;
      }
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        if (result.status === "pending" || result.status === "processing") {
          pollCount.current += 1;
          if (pollCount.current >= maxPolls) {
            setTimedOut(true);
            return;
          }
          setTimeout(poll, intervalMs);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    };

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && deferredWhileBackground && !cancelled) {
        deferredWhileBackground = false;
        poll();
      }
    });

    poll();
    return () => {
      cancelled = true;
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, timedOut, error };
}
