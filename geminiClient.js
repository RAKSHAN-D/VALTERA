//const API_KEY = "AIzaSyCzu7ZIViorCUHYgK4SzB8xPjpfzd1SVP0";  // Replace this with your real API key
// gemini.js 

import { GoogleGenerativeAI } from "@google/generative-ai";

// Your Gemini API Key
const API_KEY =  "AIzaSyCzu7ZIViorCUHYgK4SzB8xPjpfzd1SVP0";  // Replace this with your real API key
const genAI = new GoogleGenerativeAI(API_KEY);

export async function generateGeminiContent(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return responseText;
  } catch (err) {
    console.error("Gemini API Error:", err);
    return "⚠️ Failed to get AI response.";
  }
}