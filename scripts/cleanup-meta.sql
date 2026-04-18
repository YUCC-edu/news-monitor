UPDATE sources
SET name = 'Meta Engineering (ML)',
    config = jsonb_set(config, '{feedUrl}', '"https://engineering.fb.com/category/ml-applications/feed/"'::jsonb),
    last_ok_at = NULL,
    last_error = NULL
WHERE id = '20728619-10cd-468f-b223-c1a0153c66a0'
RETURNING id, name, config;

-- Also disable the 3 Twitter x-rsshub sources because the local RSSHub
-- needs TWITTER_AUTH_TOKEN to be configured before /twitter/* routes work.
UPDATE sources
SET enabled = false
WHERE kind = 'x-rsshub'
RETURNING id, name, enabled;
