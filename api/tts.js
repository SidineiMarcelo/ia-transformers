import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  // CORS - Permissões de acesso
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { text, voice } = req.body;
    
    // 1. Validação de Licença
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) return res.status(403).json({ error: 'Licença ausente.' });

    const { data: license } = await supabase.from('licenses').select('active').eq('key', licenseKey).single();
    if (!license?.active) return res.status(403).json({ error: 'Licença bloqueada.' });

    // 2. Chaves e Segurança (Google)
    const userApiKey = req.headers['x-google-key'];
    const apiKey = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.GEMINI_API_KEY;
    
    if (!apiKey) return res.status(500).json({ error: 'Falta Chave Gemini.' });

    if (!text) return res.status(400).json({ error: 'Texto vazio.' });

    // 3. Mapa de Vozes (Compatibilidade OpenAI -> Google)
    // Mapeia os nomes antigos para as novas vozes do Google
    const voiceMap = {
        "alloy": "Puck",    // Masculina neutra
        "echo": "Fenrir",   // Masculina forte
        "fable": "Orus",    // Masculina narrativa
        "onyx": "Charon",   // Grave
        "nova": "Aoede",    // Feminina energética
        "shimmer": "Kore"   // Feminina clara
    };
    const googleVoice = voiceMap[voice] || "Puck";

    // 4. Chamada à API de TTS do Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: googleVoice }
                    }
                }
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Erro TTS Gemini");
    }

    const data = await response.json();
    
    // O Gemini retorna o áudio em base64 dentro do JSON
    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
        throw new Error("Nenhum áudio gerado pelo Gemini.");
    }

    const audioBase64 = data.candidates[0].content.parts[0].inlineData.data;
    const buffer = Buffer.from(audioBase64, 'base64');

    res.setHeader('Content-Type', 'audio/wav');
    res.send(buffer);

  } catch (error) {
    console.error("Erro Voz:", error);
    res.status(500).json({ error: error.message });
  }
}    