import { detectMediaKind } from "@/lib/mediaKind"

import type { MediaKind } from "@/types/domain"

export interface MediaDimensions {
  width: number
  height: number
}

function isUsableDimension(value: number) {
  return Number.isFinite(value) && value > 0
}

function normalizeDimensions(width: number, height: number) {
  if (!isUsableDimension(width) || !isUsableDimension(height)) return null

  return {
    width: Math.round(width),
    height: Math.round(height),
  } satisfies MediaDimensions
}

function readImageDimensions(url: string) {
  return new Promise<MediaDimensions | null>((resolve) => {
    const image = new Image()

    image.onload = () => {
      resolve(normalizeDimensions(image.naturalWidth, image.naturalHeight))
    }
    image.onerror = () => {
      resolve(null)
    }
    image.src = url
  })
}

function readVideoDimensions(url: string) {
  return new Promise<MediaDimensions | null>((resolve) => {
    const video = document.createElement("video")

    video.preload = "metadata"
    video.onloadedmetadata = () => {
      resolve(normalizeDimensions(video.videoWidth, video.videoHeight))
    }
    video.onerror = () => {
      resolve(null)
    }
    video.src = url
  })
}

export async function readMediaDimensions(
  file: File,
  options: { url?: string; kind?: MediaKind } = {},
) {
  const kind = options.kind ?? detectMediaKind(file)
  if (kind !== "image" && kind !== "video") return null

  const shouldRevoke = !options.url
  const url = options.url ?? URL.createObjectURL(file)

  try {
    return kind === "image"
      ? await readImageDimensions(url)
      : await readVideoDimensions(url)
  } finally {
    if (shouldRevoke) URL.revokeObjectURL(url)
  }
}
