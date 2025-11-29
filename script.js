/**
 * IA TRANSFORMERS – SCRIPT PRINCIPAL (V4.0)
 * Suporte: Texto, Voz Gemini TTS, Imagem, Vídeo, Quiz, RAG e Agentes.
 */

class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.audioPlayer = null;
        this.isSpeaking = false;
        this.conversationActive = false;
        this.silenceTimer = null;

        this.currentMedia = {
            data: null,
            mimeType: null,
            type: null
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
            videoInput: document.getElementById("chatVideoInput"),
            btnQuiz: document.getElementById("btnQuiz"),
            mediaPreview: document.getElementById("mediaPreview"),
            mediaName: document.getElementById("mediaName")
        };

        this.init();
    }

    // -------------------------------------------------------
    // INICIALIZAÇÃO
    // -------------------------------------------------------
    init() {
        this.setupRecognition();
        this.loadSettings();
        this.bindEvents();
        console.log("🚀 IA Transformers iniciado.");
    }

    // -------------------------------------------------------
    // RECONHECIMENTO DE VOZ
    // -------------------------------------------------------
    setupRecognition() {
        if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SR();
            this.recognition.lang = "pt-BR";
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onstart = () => this.updateStatus("Ouvindo...", "listening");

            this.recognition.onend = () => {
                if (this.conversationActive && !this.isSpeaking) {
                    try { this.recognition.start(); } catch (e) {}
                } else {
                    this.updateStatus("Aguardando...", "idle");
                }
            };

            this.recognition.onresult = (evt) => this.handleVoiceInput(evt);

        } else {
            this.ui.btnStart.disabled = true;
            this.ui.btnStart.textContent = "❌ Sem Microfone";
        }
    }

    // -------------------------------------------------------
    // EVENTOS
    // -------------------------------------------------------
    bindEvents() {
        this.ui.btnSend.addEventListener("click", () => this.sendMessage());

        this.ui.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.ui.btnStart.addEventListener("click", () => this.startConversation());
        this.ui.btnStop.addEventListener("click", () => this.stopConversation());

        this.ui.imgInput.addEventListener("change", (e) => this.handleFileSelect(e, "image"));
        this.ui.videoInput.addEventListener("change", (e) => this.handleFileSelect(e, "video"));

        this.ui.btnQuiz.addEventListener("click", () => this.triggerQuiz());

        document.getElementById("btnUpload")?.addEventListener("click", () =>
            this.handleDocUpload()
        );

        this.ui.keys.license.addEventListener("input", (e) =>
            localStorage.setItem("ia_license_key", e.target.value)
        );

        this.ui.keys.google.addEventListener("input", (e) =>
            localStorage.setItem("ia_google_key", e.target.value)
        );

        window.limparMedia = () => {
            this.currentMedia = { data: null, mimeType: null, type: null };
            this.ui.mediaPreview.style.display = "none";
            this.ui.imgInput.value = "";
            this.ui.videoInput.value = "";
        };

        // Agentes
        document.getElementById("salvarTransformerBtn")?.addEventListener("click", () =>
            this.saveTransformer()
        );
        document.getElementById("limparTransformerBtn")?.addEventListener("click", () =>
            this.clearTransformerForm()
        );
        document.getElementById("limparListaBtn")?.addEventListener("click", () =>
            this.clearTransformerList()
        );
    }

    // -------------------------------------------------------
    // CONVERSAÇÃO ATIVA
    // -------------------------------------------------------
    startConversation() {
        if (!this.validateLicense()) return;
        this.conversationActive = true;
        this.updateUIState();
        this.updateStatus("Ouvindo...", "listening");
        try { this.recognition.start(); } catch (e) {}
    }

    stopConversation() {
        this.conversationActive = false;
        this.updateUIState();
        this.updateStatus("Pronto.", "idle");
        try { this.recognition.stop(); } catch (e) {}
        this.stopAudio();
    }

    // -------------------------------------------------------
    // MÍDIA (IMAGEM / VÍDEO)
    // -------------------------------------------------------
    handleFileSelect(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
            alert("⚠️ Arquivo maior que 4MB. Reduza o tamanho.");
            return;
        }

        const reader = new FileReader();

        reader.onloadend = () => {
            this.currentMedia = {
                data: reader.result,
                mimeType: file.type,
                type
            };

            this.ui.mediaPreview.style.display = "block";
            this.ui.mediaName.textContent = `${type === "video" ? "🎥" : "📷"} ${file.name}`;
        };

        reader.readAsDataURL(file);
    }

    // -------------------------------------------------------
    // QUIZ AUTOMÁTICO
    // -------------------------------------------------------
    triggerQuiz() {
        if (!this.validateLicense()) return;

        const promptQuiz = "Gere uma prova com 3 perguntas de múltipla escolha e gabarito.";
        this.addMessage("user", "📝 Solicitando prova...");

        this.updateStatus("Gerando Quiz...", "thinking");

        this.sendPayload(promptQuiz);
    }

    // -------------------------------------------------------
    // ENVIO DE TEXTO
    // -------------------------------------------------------
    async sendMessage() {
        const text = this.ui.input.value.trim();
        if (!text && !this.currentMedia.data) return;
        if (!this.validateLicense()) return;

        let exibicao = text;

        if (this.currentMedia.data) {
            if (this.currentMedia.type === "image") {
                exibicao += `<br><img src="${this.currentMedia.data}" style="max-width:150px;border-radius:8px;">`;
            } else {
                exibicao += `<br>🎥 Vídeo enviado.`;
            }
        }

        this.addMessage("user", exibicao);
        this.ui.input.value = "";
        this.updateStatus("Pensando...", "thinking");

        this.sendPayload(text);
    }

    // -------------------------------------------------------
    // ENVIO PARA O /api/chat
    // -------------------------------------------------------
    async sendPayload(text) {
        const history = this.getHistory();
        const profile = document.getElementById("perfil")?.value || "";
        const nome = document.getElementById("transformerNome")?.value || "";
        const useRag = this.ui.ragCheck?.checked || false;

        try {
            const resp = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    messages: history,
                    profile,
                    name: nome,
                    useRag,
                    mediaData: this.currentMedia.data,
                    mediaType: this.currentMedia.mimeType
                })
            });

            window.limparMedia();

            const result = await resp.json();

            if (!resp.ok) throw new Error(result.error);

            const reply = result.reply || "Não entendi.";

            this.addMessage("ia", reply);
            window.ultimaRespostaIA = reply;

            if (this.conversationActive) this.speak(reply);
            else this.updateStatus("Pronto.", "idle");

        } catch (e) {
            this.addMessage("ia", `❌ ${e.message}`);
            this.updateStatus("Erro", "idle");
        }
    }

    // -------------------------------------------------------
    // TTS GEMINI – VOZ HUMANIZADA
    // -------------------------------------------------------
    async speak(text) {
        if (!text) return;

        this.isSpeaking = true;
        this.updateStatus("Falando...", "speaking");
        try { this.recognition?.stop(); } catch (e) {}

        const voiceKey = document.getElementById("vozSelect")?.value || "shimmer";

        try {
            const resp = await fetch("/api/tts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    text,
                    voice: voiceKey
                })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || "Erro TTS");
            }

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);

            this.stopAudio();

            this.audioPlayer = new Audio(url);

            this.audioPlayer.onended = () => {
                URL.revokeObjectURL(url);
                this.audioPlayer = null;
                this.isSpeaking = false;

                if (this.conversationActive) {
                    try { this.recognition.start(); } catch (e) {}
                    this.updateStatus("Ouvindo...", "listening");
                } else {
                    this.updateStatus("Pronto.", "idle");
                }
            };

            await this.audioPlayer.play();

        } catch (e) {
            console.error(e);
            this.updateStatus("Erro na voz", "idle");
            this.isSpeaking = false;
        }
    }

    stopAudio() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.audioPlayer = null;
        }

        try { speechSynthesis.cancel(); } catch (e) {}

        this.isSpeaking = false;
    }

    // -------------------------------------------------------
    // HISTÓRICO
    // -------------------------------------------------------
    addMessage(role, text) {
        const div = document.createElement("div");
        div.classList.add("msg", role === "user" ? "usuario" : "ia");
        div.innerHTML = `<strong>${role === "user" ? "Você" : "IA"}:</strong> ${text}`;
        this.ui.mensagens.appendChild(div);
        this.ui.mensagens.scrollTop = this.ui.mensagens.scrollHeight;
    }

    getHistory() {
        return Array.from(this.ui.mensagens.children).map(m => ({
            role: m.classList.contains("usuario") ? "user" : "assistant",
            content: m.innerText.replace(/^(Você|IA):\s*/, "")
        })).slice(-12);
    }

    handleVoiceInput(evt) {
        let txt = "";

        for (let i = evt.resultIndex; i < evt.results.length; i++) {
            if (evt.results[i].isFinal) txt += evt.results[i][0].transcript;
        }

        if (txt) this.ui.input.value = txt;

        clearTimeout(this.silenceTimer);

        if (txt.trim() && this.conversationActive) {
            this.silenceTimer = setTimeout(() => this.sendMessage(), 1800);
        }
    }

    // -------------------------------------------------------
    // UPLOAD / RAG
    // -------------------------------------------------------
    async handleDocUpload() {
        const file = document.getElementById("arquivoInput").files[0];
        if (!file) return alert("Selecione um arquivo.");

        if (!this.validateLicense()) return;

        const btn = document.getElementById("btnUpload");
        const status = document.getElementById("uploadStatus");

        btn.textContent = "Processando...";
        btn.disabled = true;
        status.className = "upload-status loading";
        status.textContent = "Lendo documento...";

        try {
            const fd = new FormData();
            fd.append("file", file);

            const resp = await fetch("/api/upload", {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: fd
            });

            const data = await resp.json();

            if (!resp.ok) throw new Error(data.error);

            status.textContent = "📚 Conhecimento adicionado!";
            status.className = "upload-status success";

            this.ui.ragCheck.checked = true;

        } catch (e) {
            status.textContent = "❌ " + e.message;
            status.className = "upload-status error";
        }

        btn.textContent = "Processar Conhecimento";
        btn.disabled = false;
    }

    // -------------------------------------------------------
    // VALIDAR LICENÇA
    // -------------------------------------------------------
    validateLicense() {
        if (!this.ui.keys.license.value.trim()) {
            alert("Insira sua licença.");
            return false;
        }
        return true;
    }

    getAuthHeaders() {
        return {
            "x-license-key": this.ui.keys.license.value.trim(),
            "x-google-key": this.ui.keys.google.value.trim()
        };
    }

    // -------------------------------------------------------
    // STATUS + UI
    // -------------------------------------------------------
    updateStatus(msg, state) {
        this.ui.statusText.textContent = msg;

        if (state === "speaking") {
            this.ui.holoHead.classList.add("speaking");
        } else {
            this.ui.holoHead.classList.remove("speaking");
        }
    }

    updateUIState() {
        this.ui.btnStart.disabled = this.conversationActive;
        this.ui.btnStop.disabled = !this.conversationActive;
    }

    // -------------------------------------------------------
    // AGENTES (SALVAR / CARREGAR)
    // -------------------------------------------------------
    loadSettings() {
        this.ui.keys.license.value = localStorage.getItem("ia_license_key") || "";
        this.ui.keys.google.value = localStorage.getItem("ia_google_key") || "";
        this.loadTransformers();
    }

    loadTransformers() {
        try {
            window.transformersSalvos =
                JSON.parse(localStorage.getItem("ia_transformers_lista")) || [];
        } catch {
            window.transformersSalvos = [];
        }

        this.renderTransformers();
    }

    saveTransformer() {
        const nome = document.getElementById("transformerNome").value.trim();
        const perfil = document.getElementById("perfil").value.trim();
        const voz = document.getElementById("vozSelect").value;

        if (!nome) return alert("Escolha um nome.");

        const lista = window.transformersSalvos;
        const idx = lista.findIndex((t) => t.nome === nome);

        const obj = { nome, perfil, voz };

        if (idx >= 0) lista[idx] = obj;
        else lista.push(obj);

        localStorage.setItem("ia_transformers_lista", JSON.stringify(lista));

        this.renderTransformers();
        this.updateStatus("Agente salvo!", "idle");
    }

    clearTransformerForm() {
        document.getElementById("transformerNome").value = "";
        document.getElementById("perfil").value = "";
        document.getElementById("vozSelect").value = "shimmer";
        this.updateStatus("Campos limpos.", "idle");
    }

    clearTransformerList() {
        if (!confirm("Tem certeza?")) return;

        localStorage.removeItem("ia_transformers_lista");
        window.transformersSalvos = [];
        this.renderTransformers();

        this.updateStatus("Lista apagada.", "idle");
    }

    renderTransformers() {
        const area = document.getElementById("listaTransformers");
        area.innerHTML = "";

        window.transformersSalvos.forEach((t) => {
            const div = document.createElement("div");
            div.className = "transformer-item";
            div.textContent = t.nome;

            div.onclick = () => {
                document.getElementById("transformerNome").value = t.nome;
                document.getElementById("perfil").value = t.perfil;
                document.getElementById("vozSelect").value = t.voz;
                this.updateStatus("Agente carregado.", "idle");
            };

            area.appendChild(div);
        });
    }
}

// Inicializa
window.addEventListener("DOMContentLoaded", () => {
    window.assistant = new VoiceAssistant();
    speechSynthesis.getVoices(); // Força carregamento de vozes 
});
