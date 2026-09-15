import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { AgentRuntime, RuntimeEvent, RuntimeInfo, RuntimeRequest } from './shared';

const execFileAsync = promisify(execFile);

async function detect(id: AgentRuntime, command: string, name: string): Promise<RuntimeInfo> {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5_000 });
    return { id, available: true, name, version: stdout.trim() };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return { id, available: false, name, error: missing ? `${name} is not installed or is not available in PATH.` : `${name} could not be started.` };
  }
}

export async function detectRuntimes(): Promise<RuntimeInfo[]> {
  return Promise.all([detect('codex', 'codex', 'Codex'), detect('claude', 'claude', 'Claude Code')]);
}

export function createPrompt(request: RuntimeRequest) {
  const targets = request.targets ?? (request.target ? [request.target] : []);
  const target = targets.length ? JSON.stringify(targets, null, 2) : 'No element is selected. Treat this as a page-level or project-level request.';
  const evidence = request.debugContext
    ? `\nRecent browser console evidence:\n${JSON.stringify(request.debugContext.console, null, 2)}\n\nRecent network evidence:\n${JSON.stringify(request.debugContext.network, null, 2)}`
    : '';
  const intent = request.debugAction
    ? `This request came from the visual debugging action "${request.debugAction}". Answer the question directly. Edit source files only when the action and requested outcome require a fix.`
    : 'Implement the requested outcome in the real source files.';
  return `You are working in the frontend project at ${request.projectRoot} from a visual UI workspace.

${intent} Follow repository instructions and the existing design system. Preserve unrelated user changes. Inspect the codebase to resolve the rendered target; browser evidence is context and may be stale. Run appropriate focused checks. Do not mutate a temporary DOM.

Current preview: ${request.url}
Requested outcome: ${request.instruction}

Selected elements (${targets.length}):
${targets.length > 1 ? 'Apply the requested outcome to all selected elements. Resolve each target in source and account for shared components without duplicating edits.' : ''}
${target}${evidence}

Finish with a concise answer that names relevant source files and checks. If the target or scope cannot be resolved safely, explain the exact ambiguity instead of guessing.`;
}

function runCodex(request: RuntimeRequest, emit: (event: RuntimeEvent) => void) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const args = ['exec', '--json'];
    if (request.model) args.push('--model', request.model);
    if (request.reasoningEffort) args.push('--config', `model_reasoning_effort="${request.reasoningEffort}"`);
    args.push('--sandbox', 'workspace-write', '--skip-git-repo-check', '--cd', request.projectRoot, '-');
    const child = spawn('codex', args, { cwd: request.projectRoot, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    emit({ type: 'queued', text: `Request sent to Codex · ${request.model || 'configured model'} · ${request.reasoningEffort || 'configured'} reasoning` });
    child.stdin.end(createPrompt(request));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const eventType = String(event.type ?? '');
        const item = event.item as Record<string, unknown> | undefined;
        if (eventType === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') emit({ type: 'message', text: item.text });
        else if (eventType === 'turn.started') emit({ type: 'status', text: 'Reviewing the project and applying changes' });
        else if (eventType === 'turn.completed') emit({ type: 'complete', text: 'Agent finished. Capturing the live result…' });
      } catch { /* Non-JSON diagnostics are only needed when the process fails. */ }
    });
    let diagnostics = '';
    child.stderr.on('data', (chunk: Buffer) => { diagnostics = `${diagnostics}${chunk.toString()}`.slice(-8_000); });
    child.on('error', (error) => { if (!settled) { settled = true; emit({ type: 'error', text: error.message }); reject(error); } });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else {
        const message = diagnostics.trim() || `Codex stopped with exit code ${code ?? 'unknown'}.`;
        emit({ type: 'error', text: message });
        reject(new Error(message));
      }
    });
  });
}

function textFromClaudeMessage(message: Record<string, unknown>) {
  const content = message.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => String(item.text))
    .join('\n');
}

function runClaude(request: RuntimeRequest, emit: (event: RuntimeEvent) => void) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let resultSeen = false;
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    if (request.model) args.push('--model', request.model);
    if (request.reasoningEffort) args.push('--effort', request.reasoningEffort);
    const child = spawn('claude', args, { cwd: request.projectRoot, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    emit({ type: 'queued', text: `Request sent to Claude Code · ${request.model || 'configured model'} · ${request.reasoningEffort || 'configured'} reasoning` });
    child.stdin.end(createPrompt(request));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const type = String(event.type ?? '');
        if (type === 'system') emit({ type: 'status', text: 'Claude Code connected and is reviewing the project' });
        if (type === 'assistant' && event.message && typeof event.message === 'object') {
          const text = textFromClaudeMessage(event.message as Record<string, unknown>);
          if (text) emit({ type: 'message', text });
        }
        if (type === 'result') {
          resultSeen = true;
          if (typeof event.result === 'string' && event.result.trim()) emit({ type: 'message', text: event.result.trim() });
          emit({ type: 'complete', text: 'Agent finished. Capturing the live result…' });
        }
      } catch { /* Non-JSON diagnostics are only needed when the process fails. */ }
    });
    let diagnostics = '';
    child.stderr.on('data', (chunk: Buffer) => { diagnostics = `${diagnostics}${chunk.toString()}`.slice(-8_000); });
    child.on('error', (error) => { if (!settled) { settled = true; emit({ type: 'error', text: error.message }); reject(error); } });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        if (!resultSeen) emit({ type: 'complete', text: 'Agent finished. Capturing the live result…' });
        resolve();
      } else {
        const message = diagnostics.trim() || `Claude Code stopped with exit code ${code ?? 'unknown'}.`;
        emit({ type: 'error', text: message });
        reject(new Error(message));
      }
    });
  });
}

export function runRuntime(request: RuntimeRequest, emit: (event: RuntimeEvent) => void) {
  return request.runtime === 'claude' ? runClaude(request, emit) : runCodex(request, emit);
}
