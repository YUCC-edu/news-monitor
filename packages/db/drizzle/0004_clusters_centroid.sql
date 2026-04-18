ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "centroid_embedding" vector(1024);
