/**
 * SCRIPT.JS - VERSÃO CLOUD (SINCRONIZAÇÃO PC <-> CELULAR)
 * Mantendo lógica original de cálculos, visual e recibos.
 */

// =============================================================================
// 1. IMPORTAÇÃO E CONFIGURAÇÃO DO FIREBASE (NUVEM)
// =============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- COLE SUAS CHAVES DO FIREBASE AQUI ---
const firebaseConfig = {
  const firebaseConfig = {
    apiKey: "AIzaSyAyTMFwAyWgNEy5Rqwan7frA547iPGv1vY",
    authDomain: "logimaster-72a29.firebaseapp.com",
    databaseURL: "https://logimaster-72a29-default-rtdb.firebaseio.com",
    projectId: "logimaster-72a29",
    storageBucket: "logimaster-72a29.firebasestorage.app",
    messagingSenderId: "380606262384",
    appId: "1:380606262384:web:e0780179f3bf32973498b5",
    measurementId: "G-29W9SE4P7D"
  };
// Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>

// Chaves do Banco
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

// CACHE LOCAL: Armazena os dados na memória para o site não travar esperando a internet
// Isso substitui a leitura direta do localStorage
window.DB_CACHE = {
    db_motoristas: [],
    db_veiculos: [],
    db_contratantes: [],
    db_operacoes: [],
    db_minha_empresa: {},
    db_despesas_gerais: [],
    db_ajudantes: [],
    db_atividades: []
};

// =============================================================================
// 2. FUNÇÕES DE DADOS (CLOUD)
// =============================================================================

// Salva na Nuvem (Substitui localStorage)
function saveData(key, value) {
    // 1. Atualiza cache local imediatamente (para o usuário ver a mudança na hora)
    window.DB_CACHE[key] = value;
    
    // 2. Envia para o Google Firebase
    set(ref(db, key), value)
        .then(() => console.log("Sincronizado: " + key))
        .catch(e => alert("Erro ao sincronizar: " + e.message));
}

// Lê do Cache (que é mantido atualizado pelo Firebase)
function loadData(key) {
    return window.DB_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// SINCRONIZAÇÃO EM TEMPO REAL (Ouvinte)
// Esta função roda sozinha sempre que algo muda no banco de dados
function iniciarSincronizacao() {
    const dbRef = ref(db);
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Atualiza o cache com os dados novos da nuvem
            Object.keys(DB_KEYS).forEach(k => {
                const dbKey = DB_KEYS[k];
                if (data[dbKey]) {
                    window.DB_CACHE[dbKey] = data[dbKey];
                }
            });
            // Atualiza a tela automaticamente
            refreshUI(); 
        }
    });
}

// Atualiza toda a interface gráfica
function refreshUI() {
    populateAllSelects();
    if(window.changeMonth) window.changeMonth(0);
    if(window.renderOperacaoTable) window.renderOperacaoTable();
    if(window.renderDespesasTable) window.renderDespesasTable();
    if(window.updateDashboardStats) window.updateDashboardStats();
    if(window.renderCharts) window.renderCharts();
}

// =============================================================================
// 3. UTILITÁRIOS E FORMATADORES (SEU CÓDIGO ORIGINAL)
// =============================================================================

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
// 4. FUNÇÕES HELPER (GETTERS)
// =============================================================================

function getMotorista(id) { return loadData(DB_KEYS.MOTORISTAS).find(m => String(m.id) === String(id)); }
function getVeiculo(placa) { return loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa); }
function getContratante(cnpj) { return loadData(DB_KEYS.CONTRATANTES).find(c => c.cnpj === cnpj); }
function getAjudante(id) { return loadData(DB_KEYS.AJUDANTES).find(a => String(a.id) === String(id)); }
function getAtividade(id) { return loadData(DB_KEYS.ATIVIDADES).find(a => String(a.id) === String(id)); }
function getMinhaEmpresa() { return loadData(DB_KEYS.MINHA_EMPRESA); }

// =============================================================================
// 5. INTELIGÊNCIA DE CÁLCULO DE FROTA
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
    const opsVeiculo = todasOps.filter(op => op && op.veiculoPlaca === placa);
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
// 6. UI & MODAIS (EXPORTADOS PARA WINDOW PARA O HTML FUNCIONAR)
// =============================================================================

window.verificarValidadeCNH = function(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCEU EM ${validade.toLocaleDateString('pt-BR')}!`);
    else if (diffDays <= 30) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VAI VENCER EM BREVE (${validade.toLocaleDateString('pt-BR')}).`);
};

window.toggleCursoInput = function() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
};

window.openViewModal = function(title, htmlContent) {
    const modal = document.getElementById('viewItemModal');
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    modal.style.display = 'block';
};

window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };

window.openOperationDetails = function(title, htmlContent) {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
};

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };

// --- AJUDANTES MODAL ---
let _pendingAjudanteToAdd = null;

window.openAdicionarAjudanteModal = function(ajudanteObj, onAddCallback) {
    _pendingAjudanteToAdd = { ajudanteObj, onAddCallback };
    const modal = document.getElementById('modalAdicionarAjudante');
    document.getElementById('modalAjudanteNome').textContent = ajudanteObj.nome;
    document.getElementById('modalDiariaInput').value = '';
    modal.style.display = 'block';
    setTimeout(() => document.getElementById('modalDiariaInput').focus(), 150);
};

window.closeAdicionarAjudanteModal = function() {
    _pendingAjudanteToAdd = null;
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
};

// Listener para botão adicionar ajudante
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modalAjudanteAddBtn') {
        const val = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        if (!_pendingAjudanteToAdd) {
            window.closeAdicionarAjudanteModal();
            return;
        }
        const { ajudanteObj, onAddCallback } = _pendingAjudanteToAdd;
        onAddCallback({ id: ajudanteObj.id, diaria: Number(val.toFixed(2)) });
        window.closeAdicionarAjudanteModal();
    }
});

// =============================================================================
// 7. LISTA DE AJUDANTES (LÓGICA)
// =============================================================================

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
    window.openAdicionarAjudanteModal(ajud, (result) => {
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
        return `<li>${ajud.nome || 'ID:'+a.id} — DIÁRIA: ${formatCurrency(Number(a.diaria)||0)} <button class="btn-mini" style="margin-left:8px;" onclick="window.removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button></li>`;
    }).join('');
    list.innerHTML = html;
}

window.removeAjudanteFromOperation = function(id) {
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
};

// =============================================================================
// 8. POPULATE SELECTS E TABELAS
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
        Array.from(sel.options).forEach(o => { if (prev.includes(o.value)) o.selected = true; });
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

    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE O MOTORISTA OU AJUDANTE...</option>`;
        motoristas.forEach(m => selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`);
        ajudantes.forEach(a => selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`);
    }
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS AS CONTRATANTES');
    populateSelect('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS');
    populateSelect('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODAS');

    window.renderCadastroTable(DB_KEYS.MOTORISTAS);
    window.renderCadastroTable(DB_KEYS.AJUDANTES);
    window.renderCadastroTable(DB_KEYS.VEICULOS);
    window.renderCadastroTable(DB_KEYS.CONTRATANTES);
    window.renderCadastroTable(DB_KEYS.ATIVIDADES);
    renderMinhaEmpresaInfo();
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
// 9. RENDERIZAÇÃO DE TABELAS DE CADASTRO (GLOBAL)
// =============================================================================

window.renderCadastroTable = function(key) {
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

    if(!tabela) return;

    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        if (key === DB_KEYS.ATIVIDADES) { col1 = item.id; col2 = item.nome; col3 = ''; }
        
        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td>${col3 !== '' ? `<td>${col3}</td>` : ''}<td>${key !== DB_KEYS.ATIVIDADES ? `<button class="btn-action view-btn" title="VISUALIZAR" onclick="window.viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button>` : ''}<button class="btn-action edit-btn" title="EDITAR" onclick="window.editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" title="EXCLUIR" onclick="window.deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    if (tabela.querySelector('tbody')) tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">NENHUM CADASTRO ENCONTRADO.</td></tr>`;
}

// =============================================================================
// 10. CRUD GENÉRICO (GLOBAL)
// =============================================================================

window.viewCadastro = function(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');

    let html = '<div style="line-height:1.6;">';
    if (key === DB_KEYS.MOTORISTAS) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>CNH:</strong> ${item.cnh || ''}</p><p><strong>VALIDADE CNH:</strong> ${item.validadeCNH ? new Date(item.validadeCNH+'T00:00:00').toLocaleDateString('pt-BR') : 'NÃO INFORMADA'}</p><p><strong>CATEGORIA CNH:</strong> ${item.categoriaCNH || ''}</p><p><strong>CURSOS ESPECIAIS:</strong> ${item.temCurso ? (item.cursoDescricao || 'SIM') : 'NÃO'}</p><p><strong>PIX:</strong> ${item.pix || ''}</p>`;
    } else if (key === DB_KEYS.AJUDANTES) {
        html += `<p><strong>NOME:</strong> ${item.nome}</p><p><strong>DOCUMENTO:</strong> ${item.documento}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p><p><strong>ENDEREÇO:</strong> ${item.endereco || ''}</p><p><strong>PIX:</strong> ${item.pix || ''}</p>`;
    } else if (key === DB_KEYS.VEICULOS) {
        html += `<p><strong>PLACA:</strong> ${item.placa}</p><p><strong>MODELO:</strong> ${item.modelo}</p><p><strong>ANO:</strong> ${item.ano || ''}</p><p><strong>RENAVAM:</strong> ${item.renavam || ''}</p><p><strong>CHASSI:</strong> ${item.chassi || ''}</p>`;
    } else if (key === DB_KEYS.CONTRATANTES) {
        html += `<p><strong>RAZÃO SOCIAL:</strong> ${item.razaoSocial}</p><p><strong>CNPJ/CPF:</strong> ${formatCPF_CNPJ(item.cnpj)}</p><p><strong>TELEFONE:</strong> ${item.telefone || ''}</p>`;
    }
    html += '</div>';
    window.openViewModal('VISUALIZAR REGISTRO', html);
}

window.editCadastroItem = function(key, id) {
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
        window.toggleCursoInput();
        document.getElementById('motoristaCursoDescricao').value = m.cursoDescricao;
        document.getElementById('motoristaPix').value = m.pix;
        document.getElementById('motoristaId').value = m.id;
        document.querySelector('[data-tab="motoristas"]').click();
    } else if (key === DB_KEYS.AJUDANTES) {
        const a = getAjudante(id);
        if (!a) return;
        document.getElementById('ajudanteNome').value = a.nome;
        document.getElementById('ajudanteDocumento').value = a.documento;
        document.getElementById('ajudanteTelefone').value = a.telefone;
        document.getElementById('ajudanteEndereco').value = a.endereco;
        document.getElementById('ajudantePix').value = a.pix;
        document.getElementById('ajudanteId').value = a.id;
        document.querySelector('[data-tab="ajudantes"]').click();
    } else if (key === DB_KEYS.VEICULOS) {
        const v = getVeiculo(id);
        if (!v) return;
        document.getElementById('veiculoPlaca').value = v.placa;
        document.getElementById('veiculoModelo').value = v.modelo;
        document.getElementById('veiculoAno').value = v.ano;
        document.getElementById('veiculoRenavam').value = v.renavam;
        document.getElementById('veiculoChassi').value = v.chassi;
        document.getElementById('veiculoId').value = v.placa;
        document.querySelector('[data-tab="veiculos"]').click();
    } else if (key === DB_KEYS.CONTRATANTES) {
        const c = getContratante(id);
        if (!c) return;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
        document.getElementById('contratanteCNPJ').value = c.cnpj;
        document.getElementById('contratanteTelefone').value = c.telefone;
        document.getElementById('contratanteId').value = c.cnpj;
        document.querySelector('[data-tab="contratantes"]').click();
    } else if (key === DB_KEYS.ATIVIDADES) {
        const at = getAtividade(id);
        if (!at) return;
        document.getElementById('atividadeNome').value = at.nome;
        document.getElementById('atividadeId').value = at.id;
        document.querySelector('[data-tab="atividades"]').click();
    }
    document.querySelector('.cadastro-form.active').scrollIntoView();
}

window.deleteItem = function(key, id) {
    if (!confirm('CONFIRMA EXCLUSÃO?')) return;
    let arr = loadData(key);
    let idKey = key === DB_KEYS.VEICULOS ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    arr = arr.filter(it => String(it[idKey]) !== String(id));
    saveData(key, arr);
    // Refresh é automático pelo Listener, mas forçamos um alerta
    alert('ITEM EXCLUÍDO.');
}

// =============================================================================
// 11. SUBMISSÃO DE FORMULÁRIOS
// =============================================================================

function setupFormHandlers() {
    const handleSave = (formId, key, builder, idInput, customIdKey) => {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                let arr = loadData(key);
                const obj = builder();
                const oldId = document.getElementById(idInput).value;
                
                let newData;
                if (customIdKey) {
                    newData = arr.filter(x => x[customIdKey] !== oldId && x[customIdKey] !== obj[customIdKey]);
                } else {
                    newData = arr.filter(x => Number(x.id) !== Number(obj.id));
                }
                newData.push(obj);
                saveData(key, newData);
                form.reset();
                document.getElementById(idInput).value = '';
                if(key === DB_KEYS.OPERACOES) {
                    window._operacaoAjudantesTempList = [];
                    renderAjudantesAdicionadosList();
                }
                alert('SALVO COM SUCESSO.');
            });
        }
    };

    handleSave('formMotorista', DB_KEYS.MOTORISTAS, () => ({
        id: document.getElementById('motoristaId').value ? Number(document.getElementById('motoristaId').value) : Date.now(),
        nome: document.getElementById('motoristaNome').value.toUpperCase(),
        documento: document.getElementById('motoristaDocumento').value.toUpperCase(),
        telefone: document.getElementById('motoristaTelefone').value,
        cnh: document.getElementById('motoristaCNH').value.toUpperCase(),
        validadeCNH: document.getElementById('motoristaValidadeCNH').value,
        categoriaCNH: document.getElementById('motoristaCategoriaCNH').value,
        temCurso: document.getElementById('motoristaTemCurso').value === 'sim',
        cursoDescricao: document.getElementById('motoristaCursoDescricao').value.toUpperCase() || '',
        pix: document.getElementById('motoristaPix').value || ''
    }), 'motoristaId');

    handleSave('formVeiculo', DB_KEYS.VEICULOS, () => ({
        placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
        modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
        ano: Number(document.getElementById('veiculoAno').value) || null,
        renavam: document.getElementById('veiculoRenavam').value.toUpperCase() || '',
        chassi: document.getElementById('veiculoChassi').value.toUpperCase() || ''
    }), 'veiculoId', 'placa');

    handleSave('formContratante', DB_KEYS.CONTRATANTES, () => ({
        cnpj: document.getElementById('contratanteCNPJ').value,
        razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
        telefone: document.getElementById('contratanteTelefone').value || ''
    }), 'contratanteId', 'cnpj');

    handleSave('formAjudante', DB_KEYS.AJUDANTES, () => ({
        id: document.getElementById('ajudanteId').value ? Number(document.getElementById('ajudanteId').value) : Date.now(),
        nome: document.getElementById('ajudanteNome').value.toUpperCase(),
        documento: document.getElementById('ajudanteDocumento').value.toUpperCase(),
        telefone: document.getElementById('ajudanteTelefone').value,
        endereco: document.getElementById('ajudanteEndereco').value.toUpperCase() || '',
        pix: document.getElementById('ajudantePix').value || ''
    }), 'ajudanteId');

    handleSave('formAtividade', DB_KEYS.ATIVIDADES, () => ({
        id: document.getElementById('atividadeId').value ? Number(document.getElementById('atividadeId').value) : Date.now(),
        nome: document.getElementById('atividadeNome').value.toUpperCase()
    }), 'atividadeId');

    // MINHA EMPRESA
    const formMinhaEmpresa = document.getElementById('formMinhaEmpresa');
    if (formMinhaEmpresa) {
        formMinhaEmpresa.addEventListener('submit', (e) => {
            e.preventDefault();
            saveData(DB_KEYS.MINHA_EMPRESA, {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            });
            alert('DADOS DA EMPRESA SALVOS.');
        });
    }

    // DESPESA
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS);
            const dataBase = document.getElementById('despesaGeralData').value;
            const veiculoPlaca = document.getElementById('selectVeiculoDespesaGeral').value || null;
            const descricaoBase = document.getElementById('despesaGeralDescricao').value.toUpperCase();
            const valorTotal = Number(document.getElementById('despesaGeralValor').value) || 0;
            const numParcelas = Number(document.getElementById('despesaParcelas').value) || 1;
            const valorParcela = valorTotal / numParcelas;

            for (let i = 0; i < numParcelas; i++) {
                const id = arr.length ? Math.max(...arr.map(d => d.id)) + 1 : 1;
                const dateObj = new Date(dataBase + 'T00:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                arr.push({
                    id: Date.now() + i,
                    data: dateObj.toISOString().split('T')[0],
                    veiculoPlaca,
                    descricao: numParcelas > 1 ? `${descricaoBase} (${i+1}/${numParcelas})` : descricaoBase,
                    valor: Number(valorParcela.toFixed(2))
                });
            }
            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            formDespesa.reset();
            alert('DESPESA(S) SALVA(S).');
        });
    }

    // OPERAÇÕES
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', (e) => {
            e.preventDefault();
            const motId = document.getElementById('selectMotoristaOperacao').value;
            if (motId) window.verificarValidadeCNH(motId);

            let arr = loadData(DB_KEYS.OPERACOES);
            const idHidden = document.getElementById('operacaoId').value;
            
            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
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
                ajudantes: window._operacaoAjudantesTempList.slice()
            };
            
            // Remove se editando
            arr = arr.filter(o => Number(o.id) !== Number(obj.id));
            arr.push(obj);
            
            saveData(DB_KEYS.OPERACOES, arr);
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOperacao.reset();
            document.getElementById('operacaoId').value = '';
            alert('OPERAÇÃO SALVA.');
        });
        
        formOperacao.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
        });
    }

    // RELATÓRIOS
    document.getElementById('formRelatorio')?.addEventListener('submit', window.gerarRelatorio);
}

// =============================================================================
// 12. TABELAS E RENDERIZAÇÃO GLOBAL
// =============================================================================

window.renderOperacaoTable = function() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if(!tbody) return;
    const ops = loadData(DB_KEYS.OPERACOES).sort((a,b) => b.data.localeCompare(a.data));
    
    if(!ops.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">NENHUMA OPERAÇÃO.</td></tr>'; return; }

    tbody.innerHTML = ops.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '-';
        const atv = getAtividade(op.atividadeId)?.nome || '-';
        const custo = (Number(op.comissao)||0) + (Number(op.despesas)||0) + 
                      (op.ajudantes||[]).reduce((a,b)=>a+(Number(b.diaria)||0),0) + 
                      calcularCustoConsumoViagem(op);
        const liq = (Number(op.faturamento)||0) - custo;
        const cor = liq >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

        return `<tr>
            <td>${formatDateBr(op.data)}</td>
            <td>${mot}</td>
            <td>${atv}</td>
            <td>${formatCurrency(op.faturamento)}</td>
            <td style="color:${cor}; font-weight:bold">${formatCurrency(liq)}</td>
            <td>
                <button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-action view-btn" onclick="window.viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button>
                <button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
};

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    const mot = getMotorista(op.motoristaId)?.nome || '-';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    const fat = Number(op.faturamento)||0;
    const adt = Number(op.adiantamento)||0;
    const diesel = calcularCustoConsumoViagem(op);
    const aju = (op.ajudantes||[]).reduce((s,x)=>s+(Number(x.diaria)||0),0);
    const custo = (Number(op.comissao)||0) + (Number(op.despesas)||0) + aju + diesel;
    const lucro = fat - custo;

    const html = `
        <p><strong>DATA:</strong> ${formatDateBr(op.data)}</p>
        <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
        <p><strong>MOTORISTA:</strong> ${mot}</p>
        <p><strong>CLIENTE:</strong> ${cli}</p>
        <hr style="margin:10px 0; border:0; border-top:1px solid #ccc;">
        <p>FATURAMENTO: <strong>${formatCurrency(fat)}</strong></p>
        <p>ADIANTAMENTO: <span style="color:red">${formatCurrency(adt)}</span></p>
        <p>SALDO: <strong>${formatCurrency(fat-adt)}</strong></p>
        <hr style="margin:10px 0; border:0; border-top:1px solid #ccc;">
        <p><strong>CUSTO TOTAL (Est.):</strong> ${formatCurrency(custo)}</p>
        <h3 style="color:${lucro>=0?'green':'red'}">LUCRO: ${formatCurrency(lucro)}</h3>
    `;
    window.openOperationDetails('DETALHES', html);
};

window.renderDespesasTable = function() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b) => b.data.localeCompare(a.data));
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    tbody.innerHTML = ds.length ? ds.map(d => `<tr>
        <td>${formatDateBr(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td>
        <td><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('') : '<tr><td colspan="5">Vazio.</td></tr>';
};

// =============================================================================
// 13. CALENDÁRIO & DASHBOARD
// =============================================================================

let currentDate = new Date();

window.changeMonth = function(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderCalendar(currentDate);
    updateDashboardStats();
};

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    dayNames.forEach(n => grid.innerHTML += `<div class="day-header">${n}</div>`);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="day-cell empty"></div>`;

    const ops = loadData(DB_KEYS.OPERACOES);

    for(let d=1; d<=daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDay = ops.filter(o => o.data === dateStr);
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;

        if (opsDay.length) {
            cell.classList.add('has-operation');
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            cell.appendChild(dot);
            cell.setAttribute('data-date', dateStr);
            cell.addEventListener('click', (e) => showOperationDetails(e.currentTarget.getAttribute('data-date')));
        }
        grid.appendChild(cell);
    }
}

function showOperationDetails(date) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === date);
    if(!ops.length) return;
    let html = ops.map(op => {
        const mot = getMotorista(op.motoristaId)?.nome || '-';
        return `<div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
            <strong>${op.veiculoPlaca}</strong> (${mot})<br>FAT: ${formatCurrency(op.faturamento)}
            <div style="text-align:right"><button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id});window.closeModal()">EDITAR</button></div>
        </div>`;
    }).join('');
    window.openOperationDetails(`DIA ${formatDateBr(date)}`, html);
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const desp = loadData(DB_KEYS.DESPESAS_GERAIS);
    const m = currentDate.getMonth();
    const y = currentDate.getFullYear();

    const opsMes = ops.filter(o => { const d = new Date(o.data+'T00:00:00'); return d.getMonth()===m && d.getFullYear()===y; });
    const fat = opsMes.reduce((a,b) => a + (Number(b.faturamento)||0), 0);
    const custosOp = opsMes.reduce((acc, o) => {
        const diesel = calcularCustoConsumoViagem(o);
        const aju = (o.ajudantes||[]).reduce((s,x)=>s+(Number(x.diaria)||0),0);
        return acc + (Number(o.comissao)||0) + (Number(o.despesas)||0) + aju + diesel;
    }, 0);
    const despGerais = desp.filter(d => { const dt = new Date(d.data+'T00:00:00'); return dt.getMonth()===m && dt.getFullYear()===y; })
                           .reduce((acc, d) => acc + (Number(d.valor)||0), 0);

    document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
    document.getElementById('despesasMes').textContent = formatCurrency(custosOp + despGerais);
    document.getElementById('receitaMes').textContent = formatCurrency(fat - (custosOp + despGerais));
}

// =============================================================================
// 14. RELATÓRIOS (GLOBAL)
// =============================================================================

window.gerarRelatorio = function(e) {
    if(e) e.preventDefault();
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    if(!ini || !fim) return alert('Selecione datas.');
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data >= ini && o.data <= fim);
    
    let rec = 0, cus = 0;
    ops.forEach(o => {
        rec += Number(o.faturamento)||0;
        cus += (Number(o.comissao)||0) + (Number(o.despesas)||0) + calcularCustoConsumoViagem(o);
    });
    
    document.getElementById('reportContent').innerHTML = `
        <h3>Relatório Gerencial</h3>
        <p>${formatDateBr(ini)} a ${formatDateBr(fim)}</p>
        <p>Receita: <strong>${formatCurrency(rec)}</strong></p>
        <p>Custos Op: <strong>${formatCurrency(cus)}</strong></p>
        <h3 style="color:${(rec-cus)>=0?'green':'red'}">Lucro: ${formatCurrency(rec-cus)}</h3>
    `;
    document.getElementById('reportResults').style.display = 'block';
};

// =============================================================================
// 15. INIT (DOM LOAD)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    iniciarSincronizacao(); // Inicia conexão com Firebase

    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-page')).classList.add('active');
        if(b.getAttribute('data-page')==='home') window.changeMonth(0);
        if(b.getAttribute('data-page')==='graficos') window.renderCharts();
    }));

    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));

    const selAj = document.getElementById('selectAjudantesOperacao');
    if(selAj) selAj.addEventListener('change', handleAjudanteSelectionChange);

    setupFormHandlers();
    setupInputFormattingListeners();
    setupReciboListeners();
});

// Funções Extras
window.fullSystemReset = function() { if(confirm('Apagar tudo?')) { set(ref(db), {}).then(()=>location.reload()); } };
window.exportDataBackup = function() { const bk={}; Object.values(DB_KEYS).forEach(k=>bk[k]=loadData(k)); const a=document.createElement('a'); a.href="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(bk)); a.download='backup.json'; a.click(); };
window.importDataBackup = function(e) { const f=e.target.files[0]; const r=new FileReader(); r.onload=(ev)=>{ try{const d=JSON.parse(ev.target.result); Object.keys(d).forEach(k=>saveData(k,d[k])); alert('Ok');}catch(x){alert('Erro');}}; if(f)r.readAsText(f); };

// Gráfico
window.renderCharts = function() {
    if(typeof Chart === 'undefined') return;
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    if(window.myChart) window.myChart.destroy();
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const labels = [], dataF = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth()-i);
        labels.push(`${d.getMonth()+1}/${d.getFullYear()}`);
        const om = ops.filter(o => { const x = new Date(o.data+'T00:00:00'); return x.getMonth()===d.getMonth() && x.getFullYear()===d.getFullYear(); });
        dataF.push(om.reduce((a,b)=>a+(Number(b.faturamento)||0),0));
    }
    window.myChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Faturamento', data: dataF, backgroundColor: '#00796b' }] } });
};