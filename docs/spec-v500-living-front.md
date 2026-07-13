# v500 — Живий фронт

Issue: [#76](https://github.com/slonce70/zombie-world-rescue/issues/76)

## Продуктовий контракт

Живий фронт з'єднує глобус, наявні бойові режими, врятованих друзів і Базу в один
нескінченний цикл без енергії, таймерів або втрати звільнених країн.

- Після першої звільненої країни відкривається навчальна операція в Україні.
- Після трьох країн дошка містить три незгораючі операції у різних звільнених країнах.
- Операція складається з трьох етапів; між етапами стан і збірка зберігаються.
- Поразка дозволяє повторити етап без штрафу; відмова повертає операцію на дошку.
- Перемога відновлює країну, просуває один проєкт Бази й видає чинні валюти.
- Один варіант завжди позначений рекомендованим; старі режими лишаються в Аркаді.

## Архітектурний контракт

- `src/worldfront.js` — чистий versioned domain state і єдиний reducer `applyFrontEvent`.
- `src/ui/frontui.js` — DOM-представлення без володіння прогресом або нагородами.
- `src/worldevents.js` — детермінований план quiet → pressure → spike → reward.
- `level.operation` — єдина мета-ознака; нових наборів `isFront*` не додаємо.
- Суми нагород в сейві не довірені: reducer виводить їх зі стану й stable reward id.
- Кооп host-authoritative; клієнт не може підтвердити перемогу або сформувати нагороду.

## Сейв і безпека

`save.front.v = 1`. Sanitizer дозволяє лише відомі країни, шаблони, проєкти,
спеціалістів, картки й status. Невідома версія скидає тільки Front. Новий ключ входить
у SaveVault manifest і drift guard. Прихованої телеметрії немає; локальні лічильники
можна відправляти лише через явний opt-in.

## Release gates

1. Domain/unit: determinism, migration, corrupt input, double claim, generation advance.
2. Browser: unlock, start, stage result, reload/resume, retry/abandon, final reward.
3. Mobile/visual: 1440×900, 1280×720, 390×844, 375×812, reduced motion.
4. Co-op: canonical host snapshot, reconnect, forged guest result, reward id parity.
5. Perf/offline: чинні mobile budgets, без нових GLB/dependencies, PWA shell повний.

Лише фінальний інтеграційний PR піднімає `version.json`, `APP_VERSION`, service-worker
cache до 500; `PROTO_VERSION` піднімається до 16 лише разом із новим wire format.
