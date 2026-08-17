import type { MediaKind } from "@/types/domain"

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"])
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "mkv"])

function extensionOf(source: string): string {
  const bare = source.split("?")[0]?.split("#")[0] ?? ""
  const lastDot = bare.lastIndexOf(".")
  if (lastDot === -1) return ""
  return bare.slice(lastDot + 1).toLowerCase()
}

export function detectMediaKind(
  source: File | string,
  fallback: MediaKind = "image",
): MediaKind {
  if (typeof source !== "string") {
    if (source.type.startsWith("audio/")) return "audio"
    if (source.type.startsWith("video/")) return "video"
    if (source.type.startsWith("image/")) return "image"
    return detectMediaKind(source.name, fallback)
  }

  const extension = extensionOf(source)
  if (!extension) return fallback
  if (AUDIO_EXTENSIONS.has(extension)) return "audio"
  if (VIDEO_EXTENSIONS.has(extension)) return "video"
  return "image"
}
