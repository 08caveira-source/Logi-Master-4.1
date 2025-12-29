// =============================================================================
// ARQUIVO: script.js - PARTE 1/4
// SISTEMA LOGIMASTER - CORE, VARIÁVEIS E DADOS
// =============================================================================

// 1. CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// E-MAILS DOS SUPER ADMINISTRADORES (MASTER)
const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com"];

// 2. VARIÁVEIS GLOBAIS DE ESTADO (CONTROLE DE TELA)
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); // Data usada no calendário
window.chartInstance = null; // Instância do Gráfico Chart.js
window._operacaoAjudantesTempList = []; // Lista temporária de ajudantes na operação
window._mensagemAtualId = null; 
window._intervaloMonitoramento = null; 

// VARIÁVEIS DO SISTEMA DE CRÉDITOS E BLOQUEIO
window.SYSTEM_STATUS = {
    validade: null, // Data ISO
    isVitalicio: false,
    bloqueado: false
};

// 3. CACHE LOCAL (ARRAY NA MEMÓRIA RAM PARA VELOCIDADE)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// 4. FUNÇÕES UTILITÁRIAS (FORMATAÇÃO E AJUDA)

// Formata número para Moeda Brasileira (R$)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Converte data YYYY-MM-DD para DD/MM/YYYY
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    var partes = dataIso.split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

// Máscara de Telefone simples
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// 5. CAMADA DE PERSISTÊNCIA (LOCALSTORAGE + FIREBASE)

// Remove campos 'undefined' pois o Firebase não aceita
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

// Carrega do LocalStorage (Executado ao abrir a página)
function carregarDadosGenerico(chave, variavelCache, valorPadrao) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : valorPadrao;
    } catch (erro) {
        console.error("Erro ao carregar do cache local: " + chave, erro);
        return valorPadrao;
    }
}

// Função Principal de Carregamento
function carregarTodosDadosLocais() {
    console.log("Inicializando: Carregando dados locais...");
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

// Salva dados no LocalStorage e Sincroniza com Firebase (Se logado)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza a memória (Cache)
    atualizarCacheCallback(dados);
    
    // 2. Salva no navegador (LocalStorage) para acesso offline rápido
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 3. Sincroniza com a Nuvem (Firebase Firestore)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Verifica se a empresa está bloqueada (exceto se for o Super Admin fazendo manutenção)
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
             console.warn("Salvamento na nuvem bloqueado: Sistema sem créditos ou vencido.");
             return;
        }

        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            // Salva dentro da coleção da empresa específica
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
            console.log("Dados sincronizados com a nuvem: " + chave);
        } catch (erro) {
            console.error("Erro crítico ao salvar no Firebase (" + chave + "):", erro);
            // Não exibimos alerta ao usuário para não interromper o fluxo, mas logamos o erro.
        }
    }
}

// Funções específicas de salvamento para cada tipo de dado
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }

// Salva solicitações de alteração de perfil e atualiza a tabela se visível
async function salvarProfileRequests(lista) { 
    await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); 
    if(document.getElementById('tabelaProfileRequests')) renderizarTabelaProfileRequests();
}

// Funções de Busca Rápida (Helpers)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
function buscarReciboPorId(id) { return CACHE_RECIBOS.find(r => String(r.id) === String(id)); }

// Inicializa o carregamento assim que o script é lido
carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js - PARTE 2/4
// DASHBOARD, GRÁFICOS E CALENDÁRIO
// =============================================================================

// Função para ocultar/mostrar valores sensíveis (Olho Mágico)
window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    if (targets.length === 0) return;

    // Verifica o estado atual baseado no primeiro elemento
    const isBlurred = targets[0].classList.contains('privacy-blur');

    targets.forEach(el => {
        if (isBlurred) {
            el.classList.remove('privacy-blur');
        } else {
            el.classList.add('privacy-blur');
        }
    });

    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

// ATUALIZAÇÃO DO DASHBOARD (Cards Coloridos + Gráfico)
window.atualizarDashboard = function() {
    // PROTEÇÃO: Se for super admin, não executa cálculos de empresa para não misturar dados
    if(window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master')) return;

    console.log("Calculando métricas do Dashboard...");
    
    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // Loop principal de cálculos
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // Custos operacionais
        var custoOp = (Number(op.despesas) || 0) + (Number(op.combustivel) || 0);
        
        // Só paga comissão se não faltou
        if (!teveFalta) custoOp += (Number(op.comissao) || 0);

        // Soma diárias de ajudantes (se houver e se não faltaram)
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

    // Soma despesas gerais soltas
    CACHE_DESPESAS.forEach(function(desp) {
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            custosMes += (Number(desp.valor) || 0);
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza os elementos na tela
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

    // Chama atualização do gráfico passando mês/ano atuais
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// LÓGICA DO GRÁFICO (Chart.js) COM FILTROS DE VEÍCULO E MOTORISTA
function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; // Se o elemento não existir (ex: estiver em outra tela sem HTML), sai.

    // Obtém valores dos filtros
    var filtroVeiculo = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var filtroMotorista = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    
    var summaryContainer = document.getElementById('chartVehicleSummaryContainer');

    var stats = {
        faturamento: 0,
        custos: 0, 
        lucro: 0,
        viagens: 0,
        faltas: 0,
        kmTotal: 0,
        litrosTotal: 0
    };

    var gReceita = 0;
    var gCombustivel = 0;
    var gPessoal = 0;
    var gManutencao = 0;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        // Aplica Filtros
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            // Contagem de Faltas (Relevante para filtro de motorista)
            if (filtroMotorista && op.checkins && op.checkins.faltaMotorista) {
                stats.faltas++;
            }

            var receitaOp = Number(op.faturamento) || 0;
            var combustivelOp = Number(op.combustivel) || 0;
            var despesasOp = Number(op.despesas) || 0;
            var comissaoOp = 0;

            if (!op.checkins || !op.checkins.faltaMotorista) {
                comissaoOp = Number(op.comissao) || 0;
            }
            
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                     var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                     if (!faltou) comissaoOp += (Number(aj.diaria)||0);
                });
            }

            stats.viagens++;
            stats.faturamento += receitaOp;
            stats.custos += (combustivelOp + despesasOp + comissaoOp);
            stats.kmTotal += (Number(op.kmRodado) || 0);

            gReceita += receitaOp;
            gCombustivel += combustivelOp;
            gPessoal += comissaoOp;
            gManutencao += despesasOp;

            // Cálculo para média KM/L
            var preco = Number(op.precoLitro) || 0;
            if (preco > 0 && combustivelOp > 0) stats.litrosTotal += (combustivelOp / preco);
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    // Renderiza Card de Resumo Acima do Gráfico
    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
        
        if (filtroVeiculo || filtroMotorista) {
            var tituloBox = filtroVeiculo ? "VEÍCULO" : "MOTORISTA";
            var valorTitulo = filtroVeiculo || (CACHE_FUNCIONARIOS.find(f => f.id == filtroMotorista)?.nome || "Desconhecido");
            
            var boxExtraLabel = filtroMotorista ? "FALTAS / OCORRÊNCIAS" : "MÉDIA DE CONSUMO";
            var boxExtraValue = "";
            var boxExtraColor = "#333";

            if (filtroMotorista) {
                boxExtraValue = stats.faltas + " Faltas";
                boxExtraColor = stats.faltas > 0 ? "var(--danger-color)" : "var(--success-color)";
            } else {
                var media = (stats.litrosTotal > 0) ? (stats.kmTotal / stats.litrosTotal) : 0;
                boxExtraValue = media.toFixed(2) + " Km/L";
                boxExtraColor = "var(--primary-color)";
            }

            summaryContainer.innerHTML = `
                <div id="chartVehicleSummary">
                    <div class="veh-stat-box"><small>${tituloBox}</small><span>${valorTitulo}</span></div>
                    <div class="veh-stat-box"><small>VIAGENS (MÊS)</small><span>${stats.viagens}</span></div>
                    <div class="veh-stat-box"><small>FATURAMENTO</small><span style="color:var(--success-color)">${formatarValorMoeda(stats.faturamento)}</span></div>
                    <div class="veh-stat-box"><small>${boxExtraLabel}</small><span style="color:${boxExtraColor}">${boxExtraValue}</span></div>
                    <div class="veh-stat-box"><small>LUCRO GERADO</small><span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span></div>
                </div>
            `;
        }
    }

    // Destrói gráfico anterior para não sobrepor
    if (window.chartInstance) window.chartInstance.destroy();

    var lucroFinal = gReceita - (gCombustivel + gPessoal + gManutencao);

    // Cria novo gráfico
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL/COMISSÃO', 'MANUTENÇÃO', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: 'Valores do Mês',
                data: [gReceita, gCombustivel, gPessoal, gManutencao, lucroFinal],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', (lucroFinal >= 0 ? '#20c997' : '#e83e8c')]
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: function(value) { return 'R$ ' + value; } } }
            }
        }
    });
}

// RENDERIZAÇÃO DO CALENDÁRIO MENSAL
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

    // Células vazias antes do dia 1
    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        grid.appendChild(emptyCell);
    }

    // Dias do mês
    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        var cellContent = `<span>${dia}</span>`;
        
        // Busca operações deste dia
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
            
            // Clique para ver detalhes
            cell.onclick = (function(ds) { return function() { abrirModalDetalhesDia(ds); }; })(dateStr);
        } else {
            // Clique para criar nova operação
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

// Navegação do Calendário
window.changeMonth = function(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    renderizarCalendario();
    atualizarDashboard(); 
};

// MODAL: DETALHES COMPLETOS DAS OPERAÇÕES DO DIA
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
        
        var stringEquipe = '';
        if (op.checkins && op.checkins.faltaMotorista) {
            stringEquipe = `<strong style="color:red;">MOT: FALTA</strong>`;
        } else {
            stringEquipe = `<strong>Mot:</strong> ${nomeMot}`;
        }
        
        var receita = Number(op.faturamento) || 0;
        var custoViagem = Number(op.combustivel) + Number(op.despesas) + Number(op.comissao);
        var lucroOp = receita - custoViagem;

        totalFaturamento += receita;
        totalOutrasDespesas += custoViagem; 

        var statusBadge = '';
        if(op.status === 'FINALIZADA') statusBadge = '<span class="status-pill pill-active">FINALIZADA</span>';
        else if(op.status === 'EM_ANDAMENTO') statusBadge = '<span class="status-pill" style="background:orange; color:white;">EM ROTA</span>';
        else statusBadge = '<span class="status-pill pill-active">CONFIRMADA</span>';

        htmlLista += `
            <tr style="border-bottom:1px solid #ddd;">
                <td>${statusBadge}<br><small>#${op.id.toString().substr(-4)}</small></td>
                <td><strong>${op.veiculoPlaca}</strong></td>
                <td>${stringEquipe}</td>
                <td>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--success-color);">Fat: ${formatarValorMoeda(receita)}</span>
                    </div>
                    <strong>Lucro: <span style="color:${lucroOp>=0?'green':'red'}">${formatarValorMoeda(lucroOp)}</span></strong>
                </td>
                <td>
                    <strong style="color:#f57f17;">${formatarValorMoeda(Number(op.combustivel))}</strong>
                </td>
            </tr>
        `;
    });

    htmlLista += '</tbody></table></div>';

    var totalLucroLiquido = totalFaturamento - totalOutrasDespesas;

    if (modalSummary) {
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; background:#e0f2f1; padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid #b2dfdb;">
                <div style="text-align:center;">
                    <small style="color:#00695c; font-weight:bold;">FATURAMENTO</small><br>
                    <span style="font-weight:800; color:#004d40;">${formatarValorMoeda(totalFaturamento)}</span>
                </div>
                <div style="text-align:center;">
                    <small style="color:#c62828; font-weight:bold;">CUSTOS TOTAIS</small><br>
                    <span style="font-weight:800; color:#c62828;">${formatarValorMoeda(totalOutrasDespesas)}</span>
                </div>
                <div style="text-align:center; background:${totalLucroLiquido>=0?'#c8e6c9':'#ffcdd2'}; border-radius:4px;">
                    <small style="color:#1b5e20; font-weight:bold;">LUCRO LÍQUIDO</small><br>
                    <span style="font-weight:800; color:${totalLucroLiquido>=0?'#1b5e20':'#b71c1c'};">${formatarValorMoeda(totalLucroLiquido)}</span>
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = htmlLista;
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// ARQUIVO: script.js - PARTE 3/4
// GESTÃO DE CADASTROS (CRUD), ABAS E LÓGICA DE OPERAÇÃO
// =============================================================================

// === FORMULÁRIO DE FUNCIONÁRIOS (COM CRIAÇÃO DE LOGIN) ===
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
            var novoUID = id; 

            // Se for cadastro novo e tiver senha, cria usuário no Auth do Firebase
            if (!document.getElementById('funcionarioId').value && senha) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                // Função especial para criar usuário secundário sem deslogar o admin
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // Cria documento do usuário na collection 'users'
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, 
                    name: nome, 
                    email: email, 
                    role: funcao, 
                    company: window.USUARIO_ATUAL.company, 
                    createdAt: new Date().toISOString(), 
                    approved: true, 
                    senhaVisual: senha // Salva para o admin poder consultar
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
                cnh: document.getElementById('funcCNH').value, 
                validadeCNH: document.getElementById('funcValidadeCNH').value, 
                categoriaCNH: document.getElementById('funcCategoriaCNH').value, 
                cursoDescricao: document.getElementById('funcCursoDescricao').value
            };
            
            if (senha) funcionarioObj.senhaVisual = senha;

            // Atualiza cache e salva
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
            alert("Erro ao salvar funcionário: " + erro.message); 
        } finally { 
            btnSubmit.disabled = false; 
            btnSubmit.innerHTML = textoOriginal; 
        }
    }
});

// === OUTROS FORMULÁRIOS DE CADASTRO ===

// VEÍCULOS
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

// CONTRATANTES
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

// ATIVIDADES / SERVIÇOS
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formAtividade') { 
        e.preventDefault(); 
        var id = document.getElementById('atividadeId').value || Date.now().toString(); 
        var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() }; 
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

// DADOS DA PRÓPRIA EMPRESA
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

// === FORMULÁRIO DE OPERAÇÃO / VIAGEM (CORE DO SISTEMA) ===
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se a operação já existe e está em andamento, não reseta status
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
            alert(isAgendamento ? "Operação Agendada com Sucesso!" : "Operação Salva com Sucesso!");
            e.target.reset(); 
            document.getElementById('operacaoId').value = ''; 
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = []; 
            renderizarListaAjudantesAdicionados(); 
            preencherTodosSelects(); 
            renderizarCalendario(); 
            atualizarDashboard();
        });
    }
});

// === FUNÇÕES AUXILIARES DE UI (PREENCHIMENTO DE SELECTS E TABELAS) ===

function preencherTodosSelects() {
    // Helper para preencher <select>
    const fill = (id, dados, valKey, textKey, defText) => { 
        var el = document.getElementById(id); 
        if (!el) return; 
        var atual = el.value; 
        el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); 
        if(atual) el.value = atual; 
    };

    // Preenche selects de Operação
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    // Preenche selects de Filtros/Relatórios
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('filtroMotoristaGrafico', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    
    // Atualiza as tabelas de listagem
    renderizarTabelaFuncionarios(); 
    renderizarTabelaVeiculos(); 
    renderizarTabelaContratantes(); 
    renderizarTabelaAtividades(); 
    renderizarTabelaOperacoes(); 
    renderizarInformacoesEmpresa();
    
    // Atualiza painéis de RH e Monitoramento
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
    if(typeof renderizarTabelaMonitoramento === 'function') { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
}

// Renderizadores de Tabelas (HTML dinâmico)
function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr'); 
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-primary" onclick="visualizarFuncionario('${f.id}')"><i class="fas fa-eye"></i></button>
            <button class="btn-mini btn-warning" onclick="resetarSenhaFuncionario('${f.id}')"><i class="fas fa-key"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>`; 
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

function renderizarTabelaVeiculos() { 
    var tbody = document.querySelector('#tabelaVeiculos tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_VEICULOS.forEach(v => { 
        var tr = document.createElement('tr'); 
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`; 
        tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

function renderizarTabelaContratantes() { 
    var tbody = document.querySelector('#tabelaContratantes tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_CONTRATANTES.forEach(c => { 
        var tr = document.createElement('tr'); 
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`; 
        tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

function renderizarTabelaAtividades() { 
    var tbody = document.querySelector('#tabelaAtividades tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_ATIVIDADES.forEach(a => { 
        var tr = document.createElement('tr'); 
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>`; 
        tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

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
        var btnView = `<button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')"><i class="fas fa-eye"></i></button>`;
        var btnActions = btnView + (!window.MODO_APENAS_LEITURA ? ` <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>` : ''); 
        var tr = document.createElement('tr'); 
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td><td><span class="status-pill ${statusClass}">${statusLabel}</span></td><td style="color:green; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
};

// Funções de Exclusão e Preenchimento de Formulário (Edição)
window.excluirFuncionario = async function(id) { if(!confirm("Excluir?")) return; if (window.dbRef) { try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); } catch(e) {} } var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); await salvarListaFuncionarios(lista); preencherTodosSelects(); };
window.excluirVeiculo = function(placa) { if(!confirm("Excluir?")) return; salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); };
window.excluirContratante = function(cnpj) { if(!confirm("Excluir?")) return; salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); };
window.excluirAtividade = function(id) { if(!confirm("Excluir?")) return; salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); };
window.excluirOperacao = function(id) { if(!confirm("Excluir?")) return; salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); }); };

window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (!f) return; document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email || ''; document.getElementById('funcTelefone').value = f.telefone; document.getElementById('funcPix').value = f.pix || ''; document.getElementById('funcEndereco').value = f.endereco || ''; toggleDriverFields(); if (f.funcao === 'motorista') { document.getElementById('funcCNH').value = f.cnh || ''; document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); };
window.preencherFormularioVeiculo = function(placa) { var v = buscarVeiculoPorPlaca(placa); if (!v) return; document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.getElementById('veiculoAno').value = v.ano; document.getElementById('veiculoRenavam').value = v.renavam || ''; document.getElementById('veiculoChassi').value = v.chassi || ''; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); };
window.preencherFormularioContratante = function(cnpj) { var c = buscarContratantePorCnpj(cnpj); if (!c) return; document.getElementById('contratanteCNPJ').value = c.cnpj; document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; document.getElementById('contratanteTelefone').value = c.telefone; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); };
window.preencherFormularioOperacao = function(id) { var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return; document.getElementById('operacaoId').value = op.id; document.getElementById('operacaoData').value = op.data; document.getElementById('selectMotoristaOperacao').value = op.motoristaId; document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca; document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ; document.getElementById('selectAtividadeOperacao').value = op.atividadeId; document.getElementById('operacaoFaturamento').value = op.faturamento; document.getElementById('operacaoAdiantamento').value = op.adiantamento || ''; document.getElementById('operacaoComissao').value = op.comissao || ''; document.getElementById('operacaoDespesas').value = op.despesas || ''; document.getElementById('operacaoCombustivel').value = op.combustivel || ''; document.getElementById('operacaoPrecoLitro').value = op.precoLitro || ''; document.getElementById('operacaoKmRodado').value = op.kmRodado || ''; window._operacaoAjudantesTempList = op.ajudantes || []; renderizarListaAjudantesAdicionados(); document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'); document.querySelector('[data-page="operacoes"]').click(); };

// CONTROLE DE ABAS (Tabs) - CADASTRO
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // Remove active de todos
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => {
            f.classList.remove('active');
            f.style.display = 'none';
        });
        
        // Ativa o clicado
        this.classList.add('active');
        var tabId = this.getAttribute('data-tab');
        var tab = document.getElementById(tabId);
        if (tab) {
            tab.style.display = 'block';
            setTimeout(() => tab.classList.add('active'), 10);
        }
    });
});
// =============================================================================
// ARQUIVO: script.js - PARTE 4/4
// RELATÓRIOS, RECIBOS, SUPER ADMIN E INICIALIZAÇÃO
// =============================================================================

// === RELATÓRIOS ===

window.gerarRelatorioGeral = function() {
    var ops = CACHE_OPERACOES.filter(function(op) { 
        if (op.status === 'CANCELADA') return false; 
        var ini = document.getElementById('dataInicioRelatorio').value; 
        var fim = document.getElementById('dataFimRelatorio').value; 
        if (!ini || !fim) return true; // Se não tem data, mostra tudo (cuidado)
        return (op.data >= ini && op.data <= fim); 
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    var html = `<h3>RELATÓRIO GERAL</h3><table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th></tr></thead><tbody>`;
    ops.forEach(op => { 
        var mot = buscarFuncionarioPorId(op.motoristaId); 
        html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${mot?mot.nome:'-'}</td><td>${formatarValorMoeda(op.faturamento)}</td></tr>`; 
    });
    html += `</tbody></table>`; 
    document.getElementById('reportContent').innerHTML = html; 
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() { 
    var el = document.getElementById('reportContent'); 
    if (!el || el.innerHTML.trim() === '') return alert("Gere um relatório primeiro."); 
    var opt = { margin: 10, filename: 'Relatorio.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; 
    html2pdf().set(opt).from(el).save(); 
};

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;
    if (!motId || !dataIni || !dataFim) return alert("Preencha todos os campos.");

    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário não encontrado.");

    var total = 0;
    var itens = [];
    
    // Calcula comissões e diárias
    CACHE_OPERACOES.forEach(op => {
        if(op.status === 'CANCELADA' || op.data < dataIni || op.data > dataFim) return;
        
        // Se for o motorista
        if(op.motoristaId === motId) {
             if (!op.checkins || !op.checkins.faltaMotorista) {
                 var val = Number(op.comissao) || 0;
                 total += val;
                 itens.push({data: op.data, desc: "Viagem " + op.veiculoPlaca, valor: val});
             }
        }
        // Se for ajudante
        if(op.ajudantes) {
            var euAjudante = op.ajudantes.find(a => a.id === motId);
            if(euAjudante) {
                var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[motId]);
                if(!faltou) {
                    var valAj = Number(euAjudante.diaria) || 0;
                    total += valAj;
                    itens.push({data: op.data, desc: "Ajudante " + op.veiculoPlaca, valor: valAj});
                }
            }
        }
    });

    // Gera HTML do Recibo
    var htmlRecibo = `
        <div style="border:2px solid #000; padding:20px; font-family:monospace;">
            <h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>
            <p><strong>Beneficiário:</strong> ${funcionario.nome}</p>
            <p><strong>Período:</strong> ${formatarDataParaBrasileiro(dataIni)} a ${formatarDataParaBrasileiro(dataFim)}</p>
            <hr>
            <table style="width:100%">
                ${itens.map(i => `<tr><td>${formatarDataParaBrasileiro(i.data)}</td><td>${i.desc}</td><td align="right">${formatarValorMoeda(i.valor)}</td></tr>`).join('')}
            </table>
            <hr>
            <h3 style="text-align:right;">TOTAL: ${formatarValorMoeda(total)}</h3>
        </div>
    `;
    
    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    document.getElementById('modalReciboActions').innerHTML = '<button class="btn-primary" onclick="window.print()">IMPRIMIR</button>';
    document.getElementById('modalRecibo').style.display = 'flex';
};

// === PAINEL SUPER ADMIN (MASTER) ===
window.carregarPainelSuperAdmin = async function(forceRefresh) {
    const container = document.getElementById('superAdminContainer'); if(!container) return; container.innerHTML = 'Carregando empresas...';
    try {
        const { db, collection, getDocs } = window.dbRef;
        const companiesSnap = await getDocs(collection(db, "companies")); const usersSnap = await getDocs(collection(db, "users"));
        const companies = []; companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        const users = []; usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));
        container.innerHTML = '';
        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            container.innerHTML += `<div class="company-block" style="border:1px solid #ccc; padding:10px; margin-bottom:10px;"><div class="company-header" onclick="this.nextElementSibling.classList.toggle('expanded')"><h4>${comp.id.toUpperCase()}</h4><small>${usersDaEmpresa.length} usuários</small></div><div class="company-content"><table class="data-table"><tbody>${usersDaEmpresa.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-mini btn-warning" onclick="resetarSenhaComMigracao('${u.uid}','${u.email}','${u.name}')">RESET</button></td></tr>`).join('')}</tbody></table></div></div>`;
        });
    } catch (e) { container.innerHTML = 'Erro: ' + e.message; }
};

window.resetarSenhaComMigracao = async function(oldUid, email, nome) {
    var novaSenha = prompt(`NOVA SENHA PARA ${nome} (${email}):`); if(!novaSenha || novaSenha.length < 6) return;
    try {
        // Cria novo usuário no Auth
        let newUid = await window.dbRef.criarAuthUsuario(email, novaSenha);
        const { db, doc, getDoc, setDoc, deleteDoc } = window.dbRef;
        // Migra dados do Firestore
        const oldUserSnap = await getDoc(doc(db, "users", oldUid));
        if (oldUserSnap.exists()) {
            const userData = oldUserSnap.data(); userData.uid = newUid; userData.senhaVisual = novaSenha;
            await setDoc(doc(db, "users", newUid), userData); await deleteDoc(doc(db, "users", oldUid));
        }
        alert("Senha resetada e usuário migrado com sucesso."); carregarPainelSuperAdmin();
    } catch (erro) { alert("Erro (verifique se deletou no Auth do Firebase Console): " + erro.message); }
};

// === INICIALIZAÇÃO E ROTEAMENTO (EVITA O FLASH) ===
window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema para perfil:", user.role);
    
    // Oculta tudo inicialmente
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');
    window.USUARIO_ATUAL = user;

    // --- ROTA SUPER ADMIN ---
    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        carregarPainelSuperAdmin(true);
        return; // IMPORTANTE: Interrompe aqui para não carregar o resto
    }

    if (!user.approved) { document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>AGUARDANDO APROVAÇÃO</h1></div>'; return; }

    // --- ROTA ADMIN DA EMPRESA ---
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe(); 
        renderizarCalendario(); 
        atualizarDashboard();
        
        // Mostra Home
        var home = document.getElementById('home');
        if(home) { home.style.display = 'block'; home.classList.add('active'); }
        
    // --- ROTA MOTORISTA / AJUDANTE ---
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        document.querySelector('[data-page="employee-home"]').click();
    }
};

// Eventos de Navegação do Menu Lateral
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Remove active
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => { page.classList.remove('active'); page.style.display = 'none'; });
        
        // Adiciona active no novo
        this.classList.add('active');
        var pageId = this.getAttribute('data-page'); 
        var targetPage = document.getElementById(pageId);
        
        if (targetPage) { 
            targetPage.style.display = 'block'; 
            setTimeout(() => targetPage.classList.add('active'), 10); 
        }

        // Se for mobile, fecha menu
        if (window.innerWidth <= 768) {
             document.getElementById('sidebar').classList.remove('active');
        }

        // Hooks específicos de página
        if (pageId === 'home') atualizarDashboard();
        if (pageId === 'graficos') atualizarGraficoPrincipal(new Date().getMonth(), new Date().getFullYear());
    });
});

// Outros eventos
document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('active');
});

document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.remove('active');
});

window.resetSystemData = function() { 
    if(confirm("ATENÇÃO: Isso apaga todos os dados do navegador. Tem certeza?")) { 
        localStorage.clear(); 
        location.reload(); 
    } 
};
// =============================================================================
// ARQUIVO: script.js - PARTE 5/5
// ÁREA DO MOTORISTA, CHECK-INS E MÁSCARAS DE INPUT (UI/UX)
// =============================================================================

// === 1. LÓGICA ESPECÍFICA DO MOTORISTA (MOBILE) ===

// Busca serviços agendados para o motorista logado
window.filtrarServicosFuncionario = function(uid) {
    if (!uid) return;
    
    // Elemento onde a lista vai aparecer
    var container = document.getElementById('listaServicosAgendados');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center;">Carregando suas viagens...</p>';
    
    // Filtra operações onde ele é motorista OU ajudante
    var minhasOps = CACHE_OPERACOES.filter(op => {
        if (op.status === 'CANCELADA' || op.status === 'FINALIZADA') return false;
        
        var souMotorista = (op.motoristaId === uid);
        var souAjudante = (op.ajudantes && op.ajudantes.some(aj => aj.id === uid));
        
        return souMotorista || souAjudante;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    container.innerHTML = '';

    if (minhasOps.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#888;">
                <i class="fas fa-check-circle" style="font-size:3rem; margin-bottom:10px; opacity:0.3;"></i>
                <p>Nenhuma viagem pendente.</p>
            </div>`;
        return;
    }

    minhasOps.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Cliente';
        var veiculo = op.veiculoPlaca;
        var dataFmt = formatarDataParaBrasileiro(op.data);
        var isMotorista = (op.motoristaId === uid);
        
        // Define cor e texto do status
        var statusColor = op.status === 'EM_ANDAMENTO' ? 'orange' : '#007bff';
        var statusText = op.status === 'EM_ANDAMENTO' ? 'EM ROTA' : 'AGENDADA';
        
        // Botão de Ação (Apenas Motorista pode iniciar/finalizar)
        var btnAction = '';
        if (isMotorista) {
            if (op.status === 'AGENDADA') {
                btnAction = `<button class="btn-success" style="width:100%; margin-top:10px;" onclick="abrirCheckinModal('${op.id}', 'INICIO')"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
            } else if (op.status === 'EM_ANDAMENTO') {
                btnAction = `<button class="btn-danger" style="width:100%; margin-top:10px;" onclick="abrirCheckinModal('${op.id}', 'FIM')"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
            }
        } else {
            btnAction = `<div style="margin-top:10px; font-size:0.8rem; color:#666; background:#eee; padding:5px; text-align:center;">Você é Ajudante nesta rota</div>`;
        }

        var cardHtml = `
            <div class="card" style="margin-bottom:15px; border-left: 5px solid ${statusColor};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="margin:0; font-size:1.1rem;">${dataFmt}</h4>
                    <span class="status-pill" style="background:${statusColor}; color:white;">${statusText}</span>
                </div>
                <div style="margin-top:10px; font-size:0.95rem;">
                    <p><i class="fas fa-building" style="width:20px; text-align:center;"></i> <strong>${cliente}</strong></p>
                    <p><i class="fas fa-truck" style="width:20px; text-align:center;"></i> ${veiculo}</p>
                    <p><i class="fas fa-map-marker-alt" style="width:20px; text-align:center;"></i> Viagem #${op.id.substr(-4)}</p>
                </div>
                ${btnAction}
            </div>
        `;
        container.innerHTML += cardHtml;
    });
};

// Histórico de Viagens Realizadas (Tela "Meus Serviços")
window.filtrarHistoricoFuncionario = function() {
    var uid = window.USUARIO_ATUAL.uid;
    var ini = document.getElementById('empDataInicio').value;
    var fim = document.getElementById('empDataFim').value;
    var tbody = document.querySelector('#tabelaHistoricoCompleto tbody');
    var totalEl = document.getElementById('empTotalReceber');
    
    if(!tbody || !uid) return;
    
    tbody.innerHTML = '';
    var total = 0;

    var ops = CACHE_OPERACOES.filter(op => {
        if(op.status === 'CANCELADA') return false;
        if(ini && op.data < ini) return false;
        if(fim && op.data > fim) return false;
        return (op.motoristaId === uid || (op.ajudantes && op.ajudantes.some(a => a.id === uid)));
    }).sort((a,b) => new Date(b.data) - new Date(a.data)); // Mais recentes primeiro

    ops.forEach(op => {
        var ganho = 0;
        var papel = '';

        if (op.motoristaId === uid) {
            papel = 'Motorista';
            // Verifica falta
            if (!op.checkins || !op.checkins.faltaMotorista) {
                ganho = Number(op.comissao) || 0;
            }
        } else {
            papel = 'Ajudante';
            var ajData = op.ajudantes.find(a => a.id === uid);
            if (ajData) {
                // Verifica falta ajudante
                var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[uid]);
                if (!faltou) ganho = Number(ajData.diaria) || 0;
            }
        }
        
        total += ganho;

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}<br><small>${papel}</small></td>
            <td>${op.veiculoPlaca}</td>
            <td style="color:green; font-weight:bold;">${formatarValorMoeda(ganho)}</td>
        `;
        tbody.appendChild(tr);
    });

    if(totalEl) totalEl.textContent = formatarValorMoeda(total);
    if(ops.length === 0) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum registro no período.</td></tr>';
};

// === 2. LÓGICA DE CHECK-IN / CHECK-OUT (MODAIS) ===

window.abrirCheckinModal = function(opId, step) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    var modal = document.getElementById('modalCheckinConfirm');
    var title = document.getElementById('checkinModalTitle');
    var driverFields = document.getElementById('checkinDriverFields');
    var divKmIni = document.getElementById('divKmInicial');
    var divKmFim = document.getElementById('divKmFinal');
    
    // Popula dados visuais
    document.getElementById('checkinOpId').value = opId;
    document.getElementById('checkinStep').value = step;
    document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    
    var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
    document.getElementById('checkinDisplayContratante').textContent = cli ? cli.razaoSocial : '---';

    if (step === 'INICIO') {
        title.textContent = "INICIAR VIAGEM (KM SAÍDA)";
        title.style.color = "var(--success-color)";
        driverFields.style.display = 'block';
        divKmIni.style.display = 'block';
        divKmFim.style.display = 'none';
        
        // Tenta pegar KM do último registro desse veículo
        var kmSugerido = buscarUltimoKmVeiculo(op.veiculoPlaca);
        document.getElementById('checkinKmInicial').value = kmSugerido > 0 ? kmSugerido : '';

    } else if (step === 'FIM') {
        title.textContent = "FINALIZAR VIAGEM (CHEGADA)";
        title.style.color = "var(--danger-color)";
        driverFields.style.display = 'block';
        divKmIni.style.display = 'none';
        divKmFim.style.display = 'block';
        
        // Passa o KM Inicial para cálculo
        document.getElementById('checkinKmInicialReadonly').value = op.kmInicial || 0;
        
        // Limpa campos
        document.getElementById('checkinKmFinal').value = '';
        document.getElementById('checkinValorAbastecido').value = '';
        document.getElementById('checkinPrecoLitroConfirm').value = '';
    }

    modal.style.display = 'flex';
};

function buscarUltimoKmVeiculo(placa) {
    // Busca na lista de operações a última finalizada com este veículo
    var opsVeiculo = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && o.kmFinal > 0).sort((a,b) => new Date(b.data) - new Date(a.data));
    if (opsVeiculo.length > 0) return opsVeiculo[0].kmFinal;
    return 0;
}

// Processamento do Formulário de Check-in
document.getElementById('formCheckinConfirm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    var opId = document.getElementById('checkinOpId').value;
    var step = document.getElementById('checkinStep').value;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    
    if (!op) return alert("Erro: Operação não encontrada.");

    if (step === 'INICIO') {
        var kmIni = Number(document.getElementById('checkinKmInicial').value);
        if (kmIni <= 0) return alert("Informe o KM de saída válido.");
        
        op.status = 'EM_ANDAMENTO';
        op.kmInicial = kmIni;
        
    } else if (step === 'FIM') {
        var kmFim = Number(document.getElementById('checkinKmFinal').value);
        var kmIni = Number(document.getElementById('checkinKmInicialReadonly').value);
        
        if (kmFim <= kmIni) return alert(`Erro: O KM Final (${kmFim}) deve ser maior que o KM Inicial (${kmIni}).`);
        
        var abastecido = Number(document.getElementById('checkinValorAbastecido').value) || 0;
        var preco = Number(document.getElementById('checkinPrecoLitroConfirm').value) || 0;

        op.status = 'FINALIZADA';
        op.kmFinal = kmFim;
        op.kmRodado = kmFim - kmIni;
        op.combustivel = abastecido;
        if(preco > 0) op.precoLitro = preco;
    }

    // Salva e atualiza
    await salvarListaOperacoes(CACHE_OPERACOES);
    
    alert(step === 'INICIO' ? "Boa viagem! Status alterado para EM ROTA." : "Viagem finalizada com sucesso!");
    document.getElementById('modalCheckinConfirm').style.display = 'none';
    
    // Recarrega a lista
    if(window.filtrarServicosFuncionario) window.filtrarServicosFuncionario(window.USUARIO_ATUAL.uid);
});

// === 3. MÁSCARAS DE INPUT E EVENTOS GERAIS DE UI ===

document.addEventListener('DOMContentLoaded', function() {
    
    // Máscara para Campos de Moeda (Formata enquanto digita)
    var inputsMoeda = document.querySelectorAll('input[id*="Valor"], input[id*="Preco"], input[id*="Faturamento"], input[id*="Despesas"], input[id*="Comissao"], input[id*="Adiantamento"]');
    
    // Máscara Simples de Telefone
    var inputsTelefone = document.querySelectorAll('input[id*="Telefone"]');
    inputsTelefone.forEach(input => {
        input.addEventListener('input', function(e) {
            var x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    });

    // Filtro Global de Usuários (Super Admin)
    var searchInput = document.getElementById('superAdminSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', function() {
            var val = this.value.toLowerCase();
            var blocks = document.querySelectorAll('.company-block');
            blocks.forEach(block => {
                var text = block.innerText.toLowerCase();
                block.style.display = text.includes(val) ? 'block' : 'none';
            });
        });
    }
});

// Exibe os dados do usuário na tela "Meus Dados"
document.querySelector('[data-page="meus-dados"]')?.addEventListener('click', function() {
    var u = window.USUARIO_ATUAL;
    var f = buscarFuncionarioPorId(u.uid);
    var container = document.getElementById('meusDadosContainer');
    if(container && f) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <i class="fas fa-user-circle" style="font-size:4rem; color:#ccc;"></i>
                <h2>${f.nome}</h2>
                <p style="color:#666;">${f.funcao}</p>
            </div>
            <div style="background:#f8f9fa; padding:15px; border-radius:8px;">
                <p><strong>Email:</strong> ${f.email}</p>
                <p><strong>Telefone:</strong> ${f.telefone}</p>
                <p><strong>PIX:</strong> ${f.pix || '-'}</p>
                <p><strong>Endereço:</strong> ${f.endereco || '-'}</p>
            </div>
            <button onclick="document.getElementById('modalRequestProfileChange').style.display='flex'" class="btn-primary" style="width:100%; margin-top:20px;">
                <i class="fas fa-edit"></i> SOLICITAR ALTERAÇÃO DE DADOS
            </button>
        `;
    }
});

// Envia solicitação de alteração de perfil
document.getElementById('formRequestProfileChange')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    var campo = document.getElementById('reqFieldType').value;
    var valor = document.getElementById('reqNewValue').value;
    
    var novaReq = {
        id: Date.now().toString(),
        funcionarioEmail: window.USUARIO_ATUAL.email,
        data: new Date().toISOString(),
        campo: campo,
        valorNovo: valor,
        status: 'PENDENTE'
    };
    
    var lista = CACHE_PROFILE_REQUESTS;
    lista.push(novaReq);
    await salvarProfileRequests(lista);
    
    alert("Solicitação enviada ao administrador!");
    document.getElementById('modalRequestProfileChange').style.display = 'none';
    e.target.reset();
});

console.log("Sistema Carregado: Módulos de Motorista e UI prontos.");