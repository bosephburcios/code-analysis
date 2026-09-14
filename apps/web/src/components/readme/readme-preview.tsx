"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchitectureCanvas } from "@/components/architecture/architecture-canvas";
import { semanticToArchitectureGraph } from "@/lib/architecture/semantic-to-raw";
import type { SemanticArchitecture } from "@/lib/architecture/semantic-schema";
import { showcaseModel, structureText, setupCommands } from "@/lib/readme/showcase";
import type { GeneratedReadme, ReadmeCodeExample } from "@/lib/readme/types";

function ReadmeCodeBlock({ example }: { example: ReadmeCodeExample }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{example.path} · lines {example.startLine}–{example.endLine}</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={copied ? "Code copied" : "Copy code"} onClick={async () => {
          try { await navigator.clipboard.writeText(example.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
        }}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre className="max-h-[360px] overflow-auto px-3 py-3 font-mono text-[12px] leading-6">
        <code>{example.code}</code>
      </pre>
      {example.truncated && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Truncated for length. See the source file for the rest.</p>}
    </div>
  );
}

export function ReadmePreview({ model: savedModel, semantic }: { model: GeneratedReadme; semantic: SemanticArchitecture }) {
  const graph = useMemo(() => semanticToArchitectureGraph(semantic), [semantic]);
  const model = useMemo(() => showcaseModel(savedModel), [savedModel]);
  return <div className="mx-auto max-w-5xl space-y-9 py-4">
    <header className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">{model.title}</h1>
      <p className="max-w-3xl text-base leading-7 text-muted-foreground">{model.tagline}</p>
      <div className="flex flex-wrap gap-1.5">{model.badges.map(badge => <img key={badge.label} src={badge.url} alt={badge.label} height={20} className="h-5" />)}</div>
    </header>
    {model.overview && <section><h2 className="mb-3 text-lg font-semibold">Overview</h2><p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">{model.overview}</p></section>}
    <section><h2 className="mb-3 text-lg font-semibold">Architecture</h2>
      <ArchitectureCanvas {...graph} title="System architecture" subtitle="" />
      {model.architecture.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{model.architecture.description}</p>}
    </section>
    {model.keyFlows.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">How It Works</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">{model.keyFlows.map(flow => <li key={flow.id}><strong>{flow.title}</strong><span className="text-muted-foreground"> — {flow.description}</span></li>)}</ol>
    </section>}
    {model.codeExamples.length > 0 && <section className="space-y-5"><h2 className="text-lg font-semibold">Implementation Highlights</h2>
      {model.codeExamples.map(example => <article key={`${example.componentId}:${example.path}`} className="space-y-3">
        <h3 className="text-sm font-semibold">{example.componentLabel}</h3>
        {example.description && <p className="text-sm leading-6 text-muted-foreground">{example.description}</p>}
        <ReadmeCodeBlock example={example} />
      </article>)}
    </section>}
    {model.techStack.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Tech Stack</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b"><th className="py-2 pr-6 font-medium">Layer</th><th className="py-2 font-medium">Technologies</th></tr></thead>
      <tbody>{model.techStack.map(entry => <tr key={entry.category} className="border-b"><td className="py-2.5 pr-6">{entry.category}</td><td className="py-2.5 text-muted-foreground">{entry.items.map(item => item.name).join(', ')}</td></tr>)}</tbody>
    </table></div></section>}
    {model.projectStructure.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Project Structure</h2><pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-6">{structureText(model.projectStructure)}</pre></section>}
    {model.gettingStarted && <section className="space-y-3"><h2 className="text-lg font-semibold">Getting Started</h2>
      <pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-6">{setupCommands(model.gettingStarted)}</pre>
      {model.gettingStarted.envVars.length > 0 && <p className="text-sm leading-6 text-muted-foreground">Configure the variables listed in the repository’s environment template: {model.gettingStarted.envVars.map(name => <code key={name} className="mr-2 font-mono text-xs">{name}</code>)}</p>}
    </section>}
  </div>;
}
