# Agent Instructions

Read `PROJECT_SPEC.md` before implementing project features.

## Required workflow

1. Inspect the existing repository before editing.

2. Work in small, testable milestones.

3. Preserve existing work.

4. Verify dependency licenses and APIs before adopting them.

5. Prefer permissively licensed, open-source dependencies.

6. Do not introduce a required paid model API.

7. Keep canvas operations independent of the MCP transport.

8. Validate every AI-requested operation.

9. Never expose unrestricted filesystem, shell, or browser access through MCP.

10. Run relevant tests and the production build after meaningful changes.

11. Report actual results, including failures and unverified assumptions.

12. Update documentation when architecture, setup, or behavior changes.

13. Ask before destructive actions, major architecture changes, or adding recurring costs.


## Scope control

Implement only the current task and its necessary dependencies. Do not build future collaboration features or unrelated functionality prematurely.

## Completion report

For each task, report:

- What changed.

- Files created or modified.

- Commands and tests executed.

- Results and remaining failures.

- Decisions or blockers requiring user input.

- The recommended next task.
