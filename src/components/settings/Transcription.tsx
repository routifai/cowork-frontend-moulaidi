import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type Provider = "openai" | "aws";

interface TranscriptionSettings {
	transcriptionProvider?: Provider;
	openaiApiKey?: string;
	awsAccessKeyId?: string;
	awsSecretAccessKey?: string;
	awsRegion?: string;
}

/**
 * Settings → Transcription — credentials for "Record Meeting"'s two
 * transcription providers (OpenAI Whisper API, AWS Transcribe Streaming).
 * Stored via the same generic get_settings/save_settings the rest of
 * Settings already uses (settings-store.ts's whole-object partial merge) —
 * no dedicated credential store needed for this.
 */
export function Transcription() {
	const [provider, setProvider] = useState<Provider>("openai");
	const [openaiApiKey, setOpenaiApiKey] = useState("");
	const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
	const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
	const [awsRegion, setAwsRegion] = useState("us-east-1");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const settings = await invoke<TranscriptionSettings>("get_settings");
				if (!alive) return;
				setProvider(settings.transcriptionProvider ?? "openai");
				setOpenaiApiKey(settings.openaiApiKey ?? "");
				setAwsAccessKeyId(settings.awsAccessKeyId ?? "");
				setAwsSecretAccessKey(settings.awsSecretAccessKey ?? "");
				setAwsRegion(settings.awsRegion ?? "us-east-1");
			} catch {
				// sidecar not ready yet
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	async function handleSave() {
		setSaving(true);
		try {
			await invoke("save_settings", {
				settings: {
					transcriptionProvider: provider,
					openaiApiKey,
					awsAccessKeyId,
					awsSecretAccessKey,
					awsRegion,
				},
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch {
			// ignore
		} finally {
			setSaving(false);
		}
	}

	return (
		<section>
			<h2 className="text-sm font-semibold text-foreground mb-1">Transcription</h2>
			<p className="text-xs text-muted-foreground mb-5">
				Credentials for "Record Meeting"'s live transcription. Pick one provider.
			</p>

			<div className="flex items-center gap-3 text-[11px] mb-4">
				<label className="flex items-center gap-1.5">
					<input
						type="radio"
						name="transcription-provider"
						checked={provider === "openai"}
						onChange={() => setProvider("openai")}
					/>
					OpenAI Whisper API
				</label>
				<label className="flex items-center gap-1.5">
					<input
						type="radio"
						name="transcription-provider"
						checked={provider === "aws"}
						onChange={() => setProvider("aws")}
					/>
					AWS Transcribe (streaming)
				</label>
			</div>

			{provider === "openai" ? (
				<div>
					<label htmlFor="openai-api-key" className="block text-[11px] text-muted-foreground mb-1">
						OpenAI API key
					</label>
					<input
						id="openai-api-key"
						type="password"
						value={openaiApiKey}
						onChange={(e) => setOpenaiApiKey(e.target.value)}
						placeholder="sk-…"
						disabled={loading}
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
					/>
				</div>
			) : (
				<div className="space-y-2">
					<input
						type="text"
						value={awsAccessKeyId}
						onChange={(e) => setAwsAccessKeyId(e.target.value)}
						placeholder="AWS access key ID"
						disabled={loading}
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
					/>
					<input
						type="password"
						value={awsSecretAccessKey}
						onChange={(e) => setAwsSecretAccessKey(e.target.value)}
						placeholder="AWS secret access key"
						disabled={loading}
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
					/>
					<input
						type="text"
						value={awsRegion}
						onChange={(e) => setAwsRegion(e.target.value)}
						placeholder="Region, e.g. us-east-1"
						disabled={loading}
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
					/>
				</div>
			)}

			<div className="flex items-center gap-3 mt-4">
				<button
					type="button"
					onClick={handleSave}
					disabled={saving || loading}
					className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save"}
				</button>
				{saved && <span className="text-xs text-primary font-medium">Saved!</span>}
			</div>
		</section>
	);
}
