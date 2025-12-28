// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 7.2 (CORREÇÃO DE LEGADO E SUPER ADMIN)
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
window._cnhAlertasVerificados = false;

// Variável para armazenar status da licença (Pode ser null em empresas antigas)
window.DADOS_LICENCA = null; 

// 3. CACHE LOCAL (Sincronizado com a memória para velocidade instantânea)
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
    // Espera formato YYYY-MM-DD ou ISO string completa
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
        console.error("Erro ao carregar do LocalStorage (" + chave + "):", erro);
        return valorPadrao;
    }
}

function carregarTodosDadosLocais() {
    console.log("Carregando cache local...");
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
    // 1. Atualiza memória RAM
    atualizarCacheCallback(dados);
    
    // 2. Atualiza LocalStorage (Backup local instantâneo)
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 3. Atualiza Firebase (Se logado e com empresa definida)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            // Estrutura padrão { items: [...] } para organizar no Firestore
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            
            // Salva na sub-coleção 'data' da empresa
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
            // Não alerta o usuário para não interromper o fluxo, apenas loga o erro de rede/permissão
        }
    }
}

// Funções de salvamento específicas (Wrappers)
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
    // Tenta renderizar se a tabela existir na tela
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
}

// Buscas Rápidas na Memória (Helpers para Relacionamentos)
// Usam conversão para String para evitar erros de tipo (ex: ID numérico vs string)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
function buscarReciboPorId(id) { return CACHE_RECIBOS.find(r => String(r.id) === String(id)); }

// Inicialização Inicial de Dados (Local) ao carregar o script
carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS FINANCEIROS E GRÁFICOS INTERATIVOS
// =============================================================================

// -----------------------------------------------------------------------------
// 6. CÁLCULOS FINANCEIROS, ALERTAS CNH E ATUALIZAÇÃO DO DASHBOARD (HOME)
// -----------------------------------------------------------------------------

// Função de Verificação de CNH
function verificarAlertasCNH() {
    if (window._cnhAlertasVerificados) return; 
    if (!window.USUARIO_ATUAL) return;

    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    CACHE_FUNCIONARIOS.forEach(function(func) {
        if (func.funcao === 'motorista' && func.validadeCNH) {
            var ehAdmin = window.USUARIO_ATUAL.role === 'admin';
            var ehOProprio = window.USUARIO_ATUAL.email === func.email;

            if (ehAdmin || ehOProprio) {
                var dataValidade = new Date(func.validadeCNH + 'T00:00:00'); 
                var diffTime = dataValidade - hoje;
                var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (diffDays === 30) {
                    alert("⚠️ ATENÇÃO CNH ⚠️\n\nA habilitação de " + func.nome + " vence em exatos 30 DIAS (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nProvidencie a renovação.");
                } else if (diffDays === 1) {
                    alert("🚨 URGENTE CNH 🚨\n\nA habilitação de " + func.nome + " vence AMANHÃ (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nSolicite a alteração da data de vencimento do novo documento imediatamente.");
                }
            }
        }
    });

    window._cnhAlertasVerificados = true;
}

window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    // Chama verificação de CNH apenas uma vez por sessão
    verificarAlertasCNH();

    // [CORREÇÃO] Exibição Segura da Licença
    // Se DADOS_LICENCA for null (empresa antiga), não tenta ler propriedades para não travar
    var headerDash = document.querySelector('#home h2');
    if (headerDash) {
        // Remove badge anterior se existir para não duplicar
        var oldBadge = document.getElementById('badgeLicencaInfo');
        if (oldBadge) oldBadge.remove();

        if (window.DADOS_LICENCA) {
            var spanLicenca = document.createElement('span');
            spanLicenca.id = 'badgeLicencaInfo';
            spanLicenca.style.fontSize = '0.7rem';
            spanLicenca.style.marginLeft = '15px';
            spanLicenca.style.padding = '4px 8px';
            spanLicenca.style.borderRadius = '12px';
            spanLicenca.style.verticalAlign = 'middle';
            spanLicenca.style.fontWeight = 'bold';

            if (window.DADOS_LICENCA.vitalicio) {
                spanLicenca.textContent = "LICENÇA VITALÍCIA";
                spanLicenca.style.backgroundColor = "#f3e5f5"; 
                spanLicenca.style.color = "#7b1fa2";
                spanLicenca.style.border = "1px solid #e1bee7";
            } else if (window.DADOS_LICENCA.validade) {
                var dtVal = new Date(window.DADOS_LICENCA.validade);
                var hojeC = new Date();
                var diasRest = Math.ceil((dtVal - hojeC) / (1000 * 60 * 60 * 24));
                
                // Texto amigável
                if (diasRest < 0) {
                    spanLicenca.textContent = "LICENÇA EXPIRADA";
                    spanLicenca.style.backgroundColor = "#ffebee";
                    spanLicenca.style.color = "#c62828";
                } else {
                    spanLicenca.textContent = "CRÉDITO: " + diasRest + " DIAS";
                    spanLicenca.style.backgroundColor = diasRest <= 5 ? "#fff3e0" : "#e8f5e9";
                    spanLicenca.style.color = diasRest <= 5 ? "#e65100" : "#2e7d32";
                }
            }
            headerDash.appendChild(spanLicenca);
        }
    }

    var mesAtual = window.currentDate.getMonth(); // 0 a 11
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // Cálculo Global
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // Custo Operacional
        var custoOp = (Number(op.despesas) || 0) + (Number(op.combustivel) || 0);
        
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) {
                    custoOp += (Number(aj.diaria) || 0);
                }
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        // Verifica Data com segurança
        if (op.data) {
            var dataOp = new Date(op.data + 'T12:00:00'); 
            if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
                faturamentoMes += valorFat;
                custosMes += custoOp;
            }
        }
    });

    // Soma Despesas Gerais
    CACHE_DESPESAS.forEach(function(desp) {
        if (desp.data) {
            var dataDesp = new Date(desp.data + 'T12:00:00');
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += (Number(desp.valor) || 0);
            }
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza DOM
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

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (CHART.JS) COM PAINEL DE DADOS
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    var elSelect = document.getElementById('filtroVeiculoGrafico');
    var filtroVeiculo = elSelect ? elSelect.value : "";

    // Remove resumo anterior para evitar duplicação
    var existingSummary = document.getElementById('chartVehicleSummary');
    if (existingSummary) existingSummary.remove();

    var kmMes = 0;
    var litrosTotal = 0;
    
    var receitaGrafico = 0;
    var combustivelGrafico = 0;
    var pessoalGrafico = 0; 
    var manutencaoGeralGrafico = 0; 

    CACHE_OPERACOES.forEach(op => {
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (op.status === 'CANCELADA') return;
        if (!op.data) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            kmMes += (Number(op.kmRodado) || 0);
            var preco = Number(op.precoLitro) || 0;
            var valorAbast = Number(op.combustivel) || 0;
            if (preco > 0 && valorAbast > 0) litrosTotal += (valorAbast / preco);

            if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
                receitaGrafico += Number(op.faturamento || 0);
                combustivelGrafico += Number(op.combustivel || 0);
                
                if (!op.checkins || !op.checkins.faltaMotorista) {
                    pessoalGrafico += Number(op.comissao || 0);
                }
                if (op.ajudantes) {
                    op.ajudantes.forEach(aj => {
                        var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                        if (!faltou) pessoalGrafico += (Number(aj.diaria)||0);
                    });
                }
                manutencaoGeralGrafico += Number(op.despesas || 0);
            }
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (filtroVeiculo && d.veiculoPlaca !== filtroVeiculo) return;
        if (!d.data) return;

        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            manutencaoGeralGrafico += Number(d.valor || 0);
        }
    });

    var lucroGrafico = receitaGrafico - (combustivelGrafico + pessoalGrafico + manutencaoGeralGrafico);
    var media = (litrosTotal > 0) ? (kmMes / litrosTotal) : 0;

    // Cria Painel Resumo HTML
    var summaryDiv = document.createElement('div');
    summaryDiv.id = 'chartVehicleSummary';
    summaryDiv.style.marginBottom = '15px';
    summaryDiv.style.padding = '15px';
    summaryDiv.style.background = '#e3f2fd';
    summaryDiv.style.border = '1px solid #90caf9';
    summaryDiv.style.borderRadius = '8px';
    summaryDiv.style.display = 'grid';
    summaryDiv.style.gridTemplateColumns = 'repeat(5, 1fr)'; 
    summaryDiv.style.gap = '10px';
    summaryDiv.style.fontSize = '0.9rem';
    summaryDiv.style.alignItems = 'center';

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

    ctx.parentNode.insertBefore(summaryDiv, ctx);

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
                    'rgba(46, 125, 50, 0.7)',   
                    'rgba(198, 40, 40, 0.7)',   
                    'rgba(255, 152, 0, 0.7)',   
                    'rgba(156, 39, 176, 0.7)',  
                    (lucroGrafico >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)')
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
                <th width="30%">FINANCEIRO</th>
                <th width="20%">CONSUMO</th>
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

document.getElementById('formFuncionario').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    var btn = this.querySelector('button[type="submit"]');
    var textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

    try {
        var id = document.getElementById('funcionarioId').value;
        var nome = document.getElementById('funcNome').value.trim().toUpperCase();
        var funcao = document.getElementById('funcFuncao').value;
        var email = document.getElementById('funcEmail').value.trim().toLowerCase();
        var telefone = document.getElementById('funcTelefone').value;
        var documento = document.getElementById('funcDocumento').value;
        var senha = document.getElementById('funcSenha').value; 
        var pix = document.getElementById('funcPix').value;
        var endereco = document.getElementById('funcEndereco').value;

        // Campos Específicos de Motorista
        var cnh = document.getElementById('funcCNH').value;
        var validadeCNH = document.getElementById('funcValidadeCNH').value;
        var categoriaCNH = document.getElementById('funcCategoriaCNH').value;
        var cursos = document.getElementById('funcCursoDescricao').value;

        if (!nome || !email) throw new Error("Preencha nome e e-mail.");

        // Objeto base
        var novoFunc = {
            id: id || Date.now().toString(),
            nome: nome,
            funcao: funcao,
            email: email,
            telefone: telefone,
            documento: documento,
            pix: pix,
            endereco: endereco,
            cnh: cnh,
            validadeCNH: validadeCNH,
            categoriaCNH: categoriaCNH,
            cursos: cursos,
            dataCadastro: new Date().toISOString()
        };

        if (id) {
            // EDIÇÃO (Apenas dados cadastrais)
            var index = CACHE_FUNCIONARIOS.findIndex(f => f.id === id);
            if (index >= 0) {
                novoFunc.dataCadastro = CACHE_FUNCIONARIOS[index].dataCadastro; // Preserva data
                CACHE_FUNCIONARIOS[index] = novoFunc;
            }
        } else {
            // CRIAÇÃO (Novo Usuário)
            if (!senha) throw new Error("A senha é obrigatória para novos usuários.");
            
            var existe = CACHE_FUNCIONARIOS.find(f => f.email === email);
            if (existe) throw new Error("E-mail já cadastrado na empresa.");

            // 1. Tenta criar no Authentication (Firebase)
            if (window.dbRef && window.dbRef.criarAuthUsuario) {
                try {
                    const uid = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // 2. Cria documento de permissão na coleção 'users'
                    const { db, setDoc, doc } = window.dbRef;
                    await setDoc(doc(db, "users", uid), {
                        uid: uid,
                        name: nome,
                        email: email,
                        role: funcao,
                        company: window.USUARIO_ATUAL.company,
                        approved: true, // Admin criando já nasce aprovado
                        createdAt: new Date().toISOString(),
                        senhaVisual: senha // Facilitador para suporte
                    });
                } catch (errAuth) {
                    console.error("Erro ao criar Auth:", errAuth);
                    alert("Atenção: O cadastro foi salvo no banco, mas houve erro ao criar o Login.\nErro: " + errAuth.message);
                }
            }

            CACHE_FUNCIONARIOS.push(novoFunc);
        }

        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        
        alert("Funcionário salvo com sucesso!");
        document.getElementById('formFuncionario').reset();
        document.getElementById('funcionarioId').value = '';
        renderizarTabelaFuncionarios();

    } catch (erro) {
        alert("Erro: " + erro.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
});

window.renderizarTabelaFuncionarios = function() {
    var tbody = document.querySelector('#tabelaFuncionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    CACHE_FUNCIONARIOS.forEach(function(f) {
        var tr = document.createElement('tr');
        
        var labelFuncao = f.funcao ? f.funcao.toUpperCase() : '---';
        
        // Alerta visual de CNH vencida na tabela
        if(f.funcao === 'motorista' && f.validadeCNH) {
             var hoje = new Date(); 
             var val = new Date(f.validadeCNH);
             if (val < hoje) labelFuncao += ' <span style="color:red; font-weight:bold; font-size:0.7em;">(CNH VENCIDA)</span>';
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
    
    // Atualiza selects dependentes em outras telas
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

    toggleDriverFields();
    document.querySelector('.cadastro-tabs').scrollIntoView({ behavior: 'smooth' });
};

window.excluirFuncionario = function(id) {
    if (confirm("Excluir este funcionário da lista? (O histórico financeiro será mantido, mas o acesso pode ser revogado)")) {
        CACHE_FUNCIONARIOS = CACHE_FUNCIONARIOS.filter(f => f.id !== id);
        salvarListaFuncionarios(CACHE_FUNCIONARIOS).then(() => {
            renderizarTabelaFuncionarios();
        });
    }
};

function atualizarSelectsFuncionarios() {
    var selects = [
        'selectMotoristaOperacao', 
        'selectAjudantesOperacao', 
        'selectMotoristaRecibo', 
        'selectMotoristaRelatorio'
    ];
    
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if (!sel) return;
        
        var valorAtual = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        
        CACHE_FUNCIONARIOS.forEach(f => {
            if (id === 'selectMotoristaOperacao' && f.funcao !== 'motorista') return;
            if (id === 'selectAjudantesOperacao' && f.funcao !== 'ajudante') return;
            
            var opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.nome;
            sel.appendChild(opt);
        });
        
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
        if (!confirm("Veículo já cadastrado. Atualizar dados?")) return;
        CACHE_VEICULOS[existenteIndex] = veiculoObj;
    } else {
        CACHE_VEICULOS.push(veiculoObj);
    }

    salvarListaVeiculos(CACHE_VEICULOS).then(() => {
        alert("Veículo salvo.");
        document.getElementById('formVeiculo').reset();
        document.getElementById('veiculoPlaca').readOnly = false;
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
    document.getElementById('veiculoPlaca').readOnly = true; 
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
    var cnpj = document.getElementById('contratanteCNPJ').value.trim().replace(/\D/g,''); 
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
        document.getElementById('contratanteCNPJ').readOnly = false;
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

    var selects = ['selectContratanteOperacao', 'selectContratanteRelatorio'];
    selects.forEach(id => {
        var sel = document.getElementById(id);
        if(!sel) return;
        var val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        CACHE_CONTRATANTES.forEach(c => {
            var opt = document.createElement('option');
            opt.value = c.cnpj; 
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
        atualizarDashboard(); 
    });
});

window.renderizarTabelaDespesasGerais = function() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
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

// Função Auxiliar: Adicionar Ajudante na Lista Temporária da Viagem
window.adicionarAjudanteNaLista = function(idAjudante) {
    if (!idAjudante) return;
    
    // Evita duplicidade
    var jaExiste = window._operacaoAjudantesTempList.find(a => a.id === idAjudante);
    if (jaExiste) {
        alert("Este ajudante já foi adicionado.");
        return;
    }

    var func = buscarFuncionarioPorId(idAjudante);
    if (!func) return;

    // Adiciona com valor padrão de diária (R$ 80,00 - pode ser ajustado futuramente)
    window._operacaoAjudantesTempList.push({
        id: idAjudante,
        nome: func.nome,
        diaria: 80.00 
    });

    renderizarListaAjudantesTemp();
};

// Listener do Botão "Adicionar" (Ajudante)
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
        li.style.marginBottom = '5px';
        
        li.innerHTML = `
            <span><i class="fas fa-user-hard-hat"></i> ${aj.nome.split(' ')[0]}</span>
            <button type="button" onclick="removerAjudanteDaLista('${aj.id}')" style="background:transparent; border:none; color:red; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        ul.appendChild(li);
    });
}

// SALVAR VIAGEM (Submit)
document.getElementById('formOperacao').addEventListener('submit', function(e) {
    e.preventDefault();
    
    var id = document.getElementById('operacaoId').value;
    var data = document.getElementById('operacaoData').value;
    var motoristaId = document.getElementById('selectMotoristaOperacao').value;
    var veiculoPlaca = document.getElementById('selectVeiculoOperacao').value;
    var contratanteCNPJ = document.getElementById('selectContratanteOperacao').value;
    var atividadeNome = document.getElementById('selectAtividadeOperacao').value;
    var faturamento = parseFloat(document.getElementById('operacaoFaturamento').value);
    
    var adiantamento = parseFloat(document.getElementById('operacaoAdiantamento').value) || 0;
    var comissao = parseFloat(document.getElementById('operacaoComissao').value) || 0;
    
    var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
    
    // Dados Ocultos (Preservação)
    var kmRodado = parseFloat(document.getElementById('operacaoKmRodado').value) || 0;
    var combustivel = parseFloat(document.getElementById('operacaoCombustivel').value) || 0;
    var precoLitro = parseFloat(document.getElementById('operacaoPrecoLitro').value) || 0;
    var despesas = parseFloat(document.getElementById('operacaoDespesas').value) || 0;

    if (!data || !motoristaId || !veiculoPlaca || isNaN(faturamento)) {
        alert("Por favor, preencha os campos obrigatórios.");
        return;
    }

    // Define status
    var statusInicial = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
    var checkinsExistentes = null;
    
    // Se edição, mantém status atual
    if (id) {
        var opAntiga = CACHE_OPERACOES.find(o => o.id == id);
        if (opAntiga) {
            statusInicial = opAntiga.status; 
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
        ajudantes: window._operacaoAjudantesTempList, // Salva lista de ajudantes
        status: statusInicial,
        kmRodado: kmRodado,
        combustivel: combustivel,
        precoLitro: precoLitro,
        despesas: despesas,
        checkins: checkinsExistentes || {} 
    };

    if (id) {
        var idx = CACHE_OPERACOES.findIndex(o => o.id == id);
        if (idx >= 0) CACHE_OPERACOES[idx] = novaOp;
    } else {
        CACHE_OPERACOES.push(novaOp);
    }

    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        alert("Operação salva com sucesso!");
        document.getElementById('formOperacao').reset();
        document.getElementById('operacaoId').value = '';
        window._operacaoAjudantesTempList = []; 
        renderizarListaAjudantesTemp();
        
        // Atualiza todas as visualizações
        renderizarTabelaOperacoes();
        renderizarCalendario(); 
        atualizarDashboard(); 
        if(window.renderizarTabelaCheckinsPendentes) renderizarTabelaCheckinsPendentes();
    });
});

window.renderizarTabelaOperacoes = function() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordenação Segura (Data mais recente primeiro)
    var lista = [].concat(CACHE_OPERACOES).sort((a,b) => {
        var dA = a.data ? new Date(a.data) : new Date(0);
        var dB = b.data ? new Date(b.data) : new Date(0);
        return dB - dA;
    });

    // Paginação simples (últimos 50) para não travar
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

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#777;">Nenhuma operação registrada.</td></tr>';
    }
};

window.editarOperacao = function(id) {
    // Busca permissiva (string/number)
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
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    document.getElementById('operacaoKmRodado').value = op.kmRodado || 0;
    document.getElementById('operacaoCombustivel').value = op.combustivel || 0;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro || 0;
    document.getElementById('operacaoDespesas').value = op.despesas || 0;

    // Carrega Ajudantes
    window._operacaoAjudantesTempList = op.ajudantes ? JSON.parse(JSON.stringify(op.ajudantes)) : [];
    renderizarListaAjudantesTemp();

    // Scroll até o formulário
    var formSection = document.getElementById('operacoes');
    if(formSection) formSection.scrollIntoView({ behavior: 'smooth' });
};

window.cancelarOperacao = function(id) {
    if (confirm("Deseja realmente CANCELAR esta viagem?")) {
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
        editarOperacao(id);
        document.getElementById('operacaoId').value = ''; // Limpa ID para criar novo
        document.getElementById('operacaoData').focus(); // Foca na data
        alert("Dados carregados. Altere a DATA e clique em GRAVAR.");
    }
};

// -----------------------------------------------------------------------------
// 15. MONITORAMENTO E CHECK-INS (ROTAS E FALTAS)
// -----------------------------------------------------------------------------

window.renderizarTabelaCheckinsPendentes = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var hojeStr = new Date().toISOString().split('T')[0];
    
    // Filtra: Hoje OU Em Andamento (independente da data)
    var listaMonitoramento = CACHE_OPERACOES.filter(op => {
        var ehHoje = (op.data === hojeStr);
        var emAndamento = (op.status === 'EM_ANDAMENTO');
        return (ehHoje || emAndamento) && op.status !== 'CANCELADA' && op.status !== 'FINALIZADA';
    });

    if (listaMonitoramento.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma rota ativa para hoje.</td></tr>';
        return;
    }

    listaMonitoramento.forEach(op => {
        var tr = document.createElement('tr');
        
        var mot = buscarFuncionarioPorId(op.motoristaId);
        
        // Status Motorista
        var statusMot = '<span style="color:#999;"><i class="fas fa-clock"></i> Aguardando...</span>';
        if (op.checkins && op.checkins.motorista) {
            statusMot = `<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> ${op.checkins.motorista.hora}</span>`;
        } else if (op.checkins && op.checkins.faltaMotorista) {
            statusMot = `<span style="color:red; font-weight:bold;">FALTA</span>`;
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

        // Botões de Controle
        var btnIniciar = '';
        if (op.status !== 'EM_ANDAMENTO') {
             btnIniciar = `<button class="btn-mini btn-success" onclick="forcarInicioViagem('${op.id}')">INICIAR</button>`;
        } else {
             btnIniciar = `<span class="status-pill pill-active">EM ROTA</span>`;
             btnIniciar += `<br><button class="btn-mini btn-secondary" onclick="finalizarViagemManual('${op.id}')" style="margin-top:5px;">FINALIZAR</button>`;
        }

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
    
    var km = prompt("KM Final (Total Rodado):", op.kmRodado || 0);
    if(km === null) return; // Cancelou
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
        renderizarTabelaOperacoes();
    });
};

window.abrirModalFalta = function(opId) {
    var op = CACHE_OPERACOES.find(o => o.id == opId);
    if(!op) return;

    var opcoes = [];
    var mot = buscarFuncionarioPorId(op.motoristaId);
    if(mot) opcoes.push({ id: op.motoristaId, nome: mot.nome, tipo: 'motorista' });
    
    if(op.ajudantes) {
        op.ajudantes.forEach(aj => opcoes.push({ id: aj.id, nome: aj.nome, tipo: 'ajudante' }));
    }

    var texto = "Digite o ID do funcionário para falta:\n";
    opcoes.forEach(opt => texto += `${opt.id} - ${opt.nome} (${opt.tipo})\n`);
    
    var idEscolhido = prompt(texto);
    if(!idEscolhido) return;

    var motivo = prompt("Motivo da falta:");
    
    if(!op.checkins) op.checkins = {};
    if(!op.checkins.faltas) op.checkins.faltas = {};

    if (idEscolhido == op.motoristaId) {
        op.checkins.faltaMotorista = true;
        op.checkins.motivoFaltaMotorista = motivo || 'Não informado';
    } else {
        op.checkins.faltas[idEscolhido] = motivo || 'Não informado';
    }

    salvarListaOperacoes(CACHE_OPERACOES).then(() => {
        alert("Falta registrada.");
        renderizarTabelaCheckinsPendentes();
    });
};

window.sincronizarDadosDaNuvem = function(force) {
    if(force) {
        var btn = document.querySelector('button[onclick="sincronizarDadosDaNuvem(true)"]');
        if(btn) btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> SINCRONIZANDO...';
        
        setTimeout(() => {
            if(window.carregarDadosDoFirebase && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
                window.carregarDadosDoFirebase(window.USUARIO_ATUAL.company).then(() => {
                    alert("Sincronização concluída.");
                    if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR AGORA';
                });
            } else {
                window.location.reload();
            }
        }, 1000);
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
    
    var html = `<h2 style="text-align:center; color:#00796b;">RELATÓRIO GERAL</h2>`;
    html += `<p style="text-align:center;">Período: ${inicio ? formatarDataParaBrasileiro(inicio) : 'INÍCIO'} até ${fim ? formatarDataParaBrasileiro(fim) : 'HOJE'}</p><hr>`;

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

        var receita = Number(op.faturamento)||0;
        var custos = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
        
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
                <div style="color:green;">FAT: ${formatarValorMoeda(totalFat)}</div>
                <div style="color:red;">CUSTOS: ${formatarValorMoeda(totalCustos)}</div>
                <div style="color:${totalLucro>=0?'#00796b':'red'}; border:1px solid #999; padding:0 10px; background:#fff;">RES: ${formatarValorMoeda(totalLucro)}</div>
             </div>`;

    container.innerHTML = html;
};

window.gerarRelatorioCobranca = function() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    var cliCnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!cliCnpj) { alert("Selecione um Cliente para a fatura."); return; }
    
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
                    <strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'EMPRESA LOGÍSTICA'}</strong><br>
                    CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '00.000.000/0000-00'}<br>
                    ${CACHE_MINHA_EMPRESA.telefone || ''}
                </div>
            </div>
            
            <div style="margin-top:20px;">
                <strong>TOMADOR:</strong><br>
                ${nomeCli} (CNPJ: ${cliCnpj})
            </div>

            <p>Período: ${inicio ? formatarDataParaBrasileiro(inicio) : '---'} a ${fim ? formatarDataParaBrasileiro(fim) : '---'}</p>

            <table style="width:100%; border-collapse:collapse; margin-top:15px; font-size:0.9rem;">
                <thead>
                    <tr style="background:#eee; border:1px solid #000;">
                        <th style="border:1px solid #000; padding:5px;">DATA</th>
                        <th style="border:1px solid #000; padding:5px;">DESCRIÇÃO</th>
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
                    <td style="border:1px solid #000; padding:5px;">Frete - Veículo ${op.veiculoPlaca}</td>
                    <td style="border:1px solid #000; padding:5px; text-align:right;">${formatarValorMoeda(op.faturamento)}</td>
                 </tr>`;
    });

    html += `   </tbody></table>
            <div style="margin-top:20px; text-align:right; font-size:1.2rem; font-weight:bold;">
                TOTAL: ${formatarValorMoeda(total)}
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
// PARTE 5: NAVEGAÇÃO, SUPER ADMIN (LEGACY FIX), SINC E INICIALIZAÇÃO ASSÍNCRONA
// =============================================================================

function configurarNavegacao() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            
            // Navegação Visual
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
            
            this.classList.add('active');
            var target = document.getElementById(pageId);
            if (target) { 
                target.style.display = 'block'; 
                // Pequeno delay para permitir transição CSS se houver
                setTimeout(() => target.classList.add('active'), 10); 
            }
            
            // Ações específicas ao entrar nas páginas (Callbacks)
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'despesas') renderizarTabelaDespesasGerais();
            if (pageId === 'checkins-pendentes') {
                // Tenta atualizar se estiver online, mas exibe o que tem localmente primeiro
                renderizarTabelaMonitoramento(); 
                sincronizarDadosDaNuvem(false); 
            }
            if (pageId === 'access-management') { renderizarPainelEquipe(); renderizarTabelaProfileRequests(); }
            if (pageId === 'super-admin') { carregarPainelSuperAdmin(); }
            
            // Lógica específica para Funcionários vs Admin
            if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role !== 'admin') {
                if (pageId === 'employee-home') { 
                    verificarNovasMensagens();
                    renderizarPainelCheckinFuncionario();
                    sincronizarDadosDaNuvem(false);
                }
                if (pageId === 'recibos') {
                    document.getElementById('adminRecibosPanel').style.display = 'none';
                    document.getElementById('employeeRecibosPanel').style.display = 'block';
                    renderizarTabelasRecibos();
                }
            } else {
                // Se for Admin
                if (pageId === 'recibos') {
                    document.getElementById('adminRecibosPanel').style.display = 'block';
                    document.getElementById('employeeRecibosPanel').style.display = 'none';
                    renderizarTabelasRecibos();
                }
            }

            if (pageId === 'meus-dados') { carregarDadosMeuPerfil(window.USUARIO_ATUAL.email); }
            
            // Mobile: Fecha menu
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebarOverlay')?.classList.remove('active');
            }
        };
    });

    // Abas de Cadastro
    var tabs = document.querySelectorAll('.cadastro-tab-btn');
    tabs.forEach(tab => {
        tab.onclick = function() {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            var formId = this.getAttribute('data-tab');
            document.getElementById(formId).classList.add('active');
        };
    });
}

// -----------------------------------------------------------------------------
// SISTEMA DE MENSAGENS E NOTIFICAÇÕES
// -----------------------------------------------------------------------------

window._idsLidosLocalmente = []; 

window.verificarNovasMensagens = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs } = window.dbRef;
    if(document.getElementById('modalNotification').style.display === 'block') return;

    try {
        const q = query(collection(db, "messages"), where("company", "==", window.USUARIO_ATUAL.company));
        const snap = await getDocs(q);
        
        for (const msgDoc of snap.docs) {
            const data = msgDoc.data();
            const myId = window.USUARIO_ATUAL.uid;
            const msgId = msgDoc.id;
            const isForMe = (data.to === 'all' || data.to === myId);
            const alreadyReadDB = data.readBy && data.readBy.includes(myId);
            const justReadLocal = window._idsLidosLocalmente.includes(msgId);
            
            if (isForMe && !alreadyReadDB && !justReadLocal) {
                window._mensagemAtualId = msgId; 
                document.getElementById('notificationMessageText').innerText = data.content;
                document.getElementById('notificationSender').innerText = "Enviado por: " + data.from;
                document.getElementById('modalNotification').style.display = 'block';
                break; 
            }
        }
    } catch (e) { console.error("Erro msg:", e); }
};

window.confirmarLeituraMensagem = async function() {
    document.getElementById('modalNotification').style.display = 'none';
    if(!window._mensagemAtualId || !window.dbRef || !window.USUARIO_ATUAL) return;
    
    const msgId = window._mensagemAtualId;
    const myId = window.USUARIO_ATUAL.uid;
    window._idsLidosLocalmente.push(msgId);
    
    const { db, doc, getDoc, updateDoc } = window.dbRef;
    try {
        const msgRef = doc(db, "messages", msgId);
        const snapshot = await getDoc(msgRef);
        if (snapshot.exists()) {
            let dadosAtuais = snapshot.data();
            let listaLeitura = dadosAtuais.readBy || [];
            if (!listaLeitura.includes(myId)) {
                listaLeitura.push(myId);
                await updateDoc(msgRef, { readBy: listaLeitura });
            }
        }
        window._mensagemAtualId = null;
        setTimeout(window.verificarNovasMensagens, 1500);
    } catch(e) { console.error("Erro leitura:", e); }
};

// -----------------------------------------------------------------------------
// SINCRONIZAÇÃO DE DADOS (CACHE + NUVEM)
// -----------------------------------------------------------------------------

window.sincronizarDadosDaNuvem = async function(manual = false) {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;
    
    // Indicador visual discreto se for automático, ou no botão se for manual
    var btn = null;
    if(manual) { 
        btn = document.querySelector('button[onclick*="sincronizar"]'); 
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...'; 
    } else {
        console.log("Sincronizando em background...");
    }
    
    const { db, doc, getDoc } = window.dbRef; 
    const company = window.USUARIO_ATUAL.company;

    const carregarColecao = async (chave, varCacheName, callback) => { 
        try { 
            const docRef = doc(db, 'companies', company, 'data', chave); 
            const snap = await getDoc(docRef); 
            if (snap.exists()) { 
                const data = snap.data();
                // Suporte legado (Array direto vs Objeto {items:[]})
                const itens = Array.isArray(data) ? data : (data.items || []);
                
                localStorage.setItem(chave, JSON.stringify(itens)); 
                callback(itens); 
            }
        } catch (e) { 
            console.warn(`Erro sync ${chave} (Pode ser vazio inicialmente):`, e); 
        } 
    };
    
    // Executa downloads em paralelo
    await Promise.all([ 
        carregarColecao(CHAVE_DB_FUNCIONARIOS, 'CACHE_FUNCIONARIOS', (d) => CACHE_FUNCIONARIOS = d), 
        carregarColecao(CHAVE_DB_OPERACOES, 'CACHE_OPERACOES', (d) => CACHE_OPERACOES = d), 
        carregarColecao(CHAVE_DB_VEICULOS, 'CACHE_VEICULOS', (d) => CACHE_VEICULOS = d), 
        carregarColecao(CHAVE_DB_CONTRATANTES, 'CACHE_CONTRATANTES', (d) => CACHE_CONTRATANTES = d), 
        carregarColecao(CHAVE_DB_ATIVIDADES, 'CACHE_ATIVIDADES', (d) => CACHE_ATIVIDADES = d), 
        carregarColecao(CHAVE_DB_MINHA_EMPRESA, 'CACHE_MINHA_EMPRESA', (d) => CACHE_MINHA_EMPRESA = d),
        carregarColecao(CHAVE_DB_PROFILE_REQUESTS, 'CACHE_PROFILE_REQUESTS', (d) => CACHE_PROFILE_REQUESTS = d),
        carregarColecao(CHAVE_DB_RECIBOS, 'CACHE_RECIBOS', (d) => CACHE_RECIBOS = d)
    ]);
    
    // Atualiza UI globalmente após download
    if(typeof renderizarTabelaMonitoramento === 'function') renderizarTabelaMonitoramento();
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
    if(typeof renderizarTabelaOperacoes === 'function') renderizarTabelaOperacoes();
    if(typeof atualizarDashboard === 'function') atualizarDashboard();
    if(typeof preencherTodosSelects === 'function') preencherTodosSelects(); // Atualiza selects com novos dados
    
    if(manual) { 
        alert("Dados sincronizados com sucesso!"); 
        if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR AGORA'; 
        if(typeof renderizarPainelCheckinFuncionario === 'function') renderizarPainelCheckinFuncionario(); 
    }
};

function iniciarAutoSync() {
    if (window._intervaloMonitoramento) clearInterval(window._intervaloMonitoramento);
    // Sincroniza a cada 30 segundos automaticamente
    window._intervaloMonitoramento = setInterval(() => {
        if(window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
            sincronizarDadosDaNuvem(false);
        }
    }, 30000); 
}

// === IMPLEMENTAÇÃO DO SUPER ADMIN HÍBRIDO (LEGACY + NOVO) ===
window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    if (!window.dbRef) return;
    const { db, collection, getDocs } = window.dbRef;
    const container = document.getElementById('superAdminContainer');
    
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Analisando base global (Legacy & SaaS)...</p>';

    try {
        // Busca TODOS os usuários e TODAS as empresas registradas
        const usersSnap = await getDocs(collection(db, "users"));
        const companiesSnap = await getDocs(collection(db, "companies"));
        
        // Mapeamento
        const empresasMap = {};
        
        // 1. Processa Empresas Oficiais (Com Licença)
        companiesSnap.forEach(doc => {
            const data = doc.data();
            empresasMap[doc.id] = {
                id: doc.id,
                nome: doc.id.toUpperCase(),
                licenca: data, // Dados da licença (validade, vitalicio)
                admins: [],
                users: [],
                isLegacy: false // Tem documento oficial
            };
        });

        // 2. Processa Usuários (Encontra empresas Legacy sem documento)
        usersSnap.forEach(doc => {
            const u = doc.data();
            const empresaId = u.company || 'SEM_EMPRESA';
            
            if (!empresasMap[empresaId]) {
                // Se não existe no mapa oficial, é Legacy
                empresasMap[empresaId] = {
                    id: empresaId,
                    nome: empresaId.toUpperCase(),
                    licenca: null,
                    admins: [],
                    users: [],
                    isLegacy: true // Marca como legado
                };
            }
            
            if (u.role === 'admin') {
                empresasMap[empresaId].admins.push(u);
            } else {
                empresasMap[empresaId].users.push(u);
            }
        });

        container.innerHTML = '';
        const listaEmpresas = Object.values(empresasMap).sort((a,b) => a.id.localeCompare(b.id));

        if (listaEmpresas.length === 0) {
            container.innerHTML = '<p style="text-align:center;">Nenhuma empresa encontrada.</p>';
            return;
        }

        listaEmpresas.forEach(emp => {
            // Filtro de Busca
            const termo = document.getElementById('superAdminSearch').value.toLowerCase();
            const donoEmail = emp.licenca ? emp.licenca.ownerEmail : (emp.admins[0]?.email || '');
            if (termo && !emp.id.toLowerCase().includes(termo) && !donoEmail.toLowerCase().includes(termo)) {
                return;
            }

            const div = document.createElement('div');
            div.className = 'company-block';
            
            // Define Status Badge
            let statusHtml = '';
            let statusClass = '';
            if (emp.isLegacy) {
                statusHtml = 'LEGADO / SEM LICENÇA';
                statusClass = 'credit-expired'; // Vermelho
            } else if (emp.licenca.vitalicio) {
                statusHtml = 'VITALÍCIO';
                statusClass = 'credit-lifetime'; // Roxo
            } else {
                const val = new Date(emp.licenca.validade);
                const dias = Math.ceil((val - new Date())/(1000*60*60*24));
                if(dias < 0) { statusHtml = 'EXPIRADO'; statusClass = 'credit-expired'; }
                else { statusHtml = `ATIVO (${dias} DIAS)`; statusClass = 'credit-active'; }
            }

            // Ações do Botão
            const ownerEmail = emp.licenca ? emp.licenca.ownerEmail : (emp.admins[0]?.email || 'legacy@system');
            
            div.innerHTML = `
                <div class="company-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                    <div style="display:flex; align-items:center;">
                        <i class="fas fa-building" style="margin-right:10px; color:${emp.isLegacy ? 'orange' : 'var(--secondary-color)'};"></i>
                        <div>
                            <div>${emp.id} <span class="credit-badge ${statusClass}">${statusHtml}</span></div>
                            <small style="color:#666;">${ownerEmail}</small>
                        </div>
                    </div>
                    <div>
                        ${emp.admins.length} Adm / ${emp.users.length} Func
                        <i class="fas fa-chevron-down" style="margin-left:10px;"></i>
                    </div>
                </div>
                <div class="company-content">
                    <div class="company-actions-bar">
                        <div class="validade-info">
                            <strong>Tipo:</strong> ${emp.isLegacy ? 'Sistema Antigo (Requer Regularização)' : 'LogiMaster SaaS'}
                        </div>
                        <button class="btn-mini btn-success" onclick="abrirModalCreditos('${emp.id}', '${ownerEmail}')">
                            <i class="fas fa-calendar-plus"></i> ${emp.isLegacy ? 'CRIAR LICENÇA' : 'GERENCIAR'}
                        </button>
                        <button class="btn-mini btn-danger" onclick="excluirEmpresaGlobal('${emp.id}')">
                            <i class="fas fa-trash"></i> EXCLUIR
                        </button>
                    </div>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9;">
                        <strong>Administradores:</strong> ${emp.admins.map(a => a.name).join(', ') || 'Nenhum'}<br>
                        <strong>Funcionários:</strong> ${emp.users.length} cadastrados.
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error("Erro super admin:", e);
        container.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar dados. Verifique console.</p>';
    }
};

window.filterGlobalUsers = function() {
    // Recarrega aplicando filtro (poderia ser feito só com CSS hide, mas reload garante consistência)
    carregarPainelSuperAdmin(false);
};

// --- INICIALIZAÇÃO DO SISTEMA (CORREÇÃO DE TELA BRANCA) ---

window.initSystemByRole = async function(user) {
    console.log("Inicializando:", user.email, "| Role:", user.role);
    window.USUARIO_ATUAL = user;
    
    // Configura listeners de clique
    configurarNavegacao();
    
    // Inicia sync automático em background
    iniciarAutoSync();

    // 1. ROTA SUPER ADMIN
    if (user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') { 
        document.getElementById('menu-admin').style.display = 'none'; 
        document.getElementById('menu-employee').style.display = 'none'; 
        document.getElementById('menu-super-admin').style.display = 'block'; 
        
        // Simula clique para abrir painel
        var btnSuper = document.querySelector('[data-page="super-admin"]');
        if(btnSuper) btnSuper.click(); 
        return; 
    }
    
    // 2. CARREGAMENTO HÍBRIDO (Cache primeiro, Nuvem depois)
    // Isso previne a tela branca. Carrega o que tem no LocalStorage e mostra a tela IMEDIATAMENTE.
    carregarTodosDadosLocais(); 
    
    // Preenche selects com dados do cache
    preencherTodosSelects();

    // 3. ROTA ADMIN
    if (user.role === 'admin') { 
        document.getElementById('menu-admin').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = false; 
        
        // Força ir para Home imediatamente
        var btnHome = document.querySelector('[data-page="home"]'); 
        if(btnHome) btnHome.click(); 
        
        // Dispara sync em background (sem await para não travar)
        sincronizarDadosDaNuvem(false).then(() => {
            console.log("Sync inicial concluído.");
            // Atualiza dashboard com dados novos se houver
            atualizarDashboard(); 
        });
    } 
    // 4. ROTA FUNCIONÁRIO
    else if (user.role === 'motorista' || user.role === 'ajudante') { 
        document.getElementById('menu-employee').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = true; 
        
        var btnHomeEmp = document.querySelector('[data-page="employee-home"]'); 
        if(btnHomeEmp) btnHomeEmp.click(); 
        
        sincronizarDadosDaNuvem(false).then(() => {
            verificarNovasMensagens(); 
            renderizarPainelCheckinFuncionario(); 
        });
    }
    
    // Verificação de Licença (SaaS) - Executa em background, não bloqueia UI inicial
    // Se estiver vencido, o login.html já barrou, mas aqui reforçamos
    if(window.dbRef && user.company) {
        const { db, doc, getDoc } = window.dbRef;
        getDoc(doc(db, "companies", user.company)).then(snap => {
            if(snap.exists()) {
                window.DADOS_LICENCA = snap.data();
                atualizarDashboard(); // Atualiza badge de licença
            }
        }).catch(e => console.log("Empresa Legacy ou erro licença:", e));
    }
};

document.getElementById('mobileMenuBtn').onclick = function() { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebarOverlay').classList.add('active'); };
document.getElementById('sidebarOverlay').onclick = function() { document.getElementById('sidebar').classList.remove('active'); this.classList.remove('active'); };

function carregarDadosMeuPerfil(email) {
    var f = CACHE_FUNCIONARIOS.find(x => x.email && x.email.trim().toLowerCase() === email.trim().toLowerCase());
    var div = document.getElementById('meus-dados');
    if (f) {
        div.innerHTML = `<h2>MEUS DADOS</h2><div class="card"><h3>${f.nome} <span class="status-pill pill-active">${f.funcao}</span></h3><p><strong>CPF:</strong> ${f.documento}</p><p><strong>Tel:</strong> ${formatarTelefoneBrasil(f.telefone)}</p><p><strong>Pix:</strong> ${f.pix || '-'}</p><button class="btn-warning" onclick="document.getElementById('modalRequestProfileChange').style.display='block'" style="margin-top:15px;">SOLICITAR ALTERAÇÃO</button></div>`;
    } else { div.innerHTML = '<p>Dados não encontrados ou incompletos.</p>'; }
}

document.addEventListener('submit', async function(e) { if (e.target.id === 'formCreateCompany') { /* Tratado no listener anterior */ } });
document.addEventListener('submit', async function(e) { if (e.target.id === 'formRequestProfileChange') { e.preventDefault(); var tipo = document.getElementById('reqFieldType').value; var novoValor = document.getElementById('reqNewValue').value; if (!window.USUARIO_ATUAL) return; var novaReq = { id: Date.now().toString(), data: new Date().toISOString(), funcionarioEmail: window.USUARIO_ATUAL.email, campo: tipo, valorNovo: novoValor, status: 'PENDENTE' }; CACHE_PROFILE_REQUESTS.push(novaReq); salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => { alert("Solicitação enviada!"); document.getElementById('modalRequestProfileChange').style.display='none'; e.target.reset(); }); } });
document.addEventListener('DOMContentLoaded', function() { configurarNavegacao(); });

console.log("LogiMaster v7.2 - Inicialização Otimizada (Lazy Load)");