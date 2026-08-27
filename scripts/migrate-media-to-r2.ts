import { createHash } from "node:crypto"

import { AwsClient } from "aws4fetch"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// One-shot move of question media from the public Supabase Storage bucket to
// the private R2 bucket that `upload-question-media` already writes to.
//
// Only objects a question still references are moved, so the orphans the reap
// script leaves behind are never copied. The object path is kept byte for byte,
// which means `questions.media.path` needs no rewrite and a half-finished run
// leaves a working app: `media-url` presigns whatever has moved and reports the
// rest as legacy, and `src/lib/mediaUrl.ts` falls back for those.

const LEGACY_BUCKET = "question-media"
const PAGE_SIZE = 1000
const LOOKUP_BATCH_SIZE = 200

type MediaValue = { path?: unknown } | null
type QuestionRow = {
  game_id: string
  media: MediaValue
  reveal_media: MediaValue
}
type GameRow = { id: string; owner_id: string }
type AssetRow = {
  id: string
  owner_id: string
  bucket_id: string
  object_path: string
}

export type PendingCopy = {
  path: string
  assetId: string | null
  ownerId: string
}

export type MigrationPlan = {
  pending: PendingCopy[]
  migrated: string[]
  unowned: string[]
}

/** Every media path a question points at, mapped to the quiz owner. */
export function referencedMedia(
  rows: QuestionRow[],
  ownerByGame: Map<string, string>,
): Map<string, string | null> {
  const referenced = new Map<string, string | null>()

  for (const row of rows) {
    for (const media of [row.media, row.reveal_media]) {
      if (!media || typeof media.path !== "string" || media.path.length === 0) {
        continue
      }

      const owner = ownerByGame.get(row.game_id) ?? null
      if (!referenced.get(media.path)) referenced.set(media.path, owner)
    }
  }

  return referenced
}

/**
 * Split the referenced paths into what still has to move, what is already in
 * R2, and what cannot be moved because no owner can be established for it.
 */
export function planMigration(
  referenced: Map<string, string | null>,
  assets: AssetRow[],
  targetBucket: string,
): MigrationPlan {
  const byPath = new Map<string, AssetRow[]>()
  for (const asset of assets) {
    const existing = byPath.get(asset.object_path)
    if (existing) existing.push(asset)
    else byPath.set(asset.object_path, [asset])
  }

  const plan: MigrationPlan = { pending: [], migrated: [], unowned: [] }

  for (const [path, gameOwnerId] of referenced) {
    const rows = byPath.get(path) ?? []

    if (rows.some((row) => row.bucket_id === targetBucket)) {
      plan.migrated.push(path)
      continue
    }

    const legacyRow = rows[0] ?? null
    const ownerId = legacyRow?.owner_id ?? gameOwnerId

    if (!ownerId) {
      plan.unowned.push(path)
      continue
    }

    plan.pending.push({ path, assetId: legacyRow?.id ?? null, ownerId })
  }

  return plan
}

/** R2 returns the object's MD5 as its ETag for a single-part upload. */
export function etagMatches(etag: string | null, md5Hex: string): boolean {
  if (!etag) return false
  return etag.replace(/^(W\/)?"|"$/g, "").toLowerCase() === md5Hex.toLowerCase()
}

function formatBytes(bytes: number): string {
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 2,
  }).format(bytes / 1024 / 1024)
}

async function fetchGameOwners(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  const owners = new Map<string, string>()

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("games")
      .select("id,owner_id")
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Could not read games: ${error.message}`)

    for (const row of (data ?? []) as GameRow[]) {
      owners.set(row.id, row.owner_id)
    }

    if (!data || data.length < PAGE_SIZE) break
  }

  return owners
}

async function fetchQuestions(client: SupabaseClient): Promise<QuestionRow[]> {
  const rows: QuestionRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("questions")
      .select("game_id,media,reveal_media")
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Could not read questions: ${error.message}`)
    rows.push(...((data ?? []) as QuestionRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  return rows
}

async function fetchAssets(
  client: SupabaseClient,
  paths: string[],
): Promise<AssetRow[]> {
  const assets: AssetRow[] = []

  for (let index = 0; index < paths.length; index += LOOKUP_BATCH_SIZE) {
    const batch = paths.slice(index, index + LOOKUP_BATCH_SIZE)
    const { data, error } = await client
      .from("media_assets")
      .select("id,owner_id,bucket_id,object_path")
      .in("object_path", batch)

    if (error) throw new Error(`Could not read media_assets: ${error.message}`)
    assets.push(...((data ?? []) as AssetRow[]))
  }

  return assets
}

type R2Target = { client: AwsClient; objectUrl: (path: string) => string }

function r2Target(
  accountId: string,
  bucket: string,
  accessKeyId: string,
  secretAccessKey: string,
): R2Target {
  return {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
    }),
    objectUrl: (path: string) =>
      `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`,
  }
}

async function copyObject(
  client: SupabaseClient,
  target: R2Target,
  path: string,
): Promise<number> {
  const { data, error } = await client.storage
    .from(LEGACY_BUCKET)
    .download(path)
  if (error || !data) {
    throw new Error(
      `Could not download ${path}: ${error?.message ?? "no body"}`,
    )
  }

  const bytes = new Uint8Array(await data.arrayBuffer())
  const digest = createHash("md5").update(bytes)
  const md5Hex = digest.copy().digest("hex")
  const md5Base64 = digest.digest("base64")
  const objectUrl = target.objectUrl(path)

  const put = await target.client.fetch(objectUrl, {
    method: "PUT",
    body: bytes,
    headers: {
      "content-type": data.type || "application/octet-stream",
      "content-length": String(bytes.length),
      "content-md5": md5Base64,
      "cache-control": "public, max-age=31536000, immutable",
    },
  })

  if (!put.ok) {
    throw new Error(`R2 rejected ${path}: ${put.status} ${await put.text()}`)
  }

  if (!etagMatches(put.headers.get("etag"), md5Hex)) {
    throw new Error(`Checksum mismatch on ${path}: R2 stored different bytes.`)
  }

  const head = await target.client.fetch(objectUrl, { method: "HEAD" })
  if (!head.ok) {
    throw new Error(`Could not verify ${path}: HEAD returned ${head.status}`)
  }

  if (Number(head.headers.get("content-length")) !== bytes.length) {
    throw new Error(
      `Size mismatch on ${path}: expected ${bytes.length} bytes, R2 holds ${head.headers.get("content-length")}.`,
    )
  }

  return bytes.length
}

/**
 * Repoint the asset row rather than adding a second one: two rows for the same
 * object would count twice against the account's storage quota.
 */
async function recordAsset(
  client: SupabaseClient,
  entry: PendingCopy,
  bucket: string,
  sizeBytes: number,
): Promise<void> {
  if (entry.assetId) {
    const { error } = await client
      .from("media_assets")
      .update({
        bucket_id: bucket,
        size_bytes: sizeBytes,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.assetId)

    if (error) {
      throw new Error(
        `Copied ${entry.path} but could not update its asset row: ${error.message}`,
      )
    }

    return
  }

  const { error } = await client.from("media_assets").insert({
    owner_id: entry.ownerId,
    bucket_id: bucket,
    object_path: entry.path,
    size_bytes: sizeBytes,
    status: "ready",
  })

  if (error) {
    throw new Error(
      `Copied ${entry.path} but could not create its asset row: ${error.message}`,
    )
  }
}

function printReport(plan: MigrationPlan, bucket: string): void {
  console.log(`Source: ${LEGACY_BUCKET} (Supabase Storage)`)
  console.log(`Target: ${bucket} (Cloudflare R2)`)
  console.log(`Already in R2: ${plan.migrated.length}`)
  console.log(`To copy: ${plan.pending.length}`)

  for (const entry of plan.pending) {
    console.log(`- ${entry.path}`)
  }

  if (plan.unowned.length > 0) {
    console.log(
      `\nSkipped ${plan.unowned.length} path(s) with no asset row and no owning quiz:`,
    )
    for (const path of plan.unowned) console.log(`- ${path}`)
  }
}

async function buildPlan(
  client: SupabaseClient,
  bucket: string,
): Promise<MigrationPlan> {
  const [owners, questions] = await Promise.all([
    fetchGameOwners(client),
    fetchQuestions(client),
  ])
  const referenced = referencedMedia(questions, owners)
  const assets = await fetchAssets(client, [...referenced.keys()])

  return planMigration(referenced, assets, bucket)
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET ?? "pulse-quiz-question-media"

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    )
  }

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
    )
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const plan = await buildPlan(client, bucket)

  printReport(plan, bucket)

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to copy these objects.")
    return
  }

  if (plan.pending.length === 0) {
    console.log("\nNothing to copy.")
    return
  }

  const target = r2Target(accountId, bucket, accessKeyId, secretAccessKey)
  let copiedBytes = 0

  for (const entry of plan.pending) {
    const sizeBytes = await copyObject(client, target, entry.path)
    await recordAsset(client, entry, bucket, sizeBytes)
    copiedBytes += sizeBytes
    console.log(`Copied ${entry.path} (${formatBytes(sizeBytes)})`)
  }

  const remaining = await buildPlan(client, bucket)
  if (remaining.pending.length > 0) {
    throw new Error(
      `Verification failed: ${remaining.pending.length} object(s) still on Supabase Storage.`,
    )
  }

  console.log(
    `\nCopied ${plan.pending.length} object(s), ${formatBytes(copiedBytes)}. Every referenced asset now resolves from R2.`,
  )
  console.log(
    "The Supabase bucket still holds the originals. Make it private once the media-url fallback has been quiet for a week.",
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
