export interface AuthSession {
  user: {
    id: string
    email?: string
    is_anonymous?: boolean
  }
}

export interface AuthBootstrapClient {
  getSession: () => Promise<{
    data: {
      session: AuthSession | null
    }
  }>
  signInAnonymously: (options?: {
    options?: { captchaToken?: string }
  }) => Promise<{
    data: {
      session?: AuthSession | null
      user: {
        id: string
        email?: string
        is_anonymous?: boolean
      } | null
    }
    error: Error | null
  }>
}

export interface AuthBootstrapResult {
  session: AuthSession | null
  userId: string | null
}

// Reads whatever session the browser already holds. Never mints a user, so it
// is safe on routes a crawler or a first-time visitor can reach.
export async function restoreAuthSession(
  client: Pick<AuthBootstrapClient, "getSession">,
): Promise<AuthBootstrapResult> {
  const { data } = await client.getSession()

  return {
    session: data.session,
    userId: data.session?.user.id ?? null,
  }
}

// Mints the anonymous user the RPC surface needs. Only call it on routes that
// cannot work without an identity: joining a room, and live session routes.
export async function signInAnonymously(
  client: Pick<AuthBootstrapClient, "getSession" | "signInAnonymously">,
  captchaToken?: string,
): Promise<AuthBootstrapResult> {
  const { data: signInData, error } = await client.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  )
  if (error) throw error

  const session = signInData.session ?? (await client.getSession()).data.session

  return {
    session,
    userId: session?.user.id ?? signInData.user?.id ?? null,
  }
}
