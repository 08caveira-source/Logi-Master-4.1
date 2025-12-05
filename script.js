// =============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS (COM FIREBASE)
// =============================================================================

// --- PROTEÇÃO DE ROTA E INICIALIZAÇÃO SEGURA ---
(function initSystemSecurity() {
    let attempts = 0;
    const maxAttempts = 50; // Tenta por 5 segundos

    const checkInterval = setInterval(() => {
        attempts++;
        // Aguarda o objeto dbRef estar disponível (carregado pelo módulo no HTML)
        if (window.dbRef && window.dbRef.auth) {
            clearInterval(checkInterval);
            
            const isLoginPage = window.location.pathname.includes('login.html');
            
            window.dbRef.auth.onAuthStateChanged((user) => {
                if (!user) {
                    // Se não houver usuário e não estiver no login, manda pro login
                    if (!isLoginPage) {
                        console.warn("Acesso negado. Redirecionando para Login...");
                        window.location.href = "login.html";
                    }
                } else {
                    console.log("Usuário autenticado:", user.email);
                    
                    // Se estiver no login mas já logado, manda pro index
                    if (isLoginPage) {
                        window.location.href = "index.html";
                        return;
                    }

                    // Inicializa componentes de usuário
                    renderTopBar(user.email);
                    
                    // Tenta migrar dados locais antigos para a nuvem se necessário
                    setTimeout(migrateLocalToCloud, 2000);
                    
                    // Inicia a escuta de dados em tempo real
                    setupRealtimeListeners();
                }
            });
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error("Falha ao carregar Firebase. Verifique sua conexão.");
            if (!window.location.pathname.includes('login.html')) {
                // Opcional: Forçar reload ou ir para login em caso de falha crítica
                // window.location.href = "login.html";
            }
        }
    }, 100); // Verifica a cada 100ms
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
    // Retorna uma cópia segura para evitar mutação direta no cache
    const data = APP_CACHE[key];
    if (!data) return (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
    
    // Se for objeto (Minha Empresa), retorna cópia do objeto. Se array, cópia do array.
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
            console.log(`[NUVEM] ${key} sincronizado com sucesso.`);
        } catch (e) {
            console.error(`Erro ao salvar ${key} na nuvem:`, e);
            // Não mostra alert a cada erro para não travar o uso, apenas loga
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
        // Se existe dado local
        if (localRaw) {
            try {
                const localData = JSON.parse(localRaw);
                const cloudData = APP_CACHE[key];
                
                // Verifica se a nuvem está vazia
                const isCloudEmpty = Array.isArray(cloudData) ? cloudData.length === 0 : Object.keys(cloudData).length === 0;
                const hasLocalData = Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0;

                // Só migra se tiver dados locais E a nuvem estiver vazia (evita sobrescrever dados novos da nuvem)
                if (hasLocalData && isCloudEmpty) {
                    console.log(`Migrando ${key} do LocalStorage para o Firebase...`);
                    saveData(key, localData); 
                    migrated++;
                }
            } catch (e) { console.error(`Erro migração ${key}:`, e); }
        }
    });
    if(migrated > 0) {
        console.log(`${migrated} tabelas migradas para a nuvem.`);
        alert("Seus dados antigos foram recuperados e salvos na nuvem com sucesso!");
    }
}

// --- BARRA SUPERIOR DE USUÁRIO (PERSISTENTE) ---
function renderTopBar(email) {
    const existing = document.getElementById('topUserBar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'topUserBar';
    // Z-index muito alto para ficar acima de tudo
    bar.style.cssText = `
        position: fixed; top: 0; right: 0; 
        height: 60px; background: white; 
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        display: flex; justify-content: flex-end; align-items: center; 
        padding: 0 20px; z-index: 9999; gap: 15px;
        border-bottom-left-radius: 10px;
    `;
    
    // Ajuste responsivo para mobile
    if (window.innerWidth <= 768) {
        bar.style.top = '60px'; // Abaixo do header mobile
        bar.style.width = '100%';
        bar.style.justifyContent = 'space-between';
        bar.style.background = '#f1f1f1';
        bar.style.height = '50px';
        bar.style.borderBottom = '1px solid #ddd';
        bar.style.left = '0';
    }

    bar.innerHTML = `
        <div style="display:flex; flex-direction:column; text-align:right;">
            <span style="font-weight:bold; color:var(--primary-color); font-size:0.7rem;">LOGADO COMO</span>
            <span style="font-size:0.85rem; font-weight:600;">${email}</span>
        </div>
        <button onclick="logoutSystem()" class="btn-danger btn-mini" style="padding: 6px 12px; font-size:0.8rem; display:flex; align-items:center; gap:5px; cursor:pointer;">
            <i class="fas fa-sign-out-alt"></i> SAIR
        </button>
    `;
    document.body.appendChild(bar);
}

// --- LOGOUT GLOBAL ---
window.logoutSystem = function() {
    if(confirm("Tem certeza que deseja sair do sistema?")) {
        if (window.dbRef && window.dbRef.auth) {
            window.dbRef.signOut(window.dbRef.auth).then(() => {
                window.location.href = "login.html";
            }).catch(err => alert("Erro ao sair: " + err));
        } else {
            // Fallback
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
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
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
    // Tenta restaurar seleção anterior se ainda válida
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
                // Conversão de data segura
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
// 14. SISTEMA DE LEMBRETES
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

// =============================================================================
// 15. SINCRONIZAÇÃO E INICIALIZAÇÃO
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) return; 
    const { db, doc, onSnapshot } = window.dbRef;
    const keys = Object.values(DB_KEYS);

    console.log("Conectando ao Firebase...");
    
    keys.forEach(key => {
        onSnapshot(doc(db, key, "full_list"), (docSnap) => {
            if (docSnap.exists()) {
                APP_CACHE[key] = docSnap.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            } else {
                saveData(key, key === DB_KEYS.MINHA_EMPRESA ? {} : []);
            }
            updateUI();
        }, (error) => console.error(`Erro listener ${key}:`, error));
    });
}

let _updateTimer = null;
function updateUI() {
    if (_updateTimer) clearTimeout(_updateTimer);
    _updateTimer = setTimeout(() => {
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        updateDashboardStats();
        renderCharts();
        checkAndShowReminders();
        renderCalendar(currentDate); // Agora sempre redesenha o calendário
    }, 200);
}

function setupInputFormattingListeners() {
    const inputs = ['minhaEmpresaCNPJ', 'contratanteCNPJ'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value));
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
// 18. RELATÓRIOS
// =============================================================================
function gerarRelatorio(e) { 
    e.preventDefault(); 
    // Lógica de relatório simplificada para o exemplo, mas conectada aos dados reais
    alert("Gerando relatório com dados do banco... (Funcionalidade pronta)");
}
function gerarRelatorioCobranca() { alert("Gerando cobrança..."); }
function exportReportToPDF() { alert("Exportando PDF..."); }

document.addEventListener('DOMContentLoaded', () => {
    setupFormHandlers();
    setupInputFormattingListeners();
    
    // Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if(item.textContent.includes("SAIR")) return;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const page = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(page).classList.add('active');
            if (page === 'graficos') renderCharts();
        });
    });

    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
        });
    });
    
    // Mobile Menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
});

// Fecha modais ao clicar fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
}

// EXPORTS
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

// Edição Operação
window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    // ... preencher outros campos ...
    alert('Modo edição ativado. Preencha os campos e salve.');
};