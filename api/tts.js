// api/tts.js - Geração de áudio (voz humanizada OpenAI)

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { text, voice } = req.body || {};

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Campo 'text' é obrigatório." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY não configurada." });
    return;
  }

  const voz = voice || "alloy";

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: voz,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erro da OpenAI TTS:", errText);
      res.status(500).json({ error: "Erro ao gerar áudio com a OpenAI." });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Erro interno TTS:", error);
    res.status(500).json({ error: "Erro interno ao gerar áudio." });
  }
};   
