/* ============================================
   SiteVibe Agent Console — 音声モジュール
   MediaRecorder → Whisper STT / OpenAI TTS
   ============================================ */

const Audio = (() => {
  let mediaRecorder = null;
  let audioChunks = [];
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let stream = null;
  let isRecording = false;

  /* マイク対応 mimeType を検出 */
  function getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  /* マイク取得 + AudioContext 初期化 */
  async function initMicrophone() {
    if (stream) return;

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 波形解析用
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
  }

  /* 録音開始 */
  async function startRecording() {
    await initMicrophone();

    const mimeType = getSupportedMimeType();
    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.start(100); // 100msごとにデータ取得
    isRecording = true;
  }

  /* 録音停止 → Blob を返す */
  function stopRecording() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: mimeType });
        audioChunks = [];
        isRecording = false;
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }

  /* Whisper API で文字起こし */
  async function transcribe(audioBlob) {
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${ext}`);

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '文字起こしに失敗しました');
    }

    const data = await res.json();
    return data.text || '';
  }

  /* TTS で音声再生 */
  async function speak(text, voice = 'alloy') {
    const res = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    if (!res.ok) {
      console.error('TTS エラー:', res.status);
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new window.Audio(url);

    return new Promise((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  }

  /* 波形データ取得（0.0〜1.0 の配列） */
  function getWaveformData() {
    if (!analyser) return new Float32Array(0);
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);
    // 正規化
    const normalized = new Float32Array(bufferLength);
    for (let i = 0; i < bufferLength; i++) {
      normalized[i] = data[i] / 255;
    }
    return normalized;
  }

  /* 平均音量（0.0〜1.0） */
  function getVolume() {
    const data = getWaveformData();
    if (data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
  }

  /* リソース解放 */
  function dispose() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (sourceNode) sourceNode.disconnect();
    if (audioContext) audioContext.close();
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    mediaRecorder = null;
    sourceNode = null;
    audioContext = null;
    analyser = null;
    stream = null;
    isRecording = false;
  }

  return {
    startRecording,
    stopRecording,
    transcribe,
    speak,
    getWaveformData,
    getVolume,
    dispose,
    get isRecording() { return isRecording; },
  };
})();
