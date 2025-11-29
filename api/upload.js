import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import Busboy from 'busboy';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  return new Promise((resolve) => {
    try {
        // 1. Validação de Licença
        const licenseKey = req.headers['x-license-key'];
        if (!licenseKey) { res.status(403).json({ error: 'Licença ausente.' }); return resolve(); }

        (async () => {
            const { data: licenseData } = await supabase
                .from('licenses').select('active').eq('key', licenseKey).single();

            if (!licenseData?.active) {
                res.status(403).json({ error: 'Licença bloqueada.' });
                return resolve();
            }

            // 2. Chave Google (Gemini) - BYOK ou Sistema
            const userApiKey = req.headers['x-google-key'];
            const apiKey = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.GEMINI_API_KEY;
            
            if (!apiKey) {
                res.status(500).json({ error: 'Falta Chave Gemini API nas configurações.' });
                return resolve();
            }

            // 3. Processamento de Arquivo
            const busboy = Busboy({ headers: req.headers });
            let fileBuffer = null;
            let fileName = '';
            let fileType = '';

            busboy.on('file', (name, file, info) => {
                fileName = info.filename;
                fileType = info.mimeType;
                const chunks = [];
                file.on('data', (d) => chunks.push(d));
                file.on('end', () => fileBuffer = Buffer.concat(chunks));
            });

            busboy.on('finish', async () => {
                if (!fileBuffer) { res.status(400).json({ error: 'Arquivo vazio.' }); return resolve(); }

                try {
                    let text = '';
                    // Extração de texto
                    if (fileType === 'application/pdf') {
                        const data = await pdf(fileBuffer);
                        text = data.text;
                    } else if (fileType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
                        const res = await mammoth.extractRawText({ buffer: fileBuffer });
                        text = res.value;
                    } else {
                        res.status(400).json({ error: 'Use PDF ou DOCX.' });
                        return resolve();
                    }

                    // Limpeza
                    text = text.replace(/\s+/g, ' ').trim();
                    if (text.length < 50) { res.status(400).json({ error: 'Pouco texto legível.' }); return resolve(); }

                    // Chunking Otimizado para Gemini (1000 chars)
                    const chunkSize = 1000;
                    const chunkOverlap = 200;
                    const chunks = [];
                    for (let i = 0; i < text.length; i += (chunkSize - chunkOverlap)) {
                        chunks.push(text.slice(i, i + chunkSize));
                        if (i + chunkSize >= text.length) break;
                    }

                    // 4. Vetorização com Google (text-embedding-004)
                    for (const chunk of chunks) {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: "models/text-embedding-004",
                                content: { parts: [{ text: chunk }] }
                            })
                        });

                        if (!response.ok) {
                            const err = await response.json();
                            throw new Error(err.error?.message || "Erro Google Embeddings");
                        }

                        const data = await response.json();
                        // O Google retorna 'values' dentro de 'embedding'
                        const embedding = data.embedding.values; 

                        // Salva no Supabase (que agora aceita vetores de 768)
                        await supabase.from('documents').insert({
                            content: chunk,
                            metadata: { fileName },
                            embedding: embedding,
                        });
                    }
                    
                    res.status(200).json({ success: true, message: 'Memória criada com Google Gemini!' });
                    return resolve();

                } catch (err) {
                    console.error(err);
                    res.status(500).json({ error: 'Erro interno: ' + err.message });
                    return resolve(); 
                }
            });
            req.pipe(busboy);
        })().catch(e => { res.status(500).json({ error: e.message }); resolve(); });
    } catch (e) { res.status(500).json({ error: "Erro de inicialização." }); resolve(); }
  });
} 