// /api/tts.js
// Converte texto em áudio (mp3) usando Gemini TTS

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("FALTA a variável GEMINI_API_KEY na Vercel.");
      return res
        .status(500)
        .json({ error: "Configuração do servidor inválida (sem API key)." });
    }

    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Texto vazio para TTS." });
    }

    // Modelo TTS (está na sua tela do AI Studio)
    const modelId = "gemini-2.5-flash-preview-tts";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseMimeType: "audio/mp3",
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Erro na chamada ao Gemini TTS:", errData);
      return res.status(500).json({
        error: "Erro ao chamar o modelo Gemini TTS.",
        details: errData,
      });
    }

    const data = await response.json();

    // Pega o áudio em base64
    const audioPart =
      data.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData && p.inlineData.data
      );

    if (!audioPart) {
      console.error("Resposta TTS sem áudio:", data);
      return res
        .status(500)
        .json({ error: "Resposta TTS não contém áudio." });
    }

    const base64Audio = audioPart.inlineData.data;
    const audioBuffer = Buffer.from(base64Audio, "base64");

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);

    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error("Erro inesperado no /api/tts:", err);
    return res.status(500).json({
      error: "Erro interno no servidor de TTS.",  
    });
  }
}
