"use strict";
// src/background.ts
/**
 * ★ 1. JSON出力強制プロンプト (変更不可の定数)
 * Geminiが確実にJSONだけを返すように指示します
 */
const JSON_ENFORCEMENT_PROMPT = `
IMPORTANT OUTPUT INSTRUCTION:
You must return the result in valid JSON format.
Do not include any Markdown formatting (like \`\`\`json).
Output format: {"isBad": boolean, "reason": "Short reason in Japanese"}
If the content is safe, "isBad" must be false.
`.trim();
/**
 * ★ 2. 判定基準プリセット (選択式)
 * ユーザーは設定画面でこの中からモードを選びます
 */
const PROMPT_PRESETS = {
    standard: `
    You are a content moderation AI.
    Target negative vibes:
    1. Hate speech / Harassment
    2. Excessive toxicity or aggression
    3. Spam / Scam
    If ambiguous, lean towards "safe" (allow).
  `,
    strict: `
    You are a strict content moderation AI.
    Target negative vibes:
    1. Hate speech / Harassment / Insults
    2. Toxicity, Sarcasm, or Aggression
    3. Political baiting / Divisive content
    4. Spam / Scam / NSFW
    If ambiguous, lean towards "bad" (block).
  `,
    politics: `
    You are a timeline filter focused on removing political noise.
    Target negative vibes:
    1. Political debates / Policy criticism
    2. Social issues causing division
    3. Ideological confrontation
    Other casual conversations are safe.
  `
};
// メッセージリスナー: Content Scriptからのリクエストを受け付けます
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'CHECK_VIBE') {
        // 非同期処理の結果を返すため、Promiseチェーンをつなぎ、最後に true を返します
        checkVibeWithGemini(message.text).then(sendResponse);
        return true;
    }
});
/**
 * Gemini API を呼び出して判定を行うメイン関数
 */
async function checkVibeWithGemini(text) {
    // 1. ストレージから設定を取得
    // - geminiApiKey: APIキー
    // - promptMode: 判定モード (standard/strict/politics)
    // - badExamples: ユーザーが学習させたNGツイートのリスト
    const config = await chrome.storage.local.get(['geminiApiKey', 'promptMode', 'badExamples']);
    const apiKey = config.geminiApiKey;
    if (!apiKey) {
        console.warn("VibeCheck: API Key is missing.");
        return { isBadVibe: false, error: "API Key missing" };
    }
    // 2. モード選択（デフォルトは standard）
    const mode = config.promptMode || 'standard';
    const baseCriteria = PROMPT_PRESETS[mode] || PROMPT_PRESETS['standard'];
    // 3. 学習データ (Few-Shot Learning) の注入
    const badExamples = config.badExamples || [];
    let examplesPrompt = "";
    if (badExamples.length > 0) {
        examplesPrompt = `\n\nSpecific patterns to BLOCK (User defined):\n` +
            badExamples.map(ex => `- "${ex.replace(/"/g, '')}"`).join('\n');
    }
    // 4. 最終プロンプト結合: [基準] + [学習例] + [JSON強制]
    const systemPrompt = baseCriteria + examplesPrompt + "\n\n" + JSON_ENFORCEMENT_PROMPT;
    const userPrompt = `Text to analyze: "${text.replace(/"/g, '\\"')}"`;
    // モデル指定 (gemini-2.5-flash または 1.5-flash)
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
                    temperature: 0.1 // 判定のブレを抑えるため低めに設定
                }
            })
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // レスポンス解析
        const rawJSON = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJSON)
            throw new Error("No content in response");
        // Markdown記法 (```json ... ```) が含まれている場合の除去処理
        const cleanJSON = rawJSON.replace(/```json|```/g, '').trim();
        const result = JSON.parse(cleanJSON);
        return { isBadVibe: result.isBad, reason: result.reason };
    }
    catch (error) {
        console.error("Gemini VibeCheck Error:", error);
        // エラー時はユーザー体験を損なわないよう「問題なし」として返す (Fail Open)
        return { isBadVibe: false, error: String(error) };
    }
}
console.log("VibeCheck Background Service Started.");
