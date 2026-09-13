ALTER TABLE "Repository"
ADD COLUMN "analysis" JSONB,
ADD COLUMN "analysisError" TEXT,
ADD COLUMN "analysisStartedAt" TIMESTAMP(3),
ADD COLUMN "analyzedAt" TIMESTAMP(3);
