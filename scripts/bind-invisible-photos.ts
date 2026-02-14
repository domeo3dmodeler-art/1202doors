/**
 * Привязка обложки и галереи для DomeoDoors_Invisible.
 * Файлы в public/uploads/final-filled/Цвет: Invisible_chrome.png (обложка), Invisible_black.png (галерея).
 * Запуск: npx tsx scripts/bind-invisible-photos.ts
 */
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { upsertPropertyPhoto, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const BASE = '/uploads/final-filled/Цвет/';

async function main() {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  const propertyValue = 'domeodoors_invisible';

  const coverOk = await upsertPropertyPhoto(
    doorsCategoryId,
    DOOR_MODEL_CODE_PROPERTY,
    propertyValue,
    BASE + 'Invisible_chrome.png',
    'cover',
    { originalFilename: 'Invisible_chrome.png' }
  );
  console.log('Обложка (cover):', coverOk ? 'OK' : 'Ошибка');

  const galleryOk = await upsertPropertyPhoto(
    doorsCategoryId,
    DOOR_MODEL_CODE_PROPERTY,
    propertyValue,
    BASE + 'Invisible_black.png',
    'gallery_1',
    { originalFilename: 'Invisible_black.png' }
  );
  console.log('Галерея (gallery_1):', galleryOk ? 'OK' : 'Ошибка');

  console.log('\nГотово. Откройте /doors?refresh=1 для обновления кэша.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
