// ============================================
// SiteVibe — Whisper API プロキシ
// Cloudflare Pages Functions
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY が設定されていません' }, 500);
  }

  try {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ error: 'Content-Type は multipart/form-data である必要があります' }, 400);
    }

    // クライアントからの FormData をそのまま取得
    const formData = await request.formData();
    const audioFile = formData.get('file');

    if (!audioFile) {
      return jsonResponse({ error: '音声ファイルが含まれていません' }, 400);
    }

    // ファイルサイズチェック（25MB上限）
    if (audioFile.size > 25 * 1024 * 1024) {
      return jsonResponse({ error: '音声ファイルは25MB以下にしてください' }, 400);
    }

    // OpenAI Whisper API に転送
    const openaiForm = new FormData();
    openaiForm.append('file', audioFile, audioFile.name || 'recording.webm');
    openaiForm.append('model', 'whisper-1');
    openaiForm.append('language', 'ja');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openaiForm,
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Whisper API エラー:', res.status, errBody);
      return jsonResponse({ error: '音声認識に失敗しました' }, 502);
    }

    const result = await res.json();
    return jsonResponse({ text: result.text });

  } catch (err) {
    console.error('transcribe エラー:', err);
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
