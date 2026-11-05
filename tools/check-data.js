// Перевірка questions.js і папки img/ без браузера: node tools/check-data.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const questions = vm.runInNewContext(fs.readFileSync(path.join(root, 'questions.js'), 'utf8') + ';questions');
const errors = [], used = new Set(), ids = new Set(), ordinals = new Set(), batches = {};
const fail = (q, msg) => errors.push(`id=${q.id}: ${msg}`);

for (const q of questions) {
  if (!Number.isInteger(q.id) || q.id < 1) fail(q, 'id має бути додатним цілим числом');
  if (ids.has(q.id)) fail(q, 'id повторюється');
  ids.add(q.id);
  if (typeof q.question !== 'string' || !q.question.trim()) fail(q, 'порожній текст питання');
  if (!Array.isArray(q.answers) || q.answers.length < 2 || q.answers.some(a => typeof a !== 'string' || !a.trim())) fail(q, 'потрібно щонайменше 2 непорожні відповіді');
  else if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.answers.length) fail(q, `correct=${q.correct} поза межами відповідей (0…${q.answers.length - 1})`);
  if (!/^batch\d+$/.test(q.batch)) fail(q, `неправильна порція "${q.batch}"`);
  else batches[q.batch] = (batches[q.batch] || 0) + 1;
  if (!Number.isInteger(q.batchOrdinal) || ordinals.has(q.batch + '#' + q.batchOrdinal)) fail(q, `batchOrdinal ${q.batchOrdinal} відсутній або повторюється в ${q.batch}`);
  ordinals.add(q.batch + '#' + q.batchOrdinal);
  if (!q.original) fail(q, 'немає original');
  if (!Array.isArray(q.notes)) fail(q, 'notes має бути масивом');
  for (const src of [q.diagram, q.original, ...(q.notes || [])]) {
    if (!src) continue;
    if (!fs.existsSync(path.join(root, src))) fail(q, `файл не знайдено: ${src}`);
    used.add(path.basename(src));
  }
}
for (const file of fs.readdirSync(path.join(root, 'img'))) if (!used.has(file)) errors.push(`img/${file}: файл ніде не використовується`);

const summary = Object.entries(batches).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([k, n]) => `${k}: ${n}`).join(', ');
console.log(`Питань: ${questions.length} (${summary}); картинок: ${used.size}`);
if (errors.length) { console.error(`Помилок: ${errors.length}\n` + errors.join('\n')); process.exit(1); }
console.log('OK');
