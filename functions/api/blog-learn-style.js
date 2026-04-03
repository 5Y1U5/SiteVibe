// ============================================
// SiteVibe — ブログスタイル自動学習 API
// 公開済み記事を分析して writing_profile を自動更新
// Haiku 4.5 を使用（コスト重視）
// ============================================

const MIN_POSTS_FOR_LEARNING = 3;

export async function onRequestPost(context) {
  const { env } = context;
  const user = context.data?.user;

  if (!user) return jsonResponse({ error: '認証が必要です' }, 401);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY が未設定です' }, 500);

  // 公開済み記事を取得（最新10件）
  const posts = await env.DB.prepare(
    `SELECT title, content FROM blog_posts
     WHERE client_id = ? AND status = 'published'
     ORDER BY published_at DESC LIMIT 10`
  ).bind(user.clientId).all();

  const articles = posts.results || [];
  if (articles.length < MIN_POSTS_FOR_LEARNING) {
    return jsonResponse({
      error: `スタイル学習には${MIN_POSTS_FOR_LEARNING}本以上の公開記事が必要です`,
      current: articles.length,
      required: MIN_POSTS_FOR_LEARNING,
    }, 400);
  }

  // 記事サンプルを構築（タイトル + 冒頭500文字）
  const samples = articles.map((a, i) =>
    `【記事${i + 1}】${a.title}\n${a.content.substring(0, 500)}`
  ).join('\n\n---\n\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `あなたはライティングスタイルの分析者です。複数の記事サンプルから著者のライティングスタイルを分析し、以下のJSON形式で出力してください。

{"tone": "記事全体のトーン（例: カジュアルだけど知的、温かみのある専門的）", "style": "文章スタイル（例: 体験ベース、データ重視、ストーリー仕立て）", "audience": "想定読者層", "notes": "特徴的な表現や癖、一人称、語尾のパターン", "vocabulary": "よく使う言葉やフレーズ（3-5個）", "sentence_patterns": "文の長さや構造の傾向"}

JSONのみ出力してください。`,
        messages: [{ role: 'user', content: `以下の${articles.length}本の記事を分析してください。\n\n${samples}` }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic API エラー:', err);
      return jsonResponse({ error: 'スタイル分析に失敗しました' }, 500);
    }

    const data = await res.json();
    const text = data.content[0].text;

    // JSON 抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return jsonResponse({ error: 'スタイル分析結果のパースに失敗しました' }, 500);
    }

    const profile = JSON.parse(jsonMatch[0]);
    const profileJson = JSON.stringify(profile);

    // D1 に保存
    await env.DB.prepare(
      'UPDATE clients SET writing_profile = ? WHERE id = ?'
    ).bind(profileJson, user.clientId).run();

    console.log(`スタイル学習完了: ${user.clientId} (${articles.length}本分析)`);
    return jsonResponse({ profile, analyzed: articles.length });

  } catch (err) {
    console.error('スタイル学習エラー:', err.message);
    return jsonResponse({ error: 'スタイル学習中にエラーが発生しました' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
