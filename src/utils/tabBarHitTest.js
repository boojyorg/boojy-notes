/**
 * Shared utility for tab bar hit-testing during drag operations.
 * Used by both useTabDrag and useSidebarDrag.
 */

/**
 * Find the tab bar element under the cursor.
 * @returns {{ paneId: string, tabBarEl: HTMLElement, rect: DOMRect } | null}
 */
export function findTabBarUnderCursor(clientX, clientY) {
  const tabBars = document.querySelectorAll("[data-pane-tab-bar]");
  for (const el of tabBars) {
    const rect = el.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { paneId: el.dataset.paneTabBar, tabBarEl: el, rect };
    }
  }
  return null;
}

/**
 * Compute the insertion index for a tab being dragged into a tab bar.
 * Compares clientX against each tab's horizontal midpoint.
 * @returns {number} index 0..tabs.length
 */
export function computeInsertionIndex(tabBarEl, clientX) {
  const tabs = tabBarEl.querySelectorAll(".tab-btn");
  for (let i = 0; i < tabs.length; i++) {
    const rect = tabs[i].getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) return i;
  }
  return tabs.length;
}

/**
 * Get the position for the vertical insertion line indicator.
 * @returns {{ x: number, top: number, height: number }}
 */
export function getInsertionLinePosition(tabBarEl, insertIndex) {
  const tabs = tabBarEl.querySelectorAll(".tab-btn");
  const barRect = tabBarEl.getBoundingClientRect();

  if (tabs.length === 0) {
    return { x: barRect.left + 2, top: barRect.top, height: barRect.height };
  }

  if (insertIndex >= tabs.length) {
    // After last tab
    const lastRect = tabs[tabs.length - 1].getBoundingClientRect();
    return { x: lastRect.right, top: barRect.top, height: barRect.height };
  }

  // Before tab at insertIndex
  const targetRect = tabs[insertIndex].getBoundingClientRect();
  return { x: targetRect.left, top: barRect.top, height: barRect.height };
}
