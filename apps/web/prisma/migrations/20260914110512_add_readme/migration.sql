-- CreateTable
CREATE TABLE "Readme" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "model" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Readme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Readme_repositoryId_key" ON "Readme"("repositoryId");

-- AddForeignKey
ALTER TABLE "Readme" ADD CONSTRAINT "Readme_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
