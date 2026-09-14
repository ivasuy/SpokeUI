import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentChange, ChangedFile } from './shared';

type FileState = { content: Buffer; mode: number };
export type ProjectSnapshot = Map<string, FileState>;

const ignoredDirectories = new Set([
  '.git', '.next', '.nuxt', '.output', '.turbo', '.vite', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target',
]);
const ignoredFiles = new Set(['.DS_Store']);
const maxFileSize = 2 * 1024 * 1024;

function looksBinary(content: Buffer) {
  const length = Math.min(content.length, 8_000);
  for (let index = 0; index < length; index += 1) if (content[index] === 0) return true;
  return false;
}

export async function snapshotProject(root: string): Promise<ProjectSnapshot> {
  const snapshot: ProjectSnapshot = new Map();
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (entry.isSymbolicLink() || ignoredFiles.has(entry.name)) return;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolute);
        return;
      }
      if (!entry.isFile()) return;
      const info = await stat(absolute);
      if (info.size > maxFileSize) return;
      const content = await readFile(absolute);
      if (!looksBinary(content)) snapshot.set(path.relative(root, absolute), { content, mode: info.mode });
    }));
  }
  await visit(root);
  return snapshot;
}

function changedLines(beforeText: string, afterText: string) {
  const before = beforeText.split('\n');
  const after = afterText.split('\n');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  return {
    additions: Math.max(0, after.length - prefix - suffix),
    deletions: Math.max(0, before.length - prefix - suffix),
  };
}

export function diffSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): ChangedFile[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changes: ChangedFile[] = [];
  for (const filePath of [...paths].sort()) {
    const oldFile = before.get(filePath);
    const newFile = after.get(filePath);
    if (oldFile?.content.equals(newFile?.content ?? Buffer.alloc(0)) && newFile) continue;
    if (!oldFile && newFile) {
      changes.push({ path: filePath, status: 'added', additions: newFile.content.toString('utf8').split('\n').length, deletions: 0 });
    } else if (oldFile && !newFile) {
      changes.push({ path: filePath, status: 'deleted', additions: 0, deletions: oldFile.content.toString('utf8').split('\n').length });
    } else if (oldFile && newFile) {
      changes.push({ path: filePath, status: 'modified', ...changedLines(oldFile.content.toString('utf8'), newFile.content.toString('utf8')) });
    }
  }
  return changes;
}

export interface StoredChange {
  record: AgentChange;
  before: ProjectSnapshot;
  after?: ProjectSnapshot;
}

export async function restoreChange(change: StoredChange) {
  if (!change.after) throw new Error('The change has not finished yet.');
  for (const file of change.record.files) {
    const absolute = path.join(change.record.projectRoot, file.path);
    const expected = change.after.get(file.path);
    try {
      const current = await readFile(absolute);
      if (!expected || !current.equals(expected.content)) {
        throw new Error(`${file.path} changed after the agent finished. Review that file before rejecting this change.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !expected) continue;
      throw error;
    }
  }
  for (const file of change.record.files) {
    const absolute = path.join(change.record.projectRoot, file.path);
    const previous = change.before.get(file.path);
    if (!previous) {
      await rm(absolute, { force: true });
      continue;
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, previous.content);
    await chmod(absolute, previous.mode);
  }
}
