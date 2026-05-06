// mobile-screens.jsx — phone canvases for amigo.
// Three screens here: MobileDashboard, MobileAddSheet, MobileAddFullscreen.
// All sized 390 x 844 (iPhone 14 logical size) for the Frame to wrap.

const M_TXNS = [
  { d: 'Hoje',     t: '18:42', name: 'Continente Colombo', cat: 'mercearia', amt: -84.32 },
  { d: 'Hoje',     t: '13:10', name: 'Galp · A1 Santarém', cat: 'carro',     amt: -65.00 },
  { d: 'Ontem',    t: '09:00', name: 'Salário · Outubro',  cat: null,        amt: 2840.00, kind:'in' },
  { d: 'Ontem',    t: '21:33', name: 'Tasca do Chico',     cat: 'rest',      amt: -42.50 },
  { d: '12 Out',   t: '08:00', name: 'Renda · Casa Lapa',  cat: 'casa',      amt: -1180.00 },
];

const MTabbar = ({ active = 'painel' }) => {
  const items = [
    { id: 'painel',  label: 'Painel' },
    { id: 'lanc',    label: 'Lançam.' },
    { id: 'add',     label: '', isFab: true },
    { id: 'ativos',  label: 'Ativos' },
    { id: 'mais',    label: 'Mais' },
  ];
  return (
    <nav className="m-tabbar">
      {items.map((it) => it.isFab ? (
        <div key={it.id}></div>
      ) : (
        <div key={it.id} className={`m-tab ${active === it.id ? 'is-active' : ''}`}>
          <span style={{ fontSize: 11, fontFamily:'var(--font-display)', fontWeight: 500, letterSpacing: 0, textTransform:'none' }}>{it.label}</span>
          <span className="m-tab-dot"></span>
        </div>
      ))}
    </nav>
  );
};

// ---------- Mobile Dashboard ----------
const MobileDashboard = () => {
  const cats = [
    { name: 'Casa',       v: 1180, c: 'var(--cat-forest)' },
    { name: 'Mercearia',  v: 412,  c: 'var(--cat-ochre)' },
    { name: 'Carro',      v: 240,  c: 'var(--cat-clay)' },
    { name: 'Restaurantes',v:168,  c: 'var(--cat-bronze)' },
    { name: 'Saúde',      v: 60,   c: 'var(--cat-sage)' },
    { name: 'Serviços',   v: 220,  c: 'var(--cat-fog)' },
  ];
  const total = cats.reduce((s, x) => s + x.v, 0);
  const cBy = (id) => CATS.find((c) => c.id === id);

  return (
    <div className="m-page">
      <div style={{ flex: 1, overflowY:'auto', paddingBottom: 80 }}>
        {/* Header */}
        <div className="m-head">
          <div>
            <div className="m-greet">Terça · 14 Out</div>
            <div className="m-title">Bom dia, <em style={{ fontStyle:'italic', color:'var(--gilt-deep)' }}>Francisco</em></div>
          </div>
          <span className="m-avatar">F</span>
        </div>

        {/* Hero card · Forest */}
        <div className="m-section" style={{ marginTop: 6 }}>
          <div className="m-card is-feature" style={{ padding: '20px 22px 22px' }}>
            <Eyebrow accent>Saldo do mês</Eyebrow>
            <div style={{ display:'flex', alignItems:'baseline', gap: 12, marginTop: 10 }}>
              <Amount value={560.41} size="xl"/>
              <Delta value={12.4}/>
            </div>
            <div style={{ display:'flex', gap: 14, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(241,235,221,0.16)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--gilt-soft)' }}>Receitas</div>
                <Amount value={2840} size="sm"/>
              </div>
              <div style={{ width: 1, background:'rgba(241,235,221,0.16)' }}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--gilt-soft)' }}>Despesas</div>
                <Amount value={-2280} size="sm"/>
              </div>
            </div>
          </div>
        </div>

        {/* Allocation row */}
        <div className="m-section" style={{ marginTop: 16 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <Eyebrow>Onde foi o dinheiro</Eyebrow>
            <span className="muted" style={{ fontSize: 11, fontStyle:'italic' }}>Outubro</span>
          </div>
          <div className="m-card" style={{ padding: 16 }}>
            <div className="bar" style={{ height: 8, marginBottom: 14 }}>
              {cats.map((c, i) => (
                <div key={i} className="bar-seg" style={{ width: `${(c.v/total)*100}%`, background: c.c }}></div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: '10px 16px' }}>
              {cats.map((c) => (
                <div key={c.name} style={{ display:'flex', alignItems:'center', gap: 8 }}>
                  <span className="cat-swatch" style={{ background: c.c }}></span>
                  <span style={{ flex: 1, fontSize: 12 }}>{c.name}</span>
                  <span className="mono" style={{ fontSize: 10.5, color:'var(--ink-mute)' }}>€{c.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent ledger */}
        <div className="m-section" style={{ marginTop: 18 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <Eyebrow>Movimentos recentes</Eyebrow>
            <span style={{ fontSize: 11.5, color:'var(--gilt-deep)', fontStyle:'italic' }}>ver todos →</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {M_TXNS.map((t, i) => {
              const cat = cBy(t.cat);
              return (
                <div key={i} style={{ display:'flex', gap: 12, padding: '12px 4px', borderBottom: i < M_TXNS.length-1 ? '1px dotted var(--rule)' : 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 3, background: cat ? 'var(--paper-deep)' : 'var(--moss-tint)', border:'1px solid var(--rule)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink: 0, color: cat ? cat.color : 'var(--moss-deep)' }}>
                    {t.kind === 'in' ? <Icon name="arrowup" size={16}/> : <span className="cat-swatch" style={{ background: cat ? cat.color : 'var(--ink-mute)', width: 6, height: 6 }}></span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color:'var(--ink)', fontSize: 13.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 11, fontStyle:'italic' }}>{cat ? cat.name : 'Receita'} · {t.t}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <Amount value={t.amt} size="xs" signed={t.kind==='in'}/>
                    <div className="muted mono" style={{ fontSize: 9.5, marginTop: 2, letterSpacing:'0.1em', textTransform:'uppercase' }}>{t.d}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button className="m-fab" aria-label="Adicionar despesa">+</button>
      <MTabbar active="painel"/>
    </div>
  );
};

// ---------- Mobile Add — Bottom Sheet variant (default) ----------
const MobileAddSheet = () => {
  return (
    <div className="m-page">
      {/* Dimmed dashboard underneath */}
      <div style={{ flex: 1, overflowY:'hidden', paddingBottom: 80, opacity: 0.5, pointerEvents:'none' }}>
        <div className="m-head">
          <div>
            <div className="m-greet">Terça · 14 Out</div>
            <div className="m-title">Bom dia, Francisco</div>
          </div>
          <span className="m-avatar">F</span>
        </div>
        <div className="m-section" style={{ marginTop: 6 }}>
          <div className="m-card is-feature" style={{ padding: '20px 22px' }}>
            <Eyebrow accent>Saldo do mês</Eyebrow>
            <Amount value={560.41} size="xl"/>
          </div>
        </div>
      </div>

      {/* Sheet */}
      <div className="m-sheet-scrim">
        <div className="m-sheet" style={{ paddingBottom: 24 }}>
          <div className="row between" style={{ paddingTop: 4 }}>
            <Eyebrow>Nova despesa</Eyebrow>
            <button style={{ background:'none', border:0, color:'var(--ink-mute)', cursor:'pointer' }}>
              <Icon name="close" size={16}/>
            </button>
          </div>

          {/* Mode chips */}
          <div style={{ display:'flex', gap: 6 }}>
            <Pill active dot="var(--gilt-soft)">Manual</Pill>
            <Pill>Recibo · 📷</Pill>
            <Pill>Dividir · 👥</Pill>
          </div>

          {/* Amount */}
          <div style={{ display:'flex', alignItems:'baseline', gap: 8, padding: '10px 0 4px', borderBottom: '1px solid var(--rule-strong)' }}>
            <span style={{ fontFamily:'var(--font-display)', fontStyle:'italic', fontSize: 28, color:'var(--ink-mute)' }}>€</span>
            <input className="field-input is-amount" defaultValue="84,32" style={{ flex: 1, border: 0, padding: 0, fontSize: 36 }}/>
          </div>

          {/* Description */}
          <div className="field">
            <span className="field-label">Descrição</span>
            <input className="field-input" defaultValue="Continente Colombo"/>
          </div>

          {/* Quick category chips */}
          <div className="field">
            <span className="field-label">Categoria</span>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 6 }}>
              {[
                { id:'mercearia', label:'Mercearia', c:'var(--cat-ochre)', sel:true },
                { id:'casa',      label:'Casa',      c:'var(--cat-forest)' },
                { id:'carro',     label:'Carro',     c:'var(--cat-clay)' },
                { id:'rest',      label:'Restaur.',  c:'var(--cat-bronze)' },
                { id:'saude',     label:'Saúde',     c:'var(--cat-sage)' },
                { id:'eventos',   label:'Saídas',    c:'var(--cat-plum)' },
                { id:'serv',      label:'Serviços',  c:'var(--cat-fog)' },
                { id:'mais',      label:'Mais…',     c:'var(--ink-mute)' },
              ].map((c) => (
                <button key={c.id} style={{
                  border: c.sel ? '1px solid var(--forest)' : '1px solid var(--rule)',
                  background: c.sel ? 'var(--forest)' : 'var(--paper)',
                  color: c.sel ? 'var(--paper)' : 'var(--ink-soft)',
                  padding: '8px 4px',
                  borderRadius: 3,
                  fontFamily:'var(--font-sans)',
                  fontSize: 11.5,
                  display:'flex', flexDirection:'column', alignItems:'center', gap: 5,
                  cursor:'pointer',
                }}>
                  <span className="cat-swatch" style={{ background: c.c, width: 8, height: 8 }}></span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Account row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            <div className="field">
              <span className="field-label">Data</span>
              <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 8, padding: '8px 10px' }}>
                <Icon name="calendar" size={13}/>
                <span style={{ fontSize: 13 }}>14 Out</span>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Conta</span>
              <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 8, padding: '8px 10px' }}>
                <span style={{ width: 14, height: 9, background:'var(--forest)', borderRadius: 1 }}></span>
                <span style={{ fontSize: 13, flex: 1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Millennium ··· 4218</span>
              </div>
            </div>
          </div>

          <Button kind="primary" size="lg" icon={<Icon name="check" size={14}/>}>Guardar despesa</Button>
        </div>
      </div>
    </div>
  );
};

// ---------- Mobile Add — Full-screen variant ----------
const MobileAddFullscreen = () => {
  return (
    <div className="m-page">
      {/* Status / nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: '14px 20px 6px' }}>
        <button style={{ background:'none', border:'1px solid var(--rule)', borderRadius: 3, width: 32, height: 32, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--ink-soft)' }}>
          <Icon name="close" size={14}/>
        </button>
        <Eyebrow>Nova despesa</Eyebrow>
        <button style={{ background:'none', border:0, fontSize: 11.5, color:'var(--gilt-deep)', fontStyle:'italic', cursor:'pointer' }}>guardar</button>
      </div>

      <div style={{ flex: 1, overflowY:'auto', padding: '8px 24px 90px', display:'flex', flexDirection:'column', gap: 22 }}>
        {/* Hero amount */}
        <div style={{ paddingTop: 8 }}>
          <Eyebrow accent>Quanto gastaste?</Eyebrow>
          <div style={{ display:'flex', alignItems:'baseline', gap: 8, marginTop: 14 }}>
            <span style={{ fontFamily:'var(--font-display)', fontStyle:'italic', fontSize: 36, color:'var(--ink-mute)' }}>€</span>
            <span className="amount amount-2xl" style={{ fontSize: 64, lineHeight: 1 }}>
              <span className="amount-int">84</span>
              <span className="amount-cents" style={{ fontSize: '0.55em', verticalAlign: '0.45em' }}>,32</span>
            </span>
          </div>
          <div style={{ display:'flex', gap: 6, marginTop: 14 }}>
            <Pill active>EUR</Pill>
            <Pill>USD</Pill>
            <Pill>GBP</Pill>
          </div>
        </div>

        <div className="gilt-rule with-dot"></div>

        {/* Description */}
        <div className="field">
          <span className="field-label">Em quê?</span>
          <input className="field-input" defaultValue="Continente Colombo" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, padding: '10px 0', border: 0, borderBottom: '1px solid var(--rule-strong)', borderRadius: 0 }}/>
          <div style={{ display:'flex', gap: 6, paddingTop: 6, flexWrap:'wrap' }}>
            {['Continente','Lidl','Pingo Doce','Auchan'].map((s) => (
              <span key={s} style={{ fontSize: 11, padding:'3px 9px', border:'1px solid var(--rule)', borderRadius:999, color:'var(--ink-mute)', background:'var(--paper-soft)' }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Category — visual grid */}
        <div className="field">
          <span className="field-label">Categoria</span>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label:'Mercearia', c:'var(--cat-ochre)', sel: true, ic:'cart' },
              { label:'Casa',      c:'var(--cat-forest)', ic:'home' },
              { label:'Carro',     c:'var(--cat-clay)', ic:'car' },
              { label:'Restaur.',  c:'var(--cat-bronze)', ic:'coffee' },
              { label:'Saúde',     c:'var(--cat-sage)', ic:'tag' },
              { label:'Saídas',    c:'var(--cat-plum)', ic:'bowling' },
              { label:'Serviços',  c:'var(--cat-fog)', ic:'sync' },
              { label:'Mais…',     c:'var(--ink-faint)', ic:'plus' },
            ].map((c) => (
              <button key={c.label} style={{
                border: c.sel ? '1px solid var(--forest)' : '1px solid var(--rule)',
                background: c.sel ? 'var(--forest)' : 'var(--paper)',
                color: c.sel ? 'var(--paper)' : 'var(--ink-soft)',
                padding: '12px 4px',
                borderRadius: 3,
                fontFamily:'var(--font-sans)',
                fontSize: 11.5,
                display:'flex', flexDirection:'column', alignItems:'center', gap: 6,
                cursor:'pointer',
                position:'relative',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: c.sel ? 'rgba(241,235,221,0.16)' : c.c+'20',
                  border: '1px solid', borderColor: c.sel ? 'var(--gilt-soft)' : c.c,
                  color: c.sel ? 'var(--gilt-soft)' : c.c,
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Icon name={c.ic} size={13}/>
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date · Account · Account picker rows */}
        <div className="field">
          <span className="field-label">Detalhes</span>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 3 }}>
            <div className="row between" style={{ padding:'12px 14px', borderBottom: '1px dotted var(--rule)' }}>
              <span className="row" style={{ gap: 10 }}><Icon name="calendar" size={14}/> Data</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize: 12, color:'var(--ink)' }}>14 OUT 2025</span>
            </div>
            <div className="row between" style={{ padding:'12px 14px', borderBottom: '1px dotted var(--rule)' }}>
              <span className="row" style={{ gap: 10 }}>
                <span style={{ width: 14, height: 9, background:'var(--forest)', borderRadius: 1 }}></span>
                Conta
              </span>
              <span style={{ fontSize: 13 }}>Millennium ··· 4218</span>
            </div>
            <div className="row between" style={{ padding:'12px 14px' }}>
              <span className="row" style={{ gap: 10 }}><Icon name="tag" size={14}/> Projeto</span>
              <span className="muted" style={{ fontStyle:'italic', fontSize: 12 }}>Adicionar →</span>
            </div>
          </div>
        </div>

        {/* Toggle row */}
        <div style={{ display:'flex', gap: 10 }}>
          <Pill>↻ Recorrente</Pill>
          <Pill>👥 Dividir</Pill>
          <Pill>📎 Anexar recibo</Pill>
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--rule)', background: 'var(--paper)' }}>
        <Button kind="primary" size="lg" icon={<Icon name="check" size={14}/>}>Guardar despesa</Button>
      </div>
    </div>
  );
};

Object.assign(window, { MobileDashboard, MobileAddSheet, MobileAddFullscreen });
