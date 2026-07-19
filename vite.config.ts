import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	root: ".",
	plugins: [react(), tailwindcss()],

	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			exclude: ["node_modules/", "src/test/", "src/**/*.d.ts", "src/main.tsx"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "./dist",
		emptyOutDir: true,
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		watch: {
			ignored: ["**/node_modules/**", "**/target/**", "**/node_modules/**", "**/node_modules/**"],
		},
	},
});
