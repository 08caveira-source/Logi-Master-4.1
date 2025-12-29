// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 4.3 (COMPLETA E EXPANDIDA)
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
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// VARIÁVEIS DO SISTEMA DE CRÉDITOS E SEGURANÇA
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Sincronizado com a memória RAM)
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

function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    // Espera formato YYYY-MM-DD ou data ISO completa
    var partes = dataIso.split('T')[0].split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

function removerAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// -----------------------------------------------------------------------------
// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
// -----------------------------------------------------------------------------

function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// FUNÇÃO CRÍTICA: Baixa TODOS os dados da nuvem ao iniciar
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Usuário offline ou sem empresa definida. Usando cache local.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(lista);
                }
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]); 
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave} do Firebase:`, e);
        }
    }

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

    console.log(">>> SINCRONIA CONCLUÍDA. Memória atualizada.");
}

function carregarTodosDadosLocais() {
    function load(chave) {
        try {
            var dados = localStorage.getItem(chave);
            return dados ? JSON.parse(dados) : [];
        } catch (erro) {
            return [];
        }
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

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
             console.warn("Salvamento bloqueado: Sistema sem créditos.");
             return;
        }

        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
        }
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
// PARTE 2: DASHBOARD E FINANCEIRO (LÓGICA FINANCEIRA REAL)
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

// --- HELPER: CÁLCULO DE MÉDIA GLOBAL DO VEÍCULO ---
window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(op) {
        var matchPlaca = (op.veiculoPlaca === placa);
        var matchStatus = (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA');
        return matchPlaca && matchStatus;
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var preco = Number(op.precoLitro) || 0;
        
        if (km > 0 && valorAbastecido > 0 && preco > 0) {
            totalKm += km;
            totalLitros += (valorAbastecido / preco);
        }
    });

    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

// HELPER: PREÇO MÉDIO COMBUSTÍVEL
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 6.00; // Fallback se não houver dados
    var ultimas = ops.slice(-5);
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

// FUNÇÃO UNIFICADA: CÁLCULO DE CUSTO COMBUSTÍVEL PROPORCIONAL
window.calcularCustoCombustivelOperacao = function(op) {
    // Se não rodou, o custo é zero (ou o abastecimento direto se preferir, aqui usaremos consumo)
    if (!op.kmRodado || op.kmRodado <= 0) return Number(op.combustivel) || 0;
    
    // Se não tem veículo vinculado, retorna o valor declarado
    if (!op.veiculoPlaca) return Number(op.combustivel) || 0;

    var media = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    
    // Se não tem histórico para média, usa o valor declarado
    if (media <= 0) return Number(op.combustivel) || 0;

    var preco = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // FÓRMULA: (KM Rodado / Média Km/L) * Preço Litro
    return (op.kmRodado / media) * preco;
};

// --- LÓGICA CENTRAL DO DASHBOARD ---
window.atualizarDashboard = function() {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    console.log("Calculando Dashboard (Consumo Real)...");
    
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
        
        // Custo Combustível Proporcional
        var opCombustivel = window.calcularCustoCombustivelOperacao(op);

        var custoOp = (Number(op.despesas) || 0) + opCombustivel;
        
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
            var qtdParcelas = Number(desp.parcelasTotal);
            var valorParcela = valorTotal / qtdParcelas;
            var intervalo = Number(desp.intervaloDias) || 30;
            for (var i = 0; i < qtdParcelas; i++) {
                var dataParcela = new Date(dataDesp);
                dataParcela.setDate(dataParcela.getDate() + (i * intervalo));
                if (dataParcela.getMonth() === mesAtual && dataParcela.getFullYear() === anoAtual) {
                    custosMes += valorParcela;
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
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    var filtroVeiculo = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var filtroMotorista = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    var summaryContainer = document.getElementById('chartVehicleSummaryContainer');

    var stats = { faturamento: 0, custos: 0, lucro: 0, viagens: 0, faltas: 0, kmTotal: 0, litrosTotal: 0 };
    var gReceita = 0; var gCombustivel = 0; var gPessoal = 0; var gManutencao = 0; 

    // Operações
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            if (filtroMotorista && op.checkins && op.checkins.faltaMotorista) stats.faltas++;

            var receitaOp = Number(op.faturamento) || 0;
            
            // Custo Combustível Real (Proporcional)
            var combustivelOp = window.calcularCustoCombustivelOperacao(op);

            var despesasOp = Number(op.despesas) || 0; 
            var comissaoOp = 0;
            if (!op.checkins || !op.checkins.faltaMotorista) comissaoOp = Number(op.comissao) || 0;
            if (op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) comissaoOp += (Number(aj.diaria)||0); });

            stats.viagens++;
            stats.faturamento += receitaOp;
            stats.custos += (combustivelOp + despesasOp + comissaoOp);
            stats.kmTotal += (Number(op.kmRodado) || 0);

            gReceita += receitaOp; gCombustivel += combustivelOp; gPessoal += comissaoOp; gManutencao += despesasOp; 

            var precoReal = Number(op.precoLitro) || 0;
            if (precoReal > 0 && Number(op.combustivel) > 0) stats.litrosTotal += (Number(op.combustivel) / precoReal);
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
            if (desc.includes("manutencao") || desc.includes("oleo") || desc.includes("peca")) gManutencao += valorComputado;
            else if (desc.includes("comida") || desc.includes("hotel")) gPessoal += valorComputado;
            else gManutencao += valorComputado;
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
        if (filtroVeiculo || filtroMotorista) {
            var tituloBox = filtroVeiculo ? "VEÍCULO" : "MOTORISTA";
            var valorTitulo = filtroVeiculo || (CACHE_FUNCIONARIOS.find(f => f.id == filtroMotorista)?.nome || "Desconhecido");
            var boxExtraLabel = filtroMotorista ? "FALTAS" : "MÉDIA REAL";
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
            labels: ['FATURAMENTO', 'COMBUSTÍVEL (REAL)', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'R$',
                data: [gReceita, gCombustivel, gPessoal, gManutencao, (gReceita - (gCombustivel+gPessoal+gManutencao))],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// -----------------------------------------------------------------------------
// CALENDÁRIO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate || new Date();
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
        var opsDoDia = (CACHE_OPERACOES || []).filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            var color = opsDoDia.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';

            cellContent += `<div class="event-dot" style="background:${color}"></div>`;
            cellContent += `<div style="font-size:0.65em; color:green; margin-top:auto;">${formatarValorMoeda(totalDia)}</div>`;
            
            (function(ds) { cell.onclick = function() { abrirModalDetalhesDia(ds); }; })(dateStr);
        } else {
            (function(ds) { cell.onclick = function() { document.getElementById('operacaoData').value = ds; var btn = document.querySelector('[data-page="operacoes"]'); if(btn) btn.click(); }; })(dateStr);
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

// --- MODAL DETALHES DIA (COM BOTÃO CORRIGIDO E FINANCEIRO REAL) ---
window.abrirModalDetalhesDia = function(dataString) {
    var ops = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'OPERAÇÕES: ' + dataFormatada;
    
    // Resumo do Dia
    var tFat = 0, tCust = 0;
    ops.forEach(o => {
        tFat += (Number(o.faturamento)||0);
        var cComb = window.calcularCustoCombustivelOperacao(o);
        var cOutros = (Number(o.despesas)||0);
        if (!o.checkins?.faltaMotorista) cOutros += (Number(o.comissao)||0);
        if (o.ajudantes) o.ajudantes.forEach(aj => { if(!(o.checkins?.faltas?.[aj.id])) cOutros += (Number(aj.diaria)||0); });
        tCust += (cComb + cOutros);
    });

    if (modalSummary) {
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px; text-align:center; background:#f5f5f5; padding:8px; border-radius:6px; font-size:0.85rem;">
                <div><small>FAT</small><br><strong style="color:green">${formatarValorMoeda(tFat)}</strong></div>
                <div><small>CUSTO</small><br><strong style="color:red">${formatarValorMoeda(tCust)}</strong></div>
                <div><small>LUCRO</small><br><strong style="color:blue">${formatarValorMoeda(tFat-tCust)}</strong></div>
            </div>
        `;
    }

    var html = '<div style="max-height:400px; overflow-y:auto;">';
    if(ops.length === 0) html = '<p style="text-align:center">Sem operações.</p>';
    
    ops.forEach(op => {
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        
        html += `
            <div style="border:1px solid #ddd; margin-bottom:10px; border-radius:5px; padding:10px; background:white;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;">
                    <span>${c}</span> <span style="color:${op.status==='EM_ANDAMENTO'?'orange':'#666'}">${op.status}</span>
                </div>
                <div style="font-size:0.85rem; color:#555; margin:5px 0;">
                    ${op.veiculoPlaca} | Mot: ${m.split(' ')[0]}
                </div>
                <button class="btn-mini btn-secondary" style="width:100%" onclick="document.getElementById('modalDayOperations').style.display='none'; visualizarOperacao('${op.id}')">VER DETALHES COMPLETOS</button>
            </div>
        `;
    });
    html += '</div>';
    
    modalBody.innerHTML = html;
    document.getElementById('modalDayOperations').style.display='block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE
// =============================================================================

// *** LÓGICA DAS ABAS ***
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        const targetForm = document.getElementById(btn.getAttribute('data-tab'));
        if (targetForm) {
            targetForm.classList.add('active');
            preencherTodosSelects(); // Atualiza a tabela visível
        }
    });
});

// 1. SALVAR FUNCIONÁRIO (COM CORREÇÃO DE EMAIL DUPLICADO)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]'); btn.disabled=true; btn.innerHTML='...';
        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value; 
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            var novoUID = id; 

            // Criação de Login
            if (!document.getElementById('funcionarioId').value && senha) {
                if(senha.length < 6) throw new Error("Senha min 6 dígitos.");
                try {
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                        uid: novoUID, name: nome, email: email, role: funcao, company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(), approved: true, senhaVisual: senha
                    });
                } catch (authError) {
                    if (authError.code === 'auth/email-already-in-use') {
                        if (!confirm(`O e-mail ${email} já existe. Deseja cadastrar os dados do funcionário mesmo assim?`)) {
                            throw new Error("Cancelado.");
                        }
                    } else {
                        throw authError;
                    }
                }
            }

            var obj = {
                id: novoUID, nome: nome, funcao: funcao, documento: document.getElementById('funcDocumento').value,
                email: email, telefone: document.getElementById('funcTelefone').value, pix: document.getElementById('funcPix').value, 
                endereco: document.getElementById('funcEndereco').value, cnh: document.getElementById('funcCNH').value, 
                validadeCNH: document.getElementById('funcValidadeCNH').value, categoriaCNH: document.getElementById('funcCategoriaCNH').value, 
                cursoDescricao: document.getElementById('funcCursoDescricao').value
            };
            if (senha) obj.senhaVisual = senha;

            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(obj);
            await salvarListaFuncionarios(lista);
            
            alert("Salvo!"); e.target.reset(); document.getElementById('funcionarioId').value=''; toggleDriverFields(); preencherTodosSelects();
        } catch (erro) { if(erro.message!=="Cancelado.") alert("Erro: " + erro.message); } finally { btn.disabled=false; btn.innerHTML='SALVAR'; }
    }
});

// OUTROS CADASTROS
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formVeiculo') { e.preventDefault(); var pl = document.getElementById('veiculoPlaca').value.toUpperCase(); var novo = { placa: pl, modelo: document.getElementById('veiculoModelo').value.toUpperCase(), ano: document.getElementById('veiculoAno').value, renavam: document.getElementById('veiculoRenavam').value, chassi: document.getElementById('veiculoChassi').value }; var l = CACHE_VEICULOS.filter(v => v.placa !== pl); l.push(novo); salvarListaVeiculos(l).then(() => { alert("Salvo!"); e.target.reset(); preencherTodosSelects(); }); } 
});
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formContratante') { e.preventDefault(); var c = document.getElementById('contratanteCNPJ').value; var novo = { cnpj: c, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value }; var l = CACHE_CONTRATANTES.filter(x => x.cnpj !== c); l.push(novo); salvarListaContratantes(l).then(() => { alert("Salvo!"); e.target.reset(); preencherTodosSelects(); }); } 
});
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formAtividade') { e.preventDefault(); var id = document.getElementById('atividadeId').value || Date.now().toString(); var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() }; var l = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id)); l.push(novo); salvarListaAtividades(l).then(() => { alert("Salvo!"); e.target.reset(); document.getElementById('atividadeId').value=''; preencherTodosSelects(); }); } 
});
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formMinhaEmpresa') { e.preventDefault(); salvarDadosMinhaEmpresa({ razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj: document.getElementById('minhaEmpresaCNPJ').value, telefone: document.getElementById('minhaEmpresaTelefone').value }).then(() => { alert("Atualizado!"); renderizarInformacoesEmpresa(); }); } 
});
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault(); var id = document.getElementById('despesaGeralId').value || Date.now().toString();
        var nv = { id: id, data: document.getElementById('despesaGeralData').value, veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value, descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(), valor: Number(document.getElementById('despesaGeralValor').value), formaPagamento: document.getElementById('despesaFormaPagamento').value, modoPagamento: document.getElementById('despesaModoPagamento').value, parcelasTotal: document.getElementById('despesaParcelas').value, parcelasPagas: document.getElementById('despesaParcelasPagas').value, intervaloDias: document.getElementById('despesaIntervaloDias').value };
        var l = CACHE_DESPESAS.filter(d => String(d.id) !== String(id)); l.push(nv);
        salvarListaDespesas(l).then(() => { alert("Salvo!"); e.target.reset(); document.getElementById('despesaGeralId').value=''; toggleDespesaParcelas(); renderizarTabelaDespesasGerais(); atualizarDashboard(); });
    }
});

// OPERAÇÃO
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault(); var id = document.getElementById('operacaoId').value;
        var old = id ? CACHE_OPERACOES.find(o => String(o.id) === String(id)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var st = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        if (old && !isAgendamento && (old.status === 'EM_ANDAMENTO' || old.status === 'FINALIZADA')) st = old.status; 
        
        var op = {
            id: id || Date.now().toString(), data: document.getElementById('operacaoData').value, motoristaId: document.getElementById('selectMotoristaOperacao').value, veiculoPlaca: document.getElementById('selectVeiculoOperacao').value, contratanteCNPJ: document.getElementById('selectContratanteOperacao').value, atividadeId: document.getElementById('selectAtividadeOperacao').value,
            faturamento: document.getElementById('operacaoFaturamento').value, adiantamento: document.getElementById('operacaoAdiantamento').value, comissao: document.getElementById('operacaoComissao').value, despesas: document.getElementById('operacaoDespesas').value, combustivel: document.getElementById('operacaoCombustivel').value, precoLitro: document.getElementById('operacaoPrecoLitro').value, kmRodado: document.getElementById('operacaoKmRodado').value,
            status: st, checkins: old?old.checkins:{motorista:false,faltaMotorista:false,ajudantes:{}}, ajudantes: window._operacaoAjudantesTempList || [], kmInicial: old?old.kmInicial:0, kmFinal: old?old.kmFinal:0
        };
        var l = CACHE_OPERACOES.filter(o => String(o.id) !== String(op.id)); l.push(op);
        salvarListaOperacoes(l).then(() => { alert("Salvo!"); e.target.reset(); document.getElementById('operacaoId').value = ''; document.getElementById('operacaoIsAgendamento').checked = false; window._operacaoAjudantesTempList = []; renderizarListaAjudantesAdicionados(); preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); });
    }
});

// VISUALIZAÇÃO DE OPERAÇÃO (MODAL COMPLETO)
window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return;
    var mot = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
    var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
    var serv = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    var hAj = op.ajudantes ? op.ajudantes.map(a=>buscarFuncionarioPorId(a.id)?.nome).join(', ') : 'Nenhum';

    // Cálculo Real para Visualização
    var cComb = window.calcularCustoCombustivelOperacao(op);
    var cTotal = (Number(op.despesas)||0) + cComb + (Number(op.comissao)||0);
    if(op.ajudantes) op.ajudantes.forEach(aj => cTotal += (Number(aj.diaria)||0));
    var lucro = (Number(op.faturamento)||0) - cTotal;

    var html = `
        <div style="font-size:0.9rem">
            <div style="background:#f8f9fa;padding:15px;border-radius:6px;margin-bottom:10px;border-left:5px solid var(--primary-color)">
                <h3 style="margin:0;color:var(--primary-color)">VIAGEM #${op.id.substr(-4)}</h3>
                <p>Data: ${formatarDataParaBrasileiro(op.data)} | Status: ${op.status}</p>
                <p>Cliente: ${cli}</p>
                <p>Serviço: ${serv}</p>
            </div>
            <div style="margin-bottom:15px">
                <h4>VEÍCULO & EQUIPE</h4>
                <p>Veículo: ${op.veiculoPlaca}</p>
                <p>Motorista: ${mot}</p>
                <p>Ajudantes: ${hAj}</p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div style="background:#e8f5e9;padding:10px;border-radius:6px">
                    <h4 style="color:green;margin:0">RECEITA</h4>
                    <p style="font-size:1.1rem;font-weight:bold">${formatarValorMoeda(op.faturamento)}</p>
                    <small>Adiant: ${formatarValorMoeda(op.adiantamento)}</small>
                </div>
                <div style="background:#ffebee;padding:10px;border-radius:6px">
                    <h4 style="color:red;margin:0">CUSTO REAL</h4>
                    <div style="display:flex;justify-content:space-between"><span>Combustível (Est):</span><strong>${formatarValorMoeda(cComb)}</strong></div>
                    <div style="display:flex;justify-content:space-between"><span>Outros:</span><span>${formatarValorMoeda(cTotal-cComb)}</span></div>
                    <hr style="margin:5px 0">
                    <div style="display:flex;justify-content:space-between"><strong>TOTAL:</strong><strong>${formatarValorMoeda(cTotal)}</strong></div>
                </div>
            </div>
            <div style="background:#e3f2fd;padding:10px;text-align:center;margin-top:10px;border-radius:6px">
                <small>LUCRO LÍQUIDO</small><br><strong style="font-size:1.3rem;color:${lucro>=0?'blue':'red'}">${formatarValorMoeda(lucro)}</strong>
            </div>
        </div>
    `;
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'flex';
};

// UI Helpers e Tabelas
window.toggleDriverFields=function(){var s=document.getElementById('funcFuncao'),d=document.getElementById('driverSpecificFields');if(s&&d)d.style.display=s.value==='motorista'?'block':'none';};
window.toggleDespesaParcelas=function(){var s=document.getElementById('despesaModoPagamento'),d=document.getElementById('divDespesaParcelas');if(s&&d)d.style.display=s.value==='parcelado'?'flex':'none';};
window.renderizarListaAjudantesAdicionados=function(){var u=document.getElementById('listaAjudantesAdicionados');if(!u)return;u.innerHTML='';(window._operacaoAjudantesTempList||[]).forEach(i=>{var f=buscarFuncionarioPorId(i.id);u.innerHTML+=`<li>${f?f.nome:'-'} (R$ ${formatarValorMoeda(i.diaria)}) <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${i.id}')">X</button></li>`;});};
window.removerAjudanteTemp=function(id){window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!==id);renderizarListaAjudantesAdicionados();};
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function(){var s=document.getElementById('selectAjudantesOperacao'),id=s.value,v=prompt("Diária:");if(id&&v){window._operacaoAjudantesTempList.push({id:id,diaria:Number(v.replace(',','.'))});renderizarListaAjudantesAdicionados();s.value='';}});
window.limparOutroFiltro=function(t){if(t==='motorista')document.getElementById('filtroMotoristaGrafico').value='';else document.getElementById('filtroVeiculoGrafico').value='';};

// TABELA OPERAÇÕES (COM BOTÕES PEDIDOS)
function renderizarTabelaOperacoes() {
    var tb = document.querySelector('#tabelaOperacoes tbody'); if(!tb) return; tb.innerHTML='';
    var l = CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data));
    l.forEach(op => {
        if(op.status==='CANCELADA') return;
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        
        var btns = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-info" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        `;
        tb.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td>${btns}</td></tr>`;
    });
}

// Funções de Exclusão e Preenchimento
window.excluirFuncionario = async function(id){if(confirm("Excluir?")){if(window.dbRef) try{await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db,"users",id));}catch(e){} await salvarListaFuncionarios(CACHE_FUNCIONARIOS.filter(f=>f.id!==id)); alert("OK"); preencherTodosSelects();}};
window.excluirVeiculo = function(pl){if(confirm("Excluir?")) salvarListaVeiculos(CACHE_VEICULOS.filter(v=>v.placa!==pl)).then(preencherTodosSelects);};
window.excluirContratante = function(c){if(confirm("Excluir?")) salvarListaContratantes(CACHE_CONTRATANTES.filter(x=>x.cnpj!==c)).then(preencherTodosSelects);};
window.excluirAtividade = function(id){if(confirm("Excluir?")) salvarListaAtividades(CACHE_ATIVIDADES.filter(a=>a.id!==id)).then(preencherTodosSelects);};
window.excluirOperacao = function(id){if(confirm("Excluir?")) salvarListaOperacoes(CACHE_OPERACOES.filter(o=>o.id!==id)).then(()=>{preencherTodosSelects();atualizarDashboard();});};
window.excluirDespesa = function(id){if(confirm("Excluir?")) salvarListaDespesas(CACHE_DESPESAS.filter(d=>d.id!==id)).then(()=>{renderizarTabelaDespesasGerais();atualizarDashboard();});};

window.preencherFormularioFuncionario = function(id) { var f=buscarFuncionarioPorId(id); if(f){ document.getElementById('funcionarioId').value=f.id; document.getElementById('funcNome').value=f.nome; document.getElementById('funcFuncao').value=f.funcao; document.getElementById('funcDocumento').value=f.documento; document.getElementById('funcEmail').value=f.email; document.querySelector('[data-tab="funcionarios"]').click(); } };
window.preencherFormularioVeiculo = function(pl) { var v=buscarVeiculoPorPlaca(pl); if(v){ document.getElementById('veiculoPlaca').value=v.placa; document.getElementById('veiculoModelo').value=v.modelo; document.querySelector('[data-tab="veiculos"]').click(); } };
window.preencherFormularioContratante = function(c) { var x=buscarContratantePorCnpj(c); if(x){ document.getElementById('contratanteCNPJ').value=x.cnpj; document.getElementById('contratanteRazaoSocial').value=x.razaoSocial; document.querySelector('[data-tab="contratantes"]').click(); } };
window.preencherFormularioOperacao = function(id) { var o=CACHE_OPERACOES.find(x=>x.id===id); if(o){ document.getElementById('operacaoId').value=o.id; document.getElementById('operacaoData').value=o.data; document.getElementById('selectMotoristaOperacao').value=o.motoristaId; document.getElementById('operacaoFaturamento').value=o.faturamento; document.querySelector('[data-page="operacoes"]').click(); } };

// Renderização Geral
function preencherTodosSelects() {
    const fill=(i,d,k,t,def)=>{var e=document.getElementById(i);if(!e)return;var v=e.value;e.innerHTML=`<option value="">${def}</option>`+d.map(x=>`<option value="${x[k]}">${x[t]}</option>`).join('');if(v)e.value=v;};
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='motorista'), 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='ajudante'), 'id', 'nome', 'ADD...');
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('filtroMotoristaGrafico', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'GERAL');

    renderizarTabelaFuncionarios(); renderizarTabelaVeiculos(); renderizarTabelaContratantes(); renderizarTabelaAtividades(); renderizarTabelaOperacoes(); renderizarInformacoesEmpresa();
    if(window.renderizarTabelaDespesasGerais) renderizarTabelaDespesasGerais();
    if(window.renderizarTabelaMonitoramento) { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
    if(window.renderizarPainelEquipe) renderizarPainelEquipe();
}

function renderizarTabelaFuncionarios(){ var t=document.querySelector('#tabelaFuncionarios tbody'); if(!t)return; t.innerHTML=''; CACHE_FUNCIONARIOS.forEach(f=>{ t.innerHTML+=`<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); }
function renderizarTabelaVeiculos(){ var t=document.querySelector('#tabelaVeiculos tbody'); if(!t)return; t.innerHTML=''; CACHE_VEICULOS.forEach(v=>{ t.innerHTML+=`<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td></tr>`; }); }
function renderizarTabelaContratantes(){ var t=document.querySelector('#tabelaContratantes tbody'); if(!t)return; t.innerHTML=''; CACHE_CONTRATANTES.forEach(c=>{ t.innerHTML+=`<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td></tr>`; }); }
function renderizarTabelaAtividades(){ var t=document.querySelector('#tabelaAtividades tbody'); if(!t)return; t.innerHTML=''; CACHE_ATIVIDADES.forEach(a=>{ t.innerHTML+=`<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td></tr>`; }); }
function renderizarTabelaDespesasGerais(){ var t=document.querySelector('#tabelaDespesasGerais tbody'); if(!t)return; t.innerHTML=''; CACHE_DESPESAS.sort((a,b)=>new Date(b.data)-new Date(a.data)).forEach(d=>{ t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca||'GERAL'}</td><td>${d.descricao}</td><td>${formatarValorMoeda(d.valor)}</td><td>${d.modoPagamento}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td></tr>`; }); }
function renderizarInformacoesEmpresa(){ var d=document.getElementById('viewMinhaEmpresaContent'); if(d && CACHE_MINHA_EMPRESA.razaoSocial) d.innerHTML=`<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>${CACHE_MINHA_EMPRESA.cnpj}`; }

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display='none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display='none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display='none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display='none'; };

// -----------------------------------------------------------------------------
// 7. MONITORAMENTO E EQUIPE (BOTÕES: BLOQUEAR E STATUS APENAS)
// -----------------------------------------------------------------------------
window.renderizarTabelaMonitoramento = function() {
    var tb=document.querySelector('#tabelaCheckinsPendentes tbody'); if(!tb)return; tb.innerHTML='';
    var pend=CACHE_OPERACOES.filter(o=>o.status==='AGENDADA'||o.status==='EM_ANDAMENTO').sort((a,b)=>new Date(a.data)-new Date(b.data));
    var bg=document.getElementById('badgeCheckins'); if(bg) { bg.textContent=pend.length; bg.style.display=pend.length>0?'inline-block':'none'; }
    if(pend.length===0) tb.innerHTML='<tr><td colspan="6" style="text-align:center">Nenhuma rota.</td></tr>';
    pend.forEach(op=>{
        var c=buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial||'-', m=buscarFuncionarioPorId(op.motoristaId);
        var stH=op.status==='EM_ANDAMENTO'?'<span style="color:orange">EM ROTA</span>':'AGENDADA';
        if(m) {
            var stE=op.checkins?.faltaMotorista?'<b style="color:red">FALTA</b>':(op.checkins?.motorista?'<b style="color:green">OK</b>':'...');
            var btn=op.checkins?.faltaMotorista?'-':`<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${m.id}','motorista')">FALTA</button>`;
            tb.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m.nome}<br><small>${op.veiculoPlaca}</small></td><td>${c}</td><td>${stH}</td><td>${stE}</td><td>${btn}</td></tr>`;
        }
    });
};
window.registrarFalta=async function(oid,fid,t){if(confirm("Confirmar Falta?")){var o=CACHE_OPERACOES.find(x=>x.id===oid);if(t==='motorista'){if(!o.checkins)o.checkins={};o.checkins.faltaMotorista=true;o.checkins.motorista=false;} await salvarListaOperacoes(CACHE_OPERACOES); renderizarTabelaMonitoramento();}};
window.renderizarTabelaFaltas=function(){var t=document.querySelector('#tabelaFaltas tbody');if(!t)return;t.innerHTML='';CACHE_OPERACOES.forEach(o=>{if(o.checkins?.faltaMotorista){var m=buscarFuncionarioPorId(o.motoristaId);if(m)t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td style="color:red">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td></tr>`;}});};

window.renderizarPainelEquipe = function() {
    var t=document.querySelector('#tabelaCompanyAtivos tbody'); if(t){ t.innerHTML=''; CACHE_FUNCIONARIOS.forEach(f=>{
        var blk = f.isBlocked || false;
        var btnBlk = blk ? `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR"><i class="fas fa-lock"></i></button>` : `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR"><i class="fas fa-unlock"></i></button>`;
        var btnSt = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="STATUS"><i class="fas fa-eye"></i></button>`;
        t.innerHTML+=`<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${blk?'<b style="color:red">BLOQUEADO</b>':'ATIVO'}</td><td>${btnBlk} ${btnSt}</td></tr>`;
    }); }
    
    if(window.dbRef) {
        window.dbRef.getDocs(window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"),window.dbRef.where("company","==",window.USUARIO_ATUAL.company),window.dbRef.where("approved","==",false))).then(s=>{
            var tp=document.querySelector('#tabelaCompanyPendentes tbody'); if(tp){ tp.innerHTML=''; s.forEach(d=>{var u=d.data();tp.innerHTML+=`<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-success" onclick="aprovarUsuario('${u.uid}')">OK</button></td></tr>`;}); }
        });
    }
    
    var tr=document.getElementById('tabelaProfileRequests')?.querySelector('tbody'); if(tr) { tr.innerHTML=''; CACHE_PROFILE_REQUESTS.filter(x=>x.status==='PENDENTE').forEach(r=>{ var f=buscarFuncionarioPorId(r.funcionarioId); tr.innerHTML+=`<tr><td>${r.campo}</td><td>${r.valorNovo}</td><td><button class="btn-success" onclick="aprovarProfileRequest('${r.id}')">OK</button></td></tr>`; }); }
};

window.verStatusFunc = async function(id) {
    var f=buscarFuncionarioPorId(id); if(!f) return;
    document.getElementById('modalStatusFuncionario').style.display='flex';
    var emRota = CACHE_OPERACOES.find(o=>o.status==='EM_ANDAMENTO'&&(o.motoristaId===id||o.ajudantes?.some(a=>a.id===id)));
    var blk = f.isBlocked || false;
    document.getElementById('statusFuncionarioBody').innerHTML = `<h3>${f.nome}</h3><p>Status: ${blk?'<b style="color:red">BLOQUEADO</b>':'<b style="color:green">ATIVO</b>'}</p><p>Rota: ${emRota?'<b style="color:orange">EM ROTA</b>':'LIVRE'}</p>`;
    document.getElementById('statusFuncionarioActions').innerHTML = `<button class="btn-danger" style="width:100%" onclick="toggleBloqueioFunc('${f.id}')">${blk?'DESBLOQUEAR':'BLOQUEAR'}</button>`;
};

window.toggleBloqueioFunc = async function(id) {
    var f=buscarFuncionarioPorId(id); if(!confirm("Alterar bloqueio?")) return;
    f.isBlocked = !f.isBlocked; await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    if(window.dbRef) await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db,"users",id),{isBlocked:f.isBlocked});
    alert("Alterado."); document.getElementById('modalStatusFuncionario').style.display='none'; renderizarPainelEquipe();
};
window.aprovarUsuario=async function(id){await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db,"users",id),{approved:true});renderizarPainelEquipe();};
window.aprovarProfileRequest=async function(id){var r=CACHE_PROFILE_REQUESTS.find(x=>x.id===id); if(r){r.status='APROVADO'; await salvarProfileRequests(CACHE_PROFILE_REQUESTS); renderizarPainelEquipe();} };

// RELATÓRIOS E RECIBOS (COM CUSTO REAL)
window.gerarRelatorioGeral=function(){
    var ops=CACHE_OPERACOES.filter(o=>o.status!=='CANCELADA'); 
    var h='<table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>FATURAMENTO</th><th>CUSTO REAL</th><th>LUCRO</th></tr></thead><tbody>';
    ops.forEach(o=>{
        var c=window.calcularCustoCombustivelOperacao(o);
        h+=`<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatarValorMoeda(o.faturamento)}</td><td>${formatarValorMoeda(c)}</td><td>${formatarValorMoeda((Number(o.faturamento)||0)-c)}</td></tr>`;
    });
    document.getElementById('reportContent').innerHTML=h+'</tbody></table>'; document.getElementById('reportResults').style.display='block';
};
window.exportarRelatorioPDF=function(){var e=document.getElementById('reportContent');if(e)html2pdf().from(e).save();};
window.gerarReciboPagamento=function(){var id=document.getElementById('selectMotoristaRecibo').value;if(!id)return alert("Selecione");var ops=CACHE_OPERACOES.filter(o=>o.motoristaId===id&&o.status!=='CANCELADA');var t=ops.reduce((a,b)=>a+(Number(b.comissao)||0),0);document.getElementById('modalReciboContent').innerHTML=`<h3>TOTAL: ${formatarValorMoeda(t)}</h3>`;document.getElementById('modalRecibo').style.display='flex';};
window.salvarReciboNoHistorico = async function(id,nm,i,f,v) { CACHE_RECIBOS.push({id:Date.now().toString(), dataEmissao:new Date().toISOString(), funcionarioId:id, funcionarioNome:nm, periodo:i+' a '+f, valorTotal:v, enviado:false}); await salvarListaRecibos(CACHE_RECIBOS); alert("Salvo!"); document.getElementById('modalRecibo').style.display='none'; renderizarHistoricoRecibos(); };
window.renderizarHistoricoRecibos = function() { var t=document.querySelector('#tabelaHistoricoRecibos tbody'); if(!t) return; t.innerHTML=''; CACHE_RECIBOS.forEach(r=>{ var b=r.enviado?'ENVIADO':`<button class="btn-primary" onclick="enviarReciboFuncionario('${r.id}')">ENVIAR</button>`; t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(r.dataEmissao)}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${b}</td></tr>`; }); };
window.enviarReciboFuncionario = async function(id) { var r=CACHE_RECIBOS.find(x=>x.id===id); if(r){ r.enviado=true; await salvarListaRecibos(CACHE_RECIBOS); renderizarHistoricoRecibos(); alert("Enviado!"); } };

// 8. SUPER ADMIN E INIT
window.carregarPainelSuperAdmin = async function() {
    const c=document.getElementById('superAdminContainer'); if(!c)return; c.innerHTML='...';
    const {db,collection,getDocs}=window.dbRef; const s=await getDocs(collection(db,"companies")); const u=await getDocs(collection(db,"users"));
    const users=[]; u.forEach(d=>users.push(d.data()));
    c.innerHTML=''; s.forEach(d=>{ var cp=d.data(); var adm=users.find(x=>x.company===cp.id && x.role==='admin'); c.innerHTML+=`<div style="border:1px solid #ccc;margin:5px;padding:10px;background:white"><b>${cp.id.toUpperCase()}</b> (Admin: ${adm?adm.email:'-'}) - ${cp.isBlocked?'BLOQUEADO':'ATIVO'} <button class="btn-mini btn-primary" onclick="abrirModalCreditos('${d.id}',null,${cp.isVitalicio||false},${cp.isBlocked||false})">EDITAR</button></div>`; });
};
window.abrirModalCreditos=function(id,v,vit,blk){document.getElementById('empresaIdCredito').value=id;document.getElementById('checkVitalicio').checked=vit;document.getElementById('checkBloqueado').checked=blk;document.getElementById('modalCreditos').style.display='flex';};
window.salvarCreditosEmpresa=async function(){var id=document.getElementById('empresaIdCredito').value,v=document.getElementById('checkVitalicio').checked,b=document.getElementById('checkBloqueado').checked;await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db,"companies",id),{isVitalicio:v,isBlocked:b});alert("OK");document.getElementById('modalCreditos').style.display='none';carregarPainelSuperAdmin();};
document.addEventListener('submit', async function(e){ if(e.target.id==='formCreateCompany'){ e.preventDefault(); var d=document.getElementById('newCompanyDomain').value.toLowerCase(), em=document.getElementById('newAdminEmail').value, p=document.getElementById('newAdminPassword').value; try{ var u=await window.dbRef.criarAuthUsuario(em,p); await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"users",u),{uid:u,name:"ADMIN "+d,email:em,role:'admin',company:d,approved:true,createdAt:new Date().toISOString()}); await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"companies",d),{id:d,createdAt:new Date().toISOString()}); alert("OK"); e.target.reset(); }catch(x){alert(x.message);} } });

window.renderizarMeusDados = function(){var u=window.USUARIO_ATUAL;var d=CACHE_FUNCIONARIOS.find(f=>f.id===u.uid)||u;document.getElementById('meusDadosContainer').innerHTML=`<div style="text-align:center;padding:20px;background:white"><h3>${d.nome||d.name}</h3><p>${d.funcao||d.role}</p><hr><p>Email: ${d.email}</p></div>`;};

window.initSystemByRole = async function(user) {
    console.log("INIT:", user.role); window.USUARIO_ATUAL=user;
    document.querySelectorAll('.page').forEach(p=>{p.style.display='none';p.classList.remove('active');});
    document.querySelectorAll('.sidebar ul').forEach(u=>u.style.display='none');
    
    if(EMAILS_MESTRES.includes(user.email)||user.role==='admin_master') {
        document.getElementById('menu-super-admin').style.display='block';
        document.getElementById('super-admin').style.display='block'; setTimeout(()=>document.getElementById('super-admin').classList.add('active'),50);
        carregarPainelSuperAdmin(); return;
    }
    
    await sincronizarDadosComFirebase(); preencherTodosSelects();
    
    if(user.role==='admin') {
        if(user.isBlocked) return document.body.innerHTML="<h1 style='text-align:center;color:red;margin-top:50px'>BLOQUEADO</h1>";
        document.getElementById('menu-admin').style.display='block';
        var h=document.getElementById('home'); if(h){ h.style.display='block'; setTimeout(()=>h.classList.add('active'),50); }
        atualizarDashboard(); renderizarCalendario();
    } else {
        document.getElementById('menu-employee').style.display='block'; window.MODO_APENAS_LEITURA=true;
        var eh=document.getElementById('employee-home'); if(eh){ eh.style.display='block'; setTimeout(()=>eh.classList.add('active'),50); }
        renderizarCheckinFuncionario(); renderizarMeusDados();
    }
};

// Navegação
document.querySelectorAll('.nav-item').forEach(i=>{i.addEventListener('click',function(){
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
    this.classList.add('active'); var t=document.getElementById(this.getAttribute('data-page'));
    if(t){t.style.display='block';setTimeout(()=>t.classList.add('active'),10);}
    if(window.innerWidth<=768)document.getElementById('sidebar').classList.remove('active');
    var p=this.getAttribute('data-page'); if(p==='home')atualizarDashboard(); if(p==='meus-dados')renderizarMeusDados(); if(p==='employee-checkin')renderizarCheckinFuncionario();
});});
document.getElementById('mobileMenuBtn')?.addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click',()=>document.getElementById('sidebar').classList.remove('active'));
window.exportDataBackup=function(){var d={meta:{d:new Date()},data:{f:CACHE_FUNCIONARIOS,v:CACHE_VEICULOS,o:CACHE_OPERACOES}};var a=document.createElement('a');a.href="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(d));a.download="bkp.json";a.click();};
window.importDataBackup=function(e){var r=new FileReader();r.onload=function(ev){if(confirm("Restaurar?")){var j=JSON.parse(ev.target.result);if(j.data){localStorage.setItem(CHAVE_DB_FUNCIONARIOS,JSON.stringify(j.data.f));localStorage.setItem(CHAVE_DB_VEICULOS,JSON.stringify(j.data.v));localStorage.setItem(CHAVE_DB_OPERACOES,JSON.stringify(j.data.o));alert("OK");window.location.reload();}}};r.readAsText(e.target.files[0]);};
// =============================================================================
// PARTE 4: MONITORAMENTO, EQUIPE E RELATÓRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// 7. MONITORAMENTO DE ROTAS (DASHBOARD OPERACIONAL)
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra apenas Agendadas e Em Andamento
    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    // Atualiza o Badge (Contador vermelho no menu)
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
        
        // Status Visual (Pílula)
        var statusHtml = op.status === 'EM_ANDAMENTO' 
            ? '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>' 
            : '<span class="status-pill pill-pending">AGENDADA</span>';

        // 1. Linha do Motorista
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
// 8. GESTÃO DE EQUIPE (BOTÕES PERSONALIZADOS: BLOQUEAR E STATUS)
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = async function() {
    // Tabela de Ativos
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        if (CACHE_FUNCIONARIOS.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        } else {
            CACHE_FUNCIONARIOS.forEach(f => {
                var tr = document.createElement('tr');
                
                // Lógica de Bloqueio
                var isBlocked = f.isBlocked || false;
                
                // Botões Solicitados: Apenas Bloquear e Visualizar Status
                var btnBloquear = isBlocked 
                    ? `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR"><i class="fas fa-lock"></i></button>`
                    : `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR"><i class="fas fa-unlock"></i></button>`;

                var btnStatus = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="STATUS"><i class="fas fa-eye"></i></button>`;

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

    // Tabela de Pendentes (Aprovações)
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
    
    // Tabela de Solicitações de Dados
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
    
    container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    document.getElementById('modalStatusFuncionario').style.display = 'flex';

    // 1. Verifica se está em rota
    var emRota = false;
    var veiculoRota = "";
    var opAtiva = CACHE_OPERACOES.find(o => o.status === 'EM_ANDAMENTO' && (o.motoristaId === id || (o.ajudantes && o.ajudantes.some(a=>a.id===id))));
    if (opAtiva) {
        emRota = true;
        veiculoRota = opAtiva.veiculoPlaca;
    }

    var isBlocked = f.isBlocked || false;

    // Renderiza HTML
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

    // Ação do Modal
    var btnLabel = isBlocked ? 'DESBLOQUEAR ACESSO' : 'BLOQUEAR ACESSO';
    var btnClass = isBlocked ? 'btn-success' : 'btn-danger';
    
    actions.innerHTML = `<button class="${btnClass}" style="width:100%; padding:12px; font-size:1rem;" onclick="toggleBloqueioFunc('${f.id}')"><i class="fas fa-power-off"></i> ${btnLabel}</button>`;
};

window.toggleBloqueioFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var newStatus = !f.isBlocked;
    var actionName = newStatus ? "BLOQUEAR" : "DESBLOQUEAR";
    
    if (!confirm(`Tem certeza que deseja ${actionName} o funcionário ${f.nome}?`)) return;

    // Atualiza Nuvem
    if (window.dbRef) {
        try {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { isBlocked: newStatus });
        } catch(e) {
            alert("Erro ao atualizar: " + e.message);
            return;
        }
    }

    // Atualiza Local
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
// 9. RELATÓRIOS (COM CÁLCULO DE COMBUSTÍVEL PROPORCIONAL)
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
            
            // Dados para média
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
// 10. RECIBOS E LÓGICA DO FUNCIONÁRIO
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
// 11. PAINEL SUPER ADMIN (VISUAL LIMPO E CORRIGIDO)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;">Carregando...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        const companiesSnap = await getDocs(collection(db, "companies"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        const users = [];
        usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if(companies.length === 0) {
            container.innerHTML = 'Nenhuma empresa.';
            return;
        }

        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            let validadeTexto = comp.isVitalicio ? "VITALÍCIO" : (comp.systemValidity ? formatarDataParaBrasileiro(comp.systemValidity) : "SEM DADOS");
            let borderColor = comp.isBlocked ? "red" : (comp.isVitalicio ? "gold" : "#ccc");

            // Valores seguros
            const safeValidity = comp.systemValidity || '';
            const safeVitalicio = comp.isVitalicio || false;
            const safeBlocked = comp.isBlocked || false;

            const div = document.createElement('div');
            div.style.cssText = `margin-bottom:10px; border:1px solid ${borderColor}; border-radius:5px; background:white; overflow:hidden;`;

            div.innerHTML = `
                <div onclick="this.nextElementSibling.style.display = (this.nextElementSibling.style.display === 'none' ? 'block' : 'none')" style="padding:10px; cursor:pointer; background:#f8f9fa; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${comp.id.toUpperCase()}</strong>
                        <div style="font-size:0.8rem; color:#555;">Admin: ${admin ? admin.email : 'Erro'}</div>
                    </div>
                    <div style="text-align:right; font-size:0.8rem;">
                        ${comp.isBlocked ? 'BLOQUEADO' : 'ATIVO'}<br>
                        Validade: ${validadeTexto}
                    </div>
                </div>
                
                <div style="display:none; padding:10px; border-top:1px solid #eee;">
                    <div style="margin-bottom:10px;">
                        <button class="btn-mini btn-primary" onclick="abrirModalCreditos('${comp.id}', '${safeValidity}', ${safeVitalicio}, ${safeBlocked})">EDITAR EMPRESA</button>
                        <button class="btn-mini btn-danger" onclick="excluirEmpresaTotal('${comp.id}')">EXCLUIR TUDO</button>
                    </div>
                    
                    <small>USUÁRIOS (${usersDaEmpresa.length}):</small>
                    <div style="max-height:150px; overflow-y:auto; font-size:0.8rem;">
                        ${usersDaEmpresa.map(u => `
                            <div style="border-bottom:1px solid #eee; padding:5px 0;">
                                ${u.name} (${u.email}) - Senha: ${u.senhaVisual || '***'}
                                <button onclick="resetarSenhaComMigracao('${u.uid}', '${u.email}', '${u.name}')" style="float:right;">RESET</button>
                                <button onclick="excluirUsuarioGlobal('${u.uid}')" style="float:right; margin-right:5px; color:red;">DEL</button>
                            </div>`).join('')}
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = `<p style="color:red">Erro: ${e.message}</p>`;
    }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("Domínio inválido.");

        try {
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                uid: uid, name: "ADMIN " + dominio.toUpperCase(), email: email, role: 'admin', 
                company: dominio, createdAt: new Date().toISOString(), approved: true, 
                isVitalicio: false, isBlocked: false, senhaVisual: senha,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            });
        } catch (erro) {
            if (erro.code === 'auth/email-already-in-use') {
                if(!confirm("E-mail já existe. Criar empresa mesmo assim?")) return;
            } else {
                return alert("Erro: " + erro.message);
            }
        }

        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", dominio), { 
            id: dominio, createdAt: new Date().toISOString(), isBlocked: false, isVitalicio: false,
            systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
        }, { merge: true });

        alert("Criado!"); e.target.reset(); carregarPainelSuperAdmin();
    }
});

window.abrirModalCreditos = function(companyId, validade, isVitalicio, isBlocked) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    document.getElementById('validadeAtualCredito').textContent = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade.split('T')[0]) : "SEM REGISTRO");
    
    var elVit = document.getElementById('checkVitalicio');
    var elBlk = document.getElementById('checkBloqueado');
    if(elVit) elVit.checked = isVitalicio;
    if(elBlk) elBlk.checked = isBlocked;
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    var isVitalicio = document.getElementById('checkVitalicio').checked;
    var isBloqueado = document.getElementById('checkBloqueado').checked;
    var meses = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        const { db, collection, query, where, getDocs, updateDoc, doc, setDoc, writeBatch } = window.dbRef;
        var dadosEmpresa = { isVitalicio: isVitalicio, isBlocked: isBloqueado };
        var novaData = null;

        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            var base = new Date();
            if(!snap.empty && snap.docs[0].data().systemValidity) {
                var dv = new Date(snap.docs[0].data().systemValidity);
                if(dv > base) base = dv;
            }
            if (meses > 0) base.setDate(base.getDate() + (meses * 30));
            novaData = base.toISOString();
            dadosEmpresa.systemValidity = novaData;
        }

        await setDoc(doc(db, "companies", companyId), dadosEmpresa, { merge: true });
        
        const qUsers = query(collection(db, "users"), where("company", "==", companyId));
        const snapUsers = await getDocs(qUsers);
        const batch = writeBatch(db);
        snapUsers.forEach(uDoc => {
            let updateData = { isBlocked: isBloqueado, isVitalicio: isVitalicio };
            if (novaData) updateData.systemValidity = novaData;
            batch.update(uDoc.ref, updateData);
        });
        await batch.commit();

        alert("Atualizado!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();
    } catch(e) { alert("Erro: " + e.message); }
};

window.excluirEmpresaTotal = async function(companyId) {
    if (prompt(`Digite "DELETAR" para apagar ${companyId}:`) !== "DELETAR") return;
    try {
        const { db, collection, query, where, getDocs, doc, writeBatch } = window.dbRef;
        const batch = writeBatch(db);
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, "companies", companyId));
        await batch.commit();
        alert("Excluído!"); carregarPainelSuperAdmin();
    } catch (e) { alert("Erro: " + e.message); }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(!confirm("Remover usuário?")) return;
    try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid)); carregarPainelSuperAdmin(); } 
    catch(e) { alert(e.message); }
};

window.resetarSenhaComMigracao = async function(uid, email, nome) {
    var p = prompt("Nova senha:");
    if(p) {
        try {
            let nid = await window.dbRef.criarAuthUsuario(email, p);
            var old = await window.dbRef.getDoc(window.dbRef.doc(window.dbRef.db, "users", uid));
            if(old.exists()){
                var d = old.data(); d.uid=nid; d.senhaVisual=p;
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", nid), d);
                await window.dbRef.deleteDoc(old.ref);
            }
            alert("Senha alterada!"); carregarPainelSuperAdmin();
        } catch(e){ alert(e.message); }
    }
};

// -----------------------------------------------------------------------------
// 12. MEUS DADOS E INICIALIZAÇÃO
// -----------------------------------------------------------------------------

window.renderizarMeusDados = function() {
    var u = window.USUARIO_ATUAL;
    var d = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(u.uid)) || u;
    var c = document.getElementById('meusDadosContainer');
    if(c) c.innerHTML = `<div style="background:white; padding:20px; text-align:center;"><h3>${d.nome || d.name}</h3><p>${d.funcao || d.role}</p><hr><p>Tel: ${d.telefone || '-'}</p><p>Email: ${d.email}</p></div>`;
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
        p.style.display = 'block'; setTimeout(() => p.classList.add('active'), 50);
        carregarPainelSuperAdmin();
        return;
    }

    // Sync
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects();

    // Roteamento
    if (user.role === 'admin') {
        if (user.isBlocked) return document.body.innerHTML = "<div style='text-align:center;padding:50px;color:red'><h1>BLOQUEADO</h1></div>";
        
        if (!user.isVitalicio) {
            if (!user.systemValidity || new Date(user.systemValidity) < new Date()) {
                document.body.innerHTML = "<div style='text-align:center; padding:50px; color:red'><h1>SISTEMA VENCIDO</h1><button onclick='logoutSystem()'>SAIR</button></div>";
                return;
            }
        }

        document.getElementById('menu-admin').style.display = 'block';
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            document.querySelector('[data-page="home"]')?.classList.add('active');
        }
        atualizarDashboard();
        renderizarCalendario();

    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home');
        if(eh) { 
            eh.style.display = 'block'; 
            setTimeout(() => eh.classList.add('active'), 50);
            document.querySelector('[data-page="employee-home"]')?.classList.add('active');
        }
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
        var target = document.getElementById(this.getAttribute('data-page'));
        if (target) { target.style.display = 'block'; setTimeout(() => target.classList.add('active'), 10); }
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
        
        var pg = this.getAttribute('data-page');
        if (pg === 'home') atualizarDashboard();
        if (pg === 'meus-dados') renderizarMeusDados();
        if (pg === 'employee-checkin') renderizarCheckinFuncionario();
    });
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

window.exportDataBackup = function() {
    var data = { meta: { date: new Date(), user: window.USUARIO_ATUAL.email }, data: { funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, operacoes: CACHE_OPERACOES, despesas: CACHE_DESPESAS } };
    var a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = "backup.json"; a.click();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(e) {
        if(confirm("Restaurar backup?")) {
            var json = JSON.parse(e.target.result);
            if(json.data) {
                localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(json.data.funcionarios));
                localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(json.data.veiculos));
                localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(json.data.operacoes));
                localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(json.data.despesas));
                alert("Backup restaurado! Recarregando...");
                window.location.reload();
            }
        }
    };
    reader.readAsText(event.target.files[0]);
};