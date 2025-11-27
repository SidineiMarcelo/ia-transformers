// api/transformers.js - CRUD simples de Transformers no Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function createTransformer({ name, profile }) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/transformers`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      profile,
      user_id: null, // por enquanto sem autenticação
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Erro ao criar transformer:", data);
    throw new Error("Erro ao criar transformer no Supabase");
  }

  // retorna o primeiro registro criado
  return data[0];
}

async function listTransformers() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/transformers?select=*`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("Erro ao listar transformers:", data);
    throw new Error("Erro ao listar transformers no Supabase");
  }

  return data;
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Supabase não configurado." });
    return;
  }

  try {
    if (req.method === "POST") {
      const { name, profile } = req.body || {};
      if (!name) {
        res.status(400).json({ error: "Nome do transformer é obrigatório." });
        return;
      }

      const transformer = await createTransformer({ name, profile });
      res.status(200).json({ transformer });
      return;
    }

    if (req.method === "GET") {
      const transformers = await listTransformers();
      res.status(200).json({ transformers });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Erro em /api/transformers:", error);
    res.status(500).json({ error: "Erro no servidor de transformers." });  
  }
};
