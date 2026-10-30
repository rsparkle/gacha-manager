import { reactive, ref } from 'vue';
import { REPORT_URL } from '../../shared/remote.js';

export const REPORT_FIELDS = {
    codes: ['expired'],
    tasks: ['name', 'deadline', 'category'],
    schedule: ['name', 'date'],
};

const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
const COOLDOWN_MS = 20_000;
const TIMEOUT_MS = 15_000;

const reportState = ref(null);
const reported = reactive(new Set());
let lastSentAt = 0;

const reportKey = ({ game, topic, targetId }) => `${game}|${topic}|${targetId}`;

async function postReport(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(REPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        return response.ok ? await response.json() : { ok: false, error: 'network' };
    } catch {
        return { ok: false, error: 'network' };
    } finally {
        clearTimeout(timeout);
    }
}

export function useReport() {
    const openReport = (context) => {
        reportState.value = { ...context };
    };

    const closeReport = () => {
        reportState.value = null;
    };

    const isReported = (context) => reported.has(reportKey(context));

    const sendReport = async (report) => {
        if (Date.now() - lastSentAt < COOLDOWN_MS) return { ok: false, error: 'cooldown' };

        lastSentAt = Date.now();
        const result = await postReport({ ...report, appVersion: APP_VERSION });

        if (result.ok) {
            reported.add(reportKey(report));
        } else {
            lastSentAt = 0;
        }

        return result;
    };

    return { reportState, openReport, closeReport, isReported, sendReport };
}
