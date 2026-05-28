import { buildDistillationPrompt, chatCompletion, parseStrictJson } from "./openrouter.js";
import { validateOperationShape } from "./triage.js";

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
