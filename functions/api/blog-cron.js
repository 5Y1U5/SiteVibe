// ============================================
// SiteVibe — ブログ予約公開 Cron Trigger
// 5分間隔で scheduled_at <= now の記事を公開
// ============================================

export async function onRequestGet(context) {
  const { env, request } = context;

  // Cron Trigger からの呼び出し or 管理者手動実行
  // セキュリティ: 内部トークンで保護
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token !== env.JOB_RUNNER_TOKEN) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);

  // 予約時刻を過ぎた記事を取得
  const scheduled = await db.prepare(
    `SELECT bp.id, bp.client_id, bp.title, bp.content, bp.slug, bp.meta_description, bp.scheduled_at,
            c.repo_path, c.name as client_name
     FROM blog_posts bp
     JOIN clients c ON bp.client_id = c.id
     WHERE bp.status = 'scheduled' AND bp.scheduled_at <= ?
     ORDER BY bp.scheduled_at ASC`
  ).bind(now).all();

  const posts = scheduled.results || [];
  if (posts.length === 0) {
    return jsonResponse({ published: 0, message: '予約公開対象の記事はありません' });
  }

  const results = [];

  for (const post of posts) {
    try {
      // status を published に更新
      await db.prepare(
        `UPDATE blog_posts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`
      ).bind(now, now, post.id).run();

      // 全公開記事を取得（一覧ページ再生成用）
      const allPublished = await db.prepare(
        `SELECT title, slug, meta_description, published_at
         FROM blog_posts WHERE client_id = ? AND status = 'published'
         ORDER BY published_at DESC LIMIT 50`
      ).bind(post.client_id).all();

      // ジョブランナーに静的HTML生成を依頼
      if (post.repo_path && env.JOB_RUNNER_URL && env.JOB_RUNNER_TOKEN) {
        await fetch(`${env.JOB_RUNNER_URL}/blog-publish`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.JOB_RUNNER_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repoPath: post.repo_path,
            post: {
              title: post.title,
              content: post.content,
              slug: post.slug,
              meta_description: post.meta_description,
              published_at: now,
            },
            allPosts: allPublished.results || [],
          }),
        });
      }

      results.push({ id: post.id, slug: post.slug, status: 'published' });
      console.log(`予約公開完了: ${post.slug} (${post.client_id})`);
    } catch (err) {
      console.error(`予約公開エラー: ${post.slug}`, err.message);
      results.push({ id: post.id, slug: post.slug, status: 'error', error: err.message });
    }
  }

  return jsonResponse({ published: results.filter(r => r.status === 'published').length, results });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
