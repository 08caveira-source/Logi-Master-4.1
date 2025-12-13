// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0 (CORREÇÃO FINAL E FUNCIONALIDADES NOVAS)
// PARTE 1: INFRAESTRUTURA, VARIÁVEIS GLOBAIS E CÁLCULOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE BANCO DE DADOS (CHAVES)
 */
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

/**
 * 2. CACHE GLOBAL (ESTADO DA APLICAÇÃO)
 */
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

// Variáveis de Controle de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// Inicialização da Data para o Calendário
window.currentDate = new Date(); 

// =============================================================================
// I/O: SISTEMA DE ARMAZENAMENTO (FIREBASE E LOCAL)
// =============================================================================

/**
 * Carrega dados do Cache.
 */
function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    return APP_CACHE[key] || [];
}

/**
 * Salva dados no Cache e no Banco de Dados.
 */
async function saveData(key, value) {
    // Bloqueio de segurança para funcionários (apenas leitura em dados críticos)
    if (window.IS_READ_ONLY && 
        key !== DB_KEYS.OPERACOES && 
        key !== DB_KEYS.PROFILE_REQUESTS) {
        return;
    }

    // 1. Atualiza Cache Local (Performance Instantânea)
    APP_CACHE[key] = value;

    // 2. Persistência no Firebase (Se Online)
    if (window.dbRef && window.CURRENT_USER) {
        // Super Admin não grava na raiz
        if (window.CURRENT_USER.email === 'admin@logimaster.com') return;

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            } catch (e) {
                console.error(`Erro ao salvar ${key}:`, e);
            }
        }
    } else {
        // Fallback LocalStorage (Offline)
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES (MÁSCARAS E MOEDA)
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata para Real (R$ 1.000,00)
window.formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Formata CPF ou CNPJ
window.formatCPF_CNPJ = (value) => {
    const d = onlyDigits(value);
    if (d.length <= 11) {
        return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    } else {
        return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
    }
};

// Formata Telefone
window.formatPhoneBr = (value) => {
    const d = onlyDigits(value);
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
};

// =============================================================================
// GETTERS (BUSCA UNIFICADA DE DADOS)
// =============================================================================

// Retorna Funcionário pelo ID (String segura)
window.getFuncionario = (id) => {
    return loadData(DB_KEYS.FUNCIONARIOS).find(f => String(f.id) === String(id));
};

window.getMotorista = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'motorista') ? f : null;
};

window.getAjudante = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'ajudante') ? f : null;
};

window.getVeiculo = (placa) => {
    return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
};

window.getContratante = (cnpj) => {
    return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
};

window.getAtividade = (id) => {
    return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
};

window.getMinhaEmpresa = () => {
    return loadData(DB_KEYS.MINHA_EMPRESA);
};

// =============================================================================
// LÓGICA MATEMÁTICA DE FROTA (CONSUMO E MÉDIAS)
// =============================================================================

/**
 * Retorna o último KM Final registrado para um veículo.
 * Útil para validar o KM Inicial de uma nova viagem.
 */
window.obterUltimoKmFinal = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    const opsVeiculo = ops.filter(op => op.veiculoPlaca === placa && Number(op.kmFinal) > 0);
    
    if (opsVeiculo.length === 0) return 0;
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * Calcula a média histórica de consumo (KM/L) do veículo.
 * Soma todo KM rodado e divide por todo Litro abastecido no histórico.
 */
window.calcularMediaHistoricaVeiculo = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    const opsValidas = ops.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKm = 0;
    let totalLitros = 0;

    opsValidas.forEach(op => {
        if(Number(op.kmRodado) > 0) totalKm += Number(op.kmRodado);
        
        const litros = (Number(op.combustivel) || 0) / (Number(op.precoLitro) || 1);
        if (litros > 0) totalLitros += litros;
    });

    if (totalLitros <= 0) return 0;
    return totalKm / totalLitros; 
};

/**
 * Retorna o preço do diesel mais recente pago pelo veículo.
 */
window.obterUltimoPrecoCombustivel = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    const opsComPreco = ops.filter(op => op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    
    if (opsComPreco.length === 0) return 0;
    // Ordena por data (mais recente primeiro)
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(opsComPreco[0].precoLitro);
};

/**
 * Calcula o custo estimado de diesel para uma viagem específica.
 * Usa a Média Histórica x Preço Atual x KM Rodado.
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || !op.veiculoPlaca || op.status !== 'CONFIRMADA') return 0;
    
    const media = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const km = Number(op.kmRodado) || 0;
    
    if (media <= 0 || km <= 0) return 0;

    let preco = Number(op.precoLitro) || 0;
    if (preco <= 0) preco = window.obterUltimoPrecoCombustivel(op.veiculoPlaca);
    
    if (preco <= 0) return 0;

    // Fórmula: (KM / Média) * Preço
    return (km / media) * preco;
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0
// PARTE 2: INTERFACE DE USUÁRIO (UI), MODAIS E MENUS (SELECTS)
// =============================================================================

// --- 1. VALIDAÇÕES VISUAIS E COMPORTAMENTO DE FORMULÁRIO ---

/**
 * Verifica se a CNH do motorista está vencida e emite um alerta.
 */
window.verificarValidadeCNH = (motoristaId) => {
    const m = window.getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    
    // Zera horas para comparação de datas pura
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

/**
 * Controla a visibilidade dos campos específicos de motorista (CNH, Categoria).
 */
window.toggleDriverFields = () => {
    const roleEl = document.getElementById('funcFuncao');
    if (!roleEl) return;
    
    const role = roleEl.value;
    const div = document.getElementById('driverSpecificFields');
    
    if (div) {
        div.style.display = (role === 'motorista') ? 'block' : 'none';
        
        // Se mudou para ajudante, limpa os campos visuais para não confundir
        if (role !== 'motorista') {
            const cnhInput = document.getElementById('funcCNH');
            if(cnhInput) cnhInput.value = '';
            document.getElementById('funcValidadeCNH').value = '';
            document.getElementById('funcCategoriaCNH').value = '';
        }
    }
};

// --- 2. GERENCIAMENTO DE MODAIS (POP-UPS) ---

window.openViewModal = (title, htmlContent) => {
    const modal = document.getElementById('viewItemModal');
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    modal.style.display = 'block';
};

window.closeViewModal = () => {
    document.getElementById('viewItemModal').style.display = 'none';
};

window.openOperationDetails = (title, htmlContent) => {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
};

window.closeModal = () => {
    document.getElementById('operationDetailsModal').style.display = 'none';
};

// Fechar modal ao clicar fora (Listener Global)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

// --- 3. LÓGICA DE EQUIPE (ADICIONAR AJUDANTE NA OPERAÇÃO) ---

let _pendingAjudanteToAdd = null;
window._operacaoAjudantesTempList = [];

// Botão "+" na tela de operação (Adicionar Manualmente)
window.handleManualAddAjudante = () => {
    if (window.IS_READ_ONLY) return alert("Ação não permitida.");
    
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;

    if (!id) return alert("Selecione um ajudante na lista primeiro.");

    // Evita duplicidade (Comparação segura de String)
    if (window._operacaoAjudantesTempList.some(a => String(a.id) === String(id))) {
        alert("Este integrante já está na equipe.");
        sel.value = "";
        return;
    }

    const ajudante = window.getFuncionario(id);
    if (!ajudante) return alert("Erro no cadastro.");

    window.openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        window.renderAjudantesAdicionadosList();
        sel.value = "";
    });
};

// Listener para o botão de adicionar ajudante
document.addEventListener('click', function(e) {
    // Verifica se o clique foi no botão ou no ícone dentro dele
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        e.preventDefault(); // Impede submit se estiver em form
        window.handleManualAddAjudante();
    }
});

// Abre Modal de Diária
window.openAdicionarAjudanteModal = (ajudanteObj, onAddCallback) => {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
};

window.closeAdicionarAjudanteModal = () => {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// Confirmação no Modal (Botão ADD)
const btnConfirmAddAj = document.getElementById('modalAjudanteAddBtn');
if(btnConfirmAddAj) {
    btnConfirmAddAj.addEventListener('click', (e) => {
        e.preventDefault();
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

// Renderiza a lista visual de ajudantes (HTML)
window.renderAjudantesAdicionadosList = () => {
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

window.removeAjudanteFromOperation = (id) => {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => String(a.id) !== String(id));
    window.renderAjudantesAdicionadosList();
};

// --- 4. PREENCHIMENTO DE MENUS (SELECTS) ---

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    
    const prev = sel.value; // Tenta preservar seleção anterior
    
    // Mantém opções estáticas (como "TODOS") se existirem hardcoded, ou cria padrão
    if (sel.options.length > 0 && sel.options[0].value === 'all') {
        sel.innerHTML = `<option value="all">${initialText}</option>`;
    } else {
        sel.innerHTML = `<option value="">${initialText}</option>`;
    }
    
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        
        // Lógica Especial para o Destinatário de Mensagem
        if (selectId === 'msgRecipientSelect') {
             // Usa UID como valor para envio direto
             opt.value = item.uid || `temp_${item.id}`; 
             
             // Se funcionário não tem login (UID), desabilita a opção individual
             if (!item.uid) {
                 opt.disabled = true;
                 opt.textContent += " (Sem Acesso)";
                 opt.style.color = "#999";
             }
        }
        
        sel.appendChild(opt);
    });
    
    if (prev && Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    }
}

// ATUALIZADA: Preenche todos os selects, incluindo MENSAGENS
window.populateAllSelects = () => {
    // Carrega dados frescos
    const funcionarios = loadData(DB_KEYS.FUNCIONARIOS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // Filtros de Função
    const motoristas = funcionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = funcionarios.filter(f => f.funcao === 'ajudante'); 

    // Operação
    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    // Outros Paineis
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR A UM VEÍCULO (OPCIONAL)...');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // ** NOVO: SELECIONAR DESTINATÁRIO DA MENSAGEM (TODOS ou INDIVIDUAL) **
    populateSelect('msgRecipientSelect', funcionarios, 'uid', 'nome', 'TODOS OS FUNCIONÁRIOS');

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
    
    // Chama a tabela de checkins se estiver disponível
    if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
};

window.renderMinhaEmpresaInfo = () => {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = window.getMinhaEmpresa();
    
    const rz = document.getElementById('minhaEmpresaRazaoSocial');
    const cp = document.getElementById('minhaEmpresaCNPJ');
    const tl = document.getElementById('minhaEmpresaTelefone');
    
    if(rz && !rz.value) rz.value = emp.razaoSocial || '';
    if(cp && !cp.value) cp.value = emp.cnpj || '';
    if(tl && !tl.value) tl.value = emp.telefone || '';

    if (emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ:</strong> ${window.formatCPF_CNPJ(emp.cnpj)}</p>`;
    } else {
        div.innerHTML = `<p style="color:#999;">Sem dados cadastrados.</p>`;
    }
};

// --- 5. RENDERIZAÇÃO DAS TABELAS DE CADASTRO ---

window.renderCadastroTable = (key) => {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    
    if (key === DB_KEYS.FUNCIONARIOS) tabela = document.getElementById('tabelaFuncionarios');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey = 'cnpj'; }

    if (!tabela) return;
    const tbody = tabela.querySelector('tbody');
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:#999;">NENHUM REGISTRO ENCONTRADO.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let c1, c2, c3;
        
        if (key === DB_KEYS.FUNCIONARIOS) {
            c1 = item.nome;
            const cor = item.funcao === 'motorista' ? 'var(--primary-color)' : 'var(--secondary-color)';
            c2 = `<span class="status-pill" style="background:${cor};">${item.funcao}</span>`;
            c3 = item.email ? item.email.toLowerCase() : '<span style="color:red; font-size:0.8rem;">SEM ACESSO</span>';
        } else {
            c1 = item.id || item.placa || window.formatCPF_CNPJ(item.cnpj);
            c2 = item.nome || item.modelo || item.razaoSocial;
            c3 = item.documento || item.ano || window.formatPhoneBr(item.telefone) || '';
        }
        
        let rawId = item[idKey];
        // Aspas para strings, sem aspas para números
        let idParam = typeof rawId === 'string' ? `'${rawId}'` : rawId;
        
        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', ${idParam})" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', ${idParam})" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', ${idParam})" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${c1}</td><td>${c2}</td>${c3!==undefined ? `<td>${c3}</td>` : ''}<td>${btns}</td></tr>`;
    }).join('');
};

window.renderAtividadesTable = () => {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tbody = document.querySelector('#tabelaAtividades tbody');
    if(!tbody) return;
    
    if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">SEM ATIVIDADES.</td></tr>`;
    else {
        tbody.innerHTML = data.map(i => `<tr><td>${i.id}</td><td>${i.nome}</td><td>${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`).join('');
    }
};
