# Interactive KP — Личный сервис коммерческих предложений

Веб-сервис для создания интерактивных КП для мебельного бизнеса. Позволяет создавать КП с позициями и вариантами, генерировать публичные ссылки и получать подтверждения от клиентов.

## Быстрый старт

### Требования

- Node.js 18+
- Аккаунт [Supabase](https://supabase.com)

### Установка

```bash
cd interactive-kp
npm install
```

### Настройка Supabase

1. Создайте проект в [Supabase](https://supabase.com)
2. В dashboard откройте SQL Editor
3. Создайте первого пользователя в **Authentication → Users**.
4. В SQL Editor по порядку и ровно по одному разу выполните миграции:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_security_hardening.sql`
   - `supabase/migrations/003_fix_security_and_integrity.sql`
5. Скопируйте `.env.example` в `.env.local` и заполните:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_или_publishable_key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   `service_role`/secret key приложению не нужен и не должен храниться в
   клиентском окружении.

### Запуск

```bash
npm run dev
```

Откройте http://localhost:3000/login, войдите через email/password из Supabase Auth.

## Структура проекта

```
interactive-kp/
├── src/
│   ├── app/                    # Next.js App Router (страницы)
│   │   ├── page.tsx            # Редирект на /dashboard
│   │   ├── login/              # Авторизация
│   │   ├── dashboard/          # Главная с аналитикой
│   │   ├── clients/            # Управление клиентами
│   │   ├── proposals/          # Управление КП
│   │   └── public/             # Публичная страница КП для клиента
│   ├── components/
│   │   ├── ui/                 # Переиспользуемые UI-компоненты
│   │   └── layout/             # AppLayout, Sidebar
│   ├── features/               # Business-компоненты по фичам
│   │   ├── auth/               # LoginForm
│   │   ├── clients/            # Клиенты CRUD
│   │   ├── dashboard/          # Аналитика
│   │   └── proposals/          # КП CRUD + ItemManager + публичный просмотр
│   ├── lib/
│   │   ├── supabase/           # Клиенты Supabase (browser, server, middleware)
│   │   ├── utils/              # Утилиты (форматирование, расчёт)
│   │   └── validation/         # Zod-схемы валидации
│   └── types/                  # TypeScript-интерфейсы
├── supabase/
│   └── migrations/             # SQL-миграции
└── .env.local                  # Переменные окружения (не в git)
```

## Функционал

### Авторизация
- Вход через Supabase Auth (email/password)
- Middleware защищает все маршруты кроме `/login` и `/public`

### Клиенты
- Список клиентов с поиском по имени
- Добавление / редактирование / удаление
- Поля: имя, телефон, email, адрес, заметки

### Коммерческие предложения
- Создание КП с привязкой к клиенту
- Автоматическая нумерация: `КП-{YYYY}-{NNN}`
- Позиции (товары) с вариантами (до 3 на позицию)
- Варианты: название, материал, фурнитура, цена, описание
- Управление порядком позиций (▲/▼)
- Выбор варианта по умолчанию
- Скидки: процентная или фиксированная
- Аванс и остаток
- Дублирование КП

### Публичная страница
- Уникальная ссылка: `/public/{token}`
- Клиент видит только свою позицию
- Выбор вариантов с радио-кнопками
- Живой расчёт итоговой суммы
- Форма подтверждения: имя, телефон, комментарий
- Подтверждение фиксируется в базе

### Дашборд
- Общая статистика: клиенты, КП, черновики, подтверждённые
- Последние клиенты и КП

## Схема БД

| Таблица | Описание |
|---------|----------|
| `clients` | Клиенты |
| `kps` | Коммерческие предложения |
| `kp_items` | Позиции в КП |
| `kp_item_variants` | Варианты позиций (до 3) |
| `kp_confirmations` | Подтверждения от клиентов |
| `kp_counters` | Счётчик нумерации КП |

RLS-политики: владелец видит только свои данные. Публичный доступ по `public_token` — только чтение + подтверждение.

## Стек

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Валидация:** Zod v4
- **Стили:** Tailwind CSS с палитрой stone/amber
