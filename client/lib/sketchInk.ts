export function sketchInkColor(color: string): string {
  if (!color || typeof color !== "string") {
    return "#111111";
  }

  const trimmed = color.trim().toLowerCase();
  let r = 0;
  let g = 0;
  let b = 0;

  if (trimmed === "white") {
    r = 255;
    g = 255;
    b = 255;
  } else if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    r = parseInt(trimmed.slice(1, 3), 16);
    g = parseInt(trimmed.slice(3, 5), 16);
    b = parseInt(trimmed.slice(5, 7), 16);
  } else if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    r = parseInt(trimmed[1] + trimmed[1], 16);
    g = parseInt(trimmed[2] + trimmed[2], 16);
    b = parseInt(trimmed[3] + trimmed[3], 16);
  } else {
    return "#111111";
  }

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance > 0.6) {
    return "#111111";
  }

  return color;
}
