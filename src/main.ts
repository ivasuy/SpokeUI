import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, systemPreferences, WebContentsView } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { accessSync } from 'node:fs';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { detectRuntimes, runRuntime } from './runtime-runner';
import { diffSnapshots, restoreChange, snapshotProject, type StoredChange } from './change-tracker';
import { ProjectStore } from './project-store';
import { SettingsStore } from './settings-store';
import type { AgentChange, DebugConsoleEntry, DebugNetworkEntry, ElementSnapshot, NewProjectInput, PreviewBounds, PreviewDebugAction, ProjectInfo, RuntimeEvent, RuntimeRequest } from './shared';
import { VoiceSession } from './voice-session';

if (squirrelStartup) app.quit();

function addCommonCliPaths() {
  if (process.platform === 'win32') return;
  const home = homedir();
  const candidates = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.local', 'share', 'pnpm'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.asdf', 'shims'),
    path.join(home, '.mise', 'shims'),
    path.join(home, 'Library', 'pnpm'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  process.env.PATH = [...new Set([...candidates, ...current])].join(path.delimiter);
}

addCommonCliPaths();

let mainWindow: BrowserWindow | null = null;
let previewView: WebContentsView | null = null;
let projectProcess: ChildProcess | null = null;
let previewMode: 'empty' | 'loading' | 'project' = 'empty';
const voiceSession = new VoiceSession();
const projectStore = new ProjectStore();
const settingsStore = new SettingsStore();
const changes = new Map<string, StoredChange>();
const consoleEntries: DebugConsoleEntry[] = [];
const networkEntries: DebugNetworkEntry[] = [];
const networkRequests = new Map<string, { method: string; url: string; timestamp: number }>();
let activeRuntimeRequest = false;

function loadingPreviewUrl(projectName: string) {
  const cleanName = projectName.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>Starting ${cleanName}</title><style>
    :root{color:#17191f;background:#f5f1e8;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{margin:0;min-height:100vh;display:grid;place-items:center}
    main{text-align:center}.mark{width:42px;height:42px;margin:0 auto 16px;border-radius:12px;background:#1455ff;color:white;display:grid;place-items:center;font-size:20px;box-shadow:0 8px 24px rgba(20,85,255,.18)}
    h1{margin:0;font-size:18px;letter-spacing:-.03em}p{margin:8px 0 0;color:#777971;font-size:12px}
    i{display:inline-block;width:5px;height:5px;margin:18px 3px 0;border-radius:50%;background:#1455ff;animation:pulse 1s ease-in-out infinite}i:nth-child(2){animation-delay:.15s}i:nth-child(3){animation-delay:.3s}@keyframes pulse{50%{opacity:.25;transform:translateY(-3px)}}
  </style></head><body><main><div class="mark">⌁</div><h1>Starting ${cleanName}</h1><p>Waiting for the local development server</p><div><i></i><i></i><i></i></div></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function getAssemblyAiKey() {
  const savedKey = await settingsStore.getAssemblyAiKey();
  if (savedKey) return savedKey;
  if (process.env.ASSEMBLYAI_API_KEY?.trim()) return process.env.ASSEMBLYAI_API_KEY.trim();
  const candidates = [...new Set([path.join(process.cwd(), '.env'), path.join(app.getAppPath(), '.env')])];
  for (const file of candidates) {
    try {
      const match = (await readFile(file, 'utf8')).match(/^\s*ASSEMBLYAI_API_KEY\s*=\s*(.*?)\s*$/m);
      const value = match?.[1]?.replace(/^(['"])(.*)\1$/, '$2').trim();
      if (value) return value;
    } catch { /* Try the next local configuration source. */ }
  }
  return '';
}

const emit = (channel: string, payload: unknown) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

function inspectorScript() {
  return `(() => {
    const existing = globalThis.__spokeuiInspector;
    if (existing) return;

    const host = document.createElement('div');
    host.dataset.spokeuiInspector = '';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const hoverBox = document.createElement('div');
    const selectedBox = document.createElement('div');
    const hoverLabel = document.createElement('div');
    const selectedLabel = document.createElement('div');
    for (const box of [hoverBox, selectedBox]) box.style.cssText = 'position:fixed;display:none;box-sizing:border-box;border:2px solid #1455ff;background:rgba(20,85,255,.09);border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.8) inset;transition:left 60ms linear,top 60ms linear,width 60ms linear,height 60ms linear;';
    selectedBox.style.cssText += 'border-color:#ff5a36;background:rgba(255,90,54,.08);';
    for (const label of [hoverLabel, selectedLabel]) label.style.cssText = 'position:fixed;display:none;max-width:360px;padding:5px 8px;border-radius:5px;background:#1d201c;color:#fff;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 3px 10px rgba(0,0,0,.22);';
    selectedLabel.style.background = '#e94f2d';
    const agentPanel = document.createElement('section');
    agentPanel.style.cssText = 'position:fixed;right:18px;bottom:18px;width:min(520px,calc(100vw - 36px));max-height:min(620px,calc(100vh - 36px));display:none;pointer-events:auto;overflow:auto;background:#fbfaf7;color:#20231f;border:1px solid rgba(32,35,31,.18);border-radius:14px;box-shadow:0 22px 60px rgba(20,22,20,.28);font:13px/1.45 Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    shadow.append(hoverBox, selectedBox, hoverLabel, selectedLabel, agentPanel);
    document.documentElement.appendChild(host);

    const currentMode = 'select';
    let hovered = null;
    let selected = null;
    const eventInsidePanel = (event) => {
      if (agentPanel.style.display === 'none') return false;
      const rect = agentPanel.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const nodeDetails = (node) => {
      if (!(node instanceof Element)) return { tag: '', id: null, classes: [] };
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: [...node.classList].filter((name) => name && !name.startsWith('__spokeui')).slice(0, 6),
      };
    };
    const compact = (node) => {
      const details = nodeDetails(node);
      const id = details.id ? '#' + CSS.escape(details.id) : '';
      const classes = details.classes.slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
      return details.tag + id + classes;
    };
    const selectorFor = (element) => {
      if (element.id) return '#' + CSS.escape(element.id);
      const testId = element.getAttribute('data-testid');
      if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
      const parts = [];
      let current = element;
      while (current && parts.length < 6) {
        let part = compact(current);
        if (!current.id && current.parentElement) {
          const peers = [...current.parentElement.children].filter((child) => child.tagName === current.tagName);
          if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        if (current.id) break;
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const describe = (element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const properties = ['display','position','width','height','padding','gap','font-size','font-weight','color','background-color','border-radius','grid-template-columns','flex-direction','align-items','justify-content'];
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: [...element.classList].slice(0, 12),
        text: (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 500),
        selector: selectorFor(element),
        ancestry: (() => { const result = []; let node = element; while (node && node instanceof Element && result.length < 8) { result.push(nodeDetails(node)); node = node.parentElement; } return result; })(),
        attributes: Object.fromEntries([...element.attributes].filter((attr) => !attr.name.startsWith('style')).slice(0, 20).map((attr) => [attr.name, attr.value.slice(0, 300)])),
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries(properties.map((name) => [name, styles.getPropertyValue(name)])),
      };
    };
    const paint = (element, box, label) => {
      if (!element || currentMode !== 'select') { box.style.display = 'none'; label.style.display = 'none'; return; }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { box.style.display = 'none'; label.style.display = 'none'; return; }
      box.style.display = 'block';
      box.style.left = Math.max(0, rect.left) + 'px'; box.style.top = Math.max(0, rect.top) + 'px';
      box.style.width = rect.width + 'px'; box.style.height = rect.height + 'px';
      label.textContent = element.tagName.toLowerCase() + '  ' + Math.round(rect.width) + ' × ' + Math.round(rect.height);
      label.style.display = 'block';
      label.style.left = Math.max(5, Math.min(innerWidth - 365, rect.left)) + 'px';
      label.style.top = (rect.top > 30 ? rect.top - 27 : Math.min(innerHeight - 28, rect.bottom + 5)) + 'px';
    };
    const repaint = () => { paint(hovered, hoverBox, hoverLabel); paint(selected, selectedBox, selectedLabel); };
    const pickTarget = (event) => {
      let target = document.elementsFromPoint(event.clientX, event.clientY).find((item) => item !== host && !item.closest('[data-spokeui-inspector]')) || null;
      if (target && target instanceof SVGElement && target.tagName.toLowerCase() !== 'svg') target = target.closest('svg');
      while (target && target.parentElement && target !== document.body) {
        const rect = target.getBoundingClientRect();
        if (rect.width >= 6 && rect.height >= 6) break;
        target = target.parentElement;
      }
      return target;
    };
    document.addEventListener('pointermove', (event) => {
      if (currentMode !== 'select') return;
      if (eventInsidePanel(event)) {
        hovered = null;
        paint(null, hoverBox, hoverLabel);
        return;
      }
      const target = pickTarget(event);
      if (target === hovered) return;
      hovered = target || null;
      paint(hovered, hoverBox, hoverLabel);
    }, true);
    document.addEventListener('pointerleave', () => { hovered = null; paint(null, hoverBox, hoverLabel); }, true);
    document.addEventListener('click', (event) => {
      if (currentMode !== 'select') return;
      if (eventInsidePanel(event)) return;
      const target = pickTarget(event);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      selected = target; hovered = null; repaint();
      globalThis.__spokeuiSelect(JSON.stringify(describe(target)));
    }, true);
    document.addEventListener('contextmenu', (event) => {
      if (eventInsidePanel(event)) return;
      const target = pickTarget(event);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      selected = target; hovered = null; repaint();
      const snapshot = describe(target);
      globalThis.__spokeuiSelect(JSON.stringify(snapshot));
      globalThis.__spokeuiContext(JSON.stringify(snapshot));
    }, true);
    const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const statusLabel = (status) => status === 'running' ? 'Agent working' : status === 'pending' ? 'Review required' : status === 'accepted' ? 'Accepted' : status === 'rejected' ? 'Reverted' : status === 'failed' ? 'Needs attention' : status;
    const renderChange = (change) => {
      agentPanel.style.width = 'min(880px,calc(100vw - 36px))';
      const files = Array.isArray(change.files) ? change.files : [];
      const targetName = change.target ? '&lt;' + escapeText(change.target.tag) + '&gt;' : 'Page';
      const before = change.beforeImage ? '<img src="' + change.beforeImage + '" alt="Component before the agent change">' : '<div class="empty-shot">Capturing before</div>';
      const after = change.afterImage ? '<img src="' + change.afterImage + '" alt="Component after the agent change">' : '<div class="empty-shot"><span class="panel-spinner"></span>Waiting for HMR</div>';
      const fileRows = files.slice(0, 8).map((file) => '<li><span>' + escapeText(file.path) + '</span><code>+' + file.additions + ' −' + file.deletions + '</code></li>').join('');
      const response = change.response ? '<div class="agent-answer"><strong>Agent response</strong><p>' + escapeText(change.response).replace(/\\n/g, '<br>') + '</p></div>' : '';
      agentPanel.innerHTML = '<style>' +
        '.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 17px 13px;border-bottom:1px solid rgba(32,35,31,.11)}.panel-head span{display:block;color:#787b74;font-size:10px;margin-bottom:3px}.panel-head strong{font-size:14px}.status{flex:0 0 auto;padding:5px 7px;border-radius:6px;background:#e7edff;color:#1455ff;font-size:10px;font-weight:700}.status.pending{background:#fff2d8;color:#8a5b05}.status.accepted{background:#e5f5eb;color:#14734d}.status.rejected,.status.failed{background:#fdeae6;color:#ae3527}' +
        '.review-body{padding:16px 17px}.request{margin:0 0 15px;color:#555a52;font-size:12px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}.shot{min-width:0}.shot label{display:flex;justify-content:space-between;margin-bottom:7px;color:#8b8e87;font-size:9px;font-weight:750;letter-spacing:.1em}.shot-frame{height:min(300px,34vh);min-height:210px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(32,35,31,.12);border-radius:9px;background:#eeefec}.shot-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;background:#fff}.empty-shot{display:flex;align-items:center;gap:7px;color:#858981;font-size:10px}.panel-spinner{width:10px;height:10px;border:2px solid #bdc9ea;border-top-color:#1455ff;border-radius:50%;animation:spin .8s linear infinite}' +
        '.summary{display:flex;align-items:center;gap:12px;padding:12px 0 4px;color:#666a62;font-size:11px}.summary strong{color:#20231f}.add{color:#14734d}.del{color:#ae3527}.details{margin-top:9px;border-top:1px solid rgba(32,35,31,.1);padding-top:9px}.details summary{cursor:pointer;color:#4f544d;font-weight:650;font-size:11px}.details ul{list-style:none;margin:8px 0 0;padding:0}.details li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;color:#60645d;font-size:10px}.details li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.details code{flex:0 0 auto;color:#596056}.agent-answer{margin-top:11px;padding:11px;border-radius:8px;background:#eeefec}.agent-answer strong{font-size:10px}.agent-answer p{max-height:180px;overflow:auto;margin:5px 0 0;color:#535850;font-size:11px;white-space:normal}' +
        '.panel-actions{display:flex;justify-content:flex-end;gap:7px;padding:12px 17px;border-top:1px solid rgba(32,35,31,.11)}.panel-actions button{height:32px;border-radius:7px;padding:0 12px;font:650 11px Inter,-apple-system,sans-serif;cursor:pointer}.secondary{border:1px solid rgba(32,35,31,.18);background:#fbfaf7;color:#353a34}.reject{border:1px solid #edc5bd;background:#fff5f2;color:#ae3527}.accept{border:0;background:#20231f;color:#fbfaf7}.close{border:0;background:transparent;color:#777b74;padding:2px!important;height:auto!important;font-size:18px!important}@media(max-width:720px){.compare{grid-template-columns:1fr}.shot-frame{height:220px;min-height:0}}@keyframes spin{to{transform:rotate(360deg)}}' +
        '</style><header class="panel-head"><div><span>AGENT CHANGE · ' + targetName + '</span><strong>' + escapeText(change.runtime === 'claude' ? 'Claude Code' : 'Codex') + '</strong></div><div class="status ' + escapeText(change.status) + '">' + escapeText(statusLabel(change.status)) + '</div></header>' +
        '<div class="review-body"><p class="request">' + escapeText(change.instruction) + '</p><div class="compare"><div class="shot"><label>BEFORE</label><div class="shot-frame">' + before + '</div></div><div class="shot"><label>AFTER</label><div class="shot-frame">' + after + '</div></div></div>' +
        '<div class="summary"><strong>' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' changed</strong><span class="add">+' + Number(change.additions || 0) + '</span><span class="del">−' + Number(change.deletions || 0) + '</span></div>' +
        (files.length ? '<details class="details"><summary>Detailed review</summary><ul>' + fileRows + '</ul></details>' : '') + response + '</div>' +
        '<footer class="panel-actions">' + (change.status === 'pending' ? '<button class="reject" data-action="reject">Reject</button><button class="accept" data-action="accept">Accept</button>' : '') + '<button class="secondary" data-action="dismiss">' + (change.status === 'running' ? 'Hide' : 'Close') + '</button></footer>';
      agentPanel.style.display = 'block';
      agentPanel.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (action === 'dismiss') agentPanel.style.display = 'none';
        else globalThis.__spokeuiChangeAction(JSON.stringify({ id: change.id, action }));
      }));
    };
    const showDebug = (title, text, working) => {
      agentPanel.style.width = 'min(520px,calc(100vw - 36px))';
      agentPanel.innerHTML = '<style>.debug-head{display:flex;justify-content:space-between;align-items:center;padding:15px 17px;border-bottom:1px solid rgba(32,35,31,.11)}.debug-head strong{font-size:13px}.debug-body{padding:16px 17px;color:#50554d;font-size:12px;line-height:1.55;white-space:pre-wrap;max-height:360px;overflow:auto}.debug-working{display:inline-block;width:10px;height:10px;margin-right:8px;border:2px solid #bdc9ea;border-top-color:#1455ff;border-radius:50%;animation:spin .8s linear infinite}.debug-close{border:0;background:transparent;color:#777b74;font-size:18px;cursor:pointer}@keyframes spin{to{transform:rotate(360deg)}}</style><header class="debug-head"><strong>' + escapeText(title) + '</strong><button class="debug-close" aria-label="Close">×</button></header><div class="debug-body">' + (working ? '<span class="debug-working"></span>' : '') + escapeText(text) + '</div>';
      agentPanel.style.display = 'block';
      agentPanel.querySelector('.debug-close').addEventListener('click', () => { agentPanel.style.display = 'none'; });
    };
    const showHistory = (records) => {
      agentPanel.style.width = 'min(660px,calc(100vw - 36px))';
      const rows = records.map((change) => '<button class="history-row" data-change-id="' + escapeText(change.id) + '"><span><strong>' + escapeText(change.target ? '<' + change.target.tag + '>' : 'Page change') + '</strong><small>' + escapeText(change.instruction) + '</small></span><span class="history-meta"><em class="' + escapeText(change.status) + '">' + escapeText(statusLabel(change.status)) + '</em><code>' + Number(change.files?.length || 0) + ' files · +' + Number(change.additions || 0) + ' −' + Number(change.deletions || 0) + '</code></span></button>').join('');
      agentPanel.innerHTML = '<style>.history-head{display:flex;justify-content:space-between;align-items:center;padding:15px 17px;border-bottom:1px solid rgba(32,35,31,.11)}.history-head strong{font-size:13px}.history-close{border:0;background:transparent;color:#777b74;font-size:18px;cursor:pointer}.history-list{max-height:430px;overflow:auto}.history-row{width:100%;border:0;border-bottom:1px solid rgba(32,35,31,.09);background:transparent;padding:12px 17px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;text-align:left;cursor:pointer}.history-row:hover{background:#f0efeb}.history-row>span,.history-row strong,.history-row small{display:block;min-width:0}.history-row strong{font-size:11px}.history-row small{max-width:280px;margin-top:3px;color:#777b74;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-meta{text-align:right}.history-meta em{display:inline-block;padding:3px 5px;border-radius:5px;background:#e7edff;color:#1455ff;font-size:9px;font-style:normal;font-weight:700}.history-meta em.pending{background:#fff2d8;color:#8a5b05}.history-meta em.accepted{background:#e5f5eb;color:#14734d}.history-meta em.rejected,.history-meta em.failed{background:#fdeae6;color:#ae3527}.history-meta code{margin-top:4px;color:#777b74;font-size:9px}.history-empty{padding:44px 18px;text-align:center;color:#777b74;font-size:11px}</style><header class="history-head"><strong>Component history</strong><button class="history-close" aria-label="Close">×</button></header><div class="history-list">' + (rows || '<div class="history-empty">Agent changes will appear here.</div>') + '</div>';
      agentPanel.style.display = 'block';
      agentPanel.querySelector('.history-close').addEventListener('click', () => { agentPanel.style.display = 'none'; });
      agentPanel.querySelectorAll('[data-change-id]').forEach((button) => button.addEventListener('click', () => globalThis.__spokeuiChangeAction(JSON.stringify({ id: button.getAttribute('data-change-id'), action: 'view' }))));
    };
    addEventListener('scroll', repaint, true);
    addEventListener('resize', repaint);
    globalThis.__spokeuiInspector = { active: true, renderChange, showDebug, showHistory, setUiVisible: (visible) => { host.style.visibility = visible ? 'visible' : 'hidden'; } };
    document.documentElement.style.cursor = 'crosshair';
  })()`;
}

async function attachInspector() {
  const contents = previewView?.webContents;
  if (!contents || contents.isDestroyed()) return;
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    await contents.debugger.sendCommand('Runtime.enable');
    await contents.debugger.sendCommand('Network.enable');
    for (const name of ['__spokeuiSelect', '__spokeuiContext', '__spokeuiChangeAction']) {
      try { await contents.debugger.sendCommand('Runtime.addBinding', { name }); } catch { /* Binding already exists. */ }
    }
    await contents.executeJavaScript(inspectorScript());
  } catch (error) {
    emit('preview:state', { phase: 'error', message: `Selection tools are unavailable: ${(error as Error).message}` });
  }
}

async function callInspector(method: 'renderChange' | 'showDebug' | 'showHistory' | 'setUiVisible', ...args: unknown[]) {
  const contents = previewView?.webContents;
  if (!contents || contents.isDestroyed()) return;
  const serialized = args.map((value) => JSON.stringify(value)).join(',');
  try { await contents.executeJavaScript(`globalThis.__spokeuiInspector?.${method}(${serialized})`); }
  catch { /* The page may be rebuilding between HMR frames. */ }
}

function showElementMenu(target: ElementSnapshot) {
  const actions: Array<[string, PreviewDebugAction['action']]> = [
    ['Ask agent about this', 'ask'],
    ['Explain this component', 'explain'],
    ['Find source', 'source'],
    ['Debug this component', 'debug'],
    ['Find network requests', 'network'],
    ['Find console errors', 'console'],
    ['Find state', 'state'],
    ['Find accessibility issues', 'accessibility'],
    ['Find responsive issues', 'responsive'],
  ];
  const template: Electron.MenuItemConstructorOptions[] = [];
  actions.forEach(([label, action], index) => {
    if (index === 1 || index === 4) template.push({ type: 'separator' });
    template.push({ label, click: () => {
      void callInspector('showDebug', label, 'Sending the selected component and browser evidence to the agent…', true);
      emit('preview:debug-action', { action, target } satisfies PreviewDebugAction);
    } });
  });
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow ?? undefined });
}

function createPreview() {
  previewView = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow?.contentView.addChildView(previewView);
  previewView.setVisible(false);

  previewView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  previewView.webContents.on('will-navigate', (_event, url) => emit('preview:state', { phase: 'loading', message: 'Opening page…', url }));
  previewView.webContents.on('did-start-loading', () => emit('preview:state', { phase: 'loading', message: 'Loading preview…' }));
  previewView.webContents.on('did-finish-load', () => {
    if (previewMode === 'loading') {
      emit('preview:state', { phase: 'loading', message: 'Waiting for the development server…' });
    } else if (previewMode === 'project') {
      emit('preview:state', { phase: 'running', message: 'Preview ready', url: previewView?.webContents.getURL() });
      void attachInspector().then(() => {
        const active = publicChanges().find((change) => change.status === 'running' || change.status === 'pending');
        if (active) void callInspector('renderChange', active);
      });
    }
  });
  previewView.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (code !== -3) emit('preview:state', { phase: 'error', message: `Preview failed to load: ${description}`, url });
  });
  previewView.webContents.debugger.on('message', (_event, method, params) => {
    if (method === 'Runtime.bindingCalled' && typeof params.payload === 'string') {
      try {
        if (params.name === '__spokeuiSelect') emit('preview:element-selected', JSON.parse(params.payload) as ElementSnapshot);
        if (params.name === '__spokeuiContext') showElementMenu(JSON.parse(params.payload) as ElementSnapshot);
        if (params.name === '__spokeuiChangeAction') {
          const input = JSON.parse(params.payload) as { id: string; action: 'accept' | 'reject' | 'view' };
          const operation = input.action === 'accept'
            ? acceptChange(input.id)
            : input.action === 'reject'
              ? rejectChange(input.id)
              : Promise.resolve(changes.get(input.id)?.record);
          void operation.then((record) => { if (record) void callInspector('renderChange', record); }).catch((error) => {
            void callInspector('showDebug', 'Change review', (error as Error).message || 'The change could not be updated.', false);
          });
        }
      } catch { emit('preview:state', { phase: 'error', message: 'The selected element could not be inspected.' }); }
    }
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args as Array<{ value?: unknown; description?: string }> | undefined)?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') || '';
      consoleEntries.push({ level: String(params.type ?? 'log'), text: text.slice(0, 2_000), timestamp: Number(params.timestamp ?? Date.now()) });
      if (consoleEntries.length > 120) consoleEntries.splice(0, consoleEntries.length - 120);
    }
    if (method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
      consoleEntries.push({ level: 'error', text: String(details?.exception?.description || details?.text || 'Uncaught exception').slice(0, 2_000), timestamp: Date.now() });
      if (consoleEntries.length > 120) consoleEntries.splice(0, consoleEntries.length - 120);
    }
    if (method === 'Network.requestWillBeSent') {
      const request = params.request as { method?: string; url?: string } | undefined;
      if (request?.url) networkRequests.set(String(params.requestId), { method: request.method || 'GET', url: request.url, timestamp: Date.now() });
    }
    if (method === 'Network.responseReceived') {
      const response = params.response as { url?: string; status?: number } | undefined;
      const request = networkRequests.get(String(params.requestId));
      if (response?.url) networkEntries.push({ method: request?.method || 'GET', url: response.url, status: response.status, timestamp: request?.timestamp || Date.now() });
      networkRequests.delete(String(params.requestId));
      if (networkEntries.length > 160) networkEntries.splice(0, networkEntries.length - 160);
    }
    if (method === 'Network.loadingFailed') {
      const request = networkRequests.get(String(params.requestId));
      networkEntries.push({ method: request?.method || 'GET', url: request?.url || String(params.requestId || 'request'), error: String(params.errorText || 'Request failed'), timestamp: request?.timestamp || Date.now() });
      networkRequests.delete(String(params.requestId));
      if (networkEntries.length > 160) networkEntries.splice(0, networkEntries.length - 160);
    }
  });
  previewView.webContents.debugger.on('detach', () => {
    emit('preview:state', { phase: 'error', message: 'Selection tools disconnected. Reload the preview to reconnect.' });
  });

  previewMode = 'empty';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: '#f6f3ed',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  createPreview();
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));

  mainWindow.on('closed', () => {
    projectProcess?.kill('SIGTERM');
    projectProcess = null;
    mainWindow = null;
    previewView = null;
  });
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function capturePreview(target: ElementSnapshot | null) {
  const contents = previewView?.webContents;
  if (!contents || contents.isDestroyed() || previewMode !== 'project') return undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await callInspector('setUiVisible', false);
    try {
      await contents.executeJavaScript(`new Promise((resolve) => {
        const settle = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        const fonts = document.fonts?.ready || Promise.resolve();
        if (document.readyState === 'complete') fonts.then(settle);
        else addEventListener('load', () => fonts.then(settle), { once: true });
        setTimeout(resolve, 900);
      })`);
      let rectangle: { x: number; y: number; width: number; height: number } | undefined;
      if (target?.selector) {
        const selector = JSON.stringify(target.selector);
        rectangle = await contents.executeJavaScript(`(() => {
          const element = document.querySelector(${selector});
          if (!element) return undefined;
          const rect = element.getBoundingClientRect();
          const padding = 18;
          return {
            x: Math.max(0, Math.floor(rect.x - padding)),
            y: Math.max(0, Math.floor(rect.y - padding)),
            width: Math.max(1, Math.min(innerWidth - Math.max(0, rect.x - padding), Math.ceil(rect.width + padding * 2))),
            height: Math.max(1, Math.min(innerHeight - Math.max(0, rect.y - padding), Math.ceil(rect.height + padding * 2)))
          };
        })()`);
      }
      const image = await contents.capturePage(rectangle);
      if (image.isEmpty()) throw new Error('The preview frame is empty.');
      const size = image.getSize();
      const output = size.width > 960 ? image.resize({ width: 960, quality: 'best' }) : image;
      return output.toDataURL();
    } catch {
      if (attempt < 2) await wait(280);
    } finally {
      await callInspector('setUiVisible', true);
    }
  }
  return undefined;
}

function publicChanges(projectRoot?: string) {
  return [...changes.values()]
    .map((change) => change.record)
    .filter((change) => !projectRoot || change.projectRoot === projectRoot)
    .sort((left, right) => right.createdAt - left.createdAt);
}

async function publishChange(stored: StoredChange) {
  emit('change:updated', stored.record);
  if (stored.record.status === 'accepted' && stored.record.debugAction && stored.record.files.length === 0) {
    await callInspector('showDebug', 'Agent response', stored.record.response || 'The agent completed the request.', false);
  } else {
    await callInspector('renderChange', stored.record);
  }
}

async function acceptChange(id: string) {
  const stored = changes.get(id);
  if (!stored) throw new Error('This change is no longer available.');
  if (stored.record.status !== 'pending') return stored.record;
  stored.record = { ...stored.record, status: 'accepted', phase: 'Change accepted' };
  stored.before.clear();
  stored.after?.clear();
  await publishChange(stored);
  return stored.record;
}

async function rejectChange(id: string) {
  const stored = changes.get(id);
  if (!stored) throw new Error('This change is no longer available.');
  if (stored.record.status !== 'pending') return stored.record;
  stored.record = { ...stored.record, phase: 'Restoring the source files…' };
  await publishChange(stored);
  await restoreChange(stored);
  stored.record = { ...stored.record, status: 'rejected', phase: 'Change reverted' };
  stored.before.clear();
  stored.after?.clear();
  await wait(650);
  await publishChange(stored);
  return stored.record;
}

async function runTrackedRuntime(request: RuntimeRequest) {
  if (activeRuntimeRequest) throw new Error('Wait for the current agent request to finish.');
  const pending = publicChanges(request.projectRoot).find((change) => change.status === 'pending');
  if (pending) throw new Error('Accept or reject the current preview change before starting another request.');
  activeRuntimeRequest = true;
  let before: StoredChange['before'];
  let stored!: StoredChange;
  try {
    before = await snapshotProject(request.projectRoot);
    const record: AgentChange = {
      id: randomUUID(),
      projectRoot: request.projectRoot,
      runtime: request.runtime,
      model: request.model,
      reasoningEffort: request.reasoningEffort,
      instruction: request.instruction,
      debugAction: request.debugAction,
      target: request.target,
      createdAt: Date.now(),
      status: 'running',
      phase: 'Capturing the selected component',
      beforeImage: await capturePreview(request.target),
      files: [],
      additions: 0,
      deletions: 0,
    };
    stored = { record, before };
    changes.set(record.id, stored);
    await publishChange(stored);
  } catch (error) {
    activeRuntimeRequest = false;
    throw error;
  }
  let failure: Error | null = null;
  try {
    const enriched: RuntimeRequest = {
      ...request,
      debugContext: request.debugAction ? { console: consoleEntries.slice(-40), network: networkEntries.slice(-60) } : undefined,
    };
    await runRuntime(enriched, (event: RuntimeEvent) => {
      emit('runtime:event', event);
      if (event.type === 'message') stored.record = { ...stored.record, response: event.text, phase: 'Agent response received' };
      else if (event.type === 'status' || event.type === 'queued') stored.record = { ...stored.record, phase: event.text };
      else if (event.type === 'error') stored.record = { ...stored.record, phase: 'Agent request failed', error: event.text };
      void publishChange(stored);
    });
  } catch (error) {
    failure = error as Error;
  }
  try {
    stored.record = { ...stored.record, phase: 'Waiting for the live preview' };
    await publishChange(stored);
    await wait(1_100);
    const after = await snapshotProject(request.projectRoot);
    const files = diffSnapshots(before, after);
    stored.after = after;
    stored.record = {
      ...stored.record,
      files,
      additions: files.reduce((total, file) => total + file.additions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
      afterImage: await capturePreview(request.target),
      status: failure ? 'failed' : files.length ? 'pending' : 'accepted',
      phase: failure ? 'Agent request failed' : files.length ? 'Review the live result' : 'No source files changed',
      error: failure?.message,
    };
    await publishChange(stored);
  } finally {
    activeRuntimeRequest = false;
  }
  if (failure) throw failure;
}

function packageManagerFor(root: string): ProjectInfo['packageManager'] {
  const candidates: Array<[string, ProjectInfo['packageManager']]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  return candidates.find(([file]) => {
    try {
      accessSync(path.join(root, file));
      return true;
    } catch {
      return false;
    }
  })?.[1] ?? 'npm';
}

async function discoverProject(root: string): Promise<ProjectInfo> {
  let name = path.basename(root);
  let devScript: string | null = null;
  try {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    name = pkg.name || name;
    devScript = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : null;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const suggestedUrl = deps.next ? 'http://localhost:3000' : 'http://localhost:5173';
    return { root, name, packageManager: packageManagerFor(root), devScript, suggestedUrl };
  } catch {
    return { root, name, packageManager: null, devScript, suggestedUrl: 'http://localhost:8000' };
  }
}

async function launchProject(project: ProjectInfo) {
  if (!project.packageManager || !project.devScript) throw new Error('No supported dev or start script was found');
  previewMode = 'loading';
  emit('preview:state', { phase: 'loading', message: 'Waiting for the development server…' });
  await previewView?.webContents.loadURL(loadingPreviewUrl(project.name));
  const previousProcess = projectProcess;
  projectProcess = null;
  previousProcess?.kill('SIGTERM');
  const command = project.packageManager;
  try {
    accessSync(path.join(project.root, 'node_modules'));
  } catch {
    emit('project:state', { phase: 'installing', message: 'Installing project dependencies…' });
    emit('project:log', `Installing dependencies with ${command}…\n`);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const installer = spawn(command, ['install'], {
        cwd: project.root,
        env: { ...process.env, BROWSER: 'none' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      projectProcess = installer;
      installer.stdout?.on('data', (chunk: Buffer) => emit('project:log', chunk.toString()));
      installer.stderr?.on('data', (chunk: Buffer) => emit('project:log', chunk.toString()));
      installer.on('error', (error) => {
        if (settled) return;
        settled = true;
        if (projectProcess === installer) projectProcess = null;
        emit('project:state', { phase: 'error', message: `Dependency installation failed: ${error.message}` });
        reject(error);
      });
      installer.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (projectProcess === installer) projectProcess = null;
        if (code === 0) resolve();
        else {
          const error = new Error(`Dependency installation stopped with exit code ${code ?? 'unknown'}.`);
          emit('project:state', { phase: 'error', message: error.message });
          reject(error);
        }
      });
    });
  }

  emit('project:state', { phase: 'starting', message: 'Starting the development server…' });
  emit('project:log', `Starting ${command} run ${project.devScript}…\n`);
  const server = spawn(command, ['run', project.devScript], {
    cwd: project.root,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  projectProcess = server;

  const handleOutput = (chunk: Buffer) => {
    if (projectProcess !== server) return;
    const text = chunk.toString();
    emit('project:log', text);
    const url = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/\S*)?/)?.[0];
    if (url) {
      const cleanUrl = url.replace(/[),.;]+$/, '');
      emit('project:state', { phase: 'running', message: 'Development server running', url: cleanUrl });
      previewMode = 'project';
      void previewView?.webContents.loadURL(cleanUrl);
    }
  };
  server.stdout?.on('data', handleOutput);
  server.stderr?.on('data', handleOutput);
  server.on('error', (error) => {
    if (projectProcess !== server) return;
    emit('project:log', `Launch failed: ${error.message}`);
    emit('project:state', { phase: 'error', message: `The development server could not start: ${error.message}` });
  });
  server.on('close', (code) => {
    if (projectProcess !== server) return;
    projectProcess = null;
    emit('project:log', `Development process exited with code ${code ?? 'unknown'}`);
    emit('project:state', {
      phase: code === 0 ? 'stopped' : 'error',
      message: code === 0 ? 'Development server stopped' : `Development server stopped with exit code ${code ?? 'unknown'}.`,
    });
  });

  setTimeout(() => {
    if (projectProcess === server && previewView && !previewView.webContents.isLoading()) {
      previewMode = 'project';
      void previewView.webContents.loadURL(project.suggestedUrl);
    }
  }, 1_200);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'electron.icns')
      : path.join(app.getAppPath(), 'assets', 'SpokeUI.icns');
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
  }
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && webContents === mainWindow?.webContents;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && webContents === mainWindow?.webContents);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('preview:set-bounds', (_event, bounds: PreviewBounds) => {
  if (!previewView) return;
  previewView.setBounds({
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  });
});
ipcMain.handle('preview:show', (_event, visible: boolean) => previewView?.setVisible(visible));
ipcMain.handle('preview:load', async (_event, url: string) => {
  previewMode = 'project';
  return previewView?.webContents.loadURL(url);
});
ipcMain.handle('preview:back', () => {
  const history = previewView?.webContents.navigationHistory;
  if (history?.canGoBack()) history.goBack();
});
ipcMain.handle('preview:reload', () => previewView?.webContents.reload());
ipcMain.handle('preview:open-external', async () => {
  const url = previewView?.webContents.getURL();
  if (url && /^https?:\/\//.test(url)) await shell.openExternal(url);
});
ipcMain.handle('preview:show-changes', (_event, projectRoot?: string) => callInspector('showHistory', publicChanges(projectRoot)));
ipcMain.handle('preview:show-message', (_event, input: { title: string; text: string }) => callInspector('showDebug', input.title, input.text, false));
ipcMain.handle('project:choose-existing', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const project = await projectStore.remember(await discoverProject(result.filePaths[0]));
  emit('projects:changed', await projectStore.list());
  return project;
});
ipcMain.handle('project:create-new', async (_event, input: NewProjectInput) => {
  const parent = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choose where to create the project',
    buttonLabel: 'Create here',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (parent.canceled || !parent.filePaths[0]) return null;

  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-project';
  const root = path.join(parent.filePaths[0], slug);
  try {
    await access(root);
    throw new Error(`A folder named ${slug} already exists`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const templateRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'templates', 'starter')
    : path.join(app.getAppPath(), 'templates', 'starter');
  await mkdir(root, { recursive: false });
  await cp(templateRoot, root, { recursive: true });
  await mkdir(path.join(root, '.voice-ui'), { recursive: true });
  await writeFile(
    path.join(root, '.voice-ui', 'project.md'),
    `# ${input.name.trim() || 'Untitled project'}\n\nTemplate: ${input.template}\n\n## Product brief\n\n${input.brief.trim() || 'Create a clear, polished web experience.'}\n`,
  );
  await writeFile(
    path.join(root, 'src', 'project.ts'),
    `export const project = ${JSON.stringify({
      name: input.name.trim() || 'Untitled project',
      template: input.template,
      brief: input.brief.trim() || 'Create a clear, polished web experience.',
    }, null, 2)} as const;\n`,
  );
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, unknown>;
  pkg.name = slug;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const discovered = await discoverProject(root);
  discovered.name = input.name.trim() || 'Untitled project';
  const project = await projectStore.remember(discovered);
  emit('projects:changed', await projectStore.list());
  return project;
});
ipcMain.handle('project:list', () => projectStore.list());
ipcMain.handle('project:rename', async (_event, input: { id: string; name: string }) => {
  const project = await projectStore.rename(input.id, input.name);
  emit('projects:changed', await projectStore.list());
  return project;
});
ipcMain.handle('project:remove', async (_event, id: string) => {
  await projectStore.remove(id);
  emit('projects:changed', await projectStore.list());
});
ipcMain.handle('project:launch', async (_event, project: ProjectInfo) => {
  try {
    if ('id' in project) {
      await projectStore.remember(project);
      emit('projects:changed', await projectStore.list());
    }
    await launchProject(project);
  } catch (error) {
    emit('project:state', { phase: 'error', message: (error as Error).message || 'The project could not be started.' });
    throw error;
  }
});

ipcMain.handle('runtime:detect', () => detectRuntimes());
ipcMain.handle('runtime:run', async (_event, request: RuntimeRequest) => {
  await access(request.projectRoot);
  await runTrackedRuntime(request);
});
ipcMain.handle('change:list', (_event, projectRoot?: string) => publicChanges(projectRoot));
ipcMain.handle('change:accept', (_event, id: string) => acceptChange(id));
ipcMain.handle('change:reject', (_event, id: string) => rejectChange(id));

ipcMain.handle('voice:start', (_event, input: { apiKey: string; sampleRate: number }) => {
  voiceSession.start(input.apiKey, input.sampleRate, (event) => emit('voice:event', event));
});
ipcMain.handle('voice:get-default-key', () => getAssemblyAiKey());
ipcMain.handle('voice:save-api-key', (_event, apiKey: string) => settingsStore.setAssemblyAiKey(apiKey));
ipcMain.handle('voice:get-permission', () => systemPreferences.getMediaAccessStatus('microphone'));
ipcMain.handle('voice:request-permission', async () => {
  if (process.platform === 'darwin') {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted ? 'granted' : 'denied';
  }
  return systemPreferences.getMediaAccessStatus('microphone');
});
ipcMain.on('voice:audio', (_event, chunk: ArrayBuffer) => voiceSession.send(chunk));
ipcMain.handle('voice:stop', () => voiceSession.stop());
