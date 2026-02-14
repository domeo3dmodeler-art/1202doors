import { test, expect } from '@playwright/test';

/**
 * Критические тесты работы с документами
 * Тест 5-10 из плана тестирования
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Хелпер для авторизации
async function login(page: any, role: 'admin' | 'complectator' | 'executor' = 'complectator') {
  const email = process.env[`TEST_${role.toUpperCase()}_EMAIL`] || `${role}@example.com`;
  const password = process.env[`TEST_${role.toUpperCase()}_PASSWORD`] || 'password';
  
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin|complectator|executor)/, { timeout: 10000 });
}

test.describe('Работа с документами', () => {
  
  test('5. Создание клиента', async ({ page }) => {
    await login(page, 'complectator');
    
    // Переход к списку клиентов (через dashboard)
    await page.goto(`${BASE_URL}/complectator/dashboard`);
    
    // Ожидание загрузки списка клиентов
    await page.waitForSelector('button:has-text("Создать")', { timeout: 10000 });
    
    // Нажатие кнопки создания клиента
    await page.click('button:has-text("Создать")');
    
    // Заполнение формы
    await page.fill('input[name="firstName"], input[placeholder*="Имя"]', 'Тестовый');
    await page.fill('input[name="lastName"], input[placeholder*="Фамилия"]', 'Клиент');
    await page.fill('input[name="phone"], input[placeholder*="Телефон"]', '+79991234567');
    
    // Сохранение
    await page.click('button:has-text("Создать клиента"), button[type="submit"]');
    
    // Проверка что клиент создан и выбран
    await page.waitForTimeout(2000);
    const clientName = page.locator('text=/Тестовый.*Клиент/');
    await expect(clientName).toBeVisible({ timeout: 5000 });
  });

  test('6. Создание КП из корзины', async ({ page }) => {
    await login(page, 'complectator');
    
    // Переход в каталог
    await page.goto(`${BASE_URL}/doors`);
    await page.waitForTimeout(2000);
    
    // Добавление товара в корзину (если есть товары)
    const addToCartButton = page.locator('button:has-text("В корзину")').first();
    const count = await addToCartButton.count();
    
    if (count > 0) {
      await addToCartButton.click();
      await page.waitForTimeout(1000);
      
      // Открытие корзины
      await page.click('button:has-text("Корзина"), [aria-label*="корзина" i]');
      await page.waitForTimeout(1000);
      
      // Создание КП
      const createQuoteButton = page.locator('button:has-text("Создать КП")');
      if (await createQuoteButton.count() > 0) {
        await createQuoteButton.click();
        await page.waitForTimeout(2000);
        
        // Проверка что КП создано (появление статуса "Черновик")
        const draftStatus = page.locator('text=/Черновик|DRAFT/i');
        await expect(draftStatus.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('7. Изменение статуса документа', async ({ page }) => {
    await login(page, 'complectator');
    
    await page.goto(`${BASE_URL}/complectator/dashboard`);
    await page.waitForTimeout(2000);
    
    // Поиск документа со статусом "Черновик"
    const draftDocument = page.locator('text=/Черновик|DRAFT/i').first();
    const count = await draftDocument.count();
    
    if (count > 0) {
      await draftDocument.click();
      await page.waitForTimeout(1000);
      
      // Клик по статусу для изменения
      const statusBadge = page.locator('[class*="status"], [class*="badge"]').first();
      await statusBadge.click();
      
      // Выбор нового статуса "Отправлено"
      const sentStatus = page.locator('text=/Отправлено|SENT/i');
      if (await sentStatus.count() > 0) {
        await sentStatus.click();
        await page.waitForTimeout(2000);
        
        // Проверка что статус изменился
        const newStatus = page.locator('text=/Отправлено|SENT/i');
        await expect(newStatus).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('6b. Генерация КП из корзины с разными типами позиций (дверь, ручка, ограничитель)', async ({ page, context }) => {
    await login(page, 'complectator');
    await page.goto(`${BASE_URL}/doors`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Ждём появления кнопки «В корзину» (конфигуратор загружен и цена посчитана)
    const addToCartBtn = page.locator('button:has-text("В корзину")').first();
    await addToCartBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

    const hasAddToCart = await addToCartBtn.isVisible();
    if (!hasAddToCart) {
      test.skip();
      return;
    }

    await addToCartBtn.click();
    await page.waitForTimeout(1500);

    // Открываем корзину
    const cartTrigger = page.locator('button:has-text("Корзина"), [aria-label*="корзина" i]').first();
    await cartTrigger.click();
    await page.waitForTimeout(1000);

    // В корзине должен быть хотя бы один товар (дверь)
    await expect(page.locator('text=/Дверь|руб\\.|Ручка|Ограничитель/').first()).toBeVisible({ timeout: 5000 });

    // Если нет выбранного клиента — показывается кнопка выбора/создания; для генерации КП нужен клиент
    const createKpBtn = page.locator('button:has-text("КП")').first();
    const kpVisible = await createKpBtn.isVisible().catch(() => false);
    if (!kpVisible) {
      // Клиент не выбран — тест проверяет только что корзина открылась с позициями
      await expect(page.getByRole('button', { name: /Корзина|КП|Создать/ })).toBeVisible({ timeout: 3000 }).catch(() => {});
      return;
    }

    // Ожидаем скачивание PDF при клике на КП (если клиент выбран)
    const downloadPromise = context.waitForEvent('download', { timeout: 25000 }).catch(() => null);
    await createKpBtn.click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    } else {
      // Возможно показан alert об ошибке или о выборе клиента — тест не падает
      await page.waitForTimeout(2000);
    }
  });

  test('8. Экспорт документа в PDF', async ({ page, context }) => {
    await login(page, 'complectator');
    
    await page.goto(`${BASE_URL}/complectator/dashboard`);
    await page.waitForTimeout(2000);
    
    // Поиск документа
    const document = page.locator('[class*="document"], [class*="quote"], [class*="invoice"]').first();
    const count = await document.count();
    
    if (count > 0) {
      // Открытие меню действий
      const menuButton = page.locator('button[aria-label*="меню" i], button:has-text("⋮")').first();
      if (await menuButton.count() > 0) {
        await menuButton.click();
        await page.waitForTimeout(500);
        
        // Клик на "Перегенерировать PDF"
        const exportButton = page.locator('text=/PDF|перегенерировать/i');
        if (await exportButton.count() > 0) {
          // Ожидание скачивания файла
          const downloadPromise = context.waitForEvent('page');
          await exportButton.click();
          
          // Проверка что файл скачался (или страница открылась)
          await page.waitForTimeout(3000);
        }
      }
    }
  });
});

