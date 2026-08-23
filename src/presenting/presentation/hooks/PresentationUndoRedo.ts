// @ts-nocheck — isolated legacy Presenton path; not imported by the embedded panel.
import { useCallback } from "react";
import { useDispatch, useSelector } from "@/presenting/compat/redux";
import { redo, undo } from "@/presenting/state/slices/undoRedoSlice";
import { useKeyboardShortcut } from "../../hooks/use-keyboard-shortcut";
import { setPresentationData } from "@/presenting/state/slices/presentationGeneration";

export const usePresentationUndoRedo = () => {
  const dispatch = useDispatch();
  const undoRedoState = useSelector((state) => state.undoRedo);
  const { presentationData } = useSelector(
    (state) => state.generation
  );

  const canUndo = undoRedoState.past.length > 0;
  const canRedo = undoRedoState.future.length > 0;

  const applySlidesSnapshot = useCallback(
    (slidesSnapshot: unknown) => {
      if (!presentationData || !Array.isArray(slidesSnapshot)) {
        return;
      }

      dispatch(
        setPresentationData({
          ...presentationData,
          slides: slidesSnapshot,
        })
      );
    },
    [dispatch, presentationData]
  );

  const onUndo = useCallback(() => {
    if (!canUndo) {
      return;
    }

    const previousState = undoRedoState.past[undoRedoState.past.length - 1];
    if (!previousState) {
      return;
    }

    dispatch(undo());
    applySlidesSnapshot(previousState.slides);
  }, [applySlidesSnapshot, canUndo, dispatch, undoRedoState.past]);

  const onRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    const nextState = undoRedoState.future[0];
    if (!nextState) {
      return;
    }

    dispatch(redo());
    applySlidesSnapshot(nextState.slides);
  }, [applySlidesSnapshot, canRedo, dispatch, undoRedoState.future]);

  // Handle undo (Ctrl + Z)
  useKeyboardShortcut(
    ["z"],
    (e) => {
      if (e.ctrlKey && !e.shiftKey && canUndo) {
        e.preventDefault();
        onUndo();
      }
    },
    [canUndo, onUndo]
  );

  // Handle redo (Ctrl + Shift + Z)
  useKeyboardShortcut(
    ["z"],
    (e) => {
      if (e.ctrlKey && e.shiftKey && canRedo) {
        e.preventDefault();
        onRedo();
      }
    },
    [canRedo, onRedo]
  );

  // Handle redo (Ctrl + Y)
  useKeyboardShortcut(
    ["y"],
    (e) => {
      if (e.ctrlKey && canRedo) {
        e.preventDefault();
        onRedo();
      }
    },
    [canRedo, onRedo]
  );

  return { onUndo, onRedo, canUndo, canRedo };
};
