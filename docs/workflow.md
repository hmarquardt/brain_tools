# Workflow

1. Run the app locally at `http://localhost:8787`.
2. Open Settings and configure OpenRouter models if LLM features are needed.
3. Connect the private wiki folder with File System Access in a supported browser.
4. Capture raw notes into the local inbox.
5. Review one inbox item.
6. Optionally run triage to get filing suggestions.
7. Choose a filing action: create project, append to project, create artifact, extract pattern, extract decision, save prompt, save reference, or archive.
8. Review the pending operation in Advanced, edit proposed content when needed, approve, then apply.
9. Use Agent Context to assemble a Markdown bundle for Codex, OpenCode, Kimi, or another coding agent.

## Parent Projects And Artifacts

Use a parent project for a large container such as `junkdrawer`. Use artifacts for child pages or mini-apps such as `weather-nerd`. Artifacts are optional; a project with no artifact registry is valid.

Artifact lifecycle:

`seed -> specced -> building -> live -> iterating -> parked -> archived -> promoted`

Artifact registries live at `projects/{project}/artifacts.md` by default and are edited through reviewed operations. Missing registries are shown as empty optional state, not errors.

Distillation, registries, raw operation history, and debug output live under Advanced until core filing is complete.

Memory layers:

- `inbox`: raw capture.
- `projects`, `patterns`, `decisions`, `prompts`: working memory.
- `wiki`: distilled agent-facing memory.
