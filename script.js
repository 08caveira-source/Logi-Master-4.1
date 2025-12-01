/**
 * SCRIPT.JS - CORRIGIDO E GLOBALIZADO
 * Este script garante que todas as funções estejam acessíveis ao HTML (onclick)
 * e recupera os dados existentes no localStorage sem sobrescrever.
 */

// =============================================================================
// 1. CONFIGURAÇÕES E BANCO DE DADOS
// =============================================================================

// Mantendo as chaves EXATAS do seu arquivo original para recuperar os dados
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

// Função segura para carregar dados
function loadData(key) {
    try {
        const data = localStorage.getItem(key);
        if (!data) {
            // Se não existir, retorna array vazio ou objeto vazio dependendo do tipo
            return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
        }
        return JSON.parse(data);
    } catch (e) {
        console.error(`Erro ao carregar dados de ${key}:`, e);
        return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    }
}

function saveData(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        alert('Erro ao salvar dados (LocalStorage cheio?).');
        console.error(e);
    }
}

// Inicializa chaves apenas se não existirem (Proteção contra perda de dados)
function initDB() {
    Object.values(DB_KEYS).forEach(key => {
        if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, key === DB_KEYS.MINHA_EMPRESA ? '{}' : '[]');
        }
    });
}
// Executa imediatamente
initDB();

// =============================================================================
// 2. UTILITÁRIOS (Helpers)
// =============================================================================

function formatCurrency(value) {
    const v = Number(value);
    if (isNaN(v)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatCPF_CNPJ(value) {
    if(!value) return '';
    const d = value.toString().replace(/\D/g, '');
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}

function onlyDigits(v) { 
    return (v || '').toString().replace(/\D/g, ''); 
}

// Buscadores (Getters)
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 3. CÁLCULOS
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
    let kmTotal = 0, litrosTotal = 0;
    ops.forEach(op => {
        if (op.kmRodado) kmTotal += Number(op.kmRodado);
        if (Number(op.combustivel) > 0 && Number(op.precoLitro) > 0) {
            litrosTotal += (Number(op.combustivel) / Number(op.precoLitro));
        }
    });
    return litrosTotal === 0 ? 0 : kmTotal / litrosTotal;
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca || !op.kmRodado) return 0;
    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if (media === 0) return 0;
    let preco = Number(op.precoLitro);
    if (!preco || preco <= 0) preco = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    if (preco === 0) return 0;
    return (Number(op.kmRodado) / media) * preco;
}

// =============================================================================
// 4. LÓGICA DE INTERFACE E TABELAS
// =============================================================================

// Tabela Genérica para Cadastros (Motoristas, Veículos, etc)
function renderCadastroTable(dbKey, tableId, columns, idField = 'id') {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    
    const data = loadData(dbKey);
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center">Nenhum registro.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let colsHtml = columns.map(col => `<td>${item[col] || '-'}</td>`).join('');
        // Importante: Passamos strings para garantir compatibilidade no onclick
        const itemId = item[idField]; 
        return `
            <tr>
                ${colsHtml}
                <td>
                    <button type="button" class="btn-action edit-btn" onclick="window.editCadastroItem('${dbKey}', '${itemId}')"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-action delete-btn" onclick="window.deleteItem('${dbKey}', '${itemId}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
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
        // Mantém a primeira opção (Selecione...)
        const firstOpt = el.options[0] ? el.options[0].outerHTML : '';
        el.innerHTML = firstOpt;
        
        dados.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d[cfg.val];
            opt.textContent = d[cfg.txt];
            el.appendChild(opt);
        });
    }

    // Select Especial Recibo
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = '<option value="">SELECIONE...</option>';
        loadData(DB_KEYS.MOTORISTAS).forEach(m => selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`);
        loadData(DB_KEYS.AJUDANTES).forEach(a => selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`);
    }

    // Renderiza tabelas
    renderCadastroTable(DB_KEYS.MOTORISTAS, 'tabelaMotoristas', ['id', 'nome', 'documento']);
    renderCadastroTable(DB_KEYS.VEICULOS, 'tabelaVeiculos', ['placa', 'modelo', 'ano'], 'placa');
    renderCadastroTable(DB_KEYS.CONTRATANTES, 'tabelaContratantes', ['cnpj', 'razaoSocial', 'telefone'], 'cnpj');
    renderCadastroTable(DB_KEYS.AJUDANTES, 'tabelaAjudantes', ['id', 'nome', 'documento']);
    renderCadastroTable(DB_KEYS.ATIVIDADES, 'tabelaAtividades', ['id', 'nome'], 'id');
    renderMinhaEmpresaInfo();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    const emp = getMinhaEmpresa();
    if (div) div.innerHTML = emp.razaoSocial ? `<p><strong>${emp.razaoSocial}</strong><br>CNPJ: ${emp.cnpj}<br>Tel: ${emp.telefone}</p>` : `<p>NENHUM DADO.</p>`;
}

// =============================================================================
// 5. FUNÇÕES GLOBAIS (MODAIS E AÇÕES)
// =============================================================================

// Define no objeto window para garantir acesso via HTML onclick
window.toggleCursoInput = function() {
    const el = document.getElementById('motoristaTemCurso');
    const div = document.getElementById('divCursoDescricao');
    if (el && div) div.style.display = el.value === 'sim' ? 'flex' : 'none';
};

window.openViewModal = function(title, html) {
    document.getElementById('viewItemTitle').textContent = title;
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'block';
};

window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };

window.openOperationDetails = function(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBodyContent').innerHTML = html;
    document.getElementById('operationDetailsModal').style.display = 'block';
};

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };

// Ajudantes Modal Lógica
let _pendingAjudante = null;
window.openAdicionarAjudanteModal = function(ajudanteObj, cb) {
    _pendingAjudante = { obj: ajudanteObj, cb: cb };
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
};

window.closeAdicionarAjudanteModal = function() {
    _pendingAjudante = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// =============================================================================
// 6. OPERAÇÕES (CRUD E LISTAGEM)
// =============================================================================

// Variável global para ajudantes temporários na operação
window._operacaoAjudantesTempList = [];

window.renderOperacaoTable = function() {
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
        const dataFmt = op.data.split('-').reverse().join('/'); // YYYY-MM-DD -> DD/MM/YYYY

        return `<tr>
            <td>${dataFmt}</td>
            <td>${motName}</td>
            <td>${atvName}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${color}; font-weight:bold;">${formatCurrency(liquido)}</td>
            <td>
                <button type="button" class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-action view-btn" onclick="window.viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button type="button" class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
};

window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
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
    
    // Simula clique na aba e scroll
    const tabOp = document.querySelector('[data-page="operacoes"]');
    if(tabOp) tabOp.click();
    document.getElementById('formOperacao').scrollIntoView({ behavior: 'smooth' });
};

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    
    const totalDiarias = (op.ajudantes || []).reduce((acc, cur) => acc + (Number(cur.diaria) || 0), 0);
    const custoDiesel = calcularCustoConsumoViagem(op);
    const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    
    const faturamento = Number(op.faturamento) || 0;
    const adiantamento = Number(op.adiantamento) || 0;
    const saldo = faturamento - adiantamento;
    const custos = (Number(op.comissao)||0) + (Number(op.despesas)||0) + totalDiarias + custoDiesel;
    const lucro = faturamento - custos;

    const html = `
    <div style="font-size:0.9rem; line-height:1.6;">
        <p><strong>DATA:</strong> ${op.data.split('-').reverse().join('/')}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca} | <strong>KM:</strong> ${op.kmRodado}</p>
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <hr style="margin:10px 0; border-top:1px solid #eee;">
        <p><strong>FATURAMENTO:</strong> ${formatCurrency(faturamento)}</p>
        <p style="color:var(--danger-color);"><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
        <p><strong>SALDO A RECEBER:</strong> ${formatCurrency(saldo)}</p>
        <hr style="margin:10px 0; border-top:1px solid #eee;">
        <p><strong>CUSTOS:</strong></p>
        <ul style="padding-left:15px; color:#555;">
            <li>Comissão: ${formatCurrency(op.comissao)}</li>
            <li>Despesas/Pedágio: ${formatCurrency(op.despesas)}</li>
            <li>Ajudantes: ${formatCurrency(totalDiarias)}</li>
            <li>Diesel Est. (${media.toFixed(1)} km/l): ${formatCurrency(custoDiesel)}</li>
        </ul>
        <hr style="margin:10px 0; border-top:1px solid #eee;">
        <h3 style="text-align:center; color:${lucro >= 0 ? 'green' : 'red'}">LUCRO: ${formatCurrency(lucro)}</h3>
    </div>`;
    
    window.openOperationDetails('DETALHES DA OPERAÇÃO', html);
};

window.deleteItem = function(key, id) {
    if (!confirm('Deseja realmente excluir este item?')) return;
    let data = loadData(key);
    // Identifica o campo de ID dependendo da tabela
    const idField = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    
    // Filtra removendo o item
    data = data.filter(d => String(d[idField]) !== String(id));
    saveData(key, data);
    
    alert('Item excluído.');
    // Atualiza a tela inteira para refletir a mudança
    location.reload(); 
};

window.editCadastroItem = function(key, id) {
    const data = loadData(key);
    const idField = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    const item = data.find(d => String(d[idField]) === String(id));
    if (!item) return;

    // Lógica específica de preenchimento
    if (key === DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaId').value = item.id;
        document.getElementById('motoristaNome').value = item.nome;
        document.getElementById('motoristaDocumento').value = item.documento;
        document.getElementById('motoristaTelefone').value = item.telefone;
        document.getElementById('motoristaCNH').value = item.cnh;
        document.getElementById('motoristaValidadeCNH').value = item.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = item.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = item.temCurso ? 'sim' : 'nao';
        document.getElementById('motoristaCursoDescricao').value = item.cursoDescricao || '';
        document.getElementById('motoristaPix').value = item.pix || '';
        window.toggleCursoInput();
        document.querySelector('[data-tab="motoristas"]').click();
    } else if (key === DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa;
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
    document.querySelector('.cadastro-form.active').scrollIntoView();
};

// =============================================================================
// 7. CALENDÁRIO (CORRIGIDO PINTURA E MODAL)
// =============================================================================
let currentDate = new Date();

window.changeMonth = function(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderCalendar(currentDate);
    updateDashboardStats();
};

function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    if (!grid || !title) return;

    const y = date.getFullYear();
    const m = date.getMonth();
    
    title.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    grid.innerHTML = '';

    const days = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    days.forEach(d => grid.innerHTML += `<div class="day-label">${d}</div>`);

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="day-cell empty"></div>`;

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++) {
        // Formata a data do loop para bater com o formato YYYY-MM-DD do banco
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // Filtro robusto (remove espaços se houver)
        const dayOps = ops.filter(o => o.data.trim() === dateStr);
        
        const cell = document.createElement('div');
        // Se houver operações, adiciona a classe que pinta de verde
        cell.className = dayOps.length > 0 ? 'day-cell has-operation' : 'day-cell';
        
        // Conteúdo da célula
        cell.innerHTML = `<span>${d}</span>${dayOps.length > 0 ? '<div class="event-dot"></div>' : ''}`;
        
        // Evento de Click
        if(dayOps.length > 0) {
            cell.onclick = () => {
                const html = dayOps.map(op => {
                    const mot = getMotorista(op.motoristaId)?.nome || '-';
                    const fat = Number(op.faturamento)||0;
                    const adt = Number(op.adiantamento)||0;
                    return `
                    <div class="modal-operation-block">
                        <strong>${op.veiculoPlaca}</strong> - ${mot}<br>
                        <span style="color:var(--primary-color)">Fat: ${formatCurrency(fat)}</span>
                        <div style="margin-top:5px; text-align:right;">
                             <button class="btn-mini" onclick="window.editOperacaoItem(${op.id}); window.closeModal();">EDITAR</button>
                             <button class="btn-mini" onclick="window.viewOperacaoDetails(${op.id}); window.closeModal();">VER</button>
                        </div>
                    </div>`;
                }).join('');
                window.openOperationDetails(`DIA ${d}/${m+1}/${y}`, html);
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
    const custosOps = opsMes.reduce((acc, o) => {
        const diesel = calcularCustoConsumoViagem(o);
        const diarias = (o.ajudantes||[]).reduce((a, b) => a + (Number(b.diaria)||0), 0);
        return acc + (Number(o.comissao)||0) + (Number(o.despesas)||0) + diarias + diesel;
    }, 0);

    const despGeraisTotal = despesas.filter(d => {
        const dd = new Date(d.data + 'T00:00:00');
        return dd.getMonth() === m && dd.getFullYear() === y;
    }).reduce((acc, d) => acc + (Number(d.valor)||0), 0);

    const totalCustos = custosOps + despGeraisTotal;

    document.getElementById('faturamentoMes').textContent = formatCurrency(fatTotal);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    document.getElementById('receitaMes').textContent = formatCurrency(fatTotal - totalCustos);
}

// =============================================================================
// 8. RELATÓRIOS E EXPORTAÇÃO
// =============================================================================

window.gerarRelatorioCobranca = function() {
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!iniVal || !fimVal) return alert('Selecione o período.');
    if (!conCnpj) return alert('Selecione uma Contratante.');

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        return o.data >= iniVal && o.data <= fimVal && o.contratanteCNPJ === conCnpj;
    }).sort((a,b) => a.data.localeCompare(b.data));

    if (!ops.length) return alert('Nenhum dado encontrado.');
    
    // ... (Lógica de HTML do relatório mantida simples) ...
    let total = 0;
    const rows = ops.map(o => {
        const saldo = (Number(o.faturamento)||0) - (Number(o.adiantamento)||0);
        total += saldo;
        return `<tr><td>${o.data.split('-').reverse().join('/')}</td><td>${o.veiculoPlaca}</td><td>${formatCurrency(saldo)}</td></tr>`;
    }).join('');

    const html = `
        <div style="padding:20px;">
            <h3>RELATÓRIO DE COBRANÇA</h3>
            <p>Período: ${iniVal} a ${fimVal}</p>
            <table style="width:100%; border-collapse:collapse; margin-top:15px;" border="1">
                <tr style="background:#eee;"><th>DATA</th><th>VEÍCULO</th><th>SALDO</th></tr>
                ${rows}
            </table>
            <h3 style="text-align:right; margin-top:20px;">TOTAL: ${formatCurrency(total)}</h3>
        </div>
    `;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    if (!el || el.innerHTML.trim() === "") return alert('Gere o relatório primeiro.');
    html2pdf().from(el).save('relatorio.pdf');
};

window.exportDataBackup = function() {
    const backup = {};
    Object.values(DB_KEYS).forEach(k => backup[k] = loadData(k));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const node = document.createElement('a');
    node.href = dataStr;
    node.download = `backup_logimaster_${new Date().toISOString().slice(0,10)}.json`;
    node.click();
};

window.fullSystemReset = function() {
    if(confirm('CUIDADO: Isso apaga TUDO. Continuar?')) {
        if(confirm('Tem certeza absoluta?')) {
            localStorage.clear();
            location.reload();
        }
    }
};

// =============================================================================
// 9. INICIALIZAÇÃO (EVENTS E HANDLERS)
// =============================================================================

function setupFormHandlers() {
    // Ajudantes Temp Handler
    function renderAjudantesAdicionadosList() {
        const list = document.getElementById('listaAjudantesAdicionados');
        if (!list) return;
        const arr = window._operacaoAjudantesTempList;
        if (!arr.length) {
            list.innerHTML = '<li style="color:#777">Nenhum ajudante.</li>';
            return;
        }
        list.innerHTML = arr.map(a => {
            const aj = getAjudante(a.id) || { nome: '?' };
            return `<li>${aj.nome} - ${formatCurrency(a.diaria)} <button type="button" class="btn-mini" onclick="window.removeAjudanteFromOperation(${a.id})">X</button></li>`;
        }).join('');
    }
    
    window.removeAjudanteFromOperation = function(id) {
        window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => Number(a.id) !== id);
        renderAjudantesAdicionadosList();
    };

    const selAj = document.getElementById('selectAjudantesOperacao');
    if(selAj) {
        selAj.addEventListener('change', () => {
            const id = Number(selAj.value);
            if(!id) return;
            const aj = getAjudante(id);
            if(aj) window.openAdicionarAjudanteModal(aj, (item) => {
                window._operacaoAjudantesTempList.push(item);
                renderAjudantesAdicionadosList();
                selAj.value = "";
            });
        });
    }

    // Formulários Genéricos
    const forms = [
        { id: 'formMotorista', key: DB_KEYS.MOTORISTAS, idField: 'motoristaId', map: (id) => ({
            id: id || Date.now(),
            nome: document.getElementById('motoristaNome').value.toUpperCase(),
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
            temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
            cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
            pix: document.getElementById('motoristaPix').value
        })},
        { id: 'formVeiculo', key: DB_KEYS.VEICULOS, idField: 'veiculoId', customId: 'veiculoPlaca', map: (oldId) => ({
            placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value.toUpperCase()
        })},
        { id: 'formContratante', key: DB_KEYS.CONTRATANTES, idField: 'contratanteId', customId: 'contratanteCNPJ', map: (oldId) => ({
            cnpj: document.getElementById('contratanteCNPJ').value,
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        })},
        { id: 'formAjudante', key: DB_KEYS.AJUDANTES, idField: 'ajudanteId', map: (id) => ({
            id: id || Date.now(),
            nome: document.getElementById('ajudanteNome').value.toUpperCase(),
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value
        })},
        { id: 'formAtividade', key: DB_KEYS.ATIVIDADES, idField: 'atividadeId', map: (id) => ({
            id: id || Date.now(),
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        })}
    ];

    forms.forEach(f => {
        const formEl = document.getElementById(f.id);
        if(formEl) {
            formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                const data = loadData(f.key);
                const oldIdVal = document.getElementById(f.idField).value; // Valor do input hidden (ID antigo se editando)
                
                // Se tiver customId (ex: Placa), pega o valor do campo novo, senão usa ID numérico
                const newObj = f.map(oldIdVal ? Number(oldIdVal) : null);
                
                // Lógica de Salvar: Se editando, remove o antigo primeiro
                let finalData;
                
                if (f.key === DB_KEYS.VEICULOS) {
                    finalData = data.filter(v => v.placa !== oldIdVal && v.placa !== newObj.placa);
                } else if (f.key === DB_KEYS.CONTRATANTES) {
                    finalData = data.filter(c => c.cnpj !== oldIdVal && c.cnpj !== newObj.cnpj);
                } else {
                    const checkId = oldIdVal ? Number(oldIdVal) : newObj.id;
                    finalData = data.filter(item => Number(item.id) !== checkId);
                }
                
                finalData.push(newObj);
                saveData(f.key, finalData);
                
                alert('Salvo com sucesso!');
                e.target.reset();
                document.getElementById(f.idField).value = '';
                populateAllSelects(); // Recarrega tabelas e selects
            });
        }
    });

    // Form Operação Específico
    document.getElementById('formOperacao')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const idField = document.getElementById('operacaoId').value;
        const data = loadData(DB_KEYS.OPERACOES);
        const newId = idField ? Number(idField) : Date.now();
        
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

        const finalData = data.filter(o => o.id !== newId); // Remove se existe
        finalData.push(obj);
        saveData(DB_KEYS.OPERACOES, finalData);

        alert('Operação salva!');
        e.target.reset();
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        renderAjudantesAdicionadosList();
        
        window.renderOperacaoTable();
        window.changeMonth(0); // Atualiza calendário
    });
}

// Botão Salvar Backup (Listener no botão)
document.addEventListener('click', (e) => {
    if(e.target.id === 'modalAjudanteAddBtn') {
        if(_pendingAjudante) {
            const val = document.getElementById('modalDiariaInput').value;
            _pendingAjudante.cb({ id: _pendingAjudante.obj.id, diaria: Number(val) });
            window.closeAdicionarAjudanteModal();
        }
    }
});

// Inicialização Geral
document.addEventListener('DOMContentLoaded', () => {
    // Menu Mobile
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if(mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('active');
        });
    }
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Navegação
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const pg = document.getElementById(btn.getAttribute('data-page'));
            if(pg) pg.classList.add('active');
            
            // Renderizações específicas por aba
            if(btn.getAttribute('data-page') === 'graficos' && typeof renderCharts === 'function') renderCharts();
            if(btn.getAttribute('data-page') === 'home') changeMonth(0);
        });
    });

    // Tabs Cadastro
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    setupFormHandlers();
    populateAllSelects();
    renderOperacaoTable();
    window.changeMonth(0);
    updateDashboardStats();
    
    // Import Backup Listener
    document.getElementById('inputImportBackup')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const json = JSON.parse(evt.target.result);
                Object.values(DB_KEYS).forEach(key => { if (json[key]) saveData(key, json[key]); });
                alert('Restaurado! Recarregando...');
                location.reload();
            } catch (err) { alert('Erro no arquivo.'); }
        };
        reader.readAsText(file);
    });
});