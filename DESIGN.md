# SpokeUI design system

## Scene

A founder or frontend developer sits at a large display during a focused build session. The running product must remain visually dominant while the IDE quietly exposes selection, voice, agent progress, and precise layout controls around it.

## Direction

Use a restrained light workspace with softly warm neutrals and a sharp cobalt signal color. The interface should feel like a capable desktop tool: dense enough for real work, calm enough to disappear while the user studies their app.

## Tokens

- Canvas: `oklch(0.975 0.006 86)`
- Chrome: `oklch(0.945 0.008 86)`
- Raised surface: `oklch(0.995 0.003 86)`
- Ink: `oklch(0.23 0.012 258)`
- Muted ink: `oklch(0.52 0.015 258)`
- Hairline: `oklch(0.86 0.012 86)`
- Accent: `oklch(0.57 0.19 259)`
- Success: `oklch(0.58 0.14 151)`
- Warning: `oklch(0.70 0.14 76)`
- Error: `oklch(0.58 0.20 27)`

Use the system sans stack throughout. Labels are 12–13px, body text is 14px, and workspace titles are 16–18px. Use medium weight for hierarchy rather than oversized text.

Use 6px, 10px, 14px, 20px, and 28px as the main spacing rhythm. Controls use 8–10px radii. Panels may use subtle one-pixel borders and restrained shadows; avoid nested card styling.

## Interaction

- Selection uses the accent color and always has a visible focus state.
- Element selection is always active; avoid a redundant mode switch.
- Most transitions last 160–220ms and communicate state.
- The embedded product keeps most of the available canvas.
- Loading states show concrete milestones or skeletons.
- Every state has text or an icon plus text; never rely on color alone.
- Inspector controls retain native keyboard behavior and readable units.
