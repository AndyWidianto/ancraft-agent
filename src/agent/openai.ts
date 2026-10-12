import OpenAI from "openai";
import * as vscode from "vscode";
import { AgentAI, Model, ResponseAI } from "../lib/types";

export default class OpenAIService implements AgentAI {
    private client: OpenAI;

    constructor(apikey: string) {
        this.client = new OpenAI({
            apiKey: apikey,
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async sendMessage(
        message: string,
        model = "gemini-2.5-flash",
        retries = 3
    ): Promise<ResponseAI> {
        try {
            // Menggunakan Chat Completions standar OpenAI SDK
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: message }],
            });
            const text = response.choices[0]?.message?.content || "";
            const totalInput = response.usage?.prompt_tokens ?? 0;
            const totalOutput = response.usage?.completion_tokens ?? 0;

            return {
                text,
                totalTokens: {
                    input: totalInput,
                    output: totalOutput
                }
            };
        } catch (err: any) {
            console.log("Error: ", err);
            const isServerOverload =
                err?.status === 503 ||
                err?.statusCode === 503 ||
                err?.message?.includes("503") ||
                err?.message?.includes("high demand") ||
                err?.message?.includes("RESOURCE_EXHAUSTED") ||
                err?.status === 429;

            if (isServerOverload && retries > 0) {
                console.warn(`[Gemini Overload/Rate Limit] Server sedang sibuk. Menunggu 1 menit... (Sisa retry: ${retries})`);

                vscode.window.showWarningMessage(`Gemini API sedang high demand (503). Menunggu 1 menit sebelum mencoba lagi...`);

                await this.delay(60000); // Menunggu 1 menit
                return this.sendMessage(message, model, retries - 1);
            }
            vscode.window.showErrorMessage(err.message);
            throw err;
        }
    }

    async embedding(message: string, model = "text-embedding-004"): Promise<number[]> {
        // Menggunakan Embeddings standar OpenAI SDK
        const response = await this.client.embeddings.create({
            model: model,
            input: message,
        });

        const embed = response?.data?.[0]?.embedding;
        if (!embed) {
            throw new Error("Gagal mendapatkan vector embedding dari Gemini API.");
        }
        return embed;
    }

    async countTokens(text: string, model = "gemini-2.5-flash"): Promise<number> {
        if (!text) return 0;

        const words = text.trim().split(/\s+/).length;
        return Math.ceil(words * 1.3);
    }

    async getModels(): Promise<Model[]> {
        const response = await this.client.models.list();

        const models = response.data
            .filter(d => !d.shutdown_date && (d.owned_by === "system" || d.owned_by === "openai"))
            .filter(d => {
                const id = d.id.toLowerCase();
                // Hanya ambil model chat (gpt/o1/o3) atau model embedding
                const isChatModel = id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3');
                const isEmbeddingModel = id.includes('embedding');
                return isChatModel || isEmbeddingModel;
            })
            .map<Model>(m => {
                const id = m.id.toLowerCase();

                const isEmbedding = id.includes('embedding');
                const isChat = id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3');

                return {
                    name: m.id,
                    code_name: m.id,
                    isEmbedding,
                    isChat,
                    selectedIndexing: false,
                    selectedExecutor: false,
                    selectedPlanning: false,
                };
            });

        return models;
    }
}