const API_URL = "https://openrouter.ai/api/v1";

export async function fetchOpenRouterModels(apiKey) {
  const response = await fetch(`${API_URL}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  if (!response.ok) throw new Error(`OpenRouter models request failed: ${response.status}`);
  const data = await response.json();
  return (data.data || []).map((model) => model.id).sort();
}

export async function chatCompletion({ apiKey, model, messages, temperature = 0.2, maxTokens = 2200 }) {
  if (!apiKey) throw new Error("OpenRouter API key is missing.");
  if (!model) throw new Error("OpenRouter model is missing.");
  const response = await fetch(`${API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Brain Tools"
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}\n${raw}`);
  const json = JSON.parse(raw);
  return { raw, text: json.choices?.[0]?.message?.content || "" };
}

export function buildTriagePrompt(entry, settings) {
  return `You are helping maintain a Markdown-based personal second brain and local LLM agent wiki.

Memory layout:
- /inbox is raw capture and may contain untrusted, noisy notes.
- /projects is project working memory.
- /projects/{project}/pages contains built or planned child pages/artifacts.
- /projects/{project}/ideas contains rough child artifact ideas.
- /patterns is reusable methods.
- /decisions is dated choices.
- /prompts is reusable prompt structures.
- /wiki is stable distilled agent-facing memory.

Rules:
- Return strict JSON only. No markdown fences, comments, or prose outside JSON.
- Do not propose dumping raw text into stable /wiki files.
- If a capture is about a specific page/artifact inside a parent project, file it under that artifact.
- If it is a rough mini-app idea under a parent project, file it under ideas.
- If it is a general parent project convention, file it under the parent project.
- If it is reusable across projects or pages, file it under patterns.
- If an artifact appears to be outgrowing the parent, suggest promotion.
- For new or changed artifacts, include an update_artifact_registry operation targeting projects/{project}/artifacts.md.
- Avoid creating full artifact pages for vague low-confidence thoughts; use inbox/needs-triage.md or an ideas file.
- Prefer concise operations that preserve durable facts, decisions, patterns, or next actions.
- Propose destinations and file operations for human review only.
- Valid operation types: create_file, append_file, append_section, replace_section, copy_file, update_artifact_registry.
- If uncertain, use classification "unclear" and explain briefly in rationale.

Directory mappings:
${JSON.stringify(settings.wikiPaths, null, 2)}

Artifact path conventions:
${JSON.stringify(settings.childArtifactConventions, null, 2)}

Return this exact shape:
{
  "classification": "project_update | new_project | artifact_update | new_artifact | artifact_idea | reusable_pattern | decision | prompt | troubleshooting | reference | archive | unclear",
  "confidence": 0.0,
  "summary": "",
  "project": {
    "slug": "",
    "title": ""
  },
  "artifact": {
    "slug": "",
    "title": "",
    "type": "",
    "status": "",
    "file": "",
    "url": "",
    "path": ""
  },
  "suggestedDestinations": ["projects/example.md"],
  "operations": [
    {
      "type": "append_section | create_file | replace_section | append_file | copy_file | update_artifact_registry",
      "file": "projects/example.md",
      "section": "Core Requirements",
      "template": "",
      "content": ""
    }
  ],
  "rationale": ""
}

Captured note:
${JSON.stringify(entry, null, 2)}`;
}

export function buildDistillationPrompt(context, settings, target = {}) {
  return `You are distilling working Markdown notes into concise, stable, agent-facing memory.

Rules:
- Return strict JSON only. No markdown fences.
- Summarize durable facts.
- Remove chatter and raw transcript material.
- Preserve decisions and reusable patterns.
- Mark uncertainty explicitly.
- Avoid raw note dumps.
- Generate proposed file operations only; do not imply direct writes.
- Can produce parent project summaries, artifact summaries, pattern summaries, or decision summaries.
- For artifact summaries, only propose stable summaries for artifacts that are live, building, architecturally reusable, decision-heavy, likely to be revisited, or becoming standalone projects.
- Valid operation types: create_file, append_file, append_section, replace_section.

Directory mappings:
${JSON.stringify(settings.wikiPaths, null, 2)}

Artifact path conventions:
${JSON.stringify(settings.childArtifactConventions, null, 2)}

Target:
${JSON.stringify(target, null, 2)}

Return:
{
  "summary": "",
  "operations": [
    {
      "type": "append_section | create_file | replace_section | append_file",
      "file": "wiki/project-summaries/example.md",
      "section": "Stable Summary",
      "content": ""
    }
  ],
  "rationale": ""
}

Source context:
${context}`;
}

export function parseStrictJson(text) {
  const trimmed = String(text || "").trim();
  const candidates = [trimmed];
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe candidate before surfacing a clear error.
    }
  }
  throw new Error("Model response did not contain a valid JSON object.");
}

function extractBalancedJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return "";
}
