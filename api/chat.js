import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*'); 

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
      return res.status(403).json({ error: 'ACESSO BLOQUEADO: Sua licença foi suspensa.' });
  }

  // === 2. OPENAI (CUSTO) ===
  const userApiKey = req.headers['x-openai-key'];
  const apiKeyToUse = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.OPENAI_API_KEY;

  if (!apiKeyToUse) {
      return res.status(500).json({ error: 'Nenhuma chave OpenAI configurada.' });
  }

  const openai = new OpenAI({ apiKey: apiKeyToUse });

  // === 3. PROCESSAMENTO DO CHAT ===
  const { messages, profile, useRag } = req.body; 

  try {
    let systemPrompt = `Você é uma IA interpretando o seguinte perfil: ${profile}.`;
    
    if (useRag) {
      const lastUserMessage = messages[messages.length - 1].content;
      
      let queryEmbedding;
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: lastUserMessage,
        });
        queryEmbedding = embeddingResponse.data[0].embedding;
      } catch (embError) {
        return res.status(401).json({ error: 'Erro OpenAI: Verifique sua Chave API.' });
      }

      const { data: documents, error: supabaseError } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.2, 
        match_count: 10       
      });

      if (supabaseError) return res.status(500).json({ error: 'Erro no Banco de Dados.' });

      if (documents && documents.length > 0) {
        const contextText = documents.map(doc => doc.content).join('\n---\n');
        systemPrompt += `\nINSTRUÇÃO RAG: Use o contexto abaixo.\nCONTEXTO: ${contextText}`;
      } else {
        systemPrompt += `\n(Aviso: Nada encontrado nos documentos)`;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.5,
    });

    res.status(200).json({ reply: completion.choices[0].message.content });

  } catch (error) {
    if (error.status === 401) return res.status(401).json({ error: 'Chave OpenAI Inválida.' });
    res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
}