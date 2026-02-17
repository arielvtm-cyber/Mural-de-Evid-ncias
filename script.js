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
const STORAGE_KEY = 'mural_case_data_v2';

// ==============================
// ESTADO
// ==============================

const evidenciasColetadas = new Set();
const chatHistory = [];
const contactChats = {};

let setupStepIndex = 0;
let sessionConfigured = false;
let selectedContact = null;
let creatingFolderMode = false;
let activeFolderId = null;

const setupAnswers = {
    dificuldade: '',
    jogadores: '',
    periodo: ''
};

const caseData = {
    activeFolders: [],
    storageFolders: [],
    rootEvidence: []
};

// ==============================
// ELEMENTOS
// ==============================

const log = document.getElementById('log');
const typingIndicator = document.getElementById('typing-indicator');
const mural = document.getElementById('mural');

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
const contactChatLog = document.getElementById('contact-chat-log');
const contactChatInput = document.getElementById('contact-chat-input');
const contactSendBtn = document.getElementById('contact-send-btn');

const createFolderBtn = document.getElementById('create-folder-btn');
const backFolderBtn = document.getElementById('back-folder-btn');
const storageBtn = document.getElementById('storage-btn');
const finishCaseBtn = document.getElementById('finish-case-btn');

// ==============================
// UTILITÁRIOS
// ==============================

function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    } catch {
        // ignora estado inválido
    }
}

function addEvidenceToCase(item) {
    const cleaned = item.trim();
    if (!cleaned || evidenciasColetadas.has(cleaned)) return;

    evidenciasColetadas.add(cleaned);

    if (activeFolderId) {
        const folder = caseData.activeFolders.find(f => f.id === activeFolderId);
        if (folder) {
            folder.notes.push(cleaned);
        }
    } else {
        caseData.rootEvidence.push(cleaned);
    }

    persistCaseData();
    renderMural();
}

function extractEvidenceItems(text) {
    const items = [];

    const statsRegex = /\[\[STATS:\s*T=(\d+),\s*V=(\d+),\s*C=(\d+),\s*EVIDENCIAS=(.*)\]\]/;
    const statsMatch = text.match(statsRegex);
    if (statsMatch) {
        const [, t, v, c, evStr] = statsMatch;

        document.getElementById('t-bar').style.width = `${clampPercent(t)}%`;
        document.getElementById('t-val').innerText = `${clampPercent(t)}%`;
        document.getElementById('v-bar').style.width = `${clampPercent(v)}%`;
        document.getElementById('v-val').innerText = `${clampPercent(v)}%`;
        document.getElementById('c-bar').style.width = `${clampPercent(c)}%`;
        document.getElementById('c-val').innerText = `${clampPercent(c)}%`;

        evStr.split(';').map(vl => vl.trim()).filter(Boolean).forEach(vl => items.push(vl));
        text = text.replace(statsRegex, '').trim();
    }

    const contactEvidenceRegex = /\[\[EVIDENCIAS=(.*?)\]\]/;
    const contactEvidenceMatch = text.match(contactEvidenceRegex);
    if (contactEvidenceMatch) {
        contactEvidenceMatch[1]
            .split(';')
            .map(vl => vl.trim())
            .filter(Boolean)
            .forEach(vl => items.push(vl));

        text = text.replace(contactEvidenceRegex, '').trim();
    }

    return { cleanedText: text, items };
}

function askCurrentSetupQuestion() {
    const question = setupQuestions[setupStepIndex];
    if (!question) return;

    appendLogEntry({
        text: `[SISTEMA]: ${question.prompt}`,
        cssClass: 'system-msg',
        isSystem: true
    });
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
        caseData.storageFolders.forEach(folder => {
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

        folder.notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'evidence-card folder-note';
            card.textContent = `• ${note}`;
            mural.appendChild(card);
        });
        return;
    }

    mural.classList.remove('folder-open');
    backFolderBtn.classList.add('hidden');

    caseData.activeFolders.forEach(folder => {
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
                }
                return;
            }

            activeFolderId = folder.id;
            renderMural();
        };

        mural.appendChild(card);
    });

    caseData.rootEvidence.forEach(item => {
        const card = document.createElement('div');
        card.className = 'evidence-card';
        card.textContent = item.toUpperCase();
        mural.appendChild(card);
    });
}

function createFolder() {
    const id = `folder_${Date.now()}`;
    caseData.activeFolders.unshift({ id, name: 'Nova Pasta', named: false, notes: [] });
    creatingFolderMode = true;
    persistCaseData();
    renderMural();
}

function finishCase() {
    caseData.storageFolders = [...caseData.storageFolders, ...caseData.activeFolders.map(f => ({ ...f, named: true }))];
    caseData.activeFolders = [];
    activeFolderId = null;
    creatingFolderMode = false;

    Object.keys(contactChats).forEach(key => {
        delete contactChats[key];
    });

    persistCaseData();
    renderMural();
    appendLogEntry({ text: '[SISTEMA]: Caso encerrado. Pastas enviadas ao armazenamento; chats dos peritos foram apagados.', cssClass: 'system-msg', isSystem: true });
}

// ==============================
// CHAT PRINCIPAL
// ==============================

async function sendMessage(text) {
    if (!text) return;

    appendLogEntry({ speaker: '> INVESTIGADOR', text, cssClass: 'investigator-talk' });

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

        items.forEach(addEvidenceToCase);

        const { textNode } = appendLogEntry({ speaker: 'MESTRE', text: '', cssClass: 'npc-talk' });
        await typeText(textNode, ` ${cleanedText}`);
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

    return contactChats[spec.id];
}

function openContactChat(id) {
    selectedContact = specialists.find(sp => sp.id === id);
    if (!selectedContact) return;

    contactSelectedEmoji.textContent = selectedContact.emoji;
    contactSelectedName.textContent = selectedContact.nome;
    contactSelectedRole.textContent = selectedContact.profissao;

    contactListView.classList.add('hidden');
    contactChatView.classList.remove('hidden');

    contactChatLog.innerHTML = '';
    appendContactBubble(`Conexão aberta com ${selectedContact.nome}.`, 'npc');
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

    contactChatInput.value = '';
    appendContactBubble(text, 'user');

    const history = getContactHistory(selectedContact);

    try {
        const rawText = await sendToGemini({ message: text, history });
        const { cleanedText, items } = extractEvidenceItems(rawText);

        history.push(
            { role: 'user', parts: [{ text }] },
            { role: 'model', parts: [{ text: rawText }] }
        );

        items.forEach(addEvidenceToCase);

        const bubble = appendContactBubble('', 'npc');
        await typeBubbleText(bubble, cleanedText);
    } catch (error) {
        appendContactBubble(`Erro: ${error.message}`, 'npc');
    }
}

// ==============================
// EVENTOS
// ==============================

window.addEventListener('load', () => {
    loadCaseData();

    caseData.rootEvidence.forEach(item => evidenciasColetadas.add(item));
    [...caseData.activeFolders, ...caseData.storageFolders].forEach(folder => {
        folder.notes.forEach(note => evidenciasColetadas.add(note));
    });

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

    peritosBtn?.addEventListener('click', () => popup.classList.remove('hidden'));
    closePopupBtn?.addEventListener('click', () => {
        popup.classList.add('hidden');
        backToContactList();
    });

    popup?.addEventListener('click', event => {
        if (event.target === popup) {
            popup.classList.add('hidden');
            backToContactList();
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
        if (activeFolderId === '__storage__') {
            activeFolderId = null;
            renderMural();
            return;
        }

        activeFolderId = null;
        creatingFolderMode = false;
        renderMural();
    });

    storageBtn?.addEventListener('click', () => {
        activeFolderId = '__storage__';
        renderMural();
    });

    finishCaseBtn?.addEventListener('click', finishCase);

    ambientSound?.play().catch(() => {
        // A maioria dos navegadores bloqueia autoplay sem interação.
    });
});
