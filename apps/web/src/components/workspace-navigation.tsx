"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { repositoryIdFromPath, repositorySections, sectionAtScroll, type RepositorySection } from "@/lib/workspace-navigation";

type RepositoryNavigation = { id: string; fullName: string; busy: boolean; sync: () => void };
type ReadmeAction = { repositoryId: string; disabled: boolean; exporting: boolean; progress: string | null; error: string | null; export: () => void };
type RecentRepository = Pick<RepositoryNavigation, "id" | "fullName">;
const RegistrationContext = createContext<{
  repository: (value: RepositoryNavigation) => () => void;
  readme: (value: ReadmeAction) => () => void;
} | null>(null);
const NavigationContext = createContext<{
  repository: RepositoryNavigation | null;
  readme: ReadmeAction | null;
  recent: RecentRepository[];
  section: RepositorySection;
} | null>(null);

export function WorkspaceNavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeId = repositoryIdFromPath(pathname);
  const [registered, setRegistered] = useState<RepositoryNavigation | null>(null);
  const [readmeAction, setReadmeAction] = useState<ReadmeAction | null>(null);
  const [recent, setRecent] = useState<RecentRepository[]>([]);
  const [active, setActive] = useState<{ id: string; section: RepositorySection } | null>(null);
  const repository = registered?.id === routeId ? registered : null;
  const registerRepository = useCallback((value: RepositoryNavigation) => {
    setRegistered(value);
    setRecent(previous => previous[0]?.id === value.id && previous[0]?.fullName === value.fullName ? previous
      : [{ id: value.id, fullName: value.fullName }, ...previous.filter(item => item.id !== value.id)].slice(0, 3));
    return () => setRegistered(current => current === value ? null : current);
  }, []);
  const registerReadme = useCallback((value: ReadmeAction) => {
    setReadmeAction(value);
    return () => setReadmeAction(current => current === value ? null : current);
  }, []);
  const registration = useMemo(() => ({ repository: registerRepository, readme: registerReadme }), [registerRepository, registerReadme]);
  const repositoryId = repository?.id;
  useEffect(() => {
    if (!repositoryId) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = repositorySections.flatMap(section => {
          const element = document.getElementById(section.id);
          return element ? [{ id: section.id, top: element.getBoundingClientRect().top }] : [];
        });
        const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
        const section = sectionAtScroll(sections, atBottom);
        setActive(previous => previous?.id === repositoryId && previous.section === section ? previous : { id: repositoryId, section });
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("hashchange", update);
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("hashchange", update);
      window.removeEventListener("resize", update);
    };
  }, [repositoryId]);
  return <RegistrationContext.Provider value={registration}>
    <NavigationContext.Provider value={{ repository, readme: repository && readmeAction?.repositoryId === repository.id ? readmeAction : null,
      recent, section: active && active.id === repositoryId ? active.section : "architecture" }}>
      {children}
    </NavigationContext.Provider>
  </RegistrationContext.Provider>;
}

export function useWorkspaceNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error("Workspace navigation requires WorkspaceNavigationProvider.");
  return context;
}

export function useRegisterRepositoryNavigation(value: RepositoryNavigation) {
  const registration = useContext(RegistrationContext);
  useEffect(() => registration?.repository(value), [registration, value]);
}

export function useRegisterReadmeAction(value: ReadmeAction) {
  const registration = useContext(RegistrationContext);
  useEffect(() => registration?.readme(value), [registration, value]);
}
