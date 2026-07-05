import { ACTIVE_TEMPLATE_IDS, getTemplateById } from '../../data/site-templates.mjs';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const templateId = url.searchParams.get('templateId') || 'calm-journey-salon';
  return buildDemoResponse(templateId, context.request.url);
}

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const templateId = body.templateId || body.template_id || 'calm-journey-salon';
  return buildDemoResponse(templateId, context.request.url, body);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function buildDemoResponse(templateId, requestUrl, body = {}) {
  if (!ACTIVE_TEMPLATE_IDS.includes(templateId)) {
    return jsonResponse({ error: '選択できないテンプレートです', activeTemplateIds: ACTIVE_TEMPLATE_IDS }, 400);
  }

  const template = getTemplateById(templateId);
  if (!template) {
    return jsonResponse({ error: 'テンプレートが見つかりません' }, 404);
  }

  const origin = new URL(requestUrl).origin;
  const demoPath = template.demoPath || '';
  const demoUrl = demoPath ? new URL(demoPath, origin).toString() : '';
  const salonName = body.salonName || body.salon_name || 'calm hair garden';

  return jsonResponse({
    success: Boolean(demoPath),
    templateId: template.id,
    templateName: template.name,
    salonName,
    demoPath,
    demoUrl,
    activeTemplateIds: ACTIVE_TEMPLATE_IDS,
    replaceableFields: template.replaceableFields || [],
    recommendedSections: ['ファーストビュー', '初めての方へ', '来店ステップ', '悩み別メニュー', '料金', '口コミ', 'FAQ', 'アクセス', '予約導線'],
    message: demoPath ? 'デモを表示できます' : 'このテンプレートは選択候補として利用できます',
  });
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
