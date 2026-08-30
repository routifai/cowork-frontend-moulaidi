//! Vendored from anarlog's `crates/audio-utils` — trimmed to just the PCM
//! sample-format conversion helpers `speaker/macos.rs` (in `anlg-audio-actual`)
//! needs. The full crate also has WAV/vorbis encode/decode, resampling, and
//! playback helpers that Hypatia's capture-only pipeline doesn't use.

#[inline]
pub fn pcm_f32_to_f32(sample: f32) -> f32 {
    sample
}

#[inline]
pub fn pcm_f64_to_f32(sample: f64) -> f32 {
    sample as f32
}

#[inline]
pub fn pcm_i16_to_f32(sample: i16) -> f32 {
    const SCALE: f32 = i16::MAX as f32;
    if sample == i16::MIN {
        -1.0
    } else {
        sample as f32 / SCALE
    }
}

#[inline]
pub fn pcm_i32_to_f32(sample: i32) -> f32 {
    const SCALE: f32 = i32::MAX as f32;
    if sample == i32::MIN {
        -1.0
    } else {
        sample as f32 / SCALE
    }
}
