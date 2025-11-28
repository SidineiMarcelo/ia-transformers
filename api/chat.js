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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, profile, useRag } = req.body; // Recebemos a flag useRag aqui

  try {
    let systemPrompt = `Você é uma IA interpretando o seguinte perfil: ${profile}.`;
    
    // LÓGICA RAG (Só ativa se a caixinha estiver marcada no Frontend)
    if (useRag) {
      // 1. Pegar a última pergunta do usuário
      const lastUserMessage = messages[messages.length - 1].content;

      // 2. Transformar a pergunta em vetor (Embedding)
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: lastUserMessage,
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;

      // 3. Buscar no Supabase os trechos mais parecidos
      // Chama a função 'match_documents' que criamos no SQL do Supabase
      const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5, // Similaridade mínima
        match_count: 3        // Top 3 trechos mais relevantes
      });

      if (error) console.error("Erro no Supabase:", error);

      // 4. Se achou documentos, adiciona ao contexto do System Prompt
      if (documents && documents.length > 0) {
        const contextText = documents.map(doc => doc.content).join('\n---\n');
        
        systemPrompt += `
        
        INSTRUÇÃO ESPECIAL (RAG ATIVO):
        O usuário carregou documentos de referência. Use EXCLUSIVAMENTE o contexto abaixo para responder a pergunta. 
        Se a resposta não estiver no contexto, diga gentilmente que não encontrou a informação nos documentos fornecidos.
        
        CONTEXTO DOS DOCUMENTOS:
        ${contextText}
        `;
      } else {
        systemPrompt += `\n(Aviso interno: O usuário pediu para usar documentos, mas a busca no banco não retornou nada relevante para essa pergunta específica.)`;
      }
    }

    // Montar a lista final de mensagens para a OpenAI
    const messagesForOpenAI = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou gpt-3.5-turbo
      messages: messagesForOpenAI,
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });

  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ error: 'Erro interno ao processar chat.' }); 
  }
}