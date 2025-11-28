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

// Captura segura dos botões de conversa
const iniciarConversaBtn = document.getElementById("iniciarConversaBtn");
const pararConversaBtn = document.getElementById("pararConversaBtn");
const lerBtn = document.getElementById("lerBtn");

const holoHead = document.getElementById("holo-head");
const holoNome = document.getElementById("holo-nome");
const holoStatusText = document.getElementById("holo-status-text");

const nomeInput = document.getElementById("transformerNome");
const vozSelect = document.getElementById("vozSelect");
const salvarTransformerBtn = document.getElementById("salvarTransformerBtn");
const limparTransformerBtn = document.getElementById("limparTransformerBtn");
const limparListaBtn = document.getElementById("limparListaBtn");
const listaTransformersDiv = document.getElementById("listaTransformers");

// Elementos RAG (Novos)
const arquivoInput = document.getElementById("arquivoInput");
const btnUpload = document.getElementById("btnUpload");
const uploadStatus = document.getElementById("uploadStatus");
const checkRag = document.getElementById("checkRag");

// ===== UTILITÁRIOS =====
function setStatus(texto) {
  if (statusDiv) statusDiv.textContent = texto;
}

function setHoloStatus(texto) {
  if (holoStatusText) holoStatusText.textContent = texto;
}

function setHoloSpeaking(flag) {
  if (!holoHead) return;
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

// Função auxiliar para resetar botões em caso de erro ou fim
function resetarBotoesConversa() {
  if (iniciarConversaBtn) {
    iniciarConversaBtn.disabled = false;
    iniciarConversaBtn.textContent = "🎤 Iniciar Conversa";
  }
  if (pararConversaBtn) {
    pararConversaBtn.disabled = true;
  }
}

function adicionarMensagem(quem, texto) {
  const div = document.createElement("div");
  div.classList.add("msg", quem === "user" ? "usuario" : "ia");

  const titulo = quem === "user" ? "Você" : "IA";
  div.innerHTML = `<strong>${titulo}</strong> ${texto}`;
  
  if (mensagensDiv) {
    mensagensDiv.appendChild(div);
    mensagensDiv.scrollTop = mensagensDiv.scrollHeight;
  }
}

// ===== PERFIL DO AGENTE =====
if (aplicarPerfilBtn) {
    aplicarPerfilBtn.addEventListener("click", () => {
      const textoPerfil = perfilTextarea.value.trim();
      if (!textoPerfil) {
        alert("Escreva o perfil do agente antes de aplicar.");
        return;
      }
      perfilAtual = textoPerfil;
      mensagens = [];
      if (mensagensDiv) mensagensDiv.innerHTML = "";
      setStatus("Perfil aplicado. Pode começar a conversar!");
    });
}

// ===== MÓDULO RAG (UPLOAD) =====
if (btnUpload) {
  btnUpload.addEventListener("click", async () => {
    const arquivo = arquivoInput.files[0];
    if (!arquivo) {
      alert("Selecione um arquivo PDF ou DOCX primeiro.");
      return;
    }

    // Feedback visual
    btnUpload.disabled = true;
    btnUpload.textContent = "Processando...";
    if(uploadStatus) {
        uploadStatus.textContent = "Lendo e vetorizando arquivo...";
        uploadStatus.className = "upload-status loading";
    }

    const formData = new FormData();
    formData.append("file", arquivo);

    try {
      // Chama o backend para processar o arquivo (será criado na Fase 3)
      const resp = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      // Verifica se a resposta é JSON antes de tentar ler
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Servidor não retornou JSON. Verifique se a rota /api/upload existe.");
      }

      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || "Erro no upload");

      if(uploadStatus) {
          uploadStatus.textContent = "✅ Documento aprendido com sucesso!";
          uploadStatus.className = "upload-status success";
      }
      // Auto-marca a caixa de usar RAG
      if(checkRag) checkRag.checked = true; 

    } catch (err) {
      console.error(err);
      if(uploadStatus) {
          uploadStatus.textContent = "❌ " + err.message;
          uploadStatus.className = "upload-status error";
      }
    } finally {
      btnUpload.disabled = false;
      btnUpload.textContent = "Carregar Documento";
    }
  });
}

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
  if (!listaTransformersDiv) return;
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
  if(nomeInput) nomeInput.value = t.nome || "";
  if(perfilTextarea) perfilTextarea.value = t.perfil || "";
  perfilAtual = t.perfil || "";
  vozAtual = t.voz || "alloy";
  if(vozSelect) vozSelect.value = vozAtual;

  if(holoNome) holoNome.textContent = t.nome || "Transformer ativo";
  mensagens = [];
  if(mensagensDiv) mensagensDiv.innerHTML = "";

  setStatus("Transformer carregado. Pode começar a conversar.");
  renderizarListaTransformers();
}

function removerTransformer(id) {
  transformersSalvos = transformersSalvos.filter((x) => x.id !== id);
  if (transformerAtivoId === id) {
    transformerAtivoId = null;
    if(holoNome) holoNome.textContent = "Transformer ativo";
  }
  salvarListaTransformers();
  renderizarListaTransformers();
}

if(salvarTransformerBtn) {
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

      if(holoNome) holoNome.textContent = nome;

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
        console.log("Salvo no Supabase:", data);
      } catch (err) {
        console.error("Erro de rede ao salvar transformer:", err);
      }

      setStatus("Transformer salvo e ativado.");
      renderizarListaTransformers();
    });
}

if(limparTransformerBtn) {
    limparTransformerBtn.addEventListener("click", () => {
      if(perfilTextarea) perfilTextarea.value = "";
      perfilAtual = "";
      if(nomeInput) nomeInput.value = "";
      transformerAtivoId = null;
      if(holoNome) holoNome.textContent = "Transformer ativo";
      mensagens = [];
      if(mensagensDiv) mensagensDiv.innerHTML = "";
      setStatus("Perfil limpo. Defina um novo Transformer.");
    });
}

if(limparListaBtn) {
    limparListaBtn.addEventListener("click", () => {
      if (!transformersSalvos.length) return;
      if (!confirm("Tem certeza que deseja apagar todos os Transformers salvos?"))
        return;
      transformersSalvos = [];
      transformerAtivoId = null;
      salvarListaTransformers();
      renderizarListaTransformers();
    });
}

// ===== CHAT COM BACKEND (/api/chat) =====
async function enviarMensagem() {
  const texto = entradaTexto.value.trim();
  if (!texto) return;

  if (!perfilAtual) {
    alert("Antes, defina o perfil do agente e clique em 'Aplicar perfil'.");
    return;
  }

  if (isProcessingMessage) return;
  isProcessingMessage = true;

  adicionarMensagem("user", texto);
  entradaTexto.value = "";
  setStatus("Gerando resposta...");
  
  // Atualiza status do holograma dependendo se está usando RAG ou não
  const usarRag = checkRag ? checkRag.checked : false;
  setHoloStatus(usarRag ? "Consultando documentos..." : "Pensando...");
  
  if(enviarBtn) enviarBtn.disabled = true;

  mensagens.push({ role: "user", content: texto });

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: perfilAtual,
        messages: mensagens,
        useRag: usarRag // <--- Envia para o backend se deve usar RAG
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
  } finally {
    if(enviarBtn) enviarBtn.disabled = false;
    isProcessingMessage = false;
  }
}

if(enviarBtn) enviarBtn.addEventListener("click", enviarMensagem);
if(entradaTexto) {
    entradaTexto.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem();
      }
    });
}

// ===== RECONHECIMENTO DE VOZ =====
if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    setStatus("Ouvindo... (pode fazer pausas para pensar)");
    
    if(iniciarConversaBtn) {
        iniciarConversaBtn.disabled = true;
        iniciarConversaBtn.textContent = "👂 Ouvindo...";
    }
    if(pararConversaBtn) pararConversaBtn.disabled = false;
    
    console.log("🎤 Reconhecimento iniciado");
  };

  recognition.onend = () => {
    isListening = false;
    console.log("🎤 Reconhecimento finalizado");
    
    if (!conversationActive && !isSpeaking) {
      setStatus("Pronto (aguardando sua mensagem)");
      setHoloStatus("Ocioso");
      resetarBotoesConversa();
    }
    
    if (conversationActive && !isProcessingMessage && !isSpeaking) {
         // Lógica de reconexão se cair sem querer
    }
  };

  recognition.onerror = (event) => {
    console.error("Erro no reconhecimento de voz:", event.error);
    
    if (event.error === "no-speech" && conversationActive) {
      setStatus("Não ouvi nada, tentando reativar...");
      setTimeout(() => {
        if (conversationActive && !isListening && !isSpeaking) {
          try { recognition.start(); } catch (e) {}
        }
      }, 1000);
      return;
    }
    
    setStatus("Erro no microfone: " + event.error);
    conversationActive = false;
    resetarBotoesConversa();
  };

  recognition.onresult = (event) => {
    let textoAtual = "";
    for (let i = 0; i < event.results.length; i++) {
      textoAtual += event.results[i][0].transcript + " ";
    }
    
    textoAtual = textoAtual.trim();
    transcricaoCompleta = textoAtual;
    if(entradaTexto) entradaTexto.value = textoAtual;
    
    clearTimeout(timeoutSilencio);
    
    if (conversationActive && textoAtual.trim()) {
      timeoutSilencio = setTimeout(() => {
        console.log("✅ Enviando frase completa:", textoAtual);
        try { recognition.stop(); } catch (e) {}
        
        setTimeout(() => {
          if (entradaTexto.value.trim()) {
            enviarMensagem();
          }
        }, 200);
      }, 2500);
    }
  };
} else {
  if (iniciarConversaBtn) {
    iniciarConversaBtn.disabled = true;
    iniciarConversaBtn.textContent = "🎤 Não suportado";
  }
}

// ===== LÓGICA DOS BOTÕES (CORREÇÃO DE TRAVAMENTO) =====

if (iniciarConversaBtn) {
  iniciarConversaBtn.addEventListener("click", () => {
    if (!recognition) return;
    
    if (!pararConversaBtn) {
        alert("Erro de Interface: Botão Parar não encontrado.");
        return; 
    }
    
    conversationActive = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    
    setHoloStatus("Modo conversa ativo");
    
    try {
      recognition.start();
    } catch (e) {
      console.warn("Erro ao iniciar reconhecimento:", e);
      conversationActive = false;
    }
  });
}

if (pararConversaBtn) {
  pararConversaBtn.addEventListener("click", () => {
    if (!recognition) return;
    
    conversationActive = false;
    clearTimeout(timeoutSilencio);
    
    setStatus("Modo conversa interrompido.");
    setHoloStatus("Ocioso");
    
    try {
      recognition.stop();
    } catch (e) {}
    
    resetarBotoesConversa();
  });
}

// ===== TTS COM OPENAI (VOZ HUMANIZADA) =====
async function lerRespostaComOpenAI(autoLoop = false) {
  if (!ultimaRespostaIA) {
    alert("Ainda não há resposta da IA para ler.");
    return;
  }

  try {
    setHoloSpeaking(true);
    isSpeaking = true;
    try { recognition.stop(); } catch(e){}

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
            } catch (e) {}
          }
        }, 1000);
      } else {
        setStatus("Pronto (aguardando sua mensagem)");
        setHoloStatus("À disposição.");
        if (!conversationActive) resetarBotoesConversa();
      }
    };

    audio.play();
  } catch (err) {
    console.error(err);
    setHoloSpeaking(false);
    isSpeaking = false;
    setStatus("Erro ao gerar áudio.");
    if(conversationActive) {
        try { recognition.start(); } catch(e){}
    }
  }
}

if (lerBtn) {
  lerBtn.addEventListener("click", () => {
    lerRespostaComOpenAI(false);
  });
}

if(vozSelect) {
    vozSelect.addEventListener("change", () => {
      vozAtual = vozSelect.value;
    });
}

// ===== INICIALIZAÇÃO =====
carregarTransformersSalvos();  
setHoloStatus("Ocioso");
setStatus("Pronto (aguardando sua mensagem)");
console.log("✅ IA Transformers iniciada - RAG Habilitado"); 