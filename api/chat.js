// api/chat.js - função serverless para Vercel
// IA TRANSFORMERS + Supabase

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Função auxiliar para salvar mensagens no Supabase ---
async function saveMessage({ sender, content, audio_url = null, conversation_id = null }) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !content) {
      return;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        sender,          // "user" ou "assistant"
        content,         // texto da mensagem
        audio_url,       // por enquanto sempre null
        conversation_id, // por enquanto null (sem separar conversas)
      }),
    });
  } catch (error) {
    console.error("Erro ao salvar mensagem no Supabase:", error);
  }
}

// --- Handler principal da API ---
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
    return;
  }

  const { profile, messages } = req.body || {};

  const systemPrompt = `
Você é a IA TRANSFORMERS, um agente multi-função que se adapta ao perfil definido pelo usuário.

Regras:
- Siga fielmente o perfil abaixo.
- Seja didático, organizado e amigável.
- Faça perguntas quando precisar de mais contexto.
- Responda sempre em português do Brasil.

Perfil definido pelo usuário:
"${profile || "Nenhum perfil fornecido ainda."}"
`.trim();

  // Pega a última mensagem do usuário (se existir)
  const lastUserMessage =
    Array.isArray(messages)
      ? [...messages].reverse().find((m) => m.role === "user")?.content || ""
      : "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...(Array.isArray(messages) ? messages : []),
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro da OpenAI:", data);
      res.status(500).json({ error: "Erro ao chamar a API da OpenAI." });
      return;
    }

    const assistantReply =
      data.choices?.[0]?.message?.content?.trim() ||
      "Desculpe, não consegui gerar uma resposta agora.";

    // Salva no Supabase (não trava o app se der erro)
    await saveMessage({ sender: "user", content: lastUserMessage });
    await saveMessage({ sender: "assistant", content: assistantReply });

    res.status(200).json({ reply: assistantReply });
  } catch (error) {
    console.error("Erro geral no chat.js:", error);
    res.status(500).json({ error: "Erro ao gerar resposta da IA." });  
  }
};
