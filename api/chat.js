import { createClient } from '@supabase/supabase-js';

// ===== SUPABASE CLIENT =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[CHAT API] Variáveis do Supabase ausentes.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ===== HANDLER PRINCIPAL =====
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  // ===== 1. SEGURANÇA E LICENÇA =====
  try {
    const licenseKey = req.headers['x-license-key'];
    if (!licenseKey) {
      return res.status(403).json({ error: 'Licença ausente.' });
    }

    const { data: license, error: licErr } = await supabase
      .from('licenses')
      .select('active')
      .eq('key', licenseKey)
      .single();

    if (licErr) {
      console.error('Erro ao consultar licença:', licErr);
      return res.status(500).json({ error: 'Erro ao validar licença.' });
    }

    if (!license?.active) {
      return res.status(403).json({ error: 'Licença bloqueada.' });
    }

    // ===== 2. CHAVE DA API GEMINI =====
    const userApiKey = req.headers['x-google-key'];
    const apiKey =
      userApiKey && userApiKey.length > 10
        ? userApiKey
        : process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Falta Chave Google Gemini.' });
    }

    // ===== 3. BODY DA REQUISIÇÃO =====
    const {
      messages = [],
      profile = '',
      useRag = false,
      name,
      mediaData,
      mediaType,
    } = req.body || {};

    if (!messages.length) {
      return res
        .status(400)
        .json({ error: 'Nenhuma mensagem foi enviada para a IA.' });
    }

    const nomeIA = name || 'Assistente Transformers';

    // ===== 4. SYSTEM PROMPT / INSTRUÇÃO =====
    let systemInstruction = `
IDENTIDADE: Você é "${nomeIA}", uma IA de Treinamento Corporativo Avançado.
PERFIL: ${profile}.
CAPACIDADE: Analise textos, imagens e (se disponível) vídeos técnicos com precisão.
ESTILO: Explique de forma clara, organizada e didática. Use exemplos práticos sempre que possível.

TAREFA EXTRA (QUIZ):
Se o usuário pedir um "Quiz", "Prova" ou "Teste", gere 3 perguntas de múltipla escolha difíceis
baseadas no conhecimento que você tem (contexto da conversa + PDFs + RAG, se houver).
No final, mostre o gabarito separado, indicando a alternativa correta de cada questão.
`;

    // ===== 5. RAG (BUSCA DOCUMENTAL NO SUPABASE) =====
    if (useRag) {
      try {
        const lastUserMsg = messages[messages.length - 1]?.content || '';

        if (lastUserMsg.trim().length > 0) {
          // 5.1 – Embedding usando API v1
          const embedUrl =
            'https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=' +
            apiKey;

          const embRes = await fetch(embedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
              content: { parts: [{ text: lastUserMsg }] },
            }),
          });

          const embData = await embRes.json();

          // Estrutura oficial: { embeddings: [ { values: [...] } ] }
          const embeddingValues =
            embData?.embedding?.values || embData?.embeddings?.[0]?.values;

          if (Array.isArray(embeddingValues) && embeddingValues.length > 0) {
            const { data: docs, error: ragErr } = await supabase.rpc(
              'match_documents',
              {
                query_embedding: embeddingValues,
                match_threshold: 0.3,
                match_count: 6,
              },
            );

            if (ragErr) {
              console.error('Erro no RAG / match_documents:', ragErr);
            } else if (docs && docs.length > 0) {
              const ctx = docs.map((d) => d.content).join('\n---\n');
              systemInstruction += `

BASE DE CONHECIMENTO (RAG – PRIORITÁRIA):
Use estes trechos como referência principal para responder, mantendo coerência com o conteúdo abaixo:
${ctx}
`;
            }
          } else {
            console.warn(
              '[RAG] Não foi possível obter embedding válido da API Gemini.',
            );
          }
        }
      } catch (e) {
        console.error('[RAG] Erro ao executar fluxo de RAG:', e);
        // Não impede o chat de continuar; apenas segue sem RAG
      }
    }

    // ===== 6. MONTAGEM DO PROMPT MULTIMODAL =====
    const contents = messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    // Mídia (imagem / vídeo) anexada
    if (mediaData && mediaType && contents.length > 0) {
      const base64Clean = mediaData.includes(',')
        ? mediaData.split(',')[1]
        : mediaData;

      const lastMsgIndex = contents.length - 1;

      contents[lastMsgIndex].parts.push({
        inline_data: {
          mime_type: mediaType,
          data: base64Clean,
        },
      });

      systemInstruction += `

[SISTEMA]: O usuário anexou um arquivo visual (${mediaType}). Analise-o detalhadamente
e use as informações visuais como contexto adicional para a resposta.`;
    }

    // ===== 7. CHAMADA À API DO GEMINI (v1) =====
    // Modelo estável e suportado na v1:
    const modelVersion = 'gemini-1.5-flash-002';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelVersion}:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      let errData = {};
      try {
        errData = await response.json();
      } catch (_) {
        // ignora parsing error
      }
      console.error('Erro Gemini:', errData);
      const msg =
        errData?.error?.message ||
        `Erro na API Gemini (status ${response.status})`;
      throw new Error(msg);
    }

    const result = await response.json();
    const reply =
      result?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join('\n') || 'Não consegui processar a resposta.';

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('[CHAT API] Erro geral:', error);
    return res.status(500).json({ error: error.message || 'Erro interno.' });
  }
}   
