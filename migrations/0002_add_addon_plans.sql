-- Phase B: オプションプランカラム追加
-- Chatta / ブログオプションの契約状態を管理
ALTER TABLE clients ADD COLUMN chatta_plan TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN blog_plan TEXT DEFAULT NULL;
