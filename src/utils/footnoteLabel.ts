/** The label a reference names: `[^proof]` → `proof`. */
export function refLabel(text: string): string {
  return text.replace(/^\[\^/, "").replace(/\]$/, "");
}
