/**
 * Buffer a request body, refusing it the moment it passes the limit. Handing an
 * oversized body straight to formData() costs the worker its memory limit
 * before any size check can run, and content-length alone cannot be trusted.
 */
export async function readLimitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return "empty" as const

  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return "too-large" as const
    }

    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
}
