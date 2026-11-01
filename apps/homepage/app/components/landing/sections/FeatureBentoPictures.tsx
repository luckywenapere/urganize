// The pictures inside the feature bento's tiles (#954): the app drawn in HTML
// and SVG, no image files. Decorative (the tile's sentence says it all), so
// FeatureGridSection marks each one aria-hidden. Names are the Northline
// Music demo team's, all made up. Styles in feature-bento.css.

function Check() {
  return (
    <svg className="fb-ic" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Bar({ w, h, dark }: { w: number; h?: number; dark?: boolean }) {
  return <span className={dark ? "fb-bx d" : "fb-bx"} style={{ width: w, height: h }} />;
}

// Placeholder curator rows under the two named ones: [name, line] widths.
const GHOST_ROWS = [
  [96, 64],
  [80, 50],
  [104, 60],
  [70, 46],
  [90, 56],
] as const;

// Placeholder sidebar: a group label, then nav rows; null marks Pitch this!.
const SIDE_NAV = [34, 70, 56, 44, 62, 74, 40, null, 66] as const;
const SIDE_GROUPS = new Set([0, 3, 6]);

/** Pitching: Pitch this! with the kit attached; editors move to Pitched and a curator to Opened. */
export function PitchPicture() {
  return (
    <div className="fb-win fb-ui">
      <div className="fb-chrome">
        <i />
        <i />
        <i />
        <span className="fb-url">app.urganize.app</span>
      </div>
      <div className="fb-app">
        <div className="fb-side">
          {SIDE_NAV.map((w, i) =>
            w === null ? (
              <span className="fb-nav on" key={i}>
                <svg className="fb-ic" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
                  <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
                </svg>
                Pitch this!
              </span>
            ) : SIDE_GROUPS.has(i) ? (
              <span className="fb-grp" key={i}>
                <Bar w={w} h={5} />
              </span>
            ) : (
              <span className="fb-nav" key={i}>
                <span className="fb-sq" />
                <Bar w={w} />
              </span>
            ),
          )}
        </div>
        <div className="fb-main">
          <div className="fb-rel">
            <b>Harmattan Gold</b>
            <span className="fb-bx fb-who" style={{ width: 58 }} />
            <span className="fb-kit">
              <svg className="fb-ic" viewBox="0 0 24 24">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Kit attached
            </span>
          </div>
          <div className="fb-card fb-ed">
            <span className="fb-marks">
              <svg viewBox="0 0 24 24">
                <path
                  fill="#1DB954"
                  d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                />
              </svg>
              <svg viewBox="0 0 24 24">
                <path
                  fill="#FA243C"
                  d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z"
                />
              </svg>
            </span>
            <span className="fb-ed-t">
              <b>
                <span className="fb-ed-long">Spotify &amp; Apple Music</span>
                <span className="fb-ed-short">Editors</span>
              </b>
              <Bar w={110} />
            </span>
            <span className="fb-pill">
              <span className="now">Ready</span>
              <span className="next">
                <Check />
                Pitched
              </span>
            </span>
          </div>
          <div className="fb-card">
            <div className="fb-list-h">
              <span>Curators</span>
              <Bar w={40} />
            </div>
            <div className="fb-row">
              <span className="fb-av" style={{ background: "#b4562f" }}>L</span>
              <span className="fb-row-t">
                <b>Lagos Late Night</b>
                <Bar w={72} />
              </span>
              <span className="fb-pill">
                <span className="now">Sent</span>
                <span className="next">Opened</span>
              </span>
            </div>
            <div className="fb-row">
              <span className="fb-av" style={{ background: "#3b6ea5" }}>A</span>
              <span className="fb-row-t">
                <b>Alté Sundays</b>
                <Bar w={58} />
              </span>
              <span className="fb-pill">
                <span className="now stay">Sent</span>
              </span>
            </div>
            {GHOST_ROWS.map(([name, line], i) => (
              <div className="fb-row" key={i}>
                <span className="fb-bx d" style={{ width: 26, height: 26, borderRadius: "50%" }} />
                <span className="fb-row-t">
                  <Bar w={name} dark />
                  <Bar w={line} />
                </span>
                <span className="fb-ph" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Deadline: the handoff; the counter rolls to 2 of 2 and the last row lands. */
export function HandoffPicture() {
  return (
    <div className="fb-card fb-ho fb-ui">
      <div className="fb-ho-top">
        <span>HANDOFF</span>
        <span>DUE SAT 14 NOV</span>
      </div>
      <span className="fb-count">
        <span className="now">1 of 2 sent</span>
        <span className="next">2 of 2 sent</span>
      </span>
      <div className="fb-meter">
        <i />
      </div>
      <div>
        <div className="fb-ho-row">
          <svg className="fb-ic" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <b>Cover art</b>
          <span className="fb-av" style={{ background: "#8a5a9e" }}>D</span>
          <span className="fb-pill">
            <span className="next stay">
              <Check />
              Sent
            </span>
          </span>
        </div>
        <div className="fb-ho-row">
          <svg className="fb-ic" viewBox="0 0 24 24">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
          <b>Song details</b>
          <span className="fb-av" style={{ background: "#2f7d6a" }}>T</span>
          <span className="fb-pill">
            <span className="now warn">Due Thu</span>
            <span className="next">
              <Check />
              Sent
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** After drop day: a small stack of opportunities; the top card rises into place. */
export function OpportunityPicture() {
  return (
    <div className="fb-stack fb-ui">
      <div className="fb-sheet s3" />
      <div className="fb-sheet s2" />
      <div className="fb-sheet s1">
        <span className="fb-chip">Sync brief</span>
        <span className="fb-opp-t">TV ad, 30 seconds</span>
        <span className="fb-opp-fit">Fits the sound of Slow Lagos</span>
        <span className="fb-opp-foot">
          <span>Closes Fri 21 Nov</span>
          <b>Open</b>
        </span>
      </div>
    </div>
  );
}
