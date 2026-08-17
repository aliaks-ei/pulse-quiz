import type { AppLocale } from "@/i18n/locale"
import { supabase } from "@/services/supabase"

export type TranslationProgress = { completed: number; total: number }
export type TranslationResult = {
  translations: Array<{ id: string; text: string }>
}
export type TranslationError = {
  code: string
  message: string
  partial: Array<{ id: string; text: string }>
}

export async function* translateQuizStream(
  gameId: string,
  sourceLocale: AppLocale,
  targetLocale: AppLocale,
  items: Array<{ id: string; text: string }>,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: "progress"; payload: TranslationProgress }
  | { type: "done"; payload: TranslationResult }
  | { type: "error"; payload: TranslationError }
> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError || !sessionData.session) {
    throw new Error("No authenticated session")
  }

  const projectUrl = import.meta.env.VITE_SUPABASE_URL as string
  const response = await fetch(`${projectUrl}/functions/v1/translate-quiz`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionData.session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ gameId, sourceLocale, targetLocale, items }),
    signal,
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "")
    throw new Error(`Translation request failed (${response.status}): ${body}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return

      buffer += decoder.decode(value, { stream: true })

      let separator: number
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)

        let eventName = "message"
        let dataLine = ""

        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event: ")) {
            eventName = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            dataLine += line.slice(6)
          }
        }

        if (!dataLine) continue

        const payload = JSON.parse(dataLine)
        if (eventName === "progress") yield { type: "progress", payload }
        else if (eventName === "done") yield { type: "done", payload }
        else if (eventName === "error") yield { type: "error", payload }
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
