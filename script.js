/**
 * IA TRANSFORMERS – SCRIPT PRINCIPAL (V3.2)
 * Suporte: Texto, Voz (Navegador), Imagem, Vídeo, Quiz, RAG, Agentes
 */

class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.audioPlayer = null;
        this.isSpeaking = false;
        this.conversationActive = false;
        this.silenceTimer = null;

        // Mídia anexada
        this.currentMedia = {
            data: null,
            mimeType: null,
            type: null
        };

        // Elementos da interface
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
            mediaName: document.getElementById("mediaName"),
        };

        this.init();
    }

    init() {
        this.setupRecognition();
        this.loadSettings();
        this.bindEvents();
        console.log("🔥 IA Transformers iniciado com sucesso.");
    }

    // ------------------------------------------
    // 🔊 1. RECONHECIMENTO DE VOZ
    // ------------------------------------------
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
                    try { this.recognition.start(); } catch(e){}
                } else {
                    this.updateStatus("Ocioso", "idle");
                }
            };
            this.recognition.onresult = (e) => this.handleVoiceInput(e);
        } else {
            this.ui.btnStart.textContent = "❌ Sem Microfone";
            this.ui.btnStart.disabled = true;
        }
    }

    // ------------------------------------------
    // 🔧 2. EVENTOS
    // ------------------------------------------
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

        this.ui.imgInput.addEventListener("change", (e) => this.handleFileSelect(e, 'image'));
        this.ui.videoInput.addEventListener("change", (e) => this.handleFileSelect(e, 'video'));

        this.ui.btnQuiz.addEventListener("click", () => this.triggerQuiz());

        document.getElementById("btnUpload")?.addEventListener("click", () => this.handleDocUpload());

        this.ui.keys.license.addEventListener("input", (e) => localStorage.setItem("ia_license_key", e.target.value));
        this.ui.keys.google.addEventListener("input", (e) => localStorage.setItem("ia_google_key", e.target.value));

        window.limparMedia = () => {
            this.currentMedia = { data: null, mimeType: null, type: null };
            this.ui.mediaPreview.style.display = "none";
            this.ui.imgInput.value = "";
            this.ui.videoInput.value = "";
        };

        // Salvar / carregar agentes
        document.getElementById("salvarTransformerBtn")?.addEventListener("click", () => this.saveTransformer());
        document.getElementById("limparTransformerBtn")?.addEventListener("click", () => this.clearTransformerForm());
        document.getElementById("limparListaBtn")?.addEventListener("click", () => this.clearTransformerList());
    }

    // ------------------------------------------
    // 🎤 3. CONVERSAÇÃO
    // ------------------------------------------
    startConversation() {
        if (!this.validateLicense()) return;
        this.conversationActive = true;
        this.updateUIState();
        this.updateStatus("Ouvindo...", "listening");
        try { this.recognition.start(); } catch(e){}
    }

    stopConversation() {
        this.conversationActive = false;
        this.updateUIState();
        this.updateStatus("Pronto.", "idle");
        try { this.recognition.stop(); } catch(e){}
        this.stopAudio();
    }

    // ------------------------------------------
    // 🖼️ 4. MÍDIA (IMAGEM / VÍDEO)
    // ------------------------------------------
    handleFileSelect(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
            alert("O arquivo excede 4MB. Use arquivos menores.");
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
            this.ui.mediaName.textContent = `${type === 'video' ? '🎥' : '📷'} ${file.name}`;
        };

        reader.readAsDataURL(file);
    }

    // ------------------------------------------
    // 📝 5. QUIZ AUTOMÁTICO
    // ------------------------------------------
    triggerQuiz() {
        if (!this.validateLicense()) return;

        const promptQuiz = "Crie uma prova técnica com 3 perguntas de múltipla escolha e gabarito ao final.";
        this.addMessage("user", "📝 Solicitando Quiz...");
        this.updateStatus("Gerando Quiz...", "thinking");

        this.sendPayload(promptQuiz);
    }

    // ------------------------------------------
    // 💬 6. ENVIO DE MENSAGEM
    // ------------------------------------------
    async sendMessage() {
        const text = this.ui.input.value.trim();

        if (!text && !this.currentMedia.data) return;
        if (!this.validateLicense()) return;

        this.stopAudio();

        let show = text;
        if (this.currentMedia.data) {
            if (this.currentMedia.type === "image") {
                show += `<br><img src="${this.currentMedia.data}" style="max-width:150px; border-radius:8px;">`;
            } else {
                show += `<br>🎥 Vídeo enviado`;
            }
        }

        this.addMessage("user", show);
        this.ui.input.value = "";

        this.updateStatus("Gemini analisando...", "thinking");

        this.sendPayload(text);
    }

    // ------------------------------------------
    // 📤 7. ENVIO PARA BACKEND
    // ------------------------------------------
    async sendPayload(text) {
        const messages = this.getHistory();
        const profile = document.getElementById("perfil")?.value || "";
        const name = document.getElementById("transformerNome")?.value || "";
        const useRag = this.ui.ragCheck?.checked || false;

        try {
            const resp = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    messages,
                    profile,
                    name,
                    useRag,
                    mediaData:    this.currentMedia.data,
                    mediaType:    this.currentMedia.mimeType
                }),
            });

            window.limparMedia();

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || "Erro desconhecido");

            const reply = data.reply || "Não consegui gerar resposta.";
            this.addMessage("ia", reply);

            if (this.conversationActive) this.speak(reply);
            else this.updateStatus("Pronto", "idle");

        } catch (e) {
            this.addMessage("ia", "❌ " + e.message);
            this.updateStatus("Erro", "idle");
        }
    }

    // ------------------------------------------
    // 🔊 8. TTS (NAVEGADOR) – SEM GEMINI
    // ------------------------------------------
    async speak(text) {
        if (!text) return;

        // Limpa emojis e pontuação que a voz ficava lendo
        let clean = text
            .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
            .replace(/\.{2,}/g, ".")
            .replace(/[!?;><]/g, "")
            .trim();

        if (!clean) clean = text;

        this.isSpeaking = true;
        this.updateStatus("Falando...", "speaking");

        try { this.recognition?.stop(); } catch(e){}

        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = "pt-BR";

        // Tenta aplicar vozes diferentes
        const voices = speechSynthesis.getVoices();
        const ptVoices = voices.filter(v => v.lang?.startsWith("pt"));

        const selected = document.getElementById("vozSelect").value;
        const map = { shimmer:0, nova:1, onyx:2, echo:3, alloy:4 };

        if (ptVoices.length > 0) {
            const index = map[selected] ?? 0;
            utter.voice = ptVoices[Math.min(index, ptVoices.length - 1)];
        }

        utter.pitch = 1;
        utter.rate  = 1;

        utter.onend = () => {
            this.isSpeaking = false;
            if (this.conversationActive) {
                try { this.recognition.start(); } catch(e){}
                this.updateStatus("Ouvindo...", "listening");
            } else {
                this.updateStatus("Pronto", "idle");
            }
        };

        speechSynthesis.speak(utter);
    }

    stopAudio() {
        try { speechSynthesis.cancel(); } catch(e){}
        this.isSpeaking = false;
    }

    // ------------------------------------------
    // 🧠 9. HISTÓRICO
    // ------------------------------------------
    addMessage(role, text) {
        const div = document.createElement("div");
        div.classList.add("msg", role === "user" ? "usuario" : "ia");
        div.innerHTML = `<strong>${role === "user" ? "Você" : "IA"}</strong> ${text}`;
        this.ui.mensagens.appendChild(div);
        this.ui.mensagens.scrollTop = this.ui.mensagens.scrollHeight;
    }

    getHistory() {
        return Array.from(this.ui.mensagens.children).map(msg => ({
            role: msg.classList.contains("usuario") ? "user" : "assistant",
            content: msg.innerText.replace(/^(Você|IA)\s/, "")
        })).slice(-12);
    }

    handleVoiceInput(event) {
        let txt = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) txt += event.results[i][0].transcript;
        }

        if (txt) this.ui.input.value = txt;

        clearTimeout(this.silenceTimer);
        if (txt.trim() && this.conversationActive) {
            this.silenceTimer = setTimeout(() => this.sendMessage(), 1800);
        }
    }

    // ------------------------------------------
    // 📁 10. RAG – PDF/DOCX
    // ------------------------------------------
    async handleDocUpload() {
        const file = document.getElementById("arquivoInput").files[0];
        if (!file) return alert("Selecione um arquivo.");

        if (!this.validateLicense()) return;

        const btn = document.getElementById("btnUpload");
        const status = document.getElementById("uploadStatus");

        btn.textContent = "Processando...";
        btn.disabled = true;
        status.textContent = "Lendo documento...";
        status.className = "upload-status loading";

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

            status.textContent = "📚 Memória criada!";
            status.className = "upload-status success";
            this.ui.ragCheck.checked = true;

        } catch (e) {
            status.textContent = "❌ " + e.message;
            status.className = "upload-status error";
        }

        btn.textContent = "Processar Conhecimento";
        btn.disabled = false;
    }

    // ------------------------------------------
    // 🛡️ 11. LICENÇA & CONFIG
    // ------------------------------------------
    getAuthHeaders() {
        return {
            "x-license-key": this.ui.keys.license.value.trim(),
            "x-google-key": this.ui.keys.google.value.trim()
        };
    }

    validateLicense() {
        if (!this.ui.keys.license.value.trim()) {
            alert("Insira sua licença.");
            return false;
        }
        return true;
    }

    updateStatus(text, state) {
        this.ui.statusText.textContent = text;

        if (state === "speaking")
            this.ui.holoHead.classList.add("speaking");
        else
            this.ui.holoHead.classList.remove("speaking");
    }

    updateUIState() {
        this.ui.btnStart.disabled = this.conversationActive;
        this.ui.btnStop.disabled = !this.conversationActive;
    }

    // ------------------------------------------
    // 🧩 12. AGENTES – SALVAR / CARREGAR
    // ------------------------------------------
    loadSettings() {
        this.ui.keys.license.value = localStorage.getItem("ia_license_key") || "";
        this.ui.keys.google.value = localStorage.getItem("ia_google_key") || "";
        this.loadTransformers();
    }

    loadTransformers() {
        try {
            window.transformersSalvos = JSON.parse(localStorage.getItem("ia_transformers_lista")) || [];
        } catch {
            window.transformersSalvos = [];
        }
        this.renderTransformers();
    }

    saveTransformer() {
        const nome = document.getElementById("transformerNome").value.trim();
        const perfil = document.getElementById("perfil").value.trim();
        const voz = document.getElementById("vozSelect").value;

        if (!nome) return alert("Escolha um nome para salvar.");

        const lista = window.transformersSalvos;
        const idx = lista.findIndex(t => t.nome === nome);
        const obj = { nome, perfil, voz };

        if (idx >= 0) lista[idx] = obj;
        else lista.push(obj);

        localStorage.setItem("ia_transformers_lista", JSON.stringify(lista));
        this.renderTransformers();
        this.updateStatus("Agente salvo.", "idle");
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

        window.transformersSalvos.forEach(t => {
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

// Inicializa tudo
window.addEventListener("DOMContentLoaded", () => {
    window.assistant = new VoiceAssistant();  
});

window.transformersSalvos = [];
