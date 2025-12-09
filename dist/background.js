"use strict";
// src/background.ts
// デフォルトプロンプト（設定が空の場合のフォールバック）
const DEFAULT_SYSTEM_PROMPT = `
You are a content moderation AI for a timeline filter.
Your task is to analyze the given tweet and determine if it matches specific "negative vibes".
Target negative vibes:
1. Hate speech or harassment.
2. Excessive aggression or toxicity.
3. Overly divisive political bait.
4. Spam or scam patterns.
If the text matches any of these, set "isBad" to true and provide a short "reason" (in Japanese).
If it is ambiguous or safe, set "isBad" to false.
`;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'CHECK_VIBE') {
        checkVibeWithGemini(message.text).then(sendResponse);
        return true;
    }
});
async function checkVibeWithGemini(text) {
    // 1. ストレージから設定を取得
    const config = await chrome.storage.local.get(['geminiApiKey', 'vibeSystemPrompt']);
    const apiKey = config.geminiApiKey;
    const systemPrompt = config.vibeSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    // APIキー未設定時のハンドリング
    if (!apiKey) {
        console.warn("VibeCheck: API Key is missing.");
        return { isBadVibe: false, error: "API Key missing" };
    }
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const userPrompt = `Text to analyze: "${text.replace(/"/g, '\\"')}"`;
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                        role: "user",
                        parts: [{ text: systemPrompt + "\n" + userPrompt }]
                    }],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.1
                }
            })
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        const rawJSON = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJSON)
            throw new Error("No content");
        const result = JSON.parse(rawJSON);
        return { isBadVibe: result.isBad, reason: result.reason };
    }
    catch (error) {
        console.error("Gemini VibeCheck Error:", error);
        return { isBadVibe: false, error: String(error) };
    }
}
console.log("VibeCheck Background Service Started.");
