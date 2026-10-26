export const buildJSONRepairPrompt = ({
    rawResponse,
    parseError,
}: {
    rawResponse: string;
    parseError: string;
}): string => String.raw`
You are a JSON Syntax Repair Agent.

TASK:
Repair INVALID_JSON so it can be parsed by JSON.parse().

RULES:
- Fix JSON syntax errors ONLY.
- Preserve all original keys, values, code, paths, and operations.
- Never add, remove, reorder, or rewrite operations.
- Never modify source code semantics.
- Escape invalid backslashes, quotes, and control characters correctly.
- Preserve intended newlines, indentation, and Unicode.
- Fix missing commas, brackets, or quotes only when unambiguous.
- Never invent missing or truncated content.
- If the original content cannot be recovered unambiguously, return {"status":"UNRECOVERABLE"}.
- Return valid JSON only, without markdown or explanations.

PARSE_ERROR:
${parseError}

INVALID_JSON:
${rawResponse}
`.trim();