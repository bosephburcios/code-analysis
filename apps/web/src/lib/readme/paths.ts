// Single source of truth for exported asset filenames — shared by the
// Markdown renderer, the export-package builder, and the preview UI so a
// rendered image reference can never drift from what actually gets exported.
export const ARCHITECTURE_IMAGE_PATH = "docs/architecture.png";

export function flowImagePath(slug: string) {
  return `docs/flows/${slug}.png`;
}

export function slugifyFlowTitle(title: string, used: Set<string>) {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "flow";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix++;
  }
  used.add(slug);
  return slug;
}
