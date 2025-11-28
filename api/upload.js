import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Busboy from 'busboy';

// Configuração (Pega das variáveis de ambiente da Vercel)
const supabaseUrl = process.env.SUPABASE_URL;
// IMPORTANTE: Aqui precisamos da chave Service Role para ter permissão de escrita sem travas
// Se não tiver a Service Role, tenta usar a Key normal, mas pode dar erro de permissão (RLS)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(supabaseUrl, supabaseKey);

// Desativa o bodyParser padrão da Vercel para podermos ler o arquivo (stream)
export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async function handler(req, res) {
  // Apenas aceita método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const busboy = Busboy({ headers: req.headers });
  let fileBuffer = null;
  let fileName = '';
  let fileType = '';

  // 1. Processar o arquivo recebido (Stream)
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

      // 2. Extrair texto baseado no tipo de arquivo
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

      // Limpar texto (remove excesso de espaços e quebras de linha estranhas)
      textContent = textContent.replace(/\s+/g, ' ').trim();
      
      if (textContent.length < 50) {
         return res.status(400).json({ error: 'O arquivo parece vazio ou tem muito pouco texto legível.' });
      }

      // 3. Dividir texto em pedaços (Chunks) de ~1000 caracteres
      // Isso é necessário porque a IA não consegue ler um livro inteiro de uma vez
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < textContent.length; i += chunkSize) {
        chunks.push(textContent.slice(i, i + chunkSize));
      }

      // 4. Gerar Vetores (Embeddings) e Salvar no Supabase
      // Nota: Este código adiciona aos documentos existentes. 
      // Se quiser limpar a base antes, descomente a linha abaixo:
      // await supabase.from('documents').delete().neq('id', 0); 

      for (const chunk of chunks) {
        // Gerar Embedding (Vetor numérico) na OpenAI
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });
        const embedding = embeddingResponse.data[0].embedding;

        // Salvar no Banco de Dados
        const { error } = await supabase.from('documents').insert({
          content: chunk,
          metadata: { fileName },
          embedding: embedding,
        });

        if (error) throw error;
      }

      return res.status(200).json({ success: true, message: 'Arquivo processado e memória criada com sucesso!' });

    } catch (error) {
      console.error('Erro no processamento:', error);
      return res.status(500).json({ error: 'Erro interno ao processar arquivo: ' + error.message });
    }
  });

  req.pipe(busboy);  
}