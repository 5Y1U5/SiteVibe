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
    // クライアントからのリクエストボディをそのまま取得
    const formData = await request.formData();
    const audioFile = formData.get('file');

    if (!audioFile) {
      return jsonResponse({ error: '音声ファイルが含まれていません' }, 400);
    }

    // ファイルサイズチェック（25MB上限）
    if (audioFile.size > 25 * 1024 * 1024) {
      return jsonResponse({ error: '音声ファイルは25MB以下にしてください' }, 400);
    }

    // 音声データを ArrayBuffer として読み出し
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type || 'audio/webm' });

    // OpenAI Whisper API 用の FormData を構築
    const openaiForm = new FormData();
    openaiForm.append('file', audioBlob, 'recording.webm');
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
      return jsonResponse({ error: '音声認識に失敗しました', detail: errBody }, 502);
    }

    const result = await res.json();
    return jsonResponse({ text: result.text });

  } catch (err) {
    console.error('transcribe エラー:', err.message, err.stack);
    return jsonResponse({ error: 'サーバーエラーが発生しました', detail: err.message }, 500);
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
