import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Configurações de CORS e Método
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // 1. SEGURANÇA E CHAVES
  const licenseKey = req.headers['x-license-key'];
  if (!licenseKey) return res.status(403).json({ error: 'Licença ausente.' });

  const { data: license } = await supabase.from('licenses').select('active').eq('key', licenseKey).single();
  if (!license?.active) return res.status(403).json({ error: 'Licença bloqueada.' });

  const userApiKey = req.headers['x-google-key'];
  const apiKey = userApiKey && userApiKey.length > 10 ? userApiKey : process.env.GEMINI_API_KEY;
  
  if (!apiKey) return res.status(500).json({ error: 'Falta Chave Google Gemini.' });

  const { messages, profile, useRag, name, mediaData, mediaType } = req.body; 

  try {
    const nomeIA = name || "Assistente Transformers";
    
    let systemInstruction = `
    IDENTIDADE: Você é "${nomeIA}", uma IA de Treinamento Corporativo Avançado.
    PERFIL: ${profile}.
    CAPACIDADE: Analise textos, imagens e vídeos técnicos com precisão.
    TAREFA EXTRA (QUIZ): Se o usuário pedir um "Quiz", "Prova" ou "Teste", gere 3 perguntas de múltipla escolha difíceis baseadas no conhecimento que você tem. No final, mostre o gabarito.
    `;

    // 2. RAG (Busca Documental)
    if (useRag) {
        const lastMsg = messages[messages.length - 1].content;
        
        // Gerar vetor da pergunta (Embedding Google)
        const embRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text: lastMsg }] } })
        });
        const embData = await embRes.json();
        
        if (embData.embedding) {
            const { data: docs } = await supabase.rpc('match_documents', {
                query_embedding: embData.embedding.values,
                match_threshold: 0.3, 
                match_count: 6
            });

            if (docs && docs.length > 0) {
                const ctx = docs.map(d => d.content).join('\n---\n');
                systemInstruction += `\n\nBASE DE CONHECIMENTO (PRIORITÁRIA):\nUse estes dados para responder:\n${ctx}`;
            }
        }
    }

    // 3. Montagem do Prompt Multimodal
    const contents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }));

    if (mediaData && mediaType) {
        const base64Clean = mediaData.split(',')[1] || mediaData;
        const lastMsgIndex = contents.length - 1;
        
        contents[lastMsgIndex].parts.push({
            inline_data: {
                mime_type: mediaType, 
                data: base64Clean
            }
        });
        systemInstruction += `\n\n[SISTEMA]: O usuário anexou um arquivo visual (${mediaType}). Analise-o detalhadamente.`;
    }

    // 4. Chamada à API do Gemini (CORREÇÃO DE MODELO)
    // O nome 'gemini-1.5-flash-latest' é o mais estável para evitar o erro "not found"
    const modelVersion = "gemini-1.5-pro-002"; 
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: contents,
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 2048,
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        console.error("Erro Gemini:", errData);
        throw new Error(errData.error?.message || "Erro na API Gemini");
    }

    const result = await response.json();
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui processar a resposta.";

    res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}    