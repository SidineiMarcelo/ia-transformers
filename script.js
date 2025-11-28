// =========================
// CONFIGURAÇÃO INICIAL
// =========================

let conversationActive = false;
let isListening = false;
let recognition = null;
let currentAudio = null;

// Elementos da interface
const falarBtn = document.getElementById("falarBtn");
const lerBtn = document.getElementById("lerBtn");
const statusEl = document.getElementById("status");
const holoStatusEl = document.getElementById("holoStatus");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setHoloStatus(msg) {
  holoStatusEl.textContent = msg;
}

// =========================
// INICIALIZAR RECONHECIMENTO DE VOZ
// =========================

function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Reconhecimento de voz não suportado no seu navegador.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
  };

  recognition.onend = () => {
    isListening = false;

    if (conversationActive) {
      // Tenta ouvir novamente automaticamente
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {}
      }, 400);
    }
  };

  recognition.onerror = (event) => {
    console.warn("Erro no reconhecimento:", event.error);

    const errosLeves = ["no-speech", "non-speech", "aborted", "network"];

    if (conversationActive) {
      setStatus("Não entendi, pode repetir?");
      setHoloStatus("Modo conversa ativo");

      // Reinicia após erro leve
      if (errosLeves.includes(event.error)) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {}
        }, 400);
      }
    }
  };

  recognition.onresult = async (event) => {
    const text = event.results[0][0].transcript;
    setStatus(`Você disse: ${text}`);
    await lerRespostaComOpenAI(text, true);
  };
}

initRecognition();

// =========================
// CONSULTAR OPENAI
// =========================

async function lerRespostaComOpenAI(texto, autoLoop = false) {
  try {
    const resposta = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
    });

    const data = await resposta.json();
    const audioBase64 = data.audio;
    const replyText = data.reply;

    setStatus(replyText);

    await tocarAudio(audioBase64);

    if (conversationActive && autoLoop) {
      setStatus("Modo conversa: ouvindo você…");

      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {}
      }, 600);
    }
  } catch (e) {
    console.error("Erro ao falar:", e);
    setStatus("Erro ao gerar áudio.");
  }
}

// =========================
// TOCAR ÁUDIO BASE64
// =========================

async function tocarAudio(base64) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const audio = new Audio("data:audio/mp3;base64," + base64);
  currentAudio = audio;

  return new Promise((resolve) => {
    audio.onended = resolve;
    audio.play();
  });
}

// =========================
// BOTÃO: FALAR MODO CONVERSA
// =========================

falarBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (!conversationActive) {
    // LIGAR CONVERSA
    conversationActive = true;
    falarBtn.textContent = "🛑 Parar conversa";
    lerBtn.disabled = true;

    setStatus("Modo conversa ativado. Ouvindo você…");
    setHoloStatus("Modo conversa ativo");

    try {
      recognition.start();
    } catch (e) {}
  } else {
    // DESLIGAR CONVERSA
    conversationActive = false;
    falarBtn.textContent = "🎤 Falar (modo conversa)";
    lerBtn.disabled = false;

    setStatus("Modo conversa encerrado.");
    setHoloStatus("Ocioso");

    try {
      recognition.stop();
    } catch (e) {}
  }
});

// =========================
// BOTÃO: OUVIR RESPOSTA (MANUAL)
// =========================

lerBtn.addEventListener("click", async () => {
  const texto = document.getElementById("mensagem").value.trim();
  if (!texto) {
    setStatus("Digite uma mensagem.");
    return;
  }

  await lerRespostaComOpenAI(texto, false);  
});
