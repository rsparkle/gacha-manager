import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USAGE_RETRY_MAX_MS, USAGE_RETRY_MIN_MS, createUsagePing } from '../../src/shared/usagePing.js';

function setup({ results = [{ ok: true }], stored = null, platform = 'web' } = {}) {
    const state = { stored };
    const send = vi.fn(async () => {
        const result = results.length > 1 ? results.shift() : results[0];

        if (result instanceof Error) throw result;

        return result;
    });
    const ping = createUsagePing({
        version: '1.3.1',
        platform: () => platform,
        read: () => state.stored,
        write: (date) => {
            state.stored = date;
        },
        send,
        random: () => 0,
    });

    return { ping, send, state };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('usage ping', () => {
    it('sends the version and platform once a day', async () => {
        const { ping, send, state } = setup({ platform: 'desktop' });

        await ping.check();
        await ping.check();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({ version: '1.3.1', platform: 'desktop' });
        expect(state.stored).toBe('2026-11-03');

        vi.setSystemTime(new Date('2026-11-04T00:00:01Z'));
        await ping.check();

        expect(send).toHaveBeenCalledTimes(2);
        expect(state.stored).toBe('2026-11-04');
    });

    it('skips the day if it already pinged', async () => {
        const { ping, send } = setup({ stored: '2026-11-03' });

        await ping.check();

        expect(send).not.toHaveBeenCalled();
    });

    it('retries once after a random wait and saves the day when it works', async () => {
        const { ping, send, state } = setup({ results: [{ ok: false, error: 'busy' }, { ok: true }] });

        const checking = ping.check();
        await vi.advanceTimersByTimeAsync(USAGE_RETRY_MIN_MS - 1);

        expect(send).toHaveBeenCalledTimes(1);
        expect(state.stored).toBeNull();

        await vi.advanceTimersByTimeAsync(1);
        await checking;

        expect(send).toHaveBeenCalledTimes(2);
        expect(state.stored).toBe('2026-11-03');
    });

    it('spreads retries between the minimum and maximum wait', async () => {
        const { send, state } = setup();
        const ping = createUsagePing({
            version: '1.3.1',
            platform: () => 'web',
            read: () => state.stored,
            write: (date) => {
                state.stored = date;
            },
            send: send.mockResolvedValueOnce(null),
            random: () => 1,
        });

        const checking = ping.check();
        await vi.advanceTimersByTimeAsync(USAGE_RETRY_MAX_MS - 1);

        expect(send).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await checking;

        expect(send).toHaveBeenCalledTimes(2);
    });

    it('gives up after the retry and tries again on the next check', async () => {
        const { ping, send, state } = setup({ results: [new Error('offline'), { ok: false }, { ok: true }] });

        const checking = ping.check();
        await vi.advanceTimersByTimeAsync(USAGE_RETRY_MAX_MS);
        await checking;

        expect(send).toHaveBeenCalledTimes(2);
        expect(state.stored).toBeNull();

        await ping.check();

        expect(send).toHaveBeenCalledTimes(3);
        expect(state.stored).toBe('2026-11-03');
    });

    it('ignores checks while one is still waiting to retry', async () => {
        const { ping, send } = setup({ results: [{ ok: false }, { ok: true }] });

        const checking = ping.check();
        await ping.check();
        await vi.advanceTimersByTimeAsync(USAGE_RETRY_MAX_MS);
        await checking;

        expect(send).toHaveBeenCalledTimes(2);
    });
});
