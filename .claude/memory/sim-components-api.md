---
name: sim-components-api
description: "API reference for SimVis, SimSource, SimCharts, SceneHandler, engine subscriptions, MDX rendering, and layout"
metadata:
  type: project
---

## Context Resolution

All sim components resolve `simId`/`modelId` from DOM automatically — no props needed in MDX. `pages.astro` sets `data-sim-id`/`data-model-id` on each page's wrapper div; components walk up with `closest('[data-sim-id]')` in `useLayoutEffect`. Explicit props take precedence over DOM values.

## SimVis

Three.js canvas + rewind slider + Start/Pause/Stop/Reset controls.

```mdx
<SimVis client:only="react" />
<SimVis simId="sim-demo/floater" modelId="floater" client:only="react" />
```

On mount: replays full history via `update(getState, getTick, getHistory)`. On Reset: calls `dispose` → `init` → `update(initialState, 0, [])`. On unmount: calls `dispose`.

## SimSource

Tabbed code editor with Stage (Ctrl+Enter) and Revert per block.

```mdx
<SimSource sourceIds={['mission']} autoHeight client:only="react" />
<SimSource client:only="react" />
```

Props:
- `sourceIds?: string[]` — filter to these block `sourceId`s; tabs hidden when only one is visible
- `autoHeight?: boolean` — textarea grows via CSS `field-sizing: content`

localStorage key: `backyard-flyer.sims.<simId>.v1.sources.<sourceId>`

## SimCharts

uPlot time-series charts.

```mdx
<SimCharts varIds={[['x','targetX'],['y']]} client:only="react" />
<SimCharts chartId="Position" client:only="react" />
<SimCharts client:only="react" />
```

Props:
- `varIds?: string[][]` — each inner array is one chart; colors auto-assigned from cycling palette
- `chartId?: string` — selects one chart by `label` from `config.charts`
- Neither prop: renders all `config.charts`

`ChartSeries.fn` signature: `(state: ModelState, staticState: ModelState) => number`. Use `ChartSeries.staticVar?: string` for a flat reference line resolved against the static slice.

## SimStatePanel

Live flat key→value display of current model state. Used in the right panel only — not typically embedded in MDX.

## SceneHandler — Factory Pattern

`ModelConfig.sceneHandler` must be a factory `() => SceneHandler`, not a singleton. Each `SimVis` mount calls the factory to get a fresh handler with Three.js objects in closure scope:

```typescript
export function createMySceneHandler(): SceneHandler {
  return (() => {
    let mesh: THREE.Mesh | null = null;
    return {
      init(scene, camera) { /* create + add objects */ },
      update(state, tick, history, staticState) { /* update positions/colors */ },
      dispose(scene) { /* remove + dispose geometries */ },
    };
  })();
}
```

`update` receives `staticState` as 4th arg (stable for the run, holds `K`). Handlers with fewer params work fine — TS allows it.

## Engine Subscriptions

```typescript
subscribe(simId, (state, tick) => void)
subscribeRunning(simId, (running: boolean) => void)
subscribeStatus(simId, (status: 'stopped' | 'running' | 'paused') => void)
subscribeError(simId, (error: Error | null) => void)
```

All return an unsubscribe function. Use in React `useEffect`.

## MDX Rendering Mechanics

`pages.astro` server-renders all MDX into `<div id="page-store">` (hidden). Each page wrapped:
```html
<div data-page-id="<id>" data-sim-id="<simId>" data-model-id="<modelId>">
```
`ChapterContent` in `PageShell.tsx` moves the matching element via `appendChild` (not `innerHTML`) — preserves React island mounts. Islands use `client:only="react"` — they hydrate once on page load and stay mounted across navigation. `Astro.glob` was removed in Astro 6; use `import.meta.glob('../content/pages/**/*.mdx', { eager: true })` instead.

## Layout

```
┌──────────┬────────────────────────────────┬──────────┐
│ Left     │ [Chapter][Source][Blocks][Vis] │ Right    │
│ (TOC)    ├────────────────────────────────┤ (State)  │
│          │   Tab content                  │ collapsed│
│          ├────────────────────────────────┤ default  │
│          │ Charts (bottom, vis tab only)  │          │
└──────────┴────────────────────────────────┴──────────┘
```

Three `CollapsibleSidePanel` instances (`position: left|right|bottom`). Outer layout: `Group orientation="horizontal"`. Inner main panel: `Group orientation="vertical"` (content | bottom charts). All `defaultSize`/`minSize` must be **percentage strings** (`"20%"`) — plain numbers are treated as pixels.

## URL Routing

Hash-based, handled by `PageShell.tsx`:

| URL | Page | Tab |
|---|---|---|
| `/pages/#Overview` | `Overview.mdx` | Chapter |
| `/pages/#sim-demo/floater` | `sim-demo/floater.mdx` | Chapter |
| `/pages/#sim-demo/floater?view=src` | same | Source |
| `/pages/#sim-demo/floater?view=blocks` | same | Blocks |
| `/pages/#sim-demo/floater?view=vis` | same | Visualization |
