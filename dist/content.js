"use strict";
// src/content.ts
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXT_SELECTOR = 'div[data-testid="tweetText"]';
/**
 * ボタンを作成してツイートに追加する関数
 */
const addBlockButton = (article) => {
    // ボタン要素を作成
    const button = document.createElement('button');
    button.innerText = '🚫'; // アイコン（後でカッコよくしましょう）
    button.title = 'VibeCheck Block'; // ホバー時のテキスト
    // スタイル適用（暫定的にインラインスタイルで絶対配置）
    Object.assign(button.style, {
        position: 'absolute',
        top: '5px',
        right: '5px',
        zIndex: '9999',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        color: 'white',
        padding: '2px 6px',
        fontSize: '12px',
        fontWeight: 'bold',
    });
    // クリックイベント（仮実装）
    button.onclick = (e) => {
        e.stopPropagation(); // ツイート自体のクリック（詳細表示）を防ぐ
        e.preventDefault();
        // とりあえず画面から消すデモ
        const confirmBlock = confirm('このツイートをVibeCheckしますか？\n（現時点では画面から消えるだけです）');
        if (confirmBlock) {
            article.style.display = 'none';
            console.log('🚮 Manually removed tweet.');
        }
    };
    // ツイート要素自体に position: relative を設定しないと、
    // 絶対配置(absolute)の基準がズレるため設定
    // ※既存のスタイルを壊さないよう注意が必要ですが、articleなら概ね大丈夫です
    article.style.position = 'relative';
    // DOMに追加
    article.appendChild(button);
};
const processTweet = (article) => {
    if (article.dataset.vibeChecked)
        return;
    article.dataset.vibeChecked = 'true';
    const textElement = article.querySelector(TWEET_TEXT_SELECTOR);
    // ボタンを追加（ここを追加！）
    addBlockButton(article);
    if (textElement) {
        const text = textElement.innerText;
        // ログは少し静かにしておきます
        // console.log('VibeCheck scanning:', text.substring(0, 10) + '...');
    }
};
// --- 以下、MutationObserverは前回と同じ ---
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
