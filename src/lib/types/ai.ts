// export enum AIProviderEnum {
//     GEMINI = 'GEMINI',
//     OPENAI = 'OPENAI',
//     ANTHROPIC = 'ANTHROPIC',
//     // OLLAMA = 'OLLAMA',
//     // CUSTOM = 'CUSTOM'
// }

export type AIProviderEnum = "GEMINI" | "OPENAI" | "ANTHROPIC";

export interface AIProviderData {
    id?: number;
    provider: AIProviderEnum | string;
    api_key?: string;
    base_url?: string;
    is_active?: number;
}

export interface AIModelData {
    id?: number;
    provider_id: number;
    provider_name: AIProviderEnum | string;
    model_code: string;
    model_name: string;
    type?: 'LLM' | 'EMBEDDING';
    max_tokens?: number;
    is_default?: number;
}