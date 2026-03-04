/* tslint:disable */
/* eslint-disable */

/**
 * Measures the cost of predictable vs unpredictable branches.
 *
 * Uses two cross-dependent accumulators so the two branch arms update
 * *different* variables that each depend on the *other's* previous value.
 * LLVM/wasm-opt cannot collapse this into a branchless select sequence
 * without emitting two unconditional stores — which is more expensive —
 * so it keeps real `br_if` instructions in the WASM bytecode, letting the
 * CPU's own branch predictor experience the penalty with random data.
 */
export function bench_branch_predict(data: Uint8Array, iterations: number): number;

/**
 * Pointer chasing through an array to measure latency
 * The array should contain randomized indices (a linked list in an array).
 */
export function bench_cache_latency(data: Uint32Array, iterations: number): number;

/**
 * Tight loop of simple increments to estimate raw cycle speed.
 */
export function bench_clock(iterations: number, seed: number): number;

/**
 * Simple LZ77-style compression kernel.
 * Iterates through a buffer finding long matches in previous history.
 * Returns a dummy checksum of the compressed stream.
 */
export function bench_compress(data: Uint8Array, window_size: number): number;

/**
 * Simple LZ77-style decompression kernel.
 * Iterates through "commands" (literal vs match) to reconstruct data.
 */
export function bench_decompress(compressed_commands: Uint32Array, iterations: number): number;

/**
 * Runs a hot loop of F32 operations (Multiply & Add)
 * We take start_a, b, and c from JS so the compiler CANNOT constant-fold the loop.
 */
export function bench_fp32(iterations: number, start_a: number, b: number, c: number): number;

export function bench_fp64(iterations: number, start_a: number, b: number, c: number): number;

/**
 * Wrapping arithmetic on 64-bit bounds
 */
export function bench_int(iterations: number, start_a: bigint, b: bigint, c: bigint): bigint;

export function bench_memory_bandwidth(data: Float64Array): number;

export function bench_simd_auto(iterations: number, start_a: number, b_val: number, c_val: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly bench_branch_predict: (a: number, b: number, c: number) => number;
    readonly bench_cache_latency: (a: number, b: number, c: number) => number;
    readonly bench_clock: (a: number, b: number) => number;
    readonly bench_compress: (a: number, b: number, c: number) => number;
    readonly bench_decompress: (a: number, b: number, c: number) => number;
    readonly bench_fp32: (a: number, b: number, c: number, d: number) => number;
    readonly bench_fp64: (a: number, b: number, c: number, d: number) => number;
    readonly bench_int: (a: number, b: bigint, c: bigint, d: bigint) => bigint;
    readonly bench_memory_bandwidth: (a: number, b: number, c: number) => number;
    readonly bench_simd_auto: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
