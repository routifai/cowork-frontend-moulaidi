//! "Record Meeting" — native mic + macOS system-audio capture, mixed down to
//! one mono PCM16 stream and forwarded to the Node sidecar over the existing
//! stdin/stdout JSON-line bridge (base64 payload — same precedent as
//! `SteerImage`'s image data). The sidecar owns every provider-specific
//! thing (OpenAI Whisper API / AWS Transcribe Streaming, credentials); this
//! module only knows how to capture and stream raw audio.
//!
//! macOS-only: `anlg-audio-actual`'s system-audio capture is a Core Audio
//! process-tap with no Windows/Linux equivalent vendored (see the plan doc).

use crate::{next_request_id, scmd, scmd_r, AppState};
use anlg_audio_actual::{AudioInput, CaptureConfig};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;

const SAMPLE_RATE: u32 = 16_000;
const CHUNK_SIZE: usize = 1_600; // 100ms @ 16kHz

#[derive(Default)]
pub struct MeetingState {
    cancel: tokio::sync::Mutex<Option<CancellationToken>>,
}

/// Mix mic + system-audio to one mono channel, matching anarlog's own
/// `mix_audio_f32` (sum, clamped to the valid range) — no diarization, no
/// separate tracks, just "everything anyone said."
fn mix_mono(mic: &[f32], speaker: &[f32]) -> Vec<f32> {
    let len = mic.len().max(speaker.len());
    (0..len)
        .map(|i| {
            let m = mic.get(i).copied().unwrap_or(0.0);
            let s = speaker.get(i).copied().unwrap_or(0.0);
            (m + s).clamp(-1.0, 1.0)
        })
        .collect()
}

fn f32_to_pcm16le_base64(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let scaled = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        bytes.extend_from_slice(&scaled.to_le_bytes());
    }
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
}

#[tauri::command]
pub async fn start_meeting_recording(
    app: AppHandle,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut guard = s.meeting.cancel.lock().await;
    if guard.is_some() {
        return Err("already recording".to_string());
    }
    let token = CancellationToken::new();
    *guard = Some(token.clone());
    drop(guard);

    let start_id = format!("mr-{}", next_request_id());
    let state = app.state::<AppState>();
    // Request/response (not fire-and-forget scmd): the frontend needs the
    // sidecar's `{ success, provider }` reply, not just an ack that the line
    // was written.
    let result = scmd_r(
        &state,
        &serde_json::json!({"type":"start_meeting_recording","id":start_id}),
        std::time::Duration::from_secs(20),
    )
    .await?;

    tokio::spawn(capture_loop(app, token));
    Ok(result)
}

#[tauri::command]
pub async fn stop_meeting_recording(
    app: AppHandle,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = s.meeting.cancel.lock().await.take();
    if let Some(token) = token {
        token.cancel();
    }
    let stop_id = format!("mr-{}", next_request_id());
    let state = app.state::<AppState>();
    // Request/response: the frontend needs the sidecar's assembled
    // `{ transcript }`, not just an ack. Generous timeout — stopping flushes
    // any buffered OpenAI chunk / closes the AWS stream, which can take a
    // few seconds.
    scmd_r(
        &state,
        &serde_json::json!({"type":"stop_meeting_recording","id":stop_id}),
        std::time::Duration::from_secs(30),
    )
    .await
}

#[tauri::command]
pub async fn save_meeting(
    title: String,
    transcript: String,
    meeting_id: Option<String>,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let id = format!("sm-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({
            "type": "save_meeting",
            "id": id,
            "title": title,
            "transcript": transcript,
            "meetingId": meeting_id,
        }),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
pub async fn summarize_meeting(
    meeting_id: String,
    template: Option<String>,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let id = format!("sz-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"summarize_meeting","id":id,"meetingId":meeting_id,"template":template}),
        std::time::Duration::from_secs(60),
    )
    .await
}

#[tauri::command]
pub async fn list_meetings(s: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let id = format!("lm-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"list_meetings","id":id}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
pub async fn get_meeting(
    meeting_id: String,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let id = format!("gm-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_meeting","id":id,"meetingId":meeting_id}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
pub async fn delete_meeting(
    meeting_id: String,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let id = format!("dm-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"delete_meeting","id":id,"meetingId":meeting_id}),
        std::time::Duration::from_secs(10),
    )
    .await
}

async fn capture_loop(app: AppHandle, cancel: CancellationToken) {
    let config = CaptureConfig {
        sample_rate: SAMPLE_RATE,
        chunk_size: CHUNK_SIZE,
        mic_device: None,
        speaker_device: None,
        enable_aec: false,
    };

    let mut stream = match AudioInput::from_mic_and_speaker(config) {
        Ok(stream) => stream,
        Err(error) => {
            log::error!("meeting capture: failed to open mic+speaker stream: {error}");
            let _ = app.emit(
                "meeting_capture_error",
                serde_json::json!({"error": error.to_string()}),
            );
            return;
        }
    };

    loop {
        let frame = tokio::select! {
            _ = cancel.cancelled() => break,
            item = stream.next() => item,
        };

        let Some(frame) = frame else { break };
        let frame = match frame {
            Ok(frame) => frame,
            Err(error) => {
                log::error!("meeting capture: stream error: {error}");
                let _ = app.emit(
                    "meeting_capture_error",
                    serde_json::json!({"error": error.to_string()}),
                );
                break;
            }
        };

        let mixed = mix_mono(&frame.raw_mic, &frame.raw_speaker);
        let data = f32_to_pcm16le_base64(&mixed);

        let state = app.state::<AppState>();
        let id = format!("mac-{}", next_request_id());
        if let Err(error) = scmd(
            &state,
            &serde_json::json!({
                "type": "meeting_audio_chunk",
                "id": id,
                "sampleRate": SAMPLE_RATE,
                "data": data,
            }),
        )
        .await
        {
            log::error!("meeting capture: failed to forward audio chunk: {error}");
            break;
        }
    }
}
