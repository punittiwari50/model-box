CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;

ALTER DATABASE comfyui SET search_path = "$user", public, ag_catalog;
