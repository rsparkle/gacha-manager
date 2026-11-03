import { MISSING_ASSET_RETRY_MS, NETWORK_RETRY_MS, assetUrl, fetchWithTimeout } from '../../../shared/remote.js';

export function createImageResolver() {
    const found = new Set();
    const retryAt = new Map();
    const pending = new Map();

    async function check(file) {
        try {
            const exists = await fetchWithTimeout(assetUrl(file), 10000, async (response) => {
                if (!response.ok) return false;

                await response.blob();

                return true;
            });

            if (!exists) {
                retryAt.set(file, Date.now() + MISSING_ASSET_RETRY_MS);
                return null;
            }
        } catch {
            retryAt.set(file, Date.now() + NETWORK_RETRY_MS);
            return null;
        }

        found.add(file);
        retryAt.delete(file);

        return assetUrl(file);
    }

    return async function getUrl(file) {
        if (typeof file !== 'string' || file.length === 0) {
            throw new Error('Invalid filename');
        }

        if (found.has(file)) return assetUrl(file);
        if (Date.now() < (retryAt.get(file) ?? 0)) return null;

        if (!pending.has(file)) {
            pending.set(
                file,
                check(file).finally(() => pending.delete(file)),
            );
        }

        return pending.get(file);
    };
}
