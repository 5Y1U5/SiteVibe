// ============================================
// SiteVibe — ブログ記事生成 API
// AI で SEO 記事を生成し D1 に保存
// ============================================

const BLOG_LIMITS = {
  blog_light: 5,
  blog_pro: 15,
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  // blog_plan チェック
  const client = await env.DB.prepare(
    `SELECT blog_plan FROM clients WHERE id = ?`
  ).bind(user.clientId).first();

  if (!client?.blog_plan) {
    return jsonResponse({ error: 'ブログオプションが有効ではありません' }, 403);
  }

  // 月間生成数チェック
  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const limit = BLOG_LIMITS[client.blog_plan] || 0;

  const usage = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM usage
     WHERE client_id = ? AND billing_period = ? AND action = 'blog_generate'`
  ).bind(user.clientId, billingPeriod).first();

  if (usage.count >= limit) {
    return jsonResponse({
      error: '今月のブログ生成回数の上限に達しました',
      code: 'BLOG_LIMIT_EXCEEDED',
      usage: { used: usage.count, limit },
    }, 429);
  }

  // リクエストボディ
  const body = await request.json();
  const { topic, keywords } = body;

  if (!topic?.trim()) {
    return jsonResponse({ error: 'topic は必須です' }, 400);
  }

  // AI で記事生成
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'API キーが設定されていません' }, 500);
  }

  const keywordStr = keywords?.length ? `キーワード: ${keywords.join(', ')}\n` : '';
  const prompt = `あなたはSEOに詳しいプロのWebライターです。以下のトピックについて、日本語でブログ記事を書いてください。

トピック: ${topic}
${keywordStr}
要件:
- タイトル（SEOを意識した魅力的なもの、40文字以内）
- 本文（Markdown形式、1500〜2000文字程度）
- slug（英語、ハイフン区切り、30文字以内）

以下のJSON形式で出力してください:
{"title": "...", "content": "...", "slug": "..."}`;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('OpenAI API エラー:', err);
      return jsonResponse({ error: 'AI記事生成に失敗しました' }, 502);
    }

    const aiData = await aiRes.json();
    const generated = JSON.parse(aiData.choices[0].message.content);

    // slug の正規化
    let slug = generated.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);

    // slug 重複チェック
    const existing = await env.DB.prepare(
      `SELECT id FROM blog_posts WHERE client_id = ? AND slug = ?`
    ).bind(user.clientId, slug).first();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    // D1 に保存
    const postId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, client_id, title, content, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', unixepoch(), unixepoch())`
    ).bind(postId, user.clientId, generated.title, generated.content, slug).run();

    // usage 記録
    await env.DB.prepare(
      `INSERT INTO usage (client_id, action, job_id, billing_period)
       VALUES (?, 'blog_generate', ?, ?)`
    ).bind(user.clientId, postId, billingPeriod).run();

    return jsonResponse({
      id: postId,
      title: generated.title,
      slug,
      status: 'draft',
      usage: { used: usage.count + 1, limit },
    }, 201);

  } catch (err) {
    console.error('ブログ生成エラー:', err.message);
    return jsonResponse({ error: 'ブログ生成中にエラーが発生しました' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
