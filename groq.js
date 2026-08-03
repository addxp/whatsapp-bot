const SYSTEM_PROMPT =
  "Você é o assistente de WhatsApp do StreamVault, um site pessoal de streaming. " +
  "O dono do site manda mensagens perguntando sobre filmes ou séries que quer assistir. " +
  "Responda APENAS com um JSON, sem texto antes ou depois, sem markdown, no formato: " +
  '{"title": "<nome do filme/série mencionado, ou null se a mensagem não pedir um título>", ' +
  '"reply": "<uma resposta curta e direta se a mensagem for uma saudação, agradecimento, ou não pedir busca; null caso contrário>"}';

/**
 * Manda a mensagem do usuário pro Groq (API compatível com o formato OpenAI)
 * e extrai o título do filme/série. Se a chamada falhar, cai de volta para
 * tratar a mensagem crua como título, assim o bot nunca fica mudo por causa
 * de um erro de API.
 */
async function extractMovieQuery(message) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { title: message, reply: null };

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      console.error("Groq respondeu com erro:", await res.text());
      return { title: message, reply: null };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { title: parsed.title ?? null, reply: parsed.reply ?? null };
  } catch (err) {
    console.error("Falha ao chamar o Groq:", err);
    return { title: message, reply: null };
  }
}

module.exports = { extractMovieQuery };
