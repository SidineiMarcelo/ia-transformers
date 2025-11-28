import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Configuração CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    // 1. Valida Licença (Segurança)
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) return res.status(403).json({ error: 'Licença não fornecida.' });

    const { data: licenseData, error: licenseError } = await supabase
        .from('licenses').select('active').eq('key', licenseKey).single();

    if (licenseError || !licenseData || !licenseData.active) {
        return res.status(403).json({ error: 'Licença inválida ou suspensa.' });
    }

    // 2. Valida Chave OpenAI (Economia)
    const userApiKey = req.headers['x-openai-key'];
    const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;
    if (!apiKeyToUse) return res.status(500).json({ error: 'Falta chave OpenAI.' });

    const openai = new OpenAI({ apiKey: apiKeyToUse });

    // 3. GERAÇÃO DE ÁUDIO
    // Este arquivo espera receber "text" e "voice" do script.js
    const { text, voice } = req.body;
    
    if (!text) return res.status(400).json({ error: 'Texto vazio.' });

    // Lista de vozes permitidas
    const allowedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = allowedVoices.includes(voice) ? voice : "alloy";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd", // <<< MODELO DE ALTA DEFINIÇÃO
      voice: selectedVoice,
      input: text,
      speed: 1.0, 
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    
    // Retorna o áudio binário
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);

  } catch (error) {
    if (error.status === 401) return res.status(401).json({ error: 'Chave OpenAI Inválida.' });
    res.status(500).json({ error: 'Erro TTS: ' + error.message });  
  }
}