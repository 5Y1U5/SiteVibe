// ============================================
// SiteVibe — ディレクションシートスクリプト
// ============================================

const Direction = (() => {
  const TOTAL_STEPS = 7;
  let currentStep = 0;
  const data = {};
  const uploadedFiles = [];

  // ステップ表示
  function showStep(step) {
    document.querySelectorAll('.dir__step').forEach(el => {
      el.classList.remove('active');
      el.style.animation = 'none';
    });

    const target = document.querySelector(`[data-step="${step}"]`);
    if (target) {
      target.classList.add('active');
      target.offsetHeight;
      target.style.animation = '';
    }

    // プログレスバー
    const progress = step === 0 ? 0 : Math.min((step / TOTAL_STEPS) * 100, 100);
    document.getElementById('progressBar').style.width = progress + '%';

    // ステップインジケーター
    document.querySelectorAll('.dir__indicator').forEach(ind => {
      const indStep = parseInt(ind.dataset.ind);
      ind.classList.remove('active', 'done');
      if (indStep === step) ind.classList.add('active');
      if (indStep < step) ind.classList.add('done');
    });

    // インジケーター表示制御（イントロと完了では非表示）
    const indicators = document.getElementById('stepIndicators');
    indicators.style.display = (step > 0 && step <= TOTAL_STEPS) ? 'flex' : 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    currentStep = step;

    // Step 7（確認画面）でサマリー生成
    if (step === 7) buildSummary();
  }

  function nextStep() {
    if (currentStep < TOTAL_STEPS + 1) {
      showStep(currentStep + 1);
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      showStep(currentStep - 1);
    }
  }

  // デザインカード選択
  function initDesignCards() {
    document.querySelectorAll('.dir__design-cards').forEach(group => {
      group.querySelectorAll('.dir__design-card').forEach(card => {
        card.addEventListener('click', () => {
          group.querySelectorAll('.dir__design-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          data[group.dataset.name] = card.dataset.value;
        });
      });
    });
  }

  // カラーチップ選択
  function initColorChips() {
    document.querySelectorAll('.dir__color-options').forEach(group => {
      group.querySelectorAll('.dir__color-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          group.querySelectorAll('.dir__color-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          data[group.dataset.name] = chip.dataset.value;
        });
      });
    });
  }

  // ファイルアップロード
  function initUpload() {
    const area = document.getElementById('uploadArea');
    const input = document.getElementById('fileInput');
    if (!area || !input) return;

    area.addEventListener('click', () => input.click());

    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.classList.add('dir__upload-area--drag');
    });

    area.addEventListener('dragleave', () => {
      area.classList.remove('dir__upload-area--drag');
    });

    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('dir__upload-area--drag');
      handleFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', () => {
      handleFiles(input.files);
      input.value = '';
    });
  }

  function handleFiles(files) {
    const list = document.getElementById('uploadList');
    Array.from(files).forEach(file => {
      uploadedFiles.push(file);
      const item = document.createElement('div');
      item.className = 'dir__upload-item';
      item.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="dir__upload-item-name">${file.name}</span>
        <span class="dir__upload-item-size">${formatFileSize(file.size)}</span>
        <button class="dir__upload-item-remove" onclick="Direction.removeFile(this, ${uploadedFiles.length - 1})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      `;
      list.appendChild(item);
    });
  }

  function removeFile(btn, index) {
    uploadedFiles[index] = null;
    btn.closest('.dir__upload-item').remove();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // FAQ 追加・削除
  function addFaq() {
    const list = document.getElementById('faqList');
    const count = list.querySelectorAll('.dir__faq-item').length + 1;
    const item = document.createElement('div');
    item.className = 'dir__faq-item';
    item.innerHTML = `
      <div class="dir__faq-item-header">
        <span class="dir__faq-item-num">FAQ ${count}</span>
        <button class="dir__faq-remove" onclick="Direction.removeFaq(this)" title="削除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="dir__field">
        <label>よくある質問</label>
        <input type="text" name="faq_q" placeholder="例: 予約は必要ですか？">
      </div>
      <div class="dir__field">
        <label>回答</label>
        <textarea name="faq_a" rows="2" placeholder="回答を入力してください"></textarea>
      </div>
    `;
    list.appendChild(item);
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    renumberFaqs();
  }

  function removeFaq(btn) {
    btn.closest('.dir__faq-item').remove();
    renumberFaqs();
  }

  function renumberFaqs() {
    document.querySelectorAll('.dir__faq-item').forEach((item, i) => {
      item.querySelector('.dir__faq-item-num').textContent = `FAQ ${i + 1}`;
      // 最初の1件は削除ボタンを非表示
      const removeBtn = item.querySelector('.dir__faq-remove');
      if (removeBtn) removeBtn.style.display = i === 0 ? 'none' : '';
    });
  }

  // サマリー生成
  function buildSummary() {
    const el = document.getElementById('dirSummary');
    const items = [];

    const val = (id) => document.getElementById(id)?.value?.trim() || '';

    if (val('businessName')) items.push(['店舗名', val('businessName')]);
    if (val('businessType')) items.push(['業種', val('businessType')]);
    if (data.designTaste) items.push(['デザイン', data.designTaste]);
    if (data.mainColor) items.push(['カラー', data.mainColor === 'おまかせ' ? 'おまかせ' : data.mainColor]);

    // 選択されたページ数
    const pages = document.querySelectorAll('.dir__checklist input[type="checkbox"]:checked');
    items.push(['ページ数', pages.length + 'ページ']);

    // FAQ数
    const faqs = document.querySelectorAll('.dir__faq-item');
    const filledFaqs = Array.from(faqs).filter(f => f.querySelector('input[name="faq_q"]')?.value?.trim());
    items.push(['FAQ登録数', filledFaqs.length + '件']);

    // アップロードファイル数
    const fileCount = uploadedFiles.filter(f => f !== null).length;
    if (fileCount > 0) items.push(['アップロード', fileCount + 'ファイル']);

    el.innerHTML = `
      <h3 class="dir__summary-title">入力内容の確認</h3>
      <div class="dir__summary-grid">
        ${items.map(([label, value]) => `
          <div class="dir__summary-item">
            <span class="dir__summary-label">${label}</span>
            <span class="dir__summary-value">${value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 送信
  function submit() {
    // フォームデータ収集
    const fields = ['businessName', 'businessType', 'address', 'phone', 'email',
      'hours', 'holidays', 'mainServices', 'strengths', 'target', 'competitors',
      'refSites', 'otherPages', 'instagram', 'line', 'googleMap', 'hotpepper', 'otherRequests'];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value.trim();
    });

    // ページ構成
    const pages = [];
    document.querySelectorAll('.dir__checklist input[type="checkbox"]:checked').forEach(cb => {
      pages.push(cb.value);
    });
    data.pages = pages;

    // FAQ
    const faqs = [];
    document.querySelectorAll('.dir__faq-item').forEach(item => {
      const q = item.querySelector('input[name="faq_q"]')?.value?.trim();
      const a = item.querySelector('textarea[name="faq_a"]')?.value?.trim();
      if (q) faqs.push({ question: q, answer: a || '' });
    });
    data.faqs = faqs;

    // ファイル情報
    data.files = uploadedFiles.filter(f => f !== null).map(f => f.name);

    // 送信ボタンを無効化
    const submitBtn = document.querySelector('[onclick="Direction.submit()"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = '送信中...';
    }

    // APIに送信
    fetch('/api/direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(res => {
        if (!res.ok) throw new Error('送信エラー');
        return res.json();
      })
      .then(() => {
        document.getElementById('progressBar').style.width = '100%';
        showStep(8);
      })
      .catch(err => {
        console.error('送信失敗:', err);
        // エラーでも完了画面へ（データはコンソールに残る）
        console.log('ディレクションシートデータ:', data);
        document.getElementById('progressBar').style.width = '100%';
        showStep(8);
      })
      .finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('span').textContent = 'この内容で送信する';
        }
      });
  }

  // 初期化
  function init() {
    showStep(0);
    initDesignCards();
    initColorChips();
    initUpload();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { nextStep, prevStep, addFaq, removeFaq, removeFile, submit };
})();
