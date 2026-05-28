export const SETTINGS_KEY = "brainTools.settings.v1";

export const defaultSettings = {
  appName: "Brain Tools",
  theme: "system",
  storageMode: "filesystem",
  openRouterApiKey: "",
  defaultModel: "",
  triageModel: "",
  distillModel: "",
  promptModel: "",
  temperature: 0.2,
  maxTokens: 2200,
  wikiPaths: {
    inbox: "inbox",
    projects: "projects",
    patterns: "patterns",
    decisions: "decisions",
    prompts: "prompts",
    snippets: "snippets",
    logs: "logs",
    references: "references",
    archive: "archive",
    distilledWiki: "wiki",
    agentIndex: "wiki/agent-index.md",
    userPreferences: "wiki/user-preferences.md",
    activeProjects: "wiki/active-projects.md",
    projectSummaries: "wiki/project-summaries",
    distilledPatterns: "wiki/patterns",
    distilledDecisions: "wiki/decisions"
  },
  childArtifactConventions: {
    pages: "projects/{project}/pages/{artifact}.md",
    ideas: "projects/{project}/ideas/{artifact}.md",
    archive: "projects/{project}/archive/{artifact}.md",
    distilled: "wiki/project-summaries/{project}/{artifact}.md",
    registry: "projects/{project}/artifacts.md"
  }
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return mergeSettings(parsed);
  } catch {
    return structuredClone(defaultSettings);
  }
}

export function saveSettings(settings) {
  const clean = mergeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  applyTheme(clean.theme);
  return clean;
}

export function mergeSettings(value) {
  return {
    ...defaultSettings,
    ...value,
    wikiPaths: { ...defaultSettings.wikiPaths, ...(value?.wikiPaths || {}) },
    childArtifactConventions: { ...defaultSettings.childArtifactConventions, ...(value?.childArtifactConventions || {}) }
  };
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || "system";
}
