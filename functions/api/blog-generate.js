// ============================================
// SiteVibe — ブログ記事生成 API
// AI で SEO 記事を生成し D1 に保存
// ライティングDNA（writing_profile）対応
// Anthropic API 優先、フォールバック OpenAI
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
    `SELECT blog_plan, writing_profile FROM clients WHERE id = ?`
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
  const { topic, keywords, transcript, seriesId } = body;

  if (!topic?.trim() && !transcript?.trim()) {
    return jsonResponse({ error: 'topic または transcript は必須です' }, 400);
  }

  // ライティングDNA プロンプト構築
  let writingDna = '';
  if (client.writing_profile) {
    try {
      const profile = JSON.parse(client.writing_profile);
      const parts = [];
      if (profile.tone) parts.push(`トーン: ${profile.tone}`);
      if (profile.style) parts.push(`文体: ${profile.style}`);
      if (profile.audience) parts.push(`対象読者: ${profile.audience}`);
      if (profile.notes) parts.push(`その他の特徴: ${profile.notes}`);
      if (parts.length > 0) {
        writingDna = `\n\n## ライティングスタイル（この人らしい書き方で書いてください）\n${parts.join('\n')}`;
      }
    } catch { /* JSON パースエラーは無視 */ }
  }

  const keywordStr = keywords?.length ? `キーワード: ${keywords.join(', ')}\n` : '';

  // シリーズ指定時に既存記事のコンテキストを収集
  let seriesContext = '';
  if (seriesId) {
    const seriesInfo = await env.DB.prepare(
      'SELECT name, description FROM blog_series WHERE id = ? AND client_id = ?'
    ).bind(seriesId, user.clientId).first();

    if (seriesInfo) {
      const seriesPosts = await env.DB.prepare(
        `SELECT title, content FROM blog_posts
         WHERE series_id = ? AND client_id = ? AND status IN ('published', 'draft')
         ORDER BY series_order ASC, created_at ASC LIMIT 5`
      ).bind(seriesId, user.clientId).all();

      const existing = (seriesPosts.results || [])
        .map((p, i) => `${i + 1}. ${p.title}\n${p.content.substring(0, 300)}`)
        .join('\n\n');

      seriesContext = `\n\n## シリーズ「${seriesInfo.name}」の続きとして書いてください
${seriesInfo.description ? `シリーズ概要: ${seriesInfo.description}\n` : ''}
${existing ? `既に公開済みの記事:\n${existing}\n\n重複しない新しい切り口で書いてください。` : ''}`;
    }
  }

  // transcript がある場合は音声メモベースの記事生成
  let contentInstruction;
  if (transcript?.trim()) {
    contentInstruction = `以下は音声メモの文字起こしです。この内容をもとに、整理されたブログ記事を書いてください。
話し手の意図や気づきを活かしつつ、読みやすく構成してください。

音声メモ:
${transcript}

${topic ? `テーマ: ${topic}\n` : ''}${keywordStr}`;
  } else {
    contentInstruction = `以下のトピックについてブログ記事を書いてください。

トピック: ${topic}
${keywordStr}`;
  }

  const systemPrompt = `あなたはプロのブログライターです。${writingDna}${seriesContext}

要件:
- タイトル（魅力的で読みたくなるもの、40文字以内）
- 本文（Markdown形式、1500〜2500文字程度）
- slug（英語、ハイフン区切り、30文字以内）
- meta_description（記事の要約、120〜160文字程度、検索結果に表示される説明文）

以下のJSON形式で出力してください:
{"title": "...", "content": "...", "slug": "...", "meta_description": "..."}`;

  try {
    let generated;

    // Anthropic API が設定されていれば優先使用
    if (env.ANTHROPIC_API_KEY) {
      generated = await generateWithAnthropic(env.ANTHROPIC_API_KEY, systemPrompt, contentInstruction);
    } else if (env.OPENAI_API_KEY) {
      generated = await generateWithOpenAI(env.OPENAI_API_KEY, systemPrompt, contentInstruction);
    } else {
      return jsonResponse({ error: 'API キーが設定されていません' }, 500);
    }

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
    const metaDesc = generated.meta_description || generated.content.replace(/[#*\-\n]/g, ' ').trim().substring(0, 160);
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, client_id, title, content, slug, meta_description, series_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', unixepoch(), unixepoch())`
    ).bind(postId, user.clientId, generated.title, generated.content, slug, metaDesc, seriesId || null).run();

    // usage 記録
    await env.DB.prepare(
      `INSERT INTO usage (client_id, action, job_id, billing_period)
       VALUES (?, 'blog_generate', ?, ?)`
    ).bind(user.clientId, postId, billingPeriod).run();

    return jsonResponse({
      id: postId,
      title: generated.title,
      content: generated.content,
      slug,
      meta_description: metaDesc,
      status: 'draft',
      usage: { used: usage.count + 1, limit },
    }, 201);

  } catch (err) {
    console.error('ブログ生成エラー:', err.message);
    return jsonResponse({ error: 'ブログ生成中にエラーが発生しました' }, 500);
  }
}

// ─── Anthropic Claude API ───
async function generateWithAnthropic(apiKey, systemPrompt, userMessage) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Anthropic API エラー:', err);
    throw new Error('Anthropic API エラー');
  }

  const data = await res.json();
  const text = data.content[0].text;

  // JSON を抽出（コードブロック内の場合も対応）
  const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON パース失敗');

  return JSON.parse(jsonMatch[0]);
}

// ─── OpenAI API ───
async function generateWithOpenAI(apiKey, systemPrompt, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('OpenAI API エラー:', err);
    throw new Error('OpenAI API エラー');
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
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
