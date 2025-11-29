import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Tauri sends current version and platform in headers or query params
    // But typically we just return the latest version info and Tauri decides if it needs to update

    // Platform can be 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'
    const target = url.searchParams.get("target");
    const currentVersion = url.searchParams.get("current_version");

    if (!target) {
      throw new Error("Target platform is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for latest release in 'releases' bucket
    // Structure: releases/{target}/{version}/app.{dmg,exe,AppImage}
    // We can also store a 'latest.json' in the bucket or query a 'releases' table
    // For this implementation, let's assume we query a 'app_releases' table

    const { data: release, error } = await supabase
      .from("app_releases")
      .select("*")
      .eq("platform", target)
      .eq("is_published", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no release found, return 204 No Content
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!release) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Compare versions (simple string comparison for now, ideally semver)
    if (currentVersion && release.version === currentVersion) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Construct response
    const responseData = {
      version: release.version,
      pub_date: release.published_at,
      url: release.download_url,
      signature: release.signature,
      notes: release.notes,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
