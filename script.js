LINHA 1:
================================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS (COM FIREBASE)
================================================================================

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

window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

function loadData(key) {
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

async function saveData(key, value) {

    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES) {
        // Acesso limitado
    }

    APP_CACHE[key] = value;

    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company;

        try {
            await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            console.log("Salvo na nuvem:", key);
        } catch (err) {
            console.error("Erro ao salvar:", err);
        }

    } else {
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve();
    }
}
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

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

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES) || [];

    const filtradas = ops.filter(op =>
        op && op.veiculoPlaca === placa && Number(op.precoLitro) > 0
    );

    if (!filtradas.length) return 0;

    filtradas.sort((a, b) => new Date(b.data) - new Date(a.data));

    return Number(filtradas[0].precoLitro) || 0;
}
function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;

    const ops = loadData(DB_KEYS.OPERACOES) || [];

    const realizadas = ops.filter(op =>
        op && op.veiculoPlaca === placa && op.status !== 'AGENDADA'
    );

    let totalKm = 0;
    let totalLitros = 0;

    realizadas.forEach(op => {
        totalKm += Number(op.kmRodado) || 0;

        const combustivel = Number(op.combustivel) || 0;
        const preco = Number(op.precoLitro) || 0;

        if (combustivel > 0 && preco > 0) {
            totalLitros += combustivel / preco;
        }
    });

    if (totalLitros <= 0) return 0;

    return totalKm / totalLitros;
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status === 'AGENDADA') return 0;

    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const km = Number(op.kmRodado) || 0;
    if (media <= 0 || km <= 0) return 0;

    let preco = Number(op.precoLitro) || 0;
    if (preco <= 0) preco = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    if (preco <= 0) return 0;

    const litros = km / media;
    return litros * preco;
}
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

function dataPorExtenso(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

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
function gerarNovoIDMotorista() {
    const arr = loadData(DB_KEYS.MOTORISTAS) || [];
    if (!arr.length) return 1;
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function gerarNovoIDAjudante() {
    const arr = loadData(DB_KEYS.AJUDANTES) || [];
    if (!arr.length) return 1;
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function gerarNovoIDAtividade() {
    const arr = loadData(DB_KEYS.ATIVIDADES) || [];
    if (!arr.length) return 1;
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

function showSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(sec => {
        sec.style.display = 'none';
    });

    const sec = document.getElementById(sectionId);
    if (sec) sec.style.display = 'block';

    if (sectionId === 'operacoes') renderOperacoes();
    if (sectionId === 'motoristas') renderMotoristas();
    if (sectionId === 'veiculos') renderVeiculos();
    if (sectionId === 'contratantes') renderContratantes();
    if (sectionId === 'ajudantes') renderAjudantes();
    if (sectionId === 'atividades') renderAtividades();
    if (sectionId === 'calendar') renderCalendar();
}

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

function cadastrarMotorista() {
    const nome = document.getElementById('motoristaNome').value.trim();
    const cpf = onlyDigits(document.getElementById('motoristaCpf').value);

    if (!nome) return alert('Nome obrigatório');
    if (!validarCPF(cpf)) return alert('CPF inválido');

    const arr = loadData(DB_KEYS.MOTORISTAS);
    if (arr.some(m => m.cpf === cpf)) {
        return alert('Já existe motorista com este CPF');
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

function cadastrarContratante() {
    const nome = document.getElementById('contratanteNome').value.trim();
    const cnpj = onlyDigits(document.getElementById('contratanteCnpj').value);

    if (!nome) return alert('Nome obrigatório');
    if (!validarCNPJ(cnpj)) return alert('CNPJ inválido');

    const arr = loadData(DB_KEYS.CONTRATANTES);
    if (arr.some(c => c.cnpj === cnpj)) {
        return alert('Já existe contratante com este CNPJ');
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
function exportarOperacoesCSV() {
    const arr = loadData(DB_KEYS.OPERACOES);
    if (!arr.length) return alert('Nenhuma operação');

    let csv = 'ID;Data;Contratante;Veículo;Motorista;Atividade;KM Rodado;Combustível;Preço/Litro;Status\n';

    const contr = loadData(DB_KEYS.CONTRATANTES);
    const veic = loadData(DB_KEYS.VEICULOS);
    const mot = loadData(DB_KEYS.MOTORISTAS);
    const atv = loadData(DB_KEYS.ATIVIDADES);

    arr.forEach(op => {
        const c = contr.find(x => x.cnpj === op.contratante);
        const v = veic.find(x => x.placa === op.veiculoPlaca);
        const m = mot.find(x => Number(x.id) === Number(op.motoristaId));
        const a = atv.find(x => Number(x.id) === Number(op.atividadeId));

        csv += [
            op.id,
            op.data,
            c ? c.nome : '',
            v ? v.placa : '',
            m ? m.nome : '',
            a ? a.nome : '',
            op.kmRodado,
            op.combustivel,
            op.precoLitro,
            op.status
        ].join(';') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `operacoes_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}
function limparBase() {
    if (!confirm('Deseja apagar todos os dados?')) return;

    Object.values(DB_KEYS).forEach(key => localStorage.removeItem(key));
    initApp();
    alert('Dados apagados!');
}

function importarCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const arr = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';');
            if (cols.length < 10) continue;

            arr.push({
                id: Number(cols[0]),
                data: cols[1],
                contratante: cols[2],
                veiculoPlaca: cols[3],
                motoristaId: cols[4],
                atividadeId: cols[5],
                kmRodado: Number(cols[6]) || 0,
                combustivel: Number(cols[7]) || 0,
                precoLitro: Number(cols[8]) || 0,
                status: cols[9]
            });
        }

        saveData(DB_KEYS.OPERACOES, arr);
        renderOperacoes();
        renderCalendar();

        alert('Importação concluída!');
    };

    reader.readAsText(file, 'UTF-8');
}
function gerarRelatorioDia() {
    const data = document.getElementById('relData').value;
    if (!validarData(data)) return alert('Data inválida');

    const arr = loadData(DB_KEYS.OPERACOES).filter(o => o.data === data);

    const contr = loadData(DB_KEYS.CONTRATANTES);
    const veic = loadData(DB_KEYS.VEICULOS);
    const mot = loadData(DB_KEYS.MOTORISTAS);
    const atv = loadData(DB_KEYS.ATIVIDADES);

    let html = `<h2>Relatório do dia ${dataPorExtenso(data)}</h2>`;

    if (!arr.length) {
        html += `<p>Nenhuma operação</p>`;
    } else {
        html += `<table border="1" cellpadding="5">`;
        html += `<tr>
            <th>ID</th>
            <th>Contratante</th>
            <th>Veículo</th>
            <th>Motorista</th>
            <th>Atividade</th>
            <th>Status</th>
        </tr>`;

        arr.forEach(op => {
            const c = contr.find(x => x.cnpj === op.contratante);
            const v = veic.find(x => x.placa === op.veiculoPlaca);
            const m = mot.find(x => Number(x.id) === Number(op.motoristaId));
            const a = atv.find(x => Number(x.id) === Number(op.atividadeId));

            html += `<tr>
                <td>${op.id}</td>
                <td>${c ? c.nome : ''}</td>
                <td>${v ? v.placa : ''}</td>
                <td>${m ? m.nome : ''}</td>
                <td>${a ? a.nome : ''}</td>
                <td>${op.status}</td>
            </tr>`;
        });

        html += `</table>`;
    }

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}
function validarData(data) {
    return /^\d{4}-\d{2}-\d{2}$/.test(data);
}

function validarPlaca(placa) {
    return /^[A-Z]{3}\d{4}$/.test(placa);
}

function dataPorExtenso(str) {
    const parts = str.split('-');
    if (parts.length !== 3) return str;

    const [y, m, d] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));

    return dt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// fim do arquivo
