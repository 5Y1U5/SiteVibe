import { ACTIVE_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID, SITE_TEMPLATES, getActiveTemplates, getTemplateById } from '../../data/site-templates.mjs';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const activeOnly = url.searchParams.get('active') !== '0';

  if (id) {
    const template = getTemplateById(id);
    if (!template || (activeOnly && !template.active)) {
      return jsonResponse({ error: 'テンプレートが見つかりません' }, 404);
    }
    return jsonResponse({ template, activeTemplateIds: ACTIVE_TEMPLATE_IDS, defaultTemplateId: DEFAULT_TEMPLATE_ID });
  }

  const templates = activeOnly ? getActiveTemplates() : SITE_TEMPLATES;
  return jsonResponse({ templates, activeTemplateIds: ACTIVE_TEMPLATE_IDS, defaultTemplateId: DEFAULT_TEMPLATE_ID });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
