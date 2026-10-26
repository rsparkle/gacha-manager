import fs from 'node:fs';
import { dialog, shell } from 'electron';
import {
    ACCOUNTS_VERSION,
    AccountsMigrationError,
    NewerAccountsVersionError,
    parseAccounts,
    serializeAccounts,
} from '../shared/accounts/accountsFile.js';
import { RELEASES_URL } from '../shared/remote.js';

function writeFileAtomic(filePath, contents) {
    const tempPath = `${filePath}.tmp`;
    const fd = fs.openSync(tempPath, 'w');

    try {
        fs.writeSync(fd, contents);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }

    try {
        fs.renameSync(tempPath, filePath);
    } catch {
        fs.writeFileSync(filePath, contents, 'utf-8');
        fs.rmSync(tempPath, { force: true });
    }
}

function backupPath(filePath, suffix) {
    return filePath.replace(/\.json$/, `.${suffix}.json`);
}

function recoverCorruptAccounts(filePath, err) {
    const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Accounts file is corrupted',
        message: 'Your accounts file could not be read.',
        detail: `${err.message}\n\nStart fresh? The damaged file will be saved as a backup first, so nothing is deleted.`,
        buttons: ['Start fresh', 'Quit'],
        defaultId: 1,
        cancelId: 1,
    });

    if (choice !== 0) {
        err.userDeclined = true;
        throw err;
    }

    fs.copyFileSync(filePath, backupPath(filePath, `corrupt-${Date.now()}`));
    writeFileAtomic(filePath, serializeAccounts({}));

    return {};
}

function askToUpdate(err) {
    const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Accounts file is from a newer version',
        message: 'Your accounts were saved by a newer version of Gacha Manager.',
        detail: 'Download and install the latest version to open them. Nothing was changed.',
        buttons: ['Download latest version', 'Quit'],
        defaultId: 0,
        cancelId: 1,
    });

    if (choice === 0) shell.openExternal(RELEASES_URL);

    err.userDeclined = true;
    throw err;
}

function loadAccounts(filePath) {
    if (!fs.existsSync(filePath)) {
        writeFileAtomic(filePath, serializeAccounts({}));
        return {};
    }

    let result;

    try {
        result = parseAccounts(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        if (err instanceof NewerAccountsVersionError) return askToUpdate(err);
        if (err instanceof AccountsMigrationError) throw err;

        return recoverCorruptAccounts(filePath, err);
    }

    if (result.fromVersion !== ACCOUNTS_VERSION) {
        fs.copyFileSync(filePath, backupPath(filePath, `v${result.fromVersion}-backup`));
        writeFileAtomic(filePath, serializeAccounts(result.accounts));
    }

    return result.accounts;
}

export function createAccountsFileStorage(filePath) {
    return {
        load: () => loadAccounts(filePath),
        save: (accounts) => writeFileAtomic(filePath, serializeAccounts(accounts)),
    };
}
