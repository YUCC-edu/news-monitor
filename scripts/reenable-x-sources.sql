UPDATE sources
SET enabled = true,
    last_ok_at = NULL,
    last_error = NULL
WHERE kind = 'x-rsshub'
RETURNING id, name, enabled;
