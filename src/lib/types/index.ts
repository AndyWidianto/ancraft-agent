import type { InformationRequest, Operation } from "./operation";

export * from "./operation"
export * from "./ai"
export * from "./background"



export interface SearchResult {
    item: Embedding;
    similarity: number;
}


export type StepType =
    | "INSPECTION"
    | "DATABASE"
    | "BACKEND"
    | "API"
    | "FRONTEND"
    | "DESIGN"
    | "INTEGRATION"
    | "VALIDATION"
    | "SETUP";


export interface Step {
    id: number;
    title: string;
    description: string;
    type: StepType;
}

export interface TechStack {
    frontend: string[];
    // backend: string[];
    // database: string[];
    // state_management: never[];
    // styling: string[];
    // other: string[];
}



export interface OutputPlan {
    goal: {
        title: string;
        description: string;
    };
    project_context: {
        tech_stack: TechStack;
        architecture: string;
        design: {
            style: string;
            design_system: string;
            responsive: boolean;
            notes: string[];
        };
        coding_style: {
            language: string;
            conventions: string[];
            patterns: string[];
        };
    };
    steps: Step[];
}

export interface Planning extends OutputPlan {
    status: StatusTask,
    id: string;
}



export interface CreateOperation {
    type: "CREATE";
    path: string;
    content: string;
}

export interface ModifyOperation {
    type: "MODIFY";
    path: string;
    changes: {
        search: string;
        replace: string;
    }[];
}

export interface DeleteOperation {
    type: "DELETE";
    path: string;
}

export interface CommandOperation {
    type: "COMMAND";
    command: string;
    cwd?: string;
}

export type ExecutorOperation =
    | CreateOperation
    | ModifyOperation
    | DeleteOperation
    | CommandOperation;

export interface ExecuteResult {
    step_id: number;
    status: "READY" | "NO_CHANGES" | "BLOCKED";
    summary: string;
    operations: ExecutorOperation[];
    discoveries: string[];
    missing_context: string[];
    context_for_next_step: string[];
    requires_refresh: boolean;
}

export interface ExecutionError {
    operation?: unknown;
    message: string;
    stdout?: string;
    stderr?: string;
}



export interface ProjectContextOptions {
    maxTreeDepth?: number;
    /** Files or folders to explicitly ignore */
    ignorePatterns?: string[];
}

export interface PlanStepResult {
    requires_refresh: boolean;
    discoveries: string[];
    missing_context: string[];
    context_for_next_step: string[];
}

export interface Chunk {
    index: number;
    content: string;
    start: number;
    end: number;
    filePath: string;
    hash: string;
    language: string;
}

export interface Embedding extends Chunk {
    embedding: number[]
}

export interface Question {
    key: string;
    title: string;
    description: string;
    required: boolean; // Gunakan tipe 'boolean', bukan literal 'true' agar fleksibel
    multiple: boolean;
    options: string[];
}

export type AnalysisStatus =
    | "NEED_INFORMATION"
    | "SETUP_REQUIRED"
    | "READY";

export interface AnalysisTechStack {
    frontend: string | null;
    language: string | null;
    styling: string | null;
    state_management: string | null;
    routing: string | null;
}

export interface AnalysisQuestion {
    key: string;
    title: string;
    description: string;
    required: boolean;
    multiple: boolean;
    options: string[];
}

export type StatusTask = "CONTINUE" | "DONE" | "BLOCKED";


export interface NeedContext {
    status: "NEED_CONTEXT",
    reason: string
    queries: string[]
}

export interface ReadyOperation {
    status: "READY",
    summary: string;
    operations: []
}

export interface Model {
    name: string;
    code_name: string;
    isEmbedding: boolean;
    isChat: boolean;
    selectedIndexing: boolean;
    selectedPlanning: boolean;
    selectedExecutor: boolean;
}


export interface ResponseAI {
    text: string,
    totalTokens: { input: number; output: number }
}
export interface AgentAI {
    sendMessage(prompt: string, model: string, retry?: number, signal?: AbortSignal): Promise<ResponseAI>;
    embedding(prompt: string, model: string, signal?: AbortSignal, dimensions?: number): Promise<number[]>;
    countTokens(text: string): Promise<number>;
    getModels(): Promise<Model[]>
}


export interface OperationResult {
    type: Operation['type'];
    summary: string;     // Ringkasan aksi (misal: "Created src/components/Header.tsx")
    status: "DONE" | "FAILED";
    error?: string;      // Detail error jika FAILED (maksimal 200-300 karakter)
    timestamp: string;
}

export interface TaskHistory {
    taskId: string | number;
    description: string;
    status: "DONE" | "FAILED";
    operations: OperationResult[];
}



export interface SearchRelevantCode {
    status: "READY" | "NEED_CONTEXT",
    information_requests: InformationRequest[],
    query?: string;
}


export interface BuildTask {
    id: string;
    status: StatusTask,
    task: string,
    reason: string
    type: "SETUP" | "EXECUTE";
    history?: {
        context: string[];
        query: string[];
    }
}


export interface ResponseDocument {
    text: string;
    isNotFound: boolean;
}