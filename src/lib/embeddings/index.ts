import * as vscode from "vscode";
import { AgentAI, Chunk, Embedding, SearchResult } from "../types";
import DatabaseSql from "../../config";




export default class EmbeddingService {

    private chunkText(
        text: string,
        path: string,
        chunkSize = 500,
        overlap = 100,
    ): Chunk[] {
        const chunks: Chunk[] = [];

        let start = 0;
        let index = 0;

        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);

            chunks.push({
                index,
                content: text.slice(start, end),
                start,
                end,
                filePath: path,
                hash: "",
                language: ""
            });

            if (end === text.length) break;

            start = end - overlap;
            index++;
        }

        return chunks;
    }

    async embeddings(agent: AgentAI, text: string, path: string) {
        const chunks = this.chunkText(text, path);

        const vectors = [];

        for (const chunk of chunks) {
            // panggil embedding model di sini
            const embedding = await agent.embedding(chunk.content);

            if (embedding) {
                vectors.push({
                    ...chunk,
                    embedding,
                });
            }
        }

        return vectors;
    }

    private async getSingleEmbedding(agent: AgentAI, text: string): Promise<number[]> {
        const response = await agent.embedding(text);
        return response;
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length || vecA.length === 0) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Mencari chunk paling relevan dari daftar DB berdasarkan query user
    async searchQuery(
        agent: AgentAI,
        query: string,
        storedEmbeddings: Embedding[],
        topK = 5
    ): Promise<SearchResult[]> {
        const queryVector = await this.getSingleEmbedding(agent, query);

        if (!queryVector || queryVector.length === 0) {
            return [];
        }

        const results: SearchResult[] = storedEmbeddings.map((item) => {
            const vectorArray = typeof item.embedding === 'string'
                ? JSON.parse(item.embedding)
                : item.embedding;

            const similarity = this.cosineSimilarity(queryVector, vectorArray);

            return {
                item,
                similarity,
            };
        });

        return results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    }


async emebddingFiles(agent: AgentAI, database: DatabaseSql) {
    const includePattern =
        "**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,php,prisma,sql,py,go,java,kt,kts,cs,rb,rs,json,yaml,yml,toml,xml,graphql,gql,html,css,scss,sass,less,md}";

    const excludePattern =
        "**/{node_modules,vendor,dist,build,.next,.nuxt,coverage,.git,storage/framework,bootstrap/cache}/**";

    const files = await vscode.workspace.findFiles(
        includePattern,
        excludePattern
    );
    for (const uri of files) {
        let document: vscode.TextDocument;

        try {
            document = await vscode.workspace.openTextDocument(uri);
        } catch {
            continue;
        }

        const text = document.getText();
        if (!text.trim()) {
            continue;
        }
        const findPath = await database.getEmbeddingsByPath(uri.path);
        if (findPath) {
            console.log("Context: ", findPath);
            return;
        }
        const vectors = await this.embeddings(agent, text, uri.path);
        await database.saveEmbeddings(vectors);
    }
}
}