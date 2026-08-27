import { AwsClient } from "npm:aws4fetch@1.0.20"
import { createClient } from "npm:@supabase/supabase-js@2"
import { detectMediaSignature, type MediaKind } from "./mediaSignature.ts"
import { readLimitedBody } from "./requestBody.ts"

const MAX_MEDIA_BYTES = 25 * 1024 * 1024
// The per-file limit plus room for multipart framing and the dimension fields.
const MAX_REQUEST_BYTES = MAX_MEDIA_BYTES + 64 * 1024
const MAX_MEDIA_DIMENSION = 100_000

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

function declaredMediaKind(type: string): MediaKind | null {
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("audio/")) return "audio"
  if (type.startsWith("video/")) return "video"
  return null
}

function readDimension(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null

  const parsed = Number(value)
  if (
    !Number.isInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_MEDIA_DIMENSION
  ) {
    return null
  }

  return parsed
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const accountId = Deno.env.get("R2_ACCOUNT_ID")
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")
  const bucket = Deno.env.get("R2_BUCKET") ?? "pulse-quiz-question-media"

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !accountId ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    return jsonResponse({ error: "Media uploads are unavailable" }, 503)
  }

  const token = authorization.slice("Bearer ".length)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } =
    await userClient.auth.getUser(token)
  if (userError || !userData.user) {
    return jsonResponse({ error: "Invalid authorization" }, 401)
  }

  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "File exceeds 25 MB" }, 413)
  }

  const body = await readLimitedBody(request, MAX_REQUEST_BYTES)
  if (body === "too-large") {
    return jsonResponse({ error: "File exceeds 25 MB" }, 413)
  }
  if (body === "empty") {
    return jsonResponse({ error: "Expected multipart form data" }, 400)
  }

  let formData: FormData
  try {
    formData = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData()
  } catch {
    return jsonResponse({ error: "Expected multipart form data" }, 400)
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return jsonResponse({ error: "Expected a media file" }, 400)
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return jsonResponse({ error: "File exceeds 25 MB" }, 413)
  }

  const declaredKind = declaredMediaKind(file.type)
  if (!declaredKind) {
    return jsonResponse({ error: "Unsupported file type" }, 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = detectMediaSignature(bytes)
  if (!signature || signature.kind !== declaredKind) {
    return jsonResponse({ error: "Unsupported file type" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: quota, error: quotaError } = await admin.rpc(
    "reserve_media_storage",
    { p_account_id: userData.user.id, p_incoming_bytes: bytes.length },
  )

  if (quotaError || !quota) {
    return jsonResponse({ error: "Media uploads are unavailable" }, 503)
  }

  if (!quota.allowed) {
    return jsonResponse(
      {
        error: "Storage quota reached",
        usedBytes: quota.usedBytes,
        limitBytes: quota.limitBytes,
      },
      409,
    )
  }

  const assetId = crypto.randomUUID()
  const objectPath = `assets/${assetId}.${signature.extension}`
  const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectPath}`
  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  })

  try {
    const putResponse = await r2.fetch(objectUrl, {
      method: "PUT",
      body: bytes,
      headers: {
        "content-type": file.type,
        "content-length": String(bytes.length),
        "cache-control": "public, max-age=31536000, immutable",
      },
    })

    if (!putResponse.ok) {
      return jsonResponse({ error: "Could not store this media file" }, 503)
    }
  } catch {
    return jsonResponse({ error: "Could not store this media file" }, 503)
  }

  const { error: assetError } = await admin.from("media_assets").insert({
    id: assetId,
    owner_id: userData.user.id,
    bucket_id: bucket,
    object_path: objectPath,
    size_bytes: bytes.length,
    status: "ready",
  })

  if (assetError) {
    await r2.fetch(objectUrl, { method: "DELETE" }).catch(() => undefined)
    return jsonResponse({ error: "Could not save this media file" }, 503)
  }

  const width = readDimension(formData.get("width"))
  const height = readDimension(formData.get("height"))

  return jsonResponse({
    assetId,
    path: objectPath,
    kind: signature.kind,
    ...(width && height ? { width, height } : {}),
  })
})
