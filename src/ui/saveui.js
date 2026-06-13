// 💾 Панель «Мій прогрес»: статус хмари, постійний код відновлення,
// резервна копія файлом. Логіка хмари — у net/cloudsave.js.
import { saveHasProgress } from '../net/cloudsave.js';
import { t } from '../i18n.js';

export class SaveUI {
  constructor(game) {
    this.game = game;
    this._wire();
  }

  _wire() {
    const g = this.game;
    document.getElementById('btn-progress').addEventListener('click', () => {
      g.audio.click();
      document.getElementById('cloud-code').textContent = '';
      document.getElementById('cloud-code-input').value = '';
      this._renderStatus();
      g._showOverlay('overlay-progress');
      // відкриття панелі — гарний момент дослати свіжий сейв у хмару
      if (g.cloud.enabled) g.cloud.push().then(() => this._renderStatus());
    });

    document.getElementById('btn-cloud-code').addEventListener('click', async () => {
      g.audio.click();
      const out = document.getElementById('cloud-code');
      out.textContent = '…';
      const code = await g.cloud.fetchCode();
      if (!code) {
        out.textContent = t('😕 хмара недоступна');
        return;
      }
      out.textContent = `${code.slice(0, 4)}-${code.slice(4)}`;
      this._status(t('🔑 Запиши цей код у безпечному місці — він повертає прогрес назавжди!'));
    });

    document.getElementById('btn-cloud-claim').addEventListener('click', async () => {
      g.audio.click();
      const inp = document.getElementById('cloud-code-input');
      const code = (inp.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 8) { this._status(t('Код має 8 знаків — перевір і спробуй ще раз')); return; }
      this._status(t('Шукаю твій прогрес…'));
      const res = await g.cloud.claim(code);
      if (!res || !res.data) { this._status(t('😕 Не знайшов прогрес за цим кодом')); return; }
      if (saveHasProgress(g.save)
        && !confirm(t('Знайшов збережений прогрес! Замінити ним поточний? Теперішній прогрес на ЦЬОМУ пристрої зникне.'))) return;
      if (!g.cloud.adopt(res.data)) this._status(t('😕 Сейв пошкоджений — не можу відновити'));
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
      if (saveHasProgress(g.save)
        && !confirm(t('Відновити прогрес із файлу? Теперішній прогрес на ЦЬОМУ пристрої зникне.'))) return;
      g.cloud.adopt(text);
    });
  }

  _status(text) {
    document.getElementById('cloud-status').textContent = text;
  }

  // оновлює ЛИШЕ рядок статусу: викликається і асинхронно після пуша,
  // тому не сміє чіпати поле вводу коду (гонка з користувачем)
  _renderStatus() {
    const g = this.game;
    if (!g.cloud.enabled) { this._status(t('☁️ Хмара вимкнена (тестовий режим)')); return; }
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
