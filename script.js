// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 8.0 (CORREÇÃO DE BUGS, RELATÓRIOS E CALENDÁRIO)
// PARTE 1: INFRAESTRUTURA, FORMATADORES E CÁLCULOS
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

// Variáveis de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// VARIÁVEL CRÍTICA PARA O CALENDÁRIO (CORREÇÃO DE ERRO DE CARREGAMENTO)
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
    
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * MÉDIA HISTÓRICA GLOBAL:
 * Soma Total de KM / Soma Total de Litros Abastecidos no histórico do carro.
 */
window.calcularMediaHistoricaVeiculo = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0;
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
 * CUSTO DA VIAGEM (LUCRO LÍQUIDO):
 * Baseado na média histórica, não apenas no abastecimento do dia.
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status !== 'CONFIRMADA') return 0;
    
    const mediaKmL = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

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
// VERSÃO: 8.0
// PARTE 2: INTERFACE DE USUÁRIO (UI), MODAIS E RENDERIZAÇÃO
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
        
        // Se não for motorista, limpa os campos visuais (mas não deleta do DB ainda)
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

// Renderiza a lista visual (HTML)
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
    // Filtro seguro por String ID
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => String(a.id) !== String(id));
    window.renderAjudantesAdicionadosList();
};

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

// ATUALIZADA: Garante que Veículos não sumam
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

    // Recibo (Mistura todos os funcionários)
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
    
    // Chama o checkin se existir
    if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
};

window.renderMinhaEmpresaInfo = () => {
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

// --- 5. RENDERIZAÇÃO DAS TABELAS (CORRIGIDO BOTSÕES) ---

window.renderCadastroTable = (key) => {
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
        
        // Formatação específica
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
        
        // Garante que IDs string tenham aspas para a chamada onclick
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
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 8.0
// PARTE 3: LÓGICA DE CRUD (VISUALIZAR, EDITAR, EXCLUIR) E FORMULÁRIOS
// =============================================================================

// --- 1. VISUALIZAR DETALHES (FUNÇÃO GLOBAL) ---

window.viewCadastro = (key, id) => {
    let item = null;
    let title = "DETALHES";
    let html = '<div style="font-size:0.95rem; line-height:1.6;">';

    // Conversão segura de ID
    const safeId = String(id);

    // A. FUNCIONÁRIOS
    if (key === DB_KEYS.FUNCIONARIOS) {
        item = window.getFuncionario(safeId);
        if (!item) return alert('Registro não encontrado.');
        
        title = `FICHA: ${item.nome}`;
        
        // Verifica status do vínculo
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
    
    // Rola para o topo suavemente
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
        
        // Email fica travado na edição para não quebrar o login
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
        const v = window.getVeiculo(safeId); // safeId é a placa
        if (!v) return;
        
        document.getElementById('veiculoId').value = v.placa; // ID hidden é a placa antiga
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

// --- 3. EXCLUIR ITEM (LÓGICA SEGURA) ---

window.deleteItem = (key, id) => {
    if (window.IS_READ_ONLY) return alert("Permissão negada.");
    
    if (!confirm("Tem certeza que deseja excluir este registro?\nEsta ação é irreversível.")) return;
    
    // Carrega array atualizado
    let arr = loadData(key).slice();
    let idKey = 'id';
    
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    // Filtra removendo o item (Comparação de String para segurança)
    const newArr = arr.filter(item => String(item[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        // Atualiza a UI correta
        if(key === DB_KEYS.ATIVIDADES) window.renderAtividadesTable();
        else window.renderCadastroTable(key);
        
        // Se deletou operação ou despesa
        if(key === DB_KEYS.OPERACOES) window.renderOperacaoTable();
        if(key === DB_KEYS.DESPESAS_GERAIS) window.renderDespesasTable();
        
        window.populateAllSelects(); // Atualiza dropdowns
        alert("Registro excluído com sucesso.");
    });
};

// =============================================================================
// 4. HANDLERS DE FORMULÁRIOS (SALVAR DADOS)
// =============================================================================

function setupFormHandlers() {
    
    // --- A. SALVAR FUNCIONÁRIO + CRIAR CONTA FIREBASE ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = formFunc.querySelector('button[type="submit"]');
            const txtOriginal = btn.innerText;
            btn.innerText = "PROCESSANDO...";
            btn.disabled = true;

            try {
                // Dados do Formulário
                const idHidden = document.getElementById('funcionarioId').value;
                const nome = document.getElementById('funcNome').value.toUpperCase();
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                let arr = loadData(DB_KEYS.FUNCIONARIOS).slice();
                
                // Valida email duplicado (apenas se novo)
                if (!idHidden && arr.some(f => f.email === email)) {
                    throw new Error("Este e-mail já está cadastrado para outro funcionário.");
                }

                // ID: Novo ou Existente
                let newId = idHidden ? Number(idHidden) : Date.now();
                let novoUid = null;

                // --- CRIAÇÃO NO FIREBASE (Se tiver senha e dbRef disponível) ---
                if (window.dbRef && !idHidden && senha) {
                    if (senha.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
                    
                    try {
                        const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                        
                        // Usa app secundário para criar usuário sem deslogar o admin atual
                        const auth2 = getAuth(secondaryApp);
                        const cred = await createUserWithEmailAndPassword(auth2, email, senha);
                        novoUid = cred.user.uid;

                        // Cria o perfil na coleção 'users' para permitir login imediato
                        await setDoc(doc(db, "users", novoUid), {
                            uid: novoUid,
                            name: nome,
                            email: email,
                            role: funcao,
                            company: window.CURRENT_USER.company,
                            approved: true, // Admin criou, então está aprovado
                            createdAt: new Date().toISOString()
                        });

                        await signOut(auth2); // Limpa sessão secundária
                        console.log("Conta criada via Admin:", email);

                    } catch (fbErr) {
                        console.error(fbErr);
                        if (fbErr.code === 'auth/email-already-in-use') throw new Error("E-mail já existe no sistema de autenticação.");
                        throw new Error("Erro ao criar login: " + fbErr.message);
                    }
                }

                // Objeto de Dados Local
                const obj = {
                    id: newId,
                    // Se criou conta agora, usa novoUid. Se editando, preserva o existente.
                    uid: novoUid || (idHidden ? (arr.find(f => String(f.id) === String(idHidden))?.uid || '') : ''),
                    nome: nome,
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    // Dados específicos
                    cnh: (funcao === 'motorista') ? document.getElementById('funcCNH').value.toUpperCase() : '',
                    validadeCNH: (funcao === 'motorista') ? document.getElementById('funcValidadeCNH').value : '',
                    categoriaCNH: (funcao === 'motorista') ? document.getElementById('funcCategoriaCNH').value : '',
                    cursoDescricao: (funcao === 'motorista') ? document.getElementById('funcCursoDescricao').value.toUpperCase() : ''
                };

                // Atualiza Array
                const idx = arr.findIndex(f => String(f.id) === String(newId));
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);

                // Salva
                await saveData(DB_KEYS.FUNCIONARIOS, arr);

                // Reset e UI
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                document.getElementById('funcEmail').readOnly = false;
                window.toggleDriverFields();
                window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
                window.populateAllSelects();

                if (novoUid) alert(`SUCESSO!\nFuncionário cadastrado e conta de acesso criada.\n\nLogin: ${email}\nSenha: ${senha}`);
                else alert("Dados do funcionário salvos com sucesso.");

            } catch (err) {
                alert("ERRO: " + err.message);
            } finally {
                btn.innerText = txtOriginal;
                btn.disabled = false;
            }
        });
    }

    // --- B. SALVAR VEÍCULO (CORREÇÃO DE BUG: NÃO SUMIR) ---
    const formVeic = document.getElementById('formVeiculo');
    if (formVeic) {
        formVeic.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // LER DADOS DO ZERO PARA EVITAR SOBRESCRITA
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const idHidden = document.getElementById('veiculoId').value; // Placa antiga se for edição

            // Validação de Duplicidade (se for novo)
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

            // Se editou a placa, remove o registro antigo
            if (idHidden && idHidden !== placa) {
                arr = arr.filter(v => v.placa !== idHidden);
            }
            
            // Insere ou Atualiza
            const idx = arr.findIndex(v => v.placa === placa);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);

            saveData(DB_KEYS.VEICULOS, arr).then(() => {
                formVeic.reset();
                document.getElementById('veiculoId').value = '';
                window.renderCadastroTable(DB_KEYS.VEICULOS);
                window.populateAllSelects(); // Atualiza selects de operação
                alert('Veículo salvo com sucesso.');
            });
        });
    }

    // --- C. SALVAR CONTRATANTE ---
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
            
            // CNPJ é a chave única
            const idx = arr.findIndex(c => c.cnpj === cnpj);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.CONTRATANTES, arr).then(() => {
                formCli.reset();
                document.getElementById('contratanteId').value = '';
                window.renderCadastroTable(DB_KEYS.CONTRATANTES);
                window.populateAllSelects();
                alert('Contratante salvo.');
            });
        });
    }

    // --- D. SALVAR MINHA EMPRESA ---
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
    
    // --- E. SALVAR ATIVIDADE ---
    const formAtiv = document.getElementById('formAtividade');
    if (formAtiv) {
        formAtiv.addEventListener('submit', (e) => {
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
                formAtiv.reset();
                document.getElementById('atividadeId').value = '';
                window.renderAtividadesTable();
                window.populateAllSelects();
                alert('Atividade salva.');
            });
        });
    }
}
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 8.0
// PARTE 4: OPERAÇÕES, CHECK-IN, RELATÓRIOS E RECIBOS
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
        
        // Validação de CNH antes de salvar
        window.verificarValidadeCNH(motId);
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        
        // Recupera objeto original para não perder dados de check-in
        const originalOp = isEdit ? arr.find(o => String(o.id) === String(idHidden)) : null;

        // Define status
        let statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        if (isEdit && originalOp && originalOp.status === 'EM_ANDAMENTO') {
            statusFinal = 'EM_ANDAMENTO'; // Não reseta status se já começou
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
            
            // Abastecimento e Rodagem
            combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
            kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
            
            // Equipe (Preserva a lista se não foi alterada)
            ajudantes: (window._operacaoAjudantesTempList && window._operacaoAjudantesTempList.length > 0) 
                       ? window._operacaoAjudantesTempList 
                       : (originalOp ? originalOp.ajudantes : []),
            
            // Preserva dados técnicos de check-in
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
            // Limpa estado temporário
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            
            formOp.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            // Atualiza Grids
            window.renderOperacaoTable();
            if(typeof window.renderCheckinsTable === 'function') window.renderCheckinsTable();
            if(typeof window.updateDashboardStats === 'function') window.updateDashboardStats(); // Atualiza Gráficos

            alert(isAgendamento ? 'VIAGEM AGENDADA COM SUCESSO.' : 'OPERAÇÃO SALVA E CONFIRMADA.');
        });
    });
    
    formOp.addEventListener('reset', () => {
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
    });
}

// --- 12. CHECK-IN (CONFIRMAÇÃO DE ROTA) ---

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
            
            // Estrutura de segurança
            if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };

            // Verifica identidade no cadastro unificado
            const userProfile = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
                u.uid === window.CURRENT_USER.uid || 
                (u.email && u.email === window.CURRENT_USER.email)
            );

            if (!userProfile) return alert("Erro de perfil.");

            let confirmou = false;
            const agora = new Date().toISOString();

            // Lógica Motorista
            if (userProfile.funcao === 'motorista') {
                if (String(op.motoristaId) !== String(userProfile.id)) return alert("Esta viagem não é sua.");

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
                    alert("VIAGEM INICIADA!");
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
            // Lógica Ajudante
            else {
                const escalado = (op.ajudantes || []).some(a => String(a.id) === String(userProfile.id));
                if (escalado) {
                    if (!op.checkins.ajudantes.includes(userProfile.id)) {
                        op.checkins.ajudantes.push(userProfile.id);
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
                });
            }
        }
    });
}

// --- 13. RELATÓRIOS GERENCIAIS (GERAL E COBRANÇA) ---

// Relatório Geral (Lucro/Prejuízo)
window.generateGeneralReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    
    if(!ini || !fim) return alert("Selecione data de início e fim.");
    
    // Filtros Opcionais
    const fMot = document.getElementById('selectMotoristaRelatorio').value;
    const fVeic = document.getElementById('selectVeiculoRelatorio').value;
    const fCli = document.getElementById('selectContratanteRelatorio').value;

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        if (o.data < ini || o.data > fim) return false;
        if (fMot && String(o.motoristaId) !== fMot) return false;
        if (fVeic && o.veiculoPlaca !== fVeic) return false;
        if (fCli && o.contratanteCNPJ !== fCli) return false;
        return true;
    });

    let totalFat = 0;
    let totalCustos = 0;

    const linhas = ops.map(o => {
        totalFat += (o.faturamento || 0);
        // Custo estimado = Diesel Calculado + Comissão + Despesas
        const custoOp = (o.comissao||0) + (o.despesas||0) + window.calcularCustoConsumoViagem(o);
        totalCustos += custoOp;
        
        return `<tr>
            <td>${o.data.split('-').reverse().join('/')}</td>
            <td>${o.veiculoPlaca}</td>
            <td>${window.getContratante(o.contratanteCNPJ)?.razaoSocial || '-'}</td>
            <td>${window.formatCurrency(o.faturamento)}</td>
            <td style="color:var(--danger-color);">${window.formatCurrency(custoOp)}</td>
        </tr>`;
    }).join('');

    const lucro = totalFat - totalCustos;
    const corLucro = lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    document.getElementById('reportResults').style.display = 'block';
    document.getElementById('reportContent').innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO GERAL DE PERFORMANCE</h3>
            <p>Período: ${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}</p>
        </div>
        <div style="display:flex; justify-content:space-around; background:#eee; padding:15px; border-radius:8px; margin-bottom:20px;">
            <div><strong>FATURAMENTO:</strong><br><span style="color:var(--primary-color); font-size:1.2rem;">${window.formatCurrency(totalFat)}</span></div>
            <div><strong>CUSTOS TOTAIS:</strong><br><span style="color:var(--danger-color); font-size:1.2rem;">${window.formatCurrency(totalCustos)}</span></div>
            <div><strong>LUCRO LÍQUIDO:</strong><br><span style="color:${corLucro}; font-size:1.2rem;">${window.formatCurrency(lucro)}</span></div>
        </div>
        <table class="data-table">
            <thead><tr><th>DATA</th><th>VEÍCULO</th><th>CLIENTE</th><th>VALOR</th><th>CUSTO EST.</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="5" style="text-align:center">Sem dados no período.</td></tr>'}</tbody>
        </table>
    `;
};

// Relatório de Cobrança (Para enviar ao cliente)
window.generateBillingReport = () => {
    const cliCnpj = document.getElementById('selectContratanteRelatorio').value;
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;

    if(!cliCnpj) return alert("Para gerar cobrança, selecione um CONTRATANTE específico.");
    if(!ini || !fim) return alert("Selecione as datas.");

    const cli = window.getContratante(cliCnpj);
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.contratanteCNPJ === cliCnpj && 
        o.status === 'CONFIRMADA' && 
        o.data >= ini && o.data <= fim
    );

    let total = 0;
    const linhas = ops.map(o => {
        total += (o.faturamento || 0);
        return `<tr>
            <td style="border:1px solid #ddd; padding:8px;">${o.data.split('-').reverse().join('/')}</td>
            <td style="border:1px solid #ddd; padding:8px;">Op. #${o.id} - ${o.veiculoPlaca}</td>
            <td style="border:1px solid #ddd; padding:8px;">${window.getAtividade(o.atividadeId)?.nome || 'Serviço de Transporte'}</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:right;">${window.formatCurrency(o.faturamento)}</td>
        </tr>`;
    }).join('');

    document.getElementById('reportResults').style.display = 'block';
    document.getElementById('reportContent').innerHTML = `
        <div style="border:2px solid #000; padding:40px; background:#fff; font-family:Courier New, monospace;">
            <h2 style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px;">EXTRATO DE COBRANÇA</h2>
            <div style="margin:20px 0;">
                <p><strong>DE:</strong> ${window.getMinhaEmpresa()?.razaoSocial || 'LOGIMASTER TRANSP.'}</p>
                <p><strong>PARA:</strong> ${cli.razaoSocial} (CNPJ: ${window.formatCPF_CNPJ(cli.cnpj)})</p>
                <p><strong>PERÍODO:</strong> ${ini.split('-').reverse().join('/')} A ${fim.split('-').reverse().join('/')}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                <thead style="background:#f0f0f0;">
                    <tr>
                        <th style="border:1px solid #000; padding:10px; text-align:left;">DATA</th>
                        <th style="border:1px solid #000; padding:10px; text-align:left;">DESCRIÇÃO</th>
                        <th style="border:1px solid #000; padding:10px; text-align:left;">SERVIÇO</th>
                        <th style="border:1px solid #000; padding:10px; text-align:right;">VALOR</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align:right; padding:15px; font-weight:bold; font-size:1.2rem;">TOTAL A PAGAR:</td>
                        <td style="text-align:right; padding:15px; font-weight:bold; font-size:1.2rem; border-top:2px solid #000;">${window.formatCurrency(total)}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="margin-top:50px; text-align:center;">
                <p>___________________________________________________</p>
                <p>Assinatura / Responsável</p>
            </div>
        </div>
        <div style="text-align:center; margin-top:20px;">
            <button class="btn-primary" onclick="window.print()">IMPRIMIR / SALVAR PDF</button>
        </div>
    `;
};

// --- 14. RECIBOS (PAGAMENTO FUNCIONÁRIO) ---

window.generateReceipt = () => {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;

    if(!funcId || !ini || !fim) return alert("Preencha funcionário e datas.");

    const func = window.getFuncionario(funcId);
    if (!func) return;

    // Busca operações onde a pessoa trabalhou
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        if (o.data < ini || o.data > fim) return false;
        
        if (func.funcao === 'motorista') return String(o.motoristaId) === String(funcId);
        // Se ajudante, verifica array
        return (o.ajudantes || []).some(a => String(a.id) === String(funcId));
    });

    let total = 0;
    const linhas = ops.map(o => {
        let valorItem = 0;
        if (func.funcao === 'motorista') {
            valorItem = o.comissao || 0;
        } else {
            const aj = o.ajudantes.find(a => String(a.id) === String(funcId));
            valorItem = aj ? (aj.diaria || 0) : 0;
        }
        total += valorItem;
        return `<li>${o.data.split('-').reverse().join('/')} - Veículo ${o.veiculoPlaca}: <strong>${window.formatCurrency(valorItem)}</strong></li>`;
    }).join('');

    const html = `
        <div style="border:2px dashed #333; padding:40px; background:#fff; margin-top:20px;">
            <h1 style="text-align:center; color:#333;">RECIBO DE PAGAMENTO</h1>
            <p style="font-size:1.1rem; margin:30px 0;">
                Eu, <strong>${func.nome}</strong> (CPF ${func.documento}), declaro que recebi a importância de 
                <span style="background:#e0f2f1; padding:5px; font-weight:bold;">${window.formatCurrency(total)}</span>
                referente aos serviços prestados no período de ${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}.
            </p>
            <h4 style="border-bottom:1px solid #ccc; padding-bottom:5px;">DETALHAMENTO DOS SERVIÇOS:</h4>
            <ul style="line-height:1.8; margin-bottom:40px;">${linhas || '<li>Nenhum serviço encontrado no período.</li>'}</ul>
            <div style="display:flex; justify-content:space-between; margin-top:60px;">
                <div style="text-align:center;">
                    ____________________________<br>
                    ${window.getMinhaEmpresa()?.razaoSocial || 'EMPRESA'}
                </div>
                <div style="text-align:center;">
                    ____________________________<br>
                    <strong>${func.nome}</strong>
                </div>
            </div>
            <p style="text-align:center; font-size:0.8rem; margin-top:40px; color:#999;">Gerado em ${new Date().toLocaleDateString()}</p>
        </div>
        <div style="text-align:center; margin-top:15px;">
            <button class="btn-primary" onclick="window.print()">IMPRIMIR RECIBO</button>
        </div>
    `;
    
    document.getElementById('reciboContent').innerHTML = html;
};

// --- 15. VISUALIZAR DETALHES OPERACIONAIS (CÁLCULO REAL) ---

window.viewOperacaoDetails = (id) => {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;

    const mot = window.getMotorista(op.motoristaId)?.nome || '...';
    
    // Custo Equipe
    const custoAj = (op.ajudantes || []).reduce((acc, a) => acc + (a.diaria||0), 0);
    
    // Custo Diesel (Baseado na Média Global Histórica)
    const custoDieselReal = window.calcularCustoConsumoViagem(op);
    
    // Lucro
    const custosTotais = (op.comissao||0) + (op.despesas||0) + custoAj + custoDieselReal;
    const lucro = (op.faturamento||0) - custosTotais;

    const html = `
        <div style="font-size:0.9rem;">
            <p><strong>MOTORISTA:</strong> ${mot}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>STATUS:</strong> ${op.status}</p>
            <hr>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#e8f5e9; padding:10px; border-radius:4px;">
                    <strong style="color:var(--success-color);">FATURAMENTO</strong><br>
                    ${window.formatCurrency(op.faturamento)}
                </div>
                <div style="background:#e3f2fd; padding:10px; border-radius:4px;">
                    <strong style="color:var(--primary-color);">LUCRO LÍQUIDO</strong><br>
                    ${window.formatCurrency(lucro)}
                </div>
            </div>
            <h4 style="color:var(--danger-color);">CUSTOS DA VIAGEM</h4>
            <ul>
                <li>⛽ Diesel (Consumo Real): ${window.formatCurrency(custoDieselReal)}</li>
                <li>💰 Comissão: ${window.formatCurrency(op.comissao)}</li>
                <li>🚧 Pedágios/Desp: ${window.formatCurrency(op.despesas)}</li>
                <li>👷 Equipe: ${window.formatCurrency(custoAj)}</li>
            </ul>
            <small style="display:block; margin-top:10px; color:#666;">
                * O custo do diesel é calculado usando a média histórica de consumo do veículo (${window.calcularMediaHistoricaVeiculo(op.veiculoPlaca).toFixed(2)} Km/L) e o preço atual do litro.
            </small>
        </div>
    `;
    window.openOperationDetails("RESUMO FINANCEIRO", html);
};

// Funções de Edição (Conectadas aos botões das tabelas)
window.editOperacaoItem = (id) => {
    const op = loadData(DB_KEYS.OPERACOES).find(x => x.id === id);
    if(!op) return;
    
    // Rola para o topo e abre aba
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({top:0, behavior:'smooth'});

    // Preenche campos
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId;
    
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // Restaura ajudantes
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    window.renderAjudantesAdicionadosList();
    
    alert("Operação carregada para edição.");
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 8.0
// PARTE 5: DASHBOARD, GRÁFICOS, NOTIFICAÇÕES E INICIALIZAÇÃO
// =============================================================================

// --- 16. CÁLCULOS DO DASHBOARD E GRÁFICOS ---

window.updateDashboardStats = () => {
    // Só roda se for admin
    if (window.CURRENT_USER.role !== 'admin') return;

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesasGerais = loadData(DB_KEYS.DESPESAS_GERAIS);
    
    // Data de Referência (Mês do Calendário)
    const refDate = window.currentDate;
    const mesRef = refDate.getMonth();
    const anoRef = refDate.getFullYear();

    // 1. Filtra Operações do Mês (CONFIRMADAS)
    const opsMes = ops.filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        const d = new Date(o.data);
        // Ajuste de Fuso Horário simples para garantir mês correto
        const dLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return dLocal.getMonth() === mesRef && dLocal.getFullYear() === anoRef;
    });

    // 2. Filtra Despesas Gerais do Mês
    const despMes = despesasGerais.filter(d => {
        const x = new Date(d.data);
        const xLocal = new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
        return xLocal.getMonth() === mesRef && xLocal.getFullYear() === anoRef;
    });

    // 3. Cálculos Financeiros
    // A. Faturamento Bruto
    const faturamentoTotal = opsMes.reduce((acc, o) => acc + (o.faturamento || 0), 0);

    // B. Custos Variáveis (Diesel + Comissão + Pedágio + Ajudantes)
    const custosVariaveis = opsMes.reduce((acc, o) => {
        const custoDiesel = window.calcularCustoConsumoViagem(o);
        const custoAjudantes = (o.ajudantes || []).reduce((sum, aj) => sum + (aj.diaria||0), 0);
        return acc + (o.comissao||0) + (o.despesas||0) + custoDiesel + custoAjudantes;
    }, 0);

    // C. Custos Fixos (Despesas Gerais)
    const custosFixos = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);

    // D. Totais
    const totalCustos = custosVariaveis + custosFixos;
    const lucroLiquido = faturamentoTotal - totalCustos;

    // 4. Atualiza a Interface (DOM)
    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elLucro = document.getElementById('receitaMes');
    const elAcumulado = document.getElementById('receitaTotalHistorico');

    if (elFat) elFat.textContent = window.formatCurrency(faturamentoTotal);
    if (elDesp) elDesp.textContent = window.formatCurrency(totalCustos);
    if (elLucro) {
        elLucro.textContent = window.formatCurrency(lucroLiquido);
        elLucro.style.color = lucroLiquido >= 0 ? 'var(--primary-color)' : 'var(--danger-color)';
    }

    // Calcula acumulado total do ano para o card extra
    const acumuladoAno = ops.reduce((acc, o) => acc + (o.status==='CONFIRMADA' ? (o.faturamento||0) : 0), 0);
    if (elAcumulado) elAcumulado.textContent = window.formatCurrency(acumuladoAno);

    // 5. Renderiza Gráfico
    window.renderCharts(ops);
};

window.renderCharts = (allOps) => {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    // Prepara dados: Últimos 6 meses
    const labels = [];
    const dataFat = [];
    const dataLucro = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mes = d.getMonth();
        const ano = d.getFullYear();
        const nomeMes = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][mes];
        
        labels.push(`${nomeMes}/${ano}`);

        // Soma do mês no loop
        const opsDoMes = allOps.filter(o => {
            const od = new Date(o.data);
            return od.getMonth() === mes && od.getFullYear() === ano && o.status === 'CONFIRMADA';
        });

        const fat = opsDoMes.reduce((acc, o) => acc + (o.faturamento||0), 0);
        dataFat.push(fat);
    }

    // Destrói gráfico anterior se existir para não sobrepor
    if (window.myChartInstance) {
        window.myChartInstance.destroy();
    }

    // Cria novo gráfico
    window.myChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Faturamento Bruto',
                    data: dataFat,
                    backgroundColor: 'rgba(0, 121, 107, 0.7)',
                    borderColor: 'rgba(0, 121, 107, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
};

// --- 17. PERFIL DO USUÁRIO E VÍNCULO VISUAL ---

window.renderEmployeeProfileView = () => {
    const div = document.getElementById('employeeProfileView');
    if (!div || !window.CURRENT_USER) return;
    
    // Busca na tabela unificada pelo UID (Vínculo Forte) ou Email (Vínculo Fraco)
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(u => 
        u.uid === window.CURRENT_USER.uid || 
        (u.email && u.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase())
    );
    
    if (!me) {
        div.innerHTML = `
            <div style="text-align:center; padding:30px; color:#d32f2f; background:#ffebee; border-radius:8px;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:10px;"></i><br>
                <strong>PERFIL NÃO VINCULADO</strong>
                <p style="margin-top:10px;">Seu usuário de acesso (${window.CURRENT_USER.email}) não foi encontrado na lista de funcionários da empresa.</p>
                <p>Solicite ao administrador que cadastre seu e-mail corretamente na ficha de funcionário.</p>
            </div>
        `;
        return;
    }
    
    // Renderiza Ficha Bonita
    div.innerHTML = `
        <div class="profile-view-container">
            <div class="profile-header">
                <div class="profile-avatar-placeholder">${me.nome.charAt(0)}</div>
                <div class="profile-info-main">
                    <h2>${me.nome}</h2>
                    <p style="background:var(--primary-color); color:#fff; display:inline-block; padding:2px 8px; border-radius:4px;">${me.funcao}</p>
                </div>
            </div>
            <div class="profile-data-grid">
                <div class="data-item"><label>EMAIL CADASTRADO</label><span>${me.email}</span></div>
                <div class="data-item"><label>TELEFONE</label><span>${window.formatPhoneBr(me.telefone)}</span></div>
                <div class="data-item"><label>DOCUMENTO</label><span>${me.documento}</span></div>
                <div class="data-item"><label>CHAVE PIX</label><span>${me.pix || 'NÃO INFORMADO'}</span></div>
                ${me.funcao === 'motorista' ? `
                <div class="data-item"><label>CNH</label><span>${me.cnh || '-'}</span></div>
                <div class="data-item"><label>VALIDADE CNH</label><span>${me.validadeCNH ? me.validadeCNH.split('-').reverse().join('/') : '-'}</span></div>
                ` : ''}
            </div>
        </div>
    `;
};

// --- 18. SISTEMA DE NOTIFICAÇÕES EM TEMPO REAL ---

function setupNotificationListener() {
    if(!window.dbRef || !window.CURRENT_USER) return;
    const { db, collection, query, where, onSnapshot } = window.dbRef;
    
    // Escuta notificações: Globais ('all') OU Específicas para este UID
    // Filtro composto pode exigir índice no Firestore, então fazemos filtro em memória para simplificar
    const q = query(collection(db, "notifications")); 
    
    // Listener
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const notif = change.doc.data();
                
                // Verifica se a notificação é recente (últimos 5 min) para não spammar antigas
                const notifTime = new Date(notif.date).getTime();
                const now = new Date().getTime();
                
                // Se for nova e para mim
                if ((now - notifTime < 300000) && (notif.targetUid === 'all' || notif.targetUid === window.CURRENT_USER.uid)) {
                    document.getElementById('notificationMessageText').textContent = notif.message;
                    document.getElementById('notificationSender').textContent = "ENVIADO POR: " + (notif.sender || "ADMINISTRADOR");
                    document.getElementById('modalNotification').style.display = 'block';
                    
                    // Som de notificação (opcional)
                    // new Audio('notification.mp3').play().catch(()=>{}); 
                }
            }
        });
    });
}

// Envio de Mensagem (Admin)
const formMsg = document.getElementById('formAdminMessage');
if(formMsg) {
    formMsg.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msgTextAdmin').value;
        const target = document.getElementById('msgRecipientSelect').value;
        
        if(window.dbRef) {
            try {
                await window.dbRef.addDoc(window.dbRef.collection(window.dbRef.db, "notifications"), {
                    message: msg,
                    sender: window.CURRENT_USER.email,
                    targetUid: target, // 'all' ou uid específico
                    date: new Date().toISOString(),
                    read: false
                });
                alert("Aviso enviado com sucesso!");
                formMsg.reset();
            } catch(err) {
                alert("Erro ao enviar: " + err.message);
            }
        }
    });
}

// --- 19. SUPER ADMIN (PAINEL MASTER) ---

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, setDoc, doc, secondaryApp, getAuth, createUserWithEmailAndPassword, signOut } = window.dbRef;

    // Monitora lista global de usuários
    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });

    const fCreate = document.getElementById('formCreateCompany');
    if (fCreate) {
        fCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
            const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
            const password = document.getElementById('newAdminPassword').value;

            if (!domain.includes('.') || !email.includes(domain)) 
                return alert("O domínio do email deve corresponder ao domínio da empresa.");

            try {
                const auth2 = getAuth(secondaryApp);
                const uc = await createUserWithEmailAndPassword(auth2, email, password);
                
                // Cria Admin
                await setDoc(doc(db, "users", uc.user.uid), {
                    uid: uc.user.uid, 
                    name: "ADMIN " + domain.toUpperCase(), 
                    email, 
                    role: "admin", 
                    company: domain, 
                    approved: true, 
                    createdAt: new Date().toISOString()
                });
                
                // Inicializa BD da Empresa
                await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { 
                    items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } 
                });
                
                await signOut(auth2);
                alert("Empresa e Administrador criados com sucesso!");
                fCreate.reset();
            } catch (err) { alert("Erro: " + err.message); }
        });
    }
}

window.renderGlobalHierarchy = (users) => {
    const container = document.getElementById('superAdminContainer');
    if (!container) return;
    
    // Agrupa por empresa
    const groups = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return; // Pula o super admin
        const d = u.company || 'SEM_EMPRESA';
        if(!groups[d]) groups[d] = [];
        groups[d].push(u);
    });
    
    container.innerHTML = Object.keys(groups).sort().map(dom => {
        return `
        <div class="domain-block">
            <div class="domain-header" onclick="this.nextElementSibling.classList.toggle('show')">
                <strong>${dom.toUpperCase()}</strong> 
                <span class="status-pill pill-active">${groups[dom].length} Usuários</span>
            </div>
            <div class="domain-content hidden">
                ${groups[dom].map(u => `
                    <div class="user-row">
                        <span>${u.name} <small>(${u.role})</small></span>
                        <small>${u.email}</small>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('') || '<p style="text-align:center; padding:20px;">Nenhuma empresa cadastrada.</p>';
};

// =============================================================================
// 20. INICIALIZAÇÃO E ROTEAMENTO (BOOTSTRAP)
// =============================================================================

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // 1. Reset: Esconde todos os menus e páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    const role = window.CURRENT_USER.role;
    const email = window.CURRENT_USER.email;

    // 2. Roteamento por Papel
    if (email === 'admin@logimaster.com') {
        // SUPER ADMIN
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } 
    else if (role === 'admin') {
        // ADMIN DA EMPRESA
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        
        setupRealtimeListeners();
        
        // Garante renderização inicial
        setTimeout(() => {
            window.populateAllSelects();
            window.renderOperacaoTable();
            window.renderDespesasTable();
            window.renderCheckinsTable();
            window.renderCalendar(); 
            window.updateDashboardStats();
        }, 500);
    } 
    else {
        // FUNCIONÁRIO (MOTORISTA/AJUDANTE)
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        
        setupRealtimeListeners();
        
        setTimeout(() => {
            window.renderCheckinsTable();
            window.renderEmployeeProfileView();
        }, 500);
    }
    
    // 3. Inicia Listener de Notificações para todos
    setupNotificationListener();
}

function setupRealtimeListeners() {
    if (!window.dbRef || !window.CURRENT_USER.company) return;
    const { db, doc, onSnapshot } = window.dbRef;
    const domain = window.CURRENT_USER.company;
    
    // Itera sobre todas as chaves de DB e cria listeners
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', domain, 'data', key), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Minha empresa é objeto, resto é array
                if(key === DB_KEYS.MINHA_EMPRESA) APP_CACHE[key] = data.items || {};
                else APP_CACHE[key] = data.items || [];
            } else {
                APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
            }
            
            // Gatilhos de Reatividade (Atualiza UI quando dados mudam)
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
            if (key === DB_KEYS.VEICULOS || key === DB_KEYS.CONTRATANTES) {
                window.populateAllSelects();
            }
        });
    });
}

// Ponto de entrada global (chamado pelo index.html após auth)
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    updateUI();
    console.log("Sistema Inicializado para:", user.email);
};

// Event Listeners Globais (Navegação)
document.addEventListener('DOMContentLoaded', () => {
    
    // Menu Mobile Toggle
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Navegação entre páginas (SPA Simples)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            // Remove active de todos
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Ativa atual
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            const pageEl = document.getElementById(pageId);
            if(pageEl) pageEl.classList.add('active');
            
            // Fecha menu mobile
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
            
            // Recarrega componentes específicos da página
            if(pageId === 'home') window.renderCalendar();
            if(pageId === 'graficos') window.updateDashboardStats();
        });
    });
    
    // Abas de Cadastro
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Inicializa Handlers de Formulário
    if (typeof setupFormHandlers === 'function') setupFormHandlers();
});