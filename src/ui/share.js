// 🔗 Спільний фолбек «поділитися»: navigator.share → clipboard.writeText → тост із посиланням.
// Один шлях для запрошення в кімнату і для точного лінка на карту спільноти.
import { t } from '../i18n.js';

// повертає 'shared' | 'copied' | 'shown' — виклик ніколи не кидає
export async function shareLink(game, { title, text, url, copiedMessage } = {}) {
  if (!url) return 'shown';
  try {
    if (navigator.share) {
      await navigator.share({ title: title || t('Операція: Порятунок Світу'), text, url });
      return 'shared';
    }
  } catch (e) {
    // скасування користувачем — тихо виходимо; інші фейли share (WebView,
    // NotAllowedError поза жестом) падають на буфер обміну нижче
    if (e && e.name === 'AbortError') return 'shared';
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      game.hud.toast(copiedMessage || t('🔗 Посилання скопійовано — надішли другу!'));
      return 'copied';
    }
  } catch (e) { /* clipboard заблоковано — покажемо посилання нижче */ }
  game.hud.toast(t('🔗 Посилання: {u}', { u: url }), 8);
  return 'shown';
}
