import { buildTriagePrompt, chatCompletion, parseStrictJson } from "./openrouter.js";

const classifications = new Set(["new_project", "project_update", "new_artifact", "artifact_update", "pattern", "decision", "prompt", "reference", "archive", "unclear"]);
const suggestionActions = new Set(["create_project", "append_project", "create_artifact", "extract_pattern", "extract_decision", "save_prompt", "save_reference", "archive", "keep_in_inbox"]);

export async function triageEntry(entry, settings) {
  const model = settings.triageModel || settings.defaultModel;
  const prompt = buildTriagePrompt(entry, settings);
  const result = await chatCompletion({
    apiKey: settings.openRouterApiKey,
    model,
    temperature: 0.1,
    maxTokens: settings.maxTokens,
    messages: [
      { role: "system", content: "Return strict JSON only." },
      { role: "user", content: prompt }
    ]
  });
  const parsed = parseStrictJson(result.text);
  validateTriage(parsed);
  return { parsed, raw: result.text, apiRaw: result.raw };
}

export function validateTriage(value) {
  if (!classifications.has(value.classification)) throw new Error("Invalid classification.");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) throw new Error("Invalid confidence.");
  if (!Array.isArray(value.suggestions)) throw new Error("Invalid suggestions.");
  value.suggestions.forEach(validateSuggestion);
  return true;
}

export function validateSuggestion(suggestion) {
  if (!suggestionActions.has(suggestion.action)) throw new Error(`Invalid suggestion action: ${suggestion.action}`);
  if (suggestion.confidence === undefined) suggestion.confidence = 0.5;
  if (typeof suggestion.confidence !== "number" || suggestion.confidence < 0 || suggestion.confidence > 1) throw new Error("Invalid suggestion confidence.");
}
