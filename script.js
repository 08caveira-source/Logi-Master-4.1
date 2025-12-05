// =============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS (COM FIREBASE)
// =============================================================================

// --- PROTEÇÃO DE ROTA E INICIALIZAÇÃO SEGURA ---
(function initSystemSecurity() {
    // Intervalo de verificação para garantir que o Firebase carregou
    const checkInterval = setInterval(() => {
        if (window.dbRef && window.dbRef.auth) {
            clearInterval(checkInterval);
            
            // Verifica se estamos na página de login
            const isLoginPage = window.location.href.includes('login.html');
            
            window.dbRef.auth.onAuthStateChanged((user) => {
                if (!user) {
                    // NÃO LOGADO: Se não estiver no login, expulsa imediatamente
                    if (!isLoginPage) {
                        console.warn("Acesso negado. Redirecionando para Login...");
                        // Redirecionamento forçado
                        window.location.href = "login.html";
                    }
                } else {
                    // LOGADO:
                    console.log("Usuário autenticado:", user.email);
                    
                    // Se tentar acessar login.html estando logado, manda pro index
                    if (isLoginPage) {
                        window.location.href = "index.html";
                        return;
                    }

                    // 1. Renderiza a barra de usuário no topo
                    renderTopBar(user.email);
                    
                    // 2. Tenta migrar dados locais antigos para a nuvem se necessário
                    setTimeout(migrateLocalToCloud, 1500);
                    
                    // 3. Inicia a escuta de dados em tempo real
                    setupRealtimeListeners();
                }
            });
        }
    }, 100); // Verifica a cada 100ms (rápido)
})();

const DB_KEYS = {
    MOTORISTAS: 'db_motoristas',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    AJUDANTES: 'db_ajudantes',
    ATIVIDADES: 'db_atividades'
};

// CACHE GLOBAL (Espelho do Banco de Dados)
const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [],
    [DB_KEYS.ATIVIDADES]: []
};

function loadData(key) {
    const data = APP_CACHE[key];
    if (!data) return (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
    // Retorna cópia para evitar mutação direta
    return Array.isArray(data) ? [...data] : {...data};
}

// Salva dados no Firebase (Nuvem)
async function saveData(key, value) {
    // Atualiza localmente para resposta instantânea na tela
    APP_CACHE[key] = value;
    
    if (window.dbRef) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            // Salva na nuvem na coleção correspondente, documento 'full_list'
            await setDoc(doc(db, key, 'full_list'), { items: value });
            console.log(`[NUVEM] ${key} sincronizado.`);
        } catch (e) {
            console.error(`Erro ao salvar ${key} na nuvem:`, e);
        }
    } else {
        console.warn("Firebase offline. Salvando apenas localmente.");
        localStorage.setItem(key, JSON.stringify(value));
    }
}

// --- MIGRAÇÃO AUTOMÁTICA (LOCAL -> NUVEM) ---
function migrateLocalToCloud() {
    const keys = Object.values(DB_KEYS);
    let migrated = 0;

    keys.forEach(key => {
        const localRaw = localStorage.getItem(key);
        if (localRaw) {
            try {
                const localData = JSON.parse(localRaw);
                const cloudData = APP_CACHE[key];
                
                const isCloudEmpty = Array.isArray(cloudData) ? cloudData.length === 0 : Object.keys(cloudData).length === 0;
                const hasLocalData = Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0;

                // Só migra se a nuvem estiver vazia para evitar sobrescrever dados novos
                if (hasLocalData && isCloudEmpty) {
                    console.log(`Migrando ${key} do LocalStorage para o Firebase...`);
                    saveData(key, localData); 
                    migrated++;
                }
            } catch (e) { console.error(`Erro migração ${key}:`, e); }
        }
    });
    if(migrated > 0) console.log(`${migrated} tabelas migradas para a nuvem.`);
}

// --- BARRA SUPERIOR DE USUÁRIO (CORRIGIDA) ---
function renderTopBar(email) {
    const existing = document.getElementById('topUserBar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'topUserBar';
    // Z-index 99999 garante que fique acima do menu mobile e sidebar
    bar.style.cssText = `
        position: fixed; top: 0; right: 0; 
        height: 50px; background: #263238; color: white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex; justify-content: flex-end; align-items: center; 
        padding: 0 20px; z-index: 99999; gap: 15px;
        border-bottom-left-radius: 10px;
        font-family: 'Inter', sans-serif;
    `;
    
    // Ajuste para telas pequenas (Mobile)
    if (window.innerWidth <= 768) {
        bar.style.width = '100%';
        bar.style.top = '0'; 
        bar.style.justifyContent = 'space-between';
        bar.style.background = 'rgba(38, 50, 56, 0.95)';
        bar.style.backdropFilter = 'blur(5px)';
        // Adiciona padding top para não colar no topo da tela
        document.body.style.paddingTop = '50px';
    }

    bar.innerHTML = `
        <div style="display:flex; flex-direction:column; text-align:right; line-height: 1.2;">
            <span style="font-weight:bold; color:#4db6ac; font-size:0.65rem; letter-spacing:1px;">USUÁRIO</span>
            <span style="font-size:0.8rem; color: white;">${email}</span>
        </div>
        <button onclick="logoutSystem()" class="btn-danger btn-mini" style="padding: 6px 12px; font-size:0.75rem; display:flex; align-items:center; gap:5px; cursor:pointer; border:1px solid #ef5350;">
            <i class="fas fa-sign-out-alt"></i> SAIR
        </button>
    `;
    document.body.appendChild(bar);
}

// --- LOGOUT GLOBAL ---
window.logoutSystem = function() {
    if(confirm("Tem certeza que deseja sair do sistema?")) {
        if (window.dbRef && window.dbRef.auth) {
            window.dbRef.auth.signOut().then(() => {
                window.location.href = "login.html";
            }).catch(err => {
                alert("Erro ao sair: " + err);
                // Força redirecionamento mesmo com erro
                window.location.href = "login.html";
            });
        } else {
            window.location.href = "login.html";
        }
    }
};

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// =============================================================================
// 2. FUNÇÕES HELPER
// =============================================================================
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 3. CÁLCULOS
// =============================================================================
function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsComPreco = todasOps.filter(op => op && op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    if (opsComPreco.length === 0) return 0;
    opsComPreco.sort((a, b) => new Date(b.data || '1970-01-01') - new Date(a.data || '1970-01-01'));
    return Number(opsComPreco[0].precoLitro) || 0;
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa);
    let totalKm = 0, totalLitros = 0;
    opsVeiculo.forEach(op => {
        if(op.kmRodado) totalKm += Number(op.kmRodado);
        if (Number(op.combustivel) > 0 && Number(op.precoLitro) > 0) {
            totalLitros += (Number(op.combustivel) / Number(op.precoLitro));
        }
    });
    return totalLitros > 0 ? totalKm / totalLitros : 0; 
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;
    let preco = Number(op.precoLitro) || obterUltimoPrecoCombustivel(op.veiculoPlaca);
    return preco > 0 ? (kmRodado / mediaKmL) * preco : 0;
}

// =============================================================================
// 4. FORMATADORES
// =============================================================================
function formatCPF_CNPJ(v) {
    const d = onlyDigits(v);
    if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m,a,b,c,e)=> e ? `${a}.${b}.${c}-${e}` : `${a}.${b}.${c}`);
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (m,a,b,c,d,e)=> e ? `${a}.${b}.${c}/${d}-${e}` : `${a}.${b}.${c}/${d}`);
}
function formatPhoneBr(v) {
    const d = onlyDigits(v);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}
function detectPixType(k) {
    if (!k) return '';
    if (k.includes('@')) return 'EMAIL';
    const d = onlyDigits(k);
    if (d.length === 11) return 'CPF/TEL';
    if (d.length === 14) return 'CNPJ';
    return 'ALEATÓRIA';
}
function copyToClipboard(t) {
    if(!t) return alert('Nada para copiar');
    navigator.clipboard.writeText(t).then(()=>alert('Copiado!'), ()=>alert('Erro ao copiar'));
}

// =============================================================================
// 5. UI & MODAIS
// =============================================================================
function verificarValidadeCNH(id) {
    const m = getMotorista(id);
    if (!m || !m.validadeCNH) return;
    const diff = Math.ceil((new Date(m.validadeCNH+'T00:00:00') - new Date()) / (86400000));
    if (diff < 0) alert(`CNH DE ${m.nome} VENCIDA!`);
    else if (diff <= 30) alert(`CNH DE ${m.nome} VENCE EM ${diff} DIAS.`);
}
function toggleCursoInput() {
    const el = document.getElementById('divCursoDescricao');
    if(el) el.style.display = document.getElementById('motoristaTemCurso').value === 'sim' ? 'flex' : 'none';
}
function openViewModal(t, h) {
    document.getElementById('viewItemTitle').textContent = t;
    document.getElementById('viewItemBody').innerHTML = h;
    document.getElementById('viewItemModal').style.display = 'block';
}
function closeViewModal() { document.getElementById('viewItemModal').style.display = 'none'; }
function openOperationDetails(t, h) {
    document.getElementById('modalTitle').textContent = t;
    document.getElementById('modalBodyContent').innerHTML = h;
    document.getElementById('operationDetailsModal').style.display = 'block';
}
function closeModal() { document.getElementById('operationDetailsModal').style.display = 'none'; }

// =============================================================================
// 6. AJUDANTES NA OPERAÇÃO
// =============================================================================
let _pendingAjudante = null;
function openAdicionarAjudanteModal(obj, cb) {
    _pendingAjudante = { obj, cb };
    document.getElementById('modalAjudanteNome').textContent = obj.nome;
    document.getElementById('modalDiariaInput').value = '';
    document.getElementById('modalAdicionarAjudante').style.display = 'block';
}
function closeAdicionarAjudanteModal() {
    _pendingAjudante = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}
document.addEventListener('click', e => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn' && _pendingAjudante) {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        _pendingAjudante.cb({ id: _pendingAjudante.obj.id, diaria: val });
        closeAdicionarAjudanteModal();
    }
});
function handleAjudanteSelectionChange() {
    const sel = document.getElementById('selectAjudantesOperacao');
    if(!sel || !sel.value) return;
    const id = Number(sel.value);
    if ((window._operacaoAjudantesTempList||[]).some(a=>Number(a.id)===id)) {
        alert('Já adicionado.'); sel.value=""; return;
    }
    const ajud = getAjudante(id);
    if (ajud) {
        openAdicionarAjudanteModal(ajud, res => {
            window._operacaoAjudantesTempList = window._operacaoAjudantesTempList || [];
            window._operacaoAjudantesTempList.push(res);
            renderAjudantesAdicionadosList();
            sel.value = "";
        });
    }
}
function renderAjudantesAdicionadosList() {
    const l = document.getElementById('listaAjudantesAdicionados');
    if (!l) return;
    const arr = window._operacaoAjudantesTempList || [];
    l.innerHTML = arr.map(a => `<li>${(getAjudante(a.id)||{}).nome || 'ID: '+a.id} - ${formatCurrency(a.diaria)} <button type="button" class="btn-mini" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button></li>`).join('') || '<li>Nenhum</li>';
}
function removeAjudanteFromOperation(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => a.id !== id);
    renderAjudantesAdicionadosList();
}

// =============================================================================
// 7. POPULATE SELECTS
// =============================================================================
function populateSelect(id, data, valKey, txtKey, def) {
    const s = document.getElementById(id);
    if(!s) return;
    const prev = s.value;
    s.innerHTML = `<option value="">${def}</option>` + data.map(i => `<option value="${i[valKey]}">${i[txtKey]}</option>`).join('');
    if(prev && Array.from(s.options).some(o => o.value === prev)) {
        s.value = prev;
    }
}

function populateAllSelects() {
    populateSelect('selectMotoristaOperacao', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome', 'SELECIONE...');
    populateSelect('selectVeiculoOperacao', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'SELECIONE...');
    populateSelect('selectVeiculoDespesaGeral', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'SELECIONE...');
    populateSelect('selectContratanteOperacao', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial', 'SELECIONE...');
    populateSelect('selectAtividadeOperacao', loadData(DB_KEYS.ATIVIDADES), 'id', 'nome', 'SELECIONE...');
    populateSelect('selectAjudantesOperacao', loadData(DB_KEYS.AJUDANTES), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    populateSelect('selectMotoristaRelatorio', loadData(DB_KEYS.MOTORISTAS), 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', loadData(DB_KEYS.VEICULOS), 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', loadData(DB_KEYS.CONTRATANTES), 'cnpj', 'razaoSocial', 'TODAS');

    const selRec = document.getElementById('selectMotoristaRecibo');
    if(selRec) {
        const prev = selRec.value;
        let html = '<option value="">SELECIONE...</option>';
        loadData(DB_KEYS.MOTORISTAS).forEach(m => html += `<option value="motorista:${m.id}">MOT: ${m.nome}</option>`);
        loadData(DB_KEYS.AJUDANTES).forEach(a => html += `<option value="ajudante:${a.id}">AJU: ${a.nome}</option>`);
        selRec.innerHTML = html;
        if(prev) selRec.value = prev;
    }
    
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
}

// =============================================================================
// 8. TABELAS DE CADASTRO
// =============================================================================
function renderCadastroTable(key) {
    let tId = '', idKey = 'id', col2Key = 'nome', col3Key = 'documento';
    if (key === DB_KEYS.MOTORISTAS) { tId = 'tabelaMotoristas'; }
    else if (key === DB_KEYS.VEICULOS) { tId = 'tabelaVeiculos'; idKey = 'placa'; col2Key = 'modelo'; col3Key = 'ano'; }
    else if (key === DB_KEYS.CONTRATANTES) { tId = 'tabelaContratantes'; idKey = 'cnpj'; col2Key = 'razaoSocial'; col3Key = 'telefone'; }
    else if (key === DB_KEYS.AJUDANTES) { tId = 'tabelaAjudantes'; }
    else if (key === DB_KEYS.ATIVIDADES) { tId = 'tabelaAtividades'; col3Key = null; }

    const tbody = document.querySelector(`#${tId} tbody`);
    if(!tbody) return;

    const data = loadData(key);
    tbody.innerHTML = data.map(i => `
        <tr>
            <td>${i[idKey]}</td>
            <td>${i[col2Key]}</td>
            ${col3Key ? `<td>${i[col3Key]||''}</td>` : ''}
            <td>
                <button class="btn-action edit-btn" onclick="editCadastroItem('${key}', '${i[idKey]}')"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${key}', '${i[idKey]}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center">Nenhum registro.</td></tr>';
}

function editCadastroItem(key, id) {
    const item = loadData(key).find(i => String(i[key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id')]) === String(id));
    if(!item) return;
    
    if(key === DB_KEYS.MOTORISTAS) {
        document.getElementById('motoristaId').value = item.id;
        document.getElementById('motoristaNome').value = item.nome;
        document.getElementById('motoristaDocumento').value = item.documento;
        document.getElementById('motoristaTelefone').value = item.telefone;
        document.getElementById('motoristaCNH').value = item.cnh;
        document.getElementById('motoristaValidadeCNH').value = item.validadeCNH;
        document.getElementById('motoristaCategoriaCNH').value = item.categoriaCNH;
        document.getElementById('motoristaTemCurso').value = item.temCurso ? 'sim' : 'nao';
        toggleCursoInput();
        document.getElementById('motoristaCursoDescricao').value = item.cursoDescricao || '';
        document.getElementById('motoristaPix').value = item.pix || '';
    } else if (key === DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa; 
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.getElementById('veiculoRenavam').value = item.renavam || '';
        document.getElementById('veiculoChassi').value = item.chassi || '';
    } else if (key === DB_KEYS.CONTRATANTES) {
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteTelefone').value = item.telefone || '';
    } else if (key === DB_KEYS.AJUDANTES) {
        document.getElementById('ajudanteId').value = item.id;
        document.getElementById('ajudanteNome').value = item.nome;
        document.getElementById('ajudanteDocumento').value = item.documento;
        document.getElementById('ajudanteTelefone').value = item.telefone;
        document.getElementById('ajudanteEndereco').value = item.endereco || '';
        document.getElementById('ajudantePix').value = item.pix || '';
    } else if (key === DB_KEYS.ATIVIDADES) {
        document.getElementById('atividadeId').value = item.id;
        document.getElementById('atividadeNome').value = item.nome;
    }
    
    alert(`Editando ${key}. Faça as alterações e clique em Salvar.`);
}

function deleteItem(key, id) {
    if(!confirm('ATENÇÃO: Excluir este item permanentemente?')) return;
    const idKey = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    const newData = loadData(key).filter(i => String(i[idKey]) !== String(id));
    saveData(key, newData);
}

// =============================================================================
// 10. FORM HANDLERS
// =============================================================================
function setupFormHandlers() {
    const setupGenericForm = (id, key, idField, extraLogic) => {
        const form = document.getElementById(id);
        if (!form) return;
        form.addEventListener('submit', e => {
            e.preventDefault();
            let arr = loadData(key).slice();
            let newItem = extraLogic(new FormData(form));
            
            let idx = -1;
            if (key === DB_KEYS.VEICULOS) idx = arr.findIndex(x => x.placa === newItem.placa);
            else if (key === DB_KEYS.CONTRATANTES) idx = arr.findIndex(x => x.cnpj === newItem.cnpj);
            else idx = arr.findIndex(x => Number(x.id) === Number(newItem.id));
            
            if (idx >= 0) arr[idx] = newItem; else arr.push(newItem);
            
            saveData(key, arr);
            form.reset();
            if(document.getElementById(idField)) document.getElementById(idField).value = '';
            alert('Salvo com sucesso!');
        });
    };

    setupGenericForm('formMotorista', DB_KEYS.MOTORISTAS, 'motoristaId', (fd) => {
        const id = document.getElementById('motoristaId').value;
        return {
            id: id ? Number(id) : (loadData(DB_KEYS.MOTORISTAS).length ? Math.max(...loadData(DB_KEYS.MOTORISTAS).map(m=>m.id))+1 : 101),
            nome: document.getElementById('motoristaNome').value.toUpperCase(),
            documento: document.getElementById('motoristaDocumento').value,
            telefone: document.getElementById('motoristaTelefone').value,
            cnh: document.getElementById('motoristaCNH').value,
            validadeCNH: document.getElementById('motoristaValidadeCNH').value,
            categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
            temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
            cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase(),
            pix: document.getElementById('motoristaPix').value
        };
    });

    setupGenericForm('formVeiculo', DB_KEYS.VEICULOS, 'veiculoId', () => ({
        placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
        modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
        ano: Number(document.getElementById('veiculoAno').value),
        renavam: document.getElementById('veiculoRenavam').value,
        chassi: document.getElementById('veiculoChassi').value
    }));

    setupGenericForm('formContratante', DB_KEYS.CONTRATANTES, 'contratanteId', () => ({
        cnpj: document.getElementById('contratanteCNPJ').value,
        razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
        telefone: document.getElementById('contratanteTelefone').value
    }));

    setupGenericForm('formAjudante', DB_KEYS.AJUDANTES, 'ajudanteId', () => {
        const id = document.getElementById('ajudanteId').value;
        return {
            id: id ? Number(id) : (loadData(DB_KEYS.AJUDANTES).length ? Math.max(...loadData(DB_KEYS.AJUDANTES).map(a=>a.id))+1 : 201),
            nome: document.getElementById('ajudanteNome').value.toUpperCase(),
            documento: document.getElementById('ajudanteDocumento').value,
            telefone: document.getElementById('ajudanteTelefone').value,
            endereco: document.getElementById('ajudanteEndereco').value.toUpperCase(),
            pix: document.getElementById('ajudantePix').value
        };
    });

    setupGenericForm('formAtividade', DB_KEYS.ATIVIDADES, 'atividadeId', () => {
        const id = document.getElementById('atividadeId').value;
        return {
            id: id ? Number(id) : (loadData(DB_KEYS.ATIVIDADES).length ? Math.max(...loadData(DB_KEYS.ATIVIDADES).map(a=>a.id))+1 : 1),
            nome: document.getElementById('atividadeNome').value.toUpperCase()
        };
    });

    const formMinhaEmpresa = document.getElementById('formMinhaEmpresa');
    if (formMinhaEmpresa) {
        formMinhaEmpresa.addEventListener('submit', (e) => {
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj);
            alert('Dados da empresa salvos.');
        });
    }

    // Despesa Geral
    const fDesp = document.getElementById('formDespesaGeral');
    if (fDesp) {
        fDesp.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
            const idHidden = document.getElementById('despesaGeralId').value;

            // Edição Simples
            if (idHidden) {
                const idx = arr.findIndex(d => d.id == idHidden);
                if (idx >= 0) {
                     arr[idx].data = document.getElementById('despesaGeralData').value;
                     arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                     arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                     arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
                }
                saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            } else {
                // Nova Despesa
                const dataBaseStr = document.getElementById('despesaGeralData').value;
                const veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                const descricaoBase = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
                const modo = document.getElementById('despesaModoPagamento').value;
                const formaPagamento = document.getElementById('despesaFormaPagamento').value; 
                
                let numParcelas = 1;
                let intervaloDias = 30;
                let parcelasJaPagas = 0;
                
                if (modo === 'parcelado') {
                    numParcelas = parseInt(document.getElementById('despesaParcelas').value) || 2; 
                    intervaloDias = parseInt(document.getElementById('despesaIntervaloDias').value) || 30;
                    const inputPagas = document.getElementById('despesaParcelasPagas');
                    if (inputPagas) parcelasJaPagas = parseInt(inputPagas.value) || 0;
                }

                const valorParcela = valorTotal / numParcelas;
                const [y_ini, m_ini, d_ini] = dataBaseStr.split('-').map(Number);
                const dataBase = new Date(y_ini, m_ini - 1, d_ini);

                for (let i = 0; i < numParcelas; i++) {
                    const id = arr.length ? Math.max(...arr.map(d => d.id)) + 1 : 1;
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
                        modoPagamento: modo,
                        formaPagamento: formaPagamento,
                        pago: estaPaga
                    });
                }
                saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            }
            fDesp.reset();
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            alert('Despesa salva!');
        });
        
        fDesp.addEventListener('reset', () => {
            document.getElementById('despesaGeralId').value = '';
            setTimeout(toggleDespesaParcelas, 50);
        });
    }

    // Operação
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const motId = document.getElementById('selectMotoristaOperacao').value;
            if (motId) verificarValidadeCNH(motId);

            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idHidden = document.getElementById('operacaoId').value;
            
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(o => o.id)) + 1 : 1),
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
                ajudantes: (window._operacaoAjudantesTempList || []).slice()
            };
            
            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            window._operacaoAjudantesTempList = [];
            renderAjudantesAdicionadosList();
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            alert('Operação salva com sucesso!');
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            renderAjudantesAdicionadosList();
        });
    }

    const formRel = document.getElementById('formRelatorio');
    if (formRel) formRel.addEventListener('submit', gerarRelatorio);
}

function toggleDespesaParcelas() {
    const div = document.getElementById('divDespesaParcelas');
    if(div) div.style.display = document.getElementById('despesaModoPagamento').value === 'parcelado' ? 'grid' : 'none';
}
window.toggleDespesaParcelas = toggleDespesaParcelas;

// =============================================================================
// 11. TABELAS DE DADOS
// =============================================================================
let currentDate = new Date();

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    if (ops.length === 0) {
         tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA.</td></tr>';
         return;
    }

    let rows = '';
    ops.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
        const custoDieselCalculado = calcularCustoConsumoViagem(op) || 0;
        const custosOperacionais = (op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselCalculado;
        const liquido = (op.faturamento || 0) - custosOperacionais;
        
        // Formata data para PT-BR sem problemas de timezone
        const [y, m, d] = op.data.split('-');
        const dataFmt = `${d}/${m}/${y}`;
        
        rows += `<tr><td>${dataFmt}</td><td>${motorista}</td><td>${atividade}</td><td>${formatCurrency(op.faturamento)}</td><td style="color:${liquido>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquido)}</td><td><button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);

    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
    const custoDieselEstimado = calcularCustoConsumoViagem(op) || 0;
    let litrosEstimados = 0;
    let precoUsado = Number(op.precoLitro);
    let origemPreco = "(INFORMADO NO DIA)";

    if (!precoUsado || precoUsado <= 0) {
        precoUsado = obterUltimoPrecoCombustivel(op.veiculoPlaca) || 0;
        origemPreco = "(BASEADO NO ÚLTIMO ABASTECIMENTO)";
    }
    if (mediaKmL > 0 && op.kmRodado > 0) litrosEstimados = Number(op.kmRodado) / mediaKmL;

    let infoConsumoHTML = '';
    if (mediaKmL > 0 && custoDieselEstimado > 0) {
        infoConsumoHTML = `<div class="modal-operation-block"><p><strong>MÉDIA HISTÓRICA DO VEÍCULO:</strong> ${mediaKmL.toFixed(2)} KM/L</p><p><strong>CONSUMO ESTIMADO NA VIAGEM:</strong> ${litrosEstimados.toFixed(1)} L</p><p><strong>PREÇO DO DIESEL CONSIDERADO:</strong> ${formatCurrency(precoUsado)} <small>${origemPreco}</small></p><p><strong>CUSTO DIESEL (CALCULADO):</strong> ${formatCurrency(custoDieselEstimado)}</p></div>`;
    } else {
        infoConsumoHTML = `<p style="font-size:0.8rem; color:orange;">DADOS INSUFICIENTES PARA CALCULAR CONSUMO</p>`;
    }

    const custosOperacionais = (op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselEstimado;
    const liquidoOperacional = (op.faturamento || 0) - custosOperacionais;
    const abastecimentoReal = op.combustivel || 0;
    const adiantamento = op.adiantamento || 0;
    const saldoReceber = (op.faturamento || 0) - adiantamento;

    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)}</li>`;
    }).join('') || '<li>NENHUM</li>';

    const html = `
        <div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <p style="font-size:1.1rem; color:var(--primary-color);"><strong>KM RODADO:</strong> ${op.kmRodado || 0} KM</p> <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>TOTAL DE DIÁRIAS (AJUDANTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO NO POSTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>AJUDANTES:</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        </div>
    `;
    openOperationDetails('DETALHES DA OPERAÇÃO', html);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    if (ds.length === 0) {
         tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL LANÇADA.</td></tr>';
         return;
    }
    let rows = '';
    ds.forEach(d => {
        const [y, m, dia] = d.data.split('-');
        const dataFmt = `${dia}/${m}/${y}`;
        const statusPag = d.pago ? '<span style="color:green; font-weight:bold;">PAGO</span>' : '<span style="color:red; font-weight:bold;">PENDENTE</span>';
        const btnPagoIcon = d.pago ? 'fa-times-circle' : 'fa-check-circle';
        const btnPagoTitle = d.pago ? 'MARCAR COMO PENDENTE' : 'MARCAR COMO PAGO';
        const btnPagoClass = d.pago ? 'btn-warning' : 'btn-success';

        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td>${statusPag}</td>
            <td>
                <button class="btn-action ${btnPagoClass}" title="${btnPagoTitle}" onclick="toggleStatusDespesa(${d.id})"><i class="fas ${btnPagoIcon}"></i></button>
                <button class="btn-action edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

window.toggleStatusDespesa = function(id) {
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = !arr[idx].pago; 
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
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
    window.location.hash = '#despesas';
    alert('MODO DE EDIÇÃO: ALTERE DATA, VEÍCULO, DESCRIÇÃO OU VALOR. PARA REPARCELAR, EXCLUA E CRIE NOVAMENTE.');
}

// =============================================================================
// 12. CALENDÁRIO E DASHBOARD
// =============================================================================

function renderCalendar(date) {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthYear = document.getElementById('currentMonthYear');

    if (!calendarGrid || !currentMonthYear) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthYear.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    
    calendarGrid.innerHTML = '';
    ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].forEach(d => calendarGrid.innerHTML += `<div class="day-header">${d}</div>`);

    const firstDay = new Date(year, month, 1).getDay();
    for(let i=0; i<firstDay; i++) calendarGrid.innerHTML += `<div class="day-cell empty"></div>`;

    const lastDate = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);
    
    for(let d=1; d<=lastDate; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const hasOp = ops.some(o => o.data === dateStr);
        calendarGrid.innerHTML += `
            <div class="day-cell ${hasOp ? 'has-operation' : ''}" onclick="showOperationDetails('${dateStr}')">
                ${d} ${hasOp ? '<div class="event-dot"></div>' : ''}
            </div>`;
    }
}

function showOperationDetails(dateStr) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === dateStr);
    if(!ops.length) return;
    
    let html = ops.map(o => `
        <div class="card" style="margin-bottom:10px; border-left: 4px solid var(--primary-color);">
            <p><strong>${getMotorista(o.motoristaId)?.nome || 'N/A'}</strong></p>
            <p>Veículo: ${o.veiculoPlaca} | Faturamento: <strong>${formatCurrency(o.faturamento)}</strong></p>
            <div style="text-align:right; margin-top:5px;">
                <button class="btn-action edit-btn" onclick="editOperacaoItem(${o.id})">EDITAR</button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${o.id})">EXCLUIR</button>
            </div>
        </div>
    `).join('');
    openOperationDetails(`Operações em ${dateStr.split('-').reverse().join('/')}`, html);
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate);
    updateDashboardStats();
}
window.changeMonth = changeMonth;

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const mesAtual = currentDate.getMonth();
    const anoAtual = currentDate.getFullYear();
    
    // Filtra pelo mês do calendário
    const opsMes = ops.filter(op => {
        const [y, m] = op.data.split('-').map(Number);
        return (m-1) === mesAtual && y === anoAtual;
    });
    const despesasMes = despesas.filter(d => {
        const [y, m] = d.data.split('-').map(Number);
        return (m-1) === mesAtual && y === anoAtual;
    });

    const totalFaturamento = opsMes.reduce((s, o) => s + (o.faturamento || 0), 0);
    
    const custoOp = opsMes.reduce((s, o) => {
        const diarias = (o.ajudantes || []).reduce((ss, a) => ss + (Number(a.diaria) || 0), 0);
        const custoDiesel = calcularCustoConsumoViagem(o) || 0;
        return s + (o.comissao || 0) + diarias + custoDiesel + (o.despesas || 0);
    }, 0);
    
    const custoGeral = despesasMes.reduce((s, d) => s + (d.valor || 0), 0);
    const totalCustos = custoOp + custoGeral;
    const receitaLiquida = totalFaturamento - totalCustos;

    document.getElementById('faturamentoMes').textContent = formatCurrency(totalFaturamento);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    document.getElementById('receitaMes').textContent = formatCurrency(receitaLiquida);
}

// =============================================================================
// 13. GRÁFICOS
// =============================================================================

let chartInstance = null;

function renderCharts() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const labels = [];
    const dataCombustivel = [];
    const dataOutrasDespesas = [];
    const dataLucro = [];
    const dataKm = [];

    let totalReceitaHistorica = 0;
    ops.forEach(o => totalReceitaHistorica += (o.faturamento || 0));
    document.getElementById('receitaTotalHistorico').textContent = formatCurrency(totalReceitaHistorica);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

        const opsMes = ops.filter(op => {
            const [yo, mo] = op.data.split('-').map(Number);
            return (mo - 1) === m && yo === y;
        });
        const despMes = despesas.filter(dp => {
            const [yd, md] = dp.data.split('-').map(Number);
            return (md - 1) === m && yd === y;
        });

        let sumCombustivel = 0, sumOutros = 0, sumFat = 0, sumKm = 0;
        
        opsMes.forEach(op => {
            sumFat += (op.faturamento || 0);
            sumCombustivel += (calcularCustoConsumoViagem(op) || 0);
            sumKm += (Number(op.kmRodado) || 0);
            const diarias = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria) || 0), 0);
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });
        
        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;
        
        dataCombustivel.push(sumCombustivel);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(sumFat - (sumCombustivel + sumOutros));
        dataKm.push(sumKm);
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'DIESEL', data: dataCombustivel, backgroundColor: '#d32f2f', stack: '0' },
                { label: 'OUTROS CUSTOS', data: dataOutrasDespesas, backgroundColor: '#f57c00', stack: '0' },
                { label: 'LUCRO', data: dataLucro, backgroundColor: '#388e3c', stack: '0' },
                { label: 'KM', data: dataKm, type: 'line', borderColor: '#263238', borderWidth: 3, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

// =============================================================================
// 14. SISTEMA DE LEMBRETES & RESET
// =============================================================================

function checkAndShowReminders() {
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const hoje = new Date().toISOString().split('T')[0];
    const pendentes = despesas.filter(d => !d.pago && d.data <= hoje).sort((a,b) => new Date(a.data) - new Date(b.data));
    if (pendentes.length > 0) openReminderModal(pendentes);
}

function openReminderModal(pendentes) {
    const modal = document.getElementById('reminderModal');
    const lista = document.getElementById('reminderList');
    if(!lista || !modal) return;
    
    let html = '';
    pendentes.forEach(d => {
        const [y, m, dia] = d.data.split('-');
        html += `
            <div class="reminder-item">
                <div class="reminder-info">
                    <strong>VENCEU: ${dia}/${m}/${y}</strong>
                    <p>${d.descricao} - ${formatCurrency(d.valor)}</p>
                </div>
                <div class="reminder-actions">
                    <button class="btn-success btn-mini" onclick="payExpense(${d.id})">PAGAR</button>
                    <button class="btn-warning btn-mini" onclick="postponeExpense(${d.id})">ADIAR</button>
                </div>
            </div>
        `;
    });
    lista.innerHTML = html;
    modal.style.display = 'block';
}

function closeReminderModal() {
    document.getElementById('reminderModal').style.display = 'none';
}
window.closeReminderModal = closeReminderModal;

// Ações do Modal de Lembrete
window.payExpense = function(id) {
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = true;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        const el = event.target.closest('.reminder-item');
        if (el) el.remove();
        if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
        // Atualiza a tabela para refletir o pagamento
        renderDespesasTable();
    }
};

window.postponeExpense = function(id) {
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        const atual = new Date(arr[idx].data + 'T00:00:00');
        atual.setDate(atual.getDate() + 1); // Adia 1 dia
        const y = atual.getFullYear();
        const m = String(atual.getMonth() + 1).padStart(2, '0');
        const dStr = String(atual.getDate()).padStart(2, '0');
        
        arr[idx].data = `${y}-${m}-${dStr}`;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        alert(`REAGENDADO PARA ${atual.toLocaleDateString('pt-BR')}`);
        
        const el = event.target.closest('.reminder-item');
        if (el) el.remove();
        if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
        
        renderDespesasTable();
    }
};

window.cancelExpense = function(id) {
    if(!confirm("TEM CERTEZA QUE DESEJA EXCLUIR ESTA DÍVIDA?")) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    arr = arr.filter(d => d.id !== id);
    saveData(DB_KEYS.DESPESAS_GERAIS, arr);
    
    const el = event.target.closest('.reminder-item');
    if (el) el.remove();
    if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
    
    renderDespesasTable();
};

function fullSystemReset() {
    if (confirm("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DA NUVEM PARA SEMPRE (DE TODOS OS DISPOSITIVOS).\n\nTEM CERTEZA ABSOLUTA?")) {
        // Para um reset real, teríamos que deletar documentos do Firebase.
        // Como simplificação, salvaremos arrays vazios em cima dos dados existentes.
        Object.values(DB_KEYS).forEach(k => {
            saveData(k, k === DB_KEYS.MINHA_EMPRESA ? {} : []);
        });
        alert("SISTEMA RESETADO. AGUARDE A SINCRONIZAÇÃO.");
    }
}
window.fullSystemReset = fullSystemReset;

// =============================================================================
// 15. INICIALIZAÇÃO E SINCRONIZAÇÃO (REALTIME)
// =============================================================================

// Esta função conecta o site ao Firebase e fica "escutando" mudanças.
function setupRealtimeListeners() {
    if (!window.dbRef) {
        console.error("Firebase ainda não carregou. Tentando novamente em 500ms...");
        setTimeout(setupRealtimeListeners, 500);
        return;
    }

    const { db, doc, onSnapshot } = window.dbRef;
    const keys = Object.values(DB_KEYS);

    console.log("Iniciando ouvintes do Firebase...");

    keys.forEach(key => {
        // Escuta mudanças no documento 'full_list' de cada coleção em tempo real
        onSnapshot(doc(db, key, "full_list"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Atualiza o cache local com os dados vindos da nuvem
                APP_CACHE[key] = data.items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                console.log(`Dados recebidos do Firebase: ${key}`);
            } else {
                console.log(`Criando estrutura inicial na nuvem para: ${key}`);
                // Se não existir, inicializa no banco (como o antigo 'Mock')
                saveData(key, key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            }
            
            // ATUALIZA TODA A TELA APÓS RECEBER DADOS NOVOS
            updateUI();
        }, (error) => {
            console.error(`Erro ao ouvir ${key}:`, error);
        });
    });
}

// Variável para controlar o "Debounce" (evita atualizações excessivas)
let _updateTimer = null;

function updateUI() {
    // Se já existe um agendamento, cancela o anterior
    if (_updateTimer) clearTimeout(_updateTimer);
    
    // Agenda uma nova atualização para daqui a 200ms
    _updateTimer = setTimeout(() => {
        console.log("Executando atualização da interface (Debounced)...");
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        updateDashboardStats();
        renderCharts();
        checkAndShowReminders();
        renderMinhaEmpresaInfo();
        
        // Garante que o calendário seja redesenhado com os dados atuais
        if (typeof renderCalendar === 'function') {
            renderCalendar(currentDate);
        }
    }, 200); // 200ms de espera
}

function setupInputFormattingListeners() {
    const inputs = ['minhaEmpresaCNPJ', 'contratanteCNPJ'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value));
    });
    const phones = ['minhaEmpresaTelefone', 'contratanteTelefone', 'motoristaTelefone', 'ajudanteTelefone'];
    phones.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', e => e.target.value = formatPhoneBr(e.target.value));
    });

    const motoristaPix = document.getElementById('motoristaPix');
    if (motoristaPix) {
        motoristaPix.addEventListener('input', () => document.getElementById('motoristaPixTipo').textContent = 'TIPO: ' + detectPixType(motoristaPix.value));
        document.getElementById('btnMotoristaPixCopy').addEventListener('click', () => copyToClipboard(motoristaPix.value));
    }
    const ajudantePix = document.getElementById('ajudantePix');
    if (ajudantePix) {
        ajudantePix.addEventListener('input', () => document.getElementById('ajudantePixTipo').textContent = 'TIPO: ' + detectPixType(ajudantePix.value));
        document.getElementById('btnAjudantePixCopy').addEventListener('click', () => copyToClipboard(ajudantePix.value));
    }

    const selAjud = document.getElementById('selectAjudantesOperacao');
    if (selAjud) selAjud.addEventListener('change', handleAjudanteSelectionChange);
    const selCurso = document.getElementById('motoristaTemCurso');
    if (selCurso) selCurso.addEventListener('change', toggleCursoInput);
}

// =============================================================================
// 16. RECIBOS
// =============================================================================

function parseCompositeId(value) {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length !== 2) return null;
    return {
        type: parts[0],
        id: parts[1]
    };
}

function getPersonByComposite(value) {
    const p = parseCompositeId(value);
    if (!p) return null;
    if (p.type === 'motorista') return getMotorista(p.id);
    if (p.type === 'ajudante') return getAjudante(p.id);
    return null;
}

function setupReciboListeners() {
    const btnGerar = document.getElementById('btnGerarRecibo');
    const btnBaixar = document.getElementById('btnBaixarRecibo');
    const btnZapRecibo = document.getElementById('btnWhatsappRecibo');

    if (!btnGerar) return;
    btnGerar.addEventListener('click', () => {
        const comp = document.getElementById('selectMotoristaRecibo').value;
        const inicio = document.getElementById('dataInicioRecibo').value;
        const fim = document.getElementById('dataFimRecibo').value;
        if (!comp) return alert('SELECIONE UM MOTORISTA OU AJUDANTE.');
        if (!inicio || !fim) return alert('PREENCHA AS DATAS.');

        const parsed = parseCompositeId(comp);
        const person = getPersonByComposite(comp);
        const empresa = getMinhaEmpresa();
        const veiculoRecibo = document.getElementById('selectVeiculoRecibo').value;
        const contratanteRecibo = document.getElementById('selectContratanteRecibo').value;
        const ops = loadData(DB_KEYS.OPERACOES);
        const di = new Date(inicio + 'T00:00:00');
        const df = new Date(fim + 'T23:59:59');

        const filtered = ops.filter(op => {
            const d = new Date(op.data + 'T00:00:00');
            if (d < di || d > df) return false;
            let match = false;
            if (parsed.type === 'motorista') match = String(op.motoristaId) === String(parsed.id);
            if (parsed.type === 'ajudante') match = Array.isArray(op.ajudantes) && op.ajudantes.some(a => String(a.id) === String(parsed.id));
            if (!match) return false;
            if (veiculoRecibo && op.veiculoPlaca !== veiculoRecibo) return false;
            if (contratanteRecibo && op.contratanteCNPJ !== contratanteRecibo) return false;
            return true;
        }).sort((a, b) => new Date(a.data) - new Date(b.data));

        if (!filtered.length) {
            document.getElementById('reciboContent').innerHTML = `<p style="text-align:center;color:var(--danger-color)">NENHUMA OPERAÇÃO ENCONTRADA PARA ESTE PERÍODO/PESSOA.</p>`;
            document.getElementById('reciboTitle').style.display = 'none';
            btnBaixar.style.display = 'none';
            if (btnZapRecibo) btnZapRecibo.style.display = 'none';
            return;
        }

        let totalValorRecibo = 0;
        const linhas = filtered.map(op => {
            const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const contrat = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
            let valorLinha = 0;
            if (parsed.type === 'motorista') valorLinha = op.comissao || 0;
            else if (parsed.type === 'ajudante') {
                const ajudanteData = (op.ajudantes || []).find(a => String(a.id) === String(parsed.id));
                valorLinha = ajudanteData ? (Number(ajudanteData.diaria) || 0) : 0;
            }
            totalValorRecibo += valorLinha;
            return `<tr><td>${dataFmt}</td><td>${op.veiculoPlaca}</td><td>${contrat}</td><td style="text-align:right;">${formatCurrency(valorLinha)}</td></tr>`;
        }).join('');

        const totalExtenso = new ConverterMoeda(totalValorRecibo).getExtenso().toUpperCase();
        const pessoaNome = person ? (person.nome || person.razaoSocial || 'RECEBEDOR') : 'RECEBEDOR';
        const inicioFmt = new Date(inicio + 'T00:00:00').toLocaleDateString('pt-BR');
        const fimFmt = new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR');

        if (btnZapRecibo) {
            const msgRecibo = `OLÁ, SEGUE COMPROVANTE DE RECIBO DE PAGAMENTO.\nBENEFICIÁRIO: ${pessoaNome}\nPERÍODO: ${inicioFmt} A ${fimFmt}\nVALOR TOTAL: *${formatCurrency(totalValorRecibo)}*`;
            btnZapRecibo.href = `https://wa.me/?text=${encodeURIComponent(msgRecibo)}`;
            btnZapRecibo.style.display = 'inline-flex';
        }

        const html = `
            <div class="recibo-template">
                <div class="recibo-header"><h3>RECIBO DE PAGAMENTO</h3><p style="font-size:0.9rem;color:var(--secondary-color)">DOCUMENTO NÃO FISCAL</p></div>
                <p>RECEBEMOS DE: <strong>${empresa.razaoSocial || 'EMPRESA'}</strong>${empresa.cnpj ? ` (CNPJ: ${formatCPF_CNPJ(empresa.cnpj)})` : ''}</p>
                <div style="border:1px dashed #ccc;padding:10px;margin:10px 0;">
                    <p><strong>${pessoaNome}</strong> (${parsed.type.toUpperCase()})</p>
                    <p>PERÍODO: ${inicioFmt} A ${fimFmt}</p>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr><th style="text-align:left">DATA</th><th style="text-align:left">VEÍCULO</th><th style="text-align:left">CONTRATANTE</th><th style="text-align:right">VALOR</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
                <p class="recibo-total">TOTAL: ${formatCurrency(totalValorRecibo)} (${totalExtenso})</p>
                <div style="margin: 20px 0; font-size: 0.85rem; text-align: justify; line-height: 1.4;">
                    <p>DECLARO TER RECEBIDO A IMPORTÂNCIA SUPRAMENCIONADA, DANDO PLENA, RASA E GERAL QUITAÇÃO PELOS SERVIÇOS PRESTADOS NO PERÍODO INDICADO.</p>
                    <p style="margin-top:8px;">
                        <strong>FUNDAMENTAÇÃO LEGAL:</strong> DECLARAMOS QUE A PRESTAÇÃO DESTES SERVIÇOS OCORREU DE FORMA AUTÔNOMA E EVENTUAL, SEM SUBORDINAÇÃO JURÍDICA, NÃO CONFIGURANDO VÍNCULO EMPREGATÍCIO.
                        ESTA RELAÇÃO REGE-SE PELO <strong>CÓDIGO CIVIL BRASILEIRO (ARTS. 593 A 609)</strong> E, NO CASO DE TRANSPORTE DE CARGAS, PELA <strong>LEI Nº 11.442/2007 (TRANSPORTADOR AUTÔNOMO DE CARGAS)</strong>.
                    </p>
                </div>
                <div class="recibo-assinaturas" style="display:flex;gap:20px;margin-top:20px;">
                    <div><p>_____________________________________</p><p>${pessoaNome}</p><p>RECEBEDOR</p></div>
                    <div><p>_____________________________________</p><p>${empresa.razaoSocial || 'EMPRESA'}</p><p>${empresa.cnpj ? formatCPF_CNPJ(empresa.cnpj) : ''}</p><p>PAGADOR</p></div>
                </div>
            </div>
        `;
        document.getElementById('reciboContent').innerHTML = html;
        document.getElementById('reciboTitle').style.display = 'block';
        btnBaixar.style.display = 'inline-flex';
        btnBaixar.onclick = function() {
            const element = document.getElementById('reciboContent').querySelector('.recibo-template');
            const nomeArq = `RECIBO_${pessoaNome.split(' ')[0]}_${inicio}.pdf`;
            if (typeof html2pdf !== 'undefined') {
                html2pdf().from(element).set({
                    margin: 10,
                    filename: nomeArq,
                    image: {
                        type: 'jpeg',
                        quality: 0.98
                    },
                    html2canvas: {
                        scale: 2,
                        scrollY: 0
                    },
                    jsPDF: {
                        unit: 'mm',
                        format: 'a4',
                        orientation: 'portrait'
                    }
                }).save();
            } else alert('LIB HTML2PDF NÃO ENCONTRADA PARA GERAR PDF. INSTALE A LIB OU BAIXE MANUALMENTE.');
        };
    });
}

// =============================================================================
// 17. BACKUP E IMPORTAÇÃO (CORRIGIDO PARA NUVEM)
// =============================================================================

function exportDataBackup() {
    const data = {};
    Object.values(DB_KEYS).forEach(k => data[k] = loadData(k));
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `backup_logimaster.json`;
    a.click();
}

// Importa e salva na nuvem
function importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            let promises = [];
            for (const key of Object.keys(data)) {
                if (Object.values(DB_KEYS).includes(key)) {
                    // Força o salvamento na nuvem
                    promises.push(saveData(key, data[key]));
                }
            }
            await Promise.all(promises);
            alert('Backup restaurado na nuvem com sucesso! Atualizando tela...');
            updateUI();
        } catch (err) {
            alert('Erro ao processar backup: ' + err);
        }
    };
    reader.readAsText(file);
}

// =============================================================================
// 18. GESTÃO DE RELATÓRIOS (PDF) E OUTROS
// =============================================================================

function gerarRelatorio(e) {
    e.preventDefault();
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    if (!iniVal || !fimVal) return alert('SELECIONE AS DATAS.');

    const ini = new Date(iniVal + 'T00:00:00');
    const fim = new Date(fimVal + 'T23:59:59');
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const vecPlaca = document.getElementById('selectVeiculoRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        const d = new Date(op.data + 'T00:00:00');
        if (d < ini || d > fim) return false;
        if (motId && String(op.motoristaId) !== motId) return false;
        if (vecPlaca && op.veiculoPlaca !== vecPlaca) return false;
        if (conCnpj && op.contratanteCNPJ !== conCnpj) return false;
        return true;
    });

    const despesasGerais = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => {
        const dt = new Date(d.data + 'T00:00:00');
        if (dt < ini || dt > fim) return false;
        if (vecPlaca && d.veiculoPlaca !== vecPlaca) return false;
        return true;
    });

    let receitaTotal = 0;
    let custoMotoristas = 0;
    let custoAjudantes = 0;
    let custoPedagios = 0;
    let custoDieselEstimadoTotal = 0;
    let kmTotalNoPeriodo = 0;
    ops.forEach(op => {
        receitaTotal += (op.faturamento || 0);
        custoMotoristas += (op.comissao || 0);
        custoPedagios += (op.despesas || 0);
        kmTotalNoPeriodo += (Number(op.kmRodado) || 0);
        if (op.ajudantes) op.ajudantes.forEach(a => custoAjudantes += (Number(a.diaria) || 0));
        custoDieselEstimadoTotal += (calcularCustoConsumoViagem(op) || 0);
    });
    let custoGeral = despesasGerais.reduce((acc, d) => acc + (d.valor || 0), 0);
    const gastosTotais = custoMotoristas + custoAjudantes + custoDieselEstimadoTotal + custoPedagios + custoGeral;
    const lucroLiquido = receitaTotal - gastosTotais;

    const textoWhatsapp = `*RELATÓRIO LOGIMASTER*\nPERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}\n\n*FINANCEIRO:*\nRECEITA: ${formatCurrency(receitaTotal)}\nGASTOS: ${formatCurrency(gastosTotais)}\n*LUCRO LÍQUIDO: ${formatCurrency(lucroLiquido)}*\n\n*DETALHES:*\nCOMBUSTÍVEL (ESTIMADO): ${formatCurrency(custoDieselEstimadoTotal)}\nMOTORISTAS/AJUDANTES: ${formatCurrency(custoMotoristas + custoAjudantes)}\nOUTROS: ${formatCurrency(custoPedagios + custoGeral)}\n\nKM TOTAL: ${kmTotalNoPeriodo.toFixed(1)} KM`;
    const btnZap = document.getElementById('btnWhatsappReport');
    if (btnZap) {
        btnZap.href = `https://wa.me/?text=${encodeURIComponent(textoWhatsapp)}`;
        btnZap.style.display = 'inline-flex';
    }

    const html = `
        <div class="report-container">
            <div style="text-align:center; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:10px;">
                <h3>RELATÓRIO GERENCIAL LOGIMASTER</h3>
                <p>PERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}</p>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
                <div style="background:#e8f5e9; padding:15px; border-radius:8px; border:1px solid #c8e6c9;">
                    <h4>RECEITA TOTAL</h4>
                    <h2 style="color:var(--success-color);">${formatCurrency(receitaTotal)}</h2>
                </div>
                <div style="background:#ffebee; padding:15px; border-radius:8px; border:1px solid #ffcdd2;">
                    <h4>GASTOS TOTAIS (OPERACIONAIS)</h4>
                    <h2 style="color:var(--danger-color);">${formatCurrency(gastosTotais)}</h2>
                </div>
            </div>
            <h4 style="border-left:4px solid var(--primary-color); padding-left:10px; margin-bottom:10px; background:#f0f0f0; padding:5px;">DETALHAMENTO DE GASTOS</h4>
            <table class="report-table" style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:20px;">
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">COMBUSTÍVEL (CUSTO OPERACIONAL ESTIMADO)</td><td style="text-align:right; color:var(--danger-color); font-weight:bold;">${formatCurrency(custoDieselEstimadoTotal)}</td></tr>
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">PAGAMENTO MOTORISTAS (COMISSÕES)</td><td style="text-align:right; color:var(--danger-color);">${formatCurrency(custoMotoristas)}</td></tr>
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">PAGAMENTO AJUDANTES (DIÁRIAS)</td><td style="text-align:right; color:var(--danger-color);">${formatCurrency(custoAjudantes)}</td></tr>
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">PEDÁGIOS</td><td style="text-align:right; color:var(--danger-color);">${formatCurrency(custoPedagios)}</td></tr>
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">DESPESAS GERAIS/ADMINISTRATIVAS</td><td style="text-align:right; color:var(--danger-color);">${formatCurrency(custoGeral)}</td></tr>
            </table>
            <div style="margin-top:20px; padding:15px; background:#e0f7fa; border-radius:8px; text-align:center; border:1px solid #b2ebf2;">
                <h3>RESULTADO LÍQUIDO: <span style="color:${lucroLiquido>=0?'green':'red'}">${formatCurrency(lucroLiquido)}</span></h3>
            </div>
            <div style="margin-top:30px; font-size:0.7rem; text-align:center; color:#aaa;">GERADO POR LOGIMASTER EM ${new Date().toLocaleString()}</div>
        </div>
    `;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

function exportReportToPDF() {
    const element = document.getElementById('reportResults');
    if (!element || element.style.display === 'none') return alert('GERE UM RELATÓRIO PRIMEIRO.');
    html2pdf().set({
        margin: 10,
        filename: 'RELATORIO_LOGIMASTER.pdf',
        image: {
            type: 'jpeg',
            quality: 0.98
        },
        html2canvas: {
            scale: 2,
            scrollY: 0
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        }
    }).from(element).save();
}
window.exportReportToPDF = exportReportToPDF;

// --- RELATÓRIO DE COBRANÇA (Com Adiantamento) ---
function gerarRelatorioCobranca() {
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    const conCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!iniVal || !fimVal) return alert('SELECIONE AS DATAS.');
    if (!conCnpj) return alert('SELECIONE UMA CONTRATANTE PARA GERAR O RELATÓRIO DE COBRANÇA.');

    const ini = new Date(iniVal + 'T00:00:00');
    const fim = new Date(fimVal + 'T23:59:59');
    const contratante = getContratante(conCnpj);
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => {
        const d = new Date(op.data + 'T00:00:00');
        return d >= ini && d <= fim && op.contratanteCNPJ === conCnpj;
    }).sort((a, b) => new Date(a.data) - new Date(b.data));

    if (ops.length === 0) return alert('NENHUMA OPERAÇÃO ENCONTRADA PARA ESTE CLIENTE NO PERÍODO.');

    let totalSaldo = 0; // Total a Pagar (Saldo)
    let rows = '';
    ops.forEach(op => {
        const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const vec = op.veiculoPlaca;
        const ativ = getAtividade(op.atividadeId)?.nome || '-';
        const adiant = op.adiantamento || 0;
        const saldo = (op.faturamento || 0) - adiant;

        totalSaldo += saldo;

        rows += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;">${d}</td>
                <td style="padding:8px;">${vec}</td>
                <td style="padding:8px;">${ativ}</td>
                <td style="padding:8px; text-align:right;">${formatCurrency(op.faturamento)}</td>
                <td style="padding:8px; text-align:right; color: var(--danger-color);">${formatCurrency(adiant)}</td>
                <td style="padding:8px; text-align:right; font-weight:bold;">${formatCurrency(saldo)}</td>
            </tr>
        `;
    });
    const empresa = getMinhaEmpresa();
    const nomeEmpresa = empresa.razaoSocial || 'MINHA EMPRESA';
    const cnpjEmpresa = empresa.cnpj ? formatCPF_CNPJ(empresa.cnpj) : '';

    const textoZap = `*RELATÓRIO DE COBRANÇA - ${nomeEmpresa}*\nCLIENTE: ${contratante.razaoSocial}\nPERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}\n\nTOTAL LÍQUIDO A PAGAR: *${formatCurrency(totalSaldo)}*`;
    const btnZap = document.getElementById('btnWhatsappReport');
    if (btnZap) {
        btnZap.href = `https://wa.me/?text=${encodeURIComponent(textoZap)}`;
        btnZap.style.display = 'inline-flex';
    }

    const html = `
        <div class="report-container" style="max-width:800px; padding:40px;">
            <div style="text-align:center; margin-bottom:30px; border-bottom:2px solid var(--primary-color); padding-bottom:20px;">
                <h2 style="color:var(--primary-color); margin-bottom:5px;">RELATÓRIO DE COBRANÇA</h2>
                <p style="font-size:1.1rem; font-weight:bold;">${nomeEmpresa}</p>
                <p style="font-size:0.9rem;">${cnpjEmpresa}</p>
            </div>
            <div style="margin-bottom:30px; background:#f9f9f9; padding:15px; border-radius:8px;">
                <p><strong>CLIENTE:</strong> ${contratante.razaoSocial}</p>
                <p><strong>CNPJ:</strong> ${formatCPF_CNPJ(contratante.cnpj)}</p>
                <p><strong>PERÍODO:</strong> ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                <thead style="background:#eee;">
                    <tr>
                        <th style="padding:10px; text-align:left;">DATA</th>
                        <th style="padding:10px; text-align:left;">VEÍCULO</th>
                        <th style="padding:10px; text-align:left;">ATIVIDADE</th>
                        <th style="padding:10px; text-align:right;">TOTAL</th>
                        <th style="padding:10px; text-align:right;">ADIANT.</th>
                        <th style="padding:10px; text-align:right;">SALDO</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#e0f2f1; font-weight:bold;">
                        <td colspan="5" style="padding:10px; text-align:right;">TOTAL A PAGAR:</td>
                        <td style="padding:10px; text-align:right; font-size:1.2rem; color:var(--primary-color);">${formatCurrency(totalSaldo)}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="margin-top:40px; text-align:center; font-size:0.9rem; color:#777;"><p>DOCUMENTO PARA FINS DE CONFERÊNCIA E COBRANÇA.</p><p>DATA DE EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}</p></div>
        </div>
    `;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    // Configuração de Tabs e Navegação
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            const el = document.getElementById(tab);
            if (el) el.classList.add('active');
        });
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const page = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const el = document.getElementById(page);
            if (el) el.classList.add('active');
            if (page === 'graficos') renderCharts();
        });
    });

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Inicialização dos módulos
    setupFormHandlers();
    setupInputFormattingListeners();
    setupReciboListeners();
    
    // Inicia a conexão Realtime com Firebase
    // Pequeno delay para garantir que o script do Firebase no HTML carregou antes
    setTimeout(setupRealtimeListeners, 1000);
});

// Fechar modais ao clicar fora
window.addEventListener('click', function(event) {
    const viewModal = document.getElementById('viewItemModal');
    const opModal = document.getElementById('operationDetailsModal');
    const addAjModal = document.getElementById('modalAdicionarAjudante');
    if (event.target === viewModal) viewModal.style.display = 'none';
    if (event.target === opModal) opModal.style.display = 'none';
    if (event.target === addAjModal) addAjModal.style.display = 'none';
});

// GLOBALS EXPORT (Necessário para onclick no HTML funcionar)
window.viewCadastro = viewCadastro;
window.editCadastroItem = editCadastroItem;
window.deleteItem = deleteItem;
window.renderOperacaoTable = renderOperacaoTable;
window.renderDespesasTable = renderDespesasTable;
window.exportDataBackup = exportDataBackup;
window.importDataBackup = importDataBackup;
window.viewOperacaoDetails = viewOperacaoDetails;
window.renderCharts = renderCharts;
window.gerarRelatorioCobranca = gerarRelatorioCobranca;
window.exportReportToPDF = exportReportToPDF;
window.closeAdicionarAjudanteModal = closeAdicionarAjudanteModal;
window.closeReminderModal = closeReminderModal;
window.closeViewModal = closeViewModal;
window.closeModal = closeModal;

// --- FUNÇÃO DE EDIÇÃO ATUALIZADA (Carrega Adiantamento) ---
window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    document.getElementById('operacaoData').value = op.data || '';
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId || '';
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca || '';
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ || '';
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    document.getElementById('operacaoFaturamento').value = op.faturamento || '';
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || '';
    document.getElementById('operacaoComissao').value = op.comissao || '';
    document.getElementById('operacaoCombustivel').value = op.combustivel || '';
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || '';
    document.getElementById('operacaoDespesas').value = op.despesas || '';
    document.getElementById('operacaoKmRodado').value = op.kmRodado || '';
    window._operacaoAjudantesTempList = (op.ajudantes || []).map(a => ({
        id: a.id,
        diaria: Number(a.diaria) || 0
    }));
    renderAjudantesAdicionadosList();
    document.getElementById('operacaoId').value = op.id;
    alert('DADOS DA OPERAÇÃO CARREGADOS NO FORMULÁRIO. ALTERE E SALVE PARA ATUALIZAR.');
};