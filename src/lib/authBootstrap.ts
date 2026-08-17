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
  signInAnonymously: () => Promise<{
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
  didSignInAnonymously: boolean
}

export async function bootstrapAuthSession(
  client: AuthBootstrapClient,
): Promise<AuthBootstrapResult> {
  const { data } = await client.getSession()

  if (data.session) {
    return {
      session: data.session,
      userId: data.session.user.id,
      didSignInAnonymously: false,
    }
  }

  const { data: signInData, error } = await client.signInAnonymously()
  if (error) throw error

  const session = signInData.session ?? (await client.getSession()).data.session

  return {
    session,
    userId: session?.user.id ?? signInData.user?.id ?? null,
    didSignInAnonymously: true,
  }
}
