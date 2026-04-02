-- writing_profile: ライティングDNA（JSON テキスト）
-- クライアントごとの文体・トーン・対象読者等を保存
ALTER TABLE clients ADD COLUMN writing_profile TEXT DEFAULT NULL;
