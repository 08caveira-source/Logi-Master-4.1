// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 8.0 (SUPER ADMIN FIXED + CRÉDITOS + SECURITY)
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
// =============================================================================

// 1. CONSTANTES DE ARMAZENAMENTO (LOCALSTORAGE / FIREBASE)
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 
window._mensagemAtualId = null; 
window._intervaloMonitoramento = null; 
window._verificacaoCreditosIntervalo = null; // NOVO: Intervalo para checar validade da conta

// 3. CACHE LOCAL (Sincronizado com a memória)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    // Espera formato YYYY-MM-DD
    var partes = dataIso.split('-');
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

// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)

// Remove undefined para evitar erro no Firestore
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

function carregarDadosGenerico(chave, variavelCache, valorPadrao) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : valorPadrao;
    } catch (erro) {
        console.error("Erro ao carregar " + chave, erro);
        return valorPadrao;
    }
}

function carregarTodosDadosLocais() {
    console.log("Carregando dados locais...");
    CACHE_FUNCIONARIOS = carregarDadosGenerico(CHAVE_DB_FUNCIONARIOS, [], []);
    CACHE_VEICULOS = carregarDadosGenerico(CHAVE_DB_VEICULOS, [], []);
    CACHE_CONTRATANTES = carregarDadosGenerico(CHAVE_DB_CONTRATANTES, [], []);
    CACHE_OPERACOES = carregarDadosGenerico(CHAVE_DB_OPERACOES, [], []);
    CACHE_MINHA_EMPRESA = carregarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, {}, {});
    CACHE_DESPESAS = carregarDadosGenerico(CHAVE_DB_DESPESAS, [], []);
    CACHE_ATIVIDADES = carregarDadosGenerico(CHAVE_DB_ATIVIDADES, [], []);
    CACHE_PROFILE_REQUESTS = carregarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, [], []);
    CACHE_RECIBOS = carregarDadosGenerico(CHAVE_DB_RECIBOS, [], []);
}

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza memória
    atualizarCacheCallback(dados);
    
    // 2. Atualiza LocalStorage
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 3. Atualiza Firebase (Se logado e com empresa vinculada)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
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

// Funções de salvamento específicas
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }

async function salvarProfileRequests(lista) { 
    await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); 
    if(document.getElementById('tabelaProfileRequests')) renderizarTabelaProfileRequests();
}

// Buscas Rápidas (Helpers)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
function buscarReciboPorId(id) { return CACHE_RECIBOS.find(r => String(r.id) === String(id)); }

// Inicialização Inicial de Dados (Local)
carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS FINANCEIROS E GRÁFICOS INTERATIVOS
// =============================================================================

// -----------------------------------------------------------------------------
// 6. CÁLCULOS FINANCEIROS E ATUALIZAÇÃO DO DASHBOARD (HOME)
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    var mesAtual = window.currentDate.getMonth(); // 0 a 11
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // Cálculo Global para os Cards do Dashboard (Home)
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // Custo Operacional (Combustível + Despesas Extras)
        var custoOp = (Number(op.despesas) || 0) + (Number(op.combustivel) || 0);
        
        // Custo com Motorista (Comissão)
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        // Custo com Ajudantes
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                // Se o ajudante específico não teve falta registrada, soma
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) {
                    custoOp += (Number(aj.diaria) || 0);
                }
            });
        }

        // Histórico Global (Confirmadas/Finalizadas)
        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // Soma Despesas Gerais do Mês
    CACHE_DESPESAS.forEach(function(desp) {
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            custosMes += (Number(desp.valor) || 0);
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza DOM dos Cards
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(custosMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    // Atualiza o Gráfico
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (CHART.JS) COM PAINEL DE DADOS DO VEÍCULO
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    // Verifica filtro de veículo selecionado
    var elSelect = document.getElementById('filtroVeiculoGrafico');
    var filtroVeiculo = elSelect ? elSelect.value : "";

    // === INJEÇÃO DE RESUMO DO VEÍCULO ===
    // Remove resumo anterior se existir
    var existingSummary = document.getElementById('chartVehicleSummary');
    if (existingSummary) existingSummary.remove();

    if (filtroVeiculo) {
        // Calcula Estatísticas do Veículo no Mês Selecionado
        var kmMes = 0;
        var custoTotalVeiculo = 0;
        var litrosTotal = 0;

        CACHE_OPERACOES.forEach(op => {
            if (op.veiculoPlaca !== filtroVeiculo || op.status === 'CANCELADA') return;
            var d = new Date(op.data + 'T12:00:00');
            if (d.getMonth() === mes && d.getFullYear() === ano) {
                kmMes += (Number(op.kmRodado) || 0);
                custoTotalVeiculo += (Number(op.combustivel) || 0) + (Number(op.despesas) || 0);
                
                // Soma Litros para média
                var preco = Number(op.precoLitro) || 0;
                var valorAbast = Number(op.combustivel) || 0;
                if (preco > 0 && valorAbast > 0) litrosTotal += (valorAbast / preco);
            }
        });

        // Adiciona Despesas Gerais do Veículo
        CACHE_DESPESAS.forEach(d => {
            if (d.veiculoPlaca === filtroVeiculo) {
                var dt = new Date(d.data + 'T12:00:00');
                if (dt.getMonth() === mes && dt.getFullYear() === ano) {
                    custoTotalVeiculo += (Number(d.valor) || 0);
                }
            }
        });

        var media = (litrosTotal > 0) ? (kmMes / litrosTotal) : 0;

        // Cria o HTML do Card
        var summaryDiv = document.createElement('div');
        summaryDiv.id = 'chartVehicleSummary';
        summaryDiv.style.marginBottom = '15px';
        summaryDiv.style.padding = '10px';
        summaryDiv.style.background = '#e3f2fd';
        summaryDiv.style.border = '1px solid #90caf9';
        summaryDiv.style.borderRadius = '6px';
        summaryDiv.style.display = 'flex';
        summaryDiv.style.justifyContent = 'space-around';
        summaryDiv.style.fontSize = '0.9rem';

        summaryDiv.innerHTML = `
            <div style="text-align:center;"><strong>VEÍCULO:</strong><br>${filtroVeiculo}</div>
            <div style="text-align:center;"><strong>KM (MÊS):</strong><br>${kmMes.toFixed(1)} km</div>
            <div style="text-align:center;"><strong>MÉDIA:</strong><br>${media > 0 ? media.toFixed(2) + ' Km/L' : 'N/A'}</div>
            <div style="text-align:center;"><strong>CUSTO (MÊS):</strong><br>${formatarValorMoeda(custoTotalVeiculo)}</div>
        `;

        // Insere antes do canvas
        ctx.parentNode.insertBefore(summaryDiv, ctx);
    }
    // === FIM INJEÇÃO ===

    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    var receita = 0;
    var combustivel = 0;
    var pessoal = 0; 
    var manutencaoGeral = 0; 
    
    // Itera Operações para o Gráfico
    CACHE_OPERACOES.forEach(op => {
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;

        var d = new Date(op.data + 'T12:00:00');
        
        if ((op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            
            if (!op.checkins || !op.checkins.faltaMotorista) {
                pessoal += Number(op.comissao || 0);
            }
            
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                    var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    if (!faltou) pessoal += (Number(aj.diaria)||0);
                });
            }

            manutencaoGeral += Number(op.despesas || 0);
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (filtroVeiculo && d.veiculoPlaca !== filtroVeiculo) return;

        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            manutencaoGeral += Number(d.valor || 0);
        }
    });

    var lucro = receita - (combustivel + pessoal + manutencaoGeral);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'CUSTO COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO/GERAL', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: filtroVeiculo ? 'Dados: ' + filtroVeiculo : 'Resultados Gerais',
                data: [receita, combustivel, pessoal, manutencaoGeral, lucro],
                backgroundColor: [
                    'rgba(46, 125, 50, 0.7)',
                    'rgba(198, 40, 40, 0.7)',
                    'rgba(255, 152, 0, 0.7)',
                    'rgba(156, 39, 176, 0.7)',
                    (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)')
                ],
                borderColor: [ '#1b5e20', '#b71c1c', '#e65100', '#4a148c', '#000' ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return formatarValorMoeda(context.raw); } } } },
            scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return 'R$ ' + value; } } } }
        }
    });
}

// -----------------------------------------------------------------------------
// 8. LÓGICA DO CALENDÁRIO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate;
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
        var opsDoDia = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            var temEmAndamento = opsDoDia.some(o => o.status === 'EM_ANDAMENTO');
            var temPendente = opsDoDia.some(o => o.status === 'AGENDADA');
            var dotColor = temEmAndamento ? 'orange' : (temPendente ? '#999' : 'green');

            cellContent += `<div class="event-dot" style="background:${dotColor}"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            cell.onclick = (function(ds) { return function() { abrirModalDetalhesDia(ds); }; })(dateStr);
        } else {
            cell.onclick = (function(dateString) {
                return function() { 
                    document.getElementById('operacaoData').value = dateString;
                    var btnOperacoes = document.querySelector('[data-page="operacoes"]');
                    if(btnOperacoes) btnOperacoes.click();
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

// =============================================================================
// CÁLCULOS AVANÇADOS DE FROTA (GLOBAL)
// =============================================================================

window.calcularMediaGlobalVeiculo = function(placa, periodoInicio = null, periodoFim = null) {
    var ops = CACHE_OPERACOES.filter(function(op) {
        var matchPlaca = (op.veiculoPlaca === placa);
        var matchStatus = (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA');
        var matchPeriodo = true;
        if (periodoInicio && op.data < periodoInicio) matchPeriodo = false;
        if (periodoFim && op.data > periodoFim) matchPeriodo = false;
        return matchPlaca && matchStatus && matchPeriodo;
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

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-10);
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

// =============================================================================
// MODAL DE DETALHES DO DIA
// =============================================================================

window.abrirModalDetalhesDia = function(dataString) {
    var operacoesDoDia = CACHE_OPERACOES.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'DETALHES COMPLETOS: ' + dataFormatada;

    var totalFaturamento = 0;
    var totalCustoCalculadoDiesel = 0;
    var totalOutrasDespesas = 0;

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;">';
    
    htmlLista += `
    <table class="data-table" style="width:100%; font-size:0.75rem; margin-bottom:0;">
        <thead>
            <tr style="background:#263238; color:white;">
                <th width="15%">STATUS / CLIENTE</th>
                <th width="15%">VEÍCULO</th>
                <th width="20%">EQUIPE</th>
                <th width="30%">FINANCEIRO (FAT / CUSTO / LUCRO)</th>
                <th width="20%">CONSUMO CALCULADO</th>
            </tr>
        </thead>
        <tbody>
    `;

    operacoesDoDia.forEach(function(op) {
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome.split(' ')[0] : '---';
        var nomesAjudantes = [];
        if(op.ajudantes) op.ajudantes.forEach(aj => {
            var f = buscarFuncionarioPorId(aj.id);
            if(f) nomesAjudantes.push(f.nome.split(' ')[0]);
        });
        
        var stringEquipe = '';
        if (op.checkins && op.checkins.faltaMotorista) {
            stringEquipe = `<strong style="color:red;">MOT: FALTA</strong>`;
        } else {
            stringEquipe = `<strong>Mot:</strong> ${nomeMot}`;
        }
        if(nomesAjudantes.length > 0) stringEquipe += `<br><strong>Ajud:</strong> ${nomesAjudantes.join(', ')}`;
        
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        var receita = Number(op.faturamento) || 0;
        
        var custoPessoal = 0;
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoPessoal = Number(op.comissao) || 0;
        }
        
        if(op.ajudantes) op.ajudantes.forEach(aj => {
             var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
             if(!faltou) custoPessoal += (Number(aj.diaria)||0);
        });

        var custoExtra = Number(op.despesas) || 0;
        var kmNaViagem = Number(op.kmRodado) || 0;
        var mediaGlobal = calcularMediaGlobalVeiculo(op.veiculoPlaca);
        var precoLitroRef = Number(op.precoLitro) > 0 ? Number(op.precoLitro) : obterPrecoMedioCombustivel(op.veiculoPlaca);
        
        var custoDieselCalculado = 0;
        if (Number(op.combustivel) > 0) {
            custoDieselCalculado = Number(op.combustivel);
        } else if (mediaGlobal > 0 && kmNaViagem > 0 && precoLitroRef > 0) {
            var litrosConsumidos = kmNaViagem / mediaGlobal;
            custoDieselCalculado = litrosConsumidos * precoLitroRef;
        }

        var custoTotalViagem = custoPessoal + custoExtra + custoDieselCalculado;
        var lucroOp = receita - custoTotalViagem;

        totalFaturamento += receita;
        totalCustoCalculadoDiesel += custoDieselCalculado;
        totalOutrasDespesas += (custoPessoal + custoExtra);

        var statusBadge = '';
        if(op.status === 'FINALIZADA') statusBadge = '<span class="status-pill pill-active">FINALIZADA</span>';
        else if(op.status === 'EM_ANDAMENTO') statusBadge = '<span class="status-pill" style="background:orange; color:white;">EM ROTA</span>';
        else if(op.status === 'AGENDADA') statusBadge = '<span class="status-pill pill-pending">AGENDADA</span>';
        else statusBadge = '<span class="status-pill pill-active">CONFIRMADA</span>';

        htmlLista += `
            <tr style="border-bottom:1px solid #ddd;">
                <td>
                    ${statusBadge}<br>
                    <span style="font-weight:bold; color:#555;">${nomeCli}</span><br>
                    <small>#${op.id.toString().substr(-4)}</small>
                </td>
                <td>
                    <strong>${op.veiculoPlaca}</strong><br>
                    <small style="color:${mediaGlobal > 0 ? 'blue' : '#999'}">
                        G: ${mediaGlobal > 0 ? mediaGlobal.toFixed(2) + ' Km/L' : 'S/ Média'}
                    </small>
                </td>
                <td>${stringEquipe}</td>
                <td>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--success-color);">Fat: ${formatarValorMoeda(receita)}</span>
                        <span style="color:var(--danger-color);">Op: ${formatarValorMoeda(custoTotalViagem)}</span>
                    </div>
                    <div style="border-top:1px dashed #ccc; margin-top:2px; padding-top:2px;">
                        <strong>Lucro: <span style="color:${lucroOp>=0?'green':'red'}">${formatarValorMoeda(lucroOp)}</span></strong>
                    </div>
                </td>
                <td style="text-align:center; background:#fff8e1;">
                    <strong style="color:#f57f17;">${formatarValorMoeda(custoDieselCalculado)}</strong><br>
                    <small style="font-size:0.65em; color:#666;">Ref: ${kmNaViagem}km</small>
                </td>
            </tr>
        `;
    });

    htmlLista += '</tbody></table></div>';

    var totalLucroLiquido = totalFaturamento - (totalCustoCalculadoDiesel + totalOutrasDespesas);

    if (modalSummary) {
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; background:#e0f2f1; padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid #b2dfdb;">
                <div style="text-align:center;">
                    <small style="color:#00695c; font-weight:bold;">FATURAMENTO</small><br>
                    <span style="font-weight:800; color:#004d40;">${formatarValorMoeda(totalFaturamento)}</span>
                </div>
                <div style="text-align:center;">
                    <small style="color:#c62828; font-weight:bold;">DESPESAS OPER.</small><br>
                    <span style="font-weight:800; color:#c62828;">${formatarValorMoeda(totalOutrasDespesas)}</span>
                </div>
                <div style="text-align:center;">
                    <small style="color:#f57f17; font-weight:bold;">COMB. (REAL/EST)</small><br>
                    <span style="font-weight:800; color:#f57f17;">${formatarValorMoeda(totalCustoCalculadoDiesel)}</span>
                </div>
                <div style="text-align:center; background:${totalLucroLiquido>=0?'#c8e6c9':'#ffcdd2'}; border-radius:4px;">
                    <small style="color:#1b5e20; font-weight:bold;">LUCRO LÍQUIDO</small><br>
                    <span style="font-weight:800; color:${totalLucroLiquido>=0?'#1b5e20':'#b71c1c'};">${formatarValorMoeda(totalLucroLiquido)}</span>
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = htmlLista || '<p style="text-align:center; padding:20px;">Nenhuma operação registrada neste dia.</p>';
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 3: GESTÃO DE CADASTROS, INTERFACE DE FORMULÁRIOS E NOVAS FUNÇÕES
// =============================================================================

// -----------------------------------------------------------------------------
// EVENT LISTENERS DE FORMULÁRIOS (CRUD)
// -----------------------------------------------------------------------------

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
            var senha = document.getElementById('funcSenha').value; // Senha opcional na edição
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            // Se for novo cadastro com senha, cria no Auth
            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                console.log("Criando usuário no Auth...");
                // Chama função exposta no index.html (App Secundário)
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // Salva referência no Firestore (Global) para aparecer na Lista de Ativos
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, 
                    name: nome, 
                    email: email, 
                    role: funcao,
                    company: window.USUARIO_ATUAL.company, 
                    createdAt: new Date().toISOString(), 
                    approved: true, // Já nasce aprovado pois foi criado pelo admin
                    senhaVisual: senha // Salva para consulta do admin
                });
            }

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
            
            // Se editou a senha no formulário de edição, atualiza o registro visual
            if (senha) { funcionarioObj.senhaVisual = senha; }

            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo com Sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
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
// SALVAR OPERAÇÃO (COM STATUS E CHECKINS)
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se já existe e estava em andamento ou finalizada, preserva status
        if (opAntiga && !isAgendamento) {
            if (opAntiga.status === 'EM_ANDAMENTO' || opAntiga.status === 'FINALIZADA') {
                statusFinal = opAntiga.status; 
            }
        }
        
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
            var msg = isAgendamento ? "Operação Agendada! Disponível para check-in." : "Operação Salva/Atualizada!";
            alert(msg);
            e.target.reset(); document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = []; 
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects(); renderizarCalendario(); atualizarDashboard();
        });
    }
});

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES DE FORMULÁRIO E RENDERIZAÇÃO
// -----------------------------------------------------------------------------

window.toggleDriverFields = function() { var select = document.getElementById('funcFuncao'); var divMotorista = document.getElementById('driverSpecificFields'); if (select && divMotorista) { divMotorista.style.display = (select.value === 'motorista') ? 'block' : 'none'; } };
window.toggleDespesaParcelas = function() { var modo = document.getElementById('despesaModoPagamento').value; var div = document.getElementById('divDespesaParcelas'); if (div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none'; };
window.renderizarListaAjudantesAdicionados = function() { var ul = document.getElementById('listaAjudantesAdicionados'); if (!ul) return; ul.innerHTML = ''; (window._operacaoAjudantesTempList || []).forEach(item => { var func = buscarFuncionarioPorId(item.id); var nome = func ? func.nome : 'Desconhecido'; var li = document.createElement('li'); li.innerHTML = `<span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span><button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>`; ul.appendChild(li); }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var sel = document.getElementById('selectAjudantesOperacao'); var idAj = sel.value; if (!idAj) return alert("Selecione um ajudante."); if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Já está na lista."); var valor = prompt("Valor da Diária:"); if (valor) { window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); renderizarListaAjudantesAdicionados(); sel.value = ""; } });

function preencherTodosSelects() {
    const fill = (id, dados, valKey, textKey, defText) => { var el = document.getElementById(id); if (!el) return; var atual = el.value; el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); if(atual) el.value = atual; };
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    // Filtros de Relatório
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
    
    // NOVO: Filtro de Gráfico (Análise Financeira)
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    
    // Recibos e Despesas
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    fill('selectVeiculoRecibo', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'SEM VÍNCULO (GERAL)');
    fill('msgRecipientSelect', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');

    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
    if(typeof renderizarTabelaMonitoramento === 'function') {
        renderizarTabelaMonitoramento();
        renderizarTabelaFaltas(); 
    }
}

// -----------------------------------------------------------------------------
// RENDERIZAÇÃO DE TABELAS E NOVAS FUNÇÕES (VISUALIZAR E RESETAR SENHA)
// -----------------------------------------------------------------------------

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr'); 
        
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-primary" onclick="visualizarFuncionario('${f.id}')" title="Visualizar e Copiar"><i class="fas fa-eye"></i></button>
            <button class="btn-mini btn-warning" onclick="resetarSenhaFuncionario('${f.id}')" title="Redefinir Senha Manualmente"><i class="fas fa-key"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
        `; 
        
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

// NOVA FUNÇÃO: VISUALIZAR FUNCIONÁRIO COM BOTÕES DE COPIAR
window.visualizarFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    // Função interna para criar linha com botão de copiar
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

    var modalBody = document.getElementById('viewItemBody');
    var modalTitle = document.getElementById('viewItemTitle');
    if (modalBody) {
        modalTitle.textContent = "FICHA DO FUNCIONÁRIO";
        modalBody.innerHTML = html;
        document.getElementById('viewItemModal').style.display = 'flex';
    }
};

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => {
        alert("Copiado: " + texto);
    }).catch(err => console.error('Erro ao copiar', err));
};

// RESETAR SENHA MANUALMENTE
window.resetarSenhaFuncionario = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var novaSenha = prompt(`DIGITE A NOVA SENHA PARA ${f.nome}:\n(Mínimo 6 caracteres)`);
    if (!novaSenha) return;
    if (novaSenha.length < 6) return alert("A senha deve ter no mínimo 6 dígitos.");

    f.senhaVisual = novaSenha;
    
    await salvarListaFuncionarios(CACHE_FUNCIONARIOS);

    if (window.dbRef) {
        try {
            const { db, doc, updateDoc } = window.dbRef;
            await updateDoc(doc(db, "users", f.id), {
                senhaVisual: novaSenha
            });
            alert(`Senha atualizada no cadastro!\n\nNovo Login: ${f.email}\nNova Senha: ${novaSenha}\n\nInforme esta nova senha ao funcionário.`);
        } catch (e) {
            console.error(e);
            alert("Senha salva localmente, mas houve erro ao sincronizar na nuvem.");
        }
    }
};

function renderizarTabelaVeiculos() { var tbody = document.querySelector('#tabelaVeiculos tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_VEICULOS.forEach(v => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaContratantes() { var tbody = document.querySelector('#tabelaContratantes tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_CONTRATANTES.forEach(c => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaAtividades() { var tbody = document.querySelector('#tabelaAtividades tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_ATIVIDADES.forEach(a => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }

// EXCLUSÃO COM REVOGAÇÃO DE ACESSO E REMOÇÃO DA LISTA DE ATIVOS
window.excluirFuncionario = async function(id) { 
    if(!confirm("ATENÇÃO: Excluir removerá o acesso deste usuário e o retirará da lista de funcionários ativos. Continuar?")) return; 
    
    // Tenta remover da Nuvem (Users Collection) para bloquear login e sumir da lista
    if (window.dbRef) {
        try {
            const { db, doc, deleteDoc } = window.dbRef;
            await deleteDoc(doc(db, "users", id));
        } catch(e) {
            console.warn("Não foi possível remover da nuvem (offline ou erro):", e);
        }
    }

    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    
    alert("Funcionário removido e acesso revogado.");
    preencherTodosSelects(); 
    
    // Força atualização da lista de ativos se estiver visível
    if(document.getElementById('access-management').style.display === 'block' && typeof renderizarPainelEquipe === 'function') {
        renderizarPainelEquipe();
    }
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

// Fechar Modais e Render Empresa
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };
function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }
// =============================================================================
// ARQUIVO: script.js
// PARTE 4: MONITORAMENTO, MENSAGERIA, FINANCEIRO E RELATÓRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// MONITORAMENTO DE ROTAS E STATUS DA EQUIPE
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    var badge = document.getElementById('badgeCheckins');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    var pendentes = 0;

    // Filtra operações de hoje ou futuras que não estão finalizadas/canceladas
    var lista = CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA' || op.status === 'FINALIZADA') return false;
        var hoje = new Date().toISOString().split('T')[0];
        return op.data >= hoje;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    lista.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome : 'Excluído';
        
        var statusLabel = op.status;
        var statusClass = '';

        if (op.status === 'EM_ANDAMENTO') {
            statusClass = 'style="background:orange; color:white;"';
            statusLabel = 'EM ROTA';
            pendentes++;
        } else if (op.status === 'AGENDADA') {
            statusClass = 'class="status-pill pill-pending"';
        } else {
            statusClass = 'class="status-pill pill-active"';
        }

        var checkinStatus = '';
        if (op.checkins) {
            if (op.checkins.faltaMotorista) {
                checkinStatus = '<span style="color:red; font-weight:bold;">FALTOU</span>';
            } else if (op.checkins.motorista) {
                checkinStatus = '<span style="color:green;"><i class="fas fa-check-circle"></i> INICIADO</span>';
            } else {
                checkinStatus = '<span style="color:#999;">AGUARDANDO...</span>';
            }
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td>
            <td><span ${statusClass} style="padding:4px 8px; border-radius:12px; font-size:0.75rem;">${statusLabel}</span></td>
            <td>${checkinStatus}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (badge) {
        badge.textContent = pendentes;
        badge.style.display = pendentes > 0 ? 'inline-block' : 'none';
    }
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Busca faltas no histórico de operações
    CACHE_OPERACOES.forEach(op => {
        if (op.checkins && op.checkins.faltaMotorista) {
             var mot = buscarFuncionarioPorId(op.motoristaId);
             addFaltaRow(tbody, op.data, mot, 'Motorista', 'FALTA REGISTRADA NO CHECK-IN');
        }
        if (op.ajudantes && op.checkins && op.checkins.faltas) {
            op.ajudantes.forEach(aj => {
                if (op.checkins.faltas[aj.id]) {
                    var f = buscarFuncionarioPorId(aj.id);
                    addFaltaRow(tbody, op.data, f, 'Ajudante', 'FALTA REGISTRADA NO CHECK-IN');
                }
            });
        }
    });

    function addFaltaRow(tb, data, func, cargo, motivo) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(data)}</td>
            <td>${func ? func.nome : 'Desconhecido'}</td>
            <td>${cargo}</td>
            <td style="color:red;">${motivo}</td>
            <td><button class="btn-mini btn-secondary" disabled>Registrado</button></td>
        `;
        tb.appendChild(tr);
    }
};

// -----------------------------------------------------------------------------
// GESTÃO DE EQUIPE E MENSAGERIA
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = function() {
    // 1. Renderiza Solicitações de Perfil
    var tbReq = document.querySelector('#tabelaProfileRequests tbody');
    if(tbReq) {
        tbReq.innerHTML = '';
        var pendentes = CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE');
        var badge = document.getElementById('badgeAccess');
        if(badge) badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';

        pendentes.forEach(req => {
            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatarDataParaBrasileiro(req.data.split('T')[0])}</td>
                <td>${req.funcionarioEmail}</td>
                <td><strong style="color:var(--primary-color)">${req.campo}</strong></td>
                <td>${req.valorNovo}</td>
                <td>
                    <button class="btn-mini btn-success" onclick="aprovarAlteracaoPerfil('${req.id}')" title="Aprovar"><i class="fas fa-check"></i></button>
                    <button class="btn-mini btn-danger" onclick="rejeitarAlteracaoPerfil('${req.id}')" title="Rejeitar"><i class="fas fa-times"></i></button>
                </td>
            `;
            tbReq.appendChild(tr);
        });
    }

    // 2. Renderiza Lista de Pendentes de Aprovação (Login) e Ativos (Firebase Users)
    if (window.dbRef && window.USUARIO_ATUAL.role !== 'motorista') {
        const { db, collection, query, where, getDocs } = window.dbRef;
        const q = query(collection(db, "users"), where("company", "==", window.USUARIO_ATUAL.company));
        
        getDocs(q).then((querySnapshot) => {
            var tbPend = document.querySelector('#tabelaCompanyPendentes tbody');
            var tbAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
            if(tbPend) tbPend.innerHTML = '';
            if(tbAtivos) tbAtivos.innerHTML = '';

            querySnapshot.forEach((docSnap) => {
                var u = docSnap.data();
                if (u.role === 'super_admin') return;

                // Linha da Tabela
                var tr = document.createElement('tr');
                // Se aprovado vai para lista de ativos, senão pendentes
                if (u.approved) {
                    var btnRevogar = `<button class="btn-mini btn-danger" onclick="excluirFuncionario('${u.uid}')" title="Remover Acesso e Excluir"><i class="fas fa-trash"></i></button>`;
                    var status = '<span class="status-pill pill-active">ATIVO</span>';
                    tr.innerHTML = `<td>${u.name}</td><td style="text-transform:lowercase;">${u.email}</td><td>${u.role}</td><td>${status}</td><td>${btnRevogar}</td>`;
                    if(tbAtivos) tbAtivos.appendChild(tr);
                } else {
                    var btnAprovar = `<button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR</button>`;
                    var btnReprovar = `<button class="btn-mini btn-danger" onclick="excluirUsuarioPendente('${u.uid}')">RECUSAR</button>`;
                    tr.innerHTML = `<td>${u.name}</td><td style="text-transform:lowercase;">${u.email}</td><td>${u.role}</td><td>${formatarDataParaBrasileiro(u.createdAt.split('T')[0])}</td><td>${btnAprovar} ${btnReprovar}</td>`;
                    if(tbPend) tbPend.appendChild(tr);
                }
            });
        });
    }
};

document.getElementById('formAdminMessage').addEventListener('submit', async function(e) {
    e.preventDefault();
    var recipient = document.getElementById('msgRecipientSelect').value;
    var msg = document.getElementById('msgTextAdmin').value;
    
    // Simulação de envio (poderia ser salvo no Firebase 'messages')
    // Aqui vamos apenas salvar um alerta no LocalStorage que os funcionários leem ao logar
    var alerta = {
        id: Date.now(),
        data: new Date().toISOString(),
        de: window.USUARIO_ATUAL.nome || 'ADMINISTRADOR',
        para: recipient, // 'all' ou ID do user
        texto: msg,
        lida: false
    };

    // Salvar no Firebase se possível
    if(window.dbRef) {
        const { db, addDoc, collection } = window.dbRef;
        try {
            await addDoc(collection(db, "messages"), alerta);
            alert("Mensagem enviada com sucesso!");
            e.target.reset();
        } catch(err) {
            alert("Erro ao enviar mensagem: " + err.message);
        }
    } else {
        alert("Erro: Sistema offline. Não foi possível enviar.");
    }
});

// -----------------------------------------------------------------------------
// DESPESAS GERAIS E PAGAMENTOS
// -----------------------------------------------------------------------------

document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault();
        
        var modo = document.getElementById('despesaModoPagamento').value;
        var qtdParcelas = (modo === 'parcelado') ? parseInt(document.getElementById('despesaParcelas').value) : 1;
        var intervalo = (modo === 'parcelado') ? parseInt(document.getElementById('despesaIntervaloDias').value) : 0;
        var pagas = (modo === 'parcelado') ? parseInt(document.getElementById('despesaParcelasPagas').value) : (modo === 'avista' ? 1 : 0);
        
        var valorTotal = Number(document.getElementById('despesaGeralValor').value);
        var valorParcela = valorTotal / qtdParcelas;
        var dataBase = new Date(document.getElementById('despesaGeralData').value);

        var novasDespesas = [];

        for (var i = 0; i < qtdParcelas; i++) {
            var dataParc = new Date(dataBase);
            dataParc.setDate(dataBase.getDate() + (i * intervalo));
            
            var statusParc = (i < pagas) ? 'PAGO' : 'PENDENTE';
            
            var nova = {
                id: Date.now().toString() + '_' + i,
                data: dataParc.toISOString().split('T')[0],
                veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
                descricao: document.getElementById('despesaGeralDescricao').value + (qtdParcelas > 1 ? ` (${i+1}/${qtdParcelas})` : ''),
                valor: valorParcela.toFixed(2),
                formaPagamento: document.getElementById('despesaFormaPagamento').value,
                status: statusParc
            };
            novasDespesas.push(nova);
        }

        var lista = CACHE_DESPESAS.concat(novasDespesas);
        salvarListaDespesas(lista).then(() => {
            alert("Despesa(s) Salva(s)!");
            e.target.reset();
            document.getElementById('divDespesaParcelas').style.display = 'none';
            renderizarTabelaDespesas();
            atualizarDashboard();
        });
    }
});

window.renderizarTabelaDespesas = function() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordena por data (mais recente primeiro)
    var lista = CACHE_DESPESAS.slice().sort((a,b) => new Date(b.data) - new Date(a.data));
    
    lista.forEach(d => {
        var tr = document.createElement('tr');
        var corStatus = d.status === 'PAGO' ? 'green' : 'red';
        var btnAcao = d.status === 'PENDENTE' ? `<button class="btn-mini btn-success" onclick="marcarDespesaPaga('${d.id}')">PAGAR</button>` : '';
        btnAcao += ` <button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button>`;
        
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td>${formatarValorMoeda(d.valor)}</td>
            <td style="color:${corStatus}; font-weight:bold;">${d.status}</td>
            <td>${btnAcao}</td>
        `;
        tbody.appendChild(tr);
    });
};

window.marcarDespesaPaga = function(id) {
    var d = CACHE_DESPESAS.find(x => x.id === id);
    if(d) {
        d.status = 'PAGO';
        salvarListaDespesas(CACHE_DESPESAS).then(() => {
            renderizarTabelaDespesas();
            atualizarDashboard();
        });
    }
};

window.excluirDespesa = function(id) {
    if(!confirm("Excluir esta despesa?")) return;
    salvarListaDespesas(CACHE_DESPESAS.filter(x => x.id !== id)).then(() => {
        renderizarTabelaDespesas();
        atualizarDashboard();
    });
};

// -----------------------------------------------------------------------------
// RECIBOS E RELATÓRIOS
// -----------------------------------------------------------------------------

window.gerarReciboPagamento = function() {
    var idFunc = document.getElementById('selectMotoristaRecibo').value;
    var dtIni = document.getElementById('dataInicioRecibo').value;
    var dtFim = document.getElementById('dataFimRecibo').value;

    if(!idFunc || !dtIni || !dtFim) return alert("Preencha todos os campos!");

    var func = buscarFuncionarioPorId(idFunc);
    
    // Busca serviços no período
    var servicos = CACHE_OPERACOES.filter(op => {
        if(op.status === 'CANCELADA') return false;
        var opData = op.data;
        // Verifica motorista
        if(op.motoristaId === idFunc) return (opData >= dtIni && opData <= dtFim);
        // Verifica ajudante
        if(op.ajudantes && op.ajudantes.some(aj => aj.id === idFunc)) return (opData >= dtIni && opData <= dtFim);
        return false;
    });

    if(servicos.length === 0) return alert("Nenhum serviço encontrado neste período.");

    var htmlItens = '';
    var totalGeral = 0;

    servicos.forEach(op => {
        var valor = 0;
        var desc = '';
        var dataFmt = formatarDataParaBrasileiro(op.data);

        // Se é motorista
        if(op.motoristaId === idFunc) {
            // Verifica falta
            if(op.checkins && op.checkins.faltaMotorista) return; // Não paga se faltou
            valor = Number(op.comissao) || 0;
            desc = `COMISSÃO VIAGEM #${op.id.substr(-4)} (${op.veiculoPlaca})`;
        } else {
            // É ajudante
            var aj = op.ajudantes.find(x => x.id === idFunc);
            // Verifica falta ajudante
            if(op.checkins && op.checkins.faltas && op.checkins.faltas[idFunc]) return;
            
            valor = Number(aj.diaria) || 0;
            desc = `DIÁRIA AJUDANTE - VIAGEM #${op.id.substr(-4)}`;
        }

        totalGeral += valor;
        htmlItens += `
            <tr>
                <td style="padding:5px; border-bottom:1px solid #ccc;">${dataFmt}</td>
                <td style="padding:5px; border-bottom:1px solid #ccc;">${desc}</td>
                <td style="padding:5px; border-bottom:1px solid #ccc;">${formatarValorMoeda(valor)}</td>
            </tr>
        `;
    });

    var htmlRecibo = `
        <div id="printAreaRecibo" style="font-family: Courier, monospace; padding:20px; border:2px solid #000; max-width:800px; margin:auto; background:white; color:black;">
            <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:20px;">
                <h2 style="margin:0;">RECIBO DE PAGAMENTO</h2>
                <p style="margin:5px 0;">${CACHE_MINHA_EMPRESA.razaoSocial || 'LOGIMASTER SISTEMAS'}</p>
                <p style="margin:0; font-size:0.8rem;">CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '00.000.000/0000-00'}</p>
            </div>
            
            <p><strong>BENEFICIÁRIO:</strong> ${func.nome}</p>
            <p><strong>CPF/DOC:</strong> ${func.documento}</p>
            <p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dtIni)} A ${formatarDataParaBrasileiro(dtFim)}</p>
            
            <table style="width:100%; margin-top:20px; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#eee;">
                        <th style="text-align:left; padding:5px; border-bottom:1px solid #000;">DATA</th>
                        <th style="text-align:left; padding:5px; border-bottom:1px solid #000;">DESCRIÇÃO</th>
                        <th style="text-align:left; padding:5px; border-bottom:1px solid #000;">VALOR</th>
                    </tr>
                </thead>
                <tbody>${htmlItens}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align:right; padding:10px; font-weight:bold; font-size:1.1rem;">TOTAL LÍQUIDO:</td>
                        <td style="padding:10px; font-weight:bold; font-size:1.1rem;">${formatarValorMoeda(totalGeral)}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div style="margin-top:50px; display:flex; justify-content:space-between; gap:50px;">
                <div style="border-top:1px solid #000; flex:1; text-align:center; padding-top:5px;">Assinatura do Responsável</div>
                <div style="border-top:1px solid #000; flex:1; text-align:center; padding-top:5px;">Assinatura do Beneficiário</div>
            </div>
            <p style="text-align:center; margin-top:30px; font-size:0.7rem;">Gerado eletronicamente em ${new Date().toLocaleString()}</p>
        </div>
    `;

    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    
    // Botões de Ação
    var actionsDiv = document.getElementById('modalReciboActions');
    actionsDiv.innerHTML = `
        <button class="btn-secondary" onclick="imprimirReciboDiv()"><i class="fas fa-print"></i> IMPRIMIR</button>
        <button class="btn-success" onclick="salvarReciboHistorico('${func.id}', '${dtIni}', '${dtFim}', ${totalGeral})"><i class="fas fa-save"></i> SALVAR NO HISTÓRICO</button>
    `;

    document.getElementById('modalRecibo').style.display = 'block';
};

window.imprimirReciboDiv = function() {
    var conteudo = document.getElementById('printAreaRecibo').innerHTML;
    var telaImpressao = window.open('', '', 'width=900,height=600');
    telaImpressao.document.write('<html><head><title>IMPRIMIR RECIBO</title></head><body>');
    telaImpressao.document.write(conteudo);
    telaImpressao.document.write('</body></html>');
    telaImpressao.document.close();
    telaImpressao.print();
};

window.salvarReciboHistorico = async function(funcId, ini, fim, total) {
    var novoRecibo = {
        id: Date.now().toString(),
        dataEmissao: new Date().toISOString(),
        funcionarioId: funcId,
        periodoInicio: ini,
        periodoFim: fim,
        valorTotal: total
    };
    
    CACHE_RECIBOS.push(novoRecibo);
    await salvarListaRecibos(CACHE_RECIBOS);
    alert("Recibo salvo no histórico!");
    renderizarHistoricoRecibos();
    document.getElementById('modalRecibo').style.display = 'none';
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.getElementById('tabelaHistoricoRecibos').querySelector('tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Filtra recibos (admins veem todos, funcionarios veem só os seus)
    var lista = CACHE_RECIBOS.slice().sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao));
    
    lista.forEach(r => {
        var func = buscarFuncionarioPorId(r.funcionarioId);
        var nome = func ? func.nome : 'Excluído';
        var periodo = `${formatarDataParaBrasileiro(r.periodoInicio)} a ${formatarDataParaBrasileiro(r.periodoFim)}`;
        
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao.split('T')[0])}</td>
            <td>${nome}</td>
            <td>${periodo}</td>
            <td>${formatarValorMoeda(r.valorTotal)}</td>
            <td>SIM</td>
            <td>
                <button class="btn-mini btn-danger" onclick="excluirRecibo('${r.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.excluirRecibo = function(id) {
    if(!confirm("Excluir recibo do histórico?")) return;
    salvarListaRecibos(CACHE_RECIBOS.filter(r => r.id !== id)).then(() => renderizarHistoricoRecibos());
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: SUPER ADMIN (CORREÇÃO DE LAYOUT/INTERFACE), CRÉDITOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// PAINEL SUPER ADMIN (GESTÃO GLOBAL EXCLUSIVA)
// -----------------------------------------------------------------------------

// Carrega a árvore de empresas e usuários do Firebase Global
window.carregarPainelSuperAdmin = async function(forceUpdate = false) {
    if (!window.dbRef) return;
    const { db, collection, getDocs } = window.dbRef;
    
    var container = document.getElementById('superAdminContainer');
    if(container) container.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-circle-notch fa-spin fa-3x" style="color:var(--primary-color);"></i><br><br>Conectando ao banco de dados global...</div>';

    try {
        // Busca Global de Empresas e Usuários
        const companiesSnap = await getDocs(collection(db, "companies"));
        var companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));

        const usersSnap = await getDocs(collection(db, "users"));
        var users = [];
        usersSnap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

        if(container) container.innerHTML = '';

        if (companies.length === 0) {
            if(container) container.innerHTML = '<div style="text-align:center; padding:40px; color:#777;"><h3>Nenhuma empresa cadastrada no sistema.</h3><p>Utilize o formulário acima para criar o primeiro domínio.</p></div>';
            return;
        }

        // Renderiza Lista de Empresas (Domínios)
        companies.forEach(comp => {
            // Filtra usuários desta empresa
            var usersComp = users.filter(u => u.company === comp.id);
            var adminUser = usersComp.find(u => u.role === 'admin') || { name: 'Sem Admin', email: '---' };
            
            // Dados da Licença (Créditos)
            var isLifetime = comp.isLifetime === true;
            var validUntil = comp.creditsValidUntil ? new Date(comp.creditsValidUntil) : new Date();
            var hoje = new Date();
            
            var statusLicenca = '';
            var corLicenca = '';
            var iconeStatus = '';

            if (isLifetime) {
                statusLicenca = 'LICENÇA VITALÍCIA';
                corLicenca = '#2e7d32'; // Verde escuro
                iconeStatus = '<i class="fas fa-infinity"></i>';
            } else if (validUntil < hoje) {
                statusLicenca = 'EXPIRADO EM ' + formatarDataParaBrasileiro(validUntil.toISOString().split('T')[0]);
                corLicenca = '#c62828'; // Vermelho
                iconeStatus = '<i class="fas fa-times-circle"></i>';
            } else {
                var diffTime = Math.abs(validUntil - hoje);
                var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                statusLicenca = `ATIVO (${diffDays} dias restantes)`;
                corLicenca = '#0277bd'; // Azul
                iconeStatus = '<i class="fas fa-check-circle"></i>';
            }

            var htmlBlock = `
                <div class="company-block" style="border-left: 5px solid ${corLicenca}; margin-bottom: 20px;">
                    <div class="company-header" onclick="toggleCompanyDetails('${comp.id}')" style="background:white; padding:20px;">
                        <div style="display:flex; align-items:center; gap:15px;">
                            <div style="background:#eceff1; padding:15px; border-radius:50%; color:#455a64;">
                                <i class="fas fa-building fa-lg"></i>
                            </div>
                            <div>
                                <h4 style="font-size:1.2rem; color:#37474f; margin:0;">${comp.id.toUpperCase()}</h4>
                                <small style="color:#78909c;">Admin: ${adminUser.email}</small>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:bold; font-size:0.9rem; color:${corLicenca}; margin-bottom:5px;">
                                ${iconeStatus} ${statusLicenca}
                            </div>
                            <span style="background:#cfd8dc; padding:3px 10px; border-radius:15px; font-size:0.75rem; color:#455a64;">
                                ${usersComp.length} Usuários
                            </span>
                        </div>
                    </div>
                    
                    <div id="comp-details-${comp.id}" class="company-content" style="background:#fafafa;">
                        <div style="background:#fff; padding:15px; border:1px solid #eee; border-radius:6px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <h5 style="margin:0 0 5px 0; color:var(--primary-color);">GESTÃO DE CRÉDITOS</h5>
                                <p style="margin:0; font-size:0.8rem; color:#666;">Adicione tempo de uso ou torne o acesso vitalício.</p>
                            </div>
                            <button class="btn-warning" onclick="abrirModalCreditos('${comp.id}', '${comp.id}', ${isLifetime})">
                                <i class="fas fa-edit"></i> GERENCIAR LICENÇA
                            </button>
                        </div>

                        <h5 style="border-bottom:1px solid #ddd; padding-bottom:5px; margin-bottom:10px; color:#555;">USUÁRIOS CADASTRADOS</h5>
                        <div class="table-responsive" style="background:white;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>NOME</th>
                                        <th>EMAIL</th>
                                        <th>FUNÇÃO</th>
                                        <th>STATUS</th>
                                        <th>AÇÃO GLOBAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${usersComp.map(u => `
                                        <tr>
                                            <td>${u.name}</td>
                                            <td style="text-transform:lowercase;">${u.email}</td>
                                            <td>${u.role}</td>
                                            <td>${u.approved ? '<span style="color:green; font-weight:bold;">ATIVO</span>' : '<span style="color:red;">BLOQUEADO</span>'}</td>
                                            <td>
                                                ${u.role !== 'admin' ? `<button class="btn-mini btn-danger" onclick="excluirFuncionarioGlobal('${u.id}', '${u.company}')" title="Excluir Definitivamente"><i class="fas fa-trash"></i></button>` : '<small style="color:#999;">(Admin Principal)</small>'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            if(container) container.innerHTML += htmlBlock;
        });

    } catch (e) {
        console.error("Erro Super Admin:", e);
        if(container) container.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar dados globais: ' + e.message + '</p>';
    }
};

window.toggleCompanyDetails = function(id) {
    var el = document.getElementById('comp-details-' + id);
    if(el) el.classList.toggle('expanded');
};

window.filterGlobalUsers = function() {
    var term = document.getElementById('superAdminSearch').value.toLowerCase();
    var blocks = document.querySelectorAll('.company-block');
    blocks.forEach(b => {
        var text = b.innerText.toLowerCase();
        b.style.display = text.includes(term) ? 'block' : 'none';
    });
};

// Exclusão Global
window.excluirFuncionarioGlobal = async function(uid, companyId) {
    if(!confirm("SUPER ADMIN: Tem certeza? Isso excluirá o usuário de todos os registros.")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        alert("Usuário removido.");
        carregarPainelSuperAdmin(true);
    } catch(e) {
        alert("Erro: " + e.message);
    }
};

// --- MODAL DE CRÉDITOS ---
window.abrirModalCreditos = function(compId, nome, isLife) {
    document.getElementById('creditCompanyId').value = compId;
    document.getElementById('modalCreditCompanyName').textContent = nome.toUpperCase();
    document.getElementById('checkLifetime').checked = isLife;
    document.getElementById('manualCredits').value = '';
    
    var divAmount = document.getElementById('divCreditAmount');
    divAmount.style.opacity = isLife ? '0.5' : '1';
    divAmount.style.pointerEvents = isLife ? 'none' : 'auto';
    
    document.getElementById('modalManageCredits').style.display = 'flex';
};

document.getElementById('checkLifetime').addEventListener('change', function(e) {
    var divAmount = document.getElementById('divCreditAmount');
    divAmount.style.opacity = e.target.checked ? '0.5' : '1';
    divAmount.style.pointerEvents = e.target.checked ? 'none' : 'auto';
});

window.adjustCredits = function(months) {
    document.getElementById('manualCredits').value = months;
};

document.getElementById('formAddCredits').addEventListener('submit', async function(e) {
    e.preventDefault();
    var compId = document.getElementById('creditCompanyId').value;
    var isLife = document.getElementById('checkLifetime').checked;
    var monthsToAdd = parseInt(document.getElementById('manualCredits').value) || 0;
    
    if (!isLife && monthsToAdd <= 0) return alert("Insira os meses ou marque Vitalício.");

    try {
        const { db, doc, getDoc, updateDoc } = window.dbRef;
        const compRef = doc(db, "companies", compId);
        
        var newDate = new Date();
        if (!isLife) {
            const snap = await getDoc(compRef);
            var currentData = snap.data();
            var currentValid = currentData.creditsValidUntil ? new Date(currentData.creditsValidUntil) : new Date();
            
            if (currentValid < new Date()) currentValid = new Date();
            currentValid.setMonth(currentValid.getMonth() + monthsToAdd);
            newDate = currentValid;
        }

        await updateDoc(compRef, {
            isLifetime: isLife,
            creditsValidUntil: isLife ? null : newDate.toISOString()
        });

        alert("Status da licença atualizado!");
        document.getElementById('modalManageCredits').style.display = 'none';
        carregarPainelSuperAdmin(true);

    } catch (err) {
        console.error(err);
        alert("Erro: " + err.message);
    }
});

// -----------------------------------------------------------------------------
// SISTEMA DE VERIFICAÇÃO DE LICENÇA (BLOQUEIO)
// -----------------------------------------------------------------------------

async function verificarStatusLicenca() {
    // PROTEÇÃO CRÍTICA: Super Admin nunca é verificado
    if (!window.USUARIO_ATUAL || window.USUARIO_ATUAL.role === 'super_admin') return;
    if (!window.USUARIO_ATUAL.company) return;

    const { db, doc, getDoc } = window.dbRef;
    try {
        const compSnap = await getDoc(doc(db, "companies", window.USUARIO_ATUAL.company));
        if (compSnap.exists()) {
            const data = compSnap.data();
            const elDisplay = document.getElementById('systemCreditsDisplay');
            const elDays = document.getElementById('daysRemaining');
            
            if (elDisplay && window.USUARIO_ATUAL.role === 'admin') elDisplay.style.display = 'block';

            if (data.isLifetime) {
                if(elDays) {
                    elDays.textContent = "VITALÍCIO";
                    elDays.style.color = "var(--success-color)";
                }
            } else {
                const validade = new Date(data.creditsValidUntil);
                const hoje = new Date();
                const diffTime = validade - hoje;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if(elDays) {
                    elDays.textContent = diffDays > 0 ? `${diffDays} DIAS` : "EXPIRADO";
                    elDays.style.color = diffDays > 5 ? "var(--success-color)" : (diffDays > 0 ? "orange" : "red");
                }

                if (diffDays <= 0) {
                    bloquearSistemaPorFaltaDeCredito();
                }
            }
        }
    } catch (e) {
        console.error("Erro licença:", e);
    }
}

function bloquearSistemaPorFaltaDeCredito() {
    // Se por acaso um super admin cair aqui (impossível pela lógica, mas por segurança)
    if(window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'super_admin') return;

    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = '#263238';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = 'white';
    overlay.style.textAlign = 'center';

    overlay.innerHTML = `
        <i class="fas fa-lock" style="font-size: 5rem; color: #ef5350; margin-bottom: 20px;"></i>
        <h1 style="color: #ef5350;">ACESSO SUSPENSO</h1>
        <p style="font-size: 1.2rem; color: #b0bec5;">A licença da empresa expirou.</p>
        <button onclick="logoutSystem()" class="btn-secondary" style="margin-top: 30px;">SAIR</button>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
}

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO GLOBAL (ROTEAMENTO E UI) - CORREÇÃO CRÍTICA DE INTERFACE
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema. Perfil:", user.role);
    window.USUARIO_ATUAL = user;
    
    // ELEMENTOS DE UI PRINCIPAIS
    var sidebar = document.getElementById('sidebar');
    var mobileNav = document.querySelector('.mobile-nav');
    var mainContent = document.querySelector('.content');
    
    // MENU LISTS
    var menuAdmin = document.getElementById('menu-admin');
    var menuSuper = document.getElementById('menu-super-admin');
    var menuEmp = document.getElementById('menu-employee');
    
    // RESET INICIAL
    if(menuAdmin) menuAdmin.style.display = 'none';
    if(menuSuper) menuSuper.style.display = 'none';
    if(menuEmp) menuEmp.style.display = 'none';

    // ROTEAMENTO
    if (user.role === 'super_admin') {
        // ===========================================
        // MODO SUPER ADMIN (INTERFACE ISOLADA)
        // ===========================================
        
        // 1. Remove Sidebar e Header Mobile da visão
        if(sidebar) sidebar.style.display = 'none';
        if(mobileNav) mobileNav.style.display = 'none';
        
        // 2. Ajusta o conteúdo para Full Width (sem margem à esquerda)
        if(mainContent) {
            mainContent.style.marginLeft = '0';
            mainContent.style.marginTop = '0'; // Remove margem do header mobile
            mainContent.style.padding = '40px';
            mainContent.style.width = '100%';
        }

        // 3. Exibe apenas a seção Super Admin
        if(menuSuper) menuSuper.style.display = 'block';
        var pageSuper = document.querySelector('[data-page="super-admin"]');
        
        // Esconde todas as outras páginas manualmente para garantir
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('super-admin').classList.add('active');

        // 4. Carrega os dados
        carregarPainelSuperAdmin();

    } else {
        // ===========================================
        // MODO EMPRESA (ADMIN E FUNCIONÁRIOS)
        // ===========================================

        // 1. Restaura Sidebar e Header (Caso tenha logado como super admin antes)
        if(sidebar) sidebar.style.display = 'flex';
        // Mobile nav é flex apenas em telas pequenas (controlado pelo CSS media query), 
        // mas removemos o 'none' inline forçado se existir
        if(mobileNav) mobileNav.style.removeProperty('display'); 
        
        if(mainContent) {
            mainContent.style.removeProperty('margin-left');
            mainContent.style.removeProperty('margin-top');
            mainContent.style.removeProperty('width');
            mainContent.style.removeProperty('padding');
        }

        // 2. Verifica Licença
        await verificarStatusLicenca();
        
        // 3. Sync Firebase Empresa
        if (window.dbRef && user.company) {
            const { db, doc, onSnapshot } = window.dbRef;
            const types = [CHAVE_DB_FUNCIONARIOS, CHAVE_DB_VEICULOS, CHAVE_DB_OPERACOES, CHAVE_DB_DESPESAS, CHAVE_DB_RECIBOS];
            types.forEach(type => {
                onSnapshot(doc(db, 'companies', user.company, 'data', type), (docSnap) => {
                    if (docSnap.exists() && docSnap.data().items) {
                        localStorage.setItem(type, JSON.stringify(docSnap.data().items));
                        carregarTodosDadosLocais(); 
                        if (user.role === 'admin' && typeof atualizarDashboard === 'function') atualizarDashboard();
                        if (user.role !== 'admin' && typeof carregarPainelFuncionario === 'function') carregarPainelFuncionario();
                    }
                });
            });
        }

        if (user.role === 'admin') {
            if(menuAdmin) menuAdmin.style.display = 'block';
            document.querySelector('[data-page="home"]').click();
            preencherTodosSelects();
            renderizarCalendario();
            atualizarDashboard();
        } else {
            if(menuEmp) menuEmp.style.display = 'block';
            window.MODO_APENAS_LEITURA = true;
            document.querySelector('[data-page="employee-home"]').click();
            if(typeof carregarPainelFuncionario === 'function') carregarPainelFuncionario();
            if(typeof renderizarMeusDados === 'function') renderizarMeusDados(); 
        }
        
        window._verificacaoCreditosIntervalo = setInterval(verificarStatusLicenca, 3600000);
    }
};

window.renderizarMeusDados = function() {
    var div = document.getElementById('meusDadosContainer');
    if(div) {
        var u = window.USUARIO_ATUAL;
        var f = CACHE_FUNCIONARIOS.find(x => x.email === u.email) || u;
        div.innerHTML = `<div style="text-align:center;"><h3>${f.nome||f.name}</h3><p>${f.email}</p><p>Função: ${f.funcao||f.role}</p></div><hr><p><strong>Telefone:</strong> ${f.telefone||'-'}</p><p><strong>Endereço:</strong> ${f.endereco||'-'}</p><p><strong>PIX:</strong> ${f.pix||'-'}</p><button class="btn-warning" onclick="document.getElementById('modalRequestProfileChange').style.display='block'" style="margin-top:15px;">SOLICITAR ALTERAÇÃO</button>`;
    }
};

// Navegação (Com correção para não afetar super admin)
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Se for Super Admin, ignora cliques em itens que não sejam do seu menu (segurança visual)
        if(window.USUARIO_ATUAL.role === 'super_admin' && this.parentElement.id !== 'menu-super-admin') return;

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        
        var pageId = this.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        var tg = document.getElementById(pageId);
        if(tg) tg.classList.add('active');
        
        if (window.innerWidth <= 768) {
            var sb = document.getElementById('sidebar');
            if(sb) sb.classList.remove('active');
        }

        if (pageId === 'home') atualizarDashboard();
        if (pageId === 'employee-home') carregarPainelFuncionario();
        if (pageId === 'super-admin') carregarPainelSuperAdmin();
    });
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    var sb = document.getElementById('sidebar');
    if(sb) sb.classList.toggle('active');
});
document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
    var sb = document.getElementById('sidebar');
    if(sb) sb.classList.remove('active');
});

console.log("LOGIMASTER V20.1: Sistema carregado (Correção Super Admin).");