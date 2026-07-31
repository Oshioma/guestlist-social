"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Phones and small tablets. Above this the desktop layout is untouched.
export const NARROW_BREAKPOINT = 820;

/**
 * True once mounted on a viewport narrower than the breakpoint. Starts false so
 * the first client render matches the server's and hydration stays clean.
 */
export function useIsNarrow(breakpoint = NARROW_BREAKPOINT): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);
  return isNarrow;
}

/** Short confirmation buzz. No-op wherever the Vibration API isn't supported. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(pattern);
  } catch {
    // Some browsers throw when the page isn't user-activated yet.
  }
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export type Toast = { id: number; message: string; tone: "info" | "error" };

let toastSeq = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: "info" | "error" = "info") => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      const timer = setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        tone === "error" ? 5200 : 2600
      );
      timers.current.push(timer);
    },
    []
  );

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  return { toasts, notify, dismiss };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={t.tone === "error" ? "toast toast-error" : "toast"}
          style={{ pointerEvents: "auto", cursor: "pointer" }}
          onClick={() => onDismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Bottom sheet ────────────────────────────────────────────────────────────

/**
 * Mobile-only bottom sheet. Renders `children` inline (unwrapped) when `asSheet`
 * is false, so the same JSX serves the desktop inline panels.
 */
export function BottomSheet({
  open,
  asSheet,
  title,
  onClose,
  children,
}: {
  open: boolean;
  asSheet: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open || !asSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Freeze the page behind the sheet so scrolling doesn't leak through.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, asSheet, onClose]);

  if (!open) return null;
  if (!asSheet) return <>{children}</>;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 16px 12px",
            borderBottom: "1px solid #f4f4f5",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "#f4f4f5",
              color: "#52525b",
              fontSize: 17,
              lineHeight: 1,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
        {/* Grab handle sits above the title on iOS-style sheets */}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: "50%",
            transform: "translateX(-50%)",
            width: 36,
            height: 4,
            borderRadius: 99,
            background: "#d4d4d8",
          }}
        />
        <div style={{ overflowY: "auto", padding: 16, WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ── Auto-growing textarea ───────────────────────────────────────────────────

/**
 * Textarea that grows with its content instead of scrolling inside a fixed box,
 * the way a chat composer does. `minHeight`/`maxHeight` are in pixels.
 */
export function AutoGrowTextarea({
  value,
  minHeight,
  maxHeight,
  style,
  ...rest
}: {
  value: string;
  minHeight: number;
  maxHeight: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Layout effect so the box is never painted at the wrong height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, minHeight, maxHeight]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      style={{ ...style, minHeight, resize: "none" }}
    />
  );
}
