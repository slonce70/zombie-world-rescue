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

// 🖼️ Той самий шлях, але для КАРТИНКИ: navigator.share({files}) → завантаження файлу.
// Окремо від shareLink, бо файл у буфер обміну надійно не покладеш, а фолбек тут
// обов'язковий: share з файлами є далеко не всюди (десктопний Firefox, старі WebView).
// Повертає 'shared' | 'downloaded' | 'failed' — виклик ніколи не кидає.
export async function shareImageFile(game, blob, { filename = 'zombie-rescue.png', title, text } = {}) {
  if (!blob) return 'failed';
  try {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || t('Операція: Порятунок Світу'), text });
      return 'shared';
    }
  } catch (e) {
    // скасування користувачем — тихо виходимо; решта фейлів падає на завантаження нижче
    if (e && e.name === 'AbortError') return 'shared';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    game.hud.toast(t('🖼️ Картинку збережено — надішли її другу!'), 6);
    return 'downloaded';
  } catch (e) { /* завантаження теж заблоковане — скажемо про це нижче */ }
  game.hud.toast(t('😕 Не вдалося зберегти картинку'));
  return 'failed';
}
