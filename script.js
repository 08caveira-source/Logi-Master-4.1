// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (STABLE / FULL)
// DATA: DEZEMBRO 2025
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
// =============================================================================

/**
 * SEÇÃO 1: CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
 * Define as chaves utilizadas tanto no localStorage (Navegador)
 * quanto nas coleções/documentos do Firebase Firestore.
 */
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';

/**
 * SEÇÃO 2: VARIÁVEIS GLOBAIS DE ESTADO
 * Controlam o estado da aplicação em tempo de execução.
 */
window.USUARIO_ATUAL = null;          // Objeto do usuário logado (Admin ou Func)
window.MODO_APENAS_LEITURA = false;   // Define se o usuário pode editar ou apenas ver
window.currentDate = new Date();      // Data base para o calendário e dashboard
window.chartInstance = null;          // Instância do gráfico (Chart.js) para evitar sobreposição
window._operacaoAjudantesTempList = []; // Lista temporária de ajudantes na tela de operação
window._mensagemAtualId = null;       // ID da mensagem sendo exibida no modal de notificação

/**
 * SEÇÃO 3: CACHE LOCAL
 * Armazena os dados em memória para evitar leituras repetitivas no disco/rede.
 * Inicializados como arrays vazios ou objetos vazios.
 */
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];

/**
 * SEÇÃO 4: FUNÇÕES DE FORMATAÇÃO (HELPERS)
 * Utilitários para formatar moeda, data e telefone.
 */

// Formata valor numérico para Real Brasileiro (R$)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Converte data ISO (YYYY-MM-DD) para formato brasileiro (DD/MM/YYYY)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    // Espera formato YYYY-MM-DD
    var partes = dataIso.split('-');
    if (partes.length >= 3) {
        // Pega apenas os 2 primeiros caracteres do dia para evitar problemas com timezones
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; // Retorna original se não for data válida
}

// Formata telefone para padrões (XX) XXXX-XXXX ou (XX) XXXXX-XXXX
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

/**
 * SEÇÃO 5: CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
 * Funções responsáveis por carregar e salvar dados.
 */

// Função auxiliar para sanitizar objetos antes de enviar ao Firebase
// (CORREÇÃO DO ERRO DA IMAGEM: Remove 'undefined' que quebra o Firestore)
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

// Carrega dados do LocalStorage de forma genérica
function carregarDadosGenerico(chave, variavelCache, valorPadrao) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : valorPadrao;
    } catch (erro) {
        console.error("Erro ao carregar do localStorage (" + chave + "):", erro);
        return valorPadrao;
    }
}

// Carrega todos os dados iniciais para a memória (Cache)
function carregarTodosDadosLocais() {
    console.log("Iniciando carregamento de dados locais...");
    CACHE_FUNCIONARIOS = carregarDadosGenerico(CHAVE_DB_FUNCIONARIOS, [], []);
    CACHE_VEICULOS = carregarDadosGenerico(CHAVE_DB_VEICULOS, [], []);
    CACHE_CONTRATANTES = carregarDadosGenerico(CHAVE_DB_CONTRATANTES, [], []);
    CACHE_OPERACOES = carregarDadosGenerico(CHAVE_DB_OPERACOES, [], []);
    CACHE_MINHA_EMPRESA = carregarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, {}, {});
    CACHE_DESPESAS = carregarDadosGenerico(CHAVE_DB_DESPESAS, [], []);
    CACHE_ATIVIDADES = carregarDadosGenerico(CHAVE_DB_ATIVIDADES, [], []);
    CACHE_PROFILE_REQUESTS = carregarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, [], []);
    console.log("Dados locais carregados com sucesso.");
}

/**
 * Função Mestra de Salvamento.
 * Atualiza o cache, o localStorage e sincroniza com o Firebase se houver conexão.
 */
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e LocalStorage imediatamente (UI responsiva)
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Sincroniza com Firebase (Se logado e com empresa definida)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            // Sanitiza os dados para remover 'undefined' antes de enviar
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });

            // Salva dentro da subcoleção 'data' da empresa
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
            console.log("Sincronizado com nuvem com sucesso: " + chave);
        } catch (erro) {
            console.error("Erro crítico ao salvar no Firebase (" + chave + "):", erro);
            // Alerta amigável para o usuário se falhar a nuvem
            alert("Atenção: Erro ao salvar na nuvem (" + erro.message + "). Os dados foram salvos localmente.");
        }
    }
}

// Wrappers específicos para facilitar leitura, manutenção e tipagem futura
// Cada função chama o salvamento genérico passando a chave correta
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Funções de Busca Rápida (Helpers)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }

// Inicialização Inicial de Dados (Executa ao carregar o script)
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

        // Se houver falta do motorista, não conta comissão nem diárias para o motorista (mas combustível sim, se houve gasto)
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);

        var valorFat = Number(op.faturamento) || 0;
        
        // No Dashboard Geral, mantemos o regime de CAIXA (o que a empresa pagou no mês)
        var custoOp = (Number(op.despesas) || 0) + 
                      (Number(op.combustivel) || 0);
        
        // Só soma comissão se não teve falta
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        // Soma custo de ajudantes (se houver)
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => custoOp += (Number(aj.diaria) || 0));
        }

        // Histórico Total (Todo o tempo)
        receitaHistorico += valorFat;

        // Filtra pelo mês atual do calendário
        // Tratamento de fuso horário simples para garantir mês correto
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

    // Destrói gráfico anterior para não sobrepor (Erro comum de "Canvas is already in use")
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
            
            // Lógica de Falta no Gráfico
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
                    (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)') // Lucro (Verde Neon ou Vermelho Sangue)
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
                    ticks: {
                        callback: function(value) { return 'R$ ' + value; }
                    }
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

    // Nome do Mês em Português
    var nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.textContent = nomeMes.toUpperCase();

    // Lógica de dias
    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 (Dom) a 6 (Sab)
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Preenche espaços vazios antes do dia 1
    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        grid.appendChild(emptyCell);
    }

    // Preenche os dias
    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // Data formatada YYYY-MM-DD para comparação
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        
        // HTML interno da célula
        var cellContent = `<span>${dia}</span>`;
        
        // Verifica se há operações neste dia
        var opsDoDia = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            // Bolinha indicadora
            cellContent += `<div class="event-dot"></div>`;
            // Valor financeiro pequeno
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // Evento para abrir o modal
            cell.onclick = (function(ds) {
                return function() { abrirModalDetalhesDia(ds); };
            })(dateStr);

        } else {
            // Se não tem operação, clica para adicionar nova nesta data
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
    // direction: -1 (anterior) ou 1 (próximo)
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    renderizarCalendario();
    atualizarDashboard(); // Recalcula totais ao mudar o mês
};

// =============================================================================
// CÁLCULOS AVANÇADOS DE FROTA (GLOBAL)
// =============================================================================

window.calcularMediaGlobalVeiculo = function(placa) {
    // 1. Filtra histórico COMPLETO do veículo, independente de abastecimento no dia
    // Considera apenas operações não canceladas
    var ops = CACHE_OPERACOES.filter(function(op) {
        return op.veiculoPlaca === placa && 
               op.status !== 'CANCELADA';
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    // 2. Soma Km e Litros de todas as viagens
    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var preco = Number(op.precoLitro) || 0;
        
        totalKm += km;
        
        if (valorAbastecido > 0 && preco > 0) {
            totalLitros += (valorAbastecido / preco);
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
// MODAL DE DETALHES DO DIA (LÓGICA FINANCEIRA CORRIGIDA)
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

    // Título
    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'DETALHES COMPLETOS: ' + dataFormatada;

    // Totais do Dia
    var totalFaturamento = 0;
    var totalCustoCalculadoDiesel = 0;
    var totalOutrasDespesas = 0;

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;">';
    
    // Tabela Expandida com todas as colunas solicitadas
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
        
        var stringEquipe = '';
        if (op.checkins && op.checkins.faltaMotorista) {
            stringEquipe = `<strong style="color:red;">MOT: FALTA REGISTRADA</strong>`;
        } else {
            stringEquipe = `<strong>Mot:</strong> ${nomeMot}`;
        }
        if(nomesAjudantes.length > 0) stringEquipe += `<br><strong>Ajud:</strong> ${nomesAjudantes.join(', ')}`;
        
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        // --- CÁLCULOS FINANCEIROS ---
        var receita = Number(op.faturamento) || 0;
        
        // Custos Variáveis (Sem Combustível de Caixa)
        // Se teve falta, zera comissão
        var custoPessoal = 0;
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoPessoal = Number(op.comissao) || 0;
        }
        
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
    
    // Exibe o modal
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E INTERFACE DE FORMULÁRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// 9. LISTENERS DE FORMULÁRIOS (SALVAR DADOS)
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
            var senha = document.getElementById('funcSenha').value;
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();

            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                console.log("Criando usuário no Auth...");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID,
                    name: nome,
                    email: email,
                    role: funcao,
                    company: window.USUARIO_ATUAL.company,
                    createdAt: new Date().toISOString(),
                    approved: true
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
                cnh: funcao === 'motorista' ? document.getElementById('funcCNH').value : '',
                validadeCNH: funcao === 'motorista' ? document.getElementById('funcValidadeCNH').value : '',
                categoriaCNH: funcao === 'motorista' ? document.getElementById('funcCategoriaCNH').value : '',
                cursoDescricao: funcao === 'motorista' ? document.getElementById('funcCursoDescricao').value : ''
            };

            // Atualiza lista local
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário salvo e acesso configurado com sucesso!");
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
            preencherTodosSelects(); // Atualiza o select na tela de operações
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
// 10. SALVAR OPERAÇÃO (LÓGICA PRINCIPAL)
// -----------------------------------------------------------------------------

document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;

        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
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
            
            // PRESERVA DADOS DE CHECKIN
            checkins: opAntiga ? opAntiga.checkins : { motorista: false, ajudantes: [], faltaMotorista: false },
            ajudantes: window._operacaoAjudantesTempList || [],
            kmInicial: opAntiga ? opAntiga.kmInicial : 0,
            kmFinal: opAntiga ? opAntiga.kmFinal : 0
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
// FUNÇÕES DE EXCLUSÃO (ATUALIZADA PARA REMOVER ACESSO)
// -----------------------------------------------------------------------------

window.excluirFuncionario = async function(id) {
    if(!confirm("ATENÇÃO: Excluir este funcionário removerá permanentemente seu acesso ao sistema (Login) e seus dados cadastrais. Continuar?")) return;
    
    try {
        // 1. Remove do banco de dados de login (Users)
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", id));
        
        // 2. Remove da lista local da empresa
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        
        alert("Funcionário e acesso removidos com sucesso.");
        preencherTodosSelects();
    } catch (e) {
        console.error(e);
        // Mesmo se falhar na nuvem (ex: permissão), removemos localmente
        alert("Aviso: Cadastro local removido. Se houver erro de permissão na nuvem, contate o suporte. " + e.message);
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        preencherTodosSelects();
    }
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
    
    // Atualiza tabelas ADMIN se existirem na tela
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
    if(typeof renderizarTabelaMonitoramento === 'function') {
        renderizarTabelaMonitoramento();
        renderizarTabelaFaltas(); // NOVA FUNÇÃO DE FALTAS
    }
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
// =============================================================================
// ARQUIVO: script.js
// PARTE 4: RELATÓRIOS, RECIBOS E SISTEMA (FINAL)
// =============================================================================

// -----------------------------------------------------------------------------
// RENDERIZAÇÃO DE TABELAS ESPECÍFICAS (ADMIN - MONITORAMENTO E EQUIPE)
// -----------------------------------------------------------------------------

// Tabela 1: Rotas Ativas (Sem Faltas)
window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra: Ativas E SEM Falta
    var ativas = CACHE_OPERACOES.filter(op => 
        (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO') && 
        op.status !== 'CANCELADA' && 
        (!op.checkins || !op.checkins.faltaMotorista)
    );

    if (ativas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhuma rota ativa no momento.</td></tr>';
        return;
    }

    ativas.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome : 'N/A';
        
        var statusCheckin = 'AGUARDANDO';
        if (op.status === 'EM_ANDAMENTO') {
            statusCheckin = `<span style="color:#2e7d32; font-weight:bold;">EM ROTA (KM ${op.kmInicial || '?'})</span>`;
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${op.veiculoPlaca}</strong></td>
            <td>${nomeMot}</td>
            <td>${statusCheckin}</td>
            <td>
                <button class="btn-mini btn-danger" onclick="registrarFaltaMotorista('${op.id}')" title="Registrar Falta"><i class="fas fa-user-times"></i> FALTA</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// Tabela 2: Faltas Registradas (Abaixo)
window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var faltas = CACHE_OPERACOES.filter(op => op.checkins && op.checkins.faltaMotorista);

    if (faltas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma falta registrada.</td></tr>';
        return;
    }

    faltas.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var tr = document.createElement('tr');
        tr.style.backgroundColor = '#ffebee';
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${mot ? mot.nome : 'N/A'}</td>
            <td>MOTORISTA</td>
            <td style="color:red; font-weight:bold;">FALTA (Viagem #${op.id.substr(-4)})</td>
            <td>
                <button class="btn-mini btn-secondary" onclick="removerFaltaMotorista('${op.id}')" title="Desfazer"><i class="fas fa-undo"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.registrarFaltaMotorista = function(opId) {
    if(!confirm("Confirmar FALTA do motorista? A viagem continuará sem custo de mão-de-obra.")) return;
    
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        if(!op.checkins) op.checkins = {};
        op.checkins.faltaMotorista = true;
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            preencherTodosSelects(); // Atualiza ambas as tabelas
        });
    }
};

window.removerFaltaMotorista = function(opId) {
    if(!confirm("Remover a falta e restaurar pagamento?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op && op.checkins) {
        op.checkins.faltaMotorista = false;
        salvarListaOperacoes(CACHE_OPERACOES).then(() => preencherTodosSelects());
    }
};

// Tabela 3: Solicitações de Perfil (Conectada ao Funcionário)
window.renderizarTabelaProfileRequests = function() {
    var tbody = document.querySelector('#tabelaProfileRequests tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra apenas pendentes
    var pendentes = CACHE_PROFILE_REQUESTS.filter(req => req.status === 'PENDENTE');

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }

    pendentes.forEach((req, index) => {
        // Encontra o índice real no array original para editar corretamente
        var realIndex = CACHE_PROFILE_REQUESTS.indexOf(req);
        
        var funcionario = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
        var nomeFunc = funcionario ? funcionario.nome : req.funcionarioEmail;

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(req.data.split('T')[0])}</td>
            <td>${nomeFunc}</td>
            <td>${req.campo}</td>
            <td>${req.valorNovo}</td>
            <td>
                <button class="btn-mini btn-success" onclick="aprovarSolicitacaoPerfil(${realIndex})" title="Aprovar"><i class="fas fa-check"></i></button>
                <button class="btn-mini btn-danger" onclick="rejeitarSolicitacaoPerfil(${realIndex})" title="Recusar"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.aprovarSolicitacaoPerfil = function(index) {
    var req = CACHE_PROFILE_REQUESTS[index];
    if(!confirm("Aprovar alteração de " + req.campo + " para " + req.valorNovo + "?")) return;
    
    // Atualiza o cadastro real do funcionário
    var func = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
    if(func) {
        // Mapeia campos do formulário para campos do objeto
        if(req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if(req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if(req.campo === 'PIX') func.pix = req.valorNovo;
        if(req.campo === 'CNH') func.cnh = req.valorNovo; 
        // Adicionar outros campos conforme necessário
        
        salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    req.status = 'APROVADO';
    salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => renderizarTabelaProfileRequests());
};

window.rejeitarSolicitacaoPerfil = function(index) {
    if(!confirm("Recusar solicitação?")) return;
    CACHE_PROFILE_REQUESTS[index].status = 'REJEITADO';
    salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => renderizarTabelaProfileRequests());
};

// ... (Restante das funções de Relatório/Recibo mantidas) ...
window.gerarRelatorioGeral = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var motId = document.getElementById('selectMotoristaRelatorio').value;
    var veiculo = document.getElementById('selectVeiculoRelatorio').value;
    var contratante = document.getElementById('selectContratanteRelatorio').value;
    var atividadeId = document.getElementById('selectAtividadeRelatorio').value;

    if (!dataIni || !dataFim) return alert("Selecione as datas inicial e final.");

    var divResultados = document.getElementById('reportResults');
    var divConteudo = document.getElementById('reportContent');
    divResultados.style.display = 'block';

    var opsFiltradas = CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < dataIni || op.data > dataFim) return false;
        
        if (motId && String(op.motoristaId) !== String(motId)) return false;
        if (veiculo && op.veiculoPlaca !== veiculo) return false;
        if (contratante && op.contratanteCNPJ !== contratante) return false;
        if (atividadeId && String(op.atividadeId) !== String(atividadeId)) return false;
        return true;
    });

    var html = '<h3 style="text-align:center; border-bottom:2px solid #ccc; padding-bottom:10px;">RELATÓRIO GERAL DE OPERAÇÕES</h3>';
    html += '<p><strong>Período:</strong> ' + formatarDataParaBrasileiro(dataIni) + ' a ' + formatarDataParaBrasileiro(dataFim) + '</p>';
    
    var filtrosTexto = [];
    if(motId) filtrosTexto.push("Motorista: " + (buscarFuncionarioPorId(motId)?.nome || motId));
    if(veiculo) filtrosTexto.push("Veículo: " + veiculo);
    if(contratante) filtrosTexto.push("Cliente: " + (buscarContratantePorCnpj(contratante)?.razaoSocial || contratante));
    if(atividadeId) filtrosTexto.push("Atividade: " + (buscarAtividadePorId(atividadeId)?.nome || atividadeId));
    if(filtrosTexto.length > 0) html += '<p style="font-size:0.85rem; color:#666;">Filtros: ' + filtrosTexto.join(' | ') + '</p>';

    html += '<table class="data-table" style="width:100%; border-collapse:collapse; margin-top:15px; font-size:0.85rem;">';
    html += '<thead><tr style="background:#eee;"><th>DATA</th><th>CLIENTE / ATIVIDADE</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th><th>CUSTOS TOTAIS</th><th>LUCRO</th></tr></thead><tbody>';

    var totalFat = 0;
    var totalCusto = 0;
    var totalLucro = 0;

    opsFiltradas.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var ativ = buscarAtividadePorId(op.atividadeId);
        
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
        // Só soma comissão se não faltou
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custo += (Number(op.comissao)||0);
        }
        
        if(op.ajudantes) op.ajudantes.forEach(aj => custo += (Number(aj.diaria)||0));

        var lucro = (Number(op.faturamento)||0) - custo;

        totalFat += (Number(op.faturamento)||0);
        totalCusto += custo;
        totalLucro += lucro;

        html += '<tr>';
        html += '<td>' + formatarDataParaBrasileiro(op.data) + '</td>';
        html += '<td>' + (cli ? cli.razaoSocial : op.contratanteCNPJ) + '<br><small>' + (ativ ? ativ.nome : '') + '</small></td>';
        html += '<td>' + op.veiculoPlaca + '</td>';
        html += '<td>' + (mot ? mot.nome : 'N/A') + '</td>';
        html += '<td style="color:green;">' + formatarValorMoeda(op.faturamento) + '</td>';
        html += '<td style="color:red;">' + formatarValorMoeda(custo) + '</td>';
        html += '<td><strong>' + formatarValorMoeda(lucro) + '</strong></td>';
        html += '</tr>';
    });

    html += '</tbody><tfoot><tr style="background:#ddd; font-weight:bold;">';
    html += '<td colspan="4" style="text-align:right;">TOTAIS GERAIS:</td>';
    html += '<td style="color:green;">' + formatarValorMoeda(totalFat) + '</td>';
    html += '<td style="color:red;">' + formatarValorMoeda(totalCusto) + '</td>';
    html += '<td style="background:#ccc;">' + formatarValorMoeda(totalLucro) + '</td>';
    html += '</tr></tfoot></table>';

    divConteudo.innerHTML = html;
};

window.gerarRelatorioCobranca = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var contratante = document.getElementById('selectContratanteRelatorio').value;

    if (!contratante) return alert("Para relatório de cobrança, selecione um CONTRATANTE específico.");
    if (!dataIni || !dataFim) return alert("Selecione as datas.");

    var divResultados = document.getElementById('reportResults');
    var divConteudo = document.getElementById('reportContent');
    divResultados.style.display = 'block';

    var cliData = buscarContratantePorCnpj(contratante);
    var nomeCli = cliData ? cliData.razaoSocial : contratante;

    var ops = CACHE_OPERACOES.filter(op => 
        op.contratanteCNPJ === contratante && 
        op.data >= dataIni && 
        op.data <= dataFim && 
        op.status !== 'CANCELADA'
    );

    var html = `<div style="padding:20px; font-family:Arial;">
        <h2 style="text-align:center;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</h2>
        <p><strong>CLIENTE:</strong> ${nomeCli}</p>
        <p><strong>CNPJ:</strong> ${contratante}</p>
        <p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dataIni)} a ${formatarDataParaBrasileiro(dataFim)}</p>
        <hr>
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <tr style="border-bottom:2px solid #000;"><th>DATA</th><th>VEÍCULO</th><th>SERVIÇO</th><th>VALOR</th></tr>`;
            
    var total = 0;
    ops.forEach(op => {
        var ativ = buscarAtividadePorId(op.atividadeId);
        html += `<tr>
            <td style="padding:8px;">${formatarDataParaBrasileiro(op.data)}</td>
            <td>${op.veiculoPlaca}</td>
            <td>${ativ ? ativ.nome : 'FRETE'}</td>
            <td>${formatarValorMoeda(op.faturamento)}</td>
        </tr>`;
        total += (Number(op.faturamento)||0);
    });

    html += `<tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="3" style="padding-top:10px;">TOTAL A PAGAR</td>
        <td style="padding-top:10px;">${formatarValorMoeda(total)}</td>
    </tr></table>
    <br><br>
    <p style="text-align:center; font-size:0.8rem;">Emitido por: ${CACHE_MINHA_EMPRESA.razaoSocial || 'LOGIMASTER SISTEMAS'}</p>
    </div>`;

    divConteudo.innerHTML = html;
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') return alert("Gere um relatório primeiro.");
    var opt = { margin: 0.5, filename: 'relatorio_logimaster.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' } };
    html2pdf().set(opt).from(element).save();
};

window.gerarReciboPagamento = function() {
    var funcId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dataIni || !dataFim) return alert("Preencha funcionário e datas.");

    var func = buscarFuncionarioPorId(funcId);
    if (!func) return alert("Funcionário não encontrado.");

    var ops = CACHE_OPERACOES.filter(o => o.data >= dataIni && o.data <= dataFim && o.status !== 'CANCELADA');
    
    var totalPagar = 0;
    var descritivo = '';

    ops.forEach(op => {
        if (String(op.motoristaId) === String(funcId)) {
            if (!op.checkins || !op.checkins.faltaMotorista) {
                var com = Number(op.comissao) || 0;
                if (com > 0) {
                    totalPagar += com;
                    descritivo += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>COMISSÃO (Placa ${op.veiculoPlaca})</td><td align="right">${formatarValorMoeda(com)}</td></tr>`;
                }
            }
        }
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                if (String(aj.id) === String(funcId)) {
                     var diaria = Number(aj.diaria) || 0;
                     totalPagar += diaria;
                     descritivo += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>DIÁRIA AJUDANTE (Placa ${op.veiculoPlaca})</td><td align="right">${formatarValorMoeda(diaria)}</td></tr>`;
                }
            });
        }
    });

    var divRecibo = document.getElementById('reciboContent');
    var html = `
    <div style="border:2px solid #000; padding:30px; font-family:'Courier New', monospace; background:#fff;">
        <h2 style="text-align:center; margin-bottom:5px;">RECIBO DE PAGAMENTO</h2>
        <p style="text-align:center; font-size:0.8rem; margin-top:0;">${CACHE_MINHA_EMPRESA.razaoSocial || 'MINHA EMPRESA'}</p>
        <hr style="border:1px dashed #000;">
        <p><strong>BENEFICIÁRIO:</strong> ${func.nome}</p>
        <p><strong>CPF:</strong> ${func.documento} | <strong>PIX:</strong> ${func.pix || '-'}</p>
        <br>
        <table style="width:100%;">
            <tr style="border-bottom:1px solid #000;">
                <th align="left">DATA</th><th align="left">DESCRIÇÃO</th><th align="right">VALOR</th>
            </tr>
            ${descritivo || '<tr><td colspan="3" align="center">Nenhum serviço encontrado no período.</td></tr>'}
        </table>
        <br>
        <hr style="border:1px solid #000;">
        <h3 style="text-align:right;">TOTAL LÍQUIDO: ${formatarValorMoeda(totalPagar)}</h3>
        <br><br><br>
        <div style="display:flex; justify-content:space-between; margin-top:30px;">
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">ASSINATURA DO EMPREGADOR</div>
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">ASSINATURA DO BENEFICIÁRIO</div>
        </div>
        <p style="text-align:center; font-size:0.8em; margin-top:20px;">Data de Emissão: ${new Date().toLocaleDateString()}</p>
    </div>
    <button onclick="var c=document.getElementById('reciboContent').innerHTML; var w=window.open(); w.document.write(c); w.print();" class="btn-primary" style="margin-top:15px; width:100%;">
        <i class="fas fa-print"></i> IMPRIMIR RECIBO
    </button>
    `;

    divRecibo.innerHTML = html;
};

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
        var status = (d.modoPagamento === 'parcelado') ? `PARCELADO (${d.parcelasPagas}/${d.parcelas})` : 'À VISTA';
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td style="color:red;">${formatarValorMoeda(d.valor)}</td><td><small>${status}</small></td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td>`;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = function(id) {
    if(!confirm("Excluir despesa?")) return;
    CACHE_DESPESAS = CACHE_DESPESAS.filter(d => d.id !== String(id));
    salvarListaDespesas(CACHE_DESPESAS).then(() => { renderizarTabelaDespesasGerais(); atualizarDashboard(); });
};

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
            if (confirm("Isso substituirá TODOS os dados atuais. Confirmar importação?")) {
                CACHE_FUNCIONARIOS = jsonObj.funcionarios || []; CACHE_VEICULOS = jsonObj.veiculos || []; CACHE_CONTRATANTES = jsonObj.contratantes || []; CACHE_OPERACOES = jsonObj.operacoes || []; CACHE_MINHA_EMPRESA = jsonObj.minhaEmpresa || {}; CACHE_DESPESAS = jsonObj.despesas || []; CACHE_ATIVIDADES = jsonObj.atividades || []; CACHE_PROFILE_REQUESTS = jsonObj.profileRequests || [];
                salvarListaFuncionarios(CACHE_FUNCIONARIOS); salvarListaVeiculos(CACHE_VEICULOS); salvarListaContratantes(CACHE_CONTRATANTES); salvarListaOperacoes(CACHE_OPERACOES); salvarDadosMinhaEmpresa(CACHE_MINHA_EMPRESA); salvarListaDespesas(CACHE_DESPESAS); salvarListaAtividades(CACHE_ATIVIDADES);
                alert("Importação Concluída com Sucesso!"); window.location.reload();
            }
        } catch (e) { alert("Erro ao ler arquivo JSON: " + e); }
    };
    reader.readAsText(event.target.files[0]);
};

window.resetSystemData = function() { if (confirm("ATENÇÃO: ISSO APAGARÁ TUDO! TEM CERTEZA ABSOLUTA?")) { localStorage.clear(); alert("Sistema zerado. A página será recarregada."); window.location.reload(); } };

window.renderizarPainelEquipe = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs, doc, updateDoc } = window.dbRef;
    const empresa = window.USUARIO_ATUAL.company;
    
    // Lista Ativos
    const tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando dados da nuvem...</td></tr>';
        try {
            const q = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", true));
            const querySnapshot = await getDocs(q);
            tbodyAtivos.innerHTML = '';
            if (querySnapshot.empty) { tbodyAtivos.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum usuário ativo com login encontrado.</td></tr>'; }
            querySnapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const localData = CACHE_FUNCIONARIOS.find(f => f.email === u.email) || {};
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td><span class="status-pill pill-active">${u.role}</span></td><td>${localData.telefone ? formatarTelefoneBrasil(localData.telefone) : '-'}</td><td><button class="btn-mini delete-btn" onclick="bloquearAcessoUsuario('${docSnap.id}')" title="Revogar Acesso"><i class="fas fa-ban"></i></button></td>`;
                tbodyAtivos.appendChild(tr);
            });
        } catch (e) { console.error("Erro ao listar ativos:", e); tbodyAtivos.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Erro de conexão.</td></tr>'; }
    }
    
    // Lista Pendentes (Com Lixeira)
    const tbodyPendentes = document.querySelector('#tabelaCompanyPendentes tbody');
    if (tbodyPendentes) {
        try {
            const qP = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", false));
            const snapP = await getDocs(qP);
            tbodyPendentes.innerHTML = '';
            if (snapP.empty) { 
                tbodyPendentes.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>'; 
            } else { 
                const badge = document.getElementById('badgeAccess'); 
                if(badge) { badge.style.display = 'inline-block'; badge.textContent = snapP.size; } 
            }
            snapP.forEach((docSnap) => {
                const u = docSnap.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role}</td>
                    <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="btn-mini btn-success" onclick="aprovarUsuario('${docSnap.id}')"><i class="fas fa-check"></i></button>
                        <button class="btn-mini btn-danger" onclick="excluirUsuarioPendente('${docSnap.id}')" title="Excluir Solicitação"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbodyPendentes.appendChild(tr);
            });
        } catch (e) { console.error(e); }
    }
};

window.aprovarUsuario = async function(uid) { if(!confirm("Aprovar acesso deste usuário?")) return; try { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db, "users", uid), { approved: true }); alert("Usuário aprovado!"); renderizarPainelEquipe(); } catch(e) { alert("Erro: " + e.message); } };
window.bloquearAcessoUsuario = async function(uid) { if(!confirm("Bloquear acesso? O usuário não conseguirá mais logar.")) return; try { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db, "users", uid), { approved: false }); alert("Acesso revogado."); renderizarPainelEquipe(); } catch(e) { alert("Erro: " + e.message); } };

window.excluirUsuarioPendente = async function(uid) {
    if(!confirm("Excluir esta solicitação de acesso?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        alert("Solicitação excluída.");
        renderizarPainelEquipe();
    } catch(e) { alert("Erro: " + e.message); }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formAdminMessage') {
        e.preventDefault();
        var texto = document.getElementById('msgTextAdmin').value;
        var destinatario = document.getElementById('msgRecipientSelect').value;
        if (!texto) return;
        try {
            const { db, collection, addDoc } = window.dbRef;
            await addDoc(collection(db, "messages"), { company: window.USUARIO_ATUAL.company, from: window.USUARIO_ATUAL.email, to: destinatario, content: texto, createdAt: new Date().toISOString(), readBy: [] });
            alert("Mensagem enviada com sucesso!"); e.target.reset();
        } catch (err) { alert("Erro ao enviar mensagem: " + err.message); }
    }
});
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: NAVEGAÇÃO, INICIALIZAÇÃO, SUPER ADMIN E PERFIL FUNCIONÁRIO (FINAL)
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
            
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'despesas') renderizarTabelaDespesasGerais();
            if (pageId === 'checkins-pendentes') preencherTodosSelects(); 
            if (pageId === 'access-management') { renderizarPainelEquipe(); renderizarTabelaProfileRequests(); }
            
            // Perfil Funcionário
            if (pageId === 'employee-home' && window.USUARIO_ATUAL && window.USUARIO_ATUAL.role !== 'admin') { 
                verificarNovasMensagens(); // Verifica mensagens ao entrar
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
// SISTEMA DE MENSAGENS (CORRIGIDO PARA NÃO REPETIR)
// -----------------------------------------------------------------------------

// Variável para bloquear mensagens já lidas nesta sessão (evita delay do banco)
window._idsLidosLocalmente = []; 

window.verificarNovasMensagens = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs } = window.dbRef;
    
    // Se já tiver um modal aberto, não busca outra para não sobrepor
    if(document.getElementById('modalNotification').style.display === 'block') return;

    try {
        const q = query(
            collection(db, "messages"), 
            where("company", "==", window.USUARIO_ATUAL.company)
        );
        
        const snap = await getDocs(q);
        
        for (const msgDoc of snap.docs) {
            const data = msgDoc.data();
            const myId = window.USUARIO_ATUAL.uid;
            const msgId = msgDoc.id;
            
            // Lógica de Filtragem Rigorosa:
            // 1. É para mim (ou todos)?
            // 2. Eu já li no banco (readBy)?
            // 3. Eu acabei de ler nesta sessão (_idsLidosLocalmente)?
            
            const isForMe = (data.to === 'all' || data.to === myId);
            const alreadyReadDB = data.readBy && data.readBy.includes(myId);
            const justReadLocal = window._idsLidosLocalmente.includes(msgId);
            
            if (isForMe && !alreadyReadDB && !justReadLocal) {
                // Guarda ID globalmente para confirmar leitura
                window._mensagemAtualId = msgId;
                
                // Exibe Modal
                document.getElementById('notificationMessageText').innerText = data.content;
                document.getElementById('notificationSender').innerText = "Enviado por: " + data.from;
                document.getElementById('modalNotification').style.display = 'block';
                
                // Para o loop para mostrar apenas UMA mensagem por vez e não inundar o usuário
                break; 
            }
        }
    } catch (e) {
        console.error("Erro ao buscar mensagens:", e);
    }
};

window.confirmarLeituraMensagem = async function() {
    // 1. FECHA O MODAL IMEDIATAMENTE (Feedback Instantâneo)
    document.getElementById('modalNotification').style.display = 'none';

    if(!window._mensagemAtualId || !window.dbRef || !window.USUARIO_ATUAL) return;
    
    const msgId = window._mensagemAtualId;
    const myId = window.USUARIO_ATUAL.uid;

    // 2. BLOQUEIO LOCAL IMEDIATO
    // Adiciona na lista negra local para garantir que não apareça de novo mesmo se a internet cair
    window._idsLidosLocalmente.push(msgId);
    
    // 3. ATUALIZA NO BANCO EM SEGUNDO PLANO
    const { db, doc, updateDoc, arrayUnion } = window.dbRef;
    try {
        await updateDoc(doc(db, "messages", msgId), {
            readBy: arrayUnion(myId)
        });
        
        window._mensagemAtualId = null;
        
        // Verifica se tem mais mensagens na fila após um pequeno delay
        setTimeout(window.verificarNovasMensagens, 1500);
        
    } catch(e) { 
        console.error("Erro ao confirmar leitura no banco:", e); 
        // Mesmo com erro no banco, a lista local impede que a mensagem volte agora
    }
};

// Garante que o botão use a nova função
document.addEventListener('DOMContentLoaded', function() {
    var btnModal = document.querySelector('#modalNotification button');
    if(btnModal) {
        btnModal.onclick = window.confirmarLeituraMensagem;
    }
    configurarNavegacao();
});


// -----------------------------------------------------------------------------
// FUNÇÕES DO PERFIL DE FUNCIONÁRIO (CHECK-IN E HISTÓRICO)
// -----------------------------------------------------------------------------

window.renderizarPainelCheckinFuncionario = function() {
    if (!window.USUARIO_ATUAL) return;
    var container = document.getElementById('listaServicosAgendados');
    if (!container) return;

    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    
    if (!funcionario) { 
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#c62828;">
                <i class="fas fa-exclamation-circle" style="font-size:2rem; margin-bottom:10px;"></i><br>
                <strong>PERFIL NÃO VINCULADO</strong><br>
                <small>Seu email (${emailLogado}) não foi encontrado na lista.<br>Peça ao administrador para verificar seu cadastro.</small>
                <br><br>
                <button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)">Forçar Sincronização</button>
            </div>`; 
        return; 
    }

    // AJUSTE DE DATA (LOCAL)
    var hoje = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');
    
    var minhasOps = CACHE_OPERACOES.filter(op => {
        return String(op.motoristaId) === String(funcionario.id) && 
               (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO') &&
               op.data === hoje;
    });

    var btnRefresh = `<button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)" style="width:100%; margin-bottom:15px;"><i class="fas fa-sync"></i> ATUALIZAR VIAGENS</button>`;

    if (minhasOps.length === 0) {
        container.innerHTML = btnRefresh + '<p style="text-align:center; padding:20px; color:#666;">Nenhuma viagem agendada para hoje.</p>';
        return;
    }

    var html = btnRefresh;
    minhasOps.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial : 'Cliente Diversos';
        var btnAcao = '';
        var statusColor = op.status==='AGENDADA' ? '#ff9800' : '#4caf50';
        
        if (op.status === 'AGENDADA') {
            btnAcao = `<button class="btn-primary" onclick="iniciarViagemFuncionario('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">INICIAR VIAGEM <i class="fas fa-play"></i></button>`;
        } else {
            var infoAndamento = `<div style="text-align:center; margin-bottom:10px; color:#2e7d32;"><strong>KM INICIAL:</strong> ${op.kmInicial || 'Não informado'}</div>`;
            btnAcao = infoAndamento + `<button class="btn-danger" onclick="finalizarViagemFuncionario('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">FINALIZAR VIAGEM <i class="fas fa-flag-checkered"></i></button>`;
        }

        html += `
            <div style="background:#fff; border-left:6px solid ${statusColor}; padding:20px; margin-bottom:20px; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#37474f;">${nomeCli}</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; font-size:0.9rem;">
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Veículo:</strong><br>${op.veiculoPlaca}</div>
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Status:</strong><br>${op.status}</div>
                </div>
                ${btnAcao}
            </div>
        `;
    });
    container.innerHTML = html;
};

// Funções de Ação do Check-in
window.iniciarViagemFuncionario = function(opId) {
    var kmPainel = prompt("Por favor, informe a QUILOMETRAGEM (KM) ATUAL do painel:");
    if(!kmPainel) return;
    
    if(isNaN(Number(kmPainel))) return alert("Por favor, digite apenas números.");

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        op.status = 'EM_ANDAMENTO';
        op.kmInicial = Number(kmPainel); 
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Boa viagem! KM Inicial registrado.");
            renderizarPainelCheckinFuncionario();
        });
    }
};

window.finalizarViagemFuncionario = function(opId) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(!op) return;

    var kmFinal = prompt(`KM Inicial: ${op.kmInicial || '?'}. \nInforme o KM FINAL do painel:`);
    if(!kmFinal) return;
    
    var kmFinNum = Number(kmFinal);
    var kmIniNum = Number(op.kmInicial || 0);

    if(isNaN(kmFinNum)) return alert("Digite apenas números.");
    if(kmFinNum < kmIniNum) return alert("Erro: O KM Final não pode ser menor que o Inicial (" + kmIniNum + ").");

    var rodado = kmFinNum - kmIniNum;

    if(confirm(`Confirma finalização?\n\nKM Inicial: ${kmIniNum}\nKM Final: ${kmFinNum}\nTotal Rodado: ${rodado} KM`)) {
        op.kmFinal = kmFinNum;
        op.kmRodado = rodado; 
        op.status = 'FINALIZADA'; 
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Viagem Finalizada com Sucesso!");
            renderizarPainelCheckinFuncionario();
        });
    }
};

window.filtrarHistoricoFuncionario = function() {
    var tbody = document.querySelector('#tabelaHistoricoCompleto tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!window.USUARIO_ATUAL) return;
    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    
    if (!funcionario) return;

    var dataIni = document.getElementById('empDataInicio').value;
    var dataFim = document.getElementById('empDataFim').value;

    var historico = CACHE_OPERACOES.filter(op => {
        var isMyOp = String(op.motoristaId) === String(funcionario.id);
        if (!isMyOp) return false;

        if (dataIni && op.data < dataIni) return false;
        if (dataFim && op.data > dataFim) return false;

        return op.status === 'CONFIRMADA' || op.status === 'FINALIZADA' || (op.checkins && op.checkins.faltaMotorista);
    });

    var total = 0;
    historico.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var valor = Number(op.comissao) || 0;
        var statusHtml = '<span class="status-pill pill-active">REALIZADO</span>';
        var linhaStyle = '';
        
        if (op.checkins && op.checkins.faltaMotorista) {
            statusHtml = '<span class="status-pill pill-blocked">FALTA</span>';
            valor = 0; 
            linhaStyle = 'background-color:#ffebee; color:#c62828;';
        } else {
            total += valor;
        }

        var tr = document.createElement('tr');
        tr.style = linhaStyle;
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${op.veiculoPlaca}</td>
            <td>${cliente}</td>
            <td>${formatarValorMoeda(valor)}</td>
            <td>${statusHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    var elTotal = document.getElementById('empTotalReceber');
    if(elTotal) elTotal.textContent = formatarValorMoeda(total);
};

// -----------------------------------------------------------------------------
// SINCRONIZAÇÃO E INICIALIZAÇÃO
// -----------------------------------------------------------------------------

window.sincronizarDadosDaNuvem = async function(manual = false) {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;
    
    if(manual) {
        var btn = document.querySelector('button[onclick*="sincronizar"]');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...';
    } else {
        console.log("Iniciando sincronização silenciosa...");
    }

    const { db, doc, getDoc } = window.dbRef;
    const company = window.USUARIO_ATUAL.company;

    const carregarColecao = async (chave, varCache, callback) => {
        try {
            const docRef = doc(db, 'companies', company, 'data', chave);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const dados = snap.data().items || [];
                localStorage.setItem(chave, JSON.stringify(dados));
                callback(dados);
            }
        } catch (e) { console.error(`Erro sync ${chave}:`, e); }
    };

    await Promise.all([
        carregarColecao(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS, (d) => CACHE_FUNCIONARIOS = d),
        carregarColecao(CHAVE_DB_OPERACOES, CACHE_OPERACOES, (d) => CACHE_OPERACOES = d),
        carregarColecao(CHAVE_DB_VEICULOS, CACHE_VEICULOS, (d) => CACHE_VEICULOS = d),
        carregarColecao(CHAVE_DB_CONTRATANTES, CACHE_CONTRATANTES, (d) => CACHE_CONTRATANTES = d),
        carregarColecao(CHAVE_DB_ATIVIDADES, CACHE_ATIVIDADES, (d) => CACHE_ATIVIDADES = d),
        carregarColecao(CHAVE_DB_MINHA_EMPRESA, CACHE_MINHA_EMPRESA, (d) => CACHE_MINHA_EMPRESA = d),
        carregarColecao(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS, (d) => CACHE_PROFILE_REQUESTS = d)
    ]);

    if(manual) {
        alert("Dados sincronizados com sucesso!");
        if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR VIAGENS';
        renderizarPainelCheckinFuncionario();
        carregarDadosMeuPerfil(window.USUARIO_ATUAL.email);
    }
};

window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema para:", user.email, "| Role:", user.role);
    window.USUARIO_ATUAL = user;

    configurarNavegacao();

    if (user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') {
        document.getElementById('menu-admin').style.display = 'none';
        document.getElementById('menu-employee').style.display = 'none';
        document.getElementById('menu-super-admin').style.display = 'block';
        document.querySelector('[data-page="super-admin"]').click();
        setTimeout(carregarPainelSuperAdmin, 500);
        return;
    }

    carregarTodosDadosLocais();

    if (CACHE_FUNCIONARIOS.length === 0 || user.role !== 'admin') {
        await sincronizarDadosDaNuvem(); 
    }
    
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        window.MODO_APENAS_LEITURA = false;
        preencherTodosSelects();
        
        setTimeout(() => {
            var btnHome = document.querySelector('[data-page="home"]');
            if(btnHome) btnHome.click();
        }, 100);

    } else if (user.role === 'motorista' || user.role === 'ajudante') {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        setTimeout(() => { verificarNovasMensagens(); }, 2000);
        
        renderizarPainelCheckinFuncionario();
        
        setTimeout(() => {
            var btnHomeEmp = document.querySelector('[data-page="employee-home"]');
            if(btnHomeEmp) btnHomeEmp.click();
        }, 100);
    }
};

document.getElementById('mobileMenuBtn').onclick = function() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
};
document.getElementById('sidebarOverlay').onclick = function() {
    document.getElementById('sidebar').classList.remove('active');
    this.classList.remove('active');
};

// --- NOVA VISUALIZAÇÃO DE DADOS (MODO DOCUMENTO) ---
function carregarDadosMeuPerfil(email) {
    var emailLogado = email.trim().toLowerCase();
    var f = CACHE_FUNCIONARIOS.find(x => x.email && x.email.trim().toLowerCase() === emailLogado);
    
    var container = document.getElementById('meus-dados'); 
    container.innerHTML = '<h2>MEUS DADOS PESSOAIS</h2>';

    if (f) {
        var cardHtml = `
        <div class="card" style="border-top: 5px solid var(--primary-color);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <div style="background:#eee; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#888;">
                        <i class="fas fa-user" style="font-size:30px;"></i>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#37474f;">${f.nome}</h3>
                        <span class="status-pill pill-active">${f.funcao}</span>
                    </div>
                </div>
                <button class="btn-warning btn-mini" onclick="document.getElementById('modalRequestProfileChange').style.display='block'">
                    <i class="fas fa-edit"></i> SOLICITAR ALTERAÇÃO
                </button>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:20px; background:#fafafa; padding:20px; border-radius:8px; border:1px solid #eee;">
                <div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">CPF</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.documento}</div></div>
                <div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">TELEFONE</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${formatarTelefoneBrasil(f.telefone)}</div></div>
                <div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">EMAIL</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.email}</div></div>
                <div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">PIX</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.pix || '-'}</div></div>
                <div style="grid-column: 1 / -1;"><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">ENDEREÇO</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.endereco || '-'}</div></div>
                ${ f.funcao === 'motorista' ? `
                <div style="background:#e8f5e9; padding:10px; border-radius:6px; border:1px solid #c8e6c9;"><label style="font-size:0.7rem; color:#2e7d32; font-weight:bold;">CNH</label><div style="font-weight:bold; color:#1b5e20;">${f.cnh || '-'}</div></div>
                <div style="background:#e8f5e9; padding:10px; border-radius:6px; border:1px solid #c8e6c9;"><label style="font-size:0.7rem; color:#2e7d32; font-weight:bold;">VALIDADE</label><div style="font-weight:bold; color:#1b5e20;">${formatarDataParaBrasileiro(f.validadeCNH) || '-'}</div></div>
                ` : '' }
            </div>
        </div>`;
        container.innerHTML += cardHtml;
    } else {
        container.innerHTML += '<div class="card"><p>Dados não encontrados.</p></div>';
    }
}

// SUPER ADMIN E OUTROS - MANTIDO
window.GLOBAL_DATA_CACHE = {}; 
window.carregarPainelSuperAdmin = async function(forceRefresh = false) { /* ... */ };
window.toggleCompanyBlock = function(header) { /* ... */ };
window.filterGlobalUsers = function() { /* ... */ };
window.superAdminResetPass = function(email) { /* ... */ };
window.superAdminDeleteUser = async function(uid, domain) { /* ... */ };

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') { /* ... */ }
});

// Listener CORRIGIDO para solicitações de perfil (SEM MODO DEMO)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formRequestProfileChange') {
        e.preventDefault();
        
        var tipo = document.getElementById('reqFieldType').value;
        var novoValor = document.getElementById('reqNewValue').value;
        
        if (!window.USUARIO_ATUAL) return;
        
        var novaReq = {
            id: Date.now().toString(),
            data: new Date().toISOString(),
            funcionarioEmail: window.USUARIO_ATUAL.email,
            campo: tipo,
            valorNovo: novoValor,
            status: 'PENDENTE'
        };
        
        CACHE_PROFILE_REQUESTS.push(novaReq);
        
        // CORREÇÃO: Usa salvarProfileRequests para evitar erro de permissão/estrutura
        salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => {
            alert("Solicitação enviada para o administrador com sucesso!");
            document.getElementById('modalRequestProfileChange').style.display='none';
            e.target.reset();
        });
    }
});

document.addEventListener('DOMContentLoaded', function() {
    configurarNavegacao();
});