import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "question-media"
const PAGE_SIZE = 1000
const DELETE_BATCH_SIZE = 1000

type MediaValue = { path?: unknown } | null
type QuestionMediaRow = { media: MediaValue; reveal_media: MediaValue }
type StorageObject = { name: string; size: number }

export function referencedMediaPaths(rows: QuestionMediaRow[]): Set<string> {
  const paths = new Set<string>()

  for (const row of rows) {
    for (const media of [row.media, row.reveal_media]) {
      if (media && typeof media.path === "string" && media.path.length > 0) {
        paths.add(media.path)
      }
    }
  }

  return paths
}

export function findOrphans(
  objects: StorageObject[],
  referencedPaths: Set<string>,
): StorageObject[] {
  return objects.filter((object) => !referencedPaths.has(object.name))
}

function formatBytes(bytes: number): string {
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 2,
  }).format(bytes / 1024 / 1024)
}

async function fetchReferencedPaths(
  client: SupabaseClient,
): Promise<Set<string>> {
  const rows: QuestionMediaRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("questions")
      .select("media,reveal_media")
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Could not read questions: ${error.message}`)
    rows.push(...((data ?? []) as QuestionMediaRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  return referencedMediaPaths(rows)
}

async function listStorageObjects(
  client: SupabaseClient,
): Promise<StorageObject[]> {
  const objects: StorageObject[] = []
  const pendingPrefixes = [""]

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift() ?? ""

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client.storage.from(BUCKET).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      })

      if (error) {
        throw new Error(`Could not list ${BUCKET}/${prefix}: ${error.message}`)
      }

      for (const object of data ?? []) {
        const path = prefix ? `${prefix}/${object.name}` : object.name

        if (object.id) {
          const size = Number(object.metadata?.size ?? 0)
          objects.push({
            name: path,
            size: Number.isFinite(size) ? size : 0,
          })
        } else {
          pendingPrefixes.push(path)
        }
      }

      if (!data || data.length < PAGE_SIZE) break
    }
  }

  return objects
}

function printReport(objects: StorageObject[], orphans: StorageObject[]): void {
  const totalBytes = objects.reduce((total, object) => total + object.size, 0)
  const orphanBytes = orphans.reduce((total, object) => total + object.size, 0)

  console.log(`Bucket: ${BUCKET}`)
  console.log(`Objects: ${objects.length} (${formatBytes(totalBytes)})`)
  console.log(`Orphans: ${orphans.length} (${formatBytes(orphanBytes)})`)

  for (const orphan of orphans) {
    console.log(`- ${orphan.name} (${formatBytes(orphan.size)})`)
  }
}

async function deleteOrphans(
  client: SupabaseClient,
  orphans: StorageObject[],
): Promise<void> {
  for (let index = 0; index < orphans.length; index += DELETE_BATCH_SIZE) {
    const paths = orphans
      .slice(index, index + DELETE_BATCH_SIZE)
      .map((object) => object.name)
    const { error: storageError } = await client.storage
      .from(BUCKET)
      .remove(paths)

    if (storageError) {
      throw new Error(
        `Could not delete storage objects: ${storageError.message}`,
      )
    }

    const { error: rowsError } = await client
      .from("media_assets")
      .delete()
      .eq("bucket_id", BUCKET)
      .in("object_path", paths)

    if (rowsError) {
      throw new Error(
        `Objects were deleted but media_assets cleanup failed: ${rowsError.message}`,
      )
    }
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    )
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const referencedPaths = await fetchReferencedPaths(client)
  const objects = await listStorageObjects(client)
  const orphans = findOrphans(objects, referencedPaths)

  printReport(objects, orphans)

  if (!apply) {
    console.log(
      "\nDry run only. Re-run with --apply to permanently delete these objects.",
    )
    return
  }

  if (orphans.length === 0) {
    console.log("\nNothing to delete.")
    return
  }

  await deleteOrphans(client, orphans)

  const remainingObjects = await listStorageObjects(client)
  const remainingReferences = await fetchReferencedPaths(client)
  const remainingOrphans = findOrphans(remainingObjects, remainingReferences)

  if (remainingOrphans.length > 0) {
    throw new Error(
      `Verification failed: ${remainingOrphans.length} orphan(s) remain.`,
    )
  }

  console.log(
    `\nDeleted ${orphans.length} orphan(s). Verification found none remaining.`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
