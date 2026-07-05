import { ACTIVE_TEMPLATE_IDS, getTemplateById } from '../../data/site-templates.mjs';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const templateId = url.searchParams.get('templateId') || 'calm-journey-salon';
  const template = getTemplateById(templateId);

  if (!template || !ACTIVE_TEMPLATE_IDS.includes(templateId)) {
    return jsonResponse({ error: '選択できないテンプレートです', activeTemplateIds: ACTIVE_TEMPLATE_IDS }, 400);
  }

  return jsonResponse({ selectedTemplateId: template.id, template, activeTemplateIds: ACTIVE_TEMPLATE_IDS });
}

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const templateId = body.templateId || body.template_id || 'calm-journey-salon';
  const template = getTemplateById(templateId);

  if (!template || !ACTIVE_TEMPLATE_IDS.includes(templateId)) {
    return jsonResponse({ error: '選択できないテンプレートです', activeTemplateIds: ACTIVE_TEMPLATE_IDS }, 400);
  }

  return jsonResponse({
    success: true,
    clientId: body.clientId || body.client_id || 'sample-client',
    selectedTemplateId: template.id,
    selectedTemplateName: template.name,
    activeTemplateIds: ACTIVE_TEMPLATE_IDS,
    replaceableFields: template.replaceableFields || [],
  });
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
