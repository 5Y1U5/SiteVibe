// ============================================
// SiteVibe — ディレクションシート送信 API
// Cloudflare Pages Functions
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    // 必須チェック
    if (!data.businessName) {
      return new Response(JSON.stringify({ error: '店舗名は必須です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Claude Code用プロンプトを生成
    const prompt = buildClaudePrompt(data);

    // メール送信（Resend）
    const emailResult = await sendNotification(env, data, prompt);

    if (!emailResult.ok) {
      console.error('メール送信失敗:', emailResult.error);
      return new Response(JSON.stringify({ error: 'メール送信に失敗しました' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('API エラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Claude Code にそのまま投げられるプロンプト形式を生成
function buildClaudePrompt(d) {
  const lines = [];

  lines.push(`# SiteVibe 制作依頼: ${d.businessName}`);
  lines.push('');
  lines.push('以下のディレクションシートの内容をもとに、Webサイトを制作してください。');
  lines.push('');

  // 基本情報
  lines.push('## 基本情報');
  if (d.businessName) lines.push(`- 店舗名/会社名: ${d.businessName}`);
  if (d.businessType) lines.push(`- 業種: ${d.businessType}`);
  if (d.address) lines.push(`- 住所: ${d.address}`);
  if (d.phone) lines.push(`- 電話番号: ${d.phone}`);
  if (d.email) lines.push(`- メールアドレス: ${d.email}`);
  if (d.hours) lines.push(`- 営業時間: ${d.hours}`);
  if (d.holidays) lines.push(`- 定休日: ${d.holidays}`);
  lines.push('');

  // サービス・ターゲット
  lines.push('## サービス内容');
  if (d.mainServices) lines.push(`### 主なサービス・メニュー\n${d.mainServices}`);
  if (d.strengths) lines.push(`\n### 強み・こだわり\n${d.strengths}`);
  if (d.target) lines.push(`\n### ターゲット\n${d.target}`);
  if (d.competitors) lines.push(`\n### 競合・参考店\n${d.competitors}`);
  lines.push('');

  // デザイン
  lines.push('## デザイン');
  if (d.designTaste) lines.push(`- テイスト: ${d.designTaste}`);
  if (d.mainColor) lines.push(`- メインカラー: ${d.mainColor}`);
  if (d.refSites) lines.push(`- 参考サイト:\n${d.refSites}`);
  lines.push('');

  // ページ構成
  if (d.pages && d.pages.length > 0) {
    lines.push('## ページ構成');
    d.pages.forEach(p => lines.push(`- ${p}`));
    if (d.otherPages) lines.push(`- ${d.otherPages}`);
    lines.push('');
  }

  // SNS・外部リンク
  const sns = [];
  if (d.instagram) sns.push(`- Instagram: ${d.instagram}`);
  if (d.line) sns.push(`- LINE: ${d.line}`);
  if (d.googleMap) sns.push(`- Googleマップ: ${d.googleMap}`);
  if (d.hotpepper) sns.push(`- ホットペッパー等: ${d.hotpepper}`);
  if (sns.length > 0) {
    lines.push('## SNS・外部リンク');
    lines.push(...sns);
    lines.push('');
  }

  // アップロードファイル
  if (d.files && d.files.length > 0) {
    lines.push('## アップロード素材');
    d.files.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  // Chatta FAQ
  if (d.faqs && d.faqs.length > 0) {
    lines.push('## Chatta FAQ');
    d.faqs.forEach((faq, i) => {
      if (faq.question) {
        lines.push(`### FAQ ${i + 1}`);
        lines.push(`Q: ${faq.question}`);
        lines.push(`A: ${faq.answer || '（未記入）'}`);
        lines.push('');
      }
    });
  }

  // その他要望
  if (d.otherRequests) {
    lines.push('## その他要望');
    lines.push(d.otherRequests);
    lines.push('');
  }

  return lines.join('\n');
}

// Resend でメール送信
async function sendNotification(env, data, prompt) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY が未設定です' };
  }

  const toEmail = env.NOTIFICATION_EMAIL || 'support@i-styleinc.com';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SiteVibe <noreply@i-styleinc.com>',
      to: [toEmail],
      subject: `【SiteVibe】新規ディレクションシート: ${data.businessName}`,
      text: `${prompt}\n\n---\n送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return { ok: false, error: err };
  }

  return { ok: true };
}
