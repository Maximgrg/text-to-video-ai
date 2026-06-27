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
    this.totalGenerated = 0;
    this.init();
  }

  init() {
    this.initDB();
    this.loadUsage();
    this.loadHistory();
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
      this.promptCounter.textContent = `${this.promptInput.value.length} символов`;
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
        this.showToast('\u274C', 'Please enter some text');
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

    this.usageText.textContent = `\u{1F4CA} ${remaining}/${freeLimit}`;
    this.usageCounter.textContent = `${usage.count} / ${freeLimit}`;
    this.usageProgressFill.style.width = `${percent}%`;
  }

  checkUsage() {
    const today = new Date().toISOString().slice(0, 10);
    let usage;
    try { usage = JSON.parse(localStorage.getItem('vf_usage')); } catch (e) {}
    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0 };
    }
    if (usage.count >= 10) {
      this.showToast('\u{274C}', `Лимит исчерпан (10/10). Приобретите подписку!`);
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

  async handleGenerate(e) {
    e.preventDefault();
    const prompt = this.promptInput.value.trim();
    if (!prompt || prompt.length < 3) {
      this.showToast('\u{274C}', 'Введите описание видео (минимум 3 символа)');
      return;
    }
    if (!this.checkUsage()) return;

    this.generateBtn.classList.add('loading');
    this.generateBtn.disabled = true;
    this.showStatus('pending');

    const duration = parseInt(this.durationSelect.value);
    const jobId = 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    try {
      this.updateTips([
        '\u{1F3A8} ИИ анализирует запрос',
        '\u{1F3AC} Генерирует кадры',
        '\u{1F4A5} Собирает видео'
      ]);

      const result = await this.generateVideo(prompt, duration);

      await this.saveVideo(jobId, prompt, duration, result.blob);
      this.incrementUsage();
      this.loadUsage();

      const url = URL.createObjectURL(result.blob);
      this.videoUrls[jobId] = url;
      this.showStatus('completed', url);
      await this.loadHistory();
      this.showToast('\u2705', 'Видео готово!');
    } catch (err) {
      console.error('Generation error:', err);
      this.showStatus('failed', err.message || 'Неизвестная ошибка');
      this.showToast('\u{274C}', 'Ошибка генерации');
    } finally {
      this.generateBtn.classList.remove('loading');
      this.generateBtn.disabled = false;
    }
  }

  updateTips(tips) {
    if (this.tip1) this.tip1.textContent = tips[0] || '';
    if (this.tip2) this.tip2.textContent = tips[1] || '';
    if (this.tip3) this.tip3.textContent = tips[2] || '';
  }

  async generateVideo(prompt, duration) {
    const navigator = window.navigator;
    const MediaRecorderClass = window.MediaRecorder;
    
    if (typeof MediaRecorderClass === 'undefined') {
      throw new Error('MediaRecorder не поддерживается вашим браузером');
    }

    if (!HTMLCanvasElement.prototype.captureStream) {
      throw new Error('Canvas.captureStream не поддерживается в вашем браузере');
    }

    const fps = 10;
    const totalFrames = duration * fps;
    const W = 1280;
    const H = 720;

const mimeType = MediaRecorderClass.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorderClass.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : MediaRecorderClass.isTypeSupported('video/webm')
          ? 'video/webm'
          : (console.warn('⚠️ Поддерживается только кодировка VP9 или VP8. Запись будет некачественной'), 'video/webm');

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const stream = canvas.captureStream(fps);

    const recorder = new MediaRecorderClass(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {};

    const frames = [];

    const actionScene = this.parseActionPrompt(prompt);

    for (let f = 0; f < totalFrames; f++) {
      const t = totalFrames > 1 ? f / (totalFrames - 1) : 0;
      this.renderActionFrame(ctx, W, H, prompt, actionScene, t, f, totalFrames, duration);
      frames.push(ctx.getImageData(0, 0, W, H));

      if (f % 10 === 0 || f === totalFrames - 1) {
        this.updateTips([
          '\u{1F3A8} Рендеринг кадров...',
          `\u{1F5BC} ${f + 1}/${totalFrames}`,
          '\u23F3 Продолжаем...'
        ]);
      }
    }

    this.updateTips([
      '\u{1F3A5} Сборка видео...',
      '\u2699\uFE0F Кодирование',
      '\u23F3 Финальный этап'
    ]);

    return new Promise((resolve, reject) => {
      let frameIndex = 0;
      let resolveTimeout;

      function renderFrame() {
        if (frameIndex < frames.length) {
          ctx.putImageData(frames[frameIndex], 0, 0);
          frameIndex++;
          setTimeout(renderFrame, 1000 / fps);
        } else {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve({ blob });
        }
      }

      function stopRecording() {
        clearTimeout(resolveTimeout);
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 100);
      }

      recorder.onerror = (e) => {
        clearTimeout(resolveTimeout);
        console.error('Recorder error:', e);
        reject(new Error('Ошибка MediaRecorder'));
      };

      recorder.start(1000 / fps);
      resolveTimeout = setTimeout(stopRecording, (totalFrames + 10) * 1000 / fps);

      setTimeout(renderFrame, 10);
    });
  }

  parseActionPrompt(prompt) {
    const actions = [];

    const addAction = (type, x, y, w, h, params = {}) => {
      actions.push({ type, x, y, w, h, params, startFrame: Date.now() });
    };

    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('закат') || lowerPrompt.includes('восход солнца')) {
      addAction('sunset', 0, 0, W, H, { color: '#FF6B35', time: Math.random() * 0.8 });
    }
    if (lowerPrompt.includes('дождь') || lowerPrompt.includes('снег')) {
      addAction('rain', 0, 0, W, H, { intensity: 20 });
    }
    if (lowerPrompt.includes('волн') || lowerPrompt.includes('океан')) {
      addAction('wave', 0, H * 0.3, W, H * 0.5);
    }
    if (lowerPrompt.includes('волк') || lowerPrompt.includes('волч')) {
      addAction('wolf', Math.random() * W * 0.8, Math.random() * H * 0.8, W * 0.15, H * 0.15);
    }
    if (lowerPrompt.includes('море') || lowerPrompt.includes('плыть')) {
      addAction('boat', 0, H * 0.7, W * 0.8, H * 0.3);
    }
    if (lowerPrompt.includes('вулкан') || lowerPrompt.includes('огонь')) {
      addAction('fire', 0, 0, W, H, { intensity: 30 });
    }

    if (actions.length === 0) {
      addAction('rain', 0, 0, W, H, { intensity: 10 });
    }

    return { actions };
  }

  renderActionFrame(ctx, W, H, prompt, actionScene, t, f, totalFrames, duration) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d0d1a');
    grad.addColorStop(0.4 + Math.sin(t * Math.PI * 2) * 0.04, '#1a1a3e');
    grad.addColorStop(1, '#2d1b4e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(108, 99, 255, 0.05)';
    ctx.lineWidth = 2;
    for (let w = 0; w < 3; w++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H * 0.5
          + Math.sin(x * 0.008 + t * 6 + w * 2.1) * 70
          + Math.sin(x * 0.015 + t * 4 + w * 1.3) * 35;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#7c73ff';
    ctx.font = 'bold 48px "Inter", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('VideoForge AI', W / 2, 30);

    ctx.fillStyle = 'rgba(120, 120, 200, 0.6)';
    ctx.font = '20px "Inter", Arial, sans-serif';
    ctx.fillText('Generated by AI', W / 2, 90);

    ctx.strokeStyle = 'rgba(108, 99, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 60, 125);
    ctx.lineTo(W / 2 + 60, 125);
    ctx.stroke();

    this.renderWeatherEffects(ctx, W, H, t);

    this.drawActionElements(ctx, W, H, actionScene, t, f, totalFrames, duration);

    ctx.fillStyle = '#ffffff';
    ctx.font = '32px "Inter", Arial, sans-serif';
    const textY = H - 60;
    this.wrapText(ctx, prompt, W / 2, textY, W - 120, 48);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${duration}s | ${f + 1}/${totalFrames}`, W - 20, H - 10);
  }

  drawActionElements(ctx, W, H, actionScene, t, f, totalFrames, duration) {
    const scene = actionScene.actions;

    for (const element of scene) {
      const elementX = this.easeInOut(element.x, element.x + (element.w || W), t);
      const elementY = this.easeInOut(element.y, element.y + (element.h || H), t);
      const elementSize = this.easeInOut(0.5, 1.0, Math.sin(t * 2) * 0.5 + 0.5);

      ctx.save();

      switch (element.type) {
        case 'wave':
          this.drawWave(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t);
          break;
        case 'boat':
          this.drawBoat(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t);
          break;
        case 'sunset':
          this.drawSunset(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t, element.params);
          break;
        case 'rain':
          this.drawRain(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t, element.params);
          break;
        case 'wolf':
          this.drawWolf(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t);
          break;
        case 'fire':
          this.drawFire(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, t, element.params);
          break;
        default:
          this.drawElement(ctx, elementX, elementY, element.w * elementSize, element.h * elementSize, element.params);
      }

      ctx.restore();
    }
  }

  easeInOut(start, end, t) {
    const ease = t * t * (3 - 2 * t);
    return start + (end - start) * ease;
  }

  drawWave(ctx, x, y, w, h, t) {
    ctx.strokeStyle = 'rgba(0, 119, 190, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 100; i++) {
      const height = Math.sin(t * 2 + i * 0.1) * 30 + 50;
      const xPos = x + i * w * 0.01;
      if (i === 0) ctx.moveTo(xPos, y + h);
      else ctx.lineTo(xPos, y + h - height);
    }
    ctx.stroke();
  }

  drawBoat(ctx, x, y, w, h, t) {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y + h * 0.3, w, h * 0.3);

    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + w * 0.7, y + h * 0.4, w * 0.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FF4444';
    ctx.font = '12px "Inter"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('⛵', x + w * 0.5, y + h * 0.3);
  }

  drawSunset(ctx, x, y, w, h, t, params) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, '#FF4500');
    gradient.addColorStop(0.5, '#FFD700');
    gradient.addColorStop(1, '#8B0000');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(x + Math.random() * w, y + Math.random() * h, Math.random() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRain(ctx, x, y, w, h, t, params) {
    ctx.fillStyle = 'rgba(174, 194, 224, 0.3)';
    for (let i = 0; i < 30; i++) {
      const dropX = x + Math.random() * w;
      const dropY = y + Math.random() * h;
      const dropLength = Math.random() * 20 + 10;
      ctx.beginPath();
      ctx.moveTo(dropX, dropY);
      ctx.lineTo(dropX, dropY + dropLength);
      ctx.strokeStyle = 'rgba(174, 194, 224, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawWolf(ctx, x, y, w, h, t) {
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h * 0.6);

    ctx.fillStyle = '#666';
    ctx.fillRect(x + w * 0.3, y + h * 0.6, w * 0.4, h * 0.2);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 8px "Inter"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🐺', x + w * 0.5, y + h * 0.8);
  }

  drawFire(ctx, x, y, w, h, t, params) {
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgb(${255 - i * 10}, ${Math.max(0, 150 - i * 8)}, ${Math.max(0, 50 - i * 2)})`;
      const flameX = x + Math.random() * w;
      const flameH = Math.random() * 30 + 10;
      ctx.fillRect(flameX, y - flameH, 5, flameH);
    }
  }

  drawElement(ctx, x, y, w, h, params) {
    ctx.fillStyle = 'rgba(108, 99, 255, 0.3)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  renderWeatherEffects(ctx, W, H, t) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = '12px "Inter"';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`D∗${t.toFixed(2).replace('.', '')}`, W - 10, 20);
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = '';
    let currentY = y;
    for (const word of words) {
      if (!word) continue;
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, currentY);
  };

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    // Handle Cyrillic and any other Unicode text
    const words = text.split(/\s+/);
    let line = '';
    let currentY = y;
    for (const word of words) {
      if (!word) continue;
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, currentY);
  }

  saveVideo(id, prompt, duration, blob) {
    return new Promise((resolve, reject) => {
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
      this.galleryGrid.innerHTML = `
        <div class="gallery-empty">
          <div class="empty-icon">\u{1F3AC}</div>
          <h3>Пока нет видео</h3>
          <p>Создай своё первое видео с помощью ИИ!</p>
        </div>`;
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
        ? `<video src="${url}" controls playsinline preload="metadata"></video>`
        : `<div style="padding:40px;text-align:center;background:var(--bg-input);color:var(--text-muted)">\u{1F3A5} Видео недоступно</div>`;

      item.innerHTML = `
        ${videoHtml}
        <div class="gallery-item-info">
          <div class="gallery-item-prompt">${this.escapeHtml(v.prompt)}</div>
          <div class="gallery-item-date">${dateStr}</div>
          <span class="gallery-item-status completed">\u2705 Готово</span>
        </div>`;

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
        if (typeof data === 'string' && data.startsWith('blob:')) {
          this.generatedVideo.src = data;
          this.downloadBtn.href = data;
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
