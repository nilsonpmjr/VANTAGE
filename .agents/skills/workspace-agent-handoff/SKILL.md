---
name: workspace-agent-handoff
description: Use when coordinating work between Gemini Pro (Antigravity), Claude Code local, and Codex local in this workspace. Defines roles, stop conditions, handoff boundaries, required baton-pass notes, and the final integration owner so agents know when to stop and pass work to the next agent instead of overlapping.
---

# Workspace Agent Handoff

Use this skill whenever the task is intentionally multi-agent, especially if it mentions:

- Gemini, Claude Code, Codex, Antigravity
- handoff, passar a bola, baton pass, playbook, workflow
- dividir trabalho entre agentes
- análise visual + geração + integração

This skill is the operating rule for this workspace.

## Default Sequence

Use this order unless there is a strong reason not to:

1. Gemini Pro (Antigravity)
2. Claude Code local
3. Codex local

Default final owner: `Codex`.

Codex is the integration owner unless the user explicitly says otherwise.

This sequence is a default, not a one-way pipeline. Handoffs may go backward when the current owner finds a blocker that belongs more clearly to another agent.

## Role Boundaries

### Gemini Pro (Antigravity)

Owns:

- visual analysis of references
- layout decomposition
- extraction of design tokens
- component inventory from screenshots, Figma, or inspiration
- first-pass creative direction

Should produce:

- concise visual brief
- proposed tokens
- section/component map
- risks or ambiguities in the reference

Must stop when:

- the visual direction is clear enough to implement
- the next step is editing many repo files
- the next step depends on project-local patterns more than visual reasoning
- the task becomes integration-heavy rather than reference-heavy

Must not own:

- large repo-wide edits
- final folder architecture decisions in the codebase
- convergence of existing components into shared primitives
- final test/build validation

Pass to:

- `Claude Code` for isolated generation, scaffolding, or batch file work
- `Codex` when the next step is integration into existing code

### Claude Code local

Owns:

- generating isolated components
- scaffolding files and folders
- repetitive edits across many isolated files
- backend low-risk edits when they are local, mechanical, and not architecture-defining
- first-pass docs and boilerplate
- mechanical code generation where the target shape is already known

Should produce:

- generated files
- clear file list
- assumptions made during generation
- TODOs for integration or cleanup

Must stop when:

- the work starts touching shared primitives or system-wide consistency
- multiple existing components need consolidation
- the next step is refactor, cleanup, or alignment with the real app architecture
- tests/build become the gating factor
- the same file is likely to be edited by another agent for integration

Must not own:

- final convergence of the design system
- final refactor of legacy code into shared abstractions
- cross-module consistency decisions without repo context
- final validation for production readiness

Low-risk backend work is allowed when it looks like:

- config wiring
- docstrings
- small router adjustments
- metadata plumbing
- repetitive code moves

It is not allowed when it changes architecture, shared contracts, or integration-critical behavior across modules.

Pass to:

- `Codex` for integration, refactor, reuse, tests, and system consistency
- `Gemini Pro` only if the generated output revealed missing visual direction

### Codex local

Owns:

- integrating generated work into the real repository
- extracting and stabilizing shared primitives
- refactoring existing code to match the system
- preserving consistency across modules
- tests, build, and regression checks
- final polish for states, accessibility, and maintainability

Should produce:

- integrated diff
- reduced duplication
- validation status
- explicit residual risks if any remain

Must stop when:

- there is no trustworthy visual direction yet
- the user needs to choose between materially different design directions
- the task would benefit from fresh reference analysis rather than more integration
- a large isolated generation step is still missing and would be faster in Claude Code

Must not own by default:

- open-ended visual exploration from scratch when a reference should be analyzed first
- mass boilerplate generation better suited to Claude Code

Pass to:

- `Gemini Pro` if the blocker is visual ambiguity
- `Claude Code` if the blocker is a large isolated generation step
- the `user` if the blocker is a product or brand decision

Concrete examples:

- `Codex -> Claude Code`: "Generate placeholders/assets/files for a whole brand pack, then stop before integration."
- `Codex -> Gemini Pro`: "We can implement this, but light mode or visual hierarchy still has two plausible directions."

## Stop Rules

These rules apply to all agents:

- one file, one owner at a time
- do not keep editing after your comparative advantage ended
- do not "just finish everything" if the next phase clearly belongs to another agent
- do not silently redefine tokens, naming, or component contracts without noting it in the handoff
- if a decision affects architecture, brand, or product behavior in a non-obvious way, escalate to the user instead of guessing

Short validation before handoff is allowed when it is cheap and local:

- `npm run build`
- a targeted test command
- a syntax or import sanity check

This does not replace final validation by the integration owner.

## Baton Pass Format

Every handoff must leave a short packet in this shape:

```md
Handoff:
- Goal:
- Done:
- Files touched:
- Decisions made:
- Assumptions:
- Validation:
- Open risks:
- Next owner:
- Next action:
- Stop reason:
```

Keep it short and concrete.

## Delivery Rule

When an implementation session is completed, the current owner must:

1. deliver the handoff in the final response to the user
2. persist the same handoff in `docs/handoffs/`

Do not treat handoff as optional close-out text. It is part of the deliverable.

Recommended filename pattern:

- `docs/handoffs/YYYY-MM-DD-sessao-a.md`
- `docs/handoffs/YYYY-MM-DD-sessao-b.md`
- `docs/handoffs/YYYY-MM-DD-feature-name.md`

Each archived handoff should contain:

- title
- date
- current owner
- the baton-pass packet

If the task did not finish a session or implementation milestone, do not create archival noise. Archive only meaningful implementation handoffs.

## Decision Matrix

Use this quick matrix:

- reference, screenshot, Figma, token extraction -> `Gemini Pro`
- many isolated components, batch scaffolding, or low-risk backend wiring -> `Claude Code`
- refactor into shared/ui, integration with existing app, tests/build -> `Codex`

If two agents seem equally valid, choose the one that minimizes duplicate editing.

## Escalate To User When

Stop and ask the user when:

- two valid visual directions would materially change the product
- the handoff would overwrite another agent's likely work
- the change affects product scope, architecture, or branding
- there is no clean next owner because the task itself is underspecified

## Workspace-Specific Rule for VANTAGE

For VANTAGE work, default ownership is:

- design references and token proposals -> `Gemini Pro`
- isolated component generation and low-risk backend/mechanical wiring -> `Claude Code`
- design system convergence in `web/src/index.css`, `web/src/components/ui`, and existing views -> `Codex`

If the task touches existing VANTAGE primitives or app-wide consistency, favor `Codex` as the next owner.
