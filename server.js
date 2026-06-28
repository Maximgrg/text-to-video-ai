require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const storage = require('./storage');
const { generateVideo } = require('./local-generator');

const app = express();
const PORT = process.env.PORT || 3000;
const CIVITAI_API_KEY = process.env.CIVITAI_API_KEY || '';
const ORCHESTRATION_URL = 'https://orchestration.civitai.com/v2/consumer/workflows';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Настройка multer для загрузки изображений
const upload = multer({
  dest: path.join(__dirname, 'uploads/'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат изображения. Используйте JPEG, PNG, WebP или GIF.'));
    }
  }
});

function ensureCivitaiKey(req, res, next) {
  // If USE_CIVITAI=true but no API key, still allow local generation as fallback
  if (process.env.USE_CIVITAI === 'true' && (!CIVITAI_API_KEY || CIVITAI_API_KEY === 'your_civitai_api_key_here')) {
    console.warn('[Civitai] USE_CIVITAI=true но API ключ не настроен. Используется локальная генерация.');
  }
  next();
}

// ============================
// API Routes
// ============================

// Получить статус сервера и режима генерации
app.get('/api/status', (req, res) => {
  const aiMode = process.env.USE_CIVITAI === 'true';
  res.json({
    aiMode,
    apiKeyConfigured: aiMode && !!CIVITAI_API_KEY && CIVITAI_API_KEY !== 'your_civitai_api_key_here',
    mode: aiMode ? 'civitai' : 'local',
    message: aiMode
      ? '🎬 Режим AI-генерации через Civitai API'
      : '🎬 Режим локальной генерации',
    setupUrl: 'https://civitai.com/user/account'
  });
});

// Получить статус использования
app.get('/api/usage', (req, res) => {
  const todayUsage = storage.getTodayUsage();
  const remaining = storage.getRemainingFreeVideos();
  res.json({
    freeLimit: storage.FREE_DAILY_LIMIT,
    usedToday: todayUsage,
    remaining: remaining,
    canGenerate: remaining > 0
  });
});

// Получить историю работ
app.get('/api/jobs', (req, res) => {
  const jobs = storage.getJobs(20);
  res.json({ jobs });
});

// Получить статус конкретной работы
app.get('/api/jobs/:id', (req, res) => {
  const job = storage.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Работа не найдена' });
  }
  res.json({ job });
});

// Сгенерировать видео из текста (и опционально изображения)
app.post('/api/generate', ensureCivitaiKey, upload.single('image'), async (req, res) => {
  try {
    // Проверка бесплатного лимита
    if (!storage.canGenerateFree()) {
      return res.status(429).json({
        error: 'Достигнут дневной лимит',
        message: `Вы использовали все ${storage.FREE_DAILY_LIMIT} бесплатных видео сегодня. Приобретите подписку для продолжения.`,
        usage: {
          usedToday: storage.getTodayUsage(),
          freeLimit: storage.FREE_DAILY_LIMIT
        }
      });
    }

    const { prompt, duration = 5 } = req.body;
    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Пожалуйста, введите описание видео (минимум 3 символа)' });
    }

    const jobId = uuidv4();
    const imagePath = req.file ? req.file.path : null;

    // Создаём запись о работе
    const job = storage.addJob({
      id: jobId,
      prompt: prompt.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      hasImage: !!imagePath,
      videoUrl: null,
      error: null,
    });

    // Инкрементируем счётчик использования
    storage.incrementUsage();

    if (process.env.USE_CIVITAI === 'true' && CIVITAI_API_KEY && CIVITAI_API_KEY !== 'your_civitai_api_key_here') {
      // Отправляем задачу в Civitai AI
      generateVideoWithCivitai(jobId, prompt.trim(), imagePath, duration);

      res.json({
        success: true,
        jobId,
        message: 'Видео генерируется. Это может занять 1-2 минуты.',
        usage: {
          usedToday: storage.getTodayUsage(),
          remaining: storage.getRemainingFreeVideos(),
          freeLimit: storage.FREE_DAILY_LIMIT
        }
      });
    } else {
      // Локальная генерация видео
      storage.updateJob(jobId, { status: 'processing' });

      try {
        const result = await generateVideo(prompt.trim(), parseInt(duration) || 5);

        storage.updateJob(jobId, {
          status: 'completed',
          videoUrl: result.videoUrl
        });

        res.json({
          success: true,
          jobId,
          message: 'Видео готово!',
          usage: {
            usedToday: storage.getTodayUsage(),
            remaining: storage.getRemainingFreeVideos(),
            freeLimit: storage.FREE_DAILY_LIMIT
          }
        });
      } catch (genError) {
        storage.updateJob(jobId, {
          status: 'failed',
          error: genError.message
        });

        res.json({
          success: true,
          jobId,
          message: 'Ошибка генерации видео.',
          usage: {
            usedToday: storage.getTodayUsage(),
            remaining: storage.getRemainingFreeVideos(),
            freeLimit: storage.FREE_DAILY_LIMIT
          }
        });
      }
    }

  } catch (error) {
    console.error('Ошибка генерации:', error);
    res.status(500).json({
      error: 'Ошибка при запуске генерации видео',
      details: error.message
    });
  }
});

// Webhook для получения результата от Civitai (если поддерживается)
app.post('/api/webhook', express.json(), (req, res) => {
  const { jobId, status, output } = req.body;
  if (jobId) {
    const updates = { status };
    if (status === 'completed' && output) {
      updates.videoUrl = output.videoUrl || output;
    }
    if (status === 'failed') {
      updates.error = req.body.error || 'Generation failed';
    }
    storage.updateJob(jobId, updates);
  }
  res.sendStatus(200);
});

// ============================
// Civitai API Integration
// ============================

async function generateVideoWithCivitai(jobId, prompt, imagePath, duration) {
  try {
    // Обновляем статус
    storage.updateJob(jobId, { status: 'processing' });

    // Формируем запрос к Civitai Orchestration API
    const workflow = {
      steps: [{
        $type: "videoGen",
        input: {
          engine: "wan",
          version: "v2.6",
          provider: "fal",
          operation: imagePath ? "image-to-video" : "text-to-video",
          prompt: prompt,
          duration: Math.min(Math.max(duration, 5), 10),
          resolution: "720p"
        }
      }]
    };

    // Если есть изображение, добавляем его в workflow
    if (imagePath) {
      // ⚠️ Примечание: Civitai API ожидает публичный URL изображения или AIR URN.
      // В реальном приложении изображение нужно загрузить на хостинг (например, S3)
      // и передать URL. Для демонстрации пробуем отправить image-to-video запрос,
      // но для работы требуется дополнительная настройка хостинга изображений.
      console.log(`[${jobId}] Изображение загружено: ${imagePath}`);
      workflow.steps[0].input.imagePath = imagePath;
      // В production: загрузите изображение на Civitai через их API загрузки,
      // затем используйте полученный URL/UUID в поле imageUrl запроса.
    }

    console.log(`[${jobId}] Отправка запроса в Civitai:`, JSON.stringify(workflow, null, 2));

    const response = await fetch(ORCHESTRATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CIVITAI_API_KEY}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(workflow)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Civitai API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`[${jobId}] Ответ от Civitai:`, JSON.stringify(result, null, 2));

    // В зависимости от ответа Civitai обрабатываем результат
    // Если ответ содержит URL видео сразу
    if (result.output && result.output.videoUrl) {
      storage.updateJob(jobId, {
        status: 'completed',
        videoUrl: result.output.videoUrl
      });
    } else if (result.workflowId || result.id) {
      // Если это асинхронная задача, сохраняем ID для отслеживания
      const remoteId = result.workflowId || result.id;
      storage.updateJob(jobId, {
        status: 'processing',
        remoteId: remoteId,
        statusCheckUrl: result.statusUrl || null
      });

      // Пробуем получить результат через некоторое время (polling)
      setTimeout(() => pollCivitaiJob(jobId, remoteId), 15000);
    } else {
      // Если результат пришёл в другом формате
      storage.updateJob(jobId, {
        status: 'completed',
        videoUrl: result.videoUrl || result.output || result
      });
    }

  } catch (error) {
    console.error(`[${jobId}] Ошибка Civitai:`, error.message);
    storage.updateJob(jobId, {
      status: 'failed',
      error: error.message
    });
  }
}

async function pollCivitaiJob(jobId, remoteId, retries = 12) {
  try {
    const response = await fetch(`${ORCHESTRATION_URL}/${remoteId}/status`, {
      headers: {
        'Authorization': `Bearer ${CIVITAI_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (retries > 0) {
        setTimeout(() => pollCivitaiJob(jobId, remoteId, retries - 1), 10000);
      } else {
        storage.updateJob(jobId, {
          status: 'failed',
          error: 'Превышено время ожидания генерации видео'
        });
      }
      return;
    }

    const result = await response.json();

    if (result.status === 'completed' || result.status === 'succeeded') {
      storage.updateJob(jobId, {
        status: 'completed',
        videoUrl: result.output?.videoUrl || result.output?.video || result.result
      });
    } else if (result.status === 'failed' || result.status === 'error') {
      storage.updateJob(jobId, {
        status: 'failed',
        error: result.error || 'Ошибка генерации видео'
      });
    } else if (retries > 0) {
      // Всё ещё обрабатывается
      setTimeout(() => pollCivitaiJob(jobId, remoteId, retries - 1), 10000);
    } else {
      storage.updateJob(jobId, {
        status: 'failed',
        error: 'Превышено время ожидания'
      });
    }

  } catch (error) {
    if (retries > 0) {
      setTimeout(() => pollCivitaiJob(jobId, remoteId, retries - 1), 10000);
    } else {
      storage.updateJob(jobId, {
        status: 'failed',
        error: error.message
      });
    }
  }
}

// ============================
// Запуск polling для активных задач при старте
// ============================

function resumePendingJobs() {
  const jobs = storage.getJobs(100);
  for (const job of jobs) {
    if (job.status === 'processing' && job.remoteId) {
      console.log(`[Resume] Возобновляем проверку задачи ${job.id} (remote: ${job.remoteId})`);
      setTimeout(() => pollCivitaiJob(job.id, job.remoteId), 5000);
    }
  }
}

// Создаём папки для данных и загрузок
const fs = require('fs');
const dirs = ['data', 'uploads', 'videos'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Копируем .env.example в .env при первом запуске
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('📝 Создан файл .env из .env.example. Отредактируйте его, добавив ваш CIVITAI_API_KEY.');
}

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     🎬 AI Text-to-Video Generator               ║
║     Сервер запущен на порту ${PORT}               ║
║     Откройте: http://localhost:${PORT}             ║
╚══════════════════════════════════════════════════╝
  `);
  
  if (process.env.USE_CIVITAI === 'true') {
    if (CIVITAI_API_KEY && CIVITAI_API_KEY !== 'your_civitai_api_key_here') {
      console.log('🤖 Режим: Civitai AI API (настоящая AI-генерация видео)');
      resumePendingJobs();
    } else {
      console.warn('⚠️  USE_CIVITAI=true но CIVITAI_API_KEY не настроен!');
      console.warn('   Получите бесплатный API ключ: https://civitai.com/user/account');
      console.warn('   Затем отредактируйте файл .env');
    }
  } else {
    console.log('🔧 Режим: Локальная генерация (canvas/Jimp + ffmpeg)');
    console.log('   Чтобы использовать Civitai AI API, установите USE_CIVITAI=true в .env');
    console.log('   и укажите CIVITAI_API_KEY (получить: https://civitai.com/user/account)');
  }
});
