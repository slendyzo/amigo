/* ============================================================
   amigo — resolved brand
   Forest palette (bone paper, deep green, gilt rules) + bracket mark
   ============================================================ */

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
function Diamond({ color, size = 6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="5" y="0" width="7.07" height="7.07" transform="rotate(45 5 0)" fill={color} />
    </svg>
  );
}

/* ---------- THE MARK ----------
   Bracket pair from Instrument Serif italic, with a gilt centre dot.
   The brackets are paper-coloured (ink on paper); the dot is gilt — the
   one warm note that ties the mark to the gilt 1pt rules used elsewhere.
*/
function Mark({ size = 200, ink = 'var(--ink)', accent = 'var(--gilt)' }) {
  // The bracket size is tuned so that the visual height of "()" is ~80% of size.
  const fontSize = size * 1.35;
  return (
    <div style={{
      width: size, height: size,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <span style={{
        fontFamily: 'Instrument Serif, serif',
        fontStyle: 'italic',
        fontSize,
        lineHeight: 1,
        color: ink,
        letterSpacing: `-${size * 0.02}px`,
        fontWeight: 400,
        display: 'flex',
        alignItems: 'center',
      }}>
        <span style={{ display: 'inline-block', transform: `translateY(-${size * 0.04}px)` }}>(</span>
        <span style={{
          width: size * 0.085,
          height: size * 0.085,
          borderRadius: '50%',
          background: accent,
          display: 'inline-block',
          margin: `0 ${size * 0.015}px`,
          alignSelf: 'center',
          flexShrink: 0,
        }} />
        <span style={{ display: 'inline-block', transform: `translateY(-${size * 0.04}px)` }}>)</span>
      </span>
    </div>
  );
}

/* Wordmark — Fraunces lowercase, slightly narrowed */
function Wordmark({ size = 80, color = 'var(--ink)' }) {
  return (
    <span
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

/* ---------- COVER ---------- */
function Cover() {
  return (
    <div className="dir ab" style={{ background: 'var(--paper)', padding: '90px 80px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Brand · Resolved</Eyebrow>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>amigo · 2026</Eyebrow>
      </div>
      <div style={{ marginTop: 14 }}>
        <DoubleRule color="var(--ink)" gap={3} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 60 }}>
        <Mark size={240} />
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--gilt)', marginBottom: 26 }}>
            <Diamond color="var(--gilt)" />&nbsp;&nbsp;Forest&nbsp;&nbsp;<Diamond color="var(--gilt)" />
          </div>
          <Wordmark size={150} />
          <div className="ital" style={{ fontSize: 24, color: 'var(--ink-soft)', marginTop: 22, fontWeight: 400 }}>
            a private ledger for the modern household
          </div>
        </div>
      </div>

      <div>
        <DoubleRule color="var(--ink)" gap={3} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The bracket</Eyebrow>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The numerals</Eyebrow>
          <Eyebrow style={{ color: 'var(--ink-mute)' }}>I · The paper</Eyebrow>
        </div>
      </div>
    </div>
  );
}

/* ---------- LOGO ---------- */
function VariantTile({ bg, children }) {
  return (
    <div style={{ background: bg, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      {children}
    </div>
  );
}

function AppIcon({ size }) {
  const r = size * 0.22;
  const small = size <= 48;
  return (
    <div style={{
      width: size, height: size, background: 'var(--forest)',
      borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid var(--forest-deep)`, overflow: 'hidden',
    }}>
      {small ? (
        <div style={{ width: size * 0.18, height: size * 0.18, borderRadius: '50%', background: 'var(--gilt-soft)' }} />
      ) : (
        <Mark size={size * 0.85} ink="var(--paper)" accent="var(--gilt-soft)" />
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="dir ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>02 · The Mark</Eyebrow>
        <h2 className="display" style={{ fontSize: 44, fontWeight: 380, marginTop: 14, lineHeight: 1.05, color: 'var(--ink)' }}>
          A bracket. A gilt dot. A&nbsp;<em style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>pause.</em>
        </h2>
        <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 560 }}>
          The mark is editorial — a parenthetical aside, set in Instrument Serif italic.
          The dot is the only spot of <em style={{ color: 'var(--gilt)' }}>gilt</em> in the system —
          the same warm note used on 1pt rules and date labels. The wordmark is set
          in Fraunces lowercase, narrowed.
        </p>
      </div>

      <Rule color="var(--rule)" />

      {/* Primary lockup */}
      <div style={{ background: 'var(--paper-deep)', padding: '60px 50px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <Mark size={120} />
        <div style={{ width: 1, height: 80, background: 'var(--rule)' }} />
        <div>
          <Wordmark size={84} />
          <div className="eyebrow" style={{ color: 'var(--gilt)', marginTop: 12, letterSpacing: '0.32em' }}>EST · MMXXIV · LISBON</div>
        </div>
      </div>

      {/* Variants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
        <VariantTile bg="var(--paper)">
          <Mark size={110} />
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 16 }}>Mark only</span>
        </VariantTile>
        <VariantTile bg="var(--paper)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mark size={56} />
            <Wordmark size={42} />
          </div>
          <span className="eyebrow" style={{ color: 'var(--ink-mute)', marginTop: 16 }}>Horizontal lockup</span>
        </VariantTile>
        <VariantTile bg="var(--forest)">
          <Mark size={110} ink="var(--paper)" accent="var(--gilt-soft)" />
          <span className="eyebrow" style={{ color: 'var(--paper)', opacity: 0.7, marginTop: 16 }}>Reversed</span>
        </VariantTile>
      </div>

      {/* App icon */}
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>App icon</Eyebrow>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-end' }}>
          <AppIcon size={120} />
          <AppIcon size={72} />
          <AppIcon size={48} />
          <AppIcon size={28} />
          <div style={{ flex: 1 }} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 280, lineHeight: 1.55 }}>
            The bracket-and-dot fills a forest squircle. At 28px the brackets close —
            only the gilt dot remains, on forest. A single quiet glyph.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- PALETTE ---------- */
function Palette() {
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
    <div className="dir ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>03 · Palette</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          Bone paper. Forest ink. Gilt for the&nbsp;<em style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>rules.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

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
            Used as a 1pt rule, the mark's centre dot, a date label. <em>Never</em> a fill.
          </p>
        </div>
      </div>

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

/* ---------- TYPE ---------- */
function ScaleRow({ label, sample, size, weight = 400, num, display, mono, mute, kerning, ital }) {
  const fontFamily = num || display
    ? 'Fraunces, serif'
    : ital
      ? 'Instrument Serif, serif'
      : mono
        ? 'JetBrains Mono, monospace'
        : 'General Sans, sans-serif';
  const style = {
    fontFamily,
    fontSize: size,
    fontWeight: weight,
    color: mute ? 'var(--ink-mute)' : 'var(--ink)',
    letterSpacing: kerning || '0',
    fontStyle: display || ital ? 'italic' : 'normal',
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

function Type() {
  return (
    <div className="dir ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>04 · Type</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          Fraunces for the numerals. General Sans for the&nbsp;<em style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>voice.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

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
            <span style={{ fontFamily: 'Fraunces, serif', color: 'var(--ink)' }}>amigo</span> doesn't punish you for spending. It tells you, with the
            calm of a private banker, whether this month's velocity is sustainable —
            and where the slack is.
          </div>
        </div>
      </div>

      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>Scale</Eyebrow>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScaleRow label="Hero numeral" sample="$48,210.74" size={64} num kerning="-0.035em" />
          <ScaleRow label="Display" sample="A private ledger." size={42} display />
          <ScaleRow label="Pull-quote" sample="quiet · capital · counsel" size={28} ital mute />
          <ScaleRow label="Heading" sample="Survival Budget" size={26} weight={600} />
          <ScaleRow label="Body" sample="Up 2.41% this month, well within your ceiling." size={15} weight={400} mute />
          <ScaleRow label="Eyebrow" sample="TOTAL · APR 2026" size={11} mono mute kerning="0.18em" />
        </div>
      </div>
    </div>
  );
}

/* ---------- APPLIED ---------- */
function Applied() {
  return (
    <div className="dir ab" style={{ background: 'var(--paper)', padding: '70px 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <Eyebrow style={{ color: 'var(--ink-mute)' }}>05 · Applied</Eyebrow>
        <h2 className="display" style={{ fontSize: 42, fontWeight: 380, marginTop: 14, lineHeight: 1.05 }}>
          A statement, in&nbsp;<em style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>practice.</em>
        </h2>
      </div>

      <Rule color="var(--rule)" />

      <div style={{ background: 'var(--paper-deep)', padding: '44px 44px', border: '1px solid var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mark size={44} />
            <Wordmark size={28} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <Eyebrow style={{ color: 'var(--ink-mute)' }}>Statement · No. 0042</Eyebrow>
            <div className="num" style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>April 2026</div>
          </div>
        </div>
        <DoubleRule color="var(--ink)" gap={3} style={{ marginTop: 24 }} />

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
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', fontFamily: 'Instrument Serif, serif' }}>{row[2]}</span>
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

Object.assign(window, {
  Cover, Logo, Palette, Type, Applied,
});
