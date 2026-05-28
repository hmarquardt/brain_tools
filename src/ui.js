import { addEntry, addOperation, getAll, loadDirectoryHandle, saveDirectoryHandle, updateEntry, updateOperation } from "./storage.js";
import { applyTheme, loadSettings, saveSettings } from "./settings.js";
import { entryToMarkdown, escapeHtml, renderMarkdownPreview, slugify } from "./markdown.js";
import { exportTextFile, inspectWiki, listMarkdownFiles, readFile, requestWikiDirectory, saveEntryToWikiInbox, supportsFileSystemAccess, verifyPermission, writeFile } from "./fs-access.js";
import { fetchOpenRouterModels } from "./openrouter.js";
import { triageEntry } from "./triage.js";
import { distillContext } from "./distill.js";
import { applyOperation, previewOperation } from "./operations.js";
import { buildAgentContext, buildCodexPrompt } from "./agent-context.js";
import { APP_UPDATED, APP_VERSION } from "./version.js";
import { artifactRegistryPath, artifactRegistryRow, artifactStatuses, artifactTemplate, artifactTypes, emptyRegistry, fillArtifactPath, normalizeArtifactEntry, parseArtifactRegistry, parseMarkdownSections, projectSlug, titleFromSlug } from "./artifacts.js";

const tabs = ["Dashboard", "Capture", "Inbox", "Triage", "Projects", "Artifacts", "Distillation", "Agent Context", "Settings"];
const types = ["Project Idea", "Conversation", "Prompt", "Code Note", "Decision", "Troubleshooting", "Recipe", "Song", "Image Style", "API Note", "Model Note", "Business Idea", "General Note"];
let state = { settings: loadSettings(), tab: "Dashboard", entries: [], operations: [], wikiHandle: null, health: [], selectedEntryIds: new Set(), projectFiles: [], patternFiles: [], artifacts: [], selectedProject: "", selectedProjectContent: "", selectedArtifactKey: "", selectedArtifactContent: "", debug: "", notice: "", models: [], filters: { search: "", type: "", project: "", status: "" }, previews: {}, contextOutput: "" };

export async function init() {
  applyTheme(state.settings.theme);
  state.wikiHandle = await loadDirectoryHandle();
  if (state.wikiHandle) await verifyPermission(state.wikiHandle).catch(() => null);
  await refreshData();
  render();
}

async function refreshData() {
  state.entries = (await getAll("entries")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.operations = (await getAll("operations")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (state.wikiHandle) {
    state.health = await inspectWiki(state.wikiHandle, state.settings.wikiPaths).catch(() => []);
    state.projectFiles = await listMarkdownFiles(state.wikiHandle, state.settings.wikiPaths.projects).catch(() => []);
    state.patternFiles = await listMarkdownFiles(state.wikiHandle, state.settings.wikiPaths.patterns).catch(() => []);
    state.artifacts = await loadArtifactRegistries();
  }
}

function render() {
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">BT</span><div><strong>Brain Tools</strong><small>Local second-brain cockpit</small></div></div>
      <nav>${tabs.map((tab) => `<button class="tab ${state.tab === tab ? "active" : ""}" data-tab="${tab}">${tab}</button>`).join("")}</nav>
      <div class="sidebar-foot">
        <div>${badge(state.wikiHandle ? "Wiki connected" : "Wiki disconnected", state.wikiHandle ? "good" : "warn")}${badge(state.settings.storageMode)}</div>
        <footer class="version-footer">v${APP_VERSION} · updated ${APP_UPDATED}</footer>
      </div>
    </aside>
    <main class="main"><header><h1>${state.tab}</h1><p>${subtitle()}</p></header>${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}<section>${view()}</section></main>`;
  bindGlobal();
}

function subtitle() {
  return {
    Dashboard: "Operational status, fast actions, and local state.",
    Capture: "Capture raw notes into local and wiki inboxes.",
    Inbox: "Search, select, triage, export, or archive captured entries.",
    Triage: "Classify notes into reviewable Markdown operations.",
    Projects: "Read parent projects and their artifact registries.",
    Artifacts: "Inspect child pages, tools, ideas, and promotion actions.",
    Distillation: "Generate durable agent-facing memory proposals.",
    "Agent Context": "Assemble coding-agent context bundles from selected wiki files.",
    Settings: "Local settings, OpenRouter models, and directory mappings."
  }[state.tab];
}

function view() {
  if (state.tab === "Dashboard") return dashboard();
  if (state.tab === "Capture") return capture();
  if (state.tab === "Inbox") return inbox();
  if (state.tab === "Triage") return triage();
  if (state.tab === "Projects") return projects();
  if (state.tab === "Artifacts") return artifacts();
  if (state.tab === "Distillation") return distillation();
  if (state.tab === "Agent Context") return agentContext();
  return settings();
}

function dashboard() {
  const pending = state.operations.filter((op) => op.status === "pending").length;
  return `<div class="grid stats">
    ${stat("Wiki Folder", state.wikiHandle ? "Connected" : "Not connected")}
    ${stat("Storage Mode", state.settings.storageMode)}
    ${stat("Captured Entries", state.entries.length)}
    ${stat("Pending Operations", pending)}
  </div>
  <div class="panel"><h2>Quick Actions</h2><div class="actions">
    ${button("Connect Wiki Folder", "connect")}
    ${button("New Capture", "go-capture")}
    ${button("Triage Inbox", "go-triage")}
    ${button("Generate Agent Context", "go-agent")}
    ${button("Export Backup JSON", "backup")}
  </div></div>
  <div class="panel"><h2>Folder Health</h2>${health()}</div>`;
}

function capture() {
  const artifactOptions = state.artifacts.map((artifact) => `<option value="${escapeHtml(artifactKey(artifact))}">${escapeHtml(artifact.project)} / ${escapeHtml(artifact.title || artifact.slug)}</option>`).join("");
  return `<form class="panel form" id="capture-form">
    <div class="split"><label>Title<input name="title" required></label><label>Type<select name="type">${types.map(option).join("")}</select></label></div>
    <label>Body<textarea name="body" rows="10" required></textarea></label>
    <div class="split"><label>Source<input name="source"></label><label>Parent Project<input name="project" list="project-list" placeholder="junkdrawer"></label></div>
    <datalist id="project-list">${projectOptions().map((project) => `<option value="${escapeHtml(project)}"></option>`).join("")}</datalist>
    <h2>Artifact Metadata</h2>
    <div class="split"><label>Artifact<select name="artifactSlug"><option value="">None / create from title</option>${artifactOptions}</select></label><label>Artifact Title<input name="artifactTitle" placeholder="Weather Nerd Radar"></label></div>
    <div class="split"><label>Artifact Type<select name="artifactType"><option value=""></option>${artifactTypes.map(option).join("")}</select></label><label>Artifact Status<select name="artifactStatus"><option value=""></option>${artifactStatuses.map(option).join("")}</select></label></div>
    <div class="split"><label>Artifact File<input name="artifactFile" placeholder="weather_nerd.html"></label><label>Artifact URL<input name="artifactUrl" placeholder="https://..."></label></div>
    <div class="split"><label>Tags<input name="tags" placeholder="comma, separated"></label><label>Status<input name="status" value="new"></label></div>
    <div class="actions">${button("Save to Local Inbox", "save-local", "submit")}${button("Save to Wiki Inbox", "save-wiki", "button")}${button("Save + Triage", "save-triage", "button")}${button("Clear", "clear-form", "reset")}</div>
  </form><div class="panel"><h2>Latest Captures</h2>${entryList(state.entries.slice(0, 5), false)}</div>`;
}

function inbox() {
  return `<div class="panel toolbar">
    <input id="search" placeholder="Search inbox" value="${escapeHtml(state.filters.search)}">
    <select id="filter-type"><option value="">All types</option>${types.map((type) => `<option ${state.filters.type === type ? "selected" : ""}>${type}</option>`).join("")}</select>
    <input id="filter-project" placeholder="Project" value="${escapeHtml(state.filters.project)}">
    <select id="filter-status"><option value="">All status</option>${["new", "triaged", "archived"].map((status) => `<option ${state.filters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
    ${button("Send Selected to Triage", "triage-selected")}${button("Export Selected Markdown", "export-selected")}${button("Archive Selected", "archive-selected")}
  </div><div class="panel">${entryList(filteredEntries(), true)}</div>`;
}

function triage() {
  const activeEntries = state.entries.filter((entry) => !["triaged", "archived"].includes(entry.status));
  const historyEntries = state.entries.filter((entry) => ["triaged", "archived"].includes(entry.status));
  const selected = activeEntries.find((entry) => state.selectedEntryIds.has(entry.id)) || activeEntries[0];
  return `<div class="grid two"><div class="panel"><h2>Selected Note</h2>
    ${activeEntries.length ? `<select id="triage-entry">${activeEntries.map((e) => `<option value="${e.id}" ${selected?.id === e.id ? "selected" : ""}>${escapeHtml(e.title || "Untitled")}</option>`).join("")}</select>` : "<p>No untriaged entries.</p>"}
    <div class="preview">${selected ? renderMarkdownPreview(entryToMarkdown(selected)) : "No entries."}</div>
    ${button("Run Triage", "run-triage", "button", !selected)}
    ${historyEntries.length ? `<details class="triage-history"><summary>Re-triage history (${historyEntries.length})</summary><select id="triage-history-entry">${historyEntries.map((e) => `<option value="${e.id}">${escapeHtml(e.title || "Untitled")} (${escapeHtml(e.status)})</option>`).join("")}</select>${button("Re-triage Selected", "run-history-triage")}</details>` : ""}
    <details><summary>Raw response / errors</summary><pre>${escapeHtml(state.debug)}</pre></details>
  </div><div class="panel"><h2>Pending Operations</h2>${operationList()}</div></div>`;
}

function projects() {
  const selectedProjectSlug = state.selectedProject ? projectSlugFromProjectFile(state.selectedProject) : "";
  const projectArtifacts = selectedProjectSlug ? state.artifacts.filter((artifact) => artifact.project === selectedProjectSlug) : state.artifacts;
  return `<div class="grid two"><div class="panel"><h2>Projects</h2><select id="project-file" size="12">${state.projectFiles.map((file) => `<option ${state.selectedProject === file ? "selected" : ""}>${file}</option>`).join("")}</select><div class="actions">${button("Load", "load-project")}${button("Create Registry if Missing", "create-registry")}</div></div>
  <div class="panel"><h2>Project Markdown</h2><textarea id="project-content" rows="14">${escapeHtml(state.selectedProjectContent)}</textarea><div class="actions">${button("Save Edit", "save-project")}${button("Append Session Note", "append-session")}${button("Generate Codex Prompt", "project-prompt")}</div></div></div>
  <div class="panel"><h2>Artifacts${selectedProjectSlug ? `: ${escapeHtml(titleFromSlug(selectedProjectSlug))}` : ""}</h2>${artifactTable(projectArtifacts)}</div>`;
}

function artifacts() {
  const selected = selectedArtifact();
  return `<div class="grid two"><div class="panel"><h2>Artifact Dashboard</h2>
    <label>Artifact<select id="artifact-select"><option value="">Choose artifact</option>${state.artifacts.map((artifact) => `<option value="${artifactKey(artifact)}" ${state.selectedArtifactKey === artifactKey(artifact) ? "selected" : ""}>${escapeHtml(artifact.project)} / ${escapeHtml(artifact.title || artifact.slug)}</option>`).join("")}</select></label>
    ${selected ? artifactDetails(selected) : "<p>No artifact selected. Create or triage an artifact, or add a registry row.</p>"}
    ${selected ? artifactRegistryEditor(selected) : ""}
    <div class="actions">
      ${button("Open Artifact Note", "open-artifact", "button", !selected)}
      ${button("Queue Registry Update", "queue-registry-edit", "button", !selected)}
      ${button("Generate Artifact Note", "generate-artifact-note", "button", !selected)}
      ${button("Promote Idea to Page", "promote-idea-page", "button", !selected)}
      ${button("Promote Page to Standalone Project", "promote-page-project", "button", !selected)}
      ${button("Mark Live", "mark-artifact-live", "button", !selected)}
      ${button("Mark Parked", "mark-artifact-parked", "button", !selected)}
      ${button("Archive Artifact", "archive-artifact", "button", !selected)}
      ${button("Generate Distilled Artifact Summary", "artifact-distill-op", "button", !selected)}
    </div></div>
    <div class="panel"><h2>Artifact Note</h2><textarea id="artifact-content" rows="24">${escapeHtml(state.selectedArtifactContent)}</textarea></div></div>
    <div class="panel"><h2>Pending Operations</h2>${operationList()}</div>`;
}

function distillation() {
  return `<div class="grid two"><div class="panel"><h2>Source</h2>
    <label>Project<select id="distill-project"><option value="">Choose project</option>${state.projectFiles.map(option).join("")}</select></label>
    <label>Artifact<select id="distill-artifact"><option value="">Parent project summary</option>${state.artifacts.map((artifact) => `<option value="${artifactKey(artifact)}">${escapeHtml(artifact.project)} / ${escapeHtml(artifact.title || artifact.slug)}</option>`).join("")}</select></label>
    <label>Related patterns<select id="distill-patterns" multiple size="8">${state.patternFiles.map(option).join("")}</select></label>
    ${button("Generate Distillation Proposal", "run-distill")}
    <details><summary>Raw response / errors</summary><pre>${escapeHtml(state.debug)}</pre></details>
  </div><div class="panel"><h2>Pending Operations</h2>${operationList()}</div></div>`;
}

function agentContext() {
  return `<div class="grid two"><div class="panel form"><label>Task<textarea id="ctx-task" rows="4"></textarea></label>
    <label>Context Target<select id="ctx-mode"><option value="project">Project</option><option value="artifact">Artifact</option></select></label>
    <label>Project<select id="ctx-project"><option value="">None</option>${state.projectFiles.map(option).join("")}</select></label>
    <label>Artifact<select id="ctx-artifact"><option value="">None</option>${state.artifacts.map((artifact) => `<option value="${artifactKey(artifact)}">${escapeHtml(artifact.project)} / ${escapeHtml(artifact.title || artifact.slug)}</option>`).join("")}</select></label>
    <label>Patterns<select id="ctx-patterns" multiple size="7">${state.patternFiles.map(option).join("")}</select></label>
    <label class="check"><input type="checkbox" id="ctx-prefs" checked> Include user preferences</label>
    <label class="check"><input type="checkbox" id="ctx-index" checked> Include agent index</label>
    <label class="check"><input type="checkbox" id="ctx-active" checked> Include active projects</label>
    <label class="check"><input type="checkbox" id="ctx-harness" checked> Include HARNESS.md</label>
    <div class="actions">${button("Generate Bundle", "generate-context")}${button("Copy", "copy-context")}${button("Export agent-context.md", "export-context")}${button("Generate Codex Prompt", "codex-context")}</div></div>
    <div class="panel"><h2>Bundle</h2><textarea id="context-output" rows="24">${escapeHtml(state.contextOutput)}</textarea></div></div>`;
}

function settings() {
  const paths = Object.entries(state.settings.wikiPaths).map(([key, value]) => `<label>${key}<input name="path:${key}" value="${escapeHtml(value)}"></label>`).join("");
  const artifactPaths = Object.entries(state.settings.childArtifactConventions).map(([key, value]) => `<label>${key}<input name="artifactPath:${key}" value="${escapeHtml(value)}"></label>`).join("");
  return `<form class="panel form" id="settings-form">
    <div class="split"><label>Theme<select name="theme">${["system", "dark", "light"].map((v) => `<option ${state.settings.theme === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Storage Mode<select name="storageMode">${["filesystem", "export-import"].map((v) => `<option ${state.settings.storageMode === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
    <label>OpenRouter API Key<input name="openRouterApiKey" type="password" value="${escapeHtml(state.settings.openRouterApiKey)}" autocomplete="off"></label>
    <div class="grid two">${["defaultModel", "triageModel", "distillModel", "promptModel"].map((name) => `<label>${name}<input list="model-list" name="${name}" value="${escapeHtml(state.settings[name])}"></label>`).join("")}</div>
    <datalist id="model-list">${state.models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("")}</datalist>
    <div class="split"><label>Temperature<input name="temperature" type="number" min="0" max="2" step="0.1" value="${state.settings.temperature}"></label><label>Max Tokens<input name="maxTokens" type="number" min="256" step="128" value="${state.settings.maxTokens}"></label></div>
    <h2>Directory Mappings</h2><div class="grid two">${paths}</div>
    <h2>Artifact Path Templates</h2><div class="grid two">${artifactPaths}</div>
    <div class="actions">${button("Save Settings", "save-settings", "submit")}${button("Fetch OpenRouter Models", "fetch-models", "button")}${button("Connect Wiki Folder", "connect", "button")}</div>
  </form>`;
}

function bindGlobal() {
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { state.tab = el.dataset.tab; render(); }));
  document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", actions));
  document.querySelector("#capture-form")?.addEventListener("submit", actions);
  document.querySelector("#settings-form")?.addEventListener("submit", actions);
  ["#search", "#filter-type", "#filter-project", "#filter-status"].forEach((selector) => document.querySelector(selector)?.addEventListener("change", updateFilters));
  document.querySelectorAll("[data-entry]").forEach((el) => el.addEventListener("change", () => el.checked ? state.selectedEntryIds.add(el.value) : state.selectedEntryIds.delete(el.value)));
  document.querySelector("#triage-entry")?.addEventListener("change", (event) => { state.selectedEntryIds = new Set([event.target.value]); render(); });
  document.querySelector("#artifact-select")?.addEventListener("change", (event) => { state.selectedArtifactKey = event.target.value; state.selectedArtifactContent = ""; render(); });
}

async function actions(event) {
  const action = event.submitter?.dataset.action || event.currentTarget?.dataset.action || event.target?.dataset.action;
  if (action) event.preventDefault();
  try {
    if (action === "connect") await connect();
    if (action === "go-capture") state.tab = "Capture";
    if (action === "go-triage") state.tab = "Triage";
    if (action === "go-agent") state.tab = "Agent Context";
    if (action === "backup") await exportBackup();
    if (action === "save-local") await saveCapture(false, false);
    if (action === "save-wiki") await saveCapture(true, false);
    if (action === "save-triage") await saveCapture(true, true);
    if (action === "triage-selected") { state.tab = "Triage"; }
    if (action === "export-selected") await exportSelected();
    if (action === "archive-selected") await archiveSelected();
    if (action === "run-triage") await runTriage();
    if (action === "run-history-triage") await runHistoryTriage();
    if (action === "run-distill") await runDistill();
    if (action === "save-settings") await saveSettingsForm();
    if (action === "fetch-models") await loadModels();
    if (action === "load-project") await loadProject();
    if (action === "create-registry") await createRegistry();
    if (action === "save-project") await saveProject();
    if (action === "append-session") await appendSessionNote();
    if (action === "project-prompt") await projectPrompt();
    if (action === "generate-context") await generateContext(false);
    if (action === "codex-context") await generateContext(true);
    if (action === "copy-context") await navigator.clipboard.writeText(document.querySelector("#context-output").value || state.contextOutput);
    if (action === "export-context") await exportTextFile("agent-context.md", document.querySelector("#context-output").value || state.contextOutput);
    if (action === "open-artifact") await openArtifact();
    if (action === "queue-registry-edit") await queueRegistryEdit();
    if (action === "generate-artifact-note") await generateArtifactNote();
    if (action === "promote-idea-page") await promoteIdeaToPage();
    if (action === "promote-page-project") await promotePageToProject();
    if (action === "mark-artifact-live") await markArtifactStatus("live");
    if (action === "mark-artifact-parked") await markArtifactStatus("parked");
    if (action === "archive-artifact") await markArtifactStatus("archived");
    if (action === "artifact-distill-op") await generateArtifactDistillOperation();
    if (action?.startsWith("approve:")) await setOperation(action.split(":")[1], "approved");
    if (action?.startsWith("reject:")) await setOperation(action.split(":")[1], "rejected");
    if (action?.startsWith("apply:")) await applyOp(action.split(":")[1]);
    if (action?.startsWith("approve-apply:")) await approveAndApplyOp(action.split(":")[1]);
    if (action?.startsWith("preview:")) await previewOp(action.split(":")[1]);
  } catch (error) {
    state.debug = error.message;
    state.notice = error.message;
  }
  await refreshData();
  render();
}

async function connect() {
  if (!supportsFileSystemAccess()) throw new Error("This browser does not support File System Access. Use local inbox and export/import mode.");
  state.wikiHandle = await requestWikiDirectory();
  await verifyPermission(state.wikiHandle, true);
  await saveDirectoryHandle(state.wikiHandle);
}

async function saveCapture(saveWiki, triageNow) {
  const form = new FormData(document.querySelector("#capture-form"));
  const raw = Object.fromEntries(form.entries());
  if (String(raw.artifactSlug || "").includes("/")) {
    const [project, artifact] = raw.artifactSlug.split("/");
    raw.project ||= project;
    raw.artifactSlug = artifact;
    const existing = state.artifacts.find((item) => item.project === project && item.slug === artifact);
    if (existing) {
      raw.artifactTitle ||= existing.title;
      raw.artifactType ||= existing.type;
      raw.artifactStatus ||= existing.status;
      raw.artifactFile ||= existing.file;
      raw.artifactUrl ||= existing.url;
    }
  }
  const entry = normalizeArtifactEntry(raw);
  entry.tags = String(entry.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  await updateEntry(entry);
  if (saveWiki) {
    if (!state.wikiHandle) throw new Error("Connect wiki folder before saving to wiki inbox.");
    await saveEntryToWikiInbox(state.wikiHandle, state.settings, entry);
  }
  if (triageNow) {
    state.selectedEntryIds = new Set([entry.id]);
    state.tab = "Triage";
    await runTriage(entry);
  }
}

async function runTriage(entry = null) {
  const target = entry || state.entries.find((item) => state.selectedEntryIds.has(item.id) && !["triaged", "archived"].includes(item.status)) || state.entries.find((item) => !["triaged", "archived"].includes(item.status));
  if (!target) throw new Error("No entry selected for triage.");
  state.debug = "Triage request running...";
  render();
  const result = await triageEntry(target, state.settings);
  state.debug = result.raw;
  for (const operation of result.parsed.operations) {
    await addOperation({ ...operation, project: result.parsed.project, artifact: result.parsed.artifact, entryId: target.id, source: "triage", rationale: result.parsed.rationale, summary: result.parsed.summary });
  }
  await updateEntry({ ...target, status: "triaged" });
}

async function runHistoryTriage() {
  const id = document.querySelector("#triage-history-entry")?.value;
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) throw new Error("No history entry selected for re-triage.");
  await runTriage(entry);
}

async function runDistill() {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before distillation.");
  const project = document.querySelector("#distill-project").value;
  const artifact = state.artifacts.find((item) => artifactKey(item) === document.querySelector("#distill-artifact")?.value);
  const patterns = selectedOptions("#distill-patterns");
  state.debug = "Distillation request running...";
  render();
  let context = project ? `# ${project}\n${await readFile(state.wikiHandle, project)}\n\n` : "";
  if (artifact) {
    context += `# Artifact ${artifact.project}/${artifact.slug}\n`;
    context += await readFile(state.wikiHandle, artifact.path || artifactPathForStatus(artifact)).catch((error) => `Unavailable: ${error.message}`);
    context += "\n\n";
  }
  for (const file of patterns) context += `# ${file}\n${await readFile(state.wikiHandle, file)}\n\n`;
  const result = await distillContext(context, state.settings, artifact ? { type: "artifact", artifact } : { type: "project", project });
  state.debug = result.raw;
  for (const operation of result.parsed.operations) await addOperation({ ...operation, source: "distillation", rationale: result.parsed.rationale, summary: result.parsed.summary });
}

async function setOperation(id, status) {
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  await updateOperation({ ...op, content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content }, status);
  state.notice = status === "approved" ? "Operation approved. Click Apply to write it to the connected wiki folder." : "Operation rejected and kept in history.";
}

async function applyOp(id) {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before applying operations.");
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  const edited = { ...op, content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content };
  if (op.type === "replace_section" && !confirm("replace_section can overwrite existing section content. Apply this operation?")) return;
  if (op.status !== "approved") throw new Error("Approve the operation before applying it.");
  const message = await applyOperation(state.wikiHandle, edited);
  await updateOperation(edited, "applied", { message });
  state.notice = `Operation applied: ${message}.`;
}

async function approveAndApplyOp(id) {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before applying operations.");
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  const edited = { ...op, content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content };
  if (op.type === "replace_section" && !confirm("replace_section can overwrite existing section content. Apply this operation?")) return;
  const approved = await updateOperation(edited, "approved");
  const message = await applyOperation(state.wikiHandle, approved);
  await updateOperation(approved, "applied", { message });
  state.notice = `Operation approved and applied: ${message}.`;
}

async function saveSettingsForm() {
  const data = Object.fromEntries(new FormData(document.querySelector("#settings-form")).entries());
  const wikiPaths = {};
  const childArtifactConventions = {};
  Object.entries(data).forEach(([key, value]) => { if (key.startsWith("path:")) wikiPaths[key.slice(5)] = value; });
  Object.entries(data).forEach(([key, value]) => { if (key.startsWith("artifactPath:")) childArtifactConventions[key.slice(13)] = value; });
  state.settings = saveSettings({ ...state.settings, ...data, temperature: Number(data.temperature), maxTokens: Number(data.maxTokens), wikiPaths, childArtifactConventions });
}

async function loadModels() {
  state.models = await fetchOpenRouterModels(state.settings.openRouterApiKey);
  state.debug = `Loaded ${state.models.length} models.`;
}

async function loadProject() {
  state.selectedProject = document.querySelector("#project-file").value;
  state.selectedProjectContent = state.selectedProject ? await readFile(state.wikiHandle, state.selectedProject) : "";
}

async function createRegistry() {
  if (document.querySelector("#project-file")?.value) state.selectedProject = document.querySelector("#project-file").value;
  const slug = projectSlugFromProjectFile(state.selectedProject);
  if (!slug) throw new Error("Select a project first.");
  await addOperation({
    type: "create_file",
    file: artifactRegistryPath(state.settings, slug),
    template: "artifact_registry",
    content: emptyRegistry(titleFromSlug(slug)),
    source: "artifact",
    rationale: "Create missing artifact registry for parent project."
  });
  state.notice = "Registry creation operation queued for review.";
}

async function saveProject() {
  await writeFile(state.wikiHandle, state.selectedProject, document.querySelector("#project-content").value);
}

async function appendSessionNote() {
  const note = prompt("Session note to append:");
  if (!note) return;
  await writeFile(state.wikiHandle, state.selectedProject, `${document.querySelector("#project-content").value.trimEnd()}\n\n## Session Note ${new Date().toISOString()}\n\n${note}\n`);
}

async function projectPrompt() {
  const text = `Use this project context for the next coding task:\n\n${document.querySelector("#project-content").value}`;
  await navigator.clipboard.writeText(text);
}

async function openArtifact() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const path = artifact.path || artifactPathForStatus(artifact);
  state.selectedArtifactContent = await readFile(state.wikiHandle, path);
  state.notice = `Loaded ${path}.`;
}

async function queueRegistryEdit() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const form = new FormData(document.querySelector("#artifact-registry-form"));
  const edited = { ...artifact, ...Object.fromEntries(form.entries()) };
  await queueRegistryUpdate(edited);
  state.notice = "Registry row update queued for review.";
}

async function generateArtifactNote() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const path = artifact.path || artifactPathForStatus(artifact);
  const template = artifact.status === "seed" || artifact.type === "idea" ? "artifact_idea" : "artifact_page";
  await addOperation({
    type: "create_file",
    file: path,
    template,
    content: artifactTemplate(template, artifactTemplateData(artifact)),
    source: "artifact",
    rationale: "Generate artifact note from registry metadata."
  });
  await queueRegistryUpdate(artifact);
  state.notice = "Artifact note and registry update queued for review.";
}

async function promoteIdeaToPage() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const from = fillArtifactPath(state.settings.childArtifactConventions.ideas, artifact.project, artifact.slug);
  const file = fillArtifactPath(state.settings.childArtifactConventions.pages, artifact.project, artifact.slug);
  await addOperation({ type: "copy_file", from, file, source: "promotion", rationale: "Promote artifact idea note into a page note without deleting the original." });
  await addOperation({ type: "append_section", file: from, section: "Promotion", content: `Promoted to page note: ${file}`, source: "promotion", rationale: "Cross-link old idea note to the promoted page." });
  await queueRegistryUpdate({ ...artifact, status: "specced", type: "page" });
  state.notice = "Idea-to-page promotion operations queued for review.";
}

async function promotePageToProject() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const newProject = `${state.settings.wikiPaths.projects}/${artifact.slug}.md`;
  const oldPath = artifact.path || fillArtifactPath(state.settings.childArtifactConventions.pages, artifact.project, artifact.slug);
  await addOperation({
    type: "create_file",
    file: newProject,
    template: "project",
    content: `# ${artifact.title || titleFromSlug(artifact.slug)}\n\nPromoted from ${oldPath} in parent project ${artifact.project}.\n\n## Purpose\n\n${artifact.notes || ""}\n`,
    source: "promotion",
    rationale: "Create standalone project file for promoted artifact."
  });
  await addOperation({ type: "append_section", file: oldPath, section: "Promotion", content: `Promoted to standalone project: ${newProject}`, source: "promotion", rationale: "Cross-link old artifact note to the standalone project." });
  await queueRegistryUpdate({ ...artifact, status: "promoted" });
  state.notice = "Page-to-project promotion operations queued for review.";
}

async function markArtifactStatus(status) {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  await queueRegistryUpdate({ ...artifact, status });
  state.notice = `Artifact status update queued: ${status}.`;
}

async function generateArtifactDistillOperation() {
  const artifact = selectedArtifact();
  if (!artifact) throw new Error("Select an artifact first.");
  const file = fillArtifactPath(state.settings.childArtifactConventions.distilled, artifact.project, artifact.slug);
  await addOperation({
    type: "create_file",
    file,
    template: "distilled_artifact_summary",
    content: artifactTemplate("distilled_artifact_summary", artifactTemplateData(artifact)),
    source: "distillation",
    rationale: "Create a reviewed distilled artifact summary only for important/revisited artifacts."
  });
  state.notice = "Distilled artifact summary operation queued for review.";
}

async function queueRegistryUpdate(artifact) {
  await addOperation({
    type: "update_artifact_registry",
    file: artifactRegistryPath(state.settings, artifact.project),
    project: artifact.project,
    projectTitle: titleFromSlug(artifact.project),
    artifact,
    source: "artifact",
    rationale: "Append or update artifact registry row."
  });
}

async function generateContext(codex) {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before generating context.");
  const task = document.querySelector("#ctx-task").value;
  const targetMode = document.querySelector("#ctx-mode").value;
  const artifact = state.artifacts.find((item) => artifactKey(item) === document.querySelector("#ctx-artifact").value);
  const bundle = await buildAgentContext(state.wikiHandle, state.settings, {
    task,
    targetMode,
    artifact,
    project: document.querySelector("#ctx-project").value,
    patterns: selectedOptions("#ctx-patterns"),
    includeUserPreferences: document.querySelector("#ctx-prefs").checked,
    includeAgentIndex: document.querySelector("#ctx-index").checked,
    includeActiveProjects: document.querySelector("#ctx-active").checked,
    includeHarness: document.querySelector("#ctx-harness").checked
  });
  state.contextOutput = codex ? buildCodexPrompt(bundle, task) : bundle;
}

async function exportBackup() {
  await exportTextFile("brain-tools-backup.json", JSON.stringify({ settings: { ...state.settings, openRouterApiKey: "" }, entries: state.entries, operations: state.operations }, null, 2), "application/json");
}

async function exportSelected() {
  await exportTextFile("brain-tools-selected.md", selectedEntries().map(entryToMarkdown).join("\n\n"));
}

async function archiveSelected() {
  for (const entry of selectedEntries()) await updateEntry({ ...entry, status: "archived" });
}

function filteredEntries() {
  const search = state.filters.search.toLowerCase();
  const type = state.filters.type;
  const project = state.filters.project.toLowerCase();
  const status = state.filters.status;
  return state.entries.filter((entry) => (!search || JSON.stringify(entry).toLowerCase().includes(search)) && (!type || entry.type === type) && (!project || String(entry.project || "").toLowerCase().includes(project)) && (!status || entry.status === status));
}

function updateFilters() {
  state.filters = {
    search: document.querySelector("#search")?.value || "",
    type: document.querySelector("#filter-type")?.value || "",
    project: document.querySelector("#filter-project")?.value || "",
    status: document.querySelector("#filter-status")?.value || ""
  };
  render();
}

function selectedEntries() {
  return state.entries.filter((entry) => state.selectedEntryIds.has(entry.id));
}

function operationList() {
  const active = state.operations.filter((op) => op.status === "pending" || op.status === "approved");
  const history = state.operations.filter((op) => op.status !== "pending" && op.status !== "approved");
  const activeMarkup = active.length ? active.map(operationCard).join("") : "<p>No pending operations.</p>";
  const historyMarkup = history.length ? `<details class="operation-history"><summary>History (${history.length})</summary>${history.map(operationCard).join("")}</details>` : "";
  return activeMarkup + historyMarkup;
}

function operationCard(op) {
    const preview = state.previews[op.id];
    const contentValue = operationContentValue(op);
    return `<article class="operation">
    <div>${statusBadge(op.status)} ${badge(op.type)} <strong>${escapeHtml(op.file)}</strong>${op.section ? ` <span>${escapeHtml(op.section)}</span>` : ""}</div>
    ${operationMeta(op)}
    <textarea data-op-content="${op.id}" rows="7" ${op.status === "applied" || op.type === "update_artifact_registry" || op.type === "copy_file" ? "disabled" : ""}>${escapeHtml(contentValue)}</textarea>
    <p>${escapeHtml(op.rationale || "")}</p>
    <div class="actions">
      ${button("Preview", `preview:${op.id}`)}
      ${button(op.status === "approved" ? "Approved" : "Approve", `approve:${op.id}`, "button", op.status !== "pending")}
      ${button("Reject", `reject:${op.id}`, "button", op.status === "applied" || op.status === "rejected")}
      ${button("Apply", `apply:${op.id}`, "button", op.status !== "approved")}
      ${button("Approve & Apply", `approve-apply:${op.id}`, "button", op.status !== "pending")}
    </div>
    ${preview ? `<details open><summary>Current file preview</summary><pre>${escapeHtml(preview.current || "(new file)")}</pre></details><details><summary>Resulting preview</summary><pre>${escapeHtml(preview.next)}</pre></details>` : ""}
  </article>`;
}

async function previewOp(id) {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before previewing operations.");
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  state.previews[id] = await previewOperation(state.wikiHandle, { ...op, content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content });
  state.notice = "Preview generated from the current file and proposed operation.";
}

function operationContentValue(op) {
  if (op.type === "update_artifact_registry") return artifactRegistryRow(op.artifact || {});
  if (op.type === "copy_file") return `Copy from: ${op.from}\nCopy to: ${op.file}`;
  return op.content || "";
}

function operationMeta(op) {
  if (op.type === "update_artifact_registry" && op.artifact) {
    return `<p><strong>Registry row:</strong> ${escapeHtml(op.artifact.project || operationProjectSlug(op.project))} / ${escapeHtml(op.artifact.slug || "")} -> ${escapeHtml(op.artifact.status || "")}</p>`;
  }
  if (op.type === "copy_file") return `<p><strong>Copy source:</strong> <code>${escapeHtml(op.from || "")}</code></p>`;
  return "";
}

function operationProjectSlug(project) {
  if (!project) return "";
  if (typeof project === "string") return project;
  return project.slug || project.title || "";
}

function entryList(entries, selectable) {
  if (!entries.length) return "<p>No entries.</p>";
  return entries.map((entry) => `<article class="entry">${selectable ? `<input type="checkbox" data-entry value="${entry.id}" ${state.selectedEntryIds.has(entry.id) ? "checked" : ""}>` : ""}<div><h3>${escapeHtml(entry.title || "Untitled")}</h3><p>${escapeHtml((entry.body || "").slice(0, 220))}</p><div>${badge(entry.type)} ${badge(entry.status || "new")} <span>${escapeHtml(entry.project || "")}</span></div></div></article>`).join("");
}

function health() {
  if (!supportsFileSystemAccess()) return "<p>File System Access is unavailable in this browser.</p>";
  if (!state.wikiHandle) return "<p>No wiki folder connected.</p>";
  return state.health.map((item) => `<div class="health">${badge(item.exists ? "ok" : "missing", item.exists ? "good" : "bad")}<code>${escapeHtml(item.path)}</code></div>`).join("");
}

function stat(label, value) {
  return `<div class="panel stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function badge(text, tone = "") {
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

function statusBadge(status) {
  const tone = { approved: "good", applied: "good", rejected: "bad", pending: "warn" }[status] || "";
  return badge(status, tone);
}

function button(label, action, type = "button", disabled = false) {
  return `<button type="${type}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function option(value) {
  return `<option>${escapeHtml(value)}</option>`;
}

function selectedOptions(selector) {
  return Array.from(document.querySelector(selector)?.selectedOptions || []).map((option) => option.value);
}

async function loadArtifactRegistries() {
  const artifacts = [];
  for (const file of state.projectFiles) {
    const slug = projectSlugFromProjectFile(file);
    if (!slug) continue;
    try {
      const registry = await readFile(state.wikiHandle, artifactRegistryPath(state.settings, slug));
      artifacts.push(...parseArtifactRegistry(registry).map((artifact) => ({
        ...artifact,
        project: slug,
        path: artifactPathForStatus({ ...artifact, project: slug })
      })));
    } catch {
      // Missing registries are expected for parent projects without artifacts.
    }
  }
  return artifacts.sort((a, b) => `${a.project}/${a.slug}`.localeCompare(`${b.project}/${b.slug}`));
}

function projectSlugFromProjectFile(file) {
  return String(file || "").replace(/^projects\//, "").replace(/\.md$/, "");
}

function projectOptions() {
  return state.projectFiles.map(projectSlugFromProjectFile).filter(Boolean);
}

function artifactKey(artifact) {
  return `${artifact.project}/${artifact.slug}`;
}

function selectedArtifact() {
  if (!state.selectedArtifactKey) return null;
  return state.artifacts.find((artifact) => artifactKey(artifact) === state.selectedArtifactKey) || null;
}

function artifactPathForStatus(artifact) {
  if (artifact.status === "archived") return fillArtifactPath(state.settings.childArtifactConventions.archive, artifact.project, artifact.slug);
  if (artifact.status === "seed" || artifact.type === "idea") return fillArtifactPath(state.settings.childArtifactConventions.ideas, artifact.project, artifact.slug);
  return fillArtifactPath(state.settings.childArtifactConventions.pages, artifact.project, artifact.slug);
}

function artifactTemplateData(artifact) {
  return {
    project: artifact.project,
    parentProjectTitle: titleFromSlug(artifact.project),
    artifactSlug: artifact.slug,
    artifactTitle: artifact.title || titleFromSlug(artifact.slug),
    artifactStatus: artifact.status,
    artifactFile: artifact.file,
    artifactUrl: artifact.url,
    notes: artifact.notes,
    purpose: artifact.notes,
    concept: artifact.notes,
    value: artifact.notes
  };
}

function artifactTable(artifacts) {
  if (!artifacts.length) return "<p>No artifact registries found for these projects.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Type</th><th>File</th><th>URL</th><th>Last Updated</th><th>Next Action</th></tr></thead><tbody>${artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.title)}</td><td><code>${escapeHtml(artifact.slug)}</code></td><td>${statusBadge(artifact.status)}</td><td>${escapeHtml(artifact.type)}</td><td><code>${escapeHtml(artifact.file)}</code></td><td>${artifact.url ? `<a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${escapeHtml(artifact.url)}</a>` : ""}</td><td></td><td>${escapeHtml(artifact.notes || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function artifactDetails(artifact) {
  const distilled = fillArtifactPath(state.settings.childArtifactConventions.distilled, artifact.project, artifact.slug);
  const sections = parseMarkdownSections(state.selectedArtifactContent);
  const field = (name, fallback = "") => escapeHtml(sections[name] || fallback || "");
  return `<dl class="details">
    <dt>Parent project</dt><dd>${escapeHtml(titleFromSlug(artifact.project))}</dd>
    <dt>Artifact title</dt><dd>${escapeHtml(artifact.title || titleFromSlug(artifact.slug))}</dd>
    <dt>Slug</dt><dd><code>${escapeHtml(artifact.slug)}</code></dd>
    <dt>Type</dt><dd>${escapeHtml(artifact.type)}</dd>
    <dt>Status</dt><dd>${statusBadge(artifact.status)}</dd>
    <dt>File</dt><dd><code>${escapeHtml(artifact.file)}</code></dd>
    <dt>URL</dt><dd>${artifact.url ? `<a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${escapeHtml(artifact.url)}</a>` : ""}</dd>
    <dt>Purpose</dt><dd><pre>${field("Purpose", artifact.notes)}</pre></dd>
    <dt>Core features</dt><dd><pre>${field("Core Features")}</pre></dd>
    <dt>Decisions</dt><dd><pre>${field("Decisions")}</pre></dd>
    <dt>Session notes</dt><dd><pre>${field("Session Notes", artifact.path || artifactPathForStatus(artifact))}</pre></dd>
    <dt>Next actions</dt><dd><pre>${field("Next Actions")}</pre></dd>
    <dt>Related patterns</dt><dd><pre>${field("Related Patterns", "Select patterns in Agent Context.")}</pre></dd>
    <dt>Distilled summary status</dt><dd><code>${escapeHtml(distilled)}</code></dd>
  </dl>`;
}

function artifactRegistryEditor(artifact) {
  return `<form id="artifact-registry-form" class="registry-editor">
    <h2>Registry Row</h2>
    <input type="hidden" name="project" value="${escapeHtml(artifact.project)}">
    <div class="split"><label>Slug<input name="slug" value="${escapeHtml(artifact.slug)}"></label><label>Title<input name="title" value="${escapeHtml(artifact.title || "")}"></label></div>
    <div class="split"><label>Type<select name="type">${artifactTypes.map((type) => `<option ${artifact.type === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label><label>Status<select name="status">${artifactStatuses.map((status) => `<option ${artifact.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label></div>
    <div class="split"><label>File<input name="file" value="${escapeHtml(artifact.file || "")}"></label><label>URL<input name="url" value="${escapeHtml(artifact.url || "")}"></label></div>
    <label>Notes<input name="notes" value="${escapeHtml(artifact.notes || "")}"></label>
  </form>`;
}
