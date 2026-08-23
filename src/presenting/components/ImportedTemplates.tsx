/**
 * Imported Template entry path: upload your own .pptx design, get a new
 * workspace-scoped template back. Distinct from the Preset Template grid
 * (bundled designs) and from "Upload a document template" below it (that's
 * content, not design — see presenting/CONTEXT.md in hypatia-backend).
 */
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Trash2 } from "lucide-react";
import { useEffect } from "react";
import {
	deleteImportedTemplate,
	importTemplate,
	listImportedTemplates,
} from "../api/presentingApi";
import { usePresentingDispatch, usePresentingSelector } from "../state/PresentingProvider";
import {
	removeImportedTemplate,
	setImportError,
	setImported,
	setImportedTemplatesList,
	setImporting,
} from "../state/slices/importedTemplateSlice";

export interface ImportedTemplatesProps {
	provider?: string;
	model?: string;
	selectedTemplateId: string;
	onSelect: (templateId: string) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function ImportedTemplates({
	provider,
	model,
	selectedTemplateId,
	onSelect,
}: ImportedTemplatesProps) {
	const { templates, isImporting, importError } = usePresentingSelector((s) => s.importedTemplate);
	const dispatch = usePresentingDispatch();

	useEffect(() => {
		let active = true;
		listImportedTemplates()
			.then((list) => {
				if (active) dispatch(setImportedTemplatesList(list));
			})
			.catch(() => {
				// Best-effort — an empty "My templates" section is an acceptable
				// degraded state if the workspace store can't be read.
			});
		return () => {
			active = false;
		};
	}, [dispatch]);

	const chooseTemplate = async () => {
		if (!provider || !model) return;
		try {
			const path = await open({
				multiple: false,
				filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
			});
			if (typeof path !== "string") return;
			dispatch(setImporting());
			const summary = await importTemplate(path, undefined, provider, model);
			dispatch(setImported(summary));
			onSelect(summary.id);
		} catch (cause) {
			dispatch(setImportError(`Could not import that template: ${errorMessage(cause)}`));
		}
	};

	const removeTemplate = async (templateId: string) => {
		try {
			await deleteImportedTemplate(templateId);
			dispatch(removeImportedTemplate(templateId));
		} catch {
			// Best-effort — leave it in the list if deletion failed rather than
			// silently pretend it's gone.
		}
	};

	return (
		<div className="mt-6">
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-sm font-medium">My templates</h2>
				<button
					type="button"
					onClick={chooseTemplate}
					disabled={isImporting || !provider || !model}
					className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
				>
					<FolderOpen className="h-3.5 w-3.5" />
					{isImporting ? "Importing…" : "Import your own template"}
				</button>
			</div>
			{importError && <p className="mb-3 text-xs text-destructive">{importError}</p>}
			{templates.length > 0 && (
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{templates.map((item) => (
						<div
							key={item.id}
							role="button"
							tabIndex={0}
							onClick={() => onSelect(item.id)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") onSelect(item.id);
							}}
							className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedTemplateId === item.id ? "border-primary" : "border-border"}`}
						>
							<div className="aspect-video overflow-hidden bg-muted">
								<img
									src={item.thumbnail}
									alt={`${item.name} template preview`}
									className="h-full w-full object-cover"
								/>
							</div>
							<div className="flex items-center justify-between px-3 py-2.5">
								<span className="truncate text-xs font-medium">{item.name}</span>
								<button
									type="button"
									aria-label={`Delete ${item.name}`}
									onClick={(event) => {
										event.stopPropagation();
										removeTemplate(item.id);
									}}
									className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
								>
									<Trash2 className="h-3 w-3" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
			{!provider || !model ? (
				<p className="mt-2 text-xs text-amber-600">
					Select a Cowork model before importing a template.
				</p>
			) : null}
		</div>
	);
}
