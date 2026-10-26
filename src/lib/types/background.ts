import type { AIModelData, OperationResult, StepType } from ".";
import type { Operation } from "./operation";

export type TypeProvider = "GEMINI" | "OPENAI" | "ANTHROPIC";

// Type untuk Action tipe "EXECUTE_STEP"
export interface ExecuteStepData {
  goal: string;
  step: string;
  stepId: number;
  planningId: string;
  type: StepType;
  nextTasks?: string[];
  previousTasks?: string[];
}

export interface ExecuteStepMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_STEP";
  data: ExecuteStepData;
  history: OperationResult[];
  meta: Meta
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
  meta: Meta
}


export interface Meta {
  providerId: number;
  apikey: string;
  provider: TypeProvider;
  model: string;
  embedding: {
    providerId: number;
    apikey: string;
    provider: TypeProvider;
    model: string;
  };
}

// Type untuk Action tipe "EXECUTE_TASK"
export interface ExecuteTaskData {
  goal: string;
  task: string;
  stepId: number;
  taskId: number;
  planningId: string;
  type: StepType;
  nextTasks?: string[];
  previousTasks?: string[];
  result_search?: {
    content: string[],
    history_query: string[]
  }
}

export interface ExecuteTaskMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_TASK";
  data: ExecuteTaskData;
  history: OperationResult[];
  techStack: Record<string, any>;
  meta: Meta
}

export interface Provider {
  command: "SEND_MESSAGE";
  action: "GET_MODELS";
  data: {
    provider: TypeProvider;
    apikey: string;
  }
}



export interface OperationMessage {
  stepId: number;
  taskId: number;
  task: string;
  planningId: string;
  operationId: number;
  operation: Operation;
}
export interface ExecuteOperationMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_OPERATION";
  data: OperationMessage;
  meta: Meta
}

export interface ExecuteOperationFailedMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_OPERATION_FAILED";
  data: OperationMessage;
  meta: Meta
}

export interface Request {
  command: "ABORT_REQUEST" | "WEBVIEW_READY";
  models?: any;
  provider: TypeProvider;
}
export interface SelectModelRequest {
  command: "SELECTED_MODEL";
  data: { model: AIModelData, type: "EXECUTOR" | "EMBEDDING" | "PLANNER" }
}
// Discriminated Union untuk gabungan semua message yang dikirim
export type BackgroundMessage = ExecuteStepMessage | ExecuteTaskMessage
  | TextMessage | ExecuteOperationMessage | Provider | Request |
  ExecuteOperationFailedMessage | SelectModelRequest;