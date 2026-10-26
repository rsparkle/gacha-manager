import { describe, expect, it } from 'vitest';
import { URGENT_PROGRESS, isUrgent, taskProgress } from '../../src/shared/tasks.js';

const DAY = 86_400_000;

describe('taskProgress', () => {
    it.each([
        [DAY, DAY, 0],
        [DAY, DAY / 2, 50],
        [DAY, 1, 99],
        [DAY, 0, 100],
        [DAY, DAY * 2, 0],
    ])('duration %i with %i left is %i%%', (duration, nextReset, progress) => {
        expect(taskProgress({ duration, nextReset })).toBe(progress);
    });

    it('0 for open-ended and disabled', () => {
        expect(taskProgress({ duration: null, nextReset: null })).toBe(0);
        expect(taskProgress({ duration: 0, nextReset: 0 })).toBe(0);
    });
});

describe('isUrgent', () => {
    it(`is urgent strictly above ${URGENT_PROGRESS}%`, () => {
        expect(isUrgent({ duration: 100, nextReset: 20 })).toBe(false);
        expect(isUrgent({ duration: 100, nextReset: 19 })).toBe(true);
        expect(isUrgent({ duration: 1000, nextReset: 190 })).toBe(true);
        expect(isUrgent({ duration: 1000, nextReset: 199 })).toBe(false);
    });

    it('open-ended never urgent', () => {
        expect(isUrgent({ duration: null, nextReset: null })).toBe(false);
    });
});
