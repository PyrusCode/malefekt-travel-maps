export const dims = (format, scale = 1) => {
  const [w, h] = format === "9:16" ? [1080, 1920] : [1920, 1080];
  return { width: Math.round((w * scale) / 2) * 2, height: Math.round((h * scale) / 2) * 2 };
};
