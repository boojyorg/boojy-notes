import { openBlock, registerBlockOpener } from "./blockOpen";

/**
 * Asking a maths block to open its source panel (`blockOpen`): Enter on a
 * selected formula, the slash menu's Maths and the typed `$$ ` all name a
 * block that may not be mounted yet.
 */
export const openMathSource = (blockId: string): void => openBlock(blockId);

/** A mounted maths block's way in; returns its removal. */
export const registerMathOpener = (blockId: string, open: () => void): (() => void) =>
  registerBlockOpener(blockId, () => open());
