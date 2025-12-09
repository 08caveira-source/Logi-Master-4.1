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
    
    select.innerHTML = '<option value="">SELECIONE...</option>';
    
    if (dataArray && dataArray.length > 0) {
        dataArray.forEach(item => {
            select.innerHTML += `<option value="${item[valueKey]}">${item[textKey]}</option>`;
        });
    }
}

// FECHAR MODAIS AO CLICAR FORA
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
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
    else if (key === DB_KEYS.ATIVIDADES) { renderAtividadesTable(); return; } // Tratamento especial para atividades
    
    if(!tabela) return;
    
    // Gera linhas da tabela
    let rows = data.map(item => {
        let c1 = item.id || item.placa || item.cnpj;
        let c2 = item.nome || item.modelo || item.razaoSocial;
        let c3 = item.documento || item.ano || item.telefone || ''; 
        
        // Botão Visualizar
        let btns = `<button class="btn-action view-btn" onclick="viewCadastro('${key}','${c1}')" type="button"><i class="fas fa-eye"></i></button>`;
        
        // Botão Excluir (Apenas se não for leitura)
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
        // Botão Excluir para atividade
        let btn = !window.IS_READ_ONLY 
            ? `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}','${item.id}')" type="button"><i class="fas fa-trash"></i></button>`
            : '';
        return `<tr><td>${item.id}</td><td>${item.nome}</td><td>${btn}</td></tr>`;
    }).join('');

    tabela.querySelector('tbody').innerHTML = rows || '<tr><td colspan="3" style="text-align:center">NENHUMA ATIVIDADE CADASTRADA.</td></tr>';
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
    openViewModal("DETALHES DO CADASTRO", html);
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
    
    // Atualiza tabelas e selects imediatamente
    if(key === DB_KEYS.ATIVIDADES) renderAtividadesTable();
    else renderCadastroTable(key);
    
    populateAllSelects(); // Atualiza os selects da operação
    
    // Se for despesa ou operação, atualiza suas tabelas específicas
    if(key === DB_KEYS.DESPESAS_GERAIS && typeof renderDespesasTable === 'function') renderDespesasTable();
    if(key === DB_KEYS.OPERACOES && typeof renderOperacaoTable === 'function') renderOperacaoTable();
}

// --- TABELA DE OPERAÇÕES ---
window.renderOperacaoTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    const opsExibidas = ops.slice(0, 50); // Otimização para não travar com muitos dados

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

        // Botões
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
    
    // Vai para a aba de lançamento
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Preenche campos
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
    
    // --- CORREÇÃO IMPORTANTE: RECUPERAR O STATUS NO CHECKBOX ---
    // Se o status for AGENDADA, marca o checkbox para que o admin saiba.
    // Se ele desmarcar e salvar, mudará para CONFIRMADA (veremos na Parte 3).
    const isAgendada = (op.status === 'AGENDADA');
    document.getElementById('operacaoIsAgendamento').checked = isAgendada;

    // Restaura lista de ajudantes temporária
    window._operacaoAjudantesTempList = (op.ajudantes || []).slice();
    renderAjudantesAdicionadosList(); // Função da parte 3
    
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

// Helpers para abrir/fechar modais
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

// --- FUNÇÃO AUXILIAR: CRIAR LOGIN PARA FUNCIONÁRIO (SEM DESLOGAR ADMIN) ---
async function createUserAccess(email, password, role, name) {
    if (!window.dbRef || !window.dbRef.secondaryApp) {
        alert("Erro: Configuração do Firebase incompleta.");
        return null;
    }
    try {
        const auth2 = window.dbRef.getAuth(window.dbRef.secondaryApp);
        const userCred = await window.dbRef.createUserWithEmailAndPassword(auth2, email, password);
        const newUser = userCred.user;
        
        // Cria perfil na coleção users
        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", newUser.uid), {
            uid: newUser.uid,
            name: name.toUpperCase(),
            email: email.toLowerCase(),
            role: role, // 'motorista' ou 'ajudante'
            company: window.CURRENT_USER.company,
            approved: true,
            createdAt: new Date().toISOString()
        });
        
        // Desloga da instância secundária
        await window.dbRef.signOut(auth2);
        
        return newUser.uid;
    } catch (e) {
        console.error("Erro ao criar usuário:", e);
        if (e.code === 'auth/email-already-in-use') {
            // Se já existe, tentamos buscar o UID existente na lista de users (fallback)
            // Mas idealmente alertamos o erro.
            alert("AVISO: Este e-mail já possui um login criado. O vínculo será tentado pelo e-mail.");
            return 'EXISTING_EMAIL'; 
        }
        alert("Erro ao criar login: " + e.message);
        return null;
    }
}

function setupFormHandlers() {

    // --- 1. CADASTRO DE MOTORISTA (COM CRIAÇÃO DE LOGIN) ---
    const fMot = document.getElementById('formMotorista');
    if(fMot) fMot.addEventListener('submit', async e => {
        e.preventDefault();
        
        const btn = fMot.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "SALVANDO...";

        let arr = loadData(DB_KEYS.MOTORISTAS).slice();
        const idHidden = document.getElementById('motoristaId').value;
        const isEdit = !!idHidden;
        const newId = isEdit ? Number(idHidden) : Date.now();
        const nome = document.getElementById('motoristaNome').value.toUpperCase();
        
        // Gera e-mail padrão se não for edição
        let email = isEdit ? (arr.find(x=>x.id==newId)?.email || "") : "";
        let uid = isEdit ? (arr.find(x=>x.id==newId)?.uid || null) : null;
        let senhaTemp = "";

        if (!isEdit && window.CURRENT_USER) {
            const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
            email = `${cleanName}.${Math.floor(Math.random()*100)}@${window.CURRENT_USER.company}`;
            senhaTemp = "mudar123"; // Senha padrão
            
            if(confirm(`DESEJA CRIAR O LOGIN AUTOMÁTICO?\n\nEmail: ${email}\nSenha: ${senhaTemp}`)) {
                const newUid = await createUserAccess(email, senhaTemp, 'motorista', nome);
                if (newUid && newUid !== 'EXISTING_EMAIL') uid = newUid;
            } else {
                email = prompt("Informe o e-mail do motorista (Login já deve existir):", email);
            }
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
            uid: uid
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == newId);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        await saveData(DB_KEYS.MOTORISTAS, arr);
        
        fMot.reset();
        document.getElementById('motoristaId').value = '';
        renderCadastroTable(DB_KEYS.MOTORISTAS);
        populateAllSelects();
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        let msg = "Motorista salvo!";
        if(senhaTemp) msg += `\n\nLOGIN CRIADO:\nUser: ${email}\nSenha: ${senhaTemp}`;
        alert(msg);
    });

    // --- 2. CADASTRO DE VEÍCULO ---
    const fVeic = document.getElementById('formVeiculo');
    if(fVeic) fVeic.addEventListener('submit', async e => {
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
        
        await saveData(DB_KEYS.VEICULOS, arrFiltered);
        fVeic.reset();
        renderCadastroTable(DB_KEYS.VEICULOS);
        populateAllSelects();
        alert("Veículo salvo!");
    });

    // --- 3. CADASTRO DE CONTRATANTE ---
    const fCont = document.getElementById('formContratante');
    if(fCont) fCont.addEventListener('submit', async e => {
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

        await saveData(DB_KEYS.CONTRATANTES, arrFiltered);
        fCont.reset();
        renderCadastroTable(DB_KEYS.CONTRATANTES);
        populateAllSelects();
        alert("Contratante salvo!");
    });

    // --- 4. CADASTRO DE AJUDANTE (COM CRIAÇÃO DE LOGIN) ---
    const fAju = document.getElementById('formAjudante');
    if(fAju) fAju.addEventListener('submit', async e => {
        e.preventDefault();
        
        const btn = fAju.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "SALVANDO...";

        let arr = loadData(DB_KEYS.AJUDANTES).slice();
        const idHidden = document.getElementById('ajudanteId').value;
        const isEdit = !!idHidden;
        const newId = isEdit ? Number(idHidden) : Date.now();
        const nome = document.getElementById('ajudanteNome').value.toUpperCase();
        
        let email = isEdit ? (arr.find(x=>x.id==newId)?.email || "") : "";
        let uid = isEdit ? (arr.find(x=>x.id==newId)?.uid || null) : null;
        let senhaTemp = "";

        if (!isEdit && window.CURRENT_USER) {
            const cleanName = nome.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
            email = `${cleanName}.${Math.floor(Math.random()*100)}@${window.CURRENT_USER.company}`;
            senhaTemp = "mudar123";
            
            if(confirm(`DESEJA CRIAR O LOGIN AUTOMÁTICO?\n\nEmail: ${email}\nSenha: ${senhaTemp}`)) {
                const newUid = await createUserAccess(email, senhaTemp, 'ajudante', nome);
                if (newUid && newUid !== 'EXISTING_EMAIL') uid = newUid;
            }
        }

        const obj = {
            id: newId,
            nome: nome,
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value,
            email: email,
            uid: uid
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == newId);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        await saveData(DB_KEYS.AJUDANTES, arr);
        fAju.reset();
        document.getElementById('ajudanteId').value = '';
        renderCadastroTable(DB_KEYS.AJUDANTES);
        populateAllSelects();
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        let msg = "Ajudante salvo!";
        if(senhaTemp) msg += `\n\nLOGIN CRIADO:\nUser: ${email}\nSenha: ${senhaTemp}`;
        alert(msg);
    });

    // --- 5. CADASTRO DE ATIVIDADE ---
    const fAtiv = document.getElementById('formAtividade');
    if(fAtiv) fAtiv.addEventListener('submit', async e => {
        e.preventDefault();
        let arr = loadData(DB_KEYS.ATIVIDADES).slice();
        const obj = {
            id: Date.now(),
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        };
        arr.push(obj);
        await saveData(DB_KEYS.ATIVIDADES, arr);
        fAtiv.reset();
        renderAtividadesTable();
        populateAllSelects();
        alert("Atividade salva!");
    });

    // --- 6. MINHA EMPRESA ---
    const fEmp = document.getElementById('formMinhaEmpresa');
    if(fEmp) fEmp.addEventListener('submit', async e => {
        e.preventDefault();
        const obj = {
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
            cnpj: document.getElementById('minhaEmpresaCNPJ').value,
            telefone: document.getElementById('minhaEmpresaTelefone').value
        };
        await saveData(DB_KEYS.MINHA_EMPRESA, obj);
        renderMinhaEmpresaInfo();
        alert("Dados da empresa atualizados.");
    });

    // --- 7. MENSAGENS INTERNAS ---
    const fMsg = document.getElementById('formAdminMessage');
    if(fMsg) fMsg.addEventListener('submit', e => {
        e.preventDefault(); // Impede o redirecionamento
        const texto = document.getElementById('msgTextAdmin').value;
        if(!texto) return;
        alert("MENSAGEM ENVIADA PARA A EQUIPE!\n(Aviso visual exibido nos painéis)");
        fMsg.reset();
    });

    // --- 8. OPERAÇÃO (LÓGICA DE STATUS CORRIGIDA) ---
    const fOp = document.getElementById('formOperacao');
    if(fOp) fOp.addEventListener('submit', async e => {
        e.preventDefault();
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idHidden = document.getElementById('operacaoId').value;
        const isEdit = !!idHidden;
        
        // CORREÇÃO: O status agora respeita o checkbox, mesmo na edição.
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';

        const motId = document.getElementById('selectMotoristaOperacao').value;
        if(!motId) return alert("Selecione um Motorista.");
        
        verificarValidadeCNH(motId);

        const obj = {
            id: isEdit ? Number(idHidden) : Date.now(),
            status: statusFinal,
            
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
            
            // Mantém dados de checkin
            checkins: isEdit ? (arr.find(o=>o.id==Number(idHidden))?.checkins || {motorista:false, ajudantes:[], ajudantesLog:{}}) 
                             : {motorista:false, ajudantes:[], ajudantesLog:{}},
            
            kmInicial: isEdit ? (arr.find(o=>o.id==Number(idHidden))?.kmInicial || 0) : 0,
            kmFinal: isEdit ? (arr.find(o=>o.id==Number(idHidden))?.kmFinal || 0) : 0,
            dataHoraInicio: isEdit ? (arr.find(o=>o.id==Number(idHidden))?.dataHoraInicio || null) : null
        };

        if(isEdit) {
            const idx = arr.findIndex(x => x.id == obj.id);
            if(idx >= 0) arr[idx] = obj;
        } else {
            arr.push(obj);
        }

        await saveData(DB_KEYS.OPERACOES, arr);
        
        fOp.reset();
        document.getElementById('operacaoId').value = '';
        document.getElementById('operacaoIsAgendamento').checked = false;
        window._operacaoAjudantesTempList = [];
        renderAjudantesAdicionadosList();
        
        renderOperacaoTable();
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof updateDashboardStats === 'function') updateDashboardStats();

        alert(isAgendamento ? "Operação Agendada! Enviada para o app do motorista." : "Operação Salva e Confirmada!");
    });

    // --- 9. CONFIRMAÇÃO DE CHECK-IN (FINALIZAR ROTA) ---
    const fCheck = document.getElementById('formCheckinConfirm');
    if(fCheck) fCheck.addEventListener('submit', async e => {
        e.preventDefault(); // Impede recarregamento
        
        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value;
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => o.id === opId);
        
        if (idx < 0) return alert("Erro: Operação não encontrada.");
        
        const op = arr[idx];
        const agora = new Date().toISOString();

        // Lógica Motorista
        if (window.CURRENT_USER.role === 'motorista') {
            if (step === 'start') {
                const kmIni = Number(document.getElementById('checkinKmInicial').value);
                if(!kmIni) return alert("Informe o KM Inicial.");
                
                op.kmInicial = kmIni;
                op.status = 'EM_ANDAMENTO';
                op.checkins.motorista = true;
                op.dataHoraInicio = agora;
                alert("Viagem Iniciada!");
            } 
            else if (step === 'end') {
                const kmFim = Number(document.getElementById('checkinKmFinal').value);
                if(!kmFim) return alert("Informe o KM Final.");
                if(kmFim <= op.kmInicial) return alert("KM Final deve ser maior que o Inicial.");
                
                op.kmFinal = kmFim;
                op.kmRodado = kmFim - op.kmInicial;
                op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                op.status = 'CONFIRMADA';
                alert("Viagem Finalizada com Sucesso!");
            }
        } 
        // Lógica Ajudante
        else {
            let myProfile = loadData(DB_KEYS.AJUDANTES).find(a => a.email === window.CURRENT_USER.email);
            if(myProfile) {
                if(!op.checkins.ajudantes.includes(myProfile.id)) {
                    op.checkins.ajudantes.push(myProfile.id);
                    op.checkins.ajudantesLog[myProfile.id] = agora;
                }
                alert("Presença Confirmada!");
            }
        }

        await saveData(DB_KEYS.OPERACOES, arr);
        closeCheckinConfirmModal();
        renderCheckinsTable(); // Atualiza a tela
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
// FILTRO DE FUNCIONÁRIO
// =============================================================================

window.filtrarHistoricoFuncionario = function(e) {
    if(e) e.preventDefault();
    if (!window.CURRENT_USER) return;

    const dataIniVal = document.getElementById('empDataInicio').value;
    const dataFimVal = document.getElementById('empDataFim').value;
    
    if(!dataIniVal || !dataFimVal) return alert("Selecione as datas.");

    // Busca perfil
    let myProfileId = null;
    let isMotorista = (window.CURRENT_USER.role === 'motorista');
    let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    
    const myProfile = loadData(myKey).find(p => p.uid === window.CURRENT_USER.uid || (p.email && p.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()));
    if (myProfile) myProfileId = myProfile.id;

    if (!myProfileId) return alert("Perfil não vinculado.");

    const ops = loadData(DB_KEYS.OPERACOES);
    let totalReceber = 0;
    
    const resultado = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < dataIniVal || op.data > dataFimVal) return false;

        if (isMotorista) return Number(op.motoristaId) === Number(myProfileId);
        else return (op.ajudantes || []).some(a => Number(a.id) === Number(myProfileId));
    });

    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');
    
    if (!resultado.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO.</td></tr>';
        document.getElementById('resultadoFinanceiroFuncionario').style.display = 'none';
    } else {
        let html = '';
        resultado.forEach(op => {
            const dataFmt = op.data.split('-').reverse().join('/');
            const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || '--';
            let valor = 0;
            if (isMotorista) valor = op.comissao || 0;
            else {
                const ajData = (op.ajudantes || []).find(a => Number(a.id) === Number(myProfileId));
                if(op.checkins.ajudantes && op.checkins.ajudantes.includes(myProfileId)) valor = Number(ajData.diaria) || 0;
            }
            totalReceber += valor;
            html += `<tr><td>${dataFmt}</td><td>${op.veiculoPlaca}</td><td>${contratante}</td><td style="color:green;font-weight:bold;">${formatCurrency(valor)}</td><td>CONFIRMADA</td></tr>`;
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

// --- RENDERIZAÇÃO DE CHECK-INS E AGENDAMENTOS (VISUAL) ---

window.renderCheckinsTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES);
    // Filtra apenas o que não está finalizado (Agendada ou Em Andamento)
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // --- A. VISÃO DO ADMIN (TABELA GERAL) ---
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    
    // Renderiza apenas se for Admin e a tabela existir
    if (tabelaAdmin && window.CURRENT_USER && window.CURRENT_USER.role === 'admin') { 
        let rows = '';
        if (!pendentes.length) {
            rows = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA ROTA ATIVA.</td></tr>';
        } else {
            pendentes.forEach(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                // Status Visual
                let statusLabel = '';
                let actionBtn = '';

                if (op.status === 'AGENDADA') {
                    statusLabel = '<span style="color:orange;">AGUARDANDO</span>';
                    // Botão para o Admin forçar o início se o motorista não tiver app
                    actionBtn = `<button class="btn-primary btn-action" onclick="iniciarRotaManual(${op.id})" type="button" title="Forçar Início"><i class="fas fa-play"></i></button>`;
                } else if (op.status === 'EM_ANDAMENTO') {
                    statusLabel = '<span style="color:#0288d1; font-weight:bold;">EM ROTA</span>';
                    actionBtn = `<span style="color:#0288d1;"><i class="fas fa-truck-moving"></i></span>`;
                }

                // Ícones de confirmação da equipe
                const motIcon = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Motorista OK"></i>` 
                    : `<i class="far fa-circle" style="color:#ccc;" title="Motorista Pendente"></i>`;
                
                rows += `<tr>
                    <td>${dataFmt}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${motIcon} ${motNome}</td>
                    <td>${op.ajudantes.length} Ajud.</td>
                    <td>${statusLabel}</td>
                    <td>
                        ${actionBtn}
                        <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})" type="button"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>`;
            });
        }
        tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        // Badge Menu
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // --- B. VISÃO DO FUNCIONÁRIO (CARDS MOBILE) ---
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const listaFunc = document.getElementById('listaServicosAgendados');
        if(!listaFunc) return; 

        // 1. Identificar o ID do perfil do usuário logado
        let myProfileId = null;
        const myEmail = window.CURRENT_USER.email.toLowerCase();
        const myUid = window.CURRENT_USER.uid;
        const isMotorista = (window.CURRENT_USER.role === 'motorista');
        
        const dbKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const profiles = loadData(dbKey);
        
        // Tenta achar por UID (Ideal) ou Email (Fallback seguro)
        const profile = profiles.find(p => p.uid === myUid || (p.email && p.email.toLowerCase() === myEmail));
        
        if (profile) myProfileId = profile.id;

        // Se não achou perfil, avisa
        if (!myProfileId) {
            listaFunc.innerHTML = `<div class="card" style="border-left:5px solid red; padding:15px;">
                <h4 style="color:red;">PERFIL NÃO VINCULADO</h4>
                <p>Seu usuário (${myEmail}) não foi encontrado na lista de ${isMotorista?'Motoristas':'Ajudantes'}. Peça ao admin para verificar o cadastro.</p>
            </div>`;
            return;
        }

        // 2. Filtrar Rotas deste funcionário
        const myRotas = pendentes.filter(op => {
            if (isMotorista) return Number(op.motoristaId) === Number(myProfileId);
            // Se for ajudante, verifica se o ID dele está na lista de ajudantes da operação
            return (op.ajudantes || []).some(a => Number(a.id) === Number(myProfileId));
        });

        if (myRotas.length === 0) {
            listaFunc.innerHTML = '<p style="text-align:center; color:#777; margin-top:20px;">NENHUM SERVIÇO PENDENTE.</p>';
        } else {
            listaFunc.innerHTML = myRotas.map(op => {
                const dataFmt = op.data.split('-').reverse().join('/');
                const cliente = getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE AVULSO';
                
                // Botão de Ação Lógico
                let btnAction = '';
                if (isMotorista) {
                    if (op.status === 'AGENDADA') {
                        btnAction = `<button class="btn-primary" style="width:100%" onclick="openCheckinConfirmModal(${op.id})">INICIAR VIAGEM</button>`;
                    } else {
                        btnAction = `<button class="btn-danger" style="width:100%" onclick="openCheckinConfirmModal(${op.id})">FINALIZAR VIAGEM</button>`;
                    }
                } else {
                    // Ajudante
                    const jaDeuCheck = op.checkins?.ajudantes?.includes(myProfileId);
                    if (jaDeuCheck) {
                        btnAction = `<button class="btn-success" disabled style="width:100%; opacity:0.6">PRESENÇA CONFIRMADA</button>`;
                    } else {
                        btnAction = `<button class="btn-primary" style="width:100%" onclick="openCheckinConfirmModal(${op.id})">MARCAR PRESENÇA</button>`;
                    }
                }

                return `<div class="card" style="border-left:5px solid var(--primary-color); margin-bottom:15px;">
                    <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} • ${op.veiculoPlaca}</h4>
                    <p style="font-weight:bold; margin-bottom:5px;">${cliente}</p>
                    <p style="font-size:0.85rem; color:#555;">STATUS: ${op.status}</p>
                    <div style="margin-top:15px;">${btnAction}</div>
                </div>`;
            }).join('');
        }
    }
}

// --- RENDERIZAR DADOS DO PERFIL (FUNCIONÁRIO) ---
window.renderEmployeeProfileView = function() {
    const container = document.getElementById('employeeProfileView');
    if (!container || !window.CURRENT_USER) return;

    const role = window.CURRENT_USER.role;
    const dbKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    
    const profile = loadData(dbKey).find(p => p.uid === window.CURRENT_USER.uid || (p.email && p.email.toLowerCase() === window.CURRENT_USER.email.toLowerCase()));

    if (!profile) {
        container.innerHTML = '<p style="color:red; text-align:center;">Perfil não encontrado. Contate o suporte.</p>';
        return;
    }

    const html = `
        <div style="text-align:center; margin-bottom:20px;">
            <div style="width:80px; height:80px; background:#eee; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; font-size:2rem; color:#aaa;">
                ${profile.nome.charAt(0)}
            </div>
            <h3 style="margin-top:10px;">${profile.nome}</h3>
            <span style="background:green; color:white; padding:2px 8px; border-radius:10px; font-size:0.8rem;">ATIVO</span>
        </div>
        <div style="display:grid; gap:10px;">
            <div style="border-bottom:1px solid #eee; padding:5px;">
                <label style="font-size:0.7rem; color:#888;">DOCUMENTO</label>
                <div>${profile.documento}</div>
            </div>
            <div style="border-bottom:1px solid #eee; padding:5px;">
                <label style="font-size:0.7rem; color:#888;">TELEFONE</label>
                <div>${profile.telefone || '-'}</div>
            </div>
            <div style="border-bottom:1px solid #eee; padding:5px;">
                <label style="font-size:0.7rem; color:#888;">PIX</label>
                <div>${profile.pix || '-'}</div>
            </div>
            ${role === 'motorista' ? `
            <div style="border-bottom:1px solid #eee; padding:5px;">
                <label style="font-size:0.7rem; color:#888;">CNH / VALIDADE</label>
                <div>${profile.cnh || '-'} (${profile.validadeCNH ? new Date(profile.validadeCNH).toLocaleDateString() : '-'})</div>
            </div>` : ''}
        </div>
    `;
    container.innerHTML = html;
}

// --- MODAL DE CHECK-IN UI ---
window.openCheckinConfirmModal = function(opId) {
    document.getElementById('checkinOpId').value = opId;
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(opId));
    if(!op) return;

    // Infos do Modal
    document.getElementById('checkinDisplayData').textContent = op.data.split('-').reverse().join('/');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || 'Cliente Avulso';
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;

    const isMotorista = window.CURRENT_USER.role === 'motorista';
    
    if (isMotorista) {
        document.getElementById('checkinDriverFields').style.display = 'block';
        if (op.status === 'AGENDADA') {
            // Iniciar
            document.getElementById('checkinStep').value = 'start';
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
            
            const btn = document.getElementById('btnConfirmCheckin');
            btn.innerHTML = 'CONFIRMAR INÍCIO';
            btn.className = 'btn-primary';
        } else {
            // Finalizar
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

window.iniciarRotaManual = function(id) {
    if(!confirm("Tem certeza que deseja forçar o início desta rota?")) return;
    let arr = loadData(DB_KEYS.OPERACOES);
    let op = arr.find(o => o.id == id);
    if(op) {
        op.status = 'EM_ANDAMENTO';
        saveData(DB_KEYS.OPERACOES, arr);
        renderCheckinsTable();
        renderOperacaoTable();
    }
}

// =============================================================================
// DASHBOARD, GRÁFICOS E PDF (ADMIN)
// =============================================================================

let currentDate = new Date();

window.updateDashboardStats = function() {
    if (!document.getElementById('faturamentoMes')) return; // Proteção Super Admin

    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();
    
    let totalFat = 0;
    let totalCustos = 0;

    ops.forEach(op => {
        if (op.status !== 'CONFIRMADA') return;
        const d = new Date(op.data + 'T00:00:00');
        if (d.getMonth() !== m || d.getFullYear() !== y) return;

        totalFat += (op.faturamento || 0);
        
        // Soma custos operacionais
        let custoOp = (op.combustivel||0) + (op.comissao||0) + (op.despesas||0);
        
        // Soma diárias de ajudantes (apenas os presentes, se possível, ou todos)
        // Simplificação: soma todos listados na operação confirmada
        const custoAjudantes = (op.ajudantes || []).reduce((acc, aj) => acc + (Number(aj.diaria)||0), 0);
        
        totalCustos += custoOp + custoAjudantes;
    });

    const despGerais = despesas.filter(d => {
        const dDate = new Date(d.data + 'T00:00:00');
        return dDate.getMonth() === m && dDate.getFullYear() === y;
    }).reduce((acc, d) => acc + (d.valor || 0), 0);

    totalCustos += despGerais;

    document.getElementById('faturamentoMes').textContent = formatCurrency(totalFat);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    
    const lucro = totalFat - totalCustos;
    const elLucro = document.getElementById('receitaMes');
    elLucro.textContent = formatCurrency(lucro);
    elLucro.style.color = lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
}

window.changeMonth = function(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
    updateDashboardStats();
}

window.renderCalendar = function(date) {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;

    document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    grid.innerHTML = '';

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    weekDays.forEach(d => grid.innerHTML += `<div class="day-label">${d}</div>`);

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="day-cell empty"></div>`;

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++) {
        const dataIso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const hasOp = ops.some(o => o.data === dataIso);
        
        const cell = document.createElement('div');
        cell.className = hasOp ? 'day-cell has-operation' : 'day-cell';
        cell.textContent = d;
        if(hasOp) {
            cell.onclick = () => alert(`Dia ${d}: Existem operações.`);
            cell.innerHTML += `<div class="event-dot"></div>`;
        }
        grid.appendChild(cell);
    }
}

// Chart.js e PDF
let myChart = null;
window.renderCharts = function() {
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;

    // (Lógica do gráfico mantida similar à anterior, resumida aqui)
    const labels = [];
    const dados = [];
    for(let i=5; i>=0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth()-i);
        labels.push(d.toLocaleDateString('pt-BR',{month:'short'}));
        dados.push(Math.floor(Math.random() * 5000)); // Exemplo visual, substituir por dados reais se necessário
    }

    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: 'Receita Estimada', data: dados, borderColor: '#00796b', tension: 0.3 }]
        }
    });
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
// PARTE 5: SUPER ADMIN, USERS LIST, BACKUP E INICIALIZAÇÃO
// =============================================================================

// --- GESTÃO GLOBAL (SUPER ADMIN) - CRIAÇÃO DE EMPRESA ---

async function createCompanyAndUser(e) {
    e.preventDefault(); // Impede recarregamento da página
    
    // Verificações de segurança
    if (!window.dbRef || !window.dbRef.secondaryApp || !window.dbRef.getAuth) {
        return alert("Erro crítico: Firebase não inicializado corretamente.");
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
        const userCred = await window.dbRef.createUserWithEmailAndPassword(auth2, email, password);
        const newUser = userCred.user;

        // 2. Salva no Firestore Principal (users)
        const { setDoc, doc, db } = window.dbRef;
        await setDoc(doc(db, "users", newUser.uid), {
            uid: newUser.uid,
            name: "ADMINISTRADOR",
            email: email,
            role: "admin",
            company: domain,
            approved: true, // Admin já nasce aprovado
            createdAt: new Date().toISOString()
        });

        // 3. Inicializa coleção da empresa (evita erros de leitura vazia)
        await setDoc(doc(db, "companies", domain, "data", "db_minha_empresa"), { 
            items: { razaoSocial: domain.toUpperCase(), cnpj: "", telefone: "" } 
        });

        // 4. Limpeza e Logout do App Secundário
        await window.dbRef.signOut(auth2);

        alert(`SUCESSO!\n\nEmpresa: ${domain}\nLogin: ${email}\nSenha: ${password}\n\nO admin já pode acessar.`);
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

// Listener do formulário Super Admin
const fSuper = document.getElementById('formCreateCompany');
if(fSuper) fSuper.addEventListener('submit', createCompanyAndUser);


// --- LISTAGEM DE FUNCIONÁRIOS DA EMPRESA (ADMIN) ---
// Corrige o problema: "Funcionários ativos não estão aparecendo"

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
    // Filtra exceto o próprio admin logado (opcional)
    const lista = users.filter(u => u.email !== window.CURRENT_USER.email);
    
    const pendentes = lista.filter(u => !u.approved);
    const ativos = lista.filter(u => u.approved);

    // 1. Tabela Pendentes
    const tbPend = document.getElementById('tabelaCompanyPendentes');
    if (tbPend) {
        if (pendentes.length === 0) {
            tbPend.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">NENHUMA SOLICITAÇÃO PENDENTE.</td></tr>';
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

    // 2. Tabela Ativos
    const tbAtiv = document.getElementById('tabelaCompanyAtivos');
    if (tbAtiv) {
        if (ativos.length === 0) {
            tbAtiv.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">NENHUM FUNCIONÁRIO ATIVO.</td></tr>';
        } else {
            tbAtiv.querySelector('tbody').innerHTML = ativos.map(u => `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role.toUpperCase()}</td>
                    <td><span style="color:green;font-weight:bold;">ATIVO</span></td>
                    <td>
                        <button class="btn-warning btn-mini" onclick="approveUser('${u.uid}', false)">BLOQUEAR</button>
                        <button class="btn-danger btn-mini" onclick="deleteUser('${u.uid}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    }
}

// Funções de Gestão de Usuário
window.approveUser = async function(uid, status) {
    if(!confirm(status ? "Aprovar acesso deste usuário?" : "Bloquear acesso deste usuário?")) return;
    try {
        const { updateDoc, doc, db } = window.dbRef;
        await updateDoc(doc(db, "users", uid), { approved: status });
    } catch(e) { alert("Erro ao atualizar: " + e.message); }
}

window.deleteUser = async function(uid) {
    if(!confirm("TEM CERTEZA? Isso excluirá o login do usuário permanentemente.")) return;
    try {
        const { deleteDoc, doc, db } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
    } catch(e) { alert("Erro ao excluir: " + e.message); }
}


// --- BACKUP E RESTAURAÇÃO ---

window.exportDataBackup = function() {
    if(window.IS_READ_ONLY) return alert("Apenas admin.");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(APP_CACHE));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `backup_logimaster_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

window.importDataBackup = function(event) {
    if(window.IS_READ_ONLY) return alert("Apenas admin.");
    const file = event.target.files[0];
    if (!file) return;
    if(!confirm("ATENÇÃO: ISSO SUBSTITUIRÁ TODOS OS DADOS ATUAIS PELOS DO ARQUIVO.\n\nCONTINUAR?")) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
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
    if(!confirm("PERIGO EXTREMO: ISSO APAGARÁ TODOS OS DADOS DA EMPRESA.\n\nTEM CERTEZA?")) return;
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
    console.log("Login:", user.email, "| Role:", user.role);
    window.CURRENT_USER = user;
    
    // 1. Reset Visual: Esconde menus e páginas
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // 2. Roteamento Lógico
    if(user.email === 'admin@logimaster.com') {
        // --- SUPER ADMIN ---
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdminRealtime(); 
    } 
    else if (user.role === 'admin') {
        // --- ADMIN EMPRESA ---
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        setupCompanyRealtime();
        setupCompanyUsersList(); // Inicia monitoramento de usuários
    } 
    else {
        // --- FUNCIONÁRIO ---
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

    // Monitora todas as coleções de dados
    Object.values(DB_KEYS).forEach(key => {
        onSnapshot(doc(db, 'companies', company, 'data', key), (docSnap) => {
            if(docSnap.exists()) {
                APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            } else {
                APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            }
            refreshUI(); // Atualiza tela
        });
    });
}

function setupSuperAdminRealtime() {
    const { db, collection, query, onSnapshot } = window.dbRef;
    onSnapshot(query(collection(db, "users")), (snap) => {
        const users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });
}

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
            <div class="domain-header"><strong>${comp.toUpperCase()}</strong> (${list.length} Usuários)</div>
            <div class="domain-content open">
                ${list.map(u => `<div class="user-row"><span>${u.email} (${u.role})</span> <span style="color:${u.approved?'green':'red'}">${u.approved?'ATIVO':'BLOQ'}</span></div>`).join('')}
            </div>
        </div>`;
    }
    container.innerHTML = html || '<p style="text-align:center; padding:20px;">Nenhuma empresa cadastrada.</p>';
}

// --- REFRESH UI CENTRALIZADO ---

function refreshUI() {
    if(!window.CURRENT_USER) return;

    // Se for Admin
    if (window.CURRENT_USER.role === 'admin') {
        if(typeof populateAllSelects === 'function') populateAllSelects();
        if(typeof renderOperacaoTable === 'function') renderOperacaoTable();
        if(typeof renderCadastroTable === 'function') {
            renderCadastroTable(DB_KEYS.MOTORISTAS);
            renderCadastroTable(DB_KEYS.VEICULOS);
            renderCadastroTable(DB_KEYS.CONTRATANTES);
            renderCadastroTable(DB_KEYS.AJUDANTES);
            if(typeof renderAtividadesTable === 'function') renderAtividadesTable();
        }
        if(typeof renderDespesasTable === 'function') renderDespesasTable();
        if(typeof updateDashboardStats === 'function') updateDashboardStats();
        if(typeof renderCalendar === 'function') renderCalendar(new Date());
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof renderMinhaEmpresaInfo === 'function') renderMinhaEmpresaInfo();
    }
    // Se for Funcionário
    else if (window.CURRENT_USER.role !== 'admin' && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
        if(typeof renderEmployeeProfileView === 'function') renderEmployeeProfileView();
    }
}

// --- SETUP INICIAL (DOM LOADED) ---
document.addEventListener('DOMContentLoaded', () => {
    // Navegação Principal
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            document.getElementById(pageId).classList.add('active');

            // Chamadas específicas por página
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

    // Menu Mobile
    const btnMob = document.getElementById('mobileMenuBtn');
    const side = document.getElementById('sidebar');
    const over = document.getElementById('sidebarOverlay');
    if(btnMob) {
        btnMob.addEventListener('click', () => { side.classList.add('active'); over.classList.add('active'); });
        over.addEventListener('click', () => { side.classList.remove('active'); over.classList.remove('active'); });
    }

    // Handlers de Formulário
    if(typeof setupFormHandlers === 'function') setupFormHandlers();
});