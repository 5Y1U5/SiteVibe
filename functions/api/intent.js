// ============================================
// SiteVibe — インテント判定 API
// ユーザーのメッセージが「サイト変更依頼」か「雑談」かをAIで判定
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ intent: 'chat' });
  }

  try {
    const { message } = await request.json();
    if (!message?.trim()) {
      return jsonResponse({ intent: 'chat' });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `あなたはWebサイト管理AIです。ユーザーのメッセージが以下のどちらかを判定してください。

「code」— サイトのHTML/CSS/JSの変更・追加・修正・削除を依頼している（テキスト変更、デザイン変更、セクション追加、画像差し替え、レイアウト調整なども含む）
「chat」— 雑談、質問、感想、挨拶など、サイトのコード変更を伴わないメッセージ

「code」か「chat」のどちらか1単語だけを返してください。`
          },
          { role: 'user', content: message }
        ],
      }),
    });

    if (!res.ok) {
      return jsonResponse({ intent: 'chat' });
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || 'chat').trim().toLowerCase();
    const intent = raw.includes('code') ? 'code' : 'chat';

    return jsonResponse({ intent });

  } catch {
    return jsonResponse({ intent: 'chat' });
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
