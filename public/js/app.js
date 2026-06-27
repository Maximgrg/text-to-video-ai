// ============================
// VideoForge - AI Video Generator
// Frontend Application
// ============================

class VideoForgeApp {
  constructor() {
    this.currentJobId = null;
    this.pollInterval = null;

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

    this.init();
  }

  init() {
    this.loadUsage();
    this.loadHistory();
    this.bindEvents();
  }

  bindEvents() {
    // Счётчик символов
    this.promptInput.addEventListener('input', () => {
      const len = this.promptInput.value.length;
      this.promptCounter.textContent = `${len} символов`;
    });

    // Загрузка изображения
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

    // Удаление изображения
    this.removeFileBtn.addEventListener('click', () => {
      this.imageInput.value = '';
      this.filePreview.style.display = 'none';
      this.fileUpload.querySelector('.file-upload-content').style.display = 'block';
    });

    // Отправка формы
    this.form.addEventListener('submit', (e) => this.handleGenerate(e));
  }

  async loadUsage() {
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      this.updateUsageUI(data);
    } catch (err) {
      console.error('Ошибка загрузки использования:', err);
    }
  }

  async loadHistory() {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      this.renderHistory(data.jobs || []);
    } catch (err) {
      console.error('Ошибка загрузки истории:', err);
    }
  }

  updateUsageUI(usage) {
    if (!usage) return;

    const { usedToday, remaining, freeLimit } = usage;
    const percent = Math.min((usedToday / freeLimit) * 100, 100);

    this.usageText.textContent = `📊 ${remaining}/${freeLimit}`;
    this.usageCounter.textContent = `${usedToday} / ${freeLimit}`;
    this.usageProgressFill.style.width = `${percent}%`;
  }

  async handleGenerate(e) {
    e.preventDefault();

    const prompt = this.promptInput.value.trim();
    if (!prompt || prompt.length < 3) {
      this.showToast('❌', 'Введите описание видео (минимум 3 символа)');
      return;
    }

    // Проверка лимита
    try {
      const usageRes = await fetch('/api/usage');
      const usage = await usageRes.json();
      if (!usage.canGenerate) {
        this.showToast('❌', `Лимит исчерпан (${usage.freeLimit}/${usage.freeLimit}). Приобретите подписку!`);
        return;
      }
    } catch (err) {
      console.error('Ошибка проверки лимита:', err);
    }

    // UI: состояние загрузки
    this.generateBtn.classList.add('loading');
    this.generateBtn.disabled = true;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('duration', this.durationSelect.value);

    if (this.imageInput.files[0]) {
      formData.append('image', this.imageInput.files[0]);
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Ошибка сервера');
      }

      this.currentJobId = data.jobId;

      // Показываем статус
      this.showStatus('pending');
      this.updateUsageUI(data.usage);

      // Начинаем отслеживание
      this.startPolling(data.jobId);

    } catch (err) {
      this.showToast('❌', err.message);
      this.generateBtn.classList.remove('loading');
      this.generateBtn.disabled = false;
    }
  }

  async startPolling(jobId) {
    // Пробуем получить результат каждые 5 секунд
    let attempts = 0;
    const maxAttempts = 30; // 2.5 минуты макс

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        const job = data.job;

        if (!job) {
          this.showStatus('failed', 'Работа не найдена');
          this.generateBtn.classList.remove('loading');
          this.generateBtn.disabled = false;
          return;
        }

        if (job.status === 'completed') {
          this.showStatus('completed', job.videoUrl);
          this.generateBtn.classList.remove('loading');
          this.generateBtn.disabled = false;
          this.loadHistory();
          return;
        }

        if (job.status === 'failed') {
          this.showStatus('failed', job.error || 'Ошибка генерации видео');
          this.generateBtn.classList.remove('loading');
          this.generateBtn.disabled = false;
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          this.showStatus('failed', 'Превышено время ожидания. Попробуйте ещё раз.');
          this.generateBtn.classList.remove('loading');
          this.generateBtn.disabled = false;
        }

      } catch (err) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          this.showStatus('failed', err.message);
          this.generateBtn.classList.remove('loading');
          this.generateBtn.disabled = false;
        }
      }
    };

    setTimeout(poll, 3000);
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
        if (typeof data === 'string' && data.startsWith('http')) {
          this.generatedVideo.src = data;
          this.downloadBtn.href = data;
        } else if (data) {
          const url = typeof data === 'string' ? data : data.videoUrl;
          this.generatedVideo.src = url;
          this.downloadBtn.href = url;
        }
        this.showToast('✅', 'Видео готово!');
        break;

      case 'failed':
        this.statusFailed.style.display = 'block';
        this.errorMessage.textContent = typeof data === 'string' ? data : 'Не удалось сгенерировать видео';
        this.showToast('❌', 'Ошибка генерации');
        break;
    }

    // Плавный скролл к статусу
    setTimeout(() => {
      this.statusSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  renderHistory(jobs) {
    if (!jobs || jobs.length === 0) return;

    const existingItems = this.galleryGrid.querySelectorAll('.gallery-item');
    if (existingItems.length > 0) {
      // Обновляем только если есть новые
      const emptyState = this.galleryGrid.querySelector('.gallery-empty');
      if (emptyState) emptyState.remove();
    }

    // Очищаем и рендерим заново
    this.galleryGrid.innerHTML = '';

    const filtered = jobs.filter(j => j.status === 'completed');

    if (filtered.length === 0) {
      this.galleryGrid.innerHTML = `
        <div class="gallery-empty">
          <div class="empty-icon">🎬</div>
          <h3>Пока нет видео</h3>
          <p>Создай своё первое видео с помощью ИИ!</p>
        </div>
      `;
      return;
    }

    filtered.forEach(job => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const date = new Date(job.createdAt);
      const dateStr = date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });

      item.innerHTML = `
        ${job.videoUrl ? `
          <video src="${job.videoUrl}" controls playsinline preload="metadata"></video>
        ` : `
          <div style="padding:40px;text-align:center;background:var(--bg-input);color:var(--text-muted)">
            🎥 Видео недоступно
          </div>
        `}
        <div class="gallery-item-info">
          <div class="gallery-item-prompt">${this.escapeHtml(job.prompt)}</div>
          <div class="gallery-item-date">${dateStr}</div>
          <span class="gallery-item-status ${job.status}">
            ${job.status === 'completed' ? '✅ Готово' : job.status === 'failed' ? '❌ Ошибка' : '⏳ В обработке'}
          </span>
        </div>
      `;

      this.galleryGrid.appendChild(item);
    });
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

    setTimeout(() => {
      this.toast.classList.remove('show');
    }, 3000);
  }
}

// ============================
// Инициализация
// ============================
document.addEventListener('DOMContentLoaded', () => {
  new VideoForgeApp();
});
