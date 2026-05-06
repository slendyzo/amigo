/* ============================================================
   amigo — brand directions
   Two private-bank explorations: Forest (deep green) & Midnight (navy + copper)
   ============================================================ */

/* ---------- shared atoms ---------- */

function Eyebrow({ children, style }) {
  return <div className="eyebrow" style={style}>{children}</div>;
}

function Rule({ color, weight = 1, style }) {
  return <div style={{ height: weight, background: color, ...style }} />;
}

function DoubleRule({ color, gap = 3, style }) {
  return (
    <div style={{ ...style }}>
      <div style={{ height: 1, background: color }} />
      <div style={{ height: gap }} />
      <div style={{ height: 1, background: color }} />
    </div>
  );
}

/* a tiny ornament glyph used as section divider */
function Diamond({ color, size = 6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="5" y="0" width="7.07" height="7.07" transform="rotate(45 5 0)" fill={color} />
    </svg>
  );
}

/* ============================================================
   DIRECTION A — FOREST
   ============================================================ */

/* The mark: a hand-drawn coin/seal — circle with an inner curl forming an "a"-spiral.
   Reads as a wax seal or a private banker's monogram. */
function MarkForest({ size = 200, ink = '#14140f', gilt = '#a8853a', paper = '#f1ebdd' }) {
  const s = size;
  return (
    <svg viewBox="0 0 200 200" width={s} height={s}>
      {/* Outer engraved ring */}
      <circle cx="100" cy="100" r="92" fill="none" stroke={ink} strokeWidth="1" />
      <circle cx="100" cy="100" r="88" fill="none" stroke={ink} strokeWidth="1" />
      {/* Inner field */}
      <circle cx="100" cy="100" r="78" fill={paper} stroke={gilt} strokeWidth="0.6" />
      {/* The mark — a spiral that suggests an "a" / a coin pressing */}
      <g stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round">
        {/* outer arc of the a-bowl */}
        <path d="M 70 130 A 32 32 0 1 1 132 122 L 132 70" />
        {/* inner stem - the closing of the bowl */}
        <path d="M 132 122 Q 110 138 92 130" />
        {/* the small terminal serif at top */}
        <path d="M 132 70 L 138 64" />
      </g>
      {/* Gilt center dot — the "establishment" stamp */}
      <circle cx="100" cy="100" r="2.2" fill={gilt} />
      {/* Engraved text around the bottom — Est. */}
      <defs>
        <path id="forest-arc" d="M 30 100 A 70 70 0 0 0 170 100" fill="none" />
      </defs>
      <text fontFamily="Fraunces, serif" fontSize="9" fill={ink} letterSpacing="3">
        <textPath href="#forest-arc" startOffset="50%" textAnchor="middle">EST · MMXXIV</textPath>
      </text>
    </svg>
  );
}

/* Wordmark — set in Fraunces with custom kerning, lowercase */
function WordmarkForest({ size = 80, color = '#14140f' }) {
  return (
    <span
      className="display"
      style={{
        fontFamily: 'Fraunces, serif',
        fontSize: size,
        fontWeight: 360,
        letterSpacing: '-0.045em',
        color,
        lineHeight: 0.9,
        fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0',
      }}
    >
      amigo
    </span>
  );
}

function CoverA() {
  return (
    <div className="dir-a ab" style={{ background: 'var(--paper)', padding: '90px 80px', display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Brand Direction · A</Eyebrow>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>amigo · 2026</Eyebrow>
      </div>
      <div style={{ marginTop: 14 }}>
        <DoubleRule color="var(--ink)" gap={3} />
      </div>

      {/* Mark hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 70 }}>
        <MarkForest size={260} />
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--gilt)', marginBottom: 26 }}>
            <Diamond color="var(--gilt)" />&nbsp;&nbsp;Forest&nbsp;&nbsp;<Diamond color="var(--gilt)" />
          </div>
          <WordmarkForest size={150} />
          <div className="display" style={{ fontSize: 22, fontStyle: 'italic', color: 'var(--ink-soft)', marginTop: 22, fontWeight: 300 }}>
            <em>a private ledger for the modern household</em>
          </div>
        </div>
      </div>

      {/* footer */}
      <div>
        <DoubleRule color="var(--ink)" gap={3} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The mark</Eyebrow>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The numerals</Eyebrow>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The paper</Eyebrow>
        </div>
      </div>
    </div>
  );
}

function LogoA() {
  return (
    <div className="dir-a ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>02 · The Mark</Eyebrow>
        <h2 className="display" style={{ fontSize: 44, fontWeight: 380, marginTop: 14, lineHeight: 1.05, color: 'var(--ink)' }}>
          A coin, an arc, a&nbsp;<em style={{ fontWeight: 300 }}>seal.</em>
        </h2>
        <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-soft)', maxWidth: 540 }}>
          The mark behaves like a wax seal pressed into ledger paper — engraved outer ring,
          a single confident stroke forming the bowl of an <em>a</em>, and a gilt centre point.
          The wordmark is set in Fraunces, lowercase, slightly narrowed.
        </p>
      </div>

      <Rule color="var(--rule)" />

      {/* Primary lockup */}
      <div style={{ background: 'var(--paper-deep)', padding: '60px 50px', display: 'flex', alignItems: 'center', gap: 40 }}>
        <MarkForest size={140} />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
        <div>
          <WordmarkForest size={84} />
          <div className="eyebrow" style={{ color: 'var(--gilt)', marginTop: 12, letterSpacing: '0.32em' }}>EST · MMXXIV</div>
        </div>
      </div>

      {/* Variants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
        <VariantTile bg="var(--paper)">
          <MarkForest size={90} />
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 16 }}>Mark only</span>
        </VariantTile>
        <VariantTile bg="var(--paper)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MarkForest size={48} />
            <WordmarkForest size={42} />
          </div>
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 16 }}>Horizontal lockup</span>
        </VariantTile>
        <VariantTile bg="var(--forest)">
          <MarkForest size={90} ink="var(--paper)" gilt="var(--gilt-soft)" paper="var(--forest)" />
          <span className="eyebrow" style={{ color: 'var(--paper)', opacity: 0.7, marginTop: 16 }}>Reversed</span>
        </VariantTile>
      </div>

      {/* App icon */}
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>App icon</Eyebrow>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-end' }}>
          <AppIconA size={120} />
          <AppIconA size={72} />
          <AppIconA size={48} />
          <AppIconA size={28} />
          <div style={{ flex: 1 }} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 280, lineHeight: 1.5 }}>
            The mark fills the squircle without a coloured plate — paper-on-forest,
            so the icon reads as a stamped coin even at 28px.
          </p>
        </div>
      </div>
    </div>
  );
}

function VariantTile({ bg, children }) {
  return (
    <div style={{ background: bg, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      {children}
    </div>
  );
}

function AppIconA({ size }) {
  const r = size * 0.22;
  return (
    <div style={{
      width: size, height: size, background: 'var(--forest)',
      borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid var(--forest-deep)`,
    }}>
      <MarkForest size={size * 0.78} ink="var(--paper)" gilt="var(--gilt-soft)" paper="var(--forest)" />
    </div>
  );
}

function PaletteA() {
  const swatches = [
    { name: 'Bone', hex: '#f1ebdd', role: 'Page', ink: '#14140f' },
    { name: 'Bone Deep', hex: '#e8e0cc', role: 'Card / inset', ink: '#14140f' },
    { name: 'Forest', hex: '#1e3a2c', role: 'Primary action', ink: '#f1ebdd' },
    { name: 'Forest Deep', hex: '#122a1f', role: 'Sidebar / pressed', ink: '#f1ebdd' },
    { name: 'Ink', hex: '#14140f', role: 'Display & body', ink: '#f1ebdd' },
    { name: 'Ink Soft', hex: '#3d3a30', role: 'Secondary text', ink: '#f1ebdd' },
    { name: 'Gilt', hex: '#a8853a', role: '1pt rules · accent', ink: '#14140f' },
    { name: 'Crimson', hex: '#7a2820', role: 'Loss · destructive', ink: '#f1ebdd' },
    { name: 'Moss', hex: '#4a6b3f', role: 'Gain · positive', ink: '#f1ebdd' },
  ];
  return (
    <div className="dir-a ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>03 · Palette</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          Bone paper. Forest ink. Gilt for the&nbsp;<em style={{ fontWeight: 300 }}>rules.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      {/* Big swatch row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, border: '1px solid var(--ink)' }}>
        <div style={{ background: 'var(--paper-deep)', padding: '40px 32px', borderRight: '1px solid var(--ink)' }}>
          <Eyebrow>Paper</Eyebrow>
          <div style={{ marginTop: 24, fontFamily: 'Fraunces, serif', fontSize: 84, fontWeight: 320, letterSpacing: '-0.04em', lineHeight: 1 }}>
            #f1ebdd
          </div>
          <p style={{ marginTop: 18, fontSize: 13, color: 'var(--ink-soft)', maxWidth: 420, lineHeight: 1.55 }}>
            Warm bone — the page never goes pure white. Cards inset onto a deeper bone (#e8e0cc),
            never a separate surface colour.
          </p>
        </div>
        <div style={{ background: 'var(--forest)', padding: '40px 24px', color: 'var(--paper)', borderRight: '1px solid var(--ink)' }}>
          <Eyebrow style={{ color: 'var(--gilt-soft)' }}>Forest</Eyebrow>
          <div className="num" style={{ fontSize: 48, fontWeight: 320, letterSpacing: '-0.03em', marginTop: 24 }}>
            #1e3a2c
          </div>
          <p style={{ marginTop: 18, fontSize: 12.5, opacity: 0.8, lineHeight: 1.55 }}>
            Primary action. Sidebar fill. The colour of money in a 1923 ledger.
          </p>
        </div>
        <div style={{ background: 'var(--gilt)', padding: '40px 24px', color: 'var(--ink)' }}>
          <Eyebrow style={{ color: 'var(--ink)' }}>Gilt</Eyebrow>
          <div className="num" style={{ fontSize: 48, fontWeight: 320, letterSpacing: '-0.03em', marginTop: 24 }}>
            #a8853a
          </div>
          <p style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.55 }}>
            Used as a 1pt rule, a centre dot, a date label. <em>Never</em> a fill.
          </p>
        </div>
      </div>

      {/* Mini swatch ramp */}
      <div style={{ border: '1px solid var(--ink)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)' }}>
          {swatches.map((s, i) => (
            <div key={s.hex} style={{ background: s.hex, color: s.ink, padding: '20px 14px', minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: i < swatches.length - 1 ? '1px solid var(--ink)' : 'none' }}>
              <div className="eyebrow" style={{ opacity: 0.8 }}>{s.role}</div>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400 }}>{s.name}</div>
                <div className="eyebrow" style={{ marginTop: 4, opacity: 0.7 }}>{s.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pairing demonstration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ background: 'var(--paper-deep)', padding: 28, border: '1px solid var(--rule)' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Total · USD</Eyebrow>
          <div className="num" style={{ fontSize: 56, fontWeight: 360, letterSpacing: '-0.03em', marginTop: 12, lineHeight: 1 }}>
            $48,210<span style={{ color: 'var(--ink-mute)', fontSize: 28 }}>.74</span>
          </div>
          <Rule color="var(--gilt)" style={{ margin: '20px 0 14px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
            <span>Up <span className="num" style={{ color: 'var(--moss)', fontWeight: 500 }}>+2.41%</span> this month</span>
            <span className="eyebrow" style={{ color: 'var(--gilt)' }}>Apr · 2026</span>
          </div>
        </div>
        <div style={{ background: 'var(--forest)', padding: 28, color: 'var(--paper)' }}>
          <Eyebrow style={{ color: 'var(--gilt-soft)' }}>Total · USD</Eyebrow>
          <div className="num" style={{ fontSize: 56, fontWeight: 360, letterSpacing: '-0.03em', marginTop: 12, lineHeight: 1 }}>
            $48,210<span style={{ opacity: 0.6, fontSize: 28 }}>.74</span>
          </div>
          <Rule color="var(--gilt-soft)" style={{ margin: '20px 0 14px', opacity: 0.6 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.85 }}>
            <span>Up <span className="num" style={{ color: 'var(--gilt-soft)', fontWeight: 500 }}>+2.41%</span> this month</span>
            <span className="eyebrow" style={{ color: 'var(--gilt-soft)' }}>Apr · 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeA() {
  return (
    <div className="dir-a ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>04 · Type</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          Fraunces for the numerals. General Sans for the&nbsp;<em style={{ fontWeight: 300 }}>voice.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      {/* Hero numeral specimen */}
      <div style={{ background: 'var(--paper-deep)', padding: '40px 36px', border: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Specimen · Fraunces</Eyebrow>
          <div className="eyebrow" style={{ color: 'var(--gilt)' }}>VARIABLE · OPTICAL · SOFT · WONK</div>
        </div>
        <div className="num" style={{ fontSize: 168, lineHeight: 0.95, fontWeight: 320, letterSpacing: '-0.045em', marginTop: 18 }}>
          $1,234.56
        </div>
        <div style={{ display: 'flex', gap: 36, marginTop: 22, color: 'var(--ink-soft)', fontSize: 13 }}>
          <span><span className="num" style={{ fontWeight: 500 }}>0123456789</span> · tabular</span>
          <span className="num" style={{ fontStyle: 'italic', fontWeight: 300 }}><em>0123456789</em> · italic</span>
          <span><span className="num" style={{ fontWeight: 600 }}>$ € £ ¥ ₿</span></span>
        </div>
      </div>

      {/* Body specimen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid var(--rule)' }}>
        <div style={{ padding: 32, borderRight: '1px solid var(--rule)' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>General Sans · 600</Eyebrow>
          <div style={{ fontFamily: 'General Sans, sans-serif', fontSize: 28, fontWeight: 600, letterSpacing: '-0.015em', marginTop: 14, color: 'var(--ink)' }}>
            Survival Budget
          </div>
          <p style={{ fontFamily: 'General Sans, sans-serif', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 10 }}>
            Track essential outgoings — rent, utilities, groceries — separate from
            discretionary spend. The Living Gauge shows how much room you have left
            in the month.
          </p>
        </div>
        <div style={{ padding: 32 }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>General Sans · 400</Eyebrow>
          <div style={{ fontFamily: 'General Sans, sans-serif', fontSize: 16, fontWeight: 400, lineHeight: 1.65, marginTop: 14, color: 'var(--ink-soft)' }}>
            <em style={{ fontFamily: 'Fraunces, serif', color: 'var(--ink)' }}>amigo</em> doesn't punish you for spending. It tells you, with the
            calm of a private banker, whether this month's velocity is sustainable —
            and where the slack is.
          </div>
        </div>
      </div>

      {/* Scale ladder */}
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Scale</Eyebrow>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScaleRow label="Hero numeral" sample="$48,210.74" size={64} num kerning="-0.035em" />
          <ScaleRow label="Display" sample="A private ledger." size={42} display />
          <ScaleRow label="Heading" sample="Survival Budget" size={26} weight={600} />
          <ScaleRow label="Body" sample="Up 2.41% this month, well within your ceiling." size={15} weight={400} mute />
          <ScaleRow label="Eyebrow" sample="TOTAL · APR 2026" size={11} mono mute kerning="0.18em" />
        </div>
      </div>
    </div>
  );
}

function ScaleRow({ label, sample, size, weight = 400, num, display, mono, mute, kerning }) {
  const fontFamily = num || display
    ? 'Fraunces, serif'
    : mono
      ? 'JetBrains Mono, monospace'
      : 'General Sans, sans-serif';
  const style = {
    fontFamily,
    fontSize: size,
    fontWeight: weight,
    color: mute ? 'var(--ink-mute)' : 'var(--ink)',
    letterSpacing: kerning || '0',
    fontStyle: display ? 'italic' : 'normal',
    lineHeight: 1.05,
  };
  if (mono) style.textTransform = 'uppercase';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', alignItems: 'baseline', gap: 24 }}>
      <Eyebrow style={{ color: 'var(--ink-mute)' }}>{label}</Eyebrow>
      <div style={style}>{sample}</div>
      <div className="eyebrow" style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>{size}px</div>
    </div>
  );
}

function AppliedA() {
  return (
    <div className="dir-a ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>05 · Applied</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          A statement, in&nbsp;<em style={{ fontWeight: 300 }}>practice.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      {/* The "statement" — feels like an actual paper bank statement */}
      <div style={{ background: 'var(--paper-deep)', padding: '44px 44px', border: '1px solid var(--ink)' }}>
        {/* statement head */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MarkForest size={42} />
            <WordmarkForest size={28} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Statement · No. 0042</Eyebrow>
            <div className="num" style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>April 2026</div>
          </div>
        </div>
        <DoubleRule color="var(--ink)" gap={3} style={{ marginTop: 24 }} />

        {/* Hero number block */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 0, marginTop: 28 }}>
          <div style={{ paddingRight: 28, borderRight: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Net Worth</Eyebrow>
            <div className="num" style={{ fontSize: 64, fontWeight: 360, letterSpacing: '-0.035em', marginTop: 8, lineHeight: 1 }}>
              $248,930<span style={{ color: 'var(--ink-mute)', fontSize: 32 }}>.16</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-soft)' }}>
              <span className="num" style={{ color: 'var(--moss)', fontWeight: 500 }}>+$5,840.22</span> &nbsp;<span style={{ color: 'var(--ink-mute)' }}>since March</span>
            </div>
          </div>
          <div style={{ padding: '0 24px', borderRight: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Cash on Hand</Eyebrow>
            <div className="num" style={{ fontSize: 32, fontWeight: 380, letterSpacing: '-0.025em', marginTop: 10 }}>
              $14,220<span style={{ color: 'var(--ink-mute)', fontSize: 18 }}>.40</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-mute)' }}>3 accounts</div>
          </div>
          <div style={{ paddingLeft: 24 }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Survival Burn</Eyebrow>
            <div className="num" style={{ fontSize: 32, fontWeight: 380, letterSpacing: '-0.025em', marginTop: 10 }}>
              68<span style={{ color: 'var(--ink-mute)', fontSize: 18 }}>%</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-mute)' }}>11 days remaining</div>
          </div>
        </div>

        <Rule color="var(--gilt)" style={{ margin: '32px 0 24px', opacity: 0.5 }} />

        {/* Ledger lines */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 130px', gap: 16, paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Date</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Memo</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Category</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>Account</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>Amount</Eyebrow>
          </div>
          {[
            ['28 Apr', 'Mercato Centrale', 'Groceries', 'Revolut', '−$84.20'],
            ['27 Apr', 'Salary · Acme Co.', 'Income', 'Wise', '+$6,200.00', 'gain'],
            ['25 Apr', 'BTC purchase', 'Portfolio', 'Kraken', '−$1,000.00'],
            ['24 Apr', 'Rent · April', 'Housing', 'BPI', '−$1,420.00'],
            ['22 Apr', 'Refund · Booking.com', 'Travel', 'Revolut', '+$320.00', 'gain'],
          ].map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 130px', gap: 16, padding: '14px 0', borderBottom: i < 4 ? '1px solid var(--rule)' : 'none', alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink-mute)', fontWeight: 400 }}>{row[0]}</span>
              <span style={{ fontSize: 14, color: 'var(--ink)' }}>{row[1]}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', fontFamily: 'Fraunces, serif' }}>{row[2]}</span>
              <span className="eyebrow" style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>{row[3]}</span>
              <span className="num" style={{ fontSize: 15, fontWeight: 500, textAlign: 'right', color: row[5] === 'gain' ? 'var(--moss)' : 'var(--ink)' }}>{row[4]}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>amigo · est. mmxxiv · lisbon</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gilt)' }}>
          <Diamond color="var(--gilt)" />
          <Diamond color="var(--gilt)" />
          <Diamond color="var(--gilt)" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DIRECTION B — MIDNIGHT
   ============================================================ */

/* The mark: a pair of editorial brackets (   ) framing the wordmark, with a
   single dot — like an ISBN or a private ledger marker. The mark also exists
   as a standalone glyph: ( · ) */
function MarkMidnight({ size = 200, ink = '#0a1020', copper = '#a85b3a', paper = '#ece2cf' }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      {/* Outer thin square frame for grounding */}
      <rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke={ink} strokeWidth="1" opacity="0.18" />

      {/* Inner: a tall parenthesis pair with a centre dot */}
      <text
        x="100" y="135"
        fontFamily="Instrument Serif, serif"
        fontSize="180"
        textAnchor="middle"
        fill={ink}
        fontStyle="italic"
        fontWeight="400"
        letterSpacing="-4"
      >
        (·)
      </text>

      {/* Tiny copper ascender — index marker */}
      <circle cx="100" cy="44" r="3.2" fill={copper} />
      <line x1="100" y1="50" x2="100" y2="64" stroke={copper} strokeWidth="1" />
    </svg>
  );
}

function WordmarkMidnight({ size = 80, color = '#0a1020' }) {
  return (
    <span
      style={{
        fontFamily: 'Instrument Serif, serif',
        fontSize: size,
        fontWeight: 400,
        fontStyle: 'italic',
        letterSpacing: '-0.025em',
        color,
        lineHeight: 0.9,
      }}
    >
      amigo
    </span>
  );
}

function CoverB() {
  return (
    <div className="dir-b ab" style={{ background: 'var(--paper)', padding: '90px 80px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Brand Direction · B</Eyebrow>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>amigo · 2026</Eyebrow>
      </div>
      <div style={{ marginTop: 14, height: 1, background: 'var(--ink)' }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 280, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.02em' }}>(</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, padding: '0 8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--copper)' }} />
          </div>
          <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 280, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.02em' }}>)</span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <WordmarkMidnight size={140} />
          <div style={{ fontFamily: 'Satoshi, sans-serif', fontSize: 14, fontWeight: 500, color: 'var(--copper)', marginTop: 28, letterSpacing: '0.32em', textTransform: 'uppercase' }}>
            Quiet · Capital · Counsel
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--ink)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The bracket</Eyebrow>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The italic</Eyebrow>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The midnight</Eyebrow>
      </div>
    </div>
  );
}

function LogoB() {
  return (
    <div className="dir-b ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>02 · The Mark</Eyebrow>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 48, fontWeight: 400, marginTop: 14, lineHeight: 1.0, fontStyle: 'normal', color: 'var(--ink)' }}>
          A bracket. A dot. A&nbsp;<em>pause.</em>
        </h2>
        <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 540 }}>
          The mark is editorial — a parenthetical aside, the way a private
          ledger notes <em>(see Apr · 2026)</em>. The wordmark is set in
          Instrument Serif italic, which gives <em>amigo</em> the shape of
          a signature without literally being one.
        </p>
      </div>

      <Rule color="var(--rule)" />

      <div style={{ background: 'var(--paper-deep)', padding: '70px 50px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 140, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.03em' }}>(</span>
        <WordmarkMidnight size={92} />
        <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 140, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.03em' }}>)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--ink)', border: '1px solid var(--ink)' }}>
        <VariantTile bg="var(--paper)">
          <MarkMidnight size={120} />
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 16 }}>Mark only</span>
        </VariantTile>
        <VariantTile bg="var(--paper)">
          <WordmarkMidnight size={56} />
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 20 }}>Wordmark only</span>
        </VariantTile>
        <VariantTile bg="var(--midnight)">
          <MarkMidnight size={120} ink="var(--paper)" copper="var(--copper-soft)" paper="var(--midnight)" />
          <span className="eyebrow" style={{ color: 'var(--paper)', opacity: 0.7, marginTop: 16 }}>Reversed</span>
        </VariantTile>
      </div>

      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>App icon</Eyebrow>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-end' }}>
          <AppIconB size={120} />
          <AppIconB size={72} />
          <AppIconB size={48} />
          <AppIconB size={28} />
          <div style={{ flex: 1 }} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 280, lineHeight: 1.5 }}>
            At small sizes the brackets close — the icon is just the dot,
            in copper, on cream. A single quiet glyph.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppIconB({ size }) {
  const r = size * 0.22;
  // At small sizes show just the copper dot
  const small = size <= 48;
  return (
    <div style={{
      width: size, height: size, background: 'var(--paper)',
      borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid var(--ink)`, position: 'relative', overflow: 'hidden',
    }}>
      {small ? (
        <div style={{ width: size * 0.18, height: size * 0.18, borderRadius: '50%', background: 'var(--copper)' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: size * 0.78, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.05em' }}>(</span>
          <div style={{ width: size * 0.07, height: size * 0.07, borderRadius: '50%', background: 'var(--copper)', margin: `0 ${size * 0.02}px` }} />
          <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: size * 0.78, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.05em' }}>)</span>
        </div>
      )}
    </div>
  );
}

function PaletteB() {
  const swatches = [
    { name: 'Cream', hex: '#ece2cf', role: 'Page', ink: '#0a1020' },
    { name: 'Cream Deep', hex: '#e0d4bb', role: 'Card / inset', ink: '#0a1020' },
    { name: 'Midnight', hex: '#14213d', role: 'Primary action', ink: '#ece2cf' },
    { name: 'Midnight Deep', hex: '#0a1428', role: 'Sidebar', ink: '#ece2cf' },
    { name: 'Ink', hex: '#0a1020', role: 'Display & body', ink: '#ece2cf' },
    { name: 'Ink Soft', hex: '#2a3148', role: 'Secondary text', ink: '#ece2cf' },
    { name: 'Copper', hex: '#a85b3a', role: 'Accent · index dots', ink: '#ece2cf' },
    { name: 'Crimson', hex: '#7a2820', role: 'Loss · destructive', ink: '#ece2cf' },
    { name: 'Moss', hex: '#3e5a3a', role: 'Gain · positive', ink: '#ece2cf' },
  ];
  return (
    <div className="dir-b ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>03 · Palette</Eyebrow>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 46, fontWeight: 400, marginTop: 14, lineHeight: 1.0 }}>
          Cream paper. Midnight ink. A trace of&nbsp;<em>copper.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, border: '1px solid var(--ink)' }}>
        <div style={{ background: 'var(--paper-deep)', padding: '40px 32px', borderRight: '1px solid var(--ink)' }}>
          <Eyebrow>Paper</Eyebrow>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 88, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 24 }}>
            #ece2cf
          </div>
          <p style={{ marginTop: 18, fontSize: 13, color: 'var(--ink-soft)', maxWidth: 420, lineHeight: 1.55 }}>
            Cream — the page never goes pure white. Cards are cream-deep,
            an inset depression, never a separate plate.
          </p>
        </div>
        <div style={{ background: 'var(--midnight)', padding: '40px 24px', color: 'var(--paper)', borderRight: '1px solid var(--ink)' }}>
          <Eyebrow style={{ color: 'var(--copper-soft)' }}>Midnight</Eyebrow>
          <div className="num" style={{ fontSize: 48, fontStyle: 'italic', fontWeight: 400, marginTop: 24 }}>
            #14213d
          </div>
          <p style={{ marginTop: 18, fontSize: 12.5, opacity: 0.85, lineHeight: 1.55 }}>
            Primary action. Sidebar. Deep enough to feel like ink, blue
            enough to never read as black.
          </p>
        </div>
        <div style={{ background: 'var(--copper)', padding: '40px 24px', color: 'var(--paper)' }}>
          <Eyebrow style={{ color: 'var(--paper)', opacity: 0.85 }}>Copper</Eyebrow>
          <div className="num" style={{ fontSize: 48, fontStyle: 'italic', fontWeight: 400, marginTop: 24 }}>
            #a85b3a
          </div>
          <p style={{ marginTop: 18, fontSize: 12.5, opacity: 0.9, lineHeight: 1.55 }}>
            Used as a mark dot, an index pip, an underline. Never a button fill.
          </p>
        </div>
      </div>

      <div style={{ border: '1px solid var(--ink)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)' }}>
          {swatches.map((s, i) => (
            <div key={s.hex} style={{ background: s.hex, color: s.ink, padding: '20px 14px', minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: i < swatches.length - 1 ? '1px solid var(--ink)' : 'none' }}>
              <div className="eyebrow" style={{ opacity: 0.8 }}>{s.role}</div>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 400 }}>{s.name}</div>
                <div className="eyebrow" style={{ marginTop: 4, opacity: 0.7 }}>{s.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ background: 'var(--paper-deep)', padding: 28, border: '1px solid var(--rule)' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Total · USD</Eyebrow>
          <div className="num" style={{ fontSize: 64, fontStyle: 'italic', fontWeight: 400, marginTop: 10, lineHeight: 1, letterSpacing: '-0.02em' }}>
            $48,210<span style={{ color: 'var(--ink-mute)' }}>.74</span>
          </div>
          <Rule color="var(--copper)" style={{ margin: '20px 0 14px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
            <span>Up <span className="num" style={{ color: 'var(--moss)', fontStyle: 'italic', fontWeight: 500 }}>+2.41%</span> this month</span>
            <span className="eyebrow" style={{ color: 'var(--copper)' }}>Apr · 2026</span>
          </div>
        </div>
        <div style={{ background: 'var(--midnight)', padding: 28, color: 'var(--paper)' }}>
          <Eyebrow style={{ color: 'var(--copper-soft)' }}>Total · USD</Eyebrow>
          <div className="num" style={{ fontSize: 64, fontStyle: 'italic', fontWeight: 400, marginTop: 10, lineHeight: 1, letterSpacing: '-0.02em' }}>
            $48,210<span style={{ opacity: 0.6 }}>.74</span>
          </div>
          <Rule color="var(--copper)" style={{ margin: '20px 0 14px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.85 }}>
            <span>Up <span className="num" style={{ color: 'var(--copper-soft)', fontStyle: 'italic', fontWeight: 500 }}>+2.41%</span> this month</span>
            <span className="eyebrow" style={{ color: 'var(--copper-soft)' }}>Apr · 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeB() {
  return (
    <div className="dir-b ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>04 · Type</Eyebrow>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 46, fontWeight: 400, marginTop: 14, lineHeight: 1.0 }}>
          Instrument Serif&nbsp;<em>italic.</em> Satoshi sans.
        </h2>
      </div>

      <Rule color="var(--rule)" />

      {/* Hero numeral specimen — italic */}
      <div style={{ background: 'var(--paper-deep)', padding: '40px 36px', border: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Specimen · Instrument Serif Italic</Eyebrow>
          <div className="eyebrow" style={{ color: 'var(--copper)' }}>EDITORIAL · DRAMATIC · NARROW</div>
        </div>
        <div className="num" style={{ fontSize: 184, lineHeight: 0.95, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.035em', marginTop: 18, color: 'var(--ink)' }}>
          $1,234.56
        </div>
        <div style={{ display: 'flex', gap: 36, marginTop: 22, color: 'var(--ink-soft)', fontSize: 13 }}>
          <span className="num" style={{ fontStyle: 'italic' }}>0123456789 · italic</span>
          <span className="num">0123456789 · roman</span>
          <span className="num" style={{ fontStyle: 'italic' }}>$ € £ ¥ ₿</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid var(--rule)' }}>
        <div style={{ padding: 32, borderRight: '1px solid var(--rule)' }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Satoshi · 600</Eyebrow>
          <div style={{ fontFamily: 'Satoshi, sans-serif', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 14, color: 'var(--ink)' }}>
            Survival Budget
          </div>
          <p style={{ fontFamily: 'Satoshi, sans-serif', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 10, fontWeight: 400 }}>
            Track essential outgoings — rent, utilities, groceries — separate from
            discretionary spend.
          </p>
        </div>
        <div style={{ padding: 32 }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>Satoshi · 400</Eyebrow>
          <div style={{ fontFamily: 'Satoshi, sans-serif', fontSize: 16, fontWeight: 400, lineHeight: 1.65, marginTop: 14, color: 'var(--ink-soft)' }}>
            <em style={{ fontFamily: 'Instrument Serif, serif', color: 'var(--ink)' }}>amigo</em> doesn't punish you for spending.
            It tells you, with the calm of a private banker, whether this month's
            velocity is sustainable.
          </div>
        </div>
      </div>

      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Scale</Eyebrow>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScaleRowB label="Hero numeral" sample="$48,210.74" size={68} num italic />
          <ScaleRowB label="Display" sample="A private ledger." size={46} display italic />
          <ScaleRowB label="Heading" sample="Survival Budget" size={26} weight={700} />
          <ScaleRowB label="Body" sample="Up 2.41% this month, well within your ceiling." size={15} weight={400} mute />
          <ScaleRowB label="Eyebrow" sample="TOTAL · APR 2026" size={11} mono mute kerning="0.18em" />
        </div>
      </div>
    </div>
  );
}

function ScaleRowB({ label, sample, size, weight = 400, num, display, mono, mute, kerning, italic }) {
  const fontFamily = num || display
    ? 'Instrument Serif, serif'
    : mono
      ? 'Geist Mono, JetBrains Mono, monospace'
      : 'Satoshi, sans-serif';
  const style = {
    fontFamily,
    fontSize: size,
    fontWeight: weight,
    color: mute ? 'var(--ink-mute)' : 'var(--ink)',
    letterSpacing: kerning || (italic ? '-0.025em' : '0'),
    fontStyle: italic ? 'italic' : 'normal',
    lineHeight: 1.05,
  };
  if (mono) style.textTransform = 'uppercase';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', alignItems: 'baseline', gap: 24 }}>
      <Eyebrow style={{ color: 'var(--ink-mute)' }}>{label}</Eyebrow>
      <div style={style}>{sample}</div>
      <div className="eyebrow" style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>{size}px</div>
    </div>
  );
}

function AppliedB() {
  return (
    <div className="dir-b ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>05 · Applied</Eyebrow>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 46, fontWeight: 400, marginTop: 14, lineHeight: 1.0 }}>
          A statement, in&nbsp;<em>practice.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      <div style={{ background: 'var(--paper-deep)', padding: '44px 44px', border: '1px solid var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 44, color: 'var(--ink)', lineHeight: 1 }}>(</span>
            <WordmarkMidnight size={28} />
            <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 44, color: 'var(--ink)', lineHeight: 1 }}>)</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Statement · No. 0042</Eyebrow>
            <div className="num" style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink-soft)', marginTop: 4 }}>April 2026</div>
          </div>
        </div>
        <Rule color="var(--ink)" style={{ marginTop: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 0, marginTop: 28 }}>
          <div style={{ paddingRight: 28, borderRight: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Net Worth</Eyebrow>
            <div className="num" style={{ fontSize: 72, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.03em', marginTop: 6, lineHeight: 1, color: 'var(--ink)' }}>
              $248,930<span style={{ color: 'var(--ink-mute)', fontSize: 36 }}>.16</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-soft)' }}>
              <span className="num" style={{ color: 'var(--moss)', fontStyle: 'italic', fontWeight: 500 }}>+$5,840.22</span> &nbsp;<span style={{ color: 'var(--ink-mute)' }}>since March</span>
            </div>
          </div>
          <div style={{ padding: '0 24px', borderRight: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Cash on Hand</Eyebrow>
            <div className="num" style={{ fontSize: 36, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.025em', marginTop: 6 }}>
              $14,220<span style={{ color: 'var(--ink-mute)', fontSize: 20 }}>.40</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-mute)' }}>3 accounts</div>
          </div>
          <div style={{ paddingLeft: 24 }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Survival Burn</Eyebrow>
            <div className="num" style={{ fontSize: 36, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.025em', marginTop: 6 }}>
              68<span style={{ color: 'var(--ink-mute)', fontSize: 20 }}>%</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-mute)' }}>11 days remaining</div>
          </div>
        </div>

        <Rule color="var(--copper)" style={{ margin: '32px 0 24px' }} />

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 130px', gap: 16, paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Date</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Memo</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Category</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>Account</Eyebrow>
            <Eyebrow style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>Amount</Eyebrow>
          </div>
          {[
            ['28 Apr', 'Mercato Centrale', 'Groceries', 'Revolut', '−$84.20'],
            ['27 Apr', 'Salary · Acme Co.', 'Income', 'Wise', '+$6,200.00', 'gain'],
            ['25 Apr', 'BTC purchase', 'Portfolio', 'Kraken', '−$1,000.00'],
            ['24 Apr', 'Rent · April', 'Housing', 'BPI', '−$1,420.00'],
            ['22 Apr', 'Refund · Booking.com', 'Travel', 'Revolut', '+$320.00', 'gain'],
          ].map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 130px', gap: 16, padding: '14px 0', borderBottom: i < 4 ? '1px solid var(--rule)' : 'none', alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic' }}>{row[0]}</span>
              <span style={{ fontSize: 14, color: 'var(--ink)', fontFamily: 'Satoshi, sans-serif' }}>{row[1]}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', fontFamily: 'Instrument Serif, serif' }}>{row[2]}</span>
              <span className="eyebrow" style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>{row[3]}</span>
              <span className="num" style={{ fontSize: 16, fontStyle: 'italic', fontWeight: 500, textAlign: 'right', color: row[5] === 'gain' ? 'var(--moss)' : 'var(--ink)' }}>{row[4]}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>amigo · quiet · capital · counsel</Eyebrow>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--copper)' }} />
      </div>
    </div>
  );
}

/* expose to global scope so the inline script can find them */
Object.assign(window, {
  CoverA, LogoA, PaletteA, TypeA, AppliedA,
  CoverB, LogoB, PaletteB, TypeB, AppliedB,
});
