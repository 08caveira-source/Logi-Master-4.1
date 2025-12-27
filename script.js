// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 6.0 (FINALIZAÇÃO DRIVER & MONITORAMENTO DETALHADO)
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
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

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 
window._mensagemAtualId = null; 
window._intervaloMonitoramento = null; // Para atualização automática do monitoramento

// 3. CACHE LOCAL
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];

// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS)
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
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)

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
}

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
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

async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
// Correção Bug Solicitações: Ao salvar, atualiza cache e UI se estiver na tela certa
async function salvarProfileRequests(lista) { 
    await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); 
    if(document.getElementById('tabelaProfileRequests')) renderizarTabelaProfileRequests();
}

// Buscas Rápidas
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }

// Inicialização Inicial de Dados
carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS E VISUALIZAÇÃO (GRÁFICOS/CALENDÁRIO)
// =============================================================================

// -----------------------------------------------------------------------------
// 6. CÁLCULOS FINANCEIROS E ATUALIZAÇÃO DO DASHBOARD
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    var mesAtual = window.currentDate.getMonth(); // 0 a 11
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        // Status que contam para o financeiro: CONFIRMADA e FINALIZADA
        // 'AGENDADA' e 'EM_ANDAMENTO' ainda são previsões, mas se tiverem adiantamento, poderiam contar.
        // Por padrão, somamos tudo que não é cancelado, assumindo que EM_ANDAMENTO pode ter adiantamento.
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // Custo Caixa (o que realmente saiu do bolso no mês)
        var custoOp = (Number(op.despesas) || 0) + 
                      (Number(op.combustivel) || 0);
        
        // Só soma comissão se não teve falta
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                // Se o ajudante específico não teve falta registrada (futuro), soma.
                // Por enquanto assumimos que se está na lista, paga-se, exceto se removido.
                custoOp += (Number(aj.diaria) || 0);
            });
        }

        // Histórico Global
        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    CACHE_DESPESAS.forEach(function(desp) {
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            custosMes += (Number(desp.valor) || 0);
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
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (CHART.JS)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    var receita = 0;
    var combustivel = 0;
    var pessoal = 0; 
    var manutencaoGeral = 0; 
    
    CACHE_OPERACOES.forEach(op => {
        var d = new Date(op.data + 'T12:00:00');
        // Consideramos para o gráfico operações confirmadas ou finalizadas
        if ((op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            
            if (!op.checkins || !op.checkins.faltaMotorista) {
                pessoal += Number(op.comissao || 0);
            }
            
            if (op.ajudantes) op.ajudantes.forEach(aj => pessoal += (Number(aj.diaria)||0));

            manutencaoGeral += Number(op.despesas || 0);
        }
    });

    CACHE_DESPESAS.forEach(d => {
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
                label: 'Resultados do Mês (R$)',
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
            
            // Verifica status predominante para cor do pontinho
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

window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(op) {
        // Considera FINALIZADA para cálculo de média também
        return op.veiculoPlaca === placa && (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA');
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var preco = Number(op.precoLitro) || 0;
        totalKm += km;
        if (valorAbastecido > 0 && preco > 0) { totalLitros += (valorAbastecido / preco); }
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
    var listaOperacoes = CACHE_OPERACOES;
    var operacoesDoDia = listaOperacoes.filter(function(op) {
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
        
        if(op.ajudantes) op.ajudantes.forEach(aj => custoPessoal += (Number(aj.diaria)||0));
        var custoExtra = Number(op.despesas) || 0;
        
        var kmNaViagem = Number(op.kmRodado) || 0;
        var mediaGlobal = calcularMediaGlobalVeiculo(op.veiculoPlaca);
        var precoLitroRef = Number(op.precoLitro) > 0 ? Number(op.precoLitro) : obterPrecoMedioCombustivel(op.veiculoPlaca);
        
        var custoDieselCalculado = 0;
        if (mediaGlobal > 0 && kmNaViagem > 0 && precoLitroRef > 0) {
            var litrosConsumidos = kmNaViagem / mediaGlobal;
            custoDieselCalculado = litrosConsumidos * precoLitroRef;
        }

        var custoTotalViagem = custoPessoal + custoExtra + custoDieselCalculado;
        var lucroOp = receita - custoTotalViagem;

        totalFaturamento += receita;
        totalCustoCalculadoDiesel += custoDieselCalculado;
        totalOutrasDespesas += (custoPessoal + custoExtra);

        // Badge de Status
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
                    <small style="color:#f57f17; font-weight:bold;">DIESEL (CALC)</small><br>
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
// PARTE 3: GESTÃO DE CADASTROS (CRUD), INTERFACE DE FORMULÁRIOS E VISUALIZAÇÃO
// =============================================================================

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

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                console.log("Criando usuário no Auth...");
                // Chama função exposta no index.html
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // Cria documento do usuário na coleção 'users' (Global/Auth)
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, name: nome, email: email, role: funcao,
                    company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(), approved: true
                });
            }

            var funcionarioObj = {
                id: novoUID, nome: nome, funcao: funcao, documento: document.getElementById('funcDocumento').value,
                email: email, telefone: document.getElementById('funcTelefone').value, pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                cnh: document.getElementById('funcCNH').value, validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoriaCNH: document.getElementById('funcCategoriaCNH').value, cursoDescricao: document.getElementById('funcCursoDescricao').value
            };

            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            await salvarListaFuncionarios(lista);
            alert("Salvo com sucesso!");
            e.target.reset(); document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); preencherTodosSelects();

        } catch (erro) { console.error(erro); alert("Erro: " + erro.message); } 
        finally { btnSubmit.disabled = false; btnSubmit.innerHTML = textoOriginal; }
    }
});

document.addEventListener('submit', function(e) { if (e.target.id === 'formVeiculo') { e.preventDefault(); var placa = document.getElementById('veiculoPlaca').value.toUpperCase(); var novo = { placa: placa, modelo: document.getElementById('veiculoModelo').value.toUpperCase(), ano: document.getElementById('veiculoAno').value, renavam: document.getElementById('veiculoRenavam').value, chassi: document.getElementById('veiculoChassi').value }; var lista = CACHE_VEICULOS.filter(v => v.placa !== placa); lista.push(novo); salvarListaVeiculos(lista).then(() => { alert("Veículo Salvo!"); e.target.reset(); preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formContratante') { e.preventDefault(); var cnpj = document.getElementById('contratanteCNPJ').value; var novo = { cnpj: cnpj, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value }; var lista = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj); lista.push(novo); salvarListaContratantes(lista).then(() => { alert("Cliente Salvo!"); e.target.reset(); preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formAtividade') { e.preventDefault(); var id = document.getElementById('atividadeId').value || Date.now().toString(); var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() }; var lista = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id)); lista.push(novo); salvarListaAtividades(lista).then(() => { alert("Atividade Salva!"); e.target.reset(); document.getElementById('atividadeId').value = ''; preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formMinhaEmpresa') { e.preventDefault(); var dados = { razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj: document.getElementById('minhaEmpresaCNPJ').value, telefone: document.getElementById('minhaEmpresaTelefone').value }; salvarDadosMinhaEmpresa(dados).then(() => { alert("Dados da Empresa Atualizados!"); renderizarInformacoesEmpresa(); }); } });

// -----------------------------------------------------------------------------
// SALVAR OPERAÇÃO
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
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

// EXCLUSÃO E GERENCIAMENTO
window.excluirFuncionario = async function(id) {
    if(!confirm("ATENÇÃO: Excluir remove acesso e dados. Continuar?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", id));
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        alert("Removido com sucesso.");
        preencherTodosSelects();
    } catch (e) {
        alert("Erro na nuvem: " + e.message + ". Removendo localmente.");
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        preencherTodosSelects();
    }
};

window.excluirVeiculo = function(placa) { if(!confirm("Excluir Veículo?")) return; salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); };
window.excluirContratante = function(cnpj) { if(!confirm("Excluir Cliente?")) return; salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); };
window.excluirAtividade = function(id) { if(!confirm("Excluir este tipo de serviço?")) return; salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); };
window.excluirOperacao = function(id) { if(!confirm("Remover operação?")) return; salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); }); };

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
    
    // Filtro de relatório agora inclui TODOS (Motoristas e Ajudantes)
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
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
// RENDERIZAÇÃO DE TABELAS E NOVAS FUNÇÕES (VIEW / RESET)
// -----------------------------------------------------------------------------

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr'); 
        
        // Botões de Ação Atualizados
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-primary" onclick="visualizarFuncionario('${f.id}')" title="Visualizar e Copiar Dados"><i class="fas fa-eye"></i></button>
            <button class="btn-mini btn-warning" onclick="resetarSenhaFuncionario('${f.id}')" title="Enviar Redefinição de Senha"><i class="fas fa-key"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
        `; 
        
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

// NOVA FUNÇÃO: VISUALIZAR FUNCIONÁRIO COM CÓPIA
window.visualizarFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    // Helper para gerar linha com botão de copiar
    const createCopyRow = (label, value) => {
        if (!value) return '';
        // Escapa aspas para evitar erro no onclick
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
            </div>
            
            ${createCopyRow('E-mail/Login', f.email)}
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
        // Feedback visual rápido
        alert("Copiado para a área de transferência: " + texto);
    }).catch(err => {
        console.error('Erro ao copiar', err);
    });
};

// NOVA FUNÇÃO: RESETAR SENHA
window.resetarSenhaFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f || !f.email) return alert("Funcionário sem e-mail cadastrado.");

    if (confirm(`Deseja enviar um e-mail de redefinição de senha para ${f.email}?`)) {
        if (window.dbRef && window.dbRef.sendReset) {
            window.dbRef.sendReset(f.email)
                .then(() => alert("E-mail de redefinição enviado com sucesso! Peça para o funcionário verificar a caixa de entrada."))
                .catch((error) => alert("Erro ao enviar: " + error.message));
        } else {
            alert("Erro: Serviço de autenticação indisponível.");
        }
    }
};

function renderizarTabelaVeiculos() { var tbody = document.querySelector('#tabelaVeiculos tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_VEICULOS.forEach(v => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaContratantes() { var tbody = document.querySelector('#tabelaContratantes tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_CONTRATANTES.forEach(c => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaAtividades() { var tbody = document.querySelector('#tabelaAtividades tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_ATIVIDADES.forEach(a => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }

// ALTERAÇÃO: Adicionado botão VISUALIZAR na tabela
function renderizarTabelaOperacoes() { 
    var tbody = document.querySelector('#tabelaOperacoes tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    var lista = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data)); 
    lista.forEach(op => { 
        if(op.status === 'CANCELADA') return; 
        var mot = buscarFuncionarioPorId(op.motoristaId); 
        var nomeMot = mot ? mot.nome : 'Excluído'; 
        
        var statusLabel = op.status;
        var statusClass = 'pill-pending';
        if(op.status === 'FINALIZADA') { statusLabel='FINALIZADA'; statusClass='pill-active'; }
        else if(op.status === 'CONFIRMADA') { statusLabel='CONFIRMADA'; statusClass='pill-active'; }
        else if(op.status === 'EM_ANDAMENTO') { statusLabel='EM ROTA'; statusClass='pill-pending'; } 
        
        var styleAdd = (op.status === 'EM_ANDAMENTO') ? 'style="background:orange; color:white;"' : '';

        var btnView = `<button class="btn-mini btn-primary" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        
        var btnActions = btnView; 
        if (!window.MODO_APENAS_LEITURA) { 
            btnActions += ` <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>`; 
        } 
        var tr = document.createElement('tr'); 
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td><td><span class="status-pill ${statusClass}" ${styleAdd}>${statusLabel}</span></td><td style="color:green; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</td><td>${btnActions}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'N/A';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'N/A';
    var atividade = buscarAtividadePorId(op.atividadeId)?.nome || 'N/A';
    
    var htmlAjudantes = 'Nenhum';
    if(op.ajudantes && op.ajudantes.length > 0) {
        htmlAjudantes = '<ul style="margin:0; padding-left:20px;">' + 
            op.ajudantes.map(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                return `<li>${f ? f.nome : 'Excluído'} (R$ ${formatarValorMoeda(aj.diaria)})</li>`;
            }).join('') + '</ul>';
    }

    var html = `
        <div style="font-size: 0.95rem; color:#333;">
            <div style="background:#f5f5f5; padding:10px; border-radius:6px; margin-bottom:15px; border-left: 4px solid var(--primary-color);">
                <h4 style="margin:0 0 5px 0; color:var(--primary-color);">RESUMO DA VIAGEM #${op.id.substr(-4)}</h4>
                <p><strong>Status:</strong> ${op.status}</p>
                <p><strong>Data:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                <p><strong>Cliente:</strong> ${cliente}</p>
                <p><strong>Atividade:</strong> ${atividade}</p>
                <p><strong>Veículo:</strong> ${op.veiculoPlaca}</p>
            </div>

            <div style="margin-bottom:15px;">
                <h4 style="border-bottom:1px solid #eee; padding-bottom:5px;">EQUIPE</h4>
                <p><strong>Motorista:</strong> ${nomeMot}</p>
                <p><strong>Ajudantes:</strong></p>
                ${htmlAjudantes}
            </div>

            <div style="background:#e8f5e9; padding:10px; border-radius:6px; margin-bottom:15px;">
                <h4 style="margin:0 0 10px 0; color:var(--success-color);">FINANCEIRO (ADMIN)</h4>
                <p><strong>Faturamento:</strong> ${formatarValorMoeda(op.faturamento)}</p>
                <p><strong>Adiantamento:</strong> ${formatarValorMoeda(op.adiantamento)}</p>
                <p><strong>Comissão Mot.:</strong> ${formatarValorMoeda(op.comissao)}</p>
            </div>

            <div style="background:#fff3e0; padding:10px; border-radius:6px; border:1px solid #ffe0b2;">
                <h4 style="margin:0 0 10px 0; color:#e65100;">DADOS DO MOTORISTA (CHECK-IN)</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <div><strong>KM Inicial:</strong> ${op.kmInicial || '-'}</div>
                    <div><strong>KM Final:</strong> ${op.kmFinal || '-'}</div>
                    <div><strong>KM Rodado:</strong> ${op.kmRodado || '-'}</div>
                    <div><strong>Abastecimento:</strong> ${formatarValorMoeda(op.combustivel)}</div>
                    <div><strong>Despesas/Pedágio:</strong> ${formatarValorMoeda(op.despesas)}</div>
                    <div><strong>Preço Litro:</strong> R$ ${op.precoLitro || '0,00'}</div>
                </div>
            </div>
        </div>
    `;

    var modalContent = document.getElementById('viewItemBody');
    var modalTitle = document.getElementById('viewItemTitle');
    if(modalContent) {
        modalTitle.textContent = "DETALHES DA OPERAÇÃO";
        modalContent.innerHTML = html;
        document.getElementById('viewItemModal').style.display = 'flex';
    }
};

window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };

function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }

window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (!f) return; document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email || ''; document.getElementById('funcTelefone').value = f.telefone; document.getElementById('funcPix').value = f.pix || ''; document.getElementById('funcEndereco').value = f.endereco || ''; toggleDriverFields(); if (f.funcao === 'motorista') { document.getElementById('funcCNH').value = f.cnh || ''; document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); window.scrollTo(0,0); };
window.preencherFormularioVeiculo = function(placa) { var v = buscarVeiculoPorPlaca(placa); if (!v) return; document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.getElementById('veiculoAno').value = v.ano; document.getElementById('veiculoRenavam').value = v.renavam || ''; document.getElementById('veiculoChassi').value = v.chassi || ''; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); };
window.preencherFormularioContratante = function(cnpj) { var c = buscarContratantePorCnpj(cnpj); if (!c) return; document.getElementById('contratanteCNPJ').value = c.cnpj; document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; document.getElementById('contratanteTelefone').value = c.telefone; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); };

window.preencherFormularioOperacao = function(id) { 
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); 
    if (!op) return; 
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
    
    var isAgendadaOuRota = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    document.getElementById('operacaoIsAgendamento').checked = isAgendadaOuRota;

    document.querySelector('[data-page="operacoes"]').click(); 
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 4: RELATÓRIOS INTELIGENTES, RECIBOS, MONITORAMENTO E SEGURANÇA
// =============================================================================

// -----------------------------------------------------------------------------
// 1. MONITORAMENTO DE ROTAS E EQUIPE (ADMIN)
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra: Ativas e SEM Falta do MOTORISTA (Falta mot cancela a visualização aqui, vai pra tabela de faltas)
    var ativas = CACHE_OPERACOES.filter(op => 
        (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO') && 
        op.status !== 'CANCELADA' &&
        (!op.checkins || !op.checkins.faltaMotorista)
    );

    if (ativas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhuma rota ativa ou agendada no momento.</td></tr>';
        return;
    }

    ativas.forEach(op => {
        // --- MOTORISTA ---
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome.split(' ')[0] : 'Motorista';
        
        var statusMotIcon = '⏳'; 
        var corMot = '#666';
        if (op.status === 'EM_ANDAMENTO') { statusMotIcon = '🚛 EM ROTA'; corMot = 'green'; }
        
        var btnFaltaMot = `<button class="btn-mini btn-danger" onclick="registrarFaltaIndividual('${op.id}', '${op.motoristaId}', 'motorista')" title="Marcar Falta Motorista"><i class="fas fa-user-times"></i></button>`;

        // --- AJUDANTES ---
        var htmlEquipe = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; border-bottom:1px dashed #eee; padding-bottom:2px;">
                            <span><strong>(Mot)</strong> ${nomeMot} <span style="font-size:0.7em; color:${corMot};">${statusMotIcon}</span></span>
                            ${btnFaltaMot}
                          </div>`;

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
             op.ajudantes.forEach(aj => {
                 var dadosAj = buscarFuncionarioPorId(aj.id);
                 var nomeAj = dadosAj ? dadosAj.nome.split(' ')[0] : 'Ajudante';
                 
                 var confirmou = (op.checkins && op.checkins.ajudantes && op.checkins.ajudantes[aj.id] === true);
                 var teveFalta = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id] === true);

                 var statusIcon = '⏳'; var corTexto = '#f57c00';
                 if (confirmou) { statusIcon = '✅'; corTexto = 'green'; }
                 if (teveFalta) { statusIcon = '❌ FALTA'; corTexto = 'red'; }

                 var btnAcaoAj = !teveFalta 
                    ? `<button class="btn-mini btn-danger" onclick="registrarFaltaIndividual('${op.id}', '${aj.id}', 'ajudante')" title="Marcar Falta"><i class="fas fa-user-times"></i></button>`
                    : `<button class="btn-mini btn-secondary" onclick="removerFaltaIndividual('${op.id}', '${aj.id}')" title="Remover Falta"><i class="fas fa-undo"></i></button>`;

                 htmlEquipe += `<div style="display:flex; align-items:center; justify-content:space-between; font-size:0.9em; margin-top:3px;">
                                    <span style="color:${corTexto};">${statusIcon} ${nomeAj}</span>
                                    ${btnAcaoAj}
                                </div>`;
             });
        }

        var statusGeral = op.status === 'EM_ANDAMENTO' 
            ? `<span class="status-pill" style="background:orange; color:white;">EM ANDAMENTO</span><br><small>KM: ${op.kmInicial}</small>`
            : `<span class="status-pill pill-pending">AGUARDANDO INÍCIO</span>`;

        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${op.veiculoPlaca}</strong></td><td>${htmlEquipe}</td><td>${statusGeral}</td><td style="text-align:center;">${op.status === 'AGENDADA' ? '<small>...</small>' : '<button class="btn-mini btn-primary"><i class="fas fa-map-marker-alt"></i></button>'}</td>`;
        tbody.appendChild(tr);
    });
};

window.registrarFaltaIndividual = function(opId, funcId, tipo) {
    if(!confirm(`Confirmar FALTA? O funcionário será removido do pagamento desta operação.`)) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(!op) return;
    if (!op.checkins) op.checkins = {};
    
    if (tipo === 'motorista') { op.checkins.faltaMotorista = true; } 
    else {
        if (!op.checkins.faltas) op.checkins.faltas = {};
        op.checkins.faltas[funcId] = true;
        if (op.checkins.ajudantes && op.checkins.ajudantes[funcId]) delete op.checkins.ajudantes[funcId];
    }
    salvarListaOperacoes(CACHE_OPERACOES).then(() => { preencherTodosSelects(); });
};

window.removerFaltaIndividual = function(opId, funcId) {
    if(!confirm("Remover a falta?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op && op.checkins && op.checkins.faltas) {
        delete op.checkins.faltas[funcId];
        salvarListaOperacoes(CACHE_OPERACOES).then(() => preencherTodosSelects());
    }
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var encontrouFalta = false;

    CACHE_OPERACOES.forEach(op => {
        if (!op.checkins) return;
        // Falta Motorista
        if (op.checkins.faltaMotorista) {
            encontrouFalta = true;
            var mot = buscarFuncionarioPorId(op.motoristaId);
            var tr = document.createElement('tr');
            tr.style.backgroundColor = '#ffebee';
            tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td>${mot ? mot.nome : 'N/A'}</td><td>MOTORISTA</td><td style="color:red; font-weight:bold;">FALTA REGISTRADA</td><td><button class="btn-mini btn-secondary" onclick="removerFaltaMotorista('${op.id}')"><i class="fas fa-undo"></i></button></td>`;
            tbody.appendChild(tr);
        }
        // Falta Ajudantes
        if (op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(ajudanteId => {
                if (op.checkins.faltas[ajudanteId] === true) {
                    encontrouFalta = true;
                    var aj = buscarFuncionarioPorId(ajudanteId);
                    var trAj = document.createElement('tr');
                    trAj.style.backgroundColor = '#ffebee';
                    trAj.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td>${aj ? aj.nome : 'N/A'}</td><td>AJUDANTE</td><td style="color:red; font-weight:bold;">FALTA REGISTRADA</td><td><button class="btn-mini btn-secondary" onclick="removerFaltaIndividual('${op.id}', '${ajudanteId}')"><i class="fas fa-undo"></i></button></td>`;
                    tbody.appendChild(trAj);
                }
            });
        }
    });
    if (!encontrouFalta) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma falta registrada.</td></tr>';
};

window.removerFaltaMotorista = function(opId) {
    if(!confirm("Remover falta do motorista?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op && op.checkins) {
        op.checkins.faltaMotorista = false;
        salvarListaOperacoes(CACHE_OPERACOES).then(() => preencherTodosSelects());
    }
};

// -----------------------------------------------------------------------------
// 2. GESTÃO DE SOLICITAÇÕES DE PERFIL
// -----------------------------------------------------------------------------

window.renderizarTabelaProfileRequests = function() {
    var tbody = document.querySelector('#tabelaProfileRequests tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var pendentes = CACHE_PROFILE_REQUESTS.filter(req => req.status === 'PENDENTE');

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }
    pendentes.forEach((req) => {
        var funcionario = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
        var nomeFunc = funcionario ? funcionario.nome : req.funcionarioEmail;
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(req.data.split('T')[0])}</td><td>${nomeFunc}</td><td>${req.campo}</td><td><strong>${req.valorNovo}</strong></td><td><button class="btn-mini btn-success" onclick="aprovarSolicitacaoPerfil('${req.id}')"><i class="fas fa-check"></i></button> <button class="btn-mini btn-danger" onclick="rejeitarSolicitacaoPerfil('${req.id}')"><i class="fas fa-times"></i></button></td>`;
        tbody.appendChild(tr);
    });
};

window.aprovarSolicitacaoPerfil = function(reqId) {
    var index = CACHE_PROFILE_REQUESTS.findIndex(r => r.id === reqId);
    if (index === -1) return;
    var req = CACHE_PROFILE_REQUESTS[index];
    if(!confirm("Aprovar alteração?")) return;
    var func = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
    if(func) {
        if(req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if(req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if(req.campo === 'PIX') func.pix = req.valorNovo;
        if(req.campo === 'CNH') func.cnh = req.valorNovo; 
        if(req.campo === 'VALIDADE_CNH') func.validadeCNH = req.valorNovo;
        if(req.campo === 'EMAIL') func.email = req.valorNovo; 
        salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    req.status = 'APROVADO';
    salvarProfileRequests(CACHE_PROFILE_REQUESTS);
};

window.rejeitarSolicitacaoPerfil = function(reqId) {
    if(!confirm("Recusar solicitação?")) return;
    var index = CACHE_PROFILE_REQUESTS.findIndex(r => r.id === reqId);
    if(index !== -1) {
        CACHE_PROFILE_REQUESTS[index].status = 'REJEITADO';
        salvarProfileRequests(CACHE_PROFILE_REQUESTS);
    }
};

// -----------------------------------------------------------------------------
// 3. RELATÓRIOS GERENCIAIS INTELIGENTES (NOVA LÓGICA)
// -----------------------------------------------------------------------------

window.gerarRelatorioGeral = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    
    // Filtros
    var filtroFuncionario = document.getElementById('selectMotoristaRelatorio').value;
    var filtroVeiculo = document.getElementById('selectVeiculoRelatorio').value;
    var filtroCliente = document.getElementById('selectContratanteRelatorio').value;
    var filtroAtividade = document.getElementById('selectAtividadeRelatorio').value;

    if (!dataIni || !dataFim) return alert("Por favor, selecione as datas inicial e final.");

    var divConteudo = document.getElementById('reportContent');
    document.getElementById('reportResults').style.display = 'block';

    // Header do Relatório
    var html = `<div style="text-align:center; margin-bottom:20px;">
                    <h2>RELATÓRIO GERENCIAL</h2>
                    <p>Período: ${formatarDataParaBrasileiro(dataIni)} a ${formatarDataParaBrasileiro(dataFim)}</p>
                </div>`;

    // Filtra Operações por Data e Status
    var opsFiltradas = CACHE_OPERACOES.filter(op => 
        op.status !== 'CANCELADA' && 
        op.data >= dataIni && 
        op.data <= dataFim
    );

    // Aplica Filtros Específicos
    if (filtroVeiculo) opsFiltradas = opsFiltradas.filter(op => op.veiculoPlaca === filtroVeiculo);
    if (filtroCliente) opsFiltradas = opsFiltradas.filter(op => op.contratanteCNPJ === filtroCliente);
    if (filtroAtividade) opsFiltradas = opsFiltradas.filter(op => op.atividadeId === filtroAtividade);

    // LÓGICA DO FILTRO DE FUNCIONÁRIO (Motorista OU Ajudante)
    if (filtroFuncionario) {
        opsFiltradas = opsFiltradas.filter(op => {
            var isMotorista = (op.motoristaId === filtroFuncionario);
            var isAjudante = op.ajudantes && op.ajudantes.some(aj => aj.id === filtroFuncionario);
            return isMotorista || isAjudante;
        });
    }

    if (opsFiltradas.length === 0) {
        divConteudo.innerHTML = html + "<p style='text-align:center'>Nenhum registro encontrado para os filtros selecionados.</p>";
        return;
    }

    // --- MODO: RELATÓRIO DO FUNCIONÁRIO (SE FILTRO SELECIONADO) ---
    if (filtroFuncionario) {
        var dadosFunc = buscarFuncionarioPorId(filtroFuncionario);
        html += `<h3 style="background:#e3f2fd; padding:10px;">EXTRATO INDIVIDUAL: ${dadosFunc ? dadosFunc.nome : 'FUNCIONÁRIO'}</h3>`;
        html += `<table class="data-table">
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>FUNÇÃO</th>
                            <th>CLIENTE / ROTA</th>
                            <th>STATUS</th>
                            <th>VALOR A RECEBER</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        var totalReceber = 0;
        var qtdFaltas = 0;

        opsFiltradas.forEach(op => {
            var isMotorista = (op.motoristaId === filtroFuncionario);
            var funcaoNaViagem = isMotorista ? 'MOTORISTA' : 'AJUDANTE';
            var valorNaViagem = 0;
            var teveFalta = false;

            if (isMotorista) {
                valorNaViagem = Number(op.comissao) || 0;
                if (op.checkins && op.checkins.faltaMotorista) teveFalta = true;
            } else {
                var dadosAj = op.ajudantes.find(a => a.id === filtroFuncionario);
                if (dadosAj) valorNaViagem = Number(dadosAj.diaria) || 0;
                if (op.checkins && op.checkins.faltas && op.checkins.faltas[filtroFuncionario]) teveFalta = true;
            }

            if (teveFalta) {
                qtdFaltas++;
                html += `<tr style="background:#ffebee; color:#c62828;">
                            <td>${formatarDataParaBrasileiro(op.data)}</td>
                            <td>${funcaoNaViagem}</td>
                            <td>${buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Cliente'}</td>
                            <td><strong>FALTA</strong></td>
                            <td>R$ 0,00</td>
                         </tr>`;
            } else {
                totalReceber += valorNaViagem;
                html += `<tr>
                            <td>${formatarDataParaBrasileiro(op.data)}</td>
                            <td>${funcaoNaViagem}</td>
                            <td>${buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Cliente'}</td>
                            <td>REALIZADO</td>
                            <td>${formatarValorMoeda(valorNaViagem)}</td>
                         </tr>`;
            }
        });

        html += `</tbody></table>
                 <div style="text-align:right; margin-top:15px; font-size:1.2rem;">
                    <p>Total de Serviços: <strong>${opsFiltradas.length}</strong></p>
                    <p style="color:red;">Faltas: <strong>${qtdFaltas}</strong></p>
                    <p style="background:#e8f5e9; padding:10px; display:inline-block; border:1px solid green;">
                        TOTAL A PAGAR: <strong>${formatarValorMoeda(totalReceber)}</strong>
                    </p>
                 </div>`;

    } else {
        // --- MODO: BALANÇO GERAL DA EMPRESA (SEM FILTRO DE FUNCIONÁRIO) ---
        html += `<h3 style="background:#e0f2f1; padding:10px;">BALANÇO FINANCEIRO GERAL</h3>`;
        html += `<table class="data-table" style="font-size:0.8rem;">
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>CLIENTE</th>
                            <th>VEÍCULO</th>
                            <th>FATURAMENTO</th>
                            <th>CUSTOS (Equipe+Comb+Desp)</th>
                            <th>LUCRO LÍQUIDO</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        var totFaturamento = 0;
        var totCustos = 0;
        var totLucro = 0;

        opsFiltradas.forEach(op => {
            var faturamento = Number(op.faturamento) || 0;
            
            // Custo 1: Motorista (se não faltou)
            var custoMot = (!op.checkins || !op.checkins.faltaMotorista) ? (Number(op.comissao) || 0) : 0;
            
            // Custo 2: Ajudantes (somar diárias de quem não faltou)
            var custoAj = 0;
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                    var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    if (!faltou) custoAj += (Number(aj.diaria) || 0);
                });
            }

            // Custo 3: Operacionais
            var custoOp = (Number(op.combustivel) || 0) + (Number(op.despesas) || 0);

            var custoTotalViagem = custoMot + custoAj + custoOp;
            var lucroViagem = faturamento - custoTotalViagem;

            totFaturamento += faturamento;
            totCustos += custoTotalViagem;
            totLucro += lucroViagem;

            html += `<tr>
                        <td>${formatarDataParaBrasileiro(op.data)}</td>
                        <td>${buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial.substring(0,15) || '-'}</td>
                        <td>${op.veiculoPlaca}</td>
                        <td style="color:#2e7d32;">${formatarValorMoeda(faturamento)}</td>
                        <td style="color:#c62828;">${formatarValorMoeda(custoTotalViagem)}</td>
                        <td style="font-weight:bold; color:${lucroViagem>=0?'green':'red'}">${formatarValorMoeda(lucroViagem)}</td>
                     </tr>`;
        });

        html += `</tbody></table>
                 <div style="display:flex; justify-content:space-around; background:#eee; padding:20px; border-radius:8px; margin-top:20px;">
                    <div style="text-align:center;">
                        <h4 style="color:#004d40;">RECEITA BRUTA</h4>
                        <span style="font-size:1.3rem;">${formatarValorMoeda(totFaturamento)}</span>
                    </div>
                    <div style="text-align:center;">
                        <h4 style="color:#c62828;">TOTAL DESPESAS</h4>
                        <span style="font-size:1.3rem;">${formatarValorMoeda(totCustos)}</span>
                    </div>
                    <div style="text-align:center;">
                        <h4 style="color:${totLucro>=0?'#1b5e20':'#b71c1c'};">LUCRO LÍQUIDO</h4>
                        <span style="font-size:1.5rem; font-weight:bold; color:${totLucro>=0?'#1b5e20':'#b71c1c'};">${formatarValorMoeda(totLucro)}</span>
                    </div>
                 </div>`;
    }

    divConteudo.innerHTML = html;
};

// -----------------------------------------------------------------------------
// 4. RELATÓRIO DE COBRANÇA (OBRIGATÓRIO CONTRATANTE)
// -----------------------------------------------------------------------------

window.gerarRelatorioCobranca = function() {
    var filtroCliente = document.getElementById('selectContratanteRelatorio').value;
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;

    if (!filtroCliente) return alert("ERRO: Para gerar Cobrança, você DEVE selecionar um CONTRATANTE no filtro.");
    if (!dataIni || !dataFim) return alert("Selecione o período.");

    var nomeCliente = buscarContratantePorCnpj(filtroCliente)?.razaoSocial || 'CLIENTE';
    
    var divConteudo = document.getElementById('reportContent');
    document.getElementById('reportResults').style.display = 'block';

    var ops = CACHE_OPERACOES.filter(op => 
        op.contratanteCNPJ === filtroCliente &&
        op.data >= dataIni &&
        op.data <= dataFim &&
        op.status !== 'CANCELADA' &&
        (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') // Só cobra o que foi feito
    );

    var html = `<div style="border:2px solid #333; padding:20px; background:#fff;">
                    <div style="text-align:center; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:20px;">
                        <h2>FATURA DE PRESTAÇÃO DE SERVIÇOS</h2>
                        <h3>${nomeCliente}</h3>
                        <p>Período: ${formatarDataParaBrasileiro(dataIni)} a ${formatarDataParaBrasileiro(dataFim)}</p>
                    </div>
                    <table class="data-table" style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f5f5f5; border-bottom:1px solid #000;">
                                <th style="text-align:left; padding:8px;">DATA</th>
                                <th style="text-align:left; padding:8px;">DESCRIÇÃO / VEÍCULO</th>
                                <th style="text-align:right; padding:8px;">VALOR (R$)</th>
                            </tr>
                        </thead>
                        <tbody>`;
    
    var total = 0;
    ops.forEach(op => {
        var val = Number(op.faturamento) || 0;
        total += val;
        var desc = buscarAtividadePorId(op.atividadeId)?.nome || 'SERVIÇO LOGÍSTICO';
        html += `<tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px;">${formatarDataParaBrasileiro(op.data)}</td>
                    <td style="padding:8px;">${desc} - Veículo: ${op.veiculoPlaca}</td>
                    <td style="text-align:right; padding:8px;">${formatarValorMoeda(val)}</td>
                 </tr>`;
    });

    html += `   </tbody>
                <tfoot>
                    <tr style="background:#eee; font-weight:bold;">
                        <td colspan="2" style="padding:10px; text-align:right;">TOTAL A PAGAR:</td>
                        <td style="padding:10px; text-align:right; font-size:1.2rem;">${formatarValorMoeda(total)}</td>
                    </tr>
                </tfoot>
             </table>
             <br>
             <p style="text-align:center; font-size:0.8rem;">Documento gerado eletronicamente por LogiMaster System.</p>
             </div>`;

    divConteudo.innerHTML = html;
};

// -----------------------------------------------------------------------------
// 5. EXPORTAÇÃO E OUTROS
// -----------------------------------------------------------------------------

window.exportarRelatorioPDF = function() { 
    var element = document.getElementById('reportContent'); 
    if(!element || element.innerHTML.trim() === "") return alert("Gere um relatório primeiro.");
    
    var opt = {
      margin:       10,
      filename:     'Relatorio_LogiMaster.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save(); 
};

window.gerarReciboPagamento = function() { /* Mantido lógica simples da versão anterior se necessário, ou expandir conforme demanda */ };

document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault();
        var novo = {
            id: Date.now().toString(),
            data: document.getElementById('despesaGeralData').value,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
            valor: document.getElementById('despesaGeralValor').value,
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelas: document.getElementById('despesaParcelas').value,
            parcelasPagas: document.getElementById('despesaParcelasPagas').value
        };
        CACHE_DESPESAS.push(novo);
        salvarListaDespesas(CACHE_DESPESAS).then(() => { alert("Despesa Lançada!"); e.target.reset(); renderizarTabelaDespesasGerais(); atualizarDashboard(); });
    }
});

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td style="color:red;">${formatarValorMoeda(d.valor)}</td><td>${d.modoPagamento}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td>`;
        tbody.appendChild(tr);
    });
}
window.excluirDespesa = function(id) { if(!confirm("Excluir?")) return; CACHE_DESPESAS = CACHE_DESPESAS.filter(d => d.id !== String(id)); salvarListaDespesas(CACHE_DESPESAS).then(() => renderizarTabelaDespesasGerais()); };

window.exportDataBackup = function() {
    var dataFull = { funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, contratantes: CACHE_CONTRATANTES, operacoes: CACHE_OPERACOES, minhaEmpresa: CACHE_MINHA_EMPRESA, despesas: CACHE_DESPESAS, atividades: CACHE_ATIVIDADES, profileRequests: CACHE_PROFILE_REQUESTS };
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataFull));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "backup_logimaster_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(event) {
        try {
            var jsonObj = JSON.parse(event.target.result);
            if (confirm("Isso substituirá TODOS os dados atuais. Confirmar?")) {
                CACHE_FUNCIONARIOS = jsonObj.funcionarios || []; CACHE_VEICULOS = jsonObj.veiculos || []; CACHE_CONTRATANTES = jsonObj.contratantes || []; CACHE_OPERACOES = jsonObj.operacoes || []; CACHE_MINHA_EMPRESA = jsonObj.minhaEmpresa || {}; CACHE_DESPESAS = jsonObj.despesas || []; CACHE_ATIVIDADES = jsonObj.atividades || []; CACHE_PROFILE_REQUESTS = jsonObj.profileRequests || [];
                salvarListaFuncionarios(CACHE_FUNCIONARIOS); salvarListaVeiculos(CACHE_VEICULOS); salvarListaContratantes(CACHE_CONTRATANTES); salvarListaOperacoes(CACHE_OPERACOES); salvarDadosMinhaEmpresa(CACHE_MINHA_EMPRESA); salvarListaDespesas(CACHE_DESPESAS); salvarListaAtividades(CACHE_ATIVIDADES); salvarProfileRequests(CACHE_PROFILE_REQUESTS);
                alert("Importação Concluída!"); window.location.reload();
            }
        } catch (e) { alert("Erro ao ler arquivo: " + e); }
    };
    reader.readAsText(event.target.files[0]);
};

window.resetSystemData = async function() {
    if (!window.USUARIO_ATUAL) return;
    var senhaConfirmacao = prompt("ATENÇÃO: ISSO APAGARÁ TUDO!\n\nPara confirmar, digite sua SENHA DE LOGIN:");
    if (!senhaConfirmacao) return;
    try {
        const { auth } = window.dbRef;
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        await signInWithEmailAndPassword(auth, window.USUARIO_ATUAL.email, senhaConfirmacao);
        if (confirm("Senha correta. TEM CERTEZA ABSOLUTA? Esta ação é irreversível.")) {
            localStorage.clear();
            alert("Sistema zerado com sucesso.");
            window.location.reload();
        }
    } catch (error) { alert("SENHA INCORRETA. Ação cancelada."); console.error(error); }
};

// GESTÃO DE EQUIPE (PAINEL ADMIN)
window.renderizarPainelEquipe = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs } = window.dbRef;
    const empresa = window.USUARIO_ATUAL.company;
    
    const tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if(tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        const q = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", true));
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
            const u = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>ATIVO</td><td><button class="btn-mini delete-btn" onclick="bloquearAcessoUsuario('${docSnap.id}')">Bloquear</button></td>`;
            tbodyAtivos.appendChild(tr);
        });
    }
    
    const tbodyPendentes = document.querySelector('#tabelaCompanyPendentes tbody');
    if(tbodyPendentes) {
        tbodyPendentes.innerHTML = '';
        const q2 = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", false));
        const snap2 = await getDocs(q2);
        snap2.forEach(docSnap => {
             const u = docSnap.data();
             const tr = document.createElement('tr');
             tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>PENDENTE</td><td><button class="btn-mini btn-success" onclick="aprovarUsuario('${docSnap.id}')">V</button> <button class="btn-mini btn-danger" onclick="excluirUsuarioPendente('${docSnap.id}')">X</button></td>`;
             tbodyPendentes.appendChild(tr);
        });
        var badge = document.getElementById('badgeAccess');
        if(badge) { badge.style.display = snap2.size > 0 ? 'inline-block' : 'none'; badge.textContent = snap2.size; }
    }
};

window.aprovarUsuario = async function(uid) { if(confirm("Aprovar?")) { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db,"users",uid), {approved:true}); renderizarPainelEquipe(); }};
window.bloquearAcessoUsuario = async function(uid) { if(confirm("Bloquear?")) { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db,"users",uid), {approved:false}); renderizarPainelEquipe(); }};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: NAVEGAÇÃO, INICIALIZAÇÃO, SINC AUTOMÁTICO E PAINEL DO FUNCIONÁRIO
// =============================================================================

function configurarNavegacao() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
            this.classList.add('active');
            var target = document.getElementById(pageId);
            if (target) { target.style.display = 'block'; setTimeout(() => target.classList.add('active'), 10); }
            
            // Ações específicas ao abrir páginas
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'despesas') renderizarTabelaDespesasGerais();
            if (pageId === 'checkins-pendentes') {
                // Força sync ao entrar para garantir status atualizado
                sincronizarDadosDaNuvem().then(() => preencherTodosSelects());
            }
            if (pageId === 'access-management') { renderizarPainelEquipe(); renderizarTabelaProfileRequests(); }
            
            if (pageId === 'employee-home' && window.USUARIO_ATUAL && window.USUARIO_ATUAL.role !== 'admin') { 
                verificarNovasMensagens();
                sincronizarDadosDaNuvem().then(() => renderizarPainelCheckinFuncionario());
            }
            if (pageId === 'meus-dados') { carregarDadosMeuPerfil(window.USUARIO_ATUAL.email); }
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
        };
    });

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
// SISTEMA DE MENSAGENS E SINC AUTOMÁTICO
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

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.querySelector('#modalNotification button');
    if(btn) { btn.removeAttribute('onclick'); btn.onclick = window.confirmarLeituraMensagem; }
    configurarNavegacao();
});

// -----------------------------------------------------------------------------
// FUNÇÕES DO PAINEL DO FUNCIONÁRIO (CHECK-IN, EQUIPE E FINALIZAÇÃO)
// -----------------------------------------------------------------------------

window.renderizarPainelCheckinFuncionario = function() {
    if (!window.USUARIO_ATUAL) return;
    var container = document.getElementById('listaServicosAgendados');
    if (!container) return;

    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    
    if (!funcionario) { 
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#c62828;"><strong>PERFIL NÃO VINCULADO</strong><br><small>Seu email não foi encontrado na base de funcionários.</small><br><button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)">Sincronizar</button></div>`; 
        return; 
    }

    // Filtra operações onde o usuário está envolvido
    var minhasOps = CACHE_OPERACOES.filter(op => {
        var souMotorista = String(op.motoristaId) === String(funcionario.id);
        var souAjudante = op.ajudantes && op.ajudantes.some(a => String(a.id) === String(funcionario.id));
        if (!souMotorista && !souAjudante) return false;
        
        // Exibe se estiver Agendada (Futuro/Hoje) ou Em Andamento.
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    });

    var btnRefresh = `<button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)" style="width:100%; margin-bottom:15px;"><i class="fas fa-sync"></i> ATUALIZAR LISTA</button>`;

    if (minhasOps.length === 0) {
        container.innerHTML = btnRefresh + '<p style="text-align:center; padding:20px; color:#666;">Nenhuma viagem ativa no momento.</p>';
        return;
    }

    var html = btnRefresh;
    minhasOps.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial : 'Cliente Diversos';
        var atividade = buscarAtividadePorId(op.atividadeId)?.nome || 'SERVIÇO';
        var statusColor = op.status==='AGENDADA' ? '#ff9800' : '#4caf50';
        
        // --- MONTAGEM DA EQUIPE ---
        var motNome = buscarFuncionarioPorId(op.motoristaId)?.nome || 'Motorista';
        var listaAjudantesStr = 'Nenhum';
        if(op.ajudantes && op.ajudantes.length > 0) {
            var nomesAj = op.ajudantes.map(aj => buscarFuncionarioPorId(aj.id)?.nome.split(' ')[0] || 'Desconhecido');
            listaAjudantesStr = nomesAj.join(', ');
        }
        
        var htmlEquipe = `
            <div style="background:#f0f4c3; padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid #dce775;">
                <div style="font-weight:bold; color:#827717; margin-bottom:5px; font-size:0.85rem;">EQUIPE ESCALADA:</div>
                <div style="font-size:0.9rem;"><strong>Motorista:</strong> ${motNome}</div>
                <div style="font-size:0.9rem;"><strong>Ajudantes:</strong> ${listaAjudantesStr}</div>
            </div>
        `;

        // --- BOTÕES DE AÇÃO ---
        var souMotorista = String(op.motoristaId) === String(funcionario.id);
        var btnAcao = '';

        if (souMotorista) {
            // Se for motorista
            if (op.status === 'AGENDADA') {
                btnAcao = `<button class="btn-primary" onclick="iniciarViagemFuncionario('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">INICIAR VIAGEM <i class="fas fa-play"></i></button>`;
            } else {
                var infoAndamento = `<div style="text-align:center; margin-bottom:10px; color:#2e7d32;"><strong>EM ROTA - KM INICIAL:</strong> ${op.kmInicial || 'Não informado'}</div>`;
                btnAcao = infoAndamento + `<button class="btn-danger" onclick="prepararFinalizacaoDriver('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">FINALIZAR VIAGEM <i class="fas fa-flag-checkered"></i></button>`;
            }
        } else {
            // Se for ajudante
            var jaConfirmou = (op.checkins && op.checkins.ajudantes && op.checkins.ajudantes[funcionario.id] === true);
            if (jaConfirmou) {
                btnAcao = `<div style="text-align:center; color:#2e7d32; padding:10px; font-weight:bold; border:1px solid #c8e6c9; background:#e8f5e9; border-radius:4px;">✅ PRESENÇA CONFIRMADA - AGUARDE O MOTORISTA</div>`;
            } else {
                btnAcao = `<button class="btn-success" onclick="confirmarPresencaAjudante('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">CONFIRMAR PRESENÇA (CHECK-IN) <i class="fas fa-check-circle"></i></button>`;
            }
        }

        html += `
            <div style="background:#fff; border-left:6px solid ${statusColor}; padding:20px; margin-bottom:20px; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 5px 0; color:#37474f;">${nomeCli}</h3>
                <p style="margin:0 0 10px 0; font-size:0.8rem; color:#78909c;">${atividade}</p>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px; font-size:0.9rem;">
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Veículo:</strong><br>${op.veiculoPlaca}</div>
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Data:</strong><br>${formatarDataParaBrasileiro(op.data)}</div>
                </div>
                
                ${htmlEquipe}
                ${btnAcao}
            </div>
        `;
    });
    container.innerHTML = html;
};

// --- AÇÕES DO MOTORISTA ---
window.iniciarViagemFuncionario = function(opId) {
    var kmPainel = prompt("Por favor, informe a QUILOMETRAGEM (KM) ATUAL do painel:");
    if(!kmPainel) return;
    if(isNaN(Number(kmPainel))) return alert("Por favor, digite apenas números.");

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        op.status = 'EM_ANDAMENTO';
        op.kmInicial = Number(kmPainel); 
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Boa viagem! Status alterado para EM ANDAMENTO.");
            renderizarPainelCheckinFuncionario();
        });
    }
};

window.prepararFinalizacaoDriver = function(opId) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(!op) return;

    var kmFinal = prompt(`KM Inicial: ${op.kmInicial || '?'}. \nInforme o KM FINAL do painel:`);
    if(!kmFinal) return;
    
    // Cálculo do KM Rodado
    var rodado = Number(kmFinal) - (op.kmInicial || 0);
    if(rodado < 0) rodado = 0;

    var despesas = prompt("Valor total de Pedágios/Despesas (R$)? (Se não houve, digite 0)", "0");
    if(despesas === null) return;

    var abastecimento = prompt("Valor total Abastecido (R$)? (Se não houve, digite 0)", "0");
    if(abastecimento === null) return;

    var precoLitro = "0";
    if(Number(abastecimento) > 0) {
        precoLitro = prompt("Preço do Litro (R$)?", "0");
        if(precoLitro === null) return;
    }

    var msg = `RESUMO DA FINALIZAÇÃO:\n\nKM Rodado: ${rodado} km\nDespesas: R$ ${despesas}\nAbastecimento: R$ ${abastecimento}\n\nConfirmar finalização?`;
    
    if(confirm(msg)) {
        // PREENCHIMENTO AUTOMÁTICO PARA O ADMIN
        op.kmFinal = Number(kmFinal);
        op.kmRodado = rodado;
        op.despesas = Number(despesas.replace(',','.'));
        op.combustivel = Number(abastecimento.replace(',','.'));
        op.precoLitro = Number(precoLitro.replace(',','.'));
        
        // ATUALIZA STATUS PARA O ADMIN VER
        op.status = 'FINALIZADA'; 
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Viagem Finalizada! Os dados foram enviados para o administrador.");
            renderizarPainelCheckinFuncionario();
        });
    }
};

// --- AÇÕES DO AJUDANTE ---
window.confirmarPresencaAjudante = function(opId) {
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email === window.USUARIO_ATUAL.email);
    if (!funcionario) return;

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        if(!op.checkins) op.checkins = {};
        if(!op.checkins.ajudantes) op.checkins.ajudantes = {};
        
        op.checkins.ajudantes[funcionario.id] = true;
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Presença confirmada!");
            renderizarPainelCheckinFuncionario();
        });
    }
};

// -----------------------------------------------------------------------------
// SINCRONIZAÇÃO E INICIALIZAÇÃO (CORRIGIDA)
// -----------------------------------------------------------------------------

// CORREÇÃO CRÍTICA: Filtro agora considera Motorista E Ajudante para exibir histórico financeiro
window.filtrarHistoricoFuncionario = function() {
    var tbody = document.querySelector('#tabelaHistoricoCompleto tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!window.USUARIO_ATUAL) return;

    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    
    if (!funcionario) {
        tbody.innerHTML = '<tr><td colspan="5">Funcionário não encontrado.</td></tr>';
        return;
    }

    var dataIni = document.getElementById('empDataInicio').value;
    var dataFim = document.getElementById('empDataFim').value;

    // Filtra Operações onde o funcionário participou
    var historico = CACHE_OPERACOES.filter(op => {
        var souMotorista = String(op.motoristaId) === String(funcionario.id);
        var souAjudante = false;
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            souAjudante = op.ajudantes.some(a => String(a.id) === String(funcionario.id));
        }

        // Se não faz parte da viagem, ignora
        if (!souMotorista && !souAjudante) return false;

        // Filtro de Data
        if (dataIni && op.data < dataIni) return false;
        if (dataFim && op.data > dataFim) return false;

        // Exibe apenas operações confirmadas/finalizadas ou que tenham falta registrada
        return op.status === 'CONFIRMADA' || op.status === 'FINALIZADA' || (op.checkins && (op.checkins.faltaMotorista || op.checkins.faltas));
    });

    if (historico.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum serviço encontrado no período.</td></tr>';
        document.getElementById('empTotalReceber').textContent = 'R$ 0,00';
        return;
    }

    var total = 0;

    historico.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var valorReceber = 0;
        var teveFalta = false;
        var funcaoNaViagem = '-';
        
        var souMotorista = String(op.motoristaId) === String(funcionario.id);

        // Lógica de valores e faltas
        if (souMotorista) {
            funcaoNaViagem = 'Motorista';
            valorReceber = Number(op.comissao) || 0;
            if (op.checkins && op.checkins.faltaMotorista) teveFalta = true;
        } else {
            funcaoNaViagem = 'Ajudante';
            var dadosAj = op.ajudantes.find(a => String(a.id) === String(funcionario.id));
            if (dadosAj) valorReceber = Number(dadosAj.diaria) || 0;
            // Verificar falta individual na lista de faltas
            if (op.checkins && op.checkins.faltas && op.checkins.faltas[funcionario.id]) teveFalta = true;
        }

        var statusHtml = '<span class="status-pill pill-active">REALIZADO</span>';
        var linhaStyle = '';

        if (teveFalta) {
            statusHtml = '<span class="status-pill pill-blocked">FALTA</span>';
            valorReceber = 0; // Se faltou, não recebe
            linhaStyle = 'background-color:#ffebee; color:#c62828;';
        } else {
            total += valorReceber;
        }

        var tr = document.createElement('tr');
        tr.style = linhaStyle;
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}<br><small>${funcaoNaViagem}</small></td>
            <td>${op.veiculoPlaca}</td>
            <td>${cliente}</td>
            <td>${formatarValorMoeda(valorReceber)}</td>
            <td>${statusHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    var elTotal = document.getElementById('empTotalReceber');
    if(elTotal) elTotal.textContent = formatarValorMoeda(total);
};

window.sincronizarDadosDaNuvem = async function(manual = false) {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;
    if(manual) { var btn = document.querySelector('button[onclick*="sincronizar"]'); if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...'; }
    
    const { db, doc, getDoc } = window.dbRef; const company = window.USUARIO_ATUAL.company;
    const carregarColecao = async (chave, varCache, callback) => { try { const docRef = doc(db, 'companies', company, 'data', chave); const snap = await getDoc(docRef); if (snap.exists()) { const dados = snap.data().items || []; localStorage.setItem(chave, JSON.stringify(dados)); callback(dados); } } catch (e) { console.error(`Erro sync ${chave}:`, e); } };
    
    await Promise.all([ 
        carregarColecao(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS, (d) => CACHE_FUNCIONARIOS = d), 
        carregarColecao(CHAVE_DB_OPERACOES, CACHE_OPERACOES, (d) => CACHE_OPERACOES = d), 
        carregarColecao(CHAVE_DB_VEICULOS, CACHE_VEICULOS, (d) => CACHE_VEICULOS = d), 
        carregarColecao(CHAVE_DB_CONTRATANTES, CACHE_CONTRATANTES, (d) => CACHE_CONTRATANTES = d), 
        carregarColecao(CHAVE_DB_ATIVIDADES, CACHE_ATIVIDADES, (d) => CACHE_ATIVIDADES = d), 
        carregarColecao(CHAVE_DB_MINHA_EMPRESA, CACHE_MINHA_EMPRESA, (d) => CACHE_MINHA_EMPRESA = d),
        carregarColecao(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS, (d) => CACHE_PROFILE_REQUESTS = d)
    ]);
    
    if(document.getElementById('tabelaCheckinsPendentes')) renderizarTabelaMonitoramento();
    if(document.getElementById('tabelaProfileRequests')) renderizarTabelaProfileRequests();
    
    if(manual) { 
        alert("Dados atualizados!"); 
        if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR LISTA'; 
        renderizarPainelCheckinFuncionario(); 
    }
};

// Inicialização do Sync Automático
function iniciarAutoSync() {
    if (window._intervaloMonitoramento) clearInterval(window._intervaloMonitoramento);
    // Executa a cada 10 segundos
    window._intervaloMonitoramento = setInterval(() => {
        if(window.USUARIO_ATUAL) {
            // Sincroniza silenciosamente para atualizar status no Admin e no Driver
            sincronizarDadosDaNuvem(false);
        }
    }, 10000); 
}

window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema para:", user.email, "| Role:", user.role);
    window.USUARIO_ATUAL = user;
    configurarNavegacao();
    
    // Inicia o ciclo de sincronização automática
    iniciarAutoSync();

    if (user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') { 
        document.getElementById('menu-admin').style.display = 'none'; 
        document.getElementById('menu-employee').style.display = 'none'; 
        document.getElementById('menu-super-admin').style.display = 'block'; 
        document.querySelector('[data-page="super-admin"]').click(); 
        setTimeout(carregarPainelSuperAdmin, 500); 
        return; 
    }
    
    carregarTodosDadosLocais();
    
    // Sync inicial
    if (CACHE_FUNCIONARIOS.length === 0 || user.role !== 'admin') { 
        await sincronizarDadosDaNuvem(); 
    }
    
    if (user.role === 'admin') { 
        document.getElementById('menu-admin').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = false; 
        preencherTodosSelects(); 
        setTimeout(() => { var btnHome = document.querySelector('[data-page="home"]'); if(btnHome) btnHome.click(); }, 100); 
    } else if (user.role === 'motorista' || user.role === 'ajudante') { 
        document.getElementById('menu-employee').style.display = 'block'; 
        window.MODO_APENAS_LEITURA = true; 
        setTimeout(() => { verificarNovasMensagens(); }, 2000); 
        renderizarPainelCheckinFuncionario(); 
        setTimeout(() => { var btnHomeEmp = document.querySelector('[data-page="employee-home"]'); if(btnHomeEmp) btnHomeEmp.click(); }, 100); 
    }
};

document.getElementById('mobileMenuBtn').onclick = function() { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebarOverlay').classList.add('active'); };
document.getElementById('sidebarOverlay').onclick = function() { document.getElementById('sidebar').classList.remove('active'); this.classList.remove('active'); };

function carregarDadosMeuPerfil(email) {
    var f = CACHE_FUNCIONARIOS.find(x => x.email && x.email.trim().toLowerCase() === email.trim().toLowerCase());
    var div = document.getElementById('meus-dados');
    if (f) {
        div.innerHTML = `<h2>MEUS DADOS</h2><div class="card"><h3>${f.nome} <span class="status-pill pill-active">${f.funcao}</span></h3><p><strong>CPF:</strong> ${f.documento}</p><p><strong>Tel:</strong> ${formatarTelefoneBrasil(f.telefone)}</p><p><strong>Pix:</strong> ${f.pix || '-'}</p><button class="btn-warning" onclick="document.getElementById('modalRequestProfileChange').style.display='block'" style="margin-top:15px;">SOLICITAR ALTERAÇÃO</button></div>`;
    } else { div.innerHTML = '<p>Dados não encontrados.</p>'; }
}

window.excluirUsuarioPendente = async function(uid) {
    if(!confirm("Excluir solicitação?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        alert("Removido.");
        renderizarPainelEquipe();
    } catch(e) { alert("Erro: " + e.message); }
};

document.addEventListener('submit', async function(e) { if (e.target.id === 'formCreateCompany') { /* ... */ } });
document.addEventListener('submit', async function(e) { if (e.target.id === 'formRequestProfileChange') { e.preventDefault(); var tipo = document.getElementById('reqFieldType').value; var novoValor = document.getElementById('reqNewValue').value; if (!window.USUARIO_ATUAL) return; var novaReq = { id: Date.now().toString(), data: new Date().toISOString(), funcionarioEmail: window.USUARIO_ATUAL.email, campo: tipo, valorNovo: novoValor, status: 'PENDENTE' }; CACHE_PROFILE_REQUESTS.push(novaReq); salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => { alert("Solicitação enviada para o administrador com sucesso!"); document.getElementById('modalRequestProfileChange').style.display='none'; e.target.reset(); }); } });
document.addEventListener('DOMContentLoaded', function() { configurarNavegacao(); });