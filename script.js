// =============================================================================
// PARTE 1: CONFIGURAÇÕES, CACHE E UTILITÁRIOS
// =============================================================================

// CHAVES DO BANCO DE DADOS (FIRESTORE)
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

// CACHE LOCAL DA APLICAÇÃO (Para não ler o banco toda hora)
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

// ESTADO GLOBAL
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// --- FUNÇÕES DE CARREGAMENTO E SALVAMENTO ---

function loadData(key) { 
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); 
}

async function saveData(key, value) {
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES && key !== DB_KEYS.PROFILE_REQUESTS) return;
    
    // Atualiza Cache Local
    APP_CACHE[key] = value;
    
    // Salva no Firebase se estiver logado
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.company) {
        try {
            await window.dbRef.setDoc(
                window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', key), 
                { items: value }
            );
        } catch (e) { 
            console.error("Erro ao salvar no Firebase:", e); 
            alert("Erro de conexão ao salvar. Tente novamente.");
        }
    } 
}

// --- UTILITÁRIOS DE FORMATAÇÃO ---

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)||0);

function formatCPF_CNPJ(v) {
    const d = onlyDigits(v);
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
}

function formatPhoneBr(v) {
    const d = onlyDigits(v);
    if (d.length > 10) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
}

function copyToClipboard(t) { 
    navigator.clipboard.writeText(t)
        .then(() => alert("Copiado para a área de transferência!"))
        .catch(() => alert("Erro ao copiar.")); 
}

function detectPixType(k) { 
    if(k.includes('@')) return 'EMAIL'; 
    if(/^\d{11}$/.test(k)) return 'CPF/TEL'; 
    if(/^\d{14}$/.test(k)) return 'CNPJ';
    return 'OUTRO'; 
}

// --- GETTERS SEGUROS (Buscam dados pelo ID) ---

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(p) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === p); }
function getContratante(c) { return loadData(DB_KEYS.CONTRATANTES).find(x => x.cnpj === c); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// --- FUNÇÃO CRÍTICA: PREENCHIMENTO DOS SELECTS (CORRIGIDA) ---
// Esta função vincula os cadastros aos dropdowns da operação
window.populateAllSelects = function() {
    console.log("Populando selects...");
    populateSelect('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    populateSelect('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome');
    populateSelect('selectAjudantesOperacao', loadData(DB_KEYS.AJUDANTES), 'id', 'nome');
    
    // Selects de Relatórios e Recibos
    populateSelect('selectMotoristaRelatorio', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoRelatorio', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteRelatorio', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    
    populateSelect('selectMotoristaRecibo', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoRecibo', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteRecibo', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    
    // Select de Despesa
    populateSelect('selectVeiculoDespesaGeral', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
}

function populateSelect(elementId, dataArray, valueKey, textKey) {
    const select = document.getElementById(elementId);
    if(!select) return;
    
    const currentValue = select.value; // Mantém seleção se existir
    let html = '<option value="">SELECIONE...</option>';
    
    if (dataArray && dataArray.length > 0) {
        dataArray.forEach(item => {
            html += `<option value="${item[valueKey]}">${item[textKey]}</option>`;
        });
    } else {
        html = '<option value="">NENHUM CADASTRO ENCONTRADO</option>';
    }
    
    select.innerHTML = html;
    if(currentValue) select.value = currentValue;
}
// =============================================================================
// PARTE 2: UI - TABELAS E MODAIS
// =============================================================================

// --- RENDERIZAÇÃO DE TABELAS DE CADASTRO (Motorista, Veículo, etc) ---

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id'; // Chave padrão para identificar o item

    // Identifica qual tabela HTML preencher
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey='placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey='cnpj'; }
    
    if(!tabela) return;
    
    // Gera as linhas da tabela
    let rows = data.map(item => {
        let c1 = item.id || item.placa || item.cnpj; // Coluna 1 (ID/Placa)
        let c2 = item.nome || item.modelo || item.razaoSocial; // Coluna 2 (Nome)
        let c3 = item.documento || item.ano || item.telefone || ''; // Coluna 3 (Extra)
        
        let btns = `<button class="btn-action view-btn" onclick="viewCadastro('${key}','${c1}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        
        if(!window.IS_READ_ONLY) {
            // Adiciona aspas simples escapadas \' para strings (placas/cnpjs) funcionarem no onclick
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${key}','${c1}')" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }
        
        return `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td><td>${btns}</td></tr>`;
    }).join('');
    
    tabela.querySelector('tbody').innerHTML = rows || '<tr><td colspan="4" style="text-align:center">NENHUM DADO CADASTRADO.</td></tr>';
}

// --- AÇÕES DE CADASTRO (VER / EXCLUIR) ---

window.viewCadastro = function(key, id) {
    let item = null;
    // Busca o item correto baseado na chave
    if(key===DB_KEYS.MOTORISTAS) item = getMotorista(id);
    else if(key===DB_KEYS.AJUDANTES) item = getAjudante(id);
    else if(key===DB_KEYS.VEICULOS) item = getVeiculo(id);
    else if(key===DB_KEYS.CONTRATANTES) item = getContratante(id);
    
    if(!item) return alert("Item não encontrado.");

    let html = `<div style="line-height:1.8">`;
    for(let k in item) {
        // Formata visualmente as chaves e valores
        if(typeof item[k] !== 'object' && item[k] !== '') {
            html += `<b>${k.toUpperCase()}:</b> ${item[k]}<br>`;
        }
    }
    html += `</div>`;
    
    openViewModal("DETALHES DO CADASTRO", html);
}

window.deleteItem = function(key, id) {
    if(window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    if(!confirm("TEM CERTEZA QUE DESEJA EXCLUIR ESTE ITEM?")) return;
    
    let arr = loadData(key);
    let idKey = (key===DB_KEYS.VEICULOS)?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    
    // Filtra removendo o item selecionado
    const newArr = arr.filter(i => String(i[idKey]) !== String(id));
    
    saveData(key, newArr);
    
    // Atualiza a tabela correspondente e os selects globais
    renderCadastroTable(key);
    if(typeof renderOperacaoTable === 'function') renderOperacaoTable();
    if(typeof populateAllSelects === 'function') populateAllSelects();
}

// --- RENDERIZAÇÃO DA TABELA DE OPERAÇÕES (CORRIGIDO) ---

window.renderOperacaoTable = function() {
    // Carrega e ordena por data (mais recente primeiro)
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    // OTIMIZAÇÃO: Mostra apenas as últimas 50 para não travar o navegador
    const opsExibidas = ops.slice(0, 50);

    if (!opsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA.</td></tr>';
        return;
    }

    let rows = '';
    opsExibidas.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'MOTORISTA EXCLUÍDO/NÃO ENC.';
        // Ajuste de fuso horário simples para exibição correta da data
        const partesData = op.data.split('-'); 
        const dataFmt = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;
        
        // Badge de Status
        let statusBadge = '';
        if (op.status === 'AGENDADA') statusBadge = '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') statusBadge = '<span style="background:#0288d1; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">EM ANDAMENTO</span>';
        else statusBadge = '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        const faturamentoDisplay = op.status === 'CONFIRMADA' ? formatCurrency(op.faturamento) : '(PENDENTE)';

        // Botões de Ação
        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})" title="Editar"><i class="fas fa-edit"></i></button>`;
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${motorista}</td>
            <td>${statusBadge}</td>
            <td>${faturamentoDisplay}</td>
            <td>${btns}</td>
        </tr>`;
    });
    
    tabela.querySelector('tbody').innerHTML = rows;
}

// --- EDIÇÃO DE OPERAÇÃO (Carrega dados no formulário) ---
window.editOperacaoItem = function(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert("Operação não encontrada.");
    
    // Rola a página até o formulário
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Preenche os campos
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId || "";
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca || "";
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ || "";
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || "";
    
    // Campos Financeiros
    document.getElementById('operacaoFaturamento').value = op.faturamento || "";
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || "";
    document.getElementById('operacaoComissao').value = op.comissao || "";
    document.getElementById('operacaoCombustivel').value = op.combustivel || "";
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || "";
    document.getElementById('operacaoDespesas').value = op.despesas || "";
    document.getElementById('operacaoKmRodado').value = op.kmRodado || "";
    
    // Checkbox Agendamento
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // Restaura lista temporária de ajudantes para edição
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    renderAjudantesAdicionadosList(); // Função definida na parte 4
    
    alert(`EDITANDO OPERAÇÃO ID: ${id}\nFaça as alterações e clique em SALVAR.`);
}

// --- DETALHES DA OPERAÇÃO (MODAL) ---

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    
    const isFinalizada = op.status === 'CONFIRMADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    
    // Renderiza lista de ajudantes com status de presença
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        const checkins = op.checkins || { ajudantes: [] };
        const presente = checkins.ajudantes && checkins.ajudantes.includes(a.id);
        
        let statusPresenca = '';
        if(isFinalizada) {
            statusPresenca = presente ? '<span style="color:green;font-size:0.7rem;font-weight:bold;"> (PRESENTE)</span>' : '<span style="color:red;font-size:0.7rem;"> (FALTA)</span>';
        }
        
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} ${statusPresenca}</li>`;
    }).join('') || '<li>NENHUM AJUDANTE</li>';

    // Monta o HTML do Modal
    let detailsHtml = '';
    
    // Cálculos Financeiros Básicos para exibição
    const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria)||0), 0); // Soma brutas (sem verificar presença aqui para simplificar a visualização prévia, ou refinamos depois)
    const saldoReceber = (op.faturamento || 0) - (op.adiantamento || 0);

    detailsHtml = `
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:15px;">
            <p><strong>STATUS:</strong> ${op.status}</p>
            <p><strong>DATA:</strong> ${op.data.split('-').reverse().join('/')}</p>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
        </div>

        <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; color:var(--primary-color);">FINANCEIRO</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
            <div>
                <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
                <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(op.adiantamento)}</p>
                <p style="font-weight:bold; color:var(--primary-color);">A RECEBER: ${formatCurrency(saldoReceber)}</p>
            </div>
            <div>
                <p><strong>COMISSÃO:</strong> ${formatCurrency(op.comissao)}</p>
                <p><strong>ABASTECIMENTO:</strong> ${formatCurrency(op.combustivel)}</p>
                <p><strong>OUTRAS DESP.:</strong> ${formatCurrency(op.despesas)}</p>
            </div>
        </div>

        <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; color:var(--secondary-color);">EQUIPE</h4>
        <ul style="margin-left:20px; margin-bottom:10px;">${ajudantesHtml}</ul>
        
        ${op.kmRodado ? `<p style="background:#e0f2f1; padding:10px; border-radius:4px;"><strong>KM PERCORRIDO:</strong> ${op.kmRodado} KM</p>` : ''}
    `;

    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

// --- FUNÇÕES AUXILIARES DE MODAL ---

function openViewModal(title, htmlContent) {
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    document.getElementById('viewItemModal').style.display = 'block';
}

function closeViewModal() {
    document.getElementById('viewItemModal').style.display = 'none';
}

function openOperationDetails(title, htmlContent) {
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    document.getElementById('operationDetailsModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('operationDetailsModal').style.display = 'none';
}
// =============================================================================
// PARTE 3: LÓGICA DE FORMULÁRIOS E OPERAÇÕES (CRUD)
// =============================================================================

function setupFormHandlers() {

    // --- 1. CADASTRO DE MOTORISTA ---
    const fMot = document.getElementById('formMotorista');
    if(fMot) fMot.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.MOTORISTAS).slice();
        const idHidden = document.getElementById('motoristaId').value;
        const isEdit = !!idHidden;
        
        // Gera ID novo se não for edição
        const newId = isEdit ? Number(idHidden) : (Date.now()); 
        const nome = document.getElementById('motoristaNome').value.toUpperCase();
        
        // Sugere e-mail se for novo
        let email = "";
        if(!isEdit && window.CURRENT_USER) {
             const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
             email = `${cleanName}@${window.CURRENT_USER.company}`;
             alert(`ATENÇÃO: O LOGIN SUGERIDO PARA ESTE MOTORISTA SERÁ: ${email}\n(A senha deve ser criada no primeiro acesso ou pelo admin)`);
        } else if (isEdit) {
            const existing = arr.find(x => x.id == newId);
            if(existing) email = existing.email;
        }

        const obj = {
            id: newId,
            nome: nome,
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
            temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
            cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
            pix: document.getElementById('motoristaPix').value,
            email: email,
            uid: isEdit ? (arr.find(x=>x.id==newId)?.uid || null) : null // Mantém UID se existir
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == newId);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        saveData(DB_KEYS.MOTORISTAS, arr);
        fMot.reset();
        document.getElementById('motoristaId').value = '';
        renderCadastroTable(DB_KEYS.MOTORISTAS);
        populateAllSelects(); // ATUALIZA OS SELECTS DA OPERAÇÃO IMEDIATAMENTE
        alert("Motorista salvo com sucesso!");
    });

    // --- 2. CADASTRO DE VEÍCULO ---
    const fVeic = document.getElementById('formVeiculo');
    if(fVeic) fVeic.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.VEICULOS).slice();
        const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
        
        const obj = {
            placa: placa,
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value
        };

        // Remove anterior se existir (update simples por substituição)
        const arrFiltered = arr.filter(x => x.placa !== placa);
        arrFiltered.push(obj);
        
        saveData(DB_KEYS.VEICULOS, arrFiltered);
        fVeic.reset();
        renderCadastroTable(DB_KEYS.VEICULOS);
        populateAllSelects(); // ATUALIZA SELECTS
        alert("Veículo salvo!");
    });

    // --- 3. CADASTRO DE CONTRATANTE ---
    const fCont = document.getElementById('formContratante');
    if(fCont) fCont.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.CONTRATANTES).slice();
        const cnpj = document.getElementById('contratanteCNPJ').value;
        
        const obj = {
            cnpj: cnpj,
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        };

        const arrFiltered = arr.filter(x => x.cnpj !== cnpj);
        arrFiltered.push(obj);

        saveData(DB_KEYS.CONTRATANTES, arrFiltered);
        fCont.reset();
        renderCadastroTable(DB_KEYS.CONTRATANTES);
        populateAllSelects(); // ATUALIZA SELECTS
        alert("Contratante salvo!");
    });

    // --- 4. CADASTRO DE AJUDANTE ---
    const fAju = document.getElementById('formAjudante');
    if(fAju) fAju.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.AJUDANTES).slice();
        const idHidden = document.getElementById('ajudanteId').value;
        const isEdit = !!idHidden;
        const newId = isEdit ? Number(idHidden) : Date.now();
        const nome = document.getElementById('ajudanteNome').value.toUpperCase();

        // Lógica de email sugerido
        let email = "";
        if(!isEdit && window.CURRENT_USER) {
             const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
             email = `${cleanName}@${window.CURRENT_USER.company}`;
        } else if (isEdit) {
            email = arr.find(x => x.id == newId)?.email || "";
        }

        const obj = {
            id: newId,
            nome: nome,
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value,
            email: email,
            uid: isEdit ? (arr.find(x=>x.id==newId)?.uid || null) : null
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == newId);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        saveData(DB_KEYS.AJUDANTES, arr);
        fAju.reset();
        document.getElementById('ajudanteId').value = '';
        renderCadastroTable(DB_KEYS.AJUDANTES);
        populateAllSelects(); // ATUALIZA SELECTS
        alert("Ajudante salvo!");
    });

    // --- 5. CADASTRO DE ATIVIDADE ---
    const fAtiv = document.getElementById('formAtividade');
    if(fAtiv) fAtiv.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.ATIVIDADES).slice();
        const obj = {
            id: Date.now(),
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        };
        arr.push(obj);
        saveData(DB_KEYS.ATIVIDADES, arr);
        fAtiv.reset();
        populateAllSelects();
        alert("Atividade salva!");
    });

    // --- 6. MINHA EMPRESA ---
    const fEmp = document.getElementById('formMinhaEmpresa');
    if(fEmp) fEmp.addEventListener('submit', e => {
        e.preventDefault();
        const obj = {
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
            cnpj: document.getElementById('minhaEmpresaCNPJ').value,
            telefone: document.getElementById('minhaEmpresaTelefone').value
        };
        saveData(DB_KEYS.MINHA_EMPRESA, obj);
        renderMinhaEmpresaInfo(); // Atualiza visualização
        alert("Dados da empresa atualizados.");
    });

    // --- 7. DESPESA GERAL (COM PARCELAMENTO) ---
    const fDesp = document.getElementById('formDespesaGeral');
    if(fDesp) fDesp.addEventListener('submit', e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
        const idHidden = document.getElementById('despesaGeralId').value;
        
        // Captura dados comuns
        const dataBase = document.getElementById('despesaGeralData').value;
        const veiculo = document.getElementById('selectVeiculoDespesaGeral').value;
        const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
        const valorTotal = Number(document.getElementById('despesaGeralValor').value);
        const forma = document.getElementById('despesaFormaPagamento').value;
        const modo = document.getElementById('despesaModoPagamento').value; // avista ou parcelado

        if(idHidden) {
            // Edição Simples (Não altera parcelas, apenas dados do registro)
            const idx = arr.findIndex(x => x.id == idHidden);
            if(idx >= 0) {
                arr[idx].data = dataBase;
                arr[idx].veiculoPlaca = veiculo;
                arr[idx].descricao = desc;
                arr[idx].valor = valorTotal;
                arr[idx].formaPagamento = forma;
            }
        } else {
            // Novo Lançamento
            if(modo === 'avista') {
                arr.push({
                    id: Date.now(),
                    data: dataBase,
                    veiculoPlaca: veiculo,
                    descricao: desc,
                    valor: valorTotal,
                    formaPagamento: forma,
                    pago: true // À vista já nasce pago? Geralmente sim, ou pendente. Vamos assumir PAGO se for dinheiro/pix na hora, mas deixarei false para o usuario confirmar na tabela.
                    // Ajuste: Deixar padrao false (pendente) pra garantir controle, ou true.
                    // Decisão: false (Pendente) para controle de fluxo de caixa, usuário marca pago.
                });
            } else {
                // Parcelado Logic
                const qtd = Number(document.getElementById('despesaParcelas').value);
                const intervalo = Number(document.getElementById('despesaIntervaloDias').value);
                const pagas = Number(document.getElementById('despesaParcelasPagas').value);
                const valorParcela = valorTotal / qtd;
                
                let baseDateObj = new Date(dataBase + 'T00:00:00');
                
                for(let i=0; i<qtd; i++) {
                    // Calcula data da parcela
                    let d = new Date(baseDateObj);
                    d.setDate(d.getDate() + (i * intervalo));
                    const dataIso = d.toISOString().split('T')[0];
                    
                    arr.push({
                        id: Date.now() + i, // ID único sequencial
                        data: dataIso,
                        veiculoPlaca: veiculo,
                        descricao: `${desc} (${i+1}/${qtd})`,
                        valor: Number(valorParcela.toFixed(2)),
                        formaPagamento: forma,
                        pago: (i < pagas) // Se já disse que pagou X, as primeiras nascem pagas
                    });
                }
            }
        }

        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        fDesp.reset();
        document.getElementById('despesaGeralId').value = '';
        toggleDespesaParcelas();
        renderDespesasTable();
        alert("Despesa(s) lançada(s)!");
    });

    // --- 8. OPERAÇÃO (CORE DO SISTEMA) ---
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', e => {
        e.preventDefault();
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        // Validação básica
        const motId = document.getElementById('selectMotoristaOperacao').value;
        if(!motId) return alert("Selecione um Motorista.");
        
        // Verifica CNH
        verificarValidadeCNH(motId);

        const obj = {
            id: isEdit ? Number(idHidden) : Date.now(),
            // Se for edição, mantém o status original, senão define pelo checkbox
            status: isEdit ? (arr.find(o=>o.id==idHidden)?.status || 'CONFIRMADA') : (isAgendamento ? 'AGENDADA' : 'CONFIRMADA'),
            
            data: document.getElementById('operacaoData').value,
            motoristaId: Number(motId),
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value,
            
            // Financeiro
            faturamento: Number(document.getElementById('operacaoFaturamento').value),
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
            comissao: Number(document.getElementById('operacaoComissao').value),
            combustivel: Number(document.getElementById('operacaoCombustivel').value),
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
            despesas: Number(document.getElementById('operacaoDespesas').value),
            kmRodado: Number(document.getElementById('operacaoKmRodado').value),
            
            // Controle de Checkin e Ajudantes
            ajudantes: window._operacaoAjudantesTempList || [],
            // Preserva dados de checkin se for edição, senão inicializa vazio
            checkins: isEdit ? (arr.find(o=>o.id==idHidden)?.checkins || {motorista:false, ajudantes:[], ajudantesLog:{}}) 
                             : {motorista:false, ajudantes:[], ajudantesLog:{}},
            
            // Preserva KMs de checkin
            kmInicial: isEdit ? (arr.find(o=>o.id==idHidden)?.kmInicial || 0) : 0,
            kmFinal: isEdit ? (arr.find(o=>o.id==idHidden)?.kmFinal || 0) : 0,
            dataHoraInicio: isEdit ? (arr.find(o=>o.id==idHidden)?.dataHoraInicio || null) : null
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == obj.id);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        saveData(DB_KEYS.OPERACOES, arr);
        
        // Limpeza
        fOp.reset();
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = [];
        renderAjudantesAdicionadosList();
        
        renderOperacaoTable();
        // Se houver dashboard ativo, atualiza
        if(typeof updateDashboardStats === 'function') updateDashboardStats();

        alert(isAgendamento ? "Operação Agendada! Enviada para o app do motorista." : "Operação Salva e Confirmada!");
    });
}

// =============================================================================
// LÓGICA DE AJUDANTES DINÂMICOS NA OPERAÇÃO
// =============================================================================

window._operacaoAjudantesTempList = []; // Array global temporário para o form

// Callback do Select de Ajudantes
const selAj = document.getElementById('selectAjudantesOperacao');
if(selAj) selAj.addEventListener('change', () => {
    const id = selAj.value;
    if(!id) return;
    
    // Verifica duplicidade
    if(window._operacaoAjudantesTempList.some(x => String(x.id) === String(id))) {
        alert("Este ajudante já está na lista.");
        selAj.value = "";
        return;
    }

    const ajudante = getAjudante(id);
    if(!ajudante) return;

    // Abre modal para definir valor da diária
    openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        renderAjudantesAdicionadosList();
        selAj.value = ""; // Reseta select
    });
});

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if(!list) return;
    
    list.innerHTML = window._operacaoAjudantesTempList.map(item => {
        const nome = getAjudante(item.id)?.nome || 'ID '+item.id;
        // Botão X para remover da lista temporária
        return `<li>
            <span>${nome} (R$ ${formatCurrency(item.diaria)})</span>
            <button type="button" class="btn-mini btn-danger" onclick="removeAjudanteTemp(${item.id})">X</button>
        </li>`;
    }).join('');
}

window.removeAjudanteTemp = function(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id));
    renderAjudantesAdicionadosList();
}

// =============================================================================
// LÓGICA UI AUXILIAR
// =============================================================================

function toggleCursoInput() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'block' : 'none'; // Corrigido para block/none do container
}
document.getElementById('motoristaTemCurso')?.addEventListener('change', toggleCursoInput);

function toggleDespesaParcelas() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const div = document.getElementById('divDespesaParcelas');
    if(div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
}

function renderMinhaEmpresaInfo() {
    const d = loadData(DB_KEYS.MINHA_EMPRESA);
    const div = document.getElementById('viewMinhaEmpresaContent');
    if(div) {
        div.innerHTML = `
            <p><strong>RAZÃO SOCIAL:</strong> ${d.razaoSocial || '--'}</p>
            <p><strong>CNPJ:</strong> ${d.cnpj || '--'}</p>
            <p><strong>TELEFONE:</strong> ${d.telefone || '--'}</p>
        `;
        // Preenche form também para facilitar edição
        document.getElementById('minhaEmpresaRazaoSocial').value = d.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = d.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = d.telefone || '';
    }
}

function verificarValidadeCNH(motId) {
    const m = getMotorista(motId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffDays = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) alert(`⚠️ ALERTA CRÍTICO: A CNH DE ${m.nome} VENCEU EM ${validade.toLocaleDateString('pt-BR')}!`);
    else if (diffDays <= 30) alert(`⚠️ AVISO: A CNH DE ${m.nome} VENCE EM ${diffDays} DIAS.`);
}
// =============================================================================
// PARTE 4: PAINEL DO FUNCIONÁRIO, DASHBOARD E RELATÓRIOS
// =============================================================================

// --- RENDERIZAÇÃO DE CHECK-INS E AGENDAMENTOS ---

window.renderCheckinsTable = function() {
    // Busca operações não finalizadas (Agendadas ou Em Andamento)
    const ops = loadData(DB_KEYS.OPERACOES);
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // --- A. VISÃO DO ADMIN (Tabela Geral) ---
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    
    // Verifica se a tabela existe e se NÃO é funcionário (Admin vê tabela, Func vê Cards)
    if (tabelaAdmin && (!window.CURRENT_USER || window.CURRENT_USER.role === 'admin')) { 
        let rows = '';
        if (!pendentes.length) {
            rows = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA ROTA ATIVA NO MOMENTO.</td></tr>';
        } else {
            pendentes.forEach(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                let statusLabel = '';
                if (op.status === 'AGENDADA') statusLabel = '<span style="color:orange;">AGUARDANDO INÍCIO</span>';
                else if (op.status === 'EM_ANDAMENTO') statusLabel = '<span style="color:#0288d1; font-weight:bold;">EM ANDAMENTO</span>';

                // Ícones de Status
                const motStatusIcon = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Confirmado"></i>` 
                    : `<i class="far fa-clock" style="color:orange;" title="Pendente"></i>`;
                
                let ajudantesStatusHtml = (op.ajudantes || []).map(a => {
                    const confirmou = checkins.ajudantes && checkins.ajudantes.includes(a.id);
                    return confirmou 
                        ? `<i class="fas fa-check-circle" style="color:green; margin-right:5px;" title="Ajudante Confirmado"></i>` 
                        : `<i class="far fa-clock" style="color:orange; margin-right:5px;" title="Ajudante Pendente"></i>`;
                }).join('');

                // Botão de Ação do Admin (Forçar Início)
                let actionBtn = '';
                if (op.status === 'AGENDADA') {
                    actionBtn = `<button class="btn-primary btn-action" style="padding:6px 12px;" onclick="iniciarRotaManual(${op.id})"><i class="fas fa-play"></i> INICIAR</button>`;
                } else {
                    actionBtn = `<span style="color:#0288d1; font-size:0.8rem;">EM ROTA</span>`;
                }

                rows += `<tr>
                    <td>${dataFmt}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${motStatusIcon} ${motNome}</td>
                    <td>${ajudantesStatusHtml || '-'}</td>
                    <td>${statusLabel}</td>
                    <td>
                        ${actionBtn}
                        <button class="btn-action edit-btn" style="margin-left:5px;" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>`;
            });
        }
        
        if(tabelaAdmin.querySelector('tbody')) tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        // Badge de Notificação no Menu
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // --- B. VISÃO DO FUNCIONÁRIO (Cards Mobile) ---
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        const myEmail = window.CURRENT_USER.email;
        let myProfileId = null;
        let isMotorista = (window.CURRENT_USER.role === 'motorista');
        
        // Identifica ID do cadastro correspondente ao usuário logado
        let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const myProfile = loadData(myKey).find(p => p.uid === myUid || (p.email && p.email === myEmail));
        if (myProfile) myProfileId = myProfile.id;

        const listaFunc = document.getElementById('listaServicosAgendados');
        
        if (!myProfileId) {
            if(listaFunc) listaFunc.innerHTML = '<p style="text-align:center; color:red;">SEU PERFIL NÃO ESTÁ VINCULADO. CONTATE O ADMIN.</p>';
            return;
        }

        if (listaFunc) {
            // Filtra apenas as operações deste funcionário
            const myPendentes = pendentes.filter(op => {
                if (isMotorista) return op.motoristaId === myProfileId;
                else return (op.ajudantes || []).some(a => a.id === myProfileId);
            });

            if (!myPendentes.length) {
                listaFunc.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">VOCÊ NÃO TEM VIAGENS AGENDADAS.</p>';
            } else {
                let html = '';
                myPendentes.forEach(op => {
                    const dataFmt = op.data.split('-').reverse().join('/');
                    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                    
                    // Visualização da Equipe no Card
                    let infoEquipeHTML = '';
                    if (isMotorista) {
                        const nomesAjudantes = (op.ajudantes || []).map(a => {
                            const aj = getAjudante(a.id);
                            return aj ? aj.nome.split(' ')[0] : 'ID:'+a.id;
                        }).join(', ');
                        
                        infoEquipeHTML = `<p style="font-size:0.85rem; color:#455a64; margin-top:4px;"><i class="fas fa-users"></i> <strong>EQUIPE:</strong> ${nomesAjudantes || 'Ninguém'}</p>`;
                    } else {
                        const mot = getMotorista(op.motoristaId);
                        const nomeMot = mot ? mot.nome : 'A DEFINIR';
                        infoEquipeHTML = `<p style="font-size:0.85rem; color:#455a64; margin-top:4px;"><i class="fas fa-shipping-fast"></i> <strong>MOTORISTA:</strong> ${nomeMot}</p>`;
                    }

                    // Botão de Ação (Check-in)
                    let btnHtml = '';
                    if (isMotorista) {
                        if (op.status === 'AGENDADA') {
                            btnHtml = `<button class="btn-primary" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
                        } else if (op.status === 'EM_ANDAMENTO') {
                            btnHtml = `<button class="btn-danger" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
                        }
                    } else {
                        // Lógica Ajudante
                        const checkins = op.checkins || { ajudantes: [] };
                        const jaConfirmei = checkins.ajudantes && checkins.ajudantes.includes(myProfileId);
                        if (jaConfirmei) {
                            btnHtml = `<button class="btn-success" disabled style="width:100%; margin-top:10px; opacity:0.8;"><i class="fas fa-check"></i> PRESENÇA CONFIRMADA</button>`;
                        } else {
                            btnHtml = `<button class="btn-primary" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-user-check"></i> MARCAR PRESENÇA</button>`;
                        }
                    }

                    html += `<div class="card" style="border-left: 5px solid var(--primary-color);">
                        <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4>
                        <p style="margin-bottom:2px;"><strong>CLIENTE:</strong> ${contratante}</p>
                        ${infoEquipeHTML}
                        <p style="margin-top:5px; font-size:0.85rem;">STATUS: <strong>${op.status.replace('_',' ')}</strong></p>
                        ${btnHtml}
                    </div>`;
                });
                listaFunc.innerHTML = html;
            }
        }
    }
}

// --- MODAL DE CHECK-IN (Prepara UI) ---
window.openCheckinConfirmModal = function(opId) {
    document.getElementById('checkinOpId').value = opId;
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(opId));
    
    // Preenche dados visuais
    document.getElementById('checkinDisplayData').textContent = op.data.split('-').reverse().join('/');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;

    // Configura campos baseados no papel e status
    if(window.CURRENT_USER.role === 'motorista') {
        document.getElementById('checkinDriverFields').style.display = 'block';
        if(op.status === 'AGENDADA') {
            document.getElementById('checkinStep').value = 'start';
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
            document.getElementById('btnConfirmCheckin').innerHTML = 'CONFIRMAR INÍCIO';
            document.getElementById('btnConfirmCheckin').className = 'btn-primary';
        } else {
            document.getElementById('checkinStep').value = 'end';
            document.getElementById('divKmInicial').style.display = 'none';
            document.getElementById('divKmFinal').style.display = 'block';
            document.getElementById('checkinKmInicialReadonly').value = op.kmInicial;
            document.getElementById('btnConfirmCheckin').innerHTML = 'FINALIZAR VIAGEM';
            document.getElementById('btnConfirmCheckin').className = 'btn-danger';
        }
    } else {
        // Ajudante só confirma
        document.getElementById('checkinStep').value = 'presence';
        document.getElementById('checkinDriverFields').style.display = 'none';
        document.getElementById('btnConfirmCheckin').innerHTML = 'CONFIRMAR PRESENÇA';
    }
    
    document.getElementById('modalCheckinConfirm').style.display = 'block';
}

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
}

// =============================================================================
// DASHBOARD, GRÁFICOS E CALENDÁRIO (ADMIN)
// =============================================================================

let currentDate = new Date(); // Data base para calendário/dashboard

window.updateDashboardStats = function() {
    // PROTEÇÃO: Se não existir o elemento, é porque estamos no Super Admin ou outra tela.
    if (!document.getElementById('faturamentoMes')) return;

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();
    
    let totalFat = 0;
    let totalCustos = 0;

    // Filtra operações do mês atual selecionado
    const opsMes = ops.filter(op => {
        if(op.status !== 'CONFIRMADA') return false;
        const d = new Date(op.data + 'T00:00:00');
        return d.getMonth() === m && d.getFullYear() === y;
    });

    opsMes.forEach(op => {
        totalFat += (op.faturamento || 0);
        
        const custoComb = Number(op.combustivel) || 0;
        const checkins = op.checkins || { ajudantes: [] };
        
        // Custo com ajudantes
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => {
            // Só soma se ajudante confirmou presença
            if (checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                return s + (Number(a.diaria) || 0);
            }
            return s;
        }, 0);

        totalCustos += custoComb + (op.comissao || 0) + totalDiarias + (op.despesas || 0);
    });

    // Soma despesas gerais do mês
    const totalDespGeral = despesas.filter(d => {
        const dataD = new Date(d.data + 'T00:00:00');
        return dataD.getMonth() === m && dataD.getFullYear() === y;
    }).reduce((acc, d) => acc + (d.valor || 0), 0);
    
    totalCustos += totalDespGeral;
    const liquido = totalFat - totalCustos;

    document.getElementById('faturamentoMes').textContent = formatCurrency(totalFat);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    
    const elRec = document.getElementById('receitaMes');
    elRec.textContent = formatCurrency(liquido);
    elRec.style.color = liquido >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
}

// --- CALENDÁRIO ---
window.changeMonth = function(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
    updateDashboardStats(); // Atualiza números ao mudar mês
}

window.renderCalendar = function(date) {
    if(!document.getElementById('calendarGrid')) return;

    const grid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('currentMonthYear');
    
    grid.innerHTML = '';
    monthLabel.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    // Cabeçalho Dias
    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    weekDays.forEach(day => {
        const div = document.createElement('div');
        div.className = 'day-label';
        div.textContent = day;
        grid.appendChild(div);
    });

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Espaços vazios antes do dia 1
    for(let i=0; i<firstDayIndex; i++){
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    // Dias do mês
    for(let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;
        
        const dataIso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // Verifica se tem operação neste dia
        const temOp = ops.some(op => op.data === dataIso);

        if(temOp) {
            cell.classList.add('has-operation');
            cell.title = "Clique para ver operações";
            cell.onclick = () => {
                // Filtra e mostra alerta simples (pode ser melhorado para modal)
                const opsDia = ops.filter(o => o.data === dataIso);
                const desc = opsDia.map(o => `- ${o.veiculoPlaca} (${o.status})`).join('\n');
                alert(`OPERAÇÕES NO DIA ${d}:\n\n${desc}`);
            };
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            cell.appendChild(dot);
        }

        grid.appendChild(cell);
    }
}

// --- GRÁFICOS (Chart.js) ---
let chartInstance = null;

window.renderCharts = function() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return; // Se não estiver na tela, sai
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    
    const labels = [];
    const dataCustos = [];
    const dataReceita = [];
    const dataLucro = [];

    // Calcula total histórico global
    let totalReceitaHistorica = 0;
    ops.forEach(o => { if(o.status === 'CONFIRMADA') totalReceitaHistorica += (o.faturamento || 0); });
    const elHist = document.getElementById('receitaTotalHistorico');
    if(elHist) elHist.textContent = formatCurrency(totalReceitaHistorica);

    // Loop últimos 6 meses
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

        // Filtra dados do mês
        let receitaMes = 0;
        let custosMes = 0;

        // Soma Operações
        ops.filter(op => {
            const dateOp = new Date(op.data + 'T00:00:00');
            return op.status === 'CONFIRMADA' && dateOp.getMonth() === m && dateOp.getFullYear() === y;
        }).forEach(op => {
            receitaMes += (op.faturamento || 0);
            
            // Custos operacionais
            const checkins = op.checkins || {};
            const diarias = (op.ajudantes || []).reduce((acc, a) => 
                (checkins.ajudantes && checkins.ajudantes.includes(a.id) ? acc + (Number(a.diaria)||0) : acc), 0);
            
            custosMes += (op.combustivel||0) + (op.comissao||0) + (op.despesas||0) + diarias;
        });

        // Soma Despesas Gerais
        const despesasGeraisMes = despesas.filter(dp => {
            const dateDp = new Date(dp.data + 'T00:00:00');
            return dateDp.getMonth() === m && dateDp.getFullYear() === y;
        }).reduce((acc, dp) => acc + (dp.valor || 0), 0);

        custosMes += despesasGeraisMes;

        dataReceita.push(receitaMes);
        dataCustos.push(custosMes);
        dataLucro.push(receitaMes - custosMes);
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'RECEITA', data: dataReceita, backgroundColor: '#4caf50', order: 2 },
                { label: 'CUSTOS', data: dataCustos, backgroundColor: '#f44336', order: 3 },
                { label: 'LUCRO', data: dataLucro, type: 'line', borderColor: '#263238', borderWidth: 3, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// =============================================================================
// RELATÓRIOS E PDF
// =============================================================================

window.gerarRelatorio = function(e) {
    e.preventDefault();
    const dtIni = document.getElementById('dataInicioRelatorio').value;
    const dtFim = document.getElementById('dataFimRelatorio').value;
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const veic = document.getElementById('selectVeiculoRelatorio').value;
    
    // Lógica de filtro e geração HTML do relatório (Simplificada)
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if(o.status !== 'CONFIRMADA') return false;
        if(o.data < dtIni || o.data > dtFim) return false;
        if(motId && String(o.motoristaId) !== motId) return false;
        if(veic && o.veiculoPlaca !== veic) return false;
        return true;
    });

    let totalFat = 0, totalLucro = 0;
    
    let html = `<table class="data-table report-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th><th>LUCRO EST.</th></tr></thead><tbody>`;
    
    ops.forEach(o => {
        // Cálculo simplificado de custo por linha
        const custo = (o.combustivel||0) + (o.comissao||0) + (o.despesas||0); 
        const lucro = (o.faturamento||0) - custo;
        totalFat += (o.faturamento||0);
        totalLucro += lucro;
        
        const motNome = getMotorista(o.motoristaId)?.nome || '-';
        
        html += `<tr>
            <td>${o.data.split('-').reverse().join('/')}</td>
            <td>${o.veiculoPlaca}</td>
            <td>${motNome}</td>
            <td>${formatCurrency(o.faturamento)}</td>
            <td>${formatCurrency(lucro)}</td>
        </tr>`;
    });
    
    html += `<tr style="background:#eee; font-weight:bold;"><td colspan="3">TOTAIS</td><td>${formatCurrency(totalFat)}</td><td>${formatCurrency(totalLucro)}</td></tr></tbody></table>`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

window.exportReportToPDF = function() {
    const element = document.getElementById('reportContent');
    if(!element || element.innerHTML.trim() === '') return alert("Gere o relatório primeiro.");
    
    const opt = {
        margin: 10,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    
    // Usa html2pdf
    html2pdf().set(opt).from(element).save();
}

window.exportEmployeeHistoryToPDF = function() {
    // Exporta histórico do funcionário
    const element = document.getElementById('tabelaHistoricoCompleto');
    const opt = {
        margin: 10,
        filename: 'meu_historico.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}
// =============================================================================
// PARTE 5: SUPER ADMIN, BACKUP E INICIALIZAÇÃO DO SISTEMA
// =============================================================================

// --- GESTÃO GLOBAL (SUPER ADMIN) ---

async function createCompanyAndUser(e) {
    e.preventDefault();
    if (!window.dbRef || !window.dbRef.secondaryApp) return alert("Erro de configuração do Firebase.");

    const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
    const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
    const password = document.getElementById('newAdminPassword').value;

    if (!domain.includes('.')) return alert("O domínio da empresa deve ser válido (ex: empresa.com)");
    if (!email.endsWith(domain)) return alert(`O e-mail do admin deve terminar com @${domain}`);

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "CRIANDO...";

    try {
        // 1. Usa o APP SECUNDÁRIO para criar o usuário sem deslogar o Super Admin
        const { getAuth, createUserWithEmailAndPassword, signOut } = window.dbRef;
        // Pega auth da instância secundária
        const auth2 = getAuth(window.dbRef.secondaryApp);
        
        const userCred = await createUserWithEmailAndPassword(auth2, email, password);
        const newUser = userCred.user;

        // 2. Cria o registro no Firestore (Banco de Dados Principal)
        const { setDoc, doc, db } = window.dbRef;
        
        await setDoc(doc(db, "users", newUser.uid), {
            uid: newUser.uid,
            name: "ADMINISTRADOR",
            email: email,
            role: "admin",
            company: domain,
            approved: true,
            createdAt: new Date().toISOString()
        });

        // 3. Inicializa a estrutura básica da empresa (Opcional, mas bom para evitar erros)
        await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { 
            items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } 
        });

        // 4. Desloga da instância secundária para limpar memória
        await signOut(auth2);

        alert(`SUCESSO!\nEmpresa: ${domain}\nUsuário: ${email}\n\nO admin já pode fazer login.`);
        document.getElementById('formCreateCompany').reset();

    } catch (error) {
        console.error(error);
        let msg = error.message;
        if(error.code === 'auth/email-already-in-use') msg = "Este e-mail já está cadastrado.";
        alert("ERRO AO CRIAR: " + msg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Listener do formulário Super Admin
const fSuper = document.getElementById('formCreateCompany');
if(fSuper) fSuper.addEventListener('submit', createCompanyAndUser);


// --- BACKUP E RESTAURAÇÃO DE DADOS ---

window.exportDataBackup = function() {
    if(window.IS_READ_ONLY) return alert("Função restrita a administradores.");
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(APP_CACHE));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const date = new Date().toISOString().split('T')[0];
    downloadAnchorNode.setAttribute("download", `backup_logimaster_${date}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

window.importDataBackup = function(event) {
    if(window.IS_READ_ONLY) return alert("Função restrita a administradores.");
    
    const file = event.target.files[0];
    if (!file) return;

    if(!confirm("ATENÇÃO: Isso substituirá TODOS os dados atuais pelos do arquivo.\n\nDeseja continuar?")) {
        event.target.value = ''; 
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            
            // Validação básica
            if(!json[DB_KEYS.MOTORISTAS] || !json[DB_KEYS.OPERACOES]) throw new Error("Arquivo inválido.");

            // Restaura cada chave
            for (let key in json) {
                if (DB_KEYS[key.toUpperCase()] || Object.values(DB_KEYS).includes(key)) {
                    await saveData(key, json[key]);
                }
            }
            
            alert("Restauração concluída! A página será recarregada.");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("Erro ao ler arquivo: " + err.message);
        }
    };
    reader.readAsText(file);
}

// =============================================================================
// INICIALIZAÇÃO DO SISTEMA (Roteamento por Papel)
// =============================================================================

window.initSystemByRole = function(user) {
    console.log("Inicializando sistema para:", user.role);
    window.CURRENT_USER = user;
    
    // Esconde todos os menus primeiro
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // Remove classe 'active' de todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // --- ROTA 1: SUPER ADMIN ---
    if(user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active'); // Mostra painel global
        setupSuperAdminRealtime(); // Monitora usuários globais
    } 
    // --- ROTA 2: ADMIN DA EMPRESA ---
    else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Mostra Dashboard
        setupCompanyRealtime(); // Carrega dados da empresa
    } 
    // --- ROTA 3: FUNCIONÁRIOS (Motorista/Ajudante) ---
    else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active'); // Mostra Check-in
        window.IS_READ_ONLY = true; // Trava edições
        setupCompanyRealtime(); // Carrega dados para leitura
    }
};

// --- LISTENERS DE REALTIME (FIRESTORE) ---

function setupCompanyRealtime() {
    if(!window.dbRef || !window.CURRENT_USER || !window.CURRENT_USER.company) return;
    
    const { db, doc, onSnapshot } = window.dbRef;
    const company = window.CURRENT_USER.company;

    // Escuta todas as coleções definidas em DB_KEYS
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', company, 'data', key), (docSnap) => {
            if(docSnap.exists()) {
                APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            } else {
                // Se não existir, inicializa vazio no cache (não salva no banco ainda pra economizar write)
                APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            }
            
            // Atualiza UI sempre que chegar dados novos
            refreshUI();
        }, (error) => {
            console.error(`Erro ao ouvir ${key}:`, error);
        });
    });
}

function setupSuperAdminRealtime() {
    // Escuta coleção de usuários globalmente para montar a hierarquia
    const { db, collection, query, onSnapshot } = window.dbRef;
    const q = query(collection(db, "users"));
    
    onSnapshot(q, (snapshot) => {
        const users = [];
        snapshot.forEach(doc => users.push(doc.data()));
        renderGlobalHierarchy(users); // Função definida (mas precisa existir visualmente)
    });
}

// Função auxiliar para renderizar hierarquia no Super Admin
function renderGlobalHierarchy(users) {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    // Agrupa por empresa
    const groups = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return;
        const comp = u.company || 'SEM EMPRESA';
        if(!groups[comp]) groups[comp] = [];
        groups[comp].push(u);
    });

    let html = '';
    for(const [comp, list] of Object.entries(groups)) {
        html += `<div class="domain-block">
            <div class="domain-header"><strong>${comp.toUpperCase()}</strong> <span class="badge">${list.length} USERS</span></div>
            <div style="padding:10px;">
                ${list.map(u => `<div>${u.role === 'admin' ? '👑' : '👤'} ${u.email} (${u.name})</div>`).join('')}
            </div>
        </div>`;
    }
    container.innerHTML = html || '<p>Nenhum usuário encontrado.</p>';
}

// --- ATUALIZAÇÃO DA INTERFACE (Centralizada) ---

function refreshUI() {
    // Admin
    if (window.CURRENT_USER.role === 'admin') {
        populateAllSelects(); // Parte 1
        renderOperacaoTable(); // Parte 2
        renderCadastroTable(DB_KEYS.MOTORISTAS); // Parte 2
        renderDespesasTable(); // (Precisa ter renderDespesasTable implementada similar às outras)
        updateDashboardStats(); // Parte 4
        renderCalendar(currentDate); // Parte 4
        renderCharts(); // Parte 4
        renderCheckinsTable(); // Parte 4 (Visão Admin)
        checkAndShowReminders();
        renderMinhaEmpresaInfo();
    } 
    // Funcionário
    else if (window.CURRENT_USER.role !== 'admin' && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        renderCheckinsTable(); // Parte 4 (Visão Mobile)
        if(typeof renderEmployeeProfileView === 'function') renderEmployeeProfileView();
    }
}

// Lógica de Lembretes (Simples)
function checkAndShowReminders() {
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const hoje = new Date().toISOString().split('T')[0];
    const pendentes = despesas.filter(d => !d.pago && d.data <= hoje);
    
    const list = document.getElementById('reminderList');
    if(list && pendentes.length > 0) {
        // Apenas exibe modal se houver pendências vencidas/hoje
        // (Lógica de abrir modal pode ser refinada para não abrir toda hora)
        list.innerHTML = pendentes.map(d => 
            `<div class="reminder-item">
                <div><strong>VENCEU: ${d.data.split('-').reverse().join('/')}</strong><br>${d.descricao} - ${formatCurrency(d.valor)}</div>
            </div>`
        ).join('');
        // document.getElementById('reminderModal').style.display = 'block'; // Descomentar se quiser popup automático
    }
}

// Render Table de Despesas (Faltava na parte 2, adicionando aqui para garantir)
window.renderDespesasTable = function() {
    const tabela = document.getElementById('tabelaDespesasGerais');
    if(!tabela) return;
    const data = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0,50);
    
    tabela.querySelector('tbody').innerHTML = data.map(d => `
        <tr>
            <td>${d.data.split('-').reverse().join('/')}</td>
            <td>${d.veiculoPlaca || '-'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td>${d.pago ? '<span style="color:green">PAGO</span>' : '<span style="color:red">PENDENTE</span>'}</td>
            <td><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="6">NENHUMA DESPESA.</td></tr>';
}

// --- SETUP INICIAL ---
document.addEventListener('DOMContentLoaded', () => {
    // Abas de navegação lateral
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            // Remove active de todos
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Ativa atual
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');

            // Renderiza gráficos se for a aba gráficos
            if(pageId === 'graficos') renderCharts();
            // Renderiza selects se for operações (garantia)
            if(pageId === 'operacoes') populateAllSelects();
        });
    });

    // Abas de Cadastro (interno)
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });
    
    // Inicializa Handlers
    if(typeof setupFormHandlers === 'function') setupFormHandlers();
    
    // Mobile Menu Toggle
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebarOverlay').classList.add('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
});