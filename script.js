import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ==============================
// CONFIGURAÇÃO
// ==============================
const API_KEY_CHAT = "CAIzaSyD3jgUc0QuF6LPS-8i3xb0ajZfcmu_Eikc"; // <--- COLOQUE SUA CHAVE AQUI

const genAI = new GoogleGenerativeAI(API_KEY_CHAT);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const systemPrompt = `Você é o Mestre de um RPG Noir de investigação. 
O clima é sério, sombrio e realista. 
REGRAS:
1. Gerencie 3 atributos: Tensão (T), Visibilidade (V) e Credibilidade (C).
2. Se o jogador encontrar uma pista real, adicione-a à lista de EVIDENCIAS.
3. Use o formato fixo no final da resposta: [[STATS: T=x, V=x, C=x, EVIDENCIAS=item1;item2]]
4. Mantenha as respostas concisas e atmosféricas.`;

// ==============================
// ESTADO E ELEMENTOS
// ==============================
let evidenciasColetadas = new Set();
const log = document.getElementById('log');
const typingIndicator = document.getElementById('typing-indicator');
const mural = document.getElementById('mural');

let chat = model.startChat({
    history: [{ role: "user", parts: [{ text: systemPrompt }] }],
});

// ==============================
// LÓGICA PRINCIPAL
// ==============================

async function sendMessage(text) {
    if(!text) return;

    // UI: Mensagem do Jogador
    log.innerHTML += `<div class="entry"><strong>> INVESTIGADOR:</strong> ${text}</div>`;
    typingIndicator.classList.remove('hidden');
    log.scrollTop = log.scrollHeight;

    try {
        const result = await chat.sendMessage(text);
        const response = await result.response;
        const cleanText = updateInterface(response.text());

        // UI: Resposta do Mestre
        log.innerHTML += `<div class="entry npc-talk"><strong>MESTRE:</strong><br>${cleanText}</div>`;
    } catch (e) {
        log.innerHTML += `<div class="entry system-msg">ERRO DE CONEXÃO: ${e.message}</div>`;
    } finally {
        typingIndicator.classList.add('hidden');
        log.scrollTop = log.scrollHeight;
    }
}

function updateInterface(text) {
    const regex = /\[\[STATS: T=(\d+), V=(\d+), C=(\d+), EVIDENCIAS=(.*)\]\]/;
    const match = text.match(regex);

    if (match) {
        const [_, t, v, c, evStr] = match;

        // Atualiza Barras
        document.getElementById('t-bar').style.width = t + '%';
        document.getElementById('t-val').innerText = t + '%';
        document.getElementById('v-bar').style.width = v + '%';
        document.getElementById('v-val').innerText = v + '%';
        document.getElementById('c-bar').style.width = c + '%';
        document.getElementById('c-val').innerText = c + '%';

        // Atualiza Mural (Sem duplicatas)
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
document.getElementById('send-btn').onclick = () => {
    const input = document.getElementById('userInput');
    sendMessage(input.value);
    input.value = '';
};

document.getElementById('userInput').onkeypress = (e) => {
    if (e.key === 'Enter') document.getElementById('send-btn').click();
};

document.getElementById('peritos-btn').onclick = () => document.getElementById('peritos-popup').classList.remove('hidden');
document.getElementById('close-popup').onclick = () => document.getElementById('peritos-popup').classList.add('hidden');