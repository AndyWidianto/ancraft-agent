export type StatusTask = "TODO" | "IN_PROGRESS" | "DONE" | "FAILED";

export type StepType =
  | "FRONTEND"
  | "DESIGN"
  | "INTEGRATION"
  | "VALIDATION"
  | "SETUP";


export interface Task {
  id: number;
  title: string;
  description: string;
  depends_on: number[];
  estimated_scope: "SMALL" | "MEDIUM";
  status?: StatusTask;
  operations?: (Operation & { id: number; status?: StatusTask, error?: any })[];
  result_search?: {
    context: string[];
    history_query: string[];
  }
}

export interface Step {
  id: number;
  title: string;
  description?: string;
  type: StepType;
  tasks: Task[];
  status: StatusTask;
}

export interface PlanningMessageData {
  id: string;
  status: StatusTask;
  goal: {
    title: string;
    description: string;
  };
  project_context: {
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
  finished: boolean;
}

export interface OperationCreate { apply?: boolean; id: number, type: "CREATE"; path: string; content: string; }
export interface OperationModify { apply?: boolean; id: number, type: "MODIFY"; path: string; changes: { search: string; replace: string }[]; }
export interface OperationDelete { apply?: boolean; id: number, type: "DELETE"; path: string; }
export interface OperationCommand { apply?: boolean; id: number, type: "COMMAND"; command: string; cwd: string; }
export type Operation = OperationCommand | OperationCreate | OperationDelete | OperationModify;

export type ActionType = 'TEXT' | "NEW_HISTORY" | "ERROR" | "GET_MODELS"
  | 'PLANNING' | 'NEW_TASKS' | 'NEW_OPERATION' | 'UPDATE_OPERATION' | "UPDATE_STEP" |
  'UPDATE_TASK' | 'NEED_INFORMATION' | "MORE" | "SELECTED_MODEL";

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text?: string;
  type: ActionType;
  timestamp: string;
  planning?: PlanningMessageData;
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


export interface ExecuteStepData {
  goal: string;
  step: string;
  stepId: number;
  planningId: string; // sesuaikan jika id Anda selalu string/number
  nextTasks?: string[];
  previousTasks?: string[];
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

// Type untuk Action tipe "EXECUTE_STEP"
export interface ExecuteStepData {
  goal: string;
  step: string;
  stepId: number;
  planningId: string; // sesuaikan jika id Anda selalu string/number
  type: StepType
}

export interface ExecuteStepMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_STEP";
  data: ExecuteStepData;
  history: OperationResult[];
}


export interface UserMessage {
  text: string;
  model: string;
}
export interface TextMessage {
  command: "SEND_MESSAGE";
  action: "TEXT";
  data: UserMessage;
  history: OperationResult[];
}

// Type untuk Action tipe "EXECUTE_TASK"
export interface ExecuteTaskData {
  goal: string;
  task: string;
  stepId: number;
  taskId: number;
  planningId: string;
}

export interface ExecuteTaskMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_TASK";
  data: ExecuteTaskData;
  history: OperationResult[];
}

export interface OperationMessage {
  stepId: number;
  taskId: number;
  task: string;
  planningId: string;
  operationId: number;
  operation: Operation & {
    id: number;
  };
}

export type TypeProvider = "GEMINI" | "OPENAI" | "ANTHROPIC";


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


export interface ExecuteOperationMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_OPERATION";
  data: OperationMessage;
}
// Discriminated Union untuk gabungan semua message yang dikirim
export type BackgroundMessage = ExecuteStepMessage | ExecuteTaskMessage | TextMessage | ExecuteOperationMessage;


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