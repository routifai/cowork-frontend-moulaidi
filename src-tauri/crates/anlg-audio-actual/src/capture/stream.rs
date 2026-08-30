//! Vendored from anarlog's `crates/audio-actual/src/capture/stream.rs`, with
//! the AEC (`anlg-aec`) and reference-alignment (`anlg-audio-sync`) machinery
//! stripped out — both pulled in an ONNX-runtime dependency for zero benefit
//! to Hypatia's v1 (no acoustic echo cancellation requirement; the mixdown
//! just sums mic + speaker). `CaptureFrame.aec_mic` is always `None` here.

use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use anlg_resampler::ResampleExtDynamicNew;
use futures_util::{Stream, StreamExt};
use tokio::task::JoinHandle;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use anlg_audio::{CaptureFrame, CaptureStream, Error};

use crate::mic::MicInput;
use crate::speaker::SpeakerInput;

use super::joiner::Joiner;

pub(crate) type ChunkStream =
    Pin<Box<dyn Stream<Item = Result<Vec<f32>, anlg_resampler::Error>> + Send>>;

struct CaptureStreamInner {
    inner: ReceiverStream<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    task: JoinHandle<()>,
}

impl Stream for CaptureStreamInner {
    type Item = Result<CaptureFrame, Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.inner).poll_next(cx)
    }
}

impl Drop for CaptureStreamInner {
    fn drop(&mut self) {
        self.cancel_token.cancel();
        self.task.abort();
    }
}

pub(crate) fn setup_mic_stream(
    sample_rate: u32,
    chunk_size: usize,
    mic_device: Option<String>,
) -> Result<ChunkStream, Error> {
    let mic = MicInput::new(mic_device).map_err(|_| Error::MicOpenFailed)?;
    mic.stream()?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::MicStreamSetupFailed)
}

pub(crate) fn setup_speaker_stream(
    sample_rate: u32,
    chunk_size: usize,
    speaker_device: Option<String>,
) -> Result<ChunkStream, Error> {
    let speaker = SpeakerInput::new(speaker_device)
        .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?;
    speaker
        .stream()
        .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::SpeakerStreamSetupFailed)
}

pub(crate) fn open_dual(
    mic_stream: ChunkStream,
    speaker_stream: ChunkStream,
) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_dual_loop(
        tx,
        cancel_token.clone(),
        mic_stream,
        speaker_stream,
    ));

    CaptureStream::new(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CaptureSide {
    Mic,
    Speaker,
}

pub(crate) fn open_single(chunk_stream: ChunkStream, side: CaptureSide) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_single_loop(
        tx,
        cancel_token.clone(),
        chunk_stream,
        side,
    ));

    CaptureStream::new(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
}

enum StreamResult {
    Continue,
    Stop,
    Failed(Error),
}

async fn run_dual_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    mut mic_stream: ChunkStream,
    mut speaker_stream: ChunkStream,
) {
    let mut joiner = Joiner::new();

    loop {
        let result = tokio::select! {
            _ = cancel_token.cancelled() => StreamResult::Stop,
            item = mic_stream.next() => {
                handle_stream_item(item, CaptureSide::Mic, &mut joiner)
            }
            item = speaker_stream.next() => {
                handle_stream_item(item, CaptureSide::Speaker, &mut joiner)
            }
        };

        match result {
            StreamResult::Continue => {
                while let Some((raw_mic, raw_speaker)) = joiner.pop_pair() {
                    let raw_mic = Arc::<[f32]>::from(raw_mic);
                    let raw_speaker = Arc::<[f32]>::from(raw_speaker);
                    if tx
                        .send(Ok(CaptureFrame {
                            raw_mic,
                            raw_speaker,
                            aec_mic: None,
                        }))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
            StreamResult::Stop => return,
            StreamResult::Failed(err) => {
                let _ = tx.send(Err(err)).await;
                return;
            }
        }
    }
}

async fn run_single_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    mut chunk_stream: ChunkStream,
    side: CaptureSide,
) {
    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => return,
            item = chunk_stream.next() => {
                match item {
                    Some(Ok(data)) => {
                        let data = Arc::<[f32]>::from(data);
                        let silence = Arc::<[f32]>::from(vec![0.0f32; data.len()]);
                        let frame = match side {
                            CaptureSide::Mic => CaptureFrame {
                                raw_mic: data,
                                raw_speaker: silence,
                                aec_mic: None,
                            },
                            CaptureSide::Speaker => CaptureFrame {
                                raw_mic: silence,
                                raw_speaker: data,
                                aec_mic: None,
                            },
                        };
                        if tx.send(Ok(frame)).await.is_err() {
                            return;
                        }
                    }
                    Some(Err(_)) => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicResampleFailed,
                            CaptureSide::Speaker => Error::SpeakerResampleFailed,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                    None => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicStreamEnded,
                            CaptureSide::Speaker => Error::SpeakerStreamEnded,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                }
            }
        }
    }
}

fn handle_stream_item(
    item: Option<Result<Vec<f32>, anlg_resampler::Error>>,
    side: CaptureSide,
    joiner: &mut Joiner,
) -> StreamResult {
    match item {
        Some(Ok(data)) => {
            match side {
                CaptureSide::Mic => joiner.push_mic(data),
                CaptureSide::Speaker => joiner.push_speaker(data),
            }
            StreamResult::Continue
        }
        Some(Err(_)) => StreamResult::Failed(match side {
            CaptureSide::Mic => Error::MicResampleFailed,
            CaptureSide::Speaker => Error::SpeakerResampleFailed,
        }),
        None => StreamResult::Failed(match side {
            CaptureSide::Mic => Error::MicStreamEnded,
            CaptureSide::Speaker => Error::SpeakerStreamEnded,
        }),
    }
}
