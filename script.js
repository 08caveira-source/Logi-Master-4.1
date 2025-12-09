// =============================================================================
// PARTE 1: CONFIGURAÇÕES, CACHE E UTILITÁRIOS
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
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

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

window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// --- FUNÇÕES DE CARREGAMENTO E SALVAMENTO ---

function loadData(key) { 
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); 
}

async function saveData(key, value) {
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES && key !== DB_KEYS.PROFILE_REQUESTS) return;
    
    APP_CACHE[key] = value;
    
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.company) {
        try {
            await window.dbRef.setDoc(
                window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', key), 
                { items: value }
            );
        } catch (e) { 
            console.error("Erro ao salvar no Firebase:", e); 
        }
    } 
}

// --- UTILITÁRIOS ---

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
    navigator.clipboard.writeText(t).then(() => alert("Copiado!"), () => alert("Erro ao copiar.")); 
}

function detectPixType(k) { 
    if(k.includes('@')) return 'EMAIL'; 
    if(/^\d{11}$/.test(k)) return 'CPF/TEL'; 
    if(/^\d{14}$/.test(k)) return 'CNPJ';
    return 'OUTRO'; 
}

// --- GETTERS SEGUROS ---

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(p) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === p); }
function getContratante(c) { return loadData(DB_KEYS.CONTRATANTES).find(x => x.cnpj === c); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// --- POPULAR SELECTS ---

window.populateAllSelects = function() {
    populateSelect('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    populateSelect('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome');
    populateSelect('selectAjudantesOperacao', loadData(DB_KEYS.AJUDANTES), 'id', 'nome');
    
    populateSelect('selectMotoristaRelatorio', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoRelatorio', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteRelatorio', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    
    populateSelect('selectMotoristaRecibo', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome');
    populateSelect('selectVeiculoRecibo', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
    populateSelect('selectContratanteRecibo', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial');
    
    populateSelect('selectVeiculoDespesaGeral', loadData(DB_KEYS.VEICULOS), 'placa', 'placa');
}

function populateSelect(elementId, dataArray, valueKey, textKey) {
    const select = document.getElementById(elementId);
    if(!select) return;
    
    // Limpa opções anteriores (exceto a primeira se for placeholder padrão)
    select.innerHTML = '<option value="">SELECIONE...</option>';
    
    if (dataArray && dataArray.length > 0) {
        dataArray.forEach(item => {
            select.innerHTML += `<option value="${item[valueKey]}">${item[textKey]}</option>`;
        });
    }
}
// =============================================================================
// PARTE 2: UI - TABELAS E MODAIS
// =============================================================================

// --- RENDERIZAÇÃO GENÉRICA DE TABELAS DE CADASTRO ---

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela = null;
    let idKey = 'id'; // Chave padrão

    // Mapeamento da Tabela HTML
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) { tabela = document.getElementById('tabelaVeiculos'); idKey='placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabela = document.getElementById('tabelaContratantes'); idKey='cnpj'; }
    else if (key === DB_KEYS.ATIVIDADES) { renderAtividadesTable(); return; } // Tratamento especial
    
    if(!tabela) return;
    
    // Gera linhas
    let rows = data.map(item => {
        let c1 = item.id || item.placa || item.cnpj;
        let c2 = item.nome || item.modelo || item.razaoSocial;
        let c3 = item.documento || item.ano || item.telefone || ''; 
        
        let btns = `<button class="btn-action view-btn" onclick="viewCadastro('${key}','${c1}')" type="button"><i class="fas fa-eye"></i></button>`;
        
        if(!window.IS_READ_ONLY) {
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${key}','${c1}')" type="button"><i class="fas fa-trash"></i></button>`;
        }
        
        return `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td><td>${btns}</td></tr>`;
    }).join('');
    
    tabela.querySelector('tbody').innerHTML = rows || '<tr><td colspan="4" style="text-align:center">NENHUM DADO CADASTRADO.</td></tr>';
}

// --- RENDERIZAÇÃO ESPECÍFICA: ATIVIDADES (NOVO) ---
function renderAtividadesTable() {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tabela = document.getElementById('tabelaAtividades');
    if(!tabela) return;

    let rows = data.map(item => {
        // Botão Excluir
        let btn = !window.IS_READ_ONLY 
            ? `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}','${item.id}')" type="button"><i class="fas fa-trash"></i></button>`
            : '';
        return `<tr><td>${item.id}</td><td>${item.nome}</td><td>${btn}</td></tr>`;
    }).join('');

    tabela.querySelector('tbody').innerHTML = rows || '<tr><td colspan="3" style="text-align:center">NENHUMA ATIVIDADE.</td></tr>';
}

// --- VISUALIZAR DETALHES CADASTRO ---
window.viewCadastro = function(key, id) {
    let item = null;
    if(key===DB_KEYS.MOTORISTAS) item = getMotorista(id);
    else if(key===DB_KEYS.AJUDANTES) item = getAjudante(id);
    else if(key===DB_KEYS.VEICULOS) item = getVeiculo(id);
    else if(key===DB_KEYS.CONTRATANTES) item = getContratante(id);
    
    if(!item) return;

    let html = `<div style="line-height:1.8">`;
    for(let k in item) {
        if(typeof item[k] !== 'object' && item[k] !== '') {
            html += `<b>${k.toUpperCase()}:</b> ${item[k]}<br>`;
        }
    }
    html += `</div>`;
    openViewModal("DETALHES", html);
}

// --- EXCLUIR ITEM ---
window.deleteItem = function(key, id) {
    if(window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    if(!confirm("CONFIRMA A EXCLUSÃO DESTE ITEM?")) return;
    
    let arr = loadData(key);
    let idKey = (key===DB_KEYS.VEICULOS)?'placa':(key===DB_KEYS.CONTRATANTES?'cnpj':'id');
    
    // Filtra removendo o item
    const newArr = arr.filter(i => String(i[idKey]) !== String(id));
    saveData(key, newArr);
    
    // Atualiza tabelas e selects
    if(key === DB_KEYS.ATIVIDADES) renderAtividadesTable();
    else renderCadastroTable(key);
    
    populateAllSelects();
    if(key === DB_KEYS.DESPESAS_GERAIS && typeof renderDespesasTable === 'function') renderDespesasTable();
    if(key === DB_KEYS.OPERACOES && typeof renderOperacaoTable === 'function') renderOperacaoTable();
}

// --- TABELA DE OPERAÇÕES ---
window.renderOperacaoTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    const opsExibidas = ops.slice(0, 50); // Otimização

    if (!opsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA.</td></tr>';
        return;
    }

    let rows = '';
    opsExibidas.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'MOTORISTA EXCLUÍDO';
        const dataFmt = op.data.split('-').reverse().join('/');
        
        let statusBadge = '';
        if (op.status === 'AGENDADA') statusBadge = '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') statusBadge = '<span style="background:#0288d1; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">EM ANDAMENTO</span>';
        else statusBadge = '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})" type="button"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})" type="button"><i class="fas fa-edit"></i></button>`;
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})" type="button"><i class="fas fa-trash"></i></button>`;
        }

        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${motorista}</td>
            <td>${statusBadge}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td>${btns}</td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

// --- EDIÇÃO DE OPERAÇÃO (CORREÇÃO DO STATUS/CHECKBOX) ---
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
    
    // --- CORREÇÃO IMPORTANTE: CHECKBOX DE AGENDAMENTO ---
    // Se o status for AGENDADA, marca o checkbox.
    const isAgendada = (op.status === 'AGENDADA');
    document.getElementById('operacaoIsAgendamento').checked = isAgendada;

    // Restaura ajudantes
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    renderAjudantesAdicionadosList(); // Definida na parte 3
    
    alert(`EDITANDO OPERAÇÃO ID: ${id}`);
}

// --- MODAIS ---
window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
    
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const nome = getAjudante(a.id)?.nome || 'ID:'+a.id;
        return `<li>${nome} - R$ ${formatCurrency(a.diaria)}</li>`;
    }).join('') || '<li>Nenhum</li>';

    const html = `
        <p><strong>STATUS:</strong> ${op.status}</p>
        <p><strong>DATA:</strong> ${op.data.split('-').reverse().join('/')}</p>
        <p><strong>MOTORISTA:</strong> ${motorista}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
        <p><strong>CONTRATANTE:</strong> ${contratante}</p>
        <hr>
        <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
        <p><strong>COMISSÃO:</strong> ${formatCurrency(op.comissao)}</p>
        <p><strong>ABASTECIMENTO:</strong> ${formatCurrency(op.combustivel)}</p>
        <p><strong>DESPESAS:</strong> ${formatCurrency(op.despesas)}</p>
        <p><strong>LUCRO EST.:</strong> ${formatCurrency((op.faturamento||0) - ((op.combustivel||0) + (op.comissao||0) + (op.despesas||0)))}</p>
        <hr>
        <strong>EQUIPE:</strong>
        <ul>${ajudantesHtml}</ul>
    `;
    openOperationDetails("DETALHES DA OPERAÇÃO", html);
}

function openViewModal(title, html) {
    document.getElementById('viewItemTitle').textContent = title;
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'block';
}
function closeViewModal() { document.getElementById('viewItemModal').style.display = 'none'; }
function openOperationDetails(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBodyContent').innerHTML = html;
    document.getElementById('operationDetailsModal').style.display = 'block';
}
function closeModal() { document.getElementById('operationDetailsModal').style.display = 'none'; }
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
        const newId = isEdit ? Number(idHidden) : Date.now();
        const nome = document.getElementById('motoristaNome').value.toUpperCase();

        // Sugestão de email para login (apenas visual, criação real é feita pelo admin)
        let email = isEdit ? (arr.find(x=>x.id==newId)?.email || "") : "";
        if(!email && window.CURRENT_USER) {
             const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
             email = `${cleanName}@${window.CURRENT_USER.company}`;
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
            uid: isEdit ? (arr.find(x=>x.id==newId)?.uid || null) : null
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
        populateAllSelects(); // Atualiza dropdowns imediatamente
        alert("Motorista salvo!");
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

        const arrFiltered = arr.filter(x => x.placa !== placa);
        arrFiltered.push(obj);
        
        saveData(DB_KEYS.VEICULOS, arrFiltered);
        fVeic.reset();
        renderCadastroTable(DB_KEYS.VEICULOS);
        populateAllSelects();
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
        populateAllSelects();
        alert("Contratante salva!");
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
        
        let email = isEdit ? (arr.find(x=>x.id==newId)?.email || "") : "";
        if(!email && window.CURRENT_USER) {
             const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
             email = `${cleanName}@${window.CURRENT_USER.company}`;
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
        populateAllSelects();
        alert("Ajudante salvo!");
    });

    // --- 5. CADASTRO DE ATIVIDADE (CORRIGIDO) ---
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
        renderAtividadesTable(); // Atualiza a tabela nova
        populateAllSelects();    // Atualiza o select da operação
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
        renderMinhaEmpresaInfo();
        alert("Dados da empresa atualizados.");
    });

    // --- 7. MENSAGENS INTERNAS (CORRIGIDO REDIRECIONAMENTO) ---
    const fMsg = document.getElementById('formAdminMessage');
    if(fMsg) fMsg.addEventListener('submit', e => {
        e.preventDefault(); // Impede recarregar a página
        const texto = document.getElementById('msgTextAdmin').value;
        if(!texto) return;
        
        // Aqui você implementaria o salvamento real no Firebase.
        // Como exemplo, vamos apenas alertar e limpar.
        alert("MENSAGEM ENVIADA PARA A EQUIPE!\n(Funcionalidade visual implementada)");
        fMsg.reset();
    });

    // --- 8. OPERAÇÃO (LÓGICA DE STATUS E SALVAMENTO) ---
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', e => {
        e.preventDefault();
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        
        // CORREÇÃO CRÍTICA: Status baseado no Checkbox
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';

        const motId = document.getElementById('selectMotoristaOperacao').value;
        if(!motId) return alert("Selecione um Motorista.");
        
        verificarValidadeCNH(motId);

        const obj = {
            id: isEdit ? Number(idHidden) : Date.now(),
            status: statusFinal, // Força o status correto
            
            data: document.getElementById('operacaoData').value,
            motoristaId: Number(motId),
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value,
            
            faturamento: Number(document.getElementById('operacaoFaturamento').value),
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
            comissao: Number(document.getElementById('operacaoComissao').value),
            combustivel: Number(document.getElementById('operacaoCombustivel').value),
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
            despesas: Number(document.getElementById('operacaoDespesas').value),
            kmRodado: Number(document.getElementById('operacaoKmRodado').value),
            
            ajudantes: window._operacaoAjudantesTempList || [],
            
            // Mantém dados de checkin existentes se for edição
            checkins: isEdit ? (arr.find(o=>o.id==idHidden)?.checkins || {motorista:false, ajudantes:[], ajudantesLog:{}}) 
                             : {motorista:false, ajudantes:[], ajudantesLog:{}},
            
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
        
        fOp.reset();
        document.getElementById('operacaoId').value = '';
        document.getElementById('operacaoIsAgendamento').checked = false; // Reseta checkbox
        window._operacaoAjudantesTempList = [];
        renderAjudantesAdicionadosList();
        
        renderOperacaoTable();
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); // Atualiza painel de checkins
        if(typeof updateDashboardStats === 'function') updateDashboardStats();

        alert(isAgendamento ? "Operação Agendada! (Enviada para o Motorista)" : "Operação Salva e Confirmada!");
    });
}

// =============================================================================
// AJUDANTES DINÂMICOS
// =============================================================================

window._operacaoAjudantesTempList = [];

const selAj = document.getElementById('selectAjudantesOperacao');
if(selAj) selAj.addEventListener('change', () => {
    const id = selAj.value;
    if(!id) return;
    
    if(window._operacaoAjudantesTempList.some(x => String(x.id) === String(id))) {
        alert("Este ajudante já está na lista.");
        selAj.value = "";
        return;
    }

    const ajudante = getAjudante(id);
    if(!ajudante) return;

    openAdicionarAjudanteModal(ajudante, (dados) => {
        window._operacaoAjudantesTempList.push(dados);
        renderAjudantesAdicionadosList();
        selAj.value = "";
    });
});

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if(!list) return;
    list.innerHTML = window._operacaoAjudantesTempList.map(item => {
        const nome = getAjudante(item.id)?.nome || 'ID '+item.id;
        return `<li><span>${nome} (R$ ${formatCurrency(item.diaria)})</span><button type="button" class="btn-mini btn-danger" onclick="removeAjudanteTemp(${item.id})">X</button></li>`;
    }).join('');
}

window.removeAjudanteTemp = function(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id));
    renderAjudantesAdicionadosList();
}

// =============================================================================
// FILTRO DE FUNCIONÁRIO (CORRIGIDO)
// =============================================================================

window.filtrarHistoricoFuncionario = function(e) {
    if(e) e.preventDefault();
    if (!window.CURRENT_USER) return;

    const dataIniVal = document.getElementById('empDataInicio').value;
    const dataFimVal = document.getElementById('empDataFim').value;
    
    if(!dataIniVal || !dataFimVal) return alert("Selecione as datas inicial e final.");

    const di = dataIniVal; // YYYY-MM-DD
    const df = dataFimVal;

    // Busca Perfil Vinculado
    let myProfileId = null;
    let isMotorista = (window.CURRENT_USER.role === 'motorista');
    let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    
    // Tenta encontrar por UID ou Email
    const myProfile = loadData(myKey).find(p => p.uid === window.CURRENT_USER.uid || (p.email && p.email === window.CURRENT_USER.email));
    
    if (myProfile) myProfileId = myProfile.id;
    if (!myProfileId) return alert("ERRO: Seu usuário não está vinculado a um cadastro de Motorista/Ajudante.");

    const ops = loadData(DB_KEYS.OPERACOES);
    let totalReceber = 0;
    
    const resultado = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < di || op.data > df) return false;

        if (isMotorista) {
            return Number(op.motoristaId) === Number(myProfileId);
        } else {
            return (op.ajudantes || []).some(a => Number(a.id) === Number(myProfileId));
        }
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    
    if (resultado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO NESTE PERÍODO.</td></tr>';
        document.getElementById('empTotalReceber').textContent = 'R$ 0,00';
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'none';
    } else {
        let html = '';
        resultado.forEach(op => {
            const dataFmt = op.data.split('-').reverse().join('/');
            const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
            
            let valor = 0;
            if (isMotorista) {
                valor = op.comissao || 0;
            } else {
                // Ajudante: Verifica presença para somar valor
                const ajData = (op.ajudantes || []).find(a => Number(a.id) === Number(myProfileId));
                const checkins = op.checkins || { ajudantes: [] };
                if (checkins.ajudantes && checkins.ajudantes.includes(myProfileId)) {
                    valor = Number(ajData.diaria) || 0;
                }
            }
            
            totalReceber += valor;
            const styleVal = valor > 0 ? 'color:green; font-weight:bold;' : 'color:red;';

            html += `<tr>
                <td>${dataFmt}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${contratante}</td>
                <td style="${styleVal}">${formatCurrency(valor)}</td>
                <td>CONFIRMADA</td>
            </tr>`;
        });
        tbody.innerHTML = html;
        document.getElementById('empTotalReceber').textContent = formatCurrency(totalReceber);
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'block';
    }
};

// UI Auxiliar
function toggleCursoInput() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'block' : 'none';
}
document.getElementById('motoristaTemCurso')?.addEventListener('change', toggleCursoInput);

function renderMinhaEmpresaInfo() {
    const d = loadData(DB_KEYS.MINHA_EMPRESA);
    const div = document.getElementById('viewMinhaEmpresaContent');
    if(div) {
        div.innerHTML = `<p><strong>RAZÃO:</strong> ${d.razaoSocial||''}</p><p><strong>CNPJ:</strong> ${d.cnpj||''}</p>`;
        document.getElementById('minhaEmpresaRazaoSocial').value = d.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = d.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = d.telefone || '';
    }
}

function verificarValidadeCNH(motId) {
    const m = getMotorista(motId);
    if (!m || !m.validadeCNH) return;
    const diffDays = Math.ceil((new Date(m.validadeCNH) - new Date()) / (86400000));
    if (diffDays < 0) alert(`⚠️ AVISO: A CNH DE ${m.nome} ESTÁ VENCIDA!`);
}
// =============================================================================
// PARTE 4: PAINEL DO FUNCIONÁRIO, DASHBOARD E RELATÓRIOS
// =============================================================================

// --- RENDERIZAÇÃO DE CHECK-INS E AGENDAMENTOS ---

window.renderCheckinsTable = function() {
    // Busca operações não finalizadas (Agendadas ou Em Andamento)
    const ops = loadData(DB_KEYS.OPERACOES);
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // --- A. VISÃO DO ADMIN (TABELA GERAL) ---
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    
    // Só renderiza tabela se ela existir e o usuário for ADMIN
    if (tabelaAdmin && window.CURRENT_USER && window.CURRENT_USER.role === 'admin') { 
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
                        ? `<i class="fas fa-check-circle" style="color:green; margin-right:5px;" title="Confirmado"></i>` 
                        : `<i class="far fa-clock" style="color:orange; margin-right:5px;" title="Pendente"></i>`;
                }).join('');

                // Botão de Ação do Admin (Forçar Início)
                let actionBtn = '';
                if (op.status === 'AGENDADA') {
                    actionBtn = `<button class="btn-primary btn-action" style="padding:6px 12px;" onclick="iniciarRotaManual(${op.id})" type="button"><i class="fas fa-play"></i> INICIAR</button>`;
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
                        <button class="btn-action edit-btn" style="margin-left:5px;" onclick="editOperacaoItem(${op.id})" type="button"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>`;
            });
        }
        
        if(tabelaAdmin.querySelector('tbody')) tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        // Badge de Notificação no Menu Lateral
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // --- B. VISÃO DO FUNCIONÁRIO (CARDS MOBILE) ---
    // Verifica se é funcionário para preencher a lista de "Meus Check-ins"
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const listaFunc = document.getElementById('listaServicosAgendados');
        if(!listaFunc) return; // Se não estiver na tela de funcionário, sai.

        const myUid = window.CURRENT_USER.uid;
        const myEmail = window.CURRENT_USER.email;
        let myProfileId = null;
        let isMotorista = (window.CURRENT_USER.role === 'motorista');
        
        // --- BUSCA VÍNCULO DO PERFIL (CRÍTICO) ---
        let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        // Tenta achar pelo UID (Login Google/Auth) OU pelo E-mail (Cadastro Admin)
        const myProfile = loadData(myKey).find(p => p.uid === myUid || (p.email && p.email.toLowerCase() === myEmail.toLowerCase()));
        
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            listaFunc.innerHTML = '<div class="card" style="text-align:center; color:red; border:1px solid red;"><i class="fas fa-exclamation-triangle"></i><br>SEU USUÁRIO NÃO ESTÁ VINCULADO A UM CADASTRO.<br>Peça ao admin para verificar se seu e-mail está correto no cadastro de Motoristas/Ajudantes.</div>';
            return;
        }

        // Filtra operações onde este ID aparece
        const myPendentes = pendentes.filter(op => {
            if (isMotorista) return Number(op.motoristaId) === Number(myProfileId);
            else return (op.ajudantes || []).some(a => Number(a.id) === Number(myProfileId));
        });

        if (!myPendentes.length) {
            listaFunc.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">NENHUMA VIAGEM AGENDADA PARA VOCÊ.</p>';
        } else {
            let html = '';
            myPendentes.forEach(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
                
                // Info da Equipe
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
                        btnHtml = `<button class="btn-primary" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})" type="button"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
                    } else if (op.status === 'EM_ANDAMENTO') {
                        btnHtml = `<button class="btn-danger" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})" type="button"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
                    }
                } else {
                    // Ajudante
                    const checkins = op.checkins || { ajudantes: [] };
                    const jaConfirmei = checkins.ajudantes && checkins.ajudantes.includes(myProfileId);
                    if (jaConfirmei) {
                        btnHtml = `<button class="btn-success" disabled style="width:100%; margin-top:10px; opacity:0.8;"><i class="fas fa-check"></i> PRESENÇA CONFIRMADA</button>`;
                    } else {
                        btnHtml = `<button class="btn-primary" style="width:100%; margin-top:10px;" onclick="openCheckinConfirmModal(${op.id})" type="button"><i class="fas fa-user-check"></i> MARCAR PRESENÇA</button>`;
                    }
                }

                html += `<div class="card" style="border-left: 5px solid var(--primary-color); margin-bottom:15px;">
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

// --- MODAL DE CHECK-IN (LÓGICA DE ABERTURA) ---
window.openCheckinConfirmModal = function(opId) {
    document.getElementById('checkinOpId').value = opId;
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(opId));
    if(!op) return;

    // Preenche dados visuais
    document.getElementById('checkinDisplayData').textContent = op.data.split('-').reverse().join('/');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;

    // Configura campos baseado no papel
    if(window.CURRENT_USER.role === 'motorista') {
        document.getElementById('checkinDriverFields').style.display = 'block';
        if(op.status === 'AGENDADA') {
            document.getElementById('checkinStep').value = 'start';
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
            const btn = document.getElementById('btnConfirmCheckin');
            btn.innerHTML = 'CONFIRMAR INÍCIO';
            btn.className = 'btn-primary';
        } else {
            document.getElementById('checkinStep').value = 'end';
            document.getElementById('divKmInicial').style.display = 'none';
            document.getElementById('divKmFinal').style.display = 'block';
            document.getElementById('checkinKmInicialReadonly').value = op.kmInicial;
            const btn = document.getElementById('btnConfirmCheckin');
            btn.innerHTML = 'FINALIZAR VIAGEM';
            btn.className = 'btn-danger';
        }
    } else {
        // Ajudante
        document.getElementById('checkinStep').value = 'presence';
        document.getElementById('checkinDriverFields').style.display = 'none';
        document.getElementById('btnConfirmCheckin').innerHTML = 'CONFIRMAR PRESENÇA';
        document.getElementById('btnConfirmCheckin').className = 'btn-primary';
    }
    
    document.getElementById('modalCheckinConfirm').style.display = 'block';
}

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
}

window.iniciarRotaManual = function(opId) {
    if(!confirm("Deseja forçar o início desta rota manualmente?")) return;
    let arr = loadData(DB_KEYS.OPERACOES);
    let op = arr.find(o => o.id == opId);
    if(op) { 
        op.status = 'EM_ANDAMENTO'; 
        saveData(DB_KEYS.OPERACOES, arr); 
        renderCheckinsTable(); 
        renderOperacaoTable();
    }
}


// =============================================================================
// DASHBOARD, GRÁFICOS E RELATÓRIOS (ADMIN)
// =============================================================================

let currentDate = new Date();

window.updateDashboardStats = function() {
    // PROTEÇÃO: Se não existir o elemento (ex: Tela Super Admin), não faz nada.
    if (!document.getElementById('faturamentoMes')) return;

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();
    
    let totalFat = 0;
    let totalCustos = 0;

    const opsMes = ops.filter(op => {
        if(op.status !== 'CONFIRMADA') return false;
        const d = new Date(op.data + 'T00:00:00');
        return d.getMonth() === m && d.getFullYear() === y;
    });

    opsMes.forEach(op => {
        totalFat += (op.faturamento || 0);
        
        const checkins = op.checkins || { ajudantes: [] };
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => {
            if (checkins.ajudantes && checkins.ajudantes.includes(a.id)) return s + (Number(a.diaria) || 0);
            return s;
        }, 0);

        totalCustos += (Number(op.combustivel)||0) + (op.comissao || 0) + totalDiarias + (op.despesas || 0);
    });

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

window.changeMonth = function(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
    updateDashboardStats();
}

window.renderCalendar = function(date) {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return; // Proteção Super Admin

    const monthLabel = document.getElementById('currentMonthYear');
    grid.innerHTML = '';
    monthLabel.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

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

    for(let i=0; i<firstDayIndex; i++){
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;
        
        const dataIso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const temOp = ops.some(op => op.data === dataIso);

        if(temOp) {
            cell.classList.add('has-operation');
            cell.onclick = () => {
                const count = ops.filter(o => o.data === dataIso).length;
                alert(`Dia ${d}: ${count} operações registradas.`);
            };
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            cell.appendChild(dot);
        }
        grid.appendChild(cell);
    }
}

// --- CHART.JS ---
let chartInstance = null;

window.renderCharts = function() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const labels = [];
    const dataCustos = [];
    const dataReceita = [];
    const dataLucro = [];

    // Calcula total histórico
    let hist = 0;
    ops.forEach(o => { if(o.status === 'CONFIRMADA') hist += (o.faturamento || 0); });
    const elHist = document.getElementById('receitaTotalHistorico');
    if(elHist) elHist.textContent = formatCurrency(hist);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

        let rec = 0, cust = 0;
        ops.filter(op => op.status === 'CONFIRMADA' && new Date(op.data+'T00:00:00').getMonth()===m).forEach(op => {
            rec += (op.faturamento||0);
            const checkins = op.checkins || {};
            const diarias = (op.ajudantes || []).reduce((s, a) => (checkins.ajudantes && checkins.ajudantes.includes(a.id) ? s + (Number(a.diaria)||0) : s), 0);
            cust += (op.combustivel||0) + (op.comissao||0) + (op.despesas||0) + diarias;
        });

        const despGerais = despesas.filter(dp => new Date(dp.data+'T00:00:00').getMonth()===m).reduce((s, d) => s + (d.valor||0), 0);
        cust += despGerais;

        dataReceita.push(rec);
        dataCustos.push(cust);
        dataLucro.push(rec - cust);
    }

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'RECEITA', data: dataReceita, backgroundColor: '#4caf50' },
                { label: 'CUSTOS', data: dataCustos, backgroundColor: '#f44336' },
                { label: 'LUCRO', data: dataLucro, type: 'line', borderColor: '#263238', borderWidth: 2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- RELATÓRIOS ---
window.gerarRelatorio = function(e) {
    if(e) e.preventDefault();
    const dtIni = document.getElementById('dataInicioRelatorio').value;
    const dtFim = document.getElementById('dataFimRelatorio').value;
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if(o.status !== 'CONFIRMADA') return false;
        if(o.data < dtIni || o.data > dtFim) return false;
        if(motId && String(o.motoristaId) !== motId) return false;
        return true;
    });

    let html = `<table class="data-table report-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th></tr></thead><tbody>`;
    ops.forEach(o => {
        html += `<tr><td>${o.data.split('-').reverse().join('/')}</td><td>${o.veiculoPlaca}</td><td>${getMotorista(o.motoristaId)?.nome}</td><td>${formatCurrency(o.faturamento)}</td></tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    if(!el || !el.innerText) return alert("Gere o relatório primeiro.");
    html2pdf().set({ margin: 10, filename: 'relatorio.pdf' }).from(el).save();
}

window.exportEmployeeHistoryToPDF = function() {
    const el = document.getElementById('tabelaHistoricoCompleto');
    html2pdf().set({ margin: 10, filename: 'meu_historico.pdf' }).from(el).save();
}
// =============================================================================
// PARTE 5: SUPER ADMIN, BACKUP, USERS LIST E INICIALIZAÇÃO
// =============================================================================

// --- GESTÃO GLOBAL (SUPER ADMIN) - CRIAÇÃO DE EMPRESA ---

async function createCompanyAndUser(e) {
    e.preventDefault();
    
    // Verifica se as referências do Firebase existem
    if (!window.dbRef || !window.dbRef.secondaryApp || !window.dbRef.getAuth) {
        return alert("Erro crítico: Firebase não inicializado corretamente no HTML.");
    }

    const domain = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
    const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
    const password = document.getElementById('newAdminPassword').value;

    if (!domain.includes('.')) return alert("Domínio inválido (ex: empresa.com)");
    if (!email.endsWith(domain)) return alert(`O e-mail deve terminar com @${domain}`);

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "CRIANDO...";

    try {
        // 1. Usa o APP SECUNDÁRIO para criar o usuário (sem deslogar o atual)
        const auth2 = window.dbRef.getAuth(window.dbRef.secondaryApp);
        const { createUserWithEmailAndPassword, signOut } = window.dbRef; // Pega funções do objeto global
        
        const userCred = await createUserWithEmailAndPassword(auth2, email, password);
        const newUser = userCred.user;

        // 2. Salva no Firestore Principal (users)
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

        // 3. Inicializa coleção da empresa (opcional, mas bom para evitar erros de leitura vazia)
        await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { 
            items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } 
        });

        // 4. Limpeza
        await signOut(auth2); // Desloga do app secundário

        alert(`SUCESSO!\n\nEmpresa: ${domain}\nLogin: ${email}\nSenha: ${password}\n\nO novo admin já pode acessar.`);
        document.getElementById('formCreateCompany').reset();

    } catch (error) {
        console.error("Erro criação:", error);
        let msg = error.message;
        if(error.code === 'auth/email-already-in-use') msg = "Este e-mail já está em uso.";
        alert("ERRO AO CRIAR: " + msg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Listener do formulário
const fSuper = document.getElementById('formCreateCompany');
if(fSuper) fSuper.addEventListener('submit', createCompanyAndUser);


// --- LISTAGEM DE FUNCIONÁRIOS DA EMPRESA (ADMIN) ---
// Corrige o problema de "Funcionários ativos não aparecendo"

function setupCompanyUsersList() {
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;

    const { db, collection, query, where, onSnapshot } = window.dbRef;
    const company = window.CURRENT_USER.company;

    // Escuta a coleção 'users' filtrando pela empresa atual
    const q = query(collection(db, "users"), where("company", "==", company));

    onSnapshot(q, (snapshot) => {
        const users = [];
        snapshot.forEach(doc => users.push(doc.data()));
        renderCompanyUsersTable(users);
    });
}

function renderCompanyUsersTable(users) {
    // Separa pendentes e ativos
    const pendentes = users.filter(u => !u.approved);
    const ativos = users.filter(u => u.approved);

    // Tabela Pendentes
    const tbPend = document.getElementById('tabelaCompanyPendentes');
    if (tbPend) {
        if (pendentes.length === 0) {
            tbPend.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUMA SOLICITAÇÃO PENDENTE.</td></tr>';
        } else {
            tbPend.querySelector('tbody').innerHTML = pendentes.map(u => `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role.toUpperCase()}</td>
                    <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="btn-success btn-mini" onclick="approveUser('${u.uid}', true)">APROVAR</button>
                        <button class="btn-danger btn-mini" onclick="deleteUser('${u.uid}')">RECUSAR</button>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Tabela Ativos
    const tbAtiv = document.getElementById('tabelaCompanyAtivos');
    if (tbAtiv) {
        if (ativos.length === 0) {
            tbAtiv.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM FUNCIONÁRIO ATIVO.</td></tr>';
        } else {
            tbAtiv.querySelector('tbody').innerHTML = ativos.map(u => `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role.toUpperCase()}</td>
                    <td><span style="color:green;font-weight:bold;">ATIVO</span></td>
                    <td>
                        <button class="btn-warning btn-mini" onclick="approveUser('${u.uid}', false)">BLOQUEAR</button>
                    </td>
                </tr>
            `).join('');
        }
    }
}

// Funções de Gestão de Usuário (Globais)
window.approveUser = async function(uid, status) {
    if(!confirm(status ? "Aprovar acesso?" : "Bloquear acesso?")) return;
    try {
        const { updateDoc, doc, db } = window.dbRef;
        await updateDoc(doc(db, "users", uid), { approved: status });
    } catch(e) { alert("Erro: " + e.message); }
}

window.deleteUser = async function(uid) {
    if(!confirm("Excluir este usuário permanentemente?")) return;
    try {
        const { deleteDoc, doc, db } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
    } catch(e) { alert("Erro: " + e.message); }
}


// --- BACKUP E RESTAURAÇÃO ---

window.exportDataBackup = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(APP_CACHE));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `backup_logimaster_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

window.importDataBackup = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if(!confirm("ISSO SUBSTITUIRÁ TODOS OS DADOS ATUAIS PELOS DO ARQUIVO.\nCONTINUAR?")) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            // Salva cada chave individualmente
            for (let key in json) {
                if (Object.values(DB_KEYS).includes(key)) {
                    await saveData(key, json[key]);
                }
            }
            alert("Restauração concluída! A página será recarregada.");
            location.reload();
        } catch (err) { alert("Erro ao ler arquivo: " + err.message); }
    };
    reader.readAsText(file);
}

window.fullSystemReset = async function() {
    if(!confirm("PERIGO: ISSO APAGARÁ TODOS OS DADOS DA EMPRESA.\n\nTEM CERTEZA?")) return;
    if(prompt("DIGITE 'DELETAR' PARA CONFIRMAR:") !== 'DELETAR') return;
    
    for (let key of Object.values(DB_KEYS)) {
        await saveData(key, (key===DB_KEYS.MINHA_EMPRESA?{}:[]));
    }
    alert("Sistema resetado.");
    location.reload();
}


// =============================================================================
// INICIALIZAÇÃO DO SISTEMA (ROTEAMENTO)
// =============================================================================

window.initSystemByRole = function(user) {
    console.log("Login efetuado:", user.email, "| Role:", user.role);
    window.CURRENT_USER = user;
    
    // 1. Esconde todos os menus
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // 2. Roteamento
    if(user.email === 'admin@logimaster.com') {
        // --- SUPER ADMIN ---
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdminRealtime(); // Monitora hierarquia global
    } 
    else if (user.role === 'admin') {
        // --- ADMIN DA EMPRESA ---
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Dashboard
        setupCompanyRealtime(); // Carrega dados
        setupCompanyUsersList(); // Carrega funcionários (CORREÇÃO)
    } 
    else {
        // --- FUNCIONÁRIOS ---
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        setupCompanyRealtime();
    }
};


// --- LISTENERS DE DADOS (REALTIME) ---

function setupCompanyRealtime() {
    if(!window.dbRef || !window.CURRENT_USER || !window.CURRENT_USER.company) return;
    
    const { db, doc, onSnapshot } = window.dbRef;
    const company = window.CURRENT_USER.company;

    // Loop em todas as chaves de dados (Motoristas, Operações, etc)
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', company, 'data', key), (docSnap) => {
            if(docSnap.exists()) {
                APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            } else {
                APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            }
            refreshUI(); // Atualiza a tela ao receber dados
        });
    });
}

function setupSuperAdminRealtime() {
    const { db, collection, query, onSnapshot } = window.dbRef;
    // Escuta users globais
    onSnapshot(query(collection(db, "users")), (snap) => {
        const users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });
}

// Renderiza a lista hierárquica no Super Admin
function renderGlobalHierarchy(users) {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    const groups = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return;
        const c = u.company || 'SEM EMPRESA';
        if(!groups[c]) groups[c] = [];
        groups[c].push(u);
    });

    let html = '';
    for(const [comp, list] of Object.entries(groups)) {
        html += `<div class="domain-block">
            <div class="domain-header"><strong>${comp.toUpperCase()}</strong> (${list.length})</div>
            <div class="domain-content open">
                ${list.map(u => `<div class="user-row"><span>${u.email} (${u.role})</span></div>`).join('')}
            </div>
        </div>`;
    }
    container.innerHTML = html || '<p style="text-align:center">Nenhuma empresa encontrada.</p>';
}

// --- REFRESH UI CENTRALIZADO ---
// Garante que tudo atualize quando o banco muda

function refreshUI() {
    if(!window.CURRENT_USER) return;

    // Admin
    if (window.CURRENT_USER.role === 'admin') {
        if(typeof renderCadastroTable === 'function') {
            renderCadastroTable(DB_KEYS.MOTORISTAS);
            renderCadastroTable(DB_KEYS.VEICULOS);
            renderCadastroTable(DB_KEYS.CONTRATANTES);
            renderCadastroTable(DB_KEYS.AJUDANTES);
            if(typeof renderAtividadesTable === 'function') renderAtividadesTable();
        }
        if(typeof populateAllSelects === 'function') populateAllSelects();
        if(typeof renderOperacaoTable === 'function') renderOperacaoTable();
        if(typeof renderDespesasTable === 'function') renderDespesasTable();
        if(typeof updateDashboardStats === 'function') updateDashboardStats();
        if(typeof renderCalendar === 'function') renderCalendar(new Date());
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof renderMinhaEmpresaInfo === 'function') renderMinhaEmpresaInfo();
    }
    // Funcionário
    else if (window.CURRENT_USER.role !== 'admin' && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof renderEmployeeProfileView === 'function') renderEmployeeProfileView();
    }
}

// --- RENDER DESPESAS (Faltante na parte anterior) ---
window.renderDespesasTable = function() {
    const tbl = document.getElementById('tabelaDespesasGerais');
    if(!tbl) return;
    const dados = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b) => new Date(b.data)-new Date(a.data));
    
    tbl.querySelector('tbody').innerHTML = dados.slice(0,50).map(d => `
        <tr>
            <td>${d.data.split('-').reverse().join('/')}</td>
            <td>${d.veiculoPlaca || '-'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td>${d.pago ? 'OK' : 'PEND'}</td>
            <td><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="6">Vazio</td></tr>';
}

// --- SETUP INICIAL ---
document.addEventListener('DOMContentLoaded', () => {
    // Abas Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');

            if(pageId === 'graficos' && typeof renderCharts === 'function') renderCharts();
            if(pageId === 'operacoes' && typeof populateAllSelects === 'function') populateAllSelects();
        });
    });

    // Abas Cadastro Interno
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    // Mobile Menu
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebarOverlay').classList.add('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Inicializa Handlers
    if(typeof setupFormHandlers === 'function') setupFormHandlers();
});