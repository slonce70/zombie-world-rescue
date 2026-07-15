// Розмір карти задається в зрозумілих гравцю метрах. Поточна карта = 750 м.
// Масштабуємо весь просторовий конфіг разом, щоб межа не відрізала сюжетні місця.
export const MAP_SIZE_MODES = Object.freeze(['small', 'standard', 'large', 'huge']);
export const MAP_SIZE_METERS = Object.freeze({ small: 500, standard: 750, large: 950, huge: 1250 });

export function sanitizeMapSize(value) {
  return MAP_SIZE_MODES.includes(value) ? value : 'standard';
}

export function mapSizeScale(value) {
  return MAP_SIZE_METERS[sanitizeMapSize(value)] / MAP_SIZE_METERS.standard;
}

const SCALED_NUMBER_KEYS = new Set(['bound', 'x', 'z', 'r', 'w', 'd', 'width', 'sigma', 'from', 'to']);
const COORDINATE_ARRAY_KEYS = new Set(['roads', 'pts', 'spots', 'barrels']);

function scaledValue(value, key, scale, coordinateArray = false) {
  if (typeof value === 'number') {
    return (coordinateArray || SCALED_NUMBER_KEYS.has(key)) ? value * scale : value;
  }
  if (typeof value === 'function') {
    return key === 'terrain' ? (x, z) => value(x / scale, z / scale) : value;
  }
  if (Array.isArray(value)) {
    const coords = coordinateArray || COORDINATE_ARRAY_KEYS.has(key);
    return value.map((item) => scaledValue(item, key, scale, coords));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey,
    scaledValue(child, childKey, scale, COORDINATE_ARRAY_KEYS.has(childKey)),
  ]));
}

export function scaleMap(source, value) {
  const mode = sanitizeMapSize(value);
  if (mode === 'standard') return source;
  return scaledValue(source, '', mapSizeScale(mode));
}
