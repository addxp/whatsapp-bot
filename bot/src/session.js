const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const HISTORY_LIMIT = 16; // últimas ~8 trocas, contexto suficiente sem pesar o prompt

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Retorna o user_id vinculado a esse número, ou null se ainda não vinculou. */
async function getLinkedUserId(supabase, phone) {
  const { data, error } = await supabase
    .from("whatsapp_links")
    .select("user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("Falha ao consultar whatsapp_links:", error);
  }
  return data?.user_id ?? null;
}

/** Gera um novo código de 6 dígitos pro número, substituindo qualquer um anterior ainda válido. */
async function generateOtpForPhone(supabase, phone) {
  const code = generateCode();
  const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const { error } = await supabase.from("whatsapp_otp").upsert({ phone, code, expires_at });
  if (error) {
    console.error("Falha ao gravar OTP no Supabase:", error);
  }
  return code;
}

async function loadHistory(supabase, phone) {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("role, content")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  return (data || []).reverse();
}

async function saveMessage(supabase, phone, role, content) {
  const { error } = await supabase.from("whatsapp_messages").insert({ phone, role, content });
  if (error) {
    console.error("Falha ao gravar mensagem no Supabase:", error);
  }
}

module.exports = { getLinkedUserId, generateOtpForPhone, loadHistory, saveMessage };
