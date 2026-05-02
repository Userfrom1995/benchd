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

This is a beta release of the project.

Some benchmark tests may not yet behave exactly as intended, and there are known bugs across:

- Benchmark/test logic
- Rust/WASM kernels
- Edge-case behavior in some categories
- Cross-browser variance

These issues will be fixed in subsequent releases.

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

## Build Notes

- `wasm/pkg` should be committed for deployment.
- `wasm/target` should not be committed.
- The wasm build uses `rand 0.9` with `getrandom 0.3` configured for the browser `wasm_js` backend.
- The wasm target config enables `simd128`; rebuild `wasm/pkg` after changing Rust kernels.
- If results look stale, unregister the service worker in DevTools and hard refresh.

## License

This project is released under a custom proprietary license.

- Non-commercial and educational use is allowed with attribution
- Commercial/profit/manufacturing use requires prior written permission
- See `LICENSE` for full terms
