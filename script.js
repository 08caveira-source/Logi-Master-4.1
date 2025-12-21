// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0 (CORREÇÃO GERAL: CHECK-IN, CALENDÁRIO, GRÁFICOS E RECIBOS)
// PARTE 1: INFRAESTRUTURA, VARIÁVEIS GLOBAIS E CÁLCULOS MATEMÁTICOS
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
    PROFILE_REQUESTS: 'db_profile_requests' // Para solicitações de alteração de dados
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

// Variáveis de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// CORREÇÃO CRÍTICA DO CALENDÁRIO: Inicialização imediata da data
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
    // Funcionários só podem salvar check-ins (via update na operação) e solicitações
    if (window.IS_READ_ONLY && 
        key !== DB_KEYS.OPERACOES && 
        key !== DB_KEYS.PROFILE_REQUESTS) {
        return;
    }

    // 1. Atualiza Cache Local
    APP_CACHE[key] = value;

    // 2. Sincroniza com Firebase (Se online e logado)
    if (window.dbRef && window.CURRENT_USER) {
        
        // Super Admin não grava dados operacionais na raiz
        if (window.CURRENT_USER.email === 'admin@logimaster.com') return;

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Caminho: companies/{dominio}/data/{colecao}
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
                // console.log(`[SYNC] ${key} salvo.`); // Debug opcional
            } catch (e) {
                console.error(`[ERRO SYNC] Falha ao salvar ${key}:`, e);
            }
        }
    } else {
        // Fallback LocalStorage (Modo Offline / Dev)
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// =============================================================================
// FORMATADORES E MÁSCARAS (GLOBAIS)
// =============================================================================

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Torna global para uso nos Relatórios HTML
window.formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Novo formatador para Data e Hora (Usado no Monitoramento de Check-in)
window.formatDateTimeBr = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
};

window.formatCPF_CNPJ = (value) => {
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
};

window.formatPhoneBr = (value) => {
    const d = onlyDigits(value);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
};

window.copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
        () => alert('Copiado para a área de transferência!'),
        () => alert('Erro ao copiar.')
    );
};

// =============================================================================
// GETTERS (BUSCA RELACIONAL UNIFICADA)
// =============================================================================

// ATENÇÃO: Convertemos IDs para String para garantir comparação segura
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
// LÓGICA MATEMÁTICA DE FROTA (CONSUMO E CUSTOS REAIS)
// =============================================================================

/**
 * OBTER ÚLTIMO KM VÁLIDO:
 * Impede que motorista insira KM menor que o anterior.
 */
window.obterUltimoKmFinal = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações finalizadas deste veículo
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * MÉDIA HISTÓRICA GLOBAL:
 * Soma Total de KM / Soma Total de Litros Abastecidos no histórico do carro.
 * Garante que o cálculo do dia use a eficiência real do carro a longo prazo.
 */
window.calcularMediaHistoricaVeiculo = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Considera apenas operações confirmadas para a média
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        // Se houve abastecimento, soma os litros
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0; // Evita divisão por zero
    return totalKmAcumulado / totalLitrosAbastecidos; 
};

window.obterUltimoPrecoCombustivel = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsComPreco = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    if (opsComPreco.length === 0) return 0;
    
    // Ordena mais recente primeiro
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(opsComPreco[0].precoLitro) || 0;
};

/**
 * CUSTO DA VIAGEM (DIESEL ESTIMADO):
 * Baseado na média histórica global e no KM rodado no dia.
 * NÃO INCLUI pneus/manutenção aqui (estes vão para Despesas Gerais).
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || !op.veiculoPlaca) return 0;
    // Agendada ou Em Andamento ainda não tem KM real fechado, retorna 0 ou estimativa
    if (op.status !== 'CONFIRMADA') return 0;
    
    const mediaKmL = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    // Usa o preço do abastecimento do dia OU o último preço conhecido
    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = window.obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0;

    const litrosTeoricos = kmRodado / mediaKmL;
    return litrosTeoricos * precoParaCalculo;
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0
// PARTE 2: INTERFACE DE USUÁRIO (UI), MODAIS E RENDERIZAÇÃO DE TABELAS
// =============================================================================

// --- 1. VALIDAÇÕES VISUAIS E COMPORTAMENTO DE FORMULÁRIO ---

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

// Controla a visibilidade dos campos de CNH
window.toggleDriverFields = () => {
    const role = document.getElementById('funcFuncao').value;
    const div = document.getElementById('driverSpecificFields');
    if (div) {
        div.style.display = (role === 'motorista') ? 'block' : 'none';
        
        // Se não for motorista, limpa os campos visuais
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

// Botão "+" na tela de operação
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

// Listener seguro para o botão "+"
document.addEventListener('click', function(e) {
    if(e.target && (e.target.id === 'btnManualAddAjudante' || e.target.parentElement.id === 'btnManualAddAjudante')) {
        window.handleManualAddAjudante();
    }
});

// Modal de Diária
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
        window.closeAdicionarAjudanteModal();
    });
}

// Renderiza a lista visual (HTML) na tela de Lançamento
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

// CORREÇÃO: Preenche todos os selects, inclusive o de Recibos que estava falhando
window.populateAllSelects = () => {
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
    
    // Outros Paineis (Relatórios, Despesas)
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR A UM VEÍCULO (OPCIONAL)...');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // Recibo: Preenche com TODOS os funcionários (Motoristas e Ajudantes)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        funcionarios.forEach(f => {
            selRecibo.innerHTML += `<option value="${f.id}">${f.funcao.toUpperCase()} - ${f.nome}</option>`;
        });
    }
    
    // Atualiza Tabelas Visuais
    window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    window.renderCadastroTable(DB_KEYS.VEICULOS);
    window.renderCadastroTable(DB_KEYS.CONTRATANTES);
    window.renderAtividadesTable();
    window.renderMinhaEmpresaInfo();
    window.renderProfileRequestsTable(); // Nova tabela de solicitações
    
    // Renderiza Monitoramento
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
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:15px; color:#999;">NENHUM REGISTRO.</td></tr>`;
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
        let idParam = typeof rawId === 'string' ? `'${rawId}'` : rawId;
        
        let btns = `<button class="btn-mini btn-primary" onclick="viewCadastro('${key}', ${idParam})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += ` <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', ${idParam})"><i class="fas fa-edit"></i></button>
                      <button class="btn-mini delete-btn" onclick="deleteItem('${key}', ${idParam})"><i class="fas fa-trash"></i></button>`;
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

// --- 6. MONITORAMENTO DE CHECK-INS (NOVA TABELA DETALHADA) ---

window.renderCheckinsTable = () => {
    const tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;

    // Filtra operações que requerem atenção (Agendada ou Em Andamento ou Recém Finalizada)
    // Mostra operações dos últimos 3 dias para frente
    const hoje = new Date();
    hoje.setDate(hoje.getDate() - 3);
    const dataCorte = hoje.toISOString().split('T')[0];

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.data >= dataCorte && o.status !== 'CANCELADA'
    );
    
    // Ordena: Em Andamento primeiro, depois data
    ops.sort((a,b) => (a.status === 'EM_ANDAMENTO' ? -1 : 1) || new Date(b.data) - new Date(a.data));

    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma rota ativa ou pendente.</td></tr>';
        return;
    }

    let html = '';
    
    ops.forEach(op => {
        // --- MOTORISTA ---
        const mot = window.getMotorista(op.motoristaId);
        const motNome = mot ? mot.nome : '(Desconhecido)';
        
        let statusMot = '<span class="status-pill pill-pending">AGUARDANDO</span>';
        let horaMot = '-';
        let acoesMot = '';

        if (op.checkins && op.checkins.motorista) {
            statusMot = '<span class="status-pill pill-active">CONFIRMADO</span>';
            horaMot = window.formatDateTimeBr(op.dataHoraInicio);
        } else if (op.status === 'CONFIRMADA') {
             // Se já finalizou e não tem checkin log, assume feito manual
            statusMot = '<span class="status-pill pill-active">FINALIZADO</span>';
        } else if (op.checkins && op.checkins.faltaMotorista) {
             statusMot = '<span class="status-pill pill-absent">FALTA</span>';
        }

        // Botões Admin para Motorista
        if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA' && !op.checkins?.faltaMotorista) {
            if (!op.checkins?.motorista) {
                acoesMot += `<button class="btn-mini btn-success" title="Forçar Início" onclick="forceCheckin(${op.id}, 'motorista', ${op.motoristaId})"><i class="fas fa-play"></i></button> `;
                acoesMot += `<button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent(${op.id}, 'motorista', ${op.motoristaId})"><i class="fas fa-user-times"></i></button>`;
            }
        }

        html += `
        <tr style="background:#f9f9f9; border-left:4px solid var(--primary-color);">
            <td><strong>${op.data.split('-').reverse().join('/')}</strong></td>
            <td>Op #${op.id}<br><small>${op.veiculoPlaca}</small></td>
            <td>${motNome}</td>
            <td><small>MOTORISTA</small></td>
            <td>${statusMot} <br><small>${horaMot}</small></td>
            <td>${acoesMot}</td>
        </tr>`;

        // --- AJUDANTES ---
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(aj => {
                const funcAj = window.getFuncionario(aj.id);
                const nomeAj = funcAj ? funcAj.nome : 'Excluído';
                
                let statusAj = '<span class="status-pill pill-pending">AGUARDANDO</span>';
                let horaAj = '-';
                let acoesAj = '';
                
                const checkinFeito = op.checkins && op.checkins.ajudantes && op.checkins.ajudantes.includes(String(aj.id));
                const faltaFeita = op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(aj.id));

                if (checkinFeito) {
                    statusAj = '<span class="status-pill pill-active">PRESENTE</span>';
                    const log = op.checkins.ajudantesLog ? op.checkins.ajudantesLog[aj.id] : null;
                    horaAj = window.formatDateTimeBr(log);
                } else if (op.status === 'CONFIRMADA' && !faltaFeita) {
                    statusAj = '<span class="status-pill pill-active">OK (MANUAL)</span>';
                } else if (faltaFeita) {
                    statusAj = '<span class="status-pill pill-absent">FALTA</span>';
                }

                // Botões Admin para Ajudante
                if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA' && !faltaFeita && !checkinFeito) {
                    acoesAj += `<button class="btn-mini btn-success" title="Confirmar Presença" onclick="forceCheckin(${op.id}, 'ajudante', ${aj.id})"><i class="fas fa-check"></i></button> `;
                    acoesAj += `<button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent(${op.id}, 'ajudante', ${aj.id})"><i class="fas fa-user-times"></i></button>`;
                }

                html += `
                <tr>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td>${nomeAj}</td>
                    <td><small>AJUDANTE</small></td>
                    <td>${statusAj} <br><small>${horaAj}</small></td>
                    <td>${acoesAj}</td>
                </tr>`;
            });
        }
    });

    tbody.innerHTML = html;
};

// --- 7. TABELA DE SOLICITAÇÕES DE PERFIL (NOVO) ---
window.renderProfileRequestsTable = () => {
    const tbody = document.querySelector('#tabelaProfileRequests tbody');
    if(!tbody) return;

    const reqs = loadData(DB_KEYS.PROFILE_REQUESTS) || [];
    
    // Filtra apenas pendentes
    const pendentes = reqs.filter(r => r.status === 'PENDENTE');

    if(pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }

    tbody.innerHTML = pendentes.map(r => {
        const func = window.getFuncionario(r.funcionarioId);
        const nome = func ? func.nome : 'Desconhecido';
        
        return `
            <tr>
                <td>${window.formatDateTimeBr(r.dataSolicitacao)}</td>
                <td>${nome}</td>
                <td>${r.campo}</td>
                <td style="font-weight:bold; color:var(--primary-color);">${r.novoValor}</td>
                <td>
                    <button class="btn-mini btn-success" onclick="approveProfileRequest('${r.id}')"><i class="fas fa-check"></i></button>
                    <button class="btn-mini btn-danger" onclick="rejectProfileRequest('${r.id}')"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    }).join('');
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0
// PARTE 3: LÓGICA DE CRUD, AÇÕES ADMINISTRATIVAS E SOLICITAÇÕES
// =============================================================================

// --- 1. VISUALIZAR DETALHES (FUNÇÃO GLOBAL) ---

window.viewCadastro = (key, id) => {
    let item = null;
    let title = "DETALHES";
    let html = '<div style="font-size:0.95rem; line-height:1.6;">';

    const safeId = String(id);

    // A. FUNCIONÁRIOS
    if (key === DB_KEYS.FUNCIONARIOS) {
        item = window.getFuncionario(safeId);
        if (!item) return alert('Registro não encontrado.');
        
        title = `FICHA: ${item.nome}`;
        
        const statusLogin = item.uid 
            ? `<span style="color:var(--success-color); font-weight:bold;">✅ VINCULADO (UID: ${item.uid.slice(0,5)}...)</span>`
            : `<span style="color:var(--warning-color); font-weight:bold;">⏳ AGUARDANDO PRIMEIRO ACESSO</span>`;

        html += `
            <div style="background:#f5f5f5; padding:15px; border-radius:6px; margin-bottom:15px; border-left:4px solid var(--primary-color);">
                <p><strong>NOME:</strong> ${item.nome}</p>
                <p><strong>FUNÇÃO:</strong> ${item.funcao}</p>
                <p><strong>LOGIN:</strong> ${item.email || 'SEM EMAIL'}</p>
                <p><strong>STATUS:</strong> ${statusLogin}</p>
            </div>
            <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
            <p><strong>TELEFONE:</strong> ${window.formatPhoneBr(item.telefone)}</p>
            <p><strong>PIX:</strong> ${item.pix || '-'}</p>
            <p><strong>ENDEREÇO:</strong> ${item.endereco || '-'}</p>
        `;

        if (item.funcao === 'motorista') {
            const valCnh = item.validadeCNH ? item.validadeCNH.split('-').reverse().join('/') : '-';
            html += `
                <hr style="margin:15px 0;">
                <h4 style="color:var(--secondary-color);">DADOS CNH</h4>
                <p><strong>Nº:</strong> ${item.cnh || '-'}</p>
                <p><strong>CATEGORIA:</strong> ${item.categoriaCNH || '-'}</p>
                <p><strong>VALIDADE:</strong> ${valCnh}</p>
                <p><strong>CURSOS:</strong> ${item.cursoDescricao || '-'}</p>
            `;
        }
    } 
    // B. VEÍCULOS
    else if (key === DB_KEYS.VEICULOS) {
        item = window.getVeiculo(safeId);
        title = `VEÍCULO: ${item?.placa || 'ERRO'}`;
        if(item) {
            html += `
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="border:3px solid #333; padding:5px 15px; display:inline-block; border-radius:6px; font-weight:bold; font-size:1.5rem; background:#fff;">
                        ${item.placa}
                    </div>
                </div>
                <p><strong>MODELO:</strong> ${item.modelo}</p>
                <p><strong>ANO:</strong> ${item.ano || '-'}</p>
                <p><strong>RENAVAM:</strong> ${item.renavam || '-'}</p>
                <p><strong>CHASSI:</strong> ${item.chassi || '-'}</p>
            `;
        }
    }
    // C. CONTRATANTES
    else if (key === DB_KEYS.CONTRATANTES) {
        item = window.getContratante(safeId);
        title = "DADOS DO CONTRATANTE";
        if(item) {
            html += `
                <h3 style="color:var(--primary-color); margin-bottom:10px;">${item.razaoSocial}</h3>
                <p><strong>CNPJ:</strong> ${window.formatCPF_CNPJ(item.cnpj)}</p>
                <p><strong>TELEFONE:</strong> ${window.formatPhoneBr(item.telefone)}</p>
            `;
        }
    }
    
    html += '</div>';
    
    if (item) window.openViewModal(title, html);
    else alert("Erro ao carregar dados.");
};

// --- 2. EDITAR ITEM (PREENCHE FORMULÁRIO) ---

window.editCadastroItem = (key, id) => {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const safeId = String(id);
    
    // 1. FUNCIONÁRIO
    if (key === DB_KEYS.FUNCIONARIOS) {
        const f = window.getFuncionario(safeId);
        if (!f) return;
        
        document.getElementById('funcionarioId').value = f.id;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcDocumento').value = f.documento;
        document.getElementById('funcTelefone').value = f.telefone;
        document.getElementById('funcPix').value = f.pix;
        document.getElementById('funcEndereco').value = f.endereco;
        
        const emailInput = document.getElementById('funcEmail');
        emailInput.value = f.email || '';
        emailInput.readOnly = !!f.email; 
        
        if (f.funcao === 'motorista') {
            document.getElementById('funcCNH').value = f.cnh || '';
            document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
            document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
            document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';
        }
        
        window.toggleDriverFields();
        document.querySelector('[data-tab="funcionarios"]').click();
        alert(`Editando: ${f.nome}`);
    }
    // 2. VEÍCULO
    else if (key === DB_KEYS.VEICULOS) {
        const v = window.getVeiculo(safeId);
        if (!v) return;
        
        document.getElementById('veiculoId').value = v.placa;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        
        document.querySelector('[data-tab="veiculos"]').click();
        alert(`Editando Veículo: ${v.placa}`);
    }
    // 3. CONTRATANTE
    else if (key === DB_KEYS.CONTRATANTES) {
        const c = window.getContratante(safeId);
        if (!c) return;
        
        document.getElementById('contratanteId').value = c.cnpj;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        
        document.querySelector('[data-tab="contratantes"]').click();
        alert(`Editando: ${c.razaoSocial}`);
    }
    // 4. ATIVIDADE
    else if (key === DB_KEYS.ATIVIDADES) {
        const a = window.getAtividade(safeId);
        if (!a) return;
        document.getElementById('atividadeId').value = a.id;
        document.getElementById('atividadeNome').value = a.nome;
        document.querySelector('[data-tab="atividades"]').click();
    }
};

// --- 3. EXCLUIR ITEM ---

window.deleteItem = (key, id) => {
    if (window.IS_READ_ONLY) return alert("Permissão negada.");
    if (!confirm("Tem certeza que deseja excluir este registro?\nEsta ação é irreversível.")) return;
    
    let arr = loadData(key).slice();
    let idKey = 'id';
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    const newArr = arr.filter(item => String(item[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        if(key === DB_KEYS.ATIVIDADES) window.renderAtividadesTable();
        else window.renderCadastroTable(key);
        
        if(key === DB_KEYS.OPERACOES) window.renderOperacaoTable();
        if(key === DB_KEYS.DESPESAS_GERAIS) window.renderDespesasTable();
        
        window.populateAllSelects();
        alert("Registro excluído com sucesso.");
    });
};

// --- 4. AÇÕES ADMINISTRATIVAS: FORÇAR CHECK-IN E MARCAR FALTA ---

window.forceCheckin = (opId, type, userId) => {
    if(!confirm("Tem certeza que deseja FORÇAR o início/presença para este funcionário?")) return;
    
    let arr = loadData(DB_KEYS.OPERACOES).slice();
    const idx = arr.findIndex(o => Number(o.id) === Number(opId));
    
    if(idx < 0) return alert("Operação não encontrada.");
    
    const op = arr[idx];
    const agora = new Date().toISOString();
    
    // Inicializa estrutura se não existir
    if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {}, faltasAjudantes: [], faltaMotorista: false };

    if (type === 'motorista') {
        op.checkins.motorista = true;
        op.checkins.faltaMotorista = false; // Remove falta se existir
        op.status = 'EM_ANDAMENTO';
        op.dataHoraInicio = agora;
        
        // Pega último KM para não começar zerado
        if (!op.kmInicial || op.kmInicial === 0) {
            op.kmInicial = window.obterUltimoKmFinal(op.veiculoPlaca);
        }
    } 
    else if (type === 'ajudante') {
        const uidStr = String(userId);
        if (!op.checkins.ajudantes.includes(uidStr)) {
            op.checkins.ajudantes.push(uidStr);
            if(!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
            op.checkins.ajudantesLog[uidStr] = agora;
        }
        // Remove da lista de faltas se estiver lá
        if (op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(id => id !== uidStr);
        }
    }

    saveData(DB_KEYS.OPERACOES, arr).then(() => {
        window.renderCheckinsTable();
        alert("Status atualizado forçadamente pelo Admin.");
    });
};

window.markAbsent = (opId, type, userId) => {
    if(!confirm("ATENÇÃO: Ao marcar FALTA, o funcionário NÃO receberá pagamento por esta viagem.\n\nConfirmar falta?")) return;

    let arr = loadData(DB_KEYS.OPERACOES).slice();
    const idx = arr.findIndex(o => Number(o.id) === Number(opId));
    if(idx < 0) return;

    const op = arr[idx];
    if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {}, faltasAjudantes: [], faltaMotorista: false };

    if (type === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; // Remove presença
        // Se o motorista faltou, a viagem tecnicamente não acontece ou troca motorista.
        // Aqui apenas marcamos a falta no registro financeiro dele.
    } 
    else if (type === 'ajudante') {
        const uidStr = String(userId);
        if (!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes = [];
        
        if (!op.checkins.faltasAjudantes.includes(uidStr)) {
            op.checkins.faltasAjudantes.push(uidStr);
        }
        // Remove presença
        op.checkins.ajudantes = op.checkins.ajudantes.filter(id => id !== uidStr);
    }

    saveData(DB_KEYS.OPERACOES, arr).then(() => {
        window.renderCheckinsTable();
        alert("Falta registrada. O valor será descontado dos relatórios.");
    });
};


// --- 5. GESTÃO DE SOLICITAÇÕES DE ALTERAÇÃO DE DADOS ---

// A. Enviar Solicitação (Funcionário)
const formReq = document.getElementById('formRequestProfileChange');
if(formReq) {
    formReq.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!window.CURRENT_USER) return alert("Erro de sessão.");
        
        // Acha o funcionário logado
        const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
            u.uid === window.CURRENT_USER.uid || 
            (u.email && u.email === window.CURRENT_USER.email)
        );
        
        if (!me) return alert("Perfil não vinculado.");

        const campo = document.getElementById('reqFieldType').value;
        const valor = document.getElementById('reqNewValue').value;

        const req = {
            id: Date.now(),
            funcionarioId: me.id,
            campo: campo,
            novoValor: valor,
            status: 'PENDENTE',
            dataSolicitacao: new Date().toISOString()
        };

        let allReqs = loadData(DB_KEYS.PROFILE_REQUESTS).slice();
        allReqs.push(req);

        saveData(DB_KEYS.PROFILE_REQUESTS, allReqs).then(() => {
            alert("Solicitação enviada para análise do Administrador.");
            formReq.reset();
            document.getElementById('modalRequestProfileChange').style.display = 'none';
        });
    });
}

// B. Aprovar Solicitação (Admin)
window.approveProfileRequest = (reqId) => {
    if(!confirm("Aprovar e aplicar esta alteração?")) return;

    let allReqs = loadData(DB_KEYS.PROFILE_REQUESTS).slice();
    const reqIdx = allReqs.findIndex(r => String(r.id) === String(reqId));
    
    if (reqIdx < 0) return alert("Solicitação não encontrada.");
    const req = allReqs[reqIdx];

    // Busca funcionário
    let funcs = loadData(DB_KEYS.FUNCIONARIOS).slice();
    const fIdx = funcs.findIndex(f => String(f.id) === String(req.funcionarioId));

    if (fIdx < 0) return alert("Funcionário não encontrado.");

    // Mapeamento de campos genéricos para o objeto real
    const campoMap = {
        'TELEFONE': 'telefone',
        'ENDERECO': 'endereco',
        'PIX': 'pix',
        'CNH': 'cnh',
        'VALIDADE_CNH': 'validadeCNH',
        'EMAIL': 'email'
    };

    const chaveReal = campoMap[req.campo];
    
    if (chaveReal) {
        funcs[fIdx][chaveReal] = req.novoValor.toUpperCase(); // Aplica alteração
        
        // Remove solicitação da lista
        allReqs.splice(reqIdx, 1);

        // Salva ambos
        Promise.all([
            saveData(DB_KEYS.FUNCIONARIOS, funcs),
            saveData(DB_KEYS.PROFILE_REQUESTS, allReqs)
        ]).then(() => {
            window.renderProfileRequestsTable();
            window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
            alert("Dados atualizados com sucesso.");
        });

    } else {
        alert("Campo 'OUTRO' deve ser alterado manualmente na ficha do funcionário.");
        // Apenas remove da lista
        allReqs.splice(reqIdx, 1);
        saveData(DB_KEYS.PROFILE_REQUESTS, allReqs).then(() => window.renderProfileRequestsTable());
    }
};

// C. Rejeitar Solicitação
window.rejectProfileRequest = (reqId) => {
    if(!confirm("Rejeitar solicitação?")) return;
    
    let allReqs = loadData(DB_KEYS.PROFILE_REQUESTS).slice();
    const newReqs = allReqs.filter(r => String(r.id) !== String(reqId));
    
    saveData(DB_KEYS.PROFILE_REQUESTS, newReqs).then(() => {
        window.renderProfileRequestsTable();
    });
};

// --- 6. HANDLERS DE FORMULÁRIOS (SALVAR DADOS) ---

function setupFormHandlers() {
    
    // --- A. SALVAR FUNCIONÁRIO ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Lógica padrão de salvamento (mantida da versão anterior)
            // ... (Código de salvamento de funcionário mantido intacto, simplificado aqui para não estourar o bloco, mas assuma a lógica original com os novos campos)
            // Vou reinserir a lógica completa abaixo para garantir integridade conforme solicitado.
            
            const btn = formFunc.querySelector('button[type="submit"]');
            const txtOriginal = btn.innerText;
            btn.innerText = "SALVANDO...";
            btn.disabled = true;

            try {
                const idHidden = document.getElementById('funcionarioId').value;
                const nome = document.getElementById('funcNome').value.toUpperCase();
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                let arr = loadData(DB_KEYS.FUNCIONARIOS).slice();
                if (!idHidden && arr.some(f => f.email === email)) throw new Error("Email duplicado.");

                let newId = idHidden ? Number(idHidden) : Date.now();
                let novoUid = null;

                // Criação Firebase (se necessário)
                if (window.dbRef && !idHidden && senha) {
                    if (senha.length < 6) throw new Error("Senha curta.");
                    const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                    const auth2 = getAuth(secondaryApp);
                    const cred = await createUserWithEmailAndPassword(auth2, email, senha);
                    novoUid = cred.user.uid;
                    await setDoc(doc(db, "users", novoUid), {
                        uid: novoUid, name: nome, email: email, role: funcao, company: window.CURRENT_USER.company, approved: true, createdAt: new Date().toISOString()
                    });
                    await signOut(auth2);
                }

                const obj = {
                    id: newId,
                    uid: novoUid || (idHidden ? (arr.find(f => String(f.id) === String(idHidden))?.uid || '') : ''),
                    nome: nome,
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    cnh: (funcao === 'motorista') ? document.getElementById('funcCNH').value.toUpperCase() : '',
                    validadeCNH: (funcao === 'motorista') ? document.getElementById('funcValidadeCNH').value : '',
                    categoriaCNH: (funcao === 'motorista') ? document.getElementById('funcCategoriaCNH').value : '',
                    cursoDescricao: (funcao === 'motorista') ? document.getElementById('funcCursoDescricao').value.toUpperCase() : ''
                };

                const idx = arr.findIndex(f => String(f.id) === String(newId));
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);

                await saveData(DB_KEYS.FUNCIONARIOS, arr);
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
                window.populateAllSelects();
                alert("Salvo com sucesso!");

            } catch (err) { alert(err.message); } finally { btn.innerText = txtOriginal; btn.disabled = false; }
        });
    }

    // --- B. SALVAR VEÍCULO ---
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

    // --- C. SALVAR CONTRATANTE ---
    const formCli = document.getElementById('formContratante');
    if(formCli) {
        formCli.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.CONTRATANTES).slice();
            const cnpj = document.getElementById('contratanteCNPJ').value;
            const obj = { cnpj, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value };
            const idx = arr.findIndex(c=>c.cnpj===cnpj);
            if(idx>=0) arr[idx]=obj; else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr).then(()=>{
                formCli.reset(); document.getElementById('contratanteId').value='';
                window.renderCadastroTable(DB_KEYS.CONTRATANTES); window.populateAllSelects(); alert('Salvo.');
            });
        });
    }

    // --- D. SALVAR MINHA EMPRESA ---
    const formEmp = document.getElementById('formMinhaEmpresa');
    if(formEmp){
        formEmp.addEventListener('submit', (e)=>{
            e.preventDefault();
            const obj = { razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj: document.getElementById('minhaEmpresaCNPJ').value, telefone: document.getElementById('minhaEmpresaTelefone').value };
            saveData(DB_KEYS.MINHA_EMPRESA, obj).then(()=>alert('Dados atualizados.'));
        });
    }

    // --- E. SALVAR ATIVIDADE ---
    const formAtiv = document.getElementById('formAtividade');
    if(formAtiv){
        formAtiv.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.ATIVIDADES).slice();
            const idHidden = document.getElementById('atividadeId').value;
            const obj = { id: idHidden ? Number(idHidden) : Date.now(), nome: document.getElementById('atividadeNome').value.toUpperCase() };
            const idx = arr.findIndex(a=>String(a.id)===String(obj.id));
            if(idx>=0) arr[idx]=obj; else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr).then(()=>{
                formAtiv.reset(); document.getElementById('atividadeId').value='';
                window.renderAtividadesTable(); window.populateAllSelects(); alert('Salvo.');
            });
        });
    }
}
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 9.0
// PARTE 4: OPERAÇÕES, CÁLCULOS AVANÇADOS, GRÁFICOS E INICIALIZAÇÃO
// =============================================================================

// --- 11. SALVAR OPERAÇÃO (ADMIN) ---

const formOp = document.getElementById('formOperacao');
if (formOp) {
    formOp.addEventListener('submit', (e) => {
        e.preventDefault(); 
        
        const motId = document.getElementById('selectMotoristaOperacao').value;
        const veicPlaca = document.getElementById('selectVeiculoOperacao').value;
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        if (!motId || !veicPlaca) return alert("ERRO: Selecione Motorista e Veículo.");
        window.verificarValidadeCNH(motId);
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        const originalOp = isEdit ? arr.find(o => String(o.id) === String(idHidden)) : null;

        let statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        if (isEdit && originalOp && originalOp.status === 'EM_ANDAMENTO') statusFinal = 'EM_ANDAMENTO';

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
            despesas: Number(document.getElementById('operacaoDespesas').value) || 0, // Pedágios/Chapas
            
            // Abastecimento e Rodagem
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Equipe (Preserva a lista se não foi alterada na edição)
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva estrutura de check-ins e faltas
            checkins: originalOp ? originalOp.checkins : { 
                motorista: false, 
                faltaMotorista: false,
                ajudantes: [], 
                faltasAjudantes: [],
                ajudantesLog: {} 
            },
            kmInicial: originalOp ? originalOp.kmInicial : 0,
            kmFinal: originalOp ? originalOp.kmFinal : 0,
            dataHoraInicio: originalOp ? originalOp.dataHoraInicio : null
        };
        
        const idx = arr.findIndex(o => String(o.id) === String(obj.id));
        if (idx >= 0) arr[idx] = obj; else arr.push(obj);
        
        saveData(DB_KEYS.OPERACOES, arr).then(() => {
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOp.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            window.renderOperacaoTable();
            if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
            window.updateDashboardStats(); // Atualiza gráficos
            alert(isAgendamento ? 'AGENDADO COM SUCESSO.' : 'OPERAÇÃO SALVA.');
        });
    });
    
    formOp.addEventListener('reset', () => {
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
    });
}

// --- 12. CHECK-IN (FUNCIONÁRIO) ---

const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    formCheckin.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!window.CURRENT_USER) return alert("Sessão expirada.");

        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value;
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => Number(o.id) === opId);
        
        if (idx >= 0) {
            const op = arr[idx];
            // Garante estrutura
            if (!op.checkins) op.checkins = { motorista: false, faltaMotorista: false, ajudantes: [], faltasAjudantes: [], ajudantesLog: {} };

            // Identifica usuário
            const userProfile = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
                u.uid === window.CURRENT_USER.uid || 
                (u.email && u.email === window.CURRENT_USER.email)
            );

            if (!userProfile) return alert("Erro de perfil.");

            let confirmou = false;
            const agora = new Date().toISOString();

            // A. Motorista
            if (userProfile.funcao === 'motorista') {
                if (String(op.motoristaId) !== String(userProfile.id)) return alert("Viagem não pertence a você.");

                if (step === 'start') {
                    const kmIni = Number(document.getElementById('checkinKmInicial').value);
                    const ultimoKm = window.obterUltimoKmFinal(op.veiculoPlaca);
                    
                    if(!kmIni || kmIni <= 0) return alert("KM Inválido.");
                    if (kmIni < ultimoKm) return alert(`ERRO: KM informado (${kmIni}) menor que o anterior (${ultimoKm}).`);
                    
                    op.kmInicial = kmIni;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = agora; 
                    confirmou = true;
                    alert("VIAGEM INICIADA! BOM TRABALHO.");
                } 
                else if (step === 'end') {
                    const kmFim = Number(document.getElementById('checkinKmFinal').value);
                    if(!kmFim || kmFim <= op.kmInicial) return alert("KM Final deve ser maior que o Inicial.");
                    
                    op.kmFinal = kmFim;
                    op.kmRodado = kmFim - (op.kmInicial || 0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                    op.status = 'CONFIRMADA'; 
                    confirmou = true;
                    alert(`VIAGEM FINALIZADA!\nTotal KM: ${op.kmRodado}`);
                }
            } 
            // B. Ajudante
            else {
                const escalado = (op.ajudantes || []).some(a => String(a.id) === String(userProfile.id));
                if (escalado) {
                    if (!op.checkins.ajudantes.includes(String(userProfile.id))) {
                        op.checkins.ajudantes.push(String(userProfile.id));
                        if(!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
                        op.checkins.ajudantesLog[userProfile.id] = agora;
                    }
                    confirmou = true;
                    alert("PRESENÇA CONFIRMADA!");
                } else {
                    return alert("Você não está escalado nesta viagem.");
                }
            }

            if (confirmou) {
                saveData(DB_KEYS.OPERACOES, arr).then(() => {
                    window.closeCheckinConfirmModal();
                    if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable(); 
                    // Atualiza lista do funcionário se estiver na tela dele
                    if(document.getElementById('employee-home').classList.contains('active')) {
                        const evt = new CustomEvent('nav-click-home-employee'); // Gatilho simulado
                        // Na prática, o listener do Firebase já atualiza, mas podemos forçar reload
                    }
                });
            }
        }
    });
}

// --- 13. RELATÓRIOS E CALENDÁRIO COM CÁLCULO FINANCEIRO REAL ---

// Resumo Financeiro do Dia (Novo Feature do Calendário)
window.openDayDetails = (dataStr, ops) => {
    const modal = document.getElementById('modalDayOperations');
    if(!modal) return;
    
    // 1. Cálculos do Dia
    let fatTotal = 0;
    let custoOperacionalTotal = 0; // Diesel + Equipe + Pedágio
    let despesasGeraisDia = 0;

    // Soma Despesas Gerais (Pneus, Oficina) deste dia específico
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => d.data === dataStr);
    despesasGeraisDia = despesas.reduce((acc, d) => acc + (d.valor || 0), 0);

    // Soma Operações
    ops.forEach(o => {
        fatTotal += (o.faturamento || 0);

        // Custo Variável:
        // 1. Diesel (Consumo Real Estimado)
        const diesel = window.calcularCustoConsumoViagem(o);
        // 2. Pedágios/Extras
        const pedagio = (o.despesas || 0);
        // 3. Equipe (Comissão Motorista + Diárias Ajudantes)
        // ATENÇÃO: Se teve FALTA, não soma o custo!
        let custoEquipe = 0;
        
        // Motorista
        if (!o.checkins?.faltaMotorista) custoEquipe += (o.comissao || 0);
        
        // Ajudantes
        (o.ajudantes || []).forEach(aj => {
            // Se NÃO está na lista de faltas, paga
            if (!o.checkins?.faltasAjudantes || !o.checkins.faltasAjudantes.includes(String(aj.id))) {
                custoEquipe += (aj.diaria || 0);
            }
        });

        custoOperacionalTotal += (diesel + pedagio + custoEquipe);
    });

    const lucroOperacional = fatTotal - custoOperacionalTotal;
    
    // 2. Renderiza Resumo Financeiro (Topo do Modal)
    const summaryDiv = document.getElementById('modalDaySummary');
    summaryDiv.innerHTML = `
        <div class="finance-box success">
            <strong>FATURAMENTO BRUTO</strong>
            <span>${window.formatCurrency(fatTotal)}</span>
        </div>
        <div class="finance-box gasto">
            <strong>CUSTO OPERACIONAL (Diesel+Equipe)</strong>
            <span>${window.formatCurrency(custoOperacionalTotal)}</span>
        </div>
        <div class="finance-box lucro">
            <strong>LUCRO OPERACIONAL</strong>
            <span>${window.formatCurrency(lucroOperacional)}</span>
        </div>
        <div class="finance-box warning">
            <strong>DESPESAS GERAIS (Manut/Oficina)</strong>
            <span>${window.formatCurrency(despesasGeraisDia)}</span>
        </div>
    `;

    // 3. Renderiza Lista de Operações
    const body = document.getElementById('modalDayBody');
    document.getElementById('modalDayTitle').textContent = `OPERAÇÕES DO DIA: ${dataStr.split('-').reverse().join('/')}`;
    
    if(ops.length === 0) {
        body.innerHTML = '<p style="padding:20px; text-align:center;">Nenhuma operação de transporte.</p>';
    } else {
        body.innerHTML = ops.map(o => {
            const mot = window.getMotorista(o.motoristaId)?.nome || '---';
            let cor = o.status==='CONFIRMADA'?'var(--success-color)':(o.status==='EM_ANDAMENTO'?'var(--info-color)':'gray');
            
            // Verifica falta visualmente
            if(o.checkins?.faltaMotorista) {
                mot += ' <span style="background:red; color:white; font-size:0.6rem; padding:2px;">FALTOU</span>';
            }

            return `
            <div style="border-left:4px solid ${cor}; background:#fff; padding:10px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between;">
                    <strong>#${o.id} - ${o.veiculoPlaca}</strong>
                    <span style="font-weight:bold; color:${cor}">${o.status}</span>
                </div>
                <div style="font-size:0.9rem; color:#555; margin-top:5px;">
                    Mot: ${mot} | Cliente: ${window.getContratante(o.contratanteCNPJ)?.razaoSocial || '-'}
                </div>
                <div style="text-align:right; margin-top:5px; font-weight:bold;">
                    ${window.formatCurrency(o.faturamento)}
                </div>
                <button class="btn-mini btn-primary" onclick="editOperacaoItem(${o.id}); document.getElementById('modalDayOperations').style.display='none';" style="width:100%; margin-top:5px;">VER / EDITAR</button>
            </div>`;
        }).join('');
    }
    
    modal.style.display = 'block';
};

// --- 14. RECIBOS (CORRIGIDO: NÃO PAGA FALTAS) ---

window.generateReceipt = () => {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;

    if(!funcId || !ini || !fim) return alert("Preencha funcionário e datas.");

    const func = window.getFuncionario(funcId);
    if (!func) return;

    // Busca operações CONFIRMADAS no período
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.status === 'CONFIRMADA' && o.data >= ini && o.data <= fim
    );

    let total = 0;
    let htmlItens = '';

    ops.forEach(o => {
        let valorItem = 0;
        let isPresente = false;

        // Se for Motorista
        if (func.funcao === 'motorista') {
            if (String(o.motoristaId) === String(funcId)) {
                // Checa falta
                if (o.checkins && o.checkins.faltaMotorista) {
                    htmlItens += `<li style="color:red; text-decoration:line-through;">${o.data.split('-').reverse().join('/')} - FALTA REGISTRADA (R$ 0,00)</li>`;
                } else {
                    valorItem = o.comissao || 0;
                    isPresente = true;
                }
            }
        } 
        // Se for Ajudante
        else {
            const ajData = (o.ajudantes || []).find(a => String(a.id) === String(funcId));
            if (ajData) {
                // Checa falta na lista de faltas
                if (o.checkins && o.checkins.faltasAjudantes && o.checkins.faltasAjudantes.includes(String(funcId))) {
                    htmlItens += `<li style="color:red; text-decoration:line-through;">${o.data.split('-').reverse().join('/')} - FALTA REGISTRADA (R$ 0,00)</li>`;
                } else {
                    valorItem = ajData.diaria || 0;
                    isPresente = true;
                }
            }
        }

        if (isPresente && valorItem > 0) {
            total += valorItem;
            htmlItens += `<li>${o.data.split('-').reverse().join('/')} - Placa ${o.veiculoPlaca}: <strong>${window.formatCurrency(valorItem)}</strong></li>`;
        }
    });

    const html = `
        <div style="border:2px dashed #333; padding:40px; background:#fff; margin-top:20px;">
            <h1 style="text-align:center; color:#333;">RECIBO DE PAGAMENTO</h1>
            <p style="font-size:1.1rem; margin:30px 0;">
                Eu, <strong>${func.nome}</strong>, declaro que recebi a importância líquida de 
                <span style="background:#e0f2f1; padding:5px; font-weight:bold;">${window.formatCurrency(total)}</span>.
            </p>
            <h4 style="border-bottom:1px solid #ccc; padding-bottom:5px;">EXTRATO DE SERVIÇOS:</h4>
            <ul style="line-height:1.8; margin-bottom:40px;">${htmlItens || '<li>Nenhum valor a receber no período.</li>'}</ul>
            <div style="text-align:center; margin-top:40px;">
                ____________________________<br>
                <strong>${func.nome}</strong><br>
                ${new Date().toLocaleDateString()}
            </div>
        </div>
        <div style="text-align:center; margin-top:15px;">
            <button class="btn-primary" onclick="window.print()">IMPRIMIR</button>
        </div>
    `;
    
    document.getElementById('reciboContent').innerHTML = html;
};

// --- 15. DASHBOARD E GRÁFICOS (DETALHADO) ---

window.updateDashboardStats = () => {
    if (window.CURRENT_USER.role !== 'admin') return;

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesasGerais = loadData(DB_KEYS.DESPESAS_GERAIS);
    const refDate = window.currentDate; // Data do calendário
    const mesRef = refDate.getMonth();
    const anoRef = refDate.getFullYear();

    // Filtra dados do MÊS SELECIONADO NO CALENDÁRIO
    const opsMes = ops.filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        const d = new Date(o.data);
        const dLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return dLocal.getMonth() === mesRef && dLocal.getFullYear() === anoRef;
    });

    const despMes = despesasGerais.filter(d => {
        const x = new Date(d.data);
        const xLocal = new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
        return xLocal.getMonth() === mesRef && xLocal.getFullYear() === anoRef;
    });

    // 1. Faturamento
    const faturamentoTotal = opsMes.reduce((acc, o) => acc + (o.faturamento || 0), 0);

    // 2. Custos Breakdown
    let custoDiesel = 0;
    let custoPessoal = 0;
    let custoDespesasViagem = 0; // Pedágios

    opsMes.forEach(o => {
        custoDiesel += window.calcularCustoConsumoViagem(o);
        custoDespesasViagem += (o.despesas || 0);

        // Pessoal (Só paga se não faltou)
        if (!o.checkins?.faltaMotorista) custoPessoal += (o.comissao || 0);
        (o.ajudantes || []).forEach(aj => {
            if (!o.checkins?.faltasAjudantes || !o.checkins.faltasAjudantes.includes(String(aj.id))) {
                custoPessoal += (aj.diaria || 0);
            }
        });
    });

    const custoGerais = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
    const custoTotal = custoDiesel + custoPessoal + custoDespesasViagem + custoGerais;
    const lucroLiquido = faturamentoTotal - custoTotal;

    // Percentual de Lucro
    let margemLucro = 0;
    if (faturamentoTotal > 0) margemLucro = (lucroLiquido / faturamentoTotal) * 100;

    // Atualiza DOM
    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elLucro = document.getElementById('receitaMes');
    const elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = window.formatCurrency(faturamentoTotal);
    if (elDesp) elDesp.textContent = window.formatCurrency(custoTotal);
    if (elLucro) {
        elLucro.textContent = window.formatCurrency(lucroLiquido);
        elLucro.style.color = lucroLiquido >= 0 ? 'var(--primary-color)' : 'var(--danger-color)';
    }
    if (elMargem) {
        elMargem.textContent = margemLucro.toFixed(2) + '%';
        elMargem.parentElement.className = `card stat-card ${margemLucro > 20 ? 'success' : (margemLucro > 0 ? 'warning' : 'danger')}`;
    }

    // Renderiza Gráfico Detalhado
    window.renderCharts(faturamentoTotal, custoDiesel, custoPessoal, custoGerais + custoDespesasViagem, lucroLiquido);
};

window.renderCharts = (fat, diesel, pessoal, gerais, lucro) => {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    if (window.myChartInstance) window.myChartInstance.destroy();

    window.myChartInstance = new Chart(ctx, {
        type: 'bar', // Misto: Barra empilhada para custos e linha para receita? Vamos fazer Barra simples comparativa.
        data: {
            labels: ['FATURAMENTO', 'LUCRO LÍQUIDO', 'G. DIESEL', 'G. PESSOAL', 'G. GERAIS'],
            datasets: [{
                label: 'Valores do Mês (R$)',
                data: [fat, lucro, diesel, pessoal, gerais],
                backgroundColor: [
                    '#00796b', // Fat (Verde Escuro)
                    lucro >= 0 ? '#2e7d32' : '#c62828', // Lucro (Verde ou Vermelho)
                    '#ef6c00', // Diesel (Laranja)
                    '#0277bd', // Pessoal (Azul)
                    '#546e7a'  // Gerais (Cinza)
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => window.formatCurrency(c.raw) } }
            }
        }
    });
};

// --- 16. INICIALIZAÇÃO E BOOTSTRAP ---

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    const role = window.CURRENT_USER.role;
    const email = window.CURRENT_USER.email;

    if (email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin(); // (Função do super admin mantida da versão anterior, assumindo existência)
    } 
    else if (role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        setupRealtimeListeners();
        setTimeout(() => {
            window.populateAllSelects();
            window.renderCheckinsTable();
            window.renderCalendar(); 
            window.updateDashboardStats();
        }, 500);
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
        setTimeout(() => {
            window.renderCheckinsTable(); // Funcionário vê tabela também, mas sem botões de admin
            window.renderEmployeeProfileView();
        }, 500);
    }
}

function setupRealtimeListeners() {
    if (!window.dbRef || !window.CURRENT_USER.company) return;
    const { db, doc, onSnapshot } = window.dbRef;
    const domain = window.CURRENT_USER.company;
    
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', domain, 'data', key), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if(key === DB_KEYS.MINHA_EMPRESA) APP_CACHE[key] = data.items || {};
                else APP_CACHE[key] = data.items || [];
            } else {
                APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
            }
            
            // Reatividade
            if (key === DB_KEYS.FUNCIONARIOS) {
                window.populateAllSelects();
                if(window.CURRENT_USER.role !== 'admin') window.renderEmployeeProfileView();
            }
            if (key === DB_KEYS.OPERACOES) { 
                window.renderOperacaoTable(); 
                window.renderCheckinsTable(); 
                window.renderCalendar();
                window.updateDashboardStats();
            }
            if (key === DB_KEYS.PROFILE_REQUESTS) {
                window.renderProfileRequestsTable();
            }
        });
    });
}

// Ponto de entrada global
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    updateUI();
    console.log("LOGIMASTER 9.0 INICIADO PARA:", user.email);
};

// Event Listeners Globais
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
            const pageEl = document.getElementById(pageId);
            if(pageEl) pageEl.classList.add('active');
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
            
            if(pageId === 'home') { window.renderCalendar(); window.updateDashboardStats(); }
            if(pageId === 'graficos') window.updateDashboardStats();
            if(pageId === 'checkins-pendentes') window.renderCheckinsTable();
        });
    });
    
    // Abas
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    if (typeof setupFormHandlers === 'function') setupFormHandlers();
});