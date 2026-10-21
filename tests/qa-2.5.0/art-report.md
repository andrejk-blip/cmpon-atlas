# Visual cohesion 2.5.0 — art QA

Native Canvas captures of the actual scene code; not browser screenshots. The swarm uses shared steel, ivory, cyan and burgundy materials; three collision-bounded enemy rank silhouettes; visible dive and shot warnings; bounded stars/exhaust; essential cues remain with FX disabled. MRG receives the same finite human rigs used on bases, preserving the original boss and attack geometry.

- Desktop 1280×720, portrait 390×640 and landscape 780×390 rendered.
- Gameplay snapshots unchanged by installation/rendering; transforms finite.
- Reinstallation does not wrap again or add listeners.
- Mesh registry stable: 197 → 197.
- 600 swarm Canvas frames; 120 MRG scene builds; native swarm draw median 1.229 ms, p95 1.867 ms.
- Ordinary-input swarm runs: normal 79.9 s, 6 waves, minimum shield 100%; calm 75.2 s, 6 waves, minimum shield 100%.

Limits: no browser/GPU/audio/touch-performance claims; native timing is host-specific. The player uses a 2.5× visual spacecraft and a clearly marked luminous core at the unchanged collision radius 1.65. Before/after frames use identical saved state.

## Compatible MRG detail level

CPU, mobile layout and FX-off select the compact human rig before building detailed geometry. Faces, hair, uniforms, articulated limbs and the original attack weapons remain. Desktop WebGL selects the detailed rig. The WebGL selection fixture below still uses native CPU drawing and is not GPU evidence.

- Actor triangles: 9500 → 1928.
- Total scene triangles: 82480 → 74716.
- Scene items: 366 → 383.
- Six alternating native CPU pairs after warm-up: median 522.73 → 519.48 ms (ratio 0.994). This host-specific result does not establish Android FPS.
- 160 protected tagged objects retain exact geometry, including the boss, platform and weapon/attack cues.
