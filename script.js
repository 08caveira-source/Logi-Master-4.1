// --- KEYS e UTILS ---
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

function loadData(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return key === DB_KEYS.MINHA_EMPRESA ? {} : [];
    try { return JSON.parse(raw); } catch (e) { return key === DB_KEYS.MINHA_EMPRESA ? {} : []; }
}
function saveData(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

const onlyDigits = v => (v || '').toString().replace(/\D/g,'');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// --- Mock inicial ---
const MOCK_MOTORISTAS = [];
const MOCK_VEICULOS = [];
const MOCK_CONTRATANTES = [];
const MOCK_AJUDANTES = [];
const MOCK_OPERACOES = [];
const MOCK_DESPESAS_GERAIS = [];
const MOCK_EMPRESA = {};
const MOCK_ATIVIDADES = [];

// Inicializa dados vazios se não existirem
if (!loadData(DB_KEYS.MOTORISTAS).length) saveData(DB_KEYS.MOTORISTAS, MOCK_MOTORISTAS);
if (!loadData(DB_KEYS.VEICULOS).length) saveData(DB_KEYS.VEICULOS, MOCK_VEICULOS);
if (!loadData(DB_KEYS.CONTRATANTES).length) saveData(DB_KEYS.CONTRATANTES, MOCK_CONTRATANTES);
if (!loadData(DB_KEYS.AJUDANTES).length) saveData(DB_KEYS.AJUDANTES, MOCK_AJUDANTES);
if (!loadData(DB_KEYS.OPERACOES).length) saveData(DB_KEYS.OPERACOES, MOCK_OPERACOES);
if (!loadData(DB_KEYS.DESPESAS_GERAIS).length) saveData(DB_KEYS.DESPESAS_GERAIS, MOCK_DESPESAS_GERAIS);
if (!Object.keys(loadData(DB_KEYS.MINHA_EMPRESA)).length) saveData(DB_KEYS.MINHA_EMPRESA, MOCK_EMPRESA);
if (!loadData(DB_KEYS.ATIVIDADES).length) saveData(DB_KEYS.ATIVIDADES, MOCK_ATIVIDADES);

// --- HELPERS GET ---
function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa(){ return loadData(DB_KEYS.MINHA_EMPRESA); }

// --- INTELEGÊNCIA DE CÁLCULO DE FROTA ---
/**
 * Calcula a média histórica de consumo (KM/L) de um veículo
 * baseada em todos os lançamentos feitos até hoje.
 */
function calcularMediaHistoricaVeiculo(placa) {
    const todasOps = loadData(DB_KEYS.OPERACOES).filter(op => op.veiculoPlaca === placa);
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    todasOps.forEach(op => {
        // Soma KM
        if(op.kmRodado) totalKmAcumulado += Number(op.kmRodado);
        
        // Soma Litros (Se houve abastecimento neste dia)
        // Se abasteceu R$ 500,00 a R$ 5,00/L = 100 Litros entraram no tanque
        if (op.combustivel > 0 && op.precoLitro > 0) {
            totalLitrosAbastecidos += (Number(op.combustivel) / Number(op.precoLitro));
        }
    });

    // Evita divisão por zero
    if (totalLitrosAbastecidos === 0) return 0;

    // Retorna KM/L (Ex: 3.5 km/l)
    return totalKmAcumulado / totalLitrosAbastecidos; 
}

/**
 * Calcula o custo estimado de combustível para UMA operação específica
 * baseada na média histórica do veículo e no KM que ele rodou naquele dia.
 */
function calcularCustoConsumoViagem(op) {
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    
    // Se o veículo não tem média (nunca abasteceu ou rodou), não conseguimos estimar custo
    if (mediaKmL === 0 || !op.kmRodado || !op.precoLitro) return 0;

    // Litros que o caminhão "bebeu" para rodar essa distância
    const litrosConsumidos = Number(op.kmRodado) / mediaKmL;
    
    // Custo financeiro desses litros
    const custoEstimado = litrosConsumidos * Number(op.precoLitro);
    
    return custoEstimado;
}


// --- FORMATTERS ---
function formatCPF_CNPJ(value) {
    const digits = onlyDigits(value);
    if (digits.length <= 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m,a,b,c,d) => {
            if (!d) return `${a}.${b}.${c}`;
            return `${a}.${b}.${c}-${d}`;
        });
    } else {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (m,a,b,c,d,e) => {
            if (!e) return `${a}.${b}.${c}/${d}`;
            return `${a}.${b}.${c}/${d}-${e}`;
        });
    }
}
function formatPhoneBr(value) {
    const d = onlyDigits(value);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
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
function copyToClipboard(text, silent=false) {
    if (!text) return alert('NADA PARA COPIAR.');
    navigator.clipboard.writeText(text).then(()=>{
        if (!silent) alert('COPIADO PARA A ÁREA DE TRANSFERÊNCIA!');
    }, ()=> alert('FALHA AO COPIAR.'));
}

// --- VALIDAÇÃO ---
function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays < 0) {
        alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCEU EM ${validade.toLocaleDateString('pt-BR')}!`);
    } else if (diffDays <= 30) {
        alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VAI VENCER EM BREVE (${validade.toLocaleDateString('pt-BR')}).`);
    }
}

// --- UI HELPERS ---
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
function closeViewModal(){ document.getElementById('viewItemModal').style.display = 'none'; }

function openOperationDetails(title, htmlContent) {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
}
function closeModal(){ document.getElementById('operationDetailsModal').style.display = 'none'; }

// --- AJUDANTES LÓGICA ---
let _pendingAjudanteToAdd = null; 
function openAdicionarAjudanteModal(ajudanteObj, onAddCallback) {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(()=> document.getElementById('modalDiariaInput').focus(), 150);
}
function closeAdicionarAjudanteModal() {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) { closeAdicionarAjudanteModal(); return; }
        const { ajudanteObj, onAddCallback } = _pendingAjudanteToAdd;
        onAddCallback({ id: ajudanteObj.id, diaria: Number(val.toFixed(2)) });
        closeAdicionarAjudanteModal();
    }
});

window._operacaoAjudantesTempList = []; 
function handleAjudanteSelectionChange() {
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
    if (!arr.length) { list.innerHTML = '<li style="color:var(--secondary-color)">NENHUM AJUDANTE ADICIONADO.</li>'; return; }
    const html = arr.map(a => {
        const ajud = getAjudante(a.id) || {};
        return `<li>${ajud.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} <button class="btn-mini" style="margin-left:8px;" onclick="removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button></li>`;
    }).join('');
    list.innerHTML = html;
}
function removeAjudanteFromOperation(id) {
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id)!==Number(id));
    renderAjudantesAdicionadosList();
}

// --- POPULAR SELECTS ---
function populateSelect(selectId, data, valueKey, textKey, initialText) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const prev = Array.from(sel.selectedOptions).map(o=>o.value);
    sel.innerHTML = `<option value="">${initialText}</option>`;
    data.forEach(item=>{
        const opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = item[textKey];
        sel.appendChild(opt);
    });
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
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE PARA ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    
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

    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS AS CONTRATANTES');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

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
    if (emp && emp.razaoSocial) {
        div.innerHTML = `
            <p><strong>RAZÃO SOCIAL:</strong> ${emp.razaoSocial}</p>
            <p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(emp.cnpj)}</p>
            <p><strong>TELEFONE:</strong> ${emp.telefone || ''}</p>
        `;
    } else {
        div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO CADASTRADO.</p>`;
    }
}

// --- TABLES ---
function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, rowsHtml = '';
    let idKey = 'id'; 
    if(key===DB_KEYS.VEICULOS) idKey='placa';
    if(key===DB_KEYS.CONTRATANTES) idKey='cnpj';

    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        
        if(key===DB_KEYS.ATIVIDADES) { col1=item.id; col2=item.nome; col3=''; }

        rowsHtml += `<tr>
            <td>${col1}</td>
            <td>${col2}</td>
            ${col3 !== '' ? `<td>${col3}</td>` : ''}
            <td>
                ${key !== DB_KEYS.ATIVIDADES ? `<button class="btn-action view-btn" title="VISUALIZAR" onclick="viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>` : ''}
                <button class="btn-action edit-btn" title="EDITAR" onclick="editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" title="EXCLUIR" onclick="deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });

    if (tabela && tabela.querySelector('tbody')) {
        tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
    }
}

// --- VISUALIZAR ---
function viewCadastro(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);

    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.6;">';
    if (key === DB_KEYS.MOTORISTAS) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p>`;
        html += `<p><strong>DOCUMENTO:</strong> ${item.documento}</p>`;
        html += `<p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
        html += `<p><strong>CNH:</strong> ${item.cnh || ''}</p>`;
        html += `<p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p>`;
        html += `<p><strong>CATEGORIA CNH:</strong> ${item.categoriaCNH || ''}</p>`;
        html += `<p><strong>CURSOS ESPECIAIS:</strong> ${item.temCurso ? (item.cursoDescricao || 'SIM (NÃO ESPECIFICADO)') : 'NÃO'}</p>`;
        html += `<p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
    } else if (key === DB_KEYS.AJUDANTES) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p>`;
        html += `<p><strong>DOCUMENTO:</strong> ${item.documento}</p>`;
        html += `<p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
        html += `<p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p>`;
        html += `<p style="display:flex;gap:8px;align-items:center;"><strong>PIX:</strong> <span>${item.pix || ''}</span> ${item.pix ? `<button class="btn-mini" title="COPIAR PIX" onclick="copyToClipboard('${item.pix}', false)"><i class="fas fa-copy"></i></button>` : ''}</p>`;
    } else if (key === DB_KEYS.VEICULOS) {
        html += `<p><strong>PLACA:</strong> ${item.placa}</p>`;
        html += `<p><strong>MODELO:</strong> ${item.modelo}</p>`;
        html += `<p><strong>ANO:</strong> ${item.ano || ''}</p>`;
        html += `<p><strong>RENAVAM:</strong> ${item.renavam || ''}</p>`;
        html += `<p><strong>CHASSI:</strong> ${item.chassi || ''}</p>`;
    } else if (key === DB_KEYS.CONTRATANTES) {
        html += `<p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p>`;
        html += `<p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(item.cnpj)}</p>`;
        html += `<p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
    }
    html += '</div>';
    openViewModal('VISUALIZAR REGISTRO', html);
}

// --- EDIT & DELETE ---
function editCadastroItem(key, id) {
    if (key === DB_KEYS.MOTORISTAS) {
        const m = getMotorista(id); if(!m) return;
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
        const a = getAjudante(id); if(!a) return;
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
    } else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id); if(!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
    } else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id); if(!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
    } else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id); if(!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
    }
    alert('DADOS CARREGADOS NO FORMULÁRIO. ALTERE E CLIQUE EM SALVAR.');
}

function deleteItem(key, id) {
    if (!confirm('CONFIRMA EXCLUSÃO?')) return;
    let arr = loadData(key);
    if (!arr || !arr.length) return;
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    updateDashboardStats();
    renderCharts();
    alert('ITEM EXCLUÍDO.');
}

// --- FORM HANDLERS ---
function setupFormHandlers() {
    const formMotorista = document.getElementById('formMotorista');
    if (formMotorista) {
        formMotorista.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.MOTORISTAS);
            const idHidden = document.getElementById('motoristaId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a=>a.id)) + 1 : 101),
                nome: document.getElementById('motoristaNome').value.toUpperCase(),
                documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
                telefone: document.getElementById('motoristaTelefone').value,
                cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
                validadeCNH: document.getElementById('motoristaValidadeCNH').value,
                categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
                temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
                cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
                pix: document.getElementById('motoristaPix').value || ''
            };
            const idx = arr.findIndex(a=>a.id===obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.MOTORISTAS, arr);
            formMotorista.reset();
            toggleCursoInput();
            document.getElementById('motoristaId').value = '';
            populateAllSelects();
            alert('MOTORISTA SALVO.');
        });
    }

    const formAjudante = document.getElementById('formAjudante');
    if (formAjudante) {
        formAjudante.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.AJUDANTES);
            const idHidden = document.getElementById('ajudanteId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a=>a.id))+1 : 201),
                nome: document.getElementById('ajudanteNome').value.toUpperCase(),
                documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
                telefone: document.getElementById('ajudanteTelefone').value,
                endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
                pix: document.getElementById('ajudantePix').value || ''
            };
            const idx = arr.findIndex(a=>a.id===obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.AJUDANTES, arr);
            formAjudante.reset();
            document.getElementById('ajudanteId').value = '';
            populateAllSelects();
            alert('AJUDANTE SALVO.');
        });
    }

    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.VEICULOS);
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            const obj = {
                placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: Number(document.getElementById('veiculoAno').value) || null,
                renavam: document.getElementById('veiculoRenavam').value.toUpperCase() || '',
                chassi: document.getElementById('veiculoChassi').value.toUpperCase() || ''
            };
            const idx = arr.findIndex(v=>v.placa===placa);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.VEICULOS, arr);
            formVeiculo.reset();
            populateAllSelects();
            alert('VEÍCULO SALVO.');
        });
        formVeiculo.addEventListener('reset', ()=> document.getElementById('veiculoId').value = '');
    }

    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.CONTRATANTES);
            const cnpj = document.getElementById('contratanteCNPJ').value;
            const obj = {
                cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value || ''
            };
            const idx = arr.findIndex(c=>c.cnpj===cnpj);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.CONTRATANTES, arr);
            formContratante.reset();
            populateAllSelects();
            alert('CONTRATANTE SALVA.');
        });
        formContratante.addEventListener('reset', ()=> document.getElementById('contratanteId').value = '' );
    }

    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.ATIVIDADES);
            const idHidden = document.getElementById('atividadeId').value;
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(a=>a.id))+1 : 1),
                nome: document.getElementById('atividadeNome').value.toUpperCase()
            };
            const idx = arr.findIndex(a=>a.id===obj.id);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.ATIVIDADES, arr);
            formAtividade.reset();
            document.getElementById('atividadeId').value = '';
            populateAllSelects();
            alert('ATIVIDADE SALVA.');
        });
        formAtividade.addEventListener('reset', ()=> document.getElementById('atividadeId').value = '' );
    }

    const formMinhaEmpresa = document.getElementById('formMinhaEmpresa');
    if (formMinhaEmpresa) {
        formMinhaEmpresa.addEventListener('submit', (e)=>{
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value || ''
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj);
            renderMinhaEmpresaInfo();
            alert('DADOS DA EMPRESA SALVOS.');
        });
    }

    // DESPESA GERAL COM PARCELAMENTO
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e)=>{
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS);
            const dataBase = document.getElementById('despesaGeralData').value;
            const veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
            const descricaoBase = document.getElementById('despesaGeralDescricao').value.toUpperCase();
            const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
            const numParcelas = Number(document.getElementById('despesaParcelas').value) || 1;
            const valorParcela = valorTotal / numParcelas;

            for(let i = 0; i < numParcelas; i++) {
                const id = arr.length ? Math.max(...arr.map(d=>d.id))+1 : 1;
                const dateObj = new Date(dataBase + 'T00:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                
                const y = dateObj.getFullYear();
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const d = String(dateObj.getDate()).padStart(2, '0');
                const dataParcela = `${y}-${m}-${d}`;

                const descFinal = numParcelas > 1 ? `${descricaoBase} (${i+1}/${numParcelas})` : descricaoBase;

                arr.push({
                    id, data: dataParcela, veiculoPlaca, descricao: descFinal, valor: Number(valorParcela.toFixed(2))
                });
            }
            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            formDespesa.reset();
            renderDespesasTable();
            updateDashboardStats();
            renderCharts();
            alert('DESPESA(S) SALVA(S).');
        });
        formDespesa.addEventListener('reset', ()=> document.getElementById('despesaGeralId').value = '');
    }

    // OPERAÇÕES
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', (e)=>{
            e.preventDefault();
            const motId = document.getElementById('selectMotoristaOperacao').value;
            if(motId) verificarValidadeCNH(motId);

            let arr = loadData(DB_KEYS.OPERACOES);
            const idHidden = document.getElementById('operacaoId').value;
            const ajudantesVisual = window._operacaoAjudantesTempList || [];
            
            const obj = {
                id: idHidden ? Number(idHidden) : (arr.length ? Math.max(...arr.map(o=>o.id))+1 : 1),
                data: document.getElementById('operacaoData').value,
                motoristaId: Number(motId) || null,
                veiculoPlaca: document.getElementById('selectVeiculoOperacao').value || '',
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value || '',
                atividadeId: Number(document.getElementById('selectAtividadeOperacao').value) || null,
                faturamento: Number(document.getElementById('operacaoFaturamento').value) || 0,
                comissao: document.getElementById('operacaoComissao').value ? Number(document.getElementById('operacaoComissao').value) : 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0,
                ajudantes: ajudantesVisual.slice()
            };
            const idx = arr.findIndex(o=>o.id===obj.id);
            if (idx >=0) arr[idx] = obj; else arr.push(obj);
            saveData(DB_KEYS.OPERACOES, arr);
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            renderOperacaoTable();
            updateDashboardStats();
            renderCalendar(currentDate);
            renderCharts(); 
            alert('OPERAÇÃO SALVA.');
        });
        formOperacao.addEventListener('reset', ()=>{
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            const sel = document.getElementById('selectAjudantesOperacao'); if (sel) sel.value = "";
        });
    }

    const formRel = document.getElementById('formRelatorio');
    if (formRel) formRel.addEventListener('submit', gerarRelatorio);
}

// --- OPERATIONS TABLE ---
let currentDate = new Date();
function renderOperacaoTable() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a,b)=> new Date(b.data)-new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ops.length) { tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO LANÇADA AINDA.</td></tr>'; return; }
    let rows = '';
    ops.forEach(op=>{
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
        const totalDiarias = (op.ajudantes || []).reduce((s,a)=> s + (Number(a.diaria)||0), 0);
        
        // --- CÁLCULO DO LÍQUIDO DIÁRIO USANDO MÉDIA HISTÓRICA ---
        // 1. Descobrir média histórica do veículo
        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
        
        // 2. Estimar custo do combustível para ESTA viagem
        let custoDieselEstimado = 0;
        if (mediaKmL > 0 && op.kmRodado > 0 && op.precoLitro > 0) {
            const litrosEstimados = Number(op.kmRodado) / mediaKmL;
            custoDieselEstimado = litrosEstimados * Number(op.precoLitro);
        }

        // 3. Subtrair do faturamento (Custo Operacional Estimado)
        //    Note que NÃO subtraímos op.combustivel (que é o abastecimento do tanque cheio)
        const custosOperacionais = (op.comissao||0) + totalDiarias + (op.despesas||0) + custoDieselEstimado;
        const liquido = op.faturamento - custosOperacionais;

        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${motorista}</td>
            <td>${atividade}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${liquido>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquido)}</td>
            <td>
                <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action view-btn" onclick="viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

function viewOperacaoDetails(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o=>o.id===id);
    if (!op) return alert('OPERAÇÃO NÃO ENCONTRADA.');
    const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
    const contratante = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atividade = getAtividade(op.atividadeId)?.nome || 'N/A';
    const totalDiarias = (op.ajudantes || []).reduce((s,a)=> s + (Number(a.diaria)||0), 0);
    
    // --- CÁLCULOS DE CUSTO ---
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    let custoDieselEstimado = 0;
    let litrosEstimados = 0;
    let infoConsumoHTML = '';

    if (mediaKmL > 0 && op.kmRodado > 0 && op.precoLitro > 0) {
        litrosEstimados = Number(op.kmRodado) / mediaKmL;
        custoDieselEstimado = litrosEstimados * Number(op.precoLitro);
        
        infoConsumoHTML = `
            <div class="modal-operation-block">
                <p><strong>MÉDIA HISTÓRICA DO VEÍCULO:</strong> ${mediaKmL.toFixed(2)} KM/L</p>
                <p><strong>CONSUMO ESTIMADO NA VIAGEM:</strong> ${litrosEstimados.toFixed(1)} L</p>
                <p><strong>CUSTO DIESEL (CALCULADO):</strong> ${formatCurrency(custoDieselEstimado)}</p>
            </div>
        `;
    } else {
        infoConsumoHTML = `<p style="font-size:0.8rem; color:orange;">DADOS INSUFICIENTES PARA CALCULAR CONSUMO (NECESSÁRIO HISTÓRICO DE ABASTECIMENTOS E KM)</p>`;
    }

    // Líquido Operacional
    const custosOperacionais = (op.comissao||0) + totalDiarias + (op.despesas||0) + custoDieselEstimado;
    const liquidoOperacional = op.faturamento - custosOperacionais;

    // Abastecimento Real (Caixa)
    const abastecimentoReal = op.combustivel || 0;

    const ajudantesHtml = (op.ajudantes || []).map(a=>{
        const aj = getAjudante(a.id) || {};
        return `<li>${aj.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)}</li>`;
    }).join('') || '<li>NENHUM</li>';
    
    const html = `
        <div>
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${contratante}</p>
            <p><strong>ATIVIDADE:</strong> ${atividade}</p>
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
            
            <p><strong>COMISSÃO MOTORISTA:</strong> ${formatCurrency(op.comissao||0)}</p>
            <p><strong>PEDÁGIOS:</strong> ${formatCurrency(op.despesas||0)}</p>
            <p><strong>TOTAL DE DIÁRIAS (AJUDANTES):</strong> ${formatCurrency(totalDiarias)}</p>
            <p><strong>ABASTECIMENTO NO DIA (CAIXA):</strong> ${formatCurrency(abastecimentoReal)}</p>

            ${infoConsumoHTML}

            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">

            <p style="font-size:1.1rem;"><strong>RESULTADO OPERACIONAL (LUCRO):</strong> <span style="color:${liquidoOperacional>=0?'var(--success-color)':'var(--danger-color)'}">${formatCurrency(liquidoOperacional)}</span></p>
            <p style="font-size:0.8rem; color:#666;">(FATURAMENTO - CUSTOS DA VIAGEM, INCLUINDO DIESEL ESTIMADO)</p>

            <div style="margin-top:10px;">
                <strong>AJUDANTES:</strong>
                <ul style="margin-top:6px;">${ajudantesHtml}</ul>
            </div>
        </div>
    `;
    openOperationDetails('DETALHES DA OPERAÇÃO', html);
}

function renderDespesasTable() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a,b)=> new Date(b.data)-new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ds.length) { tabela.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">NENHUMA DESPESA GERAL LANÇADA AINDA.</td></tr>'; return; }
    let rows = '';
    ds.forEach(d=>{
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        rows += `<tr>
            <td>${dataFmt}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatCurrency(d.valor)}</td>
            <td>
                <button class="btn-action edit-btn" onclick="editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

// editDespesaItem para usar no botão editar da tabela de despesas
function editDespesaItem(id) {
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).find(x=>x.id===id);
    if (!d) return;
    document.getElementById('despesaGeralId').value = d.id;
    document.getElementById('despesaGeralData').value = d.data;
    document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoPlaca || '';
    document.getElementById('despesaGeralDescricao').value = d.descricao;
    document.getElementById('despesaGeralValor').value = d.valor;
    window.location.hash = '#despesas';
}

// --- CALENDÁRIO e STATS (mantive) ---
const calendarGrid = document.getElementById('calendarGrid');
const currentMonthYear = document.getElementById('currentMonthYear');

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthYear.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';
    const dayNames = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    dayNames.forEach(n=>{
        const h = document.createElement('div'); h.classList.add('day-header'); h.textContent = n; calendarGrid.appendChild(h);
    });
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    for (let i=0;i<firstDayOfMonth;i++){
        const e = document.createElement('div'); e.classList.add('day-cell','empty'); calendarGrid.appendChild(e);
    }
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);
    for (let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('div'); cell.classList.add('day-cell'); cell.textContent = d;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDay = ops.filter(op=>op.data===dateStr);
        if (opsDay.length) {
            // CORRIGIDO: ADICIONA CLASSE 'has-operation' PARA FICAR VERDE
            cell.classList.add('has-operation');
            
            const dot = document.createElement('div'); dot.classList.add('event-dot'); cell.appendChild(dot);
            cell.setAttribute('data-date', dateStr);
            cell.addEventListener('click', (e)=> showOperationDetails(e.currentTarget.getAttribute('data-date')));
        }
        calendarGrid.appendChild(cell);
    }
}

function changeMonth(delta){ currentDate.setMonth(currentDate.getMonth()+delta); renderCalendar(currentDate); updateDashboardStats(); }
window.changeMonth = changeMonth;

function showOperationDetails(date) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op=>op.data===date);
    if (!ops.length) return;
    const modalTitle = `DETALHES DAS OPERAÇÕES EM ${new Date(date+'T00:00:00').toLocaleDateString('pt-BR')}`;
    let html = '';
    ops.forEach(op=>{
        const motorista = getMotorista(op.motoristaId)?.nome || 'N/A';
        const ajudantesHtml = (op.ajudantes||[]).map(a=> `<li>${(getAjudante(a.id)?.nome)||'ID:'+a.id} — ${formatCurrency(Number(a.diaria)||0)}</li>`).join('') || '<li>NENHUM</li>';
        const totalDiarias = (op.ajudantes||[]).reduce((s,a)=>s+(Number(a.diaria)||0),0);
        
        // CÁLCULO INTELIGENTE (O MESMO DA TABELA PRINCIPAL)
        const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
        let custoDieselEstimado = 0;
        if (mediaKmL > 0 && op.kmRodado > 0 && op.precoLitro > 0) {
            const litrosEstimados = Number(op.kmRodado) / mediaKmL;
            custoDieselEstimado = litrosEstimados * Number(op.precoLitro);
        }

        const custosViagem = (op.comissao||0) + totalDiarias + (op.despesas||0) + custoDieselEstimado;
        const liquido = op.faturamento - custosViagem;

        html += `<div class="card" style="margin-bottom:10px;">
            <p><strong>MOTORISTA:</strong> ${motorista}</p>
            <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
            <p><strong>CONTRATANTE:</strong> ${getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ}</p>
            <p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p>
            <p style="font-size:0.9rem; color:#555;">MÉDIA VEÍCULO: ${mediaKmL.toFixed(2)} KM/L (CUSTO DIESEL EST.: ${formatCurrency(custoDieselEstimado)})</p>
            <p style="font-weight:700;color:${liquido>=0?'var(--success-color)':'var(--danger-color)'}">LUCRO OPERACIONAL: ${formatCurrency(liquido)}</p>
            <div><strong>AJUDANTES:</strong><ul>${ajudantesHtml}</ul></div>
            <div style="text-align:right;">
                <button class="btn-action edit-btn" onclick="editOperacaoItem(${op.id})"><i class="fas fa-edit"></i> EDITAR</button>
                <button class="btn-action delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i> EXCLUIR</button>
            </div>
        </div>`;
    });
    openOperationDetails(modalTitle, html);
}

// atualizar stats (Dashboard Inicial)
function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const mesAtual = currentDate.getMonth();
    const anoAtual = currentDate.getFullYear();
    const opsMes = ops.filter(op => { const d=new Date(op.data+'T00:00:00'); return d.getMonth()===mesAtual && d.getFullYear()===anoAtual; });
    const despesasMes = despesas.filter(d=>{ const dt=new Date(d.data+'T00:00:00'); return dt.getMonth()===mesAtual && dt.getFullYear()===anoAtual; });
    
    const totalFaturamento = opsMes.reduce((s,o)=>s+o.faturamento,0);
    
    // DASHBOARD: FLUXO DE CAIXA REAL (O QUE SAIU DO BOLSO NA BOMBA)
    // No dashboard geral, mantemos o fluxo de caixa para controle financeiro de "quanto dinheiro tenho".
    const custoOp = opsMes.reduce((s,o)=> {
        const diarias = (o.ajudantes||[]).reduce((ss,a)=>ss+(Number(a.diaria)||0),0);
        return s + (o.comissao||0) + diarias + (o.combustivel||0) + (o.despesas||0);
    }, 0);

    const custoGeral = despesasMes.reduce((s,d)=>s+d.valor,0);
    
    const totalCustos = custoOp + custoGeral;
    const receitaLiquida = totalFaturamento - totalCustos;
    
    document.getElementById('faturamentoMes').textContent = formatCurrency(totalFaturamento);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCustos);
    document.getElementById('receitaMes').textContent = formatCurrency(receitaLiquida);
}

// --- GRÁFICOS (CORRIGIDO CORES E EMPILHAMENTO) ---
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
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
        labels.push(label);

        const opsMes = ops.filter(op => { 
            const dateOp = new Date(op.data + 'T00:00:00'); 
            return dateOp.getMonth() === m && dateOp.getFullYear() === y; 
        });
        const despMes = despesas.filter(dp => {
            const dateDp = new Date(dp.data + 'T00:00:00');
            return dateDp.getMonth() === m && dateDp.getFullYear() === y;
        });

        let sumCombustivel = 0;
        let sumOutros = 0;
        let sumFaturamento = 0;
        let sumKm = 0;

        opsMes.forEach(op => {
            sumFaturamento += (op.faturamento || 0);
            sumCombustivel += (op.combustivel || 0);
            sumKm += (op.kmRodado || 0);
            const diarias = (op.ajudantes || []).reduce((acc, a) => acc + (Number(a.diaria)||0), 0);
            sumOutros += (op.comissao || 0) + diarias + (op.despesas || 0);
        });
        const sumDespGeral = despMes.reduce((acc, d) => acc + (d.valor || 0), 0);
        sumOutros += sumDespGeral;

        const lucro = sumFaturamento - (sumCombustivel + sumOutros);

        dataCombustivel.push(sumCombustivel);
        dataOutrasDespesas.push(sumOutros);
        dataLucro.push(lucro);
        dataKm.push(sumKm);
    }

    if (chartInstance) chartInstance.destroy();

    // CORES CORRIGIDAS E STACKED
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'COMBUSTÍVEL',
                    data: dataCombustivel,
                    backgroundColor: '#d32f2f', // Vermelho escuro
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'OUTROS CUSTOS',
                    data: dataOutrasDespesas,
                    backgroundColor: '#f57c00', // Laranja
                    stack: 'Stack 0',
                    order: 3
                },
                {
                    label: 'LUCRO LÍQUIDO',
                    data: dataLucro,
                    backgroundColor: '#388e3c', // Verde forte
                    stack: 'Stack 0',
                    order: 1
                },
                {
                    label: 'KM RODADO',
                    data: dataKm,
                    type: 'line',
                    borderColor: '#263238', // Preto/Cinza chumbo
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
                            if (context.parsed.y !== null) {
                                if (context.datasetIndex === 3) return label + context.parsed.y + ' KM';
                                return label + formatCurrency(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- GERAR RELATÓRIO ---
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

    // VARIÁVEIS TOTAIS
    let receitaTotal = 0;
    let custoMotoristas = 0;
    let custoAjudantes = 0;
    let custoPedagios = 0;
    let custoDieselEstimadoTotal = 0; // Soma dos custos estimados viagem a viagem
    let kmTotalNoPeriodo = 0;

    ops.forEach(op => {
        receitaTotal += (op.faturamento || 0);
        custoMotoristas += (op.comissao || 0);
        custoPedagios += (op.despesas || 0);
        kmTotalNoPeriodo += (op.kmRodado || 0);
        if (op.ajudantes) op.ajudantes.forEach(a => custoAjudantes += (Number(a.diaria) || 0));

        // Custo Diesel desta operação específica (Estimado)
        const media = calcularMediaHistoricaVeiculo(op.veiculoPlaca);
        if(media > 0 && op.kmRodado > 0 && op.precoLitro > 0) {
            custoDieselEstimadoTotal += (Number(op.kmRodado) / media) * Number(op.precoLitro);
        }
    });

    let custoGeral = despesasGerais.reduce((acc, d) => acc + (d.valor || 0), 0);
    
    const gastosTotais = custoMotoristas + custoAjudantes + custoDieselEstimadoTotal + custoPedagios + custoGeral;
    const lucroLiquido = receitaTotal - gastosTotais;

    // TEXTO ZAP
    const textoWhatsapp = `*RELATÓRIO LOGIMASTER*\nPERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}\n\n*FINANCEIRO:*\nRECEITA: ${formatCurrency(receitaTotal)}\nGASTOS: ${formatCurrency(gastosTotais)}\n*LUCRO LÍQUIDO: ${formatCurrency(lucroLiquido)}*\n\n*DETALHES:*\nCOMBUSTÍVEL (ESTIMADO): ${formatCurrency(custoDieselEstimadoTotal)}\nMOTORISTAS/AJUDANTES: ${formatCurrency(custoMotoristas + custoAjudantes)}\nOUTROS: ${formatCurrency(custoPedagios + custoGeral)}\n\nKM TOTAL: ${kmTotalNoPeriodo} KM`;

    const btnZap = document.getElementById('btnWhatsappReport');
    if(btnZap) {
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
                <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">COMBUSTÍVEL (ESTIMADO PELO KM)</td><td style="text-align:right; color:var(--danger-color); font-weight:bold;">${formatCurrency(custoDieselEstimadoTotal)}</td></tr>
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

// --- EXPORT PDF ---
function exportReportToPDF() {
    const element = document.getElementById('reportResults');
    if (!element || element.style.display === 'none') return alert('GERE UM RELATÓRIO PRIMEIRO.');
    // CORREÇÃO: scrollY: 0 garante que não corte o topo
    html2pdf().set({
        margin: 10, filename: 'RELATORIO_LOGIMASTER.pdf', image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}
window.exportReportToPDF = exportReportToPDF;

// --- FUNÇÃO RELATÓRIO DE COBRANÇA ---
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
    }).sort((a,b)=> new Date(a.data)-new Date(b.data));

    if (ops.length === 0) return alert('NENHUMA OPERAÇÃO ENCONTRADA PARA ESTE CLIENTE NO PERÍODO.');

    let total = 0;
    let rows = '';

    ops.forEach(op => {
        const d = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const vec = op.veiculoPlaca;
        const ativ = getAtividade(op.atividadeId)?.nome || '-';
        total += op.faturamento;
        rows += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;">${d}</td>
                <td style="padding:8px;">${vec}</td>
                <td style="padding:8px;">${ativ}</td>
                <td style="padding:8px; text-align:right;">${formatCurrency(op.faturamento)}</td>
            </tr>
        `;
    });

    const empresa = getMinhaEmpresa();
    const nomeEmpresa = empresa.razaoSocial || 'MINHA EMPRESA';
    const cnpjEmpresa = empresa.cnpj ? formatCPF_CNPJ(empresa.cnpj) : '';

    const textoZap = `*RELATÓRIO DE COBRANÇA - ${nomeEmpresa}*\nCLIENTE: ${contratante.razaoSocial}\nPERÍODO: ${ini.toLocaleDateString('pt-BR')} A ${fim.toLocaleDateString('pt-BR')}\n\nTOTAL A PAGAR: *${formatCurrency(total)}*`;
    
    const btnZap = document.getElementById('btnWhatsappReport');
    if(btnZap) {
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
                    <tr><th style="padding:10px; text-align:left;">DATA</th><th style="padding:10px; text-align:left;">VEÍCULO</th><th style="padding:10px; text-align:left;">ATIVIDADE</th><th style="padding:10px; text-align:right;">VALOR</th></tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#e0f2f1; font-weight:bold;"><td colspan="3" style="padding:10px; text-align:right;">TOTAL A PAGAR:</td><td style="padding:10px; text-align:right; font-size:1.2rem; color:var(--primary-color);">${formatCurrency(total)}</td></tr>
                </tfoot>
            </table>
            <div style="margin-top:40px; text-align:center; font-size:0.9rem; color:#777;">
                <p>DOCUMENTO PARA FINS DE CONFERÊNCIA E COBRANÇA.</p>
                <p>DATA DE EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
        </div>
    `;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
}

// --- RECIBOS ---
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
    btnGerar.addEventListener('click', ()=>{
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
        const di = new Date(inicio+'T00:00:00');
        const df = new Date(fim+'T23:59:59');
        
        const filtered = ops.filter(op=>{
            const d = new Date(op.data+'T00:00:00');
            if (d < di || d > df) return false;
            let match = false;
            if (parsed.type === 'motorista') match = String(op.motoristaId) === String(parsed.id);
            if (parsed.type === 'ajudante') match = Array.isArray(op.ajudantes) && op.ajudantes.some(a=> String(a.id) === String(parsed.id));
            if (!match) return false;
            if (veiculoRecibo && op.veiculoPlaca !== veiculoRecibo) return false;
            if (contratanteRecibo && op.contratanteCNPJ !== contratanteRecibo) return false;
            return true;
        }).sort((a,b)=> new Date(a.data)-new Date(b.data));

        if (!filtered.length) {
            document.getElementById('reciboContent').innerHTML = `<p style="text-align:center;color:var(--danger-color)">NENHUMA OPERAÇÃO ENCONTRADA PARA ESTE PERÍODO/PESSOA.</p>`;
            document.getElementById('reciboTitle').style.display = 'none';
            btnBaixar.style.display = 'none';
            if(btnZapRecibo) btnZapRecibo.style.display = 'none';
            return;
        }

        let totalValorRecibo = 0;
        const linhas = filtered.map(op=>{
            const dataFmt = new Date(op.data+'T00:00:00').toLocaleDateString('pt-BR');
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
        const inicioFmt = new Date(inicio+'T00:00:00').toLocaleDateString('pt-BR');
        const fimFmt = new Date(fim+'T00:00:00').toLocaleDateString('pt-BR');

        if(btnZapRecibo) {
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
                html2pdf().from(element).set({margin: 10, filename: nomeArq, image: {type: 'jpeg', quality: 0.98}, html2canvas: {scale: 2, scrollY: 0}, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }}).save();
            } else alert('LIB HTML2PDF NÃO ENCONTRADA PARA GERAR PDF. INSTALE A LIB OU BAIXE MANUALMENTE.');
        };
    });
}

// --- BACKUP / RESTORE ---
function exportDataBackup() {
    const data = {};
    Object.values(DB_KEYS).forEach(k => data[k] = loadData(k));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `logimaster_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    alert('BACKUP SALVO (DOWNLOAD).');
}
function importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            Object.keys(data).forEach(k=>{ if (Object.values(DB_KEYS).includes(k)) localStorage.setItem(k, JSON.stringify(data[k])); });
            alert('BACKUP IMPORTADO. RECARREGANDO A APLICAÇÃO...');
            location.reload();
        } catch (err) { alert('ERRO AO IMPORTAR O BACKUP.'); }
    };
    reader.readAsText(file);
}

// --- RESET ---
function fullSystemReset() {
    if (confirm("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DO SISTEMA (MOTORISTAS, VEÍCULOS, OPERAÇÕES, ETC). \n\nA TABELA FICARÁ TOTALMENTE EM BRANCO.\n\nTEM CERTEZA ABSOLUTA?")) {
        if (confirm("ÚLTIMA CHANCE: ESTA AÇÃO É IRREVERSÍVEL. CONFIRMAR RESET TOTAL?")) {
            localStorage.clear();
            alert("SISTEMA RESETADO COM SUCESSO. RECARREGANDO PÁGINA EM BRANCO...");
            location.reload();
        }
    }
}
window.fullSystemReset = fullSystemReset;

// --- CLASS MOEDA ---
class ConverterMoeda {
    constructor(valor) { this.valor = Math.abs(Number(valor) || 0); }
    getExtenso() { return `${this.valor.toFixed(2).replace('.',',')} REAIS`; }
}

// --- UTILS INPUTS ---
function setupInputFormattingListeners() {
    const minhaCNPJ = document.getElementById('minhaEmpresaCNPJ');
    if (minhaCNPJ) minhaCNPJ.addEventListener('blur', e=> e.target.value = formatCPF_CNPJ(e.target.value));
    const minhaTel = document.getElementById('minhaEmpresaTelefone');
    if (minhaTel) minhaTel.addEventListener('input', e=> e.target.value = formatPhoneBr(e.target.value));

    const contratanteCNPJ = document.getElementById('contratanteCNPJ');
    if (contratanteCNPJ) contratanteCNPJ.addEventListener('blur', e=> e.target.value = formatCPF_CNPJ(e.target.value));
    const contratanteTel = document.getElementById('contratanteTelefone');
    if (contratanteTel) contratanteTel.addEventListener('input', e=> e.target.value = formatPhoneBr(e.target.value));

    const motoristaTel = document.getElementById('motoristaTelefone');
    if (motoristaTel) motoristaTel.addEventListener('input', e=> e.target.value = formatPhoneBr(e.target.value));
    const motoristaPix = document.getElementById('motoristaPix');
    if (motoristaPix) {
        motoristaPix.addEventListener('input', ()=> document.getElementById('motoristaPixTipo').textContent = 'TIPO: ' + detectPixType(motoristaPix.value));
        document.getElementById('btnMotoristaPixCopy').addEventListener('click', ()=> copyToClipboard(motoristaPix.value));
    }

    const ajudanteTel = document.getElementById('ajudanteTelefone');
    if (ajudanteTel) ajudanteTel.addEventListener('input', e=> e.target.value = formatPhoneBr(e.target.value));
    const ajudantePix = document.getElementById('ajudantePix');
    if (ajudantePix) {
        ajudantePix.addEventListener('input', ()=> document.getElementById('ajudantePixTipo').textContent = 'TIPO: ' + detectPixType(ajudantePix.value));
        document.getElementById('btnAjudantePixCopy').addEventListener('click', ()=> copyToClipboard(ajudantePix.value));
    }

    const contratanteTel2 = document.getElementById('contratanteTelefone');
    if (contratanteTel2) contratanteTel2.addEventListener('input', e=> e.target.value = formatPhoneBr(e.target.value));

    // ouvindo seleção de ajudantes para pedir diária
    const selAjud = document.getElementById('selectAjudantesOperacao');
    if (selAjud) selAjud.addEventListener('change', handleAjudanteSelectionChange);

    // NOVO: Toggle de cursos especiais
    const selCurso = document.getElementById('motoristaTemCurso');
    if (selCurso) selCurso.addEventListener('change', toggleCursoInput);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            document.querySelectorAll('.cadastro-tab-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.cadastro-form').forEach(f=>f.classList.remove('active'));
            const el = document.getElementById(tab);
            if (el) el.classList.add('active');
        });
    });

    document.querySelectorAll('.nav-item').forEach(item=>{
        item.addEventListener('click', ()=>{
            document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
            item.classList.add('active');
            const page = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
            const el = document.getElementById(page);
            if (el) el.classList.add('active');
            if (page === 'graficos') renderCharts();
        });
    });

    // MENU MOBILE
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }
    if(overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    setupFormHandlers();
    setupInputFormattingListeners();
    populateAllSelects();
    renderOperacaoTable();
    renderDespesasTable();
    renderCalendar(currentDate);
    updateDashboardStats();
    setupReciboListeners();
    renderCharts();
});

window.addEventListener('click', function(event) {
    const viewModal = document.getElementById('viewItemModal');
    const opModal = document.getElementById('operationDetailsModal');
    const addAjModal = document.getElementById('modalAdicionarAjudante');
    if (event.target === viewModal) viewModal.style.display = 'none';
    if (event.target === opModal) opModal.style.display = 'none';
    if (event.target === addAjModal) addAjModal.style.display = 'none';
});

// GLOBALS
window.viewCadastro = viewCadastro;
window.editCadastroItem = editCadastroItem;
window.deleteItem = deleteItem;
window.renderOperacaoTable = renderOperacaoTable;
window.renderDespesasTable = renderDespesasTable;
window.exportDataBackup = exportDataBackup;
window.importDataBackup = importDataBackup;
window.viewOperacaoDetails = viewOperacaoDetails;
window.renderCharts = renderCharts; 

window.editOperacaoItem = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o=>o.id===id);
    if (!op) return;
    document.getElementById('operacaoData').value = op.data || '';
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId || '';
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca || '';
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ || '';
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    document.getElementById('operacaoFaturamento').value = op.faturamento || '';
    document.getElementById('operacaoComissao').value = op.comissao || '';
    document.getElementById('operacaoCombustivel').value = op.combustivel || '';
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || ''; 
    document.getElementById('operacaoDespesas').value = op.despesas || '';
    document.getElementById('operacaoKmRodado').value = op.kmRodado || '';
    window._operacaoAjudantesTempList = (op.ajudantes || []).map(a => ({ id: a.id, diaria: Number(a.diaria)||0 }));
    renderAjudantesAdicionadosList();
    document.getElementById('operacaoId').value = op.id;
    alert('DADOS DA OPERAÇÃO CARREGADOS NO FORMULÁRIO. ALTERE E SALVE PARA ATUALIZAR.');
};