import { memo } from "react";
import TopBarMobile from "./mobile/TopBarMobile";

/**
 * There is no desktop top bar. Desktop/web chrome is two pinned buttons — see
 * `EditorChrome`. Mobile keeps its own top bar unchanged.
 *
 * Tabs and split view were removed with the single-active-note model
 * (useActiveNote); restoring a tab strip means reverting that refactor,
 * not just remounting a component.
 */
export default memo(function TopBar(props) {
  if (props.isMobile) return <TopBarMobile {...props} />;
  return null;
});
