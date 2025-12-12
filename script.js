// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 5.0 (UNIFICADA E CORRIGIDA)
// PARTE 1: CONFIGURAÇÕES, CACHE, I/O E CÁLCULOS MATEMÁTICOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE CHAVES DO BANCO DE DADOS (COLLECTIONS)
 * ATENÇÃO: 'db_motoristas' e 'db_ajudantes' foram unificados em 'db_funcionarios'
 */
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios', // Nova chave unificada
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests',
    
    // Mantidos apenas para compatibilidade de leitura de backups antigos se necessário,
    // mas a lógica nova usará FUNCIONARIOS.
    LEGACY_MOTORISTAS: 'db_motoristas',
    LEGACY_AJUDANTES: 'db_ajudantes'
};

/**
 * 2. CACHE GLOBAL DA APLICAÇÃO
 * Armazena todos os dados baixados do banco para acesso instantâneo.
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

// Variáveis Globais de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// =============================================================================
// FUNÇÕES DE I/O (ENTRADA E SAÍDA DE DADOS)
// =============================================================================

/**
 * Carrega dados do cache local (Síncrono).
 * @param {string} key - A chave da coleção
 */
function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    return APP_CACHE[key] || [];
}

/**
 * Salva dados no Cache e persiste no Firebase (Nuvem).
 * @param {string} key - A chave da coleção.
 * @param {Array|Object} value - Os dados a serem salvos.
 */
async function saveData(key, value) {
    // 1. Bloqueio de Segurança: Modo Leitura
    if (window.IS_READ_ONLY && 
        key !== DB_KEYS.OPERACOES && 
        key !== DB_KEYS.PROFILE_REQUESTS) {
        console.warn(`Tentativa de escrita bloqueada em ${key} (Usuário Leitura).`);
        return;
    }

    // 2. Atualiza o Cache Local imediatamente
    APP_CACHE[key] = value;

    // 3. Persistência no Firebase (Se online e autenticado)
    if (window.dbRef && window.CURRENT_USER) {
        
        // Super Admin não grava dados na estrutura de empresas
        if (window.CURRENT_USER.email === 'admin@logimaster.com') return;

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Salva dentro da subcoleção da empresa específica
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
                console.log(`Dados salvos em ${key} com sucesso.`);
            } catch (e) {
                console.error(`Erro fatal ao salvar ${key} no Firebase:`, e);
                alert("AVISO DE CONEXÃO: Não foi possível salvar na nuvem. Verifique sua internet.");
            }
        }
    } else {
        // Fallback para LocalStorage
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES E UTILITÁRIOS
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

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

function copyToClipboard(text, silent = false) {
    if (!text) return alert('NADA PARA COPIAR.');
    navigator.clipboard.writeText(text).then(() => {
        if (!silent) alert('COPIADO PARA A ÁREA DE TRANSFERÊNCIA!');
    }, () => alert('FALHA AO COPIAR.'));
}

// =============================================================================
// HELPER FUNCTIONS (GETTERS - AGORA UNIFICADOS)
// =============================================================================

function getFuncionario(id) {
    // Busca na nova tabela unificada
    return loadData(DB_KEYS.FUNCIONARIOS).find(f => String(f.id) === String(id));
}

// Wrappers para manter compatibilidade semantica
function getMotorista(id) {
    const f = getFuncionario(id);
    // Retorna apenas se for motorista (para selects especificos)
    return (f && f.funcao === 'motorista') ? f : null;
}

function getAjudante(id) {
    const f = getFuncionario(id);
    // Retorna se for ajudante (ou motorista atuando como ajudante, se o sistema permitir, mas por padrao filtra)
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
// INTELIGÊNCIA DE CÁLCULO DE FROTA E CONSUMO (MÉDIA GLOBAL)
// =============================================================================

/**
 * 1. OBTER ÚLTIMO KM:
 * Busca o maior KM registrado para validar o check-in.
 */
function obterUltimoKmFinal(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    const maxKm = Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
    return maxKm;
}

/**
 * 2. CÁLCULO DE MÉDIA HISTÓRICA GLOBAL (GLOBAL AVERAGE):
 * Soma todos os KMs rodados na história do veículo / Soma de todos os Litros abastecidos.
 * Ignora abastecimentos onde não houve registro de preço ou litro.
 */
function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Considera apenas operações confirmadas deste veículo
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        // Acumula KM Rodado se válido
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        // Acumula Litros (Valor Pago / Preço Litro)
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0; // Evita divisão por zero
    
    // Média = Total KM / Total Litros
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

/**
 * 3. OBTER PREÇO DIESEL DE REFERÊNCIA:
 * Pega o último preço pago ou o da própria viagem.
 */
function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsComPreco = todasOps.filter(op => 
        op && op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    if (opsComPreco.length === 0) return 0;
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(opsComPreco[0].precoLitro) || 0;
}

/**
 * 4. CÁLCULO DE CUSTO DA VIAGEM (LUCRO REAL):
 * Custo = (KM da Viagem / Média Global) * Preço do Diesel.
 * O valor abastecido no dia NÃO é descontado do lucro da viagem, pois é reposição de estoque.
 */
function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status !== 'CONFIRMADA') return 0;
    
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    // Define preço: da viagem ou último histórico
    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0; 

    const litrosTeoricos = kmRodado / mediaKmL;
    return litrosTeoricos * precoParaCalculo;
}
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: UI - VALIDAÇÕES, MODAIS, SELECTS E TABELAS
// =============================================================================

// --- VALIDAÇÕES VISUAIS ---

function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    
    // Zera horas para comparação de datas pura
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    
    // Diferença em dias
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        alert(`⚠️ ATENÇÃO: A CNH DO MOTORISTA ${m.nome} ESTÁ VENCIDA!`);
    } else if (diffDays <= 30) {
        alert(`⚠️ ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCE EM ${diffDays} DIAS.`);
    }
}

// Alterna campos específicos de motorista no cadastro de funcionários
function toggleDriverFields() {
    const role = document.getElementById('funcFuncao').value;
    const div = document.getElementById('driverSpecificFields');
    if (div) {
        div.style.display = role === 'motorista' ? 'block' : 'none';
    }
}
// Garante que a função esteja disponível globalmente para o onchange do HTML
window.toggleDriverFields = toggleDriverFields;

function toggleCursoInput() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) {
        div.style.display = val === 'sim' ? 'block' : 'none';
    }
}

// --- GERENCIAMENTO DE MODAIS ---

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

// FECHAR MODAIS AO CLICAR FORA (LISTENER GLOBAL)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}

// --- LÓGICA DE AJUDANTES (ADIÇÃO MANUAL NA OPERAÇÃO) ---

let _pendingAjudanteToAdd = null;
window._operacaoAjudantesTempList = [];

// 1. Handler do Botão "+"
function handleManualAddAjudante() {
    if (window.IS_READ_ONLY) return alert("Ação não permitida para seu perfil.");
    
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;

    if (!id) return alert("Selecione um ajudante na lista primeiro.");

    // Verifica duplicidade
    if (window._operacaoAjudantesTempList.some(a => String(a.id) === String(id))) {
        alert("Este ajudante já foi adicionado.");
        sel.value = "";
        return;
    }

    const ajudante = getAjudante(id);
    if (!ajudante) return alert("Erro no cadastro do ajudante.");

    openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        renderAjudantesAdicionadosList();
        sel.value = "";
    });
}

// Listener do Botão "+"
document.addEventListener('click', function(e) {
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        handleManualAddAjudante();
    }
});

// 2. Modal de Diária
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

// 3. Confirmação
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

// 4. Renderização da Lista
function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    
    const arr = window._operacaoAjudantesTempList || [];
    
    if (arr.length === 0) {
        list.innerHTML = '<li style="color:#999; padding:10px;">Nenhum ajudante na equipe.</li>';
        return;
    }
    
    list.innerHTML = arr.map(a => {
        const aj = getAjudante(a.id) || { nome: 'DESCONHECIDO' };
        const btnDel = window.IS_READ_ONLY ? '' : 
            `<button class="btn-mini btn-danger" type="button" onclick="removeAjudanteFromOperation(${a.id})" title="Remover"><i class="fas fa-times"></i></button>`;
        
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

// =============================================================================
// PREENCHIMENTO DE DADOS (VÍNCULO CADASTRO -> SELECTS)
// =============================================================================

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

// FUNÇÃO MESTRA: Atualiza todos os selects do sistema
function populateAllSelects() {
    // 1. Carrega dados brutos
    const todosFuncionarios = loadData(DB_KEYS.FUNCIONARIOS); // Nova lista unificada
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // 2. Filtra Funcionários por Função
    const motoristas = todosFuncionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = todosFuncionarios.filter(f => f.funcao === 'ajudante'); // Ou todos, se quiser permitir motorista como ajudante

    // 3. Preenche Selects da Tela de Operação
    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    
    // Select de Ajudantes (usa a lista filtrada de ajudantes)
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    // 4. Outros Selects
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR A UM VEÍCULO (OPCIONAL)...');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // 5. Select Combinado para Recibo
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        todosFuncionarios.forEach(f => {
            selRecibo.innerHTML += `<option value="func:${f.id}">${f.funcao.toUpperCase()} - ${f.nome}</option>`;
        });
    }
    
    // 6. Atualiza as Tabelas Visuais
    renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderAtividadesTable();
    renderMinhaEmpresaInfo();
    
    if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    
    const rz = document.getElementById('minhaEmpresaRazaoSocial');
    const cp = document.getElementById('minhaEmpresaCNPJ');
    const tl = document.getElementById('minhaEmpresaTelefone');
    
    if(rz && !rz.value) rz.value = emp.razaoSocial || '';
    if(cp && !cp.value) cp.value = emp.cnpj || '';
    if(tl && !tl.value) tl.value = emp.telefone || '';

    if (emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p>`;
    } else {
        div.innerHTML = `<p style="color:#999;">Sem dados cadastrados.</p>`;
    }
}

// =============================================================================
// RENDERIZAÇÃO DAS TABELAS DE CADASTRO
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    
    // Mapeamento correto com a nova chave FUNCIONARIOS
    if (key === DB_KEYS.FUNCIONARIOS) tabela = document.getElementById('tabelaFuncionarios');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey = 'cnpj'; }
    // Mantém compatibilidade com antigas chaves se necessário, mas foca nas novas
    else if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas'); 
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');

    if (!tabela) return;
    const tbody = tabela.querySelector('tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:#999;">NENHUM REGISTRO.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let col1, col2, col3;
        
        // Lógica específica para Funcionários (Motorista/Ajudante)
        if (key === DB_KEYS.FUNCIONARIOS) {
            col1 = item.nome;
            col2 = `<span class="status-pill ${item.funcao === 'motorista' ? 'pill-active' : 'pill-blocked'}" style="background:${item.funcao==='motorista'?'#00796b':'#546e7a'}">${item.funcao}</span>`;
            col3 = formatPhoneBr(item.telefone);
        } else {
            col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
            col2 = item.nome || item.modelo || item.razaoSocial;
            col3 = item.documento || item.ano || formatPhoneBr(item.telefone) || '';
        }
        
        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${col1}</td><td>${col2}</td><td>${col3}</td><td>${btns}</td></tr>`;
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
// PARTE 3: LÓGICA DE CRUD (CRIAR, LER, ATUALIZAR, DELETAR)
// =============================================================================

// --- VISUALIZAR DETALHES (MODAL) ---

function viewCadastro(key, id) {
    let item = null;
    let title = "DETALHES DO REGISTRO";
    let html = '<div style="line-height:1.8; font-size:0.95rem;">';

    // 1. FUNCIONÁRIOS (Unificado)
    if (key === DB_KEYS.FUNCIONARIOS) {
        item = getFuncionario(id);
        if (!item) return alert('Funcionário não encontrado.');
        
        title = `DETALHES: ${item.funcao}`;
        
        html += `
            <p><strong>NOME:</strong> ${item.nome}</p>
            <p><strong>FUNÇÃO:</strong> <span style="color:var(--primary-color); font-weight:bold;">${item.funcao}</span></p>
            <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
            <p><strong>PIX:</strong> ${item.pix || ''}</p>
            <p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p>
        `;

        // Se for motorista, mostra dados extras
        if (item.funcao === 'motorista') {
            html += `
                <div style="background:#f5f5f5; padding:10px; border-radius:4px; margin-top:10px;">
                    <p><strong>CNH:</strong> ${item.cnh || '--'} (CAT: ${item.categoriaCNH || '-'})</p>
                    <p><strong>VALIDADE:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p>
                    <p><strong>CURSOS:</strong> ${item.cursoDescricao || 'NENHUM'}</p>
                </div>
            `;
        }

        if(item.email) {
            html += `<hr><p style="color:var(--primary-color);"><strong>LOGIN DE ACESSO:</strong> ${item.email.toLowerCase()}</p>`;
        } else {
            html += `<hr><p style="color:var(--danger-color);"><strong>SEM LOGIN VINCULADO</strong></p>`;
        }
    } 
    // 2. VEÍCULOS
    else if (key === DB_KEYS.VEICULOS) {
        item = getVeiculo(id);
        title = "DETALHES DO VEÍCULO";
        if(item) {
            html += `
                <p><strong>PLACA:</strong> ${item.placa}</p>
                <p><strong>MODELO:</strong> ${item.modelo}</p>
                <p><strong>ANO:</strong> ${item.ano || ''}</p>
                <p><strong>RENAVAM:</strong> ${item.renavam || ''}</p>
                <p><strong>CHASSI:</strong> ${item.chassi || ''}</p>
            `;
        }
    }
    // 3. CLIENTES
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
    
    if (!item) return alert('Registro não encontrado.');
    
    html += '</div>';
    openViewModal(title, html);
}

// --- EDITAR ITEM (PREENCHE O FORMULÁRIO) ---

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 1. FUNCIONÁRIOS
    if (key === DB_KEYS.FUNCIONARIOS) {
        const f = getFuncionario(id);
        if (!f) return;
        
        document.getElementById('funcionarioId').value = f.id;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcDocumento').value = f.documento;
        document.getElementById('funcTelefone').value = f.telefone;
        document.getElementById('funcPix').value = f.pix;
        document.getElementById('funcEndereco').value = f.endereco;
        
        // Campos de Motorista
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';
        
        // Atualiza a visibilidade dos campos
        toggleDriverFields();
        
        // Vai para a aba
        document.querySelector('[data-tab="funcionarios"]').click();
    } 
    // 2. VEÍCULOS
    else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
        document.querySelector('[data-tab="veiculos"]').click();
    }
    // 3. CLIENTES
    else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
        document.querySelector('[data-tab="contratantes"]').click();
    }
    // 4. ATIVIDADES
    else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    
    alert('DADOS CARREGADOS. FAÇA AS ALTERAÇÕES E SALVE.');
}

// --- EXCLUIR ITEM ---

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    if (!confirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTE ITEM?')) return;
    
    let arr = loadData(key).slice(); 
    let idKey = 'id';
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    const newArr = arr.filter(it => String(it[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        if(key === DB_KEYS.ATIVIDADES) renderAtividadesTable();
        else renderCadastroTable(key);
        
        populateAllSelects(); // ATUALIZA OS SELECTS IMEDIATAMENTE
        alert('ITEM EXCLUÍDO COM SUCESSO.');
    });
}

// =============================================================================
// 10. FORM HANDLERS (PROCESSAMENTO DOS FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    
    // --- 1. CADASTRO DE FUNCIONÁRIO (UNIFICADO) ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let arr = loadData(DB_KEYS.FUNCIONARIOS).slice();
            const idHidden = document.getElementById('funcionarioId').value;
            const nomeInput = document.getElementById('funcNome').value.toUpperCase();
            const funcaoInput = document.getElementById('funcFuncao').value;
            
            let newId = idHidden ? Number(idHidden) : Date.now();
            let emailGerado = null;
            let existingEmail = '';
            
            // Preserva e-mail se editando, gera se novo
            if (idHidden) {
                const existing = arr.find(f => String(f.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            } else {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const cleanName = nomeInput.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                const randomSuffix = Math.floor(Math.random() * 1000);
                emailGerado = `${cleanName}.${randomSuffix}@${companyDomain}`;
            }

            // Objeto Base
            const obj = {
                id: newId,
                nome: nomeInput,
                funcao: funcaoInput, // 'motorista' ou 'ajudante'
                documento: document.getElementById('funcDocumento').value,
                telefone: document.getElementById('funcTelefone').value,
                pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                email: existingEmail || emailGerado || ''
            };

            // Dados Extras se for Motorista
            if (funcaoInput === 'motorista') {
                obj.cnh = document.getElementById('funcCNH').value.toUpperCase();
                obj.validadeCNH = document.getElementById('funcValidadeCNH').value;
                obj.categoriaCNH = document.getElementById('funcCategoriaCNH').value;
                obj.cursoDescricao = document.getElementById('funcCursoDescricao').value.toUpperCase();
            } else {
                // Limpa dados de motorista se virou ajudante
                obj.cnh = ''; obj.validadeCNH = ''; obj.categoriaCNH = ''; obj.cursoDescricao = '';
            }
            
            // Salva
            const idx = arr.findIndex(f => String(f.id) === String(newId));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.FUNCIONARIOS, arr).then(() => {
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                toggleDriverFields(); // Reseta visual
                
                renderCadastroTable(DB_KEYS.FUNCIONARIOS);
                populateAllSelects(); // CRÍTICO: Atualiza selects da operação
                
                if (emailGerado && !idHidden) {
                    alert(`FUNCIONÁRIO SALVO!\n\nLOGIN SUGERIDO: ${emailGerado}\n(O funcionário deve criar a conta com este e-mail).`);
                } else {
                    alert('DADOS ATUALIZADOS COM SUCESSO.');
                }
            });
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

    // --- 3. CADASTRO DE CONTRATANTE ---
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

    // --- 6. SOLICITAÇÃO DE ALTERAÇÃO (FUNCIONÁRIO) ---
    const formReq = document.getElementById('formRequestProfileChange');
    if (formReq) {
        formReq.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!window.CURRENT_USER) return;
            
            // Busca o perfil na tabela unificada
            let originalUser = loadData(DB_KEYS.FUNCIONARIOS).find(f => 
                f.uid === window.CURRENT_USER.uid || 
                (f.email && f.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
            );
            
            if (!originalUser) return alert("Erro: Perfil não encontrado no cadastro.");

            // Coleta dados
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
                alert("Solicitação enviada ao administrador!");
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
        
        if (!motId || !veicPlaca) return alert("Selecione Motorista e Veículo.");
        
        // Verifica CNH antes de salvar
        verificarValidadeCNH(motId);
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        
        // Recupera objeto original se for edição (para não perder dados de check-in já realizados)
        const originalOp = isEdit ? arr.find(o => String(o.id) === String(idHidden)) : null;

        // Define status inicial
        let statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se estava em andamento e foi editada, mantém em andamento (salvo se o admin mudar algo drástico)
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
            
            // Financeiro
            faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
            comissao: Number(document.getElementById('operacaoComissao').value) || 0,
            despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
            
            // Abastecimento (Registro de Caixa)
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            
            // Dados de Rodagem
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Lista de ajudantes (Usa a temp se foi modificada, senão mantém a original)
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva dados críticos de check-in que não estão no formulário
            checkins: originalOp ? originalOp.checkins : { motorista: false, ajudantes: [], ajudantesLog: {} },
            kmInicial: originalOp ? originalOp.kmInicial : 0,
            kmFinal: originalOp ? originalOp.kmFinal : 0,
            dataHoraInicio: originalOp ? originalOp.dataHoraInicio : null
        };
        
        // Salva no array
        if (isEdit) {
            const idx = arr.findIndex(o => String(o.id) === String(obj.id));
            if (idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            // Limpeza completa
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            // Atualiza UI
            renderOperacaoTable();
            if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
            if(typeof updateDashboardStats === 'function') updateDashboardStats();

            alert(isAgendamento ? 'OPERAÇÃO AGENDADA COM SUCESSO.' : 'OPERAÇÃO SALVA E CONFIRMADA.');
        });
    });
    
    // Reset do formulário limpa ID e lista visual
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
        
        if (!window.CURRENT_USER) return alert("Sessão inválida. Faça login novamente.");

        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value; // 'start', 'end' ou 'presence'
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => Number(o.id) === opId);
        
        if (idx >= 0) {
            const op = arr[idx];
            
            // Garante estrutura do objeto checkins
            if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
            if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};

            const isMotorista = window.CURRENT_USER.role === 'motorista';
            let confirmouAlguem = false;
            const agora = new Date().toISOString(); // DATA/HORA EXATA (ISO 8601)

            // --- FLUXO DO MOTORISTA ---
            if (isMotorista) {
                // Validação de segurança: O usuário logado é o motorista da operação?
                // Compara UID (ideal) ou Email
                const motProfile = getMotorista(op.motoristaId);
                const souEu = (motProfile && (motProfile.uid === window.CURRENT_USER.uid || motProfile.email === window.CURRENT_USER.email));

                if (souEu) {
                    if (step === 'start') {
                        // INÍCIO DA VIAGEM
                        const kmIni = Number(document.getElementById('checkinKmInicial').value);
                        
                        // Validação Crítica: KM não pode ser menor que o último registrado do carro
                        const ultimoKm = obterUltimoKmFinal(op.veiculoPlaca);
                        
                        if(!kmIni || kmIni <= 0) return alert("Informe um KM Inicial válido.");
                        
                        if (kmIni < ultimoKm) {
                            return alert(`ERRO DE HODÔMETRO:\n\nO KM informado (${kmIni}) é menor que o último registrado para este veículo (${ultimoKm}).\nVerifique o painel.`);
                        }
                        
                        op.kmInicial = kmIni;
                        op.status = 'EM_ANDAMENTO';
                        op.checkins.motorista = true;
                        op.dataHoraInicio = agora; // Grava o timestamp
                        confirmouAlguem = true;
                        
                        alert("VIAGEM INICIADA! BOM TRABALHO.");
                    } 
                    else if (step === 'end') {
                        // FIM DA VIAGEM
                        const kmFim = Number(document.getElementById('checkinKmFinal').value);
                        
                        if(!kmFim || kmFim <= op.kmInicial) return alert("O KM Final deve ser maior que o Inicial.");
                        
                        op.kmFinal = kmFim;
                        op.kmRodado = kmFim - (op.kmInicial || 0);
                        
                        // Captura dados de abastecimento (se houver)
                        op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                        op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                        
                        op.status = 'CONFIRMADA'; 
                        confirmouAlguem = true;
                        
                        alert(`VIAGEM FINALIZADA!\n\nDistância Percorrida: ${op.kmRodado} KM`);
                    }
                } else {
                    return alert("ERRO: Você não é o motorista escalado para esta operação.");
                }
            } 
            // --- FLUXO DO AJUDANTE ---
            else {
                // Identifica o ajudante pelo login atual
                const ajProfile = loadData(DB_KEYS.FUNCIONARIOS).find(a => 
                    a.funcao === 'ajudante' && 
                    (a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email)
                );
                
                if (ajProfile) {
                    // Verifica se ele está na lista de "Equipe" desta operação
                    const escalado = (op.ajudantes || []).some(a => Number(a.id) === Number(ajProfile.id));
                    
                    if (escalado) {
                        // Marca presença se ainda não marcou
                        if (!op.checkins.ajudantes.includes(ajProfile.id)) {
                            op.checkins.ajudantes.push(ajProfile.id);
                            op.checkins.ajudantesLog[ajProfile.id] = agora; // Grava hora da confirmação
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
            // Edição Simples (de uma parcela específica)
            const idx = arr.findIndex(d => String(d.id) === String(idHidden));
            if (idx >= 0) {
                 arr[idx].data = document.getElementById('despesaGeralData').value;
                 arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                 arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                 arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
            }
        } else {
            // Nova Despesa (Com Lógica de Parcelamento)
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
            
            // Criação das N parcelas
            const parts = dataStr.split('-');
            const dataBase = new Date(parts[0], parts[1]-1, parts[2]);
            
            for (let i = 0; i < parcelas; i++) {
                const newId = Date.now() + i; // ID sequencial único
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
window.toggleDespesaParcelas = toggleDespesaParcelas; // Global para o HTML chamar

// =============================================================================
// 14. TABELAS DE ADMINISTRAÇÃO E DETALHES FINANCEIROS
// =============================================================================

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    
    const viewOps = ops.slice(0, 50); // Otimização de renderização

    if (!viewOps.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">NENHUMA OPERAÇÃO LANÇADA.</td></tr>';
        return;
    }
    
    tbody.innerHTML = viewOps.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || 'MOTORISTA EXCLUÍDO';
        const dataFmt = op.data.split('-').reverse().join('/');
        
        // Badges de Status
        let badge = '';
        if (op.status === 'AGENDADA') badge = '<span class="status-pill pill-blocked" style="background:orange;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') badge = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';
        else badge = '<span class="status-pill pill-active">CONFIRMADA</span>';

        // Botões de Ação
        let btns = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails(${op.id})" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">NENHUMA DESPESA.</td></tr>';
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
                <button class="btn-mini ${cls}" onclick="toggleStatusDespesa(${d.id})" title="Mudar Status"><i class="fas ${icon}"></i></button>
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
    alert("Dados da despesa carregados para edição.");
}

// --- VISUALIZAR DETALHES FINANCEIROS DA OPERAÇÃO (CÁLCULO REAL) ---

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('Operação não encontrada.');

    const mot = getMotorista(op.motoristaId)?.nome || 'Motorista Removido';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || 'Cliente Removido';
    const isOk = op.status === 'CONFIRMADA';

    // 1. Custo Ajudantes (Soma diárias)
    // Se confirmada, soma quem confirmou. Se não, soma todos para previsão.
    const custoAjudantes = (op.ajudantes || []).reduce((acc, a) => {
        const check = op.checkins?.ajudantes || [];
        if (!isOk || check.includes(a.id)) {
            return acc + (Number(a.diaria)||0);
        }
        return acc;
    }, 0);

    // 2. Custo Diesel (MÉDIA GLOBAL)
    // Se a viagem não rodou (km=0), custo é 0.
    const custoDieselCalculado = calcularCustoConsumoViagem(op);
    
    // 3. Outros Custos
    const outrosCustos = (op.comissao || 0) + (op.despesas || 0);
    
    // 4. Totais
    const custoTotalOperacao = custoAjudantes + custoDieselCalculado + outrosCustos;
    const lucro = (op.faturamento || 0) - custoTotalOperacao;
    const saldoReceber = (op.faturamento || 0) - (op.adiantamento || 0);

    // Lista de Ajudantes para exibição
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const nome = getAjudante(a.id)?.nome || 'ID '+a.id;
        const presenca = (isOk && op.checkins?.ajudantes?.includes(a.id)) ? ' <span style="color:green">(Presente)</span>' : '';
        return `<li>${nome} - R$ ${formatCurrency(a.diaria)} ${presenca}</li>`;
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
                <h3 style="margin:0; color:var(--success-color); font-size:1.5rem;">LUCRO LÍQUIDO: ${formatCurrency(lucro)}</h3>
                <small style="color:#666;">(Baseado no consumo médio do veículo)</small>
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
            
            <h4 style="color:var(--danger-color); border-bottom:1px solid #eee; padding-bottom:5px;">CUSTOS DA OPERAÇÃO</h4>
            <ul style="list-style:none; padding-left:0; font-size:0.9rem; line-height:1.6;">
                <li>⛽ <strong>Diesel (Consumo Calculado):</strong> ${formatCurrency(custoDieselCalculado)}</li>
                <li>💰 <strong>Comissão Motorista:</strong> ${formatCurrency(op.comissao)}</li>
                <li>🚧 <strong>Pedágios/Despesas:</strong> ${formatCurrency(op.despesas)}</li>
                <li>👷 <strong>Equipe (Diárias):</strong> ${formatCurrency(custoAjudantes)}</li>
            </ul>
            
            <div style="font-size:0.8rem; color:#777; margin-top:15px; background:#f9f9f9; padding:10px; border-radius:4px;">
                <strong>Nota sobre Combustível:</strong><br>
                O custo acima é estimado usando a média histórica do veículo (${calcularMediaHistoricaVeiculo(op.veiculoPlaca).toFixed(2)} Km/L).<br>
                Valor real abastecido no caixa: <strong>${formatCurrency(op.combustivel)}</strong> (não descontado aqui).
            </div>

            <h4 style="margin-top:20px; border-bottom:1px solid #eee; padding-bottom:5px;">EQUIPE ESCALADA</h4>
            <ul style="padding-left:20px; margin-top:5px;">${ajudantesHtml}</ul>
        </div>
    `;
    
    openOperationDetails(`DETALHES DA OPERAÇÃO #${id}`, html);
}

// Helper para edição de operação (redireciona para o formulário)
window.editOperacaoItem = function(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert("Operação não encontrada.");
    
    // Vai para a aba
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Preenche
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId || "";
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca || "";
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ || "";
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || "";
    
    document.getElementById('operacaoFaturamento').value = op.faturamento || "";
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || "";
    document.getElementById('operacaoComissao').value = op.comissao || "";
    document.getElementById('operacaoCombustivel').value = op.combustivel || "";
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || "";
    document.getElementById('operacaoDespesas').value = op.despesas || "";
    document.getElementById('operacaoKmRodado').value = op.kmRodado || "";
    
    // Recupera status
    const isAgendada = (op.status === 'AGENDADA');
    document.getElementById('operacaoIsAgendamento').checked = isAgendada;

    // Recupera lista de ajudantes
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    renderAjudantesAdicionadosList(); // Atualiza visualmente a lista
    
    alert(`EDITANDO OPERAÇÃO DE ${op.data.split('-').reverse().join('/')}`);
}
// =============================================================================
// PARTE 5: CHECK-INS VISUAIS, SUPER ADMIN E INICIALIZAÇÃO
// =============================================================================

// --- 14. RENDERIZAÇÃO DE CHECK-INS E EQUIPE (PAINÉIS) ---

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    // Filtra operações ativas (não finalizadas)
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. VISÃO DO ADMIN (TABELA COMPLETA)
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    
    // Verifica se a tabela existe e se o usuário tem permissão
    if (tabelaAdmin && !window.IS_READ_ONLY) {
        const tbody = tabelaAdmin.querySelector('tbody');
        
        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">NENHUMA ROTA ATIVA NO MOMENTO.</td></tr>';
        } else {
            tbody.innerHTML = pendentes.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                // Status Visual
                let statusLabel = '';
                if (op.status === 'AGENDADA') statusLabel = '<span class="status-pill pill-blocked" style="background:orange;">AGUARDANDO</span>';
                else if (op.status === 'EM_ANDAMENTO') statusLabel = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';

                // Ícones de status da equipe
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                
                const iconMot = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green; margin-right:5px;" title="Motorista Iniciou"></i>` 
                    : `<i class="far fa-clock" style="color:orange; margin-right:5px;" title="Aguardando Motorista"></i>`;
                
                // Contagem de Ajudantes (Confirmados / Total)
                const totalAj = (op.ajudantes || []).length;
                const confirmAj = (op.ajudantes || []).filter(a => checkins.ajudantes && checkins.ajudantes.includes(a.id)).length;
                
                // Badge visual dos ajudantes
                let badgeAj = '-';
                if (totalAj > 0) {
                    const color = confirmAj === totalAj ? 'green' : (confirmAj > 0 ? 'orange' : '#ccc');
                    badgeAj = `<span style="font-weight:bold; color:${color};"><i class="fas fa-users"></i> ${confirmAj}/${totalAj}</span>`;
                }

                // Botão de ação (Iniciar Rota forçado)
                let btnAcao = '';
                if (op.status === 'AGENDADA') {
                    btnAcao = `<button class="btn-mini btn-primary" onclick="iniciarRotaManual(${op.id})" title="Forçar Início"><i class="fas fa-play"></i></button>`;
                } else {
                    btnAcao = `<span style="font-size:0.8rem; color:green; font-weight:bold;">INICIADA</span>`;
                }

                return `<tr>
                    <td>${dataFmt}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${iconMot} ${motNome}</td>
                    <td>${badgeAj}</td>
                    <td>${statusLabel}</td>
                    <td>
                        ${btnAcao}
                        <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }
        
        // Atualiza contador no menu lateral
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. VISÃO DO FUNCIONÁRIO (CARTÕES NO MOBILE)
    const listaMobile = document.getElementById('listaServicosAgendados');
    
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante') && listaMobile) {
        
        // Identifica o ID do perfil logado na tabela unificada de funcionários
        const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
            u.uid === window.CURRENT_USER.uid || 
            (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
        );
        
        if (!me) {
            listaMobile.innerHTML = '<div class="card" style="border-left:5px solid red;"><p style="text-align:center; color:red;">SEU PERFIL NÃO ESTÁ VINCULADO CORRETAMENTE.<br>CONTATE O ADMIN.</p></div>';
            return;
        }

        // Filtra apenas as operações onde este usuário está escalado
        const myOps = pendentes.filter(op => {
            // Se for motorista, verifica o ID do motorista
            if (window.CURRENT_USER.role === 'motorista') {
                return Number(op.motoristaId) === Number(me.id);
            }
            // Se for ajudante, verifica se está na lista de ajudantes
            return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
        });

        if (myOps.length === 0) {
            listaMobile.innerHTML = '<p style="text-align:center; color:#999; margin-top:30px;"><i class="fas fa-bed" style="font-size:2rem; display:block; margin-bottom:10px;"></i>NENHUMA VIAGEM AGENDADA.</p>';
        } else {
            listaMobile.innerHTML = myOps.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const cliente = getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE NÃO IDENTIFICADO';
                
                // Lógica de visualização da equipe (Quem está comigo?)
                let infoEquipe = '';
                
                if (window.CURRENT_USER.role === 'motorista') {
                    // Motorista vê os nomes dos ajudantes
                    const nomesAj = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome.split(' ')[0]).join(', ');
                    infoEquipe = nomesAj 
                        ? `<p style="font-size:0.85rem; color:#546e7a; margin-top:5px;"><i class="fas fa-users"></i> <strong>EQUIPE:</strong> ${nomesAj}</p>` 
                        : `<p style="font-size:0.85rem; color:#999; margin-top:5px;">(SEM AJUDANTES)</p>`;
                } else {
                    // Ajudante vê quem é o motorista
                    const nomeMot = getMotorista(op.motoristaId)?.nome || 'A DEFINIR';
                    infoEquipe = `<p style="font-size:0.85rem; color:#546e7a; margin-top:5px;"><i class="fas fa-steering-wheel"></i> <strong>MOTORISTA:</strong> ${nomeMot}</p>`;
                }

                // Botão de Ação Dinâmico
                let btnHtml = '';
                
                if (window.CURRENT_USER.role === 'motorista') {
                    if (op.status === 'AGENDADA') {
                        btnHtml = `<button class="btn-primary" style="width:100%; padding:12px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
                    } else {
                        btnHtml = `<button class="btn-danger" style="width:100%; padding:12px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
                    }
                } else {
                    // Ajudante
                    const jaConfirmou = op.checkins?.ajudantes?.includes(me.id);
                    if (jaConfirmou) {
                        btnHtml = `<button class="btn-success" disabled style="width:100%; opacity:0.7;"><i class="fas fa-check"></i> PRESENÇA CONFIRMADA</button>`;
                    } else {
                        btnHtml = `<button class="btn-primary" style="width:100%; padding:12px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-user-check"></i> MARCAR PRESENÇA</button>`;
                    }
                }

                return `
                    <div class="card" style="border-left: 5px solid var(--primary-color); margin-bottom: 20px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <h4 style="color:var(--primary-color); margin-bottom:5px; font-size:1.1rem;">${dataFmt} • ${op.veiculoPlaca}</h4>
                                <p style="font-weight:700; font-size:0.95rem; margin-bottom:5px;">${cliente}</p>
                            </div>
                            <span class="status-pill" style="background:${op.status==='AGENDADA'?'orange':'#0288d1'}; font-size:0.6rem;">${op.status}</span>
                        </div>
                        ${infoEquipe}
                        <div style="margin-top:15px;">
                            ${btnHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// Iniciar Rota Manualmente (Pelo Admin)
window.iniciarRotaManual = function(id) {
    if (!confirm("TEM CERTEZA?\n\nIsso forçará o status para 'EM_ANDAMENTO', permitindo que a viagem comece mesmo sem o check-in do motorista.")) return;
    
    let arr = loadData(DB_KEYS.OPERACOES).slice();
    const idx = arr.findIndex(o => o.id === id);
    if (idx >= 0) {
        arr[idx].status = 'EM_ANDAMENTO';
        // Define hora de início manual se não houver
        if (!arr[idx].dataHoraInicio) arr[idx].dataHoraInicio = new Date().toISOString();
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            renderCheckinsTable();
            renderOperacaoTable();
            alert("ROTA INICIADA MANUALMENTE.");
        });
    }
}

// --- 15. FILTRO DE HISTÓRICO COM HORA E VALOR (FUNCIONÁRIO) ---

window.filtrarHistoricoFuncionario = function() {
    if (!window.CURRENT_USER) return;
    
    const dIni = document.getElementById('empDataInicio').value;
    const dFim = document.getElementById('empDataFim').value;
    
    if (!dIni || !dFim) return alert("Por favor, selecione as datas inicial e final.");
    
    // Identifica usuário na tabela unificada
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
        u.uid === window.CURRENT_USER.uid || 
        (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
    );
    
    if (!me) return alert("Perfil não vinculado.");
    
    const ops = loadData(DB_KEYS.OPERACOES);
    let total = 0;
    
    const filtered = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < dIni || op.data > dFim) return false;
        
        // Verifica participação
        if (me.funcao === 'motorista') return Number(op.motoristaId) === Number(me.id);
        return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">NENHUM REGISTRO NESTE PERÍODO.</td></tr>';
        document.getElementById('empTotalReceber').textContent = 'R$ 0,00';
    } else {
        let html = '';
        filtered.forEach(op => {
            const dataFmt = op.data.split('-').reverse().join('/');
            const cliente = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
            
            let valor = 0;
            let hora = '--:--';
            
            if (me.funcao === 'motorista') {
                valor = op.comissao || 0;
                if (op.dataHoraInicio) {
                    hora = new Date(op.dataHoraInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                }
            } else {
                // Ajudante só recebe se confirmado
                const ajConfig = op.ajudantes.find(a => Number(a.id) === Number(me.id));
                const confirmou = op.checkins?.ajudantes?.includes(me.id);
                
                if (confirmou) {
                    valor = Number(ajConfig.diaria) || 0;
                    const logHora = op.checkins?.ajudantesLog?.[me.id];
                    if (logHora) hora = new Date(logHora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                }
            }
            
            total += valor;
            
            html += `<tr>
                <td>
                    <div>${dataFmt}</div>
                    <small style="color:#666; font-size:0.8rem;"><i class="far fa-clock"></i> ${hora}</small>
                </td>
                <td>${op.veiculoPlaca}</td>
                <td>${cliente}</td>
                <td style="font-weight:bold; color:${valor>0?'green':'red'}">${formatCurrency(valor)}</td>
                <td><span class="status-pill pill-active">CONFIRMADA</span></td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        document.getElementById('empTotalReceber').textContent = formatCurrency(total);
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'block';
    }
}

// =============================================================================
// SUPER ADMIN: GESTÃO GLOBAL E CRIAÇÃO DE EMPRESAS
// =============================================================================

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, updateDoc, doc, deleteDoc, where, getDocs, setDoc, secondaryApp, getAuth, createUserWithEmailAndPassword, signOut } = window.dbRef;

    // 1. Escuta todos os usuários para montar a árvore hierárquica
    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });

    // 2. CRIAÇÃO DE EMPRESA (ADMIN) - TÉCNICA DE INSTÂNCIA SECUNDÁRIA
    const fCreate = document.getElementById('formCreateCompany');
    if (fCreate) {
        fCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
            const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
            const password = document.getElementById('newAdminPassword').value;

            if (!domain.includes('.')) return alert("Domínio inválido (ex: empresa.com)");
            if (!email.includes(domain)) return alert(`O e-mail do admin deve pertencer ao domínio @${domain}`);

            const btn = e.target.querySelector('button');
            const txtOriginal = btn.innerHTML;
            btn.innerHTML = "CRIANDO...";
            btn.disabled = true;

            try {
                // Usa o app secundário para não deslogar o Super Admin atual
                const auth2 = getAuth(secondaryApp);
                const userCred = await createUserWithEmailAndPassword(auth2, email, password);
                const newUser = userCred.user;

                // Salva no Firestore principal
                await setDoc(doc(db, "users", newUser.uid), {
                    uid: newUser.uid,
                    name: "ADMIN " + domain.toUpperCase(),
                    email: email,
                    role: "admin",
                    company: domain,
                    approved: true, // Admin nasce aprovado
                    createdAt: new Date().toISOString()
                });

                // Inicializa coleção da empresa (opcional, mas bom para evitar erros de leitura)
                await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { 
                    items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } 
                });

                // Desloga o usuário secundário
                await signOut(auth2);

                alert(`SUCESSO!\nEmpresa: ${domain}\nAdmin: ${email}\n\nO admin já pode acessar o sistema.`);
                fCreate.reset();

            } catch (error) {
                console.error("Erro criação:", error);
                let msg = error.message;
                if (error.code === 'auth/email-already-in-use') msg = "Este e-mail já está cadastrado.";
                alert("ERRO: " + msg);
            } finally {
                btn.innerHTML = txtOriginal;
                btn.disabled = false;
            }
        });
    }

    // 3. Enviar Mensagem Global
    const fMsg = document.getElementById('formSuperMessage');
    if (fMsg) {
        fMsg.addEventListener('submit', async (e) => {
            e.preventDefault();
            const target = document.getElementById('superMsgTarget').value.trim();
            const msg = document.getElementById('superMsgText').value;
            
            // Busca admins
            const q = query(collection(db, "users"), where("role", "==", "admin"));
            const snap = await getDocs(q);
            let count = 0;
            
            const promises = [];
            snap.forEach(docSnap => {
                const u = docSnap.data();
                // Envia se for TODOS ou se for o email específico
                if (target.toUpperCase() === 'TODOS' || u.email === target) {
                    const notifRef = collection(db, "notifications");
                    promises.push(window.dbRef.addDoc(notifRef, {
                        targetUid: u.uid,
                        message: msg,
                        sender: "SUPER ADMIN",
                        date: new Date().toISOString(),
                        read: false
                    }));
                    count++;
                }
            });
            
            await Promise.all(promises);
            alert(`Mensagem enviada para ${count} administrador(es).`);
            fMsg.reset();
        });
    }

    // 4. Funções Globais de Controle (Windows)
    window.toggleCompanyBlock = async (domain, shouldBlock) => {
        if (!confirm(`${shouldBlock ? "BLOQUEAR" : "LIBERAR"} o acesso de TODOS os usuários da empresa ${domain}?`)) return;
        
        const q = query(collection(db, "users"), where("company", "==", domain));
        const snap = await getDocs(q);
        
        const batchPromises = [];
        snap.forEach(u => {
            batchPromises.push(updateDoc(u.ref, { approved: !shouldBlock }));
        });
        
        await Promise.all(batchPromises);
        alert(`Empresa ${domain} ${shouldBlock ? "bloqueada" : "liberada"}.`);
    };

    window.deleteCompanyData = async (domain) => {
        const confirmStr = prompt(`ATENÇÃO: EXCLUSÃO IRREVERSÍVEL.\nDigite o nome do domínio "${domain}" para confirmar:`);
        if (confirmStr !== domain) return alert("Cancelado.");

        const q = query(collection(db, "users"), where("company", "==", domain));
        const snap = await getDocs(q);
        
        const batchPromises = [];
        snap.forEach(u => batchPromises.push(deleteDoc(u.ref)));
        
        await Promise.all(batchPromises);
        alert(`Empresa ${domain} e seus usuários foram removidos.`);
    };
}

function renderGlobalHierarchy(users) {
    const container = document.getElementById('superAdminContainer');
    if (!container) return;

    // Agrupa por empresa
    const groups = {};
    users.forEach(u => {
        if (u.email === 'admin@logimaster.com') return; // Ignora o próprio super admin
        const dom = u.company || 'SEM_EMPRESA';
        if (!groups[dom]) groups[dom] = [];
        groups[dom].push(u);
    });

    const domains = Object.keys(groups).sort();

    if (domains.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhuma empresa cadastrada.</p>';
        return;
    }

    let html = '';
    domains.forEach(dom => {
        const list = groups[dom];
        const admins = list.filter(u => u.role === 'admin');
        const employees = list.filter(u => u.role !== 'admin');
        const isBlocked = list.every(u => !u.approved);

        html += `
        <div class="domain-block">
            <div class="domain-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <div class="domain-title">
                    <i class="fas fa-building"></i> ${dom.toUpperCase()} 
                    <span style="font-size:0.8rem; color:#666; font-weight:normal;">(${list.length} us.)</span>
                </div>
                <div class="domain-actions">
                    <button class="btn-mini ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="event.stopPropagation(); toggleCompanyBlock('${dom}', ${!isBlocked})">
                        ${isBlocked ? 'LIBERAR' : 'BLOQUEAR'}
                    </button>
                    <button class="btn-mini btn-danger" onclick="event.stopPropagation(); deleteCompanyData('${dom}')">DEL</button>
                </div>
            </div>
            <div class="domain-content">
                <div class="admin-section">
                    <strong>ADMINISTRADORES:</strong>
                    ${admins.map(u => renderUserLine(u)).join('') || '<small>Nenhum</small>'}
                </div>
                <div class="employee-section">
                    <strong>FUNCIONÁRIOS:</strong>
                    ${employees.map(u => renderUserLine(u)).join('') || '<small>Nenhum</small>'}
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function renderUserLine(u) {
    return `
        <div class="user-row">
            <div class="user-info-box">
                <strong>${u.name}</strong>
                <span class="user-email-text">${u.email}</span>
            </div>
            <span class="status-pill ${u.approved ? 'pill-active' : 'pill-blocked'}">
                ${u.approved ? 'ATIVO' : 'BLOQUEADO'}
            </span>
        </div>
    `;
}

window.filterGlobalUsers = function() {
    const term = document.getElementById('superAdminSearch').value.toLowerCase();
    const blocks = document.querySelectorAll('.domain-block');
    blocks.forEach(b => {
        const text = b.innerText.toLowerCase();
        if (text.includes(term)) {
            b.style.display = "block";
            if (term.length > 0) b.querySelector('.domain-content').classList.add('open');
        } else {
            b.style.display = "none";
        }
    });
}

// =============================================================================
// INICIALIZAÇÃO, ROTEAMENTO E REALTIME
// =============================================================================

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // 1. Reset Visual: Esconde todos os menus e páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // 2. ROTEAMENTO POR PAPEL
    
    if (window.CURRENT_USER.email === 'admin@logimaster.com') {
        // --- SUPER ADMIN ---
        document.getElementById('menu-super-admin').style.display = 'block';
        // Vai direto para o Painel Master, IGNORA dashboard
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } 
    else if (window.CURRENT_USER.role === 'admin') {
        // --- ADMIN DA EMPRESA ---
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Inicia no Dashboard
        
        setupRealtimeListeners(); // Inicia sync de dados
        setupCompanyUsersList(); // Inicia sync de usuários
        
        // Renderiza tudo inicialmente
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        renderCheckinsTable();
        checkAndShowReminders();
        
        // Listener de Equipe para o form de mensagem
        renderCompanyTeam();
        checkNotifications();
    } 
    else {
        // --- FUNCIONÁRIO ---
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active'); // Inicia no Check-in
        
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
        renderCheckinsTable();
        renderEmployeeProfileView();
        checkNotifications();
    }
}

// Listener de Dados em Tempo Real (Firestore -> Cache -> UI)
function setupRealtimeListeners() {
    if (!window.dbRef) {
        setTimeout(setupRealtimeListeners, 500);
        return;
    }
    
    // Apenas se tiver empresa definida
    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        const company = window.CURRENT_USER.company;

        // Itera sobre todas as chaves de dados
        Object.values(DB_KEYS).forEach(key => {
            onSnapshot(doc(db, 'companies', company, 'data', key), (docSnap) => {
                if (docSnap.exists()) {
                    APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                } else {
                    APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                }
                
                // Gatilhos de atualização da UI
                if (key === DB_KEYS.FUNCIONARIOS || key === DB_KEYS.VEICULOS || key === DB_KEYS.CONTRATANTES || key === DB_KEYS.ATIVIDADES) {
                    populateAllSelects(); // VITAL: Atualiza selects assim que dados chegam
                }
                if (key === DB_KEYS.OPERACOES) {
                    renderOperacaoTable();
                    renderCheckinsTable();
                    if(typeof updateDashboardStats === 'function') updateDashboardStats();
                }
                if (key === DB_KEYS.DESPESAS_GERAIS) {
                    renderDespesasTable();
                    if(typeof updateDashboardStats === 'function') updateDashboardStats();
                }
            });
        });
    }
}

// --- FUNÇÃO GLOBAL DE INICIALIZAÇÃO ---
window.initSystemByRole = function(user) {
    console.log("Sistema Iniciado para:", user.email, "Função:", user.role);
    window.CURRENT_USER = user;
    updateUI();
};

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
    // Menu Mobile Toggle
    const btnMob = document.getElementById('mobileMenuBtn');
    if (btnMob) {
        btnMob.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('active');
        });
    }
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Navegação do Menu
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');
            
            // Fecha menu mobile ao clicar
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
            
            // Renderizações específicas por página
            if(pageId === 'graficos' && typeof renderCharts === 'function') renderCharts();
            if(pageId === 'operacoes' && typeof populateAllSelects === 'function') populateAllSelects();
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