const SUPPORTED_LOCALES = ["en", "ru", "be", "pl"] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  ru: "Russian",
  be: "Belarusian",
  pl: "Polish",
}

export async function translateBatch(
  source: Locale,
  target: Locale,
  items: Array<{ id: string; text: string }>,
): Promise<Array<{ id: string; text: string }>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")

  const model = Deno.env.get("OPENAI_TRANSLATION_MODEL") ?? "gpt-5.4-mini"
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            `You are translating short trivia content from ${LOCALE_LABEL[source]} to ${LOCALE_LABEL[target]}. ` +
            "Preserve question structure, do not add explanations or commentary, and keep proper nouns. " +
            "Output JSON matching the provided schema. Each translation must round-trip the same id.",
        },
        {
          role: "user",
          content: JSON.stringify({ items }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "translations",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["translations"],
            properties: {
              translations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "text"],
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Translation provider returned ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string")
    throw new Error("No content in OpenAI response")

  const parsed = JSON.parse(content) as {
    translations: Array<{ id: string; text: string }>
  }
  return parsed.translations
}
