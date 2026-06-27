const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, 'data');
const USAGE_FILE = path.join(STORAGE_DIR, 'usage.json');
const JOBS_FILE = path.join(STORAGE_DIR, 'jobs.json');

// Лимит бесплатных видео в день
const FREE_DAILY_LIMIT = 10;

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(USAGE_FILE)) {
    fs.writeFileSync(USAGE_FILE, JSON.stringify({}), 'utf8');
  }
  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify([]), 'utf8');
  }
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getUsage() {
  ensureStorage();
  const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  return data;
}

function getTodayUsage() {
  const usage = getUsage();
  const todayKey = getTodayKey();
  return usage[todayKey] || 0;
}

function incrementUsage() {
  ensureStorage();
  const usage = getUsage();
  const todayKey = getTodayKey();
  usage[todayKey] = (usage[todayKey] || 0) + 1;
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf8');
  return usage[todayKey];
}

function getRemainingFreeVideos() {
  const used = getTodayUsage();
  return Math.max(0, FREE_DAILY_LIMIT - used);
}

function canGenerateFree() {
  return getRemainingFreeVideos() > 0;
}

function addJob(job) {
  ensureStorage();
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  jobs.unshift(job);
  // Храним последние 100 работ
  if (jobs.length > 100) jobs.pop();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  return job;
}

function updateJob(jobId, updates) {
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  const index = jobs.findIndex(j => j.id === jobId);
  if (index !== -1) {
    jobs[index] = { ...jobs[index], ...updates };
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
    return jobs[index];
  }
  return null;
}

function getJob(jobId) {
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  return jobs.find(j => j.id === jobId) || null;
}

function getJobs(limit = 10) {
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  return jobs.slice(0, limit);
}

module.exports = {
  FREE_DAILY_LIMIT,
  getTodayUsage,
  getRemainingFreeVideos,
  canGenerateFree,
  incrementUsage,
  addJob,
  updateJob,
  getJob,
  getJobs
};
