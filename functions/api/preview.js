// ============================================
// SiteVibe — プレビュー プロキシ
// ジョブランナーから変更後のHTMLを取得してiframeに表示
// CSS/JSパスをジョブランナーの絶対URLに書き換える
// ============================================

export async function onRequestGet(context) {
  const { env } = context;

  const jobRunnerUrl = env.JOB_RUNNER_URL;
  const jobRunnerToken = env.JOB_RUNNER_TOKEN;

  if (!jobRunnerUrl || !jobRunnerToken) {
    return Response.redirect('https://sitevibe.pages.dev/', 302);
  }

  try {
    const res = await fetch(`${jobRunnerUrl}/preview?raw=1`, {
      headers: { 'Authorization': `Bearer ${jobRunnerToken}` },
    });

    if (!res.ok) {
      return Response.redirect('https://sitevibe.pages.dev/', 302);
    }

    let html = await res.text();

    // CSS/JS/画像の相対パスをジョブランナーの絶対URLに書き換え
    // raw=1 で取得しているため、ジョブランナー側のパス書き換えは未適用
    const base = jobRunnerUrl + '/preview';
    html = html.replace(/href="css\//g, `href="${base}/css/`);
    html = html.replace(/href="\.\.\/css\//g, `href="${base}/css/`);
    html = html.replace(/src="js\//g, `src="${base}/js/`);
    html = html.replace(/src="\.\.\/js\//g, `src="${base}/js/`);
    html = html.replace(/src="images\//g, `src="${base}/images/`);
    html = html.replace(/src="\.\.\/images\//g, `src="${base}/images/`);

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
