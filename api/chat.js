import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) return res.status(403).json({ error: 'Licença não fornecida.' });

    const { data: licenseData, error: licenseError } = await supabase
        .from('licenses').select('active').eq('key', licenseKey).single();

    if (licenseError || !licenseData || !licenseData.active) return res.status(403).json({ error: 'Licença inválida.' });

    const userApiKey = req.headers['x-openai-key'];
    const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;
    if (!apiKeyToUse) return res.status(500).json({ error: 'Falta chave OpenAI.' });

    const openai = new OpenAI({ apiKey: apiKeyToUse });

    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto vazio.' });

    const allowedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = allowedVoices.includes(voice) ? voice : "alloy";

    // UPGRADE: Usando modelo HD (High Definition)
    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd", // Qualidade superior, mais humana
      voice: selectedVoice,
      input: text,
      speed: 1.0, // Velocidade natural
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ error: 'Erro TTS: ' + error.message });
  }
}