// src/content.ts

// --- 定数・セレクタ ---
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXT_SELECTOR = 'div[data-testid="tweetText"]';
const USER_NAME_SELECTOR = 'div[data-testid="User-Name"] a[href^="/"]';
const PROMO_SELECTOR = '[data-testid="placementTracking"]'; // システム的な広告属性
const AD_KEYWORDS = ['プロモーション', 'Promoted', 'Advertisement', '広告']; // 表示テキストによる広告判定

// --- キャッシュ管理 ---

// 判定結果キャッシュ: { tweetId: { isBad: boolean, reason: string } }
const vibeCache = new Map<string, { isBad: boolean, reason?: string }>();

// 設定キャッシュ
let configCache: {
  blockAds: boolean;
  trustedUsers: Set<string>;
  badExamples: string[];
} = {
  blockAds: false,
  trustedUsers: new Set(),
  badExamples: []
};

// 設定ロード
const updateConfigCache = async () => {
  try {
    const items = await chrome.storage.local.get(['blockAds', 'trustedUsers', 'badExamples']);

    configCache.blockAds = (items.blockAds as boolean | undefined) ?? false;
    configCache.trustedUsers = new Set((items.trustedUsers as string[] | undefined) ?? []);
    configCache.badExamples = (items.badExamples as string[] | undefined) ?? [];

    console.log('VibeCheck Config Loaded:', configCache);
  } catch (e) {
    console.error('Failed to load config:', e);
  }
};
updateConfigCache();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') updateConfigCache();
});


// --- ユーティリティ関数 ---

const getTweetId = (article: HTMLElement): string | null => {
  const timeLink = article.querySelector('a[href*="/status/"]');
  if (!timeLink) return null;
  const href = timeLink.getAttribute('href');
  if (!href) return null;
  const match = href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
};

const getUsername = (article: HTMLElement): string | null => {
  const userLink = article.querySelector(USER_NAME_SELECTOR);
  if (!userLink) return null;
  const href = userLink.getAttribute('href');
  return href ? '@' + href.substring(1) : null;
};

/**
 * 広告判定ロジック (属性チェック OR テキストチェック)
 */
const checkIsAd = (article: HTMLElement): boolean => {
  // 1. 属性ベースのチェック
  if (article.querySelector(PROMO_SELECTOR)) return true;

  // 2. テキストベースのチェック
  // 記事内のすべての span を走査してキーワード完全一致を探す
  const spans = article.querySelectorAll('span');
  for (const span of spans) {
    const text = span.innerText.trim();
    if (AD_KEYWORDS.includes(text)) {
      return true;
    }
  }
  return false;
};

/**
 * 学習機能: NG例として登録
 */
const registerBadExample = async (text: string) => {
  if (confirm(`このツイートの内容を「見たくない例」として学習させますか？\n\n"${text.substring(0, 30)}..."`)) {
    const newExamples = [...configCache.badExamples, text];
    const uniqueExamples = Array.from(new Set(newExamples));
    await chrome.storage.local.set({ badExamples: uniqueExamples });
    alert('登録しました。次回の判定から考慮されます。');
  }
};

/**
 * 信頼機能: ホワイトリスト登録
 */
const registerTrustedUser = async (username: string, article: HTMLElement) => {
  if (confirm(`${username} を信頼リスト（ホワイトリスト）に追加しますか？\n今後このユーザーのポストはスキャンされずに即時表示されます。`)) {
    configCache.trustedUsers.add(username);
    const newTrustedList = Array.from(configCache.trustedUsers);
    await chrome.storage.local.set({ trustedUsers: newTrustedList });
    revealContent(article);
  }
};


// --- スタイル操作関数 ---

/**
 * 【Step 1】解析中（Scanning）のオーバーレイ
 */
const applyScanningStyle = (article: HTMLElement) => {
  if (article.dataset.vibeStatus) return;
  article.dataset.vibeStatus = 'scanning';

  article.style.position = 'relative';

  const scanCurtain = document.createElement('div');
  scanCurtain.className = 'vibe-scan-curtain';

  Object.assign(scanCurtain.style, {
    position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    zIndex: '50', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)', color: '#888',
    fontSize: '14px', fontWeight: 'bold', borderRadius: '12px',
  });

  const bgColor = window.getComputedStyle(document.body).backgroundColor;
  if (bgColor.includes('0, 0, 0') || bgColor.match(/rgb\(\s*21/)) {
    scanCurtain.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  }

  // ラベル
  const label = document.createElement('div');
  label.innerText = '🔍 VibeCheck Scanning...';
  scanCurtain.appendChild(label);

  // Trust Button (Scanning画面で即座に許可するため)
  const username = getUsername(article);
  if (username) {
    const trustBtn = document.createElement('button');
    trustBtn.innerText = `Trust ${username}`;
    Object.assign(trustBtn.style, {
      marginTop: '8px', padding: '4px 8px', fontSize: '11px',
      color: '#4ec9b0', border: '1px solid #4ec9b0',
      background: 'transparent', borderRadius: '4px', cursor: 'pointer'
    });

    trustBtn.onclick = (e) => {
      e.stopPropagation();
      registerTrustedUser(username, article);
    };
    scanCurtain.appendChild(trustBtn);
  }

  article.appendChild(scanCurtain);
};

/**
 * 【Step 2-A】安全な場合：表示
 */
const revealContent = (article: HTMLElement) => {
  article.dataset.vibeStatus = 'allowed';
  const curtain = article.querySelector('.vibe-scan-curtain');
  if (curtain) curtain.remove();
};

/**
 * 【Step 2-B】アウトな場合：ブロック表示
 */
const applyBlockStyle = (article: HTMLElement, reason: string) => {
  article.dataset.vibeStatus = 'blocked';

  const scanCurtain = article.querySelector('.vibe-scan-curtain');
  if (scanCurtain) scanCurtain.remove();

  const blockCurtain = document.createElement('div');

  Object.assign(blockCurtain.style, {
    position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: '#000000', zIndex: '100', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '20px',
    boxSizing: 'border-box', borderRadius: '12px', fontFamily: 'sans-serif', color: '#dcdcdc'
  });

  const textElement = article.querySelector(TWEET_TEXT_SELECTOR) as HTMLElement;
  const text = textElement ? textElement.innerText : "";
  const username = getUsername(article);

  blockCurtain.innerHTML = `
    <div style="font-size: 20px; margin-bottom: 8px; font-weight:bold; color:#ff6b6b;">🚫 Restricted</div>
    <div style="font-size: 12px; color: #aaa; margin-bottom:16px; text-align:center;">Reason: ${reason}</div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
      <button id="btn-reveal" style="cursor:pointer; padding:6px 12px; border:1px solid #555; background:#333; color:white; border-radius:4px;">一時表示</button>
      <button id="btn-learn" style="cursor:pointer; padding:6px 12px; border:1px solid #800; background:#500; color:white; border-radius:4px;">学習させる</button>
      ${username ? `<button id="btn-trust" style="cursor:pointer; padding:6px 12px; border:1px solid #0e639c; background:#003344; color:#4fc1ff; border-radius:4px;">信頼する (${username})</button>` : ''}
    </div>
  `;

  // イベント設定
  (blockCurtain.querySelector('#btn-reveal') as HTMLElement).onclick = (e) => {
    e.stopPropagation();
    if (confirm('一時的に表示しますか？')) blockCurtain.remove();
  };

  (blockCurtain.querySelector('#btn-learn') as HTMLElement).onclick = (e) => {
    e.stopPropagation();
    registerBadExample(text);
  };

  if (username) {
    (blockCurtain.querySelector('#btn-trust') as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      registerTrustedUser(username, article);
    };
  }

  blockCurtain.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
  article.appendChild(blockCurtain);
};


// --- メイン処理 ---

const processTweet = async (article: HTMLElement) => {
  if (article.dataset.vibeStatus) return;

  // 1. 広告ブロック (強化版: 属性チェック OR テキストチェック)
  if (configCache.blockAds && checkIsAd(article)) {
    applyScanningStyle(article);
    applyBlockStyle(article, 'Promotion (Auto-blocked)');
    return;
  }

  // 2. Default Deny: まず隠す
  applyScanningStyle(article);

  // 3. ホワイトリスト判定
  const username = getUsername(article);
  if (username && configCache.trustedUsers.has(username)) {
    revealContent(article);
    return;
  }

  // 4. ツイートID取得
  const tweetId = getTweetId(article);
  if (!tweetId) {
    revealContent(article);
    return;
  }

  // 5. キャッシュ確認
  if (vibeCache.has(tweetId)) {
    const cached = vibeCache.get(tweetId)!;
    if (cached.isBad) {
      applyBlockStyle(article, cached.reason || 'Blocked');
    } else {
      revealContent(article);
    }
    return;
  }

  // 6. テキスト判定へ
  const textElement = article.querySelector(TWEET_TEXT_SELECTOR) as HTMLElement | null;
  const text = textElement ? textElement.innerText : '';

  if (text.length < 5) {
    vibeCache.set(tweetId, { isBad: false });
    revealContent(article);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_VIBE',
      text: text
    }) as any;

    vibeCache.set(tweetId, { isBad: response.isBadVibe, reason: response.reason });

    if (response.isBadVibe) {
      applyBlockStyle(article, response.reason);
    } else {
      revealContent(article);
    }

  } catch (err: any) {
    // ★修正: 拡張機能リロード時の切断エラーを検知して、静かに停止させる
    const msg = err.message || '';
    if (msg.includes('Extension context invalidated') || msg.includes('Message channel closed')) {
      // 開発中はよくあることなので、警告レベルに下げてオブザーバーを止める
      console.warn('⚠️ Extension updated/disconnected. Stopping observer. Please reload the page.');
      observer.disconnect();
      return;
    }

    // 503エラーなどのAPIエラーはここでログに出す
    console.error('VibeCheck API Error:', err);
    
    // エラー時はユーザビリティ優先でコンテンツを表示する (Fail Open)
    revealContent(article);
  }
};

// --- DOM監視 ---
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        if (node.matches(TWEET_SELECTOR)) processTweet(node);
        node.querySelectorAll(TWEET_SELECTOR).forEach((t) => processTweet(t as HTMLElement));
      }
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });

console.log('🚀 VibeCheck: Content Script Loaded (Final)');