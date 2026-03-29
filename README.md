# visuals

Audio-reactive visual experiments built with p5.js and Three.js, plus an offline video export pipeline for generating social-ready MP4s from local songs.

## What is in this repo

This repo currently has three visual directions:

- Root build: a p5.js sketch
- `three-build/`: a Three.js particle-based alternate
- `space-build/`: a Three.js space-flight alternate and the current primary offline export target

The repo also includes:

- a browser-based preview flow
- an offline renderer driven by `tools/render-video.mjs`
- a small CLI wrapper at `./render-video`
- a planning guide for integrating `museic-fp` as the long-term audio analysis layer

## Current Status

The current offline exporter works today and can render MP4s from local audio files.

The current architecture is:

- JavaScript / Three.js for rendering
- Node.js for export orchestration
- `ffmpeg` and `ffprobe` for decode and encode
- headless Chrome via `puppeteer-core` for deterministic frame capture

Planned direction:

- integrate `museic-fp` as the analysis backend
- optionally add Ollama for prompt-driven scene direction

See [MUSEIC_FP_INTEGRATION.md](./MUSEIC_FP_INTEGRATION.md) for the implementation guide and work log.

## Requirements

For local preview:

- Python 3, or any static file server
- a modern browser

For offline rendering:

- Node.js
- `npm install`
- `ffmpeg`
- `ffprobe`
- Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, or pass a custom path with `--chrome`

Optional, not yet wired into the main exporter:

- `museic-fp`
- Ollama

## museic-fp Dependency Model

`museic-fp` is not part of this repository. It is intended to remain a separate Rust project that this repo can call as an external analyzer.

That means:

- this repo should continue to work without `museic-fp`
- `museic-fp` should be treated as an optional upgrade path, not a required in-repo dependency
- local filesystem paths like `/Users/ron/devstuff/projects/ai/museic-fp` should not become part of the normal setup story for collaborators

The intended integration model is:

- default analyzer: internal JavaScript analysis
- optional analyzer: `museic-fp`

If `museic-fp` is added to the exporter, the CLI should either:

- fall back to the internal analyzer when `museic-fp` is unavailable, or
- fail with a clear install message when the user explicitly asks for `--analyzer museic-fp`

### How someone else would get museic-fp

Best long-term option:

- publish `museic-fp` as a normal installable crate and/or binary

Good current option:

- install from the Git repository with Cargo

```bash
cargo install --git https://github.com/brklyn8900/museic-fp museic-fp
```

Local development option:

```bash
cargo install --path /path/to/museic-fp
```

This repo should document `museic-fp` as optional and external rather than vendor it into `visuals`.

## Install

From the repo root:

```bash
cd /Users/ron/devstuff/projects/ai/experiments/visuals
npm install
```

## Running the Visuals in the Browser

Start a static server:

```bash
cd /Users/ron/devstuff/projects/ai/experiments/visuals
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/` for the root p5.js build
- `http://localhost:8000/three-build/` for the Three.js alternate
- `http://localhost:8000/space-build/` for the space-flight build

## Offline Video Export

The easiest entrypoint is the wrapper CLI:

```bash
./render-video ./Metallic_Drive_II.wav
```

That uses the default `reel` preset and writes an MP4 beside the source file unless you provide an output path.

### Common examples

```bash
./render-video ./Metallic_Drive_II.wav
./render-video ./Glitch-My-Veins.mp3 feed ./exports/feed.mp4
./render-video /full/path/to/song.wav square ./exports/song-square.mp4
./render-video ./Metallic_Drive_II.wav reel ./exports/reel.mp4 --build space-build
```

### Presets

- `reel`: `1080x1920`
- `feed`: `1080x1350`
- `square`: `1080x1080`
- `landscape`: `1920x1080`

### Get help

```bash
./render-video --help
```

Or call the underlying exporter directly:

```bash
node tools/render-video.mjs --help
```

## Exporter Notes

The offline exporter:

- analyzes the audio file
- renders frames in headless Chrome
- encodes H.264 video plus AAC audio into MP4
- prints a completion summary with timing and output metadata

Current default build:

- `space-build`

Current output artifacts:

- final MP4
- temporary analysis cache in `.render-cache/`

Generated output folders like `.render-cache/` and `exports/` are ignored by `.gitignore`.

## Repo Layout

```text
.
├── index.html
├── sketch.js
├── style.css
├── three-build/
│   ├── index.html
│   ├── main.js
│   └── style.css
├── space-build/
│   ├── index.html
│   ├── main.js
│   └── style.css
├── tools/
│   └── render-video.mjs
├── render-video
├── package.json
└── MUSEIC_FP_INTEGRATION.md
```

## Source Audio

This repo currently includes local source tracks such as:

- `Glitch-My-Veins.mp3`
- `Metallic_Drive_II.wav`

If you publish the site or exported videos, make sure you have the rights to host or distribute the audio.

## Roadmap

Short-term:

- add `--analyzer museic-fp`
- replace the internal JS analysis path with a `museic-fp` adapter
- introduce a compact `RenderProfile` for renderer consumption

Mid-term:

- make the renderer react to richer song structure like sections, beat grids, groove, and HPSS
- save analysis artifacts and scene specs beside exports
- support multiple builds through a stable analysis contract

Long-term:

- add CLI prompt support
- use Ollama to generate strict JSON scene specs
- make song-specific visuals more art-directed without making the renderer non-deterministic

## Development Notes

- This repo is currently an experiment workspace, not a packaged library.
- The visual styles are intentionally varied across builds.
- `space-build` is the current primary target for offline export work.
- The `museic-fp` integration plan is documented separately so implementation can proceed incrementally.
