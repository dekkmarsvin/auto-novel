#!/usr/bin/env bash
set -euo pipefail

# Only the disposable CI database is addressed; never use the application DB.
container=${1:?disposable PostgreSQL container ID is required}
engine=${CONTAINER_ENGINE:-docker}
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)
psql=("$engine" exec -i "$container" psql --username=banner-schema-test --dbname=banner-schema-test --no-psqlrc --set=ON_ERROR_STOP=1)

"${psql[@]}" <<'SQL'
CREATE TABLE banner (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type smallint NOT NULL DEFAULT 0,
    key text NOT NULL,
    link_url text,
    sort_order int NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp
);
INSERT INTO banner (key, link_url, sort_order, is_active)
VALUES ('existing.webp', 'https://example.invalid/retained', 7, false);
SQL

# Reapplying the real production script must preserve the old row and schema.
"${psql[@]}" --single-transaction < "$root/sql/init.sql"
"${psql[@]}" --single-transaction < "$root/sql/init.sql"

"${psql[@]}" <<'SQL'
DO $$
BEGIN
    IF (SELECT count(*) FROM banner) <> 1 OR NOT EXISTS (
        SELECT 1 FROM banner WHERE id = 1 AND key = 'existing.webp'
        AND link_url = 'https://example.invalid/retained'
        AND sort_order = 7 AND NOT is_active AND focal_x = 0.5 AND focal_y = 0.5
    ) THEN
        RAISE EXCEPTION 'Schema upgrade changed existing banner data';
    END IF;
    BEGIN
        INSERT INTO banner (key) VALUES ('existing.webp');
        RAISE EXCEPTION 'Duplicate object key was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        UPDATE banner SET focal_x = 1.1 WHERE id = 1;
        RAISE EXCEPTION 'Out-of-range focal point was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;
SQL
