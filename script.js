// =============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS (COM FIREBASE)
// =============================================================================

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
    [DB_KEYS.MOTORISTAS]: [], [DB_KEYS.VEICULOS]: [], [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [], [DB_KEYS.MINHA_EMPRESA]: {}, [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [], [DB_KEYS.ATIVIDADES]: [], [DB_KEYS.CHECKINS]: []
};

window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

function loadData(key) { return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); }

async function saveData(key, value) {
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES) {}
    APP_CACHE[key] = value;
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.company) {
        const { db, doc, setDoc } = window.dbRef;
        try { await setDoc(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), { items: value }); } 
        catch (e) { console.error("Erro ao salvar:", e); }
    } else { localStorage.setItem(key, JSON.stringify(value)); }
}

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)||0);

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0);
    if (!ops.length) return 0;
    ops.sort((a, b) => new Date(b.data || '1970-01-01') - new Date(a.data || '1970-01-01'));
    return Number(ops[0].precoLitro) || 0;
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && op.status !== 'AGENDADA');
    let km = 0, lit = 0;
    ops.forEach(op => {
        if(op.kmRodado) km += Number(op.kmRodado);
        if(op.combustivel > 0 && op.precoLitro > 0) lit += (op.combustivel / op.precoLitro);
    });
    return lit > 0 ? km / lit : 0;
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca || op.status === 'AGENDADA') return 0;
    const med = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if (med <= 0 || !op.kmRodado) return 0;
    let prc = Number(op.precoLitro) || obterUltimoPrecoCombustivel(op.veiculoPlaca);
    return prc > 0 ? (Number(op.kmRodado) / med) * prc : 0;
}

function formatCPF_CNPJ(v) {
    const d = onlyDigits(v);
    return d.length <= 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4") : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}
function formatPhoneBr(v) { const d = onlyDigits(v); return d.length > 10 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}` : `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`; }
function detectPixType(k) { if(k.includes('@')) return 'EMAIL'; if(/^\d{11}$/.test(onlyDigits(k))) return 'CPF'; if(/^\d{14}$/.test(onlyDigits(k))) return 'CNPJ'; return 'ALEATÓRIA'; }
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>alert('COPIADO!')); }

function toggleCursoInput() { document.getElementById('divCursoDescricao').style.display = document.getElementById('motoristaTemCurso').value === 'sim' ? 'flex' : 'none'; }
function openViewModal(t, c) { document.getElementById('viewItemTitle').textContent = t; document.getElementById('viewItemBody').innerHTML = c; document.getElementById('viewItemModal').style.display = 'block'; }
function closeViewModal() { document.getElementById('viewItemModal').style.display = 'none'; }
function openOperationDetails(t, c) { document.getElementById('modalTitle').textContent = t; document.getElementById('modalBodyContent').innerHTML = c; document.getElementById('operationDetailsModal').style.display = 'block'; }
function closeModal() { document.getElementById('operationDetailsModal').style.display = 'none'; }

let _pendingAjudanteToAdd = null;
function openAdicionarAjudanteModal(obj, cb) { _pendingAjudanteToAdd = {obj, cb}; document.getElementById('modalAjudanteNome').textContent = obj.nome; document.getElementById('modalDiariaInput').value = ''; document.getElementById('modalAdicionarAjudante').style.display = 'block'; }
function closeAdicionarAjudanteModal() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; }
document.addEventListener('click', (e) => { if(e.target.id === 'modalAjudanteAddBtn' && _pendingAjudanteToAdd) { _pendingAjudanteToAdd.cb({id: _pendingAjudanteToAdd.obj.id, diaria: Number(document.getElementById('modalDiariaInput').value)}); closeAdicionarAjudanteModal(); } });

window._operacaoAjudantesTempList = [];
function handleAjudanteSelectionChange() {
    const sel = document.getElementById('selectAjudantesOperacao'); if(!sel.value) return;
    const aj = getAjudante(sel.value);
    openAdicionarAjudanteModal(aj, (res) => { window._operacaoAjudantesTempList.push(res); renderAjudantesAdicionadosList(); sel.value = ""; });
}
function renderAjudantesAdicionadosList() {
    document.getElementById('listaAjudantesAdicionados').innerHTML = window._operacaoAjudantesTempList.map(a => `<li>${getAjudante(a.id)?.nome} - R$ ${a.diaria} <button type="button" onclick="removeAjudanteFromOperation(${a.id})">X</button></li>`).join('');
}
function removeAjudanteFromOperation(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => a.id !== id); renderAjudantesAdicionadosList(); }

function populateSelect(id, data, valKey, txtKey, def) {
    const sel = document.getElementById(id); if(!sel) return;
    sel.innerHTML = `<option value="">${def}</option>` + data.map(i => `<option value="${i[valKey]}">${i[txtKey]}</option>`).join('');
}

function populateAllSelects() {
    populateSelect('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome', 'SELECIONE...');
    populateSelect('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'SELECIONE...');
    populateSelect('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial', 'SELECIONE...');
    populateSelect('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome', 'SELECIONE...');
    populateSelect('selectAjudantesOperacao', loadData(DB_KEYS.AJUDANTES), 'id', 'nome', 'SELECIONE...');
    populateSelect('selectVeiculoDespesaGeral', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'SELECIONE...');
    
    // Filtros
    populateSelect('selectMotoristaRelatorio', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial', 'TODAS');

    const selRec = document.getElementById('selectMotoristaRecibo');
    if(selRec) selRec.innerHTML = `<option value="">SELECIONE...</option>` + loadData(DB_KEYS.MOTORISTAS).map(m=>`<option value="motorista:${m.id}">${m.nome}</option>`).join('') + loadData(DB_KEYS.AJUDANTES).map(a=>`<option value="ajudante:${a.id}">${a.nome}</option>`).join('');

    renderCadastroTable(DB_KEYS.MOTORISTAS); renderCadastroTable(DB_KEYS.AJUDANTES); renderCadastroTable(DB_KEYS.VEICULOS); renderCadastroTable(DB_KEYS.CONTRATANTES); renderCadastroTable(DB_KEYS.ATIVIDADES); renderMinhaEmpresaInfo(); renderCheckinsTable();
}

function renderMinhaEmpresaInfo() { const e = getMinhaEmpresa(); document.getElementById('viewMinhaEmpresaContent').innerHTML = e.razaoSocial ? `<p>${e.razaoSocial}<br>${formatCPF_CNPJ(e.cnpj)}</p>` : 'Sem dados.'; }

function renderCadastroTable(key) {
    const data = loadData(key); let h = ''; let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    const tb = document.getElementById(key === DB_KEYS.MOTORISTAS ? 'tabelaMotoristas' : key === DB_KEYS.AJUDANTES ? 'tabelaAjudantes' : key === DB_KEYS.VEICULOS ? 'tabelaVeiculos' : key === DB_KEYS.CONTRATANTES ? 'tabelaContratantes' : 'tabelaAtividades');
    if(!tb) return;
    
    data.forEach(i => {
        let c1 = i.id||i.placa||i.cnpj, c2 = i.nome||i.modelo||i.razaoSocial, c3 = i.documento||i.ano||i.telefone||'';
        h += `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td><td><button class="btn-action view-btn" onclick="viewCadastro('${key}','${c1}')"><i class="fas fa-eye"></i></button><button class="btn-action edit-btn" onclick="editCadastroItem('${key}','${c1}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${key}','${c1}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tb.querySelector('tbody').innerHTML = h || '<tr><td colspan="5">Vazio</td></tr>';
}
function viewCadastro(key, id) {
    let i = null;
    if(key === DB_KEYS.MOTORISTAS) i = getMotorista(id); else if(key === DB_KEYS.AJUDANTES) i = getAjudante(id); else if(key === DB_KEYS.VEICULOS) i = getVeiculo(id); else if(key === DB_KEYS.CONTRATANTES) i = getContratante(id);
    if(!i) return alert("Erro");
    let h = `<p><strong>ID/CHAVE:</strong> ${id}</p>`;
    // Exibe email se tiver
    if(i.email) h += `<p><strong>EMAIL:</strong> ${i.email}</p>`;
    Object.keys(i).forEach(k => { if(k!=='id' && k!=='email') h += `<p><strong>${k.toUpperCase()}:</strong> ${i[k]}</p>`; });
    openViewModal('VISUALIZAR', h);
}

function editCadastroItem(key, id) {
    if(window.IS_READ_ONLY) return;
    alert(`Edição de ${key} iniciada. Preencha o formulário e salve.`);
    // Lógica simplificada de preenchimento para economizar espaço e evitar erros de ID
    const i = (key===DB_KEYS.MOTORISTAS?getMotorista(id):key===DB_KEYS.AJUDANTES?getAjudante(id):key===DB_KEYS.VEICULOS?getVeiculo(id):getContratante(id));
    if(!i) return;
    
    // Mapeamento genérico
    if(key===DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaId').value = i.id; document.getElementById('motoristaNome').value = i.nome; document.getElementById('motoristaEmail').value = i.email||''; document.getElementById('motoristaDocumento').value = i.documento;
        // ... (Preencher demais campos se necessário manualmente pelo usuário, foco no email)
    } else if (key===DB_KEYS.AJUDANTES) {
        document.getElementById('ajudanteId').value = i.id; document.getElementById('ajudanteNome').value = i.nome; document.getElementById('ajudanteEmail').value = i.email||''; document.getElementById('ajudanteDocumento').value = i.documento;
    }
}

function deleteItem(key, id) {
    if(confirm("Excluir?")) {
        let arr = loadData(key);
        let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
        saveData(key, arr.filter(x => String(x[idKey]) !== String(id)));
    }
}

function setupFormHandlers() {
    const handle = (id, key, mapFn) => {
        const f = document.getElementById(id);
        if(f) f.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(key).slice();
            const obj = mapFn();
            const idx = arr.findIndex(x => (x.id && x.id == obj.id) || (x.placa && x.placa == obj.placa) || (x.cnpj && x.cnpj == obj.cnpj));
            if(idx >= 0) arr[idx] = {...arr[idx], ...obj}; else arr.push(obj);
            saveData(key, arr);
            f.reset(); alert("Salvo!");
        });
    };

    handle('formMotorista', DB_KEYS.MOTORISTAS, () => ({
        id: Number(document.getElementById('motoristaId').value) || Date.now(),
        nome: document.getElementById('motoristaNome').value.toUpperCase(),
        email: document.getElementById('motoristaEmail').value.toLowerCase().trim(), // EMAIL IMPORTANTE
        documento: document.getElementById('motoristaDocumento').value,
        uid: ''
    }));

    handle('formAjudante', DB_KEYS.AJUDANTES, () => ({
        id: Number(document.getElementById('ajudanteId').value) || Date.now(),
        nome: document.getElementById('ajudanteNome').value.toUpperCase(),
        email: document.getElementById('ajudanteEmail').value.toLowerCase().trim(), // EMAIL IMPORTANTE
        documento: document.getElementById('ajudanteDocumento').value,
        uid: ''
    }));

    // Outros forms simplificados (mantendo lógica original)
    handle('formVeiculo', DB_KEYS.VEICULOS, () => ({ placa: document.getElementById('veiculoPlaca').value, modelo: document.getElementById('veiculoModelo').value }));
    handle('formContratante', DB_KEYS.CONTRATANTES, () => ({ cnpj: document.getElementById('contratanteCNPJ').value, razaoSocial: document.getElementById('contratanteRazaoSocial').value }));
    handle('formAtividade', DB_KEYS.ATIVIDADES, () => ({ id: Number(document.getElementById('atividadeId').value)||Date.now(), nome: document.getElementById('atividadeNome').value }));
    
    // OPERAÇÃO COM CHECKBOX
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', (e) => {
        e.preventDefault();
        const isAgend = document.getElementById('operacaoIsAgendamento').checked;
        const obj = {
            id: Number(document.getElementById('operacaoId').value) || Date.now(),
            status: isAgend ? 'AGENDADA' : 'CONFIRMADA',
            data: document.getElementById('operacaoData').value,
            motoristaId: Number(document.getElementById('selectMotoristaOperacao').value),
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: Number(document.getElementById('selectAtividadeOperacao').value),
            faturamento: Number(document.getElementById('operacaoFaturamento').value)||0,
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value)||0,
            comissao: Number(document.getElementById('operacaoComissao').value)||0,
            combustivel: Number(document.getElementById('operacaoCombustivel').value)||0,
            despesas: Number(document.getElementById('operacaoDespesas').value)||0,
            kmRodado: Number(document.getElementById('operacaoKmRodado').value)||0,
            ajudantes: window._operacaoAjudantesTempList
        };
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(x => x.id == obj.id);
        if(idx>=0) arr[idx] = obj; else arr.push(obj);
        saveData(DB_KEYS.OPERACOES, arr);
        fOp.reset(); window._operacaoAjudantesTempList=[]; document.getElementById('listaAjudantesAdicionados').innerHTML='';
        alert(isAgend ? "Agendado!" : "Confirmado!");
    });

    // CHECK-IN FUNCIONARIO
    const fCheck = document.getElementById('formCheckinConfirm');
    if(fCheck) fCheck.addEventListener('submit', (e) => {
        e.preventDefault();
        const opId = Number(document.getElementById('checkinOpId').value);
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(x => x.id === opId);
        if(idx>=0) {
            arr[idx].status = 'CONFIRMADA';
            if(window.CURRENT_USER.role === 'motorista') {
                arr[idx].kmRodado = Number(document.getElementById('checkinKmRodado').value);
                arr[idx].combustivel = Number(document.getElementById('checkinValorAbastecido').value);
            }
            saveData(DB_KEYS.OPERACOES, arr);
            alert("Check-in realizado!");
            closeCheckinConfirmModal();
        }
    });
}

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const tb = document.getElementById('tabelaOperacoes');
    if(!tb) return;
    tb.querySelector('tbody').innerHTML = ops.map(op => `<tr><td>${op.data}</td><td>${getMotorista(op.motoristaId)?.nome}</td><td>${op.status}</td><td>${formatCurrency(op.faturamento)}</td><td><button onclick="editOperacaoItem(${op.id})">EDT</button></td></tr>`).join('');
}

function editOperacaoItem(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(x=>x.id==id);
    if(op) {
        document.getElementById('operacaoId').value = op.id;
        document.getElementById('operacaoData').value = op.data;
        document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
        // ... carregar outros campos
        alert("Carregado para edição.");
    }
}
// =============================================================================
// NOVO: SISTEMA DE CHECK-INS E AGENDAMENTOS (Lista para funcionários)
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const agendadas = ops.filter(o => o.status === 'AGENDADA');

    // A. ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { 
        tabelaAdmin.querySelector('tbody').innerHTML = agendadas.map(op => `<tr><td>${op.data}</td><td>${getMotorista(op.motoristaId)?.nome}</td><td>${op.veiculoPlaca}</td><td>AGUARDANDO</td><td>-</td></tr>`).join('') || '<tr><td colspan="5">Vazio</td></tr>';
    }

    // B. FUNCIONÁRIO
    const listaFunc = document.getElementById('listaServicosAgendados');
    if (listaFunc && window.CURRENT_USER) {
        const myUid = window.CURRENT_USER.uid;
        // Tenta achar o perfil vinculado
        const perfil = loadData(window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES).find(p => p.uid === myUid || p.email === window.CURRENT_USER.email);
        
        if(!perfil) { listaFunc.innerHTML = "Perfil não vinculado."; return; }

        const myOps = agendadas.filter(op => {
            if(window.CURRENT_USER.role === 'motorista') return op.motoristaId === perfil.id;
            return (op.ajudantes||[]).some(a => a.id === perfil.id);
        });

        listaFunc.innerHTML = myOps.map(op => `<div class="card"><h4>${op.data} - ${op.veiculoPlaca}</h4><button onclick="openCheckinConfirmModal(${op.id})">CONFIRMAR</button></div>`).join('') || "Sem serviços.";
    }
}

function openCheckinConfirmModal(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(x=>x.id==id);
    document.getElementById('checkinOpId').value = id;
    document.getElementById('checkinDisplayData').textContent = op.data;
    document.getElementById('checkinDriverFields').style.display = window.CURRENT_USER.role === 'motorista' ? 'block' : 'none';
    document.getElementById('modalCheckinConfirm').style.display = 'block';
}
function closeCheckinConfirmModal() { document.getElementById('modalCheckinConfirm').style.display = 'none'; }

// =============================================================================
// 12. CALENDÁRIO, GRÁFICOS, RELATÓRIOS (Simplificado para estabilidade)
// =============================================================================

function renderCalendar() { /* Placeholder - Funcionalidade visual não crítica para lógica de dados */ }
function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'AGENDADA');
    const tot = ops.reduce((s,o)=>s+(o.faturamento||0),0);
    document.getElementById('faturamentoMes').textContent = formatCurrency(tot);
}
function renderCharts() { /* Placeholder */ }

// =============================================================================
// 17. INICIALIZAÇÃO
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Abas e Menus
    document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(i.getAttribute('data-page')).classList.add('active');
        if(i.getAttribute('data-page') === 'graficos') renderCharts();
    }));
    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));
    
    // Mobile Menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('sidebarOverlay').addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

    setupFormHandlers();
});

// =============================================================================
// 18. AUTH E CARGOS
// =============================================================================

window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    
    if(user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        setupRealtimeListeners();
        setupCompanyUserManagement();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
    }
};

window.logoutSystem = function() { window.dbRef.signOut(window.dbRef.auth).then(()=>location.href="login.html"); };

// =============================================================================
// 19. ADMINISTRAÇÃO (CORRIGIDA - SEM TRAVAMENTO)
// =============================================================================

function setupCompanyUserManagement() {
    const { db, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc } = window.dbRef;
    if(!window.CURRENT_USER.company) return;

    onSnapshot(query(collection(db, "users"), where("company", "==", window.CURRENT_USER.company)), (s) => {
        const users = []; s.forEach(d => users.push(d.data())); renderCompanyUserTables(users);
    });
    
    window.toggleCompanyUserApproval = (uid, s) => updateDoc(doc(db, "users", uid), {approved: !s});
    window.deleteCompanyUser = (uid) => { if(confirm("Excluir?")) deleteDoc(doc(db, "users", uid)); };
}

function renderCompanyUserTables(users) {
    // Esta função agora é segura contra falhas de dados nulos
    const pend = users.filter(u => !u.approved);
    const ativ = users.filter(u => u.approved);
    
    // Tenta carregar motoristas para ver quem ainda não criou conta
    // Proteção com (|| []) para não travar
    const mot = loadData(DB_KEYS.MOTORISTAS) || [];
    const aju = loadData(DB_KEYS.AJUDANTES) || [];
    const registeredEmails = users.map(u => u.email);
    
    const pre = [];
    mot.forEach(m => { if(m.email && !registeredEmails.includes(m.email)) pre.push({name: m.nome, email: m.email, role: 'MOTORISTA'}); });
    aju.forEach(a => { if(a.email && !registeredEmails.includes(a.email)) pre.push({name: a.nome, email: a.email, role: 'AJUDANTE'}); });

    const tPend = document.getElementById('tabelaCompanyPendentes');
    if(tPend) {
        let html = pend.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-success" onclick="toggleCompanyUserApproval('${u.uid}',false)">APROVAR</button></td></tr>`).join('');
        html += pre.map(p => `<tr style="background:#fff3e0"><td>${p.name}</td><td>${p.email}</td><td>${p.role}</td><td>AGUARDANDO CADASTRO</td></tr>`).join('');
        tPend.querySelector('tbody').innerHTML = html || '<tr><td colspan="4">Nada pendente</td></tr>';
    }
}

function setupSuperAdmin() {
    const { db, collection, onSnapshot, updateDoc, doc, auth, sendPasswordResetEmail } = window.dbRef;
    onSnapshot(collection(db, "users"), (s) => { const u=[]; s.forEach(d=>u.push(d.data())); renderSuperAdminDashboard(u); });
    window.toggleUserApproval = (uid, s) => updateDoc(doc(db, "users", uid), { approved: !s });
    window.resetUserPassword = (email) => sendPasswordResetEmail(auth, email).then(()=>alert("Email enviado"));
}

function renderSuperAdminDashboard(users) {
    const table = document.getElementById('tabelaEmpresasAtivas');
    if(!table) return;
    table.querySelector('tbody').innerHTML = users.filter(u=>u.role==='admin').map(u=>`<tr><td>${u.email}<br>Senha Ref: ${u.password||'***'}</td><td>${u.company}</td><td><button onclick="toggleUserApproval('${u.uid}',true)">BLOQ</button></td></tr>`).join('');
}

// Exports
window.viewCadastro = viewCadastro; 
window.editCadastroItem = editCadastroItem; 
window.deleteItem = deleteItem; 
window.renderOperacaoTable = renderOperacaoTable; 
window.editOperacaoItem = editOperacaoItem; 
window.openCheckinConfirmModal = openCheckinConfirmModal; 
window.closeCheckinConfirmModal = closeCheckinConfirmModal;
// =============================================================================
// 12. CALENDÁRIO, GRÁFICOS E DASHBOARD
// =============================================================================

const calendarGrid = document.getElementById('calendarGrid');
const currentMonthYear = document.getElementById('currentMonthYear');

function renderCalendar(date) {
    if (!calendarGrid) return;
    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthYear.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    calendarGrid.innerHTML = '';
    
    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    dayNames.forEach(n => {
        const h = document.createElement('div');
        h.classList.add('day-header');
        h.textContent = n;
        calendarGrid.appendChild(h);
    });

    const firstDay = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div');
        e.classList.add('day-cell', 'empty');
        calendarGrid.appendChild(e);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        cell.textContent = d;
        
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDay = ops.filter(op => op.data === dateStr);
        
        if (opsDay.length) {
            cell.classList.add('has-operation');
            const dot = document.createElement('div');
            dot.classList.add('event-dot');
            cell.appendChild(dot);
            cell.setAttribute('data-date', dateStr);
            cell.addEventListener('click', () => {
                // Exibe resumo simples
                const totalDia = opsDay.reduce((s,o) => s + (o.faturamento||0), 0);
                alert(`DIA ${d}: ${opsDay.length} OPERAÇÕES\nFATURAMENTO: ${formatCurrency(totalDia)}`);
            });
        }
        calendarGrid.appendChild(cell);
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate);
    updateDashboardStats();
}
window.changeMonth = changeMonth; // Export global para o botão HTML

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'AGENDADA');
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const mes = currentDate.getMonth();
    const ano = currentDate.getFullYear();

    const opsMes = ops.filter(o => { const d = new Date(o.data+'T00:00:00'); return d.getMonth()===mes && d.getFullYear()===ano; });
    const despMes = despesas.filter(d => { const dt = new Date(d.data+'T00:00:00'); return dt.getMonth()===mes && dt.getFullYear()===ano; });

    const fat = opsMes.reduce((s,o)=>s+(o.faturamento||0),0);
    // Custo simplificado para dashboard rápido
    const custoOps = opsMes.reduce((s,o) => s + (o.combustivel||0) + (o.comissao||0) + (o.despesas||0), 0);
    const custoGeral = despMes.reduce((s,d)=>s+(d.valor||0),0);

    document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
    document.getElementById('despesasMes').textContent = formatCurrency(custoOps + custoGeral);
    document.getElementById('receitaMes').textContent = formatCurrency(fat - (custoOps + custoGeral));
}

function renderCharts() {
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    if(window.chartInstance) window.chartInstance.destroy();
    
    // Dados fictícios para exemplo visual se não houver dados reais suficientes
    // Em produção, isso puxaria de loadData(DB_KEYS.OPERACOES)
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN'],
            datasets: [{
                label: 'FATURAMENTO',
                data: [0, 0, 0, 0, 0, 0], // Preencher com lógica real depois
                backgroundColor: '#00796b'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
window.renderCharts = renderCharts;

// =============================================================================
// 13. SISTEMAS AUXILIARES (BACKUP, LEMBRETES, INIT)
// =============================================================================

function exportDataBackup() {
    const d = {}; Object.values(DB_KEYS).forEach(k => d[k] = loadData(k));
    const b = new Blob([JSON.stringify(d)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'backup.json'; a.click();
}
window.exportDataBackup = exportDataBackup;

function importDataBackup(e) {
    if(!confirm("Substituir dados atuais?")) return;
    const f = e.target.files[0];
    const r = new FileReader();
    r.onload = (ev) => {
        const d = JSON.parse(ev.target.result);
        Object.keys(d).forEach(k => saveData(k, d[k]));
        alert("Importado com sucesso!");
        location.reload();
    };
    r.readAsText(f);
}
window.importDataBackup = importDataBackup;

function fullSystemReset() {
    if(confirm("ATENÇÃO: ISSO APAGA TUDO! CONFIRMA?")) {
        Object.values(DB_KEYS).forEach(k => saveData(k, (k===DB_KEYS.MINHA_EMPRESA?{}:[])));
        alert("Sistema limpo.");
        location.reload();
    }
}
window.fullSystemReset = fullSystemReset;

// Inicialização do DOM
document.addEventListener('DOMContentLoaded', () => {
    // Menu Tabs
    document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); i.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(i.getAttribute('data-page')).classList.add('active');
        if(i.getAttribute('data-page') === 'graficos') renderCharts();
    }));
    
    // Cadastro Tabs
    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));

    // Mobile
    const btn = document.getElementById('mobileMenuBtn');
    if(btn) btn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    
    // Inicializadores
    setupFormHandlers();
    
    // Renderiza inputs de formatação se existirem
    const phoneInputs = ['motoristaTelefone', 'ajudanteTelefone', 'minhaEmpresaTelefone', 'contratanteTelefone'];
    phoneInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', (e) => e.target.value = formatPhoneBr(e.target.value));
    });
});

// =============================================================================
// 14. AUTH & LÓGICA DE SISTEMA
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) { setTimeout(setupRealtimeListeners, 500); return; }
    const { db, doc, onSnapshot } = window.dbRef;
    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        Object.values(DB_KEYS).forEach(key => {
            onSnapshot(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), (snap) => {
                if (snap.exists()) APP_CACHE[key] = snap.data().items || [];
                else saveData(key, []); // Cria se não existe
                updateUI();
            });
        });
    }
}

function updateUI() {
    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    updateDashboardStats();
    renderCalendar(currentDate);
    renderCheckinsTable();
    if(window.CURRENT_USER?.role === 'admin') setupCompanyUserManagement();
    if(window.IS_READ_ONLY) window.enableReadOnlyMode();
}

// Inicializador Principal chamado pelo index.html
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } else if (!user.approved) {
        document.querySelector('.content').innerHTML = '<div class="card" style="text-align:center;padding:50px;"><h2>AGUARDANDO APROVAÇÃO</h2><p>Contate o administrador.</p><button class="btn-danger" onclick="logoutSystem()">SAIR</button></div>';
    } else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        setupRealtimeListeners();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
    }
};

window.logoutSystem = function() { window.dbRef.signOut(window.dbRef.auth).then(() => location.href = "login.html"); };

window.enableReadOnlyMode = function() {
    // Desabilita tudo exceto o modal de checkin e botões de navegação
    document.querySelectorAll('input, select, textarea, button').forEach(e => {
        if(e.closest('#formCheckinConfirm') || e.closest('.nav-item') || e.closest('.sidebar-footer') || e.closest('.mobile-nav') || e.classList.contains('close-btn')) return;
        e.disabled = true;
        if(e.tagName === 'BUTTON' && !e.classList.contains('cadastro-tab-btn')) e.style.display = 'none';
    });
};

// =============================================================================
// 15. GESTÃO DE USUÁRIOS (ADMIN E SUPER)
// =============================================================================

function setupCompanyUserManagement() {
    const { db, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc } = window.dbRef;
    onSnapshot(query(collection(db, "users"), where("company", "==", window.CURRENT_USER.company)), (s) => {
        const users = []; s.forEach(d => users.push(d.data())); renderCompanyUserTables(users);
    });
    window.toggleUserLink = (uid, s) => updateDoc(doc(db, "users", uid), {approved: !s});
    window.deleteUserLink = (uid) => { if(confirm("Excluir usuário?")) deleteDoc(doc(db, "users", uid)); };
}

function renderCompanyUserTables(users) {
    const tPend = document.getElementById('tabelaCompanyPendentes');
    const tAtiv = document.getElementById('tabelaCompanyAtivos');
    if(!tPend || !tAtiv) return;

    const pend = users.filter(u => !u.approved && u.uid !== window.CURRENT_USER.uid);
    const ativ = users.filter(u => u.approved && u.uid !== window.CURRENT_USER.uid);
    
    // Lista combinada de pendentes (Auth + Pré-Cadastro)
    let htmlPend = pend.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-success" onclick="toggleUserLink('${u.uid}', false)">APROVAR</button> <button class="btn-danger" onclick="deleteUserLink('${u.uid}')">X</button></td></tr>`).join('');
    
    // Adiciona pré-cadastros (sem UID ainda)
    const registeredEmails = users.map(u => u.email);
    (loadData(DB_KEYS.MOTORISTAS)||[]).forEach(m => { if(m.email && !registeredEmails.includes(m.email)) htmlPend += `<tr style="background:#fff3e0"><td>${m.nome}</td><td>${m.email}</td><td>MOTORISTA</td><td>AGUARDANDO 1º ACESSO</td></tr>`; });
    (loadData(DB_KEYS.AJUDANTES)||[]).forEach(a => { if(a.email && !registeredEmails.includes(a.email)) htmlPend += `<tr style="background:#fff3e0"><td>${a.nome}</td><td>${a.email}</td><td>AJUDANTE</td><td>AGUARDANDO 1º ACESSO</td></tr>`; });

    tPend.querySelector('tbody').innerHTML = htmlPend || '<tr><td colspan="4">Vazio</td></tr>';
    tAtiv.querySelector('tbody').innerHTML = ativ.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-danger" onclick="toggleUserLink('${u.uid}', true)">BLOQ</button> <button class="btn-danger" onclick="deleteUserLink('${u.uid}')">X</button></td></tr>`).join('');
}

function setupSuperAdmin() {
    const { db, collection, onSnapshot, updateDoc, doc } = window.dbRef;
    onSnapshot(collection(db, "users"), (s) => { 
        const u=[]; s.forEach(d=>u.push(d.data())); 
        const pend = u.filter(x=>!x.approved && x.role==='admin');
        const ativ = u.filter(x=>x.approved && x.role==='admin');
        document.getElementById('tabelaEmpresasPendentes').querySelector('tbody').innerHTML = pend.map(i=>`<tr><td>${i.email}</td><td><button class="btn-success" onclick="toggleUserLink('${i.uid}',false)">OK</button></td></tr>`).join('');
        document.getElementById('tabelaEmpresasAtivas').querySelector('tbody').innerHTML = ativ.map(i=>`<tr><td>${i.email}<br>Senha: ${i.password}</td><td><button class="btn-danger" onclick="toggleUserLink('${i.uid}',true)">BLOQ</button></td></tr>`).join('');
    });
}