export interface InviteOriginOptions {
  appUrl?: string | null
  browserOrigin?: string | null
}

function normalizeOrigin(value?: string | null) {
  return value?.trim().replace(/\/$/, "") ?? ""
}

export function resolveAppOrigin(options: InviteOriginOptions = {}) {
  const browserOrigin = normalizeOrigin(
    options.browserOrigin ??
      (typeof window !== "undefined" ? window.location.origin : ""),
  )

  if (
    browserOrigin.startsWith("http://") ||
    browserOrigin.startsWith("https://")
  ) {
    return browserOrigin
  }

  const configuredOrigin = normalizeOrigin(options.appUrl)
  if (configuredOrigin) return configuredOrigin

  return browserOrigin
}

export function buildInviteUrl(
  code: string,
  options: InviteOriginOptions = {},
) {
  const origin = resolveAppOrigin({
    appUrl: options.appUrl ?? import.meta.env.VITE_APP_URL,
    browserOrigin: options.browserOrigin,
  })

  return origin ? `${origin}/join/${code}` : `/join/${code}`
}
