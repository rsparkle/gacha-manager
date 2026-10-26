import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageResolver } from '../../../../src/renderer/platform/web/images.js';
import { MISSING_ASSET_RETRY_MS, NETWORK_RETRY_MS, assetUrl } from '../../../../src/shared/remote.js';

const FILE = 'characters/la signora.webp';
let responses;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    responses = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
            const next = responses.shift() ?? 200;

            if (next instanceof Error) throw next;

            return { ok: next < 400, status: next, blob: async () => new Blob() };
        }),
    );
});

afterEach(() => {
    vi.useRealTimers();
});

describe('image resolver', () => {
    it('encodes the path', () => {
        expect(assetUrl(FILE)).toMatch(/\/characters\/la%20signora\.webp$/);
    });

    it('returns the url once found and stops asking', async () => {
        const getUrl = createImageResolver();

        expect(await getUrl(FILE)).toBe(assetUrl(FILE));
        expect(await getUrl(FILE)).toBe(assetUrl(FILE));
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('missing images wait before trying again', async () => {
        const getUrl = createImageResolver();
        responses = [404, 200];

        expect(await getUrl(FILE)).toBeNull();
        expect(await getUrl(FILE)).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + MISSING_ASSET_RETRY_MS);

        expect(await getUrl(FILE)).toBe(assetUrl(FILE));
    });

    it('network errors retry sooner', async () => {
        const getUrl = createImageResolver();
        responses = [new TypeError('offline'), 200];

        expect(await getUrl(FILE)).toBeNull();

        vi.setSystemTime(Date.now() + NETWORK_RETRY_MS);

        expect(await getUrl(FILE)).toBe(assetUrl(FILE));
    });

    it('parallel requests share one fetch', async () => {
        const getUrl = createImageResolver();

        await Promise.all([getUrl(FILE), getUrl(FILE), getUrl(FILE)]);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([[''], [null], [42]])('rejects %j', async (file) => {
        await expect(createImageResolver()(file)).rejects.toThrow('Invalid filename');
    });
});
