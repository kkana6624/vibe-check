// src/content.ts

// --- キャッシュ用変数 ---
// key: tweetId, value: { isBad: boolean, reason: string }
// これにより、一度判定したツイートは二度とAPIに投げず、結果だけ即座に適用します
const vibeCache = new Map<string, { isBad: boolean, reason?: string }>();

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXT_SELECTOR = 'div[data-testid="tweetText"]';

/**
 * ツイート要素からユニークなID (status id) を抽出する関数
 * ツイートの日付リンク (例: /username/status/123456789) を探します
 */
const getTweetId = (article: HTMLElement): string | null => {
  // リンクの中に "/status/" を含むものを探す
  const timeLink = article.querySelector('a[href*="/status/"]');
  if (!timeLink) return null;

  const href = timeLink.getAttribute('href');
  if (!href) return null;

  // URL末尾の数字列をIDとして抽出
  const match = href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
};

/**
 * ブロック処理（完全隠蔽・カーテン方式）
 */
const applyBlockStyle = (article: HTMLElement, reason: string) => {
  // 既にブロック済みなら何もしない
  if (article.dataset.vibeBlocked === 'true') return;
  article.dataset.vibeBlocked = 'true';

  // 1. 親要素のスタイル調整（オーバーレイの基準位置にするため）
  article.style.position = 'relative';
  article.style.overflow = 'hidden'; // 角丸からはみ出ないように

  // 2. カーテン（オーバーレイ）要素の作成
  const curtain = document.createElement('div');
  
  // カーテンのスタイル（真っ黒に塗りつぶす設定）
  Object.assign(curtain.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: '#000000', // 完全な黒
    zIndex: '10', // 元のコンテンツより上に表示
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer', // クリックできることを示唆
    padding: '20px',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif' // Xのフォントに依存しない
  });

  // 3. カーテンの中に表示するメッセージ
  curtain.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 8px;">🚫 Restricted</div>
    <div style="font-size: 12px; color: #888;">[AI Reason] ${reason}</div>
    <div style="font-size: 10px; color: #444; margin-top: 12px;">(Click to reveal)</div>
  `;

  // 4. クリックしたら元に戻す（誤検知確認用）
  curtain.onclick = (e) => {
    e.stopPropagation(); // ツイート自体のクリックイベントを止める
    e.preventDefault();
    if (confirm('ブロックを一時的に解除して表示しますか？')) {
      curtain.remove(); // 幕を取り払う
      // 再度ブロックされないようにキャッシュを更新する処理が必要ならここで行う
      // 今回は一時的な解除なので、スクロールして戻ってきたらまたブロックされます
    }
  };

  // 5. DOMに追加
  article.appendChild(curtain);
};

const processTweet = async (article: HTMLElement) => {
  // 1. ツイートIDを取得
  const tweetId = getTweetId(article);
  if (!tweetId) return; // IDが取れない（プロモツイートなど特殊な構造）場合は無視

  // 2. キャッシュチェック
  if (vibeCache.has(tweetId)) {
    const cachedResult = vibeCache.get(tweetId)!;
    if (cachedResult.isBad && cachedResult.reason) {
      // 以前「黒」と判定されたやつが再レンダリングされた場合 → 即座に隠す
      applyBlockStyle(article, cachedResult.reason);
    }
    // 判定済み（白または黒）なので、APIリクエストは送らず終了
    return;
  }

  // --- ここから初見のツイートに対する処理 ---

  // 処理中フラグ（API多重送信防止）
  if (article.dataset.processing === 'true') return;
  article.dataset.processing = 'true';

  const textElement = article.querySelector(TWEET_TEXT_SELECTOR) as HTMLElement | null;
  if (!textElement) return;

  const text = textElement.innerText;
  
  // 短すぎるツイートはAPI節約のためスキップ（キャッシュには「白」として登録しておく）
  if (text.length < 5) {
    vibeCache.set(tweetId, { isBad: false });
    return;
  }

  // 解析中...
  article.style.opacity = '0.7';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_VIBE',
      text: text
    } as VibeCheckRequest) as VibeCheckResponse; // ※型定義のエラーが出る場合は as any で回避可

    // 3. 結果をキャッシュに保存
    vibeCache.set(tweetId, {
      isBad: response.isBadVibe,
      reason: response.reason
    });

    // 4. 結果の適用
    article.style.opacity = '1.0';
    delete article.dataset.processing;

    if (response.isBadVibe) {
      console.log(`💀 Blocked: ${text.substring(0, 15)}...`);
      applyBlockStyle(article, response.reason || 'Detected by AI');
    }

  } catch (err) {
    // エラー時はとりあえずスルー
    console.error(err);
    article.style.opacity = '1.0';
    delete article.dataset.processing;
  }
};

// --- MutationObserver (変更なし) ---
const observerCallback: MutationCallback = (mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        if (node.matches(TWEET_SELECTOR)) processTweet(node);
        const nestedTweets = node.querySelectorAll(TWEET_SELECTOR);
        nestedTweets.forEach((t) => processTweet(t as HTMLElement));
      }
    });
  });
};

const observer = new MutationObserver(observerCallback);
observer.observe(document.body, { childList: true, subtree: true });