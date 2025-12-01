/**
 * SCRIPT.JS - SINCRONIZADO VIA FIREBASE
 * Chaves extraídas de logimaster-72a29
 */

// =============================================================================
// 1. IMPORTAÇÃO E CONFIGURAÇÃO DO FIREBASE
// =============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// SUAS CHAVES (Extraídas da Imagem)
const firebaseConfig = {
    apiKey: "AIzaSyAyTMFwAyWgNEy5Rqwan7FrA547IPGvIvY",
    authDomain: "logimaster-72a29.firebaseapp.com",
    databaseURL: "https://logimaster-72a29-default-rtdb.firebaseio.com",
    projectId: "logimaster-72a29",
    storageBucket: "logimaster-72a29.firebasestorage.app",
    messagingSenderId: "380606262384",
    appId: "1:380606262384:web:e0780179f3bf32973498b5",
    measurementId: "G-29M9SE4P7D"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Estrutura de Chaves
const DB_KEYS = {
    MOTORISTAS: 'db_motoristas',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    AJUDANTES: 'db_ajudantes',
    ATIVIDADES: 'db_atividades'
};

// Cache Local (substituto do localStorage para performance)
window.DB_CACHE = {
    db_motoristas: [], db_veiculos: [], db_contratantes: [], db_operacoes: [],
    db_minha_empresa: {}, db_despesas_gerais: [], db_ajudantes: [], db_atividades: []
};

// =============================================================================
// 2. FUNÇÕES DE DADOS (NUVEM + CACHE)
// =============================================================================

// Salvar (Atualiza Cache + Envia p/ Nuvem)
function saveData(key, value) {
    window.DB_CACHE[key] = value;
    set(ref(db, key), value)
        .then(() => console.log("Salvo na nuvem:", key))
        .catch(e => alert("Erro de sincronização: " + e.message));
}

// Ler (Lê do Cache)
function loadData(key) {
    return window.DB_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// Sincronização em Tempo Real (Listener)
function iniciarSincronizacao() {
    onValue(ref(db), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            Object.keys(DB_KEYS).forEach(k => {
                const dbKey = DB_KEYS[k];
                if (data[dbKey]) window.DB_CACHE[dbKey] = data[dbKey];
            });
            refreshUI(); // Atualiza a tela quando chega dado novo
        }
    });
}

function refreshUI() {
    if (typeof populateAllSelects === 'function') populateAllSelects();
    if (typeof window.changeMonth === 'function') window.changeMonth(0);
    if (typeof renderOperacaoTable === 'function') renderOperacaoTable();
    if (typeof renderDespesasTable === 'function') renderDespesasTable();
    if (typeof updateDashboardStats === 'function') updateDashboardStats();
    if (typeof renderCharts === 'function') renderCharts();
}

// =============================================================================
// 3. UTILITÁRIOS E CÁLCULOS
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)||0);
const formatDateBr = (s) => { if(!s) return '-'; const p=s.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };

const getMotorista = (id) => loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id));
const getVeiculo = (placa) => loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
const getContratante = (cnpj) => loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
const getAjudante = (id) => loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id));
const getAtividade = (id) => loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
const getMinhaEmpresa = () => loadData(DB_KEYS.MINHA_EMPRESA);

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    if (!ops.length) return 0;
    ops.sort((a,b) => new Date(b.data) - new Date(a.data));
    return Number(ops[0].precoLitro);
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa);
    let km = 0, lit = 0;
    ops.forEach(o => {
        if(o.kmRodado) km += Number(o.kmRodado);
        if(Number(o.combustivel)>0 && Number(o.precoLitro)>0) lit += (Number(o.combustivel)/Number(o.precoLitro));
    });
    return lit > 0 ? km/lit : 0;
}

function calcularCustoConsumoViagem(op) {
    if (!op.veiculoPlaca || !op.kmRodado) return 0;
    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if (media <= 0) return 0;
    let preco = Number(op.precoLitro) || obterUltimoPrecoCombustivel(op.veiculoPlaca);
    return preco > 0 ? (Number(op.kmRodado) / media) * preco : 0;
}

// =============================================================================
// 4. FORMATADORES ESPECÍFICOS
// =============================================================================

function formatCPF_CNPJ(v) {
    const d = onlyDigits(v);
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}
function formatPhoneBr(v) {
    const d = onlyDigits(v);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}
function detectPixType(k) {
    if(!k) return ''; const v=k.trim(), d=onlyDigits(v);
    if(v.includes('@')) return 'EMAIL';
    if(d.length===11 && !v.includes('@')) return 'CPF/TEL';
    if(d.length===14) return 'CNPJ';
    return 'ALEATÓRIA';
}
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>alert('Copiado!')); }

// =============================================================================
// 5. FUNÇÕES GLOBAIS (WINDOW)
// =============================================================================

window.toggleCursoInput = function() {
    const v = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if(div) div.style.display = v === 'sim' ? 'flex' : 'none';
};
window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.openOperationDetails = function(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBodyContent').innerHTML = html;
    document.getElementById('operationDetailsModal').style.display = 'block';
};

// Ajudantes Modal
let _ajCallback = null;
window.openAdicionarAjudanteModal = function(aj, cb) {
    _ajCallback = { aj, cb };
    document.getElementById('modalAjudanteNome').textContent = aj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
};
window.closeAdicionarAjudanteModal = function() {
    _ajCallback = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};
document.addEventListener('click', (e) => {
    if(e.target.id === 'modalAjudanteAddBtn') {
        const v = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if(_ajCallback) { _ajCallback.cb({ id: _ajCallback.aj.id, diaria: v }); window.closeAdicionarAjudanteModal(); }
    }
});

// =============================================================================
// 6. LÓGICA DE DADOS E TABELAS
// =============================================================================

function populateAllSelects() {
    const fill = (id, k, v, t, d) => {
        const el = document.getElementById(id);
        if(el) {
            el.innerHTML = `<option value="">${d}</option>`;
            loadData(k).forEach(x => el.innerHTML += `<option value="${x[v]}">${x[t]}</option>`);
        }
    };
    fill('selectMotoristaOperacao', DB_KEYS.MOTORISTAS, 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', DB_KEYS.VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', DB_KEYS.CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', DB_KEYS.ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', DB_KEYS.AJUDANTES, 'id', 'nome', 'ADICIONAR...');
    fill('selectVeiculoDespesaGeral', DB_KEYS.VEICULOS, 'placa', 'placa', 'SELECIONE...');
    
    // Select Recibo
    const sr = document.getElementById('selectMotoristaRecibo');
    if(sr) {
        sr.innerHTML = '<option value="">SELECIONE...</option>';
        loadData(DB_KEYS.MOTORISTAS).forEach(x => sr.innerHTML += `<option value="motorista:${x.id}">MOT - ${x.nome}</option>`);
        loadData(DB_KEYS.AJUDANTES).forEach(x => sr.innerHTML += `<option value="ajudante:${x.id}">AJU - ${x.nome}</option>`);
    }
    
    // Filtros
    fill('selectVeiculoRelatorio', DB_KEYS.VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', DB_KEYS.CONTRATANTES, 'cnpj', 'razaoSocial', 'TODAS');
    fill('selectMotoristaRelatorio', DB_KEYS.MOTORISTAS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRecibo', DB_KEYS.VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', DB_KEYS.CONTRATANTES, 'cnpj', 'razaoSocial', 'TODAS');

    renderAllTables();
    renderMinhaEmpresaInfo();
}

function renderAllTables() {
    const rnd = (k, t, c, idf='id') => {
        const tb = document.querySelector(`#${t} tbody`);
        if(tb) {
            const d = loadData(k);
            tb.innerHTML = d.length ? d.map(i => `<tr>${c.map(x=>`<td>${i[x]||'-'}</td>`).join('')}<td><button class="btn-action edit-btn" onclick="window.editCadastroItem('${k}','${i[idf]}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="window.deleteItem('${k}','${i[idf]}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="5">VAZIO</td></tr>';
        }
    };
    rnd(DB_KEYS.MOTORISTAS, 'tabelaMotoristas', ['nome','documento']);
    rnd(DB_KEYS.VEICULOS, 'tabelaVeiculos', ['placa','modelo'], 'placa');
    rnd(DB_KEYS.CONTRATANTES, 'tabelaContratantes', ['razaoSocial','telefone'], 'cnpj');
    rnd(DB_KEYS.AJUDANTES, 'tabelaAjudantes', ['nome','telefone']);
    rnd(DB_KEYS.ATIVIDADES, 'tabelaAtividades', ['nome']);
}

function renderMinhaEmpresaInfo() {
    const me = getMinhaEmpresa();
    const div = document.getElementById('viewMinhaEmpresaContent');
    if(div) div.innerHTML = me.razaoSocial ? `<p><strong>${me.razaoSocial}</strong><br>${me.cnpj}</p>` : 'Sem dados.';
}

// CRUD
window.deleteItem = function(key, id) {
    if(!confirm('Excluir?')) return;
    let arr = loadData(key);
    const idKey = key===DB_KEYS.VEICULOS?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    arr = arr.filter(i => String(i[idKey]) !== String(id));
    saveData(key, arr);
};

window.editCadastroItem = function(key, id) {
    const idKey = key===DB_KEYS.VEICULOS?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    const item = loadData(key).find(i => String(i[idKey]) === String(id));
    if(!item) return;
    
    if(key===DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaId').value = item.id;
        document.getElementById('motoristaNome').value = item.nome;
        document.getElementById('motoristaDocumento').value = item.documento;
        document.querySelector('[data-tab="motoristas"]').click();
    } else if (key===DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa;
        document.getElementById('veiculoPlaca').value = item.placa;
        document.querySelector('[data-tab="veiculos"]').click();
    } else if (key===DB_KEYS.CONTRATANTES) {
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.querySelector('[data-tab="contratantes"]').click();
    } else if (key === DB_KEYS.AJUDANTES) {
        document.getElementById('ajudanteId').value = item.id;
        document.getElementById('ajudanteNome').value = item.nome;
        document.querySelector('[data-tab="ajudantes"]').click();
    } else if (key === DB_KEYS.ATIVIDADES) {
        document.getElementById('atividadeId').value = item.id;
        document.getElementById('atividadeNome').value = item.nome;
        document.querySelector('[data-tab="atividades"]').click();
    }
    // (Adicione os outros campos conforme necessidade)
    document.querySelector('.cadastro-form.active').scrollIntoView();
};

window.viewCadastro = function(key, id) {
    const idKey = key===DB_KEYS.VEICULOS?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    const item = loadData(key).find(i => String(i[idKey]) === String(id));
    if(!item) return;
    const html = Object.keys(item).map(k => `<p><strong>${k.toUpperCase()}:</strong> ${item[k]}</p>`).join('');
    window.openViewModal('VISUALIZAR', html);
};

// =============================================================================
// 7. CALENDÁRIO E DASHBOARD
// =============================================================================
let currentDate = new Date();

window.changeMonth = function(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderCalendar(currentDate);
    updateDashboardStats();
};

function renderCalendar(date) {
    const year = date.getFullYear(), month = date.getMonth();
    document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    grid.innerHTML = '';

    ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'].forEach(d => grid.innerHTML += `<div class="day-header">${d}</div>`);
    for(let i=0; i<new Date(year, month, 1).getDay(); i++) grid.innerHTML += `<div class="day-cell empty"></div>`;

    const ops = loadData(DB_KEYS.OPERACOES);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let d=1; d<=daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDay = ops.filter(o => o.data === dateStr);
        const hasRevenue = opsDay.some(o => Number(o.faturamento) > 0);

        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;

        if (opsDay.length) {
            cell.classList.add(hasRevenue ? 'has-operation' : 'has-operation-neutral');
            cell.innerHTML += `<div class="event-dot"></div>`;
            cell.onclick = () => {
                let html = opsDay.map(op => {
                    const mot = getMotorista(op.motoristaId)?.nome || '-';
                    return `<div style="background:#eee; padding:10px; margin-bottom:5px;">
                        <strong>${op.veiculoPlaca}</strong> (${mot})<br>FAT: ${formatCurrency(op.faturamento)}
                        <div style="text-align:right"><button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id});window.closeModal()">EDITAR</button></div>
                    </div>`;
                }).join('');
                window.openOperationDetails(`DIA ${d}/${month+1}`, html);
            };
        }
        grid.appendChild(cell);
    }
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const desp = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth(), y = currentDate.getFullYear();

    const opsMes = ops.filter(o => { const d = new Date(o.data+'T00:00:00'); return d.getMonth()===m && d.getFullYear()===y; });
    const fat = opsMes.reduce((a,b) => a + (Number(b.faturamento)||0), 0);
    const custoOp = opsMes.reduce((acc, o) => {
        const d = calcularCustoConsumoViagem(o);
        const a = (o.ajudantes||[]).reduce((s,x)=>s+(Number(x.diaria)||0),0);
        return acc + (Number(o.comissao)||0) + (Number(o.despesas)||0) + a + d;
    }, 0);
    const custoDesp = desp.filter(d => { const dt = new Date(d.data+'T00:00:00'); return dt.getMonth()===m && dt.getFullYear()===y; })
                          .reduce((acc, d) => acc + (Number(d.valor)||0), 0);

    document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
    document.getElementById('despesasMes').textContent = formatCurrency(custoOp + custoDesp);
    document.getElementById('receitaMes').textContent = formatCurrency(fat - (custoOp + custoDesp));
}

// =============================================================================
// 8. OPERAÇÕES
// =============================================================================

window._operacaoAjudantesTempList = [];
function renderAjudantesAdicionadosList() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if(!ul) return;
    const arr = window._operacaoAjudantesTempList;
    ul.innerHTML = arr.length ? arr.map(a => `<li>${getAjudante(a.id)?.nome||'?'} (${formatCurrency(a.diaria)}) <button type="button" class="btn-mini" onclick="window.remAj(${a.id})">X</button></li>`).join('') : '<li>Nenhum</li>';
}
window.remAj = function(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x=>x.id!==id);
    renderAjudantesAdicionadosList();
};

window.renderOperacaoTable = function() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if(!tbody) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a,b)=>new Date(b.data)-new Date(a.data));
    tbody.innerHTML = ops.length ? ops.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '-';
        const atv = getAtividade(op.atividadeId)?.nome || '-';
        const liq = (op.faturamento||0) - ((op.comissao||0)+(op.despesas||0)+calcularCustoConsumoViagem(op));
        const color = liq >= 0 ? '#4caf50' : '#f44336';
        return `<tr>
            <td>${formatDateBr(op.data)}</td><td>${mot}</td><td>${atv}</td><td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${color}; font-weight:bold;">${formatCurrency(liq)}</td>
            <td>
                <button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action view-btn" onclick="window.viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="6">Sem registros</td></tr>';
};

window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id == id);
    if(!op) return;
    const s = (k,v) => { const e=document.getElementById(k); if(e) e.value=v; };
    s('operacaoId', op.id); s('operacaoData', op.data); s('selectMotoristaOperacao', op.motoristaId);
    s('selectVeiculoOperacao', op.veiculoPlaca); s('selectContratanteOperacao', op.contratanteCNPJ);
    s('selectAtividadeOperacao', op.atividadeId); s('operacaoFaturamento', op.faturamento);
    s('operacaoAdiantamento', op.adiantamento); s('operacaoComissao', op.comissao);
    s('operacaoCombustivel', op.combustivel); s('operacaoPrecoLitro', op.precoLitro);
    s('operacaoDespesas', op.despesas); s('operacaoKmRodado', op.kmRodado);
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderAjudantesAdicionadosList();
    document.querySelector('[data-page="operacoes"]').click();
    document.getElementById('formOperacao').scrollIntoView();
};

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id == id);
    if(!op) return;
    const diesel = calcularCustoConsumoViagem(op);
    const aju = (op.ajudantes||[]).reduce((s,x)=>s+(Number(x.diaria)||0),0);
    const custo = (Number(op.comissao)||0) + (Number(op.despesas)||0) + aju + diesel;
    const lucro = (Number(op.faturamento)||0) - custo;
    const html = `<p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
        <p><strong>MOTORISTA:</strong> ${getMotorista(op.motoristaId)?.nome || '-'}</p>
        <hr><p>FAT: <strong>${formatCurrency(op.faturamento)}</strong></p>
        <p>CUSTO TOTAL (Est.): ${formatCurrency(custo)}</p>
        <h3 style="color:${lucro>=0?'green':'red'}">LUCRO: ${formatCurrency(lucro)}</h3>`;
    window.openOperationDetails('DETALHES', html);
};

window.renderDespesasTable = function() {
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b)=>new Date(b.data)-new Date(a.data));
    tbody.innerHTML = ds.length ? ds.map(d => `<tr><td>${formatDateBr(d.data)}</td><td>${d.veiculoPlaca||'Geral'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="5">Vazio</td></tr>';
};

// =============================================================================
// 9. RELATÓRIOS
// =============================================================================

window.gerarRelatorioCobranca = function() {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const cnpj = document.getElementById('selectContratanteRelatorio').value;
    if(!ini || !fim || !cnpj) return alert('Selecione filtros.');
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data >= ini && o.data <= fim && o.contratanteCNPJ === cnpj);
    if(!ops.length) return alert('Nada encontrado.');
    let total = 0;
    const rows = ops.map(o => {
        const s = (Number(o.faturamento)||0) - (Number(o.adiantamento)||0);
        total += s;
        return `<tr><td>${formatDateBr(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatCurrency(o.faturamento)}</td><td style="color:red">${formatCurrency(o.adiantamento)}</td><td><strong>${formatCurrency(s)}</strong></td></tr>`;
    }).join('');
    document.getElementById('reportContent').innerHTML = `<h3>Relatório</h3><p>${formatDateBr(ini)} a ${formatDateBr(fim)}</p><table style="width:100%" border="1">${rows}</table><h3 style="text-align:right">Total: ${formatCurrency(total)}</h3>`;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    html2pdf().from(el).save('relatorio.pdf');
};

// =============================================================================
// 10. SETUP INICIAL
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    iniciarSincronizacao();

    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-page')).classList.add('active');
        if(b.getAttribute('data-page')==='home') window.changeMonth(0);
        if(b.getAttribute('data-page')==='graficos') renderCharts();
    }));

    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));

    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

    document.getElementById('selectAjudantesOperacao')?.addEventListener('change', (e) => {
        if(e.target.value) window.openAdicionarAjudanteModal(getAjudante(e.target.value), (r)=>{
            window._operacaoAjudantesTempList.push(r); renderAjudantesAdicionadosList(); e.target.value='';
        });
    });

    // Forms
    const sv = (id, key, build, idf, cid) => {
        document.getElementById(id)?.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(key);
            const obj = build();
            const oid = document.getElementById(idf).value;
            if(cid) arr = arr.filter(x => x[cid] !== oid && x[cid] !== obj[cid]);
            else arr = arr.filter(x => Number(x.id) !== Number(obj.id));
            arr.push(obj);
            saveData(key, arr);
            alert('Salvo!');
        });
    };

    sv('formMotorista', DB_KEYS.MOTORISTAS, () => ({ id: document.getElementById('motoristaId').value||Date.now(), nome: document.getElementById('motoristaNome').value.toUpperCase(), documento: document.getElementById('motoristaDocumento').value }), 'motoristaId');
    sv('formVeiculo', DB_KEYS.VEICULOS, () => ({ placa: document.getElementById('veiculoPlaca').value.toUpperCase(), modelo: document.getElementById('veiculoModelo').value.toUpperCase(), ano: document.getElementById('veiculoAno').value }), 'veiculoId', 'placa');
    sv('formContratante', DB_KEYS.CONTRATANTES, () => ({ cnpj: document.getElementById('contratanteCNPJ').value, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value }), 'contratanteId', 'cnpj');
    sv('formAjudante', DB_KEYS.AJUDANTES, () => ({ id: document.getElementById('ajudanteId').value||Date.now(), nome: document.getElementById('ajudanteNome').value.toUpperCase(), documento: document.getElementById('ajudanteDocumento').value }), 'ajudanteId');
    sv('formAtividade', DB_KEYS.ATIVIDADES, () => ({ id: document.getElementById('atividadeId').value||Date.now(), nome: document.getElementById('atividadeNome').value.toUpperCase() }), 'atividadeId');

    document.getElementById('formOperacao')?.addEventListener('submit', (e) => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.OPERACOES);
        const obj = {
            id: document.getElementById('operacaoId').value ? Number(document.getElementById('operacaoId').value) : Date.now(),
            data: document.getElementById('operacaoData').value,
            motoristaId: Number(document.getElementById('selectMotoristaOperacao').value),
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: Number(document.getElementById('selectAtividadeOperacao').value),
            faturamento: Number(document.getElementById('operacaoFaturamento').value),
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
            comissao: Number(document.getElementById('operacaoComissao').value),
            combustivel: Number(document.getElementById('operacaoCombustivel').value),
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
            despesas: Number(document.getElementById('operacaoDespesas').value),
            kmRodado: Number(document.getElementById('operacaoKmRodado').value),
            ajudantes: window._operacaoAjudantesTempList.slice()
        };
        arr = arr.filter(x => Number(x.id) !== Number(obj.id));
        arr.push(obj);
        saveData(DB_KEYS.OPERACOES, arr);
        alert('Salvo!'); document.getElementById('operacaoId').value = '';
    });

    document.getElementById('formDespesaGeral')?.addEventListener('submit', (e) => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.DESPESAS_GERAIS);
        const dt = document.getElementById('despesaGeralData').value;
        const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
        const val = Number(document.getElementById('despesaGeralValor').value);
        const p = Number(document.getElementById('despesaParcelas').value) || 1;
        const pl = document.getElementById('selectVeiculoDespesaGeral').value;
        for(let i=0; i<p; i++) {
            const d = new Date(dt+'T00:00:00'); d.setMonth(d.getMonth()+i);
            arr.push({id: Date.now()+i, data: d.toISOString().split('T')[0], veiculoPlaca: pl, descricao: p>1?`${desc} (${i+1}/${p})`:desc, valor: val/p});
        }
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        alert('Salvo!');
    });

    document.getElementById('formMinhaEmpresa')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveData(DB_KEYS.MINHA_EMPRESA, { razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj: document.getElementById('minhaEmpresaCNPJ').value, telefone: document.getElementById('minhaEmpresaTelefone').value });
        alert('Salvo!');
    });

    // Relatório Listener
    document.getElementById('formRelatorio')?.addEventListener('submit', window.gerarRelatorioCobranca); // Usei Cobrança como padrão, pode mudar se quiser

    populateAllSelects();
    window.changeMonth(0);
    renderOperacaoTable();
    updateDashboardStats();
});

// Funções Extras
window.fullSystemReset = function() { if(confirm('Apagar tudo?')) { set(ref(db), {}).then(()=>location.reload()); } };
window.exportDataBackup = function() { const bk={}; Object.values(DB_KEYS).forEach(k=>bk[k]=loadData(k)); const a=document.createElement('a'); a.href="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(bk)); a.download='backup.json'; a.click(); };
window.importDataBackup = function(e) { const f=e.target.files[0]; const r=new FileReader(); r.onload=(ev)=>{ try{const d=JSON.parse(ev.target.result); Object.keys(d).forEach(k=>saveData(k,d[k])); alert('Ok');}catch(x){alert('Erro');}}; if(f)r.readAsText(f); };

function renderCharts() {
    if(typeof Chart === 'undefined') return;
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    if(window.myChart) window.myChart.destroy();
    const ops = loadData(DB_KEYS.OPERACOES);
    const labels = [], dataF = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth()-i);
        labels.push(`${d.getMonth()+1}/${d.getFullYear()}`);
        const om = ops.filter(o => { const x = new Date(o.data+'T00:00:00'); return x.getMonth()===d.getMonth() && x.getFullYear()===d.getFullYear(); });
        dataF.push(om.reduce((a,b)=>a+(Number(b.faturamento)||0),0));
    }
    window.myChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Faturamento', data: dataF, backgroundColor: '#00796b' }] } });
}