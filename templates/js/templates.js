import { getActiveTemplates } from '../../data/site-templates.mjs';

const grid = document.getElementById('templateGrid');
const count = document.getElementById('templateCount');
const filter = document.getElementById('categoryFilter');
const templates = getActiveTemplates();
let activeCategory = 'all';

const labels = { all: 'すべて', standard: '王道', editorial: '編集型', lp: 'LP', pop: 'ポップ', premium: '高単価', consultation: '相談導線' };

count.textContent = templates.length;
renderFilter();
renderTemplates();

function renderFilter() {
  const categories = ['all', ...new Set(templates.map((template) => template.category))];
  filter.innerHTML = categories.map((category) => `<button type="button" class="${category === activeCategory ? 'is-active' : ''}" data-category="${category}">${labels[category] || category}</button>`).join('');
  filter.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    renderFilter();
    renderTemplates();
  }));
}

function renderTemplates() {
  const visible = activeCategory === 'all' ? templates : templates.filter((template) => template.category === activeCategory);
  grid.innerHTML = visible.map((template) => {
    const featured = template.id === 'calm-journey-salon';
    const action = template.demoPath ? `<a href="${template.demoPath}">デモを見る</a>` : '<button type="button" disabled>選択候補</button>';
    return `<article class="template-card ${featured ? 'template-card--featured' : ''}">
      <div class="template-card__top"><h3>${template.name}</h3>${featured ? '<span>NEW</span>' : ''}</div>
      <p>${template.target}</p>
      <dl><div><dt>色と印象</dt><dd>${template.colorMood}</dd></div><div><dt>レイアウト</dt><dd>${template.layout}</dd></div><div><dt>提案ポイント</dt><dd>${template.salesPoint}</dd></div></dl>
      <div class="template-card__tags">${template.tags.map((tag) => `<span>${tag}</span>`).join('')}</div>
      <div class="template-card__actions">${action}</div>
    </article>`;
  }).join('');
}
