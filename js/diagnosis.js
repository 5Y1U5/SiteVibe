// ============================================
// SiteVibe — 診断フォームスクリプト
// ============================================

const TOTAL_QUESTIONS = 7;
let currentStep = 0;
const answers = {};

// ステップ表示
function showStep(step) {
  // 全ステップ非表示
  document.querySelectorAll('.diag__step').forEach(el => {
    el.classList.remove('active');
    el.style.animation = 'none';
  });

  // 対象ステップ表示
  const target = document.querySelector(`[data-step="${step}"]`);
  if (target) {
    target.classList.add('active');
    // アニメーションリトリガー
    target.offsetHeight;
    target.style.animation = '';
  }

  // プログレスバー更新
  const progress = step === 0 ? 0 : Math.min((step / (TOTAL_QUESTIONS + 1)) * 100, 100);
  document.getElementById('progressBar').style.width = progress + '%';

  // 戻るボタン表示制御
  const backBtn = document.getElementById('backBtn');
  backBtn.style.display = (step > 0 && step <= TOTAL_QUESTIONS + 1) ? 'inline-flex' : 'none';

  // スクロール上部へ
  window.scrollTo({ top: 0, behavior: 'smooth' });

  currentStep = step;
}

function nextStep() {
  showStep(currentStep + 1);
}

function prevStep() {
  if (currentStep > 0) {
    showStep(currentStep - 1);
  }
}

// 選択肢クリック処理
document.querySelectorAll('.diag__options').forEach(group => {
  const isMulti = group.dataset.multi === 'true';
  const name = group.dataset.name;

  group.querySelectorAll('.diag__option').forEach(option => {
    option.addEventListener('click', () => {
      if (isMulti) {
        // 複数選択: トグル
        option.classList.toggle('selected');
        const selected = group.querySelectorAll('.diag__option.selected');
        answers[name] = Array.from(selected).map(o => o.dataset.value);
      } else {
        // 単一選択
        group.querySelectorAll('.diag__option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        answers[name] = option.dataset.value;

        // 自動で次へ（少しディレイ）
        setTimeout(() => nextStep(), 350);
      }
    });
  });
});

// フォーム送信
function submitDiagnosis(e) {
  e.preventDefault();

  const form = document.getElementById('diagForm');
  const formData = new FormData(form);

  // フォームデータを回答に追加
  answers.name = formData.get('name');
  answers.company = formData.get('company');
  answers.email = formData.get('email');
  answers.tel = formData.get('tel');
  answers.note = formData.get('note');

  // おすすめプラン判定
  const plan = recommendPlan(answers);

  // 結果表示
  showResult(plan);

  // プログレス100%
  document.getElementById('progressBar').style.width = '100%';

  // 戻るボタン非表示
  document.getElementById('backBtn').style.display = 'none';

  // 完了ステップへ
  showStep(9);

  // コンソールに回答データ出力（実装時はAPIに送信）
  console.log('診断回答:', answers);
  console.log('おすすめプラン:', plan);
}

// プラン推薦ロジック
// ページ数 + Q6の課題数でスコアリング
function recommendPlan(data) {
  let score = 0;

  // ページ数
  if (data.pages === '4〜7ページ') score += 2;
  if (data.pages === '8ページ以上') score += 4;

  // 問い合わせ対応の課題数（Q6）
  if (data.contactIssues && Array.isArray(data.contactIssues)) {
    const realIssues = data.contactIssues.filter(v => v !== '特にない');
    score += realIssues.length;
  }

  // 目的
  if (data.purpose === '集客・問い合わせ獲得') score += 1;
  if (data.purpose === 'ブランディング') score += 1;

  if (score >= 6) {
    return {
      id: 'premium',
      name: 'Premium',
      setup: '¥220,000',
      monthly: '¥33,000/月',
      reason: 'ページ数や集客ニーズから、Premiumプランが最適です。AI更新月30回でサイトを常に最新に保ち、ブログやチャットボットのオプションで集客を最大化できます。'
    };
  } else if (score >= 2) {
    return {
      id: 'standard',
      name: 'Standard',
      setup: '¥110,000',
      monthly: '¥11,000/月',
      reason: 'バランスの取れたStandardプランがおすすめです。AI更新月10回で定期的なサイト更新に対応。独自ドメイン・SSL・SEO対策もすべて含まれています。'
    };
  } else {
    return {
      id: 'light',
      name: 'Light',
      setup: '¥55,000',
      monthly: '¥5,500/月',
      reason: 'まずはLightプランでスタートがおすすめです。AI管理画面「バイブ」で音声から簡単にサイト更新。独自ドメイン・SSL・メール転送も付いています。'
    };
  }
}

// 結果表示
function showResult(plan) {
  const resultEl = document.getElementById('diagResult');
  resultEl.innerHTML = `
    <div class="diag__result-plan">
      <span class="diag__result-plan-badge">おすすめ</span>
      <span class="diag__result-plan-name">${plan.name}プラン</span>
      <span class="diag__result-plan-price">制作費 ${plan.setup}　月額 ${plan.monthly}</span>
    </div>
    <div class="diag__result-items">
      <div class="diag__result-item">
        <span class="diag__result-item-label">業種</span>
        <span class="diag__result-item-value">${answers.industry || '-'}</span>
      </div>
      <div class="diag__result-item">
        <span class="diag__result-item-label">目的</span>
        <span class="diag__result-item-value">${answers.purpose || '-'}</span>
      </div>
      <div class="diag__result-item">
        <span class="diag__result-item-label">ページ数</span>
        <span class="diag__result-item-value">${answers.pages || '-'}</span>
      </div>
      <div class="diag__result-item">
        <span class="diag__result-item-label">デザイン</span>
        <span class="diag__result-item-value">${answers.design || '-'}</span>
      </div>
    </div>
    <p style="margin-top:var(--space-lg);font-size:var(--font-size-sm);color:var(--c-text-muted);line-height:1.7;">${plan.reason}</p>
    <p style="font-size:var(--font-size-xs);color:var(--c-text-muted);margin-top:var(--space-xs);">全プラン共通: 独自ドメイン・SSL・レスポンシブ対応・メール転送1アドレス付き</p>
    <div class="diag__result-actions">
      <a href="../apply/?plan=${plan.id}" class="btn btn--cta btn--lg btn--block">
        <span>このプランで申し込む</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <a href="../apply/" class="btn btn--ghost" style="margin-top:var(--space-sm);">別のプランを選ぶ</a>
    </div>
  `;
}

// 初期表示
showStep(0);
