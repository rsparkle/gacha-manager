import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from '../../src/main/launchOptions.js';

const cwd = path.resolve('/projects/gacha-manager');
const parse = (args, env = {}) => parseLaunchOptions(['electron', '.', ...args], { cwd, env });

describe('parseLaunchOptions', () => {
    it('turns every option off without arguments', () => {
        expect(parse([])).toEqual({ startup: false, clean: false, localDataDir: null });
    });

    it('reads --startup and --clean', () => {
        expect(parse(['--startup', '--clean'])).toMatchObject({ startup: true, clean: true });
    });

    it('uses the sibling gacha-manager-assets folder for --local-data', () => {
        expect(parse(['--local-data']).localDataDir).toBe(path.resolve(cwd, '../gacha-manager-assets'));
    });

    it('uses GAME_DATA_DIR when --local-data has no path', () => {
        expect(parse(['--local-data'], { GAME_DATA_DIR: 'data' }).localDataDir).toBe(path.resolve(cwd, 'data'));
    });

    it('prefers an explicit path, and the last --local-data wins', () => {
        const options = parse(['--local-data', '--local-data=../other'], { GAME_DATA_DIR: 'data' });

        expect(options.localDataDir).toBe(path.resolve(cwd, '../other'));
    });
});
