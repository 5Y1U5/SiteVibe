-- 予約公開: scheduled_at カラム追加
ALTER TABLE blog_posts ADD COLUMN scheduled_at INTEGER DEFAULT NULL;

-- シリーズ管理: blog_series テーブル作成
CREATE TABLE IF NOT EXISTS blog_series (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  slug TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(client_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_blog_series_client ON blog_series(client_id);

-- シリーズ管理: blog_posts にシリーズ関連カラム追加
ALTER TABLE blog_posts ADD COLUMN series_id TEXT DEFAULT NULL;
ALTER TABLE blog_posts ADD COLUMN series_order INTEGER DEFAULT NULL;
