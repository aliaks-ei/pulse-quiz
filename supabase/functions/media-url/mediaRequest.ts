// Request shape for the media-url function, kept apart from the Deno entry
// point so it can be unit tested with the rest of the suite.

export const MAX_REQUESTED_PATHS = 100
const MAX_PATH_LENGTH = 512
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MediaUrlRequest = {
  paths: string[]
  sessionId: string | null
}

export type ParsedMediaUrlRequest =
  | { ok: true; request: MediaUrlRequest }
  | { ok: false; error: string }

export function parseMediaUrlRequest(payload: unknown): ParsedMediaUrlRequest {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Expected a JSON body" }
  }

  const { paths, sessionId } = payload as {
    paths?: unknown
    sessionId?: unknown
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, error: "Expected at least one media path" }
  }

  if (paths.length > MAX_REQUESTED_PATHS) {
    return {
      ok: false,
      error: `Request at most ${MAX_REQUESTED_PATHS} media paths`,
    }
  }

  const unique = new Set<string>()
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      path.length > MAX_PATH_LENGTH
    ) {
      return { ok: false, error: "Media paths must be non-empty strings" }
    }

    unique.add(path)
  }

  if (
    sessionId !== undefined &&
    sessionId !== null &&
    (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId))
  ) {
    return { ok: false, error: "Session id must be a uuid" }
  }

  return {
    ok: true,
    request: {
      paths: [...unique],
      sessionId: typeof sessionId === "string" ? sessionId : null,
    },
  }
}
