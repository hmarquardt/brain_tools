import { entryToMarkdown, slugify } from "./markdown.js";

export function supportsFileSystemAccess() {
  return "showDirectoryPicker" in window;
}

export async function requestWikiDirectory() {
  if (!supportsFileSystemAccess()) throw new Error("File System Access API is unavailable in this browser.");
  return window.showDirectoryPicker({ mode: "readwrite" });
}

export async function verifyPermission(handle, write = false) {
  const options = { mode: write ? "readwrite" : "read" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

export async function inspectWiki(handle, paths) {
  const expected = ["inbox", "projects", "patterns", "decisions", "prompts", "snippets", "logs", "references", "archive", "distilledWiki"];
  const checks = [];
  for (const key of expected) {
    const path = paths[key];
    checks.push({ key, path, exists: await exists(handle, path, "directory") });
  }
  return checks;
}

export async function exists(root, path, kind) {
  try {
    await getHandle(root, path, { create: false, kind });
    return true;
  } catch {
    return false;
  }
}

export async function getHandle(root, path, options = {}) {
  const parts = String(path || "").split("/").filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index];
    const last = index === parts.length - 1;
    if (last && options.kind === "file") return current.getFileHandle(name, { create: !!options.create });
    current = await current.getDirectoryHandle(name, { create: !!options.create });
  }
  return current;
}

export async function readFile(root, path) {
  const handle = await getHandle(root, path, { kind: "file" });
  return (await handle.getFile()).text();
}

export async function writeFile(root, path, content, { create = true } = {}) {
  await verifyPermission(root, true);
  const handle = await getHandle(root, path, { kind: "file", create });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function appendFile(root, path, content) {
  let current = "";
  try {
    current = await readFile(root, path);
  } catch {
    current = "";
  }
  const next = `${current.trimEnd()}\n\n${content.trim()}\n`;
  await writeFile(root, path, next);
  return next;
}

export async function saveEntryToWikiInbox(root, settings, entry) {
  const date = new Date(entry.createdAt || Date.now());
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}.md`;
  const path = `${settings.wikiPaths.inbox}/${month}`;
  await appendFile(root, path, entryToMarkdown(entry));
  return path;
}

export async function listMarkdownFiles(root, directoryPath) {
  const dir = await getHandle(root, directoryPath, { kind: "directory" });
  const files = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file" && name.endsWith(".md")) files.push(`${directoryPath}/${name}`);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export async function exportTextFile(name, content, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name || `${slugify(document.title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
