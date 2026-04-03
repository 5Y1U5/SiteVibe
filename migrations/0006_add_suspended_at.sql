-- 解約自動処理: suspended_at カラム追加（支払い失敗時の猶予期間追跡）
ALTER TABLE clients ADD COLUMN suspended_at INTEGER DEFAULT NULL;
