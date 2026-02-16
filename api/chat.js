import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro"
    });

    const { message, history } = req.body;

    const chat = model.startChat({ history });

    const result = await chat.sendMessage(message);
    const response = await result.response;

    res.status(200).json({ text: response.text() });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
