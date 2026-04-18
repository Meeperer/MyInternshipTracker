import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';
const GROQ_TIMEOUT_MS = 45000;

function withTimeout(promise, ms = GROQ_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out')), ms))
  ]);
}

export async function refineJournal(rawContent) {
  const completion = await withTimeout(groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a professional journal editor for an internship daily report.
Your task is to refine the user's journal entry.

STRICT RULES:
- Only improve grammar, spelling, sentence clarity, and structure. Edit only what is written.
- Preserve the user's original content and meaning completely. Do not add or remove any facts.
- Do NOT invent, hallucinate, or fabricate anything: no new events, tasks, stories, details, or experiences.
- Do NOT add any information that is not explicitly in the user's text.
- Do NOT exaggerate, embellish, or expand on what the user wrote.
- If something is unclear, leave it as the user wrote it—do not guess or fill in.
- Maintain a professional but authentic tone. Keep technical terms as the user wrote them.
- Return ONLY the refined text, no explanations or metadata.`
      },
      { role: 'user', content: rawContent }
    ],
    temperature: 0.2,
    max_tokens: 2000
  }));

  return {
    refined: completion.choices[0].message.content,
    tokens: completion.usage?.total_tokens || 0
  };
}

export async function generateARAS(content) {
  const completion = await withTimeout(groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a journal structuring assistant for internship reports.
Restructure the given journal entry into the ARAS format.

ARAS FORMAT:
1. **Action** - What was done today (tasks, activities, work performed)
2. **Reflection** - How the person felt or responded to the day's work
3. **Analysis** - What was learned, technical understanding gained
4. **Summary** - Concise overview of the day

STRICT RULES:
- Derive ALL sections ONLY from the provided content
- Do NOT fabricate or invent any missing information
- If information for a section is insufficient, keep it minimal and honest
- Maintain the user's original meaning
- Use professional language

Return ONLY a JSON object with keys: action, reflection, analysis, summary
Each value should be a string paragraph. No markdown formatting in values.`
      },
      { role: 'user', content: content }
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  }));

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    aras: {
      action: parsed.action || '',
      reflection: parsed.reflection || '',
      analysis: parsed.analysis || '',
      summary: parsed.summary || ''
    },
    tokens: completion.usage?.total_tokens || 0
  };
}

function clipText(value, maxLength = 1800) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function getEntrySummaryText(entry) {
  const arasParts = [
    entry.aras_action && `Action: ${entry.aras_action}`,
    entry.aras_reflection && `Reflection: ${entry.aras_reflection}`,
    entry.aras_analysis && `Analysis: ${entry.aras_analysis}`,
    entry.aras_summary && `Summary: ${entry.aras_summary}`
  ].filter(Boolean);

  if (arasParts.length > 0) {
    return clipText(arasParts.join('\n'));
  }

  if (entry.content_ai_refined?.trim()) {
    return clipText(entry.content_ai_refined);
  }

  return clipText(entry.content_raw);
}

function buildPeriodSummarySource(entries, maxChars = 16000) {
  const blocks = [];
  let remaining = maxChars;
  let usedEntryCount = 0;

  for (const entry of entries) {
    const content = getEntrySummaryText(entry);
    if (!content) continue;

    const block = [
      `Date: ${entry.date}`,
      `Hours: ${entry.hours ?? 0}`,
      `Status: ${entry.status || 'draft'}`,
      content
    ].join('\n');

    if (block.length > remaining) {
      const clipped = clipText(block, Math.max(remaining - 1, 0));
      if (clipped) {
        blocks.push(clipped);
        usedEntryCount += 1;
      }
      break;
    }

    blocks.push(block);
    remaining -= block.length + 2;
    usedEntryCount += 1;
  }

  return {
    source: blocks.join('\n\n'),
    usedEntryCount
  };
}

export async function summarizeJournalPeriod(entries, { period, startDate, endDate }) {
  const { source, usedEntryCount } = buildPeriodSummarySource(entries);

  if (!source) {
    return {
      summary: '',
      tokens: 0,
      usedEntryCount: 0
    };
  }

  const completion = await withTimeout(groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an internship journal summarization assistant.
Summarize a user's journal entries for a week or month.

STRICT RULES:
- Use ONLY the provided journal content.
- Do NOT invent events, accomplishments, blockers, or plans.
- Keep the writing professional, concise, and grounded in the source material.
- If some information is sparse, say less rather than guessing.
- Return exactly three short paragraphs:
  1. Main work completed and overall progress
  2. Key learnings, themes, or patterns
  3. Challenges, follow-up work, or priorities implied by the entries
- Return ONLY plain text, with no headings or bullet points.`
      },
      {
        role: 'user',
        content: `Period type: ${period}
Date range: ${startDate} to ${endDate}

Journal entries:
${source}`
      }
    ],
    temperature: 0.3,
    max_tokens: 900
  }));

  return {
    summary: completion.choices[0].message.content?.trim() || '',
    tokens: completion.usage?.total_tokens || 0,
    usedEntryCount
  };
}
