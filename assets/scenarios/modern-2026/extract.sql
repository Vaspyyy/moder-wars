-- Run with DuckDB 1.1.3 and its matching spatial/httpfs extensions.
-- The source is public; no AWS credentials are required.
INSTALL spatial;
LOAD spatial;
INSTALL httpfs;
LOAD httpfs;
SET s3_region='us-west-2';
SET threads=4;
SET memory_limit='1GB';

COPY (
    SELECT id, division_id, country, subtype, names.primary AS name,
           CAST(names AS JSON) AS names, CAST(sources AS JSON) AS sources,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.015)) AS geometry
    FROM read_parquet(
        's3://overturemaps-us-west-2/release/2026-10-21.0/theme=divisions/type=division_area/*',
        hive_partitioning=1
    )
    WHERE subtype IN ('country', 'dependency') AND is_land = true
    ORDER BY country, id
) TO '/tmp/mw-overture-countries.json' (FORMAT JSON, ARRAY true);
