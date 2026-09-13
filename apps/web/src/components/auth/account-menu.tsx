"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AccountMenu({
  email,
  stacked = false,
}: {
  email: string;
  stacked?: boolean;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div
      className={
        stacked
          ? "grid w-full min-w-0 gap-2 border-t pt-3"
          : "flex items-center gap-2"
      }
    >
      <span
        className={
          stacked
            ? "block min-w-0 truncate text-xs text-muted-foreground"
            : "sr-only"
        }
        title={email}
      >
        {email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={stacked ? "w-full justify-start" : undefined}
        onClick={handleSignOut}
      >
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
