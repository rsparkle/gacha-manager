import { postUsage } from './remote.js';

export const USAGE_RETRY_MIN_MS = 60_000;
export const USAGE_RETRY_MAX_MS = 300_000;

const today = () => new Date().toISOString().slice(0, 10);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createUsagePing({ version, platform, read, write, send = postUsage, random = Math.random }) {
    let running = false;

    async function attempt() {
        try {
            return (await send({ version, platform: platform() }))?.ok === true;
        } catch {
            return false;
        }
    }

    async function check() {
        const date = today();

        if (running || read() === date) return;

        running = true;

        try {
            if (await attempt()) {
                write(date);
                return;
            }

            await wait(USAGE_RETRY_MIN_MS + random() * (USAGE_RETRY_MAX_MS - USAGE_RETRY_MIN_MS));

            if (read() !== date && (await attempt())) write(date);
        } finally {
            running = false;
        }
    }

    return { check };
}
