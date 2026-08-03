const http = require("http");

/**
 * Render (plano free) só mantém "Web Services" no ar — precisa de algo
 * escutando numa porta HTTP. Esse servidor não faz nada além de responder
 * "ok", e serve de alvo pro serviço de ping externo (UptimeRobot, cron-job.org
 * etc.) bater a cada ~10 minutos e evitar que o Render coloque o app pra
 * dormir por inatividade.
 */
function startKeepAliveServer() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("StreamVault WhatsApp bot está no ar.\n");
  });

  server.listen(port, () => {
    console.log(`🌐 Servidor HTTP de keep-alive escutando na porta ${port}`);
  });
}

module.exports = { startKeepAliveServer };
