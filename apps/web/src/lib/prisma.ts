import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    prismaRevision: string | undefined;
};

// Regenerating models/fields invalidates the singleton during development reloads.
const prismaRevision = JSON.stringify(Object.entries(Prisma).filter(([name]) =>
    name === "ModelName" || name === "prismaVersion" || name.endsWith("ScalarFieldEnum")
));
if (globalForPrisma.prisma && globalForPrisma.prismaRevision !== prismaRevision) {
    void globalForPrisma.prisma.$disconnect().catch(console.error);
    globalForPrisma.prisma = undefined;
}

export const prisma = 
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
    globalForPrisma.prismaRevision = prismaRevision;
}
