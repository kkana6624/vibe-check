// ★ここにGoogle AI Studioで取得したキーを入れてください
// ※注意: git等にコミットしないよう、本来は環境変数や別ファイル管理が推奨です
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
// モデルを 'gemini-2.5-flash' に指定
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'CHECK_VIBE') {
        // 非同期処理の結果を返すため、必ず true をreturnする
        checkVibeWithGemini(message.text).then(sendResponse);
        return true;
    }
});
/**
 * Gemini 2.5 Flash を利用してテキストを判定する
 */
async function checkVibeWithGemini(text) {
    // プロンプトエンジニアリング: 役割と出力形式を厳密に指定
    const systemInstruction = `
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
    const userPrompt = `Text to analyze: "${text.replace(/"/g, '\\"')}"`;
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                        role: "user",
                        parts: [{ text: systemInstruction + "\n" + userPrompt }]
                    }],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.1 // 判定のブレを減らすため低めに設定
                }
            })
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const rawJSON = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJSON)
            throw new Error("No content in response");
        const result = JSON.parse(rawJSON);
        return {
            isBadVibe: result.isBad,
            reason: result.reason || "Detected by AI"
        };
    }
    catch (error) {
        console.error("Gemini VibeCheck Error:", error);
        // エラー時はブロックせず通す（Fail Open）設計
        return { isBadVibe: false, error: String(error) };
    }
}
console.log("VibeCheck Background Service (Gemini 2.5 Flash) Started.");
export {};
