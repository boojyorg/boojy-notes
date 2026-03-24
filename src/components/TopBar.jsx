import { memo } from "react";
import TopBarMobile from "./TopBarMobile";
import TopBarDesktop from "./TopBarDesktop";

export default memo(function TopBar(props) {
  if (props.isMobile) return <TopBarMobile {...props} />;
  return <TopBarDesktop {...props} />;
});
