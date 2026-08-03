const { createClient } = require("@supabase/supabase-js");

const SITE_URL = process.env.SITE_URL || "https://movie-sigma-lemon.vercel.app";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function escapeForIlike(q) {
  return q
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Busca até 3 filmes/séries no catálogo cujo título bate com a busca. */
async function searchMovies(title) {
  const supabase = getSupabase();
  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, title, type, release_year")
    .ilike("title", `%${escapeForIlike(title)}%`)
    .limit(3);

  if (error) {
    console.error("Erro ao buscar no Supabase:", error);
    return [];
  }
  return movies || [];
}

function formatMovieReply(movies) {
  return movies
    .map((m) => `🎬 *${m.title}* (${m.release_year ?? "—"})\n${SITE_URL}/movie/${m.id}`)
    .join("\n\n");
}

module.exports = { searchMovies, formatMovieReply };
