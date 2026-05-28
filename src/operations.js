import { appendFile, exists, readFile, writeFile } from "./fs-access.js";
import { replaceOrAppendSection } from "./markdown.js";
import { titleFromSlug, upsertArtifactRegistry } from "./artifacts.js";

export async function previewOperation(root, operation) {
  const current = await safeRead(root, operation.file);
  if (operation.type === "copy_file") {
    const source = await readFile(root, operation.from);
    return { current, next: source };
  }
  return { current, next: buildNextContent(current, operation) };
}

export async function applyOperation(root, operation) {
  const current = await safeRead(root, operation.file);
  if (operation.type === "create_file" && await exists(root, operation.file, "file")) throw new Error("File already exists; create_file will not overwrite.");
  if (operation.type === "create_file") {
    await writeFile(root, operation.file, ensureTrailingNewline(operation.content), { create: true });
    return "created";
  }
  if (operation.type === "append_file") {
    await appendFile(root, operation.file, operation.content);
    return "appended";
  }
  if (operation.type === "copy_file") {
    if (await exists(root, operation.file, "file")) throw new Error("File already exists; copy_file will not overwrite.");
    const source = await readFile(root, operation.from);
    await writeFile(root, operation.file, source, { create: true });
    return "copied";
  }
  if (operation.type === "update_artifact_registry") {
    const next = upsertArtifactRegistry(current, operation.artifact, operation.projectTitle || titleFromSlug(projectValue(operation.project)));
    await writeFile(root, operation.file, next, { create: true });
    return "registry updated";
  }
  const next = buildNextContent(current, operation);
  await writeFile(root, operation.file, next, { create: true });
  return operation.type === "replace_section" ? "section replaced" : "section appended";
}

function buildNextContent(current, operation) {
  if (operation.type === "create_file") return ensureTrailingNewline(operation.content);
  if (operation.type === "append_file") return `${String(current || "").trimEnd()}\n\n${operation.content.trim()}\n`;
  if (operation.type === "copy_file") return current || "";
  if (operation.type === "update_artifact_registry") return upsertArtifactRegistry(current, operation.artifact, operation.projectTitle || titleFromSlug(projectValue(operation.project)));
  if (operation.type === "append_section") return replaceOrAppendSection(current, operation.section, operation.content, false);
  if (operation.type === "replace_section") return replaceOrAppendSection(current, operation.section, operation.content, true);
  throw new Error(`Unsupported operation type: ${operation.type}`);
}

async function safeRead(root, file) {
  try {
    return await readFile(root, file);
  } catch {
    return "";
  }
}

function ensureTrailingNewline(value) {
  return String(value || "").trimEnd() + "\n";
}

function projectValue(project) {
  if (!project) return "";
  if (typeof project === "string") return project;
  return project.slug || project.title || "";
}
