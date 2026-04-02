import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateGameCode(prompt: string, type: '2D' | '3D') {
  const systemInstruction = `You are an expert game developer. 
  Generate a single-file HTML/Javascript game based on the user's prompt.
  If type is 2D, use Canvas API or simple DOM elements.
  If type is 3D, use Three.js (assume it's available via CDN or global script).
  The code must be self-contained and playable.
  Return ONLY the HTML code, including <script> and <style> tags.
  Do not include any markdown formatting like \`\`\`html.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a ${type} game: ${prompt}`,
    config: {
      systemInstruction,
    },
  });

  return response.text || "";
}
