import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lancedb from '@lancedb/lancedb';
import { AIModelData, AIProviderData, Embedding } from '../lib/types';
import { DocumentationResult } from '../lib/types/documentation';

export default class DatabaseLance {
    private db: lancedb.Connection | null = null;
    private dbPath: string = '';

    async init(context: vscode.ExtensionContext): Promise<void> {
        if (this.db) return;

        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }

        // LanceDB menyimpan data dalam bentuk direktori/folder, bukan file tunggal
        this.dbPath = path.join(storagePath, 'lancedb_data');

        // Hubungkan atau buat database LanceDB di folder globalStorage
        this.db = await lancedb.connect(this.dbPath);

        // Ambil daftar tabel yang sudah ada
        const tableNames = await this.db.tableNames();

        if (!tableNames.includes('embeddings')) {
            // Membuat tabel awal dengan 1 baris dummy agar skema dan tipe vektor terdeteksi otomatis oleh LanceDB
            await this.db.createTable('embeddings', [{
                id: 0,
                file_path: '',
                chunk_index: 0,
                start_line: 0,
                end_line: 0,
                hash: '',
                language: '',
                content: '',
                vector: new Array(3072).fill(0), // Sesuaikan dimensi vektor Anda (misal 768 atau 1536)
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

            // Hapus baris dummy pertama agar tabel kembali bersih
            const table = await this.db.openTable('embeddings');
            await table.delete('id = 0');
        }

        if (!tableNames.includes('ai_providers')) {
            await this.db.createTable('ai_providers', [{
                id: 0,
                provider: '',
                api_key: '',
                base_url: '',
                is_active: 1,
                created_at: '',
                updated_at: ''
            }]);
            const table = await this.db.openTable('ai_providers');
            await table.delete('id = 0');
        }

        if (!tableNames.includes('ai_models')) {
            await this.db.createTable('ai_models', [{
                id: 0,
                provider_id: 0,
                provider_name: '',
                model_code: '',
                model_name: '',
                type: 'LLM',
                max_tokens: 0,
                is_default: 0,
                created_at: '',
                updated_at: ''
            }]);
            const table = await this.db.openTable('ai_models');
            await table.delete('id = 0');
        }

        if (!tableNames.includes('agent_configs')) {
            await this.db.createTable('agent_configs', [{
                id: 0,
                agent_type: '',
                model_id: 0,
                temperature: 0.0,
                system_prompt: '',
                created_at: '',
                updated_at: ''
            }]);
            const table = await this.db.openTable('agent_configs');
            await table.delete('id = 0');
        }

        if (!tableNames.includes('documentation_cache')) {
            await this.db.createTable('documentation_cache', [{
                id: 0,
                library: '',
                version: '',
                query: '',
                content: '',
                status: 'FOUND',
                cached: true,
                vector: new Array(3072).fill(0), // Sesuaikan dimensi vektor model Anda (misal 1536 atau 384)
                created_at: '',
                updated_at: ''
            }]);
            const table = await this.db.openTable('documentation_cache');
            await table.delete('id = 0');
        }
        console.log("✅ Database LanceDB berhasil di-init!");
    }

    async saveDocumentation(doc: DocumentationResult, vector: number[]): Promise<void> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const table = await this.db.openTable("documentation_cache");

        const row = {
            library: doc.library,
            version: doc.version || "",
            query: doc.query,
            content: doc.content,
            status: doc.status,
            cached: doc.cached ? 1 : 0,
            vector: vector, // Kolom vector untuk pencarian berbasis semantik/embedding di LanceDB
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Tambahkan data ke tabel documentation_cache secara batch/single array
        await table.add([row]);
    }

    async searchDocumentation(queryEmbedding: number[], limit: number = 3): Promise<any[]> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        try {
            const table = await this.db.openTable("documentation_cache");

            const results = await table.vectorSearch(queryEmbedding)
                .limit(limit)
                .toArray();

            const validResults = results.filter((doc: any) => doc._distance === undefined || doc._distance <= 0.6);

            return validResults;
        } catch (error) {
            console.error("Gagal melakukan pencarian dokumentasi:", error);
            return [];
        }
    }

    async clearEmbeddingsTable(): Promise<void> {
        try {
            if (!this.db) throw new Error("Database belum diinisialisasi");

            const table = await this.db.openTable("embeddings");

            // Menghapus semua baris di mana id bernilai angka berapa pun atau tidak null
            await table.delete("id IS NOT NULL OR id IS NULL");

            console.log("Semua isi tabel embeddings berhasil dihapus.");
        } catch (error) {
            console.error("Gagal menghapus isi tabel embeddings:", error);
            throw error;
        }
    }

    async searchEmbeddings(queryVector: number[], limit: number = 5, rootPath?: string) {
        try {
            if (!this.db) throw new Error("Database belum diinisialisasi");

            const table = await this.db.openTable("embeddings");

            let query = table.vectorSearch(queryVector).limit(limit);

            if (rootPath) {
                query = query.filter(`file_path LIKE '${rootPath}%'`);
            }

            const results = await query.toArray();

            return results;
        } catch (error) {
            console.error('Gagal melakukan vector search dengan root path:', error);
            throw error;
        }
    }


    async saveEmbeddings(vectors: Embedding[]): Promise<void> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const table = await this.db.openTable("embeddings");

        // Format data agar sesuai dengan skema tabel embeddings di LanceDB
        const rows = vectors.map(item => ({
            file_path: item.filePath,
            chunk_index: item.index,
            start_line: item.start,
            end_line: item.end,
            hash: item.hash,
            language: item.language,
            content: item.content,
            vector: item.embedding, // LanceDB menggunakan kolom bertipe vector (array float)
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));

        // Tambahkan data ke tabel secara batch
        await table.add(rows);
    }

    async getAllEmbeddings(): Promise<Embedding[]> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const table = await this.db.openTable("embeddings");

        // Ambil seluruh data menggunakan .toArray()
        const results = await table.query().toArray();

        return results.map((row: any) => ({
            filePath: row.file_path as string,
            index: row.chunk_index as number,
            start: row.start_line as number,
            end: row.end_line as number,
            hash: row.hash as string,
            language: row.language as string,
            content: row.content as string,
            embedding: row.vector as number[] // Langsung berupa array float
        }));
    }

    async getEmbeddingsByPath(filePath: string): Promise<Embedding[]> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const table = await this.db.openTable("embeddings");

        // Gunakan query dengan filter file_path
        const results = await table
            .query()
            .where(`file_path = '${filePath.replace(/'/g, "''")}'`)
            .toArray();

        return results.map((row: any) => ({
            filePath: row.file_path as string,
            index: row.chunk_index as number,
            start: row.start_line as number,
            end: row.end_line as number,
            hash: row.hash as string,
            language: row.language as string,
            content: row.content as string,
            embedding: row.vector as number[]
        }));
    }

    async deleteEmbeddingsByPath(filePath: string): Promise<void> {
        if (!this.db) throw new Error("Database belum diinisialisasi");

        const table = await this.db.openTable("embeddings");
        const queryPath = filePath.includes('*') ? filePath.replace(/\*/g, '%') : filePath;

        // LanceDB menggunakan method delete dengan SQL-like condition string
        if (queryPath.includes('%')) {
            // Ubah wildcard SQL 'LIKE' ke kondisi LanceDB
            const cleanPath = queryPath.replace(/%/g, '');
            await table.delete(`file_path LIKE '%${cleanPath}%'`);
        } else {
            await table.delete(`file_path = '${queryPath.replace(/'/g, "''")}'`);
        }

    }

    async getProviders(): Promise<AIProviderData[]> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_providers");
        const results = await table.query().toArray();

        return results.map((row: any) => ({
            id: row.id as number,
            provider: row.provider as string,
            api_key: row.api_key as string,
            base_url: row.base_url as string,
            is_active: row.is_active as number
        }));
    }

    async getProviderById(id: number): Promise<AIProviderData | null> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_providers");
        const results = await table
            .query()
            .where(`id = ${id}`)
            .limit(1)
            .toArray();

        if (results.length === 0) return null;

        const row: any = results[0];
        return {
            id: row.id as number,
            provider: row.provider as string,
            api_key: row.api_key as string,
            base_url: row.base_url as string,
            is_active: row.is_active as number
        };
    }

    async deleteProvider(id: number): Promise<boolean> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_providers");
        await table.delete(`id = ${id}`);

        return true;
    }

    // ==========================================
    // AI MODELS METHODS
    // ==========================================

    async createModel(data: AIModelData) {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_models");

        // Tentukan ID baru secara manual (misalnya menggunakan timestamp atau increment sederhana jika belum ada auto-increment di LanceDB)
        const existingRows = await table.query().toArray();
        const newId = existingRows.length > 0 ? Math.max(...existingRows.map((r: any) => r.id || 0)) + 1 : 1;

        const newRow = {
            id: newId,
            provider_id: data.provider_id,
            provider_name: data.provider_name,
            model_code: data.model_code,
            model_name: data.model_name,
            type: data.type || 'LLM',
            max_tokens: data.max_tokens || undefined,
            is_default: data.is_default ?? 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await table.add([newRow]);
        return newRow;
    }

    async getModels(providerId?: number): Promise<AIModelData[]> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_models");

        let query = table.query();
        if (providerId !== undefined) {
            query = query.where(`provider_id = ${providerId}`);
        }

        const results = await query.toArray();

        return results.map((row: any) => ({
            id: row.id as number,
            provider_id: row.provider_id as number,
            provider_name: row.provider_name as string,
            model_code: row.model_code as string,
            model_name: row.model_name as string,
            type: row.type as 'LLM' | 'EMBEDDING',
            max_tokens: row.max_tokens as number,
            is_default: row.is_default as number
        }));
    }

    async getModelById(modelId: number): Promise<AIModelData | null> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_models");

        // Mencari data berdasarkan id model
        const results = await table
            .query()
            .where(`id = ${modelId}`)
            .limit(1)
            .toArray();

        if (!results || results.length === 0) {
            return null;
        }

        const row = results[0] as any;

        return {
            id: row.id as number,
            provider_id: row.provider_id as number,
            provider_name: row.provider_name as string,
            model_code: row.model_code as string,
            model_name: row.model_name as string,
            type: row.type as 'LLM' | 'EMBEDDING',
            max_tokens: row.max_tokens as number,
            is_default: row.is_default as number
        };
    }

    async deleteModel(id: number): Promise<boolean> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_models");
        await table.delete(`id = ${id}`);

        return true;
    }

    async saveAgentConfig(config: {
        agentType: 'PLANNER' | 'EXECUTOR' | 'EMBEDDING' | 'CONTEXT_BUILDER';
        modelId: number;
        temperature: number;
        systemPrompt: string;
    }) {
        try {
            if (!this.db) throw new Error("Database belum diinisialisasi");

            const table = await this.db.openTable('agent_configs');
            const now = new Date().toISOString();

            const existing = await table
                .query()
                .where(`agent_type = '${config.agentType}'`)
                .toArray();

            if (existing && existing.length > 0) {
                await table.delete(`agent_type = '${config.agentType}'`);
            }

            await table.add([
                {
                    id: Date.now(), // Menggunakan timestamp unik sebagai ID
                    agent_type: config.agentType,
                    model_id: config.modelId,
                    temperature: config.temperature,
                    system_prompt: config.systemPrompt,
                    created_at: existing && existing.length > 0 ? existing[0].created_at : now,
                    updated_at: now
                }
            ]);

            return { success: true, action: existing && existing.length > 0 ? 'UPDATED' : 'CREATED' };
        } catch (error) {
            console.error(`Gagal menyimpan konfigurasi agent ${config.agentType}:`, error);
            throw error;
        }
    }

    async getAgentConfig(agentType: 'PLANNER' | 'EXECUTOR' | 'EMBEDDING' | "CONTEXT_BUILDER") {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        //  Ambil data agent_config berdasarkan agentType
        const configTable = await this.db.openTable("agent_configs");
        const configs = await configTable
            .query()
            .where(`agent_type = '${agentType}'`)
            .limit(1)
            .toArray();

        if (configs.length === 0) return null;
        const config: any = configs[0];

        return config;
    }

    async createProvider(data: { provider: string; api_key: string; base_url?: string; is_active?: number }): Promise<number> {
        if (!this.db) throw new Error("Database belum di-inisialisasi.");

        const table = await this.db.openTable("ai_providers");

        // Tentukan ID baru secara manual (mencari max ID yang ada)
        const existingRows = await table.query().toArray();
        const newId = existingRows.length > 0 ? Math.max(...existingRows.map((r: any) => r.id || 0)) + 1 : 1;

        const newRow = {
            id: newId,
            provider: data.provider,
            api_key: data.api_key,
            base_url: data.base_url || '',
            is_active: data.is_active ?? 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await table.add([newRow]);
        return newId; // Mengembalikan ID provider yang baru saja dibuat
    }
}