import Link from "next/link";
import { redirect } from "next/navigation";
import { GitFork } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const repositories = await prisma.repository.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="bg-background">

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            My repositories
          </h1>
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Import another
          </Link>
        </div>

        {repositories.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t imported any repositories yet.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
            >
              Import your first repository
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {repositories.map((repository) => (
              <li key={repository.id}>
                <Link
                  href={`/repos/${repository.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <GitFork className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{repository.fullName}</p>
                      {repository.description ? (
                        <p className="mt-0.5 max-w-md truncate text-sm text-muted-foreground">
                          {repository.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant="secondary">{repository.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
