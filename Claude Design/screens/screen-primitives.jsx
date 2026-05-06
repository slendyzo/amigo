// screen-primitives.jsx
// Shared chrome + atoms used across every amigo screen mock.
// Loaded as plain Babel script — exposes everything to window.
//
// Convention: every component is presentational. No state, no fetch.
// All copy in PT-PT to match the existing product.

const Sidebar = ({ active = 'painel' }) => {
  const groups = [
    {
      label: 'Visão',
      items: [
        { id: 'painel', name: 'Painel' },
      ],
    },
    {
      label: 'Portfolio',
      items: [
        { id: 'ativos', name: 'Ativos' },
        { id: 'corretoras', name: 'Corretoras' },
      ],
    },
    {
      label: 'Finanças',
      items: [
        { id: 'despesas', name: 'Despesas' },
        { id: 'receitas', name: 'Receitas' },
        { id: 'recorrentes', name: 'Recorrentes' },
      ],
    },
    {
      label: 'Ferramentas',
      items: [
        { id: 'importar', name: 'Importar' },
        { id: 'categorias', name: 'Categorias' },
        { id: 'arrumar', name: 'Arrumar', badge: 3 },
        { id: 'contas', name: 'Contas Bancárias' },
        { id: 'mapeamentos', name: 'Mapeamentos' },
        { id: 'projetos', name: 'Projetos' },
      ],
    },
    {
      label: 'Conta',
      items: [
        { id: 'definicoes', name: 'Definições' },
        { id: 'caixa', name: 'Caixa de Entrada' },
      ],
    },
  ];
  return (
    <aside className="sb">
      <div className="sb-brand">
        <span className="sb-mark">(<span className="sb-dot"></span>)</span>
        <span className="sb-word">amigo</span>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="sb-group">
          <div className="sb-group-label">{g.label}</div>
          {g.items.map((it) => (
            <div
              key={it.id}
              className={`sb-item ${active === it.id ? 'is-active' : ''}`}
            >
              <span className="sb-bullet"></span>
              <span className="sb-item-name">{it.name}</span>
              {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
            </div>
          ))}
        </div>
      ))}
      <div className="sb-foot">
        <div className="sb-foot-label">Sessão</div>
        <div className="sb-foot-email">kikoman200@gmail.com</div>
      </div>
    </aside>
  );
};

const Topbar = ({ profile = 'Pessoal' }) => (
  <header className="topbar">
    <div className="topbar-l">
      <button className="profile-pill">
        <span className="profile-dot"></span>
        <span>{profile}</span>
        <span className="caret">▾</span>
      </button>
    </div>
    <div className="topbar-r">
      <span className="topbar-meta">kikoman200@gmail.com</span>
      <span className="topbar-sep"></span>
      <button className="topbar-link">Terminar Sessão</button>
    </div>
  </header>
);

// Card — the main composition unit. Eyebrow + title + body region.
const Card = ({ eyebrow, title, action, children, padded = true, className = '' }) => (
  <section className={`card ${padded ? 'is-padded' : ''} ${className}`}>
    {(eyebrow || title || action) && (
      <header className="card-head">
        <div className="card-head-l">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {title && <h3 className="card-title">{title}</h3>}
        </div>
        {action && <div className="card-action">{action}</div>}
      </header>
    )}
    <div className="card-body">{children}</div>
  </section>
);

// Numerals — the brand voice. Always Fraunces, tabular, tight tracking.
// Cents render in muted ink and slightly smaller.
const Amount = ({ value, currency = '€', size = 'lg', dim = false, signed = false }) => {
  // value can be a number or a string like "1234.56"
  const n = typeof value === 'string' ? parseFloat(value) : value;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  const [whole, cents = '00'] = abs.toFixed(2).split('.');
  // Group thousands with thin space (NBSP for layout)
  const wholeFmt = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return (
    <span className={`amount amount-${size} ${dim ? 'is-dim' : ''} ${n < 0 ? 'is-neg' : ''}`}>
      {sign && <span className="amount-sign">{sign}</span>}
      <span className="amount-cur">{currency}</span>
      <span className="amount-int">{wholeFmt}</span>
      <span className="amount-cents">,{cents}</span>
    </span>
  );
};

const Delta = ({ value, suffix = '%' }) => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  const positive = n >= 0;
  return (
    <span className={`delta ${positive ? 'is-up' : 'is-down'}`}>
      <span className="delta-arrow">{positive ? '▲' : '▼'}</span>
      <span className="delta-num">
        {positive ? '+' : '−'}
        {Math.abs(n).toFixed(2)}
        {suffix}
      </span>
    </span>
  );
};

const Eyebrow = ({ children, accent = false }) => (
  <span className={`eyebrow ${accent ? 'is-accent' : ''}`}>{children}</span>
);

const Pill = ({ children, dot, active = false }) => (
  <span className={`pill ${active ? 'is-active' : ''}`}>
    {dot && <span className="pill-dot" style={{ background: dot }}></span>}
    {children}
  </span>
);

// Seal — uppercase mono caps inside a thin box. Used for type/category tags.
const Seal = ({ children, tone = 'gilt' }) => (
  <span className={`seal seal-${tone}`}>{children}</span>
);

// PrimaryButton / GhostButton / IconButton — Fraunces label, flat ink fills.
const Button = ({ children, kind = 'primary', icon, size = 'md', onClick, ...rest }) => (
  <button className={`btn btn-${kind} btn-${size}`} onClick={onClick} {...rest}>
    {icon && <span className="btn-icon">{icon}</span>}
    <span className="btn-label">{children}</span>
  </button>
);

const Icon = ({ name, size = 16 }) => {
  // Tiny lucide-style line set, 1.25 stroke, currentColor.
  const paths = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    chevron: <polyline points="9 6 15 12 9 18"/>,
    chevrond: <polyline points="6 9 12 15 18 9"/>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
    receipt: <><path d="M4 2h16v20l-4-2-4 2-4-2-4 2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></>,
    sync: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    car: <><path d="M3 17h18l-2-7H5z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></>,
    coffee: <><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/><line x1="14" y1="2" x2="14" y2="5"/></>,
    cart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></>,
    bowling: <><circle cx="12" cy="12" r="10"/><circle cx="9" cy="9" r="0.5" fill="currentColor"/><circle cx="13" cy="9" r="0.5" fill="currentColor"/><circle cx="11" cy="13" r="0.5" fill="currentColor"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    edit: <><path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></>,
    arrowup: <line x1="12" y1="19" x2="12" y2="5"/>,
    arrowright: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    bracketL: null,
    bracketR: null,
  };
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// Bracket dot mark — used in chrome (sidebar brand, splash, etc).
const BracketMark = ({ size = 28 }) => (
  <span className="bracket-mark" style={{ fontSize: size }}>
    (<span className="bracket-dot" style={{ width: Math.max(3, size * 0.11), height: Math.max(3, size * 0.11) }}></span>)
  </span>
);

Object.assign(window, {
  Sidebar, Topbar, Card, Amount, Delta, Eyebrow, Pill, Seal, Button, Icon, BracketMark,
});
