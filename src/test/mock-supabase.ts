// A controllable fake Supabase client shared across service/store tests.
//
// The real client is a module singleton (`src/services/supabase.ts`), imported
// directly by `gameService`, `realtime`, and `translationService`. Tests can't
// inject it, so they mock the module and point it at `supabaseMock` here:
//
//   vi.mock("@/services/supabase", async () => {
//     const mod = await import("@/test/mock-supabase")
//     return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
//   })
//
// Then drive behaviour via `setRpc`, `setRpcError`, `setTableResult`,
// `setStorageUpload`, `setAuthSession`, `emitChannelStatus`, etc., and assert
// against `mockCalls`. Call `resetMockSupabase()` in `beforeEach`.

type QueryResult = { data: unknown; error: unknown }

export type RecordedCall = { name: string; params: unknown }

export interface MockChannel {
  name: string
  handlers: Array<{ config: unknown; callback: (payload: unknown) => void }>
  statusCallback?: (status: string) => void
  on(event: string, config: unknown, callback: (payload: unknown) => void): this
  subscribe(callback?: (status: string) => void): this
}

interface MockSupabaseState {
  rpc: Map<string, QueryResult>
  tables: Map<string, QueryResult>
  storage: {
    upload: QueryResult
    remove: QueryResult
    publicUrl: string
  }
  auth: {
    getSession: { data: { session: unknown }; error: unknown }
    signInAnonymously: QueryResult & { data: unknown }
    signOut: { error: unknown }
    signInWithOtp: { error: unknown }
    signInWithOAuth: { error: unknown }
    listeners: Array<(event: string, session: unknown) => void>
  }
  channels: Map<string, MockChannel>
  functions: Map<string, QueryResult>
  calls: {
    rpc: RecordedCall[]
    from: RecordedCall[]
    storage: RecordedCall[]
    removeChannel: MockChannel[]
  }
}

function freshState(): MockSupabaseState {
  return {
    rpc: new Map(),
    tables: new Map(),
    storage: {
      upload: { data: { path: "uploaded-path" }, error: null },
      remove: { data: [], error: null },
      publicUrl: "https://cdn.example/media",
    },
    auth: {
      getSession: { data: { session: null }, error: null },
      signInAnonymously: {
        data: { session: null, user: { id: "anon-user", is_anonymous: true } },
        error: null,
      },
      signOut: { error: null },
      signInWithOtp: { error: null },
      signInWithOAuth: { error: null },
      listeners: [],
    },
    channels: new Map(),
    functions: new Map(),
    calls: { rpc: [], from: [], storage: [], removeChannel: [] },
  }
}

let state = freshState()

export const mockCalls = {
  get rpc() {
    return state.calls.rpc
  },
  get from() {
    return state.calls.from
  },
  get storage() {
    return state.calls.storage
  },
  get removeChannel() {
    return state.calls.removeChannel
  },
}

export function resetMockSupabase() {
  state = freshState()
}

export function setRpc(name: string, data: unknown) {
  state.rpc.set(name, { data, error: null })
}

export function setRpcError(name: string, error: unknown) {
  state.rpc.set(name, { data: null, error })
}

export function setTableResult(table: string, result: Partial<QueryResult>) {
  state.tables.set(table, { data: null, error: null, ...result })
}

export function setStorageUpload(result: Partial<QueryResult>) {
  state.storage.upload = {
    data: { path: "uploaded-path" },
    error: null,
    ...result,
  }
}

export function setStorageRemove(result: Partial<QueryResult>) {
  state.storage.remove = { data: [], error: null, ...result }
}

export function setStoragePublicUrl(url: string) {
  state.storage.publicUrl = url
}

export function setFunctionResult(name: string, result: Partial<QueryResult>) {
  state.functions.set(name, { data: null, error: null, ...result })
}

export function setAuthSession(session: unknown, error: unknown = null) {
  state.auth.getSession = { data: { session }, error }
}

export function setSignInAnonymously(result: {
  data?: unknown
  error?: unknown
}) {
  state.auth.signInAnonymously = {
    data: result.data ?? { session: null, user: null },
    error: result.error ?? null,
  }
}

export function setSignOutError(error: unknown) {
  state.auth.signOut = { error }
}

export function setSignInWithOtpError(error: unknown) {
  state.auth.signInWithOtp = { error }
}

export function setSignInWithOAuthError(error: unknown) {
  state.auth.signInWithOAuth = { error }
}

export function getChannel(name: string): MockChannel | undefined {
  return state.channels.get(name)
}

export function emitChannelStatus(name: string, status: string) {
  state.channels.get(name)?.statusCallback?.(status)
}

export function emitPostgresChange(name: string, payload: unknown) {
  for (const handler of state.channels.get(name)?.handlers ?? []) {
    handler.callback(payload)
  }
}

export function emitAuthStateChange(event: string, session: unknown) {
  for (const listener of state.auth.listeners) listener(event, session)
}

function createQueryBuilder(table: string) {
  const resolve = (): QueryResult =>
    state.tables.get(table) ?? { data: null, error: null }

  const builder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    single: () => Promise.resolve(resolve()),
    maybeSingle: () => Promise.resolve(resolve()),
    then: (
      onfulfilled?: (value: QueryResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onfulfilled, onrejected),
  }

  return builder
}

function createChannel(name: string): MockChannel {
  const channel: MockChannel = {
    name,
    handlers: [],
    on(_event, config, callback) {
      this.handlers.push({ config, callback })
      return this
    },
    subscribe(callback) {
      this.statusCallback = callback
      return this
    },
  }

  return channel
}

export const supabaseMock = {
  from(table: string) {
    state.calls.from.push({ name: table, params: undefined })
    return createQueryBuilder(table)
  },

  rpc(name: string, params?: unknown) {
    state.calls.rpc.push({ name, params })
    const result = state.rpc.get(name) ?? { data: null, error: null }
    return Promise.resolve(result)
  },

  storage: {
    from(bucket: string) {
      return {
        upload(path: string, file: unknown, options?: unknown) {
          state.calls.storage.push({
            name: "upload",
            params: { bucket, path, file, options },
          })
          return Promise.resolve(state.storage.upload)
        },
        remove(paths: string[]) {
          state.calls.storage.push({
            name: "remove",
            params: { bucket, paths },
          })
          return Promise.resolve(state.storage.remove)
        },
        getPublicUrl(path: string) {
          state.calls.storage.push({
            name: "getPublicUrl",
            params: { bucket, path },
          })
          return { data: { publicUrl: state.storage.publicUrl } }
        },
        createSignedUrl(path: string) {
          state.calls.storage.push({
            name: "createSignedUrl",
            params: { bucket, path },
          })
          return Promise.resolve({
            data: { signedUrl: state.storage.publicUrl },
            error: null,
          })
        },
      }
    },
  },

  auth: {
    getSession() {
      return Promise.resolve(state.auth.getSession)
    },
    signInAnonymously() {
      return Promise.resolve(state.auth.signInAnonymously)
    },
    signOut() {
      return Promise.resolve(state.auth.signOut)
    },
    signInWithOtp() {
      return Promise.resolve(state.auth.signInWithOtp)
    },
    signInWithOAuth() {
      return Promise.resolve(state.auth.signInWithOAuth)
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void) {
      state.auth.listeners.push(callback)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              state.auth.listeners = state.auth.listeners.filter(
                (listener) => listener !== callback,
              )
            },
          },
        },
      }
    },
  },

  functions: {
    invoke(name: string, options?: unknown) {
      state.calls.storage.push({ name: "function", params: { name, options } })
      return Promise.resolve(
        state.functions.get(name) ?? { data: null, error: null },
      )
    },
  },

  channel(name: string) {
    const channel = createChannel(name)
    state.channels.set(name, channel)
    return channel
  },

  removeChannel(channel: MockChannel) {
    state.calls.removeChannel.push(channel)
    state.channels.delete(channel.name)
    return Promise.resolve("ok")
  },
}
