import type { Repository } from "@/generated/prisma/client";

export type RepositorySummary = Omit<Repository, "createdAt" | "updatedAt">;
