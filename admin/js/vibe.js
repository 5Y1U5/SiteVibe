/* ============================================
   Vibe — SiteVibe AIエージェントキャラクター
   ============================================ */

const Vibe = (() => {
  let currentState = 'idle';
  let container = null;
  let speechBubble = null;
  let speechText = null;

  /* セリフバリエーション */
  const speeches = {
    idle: [
      'なんか用っすか〜？',
      'ここにいますよ〜',
      'いつでもどーぞ！',
      '話しかけてくださいっす！',
    ],
    listening: [
      'ふむふむ...',
      'おっ、なんすか？',
      '聞いてますよ〜',
      'はいはい、それで？',
    ],
    thinking: [
      'えーっと...',
      'ちょっと考え中っす...',
      'なるほどなるほど...',
    ],
    working: [
      'うりゃ！やってますよ〜',
      'おまかせっす！',
      'ガリガリ書いてます...',
      'もうちょっとっすね！',
      'コード、書きますよ〜！',
    ],
    done: [
      'できましたよ〜！見てください！',
      'どやっ！完了っす！',
      'ばっちりっすよ！',
      'お待たせしました〜！',
    ],
    error: [
      'ぐはっ...ごめんなさい！',
      'やっちゃいました...直しますね！',
      'あれ、ちょっとミスったっす...',
    ],
  };

  /* 表情定義（SVGパーツのクラス切り替え） */
  const faces = {
    idle:      { leftEye: 'open',  rightEye: 'open',  mouth: 'smile',  antenna: 'slow' },
    listening: { leftEye: 'wide',  rightEye: 'wide',  mouth: 'open',   antenna: 'fast' },
    thinking:  { leftEye: 'look',  rightEye: 'look',  mouth: 'flat',   antenna: 'slow' },
    working:   { leftEye: 'focus', rightEye: 'focus',  mouth: 'grin',   antenna: 'fast' },
    done:      { leftEye: 'star',  rightEye: 'star',  mouth: 'big',    antenna: 'burst' },
    error:     { leftEye: 'x',     rightEye: 'x',     mouth: 'wavy',   antenna: 'droop' },
  };

  /* SVG 生成 */
  function createSVG() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 160 160');
    svg.setAttribute('class', 'vibe-svg');
    svg.innerHTML = `
      <defs>
        <linearGradient id="vibeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#055DA6"/>
          <stop offset="50%" stop-color="#077BDC"/>
          <stop offset="100%" stop-color="#4DA3E8"/>
        </linearGradient>
        <filter id="vibeGlow">
          <feGaussianBlur stdDeviation="4" result="glow"/>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="vibeShadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(7,123,220,0.3)"/>
        </filter>
      </defs>

      <!-- グロー背景 -->
      <circle cx="80" cy="85" r="52" fill="url(#vibeGrad)" opacity="0.15" class="vibe-glow-bg"/>

      <!-- 本体 -->
      <circle cx="80" cy="85" r="44" fill="url(#vibeGrad)" filter="url(#vibeShadow)" class="vibe-body"/>

      <!-- ハイライト -->
      <ellipse cx="68" cy="72" rx="16" ry="10" fill="rgba(255,255,255,0.15)" transform="rotate(-15 68 72)"/>

      <!-- 触角（左） -->
      <g class="vibe-antenna vibe-antenna--left">
        <path d="M62 45 Q55 25 48 18" stroke="#4DA3E8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <circle cx="48" cy="18" r="4" fill="#4DA3E8" class="vibe-antenna-tip"/>
      </g>

      <!-- 触角（右） -->
      <g class="vibe-antenna vibe-antenna--right">
        <path d="M98 45 Q105 25 112 18" stroke="#4DA3E8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <circle cx="112" cy="18" r="4" fill="#4DA3E8" class="vibe-antenna-tip"/>
      </g>

      <!-- 左目 -->
      <g class="vibe-eye vibe-eye--left" transform="translate(64, 80)">
        <!-- open -->
        <circle r="6" fill="white" class="vibe-eye__base"/>
        <circle r="3.5" fill="#102A43" cy="-0.5" class="vibe-eye__pupil"/>
        <circle r="1.5" fill="white" cx="-1.5" cy="-2" class="vibe-eye__highlight"/>
      </g>

      <!-- 右目 -->
      <g class="vibe-eye vibe-eye--right" transform="translate(96, 80)">
        <circle r="6" fill="white" class="vibe-eye__base"/>
        <circle r="3.5" fill="#102A43" cy="-0.5" class="vibe-eye__pupil"/>
        <circle r="1.5" fill="white" cx="-1.5" cy="-2" class="vibe-eye__highlight"/>
      </g>

      <!-- 口 -->
      <g class="vibe-mouth" transform="translate(80, 98)">
        <path d="M-8 0 Q0 8 8 0" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" class="vibe-mouth__path"/>
      </g>

      <!-- キラキラ（完了時） -->
      <g class="vibe-sparkles" opacity="0">
        <text x="30" y="50" font-size="14" class="vibe-sparkle">✦</text>
        <text x="125" y="45" font-size="10" class="vibe-sparkle">✦</text>
        <text x="40" y="120" font-size="12" class="vibe-sparkle">✦</text>
        <text x="120" y="115" font-size="14" class="vibe-sparkle">✦</text>
      </g>
    `;

    // スタイル追加
    const style = document.createElement('style');
    style.textContent = `
      .vibe-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      /* 触角アニメーション */
      .vibe-antenna--left { transform-origin: 62px 45px; }
      .vibe-antenna--right { transform-origin: 98px 45px; }

      .vibe-antenna[data-speed="slow"] {
        animation: antennaSlow 3s ease-in-out infinite;
      }
      .vibe-antenna--right[data-speed="slow"] {
        animation-delay: 0.3s;
      }

      .vibe-antenna[data-speed="fast"] {
        animation: antennaFast 0.4s ease-in-out infinite alternate;
      }
      .vibe-antenna--right[data-speed="fast"] {
        animation-delay: 0.1s;
      }

      .vibe-antenna[data-speed="burst"] {
        animation: antennaBurst 0.6s var(--ease);
      }

      .vibe-antenna[data-speed="droop"] {
        animation: antennaDroop 0.5s var(--ease) forwards;
      }

      @keyframes antennaSlow {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(3deg); }
      }

      @keyframes antennaFast {
        from { transform: rotate(-5deg); }
        to { transform: rotate(5deg); }
      }

      @keyframes antennaBurst {
        0% { transform: rotate(0deg) scale(1); }
        30% { transform: rotate(-10deg) scale(1.2); }
        60% { transform: rotate(10deg) scale(1.2); }
        100% { transform: rotate(0deg) scale(1); }
      }

      @keyframes antennaDroop {
        from { transform: rotate(0deg); }
        to { transform: rotate(15deg); }
      }
      .vibe-antenna--right[data-speed="droop"] {
        animation-name: antennaDroopRight;
      }
      @keyframes antennaDroopRight {
        from { transform: rotate(0deg); }
        to { transform: rotate(-15deg); }
      }

      /* 瞬き */
      .vibe-eye__base { animation: vibeBlink 4s ease-in-out infinite; }
      @keyframes vibeBlink {
        0%, 90%, 100% { transform: scaleY(1); }
        95% { transform: scaleY(0.1); }
      }

      /* 目の状態 */
      .vibe-eye[data-look="wide"] .vibe-eye__base { r: 7; animation: none; }
      .vibe-eye[data-look="wide"] .vibe-eye__pupil { r: 4; }

      .vibe-eye[data-look="focus"] .vibe-eye__pupil { r: 4.5; }
      .vibe-eye[data-look="focus"] .vibe-eye__base { animation: none; }

      .vibe-eye[data-look="look"] .vibe-eye__pupil {
        animation: eyeLook 2s ease-in-out infinite;
      }
      @keyframes eyeLook {
        0%, 100% { cx: -1px; }
        50% { cx: 2px; }
      }

      .vibe-eye[data-look="star"] .vibe-eye__base { fill: #FFD700; r: 7; animation: none; }
      .vibe-eye[data-look="star"] .vibe-eye__pupil { fill: #FFD700; r: 0; }
      .vibe-eye[data-look="star"] .vibe-eye__highlight { fill: white; r: 2; cx: 0; cy: 0; }

      .vibe-eye[data-look="x"] .vibe-eye__base { fill: transparent; animation: none; }
      .vibe-eye[data-look="x"] .vibe-eye__pupil { r: 0; }
      .vibe-eye[data-look="x"] .vibe-eye__highlight { r: 0; }

      /* 口の状態 */
      .vibe-mouth[data-shape="smile"] .vibe-mouth__path { d: path("M-8 0 Q0 8 8 0"); }
      .vibe-mouth[data-shape="open"] .vibe-mouth__path {
        d: path("M-6 0 Q0 10 6 0 Q0 -2 -6 0");
        fill: white;
        stroke: white;
      }
      .vibe-mouth[data-shape="flat"] .vibe-mouth__path { d: path("M-8 2 L8 2"); }
      .vibe-mouth[data-shape="grin"] .vibe-mouth__path { d: path("M-10 0 Q0 12 10 0"); stroke-width: 2.5; }
      .vibe-mouth[data-shape="big"] .vibe-mouth__path {
        d: path("M-10 -2 Q0 14 10 -2 Q0 2 -10 -2");
        fill: white;
        stroke: white;
      }
      .vibe-mouth[data-shape="wavy"] .vibe-mouth__path {
        d: path("M-8 2 Q-4 -2 0 2 Q4 6 8 2");
      }

      /* キラキラ */
      .vibe-sparkles[data-active="true"] {
        opacity: 1;
        animation: sparkleIn 0.5s var(--ease);
      }
      .vibe-sparkle { fill: #FFD700; }
      @keyframes sparkleIn {
        from { opacity: 0; transform: scale(0.5); }
        to { opacity: 1; transform: scale(1); }
      }

      /* ×目用の追加パーツ */
      .vibe-eye[data-look="x"]::after {
        content: '';
      }
    `;
    document.head.appendChild(style);

    return svg;
  }

  /* × 目を SVG 上に追加描画 */
  function addXEyes(svg) {
    // 既存の × パーツを削除
    svg.querySelectorAll('.vibe-x-eye').forEach(el => el.remove());

    const leftX = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    leftX.classList.add('vibe-x-eye');
    leftX.setAttribute('transform', 'translate(64, 80)');
    leftX.innerHTML = `
      <line x1="-4" y1="-4" x2="4" y2="4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="4" y1="-4" x2="-4" y2="4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    `;

    const rightX = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rightX.classList.add('vibe-x-eye');
    rightX.setAttribute('transform', 'translate(96, 80)');
    rightX.innerHTML = `
      <line x1="-4" y1="-4" x2="4" y2="4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="4" y1="-4" x2="-4" y2="4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    `;

    svg.appendChild(leftX);
    svg.appendChild(rightX);
  }

  function removeXEyes(svg) {
    svg.querySelectorAll('.vibe-x-eye').forEach(el => el.remove());
  }

  /* 表情を適用 */
  function applyFace(state) {
    const face = faces[state];
    if (!face || !container) return;

    const svg = container.querySelector('.vibe-svg');
    if (!svg) return;

    // 目
    const leftEye = svg.querySelector('.vibe-eye--left');
    const rightEye = svg.querySelector('.vibe-eye--right');
    if (leftEye) leftEye.setAttribute('data-look', face.leftEye);
    if (rightEye) rightEye.setAttribute('data-look', face.rightEye);

    // × 目の特殊処理
    if (face.leftEye === 'x') {
      addXEyes(svg);
    } else {
      removeXEyes(svg);
    }

    // 口
    const mouth = svg.querySelector('.vibe-mouth');
    if (mouth) mouth.setAttribute('data-shape', face.mouth);

    // 触角
    svg.querySelectorAll('.vibe-antenna').forEach(a => {
      a.setAttribute('data-speed', face.antenna);
    });

    // キラキラ
    const sparkles = svg.querySelector('.vibe-sparkles');
    if (sparkles) sparkles.setAttribute('data-active', state === 'done' ? 'true' : 'false');
  }

  /* ランダムセリフ取得 */
  function getRandomSpeech(state) {
    const list = speeches[state] || speeches.idle;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* 紙吹雪 */
  function showConfetti() {
    const confettiContainer = document.getElementById('confettiContainer');
    if (!confettiContainer) return;

    const colors = ['#077BDC', '#4DA3E8', '#FFD700', '#FF6B6B', '#4ade80', '#c084fc'];

    for (let i = 0; i < 30; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.top = '-10px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 0.5 + 's';
      piece.style.animationDuration = 1 + Math.random() * 1 + 's';
      piece.style.width = 4 + Math.random() * 8 + 'px';
      piece.style.height = 4 + Math.random() * 8 + 'px';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiContainer.appendChild(piece);
    }

    setTimeout(() => {
      confettiContainer.innerHTML = '';
    }, 2500);
  }

  /* 吹き出し更新 */
  function updateSpeech(text) {
    if (!speechBubble || !speechText) return;
    speechBubble.classList.remove('hidden');
    speechText.textContent = '';

    // タイプライター効果
    let i = 0;
    const typeInterval = setInterval(() => {
      if (i < text.length) {
        speechText.textContent += text[i];
        i++;
      } else {
        clearInterval(typeInterval);
      }
    }, 40);
  }

  /* 公開 API */
  return {
    init(containerEl, bubbleEl, textEl) {
      container = containerEl;
      speechBubble = bubbleEl;
      speechText = textEl;

      const svg = createSVG();
      container.appendChild(svg);
      applyFace('idle');
    },

    setState(state) {
      if (!container) return;
      const prevState = currentState;
      currentState = state;

      // コンテナの状態属性更新
      container.setAttribute('data-state', state);

      // 表情適用
      applyFace(state);

      // セリフ更新
      updateSpeech(getRandomSpeech(state));

      // 完了時の演出
      if (state === 'done') {
        showConfetti();
      }
    },

    getState() {
      return currentState;
    },

    say(text) {
      updateSpeech(text);
    },

    getSpeeches() {
      return speeches;
    },
  };
})();
