"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReadmeMarkdownView({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <p className="text-xs font-medium">README.md</p>
        <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => {
          const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = "README.md";
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}><Download className="size-3.5" />Download README.md</Button>
        <Button size="sm" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(markdown); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 2000); }
          catch { setCopyError(true); }
        }}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy Markdown"}
        </Button>
        </div>
      </div>
      {copyError && <p role="status" className="px-3 pt-2 text-xs text-muted-foreground">Copy unavailable. Select the text to copy it manually.</p>}
      <pre tabIndex={0} className="max-h-[720px] overflow-auto p-4 font-mono text-[12px] leading-6 focus-visible:outline-2 focus-visible:outline-ring">
        <code>{markdown}</code>
      </pre>
    </div>
  );
}
