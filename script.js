// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 22.0 (INTEGRAL - SEM COMPACTAÇÃO - TODAS AS FUNÇÕES RESTAURADAS)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES E CHAVES DE ARMAZENAMENTO
// -----------------------------------------------------------------------------
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_MENSAGENS = 'db_mensagens';

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// -----------------------------------------------------------------------------
window.USUARIO_ATUAL = null;       // Objeto do usuário logado (Auth)
window.MODO_APENAS_LEITURA = false; // Flag para perfil de funcionário
window.currentDate = new Date();   // Data atual do calendário/dashboard
window.chartInstance = null;       // Instância do gráfico Chart.js
window._operacaoAjudantesTempList = []; // Buffer para ajudantes na tela de operação
window.MEDIA_KM_L_GLOBAL = 0;      // Cache da média de consumo da frota

// CACHE DE DADOS (Carregados da memória/localstorage para performance)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];

// -----------------------------------------------------------------------------
// 3. FUNÇÕES UTILITÁRIAS DE FORMATAÇÃO (HELPERS)
// -----------------------------------------------------------------------------

function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    // Converte YYYY-MM-DD para DD/MM/AAAA
    if (!dataIso) return '-';
    var partes = dataIso.split('-');
    if (partes.length === 3) {
        return partes[2] + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

function formatarTelefoneBrasil(telefone) {
    var v = String(telefone || '').replace(/\D/g, '');
    if (v.length > 10) { // (11) 91234-5678
        return '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7, 11);
    } else if (v.length > 6) {
        return '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
    }
    return telefone;
}

function formatarDocumento(doc) {
    // Formatação simples para CPF/CNPJ visual
    var v = String(doc || '').replace(/\D/g, '');
    if (v.length === 11) { // CPF
        return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (v.length === 14) { // CNPJ
        return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return doc;
}

// -----------------------------------------------------------------------------
// 4. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE CLOUD)
// -----------------------------------------------------------------------------

function carregarDadosGenerico(chave, variavelCache, valorPadrao) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : valorPadrao;
    } catch (erro) {
        console.error("Erro ao carregar do LocalStorage: " + chave, erro);
        return valorPadrao;
    }
}

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
    console.log("Dados carregados. Operações:", CACHE_OPERACOES.length);
}

// Função Central de Salvamento com Sincronização
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e LocalStorage (Instantâneo para o usuário)
    if (atualizarCacheCallback) atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Sincroniza com Firebase (Background)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Não salva se for Super Admin logado no painel master, apenas empresas reais
        if (window.USUARIO_ATUAL.email.toUpperCase() !== 'ADMIN@LOGIMASTER.COM') {
            const { db, doc, setDoc } = window.dbRef;
            try {
                // Estrutura: companies > DOMINIO > data > NOME_DA_COLECAO
                await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), { 
                    items: dados, 
                    lastUpdate: new Date().toISOString(),
                    updatedBy: window.USUARIO_ATUAL.email
                });
                console.log("Dados sincronizados com nuvem: " + chave);
            } catch (erro) {
                console.error("Falha na sincronização Firebase (" + chave + "):", erro);
                // Não alertamos o usuário para não interromper o fluxo, apenas logamos
            }
        }
    }
}

// Wrappers Específicos (Para manter legibilidade do código original)
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Funções de Busca Rápida (Helpers)
function buscarFuncionarioPorId(id) { 
    return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); 
}
function buscarVeiculoPorPlaca(placa) { 
    return CACHE_VEICULOS.find(v => v.placa === placa); 
}
function buscarContratantePorCnpj(cnpj) { 
    return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); 
}
function buscarAtividadePorId(id) { 
    return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); 
}

// Inicialização imediata dos dados ao carregar o script
carregarTodosDadosLocais();
// =============================================================================
// PARTE 2: DASHBOARD, CALENDÁRIO E CÁLCULOS FINANCEIROS
// =============================================================================

// -----------------------------------------------------------------------------
// 5. ATUALIZAÇÃO DO DASHBOARD (Lógica Financeira Global)
// -----------------------------------------------------------------------------
window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var despesasCaixaMes = 0; // Despesas pagas no mês (Caixa)
    var receitaHistorico = 0;
    
    // Variáveis para Média Global de Consumo
    var kmTotalGeral = 0;
    var litrosTotaisGeral = 0;
    
    // 1. Processar Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;

        var valorFat = Number(op.faturamento) || 0;
        var kmOp = Number(op.kmRodado) || 0;
        
        // Custos que afetam o CAIXA (Pagamentos realizados)
        var custoFinanceiroOp = (Number(op.despesas) || 0) + 
                                (Number(op.combustivel) || 0) + 
                                (Number(op.comissao) || 0);
        
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => custoFinanceiroOp += (Number(aj.diaria) || 0));
        }

        // Acumulação Global para Média KM/L (Apenas dados válidos)
        if (kmOp > 0 && (Number(op.combustivel) > 0)) {
            var precoL = Number(op.precoLitro);
            if (precoL > 0) {
                var litros = Number(op.combustivel) / precoL;
                kmTotalGeral += kmOp;
                litrosTotaisGeral += litros;
            }
        }

        receitaHistorico += valorFat;

        // Filtra pelo Mês Atual do Dashboard
        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            despesasCaixaMes += custoFinanceiroOp;
        }
    });

    // 2. Processar Despesas Gerais (Aluguel, Luz, Manutenção Oficina)
    CACHE_DESPESAS.forEach(function(desp) {
        var dt = new Date(desp.data + 'T12:00:00');
        if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
            despesasCaixaMes += (Number(desp.valor) || 0);
        }
    });

    // 3. Cálculo da Média Global
    var mediaKmL = litrosTotaisGeral > 0 ? (kmTotalGeral / litrosTotaisGeral) : 0;
    window.MEDIA_KM_L_GLOBAL = mediaKmL; // Guarda para uso nos modais

    // 4. Atualizar Interface (DOM)
    var lucroMes = faturamentoMes - despesasCaixaMes;
    
    // Atualiza Cards
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMedia = document.getElementById('margemLucroMedia'); // Agora mostra a Média KM/L

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(despesasCaixaMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    
    if (elMedia) {
        // Exibe Performance da Frota no lugar da Margem Percentual
        elMedia.textContent = mediaKmL > 0 ? mediaKmL.toFixed(2) + ' KM/L (MÉDIA)' : 'N/A';
        elMedia.parentNode.classList.remove('warning');
        elMedia.parentNode.classList.add('info'); // Muda cor visualmente se possível
    }

    // 5. Atualiza Gráfico
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// 6. RENDERIZAÇÃO DO CALENDÁRIO INTERATIVO
// -----------------------------------------------------------------------------
window.renderizarCalendario = function() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; // Limpa
    
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Espaços vazios
    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        grid.appendChild(emptyCell);
    }

    // Dias do mês
    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // CORREÇÃO CRÍTICA: Formatação ISO YYYY-MM-DD para garantir match
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        
        var cellContent = `<span>${dia}</span>`;
        var opsDoDia = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            cellContent += `<div class="event-dot"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // CLICK: Abre modal de detalhes passando a DATA STRING CORRETA
            cell.onclick = (function(dStr) {
                return function() { abrirModalDetalhesDia(dStr); };
            })(dateStr);
        } else {
            // CLICK: Abre formulário de nova operação
            cell.onclick = (function(dStr) {
                return function() { 
                    document.getElementById('operacaoData').value = dStr;
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

// -----------------------------------------------------------------------------
// 7. GRÁFICOS (Chart.js)
// -----------------------------------------------------------------------------
function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return;

    if (window.chartInstance) window.chartInstance.destroy();

    var receita = 0, combustivel = 0, pessoal = 0, geral = 0;
    
    // Filtra dados para o gráfico
    CACHE_OPERACOES.forEach(op => {
        var d = new Date(op.data + 'T12:00:00');
        if (op.status !== 'CANCELADA' && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            pessoal += Number(op.comissao || 0);
            if (op.ajudantes) op.ajudantes.forEach(aj => pessoal += (Number(aj.diaria)||0));
            geral += Number(op.despesas || 0);
        }
    });

    CACHE_DESPESAS.forEach(d => {
        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            geral += Number(d.valor || 0);
        }
    });

    var lucro = receita - (combustivel + pessoal + geral);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'GERAL/MANUT', 'LUCRO'],
            datasets: [{
                label: 'Resultados (R$)',
                data: [receita, combustivel, pessoal, geral, lucro],
                backgroundColor: [
                    'rgba(46, 125, 50, 0.7)',
                    'rgba(198, 40, 40, 0.7)',
                    'rgba(255, 152, 0, 0.7)',
                    'rgba(156, 39, 176, 0.7)',
                    (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)')
                ]
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
// =============================================================================
// PARTE 3: CRUD COMPLETO E MODAL DETALHES
// =============================================================================

// -----------------------------------------------------------------------------
// 8. CÁLCULO DE MÉDIA GLOBAL (Função Auxiliar)
// -----------------------------------------------------------------------------
window.calcularMediaGlobalVeiculo = function(placa) {
    if (!CACHE_OPERACOES) return 0;
    
    // Filtra todas as operações válidas deste veículo
    var ops = CACHE_OPERACOES.filter(function(op) {
        return op.veiculoPlaca === placa && 
               op.status !== 'CANCELADA' && 
               Number(op.kmRodado) > 0 && 
               Number(op.combustivel) > 0;
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    ops.forEach(function(op) {
        var preco = Number(op.precoLitro);
        if (preco > 0) {
            totalKm += Number(op.kmRodado);
            totalLitros += (Number(op.combustivel) / preco);
        }
    });

    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

// -----------------------------------------------------------------------------
// 9. MODAL DETALHES DO DIA (Corrigido e Detalhado)
// -----------------------------------------------------------------------------
window.abrirModalDetalhesDia = function(dataString) {
    try {
        var ops = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
        var modal = document.getElementById('modalDayOperations');
        
        if (!modal) return;
        
        document.getElementById('modalDayTitle').textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);
        var corpo = document.getElementById('modalDayBody');
        var resumo = document.getElementById('modalDaySummary');

        var totalFat = 0;
        var totalLucro = 0;
        
        var html = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%; font-size:0.9rem;">';
        html += '<thead><tr style="background:#263238; color:white;"><th>CLIENTE / VEÍCULO</th><th>FATURAMENTO</th><th>CUSTOS DIRETO</th><th>LUCRO OP.</th></tr></thead><tbody>';

        ops.forEach(op => {
            var receita = Number(op.faturamento)||0;
            
            // Custos Diretos da Viagem (Comissão + Pedagio + Abastecimento local)
            var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0) + (Number(op.comissao)||0);
            if(op.ajudantes) op.ajudantes.forEach(aj => custo += (Number(aj.diaria)||0));
            
            var lucro = receita - custo;
            totalFat += receita;
            totalLucro += lucro;
            
            // Média Global do Veículo
            var media = window.calcularMediaGlobalVeiculo(op.veiculoPlaca);
            var nomeCli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';

            html += `<tr>
                <td>
                    <strong>${nomeCli.substr(0,15)}</strong><br>
                    ${op.veiculoPlaca} <small style="color:blue">(${media>0 ? media.toFixed(2)+' km/l' : '-'})</small>
                </td>
                <td style="color:green; font-weight:bold;">${formatarValorMoeda(receita)}</td>
                <td style="color:red;">${formatarValorMoeda(custo)}</td>
                <td><strong>${formatarValorMoeda(lucro)}</strong></td>
            </tr>`;
        });
        html += '</tbody></table></div>';

        // Resumo no Topo do Modal
        if(resumo) resumo.innerHTML = `
            <div style="display:flex; justify-content:space-around; background:#e0f2f1; padding:15px; border-radius:6px; margin-bottom:15px; border:1px solid #b2dfdb;">
                <div style="text-align:center">
                    <small style="color:#00695c; font-weight:bold;">FATURAMENTO</small><br>
                    <strong style="color:#004d40; font-size:1.3rem;">${formatarValorMoeda(totalFat)}</strong>
                </div>
                <div style="text-align:center">
                    <small style="color:#00695c; font-weight:bold;">LUCRO OPERACIONAL</small><br>
                    <strong style="color:${totalLucro>=0?'green':'red'}; font-size:1.3rem;">${formatarValorMoeda(totalLucro)}</strong>
                </div>
            </div>`;
        
        corpo.innerHTML = html;
        modal.style.display = 'block';
    } catch(e) {
        console.error(e);
        alert("Erro ao abrir detalhes: " + e.message);
    }
};

// -----------------------------------------------------------------------------
// 10. SALVAMENTO DE CADASTROS (CRUD)
// -----------------------------------------------------------------------------

// SALVAR FUNCIONÁRIO (Com criação de Auth no Firebase)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        
        var btn = e.target.querySelector('button[type="submit"]');
        var txtOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value;
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            
            var novoUID = id; 
            
            // Se for novo cadastro e tiver senha, cria usuário no Firebase Auth
            // (Só faz isso se não estiver editando um existente sem senha)
            if (!document.getElementById('funcionarioId').value && senha) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                // Chama função do index.html para criar auth secundário
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                
                // Cria perfil na coleção users
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

            var novo = {
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

            var lista = CACHE_FUNCIONARIOS.filter(f => f.id !== String(id) && f.email !== email);
            lista.push(novo);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo e Acesso Criado!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields();
            preencherTodosSelects();

        } catch (err) { 
            console.error(err);
            alert("Erro ao salvar: " + err.message); 
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = txtOriginal; 
        }
    }
});

// SALVAR OPERAÇÃO (Lógica Blindada)
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var antiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;

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
            
            status: isAgendamento ? 'AGENDADA' : 'CONFIRMADA',
            checkins: antiga ? antiga.checkins : { motorista: false, ajudantes: [] },
            ajudantes: window._operacaoAjudantesTempList || []
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert(isAgendamento ? "Operação Agendada!" : "Operação Confirmada!");
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

// Outros Saves (Veículo, Contratante, Atividade, Empresa, Despesa)
document.addEventListener('submit', function(e) { if(e.target.id==='formVeiculo'){ e.preventDefault(); var p=document.getElementById('veiculoPlaca').value.toUpperCase(); var n={placa:p, modelo:document.getElementById('veiculoModelo').value.toUpperCase(), ano:document.getElementById('veiculoAno').value, renavam:document.getElementById('veiculoRenavam').value, chassi:document.getElementById('veiculoChassi').value}; var l=CACHE_VEICULOS.filter(v=>v.placa!==p); l.push(n); salvarListaVeiculos(l).then(()=>{alert("Veículo Salvo!"); e.target.reset(); preencherTodosSelects();}); }});
document.addEventListener('submit', function(e) { if(e.target.id==='formContratante'){ e.preventDefault(); var c=document.getElementById('contratanteCNPJ').value; var n={cnpj:c, razaoSocial:document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone:document.getElementById('contratanteTelefone').value}; var l=CACHE_CONTRATANTES.filter(x=>x.cnpj!==c); l.push(n); salvarListaContratantes(l).then(()=>{alert("Cliente Salvo!"); e.target.reset(); preencherTodosSelects();}); }});
document.addEventListener('submit', function(e) { if(e.target.id==='formAtividade'){ e.preventDefault(); var id=document.getElementById('atividadeId').value||Date.now().toString(); var n={id:id, nome:document.getElementById('atividadeNome').value.toUpperCase()}; var l=CACHE_ATIVIDADES.filter(x=>String(x.id)!==String(id)); l.push(n); salvarListaAtividades(l).then(()=>{alert("Atividade Salva!"); e.target.reset(); document.getElementById('atividadeId').value=''; preencherTodosSelects();}); }});
document.addEventListener('submit', function(e) { if(e.target.id==='formMinhaEmpresa'){ e.preventDefault(); salvarDadosMinhaEmpresa({razaoSocial:document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj:document.getElementById('minhaEmpresaCNPJ').value, telefone:document.getElementById('minhaEmpresaTelefone').value}).then(()=>{alert("Empresa Atualizada!"); renderizarInformacoesEmpresa();}); }});
document.addEventListener('submit', function(e) { if(e.target.id==='formDespesaGeral'){ e.preventDefault(); var n={id:Date.now().toString(), data:document.getElementById('despesaGeralData').value, veiculoPlaca:document.getElementById('selectVeiculoDespesaGeral').value, descricao:document.getElementById('despesaGeralDescricao').value.toUpperCase(), valor:document.getElementById('despesaGeralValor').value, formaPagamento:document.getElementById('despesaFormaPagamento').value, modoPagamento:document.getElementById('despesaModoPagamento').value, parcelas:document.getElementById('despesaParcelas').value, parcelasPagas:document.getElementById('despesaParcelasPagas').value}; CACHE_DESPESAS.push(n); salvarListaDespesas(CACHE_DESPESAS).then(()=>{alert("Despesa Salva!"); e.target.reset(); renderizarTabelaDespesasGerais(); atualizarDashboard();}); }});
// =============================================================================
// PARTE 4: RELATÓRIOS, SUPER ADMIN E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 11. MÓDULO SUPER ADMIN (PAINEL GLOBAL)
// -----------------------------------------------------------------------------
window.carregarPainelSuperAdmin = async function(force) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;
    if(force) container.innerHTML = '<p style="text-align:center">Carregando base global...</p>';
    
    const { db, collection, getDocs } = window.dbRef;
    try {
        // Varre todos os usuários para identificar empresas
        var usersSnap = await getDocs(collection(db, "users"));
        var mapEmpresas = {};
        
        usersSnap.forEach(d => {
            var u = d.data();
            var dom = u.company || 'SEM_EMPRESA';
            if(!mapEmpresas[dom]) mapEmpresas[dom] = [];
            mapEmpresas[dom].push({...u, uid:d.id});
        });
        
        container.innerHTML = '';
        Object.keys(mapEmpresas).sort().forEach(dom => {
            var users = mapEmpresas[dom];
            var div = document.createElement('div');
            div.className = 'company-block';
            div.innerHTML = `
                <div class="company-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display=='block'?'none':'block'">
                    <h4><i class="fas fa-building"></i> ${dom.toUpperCase()}</h4>
                    <span>${users.length} Usuários</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="company-content">
                    <table class="data-table" style="width:100%">
                        <thead style="background:#eee;"><tr><th>NOME</th><th>EMAIL</th><th>FUNÇÃO</th><th>AÇÃO</th></tr></thead>
                        <tbody>${users.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-mini delete-btn" onclick="superAdminDeleteUser('${u.uid}','${dom}')">EXCLUIR</button></td></tr>`).join('')}</tbody>
                    </table>
                </div>`;
            container.appendChild(div);
        });
    } catch(e) { container.innerHTML = "Erro: " + e.message; }
};

window.superAdminDeleteUser = async function(uid, dom) {
    if(!confirm("TEM CERTEZA? O usuário perderá o acesso.")) return;
    try {
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid));
        alert("Usuário removido do Auth."); 
        carregarPainelSuperAdmin(true);
    } catch(e) { alert("Erro: " + e.message); }
};

// Listener Criação de Empresa (Super Admin)
document.addEventListener('submit', async function(e) {
    if(e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dom = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
        
        if(dom.indexOf('.') === -1) return alert("Domínio inválido.");
        
        try {
            // Cria o registro inicial da empresa para que o admin possa ser reconhecido
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, 'companies', dom, 'data', 'db_funcionarios'), {
                items: [{ id: 'admin_'+Date.now(), nome: 'ADMIN', email: email, funcao: 'admin' }],
                lastUpdate: new Date().toISOString()
            });
            alert("Ambiente criado! Peça para o cliente se cadastrar com o email: " + email);
            e.target.reset();
        } catch(err) { alert("Erro: " + err.message); }
    }
});

// -----------------------------------------------------------------------------
// 12. HELPERS DE UI (Preenchimento de Selects, Ajudantes)
// -----------------------------------------------------------------------------
window.renderizarListaAjudantesAdicionados = function() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if(!ul) return;
    ul.innerHTML = (window._operacaoAjudantesTempList || []).map(a => {
        var f = buscarFuncionarioPorId(a.id);
        return `<li>${f?f.nome:'?'} (${formatarValorMoeda(a.diaria)}) <button type="button" class="btn-mini delete-btn" onclick="window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!='${a.id}');renderizarListaAjudantesAdicionados()">X</button></li>`;
    }).join('');
};

document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() {
    var sel = document.getElementById('selectAjudantesOperacao');
    if(!sel.value) return alert("Selecione...");
    var v = prompt("Valor Diária?", "0");
    if(v) {
        if(!window._operacaoAjudantesTempList) window._operacaoAjudantesTempList=[];
        window._operacaoAjudantesTempList.push({id:sel.value, diaria:Number(v.replace(',','.'))});
        renderizarListaAjudantesAdicionados();
        sel.value = '';
    }
});

window.toggleDriverFields = function() {
    var s = document.getElementById('funcFuncao');
    var d = document.getElementById('driverSpecificFields');
    if(s && d) d.style.display = (s.value === 'motorista') ? 'block' : 'none';
};

window.toggleDespesaParcelas = function() {
    var m = document.getElementById('despesaModoPagamento');
    var d = document.getElementById('divDespesaParcelas');
    if(m && d) d.style.display = (m.value === 'parcelado') ? 'flex' : 'none';
};

function preencherTodosSelects() {
    const fill = (id, arr, val, txt, def) => {
        var el = document.getElementById(id);
        if(el) {
            var old = el.value;
            el.innerHTML = `<option value="">${def}</option>` + arr.map(i=>`<option value="${i[val]}">${i[txt]}</option>`).join('');
            if(old) el.value = old;
        }
    };
    
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE ATIVIDADE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'GERAL (SEM VÍNCULO)');
    
    // Atualiza Tabelas
    renderizarTabelaOperacoes();
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaDespesasGerais();
    renderizarInformacoesEmpresa();
    
    // Atualiza Equipe (Função Async, chama sem await para não travar)
    if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
}

// -----------------------------------------------------------------------------
// 13. RENDERIZADORES DE TABELA
// -----------------------------------------------------------------------------
function renderizarTabelaOperacoes() {
    var tb = document.querySelector('#tabelaOperacoes tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)).forEach(op=>{
        if(op.status==='CANCELADA') return;
        var m = buscarFuncionarioPorId(op.motoristaId);
        tb.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m?m.nome:'-'} / ${op.veiculoPlaca}</td><td>${op.status}</td><td style="color:green">${formatarValorMoeda(op.faturamento)}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
}
function renderizarTabelaFuncionarios() { var tb=document.querySelector('#tabelaFuncionarios tbody'); if(tb){ tb.innerHTML=''; CACHE_FUNCIONARIOS.forEach(f=>tb.innerHTML+=`<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button></td></tr>`);}}
function renderizarTabelaVeiculos() { var tb=document.querySelector('#tabelaVeiculos tbody'); if(tb){ tb.innerHTML=''; CACHE_VEICULOS.forEach(v=>tb.innerHTML+=`<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button></td></tr>`);}}
function renderizarTabelaContratantes() { var tb=document.querySelector('#tabelaContratantes tbody'); if(tb){ tb.innerHTML=''; CACHE_CONTRATANTES.forEach(c=>tb.innerHTML+=`<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button></td></tr>`);}}
function renderizarTabelaAtividades() { var tb=document.querySelector('#tabelaAtividades tbody'); if(tb){ tb.innerHTML=''; CACHE_ATIVIDADES.forEach(a=>tb.innerHTML+=`<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button></td></tr>`);}}
function renderizarTabelaDespesasGerais() { var tb=document.querySelector('#tabelaDespesasGerais tbody'); if(tb){ tb.innerHTML=''; CACHE_DESPESAS.forEach(d=>tb.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.descricao}</td><td>${formatarValorMoeda(d.valor)}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td></tr>`);}}
function renderizarInformacoesEmpresa() { var d=document.getElementById('viewMinhaEmpresaContent'); if(d) d.innerHTML = CACHE_MINHA_EMPRESA.razaoSocial ? `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong>` : 'Sem dados.'; }

// -----------------------------------------------------------------------------
// 14. FUNÇÕES DE EDIÇÃO E EXCLUSÃO
// -----------------------------------------------------------------------------
window.preencherFormularioOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o=>String(o.id)===String(id)); if(!op) return;
    document.getElementById('operacaoId').value=op.id; document.getElementById('operacaoData').value=op.data;
    document.getElementById('selectMotoristaOperacao').value=op.motoristaId; document.getElementById('selectVeiculoOperacao').value=op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value=op.contratanteCNPJ; document.getElementById('selectAtividadeOperacao').value=op.atividadeId;
    document.getElementById('operacaoFaturamento').value=op.faturamento; document.getElementById('operacaoAdiantamento').value=op.adiantamento;
    document.getElementById('operacaoComissao').value=op.comissao; document.getElementById('operacaoDespesas').value=op.despesas;
    document.getElementById('operacaoCombustivel').value=op.combustivel; document.getElementById('operacaoPrecoLitro').value=op.precoLitro;
    document.getElementById('operacaoKmRodado').value=op.kmRodado; document.getElementById('operacaoIsAgendamento').checked=(op.status==='AGENDADA');
    window._operacaoAjudantesTempList=op.ajudantes||[]; renderizarListaAjudantesAdicionados(); document.querySelector('[data-page="operacoes"]').click();
};
window.preencherFormularioFuncionario = function(id) { var f=buscarFuncionarioPorId(id); if(f){ document.getElementById('funcionarioId').value=f.id; document.getElementById('funcNome').value=f.nome; document.getElementById('funcFuncao').value=f.funcao; document.getElementById('funcDocumento').value=f.documento; document.getElementById('funcEmail').value=f.email; toggleDriverFields(); if(f.funcao==='motorista'){ document.getElementById('funcCNH').value=f.cnh; document.getElementById('funcValidadeCNH').value=f.validadeCNH; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); }};
window.preencherFormularioVeiculo = function(placa) { var v=buscarVeiculoPorPlaca(placa); if(v){ document.getElementById('veiculoPlaca').value=v.placa; document.getElementById('veiculoModelo').value=v.modelo; document.getElementById('veiculoAno').value=v.ano; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); }};
window.preencherFormularioContratante = function(cnpj) { var c=buscarContratantePorCnpj(cnpj); if(c){ document.getElementById('contratanteCNPJ').value=c.cnpj; document.getElementById('contratanteRazaoSocial').value=c.razaoSocial; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); }};

window.excluirOperacao = function(id) { if(confirm("Excluir?")) salvarListaOperacoes(CACHE_OPERACOES.filter(o=>o.id!==id)).then(()=>{preencherTodosSelects(); atualizarDashboard(); renderizarCalendario();}); };
window.excluirFuncionario = function(id) { if(confirm("Excluir?")) salvarListaFuncionarios(CACHE_FUNCIONARIOS.filter(f=>f.id!==id)).then(preencherTodosSelects); };
window.excluirVeiculo = function(placa) { if(confirm("Excluir?")) salvarListaVeiculos(CACHE_VEICULOS.filter(v=>v.placa!==placa)).then(preencherTodosSelects); };
window.excluirContratante = function(cnpj) { if(confirm("Excluir?")) salvarListaContratantes(CACHE_CONTRATANTES.filter(c=>c.cnpj!==cnpj)).then(preencherTodosSelects); };
window.excluirAtividade = function(id) { if(confirm("Excluir?")) salvarListaAtividades(CACHE_ATIVIDADES.filter(a=>a.id!==id)).then(preencherTodosSelects); };
window.excluirDespesa = function(id) { if(confirm("Excluir?")) salvarListaDespesas(CACHE_DESPESAS.filter(d=>d.id!==id)).then(()=>{renderizarTabelaDespesasGerais(); atualizarDashboard();}); };

// -----------------------------------------------------------------------------
// 15. INICIALIZAÇÃO DO SISTEMA
// -----------------------------------------------------------------------------
window.initSystemByRole = function(user) {
    window.USUARIO_ATUAL = user;
    
    // Rota Super Admin
    if(user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') {
        document.getElementById('menu-admin').style.display = 'none';
        document.getElementById('menu-employee').style.display = 'none';
        document.getElementById('menu-super-admin').style.display = 'block';
        configurarNavegacao();
        document.querySelector('[data-page="super-admin"]').click();
        carregarPainelSuperAdmin(true);
        return;
    }

    // Rota Empresas Normais
    carregarTodosDadosLocais();
    
    if(user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        window.MODO_APENAS_LEITURA = false;
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
        document.querySelector('[data-page="home"]').click();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        if(typeof carregarDadosMeuPerfil === 'function') carregarDadosMeuPerfil(user.email);
        document.querySelector('[data-page="employee-home"]').click();
    }
    configurarNavegacao();
};

function configurarNavegacao() {
    document.querySelectorAll('.nav-item').forEach(i => i.onclick = function() {
        var pid = this.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
        var target = document.getElementById(pid);
        if(target) { target.style.display='block'; setTimeout(()=>target.classList.add('active'),10); }
        if(pid==='home') { renderizarCalendario(); atualizarDashboard(); }
        // Se clicar em Equipe, carrega lista
        if(pid==='access-management' && typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
    });
    
    document.querySelectorAll('.cadastro-tab-btn').forEach(t => t.onclick = function() {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f=>f.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.getAttribute('data-tab')).classList.add('active');
    });
}

document.addEventListener('DOMContentLoaded', configurarNavegacao);