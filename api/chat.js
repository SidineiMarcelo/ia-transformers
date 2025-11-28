import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Busboy from 'busboy';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    file.on('end', () => {
      fileBuffer = Buffer.concat(chunks);
    });
  });

  busboy.on('finish', async () => {
    if (!fileBuffer) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
      let textContent = '';

      if (fileType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        textContent = data.text;
      } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        textContent = result.value;
      } else {
        return res.status(400).json({ error: 'Formato não suportado. Use PDF ou DOCX.' });
      }

      textContent = textContent.replace(/\s+/g, ' ').trim();
      
      if (textContent.length < 50) {
         return res.status(400).json({ error: 'O arquivo parece vazio ou tem pouco texto.' });
      }

      // === AJUSTE 1: Cortes menores e com sobreposição (Overlap) ===
      const chunkSize = 500;  // Pedaços menores para busca mais precisa
      const chunkOverlap = 100; // Repete o finalzinho para manter contexto
      const chunks = [];

      // Lógica de loop com sobreposição
      for (let i = 0; i < textContent.length; i += (chunkSize - chunkOverlap)) {
        const chunk = textContent.slice(i, i + chunkSize);
        chunks.push(chunk);
        // Se chegamos ao fim do texto, paramos
        if (i + chunkSize >= textContent.length) break;
      }

      // === FIM DO AJUSTE 1 ===

      for (const chunk of chunks) {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });
        const embedding = embeddingResponse.data[0].embedding;

        const { error } = await supabase.from('documents').insert({
          content: chunk,
          metadata: { fileName },
          embedding: embedding,
        });

        if (error) throw error;
      }

      return res.status(200).json({ success: true, message: 'Arquivo processado e memória criada!' });

    } catch (error) {
      console.error('Erro no processamento:', error);
      return res.status(500).json({ error: 'Erro interno ao processar arquivo: ' + error.message });
    }
  });

  req.pipe(busboy); 
}