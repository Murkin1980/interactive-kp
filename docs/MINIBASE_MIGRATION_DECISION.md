# Interactive KP — решение о миграции на MiniBase

Дата: 2026-08-24

Владелец решения: Мурат

Статус: принято, реализация по этапам
Диспозиция MPE: **REUSE_COMPONENT**

## Решение

Interactive KP должен перейти с Supabase на существующую платформу MiniBase.
Новый backend-проект или параллельная BaaS-инфраструктура не создаются.

MiniBase становится целевым хранилищем данных и файлов. До полной приёмки
Supabase сохраняется неизменным как rollback source; production cutover нельзя
выполнять до сверки данных, прав доступа, публичных ссылок и PDF.

## Подтверждённый разрыв возможностей

Текущий Interactive KP использует:

- Supabase Auth и Google OAuth;
- RLS и мультитенантные SQL-связи;
- RPC для нумерации, вариантов, публичного просмотра и подтверждения;
- Storage для изображений, логотипов и неизменяемых PDF;
- публичные анонимные операции по токену КП.

Текущий MiniBase предоставляет project-scoped D1/R2, Records API, Files API,
publishable/secret keys и origin allowlist, но намеренно не предоставляет
пользовательскую Auth и row-level authorization. Браузерная запись до появления
такой авторизации запрещена контрактом MiniBase.

## Целевая граница безопасности

```text
Browser
  -> Interactive KP Next.js/Cloudflare server routes
       -> authentication / public-token validation
       -> ownership and organization checks
       -> deterministic business commands
       -> MiniBase with server-only mb_secret_* key
```

- `mb_secret_*` хранится только как Worker secret и никогда не попадает в
  `NEXT_PUBLIC_*`, клиентский bundle, логи или Git.
- Браузер не получает write-scoped MiniBase key.
- Публичный клиент работает только через ограниченные server endpoints,
  валидирующие public token, срок действия, revision и состояние КП.
- Подтверждённый PDF остаётся неизменяемым; повторная генерация возможна только
  через существующий reopen/reconfirm workflow.
- Все записи изолируются по организации на уровне application commands и
  отдельных project-scoped ресурсов MiniBase.

## Этапы миграции

### IKP-MB0 — контракты и инвентаризация

- зафиксировать таблицы, RPC, buckets и пользовательские сценарии;
- определить MiniBase collections, record IDs и file paths;
- определить auth/session boundary и backend API;
- подготовить export manifest, checksums, verification и rollback plan.

### IKP-MB1 — адаптеры без cutover

- выделить доменные интерфейсы данных, файлов и auth;
- сохранить текущий Supabase adapter рабочим;
- добавить MiniBase server client и запрет импорта secret client в browser code;
- добавить contract tests.

### IKP-MB2 — основной менеджерский сценарий

- клиенты;
- создание и редактирование КП;
- позиции, варианты, опции и сортировка;
- нумерация и optimistic concurrency.

### IKP-MB3 — публичный сценарий

- чтение КП по public token;
- signed/streamed media;
- viewed/expired states;
- подтверждение, immutable snapshot и PDF.

### IKP-MB4 — миграция данных

- экспорт Supabase с manifest и checksums;
- импорт в отдельный MiniBase project;
- сверка counts, IDs, связей, сумм, revisions и файлов;
- повторяемый dry run без изменения production.

### IKP-MB5 — shadow, cutover и rollback

- shadow verification;
- приёмка менеджерского и публичного сценариев;
- переключение production только после PASS;
- документированный rollback на Supabase до окончания периода наблюдения.

## Стоп-критерии

Миграция не переключается в production, если:

- browser bundle содержит `mb_secret_*` или management key;
- нет эквивалента ownership/organization isolation;
- публичный endpoint допускает произвольную запись;
- не подтверждена неизменяемость принятого PDF;
- export/import не имеет manifest, checksums и сверки;
- основной e2e-сценарий не проходит на desktop и mobile;
- отсутствует проверенный rollback.

## Не входит без отдельного решения

- превращение MiniBase в универсальную публичную пользовательскую Auth-платформу;
- создание второго Worker, D1, R2 bucket или домена в обход существующего
  MiniBase provisioning;
- удаление Supabase-проекта до завершения rollback-периода.
