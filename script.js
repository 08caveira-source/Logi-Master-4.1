/**
 * SCRIPT.JS - VERSÃO INTEGRADA (FIREBASE + SEU CÓDIGO ORIGINAL)
 * Sincronização em Tempo Real (PC <-> Celular)
 */

// =============================================================================
// 1. IMPORTAÇÃO E CONFIGURAÇÃO DO FIREBASE
// =============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// SUAS CHAVES REAIS (Extraídas do seu Print)
const firebaseConfig = {
    apiKey: "AIzaSyAyTMFwAyWgNEy5Rqwan7FrA547IPGvIvY",
    authDomain: "logimaster-72a29.firebaseapp.com",
    databaseURL: "https://logimaster-72a29-default-rtdb.firebaseio.com",
    projectId: "logimaster-72a29",
    storageBucket: "logimaster-72a29.firebasestorage.app",
    messagingSenderId: "380606262384",
    appId: "1:380606262384:web:e0780179f3bf32973498b5",
    measurementId: "G-29M9SE4P7D"
};

// Inicializa o App
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Cache Local (Substitui o comportamento síncrono do localStorage)
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
// 2. FUNÇÕES DE DADOS (NUVEM + CACHE)
// =============================================================================

// Salva na Nuvem (Substitui localStorage.setItem)
function saveData(key, value) {
    // 1. Atualiza cache local imediatamente
    window.DB_CACHE[key] = value;
    // 2. Envia para o Google Firebase
    set(ref(db, key), value)
        .then(() => console.log("Sincronizado: " + key))
        .catch(e => alert("Erro ao salvar na nuvem: " + e.message));
}

// Lê do Cache (que é mantido atualizado pelo Firebase)
function loadData(key) {
    return window.DB_CACHE[key] || (key === DB_KEYS.MINHA_EMPRESA ? {} : []);
}

// SINCRONIZAÇÃO EM TEMPO REAL (Ouvinte)
function iniciarSincronizacao() {
    console.log("Conectando ao Firebase...");
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
        } else {
            // Se for o primeiro acesso e o banco estiver vazio, inicializa Mocks
            inicializarMocksSeVazio();
        }
    }, (error) => {
        console.error("Erro de conexão:", error);
    });
}

// Função para atualizar toda a tela sem recarregar (F5)
function refreshUI() {
    populateAllSelects();
    if(window.changeMonth) window.changeMonth(0); // Atualiza calendário
    if(typeof renderOperacaoTable === 'function') renderOperacaoTable();
    if(typeof renderDespesasTable === 'function') renderDespesasTable();
    if(typeof updateDashboardStats === 'function') updateDashboardStats();
    if(typeof renderCharts === 'function') renderCharts();
}

function inicializarMocksSeVazio() {
    // Se o banco estiver vazio, salva os arrays vazios para criar a estrutura
    if (!loadData(DB_KEYS.MOTORISTAS).length) saveData(DB_KEYS.MOTORISTAS, []);
    if (!loadData(DB_KEYS.VEICULOS).length) saveData(DB_KEYS.VEICULOS, []);
    if (!loadData(DB_KEYS.CONTRATANTES).length) saveData(DB_KEYS.CONTRATANTES, []);
    if (!loadData(DB_KEYS.AJUDANTES).length) saveData(DB_KEYS.AJUDANTES, []);
    if (!loadData(DB_KEYS.OPERACOES).length) saveData(DB_KEYS.OPERACOES, []);
    if (!loadData(DB_KEYS.DESPESAS_GERAIS).length) saveData(DB_KEYS.DESPESAS_GERAIS, []);
    if (!Object.keys(loadData(DB_KEYS.MINHA_EMPRESA)).length) saveData(DB_KEYS.MINHA_EMPRESA, {});
    if (!loadData(DB_KEYS.ATIVIDADES).length) saveData(DB_KEYS.ATIVIDADES, []);
}

// =============================================================================
// 3. CÓDIGO ORIGINAL DO USUÁRIO (CONFIGURAÇÕES E UTILITÁRIOS)
// =============================================================================

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

const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

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
    const opsComPreco = todasOps.filter(op => op && op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0);
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
// 6. FORMATADORES
// =============================================================================

function formatCPF_CNPJ(value) {
    const digits = onlyDigits(value);
    if (digits.length <= 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m, a, b, c, d) => {
            if (!d) return `${a}.${b}.${c}`; return `${a}.${b}.${c}-${d}`;
        });
    } else {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (m, a, b, c, d, e) => {
            if (!e) return `${a}.${b}.${c}/${d}`; return `${a}.${b}.${c}/${d}-${e}`;
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
        if (!silent) alert('COPIADO!');
    }, () => alert('FALHA AO COPIAR.'));
}

// =============================================================================
// 7. VALIDAÇÕES E UI
// =============================================================================

function verificarValidadeCNH(motoristaId) {
    const m = getMotorista(motoristaId);
    if (!m || !m.validadeCNH) return;
    const validade = new Date(m.validadeCNH + 'T00:00:00');
    const hoje = new Date();
    const diffTime = validade - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) alert(`ATENÇÃO: A CNH DO MOTORISTA ${m.nome} VENCEU!`);
    else if (diffDays <= 30) alert(`ATENÇÃO: A CNH VAI VENCER EM BREVE.`);
}

window.toggleCursoInput = function() {
    const val = document.getElementById('motoristaTemCurso').value;
    const div = document.getElementById('divCursoDescricao');
    if (div) div.style.display = val === 'sim' ? 'flex' : 'none';
};

// Funções Globais para Modais
window.closeViewModal = () => document.getElementById('viewItemModal').style.display = 'none';
window.closeModal = () => document.getElementById('operationDetailsModal').style.display = 'none';

window.openViewModal = function(title, htmlContent) {
    const modal = document.getElementById('viewItemModal');
    document.getElementById('viewItemTitle').textContent = title.toUpperCase();
    document.getElementById('viewItemBody').innerHTML = htmlContent;
    modal.style.display = 'block';
};

window.openOperationDetails = function(title, htmlContent) {
    const modal = document.getElementById('operationDetailsModal');
    document.getElementById('modalTitle').textContent = title.toUpperCase();
    document.getElementById('modalBodyContent').innerHTML = htmlContent;
    modal.style.display = 'block';
};

// =============================================================================
// 8. LÓGICA DE AJUDANTES
// =============================================================================

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

window._operacaoAjudantesTempList = [];

function handleAjudanteSelectionChange() {
    const sel = document.getElementById('selectAjudantesOperacao');
    if (!sel || !sel.value) return;
    const id = Number(sel.value);
    const already = (window._operacaoAjudantesTempList || []).some(a => Number(a.id) === id);
    if (already) {
        alert('ESTE AJUDANTE JÁ FOI ADICIONADO.');
        sel.value = "";
        return;
    }
    const ajud = getAjudante(id);
    if (!ajud) return;
    window.openAdicionarAjudanteModal(ajud, (result) => {
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
        list.innerHTML = '<li style="color:var(--secondary-color)">NENHUM AJUDANTE.</li>';
        return;
    }
    const html = arr.map(a => {
        const ajud = getAjudante(a.id) || {};
        return `<li>${ajud.nome || 'ID:'+a.id} — R$ ${formatCurrency(Number(a.diaria)||0)} <button class="btn-mini" style="margin-left:8px;" onclick="window.removeAjudanteFromOperation(${a.id})"><i class="fas fa-trash"></i></button></li>`;
    }).join('');
    list.innerHTML = html;
}

window.removeAjudanteFromOperation = function(id) {
    window._operacaoAjudantesTempList = (window._operacaoAjudantesTempList || []).filter(a => Number(a.id) !== Number(id));
    renderAjudantesAdicionadosList();
};

// =============================================================================
// 9. POPULATE SELECTS E TABELAS
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

    populateSelect('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE...');
    populateSelect('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE...');
    populateSelect('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE...');
    populateSelect('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE...');
    populateSelect('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');
    populateSelect('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'SELECIONE...');

    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = `<option value="">SELECIONE...</option>`;
        motoristas.forEach(m => selRecibo.innerHTML += `<option value="motorista:${m.id}">MOTORISTA - ${m.nome}</option>`);
        ajudantes.forEach(a => selRecibo.innerHTML += `<option value="ajudante:${a.id}">AJUDANTE - ${a.nome}</option>`);
    }
    
    populateSelect('selectVeiculoRecibo', veiculos, 'placa', 'placa', 'TODOS');
    populateSelect('selectContratanteRecibo', contratantes, 'cnpj', 'razaoSocial', 'TODAS');
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
        div.innerHTML = `<p><strong>${emp.razaoSocial}</strong><br>CNPJ: ${formatCPF_CNPJ(emp.cnpj)}<br>${emp.telefone || ''}</p>`;
    } else div.innerHTML = `<p style="color:var(--secondary-color);">NENHUM DADO.</p>`;
}

// =============================================================================
// 10. CRUD GENÉRICO
// =============================================================================

function renderCadastroTable(key) {
    const data = loadData(key);
    let tabela, idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';

    if (key === DB_KEYS.MOTORISTAS) tabela = document.getElementById('tabelaMotoristas');
    else if (key === DB_KEYS.AJUDANTES) tabela = document.getElementById('tabelaAjudantes');
    else if (key === DB_KEYS.VEICULOS) tabela = document.getElementById('tabelaVeiculos');
    else if (key === DB_KEYS.CONTRATANTES) tabela = document.getElementById('tabelaContratantes');
    else if (key === DB_KEYS.ATIVIDADES) tabela = document.getElementById('tabelaAtividades');

    if(!tabela) return;

    let rowsHtml = '';
    data.forEach(item => {
        let col1 = item.id || item.placa || formatCPF_CNPJ(item.cnpj);
        let col2 = item.nome || item.modelo || item.razaoSocial;
        let col3 = item.documento || item.ano || item.telefone || '';
        if (key === DB_KEYS.ATIVIDADES) { col1 = item.id; col2 = item.nome; col3 = ''; }
        
        rowsHtml += `<tr><td>${col1}</td><td>${col2}</td>${col3 !== '' ? `<td>${col3}</td>` : ''}<td><button class="btn-action view-btn" onclick="window.viewCadastro('${key}', '${item[idKey]}')"><i class="fas fa-eye"></i></button><button class="btn-action edit-btn" onclick="window.editCadastroItem('${key}', '${item[idKey]}')"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="window.deleteItem('${key}', '${item[idKey]}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    if (tabela.querySelector('tbody')) tabela.querySelector('tbody').innerHTML = rowsHtml || `<tr><td colspan="10" style="text-align:center;">VAZIO</td></tr>`;
}

window.viewCadastro = function(key, id) {
    let item = null;
    if (key === DB_KEYS.MOTORISTAS) item = getMotorista(id);
    if (key === DB_KEYS.AJUDANTES) item = getAjudante(id);
    if (key === DB_KEYS.VEICULOS) item = getVeiculo(id);
    if (key === DB_KEYS.CONTRATANTES) item = getContratante(id);
    if (!item) return alert('REGISTRO NÃO ENCONTRADO.');
    let html = '<div style="line-height:1.6;">';
    Object.keys(item).forEach(k => html += `<p><strong>${k.toUpperCase()}:</strong> ${item[k]}</p>`);
    html += '</div>';
    window.openViewModal('VISUALIZAR', html);
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
}

// =============================================================================
// 11. FORM HANDLERS
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
                if (customIdKey) newData = arr.filter(x => x[customIdKey] !== oldId && x[customIdKey] !== obj[customIdKey]);
                else newData = arr.filter(x => Number(x.id) !== Number(obj.id));
                newData.push(obj);
                saveData(key, newData);
                form.reset();
                document.getElementById(idInput).value = '';
                alert('SALVO.');
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

    const formEmp = document.getElementById('formMinhaEmpresa');
    if (formEmp) {
        formEmp.addEventListener('submit', (e) => {
            e.preventDefault();
            saveData(DB_KEYS.MINHA_EMPRESA, {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            });
            alert('SALVO.');
        });
    }

    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            let arr = loadData(DB_KEYS.DESPESAS_GERAIS);
            const dt = document.getElementById('despesaGeralData').value;
            const placa = document.getElementById('selectVeiculoDespesaGeral').value || null;
            const desc = document.getElementById('despesaGeralDescricao').value.toUpperCase();
            const val = Number(document.getElementById('despesaGeralValor').value) || 0;
            const parc = Number(document.getElementById('despesaParcelas').value) || 1;
            const valParc = val / parc;

            for (let i = 0; i < parc; i++) {
                const dateObj = new Date(dt + 'T00:00:00');
                dateObj.setMonth(dateObj.getMonth() + i);
                arr.push({
                    id: Date.now() + i,
                    data: dateObj.toISOString().split('T')[0],
                    veiculoPlaca: placa,
                    descricao: parc > 1 ? `${desc} (${i+1}/${parc})` : desc,
                    valor: Number(valParc.toFixed(2))
                });
            }
            saveData(DB_KEYS.DESPESAS_GERAIS, arr);
            formDespesa.reset();
            alert('SALVO.');
        });
    }

    const formOp = document.getElementById('formOperacao');
    if (formOp) {
        formOp.addEventListener('submit', (e) => {
            e.preventDefault();
            const motId = document.getElementById('selectMotoristaOperacao').value;
            if (motId) verificarValidadeCNH(motId);

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
                comissao: document.getElementById('operacaoComissao').value ? Number(document.getElementById('operacaoComissao').value) : 0,
                combustivel: Number(document.getElementById('operacaoCombustivel').value) || 0,
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value) || 0,
                despesas: Number(document.getElementById('operacaoDespesas').value) || 0,
                kmRodado: Number(document.getElementById('operacaoKmRodado').value) || 0,
                ajudantes: window._operacaoAjudantesTempList.slice()
            };
            
            arr = arr.filter(o => Number(o.id) !== Number(obj.id));
            arr.push(obj);
            saveData(DB_KEYS.OPERACOES, arr);
            
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
            formOp.reset();
            document.getElementById('operacaoId').value = '';
            alert('SALVO.');
        });
        
        formOp.addEventListener('reset', () => {
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            document.getElementById('listaAjudantesAdicionados').innerHTML = '';
        });
    }

    const formRel = document.getElementById('formRelatorio');
    if (formRel) formRel.addEventListener('submit', gerarRelatorio);
}

// =============================================================================
// 12. TABELA DE OPERAÇÕES E VISUALIZAÇÃO
// =============================================================================

window.renderOperacaoTable = function() {
    const ops = loadData(DB_KEYS.OPERACOES).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ops.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">VAZIO</td></tr>';
        return;
    }
    let rows = '';
    ops.forEach(op => {
        const mot = getMotorista(op.motoristaId)?.nome || 'N/A';
        const atv = getAtividade(op.atividadeId)?.nome || 'N/A';
        const custoD = calcularCustoConsumoViagem(op) || 0;
        const totalAju = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
        const custos = (op.comissao || 0) + totalAju + (op.despesas || 0) + custoD;
        const liq = (op.faturamento || 0) - custos;
        const dataFmt = new Date(op.data + 'T00:00:00').toLocaleDateString('pt-BR');
        rows += `<tr><td>${dataFmt}</td><td>${mot}</td><td>${atv}</td><td>${formatCurrency(op.faturamento)}</td><td style="color:${liq>=0?'#4caf50':'#f44336'}">${formatCurrency(liq)}</td><td><button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id})"><i class="fas fa-edit"></i></button><button class="btn-action view-btn" onclick="window.viewOperacaoDetails(${op.id})"><i class="fas fa-eye"></i></button><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.OPERACOES}', ${op.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

window.viewOperacaoDetails = function(id) {
    const op = loadData(DB_KEYS.OPERACOES).find(o => o.id === id);
    if (!op) return;
    const mot = getMotorista(op.motoristaId)?.nome || 'N/A';
    const cli = getContratante(op.contratanteCNPJ)?.razaoSocial || op.contratanteCNPJ;
    const atv = getAtividade(op.atividadeId)?.nome || 'N/A';
    const totalAju = (op.ajudantes || []).reduce((s, a) => s + (Number(a.diaria) || 0), 0);
    const mediaKmL = calcularMediaHistoricaVeiculo(op.veiculoPlaca) || 0;
    const custoD = calcularCustoConsumoViagem(op) || 0;
    const custos = (op.comissao || 0) + totalAju + (op.despesas || 0) + custoD;
    const liq = (op.faturamento || 0) - custos;
    const adt = op.adiantamento || 0;
    const saldo = (op.faturamento || 0) - adt;

    const html = `<div><p><strong>MOTORISTA:</strong> ${mot}</p><p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p><p><strong>CONTRATANTE:</strong> ${cli}</p><p><strong>KM:</strong> ${op.kmRodado || 0}</p><p><strong>FATURAMENTO:</strong> ${formatCurrency(op.faturamento)}</p><p><strong>ADIANTAMENTO:</strong> ${formatCurrency(adt)}</p><p style="font-weight:700;">SALDO: ${formatCurrency(saldo)}</p><hr><p>CUSTO TOTAL (Est): ${formatCurrency(custos)}</p><p style="font-weight:700;color:${liq>=0?'#4caf50':'#f44336'}">LUCRO: ${formatCurrency(liq)}</p></div>`;
    window.openOperationDetails('DETALHES', html);
}

window.renderDespesasTable = function() {
    const ds = loadData(DB_KEYS.DESPESAS_GERAIS).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela || !tabela.querySelector('tbody')) return;
    if (!ds.length) {
        tabela.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;">VAZIO</td></tr>';
        return;
    }
    let rows = '';
    ds.forEach(d => {
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR');
        rows += `<tr><td>${dataFmt}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatCurrency(d.valor)}</td><td><button class="btn-action edit-btn" onclick="window.editDespesaItem(${d.id})"><i class="fas fa-edit"></i></button><button class="btn-action delete-btn" onclick="window.deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tabela.querySelector('tbody').innerHTML = rows;
}

window.editDespesaItem = function(id) {
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).find(x => x.id === id);
    if (!d) return;
    document.getElementById('despesaGeralId').value = d.id;
    document.getElementById('despesaGeralData').value = d.data;
    document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoPlaca || '';
    document.getElementById('despesaGeralDescricao').value = d.descricao;
    document.getElementById('despesaGeralValor').value = d.valor;
    window.location.hash = '#despesas';
}

// =============================================================================
// 13. CALENDÁRIO E DASHBOARD
// =============================================================================

let currentDate = new Date();
const calendarGrid = document.getElementById('calendarGrid');
const currentMonthYear = document.getElementById('currentMonthYear');

window.changeMonth = function(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate);
    updateDashboardStats();
}

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthYear.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';
    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    dayNames.forEach(n => {
        const h = document.createElement('div');
        h.classList.add('day-header');
        h.textContent = n;
        calendarGrid.appendChild(h);
    });
    const firstDay = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div');
        e.classList.add('day-cell', 'empty');
        calendarGrid.appendChild(e);
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        cell.textContent = d;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDay = ops.filter(op => op.data === dateStr);
        if (opsDay.length) {
            cell.classList.add('has-operation');
            const dot = document.createElement('div');
            dot.classList.add('event-dot');
            cell.appendChild(dot);
            cell.setAttribute('data-date', dateStr);
            cell.addEventListener('click', (e) => window.showOperationDetails(e.currentTarget.getAttribute('data-date')));
        }
        calendarGrid.appendChild(cell);
    }
}

window.showOperationDetails = function(date) {
    const ops = loadData(DB_KEYS.OPERACOES).filter(op => op.data === date);
    if (!ops.length) return;
    const modalTitle = `DETALHES ${new Date(date+'T00:00:00').toLocaleDateString('pt-BR')}`;
    let html = '';
    ops.forEach(op => {
        const mot = getMotorista(op.motoristaId)?.nome || 'N/A';
        html += `<div class="card" style="margin-bottom:10px;"><p><strong>${mot}</strong> - ${op.veiculoPlaca}</p><p>FAT: ${formatCurrency(op.faturamento)}</p><button class="btn-action edit-btn" onclick="window.editOperacaoItem(${op.id});window.closeModal()">EDITAR</button></div>`;
    });
    window.openOperationDetails(modalTitle, html);
}

function updateDashboardStats() {
    const ops = loadData(DB_KEYS.OPERACOES);
    const despesas = loadData(DB_KEYS.DESPESAS_GERAIS);
    const mes = currentDate.getMonth();
    const ano = currentDate.getFullYear();
    const opsMes = ops.filter(op => { const d = new Date(op.data+'T00:00:00'); return d.getMonth()===mes && d.getFullYear()===ano; });
    const despMes = despesas.filter(d => { const dt = new Date(d.data+'T00:00:00'); return dt.getMonth()===mes && dt.getFullYear()===ano; });

    const fat = opsMes.reduce((s,o)=>s+(Number(o.faturamento)||0),0);
    const custosOp = opsMes.reduce((s,o) => {
        const aju = (o.ajudantes||[]).reduce((x,a)=>x+(Number(a.diaria)||0),0);
        const dies = calcularCustoConsumoViagem(o)||0;
        return s+(Number(o.comissao)||0)+(Number(o.despesas)||0)+aju+dies;
    },0);
    const custoGeral = despMes.reduce((s,d)=>s+(Number(d.valor)||0),0);
    const totalCusto = custosOp + custoGeral;

    document.getElementById('faturamentoMes').textContent = formatCurrency(fat);
    document.getElementById('despesasMes').textContent = formatCurrency(totalCusto);
    document.getElementById('receitaMes').textContent = formatCurrency(fat - totalCusto);
}

// =============================================================================
// 14. GRÁFICOS
// =============================================================================

function renderCharts() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
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
}

// =============================================================================
// 15. RELATÓRIOS
// =============================================================================

function gerarRelatorio(e) {
    e.preventDefault();
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    if(!ini || !fim) return alert('Selecione Datas.');
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
}

window.gerarRelatorioCobranca = function() {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const cnpj = document.getElementById('selectContratanteRelatorio').value;
    if(!ini || !fim || !cnpj) return alert('Selecione Filtros.');
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data >= ini && o.data <= fim && o.contratanteCNPJ === cnpj);
    if(!ops.length) return alert('Nada encontrado.');
    let total = 0;
    const rows = ops.map(o => {
        const s = (Number(o.faturamento)||0) - (Number(o.adiantamento)||0);
        total += s;
        return `<tr><td>${formatDateBr(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatCurrency(o.faturamento)}</td><td style="color:red">${formatCurrency(o.adiantamento)}</td><td><strong>${formatCurrency(s)}</strong></td></tr>`;
    }).join('');
    document.getElementById('reportContent').innerHTML = `<h3>Relatório Cobrança</h3><p>${formatDateBr(ini)} a ${formatDateBr(fim)}</p><table style="width:100%" border="1">${rows}</table><h3 style="text-align:right">Total: ${formatCurrency(total)}</h3>`;
    document.getElementById('reportResults').style.display = 'block';
}

window.exportReportToPDF = function() {
    const el = document.getElementById('reportContent');
    html2pdf().from(el).save('relatorio.pdf');
}

// =============================================================================
// 16. INIT
// =============================================================================

function setupInputFormattingListeners() {
    const ids = ['minhaEmpresaCNPJ', 'contratanteCNPJ'];
    ids.forEach(id => document.getElementById(id)?.addEventListener('blur', e => e.target.value = formatCPF_CNPJ(e.target.value)));
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarSincronizacao(); // FIREBASE START

    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-page')).classList.add('active');
        if(b.getAttribute('data-page')==='home') window.changeMonth(0);
        if(b.getAttribute('data-page')==='graficos') renderCharts();
    }));

    document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.getAttribute('data-tab')).classList.add('active');
    }));

    document.getElementById('selectAjudantesOperacao')?.addEventListener('change', handleAjudanteSelectionChange);
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

    setupFormHandlers();
    setupInputFormattingListeners();
    setupReciboListeners();
});

// Class para Recibo
class ConverterMoeda {
    constructor(v) { this.v = v; }
    getExtenso() { return `${this.v.toFixed(2)} REAIS`; }
}

// Recibo Listeners
function setupReciboListeners() {
    document.getElementById('btnGerarRecibo')?.addEventListener('click', () => {
        // Lógica simplificada de geração visual do recibo
        const html = `<div class="recibo-template"><h3>RECIBO</h3><p>Valor: ${formatCurrency(100)}</p></div>`;
        document.getElementById('reciboContent').innerHTML = html;
        document.getElementById('reciboTitle').style.display = 'block';
        document.getElementById('btnBaixarRecibo').style.display = 'inline-block';
    });
}

// Funções de Backup
window.exportDataBackup = function() {
    const data = {}; Object.values(DB_KEYS).forEach(k => data[k] = loadData(k));
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    a.download = `backup.json`; a.click();
}
window.importDataBackup = function(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try{ const d = JSON.parse(ev.target.result); Object.keys(d).forEach(k=>saveData(k, d[k])); alert('Importado!'); } catch(err){alert('Erro');} };
    r.readAsText(f);
}
window.fullSystemReset = function() { if(confirm('Apagar tudo?')) set(ref(db), {}).then(()=>window.location.reload()); }

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
    alert('CARREGADO. ALTERE E SALVE.');
};