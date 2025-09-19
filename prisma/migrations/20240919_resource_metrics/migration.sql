-- Add new columns for resource metrics and variants
ALTER TABLE "ExperimentResult"
ADD COLUMN IF NOT EXISTS "variant" TEXT NOT NULL DEFAULT 'default';

ALTER TABLE "ExperimentResult"
ADD COLUMN IF NOT EXISTS "avgMemory" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "totalDiskReadMB" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "totalDiskWriteMB" DOUBLE PRECISION;

-- Ensure existing rows have non-null CPU/memory defaults before tightening constraints
UPDATE "ExperimentResult" SET "avgCPU" = COALESCE("avgCPU", 0);
UPDATE "ExperimentResult" SET "maxMemory" = COALESCE("maxMemory", 0);

ALTER TABLE "ExperimentResult"
ALTER COLUMN "avgCPU" SET DEFAULT 0,
ALTER COLUMN "avgCPU" SET NOT NULL,
ALTER COLUMN "maxMemory" SET DEFAULT 0,
ALTER COLUMN "maxMemory" SET NOT NULL;
