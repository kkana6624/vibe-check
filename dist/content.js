"use strict";
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXT_SELECTOR = 'div[data-testid="tweetText"]';
const processTweet = async (article) => {
    if (article.dataset.vibeChecked)
        return;
    article.dataset.vibeChecked = 'true';
    const textElement = article.querySelector(TWEET_TEXT_SELECTOR);
    if (!textElement)
        return;
    const text = textElement.innerText;
    // 短すぎるツイートは無視（API節約）
    if (text.length < 5)
        return;
    // 解析中であることを示す（半透明にするなど）
    article.style.opacity = '0.5';
    // Backgroundにメッセージ送信
    const response = await chrome.runtime.sendMessage({
        action: 'CHECK_VIBE',
        text: text
    });
    // 判定完了
    article.style.opacity = '1.0';
    if (response.isBadVibe) {
        console.log(`💀 Blocked: ${text.substring(0, 20)}... Reason: ${response.reason}`);
        // 中身を隠して警告に差し替える
        article.style.backgroundColor = '#200'; // 暗い赤背景
        textElement.innerText = `[VibeCheck Blocked] ${response.reason}`;
        textElement.style.color = '#ccc';
        // 画像などを隠す
        const images = article.querySelectorAll('img');
        images.forEach(img => img.style.display = 'none');
    }
    else {
        // console.log(`✅ OK: ${text.substring(0, 10)}...`);
    }
};
// --- 以下、MutationObserverは変更なし ---
const observerCallback = (mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
                if (node.matches(TWEET_SELECTOR))
                    processTweet(node);
                const nestedTweets = node.querySelectorAll(TWEET_SELECTOR);
                nestedTweets.forEach((t) => processTweet(t));
            }
        });
    });
};
const observer = new MutationObserver(observerCallback);
observer.observe(document.body, { childList: true, subtree: true });
