// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 6.0 (CALENDÁRIO CORRIGIDO + LOGIN AUTOMÁTICO)
// PARTE 1: INFRAESTRUTURA, CACHE E CÁLCULOS MATEMÁTICOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE BANCO DE DADOS
 * Unificamos Motoristas e Ajudantes em 'db_funcionarios' para facilitar o login.
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
 * 2. CACHE GLOBAL (Estado da Aplicação)
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

// Variáveis de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// VARIÁVEL CRÍTICA DO CALENDÁRIO
// Inicializa com a data de hoje para garantir que o calendário tenha referência
window.currentDate = new Date(); 

// =============================================================================
// I/O: ENTRADA E SAÍDA DE DADOS (LOCAL E FIREBASE)
// =============================================================================

function loadData(key) {
    // Retorna objeto para empresa, array para o resto
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    return APP_CACHE[key] || [];
}

async function saveData(key, value) {
    // Bloqueio de segurança para usuários "somente leitura" (Funcionários)
    // Funcionários só podem salvar check-ins e solicitações de perfil
    if (window.IS_READ_ONLY && 
        key !== DB_KEYS.OPERACOES && 
        key !== DB_KEYS.PROFILE_REQUESTS) {
        console.warn(`Escrita bloqueada em ${key} (Permissão Insuficiente).`);
        return;
    }

    // 1. Atualiza Cache Local (Feedback Instantâneo)
    APP_CACHE[key] = value;

    // 2. Sincroniza com Firebase (Se online)
    if (window.dbRef && window.CURRENT_USER) {
        
        // Super Admin não grava dados operacionais na raiz, apenas gerencia
        if (window.CURRENT_USER.email === 'admin@logimaster.com') return;

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Caminho: companies/{dominio}/data/{colecao}
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
                console.log(`[SYNC] ${key} salvo na nuvem.`);
            } catch (e) {
                console.error(`[ERRO SYNC] Falha ao salvar ${key}:`, e);
                // Não alertamos o usuário toda vez para não interromper o fluxo, 
                // mas mantemos o log de erro.
            }
        }
    } else {
        // Fallback LocalStorage (Modo Offline / Dev)
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES E MÁSCARAS
// =============================================================================

// Remove tudo que não é dígito
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Moeda BRL
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// CPF ou CNPJ Dinâmico
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

// Telefone BR (Fixo ou Celular)
function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

// Utilitário de Cópia
function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
        () => alert('Copiado para a área de transferência!'),
        () => alert('Erro ao copiar.')
    );
}

// =============================================================================
// GETTERS (BUSCA RELACIONAL UNIFICADA)
// =============================================================================

function getFuncionario(id) {
    // Busca na tabela unificada
    return loadData(DB_KEYS.FUNCIONARIOS).find(f => String(f.id) === String(id));
}

// Helper para filtrar apenas motoristas
function getMotorista(id) {
    const f = getFuncionario(id);
    return (f && f.funcao === 'motorista') ? f : null;
}

// Helper para filtrar apenas ajudantes
function getAjudante(id) {
    const f = getFuncionario(id);
    return (f && f.funcao === 'ajudante') ? f : null;
}

function getVeiculo(placa) {
    return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
}

function getContratante(cnpj) {
    return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
}

function getAtividade(id) {
    return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
}

function getMinhaEmpresa() {
    return loadData(DB_KEYS.MINHA_EMPRESA);
}

// =============================================================================
// LÓGICA MATEMÁTICA DE FROTA (CONSUMO E CUSTOS REAIS)
// =============================================================================

/**
 * 1. OBTER ÚLTIMO KM VÁLIDO:
 * Usado para pré-preencher o check-in e impedir fraude no hodômetro.
 */
function obterUltimoKmFinal(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações deste veículo que tenham KM Final registrado
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    
    // Retorna o maior valor encontrado (mais seguro que data em caso de lançamento retroativo)
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
}

/**
 * 2. MÉDIA HISTÓRICA GLOBAL (GLOBAL AVERAGE):
 * O sistema calcula a média baseada em TODO o histórico do carro, não apenas na viagem.
 * Fórmula: Soma Total de KM / Soma Total de Litros Abastecidos.
 */
function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Considera apenas operações confirmadas (dados reais)
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        // 1. Acumula KM Rodado
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        // 2. Acumula Litros (se houve abastecimento com preço válido)
        // Litros = Valor Pago / Preço do Litro
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    // Evita divisão por zero
    if (totalLitrosAbastecidos <= 0) return 0;
    
    // Retorna KM por Litro
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

/**
 * 3. PREÇO DO DIESEL DE REFERÊNCIA:
 * Retorna o preço pago na viagem ou, se não abasteceu, o último preço registrado.
 */
function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações onde houve abastecimento
    const opsComPreco = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    
    if (opsComPreco.length === 0) return 0;
    
    // Ordena pela data mais recente
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    return Number(opsComPreco[0].precoLitro) || 0;
}

/**
 * 4. CÁLCULO DE CUSTO DA VIAGEM (LUCRO LÍQUIDO):
 * Custo Diesel = (KM da Viagem / Média Global) * Preço do Diesel.
 */
function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status !== 'CONFIRMADA') return 0; // Só calcula custo real se confirmada
    
    // Passo A: Média Global
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    // Passo B: Preço do Diesel
    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0;

    // Passo C: Litros Teóricos
    const litrosConsumidos = kmRodado / mediaKmL;
    
    // Passo D: Valor em R$
    return litrosConsumidos * precoParaCalculo;
}
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 6.0
// PARTE 2: INTERFACE DE USUÁRIO (UI), MODAIS E LISTAGENS
// =============================================================================

// --- 1. VALIDAÇÕES VISUAIS E COMPORTAMENTO DE FORMULÁRIO ---

// Alerta sobre CNH vencida ao selecionar motorista
function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    
    // Zera horas para comparação de datas pura (evita falso positivo por fuso)
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    
    // Diferença em dias
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        alert(`⚠️ PERIGO: A CNH DE ${m.nome} ESTÁ VENCIDA!`);
    } else if (diffDays <= 30) {
        alert(`⚠️ ATENÇÃO: A CNH DE ${m.nome} VENCE EM ${diffDays} DIAS.`);
    }
}

// Controla a visibilidade dos campos de CNH (Só mostra se for Motorista)
function toggleDriverFields() {
    const role = document.getElementById('funcFuncao').value;
    const div = document.getElementById('driverSpecificFields');
    if (div) {
        div.style.display = (role === 'motorista') ? 'block' : 'none';
        
        // Se ocultar, limpa os campos para não salvar lixo
        if (role !== 'motorista') {
            document.getElementById('funcCNH').value = '';
            document.getElementById('funcValidadeCNH').value = '';
            document.getElementById('funcCategoriaCNH').value = '';
        }
    }
}
// Torna global para o onchange do HTML funcionar
window.toggleDriverFields = toggleDriverFields;

// --- 2. GERENCIAMENTO DE MODAIS (POP-UPS) ---

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

// Fechar modal ao clicar fora (Listener Global)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}

// --- 3. LÓGICA DE EQUIPE (ADICIONAR AJUDANTE MANUALMENTE) ---

let _pendingAjudanteToAdd = null;
window._operacaoAjudantesTempList = [];

// Botão "+" na tela de operação
function handleManualAddAjudante() {
    if (window.IS_READ_ONLY) return alert("Ação não permitida.");
    
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;

    if (!id) return alert("Selecione um ajudante na lista primeiro.");

    // Evita duplicidade
    if (window._operacaoAjudantesTempList.some(a => String(a.id) === String(id))) {
        alert("Este integrante já está na equipe.");
        sel.value = "";
        return;
    }

    const ajudante = getAjudante(id) || getFuncionario(id); // Permite pegar motorista atuando como ajudante
    if (!ajudante) return alert("Erro no cadastro.");

    openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        renderAjudantesAdicionadosList();
        sel.value = "";
    });
}

// Listener seguro para o botão
document.addEventListener('click', function(e) {
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        handleManualAddAjudante();
    }
});

// Modal de Diária
function openAdicionarAjudanteModal(ajudanteObj, onAddCallback) {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
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

// Confirmação no Modal
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
        closeAdicionarAjudanteModal();
    });
}

// Renderiza a lista visual (HTML)
function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    
    const arr = window._operacaoAjudantesTempList || [];
    
    if (arr.length === 0) {
        list.innerHTML = '<li style="color:#999; padding:10px; font-style:italic;">Nenhum ajudante escalado.</li>';
        return;
    }
    
    list.innerHTML = arr.map(a => {
        const aj = getFuncionario(a.id) || { nome: 'DESCONHECIDO' };
        const btnDel = window.IS_READ_ONLY ? '' : 
            `<button class="btn-mini btn-danger" type="button" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-times"></i></button>`;
        
        return `<li>
            <span>${aj.nome} <small style="color:var(--success-color); font-weight:bold;">(R$ ${formatCurrency(a.diaria)})</small></span>
            ${btnDel}
        </li>`;
    }).join('');
}

function removeAjudanteFromOperation(id) {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
}

// --- 4. PREENCHIMENTO DE MENUS (SELECTS) ---

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    
    const prev = sel.value; // Tenta preservar seleção
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

// ATUALIZADA: Busca na tabela unificada 'db_funcionarios'
function populateAllSelects() {
    const funcionarios = loadData(DB_KEYS.FUNCIONARIOS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // Filtros
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
    renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderAtividadesTable();
    renderMinhaEmpresaInfo();
    
    // Se existir a função de checkin (Parte 5), chama ela
    if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    
    // Preenche inputs
    const rz = document.getElementById('minhaEmpresaRazaoSocial');
    const cp = document.getElementById('minhaEmpresaCNPJ');
    const tl = document.getElementById('minhaEmpresaTelefone');
    
    if(rz && !rz.value) rz.value = emp.razaoSocial || '';
    if(cp && !cp.value) cp.value = emp.cnpj || '';
    if(tl && !tl.value) tl.value = emp.telefone || '';

    // Preenche visualização
    if (emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p>`;
    } else {
        div.innerHTML = `<p style="color:#999;">Sem dados cadastrados.</p>`;
    }
}

// --- 5. RENDERIZAÇÃO DAS TABELAS ---

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    
    // Mapeamento
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
        
        // Formatação específica para Funcionários (Unificado)
        if (key === DB_KEYS.FUNCIONARIOS) {
            c1 = item.nome;
            // Badge colorido para a função
            const cor = item.funcao === 'motorista' ? 'var(--primary-color)' : 'var(--secondary-color)';
            c2 = `<span class="status-pill" style="background:${cor};">${item.funcao}</span>`;
            // Mostra o email de acesso
            c3 = item.email ? item.email.toLowerCase() : '<span style="color:red; font-size:0.8rem;">SEM ACESSO</span>';
        } else {
            c1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
            c2 = item.nome || item.modelo || item.razaoSocial;
            c3 = item.documento || item.ano || formatPhoneBr(item.telefone) || '';
        }
        
        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${c1}</td><td>${c2}</td>${c3!==undefined ? `<td>${c3}</td>` : ''}<td>${btns}</td></tr>`;
    }).join('');
}

function renderAtividadesTable() {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tbody = document.querySelector('#tabelaAtividades tbody');
    if(!tbody) return;
    
    if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">SEM ATIVIDADES.</td></tr>`;
    else {
        tbody.innerHTML = data.map(i => `<tr><td>${i.id}</td><td>${i.nome}</td><td>${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`).join('');
    }
}
// =============================================================================
// PARTE 3: LÓGICA DE CRUD (VISUALIZAR, EDITAR, EXCLUIR) E FORMULÁRIOS
// =============================================================================

// --- VISUALIZAR DETALHES (MODAL) ---

function viewCadastro(key, id) {
    let item = null;
    let title = "DETALHES DO REGISTRO";
    let html = '<div style="line-height:1.8; font-size:0.95rem;">';

    // 1. FUNCIONÁRIOS (Unificado: Motoristas e Ajudantes)
    if (key === DB_KEYS.FUNCIONARIOS) {
        item = getFuncionario(id);
        if (!item) return alert('Funcionário não encontrado.');
        
        title = `DETALHES: ${item.funcao}`;
        
        // Indicador visual de status do login
        const loginStatus = item.uid 
            ? `<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> CONTA VINCULADA</span>` 
            : `<span style="color:orange; font-weight:bold;"><i class="fas fa-clock"></i> AGUARDANDO VÍNCULO</span>`;

        html += `
            <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <p><strong>NOME:</strong> ${item.nome}</p>
                <p><strong>FUNÇÃO:</strong> <span style="background:#e0f2f1; padding:2px 8px; border-radius:4px; color:#00695c; font-weight:bold;">${item.funcao}</span></p>
                <p><strong>LOGIN:</strong> ${item.email || 'SEM E-MAIL'}</p>
                <p><strong>STATUS:</strong> ${loginStatus}</p>
            </div>
            <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
            <p><strong>PIX:</strong> ${item.pix || ''}</p>
            <p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p>
        `;

        // Se for motorista, exibe dados específicos da CNH
        if (item.funcao === 'motorista') {
            const validadeFmt = item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA';
            html += `
                <div style="background:#f9f9f9; padding:15px; border-radius:6px; margin-top:15px; border:1px solid #eee;">
                    <h4 style="margin:0 0 10px 0; color:var(--secondary-color); font-size:0.9rem;"><i class="fas fa-id-card"></i> DADOS DE HABILITAÇÃO</h4>
                    <p><strong>Nº CNH:</strong> ${item.cnh || '--'}</p>
                    <p><strong>CATEGORIA:</strong> ${item.categoriaCNH || '-'}</p>
                    <p><strong>VALIDADE:</strong> ${validadeFmt}</p>
                    <p><strong>CURSOS:</strong> ${item.cursoDescricao || 'NENHUM'}</p>
                </div>
            `;
        }
    } 
    // 2. VEÍCULOS
    else if (key === DB_KEYS.VEICULOS) {
        item = getVeiculo(id);
        title = "DETALHES DO VEÍCULO";
        if(item) {
            html += `
                <p><strong>PLACA:</strong> <span style="font-size:1.2rem; font-weight:bold;">${item.placa}</span></p>
                <p><strong>MODELO:</strong> ${item.modelo}</p>
                <p><strong>ANO:</strong> ${item.ano || ''}</p>
                <p><strong>RENAVAM:</strong> ${item.renavam || ''}</p>
                <p><strong>CHASSI:</strong> ${item.chassi || ''}</p>
            `;
        }
    }
    // 3. CLIENTES / CONTRATANTES
    else if (key === DB_KEYS.CONTRATANTES) {
        item = getContratante(id);
        title = "DETALHES DO CLIENTE";
        if(item) {
            html += `
                <p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p>
                <p><strong>CNPJ:</strong> ${formatCPF_CNPJ(item.cnpj)}</p>
                <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
            `;
        }
    }
    
    if (!item) return alert('Registro não encontrado no banco de dados.');
    
    html += '</div>';
    openViewModal(title, html);
}

// --- EDITAR ITEM (PREENCHE O FORMULÁRIO E REDIRECIONA) ---

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA: Você não pode editar dados.");
    
    // Rola a página para o topo suavemente para ver o formulário
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 1. EDITAR FUNCIONÁRIO
    if (key === DB_KEYS.FUNCIONARIOS) {
        const f = getFuncionario(id);
        if (!f) return alert("Funcionário não encontrado.");
        
        // Preenche campos comuns
        document.getElementById('funcionarioId').value = f.id;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcDocumento').value = f.documento;
        document.getElementById('funcTelefone').value = f.telefone;
        document.getElementById('funcPix').value = f.pix;
        document.getElementById('funcEndereco').value = f.endereco;
        
        // Email (Somente leitura na edição para não quebrar vínculo)
        const emailInput = document.getElementById('funcEmail');
        emailInput.value = f.email || '';
        emailInput.readOnly = !!f.email; // Se já tem email, bloqueia edição simples
        
        // Preenche campos de motorista (se houver)
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';
        
        // Atualiza a visibilidade dos campos específicos
        toggleDriverFields();
        
        // Ativa a aba visualmente
        document.querySelector('[data-tab="funcionarios"]').click();
    } 
    // 2. EDITAR VEÍCULO
    else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa; // Placa é o ID
        document.querySelector('[data-tab="veiculos"]').click();
    }
    // 3. EDITAR CLIENTE
    else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj; // CNPJ é o ID
        document.querySelector('[data-tab="contratantes"]').click();
    }
    // 4. EDITAR ATIVIDADE
    else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    
    alert('DADOS CARREGADOS NO FORMULÁRIO.\nFaça as alterações necessárias e clique em SALVAR.');
}

// --- EXCLUIR ITEM ---

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTE REGISTRO?\nEsta ação não pode ser desfeita.')) return;
    
    let arr = loadData(key).slice(); 
    let idKey = 'id'; 
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    const newArr = arr.filter(it => String(it[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        if(key === DB_KEYS.ATIVIDADES) renderAtividadesTable();
        else renderCadastroTable(key);
        
        populateAllSelects(); 
        
        alert('ITEM EXCLUÍDO COM SUCESSO.');
    });
}

// =============================================================================
// 10. FORM HANDLERS (PROCESSAMENTO E INTEGRAÇÃO FIREBASE)
// =============================================================================

function setupFormHandlers() {
    
    // --- 1. CADASTRO DE FUNCIONÁRIO (INTEGRADO COM AUTH) ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = formFunc.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerText;
            btnSubmit.innerText = "SALVANDO E CRIANDO CONTA...";
            btnSubmit.disabled = true;

            try {
                let arr = loadData(DB_KEYS.FUNCIONARIOS).slice();
                const idHidden = document.getElementById('funcionarioId').value;
                const nomeInput = document.getElementById('funcNome').value.toUpperCase();
                const funcaoInput = document.getElementById('funcFuncao').value;
                const emailInput = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senhaInput = document.getElementById('funcSenha').value; // Opcional se edição
                
                let newId = idHidden ? Number(idHidden) : Date.now();
                
                // Validação de E-mail Único
                if (!idHidden) {
                    const exists = arr.some(f => f.email === emailInput);
                    if(exists) throw new Error("Este e-mail já está em uso por outro funcionário.");
                }

                // --- CRIAÇÃO DE CONTA NO FIREBASE (SE NOVO OU SENHA FORNECIDA) ---
                let novoUid = null;
                
                // Só tenta criar conta se tivermos acesso ao DB e for um email válido
                if (window.dbRef && emailInput.includes('@') && !idHidden && senhaInput) {
                    try {
                        const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                        
                        if (!secondaryApp) throw new Error("Erro de configuração do Firebase (App Secundário).");
                        
                        // 1. Cria usuário usando a instância secundária para não deslogar o admin
                        const auth2 = getAuth(secondaryApp);
                        const userCred = await createUserWithEmailAndPassword(auth2, emailInput, senhaInput);
                        const newUser = userCred.user;
                        novoUid = newUser.uid;

                        // 2. Cria o perfil público na coleção 'users' para o login funcionar
                        await setDoc(doc(db, "users", newUser.uid), {
                            uid: newUser.uid,
                            name: nomeInput,
                            email: emailInput,
                            role: funcaoInput, // 'motorista' ou 'ajudante'
                            company: window.CURRENT_USER.company,
                            approved: true, // Já nasce aprovado pois foi o admin que criou
                            createdAt: new Date().toISOString()
                        });

                        // 3. Desloga o usuário secundário imediatamente
                        await signOut(auth2);
                        
                        console.log("Conta Firebase criada com sucesso para:", emailInput);

                    } catch (firebaseErr) {
                        console.error("Erro ao criar conta Firebase:", firebaseErr);
                        if (firebaseErr.code === 'auth/email-already-in-use') {
                            throw new Error("Este e-mail já possui uma conta no sistema.");
                        } else {
                            alert("AVISO: Ocorreu um erro ao criar o login, mas os dados locais serão salvos. Erro: " + firebaseErr.message);
                        }
                    }
                }

                // --- PREPARAÇÃO DO OBJETO DE DADOS ---
                const obj = {
                    id: newId,
                    uid: novoUid || (idHidden ? (arr.find(f=>String(f.id)===String(idHidden))?.uid || '') : ''), // Preserva UID se edição
                    nome: nomeInput,
                    funcao: funcaoInput, 
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    email: emailInput
                };

                // Dados Específicos se for Motorista
                if (funcaoInput === 'motorista') {
                    obj.cnh = document.getElementById('funcCNH').value.toUpperCase();
                    obj.validadeCNH = document.getElementById('funcValidadeCNH').value;
                    obj.categoriaCNH = document.getElementById('funcCategoriaCNH').value;
                    obj.cursoDescricao = document.getElementById('funcCursoDescricao').value.toUpperCase();
                } else {
                    obj.cnh = ''; obj.validadeCNH = ''; obj.categoriaCNH = ''; obj.cursoDescricao = '';
                }
                
                // Salva no Array
                const idx = arr.findIndex(f => String(f.id) === String(newId));
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);
                
                // Persiste na coleção da empresa
                await saveData(DB_KEYS.FUNCIONARIOS, arr);
                
                // Reset e UI
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                document.getElementById('funcEmail').readOnly = false; // Destrava e-mail
                toggleDriverFields(); 
                
                renderCadastroTable(DB_KEYS.FUNCIONARIOS);
                populateAllSelects(); 
                
                if (novoUid) {
                    alert(`SUCESSO!\n\nFuncionário cadastrado e conta de acesso criada.\n\nE-mail: ${emailInput}\nSenha: ${senhaInput}`);
                } else {
                    alert('DADOS DO FUNCIONÁRIO ATUALIZADOS.');
                }

            } catch (err) {
                alert("ERRO: " + err.message);
            } finally {
                btnSubmit.innerText = "SALVAR E CRIAR ACESSO";
                btnSubmit.disabled = false;
            }
        });
    }

    // --- 2. CADASTRO DE VEÍCULO ---
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const idHidden = document.getElementById('veiculoId').value;

            if (!idHidden && arr.some(v => v.placa === placa)) {
                return alert("ERRO: Esta placa já está cadastrada.");
            }

            const obj = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };
            
            if (idHidden && idHidden !== placa) {
                arr = arr.filter(v => v.placa !== idHidden);
                arr.push(obj);
            } else {
                const idx = arr.findIndex(v => v.placa === placa);
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            }
            
            saveData(DB_KEYS.VEICULOS, arr).then(() => {
                formVeiculo.reset();
                document.getElementById('veiculoId').value = '';
                renderCadastroTable(DB_KEYS.VEICULOS);
                populateAllSelects();
                alert('VEÍCULO SALVO.');
            });
        });
    }

    // --- 3. CADASTRO DE CLIENTE ---
    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', (e) => {
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
                formContratante.reset();
                document.getElementById('contratanteId').value = '';
                renderCadastroTable(DB_KEYS.CONTRATANTES);
                populateAllSelects();
                alert('CLIENTE SALVO.');
            });
        });
    }

    // --- 4. CADASTRO DE ATIVIDADE ---
    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.ATIVIDADES).slice();
            const idHidden = document.getElementById('atividadeId').value;
            
            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
                nome: document.getElementById('atividadeNome').value.toUpperCase()
            };

            const idx = arr.findIndex(a => String(a.id) === String(obj.id));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);

            saveData(DB_KEYS.ATIVIDADES, arr).then(() => {
                formAtividade.reset();
                document.getElementById('atividadeId').value = '';
                renderAtividadesTable();
                populateAllSelects();
                alert('ATIVIDADE SALVA.');
            });
        });
    }

    // --- 5. MINHA EMPRESA ---
    const formMinhaEmpresa = document.getElementById('formMinhaEmpresa');
    if (formMinhaEmpresa) {
        formMinhaEmpresa.addEventListener('submit', (e) => {
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj).then(() => {
                renderMinhaEmpresaInfo();
                alert('DADOS DA EMPRESA ATUALIZADOS.');
            });
        });
    }

    // --- 6. SOLICITAÇÃO DE PERFIL ---
    const formReq = document.getElementById('formRequestProfileChange');
    if (formReq) {
        formReq.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!window.CURRENT_USER) return;
            
            let originalUser = loadData(DB_KEYS.FUNCIONARIOS).find(f => 
                f.uid === window.CURRENT_USER.uid || 
                (f.email && f.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
            );
            
            if (!originalUser) return alert("Erro: Perfil não encontrado.");

            const changes = [];
            const newPhone = document.getElementById('reqEmpTelefone').value;
            const newPix = document.getElementById('reqEmpPix').value;
            
            if (newPhone && newPhone !== originalUser.telefone) changes.push({field: 'telefone', label: 'TELEFONE', old: originalUser.telefone, new: newPhone});
            if (newPix && newPix !== originalUser.pix) changes.push({field: 'pix', label: 'CHAVE PIX', old: originalUser.pix, new: newPix});
            
            if (originalUser.funcao === 'motorista') {
                const newCnh = document.getElementById('reqEmpCNH').value;
                const newVal = document.getElementById('reqEmpValidadeCNH').value;
                if (newCnh && newCnh !== originalUser.cnh) changes.push({field: 'cnh', label: 'CNH', old: originalUser.cnh, new: newCnh});
                if (newVal && newVal !== originalUser.validadeCNH) changes.push({field: 'validadeCNH', label: 'VALIDADE CNH', old: originalUser.validadeCNH, new: newVal});
            }

            if (changes.length === 0) return alert("Nenhuma alteração detectada.");

            let requests = loadData(DB_KEYS.PROFILE_REQUESTS) || [];
            changes.forEach(ch => {
                requests.push({
                    id: Date.now() + Math.random(),
                    userId: originalUser.id,
                    userUid: window.CURRENT_USER.uid,
                    userName: originalUser.nome,
                    userRole: originalUser.funcao,
                    field: ch.field,
                    fieldLabel: ch.label,
                    oldValue: ch.old,
                    newValue: ch.new,
                    status: 'PENDING',
                    requestDate: new Date().toISOString()
                });
            });

            saveData(DB_KEYS.PROFILE_REQUESTS, requests).then(() => {
                document.getElementById('modalRequestProfileChange').style.display = 'none';
                alert("Solicitação enviada!");
            });
        });
    }
}
// =============================================================================
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
        
        if (!motId || !veicPlaca) return alert("ERRO: Selecione Motorista e Veículo.");
        
        // Verifica CNH antes de salvar (Segurança)
        verificarValidadeCNH(motId);
        
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
            
            // Abastecimento (Caixa)
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            
            // Dados de Rodagem
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Equipe: Usa a lista temporária se foi mexida, senão mantém a original
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva dados críticos de check-in que não estão neste formulário
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
            renderOperacaoTable();
            if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
            if(typeof updateDashboardStats === 'function') updateDashboardStats();

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
                const motProfile = getMotorista(op.motoristaId);
                const souEu = motProfile && (
                    motProfile.uid === window.CURRENT_USER.uid || 
                    (motProfile.email && motProfile.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
                );

                if (souEu) {
                    if (step === 'start') {
                        // INÍCIO DA VIAGEM
                        const kmIni = Number(document.getElementById('checkinKmInicial').value);
                        const ultimoKm = obterUltimoKmFinal(op.veiculoPlaca); // Validação de segurança
                        
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
                        
                        // Captura dados de abastecimento na estrada
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
                // Identifica ajudante logado
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
                    closeCheckinConfirmModal();
                    if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
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
            toggleDespesaParcelas(); 
            renderDespesasTable();
            alert('DESPESA(S) SALVA(S).');
        });
    });

    formDespesa.addEventListener('reset', () => {
        document.getElementById('despesaGeralId').value = '';
        setTimeout(toggleDespesaParcelas, 50);
    });
}

function toggleDespesaParcelas() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const div = document.getElementById('divDespesaParcelas');
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
        if (modo === 'avista') document.getElementById('despesaParcelas').value = 1;
    }
}
window.toggleDespesaParcelas = toggleDespesaParcelas; 

// =============================================================================
// RENDERIZAÇÃO DAS TABELAS (ADMIN)
// =============================================================================

function renderOperacaoTable() {
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
        const mot = getMotorista(op.motoristaId)?.nome || 'DESCONHECIDO';
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
            <td>${formatCurrency(op.faturamento)}</td>
            <td>${btns}</td>
        </tr>`;
    }).join('');
}

function renderDespesasTable() {
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
        return `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td>${statusHtml}</td><td>${btns}</td></tr>`;
    }).join('');
}

window.toggleStatusDespesa = function(id) {
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = !arr[idx].pago;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr).then(renderDespesasTable);
    }
};

function editDespesaItem(id) {
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).find(x => x.id === id);
    if (!d) return;
    
    document.getElementById('despesaGeralId').value = d.id;
    document.getElementById('despesaGeralData').value = d.data;
    document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoPlaca || '';
    document.getElementById('despesaGeralDescricao').value = d.descricao;
    document.getElementById('despesaGeralValor').value = d.valor;
    
    document.querySelector('[data-page="despesas"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- VISUALIZAR DETALHES E CÁLCULO DE LUCRO REAL ---

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('Operação não encontrada.');

    const mot = getMotorista(op.motoristaId)?.nome || 'N/A';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || 'N/A';
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
    const custoDieselCalculado = calcularCustoConsumoViagem(op);
    
    // 3. Outros Custos
    const outrosCustos = (op.comissao || 0) + (op.despesas || 0);
    
    // 4. Totais
    const custoTotalOperacao = custoAjudantes + custoDieselCalculado + outrosCustos;
    const lucro = (op.faturamento || 0) - custoTotalOperacao;
    const saldoReceber = (op.faturamento || 0) - (op.adiantamento || 0);

    // HTML Detalhado
    const html = `
        <div style="font-size:0.95rem;">
            <p><strong>MOTORISTA:</strong> ${mot}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CLIENTE:</strong> ${cli}</p>
            <p><strong>STATUS:</strong> ${op.status}</p>
            <hr style="margin:15px 0; border-color:#eee;">
            
            <div style="background:#e8f5e9; padding:15px; border-radius:6px; margin-bottom:15px; text-align:center;">
                <h3 style="margin:0; color:var(--success-color); font-size:1.5rem;">LUCRO LÍQUIDO: ${formatCurrency(lucro)}</h3>
                <small style="color:#666;">(Baseado no consumo médio histórico do veículo)</small>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div>
                    <strong>RECEITA:</strong><br>
                    Faturamento: ${formatCurrency(op.faturamento)}<br>
                    Adiantamento: ${formatCurrency(op.adiantamento)}
                </div>
                <div>
                    <strong>A RECEBER:</strong><br>
                    <span style="font-size:1.1rem; color:var(--primary-color); font-weight:bold;">${formatCurrency(saldoReceber)}</span>
                </div>
            </div>
            
            <h4 style="color:var(--danger-color); border-bottom:1px solid #eee; padding-bottom:5px;">CUSTOS OPERACIONAIS</h4>
            <ul style="list-style:none; padding-left:0; font-size:0.9rem; line-height:1.6;">
                <li>⛽ <strong>Diesel (Consumo Calculado):</strong> ${formatCurrency(custoDieselCalculado)}</li>
                <li>💰 <strong>Comissão Motorista:</strong> ${formatCurrency(op.comissao)}</li>
                <li>🚧 <strong>Pedágios/Despesas:</strong> ${formatCurrency(op.despesas)}</li>
                <li>👷 <strong>Equipe (Diárias):</strong> ${formatCurrency(custoAjudantes)}</li>
            </ul>
            
            <div style="font-size:0.8rem; color:#777; margin-top:15px; background:#f9f9f9; padding:10px; border-radius:4px;">
                <strong>Nota:</strong> O custo de diesel é uma estimativa baseada na média histórica (${calcularMediaHistoricaVeiculo(op.veiculoPlaca).toFixed(2)} Km/L). O valor abastecido no caixa (${formatCurrency(op.combustivel)}) é contabilizado separadamente no fluxo de caixa.
            </div>
        </div>
    `;
    
    openOperationDetails(`DETALHES DA OPERAÇÃO #${id}`, html);
}

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
    renderAjudantesAdicionadosList();
    
    alert("Dados carregados para edição.");
}
// =============================================================================
// PARTE 5: CALENDÁRIO, PAINÉIS VISUAIS E INICIALIZAÇÃO DO SISTEMA
// =============================================================================

// --- 14. LÓGICA DO CALENDÁRIO (CORRIGIDO) ---

// Navegação de Mês
window.changeMonth = function(step) {
    window.currentDate.setMonth(window.currentDate.getMonth() + step);
    renderCalendar();
    // Atualiza estatísticas do mês novo também
    if(typeof updateDashboardStats === 'function') updateDashboardStats();
};

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    
    // Proteção se o elemento não existir
    if (!grid || !title) return;

    // Limpa o "Carregando..." ou mês anterior
    grid.innerHTML = '';

    const year = window.currentDate.getFullYear();
    const month = window.currentDate.getMonth();
    
    // Atualiza Título
    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    title.textContent = `${monthNames[month]} ${year}`;

    // Cabeçalho dos Dias da Semana
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
    
    // Células vazias antes do dia 1
    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        div.style.backgroundColor = '#f9f9f9'; // Visualmente distinto
        grid.appendChild(div);
    }

    // Carrega operações para marcar no calendário
    const ops = loadData(DB_KEYS.OPERACOES);

    // Dias do Mês
    for (let day = 1; day <= lastDay; day++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.textContent = day;
        
        // Formata data atual do loop para comparação YYYY-MM-DD
        const currentIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Verifica se tem operação neste dia
        const opsDoDia = ops.filter(o => o.data === currentIso);
        
        if (opsDoDia.length > 0) {
            div.classList.add('has-operation');
            div.title = `${opsDoDia.length} Viagens`;
            
            // Adiciona bolinha indicadora
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            div.appendChild(dot);
            
            // Ao clicar, filtra a tabela de operações (opcional, mas útil)
            div.onclick = () => {
                alert(`Dia ${day}: ${opsDoDia.length} operações registradas.`);
            };
        }

        grid.appendChild(div);
    }
}

// --- 15. VISUALIZAÇÃO DE CHECK-INS E STATUS (PAINÉIS) ---

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    // Filtra pendentes (Não Confirmadas)
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. VISÃO DO ADMIN (TABELA)
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) {
        const tbody = tabelaAdmin.querySelector('tbody');
        
        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">NENHUMA ROTA ATIVA.</td></tr>';
        } else {
            tbody.innerHTML = pendentes.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                // Status e Ícones
                let statusLabel = op.status === 'AGENDADA' 
                    ? '<span class="status-pill pill-blocked" style="background:orange;">AGUARDANDO</span>' 
                    : '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';

                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                const iconMot = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Motorista OK"></i>` 
                    : `<i class="far fa-clock" style="color:orange;" title="Pendente"></i>`;
                
                // Equipe
                const totalAj = (op.ajudantes || []).length;
                const confirmAj = (op.ajudantes || []).filter(a => checkins.ajudantes && checkins.ajudantes.includes(a.id)).length;
                const badgeAj = totalAj > 0 ? `(${confirmAj}/${totalAj})` : '-';

                // Ações
                let btnAcao = op.status === 'AGENDADA' 
                    ? `<button class="btn-mini btn-primary" onclick="iniciarRotaManual(${op.id})"><i class="fas fa-play"></i></button>` 
                    : `<span style="font-size:0.8rem; color:green; font-weight:bold;">INICIADA</span>`;

                return `<tr><td>${dataFmt}</td><td>${op.veiculoPlaca}</td><td>${iconMot} ${motNome}</td><td>${badgeAj}</td><td>${statusLabel}</td><td>${btnAcao} <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button></td></tr>`;
            }).join('');
        }
        
        // Contador Menu
        const badge = document.getElementById('badgeCheckins');
        if(badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. VISÃO DO FUNCIONÁRIO (MOBILE CARDS)
    const listaMobile = document.getElementById('listaServicosAgendados');
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante') && listaMobile) {
        
        const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => u.uid === window.CURRENT_USER.uid || (u.email && u.email === window.CURRENT_USER.email));
        if (!me) return listaMobile.innerHTML = '<p style="text-align:center; color:red;">PERFIL NÃO VINCULADO.</p>';

        const myOps = pendentes.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') return Number(op.motoristaId) === Number(me.id);
            return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
        });

        if (myOps.length === 0) {
            listaMobile.innerHTML = '<p style="text-align:center; color:#999; margin-top:30px;"><i class="fas fa-bed" style="font-size:2rem; display:block;"></i>SEM VIAGENS.</p>';
        } else {
            listaMobile.innerHTML = myOps.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
                
                let btnHtml = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    btnHtml = op.status === 'AGENDADA' 
                        ? `<button class="btn-primary" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">INICIAR VIAGEM</button>`
                        : `<button class="btn-danger" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">FINALIZAR VIAGEM</button>`;
                } else {
                    const jaFoi = op.checkins?.ajudantes?.includes(me.id);
                    btnHtml = jaFoi 
                        ? `<button class="btn-success" disabled style="width:100%;">PRESENÇA CONFIRMADA</button>`
                        : `<button class="btn-primary" style="width:100%; padding:15px;" onclick="openCheckinConfirmModal(${op.id})">MARCAR PRESENÇA</button>`;
                }

                return `<div class="card" style="border-left:5px solid var(--primary-color); margin-bottom:20px;">
                    <h3 style="margin-bottom:5px;">${dataFmt} • ${op.veiculoPlaca}</h3>
                    <p style="font-weight:bold; color:#555;">${cli}</p>
                    <div style="margin-top:15px;">${btnHtml}</div>
                </div>`;
            }).join('');
        }
    }
}

// Admin força início
window.iniciarRotaManual = function(id) {
    if(!confirm("Forçar início da rota?")) return;
    let arr = loadData(DB_KEYS.OPERACOES);
    const idx = arr.findIndex(o => o.id === id);
    if(idx >= 0) {
        arr[idx].status = 'EM_ANDAMENTO';
        if(!arr[idx].dataHoraInicio) arr[idx].dataHoraInicio = new Date().toISOString();
        saveData(DB_KEYS.OPERACOES, arr).then(() => { renderCheckinsTable(); renderOperacaoTable(); });
    }
};

// --- 16. FILTRO DE HISTÓRICO DO FUNCIONÁRIO ---

window.filtrarHistoricoFuncionario = function() {
    if (!window.CURRENT_USER) return;
    const dIni = document.getElementById('empDataInicio').value;
    const dFim = document.getElementById('empDataFim').value;
    
    if (!dIni || !dFim) return alert("Selecione as datas.");
    
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
    if (!me) return;

    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        if (op.status !== 'CONFIRMADA' || op.data < dIni || op.data > dFim) return false;
        if (me.funcao === 'motorista') return Number(op.motoristaId) === Number(me.id);
        return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    let total = 0;
    
    tbody.innerHTML = ops.length ? ops.map(op => {
        let val = 0;
        if (me.funcao === 'motorista') val = op.comissao || 0;
        else {
            // Ajudante só ganha se confirmou presença
            if (op.checkins?.ajudantes?.includes(me.id)) {
                val = Number(op.ajudantes.find(a => Number(a.id) === Number(me.id))?.diaria) || 0;
            }
        }
        total += val;
        return `<tr><td>${op.data.split('-').reverse().join('/')}</td><td>${op.veiculoPlaca}</td><td>...</td><td style="color:green; font-weight:bold;">${formatCurrency(val)}</td><td>OK</td></tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;">NADA ENCONTRADO.</td></tr>';
    
    document.getElementById('empTotalReceber').textContent = formatCurrency(total);
};

// =============================================================================
// SUPER ADMIN (PAINEL MASTER)
// =============================================================================

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, getDocs, setDoc, secondaryApp, getAuth, createUserWithEmailAndPassword, signOut } = window.dbRef;

    // Monitora usuários
    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });

    // Criação de Empresa (Instância Secundária)
    const fCreate = document.getElementById('formCreateCompany');
    if (fCreate) {
        fCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
            const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
            const password = document.getElementById('newAdminPassword').value;

            if (!domain.includes('.') || !email.includes(domain)) return alert("Domínio inválido ou email não corresponde.");

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

function renderGlobalHierarchy(users) {
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
    }).join('') || '<p style="padding:10px;">Nenhuma empresa.</p>';
}

// =============================================================================
// INICIALIZAÇÃO DO SISTEMA E ROTEAMENTO
// =============================================================================

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // Reset
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
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        renderCheckinsTable();
        
        // CORREÇÃO: Chama o calendário explicitamente aqui
        setTimeout(renderCalendar, 300);
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
        renderCheckinsTable();
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
            if (key === DB_KEYS.FUNCIONARIOS) populateAllSelects();
            if (key === DB_KEYS.OPERACOES) { 
                renderOperacaoTable(); 
                renderCheckinsTable(); 
                renderCalendar(); // Atualiza o calendário se houver novas operações
                if(typeof updateDashboardStats === 'function') updateDashboardStats();
            }
        });
    });
}

// Inicializador Global
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    updateUI();
};

// Listeners de Menu
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');
            
            // Recarrega componentes específicos ao trocar de aba
            if(pageId === 'home') renderCalendar();
            if(pageId === 'operacoes') populateAllSelects();
        });
    });
    
    // Abas de Cadastro
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