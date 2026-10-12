import type { StatusTask } from ".";

export type ExecutorStatus =
  | "NEED_CONTEXT"
  | "READY";

export type InformationRequestType =
  | "PROJECT_STRUCTURE"
  | "SEMANTIC_SEARCH"
  | "FILE_CONTENT"
  | "SYMBOL_SEARCH"
  | "DEPENDENCY_INFO";

// ==========================================
// INFORMATION REQUEST
// ==========================================

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

export type InformationRequest =
  | ProjectStructureRequest
  | SemanticSearchRequest
  | FileContentRequest
  | SymbolSearchRequest
  | DependencyInfoRequest;

export interface NeedContextResult {
  status: "NEED_CONTEXT";
  reason: string;
  information_requests: InformationRequest[];
  operations: [];
}

export interface ReadyResult {
  status: "READY" | "BLOCKED";
  summary: string;
  information_requests: [];
  operations: Operation[];
}

export type ExecuteTaskResult =
  | NeedContextResult
  | ReadyResult;


export interface OperationCreate {
  id: number
  status?: StatusTask
  type: "CREATE"
  path: string
  content: string
}

export interface OperationModify {
  id: number
  status?: StatusTask
  type: "MODIFY",
  path: string
  changes: [
    {
      search: string
      replace: string
    }
  ]
}

export interface OperationDelete {
  id: number
  status?: StatusTask
  type: "DELETE",
  path: string
}

export interface OperationCommand {
  id: number
  status?: StatusTask
  type: "COMMAND",
  command: string
  cwd: string
}

export type Operation = OperationCommand | OperationCreate | OperationDelete | OperationModify;

export interface NeedContext {
  status: "NEED_CONTEXT",
  reason: string
  queries: string[]
}


export interface ReadyOperation {
  status: "READY",
  summary: string;
  operations: Operation[];
}

export type ResponseExecutor = NeedContext | ReadyOperation;



export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  message: string;
}

export interface FileOperationResult {
  success: boolean;
  message: string;
}

export interface OperationError {
  message: string;
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface OperationError {
  message: string;
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface FailedOperation {
  operation: Operation;
  error: OperationError;
}



