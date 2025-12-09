"use strict";
// src/options.ts
const apiKeyInput = document.getElementById('apiKey');
const promptInput = document.getElementById('systemPrompt');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
const DEFAULT_PROMPT = `
You are a content moderation AI.
Analyze the tweet for:
1. Hate speech / Harassment
2. Excessive toxicity or aggression
3. Political baiting / Divisive content
4. Spam / Scam

If matches, return JSON {"isBad": true, "reason": "Short reason in Japanese"}.
Otherwise {"isBad": false}.
`.trim();
const saveOptions = () => {
    const apiKey = apiKeyInput.value.trim();
    const systemPrompt = promptInput.value.trim();
    chrome.storage.local.set({
        geminiApiKey: apiKey,
        vibeSystemPrompt: systemPrompt
    }, () => {
        statusDiv.textContent = '✅ Configuration Saved!';
        setTimeout(() => {
            statusDiv.textContent = '';
        }, 2000);
    });
};
const restoreOptions = () => {
    chrome.storage.local.get(['geminiApiKey', 'vibeSystemPrompt'], (items) => {
        // 取得した items を VibeSettings 型として扱うように指示（キャスト）
        const settings = items;
        if (settings.geminiApiKey) {
            apiKeyInput.value = settings.geminiApiKey;
        }
        if (settings.vibeSystemPrompt) {
            promptInput.value = settings.vibeSystemPrompt;
        }
        else {
            promptInput.value = DEFAULT_PROMPT;
        }
    });
};
document.addEventListener('DOMContentLoaded', restoreOptions);
saveBtn.addEventListener('click', saveOptions);
