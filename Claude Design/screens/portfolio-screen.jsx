// portfolio-screen.jsx — Portfolio · Ativos page (desktop).
// Net worth header · allocation bar · holdings ledger · brokerage cards.

const PortfolioScreen = () => {
  const allocation = [
    { name: 'Ações',         value: 92840, color: 'var(--cat-forest)' },
    { name: 'ETF · Globais', value: 48210, color: 'var(--cat-sage)' },
    { name: 'Obrigações',    value: 21800, color: 'var(--cat-bronze)' },
    { name: 'Cripto',        value: 12480, color: 'var(--cat-clay)' },
    { name: 'Liquidez',      value:  8990, color: 'var(--cat-fog)' },
  ];
  const total = allocation.reduce((s, x) => s + x.value, 0);

  const holdings = [
    { tkr: 'VWCE.DE',  name: 'Vanguard FTSE All-World UCITS', cls: 'ETF',     qty: 412,    avg: 102.40, last: 118.92, val: 48994.64, dpct: 0.84,  ypct: 16.13, broker: 'DEGIRO' },
    { tkr: 'GALP.LS',  name: 'Galp Energia',                  cls: 'Ação',    qty: 1840,   avg: 11.20,  last: 14.28,  val: 26275.20, dpct: -0.42, ypct: 27.50, broker: 'Millennium Investing' },
    { tkr: 'NOS.LS',   name: 'NOS, SGPS',                     cls: 'Ação',    qty: 4200,   avg: 3.62,   last: 3.94,   val: 16548.00, dpct: 0.18,  ypct: 8.84,  broker: 'Millennium Investing' },
    { tkr: 'EDP.LS',   name: 'EDP — Energias de Portugal',    cls: 'Ação',    qty: 5200,   avg: 4.18,   last: 4.02,   val: 20904.00, dpct: -0.92, ypct: -3.83, broker: 'Millennium Investing' },
    { tkr: 'AGGH.DE',  name: 'iShares Core Global Aggregate Bond', cls: 'Obrig.', qty: 480, avg: 4.62, last: 4.54,  val: 2179.20,  dpct: 0.04,  ypct: -1.73, broker: 'DEGIRO' },
    { tkr: 'BTC',      name: 'Bitcoin',                       cls: 'Cripto',  qty: 0.184,  avg: 41200,  last: 67840,  val: 12482.56, dpct: 1.62,  ypct: 64.66, broker: 'Coinbase' },
  ];

  return (
    <div className="app">
      <Sidebar active="ativos"/>
      <div className="app-main">
        <Topbar/>
        <div className="page">
          <header className="page-head">
            <div>
              <Eyebrow>Portfolio · 14 Outubro 2025</Eyebrow>
              <h1 className="page-title">Os teus <em>ativos</em>.</h1>
              <p className="page-sub">Ações, obrigações, fundos e cripto. Atualizado às 16:42 — ainda durante o pregão de Lisboa.</p>
            </div>
            <div className="page-actions">
              <Button kind="ghost" size="sm" icon={<Icon name="sync"/>}>Sincronizar corretoras</Button>
              <Button kind="primary" size="md" icon={<Icon name="plus"/>}>Novo lançamento</Button>
            </div>
          </header>

          {/* Hero */}
          <Card padded={false}>
            <div style={{ padding: '28px 28px 18px', display:'grid', gridTemplateColumns:'1.6fr 1fr 1fr', gap: 32, alignItems:'flex-end' }}>
              <div>
                <Eyebrow accent>Valor de mercado · total</Eyebrow>
                <div style={{ display:'flex', alignItems:'baseline', gap: 18, marginTop: 8 }}>
                  <Amount value={total} size="2xl"/>
                  <Delta value={1.84}/>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6, fontStyle:'italic' }}>+ €3 218,40 nas últimas 24 horas</div>
              </div>
              <div className="stat">
                <span className="stat-label">Custo médio</span>
                <Amount value={146820.00} size="md" dim/>
                <span className="stat-foot muted">capital investido</span>
              </div>
              <div className="stat">
                <span className="stat-label">Ganho não realizado</span>
                <Amount value={37499.50} size="md" signed/>
                <span className="stat-foot"><Delta value={25.54}/> <span className="muted">desde compra</span></span>
              </div>
            </div>

            <div className="gilt-rule with-dot" style={{ margin: '0 28px' }}></div>

            {/* Allocation bar */}
            <div style={{ padding: '18px 28px 24px' }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <Eyebrow>Distribuição por classe</Eyebrow>
                <span className="muted" style={{ fontSize: 11.5, fontStyle:'italic' }}>Diversificação adequada · concentração em ações Lisboa = 36%</span>
              </div>
              <div className="bar" style={{ height: 10 }}>
                {allocation.map((a, i) => (
                  <div key={i} className="bar-seg" style={{ width: `${(a.value/total)*100}%`, background: a.color }}></div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 14, marginTop: 14 }}>
                {allocation.map((a) => (
                  <div key={a.name} style={{ borderLeft: `2px solid ${a.color}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 11.5, color:'var(--ink-mute)' }}>{a.name}</div>
                    <div style={{ display:'flex', alignItems:'baseline', gap: 6 }}>
                      <Amount value={a.value} size="sm"/>
                      <span className="mono" style={{ fontSize: 10.5, color:'var(--ink-faint)' }}>{((a.value/total)*100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <div>
            <div className="tabs">
              <span className="tab is-active">Posições</span>
              <span className="tab">Movimentos</span>
              <span className="tab">Dividendos</span>
              <span className="tab">Performance</span>
              <span className="tab">Fiscal · IRS</span>
            </div>
          </div>

          {/* Holdings ledger */}
          <Card eyebrow="Posições · 6 ativos" title="Carteira atual" padded={false} action={null}>
            <div style={{ padding: '0 4px' }}>
              <table className="ledger" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 24 }}>Ticker · Nome</th>
                    <th>Classe</th>
                    <th className="num">Quantidade</th>
                    <th className="num">Médio</th>
                    <th className="num">Última</th>
                    <th className="num">Dia</th>
                    <th className="num">Valor</th>
                    <th className="num" style={{ paddingRight: 24 }}>Ganho</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.tkr}>
                      <td style={{ paddingLeft: 24 }}>
                        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                          <div style={{ width: 32, height: 32, border: '1px solid var(--rule-strong)', borderRadius: 3, display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize: 9.5, fontWeight: 500, letterSpacing:'0.04em', background:'var(--paper-soft)', color:'var(--ink-soft)' }}>
                            {h.tkr.split('.')[0].slice(0,4)}
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color:'var(--gilt-deep)', letterSpacing:'0.04em' }}>{h.tkr}</div>
                            <div style={{ fontWeight: 500, color:'var(--ink)', fontSize: 13.5 }}>{h.name}</div>
                            <div className="muted" style={{ fontSize: 11, fontStyle:'italic', marginTop: 1 }}>via {h.broker}</div>
                          </div>
                        </div>
                      </td>
                      <td><Seal tone="ink">{h.cls}</Seal></td>
                      <td className="num mono" style={{ fontSize: 12 }}>{h.qty.toLocaleString('pt-PT')}</td>
                      <td className="num"><Amount value={h.avg} size="xs" dim/></td>
                      <td className="num"><Amount value={h.last} size="xs"/></td>
                      <td className="num"><Delta value={h.dpct}/></td>
                      <td className="num"><Amount value={h.val} size="sm"/></td>
                      <td className="num" style={{ paddingRight: 24 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 2 }}>
                          <Amount value={h.val - h.qty * h.avg} size="xs" signed/>
                          <Delta value={h.ypct}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Brokerages */}
          <div>
            <div className="row between" style={{ marginBottom: 12 }}>
              <Eyebrow>Corretoras · 3 contas ligadas</Eyebrow>
              <Button kind="ghost" size="sm" icon={<Icon name="plus" size={12}/>}>Adicionar corretora</Button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 18 }}>
              {[
                { n:'DEGIRO', sub:'Conta Custo · NL', val: 51173.84, last:'há 8 min', n_pos: 2 },
                { n:'Millennium Investing', sub:'BCP · PT', val: 63727.20, last:'há 12 min', n_pos: 3 },
                { n:'Coinbase', sub:'Wallet · BTC', val: 12482.56, last:'há 2 min', n_pos: 1 },
              ].map((b) => (
                <Card key={b.n}>
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize: 16, fontWeight: 500 }}>{b.n}</div>
                      <div className="muted" style={{ fontSize: 11.5, fontStyle:'italic' }}>{b.sub}</div>
                    </div>
                    <span className="seal seal-moss" style={{ background:'var(--moss-tint)' }}>Sincronizada</span>
                  </div>
                  <Amount value={b.val} size="md"/>
                  <div className="row between" style={{ paddingTop: 12, borderTop: '1px dotted var(--rule)', marginTop: 12 }}>
                    <span className="mono muted" style={{ fontSize: 10.5 }}>{b.n_pos} POSIÇÃO{b.n_pos>1?'ÕES':''}</span>
                    <span className="muted" style={{ fontSize: 11, fontStyle:'italic' }}>actualizada {b.last}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PortfolioScreen });
