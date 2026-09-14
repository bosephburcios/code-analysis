import Link from "next/link";
import { NetworkIcon } from "@/components/icons/network-icon";

import { RepositoryImport } from "@/components/repository-import";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getSession();
  const recentRepositories = session
    ? await prisma.repository.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          fullName: true,
          githubUrl: true,
          language: true,
          updatedAt: true,
        },
      })
    : [];

  return (
    <main className="dot-grid bg-background">
      <section className="mx-auto flex min-h-[calc(100svh-6.5rem)] md:min-h-svh max-w-7xl items-center justify-center px-6 py-20">
        {session ? (
          <RepositoryImport recentRepositories={recentRepositories} />
        ) : (
          <div className="w-full max-w-md text-center">
            <div className="animate-float mx-auto mb-6 flex size-11 items-center justify-center rounded-lg border bg-muted">
              <NetworkIcon className="text-muted-foreground" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Understand any codebase.
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-muted-foreground">
              Sign in to import repositories and keep them tied to your account.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button
                nativeButton={false}
                render={<Link href="/sign-up">Create an account</Link>}
              />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/sign-in">Sign in</Link>}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
