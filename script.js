// ===== ESTADO GLOBAL =====
let mensagens = [];
let perfilAtual = "";
let ultimaRespostaIA = "";
let vozAtual = "alloy";

let transformersSalvos = [];
let transformerAtivoId = null;

let recognition = null;
let conversationActive = false;
let isListening = false;
let isProcessingMessage = false;
let isSpeaking = false;
let timeoutSilencio = null;
let transcricaoCompleta = "";

// ===== ELEMENTOS DA INTERFACE =====
const perfilTextarea = document.getElementById("perfil");
const aplicarPerfilBtn = document.getElementById("aplicarPerfilBtn");

const mensagensDiv = document.getElementById("mensagens");
const statusDiv = document.getElementById("status");
const entradaTexto = document.getElementById("entradaTexto");
const enviarBtn = document.getElementById("enviarBtn");
const falarBtn = document.getElementById("falarBtn");
const lerBtn = document.getElementById("lerBtn");

const holoHead = document.getElementById("holo-head");
const holoNome = document.getElementById("holo-nome");
const holoDescricao = document.getElementById("holo-descricao");
const holoStatusText = document.getElementById("holo-status-text");

const nomeInput = document.getElementById("transformerNome");
const vozSelect = document.getElementById("vozSelect");
const salvarTransformerBtn = document.getElementById("salvarTransformerBtn");
const limparTransformerBtn = document.getElementById("limparTransformerBtn");
const limparListaBtn = document.getElementById("limparListaBtn");
const listaTransformersDiv = document.getElementById("listaTransformers");

// ===== UTILITÁRIOS =====
function setStatus(texto) {
  statusDiv.textContent = texto;
}

function setHoloStatus(texto) {
  holoStatusText.textContent = texto;
}

function setHoloSpeaking(flag) {
  if (flag) {
    holoHead.classList.add("speaking");
    setHoloStatus("Falando com você...");
  } else {
    holoHead.classList.remove("speaking");
    setHoloStatus(
      conversationActive ? "Modo conversa ativo" : "Ocioso"
    );
  }
}

function adicionarMensagem(quem, texto) {
  const div = document.createElement("div");
  div.classList.add("msg", quem === "user" ? "usuario" : "ia");

  const titulo = quem === "user" ? "Você" : "IA";
  div.innerHTML = `<strong>${titulo}</strong> ${texto}`;
  mensagensDiv.appendChild(div);
  mensagensDiv.scrollTop = mensagensDiv.scrollHeight;
}

// ===== PERFIL DO AGENTE =====
aplicarPerfilBtn.addEventListener("click", () => {
  const textoPerfil = perfilTextarea.value.trim();
  if (!textoPerfil) {
    alert("Escreva o perfil do agente antes de aplicar.");
    return;
  }
  perfilAtual = textoPerfil;
  mensagens = [];
  mensagensDiv.innerHTML = "";
  setStatus("Perfil aplicado. Pode começar a conversar!");

  if (transformerAtivoId === null && nomeInput.value.trim()) {
    holoDescricao.textContent =
      perfilAtual.slice(0, 160) + (perfilAtual.length > 160 ? "..." : "");
  }
});

// ===== TRANSFORMERS SALVOS (LOCALSTORAGE) =====
function carregarTransformersSalvos() {
  try {
    const raw = localStorage.getItem("ia_transformers_lista");
    transformersSalvos = raw ? JSON.parse(raw) : [];
  } catch {
    transformersSalvos = [];
  }
  renderizarListaTransformers();
}

function salvarListaTransformers() {
  localStorage.setItem(
    "ia_transformers_lista",
    JSON.stringify(transformersSalvos)
  );
}

function renderizarListaTransformers() {
  listaTransformersDiv.innerHTML = "";

  if (!transformersSalvos.length) {
    const p = document.createElement("p");
    p.className = "lista-vazia";
    p.textContent = "Nenhum Transformer salvo ainda.";
    listaTransformersDiv.appendChild(p);
    return;
  }

  transformersSalvos.forEach((t) => {
    const item = document.createElement("div");
    item.className = "transformer-item";
    if (t.id === transformerAtivoId) {
      item.classList.add("active");
    }

    const meta = document.createElement("div");
    meta.className = "transformer-meta";

    const n = document.createElement("span");
    n.className = "transformer-name";
    n.textContent = t.nome || "Sem nome";

    const sub = document.createElement("span");
    sub.className = "transformer-sub";
    sub.textContent = `Voz: ${t.voz} · Perfil: ${t.perfil.slice(0, 40)}${
      t.perfil.length > 40 ? "..." : ""
    }`;

    meta.appendChild(n);
    meta.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "transformer-actions";

    const carregarBtn = document.createElement("button");
    carregarBtn.textContent = "Ativar";
    carregarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ativarTransformer(t.id);
    });

    const apagarBtn = document.createElement("button");
    apagarBtn.textContent = "X";
    apagarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removerTransformer(t.id);
    });

    actions.appendChild(carregarBtn);
    actions.appendChild(apagarBtn);

    item.appendChild(meta);
    item.appendChild(actions);

    item.addEventListener("click", () => ativarTransformer(t.id));

    listaTransformersDiv.appendChild(item);
  });
}

function ativarTransformer(id) {
  const t = transformersSalvos.find((x) => x.id === id);
  if (!t) return;

  transformerAtivoId = t.id;
  nomeInput.value = t.nome || "";
  perfilTextarea.value = t.perfil || "";
  perfilAtual = t.perfil || "";
  vozAtual = t.voz || "alloy";
  vozSelect.value = vozAtual;

  holoNome.textContent = t.nome || "Transformer ativo";
  holoDescricao.textContent =
    t.perfil.slice(0, 160) + (t.perfil.length > 160 ? "..." : "");
  mensagens = [];
  mensagensDiv.innerHTML = "";

  setStatus("Transformer carregado. Pode começar a conversar.");
  renderizarListaTransformers();
}

function removerTransformer(id) {
  transformersSalvos = transformersSalvos.filter((x) => x.id !== id);
  if (transformerAtivoId === id) {
    transformerAtivoId = null;
    holoNome.textContent = "Transformer ativo";
    holoDescricao.textContent =
      "Configure um novo Transformer à direita e salve para reutilizar depois.";
  }
  salvarListaTransformers();
  renderizarListaTransformers();
}

salvarTransformerBtn.addEventListener("click", async () => {
  const nome = nomeInput.value.trim();
  const perfil = perfilTextarea.value.trim();

  if (!nome) {
    alert("Dê um nome para o Transformer antes de salvar.");
    return;
  }
  if (!perfil) {
    alert("Defina um perfil para o Transformer antes de salvar.");
    return;
  }

  perfilAtual = perfil;
  vozAtual = vozSelect.value;

  const novoLocal = {
    id: Date.now(),
    nome,
    perfil,
    voz: vozAtual,
  };

  transformersSalvos.push(novoLocal);
  salvarListaTransformers();
  transformerAtivoId = novoLocal.id;

  holoNome.textContent = nome;
  holoDescricao.textContent =
    perfil.slice(0, 160) + (perfil.length > 160 ? "..." : "");

  try {
    const resp = await fetch("/api/transformers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nome,
        profile: perfil,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Erro ao salvar no Supabase:", data);
      alert("Erro ao salvar no Supabase. Veja o console.");
    } else {
      console.log("Transformer salvo no Supabase:", data);
    }
  } catch (err) {
    console.error("Erro de rede ao salvar transformer:", err);
    alert("Erro ao conectar ao servidor para salvar o Transformer.");
  }

  setStatus("Transformer salvo e ativado.");
  renderizarListaTransformers();
});

limparTransformerBtn.addEventListener("click", () => {
  perfilTextarea.value = "";
  perfilAtual = "";
  nomeInput.value = "";
  transformerAtivoId = null;
  holoNome.textContent = "Transformer ativo";
  holoDescricao.textContent =
    "Configure um novo Transformer à direita e salve para reutilizar depois.";
  mensagens = [];
  mensagensDiv.innerHTML = "";
  setStatus("Perfil limpo. Defina um novo Transformer.");
});

limparListaBtn.addEventListener("click", () => {
  if (!transformersSalvos.length) return;
  if (!confirm("Tem certeza que deseja apagar todos os Transformers salvos?"))
    return;
  transformersSalvos = [];
  transformerAtivoId = null;
  salvarListaTransformers();
  renderizarListaTransformers();
});

// ===== CHAT COM BACKEND (/api/chat) =====
async function enviarMensagem() {
  const texto = entradaTexto.value.trim();
  if (!texto) return;

  if (!perfilAtual) {
    alert("Antes, defina o perfil do agente e clique em 'Aplicar perfil'.");
    return;
  }

  if (isProcessingMessage) {
    return;
  }
  isProcessingMessage = true;

  adicionarMensagem("user", texto);
  entradaTexto.value = "";
  setStatus("Gerando resposta...");
  setHoloStatus("Pensando...");
  enviarBtn.disabled = true;

  mensagens.push({ role: "user", content: texto });

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: perfilAtual,
        messages: mensagens,
      }),
    });

    if (!resp.ok) {
      throw new Error("Erro na resposta do servidor");
    }

    const data = await resp.json();
    const resposta = data.reply || "Não consegui gerar uma resposta agora.";

    mensagens.push({ role: "assistant", content: resposta });
    ultimaRespostaIA = resposta;
    adicionarMensagem("ia", resposta);

    if (conversationActive) {
      setStatus("Falando com você...");
      await lerRespostaComOpenAI(true);
    } else {
      setStatus("Pronto (aguardando sua mensagem)");
      setHoloStatus("À disposição.");
    }
  } catch (err) {
    console.error(err);
    setStatus("Erro ao conversar com a IA.");
    setHoloStatus("Erro de conexão.");
    alert("Ocorreu um erro ao chamar a IA. Verifique o console.");
  } finally {
    enviarBtn.disabled = false;
    isProcessingMessage = false;
  }
}

enviarBtn.addEventListener("click", enviarMensagem);
entradaTexto.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// ===== RECONHECIMENTO DE VOZ - VERSÃO CORRIGIDA (NÃO DUPLICA) =====
if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    setStatus("Ouvindo... (pode fazer pausas para pensar)");
    console.log("🎤 Reconhecimento iniciado");
  };

  recognition.onend = () => {
    isListening = false;
    console.log("🎤 Reconhecimento finalizado");
    
    if (!conversationActive && !isSpeaking) {
      setStatus("Pronto (aguardando sua mensagem)");
      setHoloStatus("Ocioso");
    }
  };

  recognition.onerror = (event) => {
    console.error("Erro no reconhecimento de voz:", event.error);
    setStatus("Erro ao reconhecer voz.");
    
    if (conversationActive) {
      conversationActive = false;
      falarBtn.textContent = "🎤 Falar (modo conversa)";
      setHoloStatus("Ocioso");
    }
  };

  recognition.onresult = (event) => {
    let textoAtual = "";
    for (let i = 0; i < event.results.length; i++) {
      textoAtual += event.results[i][0].transcript + " ";
    }
    
    textoAtual = textoAtual.trim();
    transcricaoCompleta = textoAtual;
    entradaTexto.value = textoAtual;
    
    console.log("🎤 Capturando:", textoAtual);
    
    clearTimeout(timeoutSilencio);
    
    if (conversationActive && textoAtual.trim()) {
      timeoutSilencio = setTimeout(() => {
        console.log("✅ Enviando frase completa:", textoAtual);
        
        try {
          recognition.stop();
        } catch (e) {}
        
        setTimeout(() => {
          if (entradaTexto.value.trim()) {
            enviarMensagem();
          }
        }, 200);
      }, 2500);
    }
  };
} else {
  falarBtn.disabled = true;
  falarBtn.textContent = "🎤 Falar (não suportado neste navegador)";
}

falarBtn.textContent = "🎤 Falar (modo conversa)";

falarBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (!conversationActive) {
    conversationActive = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    falarBtn.textContent = "🛑 Parar conversa";
    setStatus("Modo conversa: ouvindo você...");
    setHoloStatus("Modo conversa ativo");
    
    try {
      recognition.start();
    } catch (e) {
      console.warn("Erro ao iniciar reconhecimento:", e);
    }
  } else {
    conversationActive = false;
    clearTimeout(timeoutSilencio);
    falarBtn.textContent = "🎤 Falar (modo conversa)";
    setStatus("Modo conversa interrompido.");
    setHoloStatus("Ocioso");
    
    try {
      recognition.stop();
    } catch (e) {}
  }
});

// ===== TTS COM OPENAI (VOZ HUMANIZADA) =====
async function lerRespostaComOpenAI(autoLoop = false) {
  if (!ultimaRespostaIA) {
    alert("Ainda não há resposta da IA para ler.");
    return;
  }

  try {
    setHoloSpeaking(true);
    isSpeaking = true;

    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: ultimaRespostaIA,
        voice: vozAtual || "alloy",
      }),
    });

    if (!resp.ok) {
      throw new Error("Erro ao gerar áudio");
    }

    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      setHoloSpeaking(false);
      isSpeaking = false;

      if (conversationActive && recognition && autoLoop && !isProcessingMessage) {
        setStatus("Modo conversa: ouvindo você...");
        setHoloStatus("Modo conversa ativo");

        setTimeout(() => {
          if (!isListening && conversationActive) {
            try {
              recognition.start();
              console.log("🔄 Reconhecimento reiniciado");
            } catch (e) {
              console.warn("Erro ao reiniciar reconhecimento:", e);
            }
          }
        }, 1500);
      } else {
        setStatus("Pronto (aguardando sua mensagem)");
        setHoloStatus("À disposição.");
      }
    };

    audio.play();
  } catch (err) {
    console.error(err);
    setHoloSpeaking(false);
    isSpeaking = false;
    setStatus("Erro ao gerar áudio.");
    alert("Ocorreu um erro ao gerar o áudio da IA.");
  }
}

lerBtn.addEventListener("click", () => {
  lerRespostaComOpenAI(false);
});

vozSelect.addEventListener("change", () => {
  vozAtual = vozSelect.value;
});

// ===== INICIALIZAÇÃO =====
carregarTransformersSalvos(); 
setHoloStatus("Ocioso");
setStatus("Pronto (aguardando sua mensagem)");
console.log("✅ IA Transformers iniciada - Versão CORRIGIDA"); 