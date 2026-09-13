/*
  Warnings:

  - You are about to drop the `repository` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('IMPORTED', 'ANALYZING', 'READY', 'FAILED');

-- DropTable
DROP TABLE "repository";

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "description" TEXT,
    "defaultBranch" TEXT NOT NULL,
    "language" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "status" "RepositoryStatus" NOT NULL DEFAULT 'IMPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");
