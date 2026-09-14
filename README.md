# BenchD

Deployment: <https://userfrom1995.github.io/benchd/>

BenchD is a browser-based CPU benchmark that runs fully on the client,
with no backend and no telemetry.

- Runs fully on the client
- Uses WASM + Web Workers + WebCrypto
- No backend and no telemetry
- Exports raw benchmark results as JSON

## What BenchD Tests

- FP32 and FP64 compute throughput using independent accumulator streams
- Integer compute throughput
- SIMD compute throughput
- WASM memory bandwidth
- Random-walk latency at fixed working-set sizes: 32KB, 256KB, 8MB, and 64MB
- Branch prediction behavior
- Cryptography (AES-GCM, SHA-256)
- Compression and decompression throughput
- Multi-core scaling
- WASM loop throughput

The goal is to provide a practical browser-side CPU performance snapshot with no server dependency.

## Measurement Notes

BenchD is a browser benchmark, not a native hardware profiler. Results are useful for comparing browser-side execution on the same browser/device class, but they are not directly comparable to native tools.

- **WASM loop throughput is not CPU clock speed.** Browsers do not expose real CPU frequency, hardware counters, or OS power telemetry. BenchD reports this as GOPS instead of GHz.
- **Random-walk latency is labeled by working-set size.** The app no longer labels fixed buffers as L1/L2/L3/RAM because cache sizes differ by CPU, core type, and device. A 32KB test is always a 32KB random walk; whether that maps to L1 depends on the machine.
- **Memory bandwidth is measured inside WASM memory.** The benchmark uses an internal WASM buffer so the result is less affected by JS-to-WASM typed-array copy overhead.
- **Crypto uses WebCrypto.** AES-GCM and SHA-256 are measured through browser WebCrypto APIs, which may use browser or platform acceleration.
- **Raw JSON export is available after a run.** The export includes the score, raw category results, window samples, browser metadata, worker count, SharedArrayBuffer availability, and cross-origin isolation state.

## Beta Notice

This is a beta release.

Results are best for same-browser/version/device comparisons — repeat 3×
and compare medians. Short timed windows (~333ms), turbo/thermal behavior,
background tabs, and browser differences (especially WebCrypto and timer
granularity) add a few percent of run-to-run variance. See Run Variance and
Methodology Footnote below.

## Contributions

Contributions are welcome.

- Open an issue for bugs or feature ideas
- Open a pull request for fixes/improvements
- Keep changes focused and tested when possible

## Run Locally

```bash
cd wasm
wasm-pack build --target web --release --no-opt

cd ..
npx -y serve . -p 4200 --no-clipboard
```

Open `http://localhost:4200`.

### Runtime

A full run takes ~17s on a typical desktop:

- 1000ms timed work per test, split into 3 windows (~333ms each) for peak (best window) vs sustained (mean) estimates
- 200ms untimed warm-up per test to trigger JIT/turbo before measuring
- 5 × 300ms WASM loop-throughput (clock) probes spread across the run
- +1 multi-core pass when `hardwareConcurrency > 1`

### Run Variance

Repeat runs vary — this is expected. Turbo boost, thermal throttling,
background tabs, power profiles, and JIT all shift results by a few percent.
`sustained < peak` is normal: peak is the best single window (burst),
sustained is the mean across all windows (steady-state). For comparisons,
close background tabs, use the same browser/version/device, and repeat 3×,
comparing medians rather than single runs.

## Build Notes

- `wasm/pkg` should be committed for deployment.
- `wasm/pkg/.gitignore` contains `*`, so Git ignores it by default — use `git add -f wasm/pkg` to force-add rebuilt output.
- `wasm/target` should not be committed.
- Rebuilding overwrites `wasm/pkg`; rebuild after changing Rust kernels:
  `cd wasm && wasm-pack build --target web --release --no-opt`.
- `--no-opt` skips the `wasm-opt` (Binaryen) optimization pass: faster builds
  with no Binaryen dependency. Omit it for a smaller production binary.
- The wasm build uses `rand 0.9` with `getrandom 0.3` configured for the browser `wasm_js` backend.
- The wasm target config (`wasm/.cargo/config.toml`) enables `+simd128`
  (`-C target-feature=+simd128`) plus `--cfg getrandom_backend="wasm_js"`;
  keep both when rebuilding or SIMD/RNG kernels will regress or fail to build.

### Methodology Footnote

- WASM loop throughput ("clock") is display-only and excluded from the score.
- Latency metrics (32KB/256KB/8MB/64MB random walks, branch predictable/random)
  are lower-is-better and scored as `REF / value` against reference latencies
  (ns/op) in `src/score.js` (`LATENCY_REFS`), so lower latency → higher sub-score.
- Unit normalization before `log1p(x) * 1000`: compress/decompress MB/s → GB/s
  (`/1000`), SHA-256 MH/s → normalized throughput (`/0.05` ref).
- If a test fails (or yields a non-finite/non-positive value), its weight is
  redistributed across the surviving tests; the export flags this with
  `complete: false`, `skipped: [...]`, and `activeWeight < 1`.

### Service Worker Versioning

- Bump `SW_VERSION` in `sw.js` when changing cached assets or headers.
- If results look stale: DevTools → Application → Service Workers → Unregister,
  then hard refresh (Ctrl/Cmd+Shift+R). First install auto-reloads once so
  COOP/COEP headers take effect.

## License

This project is released under a custom proprietary license.

- Non-commercial and educational use is allowed with attribution
- Commercial/profit/manufacturing use requires prior written permission
- See `LICENSE` for full terms
