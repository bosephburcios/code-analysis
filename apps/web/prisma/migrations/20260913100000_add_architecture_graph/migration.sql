CREATE TABLE "ArchitectureGraph" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "nodes" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArchitectureGraph_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArchitectureGraph_repositoryId_key" ON "ArchitectureGraph"("repositoryId");
ALTER TABLE "ArchitectureGraph" ADD CONSTRAINT "ArchitectureGraph_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
