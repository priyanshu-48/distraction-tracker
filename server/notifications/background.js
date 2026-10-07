// Work that must not delay a response (alert checks after an upload) is started here and left to finish on its own.
// Tracking it lets a test wait for it, and lets a shutdown wait for it, without anything in a request path waiting.
const running = new Set();

/** Starts tracking `promise`. It must never reject; callers attach their own .catch. */
export function runInBackground(promise) {
  running.add(promise);
  promise.finally(() => running.delete(promise));
  return promise;
}

/** Resolves once everything started so far has finished (or failed). */
export const settleBackground = () => Promise.allSettled([...running]);
