import { DEFAULT_TEMPLATE_ID, getActiveTemplates } from '../../data/site-templates.mjs';

const templates = getActiveTemplates();
const grid = document.getElementById('adminTemplateGrid');
const clientInput = document.getElementById('clientId');
const statusText = document.getElementById('clientStatus');
let selectedId = DEFAULT_TEMPLATE_ID;

renderTemplates(selectedId);

function renderTemplates(activeId) {
  grid.innerHTML = templates.map((template) => {
    const selected = template.id === activeId;
    const demoLink = template.demoPath ? `<a href="${template.demoPath}" target="_blank" rel="noopener">デモを見る</a>` : '<span>選択候補</span>';
    return `<article class="template-card ${selected ? 'is-selected' : ''}">
      <div class="template-card__head"><h2>${template.name}</h2>${selected ? '<strong>選択中</strong>' : ''}</div>
      <p>${template.target}</p>
      <dl><div><dt>印象</dt><dd>${template.colorMood}</dd></div><div><dt>構成</dt><dd>${template.layout}</dd></div></dl>
      <div class="template-card__actions"><button type="button" data-id="${template.id}" ${selected ? 'disabled' : ''}>このテンプレートにする</button>${demoLink}</div>
    </article>`;
  }).join('');

  grid.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => saveTemplate(button.dataset.id));
  });
}

async function saveTemplate(templateId) {
  statusText.textContent = '保存中です。';
  try {
    const res = await fetch('/api/template-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientInput.value.trim(), templateId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存できませんでした');
    selectedId = data.selectedTemplateId;
    renderTemplates(selectedId);
    statusText.textContent = `保存しました。選択中は「${data.selectedTemplateName}」です。`;
  } catch (error) {
    statusText.textContent = error.message || '保存できませんでした。';
  }
}
