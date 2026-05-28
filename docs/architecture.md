# Architecture

Brain Tools is a buildless browser app using native HTML, CSS, and JavaScript modules.

## Layers

- `localStorage`: small configuration values and user settings.
- `IndexedDB`: captured entries, pending operation history, file index state, and File System Access handles.
- File System Access API: optional direct read/write access to the private local wiki folder.
- OpenRouter: explicit, user-triggered LLM calls for triage and distillation.

## Modules

- `settings.js`: default settings, merging, persistence, and theme application.
- `storage.js`: IndexedDB helpers.
- `fs-access.js`: wiki folder connection, reads, writes, appends, export downloads.
- `openrouter.js`: model list, chat completions, triage and distillation prompts.
- `triage.js`: triage call and JSON validation.
- `distill.js`: distillation call and JSON validation.
- `operations.js`: operation preview and apply behavior.
- `agent-context.js`: context bundle assembly.
- `artifacts.js`: parent project / child artifact pathing, templates, registry parsing, and registry row updates.
- `ui.js`: tab rendering and event handling.

The app never applies model output directly. Model output becomes pending operations that the user can review, edit, approve, reject, and then apply.

## Artifact Model

Projects are parent containers such as repos, products, or major initiatives. Artifacts are child pages, tools, features, assets, or mini-apps under a parent project.

Default artifact paths are configurable in Settings:

- Pages: `projects/{project}/pages/{artifact}.md`
- Ideas: `projects/{project}/ideas/{artifact}.md`
- Archive: `projects/{project}/archive/{artifact}.md`
- Distilled summaries: `wiki/project-summaries/{project}/{artifact}.md`
- Registry: `projects/{project}/artifacts.md`
