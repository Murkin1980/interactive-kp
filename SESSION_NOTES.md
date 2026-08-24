# SESSION_NOTES — Разработка Interactive KP

## 2026-08-24 — принято решение о миграции на MiniBase

- MPE disposition: `REUSE_COMPONENT`.
- Целевой backend: существующий MiniBase; новый BaaS не создаётся.
- Supabase сохраняется только как rollback source до подтверждённого cutover.
- Прямая browser-to-MiniBase запись запрещена: `mb_secret_*` остаётся только в
  доверенном Next.js/Cloudflare backend.
- План и стоп-критерии: `docs/MINIBASE_MIGRATION_DECISION.md`.
- До начала миграции проверены текущая ветка, lint и production build; ветка
  `feature/rebuild-product-demos` опубликована в GitHub.

## 2026-08-25 — MiniBase production onboarding

- MiniBase Worker обновлён до `0.23.0` после полного PASS его release gate.
- Создан отдельный project `interactive-kp` в EEUR, schema v4.
- Настроены production и localhost origins.
- `MINIBASE_URL` и `MINIBASE_SECRET_KEY` сохранены только как Cloudflare Worker
  secrets приложения.
- Одноразовый management key отозван; raw management/data keys не записывались
  в Git, документацию или логи.
- Cloudflare Access не создан: Wrangler OAuth не имеет Access write scope.
- Supabase production ещё не отключён: он остаётся текущим runtime до переноса
  кода и подтверждённой сверки данных.

## Дата: Июль 2026

## Сессия 1: Инициализация проекта

### Создано
- Next.js 16 проект с App Router, TypeScript, Tailwind CSS, ESLint
- Установлены: `@supabase/supabase-js`, `@supabase/ssr`, `zod@4.4.3`, `react-hook-form`, `clsx`

### Миграция БД (`001_initial_schema.sql`)
- Таблицы: `clients`, `kps`, `kp_items`, `kp_item_variants`, `kp_confirmations`, `kp_counters`
- RLS-политики: владелец видит только свои данные
- Функция `get_next_kp_number()` — автоинкремент нумерации `КП-{YYYY}-{NNN}`
- Триггер `update_updated_at()` — автоматическое обновление `updated_at`

### Инфраструктура
- Supabase клиент: `lib/supabase/client.ts` (browser, singleton), `server.ts` (SSR), `middleware.ts`
- Middleware: защищает все маршруты кроме `/login` и `/public`
- Все страницы используют `dynamic(() => import(...), { ssr: false })` для обхода prerender ошибок

## Сессия 2: UI-компоненты и бизнес-логика

### UI-компоненты (`components/ui/`)
- `Button` — 4 варианта (primary, secondary, danger, ghost), 3 размера
- `Input` — с поддержкой label, error, className
- `Textarea` — аналогично Input
- `Select` — с поддержкой options, label, error
- `Card` — контейнер с CardHeader, CardContent

### Layout
- `AppLayout` — обёртка с Sidebar
- `Sidebar` — навигация (Главная, Клиенты, КП), кнопка "Выход"

### Утилиты
- `formatCurrency(amount)` — форматирование в ₸ с разделителем тысяч
- `formatDate(date)` — форматирование даты (DD.MM.YYYY)
- `generateKpNumber()` — генерация номера КП

## Сессия 3: CRUD-операции

### Клиенты
- Список с пустым состоянием
- Новый клиент (Zod-валидация)
- Детали клиента (редактирование, удаление с подтверждением)

### КП
- Список с пустым состоянием
- Новый КП (выбор клиента из dropdown, автоподстановка имени/телефона)
- Детали КП (редактирование полей, статусы, публичная ссылка)
- Дублирование КП

### Калькуляция (`lib/utils/calculation.ts`)
- Автоматический расчёт: subtotal, discount, total, advance, balance
- Поддержка процентной и фиксированной скидки
- Десятичные суммы округляются до целых (тенге)

## Сессия 4: Публичная страница и подтверждение

### Публичный просмотр (`/public/{token}`)
- Уникальная ссылка по `public_token`
- Просмотр позиций с вариантами
- Выбор вариантов с радио-кнопками
- Живой расчёт итогов
- Форма подтверждения: имя, телефон, комментарий
- Обработка: отправка → просмотр → подтверждено → истекло

### Статусы КП
- `draft` → `sent` → `viewed` → `confirmed`
- `expired` — при превышении `valid_until`
- При первом открытии публичной ссылки: `sent` → `viewed` автоматически

## Сессия 5: ItemManager (CRUD позиций и вариантов)

### ItemManager (`features/proposals/item-manager.tsx`)
- **Позиции:** добавление, редактирование, удаление, перемещение (▲/▼)
- **Варианты:** добавление (до 3), редактирование, удаление, выбор по умолчанию
- Инлайн-формы для добавления/редактирования
- Supabase-интеграция: все изменения сохраняются в реальном времени
- Валидация: обязательные поля, макс. 50 позиций, макс. 3 варианта

### Интеграция в ProposalDetailForm
- Заменена статическая секция "Позиции" на `ItemManager`
- Калькуляция использует варианты по умолчанию для расчёта

## Исправленные ошибки (сессия 5)

### Критическая
- **Публичная страница КП:** исправлен отсутствующий JOIN `kp_item_variants` в запросе — страница падала с TypeError при наличии позиций

### Высокий приоритет
- **Zod-валидация:** пустая строка `""` в `client_id` теперь корректно преобразуется в `null` через `optionalNull` helper
- **Подтверждённое КП:** при повторном открытии восстанавливаются ранее выбранные варианты из `kp_confirmations.selected_variants`

### Средний приоритет
- **Статусы КП:** заменены английские строки на русские (Черновик, Отправлено, Просмотрено, Подтверждено, Истекло) во всех списках
- **Стили статуса:** добавлен `expired` стиль (красный) во всех списках КП
- **Loading-состояния:** добавлены спиннеры загрузки на дашборд, списки клиентов и КП

## Rebuild Demo Videos (2026-07-26)

### Цель
Перезаписать 13 демо-роликов в учебном центре (`/demos/`) с озвучкой, субтитрами и постерами.

### Что сделано
1. **Скрипты озвучки** — 13 TXT-файлов в `demo/narration/`
2. **Генерация аудио** — edge-tts, голос `ru-RU-DmitryNestry`
3. **Запись** — 13 Testreel JSON-сценариев, запись через `--channel chrome`
4. **Пост-обработка** — FFmpeg: WebM→MP4, аудиомикс, субтитры в видео, постеры
5. **Страница** — пересобрана с манифестом `manifest.json`, секциями, `<track>` для субтитров
6. **Деплой** — `feature/rebuild-product-demos` → production

### Структура файлов
```
demo/
  scenarios/     ← 13 JSON-сценариев Testreel
  narration/     ← 13 TXT-скриптов
  subtitles/     ← 13 SRT-файлов (edge-tts)
  scripts/       ← record.mjs, compose.mjs
  output/        ← промежуточные файлы (gitignored)

public/demos/
  *.mp4          ← 13 H.264 MP4 видео
  *.webm         ← 13 VP8 WebM видео
  posters/*.jpg  ← 13 постеров (4s)
  subtitles/*.vtt ← 13 WebVTT-файлов
  manifest.json  ← каталог уроков
  index.html     ← страница учебного центра
```

### Известные проблемы записи
- Дублирующие селекторы навигации (desktop + mobile)
- Некоторые шаги Testreel завершились ошибкой, но видео записаны
- VP8 WebM кодирование медленное
- Public URL: `/public/{token}` (не `/p/{token}`)

### Технический отчёт
См. `docs/TECHNICAL_REPORT_DEMO_VIDEOS.md`

---

## Известные ограничения

1. **Нет загрузки изображений** — Supabase Storage bucket `kp-images` ещё не создан
2. **Нет экспорта в JSON** — функция бэкапа данных не реализована
3. **Нет print-стилей** — "Сохранить как PDF" не оптимизирован
4. **Нет 404/error страниц** — используются стандартные Next.js
5. **`alert()` в ItemManager** — ошибки показываются через `window.alert()`, не inline
6. **Middleware deprecated** — Next.js 16 рекомендует "proxy" вместо "middleware"

## Файлы (критичные)

| Файл | Назначение |
|------|-----------|
| `src/features/proposals/public-proposal-view.tsx` | Публичная страница КП (клиентский интерфейс) |
| `src/features/proposals/item-manager.tsx` | CRUD позиций и вариантов |
| `src/features/proposals/proposal-detail-form.tsx` | Редактор КП (админ) |
| `src/lib/utils/calculation.ts` | Расчёт сумм КП |
| `src/lib/validation/index.ts` | Zod-схемы валидации |
| `src/types/index.ts` | TypeScript-интерфейсы |
| `supabase/migrations/001_initial_schema.sql` | Схема БД |
