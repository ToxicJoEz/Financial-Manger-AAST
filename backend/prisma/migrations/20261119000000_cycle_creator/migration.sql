-- Who created each cycle: a branch mod can only change cycles they created (until the main mod checks them).
ALTER TABLE "Cycle" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Cycle_createdById_idx" ON "Cycle"("createdById");

-- Existing cycles: take the creator from the activity log where it was recorded. The rest stay unknown,
-- so only admins and the main mod can change them.
UPDATE "Cycle" c SET "createdById" = src."actorId"
FROM (
  SELECT DISTINCT ON (ch->'after'->0->>'id') ch->'after'->0->>'id' AS cycle_id, l."actorId"
  FROM "SystemLog" l,
       jsonb_array_elements(CASE WHEN jsonb_typeof(l."details"->'changes') = 'array' THEN l."details"->'changes' ELSE '[]'::jsonb END) ch
  WHERE l."outcome" = 'SUCCESS' AND l."actorId" IS NOT NULL
    AND ch->>'entity' = 'cycle' AND ch->>'operation' = 'create'
  ORDER BY ch->'after'->0->>'id', l."createdAt"
) src
WHERE src.cycle_id = c."id";
