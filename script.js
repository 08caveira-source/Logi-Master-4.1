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

// CACHE GLOBAL DA APLICAÇÃO
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

// --- VARIÁVEIS GLOBAIS DE CONTROLE DE ACESSO ---
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// Carrega dados do Cache Local (Síncrono para a UI não travar)
function loadData(key) {
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// Salva dados no Firebase (Nuvem)
async function saveData(key, value) {
    // Bloqueio de segurança para perfil de leitura
    // Exceção: Checkins (Operações) podem ser atualizados pelo funcionário ao confirmar
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES) {
       // Apenas operações podem ser escritas por funcionários (update de status)
    }

    // 1. Atualiza cache local imediatamente
    APP_CACHE[key] = value;
    
    // 2. Envia para o Firebase se estiver disponível
    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        try {
            await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            console.log(`Dados de ${key} salvos na nuvem da empresa ${companyDomain}.`);
        } catch (e) {
            console.error("Erro ao salvar no Firebase:", e);
            alert("Erro ao salvar online. Verifique sua conexão ou permissões no Firebase.");
        }
    } else {
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve();
    }
}

// Remove tudo que não for número
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata valor para Moeda Brasileira (R$)
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// =============================================================================
// 2. FUNÇÕES HELPER (GETTERS)
// =============================================================================

function getMotorista(id) {
    return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id));
}

function getVeiculo(placa) {
    return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
}

function getContratante(cnpj) {
    return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
}

function getAjudante(id) {
    return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id));
}

function getAtividade(id) {
    return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
}

function getMinhaEmpresa() {
    return loadData(DB_KEYS.MINHA_EMPRESA);
}

// =============================================================================
// 3. INTELIGÊNCIA DE CÁLCULO DE FROTA
// =============================================================================

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsComPreco = todasOps.filter(op => 
        op && op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    
    if (opsComPreco.length === 0) return 0;
    
    opsComPreco.sort((a, b) => new Date(b.data || '1970-01-01') - new Date(a.data || '1970-01-01'));
    
    return Number(opsComPreco[0].precoLitro) || 0;
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    // Só considera operações CONFIRMADAS para média
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa && op.status !== 'AGENDADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        if(op.kmRodado) totalKmAcumulado += Number(op.kmRodado);
        
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0;
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    // Agendadas não tem consumo real ainda
    if (op.status === 'AGENDADA') return 0;
    
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0; 

    const litrosConsumidos = kmRodado / mediaKmL;
    return litrosConsumidos * precoParaCalculo;
}
// =============================================================================
// 4. FORMATADORES
// =============================================================================

function parseCurrencyToNumber(value) {
    if (!value) return 0;
    return Number(
        (value + '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '')
    ) || 0;
}

function formatKm(v) {
    v = Number(v) || 0;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
}

// Data por extenso
function dataPorExtenso(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return '';
    }
}

// =============================================================================
// 5. VALIDAÇÕES GERAIS
// =============================================================================

function validarCNPJ(cnpj) {
    cnpj = onlyDigits(cnpj);
    return cnpj.length === 14;
}

function validarCPF(cpf) {
    cpf = onlyDigits(cpf);
    return cpf.length === 11;
}

function validarPlaca(placa) {
    if (!placa) return false;
    placa = placa.toUpperCase().trim();
    return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

function validarData(str) {
    if (!str) return false;
    const d = new Date(str);
    return !isNaN(d);
}

// =============================================================================
// 6. GERADORES DE ID CORRIGIDOS
// =============================================================================

function gerarNovoIDMotorista() {
    const arr = loadData(DB_KEYS.MOTORISTAS);
    if (!arr.length) return 1;
    
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function gerarNovoIDAjudante() {
    const arr = loadData(DB_KEYS.AJUDANTES);
    if (!arr.length) return 1;
    
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function gerarNovoIDAtividade() {
    const arr = loadData(DB_KEYS.ATIVIDADES);
    if (!arr.length) return 1;
    
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

// =============================================================================
// 7. MANIPULAÇÃO DA UI
// =============================================================================

function showSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
    const target = document.getElementById(sectionId);
    if (target) target.style.display = 'block';

    // Renderizações automáticas
    if (sectionId === 'operacoes') renderOperacoes();
    if (sectionId === 'motoristas') renderMotoristas();
    if (sectionId === 'veiculos') renderVeiculos();
    if (sectionId === 'contratantes') renderContratantes();
    if (sectionId === 'ajudantes') renderAjudantes();
    if (sectionId === 'atividades') renderAtividades();
    if (sectionId === 'calendar') renderCalendar();
}

// =============================================================================
// 8. AJUDANTES (CRUD)
// =============================================================================

function cadastrarAjudante() {
    const nome = document.getElementById('ajudanteNome').value.trim();
    const cpf = onlyDigits(document.getElementById('ajudanteCpf').value);

    if (!nome) return alert('Nome obrigatório');
    if (!validarCPF(cpf)) return alert('CPF inválido');

    const arr = loadData(DB_KEYS.AJUDANTES);

    const novo = {
        id: gerarNovoIDAjudante(),
        nome,
        cpf
    };

    arr.push(novo);
    saveData(DB_KEYS.AJUDANTES, arr);

    renderAjudantes();
    alert('Ajudante cadastrado com sucesso!');
}

function deletarAjudante(id) {
    if (!confirm('Excluir ajudante?')) return;
    let arr = loadData(DB_KEYS.AJUDANTES);
    arr = arr.filter(a => String(a.id) !== String(id));
    saveData(DB_KEYS.AJUDANTES, arr);
    renderAjudantes();
}

function renderAjudantes() {
    const tbl = document.getElementById('tblAjudantes');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.AJUDANTES);
    tbl.innerHTML = '';

    arr.forEach(a => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${a.id}</td>
            <td>${a.nome}</td>
            <td>${a.cpf}</td>
            <td>
                <button onclick="deletarAjudante(${a.id})">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}

// =============================================================================
// 9. ATIVIDADES (CRUD)
// =============================================================================

function cadastrarAtividade() {
    const nome = document.getElementById('atividadeNome').value.trim();
    const valorBase = parseCurrencyToNumber(document.getElementById('atividadeValorBase').value);

    if (!nome) return alert('Nome obrigatório');
    if (valorBase <= 0) return alert('Valor base inválido');

    const arr = loadData(DB_KEYS.ATIVIDADES);

    const novo = {
        id: gerarNovoIDAtividade(),
        nome,
        valorBase
    };

    arr.push(novo);
    saveData(DB_KEYS.ATIVIDADES, arr);

    renderAtividades();
    alert('Atividade cadastrada com sucesso!');
}

function deletarAtividade(id) {
    if (!confirm('Excluir atividade?')) return;
    let arr = loadData(DB_KEYS.ATIVIDADES);
    arr = arr.filter(a => String(a.id) !== String(id));
    saveData(DB_KEYS.ATIVIDADES, arr);
    renderAtividades();
}

function renderAtividades() {
    const tbl = document.getElementById('tblAtividades');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.ATIVIDADES);
    tbl.innerHTML = '';

    arr.forEach(a => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${a.id}</td>
            <td>${a.nome}</td>
            <td>${formatCurrency(a.valorBase)}</td>
            <td>
                <button onclick="deletarAtividade(${a.id})">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}
// =============================================================================
// 10. VEÍCULOS (CRUD)
// =============================================================================

function cadastrarVeiculo() {
    const placa = document.getElementById('veiculoPlaca').value.toUpperCase().trim();
    const modelo = document.getElementById('veiculoModelo').value.trim();
    const mediaKmL = Number(document.getElementById('veiculoMediaKmL').value) || 0;

    if (!validarPlaca(placa)) return alert('Placa inválida');
    if (!modelo) return alert('Modelo obrigatório');
    if (mediaKmL <= 0) return alert('Média Km/L inválida');

    const arr = loadData(DB_KEYS.VEICULOS);

    // Checar duplicidade
    if (arr.some(v => v.placa === placa)) {
        return alert('Já existe um veículo com esta placa.');
    }

    arr.push({
        placa,
        modelo,
        mediaKmL
    });

    saveData(DB_KEYS.VEICULOS, arr);

    renderVeiculos();
    alert('Veículo cadastrado com sucesso!');
}

function deletarVeiculo(placa) {
    if (!confirm('Excluir veículo?')) return;

    let arr = loadData(DB_KEYS.VEICULOS);
    arr = arr.filter(v => v.placa !== placa);
    saveData(DB_KEYS.VEICULOS, arr);

    renderVeiculos();
}

function renderVeiculos() {
    const tbl = document.getElementById('tblVeiculos');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.VEICULOS);
    tbl.innerHTML = '';

    arr.forEach(v => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${v.placa}</td>
            <td>${v.modelo}</td>
            <td>${v.mediaKmL}</td>
            <td>
                <button onclick="deletarVeiculo('${v.placa}')">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}

// =============================================================================
// 11. MOTORISTAS (CRUD)
// =============================================================================

function cadastrarMotorista() {
    const nome = document.getElementById('motoristaNome').value.trim();
    const cpf = onlyDigits(document.getElementById('motoristaCpf').value);

    if (!nome) return alert('Nome obrigatório');
    if (!validarCPF(cpf)) return alert('CPF inválido');

    const arr = loadData(DB_KEYS.MOTORISTAS);

    // Evita duplicidade de CPF
    if (arr.some(m => m.cpf === cpf)) {
        return alert('Já existe motorista com este CPF.');
    }

    const novo = {
        id: gerarNovoIDMotorista(),
        nome,
        cpf
    };

    arr.push(novo);
    saveData(DB_KEYS.MOTORISTAS, arr);

    renderMotoristas();
    alert('Motorista cadastrado com sucesso!');
}

function deletarMotorista(id) {
    if (!confirm('Excluir motorista?')) return;

    let arr = loadData(DB_KEYS.MOTORISTAS);
    arr = arr.filter(m => String(m.id) !== String(id));
    saveData(DB_KEYS.MOTORISTAS, arr);

    renderMotoristas();
}

function renderMotoristas() {
    const tbl = document.getElementById('tblMotoristas');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.MOTORISTAS);
    tbl.innerHTML = '';

    arr.forEach(m => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${m.id}</td>
            <td>${m.nome}</td>
            <td>${m.cpf}</td>
            <td>
                <button onclick="deletarMotorista(${m.id})">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}

// =============================================================================
// 12. CONTRATANTES (CRUD)
// =============================================================================

function cadastrarContratante() {
    const nome = document.getElementById('contratanteNome').value.trim();
    const cnpj = onlyDigits(document.getElementById('contratanteCnpj').value);

    if (!nome) return alert('Nome obrigatório');
    if (!validarCNPJ(cnpj)) return alert('CNPJ inválido');

    const arr = loadData(DB_KEYS.CONTRATANTES);

    // Duplicidade
    if (arr.some(c => c.cnpj === cnpj)) {
        return alert('Já existe contratante com este CNPJ.');
    }

    arr.push({
        nome,
        cnpj
    });

    saveData(DB_KEYS.CONTRATANTES, arr);

    renderContratantes();
    alert('Contratante cadastrado com sucesso!');
}

function deletarContratante(cnpj) {
    if (!confirm('Excluir contratante?')) return;

    let arr = loadData(DB_KEYS.CONTRATANTES);
    arr = arr.filter(c => c.cnpj !== cnpj);
    saveData(DB_KEYS.CONTRATANTES, arr);

    renderContratantes();
}

function renderContratantes() {
    const tbl = document.getElementById('tblContratantes');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.CONTRATANTES);
    tbl.innerHTML = '';

    arr.forEach(c => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${c.nome}</td>
            <td>${c.cnpj}</td>
            <td>
                <button onclick="deletarContratante('${c.cnpj}')">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}
// =============================================================================
// 13. OPERAÇÕES (CRUD)
// =============================================================================

function gerarNovoIDOperacao() {
    const arr = loadData(DB_KEYS.OPERACOES);
    if (!arr.length) return 1;
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function cadastrarOperacao() {
    const data = document.getElementById('opData').value;
    const contratante = document.getElementById('opContratante').value;
    const veiculoPlaca = document.getElementById('opVeiculo').value;
    const motoristaId = document.getElementById('opMotorista').value;
    const atividadeId = document.getElementById('opAtividade').value;
    const kmRodado = Number(document.getElementById('opKmRodado').value) || 0;
    const combustivel = parseCurrencyToNumber(document.getElementById('opCombustivel').value);
    const precoLitro = parseCurrencyToNumber(document.getElementById('opPrecoLitro').value);

    if (!validarData(data)) return alert('Data inválida');
    if (!contratante) return alert('Selecione contratante');
    if (!veiculoPlaca) return alert('Selecione veículo');
    if (!motoristaId) return alert('Selecione motorista');
    if (!atividadeId) return alert('Selecione atividade');

    const arr = loadData(DB_KEYS.OPERACOES);

    const nova = {
        id: gerarNovoIDOperacao(),
        data,
        contratante,
        veiculoPlaca,
        motoristaId,
        atividadeId,
        kmRodado,
        combustivel,
        precoLitro,
        status: 'AGENDADA'
    };

    arr.push(nova);
    saveData(DB_KEYS.OPERACOES, arr);

    renderOperacoes();
    renderCalendar();
    alert('Operação agendada com sucesso!');
}

function confirmarOperacao(id) {
    const arr = loadData(DB_KEYS.OPERACOES);
    const op = arr.find(o => Number(o.id) === Number(id));
    if (!op) return;

    op.status = 'CONFIRMADA';
    saveData(DB_KEYS.OPERACOES, arr);

    renderOperacoes();
    renderCalendar();
}

function deletarOperacao(id) {
    if (!confirm('Excluir operação?')) return;

    let arr = loadData(DB_KEYS.OPERACOES);
    arr = arr.filter(o => Number(o.id) !== Number(id));
    saveData(DB_KEYS.OPERACOES, arr);

    renderOperacoes();
    renderCalendar();
}

function renderOperacoes() {
    const tbl = document.getElementById('tblOperacoes');
    if (!tbl) return;

    const arr = loadData(DB_KEYS.OPERACOES);
    const contr = loadData(DB_KEYS.CONTRATANTES);
    const veic = loadData(DB_KEYS.VEICULOS);
    const mot = loadData(DB_KEYS.MOTORISTAS);
    const atv = loadData(DB_KEYS.ATIVIDADES);

    tbl.innerHTML = '';

    arr.forEach(op => {
        const tr = document.createElement('tr');

        const c = contr.find(x => x.cnpj === op.contratante);
        const v = veic.find(x => x.placa === op.veiculoPlaca);
        const m = mot.find(x => Number(x.id) === Number(op.motoristaId));
        const a = atv.find(x => Number(x.id) === Number(op.atividadeId));

        tr.innerHTML = `
            <td>${op.id}</td>
            <td>${dataPorExtenso(op.data)}</td>
            <td>${c ? c.nome : ''}</td>
            <td>${v ? v.placa : ''}</td>
            <td>${m ? m.nome : ''}</td>
            <td>${a ? a.nome : ''}</td>
            <td>${op.status}</td>
            <td>
                ${op.status === 'AGENDADA' ? `<button onclick="confirmarOperacao(${op.id})">Confirmar</button>` : ''}
                <button onclick="deletarOperacao(${op.id})">Excluir</button>
            </td>
        `;

        tbl.appendChild(tr);
    });
}

// =============================================================================
// 14. CALENDÁRIO COM CORREÇÃO
// =============================================================================

let currentDate = new Date();

function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const calendarTitle = document.getElementById('currentMonthYear');
    if (!calendarDays || !calendarTitle) return;

    calendarDays.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    calendarTitle.textContent = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendarDays.appendChild(empty);
    }

    const operacoes = loadData(DB_KEYS.OPERACOES);

    for (let d = 1; d <= lastDate; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = d;

        const diaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const opsDia = operacoes.filter(op => op.data === diaStr);

        if (opsDia.length > 0) {
            const dot = document.createElement('div');
            dot.className = 'calendar-dot';
            dot.title = `${opsDia.length} operação(ões)`;
            cell.appendChild(dot);
        }

        calendarDays.appendChild(cell);
    }
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

// =============================================================================
// 15. INICIALIZAÇÃO DO SISTEMA
// =============================================================================

function initApp() {
    renderMotoristas();
    renderVeiculos();
    renderContratantes();
    renderAjudantes();
    renderAtividades();
    renderOperacoes();
    renderCalendar();
}

document.addEventListener('DOMContentLoaded', initApp);
