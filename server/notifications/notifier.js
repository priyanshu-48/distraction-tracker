import logger from "../logger.js";
import { NotificationClient } from "../vendor/notification-client/client.js";

/**
 * The tracker's only door to the hosted notification service (decisions.md, D-39).
 *
 * - It is OFF unless NOTIFICATIONS_API_URL and NOTIFICATIONS_API_KEY are both set, so a default install sends nothing
 *   anywhere. Each user must also switch notifications on in Settings (`notification_settings.enabled`).
 * - `send` never throws and never waits on anything the caller cares about: if the service is asleep, slow or down, the
 *   failure is logged and `send` resolves to null. Nothing in the tracker may fail because of this service.
 * - What is sent is the minimum an alert needs: the user's id and email, a site name, a time. Never a URL or a page title.
 */
export function createNotifier({ env = process.env, client, log = logger } = {}) {
  const baseUrl = env.NOTIFICATIONS_API_URL;
  const apiKey = env.NOTIFICATIONS_API_KEY;
  if (!client && !(baseUrl && apiKey)) return { enabled: false, async send() { return null; }, async erase() { return false; } };

  // A short timeout and two retries: alerts are not worth holding a connection open for.
  const api = client ?? new NotificationClient({ baseUrl, apiKey, timeoutMs: 5000, maxRetries: 2 });
  const registered = new Set(); // users the service has been told about during this run (the upsert is idempotent)

  return {
    enabled: true,
    /** `idempotencyKey` is what makes retries and restarts harmless: the service stores each key once, for good. */
    async send(user, { idempotencyKey, type, title, body, channels = ["in_app"] }) {
      try {
        const externalUserId = String(user.id);
        if (!registered.has(externalUserId)) {
          await api.upsertUser(externalUserId, { email: user.email });
          registered.add(externalUserId);
        }
        return await api.send({ externalUserId, type, payload: { title, body }, channels }, { idempotencyKey });
      } catch (error) {
        // Only the message and status: never the request body, which holds the user's email.
        log.warn({ reason: error?.message, status: error?.status }, "notification service call failed; alert not sent");
        return null;
      }
    },
    /**
     * Asks the service to erase the user and everything it holds about them. True only when the service confirmed (it
     * answers the same for a user it never knew, so a repeat is fine). Never throws: the caller keeps the request and retries.
     */
    async erase(user) {
      try {
        const externalUserId = String(user.id);
        await api.deleteUser(externalUserId);
        registered.delete(externalUserId); // the next alert must register the user afresh
        return true;
      } catch (error) {
        log.warn({ reason: error?.message, status: error?.status }, "notification service call failed; erasure will be retried");
        return false;
      }
    },
  };
}

let instance;
/** The shared notifier, built from the environment the first time it is needed. */
export const getNotifier = () => (instance ??= createNotifier());
/** Tests swap in a fake; pass undefined to rebuild from the environment. */
export const setNotifier = (notifier) => { instance = notifier; };
