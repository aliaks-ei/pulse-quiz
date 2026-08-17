import { createClient } from "npm:@supabase/supabase-js@2"

export async function requireGameOwner(
  authHeader: string | null,
  gameId: string,
): Promise<{ userId: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing authorization"), { status: 401 })
  }

  const token = authHeader.slice("Bearer ".length)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) {
    throw Object.assign(new Error("Invalid token"), { status: 401 })
  }

  const { data, error } = await client
    .from("games")
    .select("owner_id")
    .eq("id", gameId)
    .single()

  if (error || !data) {
    throw Object.assign(new Error("Game not found"), { status: 404 })
  }

  if (data.owner_id !== userData.user.id) {
    throw Object.assign(new Error("Not authorized"), { status: 403 })
  }

  return { userId: userData.user.id }
}
