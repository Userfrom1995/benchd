# BenchD

BenchD is a browser-based CPU benchmark that runs fully on the client.

- Runs fully on the client
- Uses WASM + Web Workers + WebCrypto
- No backend and no telemetry

## What BenchD Tests

- FP32 and FP64 compute throughput
- Integer compute
- SIMD compute
- Memory bandwidth
- Cache and RAM latency
- Branch prediction behavior
- Cryptography (AES-GCM, SHA-256)
- Compression and decompression throughput
- Multi-core scaling

The goal is to provide a practical browser-side CPU performance snapshot with no server dependency.

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
- If results look stale, unregister the service worker in DevTools and hard refresh.

## License

This project is released under a custom proprietary license.

- Non-commercial and educational use is allowed with attribution
- Commercial/profit/manufacturing use requires prior written permission
- See `LICENSE` for full terms

