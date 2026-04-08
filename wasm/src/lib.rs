// use rand::seq::SliceRandom;
use rand::thread_rng;
use std::hint::black_box;
use wasm_bindgen::prelude::*;

// ── 1. Floating Point 32 (Single Precision) ────────────

/// Runs a hot loop of F32 operations (Multiply & Add)
/// We take start_a, b, and c from JS so the compiler CANNOT constant-fold the loop.
/// Note: Does NOT use FMA (fused multiply-add) to test basic ALU throughput.
#[wasm_bindgen]
#[inline(never)]
pub fn bench_fp32(iterations: u32, start_a: f32, b: f32, c: f32) -> f32 {
    // Validate inputs
    if iterations == 0 {
        return start_a;
    }

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
#[inline(never)]
pub fn bench_fp64(iterations: u32, start_a: f64, b: f64, c: f64) -> f64 {
    // Validate inputs
    if iterations == 0 {
        return start_a;
    }

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
#[inline(never)]
pub fn bench_int(iterations: u32, start_a: u64, b: u64, c: u64) -> u64 {
    // Validate inputs
    if iterations == 0 {
        return start_a;
    }

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
#[inline(never)]
pub fn bench_simd_auto(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    // Validate inputs
    if iterations == 0 {
        return start_a;
    }

    bench_simd_impl(iterations, start_a, b_val, c_val)
}

#[cfg(not(target_feature = "simd128"))]
#[inline(never)]
fn bench_simd_impl(iterations: u32, start_a: f32, b_val: f32, c_val: f32) -> f32 {
    bench_simd_scalar(iterations, start_a, b_val, c_val)
}

#[cfg(target_feature = "simd128")]
#[inline(never)]
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
    use std::arch::wasm32::{f32x4_add, f32x4_extract_lane, f32x4_mul, f32x4_splat, v128};

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
#[inline(never)]
pub fn bench_memory_bandwidth(data: &mut [f64]) -> f64 {
    // Validate inputs
    if data.is_empty() {
        return 0.0;
    }

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
#[inline(never)]
pub fn bench_cache_latency(data: &[u32], iterations: u32) -> u32 {
    // Validate inputs
    if data.is_empty() || iterations == 0 {
        return 0;
    }

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

/// Helper function to generate a randomized pointer-chasing array.
/// This should be called from JavaScript to prepare the data.
#[wasm_bindgen]
#[inline(never)]
pub fn generate_random_pointer_array(size: usize) -> Vec<u32> {
    // Validate inputs
    if size == 0 {
        return Vec::new();
    }

    let mut indices: Vec<u32> = (0..size as u32).collect();

    // Fisher-Yates shuffle for true random walk (defeats prefetcher)
    use rand::seq::SliceRandom;
    let mut rng = thread_rng();
    indices.shuffle(&mut rng);

    // Create the linked list in an array
    let mut result = vec![0; size];
    for i in 0..size - 1 {
        result[indices[i] as usize] = indices[i + 1];
    }
    result[indices[size - 1] as usize] = indices[0];

    result
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
#[inline(never)]
pub fn bench_branch_predict(data: &[u8], iterations: u32) -> u32 {
    // Validate inputs
    if data.is_empty() || iterations == 0 {
        return 0;
    }

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
#[inline(never)]
pub fn bench_clock(iterations: u32, seed: u32) -> u32 {
    // Validate inputs
    if iterations == 0 {
        return seed | 1;
    }

    let mut a: u32 = seed | 1;
    for _ in 0..iterations {
        a = a.wrapping_add(1);
        // Prevent algebraic simplification of the full loop into a constant-time expression.
        black_box(a);
    }
    a
}

/// Calibrates the number of iterations needed to get a stable timing measurement.
/// This should be called from JavaScript to determine the appropriate iteration count.
#[wasm_bindgen]
#[inline(never)]
pub fn calibrate_clock(iterations: u32) -> u32 {
    // Simple implementation - could be enhanced with multiple samples
    if iterations == 0 {
        return 1000000;
    }
    iterations
}

// ── 9. Compression (LZ77-style) ────────────

/// Simple LZ77-style compression kernel.
/// Iterates through a buffer finding long matches in previous history.
/// Returns a dummy checksum of the compressed stream.
#[wasm_bindgen]
#[inline(never)]
pub fn bench_compress(data: &[u8], window_size: u32) -> u32 {
    // Validate inputs
    if data.is_empty() || window_size == 0 {
        return 0;
    }

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

#[wasm_bindgen]
#[inline(never)]
pub fn bench_decompress(compressed_commands: &[u32], iterations: u32) -> u32 {
    // Validate inputs
    if compressed_commands.is_empty() || iterations == 0 {
        return 0;
    }

    // Command format:
    // - Literal: high bit = 0, low 8 bits = byte value
    // - Match  : high bit = 1, bits 16..30 = length, bits 0..16 = distance - 1
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bench_fp32_basic() {
        let result = bench_fp32(100, 1.0, 0.99999, 0.00001);
        assert!(result >= 0.0 && result <= 2.0);
    }

    #[test]
    fn test_bench_fp64_basic() {
        let result = bench_fp64(100, 1.0, 0.9999999, 0.0000001);
        assert!(result >= 0.0 && result <= 2.0);
    }

    #[test]
    fn test_bench_fp32_zero_iterations() {
        let result = bench_fp32(0, 1.0, 2.0, 3.0);
        assert_eq!(result, 1.0);
    }

    #[test]
    fn test_bench_fp64_zero_iterations() {
        let result = bench_fp64(0, 1.0, 2.0, 3.0);
        assert_eq!(result, 1.0);
    }

    #[test]
    fn test_bench_int_basic() {
        let result = bench_int(10, 1, 2, 3);
        assert!(result > 1);
    }

    #[test]
    fn test_bench_int_wrapping() {
        // Test that wrapping arithmetic works correctly
        // With u64::MAX, after 1 iteration (10 operations): (MAX * 1) + 1 = 0 (wraparound) then +1 nine more times = 9
        let result = bench_int(1, u64::MAX, 1, 1);
        assert_eq!(result, 9);
    }

    #[test]
    fn test_bench_memory_bandwidth_basic() {
        let mut data = vec![1.0f64; 100];
        let result = bench_memory_bandwidth(&mut data);
        assert_eq!(result, 100.0);
        for val in data {
            assert_eq!(val, 100.0);
        }
    }

    #[test]
    fn test_generate_random_pointer_array() {
        let size = 1000;
        let result = generate_random_pointer_array(size);
        assert_eq!(result.len(), size);

        // Check that all indices are present (permutation of 0..size)
        let mut sorted: Vec<u32> = result.clone();
        sorted.sort();
        for i in 0..size {
            assert_eq!(sorted[i], i as u32);
        }

        // Check that it forms a cycle
        let mut visited = vec![false; size];
        let mut curr = 0;
        for _ in 0..size {
            if visited[curr] {
                panic!("Cycle broken");
            }
            visited[curr] = true;
            curr = result[curr] as usize;
        }
    }

    #[test]
    fn test_bench_compress_basic() {
        // Simple repetitive data for LZ77
        let data = vec![0x00, 0x01, 0x02, 0x03, 0x00, 0x01, 0x02, 0x03];
        let result = bench_compress(&data, 4);
        assert!(result > 0);
    }

    #[test]
    fn test_bench_decompress_basic() {
        // Create a simple command stream
        let commands = vec![
            0x000000FF,                 // literal 0xFF
            0x80000000 | (8 << 16) | 0, // match length 8, distance 1
        ];
        let result = bench_decompress(&commands, 10);
        assert!(result > 0);
    }
}
