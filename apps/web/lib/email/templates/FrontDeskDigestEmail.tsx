import { Section, Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, PrimaryButton } from './components';
import { BODY_TEXT, HAIRLINE, INK, MUTED_TEXT, PAGE_BG, SPRING } from './theme';

// The UrgAns front desk daily digest (URG-381, decision 3: escalations reach the
// curator as ONE daily email, never instant pings).
//
// Built to be read in five seconds on a phone: the subject says how many
// questions and from whom, the heading repeats the count, each pitch is one
// block with its questions numbered exactly as the artist will see them, and
// there is one button. No images (blocked by default), no web fonts, inline
// styles only, tables via react-email Section for Outlook, a light ground for
// Gmail and Apple Mail dark-mode inversion (see theme.ts).

export type FrontDeskDigestPitch = {
  songTitle: string;
  artistName: string;
  service: string;
  questions: string[];
};

export type FrontDeskDigestEmailProps = {
  curatorName: string;
  pitches: FrontDeskDigestPitch[];
  /** Questions UrgAns answered on its own since the last digest. */
  answeredCount: number;
  ctaUrl: string;
};

const totalQuestions = (pitches: FrontDeskDigestPitch[]) =>
  pitches.reduce((sum, pitch) => sum + pitch.questions.length, 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function frontDeskDigestSubject(props: Pick<FrontDeskDigestEmailProps, 'pitches'>): string {
  const total = totalQuestions(props.pitches);
  const artists = Array.from(new Set(props.pitches.map((pitch) => pitch.artistName.trim()).filter(Boolean)));
  if (total === 1 && artists.length === 1) return `${artists[0]} has a question about ${props.pitches[0].songTitle}`;
  if (artists.length === 1) return `${artists[0]} has ${plural(total, 'question', 'questions')} for you`;
  return `${plural(total, 'question', 'questions')} from ${plural(artists.length, 'artist', 'artists')}`;
}

export function FrontDeskDigestEmail({ pitches, answeredCount, ctaUrl }: FrontDeskDigestEmailProps) {
  const total = totalQuestions(pitches);
  const first = pitches[0]?.questions[0] || '';
  const heading = total === 1 ? 'One question needs you' : `${total} questions need you`;
  const lead =
    answeredCount > 0
      ? `UrgAns answered ${plural(answeredCount, 'other', 'others')} from your terms. These are the ones only you can answer.`
      : 'UrgAns couldn’t answer these from your terms. Only you can.';

  return (
    <EmailLayout preview={first ? `“${first}”` : heading}>
      <Text style={{ margin: '0 0 8px', color: INK, fontSize: '22px', lineHeight: '1.3', fontWeight: 700, letterSpacing: '-0.3px' }}>
        {heading}
      </Text>
      <Text style={{ margin: '0 0 24px', color: BODY_TEXT, fontSize: '15px', lineHeight: '1.6' }}>{lead}</Text>

      {pitches.map((pitch, pitchIndex) => (
        <Section
          key={`${pitch.songTitle}-${pitchIndex}`}
          style={{
            backgroundColor: PAGE_BG,
            border: `1px solid ${HAIRLINE}`,
            borderLeft: `3px solid ${SPRING}`,
            borderRadius: '0 12px 12px 0',
            padding: '16px 20px 6px',
            margin: '0 0 14px',
          }}
        >
          <Text
            style={{
              margin: '0 0 2px',
              color: MUTED_TEXT,
              fontSize: '11px',
              lineHeight: '1.5',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {pitch.artistName}
            {pitch.service ? ` · ${pitch.service}` : ''}
          </Text>
          <Text style={{ margin: '0 0 10px', color: INK, fontSize: '17px', lineHeight: '1.35', fontWeight: 700 }}>
            {pitch.songTitle}
          </Text>
          {pitch.questions.map((question, index) => (
            <Text
              key={`${index}-${question}`}
              style={{ margin: '0 0 10px', color: INK, fontSize: '15px', lineHeight: '1.5' }}
            >
              <span style={{ color: MUTED_TEXT, fontSize: '13px', paddingRight: '8px' }}>{index + 1}.</span>
              {question}
            </Text>
          ))}
        </Section>
      ))}

      <Section style={{ margin: '22px 0 0' }}>
        <PrimaryButton href={ctaUrl}>{total === 1 ? 'Answer it' : 'Answer them'}</PrimaryButton>
      </Section>

      <FootnoteText>
        One email a day, only for questions UrgAns couldn’t answer. Your answer can become part of your terms
        with one tap, so nobody asks twice.
      </FootnoteText>
    </EmailLayout>
  );
}
