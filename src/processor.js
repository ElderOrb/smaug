/**
 * Bookmark Processor - Fetches and prepares Twitter bookmarks for analysis
 *
 * This handles the mechanical work:
 * - Fetching bookmarks via bird CLI
 * - Expanding t.co links
 * - Extracting content from linked pages (articles, GitHub repos)
 * - Optional: Bypassing paywalls via archive.ph
 *
 * Outputs a JSON bundle for AI analysis (Claude Code, etc.)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { loadConfig } from './config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        throw error;
      }
      if (error.message?.includes('404') || error.message?.includes('HTTP 404')) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
        console.log(`  Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

const githubRateLimiter = {
  requests: [],
  maxRequests: 5000,
  windowMs: 60 * 60 * 1000,
  minDelayMs: 1000,

  async acquire() {
    const now = Date.now();

    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.windowMs - now;
      console.log(`  GitHub rate limit hit, waiting ${Math.ceil(waitTime/1000)}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return this.acquire();
    }

    if (this.requests.length > 0) {
      const lastRequest = this.requests[this.requests.length - 1];
      const timeSinceLast = now - lastRequest;
      if (timeSinceLast < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - timeSinceLast));
      }
    }

    this.requests.push(Date.now());
  }
};

const PAYWALL_DOMAINS = [
  'nytimes.com',
  'wsj.com',
  'washingtonpost.com',
  'theatlantic.com',
  'newyorker.com',
  'bloomberg.com',
  'ft.com',
  'economist.com',
  'bostonglobe.com',
  'latimes.com',
  'wired.com'
];

export function loadState(config) {
  try {
    const content = fs.readFileSync(config.stateFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return {
      last_processed_id: null,
      last_check: null,
      last_processing_run: null
    };
  }
}

export function saveState(config, state) {
  const dir = path.dirname(config.stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + '\n');
}

function buildBirdEnv(config) {
  const env = { ...process.env };
  if (config.twitter?.authToken) {
    env.AUTH_TOKEN = config.twitter.authToken;
  }
  if (config.twitter?.ct0) {
    env.CT0 = config.twitter.ct0;
  }
  return env;
}

export function fetchBookmarks(config, count = 10) {
  try {
    const env = buildBirdEnv(config);
    const birdCmd = config.birdPath || 'bird';
    const output = execSync(`${birdCmd} bookmarks -n ${count} --json`, {
      encoding: 'utf8',
      timeout: 30000,
      env
    });
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to fetch bookmarks: ${error.message}`);
  }
}

export function fetchLikes(config, count = 10) {
  try {
    const env = buildBirdEnv(config);
    const birdCmd = config.birdPath || 'bird';
    const output = execSync(`${birdCmd} likes -n ${count} --json`, {
      encoding: 'utf8',
      timeout: 30000,
      env
    });
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to fetch likes: ${error.message}`);
  }
}

export function fetchFromSource(config, count = 10) {
  const source = config.source || 'bookmarks';

  if (source === 'bookmarks') {
    return fetchBookmarks(config, count);
  } else if (source === 'likes') {
    return fetchLikes(config, count);
  } else if (source === 'both') {
    const bookmarks = fetchBookmarks(config, count);
    const likes = fetchLikes(config, count);
    const seen = new Set();
    const merged = [];
    for (const item of [...bookmarks, ...likes]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  } else {
    throw new Error(`Invalid source: ${source}. Must be 'bookmarks', 'likes', or 'both'.`);
  }
}

export function fetchTweet(config, tweetId) {
  try {
    const env = buildBirdEnv(config);
    const birdCmd = config.birdPath || 'bird';
    const output = execSync(`${birdCmd} read ${tweetId} --json`, {
      encoding: 'utf8',
      timeout: 15000,
      env
    });
    return JSON.parse(output);
  } catch (error) {
    console.log(`  Could not fetch parent tweet ${tweetId}: ${error.message}`);
    return null;
  }
}

export function expandTcoLink(url, timeout = 10000) {
  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal
      });
      return response.url;
    } finally {
      clearTimeout(timeoutId);
    }
  }, { maxRetries: 3, initialDelay: 1000 }).catch(error => {
    console.error(`Failed to expand ${url}: ${error.message}`);
    return url;
  });
}

export function isPaywalled(url) {
  return PAYWALL_DOMAINS.some(domain => url.includes(domain));
}

export function stripQuerystring(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function extractGitHubInfo(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

export async function fetchGitHubContent(url) {
  return retryWithBackoff(async () => {
    const info = extractGitHubInfo(url);
    if (!info) {
      throw new Error('Could not parse GitHub URL');
    }

    const { owner, repo } = info;

    await githubRateLimiter.acquire();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const repoResponse = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: controller.signal
      });

      if (!repoResponse.ok) {
        throw new Error(`GitHub API error: ${repoResponse.status}`);
      }

      const repoJson = await repoResponse.json();

      let readme = '';
      try {
        await githubRateLimiter.acquire();

        const readmeController = new AbortController();
        const readmeTimeoutId = setTimeout(() => readmeController.abort(), 15000);

        try {
          const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
          const readmeResponse = await fetch(readmeUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            signal: readmeController.signal
          });

          if (readmeResponse.ok) {
            const readmeJson = await readmeResponse.json();
            if (readmeJson.content) {
              readme = Buffer.from(readmeJson.content, 'base64').toString('utf8');
              if (readme.length > 5000) {
                readme = readme.slice(0, 5000) + '\n...[truncated]';
              }
            }
          }
        } finally {
          clearTimeout(readmeTimeoutId);
        }
      } catch (e) {
        console.log(`  No README found for ${owner}/${repo}`);
      }

      return {
        name: repoJson.name,
        fullName: repoJson.full_name,
        description: repoJson.description || '',
        stars: repoJson.stargazers_count,
        language: repoJson.language,
        topics: repoJson.topics || [],
        readme,
        url: repoJson.html_url
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }, { maxRetries: 3, initialDelay: 1000 });
}

export async function fetchArticleContent(url) {
  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      let result = '';
      let totalBytes = 0;
      const maxBytes = 50000;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          result += new TextDecoder().decode(value.slice(0, maxBytes - (totalBytes - value.length)));
          break;
        }

        result += new TextDecoder().decode(value);
      }

      if (result.includes('Subscribe') && result.includes('sign in') ||
          result.includes('This article is for subscribers') ||
          result.length < 1000) {
        return { text: result, source: 'direct', paywalled: true };
      }

      return { text: result, source: 'direct', paywalled: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }, { maxRetries: 3, initialDelay: 1000 });
}

export async function fetchContent(url, type, config) {
  if (type === 'github') {
    try {
      const ghContent = await fetchGitHubContent(url);
      return { ...ghContent, source: 'github-api' };
    } catch (error) {
      console.log(`  GitHub API failed: ${error.message}`);
    }
  }

  if (isPaywalled(url)) {
    console.log(`  Paywalled domain detected: ${url}`);
    return {
      url,
      source: 'paywalled',
      note: 'Content requires paywall bypass - see README for options'
    };
  }

  return await fetchArticleContent(url);
}

export function getExistingBookmarkIds(config) {
  try {
    const content = fs.readFileSync(config.archiveFile, 'utf8');
    const matches = content.matchAll(/x\.com\/\w+\/status\/(\d+)/g);
    return new Set([...matches].map(m => m[1]));
  } catch {
    return new Set();
  }
}

export async function fetchAndPrepareBookmarks(options = {}) {
  const config = loadConfig(options.configPath);
  const now = dayjs().tz(config.timezone || 'America/New_York');
  console.log(`[${now.format()}] Fetching and preparing bookmarks...`);

  const state = loadState(config);
  const source = options.source || config.source || 'bookmarks';
  const includeMedia = options.includeMedia ?? config.includeMedia ?? false;
  const configWithOptions = { ...config, source, includeMedia };

  console.log(`Fetching from source: ${source}${includeMedia ? ' (with media)' : ''}`);
  const tweets = fetchFromSource(configWithOptions, options.count || 20);

  if (!tweets || tweets.length === 0) {
    console.log(`No ${source} found`);
    return { bookmarks: [], count: 0 };
  }

  const existingIds = getExistingBookmarkIds(config);
  let pendingIds = new Set();
  try {
    if (fs.existsSync(config.pendingFile)) {
      const pending = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
      pendingIds = new Set(pending.bookmarks.map(b => b.id.toString()));
    }
  } catch (e) {}

  let toProcess;
  if (options.specificIds) {
    toProcess = tweets.filter(b => options.specificIds.includes(b.id.toString()));
  } else if (options.force) {
    toProcess = tweets;
  } else {
    toProcess = tweets.filter(b => {
      const id = b.id.toString();
      return !existingIds.has(id) && !pendingIds.has(id);
    });
  }

  if (toProcess.length === 0) {
    console.log('No new tweets to process');
    return { bookmarks: [], count: 0 };
  }

  console.log(`Preparing ${toProcess.length} tweets...`);

  const prepared = [];
  const date = now.format('dddd, MMMM D, YYYY');

  for (const bookmark of toProcess) {
    try {
      console.log(`\nProcessing bookmark ${bookmark.id}...`);
      const text = bookmark.text || bookmark.full_text || '';
      const author = bookmark.author?.username || bookmark.user?.screen_name || 'unknown';

      const tcoLinks = text.match(/https?:\/\/t\.co\/\w+/g) || [];
      const links = [];

      for (const link of tcoLinks) {
        const expanded = await expandTcoLink(link);
        console.log(`  Expanded: ${link} -> ${expanded}`);

        let type = 'unknown';
        let content = null;

        if (expanded.includes('github.com')) {
          type = 'github';
        } else if (expanded.includes('youtube.com') || expanded.includes('youtu.be')) {
          type = 'video';
        } else if (expanded.includes('x.com') || expanded.includes('twitter.com')) {
          if (expanded.includes('/photo/') || expanded.includes('/video/')) {
            type = 'media';
          } else {
            type = 'tweet';
            const tweetIdMatch = expanded.match(/status\/(\d+)/);
            if (tweetIdMatch) {
              const quotedTweetId = tweetIdMatch[1];
              console.log(`  Quote tweet detected, fetching ${quotedTweetId}...`);
              const quotedTweet = fetchTweet(config, quotedTweetId);
              if (quotedTweet) {
                content = {
                  id: quotedTweet.id,
                  author: quotedTweet.author?.username || 'unknown',
                  authorName: quotedTweet.author?.name || quotedTweet.author?.username || 'unknown',
                  text: quotedTweet.text || quotedTweet.full_text || '',
                  tweetUrl: `https://x.com/${quotedTweet.author?.username || 'unknown'}/status/${quotedTweet.id}`,
                  source: 'quote-tweet'
                };
              }
            }
          }
        } else if (expanded.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          type = 'image';
        } else {
          type = 'article';
        }

        if (type === 'article' || type === 'github') {
          try {
            const fetchResult = await fetchContent(expanded, type, config);

            if (fetchResult.source === 'github-api') {
              content = {
                name: fetchResult.name,
                fullName: fetchResult.fullName,
                description: fetchResult.description,
                stars: fetchResult.stars,
                language: fetchResult.language,
                topics: fetchResult.topics,
                readme: fetchResult.readme,
                url: fetchResult.url,
                source: 'github-api'
              };
              console.log(`  GitHub repo: ${fetchResult.fullName} (${fetchResult.stars} stars)`);
            } else {
              content = {
                text: fetchResult.text?.slice(0, 10000),
                source: fetchResult.source,
                paywalled: fetchResult.paywalled
              };
            }
          } catch (error) {
            console.log(`  Could not fetch content: ${error.message}`);
            content = { error: error.message };
          }
        }

        links.push({
          original: link,
          expanded,
          type,
          content
        });
      }

      let replyContext = null;
      if (bookmark.inReplyToStatusId) {
        console.log(`  This is a reply to ${bookmark.inReplyToStatusId}, fetching parent...`);
        const parentTweet = fetchTweet(config, bookmark.inReplyToStatusId);
        if (parentTweet) {
          replyContext = {
            id: parentTweet.id,
            author: parentTweet.author?.username || 'unknown',
            authorName: parentTweet.author?.name || parentTweet.author?.username || 'unknown',
            text: parentTweet.text || parentTweet.full_text || '',
            tweetUrl: `https://x.com/${parentTweet.author?.username || 'unknown'}/status/${parentTweet.id}`
          };
        }
      }

      let quoteContext = null;
      if (bookmark.quotedTweet) {
        const qt = bookmark.quotedTweet;
        quoteContext = {
          id: qt.id,
          author: qt.author?.username || 'unknown',
          authorName: qt.author?.name || qt.author?.username || 'unknown',
          text: qt.text || '',
          tweetUrl: `https://x.com/${qt.author?.username || 'unknown'}/status/${qt.id}`,
          source: 'native-quote'
        };
      }

      const media = configWithOptions.includeMedia ? (bookmark.media || []) : [];

      prepared.push({
        id: bookmark.id,
        author,
        authorName: bookmark.author?.name || bookmark.user?.name || author,
        text,
        tweetUrl: `https://x.com/${author}/status/${bookmark.id}`,
        createdAt: bookmark.createdAt,
        links,
        media,
        date,
        isReply: !!bookmark.inReplyToStatusId,
        replyContext,
        isQuote: !!quoteContext,
        quoteContext
      });

      const mediaInfo = media.length > 0 ? ` (${media.length} media)` : '';
      console.log(`  Prepared: @${author} with ${links.length} links${mediaInfo}${replyContext ? ' (reply)' : ''}${quoteContext ? ' (quote)' : ''}`);

    } catch (error) {
      console.error(`  Error processing bookmark ${bookmark.id}: ${error.message}`);
    }
  }

  let existingPending = { bookmarks: [] };
  try {
    if (fs.existsSync(config.pendingFile)) {
      existingPending = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
    }
  } catch (e) {}

  const existingPendingIds = new Set(existingPending.bookmarks.map(b => b.id));
  const newBookmarks = prepared.filter(b => !existingPendingIds.has(b.id));

  const output = {
    generatedAt: now.toISOString(),
    count: existingPending.bookmarks.length + newBookmarks.length,
    bookmarks: [...existingPending.bookmarks, ...newBookmarks]
  };

  const pendingDir = path.dirname(config.pendingFile);
  if (!fs.existsSync(pendingDir)) {
    fs.mkdirSync(pendingDir, { recursive: true });
  }
  fs.writeFileSync(config.pendingFile, JSON.stringify(output, null, 2));
  console.log(`\nMerged ${newBookmarks.length} new bookmarks into ${config.pendingFile} (total: ${output.count})`);

  state.last_check = now.toISOString();
  saveState(config, state);

  return { bookmarks: prepared, count: prepared.length, pendingFile: config.pendingFile };
}
