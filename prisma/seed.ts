// prisma/seed.ts
// Seed файл для создания тестовых пользователей
// Пароль для всех тестовых пользователей: Test2025!

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Test2025!';

async function main() {
  try {
    console.log('🌱 Создаем тестовых пользователей...');

    // Создаем администратора
    console.log('👑 Создаем администратора...');
    const adminPasswordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@domeo.ru' },
      update: { password_hash: adminPasswordHash },
      create: {
        email: 'admin@domeo.ru',
        password_hash: adminPasswordHash,
        first_name: 'Петр',
        last_name: 'Иванов',
        middle_name: 'Владимирович',
        role: 'ADMIN',
        is_active: true
      }
    });

    console.log('✅ Администратор создан:', admin.email);

    // Создаем комплектатора
    console.log('📋 Создаем комплектатора...');
    const complectatorPasswordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    const complectator = await prisma.user.upsert({
      where: { email: 'complectator@domeo.ru' },
      update: { password_hash: complectatorPasswordHash },
      create: {
        email: 'complectator@domeo.ru',
        password_hash: complectatorPasswordHash,
        first_name: 'Иван',
        last_name: 'Петров',
        middle_name: 'Сергеевич',
        role: 'COMPLECTATOR',
        is_active: true
      }
    });

    console.log('✅ Комплектатор создан:', complectator.email);

    // Создаем исполнителя
    console.log('⚙️ Создаем исполнителя...');
    const executorPasswordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    const executor = await prisma.user.upsert({
      where: { email: 'executor@domeo.ru' },
      update: { password_hash: executorPasswordHash },
      create: {
        email: 'executor@domeo.ru',
        password_hash: executorPasswordHash,
        first_name: 'Алексей',
        last_name: 'Сидоров',
        middle_name: 'Михайлович',
        role: 'EXECUTOR',
        is_active: true
      }
    });

    console.log('✅ Исполнитель создан:', executor.email);

    // Категория и тестовые товары для каталога дверей (чтобы в приложении что-то отображалось)
    console.log('📦 Создаем категорию и тестовые товары...');
    const doorsCategory = await prisma.catalogCategory.upsert({
      where: { id: 'seed-doors-category-id' },
      update: { name: 'Межкомнатные двери', path: '/doors', is_active: true },
      create: {
        id: 'seed-doors-category-id',
        name: 'Межкомнатные двери',
        parent_id: null,
        level: 0,
        path: '/doors',
        sort_order: 0,
        is_active: true,
        products_count: 0
      }
    });

    const categoryId = doorsCategory.id;
    const sampleProducts = [
      { sku: 'TEST-MODEL-01', name: 'Тестовая модель 01', model: 'Модель 01', style: 'Современный', modelCode: 'TEST-01' },
      { sku: 'TEST-MODEL-02', name: 'Тестовая модель 02', model: 'Модель 02', style: 'Классика', modelCode: 'TEST-02' },
      { sku: 'TEST-MODEL-03', name: 'Тестовая модель 03', model: 'Модель 03', style: 'Современный', modelCode: 'TEST-03' }
    ];

    const propsData = (p: typeof sampleProducts[0]) => ({
      'Код модели Domeo (Web)': p.modelCode,
      'Название модели': p.model,
      'Domeo_Стиль Web': p.style
    });

    for (const p of sampleProducts) {
      await prisma.product.upsert({
        where: { sku: p.sku },
        update: {
          name: p.name,
          properties_data: JSON.stringify(propsData(p))
        },
        create: {
          catalog_category_id: categoryId,
          sku: p.sku,
          name: p.name,
          base_price: 15000,
          currency: 'RUB',
          is_active: true,
          properties_data: JSON.stringify(propsData(p))
        }
      });
    }

    await prisma.catalogCategory.update({
      where: { id: categoryId },
      data: { products_count: sampleProducts.length }
    });

    console.log('✅ Категория "Межкомнатные двери" и', sampleProducts.length, 'тестовых товаров созданы');

    console.log('🎉 Тестовые пользователи и каталог созданы!');
    console.log('');
    console.log('📋 Данные для входа (пароль для всех: ' + TEST_PASSWORD + '):');
    console.log('👑 Администратор: admin@domeo.ru');
    console.log('📋 Комплектатор: complectator@domeo.ru');
    console.log('⚙️ Исполнитель: executor@domeo.ru');

  } catch (error) {
    console.error('❌ Ошибка при создании пользователей:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем seed
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });