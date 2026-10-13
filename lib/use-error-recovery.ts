"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Browser wording for a request/stream that was cut off: Chrome "network
// error" / "Failed to fetch", Safari "Load failed", Firefox "NetworkError
// when attempting to fetch resource", plus Next's own chunk-load failures.
const NETWORK_ERROR_RE =
  /network ?error|failed to fetch|load failed|fetch failed|networkerror|connection (closed|reset)|loading chunk .* failed|chunkloaderror/i;

export function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return NETWORK_ERROR_RE.test(msg);
}

const MAX_AUTO_RETRIES = 3;

// Module-level so the count survives the boundary remounting between attempts
// (each failed retry renders a fresh error screen). Forgotten after a quiet
// minute so a later, unrelated blip gets its own retries.
let autoAttempts = 0;
let lastAttemptAt = 0;

/**
 * For a route error boundary. `retry` re-fetches the server data before
 * resetting — plain `reset()` re-renders the same failed tree, so it tends to
 * fail again. If the error was a dropped connection, it also retries
 * automatically (once the browser is online and the tab is visible), up to a
 * few times, so a Wi-Fi blip doesn't strand the user on an error screen.
 */
export function useErrorRecovery(error: Error, reset: () => void) {
  const router = useRouter();
  const network = isNetworkError(error);
  const [autoRetrying, setAutoRetrying] = useState(network);

  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [router, reset]);

  useEffect(() => {
    if (!network) return;
    if (Date.now() - lastAttemptAt > 60_000) autoAttempts = 0;
    if (autoAttempts >= MAX_AUTO_RETRIES) {
      setAutoRetrying(false);
      return;
    }
    setAutoRetrying(true);
    let timer: number | undefined;
    const attempt = () => {
      window.clearTimeout(timer);
      if (navigator.onLine === false || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        autoAttempts += 1;
        lastAttemptAt = Date.now();
        retry();
      }, 1500 * (autoAttempts + 1));
    };
    attempt();
    window.addEventListener("online", attempt);
    document.addEventListener("visibilitychange", attempt);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", attempt);
      document.removeEventListener("visibilitychange", attempt);
    };
  }, [error, network, retry]);

  return { retry, isNetwork: network, autoRetrying };
}
