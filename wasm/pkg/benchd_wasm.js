/* @ts-self-types="./benchd_wasm.d.ts" */

/**
 * Measures the cost of predictable vs unpredictable branches.
 *
 * Uses two cross-dependent accumulators so the two branch arms update
 * *different* variables that each depend on the *other's* previous value.
 * LLVM/wasm-opt cannot collapse this into a branchless select sequence
 * without emitting two unconditional stores — which is more expensive —
 * so it keeps real `br_if` instructions in the WASM bytecode, letting the
 * CPU's own branch predictor experience the penalty with random data.
 * @param {Uint8Array} data
 * @param {number} iterations
 * @returns {number}
 */
export function bench_branch_predict(data, iterations) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.bench_branch_predict(ptr0, len0, iterations);
    return ret >>> 0;
}

/**
 * Pointer chasing through an array to measure latency
 * The array should contain randomized indices (a linked list in an array).
 * @param {Uint32Array} data
 * @param {number} iterations
 * @returns {number}
 */
export function bench_cache_latency(data, iterations) {
    const ptr0 = passArray32ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.bench_cache_latency(ptr0, len0, iterations);
    return ret >>> 0;
}

/**
 * Tight loop of simple increments to estimate raw cycle speed.
 * @param {number} iterations
 * @param {number} seed
 * @returns {number}
 */
export function bench_clock(iterations, seed) {
    const ret = wasm.bench_clock(iterations, seed);
    return ret >>> 0;
}

/**
 * Simple LZ77-style compression kernel.
 * Iterates through a buffer finding long matches in previous history.
 * Returns a dummy checksum of the compressed stream.
 * @param {Uint8Array} data
 * @param {number} window_size
 * @returns {number}
 */
export function bench_compress(data, window_size) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.bench_compress(ptr0, len0, window_size);
    return ret >>> 0;
}

/**
 * Simple LZ77-style decompression kernel.
 * Iterates through "commands" (literal vs match) to reconstruct data.
 * @param {Uint32Array} compressed_commands
 * @param {number} iterations
 * @returns {number}
 */
export function bench_decompress(compressed_commands, iterations) {
    const ptr0 = passArray32ToWasm0(compressed_commands, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.bench_decompress(ptr0, len0, iterations);
    return ret >>> 0;
}

/**
 * Runs a hot loop of F32 operations (Multiply & Add)
 * We take start_a, b, and c from JS so the compiler CANNOT constant-fold the loop.
 * @param {number} iterations
 * @param {number} start_a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
export function bench_fp32(iterations, start_a, b, c) {
    const ret = wasm.bench_fp32(iterations, start_a, b, c);
    return ret;
}

/**
 * @param {number} iterations
 * @param {number} start_a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
export function bench_fp64(iterations, start_a, b, c) {
    const ret = wasm.bench_fp64(iterations, start_a, b, c);
    return ret;
}

/**
 * Wrapping arithmetic on 64-bit bounds
 * @param {number} iterations
 * @param {bigint} start_a
 * @param {bigint} b
 * @param {bigint} c
 * @returns {bigint}
 */
export function bench_int(iterations, start_a, b, c) {
    const ret = wasm.bench_int(iterations, start_a, b, c);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {Float64Array} data
 * @returns {number}
 */
export function bench_memory_bandwidth(data) {
    var ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_export);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.bench_memory_bandwidth(ptr0, len0, addHeapObject(data));
    return ret;
}

/**
 * @param {number} iterations
 * @param {number} start_a
 * @param {number} b_val
 * @param {number} c_val
 * @returns {number}
 */
export function bench_simd_auto(iterations, start_a, b_val, c_val) {
    const ret = wasm.bench_simd_auto(iterations, start_a, b_val, c_val);
    return ret;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_d2f20acdab8e0740: function(arg0, arg1, arg2) {
            new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./benchd_wasm_bg.js": import0,
    };
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('benchd_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
