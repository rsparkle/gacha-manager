import { describe, expect, it } from 'vitest';
import { migrateSettings } from '../../src/shared/settings.js';

describe('migrateSettings', () => {
    it('renames windowsNotifications to deadlineNotifications', () => {
        expect(migrateSettings({ theme: 'nikki', windowsNotifications: { Test: ['acc-1'] } })).toEqual({
            theme: 'nikki',
            deadlineNotifications: { Test: ['acc-1'] },
        });
    });

    it('keeps an existing deadlineNotifications over the old key', () => {
        expect(
            migrateSettings({ windowsNotifications: { Test: ['old'] }, deadlineNotifications: { Test: ['new'] } }),
        ).toEqual({ deadlineNotifications: { Test: ['new'] } });
    });

    it('returns the same object when there is nothing to migrate', () => {
        const stored = { deadlineNotifications: {} };

        expect(migrateSettings(stored)).toBe(stored);
    });

    it.each([[null], [undefined]])('passes %s through', (stored) => {
        expect(migrateSettings(stored)).toBe(stored);
    });
});
