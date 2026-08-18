import { memo } from "react";
import TopBarMobile from "./TopBarMobile";

/**
 * Minimal-chrome UI experiment: the desktop top bar (and with it the visible tab
 * strip) is not rendered. Desktop/web chrome is now two pinned buttons — see
 * `EditorChrome`. Mobile keeps its own top bar unchanged.
 *
 * `TopBarDesktop.jsx` and `PaneTabBar.jsx` are intentionally left in the repo and
 * unmounted rather than deleted: tab/pane STATE is still live in BoojyNotes, so
 * restoring the strip is a one-line change back to `<TopBarDesktop {...props} />`.
 */
export default memo(function TopBar(props) {
  if (props.isMobile) return <TopBarMobile {...props} />;
  return null;
});
