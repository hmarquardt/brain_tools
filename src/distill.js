import { buildDistillationPrompt, chatCompletion, parseStrictJson } from "./openrouter.js";

export async function distillContext(context, settings, target = {}) {
  const model = settings.distillModel || settings.defaultModel;
  const result = await chatCompletion({
    apiKey: settings.openRouterApiKey,
    model,
    temperature: 0.15,
    maxTokens: settings.maxTokens,
    messages: [
      { role: "system", content: "Return strict JSON only." },
      { role: "user", content: buildDistillationPrompt(context, settings, target) }
    ]
  });
  const parsed = parseStrictJson(result.text);
  if (!Array.isArray(parsed.operations)) throw new Error("Distillation response is missing operations.");
  parsed.operations.forEach(validateOperationShape);
  return { parsed, raw: result.text, apiRaw: result.raw };
}

function validateOperationShape(operation) {
  const operationTypes = new Set(["create_file", "append_file", "append_section", "replace_section"]);
  if (!operationTypes.has(operation.type)) throw new Error(`Invalid distillation operation type: ${operation.type}`);
  if (!operation.file || operation.file.includes("..") || operation.file.startsWith("/")) throw new Error("Invalid distillation operation file path.");
  if (typeof operation.content !== "string") throw new Error("Distillation operation content is required.");
  if ((operation.type === "append_section" || operation.type === "replace_section") && !operation.section) throw new Error("Distillation section is required.");
}
