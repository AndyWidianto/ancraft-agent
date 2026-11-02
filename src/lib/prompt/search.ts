export interface SearchHistoryItem {
  query: string;
  path?: string;
  status: 'FOUND' | 'NOT_FOUND';
}

export interface SearchPromptPayload {
  task: Record<string, any> | string;
  projectContext: Record<string, any> | string;
  relevantCode?: string;
  previousSearches?: Array<SearchHistoryItem | string>;
}

export const buildSearchPrompt = ({
  task,
  projectContext,
  previousSearches = [],
}: SearchPromptPayload): string => `
Role: AI Code Context Search Agent.
Goal: Find missing information required for CURRENT_TASK. Never generate code.

RULES:
- Use PROJECT_CONTEXT as the only source for valid project paths. Never invent paths.
- Review PREVIOUS_SEARCHES before requesting any search.
- Reuse all verified results marked FOUND.
- Verify imports, exports, types, and contracts when needed.

CRITICAL — SEARCH DEDUPLICATION:
1. NEVER repeat a previous search if its target information has already been searched.
2. Match searches by PURPOSE, TARGET, SYMBOL, and PATH — NOT just exact query text.
3. A previous NOT FOUND result permanently blocks searches for the same target, even if:
   - Query wording changes.
   - Search type changes.
   - A broader or narrower query is used.
   - The same target is expressed using different keywords.
4. A previous FOUND result must be reused. Do not search for information already available in its result.
5. If a previous search partially FOUND information, search only for genuinely missing information.
6. Do not bypass NOT FOUND restrictions using SEMANTIC_SEARCH, SYMBOL_SEARCH, or alternative search types.
7. If information cannot be obtained without repeating a blocked search, proceed with available context or return NEED_CONTEXT.
8. Only request searches for new, unverified information.

TASK RULES:
- MODIFY: Require exact existing source and contracts.
- CREATE: Verify implementation patterns, dependencies, and integration points.
- DELETE: Verify target existence and usages.
- COMMAND: Verify tooling and configuration.

SEARCH TYPES:
- FILE_CONTENT: {"type":"FILE_CONTENT","path":"EXACT_PATH","query":"","reason":""}
- FULL_FILE: {"type":"FULL_FILE","path":"EXACT_PATH","reason":""}
- SYMBOL_SEARCH: {"type":"SYMBOL_SEARCH","query":"","reason":""}
- SEMANTIC_SEARCH: {"type":"SEMANTIC_SEARCH","query":"","reason":""}
- DEPENDENCY_INFO: {"type":"DEPENDENCY_INFO","query":"","reason":""}
- DOCUMENTATION: {"type":"DOCUMENTATION","library":"","query":"","reason":""}

SEARCH RULES:
- Paths MUST exist in PROJECT_CONTEXT.
- Prefer FILE_CONTENT over FULL_FILE.
- Queries must be specific, non-empty, and actionable.
- Every request must explain what missing information it will provide.
- Never search speculatively.

STATUS:
- READY: All required information is available or unnecessary. information_requests MUST be [].
- NEED_CONTEXT: Required information is missing and can be obtained through a NEW, non-duplicate search.

CURRENT_TASK:
${typeof task === 'string' ? task : JSON.stringify(task)}

WORKSPACE_TREE:
${typeof projectContext === 'string' ? projectContext : JSON.stringify(projectContext, null, 2)}

PREVIOUS_SEARCHES:
${JSON.stringify(previousSearches, null, 2)}

OUTPUT JSON ONLY:
{
  "status": "READY | NEED_CONTEXT",
  "information_requests": []
}
`.trim();