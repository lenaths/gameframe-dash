import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ensure the current user has a linked Pterodactyl panel account.
 * Creates one on demand and stores its id on the profile.
 */
export const ensureMyPanelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPanelUser, assertPteroConfigured } = await import("@/lib/pterodactyl.server");

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, display_name, pterodactyl_user_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.pterodactyl_user_id) {
      return { pteroUserId: profile.pterodactyl_user_id };
    }

    assertPteroConfigured();

    const email = (profile?.email ?? claims?.email ?? "") as string;
    if (!email) throw new Error("Missing email for panel account creation.");
    const display = (profile?.display_name ?? email.split("@")[0]) as string;
    const username = email.split("@")[0];

    const pteroUserId = await createPanelUser({
      email,
      username,
      firstName: display.split(" ")[0] || "Player",
      lastName: display.split(" ").slice(1).join(" ") || "User",
    });

    await supabaseAdmin
      .from("profiles")
      .update({ pterodactyl_user_id: pteroUserId })
      .eq("id", userId);

    return { pteroUserId };
  });
