BEGIN;

-- 1) Rename HN timestamp-style sources to stable names keyed off the query
UPDATE sources SET name = 'HN: openai'    WHERE id = 'd16117f7-6c3b-4b9e-979e-669cea8b1bea';
UPDATE sources SET name = 'HN: anthropic' WHERE id = 'fdc5792f-e18c-42b2-8449-737fdb2685ce';
UPDATE sources SET name = 'HN: llama'     WHERE id = '7d9206bf-b907-4a10-8be8-67b11f162a39';
UPDATE sources SET name = 'HN: kimi'      WHERE id = '21f0e450-90a1-4fdc-9753-90fb40f434ba';
UPDATE sources SET name = 'HN: deepseek'  WHERE id = '74f3d1f5-1850-4ae0-b950-62dd1fe516f5';
UPDATE sources SET name = 'HN: qwen'      WHERE id = 'be922afb-4e1a-4c37-9b63-09478ab937b5';

-- 2) Rename typo'd Meta source
UPDATE sources SET name = 'Meta AI Blog' WHERE id = '20728619-10cd-468f-b223-c1a0153c66a0';

-- 3) Delete duplicate sources (items cascade via ON DELETE CASCADE)
DELETE FROM sources WHERE id = '72d28390-39f1-481b-bae6-aa0360da0289'; -- dup "openai" -> keep OpenAI Blog
DELETE FROM sources WHERE id = 'db4d25a3-3b7c-4ad9-9cb9-08c7d044f3ec'; -- dup "google" -> keep Google DeepMind Blog
DELETE FROM sources WHERE id = '288b6794-28a3-4c42-83ac-ca7c8fa5f532'; -- dup "anthropic" -> keep Anthropic News
DELETE FROM sources WHERE id = 'bd1b316c-5127-479e-bd52-110accf7f61f'; -- dup "@OpenAI" -> keep X @OpenAI

COMMIT;

SELECT kind, name, enabled, (SELECT count(*) FROM items i WHERE i.source_id = s.id) AS items
FROM sources s ORDER BY kind, name;
