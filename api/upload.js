import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Busboy from 'busboy';

const supabaseUrl = process.env.SUPABASE_URL;
// CHAVE IMPORTANTE: Precisa ser a SERVICE_ROLE para salvar sem erro de permissão (RLS)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

// Desativa o bodyParser padrão da Vercel para permitir upload de arquivos
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // Configuração de CORS (Permitir acesso do site ao backend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*'); // Aceita os headers de licença e chave
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  // === 1. VERIFICAÇÃO DE LICENÇA (SEGURANÇA) ===
  const licenseKey = req.headers['x-license-key'];
  if (!licenseKey) {
      return res.status(403).json({ error: 'Licença não fornecida. Insira sua chave de licença.' });
  }

  const { data: licenseData, error: licenseError } = await supabase
      .from('licenses')
      .select('active')
      .eq('key', licenseKey)
      .single();

  if (licenseError || !licenseData) {
      return res.status(403).json({ error: 'Licença Inválida ou Não Encontrada.' });
  }

  if (licenseData.active !== true) {
      return res.status(403).json({ error: 'ACESSO BLOQUEADO: Licença inválida ou suspensa.' });
  }

  // === 2. VERIFICAÇÃO DE CHAVE OPENAI (QUEM PAGA O VETOR?) ===
  const userApiKey = req.headers['x-openai-key'];
  const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;
  
  if (!apiKeyToUse) {
      return res.status(500).json({ error: 'Falta Chave OpenAI. Insira nas configurações.' });
  }

  const openai = new OpenAI({ apiKey: apiKeyToUse });

  // === 3. PROCESSAMENTO DO ARQUIVO ===
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
    if (!fileBuffer) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
      let textContent = '';
      
      // Extração de texto baseada no tipo
      if (fileType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        textContent = data.text;
      } else if (fileType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        textContent = result.value;
      } else {
        return res.status(400).json({ error: 'Formato inválido. Use apenas PDF ou DOCX.' });
      }

      // Limpeza básica
      textContent = textContent.replace(/\s+/g, ' ').trim();
      if (textContent.length < 50) {
          return res.status(400).json({ error: 'O arquivo parece vazio ou tem pouco texto legível.' });
      }

      // Picotar o texto (Chunking) com Sobreposição
      const chunkSize = 500;       // Tamanho do pedaço
      const chunkOverlap = 100;    // Sobreposição para manter contexto
      const chunks = [];
      
      for (let i = 0; i < textContent.length; i += (chunkSize - chunkOverlap)) {
        const chunk = textContent.slice(i, i + chunkSize);
        chunks.push(chunk);
        if (i + chunkSize >= textContent.length) break;
      }

      // Vetorizar e Salvar no Supabase
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
            console.error(openaiError);
            return res.status(401).json({ error: 'Erro OpenAI: Verifique se sua Chave API tem saldo.' });
        }
      }
      
      return res.status(200).json({ success: true, message: 'Documento processado e memória criada com sucesso!' });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao processar: ' + error.message });
    }
  });

  req.pipe(busboy); 
}