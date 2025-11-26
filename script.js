// Estado básico da conversa
let mensagens = [];
let perfilAtual = "";
let ultimaRespostaIA = "";

// Elementos da interface
const perfilTextarea = document.getElementById("perfil");
const aplicarPerfilBtn = document.getElementById("aplicarPerfilBtn");
const mensagensDiv = document.getElementById("mensagens");
const statusDiv = document.getElementById("status");
const entradaTexto = document.getElementById("entradaTexto");
const enviarBtn = document.getElementById("enviarBtn");
const falarBtn = document.getElementById("falarBtn");
const lerBtn = document.getElementById("lerBtn");

// =====================
// 1. PERFIL DO AGENTE
// =====================

aplicarPerfilBtn.addEventListener("click", () => {
  perfilAtual = perfilTextarea.value.trim();
  if (!perfilAtual) {
    alert("Escreva um perfil para o agente primeiro.");
    return;
  }
  mensagens = []; // limpa histórico quando muda perfil
  mensagensDiv.innerHTML = "";
  statusDiv.textContent = "Perfil aplicado. Pode começar a conversar!";
});

// =======================
// 2. EXIBIR MENSAGENS
// =======================

function adicionarMensagem(quem, texto) {
  const div = document.createElement("div");
  div.classList.add("msg", quem === "user" ? "usuario" : "ia");

  const titulo = quem === "user" ? "Você" : "IA";
  div.innerHTML = `<strong>${titulo}</strong>${texto}`;
  mensagensDiv.appendChild(div);
  mensagensDiv.scrollTop = mensagensDiv.scrollHeight;
}

// =======================
// 3. ENVIAR PARA O BACKEND
// =======================

async function enviarMensagem() {
  const texto = entradaTexto.value.trim();
  if (!texto) return;

  if (!perfilAtual) {
    alert("Antes, preencha e aplique um perfil para o agente.");
    return;
  }

  // Atualiza UI
  adicionarMensagem("user", texto);
  entradaTexto.value = "";
  statusDiv.textContent = "Gerando resposta...";
  enviarBtn.disabled = true;

  // Atualiza histórico para enviar ao backend
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
    const resposta = data.reply || "Não consegui gerar uma resposta.";

    mensagens.push({ role: "assistant", content: resposta });
    ultimaRespostaIA = resposta;
    adicionarMensagem("ia", resposta);
    statusDiv.textContent = "Pronto (aguardando sua mensagem)";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Erro ao conversar com a IA.";
    alert("Ocorreu um erro ao chamar a IA. Verifique o console.");
  } finally {
    enviarBtn.disabled = false;
  }
}

enviarBtn.addEventListener("click", enviarMensagem);
entradaTexto.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// =======================
// 4. FALAR (RECONHECER VOZ)
// =======================

let recognition = null;

if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    statusDiv.textContent = "Ouvindo... fale agora.";
    falarBtn.disabled = true;
  };

  recognition.onend = () => {
    statusDiv.textContent = "Pronto (aguardando sua mensagem)";
    falarBtn.disabled = false;
  };

  recognition.onerror = (event) => {
    console.error("Erro no reconhecimento de voz:", event.error);
    statusDiv.textContent = "Erro ao reconhecer voz.";
    falarBtn.disabled = false;
  };

  recognition.onresult = (event) => {
    const texto = event.results[0][0].transcript;
    entradaTexto.value = texto;
  };
} else {
  // Navegador não suporta
  falarBtn.disabled = true;
  falarBtn.textContent = "🎤 Falar (não suportado)";
}

falarBtn.addEventListener("click", () => {
  if (!recognition) return;
  recognition.start();
});

// =======================
// 5. LER RESPOSTA (TTS)
// =======================

function lerTexto(texto) {
  if (!("speechSynthesis" in window)) {
    alert("Seu navegador não suporta síntese de voz (speechSynthesis).");
    return;
  }

  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = "pt-BR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

lerBtn.addEventListener("click", () => {
  if (!ultimaRespostaIA) {
    alert("Ainda não há resposta da IA para ler.");
    return;
  }
  lerTexto(ultimaRespostaIA);  
});
