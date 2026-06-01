# backyard-flyer

## Concept

Backyard Flyer is an educational app for learning fundamentals of implementation of quad-copter control.
It provides to the user a mix of articles, exercises and live coding sandbox.

The app is built around the idea that flight-control concepts are easier to understand when the explanation, the source code, and the live simulation all stay in one place. Instead of reading a chapter in isolation and then jumping to a separate demo, students can open a model page, read how a controller works, inspect the exact block implementation, change the code, and immediately see the result in the visualizer and charts.

The course content progresses from minimal toy simulations to a reusable quadcopter architecture with shared control blocks, lifecycle hooks, pass/fail scoring, disturbances, and racing-style scenarios. That makes the app useful both as a guided learning path and as a sandbox for experimenting with controller tuning, mission logic, environment disturbances, and physics assumptions.

Key features include hash-routed MDX chapters, live-editable simulation blocks, shared simulation instances across tabs, a Three.js visualization with rewind/playback controls, state and chart panels, and model architectures that become progressively closer to a real flight stack. The current quadcopter models are organized around a shared `lib/quad` block library so later scenarios can add wind, sensor noise, or gate-planning behaviour without duplicating the whole controller.

