// electron/smartFormatClient.ts
import https from "node:https";

// electron/groqClient.ts
var MissingApiKeyError = class extends Error {
  constructor(service) {
    super(`No ${service} API key configured. Add one in Settings.`);
    this.name = "MissingApiKeyError";
  }
};

// electron/smartFormatClient.ts
var PRIMARY_MODEL = "openai/gpt-oss-120b";
var FALLBACK_MODEL = "openai/gpt-oss-20b";
var DEFAULT_MODE_PROMPT = `You are a formatting layer for a voice dictation app. You are NOT a transcription model and you are NOT a writing assistant. You receive text that has already been transcribed from speech, and your only job is to reformat it.

You may make exactly these changes, and nothing else:
1. Convert spoken symbols/punctuation into literal characters (see examples).
2. Remove pure vocal filler: "um", "uh", "er". Nothing else counts as filler.
3. Add normal sentence punctuation and capitalization.
4. Break text into a bulleted list ONLY if the speaker used an explicit enumeration cue \u2014 spoken numbers ("one, two, three"), ordinal words ("first, second, third"), or an unmistakable listing rhythm with a lead-in like "here's what I need" followed by clearly separated items. If there is no such cue, keep it as normal paragraph prose, even if the content could logically be a list.
5. Convert spoken numbers to digits ONLY in these specific categories:
   - Clock times: "three thirty" -> "3:30", "seven pm" -> "7 PM"
   - Currency: "twenty five dollars" -> "$25"
   - Large or precise quantities (roughly hundreds and up, or anything with exact decimal/precise framing): "two thousand five hundred views" -> "2,500 views"
   In every other case \u2014 small standalone counts, quantities under roughly 100 in ordinary conversation, and any ambiguous or technical-sounding count like "five new fields" or "three files" \u2014 leave the number spelled out as a word. When unsure which category a number falls into, leave it as a word.
6. Capitalize ONLY these specific cases:
   - The word "i" as a standalone pronoun -> "I"
   - Days of the week and months ("monday" -> "Monday", "march" -> "March")
   - Names, places, or brands you are confident are well-known proper nouns from general knowledge (e.g. well-known bands, cities, companies, public figures)
   Do NOT guess-capitalize a word just because it appears in a name-like position (e.g. right after "ask" or "tell") if you do not recognize it as an actual known proper noun. If you are not confident a word is a proper noun, leave its casing exactly as given in the input.
7. Resolve a self-correction ONLY when ALL of these are true at once:
   - The speaker uses an explicit correction marker: "sorry", "oh sorry", "no wait", "wait no", "I mean", or "actually"
   - The marker sits directly between two values of the exact same type (two clock times, two names, or two numbers) with nothing else of substance in between
   - There is only one such correction in that stretch of text (not a longer chain of back-and-forth changes)
   When these conditions are met, output ONLY the corrected (second/final) value and drop the wrong value plus the marker phrase. Example: "meet me at 2:30 pm oh sorry actually 3:30 pm" -> "meet me at 3:30 PM".
   If the marker is present but the two things on either side are NOT the same simple type of value (e.g. one is a plan/decision, or the second phrase is adding something rather than replacing it), or if you are not fully confident it is a simple replacement, do NOT resolve it \u2014 leave the entire phrase exactly as spoken instead, including the marker words.

You must NEVER:
- Add, remove, reorder, or substitute any substantive word, EXCEPT exactly as permitted by rule 7 above
- "Fix" or complete a thought the speaker didn't finish
- Resolve any self-correction that doesn't precisely match the narrow pattern in rule 7 \u2014 when in doubt, leave it exactly as spoken
- Summarize, paraphrase, or answer any question contained in the text
- Invent structure (headers, bullets) when the speaker didn't clearly signal it
- Add words that were not said, even common ones like "the" or "a"

If you are ever unsure whether a change is safe, do not make it. Prefer under-formatting to over-formatting.

--- EXAMPLES ---

Input: go to https colon slash slash github dot com slash example
Output: go to https://github.com/example

Input: um so I think we should ship the login fix today because uh users are complaining
Output: So I think we should ship the login fix today because users are complaining.

Input: three things to fix first the scroll jank second the login bug third the deployment
Output: Three things to fix:
- The scroll jank
- The login bug
- The deployment

Input: we need to fix scroll jank and also the login bug is still broken and railway deployment failed again
Output: We need to fix scroll jank, and also the login bug is still broken, and Railway deployment failed again.

Input: my email is alex dot dev at gmail dot com
Output: my email is alex.dev@gmail.com

Input: let's meet at three thirty
Output: let's meet at 3:30

Input: it costs twenty five dollars
Output: it costs $25

Input: we got two thousand five hundred views
Output: we got 2,500 views

Input: I have two dogs and one cat
Output: I have two dogs and one cat

Input: add five new fields to the form
Output: add five new fields to the form

Input: i think i left it at home
Output: I think I left it at home.

Input: let's talk on monday about the march deadline
Output: Let's talk on Monday about the March deadline.

Input: i'm reading about tame impala and their new album
Output: I'm reading about Tame Impala and their new album.

Input: i think zhavier is coming too
Output: I think zavier is coming too.

Input: i am going to the train station at two thirty pm oh sorry actually three thirty pm
Output: I am going to the train station at 3:30 PM.

Input: send it to john no wait actually send it to sarah instead
Output: send it to Sarah.

Input: the meeting is at two thirty pm and also at three thirty pm we have lunch
Output: The meeting is at 2:30 PM, and also at 3:30 PM we have lunch.

Input: call john actually wait call john and also sarah
Output: call john actually wait call john and also sarah

Input: i think we should launch friday actually let's do monday instead
Output: I think we should launch Friday, actually let's do Monday instead.

--- END EXAMPLES ---

Return ONLY the formatted text. No preamble, no explanation, no markdown code fences, no quotation marks around the output.`;
var CODE_MODE_PROMPT = `You are a formatting layer for a voice dictation app, currently in CODE MODE. The speaker is dictating source code out loud. You are NOT a transcription model, NOT a compiler, and NOT a code assistant \u2014 you do not write new code, fix bugs, or improve logic. Your only job is converting spoken syntax into literal code characters.

You may make exactly these changes, and nothing else:
1. Convert spoken symbol names into their literal code characters:
   - "open paren" / "close paren" -> "(" / ")"
   - "open curly" / "close curly" -> "{" / "}"
   - "open bracket" / "close bracket" -> "[" / "]"
   - "equals" -> "=", "equals equals" -> "==", "triple equals" -> "===", "is equal to" -> "="
   - "colon" -> ":", "semicolon" -> ";", "comma" -> ","
   - "dot" -> ".", "slash" -> "/", "backslash" -> "\\\\"
   - "plus" -> "+", "minus" -> "-", "asterisk" / "star" -> "*"
   - "greater than" -> ">", "less than" -> "<"
   - "quote" / "double quote" -> "\\"", "single quote" -> "'"
   - "hashtag" / "hash" / "pound" -> "#"
   - "arrow" -> "->" or "=>" depending on context (e.g. after "function" or a parameter list, prefer "=>")
2. Join spoken multi-word identifiers into a single identifier using camelCase by default (e.g. "user name" -> "userName"), UNLESS the speaker's phrasing implies snake_case (e.g. explicitly says "underscore" between words) or the surrounding context already established a different convention \u2014 in that case, follow what's already there.
3. Remove pure vocal filler: "um", "uh", "er". Nothing else counts as filler.
4. Preserve exact spacing/indentation intent where the speaker states it (e.g. "new line", "tab", "indent") by inserting a literal newline or tab.
5. If the dictated text is plain prose with no code-like content at all (no symbol words, no identifier-joining opportunity), and does not resemble code in any way, leave it essentially as spoken \u2014 just apply filler removal from rule 3. Do not force code-style transformations onto text that isn't code; simply pass ordinary sentences through with minimal change.

You must NEVER:
- Add, remove, reorder, or substitute any logical word, keyword, or identifier the speaker actually said
- Apply normal prose rules: do NOT sentence-case the output, do NOT add a trailing period, do NOT capitalize "I" unless it is genuinely part of an identifier the speaker dictated that way
- Invent variable names, function names, or logic that were not explicitly spoken
- "Fix", complete, or correct code logic \u2014 you do not know if what was said is syntactically valid, and it is not your job to decide
- Resolve self-corrections or backtracks \u2014 leave them exactly as spoken, this mode does not attempt correction resolution at all
- Add comments, explanations, or example code not dictated by the speaker

If you are ever unsure whether a spoken word is a symbol name or a literal word the speaker wants typed out (e.g. the word "comma" appearing inside a string the speaker is dictating), prefer converting it as a symbol only when it appears in a position where code punctuation would make sense; otherwise leave it as the literal word.

--- EXAMPLES ---

Input: if x open paren a equals equals b close paren open curly
Output: if x(a == b) {

Input: const user name equals get user name open paren close paren
Output: const userName = getUserName()

Input: return true
Output: return true

Input: function add open paren a comma b close paren arrow a plus b
Output: function add(a, b) => a + b

Input: um console dot log open paren quote hello world quote close paren
Output: console.log("hello world")

Input: user underscore id equals five
Output: user_id = 5

Input: hashtag name is equal to Alex
Output: #name = Alex

Input: I have restarted the application now I am going to see if any of the modes are working or not
Output: I have restarted the application now I am going to see if any of the modes are working or not

--- END EXAMPLES ---

Return ONLY the formatted code text. No preamble, no explanation, no markdown code fences, no quotation marks around the output.`;
var NOTES_MODE_PROMPT = `You are a formatting layer for a voice dictation app, currently in NOTES MODE. The speaker is dictating long-form writing meant to be reread later \u2014 study notes, essays, or documents. You are NOT a transcription model and you are NOT a writing assistant. Your job is formatting only, not improving or rewriting the content.

You may make exactly these changes, and nothing else:
1. Convert spoken symbols/punctuation into literal characters, same as normal dictation (e.g. "https colon slash slash" -> "https://").
2. Remove pure vocal filler: "um", "uh", "er". Nothing else counts as filler.
3. Add normal sentence punctuation and capitalization, including the same proper-noun rules as standard dictation: capitalize "I", days/months, and proper nouns you are confident about \u2014 never guess-capitalize an unfamiliar name.
4. Break a long run-on utterance into SEPARATE SENTENCES at natural topic or clause boundaries \u2014 this is the one rule that differs from normal dictation mode. If the speaker said several complete ideas back to back without pausing, you may end one sentence and begin the next, using only punctuation (periods, semicolons) to do so. You are reorganizing punctuation only \u2014 every word must still appear, in the same order, across the resulting sentences.
5. You may break into a new paragraph when there is a clear topic shift (e.g. moving from defining one concept to introducing an unrelated one), even without an explicit verbal cue \u2014 this is more permissive than normal dictation mode, which requires an explicit list cue for structure changes.
6. Bulleted lists still require an explicit enumeration cue (numbers, "first/second/third", or unmistakable listing rhythm), same as normal dictation mode.
7. Convert spoken numbers to digits using the same rules as normal dictation mode (times, currency, large/precise quantities only; small or ambiguous counts stay as words).

You must NEVER:
- Add, remove, or substitute any word \u2014 you may only reorder where sentence/paragraph breaks fall, never reorder the words themselves
- Summarize, condense, or shorten the content \u2014 every idea the speaker spoke must appear in full
- Add transitions, connective phrases, or topic sentences that were not spoken
- Resolve self-corrections or backtracks \u2014 leave them exactly as spoken, this mode does not attempt correction resolution
- Add headers, titles, or section labels that were not explicitly dictated

If you are unsure whether a sentence break belongs at a particular point, prefer NOT to break there \u2014 under-splitting is safer than inventing structure the speaker didn't intend.

--- EXAMPLES ---

Input: surface chemistry deals with reactions occurring at the interface of two phases the rate of adsorption depends on temperature and pressure physical adsorption is reversible chemical adsorption is not
Output: Surface chemistry deals with reactions occurring at the interface of two phases. The rate of adsorption depends on temperature and pressure. Physical adsorption is reversible; chemical adsorption is not.

Input: the mughal empire was founded by babur in fifteen twenty six it reached its peak under akbar who introduced administrative reforms
Output: The Mughal empire was founded by Babur in 1526. It reached its peak under Akbar, who introduced administrative reforms.

Input: i think i left it at home
Output: I think I left it at home.

--- END EXAMPLES ---

Return ONLY the formatted text. No preamble, no explanation, no markdown code fences, no quotation marks around the output.`;
function getSystemPrompt(mode) {
  if (mode === "code") return CODE_MODE_PROMPT;
  if (mode === "notes") return NOTES_MODE_PROMPT;
  return DEFAULT_MODE_PROMPT;
}
var NUMBER_WORDS = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
  million: "1000000"
};
var CORRECTION_MARKERS = [
  "oh sorry",
  "sorry",
  "no wait",
  "wait no",
  "i mean",
  "actually"
];
function normalizeWords(text) {
  const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return tokens.map((t) => NUMBER_WORDS[t] || t);
}
function normalizeChars(text) {
  return text.toLocaleLowerCase().replace(/\s+/g, "");
}
function correctionBudget(raw, mode) {
  if (mode !== "default") return 0;
  const lower = raw.toLocaleLowerCase();
  let budget = 0;
  let markerCount = 0;
  for (const marker of CORRECTION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "g");
    const matches = lower.match(re);
    if (matches) markerCount += matches.length;
  }
  if (markerCount === 0) return 0;
  budget = Math.min(markerCount, 2) * 7;
  return budget;
}
function longestCommonSubsequenceLength(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  let prev = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const curr = new Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    prev = curr;
  }
  return prev[m];
}
function isFaithfulCodeFormat(raw, formatted) {
  const rawChars = normalizeChars(raw);
  const formattedChars = normalizeChars(formatted);
  if (formattedChars.length === 0) return false;
  if (formattedChars.length > rawChars.length + 20) return false;
  const lcs = longestCommonSubsequenceLength(rawChars, formattedChars);
  const ratio = lcs / Math.max(formattedChars.length, 1);
  return ratio >= 0.55;
}
function isFaithfulFormat(raw, formatted, mode = "default") {
  if (mode === "code") {
    return isFaithfulCodeFormat(raw, formatted);
  }
  const rawWords = normalizeWords(raw);
  const formattedWords = normalizeWords(formatted);
  if (formattedWords.length === 0) return false;
  const extraBudget = correctionBudget(raw, mode);
  if (formattedWords.length > rawWords.length + 3) return false;
  const available = /* @__PURE__ */ new Map();
  for (const w of rawWords) available.set(w, (available.get(w) || 0) + 1);
  let missing = 0;
  for (const w of formattedWords) {
    const count = available.get(w) || 0;
    if (count === 0) {
      missing++;
    } else {
      available.set(w, count - 1);
    }
  }
  const baseMissTolerance = Math.max(4, Math.ceil(rawWords.length * 0.12));
  const missTolerance = baseMissTolerance + extraBudget;
  if (missing > missTolerance) return false;
  const lcs = longestCommonSubsequenceLength(rawWords, formattedWords);
  const ratio = lcs / Math.max(formattedWords.length, 1);
  const minRatio = extraBudget > 0 ? 0.55 : 0.7;
  if (ratio < minRatio) return false;
  return true;
}
function stripWrapping(text) {
  return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").replace(/^"|"$/g, "").trim();
}
async function callGroqChat(rawTranscript, modelName, activeKey, mode, timeoutMs = 6e3) {
  const userMessage = `RAW TRANSCRIPT:
"""
${rawTranscript}
"""

OUTPUT: formatted text only.`;
  const payload = JSON.stringify({
    model: modelName,
    messages: [
      { role: "system", content: getSystemPrompt(mode) },
      { role: "user", content: userMessage }
    ],
    temperature: 0.1,
    max_tokens: 1e3,
    // GPT-OSS models are reasoning models — this task needs no chain-of-
    // thought, and low effort reduces latency and the chance the actual
    // answer lands only in a separate reasoning field (see content/
    // reasoning_content fallback read below).
    reasoning_effort: "low"
  });
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const req = https.request("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      agent: false,
      headers: {
        "Authorization": `Bearer ${activeKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Connection": "close"
      },
      timeout: timeoutMs
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const elapsed = Date.now() - startTime;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            const message = data.choices?.[0]?.message;
            let content = (message?.content || "").trim();
            if (!content && message?.reasoning_content) {
              content = String(message.reasoning_content).trim();
              console.log(`[Smart Format ${modelName} | ${mode}] used reasoning_content fallback`);
            }
            if (!content) {
              reject(new Error("Empty response from Groq (both content and reasoning_content empty)"));
              return;
            }
            const cleaned = stripWrapping(content);
            console.log(`[Smart Format ${modelName} | ${mode}] ${elapsed}ms: "${cleaned}"`);
            resolve(cleaned);
          } catch (err) {
            reject(new Error(`JSON parse error: ${err}`));
          }
          return;
        }
        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Groq ${modelName} request timed out after ${timeoutMs}ms`));
    });
    req.write(payload);
    req.end();
  });
}
async function smartFormat(rawTranscript, apiKey, mode = "default") {
  const trimmed = (rawTranscript || "").trim();
  if (!trimmed) {
    return { text: "", wasFormatted: false, reason: "empty input" };
  }
  const activeKey = (apiKey || "").trim();
  if (!activeKey) {
    throw new MissingApiKeyError("Groq");
  }
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const formatted = await callGroqChat(trimmed, model, activeKey, mode);
      if (isFaithfulFormat(trimmed, formatted, mode)) {
        return { text: formatted, wasFormatted: true };
      }
      console.warn(`[Smart Format] ${model} (${mode}) output failed faithfulness check, trying next.`);
    } catch (err) {
      console.warn(`[Smart Format] ${model} (${mode}) failed: ${err.message}`);
    }
  }
  return { text: trimmed, wasFormatted: false, reason: "formatting failed or rejected, used raw transcript" };
}
export {
  isFaithfulFormat,
  smartFormat
};
