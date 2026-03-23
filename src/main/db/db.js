import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { GAME_CONFIG } from '../../game-config.js';

export const IS_DEV = !app.isPackaged;

export const DB_PATH = IS_DEV
    ? path.join(process.cwd(), 'dev_gacha.db')
    : path.join(app.getPath('userData'), 'gacha_data.db');

let db;

export function initDB() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('foreign_keys = ON');

        db.exec(`
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                current_version REAL,
                is_active INTEGER DEFAULT 1
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                game_uid INTEGER NULL,
                server TEXT NOT NULL CHECK(server IN ('America','Europe','Asia','TW/HK/MO')),
                label TEXT NULL,
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS task_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                game_id INTEGER NOT NULL,
                type_id INTEGER NOT NULL,
                UNIQUE(game_id, label),
                FOREIGN KEY (type_id) REFERENCES task_types(id),
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                completed_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        `);
    }

    return db;
}

export function runMigrations() {
    const current_version = db.pragma('user_version', { simple: true });

    const migrations = [

    ]

    const pending = migrations.slice(current_version);

    if (pending.length === 0) return;

    for (let i = 0; i < pending.length; i++) {
        const version = current_version + i + 1;
        db.transaction(() => {
            pending[i]();
            db.pragma(`user_version = ${version}`);
        })()
    }
}

export function seedDatabase() {
    const gameList = Object.keys(GAME_CONFIG).map(name => ({ name }));
    const SEED = [
        {
            table: "task_types",
            values: ["Daily", "Weekly", "Monthly", "Endgame", "Seasonal", "Event"],
            columns: ["name"]
        },
        {
            table: "games",
            values: gameList,
            columns: ["name"]
        },
        {
            table: "tasks",
            values: [
                {
                    label: "Original Resin, Assignments",
                    type: "Daily",
                    game: "Genshin Impact"
                },
                {
                    label: "Trailblaze Power, Assignments",
                    type: "Daily",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Battery Charge",
                    type: "Daily",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Weekly Bosses",
                    type: "Weekly",
                    game: "Genshin Impact"
                },
                {
                    label: "Weekly Bosses",
                    type: "Weekly",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Weekly Bosses",
                    type: "Weekly",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Divergent Universe",
                    type: "Weekly",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Currency Wars",
                    type: "Weekly",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Hollow Zero",
                    type: "Weekly",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Spiral Abyss",
                    type: "Endgame",
                    game: "Genshin Impact"
                },
                {
                    label: "Imaginarium Theater",
                    type: "Endgame",
                    game: "Genshin Impact"
                },
                {
                    label: "Stygian Onslaught",
                    type: "Endgame",
                    game: "Genshin Impact"
                },
                {
                    label: "Memory of Chaos",
                    type: "Endgame",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Pure Fiction",
                    type: "Endgame",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Apocalyptic Shadow",
                    type: "Endgame",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Anomaly Arbitration",
                    type: "Endgame",
                    game: "Honkai: Star Rail"
                },
                {
                    label: "Shiyu Defense",
                    type: "Endgame",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Deadly Assault",
                    type: "Endgame",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Battle Trial",
                    type: "Seasonal",
                    game: "Zenless Zone Zero"
                },
                {
                    label: "Threshold Simulation",
                    type: "Seasonal",
                    game: "Zenless Zone Zero"
                }
            ]
        }
    ];

    for (const seed of SEED) {
        if (seed.table === "tasks") {
            seedTasks(seed.values)
        } else {
            seedSimple(seed)
        }
    }
}

function seedSimple(seed) {
    const columnList = seed.columns.join(", ");
    const placeholders = seed.columns.map(() => "?").join(", ");

    const stmt = db.prepare(
        `INSERT OR IGNORE INTO ${seed.table} (${columnList}) VALUES (${placeholders})`
    );

    const tx = db.transaction((items) => {
        for (const item of items) {
            const params = typeof item === 'object'
                ? seed.columns.map(col => item[col])
                : [item];
            stmt.run(params);
        }
    });

    tx(seed.values);
}

function seedTasks(values) {
    const getTypeId = db.prepare(
        `SELECT id FROM task_types WHERE name = ?`
    );

    const getGameId = db.prepare(
        `SELECT id FROM games WHERE name = ?`
    );

    const insertTask = db.prepare(
        `INSERT OR IGNORE INTO tasks (label, type_id, game_id) VALUES (?, ?, ?)`
    );

    const tx = db.transaction((tasks) => {
        for (const task of tasks) {
            const type = getTypeId.get(task.type);
            if (!type) throw new Error(`Invalid type: ${task.type}`);

            const game = getGameId.get(task.game);
            if (!game) throw new Error(`Invalid game: ${task.game}`);

            insertTask.run(task.label, type.id, game.id);
        }
    });

    tx(values);
}

export function syncGameConfig() {
    const stmt = db.prepare(`INSERT INTO games (name, current_version) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET current_version = excluded.current_version`);
    const tx = db.transaction(() => {
        for (const [name, config] of Object.entries(GAME_CONFIG)) {
            stmt.run(name, config.current.version);
        }
    });

    tx();
}

export { db };