# Auto Exam — тренажер ПДР

Статичний сайт без збірки й залежностей. Деплой: GitHub Pages з гілки `main` (корінь) → https://marynashavlak.github.io/auto-exam/. Кожен push у `main` одразу публікується, тому нові функції робимо в окремих гілках.

## Файли

- `index.html` — лише розмітка: шапка, картки наборів (`.batch-card[data-scope]`), статистика, порожній `<main id="panel">`.
- `styles.css` — усі стилі. Блоки додавались шарами під кожну функцію, тому деякі правила (`.batch-cards`) перевизначаються нижче.
- `app.js` — уся логіка, чистий JS без модулів (глобальні `const`/функції).
- `questions.js` — `const questions=[...]`, одне питання на рядок. Шукати питання: `grep '"id":42,' questions.js`.
- `img/` — картинки WebP: `q042-diagram.webp`, `q042-original.webp`, `q042-note-1.webp`.

Скрипти підключені звичайними `<script src>` (не `fetch`), щоб сайт відкривався й із диска через `file://`.

## Формат питання

`{id, question, answers[], correct, diagram, original, notes[], batch, batchOrdinal}`
- `correct` — індекс у `answers` (з 0). У UI показується оригінальний номер `index+1`, бо є варіанти типу «1 і 2».
- `diagram` — `img/...` або `null` (тоді без картинки). `original` є завжди, показується після відповіді. `notes` — додаткові пояснення (є лише в кількох питаннях).
- `id` — 1…219 з пропусками; на `id` прив'язані закладки й статистика користувачів, тому їх не перенумеровувати.
- `batch` — `batch1`…`batch5`, `batchOrdinal` — номер у порції.

## Логіка (`app.js`)

- Набори (scope): `batch1..5`, `all`, `saved`, `mistakes`, `mix:batch1+batch3`. Списки в `SCOPE_IDS`, назви в `SCOPE_NAMES`; мікси створює `ensureMixedScope`.
- Сесія набору: `{order, index, answers, mode:'normal'|'review'}`; перевірка — `cleanSession`. Кожен набір має окремий прогрес у `root.sessions`.
- `render()` щоразу перебудовує всю панель; DOM будується через `h(tag, props, children)` і `button(text, css, handler, disabled)`; повідомлення — `notice()`.
- Спільні помічники: `fileButton()` (кнопка + прихований `<input type=file>`), `downloadJson()` (експорт), `syncSessionOrder()` (підгонка сесії під новий список id), `questionLabel(q)` («Порція N · №M»).
- Відповідь → `recordAttempt(id, isCorrect)` — єдине місце оновлення статистики помилок (помилка → 0/3, `MASTERED_AT=3` правильних поспіль → засвоєно).
- Порядок відповідей перемішується при кожному завантаженні сторінки (`createAnswerOrders`).

## localStorage (ключі не змінювати — там прогрес користувачів)

`pdr-quiz-batches-v1` (сесії), `pdr-quiz-saved-questions-v1` (закладки), `pdr-quiz-typical-mistakes-v1` (помилки), `pdr-quiz-batch-answer-layouts-v1` (порядок відповідей), `my-pdr-quiz-standalone-v3` (міграція старої версії).

## Додавання питань і порцій

- Порції (`BATCHES`), картки порцій, лічильники в шапці й `<title>` будуються з `questions.js` (`renderBatchCards`). Нова порція = нове значення `batchN` у даних.
- Нові питання в наявній порції дописуються в кінець сесій користувачів без скидання прогресу (`cleanSession`).
- Після змін у даних: `node tools/check-data.js` (унікальні id, `correct` у межах, усі картинки існують і використовуються).
- Числа відмінюються через `questionsCount(n)` / `batchesCount(n)` (`plural`).

## Стиль коду

Компактний JS у стилі наявного коду (короткі рядки-ланцюжки, `h()`/`button()`), коментарі й увесь текст інтерфейсу українською.
