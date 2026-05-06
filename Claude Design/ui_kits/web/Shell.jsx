/* global React, Amigo */
const { useState: useStateS } = React;
const { Icon: IconS } = window.Amigo;

const NAV = [
  { group: null, items: [{ key: 'overview', label: 'Dashboard', icon: 'layout' }] },
  { group: 'Portfolio', items: [
    { key: 'portfolio', label: 'Holdings', icon: 'trending' },
    { key: 'exchanges', label: 'Exchanges', icon: 'link' },
  ]},
  { group: 'Finances', items: [
    { key: 'expenses', label: 'Expenses', icon: 'list' },
    { key: 'incomes', label: 'Incomes', icon: 'dollar' },
    { key: 'recurring', label: 'Recurring', icon: 'repeat' },
  ]},
  { group: 'Tools', items: [
    { key: 'import', label: 'Import', icon: 'upload' },
    { key: 'categories', label: 'Categories', icon: 'tag' },
    { key: 'accounts', label: 'Bank accounts', icon: 'card' },
    { key: 'projects', label: 'Projects', icon: 'folder' },
  ]},
  { group: null, items: [{ key: 'settings', label: 'Settings', icon: 'settings' }] },
];

function Sidebar({ active, onNavigate }) {
  return (
    <aside style={{
      width: 256, background: '#fff', borderRight: '1px solid var(--border-1)',
      padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2,
      flex: 'none', height: '100%', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 14px' }}>
        <img src="../../assets/icon-192.png" width="32" height="32" style={{ borderRadius: 8 }} alt=""/>
        <b style={{ font: '700 18px/1 var(--font-sans)', letterSpacing: '-0.01em', color: 'var(--fg-1)' }}>Amigo</b>
        <button style={{
          marginLeft: 'auto', width: 24, height: 24, border: 'none', background: 'transparent',
          color: 'var(--fg-3)', cursor: 'pointer', borderRadius: 6,
        }}><IconS name="chevron" size={14} /></button>
      </div>
      {/* Workspace switcher */}
      <button style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', margin: '0 0 10px',
        border: '1px solid var(--border-1)', borderRadius: 10, background: '#fff',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: 'var(--amigo-blue)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
        }}>P</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '600 12.5px/1.2 var(--font-sans)', color: 'var(--fg-1)' }}>Personal</div>
          <div style={{ font: '400 10.5px/1.2 var(--font-sans)', color: 'var(--fg-4)' }}>Owner</div>
        </div>
        <IconS name="chevron" size={14} />
      </button>

      {NAV.map((section, si) => (
        <React.Fragment key={si}>
          {section.group && (
            <div style={{
              font: '500 10.5px/1 var(--font-sans)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-4)',
              padding: '12px 10px 6px',
            }}>{section.group}</div>
          )}
          {section.items.map(item => (
            <NavItem key={item.key} item={item} active={active === item.key}
              onClick={() => onNavigate(item.key)} />
          ))}
        </React.Fragment>
      ))}

      <div style={{ flex: 1 }} />
      {/* user */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: '1px solid var(--border-1)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9999, background: 'var(--slate-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          font: '600 12px/1 var(--font-sans)', color: 'var(--fg-2)',
        }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '600 12.5px/1.2 var(--font-sans)', color: 'var(--fg-1)' }}>Miguel</div>
          <div style={{ font: '400 10.5px/1.2 var(--font-sans)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>m@slendyzo.pt</div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, active, onClick }) {
  const [hover, setHover] = useStateS(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        font: '500 13.5px/1 var(--font-sans)',
        color: active ? '#fff' : 'var(--fg-2)',
        background: active ? 'var(--amigo-blue)' : (hover ? 'var(--slate-100)' : 'transparent'),
        cursor: 'pointer',
        transition: 'background 120ms var(--ease-out)',
      }}>
      <IconS name={item.icon} size={17} stroke={active ? 1.7 : 1.6} />
      <span>{item.label}</span>
    </div>
  );
}

function TopBar({ title }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 28px', height: 64, borderBottom: '1px solid var(--border-1)',
      background: '#fff', flex: 'none',
    }}>
      <h1 style={{ font: '600 18px/1 var(--font-sans)', color: 'var(--fg-1)', margin: 0, flex: 1 }}>{title}</h1>
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        background: 'var(--slate-100)', borderRadius: 10, padding: '0 12px',
        height: 36, gap: 8, width: 280,
      }}>
        <IconS name="search" size={15} style={{ color: 'var(--fg-4)' }} />
        <input placeholder="Search expenses, projects…" style={{
          flex: 1, border: 'none', background: 'transparent', outline: 'none',
          font: '400 13px/1 var(--font-sans)', color: 'var(--fg-1)',
        }}/>
      </div>
      <button style={{
        width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border-1)',
        background: '#fff', color: 'var(--fg-2)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative', cursor: 'pointer',
      }}>
        <IconS name="bell" size={16} />
        <span style={{
          position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 9999,
          background: 'var(--loss-fg)', border: '1.5px solid #fff',
        }}/>
      </button>
    </header>
  );
}

function Shell({ children, active, onNavigate, title, fab }) {
  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100%', background: 'var(--bg-page)',
      fontFamily: 'var(--font-sans)', color: 'var(--fg-2)',
    }}>
      <Sidebar active={active} onNavigate={onNavigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <TopBar title={title} />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px 80px' }}>
          {children}
        </main>
        {fab && (
          <button style={{
            position: 'absolute', bottom: 28, right: 28,
            width: 56, height: 56, borderRadius: 9999, border: 'none',
            background: 'var(--amigo-blue)', color: '#fff', cursor: 'pointer',
            boxShadow: '0 12px 24px -8px rgb(0 112 243 / .35), 0 4px 8px rgb(0 0 0 / .08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={fab}><IconS name="plus" size={24} stroke={2.2} /></button>
        )}
      </div>
    </div>
  );
}

window.Amigo = window.Amigo || {};
Object.assign(window.Amigo, { Shell });
