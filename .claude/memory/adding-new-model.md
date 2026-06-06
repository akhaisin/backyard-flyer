---
name: adding-new-model
description: "Step-by-step generator for adding a new simulation model — config, blocks, vis, registry, MDX page"
metadata:
  type: project
---

## 1. Create model directory

```
src/sim/models/<family>/<model-name>/
```

Families: `quad/`, `racing/`, `control/`, `demo/`.

## 2. Choose: lib-based or own blocks

**Lib-based** (preferred for new quad models):

```typescript
// <model>.config.ts
export function createMyModelConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const lifecycle = makeLifecycleBlock(QUAD_DEFAULTS, route, overrides)
  return { modelId: 'my-model', blocks: [lifecycle, ...quadLibBlocks], ... }
}
```

**Own blocks** (legacy pattern): create `blocks/<block>.ts` — each exports one function, uses type aliases for input/output, **no `import` of runtime values** (import lines are stripped at stage time). Constants must come through `mapStateIn`. See [[sim-block-editing-strips-imports]].

## 3. Create `<model>.config.ts`

- Export factory `createMyModelConfig(overrides?)` (lib-based) or plain `ModelConfig`
- `?raw` import for each own-block's source string: `import missionCode from './blocks/mission.ts?raw'`
- `initialState`: all state keys with default values
- `blocks[]`: ordered — each block only reads keys written by earlier blocks
- `sceneHandler`: factory `() => SceneHandler` — see [[sim-components-api]]
- `charts[]`: optional `ChartConfig[]`; `ChartSeries.fn` receives `(state, staticState)`

## 4. Create `<model>.vis.tsx`

SceneHandler factory — Three.js objects in closure scope, init/update/dispose lifecycle. See [[sim-components-api]] for the full pattern. Export as `createMySceneHandler`.

## 5. Register in `src/sim/registry.ts`

```typescript
import { createMyModelConfig } from './models/<family>/<model>/<model>.config'
// add to registry object:
'my-model': createMyModelConfig
```

`ModelEntry = ModelConfig | (() => ModelConfig)` — factories are called on first resolve.

## 6. Create MDX page

```
src/content/pages/<Section>/<model>.mdx
```

Frontmatter:

```yaml
---
order: 3                   # sort position within folder (default: Infinity = last)
simId: section/my-model    # unique engine instance key
modelId: my-model          # must match registry key
toc-name: My Model         # TOC display label (default: filename)
---
```

Pages without `modelId` are pure text chapters — no Source/Vis/State panels.

**Folder ordering**: create `<folder>/default.mdx` with an `order` value to set the folder's sort position. The `default` file is hidden from the TOC but is the folder's clickable landing page.

## 7. Embed sim components in MDX

```mdx
<SimVis client:only="react" />
<SimSource client:only="react" />
<SimCharts client:only="react" />
```

No props needed — context is resolved from DOM. See [[sim-components-api]] for prop details and ad-hoc `varIds` charts.

## 8. For window/racing models: create `route.ts`

```typescript
export const route: StepDef[] = [ ... ]
```

Import in BOTH config (→ `makeLifecycleBlock`) and vis (→ gate/waypoint overlay). Never inline the route array into the config object — it breaks the vis import.

## 9. Run tests

```bash
pnpm test:sim   # confirm model behaves correctly
pnpm build      # full type-check
```
