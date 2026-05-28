import { artifactRegistryPath, artifactRegistryRow, artifactTemplate, fillArtifactPath, projectSlug, titleFromSlug } from "./artifacts.js";
import { entryToMarkdown, slugify } from "./markdown.js";

export function projectTemplateFromCapture(capture, options = {}) {
  const title = options.title || capture.projectTitle || capture.title || "Untitled Project";
  const slug = options.slug || slugify(title);
  const date = new Date().toISOString().slice(0, 10);
  const purpose = options.purpose || options.summary || capture.body || "";
  return {
    file: `${options.projectsPath || "projects"}/${slug}.md`,
    content: `# Project: ${title}

## Status
${options.status || "active"}

## Purpose
${purpose}

## Source Capture
Created from inbox item: ${capture.title || "Untitled"}

## Current Shape
${options.summary || ""}

## Key Requirements
- 

## Decisions
- 

## Related Patterns
- 

## Session Notes
### ${date}
${entryToMarkdown(capture)}

## Next Actions
- [ ] 
`
  };
}

export function createProjectFromCapture(capture, options = {}) {
  const project = projectTemplateFromCapture(capture, options);
  return [{
    type: "create_file",
    file: project.file,
    template: "project",
    content: project.content,
    source: "filing",
    rationale: "Create a standalone project from an inbox capture."
  }];
}

export function appendCaptureToProject(capture, projectFile) {
  return [{
    type: "append_section",
    file: projectFile,
    section: "Inbox Notes",
    content: `### ${new Date().toISOString().slice(0, 10)} - ${capture.title || "Untitled"}\n\n${entryToMarkdown(capture)}`,
    source: "filing",
    rationale: "Append reviewed inbox capture to an existing project."
  }];
}

export function createArtifactFromCapture(capture, settings, options = {}) {
  const project = projectSlug(options.projectSlug || capture.projectSlug || capture.project || "");
  const artifact = slugify(options.artifactSlug || capture.artifactSlug || capture.artifactTitle || capture.title);
  const status = options.artifactStatus || capture.artifactStatus || "seed";
  const type = options.artifactType || capture.artifactType || "page";
  const templateName = status === "seed" || type === "idea" ? "artifact_idea" : "artifact_page";
  const pathTemplate = templateName === "artifact_idea" ? settings.childArtifactConventions.ideas : settings.childArtifactConventions.pages;
  const file = fillArtifactPath(pathTemplate, project, artifact);
  const artifactData = {
    project,
    parentProjectTitle: options.projectTitle || capture.projectTitle || titleFromSlug(project),
    artifactSlug: artifact,
    artifactTitle: options.artifactTitle || capture.artifactTitle || capture.title,
    artifactStatus: status,
    artifactFile: options.artifactFile || capture.artifactFile || "",
    artifactUrl: options.artifactUrl || capture.artifactUrl || "",
    purpose: options.summary || capture.body || "",
    concept: options.summary || capture.body || "",
    notes: entryToMarkdown(capture)
  };
  const operations = [{
    type: "create_file",
    file,
    template: templateName,
    content: artifactTemplate(templateName, artifactData),
    source: "filing",
    rationale: "Create an optional child artifact under a parent project."
  }];
  if (options.updateRegistry) {
    operations.push({
      type: "update_artifact_registry",
      file: artifactRegistryPath(settings, project),
      project,
      projectTitle: artifactData.parentProjectTitle,
      artifact: {
        project,
        slug: artifact,
        title: artifactData.artifactTitle,
        type,
        status,
        file: artifactData.artifactFile,
        url: artifactData.artifactUrl,
        notes: options.summary || ""
      },
      content: artifactRegistryRow({ slug: artifact, title: artifactData.artifactTitle, type, status, file: artifactData.artifactFile, url: artifactData.artifactUrl, notes: options.summary || "" }),
      source: "filing",
      rationale: "Optionally update artifact registry."
    });
  }
  return operations;
}

export function extractPatternFromCapture(capture, options = {}) {
  return createKnowledgeFile(capture, options, "patterns", "pattern", "Pattern");
}

export function extractDecisionFromCapture(capture, options = {}) {
  const date = new Date().toISOString().slice(0, 10);
  return createKnowledgeFile(capture, options, "decisions", "decision", `${date} Decision`);
}

export function savePromptFromCapture(capture, options = {}) {
  return createKnowledgeFile(capture, options, "prompts", "prompt", "Prompt");
}

export function saveReferenceFromCapture(capture, options = {}) {
  return createKnowledgeFile(capture, options, "references", "reference", "Reference");
}

function createKnowledgeFile(capture, options, defaultDir, kind, label) {
  const title = options.title || capture.title || label;
  const slug = options.slug || slugify(title);
  const dir = options.path || defaultDir;
  return [{
    type: "create_file",
    file: `${dir}/${slug}.md`,
    template: kind,
    content: `# ${title}\n\n## Summary\n${options.summary || ""}\n\n## Source Capture\n${entryToMarkdown(capture)}\n`,
    source: "filing",
    rationale: `File reviewed inbox capture as ${kind}.`
  }];
}
