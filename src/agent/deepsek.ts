import OpenAI from "openai";
import * as vscode from "vscode";
import { AgentAI, Model, ResponseAI } from "../lib/types";

export default class DeepSeekService implements AgentAI {
    private client: OpenAI;

    constructor(apikey: string) {
        this.client = new OpenAI({
            apiKey: apikey,
            baseURL: "https://api.deepseek.com",
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async sendMessage(
        message: string,
        model = "deepseek-chat",
        retries = 3
    ): Promise<ResponseAI> {
        try {
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
                err?.message?.includes("rate limit") ||
                err?.status === 429;

            if (isServerOverload && retries > 0) {
                console.warn(`[DeepSeek Overload/Rate Limit] Server sedang sibuk. Menunggu 1 menit... (Sisa retry: ${retries})`);

                vscode.window.showWarningMessage(`DeepSeek API sedang mengalami high demand / rate limit. Menunggu 1 menit sebelum mencoba lagi...`);

                await this.delay(60000); // Menunggu 1 menit
                return this.sendMessage(message, model, retries - 1);
            }
            vscode.window.showErrorMessage(err.message);
            throw err;
        }
    }

    async embedding(message: string, model = "text-embedding-ada-002"): Promise<number[]> {

        const response = await this.client.embeddings.create({
            model: model,
            input: message,
        });

        const embed = response?.data?.[0]?.embedding;
        if (!embed) {
            throw new Error("Gagal mendapatkan vector embedding dari API.");
        }
        return embed;
    }

    async countTokens(text: string, model = "deepseek-chat"): Promise<number> {
        if (!text) return 0;

        const words = text.trim().split(/\s+/).length;
        return Math.ceil(words * 1.3);
    }

    async getModels(): Promise<Model[]> {
        const response = await this.client.models.list();

        const models = response.data
            .filter(d => {
                const id = d.id.toLowerCase();
                return id.includes('deepseek');
            })
            .map<Model>(m => {
                const id = m.id.toLowerCase();
                const isEmbedding = id.includes('embedding');
                const isChat = !isEmbedding; // Anggap selain embedding adalah model chat/reasoner

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