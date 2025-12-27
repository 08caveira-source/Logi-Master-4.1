// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 9.0 (CORREÇÕES MASTER, ALERTAS CNH & RELATÓRIOS)
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

// NOVA CONSTANTE: Armazena IDs de notificações (Agendamentos) já lidas localmente pelo motorista
const CHAVE_LOCAL_NOTIF_LIDAS = 'local_notif_lidas'; 

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 
window._mensagemAtualId = null; 
window._intervaloMonitoramento = null; 

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

// Sanitização para evitar erros no Firestore (undefined não é aceito)
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

// Salva e já renderiza se estiver na tela
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
        
        // Custo com Motorista (Comissão) - Só soma se não faltou
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

    // Soma Despesas Gerais do Mês (Sem vínculo direto com operações ou globais)
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

    // Atualiza o Gráfico (Passando os dados atuais)
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

    // === INJEÇÃO DE RESUMO DO VEÍCULO (Solicitação) ===
    // Remove resumo anterior se existir para não duplicar
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
            
            // Filtra pelo mês/ano do gráfico
            if (d.getMonth() === mes && d.getFullYear() === ano) {
                kmMes += (Number(op.kmRodado) || 0);
                
                // Custos diretos da operação
                custoTotalVeiculo += (Number(op.combustivel) || 0) + (Number(op.despesas) || 0);
                
                // Soma Litros para média
                var preco = Number(op.precoLitro) || 0;
                var valorAbast = Number(op.combustivel) || 0;
                if (preco > 0 && valorAbast > 0) litrosTotal += (valorAbast / preco);
            }
        });

        // Adiciona Despesas Gerais vinculadas ao Veículo no Mês
        CACHE_DESPESAS.forEach(d => {
            if (d.veiculoPlaca === filtroVeiculo) {
                var dt = new Date(d.data + 'T12:00:00');
                if (dt.getMonth() === mes && dt.getFullYear() === ano) {
                    custoTotalVeiculo += (Number(d.valor) || 0);
                }
            }
        });

        var media = (litrosTotal > 0) ? (kmMes / litrosTotal) : 0;

        // Cria o HTML do Card de Resumo e injeta antes do Gráfico
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
    
    // Itera Operações para popular as barras do Gráfico
    CACHE_OPERACOES.forEach(op => {
        // Aplica Filtro
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;

        var d = new Date(op.data + 'T12:00:00');
        
        // Considera apenas Confirmadas/Finalizadas para estatística
        if ((op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            
            // Custo Pessoal (Motorista)
            if (!op.checkins || !op.checkins.faltaMotorista) {
                pessoal += Number(op.comissao || 0);
            }
            
            // Custo Pessoal (Ajudantes)
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                    var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    if (!faltou) pessoal += (Number(aj.diaria)||0);
                });
            }

            manutencaoGeral += Number(op.despesas || 0);
        }
    });

    // Itera Despesas Gerais
    CACHE_DESPESAS.forEach(d => {
        // Aplica filtro de veículo nas despesas gerais
        if (filtroVeiculo && d.veiculoPlaca !== filtroVeiculo) return;

        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            manutencaoGeral += Number(d.valor || 0);
        }
    });

    var lucro = receita - (combustivel + pessoal + manutencaoGeral);

    // Renderiza Gráfico Chart.js
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'CUSTO COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO/GERAL', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: filtroVeiculo ? 'Resultados (' + filtroVeiculo + ')' : 'Resultados Gerais do Mês',
                data: [receita, combustivel, pessoal, manutencaoGeral, lucro],
                backgroundColor: [
                    'rgba(46, 125, 50, 0.7)',  // Fat (Verde)
                    'rgba(198, 40, 40, 0.7)',  // Comb (Vermelho)
                    'rgba(255, 152, 0, 0.7)',  // Pessoal (Laranja)
                    'rgba(156, 39, 176, 0.7)', // Geral (Roxo)
                    (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)') // Lucro
                ],
                borderColor: [ '#1b5e20', '#b71c1c', '#e65100', '#4a148c', '#000' ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                tooltip: { callbacks: { label: function(context) { return formatarValorMoeda(context.raw); } } } 
            },
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
// CÁLCULOS AVANÇADOS DE FROTA (GLOBAL E AUXILIARES)
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
                
                // Salva referência no Firestore (Global)
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, 
                    name: nome, 
                    email: email, 
                    role: funcao,
                    company: window.USUARIO_ATUAL.company, 
                    createdAt: new Date().toISOString(), 
                    approved: true,
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

// EXCLUSÃO COM REVOGAÇÃO DE ACESSO E ATUALIZAÇÃO DA LISTA DE ATIVOS
window.excluirFuncionario = async function(id) { 
    if(!confirm("ATENÇÃO: Excluir removerá o acesso deste usuário ao sistema imediatamente. Continuar?")) return; 
    
    // Tenta remover da Nuvem (Users Collection) para bloquear login
    if (window.dbRef) {
        try {
            const { db, doc, deleteDoc } = window.dbRef;
            await deleteDoc(doc(db, "users", id));
        } catch(e) {
            console.warn("Não foi possível remover da nuvem (offline ou erro):", e);
        }
    }

    // Remove localmente
    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    
    alert("Funcionário removido e acesso revogado.");
    preencherTodosSelects(); 
    
    // ATUALIZAÇÃO IMEDIATA DA LISTA DE FUNCIONÁRIOS ATIVOS (PAINEL EQUIPE)
    if(typeof renderizarPainelEquipe === 'function') {
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
// PARTE 4: MONITORAMENTO, RELATÓRIOS INTELIGENTES E GERAÇÃO DE RECIBOS
// =============================================================================

// -----------------------------------------------------------------------------
// 9. MONITORAMENTO DE ROTAS E FALTAS
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    var badge = document.getElementById('badgeCheckins');
    if (!tbody) return;

    tbody.innerHTML = '';
    var countPendentes = 0;
    
    // Ordena: Em andamento primeiro, depois agendadas próximas
    var lista = CACHE_OPERACOES.filter(o => o.status === 'EM_ANDAMENTO' || o.status === 'AGENDADA');
    lista.sort((a,b) => {
        if(a.status === 'EM_ANDAMENTO' && b.status !== 'EM_ANDAMENTO') return -1;
        if(b.status === 'EM_ANDAMENTO' && a.status !== 'EM_ANDAMENTO') return 1;
        return new Date(a.data) - new Date(b.data);
    });

    lista.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome.split(' ')[0] : '???';
        
        var hoje = new Date().toISOString().split('T')[0];
        var isHoje = (op.data === hoje);
        
        // Só conta para o badge se for hoje ou estiver em andamento
        if (isHoje || op.status === 'EM_ANDAMENTO') countPendentes++;

        var statusHtml = '';
        if (op.status === 'EM_ANDAMENTO') {
            statusHtml = '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>';
        } else {
            statusHtml = '<span class="status-pill pill-pending">AGENDADA</span>';
        }

        var btnAction = '';
        if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role !== 'motorista') {
             // Admin pode forçar finalização ou ver detalhes
             btnAction = `<button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')"><i class="fas fa-search"></i></button>`;
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${op.veiculoPlaca}</strong><br><small>${nomeMot}</small></td>
            <td>${statusHtml}</td>
            <td>${btnAction}</td>
        `;
        tbody.appendChild(tr);
    });

    if (badge) {
        badge.textContent = countPendentes;
        badge.style.display = countPendentes > 0 ? 'inline-block' : 'none';
    }
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Varre operações procurando flag de falta
    CACHE_OPERACOES.forEach(op => {
        if (!op.checkins) return;

        // Falta Motorista
        if (op.checkins.faltaMotorista) {
            var mot = buscarFuncionarioPorId(op.motoristaId);
            addFaltaRow(op.data, mot ? mot.nome : 'Motorista Excluído', 'MOTORISTA', op.checkins.motivoFalta || 'Não justificado', op.id);
        }

        // Faltas Ajudantes
        if (op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(ajId => {
                if (op.checkins.faltas[ajId]) {
                    var aj = buscarFuncionarioPorId(ajId);
                    addFaltaRow(op.data, aj ? aj.nome : 'Ajudante', 'AJUDANTE', 'Falta registrada no check-in', op.id);
                }
            });
        }
    });

    function addFaltaRow(data, nome, cargo, motivo, opId) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(data)}</td>
            <td>${nome}</td>
            <td><span class="status-pill pill-blocked">${cargo}</span></td>
            <td>${motivo}</td>
            <td><button class="btn-mini btn-secondary" onclick="visualizarOperacao('${opId}')"><i class="fas fa-eye"></i></button></td>
        `;
        tbody.appendChild(tr);
    }
};

// -----------------------------------------------------------------------------
// 10. RELATÓRIOS GERENCIAIS (LÓGICA CORRIGIDA E EXPANDIDA)
// -----------------------------------------------------------------------------

window.gerarRelatorioGeral = function() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    var motId = document.getElementById('selectMotoristaRelatorio').value;
    var placa = document.getElementById('selectVeiculoRelatorio').value;
    var cnpj = document.getElementById('selectContratanteRelatorio').value;
    var atvId = document.getElementById('selectAtividadeRelatorio').value;

    if (!inicio || !fim) return alert("Selecione o período inicial e final.");

    var totalFat = 0;
    var totalCombustivel = 0; // Separado conforme solicitado
    var totalOutrosGastos = 0; // Comissões, Pedágios, Ajudantes
    var totalLucro = 0;

    var html = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO GERENCIAL DE FROTAS</h3>
            <p>Período: ${formatarDataParaBrasileiro(inicio)} a ${formatarDataParaBrasileiro(fim)}</p>
        </div>
        <table class="data-table" style="font-size:0.85rem;">
            <thead>
                <tr style="background:#eee;">
                    <th>DATA</th>
                    <th>VEÍCULO / CLIENTE</th>
                    <th>MOTORISTA</th>
                    <th style="text-align:right;">FATURAMENTO</th>
                    <th style="text-align:right;">COMBUSTÍVEL</th>
                    <th style="text-align:right;">OUTROS GASTOS</th>
                    <th style="text-align:right;">LUCRO LÍQ.</th>
                </tr>
            </thead>
            <tbody>
    `;

    var opsFiltradas = CACHE_OPERACOES.filter(op => {
        if (op.status === 'CANCELADA') return false;
        if (op.data < inicio || op.data > fim) return false;
        if (motId && op.motoristaId !== motId) return false;
        if (placa && op.veiculoPlaca !== placa) return false;
        if (cnpj && op.contratanteCNPJ !== cnpj) return false;
        if (atvId && op.atividadeId !== atvId) return false;
        return true;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (opsFiltradas.length === 0) {
        document.getElementById('reportResults').style.display = 'block';
        document.getElementById('reportContent').innerHTML = '<p style="text-align:center; padding:20px;">Nenhum registro encontrado para os filtros selecionados.</p>';
        return;
    }

    opsFiltradas.forEach(op => {
        var rec = Number(op.faturamento) || 0;
        
        // Cálculo Isolado do Combustível
        var comb = Number(op.combustivel) || 0;
        
        // Cálculo de Outros Gastos (Comissão, Ajudantes, Despesas)
        var outros = (Number(op.despesas) || 0);
        
        if (!op.checkins || !op.checkins.faltaMotorista) {
            outros += (Number(op.comissao) || 0);
        }
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                var f = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!f) outros += (Number(aj.diaria) || 0);
            });
        }

        var luc = rec - (comb + outros);

        totalFat += rec;
        totalCombustivel += comb;
        totalOutrosGastos += outros;
        totalLucro += luc;

        var mot = buscarFuncionarioPorId(op.motoristaId);
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);

        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td><strong>${op.veiculoPlaca}</strong><br><small>${cli ? cli.razaoSocial.substr(0,15) : 'N/A'}</small></td>
                <td>${mot ? mot.nome.split(' ')[0] : '-'}</td>
                <td style="text-align:right; color:green;">${formatarValorMoeda(rec)}</td>
                <td style="text-align:right; color:#c62828;">${formatarValorMoeda(comb)}</td>
                <td style="text-align:right; color:#ef6c00;">${formatarValorMoeda(outros)}</td>
                <td style="text-align:right; font-weight:bold;">${formatarValorMoeda(luc)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot style="background:#263238; color:white; font-weight:bold;">
                <tr>
                    <td colspan="3" style="text-align:right;">TOTAIS GERAIS:</td>
                    <td style="text-align:right;">${formatarValorMoeda(totalFat)}</td>
                    <td style="text-align:right; color:#ffcdd2;">${formatarValorMoeda(totalCombustivel)}</td>
                    <td style="text-align:right; color:#ffe0b2;">${formatarValorMoeda(totalOutrosGastos)}</td>
                    <td style="text-align:right; color:#c8e6c9;">${formatarValorMoeda(totalLucro)}</td>
                </tr>
            </tfoot>
        </table>
        
        <div style="margin-top:20px; padding:15px; background:#e0f2f1; border:1px solid #b2dfdb; border-radius:6px;">
            <h4 style="color:#00695c;">RESUMO FINANCEIRO</h4>
            <p><strong>FATURAMENTO BRUTO:</strong> ${formatarValorMoeda(totalFat)}</p>
            <p><strong>GASTO TOTAL COMBUSTÍVEL:</strong> ${formatarValorMoeda(totalCombustivel)} (${totalFat > 0 ? ((totalCombustivel/totalFat)*100).toFixed(1) : 0}%)</p>
            <p><strong>OUTROS CUSTOS OPERACIONAIS:</strong> ${formatarValorMoeda(totalOutrosGastos)}</p>
            <hr>
            <p style="font-size:1.2rem; color:${totalLucro>=0?'green':'red'};"><strong>RESULTADO LÍQUIDO: ${formatarValorMoeda(totalLucro)}</strong></p>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarRelatorioCobranca = function() {
    var cnpj = document.getElementById('selectContratanteRelatorio').value;
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;

    if (!cnpj) return alert("Por favor, selecione um CONTRATANTE (Cliente) para gerar o relatório de cobrança.");
    if (!inicio || !fim) return alert("Selecione o período.");

    var cliente = buscarContratantePorCnpj(cnpj);
    var nomeCliente = cliente ? cliente.razaoSocial : "CLIENTE DIVERSO";

    var ops = CACHE_OPERACOES.filter(op => {
        return op.contratanteCNPJ === cnpj && 
               op.data >= inicio && 
               op.data <= fim && 
               op.status !== 'CANCELADA';
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (ops.length === 0) return alert("Nenhuma operação encontrada para este cliente no período.");

    var totalBruto = 0;
    var totalAdiantamentos = 0;

    var html = `
        <div style="padding:20px;">
            <div style="border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px;">
                <h2 style="margin:0;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</h2>
                <p><strong>Cliente:</strong> ${nomeCliente}</p>
                <p><strong>CNPJ:</strong> ${cnpj}</p>
                <p><strong>Período:</strong> ${formatarDataParaBrasileiro(inicio)} a ${formatarDataParaBrasileiro(fim)}</p>
            </div>

            <table class="data-table">
                <thead>
                    <tr style="background:#f5f5f5;">
                        <th>DATA</th>
                        <th>VEÍCULO (PLACA)</th>
                        <th>DESCRIÇÃO / ATIVIDADE</th>
                        <th style="text-align:right;">VALOR SERVIÇO</th>
                        <th style="text-align:right;">ADIANTAMENTO (-)</th>
                        <th style="text-align:right;">SUBTOTAL</th>
                    </tr>
                </thead>
                <tbody>
    `;

    ops.forEach(op => {
        var atv = buscarAtividadePorId(op.atividadeId);
        var desc = atv ? atv.nome : 'FRETE / SERVIÇO';
        var valor = Number(op.faturamento) || 0;
        var adiant = Number(op.adiantamento) || 0; // Pega o adiantamento
        
        var subtotal = valor - adiant; // Cálculo linha a linha

        totalBruto += valor;
        totalAdiantamentos += adiant;

        // Formatação condicional para adiantamento
        var adiantHtml = adiant > 0 ? `<span style="color:red;">- ${formatarValorMoeda(adiant)}</span>` : '-';

        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${desc} <small>(ID: ${op.id.substr(-4)})</small></td>
                <td style="text-align:right;">${formatarValorMoeda(valor)}</td>
                <td style="text-align:right;">${adiantHtml}</td>
                <td style="text-align:right; font-weight:bold;">${formatarValorMoeda(subtotal)}</td>
            </tr>
        `;
    });

    var totalLiquido = totalBruto - totalAdiantamentos;

    html += `
                </tbody>
            </table>

            <div style="margin-top: 30px; display:flex; justify-content:flex-end;">
                <div style="width: 300px; text-align:right;">
                    <p>TOTAL SERVIÇOS: <strong>${formatarValorMoeda(totalBruto)}</strong></p>
                    <p style="color:red;">TOTAL ADIANTAMENTOS: <strong>- ${formatarValorMoeda(totalAdiantamentos)}</strong></p>
                    <hr>
                    <h3 style="background:#eee; padding:10px;">TOTAL A PAGAR: ${formatarValorMoeda(totalLiquido)}</h3>
                </div>
            </div>
            
            <div style="margin-top:50px; text-align:center; font-size:0.8rem; color:#666;">
                <p>_______________________________________________________</p>
                <p>ASSINATURA / ACEITE</p>
            </div>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if(!element || element.innerHTML.trim() === '') return alert("Gere um relatório primeiro.");
    
    var opt = {
        margin: 0.5,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// -----------------------------------------------------------------------------
// 11. GERAÇÃO DE RECIBOS DE PAGAMENTO (MOTORISTA/AJUDANTE)
// -----------------------------------------------------------------------------

window.gerarReciboPagamento = function() {
    var funcId = document.getElementById('selectMotoristaRecibo').value;
    var inicio = document.getElementById('dataInicioRecibo').value;
    var fim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !inicio || !fim) return alert("Preencha todos os campos do recibo.");

    var funcionario = buscarFuncionarioPorId(funcId);
    if (!funcionario) return;

    var totalComissao = 0;
    var itensHtml = '';

    // Filtra Operações do período para o funcionário
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (op.data < inicio || op.data > fim) return;

        var valorGanho = 0;
        var descricao = '';
        var dataFmt = formatarDataParaBrasileiro(op.data);

        // Se for Motorista
        if (funcionario.funcao === 'motorista' && String(op.motoristaId) === String(funcId)) {
            // Verifica falta
            if (op.checkins && op.checkins.faltaMotorista) {
                // Não recebe nada se faltou
                return; 
            }
            valorGanho = Number(op.comissao) || 0;
            descricao = `COMISSÃO VIAGEM (${op.veiculoPlaca})`;
        }
        // Se for Ajudante
        else if (funcionario.funcao === 'ajudante' && op.ajudantes) {
            var entry = op.ajudantes.find(a => String(a.id) === String(funcId));
            if (entry) {
                // Verifica falta
                var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[funcId]);
                if (!faltou) {
                    valorGanho = Number(entry.diaria) || 0;
                    descricao = `DIÁRIA AJUDANTE (${op.veiculoPlaca})`;
                }
            }
        }

        if (valorGanho > 0) {
            totalComissao += valorGanho;
            itensHtml += `
                <tr>
                    <td>${dataFmt}</td>
                    <td>${descricao}</td>
                    <td style="text-align:right;">${formatarValorMoeda(valorGanho)}</td>
                </tr>
            `;
        }
    });

    if (totalComissao === 0) return alert("Nenhum valor a receber encontrado neste período.");

    var reciboHtml = `
        <div style="padding:40px; font-family:'Courier New', Courier, monospace; border:2px solid #333;">
            <h2 style="text-align:center; text-decoration:underline;">RECIBO DE PAGAMENTO</h2>
            <p style="text-align:right; margin-bottom:30px;">Valor: <strong>${formatarValorMoeda(totalComissao)}</strong></p>
            
            <p>Recebi de <strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'EMPRESA LOGÍSTICA'}</strong></p>
            <p>A quantia de <strong>${formatarValorMoeda(totalComissao)}</strong></p>
            <p>Referente aos serviços prestados no período de ${formatarDataParaBrasileiro(inicio)} a ${formatarDataParaBrasileiro(fim)}.</p>
            
            <table style="width:100%; margin:20px 0; border-collapse:collapse; font-size:0.9rem;">
                <tr style="border-bottom:1px dashed #000;">
                    <th style="text-align:left;">DATA</th>
                    <th style="text-align:left;">DESCRIÇÃO</th>
                    <th style="text-align:right;">VALOR</th>
                </tr>
                ${itensHtml}
                <tr style="border-top:1px solid #000;">
                    <td colspan="2"><strong>TOTAL</strong></td>
                    <td style="text-align:right;"><strong>${formatarValorMoeda(totalComissao)}</strong></td>
                </tr>
            </table>

            <div style="margin-top:50px; display:flex; justify-content:space-between;">
                <div>
                    <p>__________________________</p>
                    <p>ASSINATURA RESPONSÁVEL</p>
                </div>
                <div>
                    <p>__________________________</p>
                    <p><strong>${funcionario.nome}</strong></p>
                    <p>CPF: ${funcionario.documento}</p>
                </div>
            </div>
            <p style="text-align:center; margin-top:30px; font-size:0.8rem;">Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
    `;

    document.getElementById('modalReciboContent').innerHTML = reciboHtml;
    
    // Configura botões do modal
    var actionsDiv = document.getElementById('modalReciboActions');
    actionsDiv.innerHTML = `
        <button class="btn-primary" onclick="salvarReciboNoHistorico('${funcId}', ${totalComissao}, '${inicio}', '${fim}')">
            <i class="fas fa-save"></i> SALVAR E FECHAR
        </button>
        <button class="btn-secondary" onclick="imprimirReciboDiv()">
            <i class="fas fa-print"></i> IMPRIMIR
        </button>
    `;
    
    document.getElementById('modalRecibo').style.display = 'block';
};

window.salvarReciboNoHistorico = function(funcId, valor, inicio, fim) {
    var novoRecibo = {
        id: Date.now().toString(),
        dataEmissao: new Date().toISOString(),
        funcionarioId: funcId,
        periodoInicio: inicio,
        periodoFim: fim,
        valorTotal: valor,
        enviado: false
    };
    
    CACHE_RECIBOS.push(novoRecibo);
    salvarListaRecibos(CACHE_RECIBOS).then(() => {
        alert("Recibo salvo no histórico!");
        document.getElementById('modalRecibo').style.display = 'none';
        renderizarTabelaHistoricoRecibos();
    });
};

window.renderizarTabelaHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordena mais recente primeiro
    var lista = CACHE_RECIBOS.slice().sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao));
    
    lista.forEach(r => {
        var f = buscarFuncionarioPorId(r.funcionarioId);
        var nome = f ? f.nome : 'Excluído';
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao.split('T')[0])}</td>
            <td>${nome}</td>
            <td>${formatarDataParaBrasileiro(r.periodoInicio)} a ${formatarDataParaBrasileiro(r.periodoFim)}</td>
            <td>${formatarValorMoeda(r.valorTotal)}</td>
            <td>${r.enviado ? 'SIM' : 'NÃO'}</td>
            <td>
                <button class="btn-mini btn-secondary" onclick="imprimirReciboHistorico('${r.id}')"><i class="fas fa-print"></i></button>
                <button class="btn-mini delete-btn" onclick="excluirRecibo('${r.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.imprimirReciboDiv = function() {
    var conteudo = document.getElementById('modalReciboContent').innerHTML;
    var telaImpressao = window.open('', '', 'width=800,height=600');
    telaImpressao.document.write('<html><head><title>Imprimir Recibo</title></head><body>');
    telaImpressao.document.write(conteudo);
    telaImpressao.document.write('</body></html>');
    telaImpressao.document.close();
    telaImpressao.focus();
    telaImpressao.print();
    telaImpressao.close();
};

window.excluirRecibo = function(id) {
    if (!confirm("Excluir este recibo do histórico?")) return;
    var novaLista = CACHE_RECIBOS.filter(r => String(r.id) !== String(id));
    salvarListaRecibos(novaLista).then(() => renderizarTabelaHistoricoRecibos());
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: INICIALIZAÇÃO, SISTEMA DE ALERTAS (CNH/AGENDAMENTOS) E PAINEL MASTER
// =============================================================================

// -----------------------------------------------------------------------------
// 12. SISTEMA DE NOTIFICAÇÕES E ALERTAS AUTOMÁTICOS
// -----------------------------------------------------------------------------

// Verifica CNH e Agendamentos ao iniciar
window.verificarNotificacoesAutomaticas = function(usuario) {
    if (!usuario) return;
    
    // 1. VERIFICAÇÃO DE CNH (Para Motoristas)
    if (usuario.role === 'motorista') {
        // Busca dados atualizados do funcionário na lista local
        var func = CACHE_FUNCIONARIOS.find(f => f.email === usuario.email);
        
        if (func && func.validadeCNH) {
            var hoje = new Date();
            hoje.setHours(0,0,0,0);
            var validade = new Date(func.validadeCNH + 'T12:00:00'); // Compensar fuso
            
            // Diferença em dias
            var diffTime = validade - hoje;
            var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            // CNH VENCIDA (Dia exato ou passado)
            if (diffDays <= 0) {
                document.getElementById('modalUpdateCNH').style.display = 'flex';
                return; // Bloqueia fluxo até atualizar
            }
            
            // AVISO PRÉVIO (30 dias ou 7 dias)
            if (diffDays === 30 || diffDays === 7) {
                mostrarNotificacaoModal(
                    `SUA CNH VENCE EM ${diffDays} DIAS!`,
                    `Olá ${func.nome}, sua habilitação vence em ${formatarDataParaBrasileiro(func.validadeCNH)}. Por favor, regularize para continuar operando.`
                );
            }
        }
    }

    // 2. AVISO DE AGENDAMENTO (1 Dia Antes)
    if (usuario.role === 'motorista') {
        var amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        var strAmanha = amanha.toISOString().split('T')[0];

        // Busca IDs já lidos no LocalStorage
        var lidos = JSON.parse(localStorage.getItem(CHAVE_LOCAL_NOTIF_LIDAS) || '[]');

        // Procura operação agendada para amanhã que ainda não foi lida
        var opAmanha = CACHE_OPERACOES.find(op => {
            return op.motoristaId === usuario.uid && 
                   op.status === 'AGENDADA' && 
                   op.data === strAmanha &&
                   !lidos.includes(op.id);
        });

        if (opAmanha) {
            var msg = `Você tem uma operação agendada para AMANHÃ (${formatarDataParaBrasileiro(strAmanha)}).\n\nVeículo: ${opAmanha.veiculoPlaca}\nCliente: ${buscarContratantePorCnpj(opAmanha.contratanteCNPJ)?.razaoSocial || 'Cliente'}`;
            
            // Mostra o modal e marca como lida ao fechar
            mostrarNotificacaoModal("AGENDA AMANHÃ", msg, function() {
                lidos.push(opAmanha.id);
                localStorage.setItem(CHAVE_LOCAL_NOTIF_LIDAS, JSON.stringify(lidos));
            });
        }
    }

    // 3. AVISO PARA ADMIN (CNHs Vencendo na Equipe)
    if (usuario.role === 'admin' || usuario.role === 'super_admin') {
        var countCNH = 0;
        CACHE_FUNCIONARIOS.forEach(f => {
            if (f.funcao === 'motorista' && f.validadeCNH) {
                var v = new Date(f.validadeCNH);
                var h = new Date();
                var d = Math.ceil((v - h) / (1000 * 60 * 60 * 24));
                if (d <= 30) countCNH++;
            }
        });
        
        var badge = document.getElementById('badgeAccess');
        if (badge) {
            badge.style.display = countCNH > 0 ? 'inline-block' : 'none';
            badge.title = `${countCNH} motorista(s) com CNH vencendo ou vencida.`;
        }
    }
};

// Função genérica para modal de mensagem
function mostrarNotificacaoModal(titulo, mensagem, callbackClose) {
    var modal = document.getElementById('modalNotification');
    var txt = document.getElementById('notificationMessageText');
    var sender = document.getElementById('notificationSender');
    
    if (modal && txt) {
        txt.innerHTML = mensagem.replace(/\n/g, '<br>');
        sender.textContent = titulo;
        modal.style.display = 'flex';
        
        // Sobrescreve o onclick do botão para incluir o callback se existir
        var btn = modal.querySelector('button');
        btn.onclick = function() {
            modal.style.display = 'none';
            if (callbackClose) callbackClose();
        };
    }
}

// Handler para Atualização de CNH Vencida (Formulário do Modal)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formUpdateCNH') {
        e.preventDefault();
        var novaData = document.getElementById('newCNHDate').value;
        if (!novaData) return alert("Informe a data.");
        
        if (!window.USUARIO_ATUAL) return;

        // Atualiza na lista local
        var funcIndex = CACHE_FUNCIONARIOS.findIndex(f => f.email === window.USUARIO_ATUAL.email);
        if (funcIndex >= 0) {
            CACHE_FUNCIONARIOS[funcIndex].validadeCNH = novaData;
            await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
            
            alert("Validade atualizada com sucesso! Acesso liberado.");
            document.getElementById('modalUpdateCNH').style.display = 'none';
        } else {
            alert("Erro ao localizar seu cadastro. Contate o administrador.");
        }
    }
});

// -----------------------------------------------------------------------------
// 13. LÓGICA DO SUPER ADMIN (PAINEL MASTER CORRIGIDO)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando dados globais do Firestore...</p>';

    if (!window.dbRef) return;
    const { db, collection, getDocs } = window.dbRef;

    try {
        // 1. Busca TODOS os usuários registrados na coleção 'users'
        // Nota: Isso requer regras de segurança no Firestore que permitam ao Super Admin ler 'users'
        const usersSnap = await getDocs(collection(db, "users"));
        var allUsers = [];
        usersSnap.forEach(doc => allUsers.push(doc.data()));

        // Agrupa por Empresa (Domínio)
        var empresasMap = {};
        
        allUsers.forEach(u => {
            var empresaKey = u.company || 'SEM EMPRESA';
            if (!empresasMap[empresaKey]) {
                empresasMap[empresaKey] = { users: [], domain: empresaKey };
            }
            empresasMap[empresaKey].users.push(u);
        });

        container.innerHTML = '';
        var countTotal = 0;

        Object.keys(empresasMap).forEach(key => {
            var emp = empresasMap[key];
            countTotal++;
            
            var userListHtml = emp.users.map(u => `
                <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee; align-items:center;">
                    <div>
                        <strong>${u.name || u.email}</strong><br>
                        <small>${u.email} (${u.role})</small>
                    </div>
                    <div>
                        <span class="status-pill ${u.approved ? 'pill-active' : 'pill-pending'}">${u.approved ? 'ATIVO' : 'PENDENTE'}</span>
                        <button class="btn-mini btn-warning" onclick="resetarSenhaGlobal('${u.uid}')" title="Resetar Senha"><i class="fas fa-key"></i></button>
                    </div>
                </div>
            `).join('');

            var htmlBlock = `
                <div class="company-block">
                    <div class="company-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                        <h4><i class="fas fa-building"></i> ${key.toUpperCase()}</h4>
                        <span class="company-meta">${emp.users.length} Usuários</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="company-content">
                        ${userListHtml}
                        <div style="margin-top:10px; text-align:right;">
                            <button class="btn-mini btn-danger" onclick="excluirEmpresaGlobal('${key}')">EXCLUIR EMPRESA E DADOS</button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += htmlBlock;
        });

        if (countTotal === 0) container.innerHTML = '<p>Nenhuma empresa encontrada.</p>';

    } catch (e) {
        console.error("Erro Super Admin:", e);
        container.innerHTML = `<p style="color:red;">Erro ao carregar lista global: ${e.message}</p>`;
    }
};

window.filterGlobalUsers = function() {
    var term = document.getElementById('superAdminSearch').value.toLowerCase();
    var blocks = document.querySelectorAll('.company-block');
    
    blocks.forEach(block => {
        var text = block.innerText.toLowerCase();
        block.style.display = text.includes(term) ? 'block' : 'none';
    });
};

// Reset de Senha Global (Envia email de reset do Firebase)
window.resetarSenhaGlobal = async function(uid) {
    if(!confirm("Enviar e-mail de redefinição de senha para este usuário?")) return;
    // Precisaríamos do email, buscamos no DOM ou no objeto se possível, 
    // mas aqui vamos simplificar assumindo que o admin sabe o email ou implementamos busca
    alert("Função de reset direto pelo painel master: Implemente envio de email via Cloud Function ou use o painel Firebase Console por segurança.");
};

// -----------------------------------------------------------------------------
// 14. INICIALIZAÇÃO DO SISTEMA E NAVEGAÇÃO
// -----------------------------------------------------------------------------

window.initSystemByRole = function(user) {
    console.log("Inicializando sistema para função:", user.role);
    window.USUARIO_ATUAL = user;

    // Esconde todos os menus primeiro
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';

    // Configura UI baseada na role
    if (user.role === 'super_admin') {
        document.getElementById('menu-super-admin').style.display = 'block';
        carregarPainelSuperAdmin();
        document.querySelector('[data-page="super-admin"]').click();
        
    } else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        carregarTodosDadosLocais(); // Carrega dados da empresa do admin
        
        // Listener para sincronização em tempo real (Firestore -> Local)
        configurarListenersFirestore(user.company);
        
        // Abre dashboard
        document.querySelector('[data-page="home"]').click();
        verificarNotificacoesAutomaticas(user);

    } else {
        // Funcionário (Motorista/Ajudante)
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true; // Bloqueia edições críticas
        carregarTodosDadosLocais(); 
        configurarListenersFirestore(user.company);
        
        // Abre painel de funcionário
        document.querySelector('[data-page="employee-home"]').click();
        
        if (user.role === 'motorista') {
            verificarNotificacoesAutomaticas(user);
        }
    }
    
    renderizarInformacoesEmpresa();
};

function configurarListenersFirestore(companyId) {
    if (!window.dbRef || !companyId) return;
    const { db, doc, onSnapshot } = window.dbRef;
    
    // Escuta coleção 'companies/ID/data/db_operacoes' etc
    // Exemplo simplificado para Operações (Principal)
    onSnapshot(doc(db, 'companies', companyId, 'data', 'db_operacoes'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Verifica se timestamp é mais recente que local para evitar loop
            // Simplificação: Atualiza sempre que vem da nuvem
            if (data.items) {
                console.log("Sincronização Nuvem -> Local recebida (Operações)");
                CACHE_OPERACOES = data.items;
                localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(CACHE_OPERACOES));
                
                // Atualiza UI se estiver na tela
                renderizarCalendario();
                atualizarDashboard();
                if(window.location.hash.includes('employee')) renderizarPainelFuncionario(); 
            }
        }
    });
    // Repetir lógica para outras coleções se necessário...
}

// Navegação Sidebar
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // UI Active Class
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        
        // Show Page
        var pageId = this.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        var targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
            
            // Triggers de renderização ao entrar na aba
            if (pageId === 'home') { atualizarDashboard(); renderizarCalendario(); }
            if (pageId === 'checkins-pendentes') { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
            if (pageId === 'operacoes') { renderizarTabelaOperacoes(); preencherTodosSelects(); }
            if (pageId === 'relatorios') { preencherTodosSelects(); }
            if (pageId === 'graficos') { atualizarDashboard(); } // Recalcula graficos
            if (pageId === 'employee-home') { renderizarPainelFuncionario(); }
        }

        // Fecha menu mobile se aberto
        document.getElementById('sidebar').classList.remove('active');
    });
});

// Mobile Menu
document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('active');
});
document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.remove('active');
});

// Abas Cadastro
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.getAttribute('data-tab')).classList.add('active');
    });
});

// Painel Inicial do Funcionário (Listagem de Viagens)
window.renderizarPainelFuncionario = function() {
    if (!window.USUARIO_ATUAL) return;
    
    var container = document.getElementById('listaServicosAgendados');
    if (!container) return;

    var hoje = new Date().toISOString().split('T')[0];
    var html = '';

    // Filtra viagens para este motorista/ajudante
    var minhasOps = CACHE_OPERACOES.filter(op => {
        var souMotorista = (String(op.motoristaId) === String(window.USUARIO_ATUAL.uid));
        var souAjudante = (op.ajudantes && op.ajudantes.some(aj => String(aj.id) === String(window.USUARIO_ATUAL.uid)));
        
        return (souMotorista || souAjudante) && op.status !== 'CANCELADA';
    }).sort((a,b) => new Date(a.data) - new Date(b.data)); // Antigas primeiro? Ou futuras? Vamos por data.

    if (minhasOps.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Nenhuma viagem agendada ou realizada.</p>';
        return;
    }

    minhasOps.forEach(op => {
        // Lógica de visualização simplificada para Card Mobile
        var statusColor = op.status === 'FINALIZADA' ? 'green' : (op.status === 'EM_ANDAMENTO' ? 'orange' : '#555');
        var isHoje = (op.data === hoje);
        
        // Botão de Check-in (Só aparece se for HOJE e Status permitir)
        var btnCheckin = '';
        if (isHoje && (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO') && window.USUARIO_ATUAL.role === 'motorista') {
            btnCheckin = `<button class="btn-primary" style="width:100%; margin-top:10px;" onclick="iniciarCheckinFuncionario('${op.id}')">
                <i class="fas fa-map-marker-alt"></i> ${op.status === 'AGENDADA' ? 'INICIAR VIAGEM' : 'FINALIZAR VIAGEM'}
            </button>`;
        } else if (op.status === 'FINALIZADA') {
            btnCheckin = `<div style="text-align:center; margin-top:10px; color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> CONCLUÍDO</div>`;
        }

        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Cliente';
        
        html += `
            <div class="card" style="border-left: 5px solid ${statusColor}; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h4 style="margin:0; color:#333;">${formatarDataParaBrasileiro(op.data)}</h4>
                        <small style="color:${statusColor}; font-weight:bold;">${op.status}</small>
                    </div>
                    <div style="text-align:right;">
                        <small>#${op.id.substr(-4)}</small>
                    </div>
                </div>
                <div style="margin-top:10px;">
                    <p><strong>Veículo:</strong> ${op.veiculoPlaca}</p>
                    <p><strong>Cliente:</strong> ${cliente}</p>
                </div>
                ${btnCheckin}
            </div>
        `;
    });

    container.innerHTML = html;
};

// Fluxo de Check-in (Simplificado para o Motorista)
window.iniciarCheckinFuncionario = function(opId) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    var step = (op.status === 'AGENDADA') ? 'inicio' : 'fim';
    
    // Popula Modal
    document.getElementById('checkinOpId').value = op.id;
    document.getElementById('checkinStep').value = step;
    document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
    document.getElementById('checkinDisplayContratante').textContent = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '';
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;

    var divKmInicial = document.getElementById('divKmInicial');
    var divKmFinal = document.getElementById('divKmFinal');
    var title = document.getElementById('checkinModalTitle');

    if (step === 'inicio') {
        title.textContent = "INICIAR VIAGEM";
        divKmInicial.style.display = 'block';
        divKmFinal.style.display = 'none';
        document.getElementById('checkinDriverFields').style.display = 'block';
    } else {
        title.textContent = "FINALIZAR VIAGEM";
        divKmInicial.style.display = 'none';
        divKmFinal.style.display = 'block';
        document.getElementById('checkinDriverFields').style.display = 'block';
        document.getElementById('checkinKmInicialReadonly').value = op.kmInicial || 0;
    }

    document.getElementById('modalCheckinConfirm').style.display = 'flex';
};

document.getElementById('formCheckinConfirm').addEventListener('submit', function(e) {
    e.preventDefault();
    var id = document.getElementById('checkinOpId').value;
    var step = document.getElementById('checkinStep').value;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    
    if (step === 'inicio') {
        op.kmInicial = document.getElementById('checkinKmInicial').value;
        op.status = 'EM_ANDAMENTO';
        // Registra hora inicio? Opcional
    } else {
        op.kmFinal = document.getElementById('checkinKmFinal').value;
        op.combustivel = document.getElementById('checkinValorAbastecido').value;
        op.precoLitro = document.getElementById('checkinPrecoLitroConfirm').value;
        
        // Calcula KM Rodado
        if (op.kmFinal && op.kmInicial) {
            op.kmRodado = Number(op.kmFinal) - Number(op.kmInicial);
        }
        op.status = 'FINALIZADA'; // Ou 'CONFIRMADA' dependendo do fluxo
    }

    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        alert("Check-in realizado com sucesso!");
        document.getElementById('modalCheckinConfirm').style.display = 'none';
        renderizarPainelFuncionario();
    });
});