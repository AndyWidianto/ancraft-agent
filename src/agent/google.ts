import vscode from "vscode";
import { AgentAI, Model, ResponseAI } from "../lib/types";

type GoogleGenAIType = InstanceType<(typeof import('@google/genai'))['GoogleGenAI']>;

export class GoogleAgent implements AgentAI {
  private ai!: GoogleGenAIType;

  private constructor() { }
  public static async create({ apiKey }: { apiKey: string }): Promise<GoogleAgent> {
    const instance = new GoogleAgent();

    const { GoogleGenAI } = await (eval('import("@google/genai")') as Promise<
      typeof import('@google/genai')
    >);

    instance.ai = new GoogleGenAI({ apiKey });
    return instance;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendMessage(
    message: string,
    model = 'gemini-3.5-flash-lite',
    retries = 3,
    signal?: AbortSignal
  ): Promise<ResponseAI> {
    try {
      const response = await this.ai.interactions.create({
        model: model,
        input: message,
      }, { signal });

      const inputToken = response.usage?.total_input_tokens ?? 0;
      const outputToken = response.usage?.total_output_tokens ?? 0;
      const text = response.output_text || '';

      return { text: text, totalTokens: { input: inputToken, output: outputToken }};
    } catch (err: any) {
      console.log("Error: ", err);
      const isServerOverload =
        err?.status === 503 ||
        err?.statusCode === 503 ||
        err?.message?.includes('503') ||
        err?.message?.includes('high demand') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.status === 429;

      if (isServerOverload && retries > 0) {
        console.warn(`[Gemini Overload/Rate Limit] Server sedang sibuk. Menunggu 1 menit... (Sisa retry: ${retries})`);

        // Beri tahu user via VS Code notification agar tidak bingung
        vscode.window.showWarningMessage(`Gemini API sedang high demand (503). Menunggu 1 menit sebelum mencoba lagi...`);

        await this.delay(60000); // Wait 1 minute
        return this.sendMessage(message, model, retries - 1);
      }

      throw err;
    }
  }

  async embedding(message: string, model: string = "gemini-embedding-001") {
    const response = await this.ai.models.embedContent({
      model: model,
      contents: message
    });
    const embed = response?.embeddings?.[0].values;
    if (!embed) {
      throw new Error("Gagal mendapatkan vector embedding dari Gemini API.");
    }
    return embed;
  }

  async countTokens(text: string, model = 'gemini-3.1-flash-lite') {
    const response = await this.ai.models.countTokens({
      model,
      contents: text
    });

    const totalToken = response.totalTokens;
    if (!totalToken) return 0;
    return totalToken;
  }

  async getModels(): Promise<Model[]> {
    const response = await this.ai.models.list();

    const models: Model[] = [];

    for await (const m of response) {
      const codeModel = m.name?.replace(/^models\//, '') || '';


      const methods = m.supportedActions || [];
      const isChat = methods.includes('generateContent');
      const isEmbedding = methods.includes('embedContent');

      if (!isChat && !isEmbedding) {
        continue;
      }


      const isDeprecated =
        codeModel.includes('babbage') ||
        codeModel.includes('davinci') ||
        codeModel.includes('001') || // versi snapshot awal yang sudah disuntik mati
        codeModel.includes('text-bison');

      if (isDeprecated) {
        continue;
      }

      models.push({
        name: m.displayName || codeModel,
        code_name: codeModel,
        isEmbedding,
        isChat,
      });
    }

    return models;
  }
}