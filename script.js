// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (CORREÇÃO DE INICIALIZAÇÃO)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
// -----------------------------------------------------------------------------
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// -----------------------------------------------------------------------------
// Lista de e-mails com permissão de Super Admin (Master)
const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// Variáveis de controle de sessão e interface
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// Status do Sistema (Controle de Licença)
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Mantém dados na RAM para performance)
// -----------------------------------------------------------------------------
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// -----------------------------------------------------------------------------
// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS)
// -----------------------------------------------------------------------------

// Formata valor monetário (R$ 1.000,00)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Formata data ISO (YYYY-MM-DD) para Brasileiro (DD/MM/AAAA)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    var partes = dataIso.split('T')[0].split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

// Formata telefone (XX) XXXXX-XXXX
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// Remove acentos para facilitar buscas
function removerAcentos(texto) {
    if(!texto) return "";
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Limpa objetos para salvar no Firebase (remove undefined)
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// -----------------------------------------------------------------------------
// 5. SINCRONIZAÇÃO DE DADOS (NUVEM <-> LOCAL)
// -----------------------------------------------------------------------------

// Baixa todos os dados ao iniciar
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Modo Offline ou Sem Empresa. Usando dados locais.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função interna para baixar uma coleção específica
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Verifica se é objeto único (Empresa) ou Lista (Outros)
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(data.items || []);
                }
                // Salva backup local
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]);
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave}:`, e);
        }
    }

    // Executa todos os downloads em paralelo
    await Promise.all([
        baixarColecao(CHAVE_DB_FUNCIONARIOS, (d) => CACHE_FUNCIONARIOS = d),
        baixarColecao(CHAVE_DB_VEICULOS, (d) => CACHE_VEICULOS = d),
        baixarColecao(CHAVE_DB_CONTRATANTES, (d) => CACHE_CONTRATANTES = d),
        baixarColecao(CHAVE_DB_OPERACOES, (d) => CACHE_OPERACOES = d),
        baixarColecao(CHAVE_DB_MINHA_EMPRESA, (d) => CACHE_MINHA_EMPRESA = d),
        baixarColecao(CHAVE_DB_DESPESAS, (d) => CACHE_DESPESAS = d),
        baixarColecao(CHAVE_DB_ATIVIDADES, (d) => CACHE_ATIVIDADES = d),
        baixarColecao(CHAVE_DB_PROFILE_REQUESTS, (d) => CACHE_PROFILE_REQUESTS = d),
        baixarColecao(CHAVE_DB_RECIBOS, (d) => CACHE_RECIBOS = d)
    ]);

    console.log(">>> SINCRONIA CONCLUÍDA.");
}

// Carrega dados locais se estiver offline
function carregarTodosDadosLocais() {
    function load(k) { 
        try { return JSON.parse(localStorage.getItem(k)) || []; } catch(e){ return []; } 
    }
    CACHE_FUNCIONARIOS = load(CHAVE_DB_FUNCIONARIOS);
    CACHE_VEICULOS = load(CHAVE_DB_VEICULOS);
    CACHE_CONTRATANTES = load(CHAVE_DB_CONTRATANTES);
    CACHE_OPERACOES = load(CHAVE_DB_OPERACOES);
    CACHE_MINHA_EMPRESA = JSON.parse(localStorage.getItem(CHAVE_DB_MINHA_EMPRESA)) || {};
    CACHE_DESPESAS = load(CHAVE_DB_DESPESAS);
    CACHE_ATIVIDADES = load(CHAVE_DB_ATIVIDADES);
    CACHE_PROFILE_REQUESTS = load(CHAVE_DB_PROFILE_REQUESTS);
    CACHE_RECIBOS = load(CHAVE_DB_RECIBOS);
}

// Função Genérica de Salvamento
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória
    atualizarCacheCallback(dados);
    // 2. Atualiza LocalStorage
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 3. Atualiza Firebase (se online e ativo)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') return;

        const { db, doc, setDoc } = window.dbRef;
        try {
            var payload = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), payload);
        } catch (erro) {
            console.error("Erro Firebase:", erro);
        }
    }
}

// Atalhos para salvar cada tipo de dado
async function salvarListaFuncionarios(l) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, l, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(l) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, l, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(l) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, l, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(l) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, l, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(d) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, d, (v) => CACHE_MINHA_EMPRESA = v); }
async function salvarListaDespesas(l) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, l, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(l) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, l, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(l) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, l, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(l) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, l, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas Rápidas (Helpers)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO (LÓGICA FINANCEIRA CORRIGIDA)
// =============================================================================

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES DO DASHBOARD
// -----------------------------------------------------------------------------

window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    if (targets.length === 0) return;
    const isBlurred = targets[0].classList.contains('privacy-blur');
    targets.forEach(el => {
        if (isBlurred) el.classList.remove('privacy-blur');
        else el.classList.add('privacy-blur');
    });
    if (icon) icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
};

// -----------------------------------------------------------------------------
// CÁLCULOS FINANCEIROS AVANÇADOS
// -----------------------------------------------------------------------------

window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
    });
    if (ops.length === 0) return 0;
    var totalKm = 0; var totalLitros = 0;
    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0; var valorAbastecido = Number(op.combustivel) || 0; var precoLitro = Number(op.precoLitro) || 0;
        if (km > 0 && valorAbastecido > 0 && precoLitro > 0) {
            totalKm += km; totalLitros += (valorAbastecido / precoLitro);
        }
    });
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) { return o.veiculoPlaca === placa && Number(o.precoLitro) > 0; });
    if (ops.length === 0) return 6.00;
    var ultimas = ops.slice(-5);
    var somaPrecos = ultimas.reduce(function(acc, curr) { return acc + Number(curr.precoLitro); }, 0);
    return somaPrecos / ultimas.length;
};

window.calcularCustoCombustivelOperacao = function(op) {
    if (!op.kmRodado || op.kmRodado <= 0) return Number(op.combustivel) || 0; 
    if (!op.veiculoPlaca) return Number(op.combustivel) || 0;
    var mediaConsumo = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    if (mediaConsumo <= 0) return Number(op.combustivel) || 0;
    var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    return (op.kmRodado / mediaConsumo) * precoLitro;
};

// -----------------------------------------------------------------------------
// LÓGICA CENTRAL DO DASHBOARD
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    // Não executa se for Super Admin
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();
    var faturamentoMes = 0; var custosMes = 0; var receitaHistorico = 0;
    
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        var valorFat = Number(op.faturamento) || 0;
        var custoCombustivelCalculado = window.calcularCustoCombustivelOperacao(op);
        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        if (!op.checkins || !op.checkins.faltaMotorista) custoOp += (Number(op.comissao) || 0);
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                if (!op.checkins || !op.checkins.faltas || !op.checkins.faltas[aj.id]) custoOp += (Number(aj.diaria) || 0);
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') receitaHistorico += valorFat;

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat; custosMes += custoOp;
        }
    });

    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var valorParcela = valorTotal / Number(desp.parcelasTotal);
            for (var i = 0; i < desp.parcelasTotal; i++) {
                var dt = new Date(dataDesp); dt.setDate(dt.getDate() + (i * 30));
                if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) custosMes += valorParcela;
            }
        } else {
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) custosMes += valorTotal;
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    if (document.getElementById('faturamentoMes')) {
        document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoMes);
        document.getElementById('despesasMes').textContent = formatarValorMoeda(custosMes);
        document.getElementById('receitaMes').textContent = formatarValorMoeda(lucroMes);
        document.getElementById('receitaTotalHistorico').textContent = formatarValorMoeda(receitaHistorico);
        document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    }
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var ctx = document.getElementById('mainChart'); if (!ctx) return; 
    var fV = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var fM = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    var sumCont = document.getElementById('chartVehicleSummaryContainer');

    var stats = { faturamento: 0, custos: 0, lucro: 0, viagens: 0, faltas: 0, kmTotal: 0, litrosTotal: 0 };
    var gReceita = 0; var gCombustivel = 0; var gPessoal = 0; var gManutencao = 0; 

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (fV && op.veiculoPlaca !== fV) return;
        if (fM && op.motoristaId !== fM) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            if (fM && op.checkins && op.checkins.faltaMotorista) stats.faltas++;
            var rec = Number(op.faturamento) || 0;
            var comb = window.calcularCustoCombustivelOperacao(op);
            var desp = Number(op.despesas) || 0; 
            var com = 0;
            if (!op.checkins || !op.checkins.faltaMotorista) com = Number(op.comissao) || 0;
            if (op.ajudantes) op.ajudantes.forEach(aj => { if (!op.checkins?.faltas?.[aj.id]) com += (Number(aj.diaria)||0); });

            stats.viagens++; stats.faturamento += rec; stats.custos += (comb + desp + com); stats.kmTotal += (Number(op.kmRodado) || 0);
            gReceita += rec; gCombustivel += comb; gPessoal += com; gManutencao += desp; 

            var pReal = Number(op.precoLitro) || 0;
            if (pReal > 0 && Number(op.combustivel) > 0) stats.litrosTotal += (Number(op.combustivel) / pReal);
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (fV && d.veiculoPlaca && d.veiculoPlaca !== fV) return;
        var val = 0; var dt = new Date(d.data + 'T12:00:00');
        if (d.modoPagamento === 'parcelado') {
            var vp = (Number(d.valor) || 0) / Number(d.parcelasTotal);
            for (var i = 0; i < d.parcelasTotal; i++) {
                var pDt = new Date(dt); pDt.setDate(pDt.getDate() + (i * 30));
                if (pDt.getMonth() === mes && pDt.getFullYear() === ano) val += vp;
            }
        } else {
            if (dt.getMonth() === mes && dt.getFullYear() === ano) val = (Number(d.valor) || 0);
        }
        if (val > 0) {
            stats.custos += val;
            var t = removerAcentos(d.descricao || "");
            if (t.includes("manutencao") || t.includes("peca")) gManutencao += val;
            else if (t.includes("salario") || t.includes("alimen")) gPessoal += val;
            else gManutencao += val;
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    if (sumCont) {
        sumCont.innerHTML = ''; 
        if (fV || fM) {
            var tBox = fV ? "VEÍCULO" : "MOTORISTA";
            var vTit = fV || (CACHE_FUNCIONARIOS.find(f => f.id == fM)?.nome || "Desconhecido");
            var lblExtra = fM ? "FALTAS" : "MÉDIA REAL";
            var valExtra = fM ? (stats.faltas + " Faltas") : ((stats.litrosTotal > 0 ? (stats.kmTotal / stats.litrosTotal).toFixed(2) : "0") + " Km/L");
            sumCont.innerHTML = `<div id="chartVehicleSummary"><div class="veh-stat-box"><small>${tBox}</small><span>${vTit}</span></div><div class="veh-stat-box"><small>VIAGENS</small><span>${stats.viagens}</span></div><div class="veh-stat-box"><small>FATURAMENTO</small><span style="color:var(--success-color)">${formatarValorMoeda(stats.faturamento)}</span></div><div class="veh-stat-box"><small>${lblExtra}</small><span style="color:var(--primary-color)">${valExtra}</span></div><div class="veh-stat-box"><small>LUCRO EST.</small><span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span></div></div>`;
        }
    }

    if (window.chartInstance) window.chartInstance.destroy();
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'R$', data: [gReceita, gCombustivel, gPessoal, gManutencao, (gReceita - (gCombustivel+gPessoal+gManutencao))],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// -----------------------------------------------------------------------------
// 6. CALENDÁRIO OPERACIONAL (CORRIGIDO)
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    // Garante que existe uma data válida
    if (!window.currentDate) window.currentDate = new Date();

    grid.innerHTML = ''; 
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); 
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDiaSemana; i++) {
        var e = document.createElement('div');
        e.className = 'day-cell empty';
        grid.appendChild(e);
    }

    for (var d = 1; d <= diasNoMes; d++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        var dStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        var ops = CACHE_OPERACOES.filter(o => o.data === dStr && o.status !== 'CANCELADA');
        
        var html = `<span>${d}</span>`;
        if (ops.length > 0) {
            cell.classList.add('has-operation');
            var tot = ops.reduce((a, b) => a + (Number(b.faturamento)||0), 0);
            var col = ops.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';
            html += `<div class="event-dot" style="background:${col}"></div><div style="font-size:0.65em; color:green; margin-top:auto;">${formatarValorMoeda(tot)}</div>`;
            (function(ds) { cell.onclick = function() { abrirModalDetalhesDia(ds); }; })(dStr);
        } else {
            (function(ds) { 
                cell.onclick = function() { 
                    document.getElementById('operacaoData').value = ds; 
                    var btn = document.querySelector('[data-page="operacoes"]'); 
                    if(btn) btn.click(); 
                }; 
            })(dStr);
        }
        cell.innerHTML = html;
        grid.appendChild(cell);
    }
};

window.changeMonth = function(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    renderizarCalendario();
    atualizarDashboard(); 
};

window.abrirModalDetalhesDia = function(dataString) {
    var ops = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
    var mb = document.getElementById('modalDayBody');
    var ms = document.getElementById('modalDaySummary');
    if (!mb) return;

    document.getElementById('modalDayTitle').textContent = 'OPERAÇÕES: ' + formatarDataParaBrasileiro(dataString);
    
    var tFat = 0; var tCust = 0;
    ops.forEach(o => {
        tFat += (Number(o.faturamento) || 0);
        var cComb = window.calcularCustoCombustivelOperacao(o);
        var cOut = (Number(o.despesas)||0);
        if (!o.checkins?.faltaMotorista) cOut += (Number(o.comissao)||0);
        if (o.ajudantes) o.ajudantes.forEach(aj => { if(!o.checkins?.faltas?.[aj.id]) cOut += (Number(aj.diaria)||0); });
        tCust += (cComb + cOut);
    });

    if (ms) {
        ms.innerHTML = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px; text-align:center; background:#f5f5f5; padding:8px; border-radius:6px; font-size:0.85rem;"><div><small>FAT</small><br><strong style="color:var(--success-color)">${formatarValorMoeda(tFat)}</strong></div><div><small>CUSTO</small><br><strong style="color:var(--danger-color)">${formatarValorMoeda(tCust)}</strong></div><div><small>LUCRO</small><br><strong style="color:${(tFat-tCust)>=0 ? 'var(--primary-color)' : 'red'}">${formatarValorMoeda(tFat-tCust)}</strong></div></div>`;
    }

    var html = '<div style="max-height:400px; overflow-y:auto;">';
    if(ops.length === 0) html += '<p style="text-align:center; color:#666;">Nenhuma operação.</p>';
    
    ops.forEach(op => {
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome.split(' ')[0] || '-';
        var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        html += `<div style="border:1px solid #ddd; margin-bottom:10px; border-radius:5px; padding:10px; background:white;"><div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;"><span>${c}</span> <span style="color:${op.status==='EM_ANDAMENTO'?'orange':'#666'}">${op.status}</span></div><div style="font-size:0.85rem; color:#555; margin:5px 0;">${op.veiculoPlaca} | Mot: ${m}</div><button class="btn-mini btn-secondary" style="width:100%" onclick="document.getElementById('modalDayOperations').style.display='none'; visualizarOperacao('${op.id}')">VER DETALHES COMPLETOS</button></div>`;
    });
    
    mb.innerHTML = html + '</div>';
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE
// =============================================================================

// -----------------------------------------------------------------------------
// CONTROLE DE ABAS (TABS)
// -----------------------------------------------------------------------------
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove a classe 'active' de todos os botões e formulários
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        
        // Ativa o botão clicado
        btn.classList.add('active');
        
        // Mostra o formulário correspondente
        const targetId = btn.getAttribute('data-tab');
        const targetForm = document.getElementById(targetId);
        
        if (targetForm) {
            targetForm.classList.add('active');
            
            // Força a atualização da tabela correspondente ao abrir a aba
            // Isso garante que os dados estejam sempre frescos na tela
            if(targetId === 'funcionarios') renderizarTabelaFuncionarios();
            if(targetId === 'veiculos') renderizarTabelaVeiculos();
            if(targetId === 'contratantes') renderizarTabelaContratantes();
            if(targetId === 'atividades') renderizarTabelaAtividades();
            if(targetId === 'minhaEmpresa') renderizarInformacoesEmpresa();
        }
    });
});

// -----------------------------------------------------------------------------
// 1. CADASTRO DE FUNCIONÁRIOS (COM TRATAMENTO DE EMAIL DUPLICADO)
// -----------------------------------------------------------------------------
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        
        // Feedback visual no botão
        var btnSubmit = e.target.querySelector('button[type="submit"]');
        var textoOriginal = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSANDO...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value; 
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            
            // Verifica se é um novo cadastro com criação de login (Senha preenchida)
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                try {
                    // Tenta criar o usuário no Firebase Authentication
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Se sucesso, salva o perfil do usuário no Firestore
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                        uid: novoUID, 
                        name: nome, 
                        email: email, 
                        role: funcao,
                        company: window.USUARIO_ATUAL.company, 
                        createdAt: new Date().toISOString(), 
                        approved: true, 
                        senhaVisual: senha
                    });

                } catch (authError) {
                    // TRATAMENTO ESPECÍFICO: Se o e-mail já existe no Auth
                    if (authError.code === 'auth/email-already-in-use') {
                        var confirmar = confirm(`O e-mail "${email}" JÁ POSSUI UM LOGIN no sistema.\n\nDeseja cadastrar os dados do funcionário mesmo assim? (O login antigo será mantido).`);
                        
                        if (!confirmar) {
                            throw new Error("Operação cancelada pelo usuário.");
                        }
                        // Se confirmar, prossegue usando o ID gerado por data, sem criar novo Auth
                    } else {
                        throw authError; // Lança outros erros (ex: senha fraca)
                    }
                }
            }

            // Monta o objeto do funcionário
            var funcionarioObj = {
                id: novoUID, 
                nome: nome, 
                funcao: funcao, 
                documento: document.getElementById('funcDocumento').value,
                email: email, 
                telefone: document.getElementById('funcTelefone').value, 
                pix: document.getElementById('funcPix').value, 
                endereco: document.getElementById('funcEndereco').value,
                cnh: document.getElementById('funcCNH').value, 
                validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoriaCNH: document.getElementById('funcCategoriaCNH').value, 
                cursoDescricao: document.getElementById('funcCursoDescricao').value
            };
            
            // Atualiza senha visual se foi alterada
            if (senha) { 
                funcionarioObj.senhaVisual = senha; 
            }

            // Atualiza a lista local (Remove antigo se existir e adiciona novo)
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            // Salva na nuvem
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo com Sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            preencherTodosSelects(); // Atualiza tabelas

        } catch (erro) { 
            // Ignora erro se foi cancelamento intencional
            if (erro.message !== "Operação cancelada pelo usuário.") {
                alert("Erro: " + erro.message); 
            }
        } finally { 
            // Restaura o botão
            btnSubmit.disabled = false; 
            btnSubmit.innerHTML = textoOriginal; 
        }
    }
});

// -----------------------------------------------------------------------------
// 2. CADASTRO DE VEÍCULOS
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formVeiculo') { 
        e.preventDefault(); 
        var placa = document.getElementById('veiculoPlaca').value.toUpperCase(); 
        
        var novo = { 
            placa: placa, 
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(), 
            ano: document.getElementById('veiculoAno').value, 
            renavam: document.getElementById('veiculoRenavam').value, 
            chassi: document.getElementById('veiculoChassi').value 
        }; 
        
        var lista = CACHE_VEICULOS.filter(v => v.placa !== placa); 
        lista.push(novo); 
        
        salvarListaVeiculos(lista).then(() => { 
            alert("Veículo Salvo!"); 
            e.target.reset(); 
            preencherTodosSelects(); 
        }); 
    } 
});

// -----------------------------------------------------------------------------
// 3. CADASTRO DE CLIENTES
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formContratante') { 
        e.preventDefault(); 
        var cnpj = document.getElementById('contratanteCNPJ').value; 
        
        var novo = { 
            cnpj: cnpj, 
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), 
            telefone: document.getElementById('contratanteTelefone').value 
        }; 
        
        var lista = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj); 
        lista.push(novo); 
        
        salvarListaContratantes(lista).then(() => { 
            alert("Cliente Salvo!"); 
            e.target.reset(); 
            preencherTodosSelects(); 
        }); 
    } 
});

// -----------------------------------------------------------------------------
// 4. CADASTRO DE SERVIÇOS (ATIVIDADES)
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formAtividade') { 
        e.preventDefault(); 
        var id = document.getElementById('atividadeId').value || Date.now().toString(); 
        
        var novo = { 
            id: id, 
            nome: document.getElementById('atividadeNome').value.toUpperCase() 
        }; 
        
        var lista = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id)); 
        lista.push(novo); 
        
        salvarListaAtividades(lista).then(() => { 
            alert("Atividade Salva!"); 
            e.target.reset(); 
            document.getElementById('atividadeId').value = ''; 
            preencherTodosSelects(); 
        }); 
    } 
});

// -----------------------------------------------------------------------------
// 5. CADASTRO MINHA EMPRESA
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formMinhaEmpresa') { 
        e.preventDefault(); 
        
        var dados = { 
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), 
            cnpj: document.getElementById('minhaEmpresaCNPJ').value, 
            telefone: document.getElementById('minhaEmpresaTelefone').value 
        }; 
        
        salvarDadosMinhaEmpresa(dados).then(() => { 
            alert("Dados da Empresa Atualizados!"); 
            renderizarInformacoesEmpresa(); 
        }); 
    } 
});

// -----------------------------------------------------------------------------
// 6. CADASTRO DE DESPESAS GERAIS
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault(); 
        var id = document.getElementById('despesaGeralId').value || Date.now().toString();
        
        var novaDespesa = {
            id: id, 
            data: document.getElementById('despesaGeralData').value,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
            valor: Number(document.getElementById('despesaGeralValor').value),
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelasTotal: document.getElementById('despesaParcelas').value,
            parcelasPagas: document.getElementById('despesaParcelasPagas').value,
            intervaloDias: document.getElementById('despesaIntervaloDias').value
        };
        
        var lista = CACHE_DESPESAS.filter(d => String(d.id) !== String(id));
        lista.push(novaDespesa);
        
        salvarListaDespesas(lista).then(() => {
            alert("Despesa Lançada!"); 
            e.target.reset(); 
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            renderizarTabelaDespesasGerais(); 
            atualizarDashboard(); 
        });
    }
});

// -----------------------------------------------------------------------------
// 7. CADASTRO DE OPERAÇÕES (VIAGENS)
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        // Define status inicial
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Preserva status de andamento se estiver editando
        if (opAntiga && !isAgendamento) {
            if (opAntiga.status === 'EM_ANDAMENTO' || opAntiga.status === 'FINALIZADA') {
                statusFinal = opAntiga.status; 
            }
        }
        
        // Preserva check-ins existentes
        var checkinsData = (opAntiga && opAntiga.checkins) ? opAntiga.checkins : { motorista: false, faltaMotorista: false, ajudantes: {} };

        var novaOp = {
            id: idHidden || Date.now().toString(),
            data: document.getElementById('operacaoData').value,
            motoristaId: document.getElementById('selectMotoristaOperacao').value,
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value,
            faturamento: document.getElementById('operacaoFaturamento').value,
            adiantamento: document.getElementById('operacaoAdiantamento').value,
            comissao: document.getElementById('operacaoComissao').value,
            despesas: document.getElementById('operacaoDespesas').value,
            combustivel: document.getElementById('operacaoCombustivel').value,
            precoLitro: document.getElementById('operacaoPrecoLitro').value,
            kmRodado: document.getElementById('operacaoKmRodado').value,
            status: statusFinal, 
            checkins: checkinsData, 
            ajudantes: window._operacaoAjudantesTempList || [],
            kmInicial: opAntiga ? opAntiga.kmInicial : 0, 
            kmFinal: opAntiga ? opAntiga.kmFinal : 0
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            var msg = isAgendamento ? "Operação Agendada com Sucesso!" : "Operação Salva com Sucesso!";
            alert(msg);
            e.target.reset(); 
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = []; 
            
            // Atualiza toda a interface impactada
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects(); 
            renderizarCalendario(); 
            atualizarDashboard();
        });
    }
});

// -----------------------------------------------------------------------------
// 8. HELPERS DE INTERFACE (UI)
// -----------------------------------------------------------------------------

// Mostra/Oculta campos de CNH se função for Motorista
window.toggleDriverFields = function() { 
    var select = document.getElementById('funcFuncao'); 
    var div = document.getElementById('driverSpecificFields'); 
    if (select && div) {
        div.style.display = (select.value === 'motorista') ? 'block' : 'none';
    }
};

// Mostra/Oculta campos de Parcelamento
window.toggleDespesaParcelas = function() { 
    var modo = document.getElementById('despesaModoPagamento').value; 
    var div = document.getElementById('divDespesaParcelas'); 
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
    }
};

// Renderiza lista de ajudantes adicionados na tela de operação
window.renderizarListaAjudantesAdicionados = function() { 
    var ul = document.getElementById('listaAjudantesAdicionados'); 
    if (!ul) return; 
    ul.innerHTML = ''; 
    (window._operacaoAjudantesTempList || []).forEach(item => { 
        var f = buscarFuncionarioPorId(item.id); 
        var nome = f ? f.nome : 'Desconhecido'; 
        var li = document.createElement('li');
        li.innerHTML = `<span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span><button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>`; 
        ul.appendChild(li); 
    }); 
};

// Remove ajudante da lista temporária
window.removerAjudanteTemp = function(id) { 
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); 
    renderizarListaAjudantesAdicionados(); 
};

// Adiciona ajudante manualmente
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { 
    var sel = document.getElementById('selectAjudantesOperacao'); 
    var idAj = sel.value; 
    if (!idAj) return alert("Selecione um ajudante."); 
    if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Este ajudante já foi adicionado.");
    
    var valor = prompt("Valor da Diária:"); 
    if (valor) { 
        window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); 
        renderizarListaAjudantesAdicionados(); 
        sel.value = ""; 
    } 
});

// Limpa filtro cruzado nos gráficos
window.limparOutroFiltro = function(tipo) { 
    if (tipo === 'motorista') { 
        document.getElementById('filtroMotoristaGrafico').value = ""; 
    } else { 
        document.getElementById('filtroVeiculoGrafico').value = ""; 
    } 
};

// -----------------------------------------------------------------------------
// 9. RENDERIZAÇÃO DE TABELAS E SELECTS (FUNÇÃO MESTRE)
// -----------------------------------------------------------------------------

function preencherTodosSelects() {
    console.log("Atualizando tabelas e selects da interface...");
    
    // Helper interno para preencher selects
    const fill = (id, dados, valKey, textKey, defText) => { 
        var el = document.getElementById(id); 
        if (!el) return; 
        var atual = el.value; 
        el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); 
        if(atual) el.value = atual; 
    };
    
    // Preenche Selects
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('filtroMotoristaGrafico', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    fill('selectVeiculoRecibo', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'SEM VÍNCULO (GERAL)');

    // Renderiza Tabelas
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    // Renderiza Paineis Dinâmicos se as funções existirem
    if(typeof renderizarTabelaDespesasGerais === 'function') renderizarTabelaDespesasGerais();
    if(typeof renderizarTabelaMonitoramento === 'function') { 
        renderizarTabelaMonitoramento(); 
        renderizarTabelaFaltas(); 
    }
    if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
}

// -----------------------------------------------------------------------------
// 10. RENDERIZAÇÃO ESPECÍFICA DAS TABELAS
// -----------------------------------------------------------------------------

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = '';
    
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var textoPgto = d.modoPagamento === 'parcelado' ? `PARCELADO (${d.parcelasTotal}x)` : 'À VISTA';
        
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td style="color:var(--danger-color); font-weight:bold;">${formatarValorMoeda(d.valor)}</td>
            <td>${textoPgto}</td>
            <td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = function(id) { 
    if(!confirm("Excluir esta despesa?")) return; 
    var lista = CACHE_DESPESAS.filter(d => String(d.id) !== String(id)); 
    salvarListaDespesas(lista).then(() => { 
        renderizarTabelaDespesasGerais(); 
        atualizarDashboard(); 
    }); 
};

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${f.funcao}</td>
            <td>${f.email || '-'}</td>
            <td>
                <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> 
                <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `; 
        tbody.appendChild(tr);
    }); 
}

function renderizarTabelaVeiculos() { 
    var tbody = document.querySelector('#tabelaVeiculos tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_VEICULOS.forEach(v => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

function renderizarTabelaContratantes() { 
    var tbody = document.querySelector('#tabelaContratantes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_CONTRATANTES.forEach(c => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

function renderizarTabelaAtividades() { 
    var tbody = document.querySelector('#tabelaAtividades tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_ATIVIDADES.forEach(a => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

function renderizarTabelaOperacoes() { 
    var tbody = document.querySelector('#tabelaOperacoes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        var lista = CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)); 
        lista.forEach(op => { 
            if(op.status==='CANCELADA') return; 
            var m = buscarFuncionarioPorId(op.motoristaId)?.nome || 'Excluído'; 
            
            // Botões de Ação na Tabela de Operações
            var btns = window.MODO_APENAS_LEITURA ? '' : `
                <button class="btn-mini btn-info" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            `;

            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td>${btns}</td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// Modal de Visualização de Operação (Detalhes Completos)
window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    // Recupera dados relacionados
    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'Não encontrado';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Não encontrado';
    var servico = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    
    // Lista de Ajudantes
    var htmlAjudantes = 'Nenhum';
    if (op.ajudantes && op.ajudantes.length > 0) {
        htmlAjudantes = '<ul style="margin:5px 0 0 20px; padding:0;">' + 
            op.ajudantes.map(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                return `<li>${f ? f.nome : 'Excluído'} (Diária: ${formatarValorMoeda(aj.diaria)})</li>`;
            }).join('') + '</ul>';
    }

    // CUSTO REAL NO MODAL
    var custoComb = window.calcularCustoCombustivelOperacao(op);
    var custoTotal = (Number(op.despesas)||0) + custoComb + (Number(op.comissao)||0);
    if(op.ajudantes) op.ajudantes.forEach(aj => custoTotal += (Number(aj.diaria)||0));
    var lucro = (Number(op.faturamento)||0) - custoTotal;

    var html = `
        <div style="font-size: 0.9rem; color:#333;">
            <div style="background:#f8f9fa; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid var(--primary-color);">
                <h3 style="margin:0 0 5px 0; color:var(--primary-color);">OPERAÇÃO #${op.id.substr(-4)}</h3>
                <p><strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                <p><strong>STATUS:</strong> ${op.status}</p>
                <p><strong>CLIENTE:</strong> ${cliente}</p>
                <p><strong>SERVIÇO:</strong> ${servico}</p>
            </div>

            <div style="margin-bottom:15px;">
                <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">VEÍCULO & EQUIPE</h4>
                <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
                <p><strong>MOTORISTA:</strong> ${nomeMot}</p>
                <p><strong>AJUDANTES:</strong></p>
                ${htmlAjudantes}
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#e8f5e9; padding:10px; border-radius:6px;">
                    <h4 style="margin:0 0 5px 0; color:var(--success-color);">RECEITA</h4>
                    <p style="font-size:1.1rem; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</p>
                    <small>Adiantamento: ${formatarValorMoeda(op.adiantamento)}</small>
                </div>
                <div style="background:#ffebee; padding:10px; border-radius:6px;">
                    <h4 style="margin:0 0 5px 0; color:var(--danger-color);">CUSTOS REAIS</h4>
                    <p>Combustível (Est.): ${formatarValorMoeda(custoComb)}</p>
                    <p>Despesas: ${formatarValorMoeda(op.despesas)}</p>
                    <hr>
                    <p><strong>TOTAL: ${formatarValorMoeda(custoTotal)}</strong></p>
                </div>
            </div>
            
            <div style="background:#e3f2fd; padding:10px; border-radius:6px; text-align:center;">
                <small>LUCRO LÍQUIDO</small><br>
                <strong style="font-size:1.3rem; color:${lucro>=0?'#007bff':'red'}">${formatarValorMoeda(lucro)}</strong>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'flex';
};

// Funções de Exclusão (Helpers)
window.excluirFuncionario = async function(id) { 
    if(!confirm("Excluir funcionário?")) return; 
    if (window.dbRef) { 
        try { 
            await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); 
        } catch(e) {} 
    }
    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    alert("Funcionário removido."); 
    preencherTodosSelects(); 
};

window.excluirVeiculo = function(placa) { 
    if(!confirm("Excluir veículo?")) return; 
    salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); 
};

window.excluirContratante = function(cnpj) { 
    if(!confirm("Excluir cliente?")) return; 
    salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); 
};

window.excluirAtividade = function(id) { 
    if(!confirm("Excluir serviço?")) return; 
    salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); 
};

window.excluirOperacao = function(id) { 
    if(!confirm("Excluir operação?")) return; 
    salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { 
        preencherTodosSelects(); 
        renderizarCalendario(); 
        atualizarDashboard(); 
    }); 
};

// Funções de Preenchimento de Formulário (Edição)
window.preencherFormularioFuncionario = function(id) { 
    var f = buscarFuncionarioPorId(id); if (!f) return; 
    document.getElementById('funcionarioId').value = f.id; 
    document.getElementById('funcNome').value = f.nome; 
    document.getElementById('funcFuncao').value = f.funcao; 
    document.getElementById('funcDocumento').value = f.documento; 
    document.getElementById('funcEmail').value = f.email || ''; 
    document.getElementById('funcTelefone').value = f.telefone; 
    document.getElementById('funcPix').value = f.pix || ''; 
    document.getElementById('funcEndereco').value = f.endereco || ''; 
    toggleDriverFields(); 
    if (f.funcao === 'motorista') { 
        document.getElementById('funcCNH').value = f.cnh || ''; 
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; 
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; 
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; 
    } 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="funcionarios"]').click(); 
};

window.preencherFormularioVeiculo = function(placa) { 
    var v = buscarVeiculoPorPlaca(placa); if (!v) return; 
    document.getElementById('veiculoPlaca').value = v.placa; 
    document.getElementById('veiculoModelo').value = v.modelo; 
    document.getElementById('veiculoAno').value = v.ano; 
    document.getElementById('veiculoRenavam').value = v.renavam || ''; 
    document.getElementById('veiculoChassi').value = v.chassi || ''; 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="veiculos"]').click(); 
};

window.preencherFormularioContratante = function(cnpj) { 
    var c = buscarContratantePorCnpj(cnpj); if (!c) return; 
    document.getElementById('contratanteCNPJ').value = c.cnpj; 
    document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; 
    document.getElementById('contratanteTelefone').value = c.telefone; 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="contratantes"]').click(); 
};

window.preencherFormularioOperacao = function(id) { 
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return; 
    document.getElementById('operacaoId').value = op.id; 
    document.getElementById('operacaoData').value = op.data; 
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId; 
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca; 
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ; 
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId; 
    document.getElementById('operacaoFaturamento').value = op.faturamento; 
    document.getElementById('operacaoAdiantamento').value = op.adiantamento || ''; 
    document.getElementById('operacaoComissao').value = op.comissao || ''; 
    document.getElementById('operacaoDespesas').value = op.despesas || ''; 
    document.getElementById('operacaoCombustivel').value = op.combustivel || ''; 
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || ''; 
    document.getElementById('operacaoKmRodado').value = op.kmRodado || ''; 
    window._operacaoAjudantesTempList = op.ajudantes || []; 
    renderizarListaAjudantesAdicionados(); 
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'); 
    document.querySelector('[data-page="operacoes"]').click(); 
};

function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };
// =============================================================================
// PARTE 4: MONITORAMENTO, EQUIPE, RELATÓRIOS E RECIBOS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. MONITORAMENTO DE ROTAS (DASHBOARD OPERACIONAL)
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra apenas viagens Agendadas ou Em Andamento
    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    // Atualiza contador no menu lateral (Badge Vermelho)
    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
    }

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa no momento.</td></tr>';
        return;
    }

    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        
        // Status Visual
        var statusHtml = op.status === 'EM_ANDAMENTO' 
            ? '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>' 
            : '<span class="status-pill pill-pending">AGENDADA</span>';

        // 1. Linha do Motorista Principal
        var mot = buscarFuncionarioPorId(op.motoristaId);
        if (mot) {
            var faltouMot = (op.checkins && op.checkins.faltaMotorista);
            var checkInFeito = (op.checkins && op.checkins.motorista); 
            
            var statusEquipe = checkInFeito 
                ? '<span style="color:green"><i class="fas fa-check"></i> INICIADO</span>' 
                : '<span style="color:#999">AGUARDANDO</span>';
            
            if (faltouMot) {
                statusEquipe = '<span style="color:red; font-weight:bold;">FALTA</span>';
            }

            var btnFaltaMot = faltouMot 
                ? '-' 
                : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${mot.id}', 'motorista')">FALTA</button>`;

            var nomeDisplay = faltouMot ? `<s style="color:#999;">${mot.nome}</s>` : `<strong>${mot.nome}</strong> (Mot)`;

            var trM = document.createElement('tr');
            trM.innerHTML = `
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${nomeDisplay}<br><small>${op.veiculoPlaca}</small></td>
                <td>${cliente}</td>
                <td>${statusHtml}</td>
                <td>${statusEquipe}</td>
                <td>${btnFaltaMot}</td>
            `;
            tbody.appendChild(trM);
        }

        // 2. Linhas dos Ajudantes (Vinculados à mesma operação)
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(ajItem => {
                var aj = buscarFuncionarioPorId(ajItem.id);
                if (aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = faltouAj
                        ? '-'
                        : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${aj.id}', 'ajudante')">FALTA</button>`;
                    
                    var nomeAjDisplay = faltouAj ? `<s style="color:#999;">${aj.nome}</s>` : `${aj.nome} (Ajud)`;

                    var trA = document.createElement('tr');
                    trA.style.background = "#f9f9f9"; 
                    trA.innerHTML = `
                        <td style="border:none;"></td>
                        <td>${nomeAjDisplay}</td>
                        <td style="color:#777;"><small>^ Vinculado</small></td>
                        <td>${statusHtml}</td>
                        <td>-</td>
                        <td>${btnFaltaAj}</td>
                    `;
                    tbody.appendChild(trA);
                }
            });
        }
    });
};

window.registrarFalta = async function(opId, funcId, tipo) {
    if (!confirm("Confirmar FALTA? O valor financeiro será removido desta operação.")) return;
    
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    // Inicializa estrutura de checkins se não existir
    if (!op.checkins) op.checkins = { motorista: false, faltaMotorista: false, faltas: {} };
    if (!op.checkins.faltas) op.checkins.faltas = {};

    if (tipo === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; 
    } else {
        op.checkins.faltas[funcId] = true;
    }
    
    await salvarListaOperacoes(CACHE_OPERACOES);
    renderizarTabelaMonitoramento();
    renderizarTabelaFaltas();
    atualizarDashboard(); 
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;
        
        // Faltas de Motoristas
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) {
                var tr = document.createElement('tr');
                tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td>`;
                tbody.appendChild(tr);
            }
        }
        
        // Faltas de Ajudantes
        if (op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(k => {
                if(op.checkins.faltas[k]) {
                    var a = buscarFuncionarioPorId(k);
                    if(a) {
                        var tr = document.createElement('tr');
                        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${a.nome}</td><td>AJUDANTE</td><td>FALTA</td><td>-</td>`;
                        tbody.appendChild(tr);
                    }
                }
            });
        }
    });
};

// -----------------------------------------------------------------------------
// 2. GESTÃO DE EQUIPE (BOTÕES PERSONALIZADOS: BLOQUEAR E STATUS)
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = async function() {
    // 1. Tabela de Funcionários Ativos
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        if (CACHE_FUNCIONARIOS.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        } else {
            CACHE_FUNCIONARIOS.forEach(f => {
                var tr = document.createElement('tr');
                
                var isBlocked = f.isBlocked || false;
                
                // Botões Exclusivos Solicitados: Bloquear e Status
                // (Sem Editar/Excluir aqui, conforme regra)
                var btnBloquear = isBlocked 
                    ? `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR ACESSO"><i class="fas fa-lock"></i></button>`
                    : `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR ACESSO"><i class="fas fa-unlock"></i></button>`;

                var btnStatus = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="VER STATUS"><i class="fas fa-eye"></i></button>`;

                tr.innerHTML = `
                    <td>${f.nome}</td>
                    <td>${f.funcao.toUpperCase()}</td>
                    <td>${isBlocked ? '<span style="color:red; font-weight:bold;">BLOQUEADO</span>' : '<span style="color:green;">ATIVO</span>'}</td>
                    <td>
                        ${btnBloquear}
                        ${btnStatus}
                    </td>
                `;
                tbodyAtivos.appendChild(tr);
            });
        }
    }

    // 2. Tabela de Pendentes (Aprovação de novos cadastros)
    if (window.dbRef && window.USUARIO_ATUAL) {
        try {
            const { db, collection, query, where, getDocs } = window.dbRef;
            const q = query(collection(db, "users"), where("company", "==", window.USUARIO_ATUAL.company), where("approved", "==", false));
            const snap = await getDocs(q);
            var tbodyPend = document.querySelector('#tabelaCompanyPendentes tbody');
            if (tbodyPend) {
                tbodyPend.innerHTML = '';
                if (snap.empty) tbodyPend.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum pendente.</td></tr>';
                snap.forEach(doc => {
                    var u = doc.data();
                    var tr = document.createElement('tr');
                    tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td><button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR</button></td>`;
                    tbodyPend.appendChild(tr);
                });
            }
        } catch(e) { console.error(e); }
    }
    
    // 3. Tabela de Solicitações de Dados (Profile Requests)
    var tbodyReq = document.getElementById('tabelaProfileRequests')?.querySelector('tbody');
    if(tbodyReq) {
        tbodyReq.innerHTML = '';
        CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE').forEach(req => {
            var f = buscarFuncionarioPorId(req.funcionarioId);
            var tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatarDataParaBrasileiro(req.data)}</td><td>${f?f.nome:'-'}</td><td>${req.campo}</td><td>${req.valorNovo}</td><td><button class="btn-mini btn-success" onclick="aprovarProfileRequest('${req.id}')">OK</button></td>`;
            tbodyReq.appendChild(tr);
        });
    }
};

// Modal de Status do Funcionário
window.verStatusFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var container = document.getElementById('statusFuncionarioBody');
    var actions = document.getElementById('statusFuncionarioActions');
    
    container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando status...';
    document.getElementById('modalStatusFuncionario').style.display = 'flex';

    // Verifica se está em rota atualmente
    var emRota = false;
    var veiculoRota = "";
    var opAtiva = CACHE_OPERACOES.find(o => o.status === 'EM_ANDAMENTO' && (o.motoristaId === id || (o.ajudantes && o.ajudantes.some(a=>a.id===id))));
    if (opAtiva) {
        emRota = true;
        veiculoRota = opAtiva.veiculoPlaca;
    }

    var isBlocked = f.isBlocked || false;

    // Renderiza HTML do Status
    var html = `
        <h2 style="color:var(--primary-color); margin:0 0 5px 0;">${f.nome}</h2>
        <p style="color:#666;">${f.funcao.toUpperCase()}</p>
        <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
            <div style="background:#f8f9fa; padding:10px; border-radius:6px;">
                <small style="display:block; font-weight:bold; color:#555;">SITUAÇÃO</small>
                ${isBlocked ? '<span style="color:red; font-weight:bold; font-size:1.2rem;">BLOQUEADO</span>' : '<span style="color:green; font-weight:bold; font-size:1.2rem;">ATIVO</span>'}
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:6px;">
                <small style="display:block; font-weight:bold; color:#555;">ROTA ATUAL</small>
                ${emRota ? `<span style="color:orange; font-weight:bold; font-size:1.1rem;">EM ROTA<br><small style="color:#333">${veiculoRota}</small></span>` : '<span style="color:#999; font-weight:bold; font-size:1.2rem;">DISPONÍVEL</span>'}
            </div>
        </div>
    `;
    container.innerHTML = html;

    // Ação Rápida no Modal
    var btnLabel = isBlocked ? 'DESBLOQUEAR ACESSO' : 'BLOQUEAR ACESSO';
    var btnClass = isBlocked ? 'btn-success' : 'btn-danger';
    
    actions.innerHTML = `<button class="${btnClass}" style="width:100%; padding:12px; font-size:1rem;" onclick="toggleBloqueioFunc('${f.id}')"><i class="fas fa-power-off"></i> ${btnLabel}</button>`;
};

// Toggle de Bloqueio
window.toggleBloqueioFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var newStatus = !f.isBlocked;
    var actionName = newStatus ? "BLOQUEAR" : "DESBLOQUEAR";
    
    if (!confirm(`Tem certeza que deseja ${actionName} o funcionário ${f.nome}?`)) return;

    // Atualiza na Nuvem (Auth control)
    if (window.dbRef) {
        try {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { isBlocked: newStatus });
        } catch(e) {
            alert("Erro ao atualizar: " + e.message);
            return;
        }
    }

    // Atualiza Cache Local
    f.isBlocked = newStatus;
    await salvarListaFuncionarios(CACHE_FUNCIONARIOS);

    alert(`Usuário ${newStatus ? 'BLOQUEADO' : 'DESBLOQUEADO'}.`);
    document.getElementById('modalStatusFuncionario').style.display = 'none';
    renderizarPainelEquipe();
};

window.aprovarUsuario = async function(uid) {
    if(!confirm("Aprovar acesso?")) return;
    try { 
        await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true }); 
        renderizarPainelEquipe(); 
    } catch(e){ alert(e.message); }
};

window.aprovarProfileRequest = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if (!req) return;
    
    var func = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(req.funcionarioId));
    if (func) {
        if (req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if (req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if (req.campo === 'PIX') func.pix = req.valorNovo;
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    req.status = 'APROVADO';
    await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
    renderizarPainelEquipe();
};

// -----------------------------------------------------------------------------
// 3. RELATÓRIOS (COM CÁLCULO DE COMBUSTÍVEL PROPORCIONAL)
// -----------------------------------------------------------------------------

function filtrarOperacoesParaRelatorio() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    if (!inicio || !fim) { alert("Selecione o período."); return null; }
    
    var mId = document.getElementById('selectMotoristaRelatorio').value;
    var vPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var cCnpj = document.getElementById('selectContratanteRelatorio').value;
    var aId = document.getElementById('selectAtividadeRelatorio').value;

    return CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < inicio || op.data > fim) return false;
        if (mId && op.motoristaId !== mId) return false;
        if (vPlaca && op.veiculoPlaca !== vPlaca) return false;
        if (cCnpj && op.contratanteCNPJ !== cCnpj) return false;
        if (aId && op.atividadeId !== aId) return false;
        return true;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));
}

window.gerarRelatorioGeral = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var veiculoSelecionado = document.getElementById('selectVeiculoRelatorio').value;
    var htmlCabecalho = '';

    if (veiculoSelecionado) {
        var vStats = { fat:0, custo:0, km:0, litros:0, lucro:0 };
        
        ops.forEach(op => {
            var rec = Number(op.faturamento)||0;
            
            // CUSTO COMBUSTÍVEL REAL (PROPORCIONAL)
            var custoComb = window.calcularCustoCombustivelOperacao(op);
            
            var cust = (Number(op.despesas)||0) + custoComb;
            
            if (!op.checkins || !op.checkins.faltaMotorista) cust += (Number(op.comissao)||0);
            if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) cust += (Number(aj.diaria)||0); });
            
            vStats.fat += rec; 
            vStats.custo += cust; 
            vStats.lucro += (rec - cust); 
            vStats.km += (Number(op.kmRodado)||0);
            
            // Dados para média histórica
            var preco = Number(op.precoLitro)||0; 
            var comb = Number(op.combustivel)||0;
            if(preco > 0 && comb > 0) vStats.litros += (comb/preco);
        });
        
        var mediaKmL = vStats.litros > 0 ? (vStats.km / vStats.litros) : 0;
        
        htmlCabecalho = `
            <div style="background:#e3f2fd; padding:15px; margin-bottom:20px; border-radius:8px;">
                <h3 style="color:#1565c0;">VEÍCULO: ${veiculoSelecionado}</h3>
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-top:10px;">
                    <div><strong>Fat:</strong> ${formatarValorMoeda(vStats.fat)}</div>
                    <div><strong>Custo Real:</strong> ${formatarValorMoeda(vStats.custo)}</div>
                    <div><strong>Lucro:</strong> <span style="color:${vStats.lucro>=0?'green':'red'}">${formatarValorMoeda(vStats.lucro)}</span></div>
                    <div><strong>KM:</strong> ${vStats.km}</div>
                    <div><strong>Média Geral:</strong> ${mediaKmL.toFixed(2)} Km/L</div>
                </div>
            </div>`;
    }

    var html = `
        <div style="text-align:center; margin-bottom:20px;"><h3>RELATÓRIO FINANCEIRO (CUSTO REAL)</h3></div>
        ${htmlCabecalho}
        <table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>CLIENTE</th><th>FATURAMENTO</th><th>CUSTO (EST.)</th><th>LUCRO</th></tr></thead><tbody>
    `;

    var totalFat = 0; var totalLucro = 0; var totalCusto = 0;
    
    ops.forEach(op => {
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var receita = Number(op.faturamento)||0;
        
        // CUSTO REAL NA TABELA
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        var custo = (Number(op.despesas)||0) + custoComb;
        
        if (!op.checkins || !op.checkins.faltaMotorista) custo += (Number(op.comissao)||0);
        if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) custo += (Number(aj.diaria)||0); });
        
        var lucro = receita - custo; 
        totalFat += receita; totalCusto += custo; totalLucro += lucro;
        
        html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${cli ? cli.razaoSocial.substring(0,15) : '-'}</td><td>${formatarValorMoeda(receita)}</td><td>${formatarValorMoeda(custo)}</td><td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td></tr>`;
    });
    html += `<tr style="background:#f5f5f5; font-weight:bold;"><td colspan="3" style="text-align:right;">TOTAIS:</td><td>${formatarValorMoeda(totalFat)}</td><td>${formatarValorMoeda(totalCusto)}</td><td style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</td></tr></tbody></table>`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarRelatorioCobranca = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var porCliente = {};
    ops.forEach(op => {
        var cNome = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'DESCONHECIDO';
        if (!porCliente[cNome]) porCliente[cNome] = { ops: [], totalFat: 0, totalAdiant: 0 };
        porCliente[cNome].ops.push(op);
        porCliente[cNome].totalFat += (Number(op.faturamento)||0);
        porCliente[cNome].totalAdiant += (Number(op.adiantamento)||0);
    });

    var html = `<div style="text-align:center; margin-bottom:30px;"><h2>RELATÓRIO DE COBRANÇA (LÍQUIDO)</h2></div>`;
    for (var cliente in porCliente) {
        var liquido = porCliente[cliente].totalFat - porCliente[cliente].totalAdiant;
        html += `<div style="margin-bottom:30px; border:1px solid #ccc; padding:15px;"><h3 style="background:#eee; padding:10px;">${cliente}</h3><table class="data-table" style="width:100%;"><thead><tr><th>DATA</th><th>PLACA</th><th>VALOR SERVIÇO</th><th>ADIANTAMENTO</th></tr></thead><tbody>`;
        porCliente[cliente].ops.forEach(op => {
            html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${formatarValorMoeda(op.faturamento)}</td><td style="color:red;">${op.adiantamento > 0 ? '- '+formatarValorMoeda(op.adiantamento) : '-'}</td></tr>`;
        });
        html += `</tbody><tfoot><tr style="background:#333; color:white;"><td colspan="3" style="text-align:right; font-weight:bold;">LÍQUIDO A RECEBER:</td><td style="font-weight:bold; font-size:1.1rem; color:#4caf50;">${formatarValorMoeda(liquido)}</td></tr></tfoot></table></div>`;
    }
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') { alert("Gere um relatório primeiro."); return; }
    html2pdf().set({ margin: 10, filename: 'Relatorio.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).save();
};

// -----------------------------------------------------------------------------
// 4. RECIBOS E LÓGICA DO FUNCIONÁRIO
// -----------------------------------------------------------------------------

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!motId || !dataIni || !dataFim) return alert("Preencha todos os campos.");
    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário inválido.");

    var totalValor = 0; var opsEnvolvidas = [];
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA' || op.data < dataIni || op.data > dataFim) return;
        var valorGanho = 0;
        if (op.motoristaId === motId && (!op.checkins || !op.checkins.faltaMotorista)) valorGanho = Number(op.comissao) || 0;
        else if (op.ajudantes) {
            var aj = op.ajudantes.find(a => a.id === motId);
            if (aj && !(op.checkins?.faltas?.[motId])) valorGanho = Number(aj.diaria) || 0;
        }
        if (valorGanho > 0) {
            totalValor += valorGanho;
            opsEnvolvidas.push({ data: op.data, valor: valorGanho });
        }
    });

    var htmlRecibo = `<div style="border:2px solid #333; padding:20px; font-family:'Courier New'; background:#fff;"><h3 style="text-align:center;">RECIBO</h3><p><strong>BENEFICIÁRIO:</strong> ${funcionario.nome}</p><p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dataIni)} A ${formatarDataParaBrasileiro(dataFim)}</p><table style="width:100%;"><tr><th align="left">DATA</th><th align="right">VALOR</th></tr>${opsEnvolvidas.map(o=>`<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td align="right">${formatarValorMoeda(o.valor)}</td></tr>`).join('')}</table><h3 style="text-align:right; border-top:2px solid #000;">TOTAL: ${formatarValorMoeda(totalValor)}</h3></div>`;
    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    document.getElementById('modalReciboActions').innerHTML = `<button class="btn-success" onclick="salvarReciboNoHistorico('${funcionario.id}', '${funcionario.nome}', '${dataIni}', '${dataFim}', ${totalValor})"><i class="fas fa-save"></i> SALVAR E GERAR</button>`;
    document.getElementById('modalRecibo').style.display = 'flex';
};

window.salvarReciboNoHistorico = async function(funcId, funcNome, ini, fim, valor) {
    var novoRecibo = { 
        id: Date.now().toString(), 
        dataEmissao: new Date().toISOString(), 
        funcionarioId: funcId, 
        funcionarioNome: funcNome, 
        periodo: `${formatarDataParaBrasileiro(ini)} a ${formatarDataParaBrasileiro(fim)}`, 
        valorTotal: valor, 
        enviado: false 
    };
    var lista = CACHE_RECIBOS || [];
    lista.push(novoRecibo);
    await salvarListaRecibos(lista);
    alert("Recibo salvo!"); document.getElementById('modalRecibo').style.display = 'none'; renderizarHistoricoRecibos();
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (CACHE_RECIBOS || []).sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        var statusLabel = r.enviado ? '<span class="status-pill pill-active">ENVIADO</span>' : '<span class="status-pill pill-pending">NÃO ENVIADO</span>';
        var btnEnviar = r.enviado ? '' : `<button class="btn-mini btn-primary" onclick="enviarReciboFuncionario('${r.id}')" title="Enviar"><i class="fas fa-paper-plane"></i></button>`;
        tbody.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${statusLabel}</td><td>${btnEnviar}</td></tr>`;
    });
};

window.enviarReciboFuncionario = async function(reciboId) {
    if(!confirm("Enviar recibo?")) return;
    var rec = CACHE_RECIBOS.find(r => r.id === reciboId);
    if(rec) {
        rec.enviado = true;
        await salvarListaRecibos(CACHE_RECIBOS);
        renderizarHistoricoRecibos();
        alert("Enviado com sucesso!");
    }
};

window.renderizarCheckinFuncionario = function() {
    var container = document.getElementById('checkin-container'); 
    if (!container) return;
    var uid = window.USUARIO_ATUAL.uid;
    
    var opsPendentes = CACHE_OPERACOES.filter(op => {
        return (op.motoristaId === uid && op.status !== 'CANCELADA' && (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'));
    });

    if (opsPendentes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma viagem.</p>';
        return;
    }

    var html = '';
    opsPendentes.forEach(op => {
        var btnAcao = op.status === 'AGENDADA' 
            ? `<button class="btn-success" style="width:100%;" onclick="confirmarInicioViagem('${op.id}')">INICIAR VIAGEM</button>`
            : `<button class="btn-warning" style="width:100%;" onclick="finalizarViagem('${op.id}')">FINALIZAR VIAGEM</button>`;
        html += `<div style="background:white; border:1px solid #ddd; padding:15px; margin-bottom:15px;"><h4>${op.veiculoPlaca}</h4><p>${formatarDataParaBrasileiro(op.data)}</p>${btnAcao}</div>`;
    });
    container.innerHTML = html;
};

window.confirmarInicioViagem = async function(id) {
    if(!confirm("Iniciar viagem?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) {
        op.status = 'EM_ANDAMENTO';
        if(!op.checkins) op.checkins = {};
        op.checkins.motorista = true;
        await salvarListaOperacoes(CACHE_OPERACOES);
        renderizarCheckinFuncionario();
    }
};

window.finalizarViagem = async function(id) {
    var kmFinal = prompt("Digite o KM Final:");
    if(!kmFinal) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) {
        op.status = 'FINALIZADA';
        op.kmFinal = kmFinal;
        op.kmRodado = (Number(kmFinal) - Number(op.kmInicial || 0));
        await salvarListaOperacoes(CACHE_OPERACOES);
        renderizarCheckinFuncionario();
        alert("Finalizada!");
    }
};

window.filtrarServicosFuncionario = function(uid) {
    var dataInicio = document.getElementById('dataInicioServicosFunc')?.value;
    var dataFim = document.getElementById('dataFimServicosFunc')?.value;

    var minhasOps = CACHE_OPERACOES.filter(op => {
        var ehMotorista = (op.motoristaId === uid);
        var ehAjudante = (op.ajudantes && op.ajudantes.some(aj => aj.id === uid));
        var dataOk = (!dataInicio || op.data >= dataInicio) && (!dataFim || op.data <= dataFim);
        return (ehMotorista || ehAjudante) && op.status !== 'CANCELADA' && dataOk;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    var tbody = document.getElementById('tabelaMeusServicos')?.querySelector('tbody');
    if(tbody) {
        tbody.innerHTML = '';
        minhasOps.forEach(op => {
            var val = (op.motoristaId === uid) ? (Number(op.comissao)||0) : (Number(op.ajudantes.find(x => x.id === uid).diaria)||0);
            tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${formatarValorMoeda(val)}</td></tr>`;
        });
    }

    var tbodyRec = document.getElementById('tabelaMeusRecibos')?.querySelector('tbody');
    if(tbodyRec) {
        var meusRecibos = CACHE_RECIBOS.filter(r => String(r.funcionarioId) === String(uid) && r.enviado === true);
        tbodyRec.innerHTML = '';
        meusRecibos.forEach(r => {
            tbodyRec.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.periodo}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>OK</td></tr>`;
        });
    }
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 1. PAINEL SUPER ADMIN (VISUAL LIMPO E FUNCIONAL)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer'); if(!container) return;
    container.innerHTML = '<p style="text-align:center; padding:20px;">Carregando...</p>';
    try {
        const { db, collection, getDocs } = window.dbRef;
        const cSnap = await getDocs(collection(db, "companies"));
        const uSnap = await getDocs(collection(db, "users"));
        const comps = []; cSnap.forEach(d => comps.push({ id: d.id, ...d.data() }));
        const users = []; uSnap.forEach(d => users.push({ uid: d.id, ...d.data() }));

        container.innerHTML = '';
        if(comps.length === 0) { container.innerHTML = 'Nenhuma empresa.'; return; }

        comps.forEach(comp => {
            const us = users.filter(u => u.company === comp.id);
            const adm = us.find(u => u.role === 'admin');
            let vTxt = comp.isVitalicio ? "VITALÍCIO" : (comp.systemValidity ? formatarDataParaBrasileiro(comp.systemValidity) : "SEM DADOS");
            let border = comp.isBlocked ? "red" : (comp.isVitalicio ? "gold" : "#ccc");

            const div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = `margin-bottom:15px; border:1px solid ${border}; border-radius:8px; background:white; overflow:hidden;`;
            div.innerHTML = `<div class="company-header" onclick="this.nextElementSibling.style.display=(this.nextElementSibling.style.display==='none'?'block':'none')" style="padding:15px;cursor:pointer;display:flex;justify-content:space-between;background:#f8f9fa;"><div><strong>${comp.id.toUpperCase()}</strong><br><small>Admin: ${adm?adm.email:'-'}</small></div><div style="text-align:right"><small>${comp.isBlocked?'BLOQUEADO':'ATIVO'}</small><br><strong>${vTxt}</strong></div></div><div class="company-body" style="display:none;padding:15px;"><button class="btn-primary" onclick="abrirModalCreditos('${comp.id}',null,${comp.isVitalicio||false},${comp.isBlocked||false})">GERENCIAR</button> <button class="btn-danger" onclick="excluirEmpresaTotal('${comp.id}')">EXCLUIR</button><hr><small>USUÁRIOS:</small>${us.map(u=>`<div>${u.email} (${u.role}) <button onclick="resetarSenhaComMigracao('${u.uid}','${u.email}')">RESET</button></div>`).join('')}</div>`;
            container.appendChild(div);
        });
    } catch (e) { container.innerHTML = 'Erro: '+e.message; }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var d = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var em = document.getElementById('newAdminEmail').value.trim();
        var pw = document.getElementById('newAdminPassword').value.trim();
        try {
            var uid = await window.dbRef.criarAuthUsuario(em, pw);
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { uid:uid, name:"ADMIN "+d.toUpperCase(), email:em, role:'admin', company:d, approved:true, isVitalicio:false, isBlocked:false, senhaVisual:pw, createdAt:new Date().toISOString(), systemValidity:new Date(new Date().setDate(new Date().getDate()+30)).toISOString() });
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", d), { id:d, createdAt:new Date().toISOString(), isBlocked:false, isVitalicio:false, systemValidity:new Date(new Date().setDate(new Date().getDate()+30)).toISOString() }, {merge:true});
            alert("Criado!"); e.target.reset(); carregarPainelSuperAdmin();
        } catch(err) { alert(err.message); }
    }
});

window.abrirModalCreditos = function(id, v, vit, blk) {
    document.getElementById('empresaIdCredito').value = id;
    document.getElementById('nomeEmpresaCredito').textContent = id.toUpperCase();
    var ev = document.getElementById('checkVitalicio');
    var eb = document.getElementById('checkBloqueado');
    if(ev) ev.checked = vit;
    if(eb) eb.checked = blk;
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var id = document.getElementById('empresaIdCredito').value;
    var vit = document.getElementById('checkVitalicio').checked;
    var blk = document.getElementById('checkBloqueado').checked;
    var mes = parseInt(document.getElementById('qtdCreditosAdd').value);
    try {
        var dt = { isVitalicio: vit, isBlocked: blk };
        if(!vit && !blk && mes > 0) {
            var base = new Date(); base.setDate(base.getDate() + (mes*30));
            dt.systemValidity = base.toISOString();
        }
        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", id), dt, {merge:true});
        const batch = window.dbRef.writeBatch(window.dbRef.db);
        const q = await window.dbRef.getDocs(window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"), window.dbRef.where("company","==",id)));
        q.forEach(d => batch.update(d.ref, { isBlocked: blk, isVitalicio: vit }));
        await batch.commit();
        alert("Salvo!"); document.getElementById('modalCreditos').style.display = 'none'; carregarPainelSuperAdmin();
    } catch(e) { alert(e.message); }
};

window.excluirEmpresaTotal = async function(id) {
    if(prompt("Digite DELETAR:") !== "DELETAR") return;
    try {
        const batch = window.dbRef.writeBatch(window.dbRef.db);
        const q = await window.dbRef.getDocs(window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"), window.dbRef.where("company","==",id)));
        q.forEach(d => batch.delete(d.ref));
        batch.delete(window.dbRef.doc(window.dbRef.db,"companies",id));
        await batch.commit();
        alert("Excluído!"); carregarPainelSuperAdmin();
    } catch(e){ alert(e.message); }
};

window.resetarSenhaComMigracao = async function(uid, email) {
    var p = prompt("Nova senha:");
    if(p) {
        try {
            var nid = await window.dbRef.criarAuthUsuario(email, p);
            var old = await window.dbRef.getDoc(window.dbRef.doc(window.dbRef.db,"users",uid));
            if(old.exists()) {
                var d = old.data(); d.uid = nid; d.senhaVisual = p;
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"users",nid), d);
                await window.dbRef.deleteDoc(old.ref);
            }
            alert("OK!"); carregarPainelSuperAdmin();
        } catch(e){ alert(e.message); }
    }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(confirm("Excluir?")) { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db,"users",uid)); carregarPainelSuperAdmin(); }
};

// -----------------------------------------------------------------------------
// 2. MEUS DADOS E INICIALIZAÇÃO (INIT)
// -----------------------------------------------------------------------------

window.renderizarMeusDados = function() {
    var u = window.USUARIO_ATUAL;
    var d = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(u.uid)) || u;
    var c = document.getElementById('meusDadosContainer');
    if(c) c.innerHTML = `<div style="background:white; padding:20px; text-align:center;"><h3>${d.nome || d.name}</h3><p>${d.funcao || d.role}</p><hr><p>${d.email}</p></div>`;
};

window.initSystemByRole = async function(user) {
    console.log(">>> INIT:", user.role);
    window.USUARIO_ATUAL = user;

    document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // Super Admin
    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        var p = document.getElementById('super-admin');
        if(p) { p.style.display = 'block'; setTimeout(() => p.classList.add('active'), 50); }
        carregarPainelSuperAdmin();
        return;
    }

    // Sync
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects();

    // Admin Comum
    if (user.role === 'admin') {
        if (user.isBlocked) return document.body.innerHTML = "<h1 style='text-align:center; padding:50px; color:red'>BLOQUEADO</h1>";
        
        if (!user.isVitalicio && user.systemValidity && new Date(user.systemValidity) < new Date()) {
            return document.body.innerHTML = "<h1 style='text-align:center; padding:50px; color:red'>VENCIDO</h1>";
        }

        document.getElementById('menu-admin').style.display = 'block';
        
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            var mh = document.querySelector('.nav-item[data-page="home"]');
            if(mh) mh.classList.add('active');
        }
        
        // CORREÇÃO CRÍTICA: Delay para garantir renderização do calendário
        window.currentDate = new Date();
        setTimeout(() => {
            renderizarCalendario();
            atualizarDashboard();
        }, 300); // 300ms de segurança

    } else {
        // Funcionário
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home');
        if(eh) { eh.style.display = 'block'; setTimeout(() => eh.classList.add('active'), 50); }
        renderizarCheckinFuncionario();
        renderizarMeusDados();
    }
};

// Navegação
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => { page.classList.remove('active'); page.style.display = 'none'; });
        this.classList.add('active');
        var tid = this.getAttribute('data-page');
        var tpg = document.getElementById(tid);
        if (tpg) { tpg.style.display = 'block'; setTimeout(() => tpg.classList.add('active'), 10); }
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
        
        if (tid === 'home') { setTimeout(() => { atualizarDashboard(); renderizarCalendario(); }, 100); }
        if (tid === 'meus-dados') renderizarMeusDados();
        if (tid === 'employee-checkin') renderizarCheckinFuncionario();
    });
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

window.exportDataBackup = function() {
    var data = { meta: { date: new Date() }, data: { f: CACHE_FUNCIONARIOS, v: CACHE_VEICULOS, o: CACHE_OPERACOES, d: CACHE_DESPESAS } };
    var a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = "bkp.json"; a.click();
};

window.importDataBackup = function(event) {
    var r = new FileReader();
    r.onload = function(e) {
        if(confirm("Restaurar?")) {
            var j = JSON.parse(e.target.result);
            if(j.data) {
                localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(j.data.f));
                localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(j.data.v));
                localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(j.data.o));
                localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(j.data.d));
                alert("OK"); window.location.reload();
            }
        }
    };
    r.readAsText(event.target.files[0]);
};