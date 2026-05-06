// add-expense-modal.jsx — desktop modal redesign.
// Three intake modes selectable up top: Manual · Importar Recibo · Dividir.
// The body switches accordingly. Open by default = manual.

const ModeTab = ({ active, onClick, label, sub, icon }) => (
  <button
    onClick={onClick}
    className={`mode-tab ${active ? 'is-active' : ''}`}
  >
    <span className="mode-tab-icon"><Icon name={icon} size={18}/></span>
    <span className="mode-tab-text">
      <span className="mode-tab-label">{label}</span>
      <span className="mode-tab-sub">{sub}</span>
    </span>
  </button>
);

const AddExpenseModal = ({ initialMode = 'manual' }) => {
  const [mode, setMode] = React.useState(initialMode);

  return (
    <div className="modal-scrim" style={{ position: 'absolute' }}>
      <div className="modal" style={{ width: 620 }}>
        <header className="modal-head" style={{ paddingBottom: 0, borderBottom: 0 }}>
          <div>
            <Eyebrow>Novo lançamento</Eyebrow>
            <h2 className="modal-title">Adicionar despesa</h2>
          </div>
          <button className="modal-close" aria-label="Fechar"><Icon name="close" size={14}/></button>
        </header>

        {/* Mode selector */}
        <div style={{ padding: '14px 26px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <ModeTab active={mode==='manual'} onClick={() => setMode('manual')} icon="edit" label="Manual" sub="Uma despesa, do zero"/>
          <ModeTab active={mode==='receipt'} onClick={() => setMode('receipt')} icon="camera" label="Recibo" sub="Foto ou PDF · IA lê os campos"/>
          <ModeTab active={mode==='split'} onClick={() => setMode('split')} icon="user" label="Dividir" sub="Entre amigos ou família"/>
        </div>

        <div className="modal-body" style={{ paddingTop: 22 }}>
          {mode === 'manual' && <ManualBody/>}
          {mode === 'receipt' && <ReceiptBody/>}
          {mode === 'split' && <SplitBody/>}
        </div>

        <footer className="modal-foot">
          <span className="muted" style={{ fontSize: 12, fontStyle:'italic' }}>
            Atalho · <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.06em' }}>⌘ + ENTER</span> para guardar
          </span>
          <div style={{ display:'flex', gap: 10 }}>
            <Button kind="ghost" size="md">Cancelar</Button>
            <Button kind="primary" size="md" icon={<Icon name="check" size={14}/>}>Guardar despesa</Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const ManualBody = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
    {/* Hero amount */}
    <div style={{ display:'flex', alignItems:'flex-end', gap: 12, paddingBottom: 4 }}>
      <span style={{ fontFamily:'var(--font-display)', fontStyle:'italic', fontSize: 28, color: 'var(--ink-mute)' }}>€</span>
      <input className="field-input is-amount" defaultValue="84,32" style={{ flex: 1 }}/>
      <div style={{ display:'flex', gap: 4, marginBottom: 8 }}>
        <Pill>EUR</Pill>
        <Pill>USD</Pill>
        <Pill>GBP</Pill>
      </div>
    </div>

    <div className="field">
      <span className="field-label">Descrição</span>
      <input className="field-input" defaultValue="Continente Colombo"/>
    </div>

    <div className="field-row cols-2">
      <div className="field">
        <span className="field-label">Categoria</span>
        <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 10, cursor:'pointer' }}>
          <span className="cat-swatch" style={{ background:'var(--cat-ochre)' }}></span>
          <span style={{ flex: 1 }}>Mercearia</span>
          <span className="muted">▾</span>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Data</span>
        <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <Icon name="calendar" size={14}/>
          <span style={{ flex: 1 }}>14 de Outubro · 2025</span>
        </div>
      </div>
    </div>

    <div className="field-row cols-2">
      <div className="field">
        <span className="field-label">Conta</span>
        <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <span style={{ width: 18, height: 12, background: 'var(--forest)', borderRadius: 2 }}></span>
          <span style={{ flex: 1 }}>Millennium · Débito ··· 4218</span>
          <span className="muted">▾</span>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Projeto · opcional</span>
        <div className="field-input" style={{ display:'flex', alignItems:'center', gap: 10, color: 'var(--ink-faint)', fontStyle:'italic' }}>
          <span style={{ flex: 1 }}>Sem projeto</span>
          <span className="muted">▾</span>
        </div>
      </div>
    </div>

    <div className="field">
      <span className="field-label">Notas</span>
      <textarea className="field-textarea" rows="2" placeholder="Compras da semana, vinho para o jantar de domingo." style={{ resize:'none' }}></textarea>
    </div>

    <div style={{ display:'flex', gap: 16, paddingTop: 4, borderTop: '1px dotted var(--rule)', paddingTop: 14 }}>
      <label className="row" style={{ gap: 8, fontSize: 13, cursor:'pointer' }}>
        <input type="checkbox" style={{ accentColor: 'var(--forest)' }}/>
        Marcar como recorrente
      </label>
      <label className="row" style={{ gap: 8, fontSize: 13, cursor:'pointer' }}>
        <input type="checkbox" style={{ accentColor: 'var(--forest)' }}/>
        Reembolsável
      </label>
      <label className="row" style={{ gap: 8, fontSize: 13, cursor:'pointer' }}>
        <input type="checkbox" defaultChecked style={{ accentColor: 'var(--forest)' }}/>
        Já liquidada
      </label>
    </div>
  </div>
);

const ReceiptBody = () => (
  <div style={{ display:'flex', flexDirection:'column', gap: 18 }}>
    <div style={{
      border: '1px dashed var(--rule-strong)',
      borderRadius: 4,
      padding: '36px 24px',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      gap: 10,
      background: 'var(--paper-soft)',
    }}>
      <div style={{ width: 52, height: 52, border: '1px solid var(--gilt)', borderRadius: '50%', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--gilt-deep)' }}>
        <Icon name="upload" size={20}/>
      </div>
      <div style={{ fontFamily:'var(--font-display)', fontSize: 18 }}>Arrasta o recibo para aqui</div>
      <div className="muted" style={{ fontSize: 12 }}>JPG, PNG ou PDF · até 8 MB. Ou <a href="#" style={{ color: 'var(--gilt-deep)' }}>escolhe um ficheiro</a>.</div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr', gap: 18, padding: '14px 16px', background:'var(--paper-soft)', borderRadius: 4, border: '1px solid var(--rule)' }}>
      <div style={{ aspectRatio: '3/4', background:'var(--paper-deep)', borderRadius: 3, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-faint)', fontFamily:'var(--font-mono)', fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', border: '1px solid var(--rule)' }}>
        IMG_4218.jpg
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
        <Eyebrow accent>Lido pela IA</Eyebrow>
        <div className="row between" style={{ paddingBottom: 8, borderBottom: '1px dotted var(--rule)' }}>
          <span className="muted" style={{ fontSize: 12 }}>Estabelecimento</span>
          <span style={{ fontWeight: 500 }}>Continente Colombo</span>
        </div>
        <div className="row between" style={{ paddingBottom: 8, borderBottom: '1px dotted var(--rule)' }}>
          <span className="muted" style={{ fontSize: 12 }}>Data</span>
          <span className="mono" style={{ fontSize: 12 }}>14 OUT 2025 · 18:42</span>
        </div>
        <div className="row between" style={{ paddingBottom: 8, borderBottom: '1px dotted var(--rule)' }}>
          <span className="muted" style={{ fontSize: 12 }}>Categoria sugerida</span>
          <span className="cat-chip"><span className="cat-swatch" style={{ background:'var(--cat-ochre)' }}></span>Mercearia</span>
        </div>
        <div className="row between">
          <span className="muted" style={{ fontSize: 12 }}>Total</span>
          <Amount value={-84.32} size="sm"/>
        </div>
      </div>
    </div>
  </div>
);

const SplitBody = () => {
  const total = 124.80;
  const people = [
    { id:'me', name:'Eu', share: 41.60, paid: true },
    { id:'an', name:'Ana', share: 41.60, paid: false },
    { id:'jo', name:'João', share: 41.60, paid: false },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 18 }}>
      <div className="field-row cols-2">
        <div className="field">
          <span className="field-label">Total</span>
          <div className="field-input" style={{ fontFamily:'var(--font-display)', fontSize: 22, fontWeight: 400, padding: '8px 12px' }}>
            <span className="muted" style={{ fontSize: 16, marginRight: 4 }}>€</span>124,80
          </div>
        </div>
        <div className="field">
          <span className="field-label">Descrição</span>
          <input className="field-input" defaultValue="Jantar · Tasca do Chico"/>
        </div>
      </div>

      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <Eyebrow>Dividido entre 3 pessoas</Eyebrow>
          <div style={{ display:'flex', gap: 4 }}>
            <Pill active>Igualmente</Pill>
            <Pill>Por valor</Pill>
            <Pill>Por percentagem</Pill>
          </div>
        </div>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
          {people.map((p, i) => (
            <div key={p.id} style={{
              display:'grid',
              gridTemplateColumns:'auto 1fr auto auto',
              alignItems:'center',
              gap: 14,
              padding: '14px 16px',
              borderTop: i ? '1px dotted var(--rule)' : 0,
              background: p.id==='me' ? 'var(--paper-soft)' : 'var(--paper)',
            }}>
              <span style={{ width: 32, height: 32, borderRadius:'50%', background:'var(--forest)', color:'var(--paper)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontStyle:'italic', fontSize: 14 }}>{p.name[0]}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{p.name} {p.id==='me' && <span className="muted" style={{ fontStyle:'italic', fontWeight: 400, fontSize: 12 }}>· tu</span>}</div>
                <div className="muted" style={{ fontSize: 11.5, fontStyle:'italic' }}>{p.paid ? 'pagou a conta' : 'deve a Eu'}</div>
              </div>
              <div className="mono" style={{ fontSize: 11, color:'var(--ink-mute)' }}>33,33%</div>
              <Amount value={p.share} size="sm"/>
            </div>
          ))}
        </div>
        <div className="row between" style={{ paddingTop: 12 }}>
          <Button kind="ghost" size="sm" icon={<Icon name="plus" size={12}/>}>Adicionar pessoa</Button>
          <span className="muted" style={{ fontSize: 12, fontStyle:'italic' }}>A tua quota: <strong style={{ color: 'var(--ink)' }}>€41,60</strong></span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { AddExpenseModal });
