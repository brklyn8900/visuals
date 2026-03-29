# museic-fp Integration Guide and Work Log

## Goal

Integrate `museic-fp` into this project as the primary audio analysis layer for offline video generation, while keeping the current JavaScript and Three.js rendering pipeline.

The target outcome is:

- Rust handles rich song analysis.
- JavaScript handles visual rendering and export orchestration.
- Optional Ollama integration adds prompt-driven scene direction on top of deterministic music analysis.

## Architecture Decision

We are not rewriting the renderer in Rust right now.

We are adopting this split instead:

- `museic-fp`: song analysis and music intelligence
- `tools/render-video.mjs`: orchestration, artifact management, export flow
- `space-build/` and future builds: visual execution
- Ollama: optional scene-spec generation from analysis + prompt

## Why This Direction

This keeps the strongest parts of the current system:

- fast visual iteration in Three.js
- working offline export pipeline
- existing CLI flow

And replaces the weakest part:

- the current ad hoc FFT-based analysis in `tools/render-video.mjs`

## Current Replacement Boundary

The current exporter still performs local decode and frame-band analysis internally.

That analysis path lives in:

- `tools/render-video.mjs`
- `decodeAudioToSamples(...)`
- `buildAnalysis(...)`

This is the seam that should be replaced by a `museic-fp` adapter.

## Target Data Flow

1. Input audio file enters `render-video`
2. Analyzer runs
3. Analyzer output is converted into a compact `RenderProfile`
4. Optional Ollama step generates a `SceneSpec`
5. Renderer consumes `RenderProfile` or `RenderProfile + SceneSpec`
6. Exporter writes final MP4 and metadata artifacts

## Phased Execution Plan

### Phase 1: Analyzer Abstraction

- [ ] Add an analyzer abstraction to `tools/render-video.mjs`
- [ ] Support `internal` and `museic-fp` analyzers
- [ ] Keep the current internal FFT analyzer as a fallback during migration
- [ ] Add CLI flag: `--analyzer internal|museic-fp`

### Phase 2: museic-fp Adapter

- [ ] Shell out to `museic-fp analyze <file> --full --format json --quiet`
- [ ] Validate the JSON envelope
- [ ] Fail cleanly if the binary is missing or returns invalid data
- [ ] Add optional CLI flag: `--museic-bin /path/to/museic-fp`

### Phase 3: RenderProfile Schema

- [ ] Define a compact `RenderProfile` JSON format
- [ ] Include global descriptors:
  - duration
  - bpm
  - key
  - danceability
  - groove
  - loudness
- [ ] Include timeline descriptors:
  - sections
  - energy summary
- [ ] Include event descriptors:
  - beat times
  - onset times
  - major impact candidates
- [ ] Include curve descriptors:
  - percussive intensity
  - harmonic intensity
  - brightness
  - loudness
  - overall intensity

### Phase 4: Translation Layer

- [ ] Map `museic-fp` output into `RenderProfile`
- [ ] Convert sections into visual phase boundaries
- [ ] Convert beat grid and onsets into render events
- [ ] Use groove, danceability, HPSS, and spectral data to drive motion character
- [ ] Keep the translation deterministic and easy to inspect

### Phase 5: Renderer Integration

- [ ] Update `space-build` offline mode to consume `RenderProfile`
- [ ] Preserve existing behavior until the new profile is validated
- [ ] Use `space-build` as the first target build
- [ ] Delay `three-build` integration until the interface stabilizes

### Phase 6: Artifacts and Reproducibility

- [ ] Save raw analyzer output beside each render
- [ ] Save derived `RenderProfile`
- [ ] Save optional `SceneSpec`
- [ ] Save final MP4
- [ ] Keep each successful render reproducible from saved artifacts

### Phase 7: Ollama Scene Direction

- [ ] Add CLI flag: `--prompt`
- [ ] Add CLI flag: `--llm ollama`
- [ ] Add CLI flag: `--model <model>`
- [ ] Add CLI flag: `--variations <n>`
- [ ] Generate strict JSON scene specs, not code
- [ ] Feed Ollama a condensed music brief, not the full raw analysis payload

## Recommended Order

1. Phase 1: analyzer abstraction
2. Phase 2: `museic-fp` CLI adapter
3. Phase 3: `RenderProfile` schema
4. Phase 4: translation layer
5. Phase 5: `space-build` integration
6. Phase 6: saved artifacts
7. Phase 7: Ollama scene-spec generation

## Initial CLI Shape

Current direction:

```bash
./render-video ./song.mp3 reel ./exports/song.mp4 --analyzer museic-fp
```

Future prompt-driven direction:

```bash
./render-video ./song.mp3 reel ./exports/song.mp4 \
  --analyzer museic-fp \
  --prompt "dark brutal deep-space drift, sparse, dangerous, high contrast" \
  --llm ollama \
  --model qwen3:30b
```

## Working Rules

- Keep renderer logic deterministic
- Do not feed raw high-volume analysis data directly into the renderer
- Do not let the LLM generate raw renderer code per song
- Prefer stable JSON contracts between stages
- Add features to `space-build` first, then generalize

## Completed Work Log

### 2026-03-28

- Built the current offline render pipeline around `tools/render-video.mjs`
- Added the `./render-video` wrapper CLI
- Added export summary output at the end of renders
- Evaluated the architecture direction for Rust integration
- Chose to keep JavaScript and Three.js for rendering
- Chose to integrate `museic-fp` as the analysis layer instead of rewriting the renderer
- Defined the phased integration plan in this document

## Next Action

The next implementation step is:

- Add `--analyzer museic-fp` to `tools/render-video.mjs`

