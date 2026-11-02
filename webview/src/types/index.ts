export type StatusTask = "TODO" | "IN_PROGRESS" | "DONE" | "FAILED";

export type StepType =
  | "FRONTEND"
  | "DESIGN"
  | "INTEGRATION"
  | "VALIDATION"
  | "SETUP";


export interface OperationCreate { apply?: boolean; id: number, type: "CREATE"; path: string; content: string; }
export interface OperationModify { apply?: boolean; id: number, type: "MODIFY"; path: string; changes: { search: string; replace: string }[]; }
export interface OperationDelete { apply?: boolean; id: number, type: "DELETE"; path: string; }
export interface OperationCommand { apply?: boolean; id: number, type: "COMMAND"; command: string; cwd: string; }
export type Operation = OperationCommand | OperationCreate | OperationDelete | OperationModify;

export type ActionType = 'TEXT' | "NEW_HISTORY" | "ERROR" | "GET_MODELS"
  | 'PLANNING' | 'NEW_TASK' | 'NEW_OPERATION' | 'UPDATE_OPERATION' | "UPDATE_STEP" |
  'UPDATE_TASK' | 'NEED_INFORMATION' | "MORE" | "SELECTED_MODEL" | "FINISH";


export type TypeMessage = "CONTINUE" | "DONE" | "BLOCKED" | "NEED_INFORMATION" | "TEXT";
export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text?: string;
  type: TypeMessage;
  operations?: Operation[];
  timestamp: string;
  questionnaireData?: any;
}

export interface QuestionnaireData {
  questions: Question[],
  currentStack?: Record<string, string[]>;
}

export interface Question {
  key: string;
  title: string;
  description: string;
  required: boolean; // Gunakan tipe 'boolean', bukan literal 'true' agar fleksibel
  multiple: boolean;
  options: string[];
}


export interface TechStackData {
  [key: string]: string[];
}



export interface UserMessage {
  text: string;
  model: string;
}
export interface TextMessage {
  command: "SEND_MESSAGE";
  action: "TEXT";
  data: UserMessage;
}

export type TypeProvider = "GEMINI" | "OPENAI" | "ANTHROPIC" | "DEEPSEEK";


export interface Model {
  name: string;
  code_name: string;
  isChat: boolean;
  isEmbedding: boolean;
  selectedIndexing: boolean;
  selectedPlanning: boolean;
  selectedExecutor: boolean;
}

export interface Agent {
  provider: string;
  apikey: string;
  models: Model[];
}

export interface ModelAgent {
  provider: string;
  apikey: string;
  model: string;
}


// Discriminated Union untuk gabungan semua message yang dikirim
export type BackgroundMessage = ExecuteTaskMessage | TextMessage;

export type AIProviderEnum = "GEMINI" | "OPENAI" | "ANTHROPIC";


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


export interface ModelState {
  planning: AIModelData | null;
  executor: AIModelData | null;
  indexing: AIModelData | null;
  context: AIModelData | null;
}


export interface Task {
  status: "CONTINUE" | "DONE" | "BLOCKED";
  task: string;
  reason: string;
  id: string;
  operations?: Operation[];
  history?: {
    context: string[];
    query: string[];
  }
}

export interface ExecuteTaskMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_TASK";
  message: UserMessage;
  task: Task;
}

export interface ValidateTaskMessage {
  command: "SEND_MESSAGE";
  action: "VALIDATE_TASK";
  message: UserMessage;
  history: string[];
}