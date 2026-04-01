/* ============================================
   SiteVibe Agent Console — メインスクリプト
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  /* DOM参照 */
  const vibeContainer = document.getElementById('vibeContainer');
  const speechBubble = document.getElementById('speechBubble');
  const speechText = document.getElementById('speechText');
  const micBtn = document.getElementById('micBtn');
  const micHint = document.getElementById('micHint');
  const chatMessages = document.getElementById('chatMessages');
  const chatArea = document.getElementById('chatArea');
  const inputForm = document.getElementById('inputForm');
  const textInput = document.getElementById('textInput');

  /* プレビューパネル DOM */
  const previewOverlay = document.getElementById('previewOverlay');
  const previewClose = document.getElementById('previewClose');
  const previewIframe = document.getElementById('previewIframe');
  const previewIframeWrap = document.getElementById('previewIframeWrap');
  const previewDiff = document.getElementById('previewDiff');
  const previewApprove = document.getElementById('previewApprove');
  const previewReject = document.getElementById('previewReject');

  /* 状態 */
  let isRecording = false;
  let isProcessing = false;
  let currentDiff = null;

  /* Vibe 初期化 */
  Vibe.init(vibeContainer, speechBubble, speechText);

  /* モックの依頼テキスト */
  const mockRequests = [
    'お客様の声セクションを追加して',
    'ヘッダーの色を緑に変えて',
    'FAQに新しい質問を追加して',
    'フッターにSNSリンクを入れて',
    'トップページの画像を差し替えて',
  ];

  /* モックの diff + プレビューURL */
  const mockDiffs = {
    'お客様の声セクションを追加して': {
      file: 'index.html',
      add: [
        '+ <section class="testimonials">',
        '+   <h2>お客様の声</h2>',
        '+   <div class="testimonial-card">',
        '+     <p>「対応が早くて助かりました！」</p>',
        '+     <span>— 田中様（飲食業）</span>',
        '+   </div>',
        '+ </section>',
      ],
      del: [],
      context: ['  </main>', '', '  <footer>'],
      previewUrl: '../',
      description: 'お客様の声セクションをメインコンテンツ末尾に追加',
    },
    'ヘッダーの色を緑に変えて': {
      file: 'css/style.css',
      add: ['+ --c-primary: #059669;'],
      del: ['- --c-primary: #077BDC;'],
      context: [':root {', '  /* アクセントカラー */'],
      previewUrl: '../',
      description: 'プライマリカラーを緑(#059669)に変更',
    },
    default: {
      file: 'index.html',
      add: ['+ <!-- 変更が追加されました -->'],
      del: ['- <!-- 古いコード -->'],
      context: [],
      previewUrl: '../',
      description: 'リクエストに基づいてコードを変更',
    },
  };

  /* ─── チャットメッセージ追加 ─── */
  function addMessage(type, content, options = {}) {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg--${type}`;

    if (type === 'vibe') {
      const previewBtnHtml = options.diff
        ? `<button class="chat-msg__preview-btn" data-action="open-preview">
             <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
             プレビューを見る
           </button>`
        : '';

      msg.innerHTML = `
        <div class="chat-msg__avatar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="9" cy="10" r="1.5" fill="white"/>
            <circle cx="15" cy="10" r="1.5" fill="white"/>
            <path d="M8 14 Q12 18 16 14" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div class="chat-msg__bubble">${content}</div>
          ${options.diff ? buildDiffHtml(options.diff) : ''}
          ${previewBtnHtml}
        </div>
      `;
    } else if (type === 'user') {
      msg.innerHTML = `
        <div class="chat-msg__bubble">${content}</div>
        ${options.isVoice ? '<div class="chat-msg__voice-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg> 音声入力</div>' : ''}
      `;
    } else if (type === 'status') {
      msg.className = 'chat-msg__status';
      msg.innerHTML = `
        <span class="chat-msg__status-dot"></span>
        <span>${content}</span>
      `;
      if (options.done) {
        msg.classList.add('chat-msg__status--done');
      }
    }

    chatMessages.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
    return msg;
  }

  /* diff HTML（チャット内、コンパクト版） */
  function buildDiffHtml(diff) {
    const lines = [];
    lines.push(`<span style="color:var(--admin-text-dim)">--- ${diff.file}</span>`);
    diff.del.forEach(l => lines.push(`<span class="chat-msg__diff-del">${escapeHtml(l)}</span>`));
    diff.add.forEach(l => lines.push(`<span class="chat-msg__diff-add">${escapeHtml(l)}</span>`));
    return `<div class="chat-msg__diff">${lines.join('\n')}</div>`;
  }

  /* diff HTML（プレビューパネル、フル版） */
  function buildFullDiffHtml(diff) {
    let html = `<span class="diff-file">--- a/${diff.file}\n+++ b/${diff.file}</span>\n`;
    if (diff.context) {
      diff.context.forEach(l => {
        html += `<span class="diff-context">  ${escapeHtml(l)}</span>`;
      });
    }
    diff.del.forEach(l => {
      html += `<span class="diff-del">${escapeHtml(l)}</span>`;
    });
    diff.add.forEach(l => {
      html += `<span class="diff-add">${escapeHtml(l)}</span>`;
    });
    if (diff.description) {
      html += `\n<span class="diff-file">// ${diff.description}</span>`;
    }
    return html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ─── プレビューパネル ─── */
  function openPreview(diff) {
    currentDiff = diff;

    // iframe にプレビューURLをロード
    if (diff.previewUrl) {
      previewIframe.src = diff.previewUrl;
    }

    // diff タブにフル差分を表示
    previewDiff.innerHTML = buildFullDiffHtml(diff);

    // パネルを開く
    previewOverlay.classList.add('active');
  }

  function closePreview() {
    previewOverlay.classList.remove('active');
    setTimeout(() => {
      previewIframe.src = 'about:blank';
      currentDiff = null;
    }, 300);
  }

  // 閉じるボタン
  previewClose.addEventListener('click', closePreview);

  // オーバーレイクリックで閉じる
  previewOverlay.addEventListener('click', (e) => {
    if (e.target === previewOverlay) closePreview();
  });

  // ESC で閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewOverlay.classList.contains('active')) {
      closePreview();
    }
  });

  // タブ切り替え
  document.querySelectorAll('.preview-panel__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.preview-panel__tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.preview-panel__content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.preview-panel__content[data-content="${target}"]`).classList.add('active');
    });
  });

  // デバイス切り替え（デスクトップ / モバイル）
  document.querySelectorAll('.preview-panel__device').forEach(btn => {
    btn.addEventListener('click', () => {
      const device = btn.dataset.device;
      document.querySelectorAll('.preview-panel__device').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      previewIframeWrap.setAttribute('data-device', device);
    });
  });

  // 承認ボタン
  previewApprove.addEventListener('click', () => {
    closePreview();
    Vibe.setState('done');
    Vibe.say('承認されたっす！デプロイ開始しますよ〜！');
    addMessage('status', 'デプロイ中...', {});

    setTimeout(() => {
      const statusMsg = addMessage('status', '', {});
      statusMsg.querySelector('.chat-msg__status-dot').style.background = 'var(--c-accent-green)';
      statusMsg.querySelector('.chat-msg__status-dot').style.animation = 'none';
      statusMsg.querySelector('span:last-child').textContent = 'デプロイ完了！サイトに反映されました';
      statusMsg.classList.add('chat-msg__status--done');
      Vibe.setState('done');
      addMessage('vibe', 'デプロイ完了っす！サイトを確認してみてください〜！');
    }, 2000);
  });

  // 却下ボタン
  previewReject.addEventListener('click', () => {
    closePreview();
    Vibe.setState('error');
    setTimeout(() => {
      Vibe.setState('idle');
      addMessage('vibe', '了解っす！変更を取り消しました。別の依頼があればどうぞ〜');
    }, 500);
  });

  // チャット内「プレビューを見る」ボタン（イベント委譲）
  chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="open-preview"]');
    if (!btn) return;
    const diff = currentDiff || mockDiffs[Object.keys(mockDiffs).find(k => k !== 'default')] || mockDiffs.default;
    openPreview(diff);
  });

  /* ─── モック処理フロー ─── */
  async function processRequest(text, isVoice = false) {
    if (isProcessing) return;
    isProcessing = true;

    // 1. ユーザーメッセージ表示
    addMessage('user', text, { isVoice });

    // 2. Vibe が考え中
    await delay(500);
    Vibe.setState('thinking');
    addMessage('status', 'バイブが内容を確認中...');

    // 3. 作業開始
    await delay(1500);
    Vibe.setState('working');
    const statusMsg = addMessage('status', 'コードを変更中...');

    // 4. 作業完了
    await delay(2500);
    statusMsg.querySelector('.chat-msg__status-dot').style.background = 'var(--c-accent-green)';
    statusMsg.querySelector('.chat-msg__status-dot').style.animation = 'none';
    statusMsg.querySelector('span:last-child').textContent = '変更完了！';
    statusMsg.classList.add('chat-msg__status--done');

    // 5. 結果表示 + プレビューボタン付き
    const diff = mockDiffs[text] || mockDiffs.default;
    currentDiff = diff;
    Vibe.setState('done');
    addMessage('vibe', 'できましたよ〜！こんな感じに変更しました：', { diff });

    isProcessing = false;
  }

  /* ─── マイクボタン ─── */
  micBtn.addEventListener('click', async () => {
    if (isProcessing) return;

    if (!isRecording) {
      isRecording = true;
      micBtn.classList.add('recording');
      micHint.textContent = 'もう一度タップで停止';
      Vibe.setState('listening');
    } else {
      isRecording = false;
      micBtn.classList.remove('recording');
      micHint.textContent = 'タップして話しかける';

      const request = mockRequests[Math.floor(Math.random() * mockRequests.length)];
      await processRequest(request, true);
    }
  });

  /* ─── テキスト入力 ─── */
  inputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text || isProcessing) return;

    textInput.value = '';
    await processRequest(text, false);
  });

  /* ─── ユーティリティ ─── */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ─── 初期表示 ─── */
  setTimeout(() => {
    addMessage('vibe', 'こんにちは！バイブっす。話しかけるか、テキストで入力してくださいっす！');
  }, 800);
});
