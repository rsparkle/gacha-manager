import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_URL } from '../../../src/shared/remote.js';
import {
    OTHER_FIELDS,
    NOT_LISTED_TARGET,
    REPORT_FIELDS,
    canSendReport,
    reportFields,
} from '../../../src/renderer/composables/useReport.js';

const REPORT = {
    game: 'Genshin Impact',
    topic: 'tasks',
    targetId: 'daily_commissions',
    targetLabel: 'Daily Commissions',
    field: 'deadline',
    server: 'Europe',
    comment: '',
};

let responses;
let useReport;

const body = (call = 0) => JSON.parse(fetch.mock.calls[call][1].body);

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    vi.stubGlobal('__APP_VERSION__', '1.2.4');
    responses = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
            const next = responses.shift() ?? { ok: true };

            if (next instanceof Error) throw next;
            if (typeof next === 'number') return { ok: false, status: next, json: async () => ({}) };

            return { ok: true, status: 200, json: async () => next };
        }),
    );
    ({ useReport } = await import('../../../src/renderer/composables/useReport.js'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('openReport', () => {
    it('stores a copy of the context and clears it on close', () => {
        const { reportState, openReport, closeReport } = useReport();
        const context = { game: 'Genshin Impact', topic: 'codes', targetId: 'GENSHINGIFT' };

        openReport(context);
        context.targetId = 'CHANGED';

        expect(reportState.value).toEqual({ game: 'Genshin Impact', topic: 'codes', targetId: 'GENSHINGIFT' });

        closeReport();

        expect(reportState.value).toBeNull();
    });

    it('shares state across callers', () => {
        useReport().openReport({ game: 'Genshin Impact', topic: 'codes', targetId: 'X' });

        expect(useReport().reportState.value?.targetId).toBe('X');
    });
});

describe('sendReport', () => {
    it('posts the report as text/plain with the app version', async () => {
        const result = await useReport().sendReport(REPORT);

        expect(result).toEqual({ ok: true });
        expect(fetch).toHaveBeenCalledWith(
            REPORT_URL,
            expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'text/plain' } }),
        );
        expect(body()).toEqual({ ...REPORT, appVersion: '1.2.4' });
    });

    it('marks the target as reported after a success', async () => {
        const { sendReport, isReported } = useReport();

        expect(isReported(REPORT)).toBe(false);

        await sendReport(REPORT);

        expect(isReported(REPORT)).toBe(true);
        expect(isReported({ ...REPORT, field: 'name' })).toBe(true);
        expect(isReported({ ...REPORT, targetId: 'weekly_bosses' })).toBe(false);
    });

    it('treats duplicates as a success', async () => {
        responses.push({ ok: true, duplicate: true });
        const { sendReport, isReported } = useReport();

        expect((await sendReport(REPORT)).ok).toBe(true);
        expect(isReported(REPORT)).toBe(true);
    });

    it('blocks a second send inside the cooldown', async () => {
        const { sendReport } = useReport();

        await sendReport(REPORT);
        vi.setSystemTime(Date.now() + 19_000);

        expect(await sendReport({ ...REPORT, targetId: 'weekly_bosses' })).toEqual({ ok: false, error: 'cooldown' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('allows another send once the cooldown has passed', async () => {
        const { sendReport } = useReport();

        await sendReport(REPORT);
        vi.setSystemTime(Date.now() + 20_000);

        expect((await sendReport({ ...REPORT, targetId: 'weekly_bosses' })).ok).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['a network failure', new TypeError('Failed to fetch'), 'network'],
        ['an http error', 500, 'network'],
        ['a rate limit', { ok: false, error: 'rate_limited' }, 'rate_limited'],
        ['an invalid report', { ok: false, error: 'invalid' }, 'invalid'],
    ])('returns the error for %s without starting the cooldown', async (_, response, error) => {
        responses.push(response);
        const { sendReport, isReported } = useReport();

        expect(await sendReport(REPORT)).toEqual({ ok: false, error });
        expect(isReported(REPORT)).toBe(false);
        expect((await sendReport(REPORT)).ok).toBe(true);
    });

    it('falls back to dev when no app version is defined', async () => {
        vi.unstubAllGlobals();
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
        );
        vi.resetModules();
        const { useReport: fresh } = await import('../../../src/renderer/composables/useReport.js');

        await fresh().sendReport(REPORT);

        expect(body().appVersion).toBe('dev');
    });
});

describe('reportFields', () => {
    it('uses the topic fields for a listed task', () => {
        expect(reportFields('tasks', 'daily_commissions')).toEqual(REPORT_FIELDS.tasks);
    });

    it('uses the other fields for the other target', () => {
        expect(reportFields('tasks', NOT_LISTED_TARGET)).toEqual(OTHER_FIELDS);
    });

    it('nothing for an unknown topic', () => {
        expect(reportFields('nope', 'daily_commissions')).toEqual([]);
    });

    it('other fields are never offered for a listed task', () => {
        expect(REPORT_FIELDS.tasks.some((field) => OTHER_FIELDS.includes(field))).toBe(false);
    });
});

describe('canSendReport', () => {
    it('needs a target and a field', () => {
        expect(canSendReport({ targetId: '', field: 'deadline' })).toBe(false);
        expect(canSendReport({ targetId: 'daily_commissions', field: null })).toBe(false);
        expect(canSendReport({ targetId: 'daily_commissions', field: 'deadline' })).toBe(true);
    });

    it('other needs a comment', () => {
        expect(canSendReport({ targetId: NOT_LISTED_TARGET, field: 'missing', comment: '' })).toBe(false);
        expect(canSendReport({ targetId: NOT_LISTED_TARGET, field: 'missing', comment: '   ' })).toBe(false);
        expect(canSendReport({ targetId: NOT_LISTED_TARGET, field: 'missing', comment: 'Hollow Zero' })).toBe(true);
    });
});

describe('other reports', () => {
    it('are never marked as reported', async () => {
        const { sendReport, isReported } = useReport();
        const report = { ...REPORT, targetId: NOT_LISTED_TARGET, field: 'missing', comment: 'Hollow Zero' };

        await sendReport(report);

        expect(isReported(report)).toBe(false);
    });

    it('can be sent again after the cooldown', async () => {
        const { sendReport } = useReport();
        const report = { ...REPORT, targetId: NOT_LISTED_TARGET, field: 'missing', comment: 'Hollow Zero' };

        await sendReport(report);
        vi.setSystemTime(Date.now() + 20_000);

        expect((await sendReport({ ...report, comment: 'Shiyu Defense' })).ok).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});