const teal = '#52E0C4';
const muted = '#7C8CA1';
const faint = 'rgba(255,255,255,0.10)';
const surface = '#111720';
const surfaceDeep = '#0B0C0E';

export function StudyScene() {
  return <svg className="illustration" viewBox="0 0 420 220" role="img" aria-label="Line drawing of a person studying at a monitor, with a gaze cone crossing from their eyes to the screen">
    <g fill="none" stroke={faint} strokeWidth="1.2" strokeLinecap="round">
      <path d="M24 190h372" />
      <path d="M24 190v-6M396 190v-6" />
      <path d="M60 54h96" strokeDasharray="2 7" />
    </g>
    <g fill="none" stroke={muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M86 190v-24c0-14 11-25 25-25h12c14 0 25 11 25 25v24" fill={surface} />
      <circle cx="117" cy="112" r="20" fill={surface} />
      <path d="M96 138c7-7 35-7 42 0" strokeOpacity=".55" />
      <path d="M132 190c2-16 12-26 26-26h6" strokeOpacity=".4" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M137 106l-4 4 4 4" strokeOpacity=".6" />
      <path d="M138 108c46-14 92-18 138-17" strokeOpacity=".38" strokeDasharray="3 6" />
      <path d="M138 112c46 12 92 16 138 15" strokeOpacity=".2" strokeDasharray="3 6" />
    </g>
    <g fill="none" stroke={muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="196" y="48" width="176" height="108" rx="10" fill={surfaceDeep} />
      <path d="M258 156h52l9 16h-70z" fill={surfaceDeep} />
      <path d="M238 172h92" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M246 126c8 0 9-30 17-30s9 30 17 30 8-22 15-22 8 22 15 22 8-14 13-14 7 14 12 14" strokeOpacity=".85" />
      <path d="M246 70h30M246 80h18" strokeOpacity=".45" />
      <circle cx="342" cy="72" r="3.2" fill={teal} stroke="none" />
      <circle cx="342" cy="72" r="7.5" strokeOpacity=".22" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.2" strokeOpacity=".35">
      <path d="M212 98h16M212 106h16M212 114h16" />
    </g>
  </svg>;
}

export function CameraStep() {
  return <svg className="illustration" viewBox="0 0 260 112" role="img" aria-label="Diagram of a webcam capturing facial landmarks">
    <g fill="none" stroke={faint} strokeWidth="1.2" strokeLinecap="round">
      <path d="M20 96h220" />
      <path d="M56 30h18M56 30v18M204 30h-18M204 30v18M56 82h18M56 82V64M204 82h-18M204 82V64" strokeOpacity=".6" />
    </g>
    <g fill="none" stroke={muted} strokeWidth="1.35" strokeLinecap="round">
      <rect x="86" y="20" width="88" height="58" rx="9" fill={surface} />
      <path d="M106 78h48l7 12h-62z" fill={surface} />
      <circle cx="130" cy="88" r="1.6" fill={muted} />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 42c0-9 7-16 16-16s16 7 16 16v12c0 9-7 16-16 16s-16-7-16-16z" strokeOpacity=".9" />
      <path d="M118 42h7M127 42h7M124 45v6M119 55h12" strokeOpacity=".55" />
      <path d="M96 49h-6M164 49h6" strokeOpacity=".3" strokeDasharray="2 5" />
    </g>
  </svg>;
}

export function CalibrationStep() {
  const points = [38, 62, 86];
  return <svg className="illustration" viewBox="0 0 260 112" role="img" aria-label="Nine calibration targets on a screen, one highlighted">
    <g fill="none" stroke={faint} strokeWidth="1.2" strokeLinecap="round">
      <path d="M22 98h216" />
    </g>
    <rect x="82" y="14" width="112" height="76" rx="8" fill={surface} stroke={muted} strokeWidth="1.3" />
    <g stroke={teal} strokeWidth="1.3" fill="none">
      {points.map(y => points.map(x => {
        const active = x === 62 && y === 62;
        return <g key={`${x}-${y}`}>
          {active && <circle cx={x + 78} cy={y} r="8" strokeOpacity=".3" />}
          <circle cx={x + 78} cy={y} r={active ? 3.2 : 2} fill={active ? teal : 'none'} strokeOpacity={active ? 1 : .55} />
        </g>;
      }))}
    </g>
    <path d="M96 98h72l6 6h-84z" fill="none" stroke={muted} strokeWidth="1.3" />
  </svg>;
}

export function LandmarkMesh() {
  return <svg className="illustration" viewBox="0 0 240 112" role="img" aria-label="Simplified facial landmark mesh">
    <g fill="none" stroke={teal} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M120 14c28 0 47 21 47 45 0 13-6 24-15 32-9 7-20 10-32 10s-23-3-32-10c-9-8-15-19-15-32 0-24 19-45 47-45z" strokeOpacity=".8" />
      <path d="M88 48h22c4 0 7-2 10-2s6 2 10 2h22" strokeOpacity=".45" />
      <ellipse cx="103" cy="53" rx="8" ry="4.5" strokeOpacity=".75" />
      <ellipse cx="137" cy="53" rx="8" ry="4.5" strokeOpacity=".75" />
      <path d="M120 47v18M113 70c5 3 10 3 15 0" strokeOpacity=".7" />
      <path d="M101 80c11 6 27 6 38 0" strokeOpacity=".4" />
      <path d="M84 40l11 4M156 40l-11 4M96 30l9 4M144 30l-9 4" strokeOpacity=".28" />
    </g>
    <g fill={teal} fillOpacity=".65">
      {[[103, 53], [137, 53], [120, 56], [120, 70], [109, 76], [131, 76], [120, 36]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />)}
    </g>
  </svg>;
}

export function AttentionPattern() {
  return <svg className="illustration" viewBox="0 0 260 112" role="img" aria-label="Abstract attention pattern with focused, low, and uncertain bands">
    <g fill="none" strokeLinecap="round">
      <path d="M14 88h232" stroke={faint} />
      <path d="M14 58h232" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 6" />
      <path d="M14 28h232" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 6" />
      <path d="M14 82c12 0 16-46 28-46s16 46 28 46 14-26 26-26 14 26 26 26 16-40 28-40 14 40 26 40 12-16 22-16" stroke={teal} strokeWidth="1.8" strokeOpacity=".85" />
    </g>
    <g fill={teal} fillOpacity=".5">
      {[[42, 40], [98, 62], [152, 40], [206, 64]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />)}
    </g>
  </svg>;
}

export function AttentionFlow() {
  return <svg className="illustration" viewBox="0 0 420 200" role="img" aria-label="Diagram showing a webcam feeding local facial landmarks into an attention timeline">
    <defs>
      <linearGradient id="flow-fill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={teal} stopOpacity="0.28" />
        <stop offset="100%" stopColor={teal} stopOpacity="0.02" />
      </linearGradient>
    </defs>
    <g fill="none" stroke={faint} strokeWidth="1.2" strokeLinecap="round">
      <path d="M18 168h384" />
      <path d="M18 168v-5M402 168v-5" />
    </g>
    <g fill="none" stroke={muted} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <rect x="24" y="52" width="92" height="60" rx="8" fill={surface} />
      <path d="M56 112h28l6 10H50z" fill={surface} />
      <path d="M48 68h44M48 78h30" strokeOpacity=".35" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.35" strokeLinecap="round">
      <path d="M116 82h46" strokeDasharray="2 6" strokeOpacity=".55" />
      <path d="M158 78l6 4-6 4" strokeOpacity=".7" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M206 50c16 0 27 12 27 26 0 8-4 14-9 19-5 4-11 6-18 6s-13-2-18-6c-5-5-9-11-9-19 0-14 11-26 27-26z" strokeOpacity=".8" />
      <ellipse cx="196" cy="73" rx="5" ry="3" strokeOpacity=".6" />
      <ellipse cx="216" cy="73" rx="5" ry="3" strokeOpacity=".6" />
      <path d="M206 70v10M198 85h16" strokeOpacity=".55" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.35" strokeLinecap="round">
      <path d="M240 82h34" strokeDasharray="2 6" strokeOpacity=".55" />
      <path d="M270 78l6 4-6 4" strokeOpacity=".7" />
    </g>
    <g>
      <rect x="288" y="56" width="112" height="52" rx="6" fill={surfaceDeep} stroke={faint} />
      <path d="M288 84h112M288 70h112" stroke="rgba(255,255,255,0.05)" />
      <path d="M296 96c8 0 10-24 18-24s10 24 18 24 9-34 17-34 9 34 17 34 8-18 14-18 8 18 12 18" fill="none" stroke={teal} strokeWidth="1.6" strokeLinecap="round" strokeOpacity=".9" />
      <rect x="292" y="92" width="104" height="10" fill="url(#flow-fill)" />
    </g>
    <g fill={teal} fillOpacity=".55">
      <circle cx="24" cy="44" r="2" />
      <circle cx="206" cy="38" r="2" />
      <circle cx="400" cy="48" r="2" />
    </g>
  </svg>;
}

export function EmptyLedger() {
  return <svg className="illustration" viewBox="0 0 400 220" role="img" aria-label="An empty session ledger with ruled rows and a single plotted focus point">
    <g fill="none" stroke={faint} strokeWidth="1.2" strokeLinecap="round">
      <rect x="52" y="26" width="286" height="168" rx="10" fill={surface} />
      <path d="M52 58h286" />
      <path d="M76 82h120M76 110h150M76 138h96M76 166h134" strokeDasharray="3 6" strokeOpacity=".7" />
      <path d="M286 58v136" strokeOpacity=".5" />
    </g>
    <g fill="none" stroke={muted} strokeWidth="1.3" strokeLinecap="round">
      <path d="M76 42h56" strokeOpacity=".7" />
      <circle cx="306" cy="42" r="3" strokeOpacity=".45" />
    </g>
    <g fill="none" stroke={teal} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M296 150l14-22 14 8 16-28 14 6 14-20" strokeOpacity=".9" />
      <circle cx="368" cy="94" r="3.4" fill={teal} stroke="none" />
      <circle cx="368" cy="94" r="8" strokeOpacity=".22" />
      <path d="M296 180v-8M326 180v-8M356 180v-8" strokeOpacity=".35" />
    </g>
  </svg>;
}
