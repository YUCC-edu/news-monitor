UPDATE sources
SET config = jsonb_set(config, '{feedUrl}', '"http://127.0.0.1:1200/anthropic/news"'::jsonb),
    last_ok_at = NULL,
    last_error = NULL
WHERE id = 'ce93e99c-a323-437b-86b5-2003e45ee34e'
RETURNING id, name, config;
