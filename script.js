// =============================================================================
// 1. CONFIGURAÇÕES GLOBAIS
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
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [], [DB_KEYS.VEICULOS]: [], [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [], [DB_KEYS.MINHA_EMPRESA]: {}, [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [], [DB_KEYS.ATIVIDADES]: [], [DB_KEYS.CHECKINS]: [],
    [DB_KEYS.PROFILE_REQUESTS]: []
};

window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// =============================================================================
// 2. FUNÇÕES ESSENCIAIS (IO, Formatadores)
// =============================================================================
function loadData(key) { return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); }

async function saveData(key, value) {
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES && key !== DB_KEYS.PROFILE_REQUESTS) return;
    APP_CACHE[key] = value;
    
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        try {
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', key), { items: value });
        } catch (e) { console.error("Erro save firebase:", e); }
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
    if (d.length > 10) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
}
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>alert("Copiado!"), ()=>alert("Erro ao copiar")); }
function detectPixType(k) { if(k.includes('@')) return 'EMAIL'; if(/^\d{11}$/.test(k)) return 'CPF'; return 'OUTRO'; }

// Getters Seguros
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(p) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === p); }
function getContratante(c) { return loadData(DB_KEYS.CONTRATANTES).find(x => x.cnpj === c); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 3. UI: TABELAS E MODAIS
// =============================================================================
function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey='placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey='cnpj'; }
    
    if(!tabela) return;
    
    let rows = data.map(item => {
        let c1 = item.id || item.placa || item.cnpj;
        let c2 = item.nome || item.modelo || item.razaoSocial;
        let c3 = item.documento || item.ano || item.telefone || '';
        let btns = `<button class="btn-action view-btn" onclick="viewCadastro('${key}','${c1}')"><i class="fas fa-eye"></i></button>`;
        if(!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editCadastroItem('${key}','${c1}')"><i class="fas fa-edit"></i></button>
                     <button class="btn-action delete-btn" onclick="deleteItem('${key}','${c1}')"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td><td>${btns}</td></tr>`;
    }).join('');
    
    tabela.querySelector('tbody').innerHTML = rows || '<tr><td colspan="4" style="text-align:center">Nenhum dado.</td></tr>';
}

function viewCadastro(key, id) {
    let item = null;
    if(key===DB_KEYS.MOTORISTAS) item = getMotorista(id);
    else if(key===DB_KEYS.AJUDANTES) item = getAjudante(id);
    else if(key===DB_KEYS.VEICULOS) item = getVeiculo(id);
    else if(key===DB_KEYS.CONTRATANTES) item = getContratante(id);
    
    if(!item) return;
    let html = `<div style="line-height:1.8">`;
    for(let k in item) html += `<b>${k.toUpperCase()}:</b> ${item[k]}<br>`;
    html += `</div>`;
    
    document.getElementById('viewItemTitle').textContent = "DETALHES";
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'block';
}
function closeViewModal() { document.getElementById('viewItemModal').style.display = 'none'; }

function editCadastroItem(key, id) {
    if(window.IS_READ_ONLY) return alert("Apenas leitura.");
    alert("Função de edição simplificada: Para editar, exclua e cadastre novamente com os dados corretos, ou contate o suporte.");
}

function deleteItem(key, id) {
    if(window.IS_READ_ONLY) return alert("Apenas leitura.");
    if(!confirm("Excluir item?")) return;
    let arr = loadData(key);
    let idKey = (key===DB_KEYS.VEICULOS)?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    arr = arr.filter(i => String(i[idKey]) !== String(id));
    saveData(key, arr);
    renderCadastroTable(key);
}
// =============================================================================
// 4. LÓGICA DE FORMULÁRIOS E OPERAÇÕES
// =============================================================================
function setupFormHandlers() {
    // MOTORISTA
    const fMot = document.getElementById('formMotorista');
    if(fMot) fMot.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.MOTORISTAS).slice();
        let obj = {
            id: Date.now(), // ID Simples
            nome: document.getElementById('motoristaNome').value.toUpperCase(),
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            pix: document.getElementById('motoristaPix').value,
            // Gera email automatico se nao existir
            email: document.getElementById('motoristaNome').value.split(' ')[0].toLowerCase() + '@' + window.CURRENT_USER.company
        };
        arr.push(obj);
        saveData(DB_KEYS.MOTORISTAS, arr);
        fMot.reset();
        alert(`Motorista Salvo! Login sugerido: ${obj.email}`);
        renderCadastroTable(DB_KEYS.MOTORISTAS);
    });

    // VEICULO, CONTRATANTE, AJUDANTE seguem lógica similar (simplificado aqui para caber, mas o seu html tem os IDs corretos)
    // O ideal é manter seus listeners originais se eles já estavam funcionando bem para esses cadastros básicos.
    // Vou focar na OPERAÇÃO que é complexa.

    // OPERAÇÃO
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        let obj = {
            id: Date.now(),
            status: isAgendamento ? 'AGENDADA' : 'CONFIRMADA',
            data: document.getElementById('operacaoData').value,
            motoristaId: document.getElementById('selectMotoristaOperacao').value,
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            faturamento: Number(document.getElementById('operacaoFaturamento').value)||0,
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value)||0,
            comissao: Number(document.getElementById('operacaoComissao').value)||0,
            combustivel: Number(document.getElementById('operacaoCombustivel').value)||0,
            despesas: Number(document.getElementById('operacaoDespesas').value)||0,
            kmRodado: Number(document.getElementById('operacaoKmRodado').value)||0,
            // Lista de ajudantes temporária
            ajudantes: window._operacaoAjudantesTempList || [],
            checkins: { motorista: false, ajudantes: [], ajudantesLog: {} }
        };
        arr.push(obj);
        saveData(DB_KEYS.OPERACOES, arr);
        fOp.reset();
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
        alert("Operação Salva!");
        renderOperacaoTable();
    });
}

// CHECK-IN (Lógica Corrigida com Hora)
const fCheck = document.getElementById('formCheckinConfirm');
if(fCheck) fCheck.addEventListener('submit', e => {
    e.preventDefault();
    if(!window.CURRENT_USER) return;
    
    const opId = document.getElementById('checkinOpId').value;
    let arr = loadData(DB_KEYS.OPERACOES).slice();
    let idx = arr.findIndex(o => String(o.id) === String(opId));
    
    if(idx >= 0) {
        let op = arr[idx];
        if(!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
        
        const agora = new Date().toISOString();
        let role = window.CURRENT_USER.role;
        let myUid = window.CURRENT_USER.uid;
        
        // Verifica Motorista
        if(role === 'motorista') {
            // Busca dados do motorista para comparar
            let mot = getMotorista(op.motoristaId);
            if(mot && (mot.uid === myUid || mot.email === window.CURRENT_USER.email)) {
                // Iniciar ou Finalizar
                if(op.status === 'AGENDADA') {
                    op.status = 'EM_ANDAMENTO';
                    op.kmInicial = Number(document.getElementById('checkinKmInicial').value);
                    op.dataHoraInicio = agora;
                    op.checkins.motorista = true;
                    alert("Viagem Iniciada!");
                } else {
                    op.status = 'CONFIRMADA';
                    op.kmFinal = Number(document.getElementById('checkinKmFinal').value);
                    alert("Viagem Finalizada!");
                }
            }
        } 
        // Verifica Ajudante
        else if (role === 'ajudante') {
            let aj = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === myUid || a.email === window.CURRENT_USER.email);
            if(aj && op.ajudantes.some(a => String(a.id) === String(aj.id))) {
                if(!op.checkins.ajudantes.includes(aj.id)) {
                    op.checkins.ajudantes.push(aj.id);
                    if(!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
                    op.checkins.ajudantesLog[aj.id] = agora;
                    alert("Presença Confirmada!");
                }
            }
        }
        
        saveData(DB_KEYS.OPERACOES, arr);
        document.getElementById('modalCheckinConfirm').style.display = 'none';
        renderCheckinsTable();
    }
});

// Ajudantes Dinâmicos no Form
window._operacaoAjudantesTempList = [];
const selAj = document.getElementById('selectAjudantesOperacao');
if(selAj) selAj.addEventListener('change', () => {
    let id = selAj.value;
    if(!id) return;
    let aj = getAjudante(id);
    let val = prompt(`Valor da diária para ${aj.nome}?`, "0");
    window._operacaoAjudantesTempList.push({ id: aj.id, diaria: Number(val) });
    document.getElementById('listaAjudantesAdicionados').innerHTML = window._operacaoAjudantesTempList.map(x => `<li>${getAjudante(x.id).nome} - R$ ${x.diaria}</li>`).join('');
    selAj.value = "";
});

// Funções de Tabela de Operações
function renderOperacaoTable() {
    let ops = loadData(DB_KEYS.OPERACOES);
    let rows = ops.map(op => {
        let st = op.status === 'CONFIRMADA' ? '<span style="color:green">OK</span>' : '<span style="color:orange">PEND</span>';
        let mot = getMotorista(op.motoristaId)?.nome || '-';
        return `<tr><td>${op.data}</td><td>${mot}</td><td>${st}</td><td>${formatCurrency(op.faturamento)}</td>
        <td><button class="btn-mini" onclick="viewOperacaoDetails(${op.id})">VER</button></td></tr>`;
    }).join('');
    document.querySelector('#tabelaOperacoes tbody').innerHTML = rows || '<tr><td>Vazio</td></tr>';
}

window.openCheckinConfirmModal = function(opId) {
    document.getElementById('checkinOpId').value = opId;
    // Lógica simples de mostrar/esconder campos baseada no status
    let op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(opId));
    if(window.CURRENT_USER.role === 'motorista') {
        document.getElementById('checkinDriverFields').style.display = 'block';
        if(op.status === 'AGENDADA') {
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
        } else {
            document.getElementById('divKmInicial').style.display = 'none';
            document.getElementById('divKmFinal').style.display = 'block';
        }
    } else {
        document.getElementById('checkinDriverFields').style.display = 'none';
    }
    document.getElementById('modalCheckinConfirm').style.display = 'block';
}
window.closeCheckinConfirmModal = () => document.getElementById('modalCheckinConfirm').style.display = 'none';

// =============================================================================
// 5. VALIDAÇÕES E UI (MODAIS E VISUALIZAÇÃO)
// =============================================================================

function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCEU EM ${validade.toLocaleDateString('pt-BR')}!`);
    else if (diffDays <= 30) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VAI VENCER EM BREVE (${validade.toLocaleDateString('pt-BR')}).`);
}

function toggleCursoInput() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
}

function openViewModal(title, htmlContent) {
    const modal = document.getElementById('viewItemModal');
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    modal.style.display = 'block';
}

function closeViewModal() {
    document.getElementById('viewItemModal').style.display = 'none';
}

function openOperationDetails(title, htmlContent) {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('operationDetailsModal').style.display = 'none';
}

// =============================================================================
// 6. LÓGICA DE AJUDANTES (ADIÇÃO DINÂMICA)
// =============================================================================

let _pendingAjudanteToAdd = null;

function openAdicionarAjudanteModal(ajudanteObj, onAddCallback) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA: AÇÃO NÃO PERMITIDA.");
    _pendingAjudanteToAdd = {
        ajudanteObj,
        onAddCallback
    };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
}

function closeAdicionarAjudanteModal() {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) {
            closeAdicionarAjudanteModal();
            return;
        }
        const {
            ajudanteObj,
            onAddCallback
        } = _pendingAjudanteToAdd;
        onAddCallback({
            id: ajudanteObj.id,
            diaria: Number(val.toFixed(2))
        });
        closeAdicionarAjudanteModal();
    }
});

window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    if (window.IS_READ_ONLY) return;
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    const id = Number(sel.value);
    const already = (window._operacaoAjudantesTempList || []).some(a => Number(a.id) === id);
    if (already) {
        alert('ESTE AJUDANTE JÁ FOI ADICIONADO À LISTA.');
        sel.value = "";
        return;
    }
    const ajud = getAjudante(id);
    if (!ajud) return;
    openAdicionarAjudanteModal(ajud, (result) => {
        window._operacaoAjudantesTempList = window._operacaoAjudantesTempList || [];
        window._operacaoAjudantesTempList.push(result);
        renderAjudantesAdicionadosList();
        sel.value = "";
    });
}

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    const arr = window._operacaoAjudantesTempList || [];
    if (!arr.length) {
        list.innerHTML = '<li style="color:var(--secondary-color)">NENHUM AJUDANTE ADICIONADO.</li>';
        return;
    }
    const html = arr.map(a => {
        const ajud = getAjudante(a.id) || {};
        const btnDelete = window.IS_READ_ONLY ? '' : `<button class="btn-mini" type="button" style="margin-left:8px;" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button>`;
        return `<li>${ajud.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} ${btnDelete}</li>`;
    }).join('');
    list.innerHTML = html;
}

function removeAjudanteFromOperation(id) {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
}

// =============================================================================
// 7. SUPER ADMIN (CORRIGIDO)
// =============================================================================
function setupSuperAdmin() {
    if (!window.dbRef || !window.dbRef.getDocs) return; // Segurança extra
    const { db, collection, onSnapshot, query, updateDoc, doc, deleteDoc, where, getDocs } = window.dbRef;
    
    // Lista usuarios
    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });

    // Funções Globais
    window.toggleCompanyBlock = async (domain, block) => {
        if(!confirm((block?"Bloquear":"Desbloquear") + " empresa " + domain + "?")) return;
        let q = query(collection(db, "users"), where("company", "==", domain));
        let snap = await getDocs(q);
        snap.forEach(u => updateDoc(u.ref, { approved: !block }));
        alert("Feito.");
    };
    
    window.deleteCompanyData = async (domain) => {
        if(prompt("Digite o nome da empresa para confirmar EXCLUSÃO TOTAL:") !== domain) return;
        let q = query(collection(db, "users"), where("company", "==", domain));
        let snap = await getDocs(q);
        snap.forEach(u => deleteDoc(u.ref));
        alert("Empresa excluída.");
    };
}

function renderGlobalHierarchy(users) {
    let container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    let domains = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return;
        let d = u.company || 'outros';
        if(!domains[d]) domains[d] = [];
        domains[d].push(u);
    });

    let html = '';
    for(let dom in domains) {
        let us = domains[dom];
        html += `<div class="domain-block" style="border:1px solid #ccc; margin:10px; padding:10px;">
            <div onclick="this.nextElementSibling.classList.toggle('hidden')" style="cursor:pointer; font-weight:bold; display:flex; justify-content:space-between;">
                <span>+ ${dom.toUpperCase()} (${us.length})</span>
                <div>
                    <button class="btn-mini" onclick="event.stopPropagation(); toggleCompanyBlock('${dom}', true)">BLOQ</button>
                    <button class="btn-mini btn-danger" onclick="event.stopPropagation(); deleteCompanyData('${dom}')">DEL</button>
                </div>
            </div>
            <div class="hidden" style="margin-top:10px; padding-left:20px; border-left:2px solid #eee;">
                ${us.map(u => `
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span>${u.role === 'admin' ? '👑' : '👤'} ${u.email} (${u.name})</span>
                        <span style="color:${u.approved?'green':'red'}">${u.approved?'ATIVO':'BLOQ'}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    container.innerHTML = html || 'Sem dados.';
}

// =============================================================================
// 8. RENDERIZAÇÃO DE CHECK-INS E EQUIPE
// =============================================================================
function renderCheckinsTable() {
    let ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'CONFIRMADA');
    let tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    let listaMobile = document.getElementById('listaServicosAgendados');
    
    // Lógica Admin
    if(tbody) {
        tbody.innerHTML = ops.map(op => {
            let mot = getMotorista(op.motoristaId)?.nome || '?';
            let statusEq = `Mot: ${op.checkins?.motorista?'OK':'Pend'} | Aju: ${op.checkins?.ajudantes?.length||0}`;
            return `<tr><td>${op.data}</td><td>${op.veiculoPlaca}</td><td>${mot}</td><td>${statusEq}</td><td>${op.status}</td>
            <td><button class="btn-mini" onclick="iniciarRotaManual(${op.id})">AÇÃO</button></td></tr>`;
        }).join('') || '<tr><td>Vazio</td></tr>';
    }

    // Lógica Funcionário
    if(window.CURRENT_USER && listaMobile) {
        let myId = null;
        let role = window.CURRENT_USER.role;
        let dbUser = role==='motorista' ? loadData(DB_KEYS.MOTORISTAS) : loadData(DB_KEYS.AJUDANTES);
        let me = dbUser.find(u => u.email === window.CURRENT_USER.email);
        if(me) myId = me.id;

        let myOps = ops.filter(op => {
            if(role === 'motorista') return String(op.motoristaId) === String(myId);
            return (op.ajudantes||[]).some(a => String(a.id) === String(myId));
        });

        listaMobile.innerHTML = myOps.map(op => {
            // Visualização da Equipe
            let equipeHtml = '';
            if(role === 'motorista') {
                let nomesAju = (op.ajudantes||[]).map(a => getAjudante(a.id)?.nome).join(', ');
                equipeHtml = `<small>Equipe: ${nomesAju || 'Ninguém'}</small>`;
            } else {
                let nomeMot = getMotorista(op.motoristaId)?.nome || 'Sem motorista';
                equipeHtml = `<small>Motorista: ${nomeMot}</small>`;
            }

            return `<div class="card" style="border-left:4px solid #00796b">
                <h4>${op.data} - ${op.veiculoPlaca}</h4>
                <p>${getContratante(op.contratanteCNPJ)?.razaoSocial}</p>
                ${equipeHtml}
                <br>
                <button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})">ABRIR AÇÃO</button>
            </div>`;
        }).join('') || '<p>Sem serviços.</p>';
    }
}

window.iniciarRotaManual = function(id) {
    if(confirm("Forçar início?")) {
        let arr = loadData(DB_KEYS.OPERACOES);
        let op = arr.find(o => o.id == id);
        if(op) { op.status = 'EM_ANDAMENTO'; saveData(DB_KEYS.OPERACOES, arr); renderCheckinsTable(); }
    }
};

// =============================================================================
// 9. INICIALIZAÇÃO
// =============================================================================
function updateUI() {
    if(!window.CURRENT_USER) return;
    
    if(window.CURRENT_USER.email === 'admin@logimaster.com') {
        setupSuperAdmin();
        return;
    }

    // Carrega selects
    populateSelect('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    populateSelect('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome');
    populateSelect('selectAjudantesOperacao', loadData(DB_KEYS.AJUDANTES), 'id', 'nome');

    renderOperacaoTable();
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    // ... chame as outras renderizações conforme necessário
    renderCheckinsTable();
}

function populateSelect(id, data, valKey, textKey) {
    let s = document.getElementById(id);
    if(s) {
        s.innerHTML = '<option value="">Selecione...</option>' + data.map(i => `<option value="${i[valKey]}">${i[textKey]}</option>`).join('');
    }
}

// Setup Realtime (Listener)
function setupRealtime() {
    if(!window.dbRef) return setTimeout(setupRealtime, 500);
    if(window.CURRENT_USER && window.CURRENT_USER.company) {
        Object.values(DB_KEYS).forEach(k => {
            window.dbRef.onSnapshot(window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', k), s => {
                if(s.exists()) APP_CACHE[k] = s.data().items;
                updateUI();
            });
        });
    }
}

// Inicializador Principal chamado pelo index.html
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    
    // Esconde tudo e mostra o menu certo
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
        setupRealtime();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtime();
    }
};

// =============================================================================
// 10. FORM HANDLERS (SUBMISSÃO DE FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    // --- MOTORISTA ---
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            let emailGerado = null;
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const nomeInput = document.getElementById('motoristaNome').value.toUpperCase();

            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: joao.silva).\nO domínio será @${companyDomain}.`);
                if (!userLogin) {
                    alert("CADASTRO CANCELADO. É NECESSÁRIO DEFINIR UM USUÁRIO.");
                    return;
                }
                const cleanLogin = userLogin.trim().toLowerCase().replace(/\s+/g, '.');
                emailGerado = `${cleanLogin}@${companyDomain}`;
            }

            let existingEmail = null;
            if (idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            }

            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 101),
                nome: nomeInput,
                documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
                pix: document.getElementById('motoristaPix').value || '',
                email: emailGerado || existingEmail || ''
            };
            
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.MOTORISTAS, arr);
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            if (emailGerado) alert(`MOTORISTA SALVO! USUÁRIO: ${emailGerado}`);
            else alert('MOTORISTA ATUALIZADO.');
        });
    }

    // --- AJUDANTE ---
    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let emailGerado = null;
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const nomeInput = document.getElementById('ajudanteNome').value.toUpperCase();

            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: pedro.souza).\nO domínio será @${companyDomain}.`);
                if (!userLogin) {
                    alert("CADASTRO CANCELADO. É NECESSÁRIO DEFINIR UM USUÁRIO.");
                    return;
                }
                const cleanLogin = userLogin.trim().toLowerCase().replace(/\s+/g, '.');
                emailGerado = `${cleanLogin}@${companyDomain}`;
            }

            let existingEmail = null;
            if (idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            }

            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 201),
                nome: nomeInput,
                documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
                pix: document.getElementById('ajudantePix').value || '',
                email: emailGerado || existingEmail || ''
            };
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            if (emailGerado) alert(`AJUDANTE SALVO! USUÁRIO: ${emailGerado}`);
            else alert('AJUDANTE ATUALIZADO.');
        });
    }

    // --- VEÍCULO ---
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const obj = {
                placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: Number(document.getElementById('veiculoAno').value) || null,
                renavam: document.getElementById('veiculoRenavam').value.toUpperCase() || '',
                chassi: document.getElementById('veiculoChassi').value.toUpperCase() || ''
            };
            const idx = arr.findIndex(v => v.placa === placa);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', () => document.getElementById('veiculoId').value = '');
    }

    // --- CONTRATANTE ---
    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.CONTRATANTES).slice();
            const cnpj = document.getElementById('contratanteCNPJ').value;
            const obj = {
                cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value || ''
            };
            const idx = arr.findIndex(c => c.cnpj === cnpj);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', () => document.getElementById('contratanteId').value = '');
    }

    // --- ATIVIDADE ---
    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.ATIVIDADES).slice();
            const idHidden = document.getElementById('atividadeId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 1),
                nome: document.getElementById('atividadeNome').value.toUpperCase()
            };
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', () => document.getElementById('atividadeId').value = '');
    }

    // --- MINHA EMPRESA ---
    const formMinhaEmpresa = document.getElementById('formMinhaEmpresa');
    if (formMinhaEmpresa) {
        formMinhaEmpresa.addEventListener('submit', (e) => {
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj);
            alert('DADOS DA EMPRESA SALVOS.');
        });
    }

    // --- DESPESA GERAL ---
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
            const idHidden = document.getElementById('despesaGeralId').value;
            
            if (idHidden) {
                const idx = arr.findIndex(d => d.id == idHidden);
                if (idx >= 0) {
                     arr[idx].data = document.getElementById('despesaGeralData').value;
                     arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                     arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                     arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
                }
            } else {
                const dataBaseStr = document.getElementById('despesaGeralData').value;
                const veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                const descricaoBase = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
                const modoPagamento = document.getElementById('despesaModoPagamento').value;
                const formaPagamento = document.getElementById('despesaFormaPagamento').value; 
                let numParcelas = 1;
                let intervaloDias = 30;
                let parcelasJaPagas = 0;
                if (modoPagamento === 'parcelado') {
                    numParcelas = parseInt(document.getElementById('despesaParcelas').value) || 2; 
                    intervaloDias = parseInt(document.getElementById('despesaIntervaloDias').value) || 30;
                    const inputPagas = document.getElementById('despesaParcelasPagas');
                    if (inputPagas) parcelasJaPagas = parseInt(inputPagas.value) || 0;
                }
                const valorParcela = valorTotal / numParcelas;
                const [y_ini, m_ini, d_ini] = dataBaseStr.split('-').map(Number);
                const dataBase = new Date(y_ini, m_ini - 1, d_ini);
                for (let i = 0; i < numParcelas; i++) {
                    const id = arr.length ? Math.max(...arr.map(d => d.id)) + 1 : 1;
                    const dataObj = new Date(dataBase);
                    dataObj.setDate(dataBase.getDate() + (i * intervaloDias));
                    const y = dataObj.getFullYear();
                    const m = String(dataObj.getMonth() + 1).padStart(2, '0');
                    const d = String(dataObj.getDate()).padStart(2, '0');
                    const dataParcela = `${y}-${m}-${d}`;
                    const descFinal = numParcelas > 1 ? `${descricaoBase} (${i+1}/${numParcelas})` : descricaoBase;
                    const estaPaga = i < parcelasJaPagas;
                    arr.push({ id, data: dataParcela, veiculoPlaca, descricao: descFinal, valor: Number(valorParcela.toFixed(2)), modoPagamento, formaPagamento, pago: estaPaga });
                }
            }
            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            formDespesa.reset();
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            alert('DESPESA(S) SALVA(S).');
        });
        
        formDespesa.addEventListener('reset', () => {
            document.getElementById('despesaGeralId').value = '';
            setTimeout(toggleDespesaParcelas, 50);
        });
    }
    
    // --- [NOVO] SOLICITAÇÃO DE ALTERAÇÃO DE PERFIL (FUNCIONÁRIO) ---
    const formReq = document.getElementById('formRequestProfileChange');
    if (formReq) {
        formReq.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!window.CURRENT_USER) return;
            const role = window.CURRENT_USER.role;
            
            // Dados originais
            let dbKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
            let originalUser = loadData(dbKey).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
            
            if (!originalUser) return alert("Erro: Seu perfil não foi encontrado.");

            // Captura dados novos
            const newPhone = document.getElementById('reqEmpTelefone').value;
            const newPix = document.getElementById('reqEmpPix').value;
            const newCnh = document.getElementById('reqEmpCNH').value;
            const newValidade = document.getElementById('reqEmpValidadeCNH').value;

            // Cria lista de alterações
            let requests = loadData(DB_KEYS.PROFILE_REQUESTS) || [];
            let changes = [];

            // Compara e adiciona se mudou
            if (newPhone && newPhone !== originalUser.telefone) changes.push({ field: 'telefone', label: 'TELEFONE', old: originalUser.telefone, new: newPhone });
            if (newPix && newPix !== originalUser.pix) changes.push({ field: 'pix', label: 'CHAVE PIX', old: originalUser.pix, new: newPix });
            
            if (role === 'motorista') {
                if (newCnh && newCnh !== originalUser.cnh) changes.push({ field: 'cnh', label: 'CNH', old: originalUser.cnh, new: newCnh });
                if (newValidade && newValidade !== originalUser.validadeCNH) changes.push({ field: 'validadeCNH', label: 'VALIDADE CNH', old: originalUser.validadeCNH, new: newValidade });
            }

            if (changes.length === 0) return alert("Nenhuma alteração detectada em relação aos dados atuais.");

            changes.forEach(change => {
                requests.push({
                    id: Date.now() + Math.random(), // ID único
                    userId: originalUser.id,
                    userUid: window.CURRENT_USER.uid,
                    userName: originalUser.nome,
                    userRole: role,
                    field: change.field,
                    fieldLabel: change.label,
                    oldValue: change.old,
                    newValue: change.new,
                    status: 'PENDING',
                    requestDate: new Date().toISOString()
                });
            });

            saveData(DB_KEYS.PROFILE_REQUESTS, requests);
            
            document.getElementById('modalRequestProfileChange').style.display = 'none';
            alert("SOLICITAÇÃO ENVIADA COM SUCESSO!\n\nO Administrador analisará suas alterações.");
        });
    }
// --- OPERAÇÃO (ADMIN) ---
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const motId = document.getElementById('selectMotoristaOperacao').value;
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            
            if (motId) verificarValidadeCNH(motId);
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idHidden = document.getElementById('operacaoId').value;
            const ajudantesVisual = window._operacaoAjudantesTempList || [];
            
            // Se marcado como agendamento, cria como AGENDADA. Se não, já cria como CONFIRMADA.
            const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(o => o.id)) + 1 : 1),
                status: statusFinal,
                data: document.getElementById('operacaoData').value,
                motoristaId: Number(motId) || null,
                veiculoPlaca: document.getElementById('selectVeiculoOperacao').value || '',
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value || '',
                atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
                faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
                comissao: document.getElementById('operacaoComissao').value ? Number(document.getElementById('operacaoComissao').value) : 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
                kmInicial: 0,
                kmFinal: 0,
                dataHoraInicio: null, // Novo campo para hora exata do motorista
                ajudantes: ajudantesVisual.slice(),
                checkins: { motorista: false, ajudantes: [], ajudantesLog: {} } // Inicializa logs de check-in com hora
            };
            
            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            
            // Limpeza
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            alert(isAgendamento ? 'OPERAÇÃO AGENDADA! DISPONÍVEL PARA CHECK-IN.' : 'OPERAÇÃO SALVA E CONFIRMADA!');
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
        });
    }
    
    // --- CHECK-IN DO FUNCIONÁRIO (KM INICIAL / FINAL) COM GRAVAÇÃO DE HORÁRIO ---
    const formCheckinConfirm = document.getElementById('formCheckinConfirm');
    if (formCheckinConfirm) {
        formCheckinConfirm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!window.CURRENT_USER) return alert("ERRO DE SESSÃO. FAÇA LOGIN NOVAMENTE.");

            const opId = Number(document.getElementById('checkinOpId').value);
            const step = document.getElementById('checkinStep').value; // 'start' ou 'end'
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idx = arr.findIndex(o => o.id === opId);
            
            if (idx >= 0) {
                const op = arr[idx];
                
                // Garante estrutura de checkin se for um registro antigo
                if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
                if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};

                let isMotorista = window.CURRENT_USER.role === 'motorista';
                let confirmouAlguem = false;
                const agora = new Date().toISOString(); // Captura hora exata

                if (isMotorista) {
                    const motoristaCad = getMotorista(op.motoristaId);
                    // Verifica vínculo exato pelo UID ou Email
                    const souEu = (motoristaCad && (motoristaCad.uid === window.CURRENT_USER.uid || motoristaCad.email === window.CURRENT_USER.email));
                    
                    if (souEu) {
                        if (step === 'start') {
                            const kmIni = Number(document.getElementById('checkinKmInicial').value);
                            
                            // VALIDAÇÃO DE KM: Busca o último km registrado para este carro
                            const ultimoKmRegistrado = obterUltimoKmFinal(op.veiculoPlaca);
                            
                            if(!kmIni || kmIni <= 0) return alert("INFORME O KM INICIAL VÁLIDO.");
                            
                            if (kmIni < ultimoKmRegistrado) {
                                return alert(`ERRO: O KM INICIAL (${kmIni}) NÃO PODE SER MENOR QUE O ÚLTIMO REGISTRADO (${ultimoKmRegistrado}) PARA ESTE VEÍCULO.`);
                            }
                            
                            op.kmInicial = kmIni;
                            op.status = 'EM_ANDAMENTO'; 
                            op.checkins.motorista = true;
                            op.dataHoraInicio = agora; // Grava hora do Motorista
                            confirmouAlguem = true;
                            alert("VIAGEM INICIADA! BOA ROTA.");
                        } else if (step === 'end') {
                            const kmFim = Number(document.getElementById('checkinKmFinal').value);
                            if(!kmFim || kmFim <= op.kmInicial) return alert("O KM FINAL DEVE SER MAIOR QUE O INICIAL.");
                            
                            op.kmFinal = kmFim;
                            op.kmRodado = kmFim - (op.kmInicial || 0);
                            op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                            op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                            
                            op.status = 'CONFIRMADA'; 
                            confirmouAlguem = true;
                            alert(`VIAGEM FINALIZADA!\nTOTAL RODADO: ${op.kmRodado} KM`);
                        }
                    }
                } 
                else if (window.CURRENT_USER.role === 'ajudante') {
                    const ajudanteCad = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email);
                    if (ajudanteCad) {
                        const estaNaOp = (op.ajudantes || []).some(a => a.id === ajudanteCad.id);
                        if (estaNaOp) {
                            // Se ainda não confirmou, confirma e grava hora
                            if (!op.checkins.ajudantes.includes(ajudanteCad.id)) {
                                op.checkins.ajudantes.push(ajudanteCad.id);
                                op.checkins.ajudantesLog[ajudanteCad.id] = agora; // Grava hora do Ajudante
                            }
                            confirmouAlguem = true;
                            alert("PRESENÇA CONFIRMADA!");
                        }
                    }
                }

                if (confirmouAlguem) {
                    saveData(DB_KEYS.OPERACOES, arr);
                    closeCheckinConfirmModal();
                    // Atualiza a tabela se a função estiver disponível
                    if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
                } else {
                    alert('ERRO: VOCÊ NÃO PARECE ESTAR VINCULADO A ESTA OPERAÇÃO.');
                }
            }
        });
    }
}

function toggleDespesaParcelas() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const divParcelas = document.getElementById('divDespesaParcelas');
    if (divParcelas) {
        divParcelas.style.display = (modo === 'parcelado') ? 'grid' : 'none';
        if (modo === 'avista') {
            document.getElementById('despesaParcelas').value = 1;
        }
    }
}
window.toggleDespesaParcelas = toggleDespesaParcelas;

// =============================================================================
// 11. TABELA DE OPERAÇÕES E VISUALIZAÇÃO
// =============================================================================

let currentDate = new Date(); // Variável global para o calendário e dashboard

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    // OTIMIZAÇÃO: Renderiza apenas os 50 últimos para não travar a tela do Admin
    const opsExibidas = ops.slice(0, 50);

    if (!opsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    opsExibidas.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        // Status Badge
        let statusBadge = '';
        if (op.status === 'AGENDADA') statusBadge = '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') statusBadge = '<span style="background:#0288d1; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">EM ANDAMENTO</span>';
        else statusBadge = '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        const faturamentoDisplay = op.status === 'CONFIRMADA' ? formatCurrency(op.faturamento) : '(PENDENTE)';

        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>`;
        }

        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${motorista}</td>
            <td>${statusBadge}</td>
            <td>${faturamentoDisplay}</td>
            <td>${btns}</td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    
    const isFinalizada = op.status === 'CONFIRMADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        // Verifica se o ajudante fez checkin para mostrar status
        const checkins = op.checkins || { ajudantes: [] };
        const presente = checkins.ajudantes && checkins.ajudantes.includes(a.id);
        const statusPresenca = isFinalizada ? (presente ? '<span style="color:green;font-size:0.7rem;">(PRESENTE)</span>' : '<span style="color:red;font-size:0.7rem;">(FALTA)</span>') : '';
        
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} ${statusPresenca}</li>`;
    }).join('') || '<li>NENHUM</li>';

    let detailsHtml = '';

    if (!isFinalizada) {
        // Detalhes parciais (Em Andamento ou Agendada)
        let statusColor = op.status === 'EM_ANDAMENTO' ? '#0288d1' : 'orange';
        detailsHtml = `
            <div style="background:#fff3e0; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; margin-bottom:15px;">
                <h4 style="color:${statusColor}; margin-bottom:5px;">STATUS: ${op.status.replace('_',' ')}</h4>
                <p>Esta operação ainda não foi finalizada financeiramente.</p>
                ${op.kmInicial ? `<p style="margin-top:5px;"><strong>KM INICIAL REGISTRADO:</strong> ${op.kmInicial}</p>` : ''}
            </div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <div style="margin-top:10px;"><strong>EQUIPE (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    } else {
        // Detalhes Completos (Confirmada)
        const checkins = op.checkins || { ajudantes: [] };
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => {
            // Só soma se o ajudante confirmou presença
            if (checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                return s + (Number(a.diaria) || 0);
            }
            return s;
        }, 0);

        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
        const custoDieselEstimado = calcularCustoConsumoViagem(op) || 0;
        const custosOperacionais = (op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselEstimado;
        const liquidoOperacional = (op.faturamento || 0) - custosOperacionais;
        const abastecimentoReal = op.combustivel || 0;
        const adiantamento = op.adiantamento || 0;
        const saldoReceber = (op.faturamento || 0) - adiantamento;

        let infoConsumoHTML = '';
        if (mediaKmL > 0 && custoDieselEstimado > 0) {
            infoConsumoHTML = `<div class="modal-operation-block"><p><strong>MÉDIA HISTÓRICA DO VEÍCULO:</strong> ${mediaKmL.toFixed(2)} KM/L</p><p><strong>CUSTO DIESEL (CALCULADO):</strong> ${formatCurrency(custoDieselEstimado)}</p></div>`;
        } else {
            infoConsumoHTML = `<p style="font-size:0.8rem; color:orange;">DADOS INSUFICIENTES PARA CALCULAR CONSUMO.</p>`;
        }

        detailsHtml = `
            <p><strong>STATUS:</strong> <span style="color:green;font-weight:bold;">CONFIRMADA</span></p>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p style="font-size:1.1rem; color:var(--primary-color);">
                <strong>KM RODADO:</strong> ${op.kmRodado || 0} KM 
                <span style="font-size:0.8rem; color:#666;">(Ini: ${op.kmInicial || '?'} - Fim: ${op.kmFinal || '?'})</span>
            </p> 
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>DIÁRIAS (APENAS PRESENTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>LISTA DE PRESENÇA (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    }
    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    const dsExibidas = ds.slice(0, 50); // Otimização

    if (!dsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL.</td></tr>';
        return;
    }
    let rows = '';
    dsExibidas.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const statusPag = d.pago ? '<span style="color:green; font-weight:bold;">PAGO</span>' : '<span style="color:red; font-weight:bold;">PENDENTE</span>';
        
        let btns = '';
        if (!window.IS_READ_ONLY) {
            const btnPagoIcon = d.pago ? 'fa-times-circle' : 'fa-check-circle';
            const btnPagoTitle = d.pago ? 'MARCAR COMO PENDENTE' : 'MARCAR COMO PAGO';
            const btnPagoClass = d.pago ? 'btn-warning' : 'btn-success';
            btns += `<button class="btn-action ${btnPagoClass}" title="${btnPagoTitle}" onclick="toggleStatusDespesa(${d.id})"><i class="fas ${btnPagoIcon}"></i></button>`;
            btns += `<button class="btn-action edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>`;
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>`;
        } else {
            btns = '<span style="color:#999;font-size:0.8rem;">(VISUALIZAÇÃO)</span>';
        }

        rows += `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td>${statusPag}</td><td>${btns}</td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

window.toggleStatusDespesa = function(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = !arr[idx].pago;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
    }
};

function editDespesaItem(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).find(x => x.id === id);
    if (!d) return;
    document.getElementById('despesaGeralId').value = d.id;
    document.getElementById('despesaGeralData').value = d.data;
    document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoPlaca || '';
    document.getElementById('despesaGeralDescricao').value = d.descricao;
    document.getElementById('despesaGeralValor').value = d.valor;
    window.location.hash = '#despesas';
    alert('MODO DE EDIÇÃO: ALTERE DATA, VEÍCULO, DESCRIÇÃO OU VALOR. PARA REPARCELAR, EXCLUA E CRIE NOVAMENTE.');
}
// =============================================================================
// 12. SISTEMA DE CHECK-INS E AGENDAMENTOS (COM VISUALIZAÇÃO DE EQUIPE)
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. LÓGICA DO ADMIN (TABELA GERAL)
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { 
        let rows = '';
        if (!pendentes.length) {
            rows = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA ROTA ATIVA.</td></tr>';
        } else {
            pendentes.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                let statusLabel = '';
                if (op.status === 'AGENDADA') statusLabel = '<span style="color:orange;">AGUARDANDO INÍCIO</span>';
                else if (op.status === 'EM_ANDAMENTO') statusLabel = '<span style="color:#0288d1; font-weight:bold;">EM ANDAMENTO</span>';

                const motStatusIcon = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Confirmado"></i>` 
                    : `<i class="far fa-clock" style="color:orange;" title="Pendente"></i>`;
                
                let ajudantesStatusHtml = (op.ajudantes || []).map(a => {
                    const confirmou = checkins.ajudantes && checkins.ajudantes.includes(a.id);
                    return confirmou ? `<i class="fas fa-check-circle" style="color:green;" title="Ajudante Confirmado"></i>` : `<i class="far fa-clock" style="color:orange;" title="Ajudante Pendente"></i>`;
                }).join(' ');

                let actionBtn = '';
                if (op.status === 'AGENDADA') {
                    actionBtn = `<button class="btn-primary btn-action" style="padding:6px 12px;" onclick="iniciarRotaManual(${op.id})"><i class="fas fa-play"></i> INICIAR ROTA</button>`;
                } else {
                    actionBtn = `<span style="color:#0288d1; font-size:0.8rem;">MOTORISTA INICIOU</span>`;
                }

                rows += `<tr>
                    <td>${dataFmt}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${motStatusIcon} ${motNome}</td>
                    <td>${ajudantesStatusHtml || '-'}</td>
                    <td>${statusLabel}</td>
                    <td>
                        ${actionBtn}
                        <button class="btn-action edit-btn" style="margin-left:5px;" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
        
        if(tabelaAdmin.querySelector('tbody')) tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. LÓGICA DO FUNCIONÁRIO (PAINEL + VISUALIZAÇÃO DA EQUIPE)
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        const myEmail = window.CURRENT_USER.email;
        let myProfileId = null;
        let isMotorista = (window.CURRENT_USER.role === 'motorista');
        let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const myProfile = loadData(myKey).find(p => p.uid === myUid || (p.email && p.email === myEmail));
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            const el = document.getElementById('listaServicosAgendados');
            if(el) el.innerHTML = '<p style="text-align:center; color:red;">PERFIL NÃO VINCULADO. CONTATE O ADMIN.</p>';
            return;
        }

        // 1. LISTA DE PENDENTES (CARTÕES)
        const listaFunc = document.getElementById('listaServicosAgendados');
        if (listaFunc) {
            const myPendentes = pendentes.filter(op => {
                if (isMotorista) return op.motoristaId === myProfileId;
                else return (op.ajudantes || []).some(a => a.id === myProfileId);
            });

            if (!myPendentes.length) {
                listaFunc.innerHTML = '<p style="text-align:center; color:#666;">NENHUMA VIAGEM ATIVA.</p>';
            } else {
                let html = '';
                myPendentes.forEach(op => {
                    const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                    
                    // --- VISUALIZAÇÃO DA EQUIPE ---
                    let infoEquipeHTML = '';
                    if (isMotorista) {
                        // Motorista vê os ajudantes
                        const nomesAjudantes = (op.ajudantes || []).map(a => {
                            const aj = getAjudante(a.id);
                            return aj ? aj.nome.split(' ')[0] : 'ID:'+a.id;
                        }).join(', ');
                        
                        if(nomesAjudantes) {
                            infoEquipeHTML = `<p style="font-size:0.85rem; color:#455a64; margin-top:4px;"><i class="fas fa-users" style="width:15px;"></i> <strong>EQUIPE:</strong> ${nomesAjudantes}</p>`;
                        } else {
                            infoEquipeHTML = `<p style="font-size:0.85rem; color:#999; margin-top:4px;">(SEM AJUDANTES)</p>`;
                        }
                    } else {
                        // Ajudante vê o motorista
                        const mot = getMotorista(op.motoristaId);
                        const nomeMot = mot ? mot.nome : 'A DEFINIR';
                        infoEquipeHTML = `<p style="font-size:0.85rem; color:#455a64; margin-top:4px;"><i class="fas fa-shipping-fast" style="width:15px;"></i> <strong>MOTORISTA:</strong> ${nomeMot}</p>`;
                    }
                    // -----------------------------------

                    let btnHtml = '';
                    if (isMotorista) {
                        if (op.status === 'AGENDADA') {
                            btnHtml = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-play"></i> INICIAR</button>`;
                        } else if (op.status === 'EM_ANDAMENTO') {
                            btnHtml = `<button class="btn-danger" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-flag-checkered"></i> FINALIZAR</button>`;
                        }
                    } else {
                        // Ajudante
                        const checkins = op.checkins || { ajudantes: [] };
                        const jaConfirmei = checkins.ajudantes && checkins.ajudantes.includes(myProfileId);
                        if (jaConfirmei) {
                            btnHtml = `<button class="btn-success" disabled style="opacity:0.7;"><i class="fas fa-check"></i> CONFIRMADO</button>`;
                        } else {
                            btnHtml = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-user-check"></i> MARCAR PRESENÇA</button>`;
                        }
                    }

                    html += `<div class="card" style="border-left: 5px solid var(--primary-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div style="flex:1;">
                                <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4>
                                <p style="margin-bottom:2px;"><strong>CLIENTE:</strong> ${contratante}</p>
                                ${infoEquipeHTML}
                                <p style="margin-top:2px; font-size:0.85rem;">STATUS: <strong>${op.status.replace('_',' ')}</strong></p>
                            </div>
                            <div style="text-align:right;">
                                ${btnHtml}
                            </div>
                        </div>
                    </div>`;
                });
                listaFunc.innerHTML = html;
            }
        }

        // 2. RESUMO DE HISTÓRICO (ÚLTIMOS 5)
        const tabelaHistoricoResumo = document.getElementById('tabelaMeusServicosResumo');
        if (tabelaHistoricoResumo) {
            const historico = ops.filter(op => {
                if (op.status !== 'CONFIRMADA') return false;
                if (isMotorista) return op.motoristaId === myProfileId;
                else return (op.ajudantes || []).some(a => a.id === myProfileId);
            }).sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0,5);

            if (historico.length === 0) {
                tabelaHistoricoResumo.querySelector('tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;">NENHUM SERVIÇO REALIZADO AINDA.</td></tr>';
            } else {
                let rowsHist = '';
                historico.forEach(op => {
                    const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                    const c = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                    rowsHist += `<tr><td>${d}</td><td>${op.veiculoPlaca}</td><td>${c}</td><td><span style="color:green;">CONFIRMADA</span></td></tr>`;
                });
                tabelaHistoricoResumo.querySelector('tbody').innerHTML = rowsHist;
            }
        }
    }
}

// =============================================================================
// 13. CALENDÁRIO, GRÁFICOS E LEMBRETES (ADMIN)
// =============================================================================

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
    updateDashboardStats();
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();
    
    let totalFat = 0;
    let totalCustos = 0;

    const opsMes = ops.filter(op => {
        if(op.status !== 'CONFIRMADA') return false;
        const d = new Date(op.data + 'T00:00:00');
        return d.getMonth() === m && d.getFullYear() === y;
    });

    opsMes.forEach(op => {
        totalFat += (op.faturamento || 0);
        const custoComb = Number(op.combustivel) || 0;
        const checkins = op.checkins || { ajudantes: [] };
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => {
            if (checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                return s + (Number(a.diaria) || 0);
            }
            return s;
        }, 0);
        totalCustos += custoComb + (op.comissao || 0) + totalDiarias + (op.despesas || 0);
    });

    const totalDespGeral = despesas.filter(d => {
        const dataD = new Date(d.data + 'T00:00:00');
        return dataD.getMonth() === m && dataD.getFullYear() === y;
    }).reduce((acc, d) => acc + (d.valor || 0), 0);
    
    totalCustos += totalDespGeral;
    const liquido = totalFat - totalCustos;

    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elRec = document.getElementById('receitaMes');

    if(elFat) elFat.textContent = formatCurrency(totalFat);
    if(elDesp) elDesp.textContent = formatCurrency(totalCustos);
    if(elRec) {
        elRec.textContent = formatCurrency(liquido);
        elRec.style.color = liquido >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }
}

function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('currentMonthYear');
    if(!grid || !monthLabel) return;

    grid.innerHTML = '';
    monthLabel.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    weekDays.forEach(day => {
        const div = document.createElement('div');
        div.className = 'day-label';
        div.textContent = day;
        grid.appendChild(div);
    });

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<firstDayIndex; i++){
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;
        
        const dataIso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const temOp = ops.some(op => op.data === dataIso);

        if(temOp) {
            cell.classList.add('has-operation');
            cell.onclick = () => {
                alert(`OPERAÇÕES NO DIA ${d}:\n\nConsulte a tabela de operações para detalhes.`);
            };
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            cell.appendChild(dot);
        }

        grid.appendChild(cell);
    }
}

let chartInstance = null;

function renderCharts() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    
    const labels = [];
    const dataCombustivel = [];
    const dataOutrasDespesas = [];
    const dataLucro = [];
    const dataKm = [];

    // Calcula total histórico
    let totalReceitaHistorica = 0;
    ops.forEach(o => {
        if(o.status === 'CONFIRMADA') totalReceitaHistorica += (o.faturamento || 0);
    });
    const elHist = document.getElementById('receitaTotalHistorico');
    if(elHist) elHist.textContent = formatCurrency(totalReceitaHistorica);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

        const opsMes = ops.filter(op => {
            if(op.status !== 'CONFIRMADA') return false;
            const dateOp = new Date(op.data + 'T00:00:00');
            return dateOp.getMonth() === m && dateOp.getFullYear() === y;
        });
        
        const despMes = despesas.filter(dp => {
            const dateDp = new Date(dp.data + 'T00:00:00');
            return dateDp.getMonth() === m && dateDp.getFullYear() === y;
        });

        let sumCombustivelEstimado = 0;
        let sumOutros = 0;
        let sumFaturamento = 0;
        let sumKm = 0;

        opsMes.forEach(op => {
            sumFaturamento += (op.faturamento || 0);
            
            let custoDiesel = Number(op.combustivel) || 0;
            if(custoDiesel === 0) custoDiesel = calcularCustoConsumoViagem(op);
            sumCombustivelEstimado += custoDiesel;
            
            sumKm += (Number(op.kmRodado) || 0);
            
            const checkins = op.checkins || { ajudantes: [] };
            const diarias = (op.ajudantes || []).reduce((acc, a) => {
                if(checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                    return acc + (Number(a.diaria) || 0);
                }
                return acc;
            }, 0);
            
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });

        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;
        
        const lucro = sumFaturamento - (sumCombustivelEstimado + sumOutros);

        dataCombustivel.push(sumCombustivelEstimado);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(lucro);
        dataKm.push(sumKm);
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                    label: 'CUSTO DIESEL',
                    data: dataCombustivel,
                    backgroundColor: '#d32f2f',
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'OUTROS CUSTOS',
                    data: dataOutrasDespesas,
                    backgroundColor: '#f57c00',
                    stack: 'Stack 0',
                    order: 3
                },
                {
                    label: 'LUCRO LÍQUIDO',
                    data: dataLucro,
                    backgroundColor: '#388e3c',
                    stack: 'Stack 0',
                    order: 1
                },
                {
                    label: 'KM RODADO',
                    data: dataKm,
                    type: 'line',
                    borderColor: '#263238',
                    borderWidth: 3,
                    pointBackgroundColor: '#263238',
                    yAxisID: 'y1',
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'VALORES (R$)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'KM' }
                }
            }
        }
    });
}

function checkAndShowReminders() {
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const hoje = new Date().toISOString().split('T')[0];
    const pendentes = despesas.filter(d => {
        const isPago = !!d.pago; 
        return d.data <= hoje && !isPago;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length > 0) openReminderModal(pendentes);
}

function openReminderModal(pendentes) {
    const modal = document.getElementById('reminderModal');
    const lista = document.getElementById('reminderList');
    let html = '';
    pendentes.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        let actions = '';
        if (!window.IS_READ_ONLY) {
             actions = `<div class="reminder-actions">
                    <button class="btn-success btn-mini" title="MARCAR COMO PAGO" onclick="payExpense(${d.id})"><i class="fas fa-check"></i> PAGO</button>
                    <button class="btn-warning btn-mini" title="REAGENDAR (+1 DIA)" onclick="postponeExpense(${d.id})"><i class="fas fa-clock"></i> ADIAR</button>
                    <button class="btn-danger btn-mini" title="EXCLUIR DÍVIDA" onclick="cancelExpense(${d.id})"><i class="fas fa-trash"></i></button>
                </div>`;
        } else {
            actions = '<small style="color:#666;">(VISUALIZAÇÃO)</small>';
        }
        html += `<div class="reminder-item"><div class="reminder-info"><strong>VENCIMENTO: ${dataFmt}</strong><p>${d.descricao} - ${formatCurrency(d.valor)}</p>${d.veiculoPlaca ? `<small>VEÍCULO: ${d.veiculoPlaca}</small>` : ''}</div>${actions}</div>`;
    });
    lista.innerHTML = html;
    modal.style.display = 'block';
}

function closeReminderModal() {
    document.getElementById('reminderModal').style.display = 'none';
}
window.closeReminderModal = closeReminderModal;

window.payExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = true;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        const el = event.target.closest('.reminder-item');
        if (el) el.remove();
        if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
        renderDespesasTable();
    }
};

window.postponeExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        const atual = new Date(arr[idx].data + 'T00:00:00');
        atual.setDate(atual.getDate() + 1);
        const y = atual.getFullYear();
        const m = String(atual.getMonth() + 1).padStart(2, '0');
        const dStr = String(atual.getDate()).padStart(2, '0');
        arr[idx].data = `${y}-${m}-${dStr}`;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        alert(`REAGENDADO PARA ${atual.toLocaleDateString('pt-BR')}`);
        const el = event.target.closest('.reminder-item');
        if (el) el.remove();
        if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
        renderDespesasTable();
    }
};

window.cancelExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    if(!confirm("TEM CERTEZA QUE DESEJA EXCLUIR ESTA DÍVIDA?")) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    arr = arr.filter(d => d.id !== id);
    saveData(DB_KEYS.DESPESAS_GERAIS, arr);
    const el = event.target.closest('.reminder-item');
    if (el) el.remove();
    if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
    renderDespesasTable();
};

function fullSystemReset() {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA: AÇÃO BLOQUEADA.");
    if (confirm("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DA NUVEM PARA SEMPRE.\n\nTEM CERTEZA ABSOLUTA?")) {
        Object.values(DB_KEYS).forEach(k => { saveData(k, k === DB_KEYS.MINHA_EMPRESA ? {} : []); });
        alert("SISTEMA RESETADO. AGUARDE A SINCRONIZAÇÃO.");
    }
}
window.fullSystemReset = fullSystemReset;

// =============================================================================
// [NOVO] FUNÇÕES DE VISUALIZAÇÃO DE PERFIL E GESTÃO DE REQUISIÇÕES
// =============================================================================

function renderEmployeeProfileView() {
    const container = document.getElementById('employeeProfileView');
    if (!container || !window.CURRENT_USER) return;

    const role = window.CURRENT_USER.role;
    let data = null;
    let typeLabel = '';

    if (role === 'motorista') {
        data = loadData(DB_KEYS.MOTORISTAS).find(m => m.email === window.CURRENT_USER.email || m.uid === window.CURRENT_USER.uid);
        typeLabel = 'MOTORISTA PROFISSIONAL';
    } else if (role === 'ajudante') {
        data = loadData(DB_KEYS.AJUDANTES).find(a => a.email === window.CURRENT_USER.email || a.uid === window.CURRENT_USER.uid);
        typeLabel = 'AJUDANTE OPERACIONAL';
    }

    if (!data) {
        container.innerHTML = '<div class="card" style="text-align:center; color:red;">SEU PERFIL NÃO ESTÁ VINCULADO A UM CADASTRO OFICIAL. CONTATE O ADMIN.</div>';
        const alertBox = document.getElementById('profileIncompleteAlert');
        if(alertBox) alertBox.style.display = 'block';
        return;
    }

    const alertBox = document.getElementById('profileIncompleteAlert');
    if(alertBox) alertBox.style.display = 'none';

    const cnhValidade = data.validadeCNH ? new Date(data.validadeCNH + 'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO POSSUI';
    const iniciais = data.nome ? data.nome.substring(0, 2).toUpperCase() : 'FX';

    let htmlGrid = `
        <div class="data-item"><label>Nome Completo</label><span>${data.nome}</span></div>
        <div class="data-item"><label>Documento (CPF/RG)</label><span>${data.documento}</span></div>
        <div class="data-item"><label>Telefone / WhatsApp</label><span>${formatPhoneBr(data.telefone || 'NÃO INFORMADO')}</span></div>
        <div class="data-item"><label>Chave PIX</label><span>${data.pix || 'NÃO CADASTRADA'}</span></div>
    `;

    if (role === 'motorista') {
        htmlGrid += `
            <div class="data-item"><label>Registro CNH</label><span>${data.cnh || '--'}</span></div>
            <div class="data-item"><label>Categoria</label><span>${data.categoriaCNH || '--'}</span></div>
            <div class="data-item"><label>Validade CNH</label><span>${cnhValidade}</span></div>
            <div class="data-item"><label>Cursos Especiais</label><span>${data.temCurso ? (data.cursoDescricao || 'SIM') : 'NÃO'}</span></div>
        `;
    } else {
        htmlGrid += `
            <div class="data-item"><label>Endereço</label><span>${data.endereco || 'NÃO INFORMADO'}</span></div>
        `;
    }

    const htmlFinal = `
        <div class="profile-view-container">
            <div class="profile-header">
                <div class="profile-avatar-placeholder">${iniciais}</div>
                <div class="profile-info-main">
                    <h2>${data.nome}</h2>
                    <p>${typeLabel}</p>
                    <span class="status-badge active">CADASTRO ATIVO</span>
                </div>
            </div>
            <div class="profile-data-grid">
                ${htmlGrid}
            </div>
        </div>
    `;

    container.innerHTML = htmlFinal;
}

function openRequestProfileChangeModal() {
    if (window.IS_READ_ONLY && !window.CURRENT_USER) return;
    
    const role = window.CURRENT_USER.role;
    let data = null;
    if (role === 'motorista') data = loadData(DB_KEYS.MOTORISTAS).find(m => m.email === window.CURRENT_USER.email || m.uid === window.CURRENT_USER.uid);
    else data = loadData(DB_KEYS.AJUDANTES).find(a => a.email === window.CURRENT_USER.email || a.uid === window.CURRENT_USER.uid);

    if (data) {
        document.getElementById('reqEmpTelefone').value = data.telefone || '';
        document.getElementById('reqEmpPix').value = data.pix || '';
        
        const driverFields = document.getElementById('reqDriverFields');
        if (role === 'motorista') {
            driverFields.style.display = 'flex';
            document.getElementById('reqEmpCNH').value = data.cnh || '';
            document.getElementById('reqEmpValidadeCNH').value = data.validadeCNH || '';
        } else {
            driverFields.style.display = 'none';
        }
    }

    document.getElementById('modalRequestProfileChange').style.display = 'block';
}

function renderProfileRequestsTable() {
    const table = document.getElementById('tabelaProfileRequests');
    if (!table) return;

    const allRequests = loadData(DB_KEYS.PROFILE_REQUESTS) || [];
    const pendingRequests = allRequests.filter(r => r.status === 'PENDING').sort((a,b) => new Date(b.requestDate) - new Date(a.requestDate));

    const badge = document.getElementById('badgeAccess');
    if (badge) {
        badge.style.display = pendingRequests.length > 0 ? 'inline-block' : 'none';
        badge.textContent = pendingRequests.length > 0 ? pendingRequests.length : '!';
    }

    const cardContainer = document.getElementById('cardSolicitacoesPerfil');
    if (pendingRequests.length === 0) {
        if (cardContainer) cardContainer.style.display = 'none';
        return;
    } else {
        if (cardContainer) cardContainer.style.display = 'block';
    }

    let rows = '';
    pendingRequests.forEach(req => {
        const dataFmt = new Date(req.requestDate).toLocaleDateString('pt-BR');
        
        rows += `
            <tr>
                <td>${dataFmt}</td>
                <td>
                    <strong>${req.userName}</strong><br>
                    <small>${req.userRole.toUpperCase()}</small>
                </td>
                <td>${req.fieldLabel}</td>
                <td>
                    <div style="font-size:0.85rem; color:#888;">DE: ${req.oldValue || '(VAZIO)'}</div>
                    <div style="font-weight:bold; color:var(--primary-color);">PARA: ${req.newValue}</div>
                </td>
                <td>
                    <button class="btn-success btn-mini" onclick="processProfileRequest('${req.id}', true)" title="APROVAR"><i class="fas fa-check"></i></button>
                    <button class="btn-danger btn-mini" onclick="processProfileRequest('${req.id}', false)" title="REJEITAR"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    });
    
    table.querySelector('tbody').innerHTML = rows;
}

window.processProfileRequest = function(reqId, approved) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    let requests = loadData(DB_KEYS.PROFILE_REQUESTS).slice();
    const reqIndex = requests.findIndex(r => String(r.id) === String(reqId));
    
    if (reqIndex < 0) return alert("Requisição não encontrada.");
    const req = requests[reqIndex];

    if (approved) {
        const dbKey = req.userRole === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        let usersList = loadData(dbKey).slice();
        const userIndex = usersList.findIndex(u => u.id === req.userId);

        if (userIndex >= 0) {
            usersList[userIndex][req.field] = req.newValue;
            saveData(dbKey, usersList);
            alert(`DADO ATUALIZADO COM SUCESSO!\n${req.fieldLabel} alterado para ${req.newValue}.`);
        } else {
            alert("Erro: Usuário original não encontrado no banco de dados.");
            return;
        }
    } else {
        if(!confirm("Tem certeza que deseja REJEITAR esta alteração?")) return;
    }

    requests[reqIndex].status = approved ? 'APPROVED' : 'REJECTED';
    requests[reqIndex].processedDate = new Date().toISOString();
    
    saveData(DB_KEYS.PROFILE_REQUESTS, requests);
    renderProfileRequestsTable();
};

window.filtrarHistoricoFuncionario = function(e) {
    if(e) e.preventDefault();
    if (!window.CURRENT_USER) return;

    const dataIniVal = document.getElementById('empDataInicio').value;
    const dataFimVal = document.getElementById('empDataFim').value;
    
    if(!dataIniVal || !dataFimVal) return alert("POR FAVOR, SELECIONE AS DATAS INICIAL E FINAL.");

    const di = new Date(dataIniVal + 'T00:00:00');
    const df = new Date(dataFimVal + 'T23:59:59');

    let myProfileId = null;
    let isMotorista = (window.CURRENT_USER.role === 'motorista');
    let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    const myProfile = loadData(myKey).find(p => p.uid === window.CURRENT_USER.uid || (p.email && p.email === window.CURRENT_USER.email));
    
    if (myProfile) myProfileId = myProfile.id;
    if (!myProfileId) return alert("PERFIL NÃO VINCULADO AO SEU USUÁRIO.");

    const ops = loadData(DB_KEYS.OPERACOES);
    let totalReceber = 0;
    
    const resultado = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        
        const d = new Date(op.data + 'T00:00:00');
        if (d < di || d > df) return false;

        let participou = false;
        // Verifica participação
        if (isMotorista) {
            if (op.motoristaId === myProfileId) participou = true;
        } else {
            if ((op.ajudantes || []).some(a => a.id === myProfileId)) participou = true;
        }
        return participou;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    
    if (resultado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO NESTE PERÍODO.</td></tr>';
        document.getElementById('empTotalReceber').textContent = 'R$ 0,00';
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'none';
    } else {
        let html = '';
        resultado.forEach(op => {
            const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
            
            // --- CÁLCULO DE VALOR E HORA ---
            let valor = 0;
            let horaCheckin = '--:--';
            
            if (isMotorista) {
                // Motorista: Valor = Comissão
                valor = op.comissao || 0;
                
                // Hora do Motorista (gravada no dataHoraInicio)
                if (op.dataHoraInicio) {
                    try {
                        const dateObj = new Date(op.dataHoraInicio);
                        horaCheckin = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                    } catch(e) { horaCheckin = '--:--'; }
                }
            } else {
                // Ajudante: Valor = Diária
                const ajData = (op.ajudantes || []).find(a => a.id === myProfileId);
                const checkins = op.checkins || { ajudantes: [], ajudantesLog: {} };
                const confirmou = checkins.ajudantes && checkins.ajudantes.includes(myProfileId);
                
                if (confirmou) {
                    valor = Number(ajData.diaria) || 0;
                    
                    // Hora do Ajudante (gravada no log individual)
                    if (checkins.ajudantesLog && checkins.ajudantesLog[myProfileId]) {
                        try {
                            const dateObj = new Date(checkins.ajudantesLog[myProfileId]);
                            horaCheckin = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                        } catch(e) { horaCheckin = '--:--'; }
                    }
                } else {
                    valor = 0; // Falta (Sem checkin)
                }
            }
            
            totalReceber += valor;
            const styleVal = valor > 0 ? 'color:green; font-weight:bold;' : 'color:red;';
            const displayHora = horaCheckin !== '--:--' ? `<i class="far fa-clock"></i> ${horaCheckin}` : '<span style="font-size:0.8rem; color:orange;">SEM HORÁRIO</span>';

            html += `<tr>
                <td>
                    <div>${dataFmt}</div>
                    <div style="font-size:0.8rem; color:#666; margin-top:2px;">${displayHora}</div>
                </td>
                <td>${op.veiculoPlaca}</td>
                <td>${contratante}</td>
                <td style="${styleVal}">${formatCurrency(valor)}</td>
                <td>CONFIRMADA</td>
            </tr>`;
        });
        tbody.innerHTML = html;
        document.getElementById('empTotalReceber').textContent = formatCurrency(totalReceber);
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'block';
    }
};

// =============================================================================
// 17. GESTÃO GLOBAL (SUPER ADMIN) - HIERARQUIA POR DOMÍNIO
// =============================================================================

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, updateDoc, doc, deleteDoc, where, getDocs } = window.dbRef;
    
    // 1. Escuta TODOS os usuários em tempo real
    const q = query(collection(db, "users"));
    
    onSnapshot(q, (snapshot) => {
        const allUsers = [];
        snapshot.forEach(d => allUsers.push(d.data()));
        renderGlobalHierarchy(allUsers);
    }, (error) => {
        console.error("Erro ao carregar usuários:", error);
        document.getElementById('superAdminContainer').innerHTML = `<p style="color:red; text-align:center;">ERRO DE PERMISSÃO OU CONEXÃO: ${error.message}</p>`;
    });

    // --- AÇÕES GLOBAIS DE EMPRESA ---

    // Bloquear/Desbloquear TODA a empresa (Todos os usuários do domínio)
    window.toggleCompanyBlock = async (domain, shouldBlock) => {
        const action = shouldBlock ? "BLOQUEAR" : "DESBLOQUEAR";
        if(!confirm(`ATENÇÃO: VOCÊ VAI ${action} O ACESSO DE TODOS OS USUÁRIOS DA EMPRESA "${domain}".\n\nConfirmar?`)) return;

        try {
            // Busca todos usuários do domínio
            const qDomain = query(collection(db, "users"), where("company", "==", domain));
            const querySnapshot = await getDocs(qDomain);
            
            const promises = [];
            querySnapshot.forEach((userDoc) => {
                // Define approved: false para bloquear, true para desbloquear
                promises.push(updateDoc(userDoc.ref, { approved: !shouldBlock }));
            });

            await Promise.all(promises);
            alert(`SUCESSO: Empresa ${domain} ${shouldBlock ? 'BLOQUEADA' : 'DESBLOQUEADA'}.`);
        } catch (e) {
            console.error(e);
            alert("Erro ao processar empresa: " + e.message);
        }
    };

    // Excluir TODA a empresa (Deleta usuários)
    window.deleteCompanyData = async (domain) => {
        const verify = prompt(`PERIGO EXTREMO!\n\nIsso excluirá TODOS os usuários e dados da empresa "${domain}" permanentemente.\n\nPara confirmar, digite o nome do domínio:`);
        if (verify !== domain) return alert("Ação cancelada. O nome digitado não confere.");

        try {
            // 1. Deletar Usuários
            const qUsers = query(collection(db, "users"), where("company", "==", domain));
            const usersSnap = await getDocs(qUsers);
            const userPromises = [];
            usersSnap.forEach((u) => userPromises.push(deleteDoc(u.ref)));
            await Promise.all(userPromises);
            
            alert(`A EMPRESA ${domain} FOI REMOVIDA DO SISTEMA.`);
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir empresa: " + e.message);
        }
    };

    // --- AÇÕES INDIVIDUAIS (DENTRO DA CASCATA) ---

    window.toggleGlobalUserStatus = async (uid, currentStatus) => {
        try {
            await updateDoc(doc(db, "users", uid), { approved: !currentStatus });
        } catch(e) { alert("Erro: " + e.message); }
    };

    window.resetGlobalUserPassword = async (uid) => {
        if(!confirm("O usuário será obrigado a trocar a senha no próximo login. Confirmar?")) return;
        try {
            await updateDoc(doc(db, "users", uid), { forcePasswordReset: true });
            alert("Reset agendado.");
        } catch(e) { alert("Erro: " + e.message); }
    };
    
    window.deleteGlobalUser = async (uid) => {
        if(!confirm("Excluir este usuário permanentemente?")) return;
        try {
            await deleteDoc(doc(db, "users", uid));
        } catch(e) { alert("Erro: " + e.message); }
    };
}

// RENDERIZAÇÃO DA HIERARQUIA
function renderGlobalHierarchy(users) {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    // 1. Agrupar
    const domains = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return; // Pula o Super Admin
        
        // Garante que existe um domínio
        const dom = u.company || u.email.split('@')[1] || 'SEM_EMPRESA';
        
        if(!domains[dom]) domains[dom] = { admins: [], employees: [], total: 0, blockedCount: 0 };
        
        if(u.role === 'admin') domains[dom].admins.push(u);
        else domains[dom].employees.push(u);
        
        domains[dom].total++;
        if(!u.approved) domains[dom].blockedCount++;
    });

    if(Object.keys(domains).length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">NENHUMA EMPRESA ENCONTRADA.</div>';
        return;
    }

    // 2. Construir HTML
    let html = '';
    
    // Ordena domínios alfabeticamente
    Object.keys(domains).sort().forEach(domain => {
        const data = domains[domain];
        const isAllBlocked = data.total > 0 && data.total === data.blockedCount;
        
        // Botão de Bloqueio da Empresa (Muda cor se já estiver tudo bloqueado)
        const btnBlockCompany = isAllBlocked 
            ? `<button class="btn-success btn-mini" onclick="event.stopPropagation(); toggleCompanyBlock('${domain}', false)" title="DESBLOQUEAR EMPRESA"><i class="fas fa-unlock"></i> LIBERAR</button>`
            : `<button class="btn-warning btn-mini" onclick="event.stopPropagation(); toggleCompanyBlock('${domain}', true)" title="BLOQUEAR EMPRESA"><i class="fas fa-ban"></i> BLOQUEAR</button>`;

        html += `
            <div class="domain-block">
                <div class="domain-header" onclick="this.parentElement.querySelector('.domain-content').classList.toggle('open'); this.querySelector('.fa-chevron-right').classList.toggle('fa-rotate-90');">
                    <div class="domain-title">
                        <i class="fas fa-chevron-right" style="font-size:0.8rem; transition: transform 0.2s;"></i>
                        <span style="text-transform:lowercase; font-size:1.1rem;">${domain}</span>
                        ${isAllBlocked ? '<span class="status-pill pill-blocked">BLOQUEADA</span>' : ''}
                    </div>
                    <div class="domain-actions">
                        ${btnBlockCompany}
                        <button class="btn-danger btn-mini" onclick="event.stopPropagation(); deleteCompanyData('${domain}')" title="EXCLUIR EMPRESA"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                
                <div class="domain-content">
                    ${data.admins.length > 0 ? `
                        <div class="admin-section">
                            <h5 style="color:#0277bd; margin-bottom:10px;"><i class="fas fa-user-shield"></i> ADMINISTRADORES</h5>
                            ${data.admins.map(u => renderUserRow(u, true)).join('')}
                        </div>
                    ` : '<p style="color:orange;">⚠ Esta empresa não possui Administrador.</p>'}

                    <div class="employee-section">
                        <h5 style="color:#666; margin-bottom:10px; margin-top:15px;"><i class="fas fa-users"></i> FUNCIONÁRIOS (${data.employees.length})</h5>
                        ${data.employees.length > 0 ? data.employees.map(u => renderUserRow(u, false)).join('') : '<p style="font-size:0.8rem; color:#999;">Nenhum funcionário cadastrado.</p>'}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderUserRow(u, isAdmin) {
    const statusColor = u.approved ? 'green' : 'red';
    const statusIcon = u.approved ? 'fa-check-circle' : 'fa-ban';
    
    return `
        <div class="user-row">
            <div style="display:flex; align-items:center; gap:10px;">
                <i class="fas ${statusIcon}" style="color:${statusColor}; font-size:1.2rem;"></i>
                <div>
                    <div style="font-weight:bold; text-transform:uppercase;">${u.name}</div>
                    <div style="font-size:0.85rem; color:#555; text-transform:lowercase;">${u.email}</div>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn-mini ${u.approved ? 'btn-warning' : 'btn-success'}" onclick="toggleGlobalUserStatus('${u.uid}', ${u.approved})" title="${u.approved ? 'Bloquear' : 'Desbloquear'}">
                    <i class="fas ${u.approved ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <button class="btn-mini btn-secondary" onclick="resetGlobalUserPassword('${u.uid}')" title="Resetar Senha"><i class="fas fa-key"></i></button>
                <button class="btn-mini btn-danger" onclick="deleteGlobalUser('${u.uid}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
}

window.filterGlobalUsers = function() {
    const term = document.getElementById('superAdminSearch').value.toLowerCase();
    const blocks = document.querySelectorAll('.domain-block');
    blocks.forEach(b => {
        const text = b.innerText.toLowerCase();
        b.style.display = text.includes(term) ? 'block' : 'none';
        // Se buscar, abre
        if(term.length > 0 && text.includes(term)) b.querySelector('.domain-content').classList.add('open');
        else if(term.length === 0) b.querySelector('.domain-content').classList.remove('open');
    });
};

// =============================================================================
// 18. INICIALIZAÇÃO E CONFIGURAÇÃO
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) { setTimeout(setupRealtimeListeners, 500); return; }
    const { db, doc, onSnapshot } = window.dbRef;
    
    // Se for Super Admin, não precisa carregar dados operacionais agora
    if (window.CURRENT_USER && window.CURRENT_USER.email === 'admin@logimaster.com') return;

    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        Object.values(DB_KEYS).forEach(key => {
            onSnapshot(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), (s) => {
                if(s.exists()) APP_CACHE[key] = s.data().items || (key===DB_KEYS.MINHA_EMPRESA?{}:[]);
                updateUI();
            });
        });
    }
}

function updateUI() {
    // 1. ROTA SUPER ADMIN
    if (window.CURRENT_USER && window.CURRENT_USER.email === 'admin@logimaster.com') {
        setupSuperAdmin();
        return;
    }

    // 2. ROTA FUNCIONÁRIO
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
        if(typeof renderEmployeeProfileView === 'function') renderEmployeeProfileView();
    } 
    // 3. ROTA ADMIN DE EMPRESA
    else {
        if(typeof populateAllSelects === 'function') populateAllSelects();
        if(typeof renderOperacaoTable === 'function') renderOperacaoTable();
        if(typeof renderDespesasTable === 'function') renderDespesasTable();
        if(typeof updateDashboardStats === 'function') updateDashboardStats();
        if(typeof renderCalendar === 'function' && typeof currentDate !== 'undefined') renderCalendar(currentDate);
        if(typeof renderCharts === 'function') renderCharts();
        if(typeof checkAndShowReminders === 'function') checkAndShowReminders();
        if(typeof renderMinhaEmpresaInfo === 'function') renderMinhaEmpresaInfo();
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof renderProfileRequestsTable === 'function') renderProfileRequestsTable();
    }
    
    if (window.IS_READ_ONLY && window.enableReadOnlyMode) {
        window.enableReadOnlyMode();
    }
}

function setupInputFormattingListeners() {
    const inputs = ['minhaEmpresaCNPJ', 'contratanteCNPJ'];
    inputs.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value)); });
    
    const phones = ['minhaEmpresaTelefone', 'contratanteTelefone', 'motoristaTelefone', 'ajudanteTelefone', 'reqEmpTelefone'];
    phones.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', e => e.target.value = formatPhoneBr(e.target.value)); });

    const motoristaPix = document.getElementById('motoristaPix');
    if (motoristaPix) {
        motoristaPix.addEventListener('input', () => document.getElementById('motoristaPixTipo').textContent = 'TIPO: ' + detectPixType(motoristaPix.value));
        document.getElementById('btnMotoristaPixCopy').addEventListener('click', () => copyToClipboard(motoristaPix.value));
    }
    const ajudantePix = document.getElementById('ajudantePix');
    if (ajudantePix) {
        ajudantePix.addEventListener('input', () => document.getElementById('ajudantePixTipo').textContent = 'TIPO: ' + detectPixType(ajudantePix.value));
        document.getElementById('btnAjudantePixCopy').addEventListener('click', () => copyToClipboard(ajudantePix.value));
    }

    const selAjud = document.getElementById('selectAjudantesOperacao');
    if (selAjud) selAjud.addEventListener('change', handleAjudanteSelectionChange);
    const selCurso = document.getElementById('motoristaTemCurso');
    if (selCurso) selCurso.addEventListener('change', toggleCursoInput);
}

document.addEventListener('DOMContentLoaded', () => {
    const formRel = document.getElementById('formRelatorio');
    if(formRel) formRel.addEventListener('submit', window.gerarRelatorio || function(e){e.preventDefault();});

    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
        });
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const page = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(page).classList.add('active');
            if(page === 'graficos' && typeof renderCharts === 'function') renderCharts();
        });
    });

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    }

    if(typeof setupFormHandlers === 'function') setupFormHandlers();
    setupInputFormattingListeners();
});

// Funções Globais HTML
window.viewCadastro = viewCadastro;
window.editCadastroItem = editCadastroItem;
window.deleteItem = deleteItem;
window.exportDataBackup = exportDataBackup;
window.importDataBackup = importDataBackup;
window.viewOperacaoDetails = viewOperacaoDetails;
if(typeof editOperacaoItem !== 'undefined') window.editOperacaoItem = editOperacaoItem;
// Função CRÍTICA para iniciar rota que estava faltando na Parte 5 antiga
window.iniciarRotaManual = function(opId) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    let arr = loadData(DB_KEYS.OPERACOES).slice();
    const idx = arr.findIndex(o => o.id === opId);
    if (idx < 0) return;
    const op = arr[idx];
    
    const checkins = op.checkins || { motorista: false, ajudantes: [] };
    const pendencias = [];
    if (!checkins.motorista) pendencias.push("MOTORISTA");
    (op.ajudantes || []).forEach(a => {
        if (!checkins.ajudantes || !checkins.ajudantes.includes(a.id)) pendencias.push(`AJUDANTE ID ${a.id}`);
    });

    if (pendencias.length > 0) {
        if(!confirm("ATENÇÃO: EXISTEM MEMBROS PENDENTES (" + pendencias.join(", ") + ").\n\nDESEJA FORÇAR O INÍCIO DA ROTA?")) return;
    } else {
        if(!confirm("INICIAR ROTA AGORA?")) return;
    }

    op.status = 'EM_ANDAMENTO';
    saveData(DB_KEYS.OPERACOES, arr);
    alert("ROTA INICIADA!");
    renderCheckinsTable(); 
    renderOperacaoTable();
};