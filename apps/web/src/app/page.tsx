import { RepositoryImport } from "@/components/repository-import";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md border">
              <span className="text-xs font-semibold">C</span>
            </div>

            <span className="font-medium tracking-tight">
              CodeMap
            </span>
          </div>

          <a
            href="https://github.com"
            target="_blank"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl items-center justify-center px-6 py-20">
        <RepositoryImport />
      </section>
    </main>
  );
}