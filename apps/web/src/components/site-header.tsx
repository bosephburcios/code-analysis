"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderGit2, House } from "lucide-react";
import { GitHubIcon } from "@/components/icons/github-icon";
import { ModeToggle } from "@/components/mode-toggle";
import { AccountMenu } from "@/components/auth/account-menu";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type SiteHeaderProps = { user: { email: string } | null };

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md font-medium tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex size-7 items-center justify-center rounded-md border bg-background text-xs font-semibold">
        C
      </span>
      CodeMap
    </Link>
  );
}

function Utilities() {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={
          <a
            href="https://github.com/bosephburcios/code-analysis"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub (opens in a new tab)"
            title="GitHub"
          />
        }
      >
        <GitHubIcon className="size-5" />
      </Button>
      <ModeToggle />
    </>
  );
}

function Account({
  user,
  stacked = false,
}: SiteHeaderProps & { stacked?: boolean }) {
  return user ? (
    <AccountMenu email={user.email} stacked={stacked} />
  ) : (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/sign-in">Sign in</Link>}
      />
      <Button
        size="sm"
        nativeButton={false}
        render={<Link href="/sign-up">Sign up</Link>}
      />
    </div>
  );
}

export function SiteHeader({ user }: SiteHeaderProps) {
  const pathname = usePathname();
  return (
    <header className="border-b bg-background md:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Brand />
        <div className="flex items-center gap-1">
          <Utilities />
        </div>
      </div>
      <div className="flex min-h-12 items-center justify-between gap-2 border-t px-4 py-2">
        <nav aria-label="Main navigation" className="flex items-center gap-1">
          <Button
            variant={pathname === "/" ? "secondary" : "ghost"}
            size="sm"
            nativeButton={false}
            render={
              <Link
                href="/"
                aria-current={pathname === "/" ? "page" : undefined}
                aria-label="Home"
              >
                <House />
              </Link>
            }
          />
          {user && (
            <Button
              variant={pathname.startsWith("/repos") ? "secondary" : "ghost"}
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href="/repos"
                  aria-current={
                    pathname.startsWith("/repos") ? "page" : undefined
                  }
                >
                  Repositories
                </Link>
              }
            />
          )}
        </nav>
        <Account user={user} />
      </div>
    </header>
  );
}

export function SiteShell({
  user,
  children,
}: SiteHeaderProps & { children: React.ReactNode }) {
  const pathname = usePathname();
  const links = [
    {
      href: "/",
      label: user ? "Import repository" : "Home",
      icon: House,
      active: pathname === "/",
    },
    ...(user
      ? [
          {
            href: "/repos",
            label: "My repositories",
            icon: FolderGit2,
            active: pathname.startsWith("/repos"),
          },
        ]
      : []),
  ];

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="none"
        className="sticky top-0 hidden h-svh shrink-0 border-r md:flex"
      >
        <SidebarHeader className="px-4 py-5">
          <Brand />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <nav aria-label="Main navigation">
              <SidebarMenu>
                {links.map(({ href, label, icon: Icon, active }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={active}
                      render={
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="min-w-0 gap-4 border-t p-4">
          <div className="grid min-w-0 gap-2">
            <span className="text-xs text-muted-foreground">
              Resources & appearance
            </span>
            <div className="flex items-center gap-1">
              <Utilities />
            </div>
          </div>
          <Account user={user} stacked />
        </SidebarFooter>
      </Sidebar>
      <div className="min-w-0 flex-1">
        <SiteHeader user={user} />
        {children}
      </div>
    </SidebarProvider>
  );
}
