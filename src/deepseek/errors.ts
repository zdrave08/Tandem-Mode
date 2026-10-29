/**
 * Network/API error helpers: tell transient failures (worth retrying) from real ones, and
 * surface the underlying cause. Node's fetch hides it: `fetch failed` is only the message,
 * the real reason (ECONNRESET, ETIMEDOUT, ...) sits in `err.cause`.
 */

export const MAX_RETRIES = 3;

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CLOSED",
]);

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function causeOf(err: unknown): { code?: string; message?: string } | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) return cause as { code?: string; message?: string };
  return undefined;
}

export function errorCode(err: unknown): string | undefined {
  const own = (err as { code?: unknown } | null)?.code;
  if (typeof own === "string") return own;
  return causeOf(err)?.code;
}

/** `message`, plus the underlying cause when there is one, e.g. `fetch failed (ECONNRESET: read ECONNRESET)`. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = causeOf(err);
  const detail = [cause?.code, cause?.message].filter((p): p is string => typeof p === "string" && p !== "");
  return detail.length > 0 && !err.message.includes(detail[0] as string)
    ? `${err.message} (${detail.join(": ")})`
    : err.message;
}

/** True for connection problems, dropped streams, 429 and 5xx; false for aborts and for 4xx such as a bad key. */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error) || isAbortError(err)) return false;

  const code = errorCode(err);
  if (code !== undefined && TRANSIENT_CODES.has(code)) return true;

  const status = /^DeepSeek API error (\d{3})/.exec(err.message);
  if (status) {
    const n = Number(status[1]);
    return n === 408 || n === 429 || (n >= 500 && n <= 599);
  }

  // undici's generic wording when it has no better code.
  return err instanceof TypeError && /fetch failed|terminated|other side closed/i.test(err.message);
}

/** 1s, 2s, 4s, capped at 8s, with a little jitter so parallel runs do not retry in lockstep. */
export function retryDelayMs(attempt: number): number {
  return Math.min(8000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

/** Resolves after `ms`, or rejects with an AbortError as soon as `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): Error => Object.assign(new Error("Aborted"), { name: "AbortError" });
    if (signal?.aborted) {
      reject(abort());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abort());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RetryOptions {
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; max: number; delayMs: number; reason: string }) => void;
}

/** Runs `fn`, retrying transient failures up to MAX_RETRIES times with backoff. Other errors are rethrown as is. */
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isTransientError(err)) throw err;
      const delayMs = retryDelayMs(attempt);
      opts.onRetry?.({ attempt: attempt + 1, max: MAX_RETRIES, delayMs, reason: describeError(err) });
      await sleep(delayMs, opts.signal);
    }
  }
}
