// Starter pack. {{page}} / {{selection}} are filled from the captured page;
// any other {{placeholder}} is asked for at deploy time.

const prompt = (title, collection, tags, body) => ({
  title,
  collection,
  tags,
  body,
  source: { kind: 'builtin', label: 'Starter pack' },
});

export const BUILTIN_PROMPTS = [
  // Page & research
  prompt('Explain this page simply', 'Page & research', ['summary', 'explain'],
    'Explain the attached page as if I am new to the topic. Start with a two-sentence summary, then a short glossary of every term I would need, then the three ideas that matter most.\n\nPage:\n{{page}}'),
  prompt('Bullet summary', 'Page & research', ['summary'],
    'Summarize the attached page in at most 12 bullets. Keep numbers, names and dates exact. End with "Missing:" and list what the page does not tell me.\n\n{{page}}'),
  prompt('Extract the claims', 'Page & research', ['analysis', 'fact-check'],
    'List the factual claims in the attached page. For each: the claim, the evidence the page gives for it, and whether that evidence is primary, secondary or absent.\n\n{{page}}'),
  prompt('Find the counterargument', 'Page & research', ['analysis'],
    'Steelman the strongest counterargument to the position on this page, then say which specific sentence in the page it puts under the most pressure.\n\n{{page}}'),
  prompt('Questions this page should answer', 'Page & research', ['research'],
    'Read the attached page and list the five questions a careful reader should still have. For each, say whether the answer is on the page, implied, or missing.\n\n{{page}}'),
  prompt('Extract every number', 'Page & research', ['data'],
    'Extract every number on this page into a markdown table: value, unit, what it measures, and the sentence it came from. Flag any numbers that are inconsistent.\n\n{{page}}'),
  prompt('Study notes from a page', 'Page & research', ['study'],
    'Turn the attached page into study notes: key concepts, definitions, a 10-question self-quiz with answers, and one memory hook per concept.\n\n{{page}}'),
  prompt('Compare these sources', 'Page & research', ['research', 'compare'],
    'I will paste several excerpts. Build a comparison table of where they agree, where they conflict, and which claims only one source supports.\n\nSources:\n{{selection}}'),

  // Writing
  prompt('Rewrite for clarity', 'Writing', ['editing'],
    'Rewrite the text below so a busy reader understands it on one pass. Keep every fact and every number. Cut filler, prefer concrete verbs, and keep my voice.\n\nText:\n{{selection}}'),
  prompt('Tighten to half the length', 'Writing', ['editing'],
    'Halve the length of the text below without losing information. Then list what you cut and why.\n\n{{selection}}'),
  prompt('Write in my voice', 'Writing', ['writing', 'voice'],
    'Here are samples of my writing. Describe my voice in five specific rules (sentence length, vocabulary, rhythm, what I never do), then rewrite the target text using those rules.\n\nSamples:\n{{selection}}\n\nTarget text:\n{{target}}'),
  prompt('Turn notes into a draft', 'Writing', ['writing'],
    'Turn these notes into a clean 600-word draft with a strong opening line, three sections, and a closing that states what the reader should do next. Do not invent facts.\n\nNotes:\n{{notes}}'),
  prompt('Email that gets a reply', 'Writing', ['email'],
    'Write a short email about the situation below. Lead with the ask, give one line of context, offer two concrete options, and end with a specific question. Under 130 words.\n\nSituation:\n{{situation}}'),
  prompt('Executive summary', 'Writing', ['summary', 'business'],
    'Write an executive summary of this document: one paragraph of context, three bullets of findings, one recommended decision, and the single biggest risk.\n\n{{page}}'),
  prompt('Fix my grammar only', 'Writing', ['editing'],
    'Correct grammar, spelling and punctuation in the text below. Change nothing else. Then list each correction in a table.\n\n{{selection}}'),
  prompt('Outline before writing', 'Writing', ['writing'],
    'Before any prose, give me three possible outlines for the piece described below: one persuasive, one explanatory, one narrative. For each, state the intended reader takeaway in one sentence.\n\nTopic:\n{{topic}}'),

  // Coding
  prompt('Explain this code', 'Coding', ['code', 'explain'],
    'Explain the selected code: what it does, its inputs and outputs, the assumptions it makes, and the failure modes. Then name the one thing most likely to break in production.\n\n```\n{{selection}}\n```'),
  prompt('Review this diff', 'Coding', ['code', 'review'],
    'Review this diff like a senior engineer. Report only real problems: correctness, edge cases, security, performance, and maintainability. For each, give the line, why it is wrong, and the minimal fix. If it is fine, say so plainly.\n\n```\n{{selection}}\n```'),
  prompt('Find the bug', 'Coding', ['code', 'debug'],
    'Here is the code and the error. State the most likely root cause first, then the minimal reproduction, then the fix. Do not propose a rewrite unless the design makes the bug unavoidable.\n\nCode:\n```\n{{selection}}\n```\n\nError:\n{{error}}'),
  prompt('Write tests first', 'Coding', ['code', 'testing'],
    'Write focused tests for the code below: the happy path, two boundary cases, and one case that should fail loudly. Name each test for the behavior it protects.\n\n```\n{{selection}}\n```'),
  prompt('Explain this error', 'Coding', ['code', 'debug'],
    'Explain this error message in plain language: what caused it, what the stack trace actually says, and the three most likely fixes in order of likelihood.\n\n{{selection}}'),
  prompt('Smallest working change', 'Coding', ['code'],
    'I want the outcome below. Propose the smallest change that achieves it, name the files involved, and list what you deliberately did not touch.\n\nGoal:\n{{goal}}\n\nCurrent code:\n```\n{{selection}}\n```'),
  prompt('API design sanity check', 'Coding', ['code', 'design'],
    'Critique this API design: naming, consistency, error behavior, pagination, versioning and what a caller will get wrong on their first try. Be specific and brief.\n\n```\n{{selection}}\n```'),

  // Business & marketing
  prompt('Positioning statement', 'Business', ['marketing'],
    'Write a positioning statement for the product below using this shape: for [audience] who [need], this is [category] that [benefit], unlike [alternative] it [difference]. Then list the three assumptions that must be true.\n\nProduct:\n{{product}}'),
  prompt('Cold outreach sequence', 'Business', ['marketing', 'sales'],
    'Write a four-email outreach sequence for the audience below. Each email under 90 words, one idea each, no hype adjectives. Include the subject lines and the exact ask in each.\n\nAudience and offer:\n{{product}}'),
  prompt('Meeting notes to actions', 'Business', ['productivity'],
    'Turn these meeting notes into: decisions made, open questions, action items with owners and dates, and one thing that should be escalated.\n\n{{selection}}'),
  prompt('Competitor teardown', 'Business', ['research', 'marketing'],
    'Build a competitor teardown from the attached page: audience, promise, pricing model, proof they offer, and the gap they leave open. Mark anything you are inferring.\n\n{{page}}'),
  prompt('Pricing objection handling', 'Business', ['sales'],
    'List the five most likely objections to this price, the real concern behind each, and a two-sentence response that does not discount.\n\nOffer and price:\n{{product}}'),

  // Study & thinking
  prompt('Teach me this in layers', 'Study', ['learning'],
    'Teach me the topic below in three layers: a one-paragraph intuition, a precise explanation, and a worked example. Then give me one question that proves I understood it.\n\nTopic:\n{{topic}}'),
  prompt('Socratic tutor', 'Study', ['learning'],
    'Be my Socratic tutor on the material below. Ask one question at a time, wait for my answer, correct misconceptions gently, and do not give the answer until I have tried twice.\n\nMaterial:\n{{page}}'),
  prompt('Decision journal', 'Study', ['thinking', 'decisions'],
    'Help me think through this decision. List the options, the criteria that actually matter, what I would have to believe for each option to be right, and the cheapest test I can run this week.\n\nDecision:\n{{situation}}'),
  prompt('Feynman check', 'Study', ['learning'],
    'I will explain a concept below. Grade the explanation: where it is vague, where it is wrong, and what a 12-year-old would still not understand. Then give me the one-sentence version that survives.\n\nMy explanation:\n{{selection}}'),

  // Utility
  prompt('Extract structured JSON', 'Utility', ['data', 'extraction'],
    'Convert the page below into JSON matching this schema:\n{{schema}}\n\nReturn only valid JSON. Use null for anything the page does not state.\n\n{{page}}'),
  prompt('Turn a page into a markdown table', 'Utility', ['data'],
    'Find every repetitive record on this page (products, people, rows, listings) and return them as one markdown table with stable column names.\n\n{{page}}'),
  prompt('TL;DR for my group chat', 'Utility', ['summary', 'social'],
    'Summarize this page for a group chat: three short lines, no jargon, the most surprising fact first, and a link-friendly one-line takeaway.\n\n{{page}}'),
];
