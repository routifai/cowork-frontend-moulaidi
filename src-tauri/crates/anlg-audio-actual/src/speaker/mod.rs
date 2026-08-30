//! System-audio ("speaker"/loopback) capture. macOS-only for now — see
//! `macos.rs` for the real Core Audio process-tap implementation. Vendored
//! from anarlog's `crates/audio-actual`; the Windows/Linux backends and the
//! AEC-reference-alignment machinery were deliberately dropped (not needed
//! for Hypatia's macOS-only v1 — see the plan doc).

pub(super) const CHUNK_SIZE: usize = 256;
pub(super) const BUFFER_SIZE: usize = CHUNK_SIZE * 256;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::{SpeakerInput, SpeakerStream};

#[cfg(not(target_os = "macos"))]
pub struct SpeakerInput;

#[cfg(not(target_os = "macos"))]
impl SpeakerInput {
	pub fn new(_device: Option<String>) -> anyhow::Result<Self> {
		anyhow::bail!("system-audio capture is only supported on macOS")
	}

	pub fn list_devices() -> Vec<String> {
		Vec::new()
	}

	pub fn sample_rate(&self) -> u32 {
		0
	}

	pub fn stream(self) -> anyhow::Result<SpeakerStream> {
		anyhow::bail!("system-audio capture is only supported on macOS")
	}
}

#[cfg(not(target_os = "macos"))]
pub struct SpeakerStream;

#[cfg(not(target_os = "macos"))]
impl futures_util::Stream for SpeakerStream {
	type Item = f32;
	fn poll_next(
		self: std::pin::Pin<&mut Self>,
		_cx: &mut std::task::Context<'_>,
	) -> std::task::Poll<Option<Self::Item>> {
		std::task::Poll::Ready(None)
	}
}

#[cfg(not(target_os = "macos"))]
impl anlg_audio_interface::AsyncSource for SpeakerStream {
	fn as_stream(&mut self) -> impl futures_util::Stream<Item = f32> + '_ {
		self
	}
	fn sample_rate(&self) -> u32 {
		0
	}
}
