import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

export interface FileInfo {
	path: string;
	name: string;
}

export interface UseFilePickerReturn {
	selectedFiles: FileInfo[];
	pickFiles: () => Promise<void>;
	removeFile: (path: string) => void;
	clearFiles: () => void;
}

export function useFilePicker(): UseFilePickerReturn {
	const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);

	const pickFiles = useCallback(async () => {
		const result = await open({
			multiple: true,
			title: "Select files",
		});

		if (!result) {
			// User cancelled the dialog
			return;
		}

		const paths = Array.isArray(result) ? result : [result];

		const files: FileInfo[] = paths.map((p) => ({
			path: p,
			name: p.split("/").pop() ?? p.split("\\").pop() ?? p,
		}));

		setSelectedFiles(files);
	}, []);

	const removeFile = useCallback((path: string) => {
		setSelectedFiles((prev) => prev.filter((f) => f.path !== path));
	}, []);

	const clearFiles = useCallback(() => {
		setSelectedFiles([]);
	}, []);

	return {
		selectedFiles,
		pickFiles,
		removeFile,
		clearFiles,
	};
}
