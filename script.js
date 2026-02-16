// ==============================
// CONFIGURAÇÃO
// ==============================

const systemPrompt = `Você é o Mestre de um RPG Noir de investigação. 
O clima é sério, sombrio e realista. 
REGRAS:
1. Gerencie 3 atributos: Tensão (T), Visibilidade (V) e Credibilidade (C).
2. Se o jogador encontrar uma pista real, adicione-a à lista de EVIDENCIAS.
3. Use o formato fixo no final da resposta: [[STATS: T=x, V=x, C=x, EVIDENCIAS=item1;item2]]
4. Mantenha as respostas concisas e atmosféricas.`;

// ==============================
// ESTADO
// ==============================

let evidenciasColetadas = new Set();
let chatHistory = [
  { role: "user", parts: [{ text: systemPrompt }] }
];

const log = document.getElementById('log');
const typingIndicator = document.getElementById('typing-indicator');
const mural = document.getElementById('mural');

// ==============================
// FUNÇÃO PRINCIPAL
// ==============================

async function sendMessage(text) {
    if (!text) return;

    log.innerHTML += `<div class="entry"><strong>> INVESTIGADOR:</strong> ${text}</div>`;
    typingIndicator.classList.remove('hidden');
    log.scrollTop = log.scrollHeight;

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                history: chatHistory
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        const cleanText = updateInterface(data.text);

        chatHistory.push(
            { role: "user", parts: [{ text }] },
            { role: "model", parts: [{ text: data.text }] }
        );

        log.innerHTML += `<div class="entry npc-talk"><strong>MESTRE:</strong><br>${cleanText}</div>`;

    } catch (e) {
        log.innerHTML += `<div class="entry system-msg">ERRO: ${e.message}</div>`;
    } finally {
        typingIndicator.classList.add('hidden');
        log.scrollTop = log.scrollHeight;
    }
}

// ==============================
// ATUALIZA INTERFACE
// ==============================

function updateInterface(text) {
    const regex = /\[\[STATS: T=(\d+), V=(\d+), C=(\d+), EVIDENCIAS=(.*)\]\]/;
    const match = text.match(regex);

    if (match) {
        const [_, t, v, c, evStr] = match;

        document.getElementById('t-bar').style.width = t + '%';
        document.getElementById('t-val').innerText = t + '%';

        document.getElementById('v-bar').style.width = v + '%';
        document.getElementById('v-val').innerText = v + '%';

        document.getElementById('c-bar').style.width = c + '%';
        document.getElementById('c-val').innerText = c + '%';

        const itens = evStr.split(';').map(i => i.trim()).filter(i => i !== '');
        itens.forEach(item => {
            if (!evidenciasColetadas.has(item)) {
                evidenciasColetadas.add(item);
                const card = document.createElement('div');
                card.className = 'evidence-card';
                card.innerText = item.toUpperCase();
                mural.appendChild(card);
            }
        });

        return text.replace(regex, '').trim();
    }
    return text;
}

// ==============================
// EVENTOS
// ==============================

window.addEventListener('load', () => {
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('userInput');

    if (sendBtn) {
        sendBtn.onclick = () => {
            const text = userInput.value.trim();
            if (text) {
                sendMessage(text);
                userInput.value = '';
            }
        };
    }

    if (userInput) {
        userInput.onkeypress = (e) => {
            if (e.key === 'Enter') sendBtn.click();
        };
    }
});
