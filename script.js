// =============================================================================
// 1. CONFIGURAÇÕES
// =============================================================================
const DB_KEYS = {
    MOTORISTAS: 'db_motoristas', VEICULOS: 'db_veiculos', CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes', MINHA_EMPRESA: 'db_minha_empresa', DESPESAS_GERAIS: 'db_despesas_gerais',
    AJUDANTES: 'db_ajudantes', ATIVIDADES: 'db_atividades', CHECKINS: 'db_checkins', PROFILE_REQUESTS: 'db_profile_requests'
};

const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [], [DB_KEYS.VEICULOS]: [], [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [], [DB_KEYS.MINHA_EMPRESA]: {}, [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [], [DB_KEYS.ATIVIDADES]: [], [DB_KEYS.CHECKINS]: [], [DB_KEYS.PROFILE_REQUESTS]: []
};

window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

function loadData(key) { return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []); }

async function saveData(key, value) {
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES && key !== DB_KEYS.PROFILE_REQUESTS) return;
    APP_CACHE[key] = value;
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        try { await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', key), { items: value }); } catch (e) { console.error(e); }
    } else { localStorage.setItem(key, JSON.stringify(value)); }
}

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');
const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)||0);
function formatCPF_CNPJ(v) { const d = onlyDigits(v); return d.length <= 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4") : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5"); }
function formatPhoneBr(v) { const d = onlyDigits(v); return d.length > 10 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}` : `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`; }
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>alert("Copiado!"), ()=>alert("Erro")); }
function detectPixType(k) { if(k.includes('@')) return 'EMAIL'; if(/^\d{11}$/.test(k)) return 'CPF'; return 'OUTRO'; }

// Getters
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(p) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === p); }
function getContratante(c) { return loadData(DB_KEYS.CONTRATANTES).find(x => x.cnpj === c); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

function obterUltimoKmFinal(placa) {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && op.kmFinal > 0).sort((a,b) => new Date(b.data) - new Date(a.data));
    return ops.length ? Number(ops[0].kmFinal) : 0;
}
function obterUltimoPrecoCombustivel(placa) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && op.precoLitro > 0).sort((a,b) => new Date(b.data) - new Date(a.data));
    return ops.length ? Number(ops[0].precoLitro) : 0;
}
function calcularMediaHistoricaVeiculo(placa) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    let km = 0, lit = 0;
    ops.forEach(op => { km += Number(op.kmRodado)||0; if(op.combustivel && op.precoLitro) lit += (op.combustivel/op.precoLitro); });
    return lit > 0 ? km/lit : 0;
}
function calcularCustoConsumoViagem(op) {
    const med = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if(med <= 0 || !op.kmRodado) return 0;
    let pr = Number(op.precoLitro) || obterUltimoPrecoCombustivel(op.veiculoPlaca);
    return pr > 0 ? (op.kmRodado / med) * pr : 0;
}
// =============================================================================
// 5. VALIDAÇÕES E UI (MODAIS E VISUALIZAÇÃO)
// =============================================================================

function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    
    // Converte para data (zerando hora para comparação justa)
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} ESTÁ VENCIDA!`);
    else if (diffDays <= 30) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCE EM ${diffDays} DIAS.`);
}

function toggleCursoInput() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
}

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

// =============================================================================
// 6. LÓGICA DE AJUDANTES (ADIÇÃO DINÂMICA NA OPERAÇÃO)
// =============================================================================

let _pendingAjudanteToAdd = null;

function openAdicionarAjudanteModal(ajudanteObj, onAddCallback) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA: AÇÃO NÃO PERMITIDA.");
    _pendingAjudanteToAdd = {
        ajudanteObj,
        onAddCallback
    };
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

// Listener global para o botão de adicionar ajudante no modal
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) {
            closeAdicionarAjudanteModal();
            return;
        }
        const {
            ajudanteObj,
            onAddCallback
        } = _pendingAjudanteToAdd;
        onAddCallback({
            id: ajudanteObj.id,
            diaria: Number(val.toFixed(2))
        });
        closeAdicionarAjudanteModal();
    }
});

window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    if (window.IS_READ_ONLY) return;
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    
    const id = Number(sel.value);
    const already = (window._operacaoAjudantesTempList || []).some(a => Number(a.id) === id);
    
    if (already) {
        alert('ESTE AJUDANTE JÁ FOI ADICIONADO À LISTA.');
        sel.value = "";
        return;
    }
    
    const ajud = getAjudante(id);
    if (!ajud) return;
    
    openAdicionarAjudanteModal(ajud, (result) => {
        window._operacaoAjudantesTempList = window._operacaoAjudantesTempList || [];
        window._operacaoAjudantesTempList.push(result);
        renderAjudantesAdicionadosList();
        sel.value = "";
    });
}

function renderAjudantesAdicionadosList() {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    
    const arr = window._operacaoAjudantesTempList || [];
    if (!arr.length) {
        list.innerHTML = '<li style="color:var(--secondary-color)">NENHUM AJUDANTE ADICIONADO.</li>';
        return;
    }
    
    const html = arr.map(a => {
        const ajud = getAjudante(a.id) || {};
        const btnDelete = window.IS_READ_ONLY ? '' : `<button class="btn-mini" type="button" style="margin-left:8px;" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button>`;
        return `<li>${ajud.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} ${btnDelete}</li>`;
    }).join('');
    
    list.innerHTML = html;
}

function removeAjudanteFromOperation(id) {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
}

// =============================================================================
// 7. POPULATE SELECTS (PREENCHER DROPDOWNS - CRÍTICO)
// =============================================================================

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    
    // Tenta preservar a seleção atual se o select for recarregado
    const prev = Array.from(sel.selectedOptions).map(o => o.value);
    
    sel.innerHTML = `<option value="">${initialText}</option>`;
    
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
    
    try {
        Array.from(sel.options).forEach(o => {
            if (prev.includes(o.value)) o.selected = true;
        });
    } catch {}
}

function populateAllSelects() {
    // Carrega dados do cache local
    const motoristas = loadData(DB_KEYS.MOTORISTAS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const ajudantes = loadData(DB_KEYS.AJUDANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // Preenche os Selects da Tela de Operação
    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE PARA ADICIONAR AJUDANTE...');
    
    // Outros Selects (Despesas, Relatórios, etc.)
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    // Select Especial do Recibo (Motorista + Ajudante)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE O MOTORISTA OU AJUDANTE...</option>`;
        motoristas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = `motorista:${m.id}`;
            opt.textContent = `MOTORISTA - ${m.nome}`;
            selRecibo.appendChild(opt);
        });
        ajudantes.forEach(a => {
            const opt = document.createElement('option');
            opt.value = `ajudante:${a.id}`;
            opt.textContent = `AJUDANTE - ${a.nome}`;
            selRecibo.appendChild(opt);
        });
    }
    
    // Atualiza as tabelas visuais também para garantir sincronia
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    
    // Se a tabela de atividades existisse, renderizaria aqui
    renderMinhaEmpresaInfo();
    
    // Se a função renderCheckinsTable já tiver sido lida (estará na parte 4/5), chama ela.
    // O typeof check previne erro se o arquivo ainda estiver carregando.
    if(typeof renderCheckinsTable === 'function') renderCheckinsTable(); 
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    if (emp && emp.razaoSocial) {
        div.innerHTML = `
            <p><strong>RAZÃO SOCIAL:</strong> ${emp.razaoSocial}</p>
            <p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p>
            <p><strong>TELEFONE:</strong> ${formatPhoneBr(emp.telefone || '')}</p>
        `;
    } else {
        div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO CADASTRADO.</p>`;
    }
}

// =============================================================================
// 8. TABELAS DE CADASTRO (RENDERIZAÇÃO)
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, rowsHtml = '';
    let idKey = 'id';
    
    // Mapeamento Chave -> ID da Tabela
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) {
        tabela = document.getElementById('tabelaVeiculos');
        idKey = 'placa';
    }
    else if (key === DB_KEYS.CONTRATANTES) {
        tabela = document.getElementById('tabelaContratantes');
        idKey = 'cnpj';
    }

    if (!tabela) return;

    // Gera linhas da tabela
    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        
        let btns = '';
        if (key !== DB_KEYS.ATIVIDADES) {
             btns += `<button class="btn-action btn-mini" title="VISUALIZAR" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        }
        
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action btn-mini edit-btn" title="EDITAR" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                     <button class="btn-action btn-mini delete-btn" title="EXCLUIR" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }

        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td>${col3 !== '' ? `<td>${col3}</td>` : ''}<td>${btns}</td></tr>`;
    });
    
    // Insere no HTML
    if (tabela.querySelector('tbody')) {
        tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
    }
}
// =============================================================================
// 9. CRUD GENÉRICO (VISUALIZAR, EDITAR, EXCLUIR)
// =============================================================================

function viewCadastro(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);
    
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.6;">';
    // Lógica específica para exibir detalhes bonitos dependendo do tipo
    if (key === DB_KEYS.MOTORISTAS) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p>
                 <p><strong>DOCUMENTO:</strong> ${item.documento}</p>
                 <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
                 <p><strong>CNH:</strong> ${item.cnh || ''} (CAT: ${item.categoriaCNH || '-'})</p>
                 <p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p>
                 <p><strong>PIX:</strong> ${item.pix || ''}</p>`;
                 
        if(item.email) html += `<hr><p style="color:var(--primary-color);"><strong>LOGIN DE ACESSO:</strong> ${item.email}</p>`;
    } 
    else if (key === DB_KEYS.AJUDANTES) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p>
                 <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>
                 <p><strong>PIX:</strong> ${item.pix || ''}</p>`;
        if(item.email) html += `<hr><p style="color:var(--primary-color);"><strong>LOGIN DE ACESSO:</strong> ${item.email}</p>`;
    }
    else if (key === DB_KEYS.VEICULOS) {
        html += `<p><strong>PLACA:</strong> ${item.placa}</p>
                 <p><strong>MODELO:</strong> ${item.modelo}</p>
                 <p><strong>ANO:</strong> ${item.ano || ''}</p>`;
    }
    else if (key === DB_KEYS.CONTRATANTES) {
        html += `<p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p>
                 <p><strong>CNPJ:</strong> ${formatCPF_CNPJ(item.cnpj)}</p>
                 <p><strong>TELEFONE:</strong> ${formatPhoneBr(item.telefone || '')}</p>`;
    }
    html += '</div>';
    openViewModal('DETALHES DO REGISTRO', html);
}

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    // Carrega os dados no formulário para edição
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
        toggleCursoInput();
        document.getElementById('motoristaCursoDescricao').value = m.cursoDescricao;
        document.getElementById('motoristaPix').value = m.pix;
        document.getElementById('motoristaId').value = m.id;
        // Muda para a aba correta
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
    
    alert('DADOS CARREGADOS NO FORMULÁRIO. FAÇA AS ALTERAÇÕES E CLIQUE EM SALVAR.');
}

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTE ITEM?')) return;
    
    let arr = loadData(key).slice(); // Cria cópia
    let idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    const newArr = arr.filter(it => String(it[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        renderCadastroTable(key);
        // ATUALIZA OS SELECTS IMEDIATAMENTE APÓS EXCLUIR
        populateAllSelects();
        alert('ITEM EXCLUÍDO COM SUCESSO.');
    });
}

// =============================================================================
// 10. FORM HANDLERS (CADASTROS BÁSICOS)
// =============================================================================

function setupFormHandlers() {
    
    // --- MOTORISTA ---
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const nomeInput = document.getElementById('motoristaNome').value.toUpperCase();
            
            // Lógica de ID e Email
            let newId = idHidden ? Number(idHidden) : Date.now();
            let emailGerado = null;
            
            // Se for novo, gera email sugerido
            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const cleanName = nomeInput.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                emailGerado = `${cleanName}.${Math.floor(Math.random()*100)}@${companyDomain}`;
            }

            // Preserva o email se for edição
            let existingEmail = '';
            if(idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
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
                email: existingEmail || emailGerado || ''
            };
            
            // Atualiza ou Adiciona
            const idx = arr.findIndex(a => String(a.id) === String(newId));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.MOTORISTAS, arr).then(() => {
                formMotorista.reset();
                document.getElementById('motoristaId').value = '';
                renderCadastroTable(DB_KEYS.MOTORISTAS);
                populateAllSelects(); // ATUALIZA OS SELECTS DA OPERAÇÃO
                
                if (emailGerado) alert(`MOTORISTA SALVO!\n\nLOGIN DE ACESSO SUGERIDO: ${emailGerado}\n(Lembre de criar este usuário no painel "Equipe" para ele acessar)`);
                else alert('MOTORISTA ATUALIZADO.');
            });
        });
    }

    // --- VEÍCULO ---
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            
            // Verifica duplicidade se for novo (veiculoId vazio)
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
            
            // Se mudou a placa na edição, remove a antiga e põe a nova
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
                populateAllSelects(); // ATUALIZA OS SELECTS DA OPERAÇÃO
                alert('VEÍCULO SALVO.');
            });
        });
    }

    // --- CONTRATANTE ---
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
                populateAllSelects(); // ATUALIZA OS SELECTS
                alert('CONTRATANTE SALVA.');
            });
        });
    }

    // --- AJUDANTE ---
    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const nomeInput = document.getElementById('ajudanteNome').value.toUpperCase();
            
            let newId = idHidden ? Number(idHidden) : Date.now();
            let emailGerado = null;

            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const cleanName = nomeInput.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                emailGerado = `${cleanName}.${Math.floor(Math.random()*100)}@${companyDomain}`;
            }
            
            let existingEmail = '';
            if(idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
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
                populateAllSelects(); // ATUALIZA OS SELECTS
                
                if (emailGerado) alert(`AJUDANTE SALVO!\n\nLOGIN SUGERIDO: ${emailGerado}`);
                else alert('AJUDANTE ATUALIZADO.');
            });
        });
    }

    // --- MINHA EMPRESA ---
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
                alert('DADOS DA EMPRESA SALVOS.');
            });
        });
    }

    // --- SOLICITAÇÃO DE PERFIL (FUNCIONÁRIO) ---
    const formReq = document.getElementById('formRequestProfileChange');
    if (formReq) {
        formReq.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!window.CURRENT_USER) return;
            
            const role = window.CURRENT_USER.role;
            let dbKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
            let originalUser = loadData(dbKey).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
            
            if (!originalUser) return alert("Erro: Seu perfil não foi encontrado no cadastro.");

            // Coleta dados
            const changes = [];
            const newPhone = document.getElementById('reqEmpTelefone').value;
            const newPix = document.getElementById('reqEmpPix').value;
            
            if (newPhone && newPhone !== originalUser.telefone) changes.push({field: 'telefone', label: 'TELEFONE', old: originalUser.telefone, new: newPhone});
            if (newPix && newPix !== originalUser.pix) changes.push({field: 'pix', label: 'CHAVE PIX', old: originalUser.pix, new: newPix});
            
            if (changes.length === 0) return alert("Nenhuma alteração detectada.");

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
                alert("Solicitação enviada ao administrador!");
            });
        });
    }
}
// --- OPERAÇÃO (ADMIN) ---
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const motId = document.getElementById('selectMotoristaOperacao').value;
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            
            if (motId) verificarValidadeCNH(motId);
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idHidden = document.getElementById('operacaoId').value;
            const ajudantesVisual = window._operacaoAjudantesTempList || [];
            
            // Define o status inicial
            const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
                status: statusFinal,
                data: document.getElementById('operacaoData').value,
                motoristaId: Number(motId) || null,
                veiculoPlaca: document.getElementById('selectVeiculoOperacao').value || '',
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value || '',
                atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
                faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
                comissao: Number(document.getElementById('operacaoComissao').value) || 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
                kmInicial: 0,
                kmFinal: 0,
                dataHoraInicio: null, // Para gravar o horário exato do início
                ajudantes: ajudantesVisual.slice(),
                checkins: { motorista: false, ajudantes: [], ajudantesLog: {} }
            };
            
            // Atualiza ou Adiciona
            const idx = arr.findIndex(o => String(o.id) === String(obj.id));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr).then(() => {
                // Limpeza
                window._operacaoAjudantesTempList = [];
                document.getElementById('listaAjudantesAdicionados').innerHTML = '';
                formOperacao.reset();
                document.getElementById('operacaoId').value = '';
                document.getElementById('operacaoIsAgendamento').checked = false;
                
                renderOperacaoTable();
                
                // Se o painel de checkins estiver visível, atualiza ele também
                if(typeof renderCheckinsTable === 'function') renderCheckinsTable();

                alert(isAgendamento ? 'OPERAÇÃO AGENDADA E ENVIADA PARA O MOTORISTA.' : 'OPERAÇÃO SALVA E CONFIRMADA.');
            });
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
        });
    }

    // --- DESPESA GERAL ---
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
            const idHidden = document.getElementById('despesaGeralId').value;

            if (idHidden) {
                // Edição Simples
                const idx = arr.findIndex(d => String(d.id) === String(idHidden));
                if (idx >= 0) {
                     arr[idx].data = document.getElementById('despesaGeralData').value;
                     arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                     arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                     arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
                }
            } else {
                // Nova Despesa (Com Parcelamento)
                const dataBaseStr = document.getElementById('despesaGeralData').value;
                const veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                const descricaoBase = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
                const modoPagamento = document.getElementById('despesaModoPagamento').value;
                const formaPagamento = document.getElementById('despesaFormaPagamento').value; 
                
                let numParcelas = 1;
                let intervaloDias = 30;
                let parcelasJaPagas = 0;
                
                if (modoPagamento === 'parcelado') {
                    numParcelas = parseInt(document.getElementById('despesaParcelas').value) || 2; 
                    intervaloDias = parseInt(document.getElementById('despesaIntervaloDias').value) || 30;
                    const inputPagas = document.getElementById('despesaParcelasPagas');
                    if (inputPagas) parcelasJaPagas = parseInt(inputPagas.value) || 0;
                }
                
                const valorParcela = valorTotal / numParcelas;
                const [y_ini, m_ini, d_ini] = dataBaseStr.split('-').map(Number);
                const dataBase = new Date(y_ini, m_ini - 1, d_ini); // Mês começa em 0 no JS
                
                for (let i = 0; i < numParcelas; i++) {
                    const id = Date.now() + i; // ID único sequencial
                    const dataObj = new Date(dataBase);
                    dataObj.setDate(dataBase.getDate() + (i * intervaloDias));
                    
                    const y = dataObj.getFullYear();
                    const m = String(dataObj.getMonth() + 1).padStart(2, '0');
                    const d = String(dataObj.getDate()).padStart(2, '0');
                    const dataParcela = `${y}-${m}-${d}`;
                    
                    const descFinal = numParcelas > 1 ? `${descricaoBase} (${i+1}/${numParcelas})` : descricaoBase;
                    const estaPaga = i < parcelasJaPagas;
                    
                    arr.push({ 
                        id, 
                        data: dataParcela, 
                        veiculoPlaca, 
                        descricao: descFinal, 
                        valor: Number(valorParcela.toFixed(2)), 
                        modoPagamento, 
                        formaPagamento, 
                        pago: estaPaga 
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
} // Fim setupFormHandlers

// --- CHECK-IN (Confirmar Início/Fim ou Presença) ---
const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    formCheckin.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!window.CURRENT_USER) return alert("Sessão inválida.");

        const opId = Number(document.getElementById('checkinOpId').value);
        const step = document.getElementById('checkinStep').value;
        
        let arr = loadData(DB_KEYS.OPERACOES).slice();
        const idx = arr.findIndex(o => Number(o.id) === opId);
        
        if (idx >= 0) {
            const op = arr[idx];
            // Garante estrutura
            if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], ajudantesLog: {} };
            if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};

            let isMotorista = window.CURRENT_USER.role === 'motorista';
            let confirmouAlguem = false;
            const agora = new Date().toISOString(); // DATA/HORA DO CLIQUE

            if (isMotorista) {
                const mot = getMotorista(op.motoristaId);
                // Verifica se sou eu
                if (mot && (mot.uid === window.CURRENT_USER.uid || mot.email === window.CURRENT_USER.email)) {
                    if (step === 'start') {
                        const kmIni = Number(document.getElementById('checkinKmInicial').value);
                        if (!kmIni || kmIni <= 0) return alert("Km inválido.");
                        
                        // Validação de Km anterior
                        const ultimoKm = obterUltimoKmFinal(op.veiculoPlaca);
                        if (kmIni < ultimoKm) return alert(`ERRO: Km Inicial (${kmIni}) menor que o último registrado (${ultimoKm}).`);
                        
                        op.kmInicial = kmIni;
                        op.status = 'EM_ANDAMENTO';
                        op.checkins.motorista = true;
                        op.dataHoraInicio = agora; // Registra hora
                        confirmouAlguem = true;
                        alert("VIAGEM INICIADA!");
                    } else {
                        // End
                        const kmFim = Number(document.getElementById('checkinKmFinal').value);
                        if (!kmFim || kmFim <= op.kmInicial) return alert("Km Final deve ser maior que Inicial.");
                        
                        op.kmFinal = kmFim;
                        op.kmRodado = kmFim - (op.kmInicial || 0);
                        op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                        op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                        op.status = 'CONFIRMADA';
                        confirmouAlguem = true;
                        alert("VIAGEM FINALIZADA!");
                    }
                }
            } else {
                // Ajudante
                const aj = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email);
                if (aj && op.ajudantes.some(a => Number(a.id) === Number(aj.id))) {
                    if (!op.checkins.ajudantes.includes(aj.id)) {
                        op.checkins.ajudantes.push(aj.id);
                        op.checkins.ajudantesLog[aj.id] = agora; // Registra hora
                    }
                    confirmouAlguem = true;
                    alert("PRESENÇA CONFIRMADA!");
                }
            }

            if (confirmouAlguem) {
                saveData(DB_KEYS.OPERACOES, arr);
                closeCheckinConfirmModal();
                if(typeof renderCheckinsTable === 'function') renderCheckinsTable();
            } else {
                alert("Erro: Você não está vinculado a esta operação.");
            }
        }
    });
}

function toggleDespesaParcelas() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const div = document.getElementById('divDespesaParcelas');
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'grid' : 'none';
        if (modo === 'avista') document.getElementById('despesaParcelas').value = 1;
    }
}
window.toggleDespesaParcelas = toggleDespesaParcelas;

// =============================================================================
// 11. TABELAS E DETALHES (ADMIN)
// =============================================================================

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;

    // Limita a 50 para performance
    const viewOps = ops.slice(0, 50);
    
    if (viewOps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO.</td></tr>';
        return;
    }

    tbody.innerHTML = viewOps.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '...';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        let statusBadge = '';
        
        if (op.status === 'AGENDADA') statusBadge = '<span class="status-pill pill-blocked" style="background:orange;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') statusBadge = '<span class="status-pill" style="background:#0288d1;">EM ROTA</span>';
        else statusBadge = '<span class="status-pill pill-active">OK</span>';

        return `<tr>
            <td>${dataFmt}</td>
            <td>${mot}</td>
            <td>${statusBadge}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td>
                <button class="btn-action btn-mini" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                ${!window.IS_READ_ONLY ? `<button class="btn-action btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>` : ''}
                ${!window.IS_READ_ONLY ? `<button class="btn-action btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;

    const viewDs = ds.slice(0, 50);
    
    if (viewDs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA.</td></tr>';
        return;
    }

    tbody.innerHTML = viewDs.map(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const st = d.pago ? '<span style="color:green;font-weight:bold;">PAGO</span>' : '<span style="color:red;font-weight:bold;">PENDENTE</span>';
        
        let btns = '';
        if (!window.IS_READ_ONLY) {
            const icon = d.pago ? 'fa-times' : 'fa-check';
            const cls = d.pago ? 'btn-warning' : 'btn-success';
            btns = `
                <button class="btn-action btn-mini ${cls}" onclick="toggleStatusDespesa(${d.id})"><i class="fas ${icon}"></i></button>
                <button class="btn-action btn-mini edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>
            `;
        }
        
        return `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td>${st}</td><td>${btns}</td></tr>`;
    }).join('');
}

window.toggleStatusDespesa = (id) => {
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
    alert('Editando despesa...');
    document.querySelector('[data-page="despesas"]').click(); // Vai para a página
}

// Detalhes da Operação (Cálculo Financeiro)
function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;

    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    const isOk = op.status === 'CONFIRMADA';

    // Calcula custos
    const checkins = op.checkins || { ajudantes: [] };
    const totalDiarias = (op.ajudantes || []).reduce((acc, a) => {
        // Se confirmada, só paga quem foi. Se não, mostra estimativa total.
        if (!isOk || (checkins.ajudantes && checkins.ajudantes.includes(a.id))) {
            return acc + (Number(a.diaria) || 0);
        }
        return acc;
    }, 0);

    const comb = Number(op.combustivel) || 0;
    const custos = (op.comissao || 0) + (op.despesas || 0) + totalDiarias + comb;
    const lucro = (op.faturamento || 0) - custos;
    const saldo = (op.faturamento || 0) - (op.adiantamento || 0);

    let html = `
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <p><strong>STATUS:</strong> ${op.status}</p>
        <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
                <small>FATURAMENTO</small><br><strong style="color:var(--success-color);">${formatCurrency(op.faturamento)}</strong>
            </div>
            <div>
                <small>CUSTOS TOTAIS</small><br><strong style="color:var(--danger-color);">${formatCurrency(custos)}</strong>
            </div>
        </div>
        <div style="background:#f9f9f9; padding:10px; margin-top:10px; border-radius:4px;">
            <p>COMISSÃO: ${formatCurrency(op.comissao)}</p>
            <p>ABASTECIMENTO: ${formatCurrency(comb)}</p>
            <p>PEDÁGIOS: ${formatCurrency(op.despesas)}</p>
            <p>DIÁRIAS EQUIPE: ${formatCurrency(totalDiarias)}</p>
        </div>
        <h3 style="text-align:center; margin-top:15px; color:${lucro >= 0 ? 'green' : 'red'};">LUCRO: ${formatCurrency(lucro)}</h3>
        <p style="text-align:center; font-size:0.8rem;">SALDO A RECEBER: ${formatCurrency(saldo)}</p>
    `;

    openOperationDetails('DETALHES FINANCEIROS', html);
}
// =============================================================================
// 12. CHECK-INS E VISUALIZAÇÃO DE EQUIPE (PAINEL E ADMIN)
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. TABELA DO ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) {
        let rows = '';
        if (!pendentes.length) rows = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA ROTA ATIVA.</td></tr>';
        else {
            pendentes.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                let statusLabel = op.status === 'AGENDADA' ? '<span style="color:orange;">AGUARDANDO</span>' : '<span style="color:#00796b; font-weight:bold;">EM ROTA</span>';
                
                // Ícones de status
                const stMot = op.checkins?.motorista ? '<i class="fas fa-check-circle" style="color:green"></i>' : '<i class="far fa-clock" style="color:orange"></i>';
                const stAju = (op.ajudantes||[]).map(a => (op.checkins?.ajudantes?.includes(a.id) ? '<i class="fas fa-check-circle" style="color:green"></i>' : '<i class="far fa-clock" style="color:orange"></i>')).join(' ');

                let actionBtn = op.status === 'AGENDADA' 
                    ? `<button class="btn-mini" style="background:var(--primary-color);color:white;" onclick="iniciarRotaManual(${op.id})">INICIAR</button>`
                    : `<span style="font-size:0.8rem; color:green;">INICIADA</span>`;

                rows += `<tr><td>${dataFmt}</td><td>${op.veiculoPlaca}</td><td>${stMot} ${motNome}</td><td>${stAju || '-'}</td><td>${statusLabel}</td>
                <td>${actionBtn} <button class="btn-mini edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}',${op.id})"><i class="fas fa-trash"></i></button></td></tr>`;
            });
        }
        if(tabelaAdmin.querySelector('tbody')) tabelaAdmin.querySelector('tbody').innerHTML = rows;
        if(document.getElementById('badgeCheckins')) document.getElementById('badgeCheckins').textContent = pendentes.length || 0;
    }

    // B. PAINEL DO FUNCIONÁRIO (CARTÕES)
    const listaMobile = document.getElementById('listaServicosAgendados');
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante') && listaMobile) {
        
        // Identifica o ID do usuário atual nos cadastros
        let myKey = window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const me = loadData(myKey).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
        
        if (!me) {
            listaMobile.innerHTML = '<p style="text-align:center; color:red;">SEU PERFIL NÃO ESTÁ VINCULADO. CONTATE O ADMIN.</p>';
            return;
        }

        // Filtra minhas operações
        const myOps = pendentes.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') return String(op.motoristaId) === String(me.id);
            return (op.ajudantes || []).some(a => String(a.id) === String(me.id));
        });

        if (!myOps.length) listaMobile.innerHTML = '<p style="text-align:center; color:#666;">NENHUMA VIAGEM AGENDADA.</p>';
        else {
            listaMobile.innerHTML = myOps.map(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const cliente = getContratante(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE DIVERSO';
                
                // Lógica de Equipe (Quem trabalha comigo?)
                let equipeHtml = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    const nomes = (op.ajudantes||[]).map(a => getAjudante(a.id)?.nome.split(' ')[0]).join(', ');
                    equipeHtml = nomes ? `<small style="color:#546e7a;"><i class="fas fa-users"></i> EQUIPE: ${nomes}</small>` : '<small>SEM AJUDANTES</small>';
                } else {
                    const mot = getMotorista(op.motoristaId)?.nome || 'A DEFINIR';
                    equipeHtml = `<small style="color:#546e7a;"><i class="fas fa-truck"></i> MOTORISTA: ${mot}</small>`;
                }

                // Botão de Ação
                let btn = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    if (op.status === 'AGENDADA') btn = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})">INICIAR VIAGEM</button>`;
                    else btn = `<button class="btn-danger" onclick="openCheckinConfirmModal(${op.id})">FINALIZAR VIAGEM</button>`;
                } else {
                    const jaFiz = op.checkins?.ajudantes?.includes(me.id);
                    if (jaFiz) btn = `<button class="btn-success" disabled>CONFIRMADO</button>`;
                    else btn = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})">CONFIRMAR PRESENÇA</button>`;
                }

                return `<div class="card" style="border-left:5px solid var(--primary-color); margin-bottom:15px;">
                    <h4 style="color:var(--primary-color);">${dataFmt} - ${op.veiculoPlaca}</h4>
                    <p style="font-weight:bold; margin:5px 0;">${cliente}</p>
                    ${equipeHtml}
                    <div style="margin-top:15px; text-align:right;">${btn}</div>
                </div>`;
            }).join('');
        }
    }
}

// === FILTRO DE HISTÓRICO COM HORA E VALOR ===
window.filtrarHistoricoFuncionario = function() {
    if (!window.CURRENT_USER) return;
    const ini = document.getElementById('empDataInicio').value;
    const fim = document.getElementById('empDataFim').value;
    if(!ini || !fim) return alert("Selecione as datas.");

    // Identifica usuário
    let role = window.CURRENT_USER.role;
    let myKey = role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    const me = loadData(myKey).find(u => u.uid === window.CURRENT_USER.uid || u.email === window.CURRENT_USER.email);
    if (!me) return alert("Perfil não vinculado.");

    const dIni = new Date(ini + 'T00:00:00');
    const dFim = new Date(fim + 'T23:59:59');

    const ops = loadData(DB_KEYS.OPERACOES);
    let total = 0;
    
    const html = ops.filter(op => {
        if (op.status !== 'CONFIRMADA') return false;
        const dOp = new Date(op.data + 'T00:00:00');
        if (dOp < dIni || dOp > dFim) return false;
        
        // Verifica se participou
        if (role === 'motorista') return String(op.motoristaId) === String(me.id);
        return (op.ajudantes || []).some(a => String(a.id) === String(me.id));
    }).sort((a,b) => new Date(a.data) - new Date(b.data)).map(op => {
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        // Define Valor e Hora
        let valor = 0, hora = '--:--';
        if (role === 'motorista') {
            valor = op.comissao || 0;
            if(op.dataHoraInicio) hora = new Date(op.dataHoraInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        } else {
            const ajCfg = op.ajudantes.find(a => String(a.id) === String(me.id));
            // Ajudante só recebe se tiver confirmado (Regra)
            if (op.checkins?.ajudantes?.includes(me.id)) {
                valor = Number(ajCfg.diaria) || 0;
                let logTime = op.checkins?.ajudantesLog?.[me.id];
                if(logTime) hora = new Date(logTime).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
            }
        }
        total += valor;
        
        return `<tr>
            <td>${dataFmt} <small style="color:#666">(${hora})</small></td>
            <td>${op.veiculoPlaca}</td>
            <td>${getContratante(op.contratanteCNPJ)?.razaoSocial || '-'}</td>
            <td style="color:${valor>0?'green':'red'}; font-weight:bold;">${formatCurrency(valor)}</td>
            <td>${valor>0 ? 'OK' : 'FALTA'}</td>
        </tr>`;
    }).join('');

    document.querySelector('#tabelaHistoricoCompleto tbody').innerHTML = html || '<tr><td colspan="5" style="text-align:center;">Nenhum registro.</td></tr>';
    document.getElementById('empTotalReceber').textContent = formatCurrency(total);
};

// =============================================================================
// SUPER ADMIN - GESTÃO GLOBAL
// =============================================================================

function setupSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, query, where, getDocs, updateDoc, deleteDoc, doc, setDoc } = window.dbRef;

    // Escuta usuários globais
    onSnapshot(query(collection(db, "users")), (snap) => {
        let users = [];
        snap.forEach(d => users.push(d.data()));
        renderGlobalHierarchy(users);
    });

    // 1. Criar Empresa (Pré-cadastro)
    const fCreate = document.getElementById('formCreateCompany');
    if(fCreate) fCreate.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dom = document.getElementById('newCompanyDomain').value.toLowerCase();
        const email = document.getElementById('newAdminEmail').value.toLowerCase();
        const pass = document.getElementById('newAdminPassword').value;
        
        try {
            // Cria registro no DB para que o usuário possa fazer "Sign Up" depois e ser aprovado auto
            await setDoc(doc(db, "users", "pre_" + Date.now()), {
                name: "ADMIN " + dom.toUpperCase(),
                email: email,
                role: 'admin',
                company: dom,
                approved: true, // Já nasce aprovado
                createdAt: new Date().toISOString(),
                tempPassword: pass // Apenas referência
            });
            alert(`EMPRESA ${dom} CRIADA!\n\nInstrua o cliente a acessar "CRIAR CONTA" usando este e-mail (${email}) e a senha que ele escolher.`);
            fCreate.reset();
        } catch(err) { alert("Erro: " + err.message); }
    });

    // 2. Enviar Mensagem Global
    const fMsg = document.getElementById('formSuperMessage');
    if(fMsg) fMsg.addEventListener('submit', async (e) => {
        e.preventDefault();
        const target = document.getElementById('superMsgTarget').value;
        const msg = document.getElementById('superMsgText').value;
        
        const q = query(collection(db, "users"), where("role", "==", "admin")); // Busca todos admins
        const snap = await getDocs(q);
        let count = 0;
        
        snap.forEach(docSnap => {
            const u = docSnap.data();
            if (target.toUpperCase() === 'TODOS' || u.email === target) {
                // Envia notificação
                window.dbRef.addDoc(collection(db, "notifications"), {
                    targetUid: u.uid, message: msg, sender: "SUPER ADMIN", date: new Date().toISOString(), read: false
                });
                count++;
            }
        });
        alert(`Mensagem enviada para ${count} administradores.`);
        fMsg.reset();
    });

    // Helpers Globais
    window.toggleCompanyBlock = async (domain, block) => {
        if(!confirm((block?"BLOQUEAR":"LIBERAR") + " a empresa " + domain + "?")) return;
        const q = query(collection(db, "users"), where("company", "==", domain));
        const snap = await getDocs(q);
        snap.forEach(u => updateDoc(u.ref, { approved: !block }));
        alert("Status da empresa atualizado.");
    };

    window.deleteCompanyData = async (domain) => {
        if(prompt(`Digite "${domain}" para confirmar EXCLUSÃO TOTAL:`) !== domain) return;
        const q = query(collection(db, "users"), where("company", "==", domain));
        const snap = await getDocs(q);
        snap.forEach(u => deleteDoc(u.ref));
        alert("Empresa excluída do sistema.");
    };
}

function renderGlobalHierarchy(users) {
    const div = document.getElementById('superAdminContainer');
    if(!div) return;

    let groups = {};
    users.forEach(u => {
        if(u.email === 'admin@logimaster.com') return; // Pula eu mesmo
        let dom = u.company || 'outros';
        if(!groups[dom]) groups[dom] = [];
        groups[dom].push(u);
    });

    div.innerHTML = Object.keys(groups).map(dom => {
        let us = groups[dom];
        let admins = us.filter(x => x.role === 'admin');
        let funcs = us.filter(x => x.role !== 'admin');
        let blocked = us.every(x => !x.approved);

        return `<div class="domain-block">
            <div class="domain-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <div class="domain-title"><i class="fas fa-building"></i> ${dom.toUpperCase()} (${us.length})</div>
                <div class="domain-actions">
                    <button class="btn-mini ${blocked?'btn-success':'btn-warning'}" onclick="event.stopPropagation(); toggleCompanyBlock('${dom}', ${!blocked})">${blocked?'LIBERAR':'BLOQUEAR'}</button>
                    <button class="btn-mini btn-danger" onclick="event.stopPropagation(); deleteCompanyData('${dom}')">EXCLUIR</button>
                </div>
            </div>
            <div class="domain-content">
                <div class="admin-section">
                    <strong>ADMINS:</strong>
                    ${admins.map(a => `<div class="user-row"><span>${a.name} (${a.email})</span><span class="${a.approved?'pill-active':'pill-blocked'} status-pill">${a.approved?'OK':'BLOQ'}</span></div>`).join('') || 'Nenhum'}
                </div>
                <div class="employee-section">
                    <strong>FUNCIONÁRIOS:</strong>
                    ${funcs.map(f => `<div class="user-row"><span>${f.name} (${f.email}) - ${f.role}</span><span class="${f.approved?'pill-active':'pill-blocked'} status-pill">${f.approved?'OK':'BLOQ'}</span></div>`).join('') || 'Nenhum'}
                </div>
            </div>
        </div>`;
    }).join('') || '<p style="text-align:center">Nenhuma empresa encontrada.</p>';
}

// =============================================================================
// INICIALIZAÇÃO
// =============================================================================

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // 1. Limpa Telas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // 2. Roteamento por Papel
    if (window.CURRENT_USER.email === 'admin@logimaster.com') {
        // SUPER ADMIN
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        setupSuperAdmin();
    } 
    else if (window.CURRENT_USER.role === 'admin') {
        // ADMIN DA EMPRESA
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Inicia no Dashboard
        
        // Carrega dados e popula selects
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
        // FUNCIONÁRIO
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active'); // Inicia no Check-in
        
        window.IS_READ_ONLY = true;
        renderCheckinsTable();
        renderEmployeeProfileView();
        checkNotifications();
    }
}

// Carrega lista de equipe no select de mensagem (Admin)
async function renderCompanyTeam() {
    const sel = document.getElementById('msgRecipientSelect');
    if(!sel || !window.dbRef) return;
    
    const q = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", window.CURRENT_USER.company));
    const snap = await window.dbRef.getDocs(q);
    
    sel.innerHTML = '<option value="all">TODOS OS FUNCIONÁRIOS</option>';
    snap.forEach(d => {
        if(d.data().role !== 'admin') {
            let opt = document.createElement('option');
            opt.value = d.data().uid; // Usa UID para envio direto
            opt.textContent = d.data().name;
            sel.appendChild(opt);
        }
    });
}

function setupRealtimeListeners() {
    if (!window.dbRef) return setTimeout(setupRealtimeListeners, 500);
    
    // Super Admin não precisa de realtime dos dados operacionais
    if (window.CURRENT_USER.email === 'admin@logimaster.com') return;

    if (window.CURRENT_USER.company) {
        Object.values(DB_KEYS).forEach(key => {
            window.dbRef.onSnapshot(window.dbRef.doc(window.dbRef.db, 'companies', window.CURRENT_USER.company, 'data', key), s => {
                if (s.exists()) {
                    APP_CACHE[key] = s.data().items;
                    // RE-POPULA OS SELECTS SEMPRE QUE DADOS CHEGAREM
                    if (key === DB_KEYS.MOTORISTAS || key === DB_KEYS.VEICULOS || key === DB_KEYS.CONTRATANTES || key === DB_KEYS.AJUDANTES || key === DB_KEYS.ATIVIDADES) {
                        populateAllSelects();
                    }
                    if (key === DB_KEYS.OPERACOES) {
                        renderOperacaoTable();
                        renderCheckinsTable();
                    }
                }
            });
        });
    }
}

// Inicia Notificações
function checkNotifications() {
    if(!window.dbRef || !window.CURRENT_USER) return;
    const q = window.dbRef.query(
        window.dbRef.collection(window.dbRef.db, "notifications"), 
        window.dbRef.where("targetUid", "==", window.CURRENT_USER.uid),
        window.dbRef.where("read", "==", false)
    );
    window.dbRef.onSnapshot(q, s => {
        if(!s.empty) {
            const n = s.docs[0].data();
            window.currNotifId = s.docs[0].id;
            document.getElementById('notificationMessageText').textContent = n.message;
            document.getElementById('notificationSender').textContent = "DE: " + n.sender;
            document.getElementById('modalNotification').style.display = 'block';
        }
    });
}
window.confirmReadNotification = async () => {
    if(window.currNotifId) {
        await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "notifications", window.currNotifId), {read:true});
        document.getElementById('modalNotification').style.display = 'none';
    }
};

window.iniciarRotaManual = function(id) {
    if(confirm("Confirmar início manual?")) {
        let arr = loadData(DB_KEYS.OPERACOES);
        let op = arr.find(o => o.id == id);
        if(op) { op.status = 'EM_ANDAMENTO'; saveData(DB_KEYS.OPERACOES, arr); }
    }
};