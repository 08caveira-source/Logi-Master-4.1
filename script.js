// =============================================================================
// ARQUIVO: script.js
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
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

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); // Data base para o calendário e dashboard
window.chartInstance = null; // Instância do gráfico
window._operacaoAjudantesTempList = []; // Lista temporária de ajudantes na operação

// 3. CACHE LOCAL (Para evitar leituras repetitivas e lentidão)
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
    // Espera formato YYYY-MM-DD
    var partes = dataIso.split('-');
    if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
    return dataIso; // Retorna original se não for data válida
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

// Função Mestra de Salvamento (Sincroniza LocalStorage e Firebase)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e LocalStorage
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Sincroniza com Firebase (Se logado e com empresa definida)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            // Salva dentro da subcoleção 'data' da empresa
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), { 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            console.log("Sincronizado com nuvem: " + chave);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
        }
    }
}

// Wrappers específicos para facilitar leitura e manutenção
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

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
    // Se não estiver na tela de home ou gráficos, evita processamento desnecessário,
    // mas garante que os totais sejam calculados se requisitado.
    
    console.log("Calculando métricas do Dashboard...");
    
    // 1. Define o período base (Mês selecionado no calendário)
    var mesAtual = window.currentDate.getMonth(); // 0 a 11
    var anoAtual = window.currentDate.getFullYear();

    // 2. Variáveis de Acumulação
    var faturamentoMes = 0;
    var custosMes = 0; // Soma de: Combustível (Real/Caixa) + Despesas Op + Comissão + Ajudantes + Despesas Gerais
    var receitaHistorico = 0;
    
    // 3. Processar Operações (Receitas e Custos Diretos)
    CACHE_OPERACOES.forEach(function(op) {
        // Ignora operações canceladas
        if (op.status === 'CANCELADA') return;

        var valorFat = Number(op.faturamento) || 0;
        
        // No Dashboard Geral, mantemos o regime de CAIXA (o que realmente saiu do bolso no mês)
        var custoOp = (Number(op.despesas) || 0) + 
                      (Number(op.combustivel) || 0) + 
                      (Number(op.comissao) || 0);

        // Soma custo de ajudantes (se houver)
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => custoOp += (Number(aj.diaria) || 0));
        }

        // Histórico Total (Todo o tempo)
        receitaHistorico += valorFat;

        // Filtra pelo mês atual do calendário
        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // 4. Processar Despesas Gerais (Fora de Operação - Ex: Aluguel, Luz)
    CACHE_DESPESAS.forEach(function(desp) {
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            custosMes += (Number(desp.valor) || 0);
        }
    });

    // 5. Cálculos Finais
    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // 6. Atualização do DOM (Interface)
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(custosMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        // Muda cor conforme prejuízo ou lucro
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    // 7. Atualiza o Gráfico Visual
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (CHART.JS)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; // Se o elemento não existir na página atual, aborta

    // Destrói gráfico anterior para não sobrepor
    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    // Preparação dos dados
    var receita = 0;
    var combustivel = 0;
    var pessoal = 0; // Comissão + Ajudantes
    var manutencaoGeral = 0; // Despesas Op + Despesas Gerais
    
    // Filtro de dados para o gráfico
    CACHE_OPERACOES.forEach(op => {
        var d = new Date(op.data + 'T12:00:00');
        if (op.status !== 'CANCELADA' && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            
            pessoal += Number(op.comissao || 0);
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

    // Configuração do Chart.js
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'CUSTO COMBUSTÍVEL', 'PESSOAL (Mot/Ajud)', 'MANUTENÇÃO/GERAL', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: 'Resultados do Mês (R$)',
                data: [receita, combustivel, pessoal, manutencaoGeral, lucro],
                backgroundColor: [
                    'rgba(46, 125, 50, 0.7)',   // Faturamento (Verde Escuro)
                    'rgba(198, 40, 40, 0.7)',   // Combustível (Vermelho)
                    'rgba(255, 152, 0, 0.7)',   // Pessoal (Laranja)
                    'rgba(156, 39, 176, 0.7)',  // Manutenção (Roxo)
                    (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)') // Lucro
                ],
                borderColor: [
                    '#1b5e20', '#b71c1c', '#e65100', '#4a148c', '#000'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatarValorMoeda(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return 'R$ ' + value; } }
                }
            }
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

    grid.innerHTML = ''; // Limpa grid anterior
    
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    var nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.textContent = nomeMes.toUpperCase();

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
            
            cellContent += `<div class="event-dot"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            cell.onclick = (function(ds) {
                return function() { abrirModalDetalhesDia(ds); };
            })(dateStr);

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
    // 1. Filtra histórico COMPLETO do veículo
    var ops = CACHE_OPERACOES.filter(function(op) {
        return op.veiculoPlaca === placa && 
               op.status !== 'CANCELADA' &&
               Number(op.kmRodado) > 0 && 
               Number(op.combustivel) > 0 &&
               Number(op.precoLitro) > 0;
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    // 2. Soma Km e Litros de todas as viagens
    ops.forEach(function(op) {
        var valorAbastecido = Number(op.combustivel);
        var preco = Number(op.precoLitro);
        
        if (preco > 0) {
            var litros = valorAbastecido / preco;
            totalKm += Number(op.kmRodado);
            totalLitros += litros;
        }
    });

    // 3. Retorna Média Global
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

// Helper para obter preço médio do diesel (caso na operação do dia não tenha abastecimento)
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    
    // Pega as últimas 10 operações para uma média recente
    var ultimas = ops.slice(-10);
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

// =============================================================================
// MODAL DE DETALHES DO DIA (LÓGICA DE CONSUMO REFINADA)
// =============================================================================

window.abrirModalDetalhesDia = function(dataString) {
    var listaOperacoes = CACHE_OPERACOES;
    
    // Filtra operações do dia
    var operacoesDoDia = listaOperacoes.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'DETALHES COMPLETOS: ' + dataFormatada;

    // Totais do Dia
    var totalFaturamento = 0;
    var totalCustoCalculadoDiesel = 0;
    var totalOutrasDespesas = 0;

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;">';
    
    htmlLista += `
    <table class="data-table" style="width:100%; font-size:0.75rem; margin-bottom:0;">
        <thead>
            <tr style="background:#263238; color:white;">
                <th width="15%">CLIENTE</th>
                <th width="15%">VEÍCULO (MÉDIA GLOBAL)</th>
                <th width="20%">EQUIPE</th>
                <th width="30%">FINANCEIRO (FAT / CUSTO / LUCRO)</th>
                <th width="20%">CONSUMO CALCULADO</th>
            </tr>
        </thead>
        <tbody>
    `;

    operacoesDoDia.forEach(function(op) {
        // --- DADOS BÁSICOS ---
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome.split(' ')[0] : '---';
        var nomesAjudantes = [];
        if(op.ajudantes) op.ajudantes.forEach(aj => {
            var f = buscarFuncionarioPorId(aj.id);
            if(f) nomesAjudantes.push(f.nome.split(' ')[0]);
        });
        var stringEquipe = `<strong>Mot:</strong> ${nomeMot}` + (nomesAjudantes.length ? `<br><strong>Ajud:</strong> ${nomesAjudantes.join(', ')}` : '');
        
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        // --- CÁLCULOS FINANCEIROS ---
        var receita = Number(op.faturamento) || 0;
        
        // Custos Variáveis (Sem Combustível de Caixa)
        var custoPessoal = Number(op.comissao) || 0;
        if(op.ajudantes) op.ajudantes.forEach(aj => custoPessoal += (Number(aj.diaria)||0));
        var custoExtra = Number(op.despesas) || 0;
        
        // --- CÁLCULO DE CONSUMO (BASEADO NA MÉDIA GLOBAL) ---
        var kmNaViagem = Number(op.kmRodado) || 0;
        var mediaGlobal = calcularMediaGlobalVeiculo(op.veiculoPlaca);
        var precoLitroRef = Number(op.precoLitro) > 0 ? Number(op.precoLitro) : obterPrecoMedioCombustivel(op.veiculoPlaca);
        
        // Se não tiver preço nem média, assume 0
        var custoDieselCalculado = 0;
        if (mediaGlobal > 0 && kmNaViagem > 0 && precoLitroRef > 0) {
            var litrosConsumidos = kmNaViagem / mediaGlobal;
            custoDieselCalculado = litrosConsumidos * precoLitroRef;
        }

        // --- CUSTO TOTAL DA VIAGEM E LUCRO ---
        // Aqui o custo do diesel é o CALCULADO, não o valor do abastecimento no posto.
        var custoTotalViagem = custoPessoal + custoExtra + custoDieselCalculado;
        var lucroOp = receita - custoTotalViagem;

        // Acumula Totais
        totalFaturamento += receita;
        totalCustoCalculadoDiesel += custoDieselCalculado;
        totalOutrasDespesas += (custoPessoal + custoExtra);

        // HTML da Linha
        htmlLista += `
            <tr style="border-bottom:1px solid #ddd;">
                <td>
                    <span style="font-weight:bold; color:#555;">${nomeCli}</span><br>
                    <small>#${op.id.toString().substr(-4)}</small>
                </td>
                <td>
                    <strong>${op.veiculoPlaca}</strong><br>
                    <small style="color:${mediaGlobal > 0 ? 'blue' : '#999'}">
                        G: ${mediaGlobal > 0 ? mediaGlobal.toFixed(2) + ' Km/L' : 'S/ Dados'}
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

    // Atualiza Resumo
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
            <div style="text-align:center; font-size:0.7rem; color:#666; margin-bottom:5px;">
                *O custo de diesel é calculado com base na Média Global do veículo e na KM percorrida hoje, não no valor abastecido na bomba.
            </div>
        `;
    }

    modalBody.innerHTML = htmlLista || '<p style="text-align:center; padding:20px;">Nenhuma operação registrada neste dia.</p>';
    
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E INTERFACE DE FORMULÁRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// 9. LISTENERS DE FORMULÁRIOS (SALVAR DADOS)
// -----------------------------------------------------------------------------

// Salvar Funcionário
// ATUALIZAÇÃO DA LÓGICA DE SALVAR FUNCIONÁRIO (INTEGRAÇÃO FIREBASE)
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

            // Verifica se é novo cadastro e se tem senha para criar login
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);

            var novoUID = id; // Por padrão usa o timestamp, mas se criar auth usa o UID real

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                // 1. Cria no Firebase Auth (Backend)
                console.log("Criando usuário no Auth...");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // 2. Cria o perfil público na coleção 'users'
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID,
                    name: nome,
                    email: email,
                    role: funcao,
                    company: window.USUARIO_ATUAL.company, // Vincula à empresa do Admin
                    createdAt: new Date().toISOString(),
                    approved: true
                });
            }

            var funcionarioObj = {
                id: novoUID, // Usa o UID do Firebase se criado
                nome: nome,
                funcao: funcao,
                documento: document.getElementById('funcDocumento').value,
                email: email,
                telefone: document.getElementById('funcTelefone').value,
                pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                cnh: funcao === 'motorista' ? document.getElementById('funcCNH').value : '',
                validadeCNH: funcao === 'motorista' ? document.getElementById('funcValidadeCNH').value : '',
                categoriaCNH: funcao === 'motorista' ? document.getElementById('funcCategoriaCNH').value : '',
                cursoDescricao: funcao === 'motorista' ? document.getElementById('funcCursoDescricao').value : ''
            };

            // Atualiza lista local
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário salvo e acesso criado com sucesso!");
            e.target.reset();
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields();
            preencherTodosSelects();

        } catch (erro) {
            console.error(erro);
            alert("Erro ao salvar: " + (erro.message || erro));
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = textoOriginal;
        }
    }
});

// Salvar Veículo
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
        // Remove anterior se for edição (baseado na placa antiga ou lógica de ID se houvesse)
        // Aqui assumimos Placa como chave única simples
        var lista = CACHE_VEICULOS.filter(v => v.placa !== placa);
        lista.push(novo);
        
        salvarListaVeiculos(lista).then(() => {
            alert("Veículo Salvo!");
            e.target.reset();
            preencherTodosSelects();
        });
    }
});

// Salvar Contratante
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

// Salvar Atividade (RESTAURADO)
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
            preencherTodosSelects(); // Atualiza o select na tela de operações
        });
    }
});

// Salvar Dados da Empresa
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
// 10. SALVAR OPERAÇÃO (LÓGICA PRINCIPAL)
// -----------------------------------------------------------------------------

document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;

        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se estiver editando uma já finalizada, mantém status, a menos que mude propositalmente
        // Mas por padrão, se checkbox marcado = Agendada. Se desmarcado = Confirmada.

        var novaOp = {
            id: idHidden || Date.now().toString(),
            data: document.getElementById('operacaoData').value,
            motoristaId: document.getElementById('selectMotoristaOperacao').value,
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value, // CAMPO RESTAURADO
            
            // Financeiro
            faturamento: document.getElementById('operacaoFaturamento').value,
            adiantamento: document.getElementById('operacaoAdiantamento').value,
            comissao: document.getElementById('operacaoComissao').value,
            despesas: document.getElementById('operacaoDespesas').value,
            combustivel: document.getElementById('operacaoCombustivel').value,
            precoLitro: document.getElementById('operacaoPrecoLitro').value,
            kmRodado: document.getElementById('operacaoKmRodado').value,
            
            status: statusFinal,
            
            // Preserva dados de sistema (checkins) se for edição
            checkins: opAntiga ? opAntiga.checkins : { motorista: false, ajudantes: [] },
            
            // Salva a lista de ajudantes adicionados manualmente
            ajudantes: window._operacaoAjudantesTempList || []
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert(isAgendamento ? "Operação Agendada com Sucesso!" : "Operação Salva e Confirmada!");
            e.target.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            
            window._operacaoAjudantesTempList = []; // Limpa temp
            renderizarListaAjudantesAdicionados();
            
            preencherTodosSelects();
            renderizarCalendario();
            atualizarDashboard();
        });
    }
});

// -----------------------------------------------------------------------------
// 11. FUNÇÕES DE INTERFACE (UI HELPERS)
// -----------------------------------------------------------------------------

window.toggleDriverFields = function() {
    var select = document.getElementById('funcFuncao');
    var divMotorista = document.getElementById('driverSpecificFields');
    
    if (select && divMotorista) {
        divMotorista.style.display = (select.value === 'motorista') ? 'block' : 'none';
        
        // Se não for motorista, limpa campos obrigatórios para não travar HTML5 validation
        var inputs = divMotorista.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (select.value !== 'motorista') input.value = '';
        });
    }
};

window.toggleDespesaParcelas = function() {
    var modo = document.getElementById('despesaModoPagamento').value;
    var div = document.getElementById('divDespesaParcelas');
    if (div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
};

// Gerenciamento de Ajudantes na Tela de Operação
window.renderizarListaAjudantesAdicionados = function() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    
    ul.innerHTML = '';
    (window._operacaoAjudantesTempList || []).forEach(item => {
        var func = buscarFuncionarioPorId(item.id);
        var nome = func ? func.nome : 'Desconhecido';
        
        var li = document.createElement('li');
        li.innerHTML = `
            <span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span>
            <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>
        `;
        ul.appendChild(li);
    });
};

window.removerAjudanteTemp = function(id) {
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id));
    renderizarListaAjudantesAdicionados();
};

document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() {
    var sel = document.getElementById('selectAjudantesOperacao');
    var idAj = sel.value;
    if (!idAj) return alert("Selecione um ajudante na lista primeiro.");
    
    // Verifica duplicidade
    if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) {
        return alert("Este ajudante já está na lista.");
    }

    var valor = prompt("Informe o valor da diária para este ajudante (ex: 80.00):");
    if (valor) {
        var valNum = Number(valor.replace(',', '.'));
        if (isNaN(valNum)) return alert("Valor inválido.");
        
        window._operacaoAjudantesTempList.push({ id: idAj, diaria: valNum });
        renderizarListaAjudantesAdicionados();
        sel.value = ""; // Reseta select
    }
});


// -----------------------------------------------------------------------------
// 12. PREENCHIMENTO DE SELECTS E TABELAS
// -----------------------------------------------------------------------------

function preencherTodosSelects() {
    console.log("Atualizando selects e tabelas...");
    
    // Helper interno
    const fill = (id, dados, valKey, textKey, defText) => {
        var el = document.getElementById(id);
        if (!el) return;
        var atual = el.value;
        el.innerHTML = `<option value="">${defText}</option>` + 
            dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join('');
        if(atual) el.value = atual; // Tenta manter seleção
    };

    // Operações
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...'); // RESTAURADO
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');

    // Relatórios
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES'); // NOVO FILTRO

    // Recibos
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    fill('selectVeiculoRecibo', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');

    // Despesas Gerais
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'SEM VÍNCULO (GERAL)');
    
    // Mensagens Admin
    fill('msgRecipientSelect', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');

    // Renderiza Tabelas
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades(); // RESTAURADO
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    // Funções de Monitoramento (se estiverem definidas na parte 4 ou anteriores)
    if(typeof renderizarTabelaMonitoramento === 'function') renderizarTabelaMonitoramento();
}

// Renderizadores de Tabelas Individuais

function renderizarTabelaFuncionarios() {
    var tbody = document.querySelector('#tabelaFuncionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    CACHE_FUNCIONARIOS.forEach(f => {
        var tr = document.createElement('tr');
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
        `;
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
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>
        `;
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
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>
        `;
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
        var btnActions = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>
        `;
        tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`;
        tbody.appendChild(tr);
    });
}

function renderizarTabelaOperacoes() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordena por data (mais recente primeiro)
    var lista = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data));
    
    lista.forEach(op => {
        if(op.status === 'CANCELADA') return; // Opcional: mostrar ou não canceladas
        
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome : 'Excluído';
        var statusClass = op.status === 'CONFIRMADA' ? 'pill-active' : (op.status === 'EM_ANDAMENTO' ? 'pill-active' : 'pill-pending');
        var statusStyle = op.status === 'EM_ANDAMENTO' ? 'style="background:orange;"' : '';
        
        var btnActions = `<button class="btn-mini btn-primary" onclick="alert('Use o calendário ou relatório para detalhes completos.')"><i class="fas fa-eye"></i></button>`;
        
        if (!window.MODO_APENAS_LEITURA) {
            btnActions = `
                <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>
            `;
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td>
            <td><span class="status-pill ${statusClass}" ${statusStyle}>${op.status}</span></td>
            <td style="color:green; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</td>
            <td>${btnActions}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarInformacoesEmpresa() {
    var div = document.getElementById('viewMinhaEmpresaContent');
    if (CACHE_MINHA_EMPRESA.razaoSocial) {
        div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`;
    } else {
        div.innerHTML = "Nenhum dado cadastrado.";
    }
}

// -----------------------------------------------------------------------------
// 13. FUNÇÕES DE EDIÇÃO E EXCLUSÃO (AUXILIARES)
// -----------------------------------------------------------------------------

window.preencherFormularioFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;
    document.getElementById('funcionarioId').value = f.id;
    document.getElementById('funcNome').value = f.nome;
    document.getElementById('funcFuncao').value = f.funcao;
    document.getElementById('funcDocumento').value = f.documento;
    document.getElementById('funcEmail').value = f.email || '';
    document.getElementById('funcTelefone').value = f.telefone;
    document.getElementById('funcPix').value = f.pix || '';
    document.getElementById('funcEndereco').value = f.endereco || '';
    
    toggleDriverFields(); // Exibe campos se for motorista
    if (f.funcao === 'motorista') {
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || '';
    }
    
    // Navegação
    document.querySelector('[data-page="cadastros"]').click();
    document.querySelector('[data-tab="funcionarios"]').click();
    window.scrollTo(0,0);
};

window.preencherFormularioVeiculo = function(placa) {
    var v = buscarVeiculoPorPlaca(placa);
    if (!v) return;
    document.getElementById('veiculoPlaca').value = v.placa;
    document.getElementById('veiculoModelo').value = v.modelo;
    document.getElementById('veiculoAno').value = v.ano;
    document.getElementById('veiculoRenavam').value = v.renavam || '';
    document.getElementById('veiculoChassi').value = v.chassi || '';
    
    document.querySelector('[data-page="cadastros"]').click();
    document.querySelector('[data-tab="veiculos"]').click();
};

window.preencherFormularioContratante = function(cnpj) {
    var c = buscarContratantePorCnpj(cnpj);
    if (!c) return;
    document.getElementById('contratanteCNPJ').value = c.cnpj;
    document.getElementById('contratanteRazaoSocial').value = c.razaoSocial;
    document.getElementById('contratanteTelefone').value = c.telefone;
    
    document.querySelector('[data-page="cadastros"]').click();
    document.querySelector('[data-tab="contratantes"]').click();
};

window.preencherFormularioOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;
    
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');

    // Restaura lista de ajudantes
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderizarListaAjudantesAdicionados();

    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo(0,0);
};

// Funções de Exclusão Simples
window.excluirFuncionario = function(id) {
    if(!confirm("Excluir Funcionário?")) return;
    salvarListaFuncionarios(CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id))).then(() => preencherTodosSelects());
};
window.excluirVeiculo = function(placa) {
    if(!confirm("Excluir Veículo?")) return;
    salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects());
};
window.excluirContratante = function(cnpj) {
    if(!confirm("Excluir Cliente?")) return;
    salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects());
};
window.excluirAtividade = function(id) {
    if(!confirm("Excluir este tipo de serviço?")) return;
    salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects());
};
window.excluirOperacao = function(id) {
    if(!confirm("Tem certeza? Isso removerá a operação do financeiro.")) return;
    salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => {
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
    });
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: NAVEGAÇÃO, INICIALIZAÇÃO E SUPER ADMIN (FINAL)
// =============================================================================

// -----------------------------------------------------------------------------
// 18. NAVEGAÇÃO E INICIALIZAÇÃO DO SISTEMA
// -----------------------------------------------------------------------------

function configurarNavegacao() {
    // Menu Links
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            
            // Remove active de todos
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none';
            });
            
            // Ativa o atual
            this.classList.add('active');
            var target = document.getElementById(pageId);
            if (target) {
                target.style.display = 'block';
                // Timeout para animação CSS fadeUp funcionar
                setTimeout(() => target.classList.add('active'), 10);
            }
            
            // Renderizações Específicas ao entrar na página
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'despesas') renderizarTabelaDespesasGerais();
            if (pageId === 'checkins-pendentes' && typeof renderizarTabelaMonitoramento === 'function') renderizarTabelaMonitoramento();
            if (pageId === 'access-management' && typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
            
            // Fecha menu mobile se estiver aberto
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
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

// BOOTSTRAP DO SISTEMA (ATUALIZADO PARA SUPORTE MASTER)
window.initSystemByRole = function(user) {
    console.log("Inicializando sistema para:", user.email, "| Role:", user.role);
    window.USUARIO_ATUAL = user;

    // VERIFICAÇÃO DE SUPER ADMIN (EMAIL HARDCODED)
    if (user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') {
        console.log(">>> MODO SUPER ADMIN ATIVADO <<<");
        
        // Esconde menus comuns
        document.getElementById('menu-admin').style.display = 'none';
        document.getElementById('menu-employee').style.display = 'none';
        
        // Mostra menu Super Admin
        var menuSuper = document.getElementById('menu-super-admin');
        if(menuSuper) menuSuper.style.display = 'block';
        
        // Inicia Painel Global
        configurarNavegacao();
        document.querySelector('[data-page="super-admin"]').click();
        
        // Carrega dados globais
        setTimeout(carregarPainelSuperAdmin, 500);
        return; // Encerra aqui para não carregar lógicas de empresas comuns
    }

    // FLUXO NORMAL (EMPRESAS COMUNS)
    carregarTodosDadosLocais();
    
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        window.MODO_APENAS_LEITURA = false;
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
        renderizarTabelaDespesasGerais();
        document.querySelector('[data-page="home"]').click();

    } else if (user.role === 'motorista' || user.role === 'ajudante') {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        carregarDadosMeuPerfil(user.email);
        document.querySelector('[data-page="employee-home"]').click();
    } else {
        alert("Função de usuário desconhecida.");
    }
    
    configurarNavegacao();
};

// Listener Mobile Menu
document.getElementById('mobileMenuBtn').onclick = function() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
};
document.getElementById('sidebarOverlay').onclick = function() {
    document.getElementById('sidebar').classList.remove('active');
    this.classList.remove('active');
};

function carregarDadosMeuPerfil(email) {
    // Procura o funcionário pelo email do login para preencher "Meus Dados"
    var f = CACHE_FUNCIONARIOS.find(x => x.email === email);
    if (f) {
        document.getElementById('meuPerfilNome').value = f.nome;
        document.getElementById('meuPerfilDoc').value = f.documento;
        document.getElementById('meuPerfilFuncao').value = f.funcao;
        document.getElementById('meuPerfilTel').value = f.telefone;
        document.getElementById('meuPerfilPix').value = f.pix || '';
        document.getElementById('meuPerfilEndereco').value = f.endereco || '';
        
        if(f.funcao === 'motorista') {
            document.getElementById('meuPerfilCNHGroup').style.display = 'block';
            document.getElementById('meuPerfilValidadeCNHGroup').style.display = 'block';
            document.getElementById('meuPerfilCNH').value = f.cnh || '';
            document.getElementById('meuPerfilValidadeCNH').value = f.validadeCNH || '';
        }
    }
}

// Inicia listeners globais
document.addEventListener('DOMContentLoaded', function() {
    configurarNavegacao();
});

// =============================================================================
// MÓDULO SUPER ADMIN (GOD MODE)
// =============================================================================

window.GLOBAL_DATA_CACHE = {}; // Cache para o Super Admin

window.carregarPainelSuperAdmin = async function(forceRefresh = false) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;
    
    if (forceRefresh) container.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Varrendo banco de dados global...</p>';

    const { db, collection, getDocs } = window.dbRef;

    try {
        // ESTRATÉGIA HÍBRIDA: Varre a coleção 'users' para descobrir todos os domínios únicos e usuários.
        var usersSnap = await getDocs(collection(db, "users"));
        var mapEmpresas = {}; // Objeto para agrupar: { 'dominio.com': [lista de users] }

        usersSnap.forEach((docUser) => {
            var u = docUser.data();
            var dom = u.company || 'SEM_EMPRESA';
            
            if (!mapEmpresas[dom]) mapEmpresas[dom] = [];
            mapEmpresas[dom].push({ ...u, uid: docUser.id }); // Guarda ID real do Auth/Doc
        });

        // Renderização
        container.innerHTML = '';
        var dominios = Object.keys(mapEmpresas).sort();

        dominios.forEach(dom => {
            // Conta tipos
            var users = mapEmpresas[dom];
            var admins = users.filter(u => u.role === 'admin').length;
            var func = users.length - admins;

            // HTML do Bloco da Empresa
            var div = document.createElement('div');
            div.className = 'company-block';
            div.innerHTML = `
                <div class="company-header" onclick="toggleCompanyBlock(this)">
                    <h4><i class="fas fa-building"></i> ${dom.toUpperCase()}</h4>
                    <span class="company-meta">${users.length} Usuários (${admins} Adm / ${func} Func)</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="company-content">
                    <table class="data-table" style="width:100%">
                        <thead>
                            <tr style="background:#f5f5f5">
                                <th>NOME</th>
                                <th>EMAIL</th>
                                <th>FUNÇÃO</th>
                                <th>AÇÕES GERAIS</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-${dom.replace(/\./g, '_')}">
                            ${users.map(u => `
                                <tr>
                                    <td>${u.name || '-'}</td>
                                    <td>${u.email}</td>
                                    <td><span class="status-pill ${u.role==='admin'?'pill-active':'pill-pending'}">${u.role}</span></td>
                                    <td>
                                        <button class="btn-mini edit-btn" onclick="superAdminResetPass('${u.email}')" title="Resetar Senha"><i class="fas fa-key"></i></button>
                                        <button class="btn-mini delete-btn" onclick="superAdminDeleteUser('${u.uid}', '${dom}')" title="Excluir Usuário"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="margin-top:10px; text-align:right;">
                        <button class="btn-mini btn-danger" onclick="superAdminDeleteCompany('${dom}')"><i class="fas fa-skull"></i> DESTRUIR EMPRESA INTEIRA</button>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error("Erro Super Admin:", e);
        container.innerHTML = '<p style="color:red">Erro ao carregar dados globais: ' + e.message + '</p>';
    }
};

window.toggleCompanyBlock = function(header) {
    var content = header.nextElementSibling;
    var icon = header.querySelector('.fa-chevron-down');
    
    if (content.style.display === 'block') {
        content.style.display = 'none';
        if(icon) icon.style.transform = 'rotate(0deg)';
    } else {
        content.style.display = 'block';
        if(icon) icon.style.transform = 'rotate(180deg)';
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

// Ações do Super Admin

window.superAdminResetPass = function(email) {
    alert("Para segurança, a função de Reset envia um e-mail para o usuário.\nEnviando para: " + email);
    
    if (window.dbRef.sendReset) {
         window.dbRef.sendReset(email)
            .then(() => alert("E-mail de redefinição enviado!"))
            .catch(e => alert("Erro: " + e.message));
    } else {
        alert("Função de reset não mapeada no window.dbRef. Atualize o módulo do index.html.");
    }
};

window.superAdminDeleteUser = async function(uid, domain) {
    if(!confirm("TEM CERTEZA? Isso removerá o acesso deste usuário.\n(Nota: Dados históricos em operações podem permanecer, mas o login será revogado).")) return;
    
    const { db, doc, deleteDoc } = window.dbRef;
    try {
        // 1. Remove da coleção 'users' (Login)
        await deleteDoc(doc(db, "users", uid));
        
        // 2. Tenta remover da lista de funcionários da empresa (db_funcionarios)
        var empresaRef = doc(db, 'companies', domain, 'data', 'db_funcionarios');
        var snap = await window.dbRef.getDoc(empresaRef);
        if (snap.exists()) {
            var dados = snap.data();
            var novaLista = (dados.items || []).filter(u => u.id !== uid && u.email !== uid);
            
            await window.dbRef.setDoc(empresaRef, { items: novaLista }, { merge: true });
        }
        
        alert("Usuário removido.");
        carregarPainelSuperAdmin(false); 
    } catch(e) {
        alert("Erro ao excluir: " + e.message);
    }
};

// Listener para criar nova empresa (Super Admin)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        
        var domain = document.getElementById('newCompanyDomain').value.toLowerCase().trim();
        var email = document.getElementById('newAdminEmail').value.toLowerCase().trim();
        var pass = document.getElementById('newAdminPassword').value;
        
        if(domain.indexOf('.') === -1) return alert("Domínio inválido (ex: empresa.com)");
        
        const { db, doc, setDoc } = window.dbRef;
        
        try {
            // Cria estrutura da empresa
            await setDoc(doc(db, 'companies', domain, 'data', 'config'), {
                createdAt: new Date().toISOString(),
                createdBy: 'SUPER_ADMIN'
            });
            
            var adminData = {
                id: 'admin_' + Date.now(),
                nome: 'ADMINISTRADOR ' + domain.toUpperCase(),
                email: email,
                funcao: 'admin',
                role: 'admin'
            };
            
            // Salva na lista de funcionários da empresa
            await setDoc(doc(db, 'companies', domain, 'data', 'db_funcionarios'), {
                items: [adminData],
                lastUpdate: new Date().toISOString()
            });

            alert(`AMBIENTE '${domain}' PREPARADO!\n\nInstrução:\nPeça para o cliente acessar o sistema e se CADASTRAR com o email: ${email}.\nO sistema irá reconhecê-lo automaticamente como ADMIN desta empresa.`);
            
            e.target.reset();
            carregarPainelSuperAdmin(true);

        } catch (err) {
            console.error(err);
            alert("Erro ao criar estrutura: " + err.message);
        }
    }
});

// =============================================================================
// REATIVAR FORMULÁRIOS (GARANTIA DE FUNCIONAMENTO)
// =============================================================================

// Esta função reescreve o comportamento do formulário para garantir que funcione
(function reativarFormularioOperacao() {
    var formOp = document.getElementById('formOperacao');
    if (!formOp) return;

    // Remove clones antigos para evitar duplicação
    var novoForm = formOp.cloneNode(true);
    formOp.parentNode.replaceChild(novoForm, formOp);

    novoForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        try {
            var idHidden = document.getElementById('operacaoId').value;
            var lista = window.CACHE_OPERACOES ? window.CACHE_OPERACOES.slice() : [];
            var antiga = idHidden ? lista.find(function(o) { return String(o.id) === String(idHidden); }) : null;
            
            var novoId = idHidden ? idHidden : Date.now().toString();
            
            var novaOp = {
                id: novoId,
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
                
                status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA',
                
                // Preserva dados internos
                checkins: antiga ? antiga.checkins : { motorista: false, ajudantes: [] },
                kmInicial: antiga ? antiga.kmInicial : 0,
                kmFinal: antiga ? antiga.kmFinal : 0,
                ajudantes: window._operacaoAjudantesTempList || []
            };

            if (idHidden) {
                // Atualiza existente
                lista = lista.map(function(o) { return String(o.id) === String(idHidden) ? novaOp : o; });
            } else {
                // Adiciona nova
                lista.push(novaOp);
            }
            
            // Salva
            salvarListaOperacoes(lista).then(function() {
                alert("Operação salva com sucesso!");
                novoForm.reset(); 
                document.getElementById('operacaoId').value = '';
                document.getElementById('operacaoIsAgendamento').checked = false;
                window._operacaoAjudantesTempList = [];
                
                if (typeof renderizarListaAjudantesAdicionados === 'function') renderizarListaAjudantesAdicionados();
                if (typeof preencherTodosSelects === 'function') preencherTodosSelects();
                if (typeof renderizarCalendario === 'function') renderizarCalendario();
                if (typeof atualizarDashboard === 'function') atualizarDashboard();
            });

        } catch (erro) {
            console.error(erro);
            alert("Erro ao salvar operação: " + erro.message);
        }
    });
    
    // Reconecta botões de Ajudante
    var btnAddAj = document.getElementById('btnManualAddAjudante');
    if (btnAddAj) {
        var novoBtn = btnAddAj.cloneNode(true);
        btnAddAj.parentNode.replaceChild(novoBtn, btnAddAj);
        
        novoBtn.onclick = function() {
            var sel = document.getElementById('selectAjudantesOperacao');
            if(!sel.value) return alert("Selecione um ajudante.");
            var val = prompt("Valor da Diária?", "0");
            if(val) {
                if(!window._operacaoAjudantesTempList) window._operacaoAjudantesTempList=[];
                window._operacaoAjudantesTempList.push({id:sel.value, diaria:Number(val.replace(',','.'))});
                if(typeof renderizarListaAjudantesAdicionados === 'function') renderizarListaAjudantesAdicionados();
            }
        };
    }
})();