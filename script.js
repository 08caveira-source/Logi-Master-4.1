// =============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS
// =============================================================================

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

// Inicializa o banco de dados local se vazio
(function initDB() {
    const keys = Object.values(DB_KEYS);
    keys.forEach(k => {
        if (!localStorage.getItem(k)) {
            localStorage.setItem(k, k === DB_KEYS.MINHA_EMPRESA ? '{}' : '[]');
        }
    });
})();

function loadData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
    } catch (e) {
        return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    }
}

function saveData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    const v = Number(value);
    if (isNaN(v)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(v);
};

// =============================================================================
// 2. FUNÇÕES HELPER (GETTERS)
// =============================================================================

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 3. CÁLCULOS DE FROTA
// =============================================================================

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    const opsComPreco = todasOps.filter(op => op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    if (!opsComPreco.length) return 0;
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(opsComPreco[0].precoLitro);
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa);
    let kmTotal = 0;
    let litrosTotal = 0;

    ops.forEach(op => {
        if (op.kmRodado) kmTotal += Number(op.kmRodado);
        if (Number(op.combustivel) > 0 && Number(op.precoLitro) > 0) {
            litrosTotal += (Number(op.combustivel) / Number(op.precoLitro));
        }
    });

    if (litrosTotal === 0) return 0;
    return kmTotal / litrosTotal;
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca || !op.kmRodado) return 0;
    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if (media === 0) return 0;

    let preco = Number(op.precoLitro);
    if (!preco || preco <= 0) preco = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    if (preco === 0) return 0;

    const litrosEstimados = Number(op.kmRodado) / media;
    return litrosEstimados * preco;
}

// =============================================================================
// 4. FORMATADORES E UI
// =============================================================================

function formatCPF_CNPJ(value) {
    const d = onlyDigits(value);
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}

function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

function copyToClipboard(text) {
    if (!text) return alert('Nada para copiar.');
    navigator.clipboard.writeText(text).then(() => alert('Copiado!'), () => alert('Erro ao copiar.'));
}

function toggleCursoInput() {
    const el = document.getElementById('motoristaTemCurso');
    if(!el) return;
    const val = el.value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
}

// Modais
function openViewModal(title, html) {
    document.getElementById('viewItemTitle').textContent = title;
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'block';
}
function closeViewModal() { document.getElementById('viewItemModal').style.display = 'none'; }

function openOperationDetails(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBodyContent').innerHTML = html;
    document.getElementById('operationDetailsModal').style.display = 'block';
}
function closeModal() { document.getElementById('operationDetailsModal').style.display = 'none'; }

// Ajudantes Modal
let _pendingAjudante = null;
function openAdicionarAjudanteModal(ajudanteObj, cb) {
    _pendingAjudante = { obj: ajudanteObj, cb: cb };
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 100);
}
function closeAdicionarAjudanteModal() {
    _pendingAjudante = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}
// Evento botão ajudante (Global Listener)
document.addEventListener('click', (e) => {
    if (e.target.id === 'modalAjudanteAddBtn') {
        const val = Number(document.getElementById('modalDiariaInput').value);
        if (_pendingAjudante) {
            _pendingAjudante.cb({ id: _pendingAjudante.obj.id, diaria: val });
            closeAdicionarAjudanteModal();
        }
    }
});

// =============================================================================
// 5. LÓGICA DE OPERAÇÃO (AJUDANTES)
// =============================================================================
window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    const id = Number(sel.value);
    
    const exists = window._operacaoAjudantesTempList.some(a => Number(a.id) === id);
    if (exists) {
        alert('Ajudante já adicionado.');
        sel.value = "";
        return;
    }

    const aj = getAjudante(id);
    if (aj) {
        openAdicionarAjudanteModal(aj, (item) => {
            window._operacaoAjudantesTempList.push(item);
            renderAjudantesAdicionadosList();
            sel.value = "";
        });
    }
}

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    const arr = window._operacaoAjudantesTempList;
    if (!arr.length) {
        list.innerHTML = '<li style="color:#777">Nenhum ajudante.</li>';
        return;
    }
    list.innerHTML = arr.map(a => {
        const aj = getAjudante(a.id) || { nome: 'Desconhecido' };
        return `<li>${aj.nome} - ${formatCurrency(a.diaria)} 
        <button type="button" class="btn-mini" onclick="removeAjudanteFromOperation(${a.id})">X</button></li>`;
    }).join('');
}

function removeAjudanteFromOperation(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => Number(a.id) !== id);
    renderAjudantesAdicionadosList();
}

// =============================================================================
// 6. POPULATE, TABELAS E RENDERIZAÇÃO
// =============================================================================

// Função corrigida que estava faltando e travava o script
function renderCadastroTable(dbKey, tableId, columns, idField = 'id') {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    
    const data = loadData(dbKey);
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let colsHtml = columns.map(col => `<td>${item[col] || '-'}</td>`).join('');
        // Botões de ação
        const itemId = item[idField];
        const actionsHtml = `
            <td>
                <button type="button" class="btn-action edit-btn" onclick="editCadastroItem('${dbKey}', '${itemId}')"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-action delete-btn" onclick="deleteItem('${dbKey}', '${itemId}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        return `<tr>${colsHtml}${actionsHtml}</tr>`;
    }).join('');
}

function populateAllSelects() {
    const dataMap = {
        'selectMotoristaOperacao': { key: DB_KEYS.MOTORISTAS, val: 'id', txt: 'nome' },
        'selectVeiculoOperacao': { key: DB_KEYS.VEICULOS, val: 'placa', txt: 'placa' },
        'selectContratanteOperacao': { key: DB_KEYS.CONTRATANTES, val: 'cnpj', txt: 'razaoSocial' },
        'selectAtividadeOperacao': { key: DB_KEYS.ATIVIDADES, val: 'id', txt: 'nome' },
        'selectAjudantesOperacao': { key: DB_KEYS.AJUDANTES, val: 'id', txt: 'nome' },
        'selectVeiculoDespesaGeral': { key: DB_KEYS.VEICULOS, val: 'placa', txt: 'placa' },
        'selectVeiculoRelatorio': { key: DB_KEYS.VEICULOS, val: 'placa', txt: 'placa' },
        'selectMotoristaRelatorio': { key: DB_KEYS.MOTORISTAS, val: 'id', txt: 'nome' },
        'selectContratanteRelatorio': { key: DB_KEYS.CONTRATANTES, val: 'cnpj', txt: 'razaoSocial' },
        'selectVeiculoRecibo': { key: DB_KEYS.VEICULOS, val: 'placa', txt: 'placa' },
        'selectContratanteRecibo': { key: DB_KEYS.CONTRATANTES, val: 'cnpj', txt: 'razaoSocial' }
    };

    for (const [id, cfg] of Object.entries(dataMap)) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dados = loadData(cfg.key);
        // Preserva a opção "Selecione..." se existir
        const firstOpt = el.querySelector('option[value=""]'); 
        el.innerHTML = '';
        if (firstOpt) el.appendChild(firstOpt);
        
        dados.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d[cfg.val];
            opt.textContent = d[cfg.txt];
            el.appendChild(opt);
        });
    }

    // Select Especial do Recibo (Motorista + Ajudante)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = '<option value="">SELECIONE...</option>';
        loadData(DB_KEYS.MOTORISTAS).forEach(m => {
            selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`;
        });
        loadData(DB_KEYS.AJUDANTES).forEach(a => {
            selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`;
        });
    }

    // Renderiza Tabelas de Cadastro
    renderCadastroTable(DB_KEYS.MOTORISTAS, 'tabelaMotoristas', ['id', 'nome', 'documento']);
    renderCadastroTable(DB_KEYS.VEICULOS, 'tabelaVeiculos', ['placa', 'modelo', 'ano'], 'placa');
    renderCadastroTable(DB_KEYS.CONTRATANTES, 'tabelaContratantes', ['cnpj', 'razaoSocial', 'telefone'], 'cnpj');
    renderCadastroTable(DB_KEYS.AJUDANTES, 'tabelaAjudantes', ['id', 'nome', 'documento']);
    renderCadastroTable(DB_KEYS.ATIVIDADES, 'tabelaAtividades', ['id', 'nome'], 'id');
    
    renderMinhaEmpresaInfo();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    if (emp && emp.razaoSocial) {
        div.innerHTML = `<p><strong>${emp.razaoSocial}</strong><br>CNPJ: ${emp.cnpj}<br>Tel: ${emp.telefone}</p>`;
    } else div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO CADASTRADO.</p>`;
}

// =============================================================================
// 7. CRUD GERAL
// =============================================================================

function deleteItem(key, id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;
    let data = loadData(key);
    
    const idField = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    
    // Filtra removendo o item
    data = data.filter(d => String(d[idField]) !== String(id));
    
    saveData(key, data);
    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    updateDashboardStats();
    renderCharts();
    alert('Registro excluído!');
}

function editCadastroItem(key, id) {
    const data = loadData(key);
    const idField = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    const item = data.find(d => String(d[idField]) === String(id));
    
    if (!item) return;

    if (key === DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaId').value = item.id;
        document.getElementById('motoristaNome').value = item.nome;
        document.getElementById('motoristaDocumento').value = item.documento;
        document.getElementById('motoristaTelefone').value = item.telefone;
        document.getElementById('motoristaCNH').value = item.cnh;
        document.getElementById('motoristaValidadeCNH').value = item.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = item.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = item.temCurso ? 'sim' : 'nao';
        document.getElementById('motoristaCursoDescricao').value = item.cursoDescricao;
        document.getElementById('motoristaPix').value = item.pix;
        toggleCursoInput();
        // Ativar aba
        document.querySelector('[data-tab="motoristas"]').click();

    } else if (key === DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa; // old ID reference
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.getElementById('veiculoRenavam').value = item.renavam;
        document.getElementById('veiculoChassi').value = item.chassi;
        document.querySelector('[data-tab="veiculos"]').click();

    } else if (key === DB_KEYS.CONTRATANTES) {
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteTelefone').value = item.telefone;
        document.querySelector('[data-tab="contratantes"]').click();

    } else if (key === DB_KEYS.AJUDANTES) {
        document.getElementById('ajudanteId').value = item.id;
        document.getElementById('ajudanteNome').value = item.nome;
        document.getElementById('ajudanteDocumento').value = item.documento;
        document.getElementById('ajudanteTelefone').value = item.telefone;
        document.getElementById('ajudanteEndereco').value = item.endereco;
        document.getElementById('ajudantePix').value = item.pix;
        document.querySelector('[data-tab="ajudantes"]').click();

    } else if (key === DB_KEYS.ATIVIDADES) {
        document.getElementById('atividadeId').value = item.id;
        document.getElementById('atividadeNome').value = item.nome;
        document.querySelector('[data-tab="atividades"]').click();
    }
    
    // Rola para o topo do formulário
    document.querySelector('.cadastro-form.active').scrollIntoView({ behavior: 'smooth' });
}

// =============================================================================
// 8. OPERAÇÕES (CRUD)
// =============================================================================

function renderOperacaoTable() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a, b) => new Date(b.data) - new Date(a.data));

    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhuma operação lançada.</td></tr>';
        return;
    }

    tbody.innerHTML = ops.map(op => {
        const motName = getMotorista(op.motoristaId)?.nome || 'N/A';
        const atvName = getAtividade(op.atividadeId)?.nome || 'N/A';
        
        const custoDiesel = calcularCustoConsumoViagem(op);
        const totalDiarias = (op.ajudantes || []).reduce((acc, cur) => acc + (Number(cur.diaria) || 0), 0);
        const custos = (Number(op.comissao) || 0) + (Number(op.despesas) || 0) + totalDiarias + custoDiesel;
        const liquido = (Number(op.faturamento) || 0) - custos;
        
        const color = liquido >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');

        return `<tr>
            <td>${dataFmt}</td>
            <td>${motName}</td>
            <td>${atvName}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${color}; font-weight:bold;">${formatCurrency(liquido)}</td>
            <td>
                <button type="button" class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button type="button" class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function editOperacaoItem(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    // Preenche o form
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId;
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || 0; 
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderAjudantesAdicionadosList();
    
    // Troca para a aba de operações
    document.querySelector('[data-page="operacoes"]').click();
    document.getElementById('formOperacao').scrollIntoView({ behavior: 'smooth' });
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    
    const totalDiarias = (op.ajudantes || []).reduce((acc, cur) => acc + (Number(cur.diaria) || 0), 0);
    const custoDiesel = calcularCustoConsumoViagem(op);
    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    
    const faturamento = Number(op.faturamento) || 0;
    const adiantamento = Number(op.adiantamento) || 0;
    const saldoReceber = faturamento - adiantamento;
    
    const custos = (Number(op.comissao) || 0) + (Number(op.despesas) || 0) + totalDiarias + custoDiesel;
    const lucro = faturamento - custos;

    const html = `
    <div style="font-size:0.95rem;">
        <p><strong>DATA:</strong> ${new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca} <strong>| KM NO DIA:</strong> ${op.kmRodado || 0} KM</p>
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <hr style="margin:10px 0; border:0; border-bottom:1px solid #eee;">
        <p><strong>FATURAMENTO:</strong> ${formatCurrency(faturamento)}</p>
        <p style="color:var(--warning-color);"><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
        <p style="font-weight:bold">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
        <hr style="margin:10px 0; border:0; border-bottom:1px solid #eee;">
        <p><strong>CUSTOS DA VIAGEM:</strong></p>
        <ul style="list-style:none; padding-left:10px; font-size:0.9rem; color:#555;">
            <li>Comissão: ${formatCurrency(op.comissao)}</li>
            <li>Pedágios/Desp: ${formatCurrency(op.despesas)}</li>
            <li>Ajudantes: ${formatCurrency(totalDiarias)}</li>
            <li>Diesel (Est. ${media.toFixed(2)} km/l): ${formatCurrency(custoDiesel)}</li>
        </ul>
        <hr style="margin:10px 0; border:0; border-bottom:1px solid #eee;">
        <h3 style="text-align:center; color:${lucro >= 0 ? 'green' : 'red'}">
            LUCRO: ${formatCurrency(lucro)}
        </h3>
    </div>`;
    
    openOperationDetails('DETALHES DA OPERAÇÃO', html);
}

// =============================================================================
// 9. CALENDÁRIO E DASHBOARD
// =============================================================================
let currentDate = new Date();

function changeMonth(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderCalendar(currentDate);
    updateDashboardStats();
}

function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    
    if (!grid || !title) return;

    const y = date.getFullYear();
    const m = date.getMonth();
    
    title.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    grid.innerHTML = '';

    // Headers
    const days = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    days.forEach(d => {
        grid.innerHTML += `<div class="day-label">${d}</div>`;
    });

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Células vazias
    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += `<div class="day-cell empty"></div>`;
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    // Dias do mês
    for(let d=1; d<=daysInMonth; d++) {
        // Formato YYYY-MM-DD
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayOps = ops.filter(o => o.data === dateStr);
        
        const cell = document.createElement('div');
        cell.className = dayOps.length > 0 ? 'day-cell has-operation' : 'day-cell';
        cell.innerHTML = `<span>${d}</span>${dayOps.length > 0 ? '<div class="event-dot"></div>' : ''}`;
        
        if(dayOps.length > 0) {
            cell.onclick = () => {
                const html = dayOps.map(op => {
                    const mot = getMotorista(op.motoristaId)?.nome || '-';
                    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
                    const fat = Number(op.faturamento)||0;
                    const adt = Number(op.adiantamento)||0;
                    const saldo = fat - adt;
                    
                    return `
                    <div class="modal-operation-block">
                        <strong>VEÍCULO:</strong> ${op.veiculoPlaca} <br>
                        <strong>KM:</strong> ${op.kmRodado || 0} KM<br>
                        <strong>MOTORISTA:</strong> ${mot} <br>
                        <strong>CLIENTE:</strong> ${cli} <br>
                        <span style="color:var(--primary-color)">FAT: ${formatCurrency(fat)}</span> | 
                        <span style="color:red">ADT: ${formatCurrency(adt)}</span> <br>
                        <strong>SALDO: ${formatCurrency(saldo)}</strong>
                        <div style="margin-top:8px; text-align:right;">
                             <button class="btn-mini" onclick="editOperacaoItem(${op.id}); closeModal();">EDITAR</button>
                             <button class="btn-mini" onclick="viewOperacaoDetails(${op.id}); closeModal();">VER DETALHES</button>
                        </div>
                    </div>`;
                }).join('');
                openOperationDetails(`OPERAÇÕES DO DIA ${d}/${m+1}`, html);
            };
        }
        grid.appendChild(cell);
    }
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();

    const opsMes = ops.filter(o => {
        const d = new Date(o.data + 'T00:00:00');
        return d.getMonth() === m && d.getFullYear() === y;
    });
    
    const fatTotal = opsMes.reduce((acc, o) => acc + (Number(o.faturamento) || 0), 0);
    
    const custoOpTotal = opsMes.reduce((acc, o) => {
        const diesel = calcularCustoConsumoViagem(o);
        const diarias = (o.ajudantes || []).reduce((a, b) => a + (Number(b.diaria) || 0), 0);
        return acc + (Number(o.comissao) || 0) + (Number(o.despesas) || 0) + diarias + diesel;
    }, 0);

    const despGeraisTotal = despesas
        .filter(d => {
            const dd = new Date(d.data + 'T00:00:00');
            return dd.getMonth() === m && dd.getFullYear() === y;
        })
        .reduce((acc, d) => acc + (Number(d.valor) || 0), 0);

    const custoTotal = custoOpTotal + despGeraisTotal;
    const lucroLiquido = fatTotal - custoTotal;

    const elFat = document.getElementById('faturamentoMes');
    if(elFat) elFat.textContent = formatCurrency(fatTotal);
    
    const elDesp = document.getElementById('despesasMes');
    if(elDesp) elDesp.textContent = formatCurrency(custoTotal);
    
    const elRec = document.getElementById('receitaMes');
    if(elRec) elRec.textContent = formatCurrency(lucroLiquido);
}

// =============================================================================
// 10. GRÁFICOS
// =============================================================================
let mainChart = null;

function renderCharts() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const labels = [];
    const dataDiesel = [];
    const dataOutros = [];
    const dataLucro = [];
    const dataKM = [];
    const dataReceitaTotal = [];

    for(let i=5; i>=0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        
        labels.push(d.toLocaleDateString('pt-BR', {month:'short', year:'2-digit'}).toUpperCase());

        const opsMes = ops.filter(o => {
            const od = new Date(o.data + 'T00:00:00');
            return od.getMonth() === m && od.getFullYear() === y;
        });

        let sumFat = 0, sumDiesel = 0, sumOutros = 0, sumKM = 0;

        opsMes.forEach(op => {
            sumFat += (Number(op.faturamento)||0);
            sumKM += (Number(op.kmRodado)||0);
            sumDiesel += calcularCustoConsumoViagem(op);
            
            const diarias = (op.ajudantes||[]).reduce((a,b)=>a+(Number(b.diaria)||0),0);
            sumOutros += (Number(op.comissao)||0) + (Number(op.despesas)||0) + diarias;
        });

        const despGerais = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => {
            const dd = new Date(d.data+'T00:00:00');
            return dd.getMonth() === m && dd.getFullYear() === y;
        }).reduce((a,b) => a + (Number(b.valor)||0), 0);

        sumOutros += despGerais;

        dataReceitaTotal.push(sumFat);
        dataDiesel.push(sumDiesel);
        dataOutros.push(sumOutros);
        dataLucro.push(sumFat - (sumDiesel + sumOutros));
        dataKM.push(sumKM);
    }

    const totalHist = ops.reduce((a,b)=>a+(Number(b.faturamento)||0),0);
    const elHist = document.getElementById('receitaTotalHistorico');
    if(elHist) elHist.textContent = formatCurrency(totalHist);

    if (mainChart) mainChart.destroy();

    const revenueDataSafe = dataReceitaTotal;

    mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'LUCRO', data: dataLucro, backgroundColor: '#4caf50', stack: 'Stack 0', order: 1 },
                { label: 'DIESEL (EST.)', data: dataDiesel, backgroundColor: '#f44336', stack: 'Stack 0', order: 2 },
                { label: 'OUTROS CUSTOS', data: dataOutros, backgroundColor: '#ff9800', stack: 'Stack 0', order: 3 },
                { label: 'KM RODADO', data: dataKM, type: 'line', borderColor: '#37474f', borderWidth: 2, yAxisID: 'y1', order: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true },
                y1: { position: 'right', beginAtZero: true, grid: {drawOnChartArea:false} }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            let label = ctx.dataset.label || '';
                            let val = ctx.parsed.y;
                            
                            if (ctx.dataset.type === 'line') {
                                return `${label}: ${val.toFixed(1)} KM`;
                            }

                            const receitaMes = revenueDataSafe[ctx.dataIndex];
                            let pct = 0;
                            if (receitaMes > 0) pct = (val / receitaMes) * 100;

                            return `${label}: ${formatCurrency(val)} (${pct.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// =============================================================================
// 11. RELATÓRIOS
// =============================================================================

function gerarRelatorioCobranca() {
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!iniVal || !fimVal) return alert('SELECIONE AS DATAS.');
    if (!conCnpj) return alert('SELECIONE UMA CONTRATANTE PARA GERAR O RELATÓRIO DE COBRANÇA.');

    const ini = new Date(iniVal + 'T00:00:00');
    const fim = new Date(fimVal + 'T23:59:59');
    const contratante = getContratante(conCnpj);
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        const d = new Date(op.data + 'T00:00:00');
        return d >= ini && d <= fim && op.contratanteCNPJ === conCnpj;
    }).sort((a, b) => new Date(a.data) - new Date(b.data));

    if (ops.length === 0) return alert('NENHUMA OPERAÇÃO ENCONTRADA PARA ESTE CLIENTE NO PERÍODO.');

    let totalSaldo = 0;
    let rows = '';
    ops.forEach(op => {
        const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const vec = op.veiculoPlaca;
        const ativ = getAtividade(op.atividadeId)?.nome || '-';
        const fat = Number(op.faturamento) || 0;
        const adiant = Number(op.adiantamento) || 0;
        const saldo = fat - adiant;
        totalSaldo += saldo;

        rows += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;">${d}</td>
                <td style="padding:8px;">${vec}</td>
                <td style="padding:8px;">${ativ}</td>
                <td style="padding:8px; text-align:right;">${formatCurrency(fat)}</td>
                <td style="padding:8px; text-align:right; color: var(--danger-color);">${formatCurrency(adiant)}</td>
                <td style="padding:8px; text-align:right; font-weight:bold;">${formatCurrency(saldo)}</td>
            </tr>
        `;
    });
    const empresa = getMinhaEmpresa();
    const nomeEmpresa = empresa.razaoSocial || 'MINHA EMPRESA';
    const cnpjEmpresa = empresa.cnpj ? formatCPF_CNPJ(empresa.cnpj) : '';

    const textoZap = `*RELATÓRIO DE COBRANÇA - ${nomeEmpresa}*\nCLIENTE: ${contratante.razaoSocial}\nPERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}\n\nTOTAL LÍQUIDO A PAGAR: *${formatCurrency(totalSaldo)}*`;
    const btnZap = document.getElementById('btnWhatsappReport');
    if (btnZap) {
        btnZap.href = `https://wa.me/?text=${encodeURIComponent(textoZap)}`;
        btnZap.style.display = 'inline-flex';
    }

    const html = `
        <div class="report-container" style="max-width:800px; padding:40px;">
            <div style="text-align:center; margin-bottom:30px; border-bottom:2px solid var(--primary-color); padding-bottom:20px;">
                <h2 style="color:var(--primary-color); margin-bottom:5px;">RELATÓRIO DE COBRANÇA</h2>
                <p style="font-size:1.1rem; font-weight:bold;">${nomeEmpresa}</p>
                <p style="font-size:0.9rem;">${cnpjEmpresa}</p>
            </div>
            <div style="margin-bottom:30px; background:#f9f9f9; padding:15px; border-radius:8px;">
                <p><strong>CLIENTE:</strong> ${contratante.razaoSocial}</p>
                <p><strong>CNPJ:</strong> ${formatCPF_CNPJ(contratante.cnpj)}</p>
                <p><strong>PERÍODO:</strong> ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                <thead style="background:#eee;">
                    <tr>
                        <th style="padding:10px; text-align:left;">DATA</th>
                        <th style="padding:10px; text-align:left;">VEÍCULO</th>
                        <th style="padding:10px; text-align:left;">ATIVIDADE</th>
                        <th style="padding:10px; text-align:right;">TOTAL</th>
                        <th style="padding:10px; text-align:right;">ADIANT.</th>
                        <th style="padding:10px; text-align:right;">SALDO</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#e0f2f1; font-weight:bold;">
                        <td colspan="5" style="padding:10px; text-align:right;">TOTAL A PAGAR (LÍQUIDO):</td>
                        <td style="padding:10px; text-align:right; font-size:1.2rem; color:var(--primary-color);">${formatCurrency(totalSaldo)}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="margin-top:40px; text-align:center; font-size:0.9rem; color:#777;"><p>DOCUMENTO PARA FINS DE CONFERÊNCIA E COBRANÇA.</p><p>DATA DE EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}</p></div>
        </div>
    `;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

function gerarRelatorio(e) {
    e.preventDefault();
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    
    if (!ini || !fim) return alert('Preencha as datas de início e fim.');

    const dIni = new Date(ini + 'T00:00:00');
    const dFim = new Date(fim + 'T23:59:59');

    // Filtros
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const veicPlaca = document.getElementById('selectVeiculoRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        const d = new Date(o.data + 'T00:00:00');
        if (d < dIni || d > dFim) return false;
        if (motId && String(o.motoristaId) !== motId) return false;
        if (veicPlaca && o.veiculoPlaca !== veicPlaca) return false;
        if (conCnpj && o.contratanteCNPJ !== conCnpj) return false;
        return true;
    });

    if (ops.length === 0) return alert('Nenhum dado encontrado com esses filtros.');

    // Cálculos simples para exibição
    const totalFat = ops.reduce((a,b) => a + (Number(b.faturamento)||0), 0);
    const totalLucro = ops.reduce((acc, o) => {
         const custo = (Number(o.comissao)||0) + (Number(o.despesas)||0) + calcularCustoConsumoViagem(o);
         return acc + ((Number(o.faturamento)||0) - custo);
    }, 0);

    const html = `
        <div style="padding:20px;">
            <h3>RESUMO GERENCIAL</h3>
            <p><strong>PERÍODO:</strong> ${dIni.toLocaleDateString('pt-BR')} a ${dFim.toLocaleDateString('pt-BR')}</p>
            <p><strong>OPERAÇÕES ENCONTRADAS:</strong> ${ops.length}</p>
            <hr>
            <p><strong>FATURAMENTO TOTAL:</strong> ${formatCurrency(totalFat)}</p>
            <p><strong>LUCRO ESTIMADO:</strong> ${formatCurrency(totalLucro)}</p>
            <p style="color:#777; font-size:0.8rem; margin-top:10px;">Para detalhes completos, use o Relatório de Cobrança ou exporte os dados.</p>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('btnWhatsappReport').style.display = 'none'; // Esconde zap no gerencial simples
    document.getElementById('reportResults').style.display = 'block';
}

function exportReportToPDF() {
    const element = document.getElementById('reportContent');
    if (!element || !element.innerHTML || element.innerHTML.trim() === "") return alert('Gere um relatório primeiro.');
    
    const opt = {
        margin: 10,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

// =============================================================================
// 12. RECIBOS
// =============================================================================

function setupReciboListeners() {
    const btnGerar = document.getElementById('btnGerarRecibo');
    if(!btnGerar) return;

    btnGerar.addEventListener('click', () => {
        const comp = document.getElementById('selectMotoristaRecibo').value;
        const ini = document.getElementById('dataInicioRecibo').value;
        const fim = document.getElementById('dataFimRecibo').value;
        const placa = document.getElementById('selectVeiculoRecibo').value;
        const cnpj = document.getElementById('selectContratanteRecibo').value;
        
        if (!comp || !ini || !fim) return alert('Selecione o Beneficiário e as Datas.');
        
        const [tipo, id] = comp.split(':');
        const pessoa = tipo === 'motorista' ? getMotorista(id) : getAjudante(id);
        if(!pessoa) return alert('Beneficiário não encontrado.');

        const empresa = getMinhaEmpresa();
        
        const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
            const d = new Date(o.data+'T00:00:00');
            const range = d >= new Date(ini+'T00:00:00') && d <= new Date(fim+'T23:59:59');
            if (!range) return false;
            if (placa && o.veiculoPlaca !== placa) return false;
            if (cnpj && o.contratanteCNPJ !== cnpj) return false;

            if (tipo === 'motorista') return String(o.motoristaId) === id;
            // Se ajudante, verificar se está na lista de ajudantes da operação
            return (o.ajudantes||[]).some(a => String(a.id) === id);
        });
        
        if (!ops.length) return alert('Nenhum pagamento encontrado no período.');
        
        let total = 0;
        const rows = ops.map(o => {
            let val = 0;
            let desc = '';
            if (tipo === 'motorista') {
                val = Number(o.comissao) || 0;
                desc = `COMISSÃO - ${o.veiculoPlaca}`;
            } else {
                const aj = o.ajudantes.find(x => String(x.id) === id);
                val = aj ? (Number(aj.diaria)||0) : 0;
                desc = `DIÁRIA - ${o.veiculoPlaca}`;
            }
            total += val;
            return `<tr>
                <td>${new Date(o.data+'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${desc}</td>
                <td style="text-align:right">${formatCurrency(val)}</td>
            </tr>`;
        }).join('');
        
        const html = `
        <div class="recibo-template">
            <div class="recibo-header">
                <h3>RECIBO DE PAGAMENTO</h3>
                <p>Nº CONTROLE: ${Date.now().toString().slice(-6)}</p>
            </div>
            <div class="recibo-info">
                <p><strong>PAGADOR:</strong> ${empresa.razaoSocial || 'MINHA EMPRESA'}</p>
                <p><strong>CNPJ:</strong> ${empresa.cnpj || '-'}</p>
                <br>
                <p><strong>BENEFICIÁRIO:</strong> ${pessoa.nome}</p>
                <p><strong>DOCUMENTO:</strong> ${pessoa.documento}</p>
            </div>
            <table class="recibo-detalhes-tabela">
                <thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th style="text-align:right">VALOR</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="recibo-total">TOTAL LÍQUIDO: ${formatCurrency(total)}</p>
            <div class="recibo-assinaturas">
                <div>ASSINATURA DO PAGADOR</div>
                <div>ASSINATURA DO BENEFICIÁRIO</div>
            </div>
        </div>`;
        
        document.getElementById('reciboContent').innerHTML = html;
        document.getElementById('reciboTitle').style.display = 'block';
        document.getElementById('btnBaixarRecibo').style.display = 'inline-flex';
        
        document.getElementById('btnBaixarRecibo').onclick = () => {
            const el = document.querySelector('.recibo-template');
            html2pdf(el).save('recibo_pagamento.pdf');
        };
    });
}

// =============================================================================
// 13. TABELA DE DESPESAS GERAIS
// =============================================================================
function renderDespesasTable() {
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    const data = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b)=> new Date(b.data)-new Date(a.data));
    if(data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Sem registros.</td></tr>'; return; }
    tbody.innerHTML = data.map(d => `
        <tr>
            <td>${new Date(d.data+'T00:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td><button class="btn-mini" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})">X</button></td>
        </tr>`).join('');
}

// =============================================================================
// 14. BACKUP E RESET
// =============================================================================

function exportDataBackup() {
    const backup = {};
    Object.values(DB_KEYS).forEach(key => {
        backup[key] = loadData(key);
    });
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "backup_logimaster_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            Object.values(DB_KEYS).forEach(key => {
                if (json[key]) {
                    saveData(key, json[key]);
                }
            });
            alert('Backup restaurado com sucesso! A página será recarregada.');
            location.reload();
        } catch (err) {
            alert('Erro ao ler arquivo de backup.');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function fullSystemReset() {
    if(confirm('ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DO SISTEMA PERMANENTEMENTE.\n\nTem certeza absoluta?')) {
        if(confirm('Última chance: Confirma a exclusão total?')) {
            localStorage.clear();
            alert('Sistema resetado. Recarregando...');
            location.reload();
        }
    }
}

// =============================================================================
// 15. FORM HANDLERS
// =============================================================================
function setupFormHandlers() {
    
    // --- MOTORISTA ---
    document.getElementById('formMotorista')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.MOTORISTAS);
        const idField = document.getElementById('motoristaId').value;
        const isEdit = !!idField;
        const newId = isEdit ? Number(idField) : Date.now();

        const obj = {
            id: newId,
            nome: document.getElementById('motoristaNome').value.toUpperCase(),
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
            temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
            cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
            pix: document.getElementById('motoristaPix').value
        };

        let newData;
        if(isEdit) {
            newData = data.map(i => String(i.id) === String(newId) ? obj : i);
        } else {
            newData = [...data, obj];
        }
        
        saveData(DB_KEYS.MOTORISTAS, newData);
        alert('Motorista Salvo!');
        e.target.reset();
        document.getElementById('motoristaId').value = '';
        populateAllSelects();
    });

    // --- VEÍCULO ---
    document.getElementById('formVeiculo')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.VEICULOS);
        const oldPlaca = document.getElementById('veiculoId').value; 
        const newPlaca = document.getElementById('veiculoPlaca').value.toUpperCase();
        
        const obj = {
            placa: newPlaca,
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value.toUpperCase()
        };

        // Se mudou a placa na edição, precisamos remover a antiga
        let newData = data.filter(v => v.placa !== oldPlaca && v.placa !== newPlaca);
        newData.push(obj);
        
        saveData(DB_KEYS.VEICULOS, newData);
        alert('Veículo Salvo!');
        e.target.reset();
        document.getElementById('veiculoId').value = '';
        populateAllSelects();
    });

    // --- CONTRATANTE ---
    document.getElementById('formContratante')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.CONTRATANTES);
        const oldCnpj = document.getElementById('contratanteId').value;
        const newCnpj = document.getElementById('contratanteCNPJ').value;
        
        const obj = {
            cnpj: newCnpj,
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        };

        let newData = data.filter(c => c.cnpj !== oldCnpj && c.cnpj !== newCnpj);
        newData.push(obj);

        saveData(DB_KEYS.CONTRATANTES, newData);
        alert('Contratante Salva!');
        e.target.reset();
        document.getElementById('contratanteId').value = '';
        populateAllSelects();
    });

    // --- AJUDANTE ---
    document.getElementById('formAjudante')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.AJUDANTES);
        const idVal = document.getElementById('ajudanteId').value;
        const id = idVal ? Number(idVal) : Date.now();

        const obj = {
            id: id,
            nome: document.getElementById('ajudanteNome').value.toUpperCase(),
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value
        };

        let newData = data.filter(a => String(a.id) !== String(id));
        newData.push(obj);

        saveData(DB_KEYS.AJUDANTES, newData);
        alert('Ajudante Salvo!');
        e.target.reset();
        document.getElementById('ajudanteId').value = '';
        populateAllSelects();
    });

    // --- ATIVIDADE ---
    document.getElementById('formAtividade')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.ATIVIDADES);
        const idVal = document.getElementById('atividadeId').value;
        const id = idVal ? Number(idVal) : Date.now();

        const obj = {
            id: id,
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        };

        let newData = data.filter(a => String(a.id) !== String(id));
        newData.push(obj);

        saveData(DB_KEYS.ATIVIDADES, newData);
        alert('Atividade Salva!');
        e.target.reset();
        document.getElementById('atividadeId').value = '';
        populateAllSelects();
    });

    // --- MINHA EMPRESA ---
    document.getElementById('formMinhaEmpresa')?.addEventListener('submit', e => {
        e.preventDefault();
        const obj = {
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
            cnpj: document.getElementById('minhaEmpresaCNPJ').value,
            telefone: document.getElementById('minhaEmpresaTelefone').value
        };
        saveData(DB_KEYS.MINHA_EMPRESA, obj);
        alert('Dados da Empresa Salvos!');
        renderMinhaEmpresaInfo();
    });

    // --- OPERAÇÃO ---
    document.getElementById('formOperacao')?.addEventListener('submit', e => {
        e.preventDefault();
        const id = document.getElementById('operacaoId').value;
        const data = loadData(DB_KEYS.OPERACOES);
        const newId = id ? Number(id) : Date.now();
        
        const obj = {
            id: newId,
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
            ajudantes: window._operacaoAjudantesTempList
        };

        if (id) {
            const idx = data.findIndex(x => x.id == id);
            if (idx >= 0) data[idx] = obj;
        } else {
            data.push(obj);
        }
        saveData(DB_KEYS.OPERACOES, data);
        
        e.target.reset();
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        renderAjudantesAdicionadosList();
        
        renderOperacaoTable();
        renderCalendar(currentDate);
        updateDashboardStats();
        renderCharts();
        alert('Operação Salva com Sucesso!');
    });

    // --- DESPESA GERAL ---
    document.getElementById('formDespesaGeral')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.DESPESAS_GERAIS);
        const parcels = Number(document.getElementById('despesaParcelas').value) || 1;
        const baseVal = Number(document.getElementById('despesaGeralValor').value);
        const baseDate = new Date(document.getElementById('despesaGeralData').value + 'T00:00:00');
        const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
        const placa = document.getElementById('selectVeiculoDespesaGeral').value;

        for(let i=0; i<parcels; i++) {
            const dt = new Date(baseDate);
            dt.setMonth(dt.getMonth() + i);
            data.push({
                id: Date.now() + i,
                data: dt.toISOString().split('T')[0],
                veiculoPlaca: placa,
                descricao: parcels > 1 ? `${desc} (${i+1}/${parcels})` : desc,
                valor: baseVal / parcels
            });
        }
        saveData(DB_KEYS.DESPESAS_GERAIS, data);
        e.target.reset();
        renderDespesasTable();
        updateDashboardStats();
        renderCharts();
        alert('Despesas Salvas!');
    });
}

// =============================================================================
// 16. INIT
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Navegação Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active de tudo
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Ativa o clicado
            btn.classList.add('active');
            const pageId = btn.getAttribute('data-page');
            const pageEl = document.getElementById(pageId);
            if(pageEl) {
                pageEl.classList.add('active');
                if(pageId === 'graficos') renderCharts();
            }
            // Fecha sidebar no mobile ao clicar
            if(window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebarOverlay').classList.remove('active');
            }
        });
    });

    // Tabs de Cadastro
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    // Mobile Menu
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if(mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('active');
        });
    }
    const overlay = document.getElementById('sidebarOverlay');
    if(overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
    }

    setupFormHandlers();
    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    renderCalendar(currentDate);
    updateDashboardStats();
    setupReciboListeners();
    renderCharts();
    
    // Listener Helper Ajudantes
    document.getElementById('selectAjudantesOperacao')?.addEventListener('change', handleAjudanteSelectionChange);
});

// Fechar Modais (clique fora)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

// Exportar funções para o escopo Global (HTML onclick)
window.changeMonth = changeMonth;
window.editOperacaoItem = editOperacaoItem;
window.viewOperacaoDetails = viewOperacaoDetails;
window.deleteItem = deleteItem;
window.editCadastroItem = editCadastroItem;
window.exportDataBackup = exportDataBackup;
window.importDataBackup = importDataBackup;
window.fullSystemReset = fullSystemReset;
window.exportReportToPDF = exportReportToPDF;
window.gerarRelatorioCobranca = gerarRelatorioCobranca;
window.gerarRelatorio = gerarRelatorio;
window.closeModal = closeModal;
window.closeViewModal = closeViewModal;
window.closeAdicionarAjudanteModal = closeAdicionarAjudanteModal;
window.toggleCursoInput = toggleCursoInput;