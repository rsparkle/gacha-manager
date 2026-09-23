import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

let accounts = {};
let accountPath;

export function initializeAccounts() {
  accountPath = path.join(app.getPath('userData'), 'accounts.json');

  if (!fs.existsSync(accountPath)) {
    fs.writeFileSync(accountPath, '{}', 'utf-8');
  }

  const storedAccounts = JSON.parse(
    fs.readFileSync(accountPath, 'utf-8')
  );

  if (
    storedAccounts === null ||
    typeof storedAccounts !== 'object' ||
    Array.isArray(storedAccounts)
  ) {
    throw new Error('Invalid accounts.json structure');
  }

  accounts = storedAccounts;
}

function saveAccounts(nextAccounts) {
  fs.writeFileSync(
    accountPath,
    JSON.stringify(nextAccounts, null, 2),
    'utf-8'
  );

  accounts = nextAccounts;
}

export function getAccounts() {
  return structuredClone(accounts);
}

export function insertAccounts(gameList) {
  const nextAccounts = { ...accounts };
  const createdAccounts = [];

  gameList.forEach(game => {
    const account = {
      id: randomUUID(),
      uid: 0,
      server: game.server,
      label: game.label ?? '',
      tasks: {}
    };

    nextAccounts[game.name] = [
      ...(nextAccounts[game.name] ?? []),
      account
    ];

    createdAccounts.push(account);
  });

  saveAccounts(nextAccounts);

  return createdAccounts;
}

export function updateAccount(gameName, accountId, changes) {
  const gameAccounts = accounts[gameName] ?? [];

  if (!gameAccounts.some(account => account.id === accountId)) {
    throw new Error('Account not found');
  }

  const nextAccounts = {
    ...accounts,
    [gameName]: gameAccounts.map(account =>
      account.id === accountId
        ? {
            ...account,
            ...changes,
            id: account.id
          }
        : account
    )
  };

  saveAccounts(nextAccounts);
}

export function deleteAccount(gameName, accountId) {
  const gameAccounts = accounts[gameName] ?? [];

  const deletedAccount = gameAccounts.find(
    account => account.id === accountId
  );

  if (!deletedAccount) {
    throw new Error('Account not found');
  }

  const nextAccounts = {
    ...accounts,
    [gameName]: gameAccounts.filter(
      account => account.id !== accountId
    )
  };

  saveAccounts(nextAccounts);

  return deletedAccount;
}

export function updateTaskLog(
  gameName,
  taskId,
  accountId,
  toDelete
) {
  const account = accounts[gameName]?.find(
    account => account.id === accountId
  );

  if (!account) {
    throw new Error('Account not found');
  }

  if (!toDelete) {
    account.tasks[taskId] = new Date().toISOString();
  } else {
    if (!Object.hasOwn(account.tasks, taskId)) {
      return false;
    }

    delete account.tasks[taskId];
  }

  saveAccounts(accounts);

  return true;
}

export function getTasksForAccount(gameName, accountId) {
  const account = accounts[gameName]?.find(
    account => account.id === accountId
  );

  if (!account) {
    throw new Error('Account not found');
  }

  return structuredClone(account.tasks);
}