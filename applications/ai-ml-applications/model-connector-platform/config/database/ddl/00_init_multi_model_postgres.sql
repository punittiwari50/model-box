-- ==============================================================================
-- Multi-Model PostgreSQL Enterprise Engine Initialization
-- Capabilities: Graph, Vector, RDBMS, NoSQL Document Store
-- ==============================================================================

-- 1. Enable Multi-Model Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "hstore";         -- NoSQL Key-Value Store
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Text Similarity & Trigrams
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- Multi-attribute & Constraint Indexing
CREATE EXTENSION IF NOT EXISTS "ltree";          -- Graph Hierarchies & Tree Traversal
CREATE EXTENSION IF NOT EXISTS "tablefunc";      -- Graph Adjacency Matrix & Crosstabs
CREATE EXTENSION IF NOT EXISTS "vector";         -- High-Dimensional AI Vector Embeddings

-- 2. Schema Architecture: RDBMS Relational Core
CREATE TABLE IF NOT EXISTS platform_tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    tenant_name VARCHAR(128) NOT NULL,
    plan_tier VARCHAR(32) DEFAULT 'ENTERPRISE',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Schema Architecture: Vector Embedding Store (AI Embeddings)
CREATE TABLE IF NOT EXISTS model_vector_embeddings (
    embedding_id VARCHAR(64) PRIMARY KEY,
    model_id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    prompt_chunk TEXT NOT NULL,
    embedding vector(1536),                      -- Vector embedding dimension (e.g. OpenAI / Gemini)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_vector_hnsw 
ON model_vector_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. Schema Architecture: NoSQL Document Store (JSONB / Key-Value)
CREATE TABLE IF NOT EXISTS model_nosql_documents (
    document_id VARCHAR(64) PRIMARY KEY,
    collection_name VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    document_data JSONB NOT NULL,
    attributes HSTORE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nosql_doc_gin 
ON model_nosql_documents USING gin (document_data);

CREATE INDEX IF NOT EXISTS idx_nosql_hstore_gin 
ON model_nosql_documents USING gin (attributes);

-- 5. Schema Architecture: Graph Engine (Adjacency Matrix & Hierarchical Trees)
CREATE TABLE IF NOT EXISTS model_graph_nodes (
    node_id VARCHAR(64) PRIMARY KEY,
    node_type VARCHAR(64) NOT NULL,             -- 'MODEL', 'PROVIDER', 'PROMPT', 'TOOL', 'AGENT'
    node_label VARCHAR(128) NOT NULL,
    hierarchy_path ltree,                       -- ltree graph hierarchy (e.g. 'root.google.gemini')
    node_properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_graph_hierarchy_gist 
ON model_graph_nodes USING gist (hierarchy_path);

CREATE TABLE IF NOT EXISTS model_graph_edges (
    edge_id VARCHAR(64) PRIMARY KEY,
    source_node_id VARCHAR(64) REFERENCES model_graph_nodes(node_id) ON DELETE CASCADE,
    target_node_id VARCHAR(64) REFERENCES model_graph_nodes(node_id) ON DELETE CASCADE,
    relationship_type VARCHAR(64) NOT NULL,     -- 'CONNECTS_TO', 'INVOKES', 'FALLBACK_FOR', 'PIPELINE_NEXT'
    weight FLOAT DEFAULT 1.0,
    edge_properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_graph_edge_source ON model_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edge_target ON model_graph_edges(target_node_id);

