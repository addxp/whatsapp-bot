# StreamVault WhatsApp Bot

Bot público de WhatsApp que busca filmes/séries no catálogo do StreamVault.
Usa **Baileys** (conecta como o WhatsApp Web, via QR code — sem precisar de aprovação da Meta)
e **Groq** (gratuito, sem cartão) para entender a mensagem.

## 1. Pegar as chaves necessárias

- **GROQ_API_KEY**: crie de graça em https://console.groq.com/keys — só precisa de um email
  ou login com Google, não pede cartão nem assinatura nenhuma
- **SUPABASE_URL** e **SUPABASE_SERVICE_ROLE_KEY**: os mesmos valores que já usam no site
  (`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no projeto Next.js — dashboard do
  Supabase → Settings → API)

O bot é **público**: qualquer pessoa que mandar mensagem pro número conectado recebe resposta.

## 2. Testar localmente (opcional, mas recomendado)

```bash
cd whatsapp-bot
cp .env.example .env
# preencha o .env com suas chaves
npm install
npm run start
```

Um QR code vai aparecer no terminal. Abra o WhatsApp no celular → **Aparelhos conectados** →
**Conectar um aparelho** → escaneie. Depois disso a pasta `auth_info_baileys/` guarda a sessão
(não vai pro git — está no `.gitignore`).

## 3. Deploy no Render

1. Suba a pasta `whatsapp-bot` pro seu repositório do GitHub (pode ser dentro do mesmo repo
   `movie`, numa subpasta)
2. Crie uma conta em https://render.com e clique em **New → Web Service**
3. Conecte seu repositório GitHub
4. Configure:
   - **Root Directory**: `whatsapp-bot` (se estiver numa subpasta do repo)
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Instance Type**: Free
5. Em **Environment**, adicione as variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GROQ_API_KEY`, `SITE_URL`
6. Clique em **Create Web Service** e espere o deploy. Abra a aba **Logs** — o QR code vai
   aparecer ali. Escaneie com o WhatsApp que você quer usar como o bot.

## 4. Configurar o ping externo (pra evitar que o Render durma)

O plano free do Render coloca o serviço pra dormir depois de **15 minutos sem receber
requisição HTTP**. Isso mataria a conexão do WhatsApp. Pra evitar isso:

1. Copie a URL pública que o Render deu pro seu serviço (algo como
   `https://streamvault-whatsapp-bot.onrender.com`)
2. Crie uma conta grátis em https://cron-job.org (ou https://uptimerobot.com)
3. Configure um "cron job" / "monitor" pra bater nessa URL **a cada 10 minutos**, 24/7

Isso mantém o processo acordado — mas é importante saber que **não é 100% garantido**: se o
Render atrasar um ping ou passar por manutenção, o bot pode cair e reconectar sozinho (o
código já tenta reconectar automaticamente).

## ⚠️ Sobre a sessão do WhatsApp

A sessão fica salva em arquivos dentro do container (`auth_info_baileys/`). Isso tem duas
implicações no Render:

- **Um redeploy (novo `git push`) apaga o disco e você perde a sessão** — vai precisar
  escanear o QR code de novo depois de cada deploy. Isso é esperado; evite redeploys
  desnecessários depois que o bot estiver conectado.
- O plano free do Render não tem disco persistente, então isso não tem como ser evitado nesse
  plano — se isso incomodar muito no dia a dia, a alternativa é migrar pra um serviço com disco
  persistente (Render pago, Oracle Cloud Free Tier, ou seu próprio PC).

## Como funciona

1. Qualquer pessoa manda uma mensagem pro número conectado (o próprio WhatsApp do bot)
2. Manda o texto pro Groq, que extrai o título do filme/série
3. Busca no Supabase (tabela `movies`) e responde com até 3 resultados + link do site

## ⚠️ Sobre o bot ser público

Como não há trava de número autorizado, qualquer pessoa que descobrir o número pode usar o
bot. Isso tem duas consequências pra ficar de olho:

- **Cota do Groq é compartilhada por toda a conta** (30 requisições/minuto no total, mesmo
  com várias pessoas usando ao mesmo tempo). O código já tem um cooldown de 8 segundos por
  número pra evitar que uma pessoa sozinha (ou um flood) estoure a cota.
- **Qualquer um vê o catálogo do StreamVault** através das respostas do bot. Se o site tiver
  conteúdo que você só queria mostrar pra pessoas específicas, considere voltar a restringir
  por número (dá pra reativar isso depois, é só eu adicionar de novo).
# whatsapp-bot
# whatsapp-bot
# whatsapp-bot
# whatsapp-bot
