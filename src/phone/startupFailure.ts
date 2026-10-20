/**
 * In the app's place when the phone's start fails before the first render
 * (the vault or sync could not be set up): what went wrong, and Try again,
 * which starts the app afresh. Without it the page stayed blank. Plain DOM in
 * the system's colours, as the app's theme is not loaded yet.
 */
export function showStartupFailure(error: unknown, retry = () => location.reload()) {
  const screen = document.createElement("div");
  screen.setAttribute("role", "alert");
  screen.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:16px;padding:24px;font:16px system-ui;text-align:center;" +
    "color-scheme:light dark;background:Canvas;color:CanvasText";
  const note = document.createElement("p");
  note.textContent = `Boojy Notes couldn't start: ${(error as Error)?.message ?? String(error)}`;
  const button = document.createElement("button");
  button.textContent = "Try again";
  button.style.cssText = "font:inherit;padding:12px 20px";
  button.onclick = () => retry();
  screen.append(note, button);
  document.body.append(screen);
}
