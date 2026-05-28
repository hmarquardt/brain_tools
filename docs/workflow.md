# Workflow

1. Run the app locally at `http://localhost:8787`.
2. Open Settings and configure OpenRouter models if LLM features are needed.
3. Connect the private wiki folder with File System Access in a supported browser.
4. Capture raw notes into the local inbox and optionally append them to `inbox/YYYY-MM.md`.
5. Triage selected inbox entries to generate proposed Markdown operations.
6. Review pending operations, edit proposed content when needed, approve, then apply.
7. Use Distillation to create stable agent-facing memory proposals under `wiki/`.
8. Use Agent Context to assemble a Markdown bundle for Codex, OpenCode, Kimi, or another coding agent.

## Parent Projects And Artifacts

Use a parent project for a large container such as `junkdrawer`. Use artifacts for child pages or mini-apps such as `weather-nerd`.

Artifact lifecycle:

`seed -> specced -> building -> live -> iterating -> parked -> archived -> promoted`

Artifact registries live at `projects/{project}/artifacts.md` by default and are edited through reviewed operations.

The Artifacts tab can open an artifact note, parse common sections such as Purpose, Core Features, Decisions, Session Notes, Next Actions, and Related Patterns, and queue registry row edits without writing automatically.

Memory layers:

- `inbox`: raw capture.
- `projects`, `patterns`, `decisions`, `prompts`: working memory.
- `wiki`: distilled agent-facing memory.
