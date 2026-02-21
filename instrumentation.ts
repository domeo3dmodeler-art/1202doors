/**
 * Next.js instrumentation: запускается на сервере при старте.
 * В режиме dev перехватываем сетевые ошибки (ETIMEDOUT, ECONNREFUSED), чтобы один
 * таймаут к БД/внешнему сервису не ронял весь процесс (502 на ВМ).
 */
export async function register() {
  if (process.env.NODE_ENV !== 'development') return

  const connectionErrorCodes = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

  function isConnectionError(err: unknown): boolean {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    return typeof code === 'string' && connectionErrorCodes.has(code)
  }

  process.on('uncaughtException', (err: Error) => {
    console.error('[instrumentation] uncaughtException:', err?.message || err)
    if (isConnectionError(err)) {
      console.error('[instrumentation] Connection error in dev — process kept alive. Fix DATABASE_URL or network.')
      return
    }
    process.exit(1)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[instrumentation] unhandledRejection:', reason)
    const err = reason instanceof Error ? reason : new Error(String(reason))
    if (isConnectionError(err)) {
      console.error('[instrumentation] Connection rejection in dev — process kept alive.')
      return
    }
    process.exit(1)
  })
}
