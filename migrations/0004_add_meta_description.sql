-- blog_posts に meta_description カラムを追加（SEO用）
ALTER TABLE blog_posts ADD COLUMN meta_description TEXT DEFAULT NULL;
