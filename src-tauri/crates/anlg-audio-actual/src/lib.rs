//! Vendored from anarlog's `crates/audio-actual`. Trimmed for Hypatia's v1
//! "Record Meeting" feature: capture-only (mic + macOS system-audio), no
//! playback (`AudioOutput`), no generic `AudioProvider` trait object (the
//! meeting-audio glue calls `AudioInput` directly) — see the plan doc for
//! why AEC/reference-alignment were dropped from `capture/stream.rs` too.

mod async_ring;
mod capture;
mod mic;
mod norm;
mod rt_ring;
mod speaker;

pub use mic::*;
pub use norm::*;
pub use speaker::*;

pub use cpal;

pub use anlg_audio::{CaptureConfig, CaptureFrame, CaptureStream, Error};
pub use anlg_audio_interface::AsyncSource;
use futures_util::Stream;

pub const TAP_DEVICE_NAME: &str = "hypatia-audio-tap";

pub enum AudioSource {
    RealtimeMic,
    RealtimeSpeaker,
}

pub struct AudioInput {
    source: AudioSource,
    mic: Option<MicInput>,
    speaker: Option<SpeakerInput>,
    // `SpeakerInput::stream` consumes the input, so the rate is cached up front to keep
    // `sample_rate` answerable once the speaker has been handed off.
    speaker_sample_rate: u32,
}

impl AudioInput {
    pub fn get_default_device_name() -> String {
        MicInput::default_device_name()
    }

    pub fn sample_rate(&self) -> u32 {
        match &self.source {
            AudioSource::RealtimeMic => self.mic.as_ref().unwrap().sample_rate(),
            AudioSource::RealtimeSpeaker => self.speaker_sample_rate,
        }
    }

    pub fn list_mic_devices() -> Vec<String> {
        MicInput::list_devices()
    }

    pub fn list_speaker_devices() -> Vec<String> {
        SpeakerInput::list_devices()
    }

    pub fn from_mic_and_speaker(config: CaptureConfig) -> Result<CaptureStream, Error> {
        capture::open_capture(config)
    }

    pub fn from_mic(device_name: Option<String>) -> Result<Self, Error> {
        let mic = MicInput::new(device_name)?;

        Ok(Self {
            source: AudioSource::RealtimeMic,
            mic: Some(mic),
            speaker: None,
            speaker_sample_rate: 0,
        })
    }

    pub fn from_speaker(device: Option<String>) -> Result<Self, Error> {
        let speaker = SpeakerInput::new(device)
            .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?;
        let speaker_sample_rate = speaker.sample_rate();

        Ok(Self {
            source: AudioSource::RealtimeSpeaker,
            mic: None,
            speaker: Some(speaker),
            speaker_sample_rate,
        })
    }

    pub fn stream(&mut self) -> Result<AudioStream, Error> {
        Ok(match &self.source {
            AudioSource::RealtimeMic => AudioStream::RealtimeMic {
                mic: self.mic.as_ref().unwrap().stream()?,
            },
            AudioSource::RealtimeSpeaker => {
                let speaker = self
                    .speaker
                    .take()
                    .ok_or(Error::SpeakerStreamSetupFailed)?
                    .stream()
                    .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?;

                AudioStream::RealtimeSpeaker { speaker }
            }
        })
    }
}

pub enum AudioStream {
    RealtimeMic { mic: MicStream },
    RealtimeSpeaker { speaker: SpeakerStream },
}

impl Stream for AudioStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        use futures_util::StreamExt;

        match &mut *self {
            AudioStream::RealtimeMic { mic } => mic.poll_next_unpin(cx),
            AudioStream::RealtimeSpeaker { speaker } => speaker.poll_next_unpin(cx),
        }
    }
}

impl AsyncSource for AudioStream {
    fn as_stream(&mut self) -> impl Stream<Item = f32> + '_ {
        self
    }

    fn sample_rate(&self) -> u32 {
        match self {
            AudioStream::RealtimeMic { mic } => mic.sample_rate(),
            AudioStream::RealtimeSpeaker { speaker } => speaker.sample_rate(),
        }
    }
}
