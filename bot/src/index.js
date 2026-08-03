require("dotenv").config();

const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { getSupabase } = require("./supabase");
const { getLinkedUserId, generateOtpForPhone, loadHistory, saveMessage } = require("./session");
const { chatWithTools } = require("./groq");
const { startKeepAliveServer, setQrPng, setConnected } = require("./server");

const SITE_URL = process.env.SITE_URL || "https://movie-sigma-lemon.vercel.app";

const AUTH_DIR = path.join(__dirname, "..", "auth_info_baileys");

// Cota gratuita do Groq é compartilhada por toda a conta (30 req/min no total).
// Como o bot agora é aberto pra qualquer pessoa, essa trava evita que alguém
// (ou várias pessoas ao mesmo tempo) estoure a cota rapidinho.
const COOLDOWN_MS = 8000;
const lastRequestBySender = new Map();

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: process.env.LOG_LEVEL || "warn" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrUrl = process.env.QR_ACCESS_TOKEN
        ? `SUA_URL_PUBLICA/qr?token=${process.env.QR_ACCESS_TOKEN}`
        : "SUA_URL_PUBLICA/qr";
      console.log(`\n📱 Escaneie o QR code: acesse ${qrUrl} no navegador (mais fácil de ler que o log)\n`);
      qrcode.generate(qr, { small: true }); // mantém no log como reforço/fallback

      try {
        const png = await QRCode.toBuffer(qr, { width: 400, margin: 2 });
        setQrPng(png);
      } catch (err) {
        console.error("Falha ao gerar PNG do QR code:", err);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Conexão encerrada.", statusCode, "Reconectar?", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log("Sessão deslogada. Apague a pasta auth_info_baileys e escaneie o QR de novo.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot de WhatsApp conectado!");
      setConnected();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error("Erro ao processar mensagem:", err);
      }
    }
  });
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  if (!from || from.endsWith("@g.us")) return; // ignora mensagens de grupo

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    "";
  if (!text) return; // ignora mídia sem texto, áudios, figurinhas, etc.

  const senderNumber = from.split("@")[0];

  // Rate limit por número: evita que uma pessoa sozinha (ou um flood) consuma
  // toda a cota gratuita compartilhada do Groq.
  const now = Date.now();
  const last = lastRequestBySender.get(senderNumber) || 0;
  if (now - last < COOLDOWN_MS) {
    return;
  }
  lastRequestBySender.set(senderNumber, now);

  const supabase = getSupabase();
  const userId = await getLinkedUserId(supabase, senderNumber);

  let userName = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    userName = profile?.username ?? null;
  }

  const history = await loadHistory(supabase, senderNumber);

  const reply = await chatWithTools({
    supabase,
    userId,
    userName,
    history,
    userText: text,
    siteUrl: SITE_URL,
    generateOtp: () => generateOtpForPhone(supabase, senderNumber),
  });

  await saveMessage(supabase, senderNumber, "user", text);
  await saveMessage(supabase, senderNumber, "assistant", reply);

  await sock.sendMessage(from, { text: reply });
}

startKeepAliveServer();

startBot().catch((err) => {
  console.error("Falha fatal ao iniciar o bot:", err);
  process.exit(1);
});
