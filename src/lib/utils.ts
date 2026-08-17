import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export { buildInviteUrl } from "@/lib/invite"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

export function normalizeNextPath(
  value: string | string[] | null | undefined,
  fallback = "/library",
) {
  const candidate = Array.isArray(value) ? value[0] : value

  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback
  }

  return candidate
}
