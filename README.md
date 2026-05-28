# Brain Tools

Brain Tools is a local-first browser app for managing a Markdown-based personal second brain and LLM agent wiki.

It is designed for this layout:

```text
~/brain/
  brain-tools/   # this app
  wiki/          # private Markdown brain data
```

## Run

```bash
./scripts/serve.sh
```

Then open:

```text
http://localhost:8787
```

You can also run:

```bash
python3 -m http.server 8787
```

## Connect a Wiki Folder

Open the app in a browser with File System Access support, such as Chrome or Edge. Click **Connect Wiki Folder** and select `~/brain/wiki`.

If the browser does not support File System Access, Brain Tools still supports local capture state and Markdown/JSON export, but direct wiki reads and writes are unavailable.

## Memory Layers

- `inbox`: raw capture. Notes here are untrusted and may be noisy.
- `projects`, `patterns`, `decisions`, `prompts`: working memory used for active thinking and reusable material.
- `wiki`: distilled agent-facing memory for stable facts, project summaries, preferences, and durable patterns.

Artifacts are child deliverables under a parent project:

```text
projects/junkdrawer.md
projects/junkdrawer/artifacts.md
projects/junkdrawer/pages/weather-nerd.md
wiki/project-summaries/junkdrawer/weather-nerd.md
```

## What Works Now

- Dashboard status and folder health checks.
- Local settings in `localStorage`.
- Captures and operation history in IndexedDB.
- File System Access folder connection and wiki writes after approval.
- Capture to local inbox and monthly wiki inbox files.
- Inbox selection, export, archive, and triage routing.
- OpenRouter model fetching, triage, and distillation calls.
- Strict JSON validation for triage and operation proposals.
- Pending operation review, edit, approve, reject, and apply.
- Project file list, preview/edit textarea, and session note append.
- Parent project and child artifact registry support.
- Artifact dashboard with status, promotion, note-generation, and distillation operations.
- Agent context bundle generation and export.

## Security Posture

Brain Tools uses native HTML, CSS, and JavaScript only. It has no CDN dependencies, analytics, remote fonts, external icon libraries, build step, or package install.

OpenRouter calls happen only after explicit user action. LLM output never writes directly to disk; it creates proposed operations for review. API keys are stored locally and are not committed.

See [docs/security.md](docs/security.md).

## Current Limitations

- File System Access is browser-dependent.
- Markdown preview is intentionally simple.
- Operation previews are basic and not a full semantic diff.
- No import UI for backup JSON yet.
- Artifact registries are Markdown-table based and intentionally simple.

## Roadmap

- Stronger operation diff views.
- Backup import and restore.
- Better recursive file index.
- More precise project and pattern selection.
- Optional prompt templates for agent handoffs.
- Test harness for JSON validation and operation transforms.
