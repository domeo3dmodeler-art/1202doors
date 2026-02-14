import { NextRequest, NextResponse } from 'next/server';
import { FormulaEngine, type Variable, type Formula } from '@/lib/calculator/FormulaEngine';
import { catalogDataSource } from '@/lib/calculator/CatalogDataSource';
import { logger } from '@/lib/logging/logger';

interface CalculatorVariable {
  id: string;
  name: string;
  type: string;
  defaultValue?: unknown;
}

interface CalculatorConfig {
  variables?: CalculatorVariable[];
  formulas?: Array<{
    id: string;
    name: string;
    expression: string;
    variables?: string[];
  }>;
  elements?: Array<{
    id: string;
    name: string;
    type: string;
    config?: {
      formula?: string;
      variables?: string[];
    };
  }>;
}

interface CalculationResult {
  value?: number;
  error?: string;
}

/**
 * 🧮 Выполнить расчеты калькулятора
 */
export async function POST(req: NextRequest) {
  try {
    const { config, values }: { config: CalculatorConfig; values: Record<string, unknown> } = await req.json();
    
    if (!config) {
      return NextResponse.json(
        { error: 'Конфигурация калькулятора не предоставлена' },
        { status: 400 }
      );
    }

    // Создаем движок формул
    const engine = new FormulaEngine();

    // Добавляем переменные
    if (config.variables) {
      config.variables.forEach((variable: CalculatorVariable) => {
        const engineVariable: Variable = {
          id: variable.id,
          name: variable.name,
          type: variable.type as Variable['type'],
          value: values[variable.id] !== undefined ? values[variable.id] : variable.defaultValue,
          source: 'input'
        };
        engine.addVariable(engineVariable);
      });
    }

    // Добавляем формулы
    const results: Record<string, CalculationResult | number> = {};
    
    if (config.formulas) {
      for (const formula of config.formulas) {
        try {
          const engineFormula: Formula = {
            id: formula.id,
            name: formula.name,
            expression: formula.expression,
            variables: formula.variables || [],
            resultType: 'number'
          };
          
          engine.addFormula(engineFormula);
          const result = engine.calculate(formula.id);
          results[formula.id] = result as number | CalculationResult;
        } catch (error) {
          logger.error('Ошибка вычисления формулы', 'calculator/execute', { formulaId: formula.id, error: error instanceof Error ? error.message : String(error) });
          results[formula.id] = { error: error instanceof Error ? error.message : 'Ошибка вычисления' };
        }
      }
    }

    // Добавляем формулы из элементов
    if (config.elements) {
      for (const element of config.elements) {
        if ((element.type === 'formula' || element.type === 'output') && element.config?.formula) {
          try {
            const engineFormula: Formula = {
              id: element.id,
              name: element.name,
              expression: element.config.formula,
              variables: element.config.variables || [],
              resultType: 'number'
            };
            
            engine.addFormula(engineFormula);
            const result = engine.calculate(element.id);
            results[element.id] = result as number | CalculationResult;
          } catch (error) {
            logger.error('Ошибка вычисления элемента', 'calculator/execute', { elementId: element.id, error: error instanceof Error ? error.message : String(error) });
            results[element.id] = { error: error instanceof Error ? error.message : 'Ошибка вычисления' };
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Ошибка выполнения калькулятора', 'calculator/execute', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { 
        error: 'Ошибка при выполнении расчетов',
        details: error instanceof Error ? error.message : 'Неизвестная ошибка'
      },
      { status: 500 }
    );
  }
}

/**
 * 📊 Получить данные из каталога для калькулятора
 */
export async function GET(req: NextRequest) {
  let action: string | null = null;
  try {
    const { searchParams } = new URL(req.url);
    action = searchParams.get('action');
    
    switch (action) {
      case 'categories':
        const categories = await catalogDataSource.getCategories();
        return NextResponse.json({ success: true, categories });
        
      case 'products':
        const categoryId = searchParams.get('categoryId');
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');
        
        const products = await catalogDataSource.findProducts({
          categoryId: categoryId || undefined,
          limit,
          offset
        });
        
        return NextResponse.json({ success: true, products });
        
      case 'product':
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json(
            { error: 'ID товара не указан' },
            { status: 400 }
          );
        }
        
        const product = await catalogDataSource.getProduct(productId);
        return NextResponse.json({ success: true, product });
        
      case 'properties':
        const catId = searchParams.get('categoryId');
        if (!catId) {
          return NextResponse.json(
            { error: 'ID категории не указан' },
            { status: 400 }
          );
        }
        
        const properties = await catalogDataSource.getCategoryProperties(catId);
        return NextResponse.json({ success: true, properties });
        
      case 'stats':
        const statsCategoryId = searchParams.get('categoryId');
        const stats = await catalogDataSource.getProductStats(statsCategoryId || undefined);
        return NextResponse.json({ success: true, stats });
        
      default:
        return NextResponse.json(
          { error: 'Неизвестное действие' },
          { status: 400 }
        );
    }

  } catch (error) {
    logger.error('Ошибка получения данных каталога', 'calculator/execute', error instanceof Error ? { error: error.message, stack: error.stack, action: action ?? undefined } : { error: String(error), action: action ?? undefined });
    return NextResponse.json(
      { 
        error: 'Ошибка при получении данных каталога',
        details: error instanceof Error ? error.message : 'Неизвестная ошибка'
      },
      { status: 500 }
    );
  }
}
