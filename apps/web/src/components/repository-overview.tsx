import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Analysis } from '@/lib/repository-analysis';

type Language = Analysis['languages'][number];

function LanguageRow({ name, count, percentage }: Language) {
  return (
    <li>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span>{name}</span>
        <span className="tabular-nums text-muted-foreground" title={`${count.toLocaleString()} files`}>{percentage}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${percentage}%` }} />
      </div>
    </li>
  );
}

export default function RepositoryOverview({ analysis, analyzedAt }: { analysis: Analysis; analyzedAt: string | null }) {
  const primary = analysis.languages.filter(language => language.name !== 'Other' && language.count / analysis.fileCount >= 0.01);
  const grouped = analysis.languages.filter(language => language.name === 'Other' || language.count / analysis.fileCount < 0.01);
  const other = grouped.reduce((total, language) => ({
    name: 'Other', count: total.count + language.count, percentage: total.percentage + language.percentage,
  }), { name: 'Other', count: 0, percentage: 0 });
  const coverage = analysis.manifestCoverage;

  return (
    <section aria-labelledby="overview-heading" className="rounded-lg border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
        <h2 id="overview-heading" className="text-sm font-semibold">Overview</h2>
        {analyzedAt && <p className="text-xs text-muted-foreground">Updated {new Date(analyzedAt).toLocaleDateString()}</p>}
      </header>
      <div className="grid gap-6 p-5 md:grid-cols-[0.65fr_1fr_1fr]">
        <div>
          <p className="text-2xl font-semibold tabular-nums">{analysis.fileCount.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">files</span></p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{analysis.ignoredFileCount.toLocaleString()} generated and dependency files excluded.</p>
        </div>
        <section aria-labelledby="languages-heading">
          <h3 id="languages-heading" className="mb-1 text-xs font-medium">Languages</h3>
          <p className="mb-3 text-xs text-muted-foreground">Share of retained files</p>
          {!analysis.languages.length && <p className="text-xs text-muted-foreground">No retained files found.</p>}
          <ul className="space-y-3">
            {primary.map(language => <LanguageRow key={language.name} {...language} />)}
            {grouped.length > 0 && <LanguageRow {...other} />}
          </ul>
          {grouped.length > 0 && (
            <details className="group mt-3 text-xs">
              <summary className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
                <span className="group-open:hidden">Expand Other</span><span className="hidden group-open:inline">Collapse Other</span>
              </summary>
              <p className="mt-3 text-muted-foreground">Languages below 1% and unclassified files.</p>
              <ul className="mt-2 space-y-2 border-l pl-3">
                {grouped.map(language => {
                  const percentage = language.count / analysis.fileCount * 100;
                  return <li key={language.name} className="flex justify-between gap-2"><span>{language.name === 'Other' ? 'Unclassified' : language.name}</span><span className="tabular-nums text-muted-foreground" title={`${language.count.toLocaleString()} files`}>{percentage < 0.1 ? '<0.1' : percentage.toFixed(1)}%</span></li>;
                })}
              </ul>
            </details>
          )}
        </section>
        <section aria-labelledby="tools-heading">
          <h3 id="tools-heading" className="mb-3 text-xs font-medium">Detected tools</h3>
          {coverage && !coverage.complete && (
            <div role="status" className="mb-3 flex items-start gap-2 rounded-md bg-amber-500/5 px-2.5 py-2 text-amber-800 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <details className="min-w-0 text-xs leading-5">
                <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">Partial detection · {coverage.scanned.toLocaleString()}/{coverage.total.toLocaleString()} manifests</summary>
                <p className="mt-1">File and language counts are complete. {coverage.reason}</p>
              </details>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">{analysis.tools.map(tool => <Badge key={tool} variant="secondary">{tool}</Badge>)}</div>
          {!analysis.tools.length && <p className="text-xs text-muted-foreground">No recognized tools found.</p>}
        </section>
      </div>
    </section>
  );
}
