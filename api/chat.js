import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // 1. Configuração de CORS (Permitir acesso do site)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    // 2. VERIFICAÇÃO DE LICENÇA (SEGURANÇA IGUAL AO CHAT)
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) {
        return res.status(403).json({ error: 'Licença não fornecida para gerar áudio.' });
    }

    const { data: licenseData, error: licenseError } = await supabase
        .from('licenses').select('active').eq('key', licenseKey).single();

    if (licenseError || !licenseData || !licenseData.active) {
        return res.status(403).json({ error: 'ACESSO BLOQUEADO: Licença inválida para TTS.' });
    }

    // 3. VERIFICAÇÃO DA CHAVE OPENAI (QUEM PAGA A CONTA)
    const userApiKey = req.headers['x-openai-key'];
    const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;

    if (!apiKeyToUse) {
        return res.status(500).json({ error: 'Falta chave OpenAI para gerar áudio.' });
    }

    const openai = new OpenAI({ apiKey: apiKeyToUse });

    // 4. GERAÇÃO DO ÁUDIO (AGORA COM A VOZ ESCOLHIDA)
    const { text, voice } = req.body;

    if (!text) return res.status(400).json({ error: 'Texto vazio.' });

    // Lista de vozes permitidas pela OpenAI
    const allowedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    // Se a voz escolhida não for válida, usa 'alloy' como padrão
    const selectedVoice = allowedVoices.includes(voice) ? voice : "alloy";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1", // Modelo rápido
      voice: selectedVoice,
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Retorna o arquivo de áudio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);

  } catch (error) {
    console.error("Erro no TTS:", error);
    if (error.status === 401) return res.status(401).json({ error: 'Chave OpenAI Inválida.' });
    res.status(500).json({ error: 'Erro ao gerar áudio: ' + error.message });
  }
}   