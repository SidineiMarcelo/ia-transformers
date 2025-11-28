/**
 * ARQUITETURA DE ASSISTENTE DE VOZ AVANÇADA (v2.0)
 * Gerenciamento de estado robusto para evitar travamentos de áudio.
 */

class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.audioPlayer = null; // Controle total do áudio aqui
        this.isSpeaking = false;
        this.conversationActive = false;
        this.silenceTimer = null;
        
        // Elementos da Interface
        this.ui = {
            holoHead: document.getElementById("holo-head"),
            statusText: document.getElementById("holo-status-text"),
            mensagens: document.getElementById("mensagens"),
            input: document.getElementById("entradaTexto"),
            btnStart: document.getElementById("iniciarConversaBtn"),
            btnStop: document.getElementById("pararConversaBtn"),
            btnSend: document.getElementById("enviarBtn"),
            btnUpload: document.getElementById("btnUpload"),
            statusUpload: document.getElementById("uploadStatus"),
            ragCheck: document.getElementById("checkRag"),
            keys: {
                license: document.getElementById("licenseKeyInput"),
                openai: document.getElementById("userApiKey")
            }
        };

        this.init();
    }

    init() {
        this.setupRecognition();
        this.loadSettings();
        this.bindEvents();
        console.log("✅ VoiceAssistant Iniciado - Modo High-End");
    }

    // --- 1. CONFIGURAÇÃO DE ESCUTA (STT) ---
    setupRecognition() {
        if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SR();
            this.recognition.lang = "pt-BR";
            this.recognition.continuous = true; 
            this.recognition.interimResults = true; // Permite interromper a IA enquanto fala

            this.recognition.onstart = () => {
                this.updateStatus("Ouvindo você...", "listening");
            };

            this.recognition.onend = () => {
                // Se caiu mas a conversa ainda está ativa, religa (exceto se a IA estiver falando)
                if (this.conversationActive && !this.isSpeaking) {
                    try { this.recognition.start(); } catch(e){}
                } else if (!this.conversationActive) {
                    this.updateStatus("Ocioso", "idle");
                }
            };

            this.recognition.onresult = (event) => this.handleVoiceInput(event);
            
            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech') {
                    console.warn("Erro Mic:", event.error);
                    this.conversationActive = false;
                    this.updateUIState();
                }
            };
        } else {
            this.ui.btnStart.textContent = "❌ Mic não suportado";
            this.ui.btnStart.disabled = true;
        }
    }

    // --- 2. CONTROLE DE EVENTOS ---
    bindEvents() {
        // Chat Texto
        this.ui.btnSend.addEventListener("click", () => this.sendMessage());
        this.ui.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
        });

        // Controles de Voz
        this.ui.btnStart.addEventListener("click", () => this.startConversation());
        this.ui.btnStop.addEventListener("click", () => this.stopConversation());

        // Upload RAG
        this.ui.btnUpload?.addEventListener("click", () => this.handleUpload());
        
        // Salvar Chaves ao digitar
        this.ui.keys.license.addEventListener("input", (e) => localStorage.setItem("ia_license_key", e.target.value));
        this.ui.keys.openai.addEventListener("input", (e) => localStorage.setItem("ia_client_api_key", e.target.value));
        
        // Botão Ouvir Manualmente
        document.getElementById("lerBtn")?.addEventListener("click", () => this.playLastResponse());
        
        // Botões de Perfil (Compatibilidade)
        document.getElementById("salvarTransformerBtn")?.addEventListener("click", () => this.saveProfile());
        document.getElementById("aplicarPerfilBtn")?.addEventListener("click", () => this.applyProfile());
        
        // Input de Arquivo (Visual)
        const fileInput = document.getElementById("arquivoInput");
        if(fileInput) {
            fileInput.addEventListener('change', () => {
                const display = document.getElementById("fileNameDisplay");
                if(display) display.textContent = fileInput.files[0]?.name || "Nenhum arquivo";
            });
        }
    }

    loadSettings() {
        this.ui.keys.license.value = localStorage.getItem("ia_license_key") || "";
        this.ui.keys.openai.value = localStorage.getItem("ia_client_api_key") || "";
        this.loadTransformers();
    }

    // --- 3. LÓGICA DE CONVERSA ---
    startConversation() {
        if (!this.validateLicense()) return;
        
        this.stopAudio(); // Garante silêncio antes de começar
        this.conversationActive = true;
        
        try { this.recognition.start(); } catch(e) {}
        this.updateUIState();
    }

    stopConversation() {
        this.conversationActive = false;
        this.stopAudio(); // CORTE IMEDIATO DO SOM
        try { this.recognition.stop(); } catch(e) {}
        
        this.updateStatus("Conversa Pausada", "idle");
        this.updateUIState();
    }

    // --- 4. PROCESSAMENTO DE VOZ INTELIGENTE ---
    handleVoiceInput(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // === O SEGREDO DA INTERRUPÇÃO ===
        // Se a IA estiver falando e o microfone detectar voz nova, CORTA a IA.
        if (this.isSpeaking && (finalTranscript.length > 0 || interimTranscript.length > 2)) {
            console.log("🗣️ Interrupção detectada! Cortando a IA.");
            this.stopAudio(); 
        }

        if (finalTranscript || interimTranscript) {
            this.ui.input.value = finalTranscript || interimTranscript;
        }

        // Timer de Silêncio para enviar automaticamente
        clearTimeout(this.silenceTimer);
        if (finalTranscript.trim().length > 0 && this.conversationActive) {
            this.silenceTimer = setTimeout(() => {
                this.sendMessage(); // Envia após 2.5s de silêncio
            }, 2500);
        }
    }

    // --- 5. ENVIO AO SERVIDOR (CÉREBRO) ---
    async sendMessage() {
        const text = this.ui.input.value.trim();
        if (!text) return;
        if (!this.validateLicense()) return;

        // Para qualquer áudio anterior
        this.stopAudio();

        this.addMessage("user", text);
        this.ui.input.value = "";
        this.updateStatus("Pensando (GPT-4o)...", "thinking");

        // Prepara dados
        const messages = this.getHistory();
        const profile = document.getElementById("perfil").value;
        const name = document.getElementById("transformerNome").value;
        const useRag = this.ui.ragCheck?.checked || false;

        try {
            const resp = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
                body: JSON.stringify({ messages, profile, useRag, name })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                if (resp.status === 403) throw new Error("LICENÇA BLOQUEADA/INVÁLIDA");
                throw new Error(err.error || `Erro ${resp.status}`);
            }

            const data = await resp.json();
            const reply = data.reply;

            this.addMessage("ia", reply);
            window.ultimaRespostaIA = reply; // Backup global

            if (this.conversationActive) {
                this.speak(reply);
            } else {
                this.updateStatus("Pronto", "idle");
            }

        } catch (err) {
            console.error(err);
            this.addMessage("ia", `⛔ ${err.message}`);
            this.updateStatus("Erro", "idle");
        }
    }

    // --- 6. FALA (TTS HD) ---
    async speak(text) {
        if (!text) return;
        
        // Pausa reconhecimento para não ouvir a si mesma (Eco)
        try { this.recognition.stop(); } catch(e) {}
        
        this.isSpeaking = true;
        this.updateStatus("Falando...", "speaking");

        const voice = document.getElementById("vozSelect").value || "alloy";

        try {
            const resp = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
                body: JSON.stringify({ text, voice })
            });

            if (!resp.ok) throw new Error("Erro na geração de áudio");

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            
            // Cria o player de áudio
            this.audioPlayer = new Audio(url);
            
            this.audioPlayer.onended = () => {
                this.isSpeaking = false;
                this.updateStatus("Ouvindo...", "listening");
                // Religa o microfone automaticamente
                if (this.conversationActive) {
                    try { this.recognition.start(); } catch(e){}
                }
            };

            await this.audioPlayer.play();

        } catch (e) {
            console.error(e);
            this.isSpeaking = false;
            this.updateStatus("Erro de Voz", "idle");
            // Se falhar o áudio, religa o mic se estiver em conversa
            if (this.conversationActive) try { this.recognition.start(); } catch(e){}
        }
    }

    // 🛑 FUNÇÃO CRÍTICA: MATA O SOM
    stopAudio() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.audioPlayer = null;
        }
        this.isSpeaking = false;
        this.ui.holoHead.classList.remove("speaking");
    }

    // --- UPLOAD RAG ---
    async handleUpload() {
        const file = this.ui.arquivoInput.files[0];
        if (!file) return alert("Selecione um arquivo.");
        if (!this.validateLicense()) return;

        this.ui.btnUpload.disabled = true;
        this.ui.btnUpload.textContent = "Processando...";
        this.ui.statusUpload.textContent = "Lendo documento...";
        this.ui.statusUpload.className = "upload-status loading";

        const fd = new FormData();
        fd.append("file", file);

        try {
            const resp = await fetch("/api/upload", {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: fd
            });
            const data = await resp.json();
            
            if (!resp.ok) throw new Error(data.error || "Erro upload");

            this.ui.statusUpload.textContent = "✅ Memória Atualizada!";
            this.ui.statusUpload.className = "upload-status success";
            if(this.ui.ragCheck) this.ui.ragCheck.checked = true;

        } catch (e) {
            this.ui.statusUpload.textContent = "❌ " + e.message;
            this.ui.statusUpload.className = "upload-status error";
        } finally {
            this.ui.btnUpload.disabled = false;
            this.ui.btnUpload.textContent = "Carregar Documento";
        }
    }

    // --- AUXILIARES ---
    getAuthHeaders() {
        return {
            "x-license-key": this.ui.keys.license.value.trim(),
            "x-openai-key": this.ui.keys.openai.value.trim()
        };
    }

    validateLicense() {
        if (!this.ui.keys.license.value.trim()) {
            alert("⚠️ Insira a Chave de Licença nas configurações.");
            return false;
        }
        return true;
    }

    updateStatus(text, state) {
        this.ui.statusText.textContent = text;
        if (state === "speaking") this.ui.holoHead.classList.add("speaking");
        else this.ui.holoHead.classList.remove("speaking");
    }

    updateUIState() {
        if (this.conversationActive) {
            this.ui.btnStart.disabled = true;
            this.ui.btnStop.disabled = false;
            this.ui.btnStart.textContent = "👂 Ouvindo...";
        } else {
            this.ui.btnStart.disabled = false;
            this.ui.btnStop.disabled = true;
            this.ui.btnStart.textContent = "🎤 Iniciar Conversa";
        }
    }

    addMessage(role, text) {
        const div = document.createElement("div");
        div.classList.add("msg", role === "user" ? "usuario" : "ia");
        div.innerHTML = `<strong>${role === "user" ? "Você" : "IA"}</strong> ${text}`;
        this.ui.mensagens.appendChild(div);
        this.ui.mensagens.scrollTop = this.ui.mensagens.scrollHeight;
    }

    getHistory() {
        return Array.from(this.ui.mensagens.children).map(div => ({
            role: div.classList.contains("usuario") ? "user" : "assistant",
            content: div.innerText.replace(/^(Você|IA)\s/, "")
        })).slice(-10);
    }

    // Lógica simplificada de Transformers Salvos
    loadTransformers() {
        try {
            const raw = localStorage.getItem("ia_transformers_lista");
            window.transformersSalvos = raw ? JSON.parse(raw) : [];
            this.renderTransformers();
        } catch { window.transformersSalvos = []; }
    }

    saveProfile() {
        const nome = document.getElementById("transformerNome").value;
        const perfil = document.getElementById("perfil").value;
        const voz = document.getElementById("vozSelect").value;
        if (!nome || !perfil) return alert("Preencha Nome e Perfil");
        
        window.transformersSalvos.push({ id: Date.now(), nome, perfil, voz });
        localStorage.setItem("ia_transformers_lista", JSON.stringify(window.transformersSalvos));
        this.renderTransformers();
        alert("Agente salvo!");
    }

    applyProfile() {
        // Apenas visual, o perfil é lido dinamicamente no envio
        this.updateStatus("Perfil Aplicado!", "idle");
    }

    renderTransformers() {
        const lista = document.getElementById("listaTransformers");
        if (!lista) return;
        lista.innerHTML = "";
        
        window.transformersSalvos.forEach(t => {
            const div = document.createElement("div");
            div.className = "transformer-item";
            div.innerHTML = `<div class="transformer-meta"><span class="transformer-name">${t.nome}</span></div>`;
            div.onclick = () => {
                document.getElementById("transformerNome").value = t.nome;
                document.getElementById("perfil").value = t.perfil;
                document.getElementById("vozSelect").value = t.voz || "alloy";
                this.updateStatus("Agente Carregado", "idle");
            };
            lista.appendChild(div);
        });
    }
    
    playLastResponse() {
        if (window.ultimaRespostaIA) this.speak(window.ultimaRespostaIA);
    }
}

// Inicializa a classe quando a página carrega
window.addEventListener('DOMContentLoaded', () => {
    window.assistant = new VoiceAssistant();
});  