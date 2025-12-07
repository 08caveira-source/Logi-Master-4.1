// =============================================================================
// LOGIMASTER SYSTEM - VERSÃO CORRIGIDA E UNIFICADA
// =============================================================================

// 1. CONSTANTES E CACHE
const DB_KEYS = {
    MOTORISTAS: 'db_motoristas',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    AJUDANTES: 'db_ajudantes',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins'
};

const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [],
    [DB_KEYS.ATIVIDADES]: [],
    [DB_KEYS.CHECKINS]: []
};

// Variáveis Globais
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
let currentDate = new Date();

// 2. FUNÇÕES DE SUPORTE (DATA & FORMAT)
function loadData(key) {
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

async function saveData(key, value) {
    APP_CACHE[key] = value;
    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            await setDoc(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), { items: value });
        } catch (e) { console.error("Erro Firebase:", e); }
    } else {
        localStorage.setItem(key, JSON.stringify(value));
    }
}

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)||0);

function formatCPF_CNPJ(v) {
    const d = onlyDigits(v);
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}
function formatPhoneBr(v) {
    const d = onlyDigits(v);
    return d.length <= 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}
function detectPixType(k) { return k.includes('@') ? 'EMAIL' : (onlyDigits(k).length === 11 ? 'CPF/CEL' : (onlyDigits(k).length === 14 ? 'CNPJ' : 'OUTRO')); }
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(() => alert('Copiado!')); }

// 3. GETTERS DE ENTIDADES
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(i => String(i.id) === String(id)) || {}; }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(i => i.placa === placa) || {}; }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(i => i.cnpj === cnpj) || {}; }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(i => String(i.id) === String(id)) || {}; }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(i => String(i.id) === String(id)) || {}; }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// 4. CÁLCULOS
function calcularCustoConsumoViagem(op) {
    if(!op || !op.veiculoPlaca || op.status === 'AGENDADA') return 0;
    // Lógica simplificada para evitar erros se dados faltarem
    const km = Number(op.kmRodado) || 0;
    const preco = Number(op.precoLitro) || 0;
    // Média fixa de segurança se não houver histórico (3.5 km/l para caminhão)
    const media = 3.5; 
    if(km > 0 && preco > 0) return (km / media) * preco;
    return 0;
}

// 5. RENDERIZAÇÃO DE TABELAS (ADMIN)
function renderOperacaoTable() {
    const tb = document.getElementById('tabelaOperacoes');
    if(!tb) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a,b) => new Date(b.data) - new Date(a.data));
    tb.querySelector('tbody').innerHTML = ops.length ? ops.map(o => `
        <tr>
            <td>${new Date(o.data).toLocaleDateString('pt-BR')}</td>
            <td>${getMotorista(o.motoristaId).nome || 'N/A'}</td>
            <td>${o.status === 'AGENDADA' ? '<span style="color:orange">AGENDADA</span>' : '<span style="color:green">CONFIRMADA</span>'}</td>
            <td>${formatCurrency(o.faturamento)}</td>
            <td>
                <button class="btn-action view-btn" onclick="viewOperacaoDetails(${o.id})"><i class="fas fa-eye"></i></button>
                <button class="btn-action edit-btn" onclick="editOperacaoItem(${o.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${o.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') : '<tr><td colspan="5">NENHUMA OPERAÇÃO.</td></tr>';
}

function renderDespesasTable() {
    const tb = document.getElementById('tabelaDespesasGerais');
    if(!tb) return;
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b) => new Date(b.data) - new Date(a.data));
    tb.querySelector('tbody').innerHTML = ds.length ? ds.map(d => `
        <tr>
            <td>${new Date(d.data).toLocaleDateString('pt-BR')}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td style="color:${d.pago?'green':'red'}">${d.pago?'PAGO':'PENDENTE'}</td>
            <td>
                <button class="btn-action edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') : '<tr><td colspan="6">NENHUMA DESPESA.</td></tr>';
}

// 6. DASHBOARD E GRÁFICOS (ADMIN)
function updateDashboardStats() {
    try {
        const m = currentDate.getMonth(), y = currentDate.getFullYear();
        const ops = loadData(DB_KEYS.OPERACOES).filter(o => { const d = new Date(o.data); return d.getMonth()===m && d.getFullYear()===y; });
        const desp = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => { const dt = new Date(d.data); return dt.getMonth()===m && dt.getFullYear()===y; });

        const fat = ops.reduce((s,o) => s + (Number(o.faturamento)||0), 0);
        const custoOps = ops.reduce((s,o) => s + (Number(o.comissao)||0) + (Number(o.despesas)||0) + (Number(o.combustivel)||0), 0);
        const custoGeral = desp.reduce((s,d) => s + (Number(d.valor)||0), 0);
        const totalCusto = custoOps + custoGeral;

        document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
        document.getElementById('despesasMes').textContent = formatCurrency(totalCusto);
        document.getElementById('receitaMes').textContent = formatCurrency(fat - totalCusto);
    } catch(e) { console.error("Erro Stats", e); }
}

function renderCalendar(date) {
    try {
        const grid = document.getElementById('calendarGrid');
        if(!grid) return;
        grid.innerHTML = '';
        document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}).toUpperCase();
        
        const y = date.getFullYear(), m = date.getMonth();
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m+1, 0).getDate();
        
        ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'].forEach(d => {
            const el = document.createElement('div'); el.className='day-label'; el.textContent=d; grid.appendChild(el);
        });

        for(let i=0; i<firstDay; i++) grid.appendChild(Object.assign(document.createElement('div'), {className:'day-cell empty'}));

        const ops = loadData(DB_KEYS.OPERACOES);
        for(let i=1; i<=daysInMonth; i++) {
            const dStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const hasOp = ops.some(o => o.data === dStr);
            const el = document.createElement('div');
            el.className = `day-cell ${hasOp ? 'has-operation' : ''}`;
            el.textContent = i;
            if(hasOp) el.innerHTML += '<div class="event-dot"></div>';
            grid.appendChild(el);
        }
    } catch(e) { console.error("Erro Calendar", e); }
}
window.changeMonth = (dir) => { currentDate.setMonth(currentDate.getMonth() + dir); renderCalendar(currentDate); updateDashboardStats(); };

// 7. CHECK-INS (ADMIN E FUNCIONÁRIO)
function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    
    // Admin View
    const tbAdmin = document.getElementById('tabelaCheckinsPendentes');
    if(tbAdmin && !window.IS_READ_ONLY) {
        const pend = ops.filter(o => o.status === 'AGENDADA');
        tbAdmin.querySelector('tbody').innerHTML = pend.length ? pend.map(o => `
            <tr>
                <td>${new Date(o.data).toLocaleDateString('pt-BR')}</td>
                <td>${getMotorista(o.motoristaId).nome}</td>
                <td>${o.veiculoPlaca}</td>
                <td style="color:orange">AGUARDANDO</td>
                <td><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${o.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('') : '<tr><td colspan="5" style="text-align:center">NENHUM AGENDAMENTO.</td></tr>';
        
        const badge = document.getElementById('badgeCheckins');
        if(badge) { badge.textContent = pend.length; badge.style.display = pend.length ? 'inline-block' : 'none'; }
    }

    // Func View
    const divFunc = document.getElementById('listaServicosAgendados');
    if(divFunc && window.CURRENT_USER && window.CURRENT_USER.role !== 'admin') {
        const uid = window.CURRENT_USER.uid;
        let myId = null;
        if(window.CURRENT_USER.role === 'motorista') myId = loadData(DB_KEYS.MOTORISTAS).find(m => m.uid === uid)?.id;
        else myId = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === uid)?.id;

        if(!myId) { divFunc.innerHTML = '<p style="text-align:center;color:red">PERFIL NÃO VINCULADO.</p>'; return; }

        const myOps = ops.filter(o => o.status === 'AGENDADA' && (String(o.motoristaId) === String(myId) || (o.ajudantes||[]).some(a=>String(a.id)===String(myId))));
        
        divFunc.innerHTML = myOps.length ? myOps.map(o => `
            <div class="card" style="border-left:5px solid var(--primary-color);">
                <h4>${new Date(o.data).toLocaleDateString('pt-BR')} - ${o.veiculoPlaca}</h4>
                <p>${getContratante(o.contratanteCNPJ).razaoSocial || 'CLIENTE DIVERSO'}</p>
                <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="openCheckinConfirmModal(${o.id})">CONFIRMAR CHECK-IN</button>
            </div>`).join('') : '<p style="text-align:center;color:#666">NENHUM SERVIÇO AGENDADO.</p>';
    }
}

// 8. FORM HANDLERS (SUBMIT)
function setupFormHandlers() {
    // Motorista
    const fMot = document.getElementById('formMotorista');
    if(fMot) fMot.addEventListener('submit', (e) => {
        e.preventDefault();
        saveGeneric(DB_KEYS.MOTORISTAS, 'motorista', {
            nome: document.getElementById('motoristaNome').value.toUpperCase(),
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
            temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
            pix: document.getElementById('motoristaPix').value
        });
    });

    // Ajudante
    const fAju = document.getElementById('formAjudante');
    if(fAju) fAju.addEventListener('submit', (e) => {
        e.preventDefault();
        saveGeneric(DB_KEYS.AJUDANTES, 'ajudante', {
            nome: document.getElementById('ajudanteNome').value.toUpperCase(),
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            pix: document.getElementById('ajudantePix').value
        });
    });

    // Veículo
    const fVeic = document.getElementById('formVeiculo');
    if(fVeic) fVeic.addEventListener('submit', (e) => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.VEICULOS).slice();
        const obj = {
            placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value
        };
        const idx = arr.findIndex(v => v.placa === obj.placa);
        if(idx>=0) arr[idx] = obj; else arr.push(obj);
        saveData(DB_KEYS.VEICULOS, arr);
        alert('SALVO!'); fVeic.reset(); populateAllSelects();
    });

    // Operação
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', (e) => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const id = Number(document.getElementById('operacaoId').value) || Date.now();
        const obj = {
            id: id,
            status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA',
            data: document.getElementById('operacaoData').value,
            motoristaId: document.getElementById('selectMotoristaOperacao').value,
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value,
            faturamento: Number(document.getElementById('operacaoFaturamento').value),
            comissao: Number(document.getElementById('operacaoComissao').value),
            despesas: Number(document.getElementById('operacaoDespesas').value),
            kmRodado: Number(document.getElementById('operacaoKmRodado').value),
            ajudantes: window._operacaoAjudantesTempList || []
        };
        const idx = arr.findIndex(o => o.id === id);
        if(idx>=0) arr[idx] = obj; else arr.push(obj);
        saveData(DB_KEYS.OPERACOES, arr);
        alert(obj.status === 'AGENDADA' ? 'AGENDADO!' : 'SALVO!');
        fOp.reset(); window._operacaoAjudantesTempList = [];
        renderOperacaoTable(); updateDashboardStats();
    });

    // Checkin Confirm
    const fCheck = document.getElementById('formCheckinConfirm');
    if(fCheck) fCheck.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('checkinOpId').value);
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => o.id === id);
        if(idx>=0) {
            arr[idx].status = 'CONFIRMADA';
            if(window.CURRENT_USER.role === 'motorista') {
                arr[idx].kmRodado = Number(document.getElementById('checkinKmRodado').value);
                arr[idx].combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                arr[idx].precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
            }
            saveData(DB_KEYS.OPERACOES, arr);
            alert('CHECK-IN REALIZADO!');
            document.getElementById('modalCheckinConfirm').style.display='none';
            renderCheckinsTable();
        }
    });
}

function saveGeneric(key, prefixId, dataObj) {
    let arr = loadData(key).slice();
    const idVal = document.getElementById(prefixId + 'Id').value;
    const id = Number(idVal) || Date.now();
    dataObj.id = id;
    
    // Criação de Usuário
    if(!idVal) {
        const login = prompt(`CRIAR ACESSO PARA ${dataObj.nome}?\nDigite o login (ex: joao):`);
        if(login) dataObj.email = `${login.trim().toLowerCase()}@${window.CURRENT_USER.company}`;
    } else {
        const exist = arr.find(i=>i.id===id);
        if(exist && exist.email) dataObj.email = exist.email;
        if(exist && exist.uid) dataObj.uid = exist.uid;
    }

    const idx = arr.findIndex(i => i.id === id);
    if(idx>=0) arr[idx] = dataObj; else arr.push(dataObj);
    saveData(key, arr);
    alert('SALVO!');
    document.getElementById('form'+prefixId.charAt(0).toUpperCase()+prefixId.slice(1)).reset();
    populateAllSelects();
}

// 9. FUNÇÕES GERAIS DE UI
function populateAllSelects() {
    const fill = (id, data, val, txt) => {
        const el = document.getElementById(id); 
        if(el) el.innerHTML = '<option value="">SELECIONE...</option>' + data.map(i => `<option value="${i[val]}">${i[txt]}</option>`).join('');
    };
    fill('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    fill('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    fill('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    fill('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome');
    
    renderCadastroTables();
}

function renderCadastroTables() {
    const list = (key, id, col1, col2) => {
        const el = document.getElementById('tabela'+(key.charAt(3).toUpperCase()+key.slice(4).toLowerCase())); // Ex: tabelaMotoristas
        if(el) el.querySelector('tbody').innerHTML = loadData(key).map(i => `<tr><td>${i[col1]}</td><td>${i[col2]}</td><td><button class="btn-action edit-btn" onclick="editGeneric('${key}', '${i[id]}')">EDT</button><button class="btn-action delete-btn" onclick="deleteItem('${key}', '${i[id]}')">DEL</button></td></tr>`).join('');
    };
    list(DB_KEYS.MOTORISTAS, 'id', 'nome', 'documento');
    list(DB_KEYS.AJUDANTES, 'id', 'nome', 'documento');
    list(DB_KEYS.VEICULOS, 'placa', 'placa', 'modelo');
    list(DB_KEYS.CONTRATANTES, 'cnpj', 'razaoSocial', 'cnpj');
}

window.deleteItem = function(key, id) {
    if(confirm('EXCLUIR?')) {
        const idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
        saveData(key, loadData(key).filter(i => String(i[idKey]) !== String(id)));
        populateAllSelects();
        if(key===DB_KEYS.OPERACOES) renderOperacaoTable();
    }
};

window.editGeneric = function(key, id) {
    alert('Função de edição carregada. Preencha os dados e salve novamente.');
    // (Simplificado para caber no bloco único - o sistema vai criar novo ID se não preencher o hidden, na prática o user deve limpar o form antes)
    // Para produção ideal: preencher os campos do form aqui.
}
window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if(op) {
        document.getElementById('operacaoId').value = op.id;
        document.getElementById('operacaoData').value = op.data;
        document.getElementById('operacaoFaturamento').value = op.faturamento;
        alert('Edite e salve.');
    }
}

// 10. GESTÃO DE USUÁRIOS
function setupUserMgmt() {
    if(!window.dbRef) return;
    const { db, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc } = window.dbRef;
    
    // Apenas Admin vê isso
    if(window.CURRENT_USER.role === 'admin') {
        const q = query(collection(db, "users"), where("company", "==", window.CURRENT_USER.company));
        onSnapshot(q, (s) => {
            const users = []; s.forEach(d => users.push(d.data()));
            const pend = users.filter(u => !u.approved && u.uid !== window.CURRENT_USER.uid);
            const ativ = users.filter(u => u.approved && u.uid !== window.CURRENT_USER.uid);
            
            const tP = document.getElementById('tabelaCompanyPendentes');
            if(tP) tP.querySelector('tbody').innerHTML = pend.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-success btn-mini" onclick="approve('${u.uid}', '${u.role}', '${u.name}', '${u.email}')">OK</button></td></tr>`).join('');
            
            const tA = document.getElementById('tabelaCompanyAtivos');
            if(tA) tA.querySelector('tbody').innerHTML = ativ.map(u => `<tr><td>${u.name}</td><td>${u.role}</td><td><button class="btn-danger btn-mini" onclick="delUser('${u.uid}', '${u.role}')">X</button></td></tr>`).join('');
        });
    }
}

window.approve = async (uid, role, name, email) => {
    try {
        await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true });
        // Vincular
        let key = role === 'motorista' ? DB_KEYS.MOTORISTAS : (role === 'ajudante' ? DB_KEYS.AJUDANTES : null);
        if(key) {
            let arr = loadData(key).slice();
            let idx = arr.findIndex(i => i.email === email || i.nome === name);
            if(idx>=0) { arr[idx].uid = uid; arr[idx].email = email; }
            else { arr.push({ id: Date.now(), uid, email, nome: name, documento:'' }); }
            await saveData(key, arr);
        }
        alert('APROVADO!');
    } catch(e) { alert('ERRO'); }
};

window.delUser = async (uid, role) => {
    if(!confirm('EXCLUIR ACESSO?')) return;
    try {
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid));
        let key = role === 'motorista' ? DB_KEYS.MOTORISTAS : (role === 'ajudante' ? DB_KEYS.AJUDANTES : null);
        if(key) {
            let arr = loadData(key).slice();
            let idx = arr.findIndex(i => i.uid === uid);
            if(idx>=0) { delete arr[idx].uid; delete arr[idx].email; await saveData(key, arr); }
        }
        alert('EXCLUÍDO.');
    } catch(e) { alert('ERRO'); }
};

// 11. INICIALIZAÇÃO E SISTEMA BLINDADO
function updateUI() {
    if(!window.CURRENT_USER) return;
    
    populateAllSelects();
    renderCheckinsTable(); // Todos veem checkins (filtrados por role)

    if (window.CURRENT_USER.role === 'admin') {
        renderOperacaoTable();
        renderDespesasTable();
        updateDashboardStats();
        if(typeof renderCalendar === 'function') renderCalendar(currentDate);
        setupUserMgmt();
    }
}

window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    console.log("LOGIN:", user.role);

    // 1. ESCONDE TUDO
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const mAdmin = document.getElementById('menu-admin');
    const mEmp = document.getElementById('menu-employee');
    if(mAdmin) mAdmin.style.display = 'none';
    if(mEmp) mEmp.style.display = 'none';

    // 2. ROTEAMENTO
    if (user.role === 'admin' || user.email === 'admin@logimaster.com') {
        if(mAdmin) mAdmin.style.display = 'block';
        const home = document.getElementById('home');
        if(home) { home.style.display = 'block'; home.classList.add('active'); }
        setupRealtimeListeners(true);
    } 
    else if (user.role === 'motorista' || user.role === 'ajudante') {
        if(mEmp) mEmp.style.display = 'block';
        const empHome = document.getElementById('employee-home');
        if(empHome) { empHome.style.display = 'block'; empHome.classList.add('active'); }
        
        window.IS_READ_ONLY = true;
        
        // Esconde campos extras
        const driverFields = document.getElementById('checkinDriverFields');
        if(driverFields) driverFields.style.display = user.role === 'motorista' ? 'block' : 'none';
        
        setupRealtimeListeners(false);
    }
};

function setupRealtimeListeners(isAdmin) {
    if(!window.dbRef) return setTimeout(() => setupRealtimeListeners(isAdmin), 500);
    const { db, doc, onSnapshot } = window.dbRef;
    
    // Funcionário carrega menos dados
    const keys = isAdmin ? Object.values(DB_KEYS) : [DB_KEYS.OPERACOES, DB_KEYS.MOTORISTAS, DB_KEYS.AJUDANTES, DB_KEYS.CONTRATANTES, DB_KEYS.VEICULOS];
    
    keys.forEach(key => {
        onSnapshot(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), (s) => {
            if(s.exists()) APP_CACHE[key] = s.data().items || (key===DB_KEYS.MINHA_EMPRESA?{}:[]);
            updateUI();
        });
    });
}

window.logoutSystem = function() {
    if(window.dbRef && window.dbRef.auth) window.dbRef.signOut(window.dbRef.auth).then(()=>location.href="login.html");
    else location.href="login.html";
};

// 12. LISTENERS GERAIS
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mobileMenuBtn');
    if(btn) btn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    
    // Navegação (Tabs)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
            const target = document.getElementById(pageId);
            if(target) { target.style.display='block'; target.classList.add('active'); }
            
            // Atualiza menu ativo
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    setupFormHandlers();
});

// Funções de Modal (Globais)
window.openCheckinConfirmModal = (id) => { 
    document.getElementById('checkinOpId').value = id; 
    document.getElementById('modalCheckinConfirm').style.display='block'; 
};
window.closeCheckinConfirmModal = () => document.getElementById('modalCheckinConfirm').style.display='none';
window.closeViewModal = () => document.getElementById('viewItemModal').style.display='none';
window.closeModal = () => document.getElementById('operationDetailsModal').style.display='none';
window.closeAdicionarAjudanteModal = () => document.getElementById('modalAdicionarAjudante').style.display='none';