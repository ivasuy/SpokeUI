import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectInfo, StoredProject } from './shared';

function isStoredProject(value: unknown): value is StoredProject {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.root === 'string'
    && typeof item.name === 'string'
    && typeof item.suggestedUrl === 'string'
    && typeof item.addedAt === 'number'
    && typeof item.lastOpenedAt === 'number';
}

export class ProjectStore {
  private projects: StoredProject[] | null = null;

  private get filePath() {
    return path.join(app.getPath('userData'), 'projects.json');
  }

  private async load() {
    if (this.projects) return this.projects;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      this.projects = Array.isArray(parsed) ? parsed.filter(isStoredProject) : [];
    } catch {
      try {
        const legacyPath = path.join(path.dirname(path.dirname(this.filePath)), 'ViSpoke', 'projects.json');
        const parsed = JSON.parse(await readFile(legacyPath, 'utf8')) as unknown;
        this.projects = Array.isArray(parsed) ? parsed.filter(isStoredProject) : [];
        if (this.projects.length) await this.save();
      } catch {
        this.projects = [];
      }
    }
    return this.projects;
  }

  private async save() {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(this.projects, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }

  async list() {
    return [...await this.load()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }

  async remember(project: ProjectInfo) {
    const projects = await this.load();
    const now = Date.now();
    const existing = projects.find((item) => item.root === project.root);
    if (existing) {
      const displayName = existing.name;
      Object.assign(existing, project, { lastOpenedAt: now });
      existing.name = displayName;
      await this.save();
      return existing;
    }
    const stored: StoredProject = { ...project, id: randomUUID(), addedAt: now, lastOpenedAt: now };
    projects.push(stored);
    await this.save();
    return stored;
  }

  async rename(id: string, name: string) {
    const projects = await this.load();
    const project = projects.find((item) => item.id === id);
    const cleanName = name.trim();
    if (!project) throw new Error('This project is no longer in your library.');
    if (!cleanName) throw new Error('Enter a project name.');
    project.name = cleanName;
    await this.save();
    return project;
  }

  async remove(id: string) {
    const projects = await this.load();
    this.projects = projects.filter((item) => item.id !== id);
    await this.save();
  }
}
