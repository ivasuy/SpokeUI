import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Command,
  Copy,
  ExternalLink,
  Folders,
  FolderOpen,
  Frame,
  Globe2,
  GripVertical,
  History,
  Inspect,
  LayoutDashboard,
  LoaderCircle,
  Mic,
  Monitor,
  MousePointer2,
  Pencil,
  PanelRight,
  Plus,
  RefreshCw,
  Radio,
  Rocket,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import type { AgentChange, AgentRuntime, DebugAction, ElementSnapshot, MicrophonePermission, PreviewDebugAction, PreviewState, ProjectInfo, ProjectState, ReasoningEffort, RuntimeEvent, RuntimeInfo, StoredProject, TemplateId } from './shared';
import appIconUrl from '../assets/icon.png';
import './styles.css';

type WizardStep = 'template' | 'brief';
type RuntimeViewState = { phase: 'checking' | 'ready' | 'missing' | 'error'; name: string; message: string };
type TaskState = { phase: 'idle' | 'queued' | 'working' | 'complete' | 'error'; message: string };
type VoiceState = { phase: 'idle' | 'connecting' | 'listening' | 'finalizing' | 'error'; message: string };
type ViewportPreset = 'desktop' | 'tablet' | 'mobile';
type KeySaveState = 'idle' | 'saving' | 'saved' | 'error';
type WorkspaceView = 'preview' | 'terminal' | 'session' | 'projects';
type SessionEntry = { id: string; tone: RuntimeEvent['type'] | 'request'; text: string; at: number };
const projectsPerPage = 6;

const codexModels = [
  { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
] as const;

const claudeModels = [
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'fable', label: 'Claude Fable' },
] as const;

const reasoningOptions: Array<{ id: ReasoningEffort; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Maximum' },
];

const debugPrompts: Record<DebugAction, string> = {
  ask: 'Review this selected component. Explain what it does, how it is implemented, and anything I should know before changing it.',
  explain: 'Explain this selected component clearly, including its source structure, styling, behavior, and dependencies.',
  source: 'Find the exact source file and component that render this selected element. Give me the relevant paths and symbols.',
  debug: 'Debug this selected component. Trace the likely cause, use the available browser evidence, and fix the source when the cause is clear.',
  network: 'Find the network requests associated with this selected component. Explain failures, slow requests, or incorrect data flow using the captured browser evidence.',
  console: 'Find console errors related to this selected component. Explain the cause and fix the source when the fix is clear.',
  state: 'Find the state that controls this selected component. Explain where it lives, how it changes, and any state bugs you can identify.',
  accessibility: 'Audit this selected component for accessibility issues and fix clear violations while preserving its visual intent.',
  responsive: 'Audit this selected component for responsive layout issues across desktop, tablet, and mobile, then fix clear source-level problems.',
};

const viewportOptions: Array<{ id: ViewportPreset; label: string; detail: string; icon: React.ReactNode }> = [
  { id: 'desktop', label: 'Desktop', detail: 'Fluid width', icon: <Monitor size={15} /> },
  { id: 'tablet', label: 'Tablet', detail: '768 px', icon: <Tablet size={15} /> },
  { id: 'mobile', label: 'Mobile', detail: '390 px', icon: <Smartphone size={15} /> },
];

const templates: Array<{ id: TemplateId; name: string; description: string; icon: React.ReactNode }> = [
  { id: 'saas', name: 'Product site', description: 'A focused landing page for a product or service.', icon: <Rocket size={19} /> },
  { id: 'portfolio', name: 'Portfolio', description: 'An editorial home for projects, writing, and work.', icon: <Frame size={19} /> },
  { id: 'dashboard', name: 'Dashboard', description: 'A structured application shell for complex workflows.', icon: <LayoutDashboard size={19} /> },
];

function shortPath(value: string) {
  const parts = value.split('/').filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : value;
}

function parentDirectory(value: string) {
  const parts = value.split('/').filter(Boolean);
  return parts.length > 1 ? parts.at(-2)! : value;
}

function storedRailWidth(key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function storedViewport(): ViewportPreset {
  const value = localStorage.getItem('spokeui:viewport');
  return value === 'tablet' || value === 'mobile' ? value : 'desktop';
}

function storedCodexModel() {
  const value = localStorage.getItem('spokeui:codex-model') || 'gpt-5.6-sol';
  return codexModels.some((model) => model.id === value) ? value : 'gpt-5.6-sol';
}

function storedAgentRuntime(): AgentRuntime {
  return localStorage.getItem('spokeui:agent-runtime') === 'claude' ? 'claude' : 'codex';
}

function storedModel(runtime: AgentRuntime) {
  if (runtime === 'claude') {
    const value = localStorage.getItem('spokeui:claude-model') || 'sonnet';
    return claudeModels.some((model) => model.id === value) ? value : 'sonnet';
  }
  return storedCodexModel();
}

function storedReasoningEffort(): ReasoningEffort {
  const value = localStorage.getItem('spokeui:reasoning-effort');
  return value === 'low' || value === 'high' || value === 'xhigh' ? value : 'medium';
}

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() || `spoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sessionTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp);
}

function SelectionSummary({ selection }: { selection: ElementSnapshot }) {
  return (
    <>
      <div className="selection-heading">
        <div className="element-icon">&lt;/&gt;</div>
        <div>
          <strong>&lt;{selection.tag}&gt;</strong>
          <span>{Math.round(selection.bounds.width)} × {Math.round(selection.bounds.height)}</span>
        </div>
      </div>
      {(selection.id || selection.classes.length > 0) && <div className="node-badges">
        {selection.id && <code className="id-badge">#{selection.id}</code>}
        {selection.classes.slice(0, 4).map((name) => <code key={name}>.{name}</code>)}
      </div>}
      <code className="selector-code">{selection.selector}</code>
      {selection.text && <p className="selection-copy">“{selection.text.slice(0, 120)}{selection.text.length > 120 ? '…' : ''}”</p>}
    </>
  );
}

function PropertyRow({ label, value, onUse }: { label: string; value: string; onUse: () => void }) {
  return (
    <button className="property-row" onClick={onUse} title={`Add ${label} to the edit request`}>
      <span>{label}</span><code>{value || '—'}</code>
    </button>
  );
}

function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: ProjectInfo, brief: string) => void }) {
  const [step, setStep] = useState<WizardStep>('template');
  const [template, setTemplate] = useState<TemplateId>('saas');
  const [name, setName] = useState('New project');
  const [brief, setBrief] = useState('Create a clear, polished website with purposeful content, strong visual hierarchy, and thoughtful responsive behavior.');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setCreating(true);
    setError('');
    try {
      const project = await window.appApi.project.createNew({ name, template, brief });
      if (project) onCreated(project, brief);
      else setCreating(false);
    } catch (caught) {
      setError((caught as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <header className="modal-header">
          <div><span className="step-label">Step {step === 'template' ? '1' : '2'} of 2</span><h2 id="new-project-title">{step === 'template' ? 'Choose a starting point' : 'Describe what you want'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        {step === 'template' ? (
          <div className="template-list">
            {templates.map((item) => (
              <button key={item.id} className={`template-option ${template === item.id ? 'selected' : ''}`} onClick={() => setTemplate(item.id)}>
                <span className="template-icon">{item.icon}</span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                <span className="radio">{template === item.id && <Circle size={8} fill="currentColor" />}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="brief-form">
            <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
            <label>Product brief<textarea rows={6} value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
            <p><Sparkles size={14} /> Your agent runtime receives this brief with the project’s design guidance.</p>
            {error && <div className="inline-error" role="alert">Could not create the project. {error}</div>}
          </div>
        )}
        <footer className="modal-footer">
          {step === 'brief' ? <button className="quiet-button" onClick={() => setStep('template')}><ArrowLeft size={15} /> Back</button> : <span />}
          <button className="primary-button" disabled={creating || (step === 'brief' && !name.trim())} onClick={() => step === 'template' ? setStep('brief') : void create()}>
            {creating ? <LoaderCircle className="spin" size={16} /> : step === 'template' ? 'Continue' : 'Choose folder and create'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function RenameProjectDialog({ project, onClose, onRenamed }: { project: StoredProject; onClose: () => void; onRenamed: (project: StoredProject) => void }) {
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      onRenamed(await window.appApi.project.rename(project.id, name));
    } catch (caught) {
      setError((caught as Error).message || 'The project could not be renamed.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="rename-project-title">
        <header className="modal-header">
          <div><span className="step-label">Project library</span><h2 id="rename-project-title">Rename project</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        <div className="brief-form">
          <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && void save()} autoFocus /></label>
          <p>This changes the name in SpokeUI. The project folder is unchanged.</p>
          {error && <div className="inline-error" role="alert">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="quiet-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16} /> : 'Save name'}</button>
        </footer>
      </section>
    </div>
  );
}

function PendingChangesDialog({ projectName, count, onClose, onReview }: { projectName: string; count: number; onClose: () => void; onReview: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="pending-changes-title">
        <header className="modal-header">
          <div><span className="step-label">Review required</span><h2 id="pending-changes-title">Resolve changes before switching</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        <div className="pending-changes-copy">
          <span className="pending-changes-icon"><History size={18} /></span>
          <p><strong>{projectName}</strong> has {count} unfinished {count === 1 ? 'change' : 'changes'}. Accept or reject {count === 1 ? 'it' : 'them'} before opening another project.</p>
          <small>Completed history stays attached to this project and appears again when you reopen it.</small>
        </div>
        <footer className="modal-footer">
          <button className="quiet-button" onClick={onClose}>Stay here</button>
          <button className="primary-button" onClick={onReview}><History size={14} /> Review changes</button>
        </footer>
      </section>
    </div>
  );
}

function App() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingChangesPromptOpen, setPendingChangesPromptOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<StoredProject | null>(null);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [projectPage, setProjectPage] = useState(0);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [selections, setSelections] = useState<ElementSnapshot[]>([]);
  const selection = selections.at(-1) ?? null;
  const selectionHint = /Mac/.test(navigator.platform) ? '⌘-click to add or remove elements' : 'Ctrl-click to add or remove elements';
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>({ phase: 'idle', message: 'Waiting for a project' });
  const [projectState, setProjectState] = useState<ProjectState>({ phase: 'idle', message: 'No project running' });
  const [instruction, setInstruction] = useState('');
  const [runtimeState, setRuntimeState] = useState<RuntimeViewState>({ phase: 'checking', name: 'Agent runtime', message: 'Checking runtime…' });
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [taskState, setTaskState] = useState<TaskState>({ phase: 'idle', message: 'Ready for a request' });
  const [activity, setActivity] = useState<SessionEntry[]>([]);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('projects');
  const [sessionId, setSessionId] = useState(createSessionId);
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now);
  const [sessionIdCopied, setSessionIdCopied] = useState(false);
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntime>(storedAgentRuntime);
  const [sessionModel, setSessionModel] = useState(() => storedModel(storedAgentRuntime()));
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(storedReasoningEffort);
  const [projectLogs, setProjectLogs] = useState('');
  const [changeHistory, setChangeHistory] = useState<AgentChange[]>([]);
  const [assemblyKey, setAssemblyKey] = useState('');
  const [assemblyKeyLoaded, setAssemblyKeyLoaded] = useState(false);
  const [keySaveState, setKeySaveState] = useState<KeySaveState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>({ phase: 'idle', message: '' });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(() => storedRailWidth('spokeui:left-rail-width', 230, 210, 320));
  const [rightRailWidth, setRightRailWidth] = useState(() => storedRailWidth('spokeui:right-rail-width', 300, 260, 380));
  const [resizingRail, setResizingRail] = useState<'left' | 'right' | null>(null);
  const [viewportPreset, setViewportPreset] = useState<ViewportPreset>(storedViewport);
  const [viewportMenuOpen, setViewportMenuOpen] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermission>('unknown');
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const previewSlot = useRef<HTMLDivElement>(null);
  const viewportControl = useRef<HTMLDivElement>(null);
  const sessionEnd = useRef<HTMLDivElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const voiceRequested = useRef(false);
  const working = taskState.phase === 'queued' || taskState.phase === 'working';
  const recording = voiceState.phase === 'connecting' || voiceState.phase === 'listening' || voiceState.phase === 'finalizing';

  const syncPreviewBounds = useCallback(() => {
    const rect = previewSlot.current?.getBoundingClientRect();
    if (!rect) return;
    void window.appApi.preview.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    const previewVisible = workspaceView === 'preview' && Boolean(project);
    void window.appApi.preview.show(previewVisible);
    if (!previewVisible) return;
    syncPreviewBounds();
    const observer = new ResizeObserver(syncPreviewBounds);
    if (previewSlot.current) observer.observe(previewSlot.current);
    window.addEventListener('resize', syncPreviewBounds);
    return () => { observer.disconnect(); window.removeEventListener('resize', syncPreviewBounds); };
  }, [workspaceView, project, syncPreviewBounds]);

  useEffect(() => {
    if (!viewportMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!viewportControl.current?.contains(event.target as Node)) setViewportMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [viewportMenuOpen]);

  useEffect(() => {
    if (workspaceView === 'session') sessionEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activity, workspaceView]);

  useEffect(() => {
    const finalPage = Math.max(0, Math.ceil(projects.length / projectsPerPage) - 1);
    if (projectPage > finalPage) setProjectPage(finalPage);
  }, [projectPage, projects.length]);

  useEffect(() => {
    void window.appApi.voice.getDefaultKey()
      .then((key) => {
        if (key) setAssemblyKey(key);
        setKeySaveState(key ? 'saved' : 'idle');
      })
      .finally(() => setAssemblyKeyLoaded(true));
    void window.appApi.voice.getPermission().then(setMicrophonePermission).catch(() => setMicrophonePermission('unknown'));
    void window.appApi.project.list()
      .then((items) => setProjects(items))
      .catch((error) => setProjectsError((error as Error).message || 'Projects could not be loaded.'))
      .finally(() => setProjectsLoading(false));
    void window.appApi.runtime.detect()
      .then((results) => {
        setRuntimes(results);
        const result = results.find((item) => item.id === storedAgentRuntime());
        setRuntimeState(result?.available
          ? { phase: 'ready', name: result.name, message: 'Runtime ready' }
          : { phase: 'missing', name: result?.name || 'Agent runtime', message: result?.error || 'Runtime unavailable' });
      })
      .catch(() => setRuntimeState({ phase: 'error', name: 'Agent runtime', message: 'Runtime check failed' }));
    const cleanups = [
      window.appApi.onElementSelected((value) => setSelections(value)),
      window.appApi.onPreviewState((state) => { setPreviewState(state); if (state.url) setPreviewUrl(state.url); }),
      window.appApi.onProjectState((state) => {
        setProjectState(state);
        if (state.url) setPreviewUrl(state.url);
        if (state.phase === 'error') setWorkspaceView('terminal');
      }),
      window.appApi.onProjectsChanged((items) => {
        setProjects(items);
        setProjectsError('');
        setProjectsLoading(false);
      }),
      window.appApi.onProjectLog((line) => setProjectLogs((current) => `${current}${line}`.slice(-12000))),
      window.appApi.onRuntimeEvent((event) => {
        setActivity((current) => [...current.slice(-99), { id: createSessionId(), tone: event.type, text: event.text, at: Date.now() }]);
        if (event.type === 'queued') setTaskState({ phase: 'queued', message: event.text });
        if (event.type === 'status' || event.type === 'message') setTaskState({ phase: 'working', message: event.text });
        if (event.type === 'complete') setTaskState({ phase: 'complete', message: event.text });
        if (event.type === 'error') setTaskState({ phase: 'error', message: event.text });
      }),
      window.appApi.onChangeUpdated((change) => setChangeHistory((current) => [change, ...current.filter((item) => item.id !== change.id)].sort((left, right) => right.createdAt - left.createdAt))),
      window.appApi.onVoiceEvent((event) => {
        if (event.type === 'connecting') setVoiceState({ phase: 'connecting', message: event.text });
        if (event.type === 'listening') setVoiceState({ phase: 'listening', message: event.text });
        if (event.type === 'partial') setVoiceState({ phase: 'listening', message: event.text });
        if (event.type === 'final') {
          setInstruction((current) => `${current}${current ? ' ' : ''}${event.text}`);
          setVoiceState(voiceRequested.current ? { phase: 'listening', message: 'Listening…' } : { phase: 'idle', message: '' });
        }
        if (event.type === 'stopped') {
          voiceRequested.current = false;
          void cleanupMicrophone();
          setVoiceState({ phase: 'idle', message: '' });
        }
        if (event.type === 'error') {
          voiceRequested.current = false;
          void cleanupMicrophone();
          setVoiceState({ phase: 'error', message: event.text });
        }
      }),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      voiceRequested.current = false;
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      void audioContext.current?.close();
      void window.appApi.voice.stop();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setChangeHistory([]);
    if (!project?.root) return () => { active = false; };
    void window.appApi.changes.list(project.root)
      .then((items) => { if (active) setChangeHistory(items); })
      .catch(() => { if (active) setChangeHistory([]); });
    return () => { active = false; };
  }, [project?.root]);

  useEffect(() => {
    if (!pendingChangesPromptOpen || !project) return;
    const hasUnresolvedChanges = changeHistory.some((change) =>
      change.projectRoot === project.root && (change.status === 'pending' || change.status === 'running'),
    );
    if (!hasUnresolvedChanges) setPendingChangesPromptOpen(false);
  }, [changeHistory, pendingChangesPromptOpen, project]);

  useEffect(() => {
    if (!assemblyKeyLoaded) return;
    setKeySaveState('saving');
    const timeout = window.setTimeout(() => {
      void window.appApi.voice.saveApiKey(assemblyKey)
        .then(() => setKeySaveState(assemblyKey.trim() ? 'saved' : 'idle'))
        .catch(() => setKeySaveState('error'));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [assemblyKey, assemblyKeyLoaded]);

  function canLeaveCurrentProject(nextRoot?: string | null) {
    if (!project || project.root === nextRoot) return true;
    const unresolved = changeHistory.filter((change) => change.projectRoot === project.root && (change.status === 'pending' || change.status === 'running'));
    if (unresolved.length === 0) return true;
    setPendingChangesPromptOpen(true);
    return false;
  }

  function reviewPendingChanges() {
    setPendingChangesPromptOpen(false);
    setSettingsOpen(false);
    setViewportMenuOpen(false);
    setWorkspaceView('preview');
    if (project) void window.appApi.preview.showChanges(project.root);
  }

  async function launch(next: ProjectInfo, initialInstruction = '') {
    if (!canLeaveCurrentProject(next.root)) return;
    setSettingsOpen(false);
    setWorkspaceView('preview');
    setViewportMenuOpen(false);
    setProject(next);
    setSelections([]);
    setInstruction(initialInstruction);
    setTaskState({ phase: 'idle', message: 'Ready for a request' });
    setActivity([]);
    setSessionId(createSessionId());
    setSessionStartedAt(Date.now());
    setProjectLogs('');
    setPreviewUrl(next.suggestedUrl);
    setProjectState({ phase: 'starting', message: 'Preparing the project…' });
    setPreviewState({ phase: 'loading', message: 'Waiting for the development server…' });
    try {
      await window.appApi.project.launch(next);
    } catch (error) {
      setProjectState({ phase: 'error', message: (error as Error).message || 'The project could not be started.' });
      setWorkspaceView('terminal');
    }
  }

  async function openExisting() {
    if (!canLeaveCurrentProject(null)) return;
    setProjectsError('');
    let next: ProjectInfo | null;
    try {
      next = await window.appApi.project.chooseExisting();
    } catch (error) {
      const message = (error as Error).message || 'The project folder could not be opened.';
      setProjectsError(message);
      setProjectState({ phase: 'error', message });
      return;
    }
    if (!next) return;
    await launch(next);
  }

  async function finishNewProject(next: ProjectInfo, brief: string) {
    setWizardOpen(false);
    await launch(next, brief);
  }

  async function removeProject(item: StoredProject) {
    if (item.root === project?.root && !canLeaveCurrentProject(null)) return;
    setProjectsError('');
    try {
      await window.appApi.project.remove(item.id);
      if (item.root === project?.root) {
        setProject(null);
        setSelections([]);
        setPreviewUrl('');
        setPreviewState({ phase: 'idle', message: 'Waiting for a project' });
        setProjectState({ phase: 'idle', message: 'No project running' });
        setProjectLogs('');
        setInstruction('');
        setActivity([]);
        setTaskState({ phase: 'idle', message: 'Ready for a request' });
        setSessionId(createSessionId());
        setSessionStartedAt(Date.now());
        setWorkspaceView('projects');
      }
    } catch (error) {
      setProjectsError((error as Error).message || 'The project could not be removed.');
    }
  }

  function newSession() {
    if (working) return;
    setSessionId(createSessionId());
    setSessionStartedAt(Date.now());
    setSessionIdCopied(false);
    setActivity([]);
    setInstruction('');
    setTaskState({ phase: 'idle', message: 'Ready for a request' });
    setWorkspaceView('session');
  }

  async function copySessionId() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setSessionIdCopied(true);
      window.setTimeout(() => setSessionIdCopied(false), 1_500);
    } catch {
      setSessionIdCopied(false);
    }
  }

  function resizeRail(side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startingWidth = side === 'left' ? leftRailWidth : rightRailWidth;
    setResizingRail(side);
    const move = (pointerEvent: PointerEvent) => {
      const delta = pointerEvent.clientX - startX;
      const minimum = side === 'left' ? 210 : 260;
      const otherRailWidth = side === 'left' ? (inspectorCollapsed ? 0 : rightRailWidth) : leftRailWidth;
      const protectedCanvasWidth = Math.min(640, Math.max(460, window.innerWidth * .42));
      const availableWidth = window.innerWidth - otherRailWidth - protectedCanvasWidth;
      const maximum = Math.max(minimum, Math.min(side === 'left' ? 320 : 380, availableWidth));
      const width = Math.round(Math.max(minimum, Math.min(maximum, startingWidth + (side === 'left' ? delta : -delta))));
      if (side === 'left') {
        setLeftRailWidth(width);
        localStorage.setItem('spokeui:left-rail-width', String(width));
      } else {
        setRightRailWidth(width);
        localStorage.setItem('spokeui:right-rail-width', String(width));
      }
    };
    const stop = () => {
      setResizingRail(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  function chooseViewport(preset: ViewportPreset) {
    setViewportPreset(preset);
    setViewportMenuOpen(false);
    localStorage.setItem('spokeui:viewport', preset);
  }

  function chooseSessionModel(model: string) {
    setSessionModel(model);
    localStorage.setItem(`spokeui:${agentRuntime}-model`, model);
  }

  function chooseAgentRuntime(runtime: AgentRuntime) {
    setAgentRuntime(runtime);
    localStorage.setItem('spokeui:agent-runtime', runtime);
    setSessionModel(storedModel(runtime));
    const result = runtimes.find((item) => item.id === runtime);
    setRuntimeState(result?.available
      ? { phase: 'ready', name: result.name, message: 'Runtime ready' }
      : { phase: 'missing', name: result?.name || 'Agent runtime', message: result?.error || 'Runtime unavailable' });
  }

  function chooseReasoningEffort(effort: ReasoningEffort) {
    setReasoningEffort(effort);
    localStorage.setItem('spokeui:reasoning-effort', effort);
  }

  async function removeTarget(selector?: string) {
    setSelections((current) => selector === undefined ? [] : current.filter((item) => item.selector !== selector));
    await window.appApi.preview.removeTarget(selector);
  }

  function suggestChange(property: string, value: string) {
    setInstruction(`Change the selected element’s ${property}. It is currently ${value || 'unset'}. `);
  }

  async function cleanupMicrophone() {
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = null;
    await audioContext.current?.close();
    audioContext.current = null;
  }

  async function acquireMicrophone() {
    setMicrophoneBusy(true);
    try {
      const permission = await window.appApi.voice.requestPermission();
      setMicrophonePermission(permission);
      if (permission === 'denied' || permission === 'restricted') {
        throw new Error('Microphone access is blocked. Allow SpokeUI in System Settings → Privacy & Security → Microphone.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      setMicrophonePermission('granted');
      return stream;
    } catch (error) {
      if ((error as DOMException).name === 'NotAllowedError') setMicrophonePermission('denied');
      throw error;
    } finally {
      setMicrophoneBusy(false);
    }
  }

  async function requestMicrophoneAccess() {
    setVoiceState({ phase: 'connecting', message: 'Requesting microphone access…' });
    try {
      const stream = await acquireMicrophone();
      stream.getTracks().forEach((track) => track.stop());
      setVoiceState({ phase: 'idle', message: '' });
    } catch (error) {
      setVoiceState({ phase: 'error', message: (error as Error).message || 'Microphone access could not be enabled.' });
    }
  }

  async function runAgentRequest(requestText: string, targets: ElementSnapshot[], debugAction?: DebugAction) {
    if (!requestText.trim() || !project || working || runtimeState.phase !== 'ready') {
      if (debugAction) {
        const message = !project ? 'Open a project before asking the agent.' : working ? 'Wait for the current agent request to finish.' : runtimeState.message;
        await window.appApi.preview.showMessage('Agent unavailable', message);
      }
      return;
    }
    setTaskState({ phase: 'queued', message: 'Preparing the edit request…' });
    setActivity((current) => [...current, { id: createSessionId(), tone: 'request', text: requestText, at: Date.now() }]);
    setWorkspaceView('preview');
    try {
      await window.appApi.runtime.run({ runtime: agentRuntime, projectRoot: project.root, instruction: requestText, url: previewUrl, target: targets.at(-1) ?? null, targets, model: sessionModel, reasoningEffort, debugAction });
      if (!debugAction) setInstruction('');
    } catch (error) {
      if (debugAction) await window.appApi.preview.showMessage('Agent request failed', (error as Error).message || 'The request could not be completed.');
      setTaskState((current) => current.phase === 'error' ? current : {
        phase: 'error',
        message: (error as Error).message || 'The edit request could not be completed.',
      });
    }
  }

  async function applyInstruction() {
    await runAgentRequest(instruction.trim(), [...selections]);
  }

  useEffect(() => window.appApi.onPreviewDebugAction((input: PreviewDebugAction) => {
    setSelections([input.target]);
    void runAgentRequest(debugPrompts[input.action], [input.target], input.action);
  }), [project, working, runtimeState.phase, previewUrl, agentRuntime, sessionModel, reasoningEffort]);

  async function startRecording() {
    if (recording) return;
    voiceRequested.current = true;
    if (!assemblyKey.trim()) {
      setSettingsOpen(true);
      setInspectorCollapsed(false);
      setVoiceState({ phase: 'error', message: 'Add an AssemblyAI API key to enable voice input.' });
      return;
    }
    setVoiceState({ phase: 'connecting', message: 'Requesting microphone access…' });
    try {
      const stream = await acquireMicrophone();
      if (!voiceRequested.current) {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceState({ phase: 'idle', message: '' });
        return;
      }
      const context = new AudioContext();
      await context.audioWorklet.addModule(new URL('./pcm-worklet.js', document.baseURI).href);
      if (!voiceRequested.current) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
        setVoiceState({ phase: 'idle', message: '' });
        return;
      }
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'pcm-processor');
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => window.appApi.voice.sendAudio(event.data);
      source.connect(worklet);
      worklet.connect(context.destination);
      await context.resume();
      mediaStream.current = stream;
      audioContext.current = context;
      await window.appApi.voice.start(assemblyKey.trim(), context.sampleRate);
    } catch (error) {
      voiceRequested.current = false;
      await cleanupMicrophone();
      setVoiceState({ phase: 'error', message: (error as Error).message || 'Voice input could not start.' });
    }
  }

  async function stopRecording() {
    voiceRequested.current = false;
    if (!mediaStream.current && !audioContext.current) return;
    setVoiceState({ phase: 'finalizing', message: 'Finishing transcript…' });
    await cleanupMicrophone();
    await window.appApi.voice.stop();
  }

  useEffect(() => {
    if (settingsOpen || wizardOpen || renamingProject) return;
    const editable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName || ''));
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || editable(event.target)) return;
      event.preventDefault();
      void startRecording();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || editable(event.target)) return;
      event.preventDefault();
      void stopRecording();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, [settingsOpen, wizardOpen, renamingProject, recording, assemblyKey]);

  const treeNodes = selection
    ? [{ tag: 'page', id: null, classes: [] }, ...selection.ancestry.slice().reverse().filter((node) => node.tag !== 'html')]
    : [{ tag: 'page', id: null, classes: [] }, { tag: 'body', id: null, classes: [] }];
  const voiceReady = microphonePermission === 'granted' && Boolean(assemblyKey.trim());
  const voiceActionLabel = voiceState.phase === 'connecting'
    ? 'Connecting voice…'
    : voiceState.phase === 'listening'
      ? 'Listening…'
      : voiceState.phase === 'finalizing'
        ? 'Finishing transcript…'
        : voiceState.phase === 'error'
          ? 'Voice needs attention'
          : 'Hold to speak';
  const voiceActionDetail = voiceState.message
    || (!assemblyKey.trim()
      ? 'Add your AssemblyAI key to start'
      : microphonePermission !== 'granted'
        ? 'Microphone access is requested on first use'
        : 'Release when your edit request is complete');
  const runtimeStatusLabel = working
    ? taskState.phase === 'queued' ? 'Request queued' : 'Agent working'
    : runtimeState.message;
  const projectPageCount = Math.max(1, Math.ceil(projects.length / projectsPerPage));
  const visibleProjects = projects.slice(projectPage * projectsPerPage, (projectPage + 1) * projectsPerPage);
  const visibleProjectStart = projects.length ? projectPage * projectsPerPage + 1 : 0;
  const visibleProjectEnd = Math.min(projects.length, (projectPage + 1) * projectsPerPage);
  const modelOptions = agentRuntime === 'claude' ? claudeModels : codexModels;
  const currentChanges = project ? changeHistory.filter((change) => change.projectRoot === project.root) : [];
  const pendingChanges = currentChanges.filter((change) => change.status === 'pending' || change.status === 'running').length;

  return (
    <div
      className={`workspace-shell ${inspectorCollapsed ? 'inspector-collapsed' : ''} ${resizingRail ? 'is-resizing' : ''}`}
      style={{ '--left-rail-width': `${leftRailWidth}px`, '--right-rail-width': `${rightRailWidth}px` } as React.CSSProperties}
    >
      <header className="titlebar">
        <div className="titlebar-left">
          <button className="app-button" onClick={() => { setSettingsOpen(false); setViewportMenuOpen(false); setWorkspaceView('projects'); }} aria-label="Manage projects" title="Manage projects"><img src={appIconUrl} alt="" /></button>
          <button className="project-switcher" onClick={() => setWorkspaceView('projects')} title="Manage and switch projects"><strong>{project?.name || 'Local project'}</strong><span>{project ? shortPath(project.root) : 'Choose a project folder'}</span><ChevronDown size={14} /></button>
        </div>
        <div className="titlebar-right">
          <button className={`voice-status-pill ${recording ? 'active' : voiceReady ? 'ready' : ''}`} onClick={() => { setViewportMenuOpen(false); setInspectorCollapsed(false); setSettingsOpen(true); }}>
            <Mic size={13} />
            {recording ? 'Listening' : voiceReady ? 'Voice ready' : 'Set up voice'}
          </button>
          <span className="runtime-status" title={working ? taskState.message : runtimeState.name}>
            <span className={`dot ${working ? 'working' : runtimeState.phase === 'ready' ? '' : 'warning'}`} />
            {runtimeStatusLabel}
          </span>
          {inspectorCollapsed && <button className="inspector-title-toggle" onClick={() => setInspectorCollapsed(false)}><PanelRight size={14} /> Inspector</button>}
          <button className={`icon-button ${settingsOpen ? 'active' : ''}`} onClick={() => { setViewportMenuOpen(false); setInspectorCollapsed(false); setSettingsOpen(!settingsOpen); }} aria-label="Connections" aria-pressed={settingsOpen}><Settings2 size={16} /></button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="left-rail">
          <div className="resize-handle resize-handle-right" role="separator" aria-label="Resize navigator" aria-orientation="vertical" onPointerDown={(event) => resizeRail('left', event)} onDoubleClick={() => { setLeftRailWidth(230); localStorage.setItem('spokeui:left-rail-width', '230'); }}><GripVertical size={12} /></div>
          <div className="rail-section">
            <span className="rail-label">Workspace</span>
            <button className={`rail-row ${workspaceView === 'preview' ? 'active' : ''} state-${previewState.phase}`} onClick={() => setWorkspaceView('preview')} aria-pressed={workspaceView === 'preview'}><Globe2 size={16} /><strong>Preview</strong></button>
            <button className={`rail-row ${workspaceView === 'terminal' ? 'active' : ''} state-${projectState.phase}`} onClick={() => setWorkspaceView('terminal')} aria-pressed={workspaceView === 'terminal'}><Command size={16} /><strong>Terminal</strong></button>
            <button className={`rail-row session-rail-row ${workspaceView === 'session' ? 'active' : ''}`} onClick={() => setWorkspaceView('session')} aria-pressed={workspaceView === 'session'}><Radio size={16} /><strong>Session</strong>{working && <span className="rail-live-dot" title="Agent working" />}</button>
            <button className={`rail-row ${workspaceView === 'projects' ? 'active' : ''}`} onClick={() => setWorkspaceView('projects')} aria-pressed={workspaceView === 'projects'}><Folders size={16} /><strong>Projects</strong></button>
          </div>
          <div className="rail-section grow">
            <span className="rail-label">Navigator</span>
            <div className="page-tree" role="tree" aria-label="Selected element hierarchy">
              {treeNodes.map((node, index) => {
                const selectedNode = Boolean(selection) && index === treeNodes.length - 1;
                const nodeLabel = [node.tag === 'page' ? 'Page' : `<${node.tag}>`, node.id ? `#${node.id}` : '', ...node.classes.map((name) => `.${name}`)].filter(Boolean).join(' ');
                return <div key={`${node.tag}-${node.id || ''}-${index}`} className={`tree-row ${selectedNode ? 'selected' : ''}`} style={{ '--tree-depth': Math.min(index, 5) } as React.CSSProperties} role="treeitem" aria-selected={selectedNode} title={nodeLabel}>
                  <span className="tree-guide" />
                  {node.tag === 'page' ? <ChevronDown size={13} /> : selectedNode ? <MousePointer2 size={13} /> : <Code2 size={13} />}
                  <span className="tree-node-copy"><code className="tree-tag">{node.tag === 'page' ? 'Page' : `<${node.tag}>`}</code>{node.id && <code className="tree-id">#{node.id}</code>}{node.classes.map((name) => <code className="tree-class" key={name}>.{name}</code>)}</span>
                </div>;
              })}
            </div>
          </div>
          <div className="rail-tip"><Inspect size={16} /><p>Click to select an element. {selectionHint}.</p></div>
        </aside>

        <main className="canvas-column">
          {workspaceView === 'preview' && <>
            <div className="browser-bar">
              <button className="icon-button compact" onClick={() => window.appApi.preview.back()} disabled={!project} aria-label="Back"><ArrowLeft size={15} /></button>
              <button className="icon-button compact" onClick={() => window.appApi.preview.reload()} disabled={!project} aria-label="Reload"><RefreshCw size={14} /></button>
              <div className="address"><Globe2 size={13} /><span>{previewUrl || 'Preview'}</span></div>
              <div className="viewport-control" ref={viewportControl}>
                {!viewportMenuOpen ? <button className="viewport" onClick={() => { setSettingsOpen(false); setViewportMenuOpen(true); }} aria-expanded={false} aria-haspopup="menu">
                  {viewportPreset === 'desktop' ? <Monitor size={14} /> : viewportPreset === 'tablet' ? <Tablet size={14} /> : <Smartphone size={14} />}
                  {viewportPreset === 'desktop' ? 'Desktop' : viewportPreset === 'tablet' ? 'Tablet' : 'Mobile'} <ChevronDown size={12} />
                </button> : <div className="viewport-menu" role="menu" aria-label="Preview size">{viewportOptions.map((option) => <button key={option.id} className={viewportPreset === option.id ? 'active' : ''} onClick={() => chooseViewport(option.id)} role="menuitem" title={`${option.label} · ${option.detail}`}><span>{option.icon}</span><strong>{option.label}</strong>{viewportPreset === option.id && <Check size={11} />}</button>)}</div>}
              </div>
              <button className={`preview-changes-button ${pendingChanges ? 'pending' : ''}`} onClick={() => void window.appApi.preview.showChanges(project?.root)} disabled={!project} title="Open component history"><History size={14} /><span>Changes</span>{pendingChanges > 0 && <em>{pendingChanges}</em>}</button>
              <button className="icon-button compact" onClick={() => void window.appApi.preview.openExternal()} disabled={!previewUrl.startsWith('http')} aria-label="Open preview in default browser"><ExternalLink size={14} /></button>
            </div>
            <div className={`preview-stage viewport-${viewportPreset}`}><div className="preview-slot" ref={previewSlot}>
              {!project && <div className="workspace-empty">
                <Monitor size={26} aria-hidden="true" />
                <h2>No preview open</h2>
                <p>Open a project to see your app here and start making changes.</p>
                <div className="empty-state-actions">
                  <button className="new-session-button" onClick={() => void openExisting()}><FolderOpen size={14} /> Open project</button>
                  <button className="quiet-action" onClick={() => setWizardOpen(true)}><Plus size={14} /> New project</button>
                </div>
              </div>}
            </div></div>
          </>}

          {workspaceView === 'terminal' && <>
            <div className="workspace-view-bar"><span><Command size={14} /> Terminal</span><button className="quiet-action" onClick={() => setProjectLogs('')}>Clear output</button></div>
            <section className="terminal-view"><pre>{projectLogs || 'Development server output will appear here.'}</pre></section>
          </>}

          {workspaceView === 'session' && <>
            <div className="workspace-view-bar"><span><Radio size={14} /> Session</span><button className="new-session-button" onClick={newSession} disabled={working} title={working ? 'Wait for the current request to finish' : 'Start a new session'}><Plus size={13} /> New session</button></div>
            <section className="session-view">
              <header className="session-overview">
                <div><span className="session-kicker">Live agent activity</span><h2>{working ? 'Applying your request' : activity.length ? 'Session activity' : 'Ready for your first request'}</h2><p>Voice requests, agent reasoning summaries, responses, and completion states appear here in real time.</p></div>
                <span className={`session-state state-${taskState.phase}`}><span className="dot" />{working ? 'Working' : taskState.phase === 'error' ? 'Needs attention' : taskState.phase === 'complete' ? 'Complete' : 'Ready'}</span>
              </header>
              <div className="session-metadata">
                <div><span>Session ID</span><code>{sessionId}</code><button className="icon-button compact" onClick={() => void copySessionId()} aria-label="Copy session ID" title={sessionIdCopied ? 'Copied' : 'Copy session ID'}>{sessionIdCopied ? <Check size={13} /> : <Copy size={13} />}</button></div>
                <div><span>Started</span><strong>{sessionTime(sessionStartedAt)}</strong></div>
                <div><span>Project</span><strong>{project?.name || 'No project'}</strong></div>
                <div className="session-runtime-config">
                  <Bot size={14} />
                  <label>
                    <span>Runtime</span>
                    <span className="runtime-select">
                      <select value={agentRuntime} onChange={(event) => chooseAgentRuntime(event.target.value as AgentRuntime)} disabled={working || activity.length > 0} title={activity.length > 0 ? 'Start a new session to change the runtime' : 'Choose the agent runtime for this session'} aria-label="Agent runtime for this session">
                        <option value="codex">Codex</option>
                        <option value="claude">Claude Code</option>
                      </select>
                      <ChevronDown size={11} />
                    </span>
                  </label>
                  <label>
                    <span>Model</span>
                    <span className="runtime-select">
                      <select value={sessionModel} onChange={(event) => chooseSessionModel(event.target.value)} disabled={working || activity.length > 0} title={activity.length > 0 ? 'Start a new session to change the model' : `Choose the ${agentRuntime === 'claude' ? 'Claude Code' : 'Codex'} model for this session`} aria-label="Agent model for this session">{modelOptions.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select>
                      <ChevronDown size={11} />
                    </span>
                  </label>
                  <label>
                    <span>Reasoning</span>
                    <span className="runtime-select">
                      <select value={reasoningEffort} onChange={(event) => chooseReasoningEffort(event.target.value as ReasoningEffort)} disabled={working || activity.length > 0} title={activity.length > 0 ? 'Start a new session to change reasoning' : 'Choose the reasoning level for this session'} aria-label="Agent reasoning for this session">{reasoningOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select>
                      <ChevronDown size={11} />
                    </span>
                  </label>
                </div>
              </div>
              <div className="session-timeline" aria-live="polite">
                {activity.length === 0 ? <div className="empty-session"><Radio size={24} /><strong>No requests in this session</strong><p>Select an element, then hold Space and speak the change you want.</p></div> : activity.map((item) => {
                  const label = item.tone === 'request' ? 'Request' : item.tone === 'message' ? 'Agent response' : item.tone === 'complete' ? 'Complete' : item.tone === 'error' ? 'Error' : item.tone === 'queued' ? 'Queued' : 'Progress';
                  return <article className={`session-entry ${item.tone}`} key={item.id}>
                    <div className="session-entry-marker">{item.tone === 'request' ? <Mic size={14} /> : item.tone === 'complete' ? <Check size={14} /> : item.tone === 'error' ? <X size={14} /> : <Code2 size={14} />}</div>
                    <div><header><strong>{label}</strong><time>{sessionTime(item.at)}</time></header><p>{item.text}</p></div>
                  </article>;
                })}
                <div ref={sessionEnd} />
              </div>
            </section>
          </>}

          {workspaceView === 'projects' && <>
            <div className="workspace-view-bar"><span><Folders size={14} /> Projects</span><div className="project-manager-actions"><button className="quiet-action" onClick={() => void openExisting()}><FolderOpen size={13} /> Open existing</button><button className="new-session-button" onClick={() => canLeaveCurrentProject(null) && setWizardOpen(true)}><Plus size={13} /> New project</button></div></div>
            <section className="project-manager-view">
              <div className="project-manager-content">
                {projectsLoading ? <div className="manager-empty"><LoaderCircle className="spin" size={16} /> Loading projects…</div>
                  : projects.length === 0 ? <div className="workspace-empty"><FolderOpen size={26} aria-hidden="true" /><h2>No projects yet</h2><p>Open an existing project folder or create your first project to begin.</p><div className="empty-state-actions"><button className="new-session-button" onClick={() => void openExisting()}><FolderOpen size={14} /> Open project</button><button className="quiet-action" onClick={() => canLeaveCurrentProject(null) && setWizardOpen(true)}><Plus size={14} /> New project</button></div></div>
                  : <div className="workspace-project-list">{visibleProjects.map((item) => {
                  const current = item.root === project?.root;
                  return <article className={`workspace-project-row ${current ? 'current' : ''}`} key={item.id}>
                    <span className="project-glyph"><FolderOpen size={17} /></span>
                    <button className="workspace-project-open" onClick={() => !current && void launch(item)} disabled={current}><strong>{item.name}</strong><small>{parentDirectory(item.root)}</small></button>
                    {current && <span className="current-project-badge">Current</span>}
                    {!current && <button className="quiet-action" onClick={() => void launch(item)}>Open</button>}
                    <button className="icon-button" onClick={() => setRenamingProject(item)} aria-label={`Rename ${item.name}`}><Pencil size={14} /></button>
                    <button className="icon-button danger" onClick={() => void removeProject(item)} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button>
                  </article>;
                  })}</div>}
                {projectsError && <div className="inline-error project-manager-error" role="alert">{projectsError}</div>}
              </div>
              <nav className="project-pagination" aria-label="Project pages">
                <span>{visibleProjectStart}–{visibleProjectEnd} of {projects.length}</span>
                <strong>Page {projectPage + 1} of {projectPageCount}</strong>
                <div>
                  <button className="icon-button" onClick={() => setProjectPage((page) => Math.max(0, page - 1))} disabled={projectPage === 0} aria-label="Previous project page"><ChevronLeft size={15} /></button>
                  <button className="icon-button" onClick={() => setProjectPage((page) => Math.min(projectPageCount - 1, page + 1))} disabled={projectPage >= projectPageCount - 1} aria-label="Next project page"><ChevronRight size={15} /></button>
                </div>
              </nav>
            </section>
          </>}
        </main>

        <aside className="inspector-panel">
          <div className="resize-handle resize-handle-left" role="separator" aria-label="Resize inspector" aria-orientation="vertical" onPointerDown={(event) => resizeRail('right', event)} onDoubleClick={() => { setRightRailWidth(300); localStorage.setItem('spokeui:right-rail-width', '300'); }}><GripVertical size={12} /></div>
          <div className="panel-header"><span>{settingsOpen ? 'Connections' : 'Inspector'}</span><div className="panel-header-actions">{settingsOpen && <button className="icon-button compact" onClick={() => setSettingsOpen(false)} aria-label="Close connections"><X size={14} /></button>}<button className="icon-button compact" onClick={() => { setSettingsOpen(false); setInspectorCollapsed(true); }} aria-label="Hide inspector"><PanelRight size={14} /></button></div></div>
          <div className="inspector-scroll">
            {settingsOpen ? (
              <div className="connections-panel">
                <p className="connection-group-label">Voice input</p>
                <section className="connection-block microphone-block">
                  <span className="connection-name"><strong>Microphone</strong><small>Required for voice commands</small></span>
                  <em className={microphonePermission === 'granted' ? 'ready' : microphonePermission === 'denied' || microphonePermission === 'restricted' ? 'error' : 'checking'}>
                    {microphonePermission === 'granted' ? 'Allowed' : microphonePermission === 'denied' || microphonePermission === 'restricted' ? 'Blocked' : 'Permission needed'}
                  </em>
                  <button className="secondary-button microphone-access" disabled={microphoneBusy || microphonePermission === 'granted'} onClick={() => void requestMicrophoneAccess()}>
                    {microphoneBusy ? <LoaderCircle className="spin" size={14} /> : <Mic size={14} />}
                    {microphonePermission === 'granted' ? 'Microphone ready' : 'Allow microphone'}
                  </button>
                  {(microphonePermission === 'denied' || microphonePermission === 'restricted') && <p className="connection-help error">Enable SpokeUI in System Settings → Privacy & Security → Microphone.</p>}
                </section>
                <section className="api-key-block">
                  <label>AssemblyAI API key<input type="password" value={assemblyKey} onChange={(event) => { setAssemblyKey(event.target.value); if (voiceState.phase === 'error') setVoiceState({ phase: 'idle', message: '' }); }} placeholder="Enter API key" /></label>
                  <p className={`connection-help ${keySaveState === 'error' ? 'error' : ''}`}>{keySaveState === 'saving' ? 'Saving securely…' : keySaveState === 'saved' ? 'Saved securely on this device.' : keySaveState === 'error' ? 'The key could not be saved. Try entering it again.' : 'Enter a key once to save it securely on this device.'}</p>
                </section>
                <p className="connection-group-label">Edit execution</p>
                {runtimes.map((runtime) => <section className="connection-block" key={runtime.id}>
                  <span className="connection-name"><strong>{runtime.name}</strong><small>{runtime.version || runtime.error}</small></span>
                  <em className={runtime.available ? 'ready' : 'missing'}>{runtime.available ? 'Ready' : 'Unavailable'}</em>
                </section>)}
              </div>
            ) : selections.length > 1 ? (
              <section className="inspector-section multi-selection">
                <h3>{selections.length} elements selected</h3>
                <p className="selection-hint">{selectionHint}. Your request applies to all selected elements.</p>
                {selections.map((item, index) => <div className="selected-target-row" key={item.selector}>
                  <span>{index + 1}</span><code title={item.selector}>{item.selector}</code>
                  <button aria-label={`Remove ${item.selector} from selection`} onClick={() => void removeTarget(item.selector)}><X size={14} /></button>
                </div>)}
                <button className="clear-targets" onClick={() => void removeTarget()}>Clear selection</button>
              </section>
            ) : selection ? (
              <>
                <section className="inspector-section selection-section"><SelectionSummary selection={selection} /><p className="selection-hint">{selectionHint}</p></section>
                <section className="inspector-section"><h3>Layout</h3>{['display', 'width', 'height', 'padding', 'gap'].map((key) => <PropertyRow key={key} label={key} value={selection.styles[key]} onUse={() => suggestChange(key, selection.styles[key])} />)}</section>
                <section className="inspector-section"><h3>Appearance</h3>{['color', 'background-color', 'border-radius'].map((key) => <PropertyRow key={key} label={key} value={selection.styles[key]} onUse={() => suggestChange(key, selection.styles[key])} />)}</section>
                <section className="inspector-section"><h3>Type</h3>{['font-size', 'font-weight'].map((key) => <PropertyRow key={key} label={key} value={selection.styles[key]} onUse={() => suggestChange(key, selection.styles[key])} />)}</section>
              </>
            ) : (
              <div className="empty-inspector"><Inspect size={22} /><strong>No element selected</strong><p>Hover over the live preview, then click the element you want to edit. {selectionHint}.</p></div>
            )}
          </div>
        </aside>
      </div>

      <section className="command-dock">
        <div className={`voice-composer ${recording ? 'recording' : ''} ${voiceState.phase === 'error' ? 'voice-error' : ''}`}>
          <div className="voice-primary-wrap">
            <button className={`voice-orb ${recording ? 'active' : ''}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void startRecording(); }} onPointerUp={() => void stopRecording()} onPointerCancel={() => void stopRecording()} aria-label={`${voiceActionLabel}. ${voiceActionDetail}`} title={`${voiceActionLabel} · ${voiceActionDetail}`} aria-pressed={recording}>
              <span className="voice-orb-core"><span className="voice-bars" aria-hidden="true"><i /><i /><i /></span><Mic size={20} /></span>
            </button>
          </div>
          <div className={`text-composer ${selections.length ? 'has-targets' : ''}`}>
            {selections.length > 0 && <div className="target-chips" aria-label={`${selections.length} selected elements`}>
              {selections.map((item, index) => <div className="target-chip" key={item.selector} title={item.selector}><Inspect size={13} /><span>{selections.length > 1 ? `${index + 1} · ` : ''}&lt;{item.tag}&gt;{item.id ? `#${item.id}` : ''}</span><button onClick={() => void removeTarget(item.selector)} aria-label={`Remove ${item.selector} from selection`}><X size={12} /></button></div>)}
            </div>}
            <label className="transcript-field">
              <textarea
                aria-label="Edit request transcript"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void applyInstruction();
                  }
                }}
                placeholder={project ? 'Your spoken request appears here…' : 'Open a project to make source changes…'}
                rows={1}
              />
            </label>
            <button className="send-button" disabled={!project || !instruction.trim() || working || runtimeState.phase !== 'ready'} onClick={() => void applyInstruction()} aria-label="Apply transcript with agent runtime">{working ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}</button>
          </div>
        </div>
      </section>

      {wizardOpen && <NewProjectDialog onClose={() => setWizardOpen(false)} onCreated={(next, brief) => void finishNewProject(next, brief)} />}
      {renamingProject && <RenameProjectDialog project={renamingProject} onClose={() => setRenamingProject(null)} onRenamed={(next) => { setRenamingProject(null); setProjects((items) => items.map((item) => item.id === next.id ? next : item)); if (project?.root === next.root) setProject(next); }} />}
      {pendingChangesPromptOpen && project && <PendingChangesDialog projectName={project.name} count={changeHistory.filter((change) => change.projectRoot === project.root && (change.status === 'pending' || change.status === 'running')).length} onClose={() => setPendingChangesPromptOpen(false)} onReview={reviewPendingChanges} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
