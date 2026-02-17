/**
 * Сервис для импорта шаблона дверей из Excel (листы 01, 03–06).
 * Источник истины по каталогу дверей — final_filled 30.01.xlsx (import-final-filled.ts).
 *
 * Обрабатывает 5 листов:
 * 1. 01 Модели Поставщики
 * 2. 03 Кромка
 * 3. 04 Опции Дополнительные
 * 4. 05 Ручки Завертки
 * 5. 06 Ограничители
 * Лист «02 Покрытия Цвета» устарел (Domeo_Название цвета и т.д.) — не используется, не пишется в БД.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import * as XLSX from 'xlsx';

const DOORS_CATEGORY_ID = 'cmlg8vri200037kf4bec1l5bx'; // ID категории "Межкомнатные двери"
const HANDLES_CATEGORY_ID = 'cmlg8vrie00097kf4fhrxoye6'; // ID категории "Ручки и завертки"
const HARDWARE_KITS_CATEGORY_ID = 'cmlg8vrib00077kf4k6psqj6j'; // ID категории "Комплекты фурнитуры"
const LIMITERS_CATEGORY_ID = 'cmlg8vrij000b7kf4smy76yzv'; // ID категории "Ограничители"

export interface ImportResult {
  success: boolean;
  models: { total: number; new: number; updated: number; errors: number };
  coatings: { total: number; new: number; updated: number; errors: number };
  edges: { total: number; new: number; updated: number; errors: number };
  options: { total: number; new: number; updated: number; errors: number };
  handles: { total: number; new: number; updated: number; errors: number };
  limiters: { total: number; new: number; updated: number; errors: number };
  errors: Array<{ sheet: string; row: number; message: string }>;
  warnings: Array<{ sheet: string; row: number; message: string }>;
}

export interface ImportOptions {
  mode: 'preview' | 'import';
  updateMode: 'replace' | 'merge' | 'add_new';
  categoryId?: string;
}

export class DoorsImportService {
  private categoryId: string;
  private errors: Array<{ sheet: string; row: number; message: string }> = [];
  private warnings: Array<{ sheet: string; row: number; message: string }> = [];

  constructor(categoryId: string = DOORS_CATEGORY_ID) {
    this.categoryId = categoryId;
  }

  /**
   * Основной метод импорта
   */
  async importFromFile(
    fileBuffer: Buffer,
    options: ImportOptions
  ): Promise<ImportResult> {
    this.errors = [];
    this.warnings = [];

    try {
      // Читаем Excel файл
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

      // Проверяем наличие всех необходимых листов (02 Покрытия Цвета устарел — не требуем)
      const requiredSheets = [
        '01 Модели Поставщики',
        '03 Кромка',
        '04 Опции Дополнительные',
        '05 Ручки Завертки',
        '06 Ограничители'
      ];

      const missingSheets = requiredSheets.filter(
        sheet => !workbook.SheetNames.includes(sheet)
      );

      if (missingSheets.length > 0) {
        throw new Error(
          `Отсутствуют необходимые листы: ${missingSheets.join(', ')}`
        );
      }

      // Читаем данные из листов (02 Покрытия Цвета не читаем — устарел)
      const sheets = {
        models: this.readSheet(workbook, '01 Модели Поставщики'),
        edges: this.readSheet(workbook, '03 Кромка'),
        options: this.readSheet(workbook, '04 Опции Дополнительные'),
        handles: this.readSheet(workbook, '05 Ручки Завертки'),
        limiters: this.readSheet(workbook, '06 Ограничители')
      };

      // Импортируем данные в правильном порядке
      const results: ImportResult = {
        success: true,
        models: { total: 0, new: 0, updated: 0, errors: 0 },
        coatings: { total: 0, new: 0, updated: 0, errors: 0 },
        edges: { total: 0, new: 0, updated: 0, errors: 0 },
        options: { total: 0, new: 0, updated: 0, errors: 0 },
        handles: { total: 0, new: 0, updated: 0, errors: 0 },
        limiters: { total: 0, new: 0, updated: 0, errors: 0 },
        errors: [],
        warnings: []
      };

      if (options.mode === 'preview') {
        results.models = this.previewModels(sheets.models);
        results.edges = this.previewEdges(sheets.edges);
        results.options = this.previewOptions(sheets.options);
        results.handles = this.previewHandles(sheets.handles);
        results.limiters = this.previewLimiters(sheets.limiters);
      } else {
        results.models = await this.importModels(sheets.models, options.updateMode);
        results.edges = await this.importEdges(sheets.edges, options.updateMode);
        results.options = await this.importOptions(sheets.options, options.updateMode);
        results.handles = await this.importHandles(sheets.handles, options.updateMode);
        results.limiters = await this.importLimiters(sheets.limiters, options.updateMode);
      }

      results.errors = this.errors;
      results.warnings = this.warnings;

      return results;
    } catch (error) {
      logger.error('Doors import error', 'doors-import-service', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        models: { total: 0, new: 0, updated: 0, errors: 0 },
        coatings: { total: 0, new: 0, updated: 0, errors: 0 },
        edges: { total: 0, new: 0, updated: 0, errors: 0 },
        options: { total: 0, new: 0, updated: 0, errors: 0 },
        handles: { total: 0, new: 0, updated: 0, errors: 0 },
        limiters: { total: 0, new: 0, updated: 0, errors: 0 },
        errors: [
          {
            sheet: 'Общий',
            row: 0,
            message: error instanceof Error ? error.message : String(error)
          }
        ],
        warnings: []
      };
    }
  }

  /**
   * Читает лист из Excel файла
   */
  private readSheet(workbook: XLSX.WorkBook, sheetName: string): any[] {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Лист "${sheetName}" не найден`);
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false
    });

    if (jsonData.length < 2) {
      return [];
    }

    // Первая строка - заголовки
    const headers = (jsonData[0] as string[]).map(h => String(h).trim());
    const rows = jsonData.slice(1) as any[][];

    // Преобразуем в объекты
    return rows.map((row, index) => {
      const obj: any = { _rowIndex: index + 2 }; // +2 потому что первая строка заголовки и индексация с 1
      headers.forEach((header, colIndex) => {
        if (header) {
          obj[header] = row[colIndex] !== undefined ? String(row[colIndex]).trim() : '';
        }
      });
      return obj;
    });
  }

  /**
   * Импорт моделей (лист 01)
   */
  private async importModels(
    data: any[],
    updateMode: 'replace' | 'merge' | 'add_new'
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      try {
        const modelName = row['Модель (наша)'];
        const style = row['Стиль'];
        const sizesJson = row['Размеры (JSON)'];
        const priceRrc = parseFloat(row['Цена РРЦ (руб)']) || 0;

        if (!modelName || !style) {
          this.addError('01 Модели Поставщики', row._rowIndex, 'Отсутствует модель или стиль');
          result.errors++;
          continue;
        }

        // Парсим размеры
        let sizes: { widths: number[]; heights: number[] } = { widths: [], heights: [] };
        try {
          if (sizesJson) {
            sizes = JSON.parse(sizesJson);
          }
        } catch (e) {
          this.addWarning('01 Модели Поставщики', row._rowIndex, 'Не удалось распарсить размеры JSON');
        }

        // Создаем товар для каждого размера
        for (const width of sizes.widths || []) {
          for (const height of sizes.heights || []) {
            const sku = `DOOR_${modelName}_${width}x${height}_${Date.now()}`;
            const name = `${modelName} (${width} × ${height} мм)`;

            // Формируем properties_data
            const propertiesData: any = {
              'Domeo_Стиль Web': style,
              'Domeo_наименование модели для Web': modelName,
              'Ширина/мм': width,
              'Высота/мм': height,
              'Толщина (мм)': row['Толщина (мм)'] || '',
              'Код наполнения': row['Код наполнения'] || '',
              'Название наполнения': row['Название наполнения'] || '',
              'Звукоизоляция (дБ)': row['Звукоизоляция (дБ)'] || '',
              'Поставщик': row['Поставщик'] || '',
              'Фабрика_Коллекция': row['Фабрика_Коллекция'] || '',
              'Цена опт (руб)': row['Цена опт (руб)'] || '',
              'Цена РРЦ (руб)': priceRrc,
              'Надбавка 2301-2500мм (%)': row['Надбавка 2301-2500мм (%)'] || '',
              'Надбавка 2501-3000мм (%)': row['Надбавка 2501-3000мм (%)'] || '',
              'Реверс доступен (Да/Нет)': row['Реверс доступен (Да/Нет)'] || '',
              'Надбавка за реверс (руб)': row['Надбавка за реверс (руб)'] || '',
              'Зеркало доступно (Да/Нет)': row['Зеркало доступно (Да/Нет)'] || '',
              'Порог доступен (Да/Нет)': row['Порог доступен (Да/Нет)'] || '',
              'Цена порога (руб)': row['Цена порога (руб)'] || ''
            };

            const productData = {
              catalog_category_id: this.categoryId,
              sku,
              name,
              base_price: priceRrc,
              currency: 'RUB',
              properties_data: JSON.stringify(propertiesData),
              dimensions: JSON.stringify({ width, height }),
              is_active: true
            };

            if (updateMode === 'add_new') {
              // Только создаем новые
              await prisma.product.create({ data: productData });
              result.new++;
            } else {
              // Ищем существующий товар
              const existing = await prisma.product.findFirst({
                where: {
                  catalog_category_id: this.categoryId,
                  sku: { startsWith: `DOOR_${modelName}_` }
                }
              });

              if (existing) {
                if (updateMode === 'replace') {
                  await prisma.product.update({
                    where: { id: existing.id },
                    data: productData
                  });
                  result.updated++;
                } else {
                  // merge - обновляем только если нужно
                  await prisma.product.update({
                    where: { id: existing.id },
                    data: {
                      ...productData,
                      properties_data: JSON.stringify({
                        ...JSON.parse(existing.properties_data),
                        ...propertiesData
                      })
                    }
                  });
                  result.updated++;
                }
              } else {
                await prisma.product.create({ data: productData });
                result.new++;
              }
            }
          }
        }
      } catch (error) {
        this.addError('01 Модели Поставщики', row._rowIndex, error instanceof Error ? error.message : String(error));
        result.errors++;
      }
    }

    return result;
  }

  /**
   * Предпросмотр моделей
   */
  private previewModels(data: any[]): { total: number; new: number; updated: number; errors: number } {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    // Упрощенная логика для предпросмотра
    for (const row of data) {
      const modelName = row['Модель (наша)'];
      if (!modelName) {
        result.errors++;
      } else {
        // Проверяем существование
        // В реальной реализации нужно проверить в БД
        result.new++;
      }
    }

    return result;
  }

  /**
   * Импорт кромки (лист 03) - обновляет товары моделей с информацией о кромке
   */
  private async importEdges(
    data: any[],
    updateMode: 'replace' | 'merge' | 'add_new'
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      try {
        const modelName = row['Модель (наша)'];
        const edgeAvailable = row['Кромка доступна (Да/Нет)']?.toLowerCase() === 'да';
        const edgeIncluded = row['Кромка включена (Да/Нет)']?.toLowerCase() === 'да';
        const edgeColorName = row['Название цвета кромки'] || '';
        const edgeSurcharge = parseFloat(row['Надбавка за кромку (руб)']) || 0;
        const edgePhoto = row['Фото кромки (путь)'] || '';
        const sortOrder = parseInt(row['Порядок сортировки']) || 0;
        const isActive = row['Активен (Да/Нет)']?.toLowerCase() === 'да';

        if (!modelName) {
          this.addError('03 Кромка', row._rowIndex, 'Отсутствует модель');
          result.errors++;
          continue;
        }

        // Если кромка не доступна, пропускаем
        if (!edgeAvailable) {
          continue;
        }

        // Ищем все товары этой модели по точному совпадению в properties_data
        // Используем поиск по JSON полю "Domeo_наименование модели для Web"
        const modelProducts = await prisma.product.findMany({
          where: {
            catalog_category_id: this.categoryId,
            properties_data: {
              contains: `"Domeo_наименование модели для Web":"${modelName}"`
            },
            is_active: true
          }
        });

        if (modelProducts.length === 0) {
          this.addWarning('03 Кромка', row._rowIndex, `Модель "${modelName}" не найдена. Сначала импортируйте модели.`);
          continue;
        }

        // Обновляем каждый товар модели с информацией о кромке
        for (const product of modelProducts) {
          try {
            const properties = JSON.parse(product.properties_data || '{}');
            
            // Обновляем информацию о кромке
            properties['Кромка доступна'] = edgeAvailable;
            properties['Кромка включена'] = edgeIncluded;
            properties['Название цвета кромки'] = edgeColorName;
            properties['Надбавка за кромку (руб)'] = edgeSurcharge;
            properties['Кромка: Порядок сортировки'] = sortOrder;
            properties['Кромка: Активна'] = isActive;

            // Обновляем фото кромки
            if (!properties.photos) {
              properties.photos = {};
            }
            if (edgePhoto) {
              properties.photos.edge = edgePhoto;
            }

            await prisma.product.update({
              where: { id: product.id },
              data: {
                properties_data: JSON.stringify(properties)
              }
            });

            result.updated++;
          } catch (error) {
            this.addError('03 Кромка', row._rowIndex, `Ошибка обновления товара ${product.sku}: ${error instanceof Error ? error.message : String(error)}`);
            result.errors++;
          }
        }
      } catch (error) {
        this.addError('03 Кромка', row._rowIndex, error instanceof Error ? error.message : String(error));
        result.errors++;
      }
    }

    return result;
  }

  private previewEdges(data: any[]): { total: number; new: number; updated: number; errors: number } {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      const modelName = row['Модель (наша)'];
      const edgeAvailable = row['Кромка доступна (Да/Нет)']?.toLowerCase() === 'да';
      
      if (!modelName) {
        result.errors++;
      } else if (edgeAvailable) {
        // В реальной реализации нужно проверить в БД
        result.updated++;
      }
    }

    return result;
  }

  /**
   * Импорт опций (лист 04) - комплекты фурнитуры в категорию "Комплекты фурнитуры"
   */
  private async importOptions(
    data: any[],
    updateMode: 'replace' | 'merge' | 'add_new'
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      try {
        const hardwareKitId = row['Комплект фурнитуры: ID товара'];
        const hardwareKitName = row['Комплект фурнитуры: Название'];
        const hardwareKitSortOrder = parseInt(row['Комплект фурнитуры: Порядок сортировки']) || 0;
        const hardwareKitActive = row['Комплект фурнитуры: Активен (Да/Нет)']?.toLowerCase() === 'да';

        // Импортируем комплект фурнитуры, если указан
        if (hardwareKitId && hardwareKitName) {
          const propertiesData: any = {
            'Наименование для Web': hardwareKitName,
            'Порядок сортировки': hardwareKitSortOrder
          };

          const productData = {
            catalog_category_id: HARDWARE_KITS_CATEGORY_ID,
            sku: hardwareKitId,
            name: hardwareKitName,
            base_price: 0, // Цена будет установлена отдельно
            currency: 'RUB',
            properties_data: JSON.stringify(propertiesData),
            is_active: hardwareKitActive
          };

          if (updateMode === 'add_new') {
            // Только создаем новые
            await prisma.product.create({ data: productData });
            result.new++;
          } else {
            // Ищем существующий товар по SKU
            const existing = await prisma.product.findUnique({
              where: { sku: hardwareKitId }
            });

            if (existing) {
              if (updateMode === 'replace') {
                await prisma.product.update({
                  where: { id: existing.id },
                  data: productData
                });
                result.updated++;
              } else {
                // merge
                await prisma.product.update({
                  where: { id: existing.id },
                  data: {
                    ...productData,
                    properties_data: JSON.stringify({
                      ...JSON.parse(existing.properties_data),
                      ...propertiesData
                    })
                  }
                });
                result.updated++;
              }
            } else {
              await prisma.product.create({ data: productData });
              result.new++;
            }
          }
        }

        // Обновляем информацию о дополнительных опциях для модели
        const modelName = row['Модель (наша)'];
        if (modelName) {
          const mirrorOneSide = parseFloat(row['Зеркало: Одна сторона (руб)']) || 0;
          const mirrorTwoSides = parseFloat(row['Зеркало: Две стороны (руб)']) || 0;
          const architraveName = row['Наличник: Название'] || '';
          const architraveDescription = row['Наличник: Описание'] || '';
          const architravePhoto = row['Наличник: Фото (путь)'] || '';
          const architraveSortOrder = parseInt(row['Наличник: Порядок сортировки']) || 0;
          const architraveActive = row['Наличник: Активен (Да/Нет)']?.toLowerCase() === 'да';

          // Ищем товары этой модели и обновляем опции
          const modelProducts = await prisma.product.findMany({
            where: {
              catalog_category_id: this.categoryId,
              properties_data: {
                contains: `"Domeo_наименование модели для Web":"${modelName}"`
              },
              is_active: true
            }
          });

          for (const product of modelProducts) {
            try {
              const properties = JSON.parse(product.properties_data || '{}');
              
              // Обновляем информацию о зеркале
              if (mirrorOneSide > 0 || mirrorTwoSides > 0) {
                properties['Зеркало: Одна сторона (руб)'] = mirrorOneSide;
                properties['Зеркало: Две стороны (руб)'] = mirrorTwoSides;
              }

              // Обновляем информацию о наличниках
              if (architraveName) {
                properties['Наличник: Название'] = architraveName;
                properties['Наличник: Описание'] = architraveDescription;
                properties['Наличник: Порядок сортировки'] = architraveSortOrder;
                properties['Наличник: Активен'] = architraveActive;
                
                if (architravePhoto) {
                  if (!properties.photos) {
                    properties.photos = {};
                  }
                  properties.photos.architrave = architravePhoto;
                }
              }

              await prisma.product.update({
                where: { id: product.id },
                data: {
                  properties_data: JSON.stringify(properties)
                }
              });
            } catch (error) {
              // Игнорируем ошибки обновления опций для отдельных товаров
              this.addWarning('04 Опции Дополнительные', row._rowIndex, `Не удалось обновить опции для товара модели ${modelName}`);
            }
          }
        }
      } catch (error) {
        this.addError('04 Опции Дополнительные', row._rowIndex, error instanceof Error ? error.message : String(error));
        result.errors++;
      }
    }

    return result;
  }

  private previewOptions(data: any[]): { total: number; new: number; updated: number; errors: number } {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      const hardwareKitId = row['Комплект фурнитуры: ID товара'];
      const hardwareKitName = row['Комплект фурнитуры: Название'];
      
      if (hardwareKitId && hardwareKitName) {
        // В реальной реализации нужно проверить в БД
        result.new++;
      }
    }

    return result;
  }

  /**
   * Импорт ручек (лист 05) - в категорию "Ручки"
   */
  private async importHandles(
    data: any[],
    updateMode: 'replace' | 'merge' | 'add_new'
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      try {
        const productId = row['ID товара'];
        const name = row['Название (Domeo_наименование для Web)'];
        const type = row['Тип (Ручка/Завертка)'];
        const group = row['Группа'] || '';
        const priceOpt = parseFloat(row['Цена опт (руб)']) || 0;
        const priceRrc = parseFloat(row['Цена РРЦ (руб)']) || 0;
        const photo = row['Фото (путь)'] || '';
        const description = row['Описание'] || '';
        const sortOrder = parseInt(row['Порядок сортировки']) || 0;
        const isActive = row['Активна (Да/Нет)']?.toLowerCase() === 'да';

        if (!productId || !name) {
          this.addError('05 Ручки Завертки', row._rowIndex, 'Отсутствует ID товара или название');
          result.errors++;
          continue;
        }

        // Формируем properties_data
        const propertiesData: any = {
          'Domeo_наименование для Web': name,
          'Тип': type,
          'Группа': group,
          'Цена опт (руб)': priceOpt,
          'Цена РРЦ (руб)': priceRrc,
          'Описание': description,
          'Порядок сортировки': sortOrder,
          'Фото (путь)': photo
        };

        if (type === 'Завертка' && row['Для завертки: Ручка ID']) {
          propertiesData['Для завертки: Ручка ID'] = row['Для завертки: Ручка ID'];
        }

        const productData = {
          catalog_category_id: HANDLES_CATEGORY_ID,
          sku: productId,
          name: name,
          base_price: priceRrc || priceOpt,
          currency: 'RUB',
          properties_data: JSON.stringify(propertiesData),
          is_active: isActive
        };

        if (updateMode === 'add_new') {
          // Только создаем новые
          await prisma.product.create({ data: productData });
          result.new++;
        } else {
          // Ищем существующий товар по SKU
          const existing = await prisma.product.findUnique({
            where: { sku: productId }
          });

          if (existing) {
            if (updateMode === 'replace') {
              await prisma.product.update({
                where: { id: existing.id },
                data: productData
              });
              result.updated++;
            } else {
              // merge - обновляем только если нужно
              await prisma.product.update({
                where: { id: existing.id },
                data: {
                  ...productData,
                  properties_data: JSON.stringify({
                    ...JSON.parse(existing.properties_data),
                    ...propertiesData
                  })
                }
              });
              result.updated++;
            }
          } else {
            await prisma.product.create({ data: productData });
            result.new++;
          }
        }
      } catch (error) {
        this.addError('05 Ручки Завертки', row._rowIndex, error instanceof Error ? error.message : String(error));
        result.errors++;
      }
    }

    return result;
  }

  private previewHandles(data: any[]): { total: number; new: number; updated: number; errors: number } {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      const productId = row['ID товара'];
      const name = row['Название (Domeo_наименование для Web)'];
      
      if (!productId || !name) {
        result.errors++;
      } else {
        // В реальной реализации нужно проверить в БД
        result.new++;
      }
    }

    return result;
  }

  /**
   * Импорт ограничителей (лист 06) - в категорию "Ограничители"
   * Примечание: категория для ограничителей должна быть создана в дереве каталога
   */
  private async importLimiters(
    data: any[],
    updateMode: 'replace' | 'merge' | 'add_new'
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    // Пытаемся найти категорию для ограничителей
    let limitersCategoryId = LIMITERS_CATEGORY_ID;
    if (!limitersCategoryId) {
      // Пытаемся найти категорию по названию
      const limitersCategory = await prisma.catalogCategory.findFirst({
        where: {
          name: { contains: 'ограничител' }
        }
      });
      
      if (limitersCategory) {
        limitersCategoryId = limitersCategory.id;
      } else {
        this.addWarning('06 Ограничители', 0, 'Категория для ограничителей не найдена. Создайте категорию "Ограничители" в дереве каталога. Пропуск импорта.');
        return result;
      }
    }

    for (const row of data) {
      try {
        const productId = row['ID товара'];
        const name = row['Название'];
        const type = row['Тип (магнитный врезной / напольный / настенный)'] || '';
        const description = row['Описание'] || '';
        const priceOpt = parseFloat(row['Цена опт (руб)']) || 0;
        const priceRrc = parseFloat(row['Цена РРЦ (руб)']) || 0;
        const photo = row['Фото (путь)'] || '';
        const sortOrder = parseInt(row['Порядок сортировки']) || 0;
        const isActive = row['Активен (Да/Нет)']?.toLowerCase() === 'да';
        const note = row['Примечание'] || '';

        if (!productId || !name) {
          this.addError('06 Ограничители', row._rowIndex, 'Отсутствует ID товара или название');
          result.errors++;
          continue;
        }

        // Формируем properties_data
        const propertiesData: any = {
          'Название': name,
          'Тип': type,
          'Описание': description,
          'Цена опт (руб)': priceOpt,
          'Цена РРЦ (руб)': priceRrc,
          'Фото (путь)': photo,
          'Порядок сортировки': sortOrder,
          'Примечание': note
        };

        const productData = {
          catalog_category_id: limitersCategoryId,
          sku: productId,
          name: name,
          base_price: priceRrc || priceOpt,
          currency: 'RUB',
          properties_data: JSON.stringify(propertiesData),
          is_active: isActive
        };

        if (updateMode === 'add_new') {
          // Только создаем новые
          await prisma.product.create({ data: productData });
          result.new++;
        } else {
          // Ищем существующий товар по SKU
          const existing = await prisma.product.findUnique({
            where: { sku: productId }
          });

          if (existing) {
            if (updateMode === 'replace') {
              await prisma.product.update({
                where: { id: existing.id },
                data: productData
              });
              result.updated++;
            } else {
              // merge - обновляем только если нужно
              await prisma.product.update({
                where: { id: existing.id },
                data: {
                  ...productData,
                  properties_data: JSON.stringify({
                    ...JSON.parse(existing.properties_data),
                    ...propertiesData
                  })
                }
              });
              result.updated++;
            }
          } else {
            await prisma.product.create({ data: productData });
            result.new++;
          }
        }
      } catch (error) {
        this.addError('06 Ограничители', row._rowIndex, error instanceof Error ? error.message : String(error));
        result.errors++;
      }
    }

    return result;
  }

  private previewLimiters(data: any[]): { total: number; new: number; updated: number; errors: number } {
    const result = { total: data.length, new: 0, updated: 0, errors: 0 };

    for (const row of data) {
      const productId = row['ID товара'];
      const name = row['Название'];
      
      if (!productId || !name) {
        result.errors++;
      } else {
        // В реальной реализации нужно проверить в БД
        result.new++;
      }
    }

    return result;
  }

  /**
   * Добавляет ошибку
   */
  private addError(sheet: string, row: number, message: string) {
    this.errors.push({ sheet, row, message });
  }

  /**
   * Добавляет предупреждение
   */
  private addWarning(sheet: string, row: number, message: string) {
    this.warnings.push({ sheet, row, message });
  }
}

