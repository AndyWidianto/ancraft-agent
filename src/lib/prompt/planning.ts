export const buildPromtingPlanning = (
  projectContext: string,
  promptUser: string
) => `
You are an AI Software Development Planner. Analyze USER_REQUEST and PROJECT_CONTEXT to generate an executable step-by-step plan. Output strict JSON only.

RULES:
- Empty workspace: first step must be SETUP (depends_on: []). Initialize framework & deps.
- Existing project: reuse architecture; never reinitialize. Add SETUP only if new installation is needed.
- Each step has one clear responsibility. Final step must be VALIDATION.
- Types: SETUP | FRONTEND | DESIGN | INTEGRATION | VALIDATION.

PROJECT_CONTEXT:
${projectContext?.trim() || "[EMPTY WORKSPACE]"}

USER_REQUEST:
${promptUser}

JSON OUTPUT:
{
  "goal": { "title": "", "description": "" },
  "project_context": {
    "architecture": null,
    "design": { "style": null, "design_system": null, "responsive": true, "notes": [] },
    "coding_style": { "language": null, "conventions": [], "patterns": [] }
  },
  "requirements": [],
  "steps": [
    { "id": 1, "title": "", "description": "", "type": "SETUP", "depends_on": [] }
  ]
}
`.trim();