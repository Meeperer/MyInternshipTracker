const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'between', 'built',
  'could', 'daily', 'during', 'entry', 'from', 'have', 'having', 'into', 'just', 'learned',
  'made', 'more', 'notes', 'only', 'over', 'really', 'some', 'still', 'than', 'that', 'their',
  'there', 'these', 'they', 'this', 'today', 'very', 'were', 'what', 'when', 'where', 'while',
  'with', 'work', 'worked', 'working', 'would', 'your'
]);

const POSITIVE_WORDS = ['completed', 'finished', 'improved', 'confident', 'clear', 'great', 'smooth', 'successful', 'helpful', 'learned', 'progress', 'excited'];
const HEAVY_WORDS = ['busy', 'deadline', 'urgent', 'intense', 'heavy', 'packed', 'rushed', 'long'];
const BLOCKER_WORDS = ['blocked', 'delay', 'issue', 'problem', 'difficult', 'stuck', 'challenge', 'waiting', 'rejected', 'bug', 'fix'];
const WIN_WORDS = ['completed', 'built', 'created', 'designed', 'launched', 'finished', 'improved', 'presented', 'submitted', 'delivered'];

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEntryText(entry) {
  return normalizeText([
    entry.content_ai_refined,
    entry.aras_action,
    entry.aras_reflection,
    entry.aras_analysis,
    entry.aras_summary,
    entry.content_raw
  ].filter(Boolean).join(' '));
}

function sentenceSnippets(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function titleize(token) {
  return token
    .split(/[-/]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getWeekNumberInMonth(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function buildJournalInsights(entries = []) {
  const activeEntries = entries.filter((entry) => getEntryText(entry));
  const keywordCounts = new Map();
  const wins = [];
  const blockers = [];
  const weekBuckets = new Map();

  for (const entry of activeEntries) {
    const text = getEntryText(entry).toLowerCase();
    const hours = Number(entry.hours) || 0;
    const week = getWeekNumberInMonth(entry.date);

    const bucket = weekBuckets.get(week) || {
      week,
      hours: 0,
      entries: 0,
      toneScore: 0,
      weightScore: 0
    };
    bucket.hours += hours;
    bucket.entries += 1;
    bucket.toneScore += POSITIVE_WORDS.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
    bucket.weightScore += HEAVY_WORDS.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
    weekBuckets.set(week, bucket);

    const words = text.match(/[a-z][a-z/-]{3,}/g) || [];
    for (const word of words) {
      if (STOPWORDS.has(word)) continue;
      keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
    }

    for (const sentence of sentenceSnippets(text)) {
      if (wins.length < 4 && WIN_WORDS.some((word) => sentence.includes(word))) {
        wins.push(sentence.charAt(0).toUpperCase() + sentence.slice(1));
      }

      if (blockers.length < 4 && BLOCKER_WORDS.some((word) => sentence.includes(word))) {
        blockers.push(sentence.charAt(0).toUpperCase() + sentence.slice(1));
      }
    }
  }

  const recurringThemes = [...keywordCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token, count]) => ({
      label: titleize(token),
      count
    }));

  const workloadTrend = [...weekBuckets.values()]
    .sort((a, b) => a.week - b.week)
    .map((bucket) => {
      const toneLabel =
        bucket.weightScore >= 2 ? 'Heavy' :
        bucket.toneScore >= 2 ? 'Positive' :
        'Steady';

      return {
        week: bucket.week,
        label: `Week ${bucket.week}`,
        hours: Math.round(bucket.hours * 10) / 10,
        entries: bucket.entries,
        tone: toneLabel
      };
    });

  return {
    recurringThemes,
    workloadTrend,
    topWins: wins.slice(0, 3),
    blockers: blockers.slice(0, 3)
  };
}
