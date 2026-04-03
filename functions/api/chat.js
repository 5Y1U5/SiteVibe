// ============================================
// SiteVibe — バイブ 統合チャット API
// 会話・ブログ・コード変更の判定をAIが一元的に行う
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'API設定エラー' }, 500);
  }

  try {
    const body = await request.json();
    const { message, history } = body;
    if (!message?.trim()) {
      return jsonResponse({ error: 'message は必須です' }, 400);
    }

    // 会話履歴を構築（直近5往復まで）
    const chatHistory = (history || []).slice(-10).map(h => ({
      role: h.role,
      content: h.content,
    }));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `あなたは「バイブ」です。SiteVibeのAIアシスタントです。
性格: 明るくて頼れるパートナー。親しみやすいけど、仕事はしっかり。
一人称: バイブ
口調: です/ます ベースの親しみやすい丁寧語。「！」でエネルギー感、「〜ね」「〜よ」で親しみを出す。

あなたは以下の3つの役割を持っています:
1. 雑談・質問への対応（通常の会話）
2. ブログ記事の生成依頼への対応
3. サイトのコード変更依頼への対応

必ず以下のJSON形式で返してください:
{"reply": "ユーザーへの返答テキスト", "action": "アクション名", "topic": "ブログトピック（該当時のみ）"}

actionの判定基準:
- "chat" — 雑談、質問、感想、挨拶、お礼など
- "blog_generate" — ユーザーが具体的なテーマを指定してブログ記事を書いてほしい場合。topicにテーマを入れる
- "blog_prompt" — ユーザーがブログを書きたいと言っているが、まだ具体的なテーマが決まっていない場合。テーマを聞く返答をする
- "code" — サイトのHTML/CSS/JSの変更・追加・修正を依頼している場合

重要:
- 会話の流れを読んで判定する。前のメッセージで「ブログ書きたい」→今回「ChatGPTの基礎で」なら blog_generate
- 「おまかせで」「お任せ」「何でもいい」は、前にテーマが出ていればそのテーマで blog_generate
- blog_generate の場合、replyは「了解です！記事を生成しますね！」程度で短く
- blog_prompt の場合、replyでテーマを聞く
- replyは2-3文以内で簡潔に`
          },
          ...chatHistory,
          { role: 'user', content: message }
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Chat API エラー:', err);
      return jsonResponse({ reply: 'すみません、うまく返せませんでした...', action: 'chat' });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(raw);
      return jsonResponse({
        reply: parsed.reply || 'すみません、うまく返せませんでした...',
        action: parsed.action || 'chat',
        topic: parsed.topic || null,
      });
    } catch {
      return jsonResponse({ reply: raw, action: 'chat' });
    }

  } catch (err) {
    console.error('chat エラー:', err);
    return jsonResponse({ error: 'サーバーエラー' }, 500);
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
