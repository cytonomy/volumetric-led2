# volumetric-led2

A fullscreen, audio-reactive volumetric LED visualization of a single neuronal firing event.
~150–250k LEDs rendered as billboard impostors, multi-scale camera storyboard, mic-driven
reactivity, ACES + bloom for the "real LED" look.

Variation on https://cytonomy.github.io/volumetric-led/ stripped to neuronal-firing only.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

For a "double-click to run" production launch on macOS:

```bash
npm run build
chmod +x launch.command
open launch.command   # opens Chrome --app --kiosk fullscreen, suppresses screensaver
```

## Controls

| Key | |
|---|---|
| `F` | toggle fullscreen |
| `M` | mic on/off (default off; click anywhere or press `M` to enable) |
| `H` | hide / show UI |
| `SPACE` | pause / resume |
| `R` | reset loop |
| `A` | toggle auto-camera |
| `1–7` | jump to storyboard phase |
| `←` / `→` | scrub ±1s |
| drag / scroll | manual orbit (pauses auto-cam) |

## Storyboard

Single neuronal action potential, 30-second loop:

1. Resting potential — whole neuron, cool-cyan ambient
2. Dendritic EPSPs — warm orange blooms converge on soma
3. Hillock summation — voxel cluster brightens to threshold
4. AP initiation — Naᵥ blue inflow, white-hot peak
5. Repolarization — Kᵥ green outflow, refractory indigo
6. Saltatory conduction — white flashes jump node-to-node along axon
7. Terminal Caᵥ + vesicle release — purple Ca²⁺, yellow NT cloud
8. Post-synaptic EPSP — orange bloom on next neuron's spine; loop

Voltage drives the dominant hue (cyan → white → indigo);
ion species drive transient flare colors (Na⁺ blue, K⁺ green, Ca²⁺ purple, NT yellow).

## Audio reactivity

Web Audio mic input → AnalyserNode FFT.
- Bass injects extra dendritic stimuli, scales pump pulse intensity
- Mids drive overall brightness modulation
- Highs add ion sparkle density at active sites
- Beat detection (spectral flux) retriggers the action potential

If no mic permission, the loop runs on its intrinsic 30s clock.

## Performance

Target: 60fps at ~150k LEDs on Apple Silicon (M-series).
- WebGL2 + three.js InstancedMesh of billboard quads
- Soft-sphere shader (no real geometry; ~6 verts/LED instead of 80)
- Per-frame `InstancedBufferAttribute` updates for color + intensity
- UnrealBloom (half-res) + ACES tonemap + SMAA
- HDR pipeline (HalfFloatType render target)

## Tech

three.js · Vite · WebGL2 · Web Audio API
