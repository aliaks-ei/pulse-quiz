// Cloudflare Turnstile tokens for the Supabase auth endpoints that mint users.
//
// Supabase verifies the token server-side for anonymous sign-ins and email OTP
// requests once `[auth.captcha]` is enabled. When VITE_TURNSTILE_SITE_KEY is
// unset the helper resolves undefined, so a fork running without a Turnstile
// widget still signs in. A script or widget failure resolves undefined too:
// the server, not the browser, decides whether a missing token is fatal.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const TOKEN_TIMEOUT_MS = 20_000

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  "error-callback": (error?: unknown) => void
  "timeout-callback": () => void
  appearance: "always" | "execute" | "interaction-only"
  theme: "auto" | "light" | "dark"
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null

export function getTurnstileSiteKey(): string | null {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()
  return siteKey ? siteKey : null
}

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<TurnstileApi | null>((resolve) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }

    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.addEventListener("load", () => {
      resolve(window.turnstile ?? null)
    })
    script.addEventListener("error", () => {
      scriptPromise = null
      resolve(null)
    })

    document.head.append(script)
  })

  return scriptPromise
}

// The widget is invisible while Turnstile is happy with the visitor. It still
// needs a real, on-screen slot so a managed challenge can be shown and solved.
function createWidgetContainer() {
  const container = document.createElement("div")
  container.dataset.turnstile = "captcha"
  container.style.cssText =
    "position:fixed;right:1rem;bottom:1rem;z-index:2147483647"
  document.body.append(container)
  return container
}

export async function getCaptchaToken(): Promise<string | undefined> {
  const sitekey = getTurnstileSiteKey()
  if (!sitekey) return undefined

  const turnstile = await loadTurnstile()
  if (!turnstile) return undefined

  const container = createWidgetContainer()

  try {
    return await new Promise<string | undefined>((resolve) => {
      let widgetId: string | null = null
      let settled = false

      const finish = (token: string | undefined) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        if (widgetId) turnstile.remove(widgetId)
        resolve(token)
      }

      const timeoutId = window.setTimeout(
        () => finish(undefined),
        TOKEN_TIMEOUT_MS,
      )

      // Render straight away rather than through turnstile.ready(): the script
      // is injected async, and ready() throws on an async/defer script tag.
      // Its own load event is the readiness signal for explicit rendering.
      try {
        const id = turnstile.render(container, {
          sitekey,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token) => finish(token),
          "error-callback": () => finish(undefined),
          "timeout-callback": () => finish(undefined),
        })

        // A callback that fired during render() already settled the promise
        // before there was an id to remove. Release the widget here instead.
        if (settled) {
          turnstile.remove(id)
        } else {
          widgetId = id
        }
      } catch {
        finish(undefined)
      }
    })
  } finally {
    container.remove()
  }
}
