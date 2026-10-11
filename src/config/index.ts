import type { Database } from 'sql.js';
import { AIModelData, AIProviderData, Embedding } from "../lib/types";
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

if (typeof (globalThis as any).exports === 'undefined') {
    (globalThis as any).exports = {};
}

const initSqlJs = require('sql.js');

export default class DatabaseSql {
    private db: Database | null = null;
    private dbPath: string = '';

    async init(context: vscode.ExtensionContext): Promise<void> {
        if (this.db) return;

        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.dbPath = path.join(storagePath, 'embeddings_data.db');

        const wasmUri = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

        const SQL = await initSqlJs({
            locateFile: () => wasmUri.fsPath
        });

        if (fs.existsSync(this.dbPath)) {
            const fileBuffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(fileBuffer);
        } else {
            this.db = new SQL.Database();
        }

        // Aktifkan Foreign Keys di SQLite
        this.db?.run(`PRAGMA foreign_keys = ON;`);

        this.db?.run(`
            CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT,
                chunk_index INTEGER,
                start_line INTEGER,
                end_line INTEGER,
                hash TEXT,
                language TEXT,
                content TEXT,
                embedding TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ai_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT UNIQUE NOT NULL,
                api_key TEXT,
                base_url TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ai_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_id INTEGER NOT NULL,
                provider_name TEXT NOT NULL,
                model_code TEXT UNIQUE NOT NULL,
                model_name TEXT NOT NULL,
                type TEXT DEFAULT 'LLM',
                max_tokens INTEGER,
                is_default INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (provider_id) REFERENCES ai_providers (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_type TEXT UNIQUE NOT NULL,
                model_id INTEGER NOT NULL,
                temperature REAL DEFAULT 0.2,
                system_prompt TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (model_id) REFERENCES ai_models (id) ON DELETE CASCADE
            );
        `);

        // Seed default config untuk PLANNER, EXECUTOR, dan EMBEDDING
        this.db?.run(`
            INSERT OR IGNORE INTO agent_configs (agent_type, model_id, temperature)
            SELECT 'PLANNER', id, 0.2 FROM ai_models WHERE type = 'LLM' AND is_default = 1 LIMIT 1;

            INSERT OR IGNORE INTO agent_configs (agent_type, model_id, temperature)
            SELECT 'EXECUTOR', id, 0.4 FROM ai_models WHERE type = 'LLM' AND is_default = 1 LIMIT 1;

            INSERT OR IGNORE INTO agent_configs (agent_type, model_id, temperature)
            SELECT 'EMBEDDING', id, 0.0 FROM ai_models WHERE type = 'EMBEDDING' AND is_default = 1 LIMIT 1;
        `);

        this.saveToDisk();
        console.log("✅ Database sql.js berhasil di-init dengan tabel providers & models!");
    }

    private saveToDisk(): void {
        if (!this.db) return;
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }
    async saveEmbeddings(vectors: Embedding[]): Promise<void> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const insertQuery = `
            INSERT INTO embeddings (
                file_path,
                chunk_index,
                start_line,
                end_line,
                hash,
                language,
                content,
                embedding,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'))
        `;

        this.db.run("BEGIN TRANSACTION");
        try {
            for (const item of vectors) {
                this.db.run(insertQuery, [
                    item.filePath,
                    item.index,
                    item.start,
                    item.end,
                    item.hash,
                    item.language,
                    item.content,
                    JSON.stringify(item.embedding)
                ]);
            }
            this.db.run("COMMIT");
        } catch (error) {
            this.db.run("ROLLBACK");
            throw error;
        }

        this.saveToDisk();
    }

    async getAllEmbeddings(): Promise<Embedding[]> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const res = this.db.exec(`
            SELECT 
                file_path,
                chunk_index,
                start_line,
                end_line,
                hash,
                language,
                content,
                embedding
            FROM embeddings
        `);

        if (res.length === 0) return [];

        return res[0].values.map((row) => ({
            filePath: row[0] as string,
            index: row[1] as number,
            start: row[2] as number,
            end: row[3] as number,
            hash: row[4] as string,
            language: row[5] as string,
            content: row[6] as string,
            embedding: JSON.parse(row[7] as string) as number[],

        }));
    }

    async getEmbeddingsByPath(filePath: string): Promise<Embedding[]> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const res = this.db.exec(`
            SELECT 
                file_path,
                chunk_index,
                start_line,
                end_line,
                hash,
                language,
                content,
                embedding
            FROM embeddings
            WHERE file_path = ?
        `, [filePath]);

        if (res.length === 0) return [];

        return res[0].values.map((row) => ({
            filePath: row[0] as string,
            index: row[1] as number,
            start: row[2] as number,
            end: row[3] as number,
            hash: row[4] as string,
            language: row[5] as string,
            content: row[6] as string,
            embedding: JSON.parse(row[7] as string) as number[]
        }));
    }

    async deleteEmbeddingsByPath(filePath: string): Promise<void> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        this.db.run(`DELETE FROM embeddings WHERE file_path = ?`, [filePath]);
        this.saveToDisk();
    }

    async createProvider(data: AIProviderData): Promise<number> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        this.db.run(
            `INSERT INTO ai_providers (provider, api_key, base_url, is_active) 
             VALUES (?, ?, ?, ?);`,
            [data.provider, data.api_key || '', data.base_url || '', data.is_active ?? 1]
        );

        this.saveToDisk();

        // Ambil ID dari row yang baru dimasukkan
        const result = this.db.exec("SELECT last_insert_rowid() as id;");
        return result[0].values[0][0] as number;
    }

    async getProviders(): Promise<AIProviderData[]> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const res = this.db.exec("SELECT id, provider, api_key, base_url, is_active FROM ai_providers;");
        if (res.length === 0) return [];

        return res[0].values.map(row => ({
            id: row[0] as number,
            provider: row[1] as string,
            api_key: row[2] as string,
            base_url: row[3] as string,
            is_active: row[4] as number
        }));
    }

    async getProviderById(id: number): Promise<AIProviderData | null> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const stmt = this.db.prepare("SELECT id, provider, api_key, base_url, is_active FROM ai_providers WHERE id = ?;");
        stmt.bind([id]);

        if (stmt.step()) {
            const row = stmt.get();
            stmt.free();
            return {
                id: row[0] as number,
                provider: row[1] as string,
                api_key: row[2] as string,
                base_url: row[3] as string,
                is_active: row[4] as number
            };
        }

        stmt.free();
        return null;
    }

    async deleteProvider(id: number): Promise<boolean> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        this.db.run("DELETE FROM ai_providers WHERE id = ?;", [id]);
        this.saveToDisk();
        return true;
    }

    // ==========================================
    // AI MODELS METHODS
    // ==========================================

    async createModel(data: AIModelData): Promise<number> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        this.db.run(
            `INSERT INTO ai_models (provider_id, provider_name, model_code, model_name, type, max_tokens, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [
                data.provider_id,
                data.provider_name,
                data.model_code,
                data.model_name,
                data.type || 'LLM',
                data.max_tokens || null,
                data.is_default ?? 0
            ]
        );

        this.saveToDisk();

        const result = this.db.exec("SELECT last_insert_rowid() as id;");
        return result[0].values[0][0] as number;
    }

    async getModels(providerId?: number): Promise<AIModelData[]> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const query = providerId
            ? "SELECT id, provider_id, provider_name, model_code, model_name, type, max_tokens, is_default FROM ai_models WHERE provider_id = ?;"
            : "SELECT id, provider_id, provider_name, model_code, model_name, type, max_tokens, is_default FROM ai_models;";

        const params = providerId ? [providerId] : [];
        const stmt = this.db.prepare(query);
        stmt.bind(params);

        const models: AIModelData[] = [];
        while (stmt.step()) {
            const row = stmt.get();
            models.push({
                id: row[0] as number,
                provider_id: row[1] as number,
                provider_name: row[2] as string,
                model_code: row[3] as string,
                model_name: row[4] as string,
                type: row[5] as 'LLM' | 'EMBEDDING',
                max_tokens: row[6] as number,
                is_default: row[7] as number
            });
        }

        stmt.free();
        return models;
    }

    async deleteModel(id: number): Promise<boolean> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        this.db.run("DELETE FROM ai_models WHERE id = ?;", [id]);
        this.saveToDisk();
        return true;
    }

    async getAgentConfig(agentType: 'PLANNER' | 'EXECUTOR' | 'EMBEDDING') {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const query = `
            SELECT 
                ac.agent_type,
                ac.temperature,
                ac.system_prompt,
                am.model_code,
                am.model_name,
                am.type as model_type,
                ap.provider,
                ap.api_key,
                ap.base_url
            FROM agent_configs ac
            JOIN ai_models am ON ac.model_id = am.id
            JOIN ai_providers ap ON am.provider_id = ap.id
            WHERE ac.agent_type = ? AND ap.is_active = 1;
        `;

        const stmt = this.db.prepare(query);
        stmt.bind([agentType]);

        if (stmt.step()) {
            const row = stmt.get();
            stmt.free();
            return {
                agentType: row[0] as string,
                temperature: row[1] as number,
                systemPrompt: row[2] as string,
                modelCode: row[3] as string,
                modelName: row[4] as string,
                modelType: row[5] as string,
                provider: row[6] as string,
                apiKey: row[7] as string,
                baseUrl: row[8] as string
            };
        }

        stmt.free();
        return null;
    }
}