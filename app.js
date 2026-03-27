// ── CONFIG ──
const DEFAULT_CONFIG_VERBAS = [
  { id:'he50',   cod:'150', desc:'HORAS EXTRAS - 50%',      tipo:'venc', refLabel:'horas', formulaVenc:'ref * salHora * 1.5', formulaDesc:'', compoeHE:true, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'he100',  cod:'200', desc:'HORAS EXTRAS 100%',       tipo:'venc', refLabel:'horas', formulaVenc:'ref * salHora * 2',   formulaDesc:'', compoeHE:true, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'dsrhe', cod:'9999', desc:'DSR SOBRE HORAS EXTRAS', tipo:'venc', refLabel:'auto', formulaVenc:'', formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'adicfunc',cod:'348',desc:'ADICIONAL DE FUNÇÃO',     tipo:'venc', refLabel:'%',     formulaVenc:'sal * ref / 100',     formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'premiotempo',cod:'576',desc:'PRÊMIO TEMPO SERVIÇO', tipo:'venc', refLabel:'%',     formulaVenc:'sal * ref / 100',     formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'ajudacusto',cod:'583',desc:'AJUDA DE CUSTO',        tipo:'venc', refLabel:'valor', formulaVenc:'ref',                 formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'adiant',  cod:'231', desc:'DESC. ADIANT. SALARIAL', tipo:'desc', refLabel:'valor', formulaVenc:'',                   formulaDesc:'ref', compoeHE:false, compoeIRRF:false, compoeINSS:false, compoeFGTS:false },
  { id:'pernoite',cod:'256', desc:'PERNOITE',               tipo:'venc', refLabel:'qtd',   formulaVenc:'ref',                 formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'gratviagem',cod:'588',desc:'GRATIFICAÇÃO VIAGEM',   tipo:'venc', refLabel:'valor', formulaVenc:'ref',                 formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
  { id:'almoco',  cod:'448', desc:'ALMOÇO MOTORISTA',       tipo:'venc', refLabel:'valor', formulaVenc:'ref',                 formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true },
];
const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
const LOGIN_REMEMBER_KEY = 'login_remember';
const LOGIN_REMEMBER_EMAIL_KEY = 'login_remember_email';
const LOGIN_REMEMBER_SENHA_KEY = 'login_remember_senha';

function safeParseJSON(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function normalizeConfigVerba(v) {
  return {
    ...v,
    compoeHE: !!v.compoeHE,
    compoeIRRF: typeof v.compoeIRRF === 'boolean' ? v.compoeIRRF : v.tipo !== 'desc',
    compoeINSS: typeof v.compoeINSS === 'boolean' ? v.compoeINSS : v.tipo !== 'desc',
    compoeFGTS: typeof v.compoeFGTS === 'boolean' ? v.compoeFGTS : v.tipo !== 'desc',
  };
}

let configVerbas = safeParseJSON(localStorage.getItem('cfg_verbas'), null);
if (!Array.isArray(configVerbas) || !configVerbas.length) {
  configVerbas = DEFAULT_CONFIG_VERBAS.map(v => normalizeConfigVerba({ ...v }));
} else {
  configVerbas = configVerbas.map(v => normalizeConfigVerba(v));
}

let configParams = safeParseJSON(localStorage.getItem('cfg_params'), null);
if (!configParams || typeof configParams !== 'object') {
  configParams = { horasMes:220, he50Mult:1.5, he100Mult:2.0, fgtsAliq:8 };
}

// ── STATE ──
let verbas = [];
let encs = { inss: false, fgts: false, irrf: false };
let hist = JSON.parse(localStorage.getItem('rec_hist_v2') || '[]');
let editId = null;
let currentUser = null;
let empresasList = [];
let grupoId = null;
let empresaEditando = null;
let verbasPadraoTemp = [];

// ── AUTH ──
async function fazerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const lembrarSenha = document.getElementById('login-remember')?.checked;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  if (!email || !senha) { errEl.textContent = 'Preencha email e senha.'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Erro ao entrar');
    currentUser = data.user;
    localStorage.setItem('sb_token', data.access_token);
    localStorage.setItem('sb_user', JSON.stringify(data.user));
    if (lembrarSenha) {
      localStorage.setItem(LOGIN_REMEMBER_KEY, '1');
      localStorage.setItem(LOGIN_REMEMBER_EMAIL_KEY, email);
      localStorage.setItem(LOGIN_REMEMBER_SENHA_KEY, senha);
    } else {
      localStorage.removeItem(LOGIN_REMEMBER_KEY);
      localStorage.removeItem(LOGIN_REMEMBER_EMAIL_KEY);
      localStorage.removeItem(LOGIN_REMEMBER_SENHA_KEY);
    }
    await initApp();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function carregarLoginLembrado() {
  const lembrar = localStorage.getItem(LOGIN_REMEMBER_KEY) === '1';
  const email = localStorage.getItem(LOGIN_REMEMBER_EMAIL_KEY) || '';
  const senha = localStorage.getItem(LOGIN_REMEMBER_SENHA_KEY) || '';
  const emailEl = document.getElementById('login-email');
  const senhaEl = document.getElementById('login-senha');
  const lembrarEl = document.getElementById('login-remember');

  if (emailEl) emailEl.value = email;
  if (senhaEl) senhaEl.value = lembrar ? senha : '';
  if (lembrarEl) lembrarEl.checked = lembrar;
}

async function fazerLogout() {
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_user');
  currentUser = null;
  document.getElementById('pg-login').style.display = 'flex';
  document.getElementById('pg-main').style.display = 'none';
  document.getElementById('user-badge').style.display = 'none';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('btn-empresas').style.display = 'none';
}

async function initApp() {
  document.getElementById('pg-login').style.display = 'none';
  document.getElementById('pg-main').style.display = 'block';
  document.getElementById('user-badge').style.display = 'flex';
  document.getElementById('user-email-badge').textContent = currentUser.email;
  document.getElementById('btn-logout').style.display = 'block';
  document.getElementById('btn-empresas').style.display = 'block';

  // verifica se é admin
  currentUser.isAdmin = currentUser.email === 'gustavo@jaguarcontabilidade.com.br';

  const btnAdmin = document.getElementById('btn-admin');

  if (currentUser.isAdmin) {
    document.getElementById('user-email-badge').textContent = currentUser.email + ' 👑';
    if (btnAdmin) btnAdmin.style.display = 'block';
  } else {
    if (btnAdmin) btnAdmin.style.display = 'none';
  }

  // 🔥 ESSENCIAL PRA FUNCIONAR TUDO
  await carregarEmpresas();
  renderQuickAddButtons();
  addVerbaDiasNormais();
  calc();
}
// ── EMPRESAS ──
async function carregarEmpresas() {
  try {
    if (currentUser.isAdmin) {
      // admin carrega todas as empresas de todos os grupos
      const todosGrupos = await sbFetch('grupos?select=*&order=nome.asc') || [];
      empresasList = [];
      for (const g of todosGrupos) {
        const emps = await sbFetch('empresas?grupo_id=eq.' + g.id + '&order=nome.asc') || [];
        emps.forEach(e => e._grupoEmail = g.nome);
        empresasList = empresasList.concat(emps);
      }
      grupoId = todosGrupos[0]?.id || null;
    } else {
      // usuário normal — busca ou cria seu grupo
      let grupos = await sbFetch('grupos?user_id=eq.' + currentUser.id);
      if (!grupos || grupos.length === 0) {
        const novoGrupo = await sbFetch('grupos', {
          method: 'POST',
          prefer: 'return=representation',
          body: JSON.stringify({ nome: currentUser.email, user_id: currentUser.id })
        });
        grupoId = novoGrupo[0].id;
      } else {
        grupoId = grupos[0].id;
      }
      empresasList = await sbFetch('empresas?grupo_id=eq.' + grupoId + '&order=nome.asc') || [];
    }
    renderEmpresasSelect();
  } catch(e) {
    console.error('Erro ao carregar empresas:', e);
    empresasList = [];
  }
}

function renderEmpresasSelect() {
  const sel = document.getElementById('f-emp-select');
  sel.innerHTML = '<option value="">— Selecione ou preencha abaixo —</option>';
  empresasList.forEach(e => {
    const label = currentUser.isAdmin
      ? `${e.nome}${e.cnpj?' — '+e.cnpj:''} (${e._grupoEmail||''})`
      : `${e.nome}${e.cnpj?' — '+e.cnpj:''}`;
    sel.innerHTML += `<option value="${e.id}" data-nome="${e.nome}" data-cnpj="${e.cnpj||''}">${label}</option>`;
  });
}

function selecionarEmpresa(id) {
  if (!id) return;

  const emp = empresasList.find(e => e.id == id);
  if (!emp) return;

  document.getElementById('f-emp').value = emp.nome || '';
  document.getElementById('f-cnpj').value = emp.cnpj || '';
  document.getElementById('f-cidade').value = emp.cidade || '';
  verbas = [];

  if (emp.verbas_padrao && emp.verbas_padrao.length) {
    emp.verbas_padrao.forEach(v => {
      const cfg = configVerbas.find(c => c.id === v.autoType);
      verbas.push({
        id: Date.now() + Math.random(),
        cod: v.cod,
        desc: v.desc,
        ref: '',
        venc: 0,
        desc2: 0,
        incideIRRF: typeof v.incideIRRF === 'boolean'
          ? v.incideIRRF
          : (cfg && typeof cfg.compoeIRRF === 'boolean' ? cfg.compoeIRRF : v.tipo !== 'desc'),
        incideINSS: typeof v.incideINSS === 'boolean'
          ? v.incideINSS
          : (cfg && typeof cfg.compoeINSS === 'boolean' ? cfg.compoeINSS : v.tipo !== 'desc'),
        incideFGTS: typeof v.incideFGTS === 'boolean'
          ? v.incideFGTS
          : (cfg && typeof cfg.compoeFGTS === 'boolean' ? cfg.compoeFGTS : v.tipo !== 'desc'),
        auto: !!v.autoType,
        autoType: v.autoType,
        tipo: v.tipo
      });
    });
  } 
  
 // DIAS NORMAIS (fixo)
if (!verbas.find(v => v.autoType === 'diasnormais')) {
  addVerbaDiasNormais();
}

// 🔥 DSR FIXO
if (!verbas.find(v => v.autoType === 'dsrhe')) {
  verbas.push({
    id: Date.now() + Math.random(),
    cod: '9999',
    desc: 'DSR SOBRE HORAS EXTRAS',
    ref: '',
    venc: 0,
    desc2: 0,
    incideIRRF: true,
    incideINSS: true,
    incideFGTS: true,
    auto: true,
    autoType: 'dsrhe',
    tipo: 'venc'
  });
}
  calc();
}

async function showEmpresas() {
  document.getElementById('pg-main').style.display = 'none';
  document.getElementById('pg-hist').style.display = 'none';
  document.getElementById('pg-config').style.display = 'none';
  document.getElementById('pg-empresas').style.display = 'block';
  renderEmpresasList();
}

function editarEmpresa(id) {
  const emp = empresasList.find(e => e.id == id);
  if (!emp) return;

  document.getElementById('add-empresa-form').style.display = 'block';
  document.getElementById('emp-verbas-config').style.display = 'none';

  document.getElementById('new-emp-nome').value = emp.nome || '';
  document.getElementById('new-emp-cnpj').value = emp.cnpj || '';
  document.getElementById('new-emp-cidade').value = emp.cidade || '';

  empresaEditando = emp;
}
  
function renderEmpresasList() {
  const list = document.getElementById('empresas-list');

  if (!empresasList.length) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--ink3)">Nenhuma empresa cadastrada.</div>';
    return;
  }

  list.innerHTML = empresasList.map(e => `
    <div class="emp-card">

      <div class="emp-card-info">
        <div class="emp-card-nome">${e.nome}</div>
        <div class="emp-card-cnpj">
          ${e.cnpj ? 'CNPJ: '+e.cnpj : ''}${e.cidade ? ' · '+e.cidade : ''}
          ${currentUser.isAdmin && e._grupoEmail ? ' <span style="color:var(--accent);font-size:.7rem">👤 '+e._grupoEmail+'</span>' : ''}
        </div>
      </div>

      <div style="display:flex;gap:.4rem;">
        <button class="hcbtn" onclick="configVerbasEmpresa('${e.id}')">⚙ Verbas</button>

        <button class="hcbtn" onclick="editarEmpresa('${e.id}')">✏ Editar</button>

        <button class="hcbtn d" onclick="deletarEmpresa('${e.id}')">🗑 Excluir</button>
      </div>

    </div>
  `).join('');
}

function showAddEmpresa() {
  document.getElementById('add-empresa-form').style.display = 'block';
  document.getElementById('emp-verbas-config').style.display = 'none';

  document.getElementById('new-emp-nome').value = '';
  document.getElementById('new-emp-cnpj').value = '';
  document.getElementById('new-emp-cidade').value = '';

  empresaEditando = null;

  document.getElementById('new-emp-nome').focus();
}

function formatCNPJ(v) {
  v = v.replace(/\D/g, '');

  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');

  return v.substring(0, 18);
}

async function salvarEmpresa() {
  const nome = document.getElementById('new-emp-nome').value.trim();
  const cnpj = document.getElementById('new-emp-cnpj').value.trim();
  const cidade = document.getElementById('new-emp-cidade').value.trim();

  if (!nome) { toast('Informe o nome da empresa!', 'err'); return; }

  try {
    if (empresaEditando) {
      // ✏️ EDITAR
      await sbFetch('empresas?id=eq.' + empresaEditando.id, {
        method: 'PATCH',
        body: JSON.stringify({ nome, cnpj, cidade })
      });

      empresaEditando.nome = nome;
      empresaEditando.cnpj = cnpj;
      empresaEditando.cidade = cidade;

      toast('Empresa atualizada!');
    } else {
      // ➕ NOVA
      const nova = await sbFetch('empresas', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          grupo_id: grupoId,
          nome, cnpj, cidade,
          verbas_padrao: [{ cod:'8781', desc:'DIAS NORMAIS', autoType:'diasnormais', tipo:'venc', incideIRRF:true, incideINSS:true, incideFGTS:true }]
        })
      });

      empresasList.push(nova[0]);
      toast('Empresa cadastrada!');
    }

    empresasList.sort((a,b)=>a.nome.localeCompare(b.nome));
    renderEmpresasList();
    renderEmpresasSelect();

    document.getElementById('add-empresa-form').style.display = 'none';
    empresaEditando = null;

  } catch(e) {
    toast('Erro ao salvar!', 'err');
  }
}

async function deletarEmpresa(id) {
  if (!confirm('Tem certeza que quer excluir?')) return;
  try {
    await sbFetch('empresas?id=eq.' + id, { method: 'DELETE' });
    empresasList = empresasList.filter(e => e.id !== id);
    renderEmpresasList();
    renderEmpresasSelect();
    toast('Empresa removida!');
  } catch(e) {
    toast('Erro ao remover!', 'err');
  }
}

window.configVerbasEmpresa = function(id) {
  console.log('CLICOU VERBAS', id);

  const emp = empresasList.find(e => e.id == id);
  if (!emp) return;

  empresaEditando = emp;

  verbasPadraoTemp = emp.verbas_padrao
    ? JSON.parse(JSON.stringify(emp.verbas_padrao))
    : [];

  renderVerbasPadrao();

  document.getElementById('add-empresa-form').style.display = 'none';

  document.getElementById('emp-verbas-config').style.display = 'block';
};


 function renderVerbasPadrao() {
  const el = document.getElementById('emp-verbas-list');

  if (!verbasPadraoTemp.length) {
    el.innerHTML = '<div style="color:#999">Nenhuma verba definida</div>';
    return;
  }

  el.innerHTML = verbasPadraoTemp.map((v,i) => `
    <div style="
      display:grid;
      grid-template-columns:70px 1fr 90px 80px 30px;
      gap:.5rem;
      margin-bottom:.4rem;
      align-items:center;
    ">
      <input class="field-input" value="${v.cod}" placeholder="Cód" oninput="updVP(${i},'cod',this.value)">
      <input class="field-input" value="${v.desc}" placeholder="Descrição" oninput="updVP(${i},'desc',this.value)">
      
      <select class="field-input" onchange="updVP(${i},'tipo',this.value)">
        <option value="venc" ${v.tipo==='venc'?'selected':''}>Venc</option>
        <option value="desc" ${v.tipo==='desc'?'selected':''}>Desc</option>
      </select>
      <label style="font-size:.72rem;display:flex;align-items:center;gap:.25rem;justify-content:center">
        <input type="checkbox" ${typeof v.incideIRRF === 'boolean' ? (v.incideIRRF ? 'checked' : '') : (v.tipo !== 'desc' ? 'checked' : '')}
          onchange="updVP(${i},'incideIRRF',this.checked)">
        IRRF
      </label>

      <button class="btn-rm" onclick="delVP(${i})">×</button>
    </div>
  `).join('');
}

  function updVP(i, field, val) {
  verbasPadraoTemp[i][field] = val;
}

function delVP(i) {
  verbasPadraoTemp.splice(i,1);
  renderVerbasPadrao();
}

function addVerbaPadrao() {
  if (!configVerbas.length) {
    alert('Cadastre verbas na aba Fórmulas primeiro!');
    return;
  }

  // cria lista para escolher
  const lista = configVerbas.map((v,i) => `${i} - ${v.desc}`).join('\n');

  const escolha = prompt('Escolha a verba pelo número:\n\n' + lista);

  if (escolha === null) return;

  const idx = parseInt(escolha);
  const cfg = configVerbas[idx];

  if (!cfg) {
    alert('Opção inválida');
    return;
  }

  verbasPadraoTemp.push({
    cod: cfg.cod,
    desc: cfg.desc,
    tipo: cfg.tipo,
    autoType: cfg.id,
    incideIRRF: typeof cfg.compoeIRRF === 'boolean' ? cfg.compoeIRRF : cfg.tipo !== 'desc',
    incideINSS: typeof cfg.compoeINSS === 'boolean' ? cfg.compoeINSS : cfg.tipo !== 'desc',
    incideFGTS: typeof cfg.compoeFGTS === 'boolean' ? cfg.compoeFGTS : cfg.tipo !== 'desc'
  });

  renderVerbasPadrao();
}

  async function salvarVerbasPadrao() {
  if (!empresaEditando) return;

  try {
    await sbFetch('empresas?id=eq.' + empresaEditando.id, {
      method: 'PATCH',
      body: JSON.stringify({
        verbas_padrao: verbasPadraoTemp
      })
    });

    empresaEditando.verbas_padrao = verbasPadraoTemp;

    fecharConfigVerbas();
    toast('Verbas padrão salvas!');
  } catch(e) {
    toast('Erro ao salvar!', 'err');
  }
}

  function fecharConfigVerbas() {
  document.getElementById('emp-verbas-config').style.display = 'none';
  empresaEditando = null;
}

// ── INIT ──
window.onload = async () => {
  carregarLoginLembrado();

  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('f-comp').value = `${y}-${m}`;
  const dias = new Date(y, now.getMonth()+1, 0).getDate();
  document.getElementById('f-diasmes').value = dias;
  document.getElementById('f-dias').value = dias;
  document.getElementById('f-diasuteis').value = Math.max(dias - 6, 0);
  document.getElementById('f-diasdsr').value = Math.min(6, dias);

  // verifica se já tem sessão salva
  const token = localStorage.getItem('sb_token');
  const user  = localStorage.getItem('sb_user');
  if (token && user) {
    currentUser = JSON.parse(user);
    await initApp();
  }
  // se não tem sessão, mostra login (já visível por padrão)
};

function renderQuickAddButtons() {
  const container = document.querySelector('.hcbtns-quick');
  if(!container) return;
  // botões fixos sempre presentes
  let html = `<button class="hcbtn" onclick="quickAdd('he50')">HE 50%</button>
    <button class="hcbtn" onclick="quickAdd('he100')">HE 100%</button>`;
  // verbas configuradas
  configVerbas
    .filter(v => v.id !== 'he50' && v.id !== 'he100')
    .forEach(v => {
    html += `<button class="hcbtn" onclick="quickAddConfig('${v.id}')">${v.desc.length>15?v.cod+' '+v.desc.slice(0,12)+'…':v.desc}</button>`;
  });
  container.innerHTML = html;
}

function ensureFixedVerbas() {
  const dedupeByAutoType = (autoType) => {
    const itens = verbas.filter(v => v.autoType === autoType);
    if (itens.length <= 1) return;
    let first = true;
    verbas = verbas.filter(v => {
      if (v.autoType !== autoType) return true;
      if (first) { first = false; return true; }
      return false;
    });
  };

  dedupeByAutoType('diasnormais');
  dedupeByAutoType('dsrhe');

  if (!verbas.find(v => v.autoType === 'diasnormais')) {
    addVerbaDiasNormais();
  }

  if (!verbas.find(v => v.autoType === 'dsrhe')) {
    verbas.push({
      id: Date.now() + Math.random(),
      cod: '9999',
      desc: 'DSR SOBRE HORAS EXTRAS',
      ref: '',
      venc: 0,
      desc2: 0,
      incideIRRF: true,
      incideINSS: true,
      incideFGTS: true,
      auto: true,
      autoType: 'dsrhe',
      tipo: 'venc'
    });
  }
}
  
// ── TOGGLE ENCS ──
function toggleEnc(key) {
  encs[key] = !encs[key];
  document.getElementById('tc-'+key).classList.toggle('open', encs[key]);
  const badge = document.getElementById('badge-'+key);
  badge.textContent = encs[key] ? 'Ativado' : 'Desativado';
  badge.className = 'toggle-badge ' + (encs[key] ? 'on' : 'off');
  calc();
}

function roundFiscal(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function verbaIncideIRRF(v) {
  if (!v || v.tipo === 'desc') return false;
  if (typeof v.incideIRRF === 'boolean') return v.incideIRRF;
  const cfg = configVerbas.find(c => c.id === v.autoType);
  if (cfg && typeof cfg.compoeIRRF === 'boolean') return cfg.compoeIRRF;
  return true;
}

function verbaIncideINSS(v) {
  if (!v || v.tipo === 'desc') return false;
  if (typeof v.incideINSS === 'boolean') return v.incideINSS;
  const cfg = configVerbas.find(c => c.id === v.autoType);
  if (cfg && typeof cfg.compoeINSS === 'boolean') return cfg.compoeINSS;
  return true;
}

function verbaIncideFGTS(v) {
  if (!v || v.tipo === 'desc') return false;
  if (typeof v.incideFGTS === 'boolean') return v.incideFGTS;
  const cfg = configVerbas.find(c => c.id === v.autoType);
  if (cfg && typeof cfg.compoeFGTS === 'boolean') return cfg.compoeFGTS;
  return true;
}

function calcBaseIRRFAutomatica(deducaoBaseIRRF) {
  const baseComVerbas = verbas.reduce((s, v) => s + (verbaIncideIRRF(v) ? (parseFloat(v.venc) || 0) : 0), 0);
  return roundFiscal(baseComVerbas - (deducaoBaseIRRF || 0));
}

function calcBaseIRRFBruta() {
  return roundFiscal(verbas.reduce((s, v) => s + (verbaIncideIRRF(v) ? (parseFloat(v.venc) || 0) : 0), 0));
}

function calcBaseINSSAutomatica() {
  return roundFiscal(verbas.reduce((s, v) => s + (verbaIncideINSS(v) ? (parseFloat(v.venc) || 0) : 0), 0));
}

function calcBaseFGTSAutomatica() {
  return roundFiscal(verbas.reduce((s, v) => s + (verbaIncideFGTS(v) ? (parseFloat(v.venc) || 0) : 0), 0));
}

function calcDeducaoBaseIRRF(inssVal) {
  const dependentes = parseInt(document.getElementById('f-irrf-dependentes')?.value, 10) || 0;
  const deducaoDependentes = roundFiscal(dependentes * 189.59);
  const deducaoLegal = roundFiscal((inssVal || 0) + deducaoDependentes);
  return roundFiscal(Math.max(607.20, deducaoLegal));
}

function calcINSSProgressivo(base) {
  const baseCalc = Math.max(base, 0);
  const teto = 8475.55;
  if (baseCalc === 0) return { aliq: 0, deducao: 0, valor: 0 };  
  const baseLimitada = Math.min(baseCalc, teto); 
  // Cálculo progressivo por faixa (SEM arredondamento intermediário)
  let inss = 0;
  let faixaAnterior = 0;
  // Faixa 1: até 1.621,00 → 7,5%
  if (baseLimitada > 0) {
    const limiteF1 = Math.min(baseLimitada, 1621.00);
    inss += (limiteF1 - faixaAnterior) * 0.075;
    faixaAnterior = 1621.00;
  }
  // Faixa 2: 1.621,01 até 2.902,84 → 9%
  if (baseLimitada > 1621.00) {
    const limiteF2 = Math.min(baseLimitada, 2902.84);
    inss += (limiteF2 - faixaAnterior) * 0.09;
    faixaAnterior = 2902.84;
  }
  // Faixa 3: 2.902,85 até 4.354,27 → 12%
  if (baseLimitada > 2902.84) {
    const limiteF3 = Math.min(baseLimitada, 4354.27);
    inss += (limiteF3 - faixaAnterior) * 0.12;
    faixaAnterior = 4354.27;
  }
  // Faixa 4: 4.354,28 até 8.475,55 → 14%
  if (baseLimitada > 4354.27) {
    inss += (baseLimitada - faixaAnterior) * 0.14;
  }
  // 🔥 ARREDONDA APENAS NO FINAL!
  const valor = roundFiscal(Math.max(inss, 0));
  // Calcula alíquota efetiva para exibição
  const aliq = baseLimitada > 0 ? roundFiscal((valor / baseLimitada) * 100) : 0;
  return { aliq, deducao: 0, valor };
}

// ── CALC ──
function calc() {
  ensureFixedVerbas();
  
  const sal = parseFloat(document.getElementById('f-sal').value) || 0;
  const dias = parseFloat(document.getElementById('f-dias').value) || 0;

  // auto diasmes from month
  const comp = document.getElementById('f-comp').value;
  if (comp) {
    const [y,m] = comp.split('-').map(Number);
    const diasMes = new Date(y, m, 0).getDate();
    document.getElementById('f-diasmes').value = diasMes;
  }
  const diasMes = parseFloat(document.getElementById('f-diasmes').value) || 30;
  const diasLimitados = Math.max(0, Math.min(dias, diasMes));
  if (dias !== diasLimitados) {
    document.getElementById('f-dias').value = diasLimitados;
  }

  const salDia = diasMes > 0 ? sal / diasMes : 0;
  const salHora = sal / 220;
  const valDias = salDia * diasLimitados;

  document.getElementById('f-saldia').value = fmtN(salDia);
  document.getElementById('f-salhora').value = fmtN(salHora);
  document.getElementById('f-valdias').value = fmtN(valDias);

  // recalc auto verbas
  verbas.forEach(v => {
    if (v.auto && v.autoType !== 'dsrhe') {
      const r = calcVerba(v, sal, salDia, salHora, valDias);
      v.venc = roundFiscal(r.venc);
      v.desc2 = roundFiscal(r.desc || 0);
    }
  });
  
  verbas.forEach(v => {
    if (v.auto && v.autoType === 'dsrhe') {
      const r = calcVerba(v, sal, salDia, salHora, valDias);
      v.venc = roundFiscal(r.venc);
      v.desc2 = roundFiscal(r.desc || 0);
    }
  });

  // totals
  let totVenc = verbas.reduce((s,v) => s + (v.venc||0), 0);
  let totDesc = verbas.reduce((s,v) => s + (v.desc2||0), 0);

  // INSS
  const inssBase = calcBaseINSSAutomatica();
  let inssVal = 0;
  if (encs.inss) {
    const inssManual = parseFloat(document.getElementById('f-inss-manual').value);
    if (!isNaN(inssManual)) {
      inssVal = roundFiscal(inssManual);
      const inssAuto = calcINSSProgressivo(inssBase);
      document.getElementById('f-inss-aliq').value = fmtN(inssAuto.aliq);
    } else {
      const inssAuto = calcINSSProgressivo(inssBase);
      inssVal = inssAuto.valor;
      document.getElementById('f-inss-aliq').value = fmtN(inssAuto.aliq);
    }
    document.getElementById('f-inss-val').value = fmtN(inssVal);
    totDesc += inssVal;
  } else {
    document.getElementById('f-inss-aliq').value = '';
  }

  // FGTS
  let fgtsBase = calcBaseFGTSAutomatica();
  let fgtsVal = 0;
  if (encs.fgts) {
    const fb = parseFloat(document.getElementById('f-fgts-base').value);
    fgtsBase = isNaN(fb) ? calcBaseFGTSAutomatica() : fb;
    fgtsVal = roundFiscal(fgtsBase * 0.08);
    document.getElementById('f-fgts-val').value = fmtN(fgtsVal);
  }

  // IRRF
  const deducaoBaseIRRF = calcDeducaoBaseIRRF(inssVal);
  let irrfBase = calcBaseIRRFAutomatica(deducaoBaseIRRF);
  const irrfBaseReducao = calcBaseIRRFBruta();
  let irrfVal = 0, irrfFaixa = 0;
  if (encs.irrf) {
    const ib = parseFloat(document.getElementById('f-irrf-base').value);
    irrfBase = isNaN(ib) ? irrfBase : ib;
    const r = calcIRRF(irrfBase, irrfBaseReducao);
    irrfVal = r.val; irrfFaixa = r.aliq;
    document.getElementById('f-irrf-faixa').value = irrfFaixa + '%';
    document.getElementById('f-irrf-val').value = fmtN(irrfVal);
    document.getElementById('f-irrf-deducao').value = fmtN(deducaoBaseIRRF);
    totDesc += irrfVal;
  } else {
    document.getElementById('f-irrf-deducao').value = fmtN(deducaoBaseIRRF);
  }

  const liq = totVenc - totDesc;

  document.getElementById('t-venc').textContent = fmtBRL(totVenc);
  document.getElementById('t-desc').textContent = fmtBRL(totDesc);
  document.getElementById('t-liq').textContent = fmtBRL(liq);
  document.getElementById('t-salbase').textContent = fmtBRL(sal);
  document.getElementById('t-salinss').textContent = fmtBRL(inssBase);
  document.getElementById('t-basefgts').textContent = fmtBRL(encs.fgts ? fgtsBase : totVenc);
  document.getElementById('t-fgts').textContent = fmtBRL(fgtsVal);
  document.getElementById('t-baseirrf').textContent = fmtBRL(irrfBase);
  document.getElementById('t-faixairrf').textContent = encs.irrf ? irrfFaixa + '%' : '—';

  // renderVerbasList primeiro para salvar valores do DOM no array
  // depois renderPreview que lê do array já atualizado
  renderVerbasList();
  renderPreview();
}

function calcIRRF(base, baseReducao = base) {
  const baseCalc = Math.max(roundFiscal(base), 0);
  const baseReducaoCalc = Math.max(roundFiscal(baseReducao), 0);
  let aliq = 0;
  let valBase = 0;

  if (baseCalc <= 2428.80) {
    aliq = 0;
    valBase = 0;
  } else if (baseCalc <= 2826.65) {
    aliq = 7.5;
    valBase = (baseCalc * 0.075) - 182.16;
  } else if (baseCalc <= 3751.05) {
    aliq = 15;
    valBase = (baseCalc * 0.15) - 394.16;
  } else if (baseCalc <= 4664.68) {
    aliq = 22.5;
    valBase = (baseCalc * 0.225) - 675.49;
  } else {
    aliq = 27.5;
    valBase = (baseCalc * 0.275) - 908.73;
  }

  valBase = Math.max(roundFiscal(valBase), 0);

  // Regras 2026: isenção até R$ 5.000 e redução para R$ 5.000,01 até R$ 7.350,00.
  if (baseReducaoCalc <= 5000) return { aliq, valBase, reducao: valBase, val: 0 };
  if (baseReducaoCalc > 7350) return { aliq, valBase, reducao: 0, val: valBase };

  const reducao = Math.max(roundFiscal(978.62 - (0.133145 * baseReducaoCalc)), 0);
  const valorFinal = Math.max(roundFiscal(valBase - reducao), 0);
  return { aliq, valBase, reducao, val: valorFinal };
}

// ── VERBAS ──
function addVerbaDiasNormais() {
  const dias = parseFloat(document.getElementById('f-dias').value) || 28;
  verbas.push({
    id: Date.now(), cod:'8781', desc:'DIAS NORMAIS', ref: String(dias),
    venc: 0, desc2: 0, auto: true, autoType:'diasnormais', tipo:'venc', incideIRRF: true, incideINSS:true, incideFGTS:true
  });
  renderVerbasList();
}

function quickAdd(type) {
  const sal = parseFloat(document.getElementById('f-sal').value) || 0;
  const salHora = sal / 220;
  let v = { id: Date.now(), auto: false, tipo:'venc', venc:0, desc2:0, ref:'', incideIRRF:true, incideINSS:true, incideFGTS:true };
  switch(type) {
    case 'he50':
      v = {...v, cod:'150', desc:'HORAS EXTRAS - 50%', ref:'', auto:true, autoType:'he50', tipo:'venc'};
      break;
    case 'he100':
      v = {...v, cod:'200', desc:'HORAS EXTRAS 100%', ref:'', auto:true, autoType:'he100', tipo:'venc'};
      break;
    case 'adicfunc':
      v = {...v, cod:'348', desc:'ADICIONAL DE FUNÇÃO', ref:'6', auto:true, autoType:'adicfunc', tipo:'venc'};
      break;
    case 'ajudacusto':
      v = {...v, cod:'583', desc:'AJUDA DE CUSTO', ref:'', tipo:'venc'};
      break;
    case 'adiant':
      v = {...v, cod:'231', desc:'DESC. ADIANT. SALARIAL', ref:'', auto:true, autoType:'adiant', tipo:'desc', incideIRRF:false, incideINSS:false, incideFGTS:false};
      break;
    case 'pernoite':
      v = {...v, cod:'256', desc:'PERNOITE', ref:'', tipo:'venc'};
      break;
    case 'gratviagem':
      v = {...v, cod:'588', desc:'GRATIFICAÇÃO VIAGEM', ref:'', tipo:'venc'};
      break;
    case 'almoco':
      v = {...v, cod:'448', desc:'ALMOÇO MOTORISTA', ref:'', tipo:'venc'};
      break;
  }
  const cfgTipo = configVerbas.find(c => c.id === type || c.id === v.autoType);
  if (cfgTipo && typeof cfgTipo.compoeIRRF === 'boolean') {
    v.incideIRRF = cfgTipo.compoeIRRF;
  } else if (v.tipo === 'desc') v.incideIRRF = false;
  if (cfgTipo && typeof cfgTipo.compoeINSS === 'boolean') v.incideINSS = cfgTipo.compoeINSS;
  else if (v.tipo === 'desc') v.incideINSS = false;
  if (cfgTipo && typeof cfgTipo.compoeFGTS === 'boolean') v.incideFGTS = cfgTipo.compoeFGTS;
  else if (v.tipo === 'desc') v.incideFGTS = false;
  verbas.push(v);
  calc();
}

function addVerba(tipo) {
  verbas.push({ id: Date.now(), cod:'', desc:'', ref:'', venc:0, desc2:0, auto:false, tipo, incideIRRF: tipo !== 'desc', incideINSS: tipo !== 'desc', incideFGTS: tipo !== 'desc' });
  renderVerbasList();
}

function removeVerba(id) {
  verbas = verbas.filter(v => v.id !== id);
  calc();
}

function updateVerba(id, field, val) {
  const v = verbas.find(v => v.id === id);
  if (!v) return;
  if (field === 'venc' && v.tipo === 'desc') return;
  if (field === 'desc2' && v.tipo === 'venc') return;

  if (field === 'venc') {
    v.venc = parseFloat(val) || 0;
    v.auto = false;
    calcTotaisOnly();
    renderPreview();

  } else if (field === 'desc2') {
    v.desc2 = parseFloat(val) || 0;
    v.auto = false;
    calcTotaisOnly();
    renderPreview();

  } else if (field === 'ref') {
    v.ref = val;

    if (v.auto) {
      
      // recalcula sem re-renderizar a lista — só atualiza o input de valor
      const sal = parseFloat(document.getElementById('f-sal').value) || 0;
      const diasMes = parseFloat(document.getElementById('f-diasmes').value) || 30;
      const dias = parseFloat(document.getElementById('f-dias').value) || 0;

      const salDia = sal / diasMes;
      const salHora = sal / 220;
      const valDias = salDia * dias;

      const r = calcVerba(v, sal, salDia, salHora, valDias);
      v.venc = roundFiscal(r.venc);
      v.desc2 = roundFiscal(r.desc || 0);

      // atualiza só os inputs de valor sem re-renderizar
      const row = document.querySelector(`.verba-row[data-id="${id}"]`);

      if (row) {
        const inpVenc = row.querySelector('[data-field="venc"]');
        const inpDesc2 = row.querySelector('[data-field="desc2"]');

        if (inpVenc) inpVenc.value = v.venc > 0 ? fmtN(v.venc) : '';
        if (inpDesc2) inpDesc2.value = v.desc2 > 0 ? fmtN(v.desc2) : '';
      }

      // recalcula DSR automaticamente quando muda HE/ref de qualquer verba auto
      verbas.forEach(dsrV => {
        if (!dsrV.auto || dsrV.autoType !== 'dsrhe') return;
        const dr = calcVerba(dsrV, sal, salDia, salHora, valDias);
        dsrV.venc = roundFiscal(dr.venc);
        dsrV.desc2 = roundFiscal(dr.desc || 0);
        const dsrRow = document.querySelector(`.verba-row[data-id="${dsrV.id}"]`);
        if (!dsrRow) return;
        const dsrVencInp = dsrRow.querySelector('[data-field="venc"]');
        const dsrDescInp = dsrRow.querySelector('[data-field="desc2"]');
        if (dsrVencInp) dsrVencInp.value = dsrV.venc > 0 ? fmtN(dsrV.venc) : '';
        if (dsrDescInp) dsrDescInp.value = dsrV.desc2 > 0 ? fmtN(dsrV.desc2) : '';
      });

      // atualiza totais e preview sem re-renderizar lista
      calcTotaisOnly();
      renderPreview();

    } else {
      renderPreview();
    }
  } else if (field === 'incideIRRF') {
    v.incideIRRF = !!val;
    calcTotaisOnly();
    renderPreview();

  } else {
    v[field] = val;
    renderPreview();
  }
}

function calcTotaisOnly() {
  const sal = parseFloat(document.getElementById('f-sal').value)||0;
  const diasMes = parseFloat(document.getElementById('f-diasmes').value)||30;
  const dias = parseFloat(document.getElementById('f-dias').value)||0;
  const salDia = sal/diasMes, salHora = sal/220;

  let totVenc = verbas.reduce((s,v)=>s+(v.venc||0),0);
  let totDesc = verbas.reduce((s,v)=>s+(v.desc2||0),0);

  const inssBase = calcBaseINSSAutomatica();
  let inssVal=0;
  if(encs.inss){
    const manual=parseFloat(document.getElementById('f-inss-manual').value);
    if(!isNaN(manual)) inssVal=roundFiscal(manual);
    else inssVal=calcINSSProgressivo(inssBase).valor;
    totDesc+=inssVal;
  }
  let fgtsBase=calcBaseFGTSAutomatica(), fgtsVal=0;
  if(encs.fgts){const fb=parseFloat(document.getElementById('f-fgts-base').value);fgtsBase=isNaN(fb)?calcBaseFGTSAutomatica():fb;fgtsVal=roundFiscal(fgtsBase*0.08);}
  const deducaoBaseIRRF=calcDeducaoBaseIRRF(inssVal);
  if (document.getElementById('f-irrf-deducao')) {
    document.getElementById('f-irrf-deducao').value = fmtN(deducaoBaseIRRF);
  }
  let irrfBase=calcBaseIRRFAutomatica(deducaoBaseIRRF), irrfVal=0, irrfFaixa=0;
  if(encs.irrf){const ib=parseFloat(document.getElementById('f-irrf-base').value);irrfBase=isNaN(ib)?irrfBase:ib;const r=calcIRRF(irrfBase, calcBaseIRRFBruta());irrfVal=r.val;irrfFaixa=r.aliq;totDesc+=irrfVal;}

  const liq = totVenc - totDesc;
  document.getElementById('t-venc').textContent = fmtBRL(totVenc);
  document.getElementById('t-desc').textContent = fmtBRL(totDesc);
  document.getElementById('t-liq').textContent = fmtBRL(liq);
  document.getElementById('t-salbase').textContent = fmtBRL(sal);
  document.getElementById('t-salinss').textContent = fmtBRL(inssBase);
  document.getElementById('t-basefgts').textContent = fmtBRL(encs.fgts?fgtsBase:totVenc);
  document.getElementById('t-fgts').textContent = fmtBRL(fgtsVal);
  document.getElementById('t-baseirrf').textContent = fmtBRL(irrfBase);
  document.getElementById('t-faixairrf').textContent = encs.irrf?irrfFaixa+'%':'—';
}

function renderVerbasList() {
  const list = document.getElementById('verbas-list');
  if (!verbas.length) {
    list.innerHTML = '<div style="text-align:center;padding:.75rem;color:var(--ink3);font-size:.8rem">Nenhuma verba adicionada</div>';
    return;
  }
  list.innerHTML = verbas.map(v => {
    const vencCls = v.auto && v.autoType !== 'adiant' ? 'auto' : '';
    const descCls = v.auto && v.autoType === 'adiant' ? 'desc-auto' : '';
    const lockVenc = v.tipo === 'desc' || (v.auto && v.autoType!=='adiant');
    const lockDesc = v.tipo === 'venc' || (v.auto && v.autoType==='adiant');
    const cfgV = configVerbas.find(c=>c.id===v.autoType);
    const refLabel = v.autoType==='he50'||v.autoType==='he100' ? 'horas' :
                     v.autoType==='adicfunc'||v.autoType==='premiotempo' ? '%' :
                     cfgV ? cfgV.refLabel : '';
    const incideIRRF = verbaIncideIRRF(v);
    return `<div class="verba-row" data-id="${v.id}">
      <input value="${escHtml(v.cod||'')}" placeholder="Cód" style="text-align:left" oninput="updateVerba(${v.id},'cod',this.value)">
      <input value="${escHtml(v.desc||'')}" placeholder="Descrição do lançamento" class="desc-input" style="text-align:left;font-size:.82rem" oninput="updateVerba(${v.id},'desc',this.value)">
      <input value="${escHtml(v.ref||'')}" placeholder="${refLabel||'ref'}" oninput="updateVerba(${v.id},'ref',this.value)">
      <input value="${v.venc > 0 ? fmtN(v.venc) : ''}" placeholder="0,00" class="${vencCls}" ${lockVenc ? 'readonly' : ''} oninput="updateVerba(${v.id},'venc',this.value)" data-field="venc">
      <input value="${v.desc2 > 0 ? fmtN(v.desc2) : v.tipo==='desc'&&v.ref ? fmtN(parseFloat(v.ref)||0) : ''}" placeholder="0,00" class="${descCls}" ${lockDesc ? 'readonly' : ''} oninput="updateVerba(${v.id},'desc2',this.value)" data-field="desc2">
      <label class="irrf-flag"><input type="checkbox" ${incideIRRF ? 'checked' : ''} ${v.tipo === 'desc' ? 'disabled' : ''} onchange="updateVerba(${v.id},'incideIRRF',this.checked)"></label>
      <button class="btn-rm" onclick="removeVerba(${v.id})">×</button>
    </div>`;
  }).join('');
}

function escHtml(s){ return (s||'').replace(/"/g,'&quot;'); }

// ── DATA ──
function getData() {
  const sal = parseFloat(document.getElementById('f-sal').value)||0;
  const diasMes = parseFloat(document.getElementById('f-diasmes').value)||30;
  const dias = parseFloat(document.getElementById('f-dias').value)||0;
  const diasUteis = parseFloat(document.getElementById('f-diasuteis').value)||0;
  const diasDSR = parseFloat(document.getElementById('f-diasdsr').value)||0;
  const salDia = sal/diasMes, salHora = sal/220, valDias = salDia*dias;

  let totVenc = verbas.reduce((s,v)=>s+(v.venc||0),0);
  let totDesc = verbas.reduce((s,v)=>s+(v.desc2||0)+(v.tipo==='desc'&&v.auto?parseFloat(v.ref)||0:0),0);

  const inssBase = calcBaseINSSAutomatica();
  let inssVal=0, fgtsBase=calcBaseFGTSAutomatica(), fgtsVal=0, irrfBase=0, irrfVal=0, irrfFaixa=0;
  if(encs.inss){
    const manual=parseFloat(document.getElementById('f-inss-manual').value);
    if(!isNaN(manual)) inssVal=roundFiscal(manual);
    else inssVal=calcINSSProgressivo(inssBase).valor;
    totDesc+=inssVal;
  }
  if(encs.fgts){const fb=parseFloat(document.getElementById('f-fgts-base').value);fgtsBase=isNaN(fb)?calcBaseFGTSAutomatica():fb;fgtsVal=roundFiscal(fgtsBase*0.08);}
  const deducaoBaseIRRF=calcDeducaoBaseIRRF(inssVal);
  if(encs.irrf){const ib=parseFloat(document.getElementById('f-irrf-base').value);irrfBase=isNaN(ib)?calcBaseIRRFAutomatica(deducaoBaseIRRF):ib;const r=calcIRRF(irrfBase, calcBaseIRRFBruta());irrfVal=r.val;irrfFaixa=r.aliq;totDesc+=irrfVal;}

  const comp = document.getElementById('f-comp').value;
  const compFmt = comp ? (() => { const [y,m]=comp.split('-'); const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; return meses[parseInt(m)-1]+' de '+y; })() : '';

  const admissao = document.getElementById('f-admissao').value;
  const admFmt = admissao ? (() => { const [y,m,d]=admissao.split('-'); return `${d}/${m}/${y}`; })() : '';

  return {
    emp: document.getElementById('f-emp').value,
    cnpj: document.getElementById('f-cnpj').value,
    cidade: document.getElementById('f-cidade')?.value || '',
    func: document.getElementById('f-func').value,
    cargo: document.getElementById('f-cargo').value,
    tipo: document.getElementById('f-tipo').value,
    folha: document.getElementById('f-folha').value,
    comp: compFmt,
    admissao: admFmt,
    sal, dias, diasMes, diasUteis, diasDSR, salDia, salHora, valDias,
    verbas: verbas.map(v=>({...v})),
    totVenc, totDesc, liq: totVenc-totDesc,
    inssBase, inssVal, fgtsBase, fgtsVal, irrfBase, irrfVal, irrfFaixa,
    encs: {...encs},
    savedAt: new Date().toISOString()
  };
}

// ── PREVIEW ──
function renderPreview() {
  syncDOMtoVerbas();
  const d = getData();

  document.getElementById('recibo-doc').innerHTML =
    buildViaHTML(d, 'EMPRESA') + buildViaHTML(d, 'FUNCIONÁRIO');
}

function syncDOMtoVerbas() {
  const list = document.getElementById('verbas-list');
  if (!list) return;
  list.querySelectorAll('.verba-row').forEach(row => {
    const id = Number(row.dataset.id);
    const v = verbas.find(x => x.id === id);
    if (!v) return;
    const inputs = row.querySelectorAll('input');
    if (inputs[0]) v.cod  = inputs[0].value;
    if (inputs[1]) v.desc = inputs[1].value;
    if (inputs[2] && !v.auto) v.ref = inputs[2].value;
  });
}

function buildViaHTML(d, viaLabel) {
  const TOTAL_ROWS = 17; // linhas fixas para caber em meia A4

  // montar linhas de verbas
  let rowsData = [];
  const dn = d.verbas.find(v=>v.autoType==='diasnormais');
if(dn) rowsData.push({
  cod:'8781',
  desc:'DIAS NORMAIS',
  ref:fmtRef(dn,'d',d.dias),
  venc:fmtN2(dn.venc),
  descv:''
});

// 🔥 OUTRAS VERBAS (SEM DSR)
d.verbas
  .filter(v => v.autoType !== 'diasnormais' && v.autoType !== 'dsrhe')
  .forEach(v=>{
    const vencVal = v.venc > 0 ? fmtN2(v.venc) : '';
    const dv = v.desc2 > 0 ? v.desc2 : (v.tipo==='desc'&&v.ref ? parseFloat(v.ref)||0 : 0);
    const descVal = dv > 0 ? fmtN2(dv) : '';
    rowsData.push({
      cod:v.cod||'',
      desc:v.desc||'',
      ref:fmtRef(v,'',null),
      venc:vencVal,
      descv:descVal
    });
  });

// 🔥 ENCARGOS COMO LINHAS DE DESCONTO/INFORMATIVO NO RECIBO
if (d.encs.inss && d.inssVal > 0) {
  rowsData.push({
    cod:'9981',
    desc:'DESCONTO INSS',
    ref:'',
    venc:'',
    descv:fmtN2(d.inssVal)
  });
}

if (d.encs.irrf && d.irrfVal > 0) {
  rowsData.push({
    cod:'9982',
    desc:'DESCONTO IRRF',
    ref:d.irrfFaixa ? `${String(d.irrfFaixa).replace('.',',')}%` : '',
    venc:'',
    descv:fmtN2(d.irrfVal)
  });
}

if (d.encs.fgts && d.fgtsVal > 0) {
  rowsData.push({
    cod:'9983',
    desc:'FGTS (INFORMATIVO)',
    ref:`R$ ${fmtN2(d.fgtsVal)}`,
    venc:'',
    descv:''
  });
}

// 🔥 DSR FIXO
const dsr = d.verbas.find(v=>v.autoType==='dsrhe');
if(dsr) rowsData.push({
  cod:'9999',
  desc:'DSR SOBRE HORAS EXTRAS',
  ref:'',
  venc:fmtN2(dsr.venc),
  descv:''
});
  
  // preencher com linhas vazias até TOTAL_ROWS
  let rows = '';
  rowsData.forEach((r,i) => {
    rows += `<tr><td class="cod">${r.cod}</td><td>${r.desc}</td><td class="r">${r.ref}</td><td class="r">${r.venc ? 'R$ '+r.venc : ''}</td><td class="r">${r.descv ? 'R$ '+r.descv : ''}</td></tr>`;
  });
  const empty = TOTAL_ROWS - rowsData.length;
  for(let i=0; i<empty; i++){
    rows += `<tr><td class="cod">&nbsp;</td><td></td><td class="r"></td><td class="r"></td><td class="r"></td></tr>`;
  }

  return `<div class="via">
    <!-- CONTEÚDO PRINCIPAL + LATERAL numa linha -->
    <div class="via-inner">
      <div class="via-main">

        <!-- CABEÇALHO -->
        <div class="rec-header">
          <div>
            <div class="rec-empresa">${d.emp||'Nome da Empresa'}</div>
            <div class="rec-cnpj">
              ${d.cnpj ? 'CNPJ: ' + d.cnpj : ''}
              ${d.cidade ? ' • ' + d.cidade : ''}
            </div>
          </div>
          <div class="rec-header-right">
            <div class="rec-folha">${d.folha||'Folha Mensal'}</div>
            <div class="rec-comp">${d.comp||'—'}</div>
          </div>
        </div>

        <!-- LINHA 1: Nome do Funcionário | Tipo -->
        <div class="rec-row1">
          <div class="rc" style="flex:1;white-space:normal"><span class="rc-lbl">Nome do Funcionário</span><span class="rc-val">${d.func||'—'}</span></div>
          <div class="rc" style="border-right:none"><span class="rc-lbl">Tipo</span><span class="rc-val">${d.tipo||'Mensalista'}</span></div>
        </div>

        <!-- LINHA 2: Cargo | Admissão | Sal Base -->
        <div class="rec-row2">
          <div class="rc grow"><span class="rc-lbl">Cargo / Função</span><span class="rc-val">${d.cargo||'—'}</span></div>
          <div class="rc"><span class="rc-lbl">Admissão</span><span class="rc-val">${d.admissao||'—'}</span></div>
          <div class="rc" style="border-right:none;min-width:90px"><span class="rc-lbl">Salário Base</span><span class="rc-val">R$ ${fmtN2(d.sal)}</span></div>
        </div>

        <!-- TABELA DE VERBAS -->
        <table class="rec-table">
          <thead><tr>
            <th style="width:46px">Código</th>
            <th>Descrição</th>
            <th class="r" style="width:60px">Referência</th>
            <th class="r" style="width:88px">Vencimentos</th>
            <th class="r" style="width:88px">Descontos</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- TOTAIS -->
        <div class="rec-totais-wrap">
          <div class="rec-tot-row">
            <div class="rtc span-all"></div>
            <div class="rtc"><span class="rtc-lbl">Total de Vencimentos</span><span class="rtc-val">R$ ${fmtN2(d.totVenc)}</span></div>
            <div class="rtc"><span class="rtc-lbl">Total de Descontos</span><span class="rtc-val">R$ ${fmtN2(d.totDesc)}</span></div>
          </div>
          <div class="rec-tot-row rec-tot-liq">
            <div class="rtc" style="grid-column:1/3"><span class="rtc-lbl">&nbsp;</span></div>
            <div class="rtc" style="text-align:right"><span class="rtc-lbl" style="font-size:7pt;">Valor Líquido ⇒</span></div>
            <div class="rtc" style="grid-column:4/6;border-right:none;text-align:right"><span class="rtc-val" style="font-size:8pt;">R$ ${fmtN2(d.liq)}</span></div>
          </div>
          ${(d.encs.inss || d.encs.fgts || d.encs.irrf) ? `
          <div class="rec-tot-row">
            <div class="rtc"><span class="rtc-lbl">Salário Base</span><span class="rtc-val" style="text-align:left">R$ ${fmtN2(d.sal)}</span></div>
            ${d.encs.inss ? `<div class="rtc"><span class="rtc-lbl">Sal. Contr. INSS</span><span class="rtc-val" style="text-align:left">R$ ${fmtN2(d.inssBase || 0)}</span></div>` : '<div class="rtc"></div>'}
            ${d.encs.fgts ? `<div class="rtc"><span class="rtc-lbl">Base Cálc. FGTS</span><span class="rtc-val" style="text-align:left">R$ ${fmtN2(d.fgtsBase)}</span></div>` : '<div class="rtc"></div>'}
            ${d.encs.fgts ? `<div class="rtc"><span class="rtc-lbl">F.G.T.S do Mês</span><span class="rtc-val">R$ ${fmtN2(d.fgtsVal)}</span></div>` : '<div class="rtc"></div>'}
            ${d.encs.irrf ? `<div class="rtc"><span class="rtc-lbl">Base Cálc. IRRF</span><span class="rtc-val">R$ ${fmtN2(d.irrfBase)}</span></div>` : '<div class="rtc"></div>'}
          </div>` : ''}
        </div>

      </div><!-- /via-main -->

      <!-- LATERAL DIREITA -->
      <div class="via-lateral">
        <div class="rec-rodape">
          <div class="rec-rodape-top">
            <span>Declaro ter recebido a importância líquida discriminada neste recibo.</span>
          </div>
          <div class="rec-rodape-bottom">
            <div class="rec-rodape-data">
              <div class="rec-rodape-linha"></div>
              <span>Data</span>
            </div>
            <div class="rec-rodape-sig">
              <div class="rec-rodape-linha"></div>
              <span>Assinatura do Funcionário</span>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /via-inner -->
  <div class="via-sep"></div>
</div>`;
}

function fmtRef(v, tipo, dias) {
  if(tipo==='d') return String(dias)+',00';
  if(v.autoType==='he50'||v.autoType==='he100') return v.ref ? v.ref+':00' : '';
  if(v.autoType==='adicfunc'||v.autoType==='premiotempo') return v.ref ? v.ref+',00' : '';
  return v.ref||'';
}

function fmtN2(v) {
  return (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function trRow(cod, desc, ref, venc, descVal) {
  return `<tr>
    <td class="cod">${cod}</td>
    <td>${desc}</td>
    <td class="r">${ref}</td>
    <td class="r">${venc}</td>
    <td class="r">${descVal}</td>
  </tr>`;
}

// ── PDF ──
async function gerarPDF() {
  const el = document.getElementById('recibo-doc');
  if (!el) { toast('Nada para gerar!', 'err'); return; }
  toast('Gerando PDF...');

  const canvas = await html2canvas(el, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false
  });

  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const W = 210;
  const H = 297;
  const imgW = W;
  const imgH = canvas.height * W / canvas.width;

  // se cabe numa página
  if (imgH <= H) {
    doc.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
  } else {
    // divide em páginas se necessário
    let yPos = 0;
    while (yPos < imgH) {
      if (yPos > 0) doc.addPage();
      doc.addImage(imgData, 'PNG', 0, -yPos, imgW, imgH);
      yPos += H;
    }
  }

  const d = getData();
  const fname = `recibo-${(d.func||'funcionario').replace(/ /g,'-').toLowerCase()}-${(d.comp||'').replace(/ /g,'-')}.pdf`;
  doc.save(fname);
  toast('PDF gerado!');
}

// ── SUPABASE ──
const SB_URL = 'https://vexaeculstthppbqmxqj.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZleGFlY3Vsc3R0aHBwYnFteHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzM0NzIsImV4cCI6MjA4OTYwOTQ3Mn0.u-FLKKFarm_oqQeLhdOxx_zVDvDey2cQT209jdU1oQs';

async function sbFetch(path, options={}) {
  const token = localStorage.getItem('sb_token') || SB_KEY;
  const headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
  if (options.prefer) headers['Prefer'] = options.prefer;
  const { prefer, ...rest } = options;
  const res = await fetch(SB_URL + '/rest/v1/' + path, { headers, ...rest });
  if (!res.ok) {
    const err = await res.text();
    // JWT expirado — limpa sessão e volta para o login
    if (res.status === 401) {
      localStorage.removeItem('sb_token');
      localStorage.removeItem('sb_user');
      document.getElementById('pg-login').style.display = 'flex';
      document.getElementById('pg-main').style.display = 'none';
      document.getElementById('pg-hist').style.display = 'none';
      document.getElementById('pg-config').style.display = 'none';
      document.getElementById('pg-empresas').style.display = 'none';
      document.getElementById('user-badge').style.display = 'none';
      document.getElementById('btn-logout').style.display = 'none';
      document.getElementById('btn-empresas').style.display = 'none';
      currentUser = null;
      return null;
    }
    console.error('Supabase error:', err);
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
  
// ── SAVE / HIST ──
async function salvar() {
  const d = getData();
  if(!d.emp||!d.func){ toast('Preencha empresa e funcionário!','err'); return; }
  toast('Salvando...');
  const row = {
  id: editId || Date.now(),
  emp: d.emp,
  func: d.func,
  cargo: d.cargo,
  comp: d.comp,
  folha: d.folha,
  liq: d.liq,
  tot_venc: d.totVenc,
  tot_desc: d.totDesc,
  grupo_id: grupoId,        // 🔥 ADICIONAR
  user_id: currentUser.id,  // 🔥 ADICIONAR
  dados: d
};
  try {
    await sbFetch('recibos', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: JSON.stringify(row)
    });
    editId = row.id;
    toast('Recibo salvo! ✅');
  } catch(e) {
    console.error('Erro ao salvar:', e);
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

async function showHist() {
  document.getElementById('pg-main').style.display='none';
  document.getElementById('pg-hist').style.display='block';
  document.getElementById('pg-config').style.display='none';
  document.getElementById('pg-empresas').style.display='none';

  document.getElementById('hist-grid').innerHTML =
    '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--ink3)">Carregando...</div>';

  try {

    let data;

    if (currentUser.isAdmin) {
      data = await sbFetch('recibos?select=*&order=saved_at.desc');
    } else {
      data = await sbFetch('recibos?grupo_id=eq.' + grupoId + '&order=saved_at.desc');
    }

    hist = data.map(r => ({
      ...r.dados,
      id: r.id,
      liq: r.liq,
      totVenc: r.tot_venc,
      totDesc: r.tot_desc
    }));

    renderHist();

  } catch(e) {
    hist = JSON.parse(localStorage.getItem('rec_hist_v2')||'[]');
    renderHist();
    toast('Usando histórico local (sem conexão)', 'err');
  }
}

function showMain() {
  document.getElementById('pg-main').style.display='block';
  document.getElementById('pg-hist').style.display='none';
  document.getElementById('pg-config').style.display='none';
  document.getElementById('pg-empresas').style.display='none';
  document.getElementById('pg-admin').style.display='none';
  syncQuickAddButtons();
}

function showHist_wrapper() {
  document.getElementById('pg-empresas').style.display='none';
  showHist();
}

function renderHist() {
  const g = document.getElementById('hist-grid');
  if(!hist.length){ g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--ink3)"><b>Nenhum recibo salvo ainda.</b></div>'; return; }
  g.innerHTML = hist.map(h=>`
    <div class="hcard">
      <div class="hc-emp">${h.emp||'—'}</div>
      <div class="hc-func">${h.func||'—'} · ${h.cargo||'—'}</div>
      <div class="hc-comp">${h.comp||'—'} · ${h.folha||'—'}</div>
      <div class="hc-foot">
        <span class="hc-liq">${fmtBRL(h.liq||0)}</span>
        <span style="font-size:.7rem;color:var(--ink3)">${fmtBRL(h.totVenc||0)} bruto</span>
      </div>
      <div class="hc-acts">
        <button class="hcbtn" onclick="loadRec('${h.id}')">✏ Editar</button>
        <button class="hcbtn" onclick="pdfRec('${h.id}')">⬇ PDF</button>
        <button class="hcbtn d" onclick="delRec('${h.id}')">✕</button>
      </div>
    </div>`).join('');
}

function loadRec(id) {
  const h = hist.find(x=>x.id==id); if(!h) return;
  editId = h.id;
  const setV = (el,v) => { const e=document.getElementById(el); if(e) e.value=v||''; };
  setV('f-emp',h.emp); setV('f-cnpj',h.cnpj);
  setV('f-func',h.func); setV('f-cargo',h.cargo);
  setV('f-sal',h.sal); setV('f-dias',h.dias); setV('f-diasmes',h.diasMes);
  setV('f-diasuteis',h.diasUteis);
  setV('f-diasdsr',h.diasDSR);
  if (!document.getElementById('f-diasuteis').value) {
    const dm = parseFloat(h.diasMes) || 30;
    document.getElementById('f-diasuteis').value = Math.max(dm - 6, 0);
  }
  if (!document.getElementById('f-diasdsr').value) {
    const dm = parseFloat(h.diasMes) || 30;
    document.getElementById('f-diasdsr').value = Math.min(6, dm);
  }

  if(h.comp) {
    const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const parts = h.comp.split(' de ');
    if(parts.length===2){
      const mi = meses.indexOf(parts[0]);
      if(mi>=0) document.getElementById('f-comp').value = parts[1]+'-'+String(mi+1).padStart(2,'0');
    }
  }
  if(h.admissao){
    const [d2,m2,y2]=h.admissao.split('/');
    if(d2&&m2&&y2) document.getElementById('f-admissao').value=`${y2}-${m2}-${d2}`;
  }

  document.getElementById('f-tipo').value = h.tipo||'Mensalista';
  document.getElementById('f-folha').value = h.folha||'Folha Mensal';

  verbas = (h.verbas||[]).map(v=>({...v, id:Date.now()+Math.random()}));
  encs = {...(h.encs||{inss:false,fgts:false,irrf:false})};
  ['inss','fgts','irrf'].forEach(k=>{
    document.getElementById('tc-'+k).classList.toggle('open',encs[k]);
    const badge=document.getElementById('badge-'+k);
    badge.textContent=encs[k]?'Ativado':'Desativado';
    badge.className='toggle-badge '+(encs[k]?'on':'off');
  });

  showMain();
  calc();
}

function pdfRec(id){ loadRec(id); setTimeout(gerarPDF,200); }

async function delRec(id){
  if(!confirm('Excluir este recibo?')) return;
  try {
    await sbFetch(`recibos?id=eq.${id}`, { method:'DELETE' });
    hist = hist.filter(x=>x.id!=id);
    renderHist();
    toast('Recibo excluído!');
  } catch(e) {
    hist = hist.filter(x=>x.id!=id);
    localStorage.setItem('rec_hist_v2',JSON.stringify(hist));
    renderHist();
  }
}

function novoRecibo() {
  editId=null;
  ['f-emp','f-cnpj','f-func','f-cargo','f-sal','f-dias','f-admissao','f-inss-aliq','f-inss-manual','f-inss-val','f-fgts-base','f-fgts-val','f-irrf-base','f-irrf-faixa','f-irrf-val','f-irrf-dependentes','f-irrf-deducao'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.value='';
  });
  const now=new Date();
  const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('f-comp').value=`${y}-${m}`;
  const dias=new Date(y,now.getMonth()+1,0).getDate();
  document.getElementById('f-diasmes').value=dias;
  document.getElementById('f-dias').value=dias;
  document.getElementById('f-diasuteis').value=Math.max(dias-6,0);
  document.getElementById('f-diasdsr').value=Math.min(6,dias);
  verbas=[];
  encs={inss:false,fgts:false,irrf:false};
  ['inss','fgts','irrf'].forEach(k=>{
    document.getElementById('tc-'+k).classList.remove('open');
    const b=document.getElementById('badge-'+k);
    b.textContent='Desativado'; b.className='toggle-badge off';
  });
  ensureFixedVerbas();
  calc();
  showMain();
}

// ── HELPERS ──
function fmtBRL(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtN(v){ return (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function toast(msg, type='') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast '+(type==='err'?'err':'')+' show';
  setTimeout(()=>t.classList.remove('show'),2800);
}


function saveConfig() {
  configParams.horasMes  = parseFloat(document.getElementById('cfg-horas-mes').value)||220;
  configParams.he50Mult  = parseFloat(document.getElementById('cfg-he50-mult').value)||1.5;
  configParams.he100Mult = parseFloat(document.getElementById('cfg-he100-mult').value)||2.0;
  configParams.fgtsAliq  = parseFloat(document.getElementById('cfg-fgts-aliq').value)||8;
  localStorage.setItem('cfg_params', JSON.stringify(configParams));
  toast('Configurações salvas!');
}

function showConfig() {
  const CONFIG_PASS = localStorage.getItem('cfg_senha') || '1234';
  const input = prompt('Digite a senha para acessar as Fórmulas:');
  if (input === null) return;
  if (input !== CONFIG_PASS) { toast('Senha incorreta!', 'err'); return; }
  document.getElementById('pg-main').style.display='none';
  document.getElementById('pg-hist').style.display='none';
  document.getElementById('pg-config').style.display='block';
  document.getElementById('pg-empresas').style.display='none';
  renderConfigVerbas();
  renderQuickList();
  document.getElementById('cfg-horas-mes').value = configParams.horasMes;
  document.getElementById('cfg-he50-mult').value = configParams.he50Mult;
  document.getElementById('cfg-he100-mult').value = configParams.he100Mult;
  document.getElementById('cfg-fgts-aliq').value = configParams.fgtsAliq;
}

function showMain_config() {
  document.getElementById('pg-main').style.display='block';
  document.getElementById('pg-hist').style.display='none';
  document.getElementById('pg-config').style.display='none';
  document.getElementById('pg-empresas').style.display='none';
  // sync quickAdd buttons com configVerbas
  syncQuickAddButtons();
}

function renderConfigVerbas() {
  const tbody = document.getElementById('config-verbas-body');
  tbody.innerHTML = configVerbas.map((v,i) => `
    <tr>
      <td><input value="${v.cod}" oninput="updateConfigVerba(${i},'cod',this.value)" placeholder="Cód"></td>
      <td><input value="${v.desc}" oninput="updateConfigVerba(${i},'desc',this.value)" placeholder="Descrição"></td>
      <td>
        <select onchange="updateConfigVerba(${i},'tipo',this.value)">
          <option value="venc" ${v.tipo==='venc'?'selected':''}>Vencimento</option>
          <option value="desc" ${v.tipo==='desc'?'selected':''}>Desconto</option>
        </select>
      </td>
      <td><input value="${v.refLabel}" oninput="updateConfigVerba(${i},'refLabel',this.value)" placeholder="ex: horas"></td>
      <td style="text-align:center"><input type="checkbox" ${v.compoeHE ? 'checked' : ''} onchange="updateConfigVerba(${i},'compoeHE',this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" ${v.compoeIRRF ? 'checked' : ''} onchange="updateConfigVerba(${i},'compoeIRRF',this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" ${v.compoeINSS ? 'checked' : ''} onchange="updateConfigVerba(${i},'compoeINSS',this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" ${v.compoeFGTS ? 'checked' : ''} onchange="updateConfigVerba(${i},'compoeFGTS',this.checked)"></td>
      <td><input value="${v.formulaVenc}" oninput="updateConfigVerba(${i},'formulaVenc',this.value)" placeholder="ex: ref * salHora * 1.5" style="font-family:'Inconsolata',monospace;font-size:.78rem"></td>
      <td><input value="${v.formulaDesc}" oninput="updateConfigVerba(${i},'formulaDesc',this.value)" placeholder="ex: ref" style="font-family:'Inconsolata',monospace;font-size:.78rem"></td>
      <td><button class="btn-del-config" onclick="delConfigVerba(${i})">×</button></td>
    </tr>
  `).join('');
}

function renderQuickList() {
  const el = document.getElementById('config-quick-list');
  el.innerHTML = configVerbas.map((v,i) => `
    <div style="display:flex;align-items:center;gap:.5rem;padding:.3rem .5rem;background:#fafaf9;border:1px solid var(--border);border-radius:5px;">
      <span style="font-family:'Inconsolata',monospace;font-size:.72rem;color:var(--ink3);width:40px">${v.cod}</span>
      <span style="flex:1;font-size:.8rem">${v.desc}</span>
      <span class="config-badge ${v.tipo}">${v.tipo==='venc'?'Venc.':'Desc.'}</span>
    </div>
  `).join('');
}

function updateConfigVerba(i, field, val) {
  configVerbas[i][field] = val;
  if (field === 'tipo' && val === 'desc') {
    configVerbas[i].compoeIRRF = false;
    configVerbas[i].compoeINSS = false;
    configVerbas[i].compoeFGTS = false;
  }
  localStorage.setItem('cfg_verbas', JSON.stringify(configVerbas));
}

function addConfigVerba() {
  configVerbas.push({
    id: 'custom_'+Date.now(), cod:'', desc:'Nova Verba',
    tipo:'venc', refLabel:'valor', formulaVenc:'ref', formulaDesc:'', compoeHE:false, compoeIRRF:true, compoeINSS:true, compoeFGTS:true
  });
  localStorage.setItem('cfg_verbas', JSON.stringify(configVerbas));
  renderConfigVerbas();
  if (typeof configVerbas !== 'undefined') {
  renderQuickAddButtons();
}
}

function delConfigVerba(i) {
  if(!confirm('Remover esta verba?')) return;
  configVerbas.splice(i,1);
  localStorage.setItem('cfg_verbas', JSON.stringify(configVerbas));
  renderConfigVerbas();
  renderQuickList();
  syncQuickAddButtons();
}

function syncQuickAddButtons() {
  renderQuickAddButtons();
}

function quickAddConfig(id) {
  const cfg = configVerbas.find(v=>v.id===id);
  if(!cfg) return;
  verbas.push({
    id: Date.now(), cod:cfg.cod, desc:cfg.desc,
    ref:'', venc:0, desc2:0,
    auto: !!(cfg.formulaVenc||cfg.formulaDesc),
    autoType: cfg.id, tipo: cfg.tipo,
    incideIRRF: typeof cfg.compoeIRRF === 'boolean' ? cfg.compoeIRRF : cfg.tipo !== 'desc',
    incideINSS: typeof cfg.compoeINSS === 'boolean' ? cfg.compoeINSS : cfg.tipo !== 'desc',
    incideFGTS: typeof cfg.compoeFGTS === 'boolean' ? cfg.compoeFGTS : cfg.tipo !== 'desc',
    formulaVenc: cfg.formulaVenc, formulaDesc: cfg.formulaDesc,
    refLabel: cfg.refLabel
  });
  calc();
}

// sobrescreve calcVerba para usar fórmulas configuráveis
function calcVerba(v, sal, salDia, salHora, valDias) {
  let venc = 0, desc = 0;
  const ref = parseFloat(v.ref)||0;
  const horasMes = configParams.horasMes||220;
  const salHoraCalc = sal / horasMes;
  const diasTrab = parseFloat(document.getElementById('f-dias').value) || 0;
  const diasMes = parseFloat(document.getElementById('f-diasmes').value) || 30;
  const diasUteis = parseFloat(document.getElementById('f-diasuteis').value) || 0;
  const diasDSR = parseFloat(document.getElementById('f-diasdsr').value) || 0;
  const totalHE = verbas
    .filter(h => {
      if (h.autoType === 'he50' || h.autoType === 'he100') return true;
      const cfgHE = configVerbas.find(c => c.id === h.autoType);
      return !!(cfgHE && cfgHE.compoeHE);
    })
    .reduce((sum, h) => {
      const valorVenc = parseFloat(h.venc) || 0;
      if (valorVenc > 0) return sum + valorVenc;
      const refHE = parseFloat(h.ref) || 0;
      if (h.autoType === 'he50') return sum + (refHE * salHoraCalc * (configParams.he50Mult || 1.5));
      if (h.autoType === 'he100') return sum + (refHE * salHoraCalc * (configParams.he100Mult || 2));
      return sum;
    }, 0);
  const cfg = configVerbas.find(c=>c.id===v.autoType);

  switch(v.autoType) {

    case 'diasnormais':
      return { venc: roundFiscal(valDias), desc: 0 };

    case 'he50':
      return { venc: roundFiscal(ref * salHoraCalc * (configParams.he50Mult||1.5)), desc: 0 };

    case 'he100':
      return { venc: roundFiscal(ref * salHoraCalc * (configParams.he100Mult||2.0)), desc: 0 };

    case 'dsrhe':
      // mantém fórmula padrão se a verba DSR estiver sem fórmula configurada
      if(!cfg || (!cfg.formulaVenc && !cfg.formulaDesc)) {
        if (!diasTrab || totalHE === 0) {
          return { venc: 0, desc: 0 };
        }
        const dsr = (totalHE / diasTrab) * (diasMes - diasTrab);
        return { venc: roundFiscal(dsr), desc: 0 };
      }
      break;
  }

  // verbas configuráveis
  if(cfg) {
    const sanitizeFormula = (raw) => String(raw || '')
      .trim()
      .replace(/^return\s+/i, '')
      .replace(/;+$/g, '')
      .trim();

    const runFormula = (formula) => {
      const exp = sanitizeFormula(formula);
      if (!exp) return 0;
      try {
        const fn = Function('sal','salHora','salDia','ref','valDias','diasTrab','diasMes','diasUteis','diasDSR','totalHE', `return (${exp});`);
        return fn(sal, salHoraCalc, salDia, ref, valDias, diasTrab, diasMes, diasUteis, diasDSR, totalHE) || 0;
      } catch (e) {
        return 0;
      }
    };

    venc = runFormula(cfg.formulaVenc);
    desc = runFormula(cfg.formulaDesc);
    return { venc: roundFiscal(venc), desc: roundFiscal(desc) };
  }

  // legado
  switch(v.autoType) {
    case 'adicfunc':
      venc = sal*(parseFloat(v.ref)||0)/100;
      break;

    case 'premiotempo':
      venc = sal*(parseFloat(v.ref)||0)/100;
      break;

    case 'adiant':
      desc = parseFloat(v.ref)||0;
      break;
  }

  return { venc: roundFiscal(venc), desc: roundFiscal(desc) };
}

  
function alterarSenha() {
  const atual = localStorage.getItem('cfg_senha') || '1234';
  const confirmAtual = prompt('Digite a senha atual:');
  if (confirmAtual === null) return;
  if (confirmAtual !== atual) { toast('Senha atual incorreta!', 'err'); return; }
  const nova = prompt('Digite a nova senha:');
  if (!nova || nova.trim() === '') { toast('Senha não pode ser vazia!', 'err'); return; }
  const confirma = prompt('Confirme a nova senha:');
  if (nova !== confirma) { toast('Senhas não conferem!', 'err'); return; }
  localStorage.setItem('cfg_senha', nova);
  toast('Senha alterada com sucesso!');
}

// ── ADMIN ──
let adminData = { recibos: [], grupos: [], empresas: [] };

async function showAdmin() {
  if (!currentUser?.isAdmin) return;
  ['pg-main','pg-hist','pg-config','pg-empresas'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pg-admin').style.display = 'block';
  document.getElementById('admin-hist-grid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--ink3)">Carregando...</div>';

  try {
    // carrega todos os dados
    const [recibos, grupos, empresas] = await Promise.all([
      sbFetch('recibos?select=*&order=saved_at.desc'),
      sbFetch('grupos?select=*&order=nome.asc'),
      sbFetch('empresas?select=*&order=nome.asc'),
    ]);
    adminData = { recibos: recibos||[], grupos: grupos||[], empresas: empresas||[] };

    // popula filtros
    const selUser = document.getElementById('admin-filter-user');
    selUser.innerHTML = '<option value="">Todos os usuários</option>';
    grupos.forEach(g => {
      selUser.innerHTML += `<option value="${g.user_id}">${g.nome}</option>`;
    });

    const selEmp = document.getElementById('admin-filter-emp');
    selEmp.innerHTML = '<option value="">Todas as empresas</option>';
    empresas.forEach(e => {
      selEmp.innerHTML += `<option value="${e.id}">${e.nome}</option>`;
    });

    adminRenderStats();
    adminRenderRecibos(recibos);
  } catch(e) {
    toast('Erro ao carregar dados: ' + e.message, 'err');
  }
}

function adminFiltrar() {
  const userId = document.getElementById('admin-filter-user').value;
  const empId  = document.getElementById('admin-filter-emp').value;
  let lista = [...adminData.recibos];
  if (userId) lista = lista.filter(r => r.user_id === userId);
  if (empId)  lista = lista.filter(r => r.dados?.emp === adminData.empresas.find(e=>e.id===empId)?.nome);
  adminRenderRecibos(lista);
}

function adminRenderStats() {
  const { recibos, grupos } = adminData;
  const totalLiq = recibos.reduce((s,r) => s+(r.liq||0), 0);
  document.getElementById('admin-stats').innerHTML = `
    <div class="total-box" style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem">
      <label style="font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);display:block;margin-bottom:.25rem">Total de Usuários</label>
      <div style="font-size:1.5rem;font-weight:700;font-family:'Inconsolata',monospace">${grupos.length}</div>
    </div>
    <div class="total-box" style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem">
      <label style="font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);display:block;margin-bottom:.25rem">Total de Recibos</label>
      <div style="font-size:1.5rem;font-weight:700;font-family:'Inconsolata',monospace">${recibos.length}</div>
    </div>
    <div class="total-box" style="background:var(--ink);border-radius:8px;padding:.75rem 1rem">
      <label style="font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.5);display:block;margin-bottom:.25rem">Total Valor Líquido</label>
      <div style="font-size:1.2rem;font-weight:700;font-family:'Inconsolata',monospace;color:#7dd3fc">${fmtBRL(totalLiq)}</div>
    </div>
  `;
}

function adminRenderRecibos(lista) {
  const g = document.getElementById('admin-hist-grid');
  if (!lista.length) {
    g.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--ink3)">Nenhum recibo encontrado.</div>';
    return;
  }
  // encontra grupo de cada recibo
  g.innerHTML = lista.map(r => {
    const grupo = adminData.grupos.find(g => g.user_id === r.user_id);
    return `
    <div class="hcard">
      <div style="font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:.25rem">👤 ${grupo?.nome || r.user_id || '—'}</div>
      <div class="hc-emp">${r.emp||'—'}</div>
      <div class="hc-func">${r.func||'—'} · ${r.cargo||'—'}</div>
      <div class="hc-comp">${r.comp||'—'} · ${r.folha||'—'}</div>
      <div class="hc-foot">
        <span class="hc-liq">${fmtBRL(r.liq||0)}</span>
        <span style="font-size:.7rem;color:var(--ink3)">${fmtBRL(r.tot_venc||0)} bruto</span>
      </div>
      <div class="hc-acts">
        <button class="hcbtn d" onclick="adminDelRec('${r.id}')">✕ Excluir</button>
      </div>
    </div>`;
  }).join('');
}

async function adminDelRec(id) {
  if (!confirm('Excluir este recibo?')) return;
  try {
    await sbFetch('recibos?id=eq.' + id, { method: 'DELETE' });
    adminData.recibos = adminData.recibos.filter(r => r.id != id);
    adminRenderStats();
    adminFiltrar();
    toast('Recibo excluído!');
  } catch(e) {
    toast('Erro ao excluir!', 'err');
  }
}
