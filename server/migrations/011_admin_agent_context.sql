-- Admin-only Gemini project context for vauto-agent injection
CREATE TABLE IF NOT EXISTS admin_agent_context (
  admin_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  context_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
