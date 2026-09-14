"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useId, useSyncExternalStore } from "react";
import {
  BookOpen,
  Boxes,
  ChartNoAxesColumn,
  Download,
  FileText,
  FolderGit2,
  House,
  Moon,
  RefreshCw,
  Sun,
  Workflow,
  X,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons/github-icon";
import { AccountMenu } from "@/components/auth/account-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation,
} from "@/components/workspace-navigation";
import { repositorySections } from "@/lib/workspace-navigation";

type SiteHeaderProps = { user: { email: string } | null };
const sectionIcons = {
  architecture: Workflow,
  overview: ChartNoAxesColumn,
  components: Boxes,
  readme: FileText,
};
const subscribeToHydration = () => () => {};

function AppearanceSwitch() {
  const id = useId();

  const ready = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  const { resolvedTheme, setTheme } = useTheme();

  const isDark = ready && resolvedTheme === "dark";

  return (
    <div className="flex h-8 items-center justify-between gap-3 px-2">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-2 text-sm"
      >
        {isDark ? (
          <Moon className="size-4" aria-hidden="true" />
        ) : (
          <Sun className="size-4" aria-hidden="true" />
        )}

        {isDark ? "Dark mode" : "Light mode"}
      </label>

      <Switch
        id={id}
        checked={isDark}
        disabled={!ready}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        className="
          !transition-colors !duration-200 !ease-out
          [&_[data-slot=switch-thumb]]:!transition-transform
          [&_[data-slot=switch-thumb]]:!duration-200
          [&_[data-slot=switch-thumb]]:!ease-out
        "
      />
    </div>
  );
}

function Brand() {
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      href="/"
      onClick={() => setOpenMobile(false)}
      className="flex items-center gap-2 rounded-md font-medium tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex size-7 items-center justify-center rounded-md border bg-background">
        <Image
          src="/logo.svg"
          alt=""
          width={16}
          height={16}
          className="dark:invert"
        />
      </span>
      CodeMap
    </Link>
  );
}

function WorkspaceSidebar({ user }: SiteHeaderProps) {
  const pathname = usePathname();
  const { repository, readme, recent, section } = useWorkspaceNavigation();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="flex-row items-center justify-between px-4 py-4">
        <Brand />
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Close navigation"
          onClick={close}
        >
          <X />
        </Button>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <nav aria-label="Workspace navigation">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={
                    <Link
                      href="/"
                      onClick={close}
                      aria-current={pathname === "/" ? "page" : undefined}
                    />
                  }
                >
                  <House />
                  <span>{user ? "Import repository" : "Home"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/repos"}
                    render={
                      <Link
                        href="/repos"
                        onClick={close}
                        aria-current={
                          pathname === "/repos" ? "page" : undefined
                        }
                      />
                    }
                  >
                    <FolderGit2 />
                    <span>My repositories</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
        {repository ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Current repository</SidebarGroupLabel>
              <p
                className="mb-2 truncate px-2 text-xs text-muted-foreground"
                title={repository.fullName}
              >
                {repository.fullName}
              </p>
              <nav aria-label="Repository navigation">
                <SidebarMenu>
                  {repositorySections.map((item) => {
                    const Icon = sectionIcons[item.id];
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={section === item.id}
                          render={
                            <a
                              href={`/repos/${encodeURIComponent(repository.id)}#${item.id}`}
                              onClick={close}
                              aria-current={
                                section === item.id ? "location" : undefined
                              }
                            />
                          }
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Actions</SidebarGroupLabel>
              <SidebarMenu className="text-muted-foreground">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    disabled={repository.busy || readme?.exporting}
                    onClick={() => {
                      repository.sync();
                      close();
                    }}
                  >
                    <RefreshCw
                      className={
                        repository.busy
                          ? "animate-spin motion-reduce:animate-none"
                          : undefined
                      }
                    />
                    <span>{repository.busy ? "Syncing…" : "Sync latest"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    disabled={!readme || readme.disabled || repository.busy}
                    title={
                      !readme || (readme.disabled && !readme.exporting)
                        ? "Generate a README to enable export"
                        : "Download README and diagrams"
                    }
                    onClick={() => {
                      readme?.export();
                      close();
                    }}
                  >
                    <Download />
                    <span>
                      {readme?.exporting
                        ? "Exporting README…"
                        : "Export README"}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              {readme?.progress && (
                <p
                  role="status"
                  className="px-2 pt-2 text-xs text-muted-foreground"
                >
                  {readme.progress}
                </p>
              )}
              {readme?.error && (
                <p role="alert" className="px-2 pt-2 text-xs text-destructive">
                  {readme.error}
                </p>
              )}
            </SidebarGroup>
          </>
        ) : (
          user &&
          recent.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Recent</SidebarGroupLabel>
              <nav aria-label="Recent repositories">
                <SidebarMenu>
                  {recent.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        title={item.fullName}
                        render={
                          <Link
                            href={`/repos/${encodeURIComponent(item.id)}`}
                            onClick={close}
                          />
                        }
                      >
                        <FolderGit2 />
                        <span>{item.fullName.split("/").at(-1)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          )
        )}
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t px-4 py-3">
        <div>
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            Resources
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <a
                    href="https://github.com/bosephburcios/code-analysis"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <GitHubIcon />
                <span>GitHub</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <a
                    href="https://github.com/bosephburcios/code-analysis#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <BookOpen />
                <span>Documentation</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
        <div>
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            Appearance
          </p>
          <AppearanceSwitch />
        </div>
        <div className="min-w-0 border-t pt-2">
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            Account
          </p>
          {user ? (
            <AccountMenu email={user.email} stacked />
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/sign-in" onClick={close} />}
              >
                Sign in
              </Button>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/sign-up" onClick={close} />}
              >
                Sign up
              </Button>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
      <SidebarTrigger aria-label="Open navigation" />
      <Brand />
    </header>
  );
}

export function SiteShell({
  user,
  children,
}: SiteHeaderProps & { children: React.ReactNode }) {
  return (
    <WorkspaceNavigationProvider key={user?.email ?? "guest"}>
      <SidebarProvider>
        <WorkspaceSidebar user={user} />
        <div className="min-w-0 flex-1">
          <SiteHeader />
          {children}
        </div>
      </SidebarProvider>
    </WorkspaceNavigationProvider>
  );
}
