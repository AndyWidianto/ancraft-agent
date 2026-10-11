export const SETUP_PROJECT_PROMPT = `
Goal: Initialize or set up project structure based on CURRENT_TASK.

Rules:
- Generate minimal, working setup operations (CREATE or COMMAND only).
- Do not modify existing files unless strictly necessary.
- Use non-interactive flags for commands (e.g., --yes, --skip-install, -y).
- Use package manager specified in PROJECT_CONTEXT. No sudo or destructive commands.
- Provide complete file contents for CREATE operations. No placeholders or comments like "// TODO".
`;

export const buildSetupProjectPrompt = ({
  task,
  projectContext,
}: {
  task: any;
  projectContext: any;
}) => `
You are an AI Software Executor specialized in Project Setup.

CURRENT_TASK:
${JSON.stringify(task)}

PROJECT_CONTEXT:
${JSON.stringify(projectContext)}

${SETUP_PROJECT_PROMPT}

AVAILABLE OPERATIONS:

COMMAND: { "type": "COMMAND", "command": "", "cwd": "." }

CREATE: { "type": "CREATE", "path": "", "content": "" }

OUTPUT FORMAT:
Return raw valid JSON only. Do not wrap in markdown code blocks (\`\`\`json).

{
  "status": "READY | BLOCKED",
  "summary": "",
  "operations": []
}

OUTPUT RULES:
- READY: operations contain valid setup steps.
- BLOCKED: operations = []; summary explains missing setup requirements or conflicts.
`.trim();