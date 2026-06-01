# backyard-flyer

Educational app for learning quadcopter control fundamentals through articles and a live coding sandbox where students read, run, and modify the actual control software.

## Tech Stack

| Layer | Technology |
|---|---|
| Primary framework | Astro 6 |
| Build tool | Vite (via Astro) |
| Package manager | pnpm |
| UI components | React 19 + TypeScript 6 (`client:only` islands via `@astrojs/react`) |
| MDX authoring | `@astrojs/mdx` — page content is `.mdx`; parsed server-side |
| Content routing | Hash-based SPA; single Astro route at `src/pages/pages.astro` |
| 3D rendering | Three.js 0.184 |
| Layout panels | react-resizable-panels 4 — **sizes must be strings** (`"20%"`); plain numbers are pixels |
| Timeseries charts | uPlot 1.6 |
| Testing | Vitest 4 + jsdom |
| Available (unused) | Zustand 5, json-edit-react 1 — installed, not yet wired up |

## Current Product Shape

- The app is a hash-routed reading + simulation workspace: each chapter page can expose `Chapter`, `Source`, `Blocks`, and `Visualization` tabs for the same underlying sim instance.
- Quadcopter models after `quad-l4` are built around a shared `src/sim/models/lib/quad/` block library. Model configs mostly wire shared blocks together and provide route/config overrides.
- `quad-noise` now uses the same shared quad stack as `quad-l4`, including shared `wind`, `noise`, `world`, and lifecycle validation; the model-specific logic is mostly configuration and visualization.
- Sim instances persist across tab switches on the same chapter. Navigating to a different chapter pauses the previous chapter's sim so only one chapter is active at a time without firing `afterSim`.

## Commands

```bash
pnpm install          # install deps
pnpm dev              # dev server → http://localhost:4321
pnpm build            # type-check + production build (output: dist/)
pnpm preview          # serve production build locally
pnpm test             # vitest watch mode
pnpm test:ui          # vitest browser UI
pnpm lint             # tsc --noEmit (type-check only)
```

## Project Layout

```
src/
  content/pages/                    # MDX page content (hash-routed)
    index.mdx
    Overview.mdx
    Backyard-Flyer/
      default.mdx                   # folder landing page; its `order` sets folder sort position
      Course-structure.mdx
    sim-demo/
      inc.mdx                       # simId: sim-demo/inc, modelId: inc
      floater.mdx                   # simId: sim-demo/floater, modelId: floater

  pages/
    index.astro                     # redirects to /pages
    pages.astro                     # SPA shell — server-renders all MDX, mounts PageShell island

  components/
    BlocksTab.tsx                   # Blocks tab — block graph / wiring view when page has a sim
    PageShell.tsx                   # hash router, three-panel layout, tab bar
    CollapsibleSidePanel.tsx        # IDE-style collapsible panel (left / right / bottom positions)
    CollapsibleSidePanel.module.css
    TableOfContents.tsx             # left panel — tree built from pageIds prop
    SourceTab.tsx                   # Source tab — renders SimSource if page has a sim
    VisualizationTab.tsx            # Vis tab — renders SimVis if page has a sim
    styles.css                      # app shell styles (tab bar, TOC, layout)

  sim/
    engine/
      types.ts                      # ModelState, BlockFn, BlockConfig, SceneHandler, ModelConfig
      engine.ts                     # core engine — init/start/pause/stop/reset/stage/revert/subscribe
      stripTypes.ts                 # regex TS→JS stripper used by stageBlock eval
    models/
      inc/
        blocks/inc.ts               # exports `l1(state): IncState`
        inc.config.ts
        inc.scene.ts                # CanvasTexture sprite showing current number
      floater/
        blocks/
          mission.ts                # waypoint sequencer; outputs targetX/Y/Z to state
          fc.ts                     # PD controller toward targetX/Y/Z; outputs ax/ay/az
          world.ts                  # Euler integration + gravity + ground bounce
        floater.config.ts
        floater.scene.ts            # Three.js scene; discovers waypoints from history
    registry.ts                     # { inc: incConfig, floater: floaterConfig }
    useSim.ts                       # resolveSimContext(simId, modelId?) — looks up registry, inits engine
    components/
      SimSource.tsx                 # tabbed code editor with stage/revert per block
      SimVis.tsx                    # Three.js canvas + rewind slider + start/pause/stop/reset controls
      SimBlocks.tsx                 # model block graph view used by BlocksTab
      SimCharts.tsx                 # uPlot time-series charts driven by varIds, chartId, or config
      SimStatePanel.tsx             # live flat key→value display of current model state
      sim.css                       # styles for all sim components

  styles/
    tokens.css                      # CSS custom properties (colors, fonts)
    global.css                      # imports tokens + typography
    typography.css                  # prose/chapter styles
```

## URL / Routing Convention

All routing is hash-based, handled client-side by `PageShell.tsx`.

| URL | Page | Tab |
|---|---|---|
| `/pages` or `/pages/#index` | `index.mdx` | Chapter |
| `/pages/#Overview` | `Overview.mdx` | Chapter |
| `/pages/#sim-demo/floater` | `sim-demo/floater.mdx` | Chapter |
| `/pages/#sim-demo/floater?view=src` | same | Source |
| `/pages/#sim-demo/floater?view=blocks` | same | Blocks |
| `/pages/#sim-demo/floater?view=vis` | same | Visualization |

`PageShell` parses `window.location.hash` on load and every `hashchange`. Format: `#<page-id>[?view=src|blocks|vis]`.

## Layout Architecture

```
┌─────────────┬────────────────────────────────────┬───────────────┐
│ Left        │ [Chapter] [Source] [Blocks] [Visualization] │ Right         │
│ (TOC)       ├────────────────────────────────────┤ (State)       │
│             │                                    │               │
│  collapsed  │   Tab content                      │  collapsed    │
│  bar when   │                                    │  by default   │
│  closed     ├────────────────────────────────────┤               │
│             │ Charts (bottom, vis tab only)       │               │
└─────────────┴────────────────────────────────────┴───────────────┘
```

- **Left** (`title="Table of Contents"`) — always visible, collapsible
- **Right** (`title="State"`) — shows live `SimStatePanel` for pages with a sim; collapsed by default
- **Bottom** (`title="Charts"`) — shows `SimCharts`; only rendered when `view === 'vis'`; open by default on vis tab
- All three are `CollapsibleSidePanel` instances with `position` prop (`left` | `right` | `bottom`)
- Left/right collapsed state: full-height clickable bar with rotated title text (IDE style)
- Bottom collapsed state: horizontal title bar with ∧/∨ toggle

The outer layout is `Group orientation="horizontal"` (left | main | right). Inside the main panel: `Group orientation="vertical"` (content panel | bottom panel).

## MDX Frontmatter

Each `.mdx` file can declare:

```yaml
---
order: 2                  # sort position within its folder (default: Infinity = last)
simId: sim-demo/floater   # unique engine instance key for this page
modelId: floater          # registry key — which model to load (must exist in registry.ts)
toc-name: My Name         # display label in the TOC (default: filename / folder name)
---
```

`simId` is the key passed to the engine (`initSim`, `subscribe`, etc.). It allows the same model to run as separate instances across pages. `modelId` selects the `ModelConfig` from `registry.ts`. If `modelId` is omitted, `simId` is used as the registry key.

Pages without `modelId` have no Source/Vis/State panels — they are pure text chapters.

**Folder ordering**: create `<folder>/default.mdx` with an `order` frontmatter value. That file's `order` sets the sort position of the whole folder. The `default` entry itself is hidden from the TOC tree but acts as the folder's clickable landing page. Folder names in the TOC get a trailing `/`.

Sorting is a two-key tuple `[folderOrder, pageOrder]` computed in `pages.astro`.

## MDX Rendering

`@astrojs/mdx` compiles `.mdx` files as Astro components (not React). They cannot be rendered inside React islands. Solution used in `pages.astro`:

1. Server-renders all pages into a hidden `<div id="page-store">` — each wrapped in:
   ```html
   <div data-page-id="<id>" data-sim-id="<simId>" data-model-id="<modelId>">
   ```
2. `ChapterContent` in `PageShell.tsx` moves the matching element into a visible container via `appendChild` (not `innerHTML`) on each navigation
3. React components embedded directly in MDX are mounted as `client:only="react"` Astro islands — they hydrate on page load even while their parent `div` is hidden, and remain mounted across navigation

## Sim Components in MDX Pages

The primary sim components in `src/sim/components/` are designed to be used directly in `.mdx` files without any props. They resolve their simulation context automatically via DOM attributes injected by `pages.astro`.

### Context Resolution

When `pages.astro` renders each page into `#page-store`, it sets `data-sim-id` and `data-model-id` on the wrapper div. Each `SimXXX` component renders a sentinel `<div>` on first render, then in `useLayoutEffect` walks up the DOM with `closest('[data-sim-id]')` to read both attributes. This gives the component its `simId` and `modelId` without needing any props.

Components can also accept explicit `simId` and `modelId` props — these take precedence over DOM values:

```tsx
// DOM resolution (no props needed in MDX)
<SimVis client:only="react" />

// Explicit (overrides DOM — useful for embedding a different model)
<SimVis simId="sim-demo/floater" modelId="floater" client:only="react" />
```

All three resolution paths share the same engine instance identified by `simId`. A `<SimVis>` in the Chapter tab and a `<SimVis>` in the Vis tab on the same page share the same running simulation.

### SimVis

Renders the Three.js canvas with rewind slider and Start/Pause/Stop/Reset controls.

```mdx
<SimVis client:only="react" />
```

No props needed in MDX. `simId`/`modelId` are resolved from DOM.

### SimSource

Tabbed code editor for one or more blocks. Supports staging and reverting changes.

```mdx
{/* Show only the mission block, auto-sized to fit content */}
<SimSource sourceIds={['mission']} autoHeight client:only="react" />

{/* Show all blocks (tabs appear when more than one) */}
<SimSource client:only="react" />
```

Props:
- `sourceIds?: string[]` — filter to these block `sourceId`s; tabs are hidden when only one block is visible
- `autoHeight?: boolean` — sizes the textarea to fit its content using `field-sizing: content`

### SimCharts

uPlot time-series charts. Three ways to specify what to chart:

```mdx
{/* Ad-hoc variable pairs — each inner array is one chart */}
<SimCharts varIds={[['x','targetX'],['y','targetY'],['z','targetZ']]} client:only="react" />

{/* Named chart from ModelConfig.charts */}
<SimCharts chartId="Position" client:only="react" />

{/* All charts defined in ModelConfig.charts (default when no prop given) */}
<SimCharts client:only="react" />
```

Props:
- `varIds?: string[][]` — builds charts on the fly; colors auto-assigned from a cycling palette (solid/light pairs)
- `chartId?: string` — selects one chart by its `label` from `config.charts`
- Neither prop: renders all `config.charts`

### SimStatePanel

Live flat key→value table of the current model state. Used in the right panel only — not typically embedded in MDX.

### Shared behaviour

- All components render a zero-size sentinel div while context is resolving, then re-render with the real content — no loading flicker visible to the user
- All components subscribe to the same engine instance; starting the sim in the Chapter tab and switching to the Vis tab shows the same running simulation
- Switching tabs on the same chapter must not stop the sim; changing chapters pauses the previous chapter's sim

## Simulation Engine

### Core Concepts

- **ModelState**: `Record<string, number>` — flat map of all state variables
- **BlockFn**: `(local: ModelState) => ModelState` — pure function, sees and returns only its slice of state
- **BlockConfig**: declares one block — `sourceId`, `exportName`, `defaultFn`, `defaultCode`, `mapStateIn`, `mapStateOut`, `tickFrequency`
- **ModelConfig**: complete model definition — `modelId`, `tickIntervalMs`, `initialState`, `blocks[]`, `sceneHandler`, `charts[]`
- One engine *instance* per `simId`; `initSim` is idempotent
- Engine run state is explicit: `stopped`, `running`, or `paused`

### Tick Loop

Each tick, for every `BlockConfig` where `tick % tickFrequency === 0`:
1. `mapStateIn(state)` → extract the block's input slice
2. `activeFn(localIn)` → call the active function (user-compiled or default)
3. `mapStateOut(localOut, state)` → merge output back into full state
4. On runtime error: stop sim, record error, notify subscribers

### Block Staging (live code editing)

The Source tab lets the user edit any block's TypeScript source. Pressing **Stage (Ctrl+Enter)**:
1. Calls `stageBlock(simId, sourceId, code)`
2. `stripTypes(code)` → strips TS annotations to produce plain JS
3. `new Function(...)` compiles and extracts the exported function
4. On success: stores the compiled fn in `pendingFns`, saves raw source to `localStorage`
5. On error: returns `'Compilation failed — check syntax or function name'`

Staged changes are applied (and `initialState` reset) the next time **Start** is pressed from the stopped state. The engine now distinguishes `running`, `paused`, and `stopped`; chapter navigation pauses a sim, while an explicit Stop finalizes the run and fires `afterSim`.

**Revert** removes the localStorage entry and restores `defaultFn`.

localStorage key: `backyard-flyer.sims.<simId>.v1.sources.<sourceId>`

### stripTypes — Limitations

`src/sim/engine/stripTypes.ts` uses regex, not a real parser. Known constraints:

- Strips `type Foo = { ... };` (single or multiline) and `import` lines
- Strips return type annotations of the form `): TypeName {`
- Strips parameter type annotations **only for PascalCase names and known primitives** (`string`, `number`, `boolean`, `void`, `any`, `never`, `unknown`) — this avoids incorrectly stripping object literal values like `{ targetIdx: next, x: 0 }`
- Does **not** support union types (`string | null`), generics (`Array<T>`), or complex return types in function signatures
- Convention: block files define one or two `type` aliases for input/output and use them throughout — this is the intended authoring style

### SceneHandler — Factory Pattern

`ModelConfig.sceneHandler` is a factory function `() => SceneHandler`. Each `SimVis` mount calls the factory to get a fresh handler instance, keeping Three.js objects in private closure scope:

```typescript
export function createMySceneHandler(): SceneHandler {
  return (() => {
    let mesh: THREE.Mesh | null = null;
    // ...
    return {
      init(scene, camera) { /* create objects, add to scene */ },
      update(state, tick, history) { /* update positions/colors */ },
      dispose(scene) { /* remove objects, dispose geometries */ },
    };
  })();
}
```

`SimVis` calls `dispose` + `init` + `update(initialState, 0, [])` on **Reset** to fully reinitialize the scene, and calls `dispose` on React unmount. On mount it replays the full history via `update(getState(simId), getTick(simId), getHistory(simId))` so the scene reflects existing run state if the component mounts mid-simulation.

### Floater Model — Design Notes

The floater has three blocks executed in order each tick:

| Block | Input | Output | Role |
|---|---|---|---|
| `mission` | `x, y, z, targetIdx` | `targetIdx, dist, targetX, targetY, targetZ` | Advances waypoint index when `dist < THRESHOLD`; resolves and writes target coords to state |
| `fc` | `x, y, z, vx, vy, vz, targetX, targetY, targetZ` | `ax, ay, az` | PD controller — proportional attraction to target + velocity damping + gravity compensation |
| `world` | `x, y, z, vx, vy, vz, ax, ay, az` | `x, y, z, vx, vy, vz` | Euler integration; bounces off ground at y=0 |

**Key design decision**: `mission.ts` resolves the current target coordinates into `targetX/Y/Z` in the shared state. `fc.ts` reads those directly — it has no WAYPOINTS array. This means editing waypoints in `mission.ts` automatically affects `fc.ts` without any coordination, and `floater.scene.ts` discovers waypoints from simulation history rather than a hardcoded list.

The scene builds waypoint markers dynamically: `ensureWaypoint(idx, x, y, z)` is called for every state in history on each `update` call, creating a Three.js sphere the first time each `targetIdx` is encountered.

### Subscriptions

The engine exposes status + state subscription channels (all return unsubscribe functions):

```typescript
subscribe(simId, (state, tick) => void)       // fired every tick
subscribeRunning(simId, (running: boolean) => void)
subscribeStatus(simId, (status) => void)      // 'stopped' | 'running' | 'paused'
subscribeError(simId, (error: Error | null) => void)
```

React components use these in `useEffect` to drive live updates.

## Adding a New Simulation Model

1. Create `src/sim/models/<name>/blocks/<block>.ts` — export one function, use type aliases for input/output
2. Create `src/sim/models/<name>/<name>.config.ts` — fill `ModelConfig` (initialState, blocks, sceneHandler factory, charts)
3. Create `src/sim/models/<name>/<name>.scene.ts` — implement a factory function returning a `SceneHandler` closure
4. Register in `src/sim/registry.ts`: `{ ..., <name>: <name>Config }`
5. Create an MDX page with `simId` and `modelId` frontmatter
6. Embed sim components directly in the MDX as needed (`SimSource`, `SimVis`, `SimCharts`) — no props required; context is injected via DOM

## TODO

### PageShell "decramping"

- [ ] 1. Hash-based routing — `parseHash`, `hashchange` listener, `navigate`/`switchView` callbacks, `pageId`/`view` state
- [ ] 2. Host communication (iframe sync) — receiving `NAVIGATE_TO_HASH` and posting `HASH_CHANGED` back to the parent window
- [ ] 3. DOM-based page content swapping — `ChapterContent` reads pre-rendered MDX from `#page-store` and moves DOM nodes in/out
- [ ] 4. Tab bar rendering — the `Chapter / Source / Blocks / Visualization` switcher UI
- [ ] 5. Panel layout — the resizable 3-column + bottom-charts split using `react-resizable-panels`
- [ ] 6. Sim context resolution — deriving `simId`/`modelId` from the current page and passing them down to tabs and side panels
- [ ] 7. Overlay widgets — `MeflyNavReceiver` (dots menu), GitHub repo link button, help/tour button with `helpSeen` persistence
- [ ] 8. `ChartsPanel` — a tiny wrapper that resolves sim context and renders `SimCharts`

## Notes

- `PageShell` is mounted with `client:only="react"` — never SSR'd, safe to access `window`
- `react-resizable-panels` v4: `defaultSize`/`minSize` must be **percentage strings** — plain numbers are pixels
- `Astro.glob` was removed in Astro 6 — use `import.meta.glob('../content/pages/**/*.mdx', { eager: true })`
- The `?raw` Vite import suffix is used in model configs to embed block source code as a string for the editor: `import missionCode from './blocks/mission.ts?raw'`
- Waypoints in `floater` exist only in `mission.ts` — do not duplicate them in `fc.ts` or `floater.scene.ts`
- `SimSource` with `autoHeight` uses `field-sizing: content` (CSS) to grow the textarea to fit — no JS height measurement, avoids issues with measuring while hidden
