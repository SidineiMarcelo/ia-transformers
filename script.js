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

// 🔴 NOVA VARIÁVEL: Controla o áudio para podermos PAUSAR a qualquer momento
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

// CAMPOS DE SEGURANÇA
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
    setHoloStatus(conversationActive ? "Ouvindo..." : "Ocioso");
  }
}

// 🔴 FUNÇÃO DE PARADA IMEDIATA (CORREÇÃO DE INTERRUPÇÃO)
function pararAudioIA() {
    if (currentAudio) {
        currentAudio.pause();       // Pausa o som
        currentAudio.currentTime = 0; // Volta pro começo
        currentAudio = null;        // Limpa a variável
    }
    setHoloSpeaking(false);
    isSpeaking = false;
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
      
      // Atualiza o nome visualmente no holograma
      if(nomeAgente) holoNome.textContent = nomeAgente;
      
      mensagens = [];
      if (mensagensDiv) mensagensDiv.innerHTML = "";
      setStatus("Perfil aplicado. Pode começar a conversar!");
    });
}

// ===== MÓDULO RAG (UPLOAD) =====
if (arquivoInput) {
  arquivoInput.addEventListener('change', () => {
    if (arquivoInput.files.length > 0 && fileNameDisplay) {
      fileNameDisplay.textContent = arquivoInput.files[0].name;
    }
  });
}

if (btnUpload) {
  btnUpload.addEventListener("click", async () => {
    const arquivo = arquivoInput.files[0];
    if (!arquivo) { alert("Selecione um arquivo."); return; }
    if (licenseKeyInput && !licenseKeyInput.value.trim()) { alert("Insira a Licença."); return; }

    btnUpload.disabled = true;
    btnUpload.textContent = "Processando...";
    if(uploadStatus) {
        uploadStatus.textContent = "Lendo arquivo...";
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
      if (!resp.ok) throw new Error(data.error || "Erro upload");

      if(uploadStatus) {
          uploadStatus.textContent = "✅ Sucesso!";
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
  } catch { transformersSalvos = []; }
  renderizarListaTransformers();
}

function salvarListaTransformers() {
  localStorage.setItem("ia_transformers_lista", JSON.stringify(transformersSalvos));
}

function renderizarListaTransformers() {
  if (!listaTransformersDiv) return;
  listaTransformersDiv.innerHTML = "";
  if (!transformersSalvos.length) {
    listaTransformersDiv.innerHTML = "<p class='lista-vazia'>Nenhum salvo.</p>";
    return;
  }
  transformersSalvos.forEach((t) => {
    const item = document.createElement("div");
    item.className = "transformer-item";
    if (t.id === transformerAtivoId) item.classList.add("active");
    
    const meta = document.createElement("div");
    meta.className = "transformer-meta";
    meta.innerHTML = `<span class="transformer-name">${t.nome}</span><span class="transformer-sub">${t.voz}</span>`;
    
    const actions = document.createElement("div");
    actions.className = "transformer-actions";
    
    const carregarBtn = document.createElement("button");
    carregarBtn.textContent = "Ativar";
    carregarBtn.onclick = (e) => { e.stopPropagation(); ativarTransformer(t.id); };
    
    const apagarBtn = document.createElement("button");
    apagarBtn.textContent = "X";
    apagarBtn.onclick = (e) => { e.stopPropagation(); removerTransformer(t.id); };
    
    actions.append(carregarBtn, apagarBtn);
    item.append(meta, actions);
    item.onclick = () => ativarTransformer(t.id);
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
  setStatus("Carregado.");
  renderizarListaTransformers();
}

function removerTransformer(id) {
  transformersSalvos = transformersSalvos.filter((x) => x.id !== id);
  if (transformerAtivoId === id) transformerAtivoId = null;
  salvarListaTransformers();
  renderizarListaTransformers();
}

if(salvarTransformerBtn) {
    salvarTransformerBtn.addEventListener("click", () => {
      const nome = nomeInput.value.trim();
      const perfil = perfilTextarea.value.trim();
      if (!nome || !perfil) { alert("Preencha Nome e Perfil."); return; }
      perfilAtual = perfil;
      vozAtual = vozSelect.value;
      const novo = { id: Date.now(), nome, perfil, voz: vozAtual };
      transformersSalvos.push(novo);
      salvarListaTransformers();
      transformerAtivoId = novo.id;
      if(holoNome) holoNome.textContent = nome;
      setStatus("Salvo.");
      renderizarListaTransformers();
    });
}

if(limparTransformerBtn) {
    limparTransformerBtn.addEventListener("click", () => {
      perfilTextarea.value = ""; perfilAtual = ""; nomeInput.value = ""; transformerAtivoId = null;
      holoNome.textContent = "Transformer ativo";
      mensagens = []; mensagensDiv.innerHTML = "";
      setStatus("Limpo.");
    });
}

if(limparListaBtn) {
    limparListaBtn.addEventListener("click", () => {
      if(confirm("Apagar tudo?")) { transformersSalvos = []; transformerAtivoId = null; salvarListaTransformers(); renderizarListaTransformers(); }
    });
}

// ===== CHAT COM BACKEND =====
async function enviarMensagem() {
  const texto = entradaTexto.value.trim();
  if (!texto) return;
  if (!perfilAtual) { alert("Defina o perfil."); return; }
  
  // 🔴 CORREÇÃO 2: Interrompe qualquer fala anterior ao enviar nova mensagem
  pararAudioIA();

  if (licenseKeyInput && !licenseKeyInput.value.trim()) { alert("Insira a Licença."); return; }
  if (isProcessingMessage) return;
  isProcessingMessage = true;

  adicionarMensagem("user", texto);
  entradaTexto.value = "";
  setStatus("Pensando...");
  const usarRag = checkRag ? checkRag.checked : false;
  setHoloStatus(usarRag ? "Consultando..." : "Pensando...");
  if(enviarBtn) enviarBtn.disabled = true;

  mensagens.push({ role: "user", content: texto });

  // 🔴 CORREÇÃO 3: Pega o NOME do input e envia para o backend
  const nomeAgente = nomeInput.value.trim() || "Assistente";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        profile: perfilAtual,
        messages: mensagens,
        useRag: usarRag,
        name: nomeAgente // <<< Envia o nome aqui!
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro servidor");

    const resposta = data.reply || "Sem resposta.";
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
    adicionarMensagem("ia", "⛔ " + err.message);
  } finally {
    if(enviarBtn) enviarBtn.disabled = false;
    isProcessingMessage = false;
  }
}

if(enviarBtn) enviarBtn.addEventListener("click", enviarMensagem);
if(entradaTexto) entradaTexto.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } });

// ===== VOZ E INTERRUPÇÃO =====
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
    if(iniciarConversaBtn) { iniciarConversaBtn.disabled = true; iniciarConversaBtn.textContent = "👂 Ouvindo..."; }
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

  recognition.onresult = (event) => {
    let textoAtual = "";
    for (let i = 0; i < event.results.length; i++) { textoAtual += event.results[i][0].transcript + " "; }
    textoAtual = textoAtual.trim();
    transcricaoCompleta = textoAtual;
    if(entradaTexto) entradaTexto.value = textoAtual;
    
    // 🔴 CORREÇÃO 2: Se o usuário falou algo, CALA A BOCA DA IA
    if (textoAtual.length > 0 && isSpeaking) {
        pararAudioIA();
        console.log("Interrompendo IA porque usuário falou.");
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
    // Garante que a IA pare de falar ao ativar o microfone
    pararAudioIA();
    
    if (licenseKeyInput && !licenseKeyInput.value.trim()) { alert("Insira Licença."); return; }
    conversationActive = true;
    transcricaoCompleta = "";
    clearTimeout(timeoutSilencio);
    setHoloStatus("Modo conversa ativo");
    try { recognition.start(); } catch (e) { conversationActive = false; }
  });
}

if (pararConversaBtn) {
  pararConversaBtn.addEventListener("click", () => {
    // 🔴 CORREÇÃO 1: Botão PARAR agora mata o áudio e o microfone
    if (recognition) try { recognition.stop(); } catch (e) {}
    
    conversationActive = false;
    clearTimeout(timeoutSilencio);
    
    pararAudioIA(); // <--- AQUI É O SEGREDO DO BOTÃO PARAR

    setStatus("Parado.");
    setHoloStatus("Ocioso");
    resetarBotoesConversa();
  });
}

async function lerRespostaComOpenAI(autoLoop = false) {
  if (!ultimaRespostaIA) return;

  try {
    setHoloSpeaking(true);
    isSpeaking = true;
    try { recognition.stop(); } catch(e){}

    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ text: ultimaRespostaIA, voice: vozAtual || "alloy" }),
    });

    if (!resp.ok) throw new Error("Erro TTS");

    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    
    // 🔴 Salva o áudio na variável global para poder ser cancelado
    currentAudio = new Audio(url);

    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      setHoloSpeaking(false);
      isSpeaking = false;

      if (conversationActive && recognition && autoLoop && !isProcessingMessage) {
        setStatus("Ouvindo...");
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

if (lerBtn) lerBtn.addEventListener("click", () => { pararAudioIA(); lerRespostaComOpenAI(false); });
if(vozSelect) vozSelect.addEventListener("change", () => vozAtual = vozSelect.value);

carregarTransformersSalvos();  
setHoloStatus("Ocioso");
setStatus("Pronto");  