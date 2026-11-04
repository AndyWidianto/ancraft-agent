
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
  'UPDATE_TASK' | 'NEED_INFORMATION' | "MORE" | "SELECTED_MODEL" | "FINISH" | "REQUEST_INFORMATION";


export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text?: string;
  status: StatusTask;
  type: TypeTask;
  informationRequest?: InformationRequest[];
  operations?: Operation[];
  timestamp: string;
  questionnaireData?: any;
  options?: Option[];
}


export interface Question {
  key: string;
  title: string;
  description: string;
  required: boolean; // Gunakan tipe 'boolean', bukan literal 'true' agar fleksibel
  multiple: boolean;
  options: string[];
}



export interface UserMessage {
  text: string;
  model: string;
  userSelection?: Record<string, any>;
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


export type StatusTask = "CONTINUE" | "DONE" | "BLOCKED";

export type TypeTask = "SETUP" | "EXECUTE" | "NEED_INPUT" | "NEED_INFORMATION" | "TEXT";

export interface Option {
  category: string,
  choices: string[]
}
export interface Task {
  status: StatusTask;
  task: string;
  reason: string;
  id: string;
  operations?: Operation[];
  history?: {
    context: string[];
    query: string[];
  },
  type: TypeTask;
  options: Option[]
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





export interface ProjectStructureRequest {
  type: "PROJECT_STRUCTURE";
  reason: string;
}

export interface SemanticSearchRequest {
  type: "SEMANTIC_SEARCH";
  query: string;
  reason: string;
}

export interface FileContentRequest {
  type: "FILE_CONTENT";
  path: string;
  reason: string;
  query: string;
}

export interface SymbolSearchRequest {
  type: "SYMBOL_SEARCH";
  query: string;
  reason: string;
}

export interface DependencyInfoRequest {
  type: "DEPENDENCY_INFO";
  reason: string;
}

export interface FullFileRequest {
  type: "FULL_FILE";
  path: string;
  reason: string;
}

export interface SearchDocument {
  type: "FULL_FILE";
  path: string;
  reason: string;
}

export interface DocumentationRequest {
  type: "DOCUMENTATION";
  library: string;
  version?: string;
  query: string;
}

export type InformationRequest = {
  id: string;
  status: "DONE" | "IN_PROGRESS";
  information: ProjectStructureRequest | SemanticSearchRequest | FileContentRequest | SymbolSearchRequest | DependencyInfoRequest | FullFileRequest | DocumentationRequest;
}


