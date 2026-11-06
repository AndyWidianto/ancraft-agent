import { Operation, OperationError } from "../types";
import { basicRules } from "./basicrules";
import { OPERATION_PROMPT } from "./executor";

export const buildErrorRecoveryPrompt = ({
  task,
  projectContext,
  failedOperation,
  error,
  relevantCode,
}: {
  task: string;
  projectContext: string;
  failedOperation: string;
  error: OperationError;
  relevantCode?: string;
}) => `
You are an AI Code Repair Engine.

GOAL:
Analyze the provided ERROR and patch the source code in RELEVANT_CODE. Your primary job is to write correct, minimal code fixes.

CORE REPAIR RULES:
- FOCUS: Focus strictly on code fixes (syntax, types, logic, imports/exports, "use client").
- SCOPE: Modify ONLY code within RELEVANT_CODE. Do NOT touch or reference outside files.
- ACCURACY: Never invent nonexistent imports, components, or libraries. Use only what exists.
- MINIMAL CHANGES: Make precise surgically targeted edits. Do NOT refactor working code.
- NO DESTRUCTIVE CHANGES: Avoid deleting files/code unless directly causing the error.

RECOVERY PROCEDURE:
1. Analyze ERROR trace and map it directly to line(s) in RELEVANT_CODE.
2. Formulate minimal code fixes (MODIFY or CREATE) inside RELEVANT_CODE.
3. If FAILED_OPERATION is a command (e.g. "npm run build"), append that exact COMMAND as the final operation after all code modifications are listed.
4. If FAILED_OPERATION is a file operation (CREATE/MODIFY/DELETE), do NOT repeat the failed operation; only output the fixed file state.

CURRENT_TASK:
${task}

FAILED_OPERATION:
${failedOperation}

PROJECT_CONTEXT:
${projectContext}

ERROR:
${JSON.stringify(error)}

RELEVANT_CODE:
${relevantCode?.trim() || "[EMPTY]"}

${OPERATION_PROMPT}

OUTPUT FORMAT:
Return valid JSON only. Do not wrap in markdown or block code blocks.

{
  "status": "READY | BLOCKED",
  "reason": "Brief explanation if BLOCKED, otherwise empty",
  "summary": "Concise summary of the code fixes applied",
  "operations": []
}

OUTPUT RULES:
- status "READY": "operations" array MUST contain valid fix operations.
- If FAILED_OPERATION was a command, the LAST element of "operations" MUST be the retry COMMAND.
`;


export const buildErrorAnalysisPrompt = ({
  task,
  projectContext,
  failedOperation,
  error,
  relevantCode,
  previousSearches,
}: {
  task: string;
  projectContext: string;
  failedOperation: string;
  error: OperationError;
  relevantCode?: string;
  previousSearches?: string;
}) => `
You are an Error Analysis Agent.
Determine whether FAILED_OPERATION can be recovered.
Never generate operations or invent code.

${basicRules}

RULES:
- Analyze TASK, FAILED_OPERATION, ERROR, and available context.
- Error logs and file paths are not source code.
- **CRITICAL: Thoroughly inspect PREVIOUS_SEARCHES and RELEVANT_CODE first. If the information needed to resolve or analyze the error is already present in PREVIOUS_SEARCHES, you MUST NOT request it again and should lean towards READY or BLOCKED.**
- Never repeat searches or request the same data twice unless existing results are explicitly proven stale or incomplete.
- READY: Sufficient verified context (including what is already found in PREVIOUS_SEARCHES) exists to fix the error.
- NEED_CONTEXT: Required code or information is genuinely missing and has NOT been searched/retrieved yet.
- BLOCKED: Recovery is impossible even with additional context.
- Multiple errors alone do not justify BLOCKED.
- Never assume missing files, symbols, or dependencies exist.

CONTEXT REQUESTS:
- FILE_CONTENT: Known path; requires a non-empty query.
- FULL_FILE: Known path; only when partial code is insufficient.
- SYMBOL_SEARCH: Locate symbols when the path is unknown.
- DEPENDENCY_INFO: Retrieve missing dependency or version details.
- Request ONLY information strictly necessary for recovery that is missing from PREVIOUS_SEARCHES.
- Prefer targeted searches before FULL_FILE.
- **Never request already sufficient or previously fetched context.** If previous searches already covered the scope, return an empty array [] for information_requests.

REQUEST TYPES (for "information_requests"):
- FULL_FILE: {"type": "FULL_FILE",  "path": "string", "reason": "string"}
- FILE_CONTENT: {"type": "FILE_CONTENT", "path": "string", "query": "non-empty identifier", "reason": "string"} (Query cannot be "*" or "all")
- SEMANTIC_SEARCH: {"type": "SEMANTIC_SEARCH", "query": "string", "reason": "string"}
- SYMBOL_SEARCH: {"type": "SYMBOL_SEARCH", "query": "SymbolName", "reason": "string"}
- DEPENDENCY_INFO: {"type": "DEPENDENCY_INFO", "reason": "string"}

CURRENT_TASK:
${task}

FAILED_OPERATION:
${failedOperation}

ERROR:
${JSON.stringify(error)}

PREVIOUS_SEARCHES:
${previousSearches || "[]"}

OUTPUT (Valid JSON only):
{
  "status": "READY | NEED_CONTEXT | BLOCKED",
  "reason": "",
  "information_requests": []
}
`.trim();
