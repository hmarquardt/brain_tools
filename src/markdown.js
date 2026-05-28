export function slugify(value) {
  return String(value || "untitled")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, "-")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled";
}

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function entryToMarkdown(entry) {
  const tags = Array.isArray(entry.tags) ? entry.tags.join(", ") : entry.tags || "";
  return [
    `## ${entry.title || "Untitled"}`,
    "",
    `- Created: ${entry.createdAt || new Date().toISOString()}`,
    `- Type: ${entry.type || "General Note"}`,
    `- Status: ${entry.status || "new"}`,
    `- Project: ${entry.project || ""}`,
    `- Artifact Slug: ${entry.artifactSlug || ""}`,
    `- Artifact Title: ${entry.artifactTitle || ""}`,
    `- Artifact Type: ${entry.artifactType || ""}`,
    `- Artifact Status: ${entry.artifactStatus || ""}`,
    `- Artifact File: ${entry.artifactFile || ""}`,
    `- Artifact URL: ${entry.artifactUrl || ""}`,
    `- Source: ${entry.source || ""}`,
    `- Tags: ${tags}`,
    "",
    String(entry.body || "").trim(),
    ""
  ].join("\n");
}

export function renderMarkdownPreview(markdown) {
  const lines = String(markdown || "").split("\n");
  let html = "";
  let inList = false;
  for (const line of lines) {
    if (/^###\s+/.test(line)) html += closeList() + `<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`;
    else if (/^##\s+/.test(line)) html += closeList() + `<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`;
    else if (/^#\s+/.test(line)) html += closeList() + `<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`;
    else if (/^-\s+/.test(line)) {
      if (!inList) html += "<ul>";
      inList = true;
      html += `<li>${escapeHtml(line.replace(/^-\s+/, ""))}</li>`;
    } else if (!line.trim()) {
      html += closeList();
    } else {
      html += closeList() + `<p>${escapeHtml(line)}</p>`;
    }
  }
  return html + closeList();

  function closeList() {
    if (!inList) return "";
    inList = false;
    return "</ul>";
  }
}

export function replaceOrAppendSection(markdown, heading, content, replace = false) {
  const title = heading || "Notes";
  const block = `## ${title}\n\n${content.trim()}\n`;
  const source = String(markdown || "");
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^##\\s+${escaped}\\s*$)([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "m");
  if (!pattern.test(source)) return `${source.trim()}\n\n${block}`.trim() + "\n";
  if (replace) return source.replace(pattern, block.trim() + "\n\n");
  return source.replace(pattern, (_, header, body) => `${header}${body.trimEnd()}\n\n${content.trim()}\n\n`);
}
