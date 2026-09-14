"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ArchitectureNode, PackageUsage } from "@/lib/architecture/types";

export function NodeInspector({
  node,
  dependsOn,
  dependents,
  operations,
  externalPackages,
  impactActive,
  onShowImpact,
  onClose,
}: {
  node: ArchitectureNode;
  dependsOn: { node: ArchitectureNode; names: string[] }[];
  dependents: ArchitectureNode[];
  operations: string[];
  externalPackages: PackageUsage[];
  impactActive: boolean;
  onShowImpact: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-80 overflow-y-auto border-l border-[var(--arch-panel-border)] bg-[var(--arch-panel-bg)] p-4 text-[var(--arch-panel-text)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--arch-node-text)]">
            {node.label}
          </p>
          {node.path && (
            <p className="mt-0.5 break-all font-mono text-[10px] text-[var(--arch-node-subtext)]">
              {node.path}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X />
        </Button>
      </div>

      <Button
        size="sm"
        variant={impactActive ? "secondary" : "outline"}
        className="mt-4 w-full"
        onClick={onShowImpact}
      >
        {impactActive ? "Clear impact" : "Show impact"}
      </Button>

      <section className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--arch-header-text)]">
          Depends on ({dependsOn.length})
        </p>
        {dependsOn.length ? (
          <ul className="mt-2 space-y-2 text-xs">
            {dependsOn.map(({ node: target, names }) => (
              <li key={target.id}>
                <p className="truncate font-medium">{target.label}</p>
                {names.length > 0 && (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--arch-node-subtext)]">
                    {names.slice(0, 6).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--arch-node-subtext)]">None</p>
        )}
      </section>

      <section className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--arch-header-text)]">
          Depended on by ({dependents.length})
        </p>
        {dependents.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {dependents.map((source) => (
              <li key={source.id} className="truncate">
                {source.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--arch-node-subtext)]">
            Nothing depends on this yet
          </p>
        )}
      </section>

      {operations.length > 0 && (
        <section className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--arch-header-text)]">
            Database models touched
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[10px] text-[var(--arch-node-subtext)]">
            {operations.map((operation) => (
              <li key={operation}>{operation}</li>
            ))}
          </ul>
        </section>
      )}

      {externalPackages.length > 0 && (
        <section className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--arch-header-text)]">
            External packages
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {externalPackages.map((pkg) => (
              <Badge key={pkg.name} variant="secondary">
                {pkg.name}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
