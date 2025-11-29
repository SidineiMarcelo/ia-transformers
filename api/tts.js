// /api/tts.js
// TTS com Gemini 2.5 Flash TTS -> devolve áudio WAV tocável no navegador

function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const headerSize = 44;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // ChunkID "RIFF"
  buffer.write("RIFF", 0);
  // ChunkSize = 36 + Subchunk2Size
  buffer.writeUInt32LE(36 + dataSize, 4);
  // Format "WAVE"
  buffer.write("WAVE", 8);

  // Subchunk1ID "fmt "
  buffer.write("fmt ", 12);
  // Subchunk1Size (16 for PCM)
  buffer.writeUInt32LE(16, 16);
  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 20);
  // NumChannels
  buffer.writeUInt16LE(numChannels, 22);
  // SampleRate
  buffer.writeUInt32LE(sampleRate, 24);
  // ByteRate = SampleRate * NumChannels * BitsPerSample/8
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  buffer.writeUInt32LE(byteRate, 28);
  // BlockAlign = NumChannels * BitsPerSample/8
  const blockAlign = (numChannels * bitsPerSample) / 8;
  buffer.writeUInt16LE(blockAlign, 32);
  // BitsPerSample
  buffer.writeUInt16LE(bitsPerSample, 34);

  // Subchunk2ID "data"
  buffer.write("data", 36);
  // Subchunk2Size
  buffer.writeUInt32LE(dataSize, 40);

  // PCM data
  pcmBuffer.copy(buffer, headerSize);

  return buffer;
}

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

    const { text, voice } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Texto vazio para TTS." });
    }

    // Modelo TTS que VOCÊ tem na sua conta
    const modelId = "gemini-2.5-flash-tts";

    // Mapeia as opções do select para as vozes do Gemini TTS
    const voiceMap = {
      shimmer: "Kore",   // Feminina clara
      nova: "Aoede",     // Feminina energética
      onyx: "Charon",    // Masculina grave
      echo: "Fenrir",    // Masculina forte
      alloy: "Puck",     // Neutra
    };

    const voiceName = voiceMap[voice] || "Kore";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const body = {
      model: modelId,
      contents: [
        {
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName, // Kore, Aoede, Charon, Fenrir, Puck...
            },
          },
        },
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

    const inlinePart =
      data.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData && p.inlineData.data
      )?.inlineData;

    if (!inlinePart?.data) {
      console.error("Resposta TTS sem áudio válido:", data);
      return res
        .status(500)
        .json({ error: "Resposta TTS não contém áudio." });
    }

    // Gemini retorna PCM cru (s16le 24kHz mono). Convertemos para WAV.
    const pcmBuffer = Buffer.from(inlinePart.data, "base64");
    const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", wavBuffer.length);

    return res.status(200).send(wavBuffer);
  } catch (err) {
    console.error("Erro inesperado no /api/tts:", err);
    return res.status(500).json({
      error: "Erro interno no servidor de TTS.", 
    });
  }
}
