// 💾 Панель «Моя гра всюди»: код переїзду на інший пристрій, статус хмари,
// резервна копія файлом. Логіка хмари — у net/cloudsave.js.
//
// Найважливіше тут — крок-попередження перед заміною прогресу. Дитина мусить
// побачити ІМЕННО ТЕ, що зникне (скільки країн, монет, зірок, які улюбленці),
// ДО натискання, а не системний confirm() дрібним шрифтом після. Скасувати
// можна на будь-якому кроці: ✕ панелі і велика кнопка «Ні, залишити цю гру».
import { saveHasProgress, progressLoss } from '../net/cloudsave.js';
import { PETS } from '../characters.js';
import { t } from '../i18n.js';

export class SaveUI {
  constructor(game) {
    this.game = game;
    this._pending = null;   // {run, ask} — заміна, яка чекає на «Так, замінити»
    this._wire();
  }

  _wire() {
    const g = this.game;
    document.getElementById('btn-progress').addEventListener('click', () => {
      g.audio.click();
      document.getElementById('cloud-code').textContent = '';
      document.getElementById('cloud-code-input').value = '';
      document.getElementById('btn-cloud-copy').hidden = true;
      this._hideWarn();
      this._renderStatus();
      g._showOverlay('overlay-progress');
      // відкриття панелі — гарний момент дослати свіжий сейв у хмару
      if (g.cloud.enabled) g.cloud.push().then(() => this._renderStatus());
    });

    document.getElementById('btn-cloud-code').addEventListener('click', async () => {
      g.audio.click();
      const out = document.getElementById('cloud-code');
      const copyBtn = document.getElementById('btn-cloud-copy');
      out.textContent = '…';
      copyBtn.hidden = true;
      const code = await g.cloud.fetchCode();
      if (!code) {
        out.textContent = t('😕 хмара недоступна');
        return;
      }
      out.textContent = `${code.slice(0, 4)}-${code.slice(4)}`;
      copyBtn.hidden = false;
      copyBtn.dataset.code = code;
      this._status(t('🔑 Запиши цей код — саме він поверне твою гру на будь-якому пристрої!'));
    });

    document.getElementById('btn-cloud-copy').addEventListener('click', async () => {
      g.audio.click();
      const code = document.getElementById('btn-cloud-copy').dataset.code || '';
      try {
        await navigator.clipboard.writeText(code);
        this._status(t('📋 Код скопійовано — надішли його собі, щоб не загубити'));
      } catch (e) {
        // без буфера обміну (http, старий браузер) код і так великий на екрані
        this._status(t('Перепиши код з екрана — скопіювати не вийшло'));
      }
    });

    document.getElementById('btn-cloud-claim').addEventListener('click', async () => {
      g.audio.click();
      const inp = document.getElementById('cloud-code-input');
      const code = (inp.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 8) { this._status(t('Код має 8 знаків — перевір і спробуй ще раз')); return; }
      this._status(t('Шукаю твою гру…'));
      const res = await g.cloud.claim(code);
      if (!res || !res.data) { this._status(t('😕 Не знайшов гру за цим кодом')); return; }
      this._askOverwrite(t('Точно замінити цю гру на ту, що за кодом?'), () => {
        if (!g.cloud.adopt(res.data)) this._status(t('😕 Сейв пошкоджений — не можу відновити'));
      });
    });

    document.getElementById('btn-progress-keep').addEventListener('click', () => {
      g.audio.click();
      this._hideWarn();
      this._status(t('👍 Нічого не змінилось — твоя гра на місці'));
    });

    document.getElementById('btn-progress-replace').addEventListener('click', () => {
      g.audio.click();
      const pending = this._pending;
      this._hideWarn();
      if (pending) pending();
    });

    document.getElementById('btn-save-export').addEventListener('click', () => {
      g.audio.click();
      const blob = new Blob([JSON.stringify(g.save)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'zr-progres.json';
      a.click();
      URL.revokeObjectURL(a.href);
      this._status(t('⬇️ Файл збережено — поклади його в надійне місце'));
    });

    const fileInput = document.getElementById('save-file-input');
    document.getElementById('btn-save-import').addEventListener('click', () => {
      g.audio.click();
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      const text = await f.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { /* нижче скажемо */ }
      if (!parsed || typeof parsed !== 'object') { this._status(t('😕 Це не файл прогресу гри')); return; }
      this._askOverwrite(t('Точно замінити цю гру на ту, що у файлі?'), () => {
        // F25: justImported → bootSync зробить імпортований файл найновішим у хмарі,
        // інакше новіший хмарний сейв тихо перезаписав би його після перезавантаження.
        g.cloud.adopt(text, { justImported: true });
      });
    });
  }

  // 🐾 «які пети» — саме імена, а не кількість: дитині шкода Дружка, а не «3 шт.»
  _petNames(ids) {
    return ids.map((id) => (PETS[id] ? `${PETS[id].icon} ${PETS[id].name}` : id)).join(', ');
  }

  // Рядки втрати: тільки те, що в цьому сейві справді є.
  _lossLines() {
    const loss = progressLoss(this.game.save);
    const lines = [];
    if (loss.countries > 0) lines.push(t('🌍 Звільнені країни: {n}', { n: loss.countries }));
    if (loss.coins > 0) lines.push(t('🪙 Монети: {n}', { n: loss.coins }));
    if (loss.stars > 0) lines.push(t('⭐ Зірки: {n}', { n: loss.stars }));
    if (loss.pets.length) lines.push(t('🐾 Улюбленці: {list}', { list: this._petNames(loss.pets) }));
    if (!lines.length) lines.push(t('🎒 Усе, що ти тут зібрав'));
    return lines;
  }

  // Крок-попередження. Якщо втрачати нічого — заміна йде одразу, без зайвого страху.
  _askOverwrite(ask, run) {
    if (!saveHasProgress(this.game.save)) { run(); return; }
    const list = document.getElementById('progress-warn-list');
    list.textContent = '';
    for (const line of this._lossLines()) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }
    document.getElementById('progress-warn-ask').textContent = ask;
    this._pending = run;
    document.getElementById('progress-steps').hidden = true;
    document.getElementById('progress-warn').hidden = false;
    this._status('');
  }

  _hideWarn() {
    this._pending = null;
    document.getElementById('progress-warn').hidden = true;
    document.getElementById('progress-steps').hidden = false;
  }

  _status(text) {
    document.getElementById('cloud-status').textContent = text;
  }

  // оновлює ЛИШЕ рядок статусу: викликається і асинхронно після пуша,
  // тому не сміє чіпати поле вводу коду (гонка з користувачем)
  _renderStatus() {
    const g = this.game;
    if (!g.cloud.enabled) { this._status(t('☁️ Хмара вимкнена (тестовий режим)')); return; }
    if (g.cloud.lastFailTs && g.cloud.lastFailTs >= g.cloud.lastOkTs) {
      if (g.cloud.lastFailStatus === 429) {
        this._status(t('☁️ Хмара тимчасово зайнята — прогрес лишився на пристрої, спробуй ще раз трохи пізніше'));
      } else if (g.cloud.lastFailStatus === 409) {
        this._status(t('☁️ Є новіша хмарна копія, але локальний прогрес не перезаписано'));
      } else {
        this._status(t('😕 хмара недоступна'));
      }
      return;
    }
    if (g.cloud.lastOkTs) {
      // не t: затінило б функцію перекладу нижче
      const d = new Date(g.cloud.lastOkTs);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      this._status(t('☁️ Прогрес у хмарі • остання синхронізація {h}:{m}', { h: hh, m: mm }));
    } else {
      this._status(t('☁️ Синхронізую з хмарою…'));
    }
  }
}
