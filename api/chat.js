// /api/chat.js
// Handler de chat usando Google Gemini 1.5 Pro (API v1beta)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { profile, messages } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("FALTA a variável de ambiente GEMINI_API_KEY na Vercel.");
      return res
        .status(500)
        .json({ error: "Configuração do servidor inválida (sem API key)." });
    }

    const modelId = "gemini-1.5-pro"; // modelo principal de texto/voz-imagem

    // Monta o system_instruction (perfil do agente)
    const systemText =
      (profile && profile.trim()) ||
      "Você é um assistente útil, gentil, que responde em português claro e objetivo.";

    const system_instruction = {
      role: "system",
      parts: [{ text: systemText }],
    };

    // Converte o histórico de mensagens do front-end
    // mensagens: [{ role: "user" | "assistant", content: string }]
    const contents = [];

    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (!m || !m.role || !m.content) continue;

        const role =
          m.role === "assistant"
            ? "model"
            : "user"; // Gemini usa 'user' e 'model'

        contents.push({
          role,
          parts: [{ text: String(m.content) }],
        });
      }
    }

    // Se por algum motivo não tiver nenhuma mensagem, evita erro
    if (!contents.length) {
      contents.push({
        role: "user",
        parts: [{ text: "Olá, tudo bem? Responda brevemente." }],
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const body = {
      system_instruction, // ATENÇÃO: underline, não camelCase
      contents,
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Erro na chamada ao Gemini:", errData);
      return res.status(500).json({
        error: "Erro ao chamar o modelo Gemini.",
        details: errData,
      });
    }

    const data = await response.json();

    // Extrai o texto da resposta
    const candidate = data.candidates?.[0];
    const replyText =
      candidate?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() || "Não consegui gerar uma resposta agora.";

    return res.status(200).json({ reply: replyText });
  } catch (err) {
    console.error("Erro inesperado no /api/chat:", err);
    return res.status(500).json({
      error: "Erro interno no servidor de chat.",
    });
  }
}
