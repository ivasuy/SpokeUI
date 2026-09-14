# SpokeUI

A local desktop workspace for creating and refining web interfaces through speech and direct interaction. A connected agent runtime changes the source; the embedded browser shows the running result.

The first working milestone is implemented. It runs as a single Electron application and includes:

- New-project creation from a React/Vite starter
- Existing-project discovery, dependency installation and dev-server launch
- A persistent local project library with open, rename and remove controls
- A native embedded browser with element selection active by default
- Resizable navigator and inspector rails with locally persisted widths
- Desktop, tablet and mobile responsive-preview navigation
- A custom hover/selection overlay with precise SVG targeting and DOM context capture
- A contextual inspector for layout, appearance and type properties
- AssemblyAI streaming speech-to-text through push-to-talk
- A local agent runtime operating against the connected codebase
- Live component review in Preview with before/after captures, file totals, and Accept or Reject
- Element debugging from the preview context menu with DOM, console, and network evidence

## Download

Download the latest build from [GitHub Releases](https://github.com/ivasuy/SpokeUI/releases):

- macOS Apple Silicon: DMG or ZIP marked `arm64`
- macOS Intel: DMG or ZIP marked `x64`
- Windows: `SpokeUI Setup.exe` or the portable ZIP
- Debian/Ubuntu Linux: DEB or the portable ZIP

Release builds are currently unsigned. macOS may require right-clicking SpokeUI and choosing **Open** the first time; Windows may show a SmartScreen prompt.

SpokeUI runs projects on your machine. Install Node.js 22+ and at least one supported local agent runtime, [Codex](https://github.com/openai/codex) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code), before opening a project. The relevant CLI must be authenticated locally.

## Run from source

Requirements: Node.js 22+, pnpm 11+, and an authenticated Codex or Claude Code installation.

```bash
pnpm install
pnpm start
```

Copy `.env.example` to `.env` and set `ASSEMBLYAI_API_KEY`, or enter the key in Connections inside the workspace. The desktop app stores a key entered through Connections in Electron's encrypted local storage when operating-system encryption is available. Credentials and local settings are never committed.

To create the packaged application for your current platform:

```bash
pnpm package
```

To create the distributable installer/archive for your current platform:

```bash
pnpm make
```

Generated files are written below `out/` and are excluded from Git.

## Publishing a release

The repository includes a GitHub Actions release workflow for macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64. Push a semantic version tag to build the platform packages and attach them to a GitHub Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow can also be started manually from the Actions tab to verify every platform without publishing a release.

## Current interaction

Open a local project, hover over the custom element overlay and click a target. Selection is always available without a mode switch. The navigator displays the target’s tag, ID and classes separately within the DOM ancestry. Choose Desktop, Tablet or Mobile from the preview toolbar and drag either sidebar edge to adjust the workspace. Hold Space to speak the desired result, then apply it.

## Build specifications

- [Product and user flows](PRODUCT.md)
- [Architecture and implementation milestones](ARCHITECTURE.md)
- [Templates and design guidance](TEMPLATES.md)

## Open source

SpokeUI is available under the [MIT License](LICENSE). Contributions and focused bug reports are welcome through GitHub issues and pull requests.

SpokeUI includes Codex and Claude Code integrations, AssemblyAI speech, new-project creation, existing-project launch, visual selection, component history, visual debugging, and live preview. Direct drag, resize, and property mutation are the next editing layer.
