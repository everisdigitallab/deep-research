# Codex Guidelines

This file defines practical guidelines for using Codex effectively in this project.

## Goal

Use Codex as a coding collaborator that:

- understands the codebase before changing it
- prefers small, verifiable changes
- preserves existing architecture and conventions
- validates behavior after edits
- avoids risky or unnecessary modifications

## Project Context

This repository contains:

- a Python/FastAPI backend
- a Next.js frontend in `frontend/nextjs`
- core research logic in `gpt_researcher`
- tests in `tests`

Codex should preserve the current stack and follow existing patterns before introducing new ones.

## Working Style

- Read relevant files first.
- Make the smallest change that solves the task.
- Reuse existing helpers, utilities, and patterns.
- Prefer clear code over clever code.
- Do not refactor unrelated areas.
- Do not rename public interfaces unless required.

## Editing Rules

- Keep changes scoped to the request.
- Use ASCII by default.
- Add comments only when they clarify non-obvious logic.
- Do not add placeholder code that is not used.
- Do not leave TODOs unless explicitly requested.
- Keep imports tidy and avoid dead code.

## Safety Rules

- Never commit or expose secrets from `.env`.
- Never hardcode API keys, tokens, or credentials.
- Avoid destructive commands unless explicitly requested.
- Do not revert user changes outside the task scope.
- If a change has non-obvious product or architecture impact, pause and surface the tradeoff.

## Validation

After code changes, Codex should validate with the lightest useful check available:

- syntax or type checks for the edited area
- targeted tests when available
- import or startup checks for affected modules

If full validation is not possible, Codex should say what was checked and what remains unverified.

## Project Commands

Common commands for this repository:

```bash
source deep_radar/bin/activate
python -m uvicorn main:app --reload
python tests/test-your-llm.py
python tests/test-your-embeddings.py
python -m pytest
```

Frontend:

```bash
cd frontend/nextjs
npm install
npm run dev
```

## Prompting Guidance

Good requests for Codex are specific, constrained, and testable.

Preferred prompt style:

```text
Read the backend flow for report generation, then fix the websocket error in the smallest possible way. Validate with a targeted test or import check.
```

Better requests include:

- the file or subsystem involved
- the expected behavior
- constraints such as "minimal diff" or "no refactor"
- how to validate the result

## What Codex Should Avoid

- broad rewrites without need
- adding new dependencies without justification
- changing unrelated formatting across many files
- inventing architecture that does not match the repo
- assuming environment variables or services exist without checking

## For LLM Configuration Tasks

When working on model integration:

- prefer `.env`-based configuration
- support existing provider conventions already used by the project
- keep compatibility with Azure/OpenAI settings already present
- verify both chat model and embedding configuration when relevant

## Definition Of Done

A Codex task is done when:

- the requested change is implemented
- affected files remain coherent with project conventions
- at least one meaningful validation step was run, or the limitation was stated clearly
- the user receives a short summary of what changed and any remaining risk

