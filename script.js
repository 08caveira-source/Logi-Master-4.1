// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 3.0 (CORREÇÃO TOTAL DE SINCRONIA E FLUXO)
// =============================================================================

// 1. CONSTANTES DE ARMAZENAMENTO
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// 2. VARIÁVEIS GLOBAIS
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// STATUS DO SISTEMA
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// 3. CACHE LOCAL (Memória RAM)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// 4. HELPERS DE FORMATAÇÃO
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    var partes = dataIso.split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    else if (numeros.length > 6) return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    return telefone;
}

function removerAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// 5. NOVA CAMADA DE DADOS (SYNC FIREBASE OBRIGATÓRIO)

// Sanitização para evitar erros no Firestore
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

// FUNÇÃO VITAL: Sincroniza dados da Nuvem para o Local ao iniciar
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Usuário offline ou sem empresa. Usando cache local.");
        carregarTodosDadosLocais(); // Fallback
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função interna para buscar uma coleção específica dentro da empresa
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || []; // Se for lista
                // Se for objeto único (minha empresa) ou lista
                if (chave === CHAVE_DB_MINHA_EMPRESA) setter(data.items || {}); 
                else setter(lista);
                
                // Atualiza localStorage para backup offline
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]); // Nada na nuvem ainda
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave}:`, e);
        }
    }

    // Executa downloads em paralelo para velocidade
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

    console.log(">>> SINCRONIA CONCLUÍDA. Dados Prontos.");
}

// Carregamento Local (Apenas Fallback ou Primeira Carga Visual)
function carregarTodosDadosLocais() {
    function load(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch(e){ return []; } }
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

// Salvar Dados (Escreve na Nuvem E no Local)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e Local
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Atualiza Nuvem
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Bloqueio se vencido (Exceto Master)
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') return;

        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            // Salva na sub-coleção da empresa
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) { console.error("Erro Firebase (" + chave + "):", erro); }
    }
}

// Funções Específicas de Salvamento
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas Helpers
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD, PRIVACIDADE E GRÁFICOS (LÓGICA FINANCEIRA CORRIGIDA)
// =============================================================================

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

// --- NOVA LÓGICA DO DASHBOARD ---
window.atualizarDashboard = function() {
    // Bloqueio para Master
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    console.log("Calculando Dashboard (Lógica de Consumo Médio)...");
    
    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // 1. Processar Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // --- CÁLCULO DE COMBUSTÍVEL PELO CONSUMO (GLOBAL) ---
        var custoCombustivelCalculado = 0;
        
        // Se a viagem tem KM rodado e Veículo definido, calculamos pelo consumo médio
        if (op.kmRodado > 0 && op.veiculoPlaca) {
            var mediaVeiculo = calcularMediaGlobalVeiculo(op.veiculoPlaca); // Pega média histórica
            var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca) || 6.00; // Pega preço do dia ou médio
            
            if (mediaVeiculo > 0) {
                var litrosEstimados = op.kmRodado / mediaVeiculo;
                custoCombustivelCalculado = litrosEstimados * precoLitro;
            } else {
                // Se não tem média histórica (veículo novo), usa o valor declarado se houver
                custoCombustivelCalculado = Number(op.combustivel) || 0;
            }
        } else {
            // Se não rodou (ex: diária parada) ou não tem KM lançado
            custoCombustivelCalculado = 0; // Não cobra combustível se não rodou, ou usa valor manual se preferir
        }

        // Custos Totais da Operação
        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        if (!teveFalta) custoOp += (Number(op.comissao) || 0);

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) custoOp += (Number(aj.diaria) || 0);
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') receitaHistorico += valorFat;

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // 2. Despesas Gerais (Parceladas)
    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        
        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtd = Number(desp.parcelasTotal);
            var valParc = valorTotal / qtd;
            var intervalo = Number(desp.intervaloDias) || 30;
            for (var i = 0; i < qtd; i++) {
                var dt = new Date(dataDesp);
                dt.setDate(dt.getDate() + (i * intervalo));
                if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
                    custosMes += valParc;
                }
            }
        } else {
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += valorTotal;
            }
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza Tela
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(custosMes);
    if (elLucro) elLucro.textContent = formatarValorMoeda(lucroMes);
    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// --- GRÁFICO ---
function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    var filtroVeiculo = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var filtroMotorista = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    var summaryContainer = document.getElementById('chartVehicleSummaryContainer');

    var stats = { faturamento: 0, custos: 0, lucro: 0, viagens: 0, faltas: 0, kmTotal: 0, litrosTotal: 0 };
    var gReceita = 0; var gCombustivel = 0; var gPessoal = 0; var gManutencao = 0;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            if (filtroMotorista && op.checkins && op.checkins.faltaMotorista) stats.faltas++;

            var receitaOp = Number(op.faturamento) || 0;
            
            // Custo Combustível (Lógica de Consumo)
            var combustivelOp = 0;
            if (op.kmRodado > 0 && op.veiculoPlaca) {
                var media = calcularMediaGlobalVeiculo(op.veiculoPlaca);
                var preco = Number(op.precoLitro) || 6.00;
                if(media > 0) combustivelOp = (op.kmRodado / media) * preco;
                else combustivelOp = Number(op.combustivel)||0;
            }

            var despesasOp = Number(op.despesas) || 0; 
            var comissaoOp = 0;
            if (!op.checkins || !op.checkins.faltaMotorista) comissaoOp = Number(op.comissao) || 0;
            if (op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id])) comissaoOp += (Number(aj.diaria)||0); });

            stats.viagens++;
            stats.faturamento += receitaOp;
            stats.custos += (combustivelOp + despesasOp + comissaoOp);
            stats.kmTotal += (Number(op.kmRodado) || 0);

            gReceita += receitaOp;
            gCombustivel += combustivelOp;
            gPessoal += comissaoOp; 
            gManutencao += despesasOp; 

            var precoReal = Number(op.precoLitro) || 0;
            var litrosReal = Number(op.combustivel) > 0 && precoReal > 0 ? (Number(op.combustivel)/precoReal) : 0;
            stats.litrosTotal += litrosReal;
        }
    });

    // Despesas Gerais
    CACHE_DESPESAS.forEach(desp => {
        if (filtroVeiculo && desp.veiculoPlaca && desp.veiculoPlaca !== filtroVeiculo) return;
        var valorComputado = 0;
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');

        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtd = Number(desp.parcelasTotal);
            var valParc = valorTotal / qtd;
            var intervalo = Number(desp.intervaloDias) || 30;
            for (var i = 0; i < qtd; i++) {
                var dt = new Date(dataDesp);
                dt.setDate(dt.getDate() + (i * intervalo));
                if (dt.getMonth() === mes && dt.getFullYear() === ano) valorComputado += valParc;
            }
        } else {
            if (dataDesp.getMonth() === mes && dataDesp.getFullYear() === ano) valorComputado = valorTotal;
        }

        if (valorComputado > 0) {
            stats.custos += valorComputado;
            var desc = removerAcentos(desp.descricao || "");
            if (desc.includes("manutencao") || desc.includes("oleo") || desc.includes("pneu") || desc.includes("peca")) gManutencao += valorComputado;
            else if (desc.includes("comida") || desc.includes("hotel") || desc.includes("outros")) gPessoal += valorComputado;
            else gManutencao += valorComputado;
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
        if (filtroVeiculo || filtroMotorista) {
            var tituloBox = filtroVeiculo ? "VEÍCULO" : "MOTORISTA";
            var valorTitulo = filtroVeiculo || (CACHE_FUNCIONARIOS.find(f => f.id == filtroMotorista)?.nome || "Desconhecido");
            var boxExtraLabel = filtroMotorista ? "FALTAS" : "MÉDIA (REAL)";
            var boxExtraValue = filtroMotorista ? (stats.faltas + " Faltas") : ((stats.litrosTotal > 0 ? (stats.kmTotal / stats.litrosTotal).toFixed(2) : "0") + " Km/L");
            
            summaryContainer.innerHTML = `
                <div id="chartVehicleSummary">
                    <div class="veh-stat-box"><small>${tituloBox}</small><span>${valorTitulo}</span></div>
                    <div class="veh-stat-box"><small>VIAGENS</small><span>${stats.viagens}</span></div>
                    <div class="veh-stat-box"><small>FATURAMENTO</small><span style="color:var(--success-color)">${formatarValorMoeda(stats.faturamento)}</span></div>
                    <div class="veh-stat-box"><small>${boxExtraLabel}</small><span style="color:var(--primary-color)">${boxExtraValue}</span></div>
                    <div class="veh-stat-box"><small>LUCRO EST.</small><span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span></div>
                </div>`;
        }
    }

    if (window.chartInstance) window.chartInstance.destroy();
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL (EST.)', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'R$',
                data: [gReceita, gCombustivel, gPessoal, gManutencao, (gReceita - (gCombustivel+gPessoal+gManutencao))],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// --- CALENDÁRIO CORRIGIDO ---
window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate || new Date(); // Garante data
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); 
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        grid.appendChild(emptyCell);
    }

    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        var cellContent = `<span>${dia}</span>`;
        
        // Garante que CACHE_OPERACOES existe antes do filter
        var opsDoDia = (CACHE_OPERACOES || []).filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            var temEmAndamento = opsDoDia.some(o => o.status === 'EM_ANDAMENTO');
            var dotColor = temEmAndamento ? 'orange' : (opsDoDia.some(o => o.status === 'AGENDADA') ? '#999' : 'green');

            cellContent += `<div class="event-dot" style="background:${dotColor}"></div>`;
            cellContent += `<div style="font-size:0.65em; color:green; margin-top:auto;">${formatarValorMoeda(totalDia)}</div>`;
            
            // Closure para capturar data
            (function(dStr) {
                cell.onclick = function() { abrirModalDetalhesDia(dStr); };
            })(dateStr);
        } else {
            (function(dStr) {
                cell.onclick = function() { 
                    document.getElementById('operacaoData').value = dStr;
                    var btn = document.querySelector('[data-page="operacoes"]');
                    if(btn) btn.click();
                };
            })(dateStr);
        }
        cell.innerHTML = cellContent;
        grid.appendChild(cell);
    }
};

window.changeMonth = function(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    renderizarCalendario();
    atualizarDashboard(); 
};

// HELPER: MÉDIA GLOBAL (Vital para o novo cálculo)
window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA'));
    if (ops.length === 0) return 0;
    var totalKm = 0; var totalLitros = 0;
    ops.forEach(op => {
        var km = Number(op.kmRodado) || 0;
        var comb = Number(op.combustivel) || 0;
        var preco = Number(op.precoLitro) || 0;
        // Só considera abastecimentos reais para a média
        if (km > 0 && comb > 0 && preco > 0) { 
            totalKm += km; 
            totalLitros += (comb / preco); 
        }
    });
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-5); // Pega os últimos 5
    var soma = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return soma / ultimas.length;
};

window.abrirModalDetalhesDia = function(dataString) {
    var operacoesDoDia = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    if (!modalBody) return;

    if (modalTitle) modalTitle.textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);
    var htmlLista = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%; font-size:0.75rem;"><thead><tr style="background:#263238; color:white;"><th>CLIENTE</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th></tr></thead><tbody>';
    
    operacoesDoDia.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId)?.nome || '---';
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        htmlLista += `<tr><td>${cli}</td><td>${op.veiculoPlaca}</td><td>${mot}</td><td>${formatarValorMoeda(op.faturamento)}</td></tr>`;
    });
    htmlLista += '</tbody></table></div>';
    
    modalBody.innerHTML = htmlLista || '<p style="text-align:center;">Sem operações.</p>';
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// PARTE 3: GESTÃO DE CADASTROS, INTERFACE DE FORMULÁRIOS E FUNÇÕES DE UI
// =============================================================================

// -----------------------------------------------------------------------------
// EVENT LISTENERS DE FORMULÁRIOS (CRUD)
// -----------------------------------------------------------------------------

// CADASTRO DE FUNCIONÁRIOS (CRIAÇÃO NO AUTH + FIRESTORE)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
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
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            // 1. Criar Usuário no Auth (Apenas se for novo)
            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                console.log("Criando usuário no Auth...");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // 2. Salvar metadados do usuário na coleção 'users' (para login)
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, 
                    name: nome, 
                    email: email, 
                    role: funcao,
                    company: window.USUARIO_ATUAL.company, 
                    createdAt: new Date().toISOString(), 
                    approved: true,
                    senhaVisual: senha // Apenas para visualização do admin
                });
            }

            // 3. Objeto do Funcionário (Dados do Sistema)
            var funcionarioObj = {
                id: novoUID, 
                nome: nome, 
                funcao: funcao, 
                documento: document.getElementById('funcDocumento').value,
                email: email, 
                telefone: document.getElementById('funcTelefone').value, 
                pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                // Dados Motorista
                cnh: document.getElementById('funcCNH').value, 
                validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoriaCNH: document.getElementById('funcCategoriaCNH').value, 
                cursoDescricao: document.getElementById('funcCursoDescricao').value
            };
            
            if (senha) { funcionarioObj.senhaVisual = senha; }

            // Atualiza lista local e salva na nuvem
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo e Sincronizado!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            
            // Atualiza Tabelas Imediatamente
            preencherTodosSelects();

        } catch (erro) { 
            console.error(erro); 
            alert("Erro: " + erro.message); 
        } finally { 
            btnSubmit.disabled = false; 
            btnSubmit.innerHTML = textoOriginal; 
        }
    }
});

// CADASTRO DE VEÍCULOS
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

// CADASTRO DE CLIENTES
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

// CADASTRO DE SERVIÇOS
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

// DADOS DA EMPRESA
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

// CADASTRO DE DESPESAS GERAIS (COM DETALHES DE PARCELAS)
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
            alert("Despesa Lançada e Sincronizada!");
            e.target.reset();
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            renderizarTabelaDespesasGerais(); 
            atualizarDashboard(); 
        });
    }
});

// SALVAR OPERAÇÃO (VIAGEM)
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Preserva status se já estava em execução
        if (opAntiga && !isAgendamento) {
            if (opAntiga.status === 'EM_ANDAMENTO' || opAntiga.status === 'FINALIZADA') {
                statusFinal = opAntiga.status; 
            }
        }
        
        // Mantém checkins anteriores ou inicia limpo
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
            var msg = isAgendamento ? "Agendada! O funcionário já pode ver no check-in." : "Operação Salva!";
            alert(msg);
            e.target.reset(); document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = []; 
            renderizarListaAjudantesAdicionados();
            
            // Força atualização da UI
            preencherTodosSelects(); 
            renderizarCalendario(); 
            atualizarDashboard();
        });
    }
});

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES E RENDERIZAÇÃO
// -----------------------------------------------------------------------------

window.toggleDriverFields = function() { var select = document.getElementById('funcFuncao'); var divMotorista = document.getElementById('driverSpecificFields'); if (select && divMotorista) { divMotorista.style.display = (select.value === 'motorista') ? 'block' : 'none'; } };
window.toggleDespesaParcelas = function() { var modo = document.getElementById('despesaModoPagamento').value; var div = document.getElementById('divDespesaParcelas'); if (div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none'; };
window.renderizarListaAjudantesAdicionados = function() { var ul = document.getElementById('listaAjudantesAdicionados'); if (!ul) return; ul.innerHTML = ''; (window._operacaoAjudantesTempList || []).forEach(item => { var func = buscarFuncionarioPorId(item.id); var nome = func ? func.nome : 'Desconhecido'; var li = document.createElement('li'); li.innerHTML = `<span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span><button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>`; ul.appendChild(li); }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var sel = document.getElementById('selectAjudantesOperacao'); var idAj = sel.value; if (!idAj) return alert("Selecione um ajudante."); if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Já está na lista."); var valor = prompt("Valor da Diária:"); if (valor) { window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); renderizarListaAjudantesAdicionados(); sel.value = ""; } });

window.limparOutroFiltro = function(tipo) {
    if (tipo === 'motorista') {
        document.getElementById('filtroMotoristaGrafico').value = "";
    } else {
        document.getElementById('filtroVeiculoGrafico').value = "";
    }
};

// FUNÇÃO MESTRE DE ATUALIZAÇÃO UI
function preencherTodosSelects() {
    console.log("Atualizando tabelas e selects...");
    const fill = (id, dados, valKey, textKey, defText) => { var el = document.getElementById(id); if (!el) return; var atual = el.value; el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); if(atual) el.value = atual; };
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    // Filtros
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

    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    if(typeof renderizarTabelaDespesasGerais === 'function') renderizarTabelaDespesasGerais();
    if(typeof renderizarTabelaMonitoramento === 'function') {
        renderizarTabelaMonitoramento();
        renderizarTabelaFaltas(); 
    }
}

// -----------------------------------------------------------------------------
// RENDERIZAÇÃO DE TABELAS
// -----------------------------------------------------------------------------

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var tr = document.createElement('tr');
        var btnDelete = window.MODO_APENAS_LEITURA ? '' : 
            `<button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button>`;
        
        var textoPgto = d.modoPagamento === 'parcelado' ? `PARCELADO (${d.parcelasTotal}x)` : 'À VISTA';
        
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td style="color:var(--danger-color); font-weight:bold;">${formatarValorMoeda(d.valor)}</td>
            <td>${textoPgto}</td>
            <td>${btnDelete}</td>
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
        
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-primary" onclick="visualizarFuncionario('${f.id}')" title="Visualizar"><i class="fas fa-eye"></i></button>
            <button class="btn-mini btn-warning" onclick="resetarSenhaFuncionario('${f.id}')" title="Resetar Senha"><i class="fas fa-key"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
        `; 
        
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

window.visualizarFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    const createCopyRow = (label, value) => {
        if (!value) return '';
        const valSafe = value.toString().replace(/'/g, "\\'");
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #eee; padding:8px 0;">
                <div><strong>${label}:</strong> <span style="color:#555;">${value}</span></div>
                <button onclick="copiarTexto('${valSafe}')" class="btn-mini btn-secondary" title="Copiar"><i class="fas fa-copy"></i></button>
            </div>
        `;
    };

    var html = `
        <div style="padding:10px;">
            <div style="text-align:center; margin-bottom:20px;">
                <i class="fas fa-user-circle" style="font-size:3rem; color:var(--primary-color);"></i>
                <h3 style="margin:10px 0 0 0;">${f.nome}</h3>
                <span class="status-pill pill-active">${f.funcao}</span>
                <p style="font-size:0.8rem; color:#888;">ID: ${f.id}</p>
            </div>
            ${createCopyRow('E-mail (Login)', f.email)}
            ${createCopyRow('Senha (Cadastro)', f.senhaVisual || '******')}
            ${createCopyRow('Telefone', f.telefone)}
            ${createCopyRow('CPF/RG', f.documento)}
            ${createCopyRow('Chave PIX', f.pix)}
            ${createCopyRow('Endereço', f.endereco)}
    `;

    if (f.funcao === 'motorista') {
        html += `
            <h4 style="margin-top:20px; color:var(--success-color); border-bottom:2px solid #eee;">DADOS CNH</h4>
            ${createCopyRow('Nº CNH', f.cnh)}
            ${createCopyRow('Validade', formatarDataParaBrasileiro(f.validadeCNH))}
            ${createCopyRow('Categoria', f.categoriaCNH)}
            ${createCopyRow('Cursos', f.cursoDescricao)}
        `;
    }
    html += `</div>`;
    var mb = document.getElementById('viewItemBody');
    if(mb) { mb.innerHTML = html; document.getElementById('viewItemModal').style.display = 'flex'; }
};

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => { alert("Copiado: " + texto); });
};

window.resetarSenhaFuncionario = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;
    var novaSenha = prompt(`DIGITE A NOVA SENHA PARA ${f.nome}:\n(Mínimo 6 caracteres)`);
    if (!novaSenha || novaSenha.length < 6) return alert("Senha inválida.");

    f.senhaVisual = novaSenha;
    await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    if (window.dbRef) {
        try {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", f.id), { senhaVisual: novaSenha });
            alert("Senha atualizada.");
        } catch (e) { alert("Senha salva localmente. Erro nuvem."); }
    }
};

function renderizarTabelaVeiculos() { var tbody = document.querySelector('#tabelaVeiculos tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_VEICULOS.forEach(v => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaContratantes() { var tbody = document.querySelector('#tabelaContratantes tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_CONTRATANTES.forEach(c => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaAtividades() { var tbody = document.querySelector('#tabelaAtividades tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_ATIVIDADES.forEach(a => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }

// EXCLUSÃO
window.excluirFuncionario = async function(id) { 
    if(!confirm("Excluir funcionário e revogar acesso?")) return; 
    if (window.dbRef) { try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); } catch(e) {} }
    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    alert("Funcionário removido."); preencherTodosSelects(); 
};
window.excluirVeiculo = function(placa) { if(!confirm("Excluir?")) return; salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); };
window.excluirContratante = function(cnpj) { if(!confirm("Excluir?")) return; salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); };
window.excluirAtividade = function(id) { if(!confirm("Excluir?")) return; salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); };
window.excluirOperacao = function(id) { if(!confirm("Excluir?")) return; salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); }); };

window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (!f) return; document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email || ''; document.getElementById('funcTelefone').value = f.telefone; document.getElementById('funcPix').value = f.pix || ''; document.getElementById('funcEndereco').value = f.endereco || ''; toggleDriverFields(); if (f.funcao === 'motorista') { document.getElementById('funcCNH').value = f.cnh || ''; document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); };
window.preencherFormularioVeiculo = function(placa) { var v = buscarVeiculoPorPlaca(placa); if (!v) return; document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.getElementById('veiculoAno').value = v.ano; document.getElementById('veiculoRenavam').value = v.renavam || ''; document.getElementById('veiculoChassi').value = v.chassi || ''; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); };
window.preencherFormularioContratante = function(cnpj) { var c = buscarContratantePorCnpj(cnpj); if (!c) return; document.getElementById('contratanteCNPJ').value = c.cnpj; document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; document.getElementById('contratanteTelefone').value = c.telefone; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); };
window.preencherFormularioOperacao = function(id) { var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return; document.getElementById('operacaoId').value = op.id; document.getElementById('operacaoData').value = op.data; document.getElementById('selectMotoristaOperacao').value = op.motoristaId; document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca; document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ; document.getElementById('selectAtividadeOperacao').value = op.atividadeId; document.getElementById('operacaoFaturamento').value = op.faturamento; document.getElementById('operacaoAdiantamento').value = op.adiantamento || ''; document.getElementById('operacaoComissao').value = op.comissao || ''; document.getElementById('operacaoDespesas').value = op.despesas || ''; document.getElementById('operacaoCombustivel').value = op.combustivel || ''; document.getElementById('operacaoPrecoLitro').value = op.precoLitro || ''; document.getElementById('operacaoKmRodado').value = op.kmRodado || ''; window._operacaoAjudantesTempList = op.ajudantes || []; renderizarListaAjudantesAdicionados(); document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'); document.querySelector('[data-page="operacoes"]').click(); };

window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;
    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'N/A';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'N/A';
    var atividade = buscarAtividadePorId(op.atividadeId)?.nome || 'N/A';
    var htmlAjudantes = 'Nenhum';
    if(op.ajudantes && op.ajudantes.length > 0) { htmlAjudantes = '<ul style="margin:0; padding-left:20px;">' + op.ajudantes.map(aj => { var f = buscarFuncionarioPorId(aj.id); return `<li>${f ? f.nome : 'Excluído'} (R$ ${formatarValorMoeda(aj.diaria)})</li>`; }).join('') + '</ul>'; }

    var html = `<div style="font-size: 0.95rem; color:#333;"><div style="background:#f5f5f5; padding:10px; border-radius:6px; margin-bottom:15px; border-left: 4px solid var(--primary-color);"><h4 style="margin:0 0 5px 0; color:var(--primary-color);">RESUMO DA VIAGEM #${op.id.substr(-4)}</h4><p><strong>Status:</strong> ${op.status}</p><p><strong>Data:</strong> ${formatarDataParaBrasileiro(op.data)}</p><p><strong>Cliente:</strong> ${cliente}</p><p><strong>Atividade:</strong> ${atividade}</p><p><strong>Veículo:</strong> ${op.veiculoPlaca}</p></div><div style="margin-bottom:15px;"><h4 style="border-bottom:1px solid #eee; padding-bottom:5px;">EQUIPE</h4><p><strong>Motorista:</strong> ${nomeMot}</p><p><strong>Ajudantes:</strong></p>${htmlAjudantes}</div><div style="background:#e8f5e9; padding:10px; border-radius:6px; margin-bottom:15px;"><h4 style="margin:0 0 10px 0; color:var(--success-color);">FINANCEIRO (ADMIN)</h4><p><strong>Faturamento:</strong> ${formatarValorMoeda(op.faturamento)}</p><p><strong>Adiantamento:</strong> ${formatarValorMoeda(op.adiantamento)}</p><p><strong>Comissão Mot.:</strong> ${formatarValorMoeda(op.comissao)}</p></div><div style="background:#fff3e0; padding:10px; border-radius:6px; border:1px solid #ffe0b2;"><h4 style="margin:0 0 10px 0; color:#e65100;">DADOS DO MOTORISTA (CHECK-IN)</h4><div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;"><div><strong>KM Inicial:</strong> ${op.kmInicial || '-'}</div><div><strong>KM Final:</strong> ${op.kmFinal || '-'}</div><div><strong>KM Rodado:</strong> ${op.kmRodado || '-'}</div><div><strong>Abastecimento:</strong> ${formatarValorMoeda(op.combustivel)}</div><div><strong>Despesas/Pedágio:</strong> ${formatarValorMoeda(op.despesas)}</div><div><strong>Preço Litro:</strong> R$ ${op.precoLitro || '0,00'}</div></div></div></div>`;
    var modalContent = document.getElementById('viewItemBody');
    if(modalContent) { modalContent.innerHTML = html; document.getElementById('viewItemModal').style.display = 'flex'; }
};

window.renderizarTabelaOperacoes = function() { 
    var tbody = document.querySelector('#tabelaOperacoes tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    var lista = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data)); 
    lista.forEach(op => { 
        if(op.status === 'CANCELADA') return; 
        var mot = buscarFuncionarioPorId(op.motoristaId); 
        var nomeMot = mot ? mot.nome : 'Excluído'; 
        var statusLabel = op.status === 'FINALIZADA' ? 'FINALIZADA' : (op.status === 'CONFIRMADA' ? 'CONFIRMADA' : (op.status === 'EM_ANDAMENTO' ? 'EM ROTA' : 'AGENDADA'));
        var statusClass = (op.status === 'FINALIZADA' || op.status === 'CONFIRMADA') ? 'pill-active' : 'pill-pending';
        var styleAdd = (op.status === 'EM_ANDAMENTO') ? 'style="background:orange; color:white;"' : '';
        var btnView = `<button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        var btnActions = btnView; 
        if (!window.MODO_APENAS_LEITURA) { btnActions += ` <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>`; } 
        var tr = document.createElement('tr'); 
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td><td><span class="status-pill ${statusClass}" ${styleAdd}>${statusLabel}</span></td><td style="color:green; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
};

// Fechar Modais
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };
function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }
// =============================================================================
// PARTE 4: MONITORAMENTO, RELATÓRIOS, RECIBOS E LÓGICA DO FUNCIONÁRIO
// =============================================================================

// --- MONITORAMENTO ---
window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa.</td></tr>';
        document.getElementById('badgeCheckins').style.display = 'none';
        return;
    }

    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = 'inline-block';
    }

    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var statusHtml = op.status === 'EM_ANDAMENTO' 
            ? '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>' 
            : '<span class="status-pill pill-pending">AGENDADA</span>';

        var mot = buscarFuncionarioPorId(op.motoristaId);
        if (mot) {
            var checkInFeito = (op.checkins && op.checkins.motorista);
            var faltou = (op.checkins && op.checkins.faltaMotorista);
            var statusEq = faltou ? '<span style="color:red">FALTA</span>' : (checkInFeito ? '<span style="color:green">OK</span>' : '...');
            
            var btnFalta = faltou ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${mot.id}','motorista')">FALTA</button>`;
            
            var tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${mot.nome}</strong><br><small>${op.veiculoPlaca}</small></td><td>${cliente}</td><td>${statusHtml}</td><td>${statusEq}</td><td>${btnFalta}</td>`;
            tbody.appendChild(tr);
        }
        
        if (op.ajudantes) {
            op.ajudantes.forEach(ajItem => {
                var aj = buscarFuncionarioPorId(ajItem.id);
                if(aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = faltouAj ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${aj.id}','ajudante')">FALTA</button>`;
                    var trAj = document.createElement('tr');
                    trAj.style.background = "#f9f9f9";
                    trAj.innerHTML = `<td style="border:none;"></td><td>${aj.nome} (Ajud)</td><td colspan="3" style="color:#777;"><small>^ Vinculado</small></td><td>${btnFaltaAj}</td>`;
                    tbody.appendChild(trAj);
                }
            });
        }
    });
};

window.registrarFalta = async function(opId, funcId, tipo) {
    if (!confirm("Confirmar FALTA?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;
    if (!op.checkins) op.checkins = { motorista: false, faltaMotorista: false, faltas: {} };
    if (!op.checkins.faltas) op.checkins.faltas = {};

    if (tipo === 'motorista') { op.checkins.faltaMotorista = true; op.checkins.motorista = false; }
    else { op.checkins.faltas[funcId] = true; }
    
    await salvarListaOperacoes(CACHE_OPERACOES);
    renderizarTabelaMonitoramento();
    atualizarDashboard();
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td><button class="btn-mini btn-secondary">VER</button></td></tr>`;
        }
        if(op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(k => {
                if(op.checkins.faltas[k]) {
                    var a = buscarFuncionarioPorId(k);
                    if(a) tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${a.nome}</td><td>AJUDANTE</td><td>FALTA</td><td><button class="btn-mini btn-secondary">VER</button></td></tr>`;
                }
            });
        }
    });
};

// --- GESTÃO DE EQUIPE (FUNCIONÁRIOS ATIVOS) ---
window.renderizarPainelEquipe = async function() {
    // 1. Tabela Funcionários Ativos (Local)
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        if (CACHE_FUNCIONARIOS.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        } else {
            CACHE_FUNCIONARIOS.forEach(f => {
                var tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${f.nome}</td>
                    <td>${f.funcao.toUpperCase()}</td>
                    <td><span class="status-pill pill-active">ATIVO</span></td>
                    <td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button></td>
                `;
                tbodyAtivos.appendChild(tr);
            });
        }
    }

    // 2. Pendentes (Nuvem)
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
                    tbodyPend.innerHTML += `<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">OK</button></td></tr>`;
                });
            }
        } catch(e) { console.error(e); }
    }
    
    // 3. Solicitações de Perfil
    var tbodyReq = document.getElementById('tabelaProfileRequests')?.querySelector('tbody');
    if(tbodyReq) {
        tbodyReq.innerHTML = '';
        CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE').forEach(req => {
            var f = buscarFuncionarioPorId(req.funcionarioId);
            tbodyReq.innerHTML += `<tr><td>${formatarDataParaBrasileiro(req.data)}</td><td>${f?f.nome:'-'}</td><td>${req.campo}</td><td>${req.valorNovo}</td><td><button class="btn-mini btn-success" onclick="aprovarProfileRequest('${req.id}')">OK</button></td></tr>`;
        });
    }
};

window.aprovarUsuario = async function(uid) {
    if(!confirm("Aprovar?")) return;
    try { await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true }); renderizarPainelEquipe(); } catch(e){alert(e.message);}
};

// ... (Restante das funções de Relatórios e Recibos mantidas iguais, omitidas para brevidade pois já estão ok) ...
// Certifique-se de que gerarRelatorioGeral, gerarRelatorioCobranca, gerarReciboPagamento, etc. estejam aqui conforme Parte 4 anterior.
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO (FIX FINAL)
// =============================================================================

const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// -----------------------------------------------------------------------------
// PAINEL SUPER ADMIN (MASTER)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Atualizando lista...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        
        // Busca Forçada na Nuvem
        const companiesSnap = await getDocs(collection(db, "companies"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        const users = [];
        usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if(companies.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma empresa encontrada.</div>';
            return;
        }

        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            // Tratamento de Erros Visuais
            let statusBadge = comp.isBlocked ? 
                `<span class="status-pill pill-paused">BLOQUEADO</span>` : 
                (comp.isVitalicio ? `<span class="status-pill pill-active">VITALÍCIO</span>` : 
                (comp.systemValidity && new Date(comp.systemValidity) < new Date() ? `<span class="status-pill pill-blocked">VENCIDO</span>` : `<span class="status-pill pill-active">ATIVO</span>`));
            
            let validadeTexto = comp.isVitalicio ? "VITALÍCIO" : (comp.systemValidity ? formatarDataParaBrasileiro(comp.systemValidity) : "SEM DADOS");
            let borderColor = comp.isBlocked ? "var(--danger-color)" : (comp.isVitalicio ? "gold" : "#ddd");

            const div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = `margin-bottom:15px; border:1px solid ${borderColor}; border-radius:8px; background:white; overflow:hidden;`;

            div.innerHTML = `
                <div class="company-header" onclick="toggleCompanyDetails(this)" style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#f8f9fa;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="background:var(--primary-color); color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                            ${comp.id.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                            <h4 style="margin:0; text-transform:uppercase;">${comp.id}</h4>
                            <small style="color:#666;">Admin: ${admin ? admin.email : '<span style="color:red">Não Identificado / Erro</span>'}</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="text-align:right;">
                            <div style="font-size:0.7rem; color:#888;">VALIDADE</div>
                            <strong style="font-size:0.9rem;">${validadeTexto}</strong>
                        </div>
                        ${statusBadge}
                        <button class="btn-mini btn-primary" onclick="event.stopPropagation(); abrirModalCreditos('${comp.id}', '${comp.systemValidity||''}', ${comp.isVitalicio||false}, ${comp.isBlocked||false})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-mini btn-danger" onclick="event.stopPropagation(); excluirEmpresaTotal('${comp.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="company-body" style="display:none; padding:20px; border-top:1px solid #eee;">
                    <h5 style="color:#666;">USUÁRIOS (${usersDaEmpresa.length})</h5>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>NOME</th><th>EMAIL</th><th>SENHA</th><th>AÇÃO</th></tr></thead>
                        <tbody>
                            ${usersDaEmpresa.map(u => `
                                <tr>
                                    <td>${u.name}</td>
                                    <td>${u.email}</td>
                                    <td style="font-family:monospace; color:#007bff;">${u.senhaVisual || '***'}</td>
                                    <td>
                                        <button class="btn-mini btn-warning" onclick="resetarSenhaComMigracao('${u.uid}', '${u.email}', '${u.name}')">RESET</button>
                                        <button class="btn-mini btn-danger" onclick="excluirUsuarioGlobal('${u.uid}')">DEL</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red">Erro: ${e.message}</p>`;
    }
};

window.toggleCompanyDetails = function(header) {
    const body = header.nextElementSibling;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
};

// --- FUNÇÃO CRÍTICA: CRIAR EMPRESA (COM RECUPERAÇÃO DE ERRO) ---
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("Domínio inválido.");

        const { db, doc, setDoc, getDocs, query, collection, where } = window.dbRef;

        try {
            // 1. Tenta criar Auth
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            
            // 2. Se passar, cria Usuário Admin no DB
            await setDoc(doc(db, "users", uid), {
                uid: uid, name: "ADMIN " + dominio.toUpperCase(), email: email, role: 'admin', 
                company: dominio, createdAt: new Date().toISOString(), approved: true, 
                isVitalicio: false, isBlocked: false, senhaVisual: senha,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            });

        } catch (erro) {
            // SE O EMAIL JÁ EXISTE (O Erro da imagem)
            if (erro.code === 'auth/email-already-in-use') {
                if(!confirm(`O e-mail ${email} JÁ EXISTE no sistema.\n\nDeseja criar apenas a empresa "${dominio}" e tentar vincular esse usuário depois?`)) {
                    return;
                }
                // Prossegue para criar apenas a empresa
            } else {
                return alert("Erro fatal: " + erro.message);
            }
        }

        try {
            // 3. Cria/Garante Documento da Empresa (Para aparecer na lista)
            await setDoc(doc(db, "companies", dominio), { 
                id: dominio, createdAt: new Date().toISOString(),
                isBlocked: false, isVitalicio: false,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            }, { merge: true }); // Merge evita sobrescrever se já existir

            alert(`Processo concluído para: ${dominio}`);
            e.target.reset();
            carregarPainelSuperAdmin();

        } catch (dbError) {
            alert("Erro ao salvar dados da empresa: " + dbError.message);
        }
    }
});

// --- GESTÃO DE CRÉDITOS E BLOQUEIO ---
window.abrirModalCreditos = function(companyId, validade, isVitalicio, isBlocked) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    
    var texto = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade.split('T')[0]) : "SEM REGISTRO");
    document.getElementById('validadeAtualCredito').textContent = texto;
    
    // Verificações de segurança (Evita erro null)
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var elDivAdd = document.getElementById('divAddCreditos');

    if(elVitalicio) elVitalicio.checked = isVitalicio;
    if(elBloqueado) elBloqueado.checked = isBlocked;
    if(elDivAdd) elDivAdd.style.display = isVitalicio ? 'none' : 'block';
    
    if(elVitalicio) {
        elVitalicio.onchange = function() { 
            if(elDivAdd) elDivAdd.style.display = this.checked ? 'none' : 'block'; 
        };
    }
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    
    // Leitura Segura
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var isVitalicio = elVitalicio ? elVitalicio.checked : false;
    var isBloqueado = elBloqueado ? elBloqueado.checked : false;
    
    var meses = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        const { db, collection, query, where, getDocs, updateDoc, doc, setDoc, writeBatch } = window.dbRef;
        
        var dadosEmpresa = { isVitalicio: isVitalicio, isBlocked: isBloqueado };
        var novaData = null;

        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            var base = new Date();
            // Se já tem validade futura, soma nela
            if(!snap.empty) {
                var adm = snap.docs[0].data();
                if(adm.systemValidity && new Date(adm.systemValidity) > base) base = new Date(adm.systemValidity);
            }
            // Soma os meses
            if (meses > 0) base.setDate(base.getDate() + (meses * 30));
            
            novaData = base.toISOString();
            dadosEmpresa.systemValidity = novaData;
        }

        // 1. Atualiza Empresa
        await setDoc(doc(db, "companies", companyId), dadosEmpresa, { merge: true });

        // 2. Atualiza Usuários (Batch)
        const qUsers = query(collection(db, "users"), where("company", "==", companyId));
        const snapUsers = await getDocs(qUsers);
        const batch = writeBatch(db);
        
        snapUsers.forEach(uDoc => {
            let updateData = { isBlocked: isBloqueado, isVitalicio: isVitalicio };
            if (novaData) updateData.systemValidity = novaData;
            batch.update(uDoc.ref, updateData);
        });
        await batch.commit();

        alert("Empresa atualizada com sucesso!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();
    } catch(e) { alert("Erro: " + e.message); }
};

window.excluirEmpresaTotal = async function(companyId) {
    if (prompt(`Digite "DELETAR" para apagar a empresa ${companyId} e TODOS os usuários:`) !== "DELETAR") return;
    try {
        const { db, collection, query, where, getDocs, doc, writeBatch } = window.dbRef;
        const batch = writeBatch(db);
        
        // Deleta usuários
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
        // Deleta empresa
        batch.delete(doc(db, "companies", companyId));
        
        await batch.commit();
        alert("Empresa excluída.");
        carregarPainelSuperAdmin();
    } catch (e) { alert("Erro: " + e.message); }
};

// ... (Funções Reset Senha e Excluir Usuário Global mantidas iguais à versão anterior) ...
window.resetarSenhaComMigracao = async function(oldUid, email, nome) {
    var novaSenha = prompt(`NOVA SENHA PARA ${nome}:`);
    if(!novaSenha || novaSenha.length < 6) return alert("Mín 6 dígitos.");
    try {
        let newUid = await window.dbRef.criarAuthUsuario(email, novaSenha);
        const { db, doc, getDoc, setDoc, deleteDoc } = window.dbRef;
        const oldRef = doc(db, "users", oldUid);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
            const data = oldSnap.data();
            data.uid = newUid; data.senhaVisual = novaSenha;
            await setDoc(doc(db, "users", newUid), data);
            await deleteDoc(oldRef);
        }
        alert("Senha alterada."); carregarPainelSuperAdmin();
    } catch (e) { alert("Erro: " + e.message); }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(!confirm("Remover usuário?")) return;
    try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid)); carregarPainelSuperAdmin(); } 
    catch(e) { alert(e.message); }
};

// -----------------------------------------------------------------------------
// MEUS DADOS (FUNCIONÁRIO)
// -----------------------------------------------------------------------------
window.renderizarMeusDados = function() {
    var user = window.USUARIO_ATUAL;
    var dados = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(user.uid)) || user;
    var html = `
        <div style="background:white; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-user-circle" style="font-size:3rem; color:var(--primary-color);"></i>
            <h3>${dados.nome || dados.name}</h3><span class="status-pill pill-active">${dados.funcao || dados.role}</span>
            <div style="margin-top:20px; text-align:left;">
                ${makeLine('Telefone', dados.telefone, 'TELEFONE')}
                ${makeLine('Endereço', dados.endereco, 'ENDERECO')}
                ${makeLine('PIX', dados.pix, 'PIX')}
            </div>
        </div>`;
    var c = document.getElementById('meusDadosContainer'); if(c) c.innerHTML = html;
};
function makeLine(l, v, f) { return `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #eee;"><div><strong>${l}:</strong> ${v||'-'}</div><button class="btn-mini btn-secondary" onclick="solicitarAlt('${f}','${v}')"><i class="fas fa-pen"></i></button></div>`; }
window.solicitarAlt = function(c, v) { var n=prompt("Novo valor:",v); if(n&&n!==v) { var r={id:Date.now().toString(), data:new Date().toISOString(), funcionarioId:window.USUARIO_ATUAL.uid, funcionarioEmail:window.USUARIO_ATUAL.email, campo:c, valorAntigo:v, valorNovo:n, status:'PENDENTE'}; CACHE_PROFILE_REQUESTS.push(r); salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(()=>alert("Solicitado!")); }};

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO
// -----------------------------------------------------------------------------
window.initSystemByRole = async function(user) {
    console.log("INIT:", user.role);
    window.USUARIO_ATUAL = user;
    
    // 1. Esconde tudo
    document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // 2. Super Admin (Bypass Sync)
    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        var p = document.getElementById('super-admin');
        p.style.display = 'block'; setTimeout(() => p.classList.add('active'), 50);
        carregarPainelSuperAdmin();
        return;
    }

    // 3. Sync Dados (Admin/Func)
    await sincronizarDadosComFirebase();
    preencherTodosSelects();

    if (user.role === 'admin') {
        if(user.isBlocked) return document.body.innerHTML = "<h1 style='text-align:center;margin-top:50px;color:red'>BLOQUEADO</h1>";
        document.getElementById('menu-admin').style.display = 'block';
        var h = document.getElementById('home');
        if(h) { h.style.display='block'; setTimeout(()=>h.classList.add('active'), 50); }
        atualizarDashboard();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home');
        if(eh) { eh.style.display='block'; setTimeout(()=>eh.classList.add('active'), 50); }
        renderizarCheckinFuncionario();
        renderizarMeusDados();
    }
};

// Navegação
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
        this.classList.add('active');
        var t = document.getElementById(this.getAttribute('data-page'));
        if(t) { t.style.display='block'; setTimeout(()=>t.classList.add('active'), 10); }
        if(window.innerWidth<=768) document.getElementById('sidebar').classList.remove('active');
        var pg = this.getAttribute('data-page');
        if(pg==='home') atualizarDashboard();
        if(pg==='meus-dados') renderizarMeusDados();
        if(pg==='employee-checkin') renderizarCheckinFuncionario();
    });
});
document.getElementById('mobileMenuBtn')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.remove('active'));