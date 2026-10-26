import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameDataLoader } from '../../src/shared/gameDataLoader.js';
import { CONFIG_URL, TASKS_URL } from '../../src/shared/remote.js';
import { makeConfig, makeTask, makeTasks } from '../helpers/builders.js';

const valid = {
    config: makeConfig({ Test: {} }),
    tasks: makeTasks({ Test: [makeTask('daily', { kind: 'daily' })] }),
};

const updated = {
    config: makeConfig({ Test: { abbr: 'NEW' } }),
    tasks: valid.tasks,
};

const invalid = {
    config: makeConfig({ Test: { daily_reset: '25:00' } }),
    tasks: valid.tasks,
};

let remote;

function serve(data) {
    remote = data;
}

function stubFetch() {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => {
            if (remote instanceof Error) throw remote;

            const body = { [CONFIG_URL]: remote.config, [TASKS_URL]: remote.tasks }[url];

            return { ok: body !== undefined, status: body ? 200 : 404, json: async () => structuredClone(body) };
        }),
    );
}

function createLoader(cached = null) {
    const cache = { value: structuredClone(cached) };
    const onUpdate = vi.fn();
    const onRejected = vi.fn();
    const loader = createGameDataLoader({
        readCache: async () => {
            if (!cache.value) throw new Error('No cached game data');

            return structuredClone(cache.value);
        },
        writeCache: async (data) => {
            cache.value = structuredClone(data);
        },
        onUpdate,
        onRejected,
    });

    return { loader, cache, onUpdate, onRejected };
}

beforeEach(() => {
    serve(valid);
    stubFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('load', () => {
    it('uses the cache first', async () => {
        const { loader } = createLoader(valid);

        expect(await loader.load()).toEqual({ ...valid, fromCache: true });
        expect(fetch).not.toHaveBeenCalled();
        expect(loader.current).toEqual(valid);
    });

    it('falls back to remote and caches it', async () => {
        const { loader, cache } = createLoader();

        expect(await loader.load()).toEqual({ ...valid, fromCache: false });
        expect(cache.value).toEqual(valid);
    });

    it('skips an invalid cache', async () => {
        const { loader } = createLoader(invalid);

        expect((await loader.load()).fromCache).toBe(false);
    });

    it('reports both failures', async () => {
        serve(new Error('offline'));
        const { loader } = createLoader();

        await expect(loader.load()).rejects.toThrow('Online: offline\nCached: No cached game data');
    });

    it('rejects invalid remote data', async () => {
        serve(invalid);
        const { loader, cache } = createLoader();

        await expect(loader.load()).rejects.toThrow('Failed to load game data');
        expect(cache.value).toBeNull();
    });
});

describe('refresh', () => {
    it('applies and caches new data', async () => {
        const { loader, cache, onUpdate } = createLoader(valid);
        await loader.load();
        serve(updated);

        await loader.refresh();

        expect(onUpdate).toHaveBeenCalledWith(updated);
        expect(cache.value).toEqual(updated);
        expect(loader.current).toEqual(updated);
    });

    it('ignores identical data', async () => {
        const { loader, onUpdate } = createLoader(valid);
        await loader.load();

        await loader.refresh();

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('rejects invalid data once and keeps the current data', async () => {
        const { loader, cache, onUpdate, onRejected } = createLoader(valid);
        await loader.load();
        serve(invalid);

        await loader.refresh();
        await loader.refresh();

        expect(onRejected).toHaveBeenCalledTimes(1);
        expect(onUpdate).not.toHaveBeenCalled();
        expect(cache.value).toEqual(valid);
        expect(loader.current).toEqual(valid);
    });

    it('a network error is logged only', async () => {
        const { loader, onUpdate } = createLoader(valid);
        await loader.load();
        serve(new Error('offline'));

        await expect(loader.refresh()).resolves.toBeUndefined();
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('concurrent refreshes share one request', async () => {
        const { loader } = createLoader(valid);
        await loader.load();

        await Promise.all([loader.refresh(), loader.refresh()]);

        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
