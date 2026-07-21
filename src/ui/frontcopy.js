import { t } from '../i18n.js';

export function frontCountryCopy(state, countryName) {
  const people = Math.max(0, Math.min(100, state && state.population || 0));
  const copy = {
    peaceful: ['Мирна', '{country} поки в безпеці.', 'Поразка відкриє шлях орді.', 'Підготувати захист'],
    attacked: ['Під атакою', 'Орда атакує {country}.', 'Поразка посилить руйнування.', 'Зупинити атаку'],
    destroyed: ['Зруйнована', 'Люди в {country} залишилися серед руїн.', 'Країна чекатиме на повторний порятунок.', 'Врятувати людей'],
    rebuilding: ['Відбудова', '{country} повертається до життя.', 'Поразка не забере вже відновлений район.', 'Продовжити відбудову'],
    saved: ['Врятована', '{country} повністю відновлена.', 'Нові загрози зʼявляться лише в наступному циклі.', 'Захистити результат'],
  }[state && state.state] || ['Мирна', '{country} чекає на рятувальників.', '', 'Почати операцію'];
  const fill = (value) => t(value, { country: countryName, people });
  return { label: fill(copy[0]), summary: fill(copy[1]), consequence: fill(copy[2]), action: fill(copy[3]) };
}
