export function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

export function rgbToHex(r, g, b) {
  const h = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2,"0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
