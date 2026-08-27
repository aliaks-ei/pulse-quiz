// The half of the retention story Postgres cannot do: deleting the bytes.
//
// `private.mark_detached_media` and `private.purge_trashed_games` mark an asset
// `scheduled_for_deletion` when nothing references it any more, which frees the
// account's quota straight away. This Worker holds the R2 binding, so it is what
// removes the object and then the row.
//
// Object first, row second, on purpose: a failed row delete leaves the asset
// marked, and the next run deletes an object that is already gone, which R2
// treats as success. The reverse order would leak the object forever.

const FETCH_LIMIT = 1000
const DELETE_BATCH_SIZE = 1000
const ROW_BATCH_SIZE = 200

type R2Bucket = {
  delete(keys: string | string[]): Promise<void>
}

type Env = {
  QUESTION_MEDIA: R2Bucket
  R2_BUCKET: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export type ScheduledAsset = {
  id: string
  bucket_id: string
  object_path: string
}

export type ReapPlan = {
  reapable: ScheduledAsset[]
  foreign: ScheduledAsset[]
}

/**
 * Only objects in the bucket this Worker is bound to. Rows left over from the
 * legacy Supabase Storage bucket are reported and left alone: they belong to
 * `scripts/reap-orphans.ts`, which can reach that bucket.
 */
export function planReap(assets: ScheduledAsset[], bucket: string): ReapPlan {
  const plan: ReapPlan = { reapable: [], foreign: [] }

  for (const asset of assets) {
    if (asset.bucket_id === bucket && asset.object_path) {
      plan.reapable.push(asset)
    } else {
      plan.foreign.push(asset)
    }
  }

  return plan
}

export function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }

  return batches
}

function restHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  }
}

async function fetchScheduled(env: Env): Promise<ScheduledAsset[]> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/media_assets`)
  url.searchParams.set("select", "id,bucket_id,object_path")
  url.searchParams.set("status", "eq.scheduled_for_deletion")
  url.searchParams.set("order", "scheduled_for_deletion_at.asc")
  url.searchParams.set("limit", String(FETCH_LIMIT))

  const response = await fetch(url, { headers: restHeaders(env) })

  if (!response.ok) {
    throw new Error(
      `Could not read scheduled assets: ${response.status} ${await response.text()}`,
    )
  }

  return (await response.json()) as ScheduledAsset[]
}

async function deleteRows(env: Env, ids: string[]): Promise<void> {
  for (const chunk of batch(ids, ROW_BATCH_SIZE)) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/media_assets`)
    url.searchParams.set("id", `in.(${chunk.join(",")})`)

    const response = await fetch(url, {
      method: "DELETE",
      headers: restHeaders(env),
    })

    if (!response.ok) {
      throw new Error(
        `Objects were deleted but the rows remain: ${response.status} ${await response.text()}`,
      )
    }
  }
}

export async function reap(env: Env): Promise<ReapPlan> {
  const scheduled = await fetchScheduled(env)
  const plan = planReap(scheduled, env.R2_BUCKET)

  for (const chunk of batch(plan.reapable, DELETE_BATCH_SIZE)) {
    await env.QUESTION_MEDIA.delete(chunk.map((asset) => asset.object_path))
  }

  if (plan.reapable.length > 0) {
    await deleteRows(
      env,
      plan.reapable.map((asset) => asset.id),
    )
  }

  console.log(
    `media-reaper: deleted ${plan.reapable.length} object(s), left ${plan.foreign.length} row(s) in other buckets`,
  )

  return plan
}

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await reap(env)
  },
}
