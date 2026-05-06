// dashboard-variants.jsx — two density treatments of the same painel.
//
// Variant A · "Conta Corrente" — focused, generous whitespace.
//   One hero number (saldo do mês), one chart, one ledger preview.
//   Reads as a personal letter from your accountant.
//
// Variant B · "Mesa de Trabalho" — denser planning surface.
//   Patrimony + month + budget + cash-flow forecast + recurrentes.
//   Reads as a desk you sit at with coffee on Sunday.

const CATS = [
  { id: 'casa',     name: 'Casa',           color: 'var(--cat-forest)' },
  { id: 'mercearia',name: 'Mercearia',      color: 'var(--cat-ochre)' },
  { id: 'carro',    name: 'Carro & Combustível', color: 'var(--cat-clay)' },
  { id: 'rest',     name: 'Restaurantes',   color: 'var(--cat-bronze)' },
  { id: 'saude',    name: 'Saúde & Bem-estar', color: 'var(--cat-sage)' },
  { id: 'eventos',  name: 'Eventos & Saídas',  color: 'var(--cat-plum)' },
  { id: 'imp',      name: 'Impostos',       color: 'var(--cat-rust)' },
  { id: 'serv',     name: 'Serviços',       color: 'var(--cat-fog)' },
];

const TXNS = [
  { d: '14 Out', name: 'Continente Colombo',   cat: 'mercearia', amt: -84.32, acct: 'Millennium · Débito' },
  { d: '14 Out', name: 'Galp · A1 Santarém',   cat: 'carro',     amt: -65.00, acct: 'Millennium · Débito' },
  { d: '13 Out', name: 'Salário · Outubro',    cat: null,        amt: 2840.00, acct: 'Millennium · Conta', kind: 'in' },
  { d: '12 Out', name: 'Renda · Casa Lapa',    cat: 'casa',      amt: -1180.00, acct: 'Trf. SEPA' },
  { d: '11 Out', name: 'Tasca do Chico',       cat: 'rest',      amt: -42.50, acct: 'Revolut' },
  { d: '10 Out', name: 'Farmácia Saldanha',    cat: 'saude',     amt: -18.20, acct: 'Millennium · Débito' },
  { d: '09 Out', name: 'EDP Comercial',        cat: 'serv',      amt: -68.40, acct: 'Débito Direto' },
  { d: '08 Out', name: 'NOS Comunicações',     cat: 'serv',      amt: -52.99, acct: 'Débito Direto' },
];

const catById = (id) => CATS.find((c) => c.id === id);

// ---------- DonutChart ----------
const DonutChart = ({ data, size = 200, thickness = 22, total }) => {
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const sum = data.reduce((s, d) => s + d.value, 0);
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--paper-deep)" strokeWidth={thickness}/>
        {data.map((d, i) => {
          const len = (d.value / sum) * C;
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-off}
            />
          );
          off += len + 1.5;
          return seg;
        })}
        {/* gilt outer hairline */}
        <circle cx={cx} cy={cy} r={(size/2)-1} fill="none" stroke="var(--gilt)" strokeWidth="0.5" opacity="0.5"/>
      </svg>
      <div className="donut-center">
        {total}
      </div>
    </div>
  );
};

// ---------- Cash flow line ----------
const CashflowLine = ({ width = 720, height = 180 }) => {
  // 30 daily points; one income spike, recurring small outflows.
  const pts = [
    0,-12,-22,-35,-44,-58,-65,-78,-86,-92,
    -110,-128,-142,-158,-176,-192,-210,-228,-242,-260,
    -280,-298,-312,2540,2510,2470,2438,2390,2360,2328,
  ];
  const min = Math.min(...pts), max = Math.max(...pts);
  const pad = 14;
  const W = width - 60, H = height - pad * 2;
  const x = (i) => 50 + (i / (pts.length - 1)) * W;
  const y = (v) => pad + (1 - (v - min) / (max - min)) * H;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const dArea = `${d} L ${x(pts.length - 1)} ${y(min)} L ${x(0)} ${y(min)} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="cashflow">
      {/* zero rule */}
      <line x1="50" y1={y(0)} x2={width - 10} y2={y(0)} stroke="var(--rule-strong)" strokeWidth="0.6" strokeDasharray="2 3"/>
      {/* gilt today marker */}
      <line x1={x(22)} y1="6" x2={x(22)} y2={height - 6} stroke="var(--gilt)" strokeWidth="0.6" strokeDasharray="1 4"/>
      <path d={dArea} fill="var(--forest-tint)" opacity="0.6"/>
      <path d={d} fill="none" stroke="var(--forest)" strokeWidth="1.4"/>
      {/* income spike marker */}
      <circle cx={x(23)} cy={y(2540)} r="3" fill="var(--gilt)"/>
      <text x={x(23) + 6} y={y(2540) - 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--gilt-deep)">salário</text>
      {/* axis labels */}
      <text x="50" y={height - 2} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em">01 OUT</text>
      <text x={x(15) - 18} y={height - 2} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em">15 OUT</text>
      <text x={width - 50} y={height - 2} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em">31 OUT</text>
    </svg>
  );
};

// ---------- 12-month bars (income vs expense) ----------
const MonthBars = ({ width = 720, height = 160 }) => {
  const months = ['Nov','Dez','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out'];
  const inc = [2840, 3120, 2840, 2840, 2960, 2840, 2840, 3060, 2840, 2840, 2840, 2840];
  const exp = [-2110,-2640,-2210,-1980,-2330,-2090,-2240,-2780,-2090,-1990,-2160,-2090];
  const max = 3200;
  const bw = (width - 80) / months.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line x1="40" y1={height/2} x2={width-20} y2={height/2} stroke="var(--rule-strong)" strokeWidth="0.6"/>
      {months.map((m, i) => {
        const cx = 40 + bw * i + bw / 2;
        const incH = (inc[i] / max) * (height/2 - 16);
        const expH = (-exp[i] / max) * (height/2 - 16);
        const last = i === months.length - 1;
        return (
          <g key={m}>
            <rect x={cx - 9} y={height/2 - incH} width="6" height={incH} fill={last ? 'var(--moss)' : 'var(--moss-tint)'} stroke={last ? 'var(--moss-deep)' : 'none'} strokeWidth="0.5"/>
            <rect x={cx + 3} y={height/2} width="6" height={expH} fill={last ? 'var(--ink)' : 'var(--paper-deep)'} stroke={last ? 'var(--ink)' : 'var(--rule-strong)'} strokeWidth="0.5"/>
            <text x={cx} y={height - 6} fontFamily="var(--font-mono)" fontSize="9" textAnchor="middle" fill={last ? 'var(--ink)' : 'var(--ink-faint)'} letterSpacing="0.1em">{m.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ---------- Variant A — Conta Corrente ----------
const DashboardA = () => {
  const donutData = [
    { label: 'Casa',        value: 1180, color: 'var(--cat-forest)' },
    { label: 'Mercearia',   value: 412,  color: 'var(--cat-ochre)' },
    { label: 'Carro',       value: 240,  color: 'var(--cat-clay)' },
    { label: 'Restaurantes',value: 168,  color: 'var(--cat-bronze)' },
    { label: 'Saúde',       value: 60,   color: 'var(--cat-sage)' },
    { label: 'Serviços',    value: 220,  color: 'var(--cat-fog)' },
  ];
  const totalSpent = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="app">
      <Sidebar active="painel"/>
      <div className="app-main">
        <Topbar/>
        <div className="page">
          <header className="page-head">
            <div>
              <Eyebrow>Outubro · 2025 · Pessoal</Eyebrow>
              <h1 className="page-title">Bom dia, <em>Francisco</em>.</h1>
              <p className="page-sub">Estás a ter um mês tranquilo. Restam dezassete dias e um salário ainda por entrar.</p>
            </div>
            <div className="page-actions">
              <Button kind="ghost" size="sm" icon={<Icon name="sync"/>}>Sincronizar</Button>
              <Button kind="primary" size="md" icon={<Icon name="plus"/>}>Nova despesa</Button>
            </div>
          </header>

          {/* HERO: month at a glance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
            <Card className="hero-card" padded={false}>
              <div style={{ padding: '28px 28px 20px', display:'flex', flexDirection:'column', gap: 14 }}>
                <Eyebrow accent>Saldo do mês · até hoje</Eyebrow>
                <div style={{ display:'flex', alignItems:'baseline', gap: 18 }}>
                  <Amount value={560.41} size="2xl"/>
                  <Delta value={12.4}/>
                </div>
                <div style={{ display:'flex', gap: 28, paddingTop: 4 }}>
                  <div className="stat">
                    <span className="stat-label">Receitas</span>
                    <Amount value={2840.00} size="md" signed/>
                  </div>
                  <div style={{ width: 1, background: 'var(--rule)' }}></div>
                  <div className="stat">
                    <span className="stat-label">Despesas</span>
                    <Amount value={-2279.59} size="md"/>
                  </div>
                  <div style={{ width: 1, background: 'var(--rule)' }}></div>
                  <div className="stat">
                    <span className="stat-label">Por liquidar</span>
                    <Amount value={-348.00} size="md" dim/>
                  </div>
                </div>
              </div>
              <div className="gilt-rule with-dot" style={{ margin: '0 28px' }}></div>
              <div style={{ padding: '18px 28px 26px' }}>
                <CashflowLine width={680} height={180}/>
              </div>
            </Card>

            {/* Donut */}
            <Card eyebrow="Onde foi o dinheiro" title="Distribuição de despesas">
              <div style={{ display:'flex', alignItems:'center', gap: 24 }}>
                <DonutChart
                  data={donutData}
                  size={180}
                  thickness={20}
                  total={(
                    <>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize: 9.5, letterSpacing:'0.18em', color:'var(--ink-faint)', textTransform:'uppercase' }}>Total gasto</span>
                      <Amount value={-totalSpent} size="md"/>
                    </>
                  )}
                />
                <div style={{ flex: 1, display:'flex', flexDirection:'column', gap: 8 }}>
                  {donutData.map((d) => (
                    <div key={d.label} style={{ display:'grid', gridTemplateColumns:'14px 1fr auto', alignItems:'center', gap: 10 }}>
                      <span className="cat-swatch" style={{ background: d.color }}></span>
                      <span style={{ fontSize: 13 }}>{d.label}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize: 11.5, color:'var(--ink-mute)' }}>€{d.value.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Recent ledger */}
          <Card
            eyebrow="Movimentos · Últimos 8 dias"
            title="Lançamentos recentes"
            action={<Button kind="ghost" size="sm">Ver todos →</Button>}
          >
            <table className="ledger">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Conta</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {TXNS.map((t, i) => {
                  const cat = catById(t.cat);
                  return (
                    <tr key={i}>
                      <td className="col-date">{t.d}</td>
                      <td><span style={{ fontWeight: 500, color:'var(--ink)' }}>{t.name}</span></td>
                      <td>
                        {cat ? (
                          <span className="cat-chip">
                            <span className="cat-swatch" style={{ background: cat.color }}></span>
                            {cat.name}
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12, fontStyle:'italic' }}>—</span>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>{t.acct}</td>
                      <td className="num">
                        <Amount value={t.amt} size="sm" signed={t.kind === 'in'}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ---------- Variant B — Mesa de Trabalho ----------
const DashboardB = () => {
  const donutData = [
    { label: 'Casa',        value: 1180, color: 'var(--cat-forest)' },
    { label: 'Mercearia',   value: 412,  color: 'var(--cat-ochre)' },
    { label: 'Carro',       value: 240,  color: 'var(--cat-clay)' },
    { label: 'Restaurantes',value: 168,  color: 'var(--cat-bronze)' },
    { label: 'Saúde',       value: 60,   color: 'var(--cat-sage)' },
    { label: 'Serviços',    value: 220,  color: 'var(--cat-fog)' },
  ];

  const budgets = [
    { name: 'Casa', spent: 1180, budget: 1200, color: 'var(--cat-forest)' },
    { name: 'Mercearia', spent: 412, budget: 600, color: 'var(--cat-ochre)' },
    { name: 'Carro & Combustível', spent: 240, budget: 320, color: 'var(--cat-clay)' },
    { name: 'Restaurantes', spent: 168, budget: 200, color: 'var(--cat-bronze)' },
    { name: 'Saúde', spent: 60, budget: 150, color: 'var(--cat-sage)' },
    { name: 'Serviços', spent: 220, budget: 240, color: 'var(--cat-fog)' },
    { name: 'Eventos & Saídas', spent: 92, budget: 150, color: 'var(--cat-plum)' },
  ];

  const recur = [
    { name: 'Renda · Casa Lapa', amt: -1180.00, when: 'todo dia 1', next: '01 Nov', cat: 'casa' },
    { name: 'EDP Comercial',     amt: -68.40,   when: 'todo dia 9', next: '09 Nov', cat: 'serv' },
    { name: 'NOS Comunicações',  amt: -52.99,   when: 'todo dia 8', next: '08 Nov', cat: 'serv' },
    { name: 'MEO Fibra Casa Lapa', amt: -41.99, when: 'todo dia 12',next: '12 Nov', cat: 'serv' },
    { name: 'Spotify Family',    amt: -19.99,   when: 'todo dia 22',next: '22 Out', cat: 'eventos' },
  ];

  return (
    <div className="app">
      <Sidebar active="painel"/>
      <div className="app-main">
        <Topbar/>
        <div className="page">
          <header className="page-head">
            <div>
              <Eyebrow>Outubro · 2025 · Pessoal</Eyebrow>
              <h1 className="page-title" style={{ fontSize: 36 }}>Painel</h1>
              <p className="page-sub">Visão completa: património, fluxo, orçamentos e compromissos por liquidar.</p>
            </div>
            <div className="page-actions">
              <div style={{ display:'flex', gap: 4, padding: 4, background: 'var(--paper-deep)', border: '1px solid var(--rule)', borderRadius: 999 }}>
                <button className="pill is-active" style={{ padding: '4px 12px' }}>Mês</button>
                <button className="pill" style={{ padding: '4px 12px', border: 0 }}>Trimestre</button>
                <button className="pill" style={{ padding: '4px 12px', border: 0 }}>Ano</button>
              </div>
              <Button kind="ghost" size="sm" icon={<Icon name="sync"/>}>Sincronizar</Button>
              <Button kind="primary" size="md" icon={<Icon name="plus"/>}>Nova despesa</Button>
            </div>
          </header>

          {/* Top row: 3 KPIs + sparkline */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 18 }}>
            <Card>
              <div className="stat">
                <span className="stat-label">Património Líquido</span>
                <Amount value={184320.50} size="lg"/>
                <span className="stat-foot"><Delta value={2.84}/> <span className="muted">vs mês passado</span></span>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <span className="stat-label">Saldo · Outubro</span>
                <Amount value={560.41} size="lg"/>
                <span className="stat-foot"><Delta value={12.4}/> <span className="muted">+ €348 por liquidar</span></span>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <span className="stat-label">Despesas do Mês</span>
                <Amount value={-2279.59} size="lg"/>
                <span className="stat-foot"><Delta value={-4.2}/> <span className="muted">abaixo da média</span></span>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <span className="stat-label">Taxa de Poupança</span>
                <span className="amount amount-lg">19,7<span className="amount-cents" style={{fontSize:'0.55em'}}>%</span></span>
                <span className="stat-foot"><Delta value={1.8}/> <span className="muted">média 17,9%</span></span>
              </div>
            </Card>
          </div>

          {/* Middle row: cashflow + donut */}
          <div style={{ display:'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
            <Card eyebrow="Fluxo · 12 meses" title="Receitas vs Despesas" action={<Pill>EUR · líquido</Pill>}>
              <MonthBars width={720} height={170}/>
              <div style={{ display:'flex', gap: 24, marginTop: 12, paddingTop: 12, borderTop: '1px dotted var(--rule)' }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="cat-swatch" style={{ background:'var(--moss)' }}></span>
                  <span style={{ fontSize: 12 }}>Receitas · média €2 904</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="cat-swatch" style={{ background:'var(--ink)' }}></span>
                  <span style={{ fontSize: 12 }}>Despesas · média €2 226</span>
                </div>
                <div className="row" style={{ gap: 8, marginLeft:'auto' }}>
                  <Seal tone="moss">+30,4% poupado</Seal>
                </div>
              </div>
            </Card>

            <Card eyebrow="Distribuição" title="Despesas por categoria">
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 12 }}>
                <DonutChart
                  data={donutData}
                  size={170}
                  thickness={18}
                  total={(
                    <>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.18em', color:'var(--ink-faint)', textTransform:'uppercase' }}>Total</span>
                      <Amount value={-2280} size="sm"/>
                    </>
                  )}
                />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: '4px 14px', width:'100%' }}>
                  {donutData.map((d) => (
                    <div key={d.label} style={{ display:'flex', alignItems:'center', gap: 6, fontSize: 11.5 }}>
                      <span className="cat-swatch" style={{ background: d.color, width: 8, height: 8 }}></span>
                      <span style={{ flex: 1 }}>{d.label}</span>
                      <span className="mono muted" style={{ fontSize: 10.5 }}>{Math.round((d.value / donutData.reduce((s,x)=>s+x.value,0))*100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom row: budgets + recurring */}
          <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card eyebrow="Orçamentos · Outubro" title="Limites por categoria" action={<Button kind="ghost" size="sm">Editar →</Button>}>
              <div>
                {budgets.map((b) => {
                  const pct = (b.spent / b.budget) * 100;
                  const over = pct >= 95;
                  return (
                    <div className="budget-row" key={b.name}>
                      <span className="b-name">
                        <span className="cat-swatch" style={{ background: b.color, display:'inline-block', marginRight: 8, verticalAlign:'middle' }}></span>
                        {b.name}
                      </span>
                      <span className="b-amt">
                        €{b.spent.toFixed(0)} <span className="faint">/ €{b.budget.toFixed(0)}</span>
                      </span>
                      <div className="b-bar">
                        <div className="b-fill" style={{ width: `${Math.min(pct,100)}%`, background: over ? 'var(--amber)' : b.color }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card eyebrow="Recorrentes · Próximos 30 dias" title="Compromissos previstos" action={<Button kind="ghost" size="sm">Gerir →</Button>}>
              <table className="ledger">
                <tbody>
                  {recur.map((r, i) => {
                    const cat = catById(r.cat);
                    return (
                      <tr key={i}>
                        <td className="col-date">{r.next}</td>
                        <td>
                          <div style={{ fontWeight: 500, color:'var(--ink)' }}>{r.name}</div>
                          <div className="muted" style={{ fontSize: 11.5, fontStyle:'italic', marginTop: 2 }}>{r.when}</div>
                        </td>
                        <td>{cat && <span className="cat-chip"><span className="cat-swatch" style={{ background: cat.color }}></span>{cat.name}</span>}</td>
                        <td className="num"><Amount value={r.amt} size="sm"/></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { DashboardA, DashboardB, CATS, TXNS });
