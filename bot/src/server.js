const http = require("http");

/**
 * Render (plano free) só mantém "Web Services" no ar — precisa de algo
 * escutando numa porta HTTP. Além do "ok" de keep-alive, esse servidor
 * também serve o QR code de pareamento como imagem PNG em /qr — muito
 * mais fácil de ler do que o ASCII que aparece nos logs.
 */
let currentQrPng = null;
let connectionStatus = "starting"; // "starting" | "waiting_qr" | "connected"

function setQrPng(buffer) {
  currentQrPng = buffer;
  connectionStatus = "waiting_qr";
}

function setConnected() {
  currentQrPng = null;
  connectionStatus = "connected";
}

function startKeepAliveServer() {
  const port = process.env.PORT || 3000;
  // Protege a rota /qr com um token simples: sem isso, qualquer pessoa que
  // descobrisse a URL pública do bot poderia escanear o QR antes de você e
  // "roubar" o pareamento (o WhatsApp que escanear primeiro vira o bot).
  const qrToken = process.env.QR_ACCESS_TOKEN;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/qr") {
      if (qrToken && url.searchParams.get("token") !== qrToken) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Acesso negado. Acesse /qr?token=SEU_TOKEN (defina QR_ACCESS_TOKEN nas env vars).\n");
        return;
      }

      if (connectionStatus === "connected") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("✅ Bot já está conectado, não há QR code pendente.\n");
        return;
      }

      if (!currentQrPng) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("QR code ainda não foi gerado. Aguarda alguns segundos e recarrega a página.\n");
        return;
      }

      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(currentQrPng);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("StreamVault WhatsApp bot está no ar. QR code em /qr\n");
  });

  server.listen(port, () => {
    console.log(`🌐 Servidor HTTP escutando na porta ${port}`);
  });
}

module.exports = { startKeepAliveServer, setQrPng, setConnected };
