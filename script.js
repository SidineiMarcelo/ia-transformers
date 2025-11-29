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
        this.silenceTimer = null;

        // Armazena dados da mídia atual
        this.currentMedia = {
            data: null,
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
            videoInput: document.getElementById("chatVideoInput"),
            btnQuiz: document.getElementById("btnQuiz"),
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

    // --- RECONHECIMENTO DE VOZ ---
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
            this.ui.btnStart.textContent = "❌ Sem Mic";
            this.ui.btnStart.disabled = true;
        }
    }

    // --- EVENTOS ---
    bindEvents() {
        this.ui.btnSend.addEventListener("click", () => this.sendMessage());
        this.ui.input.addEventListener("keydown", (e) => { 
            if(e.key==="Enter" && !e.shiftKey) {
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
        
        document.getElementById("lerBtn")?.addEventListener("click", () => {
            if(window.ultimaRespostaIA) this.speak(window.ultimaRespostaIA);
        });

        document.getElementById("salvarTransformerBtn")?.addEventListener("click", () => this.saveTransformer());
        document.getElementById("limparTransformerBtn")?.addEventListener("click", () => this.clearTransformerForm());
        document.getElementById("limparListaBtn")?.addEventListener("click", () => this.clearTransformerList());
        
        window.limparMedia = () => {
            this.currentMedia = { data: null, mimeType: null, type: null };
            if (this.ui.mediaPreview) this.ui.mediaPreview.style.display = "none";
            if (this.ui.imgInput) this.ui.imgInput.value = "";
            if (this.ui.videoInput) this.ui.videoInput.value = "";
        };
    }

    // --- CONVERSAÇÃO POR VOZ ---
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
        this.updateStatus("Pronto", "idle");
        try { this.recognition.stop(); } catch (e) {}
        this.stopAudio();
    }

    // --- MÍDIA ---
    handleFileSelect(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
            alert("⚠️ Arquivo muito grande! Use mídias até 4MB.");
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

    // --- QUIZ ---
    triggerQuiz() {
        if (!this.validateLicense()) return;
        
        this.stopAudio();
        
        const promptQuiz = "Crie uma prova técnica com 3 perguntas de múltipla escolha e um gabarito no final.";
        
        this.addMessage("user", "📝 <strong>Solicitação de Prova:</strong><br>" + promptQuiz);
        this.ui.input.value = "";
        this.updateStatus("Gerando Prova...", "thinking");
        
        this.sendPayload(promptQuiz);
    }

    // --- ENVIO DE MENSAGEM ---
    async sendMessage() {
        const text = this.ui.input.value.trim();

        if (!text && !this.currentMedia.data) return;
        if (!this.validateLicense()) return;

        this.stopAudio();
        
        let userDisplay = text;
        if (this.currentMedia.data) {
            if (this.currentMedia.type === 'image') {
                userDisplay += `<br><img src="${this.currentMedia.data}" style="max-width:150px; border-radius:8px; margin-top:5px;">`;
            } else {
                userDisplay += `<br>🎥 [Vídeo anexado]`;
            }
        }
        this.addMessage("user", userDisplay);
        
        this.ui.input.value = "";
        this.updateStatus("Gemini Analisando...", "thinking");

        this.sendPayload(text);
    }

    // --- FUNÇÃO CENTRAL DE ENVIO ---
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
                    useRag,
                    name,
                    mediaData: this.currentMedia.data,
                    mediaType: this.currentMedia.mimeType
                }),
            });

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

    // --- VOZ (NAVEGADOR — SEM TTS DO BACKEND) ---
    async speak(text) {
        if (!text) return;

        this.isSpeaking = true;
        this.updateStatus("Falando...", "speaking");
        try { this.recognition?.stop(); } catch(e) {}

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";

        utterance.pitch = 1;
        utterance.rate = 1;

        utterance.onend = () => {
            this.isSpeaking = false;
            if (this.conversationActive) {
                this.updateStatus("Ouvindo...", "listening");
                try { this.recognition?.start(); } catch(e){}
            } else {
                this.updateStatus("Pronto", "idle");
            }
        };

        speechSynthesis.speak(utterance);
    }

    stopAudio() {
        try { speechSynthesis.cancel(); } catch(e){}
        this.isSpeaking = false;
        this.ui.holoHead.classList.remove("speaking");
    }

    // --- UPLOAD PDF/DOCX ---
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

    // --- LICENÇA ---
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
        state === "speaking"
            ? this.ui.holoHead.classList.add("speaking")
            : this.ui.holoHead.classList.remove("speaking");
    }

    updateUIState() {
        this.ui.btnStart.disabled = this.conversationActive;
        this.ui.btnStop.disabled = !this.conversationActive;
    }

    // --- HISTÓRICO ---
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

    // --- AGENTES SALVOS ---
    loadTransformers() {
        try {
            const raw = localStorage.getItem("ia_transformers_lista");
            window.transformersSalvos = raw ? JSON.parse(raw) : [];
            this.renderTransformers();
        } catch {
            window.transformersSalvos = [];
        }
    }

    saveTransformer() {
        const nome = document.getElementById("transformerNome")?.value.trim();
        const perfil = document.getElementById("perfil")?.value.trim();
        const voz = document.getElementById("vozSelect")?.value || "alloy";

        if (!nome) {
            alert("Dê um nome para o agente antes de salvar.");
            return;
        }

        const lista = window.transformersSalvos || [];
        const idx = lista.findIndex(t => t.nome === nome);
        const item = { nome, perfil, voz };

        if (idx >= 0) {
            lista[idx] = item;
        } else {
            lista.push(item);
        }

        window.transformersSalvos = lista;
        localStorage.setItem("ia_transformers_lista", JSON.stringify(lista));
        this.renderTransformers();
        this.updateStatus("Agente salvo.", "idle");
    }

    clearTransformerForm() {
        document.getElementById("transformerNome").value = "";
        document.getElementById("perfil").value = "";
        document.getElementById("vozSelect").value = "shimmer";
        this.updateStatus("Configuração limpa.", "idle");
    }

    clearTransformerList() {
        if (!confirm("Tem certeza?")) return;
        window.transformersSalvos = [];
        localStorage.removeItem("ia_transformers_lista");
        this.renderTransformers();
        this.updateStatus("Lista de agentes limpa.", "idle");
    }

    renderTransformers() {
        const lista = document.getElementById("listaTransformers");
        if (!lista) return;
        lista.innerHTML = "";
        (window.transformersSalvos || []).forEach(t => {
            const div = document.createElement("div");
            div.className = "transformer-item";
            div.innerHTML = `<span class="transformer-name">${t.nome}</span>`;
            div.onclick = () => {
                document.getElementById("transformerNome").value = t.nome;
                document.getElementById("perfil").value = t.perfil;
                document.getElementById("vozSelect").value = t.voz || "alloy";
                this.updateStatus("Agente carregado.", "idle");
            };
            lista.appendChild(div);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => { 
    window.assistant = new VoiceAssistant(); 
});

window.transformersSalvos = [];  
