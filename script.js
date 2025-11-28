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

// Variável para controlar o áudio atual (Permite interromper a fala)
let currentAudio = null;

// ===== ELEMENTOS DA INTERFACE =====
const perfilTextarea = document.getElementById("perfil");
const aplicarPerfilBtn = document.getElementById("aplicarPerfilBtn");

const mensagensDiv = document.getElementById("mensagens");
const statusDiv = document.getElementById("status");
const entradaTexto = document.getElementById("entradaTexto");
const enviarBtn = document.getElementById("enviarBtn");

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

const arquivoInput = document.getElementById("arquivoInput");
const btnUpload = document.getElementById("btnUpload");
const uploadStatus = document.getElementById("uploadStatus");
const checkRag = document.getElementById("checkRag");
const fileNameDisplay = document.getElementById("fileNameDisplay");

const userApiKeyInput = document.getElementById("userApiKey");
const licenseKeyInput = document.getElementById("licenseKeyInput");

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
    setHoloStatus("Falando...");
  } else {
    holoHead.classList.remove("speaking");
    setHoloStatus(
      conversationActive ? "Ouvindo..." : "Ocioso"
    );
  }
}

function resetarBotoesConversa() {
  if (iniciarConversaBtn) {
    iniciarConversaBtn.disabled = false;
    iniciarConversaBtn.textContent = "🎤 Iniciar Conversa";
  }
  if (pararConversaBtn) {
    pararConversaBtn.disabled = true;
  }
}

// Função para PARAR o áudio imediatamente (Interrupção)
function pararAudioIA() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    setHoloSpeaking(false);
    isSpeaking = false;
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

// ===== GERENCIAMENTO DE CHAVES =====
window.addEventListener('load', () => {
    const savedLicense = localStorage.getItem("ia_license_key");
    if (savedLicense && licenseKeyInput) licenseKeyInput.value = savedLicense;

    const savedOpenAI = localStorage.getItem("ia_client_api_key");
    if (savedOpenAI && userApiKeyInput) userApiKeyInput.value = savedOpenAI;
});

if (licenseKeyInput) {
    licenseKeyInput.addEventListener('input', () => localStorage.setItem("ia_license_key", licenseKeyInput.value.trim()));
}
if (userApiKeyInput) {
    userApiKeyInput.addEventListener('input', () => localStorage.setItem("ia_client_api_key", userApiKeyInput.value.trim()));
}

function getAuthHeaders() {
    return {
        "x-license-key": licenseKeyInput ? licenseKeyInput.value.trim() : "",
        "x-openai-key": userApiKeyInput ? userApiKeyInput.value.trim() : ""
    };
}

// ===== PERFIL DO AGENTE =====
if (aplicarPerfilBtn) {
    aplicarPerfilBtn.addEventListener("click", () => {
      const textoPerfil = perfilTextarea.value.trim();
      const nomeAgente = nomeInput.value.trim();
      
      if (!textoPerfil) {
        alert("Escreva o perfil do agente antes de aplicar.");
        return;
      }
      
      perfilAtual = textoPerfil;
      // Atualiza visualmente o nome
      if (nomeAgente) {
          holoNome.textContent = nomeAgente;
      }
      
      mensagens = [];
      if (mensagensDiv) mensagensDiv.innerHTML = "";
      setStatus("Perfil aplicado. Pode começar a conversar!");
    });
}

// ===== MÓDULO RAG (UPLOAD) =====
if (arquivoInput) {
  arquivoInput.addEventListener('change', () => {
    if (arquivoInput.files.length > 0) {
      if(fileNameDisplay) fileNameDisplay.textContent = arquivoInput.files[0].name;
    } else {
      if(fileNameDisplay) fileNameDisplay.textContent = "Nenhum arquivo selecionado";
    }
  });
}

if (btnUpload) {
  btnUpload.addEventListener("click", async () => {
    const arquivo = arquivoInput.files[0];
    if (!arquivo) {
      alert("Selecione um arquivo primeiro.");
      return;
    }
    if (licenseKeyInput && !licenseKeyInput.value.trim()) {
        alert("Insira a Chave de Licença.");
        return;
    }

    btnUpload.disabled = true;
    btnUpload.textContent = "Processando...";
    if(uploadStatus) {
        uploadStatus.textContent = "Validando licença e lendo arquivo...";
        uploadStatus.className = "upload-status loading";
    }

    const formData = new FormData();
    formData.append("file", arquivo);

    try {
      const resp = await fetch("/api/upload", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || "Erro no upload");

      if(uploadStatus) {
          uploadStatus.textContent = "✅ Documento aprendido com sucesso!";
          uploadStatus.className = "upload-status success";
      }
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

// ===== TRANSFORMERS SALVOS =====
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
  localStorage.setItem("ia_transformers_lista", JSON.stringify(transformersSalvos));
}

function renderizarListaTransformers() {
  if (!listaTransformersDiv) return;
  listaTransformersDiv.innerHTML = "";

  if (!transformersSalvos.length) {
    const p = document.createElement("p");
    p.className = "lista-vazia";
    p.textContent = "Nenhum Transformer salvo.";
    listaTransformersDiv.appendChild(p);
    return;
  }

  transformersSalvos.forEach((t) => {
    const item = document.createElement("div");
    item.className = "transformer-item";
    if (t.id === transformerAtivoId) item.classList.add("active");

    const meta = document.createElement("div");
    meta.className = "transformer-meta";
    const n = document.createElement("span");
    n.className = "transformer-name";
    n.textContent = t.nome || "Sem nome";
    const sub = document.createElement("span");
    sub.className = "transformer-sub";
    sub.textContent = `Voz: ${t.voz} · ${t.perfil.slice(0, 30)}...`;

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
  setStatus("Transformer carregado.");
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
      if (!nome || !perfil) { alert("Nome e Perfil são obrigatórios."); return; }

      perfilAtual = perfil;
      vozAtual = vozSelect.value;

      const novoLocal = { id: Date.now(), nome, perfil, voz: vozAtual };
      transformersSalvos.push(novoLocal);
      salvarListaTransformers();
      transformerAtivoId = novoLocal.id;
      if(holoNome) holoNome.textContent = nome;

      try {
        await fetch("/api/transformers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome, profile: perfil }),
        });
      } catch (err) { console.error(err); }

      setStatus("Salvo e ativado.");
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
      setStatus("Perfil limpo.");
    });
}

if(limparListaBtn) {
    limparListaBtn.addEventListener("click", () => {
      if (!transformersSalvos.length) return;
      if (!confirm("Apagar tudo?")) return;
      transformersSalvos = [];
      transformerAtivoId = null;
      salvarListaTransformers();
      renderizarListaTransformers();
    });
}

// ===== CHAT COM BACKEND =====
async function enviarMensagem() {
  const texto = entradaTexto.value.trim();
  if (!texto) return;

  if (!perfilAtual) {
    alert("Defina o perfil primeiro.");
    return;
  }

  // Interrompe qualquer áudio anterior antes de enviar
  pararAudioIA();

  if (licenseKeyInput && !licenseKeyInput.value.trim()) {
      alert("⚠️ Insira sua Chave de Licença.");
      return;
  }

  if (isProcessingMessage) return;
  isProcessingMessage = true;

  adicionarMensagem("user", texto);
  entradaTexto.value = "";
  setStatus("Gerando resposta...");
  
  const usarRag = checkRag ? checkRag.checked : false;
  setHoloStatus(usarRag ? "Consultando..." : "Pensando...");
  if(enviarBtn) enviarBtn.disabled = true;

  mensagens.push({ role: "user", content: texto });

  // Pega o NOME do agente para enviar
  const nomeAgente = nomeInput.value.trim() || "Assistente";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders() 
      },
      body: JSON.stringify({
        profile: perfilAtual,
        messages: mensagens,
        useRag: usarRag,
        name: nomeAgente // <<< ENVIA O NOME AQUI
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
        if (resp.status === 403) throw new Error("LICENÇA BLOQUEADA.");
        if (resp.status === 401) throw new Error("CHAVE OPENAI INVÁLIDA.");
        throw new Error(data.error || "Erro servidor");
    }

    const resposta = data.reply || "Erro ao gerar.";

    mensagens.push({ role: "assistant", content: resposta });
    ultimaRespostaIA = resposta;
    adicionarMensagem("ia", resposta);

    if (conversationActive) {
      setStatus("Falando...");
      await lerRespostaComOpenAI(true);
    } else {
      setStatus("Pronto");
      setHoloStatus("À disposição.");
    }
  } catch (err) {
    console.error(err);
    setStatus("Erro: " + err.message);
    setHoloStatus("Erro");
    adicionarMensagem("ia", "⛔ " + err.message);
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
    setStatus("Ouvindo...");
    if(iniciarConversaBtn) {
        iniciarConversaBtn.disabled = true;
        iniciarConversaBtn.textContent = "👂 Ouvindo...";
    }
    if(pararConversaBtn) pararConversaBtn.disabled = false;
  };

  recognition.onend = () => {
    isListening = false;
    if (!conversationActive && !isSpeaking) {
      setStatus("Pronto");
      setHoloStatus("Ocioso");
      resetarBotoesConversa();
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" && conversationActive) {
      setStatus("...");
      setTimeout(() => { if (conversationActive && !isListening && !isSpeaking) try { recognition.start(); } catch (e) {} }, 1000);
      return;
    }
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
    
    // Se o usuário falou algo, interrompe a fala da IA imediatamente
    if (textoAtual.length > 0 && isSpeaking) {
        pararAudioIA();
    }
    
    clearTimeout(timeoutSilencio);
    if (conversationActive && textoAtual.trim()) {
      timeoutSilencio = setTimeout(() => {
        try { recognition.stop(); } catch (e) {}
        setTimeout(() => { if (entradaTexto.value.trim()) enviarMensagem(); }, 200);
      }, 2500);
    }
  };
} else {
  if (iniciarConversaBtn) {
    iniciarConversaBtn.disabled = true;
    iniciarConversaBtn.textContent = "🎤 Não suportado";
  }
}

if (iniciarConversaBtn) {
  iniciarConversaBtn.addEventListener("click", () => {
    if (!recognition) return;
    
    // Interrompe áudio anterior se houver
    pararAudioIA();

    if (licenseKeyInput && !licenseKeyInput.value.trim()) {
        alert("Insira a Licença.");
        return;
    }
    conversationActive = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    setHoloStatus("Modo conversa ativo");
    try { recognition.start(); } catch (e) { conversationActive = false; }
  });
}

if (pararConversaBtn) {
  pararConversaBtn.addEventListener("click", () => {
    // 1. Para o Reconhecimento de Voz
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
    conversationActive = false;
    clearTimeout(timeoutSilencio);
    
    // 2. CORREÇÃO IMPORTANTE: Para o Áudio da IA imediatamente!
    pararAudioIA();

    setStatus("Parado.");
    setHoloStatus("Ocioso");
    resetarBotoesConversa();
  });
}

// ===== TTS COM OPENAI =====
async function lerRespostaComOpenAI(autoLoop = false) {
  if (!ultimaRespostaIA) return;

  try {
    setHoloSpeaking(true);
    isSpeaking = true;
    // Tenta parar reconhecimento para evitar eco
    try { recognition.stop(); } catch(e){}

    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders() 
      },
      body: JSON.stringify({
        text: ultimaRespostaIA,
        voice: vozAtual || "alloy",
      }),
    });

    if (!resp.ok) throw new Error("Erro TTS");

    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    
    // Salva na variável global para poder parar depois
    currentAudio = new Audio(url);

    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      setHoloSpeaking(false);
      isSpeaking = false;

      if (conversationActive && recognition && autoLoop && !isProcessingMessage) {
        setStatus("Ouvindo...");
        setHoloStatus("Modo conversa ativo");
        setTimeout(() => { if (!isListening && conversationActive) try { recognition.start(); } catch (e) {} }, 1000);
      } else {
        setStatus("Pronto");
        setHoloStatus("À disposição.");
        if (!conversationActive) resetarBotoesConversa();
      }
    };
    
    currentAudio.play();
  } catch (err) {
    console.error(err);
    setHoloSpeaking(false);
    isSpeaking = false;
    currentAudio = null;
    setStatus("Erro áudio.");
    if(conversationActive) try { recognition.start(); } catch(e){}
  }
}

if (lerBtn) {
    lerBtn.addEventListener("click", () => {
        pararAudioIA(); // Para anterior antes de começar novo
        lerRespostaComOpenAI(false);
    });
}
if(vozSelect) vozSelect.addEventListener("change", () => vozAtual = vozSelect.value);

carregarTransformersSalvos();  
setHoloStatus("Ocioso");
setStatus("Pronto"); 