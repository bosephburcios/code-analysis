-- Baseline of the existing database. Mark applied on the existing database;
-- execute normally only when provisioning an empty database.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "public"."repository" (
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defaultBranch" TEXT NOT NULL,
    "description" TEXT,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "fullName" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "language" TEXT,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',

    CONSTRAINT "repository_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repository_fullName_key" ON "public"."repository"("fullName" ASC);
