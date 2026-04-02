// ============================================
// SiteVibe — 申込ページスクリプト
// プラン選択 → オプション → 情報入力 → Stripe Checkout
// ============================================

const PLAN_DATA = {
  light:    { name: 'Light',    setup: 55000,  monthly: 5500  },
  standard: { name: 'Standard', setup: 110000, monthly: 11000 },
  premium:  { name: 'Premium',  setup: 220000, monthly: 33000 },
};

const ADDON_DATA = {
  blog_light:   { name: 'Blog Light',   monthly: 3300 },
  blog_pro:     { name: 'Blog Pro',     monthly: 5500 },
  chatta_light: { name: 'Chatta Light', monthly: 3300 },
  chatta_pro:   { name: 'Chatta Pro',   monthly: 8800 },
};

let currentStep = 1;
let selectedPlan = '';
let selectedBlog = '';
let selectedChatta = '';

// ─── 初期化 ───
document.addEventListener('DOMContentLoaded', () => {
  // URL パラメータからプラン取得
  const params = new URLSearchParams(location.search);
  const urlPlan = params.get('plan');
  if (urlPlan && PLAN_DATA[urlPlan]) {
    selectPlan(urlPlan);
  }

  // キャンセル通知
  if (params.get('canceled') === '1') {
    document.getElementById('canceledBanner').hidden = false;
  }

  initPlanCards();
  initOptions();
  initNavigation();
  initForm();
  updateSummary();
});

// ─── プラン選択 ───
function initPlanCards() {
  document.querySelectorAll('.apply__plan-card').forEach(card => {
    card.addEventListener('click', () => {
      selectPlan(card.dataset.plan);
    });
  });
}

function selectPlan(plan) {
  selectedPlan = plan;
  document.querySelectorAll('.apply__plan-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.plan === plan);
    c.querySelector('input').checked = c.dataset.plan === plan;
  });
  document.getElementById('step1Next').disabled = false;
  updateSummary();
}

// ─── オプション ───
function initOptions() {
  document.querySelectorAll('input[name="blogPlan"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedBlog = radio.value;
      updateSummary();
    });
  });
  document.querySelectorAll('input[name="chattaPlan"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedChatta = radio.value;
      updateSummary();
    });
  });
}

// ─── ナビゲーション ───
function initNavigation() {
  document.getElementById('step1Next').addEventListener('click', () => goToStep(2));
  document.getElementById('step2Back').addEventListener('click', () => goToStep(1));
  document.getElementById('step2Next').addEventListener('click', () => goToStep(3));
  document.getElementById('step3Back').addEventListener('click', () => goToStep(2));
}

function goToStep(step) {
  document.querySelectorAll('.apply__step').forEach(el => {
    el.classList.remove('active');
    el.style.animation = 'none';
  });
  const target = document.querySelector(`[data-step="${step}"]`);
  if (target) {
    target.classList.add('active');
    target.offsetHeight;
    target.style.animation = '';
  }

  // インジケーター更新
  document.querySelectorAll('.apply__indicator').forEach(ind => {
    const n = parseInt(ind.dataset.ind);
    ind.classList.toggle('active', n === step);
    ind.classList.toggle('done', n < step);
  });

  // プログレスバー
  document.getElementById('progressBar').style.width = `${(step / 3) * 100}%`;

  currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Step 3 に来たら料金サマリーを更新
  if (step === 3) updateSummary();
}

// ─── 料金サマリー ───
function updateSummary() {
  if (!selectedPlan) return;

  const plan = PLAN_DATA[selectedPlan];
  let monthlyTotal = plan.monthly;
  let items = `<div class="apply__summary-item">
    <span>${plan.name}プラン</span>
    <span>&yen;${plan.monthly.toLocaleString()}/月</span>
  </div>`;

  if (selectedBlog && ADDON_DATA[selectedBlog]) {
    const addon = ADDON_DATA[selectedBlog];
    monthlyTotal += addon.monthly;
    items += `<div class="apply__summary-item">
      <span>${addon.name}</span>
      <span>+&yen;${addon.monthly.toLocaleString()}/月</span>
    </div>`;
  }

  if (selectedChatta && ADDON_DATA[selectedChatta]) {
    const addon = ADDON_DATA[selectedChatta];
    monthlyTotal += addon.monthly;
    items += `<div class="apply__summary-item">
      <span>${addon.name}</span>
      <span>+&yen;${addon.monthly.toLocaleString()}/月</span>
    </div>`;
  }

  const summaryItems = document.getElementById('summaryItems');
  if (summaryItems) summaryItems.innerHTML = items;

  const summarySetup = document.getElementById('summarySetup');
  if (summarySetup) summarySetup.textContent = `¥${plan.setup.toLocaleString()}`;

  const summaryMonthly = document.getElementById('summaryMonthly');
  if (summaryMonthly) summaryMonthly.textContent = `¥${monthlyTotal.toLocaleString()}/月`;
}

// ─── フォーム送信 ───
function initForm() {
  const form = document.getElementById('applyForm');
  const termsCheck = document.getElementById('termsAgree');
  const submitBtn = document.getElementById('submitBtn');

  // 利用規約チェックで送信ボタン有効化
  termsCheck.addEventListener('change', () => {
    submitBtn.disabled = !termsCheck.checked;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!termsCheck.checked) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="apply__spinner"></span>決済ページに移動中...';

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          blogPlan: selectedBlog || undefined,
          chattaPlan: selectedChatta || undefined,
          name: document.getElementById('applyName').value.trim(),
          email: document.getElementById('applyEmail').value.trim(),
          company: document.getElementById('applyCompany').value.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '申込処理に失敗しました');
      }

      // Stripe Checkout ページにリダイレクト
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('決済URLの取得に失敗しました');
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>決済に進む</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      showError(err.message);
    }
  });
}

function showError(message) {
  // 既存のエラーバナーがあれば削除
  const existing = document.querySelector('.apply__error-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'apply__error-banner';
  banner.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    <span>${message}</span>
  `;
  document.getElementById('applyForm').prepend(banner);
  setTimeout(() => banner.remove(), 5000);
}
