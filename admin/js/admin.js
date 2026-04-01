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

  /* TTS トグル */
  const ttsToggle = document.getElementById('ttsToggle');
  let ttsEnabled = true;

  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsToggle.classList.toggle('active', ttsEnabled);
  });

  /* 状態 */
  let isRecording = false;
  let isProcessing = false;
  let currentDiff = null;

  /* Vibe 初期化 */
  Vibe.init(vibeContainer, speechBubble, speechText);

  /* ─── スクロール連動: Vibe → ミニVibe ─── */
  const vibeArea = document.querySelector('.agent__vibe-area');
  const miniVibe = document.getElementById('miniVibe');
  const miniVibeAvatar = document.getElementById('miniVibeAvatar');
  const miniVibeSpeech = document.getElementById('miniVibeSpeech');
  let vibeCollapsed = false;

  // ミニVibeにSVGアバターをコピー
  miniVibeAvatar.innerHTML = `
    <svg viewBox="0 0 160 160" width="32" height="32">
      <defs><linearGradient id="mvg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#055DA6"/><stop offset="50%" stop-color="#077BDC"/><stop offset="100%" stop-color="#4DA3E8"/>
      </linearGradient></defs>
      <circle cx="80" cy="85" r="44" fill="url(#mvg)"/>
      <circle cx="64" cy="80" r="6" fill="white"/><circle cx="64" cy="79.5" r="3.5" fill="#102A43"/>
      <circle cx="96" cy="80" r="6" fill="white"/><circle cx="96" cy="79.5" r="3.5" fill="#102A43"/>
      <path d="M72 98 Q80 106 88 98" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

  chatArea.addEventListener('scroll', () => {
    const shouldCollapse = chatArea.scrollTop > 80;
    if (shouldCollapse !== vibeCollapsed) {
      vibeCollapsed = shouldCollapse;
      vibeArea.classList.toggle('collapsed', shouldCollapse);
      miniVibe.classList.toggle('visible', shouldCollapse);
      if (shouldCollapse) {
        miniVibeSpeech.textContent = speechText.textContent;
      }
    }
  }, { passive: true });

  // セリフ変更時にミニVibeも同期
  const origSay = Vibe.say;
  Vibe.say = function(text) {
    origSay.call(Vibe, text);
    if (vibeCollapsed) miniVibeSpeech.textContent = text;
  };

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

  /* rawDiff をシンタックスハイライト */
  function buildRawDiffHtml(rawDiff) {
    return rawDiff.split('\n').map(line => {
      const escaped = escapeHtml(line);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return `<span class="diff-add">${escaped}</span>`;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return `<span class="diff-del">${escaped}</span>`;
      } else if (line.startsWith('@@')) {
        return `<span class="diff-file">${escaped}</span>`;
      } else if (line.startsWith('diff ')) {
        return `<span class="diff-file">${escaped}</span>`;
      }
      return `<span class="diff-context">${escaped}</span>`;
    }).join('');
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

    // diff タブにフル差分を表示（rawDiff があればそちらを優先）
    previewDiff.innerHTML = diff.rawDiff ? buildRawDiffHtml(diff.rawDiff) : buildFullDiffHtml(diff);

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
  previewApprove.addEventListener('click', async () => {
    closePreview();
    Vibe.setState('done');
    Vibe.say('承認されたっす！デプロイ開始しますよ〜！');
    addMessage('status', 'デプロイ中...');

    try {
      if (currentDiff?._jobId) {
        await approveJob(currentDiff._jobId);
      }
      const statusMsg = addMessage('status', '');
      statusMsg.querySelector('.chat-msg__status-dot').style.background = 'var(--c-accent-green)';
      statusMsg.querySelector('.chat-msg__status-dot').style.animation = 'none';
      statusMsg.querySelector('span:last-child').textContent = 'デプロイ完了！サイトに反映されました';
      statusMsg.classList.add('chat-msg__status--done');
      Vibe.setState('done');
      addMessage('vibe', 'デプロイ完了っす！サイトを確認してみてください〜！');
      if (ttsEnabled) Audio.speak('デプロイ完了っす！').catch(() => {});
    } catch (err) {
      Vibe.setState('error');
      addMessage('vibe', 'デプロイでエラーが出ちゃいました...');
    }
  });

  // 却下ボタン
  previewReject.addEventListener('click', async () => {
    closePreview();
    Vibe.setState('error');

    try {
      if (currentDiff?._jobId) {
        await rejectJob(currentDiff._jobId);
      }
    } catch { /* 無視 */ }

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

  /* ─── 波形連動アニメーション ─── */
  let waveformAnimId = null;

  function startWaveformAnimation() {
    const container = document.getElementById('vibeContainer');
    function tick() {
      const vol = Audio.getVolume();
      // マイクボタンのスケールを音量に連動
      const scale = 1 + vol * 0.15;
      micBtn.style.transform = `scale(${scale})`;
      // Vibe の体をわずかに膨張
      if (container) container.style.transform = `translateY(-4px) scale(${1 + vol * 0.08})`;
      waveformAnimId = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopWaveformAnimation() {
    if (waveformAnimId) cancelAnimationFrame(waveformAnimId);
    waveformAnimId = null;
    micBtn.style.transform = '';
    const container = document.getElementById('vibeContainer');
    if (container) container.style.transform = '';
  }

  /* ─── エージェントAPI呼び出し ─── */
  async function callAgent(message) {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return res.json();
  }

  async function pollJobStatus(jobId) {
    for (let i = 0; i < 60; i++) { // 最大3分
      await delay(3000);
      const res = await fetch(`/api/agent?jobId=${jobId}`);
      const data = await res.json();
      if (data.status === 'done' || data.status === 'error') return data;
    }
    return { status: 'error', error: 'タイムアウト' };
  }

  async function approveJob(jobId) {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', jobId }),
    });
    return res.json();
  }

  async function rejectJob(jobId) {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', jobId }),
    });
    return res.json();
  }

  /* ─── 処理フロー ─── */
  async function processRequest(text, isVoice = false) {
    if (isProcessing) return;
    isProcessing = true;

    // 1. ユーザーメッセージ表示
    addMessage('user', text, { isVoice });

    // 2. Vibe が考え中
    await delay(300);
    Vibe.setState('thinking');
    addMessage('status', 'バイブが考え中...');

    try {
      // 3. エージェントAPI にジョブ投入
      const submitResult = await callAgent(text);

      if (submitResult.error) {
        // API未接続時はモックにフォールバック
        if (submitResult.error.includes('ジョブランナー') || submitResult.error.includes('接続できません')) {
          await processRequestMock(text, isVoice);
          return;
        }
        throw new Error(submitResult.error);
      }

      // 4. 作業中
      Vibe.setState('working');
      const statusMsg = addMessage('status', 'バイブが対応中...');

      // 5. ポーリングで完了を待つ
      const jobResult = await pollJobStatus(submitResult.id);

      if (jobResult.status === 'error') {
        throw new Error(jobResult.error || '不明なエラー');
      }

      // 6. 完了！
      statusMsg.querySelector('.chat-msg__status-dot').style.background = 'var(--c-accent-green)';
      statusMsg.querySelector('.chat-msg__status-dot').style.animation = 'none';
      statusMsg.querySelector('span:last-child').textContent = '変更完了！';
      statusMsg.classList.add('chat-msg__status--done');

      // git diff をパースして表示
      const diff = parseDiff(jobResult.diff);
      currentDiff = diff;
      currentDiff._jobId = submitResult.id;
      Vibe.setState('done');

      const vibeReply = jobResult.result || 'できましたよ〜！';
      addMessage('vibe', vibeReply, { diff });

      if (ttsEnabled) Audio.speak('できましたよ〜！確認してくださいっす！').catch(() => {});

    } catch (err) {
      console.error('処理エラー:', err);
      Vibe.setState('error');
      addMessage('vibe', `エラーが出ちゃいました...「${err.message}」`);
      if (ttsEnabled) Audio.speak('すみません、エラーが出ちゃいました').catch(() => {});
      setTimeout(() => Vibe.setState('idle'), 2000);
    }

    isProcessing = false;
  }

  /* git diff テキストをパース */
  function parseDiff(diffText) {
    if (!diffText || diffText === '（変更なし）') {
      return { file: '（変更なし）', add: [], del: [], context: [], rawDiff: diffText };
    }

    const lines = diffText.split('\n');
    const add = [];
    const del = [];
    const context = [];
    let file = '';

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) file = match[1];
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        add.push(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        del.push(line);
      } else if (line.startsWith(' ')) {
        context.push(line);
      }
    }

    return {
      file: file || 'index.html',
      add: add.slice(0, 20),
      del: del.slice(0, 20),
      context: context.slice(0, 5),
      rawDiff: diffText,
      previewUrl: '../',
    };
  }

  /* モックフォールバック（ジョブランナー未接続時） */
  async function processRequestMock(text) {
    Vibe.setState('working');
    const statusMsg = addMessage('status', 'バイブが対応中...（デモモード）');

    await delay(2500);
    statusMsg.querySelector('.chat-msg__status-dot').style.background = 'var(--c-accent-green)';
    statusMsg.querySelector('.chat-msg__status-dot').style.animation = 'none';
    statusMsg.querySelector('span:last-child').textContent = '変更完了！（デモ）';
    statusMsg.classList.add('chat-msg__status--done');

    const diff = mockDiffs[text] || mockDiffs.default;
    currentDiff = diff;
    Vibe.setState('done');

    const vibeReply = 'できましたよ〜！こんな感じに変更しました：（デモモード）';
    addMessage('vibe', vibeReply, { diff });

    if (ttsEnabled) Audio.speak(vibeReply).catch(() => {});
    isProcessing = false;
  }

  /* ─── マイクボタン ─── */
  micBtn.addEventListener('click', async () => {
    if (isProcessing) return;

    if (!isRecording) {
      // 録音開始
      try {
        await Audio.startRecording();
        isRecording = true;
        micBtn.classList.add('recording');
        micHint.textContent = 'もう一度タップで停止';
        Vibe.setState('listening');
        startWaveformAnimation();
      } catch (err) {
        console.error('マイク取得エラー:', err);
        Vibe.say('マイクが使えないっす...テキストで入力してください！');
        addMessage('vibe', 'マイクの許可が必要です。ブラウザの設定を確認してください。');
      }
    } else {
      // 録音停止 → 文字起こし → 処理
      isRecording = false;
      micBtn.classList.remove('recording');
      micHint.textContent = '文字起こし中...';
      stopWaveformAnimation();
      Vibe.setState('thinking');
      Vibe.say('ふむふむ、聞き取り中っす...');

      try {
        const audioBlob = await Audio.stopRecording();
        if (!audioBlob || audioBlob.size < 1000) {
          // 音声が短すぎる
          micHint.textContent = 'タップして話しかける';
          Vibe.setState('idle');
          Vibe.say('あれ、聞こえなかったっす。もう一度どうぞ！');
          return;
        }

        const text = await Audio.transcribe(audioBlob);
        micHint.textContent = 'タップして話しかける';

        if (!text.trim()) {
          Vibe.setState('idle');
          Vibe.say('うーん、聞き取れなかったっす。もう一度お願いします！');
          return;
        }

        await processRequest(text, true);
      } catch (err) {
        console.error('文字起こしエラー:', err);
        micHint.textContent = 'タップして話しかける';
        Vibe.setState('error');
        addMessage('vibe', '文字起こしでエラーが出ちゃいました...テキストで入力してもらえますか？');
        setTimeout(() => Vibe.setState('idle'), 2000);
      }
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

  /* ─── 変更履歴 ─── */
  const historyBtn = document.getElementById('historyBtn');
  const historyOverlay = document.getElementById('historyOverlay');
  const historyClose = document.getElementById('historyClose');
  const historyList = document.getElementById('historyList');

  historyBtn.addEventListener('click', async () => {
    historyOverlay.classList.add('active');
    await loadHistory();
  });

  historyClose.addEventListener('click', () => {
    historyOverlay.classList.remove('active');
  });

  historyOverlay.addEventListener('click', (e) => {
    if (e.target === historyOverlay) historyOverlay.classList.remove('active');
  });

  async function loadHistory() {
    historyList.innerHTML = '<p class="history-panel__empty">読み込み中...</p>';

    try {
      const res = await fetch('/api/agent?action=history');
      const data = await res.json();

      if (!data.history || data.history.length === 0) {
        historyList.innerHTML = '<p class="history-panel__empty">まだ変更履歴がありません</p>';
        return;
      }

      historyList.innerHTML = data.history.map(entry => `
        <div class="history-item">
          <div class="history-item__header">
            <span class="history-item__message">${escapeHtml(entry.message)}</span>
            <span class="history-item__hash">${entry.commitHash}</span>
          </div>
          <div class="history-item__time">${formatTime(entry.approvedAt)}</div>
          <button class="history-item__rollback" data-hash="${entry.commitHash}">この変更を取り消す</button>
        </div>
      `).join('');

    } catch {
      historyList.innerHTML = '<p class="history-panel__empty">履歴を取得できません（ジョブランナー未接続）</p>';
    }
  }

  // ロールバック
  historyList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.history-item__rollback');
    if (!btn) return;

    const hash = btn.dataset.hash;
    if (!confirm(`コミット ${hash} の変更を取り消しますか？`)) return;

    btn.textContent = '取り消し中...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rollback', hash }),
      });
      const data = await res.json();

      if (data.success) {
        Vibe.setState('done');
        addMessage('vibe', `ロールバック完了っす！${hash} の変更を取り消しました。`);
        historyOverlay.classList.remove('active');
      } else {
        throw new Error(data.error || 'ロールバック失敗');
      }
    } catch (err) {
      btn.textContent = 'この変更を取り消す';
      btn.disabled = false;
      Vibe.setState('error');
      addMessage('vibe', `ロールバックでエラーが出ちゃいました...「${err.message}」`);
    }
  });

  function formatTime(ts) {
    const d = new Date(ts);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
  }

  /* ─── ユーティリティ ─── */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ─── 初期表示 ─── */
  setTimeout(() => {
    addMessage('vibe', 'こんにちは！バイブっす。話しかけるか、テキストで入力してくださいっす！');
  }, 800);
});
