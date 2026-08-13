# 03 — Режими й бій

**Файли:** `test/zombie-boxer.mjs`, `test/radiation-mode.mjs`,
`test/soul-collector.mjs`, `test/overloaded-pvp.mjs`, `test/poland-castle.mjs`,
`test/loop-edges.mjs`, `test/weapon-unlock.mjs`

Відомі симптоми:
- `zombie-boxer` — «перші 2 атаки тільки наносять шкоду»
- `poland-castle` — «чаклуни створюють підземних прислужників, а не поверхневих»

**Підказка:** у v750 є коміт «raise the mid and late campaign difficulty curve» —
криву складності свідомо підняли. Тести, що пінять конкретні числа шкоди й HP,
після такого падають законно.

`soul-collector` і `radiation-mode` — окрема історія: вони записані в CLAUDE.md як
відомий борг ще з давнішого релізу (коміт `603e052`). Тобто вони червоні найдовше,
і причина може бути іншою, ніж у решти.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Кожен файл зелений локально
- [ ] Для кожного сказано: тест відстав чи гра була зламана
- [ ] Для `soul-collector` і `radiation-mode` окремо сказано, чи це той самий борг
- [ ] Жодна перевірка не вихолощена
