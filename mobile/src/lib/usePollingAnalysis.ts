import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLLS = 30; // 約90秒でタイムアウト扱いにする

/**
 * 「pending/processingの間は一定間隔で再取得し、それ以外(completed/failed)に
 * なったら止める」というAI解析結果のポーリングを共通化するフック。
 * 画像解析(AnalysisResultScreen)と音声解析(VoiceConfirmScreen)は別エンティティ・
 * 別エンドポイントだが、待ち方のロジックは同じなのでここに一本化する。
 */
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
    // アプリがバックグラウンドに回っている間にポーリングが1回分「見送られた」ことを示す。
    // フォアグラウンド復帰時、このフラグが立っていれば即座に再開する。
    let deferredWhileBackground = false;
    pollCount.current = 0;
    setData(null);
    setTimedOut(false);
    setError(null);

    const poll = async () => {
      if (cancelled) return;
      if (AppState.currentState !== "active") {
        // バックグラウンド中はfetch自体を行わない(無駄なAPIコール・電池消費を避ける)。
        // 次のタイマーは張らず、フォアグラウンド復帰時のAppStateリスナーに再開を任せる。
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
    // fetcher/options は呼び出し側でインライン生成されがちで参照が毎回変わるため、
    // 依存配列は呼び出し側が明示的に渡す deps (analysisIdなど) だけを使う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, timedOut, error };
}
