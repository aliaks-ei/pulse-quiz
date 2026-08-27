import { AwsClient } from "npm:aws4fetch@1.0.20"
import { createClient } from "npm:@supabase/supabase-js@2"
import { parseMediaUrlRequest } from "./mediaRequest.ts"

// Longer than any single game, short enough that a leaked URL expires on its
// own. The client re-mints on the next session snapshot refresh.
const URL_TTL_SECONDS = 2 * 60 * 60
const LEGACY_BUCKET = "question-media"

type AuthorizedPath = {
  object_path: string
  bucket_id: string
  authorized: boolean
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(null, 204)
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const accountId = Deno.env.get("R2_ACCOUNT_ID")
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")
  const bucket = Deno.env.get("R2_BUCKET") ?? "pulse-quiz-question-media"

  if (
    !supabaseUrl ||
    !anonKey ||
    !accountId ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    return jsonResponse({ error: "Media is unavailable" }, 503)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: "Expected a JSON body" }, 400)
  }

  const parsed = parseMediaUrlRequest(payload)
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400)

  const token = authorization.slice("Bearer ".length)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } =
    await userClient.auth.getUser(token)
  if (userError || !userData.user) {
    return jsonResponse({ error: "Invalid authorization" }, 401)
  }

  // Authorization stays in Postgres: the call runs as the caller, so the
  // function reads their own auth.uid() rather than trusting anything here.
  const { data, error } = await userClient.rpc("authorize_media_paths", {
    p_paths: parsed.request.paths,
    p_session_id: parsed.request.sessionId,
  })

  if (error) {
    return jsonResponse({ error: "Media is unavailable" }, 503)
  }

  const resolved = (data ?? []) as AuthorizedPath[]
  const byPath = new Map(resolved.map((row) => [row.object_path, row]))

  if (parsed.request.paths.some((path) => !byPath.has(path))) {
    return jsonResponse({ error: "Unknown asset" }, 404)
  }

  if (resolved.some((row) => !row.authorized)) {
    return jsonResponse({ error: "Not authorized for this media" }, 403)
  }

  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  })
  const expiresAt = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS
  const urls: Record<string, { url: string; expiresAt: number }> = {}
  // Assets still held in Supabase Storage. The client keeps reading them from
  // the legacy public URL until the migration in step 8 moves the bytes.
  const legacy: string[] = []

  for (const row of resolved) {
    if (row.bucket_id === LEGACY_BUCKET) {
      legacy.push(row.object_path)
      continue
    }

    const objectUrl = new URL(
      `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${row.object_path}`,
    )
    objectUrl.searchParams.set("X-Amz-Expires", String(URL_TTL_SECONDS))

    try {
      const signed = await r2.sign(objectUrl.toString(), {
        method: "GET",
        aws: { signQuery: true },
      })
      urls[row.object_path] = { url: signed.url, expiresAt }
    } catch {
      return jsonResponse({ error: "Media is unavailable" }, 503)
    }
  }

  return jsonResponse({ urls, legacy })
})
