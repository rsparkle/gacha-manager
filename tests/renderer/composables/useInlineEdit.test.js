import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useInlineEdit } from '../../../src/renderer/composables/useInlineEdit.js';

function setup(save = vi.fn(async () => true)) {
    const values = { a: 'Alpha', b: 'Beta' };
    const edit = useInlineEdit({ read: (key) => values[key], save });

    return { edit, save };
}

describe('useInlineEdit', () => {
    it('start reads the value and selects the input', async () => {
        const { edit } = setup();
        const select = vi.fn();

        edit.input = { select };
        edit.start('a');

        expect(edit.editing).toBe(true);
        expect(edit.isEditing('a')).toBe(true);
        expect(edit.isEditing('b')).toBe(false);
        expect(edit.value).toBe('Alpha');

        await nextTick();

        expect(select).toHaveBeenCalled();
    });

    it('commit saves with the target and closes', async () => {
        const { edit, save } = setup();

        edit.start('b');
        edit.value = 'Gamma';

        expect(await edit.commit()).toBe(true);
        expect(save).toHaveBeenCalledWith('Gamma', 'b');
        expect(edit.editing).toBe(false);
    });

    it('a failed save stays open, finish closes anyway', async () => {
        const { edit, save } = setup(vi.fn(async () => false));

        edit.start('a');

        expect(await edit.commit()).toBe(false);
        expect(edit.editing).toBe(true);

        await edit.finish();

        expect(save).toHaveBeenCalledTimes(2);
        expect(edit.editing).toBe(false);
    });

    it('cancel closes without saving and commit is then a no-op', async () => {
        const { edit, save } = setup();

        edit.start('a');
        edit.cancel();

        expect(await edit.commit()).toBe(false);
        expect(save).not.toHaveBeenCalled();
    });

    it('ignores a second commit while saving', async () => {
        let resolve;
        const { edit, save } = setup(vi.fn(() => new Promise((done) => (resolve = done))));

        edit.start('a');
        const first = edit.commit();

        expect(await edit.commit()).toBe(false);

        resolve(true);

        expect(await first).toBe(true);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('does not close an edit started while saving', async () => {
        let resolve;
        const { edit } = setup(vi.fn(() => new Promise((done) => (resolve = done))));

        edit.start('a');
        const first = edit.commit();
        edit.start('b');
        resolve(true);
        await first;

        expect(edit.isEditing('b')).toBe(true);
    });

    it('start without a target uses true', () => {
        const edit = useInlineEdit({ read: () => 5, save: async () => true });

        edit.start();

        expect(edit.target).toBe(true);
        expect(edit.value).toBe('5');
    });
});
