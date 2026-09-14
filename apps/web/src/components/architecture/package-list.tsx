"use client";

import { Badge } from "@/components/ui/badge";
import type { PackageUsage } from "@/lib/architecture/types";

export function PackageList({
  packages,
  query,
  onSelectFile,
}: {
  packages: PackageUsage[];
  query: string;
  onSelectFile: (path: string) => void;
}) {
  const filtered = query
    ? packages.filter((pkg) =>
        pkg.name.toLowerCase().includes(query.toLowerCase()),
      )
    : packages;

  if (!packages.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No package usage detected. Re-run analysis to pick up dependency
        scanning.
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No packages match “{query}”.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {filtered.map((pkg) => (
        <div key={`${pkg.manifestPath}:${pkg.name}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-mono text-sm font-semibold">
              {pkg.name}
            </h3>
            <Badge variant="secondary">{pkg.version}</Badge>
            <Badge variant={pkg.kind === "dependency" ? "secondary" : "outline"}>
              {pkg.kind === "dependency" ? "dependency" : "devDependency"}
            </Badge>
          </div>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-medium focus-visible:outline-2">
              Used by {pkg.importedBy.length}{" "}
              {pkg.importedBy.length === 1 ? "file" : "files"}
            </summary>
            <ul className="mt-3 space-y-1">
              {pkg.importedBy.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => onSelectFile(path)}
                    className="break-all rounded px-1 py-0.5 font-mono text-muted-foreground underline-offset-2 hover:bg-muted/50 hover:text-foreground hover:underline"
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}
