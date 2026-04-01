// ============================================
// SiteVibe — プレビュー プロキシ
// ジョブランナーから変更後のHTMLを取得してiframeに表示
// ============================================

export async function onRequestGet(context) {
  const { env } = context;

  const jobRunnerUrl = env.JOB_RUNNER_URL;
  const jobRunnerToken = env.JOB_RUNNER_TOKEN;

  if (!jobRunnerUrl || !jobRunnerToken) {
    // ジョブランナー未接続時はpages.devにフォールバック
    return Response.redirect('https://sitevibe.pages.dev/', 302);
  }

  try {
    const res = await fetch(`${jobRunnerUrl}/preview`, {
      headers: { 'Authorization': `Bearer ${jobRunnerToken}` },
    });

    if (!res.ok) {
      return Response.redirect('https://sitevibe.pages.dev/', 302);
    }

    const html = await res.text();
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return Response.redirect('https://sitevibe.pages.dev/', 302);
  }
}
