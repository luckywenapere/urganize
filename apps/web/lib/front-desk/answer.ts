// The UrgAns front desk answer engine. PURE and deterministic.
//
// THE GUARANTEE: every word of an answer that states a date, an amount, an
// inclusion, a status or a rule is copied from a stored fact (the curator's
// terms, the pitch's agreed fields, its thread, its live status). There is no
// model in this path and no free text generation, so nothing can be invented.
// The artist's question is only pattern-matched to choose WHICH fact to read.
// When no fact answers it, the engine returns an escalation: "I can't confirm
// that", what is agreed now, and a clean question for the curator.
//
// Every answer carries exactly one source, which the UI always renders.
// lib/front-desk/answer.test.ts checks both properties across the intents.

import type { DeskAnswer, DeskFacts, DeskService, DeskSource, DeskThreadMessage } from './types';
import { capitalise, formatDays, formatDeskDay, formatNaira, joinList, possessive } from './format';
import { cleanQuestion, draftQuestion, questionTokens } from './text';

const has = (pattern: RegExp, text: string) => pattern.test(text);

const termsSource = (curator: string): DeskSource => ({ kind: 'terms', label: `From ${possessive(curator)} terms` });
const statusSource = (): DeskSource => ({ kind: 'status', label: 'Pitch status' });
const agreedSource = (agreedAt: string): DeskSource => {
  const day = formatDeskDay(agreedAt);
  return { kind: 'agreed', label: day ? `Agreed terms · ${day}` : 'Agreed terms' };
};
const threadSource = (message: DeskThreadMessage): DeskSource => {
  const day = formatDeskDay(message.at);
  return { kind: 'thread', label: day ? `Agreed in thread · ${day}` : 'Agreed in thread' };
};

const answer = (intent: string, lead: string, rest: string, source: DeskSource): DeskAnswer => ({
  kind: 'answer',
  intent,
  lead: lead.trim(),
  rest: rest.trim(),
  source,
});

/** What is agreed on this pitch right now, as rows. Empty before a pitch. */
export function agreedNowRows(facts: DeskFacts): Array<{ label: string; value: string }> {
  const agreed = facts.pitch?.agreed;
  if (!agreed) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const start = formatDeskDay(agreed.startDate);
  const fee = formatNaira(agreed.feeNaira);
  if (start) rows.push({ label: 'Starts', value: start });
  if (fee) rows.push({ label: 'Fee', value: fee });
  if (!rows.length && agreed.service) rows.push({ label: 'Service', value: agreed.service });
  return rows;
}

const escalate = (intent: string, facts: DeskFacts, question: string, lead: string, rest: string): DeskAnswer => ({
  kind: 'escalate',
  intent,
  lead,
  rest,
  agreedNow: agreedNowRows(facts),
  draft: draftQuestion(question),
});

const agreedService = (facts: DeskFacts): DeskService | null => {
  const agreed = facts.pitch?.agreed;
  if (!agreed) return null;
  const byId = agreed.serviceId ? facts.terms.services.find((service) => service.id === agreed.serviceId) : null;
  if (byId) return byId;
  const name = agreed.service.trim().toLowerCase();
  return facts.terms.services.find((service) => service.name.trim().toLowerCase() === name) ?? null;
};

const tokenSet = (text: string) => new Set(questionTokens(text).filter((token) => !/^\d+$/.test(token)));

/** How many content words a fact phrase shares with the question. */
const overlap = (question: Set<string>, phrase: string): number => {
  let shared = 0;
  for (const token of tokenSet(phrase)) if (question.has(token)) shared += 1;
  return shared;
};

const GENERIC = new Set(['included', 'include', 'includ', 'come', 'part', 'with', 'service', 'package']);

const RX = {
  // Anything that asks to CHANGE what is agreed. Only the curator can; never answered.
  change:
    /\b(move|moved|moving|change|changed|reschedul\w*|postpone\w*|push(ed)? (it )?back|bring (it )?forward|earlier|later|swap|extend\w*|discount\w*|cheaper|lower|reduce\w*|refund\w*|cancel\w*|negotiat\w*|waive\w*|free of charge|for free)\b/,
  timeOfDay: /\b(what|which) time\b|\bwhat hour\b|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\bo'?clock\b/,
  guarantee: /\b(guarantee\w*|promis\w*|how many (streams|plays|listens|followers)|\d+\s?k?\s?(streams|plays|listens|followers)|streams?|results?|viral)\b/,
  payment: /\b(pay|paid|paying|payment\w*|deposit|transfer|bank|upfront|up front|invoice)\b/,
  received:
    /\b(did|have|has)\b.*\b(get|got|receive\w*|see|seen|open\w*|listen\w*|hear|heard)\b|\b(received|opened|listened)\b/,
  status: /\b(status|accepted|accept|declined|decline|passed|pass on|any news|update|where are we|added it|add it|yet)\b/,
  start: /\b(start\w*|begin\w*|kick off|go(es)? live|first day|slot)\b|\bwhen\b.*\b(placement|playlist|it run|go(es)? on)\b/,
  duration: /\b(how long|duration|run(s|ning)? for|last(s)?|stay(s)? on|until when|end\w*|finish\w*)\b/,
  reply: /\b(reply|replies|respond\w*|response|hear back|get back)\b/,
  send: /\b(send|submit\w*|provide|need from me|need (to )?(give|send)|materials?|assets?|files?|epk|clean version|what do (you|they) need)\b/,
  genre: /\b(genre\w*|do (you|they) (take|accept|play)|afro\w*|amapiano|hip ?hop|rap|gospel|r ?& ?b|rnb|alt[eé]|drill|highlife|fuji|pop|dancehall|reggae|soul|jazz|rock|gqom|street ?pop)\b/,
  inclusion: /\b(include\w*|come(s)? with|part of|what do i get|what'?s in|whats in|story|stories|post\w*|ig|instagram|tweet\w*|tiktok|feature\w*|interview\w*|spotlight|shout ?out|placement)\b/,
  price: /(₦|\bngn\b|\bnaira\b|\bprice\w*|\bcost\w*|\bhow much\b|\bfee\w*|\brate\w*|\bcharge\w*|\bbudget\b)/,
  services: /\b(services?|packages?|offer\w*|options?|what do you do|what can you do)\b/,
};

const INCLUSION_VERB = /\b(include\w*|come(s)? with|part of|what do i get)\b/;

const GENRE_WORDS = /\b(afrobeats?|afro-?soul|afro-?pop|afro-?fusion|amapiano|hip ?hop|rap|gospel|r ?& ?b|rnb|alt[eé]|drill|highlife|fuji|pop|dancehall|reggae|soul|jazz|rock|gqom|street ?pop)\b/;

const foldGenre = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const ruleMatching = (facts: DeskFacts, pattern: RegExp) =>
  facts.terms.rules.find((rule) => pattern.test(rule.text.toLowerCase())) ?? null;

/** The thread messages, newest first. A newer curator message beats an older one. */
const threadNewestFirst = (facts: DeskFacts) =>
  [...(facts.pitch?.thread ?? [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

const sentence = (text: string) => {
  const trimmed = text.trim().replace(/[.\s]+$/, '');
  return trimmed ? `${capitalise(trimmed)}.` : '';
};

export function answerDeskQuestion(facts: DeskFacts, rawQuestion: string): DeskAnswer | null {
  const question = cleanQuestion(rawQuestion);
  if (!question) return null;
  const q = question.toLowerCase();
  const words = tokenSet(question);
  const curator = facts.curatorName.trim() || 'The curator';
  const pitch = facts.pitch;
  const agreed = pitch?.agreed ?? null;
  const { terms } = facts;
  const notInTerms = (intent: string) =>
    escalate(intent, facts, question, "That's not in their terms yet.", `Only ${curator} can answer that.`);

  // 1. Changes are never answered: only the curator can change what is agreed.
  if (has(RX.change, q)) {
    const thing = has(/\b(start|date|day|move|reschedul|postpone|earlier|later|slot|back|forward)/, q)
      ? 'the start date'
      : has(/\b(fee|price|discount|cheaper|lower|reduce|waive|free|cost|rate)/, q)
        ? 'the fee'
        : 'that';
    return escalate('change', facts, question, "I can't confirm that.", `Only ${curator} can change ${thing}.`);
  }

  // 2. Time of day is never in the facts (terms hold days, not hours).
  if (has(RX.timeOfDay, q)) return notInTerms('time_of_day');

  // 3. Guarantees and results: only a house rule may speak to them.
  if (has(RX.guarantee, q)) {
    const rule = ruleMatching(facts, /guarantee|stream|result|promise/);
    return rule ? answer('guarantee', sentence(rule.text), '', termsSource(curator)) : notInTerms('guarantee');
  }

  // 4. Payment happens off-platform; only the curator's own rule can describe it.
  if (has(RX.payment, q) && !has(RX.price, q.replace(/\bpay\b/g, ''))) {
    const rule = ruleMatching(facts, /\bpa(y|id|yment)\b/);
    return rule ? answer('payment', sentence(rule.text), '', termsSource(curator)) : notInTerms('payment');
  }

  // 5. Did they get it / where is it: the live pitch status.
  if (pitch && (has(RX.received, q) || has(RX.status, q))) {
    const opened = formatDeskDay(pitch.statusAt);
    const sent = formatDeskDay(pitch.sentAt);
    const asksReceived = has(RX.received, q);
    switch (pitch.status) {
      case 'new':
        return answer(
          'status',
          asksReceived ? `Yes, it arrived${sent ? ` ${sent}` : ''}.` : 'Waiting.',
          asksReceived ? "They haven't opened it yet." : `Sent${sent ? ` ${sent}` : ''}, not opened yet.`,
          statusSource()
        );
      case 'listened':
        return answer('status', `Yes, opened${opened ? ` ${opened}` : ''}.`, 'No decision yet.', statusSource());
      case 'added':
        return answer(
          'status',
          `Yes, ${curator} added it.`,
          `It's on ${pitch.playlistName}${opened ? ` since ${opened}` : ''}.`,
          statusSource()
        );
      case 'passed':
        return answer('status', `${curator} passed on this one.`, opened ? `Decided ${opened}.` : '', statusSource());
      case 'accepted':
        return answer(
          'status',
          `Yes, ${curator} accepted.`,
          agreed?.startDate ? `It starts ${formatDeskDay(agreed.startDate)}.` : '',
          statusSource()
        );
      case 'live':
        return answer('status', "Yes, it's live.", `On ${pitch.playlistName}.`, statusSource());
    }
  }

  // 6. Reply time (before "how long", which also matches the duration words).
  if (has(RX.reply, q)) {
    const within = formatDays(terms.timing.repliesWithinDays);
    if (!within) return notInTerms('reply_time');
    const sent = pitch && pitch.status === 'new' ? formatDeskDay(pitch.sentAt) : '';
    return answer('reply_time', `Within ${within}.`, sent ? `Your pitch went in ${sent}.` : '', termsSource(curator));
  }

  // 7. How long it runs.
  if (has(RX.duration, q)) {
    const start = formatDeskDay(agreed?.startDate);
    const end = formatDeskDay(agreed?.endDate);
    const runsFor = terms.timing.runsFor?.trim() || '';
    if (agreed && start && end) {
      return answer('duration', runsFor ? `${capitalise(runsFor)}:` : `${start} to ${end}.`, runsFor ? `${start} to ${end}.` : '', agreedSource(agreed.agreedAt));
    }
    if (runsFor) return answer('duration', `${capitalise(runsFor)}.`, '', termsSource(curator));
    return notInTerms('duration');
  }

  // 8. When it starts.
  if (has(RX.start, q)) {
    const start = formatDeskDay(agreed?.startDate);
    if (agreed && start) {
      const service = agreedService(facts);
      const end = formatDeskDay(agreed.endDate);
      const summary = service?.summary?.trim() || '';
      const rest = [summary ? capitalise(summary) : '', end ? `until ${end}` : ''].filter(Boolean).join(', ');
      return answer('start', `${start}.`, rest ? `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.` : '', agreedSource(agreed.agreedAt));
    }
    const startsOn = terms.timing.startsOn?.trim() || '';
    const ahead = formatDays(terms.timing.bookAheadDays);
    if (!startsOn && !ahead) return notInTerms('start');
    const rule = [startsOn ? `${curator} starts placements on ${startsOn}` : '', ahead ? `booked ${ahead} ahead` : '']
      .filter(Boolean)
      .join(', ');
    return answer('start', pitch ? 'Not set yet.' : startsOn ? `On ${startsOn}.` : `Book ${ahead} ahead.`, `${rule}.`, termsSource(curator));
  }

  // 9. What to send.
  if (has(RX.send, q)) {
    if (!terms.send.length) return notInTerms('send');
    return answer('send', sentence(joinList(terms.send)), '', termsSource(curator));
  }

  // 10. Genres. A named genre that is not listed is escalated, never refused:
  // "not listed" is not the same as "no".
  if (has(RX.genre, q) && !has(RX.inclusion, q)) {
    if (!terms.genres.length) return notInTerms('genre');
    const named = q.match(GENRE_WORDS)?.[0] ?? '';
    if (named) {
      const hit = terms.genres.find((genre) => foldGenre(genre) === foldGenre(named) || foldGenre(genre).startsWith(foldGenre(named)));
      if (!hit) return notInTerms('genre');
      return answer('genre', `Yes, ${hit} is one they take.`, '', termsSource(curator));
    }
    return answer('genre', sentence(joinList(terms.genres)), '', termsSource(curator));
  }

  // 11. Price. With an agreed fee, only that fee; never an upsell. Checked
  // before inclusions so "How much is Spotlight?" is a price question.
  if (has(RX.price, q) && !has(INCLUSION_VERB, q)) {
    if (agreed && formatNaira(agreed.feeNaira)) {
      return answer('price', `${formatNaira(agreed.feeNaira)}.`, `Agreed for ${agreed.service}.`, agreedSource(agreed.agreedAt));
    }
    const own = agreedService(facts);
    if (own && formatNaira(own.rateNaira)) {
      return answer('price', `${formatNaira(own.rateNaira)}.`, `${capitalise(own.name)}.`, termsSource(curator));
    }
    const named = terms.services
      .map((service) => ({ service, score: overlap(words, service.name) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.service;
    if (named && formatNaira(named.rateNaira)) {
      return answer('price', `${formatNaira(named.rateNaira)}.`, `${capitalise(named.name)}.`, termsSource(curator));
    }
    const priced = terms.services.filter((service) => formatNaira(service.rateNaira));
    if (!priced.length || pitch) return notInTerms('price');
    return answer(
      'price',
      `From ${formatNaira(Math.min(...priced.map((service) => service.rateNaira as number)))}.`,
      priced.map((service) => `${service.name} ${formatNaira(service.rateNaira)}`).join(', ') + '.',
      termsSource(curator)
    );
  }

  // 12. Inclusions: thread first (a curator's own word beats the terms), then the
  // agreed service, then another service. Naming a bigger package happens ONLY
  // here, when the artist asks for something their package does not cover.
  if (has(RX.inclusion, q)) {
    const asked = new Set(Array.from(words).filter((word) => !GENERIC.has(word)));
    const ownService = agreedService(facts);

    for (const message of threadNewestFirst(facts)) {
      if (message.from !== 'curator') continue;
      const item = (message.adds ?? []).find((add) => overlap(asked, add) > 0);
      if (item) {
        const inOwn = ownService ? ownService.includes.some((inc) => overlap(tokenSet(item), inc) > 0) : false;
        return answer(
          'inclusion',
          `Yes, ${item}.`,
          inOwn || !ownService ? `${curator} added it.` : `It isn't part of standard ${ownService.name.toLowerCase()}. ${curator} added it.`,
          threadSource(message)
        );
      }
    }

    const best = (service: DeskService) =>
      service.includes.reduce<{ item: string; score: number }>(
        (top, inc) => {
          const score = overlap(asked, inc);
          return score > top.score ? { item: inc, score } : top;
        },
        { item: '', score: 0 }
      );

    if (ownService && agreed) {
      const own = best(ownService);
      if (own.score > 0) return answer('inclusion', `Yes, ${own.item.toLowerCase()}.`, `It's part of ${ownService.name}.`, agreedSource(agreed.agreedAt));
    }

    const others = terms.services
      .filter((service) => service !== ownService)
      .map((service) => ({ service, ...best(service) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);
    if (others.length) {
      const { service, item } = others[0];
      const rate = formatNaira(service.rateNaira);
      const comes = `${capitalise(item)} comes with ${service.name}${rate ? ` (${rate})` : ''}.`;
      if (ownService) return answer('inclusion', `Not in ${ownService.name}.`, comes, termsSource(curator));
      return answer('inclusion', `With ${service.name}.`, comes, termsSource(curator));
    }

    // "What's included?" with no item named: the package itself.
    if (asked.size === 0 || has(/what'?s in|whats in|what do i get|what does it include|what is included|what'?s included/, q)) {
      if (ownService && ownService.includes.length) {
        return answer('inclusion', sentence(joinList(ownService.includes)), `That's ${ownService.name}.`, agreed ? agreedSource(agreed.agreedAt) : termsSource(curator));
      }
      if (!pitch && terms.services.length) {
        const lines = terms.services.map((service) => `${service.name}: ${joinList(service.includes) || service.summary}`);
        return answer('inclusion', `${terms.services.length} options.`, lines.join('. ') + '.', termsSource(curator));
      }
    }
    return notInTerms('inclusion');
  }

  // 13. What they offer (pre-pitch).
  if (has(RX.services, q)) {
    if (!terms.services.length) return notInTerms('services');
    return answer(
      'services',
      sentence(joinList(terms.services.map((service) => service.name))),
      '',
      termsSource(curator)
    );
  }

  // 14. Any house rule that clearly speaks to the question.
  const rule = terms.rules
    .map((item) => ({ item, score: overlap(words, item.text) }))
    .filter((hit) => hit.score >= 2)
    .sort((a, b) => b.score - a.score)[0]?.item;
  if (rule) return answer('rule', sentence(rule.text), '', termsSource(curator));

  return notInTerms('unknown');
}

/** The three suggested questions under "Ask about this pitch". */
export function suggestedDeskQuestions(facts: DeskFacts): string[] {
  if (!facts.pitch) return ['What do you offer?', 'What should I send?', 'How fast do you reply?'];
  return ['When does it start?', "What's included?", 'Did they get my song?'];
}
