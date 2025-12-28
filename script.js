// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 7.1 (ATUALIZAÇÃO: CRÉDITOS SAAS E SUPER ADMIN)
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
// Nova variável para controlar se os alertas de CNH já foram exibidos na sessão
window._cnhAlertasVerificados = false;

// [NOVO] Variável para armazenar dados da licença (Validade/Créditos)
window.DADOS_LICENCA = null;

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
    
    // 3. Atualiza Firebase (Se logado)
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
// 6. CÁLCULOS FINANCEIROS, ALERTAS CNH E ATUALIZAÇÃO DO DASHBOARD (HOME)
// -----------------------------------------------------------------------------

// Função de Verificação de CNH (NOVA IMPLEMENTAÇÃO)
function verificarAlertasCNH() {
    if (window._cnhAlertasVerificados) return; // Evita spam de alertas na mesma sessão
    if (!window.USUARIO_ATUAL) return;

    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    CACHE_FUNCIONARIOS.forEach(function(func) {
        if (func.funcao === 'motorista' && func.validadeCNH) {
            // Verifica se o usuário atual é o Admin ou o próprio motorista
            var ehAdmin = window.USUARIO_ATUAL.role === 'admin';
            var ehOProprio = window.USUARIO_ATUAL.email === func.email;

            if (ehAdmin || ehOProprio) {
                var dataValidade = new Date(func.validadeCNH + 'T00:00:00'); // Garante fuso
                var diffTime = dataValidade - hoje;
                var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (diffDays === 30) {
                    alert("⚠️ ATENÇÃO CNH ⚠️\n\nA habilitação de " + func.nome + " vence em exatos 30 DIAS (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nProvidencie a renovação.");
                } else if (diffDays === 1) {
                    alert("🚨 URGENTE CNH 🚨\n\nA habilitação de " + func.nome + " vence AMANHÃ (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nSolicite a alteração da data de vencimento do novo documento imediatamente.");
                } else if (diffDays <= 0) {
                     // Opcional: Alerta de vencido
                     // console.log("CNH Vencida: " + func.nome);
                }
            }
        }
    });

    window._cnhAlertasVerificados = true;
}

window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    // Chama verificação de CNH ao carregar dashboard
    verificarAlertasCNH();

    // [NOVO] EXIBIÇÃO DA VALIDADE DA LICENÇA NO CABEÇALHO DO DASHBOARD
    var headerDash = document.querySelector('#home h2');
    if (headerDash && window.DADOS_LICENCA) {
        var spanLicenca = document.getElementById('badgeLicencaInfo');
        if (!spanLicenca) {
            spanLicenca = document.createElement('span');
            spanLicenca.id = 'badgeLicencaInfo';
            spanLicenca.style.fontSize = '0.7rem';
            spanLicenca.style.marginLeft = '15px';
            spanLicenca.style.padding = '4px 8px';
            spanLicenca.style.borderRadius = '12px';
            spanLicenca.style.verticalAlign = 'middle';
            spanLicenca.style.fontWeight = 'bold';
            headerDash.appendChild(spanLicenca);
        }

        if (window.DADOS_LICENCA.vitalicio) {
            spanLicenca.textContent = "LICENÇA VITALÍCIA";
            spanLicenca.style.backgroundColor = "#f3e5f5"; // Roxo claro
            spanLicenca.style.color = "#7b1fa2";
            spanLicenca.style.border = "1px solid #e1bee7";
        } else if (window.DADOS_LICENCA.validade) {
            var dtVal = new Date(window.DADOS_LICENCA.validade);
            var hojeC = new Date();
            var diasRest = Math.ceil((dtVal - hojeC) / (1000 * 60 * 60 * 24));
            
            spanLicenca.textContent = "CRÉDITO: " + diasRest + " DIAS (" + formatarDataParaBrasileiro(window.DADOS_LICENCA.validade.split('T')[0]) + ")";
            
            if (diasRest <= 5) {
                spanLicenca.style.backgroundColor = "#ffebee"; // Vermelho alerta
                spanLicenca.style.color = "#c62828";
                spanLicenca.style.border = "1px solid #ffcdd2";
            } else {
                spanLicenca.style.backgroundColor = "#e8f5e9"; // Verde
                spanLicenca.style.color = "#2e7d32";
                spanLicenca.style.border = "1px solid #c8e6c9";
            }
        }
    }

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
// 7. GRÁFICOS (CHART.JS) COM PAINEL DE DADOS DO VEÍCULO E DESTAQUES FINANCEIROS
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    // Verifica filtro de veículo selecionado
    var elSelect = document.getElementById('filtroVeiculoGrafico');
    var filtroVeiculo = elSelect ? elSelect.value : "";

    // === INJEÇÃO DE RESUMO E DESTAQUES FINANCEIROS ===
    // Remove resumo anterior se existir
    var existingSummary = document.getElementById('chartVehicleSummary');
    if (existingSummary) existingSummary.remove();

    // Variáveis para cálculo do gráfico e resumo
    var kmMes = 0;
    var custoTotalCalculado = 0; // Custo filtrado para o resumo
    var litrosTotal = 0;
    
    // Variáveis para o Gráfico (Barras)
    var receitaGrafico = 0;
    var combustivelGrafico = 0;
    var pessoalGrafico = 0; 
    var manutencaoGeralGrafico = 0; 

    // Itera Operações para compilar dados
    CACHE_OPERACOES.forEach(op => {
        // Aplica filtro de veículo se houver
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (op.status === 'CANCELADA') return;

        var d = new Date(op.data + 'T12:00:00');
        // Filtra pelo Mês/Ano selecionado no calendário
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            // Dados para Resumo de Frota
            kmMes += (Number(op.kmRodado) || 0);
            var preco = Number(op.precoLitro) || 0;
            var valorAbast = Number(op.combustivel) || 0;
            if (preco > 0 && valorAbast > 0) litrosTotal += (valorAbast / preco);

            // Dados Financeiros (Somente confirmadas/finalizadas para o gráfico)
            if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
                receitaGrafico += Number(op.faturamento || 0);
                combustivelGrafico += Number(op.combustivel || 0);
                
                // Custo Pessoal
                if (!op.checkins || !op.checkins.faltaMotorista) {
                    pessoalGrafico += Number(op.comissao || 0);
                }
                if (op.ajudantes) {
                    op.ajudantes.forEach(aj => {
                        var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                        if (!faltou) pessoalGrafico += (Number(aj.diaria)||0);
                    });
                }

                // Custo Manutenção/Despesas na Operação
                manutencaoGeralGrafico += Number(op.despesas || 0);
            }
        }
    });

    // Adiciona Despesas Gerais (Avulsas)
    CACHE_DESPESAS.forEach(d => {
        if (filtroVeiculo && d.veiculoPlaca !== filtroVeiculo) return;

        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            manutencaoGeralGrafico += Number(d.valor || 0);
        }
    });

    var lucroGrafico = receitaGrafico - (combustivelGrafico + pessoalGrafico + manutencaoGeralGrafico);
    custoTotalCalculado = combustivelGrafico + pessoalGrafico + manutencaoGeralGrafico;

    // Calcula Média KM/L
    var media = (litrosTotal > 0) ? (kmMes / litrosTotal) : 0;

    // Cria o HTML do Card de Resumo (Com Destaque Financeiro solicitado)
    var summaryDiv = document.createElement('div');
    summaryDiv.id = 'chartVehicleSummary';
    summaryDiv.style.marginBottom = '15px';
    summaryDiv.style.padding = '15px';
    summaryDiv.style.background = '#e3f2fd'; // Azul claro padrão
    summaryDiv.style.border = '1px solid #90caf9';
    summaryDiv.style.borderRadius = '8px';
    summaryDiv.style.display = 'grid';
    summaryDiv.style.gridTemplateColumns = 'repeat(5, 1fr)'; // 5 Colunas
    summaryDiv.style.gap = '10px';
    summaryDiv.style.fontSize = '0.9rem';
    summaryDiv.style.alignItems = 'center';

    // Conteúdo com Destaques Financeiros
    summaryDiv.innerHTML = `
        <div style="text-align:center;">
            <small style="color:#555;">FILTRO</small><br>
            <strong>${filtroVeiculo ? filtroVeiculo : 'GERAL'}</strong>
        </div>
        <div style="text-align:center;">
            <small style="color:#555;">KM (MÊS)</small><br>
            <strong>${kmMes.toFixed(1)} km</strong>
        </div>
        <div style="text-align:center;">
            <small style="color:#555;">MÉDIA</small><br>
            <strong>${media > 0 ? media.toFixed(2) + ' Km/L' : 'N/A'}</strong>
        </div>
        <div style="text-align:center; background:#fff; padding:5px; border-radius:6px; border:1px solid #c8e6c9;">
            <small style="color:#2e7d32; font-weight:bold;">FATURAMENTO</small><br>
            <strong style="color:#1b5e20; font-size:1rem;">${formatarValorMoeda(receitaGrafico)}</strong>
        </div>
        <div style="text-align:center; background:${lucroGrafico >= 0 ? '#fff' : '#ffebee'}; padding:5px; border-radius:6px; border:1px solid ${lucroGrafico >= 0 ? '#c8e6c9' : '#ffcdd2'};">
            <small style="color:${lucroGrafico >= 0 ? '#2e7d32' : '#c62828'}; font-weight:bold;">LUCRO LÍQUIDO</small><br>
            <strong style="color:${lucroGrafico >= 0 ? '#1b5e20' : '#b71c1c'}; font-size:1rem;">${formatarValorMoeda(lucroGrafico)}</strong>
        </div>
    `;

    // Insere antes do canvas
    ctx.parentNode.insertBefore(summaryDiv, ctx);
    // === FIM INJEÇÃO ===

    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'CUSTO COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO/GERAL', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: filtroVeiculo ? 'Dados: ' + filtroVeiculo : 'Resultados Gerais',
                data: [receitaGrafico, combustivelGrafico, pessoalGrafico, manutencaoGeralGrafico, lucroGrafico],
                backgroundColor: [
                    'rgba(46, 125, 50, 0.7)',   // Verde (Fat)
                    'rgba(198, 40, 40, 0.7)',   // Vermelho (Comb)
                    'rgba(255, 152, 0, 0.7)',   // Laranja (Pessoal)
                    'rgba(156, 39, 176, 0.7)',  // Roxo (Geral)
                    (lucroGrafico >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)') // Lucro
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
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E DESPESAS GERAIS
// =============================================================================

// -----------------------------------------------------------------------------
// 9. GESTÃO DE FUNCIONÁRIOS (MOTORISTAS / AJUDANTES / ADMIN)
// -----------------------------------------------------------------------------

window.toggleDriverFields = function() {
    var role = document.getElementById('funcFuncao').value;
    var divDriver = document.getElementById('driverSpecificFields');
    if (divDriver) {
        divDriver.style.display = (role === 'motorista') ? 'block' : 'none';
    }
};

document.getElementById('formFuncionario').addEventListener('submit', function(e) {
    e.preventDefault();
    
    var id = document.getElementById('funcionarioId').value;
    var nome = document.getElementById('funcNome').value.trim().toUpperCase();
    var funcao = document.getElementById('funcFuncao').value;
    var email = document.getElementById('funcEmail').value.trim().toLowerCase();
    var telefone = document.getElementById('funcTelefone').value;
    var documento = document.getElementById('funcDocumento').value;
    var senha = document.getElementById('funcSenha').value; // Apenas para criar/alterar
    var pix = document.getElementById('funcPix').value;
    var endereco = document.getElementById('funcEndereco').value;

    // Campos Específicos de Motorista
    var cnh = document.getElementById('funcCNH').value;
    var validadeCNH = document.getElementById('funcValidadeCNH').value;
    var categoriaCNH = document.getElementById('funcCategoriaCNH').value;
    var cursos = document.getElementById('funcCursoDescricao').value;

    if (!nome || !email) {
        alert("Preencha os campos obrigatórios.");
        return;
    }

    // Se estiver criando um novo, precisa de senha. Se editando, senha é opcional.
    if (!id && !senha) {
        alert("Para novos usuários, a senha é obrigatória.");
        return;
    }

    var novoFunc = {
        id: id || Date.now().toString(),
        nome: nome,
        funcao: funcao,
        email: email,
        telefone: telefone,
        documento: documento,
        pix: pix,
        endereco: endereco,
        // Dados CNH (salva mesmo que vazio se não for motorista, para manter estrutura)
        cnh: cnh,
        validadeCNH: validadeCNH,
        categoriaCNH: categoriaCNH,
        cursos: cursos,
        dataCadastro: new Date().toISOString()
    };

    if (id) {
        // EDIÇÃO
        var index = CACHE_FUNCIONARIOS.findIndex(f => f.id === id);
        if (index >= 0) {
            // Preserva a data original
            novoFunc.dataCadastro = CACHE_FUNCIONARIOS[index].dataCadastro;
            CACHE_FUNCIONARIOS[index] = novoFunc;
            
            // Nota: Atualização de senha/email no Auth não é feita aqui diretamente por segurança,
            // apenas atualizamos os dados cadastrais no banco.
        }
    } else {
        // CRIAÇÃO (Novo Usuário)
        // Nota: Em um sistema real, criaríamos no Auth aqui. 
        // Para simplificar e manter o padrão do arquivo original, salvamos os metadados.
        // O ideal é instruir o usuário a se cadastrar na tela de login ou usar uma Cloud Function.
        // Mas vamos simular a adição na lista local/banco.
        
        var existe = CACHE_FUNCIONARIOS.find(f => f.email === email);
        if (existe) {
            alert("Já existe um funcionário com este e-mail.");
            return;
        }
        
        // Tenta criar usuário secundário (hack de client-side) se a função estiver disponível
        if (window.dbRef && window.dbRef.criarAuthUsuario && senha) {
            // Criação assíncrona em background
            window.dbRef.criarAuthUsuario(email, senha)
                .then(uid => {
                    console.log("Usuário Auth criado: " + uid);
                    // Cria também na coleção 'users' raiz para permitir login
                    const { db, setDoc, doc } = window.dbRef;
                    setDoc(doc(db, "users", uid), {
                        uid: uid,
                        name: nome,
                        email: email,
                        role: funcao,
                        company: window.USUARIO_ATUAL.company,
                        approved: true,
                        createdAt: new Date().toISOString()
                    });
                })
                .catch(err => console.error("Erro ao criar Auth:", err));
        }

        CACHE_FUNCIONARIOS.push(novoFunc);
    }

    salvarListaFuncionarios(CACHE_FUNCIONARIOS).then(() => {
        alert("Funcionário salvo com sucesso!");
        document.getElementById('formFuncionario').reset();
        document.getElementById('funcionarioId').value = '';
        renderizarTabelaFuncionarios();
    });
});

window.renderizarTabelaFuncionarios = function() {
    var tbody = document.querySelector('#tabelaFuncionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    CACHE_FUNCIONARIOS.forEach(function(f) {
        var tr = document.createElement('tr');
        
        var labelFuncao = f.funcao.toUpperCase();
        if(f.funcao === 'motorista' && f.validadeCNH) {
             // Verifica validade visualmente
             var hoje = new Date(); 
             var val = new Date(f.validadeCNH);
             if (val < hoje) labelFuncao += ' <span style="color:red; font-size:0.7em;">(CNH VENCIDA)</span>';
        }

        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${labelFuncao}</td>
            <td>${f.email}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="editarFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-mini btn-danger" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Atualiza selects dependentes
    atualizarSelectsFuncionarios();
};

window.editarFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    document.getElementById('funcionarioId').value = f.id;
    document.getElementById('funcNome').value = f.nome;
    document.getElementById('funcFuncao').value = f.funcao;
    document.getElementById('funcEmail').value = f.email;
    document.getElementById('funcTelefone').value = f.telefone || '';
    document.getElementById('funcDocumento').value = f.documento || '';
    document.getElementById('funcPix').value = f.pix || '';
    document.getElementById('funcEndereco').value = f.endereco || '';
    
    // Campos Motorista
    document.getElementById('funcCNH').value = f.cnh || '';
    document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
    document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
    document.getElementById('funcCursoDescricao').value = f.cursos || '';

    // Ajusta visualização
    toggleDriverFields();
    
    // Rola para o topo do formulário
    document.querySelector('.cadastro-tabs').scrollIntoView({ behavior: 'smooth' });
};

window.excluirFuncionario = function(id) {
    if (confirm("Tem certeza que deseja excluir este funcionário? Isso não apaga o histórico de viagens dele.")) {
        CACHE_FUNCIONARIOS = CACHE_FUNCIONARIOS.filter(f => f.id !== id);
        salvarListaFuncionarios(CACHE_FUNCIONARIOS).then(() => {
            renderizarTabelaFuncionarios();
        });
    }
};

function atualizarSelectsFuncionarios() {
    // Atualiza dropdowns em Operações, Relatórios, etc.
    var selects = [
        'selectMotoristaOperacao', 
        'selectAjudantesOperacao', 
        'selectMotoristaRecibo', 
        'selectMotoristaRelatorio'
    ];
    
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if (!sel) return;
        
        // Guarda valor selecionado
        var valorAtual = sel.value;
        
        sel.innerHTML = '<option value="">Selecione...</option>';
        
        CACHE_FUNCIONARIOS.forEach(f => {
            // Filtra conforme o contexto do select
            if (id === 'selectMotoristaOperacao' && f.funcao !== 'motorista') return;
            if (id === 'selectAjudantesOperacao' && f.funcao !== 'ajudante') return;
            
            var opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.nome;
            sel.appendChild(opt);
        });
        
        // Restaura valor se ainda existir
        sel.value = valorAtual;
    });
}

// -----------------------------------------------------------------------------
// 10. GESTÃO DE VEÍCULOS
// -----------------------------------------------------------------------------

document.getElementById('formVeiculo').addEventListener('submit', function(e) {
    e.preventDefault();
    var placa = document.getElementById('veiculoPlaca').value.trim().toUpperCase();
    var modelo = document.getElementById('veiculoModelo').value.trim().toUpperCase();
    var ano = document.getElementById('veiculoAno').value;
    var renavam = document.getElementById('veiculoRenavam').value;
    var chassi = document.getElementById('veiculoChassi').value;

    if (!placa || !modelo) return;

    var existenteIndex = CACHE_VEICULOS.findIndex(v => v.placa === placa);
    
    var veiculoObj = {
        placa: placa,
        modelo: modelo,
        ano: ano,
        renavam: renavam,
        chassi: chassi
    };

    if (existenteIndex >= 0) {
        if (!confirm("Veículo com esta placa já existe. Deseja atualizar os dados?")) return;
        CACHE_VEICULOS[existenteIndex] = veiculoObj;
    } else {
        CACHE_VEICULOS.push(veiculoObj);
    }

    salvarListaVeiculos(CACHE_VEICULOS).then(() => {
        alert("Veículo salvo.");
        document.getElementById('formVeiculo').reset();
        renderizarTabelaVeiculos();
    });
});

window.renderizarTabelaVeiculos = function() {
    var tbody = document.querySelector('#tabelaVeiculos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    CACHE_VEICULOS.forEach(function(v) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${v.placa}</td>
            <td>${v.modelo}</td>
            <td>${v.ano || '-'}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="editarVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button>
                <button class="btn-mini btn-danger" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza selects
    var selects = ['selectVeiculoOperacao', 'selectVeiculoDespesaGeral', 'selectVeiculoRelatorio'];
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if(!sel) return;
        var val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        CACHE_VEICULOS.forEach(v => {
            var opt = document.createElement('option');
            opt.value = v.placa;
            opt.textContent = v.placa + ' - ' + v.modelo;
            sel.appendChild(opt);
        });
        sel.value = val;
    });
};

window.editarVeiculo = function(placa) {
    var v = buscarVeiculoPorPlaca(placa);
    if (!v) return;
    document.getElementById('veiculoPlaca').value = v.placa;
    document.getElementById('veiculoModelo').value = v.modelo;
    document.getElementById('veiculoAno').value = v.ano || '';
    document.getElementById('veiculoRenavam').value = v.renavam || '';
    document.getElementById('veiculoChassi').value = v.chassi || '';
    document.getElementById('veiculoPlaca').readOnly = true; // Não permite mudar chave primária na edição
};

window.excluirVeiculo = function(placa) {
    if (confirm("Excluir veículo " + placa + "?")) {
        CACHE_VEICULOS = CACHE_VEICULOS.filter(v => v.placa !== placa);
        salvarListaVeiculos(CACHE_VEICULOS).then(() => renderizarTabelaVeiculos());
    }
};

// -----------------------------------------------------------------------------
// 11. GESTÃO DE CLIENTES (CONTRATANTES)
// -----------------------------------------------------------------------------

document.getElementById('formContratante').addEventListener('submit', function(e) {
    e.preventDefault();
    var razao = document.getElementById('contratanteRazaoSocial').value.trim().toUpperCase();
    var cnpj = document.getElementById('contratanteCNPJ').value.trim().replace(/\D/g,''); // Apenas números
    var telefone = document.getElementById('contratanteTelefone').value;

    if (!razao || !cnpj) return;

    var index = CACHE_CONTRATANTES.findIndex(c => c.cnpj === cnpj);
    var cliente = { razaoSocial: razao, cnpj: cnpj, telefone: telefone };

    if (index >= 0) {
        if (!confirm("CNPJ já cadastrado. Atualizar dados?")) return;
        CACHE_CONTRATANTES[index] = cliente;
    } else {
        CACHE_CONTRATANTES.push(cliente);
    }

    salvarListaContratantes(CACHE_CONTRATANTES).then(() => {
        alert("Cliente salvo.");
        document.getElementById('formContratante').reset();
        renderizarTabelaContratantes();
    });
});

window.renderizarTabelaContratantes = function() {
    var tbody = document.querySelector('#tabelaContratantes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_CONTRATANTES.forEach(function(c) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.razaoSocial}</td>
            <td>${c.cnpj}</td>
            <td>${formatarTelefoneBrasil(c.telefone)}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="editarContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button>
                <button class="btn-mini btn-danger" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Selects
    var selects = ['selectContratanteOperacao', 'selectContratanteRelatorio'];
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if(!sel) return;
        var val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        CACHE_CONTRATANTES.forEach(c => {
            var opt = document.createElement('option');
            opt.value = c.cnpj; // Chave
            opt.textContent = c.razaoSocial;
            sel.appendChild(opt);
        });
        sel.value = val;
    });
};

window.editarContratante = function(cnpj) {
    var c = buscarContratantePorCnpj(cnpj);
    if (!c) return;
    document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
    document.getElementById('contratanteCNPJ').value = c.cnpj;
    document.getElementById('contratanteTelefone').value = c.telefone || '';
    document.getElementById('contratanteCNPJ').readOnly = true;
};

window.excluirContratante = function(cnpj) {
    if (confirm("Excluir cliente?")) {
        CACHE_CONTRATANTES = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj);
        salvarListaContratantes(CACHE_CONTRATANTES).then(() => renderizarTabelaContratantes());
    }
};

// -----------------------------------------------------------------------------
// 12. GESTÃO DE ATIVIDADES (SERVIÇOS)
// -----------------------------------------------------------------------------

document.getElementById('formAtividade').addEventListener('submit', function(e) {
    e.preventDefault();
    var id = document.getElementById('atividadeId').value;
    var nome = document.getElementById('atividadeNome').value.trim().toUpperCase();
    
    if(!nome) return;

    if(id) {
        var idx = CACHE_ATIVIDADES.findIndex(a => a.id === id);
        if(idx >= 0) CACHE_ATIVIDADES[idx].nome = nome;
    } else {
        CACHE_ATIVIDADES.push({ id: Date.now().toString(), nome: nome });
    }

    salvarListaAtividades(CACHE_ATIVIDADES).then(() => {
        document.getElementById('formAtividade').reset();
        document.getElementById('atividadeId').value = '';
        renderizarTabelaAtividades();
    });
});

window.renderizarTabelaAtividades = function() {
    var tbody = document.querySelector('#tabelaAtividades tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_ATIVIDADES.forEach(function(a) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${a.id}</td>
            <td>${a.nome}</td>
            <td><button class="btn-mini btn-danger" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    var selects = ['selectAtividadeOperacao', 'selectAtividadeRelatorio'];
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if(!sel) return;
        var val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        CACHE_ATIVIDADES.forEach(a => {
            var opt = document.createElement('option');
            opt.value = a.nome;
            opt.textContent = a.nome;
            sel.appendChild(opt);
        });
        sel.value = val;
    });
};

window.excluirAtividade = function(id) {
    if(confirm("Excluir este tipo de serviço?")) {
        CACHE_ATIVIDADES = CACHE_ATIVIDADES.filter(a => a.id !== id);
        salvarListaAtividades(CACHE_ATIVIDADES).then(() => renderizarTabelaAtividades());
    }
};

// -----------------------------------------------------------------------------
// 13. GESTÃO DE DESPESAS GERAIS (AVULSAS)
// -----------------------------------------------------------------------------

window.toggleDespesaParcelas = function() {
    var modo = document.getElementById('despesaModoPagamento').value;
    var div = document.getElementById('divDespesaParcelas');
    if(div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
};

document.getElementById('formDespesaGeral').addEventListener('submit', function(e) {
    e.preventDefault();
    var data = document.getElementById('despesaGeralData').value;
    var veiculo = document.getElementById('selectVeiculoDespesaGeral').value;
    var desc = document.getElementById('despesaGeralDescricao').value.trim().toUpperCase();
    var valor = parseFloat(document.getElementById('despesaGeralValor').value);
    
    var formaPag = document.getElementById('despesaFormaPagamento').value;
    var modoPag = document.getElementById('despesaModoPagamento').value;
    var qtdParcelas = parseInt(document.getElementById('despesaParcelas').value) || 1;
    var parcelasPagas = parseInt(document.getElementById('despesaParcelasPagas').value) || 0;

    if (!data || !desc || isNaN(valor)) return;

    var novaDespesa = {
        id: Date.now().toString(),
        data: data,
        veiculoPlaca: veiculo,
        descricao: desc,
        valor: valor,
        formaPagamento: formaPag,
        modoPagamento: modoPag,
        parcelas: qtdParcelas,
        parcelasPagas: parcelasPagas
    };

    CACHE_DESPESAS.push(novaDespesa);
    salvarListaDespesas(CACHE_DESPESAS).then(() => {
        alert("Despesa lançada.");
        document.getElementById('formDespesaGeral').reset();
        renderizarTabelaDespesasGerais();
        atualizarDashboard(); // Recalcula custos
    });
});

window.renderizarTabelaDespesasGerais = function() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordena por data (mais recente primeiro)
    var listaOrdenada = [].concat(CACHE_DESPESAS).sort((a,b) => new Date(b.data) - new Date(a.data));

    listaOrdenada.forEach(function(d) {
        var tr = document.createElement('tr');
        var infoPag = d.formaPagamento.toUpperCase();
        if (d.modoPagamento === 'parcelado') {
            infoPag += ` (${d.parcelasPagas}/${d.parcelas})`;
        }

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td style="color:red; font-weight:bold;">- ${formatarValorMoeda(d.valor)}</td>
            <td>${infoPag}</td>
            <td><button class="btn-mini btn-danger" onclick="excluirDespesaGeral('${d.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
};

window.excluirDespesaGeral = function(id) {
    if (confirm("Remover este lançamento de despesa?")) {
        CACHE_DESPESAS = CACHE_DESPESAS.filter(d => d.id !== id);
        salvarListaDespesas(CACHE_DESPESAS).then(() => {
            renderizarTabelaDespesasGerais();
            atualizarDashboard();
        });
    }
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 4: OPERAÇÕES (VIAGENS), MONITORAMENTO E RELATÓRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// 14. GESTÃO DE OPERAÇÕES (CRUD COMPLETO COM AJUDANTES)
// -----------------------------------------------------------------------------

// Função Auxiliar: Adicionar/Remover Ajudante na Lista Temporária da Operação
window.adicionarAjudanteNaLista = function(idAjudante) {
    if (!idAjudante) return;
    
    // Verifica se já está na lista
    var jaExiste = window._operacaoAjudantesTempList.find(a => a.id === idAjudante);
    if (jaExiste) {
        alert("Ajudante já adicionado a esta viagem.");
        return;
    }

    var func = buscarFuncionarioPorId(idAjudante);
    if (!func) return;

    // Adiciona com valor padrão de diária (pode ser editado no futuro se necessário)
    // Aqui assumimos um valor padrão de R$ 80,00 ou zero, editável no cadastro se houvesse campo
    // Para simplificar, vamos usar um prompt ou valor fixo, ou buscar do cadastro se tivesse.
    // Vamos usar R$ 0,00 e deixar o admin editar no "Recibo" ou assumir fixo.
    // No sistema original, parecia ser um valor fixo ou calculado depois. 
    // Vamos definir uma diária base de 80.00 para fins de cálculo.
    
    var valorDiaria = 80.00; // Valor base

    window._operacaoAjudantesTempList.push({
        id: idAjudante,
        nome: func.nome,
        diaria: valorDiaria
    });

    renderizarListaAjudantesTemp();
};

document.getElementById('btnManualAddAjudante').addEventListener('click', function() {
    var select = document.getElementById('selectAjudantesOperacao');
    var id = select.value;
    if(id) {
        adicionarAjudanteNaLista(id);
        select.value = ""; // Limpa seleção
    }
});

window.removerAjudanteDaLista = function(idAjudante) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => a.id !== idAjudante);
    renderizarListaAjudantesTemp();
};

function renderizarListaAjudantesTemp() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    ul.innerHTML = '';

    window._operacaoAjudantesTempList.forEach(aj => {
        var li = document.createElement('li');
        li.style.background = '#e0f2f1';
        li.style.padding = '5px 10px';
        li.style.borderRadius = '4px';
        li.style.fontSize = '0.85rem';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        
        li.innerHTML = `
            <span><i class="fas fa-user-hard-hat"></i> ${aj.nome.split(' ')[0]}</span>
            <button type="button" onclick="removerAjudanteDaLista('${aj.id}')" style="background:transparent; border:none; color:red; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        ul.appendChild(li);
    });
}

document.getElementById('formOperacao').addEventListener('submit', function(e) {
    e.preventDefault();
    
    var id = document.getElementById('operacaoId').value;
    var data = document.getElementById('operacaoData').value;
    var motoristaId = document.getElementById('selectMotoristaOperacao').value;
    var veiculoPlaca = document.getElementById('selectVeiculoOperacao').value;
    var contratanteCNPJ = document.getElementById('selectContratanteOperacao').value;
    var atividadeNome = document.getElementById('selectAtividadeOperacao').value;
    var faturamento = parseFloat(document.getElementById('operacaoFaturamento').value);
    
    // Opcionais
    var adiantamento = parseFloat(document.getElementById('operacaoAdiantamento').value) || 0;
    var comissao = parseFloat(document.getElementById('operacaoComissao').value) || 0;
    
    // Status
    var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
    
    // Preserva dados ocultos se existirem (edição)
    var kmRodado = parseFloat(document.getElementById('operacaoKmRodado').value) || 0;
    var combustivel = parseFloat(document.getElementById('operacaoCombustivel').value) || 0;
    var precoLitro = parseFloat(document.getElementById('operacaoPrecoLitro').value) || 0;
    var despesas = parseFloat(document.getElementById('operacaoDespesas').value) || 0;

    if (!data || !motoristaId || !veiculoPlaca || isNaN(faturamento)) {
        alert("Preencha os campos obrigatórios.");
        return;
    }

    // Define Status Inicial
    var statusInicial = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
    
    // Se for edição, mantém o status atual a menos que seja explicitamente mudado
    var checkinsExistentes = null;
    
    if (id) {
        var opAntiga = CACHE_OPERACOES.find(o => o.id == id); // Loose equality para string/number
        if (opAntiga) {
            statusInicial = opAntiga.status; // Mantém status (ex: EM_ANDAMENTO)
            checkinsExistentes = opAntiga.checkins;
        }
    }

    var novaOp = {
        id: id || Date.now().toString(),
        data: data,
        motoristaId: motoristaId,
        veiculoPlaca: veiculoPlaca,
        contratanteCNPJ: contratanteCNPJ,
        atividade: atividadeNome,
        faturamento: faturamento,
        adiantamento: adiantamento,
        comissao: comissao,
        ajudantes: window._operacaoAjudantesTempList, // Salva a lista de ajudantes
        status: statusInicial,
        
        // Dados de Fechamento (iniciam zerados ou preservados)
        kmRodado: kmRodado,
        combustivel: combustivel,
        precoLitro: precoLitro,
        despesas: despesas,
        
        // Checkins (preserva se existir)
        checkins: checkinsExistentes || {} 
    };

    if (id) {
        var idx = CACHE_OPERACOES.findIndex(o => o.id == id);
        if (idx >= 0) CACHE_OPERACOES[idx] = novaOp;
    } else {
        CACHE_OPERACOES.push(novaOp);
    }

    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        alert("Viagem salva com sucesso!");
        document.getElementById('formOperacao').reset();
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = []; // Limpa temp
        renderizarListaAjudantesTemp();
        renderizarTabelaOperacoes();
        renderizarCalendario(); // Atualiza calendário
        atualizarDashboard(); // Atualiza financeiros
    });
});

window.renderizarTabelaOperacoes = function() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordena: Mais recentes primeiro
    var lista = [].concat(CACHE_OPERACOES).sort((a,b) => new Date(b.data) - new Date(a.data));
    // Limita a 50 itens para não pesar
    lista = lista.slice(0, 50);

    lista.forEach(function(op) {
        var tr = document.createElement('tr');
        
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome.split(' ')[0] : '---';
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cli ? cli.razaoSocial.substring(0, 15) + '...' : '---';

        var statusClass = '';
        var statusLabel = op.status;
        
        if (op.status === 'CONFIRMADA') statusClass = 'pill-active';
        else if (op.status === 'AGENDADA') statusClass = 'pill-pending';
        else if (op.status === 'CANCELADA') { statusClass = 'pill-blocked'; }
        else if (op.status === 'FINALIZADA') { statusClass = 'pill-active'; statusLabel = 'FINALIZADA'; }
        else if (op.status === 'EM_ANDAMENTO') { statusClass = 'pill-pending'; statusLabel = 'EM ROTA'; }
        
        var badge = `<span class="status-pill ${statusClass}">${statusLabel}</span>`;

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>
                <strong>${op.veiculoPlaca}</strong><br>
                <small>${nomeMot}</small>
            </td>
            <td>${badge}<br><small>${nomeCli}</small></td>
            <td>${formatarValorMoeda(op.faturamento)}</td>
            <td>
                <button class="btn-mini btn-primary" onclick="editarOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-mini btn-warning" onclick="duplicarOperacao('${op.id}')" title="Duplicar"><i class="fas fa-copy"></i></button>
                ${op.status !== 'CANCELADA' ? `<button class="btn-mini btn-danger" onclick="cancelarOperacao('${op.id}')" title="Cancelar"><i class="fas fa-ban"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.editarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => o.id == id);
    if (!op) return;

    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividade;
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    
    // Checkbox Agendamento
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // Campos ocultos
    document.getElementById('operacaoKmRodado').value = op.kmRodado || 0;
    document.getElementById('operacaoCombustivel').value = op.combustivel || 0;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || 0;
    document.getElementById('operacaoDespesas').value = op.despesas || 0;

    // Ajudantes
    window._operacaoAjudantesTempList = op.ajudantes ? JSON.parse(JSON.stringify(op.ajudantes)) : [];
    renderizarListaAjudantesTemp();

    // Rola para o topo
    var section = document.getElementById('operacoes');
    if(section) section.scrollIntoView({ behavior: 'smooth' });
};

window.cancelarOperacao = function(id) {
    if (confirm("Deseja realmente CANCELAR esta viagem? Ela não aparecerá mais nos cálculos financeiros.")) {
        var idx = CACHE_OPERACOES.findIndex(o => o.id == id);
        if (idx >= 0) {
            CACHE_OPERACOES[idx].status = 'CANCELADA';
            salvarListaOperacoes(CACHE_OPERACOES).then(() => {
                renderizarTabelaOperacoes();
                atualizarDashboard();
            });
        }
    }
};

window.duplicarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => o.id == id);
    if (!op) return;
    
    if(confirm("Duplicar esta viagem para uma nova data?")) {
        // Preenche o form como se fosse editar, mas limpa o ID
        editarOperacao(id);
        document.getElementById('operacaoId').value = ''; // Novo ID será gerado
        document.getElementById('operacaoData').focus(); // Foco na data para alterar
        alert("Dados carregados! Altere a DATA e clique em GRAVAR.");
    }
};

// -----------------------------------------------------------------------------
// 15. MONITORAMENTO E CHECK-INS (ROTAS E FALTAS)
// -----------------------------------------------------------------------------

window.renderizarTabelaCheckinsPendentes = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra viagens de HOJE ou em andamento
    var hojeStr = new Date().toISOString().split('T')[0];
    
    var listaMonitoramento = CACHE_OPERACOES.filter(op => {
        return (op.data === hojeStr || op.status === 'EM_ANDAMENTO') && op.status !== 'CANCELADA' && op.status !== 'FINALIZADA';
    });

    if (listaMonitoramento.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma viagem ativa ou agendada para hoje.</td></tr>';
        return;
    }

    listaMonitoramento.forEach(op => {
        var tr = document.createElement('tr');
        
        // Status Motorista
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var statusMot = '<span style="color:#999;"><i class="fas fa-clock"></i> Aguardando...</span>';
        
        if (op.checkins && op.checkins.motorista) {
            statusMot = `<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> ${op.checkins.motorista.hora}</span>`;
        } else if (op.checkins && op.checkins.faltaMotorista) {
            statusMot = `<span style="color:red; font-weight:bold;">FALTA REGISTRADA</span>`;
        }

        var htmlEquipe = `<div><strong>Mot:</strong> ${mot ? mot.nome.split(' ')[0] : '---'} - ${statusMot}</div>`;

        // Status Ajudantes
        if (op.ajudantes && op.ajudantes.length > 0) {
            htmlEquipe += `<div style="margin-top:5px; font-size:0.85rem; border-top:1px solid #eee; padding-top:2px;">`;
            op.ajudantes.forEach(aj => {
                var stAj = '<i class="fas fa-clock" style="color:#ccc;"></i>';
                if (op.checkins && op.checkins.ajudantes && op.checkins.ajudantes[aj.id]) {
                    stAj = `<i class="fas fa-check-circle" style="color:green;"></i>`;
                } else if (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]) {
                    stAj = `<i class="fas fa-times-circle" style="color:red;"></i>`;
                }
                htmlEquipe += `<span style="margin-right:8px;">${stAj} ${aj.nome.split(' ')[0]}</span>`;
            });
            htmlEquipe += `</div>`;
        }

        // Botões de Ação Rápida (Admin)
        var btnIniciar = '';
        if (op.status !== 'EM_ANDAMENTO') {
             btnIniciar = `<button class="btn-mini btn-success" onclick="forcarInicioViagem('${op.id}')">INICIAR ROTA</button>`;
        } else {
             btnIniciar = `<span class="status-pill pill-active">EM ROTA</span>`;
             btnIniciar += `<br><button class="btn-mini btn-secondary" onclick="finalizarViagemManual('${op.id}')" style="margin-top:5px;">FINALIZAR</button>`;
        }

        // Registrar Faltas (Admin)
        var btnFalta = `<button class="btn-mini btn-danger" onclick="abrirModalFalta('${op.id}')" title="Registrar Falta"><i class="fas fa-user-slash"></i></button>`;

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${op.veiculoPlaca}</td>
            <td>${htmlEquipe}</td>
            <td style="text-align:center;">${btnIniciar}</td>
            <td style="text-align:center;">${btnFalta}</td>
        `;
        tbody.appendChild(tr);
    });
};

window.forcarInicioViagem = function(id) {
    var idx = CACHE_OPERACOES.findIndex(o => o.id == id);
    if (idx >= 0) {
        CACHE_OPERACOES[idx].status = 'EM_ANDAMENTO';
        // Registra hora de inicio se não houver
        if(!CACHE_OPERACOES[idx].checkins) CACHE_OPERACOES[idx].checkins = {};
        if(!CACHE_OPERACOES[idx].checkins.inicioRota) CACHE_OPERACOES[idx].checkins.inicioRota = new Date().toISOString();
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            renderizarTabelaCheckinsPendentes();
            renderizarCalendario();
        });
    }
};

window.finalizarViagemManual = function(id) {
    var op = CACHE_OPERACOES.find(o => o.id == id);
    if(!op) return;
    
    // Pergunta dados de fechamento
    var km = prompt("KM Final (Total Rodado):", op.kmRodado || 0);
    if(km === null) return;
    var comb = prompt("Valor Total Abastecido (R$):", op.combustivel || 0);
    var desp = prompt("Outras Despesas (R$):", op.despesas || 0);

    op.status = 'FINALIZADA';
    op.kmRodado = parseFloat(km) || 0;
    op.combustivel = parseFloat(comb) || 0;
    op.despesas = parseFloat(desp) || 0;
    
    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        renderizarTabelaCheckinsPendentes();
        renderizarCalendario();
        atualizarDashboard();
    });
};

window.abrirModalFalta = function(opId) {
    var op = CACHE_OPERACOES.find(o => o.id == opId);
    if(!op) return;

    // Constrói lista de quem pode faltar (Motorista + Ajudantes)
    var opcoes = [];
    var mot = buscarFuncionarioPorId(op.motoristaId);
    if(mot) opcoes.push({ id: op.motoristaId, nome: mot.nome, tipo: 'motorista' });
    
    if(op.ajudantes) {
        op.ajudantes.forEach(aj => opcoes.push({ id: aj.id, nome: aj.nome, tipo: 'ajudante' }));
    }

    var texto = "Digite o ID do funcionário para registrar falta:\n";
    opcoes.forEach(opt => texto += `${opt.id} - ${opt.nome} (${opt.tipo})\n`);
    
    var idEscolhido = prompt(texto);
    if(!idEscolhido) return;

    var motivo = prompt("Motivo da falta:");
    
    // Registra a falta
    if(!op.checkins) op.checkins = {};
    
    if (idEscolhido == op.motoristaId) {
        op.checkins.faltaMotorista = true;
        op.checkins.motivoFaltaMotorista = motivo || 'Não informado';
    } else {
        if(!op.checkins.faltas) op.checkins.faltas = {};
        op.checkins.faltas[idEscolhido] = motivo || 'Não informado';
    }

    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        alert("Falta registrada.");
        renderizarTabelaCheckinsPendentes();
        // Renderizar tabela de faltas acumuladas (Historico) seria ideal aqui também
    });
};

window.sincronizarDadosDaNuvem = function(force) {
    if(force) {
        var btn = document.querySelector('button[onclick="sincronizarDadosDaNuvem(true)"]');
        if(btn) btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> SINCRONIZANDO...';
        
        // Simula delay de rede ou força reload real
        setTimeout(() => {
            if(window.carregarDadosIniciaisDoFirebase) {
                window.carregarDadosIniciaisDoFirebase().then(() => {
                   alert("Dados sincronizados com a nuvem!");
                   if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR AGORA';
                   window.location.reload();
                });
            } else {
                // Fallback se estiver apenas local
                window.location.reload();
            }
        }, 1500);
    }
};

// -----------------------------------------------------------------------------
// 16. RELATÓRIOS E PDF
// -----------------------------------------------------------------------------

window.gerarRelatorioGeral = function() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    var motId = document.getElementById('selectMotoristaRelatorio').value;
    var veicPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var cliCnpj = document.getElementById('selectContratanteRelatorio').value;
    var atvNome = document.getElementById('selectAtividadeRelatorio').value;

    var container = document.getElementById('reportContent');
    var resultsDiv = document.getElementById('reportResults');
    resultsDiv.style.display = 'block';
    
    var html = `<h2 style="text-align:center; color:#00796b;">RELATÓRIO GERAL DE RESULTADOS</h2>`;
    html += `<p style="text-align:center; font-size:0.9rem;">Período: ${inicio ? formatarDataParaBrasileiro(inicio) : 'INÍCIO'} até ${fim ? formatarDataParaBrasileiro(fim) : 'HOJE'}</p><hr>`;

    var totalFat = 0;
    var totalCustos = 0;
    var totalLucro = 0;
    var count = 0;

    html += `<table class="data-table" style="font-size:0.8rem;">
                <thead>
                    <tr>
                        <th>DATA</th>
                        <th>VEÍCULO</th>
                        <th>CLIENTE</th>
                        <th>FATURAMENTO</th>
                        <th>CUSTO OPER.</th>
                        <th>LUCRO</th>
                    </tr>
                </thead>
                <tbody>`;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        // Filtros
        if (inicio && op.data < inicio) return;
        if (fim && op.data > fim) return;
        if (motId && op.motoristaId != motId) return;
        if (veicPlaca && op.veiculoPlaca != veicPlaca) return;
        if (cliCnpj && op.contratanteCNPJ != cliCnpj) return;
        if (atvNome && op.atividade != atvNome) return;

        // Cálculos
        var receita = Number(op.faturamento)||0;
        var custos = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
        
        // Custo Pessoal
        if (!op.checkins || !op.checkins.faltaMotorista) custos += (Number(op.comissao)||0);
        if (op.ajudantes) {
             op.ajudantes.forEach(aj => {
                 var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                 if(!faltou) custos += (Number(aj.diaria)||0);
             });
        }
        
        var lucro = receita - custos;

        totalFat += receita;
        totalCustos += custos;
        totalLucro += lucro;
        count++;

        html += `<tr>
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${op.contratanteCNPJ}</td>
                    <td>${formatarValorMoeda(receita)}</td>
                    <td>${formatarValorMoeda(custos)}</td>
                    <td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td>
                 </tr>`;
    });

    html += `</tbody></table>`;
    
    html += `<div style="margin-top:20px; padding:15px; background:#eee; display:flex; justify-content:space-around; font-weight:bold;">
                <div>VIAGENS: ${count}</div>
                <div style="color:green;">FATURAMENTO: ${formatarValorMoeda(totalFat)}</div>
                <div style="color:red;">CUSTOS TOTAIS: ${formatarValorMoeda(totalCustos)}</div>
                <div style="color:${totalLucro>=0?'#00796b':'red'}; border:1px solid #999; padding:0 10px; background:#fff;">RESULTADO: ${formatarValorMoeda(totalLucro)}</div>
             </div>`;

    container.innerHTML = html;
};

window.gerarRelatorioCobranca = function() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    var cliCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!cliCnpj) { alert("Selecione um Cliente para gerar a fatura."); return; }
    
    var cliente = buscarContratantePorCnpj(cliCnpj);
    var nomeCli = cliente ? cliente.razaoSocial : 'CLIENTE';

    var container = document.getElementById('reportContent');
    var resultsDiv = document.getElementById('reportResults');
    resultsDiv.style.display = 'block';

    var html = `
        <div style="padding:20px; border:1px solid #000;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:10px;">
                <h1 style="margin:0;">FATURA DE SERVIÇOS</h1>
                <div style="text-align:right;">
                    <strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'MINHA LOGÍSTICA'}</strong><br>
                    CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '00.000.000/0000-00'}<br>
                    ${CACHE_MINHA_EMPRESA.telefone || ''}
                </div>
            </div>
            
            <div style="margin-top:20px;">
                <strong>TOMADOR DOS SERVIÇOS:</strong><br>
                ${nomeCli} (CNPJ: ${cliCnpj})
            </div>

            <p>Período de Referência: ${inicio ? formatarDataParaBrasileiro(inicio) : '---'} a ${fim ? formatarDataParaBrasileiro(fim) : '---'}</p>

            <table style="width:100%; border-collapse:collapse; margin-top:15px; font-size:0.9rem;">
                <thead>
                    <tr style="background:#eee; border:1px solid #000;">
                        <th style="border:1px solid #000; padding:5px;">DATA</th>
                        <th style="border:1px solid #000; padding:5px;">DESCRIÇÃO / VEÍCULO</th>
                        <th style="border:1px solid #000; padding:5px;">VALOR (R$)</th>
                    </tr>
                </thead>
                <tbody>`;

    var total = 0;
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (op.contratanteCNPJ !== cliCnpj) return;
        if (inicio && op.data < inicio) return;
        if (fim && op.data > fim) return;

        total += (Number(op.faturamento)||0);

        html += `<tr>
                    <td style="border:1px solid #000; padding:5px; text-align:center;">${formatarDataParaBrasileiro(op.data)}</td>
                    <td style="border:1px solid #000; padding:5px;">Serviço de Frete - Veículo ${op.veiculoPlaca}</td>
                    <td style="border:1px solid #000; padding:5px; text-align:right;">${formatarValorMoeda(op.faturamento)}</td>
                 </tr>`;
    });

    html += `   </tbody>
            </table>
            
            <div style="margin-top:20px; text-align:right; font-size:1.2rem; font-weight:bold;">
                TOTAL A PAGAR: ${formatarValorMoeda(total)}
            </div>
            
            <div style="margin-top:50px; text-align:center; font-size:0.8rem;">
                <hr style="width:50%;">
                Assinatura do Responsável
            </div>
        </div>
    `;

    container.innerHTML = html;
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    var opt = {
      margin:       0.5,
      filename:     'relatorio_logimaster.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: INICIALIZAÇÃO, PAINEL SUPER ADMIN E GESTÃO DE CRÉDITOS (SAAS)
// =============================================================================

// -----------------------------------------------------------------------------
// 17. INICIALIZAÇÃO DO SISTEMA POR PERFIL (RBAC)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    window.USUARIO_ATUAL = user;
    console.log("Inicializando sistema para: " + user.role);

    // Oculta todos os menus inicialmente
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';

    // 1. SUPER ADMIN (Global)
    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        simularCliqueMenu('super-admin');
        return;
    }

    // 2. BUSCAR DADOS DA EMPRESA (LICENÇA)
    // Armazena em variável global para uso no Dashboard (Parte 2)
    if (user.company) {
        try {
            const { db, doc, getDoc } = window.dbRef;
            const companyDoc = await getDoc(doc(db, "companies", user.company));
            if (companyDoc.exists()) {
                window.DADOS_LICENCA = companyDoc.data();
            }
        } catch (e) {
            console.error("Erro ao buscar licença", e);
        }
    }

    // 3. CARREGAR DADOS DO FIREBASE (Sincronização)
    // Carrega dados da sub-coleção 'data' da empresa específica
    await carregarDadosDoFirebase(user.company);

    // 4. PERFIL ADMINISTRADOR
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        simularCliqueMenu('home'); // Abre Dashboard
        
        // Verifica notificações de equipe
        verificarNotificacoesEquipe();
    } 
    // 5. PERFIL MOTORISTA / AJUDANTE
    else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true; // Bloqueia edições
        simularCliqueMenu('employee-home');
        carregarDadosFuncionarioLogado();
    }
};

// Função auxiliar para simular clique inicial
function simularCliqueMenu(dataPage) {
    const el = document.querySelector(`.nav-item[data-page="${dataPage}"]`);
    if(el) el.click();
}

// Carregamento de Dados Específicos da Empresa (Firestore)
async function carregarDadosDoFirebase(companyId) {
    if(!companyId) return;
    const { db, doc, getDoc } = window.dbRef;
    
    // Lista de chaves a carregar
    const keys = [
        {k: CHAVE_DB_FUNCIONARIOS, v: 'CACHE_FUNCIONARIOS', def: []},
        {k: CHAVE_DB_VEICULOS, v: 'CACHE_VEICULOS', def: []},
        {k: CHAVE_DB_CONTRATANTES, v: 'CACHE_CONTRATANTES', def: []},
        {k: CHAVE_DB_OPERACOES, v: 'CACHE_OPERACOES', def: []},
        {k: CHAVE_DB_MINHA_EMPRESA, v: 'CACHE_MINHA_EMPRESA', def: {}},
        {k: CHAVE_DB_DESPESAS, v: 'CACHE_DESPESAS', def: []},
        {k: CHAVE_DB_ATIVIDADES, v: 'CACHE_ATIVIDADES', def: []},
        {k: CHAVE_DB_PROFILE_REQUESTS, v: 'CACHE_PROFILE_REQUESTS', def: []},
        {k: CHAVE_DB_RECIBOS, v: 'CACHE_RECIBOS', def: []}
    ];

    console.log("Baixando dados da nuvem...");

    for (let item of keys) {
        try {
            const snap = await getDoc(doc(db, 'companies', companyId, 'data', item.k));
            if (snap.exists()) {
                const data = snap.data();
                // Atualiza Cache Global
                if (item.v === 'CACHE_MINHA_EMPRESA') window.CACHE_MINHA_EMPRESA = data.items || item.def;
                else if (item.v === 'CACHE_FUNCIONARIOS') window.CACHE_FUNCIONARIOS = data.items || item.def;
                else if (item.v === 'CACHE_VEICULOS') window.CACHE_VEICULOS = data.items || item.def;
                else if (item.v === 'CACHE_CONTRATANTES') window.CACHE_CONTRATANTES = data.items || item.def;
                else if (item.v === 'CACHE_OPERACOES') window.CACHE_OPERACOES = data.items || item.def;
                else if (item.v === 'CACHE_DESPESAS') window.CACHE_DESPESAS = data.items || item.def;
                else if (item.v === 'CACHE_ATIVIDADES') window.CACHE_ATIVIDADES = data.items || item.def;
                else if (item.v === 'CACHE_PROFILE_REQUESTS') window.CACHE_PROFILE_REQUESTS = data.items || item.def;
                else if (item.v === 'CACHE_RECIBOS') window.CACHE_RECIBOS = data.items || item.def;
                
                // Atualiza LocalStorage
                localStorage.setItem(item.k, JSON.stringify(data.items));
            }
        } catch(err) {
            console.warn(`Erro ao baixar ${item.k}:`, err);
        }
    }
    
    console.log("Dados sincronizados.");
    // Re-renderiza tudo após baixar
    window.renderizarTabelaFuncionarios();
    window.renderizarTabelaVeiculos();
    window.renderizarTabelaContratantes();
    window.renderizarTabelaAtividades();
    window.renderizarTabelaDespesasGerais();
    window.renderizarTabelaOperacoes();
    window.renderizarTabelaCheckinsPendentes();
    window.renderizarCalendario();
    window.atualizarDashboard();
}

// -----------------------------------------------------------------------------
// 18. PAINEL DO SUPER ADMIN (GESTÃO DE CRÉDITOS E EMPRESAS)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    const container = document.getElementById('superAdminContainer');
    if (!container) return;
    
    if (forceRefresh) container.innerHTML = '<p style="text-align:center; padding:50px; color:#666;">Atualizando dados globais...</p>';

    const { db, collection, getDocs, query, orderBy } = window.dbRef;

    try {
        // 1. Busca todas as empresas
        const companiesSnap = await getDocs(collection(db, "companies"));
        
        // 2. Busca todos os usuários (para saber quem é o admin de cada empresa)
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = [];
        usersSnap.forEach(doc => allUsers.push(doc.data()));

        container.innerHTML = '';

        if (companiesSnap.empty) {
            container.innerHTML = '<p>Nenhuma empresa cadastrada.</p>';
            return;
        }

        companiesSnap.forEach(docComp => {
            const compData = docComp.data();
            const compId = docComp.id;
            
            // Filtro de pesquisa visual
            const termo = document.getElementById('superAdminSearch').value.toLowerCase();
            const emailOwner = compData.ownerEmail ? compData.ownerEmail.toLowerCase() : '';
            if (termo && !compId.toLowerCase().includes(termo) && !emailOwner.includes(termo)) {
                return;
            }

            // Análise da Licença
            const isVitalicio = compData.vitalicio === true;
            const validade = compData.validade ? new Date(compData.validade) : new Date(0); // Data zero se nulo
            const agora = new Date();
            const diasRestantes = Math.ceil((validade - agora) / (1000 * 60 * 60 * 24));
            
            let statusBadge = '';
            let statusClass = '';
            
            if (isVitalicio) {
                statusBadge = 'VITALÍCIO';
                statusClass = 'credit-lifetime';
            } else if (agora > validade) {
                statusBadge = 'EXPIRADO / BLOQUEADO';
                statusClass = 'credit-expired';
            } else {
                statusBadge = `ATIVO (${diasRestantes} DIAS)`;
                statusClass = 'credit-active';
            }

            // Encontra usuários desta empresa
            const usersDaEmpresa = allUsers.filter(u => u.company === compId);
            const admins = usersDaEmpresa.filter(u => u.role === 'admin');
            const totalUsers = usersDaEmpresa.length;

            // HTML do Cartão da Empresa
            const div = document.createElement('div');
            div.className = 'company-block';
            div.innerHTML = `
                <div class="company-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                    <div style="display:flex; align-items:center;">
                        <i class="fas fa-building" style="margin-right:10px; color:var(--secondary-color);"></i>
                        <div>
                            <div>${compId} <span class="credit-badge ${statusClass}">${statusBadge}</span></div>
                            <small style="font-weight:normal; color:#666;">Dono: ${compData.ownerEmail || '---'}</small>
                        </div>
                    </div>
                    <div>
                        <i class="fas fa-users"></i> ${totalUsers} 
                        <i class="fas fa-chevron-down" style="margin-left:10px;"></i>
                    </div>
                </div>
                <div class="company-content">
                    <div style="display:flex; gap:20px; font-size:0.9rem; color:#555; margin-bottom:10px;">
                        <div>Criado em: ${formatarDataParaBrasileiro(compData.createdAt)}</div>
                        <div>Admins: ${admins.map(a => a.name).join(', ') || 'Nenhum'}</div>
                    </div>
                    
                    <div class="company-actions-bar">
                        <div class="validade-info">
                            Validade Atual: ${isVitalicio ? 'ETERNA' : formatarDataParaBrasileiro(compData.validade ? compData.validade.split('T')[0] : '')}
                        </div>
                        
                        <button class="btn-mini btn-success" onclick="abrirModalCreditos('${compId}', '${compData.ownerEmail}')">
                            <i class="fas fa-plus-circle"></i> GERENCIAR CRÉDITOS
                        </button>
                        
                        <button class="btn-mini btn-danger" onclick="excluirEmpresaGlobal('${compId}')">
                            <i class="fas fa-trash-alt"></i> EXCLUIR EMPRESA
                        </button>
                    </div>

                    <div style="margin-top:10px; background:#fafafa; padding:10px;">
                        <strong>Usuários da Empresa:</strong>
                        <ul style="margin:5px 0 0 20px; font-size:0.85rem;">
                            ${usersDaEmpresa.map(u => `<li>${u.name} (${u.role}) - ${u.email}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error("Erro Super Admin:", e);
        container.innerHTML = '<p style="color:red">Erro ao carregar dados. Verifique o console.</p>';
    }
};

window.filterGlobalUsers = function() {
    // Debounce simples ou reload
    window.carregarPainelSuperAdmin(false);
}

// -----------------------------------------------------------------------------
// 19. LÓGICA DE CRÉDITOS (MODAL E AÇÕES)
// -----------------------------------------------------------------------------

window.abrirModalCreditos = async function(companyId, ownerEmail) {
    const modal = document.getElementById('modalManageCredits');
    const body = document.getElementById('manageCreditBody');
    if(!modal || !body) return;

    body.innerHTML = 'Carregando status atual...';
    modal.style.display = 'flex';

    try {
        const { db, doc, getDoc } = window.dbRef;
        const ref = doc(db, "companies", companyId);
        const snap = await getDoc(ref);
        
        if (!snap.exists()) {
            body.innerHTML = 'Erro: Empresa não encontrada.';
            return;
        }

        const data = snap.data();
        const isVitalicio = data.vitalicio === true;
        const validade = data.validade ? data.validade.split('T')[0] : '---';

        body.innerHTML = `
            <div style="background:#f5f5f5; padding:15px; border-radius:4px; margin-bottom:15px;">
                <p><strong>Empresa:</strong> ${companyId}</p>
                <p><strong>Dono:</strong> ${ownerEmail}</p>
                <p><strong>Status Atual:</strong> ${isVitalicio ? 'VITALÍCIO' : 'VALIDADE ATÉ ' + formatarDataParaBrasileiro(validade)}</p>
            </div>

            <h4 style="border-bottom:1px solid #ddd; padding-bottom:5px;">Adicionar Tempo de Acesso</h4>
            <div style="display:flex; gap:10px; margin-bottom:20px;">
                <button class="btn-primary" onclick="adicionarCreditos('${companyId}', 1)">+ 1 Mês</button>
                <button class="btn-primary" onclick="adicionarCreditos('${companyId}', 3)">+ 3 Meses</button>
                <button class="btn-primary" onclick="adicionarCreditos('${companyId}', 6)">+ 6 Meses</button>
                <button class="btn-primary" onclick="adicionarCreditos('${companyId}', 12)">+ 1 Ano</button>
            </div>

            <h4 style="border-bottom:1px solid #ddd; padding-bottom:5px;">Ações de Controle</h4>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:#fff3e0; padding:10px; border:1px solid #ffe0b2;">
                    <input type="checkbox" id="chkVitalicio" ${isVitalicio ? 'checked' : ''} onchange="toggleVitalicio('${companyId}', this.checked)">
                    <strong>ACESSO VITALÍCIO (Sem necessidade de créditos)</strong>
                </label>

                <button class="btn-danger" onclick="bloquearEmpresa('${companyId}')">
                    <i class="fas fa-ban"></i> BLOQUEAR ACESSO IMEDIATAMENTE
                </button>
            </div>
        `;

    } catch (e) {
        body.innerHTML = 'Erro: ' + e.message;
    }
};

window.adicionarCreditos = async function(companyId, meses) {
    if(!confirm(`Adicionar ${meses} mês(es) de crédito para esta empresa?`)) return;

    try {
        const { db, doc, getDoc, updateDoc } = window.dbRef;
        const ref = doc(db, "companies", companyId);
        const snap = await getDoc(ref);
        const data = snap.data();

        let novaValidade = new Date();
        const validadeAtual = data.validade ? new Date(data.validade) : new Date(0);
        
        // Se a validade atual for maior que hoje, soma a partir dela. Se não, soma a partir de hoje.
        if (validadeAtual > novaValidade) {
            novaValidade = validadeAtual;
        }

        // Adiciona os meses (aproximação de 30 dias por mês para simplificar JS)
        novaValidade.setDate(novaValidade.getDate() + (meses * 30));

        await updateDoc(ref, {
            validade: novaValidade.toISOString(),
            vitalicio: false // Remove vitalício se adicionar crédito manual
        });

        alert("Créditos adicionados com sucesso!");
        abrirModalCreditos(companyId, data.ownerEmail); // Recarrega modal
        carregarPainelSuperAdmin(false); // Atualiza fundo

    } catch (e) {
        alert("Erro: " + e.message);
    }
};

window.toggleVitalicio = async function(companyId, checked) {
    if(!confirm(checked ? "Tornar esta empresa VITALÍCIA? Ela nunca será bloqueada." : "Remover status VITALÍCIO?")) {
        // Reverte checkbox visualmente se cancelar
        document.getElementById('chkVitalicio').checked = !checked;
        return;
    }

    try {
        const { db, doc, updateDoc } = window.dbRef;
        await updateDoc(doc(db, "companies", companyId), {
            vitalicio: checked
        });
        alert("Status atualizado.");
        carregarPainelSuperAdmin(false);
    } catch (e) {
        alert("Erro: " + e.message);
    }
};

window.bloquearEmpresa = async function(companyId) {
    if(!confirm("Tem certeza? Isso impedirá o login de TODOS os usuários desta empresa imediatamente.")) return;

    try {
        const { db, doc, updateDoc } = window.dbRef;
        // Define validade para ontem
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);

        await updateDoc(doc(db, "companies", companyId), {
            validade: ontem.toISOString(),
            vitalicio: false
        });

        alert("Empresa bloqueada.");
        document.getElementById('modalManageCredits').style.display = 'none';
        carregarPainelSuperAdmin(false);
    } catch (e) {
        alert("Erro: " + e.message);
    }
};

window.excluirEmpresaGlobal = async function(companyId) {
    const confirmacao = prompt(`ATENÇÃO PERIGO!\n\nVocê está prestes a excluir a empresa ${companyId} e TODOS os dados associados.\nIsso não pode ser desfeito.\n\nPara confirmar, digite "DELETAR" abaixo:`);
    
    if (confirmacao !== "DELETAR") return;

    try {
        const { db, doc, deleteDoc, collection, getDocs, query, where } = window.dbRef;

        // 1. Exclui documento da empresa
        await deleteDoc(doc(db, "companies", companyId));

        // 2. Busca e exclui usuários associados (opcional, mas recomendável para limpeza)
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const querySnapshot = await getDocs(q);
        
        const deletePromises = [];
        querySnapshot.forEach((documento) => {
            deletePromises.push(deleteDoc(doc(db, "users", documento.id)));
        });
        
        await Promise.all(deletePromises);

        alert("Empresa e usuários excluídos com sucesso.");
        carregarPainelSuperAdmin(true);

    } catch (e) {
        alert("Erro ao excluir: " + e.message);
    }
};

// -----------------------------------------------------------------------------
// 20. CONTROLADORES DE NAVEGAÇÃO E EVENTOS FINAIS
// -----------------------------------------------------------------------------

// Navegação Sidebar
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Visual Active
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');

        // Page Switching
        const pageId = this.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
            
            // Callbacks específicos de carregamento
            if (pageId === 'home') atualizarDashboard();
            if (pageId === 'checkins-pendentes') renderizarTabelaCheckinsPendentes();
            if (pageId === 'super-admin') carregarPainelSuperAdmin();
        }

        // Mobile close
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        }
    });
});

// Mobile Menu Toggle
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
});

document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
});

// Cadastro Tabs Switch
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const tabId = this.getAttribute('data-tab');
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

console.log("Sistema LogiMaster v7.1 carregado com sucesso.");