# SpokeUI architecture and build plan

## Stack

| Area | Technology |
| --- | --- |
| Desktop | Electron and TypeScript, macOS first |
| Project browser | WebContentsView |
| IDE controls | React and CSS variables/modules |
| Browser inspection | Electron debugger bridge, Runtime binding and isolated page overlay |
| Visual editing | Isolated page overlay for handles and drop targets |
| Speech | AssemblyAI streaming STT over WebSocket |
| Agent | Installed Codex CLI (`codex exec --json`) or Claude Code CLI (`claude -p --output-format stream-json`) |
| Context tools | Typed IPC request payload; MCP context tools are the next transport layer |
| Build/package | Vite, Electron Forge, pnpm |
| Storage | Atomic local JSON project records; bounded request logs and screenshots are planned |

Pin compatible package versions during setup. Forge's Vite plugin is documented as experimental; verify it with the selected Electron version. Use CDP commands supported by that version's bundled Chromium.

## Process boundaries

The main process owns the embedded view, persistent project library, dev-server processes, local agent connections, review snapshots and AssemblyAI transport. The trusted React renderer owns the controls and microphone capture. A narrow, typed preload interface connects them.

The project page has no Node integration or filesystem bridge. Context isolation and sandboxing stay enabled. Credentials remain outside page scripts. Page content is task data, never trusted instructions. When the local MCP endpoint is added, make it authenticated, loopback-only and project-scoped, with origin checks.

WebContentsView is a native child view; React elements cannot simply paint over it. SpokeUI injects its isolated hover and selection overlay into the preview through a CDP runtime binding, and hides the native view while renderer-owned popovers are open. Keep toolbar and inspector outside its bounds. Test scrolling, zoom, display scaling and pointer capture. Recover when opening DevTools detaches the debugger.

## Project lifecycle

Materialize reviewed starter files for new projects and supply the brief/design pack to Codex. For existing projects, discover the app root, package manager, launch command, routes, instructions and style/component locations. Preserve its conventions. Invalidate affected project-map entries after source changes.

Start the selected dev command or attach an existing URL. Monitor server readiness and logs; a file change alone does not establish a successful build. Handle missing dependencies/configuration and occupied ports without inventing credentials. Stop only IDE-owned processes.

The embedded browser loads the real dev-server URL. Keep it mounted for existing HMR/refresh behavior. Fall back to a controlled reload when necessary, making transient-state loss explicit. External editor file changes should appear through the same mechanism.

## Context and requests

Each request stores an ID, project/thread ID, page revision, URL, finalized instruction, target snapshot, relevant DOM ancestry/text, computed styles, geometry, viewport, screenshot reference and optional visual change. Attach the relevant design constraints and verified/candidate source references.

Use CDP inspection to select a node and collect bounded evidence. Node IDs and selectors become stale after navigation/rerender; re-resolve and check uniqueness. DOM evidence narrows source discovery but does not guarantee component-to-file mapping.

A resize captures dimensions and units. Reordering captures sibling identities and intended order. Codex translates these into the project's layout system rather than blindly applying absolute positions. Coalesce gesture events into one committed intent and preserve original context before temporary overrides.

One active agent writer per project. Persist request ownership and recovery state; detect external edits. Clear temporary previews before evaluating the real source result. Do not treat a successful agent exit as verified application behavior.

## Agent connections

The app detects Codex and Claude Code independently and uses each CLI's existing local authentication. It launches the chosen model and reasoning level with an explicit project working directory. Each request includes the current URL, finalized instruction, selected-element snapshot and optional browser debugging evidence. The selected harness reads repository instructions and edits the real project files.

Move the runner to app-server when persistent project threads, steering, cancellation and permission requests are added. App-server will start and resume turns while MCP supplies live browser context and tools. No separate bridge application is installed.

Normalize started, message, tool, permission-required, awaiting-user, completed and failed events. Clarifications resume the exact pending request/thread. Do not depend on MCP notifications waking an idle agent or unlimited pending tool calls.

## Internal MCP tools

| Planned tool | Purpose |
| --- | --- |
| get_request | Read captured intent and target context |
| get_page_context | Read current bounded DOM/style context |
| capture_preview | Capture the actual embedded page |
| get_console_errors | Read relevant runtime errors |
| ask_user / get_answer | Exchange request-scoped clarification |
| report_progress / report_result | Return progress, changed files and check evidence |

The app dispatches explicit request IDs to the selected local harness and owns the review transaction.

## Voice

Capture audio in the trusted renderer with Web Audio/AudioWorklet. Convert to a supported format, initially mono PCM16, and match the AssemblyAI sample rate to actual output. Forward bounded chunks to the main-process WebSocket connection.

Use push-to-talk with an editable transcript. Accumulate all turns in the recording session. Release marks submission intent; finalized transcription is required before dispatch. Session/request IDs prevent duplicate edits after reconnects. Partial transcripts are display-only. Verify current model and endpointing settings during integration.

Bind speech to the target captured at recording time. Spoken clarification answers continue the pending task. Known project terms can improve transcription. Speech synthesis is not required for v1.

## Verification and undo

Track agent completion, preview readiness and verification separately. Remove temporary overrides and inspect source-backed output. Screenshots verify appearance at a given viewport; behavior needs appropriate functional checks. Report failed builds and incomplete checks honestly.

Record pre-task file state, including dirty and untracked files, and associate changes with the request. Undo uses checked reverse patches or snapshots/content hashes. If later changes overlap, expose a conflict rather than overwriting. Never reset the repository to undo a single request.

## Code layout

One package and lockfile:

```text
src/
  main/          # window, embedded view, process lifecycle
  preload/       # validated IPC
  renderer/      # controls and audio capture
  inspection/    # CDP context, selection, overlay, gestures
  voice/         # AssemblyAI and transcript state
  codex/         # Codex runner and normalized events
  mcp/           # planned tools and local transport
  requests/      # queue, persistence, snapshots and undo
  projects/      # onboarding, project map, launch and readiness
  templates/     # starter materialization and design guidance
  shared/        # types and runtime schemas
tests/
  fixtures/
  integration/
```

## Implementation milestones

1. Embed a local fixture, select elements, inspect styles/screenshots and validate overlay coordinates and isolation.
2. Send a selected-element request to Codex, persist a source edit and observe the live update.
3. Add AssemblyAI speech, finalization, cancellation and a clarification round trip.
4. Add property editing, resize and supported drag/reorder operations that survive reload.
5. Complete template generation and existing-project discovery/launch flows. Validate React/Vite and plain HTML/CSS projects.
6. Complete recovery, conflict-aware undo, failed-build handling, packaging and a repeatable demo of both flows.

Focused checks cover ambiguous targets, stale nodes, preview cleanup, durable source edits, live updates, preserved dirty changes, denied tools, duplicate speech events and both onboarding flows. A working browser shell alone is not the first milestone; the first milestone includes a real Codex edit visible in the browser.

## Implementation references

- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron debugger](https://www.electronjs.org/docs/latest/api/debugger)
- [Electron isolation](https://www.electronjs.org/docs/latest/tutorial/security)
- [Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [CDP overlay](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [MCP SDK](https://modelcontextprotocol.io/docs/sdk)
- [Codex app-server](https://developers.openai.com/codex/app-server)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [AssemblyAI streaming](https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio)
- [AssemblyAI transcript events](https://www.assemblyai.com/docs/streaming/message-sequence)
