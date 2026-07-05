import { getActiveTemplates } from '../../data/site-templates.mjs';

const templates = getActiveTemplates();
const grid = document.getElementById('partnerGrid');
const selectedName = document.getElementById('selectedTemplateName');
const selectedSummary = document.getElementById('selectedTemplateSummary');
const demoButton = document.getElementById('demoButton');
const salonName = document.getElementById('salonName');
let selectedTemplate = null;

renderCards();
selectTemplate(templates.find((template) => template.id === 'calm-journey-salon') || templates[0]);

demoButton.addEventListener('click', async () => {
  if (!selectedTemplate) return;
  demoButton.disabled = true;
  demoButton.textContent = '準備中...';

  try {
    const res = await fetch('/api/demo-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: selectedTemplate.id, salonName: salonName.value.trim() }),
    });
    const data = await res.json();
    if (data.demoUrl) {
      window.location.href = data.demoUrl;
      return;
    }
  } catch {
    if (selectedTemplate.demoPath) {
      window.location.href = selectedTemplate.demoPath;
      return;
    }
  }

  demoButton.disabled = !selectedTemplate.demoPath;
  demoButton.textContent = selectedTemplate.demoPath ? 'デモを開く' : '選択候補として利用';
});

function renderCards() {
  grid.innerHTML = templates.map((template) => `<article class="partner-card" data-id="${template.id}" tabindex="0" role="button">
    <div class="partner-card__top"><h2>${template.name}</h2>${template.id === 'calm-journey-salon' ? '<span>NEW</span>' : ''}</div>
    <p>${template.salesPoint}</p>
    <div class="partner-card__tags">${template.tags.slice(0, 4).map((tag) => `<span>${tag}</span>`).join('')}</div>
  </article>`).join('');

  grid.querySelectorAll('.partner-card').forEach((card) => {
    const template = templates.find((item) => item.id === card.dataset.id);
    card.addEventListener('click', () => selectTemplate(template));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectTemplate(template);
      }
    });
  });
}

function selectTemplate(template) {
  selectedTemplate = template;
  selectedName.textContent = template.name;
  selectedSummary.textContent = template.layout;
  demoButton.disabled = !template.demoPath;
  demoButton.textContent = template.demoPath ? 'デモを開く' : '選択候補として利用';

  grid.querySelectorAll('.partner-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.id === template.id);
  });
}
