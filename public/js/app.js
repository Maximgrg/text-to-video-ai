class VideoForgeApp {
  constructor() {
    this.form = document.getElementById('generateForm');
    this.promptInput = document.getElementById('prompt');
    this.promptCounter = document.getElementById('promptCounter');
    this.imageInput = document.getElementById('imageInput');
    this.fileUpload = document.getElementById('fileUpload');
    this.filePreview = document.getElementById('filePreview');
    this.previewImage = document.getElementById('previewImage');
    this.removeFileBtn = document.getElementById('removeFile');
    this.generateBtn = document.getElementById('generateBtn');
    this.durationSelect = document.getElementById('duration');
    this.usageText = document.getElementById('usageText');
    this.usageCounter = document.getElementById('usageCounter');
    this.usageProgressFill = document.getElementById('usageProgressFill');
    this.statusSection = document.getElementById('statusSection');
    this.statusPending = document.getElementById('statusPending');
    this.statusCompleted = document.getElementById('statusCompleted');
    this.statusFailed = document.getElementById('statusFailed');
    this.generatedVideo = document.getElementById('generatedVideo');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.errorMessage = document.getElementById('errorMessage');
    this.galleryGrid = document.getElementById('galleryGrid');
    this.toast = document.getElementById('toast');
    this.toastMessage = document.getElementById('toastMessage');
    this.toastIcon = document.getElementById('toastIcon');
    this.tip1 = document.getElementById('tip1');
    this.tip2 = document.getElementById('tip2');
    this.tip3 = document.getElementById('tip3');

    this.db = null;
    this.videoUrls = {};
    this.serverVideos = {};
    this.totalGenerated = 0;
    this.serverMode = null;
    this.init();
  }

  init() {
    this.initDB();
    this.loadUsage();
    this.loadHistory();
    this.checkServerMode();
    this.bindEvents();
  }

  initDB() {
    try {
      const req = indexedDB.open('VideoForgeDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; };
      req.onerror = () => console.warn('IndexedDB unavailable');
    } catch (e) {
      console.warn('IndexedDB unavailable:', e);
    }
  }

  bindEvents() {
    this.promptInput.addEventListener('input', () => {
      this.promptCounter.textContent = this.promptInput.value.length + ' символов';
    });

    this.imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.previewImage.src = event.target.result;
          this.filePreview.style.display = 'flex';
          this.fileUpload.querySelector('.file-upload-content').style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });

    this.removeFileBtn.addEventListener('click', () => {
      this.imageInput.value = '';
      this.filePreview.style.display = 'none';
      this.fileUpload.querySelector('.file-upload-content').style.display = 'block';
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('🔄 Form submitted, generating video...');
      if (!this.promptInput.value.trim()) {
        this.showToast('❌', 'Please enter some text');
        return;
      }
      this.handleGenerate(e);
    });
  }

  loadUsage() {
    const today = new Date().toISOString().slice(0, 10);
    let usage;
    try { usage = JSON.parse(localStorage.getItem('vf_usage')); } catch (e) {}
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0 };
      localStorage.setItem('vf_usage', JSON.stringify(usage));
    }
    const freeLimit = 10;
    const remaining = Math.max(0, freeLimit - usage.count);
    const percent = Math.min((usage.count / freeLimit) * 100, 100);

    this.usageText.textContent = '📊 ' + remaining + '/' + freeLimit;
    this.usageCounter.textContent = usage.count + ' / ' + freeLimit;
    this.usageProgressFill.style.width = percent + '%';
  }

  checkUsage() {
    const today = new Date().toISOString().slice(0, 10);
    let usage;
    try { usage = JSON.parse(localStorage.getItem('vf_usage')); } catch (e) {}
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0 };
    }
    if (usage.count >= 10) {
      this.showToast('❌', 'Лимит исчерпан (10/10). Приобретите подписку!');
      return false;
    }
    return true;
  }

  incrementUsage() {
    const today = new Date().toISOString().slice(0, 10);
    let usage;
    try { usage = JSON.parse(localStorage.getItem('vf_usage')); } catch (e) {}
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0 };
    }
    usage.count++;
    localStorage.setItem('vf_usage', JSON.stringify(usage));
  }

  async checkServerMode() {
    try {
      const resp = await fetch('/api/status');
      if (resp.ok) {
        const data = await resp.json();
        this.serverMode = data.aiMode && data.apiKeyConfigured ? 'ai' : 'local';
        console.log('Server mode:', this.serverMode, '-', data.message);
      }
    } catch (e) {
      console.log('Server not available, using local generation');
      this.serverMode = 'local';
    }
  }

  async handleGenerate(e) {
    e.preventDefault();
    const prompt = this.promptInput.value.trim();
    if (!prompt || prompt.length < 3) {
      this.showToast('❌', 'Введите описание видео (минимум 3 символа)');
      return;
    }
    if (!this.checkUsage()) return;

    this.generateBtn.classList.add('loading');
    this.generateBtn.disabled = true;
    this.showStatus('pending');

    const duration = parseInt(this.durationSelect.value);
    const imageFile = this.imageInput.files[0];
    const jobId = 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    try {
      if (this.serverMode === 'ai') {
        this.updateTips([
          '🤖 Civitai AI генерирует видео...',
          '⏳ Обычно 1-2 минуты',
          '🔍 Отслеживаем статус'
        ]);

        const videoUrl = await this.generateViaServer(prompt, duration, imageFile);

        this.incrementUsage();
        this.loadUsage();

        this.serverVideos[jobId] = videoUrl;
        this.showStatus('completed', videoUrl);
        await this.loadHistory();
        this.showToast('✅', 'AI видео готово!');
      } else {
        this.updateTips([
          '🎨 Рендеринг сцены...',
          '🎬 Генерирует кадры',
          '💥 Собирает видео'
        ]);

        const result = await this.generateVideo(prompt, duration);

        await this.saveVideo(jobId, prompt, duration, result.blob);
        this.incrementUsage();
        this.loadUsage();

        const url = URL.createObjectURL(result.blob);
        this.videoUrls[jobId] = url;
        this.showStatus('completed', url);
        await this.loadHistory();
        this.showToast('✅', 'Видео готово!');
      }
    } catch (err) {
      console.error('Generation error:', err);

      if (this.serverMode === 'ai') {
        console.log('Server AI failed, falling back to local...');
        this.serverMode = 'local';
        try {
          this.updateTips([
            '🔄 Переключаюсь на локальную генерацию...',
            '🎨 Рендеринг сцены',
            '💥 Собираем видео'
          ]);

          const result = await this.generateVideo(prompt, duration);
          await this.saveVideo(jobId, prompt, duration, result.blob);
          this.incrementUsage();
          this.loadUsage();

          const url = URL.createObjectURL(result.blob);
          this.videoUrls[jobId] = url;
          this.showStatus('completed', url);
          await this.loadHistory();
          this.showToast('✅', 'Видео готово (локально)!');
          return;
        } catch (fallbackErr) {
          err = fallbackErr;
        }
      }

      this.showStatus('failed', err.message || 'Неизвестная ошибка');
      this.showToast('❌', 'Ошибка генерации');
    } finally {
      this.generateBtn.classList.remove('loading');
      this.generateBtn.disabled = false;
    }
  }

  async generateViaServer(prompt, duration, imageFile) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('duration', String(duration));
    if (imageFile) {
      formData.append('image', imageFile);
    }

    const resp = await fetch('/api/generate', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Server error (' + resp.status + ')');
    }

    const data = await resp.json();

    if (!data.jobId) {
      throw new Error('Server did not return a job ID');
    }

    const maxAttempts = 120;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1000));

      const statusResp = await fetch('/api/jobs/' + data.jobId);
      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      const job = statusData.job;

      if (!job) continue;

      if (job.status === 'completed' && job.videoUrl) {
        this.updateTips([
          '✅ Видео готово!',
          '🎬 Загружаем результат...',
          '✨ Отлично!'
        ]);
        return job.videoUrl;
      }

      if (job.status === 'failed') {
        throw new Error(job.error || 'Ошибка генерации видео на сервере');
      }

      if (attempt % 10 === 0) {
        const seconds = Math.floor(attempt / 2);
        this.updateTips([
          '🤖 AI генерирует видео...',
          '⏳ Прошло ' + seconds + 'с',
          '🔍 Ждём результат'
        ]);
      }
    }

    throw new Error('Превышено время ожидания генерации видео');
  }

  updateTips(tips) {
    if (this.tip1) this.tip1.textContent = tips[0] || '';
    if (this.tip2) this.tip2.textContent = tips[1] || '';
    if (this.tip3) this.tip3.textContent = tips[2] || '';
  }

  // ============================================================
  // Local canvas-based video generation (fallback when no AI API)
  // ============================================================

  async generateVideo(prompt, duration, audioEnabled = true) {
    const MediaRecorderClass = window.MediaRecorder;

    if (typeof MediaRecorderClass === 'undefined') {
      throw new Error('MediaRecorder не поддерживается вашим браузером');
    }

    if (!HTMLCanvasElement.prototype.captureStream) {
      throw new Error('Canvas.captureStream не поддерживается в вашем браузере');
    }

    if (duration > 120) {
      this.showToast('⚠️', 'Видео длиннее 2 минут может создаваться долго. Пожалуйста, подождите.');
    }

    const fps = 24;
    const totalFrames = duration * fps;
    const W = 1280;
    const H = 720;

    const mimeType = MediaRecorderClass.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorderClass.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : MediaRecorderClass.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/webm';

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorderClass(stream, { mimeType });
    const chunks = [];

    const scene = this.analyzeScene(prompt, W, H);

    let audioCtx = null;
    let audioNodes = [];
    if (audioEnabled && (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined')) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioNodes = this.generateAudio(audioCtx, scene, duration);
      } catch (e) {
        console.warn('Audio generation failed:', e);
      }
    }

    return new Promise((resolve, reject) => {
      let frameIndex = 0;
      let safetyTimeout;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = (e) => {
        clearTimeout(safetyTimeout);
        this.stopAudio(audioCtx, audioNodes);
        console.error('Recorder error:', e);
        reject(new Error('Ошибка MediaRecorder'));
      };

      function finish() {
        clearTimeout(safetyTimeout);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }

      recorder.onstop = () => {
        this.stopAudio(audioCtx, audioNodes);
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve({ blob });
      };

      function renderFrame() {
        if (frameIndex >= totalFrames) {
          finish();
          return;
        }

        const t = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0;
        this.renderScene(ctx, W, H, scene, t, frameIndex, totalFrames, duration);
        frameIndex++;

        if (frameIndex % fps === 0 || frameIndex === totalFrames) {
          const progress = Math.round(frameIndex / totalFrames * 100);
          const elapsed = Math.floor(frameIndex / fps);
          const remaining = duration - elapsed;
          this.updateTips([
            '🎨 Рендеринг: ' + progress + '%',
            '🖼️ ' + frameIndex + '/' + totalFrames + ' кадров',
            '⏳ Осталось ~' + remaining + 'с'
          ]);
        }

        setTimeout(renderFrame.bind(this), 1000 / fps);
      }

      recorder.start(1000 / fps);
      safetyTimeout = setTimeout(() => finish(), (totalFrames + 30) * 1000 / fps);
      setTimeout(renderFrame.bind(this), 10);
    });
  }

  // ============================================================
  // Audio Generation — ambient sounds per scene
  // ============================================================

  generateAudio(audioCtx, scene, duration) {
    const nodes = [];
    const durationSec = duration;

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
    nodes.push(masterGain);

    const theme = scene.theme;

    const drone = this.createDrone(audioCtx, scene, durationSec);
    if (drone) {
      drone.connect(masterGain);
      nodes.push(drone);
    }

    switch (theme) {
      case 'ocean':
      case 'sunset':
      case 'sunrise':
        this.createWaveSound(audioCtx, masterGain, durationSec);
        break;
      case 'rain':
      case 'city':
        this.createRainSound(audioCtx, masterGain, durationSec);
        break;
      case 'forest':
      case 'spring':
        this.createBirdSound(audioCtx, masterGain, durationSec);
        break;
      case 'fire':
        this.createFireSound(audioCtx, masterGain, durationSec);
        break;
      case 'mountain':
      case 'snow':
        this.createWindSound(audioCtx, masterGain, durationSec);
        break;
      default:
        break;
    }

    return nodes;
  }

  createDrone(audioCtx, scene, duration) {
    const gain = audioCtx.createGain();
    gain.gain.value = 0.08;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 1);

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    const freqMap = {
      'ocean': 80, 'sunset': 120, 'sunrise': 140, 'forest': 110,
      'space': 50, 'mountain': 90, 'city': 100, 'desert': 95,
      'snow': 85, 'fantasy': 70, 'fire': 65, 'rain': 75,
      'spring': 130, 'night': 55, 'cyberpunk': 60, 'retro': 65,
    };
    osc.frequency.value = freqMap[scene.theme] || 100;

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 5;

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    lfo.stop(audioCtx.currentTime + duration);

    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = osc.frequency.value * 2;
    const gain2 = audioCtx.createGain();
    gain2.gain.value = 0.03;
    osc2.connect(gain2);
    gain2.connect(gain);
    osc2.start();
    osc2.stop(audioCtx.currentTime + duration);

    return gain;
  }

  createWaveSound(audioCtx, dest, duration) {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / audioCtx.sampleRate;
      const noise = (Math.random() * 2 - 1);
      const waveEnv = Math.max(0, Math.sin(t * 0.15)) * Math.max(0, Math.sin(t * 0.08 + 0.5));
      data[i] = noise * waveEnv * 0.3;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.12;
    source.connect(gain);
    gain.connect(dest);
    source.start();
    source.stop(audioCtx.currentTime + duration);
  }

  createRainSound(audioCtx, dest, duration) {
    const bufferSize = audioCtx.sampleRate * 3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.15;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start();
    source.stop(audioCtx.currentTime + duration);
  }

  createBirdSound(audioCtx, dest, duration) {
    const chirpCount = Math.floor(duration / 3);
    for (let i = 0; i < chirpCount; i++) {
      const startTime = audioCtx.currentTime + 2 + i * 3 + Math.random() * 1.5;
      const chirpDur = 0.15 + Math.random() * 0.1;
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500 + Math.random() * 1000, startTime);
      osc.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 1500, startTime + chirpDur);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + chirpDur);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + chirpDur);
    }
  }

  createFireSound(audioCtx, dest, duration) {
    const bufferSize = audioCtx.sampleRate * 1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.08;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start();
    source.stop(audioCtx.currentTime + duration);
  }

  createWindSound(audioCtx, dest, duration) {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / audioCtx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 0.08));
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.5;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.1;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start();
    source.stop(audioCtx.currentTime + duration);
  }

  stopAudio(audioCtx, nodes) {
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.close(); } catch (e) {}
    }
  }

  // ============================================================
  // Scene Analysis
  // ============================================================

  analyzeScene(prompt, W, H) {
    const lower = prompt.toLowerCase();

    let scene = {
      theme: 'sunset',
      colors: {
        sky: ['#0a0a2e', '#ff6b35', '#ff4500', '#ffd700'],
        accent: '#ff6b35',
        accent2: '#ff4500',
        ground: '#2d1a0a',
      },
      elements: ['sun', 'clouds', 'birds', 'ocean_reflection'],
      particles: 'fireflies',
      particleCount: 40,
      wind: 0.2,
    };

    const themes = [
      {
        name: 'sunset',
        keywords: ['закат', 'закат солнца', 'вечер', 'солнце садится', 'сумерки', 'sunset', 'dusk', 'красное небо', 'orange sky', 'golden hour'],
        config: {
          colors: { sky: ['#1a0a2e', '#ff6b35', '#ff4500', '#ffd700'], accent: '#ff6b35', accent2: '#ff4500', ground: '#2d1a0a' },
          elements: ['sun', 'clouds', 'birds', 'ocean_reflection'],
          particles: 'fireflies',
          particleCount: 40,
          wind: 0.2,
        }
      },
      {
        name: 'sunrise',
        keywords: ['рассвет', 'восход', 'утро', 'солнце встает', 'sunrise', 'dawn'],
        config: {
          colors: { sky: ['#0a1a2e', '#ff8c42', '#ffd700', '#87ceeb'], accent: '#ff8c42', accent2: '#ffd700', ground: '#1a2a1a' },
          elements: ['sun', 'clouds', 'birds'],
          particles: 'fireflies',
          particleCount: 30,
          wind: 0.15,
        }
      },
      {
        name: 'ocean',
        keywords: ['море', 'океан', 'волн', 'пляж', 'побережье', 'вода', 'волна', 'ocean', 'sea', 'beach', 'wave', 'deep blue', 'aquatic', 'underwater'],
        config: {
          colors: { sky: ['#0a1a3e', '#0077be', '#00bfff', '#87ceeb'], accent: '#00bfff', accent2: '#0077be', ground: '#1a3a5e' },
          elements: ['waves', 'clouds', 'seagulls', 'ships'],
          particles: 'sparkles',
          particleCount: 30,
          wind: 0.4,
        }
      },
      {
        name: 'forest',
        keywords: ['лес', 'дерев', 'природа', 'зелень', 'трава', 'роща', 'бор', 'forest', 'tree', 'wood', 'woodland', 'enchanted forest', 'green forest', 'jungle'],
        config: {
          colors: { sky: ['#0a1a0a', '#1a4a1a', '#2d6b2d', '#4a8a4a'], accent: '#4caf50', accent2: '#8bc34a', ground: '#1a2a0a' },
          elements: ['trees', 'fireflies', 'leaves'],
          particles: 'fireflies',
          particleCount: 50,
          wind: 0.2,
        }
      },
      {
        name: 'space',
        keywords: ['космос', 'вселенная', 'звезд', 'галактик', 'планет', 'ракет', 'space', 'galaxy', 'universe', 'planet', 'starry night', 'nebula', 'black hole', 'alien world'],
        config: {
          colors: { sky: ['#000011', '#0a0a2e', '#1a0a3e', '#0d002a'], accent: '#e040fb', accent2: '#7c4dff', ground: '#000011' },
          elements: ['nebula', 'planets', 'shooting_stars'],
          particles: 'stars',
          particleCount: 120,
          wind: 0.05,
        }
      },
      {
        name: 'mountain',
        keywords: ['гор', 'холм', 'скал', 'вершин', 'mountain', 'peak', 'hill', 'mount', 'snowy peaks', 'rocky mountains', 'alps', 'himalayas'],
        config: {
          colors: { sky: ['#0a1a2e', '#2a3a5e', '#4a6a8e', '#8aacce'], accent: '#6a8aae', accent2: '#4a6a8e', ground: '#2a3a2a' },
          elements: ['mountains', 'clouds', 'birds', 'trees'],
          particles: 'snow',
          particleCount: 40,
          wind: 0.3,
        }
      },
      {
        name: 'city',
        keywords: ['город', 'мегаполис', 'улиц', 'ночной город', 'небоскреб', 'city', 'urban', 'street', 'skyscraper', 'urban landscape', 'neon lights', 'cyberpunk city'],
        config: {
          colors: { sky: ['#0a0a1a', '#1a1a3e', '#2a2a5e', '#0d0d2a'], accent: '#ffab00', accent2: '#ff6d00', ground: '#1a1a2e' },
          elements: ['buildings', 'city_lights', 'rain', 'neon'],
          particles: 'rain',
          particleCount: 60,
          wind: 0.5,
        }
      },
      {
        name: 'desert',
        keywords: ['пустын', 'песок', 'дюн', 'сахар', 'desert', 'sand', 'dune', 'sandy', 'canyon', 'sahara'],
        config: {
          colors: { sky: ['#1a0a00', '#8a5a2a', '#d4a04a', '#e8c06a'], accent: '#d4a04a', accent2: '#e8c06a', ground: '#8a5a2a' },
          elements: ['dunes', 'sun', 'heat_haze'],
          particles: 'dust',
          particleCount: 30,
          wind: 0.4,
        }
      },
      {
        name: 'snow',
        keywords: ['снег', 'зим', 'сугроб', 'метел', 'снежинк', 'snow', 'winter', 'blizzard', 'icy', 'arctic'],
        config: {
          colors: { sky: ['#0a1a2e', '#4a6a8e', '#8aacce', '#c0d8f0'], accent: '#c0d8f0', accent2: '#ffffff', ground: '#2a3a4e' },
          elements: ['snow_ground', 'snowflakes', 'trees_snow'],
          particles: 'snow',
          particleCount: 80,
          wind: 0.3,
        }
      },
      {
        name: 'fantasy',
        keywords: ['фэнтез', 'волшебн', 'магическ', 'замок', 'дракон', 'сказк', 'fantasy', 'magic', 'castle', 'dragon', 'magic kingdom', 'mythical', 'elves', 'dwarves'],
        config: {
          colors: { sky: ['#0a002a', '#2a004a', '#4a006a', '#6a008a'], accent: '#e040fb', accent2: '#7c4dff', ground: '#1a003a' },
          elements: ['castle', 'sparkles', 'nebula', 'dragons'],
          particles: 'sparkles',
          particleCount: 80,
          wind: 0.15,
        }
      },
      {
        name: 'fire',
        keywords: ['огонь', 'пожар', 'вулкан', 'плам', 'горящ', 'fire', 'flame', 'volcano', 'burning', 'inferno', 'lava'],
        config: {
          colors: { sky: ['#1a0000', '#4a0000', '#8a1a00', '#d44000'], accent: '#ff4500', accent2: '#ff6b35', ground: '#2a0a00' },
          elements: ['fire', 'smoke', 'embers'],
          particles: 'embers',
          particleCount: 60,
          wind: 0.3,
        }
      },
      {
        name: 'rain',
        keywords: ['дождь', 'ливень', 'гроз', 'туч', 'пасмур', 'rain', 'storm', 'thunder', 'cloudy', 'stormy', 'rainy day'],
        config: {
          colors: { sky: ['#0a0a1a', '#1a1a2e', '#2a2a3e', '#3a3a4e'], accent: '#6868a8', accent2: '#9898c8', ground: '#1a1a2a' },
          elements: ['clouds', 'rain', 'puddles', 'lightning'],
          particles: 'rain',
          particleCount: 100,
          wind: 0.6,
        }
      },
      {
        name: 'spring',
        keywords: ['весн', 'цвет', 'сад', 'бабочк', 'радуг', 'spring', 'flower', 'garden', 'butterfly', 'rainbow', 'blossom', 'flower field', 'vibrant'],
        config: {
          colors: { sky: ['#0a1a2e', '#4a8ace', '#ffb7c5', '#98fb98'], accent: '#ff69b4', accent2: '#98fb98', ground: '#2a5a2a' },
          elements: ['flowers', 'butterflies', 'clouds'],
          particles: 'petals',
          particleCount: 40,
          wind: 0.25,
        }
      },
      {
        name: 'cyberpunk',
        keywords: ['киберпанк', 'неоновы', 'футуристическ', 'будущее', 'технологии', 'cyberpunk', 'neon', 'futuristic', 'dystopian', 'hologram'],
        config: {
          colors: { sky: ['#000014', '#140028', '#28003c', '#001428', '#00283c'], accent: '#00ffff', accent2: '#ff00ff', ground: '#000000' },
          elements: ['buildings', 'neon', 'city_lights'],
          particles: 'sparkles',
          particleCount: 80,
          wind: 0.3,
        }
      },
      {
        name: 'retro',
        keywords: ['ретро', '80е', '90е', 'винтаж', 'ретро-', 'retro', '80s', '90s', 'vintage', 'synthwave', 'outrun'],
        config: {
          colors: { sky: ['#140014', '#280028', '#3c003c', '#500050', '#640064'], accent: '#ff00ff', accent2: '#00ffff', ground: '#000000' },
          elements: ['neon', 'grid'],
          particles: 'sparkles',
          particleCount: 50,
          wind: 0.2,
        }
      },
    ];

    let bestScore = 0;
    let bestTheme = null;
    let secondBestScore = 0;
    let secondBestTheme = null;

    for (const theme of themes) {
      let score = 0;
      for (const kw of theme.keywords) {
        if (lower.includes(kw)) {
          score += kw.length * 2;
        }
      }
      if (score > bestScore) {
        secondBestScore = bestScore;
        secondBestTheme = bestTheme;
        bestScore = score;
        bestTheme = theme;
      } else if (score > secondBestScore) {
        secondBestScore = score;
        secondBestTheme = theme;
      }
    }

    if (bestTheme) {
      scene = {
        theme: bestTheme.name,
        ...bestTheme.config,
      };

      if (secondBestTheme && secondBestScore > bestScore * 0.6) {
        for (const el of secondBestTheme.config.elements) {
          if (!scene.elements.includes(el)) {
            scene.elements.push(el);
          }
        }
        const sky1 = bestTheme.config.colors.sky;
        const sky2 = secondBestTheme.config.colors.sky;
        scene.colors.sky = sky1.map((c, i) => {
          if (i >= sky2.length) return c;
          const c1 = this.hexToRgb(c);
          const c2 = this.hexToRgb(sky2[i]);
          if (!c1 || !c2) return c;
          const mr = Math.floor(c1.r * 0.6 + c2.r * 0.4);
          const mg = Math.floor(c1.g * 0.6 + c2.g * 0.4);
          const mb = Math.floor(c1.b * 0.6 + c2.b * 0.4);
          return '#' + [mr, mg, mb].map(v => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('');
        });
      }
    }

    const objectMap = {
      'корабль|лодка|корабли|судно|ship|boat|sailboat': 'ships',
      'птиц|птица|чайк|bird|seagull': 'birds',
      'дракон|dragon': 'dragons',
      'замок|castle|крепость': 'castle',
      'цвет|цветы|flower|blossom': 'flowers',
      'бабочк|butterfly|бабочка': 'butterflies',
      'радуг|rainbow': 'neon',
      'неон|neon': 'neon',
      'дерев|tree|лес': 'trees',
      'звезд|star|star': 'stars',
      'облак|облач|cloud|туч': 'clouds',
      'лун|moon': 'stars',
      'огонь|fire|пламя|костер': 'fire',
      'снег|snow|зим': 'snowflakes',
      'дождь|rain|ливень': 'rain',
      'гор|mountain|скал': 'mountains',
      'волн|wave|море|ocean': 'waves',
    };

    for (const [pattern, element] of Object.entries(objectMap)) {
      if (new RegExp(pattern, 'i').test(prompt)) {
        if (!scene.elements.includes(element)) {
          scene.elements.push(element);
        }
      }
    }

    return scene;
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  // ============================================================
  // Main Scene Renderer
  // ============================================================

  renderScene(ctx, W, H, scene, t, f, totalFrames, duration) {
    ctx.clearRect(0, 0, W, H);

    this.drawSkyGradient(ctx, W, H, scene.colors.sky, t);

    const elementOrder = [
      'nebula', 'stars', 'sun', 'mountains', 'dunes',
      'clouds', 'waves', 'ocean_reflection', 'heat_haze',
      'buildings', 'city_lights', 'trees', 'trees_snow',
      'leaves', 'snow_ground', 'castle', 'puddles',
      'rain', 'snowflakes', 'fire', 'smoke', 'embers',
      'fireflies', 'sparkles', 'shooting_stars', 'lightning',
      'birds', 'seagulls', 'ships', 'butterflies', 'dragons',
      'flowers', 'petals', 'neon', 'dust'
    ];

    for (const elementType of elementOrder) {
      if (scene.elements.includes(elementType)) {
        const fn = this['draw_' + elementType];
        if (fn) fn.call(this, ctx, W, H, scene, t, f, totalFrames, duration);
      }
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.font = '14px "Inter", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('VideoForge AI', W - 15, H - 10);
  }

  drawSkyGradient(ctx, W, H, colors, t) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const len = colors.length;
    for (let i = 0; i < len; i++) {
      grad.addColorStop(i / (len - 1), colors[i]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  draw_stars(ctx, W, H, scene, t) {
    const count = 100;
    const seed = 42;
    for (let i = 0; i < count; i++) {
      const sx = ((i * 137.5 + seed) % W);
      const sy = ((i * 97.3 + seed * 2) % (H * 0.6));
      const brightness = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 1.7));
      const size = 1 + Math.sin(t * 3 + i * 2.3) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (brightness * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_sun(ctx, W, H, scene, t) {
    const size = 80;
    const sx = W * 0.7;
    const sy = H * 0.25 + Math.sin(t * Math.PI) * 40;

    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.5);
    glow.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
    glow.addColorStop(0.5, 'rgba(255, 150, 50, 0.15)');
    glow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - size * 2.5, sy - size * 2.5, size * 5, size * 5);

    const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
    sunGrad.addColorStop(0, '#fff8e0');
    sunGrad.addColorStop(0.3, '#ffd700');
    sunGrad.addColorStop(0.7, '#ff8c00');
    sunGrad.addColorStop(1, '#ff4500');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 200, 100, 0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + t * 0.3;
      const len = size * (1.2 + Math.sin(t * 2 + i) * 0.3);
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * size * 0.8, sy + Math.sin(angle) * size * 0.8);
      ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
      ctx.stroke();
    }
  }

  draw_clouds(ctx, W, H, scene, t) {
    const positions = [
      { x: 0.1, y: 0.08, s: 1.0 },
      { x: 0.35, y: 0.12, s: 0.8 },
      { x: 0.6, y: 0.06, s: 1.2 },
      { x: 0.85, y: 0.1, s: 0.7 },
    ];
    for (const cp of positions) {
      const cx = ((cp.x + t * 0.02) % 1.2 - 0.1) * W;
      const cy = cp.y * H;
      const s = cp.s;
      ctx.fillStyle = 'rgba(200, 210, 240, 0.3)';
      const p = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
      p(cx, cy, 30 * s);
      p(cx - 25 * s, cy + 5, 22 * s);
      p(cx + 25 * s, cy + 5, 22 * s);
      p(cx - 10 * s, cy - 8, 20 * s);
      p(cx + 10 * s, cy - 8, 20 * s);
    }
  }

  draw_waves(ctx, W, H, scene, t) {
    const waveY = H * 0.65;
    const waterGrad = ctx.createLinearGradient(0, waveY - 20, 0, H);
    waterGrad.addColorStop(0, 'rgba(0, 100, 200, 0.5)');
    waterGrad.addColorStop(0.3, 'rgba(0, 80, 180, 0.6)');
    waterGrad.addColorStop(1, 'rgba(0, 40, 120, 0.8)');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waveY, W, H - waveY);

    for (let w = 0; w < 5; w++) {
      ctx.strokeStyle = 'rgba(100, 180, 255, ' + (0.15 - w * 0.02) + ')';
      ctx.lineWidth = 2 - w * 0.3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = waveY + w * 15 + Math.sin(x * 0.008 + t * 5 + w * 2.1) * 12 + Math.sin(x * 0.015 + t * 3 + w * 1.3) * 6;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  draw_ocean_reflection(ctx, W, H, scene, t) {
    const waveY = H * 0.65;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 20; i++) {
      const rx = ((i * 73.1 + t * 40) % W);
      const ry = waveY + 20 + ((i * 53.7) % (H - waveY - 30));
      const rw = 8 + Math.sin(t * 2 + i) * 4;
      const rh = 3 + Math.sin(t * 3 + i * 1.5) * 2;
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.globalAlpha = 1.0;
  }

  draw_trees(ctx, W, H, scene, t) {
    const positions = [
      { x: 0.05, h: 0.4 }, { x: 0.15, h: 0.5 }, { x: 0.25, h: 0.35 },
      { x: 0.7, h: 0.45 }, { x: 0.82, h: 0.55 }, { x: 0.92, h: 0.38 },
    ];
    const gy = H * 0.72;
    for (const tp of positions) {
      const tx = tp.x * W;
      const th = tp.h * H;
      ctx.fillStyle = '#4a3520';
      ctx.fillRect(tx - 6, gy - th * 0.6, 12, th * 0.6);
      const cols = ['#2d6b2d', '#3a8a3a', '#4a9a4a'];
      for (let i = 0; i < 4; i++) {
        const fy = gy - th * 0.6 - i * th * 0.12;
        const fr = (0.3 - i * 0.04) * th;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.arc(tx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  draw_trees_snow(ctx, W, H, scene, t) {
    const positions = [{ x: 0.1, h: 0.35 }, { x: 0.2, h: 0.45 }, { x: 0.75, h: 0.4 }, { x: 0.88, h: 0.5 }];
    const gy = H * 0.78;
    for (const tp of positions) {
      const tx = tp.x * W;
      const th = tp.h * H;
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(tx - 5, gy - th * 0.5, 10, th * 0.5);
      for (let i = 0; i < 3; i++) {
        const lh = th * 0.25;
        const ly = gy - th * 0.5 - i * lh;
        const lw = (0.5 - i * 0.12) * th;
        ctx.fillStyle = ['#c0d8ee', '#d8e8f8', '#eef4fa'][i];
        ctx.beginPath();
        ctx.moveTo(tx - lw, ly + lh);
        ctx.lineTo(tx, ly);
        ctx.lineTo(tx + lw, ly + lh);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  draw_mountains(ctx, W, H, scene, t) {
    const layers = [
      { c: '#2a3a5e', o: 0, s: 1.0, yB: H * 0.55 },
      { c: '#3a4a6e', o: -20, s: 0.85, yB: H * 0.6 },
      { c: '#4a5a7e', o: -40, s: 0.7, yB: H * 0.63 },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 5) {
        const h = l.s * (Math.sin(x * 0.002 + l.o * 0.1) * 60 + Math.sin(x * 0.005 + l.o * 0.2) * 40 + Math.sin(x * 0.001 + l.o * 0.05) * 80);
        ctx.lineTo(x, l.yB - h);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  draw_dunes(ctx, W, H, scene, t) {
    ctx.fillStyle = '#c4a060';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.7);
    for (let x = 0; x <= W; x += 4) {
      ctx.lineTo(x, H * 0.7 + Math.sin(x * 0.003 + t * 0.2) * 30 + Math.sin(x * 0.007 + t * 0.1) * 15);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#d4b070';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.75);
    for (let x = 0; x <= W; x += 4) {
      ctx.lineTo(x, H * 0.75 + Math.sin(x * 0.004 + t * 0.15 + 1) * 25 + Math.sin(x * 0.009 + t * 0.08) * 12);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  }

  draw_heat_haze(ctx, W, H, scene, t) {
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 15; i++) {
      const hx = ((i * 97.3 + t * 20) % W);
      const hy = H * 0.5 + Math.sin(i * 3 + t * 2) * 50;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx, hy, 30 + Math.sin(t + i) * 10, 2);
    }
    ctx.globalAlpha = 1.0;
  }

  draw_buildings(ctx, W, H, scene, t) {
    const bld = [
      [0.02, 0.06, 0.3], [0.09, 0.04, 0.45], [0.14, 0.05, 0.35], [0.2, 0.03, 0.5],
      [0.24, 0.06, 0.4], [0.31, 0.04, 0.55], [0.36, 0.05, 0.38], [0.42, 0.04, 0.48],
      [0.47, 0.07, 0.6], [0.55, 0.04, 0.42], [0.6, 0.05, 0.52], [0.66, 0.04, 0.36],
      [0.71, 0.06, 0.58], [0.78, 0.04, 0.44], [0.83, 0.05, 0.5], [0.89, 0.04, 0.38],
      [0.94, 0.05, 0.46],
    ];
    const gy = H * 0.72;
    for (const b of bld) {
      const bx = b[0] * W, bw = b[1] * W, bh = b[2] * H;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(bx, gy - bh, bw, bh);
      for (let wy = 0; wy < bh - 8; wy += 14) {
        for (let wx = 0; wx < bw - 6; wx += 12) {
          const lit = Math.sin(t * 0.5 + bx * 0.01 + wy * 0.05) > 0.2;
          ctx.fillStyle = lit ? 'rgba(255, 200, 100, 0.8)' : 'rgba(100, 100, 150, 0.3)';
          ctx.fillRect(bx + 4 + wx, gy - bh + 4 + wy, 6, 8);
        }
      }
      ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, gy - bh, bw, bh);
    }
  }

  draw_city_lights(ctx, W, H, scene, t) {
    const gy = H * 0.72;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 30; i++) {
      const lx = ((i * 47.3 + t * 10) % W);
      const ly = gy - 5 - ((i * 13.7) % 40);
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 15);
      glow.addColorStop(0, '#ffab00');
      glow.addColorStop(1, 'rgba(255, 171, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 15, ly - 15, 30, 30);
    }
    ctx.globalAlpha = 1.0;
  }

  draw_neon(ctx, W, H, scene, t) {
    ctx.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
    const cols = ['#ff00ff', '#00ffff', '#ff0066', '#00ff66', '#ffff00'];
    for (let i = 0; i < 5; i++) {
      const nx = ((i * 113.7 + t * 30) % W);
      const nh = 20 + Math.sin(t + i) * 10;
      ctx.fillStyle = cols[i];
      ctx.fillRect(nx, H * 0.3, 3, nh);
    }
    ctx.globalAlpha = 1.0;
  }

  draw_rain(ctx, W, H, scene, t) {
    ctx.strokeStyle = 'rgba(174, 194, 224, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 73.1 + t * 120) % W);
      const ry = ((i * 53.7 + t * 200) % H);
      const rlen = 15 + ((i * 37.1) % 15);
      const wind = scene.wind * 8;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + wind, ry + rlen);
      ctx.stroke();
    }
  }

  draw_puddles(ctx, W, H, scene, t) {
    ctx.globalAlpha = 0.15;
    const gy = H * 0.72;
    for (let i = 0; i < 8; i++) {
      const px = ((i * 127.1) % W);
      const py = gy + 10 + ((i * 67.3) % (H - gy - 20));
      const pr = 15 + ((i * 31.7) % 20);
      ctx.fillStyle = '#6868a8';
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  draw_lightning(ctx, W, H, scene, t) {
    if (Math.sin(t * 7) > 0.95) {
      ctx.fillStyle = 'rgba(200, 220, 255, ' + ((Math.sin(t * 7) - 0.95) * 3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const lx = W * 0.4;
      ctx.moveTo(lx, 0);
      let ly = 0;
      for (let i = 0; i < 8; i++) {
        ly += 20 + Math.random() * 30;
        ctx.lineTo(lx + (Math.random() - 0.5) * 40, ly);
      }
      ctx.stroke();
    }
  }

  draw_snowflakes(ctx, W, H, scene, t) {
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 73.1 + t * 50 + Math.sin(t * 0.5 + i) * 20) % W);
      const sy = ((i * 53.7 + t * 80) % H);
      const size = 2 + ((i * 17.3) % 3);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.4 + Math.sin(t + i * 2) * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_snow_ground(ctx, W, H, scene, t) {
    const gy = H * 0.78;
    const sg = ctx.createLinearGradient(0, gy, 0, H);
    sg.addColorStop(0, '#c0d8ee');
    sg.addColorStop(0.3, '#d8e8f8');
    sg.addColorStop(1, '#eef4fa');
    ctx.fillStyle = sg;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, gy);
    for (let x = 0; x <= W; x += 5) {
      ctx.lineTo(x, gy + Math.sin(x * 0.01 + t * 0.3) * 8 + Math.sin(x * 0.003) * 12);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  }

  draw_fireflies(ctx, W, H, scene, t) {
    for (let i = 0; i < scene.particleCount; i++) {
      const fx = ((i * 137.5 + Math.sin(t * 0.3 + i) * 30) % W);
      const fy = ((i * 97.3 + Math.cos(t * 0.2 + i * 1.5) * 20) % (H * 0.8));
      const g = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 3.7));
      const sz = 2 + Math.sin(t + i * 2) * 1;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8 + sz * 2);
      grad.addColorStop(0, 'rgba(200, 255, 100, ' + (g * 0.8) + ')');
      grad.addColorStop(0.5, 'rgba(150, 200, 50, ' + (g * 0.3) + ')');
      grad.addColorStop(1, 'rgba(100, 150, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, 8 + sz * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_sparkles(ctx, W, H, scene, t) {
    for (let i = 0; i < scene.particleCount; i++) {
      const sx = ((i * 157.3 + Math.sin(t * 0.5 + i * 1.3) * 50) % W);
      const sy = ((i * 113.7 + Math.cos(t * 0.4 + i * 2.1) * 40) % (H * 0.9));
      const g = 0.2 + 0.8 * Math.abs(Math.sin(t * 3 + i * 4.1));
      const sz = 1.5 + Math.sin(t * 2 + i * 3) * 1;
      const cols = ['#e040fb', '#7c4dff', '#ff69b4', '#00d4ff'];
      ctx.fillStyle = cols[i % 4];
      ctx.globalAlpha = g * 0.6;
      ctx.fillRect(sx + Math.cos(t * 2 + i) * sz * 2, sy - 0.5, (Math.cos(t * 2 + i + Math.PI) - Math.cos(t * 2 + i)) * sz * 2, 1);
      ctx.fillRect(sx - 0.5, sy + Math.sin(t * 2 + i) * sz * 2, 1, (Math.sin(t * 2 + i + Math.PI) - Math.sin(t * 2 + i)) * sz * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, sz * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_shooting_stars(ctx, W, H, scene, t) {
    if (Math.sin(t * 1.3) <= 0.7) return;
    const p = (Math.sin(t * 1.3) - 0.7) / 0.3;
    const sx = W * (0.8 - p * 0.7);
    const sy = H * (0.1 + p * 0.3);
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + (p * 0.5) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 40 * p, sy + 20 * p);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, ' + p + ')';
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  draw_fire(ctx, W, H, scene, t) {
    const gy = H * 0.72;
    for (let i = 0; i < 30; i++) {
      const fx = ((i * 73.1 + Math.sin(t * 2 + i) * 25) % W);
      const fh = 40 + ((i * 37.3) % 50) * (0.5 + Math.sin(t * 3 + i * 1.7) * 0.3);
      const fw = 6 + Math.sin(t * 4 + i * 2.3) * 3;
      const gr = ctx.createLinearGradient(fx, gy, fx, gy - fh);
      gr.addColorStop(0, 'rgba(255, 200, 50, ' + (0.6 + Math.sin(t + i) * 0.2) + ')');
      gr.addColorStop(0.4, 'rgba(255, 100, 0, ' + (0.5 + Math.sin(t * 2 + i) * 0.2) + ')');
      gr.addColorStop(0.7, 'rgba(200, 50, 0, ' + (0.3 + Math.sin(t * 2.5 + i) * 0.15) + ')');
      gr.addColorStop(1, 'rgba(100, 0, 0, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(fx - fw, gy);
      ctx.quadraticCurveTo(fx - fw * 0.5, gy - fh * 0.5, fx, gy - fh);
      ctx.quadraticCurveTo(fx + fw * 0.5, gy - fh * 0.5, fx + fw, gy);
      ctx.closePath();
      ctx.fill();
    }
  }

  draw_smoke(ctx, W, H, scene, t) {
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 15; i++) {
      const sx = ((i * 97.3 + t * 10) % W);
      const sy = H * 0.3 - ((i * 23.7 + t * 5) % (H * 0.3));
      const sr = 20 + ((i * 31.7) % 30) + Math.sin(t * 0.5 + i) * 10;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  draw_embers(ctx, W, H, scene, t) {
    for (let i = 0; i < 30; i++) {
      const ex = ((i * 73.1 + Math.sin(t * 0.5 + i * 1.3) * 30) % W);
      const ey = (H * 0.7 - (i * 23.7 + t * 30) % (H * 0.5));
      const g = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 3.7));
      ctx.fillStyle = 'rgba(255, ' + (150 + Math.floor(g * 50)) + ', 50, ' + (g * 0.6) + ')';
      ctx.beginPath();
      ctx.arc(ex, ey, 2 + g * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_birds(ctx, W, H, scene, t) {
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const bx = ((i * 113.7 + t * 15 + i * 30) % W);
      const by = H * 0.15 + ((i * 43.7) % (H * 0.15));
      const wf = Math.sin(t * 4 + i * 2) * 0.3 + 0.5;
      const ws = 8 + ((i * 7.3) % 5);
      ctx.beginPath();
      ctx.moveTo(bx - ws, by + wf * 4);
      ctx.quadraticCurveTo(bx, by, bx + ws, by + wf * 4);
      ctx.stroke();
    }
  }

  draw_seagulls(ctx, W, H, scene, t) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const bx = ((i * 127.3 + t * 20 + i * 40) % W);
      const by = H * 0.2 + ((i * 53.7) % (H * 0.12));
      const wf = Math.sin(t * 5 + i * 1.5);
      const ww = 10 + ((i * 11.3) % 6);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - ww, by - 5 - wf * 3, bx - ww * 0.5, by + 3);
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + ww, by - 5 + wf * 3, bx + ww * 0.5, by + 3);
      ctx.stroke();
    }
  }

  draw_butterflies(ctx, W, H, scene, t) {
    const cols = ['#ff69b4', '#ffa500', '#00d4ff', '#e040fb', '#98fb98', '#ffd700'];
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 97.3 + Math.sin(t * 0.7 + i * 2) * 60) % W);
      const by = H * 0.3 + Math.sin(t * 0.5 + i * 3) * 40;
      const wf = Math.abs(Math.sin(t * 6 + i * 2.5));
      ctx.fillStyle = cols[i];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(bx - 6, by, 5 * wf + 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(bx + 6, by, 5 * wf + 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx - 1, by - 3, 2, 6);
    }
  }

  draw_dragons(ctx, W, H, scene, t) {
    for (let i = 0; i < 2; i++) {
      const dx = W * (0.3 + i * 0.5) + Math.sin(t * 0.3 + i * 5) * 50;
      const dy = H * 0.15 + Math.sin(t * 0.2 + i * 3) * 20;
      ctx.fillStyle = 'rgba(100, 50, 120, ' + (0.4 + Math.sin(t + i) * 0.15) + ')';
      ctx.beginPath();
      ctx.ellipse(dx, dy, 25, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dx - 10, dy - 5);
      ctx.quadraticCurveTo(dx - 25, dy - 20 - Math.sin(t * 2 + i) * 5, dx - 5, dy);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dx - 10, dy + 5);
      ctx.quadraticCurveTo(dx - 25, dy + 20 + Math.sin(t * 2 + i) * 5, dx - 5, dy);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx + 22, dy - 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_castle(ctx, W, H, scene, t) {
    const cx = W * 0.5, gy = H * 0.7, ch = H * 0.35;
    ctx.fillStyle = 'rgba(80, 40, 120, 0.6)';
    ctx.fillRect(cx - 80, gy - ch, 160, ch);
    ctx.fillRect(cx - 100, gy - ch * 1.15, 30, ch * 1.15);
    ctx.fillRect(cx + 70, gy - ch * 1.15, 30, ch * 1.15);
    ctx.fillRect(cx - 40, gy - ch * 1.3, 80, ch * 1.3);
    ctx.fillStyle = 'rgba(100, 50, 140, 0.7)';
    ctx.fillRect(cx - 100, gy - ch * 1.15 - 8, 30, 8);
    ctx.fillRect(cx + 70, gy - ch * 1.15 - 8, 30, 8);
    ctx.fillRect(cx - 40, gy - ch * 1.3 - 10, 80, 10);
    ctx.fillStyle = 'rgba(255, 200, 100, ' + (0.6 + Math.sin(t * 0.5) * 0.2) + ')';
    ctx.fillRect(cx - 50, gy - ch * 0.7, 16, 24);
    ctx.fillRect(cx + 34, gy - ch * 0.7, 16, 24);
    ctx.fillRect(cx - 8, gy - ch * 0.4, 16, 24);
    ctx.fillStyle = '#1a002a';
    ctx.fillRect(cx - 12, gy - 40, 24, 40);
    ctx.beginPath();
    ctx.arc(cx, gy - 40, 15, Math.PI, 0);
    ctx.fill();
  }

  draw_flowers(ctx, W, H, scene, t) {
    const gy = H * 0.72;
    const cols = ['#ff69b4', '#ff1493', '#ffa500', '#ffd700', '#ff6347', '#da70d6'];
    for (let i = 0; i < 12; i++) {
      const fx = ((i * 73.1 + 20) % (W - 40)) + 20;
      const sway = Math.sin(t * 0.8 + i * 1.5) * 5;
      ctx.strokeStyle = '#4a8a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, gy);
      ctx.quadraticCurveTo(fx + sway, gy - 25, fx + sway * 0.5, gy - 35);
      ctx.stroke();
      ctx.fillStyle = cols[i % cols.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + Math.sin(t + i) * 0.1;
        ctx.beginPath();
        ctx.ellipse(fx + sway * 0.5 + Math.cos(a) * 5, gy - 38 + Math.sin(a) * 5, 4, 3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(fx + sway * 0.5, gy - 38, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_petals(ctx, W, H, scene, t) {
    const cols = ['#ff69b4', '#ffb7c5', '#ff1493', '#ffa500', '#ffd700'];
    for (let i = 0; i < 15; i++) {
      const px = ((i * 97.3 + t * 30 + Math.sin(t * 0.3 + i) * 20) % W);
      const py = ((i * 67.3 + t * 50) % H);
      const rot = Math.sin(t * 3 + i * 2) * 0.5;
      ctx.fillStyle = cols[i % 5];
      ctx.globalAlpha = 0.5;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  draw_nebula(ctx, W, H, scene, t) {
    ctx.globalAlpha = 0.3;
    const nc = [
      { x: W * 0.3, y: H * 0.3, r: 120, c: '#7c4dff' },
      { x: W * 0.7, y: H * 0.4, r: 100, c: '#e040fb' },
      { x: W * 0.5, y: H * 0.2, r: 80, c: '#448aff' },
    ];
    for (const n of nc) {
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, n.c);
      grad.addColorStop(0.5, n.c);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw_planets(ctx, W, H, scene, t) {
    const p1x = W * 0.2, p1y = H * 0.3, p1r = 30 + Math.sin(t * 0.3) * 2;
    ctx.fillStyle = 'rgba(200, 180, 255, 0.15)';
    ctx.beginPath();
    ctx.ellipse(p1x, p1y, p1r * 1.8, p1r * 0.3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(p1x - 5, p1y - 5, 0, p1x, p1y, p1r);
    g.addColorStop(0, '#8a6aff');
    g.addColorStop(0.7, '#5a3aff');
    g.addColorStop(1, '#3a1adf');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p1x, p1y, p1r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e040fb';
    ctx.beginPath();
    ctx.arc(W * 0.85 + Math.sin(t * 0.2) * 10, H * 0.25 + Math.cos(t * 0.3) * 5, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(W * 0.4 + Math.sin(t * 0.15) * 30, H * 0.15, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  draw_dust(ctx, W, H, scene, t) {
    for (let i = 0; i < 20; i++) {
      const dx = ((i * 73.1 + t * 15) % W);
      const dy = H * 0.3 + ((i * 53.7 + Math.sin(t + i * 2) * 20) % (H * 0.4));
      ctx.fillStyle = 'rgba(200, 180, 150, ' + (0.1 + Math.sin(t * 0.5 + i) * 0.05) + ')';
      ctx.beginPath();
      ctx.arc(dx, dy, 2 + Math.sin(t + i) * 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw_leaves(ctx, W, H, scene, t) {
    const cols = ['#4a8a3a', '#6aaa5a', '#8aca7a', '#3a7a2a'];
    for (let i = 0; i < 10; i++) {
      const lx = ((i * 83.1 + t * 20 + Math.sin(t * 0.4 + i) * 30) % W);
      const ly = ((i * 57.3 + t * 35) % H);
      const rot = Math.sin(t * 2 + i * 1.5) * 0.8;
      ctx.fillStyle = cols[i % 4];
      ctx.globalAlpha = 0.4;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  draw_ships(ctx, W, H, scene, t) {
    const wy = H * 0.65;
    for (let i = 0; i < 2; i++) {
      const sx = (W * (0.15 + i * 0.4) + Math.sin(t * 0.2 + i) * 20);
      const sy = wy + 5 + Math.sin(t * 2 + i) * 3;
      ctx.fillStyle = '#4a3520';
      ctx.beginPath();
      ctx.moveTo(sx - 20, sy);
      ctx.lineTo(sx - 15, sy + 8);
      ctx.lineTo(sx + 15, sy + 8);
      ctx.lineTo(sx + 20, sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - 25);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 200, 220, 0.6)';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 22);
      ctx.lineTo(sx + 18, sy - 5);
      ctx.lineTo(sx, sy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx, sy - 22);
      ctx.lineTo(sx - 14, sy - 5);
      ctx.lineTo(sx, sy - 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ============================================================
  // Utility methods
  // ============================================================

  saveVideo(id, prompt, duration, blob) {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      try {
        const tx = this.db.transaction('videos', 'readwrite');
        tx.objectStore('videos').put({ id, prompt, duration, createdAt: new Date().toISOString(), blob });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => { console.warn('DB save error:', e); resolve(); };
      } catch (e) {
        console.warn('DB save error:', e);
        resolve();
      }
    });
  }

  getAllVideos() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      try {
        const tx = this.db.transaction('videos', 'readonly');
        const req = tx.objectStore('videos').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        console.warn('DB read error:', e);
        resolve([]);
      }
    });
  }

  async loadHistory() {
    Object.values(this.videoUrls).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    this.videoUrls = {};

    const videos = await this.getAllVideos();
    videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const v of videos) {
      if (v.blob) {
        this.videoUrls[v.id] = URL.createObjectURL(v.blob);
      }
    }

    this.renderHistory(videos);
  }

  renderHistory(videos) {
    this.galleryGrid.innerHTML = '';

    if (!videos || videos.length === 0) {
      this.galleryGrid.innerHTML = '<div class="gallery-empty"><div class="empty-icon">🎬</div><h3>Пока нет видео</h3><p>Создай своё первое видео с помощью ИИ!</p></div>';
      return;
    }

    videos.forEach(v => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const date = new Date(v.createdAt);
      const dateStr = date.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      });

      const url = this.videoUrls[v.id];
      const videoHtml = url
        ? '<video src="' + url + '" controls playsinline preload="metadata"></video>'
        : '<div style="padding:40px;text-align:center;background:var(--bg-input);color:var(--text-muted)">🎥 Видео недоступно</div>';

      item.innerHTML = videoHtml +
        '<div class="gallery-item-info">' +
        '<div class="gallery-item-prompt">' + this.escapeHtml(v.prompt) + '</div>' +
        '<div class="gallery-item-date">' + dateStr + '</div>' +
        '<span class="gallery-item-status completed">✅ Готово</span></div>';

      this.galleryGrid.appendChild(item);
    });
  }

  showStatus(type, data) {
    this.statusSection.style.display = 'block';
    this.statusPending.style.display = 'none';
    this.statusCompleted.style.display = 'none';
    this.statusFailed.style.display = 'none';

    switch (type) {
      case 'pending':
        this.statusPending.style.display = 'block';
        break;
      case 'completed':
        this.statusCompleted.style.display = 'block';
        if (typeof data === 'string' && (data.startsWith('blob:') || data.startsWith('http') || data.startsWith('/videos/'))) {
          this.generatedVideo.src = data;
          if (data.startsWith('/videos/')) {
            this.downloadBtn.href = window.location.origin + data;
            this.downloadBtn.download = 'ai-video.mp4';
          } else {
            this.downloadBtn.href = data;
          }
        }
        break;
      case 'failed':
        this.statusFailed.style.display = 'block';
        this.errorMessage.textContent = typeof data === 'string' ? data : 'Не удалось сгенерировать видео';
        break;
    }

    setTimeout(() => {
      this.statusSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(icon, message) {
    this.toastIcon.textContent = icon;
    this.toastMessage.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.remove('show');
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VideoForgeApp();
});
