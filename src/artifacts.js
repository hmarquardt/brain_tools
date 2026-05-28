import { slugify } from "./markdown.js";

export const artifactStatuses = ["seed", "specced", "building", "live", "iterating", "parked", "archived", "promoted"];
export const artifactTypes = ["page", "tool", "mini-app", "feature", "asset", "prompt", "reference", "other"];

export function artifactSlug(value) {
  return slugify(value);
}

export function projectSlug(value) {
  return slugify(value);
}

export function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function fillArtifactPath(template, project, artifact) {
  return String(template || "")
    .replaceAll("{project}", projectSlug(project))
    .replaceAll("{artifact}", artifactSlug(artifact));
}

export function artifactNotePath(settings, entry) {
  const project = entry.project || entry.projectSlug;
  const artifact = entry.artifactSlug || entry.artifactTitle || entry.artifactFile;
  if (!project || !artifact) return "";
  const status = entry.artifactStatus || "seed";
  const type = entry.artifactType || "page";
  if (status === "archived") return fillArtifactPath(settings.childArtifactConventions.archive, project, artifact);
  if (status === "seed" || type === "idea") return fillArtifactPath(settings.childArtifactConventions.ideas, project, artifact);
  return fillArtifactPath(settings.childArtifactConventions.pages, project, artifact);
}

export function artifactDistilledPath(settings, entry) {
  const project = entry.project || entry.projectSlug;
  const artifact = entry.artifactSlug || entry.artifactTitle || entry.artifactFile;
  return project && artifact ? fillArtifactPath(settings.childArtifactConventions.distilled, project, artifact) : "";
}

export function artifactRegistryPath(settings, project) {
  return fillArtifactPath(settings.childArtifactConventions.registry, project, "registry");
}

export function normalizeArtifactEntry(entry) {
  const artifact = entry.artifactSlug || entry.artifactTitle || entry.artifactFile;
  return {
    ...entry,
    project: entry.project ? projectSlug(entry.project) : "",
    artifactSlug: artifact ? artifactSlug(artifact) : "",
    artifactTitle: entry.artifactTitle || titleFromSlug(artifactSlug(artifact)),
    artifactType: entry.artifactType || "page",
    artifactStatus: entry.artifactStatus || "seed"
  };
}

export function artifactTemplate(name, data = {}) {
  const values = {
    parentProjectTitle: data.parentProjectTitle || titleFromSlug(data.project),
    artifactTitle: data.artifactTitle || titleFromSlug(data.artifactSlug),
    artifactSlug: data.artifactSlug || "artifact",
    artifactStatus: data.artifactStatus || "seed",
    artifactFile: data.artifactFile || "",
    artifactUrl: data.artifactUrl || "",
    purpose: data.purpose || "",
    userValue: data.userValue || "",
    features: data.features || "- ",
    decisions: data.decisions || "- ",
    patterns: data.patterns || "- ",
    sessionNotes: data.sessionNotes || "- ",
    nextActions: data.nextActions || "- ",
    concept: data.concept || "",
    value: data.value || "",
    notes: data.notes || ""
  };
  const templates = {
    project: `# ${values.parentProjectTitle}\n\n## Purpose\n\n## Active Artifacts\n\n## Decisions\n\n## Session Notes\n`,
    artifact_page: `# ${values.parentProjectTitle} Page: ${values.artifactTitle}

## Status
${values.artifactStatus}

## Parent Project
[${values.parentProjectTitle}](../../${projectSlug(values.parentProjectTitle)}.md)

## Slug
\`${values.artifactSlug}\`

## File
\`${values.artifactFile}\`

## URL
${values.artifactUrl}

## Purpose
${values.purpose}

## User Value
${values.userValue}

## Stack
- Single-file HTML/CSS/JS
- GitHub Pages
- localStorage / IndexedDB as needed
- OpenRouter if AI-enabled

## Core Features
${values.features}

## Decisions
${values.decisions}

## Related Patterns
${values.patterns}

## Session Notes
${values.sessionNotes}

## Next Actions
${values.nextActions}

## Related
- Parent: projects/${projectSlug(values.parentProjectTitle)}.md
- Registry: projects/${projectSlug(values.parentProjectTitle)}/artifacts.md
`,
    artifact_idea: `# ${values.parentProjectTitle} Idea: ${values.artifactTitle}

## Status
seed

## Parent Project
[${values.parentProjectTitle}](../../${projectSlug(values.parentProjectTitle)}.md)

## Slug
\`${values.artifactSlug}\`

## Concept
${values.concept}

## Why It Might Be Useful
${values.value}

## Possible Features
${values.features}

## Related Patterns
${values.patterns}

## Promotion Criteria
- [ ] Clear enough to spec
- [ ] Has a likely filename
- [ ] Has user value
- [ ] Worth building as a page

## Notes
${values.notes}
`,
    artifact_archive: `# Archived Artifact: ${values.artifactTitle}\n\n## Status\narchived\n\n## Notes\n${values.notes}\n`,
    pattern: `# ${data.title || "Pattern"}\n\n## Problem\n\n## Approach\n\n## Use Cases\n`,
    decision: `# ${new Date().toISOString().slice(0, 10)}: ${data.title || "Decision"}\n\n## Decision\n\n## Rationale\n\n## Consequences\n`,
    prompt: `# ${data.title || "Prompt"}\n\n## Purpose\n\n## Prompt\n`,
    session_closeout: `## Session ${new Date().toISOString()}\n\n### Completed\n\n### Decisions\n\n### Next Actions\n`,
    distilled_project_summary: `# ${values.parentProjectTitle}\n\n## What It Is\n\n## Current Status\n\n## Stable Requirements\n\n## Key Decisions\n\n## Agent Notes\n`,
    distilled_artifact_summary: `# ${values.artifactTitle}

Parent project: ${values.parentProjectTitle}

## What It Is
Concise description.

## Current Status
${values.artifactStatus}

## Stable Requirements
- ...

## Key Decisions
- ...

## Implementation Notes
- ...

## Related Patterns
- ...

## Agent Notes
Important context future agents should know.
`
  };
  return templates[name] || "";
}

export function emptyRegistry(projectTitle) {
  return `# ${projectTitle} Artifacts

| Slug | Title | Type | Status | File | URL | Notes |
|---|---|---|---|---|---|---|
`;
}

export function parseArtifactRegistry(markdown) {
  return String(markdown || "")
    .split("\n")
    .filter((line) => /^\|.+\|$/.test(line) && !/^\|\s*-+/.test(line) && !/^\|\s*Slug\s*\|/i.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 7)
    .map(([slug, title, type, status, file, url, notes]) => ({ slug, title, type, status, file, url, notes }));
}

export function artifactRegistryRow(artifact) {
  const cells = [
    artifact.slug || artifact.artifactSlug,
    artifact.title || artifact.artifactTitle,
    artifact.type || artifact.artifactType,
    artifact.status || artifact.artifactStatus,
    artifact.file || artifact.artifactFile || "",
    artifact.url || artifact.artifactUrl || "",
    artifact.notes || ""
  ].map((cell) => String(cell || "").replaceAll("|", "\\|"));
  return `| ${cells.join(" | ")} |`;
}

export function upsertArtifactRegistry(markdown, artifact, projectTitle) {
  const source = String(markdown || "").trim() || emptyRegistry(projectTitle);
  const row = artifactRegistryRow(artifact);
  const slug = artifact.slug || artifact.artifactSlug;
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`| ${slug} |`));
  if (index >= 0) lines[index] = row;
  else lines.push(row);
  return lines.join("\n").trimEnd() + "\n";
}

export function parseMarkdownSections(markdown) {
  const sections = {};
  let current = "";
  let buffer = [];

  for (const line of String(markdown || "").split("\n")) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (current) sections[current] = buffer.join("\n").trim();
      current = match[1].trim();
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join("\n").trim();
  return sections;
}
