// api/chat.js - função serverless para Vercel

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { profile, messages } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
    return;
  }

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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...(Array.isArray(messages) ? messages : []),
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erro da OpenAI:", errText);
      res.status(500).json({ error: "Erro ao chamar a OpenAI." });
      return;
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Desculpe, não consegui gerar uma resposta.";

    res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro no servidor:", error);
    res.status(500).json({ error: "Erro interno no servidor." });
  }
};   
