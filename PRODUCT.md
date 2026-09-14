# SpokeUI product specification

Register: product.

## Purpose

A local UI workspace where users build, fix and refine web frontends by speaking and interacting with the running interface. Users create a project from a visual template or open an existing codebase. A connected agent runtime edits source files and the embedded browser displays the result live.

One desktop application. Codex and Claude Code are supported local harnesses. AssemblyAI provides speech transcription. Typing is optional; initial authentication and project credentials may still require setup.

## New project

New project → Choose template → Speak app brief → Choose location and connect an agent runtime → Build and launch → Live workspace.

1. Show real previews for Landing page, Dashboard, App shell and Blank starters. Allow a compatible visual direction to be selected with the template.
2. Capture the app's purpose, users and essential behavior through speech. Suggest a name and reasonable defaults; clarify only blocking omissions.
3. Use a native folder picker and a new or empty project directory. Reuse an authenticated local agent connection when available.
4. Create the runnable starter, project brief and DESIGN.md. Prepare dependencies and start its development server.
5. The selected agent implements the brief in runnable increments. Show the actual preview as soon as it starts, with clear build progress.
6. Enter the shared editing workspace. The user can continue refining the app through voice and visual controls.

New starters use React, TypeScript and Vite. Their initial content and fixture data must be distinguishable from finished generated features or production integrations.

## Existing project

Open existing project → Select codebase → Connect an agent runtime → Discover and launch app → Live workspace.

1. Inspect repository instructions, manifests, lockfiles, workspace structure and existing changes.
2. Start a local agent session scoped to the project.
3. Detect the runnable frontend, command and URL. Select a sole app automatically; ask which app to use when a repository contains several.
4. Launch the development server in the correct directory or attach an already-running URL.
5. Record routes, component/style locations and design conventions with supporting source references.
6. Open the running frontend for editing.

Preserve the project's framework, components, design documentation, tokens and instructions. Opening a project does not trigger a redesign. Show actionable recovery for missing dependencies, environment configuration, occupied ports and failed starts. Only stop processes launched by this IDE.

## Shared workspace

| Surface | Controls |
| --- | --- |
| Toolbar | Project/page, back/reload, desktop/tablet/mobile viewport and preview status |
| Main area | Real embedded browser with element selection active by default |
| Inspector | Selected-element breadcrumb, scope, sizing, spacing and relevant properties |
| Voice/task area | Push-to-talk, transcript, progress, clarification and optional typing |
| Preview change tray | Component before/after, changed files, request history, Accept and Reject |

The browser is the primary surface. Hide the inspector when no target is selected. Source details expand on demand. Whole-page requests such as adding a settings page do not require element selection. Keyboard controls provide alternatives to dragging.

The navigator and inspector rails resize independently and remember their widths. The DOM navigator presents tag, ID and class metadata as separate values. SVG child shapes resolve to their meaningful icon root so small controls remain easy to target.

## Editing loop

Select or choose page scope → Speak/drag/resize/edit property → Capture context → Agent resolves source → Edit files → Live preview → Review → Accept or Reject.

Right-clicking a selected element opens direct visual debugging actions for source discovery, explanation, component debugging, network requests, console errors, state, accessibility and responsive behavior. Results remain over the Preview surface. The selected runtime receives recent browser evidence with the DOM snapshot.

Capture the selected target when the request begins. Combine finalized speech with the committed gesture and relevant project/design context. Distinguish verified source locations from candidates; the agent resolves ambiguity before editing. Shared-component changes need a clear scope.

Support width, height, padding, gap, font size, text/background color and border radius. Initial dragging supports sibling reordering in supported flex/grid layouts and repositioning already-positioned elements. Preserve units and responsive intent.

Show immediate temporary feedback while manipulating an element. Commit one request on gesture completion. Remove temporary overrides before verifying source-backed output. Source edits take agent/build time; temporary feedback is not evidence of completion.

Users answer clarifications by speech or clicking. Ordinary authorized edits do not require repeated confirmation screens; surface actual runtime permission requests when needed. Queue conflicting follow-ups. Stopping work does not automatically revert completed edits.

## State and recovery

Track request state, preview state and verification independently:

- Request: draft, listening, queued, working, needs answer, stopped, completed, failed.
- Preview: starting, running, rebuilding, disconnected, build error.
- Verification: not checked, checking, passed, failed, partly checked.

Preserve page state when possible; a full reload may reset it. Reconnect selection after rerenders or ask for reselection. Undo must preserve unrelated changes and expose overlapping-edit conflicts.

## Release acceptance

- A template and spoken brief produce a real runnable project visible during generation.
- An existing project launches and can be edited without a framework migration or imposed design system.
- Both flows use the same workspace and selected local agent context.
- Voice, property edits, resizing and supported dragging produce source changes visible live and surviving reload.
- Ambiguous source targets, launch/build failures, denied permissions and stale selections are recoverable.
- Changes and checks are reviewable; undo preserves unrelated work.

V1 excludes additional harnesses, cloud development environments, multiplayer, deployment, arbitrary canvas/native UI editing and production backend-service generation.
