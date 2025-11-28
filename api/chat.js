import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Conectar ao Supabase
const supabaseUrl = process.env.SUPABASE_URL;
// Tenta usar a chave de serviço (mais poderosa) se disponível, senão usa a padrão
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Configuração de CORS (permite que o front fale com o back)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, profile, useRag } = req.body; 

  try {
    let systemPrompt = `Você é uma IA interpretando o seguinte perfil: ${profile}.`;
    
    // === LÓGICA RAG (Consulta ao Banco) ===
    if (useRag) {
      console.log("RAG Ativo: Iniciando busca..."); 

      const lastUserMessage = messages[messages.length - 1].content;

      // 1. Gerar Embedding (Transformar pergunta em números)
      let queryEmbedding;
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: lastUserMessage,
        });
        queryEmbedding = embeddingResponse.data[0].embedding;
      } catch (embError) {
        console.error("Erro ao gerar embedding:", embError);
        return res.status(500).json({ error: 'Erro na OpenAI (Embedding): ' + embError.message });
      }

      // 2. Buscar no Supabase os trechos parecidos
      const { data: documents, error: supabaseError } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.2, // Baixei a régua para 0.2 (encontra mais coisas)
        match_count: 10       // Traz 10 pedaços de texto para a IA ler
      });

      if (supabaseError) {
        console.error("Erro CRÍTICO no Supabase:", supabaseError);
        return res.status(500).json({ error: 'Erro na busca do banco: ' + supabaseError.message });
      }

      // 3. Montar o contexto
      if (documents && documents.length > 0) {
        const contextText = documents.map(doc => doc.content).join('\n---\n');
        
        systemPrompt += `
        
        INSTRUÇÃO ESPECIAL (RAG ATIVO):
        O usuário carregou documentos de referência. Use AS INFORMAÇÕES ABAIXO para responder a pergunta. 
        Se a resposta não estiver clara no texto, diga "Com base nos documentos, não encontrei essa informação específica", mas tente ajudar com o que tiver.
        
        CONTEXTO DOS DOCUMENTOS:
        ${contextText}
        `;
      } else {
        console.log("RAG: Nenhum documento encontrado com threshold 0.2");
        systemPrompt += `\n(Aviso interno: O usuário pediu para usar documentos, mas a busca no banco não retornou nada relevante para essa pergunta específica.)`;
      }
    }

    // === GERAÇÃO DA RESPOSTA FINAL ===
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modelo rápido e inteligente
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.5, // Criatividade média
    });

    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });

  } catch (error) {
    console.error('Erro GERAL na API:', error);
    // Retorna o erro detalhado para ajudar no debug
    res.status(500).json({ error: 'Erro interno: ' + error.message }); 
  }
}