/* global React */
const { useState } = React;

/* ====================== Icon (inline lucide) ====================== */
const ICONS = {
  layout: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  trending: 'M22 7L13.5 15.5 8.5 10.5 2 17M16 7h6v6',
  dollar: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z',
  card: 'M2 5h20v14H2zM2 10h20',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8L12 3 7 8M12 3v15',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  chevron: 'M6 9l6 6 6-6',
  arrowUp: 'M7 17L17 7M7 7h10v10',
  arrowDown: 'M17 7L7 17M17 17H7V7',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  wallet: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 12h6v4h-6a2 2 0 0 1 0-4z',
};

function Icon({ name, size = 18, stroke = 1.6, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {ICONS[name]?.split('M').filter(Boolean).map((d, i) => (
        <path key={i} d={'M' + d} />
      ))}
    </svg>
  );
}

/* ====================== Eyebrow ====================== */
function Eyebrow({ children, style }) {
  return <div className="t-eyebrow" style={style}>{children}</div>;
}

/* ====================== Button ====================== */
function Button({ variant = 'primary', size = 'md', icon, children, onClick, style }) {
  const heights = { sm: 32, md: 40, lg: 48 };
  const pads = { sm: '0 12px', md: '0 16px', lg: '0 22px' };
  const fonts = { sm: 13, md: 14, lg: 15 };
  const variants = {
    primary: { background: 'var(--amigo-blue)', color: '#fff', border: '1px solid transparent', boxShadow: '0 1px 2px rgb(0 112 243 / .25)' },
    secondary: { background: '#fff', color: 'var(--fg-1)', border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-xs)' },
    ghost: { background: 'transparent', color: 'var(--fg-2)', border: '1px solid transparent' },
    destructive: { background: '#fff', color: 'var(--loss-fg)', border: '1px solid var(--border-1)' },
  };
  const [hover, setHover] = useState(false);
  const hoverBg = {
    primary: 'var(--amigo-blue-hover)',
    secondary: 'var(--slate-50)',
    ghost: 'var(--slate-100)',
    destructive: 'var(--loss-bg)',
  };
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...variants[variant],
        height: heights[size],
        padding: pads[size],
        fontSize: fonts[size],
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        borderRadius: size === 'sm' ? 8 : 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        transition: 'background 180ms var(--ease-out)',
        background: hover ? hoverBg[variant] : variants[variant].background,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/* ====================== Card ====================== */
function Card({ children, style, padding = 24, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid var(--border-1)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-sm)',
        padding,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >{children}</div>
  );
}

/* ====================== Chip ====================== */
function Chip({ tone = 'neutral', children, style }) {
  const tones = {
    neutral: { bg: 'var(--slate-100)', fg: 'var(--fg-2)' },
    blue:    { bg: 'var(--amigo-blue-soft)', fg: 'var(--amigo-blue)' },
    gain:    { bg: 'var(--gain-bg)', fg: 'var(--gain-fg)' },
    loss:    { bg: 'var(--loss-bg)', fg: 'var(--loss-fg)' },
    warn:    { bg: 'var(--warn-bg)', fg: 'var(--warn-fg)' },
  };
  const c = tones[tone];
  return (
    <span style={{
      background: c.bg, color: c.fg,
      fontWeight: 500, fontSize: 12, lineHeight: 1,
      padding: '5px 10px', borderRadius: 9999,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      ...style,
    }}>{children}</span>
  );
}

/* ====================== Money ====================== */
function Money({ value, currency = '€', size = 14, weight = 600, color = 'var(--fg-1)', sign = false }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span style={{
      fontFamily: 'var(--font-sans)',
      fontWeight: weight,
      fontSize: size,
      color,
      fontVariantNumeric: 'tabular-nums lining-nums',
      letterSpacing: size >= 36 ? '-0.02em' : size >= 24 ? '-0.01em' : 0,
    }}>
      {neg ? `(${currency}${formatted})` : `${sign && value > 0 ? '+' : ''}${currency}${formatted}`}
    </span>
  );
}

/* ====================== Pct ====================== */
function Pct({ value, size = 12 }) {
  const sign = value >= 0 ? '+' : '';
  const color = value >= 0 ? 'var(--gain-fg)' : 'var(--loss-fg)';
  return (
    <span style={{ color, fontSize: size, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {sign}{value.toFixed(2)}%
    </span>
  );
}

window.Amigo = window.Amigo || {};
Object.assign(window.Amigo, { Icon, Eyebrow, Button, Card, Chip, Money, Pct });
