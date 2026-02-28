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
