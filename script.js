/**
 * SISTEMA GEMINI ENTERPRISE (V3.0)
 * Suporte a Vídeo, Imagem, Voz e Quiz.
 */

class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.audioPlayer = null;
        this.isSpeaking = false;
        this.conversationActive = false;
        
        // Armazena dados da mídia atual (Imagem ou Vídeo)
        this.currentMedia = {
            data: null, // Base64
            mimeType: null,
            type: null // 'image' ou 'video'
        };
        
        this.ui = {
            holoHead: document.getElementById("holo-head"),
            statusText: document.getElementById("holo-status-text"),
            mensagens: document.getElementById("mensagens"),
            input: document.getElementById("entradaTexto"),
            btnStart: document.getElementById("iniciarConversaBtn"),
            btnStop: document.getElementById("pararConversaBtn"),
            btnSend: document.getElementById("enviarBtn"),
            keys: {
                license: document.getElementById("licenseKeyInput"),
                google: document.getElementById("userApiKey")
            },
            ragCheck: document.getElementById("checkRag"),
            imgInput: document.getElementById("chatImageInput"),
            videoInput: document.getElementById("chatVideoInput"), // NOVO
            btnQuiz: document.getElementById("btnQuiz"), // NOVO
            mediaPreview: document.getElementById("mediaPreview"),
            mediaName: document.getElementById("mediaName")
        };

        this.init();
    }

    init() {
        this.setupRecognition();
        this.loadSettings();
        this.bindEvents();
        console.log("✅ Sistema Gemini Enterprise Iniciado");
    }

    // --- 1. CONFIGURAÇÃO DE VOZ ---
    setupRecognition() {
        if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SR();
            this.recognition.lang = "pt-BR";
            this.recognition.continuous = true; 
            this.recognition.interimResults = true;

            this.recognition.onstart = () => this.updateStatus("Ouvindo...", "listening");
            this.recognition.onend = () => {
                if (this.conversationActive && !this.isSpeaking) try { this.recognition.start(); } catch(e){}
                else if (!this.conversationActive) this.updateStatus("Ocioso", "idle");
            };
            this.recognition.onresult = (e) => this.handleVoiceInput(e);
        } else {
            this.ui.btnStart.textContent = "❌ Sem Mic";
            this.ui.btnStart.disabled = true;
        }
    }

    // --- 2. EVENTOS ---
    bindEvents() {
        this.ui.btnSend.addEventListener("click", () => this.sendMessage());
        this.ui.input.addEventListener("keydown", (e) => { if(e.key==="Enter" && !e.shiftKey) {e.preventDefault(); this.sendMessage();} });
        this.ui.btnStart.addEventListener("click", () => this.startConversation());
        this.ui.btnStop.addEventListener("click", () => this.stopConversation());
        
        // Upload de Imagem
        this.ui.imgInput.addEventListener("change", (e) => this.handleFileSelect(e, 'image'));
        
        // Upload de Vídeo (NOVO)
        this.ui.videoInput.addEventListener("change", (e) => this.handleFileSelect(e, 'video'));

        // Botão Quiz (NOVO)
        this.ui.btnQuiz.addEventListener("click", () => this.triggerQuiz());

        // RAG Upload
        document.getElementById("btnUpload")?.addEventListener("click", () => this.handleDocUpload());

        // Configs
        this.ui.keys.license.addEventListener("input", (e) => localStorage.setItem("ia_license_key", e.target.value));
        this.ui.keys.google.addEventListener("input", (e) => localStorage.setItem("ia_google_key", e.target.value));
        
        // Botão Ouvir
        document.getElementById("lerBtn")?.addEventListener("click", () => {
            if(window.ultimaRespostaIA) this.speak(window.ultimaRespostaIA);
        });
        
        // Helper Global para limpar mídia (chamado pelo botão X no HTML)
        window.limparMedia = () => {
            this.currentMedia = { data: null, mimeType: null, type: null };
            this.ui.mediaPreview.style.display = "none";
            this.ui.imgInput.value = "";
            this.ui.videoInput.value = "";
        };
    }

    // --- 3. MANIPULAÇÃO DE MÍDIA (FOTO/VÍDEO) ---
    handleFileSelect(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        // Validação de Tamanho (Vercel tem limite estrito de 4.5MB no Payload)
        // Se precisar de vídeos maiores, teria que usar upload direto pro Supabase Storage, 
        // mas para esta versão "Serverless", limitamos a 4MB.
        if (file.size > 4 * 1024 * 1024) {
            alert("⚠️ Arquivo muito grande! Para esta versão, use vídeos/imagens até 4MB.");
            event.target.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            this.currentMedia = {
                data: reader.result,
                mimeType: file.type,
                type: type
            };
            this.ui.mediaPreview.style.display = "block";
            this.ui.mediaName.textContent = `${type === 'video' ? '🎥' : '📷'} ${file.name} anexado`;
        };
        reader.readAsDataURL(file);
    }

    // --- 4. FUNÇÕES DO CÉREBRO ---
    
    // Função Específica para gerar Quiz
    triggerQuiz() {
        if (!this.validateLicense()) return;
        
        this.stopAudio();
        
        // Prompt automático para gerar prova
        const promptQuiz = "Crie uma prova técnica com 3 perguntas de múltipla escolha baseadas no conhecimento que você tem agora (PDFs carregados ou contexto da conversa). No final, mostre o gabarito.";
        
        this.addMessage("user", "📝 <strong>Solicitação de Prova:</strong><br>" + promptQuiz);
        this.ui.input.value = "";
        this.updateStatus("Gerando Prova...", "thinking");
        
        this.sendPayload(promptQuiz);
    }

    async sendMessage() {
        const text = this.ui.input.value.trim();
        // Permite enviar só imagem/vídeo se tiver legenda ou não
        if (!text && !this.currentMedia.data) return;
        if (!this.validateLicense()) return;

        this.stopAudio();
        
        // Mostra mensagem do usuário (com preview)
        let userDisplay = text;
        if (this.currentMedia.data) {
            if (this.currentMedia.type === 'image') {
                userDisplay += `<br><img src="${this.currentMedia.data}" style="max-width:150px; border-radius:8px; margin-top:5px;">`;
            } else {
                userDisplay += `<br>🎥 [Vídeo Enviado para Análise]`;
            }
        }
        this.addMessage("user", userDisplay);
        
        this.ui.input.value = "";
        this.updateStatus("Gemini Analisando...", "thinking");

        this.sendPayload(text);
    }

    // Função central de envio
    async sendPayload(text) {
        const messages = this.getHistory();
        const profile = document.getElementById("perfil").value;
        const name = document.getElementById("transformerNome").value;
        const useRag = this.ui.ragCheck?.checked || false;

        try {
            const resp = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
                body: JSON.stringify({
                    messages, profile, useRag, name,
                    mediaData: this.currentMedia.data, // Envia a mídia (base64)
                    mediaType: this.currentMedia.mimeType
                }),
            });

            // Limpa a mídia após o envio para não enviar de novo na próxima
            window.limparMedia();

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);

            const reply = data.reply;
            this.addMessage("ia", reply);
            window.ultimaRespostaIA = reply;

            if (this.conversationActive) this.speak(reply);
            else this.updateStatus("Pronto", "idle");

        } catch (err) {
            console.error(err);
            this.addMessage("ia", `⛔ ${err.message}`);
            this.updateStatus("Erro", "idle");
        }
    }

    // --- 5. VOZ E ÁUDIO ---
    async speak(text) {
        if (!text) return;
        this.isSpeaking = true;
        this.updateStatus("Falando...", "speaking");
        try { this.recognition.stop(); } catch(e) {}

        const voice = document.getElementById("vozSelect").value || "alloy";

        try {
            const resp = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
                body: JSON.stringify({ text, voice })
            });

            if (!resp.ok) throw new Error("Erro TTS");
            
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            
            this.audioPlayer = new Audio(url);
            this.audioPlayer.onended = () => {
                this.isSpeaking = false;
                this.updateStatus("Ouvindo...", "listening");
                if (this.conversationActive) try { this.recognition.start(); } catch(e){}
            };
            await this.audioPlayer.play();
        } catch (e) {
            this.isSpeaking = false;
            this.updateStatus("Erro Voz", "idle");
        }
    }

    stopAudio() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.audioPlayer = null;
        }
        this.isSpeaking = false;
        this.ui.holoHead.classList.remove("speaking");
    }

    // --- 6. RAG E UTILITÁRIOS ---
    async handleDocUpload() {
        const file = document.getElementById("arquivoInput").files[0];
        if (!file) return alert("Selecione um PDF/DOCX.");
        if (!this.validateLicense()) return;

        const btn = document.getElementById("btnUpload");
        const status = document.getElementById("uploadStatus");
        
        btn.textContent = "Processando...";
        btn.disabled = true;
        status.textContent = "Lendo...";
        status.className = "upload-status loading";

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

            status.textContent = "✅ Memória Criada!";
            status.className = "upload-status success";
            if(this.ui.ragCheck) this.ui.ragCheck.checked = true;
        } catch (e) {
            status.textContent = "❌ " + e.message;
            status.className = "upload-status error";
        } finally {
            btn.textContent = "Processar Conhecimento";
            btn.disabled = false;
        }
    }

    // ... Helpers de UI, Histórico e Configurações ...
    loadSettings() {
        this.ui.keys.license.value = localStorage.getItem("ia_license_key") || "";
        this.ui.keys.google.value = localStorage.getItem("ia_google_key") || "";
        this.loadTransformers();
    }

    getAuthHeaders() {
        return {
            "x-license-key": this.ui.keys.license.value.trim(),
            "x-google-key": this.ui.keys.google.value.trim()
        };
    }

    validateLicense() {
        if (!this.ui.keys.license.value.trim()) {
            alert("Insira a Licença.");
            return false;
        }
        return true;
    }

    updateStatus(text, state) {
        this.ui.statusText.textContent = text;
        state === "speaking" ? this.ui.holoHead.classList.add("speaking") : this.ui.holoHead.classList.remove("speaking");
    }

    updateUIState() {
        this.ui.btnStart.disabled = this.conversationActive;
        this.ui.btnStop.disabled = !this.conversationActive;
    }

    addMessage(role, text) {
        const div = document.createElement("div");
        div.classList.add("msg", role === "user" ? "usuario" : "ia");
        div.innerHTML = `<strong>${role === "user" ? "Você" : "IA"}</strong> ${text}`;
        this.ui.mensagens.appendChild(div);
        this.ui.mensagens.scrollTop = this.ui.mensagens.scrollHeight;
    }

    getHistory() {
        // Ignora imagens no histórico de texto puro para economizar tokens
        return Array.from(this.ui.mensagens.children).map(div => ({
            role: div.classList.contains("usuario") ? "user" : "model",
            content: div.innerText.replace(/^(Você|IA)\s/, "")
        })).slice(-10);
    }

    handleVoiceInput(event) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (this.isSpeaking && finalTranscript.length > 0) this.stopAudio();
        if (finalTranscript) this.ui.input.value = finalTranscript;
        clearTimeout(this.silenceTimer);
        if (finalTranscript.trim().length > 0 && this.conversationActive) {
            this.silenceTimer = setTimeout(() => this.sendMessage(), 2500);
        }
    }

    loadTransformers() {
        try {
            const raw = localStorage.getItem("ia_transformers_lista");
            window.transformersSalvos = raw ? JSON.parse(raw) : [];
            this.renderTransformers();
        } catch { window.transformersSalvos = []; }
    }

    saveProfile() { /* Lógica de salvar mantida */ } // (Pode manter sua lógica antiga se quiser, ou usar a simplificada abaixo)
    
    // ... Renderização de lista simplificada ...
    renderTransformers() {
        const lista = document.getElementById("listaTransformers");
        if (!lista) return;
        lista.innerHTML = "";
        window.transformersSalvos.forEach(t => {
            const div = document.createElement("div");
            div.className = "transformer-item";
            div.innerHTML = `<span class="transformer-name">${t.nome}</span>`;
            div.onclick = () => {
                document.getElementById("transformerNome").value = t.nome;
                document.getElementById("perfil").value = t.perfil;
                document.getElementById("vozSelect").value = t.voz || "alloy";
                this.updateStatus("Agente Carregado", "idle");
            };
            lista.appendChild(div);
        });
    }
}

// Inicializa
window.addEventListener('DOMContentLoaded', () => { window.assistant = new VoiceAssistant(); });
// Helpers globais
window.transformersSalvos = [];   