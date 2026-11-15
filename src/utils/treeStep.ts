import { PHONE_TREE_INDENT, TREE_INDENT } from "../constants/layout";
import { isPhone } from "./platform";

/**
 * The step per level a tree is drawn with on this platform: the sidebar's
 * and the folder popup's alike, so the two never step apart. Read this, never
 * the constants it chooses between.
 */
export const treeIndent = isPhone ? PHONE_TREE_INDENT : TREE_INDENT;
