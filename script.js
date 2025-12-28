// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 7.3 (FIX FINAL TELA BRANCA & SUPER ADMIN)
// PARTE 1: VARIÁVEIS GLOBAIS, TRATAMENTO DE ERRO E CAMADA DE DADOS
// =============================================================================

// --- MONITOR DE ERROS GLOBAL (PARA DIAGNÓSTICO) ---
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Erro Global Detectado:", message, "Linha:", lineno);
    // Se o sistema estiver travado, tenta liberar o corpo da página
    document.body.style.display = 'flex';
};

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

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 
window._mensagemAtualId = null; 
window._intervaloMonitoramento = null; 
window._cnhAlertasVerificados = false;
window.DADOS_LICENCA = null; 

// 3. CACHE LOCAL (Inicialização segura)
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
    if (valor === undefined || valor === null || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    try {
        var partes = dataIso.split('T')[0].split('-');
        if (partes.length >= 3) {
            return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
        }
    } catch (e) { return dataIso; }
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

function sanitizarObjetoParaFirebase(obj) {
    // Remove undefined para evitar erro no Firestore
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
        console.warn("Aviso: Cache local vazio ou inválido para " + chave);
        return valorPadrao;
    }
}

// Carrega dados do LocalStorage IMEDIATAMENTE para evitar tela branca
function carregarTodosDadosLocais() {
    console.log("Inicializando cache local...");
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
    try {
        // 1. Atualiza memória
        atualizarCacheCallback(dados);
        
        // 2. Atualiza LocalStorage
        localStorage.setItem(chave, JSON.stringify(dados));
        
        // 3. Atualiza Firebase (Silencioso se falhar)
        if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
            const { db, doc, setDoc } = window.dbRef;
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            // Usa setDoc com merge:true para segurança
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos, { merge: true });
        }
    } catch (erro) {
        console.error("Erro ao salvar dados (" + chave + "):", erro);
        // Não lançamos o erro para não travar a UI do usuário
    }
}

// Wrappers de Salvamento
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
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
}

// Buscas Rápidas (Helpers com proteção contra undefined)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
function buscarReciboPorId(id) { return CACHE_RECIBOS.find(r => String(r.id) === String(id)); }

// Inicialização imediata do cache ao carregar o arquivo
carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS FINANCEIROS E GRÁFICOS (BLINDADO)
// =============================================================================

// -----------------------------------------------------------------------------
// 6. CÁLCULOS FINANCEIROS, ALERTAS CNH E ATUALIZAÇÃO DO DASHBOARD (HOME)
// -----------------------------------------------------------------------------

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
                try {
                    var dataValidade = new Date(func.validadeCNH + 'T00:00:00'); 
                    var diffTime = dataValidade - hoje;
                    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                    if (diffDays === 30) {
                        alert("⚠️ ATENÇÃO CNH ⚠️\n\nA habilitação de " + func.nome + " vence em exatos 30 DIAS (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nProvidencie a renovação.");
                    } else if (diffDays === 1) {
                        alert("🚨 URGENTE CNH 🚨\n\nA habilitação de " + func.nome + " vence AMANHÃ (" + formatarDataParaBrasileiro(func.validadeCNH) + ").\nSolicite a alteração da data de vencimento do novo documento imediatamente.");
                    }
                } catch(e) { console.warn("Data CNH inválida para " + func.nome); }
            }
        }
    });

    window._cnhAlertasVerificados = true;
}

window.atualizarDashboard = function() {
    console.log("Calculando Dashboard...");
    
    // Verifica CNH apenas uma vez
    verificarAlertasCNH();

    // --- STATUS DA LICENÇA (SAFE MODE) ---
    var headerDash = document.querySelector('#home h2');
    if (headerDash) {
        var oldBadge = document.getElementById('badgeLicencaInfo');
        if (oldBadge) oldBadge.remove();

        // Só exibe badge se houver dados de licença carregados
        if (window.DADOS_LICENCA) {
            var spanLicenca = document.createElement('span');
            spanLicenca.id = 'badgeLicencaInfo';
            spanLicenca.style.cssText = "font-size:0.7rem; margin-left:15px; padding:4px 8px; border-radius:12px; vertical-align:middle; font-weight:bold;";

            if (window.DADOS_LICENCA.vitalicio) {
                spanLicenca.textContent = "VITALÍCIO";
                spanLicenca.style.backgroundColor = "#f3e5f5"; 
                spanLicenca.style.color = "#7b1fa2";
                spanLicenca.style.border = "1px solid #e1bee7";
            } else if (window.DADOS_LICENCA.validade) {
                try {
                    var dtVal = new Date(window.DADOS_LICENCA.validade);
                    var hojeC = new Date();
                    var diasRest = Math.ceil((dtVal - hojeC) / (1000 * 60 * 60 * 24));
                    
                    if (diasRest < 0) {
                        spanLicenca.textContent = "EXPIRADO";
                        spanLicenca.style.backgroundColor = "#ffebee";
                        spanLicenca.style.color = "#c62828";
                    } else {
                        spanLicenca.textContent = "CRÉDITO: " + diasRest + " DIAS";
                        spanLicenca.style.backgroundColor = diasRest <= 5 ? "#fff3e0" : "#e8f5e9";
                        spanLicenca.style.color = diasRest <= 5 ? "#e65100" : "#2e7d32";
                    }
                } catch(e) {
                    spanLicenca.textContent = "ERRO DATA";
                }
            }
            headerDash.appendChild(spanLicenca);
        }
    }

    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // --- LOOP SEGURO OPERAÇÕES ---
    if (CACHE_OPERACOES && Array.isArray(CACHE_OPERACOES)) {
        CACHE_OPERACOES.forEach(function(op) {
            if (!op || op.status === 'CANCELADA') return;
            
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

            // Verifica Data
            if (op.data) {
                try {
                    var dataOp = new Date(op.data + 'T12:00:00'); 
                    if (!isNaN(dataOp.getTime()) && dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
                        faturamentoMes += valorFat;
                        custosMes += custoOp;
                    }
                } catch (e) { /* Ignora data inválida */ }
            }
        });
    }

    // --- LOOP SEGURO DESPESAS ---
    if (CACHE_DESPESAS && Array.isArray(CACHE_DESPESAS)) {
        CACHE_DESPESAS.forEach(function(desp) {
            if (desp && desp.data) {
                try {
                    var dataDesp = new Date(desp.data + 'T12:00:00');
                    if (!isNaN(dataDesp.getTime()) && dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                        custosMes += (Number(desp.valor) || 0);
                    }
                } catch(e) {}
            }
        });
    }

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza DOM (Apenas se elementos existirem)
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico'); // Pode não existir no HTML atual
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(custosMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    // Chama gráfico com proteção
    try {
        atualizarGraficoPrincipal(mesAtual, anoAtual);
    } catch(e) {
        console.warn("Erro ao atualizar gráfico (ignorado):", e);
    }
};

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (CHART.JS)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; // Se não estiver na tela, sai silenciosamente

    // Verifica se Chart.js carregou
    if (typeof Chart === 'undefined') return;

    var elSelect = document.getElementById('filtroVeiculoGrafico');
    var filtroVeiculo = elSelect ? elSelect.value : "";

    // Remove resumo anterior
    var existingSummary = document.getElementById('chartVehicleSummary');
    if (existingSummary) existingSummary.remove();

    var kmMes = 0;
    var litrosTotal = 0;
    
    var receitaGrafico = 0;
    var combustivelGrafico = 0;
    var pessoalGrafico = 0; 
    var manutencaoGeralGrafico = 0; 

    // Compilação Segura
    if (CACHE_OPERACOES) {
        CACHE_OPERACOES.forEach(op => {
            if (!op || (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo)) return;
            if (op.status === 'CANCELADA' || !op.data) return;

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
                    if (op.ajudantes && Array.isArray(op.ajudantes)) {
                        op.ajudantes.forEach(aj => {
                            var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                            if (!faltou) pessoalGrafico += (Number(aj.diaria)||0);
                        });
                    }
                    manutencaoGeralGrafico += Number(op.despesas || 0);
                }
            }
        });
    }

    if (CACHE_DESPESAS) {
        CACHE_DESPESAS.forEach(d => {
            if (!d || (filtroVeiculo && d.veiculoPlaca !== filtroVeiculo)) return;
            if (!d.data) return;

            var dt = new Date(d.data + 'T12:00:00');
            if (dt.getMonth() === mes && dt.getFullYear() === ano) {
                manutencaoGeralGrafico += Number(d.valor || 0);
            }
        });
    }

    var lucroGrafico = receitaGrafico - (combustivelGrafico + pessoalGrafico + manutencaoGeralGrafico);
    var media = (litrosTotal > 0) ? (kmMes / litrosTotal) : 0;

    // HTML Resumo
    var summaryDiv = document.createElement('div');
    summaryDiv.id = 'chartVehicleSummary';
    summaryDiv.style.cssText = 'margin-bottom:15px; padding:15px; background:#e3f2fd; border:1px solid #90caf9; border-radius:8px; display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; font-size:0.9rem; align-items:center;';

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
        
        // Filtra operações do dia (com proteção)
        var opsDoDia = [];
        if (CACHE_OPERACOES) {
            opsDoDia = CACHE_OPERACOES.filter(o => o && o.data === dateStr && o.status !== 'CANCELADA');
        }
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            var temEmAndamento = opsDoDia.some(o => o.status === 'EM_ANDAMENTO');
            var temPendente = opsDoDia.some(o => o.status === 'AGENDADA');
            var dotColor = temEmAndamento ? 'orange' : (temPendente ? '#999' : 'green');

            cellContent += `<div class="event-dot" style="background:${dotColor}"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // Closure segura para o clique
            cell.onclick = (function(ds) { return function() { abrirModalDetalhesDia(ds); }; })(dateStr);
        } else {
            cell.onclick = (function(ds) {
                return function() { 
                    var inputData = document.getElementById('operacaoData');
                    if(inputData) {
                        inputData.value = ds;
                        var btnOperacoes = document.querySelector('[data-page="operacoes"]');
                        if(btnOperacoes) btnOperacoes.click();
                    }
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
// CÁLCULOS GLOBAIS SEGUROS
// =============================================================================

window.calcularMediaGlobalVeiculo = function(placa) {
    if (!CACHE_OPERACOES) return 0;
    var ops = CACHE_OPERACOES.filter(function(op) {
        return op && op.veiculoPlaca === placa && (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA');
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
    if (!CACHE_OPERACOES) return 0;
    var ops = CACHE_OPERACOES.filter(o => o && o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-10); // Pega as 10 últimas
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

// =============================================================================
// MODAL DE DETALHES DO DIA
// =============================================================================

window.abrirModalDetalhesDia = function(dataString) {
    var operacoesDoDia = CACHE_OPERACOES.filter(function(op) {
        return op && op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    if (modalTitle) modalTitle.textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);

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
        if(op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                if(f) nomesAjudantes.push(f.nome.split(' ')[0]);
            });
        }
        
        var stringEquipe = (op.checkins && op.checkins.faltaMotorista) 
            ? `<strong style="color:red;">MOT: FALTA</strong>` 
            : `<strong>Mot:</strong> ${nomeMot}`;
            
        if(nomesAjudantes.length > 0) stringEquipe += `<br><strong>Ajud:</strong> ${nomesAjudantes.join(', ')}`;
        
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        var receita = Number(op.faturamento) || 0;
        
        var custoPessoal = 0;
        if (!op.checkins || !op.checkins.faltaMotorista) custoPessoal = Number(op.comissao) || 0;
        
        if(op.ajudantes) {
            op.ajudantes.forEach(aj => {
                 var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                 if(!faltou) custoPessoal += (Number(aj.diaria)||0);
            });
        }

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
                    <small>#${(op.id||'').toString().substr(-4)}</small>
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
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E DESPESAS GERAIS (BLINDADO)
// =============================================================================

// -----------------------------------------------------------------------------
// 9. GESTÃO DE FUNCIONÁRIOS (MOTORISTAS / AJUDANTES / ADMIN)
// -----------------------------------------------------------------------------

window.toggleDriverFields = function() {
    var select = document.getElementById('funcFuncao');
    var divDriver = document.getElementById('driverSpecificFields');
    if (select && divDriver) {
        divDriver.style.display = (select.value === 'motorista') ? 'block' : 'none';
    }
};

// Form Funcionário (Criação/Edição)
var formFunc = document.getElementById('formFuncionario');
if (formFunc) {
    formFunc.addEventListener('submit', async function(e) {
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

            // Campos Motorista
            var cnh = document.getElementById('funcCNH').value;
            var validadeCNH = document.getElementById('funcValidadeCNH').value;
            var categoriaCNH = document.getElementById('funcCategoriaCNH').value;
            var cursos = document.getElementById('funcCursoDescricao').value;

            if (!nome || !email) throw new Error("Preencha nome e e-mail.");

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
                cursoDescricao: cursos,
                dataCadastro: new Date().toISOString()
            };

            if (id) {
                // EDIÇÃO
                var index = CACHE_FUNCIONARIOS.findIndex(f => String(f.id) === String(id));
                if (index >= 0) {
                    novoFunc.dataCadastro = CACHE_FUNCIONARIOS[index].dataCadastro; // Mantém data original
                    // Mantém senhaVisual antiga se não foi alterada agora
                    if(!senha && CACHE_FUNCIONARIOS[index].senhaVisual) {
                        novoFunc.senhaVisual = CACHE_FUNCIONARIOS[index].senhaVisual;
                    } else if (senha) {
                        novoFunc.senhaVisual = senha;
                    }
                    CACHE_FUNCIONARIOS[index] = novoFunc;
                }
            } else {
                // CRIAÇÃO
                if (!senha) throw new Error("Senha obrigatória para novos usuários.");
                var existe = CACHE_FUNCIONARIOS.find(f => f.email === email);
                if (existe) throw new Error("E-mail já cadastrado.");

                // Tenta criar no Auth
                if (window.dbRef && window.dbRef.criarAuthUsuario) {
                    try {
                        const uid = await window.dbRef.criarAuthUsuario(email, senha);
                        novoFunc.id = uid; // Usa o UID real do Auth como ID
                        
                        // Cria documento de permissão 'users'
                        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                            uid: uid,
                            name: nome,
                            email: email,
                            role: funcao,
                            company: window.USUARIO_ATUAL.company,
                            approved: true,
                            createdAt: new Date().toISOString(),
                            senhaVisual: senha
                        });
                    } catch (errAuth) {
                        console.error("Erro Auth:", errAuth);
                        alert("Aviso: Cadastro salvo localmente, mas houve erro ao criar o Login.\n" + errAuth.message);
                        // Continua salvando no banco da empresa mesmo com erro no Auth
                    }
                }
                if(senha) novoFunc.senhaVisual = senha;
                CACHE_FUNCIONARIOS.push(novoFunc);
            }

            await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
            
            alert("Funcionário salvo!");
            formFunc.reset();
            document.getElementById('funcionarioId').value = '';
            renderizarTabelaFuncionarios();

        } catch (erro) {
            alert("Erro: " + erro.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    });
}

window.renderizarTabelaFuncionarios = function() {
    var tbody = document.querySelector('#tabelaFuncionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!CACHE_FUNCIONARIOS || CACHE_FUNCIONARIOS.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        return;
    }

    CACHE_FUNCIONARIOS.forEach(function(f) {
        var tr = document.createElement('tr');
        var labelFuncao = f.funcao ? f.funcao.toUpperCase() : '-';
        
        // Alerta CNH
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
    document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';

    toggleDriverFields();
    // Scroll suave até o form
    var tabs = document.querySelector('.cadastro-tabs');
    if(tabs) tabs.scrollIntoView({ behavior: 'smooth' });
};

window.excluirFuncionario = async function(id) {
    if (confirm("Excluir funcionário? O histórico financeiro será mantido, mas o acesso será revogado.")) {
        // Remove da lista local
        CACHE_FUNCIONARIOS = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        
        // Tenta remover login global se possível
        if (window.dbRef) {
            try {
                // Remove o doc de permissão 'users' para bloquear login imediatamente
                await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id));
            } catch(e) { console.warn("Aviso: Login global não pôde ser removido (talvez já não exista)."); }
        }
        
        renderizarTabelaFuncionarios();
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
        
        if (CACHE_FUNCIONARIOS) {
            CACHE_FUNCIONARIOS.forEach(f => {
                // Filtra por função dependendo do select
                if (id === 'selectMotoristaOperacao' && f.funcao !== 'motorista') return;
                if (id === 'selectAjudantesOperacao' && f.funcao !== 'ajudante') return;
                
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                sel.appendChild(opt);
            });
        }
        
        if(valorAtual) sel.value = valorAtual;
    });
}

// -----------------------------------------------------------------------------
// 10. GESTÃO DE VEÍCULOS
// -----------------------------------------------------------------------------

var formVeic = document.getElementById('formVeiculo');
if (formVeic) {
    formVeic.addEventListener('submit', function(e) {
        e.preventDefault();
        var placa = document.getElementById('veiculoPlaca').value.trim().toUpperCase();
        var modelo = document.getElementById('veiculoModelo').value.trim().toUpperCase();
        
        if (!placa || !modelo) return alert("Preencha placa e modelo.");

        var existenteIndex = CACHE_VEICULOS.findIndex(v => v.placa === placa);
        var veiculoObj = {
            placa: placa,
            modelo: modelo,
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value
        };

        if (existenteIndex >= 0) {
            if (!confirm("Veículo já existe. Atualizar?")) return;
            CACHE_VEICULOS[existenteIndex] = veiculoObj;
        } else {
            CACHE_VEICULOS.push(veiculoObj);
        }

        salvarListaVeiculos(CACHE_VEICULOS).then(() => {
            alert("Veículo salvo.");
            formVeic.reset();
            document.getElementById('veiculoPlaca').readOnly = false;
            renderizarTabelaVeiculos();
        });
    });
}

window.renderizarTabelaVeiculos = function() {
    var tbody = document.querySelector('#tabelaVeiculos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!CACHE_VEICULOS || CACHE_VEICULOS.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum veículo cadastrado.</td></tr>';
        return;
    }

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
        if(val) sel.value = val;
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

var formCli = document.getElementById('formContratante');
if (formCli) {
    formCli.addEventListener('submit', function(e) {
        e.preventDefault();
        var razao = document.getElementById('contratanteRazaoSocial').value.trim().toUpperCase();
        var cnpj = document.getElementById('contratanteCNPJ').value.trim().replace(/\D/g,'');
        
        if (!razao || !cnpj) return alert("Preencha Razão Social e CNPJ.");

        var index = CACHE_CONTRATANTES.findIndex(c => c.cnpj === cnpj);
        var cliente = { 
            razaoSocial: razao, 
            cnpj: cnpj, 
            telefone: document.getElementById('contratanteTelefone').value 
        };

        if (index >= 0) {
            if (!confirm("CNPJ já existe. Atualizar?")) return;
            CACHE_CONTRATANTES[index] = cliente;
        } else {
            CACHE_CONTRATANTES.push(cliente);
        }

        salvarListaContratantes(CACHE_CONTRATANTES).then(() => {
            alert("Cliente salvo.");
            formCli.reset();
            document.getElementById('contratanteCNPJ').readOnly = false;
            renderizarTabelaContratantes();
        });
    });
}

window.renderizarTabelaContratantes = function() {
    var tbody = document.querySelector('#tabelaContratantes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!CACHE_CONTRATANTES || CACHE_CONTRATANTES.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

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
        if(val) sel.value = val;
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
// 12. GESTÃO DE ATIVIDADES
// -----------------------------------------------------------------------------

var formAtiv = document.getElementById('formAtividade');
if (formAtiv) {
    formAtiv.addEventListener('submit', function(e) {
        e.preventDefault();
        var id = document.getElementById('atividadeId').value;
        var nome = document.getElementById('atividadeNome').value.trim().toUpperCase();
        
        if(!nome) return;

        if(id) {
            var idx = CACHE_ATIVIDADES.findIndex(a => String(a.id) === String(id));
            if(idx >= 0) CACHE_ATIVIDADES[idx].nome = nome;
        } else {
            CACHE_ATIVIDADES.push({ id: Date.now().toString(), nome: nome });
        }

        salvarListaAtividades(CACHE_ATIVIDADES).then(() => {
            formAtiv.reset();
            document.getElementById('atividadeId').value = '';
            renderizarTabelaAtividades();
        });
    });
}

window.renderizarTabelaAtividades = function() {
    var tbody = document.querySelector('#tabelaAtividades tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!CACHE_ATIVIDADES || CACHE_ATIVIDADES.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum serviço cadastrado.</td></tr>';
        return;
    }

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
            opt.value = a.nome; // Usa nome como valor, compatibilidade com legado
            opt.textContent = a.nome;
            sel.appendChild(opt);
        });
        if(val) sel.value = val;
    });
};

window.excluirAtividade = function(id) {
    if(confirm("Excluir serviço?")) {
        CACHE_ATIVIDADES = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id));
        salvarListaAtividades(CACHE_ATIVIDADES).then(() => renderizarTabelaAtividades());
    }
};

// -----------------------------------------------------------------------------
// 13. GESTÃO DE DESPESAS GERAIS
// -----------------------------------------------------------------------------

window.toggleDespesaParcelas = function() {
    var modo = document.getElementById('despesaModoPagamento').value;
    var div = document.getElementById('divDespesaParcelas');
    if(div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
};

var formDesp = document.getElementById('formDespesaGeral');
if (formDesp) {
    formDesp.addEventListener('submit', function(e) {
        e.preventDefault();
        var data = document.getElementById('despesaGeralData').value;
        var desc = document.getElementById('despesaGeralDescricao').value.trim().toUpperCase();
        var valor = parseFloat(document.getElementById('despesaGeralValor').value);
        
        if (!data || !desc || isNaN(valor)) return alert("Preencha data, descrição e valor.");

        var novaDespesa = {
            id: Date.now().toString(),
            data: data,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: desc,
            valor: valor,
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelas: parseInt(document.getElementById('despesaParcelas').value) || 1,
            parcelasPagas: parseInt(document.getElementById('despesaParcelasPagas').value) || 0
        };

        CACHE_DESPESAS.push(novaDespesa);
        salvarListaDespesas(CACHE_DESPESAS).then(() => {
            alert("Despesa lançada.");
            formDesp.reset();
            renderizarTabelaDespesasGerais();
            // Atualiza dashboard para refletir o custo novo
            if(window.atualizarDashboard) window.atualizarDashboard(); 
        });
    });
}

window.renderizarTabelaDespesasGerais = function() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!CACHE_DESPESAS || CACHE_DESPESAS.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    var listaOrdenada = [].concat(CACHE_DESPESAS).sort((a,b) => {
        try { return new Date(b.data) - new Date(a.data); } catch(e){ return 0; }
    });

    listaOrdenada.forEach(function(d) {
        var tr = document.createElement('tr');
        var infoPag = (d.formaPagamento || '').toUpperCase();
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
    if (confirm("Remover despesa?")) {
        CACHE_DESPESAS = CACHE_DESPESAS.filter(d => String(d.id) !== String(id));
        salvarListaDespesas(CACHE_DESPESAS).then(() => {
            renderizarTabelaDespesasGerais();
            if(window.atualizarDashboard) window.atualizarDashboard();
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
    var jaExiste = window._operacaoAjudantesTempList.find(a => String(a.id) === String(idAjudante));
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
var btnAddAj = document.getElementById('btnManualAddAjudante');
if (btnAddAj) {
    btnAddAj.addEventListener('click', function() {
        var select = document.getElementById('selectAjudantesOperacao');
        var id = select.value;
        if(id) {
            adicionarAjudanteNaLista(id);
            select.value = ""; // Limpa seleção
        }
    });
}

window.removerAjudanteDaLista = function(idAjudante) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(a => String(a.id) !== String(idAjudante));
    renderizarListaAjudantesTemp();
};

function renderizarListaAjudantesTemp() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    ul.innerHTML = '';

    window._operacaoAjudantesTempList.forEach(aj => {
        var li = document.createElement('li');
        li.style.cssText = 'background:#e0f2f1; padding:5px 10px; border-radius:4px; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;';
        
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
var formOp = document.getElementById('formOperacao');
if (formOp) {
    formOp.addEventListener('submit', function(e) {
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
        
        // Se edição, mantém status atual se já iniciou
        if (id) {
            var opAntiga = CACHE_OPERACOES.find(o => String(o.id) === String(id));
            if (opAntiga) {
                if (opAntiga.status !== 'AGENDADA' && opAntiga.status !== 'CONFIRMADA') {
                    statusInicial = opAntiga.status; 
                } else {
                    // Permite mudar de Agendada para Confirmada via checkbox
                    statusInicial = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
                }
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
            ajudantes: window._operacaoAjudantesTempList,
            status: statusInicial,
            kmRodado: kmRodado,
            combustivel: combustivel,
            precoLitro: precoLitro,
            despesas: despesas,
            checkins: checkinsExistentes || {} 
        };

        if (id) {
            var idx = CACHE_OPERACOES.findIndex(o => String(o.id) === String(id));
            if (idx >= 0) CACHE_OPERACOES[idx] = novaOp;
        } else {
            CACHE_OPERACOES.push(novaOp);
        }

        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Operação salva com sucesso!");
            formOp.reset();
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = []; 
            renderizarListaAjudantesTemp();
            
            // Atualiza visualizações
            renderizarTabelaOperacoes();
            if(window.renderizarCalendario) renderizarCalendario(); 
            if(window.atualizarDashboard) atualizarDashboard(); 
            if(window.renderizarTabelaCheckinsPendentes) renderizarTabelaCheckinsPendentes();
        });
    });
}

window.renderizarTabelaOperacoes = function() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!CACHE_OPERACOES || CACHE_OPERACOES.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#777;">Nenhuma operação registrada.</td></tr>';
        return;
    }

    // Ordenação Segura
    var lista = [].concat(CACHE_OPERACOES).sort((a,b) => {
        try {
            var dA = a.data ? new Date(a.data) : new Date(0);
            var dB = b.data ? new Date(b.data) : new Date(0);
            return dB - dA;
        } catch(e) { return 0; }
    });

    // Paginação simples (últimos 50)
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
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
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

    window._operacaoAjudantesTempList = op.ajudantes ? JSON.parse(JSON.stringify(op.ajudantes)) : [];
    renderizarListaAjudantesTemp();

    var section = document.getElementById('operacoes');
    if(section) {
        // Simula navegação para garantir visibilidade
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        section.classList.add('active');
        section.scrollIntoView({ behavior: 'smooth' });
    }
};

window.cancelarOperacao = function(id) {
    if (confirm("Deseja realmente CANCELAR esta viagem?")) {
        var idx = CACHE_OPERACOES.findIndex(o => String(o.id) === String(id));
        if (idx >= 0) {
            CACHE_OPERACOES[idx].status = 'CANCELADA';
            salvarListaOperacoes(CACHE_OPERACOES).then(() => {
                renderizarTabelaOperacoes();
                if(window.atualizarDashboard) atualizarDashboard();
            });
        }
    }
};

window.duplicarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;
    
    if(confirm("Duplicar esta viagem para uma nova data?")) {
        editarOperacao(id);
        document.getElementById('operacaoId').value = ''; // Limpa ID
        document.getElementById('operacaoData').focus(); 
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

    if (!CACHE_OPERACOES) {
        tbody.innerHTML = '<tr><td colspan="5">Sem dados.</td></tr>';
        return;
    }

    var hojeStr = new Date().toISOString().split('T')[0];
    
    var listaMonitoramento = CACHE_OPERACOES.filter(op => {
        if (!op) return false;
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
        
        var statusMot = '<span style="color:#999;"><i class="fas fa-clock"></i> Aguardando...</span>';
        if (op.checkins && op.checkins.motorista) {
            statusMot = `<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> ${op.checkins.motorista.hora}</span>`;
        } else if (op.checkins && op.checkins.faltaMotorista) {
            statusMot = `<span style="color:red; font-weight:bold;">FALTA</span>`;
        }

        var htmlEquipe = `<div><strong>Mot:</strong> ${mot ? mot.nome.split(' ')[0] : '---'} - ${statusMot}</div>`;

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
    var idx = CACHE_OPERACOES.findIndex(o => String(o.id) === String(id));
    if (idx >= 0) {
        CACHE_OPERACOES[idx].status = 'EM_ANDAMENTO';
        if(!CACHE_OPERACOES[idx].checkins) CACHE_OPERACOES[idx].checkins = {};
        if(!CACHE_OPERACOES[idx].checkins.inicioRota) CACHE_OPERACOES[idx].checkins.inicioRota = new Date().toISOString();
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            renderizarTabelaCheckinsPendentes();
            if(window.renderizarCalendario) renderizarCalendario();
        });
    }
};

window.finalizarViagemManual = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(!op) return;
    
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
        if(window.renderizarCalendario) renderizarCalendario();
        if(window.atualizarDashboard) atualizarDashboard();
        renderizarTabelaOperacoes();
    });
};

window.abrirModalFalta = function(opId) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
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
        var btn = document.querySelector('button[onclick*="sincronizar"]');
        if(btn) btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> SINCRONIZANDO...';
        
        setTimeout(() => {
            // Se a função carregar existir (parte 5), usa ela
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
    if(resultsDiv) resultsDiv.style.display = 'block';
    
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

    if (CACHE_OPERACOES) {
        CACHE_OPERACOES.forEach(op => {
            if (!op || op.status === 'CANCELADA') return;
            
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
    }

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

    if (!cliCnpj) { alert("Selecione um Cliente."); return; }
    
    var cliente = buscarContratantePorCnpj(cliCnpj);
    var nomeCli = cliente ? cliente.razaoSocial : 'CLIENTE';

    var container = document.getElementById('reportContent');
    document.getElementById('reportResults').style.display = 'block';

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
    if (CACHE_OPERACOES) {
        CACHE_OPERACOES.forEach(op => {
            if (!op || op.status === 'CANCELADA') return;
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
    }

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
    if (!element || element.innerText.trim() === '') return alert("Gere um relatório primeiro.");
    
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
// PARTE 5: NAVEGAÇÃO, SUPER ADMIN (HÍBRIDO) E INICIALIZAÇÃO "LAZY LOAD"
// =============================================================================

// -----------------------------------------------------------------------------
// 20. CONTROLADORES DE NAVEGAÇÃO E EVENTOS FINAIS
// -----------------------------------------------------------------------------

function configurarNavegacao() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            
            // Navegação Visual
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => { 
                p.classList.remove('active'); 
                p.style.display = 'none'; 
            });
            
            this.classList.add('active');
            var target = document.getElementById(pageId);
            if (target) { 
                target.style.display = 'block'; 
                // Pequeno delay para transição CSS
                setTimeout(() => target.classList.add('active'), 10); 
            }
            
            // Callbacks de carregamento por página
            if (pageId === 'home') { 
                if(window.renderizarCalendario) window.renderizarCalendario(); 
                if(window.atualizarDashboard) window.atualizarDashboard(); 
            }
            if (pageId === 'despesas') {
                if(window.renderizarTabelaDespesasGerais) window.renderizarTabelaDespesasGerais();
            }
            if (pageId === 'checkins-pendentes') {
                if(window.renderizarTabelaCheckinsPendentes) window.renderizarTabelaCheckinsPendentes();
                // Tenta atualizar nuvem em background
                sincronizarDadosDaNuvem(false); 
            }
            if (pageId === 'access-management') { 
                if(window.renderizarPainelEquipe) window.renderizarPainelEquipe(); 
                if(window.renderizarTabelaProfileRequests) window.renderizarTabelaProfileRequests(); 
            }
            if (pageId === 'super-admin') { 
                carregarPainelSuperAdmin(); 
            }
            
            // Lógica de Recibos (Admin vs Func)
            if (pageId === 'recibos') {
                var pAdmin = document.getElementById('adminRecibosPanel');
                var pEmp = document.getElementById('employeeRecibosPanel');
                
                if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin') {
                    if(pAdmin) pAdmin.style.display = 'block';
                    if(pEmp) pEmp.style.display = 'none';
                } else {
                    if(pAdmin) pAdmin.style.display = 'none';
                    if(pEmp) pEmp.style.display = 'block';
                }
                if(window.renderizarTabelasRecibos) window.renderizarTabelasRecibos();
            }

            if (pageId === 'meus-dados') { 
                carregarDadosMeuPerfil(window.USUARIO_ATUAL.email); 
            }
            
            // Mobile: Fecha menu
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                if(document.getElementById('sidebarOverlay')) document.getElementById('sidebarOverlay').classList.remove('active');
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
// SINCRONIZAÇÃO EM SEGUNDO PLANO (LAZY LOADING)
// -----------------------------------------------------------------------------

window.sincronizarDadosDaNuvem = async function(manual = false) {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;
    
    // Indicador visual
    var btn = document.querySelector('button[onclick*="sincronizar"]');
    if(manual && btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    
    const { db, doc, getDoc } = window.dbRef; 
    const company = window.USUARIO_ATUAL.company;

    const carregarColecao = async (chave, varCacheName, callback) => { 
        try { 
            const docRef = doc(db, 'companies', company, 'data', chave); 
            const snap = await getDoc(docRef); 
            if (snap.exists()) { 
                const data = snap.data();
                // Suporte legado: Array direto ou objeto {items:[]}
                const itens = (data.items !== undefined) ? data.items : (Array.isArray(data) ? data : []);
                
                // Atualiza cache
                localStorage.setItem(chave, JSON.stringify(itens)); 
                callback(itens); 
            }
        } catch (e) { 
            console.warn(`Sync ${chave} (vazio ou erro):`, e); 
        } 
    };
    
    // Dispara downloads em paralelo
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
    
    // Atualiza interface se necessário
    if(window.renderizarTabelaOperacoes) window.renderizarTabelaOperacoes();
    if(window.renderizarTabelaCheckinsPendentes) window.renderizarTabelaCheckinsPendentes();
    if(window.atualizarDashboard) window.atualizarDashboard();
    
    if(manual) { 
        alert("Sincronização concluída."); 
        if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR AGORA'; 
    }
};

function iniciarAutoSync() {
    if (window._intervaloMonitoramento) clearInterval(window._intervaloMonitoramento);
    window._intervaloMonitoramento = setInterval(() => {
        if(window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
            sincronizarDadosDaNuvem(false);
        }
    }, 45000); // 45 segundos para não sobrecarregar
}

// -----------------------------------------------------------------------------
// SUPER ADMIN: LISTAGEM HÍBRIDA (OFICIAL + LEGADO)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    if (!window.dbRef) return;
    const { db, collection, getDocs } = window.dbRef;
    const container = document.getElementById('superAdminContainer');
    
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Varrendo base de dados...</p>';

    try {
        // 1. Busca TUDO
        const [usersSnap, companiesSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "companies"))
        ]);
        
        // Mapeamento
        const empresasMap = {};
        
        // A. Empresas Oficiais (Já com licença)
        companiesSnap.forEach(doc => {
            const data = doc.data();
            empresasMap[doc.id] = {
                id: doc.id,
                licenca: data,
                admins: [],
                users: [],
                isLegacy: false
            };
        });

        // B. Empresas Legado (Inferidas pelos usuários)
        usersSnap.forEach(doc => {
            const u = doc.data();
            const empId = u.company || 'SEM_EMPRESA';
            
            if (!empresasMap[empId]) {
                // Se não existe licença, cria entrada Legacy
                empresasMap[empId] = {
                    id: empId,
                    licenca: null,
                    admins: [],
                    users: [],
                    isLegacy: true 
                };
            }
            
            if (u.role === 'admin') empresasMap[empId].admins.push(u);
            else empresasMap[empId].users.push(u);
        });

        container.innerHTML = '';
        const lista = Object.values(empresasMap).sort((a,b) => a.id.localeCompare(b.id));

        if (lista.length === 0) {
            container.innerHTML = '<p style="text-align:center;">Nenhum registro encontrado.</p>';
            return;
        }

        lista.forEach(emp => {
            // Filtro Search
            const termo = document.getElementById('superAdminSearch').value.toLowerCase();
            const donoEmail = emp.licenca ? emp.licenca.ownerEmail : (emp.admins[0]?.email || 'N/A');
            if (termo && !emp.id.toLowerCase().includes(termo) && !donoEmail.toLowerCase().includes(termo)) {
                return;
            }

            const div = document.createElement('div');
            div.className = 'company-block';
            
            // Status Visual
            let statusHtml = '', statusClass = '';
            if (emp.isLegacy) {
                statusHtml = 'LEGADO / SEM LICENÇA';
                statusClass = 'credit-expired';
            } else if (emp.licenca.vitalicio) {
                statusHtml = 'VITALÍCIO';
                statusClass = 'credit-lifetime';
            } else {
                const val = new Date(emp.licenca.validade);
                const dias = Math.ceil((val - new Date())/(1000*60*60*24));
                if(dias < 0) { statusHtml = 'EXPIRADO'; statusClass = 'credit-expired'; }
                else { statusHtml = `ATIVO (${dias} DIAS)`; statusClass = 'credit-active'; }
            }

            // Email do responsável
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
                    <div>${emp.admins.length} Adm / ${emp.users.length} Usr <i class="fas fa-chevron-down"></i></div>
                </div>
                <div class="company-content">
                    <div class="company-actions-bar">
                        <div class="validade-info">
                            ${emp.isLegacy ? 'Requer criação de licença' : (emp.licenca.vitalicio ? 'Acesso Vitalício' : 'Validade: ' + formatarDataParaBrasileiro(emp.licenca.validade))}
                        </div>
                        <button class="btn-mini btn-success" onclick="abrirModalCreditos('${emp.id}', '${ownerEmail}')">
                            <i class="fas fa-calendar-plus"></i> ${emp.isLegacy ? 'CRIAR LICENÇA' : 'GERENCIAR'}
                        </button>
                        <button class="btn-mini btn-danger" onclick="excluirEmpresaGlobal('${emp.id}')">
                            <i class="fas fa-trash"></i> EXCLUIR
                        </button>
                    </div>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9; font-size:0.85rem;">
                        <strong>Admins:</strong> ${emp.admins.map(a => a.name).join(', ') || '-'}<br>
                        <strong>Funcionários:</strong> ${emp.users.length}
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error("Erro Super Admin:", e);
        container.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar lista.</p>';
    }
};

window.filterGlobalUsers = function() {
    carregarPainelSuperAdmin(false);
};

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO DO SISTEMA (LAZY LOAD - CORREÇÃO TELA BRANCA)
// -----------------------------------------------------------------------------

window.initSystemByRole = function(user) {
    console.log("Inicializando:", user.email, user.role);
    window.USUARIO_ATUAL = user;
    
    configurarNavegacao();
    iniciarAutoSync();

    // 1. SUPER ADMIN
    if (user.email === 'admin@logimaster.com') { 
        document.getElementById('menu-admin').style.display = 'none'; 
        document.getElementById('menu-employee').style.display = 'none'; 
        document.getElementById('menu-super-admin').style.display = 'block'; 
        
        // Simula clique
        var btnSuper = document.querySelector('[data-page="super-admin"]');
        if(btnSuper) btnSuper.click(); 
        return; 
    }
    
    // 2. ADMIN / MOTORISTA
    // Mostra a tela IMEDIATAMENTE usando dados locais
    carregarTodosDadosLocais(); 
    
    // Preenche selects para evitar campos vazios
    if(window.preencherTodosSelects) window.preencherTodosSelects();

    if (user.role === 'admin') { 
        document.getElementById('menu-admin').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = false; 
        
        var btnHome = document.querySelector('[data-page="home"]'); 
        if(btnHome) btnHome.click(); 
        
    } else { 
        document.getElementById('menu-employee').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = true; 
        
        var btnHomeEmp = document.querySelector('[data-page="employee-home"]'); 
        if(btnHomeEmp) btnHomeEmp.click(); 
    }
    
    // 3. BACKGROUND SYNC (Não bloqueia a tela)
    setTimeout(() => {
        console.log("Iniciando sync em background...");
        // Tenta baixar licença e dados
        if(window.dbRef && user.company) {
            const { db, doc, getDoc } = window.dbRef;
            getDoc(doc(db, "companies", user.company)).then(snap => {
                if(snap.exists()) {
                    window.DADOS_LICENCA = snap.data();
                    if(window.atualizarDashboard) window.atualizarDashboard();
                }
            }).catch(e => console.warn("Licença Legacy:", e));
            
            // Baixa dados operacionais
            sincronizarDadosDaNuvem(false);
        }
    }, 500);
};

// Funções de Modal e Dados Pessoais
document.getElementById('mobileMenuBtn').onclick = function() { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebarOverlay').classList.add('active'); };
if(document.getElementById('sidebarOverlay')) document.getElementById('sidebarOverlay').onclick = function() { document.getElementById('sidebar').classList.remove('active'); this.classList.remove('active'); };

function carregarDadosMeuPerfil(email) {
    var f = CACHE_FUNCIONARIOS.find(x => x.email && x.email.trim().toLowerCase() === email.trim().toLowerCase());
    var div = document.getElementById('meus-dados');
    if (f) {
        div.innerHTML = `<h2>MEUS DADOS</h2><div class="card"><h3>${f.nome} <span class="status-pill pill-active">${f.funcao}</span></h3><p><strong>CPF:</strong> ${f.documento}</p><p><strong>Tel:</strong> ${formatarTelefoneBrasil(f.telefone)}</p><p><strong>Pix:</strong> ${f.pix || '-'}</p><button class="btn-warning" onclick="document.getElementById('modalRequestProfileChange').style.display='block'" style="margin-top:15px;">SOLICITAR ALTERAÇÃO</button></div>`;
    } else { div.innerHTML = '<p>Dados não encontrados ou incompletos.</p>'; }
}

// Listeners finais
document.addEventListener('submit', async function(e) { if (e.target.id === 'formCreateCompany') { /* Tratado no listener anterior */ } });
document.addEventListener('submit', async function(e) { 
    if (e.target.id === 'formRequestProfileChange') { 
        e.preventDefault(); 
        var tipo = document.getElementById('reqFieldType').value; 
        var novoValor = document.getElementById('reqNewValue').value; 
        if (!window.USUARIO_ATUAL) return; 
        var novaReq = { id: Date.now().toString(), data: new Date().toISOString(), funcionarioEmail: window.USUARIO_ATUAL.email, campo: tipo, valorNovo: novoValor, status: 'PENDENTE' }; 
        CACHE_PROFILE_REQUESTS.push(novaReq); 
        if(window.salvarProfileRequests) window.salvarProfileRequests(CACHE_PROFILE_REQUESTS);
        alert("Solicitação enviada!"); 
        document.getElementById('modalRequestProfileChange').style.display='none'; 
        e.target.reset(); 
    } 
});

document.addEventListener('DOMContentLoaded', function() { configurarNavegacao(); });

console.log("Sistema LogiMaster v7.3 (Blindado) Iniciado.");