// src/content.ts

// --- キャッシュ ---
const vibeCache = new Map<string, { isBad: boolean, reason?: string }>();

const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXT_SELECTOR = 'div[data-testid="tweetText"]';

/**
 * ツイートID抽出
 */
const getTweetId = (article: HTMLElement): string | null => {
  const timeLink = article.querySelector('a[href*="/status/"]');
  if (!timeLink) return null;
  const href = timeLink.getAttribute('href');
  if (!href) return null;
  const match = href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
};

/**
 * 【Step 1】解析中（Scanning）のオーバーレイを被せる
 * これにより、初期状態でポストの内容を隠蔽します
 */
const applyScanningStyle = (article: HTMLElement) => {
  if (article.dataset.vibeStatus === 'scanning') return;
  article.dataset.vibeStatus = 'scanning';

  // 1. レイアウト崩れを防ぐため、要素の高さは維持しつつ中身を見えなくする
  article.style.position = 'relative';
  
  // 2. 解析中オーバーレイを作成
  const scanCurtain = document.createElement('div');
  scanCurtain.className = 'vibe-scan-curtain'; // 後で削除しやすいようにクラス付与
  
  Object.assign(scanCurtain.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // ほぼ不透明な白（ダークモードなら黒系に調整）
    zIndex: '50', // コンテンツより上
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)', // すりガラス効果
    color: '#888',
    fontSize: '14px',
    fontWeight: 'bold',
  });

  // ダークモード対応（簡易的）: 背景色が黒っぽいならオーバーレイも黒くする
  const bgColor = window.getComputedStyle(document.body).backgroundColor;
  if (bgColor.includes('0, 0, 0') || bgColor.match(/rgb\(\s*21/)) { // Xのダークモード色判定
     scanCurtain.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  }

  scanCurtain.innerText = '🔍 VibeCheck Scanning...';
  
  article.appendChild(scanCurtain);
};

/**
 * 【Step 2-A】安全な場合：オーバーレイを削除して表示
 */
const revealContent = (article: HTMLElement) => {
  article.dataset.vibeStatus = 'allowed';
  
  // Scanningカーテンを探して削除
  const curtain = article.querySelector('.vibe-scan-curtain');
  if (curtain) {
    curtain.remove();
  }
};

/**
 * 【Step 2-B】アウトな場合：ブロック表示（黒塗り）に差し替え
 */
const applyBlockStyle = (article: HTMLElement, reason: string) => {
  article.dataset.vibeStatus = 'blocked';

  // Scanningカーテンがあれば削除
  const scanCurtain = article.querySelector('.vibe-scan-curtain');
  if (scanCurtain) scanCurtain.remove();

  // ブロック用オーバーレイを作成
  const blockCurtain = document.createElement('div');
  
  Object.assign(blockCurtain.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: '#000000', // 完全な黒
    zIndex: '100',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '20px',
    boxSizing: 'border-box',
  });

  blockCurtain.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 8px;">🚫 Restricted</div>
    <div style="font-size: 12px; color: #888;">[Reason] ${reason}</div>
    <div style="font-size: 10px; color: #444; margin-top: 12px;">(Click to reveal)</div>
  `;

  blockCurtain.onclick = (e) => {
    e.stopPropagation();
    if (confirm('一時的に表示しますか？')) {
      blockCurtain.remove();
    }
  };

  article.appendChild(blockCurtain);
};

/**
 * メイン処理フロー
 */
const processTweet = async (article: HTMLElement) => {
  // まだ何もしていない新規ツイートのみ対象
  if (article.dataset.vibeStatus) return;

  // 1. 【即時実行】まずは隠す（Default Deny）
  applyScanningStyle(article);

  const tweetId = getTweetId(article);
  if (!tweetId) {
    // IDが取れない（プロモ等）はとりあえず通す（または隠し続ける）
    // 今回は安全側に倒して通します
    revealContent(article);
    return;
  }

  // 2. キャッシュ確認
  if (vibeCache.has(tweetId)) {
    const cached = vibeCache.get(tweetId)!;
    if (cached.isBad) {
      applyBlockStyle(article, cached.reason || 'Blocked');
    } else {
      revealContent(article);
    }
    return;
  }

  // 3. テキスト取得
  const textElement = article.querySelector(TWEET_TEXT_SELECTOR) as HTMLElement | null;
  const text = textElement ? textElement.innerText : '';

  // テキストが無い、または短すぎる場合はスルー（画像を考慮するならここは要調整）
  if (text.length < 5) {
    vibeCache.set(tweetId, { isBad: false });
    revealContent(article);
    return;
  }

  // 4. API判定（非同期）
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_VIBE',
      text: text
    }) as any; // 型定義は適宜

    // 結果をキャッシュ
    vibeCache.set(tweetId, {
      isBad: response.isBadVibe,
      reason: response.reason
    });

    // 5. 結果適用
    if (response.isBadVibe) {
      console.log(`💀 Blocked: ${text.substring(0, 15)}...`);
      applyBlockStyle(article, response.reason);
    } else {
      revealContent(article);
    }

  } catch (err) {
    console.error('Check failed:', err);
    // エラー時はFail Open（表示する）かFail Close（隠し続ける）か
    // ここではユーザビリティ優先で表示します
    revealContent(article);
  }
};

// --- Observer ---
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