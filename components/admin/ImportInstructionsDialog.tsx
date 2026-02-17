'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui';
import { HelpCircle, FileText, Upload, Download, Settings, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface ImportInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportInstructionsDialog({ open, onOpenChange }: ImportInstructionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <span>Инструкция по импорту товаров и фотографий</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 text-sm">
          {/* Обзор */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
              <HelpCircle className="h-4 w-4 mr-2" />
              Обзор системы импорта
            </h3>
            <p className="text-blue-800">
              Система импорта позволяет загружать товары и их фотографии из Excel/CSV файлов. 
              Поддерживается как создание новых товаров, так и обновление существующих.
            </p>
          </div>

          {/* Импорт товаров */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <Upload className="h-4 w-4 mr-2 text-green-600" />
              Импорт товаров
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">1. Подготовка файла</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Формат файла: Excel (.xlsx) или CSV (.csv)</li>
                  <li>Кодировка: UTF-8 (русские символы поддерживаются автоматически)</li>
                  <li>Первая строка должна содержать заголовки столбцов</li>
                  <li>Данные начинаются со второй строки</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">2. Обязательные поля</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>SKU внутреннее</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Артикул поставщика</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Domeo_Название модели для Web</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Ширина/мм</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Высота/мм</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Толщина/мм</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Цена РРЦ</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Цена опт</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Поставщик</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Цвет/Отделка</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">3. Логика импорта</h4>
                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div>
                      <strong>Создание нового товара:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-gray-700">
                        <li>Если поле "SKU внутреннее" пустое - товар создается как новый</li>
                        <li><strong>Все обязательные поля из шаблона должны быть заполнены</strong></li>
                        <li>SKU генерируется автоматически (уникальный во всей БД)</li>
                        <li>Поля, отсутствующие в шаблоне, игнорируются</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                    <div>
                      <strong>Обновление существующего товара:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-gray-700">
                        <li>Если "SKU внутреннее" заполнено и товар найден в той же категории - обновляется</li>
                        <li><strong>Требуется только SKU внутреннее, остальные поля опциональны</strong></li>
                        <li>Обновляются только заполненные поля (режим merge)</li>
                        <li>Пустые поля в файле не изменяют существующие данные</li>
                        <li>Если название не указано в файле, сохраняется текущее из БД</li>
                        <li>Обрабатываются только поля из шаблона категории</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full mt-2"></div>
                    <div>
                      <strong>⚠️ Запрещено:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-gray-700">
                        <li>Импорт товара с SKU из другой категории - будет ошибка</li>
                        <li>SKU должны быть уникальными во всей базе данных</li>
                        <li>При обнаружении конфликта импорт прерывается</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-900 mb-2 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Важные особенности
                </h4>
                <ul className="list-disc list-inside space-y-1 text-yellow-800">
                  <li>Можно загружать частичные файлы (только необходимые столбцы для обновления)</li>
                  <li>Система автоматически исправляет кодировку русских символов</li>
                  <li>Числовые поля сохраняются как числа, текстовые как текст</li>
                  <li>Пустые значения отображаются как "-"</li>
                  <li><strong>Обрабатываются только поля из шаблона категории</strong> - остальные поля игнорируются</li>
                  <li>В режиме preview показываются предупреждения о несуществующих SKU</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Импорт фотографий */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <Upload className="h-4 w-4 mr-2 text-purple-600" />
              Импорт фотографий
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Подготовка фотографий</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Формат: JPG, PNG, WebP</li>
                  <li>Размер: рекомендуется до 2MB на файл</li>
                  <li>Именование: используйте понятные названия файлов</li>
                  <li>Архив: упакуйте все фотографии в ZIP-архив</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Процесс загрузки</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Выберите категорию товаров</li>
                  <li>Перейдите на вкладку "Импорт фотографий"</li>
                  <li>Выберите тип загрузки: <strong>Фото товаров</strong> (properties_data) или <strong>Фото свойств</strong> (property_photos)</li>
                  <li>Выберите свойство для привязки (например, "Артикул поставщика" или "Цвет")</li>
                  <li>Загрузите фотографии (поддерживается массовая загрузка)</li>
                  <li>Система автоматически распределит фотографии по товарам/свойствам</li>
                  <li>Проверьте результаты загрузки</li>
                </ol>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Автоматическое сопоставление</h4>
                <div className="text-blue-800 text-sm space-y-2">
                  <p>
                    Система автоматически сопоставляет фотографии с товарами/свойствами по названию файла и значению выбранного свойства.
                  </p>
                  <div>
                    <strong>Правила именования файлов:</strong>
                    <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                      <li><code>model_name.png</code> → обложка товара</li>
                      <li><code>model_name_1.png</code> → фото галереи #1</li>
                      <li><code>model_name_2.png</code> → фото галереи #2</li>
                      <li>Имя файла (без расширения) должно совпадать со значением свойства привязки</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Управление шаблонами */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <Settings className="h-4 w-4 mr-2 text-orange-600" />
              Управление шаблонами
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Редактирование шаблонов</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Добавляйте новые обязательные поля</li>
                  <li>Удаляйте ненужные поля</li>
                  <li>Изменяйте порядок полей</li>
                  <li>Настраивайте поля для калькулятора</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Экспорт прайс-листов</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Автоматическое включение всех полей свойств</li>
                  <li>Настраиваемый порядок столбцов</li>
                  <li>Поддержка фильтрации по категориям</li>
                  <li>Экспорт в Excel и CSV форматах</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Обработка ошибок */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <XCircle className="h-4 w-4 mr-2 text-red-600" />
              Обработка ошибок
            </h3>
            
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-900 mb-2">Типы ошибок</h4>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li><strong>Ошибки валидации:</strong> отсутствуют обязательные поля</li>
                  <li><strong>Ошибки формата:</strong> неправильный формат данных</li>
                  <li><strong>Ошибки кодировки:</strong> проблемы с русскими символами</li>
                  <li><strong>Ошибки базы данных:</strong> проблемы при сохранении</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">Отчет о загрузке</h4>
                <p className="text-green-800 text-sm">
                  После завершения импорта система показывает подробный отчет:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-green-800">
                  <li>Количество созданных товаров</li>
                  <li>Количество обновленных товаров</li>
                  <li>Количество ошибок</li>
                  <li>Список проблемных строк</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Контакты поддержки */}
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Нужна помощь?</h4>
            <p className="text-gray-700 text-sm">
              Если у вас возникли вопросы или проблемы с импортом, обратитесь к администратору системы 
              или проверьте логи ошибок в консоли браузера.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
