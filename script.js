// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 7.0 (CORREÇÃO GLOBAL DE BOTÕES E ESCOPO)
// PARTE 1: INFRAESTRUTURA
// =============================================================================

// 1. CHAVES DO BANCO DE DADOS
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

// 2. CACHE GLOBAL
const APP_CACHE = {
    [DB_KEYS.FUNCIONARIOS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.ATIVIDADES]: [],
    [DB_KEYS.CHECKINS]: [],
    [DB_KEYS.PROFILE_REQUESTS]: []
};

// Variáveis Globais
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
window.currentDate = new Date(); // Inicialização vital para o calendário

// =============================================================================
// I/O: ENTRADA E SAÍDA DE DADOS
// =============================================================================

function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) return APP_CACHE[key] || {};
    return APP_CACHE[key] || [];
}

async function saveData(key, value) {
    // Bloqueio de segurança
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES && key !== DB_KEYS.PROFILE_REQUESTS) return;

    APP_CACHE[key] = value;

    // Sincronização Firebase
    if (window.dbRef && window.CURRENT_USER) {
        if (window.CURRENT_USER.email === 'admin@logimaster.com') return; // Super Admin não grava na raiz

        const { db, doc, setDoc } = window.dbRef;
        const domain = window.CURRENT_USER.company; 

        if (domain) {
            try {
                await setDoc(doc(db, 'companies', domain, 'data', key), { items: value });
                console.log(`[SYNC] ${key} salvo.`);
            } catch (e) {
                console.error(`Erro ao salvar ${key}:`, e);
            }
        }
    } else {
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

function formatCPF_CNPJ(value) {
    const d = onlyDigits(value);
    if (d.length <= 11) {
        return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    } else {
        return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
    }
}

function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Tornando acessível globalmente para uso em onlicks se necessário
window.formatCurrency = formatCurrency;
window.formatCPF_CNPJ = formatCPF_CNPJ;
window.formatPhoneBr = formatPhoneBr;

window.copyToClipboard = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
        () => alert('Copiado!'),
        () => alert('Erro ao copiar.')
    );
};

// =============================================================================
// GETTERS (BUSCA DE DADOS)
// =============================================================================

// ATENÇÃO: As funções de busca devem ser robustas com tipos (String vs Number)
function getFuncionario(id) {
    return loadData(DB_KEYS.FUNCIONARIOS).find(f => String(f.id) === String(id));
}

// Tornamos globais para garantir acesso
window.getFuncionario = getFuncionario;

// Wrappers para compatibilidade
window.getMotorista = function(id) {
    const f = getFuncionario(id);
    return (f && f.funcao === 'motorista') ? f : null;
};

window.getAjudante = function(id) {
    const f = getFuncionario(id);
    return (f && f.funcao === 'ajudante') ? f : null;
};

window.getVeiculo = function(placa) {
    return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
};

window.getContratante = function(cnpj) {
    return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
};

window.getAtividade = function(id) {
    return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
};

window.getMinhaEmpresa = function() {
    return loadData(DB_KEYS.MINHA_EMPRESA);
};

// =============================================================================
// CÁLCULOS FINANCEIROS E DE FROTA
// =============================================================================

// Média Global: Total KM Histórico / Total Litros Histórico
window.calcularMediaHistoricaVeiculo = function(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    const ops = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let kmTotal = 0;
    let litrosTotal = 0;

    ops.forEach(op => {
        if(Number(op.kmRodado) > 0) kmTotal += Number(op.kmRodado);
        
        const vlr = Number(op.combustivel) || 0;
        const prc = Number(op.precoLitro) || 0;
        if (vlr > 0 && prc > 0) litrosTotal += (vlr / prc);
    });

    if (litrosTotal <= 0) return 0;
    return kmTotal / litrosTotal; 
};

window.obterUltimoPrecoCombustivel = function(placa) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => 
        op.veiculoPlaca === placa && Number(op.precoLitro) > 0
    );
    if (ops.length === 0) return 0;
    ops.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(ops[0].precoLitro);
};

window.calcularCustoConsumoViagem = function(op) {
    if (!op || !op.veiculoPlaca || op.status !== 'CONFIRMADA') return 0;
    
    const media = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const km = Number(op.kmRodado) || 0;
    
    if (media <= 0 || km <= 0) return 0;

    let preco = Number(op.precoLitro) || 0;
    if (preco <= 0) preco = window.obterUltimoPrecoCombustivel(op.veiculoPlaca);
    if (preco <= 0) return 0;

    return (km / media) * preco;
};

window.obterUltimoKmFinal = function(placa) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => 
        op.veiculoPlaca === placa && Number(op.kmFinal) > 0
    );
    if (!ops.length) return 0;
    return Math.max(...ops.map(o => Number(o.kmFinal)));
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 7.0
// PARTE 2: UI GLOBAL (SOLUÇÃO DE ESCOPO PARA BOTÕES)
// =============================================================================

// --- 1. VALIDAÇÕES E INTERATIVIDADE DE FORMULÁRIO (GLOBAL) ---

window.verificarValidadeCNH = function(motoristaId) {
    // Usa o getter global definido na Parte 1
    const m = window.getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        alert(`⚠️ PERIGO: A CNH DE ${m.nome} ESTÁ VENCIDA!`);
    } else if (diffDays <= 30) {
        alert(`⚠️ ATENÇÃO: A CNH DE ${m.nome} VENCE EM ${diffDays} DIAS.`);
    }
};

// Exibe campos de CNH apenas se for Motorista
window.toggleDriverFields = function() {
    const role = document.getElementById('funcFuncao').value;
    const div = document.getElementById('driverSpecificFields');
    if (div) {
        div.style.display = (role === 'motorista') ? 'block' : 'none';
        
        // Limpa campos ao esconder para não salvar lixo
        if (role !== 'motorista') {
            const cnhInput = document.getElementById('funcCNH');
            if(cnhInput) cnhInput.value = '';
            document.getElementById('funcValidadeCNH').value = '';
            document.getElementById('funcCategoriaCNH').value = '';
        }
    }
};

window.toggleCursoInput = function() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'block' : 'none';
};

// --- 2. GERENCIAMENTO GLOBAL DE MODAIS (POP-UPS) ---

window.openViewModal = function(title, htmlContent) {
    const modal = document.getElementById('viewItemModal');
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    modal.style.display = 'block';
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

window.closeModal = function() {
    document.getElementById('operationDetailsModal').style.display = 'none';
};

// Fechar modais ao clicar fora (Listener Global)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

// --- 3. LÓGICA DE EQUIPE (ADICIONAR AJUDANTE MANUALMENTE) ---

// Variáveis locais para controle do modal de ajudante
let _pendingAjudanteToAdd = null;
window._operacaoAjudantesTempList = [];

// Botão "+" na tela de operação
window.handleManualAddAjudante = function() {
    if (window.IS_READ_ONLY) return alert("Ação não permitida.");
    
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;

    if (!id) return alert("Selecione um ajudante na lista primeiro.");

    // Evita duplicidade usando String() para garantir comparação correta
    if (window._operacaoAjudantesTempList.some(a => String(a.id) === String(id))) {
        alert("Este integrante já está na equipe.");
        sel.value = "";
        return;
    }

    // Busca na lista unificada
    const ajudante = window.getFuncionario(id);
    if (!ajudante) return alert("Erro no cadastro.");

    window.openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        window.renderAjudantesAdicionadosList();
        sel.value = "";
    });
};

// Listener para o botão "+"
document.addEventListener('click', function(e) {
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        window.handleManualAddAjudante();
    }
});

// Abre Modal de Diária
window.openAdicionarAjudanteModal = function(ajudanteObj, onAddCallback) {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
};

window.closeAdicionarAjudanteModal = function() {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// Confirmação no Modal (Botão ADD)
const btnConfirmAddAj = document.getElementById('modalAjudanteAddBtn');
if(btnConfirmAddAj) {
    btnConfirmAddAj.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (_pendingAjudanteToAdd) {
            _pendingAjudanteToAdd.onAddCallback({
                id: _pendingAjudanteToAdd.ajudanteObj.id,
                diaria: Number(val.toFixed(2))
            });
        }
        window.closeAdicionarAjudanteModal();
    });
}

// Renderiza a lista visual na tela de operação
window.renderAjudantesAdicionadosList = function() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    
    const arr = window._operacaoAjudantesTempList || [];
    
    if (arr.length === 0) {
        list.innerHTML = '<li style="color:#999; padding:10px; font-style:italic;">Nenhum ajudante escalado.</li>';
        return;
    }
    
    list.innerHTML = arr.map(a => {
        const aj = window.getFuncionario(a.id) || { nome: 'DESCONHECIDO' };
        const btnDel = window.IS_READ_ONLY ? '' : 
            `<button class="btn-mini btn-danger" type="button" onclick="removeAjudanteFromOperation('${a.id}')"><i class="fas fa-times"></i></button>`;
        
        return `<li>
            <span>${aj.nome} <small style="color:var(--success-color); font-weight:bold;">(R$ ${window.formatCurrency(a.diaria)})</small></span>
            ${btnDel}
        </li>`;
    }).join('');
};

window.removeAjudanteFromOperation = function(id) {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => String(a.id) !== String(id));
    window.renderAjudantesAdicionadosList();
};

// --- 4. PREENCHIMENTO DE MENUS (SELECTS) ---

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    
    const prev = sel.value;
    sel.innerHTML = `<option value="">${initialText}</option>`;
    
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
    
    if (prev && Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    }
}

// Função Global de Atualização dos Selects
window.populateAllSelects = function() {
    const funcionarios = loadData(DB_KEYS.FUNCIONARIOS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // Filtros por Função
    const motoristas = funcionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = funcionarios.filter(f => f.funcao === 'ajudante'); 

    // Operação
    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    // Outros
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR A UM VEÍCULO (OPCIONAL)...');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // Recibo (Mistura todos)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        funcionarios.forEach(f => {
            selRecibo.innerHTML += `<option value="func:${f.id}">${f.funcao.toUpperCase()} - ${f.nome}</option>`;
        });
    }
    
    // Atualiza Tabelas Visuais
    window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    window.renderCadastroTable(DB_KEYS.VEICULOS);
    window.renderCadastroTable(DB_KEYS.CONTRATANTES);
    window.renderAtividadesTable();
    window.renderMinhaEmpresaInfo();
    
    if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
};

window.renderMinhaEmpresaInfo = function() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = window.getMinhaEmpresa();
    
    // Preenche inputs
    const rz = document.getElementById('minhaEmpresaRazaoSocial');
    const cp = document.getElementById('minhaEmpresaCNPJ');
    const tl = document.getElementById('minhaEmpresaTelefone');
    
    if(rz && !rz.value) rz.value = emp.razaoSocial || '';
    if(cp && !cp.value) cp.value = emp.cnpj || '';
    if(tl && !tl.value) tl.value = emp.telefone || '';

    // Preenche visualização
    if (emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ:</strong> ${window.formatCPF_CNPJ(emp.cnpj)}</p>`;
    } else {
        div.innerHTML = `<p style="color:#999;">Sem dados cadastrados.</p>`;
    }
};

// --- 5. RENDERIZAÇÃO DAS TABELAS (GLOBAL) ---

window.renderCadastroTable = function(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    
    if (key === DB_KEYS.FUNCIONARIOS) tabela = document.getElementById('tabelaFuncionarios');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey = 'cnpj'; }

    if (!tabela) return;
    const tbody = tabela.querySelector('tbody');
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:#999;">NENHUM REGISTRO.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let c1, c2, c3;
        
        // Formatação específica
        if (key === DB_KEYS.FUNCIONARIOS) {
            c1 = item.nome;
            // Badge colorido para a função
            const cor = item.funcao === 'motorista' ? 'var(--primary-color)' : 'var(--secondary-color)';
            c2 = `<span class="status-pill" style="background:${cor};">${item.funcao}</span>`;
            c3 = item.email ? item.email.toLowerCase() : '<span style="color:red; font-size:0.8rem;">SEM ACESSO</span>';
        } else {
            c1 = item.id || item.placa || window.formatCPF_CNPJ(item.cnpj);
            c2 = item.nome || item.modelo || item.razaoSocial;
            c3 = item.documento || item.ano || window.formatPhoneBr(item.telefone) || '';
        }
        
        let itemId = item[idKey];
        // Strings devem ter aspas, números não
        let idParam = typeof itemId === 'string' ? `'${itemId}'` : itemId;

        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', ${idParam})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', ${idParam})"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', ${idParam})"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${c1}</td><td>${c2}</td>${c3!==undefined ? `<td>${c3}</td>` : ''}<td>${btns}</td></tr>`;
    }).join('');
};

window.renderAtividadesTable = function() {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tbody = document.querySelector('#tabelaAtividades tbody');
    if(!tbody) return;
    
    if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">SEM ATIVIDADES.</td></tr>`;
    else {
        tbody.innerHTML = data.map(i => `<tr><td>${i.id}</td><td>${i.nome}</td><td>${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`).join('');
    }
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 7.0
// PARTE 3: CRUD GLOBAL E FORMULÁRIOS INTELIGENTES
// =============================================================================

// --- 1. VISUALIZAR DETALHES (FUNÇÃO GLOBAL) ---

window.viewCadastro = function(key, id) {
    let item = null;
    let title = "DETALHES DO REGISTRO";
    let html = '<div style="line-height:1.8; font-size:0.95rem;">';

    // Conversão segura de ID para comparação (String vs Number)
    const safeId = String(id);

    // 1. FUNCIONÁRIOS
    if (key === DB_KEYS.FUNCIONARIOS) {
        item = window.getFuncionario(safeId);
        if (!item) return alert('Funcionário não encontrado.');
        
        title = `FICHA: ${item.nome}`;
        
        const loginStatus = item.uid 
            ? `<span style="color:green; font-weight:bold;">✅ CONTA VINCULADA</span>` 
            : `<span style="color:orange; font-weight:bold;">⏳ AGUARDANDO VÍNCULO</span>`;

        html += `
            <div style="background:#f0f4f8; padding:15px; border-radius:8px; margin-bottom:15px;">
                <p><strong>NOME:</strong> ${item.nome}</p>
                <p><strong>FUNÇÃO:</strong> <span style="background:${item.funcao==='motorista'?'#00796b':'#546e7a'}; color:white; padding:2px 8px; border-radius:4px;">${item.funcao}</span></p>
                <p><strong>LOGIN:</strong> ${item.email || 'NÃO DEFINIDO'}</p>
                <p><strong>STATUS:</strong> ${loginStatus}</p>
            </div>
            <p><strong>CPF/RG:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${window.formatPhoneBr(item.telefone || '')}</p>
            <p><strong>PIX:</strong> ${item.pix || ''}</p>
            <p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p>
        `;

        if (item.funcao === 'motorista') {
            const validadeFmt = item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : '-';
            html += `
                <hr style="margin:15px 0;">
                <h4 style="color:var(--secondary-color); margin-bottom:10px;"><i class="fas fa-id-card"></i> HABILITAÇÃO</h4>
                <p><strong>Nº CNH:</strong> ${item.cnh || '--'}</p>
                <p><strong>CATEGORIA:</strong> ${item.categoriaCNH || '-'}</p>
                <p><strong>VALIDADE:</strong> ${validadeFmt}</p>
                <p><strong>CURSOS:</strong> ${item.cursoDescricao || 'NENHUM'}</p>
            `;
        }
    } 
    // 2. VEÍCULOS
    else if (key === DB_KEYS.VEICULOS) {
        item = window.getVeiculo(safeId); // safeId aqui é a placa
        title = "DETALHES DO VEÍCULO";
        if(item) {
            html += `
                <h2 style="color:var(--primary-color); text-align:center; border:2px solid var(--primary-color); padding:5px; border-radius:6px;">${item.placa}</h2>
                <p><strong>MODELO:</strong> ${item.modelo}</p>
                <p><strong>ANO:</strong> ${item.ano || ''}</p>
                <p><strong>RENAVAM:</strong> ${item.renavam || ''}</p>
                <p><strong>CHASSI:</strong> ${item.chassi || ''}</p>
            `;
        }
    }
    // 3. CONTRATANTES
    else if (key === DB_KEYS.CONTRATANTES) {
        item = window.getContratante(safeId); // safeId aqui é o CNPJ
        title = "DETALHES DO CLIENTE";
        if(item) {
            html += `
                <p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p>
                <p><strong>CNPJ:</strong> ${window.formatCPF_CNPJ(item.cnpj)}</p>
                <p><strong>TELEFONE:</strong> ${window.formatPhoneBr(item.telefone || '')}</p>
            `;
        }
    }
    
    if (!item) return alert('ERRO: Registro não encontrado.');
    
    html += '</div>';
    window.openViewModal(title, html);
};

// --- 2. EDITAR ITEM (FUNÇÃO GLOBAL) ---

window.editCadastroItem = function(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const safeId = String(id);
    
    // 1. EDITAR FUNCIONÁRIO
    if (key === DB_KEYS.FUNCIONARIOS) {
        const f = window.getFuncionario(safeId);
        if (!f) return alert("Erro ao carregar funcionário.");
        
        document.getElementById('funcionarioId').value = f.id;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcDocumento').value = f.documento;
        document.getElementById('funcTelefone').value = f.telefone;
        document.getElementById('funcPix').value = f.pix;
        document.getElementById('funcEndereco').value = f.endereco;
        
        // E-mail (read-only na edição)
        const emailInput = document.getElementById('funcEmail');
        emailInput.value = f.email || '';
        emailInput.readOnly = !!f.email; // Trava se já tiver email
        
        // Campos de Motorista
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';
        
        window.toggleDriverFields(); // Ajusta visual
        document.querySelector('[data-tab="funcionarios"]').click();
    } 
    // 2. EDITAR VEÍCULO
    else if (key === DB_KEYS.VEICULOS) {
        const v = window.getVeiculo(safeId);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
        document.querySelector('[data-tab="veiculos"]').click();
    }
    // 3. EDITAR CONTRATANTE
    else if (key === DB_KEYS.CONTRATANTES) {
        const c = window.getContratante(safeId);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
        document.querySelector('[data-tab="contratantes"]').click();
    }
    // 4. EDITAR ATIVIDADE
    else if (key === DB_KEYS.ATIVIDADES) {
        const at = window.getAtividade(safeId);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    
    alert('Dados carregados no formulário acima.');
};

// --- 3. EXCLUIR ITEM (FUNÇÃO GLOBAL) ---

window.deleteItem = function(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('TEM CERTEZA? A exclusão é permanente.')) return;
    
    let arr = loadData(key).slice(); 
    let idKey = 'id'; 
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    // Filtro robusto (String vs String)
    const newArr = arr.filter(it => String(it[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        // Atualiza a tabela correta
        if(key === DB_KEYS.ATIVIDADES) window.renderAtividadesTable();
        else window.renderCadastroTable(key);
        
        // Se for operação ou despesa (tabelas operacionais)
        if(key === DB_KEYS.OPERACOES) window.renderOperacaoTable();
        if(key === DB_KEYS.DESPESAS_GERAIS) window.renderDespesasTable();

        window.populateAllSelects(); // Atualiza menus
        alert('Item excluído.');
    });
};

// =============================================================================
// 4. FORM HANDLERS (LISTENERS DE SUBMISSÃO)
// =============================================================================

function setupFormHandlers() {
    
    // --- CADASTRO DE FUNCIONÁRIO (INTEGRADO COM FIREBASE AUTH) ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = formFunc.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.innerText = "PROCESSANDO...";
            btn.disabled = true;

            try {
                let arr = loadData(DB_KEYS.FUNCIONARIOS).slice();
                const idHidden = document.getElementById('funcionarioId').value;
                const nome = document.getElementById('funcNome').value.toUpperCase();
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                // Validação de Email Único
                if (!idHidden && arr.some(f => f.email === email)) {
                    throw new Error("Este e-mail já está cadastrado.");
                }

                let newId = idHidden ? Number(idHidden) : Date.now();
                let novoUid = null;

                // CRIAÇÃO NO FIREBASE (Se tiver senha e dbRef)
                if (window.dbRef && email.includes('@') && !idHidden && senha) {
                    try {
                        const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                        
                        // Usa app secundário para não deslogar o admin
                        const auth2 = getAuth(secondaryApp);
                        const cred = await createUserWithEmailAndPassword(auth2, email, senha);
                        novoUid = cred.user.uid;

                        // Cria perfil público
                        await setDoc(doc(db, "users", novoUid), {
                            uid: novoUid,
                            name: nome,
                            email: email,
                            role: funcao,
                            company: window.CURRENT_USER.company,
                            approved: true,
                            createdAt: new Date().toISOString()
                        });

                        await signOut(auth2); // Limpa sessão secundária
                        console.log("Conta criada:", email);

                    } catch (fbError) {
                        console.error("Erro Firebase:", fbError);
                        if (fbError.code === 'auth/email-already-in-use') throw new Error("E-mail já existe no Firebase.");
                        if (fbError.code === 'auth/weak-password') throw new Error("Senha muito fraca (mín 6 dígitos).");
                        throw new Error("Erro ao criar login: " + fbError.message);
                    }
                }

                // OBJETO LOCAL
                const obj = {
                    id: newId,
                    uid: novoUid || (idHidden ? (arr.find(f => String(f.id) === String(newId))?.uid || '') : ''),
                    nome: nome,
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    // Dados Motorista
                    cnh: funcao === 'motorista' ? document.getElementById('funcCNH').value.toUpperCase() : '',
                    validadeCNH: funcao === 'motorista' ? document.getElementById('funcValidadeCNH').value : '',
                    categoriaCNH: funcao === 'motorista' ? document.getElementById('funcCategoriaCNH').value : '',
                    cursoDescricao: funcao === 'motorista' ? document.getElementById('funcCursoDescricao').value.toUpperCase() : ''
                };

                const idx = arr.findIndex(f => String(f.id) === String(newId));
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);

                await saveData(DB_KEYS.FUNCIONARIOS, arr);

                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                document.getElementById('funcEmail').readOnly = false;
                window.toggleDriverFields();
                window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
                window.populateAllSelects();

                if (novoUid) alert(`SUCESSO!\nFuncionário criado com acesso.\nEmail: ${email}\nSenha: ${senha}`);
                else alert("Funcionário salvo com sucesso.");

            } catch (err) {
                alert("ERRO: " + err.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- CADASTRO DE VEÍCULO ---
    const formVeic = document.getElementById('formVeiculo');
    if (formVeic) {
        formVeic.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const idHidden = document.getElementById('veiculoId').value;

            if (!idHidden && arr.some(v => v.placa === placa)) return alert("Placa já existe.");

            const obj = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };

            // Atualiza ou Adiciona (Lidando com mudança de chave Placa)
            if (idHidden && idHidden !== placa) arr = arr.filter(v => v.placa !== idHidden);
            
            const idx = arr.findIndex(v => v.placa === placa);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);

            saveData(DB_KEYS.VEICULOS, arr).then(() => {
                formVeic.reset();
                document.getElementById('veiculoId').value = '';
                window.renderCadastroTable(DB_KEYS.VEICULOS);
                window.populateAllSelects();
                alert('Veículo salvo.');
            });
        });
    }

    // --- CADASTRO DE CLIENTE ---
    const formCli = document.getElementById('formContratante');
    if (formCli) {
        formCli.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.CONTRATANTES).slice();
            const cnpj = document.getElementById('contratanteCNPJ').value;
            const obj = {
                cnpj: cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };
            const idx = arr.findIndex(c => c.cnpj === cnpj);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.CONTRATANTES, arr).then(() => {
                formCli.reset();
                document.getElementById('contratanteId').value = '';
                window.renderCadastroTable(DB_KEYS.CONTRATANTES);
                window.populateAllSelects();
                alert('Cliente salvo.');
            });
        });
    }

    // --- MINHA EMPRESA ---
    const formEmp = document.getElementById('formMinhaEmpresa');
    if (formEmp) {
        formEmp.addEventListener('submit', (e) => {
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj).then(() => {
                window.renderMinhaEmpresaInfo();
                alert('Dados da empresa atualizados.');
            });
        });
    }
}
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 7.0
// PARTE 4: OPERAÇÕES, CHECK-IN E LÓGICA FINANCEIRA
// =============================================================================

// --- 11. LANÇAMENTO DE OPERAÇÃO (ADMIN) ---

const formOperacao = document.getElementById('formOperacao');
if (formOperacao) {
    formOperacao.addEventListener('submit', (e) => {
        e.preventDefault(); 
        
        const motId = document.getElementById('selectMotoristaOperacao').value;
        const veicPlaca = document.getElementById('selectVeiculoOperacao').value;
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        if (!motId || !veicPlaca) return alert("Selecione Motorista e Veículo.");
        
        // Verifica CNH antes de salvar (Segurança)
        window.verificarValidadeCNH(motId);
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        
        // Recupera objeto original se for edição (para não perder check-ins já feitos)
        const originalOp = isEdit ? arr.find(o => String(o.id) === String(idHidden)) : null;

        // Define status inicial
        let statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se estava em andamento e foi editada, mantém em andamento (exceto se forçado)
        if (isEdit && originalOp && originalOp.status === 'EM_ANDAMENTO') {
            statusFinal = 'EM_ANDAMENTO';
        }

        const obj = {
            id: isEdit ? Number(idHidden) : Date.now(),
            status: statusFinal,
            
            data: document.getElementById('operacaoData').value,
            motoristaId: Number(motId),
            veiculoPlaca: veicPlaca,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
            
            // Dados Financeiros
            faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
            comissao: Number(document.getElementById('operacaoComissao').value) || 0,
            despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
            
            // Abastecimento (Registro de Caixa)
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            
            // Dados de Rodagem
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Equipe: Usa a lista temporária se foi mexida, senão mantém a original
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva dados críticos de check-in que não estão no formulário
            checkins: originalOp ? originalOp.checkins : { motorista: false, ajudantes: [], ajudantesLog: {} },
            kmInicial: originalOp ? originalOp.kmInicial : 0,
            kmFinal: originalOp ? originalOp.kmFinal : 0,
            dataHoraInicio: originalOp ? originalOp.dataHoraInicio : null
        };
        
        // Salva (Atualiza ou Adiciona)
        if (isEdit) {
            const idx = arr.findIndex(o => String(o.id) === String(obj.id));
            if (idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            // Limpeza
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            // Atualizações de UI
            window.renderOperacaoTable();
            if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
            
            // Atualiza Dashboard se existir
            if(typeof window.updateDashboardStats === 'function') window.updateDashboardStats();

            alert(isAgendamento ? 'VIAGEM AGENDADA E ENVIADA AO MOTORISTA.' : 'OPERAÇÃO SALVA E CONFIRMADA.');
        });
    });
    
    // Reset limpa IDs
    formOperacao.addEventListener('reset', () => {
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
    });
}

// --- 12. CHECK-IN DO MOTORISTA/AJUDANTE (LÓGICA REAL) ---

const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    formCheckin.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!window.CURRENT_USER) return alert("Sessão expirada. Faça login novamente.");

        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value; // 'start', 'end' ou 'presence'
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => Number(o.id) === opId);
        
        if (idx >= 0) {
            const op = arr[idx];
            
            // Garante estrutura de objetos para evitar erro
            if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
            if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};

            const isMotorista = window.CURRENT_USER.role === 'motorista';
            let confirmouAlguem = false;
            const agora = new Date().toISOString(); // Timestamp ISO

            // --- FLUXO DO MOTORISTA ---
            if (isMotorista) {
                // Validação: Sou eu o motorista desta operação?
                const motProfile = window.getMotorista(op.motoristaId);
                const souEu = motProfile && (
                    motProfile.uid === window.CURRENT_USER.uid || 
                    (motProfile.email && motProfile.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
                );

                if (souEu) {
                    if (step === 'start') {
                        // INÍCIO DA VIAGEM
                        const kmIni = Number(document.getElementById('checkinKmInicial').value);
                        const ultimoKm = window.obterUltimoKmFinal(op.veiculoPlaca); // Validação de segurança
                        
                        if(!kmIni || kmIni <= 0) return alert("Informe um KM Inicial válido.");
                        
                        if (kmIni < ultimoKm) {
                            return alert(`ERRO DE HODÔMETRO:\nO KM informado (${kmIni}) é menor que o último registrado (${ultimoKm}).\nVerifique o painel.`);
                        }
                        
                        op.kmInicial = kmIni;
                        op.status = 'EM_ANDAMENTO';
                        op.checkins.motorista = true;
                        op.dataHoraInicio = agora; 
                        confirmouAlguem = true;
                        
                        alert("VIAGEM INICIADA! BOM TRABALHO.");
                    } 
                    else if (step === 'end') {
                        // FIM DA VIAGEM
                        const kmFim = Number(document.getElementById('checkinKmFinal').value);
                        
                        if(!kmFim || kmFim <= op.kmInicial) return alert("O KM Final deve ser maior que o Inicial.");
                        
                        op.kmFinal = kmFim;
                        op.kmRodado = kmFim - (op.kmInicial || 0);
                        
                        // Captura abastecimento feito na estrada
                        op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                        op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                        
                        op.status = 'CONFIRMADA'; 
                        confirmouAlguem = true;
                        
                        alert(`VIAGEM FINALIZADA!\nDistância: ${op.kmRodado} KM`);
                    }
                } else {
                    return alert("ERRO: Você não é o motorista escalado para esta viagem.");
                }
            } 
            // --- FLUXO DO AJUDANTE ---
            else {
                // Identifica ajudante logado na tabela unificada
                const ajProfile = loadData(DB_KEYS.FUNCIONARIOS).find(a => 
                    a.funcao === 'ajudante' && 
                    (a.uid === window.CURRENT_USER.uid || (a.email && a.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()))
                );
                
                if (ajProfile) {
                    // Verifica se está na lista da operação
                    const escalado = (op.ajudantes || []).some(a => Number(a.id) === Number(ajProfile.id));
                    
                    if (escalado) {
                        // Marca presença
                        if (!op.checkins.ajudantes.includes(ajProfile.id)) {
                            op.checkins.ajudantes.push(ajProfile.id);
                            op.checkins.ajudantesLog[ajProfile.id] = agora;
                        }
                        confirmouAlguem = true;
                        alert("PRESENÇA CONFIRMADA!");
                    } else {
                        return alert("ERRO: Você não está escalado nesta operação.");
                    }
                }
            }

            if (confirmouAlguem) {
                saveData(DB_KEYS.OPERACOES, arr).then(() => {
                    window.closeCheckinConfirmModal();
                    if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable(); 
                });
            }
        }
    });
}

// --- 13. LANÇAMENTO DE DESPESAS (COM PARCELAMENTO) ---

const formDespesa = document.getElementById('formDespesaGeral');
if (formDespesa) {
    formDespesa.addEventListener('submit', (e) => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
        const idHidden = document.getElementById('despesaGeralId').value;
        
        if (idHidden) {
            // Edição simples
            const idx = arr.findIndex(d => String(d.id) === String(idHidden));
            if (idx >= 0) {
                 arr[idx].data = document.getElementById('despesaGeralData').value;
                 arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                 arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                 arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
            }
        } else {
            // Nova Despesa (Parcelamento Automático)
            const dataStr = document.getElementById('despesaGeralData').value;
            const placa = document.getElementById('selectVeiculoDespesaGeral').value || null;
            const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
            const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
            const modo = document.getElementById('despesaModoPagamento').value;
            const forma = document.getElementById('despesaFormaPagamento').value; 
            
            let parcelas = 1;
            let intervalo = 30;
            let pagas = 0;
            
            if (modo === 'parcelado') {
                parcelas = parseInt(document.getElementById('despesaParcelas').value) || 2; 
                intervalo = parseInt(document.getElementById('despesaIntervaloDias').value) || 30;
                pagas = parseInt(document.getElementById('despesaParcelasPagas').value) || 0;
            }
            
            const valorParc = valorTotal / parcelas;
            const parts = dataStr.split('-');
            const dataBase = new Date(parts[0], parts[1]-1, parts[2]); // Data sem fuso UTC
            
            for (let i = 0; i < parcelas; i++) {
                const newId = Date.now() + i; 
                const dt = new Date(dataBase);
                dt.setDate(dt.getDate() + (i * intervalo));
                
                const dataIso = dt.toISOString().split('T')[0];
                const descFinal = parcelas > 1 ? `${desc} (${i+1}/${parcelas})` : desc;
                const isPaid = i < pagas;
                
                arr.push({ 
                    id: newId, 
                    data: dataIso, 
                    veiculoPlaca: placa, 
                    descricao: descFinal, 
                    valor: Number(valorParc.toFixed(2)), 
                    modoPagamento: modo, 
                    formaPagamento: forma, 
                    pago: isPaid 
                });
            }
        }
        
        saveData(DB_KEYS.DESPESAS_GERAIS, arr).then(() => {
            formDespesa.reset();
            document.getElementById('despesaGeralId').value = '';
            window.toggleDespesaParcelas(); 
            window.renderDespesasTable();
            alert('DESPESA(S) SALVA(S).');
        });
    });

    formDespesa.addEventListener('reset', () => {
        document.getElementById('despesaGeralId').value = '';
        setTimeout(window.toggleDespesaParcelas, 50);
    });
}

// Global para chamada no HTML
window.toggleDespesaParcelas = function() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const div = document.getElementById('divDespesaParcelas');
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
        if (modo === 'avista') document.getElementById('despesaParcelas').value = 1;
    }
};

// =============================================================================
// RENDERIZAÇÃO DAS TABELAS OPERACIONAIS (ADMIN)
// =============================================================================

window.renderOperacaoTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    
    // Otimização: Apenas os 50 mais recentes
    const viewOps = ops.slice(0, 50);

    if (!viewOps.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">NENHUMA OPERAÇÃO REGISTRADA.</td></tr>';
        return;
    }
    
    tbody.innerHTML = viewOps.map(op => {
        const mot = window.getMotorista(op.motoristaId)?.nome || 'DESCONHECIDO';
        const dataFmt = op.data.split('-').reverse().join('/');
        
        let badge = '';
        if (op.status === 'AGENDADA') badge = '<span class="status-pill pill-blocked" style="background:orange;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') badge = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';
        else badge = '<span class="status-pill pill-active">CONFIRMADA</span>';

        let btns = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails(${op.id})" title="Detalhes"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        return `<tr>
            <td>${dataFmt}</td>
            <td>${mot}</td>
            <td>${badge}</td>
            <td>${window.formatCurrency(op.faturamento)}</td>
            <td>${btns}</td>
        </tr>`;
    }).join('');
};

window.renderDespesasTable = function() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;

    const viewDs = ds.slice(0, 50);
    
    if (!viewDs.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA DESPESA.</td></tr>';
        return;
    }

    tbody.innerHTML = viewDs.map(d => {
        const dataFmt = d.data.split('-').reverse().join('/');
        const statusHtml = d.pago ? '<span style="color:green;font-weight:bold;">PAGO</span>' : '<span style="color:red;font-weight:bold;">PENDENTE</span>';
        
        let btns = '';
        if (!window.IS_READ_ONLY) {
            const icon = d.pago ? 'fa-times' : 'fa-check';
            const cls = d.pago ? 'btn-warning' : 'btn-success';
            btns = `
                <button class="btn-mini ${cls}" onclick="toggleStatusDespesa(${d.id})" title="Alterar Status"><i class="fas ${icon}"></i></button>
                <button class="btn-mini edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>
            `;
        }
        return `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${window.formatCurrency(d.valor)}</td><td>${statusHtml}</td><td>${btns}</td></tr>`;
    }).join('');
};

window.toggleStatusDespesa = function(id) {
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = !arr[idx].pago;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr).then(window.renderDespesasTable);
    }
};

window.editDespesaItem = function(id) {
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).find(x => x.id === id);
    if (!d) return;
    
    document.getElementById('despesaGeralId').value = d.id;
    document.getElementById('despesaGeralData').value = d.data;
    document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoPlaca || '';
    document.getElementById('despesaGeralDescricao').value = d.descricao;
    document.getElementById('despesaGeralValor').value = d.valor;
    
    document.querySelector('[data-page="despesas"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert("Dados da despesa carregados para edição.");
};

// --- VISUALIZAR DETALHES FINANCEIROS DA OPERAÇÃO (CÁLCULO REAL) ---

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('Operação não encontrada.');

    const mot = window.getMotorista(op.motoristaId)?.nome || 'N/A';
    const cli = window.getContratante(op.contratanteCNPJ)?.razaoSocial || 'N/A';
    const isOk = op.status === 'CONFIRMADA';

    // 1. Custo Ajudantes (Soma diárias)
    const custoAjudantes = (op.ajudantes || []).reduce((acc, a) => {
        // Se confirmada, soma só quem foi. Se não, soma todos (previsão)
        const check = op.checkins?.ajudantes || [];
        if (!isOk || check.includes(a.id)) {
            return acc + (Number(a.diaria)||0);
        }
        return acc;
    }, 0);

    // 2. Custo Diesel (MÉDIA GLOBAL) - Correção Financeira
    const custoDieselCalculado = window.calcularCustoConsumoViagem(op);
    
    // 3. Outros Custos
    const outrosCustos = (op.comissao || 0) + (op.despesas || 0);
    
    // 4. Totais
    const custoTotalOperacao = custoAjudantes + custoDieselCalculado + outrosCustos;
    const lucro = (op.faturamento || 0) - custoTotalOperacao;
    const saldoReceber = (op.faturamento || 0) - (op.adiantamento || 0);

    // Lista de Ajudantes para exibição
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const nome = window.getFuncionario(a.id)?.nome || 'ID '+a.id;
        const presenca = (isOk && op.checkins?.ajudantes?.includes(a.id)) ? ' <span style="color:green">(Presente)</span>' : '';
        return `<li>${nome} - R$ ${window.formatCurrency(a.diaria)} ${presenca}</li>`;
    }).join('') || '<li>Sem ajudantes escalados</li>';

    // Monta HTML
    const html = `
        <div style="font-size:0.95rem;">
            <p><strong>MOTORISTA:</strong> ${mot}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CLIENTE:</strong> ${cli}</p>
            <p><strong>STATUS:</strong> ${op.status}</p>
            <hr style="margin:15px 0; border-color:#eee;">
            
            <div style="background:#e8f5e9; padding:15px; border-radius:6px; margin-bottom:15px; text-align:center;">
                <h3 style="margin:0; color:var(--success-color); font-size:1.5rem;">LUCRO LÍQUIDO: ${window.formatCurrency(lucro)}</h3>
                <small style="color:#666;">(Baseado no consumo médio histórico do veículo)</small>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div>
                    <strong>RECEITA:</strong><br>
                    Faturamento: ${window.formatCurrency(op.faturamento)}<br>
                    Adiantamento: ${window.formatCurrency(op.adiantamento)}
                </div>
                <div>
                    <strong>A RECEBER:</strong><br>
                    <span style="font-size:1.1rem; color:var(--primary-color); font-weight:bold;">${window.formatCurrency(saldoReceber)}</span>
                </div>
            </div>
            
            <h4 style="color:var(--danger-color); border-bottom:1px solid #eee; padding-bottom:5px;">CUSTOS OPERACIONAIS</h4>
            <ul style="list-style:none; padding-left:0; font-size:0.9rem; line-height:1.6;">
                <li>⛽ <strong>Diesel (Consumo Calculado):</strong> ${window.formatCurrency(custoDieselCalculado)}</li>
                <li>💰 <strong>Comissão Motorista:</strong> ${window.formatCurrency(op.comissao)}</li>
                <li>🚧 <strong>Pedágios/Despesas:</strong> ${window.formatCurrency(op.despesas)}</li>
                <li>👷 <strong>Equipe (Diárias):</strong> ${window.formatCurrency(custoAjudantes)}</li>
            </ul>
            
            <div style="font-size:0.8rem; color:#777; margin-top:15px; background:#f9f9f9; padding:10px; border-radius:4px;">
                <strong>Nota:</strong> O custo de diesel é uma estimativa baseada na média histórica (${window.calcularMediaHistoricaVeiculo(op.veiculoPlaca).toFixed(2)} Km/L). O valor abastecido no caixa (${window.formatCurrency(op.combustivel)}) é contabilizado separadamente no fluxo de caixa.
            </div>

            <h4 style="margin-top:20px; border-bottom:1px solid #eee; padding-bottom:5px;">EQUIPE ESCALADA</h4>
            <ul style="padding-left:20px; margin-top:5px;">${ajudantesHtml}</ul>
        </div>
    `;
    
    window.openOperationDetails(`DETALHES DA OPERAÇÃO #${id}`, html);
};

// Edição de Operação
window.editOperacaoItem = function(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId || "";
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca || "";
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ || "";
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || "";
    
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // Restaura lista de ajudantes visualmente
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    window.renderAjudantesAdicionadosList();
    
    alert("Dados carregados para edição.");
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 7.0
// PARTE 5: CALENDÁRIO, PAINÉIS E INICIALIZAÇÃO
// =============================================================================

// --- 14. LÓGICA DO CALENDÁRIO (VISUAL) ---

window.changeMonth = function(step) {
    window.currentDate.setMonth(window.currentDate.getMonth() + step);
    window.renderCalendar();
    // Se houver dashboard, atualiza também
    if(typeof window.updateDashboardStats === 'function') window.updateDashboardStats();
};

window.renderCalendar = function() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    
    if (!grid || !title) return;

    grid.innerHTML = ''; // Limpa

    const year = window.currentDate.getFullYear();
    const month = window.currentDate.getMonth();
    
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    title.textContent = `${monthNames[month]} ${year}`;

    // Cabeçalho Dias
    const weekDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
    weekDays.forEach(day => {
        const div = document.createElement('div');
        div.className = 'day-label';
        div.textContent = day;
        grid.appendChild(div);
    });

    // Lógica de Dias
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    // Espaços vazios
    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        div.style.backgroundColor = '#f9f9f9';
        grid.appendChild(div);
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    // Preenche dias
    for (let day = 1; day <= lastDay; day++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.textContent = day;
        
        // Formata data ISO para comparar (YYYY-MM-DD)
        const currentIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Filtra operações do dia
        const opsDoDia = ops.filter(o => o.data === currentIso);
        
        if (opsDoDia.length > 0) {
            div.classList.add('has-operation');
            div.title = `${opsDoDia.length} Viagens`;
            
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            div.appendChild(dot);
        }

        grid.appendChild(div);
    }
};

// --- 15. VISUALIZAÇÃO DE CHECK-INS (PAINEL ADMIN E MOBILE) ---

// Abre o modal de confirmação de check-in (Prepara os dados)
window.openCheckinConfirmModal = function(opId) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === opId);
    if (!op) return alert("Erro: Operação não encontrada.");

    // Define qual passo é (Iniciar, Finalizar ou Presença)
    let step = '';
    const me = window.CURRENT_USER;
    
    // Identifica usuário na tabela unificada
    const userProfile = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
        u.uid === me.uid || (u.email && u.email === me.email)
    );

    if (!userProfile) return alert("Perfil não vinculado.");

    if (userProfile.funcao === 'motorista') {
        step = op.status === 'AGENDADA' ? 'start' : 'end';
    } else {
        step = 'presence';
    }

    document.getElementById('checkinOpId').value = op.id;
    document.getElementById('checkinStep').value = step;
    
    // Dados visuais
    const dataFmt = op.data.split('-').reverse().join('/');
    const cli = window.getContratante(op.contratanteCNPJ)?.razaoSocial || '...';
    document.getElementById('checkinDisplayData').textContent = dataFmt;
    document.getElementById('checkinDisplayContratante').textContent = cli;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    
    document.getElementById('checkinModalTitle').textContent = 
        step === 'start' ? "INICIAR VIAGEM" : (step === 'end' ? "FINALIZAR VIAGEM" : "CONFIRMAR PRESENÇA");

    // Configura campos do motorista
    const divDriver = document.getElementById('checkinDriverFields');
    if (userProfile.funcao === 'motorista') {
        divDriver.style.display = 'block';
        
        if (step === 'start') {
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
            // Sugere KM (último + 1)
            const ultimo = window.obterUltimoKmFinal(op.veiculoPlaca);
            document.getElementById('checkinKmInicial').value = ultimo > 0 ? ultimo : '';
        } else {
            document.getElementById('divKmInicial').style.display = 'none';
            document.getElementById('divKmFinal').style.display = 'block';
            document.getElementById('checkinKmInicialReadonly').value = op.kmInicial;
        }
    } else {
        divDriver.style.display = 'none'; // Ajudante não vê campos de KM
    }

    document.getElementById('modalCheckinConfirm').style.display = 'block';
};

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
};

// Renderiza Tabela (Admin) e Lista (Mobile)
window.renderCheckinsTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. VISÃO ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) {
        const tbody = tabelaAdmin.querySelector('tbody');
        
        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">NENHUMA ROTA ATIVA.</td></tr>';
        } else {
            tbody.innerHTML = pendentes.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const motNome = window.getMotorista(op.motoristaId)?.nome || '...';
                
                let statusLabel = op.status === 'AGENDADA' 
                    ? '<span class="status-pill pill-blocked" style="background:orange;">AGUARDANDO</span>' 
                    : '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';

                // Status Motorista
                const checkins = op.checkins || {};
                const iconMot = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Iniciou"></i>` 
                    : `<i class="far fa-clock" style="color:orange;" title="Pendente"></i>`;
                
                // Status Ajudantes
                const totalAj = (op.ajudantes || []).length;
                const confirmAj = (op.ajudantes || []).filter(a => checkins.ajudantes && checkins.ajudantes.includes(a.id)).length;
                const badgeAj = totalAj > 0 ? `(${confirmAj}/${totalAj})` : '-';

                let btnAcao = op.status === 'AGENDADA' 
                    ? `<button class="btn-mini btn-primary" onclick="iniciarRotaManual(${op.id})"><i class="fas fa-play"></i></button>` 
                    : `<span style="font-size:0.8rem; color:green; font-weight:bold;">INICIADA</span>`;

                return `<tr>
                    <td>${dataFmt}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${iconMot} ${motNome}</td>
                    <td>${badgeAj}</td>
                    <td>${statusLabel}</td>
                    <td>
                        ${btnAcao}
                        <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }
        
        // Badge do Menu
        const badge = document.getElementById('badgeCheckins');
        if(badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. VISÃO FUNCIONÁRIO (MOBILE)
    const listaMobile = document.getElementById('listaServicosAgendados');
    if (window.CURRENT_USER && (window.CURRENT_USER.role !== 'admin') && listaMobile) {
        
        const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => u.uid === window.CURRENT_USER.uid || (u.email && u.email === window.CURRENT_USER.email));
        if (!me) return listaMobile.innerHTML = '<p style="text-align:center; color:red;">PERFIL NÃO VINCULADO.</p>';

        const myOps = pendentes.filter(op => {
            if (me.funcao === 'motorista') return Number(op.motoristaId) === Number(me.id);
            return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
        });

        if (myOps.length === 0) {
            listaMobile.innerHTML = '<p style="text-align:center; color:#999; margin-top:30px;"><i class="fas fa-bed" style="font-size:2rem; display:block;"></i>NENHUMA VIAGEM AGENDADA.</p>';
        } else {
            listaMobile.innerHTML = myOps.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const cli = window.getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
                
                let btnHtml = '';
                if (me.funcao === 'motorista') {
                    btnHtml = op.status === 'AGENDADA' 
                        ? `<button class="btn-primary" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">INICIAR VIAGEM</button>`
                        : `<button class="btn-danger" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">FINALIZAR VIAGEM</button>`;
                } else {
                    const jaFoi = op.checkins?.ajudantes?.includes(me.id);
                    btnHtml = jaFoi 
                        ? `<button class="btn-success" disabled style="width:100%; padding:15px;">PRESENÇA CONFIRMADA</button>`
                        : `<button class="btn-primary" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">MARCAR PRESENÇA</button>`;
                }

                return `<div class="card" style="border-left:5px solid var(--primary-color); margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between;">
                        <h3 style="margin-bottom:5px;">${dataFmt}</h3>
                        <span class="status-pill" style="background:${op.status==='AGENDADA'?'orange':'#0288d1'}; height:fit-content;">${op.status}</span>
                    </div>
                    <p style="font-size:1.1rem; font-weight:bold;">${op.veiculoPlaca}</p>
                    <p style="color:#555;">${cli}</p>
                    <div style="margin-top:15px;">${btnHtml}</div>
                </div>`;
            }).join('');
        }
    }
};

window.iniciarRotaManual = function(id) {
    if(!confirm("Forçar início da rota? (O motorista ainda não iniciou)")) return;
    let arr = loadData(DB_KEYS.OPERACOES);
    const idx = arr.findIndex(o => o.id === id);
    if(idx >= 0) {
        arr[idx].status = 'EM_ANDAMENTO';
        if(!arr[idx].dataHoraInicio) arr[idx].dataHoraInicio = new Date().toISOString();
        saveData(DB_KEYS.OPERACOES, arr).then(() => { 
            window.renderCheckinsTable(); 
            window.renderOperacaoTable(); 
        });
    }
};

// --- 16. HISTÓRICO E PERFIL (FUNCIONÁRIO) ---

window.filtrarHistoricoFuncionario = function() {
    if (!window.CURRENT_USER) return;
    const dIni = document.getElementById('empDataInicio').value;
    const dFim = document.getElementById('empDataFim').value;
    
    if (!dIni || !dFim) return alert("Selecione as datas.");
    
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
    if (!me) return alert("Perfil não encontrado.");

    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        if (op.status !== 'CONFIRMADA' || op.data < dIni || op.data > dFim) return false;
        if (me.funcao === 'motorista') return Number(op.motoristaId) === Number(me.id);
        return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    let total = 0;
    
    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO.</td></tr>';
    } else {
        tbody.innerHTML = ops.map(op => {
            let val = 0;
            if (me.funcao === 'motorista') val = op.comissao || 0;
            else {
                if (op.checkins?.ajudantes?.includes(me.id)) {
                    val = Number(op.ajudantes.find(a => Number(a.id) === Number(me.id))?.diaria) || 0;
                }
            }
            total += val;
            const dataFmt = op.data.split('-').reverse().join('/');
            const cli = window.getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
            
            return `<tr>
                <td>${dataFmt}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${cli}</td>
                <td style="color:green; font-weight:bold;">${window.formatCurrency(val)}</td>
                <td><span class="status-pill pill-active">OK</span></td>
            </tr>`;
        }).join('');
    }
    
    document.getElementById('empTotalReceber').textContent = window.formatCurrency(total);
};

window.renderEmployeeProfileView = function() {
    const div = document.getElementById('employeeProfileView');
    if (!div || !window.CURRENT_USER) return;
    
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
    if (!me) {
        div.innerHTML = '<p>Perfil não carregado.</p>';
        return;
    }
    
    div.innerHTML = `
        <div class="profile-view-container">
            <div class="profile-header">
                <div class="profile-avatar-placeholder">${me.nome.charAt(0)}</div>
                <div class="profile-info-main">
                    <h2>${me.nome}</h2>
                    <p>${me.funcao}</p>
                </div>
            </div>
            <div class="profile-data-grid">
                <div class="data-item"><label>EMAIL</label><span>${me.email}</span></div>
                <div class="data-item"><label>TELEFONE</label><span>${window.formatPhoneBr(me.telefone)}</span></div>
                <div class="data-item"><label>PIX</label><span>${me.pix || '-'}</span></div>
                <div class="data-item"><label>DOCUMENTO</label><span>${me.documento}</span></div>
            </div>
        </div>
    `;
};

// =============================================================================
// SUPER ADMIN
// =============================================================================

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, setDoc, doc, secondaryApp, getAuth, createUserWithEmailAndPassword, signOut } = window.dbRef;

    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        window.renderGlobalHierarchy(users);
    });

    const fCreate = document.getElementById('formCreateCompany');
    if (fCreate) {
        fCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
            const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
            const password = document.getElementById('newAdminPassword').value;

            try {
                const auth2 = getAuth(secondaryApp);
                const uc = await createUserWithEmailAndPassword(auth2, email, password);
                await setDoc(doc(db, "users", uc.user.uid), {
                    uid: uc.user.uid, name: "ADMIN " + domain.toUpperCase(), email, role: "admin", company: domain, approved: true, createdAt: new Date().toISOString()
                });
                await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } });
                await signOut(auth2);
                alert("Empresa criada com sucesso!");
                fCreate.reset();
            } catch (err) { alert("Erro: " + err.message); }
        });
    }
}

window.renderGlobalHierarchy = function(users) {
    const container = document.getElementById('superAdminContainer');
    if (!container) return;
    const groups = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return;
        const d = u.company || 'SEM_EMPRESA';
        if(!groups[d]) groups[d] = [];
        groups[d].push(u);
    });
    
    container.innerHTML = Object.keys(groups).sort().map(dom => {
        return `<div class="domain-block"><div class="domain-header"><strong>${dom.toUpperCase()}</strong> (${groups[dom].length})</div><div class="domain-content" style="display:block; padding:10px;">${groups[dom].map(u => `<div class="user-row"><span>${u.name} (${u.role})</span><small>${u.email}</small></div>`).join('')}</div></div>`;
    }).join('');
};

// =============================================================================
// INICIALIZAÇÃO E ROTEAMENTO
// =============================================================================

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // Reset menus
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // Roteamento
    if (window.CURRENT_USER.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } 
    else if (window.CURRENT_USER.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        
        setupRealtimeListeners();
        window.populateAllSelects();
        window.renderOperacaoTable();
        window.renderDespesasTable();
        window.renderCheckinsTable();
        
        // Renderiza o calendário inicial
        setTimeout(window.renderCalendar, 300);
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
        window.renderCheckinsTable();
        window.renderEmployeeProfileView();
    }
}

function setupRealtimeListeners() {
    if (!window.dbRef || !window.CURRENT_USER.company) return setTimeout(setupRealtimeListeners, 500);
    const { db, doc, onSnapshot } = window.dbRef;
    
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', window.CURRENT_USER.company, 'data', key), (docSnap) => {
            if (docSnap.exists()) APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            else APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            
            // Reatividade
            if (key === DB_KEYS.FUNCIONARIOS) window.populateAllSelects();
            if (key === DB_KEYS.OPERACOES) { 
                window.renderOperacaoTable(); 
                window.renderCheckinsTable(); 
                window.renderCalendar(); // Atualiza calendário se mudar operações
            }
        });
    });
}

window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    updateUI();
};

document.addEventListener('DOMContentLoaded', () => {
    // Menu Mobile
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
            
            if(pageId === 'home') window.renderCalendar();
        });
    });
    
    // Abas
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    if (typeof setupFormHandlers === 'function') setupFormHandlers();
});