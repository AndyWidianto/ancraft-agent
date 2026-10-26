

const STEP_TYPES = `
STEP TYPES:
- INSPECTION: Inspect existing code or architecture.
- SETUP: Initialize project, install dependencies, configure tools.
- DATABASE: Schema, models, migrations, ORM.
- BACKEND: Services, business logic, authentication.
- API: Endpoints, validation, request handlers.
- FRONTEND: Pages, components, state, interactions.
- DESIGN: Styling, layout, responsive UI.
- INTEGRATION: Connect modules, APIs, or services.
- VALIDATION: Test functionality, typecheck, build.
`;

export const buildPromtingPlanning = (
  projectContext: string,
  promptUser: string
) => `
You are an AI Software Development Planner. Generate a complete, dependency-aware, executable development plan in strict JSON.

==================================================
RULES & PRINCIPLES
==================================================
1. Analyze USER_REQUEST and PROJECT_CONTEXT. Reuse existing architecture/dependencies; never invent files, packages, or configurations.
2. Every step must have a single clear responsibility and valid sequential integer IDs (\`depends_on\` references earlier steps only).
3. First step must be SETUP (if missing dependencies/tools) or direct implementation if everything exists. Final step MUST be VALIDATION.
4. Put all required predictable dependencies and tools into SETUP. Do not split setup into multiple steps.
5. Follow strict scope: Do not implement unrequested features or unnecessary technologies. Match scope (FRONTEND-ONLY, BACKEND-ONLY, FULLSTACK, or LIBRARY).
6. Step descriptions must be concise, stating WHAT is implemented and the expected outcome without hallucinating source code.

==================================================
STEP TYPES
==================================================
${STEP_TYPES}

==================================================
PROJECT_CONTEXT
==================================================
${projectContext?.trim() || "[EMPTY WORKSPACE]"}

==================================================
USER_REQUEST
==================================================
${promptUser}

==================================================
JSON OUTPUT FORMAT
==================================================
{
  "goal": {
    "title": "",
    "description": ""
  },
  "project_context": {
    "architecture": null,
    "design": {
      "style": null,
      "design_system": null,
      "responsive": true,
      "notes": []
    },
    "coding_style": {
      "language": null,
      "conventions": [],
      "patterns": []
    }
  },
  "requirements": [],
  "steps": [
    {
      "id": 1,
      "title": "",
      "description": "",
      "type": "SETUP",
      "depends_on": []
    }
  ]
}

==================================================
OUTPUT RULES
==================================================
- Return strict valid JSON only. No markdown formatting blocks, no explanations, no comments.
`.trim();