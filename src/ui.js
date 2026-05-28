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
import { artifactRegistryPath, artifactRegistryRow, artifactStatuses, artifactTypes, emptyRegistry, fillArtifactPath, normalizeArtifactEntry, parseArtifactRegistry, titleFromSlug } from "./artifacts.js";
import { appendCaptureToProject, createArtifactFromCapture, createProjectFromCapture, extractDecisionFromCapture, extractPatternFromCapture, savePromptFromCapture, saveReferenceFromCapture } from "./filing.js";

const tabs = ["Dashboard", "Inbox", "Projects", "Agent Context", "Settings", "Advanced"];
const types = ["Project Idea", "Conversation", "Prompt", "Code Note", "Decision", "Troubleshooting", "Recipe", "Song", "Image Style", "API Note", "Model Note", "Business Idea", "General Note"];

let state = {
  settings: loadSettings(),
  tab: "Dashboard",
  captureOpen: false,
  reviewId: "",
  entries: [],
  operations: [],
  wikiHandle: null,
  health: [],
  projectFiles: [],
  patternFiles: [],
  artifacts: [],
  selectedProject: "",
  selectedProjectContent: "",
  selectedArtifactKey: "",
  selectedArtifactContent: "",
  debug: "",
  notice: "",
  models: [],
  filters: { search: "", type: "", status: "" },
  previews: {},
  contextOutput: ""
};

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
      <div class="brand"><span class="brand-mark">BT</span><div><strong>Brain Tools</strong><small>Inbox -> Review -> File</small></div></div>
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
    Dashboard: "Status and fast entry points for the review queue.",
    Inbox: "Capture notes, review one item at a time, and choose where each thought belongs.",
    Projects: "Projects are first-class Markdown files. Artifacts are optional child structure.",
    "Agent Context": "Build project or artifact context bundles without requiring registries.",
    Settings: "Local settings, OpenRouter models, and path mappings.",
    Advanced: "Pending operations, history, distillation, artifact registries, and debug output."
  }[state.tab];
}

function view() {
  if (state.tab === "Dashboard") return dashboard();
  if (state.tab === "Inbox") return inbox();
  if (state.tab === "Projects") return projects();
  if (state.tab === "Agent Context") return agentContext();
  if (state.tab === "Settings") return settings();
  return advanced();
}

function dashboard() {
  const activeInbox = inboxEntries().length;
  const pending = state.operations.filter((op) => op.status === "pending" || op.status === "approved").length;
  return `<div class="grid stats">
    ${stat("Wiki Folder", state.wikiHandle ? "Connected" : "Not connected")}
    ${stat("OpenRouter", state.settings.openRouterApiKey ? "Configured" : "Not configured")}
    ${stat("Inbox Review", activeInbox)}
    ${stat("Projects", state.projectFiles.length)}
    ${stat("Pending Ops", pending)}
  </div>
  <div class="panel"><h2>Primary Actions</h2><div class="actions">
    ${button("Review Inbox", "go-inbox")}
    ${button("New Capture", "new-capture")}
    ${button("Create Project", "go-projects")}
    ${button("Connect Wiki Folder", "connect")}
  </div></div>
  <div class="panel"><h2>Recent Activity</h2>${recentActivity()}</div>`;
}

function inbox() {
  const selected = selectedReviewEntry();
  return `${capturePanel()}
  <div class="grid two">
    <div class="panel"><h2>Inbox Work Queue</h2>${inboxFilters()}${inboxList(filteredInboxEntries())}</div>
    <div class="panel"><h2>Review Inbox Item</h2>${selected ? reviewPanel(selected) : "<p>Select an inbox item to review. Captures do not need a project or artifact.</p>"}</div>
  </div>`;
}

function capturePanel() {
  if (!state.captureOpen) return `<div class="panel"><div class="actions">${button("New Capture", "new-capture")}</div></div>`;
  return `<form class="panel form" id="capture-form">
    <div class="split"><label>Title<input name="title" required></label><label>Type<select name="type">${types.map(option).join("")}</select></label></div>
    <label>Body<textarea name="body" rows="8" required></textarea></label>
    <div class="split"><label>Source<input name="source"></label><label>Tags<input name="tags" placeholder="comma, separated"></label></div>
    <details><summary>Optional project/artifact metadata</summary>
      <div class="split"><label>Project Title<input name="projectTitle"></label><label>Project Slug<input name="projectSlug"></label></div>
      <div class="split"><label>Artifact Title<input name="artifactTitle"></label><label>Artifact Slug<input name="artifactSlug"></label></div>
      <div class="split"><label>Artifact Type<select name="artifactType"><option value=""></option>${artifactTypes.map(option).join("")}</select></label><label>Artifact Status<select name="artifactStatus"><option value=""></option>${artifactStatuses.map(option).join("")}</select></label></div>
      <div class="split"><label>Artifact File<input name="artifactFile"></label><label>Artifact URL<input name="artifactUrl"></label></div>
    </details>
    <div class="actions">${button("Save to Inbox", "save-capture", "submit")}${button("Save to Wiki Inbox", "save-capture-wiki", "submit")}${button("Clear", "cancel-capture", "reset")}</div>
  </form>`;
}

function inboxFilters() {
  return `<div class="toolbar">
    <input id="search" placeholder="Search inbox" value="${escapeHtml(state.filters.search)}">
    <select id="filter-type"><option value="">All types</option>${types.map((type) => `<option ${state.filters.type === type ? "selected" : ""}>${type}</option>`).join("")}</select>
    <select id="filter-status"><option value="">Active status</option>${["captured", "triaged", "reviewed"].map((status) => `<option ${state.filters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
  </div>`;
}

function inboxList(entries) {
  if (!entries.length) return "<p>No inbox items need review.</p>";
  return entries.map((entry) => `<article class="entry ${state.reviewId === entry.id ? "active-entry" : ""}">
    <div><h3>${escapeHtml(entry.title || "Untitled")}</h3><p>${escapeHtml((entry.body || "").slice(0, 220))}</p>
    <div>${badge(entry.type)} ${badge(entry.status || "captured")} <span>${escapeHtml(entry.source || "")}</span> <span>${escapeHtml(entry.createdAt || "")}</span></div>
    <div class="actions">${button("Review", `review:${entry.id}`)}${button("Triage", `triage:${entry.id}`)}${button("Archive", `archive-entry:${entry.id}`)}</div></div>
  </article>`).join("");
}

function reviewPanel(entry) {
  return `<div class="review-layout">
    <div class="preview">${renderMarkdownPreview(entryToMarkdown(entry))}</div>
    ${entry.triage ? triageSuggestions(entry.triage) : `<p>${badge("Manual path available", "good")} Triage is optional.</p>`}
    <div class="filing-actions">
      ${createProjectForm(entry)}
      ${appendProjectForm(entry)}
      ${createArtifactForm(entry)}
      ${knowledgeForms(entry)}
      <div class="panel-lite"><h3>Archive</h3><p>Remove this item from the active review queue without writing to the wiki.</p>${button("Archive Capture", `archive-entry:${entry.id}`)}</div>
    </div>
  </div>`;
}

function triageSuggestions(triage) {
  return `<div class="panel-lite"><h3>Suggested Filing</h3><p>${escapeHtml(triage.summary || "")}</p>
    ${(triage.suggestions || []).map((s) => `<div class="suggestion">${badge(s.action)} ${badge(Math.round(s.confidence * 100) + "%")} <strong>${escapeHtml(s.title || s.slug || "")}</strong><p>${escapeHtml(s.summary || "")}</p></div>`).join("")}
    <details><summary>Rationale</summary><p>${escapeHtml(triage.rationale || "")}</p></details>
  </div>`;
}

function createProjectForm(entry) {
  const suggestion = firstSuggestion(entry, "create_project") || {};
  const title = suggestion.title || entry.projectTitle || entry.title || "";
  const slug = suggestion.slug || entry.projectSlug || slugify(title);
  return `<form class="panel-lite filing-form" data-entry-id="${entry.id}" data-filing="create-project">
    <h3>Create New Project</h3>
    <div class="split"><label>Project title<input name="title" value="${escapeHtml(title)}"></label><label>Slug<input name="slug" value="${escapeHtml(slug)}"></label></div>
    <div class="split"><label>Status<input name="status" value="active"></label><label>Destination<input value="${escapeHtml(state.settings.wikiPaths.projects)}/${escapeHtml(slug)}.md" disabled></label></div>
    <label>Purpose summary<textarea name="summary" rows="4">${escapeHtml(suggestion.summary || entry.body || "")}</textarea></label>
    ${button("Create Project Operation", "file-create-project", "submit")}
  </form>`;
}

function appendProjectForm(entry) {
  return `<form class="panel-lite filing-form" data-entry-id="${entry.id}" data-filing="append-project">
    <h3>Append to Existing Project</h3>
    <label>Project<select name="projectFile">${state.projectFiles.map(option).join("")}</select></label>
    ${button("Append Note Operation", "file-append-project", "submit", !state.projectFiles.length)}
  </form>`;
}

function createArtifactForm(entry) {
  const suggestion = firstSuggestion(entry, "create_artifact") || {};
  return `<form class="panel-lite filing-form" data-entry-id="${entry.id}" data-filing="create-artifact">
    <h3>Create Artifact Under Project</h3>
    <p>Optional child page/tool/asset. Use only when this capture clearly belongs under a parent project.</p>
    <div class="split"><label>Parent project<select name="projectSlug">${projectOptions().map((project) => `<option ${project === suggestion.projectSlug ? "selected" : ""}>${escapeHtml(project)}</option>`).join("")}</select></label><label>Artifact title<input name="artifactTitle" value="${escapeHtml(suggestion.artifactTitle || suggestion.title || entry.artifactTitle || entry.title || "")}"></label></div>
    <div class="split"><label>Artifact slug<input name="artifactSlug" value="${escapeHtml(suggestion.artifactSlug || suggestion.slug || entry.artifactSlug || slugify(entry.artifactTitle || entry.title || ""))}"></label><label>Type<select name="artifactType"><option value=""></option>${artifactTypes.map((type) => `<option ${type === (suggestion.artifactType || entry.artifactType) ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label></div>
    <div class="split"><label>Status<select name="artifactStatus"><option value=""></option>${artifactStatuses.map((status) => `<option ${status === (entry.artifactStatus || "seed") ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label><label>Artifact file<input name="artifactFile" value="${escapeHtml(entry.artifactFile || "")}"></label></div>
    <label><input type="checkbox" name="updateRegistry" value="yes"> Also queue optional registry update</label>
    ${button("Create Artifact Operation", "file-create-artifact", "submit", !state.projectFiles.length)}
  </form>`;
}

function knowledgeForms(entry) {
  return `<div class="grid two compact-grid">
    ${knowledgeForm(entry, "Pattern", "extract-pattern", "extract_pattern")}
    ${knowledgeForm(entry, "Decision", "extract-decision", "extract_decision")}
    ${knowledgeForm(entry, "Prompt", "save-prompt", "save_prompt")}
    ${knowledgeForm(entry, "Reference", "save-reference", "save_reference")}
  </div>`;
}

function knowledgeForm(entry, label, action, suggestionAction) {
  const suggestion = firstSuggestion(entry, suggestionAction) || {};
  const title = suggestion.title || entry.title || "";
  return `<form class="panel-lite filing-form" data-entry-id="${entry.id}">
    <h3>${label}</h3>
    <label>Title<input name="title" value="${escapeHtml(title)}"></label>
    <label>Slug<input name="slug" value="${escapeHtml(suggestion.slug || slugify(title))}"></label>
    <label>Summary<textarea name="summary" rows="3">${escapeHtml(suggestion.summary || "")}</textarea></label>
    ${button(`${label} Operation`, `file-${action}`, "submit")}
  </form>`;
}

function projects() {
  const selectedSlug = state.selectedProject ? projectSlugFromProjectFile(state.selectedProject) : "";
  const projectArtifacts = selectedSlug ? state.artifacts.filter((artifact) => artifact.project === selectedSlug) : [];
  return `<div class="grid two">
    <div class="panel"><h2>Projects</h2>${newProjectForm()}<select id="project-file" size="12">${state.projectFiles.map((file) => `<option ${state.selectedProject === file ? "selected" : ""}>${file}</option>`).join("")}</select><div class="actions">${button("Open Project", "load-project")}${button("Generate Agent Context", "project-context", "button", !state.selectedProject)}</div></div>
    <div class="panel"><h2>Project Detail</h2>${state.selectedProject ? projectDetail(projectArtifacts) : "<p>Select or create a project. Projects do not require artifacts.</p>"}</div>
  </div>`;
}

function newProjectForm() {
  return `<details class="subform"><summary>Create Project</summary><form id="new-project-form" class="form">
    <div class="split"><label>Title<input name="title"></label><label>Slug<input name="slug"></label></div>
    <label>Purpose<textarea name="summary" rows="3"></textarea></label>
    ${button("Queue Project Creation", "create-blank-project", "submit")}
  </form></details>`;
}

function projectDetail(artifacts) {
  const registryPath = artifactRegistryPath(state.settings, projectSlugFromProjectFile(state.selectedProject));
  return `<textarea id="project-content" rows="18">${escapeHtml(state.selectedProjectContent)}</textarea>
    <div class="actions">${button("Save Project Edit", "save-project")}${button("Append Note", "append-session")}</div>
    <h2>Artifacts</h2>
    ${artifacts.length ? artifactTable(artifacts) : `<p>No artifacts for this project. A registry is optional.</p><div class="actions">${button("Create Artifact Registry", "create-registry")}</div><p><code>${escapeHtml(registryPath)}</code></p>`}`;
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
    <h2>Optional Artifact Path Templates</h2><div class="grid two">${artifactPaths}</div>
    <div class="actions">${button("Save Settings", "save-settings", "submit")}${button("Fetch OpenRouter Models", "fetch-models", "button")}${button("Connect Wiki Folder", "connect", "button")}</div>
  </form>`;
}

function advanced() {
  return `<div class="grid two">
    <div class="panel"><h2>Pending Operations</h2>${operationList()}</div>
    <div class="panel"><h2>Distillation</h2>${distillationPanel()}</div>
  </div>
  <div class="grid two">
    <div class="panel"><h2>Artifact Registries</h2>${advancedArtifacts()}</div>
    <div class="panel"><h2>Debug / Raw LLM Responses</h2><pre>${escapeHtml(state.debug)}</pre>${button("Export Backup JSON", "backup")}</div>
  </div>`;
}

function distillationPanel() {
  return `<label>Project<select id="distill-project"><option value="">Choose project</option>${state.projectFiles.map(option).join("")}</select></label>
    <label>Artifact<select id="distill-artifact"><option value="">Parent project summary</option>${state.artifacts.map((artifact) => `<option value="${artifactKey(artifact)}">${escapeHtml(artifact.project)} / ${escapeHtml(artifact.title || artifact.slug)}</option>`).join("")}</select></label>
    <label>Related patterns<select id="distill-patterns" multiple size="8">${state.patternFiles.map(option).join("")}</select></label>
    <div class="actions">${button("Generate Distillation Proposal", "run-distill")}</div>`;
}

function advancedArtifacts() {
  return state.artifacts.length ? artifactTable(state.artifacts) : "<p>No artifact registries found. That is fine; projects still work.</p>";
}

function bindGlobal() {
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { state.tab = el.dataset.tab; render(); }));
  document.querySelectorAll("[data-action]:not([type='submit'])").forEach((el) => el.addEventListener("click", actions));
  document.querySelector("#capture-form")?.addEventListener("submit", actions);
  document.querySelector("#settings-form")?.addEventListener("submit", actions);
  document.querySelector("#new-project-form")?.addEventListener("submit", actions);
  document.querySelectorAll(".filing-form").forEach((form) => form.addEventListener("submit", actions));
  ["#search", "#filter-type", "#filter-status"].forEach((selector) => document.querySelector(selector)?.addEventListener("change", updateFilters));
}

async function actions(event) {
  const action = event.submitter?.dataset.action || event.currentTarget?.dataset.action || event.target?.dataset.action;
  const form = event.target.closest?.("form") || event.currentTarget;
  if (action) event.preventDefault();
  try {
    if (action === "go-inbox") state.tab = "Inbox";
    if (action === "go-projects") state.tab = "Projects";
    if (action === "new-capture") { state.tab = "Inbox"; state.captureOpen = true; }
    if (action === "cancel-capture") state.captureOpen = false;
    if (action === "connect") await connect();
    if (action === "save-capture") await saveCapture(false);
    if (action === "save-capture-wiki") await saveCapture(true);
    if (action?.startsWith("review:")) { state.reviewId = action.split(":")[1]; state.tab = "Inbox"; }
    if (action?.startsWith("triage:")) await runTriage(action.split(":")[1]);
    if (action?.startsWith("archive-entry:")) await archiveEntry(action.split(":")[1]);
    if (action === "file-create-project") await queueCreateProject(form);
    if (action === "file-append-project") await queueAppendProject(form);
    if (action === "file-create-artifact") await queueCreateArtifact(form);
    if (action === "file-extract-pattern") await queueKnowledge(form, extractPatternFromCapture, state.settings.wikiPaths.patterns);
    if (action === "file-extract-decision") await queueKnowledge(form, extractDecisionFromCapture, state.settings.wikiPaths.decisions);
    if (action === "file-save-prompt") await queueKnowledge(form, savePromptFromCapture, state.settings.wikiPaths.prompts);
    if (action === "file-save-reference") await queueKnowledge(form, saveReferenceFromCapture, state.settings.wikiPaths.references);
    if (action === "create-blank-project") await queueBlankProject();
    if (action === "load-project") await loadProject();
    if (action === "project-context") await projectContext();
    if (action === "save-project") await saveProject();
    if (action === "append-session") await appendSessionNote();
    if (action === "create-registry") await createRegistry();
    if (action === "generate-context") await generateContext(false);
    if (action === "codex-context") await generateContext(true);
    if (action === "copy-context") await navigator.clipboard.writeText(document.querySelector("#context-output").value || state.contextOutput);
    if (action === "export-context") await exportTextFile("agent-context.md", document.querySelector("#context-output").value || state.contextOutput);
    if (action === "save-settings") await saveSettingsForm();
    if (action === "fetch-models") await loadModels();
    if (action === "run-distill") await runDistill();
    if (action === "backup") await exportBackup();
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

async function saveCapture(saveWiki) {
  const form = new FormData(document.querySelector("#capture-form"));
  const raw = Object.fromEntries(form.entries());
  raw.tags = String(raw.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  raw.status = "captured";
  const entry = normalizeArtifactEntry(raw);
  const saved = await addEntry(entry);
  if (saveWiki) {
    if (!state.wikiHandle) throw new Error("Connect wiki folder before saving to wiki inbox.");
    await saveEntryToWikiInbox(state.wikiHandle, state.settings, saved);
  }
  state.reviewId = saved.id;
  state.captureOpen = false;
  state.notice = "Capture saved to inbox.";
}

async function runTriage(id) {
  const target = state.entries.find((entry) => entry.id === id);
  if (!target) throw new Error("No inbox item selected for triage.");
  state.debug = "Triage request running...";
  render();
  const result = await triageEntry(target, state.settings);
  state.debug = result.raw;
  await updateEntry({ ...target, status: "triaged", triage: result.parsed });
  state.reviewId = target.id;
  state.notice = "Triage suggestions added. Choose a filing action manually.";
}

async function archiveEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) throw new Error("Entry was not found.");
  await updateEntry({ ...entry, status: "archived" });
  if (state.reviewId === id) state.reviewId = "";
  state.notice = "Capture archived locally.";
}

async function queueCreateProject(form) {
  const entry = entryForForm(form);
  const data = Object.fromEntries(new FormData(form).entries());
  await queueOperations(entry, createProjectFromCapture(entry, { ...data, projectsPath: state.settings.wikiPaths.projects }));
}

async function queueAppendProject(form) {
  const entry = entryForForm(form);
  const data = Object.fromEntries(new FormData(form).entries());
  await queueOperations(entry, appendCaptureToProject(entry, data.projectFile));
}

async function queueCreateArtifact(form) {
  const entry = entryForForm(form);
  const data = Object.fromEntries(new FormData(form).entries());
  await queueOperations(entry, createArtifactFromCapture(entry, state.settings, { ...data, updateRegistry: data.updateRegistry === "yes" }));
}

async function queueKnowledge(form, factory, path) {
  const entry = entryForForm(form);
  const data = { ...Object.fromEntries(new FormData(form).entries()), path };
  await queueOperations(entry, factory(entry, data));
}

async function queueOperations(entry, operations) {
  for (const operation of operations) await addOperation(operation);
  await updateEntry({ ...entry, status: "reviewed" });
  state.reviewId = "";
  state.notice = "Pending operation queued for review in Advanced.";
}

async function queueBlankProject() {
  const data = Object.fromEntries(new FormData(document.querySelector("#new-project-form")).entries());
  const fakeCapture = { title: data.title, body: data.summary, type: "Project Idea", status: "reviewed", createdAt: new Date().toISOString() };
  for (const op of createProjectFromCapture(fakeCapture, { ...data, projectsPath: state.settings.wikiPaths.projects })) await addOperation(op);
  state.notice = "Project creation operation queued for review.";
}

async function loadProject() {
  state.selectedProject = document.querySelector("#project-file").value || state.selectedProject;
  state.selectedProjectContent = state.selectedProject ? await readFile(state.wikiHandle, state.selectedProject) : "";
}

async function projectContext() {
  if (!state.selectedProject) throw new Error("Select a project first.");
  state.tab = "Agent Context";
  state.contextOutput = await buildAgentContext(state.wikiHandle, state.settings, {
    task: "",
    targetMode: "project",
    project: state.selectedProject,
    patterns: [],
    includeUserPreferences: true,
    includeAgentIndex: true,
    includeActiveProjects: true,
    includeHarness: true
  });
}

async function saveProject() {
  if (!state.selectedProject) throw new Error("Select a project first.");
  await writeFile(state.wikiHandle, state.selectedProject, document.querySelector("#project-content").value);
  state.notice = "Project file saved.";
}

async function appendSessionNote() {
  if (!state.selectedProject) throw new Error("Select a project first.");
  const note = prompt("Note to append:");
  if (!note) return;
  await writeFile(state.wikiHandle, state.selectedProject, `${document.querySelector("#project-content").value.trimEnd()}\n\n## Session Notes\n\n### ${new Date().toISOString().slice(0, 10)}\n${note}\n`);
}

async function createRegistry() {
  const slug = projectSlugFromProjectFile(state.selectedProject);
  if (!slug) throw new Error("Select a project first.");
  await addOperation({
    type: "create_file",
    file: artifactRegistryPath(state.settings, slug),
    template: "artifact_registry",
    content: emptyRegistry(titleFromSlug(slug)),
    source: "advanced",
    rationale: "Create optional artifact registry for parent project."
  });
  state.notice = "Optional registry creation operation queued.";
}

async function runDistill() {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before distillation.");
  const project = document.querySelector("#distill-project").value;
  const artifact = state.artifacts.find((item) => artifactKey(item) === document.querySelector("#distill-artifact")?.value);
  const patterns = selectedOptions("#distill-patterns");
  state.debug = "Distillation request running...";
  render();
  let context = project ? `# ${project}\n${await readFile(state.wikiHandle, project)}\n\n` : "";
  if (artifact) context += `# Artifact ${artifact.project}/${artifact.slug}\n${await readFile(state.wikiHandle, artifact.path || artifactPathForStatus(artifact)).catch((error) => `Unavailable: ${error.message}`)}\n\n`;
  for (const file of patterns) context += `# ${file}\n${await readFile(state.wikiHandle, file)}\n\n`;
  const result = await distillContext(context, state.settings, artifact ? { type: "artifact", artifact } : { type: "project", project });
  state.debug = result.raw;
  for (const operation of result.parsed.operations) await addOperation({ ...operation, source: "distillation", rationale: result.parsed.rationale, summary: result.parsed.summary });
  state.notice = "Distillation operations queued for review.";
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
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  await setOperation(id, "approved");
  const approved = { ...op, status: "approved", content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content };
  const message = await applyOperation(state.wikiHandle, approved);
  await updateOperation(approved, "applied", { message });
  state.notice = `Operation approved and applied: ${message}.`;
}

async function previewOp(id) {
  if (!state.wikiHandle) throw new Error("Connect wiki folder before previewing operations.");
  const op = state.operations.find((item) => item.id === id);
  if (!op) throw new Error("Operation was not found.");
  state.previews[id] = await previewOperation(state.wikiHandle, { ...op, content: document.querySelector(`[data-op-content="${id}"]`)?.value || op.content });
  state.notice = "Preview generated from the current file and proposed operation.";
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
  state.notice = `Loaded ${state.models.length} models.`;
}

async function exportBackup() {
  await exportTextFile("brain-tools-backup.json", JSON.stringify({ settings: { ...state.settings, openRouterApiKey: "" }, entries: state.entries, operations: state.operations }, null, 2), "application/json");
}

function inboxEntries() {
  return state.entries.filter((entry) => !["archived", "filed", "reviewed"].includes(entry.status));
}

function filteredInboxEntries() {
  const search = state.filters.search.toLowerCase();
  return inboxEntries().filter((entry) => (!search || JSON.stringify(entry).toLowerCase().includes(search)) && (!state.filters.type || entry.type === state.filters.type) && (!state.filters.status || entry.status === state.filters.status));
}

function selectedReviewEntry() {
  return state.entries.find((entry) => entry.id === state.reviewId);
}

function updateFilters() {
  state.filters = {
    search: document.querySelector("#search")?.value || "",
    type: document.querySelector("#filter-type")?.value || "",
    status: document.querySelector("#filter-status")?.value || ""
  };
  render();
}

function firstSuggestion(entry, action) {
  return (entry.triage?.suggestions || []).find((suggestion) => suggestion.action === action);
}

function entryForForm(form) {
  const id = form.dataset.entryId;
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) throw new Error("Inbox item was not found.");
  return entry;
}

function operationList() {
  const active = state.operations.filter((op) => op.status === "pending" || op.status === "approved");
  const history = state.operations.filter((op) => op.status !== "pending" && op.status !== "approved");
  const activeMarkup = active.length ? active.map(operationCard).join("") : "<p>No pending operations.</p>";
  const historyMarkup = history.length ? `<details class="operation-history"><summary>Operation History (${history.length})</summary>${history.map(operationCard).join("")}</details>` : "";
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

function operationContentValue(op) {
  if (op.type === "update_artifact_registry") return artifactRegistryRow(op.artifact || {});
  if (op.type === "copy_file") return `Copy from: ${op.from}\nCopy to: ${op.file}`;
  return op.content || "";
}

function operationMeta(op) {
  if (op.type === "update_artifact_registry" && op.artifact) return `<p><strong>Registry row:</strong> ${escapeHtml(op.artifact.project || operationProjectSlug(op.project))} / ${escapeHtml(op.artifact.slug || "")} -> ${escapeHtml(op.artifact.status || "")}</p>`;
  if (op.type === "copy_file") return `<p><strong>Copy source:</strong> <code>${escapeHtml(op.from || "")}</code></p>`;
  return "";
}

function operationProjectSlug(project) {
  if (!project) return "";
  if (typeof project === "string") return project;
  return project.slug || project.title || "";
}

async function loadArtifactRegistries() {
  const artifacts = [];
  for (const file of state.projectFiles) {
    const slug = projectSlugFromProjectFile(file);
    if (!slug) continue;
    try {
      const registry = await readFile(state.wikiHandle, artifactRegistryPath(state.settings, slug));
      artifacts.push(...parseArtifactRegistry(registry).map((artifact) => ({ ...artifact, project: slug, path: artifactPathForStatus({ ...artifact, project: slug }) })));
    } catch {
      // Missing registries are normal. Projects do not require artifacts.
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

function artifactPathForStatus(artifact) {
  if (artifact.status === "archived") return fillArtifactPath(state.settings.childArtifactConventions.archive, artifact.project, artifact.slug);
  if (artifact.status === "seed" || artifact.type === "idea") return fillArtifactPath(state.settings.childArtifactConventions.ideas, artifact.project, artifact.slug);
  return fillArtifactPath(state.settings.childArtifactConventions.pages, artifact.project, artifact.slug);
}

function artifactTable(artifacts) {
  if (!artifacts.length) return "<p>No artifact registry yet. Create one only if this project needs child pages/tools/assets.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Type</th><th>File</th><th>URL</th><th>Notes</th></tr></thead><tbody>${artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.title)}</td><td><code>${escapeHtml(artifact.slug)}</code></td><td>${statusBadge(artifact.status)}</td><td>${escapeHtml(artifact.type)}</td><td><code>${escapeHtml(artifact.file)}</code></td><td>${artifact.url ? `<a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${escapeHtml(artifact.url)}</a>` : ""}</td><td>${escapeHtml(artifact.notes || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function recentActivity() {
  const items = state.operations.slice(0, 5);
  if (!items.length) return "<p>No recent operations.</p>";
  return items.map((op) => `<p>${statusBadge(op.status)} ${escapeHtml(op.type)} <code>${escapeHtml(op.file)}</code></p>`).join("");
}

function selectedOptions(selector) {
  return Array.from(document.querySelector(selector)?.selectedOptions || []).map((option) => option.value);
}

function stat(label, value) {
  return `<div class="panel stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function badge(text, tone = "") {
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

function statusBadge(status) {
  const tone = { approved: "good", applied: "good", rejected: "bad", pending: "warn", captured: "warn", triaged: "good", reviewed: "good", archived: "bad" }[status] || "";
  return badge(status || "pending", tone);
}

function button(label, action, type = "button", disabled = false) {
  return `<button type="${type}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function option(value) {
  return `<option>${escapeHtml(value)}</option>`;
}
