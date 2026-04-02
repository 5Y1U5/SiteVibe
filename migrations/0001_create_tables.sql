-- SiteVibe SaaS マルチテナント基盤
-- Phase A: 初期スキーマ

-- クライアント管理
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'light' CHECK(plan IN ('light', 'standard', 'premium')),
  monthly_limit INTEGER NOT NULL DEFAULT 3,
  repo_path TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  blog_subdomain TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  active INTEGER DEFAULT 1
);

-- ユーザー管理
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('admin', 'client')),
  display_name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 利用量カウント
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  action TEXT NOT NULL CHECK(action IN ('code_change', 'blog_generate')),
  job_id TEXT,
  billing_period TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- ジョブ履歴
CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  message TEXT NOT NULL,
  commit_hash TEXT,
  diff TEXT,
  result TEXT,
  approved_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- ブログ記事（Phase D で使用）
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
  published_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(client_id, slug)
);

-- インデックス（Architect/Critic 指摘対応）
CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_usage_billing ON usage(client_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_clients_stripe ON clients(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_clients_subdomain ON clients(blog_subdomain);
CREATE INDEX IF NOT EXISTS idx_blog_posts_client ON blog_posts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_job_history_client ON job_history(client_id);

-- 初期データ: 管理者 + デフォルトクライアント
INSERT OR IGNORE INTO clients (id, name, plan, monthly_limit, repo_path)
VALUES ('default', 'SiteVibe (デフォルト)', 'premium', 999, NULL);

INSERT OR IGNORE INTO users (email, client_id, role, display_name)
VALUES ('t@i-style.vc', 'default', 'admin', 'i-Style 管理者');
