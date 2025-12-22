// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 19.0 (CORRIGIDA E COMPLETA - SEM ABREVIAÇÕES)
// PARTE 1: VARIÁVEIS, CONSTANTES, FORMATAÇÃO E CÁLCULOS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES DE CHAVES DE ARMAZENAMENTO (BANCO DE DADOS)
// -----------------------------------------------------------------------------
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// -----------------------------------------------------------------------------
window.USUARIO_ATUAL = null; // Armazena o objeto do usuário logado
window.MODO_APENAS_LEITURA = false; // Define se é admin ou funcionário
window.currentDate = new Date(); // Data global para calendário e dashboard
window.chartInstance = null; // Variável para armazenar a instância do gráfico (Chart.js)

// Cache local para performance
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];

// -----------------------------------------------------------------------------
// 3. FUNÇÕES DE FORMATAÇÃO (ÚTEIS)
// -----------------------------------------------------------------------------

function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    var partes = dataIso.split('-');
    if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
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

function formatarDocumento(doc) {
    if (!doc) return '';
    return String(doc).toUpperCase();
}

// -----------------------------------------------------------------------------
// 4. FUNÇÕES DE CARREGAMENTO DE DADOS
// -----------------------------------------------------------------------------

function carregarDadosGenerico(chave, variavelCache) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : (Array.isArray(variavelCache) ? [] : {});
    } catch (erro) {
        console.error("Erro ao carregar " + chave, erro);
        return Array.isArray(variavelCache) ? [] : {};
    }
}

function carregarTodosDadosLocais() {
    CACHE_FUNCIONARIOS = carregarDadosGenerico(CHAVE_DB_FUNCIONARIOS, []);
    CACHE_VEICULOS = carregarDadosGenerico(CHAVE_DB_VEICULOS, []);
    CACHE_CONTRATANTES = carregarDadosGenerico(CHAVE_DB_CONTRATANTES, []);
    CACHE_OPERACOES = carregarDadosGenerico(CHAVE_DB_OPERACOES, []);
    CACHE_MINHA_EMPRESA = carregarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, {});
    CACHE_DESPESAS = carregarDadosGenerico(CHAVE_DB_DESPESAS, []);
    CACHE_ATIVIDADES = carregarDadosGenerico(CHAVE_DB_ATIVIDADES, []);
}

// Inicializa carregamento
carregarTodosDadosLocais();

// -----------------------------------------------------------------------------
// 5. FUNÇÕES DE PERSISTÊNCIA E FIREBASE
// -----------------------------------------------------------------------------

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados); // Atualiza memória
    localStorage.setItem(chave, JSON.stringify(dados)); // Salva Local
    
    // Sincroniza Firebase
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), { 
                items: dados, lastUpdate: new Date().toISOString() 
            });
        } catch (erro) {
            console.error("Erro Firebase (" + chave + "):", erro);
        }
    }
}

// Wrappers específicos para facilitar leitura
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }

// -----------------------------------------------------------------------------
// 6. BUSCAS E CÁLCULOS
// -----------------------------------------------------------------------------

function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }

function obterUltimoKmRegistrado(placa) {
    if (!placa) return 0;
    var ops = CACHE_OPERACOES.filter(op => op.veiculoPlaca === placa && Number(op.kmFinal) > 0);
    if (ops.length === 0) return 0;
    return Math.max(...ops.map(op => Number(op.kmFinal)));
}

// =============================================================================
// PARTE 2: INTERFACE - DASHBOARD E GRÁFICOS (FUNÇÃO REINTEGRADA)
// =============================================================================

window.atualizarDashboard = function() {
    console.log("Atualizando Dashboard Financeiro...");
    
    // 1. Definição do período (Mês selecionado no calendário)
    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();

    // 2. Variáveis de acumulação
    var faturamentoMes = 0;
    var despesasMes = 0; // Inclui custos operacionais + despesas gerais
    var receitaHistorico = 0;
    
    // 3. Processar Operações
    CACHE_OPERACOES.forEach(function(op) {
        // Ignora canceladas
        if (op.status === 'CANCELADA') return;

        var dataOp = new Date(op.data);
        // Corrige fuso horário simples (considerando data UTC string)
        dataOp.setHours(dataOp.getHours() + 3); 

        var valorFat = Number(op.faturamento) || 0;
        var custoOp = (Number(op.despesas) || 0) + (Number(op.combustivel) || 0) + (Number(op.comissao) || 0);

        // Soma Ajudantes
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => custoOp += (Number(aj.diaria) || 0));
        }

        // Acumula Histórico Total (Todo o tempo)
        receitaHistorico += valorFat;

        // Filtra pelo mês atual
        // Nota: dataOp.getMonth() retorna 0-11, igual ao mesAtual
        // Compara string de ano-mês para garantir precisão (ex: "2025-11")
        var opMesAno = op.data.substring(0, 7); // "YYYY-MM"
        var currentMesAno = anoAtual + '-' + String(mesAtual + 1).padStart(2, '0');

        if (opMesAno === currentMesAno) {
            faturamentoMes += valorFat;
            despesasMes += custoOp;
        }
    });

    // 4. Processar Despesas Gerais (Luz, Aluguel, Manutenção fora de rota)
    CACHE_DESPESAS.forEach(function(desp) {
        var despMesAno = desp.data.substring(0, 7);
        var currentMesAno = anoAtual + '-' + String(mesAtual + 1).padStart(2, '0');
        
        if (despMesAno === currentMesAno) {
            despesasMes += (Number(desp.valor) || 0);
        }
    });

    // 5. Atualizar Cards HTML
    var lucroMes = faturamentoMes - despesasMes;
    
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(despesasMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    
    // Cálculo de margem
    if (elMargem) {
        var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;
        elMargem.textContent = margem.toFixed(1) + '%';
    }

    // 6. Atualizar Gráfico (Chart.js)
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return;

    // Destrói gráfico anterior se existir
    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    // Dados fictícios de "metas" ou comparação com mês anterior poderiam ser adicionados aqui
    // Por enquanto, faremos um gráfico de Composição de Custos vs Receita
    
    var receita = 0;
    var combustivel = 0;
    var manutencao = 0;
    var pessoal = 0;
    var lucro = 0;

    var mesAnoAlvo = ano + '-' + String(mes + 1).padStart(2, '0');

    // Analisa dados do mês para o gráfico
    CACHE_OPERACOES.forEach(op => {
        if (op.data.substring(0, 7) === mesAnoAlvo && op.status !== 'CANCELADA') {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            pessoal += Number(op.comissao || 0);
            manutencao += Number(op.despesas || 0); // Considerando 'despesas' de rota como extra/pedagio/manut
            
            if (op.ajudantes) op.ajudantes.forEach(aj => pessoal += Number(aj.diaria || 0));
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (d.data.substring(0, 7) === mesAnoAlvo) {
            manutencao += Number(d.valor || 0);
        }
    });

    lucro = receita - (combustivel + manutencao + pessoal);

    // Configuração do Chart.js
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Faturamento', 'Custos Totais', 'Combustível', 'Pessoal', 'Manutenção/Geral', 'Lucro Líquido'],
            datasets: [{
                label: 'Resultados do Mês (R$)',
                data: [
                    receita, 
                    (combustivel + manutencao + pessoal), 
                    combustivel, 
                    pessoal, 
                    manutencao, 
                    lucro
                ],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)', // Fat (Verde)
                    'rgba(255, 99, 132, 0.6)', // Custo Total (Vermelho)
                    'rgba(255, 206, 86, 0.6)', // Combustivel (Amarelo)
                    'rgba(54, 162, 235, 0.6)', // Pessoal (Azul)
                    'rgba(153, 102, 255, 0.6)', // Manutenção (Roxo)
                    (lucro >= 0 ? 'rgba(46, 125, 50, 0.8)' : 'rgba(198, 40, 40, 0.8)') // Lucro (Verde escuro ou Vermelho escuro)
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// =============================================================================
// PARTE 3: FUNÇÕES DE UI E INTERAÇÃO
// =============================================================================

// Função que faltava para alternar campos de CNH
window.toggleDriverFields = function() {
    var select = document.getElementById('funcFuncao');
    var divMotorista = document.getElementById('driverSpecificFields'); // ID padronizado
    
    // Tenta buscar pelo ID alternativo caso o HTML esteja antigo
    if (!divMotorista) divMotorista = document.getElementById('driverFields');

    if (select && divMotorista) {
        if (select.value === 'motorista') {
            divMotorista.style.display = 'block';
        } else {
            divMotorista.style.display = 'none';
        }
    }
};

window.toggleDespesaParcelas = function() {
    var modo = document.getElementById('despesaModoPagamento').value;
    var div = document.getElementById('divDespesaParcelas');
    if (div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
};

// =============================================================================
// PARTE 4: RELATÓRIOS E RECIBOS (FUNÇÕES REINTEGRADAS)
// =============================================================================

window.gerarRelatorioGeral = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var motId = document.getElementById('selectMotoristaRelatorio').value;
    var veiculo = document.getElementById('selectVeiculoRelatorio').value;
    var contratante = document.getElementById('selectContratanteRelatorio').value;

    if (!dataIni || !dataFim) return alert("Selecione as datas inicial e final.");

    var divResultados = document.getElementById('reportResults');
    var divConteudo = document.getElementById('reportContent');
    divResultados.style.display = 'block';

    // Filtragem
    var opsFiltradas = CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < dataIni || op.data > dataFim) return false;
        if (motId && String(op.motoristaId) !== String(motId)) return false;
        if (veiculo && op.veiculoPlaca !== veiculo) return false;
        if (contratante && op.contratanteCNPJ !== contratante) return false;
        return true;
    });

    // Construção HTML
    var html = '<h3 style="text-align:center; border-bottom:2px solid #ccc; padding-bottom:10px;">RELATÓRIO DE OPERAÇÕES</h3>';
    html += '<p>Período: ' + formatarDataParaBrasileiro(dataIni) + ' a ' + formatarDataParaBrasileiro(dataFim) + '</p>';
    html += '<table class="data-table" style="width:100%; border-collapse:collapse; margin-top:15px;">';
    html += '<thead><tr style="background:#eee;"><th>DATA</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th><th>CUSTOS</th><th>LUCRO</th></tr></thead><tbody>';

    var totalFat = 0;
    var totalLucro = 0;

    opsFiltradas.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0) + (Number(op.comissao)||0);
        
        // Add custo ajudantes
        if(op.ajudantes) op.ajudantes.forEach(aj => custo += (Number(aj.diaria)||0));

        var lucro = (Number(op.faturamento)||0) - custo;

        totalFat += (Number(op.faturamento)||0);
        totalLucro += lucro;

        html += '<tr>';
        html += '<td>' + formatarDataParaBrasileiro(op.data) + '</td>';
        html += '<td>' + op.veiculoPlaca + '</td>';
        html += '<td>' + (mot ? mot.nome : 'N/A') + '</td>';
        html += '<td style="color:green;">' + formatarValorMoeda(op.faturamento) + '</td>';
        html += '<td style="color:red;">' + formatarValorMoeda(custo) + '</td>';
        html += '<td><strong>' + formatarValorMoeda(lucro) + '</strong></td>';
        html += '</tr>';
    });

    html += '</tbody><tfoot><tr style="background:#ddd; font-weight:bold;">';
    html += '<td colspan="3">TOTAIS DO PERÍODO</td>';
    html += '<td>' + formatarValorMoeda(totalFat) + '</td>';
    html += '<td> - </td>';
    html += '<td>' + formatarValorMoeda(totalLucro) + '</td>';
    html += '</tr></tfoot></table>';

    divConteudo.innerHTML = html;
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
        // Verifica se é motorista desta op
        if (String(op.motoristaId) === String(funcId)) {
            // Verifica se não tem falta
            if (!op.checkins || !op.checkins.faltaMotorista) {
                var com = Number(op.comissao) || 0;
                totalPagar += com;
                descritivo += '<tr><td>' + formatarDataParaBrasileiro(op.data) + '</td><td>Comissão Viagem (Placa ' + op.veiculoPlaca + ')</td><td>' + formatarValorMoeda(com) + '</td></tr>';
            }
        }
        // Verifica se é ajudante nesta op
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                if (String(aj.id) === String(funcId)) {
                    // Verifica falta ajudante
                    if (!op.checkins || !op.checkins.faltasAjudantes || !op.checkins.faltasAjudantes.includes(String(funcId))) {
                        var diaria = Number(aj.diaria) || 0;
                        totalPagar += diaria;
                        descritivo += '<tr><td>' + formatarDataParaBrasileiro(op.data) + '</td><td>Diária Ajudante (Placa ' + op.veiculoPlaca + ')</td><td>' + formatarValorMoeda(diaria) + '</td></tr>';
                    }
                }
            });
        }
    });

    // Gera HTML do Recibo
    var divRecibo = document.getElementById('reciboContent');
    var html = '<div style="border:2px solid #000; padding:20px; font-family:Courier New, monospace;">';
    html += '<h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>';
    html += '<p><strong>EMPREGADOR:</strong> ' + (CACHE_MINHA_EMPRESA.razaoSocial || 'MINHA EMPRESA') + '</p>';
    html += '<p><strong>BENEFICIÁRIO:</strong> ' + func.nome + ' (CPF: ' + func.documento + ')</p>';
    html += '<hr>';
    html += '<table style="width:100%;"><tr><th align="left">DATA</th><th align="left">DESCRIÇÃO</th><th align="right">VALOR</th></tr>';
    html += descritivo;
    html += '</table>';
    html += '<hr>';
    html += '<h3 style="text-align:right;">TOTAL LÍQUIDO: ' + formatarValorMoeda(totalPagar) + '</h3>';
    html += '<br><br><p style="text-align:center;">__________________________________________<br>ASSINATURA DO BENEFICIÁRIO</p>';
    html += '<p style="text-align:center; font-size:0.8em;">Data de Emissão: ' + new Date().toLocaleDateString() + '</p>';
    html += '</div>';

    // Botão de Imprimir
    html += '<button onclick="var c=document.getElementById(\'reciboContent\').innerHTML; var w=window.open(); w.document.write(c); w.print();" class="btn-primary" style="margin-top:10px;">IMPRIMIR RECIBO</button>';

    divRecibo.innerHTML = html;
};

window.gerarRelatorioCobranca = function() {
    alert("Funcionalidade de Relatório de Cobrança (Filtro por Cliente) em desenvolvimento.");
    // Pode implementar similar ao Relatório Geral, filtrando por Contratante obrigatório.
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') return alert("Gere o relatório primeiro.");
    
    var opt = {
        margin:       0.5,
        filename:     'relatorio_logimaster.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
};

// =============================================================================
// PARTE 5: RENDERIZAÇÃO DE LISTAS E TABELAS
// =============================================================================

function renderizarTabelaFuncionarios() {
    var tbody = document.querySelector('#tabelaFuncionarios tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_FUNCIONARIOS.forEach(f => {
        var tr = document.createElement('tr');
        var btnDel = window.MODO_APENAS_LEITURA ? '' : 
            `<button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> ` +
            `<button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>`;
            
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${formatarTelefoneBrasil(f.telefone)}</td><td>${btnDel}</td>`;
        tbody.appendChild(tr);
    });
}

function renderizarTabelaVeiculos() {
    var tbody = document.querySelector('#tabelaVeiculos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_VEICULOS.forEach(v => {
        var tr = document.createElement('tr');
        var btnDel = window.MODO_APENAS_LEITURA ? '' : 
            `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button> ` +
            `<button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`;
        tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnDel}</td>`;
        tbody.appendChild(tr);
    });
}

function renderizarTabelaContratantes() {
    var tbody = document.querySelector('#tabelaContratantes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    CACHE_CONTRATANTES.forEach(c => {
        var tr = document.createElement('tr');
        var btnDel = window.MODO_APENAS_LEITURA ? '' : 
            `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button> ` +
            `<button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`;
        tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnDel}</td>`;
        tbody.appendChild(tr);
    });
}

function renderizarTabelaOperacoes() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var lista = CACHE_OPERACOES.filter(o => o.status !== 'CANCELADA').sort((a,b) => new Date(b.data) - new Date(a.data));
    
    lista.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome : 'Excluído';
        var tr = document.createElement('tr');
        
        var statusClass = op.status === 'CONFIRMADA' ? 'pill-active' : (op.status === 'EM_ANDAMENTO' ? 'pill-active' : 'pill-pending');
        var statusStyle = op.status === 'EM_ANDAMENTO' ? 'style="background:orange;"' : '';

        var btnActions = `<button class="btn-mini btn-primary" onclick="alert('Detalhes indisponíveis nesta versão rápida.')"><i class="fas fa-eye"></i></button>`;
        if (!window.MODO_APENAS_LEITURA) {
            btnActions += ` <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> ` +
                          `<button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>`;
        }

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

// Monitoramento de Checkins e Faltas (Agregado)
function renderizarTabelaMonitoramento() {
    var tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    var tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    if (tbodyAtivos) tbodyAtivos.innerHTML = '';
    if (tbodyFaltas) tbodyFaltas.innerHTML = '';

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        var isConfirmada = op.status === 'CONFIRMADA';
        var mot = buscarFuncionarioPorId(op.motoristaId);
        
        // 1. Faltas
        if (tbodyFaltas) {
            if (op.checkins && op.checkins.faltaMotorista) {
                tbodyFaltas.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${mot?mot.nome:'-'}</td><td>MOTORISTA</td><td style="color:red">FALTA</td><td><button onclick="desfazerFalta('${op.id}', 'motorista', '${op.motoristaId}')">X</button></td></tr>`;
            }
        }

        // 2. Ativos (Monitoramento)
        if (tbodyAtivos && !isConfirmada && (!op.checkins || !op.checkins.faltaMotorista)) {
            var statusVisual = op.checkins && op.checkins.motorista ? 'EM ROTA' : 'AGUARDANDO';
            var rowColor = op.checkins && op.checkins.motorista ? 'border-left:4px solid green;' : 'border-left:4px solid orange;';
            
            var acoes = window.MODO_APENAS_LEITURA ? '-' : `
                <button class="btn-mini btn-success" onclick="forcarCheckin('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-play"></i></button>
                <button class="btn-mini btn-danger" onclick="marcarFalta('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-ban"></i></button>
            `;

            tbodyAtivos.innerHTML += `
                <tr style="${rowColor}">
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>Op #${op.id} <small>(${op.veiculoPlaca})</small></td>
                    <td>${mot?mot.nome:'-'}</td>
                    <td>${statusVisual}</td>
                    <td>${acoes}</td>
                </tr>
            `;
        }
    });
}

function preencherTodosSelects() {
    function fill(id, dados, valKey, textKey, defaultText) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${defaultText}</option>` + 
            dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join('');
    }

    // Usando nomes padronizados
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE ATIVIDADE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    // Relatórios
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE...');

    // Atualiza todas as tabelas
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaOperacoes();
    renderizarTabelaMonitoramento();
    if(typeof renderizarInformacoesEmpresa === 'function') renderizarInformacoesEmpresa();
}

// =============================================================================
// PARTE 6: CALENDÁRIO
// =============================================================================

window.renderizarCalendario = function() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = '';
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDia = new Date(ano, mes, 1).getDay();
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDia; i++) grid.appendChild(document.createElement('div')); // Empty

    for (var d = 1; d <= diasNoMes; d++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.innerHTML = `<span>${d}</span>`;
        
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        var ops = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (ops.length > 0) {
            cell.classList.add('has-operation');
            var total = ops.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            cell.innerHTML += `<div class="event-dot"></div><div style="font-size:0.7em; margin-top:auto; color:green; font-weight:bold;">${formatarValorMoeda(total)}</div>`;
        }
        grid.appendChild(cell);
    }
};

window.changeMonth = function(dir) {
    window.currentDate.setMonth(window.currentDate.getMonth() + dir);
    renderizarCalendario();
    atualizarDashboard();
};

// =============================================================================
// PARTE 7: CRUD (SALVAR, EDITAR, EXCLUIR)
// =============================================================================

// Salvar Funcionário
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        var id = document.getElementById('funcionarioId').value || Date.now().toString();
        var novo = {
            id: id,
            nome: document.getElementById('funcNome').value.toUpperCase(),
            funcao: document.getElementById('funcFuncao').value,
            documento: document.getElementById('funcDocumento').value,
            telefone: document.getElementById('funcTelefone').value,
            email: document.getElementById('funcEmail').value,
            pix: document.getElementById('funcPix').value,
            endereco: document.getElementById('funcEndereco').value,
            // Motorista specific
            cnh: document.getElementById('funcCNH').value,
            validadeCNH: document.getElementById('funcValidadeCNH').value
        };

        var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        lista.push(novo);
        salvarListaFuncionarios(lista).then(() => {
            alert("Funcionário Salvo!");
            e.target.reset();
            document.getElementById('funcionarioId').value = '';
            preencherTodosSelects();
        });
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
            ano: document.getElementById('veiculoAno').value
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

// Salvar Operação (Lógica Complexa)
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var antiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;

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
            status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA',
            
            // Preserva dados de sistema
            checkins: antiga ? antiga.checkins : { motorista: false, ajudantes: [] },
            ajudantes: window._operacaoAjudantesTempList || []
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert("Operação Salva!");
            e.target.reset();
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects();
            renderizarCalendario();
            atualizarDashboard();
        });
    }
});

// Funções de Edição
window.preencherFormularioFuncionario = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;
    document.getElementById('funcionarioId').value = f.id;
    document.getElementById('funcNome').value = f.nome;
    document.getElementById('funcFuncao').value = f.funcao;
    document.getElementById('funcDocumento').value = f.documento;
    document.getElementById('funcTelefone').value = f.telefone;
    document.getElementById('funcEmail').value = f.email;
    document.getElementById('funcPix').value = f.pix || '';
    document.getElementById('funcEndereco').value = f.endereco || '';
    if (f.funcao === 'motorista') {
        toggleDriverFields();
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
    }
    // Troca aba e scroll
    var btn = document.querySelector('[data-tab="funcionarios"]');
    if (btn) btn.click();
    window.scrollTo(0,0);
};

window.preencherFormularioOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');
    
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderizarListaAjudantesAdicionados();

    var nav = document.querySelector('[data-page="operacoes"]');
    if (nav) nav.click();
    window.scrollTo(0,0);
};

// Funções de Exclusão
window.excluirFuncionario = function(id) {
    if(!confirm("Excluir?")) return;
    salvarListaFuncionarios(CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id))).then(() => preencherTodosSelects());
};
window.excluirVeiculo = function(placa) {
    if(!confirm("Excluir?")) return;
    salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects());
};
window.excluirContratante = function(cnpj) {
    if(!confirm("Excluir?")) return;
    salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects());
};
window.excluirOperacao = function(id) {
    if(!confirm("Excluir operação e remover do financeiro?")) return;
    salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => {
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
    });
};

// Intervenções Administrativas (Checkin Manual)
window.forcarCheckin = function(opId, tipo, uid) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;
    if (!op.checkins) op.checkins = {};
    
    if (tipo === 'motorista') {
        op.checkins.motorista = true;
        op.status = 'EM_ANDAMENTO';
    }
    // Salva
    var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(opId));
    lista.push(op);
    salvarListaOperacoes(lista).then(() => {
        renderizarTabelaMonitoramento();
        renderizarTabelaOperacoes();
        alert("Check-in manual realizado.");
    });
};

window.marcarFalta = function(opId, tipo, uid) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;
    if (!op.checkins) op.checkins = {};
    op.checkins.faltaMotorista = true;
    
    var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(opId));
    lista.push(op);
    salvarListaOperacoes(lista).then(() => {
        renderizarTabelaMonitoramento();
        alert("Falta registrada.");
    });
};

window.desfazerFalta = function(opId, tipo, uid) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;
    if (op.checkins) op.checkins.faltaMotorista = false;
    
    var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(opId));
    lista.push(op);
    salvarListaOperacoes(lista).then(() => {
        renderizarTabelaMonitoramento();
        alert("Falta removida.");
    });
};

// =============================================================================
// PARTE 8: INICIALIZAÇÃO E NAVEGAÇÃO
// =============================================================================

function configurarNavegacao() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
            
            var target = document.getElementById(pageId);
            if (target) {
                target.style.display = 'block';
                setTimeout(() => target.classList.add('active'), 10);
            }
            
            // Re-renderizações específicas ao entrar na página
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'checkins-pendentes') renderizarTabelaMonitoramento();
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

// Ajudantes manuais
window.renderizarListaAjudantesAdicionados = function() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    ul.innerHTML = (window._operacaoAjudantesTempList || []).map(item => {
        var nome = buscarFuncionarioPorId(item.id)?.nome || '?';
        return `<li>${nome} (R$ ${item.diaria}) <button type="button" onclick="window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => x.id != '${item.id}'); renderizarListaAjudantesAdicionados()">X</button></li>`;
    }).join('');
};

document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() {
    var sel = document.getElementById('selectAjudantesOperacao');
    if (!sel.value) return;
    var valor = prompt("Valor da Diária para este ajudante?");
    if (valor) {
        if (!window._operacaoAjudantesTempList) window._operacaoAjudantesTempList = [];
        window._operacaoAjudantesTempList.push({ id: sel.value, diaria: Number(valor.replace(',','.')) });
        renderizarListaAjudantesAdicionados();
    }
});

// Boot do Sistema
window.initSystemByRole = function(user) {
    console.log("Iniciando como", user.role);
    window.USUARIO_ATUAL = user;
    
    // UI por Role
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
        document.querySelector('[data-page="home"]').click(); // Vai para Home
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        document.querySelector('[data-page="employee-home"]').click();
    }
    
    configurarNavegacao();
};

// Listeners Globais
document.addEventListener('DOMContentLoaded', configurarNavegacao);