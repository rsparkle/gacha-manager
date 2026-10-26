export function createStore(initial = {}) {
    const data = structuredClone(initial);

    return {
        data,
        get: (key, fallback) => (Object.hasOwn(data, key) ? data[key] : fallback),
        set: (keyOrValues, value) => {
            Object.assign(data, typeof keyOrValues === 'string' ? { [keyOrValues]: value } : keyOrValues);
        },
    };
}

export function createMemoryStorage(accounts = {}) {
    const storage = {
        saved: structuredClone(accounts),
        saves: 0,
        load: () => structuredClone(storage.saved),
        save: (next) => {
            storage.saved = structuredClone(next);
            storage.saves++;
        },
    };

    return storage;
}

export function createLocalStorage(initial = {}) {
    const items = new Map(Object.entries(initial));

    return {
        items,
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => {
            items.set(key, String(value));
        },
        removeItem: (key) => {
            items.delete(key);
        },
    };
}
