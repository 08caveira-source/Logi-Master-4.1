// =============================================================================
// ARQUIVO: script.js (COMPLETO - PARTE 1/5)
// =============================================================================

// 1. CONFIGURAÇÕES E BANCO DE DADOS
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
    SOLICITACOES_DADOS: 'db_solicitacoes_dados'
};

// Cache para evitar leituras repetitivas e travamentos
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
    [DB_KEYS.SOLICITACOES_DADOS]: []
};

// Variáveis de Controle de Sessão
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
let currentDate = new Date(); // Para o calendário

// --- FUNÇÕES DE ACESSO A DADOS (DATA LAYER) ---

// Carrega dados do Cache (Síncrono)
function loadData(key) {
    return APP_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// Salva dados no Firebase e atualiza Cache
async function saveData(key, value) {
    // Atualiza cache local imediatamente
    APP_CACHE[key] = value;
    
    // Se estiver conectado ao Firebase, salva na nuvem
    if (window.dbRef && window.CURRENT_USER) {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        try {
            await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
        } catch (e) {
            console.error(`Erro ao salvar ${key}:`, e);
            // Não alertamos erro em toda falha para não interromper o fluxo, apenas logamos
        }
    } else {
        // Fallback para LocalStorage se não houver internet/firebase (Modo Offline básico)
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve();
    }
}

// --- GETTERS (Buscar itens específicos por ID/Chave) ---

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

// --- FORMATADORES E UTILITÁRIOS GERAIS ---

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

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
// 3. INTELIGÊNCIA DE FROTA E CÁLCULOS
// =============================================================================

// Retorna o maior KM Final registrado para um veículo (para validação)
function obterUltimoKmFinal(placa) {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES) || [];
    
    // Filtra operações que têm KM Final (já concluídas ou em andamento avançado)
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.kmFinal && Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    
    // Encontra o maior valor
    const maxKm = Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
    return maxKm;
}

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
    // Só usa operações CONFIRMADAS para média confiável
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
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
    // Se não estiver confirmada, o cálculo é apenas estimativa ou zero
    if (op.status !== 'CONFIRMADA') return 0;
    
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
// 4. FORMATADORES E UTILITÁRIOS DE UI
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
// 5. FUNÇÕES DE MODAIS E INTERAÇÃO
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

// --- LÓGICA DO MODAL DE SOLICITAÇÃO (PERFIL FUNCIONÁRIO) ---
window.openSolicitacaoModal = function() {
    if (!window.CURRENT_USER) return;
    const modal = document.getElementById('modalSolicitarAlteracao');
    if(!modal) return;

    let myData = null;
    let isMotorista = (window.CURRENT_USER.role === 'motorista');
    
    // Busca dados atuais para preencher o form
    if (isMotorista) {
        myData = loadData(DB_KEYS.MOTORISTAS).find(m => m.uid === window.CURRENT_USER.uid || m.email === window.CURRENT_USER.email);
        document.querySelectorAll('.driver-only-edit').forEach(el => el.style.display = 'block');
    } else {
        myData = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email);
        document.querySelectorAll('.driver-only-edit').forEach(el => el.style.display = 'none');
    }

    if (myData) {
        document.getElementById('solicitaNome').value = myData.nome || '';
        document.getElementById('solicitaTelefone').value = myData.telefone || '';
        document.getElementById('solicitaPix').value = myData.pix || '';
        document.getElementById('solicitaEndereco').value = myData.endereco || ''; 
        if (isMotorista) {
             document.getElementById('solicitaCNH').value = myData.cnh || '';
             document.getElementById('solicitaValidadeCNH').value = myData.validadeCNH || '';
        }
    }
    modal.style.display = 'block';
};

// =============================================================================
// 6. GESTÃO DE AJUDANTES (SELEÇÃO PARA OPERAÇÃO)
// =============================================================================

let _pendingAjudanteToAdd = null;

function openAdicionarAjudanteModal(ajudanteObj, onAddCallback) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    _pendingAjudanteToAdd = { aj: ajudanteObj, cb: onAddCallback };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
}

// Listener global para o botão de adicionar no modal
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) {
            document.getElementById('modalAdicionarAjudante').style.display = 'none';
            return;
        }
        _pendingAjudanteToAdd.cb({ id: _pendingAjudanteToAdd.aj.id, diaria: Number(val.toFixed(2)) });
        document.getElementById('modalAdicionarAjudante').style.display = 'none';
        _pendingAjudanteToAdd = null;
    }
});

window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    if (window.IS_READ_ONLY) return;
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    const id = Number(sel.value);
    const already = (window._operacaoAjudantesTempList || []).some(a => Number(a.id) === id);
    if (already) { alert('ESTE AJUDANTE JÁ FOI ADICIONADO.'); sel.value = ""; return; }
    
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
    if (!arr.length) { list.innerHTML = '<li style="color:var(--secondary-color)">NENHUM AJUDANTE SELECIONADO.</li>'; return; }
    
    list.innerHTML = arr.map(a => {
        const aj = getAjudante(a.id) || {};
        const btnDel = window.IS_READ_ONLY ? '' : `<button class="btn-mini" type="button" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button>`;
        return `<li>${aj.nome} — R$ ${formatCurrency(Number(a.diaria)||0)} ${btnDel}</li>`;
    }).join('');
}

window.removeAjudanteFromOperation = function(id) {
    if (window.IS_READ_ONLY) return;
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => a.id !== id);
    renderAjudantesAdicionadosList();
};

// =============================================================================
// 7. PREENCHIMENTO DE SELECTS (DROPDOWNS)
// =============================================================================

function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return; // Se o elemento não existir na tela, ignora (evita erro no perfil func)
    
    const prev = Array.from(sel.selectedOptions).map(o => o.value);
    sel.innerHTML = `<option value="">${initialText}</option>`;
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
    // Tenta restaurar seleção anterior se houver
    try { Array.from(sel.options).forEach(o => { if (prev.includes(o.value)) o.selected = true; }); } catch {}
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
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');

    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE PESSOA...</option>`;
        motoristas.forEach(m => selRecibo.add(new Option(`MOTORISTA - ${m.nome}`, `motorista:${m.id}`)));
        ajudantes.forEach(a => selRecibo.add(new Option(`AJUDANTE - ${a.nome}`, `ajudante:${a.id}`)));
    }
    
    // Selects do Modal de Checkin (usado pelo funcionário também)
    populateSelect('checkinVeiculo', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    populateSelect('checkinContratante', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE A CONTRATANTE...');
    
    // Renderiza as tabelas de cadastro se estiverem na tela
    renderCadastroTable(DB_KEYS.MOTORISTAS);
    renderCadastroTable(DB_KEYS.AJUDANTES);
    renderCadastroTable(DB_KEYS.VEICULOS);
    renderCadastroTable(DB_KEYS.CONTRATANTES);
    renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
}

function renderMinhaEmpresaInfo() {
    const div = document.getElementById('viewMinhaEmpresaContent');
    if (!div) return;
    const emp = getMinhaEmpresa();
    div.innerHTML = emp && emp.razaoSocial 
        ? `<p><strong>RAZÃO:</strong> ${emp.razaoSocial}</p><p><strong>CNPJ:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p>` 
        : `<p style="color:#777;">SEM DADOS.</p>`;
}

// =============================================================================
// 8. TABELAS DE CADASTRO (CRUD)
// =============================================================================

function renderCadastroTable(key) {
    let tabela, idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';

    // Mapeia ID da tabela no HTML
    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    if (!tabela) return; // Se não estiver na tela de cadastros, sai.

    const data = loadData(key);
    let rowsHtml = '';
    
    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        
        let btns = '';
        if (key !== DB_KEYS.ATIVIDADES) {
             btns += `<button class="btn-action view-btn" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>`;
        }
        if (!window.IS_READ_ONLY) {
            btns += `<button class="btn-action edit-btn" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                     <button class="btn-action delete-btn" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>`;
        }
        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td><td>${btns}</td></tr>`;
    });
    
    const tbody = tabela.querySelector('tbody');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="3" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
}

// Funções de CRUD (Visualizar, Editar, Excluir)
function viewCadastro(key, id) {
    let item, html = '';
    if (key === DB_KEYS.MOTORISTAS) { item = getMotorista(id); html = `<p>NOME: ${item.nome}</p><p>TEL: ${item.telefone}</p><p>PIX: ${item.pix}</p><p>CNH: ${item.cnh}</p>`; }
    else if (key === DB_KEYS.AJUDANTES) { item = getAjudante(id); html = `<p>NOME: ${item.nome}</p><p>TEL: ${item.telefone}</p><p>PIX: ${item.pix}</p>`; }
    else if (key === DB_KEYS.VEICULOS) { item = getVeiculo(id); html = `<p>PLACA: ${item.placa}</p><p>MODELO: ${item.modelo}</p>`; }
    else if (key === DB_KEYS.CONTRATANTES) { item = getContratante(id); html = `<p>RAZÃO: ${item.razaoSocial}</p><p>CNPJ: ${item.cnpj}</p>`; }
    
    if (item) openViewModal('VISUALIZAR', html);
}

function editCadastroItem(key, id) {
    if (window.IS_READ_ONLY) return alert("SOMENTE LEITURA.");
    // Preenchimento reverso dos inputs
    if (key === DB_KEYS.MOTORISTAS) {
        const m = getMotorista(id);
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
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
    } else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
    } else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
    } else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
    }
    alert('EDITAR: DADOS CARREGADOS NO FORMULÁRIO.');
}

function deleteItem(key, id) {
    if (window.IS_READ_ONLY) return alert("SOMENTE LEITURA.");
    if (!confirm('CONFIRMA EXCLUSÃO?')) return;
    let arr = loadData(key);
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    alert('ITEM EXCLUÍDO.');
    renderCadastroTable(key);
}
// =============================================================================
// 10. FORM HANDLERS (SUBMISSÃO DE FORMULÁRIOS)
// =============================================================================

function setupFormHandlers() {

    // --- NOVO: HANDLER PARA SOLICITAÇÃO DE ALTERAÇÃO DE DADOS (FUNCIONÁRIO) ---
    const formSolicitacao = document.getElementById('formSolicitacaoDados');
    if (formSolicitacao) {
        formSolicitacao.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!window.CURRENT_USER) return alert("ERRO DE SESSÃO.");

            // Coleta os novos dados propostos
            const novosDados = {
                nome: document.getElementById('solicitaNome').value.toUpperCase(),
                telefone: document.getElementById('solicitaTelefone').value,
                pix: document.getElementById('solicitaPix').value,
                endereco: document.getElementById('solicitaEndereco').value.toUpperCase(),
                cnh: document.getElementById('solicitaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('solicitaValidadeCNH').value
            };

            let arrSolicitacoes = loadData(DB_KEYS.SOLICITACOES_DADOS).slice();
            
            // Cria o objeto da solicitação
            const novaSolicitacao = {
                id: Date.now(), // ID único
                uidUsuario: window.CURRENT_USER.uid,
                emailUsuario: window.CURRENT_USER.email,
                roleUsuario: window.CURRENT_USER.role,
                dataSolicitacao: new Date().toISOString(),
                status: 'PENDENTE', // Aguarda aprovação do Admin
                dados: novosDados
            };

            arrSolicitacoes.push(novaSolicitacao);
            saveData(DB_KEYS.SOLICITACOES_DADOS, arrSolicitacoes);

            formSolicitacao.reset();
            document.getElementById('modalSolicitarAlteracao').style.display = 'none';
            alert("SOLICITAÇÃO ENVIADA COM SUCESSO!\n\nO GESTOR ANALISARÁ SEUS DADOS EM BREVE.");
        });
    }

    // --- MOTORISTA (ADMIN) ---
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e) => {
            e.preventDefault();
            let emailGerado = null;
            let arr = loadData(DB_KEYS.MOTORISTAS).slice();
            const idHidden = document.getElementById('motoristaId').value;
            const nomeInput = document.getElementById('motoristaNome').value.toUpperCase();

            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: joao.silva).\nO domínio será @${companyDomain}.`);
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
                email: emailGerado || existingEmail || ''
            };
            
            const idx = arr.findIndex(a => a.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.MOTORISTAS, arr);
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            if (emailGerado) alert(`MOTORISTA SALVO! USUÁRIO: ${emailGerado}`);
            else alert('MOTORISTA ATUALIZADO.');
        });
    }

    // --- AJUDANTE (ADMIN) ---
    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e) => {
            e.preventDefault();
            let emailGerado = null;
            let arr = loadData(DB_KEYS.AJUDANTES).slice();
            const idHidden = document.getElementById('ajudanteId').value;
            const nomeInput = document.getElementById('ajudanteNome').value.toUpperCase();

            if (!idHidden) {
                const companyDomain = window.CURRENT_USER ? window.CURRENT_USER.company : 'logimaster.com';
                const userLogin = prompt(`CRIAÇÃO DE ACESSO PARA ${nomeInput}:\n\nDefina o nome de usuário (ex: pedro.souza).\nO domínio será @${companyDomain}.`);
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
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            if (emailGerado) alert(`AJUDANTE SALVO! USUÁRIO: ${emailGerado}`);
            else alert('AJUDANTE ATUALIZADO.');
        });
    }

    // --- VEÍCULO ---
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
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', () => document.getElementById('veiculoId').value = '');
    }

    // --- CONTRATANTE ---
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
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', () => document.getElementById('contratanteId').value = '');
    }

    // --- ATIVIDADE ---
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
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', () => document.getElementById('atividadeId').value = '');
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
            saveData(DB_KEYS.MINHA_EMPRESA, obj);
            alert('DADOS DA EMPRESA SALVOS.');
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
                    arr.push({ id, data: dataParcela, veiculoPlaca, descricao: descFinal, valor: Number(valorParcela.toFixed(2)), modoPagamento, formaPagamento, pago: estaPaga });
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
            
            // Se marcado como agendamento, cria como AGENDADA. Se não, já cria como CONFIRMADA.
            const statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(o => o.id)) + 1 : 1),
                status: statusFinal,
                data: document.getElementById('operacaoData').value,
                motoristaId: Number(motId) || null,
                veiculoPlaca: document.getElementById('selectVeiculoOperacao').value || '',
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value || '',
                atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
                faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value) || 0,
                comissao: document.getElementById('operacaoComissao').value ? Number(document.getElementById('operacaoComissao').value) : 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0, 
                kmInicial: 0,
                kmFinal: 0,
                ajudantes: ajudantesVisual.slice()
            };
            const idx = arr.findIndex(o => o.id === obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.OPERACOES, arr);
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            alert(isAgendamento ? 'OPERAÇÃO AGENDADA! DISPONÍVEL PARA CHECK-IN.' : 'OPERAÇÃO SALVA E CONFIRMADA!');
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
        });
    }
    
    // --- CHECK-IN DO FUNCIONÁRIO (KM INICIAL / FINAL) COM VALIDAÇÃO ---
    const formCheckinConfirm = document.getElementById('formCheckinConfirm');
    if (formCheckinConfirm) {
        formCheckinConfirm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!window.CURRENT_USER) return alert("ERRO DE SESSÃO. FAÇA LOGIN NOVAMENTE.");

            const opId = Number(document.getElementById('checkinOpId').value);
            const step = document.getElementById('checkinStep').value; // 'start' ou 'end'
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            const idx = arr.findIndex(o => o.id === opId);
            
            if (idx >= 0) {
                const op = arr[idx];
                if (!op.checkins) op.checkins = { motorista: false, ajudantes: [] };
                let isMotorista = window.CURRENT_USER.role === 'motorista';
                let confirmouAlguem = false;

                if (isMotorista) {
                    const motoristaCad = getMotorista(op.motoristaId);
                    const souEu = (motoristaCad && (motoristaCad.uid === window.CURRENT_USER.uid || motoristaCad.email === window.CURRENT_USER.email));
                    
                    if (souEu) {
                        if (step === 'start') {
                            const kmIni = Number(document.getElementById('checkinKmInicial').value);
                            
                            // VALIDAÇÃO DE KM
                            const ultimoKmRegistrado = obterUltimoKmFinal(op.veiculoPlaca);
                            
                            if(!kmIni || kmIni <= 0) return alert("INFORME O KM INICIAL VÁLIDO.");
                            
                            if (kmIni < ultimoKmRegistrado) {
                                return alert(`ERRO: O KM INICIAL (${kmIni}) NÃO PODE SER MENOR QUE O ÚLTIMO REGISTRADO (${ultimoKmRegistrado}) PARA ESTE VEÍCULO.`);
                            }
                            
                            op.kmInicial = kmIni;
                            op.status = 'EM_ANDAMENTO'; 
                            op.checkins.motorista = true;
                            confirmouAlguem = true;
                            alert("VIAGEM INICIADA! BOA ROTA.");
                        } else if (step === 'end') {
                            const kmFim = Number(document.getElementById('checkinKmFinal').value);
                            if(!kmFim || kmFim <= op.kmInicial) return alert("O KM FINAL DEVE SER MAIOR QUE O INICIAL.");
                            
                            op.kmFinal = kmFim;
                            op.kmRodado = kmFim - (op.kmInicial || 0);
                            op.combustivel = Number(document.getElementById('checkinValorAbastecido').value) || 0;
                            op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                            
                            op.status = 'CONFIRMADA'; 
                            confirmouAlguem = true;
                            alert(`VIAGEM FINALIZADA!\nTOTAL RODADO: ${op.kmRodado} KM`);
                        }
                    }
                } 
                else if (window.CURRENT_USER.role === 'ajudante') {
                    const ajudanteCad = loadData(DB_KEYS.AJUDANTES).find(a => a.uid === window.CURRENT_USER.uid || a.email === window.CURRENT_USER.email);
                    if (ajudanteCad) {
                        const estaNaOp = (op.ajudantes || []).some(a => a.id === ajudanteCad.id);
                        if (estaNaOp) {
                            if (!op.checkins.ajudantes.includes(ajudanteCad.id)) {
                                op.checkins.ajudantes.push(ajudanteCad.id);
                            }
                            confirmouAlguem = true;
                            alert("PRESENÇA CONFIRMADA!");
                        }
                    }
                }

                if (confirmouAlguem) {
                    saveData(DB_KEYS.OPERACOES, arr);
                    closeCheckinConfirmModal();
                    renderCheckinsTable(); 
                } else {
                    alert('ERRO: VOCÊ NÃO PARECE ESTAR VINCULADO A ESTA OPERAÇÃO.');
                }
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
    
    // OTIMIZAÇÃO: Renderiza apenas os 50 últimos para não travar a tela do Admin
    const opsExibidas = ops.slice(0, 50);

    if (!opsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>';
        return;
    }
    let rows = '';
    opsExibidas.forEach(op => {
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        // Status Badge
        let statusBadge = '';
        if (op.status === 'AGENDADA') statusBadge = '<span style="background:orange; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">AGENDADA</span>';
        else if (op.status === 'EM_ANDAMENTO') statusBadge = '<span style="background:#0288d1; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">EM ANDAMENTO</span>';
        else statusBadge = '<span style="background:green; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">CONFIRMADA</span>';

        const faturamentoDisplay = op.status === 'CONFIRMADA' ? formatCurrency(op.faturamento) : '(PENDENTE)';

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
    
    const isFinalizada = op.status === 'CONFIRMADA';
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    
    // LISTA DE AJUDANTES COM STATUS DE PRESENÇA
    const ajudantesHtml = (op.ajudantes || []).map(a => {
        const aj = getAjudante(a.id) || {};
        const checkins = op.checkins || { ajudantes: [] };
        const presente = checkins.ajudantes && checkins.ajudantes.includes(a.id);
        
        // Se a rota já acabou, mostra quem faltou
        let statusPresenca = '';
        if (isFinalizada) {
            statusPresenca = presente 
                ? '<span style="color:green;font-size:0.7rem;font-weight:bold;">(PRESENTE)</span>' 
                : '<span style="color:red;font-size:0.7rem;font-weight:bold;">(FALTA - NÃO PAGO)</span>';
        }
        
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} ${statusPresenca}</li>`;
    }).join('') || '<li>NENHUM</li>';

    let detailsHtml = '';

    if (!isFinalizada) {
        // Detalhes parciais (Em Andamento ou Agendada)
        let statusColor = op.status === 'EM_ANDAMENTO' ? '#0288d1' : 'orange';
        detailsHtml = `
            <div style="background:#fff3e0; padding:10px; border-radius:4px; border-left:4px solid ${statusColor}; margin-bottom:15px;">
                <h4 style="color:${statusColor}; margin-bottom:5px;">STATUS: ${op.status.replace('_',' ')}</h4>
                <p>Esta operação ainda não foi finalizada financeiramente.</p>
                ${op.kmInicial ? `<p style="margin-top:5px;"><strong>KM INICIAL REGISTRADO:</strong> ${op.kmInicial}</p>` : ''}
            </div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <div style="margin-top:10px;"><strong>EQUIPE (AJUDANTES):</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    } else {
        // Detalhes Completos (Confirmada)
        // REGRA DE NEGÓCIO: Só soma custo de quem estava presente
        const checkins = op.checkins || { ajudantes: [] };
        const totalDiarias = (op.ajudantes || []).reduce((s, a) => {
            if (checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                return s + (Number(a.diaria) || 0);
            }
            return s;
        }, 0);

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
            <p style="font-size:1.1rem; color:var(--primary-color);">
                <strong>KM RODADO:</strong> ${op.kmRodado || 0} KM 
                <span style="font-size:0.8rem; color:#666;">(Ini: ${op.kmInicial || '?'} - Fim: ${op.kmFinal || '?'})</span>
            </p> 
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adiantamento)}</p>
            <p style="font-weight:700;">SALDO A RECEBER: ${formatCurrency(saldoReceber)}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>DIÁRIAS (SOMENTE PRESENTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>SAÍDA DE CAIXA (ABASTECIMENTO):</strong> ${formatCurrency(abastecimentoReal)}</p>
            ${infoConsumoHTML}
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <div style="margin-top:10px;"><strong>LISTA DE PRESENÇA:</strong><ul style="margin-top:6px;">${ajudantesHtml}</ul></div>
        `;
    }
    openOperationDetails('DETALHES DA OPERAÇÃO', detailsHtml);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    
    const dsExibidas = ds.slice(0, 50); // Otimização

    if (!dsExibidas.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA DESPESA GERAL.</td></tr>';
        return;
    }
    let rows = '';
    dsExibidas.forEach(d => {
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

        rows += `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td>${statusPag}</td><td>${btns}</td></tr>`;
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
// 12. SISTEMA DE CHECK-INS E AGENDAMENTOS (LÓGICA OTIMIZADA)
// =============================================================================

function renderCheckinsTable() {
    const ops = loadData(DB_KEYS.OPERACOES);
    // Pendentes são Agendadas ou Em Andamento
    const pendentes = ops.filter(o => o.status !== 'CONFIRMADA').sort((a,b) => new Date(a.data) - new Date(b.data));

    // A. LÓGICA DO ADMIN
    const tabelaAdmin = document.getElementById('tabelaCheckinsPendentes');
    if (tabelaAdmin && !window.IS_READ_ONLY) { 
        let rows = '';
        if (!pendentes.length) {
            rows = '<tr><td colspan="6" style="text-align:center; padding:20px;">NENHUMA ROTA ATIVA.</td></tr>';
        } else {
            pendentes.forEach(op => {
                const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const checkins = op.checkins || { motorista: false, ajudantes: [] };
                
                const motNome = getMotorista(op.motoristaId)?.nome || '...';
                
                let statusLabel = '';
                if (op.status === 'AGENDADA') statusLabel = '<span style="color:orange;">AGUARDANDO INÍCIO</span>';
                else if (op.status === 'EM_ANDAMENTO') statusLabel = '<span style="color:#0288d1; font-weight:bold;">EM ANDAMENTO</span>';

                const motStatusIcon = checkins.motorista 
                    ? `<i class="fas fa-check-circle" style="color:green;" title="Confirmado"></i>` 
                    : `<i class="far fa-clock" style="color:orange;" title="Pendente"></i>`;
                
                let ajudantesStatusHtml = (op.ajudantes || []).map(a => {
                    const confirmou = checkins.ajudantes && checkins.ajudantes.includes(a.id);
                    return confirmou ? `<i class="fas fa-check-circle" style="color:green;"></i>` : `<i class="far fa-clock" style="color:orange;"></i>`;
                }).join(' ');

                // Botão de Forçar Início
                let actionBtn = '';
                if (op.status === 'AGENDADA') {
                    actionBtn = `<button class="btn-primary btn-action" style="padding:6px 12px;" onclick="iniciarRotaManual(${op.id})"><i class="fas fa-play"></i> INICIAR ROTA</button>`;
                } else {
                    actionBtn = `<span style="color:#0288d1; font-size:0.8rem;">MOTORISTA INICIOU</span>`;
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
                        <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
        
        const theadElem = tabelaAdmin.querySelector('thead');
        if(theadElem) theadElem.innerHTML = `<tr><th>DATA</th><th>VEÍCULO</th><th>MOTORISTA</th><th>AJUDANTES</th><th>STATUS</th><th>AÇÃO</th></tr>`;
        tabelaAdmin.querySelector('tbody').innerHTML = rows;
        
        const badge = document.getElementById('badgeCheckins');
        if (badge) {
            badge.textContent = pendentes.length;
            badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
        }
    }

    // B. LÓGICA DO FUNCIONÁRIO (PAINEL + RESUMO HISTÓRICO)
    if (window.CURRENT_USER && (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante')) {
        const myUid = window.CURRENT_USER.uid;
        const myEmail = window.CURRENT_USER.email;
        let myProfileId = null;
        let isMotorista = (window.CURRENT_USER.role === 'motorista');
        let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
        
        const myProfile = loadData(myKey).find(p => p.uid === myUid || (p.email && p.email === myEmail));
        if (myProfile) myProfileId = myProfile.id;

        if (!myProfileId) {
            const el = document.getElementById('listaServicosAgendados');
            if(el) el.innerHTML = '<p style="text-align:center; color:red;">PERFIL NÃO VINCULADO. CONTATE O ADMIN.</p>';
            return;
        }

        // 1. LISTA DE PENDENTES (AGENDADAS OU EM ANDAMENTO)
        const listaFunc = document.getElementById('listaServicosAgendados');
        if (listaFunc) {
            const myPendentes = pendentes.filter(op => {
                if (isMotorista) return op.motoristaId === myProfileId;
                else return (op.ajudantes || []).some(a => a.id === myProfileId);
            });

            if (!myPendentes.length) {
                listaFunc.innerHTML = '<p style="text-align:center; color:#666;">NENHUMA VIAGEM ATIVA.</p>';
            } else {
                let html = '';
                myPendentes.forEach(op => {
                    const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                    
                    let btnHtml = '';
                    if (isMotorista) {
                        if (op.status === 'AGENDADA') {
                            btnHtml = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
                        } else if (op.status === 'EM_ANDAMENTO') {
                            btnHtml = `<button class="btn-danger" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
                        }
                    } else {
                        // Ajudante
                        const checkins = op.checkins || { ajudantes: [] };
                        const jaConfirmei = checkins.ajudantes && checkins.ajudantes.includes(myProfileId);
                        if (jaConfirmei) {
                            btnHtml = `<button class="btn-success" disabled style="opacity:0.7;"><i class="fas fa-check"></i> CONFIRMADO</button>`;
                        } else {
                            btnHtml = `<button class="btn-primary" onclick="openCheckinConfirmModal(${op.id})"><i class="fas fa-user-check"></i> MARCAR PRESENÇA</button>`;
                        }
                    }

                    html += `<div class="card" style="border-left: 5px solid var(--primary-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div>
                                <h4 style="color:var(--primary-color); margin-bottom:5px;">${dataFmt} - ${op.veiculoPlaca}</h4>
                                <p><strong>CLIENTE:</strong> ${contratante}</p>
                                <p>STATUS: <strong>${op.status.replace('_',' ')}</strong></p>
                            </div>
                            ${btnHtml}
                        </div>
                    </div>`;
                });
                listaFunc.innerHTML = html;
            }
        }

        // 2. RESUMO DE HISTÓRICO (ÚLTIMOS 5 - OTIMIZAÇÃO CRÍTICA)
        const tabelaHistoricoResumo = document.getElementById('tabelaMeusServicosResumo');
        if (tabelaHistoricoResumo) {
            const historico = ops.filter(op => {
                if (op.status !== 'CONFIRMADA') return false;
                if (isMotorista) return op.motoristaId === myProfileId;
                else return (op.ajudantes || []).some(a => a.id === myProfileId);
            }).sort((a,b) => new Date(b.data) - new Date(a.data));

            const top5 = historico.slice(0, 5); // APENAS 5 PARA PERFORMANCE

            if (top5.length === 0) {
                tabelaHistoricoResumo.querySelector('tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;">NENHUM SERVIÇO REALIZADO AINDA.</td></tr>';
            } else {
                let rowsHist = '';
                top5.forEach(op => {
                    const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
                    const c = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
                    rowsHist += `<tr><td>${d}</td><td>${op.veiculoPlaca}</td><td>${c}</td><td><span style="color:green;">CONFIRMADA</span></td></tr>`;
                });
                tabelaHistoricoResumo.querySelector('tbody').innerHTML = rowsHist;
            }
        }
    }
}

// === FUNÇÃO DO MODAL ATUALIZADA (DINÂMICA) ===
window.openCheckinConfirmModal = function(opId) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === opId);
    if (!op) return;

    document.getElementById('checkinDisplayData').textContent = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
    document.getElementById('checkinDisplayContratante').textContent = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    document.getElementById('checkinOpId').value = op.id;

    const isMotorista = window.CURRENT_USER && window.CURRENT_USER.role === 'motorista';
    const divDriver = document.getElementById('checkinDriverFields');
    const divKmIni = document.getElementById('divKmInicial');
    const divKmFim = document.getElementById('divKmFinal');
    const stepInput = document.getElementById('checkinStep');
    const modalTitle = document.getElementById('checkinModalTitle');
    const btnConfirm = document.getElementById('btnConfirmCheckin');

    if (isMotorista) {
        divDriver.style.display = 'block';
        if (op.status === 'AGENDADA') {
            // INICIAR
            stepInput.value = 'start';
            modalTitle.textContent = "INICIAR VIAGEM";
            divKmIni.style.display = 'block';
            divKmFim.style.display = 'none';
            btnConfirm.innerHTML = '<i class="fas fa-play"></i> INICIAR';
            document.getElementById('checkinKmInicial').value = '';
        } else if (op.status === 'EM_ANDAMENTO') {
            // FINALIZAR
            stepInput.value = 'end';
            modalTitle.textContent = "FINALIZAR VIAGEM";
            divKmIni.style.display = 'none';
            divKmFim.style.display = 'block';
            document.getElementById('checkinKmInicialReadonly').value = op.kmInicial || 0;
            btnConfirm.innerHTML = '<i class="fas fa-flag-checkered"></i> FINALIZAR';
        }
    } else {
        // Ajudante
        divDriver.style.display = 'none';
        modalTitle.textContent = "CONFIRMAR PRESENÇA";
        btnConfirm.innerHTML = '<i class="fas fa-check"></i> CONFIRMAR';
    }

    document.getElementById('modalCheckinConfirm').style.display = 'block';
};

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
};
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
    
    let totalReceitaHistorica = 0;
    ops.forEach(o => totalReceitaHistorica += (o.faturamento || 0));
    const elHist = document.getElementById('receitaTotalHistorico');
    if(elHist) elHist.textContent = formatCurrency(totalReceitaHistorica);

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());

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
            
            // Custo real com ajudantes (apenas os presentes)
            const checkins = op.checkins || { ajudantes: [] };
            const diarias = (op.ajudantes || []).reduce((acc, a) => {
                if(checkins.ajudantes && checkins.ajudantes.includes(a.id)) {
                    return acc + (Number(a.diaria) || 0);
                }
                return acc;
            }, 0);
            
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });
        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;
        const lucro = sumFaturamento - (sumCombustivelEstimado + sumOutros);

        dataCombustivel.push(sumCombustivelEstimado);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(lucro);
        dataKm.push(sumKm);
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'DIESEL (EST.)', data: dataCombustivel, backgroundColor: '#d32f2f', stack: '0' },
                { label: 'CUSTOS', data: dataOutrasDespesas, backgroundColor: '#f57c00', stack: '0' },
                { label: 'LUCRO', data: dataLucro, backgroundColor: '#388e3c', stack: '0' },
                { label: 'KM', data: dataKm, type: 'line', borderColor: '#263238', borderWidth: 3, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true },
                y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// =============================================================================
// 15. SISTEMA DE LEMBRETES
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
    let html = '';
    pendentes.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        let actions = window.IS_READ_ONLY ? '' : 
            `<div class="reminder-actions">
                <button class="btn-success btn-mini" onclick="payExpense(${d.id})"><i class="fas fa-check"></i></button>
                <button class="btn-warning btn-mini" onclick="postponeExpense(${d.id})"><i class="fas fa-clock"></i></button>
                <button class="btn-danger btn-mini" onclick="cancelExpense(${d.id})"><i class="fas fa-trash"></i></button>
            </div>`;
        html += `<div class="reminder-item"><div class="reminder-info"><strong>${dataFmt}</strong><p>${d.descricao} - ${formatCurrency(d.valor)}</p></div>${actions}</div>`;
    });
    lista.innerHTML = html;
    modal.style.display = 'block';
}
window.closeReminderModal = () => document.getElementById('reminderModal').style.display = 'none';

window.payExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) { arr[idx].pago = true; saveData(DB_KEYS.DESPESAS_GERAIS, arr); renderDespesasTable(); }
};
window.postponeExpense = function(id) { 
    if (window.IS_READ_ONLY) return;
    let arr = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    const idx = arr.findIndex(d => d.id === id);
    if (idx >= 0) {
        const d = new Date(arr[idx].data); d.setDate(d.getDate() + 1);
        arr[idx].data = d.toISOString().split('T')[0];
        saveData(DB_KEYS.DESPESAS_GERAIS, arr); renderDespesasTable();
    }
};
window.cancelExpense = function(id) {
    if (window.IS_READ_ONLY) return;
    if(confirm("Excluir?")) {
        let arr = loadData(DB_KEYS.DESPESAS_GERAIS).filter(d => d.id !== id);
        saveData(DB_KEYS.DESPESAS_GERAIS, arr); renderDespesasTable();
    }
};

// =============================================================================
// 16. INICIALIZAÇÃO E OTIMIZAÇÃO DE UI
// =============================================================================

function setupRealtimeListeners() {
    if (!window.dbRef) { setTimeout(setupRealtimeListeners, 500); return; }
    const { db, doc, onSnapshot } = window.dbRef;
    
    if (window.CURRENT_USER && window.CURRENT_USER.company) {
        const domain = window.CURRENT_USER.company;
        
        // Carrega dados. Se for funcionário, a UI só vai desenhar o necessário depois.
        Object.values(DB_KEYS).forEach(key => {
            onSnapshot(doc(db, 'companies', domain, 'data', key), (s) => {
                if (s.exists()) APP_CACHE[key] = s.data().items || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                else saveData(key, key === DB_KEYS.MINHA_EMPRESA ? {} : []);
                updateUI();
            });
        });
    }
}

function updateUI() {
    if (!window.CURRENT_USER) return;
    
    // === SEPARAÇÃO DE PERFIS (CORREÇÃO DE MISTURA DE TELAS) ===
    const isFuncionario = (window.CURRENT_USER.role === 'motorista' || window.CURRENT_USER.role === 'ajudante');

    if (isFuncionario) {
        // Se for funcionário, renderiza APENAS as tabelas dele
        // Isso evita que o calendário e tabelas de admin carreguem e travem o celular
        renderCheckinsTable(); 
    } else {
        // Se for ADMIN, renderiza tudo
        populateAllSelects();
        renderOperacaoTable();
        renderDespesasTable();
        updateDashboardStats();
        renderCharts();
        checkAndShowReminders();
        renderMinhaEmpresaInfo();
        if(typeof renderCalendar === 'function') renderCalendar(currentDate);
        renderCheckinsTable();
    }
    
    if (window.IS_READ_ONLY && window.enableReadOnlyMode) window.enableReadOnlyMode();
}

// =============================================================================
// 17. FILTRO FINANCEIRO DO FUNCIONÁRIO (GLOBAL E CORRIGIDO)
// =============================================================================

window.filtrarHistoricoFuncionario = function(e) {
    if(e) e.preventDefault(); // Evita recarregar a página
    if (!window.CURRENT_USER) return;

    const dataIniVal = document.getElementById('empDataInicio').value;
    const dataFimVal = document.getElementById('empDataFim').value;
    if(!dataIniVal || !dataFimVal) return alert("SELECIONE AS DATAS.");

    const di = new Date(dataIniVal + 'T00:00:00');
    const df = new Date(dataFimVal + 'T23:59:59');

    // 1. Identifica o Perfil do Usuário
    let myProfileId = null;
    let isMotorista = (window.CURRENT_USER.role === 'motorista');
    let myKey = isMotorista ? DB_KEYS.MOTORISTAS : DB_KEYS.AJUDANTES;
    const myProfile = loadData(myKey).find(p => p.uid === window.CURRENT_USER.uid || (p.email && p.email === window.CURRENT_USER.email));
    
    if (myProfile) myProfileId = myProfile.id;
    if (!myProfileId) return alert("PERFIL NÃO VINCULADO AO SEU USUÁRIO.");

    const ops = loadData(DB_KEYS.OPERACOES);
    let totalReceber = 0;
    
    // 2. Filtra e Calcula
    const resultado = ops.filter(op => {
        // Só considera operações finalizadas
        if (op.status !== 'CONFIRMADA') return false;
        
        const d = new Date(op.data + 'T00:00:00');
        if (d < di || d > df) return false;

        let participou = false;
        let valorOp = 0;
        let statusPresenca = "CONFIRMADA";

        if (isMotorista) {
            if (op.motoristaId === myProfileId) {
                // Motorista: recebe comissão se a rota foi confirmada
                participou = true;
                valorOp = op.comissao || 0;
            }
        } else {
            // AJUDANTE: Lógica de Falta
            const checkins = op.checkins || { ajudantes: [] };
            const estavaNaLista = (op.ajudantes || []).some(a => a.id === myProfileId);
            
            if (estavaNaLista) {
                participou = true;
                // Só paga se fez check-in (ID está na lista de confirmados)
                if (checkins.ajudantes && checkins.ajudantes.includes(myProfileId)) {
                    const ajData = op.ajudantes.find(a => a.id === myProfileId);
                    valorOp = Number(ajData.diaria) || 0;
                    statusPresenca = "PRESENTE";
                } else {
                    valorOp = 0; // Se não fez checkin, não recebe
                    statusPresenca = "FALTA";
                }
            }
        }

        if (participou) {
            op._valorTemp = valorOp;
            op._statusTemp = statusPresenca;
            totalReceber += valorOp;
            return true;
        }
        return false;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    // 3. Renderiza Resultado na Tabela
    const displayTotal = document.getElementById('empTotalReceber');
    const divResult = document.getElementById('resultadoFinanceiroFuncionario');
    const tbody = document.getElementById('tabelaHistoricoCompleto').querySelector('tbody');

    if(displayTotal) displayTotal.textContent = formatCurrency(totalReceber);
    if(divResult) divResult.style.display = 'block';

    if (resultado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUM REGISTRO NESTE PERÍODO.</td></tr>';
    } else {
        let html = '';
        resultado.forEach(op => {
            const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
            const c = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
            
            // Destaca se foi falta (vermelho) ou pago (verde)
            const colorClass = op._statusTemp === 'FALTA' ? 'color:red' : 'color:green';
            const valStr = op._statusTemp === 'FALTA' ? 'R$ 0,00' : formatCurrency(op._valorTemp);

            html += `<tr>
                <td>${d}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${c}</td>
                <td style="font-weight:bold; ${colorClass}">${valStr}</td>
                <td style="${colorClass}; font-weight:bold;">${op._statusTemp}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};

// =============================================================================
// 18. BACKUP & EXTRAS
// =============================================================================

function exportDataBackup() { 
    const data = {}; Object.values(DB_KEYS).forEach(k => data[k] = loadData(k));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    a.download = 'backup.json'; a.click();
}
window.exportDataBackup = exportDataBackup;

window.importDataBackup = function(e) { 
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
        const d = JSON.parse(ev.target.result);
        Object.keys(d).forEach(k => { if(Object.values(DB_KEYS).includes(k)) saveData(k, d[k]); });
        alert("BACKUP RESTAURADO!"); window.location.reload();
    };
    r.readAsText(f);
};

class ConverterMoeda { constructor(v){this.v=v;} getExtenso(){return"";} } 
window.gerarRelatorio = function(e) { if(e)e.preventDefault(); alert("Relatório Admin"); };
window.exportReportToPDF = function() { alert("PDF Admin"); };
window.gerarRelatorioCobranca = function() { alert("Cobrança Admin"); };

// =============================================================================
// 20. LISTENERS GLOBAIS
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Menu mobile
    const mobBtn = document.getElementById('mobileMenuBtn');
    if(mobBtn) mobBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    
    // Navegação de Abas
    document.querySelectorAll('.nav-item').forEach(i => {
        i.addEventListener('click', () => {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(i.getAttribute('data-page')).classList.add('active');
            if(window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebarOverlay').classList.remove('active');
            }
            if(i.getAttribute('data-page') === 'graficos') renderCharts();
        });
    });

    if(typeof setupInputFormattingListeners === 'function') setupInputFormattingListeners();
    if(typeof setupFormHandlers === 'function') setupFormHandlers();
});

// Funções Globais
window.logoutSystem = function() {
    if(confirm("Sair?")) window.dbRef.signOut(window.dbRef.auth).then(()=>window.location.href="login.html");
};

window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    
    // Esconde todos os menus primeiro
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    
    if(user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        if(typeof setupSuperAdmin === 'function') setupSuperAdmin();
        return;
    }
    
    if(!user.approved) { alert("CONTA EM ANÁLISE."); return; }

    if(user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active'); // Admin começa no Dashboard
        setupRealtimeListeners();
        if(typeof setupCompanyUserManagement === 'function') setupCompanyUserManagement();
    } 
    else if (user.role === 'motorista' || user.role === 'ajudante') {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active'); // Func. começa no Painel
        window.IS_READ_ONLY = true;
        setupRealtimeListeners();
    }
    
    if(window.IS_READ_ONLY && typeof window.enableReadOnlyMode === 'function') window.enableReadOnlyMode();
};

// =============================================================================
// 25. FUNÇÃO DE INÍCIO MANUAL DA ROTA (ADMIN)
// =============================================================================

window.iniciarRotaManual = function(opId) {
    if (window.IS_READ_ONLY) return alert("PERFIL SOMENTE LEITURA.");
    let arr = loadData(DB_KEYS.OPERACOES).slice();
    const idx = arr.findIndex(o => o.id === opId);
    if (idx < 0) return;
    const op = arr[idx];
    
    const checkins = op.checkins || { motorista: false, ajudantes: [] };
    const pendencias = [];
    if (!checkins.motorista) pendencias.push("MOTORISTA");
    (op.ajudantes||[]).forEach(a => {
        if (!checkins.ajudantes || !checkins.ajudantes.includes(a.id)) pendencias.push("AJUDANTE ID "+a.id);
    });

    if (pendencias.length > 0) {
        if (!confirm("ATENÇÃO: MEMBROS PENDENTES ("+pendencias.join(',')+").\nINICIAR ROTA MESMO ASSIM?")) return;
    } else {
        if(!confirm("INICIAR ROTA AGORA?")) return;
    }

    op.status = 'EM_ANDAMENTO';
    saveData(DB_KEYS.OPERACOES, arr);
    alert("ROTA INICIADA!");
    renderCheckinsTable(); 
    renderOperacaoTable();
};