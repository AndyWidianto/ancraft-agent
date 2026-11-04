import type { AIModelData, BuildTask, OperationResult, StepType } from ".";
import type { Operation } from "./operation";

export type TypeProvider = "GEMINI" | "OPENAI" | "ANTHROPIC" | "DEEPSEEK";


export interface UserMessage {
  text: string;
  model: string;
  userSelection?: Record<string, any>,
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

export interface ExecuteTaskMessage {
  command: "SEND_MESSAGE";
  action: "EXECUTE_TASK";
  message: UserMessage;
  task: BuildTask;
  history: string[];
  techStack: Record<string, any>;
  meta: Meta
}

export interface ValidateTaskMessage {
  command: "SEND_MESSAGE";
  action: "VALIDATE_TASK";
  message: UserMessage;
  history: string[];
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
export type BackgroundMessage = ExecuteTaskMessage
  | TextMessage | ExecuteOperationMessage | Provider | Request |
  ExecuteOperationFailedMessage | SelectModelRequest | ValidateTaskMessage;