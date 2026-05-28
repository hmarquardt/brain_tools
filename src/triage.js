import { buildTriagePrompt, chatCompletion, parseStrictJson } from "./openrouter.js";

const classifications = new Set(["project_update", "new_project", "artifact_update", "new_artifact", "artifact_idea", "reusable_pattern", "decision", "prompt", "troubleshooting", "reference", "archive", "unclear"]);
const operationTypes = new Set(["create_file", "append_file", "append_section", "replace_section", "copy_file", "update_artifact_registry"]);

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
  if (value.project && typeof value.project !== "object") throw new Error("Invalid project metadata.");
  if (value.artifact && typeof value.artifact !== "object") throw new Error("Invalid artifact metadata.");
  if (!Array.isArray(value.suggestedDestinations)) throw new Error("Invalid suggestedDestinations.");
  if (!Array.isArray(value.operations)) throw new Error("Invalid operations.");
  value.operations.forEach(validateOperationShape);
  return true;
}

export function validateOperationShape(operation) {
  if (!operationTypes.has(operation.type)) throw new Error(`Invalid operation type: ${operation.type}`);
  if (!operation.file || operation.file.includes("..") || operation.file.startsWith("/")) throw new Error("Invalid operation file path.");
  if (operation.type === "copy_file" && (!operation.from || operation.from.includes("..") || operation.from.startsWith("/"))) throw new Error("Invalid copy source path.");
  if (operation.type === "update_artifact_registry" && (!operation.artifact || typeof operation.artifact !== "object")) throw new Error("Artifact registry operation requires artifact metadata.");
  if (operation.type !== "update_artifact_registry" && operation.type !== "copy_file" && typeof operation.content !== "string") throw new Error("Operation content is required.");
  if ((operation.type === "append_section" || operation.type === "replace_section") && !operation.section) throw new Error("Section is required.");
}
