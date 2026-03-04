use wasm_bindgen::prelude::*;
use std::hint::black_box;

// ── 1. Floating Point 32 (Single Precision) ────────────

/// Runs a hot loop of F32 operations (Multiply & Add)
/// We take start_a, b, and c from JS so the compiler CANNOT constant-fold the loop.
#[wasm_bindgen]
pub fn bench_fp32(iterations: u32, start_a: f32, b: f32, c: f32) -> f32 {
    let mut a = start_a;

    for _ in 0..iterations {
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
    }

    a
}

// ── 2. Floating Point 64 (Double Precision) ────────────

#[wasm_bindgen]
pub fn bench_fp64(iterations: u32, start_a: f64, b: f64, c: f64) -> f64 {
    let mut a = start_a;

    for _ in 0..iterations {
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
        a = (a * b) + c;
    }

    a
}

// ── 3. Integer ────────────

/// Wrapping arithmetic on 64-bit bounds
#[wasm_bindgen]
pub fn bench_int(iterations: u32, start_a: u64, b: u64, c: u64) -> u64 {
    let mut a = start_a;

    for _ in 0..iterations {
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
        a = a.wrapping_mul(b).wrapping_add(c);
    }

    a
}

// ── 4. SIMD (F32 x 4) ────────────

#[wasm_bindgen]
pub fn bench_simd_auto(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    bench_simd_impl(iterations, start_a, b_val, c_val)
}

#[cfg(not(target_feature = "simd128"))]
fn bench_simd_impl(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    bench_simd_scalar(iterations, start_a, b_val, c_val)
}

#[cfg(target_feature = "simd128")]
fn bench_simd_impl(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    unsafe { bench_simd128(iterations, start_a, b_val, c_val) }
}

#[allow(dead_code)]
fn bench_simd_scalar(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    let mut a = [start_a; 4];
    let b = [b_val; 4];
    let c = [c_val; 4];

    for _ in 0..iterations {
        for i in 0..4 {
            a[i] = a[i] * b[i] + c[i];
        }
        for i in 0..4 {
            a[i] = a[i] * b[i] + c[i];
        }
        for i in 0..4 {
            a[i] = a[i] * b[i] + c[i];
        }
        for i in 0..4 {
            a[i] = a[i] * b[i] + c[i];
        }
        for i in 0..4 {
            a[i] = a[i] * b[i] + c[i];
        }
    }

    a[0] + a[1] + a[2] + a[3]
}

#[cfg(target_feature = "simd128")]
unsafe fn bench_simd128(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    use std::arch::wasm32::{
        f32x4_add, f32x4_extract_lane, f32x4_mul, f32x4_splat, v128,
    };

    let mut a: v128 = f32x4_splat(start_a);
    let b: v128 = f32x4_splat(b_val);
    let c: v128 = f32x4_splat(c_val);

    for _ in 0..iterations {
        a = f32x4_add(f32x4_mul(a, b), c);
        a = f32x4_add(f32x4_mul(a, b), c);
        a = f32x4_add(f32x4_mul(a, b), c);
        a = f32x4_add(f32x4_mul(a, b), c);
        a = f32x4_add(f32x4_mul(a, b), c);
    }

    f32x4_extract_lane::<0>(a)
        + f32x4_extract_lane::<1>(a)
        + f32x4_extract_lane::<2>(a)
        + f32x4_extract_lane::<3>(a)
}

// ── 5. Memory Bandwidth ────────────

#[wasm_bindgen]
pub fn bench_memory_bandwidth(data: &mut [f64]) -> f64 {
    let mut sum: f64 = 0.0;
    let len = data.len();

    // Read pass
    for i in 0..len {
        sum += data[i];
    }

    // Write pass (we mix the sum in so the compiler can't eliminate the read pass)
    for i in 0..len {
        data[i] = sum;
    }

    sum
}

// ── 6. Cache Latency ────────────

/// Pointer chasing through an array to measure latency
/// The array should contain randomized indices (a linked list in an array).
#[wasm_bindgen]
pub fn bench_cache_latency(data: &[u32], iterations: u32) -> u32 {
    let mut curr: usize = 0;

    // Unroll slightly to reduce loop overhead relative to memory access
    for _ in 0..(iterations / 4) {
        curr = data[curr] as usize;
        curr = data[curr] as usize;
        curr = data[curr] as usize;
        curr = data[curr] as usize;
    }

    curr as u32
}

// ── 7. Branch Prediction ────────────

/// Measures the cost of predictable vs unpredictable branches.
///
/// Uses two cross-dependent accumulators so the two branch arms update
/// *different* variables that each depend on the *other's* previous value.
/// LLVM/wasm-opt cannot collapse this into a branchless select sequence
/// without emitting two unconditional stores — which is more expensive —
/// so it keeps real `br_if` instructions in the WASM bytecode, letting the
/// CPU's own branch predictor experience the penalty with random data.
#[wasm_bindgen]
pub fn bench_branch_predict(data: &[u8], iterations: u32) -> u32 {
    let mut a: u32 = 1;
    let mut b: u32 = 1;
    let len = data.len();
    let outer = iterations / len as u32;

    for _ in 0..outer {
        for i in 0..len {
            if data[i] > 127 {
                a = a.wrapping_add(b);
            } else {
                b = b.wrapping_add(a);
            }
        }
    }

    a ^ b
}

// ── 8. Clock Speed Estimation ────────────

/// Tight loop of simple increments to estimate raw cycle speed.
#[wasm_bindgen]
pub fn bench_clock(iterations: u32, seed: u32) -> u32 {
    let mut a: u32 = seed | 1;
    for _ in 0..iterations {
        a = a.wrapping_add(1);
        // Prevent algebraic simplification of the full loop into a constant-time expression.
        black_box(a);
    }
    a
}

// ── 9. Compression (LZ77-style) ────────────

/// Simple LZ77-style compression kernel.
/// Iterates through a buffer finding long matches in previous history.
/// Returns a dummy checksum of the compressed stream.
#[wasm_bindgen]
pub fn bench_compress(data: &[u8], window_size: u32) -> u32 {
    let mut pos = 0;
    let len = data.len();
    let mut checksum: u32 = 0;
    let win = window_size as usize;

    while pos < len {
        let mut best_match_len = 0;

        // Search in history for a match
        let search_start = if pos > win { pos - win } else { 0 };
        for i in search_start..pos {
            let mut match_len = 0;
            while pos + match_len < len
                && i + match_len < pos
                && data[i + match_len] == data[pos + match_len]
                && match_len < 255
            {
                match_len += 1;
            }
            if match_len > best_match_len {
                best_match_len = match_len;
            }
        }

        if best_match_len >= 3 {
            // Encode match (using checksum as dummy Sink)
            checksum = checksum.wrapping_add(best_match_len as u32);
            pos += best_match_len;
        } else {
            // Literal
            checksum = checksum.wrapping_add(data[pos] as u32);
            pos += 1;
        }
    }
    checksum
}

/// Simple LZ77-style decompression kernel.
/// Iterates through "commands" (literal vs match) to reconstruct data.
#[wasm_bindgen]
pub fn bench_decompress(compressed_commands: &[u32], iterations: u32) -> u32 {
    // Command format:
    // - Literal: high bit = 0, low 8 bits = byte value
    // - Match  : high bit = 1, bits 16..30 = length, bits 0..15 = distance - 1
    let mut per_pass_out: usize = 0;
    for &cmd in compressed_commands {
        if cmd & 0x8000_0000 == 0 {
            per_pass_out += 1;
        } else {
            per_pass_out += ((cmd >> 16) & 0x7FFF) as usize;
        }
    }

    if per_pass_out == 0 {
        return 0;
    }

    let mut out = vec![0u8; per_pass_out];
    let mut checksum: u32 = 0;

    for _ in 0..iterations {
        let mut pos: usize = 0;

        for &cmd in compressed_commands {
            if cmd & 0x8000_0000 == 0 {
                // Literal byte
                let b = (cmd & 0xFF) as u8;
                if pos < out.len() {
                    out[pos] = b;
                }
                checksum = checksum.wrapping_add(b as u32);
                pos += 1;
            } else {
                // Match copy
                let len = ((cmd >> 16) & 0x7FFF) as usize;
                let dist = ((cmd & 0xFFFF) as usize).saturating_add(1);

                for _ in 0..len {
                    let src = if dist <= pos { pos - dist } else { 0 };
                    let b = if src < out.len() { out[src] } else { 0 };
                    if pos < out.len() {
                        out[pos] = b;
                    }
                    checksum = checksum.wrapping_add(b as u32);
                    pos += 1;
                }
            }
        }
    }

    checksum
}
