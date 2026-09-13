ALTER TABLE "ArchitectureGraph" ADD COLUMN "rawGraph" JSONB,
ADD COLUMN "semanticGraph" JSONB,
ADD COLUMN "generatedAt" TIMESTAMP(3);

UPDATE "ArchitectureGraph" SET "rawGraph" = jsonb_build_object('nodes', "nodes", 'edges', "edges");
ALTER TABLE "ArchitectureGraph" ALTER COLUMN "rawGraph" SET NOT NULL;
ALTER TABLE "ArchitectureGraph" DROP COLUMN "nodes", DROP COLUMN "edges";
