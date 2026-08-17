import { createClient } from "npm:@supabase/supabase-js@2"

const AVATAR_BUCKET = "player-avatars"
const MAX_AVATAR_BYTES = 1024 * 1024
const MAX_READY_AVATARS_PER_USER = 10
const MAX_AVATAR_DIMENSION = 2048
const MAX_AVATAR_PIXELS = 4_000_000

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  })
}

function isWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

function readWebpDimensions(bytes: Uint8Array) {
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const chunkType = new TextDecoder().decode(bytes.slice(offset, offset + 4))
    const chunkSize = readUint32LittleEndian(bytes, offset + 4)
    const dataOffset = offset + 8
    const nextOffset = dataOffset + chunkSize + (chunkSize % 2)
    if (nextOffset > bytes.length) return null

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width:
          1 +
          bytes[dataOffset + 4] +
          (bytes[dataOffset + 5] << 8) +
          (bytes[dataOffset + 6] << 16),
        height:
          1 +
          bytes[dataOffset + 7] +
          (bytes[dataOffset + 8] << 8) +
          (bytes[dataOffset + 9] << 16),
      }
    }

    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
        height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff,
      }
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const width =
        1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8)
      const height =
        1 +
        (bytes[dataOffset + 2] >> 6) +
        (bytes[dataOffset + 3] << 2) +
        ((bytes[dataOffset + 4] & 0x0f) << 10)
      return { width, height }
    }

    offset = nextOffset
  }

  return null
}

function hasSafeWebpDimensions(bytes: Uint8Array) {
  const dimensions = readWebpDimensions(bytes)
  return (
    dimensions !== null &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width <= MAX_AVATAR_DIMENSION &&
    dimensions.height <= MAX_AVATAR_DIMENSION &&
    dimensions.width * dimensions.height <= MAX_AVATAR_PIXELS
  )
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(null, 204)
  if (request.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405)

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Avatar uploads are unavailable" }, 503)
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonResponse({ error: "Expected multipart form data" }, 400)
  }

  const avatar = formData.get("avatar")
  if (!(avatar instanceof File)) {
    return jsonResponse({ error: "Expected an avatar image" }, 400)
  }

  if (
    avatar.type !== "image/webp" ||
    avatar.size === 0 ||
    avatar.size > MAX_AVATAR_BYTES
  ) {
    return jsonResponse(
      { error: "Avatar must be a WebP image of 1 MB or less" },
      400,
    )
  }

  const bytes = new Uint8Array(await avatar.arrayBuffer())
  if (!isWebp(bytes) || !hasSafeWebpDimensions(bytes)) {
    return jsonResponse({ error: "Avatar file contents are invalid" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { count, error: countError } = await admin
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userData.user.id)
    .eq("bucket_id", AVATAR_BUCKET)
    .eq("status", "ready")

  if (countError)
    return jsonResponse({ error: "Avatar uploads are unavailable" }, 503)
  if ((count ?? 0) >= MAX_READY_AVATARS_PER_USER) {
    return jsonResponse({ error: "You can keep up to 10 avatars" }, 409)
  }

  const assetId = crypto.randomUUID()
  const objectPath = `assets/${assetId}.webp`
  const { error: uploadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(objectPath, bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    })

  if (uploadError)
    return jsonResponse({ error: "Could not store this avatar" }, 503)

  const { error: assetError } = await admin.from("media_assets").insert({
    id: assetId,
    owner_id: userData.user.id,
    bucket_id: AVATAR_BUCKET,
    object_path: objectPath,
    status: "ready",
  })

  if (assetError) {
    await admin.storage.from(AVATAR_BUCKET).remove([objectPath])
    return jsonResponse({ error: "Could not save this avatar" }, 503)
  }

  return jsonResponse({ id: assetId, objectPath })
})
