export interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementSnapshot {
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  selector: string;
  ancestry: ElementNodeSnapshot[];
  attributes: Record<string, string>;
  bounds: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}

export interface ElementNodeSnapshot {
  tag: string;
  id: string | null;
  classes: string[];
}

export interface ProjectInfo {
  root: string;
  name: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
  devScript: string | null;
  suggestedUrl: string;
}

export interface StoredProject extends ProjectInfo {
  id: string;
  addedAt: number;
  lastOpenedAt: number;
}

export type PreviewPhase = 'idle' | 'loading' | 'running' | 'error';

export interface PreviewState {
  phase: PreviewPhase;
  message: string;
  url?: string;
}

export type ProjectPhase = 'idle' | 'installing' | 'starting' | 'running' | 'stopped' | 'error';

export interface ProjectState {
  phase: ProjectPhase;
  message: string;
  url?: string;
}

export type TemplateId = 'saas' | 'portfolio' | 'dashboard';

export interface NewProjectInput {
  name: string;
  template: TemplateId;
  brief: string;
}

export interface RuntimeRequest {
  runtime: AgentRuntime;
  projectRoot: string;
  instruction: string;
  url: string;
  target: ElementSnapshot | null;
  targets?: ElementSnapshot[];
  model?: string;
  reasoningEffort?: ReasoningEffort;
  debugAction?: DebugAction;
  debugContext?: DebugContext;
}

export type AgentRuntime = 'codex' | 'claude';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type DebugAction = 'ask' | 'explain' | 'source' | 'debug' | 'network' | 'console' | 'state' | 'accessibility' | 'responsive';

export interface DebugConsoleEntry {
  level: string;
  text: string;
  timestamp: number;
}

export interface DebugNetworkEntry {
  method: string;
  url: string;
  status?: number;
  error?: string;
  timestamp: number;
}

export interface DebugContext {
  console: DebugConsoleEntry[];
  network: DebugNetworkEntry[];
}

export interface RuntimeEvent {
  type: 'queued' | 'status' | 'message' | 'error' | 'complete';
  text: string;
}

export interface RuntimeInfo {
  id: AgentRuntime;
  available: boolean;
  name: string;
  version?: string;
  error?: string;
}

export type ChangeStatus = 'running' | 'pending' | 'accepted' | 'rejected' | 'failed';

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface AgentChange {
  id: string;
  projectRoot: string;
  runtime: AgentRuntime;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  instruction: string;
  debugAction?: DebugAction;
  target: ElementSnapshot | null;
  targets?: ElementSnapshot[];
  createdAt: number;
  status: ChangeStatus;
  phase: string;
  beforeImage?: string;
  afterImage?: string;
  files: ChangedFile[];
  additions: number;
  deletions: number;
  response?: string;
  error?: string;
}

export interface PreviewDebugAction {
  action: DebugAction;
  target: ElementSnapshot;
}

export interface VoiceEvent {
  type: 'connecting' | 'listening' | 'partial' | 'final' | 'stopped' | 'error';
  text: string;
}

export type MicrophonePermission = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export interface AppApi {
  preview: {
    setBounds(bounds: PreviewBounds): Promise<void>;
    removeTarget(selector?: string): Promise<void>;
    show(visible: boolean): Promise<void>;
    load(url: string): Promise<void>;
    back(): Promise<void>;
    reload(): Promise<void>;
    openExternal(): Promise<void>;
    showChanges(projectRoot?: string): Promise<void>;
    showMessage(title: string, text: string): Promise<void>;
  };
  project: {
    list(): Promise<StoredProject[]>;
    chooseExisting(): Promise<StoredProject | null>;
    createNew(input: NewProjectInput): Promise<StoredProject | null>;
    rename(id: string, name: string): Promise<StoredProject>;
    remove(id: string): Promise<void>;
    launch(project: ProjectInfo): Promise<void>;
  };
  runtime: {
    detect(): Promise<RuntimeInfo[]>;
    run(request: RuntimeRequest): Promise<void>;
  };
  changes: {
    list(projectRoot?: string): Promise<AgentChange[]>;
    accept(id: string): Promise<AgentChange>;
    reject(id: string): Promise<AgentChange>;
  };
  voice: {
    getDefaultKey(): Promise<string>;
    saveApiKey(apiKey: string): Promise<void>;
    getPermission(): Promise<MicrophonePermission>;
    requestPermission(): Promise<MicrophonePermission>;
    start(apiKey: string, sampleRate: number): Promise<void>;
    sendAudio(chunk: ArrayBuffer): void;
    stop(): Promise<void>;
  };
  onElementSelected(callback: (snapshot: ElementSnapshot[]) => void): () => void;
  onPreviewState(callback: (state: PreviewState) => void): () => void;
  onProjectState(callback: (state: ProjectState) => void): () => void;
  onProjectsChanged(callback: (projects: StoredProject[]) => void): () => void;
  onProjectLog(callback: (line: string) => void): () => void;
  onRuntimeEvent(callback: (event: RuntimeEvent) => void): () => void;
  onChangeUpdated(callback: (change: AgentChange) => void): () => void;
  onPreviewDebugAction(callback: (action: PreviewDebugAction) => void): () => void;
  onVoiceEvent(callback: (event: VoiceEvent) => void): () => void;
}

declare global {
  interface Window {
    appApi: AppApi;
  }
}
