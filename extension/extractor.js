// MindForge — Content Extraction via Mozilla Readability + Site-Specific Extractors
// Runs in content script context. Extracts meaningful text from any page.
// v3.0: Added deep extractors for YouTube, Reddit, and enhanced SPA support.

/**
 * Wait for the DOM to stabilize (content loaded).
 * Uses MutationObserver with a 2s fallback timeout.
 */
function waitForDOMStable(timeout = 2000) {
  return new Promise((resolve) => {
    if (document.readyState === 'complete' && document.body && document.body.textContent.length > 200) {
      resolve();
      return;
    }

    let timer = null;
    let observer = null;

    const done = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      resolve();
    };

    timer = setTimeout(done, timeout);

    if (document.body) {
      let mutationCount = 0;
      observer = new MutationObserver(() => {
        mutationCount++;
        if (mutationCount >= 5) done();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// ═══════════════════════════════════════
//  YOUTUBE DEEP EXTRACTOR
// ═══════════════════════════════════════

function isYouTube() {
  return window.location.hostname.includes('youtube.com');
}

function isYouTubeWatchPage() {
  return isYouTube() && window.location.pathname === '/watch';
}

/**
 * Extract rich content from a YouTube watch page.
 * Reads video title, channel, description, tags, and category.
 */
function extractYouTubeContent() {
  // ── Video Title ──
  // Try multiple selectors because YouTube's DOM changes frequently
  const titleSelectors = [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata',
    '#title h1 yt-formatted-string',
    '#title h1',
    'h1.title',
    'meta[property="og:title"]',
  ];

  let title = '';
  for (const sel of titleSelectors) {
    if (sel.startsWith('meta')) {
      title = document.querySelector(sel)?.content || '';
    } else {
      title = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (title) break;
  }

  // Fallback to document.title and strip " - YouTube"
  if (!title) {
    title = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
  }

  // ── Channel Name ──
  const channelSelectors = [
    '#channel-name yt-formatted-string a',
    '#channel-name a',
    'ytd-channel-name yt-formatted-string a',
    'ytd-channel-name a',
    '#owner-name a',
    '#upload-info a',
  ];

  let channel = '';
  for (const sel of channelSelectors) {
    channel = document.querySelector(sel)?.textContent?.trim() || '';
    if (channel) break;
  }

  // ── Description ──
  const descSelectors = [
    '#description-inline-expander yt-attributed-string',
    '#description yt-formatted-string',
    '#description-text',
    '#description',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  let description = '';
  for (const sel of descSelectors) {
    if (sel.startsWith('meta')) {
      description = document.querySelector(sel)?.content || '';
    } else {
      description = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (description && description.length > 20) break;
  }

  // ── Tags / Keywords ──
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

  // ── Category from meta ──
  const category = document.querySelector('meta[itemprop="genre"]')?.content || '';

  // ── Combine into rich content string ──
  const parts = [
    title,
    channel ? `Channel: ${channel}` : '',
    description ? description.substring(0, 400) : '',
    keywords ? `Tags: ${keywords}` : '',
    category ? `Category: ${category}` : '',
  ].filter(Boolean);

  const content = parts.join(' | ');

  return {
    title: title || document.title,
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'youtube-deep',
    siteType: 'youtube',
    channel,
    videoCategory: category,
  };
}

/**
 * Extract content from YouTube non-watch pages (homepage, search, etc.)
 */
function extractYouTubeListContent() {
  const title = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
  const pathname = window.location.pathname;

  // Detect page type
  let pageType = 'browse';
  if (pathname.includes('/results')) pageType = 'search';
  else if (pathname === '/' || pathname === '/feed/trending') pageType = 'homepage';
  else if (pathname.startsWith('/@') || pathname.startsWith('/channel') || pathname.startsWith('/c/')) pageType = 'channel';
  else if (pathname.includes('/playlist')) pageType = 'playlist';

  // Extract visible video titles on the page
  const videoTitles = [];
  document.querySelectorAll('#video-title, #video-title-link, h3 a#video-title').forEach(el => {
    const t = el.textContent?.trim();
    if (t && videoTitles.length < 10) videoTitles.push(t);
  });

  const searchQuery = new URLSearchParams(window.location.search).get('search_query') || '';

  const content = [
    title,
    `Page type: ${pageType}`,
    searchQuery ? `Search query: ${searchQuery}` : '',
    videoTitles.length > 0 ? `Visible videos: ${videoTitles.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return {
    title: title || 'YouTube',
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'youtube-list',
    siteType: 'youtube',
  };
}

// ═══════════════════════════════════════
//  REDDIT DEEP EXTRACTOR
// ═══════════════════════════════════════

function isReddit() {
  const h = window.location.hostname;
  return h.includes('reddit.com') || h.includes('redd.it');
}

/**
 * Extract rich content from Reddit pages.
 * Handles both old and new Reddit, plus post pages and subreddit listings.
 */
function extractRedditContent() {
  const pathname = window.location.pathname;

  // ── Subreddit name ──
  const subredditMatch = pathname.match(/\/r\/([^/]+)/);
  const subreddit = subredditMatch ? subredditMatch[1] : '';

  // ── Post title ──
  const postTitleSelectors = [
    'h1[slot="title"]',
    'shreddit-post h1',
    'h1.Post__title',
    '[data-testid="post-title"]',
    'h1',
    'meta[property="og:title"]',
  ];

  let postTitle = '';
  for (const sel of postTitleSelectors) {
    if (sel.startsWith('meta')) {
      postTitle = document.querySelector(sel)?.content || '';
    } else {
      postTitle = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (postTitle && postTitle.length > 5) break;
  }

  // ── Post body / text ──
  const bodySelectors = [
    '[data-testid="post-content"]',
    '.RichTextJSON-root',
    'shreddit-post [slot="text-body"]',
    '.Post__body',
    '.md',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  let postBody = '';
  for (const sel of bodySelectors) {
    if (sel.startsWith('meta')) {
      postBody = document.querySelector(sel)?.content || '';
    } else {
      postBody = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (postBody && postBody.length > 20) break;
  }

  // ── Visible post titles on listing pages ──
  const visiblePosts = [];
  if (!postTitle || postTitle.length < 5) {
    // We're on a listing page, grab visible post titles
    document.querySelectorAll('a[data-testid="post-title"], shreddit-post h3, .Post h3, article h3').forEach(el => {
      const t = el.textContent?.trim();
      if (t && visiblePosts.length < 8) visiblePosts.push(t);
    });
  }

  // ── Flair / category ──
  const flair = document.querySelector('[data-testid="outboundLink"], .flair, flair-badge')?.textContent?.trim() || '';

  const title = postTitle || document.title.replace(/\s*:\s*reddit\s*$/i, '').trim();

  const content = [
    title,
    subreddit ? `Subreddit: r/${subreddit}` : '',
    flair ? `Flair: ${flair}` : '',
    postBody ? postBody.substring(0, 400) : '',
    visiblePosts.length > 0 ? `Visible posts: ${visiblePosts.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return {
    title: title || document.title,
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'reddit-deep',
    siteType: 'reddit',
    subreddit,
  };
}

// ═══════════════════════════════════════
//  MAIN EXTRACTOR
// ═══════════════════════════════════════

/**
 * Extract page content using site-specific extractors, then Readability fallback.
 * Returns { title, url, hostname, content, extractionMethod, ... }
 */
async function extractPageContent() {
  await waitForDOMStable();

  const url = window.location.href;
  const hostname = window.location.hostname;

  // ── 1. Site-specific deep extractors ──
  if (isYouTube()) {
    if (isYouTubeWatchPage()) {
      const yt = extractYouTubeContent();
      if (yt.content && yt.content.length > 30) {
        console.log('[MindForge] YouTube deep extraction:', yt.title);
        return yt;
      }
    } else {
      const yt = extractYouTubeListContent();
      if (yt.content && yt.content.length > 20) {
        console.log('[MindForge] YouTube list extraction:', yt.title);
        return yt;
      }
    }
  }

  if (isReddit()) {
    const rd = extractRedditContent();
    if (rd.content && rd.content.length > 30) {
      console.log('[MindForge] Reddit deep extraction:', rd.title);
      return rd;
    }
  }

  // ── 2. Try Readability ──
  try {
    const docClone = document.cloneNode(true);
    const reader = new Readability(docClone, { charThreshold: 100 });
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 200) {
      const content = article.textContent.trim().substring(0, 500);
      return {
        title: article.title || document.title,
        url,
        hostname,
        content,
        extractionMethod: 'readability',
      };
    }
  } catch (err) {
    console.log('[MindForge] Readability extraction failed:', err.message);
  }

  // ── 3. Enhanced meta fallback ──
  const title = document.title || '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
  const description = ogDesc || metaDesc;
  const useTitle = ogTitle || title;
  const pathname = window.location.pathname;

  const fallbackContent = [useTitle, description, keywords, pathname]
    .filter(Boolean)
    .join(' — ')
    .substring(0, 600);

  return {
    title: useTitle,
    url,
    hostname,
    content: stripHtml(fallbackContent),
    extractionMethod: 'fallback',
  };
}

// Expose globally for content script access
if (typeof globalThis !== 'undefined') {
  globalThis.MindForgeExtractor = { extractPageContent };
}
