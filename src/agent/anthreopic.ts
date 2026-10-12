import Anthropic from "@anthropic-ai/sdk";
import { AgentAI, Model, ResponseAI } from "../lib/types";
import vscode from "vscode";

export default class AnthropicAgent implements AgentAI {
    private client: Anthropic;

    constructor(apikey: string) {
        this.client = new Anthropic({
            apiKey: apikey
        });
    }

    async sendMessage(prompt: string, model: string, retry?: number, signal?: AbortSignal): Promise<ResponseAI> {
        try {
            const response = await this.client.messages.create(
                {
                    model: model || "claude-3-5-sonnet-20241022",
                    max_tokens: 4096,
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                },
                {
                    signal // Mendukung AbortController untuk membatalkan request
                }
            );

            // Mengambil konten teks dari response block
            const textContent = response.content.find(block => block.type === "text");
            const text = textContent ? textContent.text : "";
            const totalInput = response.usage.input_tokens ?? 0;
            const totalOutput = response.usage.output_tokens ?? 0;
            return {
                text,
                totalTokens: {
                    input: totalInput,
                    output: totalOutput
                }
            };
        } catch (error: any) {
            if (retry && retry > 0) {
                console.warn(`[Anthropic] Retrying sendMessage... Sisa attempt: ${retry}`);
                return this.sendMessage(prompt, model, retry - 1, signal);
            }
            vscode.window.showErrorMessage(error.message);
            throw error;
        }
    }

    async getModels(): Promise<Model[]> {
        const models: Model[] = [];

        for await (const model of this.client.models.list({
            lifecycle: ["active"],
            limit: 100,
        })) {
            models.push({
                name: model.display_name,
                code_name: model.id,
                isChat: true,
                isEmbedding: false,
                selectedIndexing: false,
                selectedExecutor: false,
                selectedPlanning: false,
            });
        }

        return models;
    }

    async countTokens(text: string): Promise<number> {
        try {
            const response = await this.client.messages.countTokens({
                model: "claude-3-5-sonnet-20241022",
                messages: [
                    {
                        role: "user",
                        content: text
                    }
                ]
            });
            return response.input_tokens;
        } catch (error) {
            console.error("[Anthropic] Gagal menghitung token:", error);
            return Math.ceil(text.length / 4);
        }
    }

    async embedding(prompt: string, model: string, signal?: AbortSignal): Promise<number[]> {
        throw new Error("Anthropic tidak mendukung fitur embedding secara native. Gunakan OpenAI atau Gemini untuk embedding.");
    }
}