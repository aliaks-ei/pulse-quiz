import type { QuestionMedia } from "@/types/domain"

const preloadedMedia = new Map<string, Promise<void>>()

function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    const img = new Image()
    img.decoding = "async"
    img.onload = () => {
      const decoded = img.decode?.() ?? Promise.resolve()
      void decoded.catch(() => undefined).finally(resolve)
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

function preloadFetch(url: string) {
  return fetch(url, { method: "GET", mode: "cors", cache: "force-cache" })
    .then(() => undefined)
    .catch(() => undefined)
}

export function preloadQuestionMedia(
  media: QuestionMedia | null | undefined,
): Promise<void> {
  if (!media?.publicUrl) return Promise.resolve()
  const url = media.publicUrl
  const pending = preloadedMedia.get(url)
  if (pending) return pending

  const request = media.kind === "image" ? preloadImage(url) : preloadFetch(url)
  preloadedMedia.set(url, request)
  return request
}
