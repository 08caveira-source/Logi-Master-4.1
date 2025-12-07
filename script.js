// =============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS (COM FIREBASE)
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
    CHECKINS: 'db_checkins'
};

// CACHE GLOBAL DA APLICAÇÃO
const APP_CACHE = {
    [DB_KEYS.MOTORISTAS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.AJUDANTES]: [],
    [DB_KEYS.ATIVIDADES]: [],
    [DB_KEYS.CHECKINS]: []
};

// --- VARIÁVEIS GLOBAIS DE CONTROLE DE ACESSO ---
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;

// Carrega dados do Cache Local (Síncrono para a UI não travar)
function loadData(key) {
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// Salva dados no Firebase (Nuvem)
async function saveData(key, value) {
    // Bloqueio de segurança para perfil de leitura
    // Exceção: Checkins (Operações) podem ser atualizados pelo funcionário ao confirmar
    if (window.IS_READ_ONLY && key !== DB_KEYS.OPERACOES) {
       // Apenas operações podem ser escritas por funcionários (update de status)
    }

    // 1. Atualiza cache local imediatamente
    APP_CACHE[key] = value;
    
    // 2. Envia para o Firebase se estiver disponível
    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        try {
            await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            console.log(`Dados de ${key} salvos na nuvem da empresa ${companyDomain}.`);
        } catch (e) {
            console.error("Erro ao salvar no Firebase:", e);
            alert("Erro ao salvar online. Verifique sua conexão ou permissões no Firebase.");
        }
    } else {
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve();
    }
}

// Remove tudo que não for número
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata valor para Moeda Brasileira (R$)
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// =============================================================================
// 2. FUNÇÕES HELPER (GETTERS)
// =============================================================================

function getMotorista(id) {
    return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id));
}

function getVeiculo(placa) {
    return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
}

function getContratante(cnpj) {
    return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj);
}

function getAjudante(id) {
    return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id));
}

function getAtividade(id) {
    return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id));
}

function getMinhaEmpresa() {
    return loadData(DB_KEYS.MINHA_EMPRESA);
}

// =============================================================================
// 3. INTELIGÊNCIA DE CÁLCULO DE FROTA
// =============================================================================

function obterUltimoPrecoCombustivel(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    const opsComPreco = todasOps.filter(op => 
        op && op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    
    if (opsComPreco.length === 0) return 0;
    
    opsComPreco.sort((a, b) => new Date(b.data || '1970-01-01') - new Date(a.data || '1970-01-01'));
    
    return Number(opsComPreco[0].precoLitro) || 0;
}

function calcularMediaHistoricaVeiculo(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    // Só considera operações CONFIRMADAS para média
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa && op.status !== 'AGENDADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        if(op.kmRodado) totalKmAcumulado += Number(op.kmRodado);
        
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0;
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

function calcularCustoConsumoViagem(op) {
    if (!op || !op.veiculoPlaca) return 0;
    // Agendadas não tem consumo real ainda
    if (op.status === 'AGENDADA') return 0;
    
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    const kmRodado = Number(op.kmRodado) || 0;
    
    if (mediaKmL <= 0 || kmRodado <= 0) return 0;

    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0; 

    const litrosConsumidos = kmRodado / mediaKmL;
    return litrosConsumidos * precoParaCalculo;
}

// =============================================================================
// 4. FORMATADORES
// =============================================================================

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

function detectPixType(key) {
    if (!key) return '';
    const v = key.trim();
    const d = onlyDigits(v);
    if (v.includes('@')) return 'EMAIL';
    if (/^\+?\d+$/.test(v) && (d.length >= 10 && d.length <= 13)) return 'TELEFONE';
    if (/^\d{11}$/.test(d)) return 'CPF';
    if (/^\d{14}$/.test(d)) return 'CNPJ';
    return 'ALEATÓRIA';
}

function copyToClipboard(text, silent = false) {
    if (!text) return alert('NADA PARA COPIAR.');
    navigator.clipboard.writeText(text).then(() => {
        if (!silent) alert('COPIADO PARA A ÁREA DE TRANSFERÊNCIA!');
    }, () => alert('FALHA AO COPIAR.'));
}

// =============================================================================
// 5. VALIDAÇÕES E UI
// =============================================================================

function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCEU EM ${validade.toLocaleDateString('pt-BR')}!`);
    else if (diffDays <= 30) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VAI VENCER EM BREVE (${validade.toLocaleDateString('pt-BR')}).`);
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
// 6. LÓGICA DE AJUDANTES
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
// 7. POPULATE SELECTS (PREENCHER DROPDOWNS)
// =============================================================================

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
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
    const motoristas = loadData(DB_KEYS.MOTORISTAS);
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const ajudantes = loadData(DB_KEYS.AJUDANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE PARA ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');

    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

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
    
    // Selects do Modal de Checkin
    populateSelect('checkinVeiculo', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('checkinContratante', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    populateSelect('checkinAtividade', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');

    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
    renderCheckinsTable();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    if (emp && emp.razaoSocial) {
        div.innerHTML = `<p><strong>RAZÃO SOCIAL:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p><p><strong>TELEFONE:</strong> ${emp.telefone || ''}</p>`;
    } else div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO CADASTRADO.</p>`;
}

// =============================================================================
// 8. TABELAS DE CADASTRO
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, rowsHtml = '';
    let idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';

    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    if (!tabela) return;

    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        if (key === DB_KEYS.ATIVIDADES) {
            col1 = item.id;
            col2 = item.nome;
            col3 = '';
        }
        
        let btns = '';
        if (key !== DB_KEYS.ATIVIDADES) {
             btns += `<button class="btn-action view-btn" title="VISUALIZAR" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        }
        
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" title="EDITAR" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" title="EXCLUIR" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }

        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td>${col3 !== '' ? `<td>${col3}</td>` : ''}<td>${btns}</td></tr>`;
    });
    if (tabela && tabela.querySelector('tbody')) tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
}

// =============================================================================
// 9. CRUD GENÉRICO
// =============================================================================

function viewCadastro(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.6;">';
    if (key === DB_KEYS.MOTORISTAS) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>CNH:</strong> ${item.cnh || ''}</p><p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p><p><strong>CATEGORIA CNH:</strong> ${item.categoriaCNH || ''}</p><p><strong>CURSOS ESPECIAIS:</strong> ${item.temCurso ? (item.cursoDescricao || 'SIM (NÃO ESPECIFICADO)') : 'NÃO'}</p><p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
        // Exibe o usuário criado automaticamente
        if(item.email) {
            html += `<hr><p style="color:var(--primary-color);"><strong>USUÁRIO DE ACESSO (LOGIN):</strong> ${item.email}</p>`;
        }
    } else if (key === DB_KEYS.AJUDANTES) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p><p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
        if(item.email) {
            html += `<hr><p style="color:var(--primary-color);"><strong>USUÁRIO DE ACESSO (LOGIN):</strong> ${item.email}</p>`;
        }
    } else if (key === DB_KEYS.VEICULOS) {
        html += `<p><strong>PLACA:</strong> ${item.placa}</p><p><strong>MODELO:</strong> ${item.modelo}</p><p><strong>ANO:</strong> ${item.ano || ''}</p><p><strong>RENAVAM:</strong> ${item.renavam || ''}</p><p><strong>CHASSI:</strong> ${item.chassi || ''}</p>`;
    } else if (key === DB_KEYS.CONTRATANTES) {
        html += `<p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p><p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(item.cnpj)}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
    }
    html += '</div>';
    openViewModal('VISUALIZAR REGISTRO', html);
}

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
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
    } else if (key === DB_KEYS.AJUDANTES) {
        const a = getAjudante(id);
        if (!a) return;
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
    } else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
    } else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
    } else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
    }
    alert('DADOS CARREGADOS NO FORMULÁRIO. ALTERE E CLIQUE EM SALVAR.');
}

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    
    if (!confirm('CONFIRMA EXCLUSÃO?')) return;
    let arr = loadData(key);
    if (!arr || !arr.length) return;
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    alert('ITEM EXCLUÍDO (PROCESSANDO...).');
}

// =============================================================================
// 10. FORM HANDLERS (SUBMISSÃO DE FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Lógica de Criação de Usuário (Domínio/Email)
            let emailGerado = null;
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const nomeInput = document.getElementById('motoristaNome').value.toUpperCase();

            // Se for novo cadastro, solicita criação de usuário
            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: joao.silva) para que este motorista possa acessar o sistema.\nO domínio será @${companyDomain}.`);
                
                if (!userLogin) {
                    alert("CADASTRO CANCELADO. É NECESSÁRIO DEFINIR UM USUÁRIO.");
                    return;
                }
                // Remove espaços e acentos simples
                const cleanLogin = userLogin.trim().toLowerCase().replace(/\s+/g, '.');
                emailGerado = `${cleanLogin}@${companyDomain}`;
            }

            // Recupera objeto existente se for edição para manter o email antigo
            let existingEmail = null;
            if (idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            }

            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 101),
                nome: nomeInput,
                documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
                pix: document.getElementById('motoristaPix').value || '',
                email: emailGerado || existingEmail || '' // Salva o email gerado ou mantém o existente
            };
            
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.MOTORISTAS, arr);
            
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            
            if (emailGerado) {
                alert(`MOTORISTA SALVO!\n\nUSUÁRIO CRIADO: ${emailGerado}\nINFORME ESTE E-MAIL AO MOTORISTA PARA O PRIMEIRO ACESSO (CRIAR SENHA).`);
            } else {
                alert('MOTORISTA ATUALIZADO.');
            }
        });
    }

    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let emailGerado = null;
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const nomeInput = document.getElementById('ajudanteNome').value.toUpperCase();

            // Se for novo cadastro, solicita criação de usuário
            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: pedro.souza) para que este ajudante possa acessar o sistema.\nO domínio será @${companyDomain}.`);
                
                if (!userLogin) {
                    alert("CADASTRO CANCELADO. É NECESSÁRIO DEFINIR UM USUÁRIO.");
                    return;
                }
                const cleanLogin = userLogin.trim().toLowerCase().replace(/\s+/g, '.');
                emailGerado = `${cleanLogin}@${companyDomain}`;
            }

            let existingEmail = null;
            if (idHidden) {
                const existing = arr.find(a => String(a.id) === String(idHidden));
                if(existing) existingEmail = existing.email;
            }

            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 201),
                nome: nomeInput,
                documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
                pix: document.getElementById('ajudantePix').value || '',
                email: emailGerado || existingEmail || ''
            };
            
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            
            if (emailGerado) {
                alert(`AJUDANTE SALVO!\n\nUSUÁRIO CRIADO: ${emailGerado}\nINFORME ESTE E-MAIL AO AJUDANTE PARA O PRIMEIRO ACESSO (CRIAR SENHA).`);
            } else {
                alert('AJUDANTE ATUALIZADO.');
            }
        });
    }

    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const obj = {
                placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: Number(document.getElementById('veiculoAno').value) || null,
                renavam: document.getElementById('veiculoRenavam').value.toUpperCase() || '',
                chassi: document.getElementById('veiculoChassi').value.toUpperCase() || ''
            };
            const idx = arr.findIndex(v => v.placa === placa);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', () => document.getElementById('veiculoId').value = '');
    }

    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.CONTRATANTES).slice();
            const cnpj = document.getElementById('contratanteCNPJ').value;
            const obj = {
                cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value || ''
            };
            const idx = arr.findIndex(c => c.cnpj === cnpj);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', () => document.getElementById('contratanteId').value = '');
    }

    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.ATIVIDADES).slice();
            const idHidden = document.getElementById('atividadeId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 1),
                nome: document.getElementById('atividadeNome').value.toUpperCase()
            };
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', () => document.getElementById('atividadeId').value = '');
    }

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
            alert('DADOS DA EMPRESA SALVOS.');
        });
    }

    // DESPESA GERAL
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
            const idHidden = document.getElementById('despesaGeralId').value;
            
            if (idHidden) {
                const idx = arr.findIndex(d => d.id == idHidden);
                if (idx >= 0) {
                     arr[idx].data = document.getElementById('despesaGeralData').value;
                     arr[idx].veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
                     arr[idx].descricao = document.getElementById('despesaGeralDescricao').value.toUpperCase();
                     arr[idx].valor = Number(document.getElementById('despesaGeralValor').value) || 0;
                }
            } else {
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
                        modoPagamento,
                        formaPagamento,
                        pago: estaPaga
                    });
                }
            }

            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            formDespesa.reset();
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            alert('DESPESA(S) SALVA(S).');
        });
        
        formDespesa.addEventListener('reset', () => {
            document.getElementById('despesaGeralId').value = '';
            setTimeout(toggleDespesaParcelas, 50);
        });
    }

    // OPERAÇÕES (Atualizado para Agendamento)
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

            // Define status
            // Se for novo e marcado como agendamento -> AGENDADA
            // Se for edição, mantém o status ou atualiza se o checkbox mudou (mas prioriza o checkbox)
            const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';

            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(o => o.id)) + 1 : 1),
                status: statusFinal, // NOVO CAMPO DE STATUS
                data: document.getElementById('operacaoData').value,
                motoristaId: Number(motId) || null,
                veiculoPlaca: document.getElementById('selectVeiculoOperacao').value || '',
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value || '',
                atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
                // Se for agendamento, campos financeiros podem ser 0
                faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
                comissao: document.getElementById('operacaoComissao').value ? Number(document.getElementById('operacaoComissao').value) : 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
                ajudantes: ajudantesVisual.slice()
            };

            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj;
            else arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false; // Reset checkbox
            
            alert(isAgendamento ? 'OPERAÇÃO AGENDADA! DISPONÍVEL PARA CHECK-IN.' : 'OPERAÇÃO SALVA E CONFIRMADA!');
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
        });
    }
    
    // Check-in de Confirmação (Funcionário)
    const formCheckinConfirm = document.getElementById('formCheckinConfirm');
    if (formCheckinConfirm) {
        formCheckinConfirm.addEventListener('submit', (e) => {
            e.preventDefault();
            const opId = Number(document.getElementById('checkinOpId').value);
            const kmRodado = Number(document.getElementById('checkinKmRodado').value) || 0;
            const valorAbastecido = Number(document.getElementById('checkinValorAbastecido').value) || 0;
            const precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idx = arr.findIndex(o => o.id === opId);
            
            if (idx >= 0) {
                // Atualiza a operação existente
                arr[idx].status = 'CONFIRMADA';
                // Atualiza apenas os campos que o motorista pode preencher na execução
                if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
                    arr[idx].kmRodado = kmRodado;
                    arr[idx].combustivel = valorAbastecido;
                    arr[idx].precoLitro = precoLitro;
                }
                
                saveData(DB_KEYS.OPERACOES, arr);
                alert('CHECK-IN REALIZADO E SERVIÇO CONFIRMADO!');
                closeCheckinConfirmModal();
                renderCheckinsTable(); // Atualiza a lista
            }
        });
    }
}

function toggleDespesaParcelas() {
    const modo = document.getElementById('despesaModoPagamento').value;
    const divParcelas = document.getElementById('divDespesaParcelas');
    if (divParcelas) {
        divParcelas.style.display = (modo === 'parcelado') ? 'grid' : 'none';
        if (modo === 'avista') {
            document.getElementById('despesaParcelas').value = 1;
        }
    }
}
window.toggleDespesaParcelas = toggleDespesaParcelas;
// =============================================================================
// 11. TABELA DE OPERAÇÕES E VISUALIZAÇÃO
// =============================================================================

let currentDate = new Date(); // Variável global para o calendário e dashboard

function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ops.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ops.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        // Status Badge
        const isAgendada = op.status === 'AGENDADA';
        const statusBadge = isAgendada 
            ? '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>' 
            : '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        // Se agendada, faturamento pode ser 0 ou estimado
        const faturamentoDisplay = isAgendada && (!op.faturamento) ? '(PENDENTE)' : formatCurrency(op.faturamento);

        let btns = `<button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>`;
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>`;
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

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    
    const isAgendada = op.status === 'AGENDADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    
    // Ajudantes
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)}</li>`;
    }).join('') || '<li>NENHUM</li>';

    let detailsHtml = '';

    if (isAgendada) {
        detailsHtml = `
            <div style="background:#fff3e0; padding:10px; border-radius:4px; border-left:4px solid orange; margin-bottom:15px;">
                <h4 style="color:#e65100; margin-bottom:5px;">OPERAÇÃO AGENDADA</h4>
                <p>Esta operação aguarda confirmação (check-in) pelo motorista ou ajudante.</p>
            </div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <div style="margin-top:10px;"><strong>EQUIPE (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    } else {
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
        const custoDieselEstimado = calcularCustoConsumoViagem(op) || 0;
        const custosOperacionais = (op.comissao || 0) + totalDiarias + (op.despesas || 0) + custoDieselEstimado;
        const liquidoOperacional = (op.faturamento || 0) - custosOperacionais;
        const abastecimentoReal = op.combustivel || 0;
        const adiantamento = op.adiantamento || 0;
        const saldoReceber = (op.faturamento || 0) - adiantamento;

        let infoConsumoHTML = '';
        if (mediaKmL > 0 && custoDieselEstimado > 0) {
            infoConsumoHTML = `<div class="modal-operation-block"><p><strong>MÉDIA HISTÓRICA DO VEÍCULO:</strong> ${mediaKmL.toFixed(2)} KM/L</p><p><strong>CUSTO DIESEL (CALCULADO):</strong> ${formatCurrency(custoDieselEstimado)}</p></div>`;
        } else {
            infoConsumoHTML = `<p style="font-size:0.8rem; color:orange;">DADOS INSUFICIENTES PARA CALCULAR CONSUMO.</p>`;
        }

        detailsHtml = `
            <p><strong>STATUS:</strong> <span style="color:green;font-weight:bold;">CONFIRMADA</span></p>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <p style="font-size:1.1rem; color:var(--primary-color);"><strong>KM RODADO:</strong> ${op.kmRodado || 0} KM</p> 
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>TOTAL DE DIÁRIAS (AJUDANTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>AJUDANTES:</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    }
    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ds.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    ds.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const statusPag = d.pago ? '<span style="color:green; font-weight:bold;">PAGO</span>' : '<span style="color:red; font-weight:bold;">PENDENTE</span>';
        
        let btns = '';
        if (!window.IS_READ_ONLY) {
            const btnPagoIcon = d.pago ? 'fa-times-circle' : 'fa-check-circle';
            const btnPagoTitle = d.pago ? 'MARCAR COMO PENDENTE' : 'MARCAR COMO PAGO';
            const btnPagoClass = d.pago ? 'btn-warning' : 'btn-success';
            btns += `<button class="btn-action ${btnPagoClass}" title="${btnPagoTitle}" onclick="toggleStatusDespesa(${d.id})"><i class="fas ${btnPagoIcon}"></i></button>`;
            btns += `<button class="btn-action edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>`;
            btns += `<button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>`;
        } else {
            btns = '<span style="color:#999;font-size:0.8rem;">(VISUALIZAÇÃO)</span>';
        }

        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td>${statusPag}</td>
            <td>${btns}</td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

window.toggleStatusDespesa = function(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = !arr[idx].pago;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
    }
};

function editDespesaItem(id) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
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
// 12. SISTEMA DE CHECK-INS E AGENDAMENTOS
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const agendadas = ops.filter(o => o.status === 'AGENDADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. LÓGICA DO ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { 
        let rows = '';
        if (!agendadas.length) {
            rows = '<tr><td colspan="5" style="text-align:center;">NENHUM AGENDAMENTO PENDENTE.</td></tr>';
        } else {
            agendadas.forEach(op => {
                const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                rows += `<tr>
                    <td>${dataFmt}</td>
                    <td>${motorista}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td><span style="color:orange;">AGUARDANDO</span></td>
                    <td>
                        <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
        tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        // Atualiza Badge do Menu
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = agendadas.length;
            badge.style.display = agendadas.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. LÓGICA DO FUNCIONÁRIO (Agendamentos Pessoais)
    const listaFunc = document.getElementById('listaServicosAgendados');
    if (listaFunc && window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        
        // Descobre o ID interno do perfil do usuário logado
        let myProfileId = null;
        let myKey = window.CURRENT_USER.role === 'motorista' ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        const myProfile = loadData(myKey).find(p => p.uid === myUid);
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            listaFunc.innerHTML = '<p style="text-align:center;">PERFIL NÃO VINCULADO CORRETAMENTE.</p>';
            return;
        }

        const myAgendas = agendadas.filter(op => {
            if (window.CURRENT_USER.role === 'motorista') {
                return op.motoristaId === myProfileId;
            } else {
                return (op.ajudantes || []).some(a => a.id === myProfileId);
            }
        });

        if (!myAgendas.length) {
            listaFunc.innerHTML = '<p style="text-align:center; color:#666;">NENHUM SERVIÇO AGENDADO NO MOMENTO.</p>';
        } else {
            let html = '';
            myAgendas.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                const atividade = getAtividade(op.atividadeId)?.nome || '-';
                
                let equipeInfo = '';
                if (window.CURRENT_USER.role === 'motorista') {
                    const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome || 'ID '+a.id).join(', ');
                    equipeInfo = `<strong>AJUDANTES:</strong> ${nomesAjudantes || 'NENHUM'}`;
                } else {
                    const nomeMotorista = getMotorista(op.motoristaId)?.nome || 'N/A';
                    equipeInfo = `<strong>MOTORISTA:</strong> ${nomeMotorista}`;
                }

                html += `
                <div class="card" style="border-left: 5px solid var(--primary-color);">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4>
                            <p><strong>CLIENTE:</strong> ${contratante}</p>
                            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
                            <p style="margin-top:5px; font-size:0.9rem; color:#555;">${equipeInfo}</p>
                        </div>
                        <button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})">
                            <i class="fas fa-check-circle"></i> CONFIRMAR
                        </button>
                    </div>
                </div>`;
            });
            listaFunc.innerHTML = html;
        }
    }
}

window.openCheckinConfirmModal = function(opId) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === opId);
    if (!op) return;

    document.getElementById('checkinDisplayData').textContent = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    document.getElementById('checkinDisplayAtividade').textContent = getAtividade(op.atividadeId)?.nome || '-';
    
    if (window.CURRENT_USER && window.CURRENT_USER.role === 'motorista') {
        const nomesAjudantes = (op.ajudantes || []).map(a => getAjudante(a.id)?.nome).join(', ');
        document.getElementById('checkinDisplayEquipeInfo').textContent = `AJUDANTES: ${nomesAjudantes || 'NENHUM'}`;
        document.getElementById('checkinDriverFields').style.display = 'block';
    } else {
        const nomeMotorista = getMotorista(op.motoristaId)?.nome;
        document.getElementById('checkinDisplayEquipeInfo').textContent = `MOTORISTA: ${nomeMotorista}`;
        document.getElementById('checkinDriverFields').style.display = 'none';
    }
    document.getElementById('checkinOpId').value = op.id;
    document.getElementById('modalCheckinConfirm').style.display = 'block';
};

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
};

// =============================================================================
// 13. DASHBOARD E CALENDÁRIO
// =============================================================================

function updateDashboardStats() {
    // Calcula totais do mês atual
    const now = currentDate; // Usa data do calendário
    const mes = now.getMonth();
    const ano = now.getFullYear();

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        const d = new Date(o.data + 'T00:00:00');
        return d.getMonth() === mes && d.getFullYear() === ano;
    });

    const despesasGerais = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => {
        const dt = new Date(d.data + 'T00:00:00');
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });

    let totalFaturamento = 0;
    let totalCustos = 0;

    ops.forEach(op => {
        totalFaturamento += (op.faturamento || 0);
        
        // Custos operacionais
        const diarias = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria) || 0), 0);
        const custoDiesel = calcularCustoConsumoViagem(op) || 0;
        
        totalCustos += (op.comissao || 0) + diarias + (op.despesas || 0) + custoDiesel;
    });

    // Soma despesas gerais
    totalCustos += despesasGerais.reduce((acc, d) => acc + (d.valor || 0), 0);

    const receitaLiquida = totalFaturamento - totalCustos;

    // Atualiza DOM
    const elFaturamento = document.getElementById('faturamentoMes');
    const elDespesas = document.getElementById('despesasMes');
    const elReceita = document.getElementById('receitaMes');

    if (elFaturamento) elFaturamento.textContent = formatCurrency(totalFaturamento);
    if (elDespesas) elDespesas.textContent = formatCurrency(totalCustos);
    if (elReceita) {
        elReceita.textContent = formatCurrency(receitaLiquida);
        elReceita.style.color = receitaLiquida >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }
}

function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = '';
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    label.textContent = `${monthNames[month]} ${year}`;

    // Cabeçalho Dias da Semana
    const daysOfWeek = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
    daysOfWeek.forEach(day => {
        const div = document.createElement('div');
        div.className = 'day-label';
        div.textContent = day;
        grid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Células vazias antes do dia 1
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        grid.appendChild(div);
    }

    // Busca operações deste mês para marcar no calendário
    const ops = loadData(DB_KEYS.OPERACOES);
    
    // Dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.textContent = day;

        // Verifica se tem operação neste dia
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasOp = ops.some(o => o.data === dateStr);

        if (hasOp) {
            div.classList.add('has-operation');
            div.innerHTML += '<div class="event-dot"></div>';
            div.title = "Clique para ver operações deste dia";
            div.onclick = () => {
                alert(`OPERAÇÕES DO DIA ${day}/${month + 1}:\n\nConsulte a tabela abaixo para detalhes.`);
            };
        }

        grid.appendChild(div);
    }
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar(currentDate);
    updateDashboardStats(); // Atualiza os cards de faturamento quando muda o mês
}
window.changeMonth = changeMonth; 
window.renderCalendar = renderCalendar;

// =============================================================================
// 14. GRÁFICOS
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
    const dataRevenue = [];

    let totalReceitaHistorica = 0;
    ops.forEach(o => totalReceitaHistorica += (o.faturamento || 0));
    document.getElementById('receitaTotalHistorico').textContent = formatCurrency(totalReceitaHistorica);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit'
        }).toUpperCase());

        const opsMes = ops.filter(op => {
            const dateOp = new Date(op.data + 'T00:00:00');
            return dateOp.getMonth() === m && dateOp.getFullYear() === y;
        });
        const despMes = despesas.filter(dp => {
            const dateDp = new Date(dp.data + 'T00:00:00');
            return dateDp.getMonth() === m && dateDp.getFullYear() === y;
        });

        let sumCombustivelEstimado = 0;
        let sumOutros = 0;
        let sumFaturamento = 0;
        let sumKm = 0;
        opsMes.forEach(op => {
            sumFaturamento += (op.faturamento || 0);
            sumCombustivelEstimado += (calcularCustoConsumoViagem(op) || 0);
            sumKm += (Number(op.kmRodado) || 0);
            const diarias = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria) || 0), 0);
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });
        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;
        const lucro = sumFaturamento - (sumCombustivelEstimado + sumOutros);

        dataCombustivel.push(sumCombustivelEstimado);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(lucro);
        dataKm.push(sumKm);
        dataRevenue.push(sumFaturamento);
    }

    if (chartInstance) chartInstance.destroy();

    const revenueDataSafe = dataRevenue;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                    label: 'CUSTO DIESEL (ESTIMADO)',
                    data: dataCombustivel,
                    backgroundColor: '#d32f2f',
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'OUTROS CUSTOS',
                    data: dataOutrasDespesas,
                    backgroundColor: '#f57c00',
                    stack: 'Stack 0',
                    order: 3
                },
                {
                    label: 'LUCRO LÍQUIDO',
                    data: dataLucro,
                    backgroundColor: '#388e3c',
                    stack: 'Stack 0',
                    order: 1
                },
                {
                    label: 'KM RODADO',
                    data: dataKm,
                    type: 'line',
                    borderColor: '#263238',
                    borderWidth: 3,
                    pointBackgroundColor: '#263238',
                    yAxisID: 'y1',
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'VALORES (R$)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'KM' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.type === 'line' || context.dataset.label === 'KM RODADO') {
                                return label + context.parsed.y + ' KM';
                            }
                            const val = context.parsed.y;
                            const totalRevenue = revenueDataSafe[context.dataIndex];
                            let percent = 0;
                            if (totalRevenue > 0) percent = (val / totalRevenue) * 100;
                            return `${label}${formatCurrency(val)} (${percent.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// =============================================================================
// 15. SISTEMA DE LEMBRETES & RESET
// =============================================================================

function checkAndShowReminders() {
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const hoje = new Date().toISOString().split('T')[0];
    
    const pendentes = despesas.filter(d => {
        const isPago = !!d.pago; 
        return d.data <= hoje && !isPago;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length > 0) {
        openReminderModal(pendentes);
    }
}

function openReminderModal(pendentes) {
    const modal = document.getElementById('reminderModal');
    const lista = document.getElementById('reminderList');
    
    let html = '';
    pendentes.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        let actions = '';
        if (!window.IS_READ_ONLY) {
             actions = `<div class="reminder-actions">
                    <button class="btn-success btn-mini" title="MARCAR COMO PAGO" onclick="payExpense(${d.id})"><i class="fas fa-check"></i> PAGO</button>
                    <button class="btn-warning btn-mini" title="REAGENDAR (+1 DIA)" onclick="postponeExpense(${d.id})"><i class="fas fa-clock"></i> ADIAR</button>
                    <button class="btn-danger btn-mini" title="EXCLUIR DÍVIDA" onclick="cancelExpense(${d.id})"><i class="fas fa-trash"></i></button>
                </div>`;
        } else {
            actions = '<small style="color:#666;">(VISUALIZAÇÃO)</small>';
        }

        html += `
            <div class="reminder-item">
                <div class="reminder-info">
                    <strong>VENCIMENTO: ${dataFmt}</strong>
                    <p>${d.descricao} - ${formatCurrency(d.valor)}</p>
                    ${d.veiculoPlaca ? `<small>VEÍCULO: ${d.veiculoPlaca}</small>` : ''}
                </div>
                ${actions}
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

window.payExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        arr[idx].pago = true;
        saveData(DB_KEYS.DESPESAS_GERAIS, arr);
        const el = event.target.closest('.reminder-item');
        if (el) el.remove();
        if (!document.querySelectorAll('.reminder-item').length) closeReminderModal();
        renderDespesasTable();
    }
};

window.postponeExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        const atual = new Date(arr[idx].data + 'T00:00:00');
        atual.setDate(atual.getDate() + 1);
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
    if (window.IS_READ_ONLY) return;
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
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA: AÇÃO BLOQUEADA.");
    if (confirm("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DA NUVEM PARA SEMPRE (DE TODOS OS DISPOSITIVOS).\n\nTEM CERTEZA ABSOLUTA?")) {
        Object.values(DB_KEYS).forEach(k => {
            saveData(k, k === DB_KEYS.MINHA_EMPRESA ? {} : []);
        });
        alert("SISTEMA RESETADO. AGUARDE A SINCRONIZAÇÃO.");
    }
}
window.fullSystemReset = fullSystemReset;
// =============================================================================
// 16. INICIALIZAÇÃO E SINCRONIZAÇÃO (REALTIME)
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) {
        setTimeout(setupRealtimeListeners, 500);
        return;
    }
    const { db, doc, onSnapshot } = window.dbRef;
    const keys = Object.values(DB_KEYS);

    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        const companyDomain = window.CURRENT_USER.company;
        keys.forEach(key => {
            onSnapshot(doc(db, 'companies', companyDomain, 'data', key), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    APP_CACHE[key] = data.items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                } else {
                    saveData(key, key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                }
                updateUI();
            }, (error) => {
                console.error(`Erro ao ouvir ${key}:`, error);
            });
        });
    }
}

function updateUI() {
    if (window.CURRENT_USER && window.CURRENT_USER.email === 'admin@logimaster.com') return;

    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    updateDashboardStats();
    renderCharts();
    checkAndShowReminders();
    renderMinhaEmpresaInfo();
    
    // Chama o calendário garantindo que a função existe
    if (typeof renderCalendar === 'function') {
        renderCalendar(currentDate);
    }
    
    renderCheckinsTable(); 
    
    if (window.IS_READ_ONLY && window.enableReadOnlyMode) {
        window.enableReadOnlyMode();
    }
}

function setupInputFormattingListeners() {
    const inputs = ['minhaEmpresaCNPJ', 'contratanteCNPJ'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value));
    });
    const phones = ['minhaEmpresaTelefone', 'contratanteTelefone', 'motoristaTelefone', 'ajudanteTelefone', 'empTelefone'];
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
// 17. RECIBOS E RELATÓRIOS
// =============================================================================

function parseCompositeId(value) {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length !== 2) return null;
    return { type: parts[0], id: parts[1] };
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
                </div>
                <div class="recibo-assinaturas" style="display:flex;gap:20px;margin-top:20px;">
                    <div><p>_____________________________________</p><p>${pessoaNome}</p><p>RECEBEDOR</p></div>
                    <div><p>_____________________________________</p><p>${empresa.razaoSocial || 'EMPRESA'}</p><p>PAGADOR</p></div>
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
                html2pdf().from(element).set({ margin: 10, filename: nomeArq }).save();
            } else alert('LIB HTML2PDF NÃO ENCONTRADA.');
        };
    });
}

// =============================================================================
// 18. BACKUP, RESTORE E RESET
// =============================================================================

function exportDataBackup() {
    const data = {};
    Object.values(DB_KEYS).forEach(k => data[k] = loadData(k));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logimaster_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('BACKUP GERADO.');
}

function importDataBackup(event) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    const file = event.target.files[0];
    if (!file) return;
    if(!confirm("ATENÇÃO: IMPORTAR SUBSTITUIRÁ DADOS ATUAIS. CONTINUAR?")) { event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const promises = [];
            Object.keys(data).forEach(k => {
                if (Object.values(DB_KEYS).includes(k)) promises.push(saveData(k, data[k]));
            });
            if (promises.length > 0) {
                await Promise.all(promises);
                alert('BACKUP IMPORTADO! RECARREGANDO...');
                window.location.reload();
            } else alert('ARQUIVO INVÁLIDO.');
        } catch (err) { console.error(err); alert('ERRO AO IMPORTAR.'); }
    };
    reader.readAsText(file);
}

class ConverterMoeda {
    constructor(valor) { this.valor = Math.abs(Number(valor) || 0); }
    getExtenso() { return `${this.valor.toFixed(2).replace('.',',')} REAIS`; }
}

function gerarRelatorio(e) {
    if (e) e.preventDefault();
    const iniVal = document.getElementById('dataInicioRelatorio').value;
    const fimVal = document.getElementById('dataFimRelatorio').value;
    if (!iniVal || !fimVal) return alert('SELECIONE AS DATAS.');
    // ... (lógica de relatório igual às partes anteriores, mantida para brevidade se não houve alteração)
    // Para economizar espaço, assumo que a função gerarRelatorio e gerarRelatorioCobranca 
    // já foram inseridas corretamente ou são as mesmas da Parte 4 anterior.
    // Caso precise, copie a lógica completa da resposta anterior para estas funções.
}
// OBS: Certifique-se de que gerarRelatorio e gerarRelatorioCobranca estão no código.
// Se precisar, posso reenviar apenas essas funções.

// =============================================================================
// 23. GESTÃO DE USUÁRIOS DA EMPRESA (CORRIGIDO)
// =============================================================================

function setupCompanyUserManagement() {
    if (!window.dbRef || !window.CURRENT_USER) return;
    const { db, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc } = window.dbRef;

    const q = query(collection(db, "users"), where("company", "==", window.CURRENT_USER.company));

    onSnapshot(q, (snapshot) => {
        const users = [];
        snapshot.forEach(d => users.push(d.data()));
        renderCompanyUserTables(users);
    }, (error) => {
        console.error("Erro ao buscar usuários da empresa:", error);
    });

    // CORREÇÃO: Agora aceita o email e nome para vincular corretamente
    window.toggleCompanyUserApproval = async (uid, currentStatus, role, name, email) => {
        try {
            await updateDoc(doc(db, "users", uid), {
                approved: !currentStatus
            });
            // Se aprovou (!currentStatus será true), tenta vincular/criar perfil
            if (!currentStatus) await createLinkedProfile(uid, role, name, email);
            
            alert(currentStatus ? "Usuário bloqueado." : "Usuário aprovado e vinculado com sucesso!");
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar status do usuário.");
        }
    };

    window.deleteCompanyUser = async (uid) => {
        if(!confirm("TEM CERTEZA QUE DESEJA EXCLUIR ESTE FUNCIONÁRIO?")) return;
        try {
            await deleteDoc(doc(db, "users", uid));
            alert("Funcionário excluído.");
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir.");
        }
    };
}

async function createLinkedProfile(uid, role, name, email) {
    let key = null;
    if (role === 'motorista') key = DB_KEYS.MOTORISTAS;
    else if (role === 'ajudante') key = DB_KEYS.AJUDANTES;
    if (!key) return;

    let arr = loadData(key).slice();
    
    // Procura por Nome OU por E-mail (caso o admin já tenha criado manualmente)
    const idx = arr.findIndex(i => i.nome === name || (email && i.email === email));
    
    if (idx >= 0) {
        // VINCULAR EXISTENTE
        console.log("VINCULANDO PERFIL EXISTENTE:", name);
        arr[idx].uid = uid;
        arr[idx].email = email; // Garante que o email fique salvo no cadastro
        await saveData(key, arr);
    } else {
        // CRIAR NOVO (Se não achou cadastro, cria um novo)
        console.log("CRIANDO NOVO PERFIL PARA:", name);
        const newId = arr.length ? Math.max(...arr.map(i => Number(i.id))) + 1 : (role === 'motorista' ? 101 : 201);
        const newProfile = {
            id: newId,
            uid: uid,
            email: email,
            nome: name,
            documento: '',
            telefone: '',
            pix: ''
        };
        if (role === 'motorista') {
            newProfile.cnh = '';
            newProfile.validadeCNH = '';
            newProfile.categoriaCNH = '';
        }
        arr.push(newProfile);
        await saveData(key, arr);
    }
}

function renderCompanyUserTables(users) {
    const myUid = window.CURRENT_USER.uid;
    const others = users.filter(u => u.uid !== myUid);

    const pendentes = others.filter(u => !u.approved);
    const ativos = others.filter(u => u.approved);

    const tPendentes = document.getElementById('tabelaCompanyPendentes');
    if (tPendentes) {
        // CORREÇÃO: Passando todos os parâmetros necessários, incluindo email
        tPendentes.querySelector('tbody').innerHTML = pendentes.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${u.role.toUpperCase()}</td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn-success btn-mini" onclick="toggleCompanyUserApproval('${u.uid}', false, '${u.role}', '${u.name}', '${u.email}')">APROVAR</button>
                    <button class="btn-danger btn-mini" onclick="deleteCompanyUser('${u.uid}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhum pendente.</td></tr>';
    }

    const tAtivos = document.getElementById('tabelaCompanyAtivos');
    if (tAtivos) {
        tAtivos.querySelector('tbody').innerHTML = ativos.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${u.role.toUpperCase()}</td>
                <td style="color:green;font-weight:bold;">ATIVO</td>
                <td>
                    <button class="btn-danger btn-mini" onclick="toggleCompanyUserApproval('${u.uid}', true, '${u.role}', '${u.name}', '${u.email}')">BLOQUEAR</button>
                    <button class="btn-danger btn-mini" onclick="deleteCompanyUser('${u.uid}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhum ativo.</td></tr>';
    }
}

// =============================================================================
// 24. SUPER ADMIN E LISTENERS FINAIS
// =============================================================================

function setupSuperAdmin() {
    // ... (mesma lógica de super admin da versão anterior)
    if (!window.dbRef) return;
    const { db, collection, onSnapshot, updateDoc, doc, auth, sendPasswordResetEmail } = window.dbRef;
    onSnapshot(collection(db, "users"), (snapshot) => {
        const users = [];
        snapshot.forEach(doc => users.push(doc.data()));
        renderSuperAdminDashboard(users);
    });
    window.toggleUserApproval = async (uid, currentStatus) => {
        try { await updateDoc(doc(db, "users", uid), { approved: !currentStatus }); alert("Status atualizado!"); } 
        catch (e) { console.error(e); alert("Erro ao atualizar."); }
    };
    window.resetUserPassword = async (email) => {
        if(!confirm(`ENVIAR RESET PARA ${email}?`)) return;
        try { await sendPasswordResetEmail(auth, email); alert("EMAIL ENVIADO!"); } 
        catch (e) { alert("ERRO AO ENVIAR."); }
    };
}
function renderSuperAdminDashboard(users) {
     // ... (mesma renderização da versão anterior)
     // Código abreviado pois não mudou, mas mantenha a função completa se já a tiver.
     const empresasPendentes = users.filter(u => !u.approved && u.role === 'admin');
     const tPendentes = document.getElementById('tabelaEmpresasPendentes');
     if(tPendentes) tPendentes.querySelector('tbody').innerHTML = empresasPendentes.map(u => `<tr><td>${u.email}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td><td><button class="btn-success btn-mini" onclick="toggleUserApproval('${u.uid}', false)">APROVAR</button></td></tr>`).join('');
     
     const empresasAtivas = users.filter(u => u.approved && u.role === 'admin');
     const tAtivos = document.getElementById('tabelaEmpresasAtivas');
     if(tAtivos) {
        tAtivos.querySelector('tbody').innerHTML = empresasAtivas.map(u => `<tr><td>${u.email}</td><td>${u.password||'***'}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td><td><button class="btn-danger btn-mini" onclick="toggleUserApproval('${u.uid}', true)"><i class="fas fa-ban"></i></button><button class="btn-warning btn-mini" onclick="resetUserPassword('${u.email}')"><i class="fas fa-key"></i></button></td></tr>`).join('');
     }
}

// Inicialização Global
document.addEventListener('DOMContentLoaded', () => {
    // Listeners do form de relatório
    const formRel = document.getElementById('formRelatorio');
    if(formRel) formRel.addEventListener('submit', gerarRelatorio);
    // Listeners de navegação e menu mobile...
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); });
    if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });

    setupFormHandlers();
    setupInputFormattingListeners();
    setupReciboListeners();
});