import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

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
                server TEXT NOT NULL,
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
        () => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS accounts_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    game_uid INTEGER NULL,
                    server TEXT NOT NULL,
                    label TEXT NULL,
                    FOREIGN KEY (game_id) REFERENCES games(id)
                );

                INSERT INTO accounts_new SELECT * FROM accounts;

                DROP TABLE accounts;

                ALTER TABLE accounts_new RENAME TO accounts;
            `);
        },
        () => {
            db.exec(`
                DELETE FROM tasks WHERE game_id = (SELECT id FROM games WHERE name = 'Arknights Endfield');
                DELETE FROM accounts WHERE game_id = (SELECT id FROM games WHERE name = 'Arknights Endfield');
                DELETE FROM games WHERE name = 'Arknights Endfield';
            `);
        }
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

export function seedDatabase(GAME_CONFIG) {
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
                    label: "Character Pixel",
                    type: "Daily",
                    game: "Neverness To Everness"
                },
                {
                    label: "Vital Energy, Daily Wishes, Starlit Moments, Star Collecting",
                    type: "Daily",
                    game: "Infinity Nikki"
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
                    label: "Weekly Realm, Starlit Pursuit, Merit Arena",
                    type: "Weekly",
                    game: "Infinity Nikki"
                },
                {
                    label: "Weekly Bosses",
                    type: "Weekly",
                    game: "Neverness To Everness"
                },
                {
                    label: "City Stamina",
                    type: "Weekly",
                    game: "Neverness To Everness"
                },
                {
                    label: "Pink Paws Heist",
                    type: "Weekly",
                    game: "Neverness To Everness"
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
                },
                {
                    label: "Mira Crown",
                    type: "Endgame",
                    game: "Infinity Nikki"
                },
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

export function syncGameConfig(GAME_CONFIG) {
    const upsert = db.prepare(`INSERT INTO games (name, current_version) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET current_version = excluded.current_version, is_active = 1`);
    const deactivate = db.prepare(`UPDATE games SET is_active = 0 WHERE name NOT IN (${Object.keys(GAME_CONFIG).map(() => '?').join(',')})`);
    
    const tx = db.transaction(() => {
        for (const [name, config] of Object.entries(GAME_CONFIG)) {
            upsert.run(name, config.current.version);
        }
        deactivate.run(...Object.keys(GAME_CONFIG));
    });

    tx();
}

export { db };