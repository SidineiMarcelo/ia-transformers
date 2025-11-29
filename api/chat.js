// /api/chat.js
// Handler de chat usando Google Gemini 2.0 Flash (API v1beta)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // Agora já esperamos receber "profile" e "messages" do front-end
    const { profile, messages } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("FALTA a variável de ambiente GEMINI_API_KEY na Vercel.");
      return res
        .status(500)
        .json({ error: "Configuração do servidor inválida (sem API key)." });
    }

    // Modelo que você tem disponível no AI Studio
    const modelId = "gemini-2.0-flash"; // modelo principal de texto/multimodal

    // Monta o system_instruction (perfil do agente)
    // Se vier "profile" do front, usamos ele.
    // Se não vier nada, cai no texto padrão abaixo.
    const systemText =
      (profile && profile.trim()) ||
      "Você é um professor de teologia, gentil e acolhedor, que explica a Bíblia em " +
      "português simples e fácil de entender. Evite dizer que é uma IA ou modelo de linguagem; " +
      "fale como um professor humano conversando com o aluno, fazendo perguntas e guiando o estudo.";

    const system_instruction = {
      role: "system",
      parts: [{ text: systemText }],
    };

    // Converte o histórico de mensagens do front-end
    // messages: [{ role: "user" | "assistant", content: string }]
    const contents = [];

    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (!m || !m.role || !m.content) continue;

        // Gemini usa 'user' e 'model' (não 'assistant')
        const role = m.role === "assistant" ? "model" : "user";

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
        parts: [{ text: "Olá! Vamos começar um estudo bíblico." }],
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const body = {
      system_instruction, // ATENÇÃO: underline, é assim mesmo no Gemini
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
