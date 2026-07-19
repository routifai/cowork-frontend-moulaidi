import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenameDialog } from "./rename-dialog";

describe("RenameDialog", () => {
	it("prefills the field with the current title", () => {
		render(<RenameDialog open initialTitle="My chat" onClose={vi.fn()} onSave={vi.fn()} />);
		const input = screen.getByLabelText("New chat name") as HTMLInputElement;
		expect(input.value).toBe("My chat");
	});

	it("saves the trimmed title and closes on Save", () => {
		const onSave = vi.fn();
		const onClose = vi.fn();
		render(<RenameDialog open initialTitle="Old" onClose={onClose} onSave={onSave} />);
		const input = screen.getByLabelText("New chat name");
		fireEvent.change(input, { target: { value: "  New name  " } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onSave).toHaveBeenCalledWith("New name");
		expect(onClose).toHaveBeenCalled();
	});

	it("commits on Enter", () => {
		const onSave = vi.fn();
		render(<RenameDialog open initialTitle="Old" onClose={vi.fn()} onSave={onSave} />);
		const input = screen.getByLabelText("New chat name");
		fireEvent.change(input, { target: { value: "Renamed" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSave).toHaveBeenCalledWith("Renamed");
	});

	it("does not save an empty title", () => {
		const onSave = vi.fn();
		render(<RenameDialog open initialTitle="Old" onClose={vi.fn()} onSave={onSave} />);
		const input = screen.getByLabelText("New chat name");
		fireEvent.change(input, { target: { value: "   " } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onSave).not.toHaveBeenCalled();
	});

	it("cancel closes without saving", () => {
		const onSave = vi.fn();
		const onClose = vi.fn();
		render(<RenameDialog open initialTitle="Old" onClose={onClose} onSave={onSave} />);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalled();
		expect(onSave).not.toHaveBeenCalled();
	});
});
