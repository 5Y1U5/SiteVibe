// ============================================
// SiteVibe — バイブ チャット API（高速応答）
// コード変更不要の会話用。OpenAI GPT で即座に返答。
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'API設定エラー' }, 500);
  }

  try {
    const { message } = await request.json();
    if (!message?.trim()) {
      return jsonResponse({ error: 'message は必須です' }, 400);
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `あなたは「バイブ」です。SiteVibeのAIアシスタントです。
性格: 明るくて頼れるパートナー。親しみやすいけど、仕事はしっかり。
一人称: バイブ
口調: です/ます ベースの親しみやすい丁寧語。「！」でエネルギー感、「〜ね」「〜よ」で親しみを出す。
例: 「了解です！変更しますね！」「お任せください！」「確認してみてくださいね！」
ルール:
- サイトの変更依頼には「了解です！変更しますね！」と返す（実際の変更はしない）
- 雑談には明るく短く返す
- 返答は2-3文以内で簡潔に`
          },
          { role: 'user', content: message }
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Chat API エラー:', err);
      return jsonResponse({ error: 'チャットエラー' }, 502);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'すみません、うまく返せませんでした...';

    return jsonResponse({ reply });

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
