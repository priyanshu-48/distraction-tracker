export class NotificationApiError extends Error {
    status;
    code;
    retryAfterSeconds;
    details;
    constructor(status, code, message, retryAfterSeconds, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
        this.details = details;
        this.name = 'NotificationApiError';
    }
}
const retryableStatuses = new Set([429, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class NotificationClient {
    baseUrl;
    apiKey;
    fetchFn;
    timeoutMs;
    maxRetries;
    retryBaseDelayMs;
    constructor(options) {
        if (!options.apiKey)
            throw new Error('apiKey is required');
        if (!options.baseUrl)
            throw new Error('baseUrl is required');
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.apiKey = options.apiKey;
        this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    }
    // Only requests that are safe to repeat are retried: reads, PUT/DELETE, and sends carrying an idempotency key.
    async request(method, path, { body, query, headers, retry = method !== 'POST' } = {}) {
        const qs = new URLSearchParams(Object.entries(query ?? {}).filter((e) => e[1] !== undefined).map(([k, v]) => [k, String(v)]));
        const url = `${this.baseUrl}${path}${qs.size ? `?${qs}` : ''}`;
        const init = {
            method,
            headers: { authorization: `Bearer ${this.apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        };
        for (let attempt = 0;; attempt++) {
            const canRetry = retry && attempt < this.maxRetries;
            const backoff = this.retryBaseDelayMs * 2 ** attempt * (0.5 + Math.random() / 2);
            let response;
            try {
                response = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
            }
            catch (cause) {
                if (canRetry) {
                    await sleep(backoff);
                    continue;
                }
                throw new NotificationApiError(0, 'NETWORK_ERROR', cause instanceof Error ? cause.message : 'Network error');
            }
            const retryAfter = Number(response.headers.get('retry-after')) || undefined;
            if (canRetry && retryableStatuses.has(response.status)) {
                await sleep(retryAfter ? retryAfter * 1000 : backoff);
                continue;
            }
            if (response.status === 204)
                return { data: undefined, response };
            const parsed = await response.json().catch(() => null);
            if (!response.ok) {
                throw new NotificationApiError(response.status, parsed?.error?.code ?? 'HTTP_ERROR', parsed?.error?.message ?? response.statusText, retryAfter, parsed?.error?.details);
            }
            return { data: parsed, response };
        }
    }
    async json(method, path, options) {
        return (await this.request(method, path, options)).data;
    }
    /**
     * Queue a notification. An idempotency key is generated if you don't pass one, so network retries (and the 503 returned when the
     * queue is briefly unavailable) can never produce a duplicate. Pass your own key to dedupe across separate calls,
     * e.g. a key built from the user id and date for a daily reminder.
     */
    async send(notification, options = {}) {
        const { data, response } = await this.request('POST', '/v1/notifications', {
            body: notification, headers: { 'idempotency-key': options.idempotencyKey ?? crypto.randomUUID() }, retry: true,
        });
        return { ...data, replayed: response.headers.get('idempotent-replayed') === 'true' };
    }
    getNotification(id) { return this.json('GET', `/v1/notifications/${id}`); }
    listNotifications(query = {}) {
        return this.json('GET', '/v1/notifications', { query });
    }
    async listDeadLetters() { return (await this.json('GET', '/v1/dead-letters')).notifications; }
    /** Re-queue a failed notification. */
    replayNotification(id) { return this.json('POST', `/v1/notifications/${id}/replay`, { retry: false }); }
    upsertUser(externalUserId, user) { return this.json('PUT', `/v1/users/${encodeURIComponent(externalUserId)}`, { body: user }); }
    async getPreferences(externalUserId) { return (await this.json('GET', `/v1/users/${encodeURIComponent(externalUserId)}/preferences`)).preferences; }
    /** Replaces the user's whole preference set. */
    async setPreferences(externalUserId, preferences) {
        return (await this.json('PUT', `/v1/users/${encodeURIComponent(externalUserId)}/preferences`, { body: { preferences } })).preferences;
    }
    async getInbox(externalUserId) { return (await this.json('GET', `/v1/users/${encodeURIComponent(externalUserId)}/inbox`)).notifications; }
    async markRead(externalUserId, notificationId) {
        await this.json('POST', `/v1/users/${encodeURIComponent(externalUserId)}/inbox/${notificationId}/read`, { retry: true });
    }
    /** Mint a one-hour token your end user's browser can use to open the live stream. Call this from your backend. */
    createStreamToken(externalUserId) { return this.json('POST', `/v1/users/${encodeURIComponent(externalUserId)}/stream-token`, { retry: false }); }
    createTemplate(template) { return this.json('POST', '/v1/templates', { body: template, retry: false }); }
    async listTemplates() { return (await this.json('GET', '/v1/templates')).templates; }
    getStats(hours) { return this.json('GET', '/v1/stats', { query: { hours } }); }
}
