## Warm — load for any sim/engine/model work
- [Context map](context-map.md) — detailed file-to-role index: engine internals, lib blocks, all models, UI components
- [Anti-hallucination checklist](anti-hallucination.md) — verify before generating block or model code
- [Engine static/dynamic state split](engine-static-dynamic-state-split.md) — static blocks + getStatic; lifecycle hooks; K out of history
- [Sim block editing strips imports](sim-block-editing-strips-imports.md) — editable blocks lose imports; shared values must arrive via state.K
- [Quad block library & consts design](quad-block-library-consts.md) — lib blocks + lifecycle block publishing frozen state.K + createConfig factory
- [Window-model rebuild pattern](window-model-rebuild-pattern.md) — w1a/w1b/combined on shared lib; StepDef; planner owns STATUS_RESTART; navigator_w1
- [C1 chase family](c1-chase-family.md) — target_c1 ghost, planner_c1a/c1b, mission one-intercept trick, pre-stage pattern, vis guide line, KD_POS braking limitation
- [C2 chase family](c2-chase-family.md) — first-class target, dual-vehicle K bags, planner_c2a STATUS_FAILED, navigator_c2, stepValidator timing fix (capturedC2aStatus), Intercept/Wind/Noise toggles, flash banners
- [Sim components API](sim-components-api.md) — SimVis/SimSource/SimCharts props, SceneHandler pattern, subscriptions, MDX rendering, layout
- [Adding a new model](adding-new-model.md) — step-by-step generator: config, blocks, vis, registry, MDX page

## Cold — load on demand
- [Improvement backlog](improvement-backlog.md) — proposed-but-unbuilt improvements across docs, testing, UX, model authoring, engine, lib blocks; top picks: test harness + headless runner, seeded RNG, tuning panel
- [On-the-fly tuning plan](quad-on-the-fly-tuning-plan.md) — agreed-but-unbuilt tuner design (state.tuning overlay)
- [Use pnpm exec for Node tools](use-pnpm-exec-for-node-tools.md) — always pnpm exec tsc, never plain/global binaries
