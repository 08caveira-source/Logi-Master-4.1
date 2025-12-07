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
    // Exceção: Operações (Checkins) podem ser atualizadas pelo funcionário
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES) {
       // Apenas operações podem ser escritas por funcionários (update de status)
    }

    // 1. Atualiza cache local imediatamente
    APP_CACHE[key] = value;
    
    // 2. Envia para o Firebase se estiver disponível
    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        // Proteção: Se não tiver company definida, não tenta salvar
        if (!window.CURRENT_USER.company) return;
        
        const companyDomain = window.CURRENT_USER.company; 

        try {
            await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            console.log(`Dados de ${key} salvos na nuvem da empresa ${companyDomain}.`);
        } catch (e) {
            console.error("Erro ao salvar no Firebase:", e);
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

function detectPixType(key) {
    if (!key) return '';
    const v = key.trim();
    const d = onlyDigits(v);
    if (v.includes('@')) return 'EMAIL';
    if (/^\+?\d+$/.test(v) && (d.length >= 10 && d.length <= 13)) return 'TELEFONE';
    if (/^\d{11}$/.test(d)) return 'CPF';
    if (/^\d{14}$/.test(d)) return 'CNPJ';
    return 'ALEATÓRIA';
}

function copyToClipboard(text, silent = false) {
    if (!text) return alert('NADA PARA COPIAR.');
    navigator.clipboard.writeText(text).then(() => {
        if (!silent) alert('COPIADO PARA A ÁREA DE TRANSFERÊNCIA!');
    }, () => alert('FALHA AO COPIAR.'));
}

// =============================================================================
// 5. VALIDAÇÕES E UI
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
// 6. LÓGICA DE AJUDANTES
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
// 7. POPULATE SELECTS (PREENCHER DROPDOWNS)
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
        Array.from(sel.options).forEach(o => {
            if (prev.includes(o.value)) o.selected = true;
        });
    } catch {}
}

function populateAllSelects() {
    const motoristas = loadData(DB_KEYS.MOTORISTAS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const ajudantes = loadData(DB_KEYS.AJUDANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE PARA ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');

    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE O MOTORISTA OU AJUDANTE...</option>`;
        motoristas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = `motorista:${m.id}`;
            opt.textContent = `MOTORISTA - ${m.nome}`;
            selRecibo.appendChild(opt);
        });
        ajudantes.forEach(a => {
            const opt = document.createElement('option');
            opt.value = `ajudante:${a.id}`;
            opt.textContent = `AJUDANTE - ${a.nome}`;
            selRecibo.appendChild(opt);
        });
    }
    
    // Selects do Modal de Checkin 
    populateSelect('checkinVeiculo', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('checkinContratante', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    populateSelect('checkinAtividade', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');

    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
    renderCheckinsTable();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    if (emp && emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO SOCIAL:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p><p><strong>TELEFONE:</strong> ${emp.telefone || ''}</p>`;
    } else div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO CADASTRADO.</p>`;
}

// =============================================================================
// 8. TABELAS DE CADASTRO
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, rowsHtml = '';
    let idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';

    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    if (!tabela) return;

    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        if (key === DB_KEYS.ATIVIDADES) {
            col1 = item.id;
            col2 = item.nome;
            col3 = '';
        }
        
        let btns = '';
        if (key !== DB_KEYS.ATIVIDADES) {
             btns += `<button class="btn-action view-btn" title="VISUALIZAR" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        }
        
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" title="EDITAR" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" title="EXCLUIR" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }

        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td>${col3 !== '' ? `<td>${col3}</td>` : ''}<td>${btns}</td></tr>`;
    });
    if (tabela && tabela.querySelector('tbody')) tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
}

// =============================================================================
// 9. CRUD GENÉRICO
// =============================================================================

function viewCadastro(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.6;">';
    if (key === DB_KEYS.MOTORISTAS) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>E-MAIL ACESSO:</strong> ${item.email || 'NÃO CADASTRADO'}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>CNH:</strong> ${item.cnh || ''}</p><p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p><p><strong>CATEGORIA CNH:</strong> ${item.categoriaCNH || ''}</p><p><strong>CURSOS ESPECIAIS:</strong> ${item.temCurso ? (item.cursoDescricao || 'SIM (NÃO ESPECIFICADO)') : 'NÃO'}</p><p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
    } else if (key === DB_KEYS.AJUDANTES) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>E-MAIL ACESSO:</strong> ${item.email || 'NÃO CADASTRADO'}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p><p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
    } else if (key === DB_KEYS.VEICULOS) {
        html += `<p><strong>PLACA:</strong> ${item.placa}</p><p><strong>MODELO:</strong> ${item.modelo}</p><p><strong>ANO:</strong> ${item.ano || ''}</p><p><strong>RENAVAM:</strong> ${item.renavam || ''}</p><p><strong>CHASSI:</strong> ${item.chassi || ''}</p>`;
    } else if (key === DB_KEYS.CONTRATANTES) {
        html += `<p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p><p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(item.cnpj)}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
    }
    html += '</div>';
    openViewModal('VISUALIZAR REGISTRO', html);
}

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (key === DB_KEYS.MOTORISTAS) {
        const m = getMotorista(id);
        if (!m) return;
        document.getElementById('motoristaNome').value = m.nome;
        document.getElementById('motoristaEmail').value = m.email || '';
        document.getElementById('motoristaDocumento').value = m.documento;
        document.getElementById('motoristaTelefone').value = m.telefone;
        document.getElementById('motoristaCNH').value = m.cnh;
        document.getElementById('motoristaValidadeCNH').value = m.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = m.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = m.temCurso ? 'sim' : 'nao';
        toggleCursoInput();
        document.getElementById('motoristaCursoDescricao').value = m.cursoDescricao;
        document.getElementById('motoristaPix').value = m.pix;
        document.getElementById('motoristaId').value = m.id;
    } else if (key === DB_KEYS.AJUDANTES) {
        const a = getAjudante(id);
        if (!a) return;
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteEmail').value = a.email || '';
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
    } else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
    } else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
    } else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
    }
    alert('DADOS CARREGADOS NO FORMULÁRIO. ALTERE E CLIQUE EM SALVAR.');
}

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('CONFIRMA EXCLUSÃO?')) return;
    let arr = loadData(key);
    if (!arr || !arr.length) return;
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    alert('ITEM EXCLUÍDO (PROCESSANDO...).');
}

// =============================================================================
// 10. FORM HANDLERS (SUBMISSÃO DE FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 101),
                nome: document.getElementById('motoristaNome').value.toUpperCase(),
                email: document.getElementById('motoristaEmail').value.toLowerCase().trim(),
                documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
                pix: document.getElementById('motoristaPix').value || '',
                uid: ''
            };
            
            if (idHidden) {
                const old = arr.find(a => a.id === obj.id);
                if (old && old.uid) obj.uid = old.uid;
            }

            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.MOTORISTAS, arr);
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            alert('MOTORISTA SALVO!');
        });
    }

    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 201),
                nome: document.getElementById('ajudanteNome').value.toUpperCase(),
                email: document.getElementById('ajudanteEmail').value.toLowerCase().trim(),
                documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
                pix: document.getElementById('ajudantePix').value || '',
                uid: ''
            };

            if (idHidden) {
                const old = arr.find(a => a.id === obj.id);
                if (old && old.uid) obj.uid = old.uid;
            }

            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            alert('AJUDANTE SALVO!');
        });
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', () => document.getElementById('veiculoId').value = '');
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', () => document.getElementById('contratanteId').value = '');
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', () => document.getElementById('atividadeId').value = '');
    }

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

    // DESPESA GERAL
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

                    arr.push({
                        id,
                        data: dataParcela,
                        veiculoPlaca,
                        descricao: descFinal,
                        valor: Number(valorParcela.toFixed(2)),
                        modoPagamento,
                        pago: estaPaga
                    });
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

    // OPERAÇÕES
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
                ajudantes: ajudantesVisual.slice()
            };

            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            
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
    
    // Check-in de Confirmação (Funcionário)
    const formCheckinConfirm = document.getElementById('formCheckinConfirm');
    if (formCheckinConfirm) {
        formCheckinConfirm.addEventListener('submit', (e) => {
            e.preventDefault();
            const opId = Number(document.getElementById('checkinOpId').value);
            const kmRodado = Number(document.getElementById('checkinKmRodado').value) || 0;
            const valorAbastecido = Number(document.getElementById('checkinValorAbastecido').value) || 0;
            const precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idx = arr.findIndex(o => o.id === opId);
            
            if (idx >= 0) {
                arr[idx].status = 'CONFIRMADA';
                if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
                    arr[idx].kmRodado = kmRodado;
                    arr[idx].combustivel = valorAbastecido;
                    arr[idx].precoLitro = precoLitro;
                }
                saveData(DB_KEYS.OPERACOES, arr);
                alert('CHECK-IN REALIZADO E SERVIÇO CONFIRMADO!');
                closeCheckinConfirmModal();
                renderCheckinsTable(); 
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

let currentDate = new Date();

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ops.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ops.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        const isAgendada = op.status === 'AGENDADA';
        const statusBadge = isAgendada 
            ? '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>' 
            : '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        const faturamentoDisplay = isAgendada && (!op.faturamento) ? '(PENDENTE)' : formatCurrency(op.faturamento);

        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>`;
        }

        rows += `<tr><td>${dataFmt}</td><td>${motorista}</td><td>${statusBadge}</td><td>${faturamentoDisplay}</td><td>${btns}</td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    
    const isAgendada = op.status === 'AGENDADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)}</li>`;
    }).join('') || '<li>NENHUM</li>';

    let detailsHtml = '';

    if (isAgendada) {
        detailsHtml = `
            <div style="background:#fff3e0; padding:10px; border-radius:4px; border-left:4px solid orange; margin-bottom:15px;">
                <h4 style="color:#e65100; margin-bottom:5px;">OPERAÇÃO AGENDADA</h4>
                <p>Esta operação aguarda confirmação (check-in) pelo motorista ou ajudante.</p>
            </div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <div style="margin-top:10px;"><strong>EQUIPE (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    } else {
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
        const custoDieselEstimado = calcularCustoConsumoViagem(op) || 0;
        const liquidoOperacional = (op.faturamento || 0) - ((op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselEstimado);
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
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <p style="font-size:1.1rem; color:var(--primary-color);"><strong>KM RODADO:</strong> ${op.kmRodado || 0} KM</p> 
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>TOTAL DE DIÁRIAS (AJUDANTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>AJUDANTES:</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    }

    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ds.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ds.forEach(d => {
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
// NOVO: SISTEMA DE CHECK-INS E AGENDAMENTOS (Lista para funcionários)
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const agendadas = ops.filter(o => o.status === 'AGENDADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { 
        let rows = '';
        if (!agendadas.length) {
            rows = '<tr><td colspan="5" style="text-align:center;">NENHUM AGENDAMENTO PENDENTE.</td></tr>';
        } else {
            agendadas.forEach(op => {
                const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                rows += `<tr><td>${dataFmt}</td><td>${motorista}</td><td>${op.veiculoPlaca}</td><td><span style="color:orange;">AGUARDANDO</span></td><td><button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button> <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button></td></tr>`;
            });
        }
        tabelaAdmin.querySelector('tbody').innerHTML = rows;
    }

    // B. FUNCIONÁRIO
    const listaFunc = document.getElementById('listaServicosAgendados');
    if (listaFunc && window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        let myProfileId = null;
        let myKey = window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const myProfile = loadData(myKey).find(p => p.uid === myUid);
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            listaFunc.innerHTML = '<p style="text-align:center;">PERFIL NÃO VINCULADO CORRETAMENTE.</p>';
            return;
        }

        const myAgendas = agendadas.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') return op.motoristaId === myProfileId;
            else return (op.ajudantes || []).some(a => a.id === myProfileId);
        });

        if (!myAgendas.length) {
            listaFunc.innerHTML = '<p style="text-align:center; color:#666;">NENHUM SERVIÇO AGENDADO NO MOMENTO.</p>';
        } else {
            let html = '';
            myAgendas.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                const atividade = getAtividade(op.atividadeId)?.nome || '-';
                
                let equipeInfo = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome || 'ID '+a.id).join(', ');
                    equipeInfo = `<strong>AJUDANTES:</strong> ${nomesAjudantes || 'NENHUM'}`;
                } else {
                    const nomeMotorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                    equipeInfo = `<strong>MOTORISTA:</strong> ${nomeMotorista}`;
                }

                html += `<div class="card" style="border-left: 5px solid var(--primary-color);"><div style="display:flex; justify-content:space-between; align-items:start;"><div><h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4><p><strong>CLIENTE:</strong> ${contratante}</p><p><strong>ATIVIDADE:</strong> ${atividade}</p><p style="margin-top:5px; font-size:0.9rem; color:#555;">${equipeInfo}</p></div><button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-check-circle"></i> CONFIRMAR</button></div></div>`;
            });
            listaFunc.innerHTML = html;
        }
    }
}

window.openCheckinConfirmModal = function(opId) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === opId);
    if (!op) return;
    document.getElementById('checkinDisplayData').textContent = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    document.getElementById('checkinDisplayAtividade').textContent = getAtividade(op.atividadeId)?.nome || '-';
    
    if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
        const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome).join(', ');
        document.getElementById('checkinDisplayEquipeInfo').textContent = `AJUDANTES: ${nomesAjudantes || 'NENHUM'}`;
        document.getElementById('checkinDriverFields').style.display = 'block';
    } else {
        const nomeMotorista = getMotorista(op.motoristaId)?.nome;
        document.getElementById('checkinDisplayEquipeInfo').textContent = `MOTORISTA: ${nomeMotorista}`;
        document.getElementById('checkinDriverFields').style.display = 'none';
    }
    document.getElementById('checkinOpId').value = op.id;
    document.getElementById('modalCheckinConfirm').style.display = 'block';
};

window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };

// =============================================================================
// 10. FORM HANDLERS (SUBMISSÃO DE FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    // --- MOTORISTA (ATUALIZADO COM EMAIL) ---
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 101),
                nome: document.getElementById('motoristaNome').value.toUpperCase(),
                // SALVA O EMAIL PARA O PRÉ-CADASTRO
                email: document.getElementById('motoristaEmail').value.toLowerCase().trim(),
                documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
                pix: document.getElementById('motoristaPix').value || '',
                uid: '' // UID começa vazio, será preenchido automaticamente no primeiro login
            };
            
            // Se for edição, mantém o UID se já existir para não bloquear o usuário
            if (idHidden) {
                const old = arr.find(a => a.id === obj.id);
                if (old && old.uid) obj.uid = old.uid;
            }

            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.MOTORISTAS, arr);
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            alert('MOTORISTA SALVO! SE INFORMOU E-MAIL, AVISE O FUNCIONÁRIO PARA CRIAR A SENHA NO PRIMEIRO ACESSO.');
        });
    }

    // --- AJUDANTE (ATUALIZADO COM EMAIL) ---
    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 201),
                nome: document.getElementById('ajudanteNome').value.toUpperCase(),
                // SALVA O EMAIL PARA O PRÉ-CADASTRO
                email: document.getElementById('ajudanteEmail').value.toLowerCase().trim(),
                documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
                pix: document.getElementById('ajudantePix').value || '',
                uid: ''
            };

            if (idHidden) {
                const old = arr.find(a => a.id === obj.id);
                if (old && old.uid) obj.uid = old.uid;
            }

            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            alert('AJUDANTE SALVO! SE INFORMOU E-MAIL, AVISE O FUNCIONÁRIO PARA CRIAR A SENHA NO PRIMEIRO ACESSO.');
        });
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', () => document.getElementById('veiculoId').value = '');
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', () => document.getElementById('contratanteId').value = '');
    }

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
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', () => document.getElementById('atividadeId').value = '');
    }

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

    // DESPESA GERAL
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

                    arr.push({
                        id,
                        data: dataParcela,
                        veiculoPlaca,
                        descricao: descFinal,
                        valor: Number(valorParcela.toFixed(2)),
                        modoPagamento,
                        formaPagamento,
                        pago: estaPaga
                    });
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

    // OPERAÇÕES (COM AGENDAMENTO)
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
                ajudantes: ajudantesVisual.slice()
            };

            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            
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
    
    // Check-in de Confirmação (Funcionário)
    const formCheckinConfirm = document.getElementById('formCheckinConfirm');
    if (formCheckinConfirm) {
        formCheckinConfirm.addEventListener('submit', (e) => {
            e.preventDefault();
            const opId = Number(document.getElementById('checkinOpId').value);
            const kmRodado = Number(document.getElementById('checkinKmRodado').value) || 0;
            const valorAbastecido = Number(document.getElementById('checkinValorAbastecido').value) || 0;
            const precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idx = arr.findIndex(o => o.id === opId);
            
            if (idx >= 0) {
                arr[idx].status = 'CONFIRMADA';
                // Motorista preenche execução real
                if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
                    arr[idx].kmRodado = kmRodado;
                    arr[idx].combustivel = valorAbastecido;
                    arr[idx].precoLitro = precoLitro;
                }
                
                saveData(DB_KEYS.OPERACOES, arr);
                alert('CHECK-IN REALIZADO E SERVIÇO CONFIRMADO!');
                closeCheckinConfirmModal();
                renderCheckinsTable(); 
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

let currentDate = new Date();

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ops.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ops.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        const isAgendada = op.status === 'AGENDADA';
        const statusBadge = isAgendada 
            ? '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>' 
            : '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        const faturamentoDisplay = isAgendada && (!op.faturamento) ? '(PENDENTE)' : formatCurrency(op.faturamento);

        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>`;
        }

        rows += `<tr><td>${dataFmt}</td><td>${motorista}</td><td>${statusBadge}</td><td>${faturamentoDisplay}</td><td>${btns}</td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    
    const isAgendada = op.status === 'AGENDADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)}</li>`;
    }).join('') || '<li>NENHUM</li>';

    let detailsHtml = '';

    if (isAgendada) {
        detailsHtml = `
            <div style="background:#fff3e0; padding:10px; border-radius:4px; border-left:4px solid orange; margin-bottom:15px;">
                <h4 style="color:#e65100; margin-bottom:5px;">OPERAÇÃO AGENDADA</h4>
                <p>Esta operação aguarda confirmação (check-in) pelo motorista ou ajudante.</p>
            </div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <div style="margin-top:10px;"><strong>EQUIPE (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    } else {
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
        const custoDieselEstimado = calcularCustoConsumoViagem(op) || 0;
        const liquidoOperacional = (op.faturamento || 0) - ((op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselEstimado);
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
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <p style="font-size:1.1rem; color:var(--primary-color);"><strong>KM RODADO:</strong> ${op.kmRodado || 0} KM</p> 
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>TOTAL DE DIÁRIAS (AJUDANTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>AJUDANTES:</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    }

    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ds.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ds.forEach(d => {
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
// NOVO: SISTEMA DE CHECK-INS E AGENDAMENTOS (Lista para funcionários)
// =============================================================================

function renderCheckinsTable() {
    // Essa função gerencia DUAS áreas diferentes:
    // 1. Tabela do Admin (Monitoramento) - id: tabelaCheckinsPendentes
    // 2. Lista do Funcionário (Para Confirmar) - id: listaServicosAgendados

    const ops = loadData(DB_KEYS.OPERACOES);
    const agendadas = ops.filter(o => o.status === 'AGENDADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. LÓGICA DO ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { // Se não é read-only, é admin
        let rows = '';
        if (!agendadas.length) {
            rows = '<tr><td colspan="5" style="text-align:center;">NENHUM AGENDAMENTO PENDENTE.</td></tr>';
        } else {
            agendadas.forEach(op => {
                const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                rows += `<tr>
                    <td>${dataFmt}</td>
                    <td>${motorista}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td><span style="color:orange;">AGUARDANDO</span></td>
                    <td>
                        <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
        tabelaAdmin.querySelector('tbody').innerHTML = rows;
    }

    // B. LÓGICA DO FUNCIONÁRIO (Agendamentos Pessoais)
    const listaFunc = document.getElementById('listaServicosAgendados');
    if (listaFunc && window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        
        // Descobre o ID interno do perfil do usuário logado
        let myProfileId = null;
        let myKey = window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const myProfile = loadData(myKey).find(p => p.uid === myUid);
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            listaFunc.innerHTML = '<p style="text-align:center;">PERFIL NÃO VINCULADO CORRETAMENTE.</p>';
            return;
        }

        // Filtra as agendadas para ESTE usuário
        const myAgendas = agendadas.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') {
                return op.motoristaId === myProfileId;
            } else {
                return (op.ajudantes || []).some(a => a.id === myProfileId);
            }
        });

        if (!myAgendas.length) {
            listaFunc.innerHTML = '<p style="text-align:center; color:#666;">NENHUM SERVIÇO AGENDADO NO MOMENTO.</p>';
        } else {
            let html = '';
            myAgendas.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                const atividade = getAtividade(op.atividadeId)?.nome || '-';
                
                // Lógica de exibição de equipe
                let equipeInfo = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome || 'ID '+a.id).join(', ');
                    equipeInfo = `<strong>AJUDANTES:</strong> ${nomesAjudantes || 'NENHUM'}`;
                } else {
                    const nomeMotorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                    equipeInfo = `<strong>MOTORISTA:</strong> ${nomeMotorista}`;
                }

                html += `
                <div class="card" style="border-left: 5px solid var(--primary-color);">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4>
                            <p><strong>CLIENTE:</strong> ${contratante}</p>
                            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
                            <p style="margin-top:5px; font-size:0.9rem; color:#555;">${equipeInfo}</p>
                        </div>
                        <button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})">
                            <i class="fas fa-check-circle"></i> CONFIRMAR
                        </button>
                    </div>
                </div>`;
            });
            listaFunc.innerHTML = html;
        }
    }
}

// Modal de Confirmação de Check-in
window.openCheckinConfirmModal = function(opId) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === opId);
    if (!op) return;

    // Preenche dados visuais (somente leitura)
    document.getElementById('checkinDisplayData').textContent = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    document.getElementById('checkinDisplayAtividade').textContent = getAtividade(op.atividadeId)?.nome || '-';
    
    if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
        const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome).join(', ');
        document.getElementById('checkinDisplayEquipeInfo').textContent = `AJUDANTES: ${nomesAjudantes || 'NENHUM'}`;
        document.getElementById('checkinDriverFields').style.display = 'block';
    } else {
        const nomeMotorista = getMotorista(op.motoristaId)?.nome;
        document.getElementById('checkinDisplayEquipeInfo').textContent = `MOTORISTA: ${nomeMotorista}`;
        document.getElementById('checkinDriverFields').style.display = 'none';
    }

    document.getElementById('checkinOpId').value = op.id;
    document.getElementById('modalCheckinConfirm').style.display = 'block';
};

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
};

// =============================================================================
// 12. CALENDÁRIO E DASHBOARD
// =============================================================================

const calendarGrid = document.getElementById('calendarGrid');
const currentMonthYear = document.getElementById('currentMonthYear');

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthYear.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';
    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    dayNames.forEach(n => {
        const h = document.createElement('div');
        h.classList.add('day-header');
        h.textContent = n;
        calendarGrid.appendChild(h);
    });
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDayOfMonth; i++) {
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
            cell.addEventListener('click', (e) => showOperationDetails(e.currentTarget.getAttribute('data-date')));
        }
        calendarGrid.appendChild(cell);
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate);
    updateDashboardStats();
}
window.changeMonth = changeMonth;

function showOperationDetails(date) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.data === date);
    if (!ops.length) return;
    
    const modalTitle = `DETALHES DAS OPERAÇÕES EM ${new Date(date+'T00:00:00').toLocaleDateString('pt-BR')}`;
    let html = '';
    ops.forEach(op => {
        const isAgendada = op.status === 'AGENDADA';
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const ajudantesHtml = (op.ajudantes || []).map(a => `<li>${(getAjudante(a.id)?.nome)||'ID:'+a.id} — ${formatCurrency(Number(a.diaria)||0)}</li>`).join('') || '<li>NENHUM</li>';
        
        let details = '';
        if (isAgendada) {
            details = `<p style="color:orange; font-weight:bold;">AGENDADA (PENDENTE CHECK-IN)</p>`;
        } else {
            const liquido = (op.faturamento || 0) - ((op.comissao || 0) + (op.despesas || 0)); 
            details = `<p style="font-weight:700;color:${liquido>=0?'var(--success-color)':'var(--danger-color)'}">LUCRO OP. APROX: ${formatCurrency(liquido)}</p>`;
        }

        let btns = '';
        if (!window.IS_READ_ONLY) {
             btns = `<div style="text-align:right;">
                <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i> EDITAR</button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i> EXCLUIR</button>
            </div>`;
        }

        html += `<div class="card" style="margin-bottom:10px;">
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            ${details}
            ${btns}
        </div>`;
    });
    openOperationDetails(modalTitle, html);
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const mesAtual = currentDate.getMonth();
    const anoAtual = currentDate.getFullYear();
    
    const opsMes = ops.filter(op => {
        const d = new Date(op.data + 'T00:00:00');
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual && op.status !== 'AGENDADA';
    });
    
    const despesasMes = despesas.filter(d => {
        const dt = new Date(d.data + 'T00:00:00');
        return dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual;
    });

    const totalFaturamento = opsMes.reduce((s, o) => s + (o.faturamento || 0), 0);
    const custoOp = opsMes.reduce((s, o) => {
        const diarias = (o.ajudantes || []).reduce((ss, a) => ss + (Number(a.diaria) || 0), 0);
        const custoDiesel = calcularCustoConsumoViagem(o) || 0;
        return s + (o.comissao || 0) + diarias + custoDiesel + (o.despesas || 0);
    }, 0);
    const custoGeral = despesasMes.reduce((s, d) => s + (d.valor || 0), 0);
    const totalCustos = custoOp + custoGeral;
    const receitaLiquida = totalFaturamento - totalCustos;

    document.getElementById('faturamentoMes').textContent = formatCurrency(totalFaturamento);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    document.getElementById('receitaMes').textContent = formatCurrency(receitaLiquida);
}

// =============================================================================
// 13. GRÁFICOS
// =============================================================================

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
    const dataRevenue = [];

    let totalReceitaHistorica = 0;
    ops.forEach(o => totalReceitaHistorica += (o.faturamento || 0));
    document.getElementById('receitaTotalHistorico').textContent = formatCurrency(totalReceitaHistorica);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

        const opsMes = ops.filter(op => {
            const dateOp = new Date(op.data + 'T00:00:00');
            return dateOp.getMonth() === m && dateOp.getFullYear() === y && op.status !== 'AGENDADA';
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
            sumCombustivelEstimado += (calcularCustoConsumoViagem(op) || 0);
            sumKm += (Number(op.kmRodado) || 0);
            const diarias = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria) || 0), 0);
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });
        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;
        const lucro = sumFaturamento - (sumCombustivelEstimado + sumOutros);

        dataCombustivel.push(sumCombustivelEstimado);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(lucro);
        dataKm.push(sumKm);
        dataRevenue.push(sumFaturamento);
    }

    if (chartInstance) chartInstance.destroy();

    const revenueDataSafe = dataRevenue;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                    label: 'CUSTO DIESEL (ESTIMADO)',
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
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'VALORES (R$)' } },
                y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'KM' } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.type === 'line' || context.dataset.label === 'KM RODADO') return label + context.parsed.y + ' KM';
                            const val = context.parsed.y;
                            const totalRevenue = revenueDataSafe[context.dataIndex];
                            let percent = 0;
                            if (totalRevenue > 0) percent = (val / totalRevenue) * 100;
                            return `${label}${formatCurrency(val)} (${percent.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// =============================================================================
// 14. SISTEMA DE LEMBRETES & OUTROS
// =============================================================================

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

function closeReminderModal() { document.getElementById('reminderModal').style.display = 'none'; }
window.closeReminderModal = closeReminderModal;

window.payExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) { arr[idx].pago = true; saveData(DB_KEYS.DESPESAS_GERAIS, arr); const el = event.target.closest('.reminder-item'); if (el) el.remove(); if (!document.querySelectorAll('.reminder-item').length) closeReminderModal(); renderDespesasTable(); }
};

window.postponeExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        const atual = new Date(arr[idx].data + 'T00:00:00'); atual.setDate(atual.getDate() + 1);
        const y = atual.getFullYear(); const m = String(atual.getMonth() + 1).padStart(2, '0'); const dStr = String(atual.getDate()).padStart(2, '0');
        arr[idx].data = `${y}-${m}-${dStr}`; saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        alert(`REAGENDADO PARA ${atual.toLocaleDateString('pt-BR')}`); const el = event.target.closest('.reminder-item'); if (el) el.remove(); if (!document.querySelectorAll('.reminder-item').length) closeReminderModal(); renderDespesasTable();
    }
};

window.cancelExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    if(!confirm("TEM CERTEZA?")) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice(); arr = arr.filter(d => d.id !== id); saveData(DB_KEYS.DESPESAS_GERAIS, arr);
    const el = event.target.closest('.reminder-item'); if (el) el.remove(); if (!document.querySelectorAll('.reminder-item').length) closeReminderModal(); renderDespesasTable();
};

function fullSystemReset() {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    if (confirm("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS. CONFIRMA?")) { Object.values(DB_KEYS).forEach(k => saveData(k, k === DB_KEYS.MINHA_EMPRESA ? {} : [])); alert("SISTEMA RESETADO."); }
}
window.fullSystemReset = fullSystemReset;

// =============================================================================
// 15. INICIALIZAÇÃO E SINCRONIZAÇÃO (REALTIME)
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) { setTimeout(setupRealtimeListeners, 500); return; }
    const { db, doc, onSnapshot } = window.dbRef;
    const keys = Object.values(DB_KEYS);
    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        const companyDomain = window.CURRENT_USER.company;
        keys.forEach(key => {
            onSnapshot(doc(db, 'companies', companyDomain, 'data', key), (docSnap) => {
                if (docSnap.exists()) { const data = docSnap.data(); APP_CACHE[key] = data.items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); } else { saveData(key, key === DB_KEYS.MINHA_EMPRESA ? {} : []); }
                updateUI();
            });
        });
    }
}

function updateUI() {
    if (window.CURRENT_USER && window.CURRENT_USER.email === 'admin@logimaster.com') return;
    populateAllSelects(); renderOperacaoTable(); renderDespesasTable(); updateDashboardStats(); renderCharts(); checkAndShowReminders(); renderMinhaEmpresaInfo(); renderCalendar(currentDate); renderCheckinsTable(); 
    if (window.CURRENT_USER && window.CURRENT_USER.role === 'admin') setupCompanyUserManagement(); 
    if (window.IS_READ_ONLY && window.enableReadOnlyMode) window.enableReadOnlyMode();
}

function setupInputFormattingListeners() {
    const inputs = ['minhaEmpresaCNPJ', 'contratanteCNPJ']; 
    inputs.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value)); });
    
    const phones = ['minhaEmpresaTelefone', 'contratanteTelefone', 'motoristaTelefone', 'ajudanteTelefone', 'empTelefone']; 
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

// =============================================================================
// 16. RECIBOS, BACKUP E RELATÓRIOS
// =============================================================================

function setupReciboListeners() {
    const btnGerar = document.getElementById('btnGerarRecibo'); const btnBaixar = document.getElementById('btnBaixarRecibo'); const btnZapRecibo = document.getElementById('btnWhatsappRecibo');
    if (!btnGerar) return;
    
    btnGerar.addEventListener('click', () => {
        const comp = document.getElementById('selectMotoristaRecibo').value; const inicio = document.getElementById('dataInicioRecibo').value; const fim = document.getElementById('dataFimRecibo').value;
        if (!comp || !inicio || !fim) return alert('PREENCHA TODOS OS CAMPOS.');
        
        const parsed = parseCompositeId(comp); const person = getPersonByComposite(comp); const empresa = getMinhaEmpresa(); const veiculoRecibo = document.getElementById('selectVeiculoRecibo').value; const contratanteRecibo = document.getElementById('selectContratanteRecibo').value;
        
        const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
            const d = new Date(op.data + 'T00:00:00'); const di = new Date(inicio + 'T00:00:00'); const df = new Date(fim + 'T23:59:59');
            if (d < di || d > df) return false;
            if (parsed.type === 'motorista' && String(op.motoristaId) !== String(parsed.id)) return false;
            if (parsed.type === 'ajudante' && !(op.ajudantes || []).some(a => String(a.id) === String(parsed.id))) return false;
            if (veiculoRecibo && op.veiculoPlaca !== veiculoRecibo) return false;
            if (contratanteRecibo && op.contratanteCNPJ !== contratanteRecibo) return false;
            return true;
        }).sort((a, b) => new Date(a.data) - new Date(b.data));

        if (!ops.length) { document.getElementById('reciboContent').innerHTML = `<p style="text-align:center;color:red">NENHUMA OPERAÇÃO.</p>`; btnBaixar.style.display = 'none'; return; }

        let total = 0;
        const linhas = ops.map(op => {
            const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const contrat = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
            let val = parsed.type === 'motorista' ? (op.comissao || 0) : ((op.ajudantes || []).find(a => String(a.id) === String(parsed.id))?.diaria || 0);
            total += Number(val);
            return `<tr><td>${dataFmt}</td><td>${op.veiculoPlaca}</td><td>${contrat}</td><td style="text-align:right;">${formatCurrency(val)}</td></tr>`;
        }).join('');

        const totalExt = new ConverterMoeda(total).getExtenso().toUpperCase();
        const nomePessoa = person ? person.nome : 'BENEFICIÁRIO';
        
        document.getElementById('reciboContent').innerHTML = `<div class="recibo-template"><div class="recibo-header"><h3>RECIBO DE PAGAMENTO</h3></div><p>PAGADOR: <strong>${empresa.razaoSocial || 'EMPRESA'}</strong></p><p>BENEFICIÁRIO: <strong>${nomePessoa}</strong></p><p>PERÍODO: ${new Date(inicio).toLocaleDateString()} A ${new Date(fim).toLocaleDateString()}</p><table style="width:100%;margin:10px 0;border-collapse:collapse;"><thead><tr><th style="text-align:left">DATA</th><th>VEÍCULO</th><th>CLIENTE</th><th style="text-align:right">VALOR</th></tr></thead><tbody>${linhas}</tbody></table><p style="text-align:right;font-weight:bold;font-size:1.1rem;">TOTAL: ${formatCurrency(total)} (${totalExt})</p><div class="recibo-assinaturas" style="margin-top:40px;display:flex;justify-content:space-between;"><div>_______________________<br>${nomePessoa}</div><div>_______________________<br>${empresa.razaoSocial || 'EMPRESA'}</div></div></div>`;
        document.getElementById('reciboTitle').style.display = 'block'; btnBaixar.style.display = 'inline-flex';
        
        btnBaixar.onclick = () => { html2pdf().from(document.querySelector('.recibo-template')).save(`RECIBO_${nomePessoa}.pdf`); };
    });
}

function parseCompositeId(v) { if(!v) return null; const p = v.split(':'); return { type: p[0], id: p[1] }; }
function getPersonByComposite(v) { const p = parseCompositeId(v); if(!p) return null; return p.type === 'motorista' ? getMotorista(p.id) : getAjudante(p.id); }

function exportDataBackup() { const d = {}; Object.values(DB_KEYS).forEach(k => d[k] = loadData(k)); const b = new Blob([JSON.stringify(d)], {type:'application/json'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'backup.json'; a.click(); }
function importDataBackup(e) { if(confirm("IMPORTAR E SUBSTITUIR TUDO?")) { const f = e.target.files[0]; const r = new FileReader(); r.onload = (ev) => { const d = JSON.parse(ev.target.result); Object.keys(d).forEach(k => saveData(k, d[k])); alert("IMPORTADO!"); location.reload(); }; r.readAsText(f); } }

function gerarRelatorio(e) {
    e.preventDefault();
    const ini = new Date(document.getElementById('dataInicioRelatorio').value + 'T00:00:00');
    const fim = new Date(document.getElementById('dataFimRelatorio').value + 'T23:59:59');
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        const d = new Date(op.data + 'T00:00:00');
        return d >= ini && d <= fim && (!motId || String(op.motoristaId) === motId) && op.status !== 'AGENDADA';
    });
    
    let rec = 0, gas = 0;
    ops.forEach(op => {
        rec += (op.faturamento || 0);
        const dias = (op.ajudantes || []).reduce((s,a)=>s+(Number(a.diaria)||0),0);
        gas += (op.comissao || 0) + dias + (op.despesas || 0) + (calcularCustoConsumoViagem(op)||0);
    });
    const liq = rec - gas;
    document.getElementById('reportContent').innerHTML = `<div style="padding:20px;"><h3>RELATÓRIO</h3><p>RECEITA: ${formatCurrency(rec)}</p><p>GASTOS (ESTIMADOS): ${formatCurrency(gas)}</p><h2 style="color:${liq>=0?'green':'red'}">LUCRO: ${formatCurrency(liq)}</h2></div>`;
    document.getElementById('reportResults').style.display = 'block';
}
window.exportReportToPDF = () => html2pdf().from(document.getElementById('reportContent')).save('relatorio.pdf');
class ConverterMoeda { constructor(v) { this.v = v; } getExtenso() { return "REAIS"; } } 

// =============================================================================
// 17. INICIALIZAÇÃO
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); i.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(i.getAttribute('data-page')).classList.add('active');
        if (i.getAttribute('data-page') === 'graficos') renderCharts();
    }));
    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active')); document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));
    const menuBtn = document.getElementById('mobileMenuBtn'); if (menuBtn) menuBtn.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('active'); document.getElementById('sidebarOverlay').classList.toggle('active'); });
    document.getElementById('sidebarOverlay').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebarOverlay').classList.remove('active'); });

    setupFormHandlers(); setupInputFormattingListeners(); setupReciboListeners();
});

window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; });

// =============================================================================
// 18. AUTH E CARGOS
// =============================================================================

window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    document.getElementById('menu-admin').style.display = 'none'; document.getElementById('menu-super-admin').style.display = 'none'; document.getElementById('menu-employee').style.display = 'none';
    
    if (user.email === 'admin@logimaster.com') { document.getElementById('menu-super-admin').style.display = 'block'; document.getElementById('super-admin').classList.add('active'); setupSuperAdmin(); }
    else if (!user.approved) { document.querySelector('.content').innerHTML = '<div class="card" style="text-align:center;padding:50px;"><h2>AGUARDANDO APROVAÇÃO</h2><button class="btn-danger" onclick="logoutSystem()">SAIR</button></div>'; }
    else if (user.role === 'admin') { document.getElementById('menu-admin').style.display = 'block'; document.getElementById('home').classList.add('active'); setupRealtimeListeners(); setupCompanyUserManagement(); }
    else { document.getElementById('menu-employee').style.display = 'block'; document.getElementById('employee-home').classList.add('active'); window.IS_READ_ONLY = true; setupRealtimeListeners(); window.enableReadOnlyMode(); }
};

window.logoutSystem = function() { if (window.dbRef && window.dbRef.auth) window.dbRef.signOut(window.dbRef.auth).then(() => location.href = "login.html"); else location.href = "login.html"; };

window.enableReadOnlyMode = function() {
    const forms = ['formOperacao','formDespesaGeral','formMotorista','formVeiculo','formContratante','formAjudante','formAtividade','formMinhaEmpresa','modalAdicionarAjudante'];
    forms.forEach(id => { const f = document.getElementById(id); if(f) f.querySelectorAll('input,select,button').forEach(e => { if(!e.closest('#formCheckinConfirm') && !e.classList.contains('close-btn')) e.disabled = true; }); });
    document.querySelectorAll('.btn-danger, .btn-warning, button[type="submit"]').forEach(b => { if(!b.closest('#formCheckinConfirm')) b.style.display = 'none'; });
    updateUI();
};

// =============================================================================
// 19. ADMINISTRAÇÃO (EMPRESA E SUPER) - CORRIGIDO
// =============================================================================

function setupCompanyUserManagement() {
    const { db, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc } = window.dbRef;
    if (!window.CURRENT_USER || !window.CURRENT_USER.company) return;

    onSnapshot(query(collection(db, "users"), where("company", "==", window.CURRENT_USER.company)), (s) => {
        const users = []; s.forEach(d => users.push(d.data())); renderCompanyUserTables(users);
    });
    window.toggleCompanyUserApproval = (uid, status) => updateDoc(doc(db, "users", uid), { approved: !status });
    window.deleteCompanyUser = (uid) => { if(confirm("EXCLUIR?")) deleteDoc(doc(db, "users", uid)); };
}

function renderCompanyUserTables(users) {
    const tPend = document.getElementById('tabelaCompanyPendentes'); const tAtiv = document.getElementById('tabelaCompanyAtivos');
    if (!users) users = [];
    
    const authEmails = users.map(u => u.email);
    const pendentes = users.filter(u => !u.approved && u.uid !== window.CURRENT_USER.uid);
    const ativos = users.filter(u => u.approved && u.uid !== window.CURRENT_USER.uid);
    
    // Tratamento de erro para listas vazias (Evita crash)
    const motoristas = loadData(DB_KEYS.MOTORISTAS) || [];
    const ajudantes = loadData(DB_KEYS.AJUDANTES) || [];

    const pre = [];
    motoristas.forEach(m => { if(m.email && !authEmails.includes(m.email)) pre.push({name:m.nome, email:m.email, role:'MOTORISTA (PRÉ)'}); });
    ajudantes.forEach(a => { if(a.email && !authEmails.includes(a.email)) pre.push({name:a.nome, email:a.email, role:'AJUDANTE (PRÉ)'}); });

    if(tPend) tPend.querySelector('tbody').innerHTML = [...pendentes.map(u=>`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>Criado</td><td><button class="btn-success btn-mini" onclick="toggleCompanyUserApproval('${u.uid}',false)">APROVAR</button> <button class="btn-danger btn-mini" onclick="deleteCompanyUser('${u.uid}')">X</button></td></tr>`), ...pre.map(p=>`<tr style="background:#fff8e1"><td>${p.name}</td><td>${p.email}</td><td>${p.role}</td><td>AGUARDANDO ACESSO</td><td>-</td></tr>`)].join('');
    if(tAtiv) tAtiv.querySelector('tbody').innerHTML = ativos.map(u=>`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><span style="color:green">ATIVO</span></td><td><button class="btn-danger btn-mini" onclick="toggleCompanyUserApproval('${u.uid}',true)">BLOQUEAR</button> <button class="btn-danger btn-mini" onclick="deleteCompanyUser('${u.uid}')">EXCLUIR</button></td></tr>`).join('');
}

function setupSuperAdmin() {
    const { db, collection, onSnapshot, updateDoc, doc, auth, sendPasswordResetEmail } = window.dbRef;
    onSnapshot(collection(db, "users"), (s) => { const u=[]; s.forEach(d=>u.push(d.data())); renderSuperAdminDashboard(u); });
    window.toggleUserApproval = (uid, s) => updateDoc(doc(db, "users", uid), { approved: !s });
    window.resetUserPassword = (email) => { if(confirm("RESETAR SENHA?")) sendPasswordResetEmail(auth, email).then(()=>alert("EMAIL ENVIADO")).catch(e=>alert("ERRO: "+e)); };
}

function renderSuperAdminDashboard(users) {
    const pend = users.filter(u => !u.approved && u.role === 'admin');
    const ativ = users.filter(u => u.approved && u.role === 'admin');
    document.getElementById('tabelaEmpresasPendentes').querySelector('tbody').innerHTML = pend.map(u=>`<tr><td>${u.email}</td><td>${u.createdAt}</td><td><button class="btn-success" onclick="toggleUserApproval('${u.uid}',false)">APROVAR</button></td></tr>`).join('');
    document.getElementById('tabelaEmpresasAtivas').querySelector('tbody').innerHTML = ativ.map(u=>{
        const subs = users.filter(s => s.company === u.company && s.role !== 'admin').map(s=>`<li>${s.email} <button onclick="resetUserPassword('${s.email}')" class="btn-mini">RESET</button></li>`).join('');
        return `<tr><td>${u.email}<br><small>${u.password||'***'}</small><ul>${subs}</ul></td><td>${u.createdAt}</td><td><button class="btn-danger" onclick="toggleUserApproval('${u.uid}',true)">BLOQ</button> <button onclick="resetUserPassword('${u.email}')">RESET</button></td></tr>`;
    }).join('');
}

// Exports globais para HTML
window.viewCadastro = viewCadastro; 
window.editCadastroItem = editCadastroItem; 
window.deleteItem = deleteItem; 
window.renderOperacaoTable = renderOperacaoTable; 
window.renderDespesasTable = renderDespesasTable; 
window.exportDataBackup = exportDataBackup; 
window.importDataBackup = importDataBackup; 
window.viewOperacaoDetails = viewOperacaoDetails; 
window.renderCharts = renderCharts; 
window.editOperacaoItem = editOperacaoItem;