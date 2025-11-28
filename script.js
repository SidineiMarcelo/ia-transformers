// ===== RECONHECIMENTO DE VOZ MELHORADO (PERMITE PAUSAS) =====
// Substitua a seção de reconhecimento de voz no seu arquivo JS

let recognition = null;
let conversationActive = false;
let isListening = false;
let isProcessingMessage = false;
let isSpeaking = false;
let reconhecimentoEmCooldown = false;

// NOVO: Controle de transcrição em tempo real
let transcricaoAtual = "";
let timeoutSilencio = null;
let transcricaoFinal = "";

if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "pt-BR";
  
  // ✅ MUDANÇAS PRINCIPAIS:
  recognition.continuous = true;        // ← Permite pausas!
  recognition.interimResults = true;    // ← Mostra texto enquanto fala
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("🎤 Reconhecimento iniciado");
    isListening = true;
    reconhecimentoEmCooldown = false;
    transcricaoAtual = "";
    transcricaoFinal = "";
    setStatus("🎤 Ouvindo... (pode fazer pausas para pensar)");
    
    // Atualizar textarea com feedback visual
    entradaTexto.placeholder = "Ouvindo... fale à vontade e faça pausas se precisar...";
    entradaTexto.style.borderColor = "#4caf50";
  };

  recognition.onend = () => {
    console.log("🎤 Reconhecimento finalizado");
    isListening = false;
    entradaTexto.style.borderColor = "";
    
    if (!conversationActive && !isSpeaking && !isProcessingMessage) {
      setStatus("Pronto (aguardando sua mensagem)");
      setHoloStatus("Ocioso");
      entradaTexto.placeholder = "Digite sua mensagem ou use o modo conversa por voz...";
    }
  };

  recognition.onerror = (event) => {
    console.error("❌ Erro no reconhecimento de voz:", event.error);
    isListening = false;
    reconhecimentoEmCooldown = false;
    entradaTexto.style.borderColor = "";
    
    if (event.error === "no-speech") {
      setStatus("Nenhuma fala detectada. Tente novamente.");
    } else if (event.error === "network") {
      setStatus("Erro de rede no reconhecimento de voz.");
    } else if (event.error !== "aborted") {
      setStatus(`Erro ao reconhecer voz: ${event.error}`);
    }
    
    if (conversationActive && event.error !== "aborted") {
      setTimeout(() => iniciarReconhecimento(), 2000);
    }
  };

  recognition.onresult = (event) => {
    // Processar resultados intermediários E finais
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
        console.log(`✅ Final: "${transcript}"`);
      } else {
        interimTranscript += transcript;
        console.log(`⏳ Interim: "${transcript}"`);
      }
    }

    // Acumular transcrição final
    if (finalTranscript) {
      transcricaoFinal += finalTranscript;
    }

    // Mostrar em tempo real na textarea
    const textoCompleto = (transcricaoFinal + interimTranscript).trim();
    entradaTexto.value = textoCompleto;
    transcricaoAtual = textoCompleto;

    // ✅ NOVO: Timer de silêncio
    // Se o usuário parou de falar por 2 segundos, considera que terminou
    clearTimeout(timeoutSilencio);
    
    if (conversationActive && finalTranscript) {
      timeoutSilencio = setTimeout(() => {
        console.log("⏱️ Silêncio detectado - finalizando captura");
        
        if (transcricaoFinal.trim()) {
          // Parar reconhecimento e enviar
          try {
            recognition.stop();
          } catch (e) {
            console.warn("Erro ao parar reconhecimento:", e);
          }
          
          // Enviar após pequeno delay
          setTimeout(() => {
            if (entradaTexto.value.trim()) {
              enviarMensagem();
            }
          }, 300);
        }
      }, 2000); // ← 2 segundos de silêncio = terminou de falar
    }
  };

  // ADICIONAR: Botão para forçar envio
  // (caso o usuário queira enviar antes dos 2 segundos)
  const finalizarFalaBtn = document.createElement("button");
  finalizarFalaBtn.id = "finalizarFalaBtn";
  finalizarFalaBtn.textContent = "✅ Enviar frase";
  finalizarFalaBtn.style.display = "none";
  finalizarFalaBtn.style.background = "#4caf50";
  finalizarFalaBtn.style.color = "white";
  finalizarFalaBtn.style.padding = "12px 20px";
  finalizarFalaBtn.style.border = "none";
  finalizarFalaBtn.style.borderRadius = "10px";
  finalizarFalaBtn.style.cursor = "pointer";
  finalizarFalaBtn.style.marginLeft = "10px";

  finalizarFalaBtn.addEventListener("click", () => {
    if (isListening) {
      clearTimeout(timeoutSilencio);
      try {
        recognition.stop();
      } catch (e) {}
      
      setTimeout(() => {
        if (entradaTexto.value.trim()) {
          enviarMensagem();
        }
      }, 300);
    }
  });

  // Inserir botão após o botão "Falar"
  falarBtn.parentNode.insertBefore(finalizarFalaBtn, falarBtn.nextSibling);

} else {
  falarBtn.disabled = true;
  falarBtn.textContent = "🎤 Falar (não suportado neste navegador)";
  console.warn("⚠️ Reconhecimento de voz não suportado neste navegador");
}

// ===== FUNÇÃO SEGURA PARA INICIAR RECONHECIMENTO =====
function iniciarReconhecimento() {
  if (!recognition || !conversationActive) {
    return;
  }

  if (isListening || reconhecimentoEmCooldown) {
    console.log("⏳ Reconhecimento já ativo ou em cooldown");
    return;
  }

  reconhecimentoEmCooldown = true;
  transcricaoFinal = "";
  transcricaoAtual = "";
  entradaTexto.value = "";

  try {
    recognition.start();
    console.log("✅ Reconhecimento iniciado com sucesso");
    
    // Mostrar botão de finalizar
    const finalizarBtn = document.getElementById("finalizarFalaBtn");
    if (finalizarBtn) {
      finalizarBtn.style.display = "inline-block";
    }
  } catch (e) {
    console.warn("⚠️ Erro ao iniciar reconhecimento:", e.message);
    reconhecimentoEmCooldown = false;
    
    if (e.message.includes("already")) {
      setTimeout(() => iniciarReconhecimento(), 1000);
    }
  }
}

// ===== BOTÃO MODO CONVERSA =====
falarBtn.textContent = "🎤 Falar (modo conversa)";

falarBtn.addEventListener("click", () => {
  if (!recognition) return;

  const finalizarBtn = document.getElementById("finalizarFalaBtn");

  if (!conversationActive) {
    // Ativar modo conversa
    conversationActive = true;
    falarBtn.textContent = "🛑 Parar conversa";
    setStatus("Modo conversa: ouvindo você...");
    setHoloStatus("Modo conversa ativo");
    iniciarReconhecimento();
  } else {
    // Desativar modo conversa
    conversationActive = false;
    falarBtn.textContent = "🎤 Falar (modo conversa)";
    setStatus("Modo conversa interrompido.");
    setHoloStatus("Ocioso");
    
    if (finalizarBtn) {
      finalizarBtn.style.display = "none";
    }
    
    clearTimeout(timeoutSilencio);
    
    try {
      recognition.stop();
    } catch (e) {
      console.warn("Erro ao parar reconhecimento:", e);  
    }
  }
});

// ===== CONFIGURAÇÕES AJUSTÁVEIS =====
const CONFIG_VOZ = {
  tempoSilencio: 2000,        // Tempo de silêncio para considerar que terminou (ms)
  mostrarInterim: true,        // Mostrar texto enquanto está falando
  autoEnviar: true,            // Enviar automaticamente após silêncio
  feedbackVisual: true         // Feedback visual na textarea
};

// Você pode ajustar essas configurações:
// CONFIG_VOZ.tempoSilencio = 3000;  // 3 segundos para usuários que pensam mais devagar
// CONFIG_VOZ.tempoSilencio = 1500;  // 1.5 segundos para conversas rápidas  