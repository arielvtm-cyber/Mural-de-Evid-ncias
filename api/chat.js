import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

function modelCandidates() {
  const preferred = process.env.GEMINI_MODEL?.trim();
  if (!preferred) return DEFAULT_MODELS;

  return [preferred, ...DEFAULT_MODELS.filter(model => model !== preferred)];
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
    }

    const { message, history = [] } = req.body ?? {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Mensagem inválida.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const safeHistory = Array.isArray(history) ? history : [];

    let lastError;

    for (const modelName of modelCandidates()) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const chat = model.startChat({ history: safeHistory });
        const result = await chat.sendMessage(message);
        const response = await result.response;

        return res.status(200).json({ text: response.text(), model: modelName });
      } catch (error) {
        lastError = error;
      }
    }

    return res.status(500).json({
      error: `Falha ao chamar os modelos configurados. Último erro: ${lastError?.message || 'desconhecido'}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno no servidor.' });
  }
}