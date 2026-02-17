// ==============================
// CONFIGURAÇÃO
// ==============================

const baseSystemPrompt = `Você é o Mestre de um RPG Noir de investigação.
O clima é sério, sombrio e realista.
REGRAS:
1. Gerencie 3 atributos: Tensão (T), Visibilidade (V) e Credibilidade (C).
2. Se o jogador encontrar uma pista real, adicione-a à lista de EVIDENCIAS.
3. Use o formato fixo no final da resposta: [[STATS: T=x, V=x, C=x, EVIDENCIAS=item1;item2]]
4. Mantenha as respostas concisas e atmosféricas.`;

const setupQuestions = [
    {
        key: 'dificuldade',
        prompt: 'Antes de iniciar, escolha a dificuldade (fácil, média ou difícil).',
        validate: value => ['fácil', 'facil', 'média', 'media', 'difícil', 'dificil'].includes(value.toLowerCase()),
        error: 'Resposta inválida. Digite: fácil, média ou difícil.'
    },
    {
        key: 'jogadores',
        prompt: 'Quantos jogadores vão participar? (1 a 8)',
        validate: value => {
            const total = Number(value);
            return Number.isInteger(total) && total >= 1 && total <= 8;
        },
        normalize: value => String(Number(value)),
        error: 'Informe um número inteiro entre 1 e 8.'
    },
    {
        key: 'periodo',
        prompt: 'Qual período da investigação vocês escolheram? (ex.: madrugada chuvosa, anos 90, etc.)',
        validate: value => value.trim().length >= 3,
        error: 'Descreva melhor o período escolhido (mínimo de 3 caracteres).'
    }
];

const specialists = [
    { id: 'legista', nome: 'Dra. Helena Prado', profissao: 'Legista', emoji: '🧬' },
    { id: 'forense', nome: 'Marcos Vidal', profissao: 'Perito Forense', emoji: '🔬' },
    { id: 'delegado', nome: 'Delegado Ramos', profissao: 'Delegado', emoji: '🕵️' },
    { id: 'agente', nome: 'Lia Torres', profissao: 'Agente de Campo', emoji: '🛡️' },
    { id: 'quimico', nome: 'Igor Nunes', profissao: 'Químico Criminal', emoji: '⚗️' },
    { id: 'medica', nome: 'Dra. Sofia Meirelles', profissao: 'Médica', emoji: '🩺' },
    { id: 'jornalista', nome: 'Caio Ferraz', profissao: 'Jornalista Investigativo', emoji: '📰' }
];

const BOT_TYPING_SPEED_MS = 18;
const CONTACT_TYPING_SPEED_MS = 14;
const STORAGE_KEY = 'mural_case_data_v3';

// ==============================
// ESTADO
// ==============================

const evidenciasColetadas = new Set();
const chatHistory = [];
const contactChats = {};
const contactUiMessages = {};

let setupStepIndex = 0;
let sessionConfigured = false;
let selectedContact = null;
let creatingFolderMode = false;
let activeFolderId = null;
let muralSearchTerm = '';

const setupAnswers = { dificuldade: '', jogadores: '', periodo: '' };

const caseData = {
    activeFolders: [],
    storageFolders: [],
    rootEvidence: [],
    timeline: [],
    status: 'open',
    theme: 'dark',
    turn: 1,
    timeSlot: 'Noite',
    stats: { t: 10, v: 5, c: 90 },
    specialistTrust: {}
};

// ==============================
// ELEMENTOS
// ==============================

const log = document.getElementById('log');
const typingIndicator = document.getElementById('typing-indicator');
const mural = document.getElementById('mural');
const timelineEl = document.getElementById('timeline');
const caseStatusEl = document.getElementById('case-status');
const toastEl = document.getElementById('toast');
const turnCounterEl = document.getElementById('turn-counter');
const timeSlotEl = document.getElementById('time-slot');
const quickActionsEl = document.getElementById('quick-actions');

const sendBtn = document.getElementById('send-btn');
const userInput = document.getElementById('userInput');
const peritosBtn = document.getElementById('peritos-btn');
const popup = document.getElementById('peritos-popup');
const closePopupBtn = document.getElementById('close-popup');
const ambientSound = document.getElementById('ambient-sound');

const contactListView = document.getElementById('contact-list-view');
const contactChatView = document.getElementById('contact-chat-view');
const peritoList = document.getElementById('perito-list');
const contactBackBtn = document.getElementById('contact-back-btn');
const contactSelectedEmoji = document.getElementById('contact-selected-emoji');
const contactSelectedName = document.getElementById('contact-selected-name');
const contactSelectedRole = document.getElementById('contact-selected-role');
const contactTrustEl = document.getElementById('contact-trust');
const contactChatLog = document.getElementById('contact-chat-log');
const contactChatInput = document.getElementById('contact-chat-input');
const contactSendBtn = document.getElementById('contact-send-btn');

const createFolderBtn = document.getElementById('create-folder-btn');
const backFolderBtn = document.getElementById('back-folder-btn');
const storageBtn = document.getElementById('storage-btn');
const finishCaseBtn = document.getElementById('finish-case-btn');
const muralSearchInput = document.getElementById('mural-search');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file');
const themeBtn = document.getElementById('theme-btn');

// ==============================
// UTILITÁRIOS
// ==============================

function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

function nowTime() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function addTimeline(entry) {
    caseData.timeline.unshift({ time: nowTime(), ...entry });
    caseData.timeline = caseData.timeline.slice(0, 120);
    persistCaseData();
    renderTimeline();
}

function renderTimeline() {
    timelineEl.innerHTML = '';
    caseData.timeline.slice(0, 20).forEach(item => {
        const line = document.createElement('div');
        line.className = 'timeline-item';
        line.innerHTML = `<div class="timeline-time">${item.time} • ${item.source}</div><div>${item.text}</div>`;
        timelineEl.appendChild(line);
    });
}

function updateCaseStatusUI() {
    const isClosed = caseData.status === 'closed';
    caseStatusEl.textContent = isClosed ? 'CASO ENCERRADO' : 'CASO ABERTO';
    caseStatusEl.className = `case-status ${isClosed ? 'closed' : 'open'}`;
    finishCaseBtn.textContent = isClosed ? 'Reabrir caso' : 'Encerrar caso';
}


function updateTurnUI() {
    turnCounterEl.textContent = String(caseData.turn);
    timeSlotEl.textContent = caseData.timeSlot;
}

function renderStatsFromState() {
    const { t, v, c } = caseData.stats;
    document.getElementById('t-bar').style.width = `${t}%`;
    document.getElementById('t-val').innerText = `${t}%`;
    document.getElementById('v-bar').style.width = `${v}%`;
    document.getElementById('v-val').innerText = `${v}%`;
    document.getElementById('c-bar').style.width = `${c}%`;
    document.getElementById('c-val').innerText = `${c}%`;
}

function ensureSpecialistTrust() {
    specialists.forEach(spec => {
        if (typeof caseData.specialistTrust[spec.id] !== 'number') {
            caseData.specialistTrust[spec.id] = 50;
        }
    });
}

function adjustTrust(specId, delta) {
    const current = caseData.specialistTrust[specId] ?? 50;
    caseData.specialistTrust[specId] = clampPercent(current + delta);
    if (selectedContact?.id === specId) {
        contactTrustEl.textContent = `Confiança: ${caseData.specialistTrust[specId]}%`;
    }
    renderContactList();
    persistCaseData();
}

function advanceTurn() {
    const order = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
    const idx = order.indexOf(caseData.timeSlot);
    const next = (idx + 1) % order.length;
    caseData.timeSlot = order[next];
    caseData.turn += 1;
    updateTurnUI();
    persistCaseData();
}

function applyQuickAction(actionKey) {
    if (caseData.status === 'closed') {
        showToast('Reabra o caso para executar ações.');
        return;
    }

    const actions = {
        interrogar: { text: 'Você pressiona um suspeito em interrogatório.', t: 6, v: 2, c: 1 },
        vigiar: { text: 'Você monta vigilância silenciosa na área.', t: 2, v: 1, c: 3 },
        laboratorio: { text: 'Você prioriza análise técnica no laboratório.', t: 1, v: 0, c: 5 },
        imprensa: { text: 'Você solta uma pista estratégica na imprensa.', t: 4, v: 8, c: -2 }
    };

    const action = actions[actionKey];
    if (!action) return;

    caseData.stats.t = clampPercent(caseData.stats.t + action.t);
    caseData.stats.v = clampPercent(caseData.stats.v + action.v);
    caseData.stats.c = clampPercent(caseData.stats.c + action.c);
    renderStatsFromState();

    appendLogEntry({ text: `[AÇÃO]: ${action.text}`, cssClass: 'system-msg', isSystem: true });
    addTimeline({ source: 'ação', text: action.text });
    advanceTurn();
    persistCaseData();
}

function buildConfiguredSystemPrompt({ dificuldade, jogadores, periodo }) {
    return `${baseSystemPrompt}
CONFIGURAÇÃO DA MESA:
- Dificuldade: ${dificuldade}
- Jogadores: ${jogadores}
- Período escolhido: ${periodo}

Ajuste o ritmo da história e o perigo de acordo com a dificuldade e com a quantidade de jogadores.`;
}

function appendLogEntry({ speaker, text, cssClass = '', isSystem = false }) {
    const entry = document.createElement('div');
    entry.className = `entry ${cssClass}`.trim();

    let textNode = null;

    if (isSystem) {
        entry.textContent = text;
    } else {
        const strong = document.createElement('strong');
        strong.textContent = `${speaker}:`;
        entry.appendChild(strong);

        textNode = document.createElement('span');
        textNode.textContent = ` ${text}`;
        entry.appendChild(textNode);
    }

    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    return { textNode };
}

function appendContactBubble(text, sender) {
    const bubble = document.createElement('div');
    bubble.className = `contact-bubble ${sender}`;
    bubble.textContent = text;
    contactChatLog.appendChild(bubble);
    contactChatLog.scrollTop = contactChatLog.scrollHeight;
    return bubble;
}

async function typeText(textNode, fullText, speedMs = BOT_TYPING_SPEED_MS) {
    if (!textNode) return;

    textNode.textContent = '';
    for (const char of fullText) {
        textNode.textContent += char;
        log.scrollTop = log.scrollHeight;
        await sleep(speedMs);
    }
}

async function typeBubbleText(bubble, text, speedMs = CONTACT_TYPING_SPEED_MS) {
    bubble.textContent = '';
    for (const char of text) {
        bubble.textContent += char;
        contactChatLog.scrollTop = contactChatLog.scrollHeight;
        await sleep(speedMs);
    }
}

function setLoading(isLoading) {
    typingIndicator.classList.toggle('hidden', !isLoading);
    sendBtn.disabled = isLoading;
    userInput.disabled = isLoading;
}

function persistCaseData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(caseData));
}

function loadCaseData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
        const parsed = JSON.parse(raw);
        caseData.activeFolders = Array.isArray(parsed.activeFolders) ? parsed.activeFolders : [];
        caseData.storageFolders = Array.isArray(parsed.storageFolders) ? parsed.storageFolders : [];
        caseData.rootEvidence = Array.isArray(parsed.rootEvidence) ? parsed.rootEvidence : [];
        caseData.timeline = Array.isArray(parsed.timeline) ? parsed.timeline : [];
        caseData.status = parsed.status === 'closed' ? 'closed' : 'open';
        caseData.theme = parsed.theme === 'light' ? 'light' : 'dark';
        caseData.turn = Number.isInteger(parsed.turn) ? parsed.turn : 1;
        caseData.timeSlot = typeof parsed.timeSlot === 'string' ? parsed.timeSlot : 'Noite';
        caseData.stats = parsed.stats && typeof parsed.stats === 'object' ? {
            t: clampPercent(parsed.stats.t ?? 10),
            v: clampPercent(parsed.stats.v ?? 5),
            c: clampPercent(parsed.stats.c ?? 90)
        } : { t: 10, v: 5, c: 90 };
        caseData.specialistTrust = parsed.specialistTrust && typeof parsed.specialistTrust === 'object' ? parsed.specialistTrust : {};
    } catch {
        // ignora estado inválido
    }
}

function applyTheme() {
    document.body.classList.toggle('light-theme', caseData.theme === 'light');
}

function normalizedSearch(value) {
    return value.toLowerCase().trim();
}

function matchesSearch(value) {
    if (!muralSearchTerm) return true;
    return normalizedSearch(value).includes(muralSearchTerm);
}

function addEvidenceToCase(item, source = 'sistema') {
    const cleaned = item.trim();
    if (!cleaned || evidenciasColetadas.has(cleaned)) return;

    evidenciasColetadas.add(cleaned);

    if (activeFolderId && activeFolderId !== '__storage__') {
        const folder = caseData.activeFolders.find(f => f.id === activeFolderId);
        if (folder) {
            folder.notes.push(cleaned);
        } else {
            caseData.rootEvidence.push(cleaned);
        }
    } else {
        caseData.rootEvidence.push(cleaned);
    }

    addTimeline({ source, text: `Nova evidência: ${cleaned}` });
    showToast(`+ Evidência adicionada: ${cleaned}`);
    persistCaseData();
    renderMural();
}

function extractEvidenceItems(text) {
    const items = [];

    const statsRegex = /\[\[STATS:\s*T=(\d+),\s*V=(\d+),\s*C=(\d+),\s*EVIDENCIAS=(.*)\]\]/;
    const statsMatch = text.match(statsRegex);
    if (statsMatch) {
        const [, t, v, c, evStr] = statsMatch;

        caseData.stats.t = clampPercent(t);
        caseData.stats.v = clampPercent(v);
        caseData.stats.c = clampPercent(c);
        renderStatsFromState();

        evStr.split(';').map(vl => vl.trim()).filter(Boolean).forEach(vl => items.push(vl));
        text = text.replace(statsRegex, '').trim();
    }

    const contactEvidenceRegex = /\[\[EVIDENCIAS=(.*?)\]\]/;
    const contactEvidenceMatch = text.match(contactEvidenceRegex);
    if (contactEvidenceMatch) {
        contactEvidenceMatch[1].split(';').map(vl => vl.trim()).filter(Boolean).forEach(vl => items.push(vl));
        text = text.replace(contactEvidenceRegex, '').trim();
    }

    return { cleanedText: text, items };
}

function askCurrentSetupQuestion() {
    const question = setupQuestions[setupStepIndex];
    if (!question) return;

    appendLogEntry({ text: `[SISTEMA]: ${question.prompt}`, cssClass: 'system-msg', isSystem: true });
}

function handleSetupInput(text) {
    const question = setupQuestions[setupStepIndex];
    if (!question) return;

    const trimmed = text.trim();
    if (!question.validate(trimmed)) {
        appendLogEntry({ text: `[SISTEMA]: ${question.error}`, cssClass: 'system-msg', isSystem: true });
        askCurrentSetupQuestion();
        return;
    }

    const normalizedValue = question.normalize ? question.normalize(trimmed) : trimmed;
    setupAnswers[question.key] = normalizedValue;
    setupStepIndex += 1;

    if (setupStepIndex < setupQuestions.length) {
        askCurrentSetupQuestion();
        return;
    }

    sessionConfigured = true;
    userInput.placeholder = 'O que você faz agora, detetive?';

    const configuredPrompt = buildConfiguredSystemPrompt(setupAnswers);
    chatHistory.push({ role: 'user', parts: [{ text: configuredPrompt }] });

    appendLogEntry({
        text: `[SISTEMA]: Configuração concluída. Dificuldade ${setupAnswers.dificuldade}, ${setupAnswers.jogadores} jogador(es), período: ${setupAnswers.periodo}. A investigação começou.`,
        cssClass: 'system-msg',
        isSystem: true
    });

    addTimeline({ source: 'sistema', text: `Configuração: ${setupAnswers.dificuldade}, ${setupAnswers.jogadores} jogador(es), ${setupAnswers.periodo}.` });
    updateTurnUI();
}

async function sendToGemini({ message, history }) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na comunicação com o servidor.');
    return data.text;
}

// ==============================
// MURAL
// ==============================

function renderMural() {
    mural.innerHTML = '';

    if (creatingFolderMode) {
        const helper = document.createElement('div');
        helper.className = 'system-msg';
        helper.textContent = '[SISTEMA]: Clique em uma pasta nova para nomeá-la (1º clique) e clique novamente para abrir (2º clique).';
        mural.appendChild(helper);
    }

    if (activeFolderId === '__storage__') {
        mural.classList.add('folder-open');
        backFolderBtn.classList.remove('hidden');
        caseData.storageFolders
            .filter(folder => matchesSearch(folder.name))
            .forEach(folder => {
                const card = document.createElement('div');
                card.className = 'folder-card';
                card.textContent = `📁 ${folder.name} (${folder.notes.length})`;
                card.onclick = () => {
                    activeFolderId = folder.id;
                    renderMural();
                };
                mural.appendChild(card);
            });
        return;
    }

    if (activeFolderId) {
        mural.classList.add('folder-open');
        backFolderBtn.classList.remove('hidden');

        const folder = [...caseData.activeFolders, ...caseData.storageFolders].find(f => f.id === activeFolderId);
        if (!folder) {
            activeFolderId = null;
            renderMural();
            return;
        }

        folder.notes.filter(note => matchesSearch(note)).forEach(note => {
            const card = document.createElement('div');
            card.className = 'evidence-card folder-note';
            card.textContent = `• ${note}`;
            mural.appendChild(card);
        });
        return;
    }

    mural.classList.remove('folder-open');
    backFolderBtn.classList.add('hidden');

    caseData.activeFolders.filter(folder => matchesSearch(folder.name)).forEach(folder => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.textContent = `📁 ${folder.name} (${folder.notes.length})`;

        card.onclick = () => {
            if (!folder.named) {
                const newName = prompt('Nome da pasta:')?.trim();
                if (newName) {
                    folder.name = newName;
                    folder.named = true;
                    persistCaseData();
                    renderMural();
                    addTimeline({ source: 'mural', text: `Pasta nomeada: ${newName}.` });
                }
                return;
            }

            activeFolderId = folder.id;
            renderMural();
        };

        mural.appendChild(card);
    });

    caseData.rootEvidence.filter(item => matchesSearch(item)).forEach(item => {
        const card = document.createElement('div');
        card.className = 'evidence-card';
        card.textContent = item.toUpperCase();
        mural.appendChild(card);
    });
}

function createFolder() {
    if (caseData.status === 'closed') {
        showToast('Reabra o caso para criar novas pastas.');
        return;
    }

    const id = `folder_${Date.now()}`;
    caseData.activeFolders.unshift({ id, name: 'Nova Pasta', named: false, notes: [] });
    creatingFolderMode = true;
    persistCaseData();
    renderMural();
    addTimeline({ source: 'mural', text: 'Nova pasta criada.' });
}

function toggleCaseStatus() {
    if (caseData.status === 'open') {
        caseData.storageFolders = [...caseData.storageFolders, ...caseData.activeFolders.map(f => ({ ...f, named: true }))];
        caseData.activeFolders = [];
        activeFolderId = null;
        creatingFolderMode = false;

        Object.keys(contactChats).forEach(key => delete contactChats[key]);
        Object.keys(contactUiMessages).forEach(key => delete contactUiMessages[key]);

        caseData.status = 'closed';
        appendLogEntry({ text: '[SISTEMA]: Caso encerrado. Pastas movidas ao armazenamento e chats dos peritos apagados.', cssClass: 'system-msg', isSystem: true });
        addTimeline({ source: 'sistema', text: 'Caso encerrado.' });
    } else {
        caseData.status = 'open';
        appendLogEntry({ text: '[SISTEMA]: Caso reaberto.', cssClass: 'system-msg', isSystem: true });
        addTimeline({ source: 'sistema', text: 'Caso reaberto.' });
    }

    updateCaseStatusUI();
    persistCaseData();
    renderMural();
}

function exportDossier() {
    const blob = new Blob([JSON.stringify(caseData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossie-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Dossiê exportado.');
}

function importDossier(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            caseData.activeFolders = Array.isArray(parsed.activeFolders) ? parsed.activeFolders : [];
            caseData.storageFolders = Array.isArray(parsed.storageFolders) ? parsed.storageFolders : [];
            caseData.rootEvidence = Array.isArray(parsed.rootEvidence) ? parsed.rootEvidence : [];
            caseData.timeline = Array.isArray(parsed.timeline) ? parsed.timeline : [];
            caseData.status = parsed.status === 'closed' ? 'closed' : 'open';
            caseData.theme = parsed.theme === 'light' ? 'light' : 'dark';
            caseData.turn = Number.isInteger(parsed.turn) ? parsed.turn : 1;
            caseData.timeSlot = typeof parsed.timeSlot === 'string' ? parsed.timeSlot : 'Noite';
            caseData.stats = parsed.stats && typeof parsed.stats === 'object'
                ? { t: clampPercent(parsed.stats.t ?? 10), v: clampPercent(parsed.stats.v ?? 5), c: clampPercent(parsed.stats.c ?? 90) }
                : { t: 10, v: 5, c: 90 };
            caseData.specialistTrust = parsed.specialistTrust && typeof parsed.specialistTrust === 'object' ? parsed.specialistTrust : {};

            evidenciasColetadas.clear();
            caseData.rootEvidence.forEach(item => evidenciasColetadas.add(item));
            [...caseData.activeFolders, ...caseData.storageFolders].forEach(folder => folder.notes.forEach(n => evidenciasColetadas.add(n)));

            ensureSpecialistTrust();
            updateCaseStatusUI();
            updateTurnUI();
            renderStatsFromState();
            applyTheme();
            persistCaseData();
            renderTimeline();
            renderMural();
            renderContactList();
            showToast('Dossiê importado com sucesso.');
        } catch {
            showToast('Arquivo inválido para importação.');
        }
    };

    reader.readAsText(file);
}

// ==============================
// CHAT PRINCIPAL
// ==============================

async function sendMessage(text) {
    if (!text) return;

    if (caseData.status === 'closed') {
        appendLogEntry({ text: '[SISTEMA]: Caso encerrado. Reabra o caso para continuar investigando.', cssClass: 'system-msg', isSystem: true });
        return;
    }

    appendLogEntry({ speaker: '> INVESTIGADOR', text, cssClass: 'investigator-talk' });
    addTimeline({ source: 'investigador', text });

    if (!sessionConfigured) {
        handleSetupInput(text);
        return;
    }

    setLoading(true);

    try {
        const rawText = await sendToGemini({ message: text, history: chatHistory });
        const { cleanedText, items } = extractEvidenceItems(rawText);

        chatHistory.push(
            { role: 'user', parts: [{ text }] },
            { role: 'model', parts: [{ text: rawText }] }
        );

        items.forEach(item => addEvidenceToCase(item, 'mestre'));

        const { textNode } = appendLogEntry({ speaker: 'MESTRE', text: '', cssClass: 'npc-talk' });
        await typeText(textNode, ` ${cleanedText}`);
        addTimeline({ source: 'mestre', text: cleanedText.slice(0, 120) });
    } catch (error) {
        appendLogEntry({ text: `ERRO: ${error.message}`, cssClass: 'system-msg', isSystem: true });
    } finally {
        setLoading(false);
        userInput.focus();
    }
}

// ==============================
// CONTATOS / POPUP
// ==============================

function renderContactList() {
    peritoList.innerHTML = '';

    specialists.forEach(spec => {
        const card = document.createElement('button');
        card.className = 'perito';
        card.innerHTML = `
            <div class="contact-emoji">${spec.emoji}</div>
            <div>
                <div class="contact-name">${spec.nome}</div>
                <div class="contact-role">${spec.profissao}</div>
                <div class="contact-role">Confiança: ${caseData.specialistTrust[spec.id]}%</div>
            </div>
        `;

        card.onclick = () => openContactChat(spec.id);
        peritoList.appendChild(card);
    });
}

function getContactHistory(spec) {
    if (!contactChats[spec.id]) {
        const prompt = `Você é ${spec.nome}, ${spec.profissao}, um NPC consultor de investigação.
Responda de forma objetiva e útil.
Sempre que houver algo relevante, inclua no final [[EVIDENCIAS=item1;item2]].
Se não houver evidência, use [[EVIDENCIAS=]].`;

        contactChats[spec.id] = [{ role: 'user', parts: [{ text: prompt }] }];
    }

    if (!contactUiMessages[spec.id]) {
        contactUiMessages[spec.id] = [{ sender: 'npc', text: `Conexão aberta com ${spec.nome}.` }];
    }

    return contactChats[spec.id];
}

function renderSelectedContactHistory() {
    contactChatLog.innerHTML = '';
    const messages = contactUiMessages[selectedContact.id] || [];
    messages.forEach(msg => appendContactBubble(msg.text, msg.sender));
}

function openContactChat(id) {
    selectedContact = specialists.find(sp => sp.id === id);
    if (!selectedContact) return;

    contactSelectedEmoji.textContent = selectedContact.emoji;
    contactSelectedName.textContent = selectedContact.nome;
    contactSelectedRole.textContent = selectedContact.profissao;
    contactTrustEl.textContent = `Confiança: ${caseData.specialistTrust[selectedContact.id]}%`;

    getContactHistory(selectedContact);

    contactListView.classList.add('hidden');
    contactChatView.classList.remove('hidden');

    renderSelectedContactHistory();
    contactChatInput.focus();
}

function backToContactList() {
    selectedContact = null;
    contactChatInput.value = '';
    contactListView.classList.remove('hidden');
    contactChatView.classList.add('hidden');
}

async function sendContactMessage() {
    const text = contactChatInput.value.trim();
    if (!text || !selectedContact) return;

    if (caseData.status === 'closed') {
        appendContactBubble('Caso encerrado. Reabra o caso para continuar.', 'npc');
        return;
    }

    contactChatInput.value = '';
    appendContactBubble(text, 'user');
    contactUiMessages[selectedContact.id].push({ sender: 'user', text });
    addTimeline({ source: selectedContact.nome, text: `Jogador: ${text}` });

    const history = getContactHistory(selectedContact);

    try {
        const rawText = await sendToGemini({ message: text, history });
        const { cleanedText, items } = extractEvidenceItems(rawText);

        history.push(
            { role: 'user', parts: [{ text }] },
            { role: 'model', parts: [{ text: rawText }] }
        );

        items.forEach(item => addEvidenceToCase(item, selectedContact.nome));

        const bubble = appendContactBubble('', 'npc');
        await typeBubbleText(bubble, cleanedText);
        contactUiMessages[selectedContact.id].push({ sender: 'npc', text: cleanedText });
        addTimeline({ source: selectedContact.nome, text: cleanedText.slice(0, 120) });
        adjustTrust(selectedContact.id, 3);
    } catch (error) {
        appendContactBubble(`Erro: ${error.message}`, 'npc');
        adjustTrust(selectedContact.id, -2);
    }
}

function openContactsPopup() {
    popup.classList.remove('hidden');
    if (selectedContact) {
        contactChatInput.focus();
    } else {
        peritoList.querySelector('button.perito')?.focus();
    }
}

function closeContactsPopup() {
    popup.classList.add('hidden');
    backToContactList();
    peritosBtn.focus();
}

// ==============================
// EVENTOS
// ==============================

window.addEventListener('load', () => {
    loadCaseData();

    caseData.rootEvidence.forEach(item => evidenciasColetadas.add(item));
    [...caseData.activeFolders, ...caseData.storageFolders].forEach(folder => folder.notes.forEach(note => evidenciasColetadas.add(note)));

    applyTheme();
    ensureSpecialistTrust();
    updateCaseStatusUI();
    updateTurnUI();
    renderStatsFromState();
    renderTimeline();
    renderMural();
    renderContactList();

    userInput.placeholder = 'Responda a configuração inicial para começar...';
    askCurrentSetupQuestion();

    sendBtn?.addEventListener('click', () => {
        const text = userInput.value.trim();
        if (!text) return;

        userInput.value = '';
        sendMessage(text);
    });

    userInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendBtn.click();
        }
    });

    peritosBtn?.addEventListener('click', openContactsPopup);
    closePopupBtn?.addEventListener('click', closeContactsPopup);

    popup?.addEventListener('click', event => {
        if (event.target === popup) {
            closeContactsPopup();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !popup.classList.contains('hidden')) {
            closeContactsPopup();
        }
    });

    contactBackBtn?.addEventListener('click', backToContactList);
    contactSendBtn?.addEventListener('click', sendContactMessage);
    contactChatInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendContactMessage();
        }
    });

    createFolderBtn?.addEventListener('click', createFolder);
    backFolderBtn?.addEventListener('click', () => {
        activeFolderId = null;
        creatingFolderMode = false;
        renderMural();
    });

    storageBtn?.addEventListener('click', () => {
        activeFolderId = '__storage__';
        renderMural();
    });

    finishCaseBtn?.addEventListener('click', toggleCaseStatus);

    muralSearchInput?.addEventListener('input', event => {
        muralSearchTerm = normalizedSearch(event.target.value);
        renderMural();
    });

    quickActionsEl?.addEventListener('click', event => {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        applyQuickAction(actionBtn.dataset.action);
    });

    themeBtn?.addEventListener('click', () => {
        caseData.theme = caseData.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        persistCaseData();
    });

    exportBtn?.addEventListener('click', exportDossier);
    importBtn?.addEventListener('click', () => importFileInput.click());
    importFileInput?.addEventListener('change', event => importDossier(event.target.files[0]));

    ambientSound?.play().catch(() => {
        // A maioria dos navegadores bloqueia autoplay sem interação.
    });
});
