import { contextBridge, ipcRenderer } from 'electron';
import type { AgentChange, AppApi, ElementSnapshot, PreviewBounds, PreviewDebugAction, ProjectInfo, ProjectState, RuntimeEvent, StoredProject, VoiceEvent } from './shared';

const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: AppApi = {
  preview: {
    setBounds: (bounds: PreviewBounds) => ipcRenderer.invoke('preview:set-bounds', bounds),
    show: (visible: boolean) => ipcRenderer.invoke('preview:show', visible),
    load: (url: string) => ipcRenderer.invoke('preview:load', url),
    back: () => ipcRenderer.invoke('preview:back'),
    reload: () => ipcRenderer.invoke('preview:reload'),
    openExternal: () => ipcRenderer.invoke('preview:open-external'),
    showChanges: (projectRoot) => ipcRenderer.invoke('preview:show-changes', projectRoot),
    showMessage: (title, text) => ipcRenderer.invoke('preview:show-message', { title, text }),
  },
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    chooseExisting: () => ipcRenderer.invoke('project:choose-existing'),
    createNew: (input) => ipcRenderer.invoke('project:create-new', input),
    rename: (id, name) => ipcRenderer.invoke('project:rename', { id, name }),
    remove: (id) => ipcRenderer.invoke('project:remove', id),
    launch: (project: ProjectInfo) => ipcRenderer.invoke('project:launch', project),
  },
  runtime: {
    detect: () => ipcRenderer.invoke('runtime:detect'),
    run: (request) => ipcRenderer.invoke('runtime:run', request),
  },
  changes: {
    list: (projectRoot) => ipcRenderer.invoke('change:list', projectRoot),
    accept: (id) => ipcRenderer.invoke('change:accept', id),
    reject: (id) => ipcRenderer.invoke('change:reject', id),
  },
  voice: {
    getDefaultKey: () => ipcRenderer.invoke('voice:get-default-key'),
    saveApiKey: (apiKey) => ipcRenderer.invoke('voice:save-api-key', apiKey),
    getPermission: () => ipcRenderer.invoke('voice:get-permission'),
    requestPermission: () => ipcRenderer.invoke('voice:request-permission'),
    start: (apiKey, sampleRate) => ipcRenderer.invoke('voice:start', { apiKey, sampleRate }),
    sendAudio: (chunk) => ipcRenderer.send('voice:audio', chunk),
    stop: () => ipcRenderer.invoke('voice:stop'),
  },
  onElementSelected: (callback: (snapshot: ElementSnapshot) => void) => subscribe('preview:element-selected', callback),
  onPreviewState: (callback) => subscribe('preview:state', callback),
  onProjectState: (callback: (state: ProjectState) => void) => subscribe('project:state', callback),
  onProjectsChanged: (callback: (projects: StoredProject[]) => void) => subscribe('projects:changed', callback),
  onProjectLog: (callback: (line: string) => void) => subscribe('project:log', callback),
  onRuntimeEvent: (callback: (event: RuntimeEvent) => void) => subscribe('runtime:event', callback),
  onChangeUpdated: (callback: (change: AgentChange) => void) => subscribe('change:updated', callback),
  onPreviewDebugAction: (callback: (action: PreviewDebugAction) => void) => subscribe('preview:debug-action', callback),
  onVoiceEvent: (callback: (event: VoiceEvent) => void) => subscribe('voice:event', callback),
};

contextBridge.exposeInMainWorld('appApi', api);
