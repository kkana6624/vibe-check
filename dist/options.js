"use strict";
// src/options.ts
// HTML要素の取得
const apiKeyInput = document.getElementById('apiKey');
// 変更: Textarea要素ではなくSelect要素として取得
const modeSelect = document.getElementById('promptMode');
const blockAdsCheckbox = document.getElementById('blockAds');
const badExamplesInput = document.getElementById('badExamples');
const trustedUsersInput = document.getElementById('trustedUsers');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
/**
 * 設定を保存する関数
 */
const saveOptions = () => {
    // テキストエリアの改行区切りを配列に変換
    const badExamples = badExamplesInput.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s); // 空行除去
    // ユーザー名は @ 付きで統一
    const trustedUsers = trustedUsersInput.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => {
        if (!s)
            return false;
        return s.startsWith('@') ? s : '@' + s;
    });
    // Chromeストレージに保存
    chrome.storage.local.set({
        geminiApiKey: apiKeyInput.value.trim(),
        promptMode: modeSelect.value, // 選択されたモード (standard / strict / politics)
        blockAds: blockAdsCheckbox.checked,
        badExamples: badExamples,
        trustedUsers: trustedUsers
    }, () => {
        // 保存完了メッセージ
        statusDiv.textContent = '✅ Configuration Saved!';
        setTimeout(() => {
            statusDiv.textContent = '';
        }, 2000);
    });
};
/**
 * 設定を読み込んで画面に反映する関数
 */
const restoreOptions = () => {
    chrome.storage.local.get(['geminiApiKey', 'promptMode', 'blockAds', 'badExamples', 'trustedUsers'], (items) => {
        // 型アサーション
        const settings = items;
        // APIキー
        if (settings.geminiApiKey) {
            apiKeyInput.value = settings.geminiApiKey;
        }
        // モード復元 (未設定なら standard)
        modeSelect.value = settings.promptMode || 'standard';
        // 広告ブロック (未設定なら false)
        blockAdsCheckbox.checked = settings.blockAds ?? false;
        // 学習データ (配列 -> 改行区切りテキスト)
        const badExamples = settings.badExamples ?? [];
        badExamplesInput.value = badExamples.join('\n');
        // ホワイトリスト
        const trustedUsers = settings.trustedUsers ?? [];
        trustedUsersInput.value = trustedUsers.join('\n');
    });
};
// イベントリスナー登録
document.addEventListener('DOMContentLoaded', restoreOptions);
saveBtn.addEventListener('click', saveOptions);
