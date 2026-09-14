# Templates and design guidance

## Template contract

A user-facing template combines a runnable starter, a design pack, an actual preview and generation guidance. The spoken brief supplies the app's purpose and behavior; Codex implements it in the starter's codebase.

V1 starters: Landing page, Dashboard, App shell and Blank. Use a tested React/TypeScript/Vite base. Existing projects retain their own stack and design system.

Offer a small set of tested visual directions, such as restrained/productive, expressive/editorial and warm/approachable. Keep layout structure distinct from colors and typography. Previews must match the shipped starter/design combination.

## Pack contents

- Stable ID/version, compatible starter IDs and provenance.
- Runnable scaffold, dependency lockfile and dev command.
- Thumbnail and real example route.
- Design guidance, token definitions and font/asset references.
- Layout, navigation, component-state and responsive rules.
- Relevant example components and focused quality checks.

Bundle reviewed, resolved packs inside the app. Users do not install design CLIs, Python scripts or skill packages. Pin upstream revisions and preserve applicable license/asset notices when incorporating material.

## Design references

| Reference | Use |
| --- | --- |
| [Hallmark](https://github.com/Nutlope/hallmark) | Composition, visual direction and keeping targeted component edits scoped |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | UX and stack-specific guidance, persistent project/page design rules |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) | Portable design documents and previewable reference systems |

Curate one coherent design pack from relevant guidance. Do not concatenate entire, potentially conflicting skill bodies. Brand analyses are references, not official brand documentation or content for the user's app.

## Project context

New projects contain:

```text
DESIGN.md              # design intent and references to actual style tokens
.ui-ide/
  project.json         # launch profile, starter/design versions, context paths
  brief.md             # purpose, users, requested behavior and scope
  pages/               # optional page-specific design overrides
```

Keep actual styling tokens in the application's style system. DESIGN.md explains intent and points to those sources; synchronize it when global design decisions change. Explicitly provide its location to Codex. The filename alone does not cause an agent to read it.

Existing projects reuse DESIGN.md or equivalent documentation, repository instructions, tokens and component libraries. Store inferred context in application data without silently rewriting project instructions or creating competing design documents.

## Guidance during generation and edits

At creation, Codex receives the spoken brief, starter manifest, resolved design guidance, project path, repository instructions and launch/check commands.

For later edits, provide current intent, selected-element evidence, relevant source references and the applicable page/component constraints. Load only the necessary guidance. User intent and repository requirements remain authoritative.

A local request changes its selected scope. A request to change controls throughout the app can update shared components/tokens. Do not re-theme an app in response to a small edit. Preserve existing design decisions across sessions.

## Acceptance

Every shipped starter launches with its pinned dependencies. Previews reflect real output. Generated components use established tokens and conventions. Targeted edits preserve the surrounding design. Fixture data is labeled. Check layout and interactions at desktop and narrow viewport sizes.
