const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Busca filmes ou séries no catálogo do StreamVault pelo título.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Nome do filme ou série" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recommendations",
      description:
        "Recomenda títulos do catálogo com base nos gêneros favoritos e nas avaliações do usuário logado.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_favorite",
      description: "Adiciona um filme/série aos favoritos do usuário logado.",
      parameters: {
        type: "object",
        properties: { movie_title: { type: "string" } },
        required: ["movie_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rate_movie",
      description:
        "Registra a nota (0 a 10) do usuário logado sobre um filme/série já visto, com comentário opcional.",
      parameters: {
        type: "object",
        properties: {
          movie_title: { type: "string" },
          rating: { type: "number" },
          comment: { type: "string" },
        },
        required: ["movie_title", "rating"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_taste",
      description:
        "Atualiza os gêneros favoritos do usuário logado conforme ele vai revelando o gosto durante a conversa.",
      parameters: {
        type: "object",
        properties: {
          genres: {
            type: "array",
            items: { type: "string" },
            description: "Ex: ['Ficcao', 'Terror', 'Comedia']",
          },
        },
        required: ["genres"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_link",
      description:
        "Inicia o vínculo da conta do site: gera um código de 6 dígitos que o usuário deve digitar em streamvault.com/link-whatsapp. Use quando a pessoa pedir pra vincular/conectar a conta, ou perguntar como ter recomendações personalizadas sem estar logada ainda.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function escapeIlike(q) {
  return q
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

async function execTool(supabase, userId, name, args, ctx) {
  switch (name) {
    case "search_catalog": {
      const q = escapeIlike(String(args.query || ""));
      const { data } = await supabase
        .from("movies")
        .select("id, title, type, release_year")
        .ilike("title", `%${q}%`)
        .limit(5);
      if (!data?.length) return { found: false };
      return {
        found: true,
        results: data.map((m) => ({
          title: m.title,
          year: m.release_year,
          link: `${ctx.siteUrl}/movie/${m.id}`,
        })),
      };
    }

    case "get_recommendations": {
      if (!userId) return { error: "Usuário não está logado — não dá pra personalizar ainda." };
      const { data: profile } = await supabase
        .from("profiles")
        .select("favorite_genres")
        .eq("id", userId)
        .maybeSingle();
      const genres = profile?.favorite_genres || [];

      let query = supabase
        .from("movies")
        .select("id, title, type, release_year, category")
        .order("created_at", { ascending: false })
        .limit(6);
      if (genres.length) query = query.in("category", genres);

      const { data } = await query;
      return {
        based_on_genres: genres,
        results: (data || []).map((m) => ({
          title: m.title,
          year: m.release_year,
          link: `${ctx.siteUrl}/movie/${m.id}`,
        })),
      };
    }

    case "add_favorite": {
      if (!userId) return { error: "Usuário não está logado." };
      const q = escapeIlike(String(args.movie_title || ""));
      const { data: movie } = await supabase
        .from("movies")
        .select("id, title")
        .ilike("title", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!movie) return { error: "Não achei esse título no catálogo." };
      await supabase
        .from("favorites")
        .upsert({ user_id: userId, movie_id: movie.id }, { onConflict: "user_id,movie_id" });
      return { ok: true, title: movie.title };
    }

    case "rate_movie": {
      if (!userId) return { error: "Usuário não está logado." };
      const q = escapeIlike(String(args.movie_title || ""));
      const { data: movie } = await supabase
        .from("movies")
        .select("id, title")
        .ilike("title", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!movie) return { error: "Não achei esse título no catálogo." };
      const rating = Math.max(0, Math.min(10, Number(args.rating) || 0));
      await supabase
        .from("reviews")
        .upsert(
          { user_id: userId, movie_id: movie.id, rating, body: args.comment || null },
          { onConflict: "user_id,movie_id" }
        );
      return { ok: true, title: movie.title, rating };
    }

    case "update_taste": {
      if (!userId) return { error: "Usuário não está logado." };
      const genres = Array.isArray(args.genres) ? args.genres.slice(0, 8) : [];
      await supabase.from("profiles").update({ favorite_genres: genres }).eq("id", userId);
      return { ok: true, genres };
    }

    case "start_link": {
      if (userId) return { already_linked: true };
      const code = await ctx.generateOtp();
      return { code, expires_in_minutes: 10, instructions: `Peça pra digitar em ${ctx.siteUrl}/link-whatsapp` };
    }

    default:
      return { error: "Ferramenta desconhecida." };
  }
}

async function chatWithTools({ supabase, userId, userName, history, userText, siteUrl, generateOtp }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "O bot ainda não está configurado direito (falta GROQ_API_KEY).";

  const system = `Você é o assistente de WhatsApp do StreamVault, um serviço pessoal de streaming.
${
  userId
    ? `Você está falando com ${userName || "um usuário"}, que já está com a conta vinculada. Use as ferramentas pra buscar, recomendar, favoritar e avaliar filmes/séries pra ele, e vá anotando o gosto dele com update_taste conforme ele comentar o que gosta.`
    : "Essa pessoa ainda não vinculou a conta do site. Ajude a explorar o catálogo normalmente. Se ela pedir recomendações personalizadas, favoritar algo, avaliar, ou perguntar como vincular a conta, use a ferramenta start_link — ela gera um código de 6 dígitos pra pessoa digitar no site."
}
Seja natural, direto e simpático, em português do Brasil, com frases curtas.
Nunca peça senha, e-mail ou qualquer dado de login pelo chat — o vínculo é feito só pelo código gerado por start_link, digitado no site.
Sempre use as ferramentas pra buscar, recomendar, favoritar, avaliar ou vincular — nunca invente títulos, links, notas ou códigos.`;

  const messages = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  const ctx = { siteUrl, generateOtp };

  for (let step = 0; step < 4; step++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      console.error("Groq falhou:", await res.text());
      return "Deu um erro aqui pra pensar na resposta, tenta de novo em instantes 🙏";
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) return "Não consegui responder agora, manda de novo?";

    if (choice.tool_calls?.length) {
      messages.push(choice);
      for (const call of choice.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // argumentos malformados — segue com objeto vazio
        }
        const result = await execTool(supabase, userId, call.function.name, args, ctx);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    return (choice.content || "").trim() || "🤔";
  }

  return "Deixa eu simplificar: me diz de novo o que você quer assistir?";
}

module.exports = { chatWithTools };
