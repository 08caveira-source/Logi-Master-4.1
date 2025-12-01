// =============================================================================
// 1. CONFIGURAÇÕES E INICIALIZAÇÃO DE DADOS
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

// Garante que o banco de dados exista sem sobrescrever dados antigos
(function initDB() {
    const keys = Object.values(DB_KEYS);
    keys.forEach(k => {
        if (!localStorage.getItem(k)) {
            // Cria array ou objeto vazio apenas se a chave não existir
            localStorage.setItem(k, k === DB_KEYS.MINHA_EMPRESA ? '{}' : '[]');
        }
    });
})();

// Função segura para carregar dados
function loadData(key) {
    try {
        const data = localStorage.getItem(key);
        if (!data) return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
        return JSON.parse(data);
    } catch (e) {
        console.error(`Erro ao carregar dados de ${key}:`, e);
        return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    }
}

// Função segura para salvar dados
function saveData(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        alert('Erro crítico: Não foi possível salvar os dados. O armazenamento local pode estar cheio.');
        console.error(e);
    }
}

// =============================================================================
// 2. UTILITÁRIOS E FORMATADORES
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    const v = Number(value);
    if (isNaN(v)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(v);
};

// Formata data YYYY-MM-DD para DD/MM/AAAA
const formatDateBr = (dateString) => {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

function copyToClipboard(text) {
    if (!text) return alert('Nada para copiar.');
    navigator.clipboard.writeText(text).then(() => alert('Copiado!'), () => alert('Erro ao copiar.'));
}

// Getters auxiliares para buscar nomes baseados em IDs
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 3. CÁLCULOS E LÓGICA DE NEGÓCIO
// =============================================================================

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    const opsComPreco = todasOps.filter(op => op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    if (!opsComPreco.length) return 0;
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data)); // Mais recente primeiro
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
// 4. FUNÇÕES GLOBAIS (WINDOW) PARA INTERAÇÃO COM HTML
// =============================================================================
// Estas funções são essenciais para que o onclick="..." no HTML funcione

window.toggleCursoInput = function() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
};

window.closeModal = function() {
    document.getElementById('operationDetailsModal').style.display = 'none';
};

window.closeViewModal = function() {
    document.getElementById('viewItemModal').style.display = 'none';
};

window.openOperationDetails = function(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBodyContent').innerHTML = html;
    document.getElementById('operationDetailsModal').style.display = 'block';
};

// Variável para armazenar callback do modal de ajudantes
let _ajudanteCallback = null;
window.openAdicionarAjudanteModal = function(ajudanteObj, callback) {
    _ajudanteCallback = { obj: ajudanteObj, cb: callback };
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 100);
};

window.closeAdicionarAjudanteModal = function() {
    _ajudanteCallback = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// =============================================================================
// 5. RENDERIZAÇÃO DE TABELAS (CORRIGIDO)
// =============================================================================

// Esta função estava faltando no arquivo enviado e causava o erro fatal
function renderCadastroTable(dbKey, tableId, columns, idField = 'id') {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    const data = loadData(dbKey);
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const colsHtml = columns.map(col => `<td>${item[col] || '-'}</td>`).join('');
        const id = item[idField]; // Pega o ID ou Placa ou CNPJ
        
        // Botões com chamadas globais window.
        return `
            <tr>
                ${colsHtml}
                <td>
                    <button type="button" class="btn-action edit-btn" onclick="window.editCadastroItem('${dbKey}', '${id}')"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-action delete-btn" onclick="window.deleteItem('${dbKey}', '${id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
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
        
        // Preserva a opção "Selecione..."
        const firstOpt = el.options[0] ? el.options[0].outerHTML : '<option value="">SELECIONE...</option>';
        el.innerHTML = firstOpt;
        
        dados.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d[cfg.val];
            opt.textContent = d[cfg.txt];
            el.appendChild(opt);
        });
    }

    // Select híbrido para recibos
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

    // Renderiza as tabelas de cadastro
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
// 6. CRUD GENÉRICO E OPERAÇÕES
// =============================================================================

window.deleteItem = function(key, id) {
    if (!confirm('Tem certeza que deseja excluir permanentemente este registro?')) return;
    let data = loadData(key);
    
    // Identifica qual o campo ID correto para cada tabela
    const idField = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    
    data = data.filter(d => String(d[idField]) !== String(id));
    saveData(key, data);
    
    alert('Registro excluído com sucesso.');
    location.reload(); // Recarrega para garantir limpeza total
};

window.editCadastroItem = function(key, id) {
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
    
    // Rola para o formulário
    document.querySelector('.cadastro-form.active').scrollIntoView({ behavior: 'smooth' });
};

// =============================================================================
// 7. LÓGICA DE OPERAÇÕES E CALENDÁRIO
// =============================================================================

window.renderOperacaoTable = function() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a, b) => new Date(b.data) - new Date(a.data));

    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhuma operação registrada.</td></tr>';
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
        const dataFmt = formatDateBr(op.data);

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
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || '';
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    // Carrega ajudantes na memória temporária
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderAjudantesAdicionadosList();
    
    document.querySelector('[data-page="operacoes"]').click();
    document.getElementById('formOperacao').scrollIntoView();
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
    const saldoReceber = faturamento - adiantamento;
    const custos = (Number(op.comissao) || 0) + (Number(op.despesas) || 0) + totalDiarias + custoDiesel;
    const lucro = faturamento - custos;

    const html = `
    <div style="font-size:0.95rem;">
        <p><strong>DATA:</strong> ${formatDateBr(op.data)}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca} | KM: ${op.kmRodado}</p>
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <hr style="margin:10px 0; border:0; border-bottom:1px solid #eee;">
        <p><strong>FATURAMENTO:</strong> ${formatCurrency(faturamento)}</p>
        <p style="color:var(--danger-color);"><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
        <p style="font-weight:bold">SALDO: ${formatCurrency(saldoReceber)}</p>
        <hr style="margin:10px 0; border:0; border-bottom:1px solid #eee;">
        <p><strong>CUSTOS:</strong></p>
        <ul style="list-style:none; padding-left:10px; font-size:0.9rem; color:#555;">
            <li>Comissão: ${formatCurrency(op.comissao)}</li>
            <li>Pedágios/Desp: ${formatCurrency(op.despesas)}</li>
            <li>Ajudantes: ${formatCurrency(totalDiarias)}</li>
            <li>Diesel (Est. ${media.toFixed(1)}km/l): ${formatCurrency(custoDiesel)}</li>
        </ul>
        <hr>
        <h3 style="text-align:center; color:${lucro >= 0 ? 'green' : 'red'}">LUCRO: ${formatCurrency(lucro)}</h3>
    </div>`;
    
    window.openOperationDetails('DETALHES DA OPERAÇÃO', html);
};

// Variável para controle dos ajudantes no form
window._operacaoAjudantesTempList = [];

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    const arr = window._operacaoAjudantesTempList;
    if (!arr.length) {
        list.innerHTML = '<li style="color:#777">Nenhum ajudante selecionado.</li>';
        return;
    }
    list.innerHTML = arr.map(a => {
        const aj = getAjudante(a.id) || { nome: 'Desconhecido' };
        return `<li>${aj.nome} - ${formatCurrency(a.diaria)} 
        <button type="button" class="btn-mini" onclick="window.removeAjudanteFromOperation(${a.id})">X</button></li>`;
    }).join('');
}

window.removeAjudanteFromOperation = function(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => Number(a.id) !== id);
    renderAjudantesAdicionadosList();
};

// =============================================================================
// 8. CALENDÁRIO (CORRIGIDO PARA PINTAR E ABRIR DETALHES)
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
    days.forEach(d => grid.innerHTML += `<div class="day-label" style="font-weight:bold; padding:5px; text-align:center; background:#eee;">${d}</div>`);

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += `<div class="day-cell empty" style="background:#f9f9f9; min-height:80px;"></div>`;
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++) {
        // Formata data do loop para YYYY-MM-DD
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // Filtra operações que batem com a data
        const dayOps = ops.filter(o => o.data === dateStr);
        
        const cell = document.createElement('div');
        cell.className = dayOps.length > 0 ? 'day-cell has-operation' : 'day-cell';
        
        // Estilo inline para garantir visualização se o CSS falhar
        cell.style.cssText = `min-height:80px; padding:5px; border:1px solid #ddd; position:relative; cursor:pointer; background-color: ${dayOps.length > 0 ? '#e8f5e9' : '#fff'};`;
        
        cell.innerHTML = `<strong>${d}</strong>`;
        if (dayOps.length > 0) {
            cell.innerHTML += `<div style="font-size:0.75rem; color:green; margin-top:5px;">${dayOps.length} Operações</div>`;
            cell.onclick = () => {
                const html = dayOps.map(op => {
                    const mot = getMotorista(op.motoristaId)?.nome || '-';
                    const fat = Number(op.faturamento)||0;
                    return `
                    <div class="modal-operation-block" style="border:1px solid #eee; padding:10px; margin-bottom:10px; background:white;">
                        <strong>${op.veiculoPlaca}</strong> - ${mot}<br>
                        Fat: ${formatCurrency(fat)}
                        <div style="margin-top:5px; text-align:right;">
                             <button class="btn-mini" onclick="window.editOperacaoItem(${op.id}); window.closeModal();">EDITAR</button>
                             <button class="btn-mini" onclick="window.viewOperacaoDetails(${op.id}); window.closeModal();">VER DETALHES</button>
                        </div>
                    </div>`;
                }).join('');
                window.openOperationDetails(`OPERAÇÕES DO DIA ${d}/${m+1}`, html);
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

    const despGeraisTotal = despesas
        .filter(d => {
            const dd = new Date(d.data + 'T00:00:00');
            return dd.getMonth() === m && dd.getFullYear() === y;
        })
        .reduce((acc, d) => acc + (Number(d.valor)||0), 0);

    const custoTotal = custosOps + despGeraisTotal;
    const lucroLiquido = fatTotal - custoTotal;

    const elFat = document.getElementById('faturamentoMes');
    if(elFat) elFat.textContent = formatCurrency(fatTotal);
    
    const elDesp = document.getElementById('despesasMes');
    if(elDesp) elDesp.textContent = formatCurrency(custoTotal);
    
    const elRec = document.getElementById('receitaMes');
    if(elRec) elRec.textContent = formatCurrency(lucroLiquido);
}

// =============================================================================
// 9. RELATÓRIOS E GRÁFICOS
// =============================================================================

function renderCharts() {
    // Verifica se Chartjs está carregado
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    // Destrói gráfico anterior se existir
    if (window.myMainChart) window.myMainChart.destroy();

    const ops = loadData(DB_KEYS.OPERACOES);
    const labels = [];
    const dataLucro = [];
    
    // Últimos 6 meses
    for(let i=5; i>=0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(`${m+1}/${y}`);
        
        const opsMes = ops.filter(o => {
            const dd = new Date(o.data+'T00:00:00');
            return dd.getMonth() === m && dd.getFullYear() === y;
        });
        
        const fat = opsMes.reduce((a,b)=>a+(Number(b.faturamento)||0),0);
        // Simplificado para exibição
        dataLucro.push(fat); 
    }

    window.myMainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento Mensal',
                data: dataLucro,
                backgroundColor: '#00796b'
            }]
        }
    });
}

window.gerarRelatorioCobranca = function() {
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!iniVal || !fimVal) return alert('Selecione as datas.');
    if (!conCnpj) return alert('Selecione uma contratante.');

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        return o.data >= iniVal && o.data <= fimVal && o.contratanteCNPJ === conCnpj;
    });

    if(!ops.length) return alert('Nenhum dado encontrado.');

    let html = `<h3>Relatório de Cobrança</h3><p>Período: ${formatDateBr(iniVal)} a ${formatDateBr(fimVal)}</p><table style="width:100%; border-collapse:collapse;" border="1"><tr><th>Data</th><th>Placa</th><th>Valor</th></tr>`;
    
    let total = 0;
    ops.forEach(o => {
        const val = (Number(o.faturamento)||0) - (Number(o.adiantamento)||0);
        total += val;
        html += `<tr><td>${formatDateBr(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatCurrency(val)}</td></tr>`;
    });
    html += `</table><h3 style="text-align:right">Total: ${formatCurrency(total)}</h3>`;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    if (!el || !el.innerText) return alert('Gere o relatório primeiro.');
    html2pdf().from(el).save('relatorio.pdf');
};

// =============================================================================
// 10. SETUP DE EVENTOS (ON DOM LOAD)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Navegação ---
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const pg = document.getElementById(btn.getAttribute('data-page'));
            if(pg) pg.classList.add('active');
            
            if(btn.getAttribute('data-page') === 'home') {
                window.changeMonth(0);
            }
            if(btn.getAttribute('data-page') === 'graficos') {
                renderCharts();
            }
        });
    });

    // --- Tabs Cadastro ---
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    // --- Mobile Menu ---
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

    // --- Event Listeners Específicos ---
    
    // Select de Ajudantes na Operação
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

    // Botão Adicionar do Modal Ajudante
    document.getElementById('modalAjudanteAddBtn')?.addEventListener('click', () => {
        if(_ajudanteCallback) {
            const val = document.getElementById('modalDiariaInput').value;
            _ajudanteCallback.cb({ id: _ajudanteCallback.obj.id, diaria: Number(val) });
            window.closeAdicionarAjudanteModal();
        }
    });

    // --- SUBMIT HANDLERS (Salvar Dados) ---
    
    const forms = [
        { id: 'formMotorista', key: DB_KEYS.MOTORISTAS, idField: 'motoristaId', map: () => ({
            id: document.getElementById('motoristaId').value ? Number(document.getElementById('motoristaId').value) : Date.now(),
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
        { id: 'formVeiculo', key: DB_KEYS.VEICULOS, idField: 'veiculoId', customId: 'placa', map: () => ({
            placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value.toUpperCase()
        })},
        { id: 'formContratante', key: DB_KEYS.CONTRATANTES, idField: 'contratanteId', customId: 'cnpj', map: () => ({
            cnpj: document.getElementById('contratanteCNPJ').value,
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        })},
        { id: 'formAjudante', key: DB_KEYS.AJUDANTES, idField: 'ajudanteId', map: () => ({
            id: document.getElementById('ajudanteId').value ? Number(document.getElementById('ajudanteId').value) : Date.now(),
            nome: document.getElementById('ajudanteNome').value.toUpperCase(),
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value
        })},
        { id: 'formAtividade', key: DB_KEYS.ATIVIDADES, idField: 'atividadeId', map: () => ({
            id: document.getElementById('atividadeId').value ? Number(document.getElementById('atividadeId').value) : Date.now(),
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        })}
    ];

    forms.forEach(f => {
        const el = document.getElementById(f.id);
        if(el) {
            el.addEventListener('submit', (e) => {
                e.preventDefault();
                const data = loadData(f.key);
                const obj = f.map();
                
                // Remove antigo se existir (Lógica de Edição)
                let newData;
                if(f.customId) {
                    const oldId = document.getElementById(f.idField).value;
                    newData = data.filter(d => d[f.customId] !== oldId && d[f.customId] !== obj[f.customId]);
                } else {
                    newData = data.filter(d => Number(d.id) !== Number(obj.id));
                }
                
                newData.push(obj);
                saveData(f.key, newData);
                alert('Salvo com sucesso!');
                location.reload();
            });
        }
    });

    // Form Minha Empresa
    document.getElementById('formMinhaEmpresa')?.addEventListener('submit', e => {
        e.preventDefault();
        const obj = {
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
            cnpj: document.getElementById('minhaEmpresaCNPJ').value,
            telefone: document.getElementById('minhaEmpresaTelefone').value
        };
        saveData(DB_KEYS.MINHA_EMPRESA, obj);
        alert('Dados da empresa salvos!');
        location.reload();
    });

    // Form Operação
    document.getElementById('formOperacao')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.OPERACOES);
        const idVal = document.getElementById('operacaoId').value;
        const newId = idVal ? Number(idVal) : Date.now();

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

        const finalData = data.filter(x => x.id !== newId);
        finalData.push(obj);
        saveData(DB_KEYS.OPERACOES, finalData);
        alert('Operação salva com sucesso!');
        location.reload();
    });

    // Form Despesas Gerais
    document.getElementById('formDespesaGeral')?.addEventListener('submit', e => {
        e.preventDefault();
        const data = loadData(DB_KEYS.DESPESAS_GERAIS);
        const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
        const val = Number(document.getElementById('despesaGeralValor').value);
        const dt = document.getElementById('despesaGeralData').value;
        const parc = Number(document.getElementById('despesaParcelas').value);
        const placa = document.getElementById('selectVeiculoDespesaGeral').value;

        for(let i=0; i<parc; i++) {
            const d = new Date(dt);
            d.setMonth(d.getMonth() + i);
            data.push({
                id: Date.now() + i,
                data: d.toISOString().split('T')[0],
                veiculoPlaca: placa,
                descricao: parc > 1 ? `${desc} (${i+1}/${parc})` : desc,
                valor: val / parc
            });
        }
        saveData(DB_KEYS.DESPESAS_GERAIS, data);
        alert('Despesa lançada!');
        location.reload();
    });

    // --- INICIALIZAÇÃO FINAL ---
    populateAllSelects();
    renderOperacaoTable();
    window.changeMonth(0);
    updateDashboardStats();
    
    // Tabela Despesas
    const tbodyDesp = document.querySelector('#tabelaDespesasGerais tbody');
    if(tbodyDesp) {
        const desp = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b) => b.data.localeCompare(a.data));
        tbodyDesp.innerHTML = desp.map(d => `<tr><td>${formatDateBr(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})">X</button></td></tr>`).join('');
    }
});

// Funções de Backup e Reset Global
window.exportDataBackup = function() {
    const backup = {};
    Object.values(DB_KEYS).forEach(k => backup[k] = loadData(k));
    const s = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const a = document.createElement('a');
    a.href = s; a.download = 'backup_logimaster.json';
    a.click();
};

window.importDataBackup = function(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = (evt) => {
        try {
            const d = JSON.parse(evt.target.result);
            Object.keys(d).forEach(k => saveData(k, d[k]));
            alert('Backup restaurado!'); location.reload();
        } catch(err) { alert('Arquivo inválido.'); }
    };
    r.readAsText(f);
};

window.fullSystemReset = function() {
    if(confirm('ATENÇÃO: ISSO APAGARÁ TUDO! Continuar?')) {
        localStorage.clear();
        location.reload();
    }
};