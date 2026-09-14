import { ARCHITECTURE_IMAGE_PATH } from "./paths.ts";

export type ExportPackageEntry = { path: string; data: string | Blob };

// Reuses the same path constants the Markdown renderer used, so the
// exported files can never drift from what the README's <img> tags
// reference.
export function buildExportPackageEntries(
  markdown: string,
  images: { architecture: Blob; flows?: Record<string, Blob> },
  options: { includeFlowImages?: boolean } = {},
): ExportPackageEntry[] {
  return [
    { path: "README.md", data: markdown },
    { path: ARCHITECTURE_IMAGE_PATH, data: images.architecture },
    ...Object.entries(options.includeFlowImages ? images.flows ?? {} : {}).map(([path, blob]) => ({
      path,
      data: blob,
    })),
  ];
}
