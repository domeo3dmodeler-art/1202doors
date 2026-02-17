/**
 * Удаление записей PropertyPhoto (Domeo_Модель_Цвет) по списку propertyValue.
 * Запуск: npx tsx scripts/delete-property-photos-by-value.ts
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

const VALUES_TO_DELETE = [
  'DomeoDoors_Emerald_1|ПВХ|Белый',
  'Дверь Enigma 6 ДГ|Эмаль|Синий (NCS S 6010-B10G)',
  'Дверь Molis 1 эмаль ДГ Исполнение|Эмаль|Белый (RAL 9003)',
  'Дверь Molis 1 эмаль ДГ Исполнение|Эмаль|Агат (Ral 7038)',
  'Дверь Molis 1 эмаль ДГ Исполнение|Эмаль|Белый (RAL 9010)',
];

function normalize(s: string): string {
  return s
    .trim()
    .split('|')
    .map((p) => p.trim())
    .join('|');
}

async function main() {
  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена');
    process.exit(1);
  }

  let totalDeleted = 0;
  for (const raw of VALUES_TO_DELETE) {
    const propertyValue = normalize(raw);
    const result = await prisma.propertyPhoto.deleteMany({
      where: {
        categoryId: doorsCatId,
        propertyName: DOOR_COLOR_PROPERTY,
        propertyValue,
      },
    });
    if (result.count > 0) {
      console.log(`Удалено ${result.count} записей: ${propertyValue}`);
      totalDeleted += result.count;
    } else {
      console.log(`(не найдено) ${propertyValue}`);
    }
  }
  console.log('\nИтого удалено записей:', totalDeleted);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
