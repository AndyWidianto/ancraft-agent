import { basicRules } from "./basicrules";

export const buildTaskPrompt = ({
  goal,
  projectContext,
  completedTasks = [],
  lastResult = '',
  userSelection,
}: {
  goal: string;
  projectContext: string;
  completedTasks?: string[];
  lastResult?: string;
  userSelection?: Record<string, string>;
}): string => {
  const selectionText = userSelection
    ? `\nUSER_SELECTION:\n${JSON.stringify(userSelection, null, 2)}`
    : '';

  return `
You are an Autonomous Coding Task Planner.
Generate ONE next task toward USER_GOAL. No code or full plans.

${basicRules}

RULES:
- Follow USER_GOAL, PROJECT_CONTEXT, USER_SELECTION, and COMPLETED_TASKS/LAST_RESULT.
- If the goal is broad/ambiguous and USER_SELECTION is empty, set type to NEEDS_INPUT and provide structured choices in "options".
- Once choices are selected in USER_SELECTION or context, generate the smallest atomic task for "task".
- Split tasks, respect dependencies, don't repeat completed work, fix failures first.

TYPES: SETUP, EXECUTE, NEED_INPUT
STATUSES: CONTINUE, DONE, BLOCKED

USER_GOAL: ${goal}
PROJECT_CONTEXT: ${projectContext}${selectionText}
COMPLETED_TASKS: ${JSON.stringify(completedTasks)}
LAST_RESULT: ${lastResult || 'None'}

OUTPUT JSON ONLY:
{
  "status": "CONTINUE | DONE | BLOCKED",
  "task": "",
  "reason": "",
  "type": "SETUP | EXECUTE | NEED_INPUT",
  "options": [
    {
      "category": "string",
      "choices": ["string"]
    }
  ]
}
`.trim();
};