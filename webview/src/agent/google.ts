import { GoogleGenAI } from "@google/genai";

export class GoogleAgent {
    private ai: GoogleGenAI;
    constructor({ apiKey }: { apiKey: string }) {
        this.ai = new GoogleGenAI({
            apiKey: apiKey,
        })
    }

    async sendMessage(message: string, model = "gemma-4-26b-a4b-it") {
        const response = await this.ai.interactions.create({
            model: model,
            input: message
        });
        return response.output_text;
    }
}