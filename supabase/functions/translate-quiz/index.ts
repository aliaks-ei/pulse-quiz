import { requireGameOwner } from "./auth.ts"
import { isValidTranslationItems } from "./limits.ts"
import { translateBatch } from "./openai.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPPORTED_LOCALES = new Set(["en", "ru", "be", "pl"])
const BATCH_SIZE = 30

interface RequestBody {
  gameId: string
  sourceLocale: string
  targetLocale: string
  items: Array<{ id: string; text: string }>
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "POST, OPTIONS",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    })
  }

  if (
    !body.gameId ||
    !SUPPORTED_LOCALES.has(body.sourceLocale) ||
    !SUPPORTED_LOCALES.has(body.targetLocale) ||
    body.sourceLocale === body.targetLocale ||
    !isValidTranslationItems(body.items)
  ) {
    return new Response(JSON.stringify({ error: "Validation failed" }), {
      status: 400,
    })
  }

  try {
    await requireGameOwner(req.headers.get("authorization"), body.gameId)
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status,
    })
  }

  const quotaClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("authorization")! } },
    },
  )
  const { error: quotaError } = await quotaClient.rpc(
    "consume_translation_quota",
  )
  if (quotaError) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      const translations: Array<{ id: string; text: string }> = []

      try {
        for (let offset = 0; offset < body.items.length; offset += BATCH_SIZE) {
          const chunk = body.items.slice(offset, offset + BATCH_SIZE)
          const translated = await translateBatch(
            body.sourceLocale as "en" | "ru" | "be" | "pl",
            body.targetLocale as "en" | "ru" | "be" | "pl",
            chunk,
          )
          translations.push(...translated)
          send("progress", {
            completed: translations.length,
            total: body.items.length,
          })
        }

        send("done", { translations })
      } catch (error) {
        send("error", {
          code: "openai_failure",
          message: "Translation could not be completed. Please try again.",
          partial: translations,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  })
})
