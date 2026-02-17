import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = 'gemini-2.0-flash';

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

    const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const chat = model.startChat({ history: Array.isArray(history) ? history : [] });
    const result = await chat.sendMessage(message);
    const response = await result.response;

    return res.status(200).json({ text: response.text(), model: modelName });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno no servidor.' });
  }
}
