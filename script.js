// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 4.5 (COMPLETA E EXPANDIDA)
// PARTE 1: INFRAESTRUTURA, BANCO DE DADOS E CÁLCULOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE CHAVES DO BANCO DE DADOS (COLLECTIONS)
 * Estas chaves são usadas tanto no LocalStorage quanto no Firestore.
 */
const DB_KEYS = {
    MOTORISTAS: 'db_motoristas',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    AJUDANTES: 'db_ajudantes',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

/**
 * 2. CACHE GLOBAL DA APLICAÇÃO
 * Armazena todos os dados baixados do banco para acesso instantâneo.
 * Evita leituras repetitivas no banco de dados.
 */
const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [],
    [DB_KEYS.ATIVIDADES]: [],
    [DB_KEYS.CHECKINS]: [],
    [DB_KEYS.PROFILE_REQUESTS]: []
};

// Variáveis Globais de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// =============================================================================
// SISTEMA DE I/O (ENTRADA E SAÍDA DE DADOS)
// =============================================================================

/**
 * Carrega dados do Cache Local de forma síncrona.
 * @param {string} key - A chave da coleção (ex: 'db_motoristas')
 * @returns {Array|Object} - Os dados solicitados.
 */
function loadData(key) {
    // Se for dados da empresa, retorna objeto, senão array
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
    // Se o usuário for apenas "leitura" (funcionário), ele só pode salvar 
    // dados operacionais específicos (Check-ins e Requisições de Perfil).
    if (window.IS_READ_ONLY && 
        key !== DB_KEYS.OPERACOES && 
        key !== DB_KEYS.PROFILE_REQUESTS) {
        console.warn(`Tentativa de escrita bloqueada em ${key} (Usuário Leitura).`);
        return;
    }

    // 2. Atualiza o Cache Local imediatamente (Feedback instantâneo na UI)
    APP_CACHE[key] = value;

    // 3. Persistência no Firebase (Se online e autenticado)
    if (window.dbRef && window.CURRENT_USER) {
        
        // SEGURANÇA CRÍTICA: O Super Admin NÃO deve salvar dados operacionais 
        // na estrutura de empresas enquanto navega, para não sobrescrever dados de clientes.
        if (window.CURRENT_USER.email === 'admin@logimaster.com') {
            console.log("Super Admin: Salvamento operacional ignorado.");
            return;
        }

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Salva dentro da subcoleção da empresa específica
                // Caminho: companies/{dominio}/data/{collection_key}
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
                console.log(`Dados sincronizados com a nuvem: ${key}`);
            } catch (e) {
                console.error(`Erro fatal ao salvar ${key} no Firebase:`, e);
                alert("AVISO DE CONEXÃO: Não foi possível salvar na nuvem. Verifique sua internet.");
            }
        }
    } else {
        // Fallback para LocalStorage (Modo Offline ou Dev)
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES E MÁSCARAS
// =============================================================================

// Remove tudo que não for dígito
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata para Moeda Real (BRL)
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Formata CPF (11) ou CNPJ (14)
function formatCPF_CNPJ(value) {
    const digits = onlyDigits(value);
    if (digits.length <= 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m, a, b, c, d) => {
            if (!d) return `${a}.${b}.${c}`; // CPF Incompleto
            return `${a}.${b}.${c}-${d}`;   // CPF Completo
        });
    } else {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (m, a, b, c, d, e) => {
            if (!e) return `${a}.${b}.${c}/${d}`; // CNPJ Incompleto
            return `${a}.${b}.${c}/${d}-${e}`;    // CNPJ Completo
        });
    }
}

// Formata Telefone (Fixo ou Celular)
function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

// Identifica o tipo de chave PIX visualmente
function detectPixType(key) {
    if (!key) return '';
    const v = key.trim();
    if (v.includes('@')) return 'E-MAIL';
    
    const d = onlyDigits(v);
    if (d.length === 11) return 'CPF/CELULAR';
    if (d.length === 14) return 'CNPJ';
    
    // Se tem caracteres e números misturados e é grande, provavelmente é chave aleatória
    if (v.length > 20) return 'ALEATÓRIA';
    
    return 'OUTRO';
}

// Utilitário de Cópia
function copyToClipboard(text, silent = false) {
    if (!text) return alert('Campo vazio, nada para copiar.');
    navigator.clipboard.writeText(text).then(() => {
        if (!silent) alert('Copiado para a área de transferência!');
    }, () => {
        alert('Falha ao copiar. Permissão negada pelo navegador.');
    });
}

// =============================================================================
// GETTERS (BUSCA DE DADOS RELACIONAIS)
// =============================================================================

function getMotorista(id) {
    const lista = loadData(DB_KEYS.MOTORISTAS);
    return lista.find(m => String(m.id) === String(id));
}

function getVeiculo(placa) {
    const lista = loadData(DB_KEYS.VEICULOS);
    return lista.find(v => v.placa === placa);
}

function getContratante(cnpj) {
    const lista = loadData(DB_KEYS.CONTRATANTES);
    return lista.find(c => c.cnpj === cnpj);
}

function getAjudante(id) {
    const lista = loadData(DB_KEYS.AJUDANTES);
    return lista.find(a => String(a.id) === String(id));
}

function getAtividade(id) {
    const lista = loadData(DB_KEYS.ATIVIDADES);
    return lista.find(a => String(a.id) === String(id));
}

function getMinhaEmpresa() {
    return loadData(DB_KEYS.MINHA_EMPRESA);
}

// =============================================================================
// CÁLCULOS MATEMÁTICOS DE FROTA (CONSUMO REAL E MÉDIAS)
// =============================================================================

/**
 * 1. OBTER ÚLTIMO KM:
 * Busca o maior KM registrado (final) para um veículo em operações confirmadas.
 * Útil para pré-preencher o formulário de check-in e validar odômetro.
 */
function obterUltimoKmFinal(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações desta placa que tenham KM Final registrado
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    
    // Pega o maior valor encontrado (mais seguro que data em caso de lançamento retroativo)
    const maxKm = Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
    return maxKm;
}

/**
 * 2. OBTER PREÇO DIESEL DE REFERÊNCIA:
 * Busca o último preço de diesel pago por este veículo.
 */
function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações com abastecimento
    const opsComPreco = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    
    if (opsComPreco.length === 0) return 0;
    
    // Ordena por data decrescente (mais recente primeiro)
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    return Number(opsComPreco[0].precoLitro) || 0;
}

/**
 * 3. CÁLCULO DE MÉDIA HISTÓRICA GLOBAL (SOLICITAÇÃO ESPECÍFICA):
 * O sistema NÃO deve olhar apenas o dia. Deve pegar TODO o histórico.
 * Fórmula: Soma de Todos KMs Rodados / Soma de Todos Litros Abastecidos.
 */
function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Considera apenas operações confirmadas deste veículo
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        // 1. Acumula KM Rodado na operação
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        // 2. Acumula Litros (Se houve abastecimento nesta operação)
        // Litros = Valor Pago / Preço do Litro
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    // Evita divisão por zero
    if (totalLitrosAbastecidos <= 0) return 0;
    
    // Retorna a média em KM/L
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

/**
 * 4. CÁLCULO DE CUSTO DA VIAGEM:
 * O valor descontado do lucro NÃO é o abastecimento do dia, mas sim o consumo teórico.
 * Fórmula: (KM da Viagem / Média Global) * Preço do Diesel.
 */
function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status !== 'CONFIRMADA') return 0; // Só calcula custo real se confirmada
    
    // Passo A: Pega a média global do carro
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    // Se o carro não rodou ou não tem média histórica, custo de consumo é zero
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    // Passo B: Define qual preço de diesel usar
    // Prioridade 1: O preço pago na própria viagem (se abasteceu)
    // Prioridade 2: O último preço conhecido desse carro
    let precoParaCalculo = Number(op.precoLitro) || 0;
    
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0; // Impossível calcular sem preço

    // Passo C: Calcula litros teóricos consumidos
    const litrosConsumidos = kmRodado / mediaKmL;
    
    // Passo D: Retorna valor em R$
    return litrosConsumidos * precoParaCalculo;
}
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: INTERFACE DE USUÁRIO (UI), MODAIS E LISTAS
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

// FECHAR MODAIS AO CLICAR FORA (GLOBAL)
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}

// --- LÓGICA DE AJUDANTES (ADIÇÃO MANUAL) ---

let _pendingAjudanteToAdd = null;
window._operacaoAjudantesTempList = [];

// 1. Abre modal ao clicar no botão "+"
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
    // Verifica se o clique foi no botão ou no ícone dentro dele
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        handleManualAddAjudante();
    }
});

// 2. Exibe o Modal de Diária
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

// 3. Confirma a adição (Botão dentro do modal)
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

// 4. Renderiza a lista visual na tela de operação
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

// =============================================================================
// PREENCHIMENTO DE DADOS (VÍNCULO CADASTRO -> OPERAÇÃO)
// =============================================================================

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    
    // Preserva seleção se possível
    const currentVal = sel.value;
    
    sel.innerHTML = `<option value="">${initialText}</option>`;
    
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
    
    if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
        sel.value = currentVal;
    }
}

// ESTA FUNÇÃO É CHAMADA SEMPRE QUE O BANCO DE DADOS ATUALIZA
function populateAllSelects() {
    const motoristas = loadData(DB_KEYS.MOTORISTAS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const ajudantes = loadData(DB_KEYS.AJUDANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // 1. Tela de Operação
    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    // 2. Tela de Despesas
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR A UM VEÍCULO (OPCIONAL)...');
    
    // 3. Relatórios e Recibos
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // 4. Select Misto (Recibo)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        motoristas.forEach(m => selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`);
        ajudantes.forEach(a => selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`);
    }
    
    // Atualiza as tabelas visuais também
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderAtividadesTable();
    renderMinhaEmpresaInfo();
    
    // Se a função de checkin já existir, atualiza ela
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

// =============================================================================
// TABELAS DE CADASTRO
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id';
    
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey = 'cnpj'; }

    if (!tabela) return;
    const tbody = tabela.querySelector('tbody');
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:#999;">NENHUM REGISTRO.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        let c1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let c2 = item.nome || item.modelo || item.razaoSocial;
        let c3 = item.documento || item.ano || formatPhoneBr(item.telefone) || '';
        
        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }
        return `<tr><td>${c1}</td><td>${c2}</td>${c3?`<td>${c3}</td>`:''}<td>${btns}</td></tr>`;
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

    // Busca o item correto baseado na chave
    if (key === DB_KEYS.MOTORISTAS) {
        item = getMotorista(id);
        title = "DETALHES DO MOTORISTA";
    } else if (key === DB_KEYS.AJUDANTES) {
        item = getAjudante(id);
        title = "DETALHES DO AJUDANTE";
    } else if (key === DB_KEYS.VEICULOS) {
        item = getVeiculo(id);
        title = "DETALHES DO VEÍCULO";
    } else if (key === DB_KEYS.CONTRATANTES) {
        item = getContratante(id);
        title = "DETALHES DO CLIENTE";
    }
    
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.8; font-size:0.95rem;">';
    
    // Formatação específica por tipo
    if (key === DB_KEYS.MOTORISTAS) {
        html += `
            <p><strong>NOME:</strong> ${item.nome}</p>
            <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
            <p><strong>CNH:</strong> ${item.cnh || ''} (CAT: ${item.categoriaCNH || '-'})</p>
            <p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p>
            <p><strong>PIX:</strong> ${item.pix || ''}</p>
            <p><strong>POSSUI CURSO:</strong> ${item.temCurso ? 'SIM' : 'NÃO'} ${item.temCurso ? `(${item.cursoDescricao})` : ''}</p>
        `;
        if(item.email) {
            html += `<hr><p style="color:var(--primary-color);"><strong>LOGIN DE VÍNCULO:</strong> ${item.email.toLowerCase()}</p>`;
        } else {
            html += `<hr><p style="color:var(--danger-color);"><strong>SEM LOGIN VINCULADO</strong></p>`;
        }
    } 
    else if (key === DB_KEYS.AJUDANTES) {
        html += `
            <p><strong>NOME:</strong> ${item.nome}</p>
            <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
            <p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p>
            <p><strong>PIX:</strong> ${item.pix || ''}</p>
        `;
        if(item.email) html += `<hr><p style="color:var(--primary-color);"><strong>LOGIN DE VÍNCULO:</strong> ${item.email.toLowerCase()}</p>`;
    }
    else if (key === DB_KEYS.VEICULOS) {
        html += `
            <p><strong>PLACA:</strong> ${item.placa}</p>
            <p><strong>MODELO:</strong> ${item.modelo}</p>
            <p><strong>ANO:</strong> ${item.ano || ''}</p>
            <p><strong>RENAVAM:</strong> ${item.renavam || ''}</p>
            <p><strong>CHASSI:</strong> ${item.chassi || ''}</p>
        `;
    }
    else if (key === DB_KEYS.CONTRATANTES) {
        html += `
            <p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p>
            <p><strong>CNPJ:</strong> ${formatCPF_CNPJ(item.cnpj)}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
        `;
    }
    
    html += '</div>';
    openViewModal(title, html);
}

// --- EDITAR ITEM (PREENCHE O FORMULÁRIO) ---

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    // Rola a página para o topo suavemente
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (key === DB_KEYS.MOTORISTAS) {
        const m = getMotorista(id);
        if (!m) return;
        document.getElementById('motoristaNome').value = m.nome;
        document.getElementById('motoristaDocumento').value = m.documento;
        document.getElementById('motoristaTelefone').value = m.telefone;
        document.getElementById('motoristaCNH').value = m.cnh;
        document.getElementById('motoristaValidadeCNH').value = m.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = m.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = m.temCurso ? 'sim' : 'nao';
        toggleCursoInput(); // Atualiza visibilidade do campo extra
        document.getElementById('motoristaCursoDescricao').value = m.cursoDescricao;
        document.getElementById('motoristaPix').value = m.pix;
        document.getElementById('motoristaId').value = m.id;
        
        // Ativa a aba correta visualmente
        document.querySelector('[data-tab="motoristas"]').click();
    } 
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
    else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj; // CNPJ é o ID
        document.querySelector('[data-tab="contratantes"]').click();
    }
    else if (key === DB_KEYS.AJUDANTES) {
        const a = getAjudante(id);
        if (!a) return;
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
        document.querySelector('[data-tab="ajudantes"]').click();
    }
    else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    
    alert('DADOS CARREGADOS NO FORMULÁRIO. FAÇA AS ALTERAÇÕES E CLIQUE EM SALVAR.');
}

// --- EXCLUIR ITEM ---

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTE ITEM DE FORMA PERMANENTE?')) return;
    
    let arr = loadData(key).slice(); // Cria cópia segura
    let idKey = 'id';
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    // Filtra removendo o item selecionado
    const newArr = arr.filter(it => String(it[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        // Atualiza a tabela correspondente
        if(key === DB_KEYS.ATIVIDADES) renderAtividadesTable();
        else renderCadastroTable(key);
        
        // Atualiza todos os selects do sistema para remover o item excluído
        populateAllSelects(); 
        
        alert('ITEM EXCLUÍDO COM SUCESSO.');
    });
}

// =============================================================================
// FORM HANDLERS (PROCESSAMENTO DOS FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    
    // --- 1. CADASTRO DE MOTORISTA ---
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Carrega dados atuais
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const nomeInput = document.getElementById('motoristaNome').value.toUpperCase();
            
            // Define ID: Se editando, usa o existente. Se novo, cria timestamp.
            let newId = idHidden ? Number(idHidden) : Date.now();
            
            // Lógica de E-mail de Vínculo
            let emailGerado = null;
            let existingEmail = '';
            
            if (idHidden) {
                // Modo Edição: Preserva o email/uid já existente
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            } else {
                // Modo Novo: Gera um email sugestão para vínculo futuro
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const cleanName = nomeInput.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                // Adiciona randomico para evitar duplicidade de nomes comuns
                const randomSuffix = Math.floor(Math.random() * 1000);
                emailGerado = `${cleanName}.${randomSuffix}@${companyDomain}`;
            }

            const obj = {
                id: newId,
                nome: nomeInput,
                documento: document.getElementById('motoristaDocumento').value,
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
                pix: document.getElementById('motoristaPix').value,
                // Se já tem email (edição), mantém. Se é novo, usa o gerado.
                email: existingEmail || emailGerado || ''
            };
            
            // Atualiza (substitui) ou Adiciona (push)
            const idx = arr.findIndex(a => String(a.id) === String(newId));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.MOTORISTAS, arr).then(() => {
                formMotorista.reset();
                document.getElementById('motoristaId').value = '';
                toggleCursoInput(); // Reseta estado visual do input extra
                
                renderCadastroTable(DB_KEYS.MOTORISTAS);
                populateAllSelects(); // VITAL: Atualiza o select da operação
                
                if (emailGerado && !idHidden) {
                    alert(`MOTORISTA CADASTRADO COM SUCESSO!\n\nPARA ACESSAR O SISTEMA, O MOTORISTA DEVE CRIAR UMA CONTA USANDO ESTE E-MAIL:\n\n${emailGerado}`);
                } else {
                    alert('MOTORISTA ATUALIZADO COM SUCESSO.');
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

            // Verifica duplicidade se for cadastro novo
            if (!idHidden && arr.some(v => v.placa === placa)) {
                return alert("ERRO: Esta placa já está cadastrada no sistema.");
            }

            const obj = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };
            
            // Se editou a placa (que é o ID), remove a antiga
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
                populateAllSelects(); // Atualiza select da operação
                alert('VEÍCULO SALVO COM SUCESSO.');
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
                alert('CLIENTE/CONTRATANTE SALVO.');
            });
        });
    }

    // --- 4. CADASTRO DE AJUDANTE ---
    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const nomeInput = document.getElementById('ajudanteNome').value.toUpperCase();
            
            let newId = idHidden ? Number(idHidden) : Date.now();
            let emailGerado = null;
            let existingEmail = '';

            if (idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            } else {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const cleanName = nomeInput.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                const randomSuffix = Math.floor(Math.random() * 1000);
                emailGerado = `${cleanName}.${randomSuffix}@${companyDomain}`;
            }

            const obj = {
                id: newId,
                nome: nomeInput,
                documento: document.getElementById('ajudanteDocumento').value,
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
                pix: document.getElementById('ajudantePix').value,
                email: existingEmail || emailGerado || ''
            };
            
            const idx = arr.findIndex(a => String(a.id) === String(newId));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.AJUDANTES, arr).then(() => {
                formAjudante.reset();
                document.getElementById('ajudanteId').value = '';
                renderCadastroTable(DB_KEYS.AJUDANTES);
                populateAllSelects();
                
                if (emailGerado && !idHidden) alert(`AJUDANTE SALVO!\n\nE-MAIL PARA CADASTRO: ${emailGerado}`);
                else alert('AJUDANTE ATUALIZADO.');
            });
        });
    }

    // --- 5. CADASTRO DE ATIVIDADE ---
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
                renderAtividadesTable(); // Renderiza a tabela específica
                populateAllSelects();
                alert('ATIVIDADE SALVA.');
            });
        });
    }

    // --- 6. DADOS DA MINHA EMPRESA ---
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

    // --- 7. SOLICITAÇÃO DE ALTERAÇÃO (FUNCIONÁRIO) ---
    const formReq = document.getElementById('formRequestProfileChange');
    if (formReq) {
        formReq.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!window.CURRENT_USER) return;
            
            const role = window.CURRENT_USER.role;
            let dbKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
            // Busca o perfil do usuário atual
            let originalUser = loadData(dbKey).find(u => u.uid === window.CURRENT_USER.uid || (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()));
            
            if (!originalUser) return alert("Erro: Seu perfil não foi encontrado no cadastro da empresa.");

            // Coleta dados para ver se mudou algo
            const changes = [];
            const newPhone = document.getElementById('reqEmpTelefone').value;
            const newPix = document.getElementById('reqEmpPix').value;
            
            if (newPhone && newPhone !== originalUser.telefone) changes.push({field: 'telefone', label: 'TELEFONE', old: originalUser.telefone, new: newPhone});
            if (newPix && newPix !== originalUser.pix) changes.push({field: 'pix', label: 'CHAVE PIX', old: originalUser.pix, new: newPix});
            
            if (role === 'motorista') {
                const newCnh = document.getElementById('reqEmpCNH').value;
                const newVal = document.getElementById('reqEmpValidadeCNH').value;
                if (newCnh && newCnh !== originalUser.cnh) changes.push({field: 'cnh', label: 'CNH', old: originalUser.cnh, new: newCnh});
                if (newVal && newVal !== originalUser.validadeCNH) changes.push({field: 'validadeCNH', label: 'VALIDADE CNH', old: originalUser.validadeCNH, new: newVal});
            }

            if (changes.length === 0) return alert("Nenhuma alteração detectada. Modifique os campos para enviar.");

            let requests = loadData(DB_KEYS.PROFILE_REQUESTS) || [];
            
            changes.forEach(ch => {
                requests.push({
                    id: Date.now() + Math.random(),
                    userId: originalUser.id,
                    userUid: window.CURRENT_USER.uid,
                    userName: originalUser.nome,
                    userRole: role,
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
                alert("SOLICITAÇÃO ENVIADA COM SUCESSO!\n\nO administrador analisará seu pedido.");
            });
        });
    }
}
// =============================================================================
// PARTE 4: OPERAÇÕES, CHECK-IN E FINANCEIRO
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
        
        verificarValidadeCNH(motId);
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden; // Verdadeiro se estiver editando
        
        // Recupera objeto original se for edição (para não perder check-ins)
        const originalOp = isEdit ? arr.find(o => String(o.id) === String(idHidden)) : null;

        // Define status
        let statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        // Se estava em andamento e foi editada, mantém em andamento a menos que forçar
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
            
            faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
            comissao: Number(document.getElementById('operacaoComissao').value) || 0,
            
            // Dados de Abastecimento (Caixa)
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            
            despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Se tem lista temporária (adicionada agora), usa ela. Se não e for edição, mantém a antiga.
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva dados críticos de check-in que não estão no formulário
            checkins: originalOp ? originalOp.checkins : { motorista: false, ajudantes: [], ajudantesLog: {} },
            kmInicial: originalOp ? originalOp.kmInicial : 0,
            kmFinal: originalOp ? originalOp.kmFinal : 0,
            dataHoraInicio: originalOp ? originalOp.dataHoraInicio : null
        };
        
        // Salva
        if (isEdit) {
            const idx = arr.findIndex(o => String(o.id) === String(obj.id));
            if (idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            // Limpa formulário e variáveis
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            renderOperacaoTable();
            // Atualiza painéis dependentes se existirem
            if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
            if(typeof updateDashboardStats === 'function') updateDashboardStats();

            alert(isAgendamento ? 'OPERAÇÃO AGENDADA COM SUCESSO.' : 'OPERAÇÃO SALVA E CONFIRMADA.');
        });
    });
    
    // Reset do formulário limpa ID e lista
    formOperacao.addEventListener('reset', () => {
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
    });
}

// --- 12. CHECK-IN DO MOTORISTA/AJUDANTE (REGISTRO REAL) ---

const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    formCheckin.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!window.CURRENT_USER) return alert("Erro de sessão. Faça login novamente.");

        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value; // 'start', 'end' ou 'presence'
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => Number(o.id) === opId);
        
        if (idx >= 0) {
            const op = arr[idx];
            
            // Garante estrutura de objetos
            if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
            if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};

            const isMotorista = window.CURRENT_USER.role === 'motorista';
            let confirmou = false;
            const agora = new Date().toISOString(); // DATA E HORA EXATA DO CLIQUE

            if (isMotorista) {
                // Validação de segurança: Sou eu mesmo?
                const motCad = getMotorista(op.motoristaId);
                const souEu = (motCad && (motCad.uid === window.CURRENT_USER.uid || motCad.email === window.CURRENT_USER.email));

                if (souEu) {
                    if (step === 'start') {
                        const kmIni = Number(document.getElementById('checkinKmInicial').value);
                        
                        // Validação de KM regredido
                        const ultimoKm = obterUltimoKmFinal(op.veiculoPlaca);
                        
                        if(!kmIni || kmIni <= 0) return alert("Informe um KM válido.");
                        if (kmIni < ultimoKm) {
                            return alert(`ERRO: O KM INICIAL (${kmIni}) NÃO PODE SER MENOR QUE O ÚLTIMO REGISTRADO (${ultimoKm}).`);
                        }
                        
                        op.kmInicial = kmIni;
                        op.status = 'EM_ANDAMENTO'; 
                        op.checkins.motorista = true;
                        op.dataHoraInicio = agora; // Grava hora exata
                        confirmou = true;
                        alert("VIAGEM INICIADA! BOM TRABALHO.");
                    } 
                    else if (step === 'end') {
                        const kmFim = Number(document.getElementById('checkinKmFinal').value);
                        
                        if(!kmFim || kmFim <= op.kmInicial) return alert("O KM Final deve ser maior que o Inicial.");
                        
                        op.kmFinal = kmFim;
                        op.kmRodado = kmFim - (op.kmInicial || 0);
                        
                        // Captura abastecimento feito na estrada
                        op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                        op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                        
                        op.status = 'CONFIRMADA'; 
                        confirmou = true;
                        alert(`VIAGEM FINALIZADA!\nTotal Rodado: ${op.kmRodado} KM`);
                    }
                }
            } 
            else {
                // Lógica de Ajudante
                const ajProfile = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email);
                
                if (ajProfile) {
                    // Verifica se ele está escalado nesta operação
                    const escalado = (op.ajudantes || []).some(a => Number(a.id) === Number(ajProfile.id));
                    
                    if (escalado) {
                        if (!op.checkins.ajudantes.includes(ajProfile.id)) {
                            op.checkins.ajudantes.push(ajProfile.id);
                            op.checkins.ajudantesLog[ajProfile.id] = agora; // Grava hora
                        }
                        confirmou = true;
                        alert("PRESENÇA CONFIRMADA!");
                    }
                }
            }

            if (confirmou) {
                saveData(DB_KEYS.OPERACOES, arr).then(() => {
                    closeCheckinConfirmModal();
                    if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
                });
            } else {
                alert('ERRO: Você não parece estar vinculado a esta operação ou seus dados de login não conferem com o cadastro.');
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
            // Edição de parcela única
            const idx = arr.findIndex(d => String(d.id) === String(idHidden));
            if (idx >= 0) {
                 arr[idx].data = document.getElementById('despesaGeralData').value;
                 arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                 arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                 arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
            }
        } else {
            // Nova Despesa (Lógica de Parcelamento)
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
            // Cria data base corrigindo fuso horário simples
            const parts = dataStr.split('-');
            const dataBase = new Date(parts[0], parts[1]-1, parts[2]);
            
            for (let i = 0; i < parcelas; i++) {
                const newId = Date.now() + i; // Garante ID único
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
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none'; // Flex para manter o grid
        if (modo === 'avista') document.getElementById('despesaParcelas').value = 1;
    }
}
// Torna global para ser chamado no onchange do HTML
window.toggleDespesaParcelas = toggleDespesaParcelas;


// =============================================================================
// RENDERIZAÇÃO DAS TABELAS (ADMIN)
// =============================================================================

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    
    // Otimização: Renderiza apenas os 50 últimos para não travar
    const viewOps = ops.slice(0, 50);

    if (!viewOps.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">NENHUMA OPERAÇÃO REGISTRADA.</td></tr>';
        return;
    }
    
    tbody.innerHTML = viewOps.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || 'MOTORISTA EXCLUÍDO';
        const dataFmt = op.data.split('-').reverse().join('/');
        
        let badge = '';
        if (op.status === 'AGENDADA') badge = '<span class="status-pill pill-blocked" style="background:orange;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') badge = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';
        else badge = '<span class="status-pill pill-active">CONFIRMADA</span>';

        let btns = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>`;
        }

        return `<tr><td>${dataFmt}</td><td>${mot}</td><td>${badge}</td><td>${formatCurrency(op.faturamento)}</td><td>${btns}</td></tr>`;
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
                <button class="btn-mini ${cls}" onclick="toggleStatusDespesa(${d.id})"><i class="fas ${icon}"></i></button>
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
    
    // Rola para o formulário
    document.querySelector('[data-page="despesas"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert("Dados da despesa carregados. Edite e salve.");
}

// --- VISUALIZAR DETALHES FINANCEIROS DA OPERAÇÃO ---

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('Operação não encontrada.');

    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    
    // Lista Ajudantes
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const nome = getAjudante(a.id)?.nome || 'ID '+a.id;
        // Verifica presença se a viagem já foi confirmada
        const presenca = (op.status === 'CONFIRMADA' && op.checkins?.ajudantes?.includes(a.id)) ? '(Presente)' : '';
        return `<li>${nome} - R$ ${formatCurrency(a.diaria)} ${presenca}</li>`;
    }).join('') || '<li>Sem ajudantes</li>';

    // CÁLCULO FINANCEIRO REAL
    // 1. Custo Ajudantes (só soma se confirmado ou se for previsão)
    const custoAjudantes = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria)||0), 0);
    
    // 2. Custo Diesel (Usando Média Global)
    // Se a viagem não foi realizada (km=0), custo é 0.
    const custoDieselCalculado = calcularCustoConsumoViagem(op);
    
    // 3. Outros Custos
    const outrosCustos = (op.comissao || 0) + (op.despesas || 0);
    
    // 4. Totais
    const custoTotalOperacao = custoAjudantes + custoDieselCalculado + outrosCustos;
    const lucro = (op.faturamento || 0) - custoTotalOperacao;
    const saldoReceber = (op.faturamento || 0) - (op.adiantamento || 0);

    const html = `
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <p><strong>STATUS:</strong> ${op.status}</p>
        <hr style="margin:10px 0; border-color:#eee;">
        
        <div style="background:#e8f5e9; padding:10px; border-radius:4px; margin-bottom:10px;">
            <h3 style="margin:0; color:var(--success-color); text-align:center;">LUCRO: ${formatCurrency(lucro)}</h3>
        </div>

        <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
        <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(op.adiantamento)}</p>
        <p><strong>A RECEBER:</strong> ${formatCurrency(saldoReceber)}</p>
        
        <h4 style="margin-top:15px; color:var(--danger-color);">CUSTOS OPERACIONAIS</h4>
        <ul style="list-style:none; padding-left:0; font-size:0.9rem;">
            <li>⛽ DIESEL (ESTIMADO P/ KM): ${formatCurrency(custoDieselCalculado)}</li>
            <li>💰 COMISSÃO: ${formatCurrency(op.comissao)}</li>
            <li>🚧 PEDÁGIOS/OUTROS: ${formatCurrency(op.despesas)}</li>
            <li>👷 AJUDANTES: ${formatCurrency(custoAjudantes)}</li>
        </ul>
        
        <div style="font-size:0.8rem; color:#666; margin-top:10px; border-top:1px dashed #ccc; padding-top:5px;">
            * O custo do diesel é calculado usando a média global do veículo (${calcularMediaHistoricaVeiculo(op.veiculoPlaca).toFixed(2)} KM/L) multiplicada pelo KM rodado nesta viagem (${op.kmRodado || 0} KM).
            <br>
            * Valor abastecido no caixa: ${formatCurrency(op.combustivel)} (Não descontado diretamente do lucro da viagem, apenas do caixa geral).
        </div>

        <h4 style="margin-top:15px;">EQUIPE</h4>
        <ul style="padding-left:20px;">${ajudantesHtml}</ul>
    `;
    
    openOperationDetails(`DETALHES DA OPERAÇÃO #${id}`, html);
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
    if (tabelaAdmin && !window.IS_READ_ONLY) {
        const tbody = tabelaAdmin.querySelector('tbody');
        
        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">NENHUMA ROTA ATIVA NO MOMENTO.</td></tr>';
        } else {
            tbody.innerHTML = pendentes.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                // Status Formatado
                let statusLabel = '';
                if (op.status === 'AGENDADA') statusLabel = '<span class="status-pill pill-blocked" style="background:orange;">AGUARDANDO</span>';
                else if (op.status === 'EM_ANDAMENTO') statusLabel = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';

                // Ícones de status da equipe
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                const iconMot = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green; margin-right:5px;"></i>` 
                    : `<i class="far fa-clock" style="color:orange; margin-right:5px;"></i>`;
                
                // Lista visual de ajudantes (quantos confirmaram)
                const totalAj = op.ajudantes.length;
                const confirmAj = op.ajudantes.filter(a => checkins.ajudantes.includes(a.id)).length;
                const badgeAj = totalAj > 0 ? `(${confirmAj}/${totalAj})` : '-';

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
                        <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }
        
        // Atualiza contador no menu
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. VISÃO DO FUNCIONÁRIO (CARTÕES NO MOBILE)
    const listaMobile = document.getElementById('listaServicosAgendados');
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante') && listaMobile) {
        
        // Identifica o ID do perfil logado
        let myKey = window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const me = loadData(myKey).find(u => u.uid === window.CURRENT_USER.uid || (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()));
        
        if (!me) {
            listaMobile.innerHTML = '<div class="card" style="border-left:5px solid red;"><p style="text-align:center; color:red;">SEU PERFIL NÃO ESTÁ VINCULADO CORRETAMENTE.<br>CONTATE O ADMIN.</p></div>';
            return;
        }

        // Filtra apenas as operações onde este usuário está escalado
        const myOps = pendentes.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') return Number(op.motoristaId) === Number(me.id);
            return (op.ajudantes || []).some(a => Number(a.id) === Number(me.id));
        });

        if (myOps.length === 0) {
            listaMobile.innerHTML = '<p style="text-align:center; color:#999; margin-top:30px;"><i class="fas fa-bed" style="font-size:2rem; display:block; margin-bottom:10px;"></i>NENHUMA VIAGEM AGENDADA.</p>';
        } else {
            listaMobile.innerHTML = myOps.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const cliente = getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE NÃO IDENTIFICADO';
                
                // Lógica de visualização da equipe
                let infoEquipe = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    // Motorista vê os ajudantes
                    const nomesAj = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome.split(' ')[0]).join(', ');
                    infoEquipe = nomesAj 
                        ? `<p style="font-size:0.85rem; color:#546e7a; margin-top:5px;"><i class="fas fa-users"></i> <strong>EQUIPE:</strong> ${nomesAj}</p>` 
                        : `<p style="font-size:0.85rem; color:#999; margin-top:5px;">(SEM AJUDANTES)</p>`;
                } else {
                    // Ajudante vê o motorista
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
        // Define hora de início manual
        if (!arr[idx].dataHoraInicio) arr[idx].dataHoraInicio = new Date().toISOString();
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            renderCheckinsTable();
            renderOperacaoTable();
            alert("ROTA INICIADA MANUALMENTE.");
        });
    }
}

// --- 15. FILTRO DE HISTÓRICO COM HORA E VALOR ---

window.filtrarHistoricoFuncionario = function() {
    if (!window.CURRENT_USER) return;
    
    const dIni = document.getElementById('empDataInicio').value;
    const dFim = document.getElementById('empDataFim').value;
    
    if (!dIni || !dFim) return alert("Por favor, selecione as datas inicial e final.");
    
    // Identifica usuário
    let role = window.CURRENT_USER.role;
    let myKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    const me = loadData(myKey).find(u => u.uid === window.CURRENT_USER.uid || (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()));
    
    if (!me) return alert("Perfil não encontrado.");
    
    const ops = loadData(DB_KEYS.OPERACOES);
    let total = 0;
    
    const filtered = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < dIni || op.data > dFim) return false;
        
        // Verifica participação
        if (role === 'motorista') return Number(op.motoristaId) === Number(me.id);
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
            
            if (role === 'motorista') {
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
    
    // Reseta visibilidade de todos os menus e páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // ROTEAMENTO
    if (window.CURRENT_USER.email === 'admin@logimaster.com') {
        // SUPER ADMIN
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active'); // Força tela
        setupSuperAdmin();
    } 
    else if (window.CURRENT_USER.role === 'admin') {
        // ADMIN DA EMPRESA
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Dashboard
        
        setupRealtimeListeners(); // Inicia sync de dados
        setupCompanyUsersList(); // Inicia sync de usuários
        
        // Renderiza tudo inicialmente
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        renderCheckinsTable();
        checkAndShowReminders();
    } 
    else {
        // FUNCIONÁRIO
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active'); // Check-in
        
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
        renderCheckinsTable();
        renderEmployeeProfileView();
    }
    
    // Inicia verificador de mensagens para todos (exceto super)
    if (window.CURRENT_USER.email !== 'admin@logimaster.com') {
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
                if (key === DB_KEYS.MOTORISTAS || key === DB_KEYS.VEICULOS || key === DB_KEYS.CONTRATANTES || key === DB_KEYS.AJUDANTES || key === DB_KEYS.ATIVIDADES) {
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