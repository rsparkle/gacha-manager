import path from 'node:path';

export const STARTUP_ARG = '--startup';
export const CLEAN_ARG = '--clean';
export const LOCAL_DATA_ARG = '--local-data';
export const DEFAULT_LOCAL_DATA_DIR = '../gacha-manager-assets';

function localDataDir(argv, { cwd, env }) {
    const arg = argv.findLast((value) => value === LOCAL_DATA_ARG || value.startsWith(`${LOCAL_DATA_ARG}=`));

    if (!arg) return null;

    const dir = arg.slice(LOCAL_DATA_ARG.length + 1) || env.GAME_DATA_DIR || DEFAULT_LOCAL_DATA_DIR;

    return path.resolve(cwd, dir);
}

export function parseLaunchOptions(argv, { cwd = process.cwd(), env = process.env } = {}) {
    return {
        startup: argv.includes(STARTUP_ARG),
        clean: argv.includes(CLEAN_ARG),
        localDataDir: localDataDir(argv, { cwd, env }),
    };
}
