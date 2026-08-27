import { supabase } from "@/services/supabase"

// Question media lives in a private R2 bucket, so its URLs expire. The resolver
// batches issuance through the `media-url` Edge Function and holds the results
// until shortly before they lapse.
//
// It also dual-reads during the cutover: an asset whose bytes are still in
// Supabase Storage resolves to the legacy public URL instead, and every such
// resolution is logged so the switch in step 8 can be made on evidence.

const LEGACY_BUCKET = "question-media"
// Drop a presigned URL five minutes early so a fetch started mid-question
// cannot race its own deadline.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000
// A legacy asset only becomes an R2 asset when the migration moves it, so this
// is a throttle on repeat calls rather than an expiry.
const LEGACY_CACHE_MS = 10 * 60 * 1000

type CacheEntry = { url: string; staleAt: number }
type MediaUrlResponse = {
  urls?: Record<string, { url?: unknown; expiresAt?: unknown } | null>
  legacy?: unknown
}

export type MediaUrlOptions = { sessionId?: string | null }

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<CacheEntry>>()

function legacyPublicUrl(path: string) {
  return supabase.storage.from(LEGACY_BUCKET).getPublicUrl(path).data.publicUrl
}

function reportFallback(paths: string[], reason: string) {
  if (!paths.length) return
  console.warn(
    `[media-url] falling back to legacy storage (${reason}): ${paths.join(", ")}`,
  )
}

function legacyEntry(now: number, path: string): CacheEntry {
  return { url: legacyPublicUrl(path), staleAt: now + LEGACY_CACHE_MS }
}

function readResponse(data: unknown, paths: string[], now: number) {
  const entries = new Map<string, CacheEntry>()
  const fellBack: string[] = []
  const response = (data ?? {}) as MediaUrlResponse
  const urls = response.urls ?? {}

  for (const path of paths) {
    const issued = urls[path]
    const url = typeof issued?.url === "string" ? issued.url : null
    const expiresAt =
      typeof issued?.expiresAt === "number" ? issued.expiresAt : null

    if (url && expiresAt) {
      entries.set(path, {
        url,
        staleAt: expiresAt * 1000 - EXPIRY_MARGIN_MS,
      })
      continue
    }

    fellBack.push(path)
    entries.set(path, legacyEntry(now, path))
  }

  reportFallback(fellBack, "asset not migrated")
  return entries
}

async function requestUrls(
  paths: string[],
  options: MediaUrlOptions,
): Promise<Map<string, CacheEntry>> {
  const now = Date.now()

  try {
    const { data, error } = await supabase.functions.invoke("media-url", {
      body: { paths, sessionId: options.sessionId ?? null },
    })

    if (error) throw error

    return readResponse(data, paths, now)
  } catch (error) {
    reportFallback(
      paths,
      error instanceof Error ? error.message : "request failed",
    )

    // staleAt 0 keeps a failed call out of the cache, so the next refresh
    // retries the function instead of pinning the app to legacy storage.
    return new Map(
      paths.map((path) => [path, { url: legacyPublicUrl(path), staleAt: 0 }]),
    )
  }
}

/** The cached URL for a path, or null when none is held or it has gone stale. */
export function getCachedMediaUrl(path: string): string | null {
  const entry = cache.get(path)
  if (!entry || entry.staleAt <= Date.now()) return null
  return entry.url
}

export function clearMediaUrlCache() {
  cache.clear()
  pending.clear()
}

/** Resolve a batch of asset paths to playable URLs. */
export async function resolveMediaUrls(
  paths: readonly string[],
  options: MediaUrlOptions = {},
): Promise<Map<string, string>> {
  const now = Date.now()
  const resolved = new Map<string, string>()
  const awaited: Array<Promise<void>> = []
  const missing: string[] = []

  for (const path of new Set(paths)) {
    const entry = cache.get(path)
    if (entry && entry.staleAt > now) {
      resolved.set(path, entry.url)
      continue
    }

    const inFlight = pending.get(path)
    if (inFlight) {
      awaited.push(
        inFlight.then((ready) => {
          resolved.set(path, ready.url)
        }),
      )
      continue
    }

    missing.push(path)
  }

  if (missing.length) {
    const request = requestUrls(missing, options)

    for (const path of missing) {
      const entryPromise = request.then((entries) => {
        const entry = entries.get(path) ?? legacyEntry(Date.now(), path)
        if (entry.staleAt > Date.now()) cache.set(path, entry)
        return entry
      })

      pending.set(path, entryPromise)
      awaited.push(
        entryPromise
          .then((entry) => {
            resolved.set(path, entry.url)
          })
          .finally(() => {
            if (pending.get(path) === entryPromise) pending.delete(path)
          }),
      )
    }
  }

  await Promise.all(awaited)
  return resolved
}

/** Resolve a single asset path. */
export async function resolveMediaUrl(
  path: string,
  options: MediaUrlOptions = {},
): Promise<string | null> {
  const resolved = await resolveMediaUrls([path], options)
  return resolved.get(path) ?? null
}
