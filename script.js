/**
 * SCRIPT.JS - VERSÃO FINAL (VISUAL MODERNO & LÓGICA CORRIGIDA)
 * - Calendário: Pinta apenas dias com faturamento > 0.
 * - Dados: Preserva e recupera dados antigos.
 * - Interface: Funções globais para garantir funcionamento dos botões.
 */

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

// Carrega dados do LocalStorage com tratamento de erro
function loadData(key) {
    const raw = localStorage.getItem(key);
    if (!raw) {
        return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("Erro ao carregar dados:", e);
        return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    }
}

// Salva dados no LocalStorage
function saveData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
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

// Formata Data para BR (DD/MM/AAAA)
const formatDateBr = (dateString) => {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// =============================================================================
// 2. INICIALIZAÇÃO DE DADOS
// =============================================================================

// Garante que as chaves existam no banco
(function initDB() {
    Object.values(DB_KEYS).forEach(k => {
        if (!localStorage.getItem(k)) {
            localStorage.setItem(k, k === DB_KEYS.MINHA_EMPRESA ? '{}' : '[]');
        }
    });
})();

// =============================================================================
// 3. FUNÇÕES HELPER (BUSCADORES)
// =============================================================================

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 4. INTELIGÊNCIA DE CÁLCULO DE FROTA
// =============================================================================

function obtainingLastFuelPrice(placa) {
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
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa);
    
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
    
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obtainingLastFuelPrice(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0;

    const litrosConsumidos = kmRodado / mediaKmL;
    return litrosConsumidos * precoParaCalculo;
}

// =============================================================================
// 5. FORMATADORES AUXILIARES
// =============================================================================

function formatCPF_CNPJ(value) {
    const digits = onlyDigits(value);
    if (digits.length <= 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m, a, b, c, d) => {
            if (!d) return `${a}.${b}.${c}`;
            return `${a}.${b}.${c}-${d}`;
        });
    } else {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (m, a, b, c, d, e) => {
            if (!e) return `${a}.${b}.${c}/${d}`;
            return `${a}.${b}.${c}/${d}-${e}`;
        });
    }
}

function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function copyToClipboard(text) {
    if (!text) return alert('Nada para copiar.');
    navigator.clipboard.writeText(text).then(() => alert('Copiado!'), () => alert('Erro ao copiar.'));
}

// =============================================================================
// 6. UI: MODAIS E CONTROLES GLOBAIS
// =============================================================================

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

window.openOperationDetails = function(title, htmlContent) {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
};

// Variável para armazenar callback do modal de ajudantes
let _pendingAjudanteToAdd = null;

window.openAdicionarAjudanteModal = function(ajudanteObj, onAddCallback) {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
};

window.closeAdicionarAjudanteModal = function() {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// Listener global para o botão de adicionar no modal de ajudante
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) {
            window.closeAdicionarAjudanteModal();
            return;
        }
        const { ajudanteObj, onAddCallback } = _pendingAjudanteToAdd;
        onAddCallback({ id: ajudanteObj.id, diaria: Number(val.toFixed(2)) });
        window.closeAdicionarAjudanteModal();
    }
});

// =============================================================================
// 7. LÓGICA DE AJUDANTES (LISTA TEMPORÁRIA)
// =============================================================================

window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    const id = Number(sel.value);
    const already = (window._operacaoAjudantesTempList || []).some(a => Number(a.id) === id);
    if (already) {
        alert('Este ajudante já foi adicionado.');
        sel.value = "";
        return;
    }
    const ajud = getAjudante(id);
    if (!ajud) return;
    
    window.openAdicionarAjudanteModal(ajud, (result) => {
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
        list.innerHTML = '<li style="color:var(--text-light); font-style:italic;">Nenhum ajudante adicionado.</li>';
        return;
    }
    const html = arr.map(a => {
        const ajud = getAjudante(a.id) || {};
        return `<li>
            <span>${ajud.nome || 'ID:'+a.id}</span>
            <span>${formatCurrency(Number(a.diaria)||0)} <button class="btn-mini delete-btn" style="margin-left:8px;" onclick="window.removeAjudanteFromOperation(${a.id})">X</button></span>
        </li>`;
    }).join('');
    list.innerHTML = html;
}

window.removeAjudanteFromOperation = function(id) {
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
};

// =============================================================================
// 8. POPULATE SELECTS E TABELAS
// =============================================================================

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const prev = Array.from(sel.selectedOptions).map(o => o.value);
    sel.innerHTML = `<option value="">${initialText}</option>`;
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
    try {
        Array.from(sel.options).forEach(o => { if (prev.includes(o.value)) o.selected = true; });
    } catch {}
}

function populateAllSelects() {
    const motoristas = loadData(DB_KEYS.MOTORISTAS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const ajudantes = loadData(DB_KEYS.AJUDANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE (OPCIONAL)...');

    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        motoristas.forEach(m => selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`);
        ajudantes.forEach(a => selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`);
    }
    
    // Filtros Relatório
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // Tabelas de Cadastro
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    if (emp && emp.razaoSocial) {
        div.innerHTML = `<p><strong>${emp.razaoSocial}</strong><br>CNPJ: ${formatCPF_CNPJ(emp.cnpj)}<br>${emp.telefone || ''}</p>`;
    } else div.innerHTML = `<p style="color:var(--text-light);">Nenhum dado cadastrado.</p>`;
}

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';

    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    if(!tabela) return;

    let rowsHtml = '';
    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        if (key === DB_KEYS.ATIVIDADES) { col1 = item.id; col2 = item.nome; col3 = ''; }
        
        rowsHtml += `<tr>
            <td>${col1}</td>
            <td>${col2}</td>
            ${col3 !== '' ? `<td>${col3}</td>` : ''}
            <td>
                <button class="btn-action edit-btn" onclick="window.editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="window.deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    
    tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center; padding: 20px; color: var(--text-light);">Nenhum registro.</td></tr>`;
}

// =============================================================================
// 9. CRUD GENÉRICO
// =============================================================================

window.deleteItem = function(key, id) {
    if (!confirm('Tem certeza que deseja excluir?')) return;
    let arr = loadData(key);
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    location.reload();
};

window.editCadastroItem = function(key, id) {
    const data = loadData(key);
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    const item = data.find(i => String(i[idKey]) === String(id));
    if(!item) return;

    if (key === DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaNome').value = item.nome;
        document.getElementById('motoristaDocumento').value = item.documento;
        document.getElementById('motoristaTelefone').value = item.telefone;
        document.getElementById('motoristaCNH').value = item.cnh;
        document.getElementById('motoristaValidadeCNH').value = item.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = item.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = item.temCurso ? 'sim' : 'nao';
        document.getElementById('motoristaCursoDescricao').value = item.cursoDescricao;
        document.getElementById('motoristaPix').value = item.pix;
        document.getElementById('motoristaId').value = item.id;
        window.toggleCursoInput();
        document.querySelector('[data-tab="motoristas"]').click();
    } else if (key === DB_KEYS.VEICULOS) {
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.getElementById('veiculoRenavam').value = item.renavam;
        document.getElementById('veiculoChassi').value = item.chassi;
        document.getElementById('veiculoId').value = item.placa;
        document.querySelector('[data-tab="veiculos"]').click();
    } else if (key === DB_KEYS.CONTRATANTES) {
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteTelefone').value = item.telefone;
        document.getElementById('contratanteId').value = item.cnpj;
        document.querySelector('[data-tab="contratantes"]').click();
    } else if (key === DB_KEYS.AJUDANTES) {
        document.getElementById('ajudanteNome').value = item.nome;
        document.getElementById('ajudanteDocumento').value = item.documento;
        document.getElementById('ajudanteTelefone').value = item.telefone;
        document.getElementById('ajudanteEndereco').value = item.endereco;
        document.getElementById('ajudantePix').value = item.pix;
        document.getElementById('ajudanteId').value = item.id;
        document.querySelector('[data-tab="ajudantes"]').click();
    } else if (key === DB_KEYS.ATIVIDADES) {
        document.getElementById('atividadeNome').value = item.nome;
        document.getElementById('atividadeId').value = item.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    document.querySelector('.cadastro-form.active').scrollIntoView({ behavior: 'smooth' });
};

// =============================================================================
// 10. SUBMIT DE FORMULÁRIOS
// =============================================================================

function setupFormHandlers() {
    const handleSave = (formId, key, builder, idField, customId) => {
        const form = document.getElementById(formId);
        if(form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                let arr = loadData(key);
                const obj = builder();
                const oldId = document.getElementById(idField).value;
                
                // Remove anterior
                if (customId) {
                    arr = arr.filter(x => x[customId] !== oldId && x[customId] !== obj[customId]);
                } else {
                    arr = arr.filter(x => Number(x.id) !== Number(obj.id));
                }
                
                arr.push(obj);
                saveData(key, arr);
                alert('Salvo com sucesso!');
                location.reload();
            });
        }
    };

    handleSave('formMotorista', DB_KEYS.MOTORISTAS, () => ({
        id: document.getElementById('motoristaId').value ? Number(document.getElementById('motoristaId').value) : Date.now(),
        nome: document.getElementById('motoristaNome').value.toUpperCase(),
        documento: document.getElementById('motoristaDocumento').value,
        telefone: document.getElementById('motoristaTelefone').value,
        cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
        validadeCNH: document.getElementById('motoristaValidadeCNH').value,
        categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
        temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
        cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
        pix: document.getElementById('motoristaPix').value
    }), 'motoristaId');

    handleSave('formVeiculo', DB_KEYS.VEICULOS, () => ({
        placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
        modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
        ano: document.getElementById('veiculoAno').value,
        renavam: document.getElementById('veiculoRenavam').value.toUpperCase(),
        chassi: document.getElementById('veiculoChassi').value.toUpperCase()
    }), 'veiculoId', 'placa');

    handleSave('formContratante', DB_KEYS.CONTRATANTES, () => ({
        cnpj: document.getElementById('contratanteCNPJ').value,
        razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
        telefone: document.getElementById('contratanteTelefone').value
    }), 'contratanteId', 'cnpj');

    handleSave('formAjudante', DB_KEYS.AJUDANTES, () => ({
        id: document.getElementById('ajudanteId').value ? Number(document.getElementById('ajudanteId').value) : Date.now(),
        nome: document.getElementById('ajudanteNome').value.toUpperCase(),
        documento: document.getElementById('ajudanteDocumento').value,
        telefone: document.getElementById('ajudanteTelefone').value,
        endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
        pix: document.getElementById('ajudantePix').value
    }), 'ajudanteId');

    handleSave('formAtividade', DB_KEYS.ATIVIDADES, () => ({
        id: document.getElementById('atividadeId').value ? Number(document.getElementById('atividadeId').value) : Date.now(),
        nome: document.getElementById('atividadeNome').value.toUpperCase()
    }), 'atividadeId');

    // Minha Empresa
    const formEmp = document.getElementById('formMinhaEmpresa');
    if(formEmp) {
        formEmp.addEventListener('submit', (e) => {
            e.preventDefault();
            saveData(DB_KEYS.MINHA_EMPRESA, {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            });
            alert('Dados da empresa salvos.');
            location.reload();
        });
    }

    // Operação
    const formOp = document.getElementById('formOperacao');
    if(formOp) {
        formOp.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.OPERACOES);
            const idHidden = document.getElementById('operacaoId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
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
            
            // Remove se editando
            arr = arr.filter(x => Number(x.id) !== Number(obj.id));
            arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            alert('Operação Salva!');
            location.reload();
        });
        
        formOp.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            renderAjudantesAdicionadosList();
        });
    }

    // Despesas Gerais
    const formDesp = document.getElementById('formDespesaGeral');
    if(formDesp) {
        formDesp.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS);
            const dt = document.getElementById('despesaGeralData').value;
            const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
            const val = Number(document.getElementById('despesaGeralValor').value);
            const parc = Number(document.getElementById('despesaParcelas').value) || 1;
            const placa = document.getElementById('selectVeiculoDespesaGeral').value;

            for(let i=0; i<parc; i++) {
                const dateObj = new Date(dt + 'T00:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                arr.push({
                    id: Date.now() + i,
                    data: dateObj.toISOString().split('T')[0],
                    veiculoPlaca: placa,
                    descricao: parc > 1 ? `${desc} (${i+1}/${parc})` : desc,
                    valor: val / parc
                });
            }
            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            alert('Despesa Salva!');
            location.reload();
        });
    }
}

// =============================================================================
// 11. TABELAS DE OPERAÇÃO E DESPESAS
// =============================================================================

window.renderOperacaoTable = function() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if(!tbody) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a,b) => new Date(b.data) - new Date(a.data));
    
    if(!ops.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma operação lançada.</td></tr>';
        return;
    }

    tbody.innerHTML = ops.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '-';
        const atv = getAtividade(op.atividadeId)?.nome || '-';
        const liq = (op.faturamento||0) - ((op.comissao||0) + (op.despesas||0) + calcularCustoConsumoViagem(op));
        const color = liq >= 0 ? 'var(--success-text)' : 'var(--danger-text)';
        
        return `<tr>
            <td>${formatDateBr(op.data)}</td>
            <td>${mot}</td>
            <td>${atv}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${color}; font-weight:700;">${formatCurrency(liq)}</td>
            <td>
                <button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action view-btn" onclick="window.viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
};

window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => Number(o.id) === Number(id));
    if(!op) return;
    
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
    
    document.querySelector('[data-page="operacoes"]').click();
    document.getElementById('formOperacao').scrollIntoView();
};

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    const diesel = calcularCustoConsumoViagem(op);
    const ajudantes = (op.ajudantes||[]).reduce((a,b)=>a+(Number(b.diaria)||0),0);
    const totalCustos = (op.comissao||0) + (op.despesas||0) + ajudantes + diesel;
    const lucro = (op.faturamento||0) - totalCustos;
    const saldo = (op.faturamento||0) - (op.adiantamento||0);

    const html = `
    <div>
        <p><strong>DATA:</strong> ${formatDateBr(op.data)}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca} (${op.kmRodado} km)</p>
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <hr style="border-top:1px solid #eee; margin:10px 0;">
        <p>FATURAMENTO: <strong>${formatCurrency(op.faturamento)}</strong></p>
        <p>ADIANTAMENTO: <span style="color:var(--danger-text)">${formatCurrency(op.adiantamento)}</span></p>
        <p>SALDO A RECEBER: <strong>${formatCurrency(saldo)}</strong></p>
        <hr style="border-top:1px solid #eee; margin:10px 0;">
        <p><strong>CUSTOS TOTAIS:</strong> ${formatCurrency(totalCustos)}</p>
        <p style="font-size:0.9rem; color:#666;">(Diesel Est: ${formatCurrency(diesel)} | Comissão: ${formatCurrency(op.comissao)} | Ajudantes: ${formatCurrency(ajudantes)})</p>
        <h3 style="margin-top:10px; color:${lucro>=0?'var(--accent)':'var(--danger-text)'}">LUCRO: ${formatCurrency(lucro)}</h3>
    </div>`;
    
    window.openOperationDetails('Detalhes da Operação', html);
};

window.renderDespesasTable = function() {
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    const dados = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b)=> new Date(b.data) - new Date(a.data));
    
    if(!dados.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma despesa lançada.</td></tr>';
        return;
    }

    tbody.innerHTML = dados.map(d => `<tr>
        <td>${formatDateBr(d.data)}</td>
        <td>${d.veiculoPlaca || 'GERAL'}</td>
        <td>${d.descricao}</td>
        <td>${formatCurrency(d.valor)}</td>
        <td><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('');
};

// =============================================================================
// 12. CALENDÁRIO ATUALIZADO
// =============================================================================

let currentDate = new Date();

window.changeMonth = function(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderCalendar(currentDate);
    updateDashboardStats();
};

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Atualiza título do mês
    const currentMonthYear = document.getElementById('currentMonthYear');
    if (currentMonthYear) {
        currentMonthYear.textContent = date.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
        }).toUpperCase();
    }

    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    calendarGrid.innerHTML = '';

    // Cabeçalho dos dias
    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    dayNames.forEach(n => {
        const h = document.createElement('div');
        h.classList.add('day-header');
        h.textContent = n;
        calendarGrid.appendChild(h);
    });

    // Dias vazios antes do dia 1
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDayOfMonth; i++) {
        const e = document.createElement('div');
        e.classList.add('day-cell', 'empty');
        calendarGrid.appendChild(e);
    }

    // Dias do mês
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        cell.textContent = d;

        // Formata data YYYY-MM-DD
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // Filtra operações do dia
        const opsDay = ops.filter(op => op.data === dateStr);

        // LÓGICA NOVA: Só pinta se tiver faturamento > 0
        const temFaturamento = opsDay.some(op => Number(op.faturamento) > 0);

        if (opsDay.length > 0) {
            // Se tiver faturamento, pinta de verde (has-operation). 
            // Se tiver operação mas valor 0 (ex: só despesa), usa neutro.
            if (temFaturamento) {
                cell.classList.add('has-operation');
            } else {
                cell.classList.add('has-operation-neutral'); 
            }

            // Bolinha indicadora de quantidade
            const dot = document.createElement('div');
            dot.classList.add('event-dot');
            cell.appendChild(dot);

            // Clique abre detalhes
            cell.setAttribute('data-date', dateStr);
            cell.addEventListener('click', (e) => showOperationDetails(e.currentTarget.getAttribute('data-date')));
        }
        
        calendarGrid.appendChild(cell);
    }
}

function showOperationDetails(date) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === date);
    if (!ops.length) return;
    
    let html = ops.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '-';
        return `<div class="modal-operation-block" style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px;">
            <strong>${op.veiculoPlaca}</strong> (${mot})<br>
            Faturamento: <strong>${formatCurrency(op.faturamento)}</strong>
            <div style="text-align:right; margin-top:5px;">
                <button class="btn-mini edit-btn" onclick="window.editOperacaoItem(${op.id});window.closeModal()">Editar</button>
            </div>
        </div>`;
    }).join('');
    
    window.openOperationDetails(`Operações do Dia ${formatDateBr(date)}`, html);
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const desp = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();

    const opsMes = ops.filter(o => {
        const d = new Date(o.data + 'T00:00:00');
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const fat = opsMes.reduce((a,b) => a + (Number(b.faturamento)||0), 0);
    
    const custosOp = opsMes.reduce((acc, o) => {
        const diesel = calcularCustoConsumoViagem(o);
        const aju = (o.ajudantes||[]).reduce((s,x)=>s+(Number(x.diaria)||0),0);
        return acc + (Number(o.comissao)||0) + (Number(o.despesas)||0) + aju + diesel;
    }, 0);

    const despGerais = desp.filter(d => {
        const dd = new Date(d.data + 'T00:00:00');
        return dd.getMonth() === m && dd.getFullYear() === y;
    }).reduce((acc, d) => acc + (Number(d.valor)||0), 0);

    const totalCustos = custosOp + despGerais;

    document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    document.getElementById('receitaMes').textContent = formatCurrency(fat - totalCustos);
}

// =============================================================================
// 13. RELATÓRIOS E GRÁFICOS
// =============================================================================

function renderCharts() {
    if(typeof Chart === 'undefined') return;
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    
    // Destrói anterior se houver
    if(window.myChart) window.myChart.destroy();

    const ops = loadData(DB_KEYS.OPERACOES);
    const labels = [];
    const dataFat = [];
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
        
        // Lucro Simplificado (Faturamento - Comissao - Despesas)
        // Para performance, ignoramos diesel calculado no gráfico rápido
        const lucro = opsMes.reduce((a,b) => a + (
            (Number(b.faturamento)||0) - (Number(b.comissao)||0) - (Number(b.despesas)||0)
        ), 0);

        dataFat.push(fat);
        dataLucro.push(lucro);
    }

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Faturamento', data: dataFat, borderColor: '#10b981', tension: 0.3 },
                { label: 'Lucro Op.', data: dataLucro, borderColor: '#3b82f6', tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

window.gerarRelatorioCobranca = function() {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const cnpj = document.getElementById('selectContratanteRelatorio').value;

    if(!ini || !fim || !cnpj) return alert('Selecione Contratante e Período.');

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        return o.data >= ini && o.data <= fim && o.contratanteCNPJ === cnpj;
    });

    if(!ops.length) return alert('Nada encontrado.');

    let total = 0;
    const rows = ops.map(o => {
        const saldo = (Number(o.faturamento)||0) - (Number(o.adiantamento)||0);
        total += saldo;
        return `<tr>
            <td>${formatDateBr(o.data)}</td>
            <td>${o.veiculoPlaca}</td>
            <td>${formatCurrency(o.faturamento)}</td>
            <td style="color:red">${formatCurrency(o.adiantamento)}</td>
            <td><strong>${formatCurrency(saldo)}</strong></td>
        </tr>`;
    }).join('');

    const html = `
        <div style="padding:20px; font-family:sans-serif;">
            <h2 style="color:#0f172a; border-bottom:2px solid #10b981;">Relatório de Cobrança</h2>
            <p><strong>Período:</strong> ${formatDateBr(ini)} a ${formatDateBr(fim)}</p>
            <table style="width:100%; border-collapse:collapse; margin-top:20px;" border="1" cellpadding="8">
                <tr style="background:#f1f5f9;"><th>Data</th><th>Veículo</th><th>Valor</th><th>Adiant.</th><th>Saldo</th></tr>
                ${rows}
            </table>
            <h3 style="text-align:right; margin-top:20px; color:#10b981;">TOTAL A RECEBER: ${formatCurrency(total)}</h3>
        </div>
    `;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    if(!el || !el.innerText) return alert('Gere o relatório primeiro.');
    html2pdf().from(el).save('relatorio_logimaster.pdf');
};

// =============================================================================
// 14. BACKUP & RESET
// =============================================================================

window.exportDataBackup = function() {
    const bk = {};
    Object.values(DB_KEYS).forEach(k => bk[k] = loadData(k));
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bk));
    a.download = `backup_logimaster_${new Date().toISOString().slice(0,10)}.json`;
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
            alert('Dados restaurados com sucesso!');
            location.reload();
        } catch(e) { alert('Arquivo inválido.'); }
    };
    r.readAsText(f);
};

window.fullSystemReset = function() {
    if(confirm('ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS!')) {
        if(confirm('Tem certeza absoluta?')) {
            localStorage.clear();
            location.reload();
        }
    }
};

// =============================================================================
// 15. SETUP INICIAL (DOM LOAD)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Navegação Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            // Add active
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-page')).classList.add('active');
            
            // Ações específicas
            if(btn.getAttribute('data-page') === 'home') window.changeMonth(0);
            if(btn.getAttribute('data-page') === 'graficos') renderCharts();
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

    // Mobile Menu
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.querySelector('.sidebar').style.transform = 'translateX(0)';
        document.querySelector('.overlay').style.display = 'block';
    });
    
    document.querySelector('.overlay')?.addEventListener('click', () => {
        document.querySelector('.sidebar').style.transform = 'translateX(-100%)';
        document.querySelector('.overlay').style.display = 'none';
    });

    // Listeners Específicos
    const selAj = document.getElementById('selectAjudantesOperacao');
    if(selAj) selAj.addEventListener('change', handleAjudanteSelectionChange);

    // Inicialização
    setupFormHandlers();
    populateAllSelects();
    window.changeMonth(0);
    renderOperacaoTable();
    renderDespesasTable();
    updateDashboardStats();
    
    // Backup Import Listener
    document.getElementById('inputImportBackup')?.addEventListener('change', window.importDataBackup);
});