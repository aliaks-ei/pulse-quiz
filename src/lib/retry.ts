export type BackoffOptions = {
  retries?: number
  baseMs?: number
  maxMs?: number
  jitter?: boolean
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

const DEFAULT_RETRIES = 4
const DEFAULT_BASE_MS = 300
const DEFAULT_MAX_MS = 5_000

export function jitterMs(value: number) {
  return Math.floor(value * (0.5 + Math.random() * 0.5))
}

export function backoffDelay(attempt: number, options: BackoffOptions = {}) {
  const base = options.baseMs ?? DEFAULT_BASE_MS
  const max = options.maxMs ?? DEFAULT_MAX_MS
  const raw = Math.min(max, base * 2 ** attempt)
  return options.jitter === false ? raw : jitterMs(raw)
}

export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) break
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, options)),
      )
    }
  }

  throw lastError
}
