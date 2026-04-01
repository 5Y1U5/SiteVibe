// ============================================
// SiteVibe — TTS API プロキシ
// Cloudflare Pages Functions
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY が設定されていません' }, 500);
  }

  try {
    const { text, voice } = await request.json();

    if (!text || typeof text !== 'string') {
      return jsonResponse({ error: 'text パラメータは必須です' }, 400);
    }

    // テキスト長チェック（4096文字上限）
    const input = text.slice(0, 4096);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice: voice || 'alloy',
        response_format: 'mp3',
        speed: 1.25,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('TTS API エラー:', res.status, errBody);
      return jsonResponse({ error: '音声合成に失敗しました' }, 502);
    }

    // 音声バイナリをそのまま返す
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    console.error('speech エラー:', err);
    return jsonResponse({ error: 'サーバーエラーが発生しました' }, 500);
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

// CORS プリフライト対応
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
