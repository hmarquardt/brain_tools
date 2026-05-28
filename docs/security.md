# Security

Brain Tools is intentionally local-first and dependency-free.

- No CDN dependencies.
- No analytics.
- No remote fonts.
- No external icon libraries.
- OpenRouter calls happen only after explicit user action.
- The OpenRouter API key is stored locally in `localStorage` and is only sent to OpenRouter API endpoints.
- File System Access directory handles are stored in IndexedDB, not `localStorage`.
- Captured notes and inbox material are untrusted raw inputs.
- Raw inbox content is not stable truth.
- LLM output only creates proposed operations.
- Stable distilled wiki updates require human review and explicit apply.
- File System Access writes happen only after user approval.
- `create_file` refuses to overwrite existing content.

Use a local browser profile you trust. Do not serve this app on a public network.
