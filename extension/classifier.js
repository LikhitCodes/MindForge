// MindForge — Classification Engine v3.0
// Runs in the service worker (background.js context).
// 4-stage classification pipeline:
//   1. Domain tier check (instant, goal-independent)
//   2. KNN personalized check (goal-contextual, if ≥5 feedback examples)
//   3. Naive Bayes ML classifier (general text classification)
//   4. Keyword fallback (only if ML confidence < 0.4)

import { extractFeatures, detectContentType, initFeatures } from './ml/featureExtractor.js';
import { trainNaiveBayes, classifyNaiveBayes } from './ml/naiveBayes.js';
import { classifyKNN, isKNNReady } from './ml/knnClassifier.js';

// ─── Domain Tier Data ───

const TIER1_DISTRACTIONS = [
  'instagram.com', 'twitter.com', 'x.com', 'netflix.com', 'tiktok.com',
  'facebook.com', 'snapchat.com', 'twitch.tv', 'pinterest.com',
  'tumblr.com', '9gag.com',
  // NOTE: YouTube + Reddit are NOT here — they are mixed-content sites.
  // Classification is determined by ML analysis of actual page content
  // (video title, subreddit, post topic).
];

const DEFAULT_TIER2_PRODUCTIVE = [
  'github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.google.com',
  'notion.so', 'leetcode.com', 'coursera.org', 'udemy.com', 'kaggle.com',
  'dev.to', 'learn.microsoft.com', 'w3schools.com', 'freecodecamp.org',
  'chat.openai.com', 'claude.ai',
];

function getDomainTier(hostname, userAllowlist = [], userBlocklist = []) {
  if (!hostname) return 'ambiguous';
  const h = hostname.toLowerCase().replace(/^www\./, '');

  if (userBlocklist.some(d => h === d || h.endsWith('.' + d))) return 'distraction';
  if (userAllowlist.some(d => h === d || h.endsWith('.' + d))) return 'productive';
  if (TIER1_DISTRACTIONS.some(d => h === d || h.endsWith('.' + d))) return 'distraction';
  if (DEFAULT_TIER2_PRODUCTIVE.some(d => h === d || h.endsWith('.' + d))) return 'productive';

  return 'ambiguous';
}

// ─── Legacy Keyword Classifier (Stage 4 fallback) ───

const DISTRACTION_SIGNALS = [
  'meme', 'funny', 'viral', 'gossip', 'celebrity', 'trending',
  'gaming', 'watch later', 'shorts', 'reels', 'stories',
  'entertainment', 'movie', 'tv show', 'anime', 'manga',
  'social media', 'selfie', 'influencer', 'vlogger', 'drama',
  'prank', 'reaction', 'roast', 'rant', 'cringe', 'fail',
  'unboxing', 'haul', 'mukbang', 'asmr', 'compilation',
  "we're so back", 'hot take', 'beef', 'exposed',
  'clickbait', 'subscribe', 'giveaway', 'scandal',
  'binge watch', 'episode recap', 'fan theory', 'fandom',
  'dating', 'relationship drama', 'party mix', 'top hits',
  'satisfying', 'oddly satisfying', 'try not to laugh',
  'gone wrong', 'pov', 'storytime', 'grwm',
];

const PRODUCTIVE_SIGNALS = [
  'tutorial', 'documentation', 'api', 'guide', 'reference', 'how to',
  'learn', 'course', 'lecture', 'programming', 'coding', 'development',
  'algorithm', 'data structure', 'framework', 'library', 'debug',
  'research', 'study', 'paper', 'analysis', 'engineering', 'design',
  'architecture', 'deploy', 'database', 'server', 'config', 'setup',
  'textbook', 'syllabus', 'chapter', 'exam', 'notes', 'education',
  'university', 'college', 'academic', 'fundamentals', 'concepts',
  'introduction', 'overview', 'explained', 'deep dive',
  'workshop', 'seminar', 'conference', 'masterclass',
  'problem solving', 'mathematics', 'physics', 'chemistry',
  'biology', 'statistics', 'machine learning', 'artificial intelligence',
  'neural network', 'data science', 'computer science',
  'open source', 'repository', 'pull request', 'code review',
  'documentation', 'specification', 'technical', 'implementation',
  'focus music', 'study playlist', 'concentration', 'deep work',
  'white noise', 'study session', 'revision', 'thesis',
  'educational podcast', 'tech talk',
];

function keywordClassify(extractedContent, sessionGoal = '') {
  const title = (extractedContent.title || '').toLowerCase();
  const content = (extractedContent.content || '').toLowerCase();
  const url = (extractedContent.url || '').toLowerCase();
  const allText = [title, content, url].join(' ');

  let distractionScore = 0;
  for (const kw of DISTRACTION_SIGNALS) {
    // Title matches are weighted higher — they're more reliable indicators
    if (title.includes(kw)) distractionScore += 2;
    else if (allText.includes(kw)) distractionScore++;
  }

  let productiveScore = 0;
  for (const kw of PRODUCTIVE_SIGNALS) {
    if (title.includes(kw)) productiveScore += 2;
    else if (allText.includes(kw)) productiveScore++;
  }

  // Goal-contextual boost: if the session goal overlaps with page content,
  // dynamically boost the productive score. This is how "ML video on YouTube"
  // becomes productive when your goal is "Machine Learning study".
  if (sessionGoal) {
    const goalWords = sessionGoal.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let goalMatches = 0;
    for (const word of goalWords) {
      if (allText.includes(word)) goalMatches++;
    }
    if (goalWords.length > 0) {
      const goalOverlap = goalMatches / goalWords.length;
      if (goalOverlap >= 0.3) {
        // Significant goal overlap — boost productive score proportionally
        productiveScore += Math.round(goalOverlap * 5);
      }
    }
  }

  if (productiveScore > distractionScore && productiveScore >= 1) {
    const conf = Math.min(0.3 + productiveScore * 0.04, 0.65);
    return { category: 'productive', confidence: conf, label: 'keyword: educational content' };
  }

  if (distractionScore > productiveScore && distractionScore >= 1) {
    const conf = Math.min(0.3 + distractionScore * 0.04, 0.65);
    return { category: 'distraction', confidence: conf, label: 'keyword: entertainment content' };
  }

  return { category: 'neutral', confidence: 0.25, label: 'keyword: uncertain content' };
}

// ─── ML Model Initialization ───

let _mlReady = false;

function ensureMLReady() {
  if (_mlReady) return;
  try {
    initFeatures();
    trainNaiveBayes();
    _mlReady = true;
    console.log('[MindForge] ML models initialized successfully');
  } catch (err) {
    console.error('[MindForge] ML initialization error:', err);
  }
}

// ─── Main classify function (4-stage pipeline) ───

/**
 * Classify a page's content.
 * Returns { category, confidence, label, contentType, method }
 */
async function classify(extractedContent, sessionGoal, userAllowlist = [], userBlocklist = [], sessionActive = false) {
  let hostname = extractedContent.hostname || '';
  if (!hostname && extractedContent.url) {
    try { hostname = new URL(extractedContent.url).hostname; } catch {}
  }

  // ─── Stage 1: Domain tier check (instant, goal-independent) ───
  const tier = getDomainTier(hostname, userAllowlist, userBlocklist);

  if (tier === 'distraction') {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] ✗ DISTRACTION (tier): ${hostname}`);
    return { category: 'distraction', confidence: 1.0, label: 'Known distraction site', contentType: ct, method: 'domain-tier' };
  }
  if (tier === 'productive') {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] ✓ PRODUCTIVE (tier): ${hostname}`);
    return { category: 'productive', confidence: 1.0, label: 'Known productive site', contentType: ct, method: 'domain-tier' };
  }

  // If no active session, mark neutral
  if (!sessionActive) {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] — NEUTRAL (no session): ${hostname}`);
    return { category: 'neutral', confidence: 0.5, label: 'no active session', contentType: ct, method: 'no-session' };
  }

  // ─── Initialize ML models if needed ───
  ensureMLReady();

  // ─── Extract features for ML stages ───
  let featureResult;
  try {
    featureResult = extractFeatures(extractedContent, sessionGoal);
  } catch (err) {
    console.warn('[MindForge] Feature extraction failed:', err.message);
    const kwResult = keywordClassify(extractedContent, sessionGoal);
    return { ...kwResult, contentType: 'text', method: 'keyword-fallback-error' };
  }

  const { vector: featureVector, contentType } = featureResult;

  // ─── Stage 2: KNN personalized check (goal-contextual) ───
  if (isKNNReady()) {
    try {
      const knnResult = classifyKNN(featureVector, sessionGoal);
      if (knnResult && knnResult.confidence >= 0.5) {
        console.log(`[MindForge] ${knnResult.category === 'distraction' ? '✗' : knnResult.category === 'productive' ? '✓' : '—'} ${knnResult.category.toUpperCase()} (KNN): ${hostname} — confidence: ${knnResult.confidence.toFixed(2)} — goal: "${sessionGoal}"`);
        return {
          category: knnResult.category,
          confidence: knnResult.confidence,
          label: `ML personalized: ${knnResult.category} (goal-contextual)`,
          contentType,
          method: 'knn-personalized',
        };
      }
    } catch (err) {
      console.warn('[MindForge] KNN classification failed:', err.message);
    }
  }

  // ─── Stage 3: Naive Bayes general classifier ───
  try {
    const nbResult = classifyNaiveBayes(featureVector);

    if (nbResult.confidence >= 0.4) {
      const icon = nbResult.category === 'distraction' ? '✗' : nbResult.category === 'productive' ? '✓' : '—';
      console.log(`[MindForge] ${icon} ${nbResult.category.toUpperCase()} (NaiveBayes): ${hostname} — confidence: ${nbResult.confidence.toFixed(2)} — scores: P=${nbResult.scores.productive.toFixed(2)} D=${nbResult.scores.distraction.toFixed(2)} N=${nbResult.scores.neutral.toFixed(2)}`);
      return {
        category: nbResult.category,
        confidence: Math.min(nbResult.confidence, 0.9), // Cap at 0.9 since it's not domain-tier certainty
        label: `ML classified: ${nbResult.category}`,
        contentType,
        method: 'naive-bayes',
      };
    }
  } catch (err) {
    console.warn('[MindForge] Naive Bayes classification failed:', err.message);
  }

  // ─── Stage 4: Keyword fallback (now goal-aware) ───
  const kwResult = keywordClassify(extractedContent, sessionGoal);
  const icon = kwResult.category === 'distraction' ? '✗' : kwResult.category === 'productive' ? '✓' : '—';
  console.log(`[MindForge] ${icon} ${kwResult.category.toUpperCase()} (keyword-fallback): ${hostname} — ${kwResult.label}`);

  return {
    ...kwResult,
    contentType,
    method: 'keyword-fallback',
  };
}

export { classify, getDomainTier, keywordClassify, ensureMLReady };
