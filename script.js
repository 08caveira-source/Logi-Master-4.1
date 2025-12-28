// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 22.0 (CRÉDITOS, SUPER ADMIN E SEGURANÇA)
// PARTE 1/5: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
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

// VARIÁVEIS GLOBAIS DO SISTEMA DE CRÉDITOS
window.SYSTEM_STATUS = {
    validade: null, // Data ISO
    isVitalicio: false,
    bloqueado: false
};

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
    
    // 3. Atualiza Firebase (Se logado e com sistema ativo)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Bloqueio de escrita se o sistema estiver vencido (exceto super admin)
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
// PARTE 2/5: LÓGICA DE DASHBOARD, CÁLCULOS FINANCEIROS E GRÁFICOS INTERATIVOS
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
// PARTE 3/5: GESTÃO DE CADASTROS, INTERFACE DE FORMULÁRIOS E FUNÇÕES DE UI
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

// EXCLUSÃO COM REVOGAÇÃO DE ACESSO
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

    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    
    alert("Funcionário removido e acesso revogado.");
    preencherTodosSelects(); 
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
// PARTE 4/5: MONITORAMENTO, GESTÃO DE EQUIPE, RELATÓRIOS E RECIBOS
// =============================================================================

// -----------------------------------------------------------------------------
// 9. MONITORAMENTO DE ROTAS E CHECK-INS
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra operações que estão 'AGENDADA' ou 'EM_ANDAMENTO'
    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma rota ativa ou pendente no momento.</td></tr>';
        document.getElementById('badgeCheckins').style.display = 'none';
        return;
    }

    // Atualiza Badge
    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = 'inline-block';
    }

    pendentes.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome.split(' ')[0] : '---';
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        var statusDisplay = '';
        if (op.status === 'EM_ANDAMENTO') {
            statusDisplay = '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>';
        } else {
            statusDisplay = '<span class="status-pill pill-pending">AGUARDANDO INÍCIO</span>';
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td>
            <td>${nomeCli}</td>
            <td>${statusDisplay}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var contadorFaltas = 0;

    // Varre operações para encontrar faltas registradas no objeto checkins
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;

        // Falta Motorista
        if (op.checkins.faltaMotorista) {
            var mot = buscarFuncionarioPorId(op.motoristaId);
            if (mot) {
                adicionarLinhaFalta(tbody, op.data, mot.nome, 'MOTORISTA', 'JUSTIFICADA/PENDENTE', op.id);
                contadorFaltas++;
            }
        }

        // Falta Ajudantes
        if (op.checkins.faltas) { // Objeto {idAjudante: true}
            Object.keys(op.checkins.faltas).forEach(idAj => {
                if (op.checkins.faltas[idAj]) {
                    var aj = buscarFuncionarioPorId(idAj);
                    if (aj) {
                        adicionarLinhaFalta(tbody, op.data, aj.nome, 'AJUDANTE', 'JUSTIFICADA/PENDENTE', op.id);
                        contadorFaltas++;
                    }
                }
            });
        }
    });

    if (contadorFaltas === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">Nenhuma ocorrência registrada.</td></tr>';
    }
};

function adicionarLinhaFalta(tbody, data, nome, funcao, status, opId) {
    var tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${formatarDataParaBrasileiro(data)}</td>
        <td style="color:var(--danger-color); font-weight:bold;">${nome}</td>
        <td>${funcao}</td>
        <td>${status}</td>
        <td><button class="btn-mini btn-secondary" onclick="visualizarOperacao('${opId}')">VER VIAGEM</button></td>
    `;
    tbody.appendChild(tr);
}

// -----------------------------------------------------------------------------
// 10. GESTÃO DE EQUIPE (ADMINISTRATIVO)
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = async function() {
    // 1. Renderiza Solicitações de Perfil (Mudança de Dados)
    renderizarTabelaProfileRequests();

    // 2. Renderiza Usuários Pendentes de Aprovação (Login)
    // Busca usuários do Firestore que pertencem a esta empresa e approved = false
    if (window.dbRef && window.USUARIO_ATUAL) {
        try {
            const { db, collection, query, where, getDocs } = window.dbRef;
            const q = query(collection(db, "users"), 
                where("company", "==", window.USUARIO_ATUAL.company),
                where("approved", "==", false)
            );
            const snapshot = await getDocs(q);
            
            var tbodyPend = document.querySelector('#tabelaCompanyPendentes tbody');
            if (tbodyPend) {
                tbodyPend.innerHTML = '';
                if (snapshot.empty) {
                    tbodyPend.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum cadastro pendente.</td></tr>';
                } else {
                    snapshot.forEach(docSnap => {
                        var u = docSnap.data();
                        var tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${u.name}</td>
                            <td>${u.email}</td>
                            <td>${u.role}</td>
                            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                            <td>
                                <button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')"><i class="fas fa-check"></i></button>
                                <button class="btn-mini btn-danger" onclick="recusarUsuario('${u.uid}')"><i class="fas fa-times"></i></button>
                            </td>
                        `;
                        tbodyPend.appendChild(tr);
                    });
                }
            }
        } catch (e) { console.error("Erro ao buscar pendentes:", e); }
    }

    // 3. Renderiza Usuários Ativos (Local + Status)
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        CACHE_FUNCIONARIOS.forEach(f => {
            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.nome}</td>
                <td>${f.email || '-'}</td>
                <td><span class="status-pill pill-active">${f.funcao}</span></td>
                <td style="color:green;">ATIVO</td>
                <td>
                    <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
                </td>
            `;
            tbodyAtivos.appendChild(tr);
        });
    }
};

window.aprovarUsuario = async function(uid) {
    if(!confirm("Aprovar acesso deste usuário?")) return;
    try {
        const { db, doc, updateDoc } = window.dbRef;
        await updateDoc(doc(db, "users", uid), { approved: true });
        alert("Usuário aprovado!");
        renderizarPainelEquipe();
    } catch(e) { alert("Erro: " + e.message); }
};

window.recusarUsuario = async function(uid) {
    if(!confirm("Recusar e remover solicitação?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        alert("Solicitação removida.");
        renderizarPainelEquipe();
    } catch(e) { alert("Erro: " + e.message); }
};

window.renderizarTabelaProfileRequests = function() {
    var tbody = document.getElementById('tabelaProfileRequests').querySelector('tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    var pendentes = CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE');
    
    if(pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação de alteração.</td></tr>';
        document.getElementById('badgeAccess').style.display = 'none';
        return;
    }

    document.getElementById('badgeAccess').style.display = 'inline-block';
    
    pendentes.forEach(req => {
        var func = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
        var nome = func ? func.nome : req.funcionarioEmail;
        
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(req.data.split('T')[0])}</td>
            <td>${nome}</td>
            <td>${req.campo}</td>
            <td style="font-weight:bold; color:var(--primary-color);">${req.valorNovo}</td>
            <td>
                <button class="btn-mini btn-success" onclick="aprovarProfileRequest('${req.id}')" title="Aprovar e Alterar"><i class="fas fa-check"></i></button>
                <button class="btn-mini btn-danger" onclick="rejeitarProfileRequest('${req.id}')" title="Rejeitar"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.aprovarProfileRequest = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if(!req) return;
    
    var func = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
    if(func) {
        // Mapeia campo da requisição para campo do objeto
        if(req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        else if(req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        else if(req.campo === 'PIX') func.pix = req.valorNovo;
        else if(req.campo === 'CNH') func.cnh = req.valorNovo;
        else if(req.campo === 'VALIDADE_CNH') func.validadeCNH = req.valorNovo;
        else if(req.campo === 'EMAIL') func.email = req.valorNovo;
        
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    req.status = 'APROVADO';
    await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
    alert("Dados atualizados com sucesso!");
};

window.rejeitarProfileRequest = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if(req) {
        req.status = 'REJEITADO';
        await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
        renderizarTabelaProfileRequests();
    }
};

// -----------------------------------------------------------------------------
// 11. GERAÇÃO DE RELATÓRIOS
// -----------------------------------------------------------------------------

function filtrarOperacoesParaRelatorio() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    
    if (!inicio || !fim) {
        alert("Selecione o período.");
        return null;
    }

    var motoristaId = document.getElementById('selectMotoristaRelatorio').value;
    var veiculoPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var contratanteCnpj = document.getElementById('selectContratanteRelatorio').value;
    var atividadeId = document.getElementById('selectAtividadeRelatorio').value;

    return CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < inicio || op.data > fim) return false;
        if (motoristaId && op.motoristaId !== motoristaId) return false;
        if (veiculoPlaca && op.veiculoPlaca !== veiculoPlaca) return false;
        if (contratanteCnpj && op.contratanteCNPJ !== contratanteCnpj) return false;
        if (atividadeId && op.atividadeId !== atividadeId) return false;
        return true;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));
}

window.gerarRelatorioGeral = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var html = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO GERAL DE OPERAÇÕES</h3>
            <p>Período: ${formatarDataParaBrasileiro(document.getElementById('dataInicioRelatorio').value)} a ${formatarDataParaBrasileiro(document.getElementById('dataFimRelatorio').value)}</p>
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>DATA</th>
                    <th>VEÍCULO</th>
                    <th>MOTORISTA</th>
                    <th>CLIENTE</th>
                    <th>FATURAMENTO</th>
                    <th>LUCRO ESTIMADO</th>
                </tr>
            </thead>
            <tbody>
    `;

    var totalFat = 0;
    var totalLucro = 0;

    ops.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        
        var receita = Number(op.faturamento)||0;
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0) + (Number(op.comissao)||0);
        
        // Add ajudantes ao custo
        if(op.ajudantes) op.ajudantes.forEach(aj => {
             var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
             if(!faltou) custo += (Number(aj.diaria)||0);
        });

        var lucro = receita - custo;

        totalFat += receita;
        totalLucro += lucro;

        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${mot ? mot.nome : '-'}</td>
                <td>${cli ? cli.razaoSocial : '-'}</td>
                <td>${formatarValorMoeda(receita)}</td>
                <td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td>
            </tr>
        `;
    });

    html += `
            <tr style="background:#f5f5f5; font-weight:bold;">
                <td colspan="4" style="text-align:right;">TOTAIS:</td>
                <td style="color:var(--primary-color);">${formatarValorMoeda(totalFat)}</td>
                <td style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</td>
            </tr>
        </tbody></table>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarRelatorioCobranca = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    // Agrupar por Cliente
    var porCliente = {};
    ops.forEach(op => {
        var cNome = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'DESCONHECIDO';
        if (!porCliente[cNome]) porCliente[cNome] = { ops: [], total: 0 };
        porCliente[cNome].ops.push(op);
        porCliente[cNome].total += (Number(op.faturamento)||0);
    });

    var html = `
        <div style="text-align:center; margin-bottom:30px;">
            <h2>RELATÓRIO DE COBRANÇA (CLIENTES)</h2>
            <p>Emissão: ${new Date().toLocaleDateString()}</p>
        </div>
    `;

    for (var cliente in porCliente) {
        html += `
            <div style="margin-bottom:30px; border:1px solid #ccc; padding:15px; page-break-inside: avoid;">
                <h3 style="background:#eee; padding:10px; margin:-15px -15px 15px -15px; border-bottom:1px solid #ccc;">${cliente}</h3>
                <table class="data-table" style="width:100%;">
                    <thead><tr><th>DATA</th><th>PLACA</th><th>SERVIÇO</th><th>VALOR</th></tr></thead>
                    <tbody>
        `;
        porCliente[cliente].ops.forEach(op => {
            var atv = buscarAtividadePorId(op.atividadeId)?.nome || '-';
            html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${atv}</td><td>${formatarValorMoeda(op.faturamento)}</td></tr>`;
        });
        html += `
                    </tbody>
                    <tfoot>
                        <tr style="background:#fff8e1;">
                            <td colspan="3" style="text-align:right; font-weight:bold;">TOTAL A PAGAR:</td>
                            <td style="font-weight:bold; font-size:1.1rem;">${formatarValorMoeda(porCliente[cliente].total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') {
        alert("Gere um relatório primeiro.");
        return;
    }
    
    var opt = {
        margin: 10,
        filename: 'Relatorio_LogiMaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// -----------------------------------------------------------------------------
// 12. EMISSÃO DE RECIBOS DE PAGAMENTO
// -----------------------------------------------------------------------------

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!motId || !dataIni || !dataFim) return alert("Preencha todos os campos para gerar o recibo.");

    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário inválido.");

    // Cálculos
    var totalComissao = 0;
    var totalDiarias = 0;
    var totalAdiantamentos = 0; 
    var opsEnvolvidas = [];

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (op.data < dataIni || op.data > dataFim) return;

        var participou = false;
        var valorGanho = 0;
        
        // Verifica se é motorista
        if (op.motoristaId === motId) {
            // Verifica falta
            if (!op.checkins || !op.checkins.faltaMotorista) {
                participou = true;
                valorGanho = Number(op.comissao) || 0;
                totalComissao += valorGanho;
                if (op.adiantamento) totalAdiantamentos += (Number(op.adiantamento) || 0); // Adiantamento desconta do total da empresa, mas aqui assume-se que já foi pago
            }
        } 
        // Verifica se é ajudante
        else if (op.ajudantes) {
            var registroAj = op.ajudantes.find(a => a.id === motId);
            if (registroAj) {
                var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[motId]);
                if (!faltou) {
                    participou = true;
                    valorGanho = Number(registroAj.diaria) || 0;
                    totalDiarias += valorGanho;
                }
            }
        }

        if (participou) {
            opsEnvolvidas.push({
                data: op.data,
                cliente: buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Avulso',
                valor: valorGanho
            });
        }
    });

    var valorTotalBruto = totalComissao + totalDiarias;
    
    // Layout do Recibo
    var htmlRecibo = `
        <div style="border: 2px solid #333; padding: 30px; font-family: 'Courier New', monospace; background:#fff;">
            <div style="text-align:center; border-bottom: 2px dashed #333; padding-bottom:15px; margin-bottom:20px;">
                <h2 style="margin:0;">RECIBO DE PAGAMENTO</h2>
                <p style="margin:5px 0;">${CACHE_MINHA_EMPRESA.razaoSocial || 'LOGIMASTER TRANSP.'}</p>
                <p style="font-size:0.8rem;">CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '--'}</p>
            </div>

            <div style="margin-bottom:20px; font-size:1.1rem;">
                <p><strong>BENEFICIÁRIO:</strong> ${funcionario.nome}</p>
                <p><strong>CPF/DOC:</strong> ${funcionario.documento}</p>
                <p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dataIni)} A ${formatarDataParaBrasileiro(dataFim)}</p>
            </div>

            <table style="width:100%; border-collapse: collapse; margin-bottom:20px; font-size:0.9rem;">
                <thead>
                    <tr style="border-bottom:1px solid #000;">
                        <th style="text-align:left;">DATA</th>
                        <th style="text-align:left;">REF. SERVIÇO</th>
                        <th style="text-align:right;">VALOR</th>
                    </tr>
                </thead>
                <tbody>
                    ${opsEnvolvidas.map(o => `
                        <tr>
                            <td>${formatarDataParaBrasileiro(o.data)}</td>
                            <td>${o.cliente.substring(0,20)}</td>
                            <td style="text-align:right;">${formatarValorMoeda(o.valor)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="text-align:right; font-size:1.4rem; font-weight:bold; margin-top:30px; border-top:2px solid #333; padding-top:10px;">
                TOTAL A RECEBER: ${formatarValorMoeda(valorTotalBruto)}
            </div>

            <div style="margin-top:60px; text-align:center; font-size:0.8rem;">
                ____________________________________________________<br>
                ASSINATURA DO RECEBEDOR<br>
                DATA: ____/____/________
            </div>
        </div>
    `;

    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    
    // Botões de Ação do Recibo
    var actionsDiv = document.getElementById('modalReciboActions');
    actionsDiv.innerHTML = `
        <button class="btn-primary" onclick="imprimirRecibo()"><i class="fas fa-print"></i> IMPRIMIR</button>
        <button class="btn-success" onclick="salvarReciboNoHistorico('${funcionario.id}', '${funcionario.nome}', '${dataIni}', '${dataFim}', ${valorTotalBruto})"><i class="fas fa-save"></i> SALVAR NO HISTÓRICO</button>
    `;

    document.getElementById('modalRecibo').style.display = 'flex';
};

window.imprimirRecibo = function() {
    var conteudo = document.getElementById('modalReciboContent').innerHTML;
    var janela = window.open('', '', 'height=600,width=800');
    janela.document.write('<html><head><title>RECIBO</title></head><body>');
    janela.document.write(conteudo);
    janela.document.write('</body></html>');
    janela.document.close();
    janela.print();
};

window.salvarReciboNoHistorico = function(funcId, funcNome, ini, fim, valor) {
    var novoRecibo = {
        id: Date.now().toString(),
        dataEmissao: new Date().toISOString(),
        funcionarioId: funcId,
        funcionarioNome: funcNome,
        periodo: `${formatarDataParaBrasileiro(ini)} a ${formatarDataParaBrasileiro(fim)}`,
        valorTotal: valor
    };
    
    var lista = CACHE_RECIBOS || [];
    lista.push(novoRecibo);
    salvarListaRecibos(lista).then(() => {
        alert("Recibo salvo no histórico!");
        renderizarHistoricoRecibos();
    });
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    (CACHE_RECIBOS || []).sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(r.dataEmissao).toLocaleDateString()}</td>
            <td>${r.funcionarioNome}</td>
            <td>${r.periodo}</td>
            <td style="color:green; font-weight:bold;">${formatarValorMoeda(r.valorTotal)}</td>
            <td><span class="status-pill pill-active">GERADO</span></td>
            <td><button class="btn-mini btn-secondary"><i class="fas fa-print"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5/5: SUPER ADMIN (CORREÇÃO), SISTEMA DE CRÉDITOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 13. PAINEL SUPER ADMIN (MASTER) - CORREÇÃO DE CARREGAMENTO
// -----------------------------------------------------------------------------

var _cacheGlobalUsers = [];

window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;

    if (forceRefresh) container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Atualizando dados globais...</p>';

    if (!window.dbRef) return console.error("Firebase não inicializado.");

    try {
        // Busca todos os usuários do sistema (Global)
        const { db, collection, getDocs, query, orderBy } = window.dbRef;
        const q = query(collection(db, "users"), orderBy("company"));
        const snapshot = await getDocs(q);
        
        _cacheGlobalUsers = [];
        snapshot.forEach(doc => {
            _cacheGlobalUsers.push(doc.data());
        });

        renderizarListaGlobal(_cacheGlobalUsers);

    } catch (erro) {
        console.error("Erro Super Admin:", erro);
        container.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar lista global: ' + erro.message + '</p>';
    }
};

function renderizarListaGlobal(listaUsuarios) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;
    
    container.innerHTML = '';

    // Agrupar por Empresa (Domínio)
    var empresas = {};
    
    listaUsuarios.forEach(u => {
        var emp = u.company || 'SEM_EMPRESA';
        if (!empresas[emp]) {
            empresas[emp] = {
                id: emp,
                usuarios: [],
                admin: null,
                validade: null,
                isVitalicio: false
            };
        }
        empresas[emp].usuarios.push(u);
        if (u.role === 'admin') {
            empresas[emp].admin = u;
            empresas[emp].validade = u.systemValidity || null; // Data ISO
            empresas[emp].isVitalicio = u.isVitalicio || false;
        }
    });

    if (Object.keys(empresas).length === 0) {
        container.innerHTML = '<p style="text-align:center;">Nenhuma empresa encontrada.</p>';
        return;
    }

    // Renderizar Blocos de Empresa
    Object.values(empresas).forEach(emp => {
        var qtdUsers = emp.usuarios.length;
        var nomeAdmin = emp.admin ? emp.admin.name : '(Sem Admin)';
        
        // Status da Validade
        var statusValidade = '<span class="status-pill pill-blocked">SEM DADOS</span>';
        if (emp.isVitalicio) {
            statusValidade = '<span class="status-pill pill-active"><i class="fas fa-infinity"></i> VITALÍCIO</span>';
        } else if (emp.validade) {
            var diasRestantes = Math.ceil((new Date(emp.validade) - new Date()) / (1000 * 60 * 60 * 24));
            if (diasRestantes > 0) {
                statusValidade = `<span class="status-pill pill-active">${diasRestantes} DIAS RESTANTES</span>`;
            } else {
                statusValidade = `<span class="status-pill pill-blocked">VENCIDO HÁ ${Math.abs(diasRestantes)} DIAS</span>`;
            }
        }

        var bloco = document.createElement('div');
        bloco.className = 'company-block';
        
        var htmlUsuarios = emp.usuarios.map(u => `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee; font-size:0.85rem;">
                <div>
                    <strong>${u.name}</strong> (${u.role})<br>
                    <span style="color:#666;">${u.email}</span>
                </div>
                <div>
                    ${u.role !== 'admin_master' ? 
                      `<button class="btn-mini delete-btn" onclick="excluirUsuarioGlobal('${u.uid}')" title="Excluir Usuário"><i class="fas fa-trash"></i></button>` 
                      : ''}
                    ${(u.role === 'admin' && !u.approved) ? 
                      `<button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR</button>` 
                      : ''}
                </div>
            </div>
        `).join('');

        bloco.innerHTML = `
            <div class="company-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                <div style="flex:1;">
                    <h4 style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-building"></i> ${emp.id.toUpperCase()}
                        ${!emp.admin ? '<small style="color:red;">(Sem Admin)</small>' : ''}
                    </h4>
                    <div style="font-size:0.75rem; color:#555; margin-top:4px;">Admin: ${nomeAdmin}</div>
                </div>
                <div class="company-meta">
                    ${statusValidade}
                    <span style="background:#ddd; padding:2px 6px; border-radius:4px;">${qtdUsers} Usuários</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
            <div class="company-content">
                <div style="display:flex; justify-content:flex-end; margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:10px;">
                     <button class="btn-mini btn-warning" onclick="abrirModalCreditos('${emp.id}', '${emp.validade || ''}', ${emp.isVitalicio})">
                        <i class="fas fa-coins"></i> GERENCIAR CRÉDITOS / ACESSO
                     </button>
                </div>
                ${htmlUsuarios}
            </div>
        `;
        
        container.appendChild(bloco);
    });
}

window.filterGlobalUsers = function() {
    var termo = document.getElementById('superAdminSearch').value.toLowerCase();
    if (!termo) return renderizarListaGlobal(_cacheGlobalUsers);

    var filtrados = _cacheGlobalUsers.filter(u => 
        u.name.toLowerCase().includes(termo) || 
        u.email.toLowerCase().includes(termo) || 
        (u.company && u.company.toLowerCase().includes(termo))
    );
    renderizarListaGlobal(filtrados);
};

// -----------------------------------------------------------------------------
// 14. SISTEMA DE CRÉDITOS E VALIDADE
// -----------------------------------------------------------------------------

window.abrirModalCreditos = function(companyId, validadeAtual, isVitalicio) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    
    var textoVal = "SEM REGISTRO";
    if (isVitalicio) textoVal = "VITALÍCIO (SEM VENCIMENTO)";
    else if (validadeAtual) textoVal = formatarDataParaBrasileiro(validadeAtual.split('T')[0]);
    
    document.getElementById('validadeAtualCredito').textContent = textoVal;
    document.getElementById('checkVitalicio').checked = isVitalicio;
    
    // Toggle input de meses se for vitalício
    var divQtd = document.getElementById('divAddCreditos');
    divQtd.style.display = isVitalicio ? 'none' : 'block';
    document.getElementById('checkVitalicio').onchange = function() {
        divQtd.style.display = this.checked ? 'none' : 'block';
    };

    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    var isVitalicio = document.getElementById('checkVitalicio').checked;
    var mesesAdd = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    if (!companyId) return;

    try {
        const { db, collection, query, where, getDocs, updateDoc, doc } = window.dbRef;
        
        // Encontra o ADMIN da empresa para setar a validade nele (Centralizador)
        const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return alert("Erro: Empresa sem administrador identificado.");
        
        var adminDoc = snapshot.docs[0];
        var dadosAtuais = adminDoc.data();
        var novaData = null;

        if (!isVitalicio) {
            var baseData = new Date();
            // Se já tem validade futura, soma a partir dela
            if (dadosAtuais.systemValidity && new Date(dadosAtuais.systemValidity) > baseData) {
                baseData = new Date(dadosAtuais.systemValidity);
            }
            baseData.setDate(baseData.getDate() + (mesesAdd * 30));
            novaData = baseData.toISOString();
        }

        await updateDoc(doc(db, "users", adminDoc.id), {
            systemValidity: novaData,
            isVitalicio: isVitalicio
        });

        alert("Créditos/Validade atualizados com sucesso!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin(true); // Recarrega lista

    } catch (erro) {
        console.error(erro);
        alert("Erro ao salvar créditos: " + erro.message);
    }
};

window.excluirUsuarioGlobal = async function(uid) {
    if (!confirm("Tem certeza? Esta ação é irreversível.")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        carregarPainelSuperAdmin(true); // Refresh
    } catch(e) { alert("Erro: " + e.message); }
};

// CRIAÇÃO DE NOVA EMPRESA (SUPER ADMIN)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dominio = document.getElementById('newCompanyDomain').value.trim();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("Domínio inválido.");
        
        try {
            // Cria Auth
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            
            // Cria Doc User Admin
            const { db, doc, setDoc } = window.dbRef;
            await setDoc(doc(db, "users", uid), {
                uid: uid,
                name: "ADMIN " + dominio.toUpperCase(),
                email: email,
                role: 'admin',
                company: dominio,
                createdAt: new Date().toISOString(),
                approved: true,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(), // 30 dias grátis inicial
                isVitalicio: false
            });
            
            alert(`Empresa ${dominio} criada com sucesso!\nAdmin: ${email}`);
            e.target.reset();
            carregarPainelSuperAdmin(true);
            
        } catch (erro) {
            alert("Erro ao criar empresa: " + erro.message);
        }
    }
});

// -----------------------------------------------------------------------------
// 15. INICIALIZAÇÃO DO SISTEMA (ROTEAMENTO E VERIFICAÇÕES)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log("Inicializando para:", user.role, user.email);
    window.USUARIO_ATUAL = user;
    
    // Ocultar todos os menus primeiro
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');
    
    // Reset Views
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // 1. SUPER ADMIN (MASTER)
    if (user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('userRoleDisplay').textContent = "SUPER ADMIN";
        document.querySelector('[data-page="super-admin"]').click();
        carregarPainelSuperAdmin(true);
        return; 
    }

    // 2. VERIFICAÇÃO DE BLOQUEIO / APROVAÇÃO (ADMIN E FUNCIONÁRIOS)
    if (!user.approved) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#eceff1; color:#37474f; text-align:center;">
                <i class="fas fa-lock" style="font-size:4rem; margin-bottom:20px; color:#cfd8dc;"></i>
                <h1>ACESSO EM ANÁLISE</h1>
                <p>Sua conta foi criada, mas aguarda aprovação do administrador da empresa <strong>${user.company}</strong>.</p>
                <button onclick="logoutSystem()" class="btn-primary" style="margin-top:20px;">VOLTAR AO LOGIN</button>
            </div>
        `;
        return;
    }

    // 3. CARREGAMENTO DE DADOS ESPECÍFICOS DA EMPRESA
    // Agora o sistema carrega os dados do LocalStorage, mas idealmente deveria sincronizar do Firestore da empresa
    // Para simplificar, mantemos a lógica híbrida: user auth no firestore, dados operacionais no LocalStorage (como estava no original)
    // Mas se quiser usar o Firestore completo para dados, as funções salvarDadosGenerico (Parte 1) já salvam lá.
    // Aqui vamos checar a validade do sistema (Créditos)
    
    var diasRestantes = 0;
    var sistemaBloqueado = false;
    
    // Se for ADMIN, verifica a própria validade salva no user doc
    if (user.role === 'admin') {
        if (!user.isVitalicio) {
            if (!user.systemValidity) {
                // Caso legado ou novo sem data: concede 7 dias de cortesia ou bloqueia
                sistemaBloqueado = true; 
            } else {
                var hoje = new Date();
                var vencimento = new Date(user.systemValidity);
                diasRestantes = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));
                
                if (vencimento < hoje) sistemaBloqueado = true;
            }
        }
    } else {
        // Se for funcionário, precisaria checar o admin da empresa. 
        // Para simplificar, assumimos que o funcionário loga, mas se o admin não pagou, o salvamento na nuvem falha (verificado na Parte 1).
        // Visualmente, não bloqueamos o funcionário totalmente, mas avisamos se possível.
    }

    // TELA DE BLOQUEIO FINANCEIRO (ADMIN)
    if (user.role === 'admin' && sistemaBloqueado && !user.isVitalicio) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#ffebee; color:#b71c1c; text-align:center;">
                <i class="fas fa-ban" style="font-size:4rem; margin-bottom:20px;"></i>
                <h1>ASSINATURA VENCIDA</h1>
                <p>O acesso ao sistema da empresa <strong>${user.company}</strong> está suspenso por falta de créditos.</p>
                <p style="margin-top:10px;">Por favor, entre em contato com o suporte para renovar sua licença.</p>
                <button onclick="logoutSystem()" class="btn-danger" style="margin-top:30px;">SAIR</button>
            </div>
        `;
        return;
    }

    // 4. ROUTING DE MENUS
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        
        // Exibir Validade na Sidebar
        var displayVal = document.getElementById('systemValidityDisplay');
        var spanData = document.getElementById('valDataVencimento');
        if (displayVal && spanData) {
            displayVal.style.display = 'block';
            if (user.isVitalicio) {
                spanData.textContent = "VITALÍCIO";
                displayVal.style.borderLeftColor = "gold";
            } else {
                spanData.textContent = formatarDataParaBrasileiro(user.systemValidity.split('T')[0]);
                if (diasRestantes < 5) displayVal.classList.add('expired'); // Fica vermelho se < 5 dias
            }
        }

        renderizarPainelEquipe();
        renderizarCalendario();
        atualizarDashboard(); // Já carrega gráficos
        document.querySelector('[data-page="home"]').click();

    } else if (user.role === 'motorista' || user.role === 'ajudante') {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        // Tenta buscar serviços vinculados a este usuário
        filtrarServicosFuncionario(user.uid);
        document.querySelector('[data-page="employee-home"]').click();
    }
};

// -----------------------------------------------------------------------------
// 16. EVENTOS DE NAVEGAÇÃO E UI
// -----------------------------------------------------------------------------

// Navegação Sidebar
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Remove active class
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none'; // Força display none para animação funcionar
        });
        
        // Add active
        this.classList.add('active');
        var pageId = this.getAttribute('data-page');
        var targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            setTimeout(() => targetPage.classList.add('active'), 10); // Timeout para CSS transition
        }

        // Se mobile, fecha menu
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('active');
        }
        
        // Trigger de Atualizações Específicas
        if (pageId === 'home') atualizarDashboard();
        if (pageId === 'graficos') atualizarGraficoPrincipal(new Date().getMonth(), new Date().getFullYear());
    });
});

// Mobile Menu
document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('active');
});

document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.remove('active');
});

// Abas de Cadastro
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        
        this.classList.add('active');
        var tabId = this.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});