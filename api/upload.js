import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Busboy from 'busboy';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  // Envolvemos tudo numa Promise para a Vercel não matar o processo antes da hora
  return new Promise((resolve) => {
    try {
        // 1. VERIFICAÇÕES DE SEGURANÇA
        const licenseKey = req.headers['x-license-key'];
        if (!licenseKey) {
            res.status(403).json({ error: 'Licença não fornecida.' });
            return resolve();
        }

        // Validação Assíncrona inicial
        (async () => {
            const { data: licenseData } = await supabase
                .from('licenses').select('active').eq('key', licenseKey).single();

            if (!licenseData?.active) {
                res.status(403).json({ error: 'Licença inválida ou bloqueada.' });
                return resolve();
            }

            const userApiKey = req.headers['x-openai-key'];
            const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;
            
            if (!apiKeyToUse) {
                res.status(500).json({ error: 'Falta Chave OpenAI.' });
                return resolve();
            }

            const openai = new OpenAI({ apiKey: apiKeyToUse });

            // 2. PROCESSAMENTO DO ARQUIVO (BUSBOY)
            const busboy = Busboy({ headers: req.headers });
            let fileBuffer = null;
            let fileName = '';
            let fileType = '';

            busboy.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                fileName = filename;
                fileType = mimeType;
                const chunks = [];
                file.on('data', (data) => chunks.push(data));
                file.on('end', () => fileBuffer = Buffer.concat(chunks));
            });

            busboy.on('finish', async () => {
                if (!fileBuffer) {
                    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
                    return resolve();
                }

                try {
                    let textContent = '';
                    // Leitura segura do PDF/DOCX
                    if (fileType === 'application/pdf') {
                        const data = await pdf(fileBuffer);
                        textContent = data.text;
                    } else if (fileType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
                        const result = await mammoth.extractRawText({ buffer: fileBuffer });
                        textContent = result.value;
                    } else {
                        res.status(400).json({ error: 'Formato inválido. Use PDF ou DOCX.' });
                        return resolve();
                    }

                    textContent = textContent.replace(/\s+/g, ' ').trim();
                    if (textContent.length < 50) {
                        res.status(400).json({ error: 'Arquivo vazio ou ilegível.' });
                        return resolve();
                    }

                    // Chunking (500 chars + 100 overlap)
                    const chunkSize = 500;
                    const chunkOverlap = 100;
                    const chunks = [];
                    for (let i = 0; i < textContent.length; i += (chunkSize - chunkOverlap)) {
                        const chunk = textContent.slice(i, i + chunkSize);
                        chunks.push(chunk);
                        if (i + chunkSize >= textContent.length) break;
                    }

                    // Vetorização e Salvamento
                    for (const chunk of chunks) {
                        try {
                            const embeddingResponse = await openai.embeddings.create({
                                model: 'text-embedding-3-small',
                                input: chunk,
                            });
                            const embedding = embeddingResponse.data[0].embedding;

                            await supabase.from('documents').insert({
                                content: chunk,
                                metadata: { fileName },
                                embedding: embedding,
                            });
                        } catch (openaiError) {
                            console.error("Erro OpenAI:", openaiError);
                            res.status(401).json({ error: 'Erro OpenAI: Verifique saldo/chave.' });
                            return resolve();
                        }
                    }
                    
                    res.status(200).json({ success: true, message: 'Processado com sucesso!' });
                    return resolve();

                } catch (error) {
                    console.error("Erro Processamento:", error);
                    res.status(500).json({ error: 'Erro interno: ' + error.message });
                    return resolve();
                }
            });

            req.pipe(busboy);
        })().catch(err => {
            console.error("Erro Geral:", err);
            res.status(500).json({ error: "Erro crítico no servidor." });
            resolve();
        });

    } catch (e) {
        res.status(500).json({ error: "Erro de inicialização." });
        resolve();
    }
  });
}      