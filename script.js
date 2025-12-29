// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 4.1 (EXPANDIDA E CORRIGIDA)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
// -----------------------------------------------------------------------------
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// -----------------------------------------------------------------------------
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// VARIÁVEIS DO SISTEMA DE CRÉDITOS E SEGURANÇA
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Sincronizado com a memória RAM para performance)
// -----------------------------------------------------------------------------
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// -----------------------------------------------------------------------------
// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS)
// -----------------------------------------------------------------------------

function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    // Espera formato YYYY-MM-DD ou data ISO completa
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

function removerAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// -----------------------------------------------------------------------------
// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
// -----------------------------------------------------------------------------

// Remove valores 'undefined' que o Firestore não aceita
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// FUNÇÃO CRÍTICA: Baixa TODOS os dados da nuvem ao iniciar
// Isso garante que celulares e outros computadores vejam os mesmos dados
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Usuário offline ou sem empresa definida. Usando cache local.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função auxiliar para baixar uma coleção específica
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                
                // Define se é objeto único (empresa) ou lista (outros)
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(lista);
                }
                
                // Atualiza o localStorage como backup offline
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]); // Coleção não existe na nuvem ainda
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave} do Firebase:`, e);
        }
    }

    // Executa todos os downloads em paralelo para não travar o carregamento
    await Promise.all([
        baixarColecao(CHAVE_DB_FUNCIONARIOS, (d) => CACHE_FUNCIONARIOS = d),
        baixarColecao(CHAVE_DB_VEICULOS, (d) => CACHE_VEICULOS = d),
        baixarColecao(CHAVE_DB_CONTRATANTES, (d) => CACHE_CONTRATANTES = d),
        baixarColecao(CHAVE_DB_OPERACOES, (d) => CACHE_OPERACOES = d),
        baixarColecao(CHAVE_DB_MINHA_EMPRESA, (d) => CACHE_MINHA_EMPRESA = d),
        baixarColecao(CHAVE_DB_DESPESAS, (d) => CACHE_DESPESAS = d),
        baixarColecao(CHAVE_DB_ATIVIDADES, (d) => CACHE_ATIVIDADES = d),
        baixarColecao(CHAVE_DB_PROFILE_REQUESTS, (d) => CACHE_PROFILE_REQUESTS = d),
        baixarColecao(CHAVE_DB_RECIBOS, (d) => CACHE_RECIBOS = d)
    ]);

    console.log(">>> SINCRONIA CONCLUÍDA. Memória atualizada.");
}

// Carrega do LocalStorage (Apenas fallback ou primeira pintura rápida)
function carregarTodosDadosLocais() {
    function load(chave) {
        try {
            var dados = localStorage.getItem(chave);
            return dados ? JSON.parse(dados) : [];
        } catch (erro) {
            return [];
        }
    }
    
    CACHE_FUNCIONARIOS = load(CHAVE_DB_FUNCIONARIOS);
    CACHE_VEICULOS = load(CHAVE_DB_VEICULOS);
    CACHE_CONTRATANTES = load(CHAVE_DB_CONTRATANTES);
    CACHE_OPERACOES = load(CHAVE_DB_OPERACOES);
    CACHE_MINHA_EMPRESA = JSON.parse(localStorage.getItem(CHAVE_DB_MINHA_EMPRESA)) || {};
    CACHE_DESPESAS = load(CHAVE_DB_DESPESAS);
    CACHE_ATIVIDADES = load(CHAVE_DB_ATIVIDADES);
    CACHE_PROFILE_REQUESTS = load(CHAVE_DB_PROFILE_REQUESTS);
    CACHE_RECIBOS = load(CHAVE_DB_RECIBOS);
}

// Função Genérica de Salvamento (Atualiza Memória -> LocalStorage -> Firebase)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e Local
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Atualiza Nuvem (Se logado e ativo)
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

// Funções Específicas de Salvamento (Para facilitar a chamada)
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas Helpers (Para evitar repetição de código)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO (LÓGICA FINANCEIRA CORRIGIDA)
// =============================================================================

// Função para Ocultar/Mostrar valores (Privacidade)
window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    if (targets.length === 0) return;

    // Verifica estado atual baseado no primeiro elemento
    const isBlurred = targets[0].classList.contains('privacy-blur');

    targets.forEach(el => {
        if (isBlurred) {
            el.classList.remove('privacy-blur');
        } else {
            el.classList.add('privacy-blur');
        }
    });

    // Alterna ícone
    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

// --- HELPER: CÁLCULO DE MÉDIA GLOBAL DO VEÍCULO ---
window.calcularMediaGlobalVeiculo = function(placa) {
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
        
        // Só considera se houve abastecimento real e rodagem
        if (km > 0 && valorAbastecido > 0 && preco > 0) {
            totalKm += km;
            totalLitros += (valorAbastecido / preco);
        }
    });

    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

// HELPER: PREÇO MÉDIO COMBUSTÍVEL
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-5); // Pega os últimos 5 registros
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

// --- LÓGICA CENTRAL DO DASHBOARD (COM PARCELAS E MÉDIA DE CONSUMO) ---
window.atualizarDashboard = function() {
    // PROTEÇÃO SUPER ADMIN: Não executa cálculos de dashboard comum se for Master
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    console.log("Calculando métricas do Dashboard (Lógica de Consumo Médio)...");
    
    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // 1. Processar Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // --- CÁLCULO INTELIGENTE DE COMBUSTÍVEL ---
        // Em vez de debitar todo o abastecimento no dia, calcula o custo baseado no KM rodado x Média do Veículo
        var custoCombustivelCalculado = 0;
        
        if (op.kmRodado > 0 && op.veiculoPlaca) {
            var mediaVeiculo = calcularMediaGlobalVeiculo(op.veiculoPlaca);
            var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca) || 6.00;
            
            if (mediaVeiculo > 0) {
                var litrosEstimados = op.kmRodado / mediaVeiculo;
                custoCombustivelCalculado = litrosEstimados * precoLitro;
            } else {
                // Se não tem histórico, usa o valor declarado
                custoCombustivelCalculado = Number(op.combustivel) || 0;
            }
        } else {
            // Se não rodou, não consome (exceto se for lançado manualmente)
            custoCombustivelCalculado = 0; 
        }

        // Custos da Operação (Combustível Calculado + Despesas Viagem)
        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        // Comissão Motorista (se não faltou)
        if (!teveFalta) custoOp += (Number(op.comissao) || 0);

        // Ajudantes (se não faltaram)
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) custoOp += (Number(aj.diaria) || 0);
            });
        }

        // Receita Total (Histórico)
        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') receitaHistorico += valorFat;

        // Somar ao Mês Atual se coincidir
        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // 2. Processar Despesas Gerais (COM LÓGICA DE PARCELAMENTO)
    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        
        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtdParcelas = Number(desp.parcelasTotal);
            var valorParcela = valorTotal / qtdParcelas;
            var intervalo = Number(desp.intervaloDias) || 30;

            // Verifica se alguma parcela cai no mês atual
            for (var i = 0; i < qtdParcelas; i++) {
                var dataParcela = new Date(dataDesp);
                dataParcela.setDate(dataParcela.getDate() + (i * intervalo));
                
                if (dataParcela.getMonth() === mesAtual && dataParcela.getFullYear() === anoAtual) {
                    custosMes += valorParcela;
                }
            }
        } else {
            // À Vista
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += valorTotal;
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
    if (elLucro) elLucro.textContent = formatarValorMoeda(lucroMes);
    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// --- FUNÇÃO DE GRÁFICO ---
function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

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

    // 1. Processar Operações
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            if (filtroMotorista && op.checkins && op.checkins.faltaMotorista) {
                stats.faltas++;
            }

            var receitaOp = Number(op.faturamento) || 0;
            
            // Custo Combustível (Logica de Média)
            var combustivelOp = 0;
            if (op.kmRodado > 0 && op.veiculoPlaca) {
                var media = calcularMediaGlobalVeiculo(op.veiculoPlaca);
                var preco = Number(op.precoLitro) || 6.00;
                if(media > 0) combustivelOp = (op.kmRodado / media) * preco;
                else combustivelOp = Number(op.combustivel)||0;
            }

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

            // Litros reais para estatística
            var precoReal = Number(op.precoLitro) || 0;
            if (precoReal > 0 && Number(op.combustivel) > 0) stats.litrosTotal += (Number(op.combustivel) / precoReal);
        }
    });

    // 2. Processar Despesas Gerais
    CACHE_DESPESAS.forEach(desp => {
        if (filtroVeiculo && desp.veiculoPlaca && desp.veiculoPlaca !== filtroVeiculo) return;
        
        var valorComputado = 0;
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');

        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtd = Number(desp.parcelasTotal);
            var valParc = valorTotal / qtd;
            var intervalo = Number(desp.intervaloDias) || 30;
            for (var i = 0; i < qtd; i++) {
                var dt = new Date(dataDesp);
                dt.setDate(dt.getDate() + (i * intervalo));
                if (dt.getMonth() === mes && dt.getFullYear() === ano) {
                    valorComputado += valParc;
                }
            }
        } else {
            if (dataDesp.getMonth() === mes && dataDesp.getFullYear() === ano) {
                valorComputado = valorTotal;
            }
        }

        if (valorComputado > 0) {
            stats.custos += valorComputado;

            // Categorização
            var desc = removerAcentos(desp.descricao || "");
            
            if (desc.includes("manutencao") || desc.includes("oleo") || desc.includes("pneu") || desc.includes("peca")) {
                gManutencao += valorComputado;
            } 
            else if (desc.includes("comida") || desc.includes("hotel") || desc.includes("outros") || desc.includes("alimentacao")) {
                gPessoal += valorComputado;
            } 
            else {
                gManutencao += valorComputado; 
            }
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    // Resumo
    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
        if (filtroVeiculo || filtroMotorista) {
            var tituloBox = filtroVeiculo ? "VEÍCULO" : "MOTORISTA";
            var valorTitulo = filtroVeiculo || (CACHE_FUNCIONARIOS.find(f => f.id == filtroMotorista)?.nome || "Desconhecido");
            
            var boxExtraLabel = filtroMotorista ? "FALTAS / OCORRÊNCIAS" : "MÉDIA (REAL)";
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
                    <div class="veh-stat-box"><small>LUCRO EST.</small><span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span></div>
                </div>
            `;
        }
    }

    if (window.chartInstance) window.chartInstance.destroy();
    var lucroFinal = gReceita - (gCombustivel + gPessoal + gManutencao);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL (EST.)', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
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

// -----------------------------------------------------------------------------
// LÓGICA DO CALENDÁRIO (CORRIGIDO)
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate || new Date();
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
        var opsDoDia = (CACHE_OPERACOES || []).filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            var temEmAndamento = opsDoDia.some(o => o.status === 'EM_ANDAMENTO');
            var temPendente = opsDoDia.some(o => o.status === 'AGENDADA');
            var dotColor = temEmAndamento ? 'orange' : (temPendente ? '#999' : 'green');

            cellContent += `<div class="event-dot" style="background:${dotColor}"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // Correção de escopo para o clique
            (function(ds) {
                cell.onclick = function() { abrirModalDetalhesDia(ds); };
            })(dateStr);
        } else {
            (function(ds) {
                cell.onclick = function() { 
                    document.getElementById('operacaoData').value = ds;
                    var btnOperacoes = document.querySelector('[data-page="operacoes"]');
                    if(btnOperacoes) {
                        btnOperacoes.click();
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

window.abrirModalDetalhesDia = function(dataString) {
    var operacoesDoDia = CACHE_OPERACOES.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');

    if (!modalBody) return;

    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'DETALHES COMPLETOS: ' + dataFormatada;
    
    var htmlLista = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%; font-size:0.75rem;"><thead><tr style="background:#263238; color:white;"><th>CLIENTE</th><th>VEÍCULO</th><th>EQUIPE</th><th>FINANCEIRO</th></tr></thead><tbody>';
    
    operacoesDoDia.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId)?.nome || '---';
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        htmlLista += `<tr><td>${cli}</td><td>${op.veiculoPlaca}</td><td>${mot}</td><td>Fat: ${formatarValorMoeda(op.faturamento)}</td></tr>`;
    });
    htmlLista += '</tbody></table></div>';
    
    modalBody.innerHTML = htmlLista || '<p style="text-align:center; padding:20px;">Sem operações.</p>';
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE (COM TRATAMENTO DE ERRO DE EMAIL)
// =============================================================================

// *** CORREÇÃO DAS ABAS DE CADASTRO ***
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetForm = document.getElementById(targetId);
        
        if (targetForm) {
            targetForm.classList.add('active');
            if(targetId === 'funcionarios') renderizarTabelaFuncionarios();
            if(targetId === 'veiculos') renderizarTabelaVeiculos();
            if(targetId === 'contratantes') renderizarTabelaContratantes();
            if(targetId === 'atividades') renderizarTabelaAtividades();
            if(targetId === 'minhaEmpresa') renderizarInformacoesEmpresa();
        }
    });
});

// FORMULÁRIO DE FUNCIONÁRIOS (CORRIGIDO PARA EMAIL EXISTENTE)
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
            
            // Verifica se é criação de login (Novo ID + Senha preenchida)
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                try {
                    console.log("Tentando criar usuário no Auth...");
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Salva metadados do login
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                        uid: novoUID, 
                        name: nome, 
                        email: email, 
                        role: funcao,
                        company: window.USUARIO_ATUAL.company, 
                        createdAt: new Date().toISOString(), 
                        approved: true, 
                        senhaVisual: senha
                    });

                } catch (authError) {
                    // TRATAMENTO ESPECÍFICO PARA EMAIL JÁ EM USO
                    if (authError.code === 'auth/email-already-in-use') {
                        if (!confirm(`O e-mail ${email} JÁ POSSUI UM LOGIN no sistema.\n\nDeseja cadastrar os dados do funcionário mesmo assim? (O login antigo será mantido)`)) {
                            throw new Error("Operação cancelada pelo usuário.");
                        }
                        // Prossegue usando o ID gerado por data (novoUID = id), sem criar novo Auth
                        console.warn("Seguindo com cadastro de dados sem recriar Auth.");
                    } else {
                        throw authError; // Lança outros erros normalmente
                    }
                }
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
            
            if (senha) { funcionarioObj.senhaVisual = senha; }

            // Atualiza Cache Local
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            // Salva na Nuvem
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo com Sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            preencherTodosSelects();

        } catch (erro) { 
            console.error(erro); 
            // Ignora erro de cancelamento
            if (erro.message !== "Operação cancelada pelo usuário.") {
                alert("Erro: " + erro.message); 
            }
        } finally { 
            btnSubmit.disabled = false; 
            btnSubmit.innerHTML = textoOriginal; 
        }
    }
});

// FORMULÁRIO DE VEÍCULOS
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

// FORMULÁRIO DE CLIENTES
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

// FORMULÁRIO DE SERVIÇOS
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

// FORMULÁRIO MINHA EMPRESA
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

// FORMULÁRIO DESPESAS GERAIS
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault(); 
        var id = document.getElementById('despesaGeralId').value || Date.now().toString();
        var novaDespesa = {
            id: id, 
            data: document.getElementById('despesaGeralData').value,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
            valor: Number(document.getElementById('despesaGeralValor').value),
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelasTotal: document.getElementById('despesaParcelas').value,
            parcelasPagas: document.getElementById('despesaParcelasPagas').value,
            intervaloDias: document.getElementById('despesaIntervaloDias').value
        };
        var lista = CACHE_DESPESAS.filter(d => String(d.id) !== String(id));
        lista.push(novaDespesa);
        salvarListaDespesas(lista).then(() => {
            alert("Despesa Lançada!"); 
            e.target.reset(); 
            document.getElementById('despesaGeralId').value = '';
            toggleDespesaParcelas(); 
            renderizarTabelaDespesasGerais(); 
            atualizarDashboard(); 
        });
    }
});

// FORMULÁRIO OPERAÇÃO
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
            var msg = isAgendamento ? "Operação Agendada com Sucesso!" : "Operação Salva com Sucesso!";
            alert(msg);
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

// UI HELPERS
window.toggleDriverFields = function() { 
    var select = document.getElementById('funcFuncao'); 
    var div = document.getElementById('driverSpecificFields'); 
    if (select && div) {
        div.style.display = (select.value === 'motorista') ? 'block' : 'none';
    }
};

window.toggleDespesaParcelas = function() { 
    var modo = document.getElementById('despesaModoPagamento').value; 
    var div = document.getElementById('divDespesaParcelas'); 
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
    }
};

window.renderizarListaAjudantesAdicionados = function() { 
    var ul = document.getElementById('listaAjudantesAdicionados'); 
    if (!ul) return; 
    ul.innerHTML = ''; 
    (window._operacaoAjudantesTempList || []).forEach(item => { 
        var f = buscarFuncionarioPorId(item.id); 
        var nome = f ? f.nome : 'Desconhecido'; 
        var li = document.createElement('li');
        li.innerHTML = `<span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span><button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>`; 
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
    if (!idAj) return alert("Selecione um ajudante."); 
    if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Já adicionado.");
    var valor = prompt("Valor da Diária:"); 
    if (valor) { 
        window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); 
        renderizarListaAjudantesAdicionados(); 
        sel.value = ""; 
    } 
});

window.limparOutroFiltro = function(tipo) { 
    if (tipo === 'motorista') { 
        document.getElementById('filtroMotoristaGrafico').value = ""; 
    } else { 
        document.getElementById('filtroVeiculoGrafico').value = ""; 
    } 
};

// ATUALIZAÇÃO VISUAL
function preencherTodosSelects() {
    console.log("Atualizando tabelas e selects...");
    const fill = (id, dados, valKey, textKey, defText) => { 
        var el = document.getElementById(id); 
        if (!el) return; 
        var atual = el.value; 
        el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); 
        if(atual) el.value = atual; 
    };
    
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('filtroMotoristaGrafico', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    fill('selectVeiculoRecibo', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'SEM VÍNCULO (GERAL)');

    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    if(typeof renderizarTabelaDespesasGerais === 'function') renderizarTabelaDespesasGerais();
    if(typeof renderizarTabelaMonitoramento === 'function') { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
    if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
}

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = '';
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var textoPgto = d.modoPagamento === 'parcelado' ? `PARCELADO (${d.parcelasTotal}x)` : 'À VISTA';
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td style="color:var(--danger-color); font-weight:bold;">${formatarValorMoeda(d.valor)}</td><td>${textoPgto}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = function(id) { 
    if(!confirm("Excluir esta despesa?")) return; 
    var lista = CACHE_DESPESAS.filter(d => String(d.id) !== String(id)); 
    salvarListaDespesas(lista).then(() => { renderizarTabelaDespesasGerais(); atualizarDashboard(); }); 
};

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button></td>`; 
        tbody.appendChild(tr);
    }); 
}

window.excluirFuncionario = async function(id) { 
    if(!confirm("Excluir funcionário e revogar acesso?")) return; 
    if (window.dbRef) { try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); } catch(e) {} }
    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    alert("Funcionário removido."); preencherTodosSelects(); 
};

window.excluirVeiculo = function(placa) { 
    if(!confirm("Excluir?")) return; 
    salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); 
};

window.excluirContratante = function(cnpj) { 
    if(!confirm("Excluir?")) return; 
    salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); 
};

window.excluirAtividade = function(id) { 
    if(!confirm("Excluir?")) return; 
    salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); 
};

window.excluirOperacao = function(id) { 
    if(!confirm("Excluir operação?")) return; 
    salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); }); 
};

window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (!f) return; document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email || ''; document.getElementById('funcTelefone').value = f.telefone; document.getElementById('funcPix').value = f.pix || ''; document.getElementById('funcEndereco').value = f.endereco || ''; toggleDriverFields(); if (f.funcao === 'motorista') { document.getElementById('funcCNH').value = f.cnh || ''; document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); };
window.preencherFormularioVeiculo = function(placa) { var v = buscarVeiculoPorPlaca(placa); if (!v) return; document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.getElementById('veiculoAno').value = v.ano; document.getElementById('veiculoRenavam').value = v.renavam || ''; document.getElementById('veiculoChassi').value = v.chassi || ''; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); };
window.preencherFormularioContratante = function(cnpj) { var c = buscarContratantePorCnpj(cnpj); if (!c) return; document.getElementById('contratanteCNPJ').value = c.cnpj; document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; document.getElementById('contratanteTelefone').value = c.telefone; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); };
window.preencherFormularioOperacao = function(id) { var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return; document.getElementById('operacaoId').value = op.id; document.getElementById('operacaoData').value = op.data; document.getElementById('selectMotoristaOperacao').value = op.motoristaId; document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca; document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ; document.getElementById('selectAtividadeOperacao').value = op.atividadeId; document.getElementById('operacaoFaturamento').value = op.faturamento; document.getElementById('operacaoAdiantamento').value = op.adiantamento || ''; document.getElementById('operacaoComissao').value = op.comissao || ''; document.getElementById('operacaoDespesas').value = op.despesas || ''; document.getElementById('operacaoCombustivel').value = op.combustivel || ''; document.getElementById('operacaoPrecoLitro').value = op.precoLitro || ''; document.getElementById('operacaoKmRodado').value = op.kmRodado || ''; window._operacaoAjudantesTempList = op.ajudantes || []; renderizarListaAjudantesAdicionados(); document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'); document.querySelector('[data-page="operacoes"]').click(); };

function renderizarTabelaVeiculos() { var tbody = document.querySelector('#tabelaVeiculos tbody'); if(tbody) { tbody.innerHTML=''; CACHE_VEICULOS.forEach(v => { var tr=document.createElement('tr'); tr.innerHTML=`<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td>`; tbody.appendChild(tr); }); } }
function renderizarTabelaContratantes() { var tbody = document.querySelector('#tabelaContratantes tbody'); if(tbody) { tbody.innerHTML=''; CACHE_CONTRATANTES.forEach(c => { var tr=document.createElement('tr'); tr.innerHTML=`<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td>`; tbody.appendChild(tr); }); } }
function renderizarTabelaAtividades() { var tbody = document.querySelector('#tabelaAtividades tbody'); if(tbody) { tbody.innerHTML=''; CACHE_ATIVIDADES.forEach(a => { var tr=document.createElement('tr'); tr.innerHTML=`<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td>`; tbody.appendChild(tr); }); } }
function renderizarTabelaOperacoes() { var tbody = document.querySelector('#tabelaOperacoes tbody'); if(tbody) { tbody.innerHTML=''; var lista = CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)); lista.forEach(op => { if(op.status==='CANCELADA') return; var m = buscarFuncionarioPorId(op.motoristaId)?.nome || 'Excluído'; var tr=document.createElement('tr'); tr.innerHTML=`<td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')">DEL</button></td>`; tbody.appendChild(tr); }); } }
function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };
// =============================================================================
// PARTE 4: MONITORAMENTO, RELATÓRIOS, RECIBOS E LÓGICA DO FUNCIONÁRIO
// =============================================================================

// -----------------------------------------------------------------------------
// MONITORAMENTO DE ROTAS E CHECK-INS
// -----------------------------------------------------------------------------

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa no momento.</td></tr>';
        document.getElementById('badgeCheckins').style.display = 'none';
        return;
    }

    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = 'inline-block';
    }

    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var statusHtml = op.status === 'EM_ANDAMENTO' 
            ? '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>' 
            : '<span class="status-pill pill-pending">AGENDADA</span>';

        // 1. Motorista
        var mot = buscarFuncionarioPorId(op.motoristaId);
        if (mot) {
            var faltouMot = (op.checkins && op.checkins.faltaMotorista);
            var checkInFeito = (op.checkins && op.checkins.motorista); 
            
            var statusEquipe = checkInFeito ? '<span style="color:green"><i class="fas fa-check"></i> INICIADO</span>' : '<span style="color:#999">AGUARDANDO</span>';
            if (faltouMot) statusEquipe = '<span style="color:red; font-weight:bold;">FALTA</span>';

            var btnFaltaMot = faltouMot 
                ? '-' 
                : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${mot.id}', 'motorista')">MARCAR FALTA</button>`;

            var nomeDisplay = faltouMot ? `<s style="color:#999;">${mot.nome}</s>` : `<strong>${mot.nome}</strong> (Mot)`;

            var trM = document.createElement('tr');
            trM.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td>${nomeDisplay}<br><small>${op.veiculoPlaca}</small></td><td>${cliente}</td><td>${statusHtml}</td><td>${statusEquipe}</td><td>${btnFaltaMot}</td>`;
            tbody.appendChild(trM);
        }

        // 2. Ajudantes
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(ajItem => {
                var aj = buscarFuncionarioPorId(ajItem.id);
                if (aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = faltouAj
                        ? '-'
                        : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${aj.id}', 'ajudante')">MARCAR FALTA</button>`;
                    
                    var nomeAjDisplay = faltouAj ? `<s style="color:#999;">${aj.nome}</s>` : `${aj.nome} (Ajud)`;

                    var trA = document.createElement('tr');
                    trA.style.background = "#f9f9f9"; 
                    trA.innerHTML = `<td style="border:none;"></td><td>${nomeAjDisplay}</td><td style="color:#777;"><small>^ Vinculado</small></td><td>${statusHtml}</td><td>-</td><td>${btnFaltaAj}</td>`;
                    tbody.appendChild(trA);
                }
            });
        }
    });
};

window.registrarFalta = async function(opId, funcId, tipo) {
    if (!confirm("Confirmar FALTA? O valor financeiro será removido desta operação.")) return;
    
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    if (!op.checkins) op.checkins = { motorista: false, faltaMotorista: false, faltas: {} };
    if (!op.checkins.faltas) op.checkins.faltas = {};

    if (tipo === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; 
    } else {
        op.checkins.faltas[funcId] = true;
    }
    
    await salvarListaOperacoes(CACHE_OPERACOES);
    renderizarTabelaMonitoramento();
    renderizarTabelaFaltas();
    atualizarDashboard(); 
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) {
                var tr = document.createElement('tr');
                tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td>`;
                tbody.appendChild(tr);
            }
        }
        if (op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(k => {
                if(op.checkins.faltas[k]) {
                    var a = buscarFuncionarioPorId(k);
                    if(a) {
                        var tr = document.createElement('tr');
                        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${a.nome}</td><td>AJUDANTE</td><td>FALTA</td><td>-</td>`;
                        tbody.appendChild(tr);
                    }
                }
            });
        }
    });
};

window.renderizarPainelEquipe = async function() {
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        if (CACHE_FUNCIONARIOS.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        } else {
            CACHE_FUNCIONARIOS.forEach(f => {
                var tr = document.createElement('tr');
                tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao.toUpperCase()}</td><td><span class="status-pill pill-active">ATIVO</span></td><td>-</td>`;
                tbodyAtivos.appendChild(tr);
            });
        }
    }

    if (window.dbRef && window.USUARIO_ATUAL) {
        try {
            const { db, collection, query, where, getDocs } = window.dbRef;
            const q = query(collection(db, "users"), where("company", "==", window.USUARIO_ATUAL.company), where("approved", "==", false));
            const snap = await getDocs(q);
            var tbodyPend = document.querySelector('#tabelaCompanyPendentes tbody');
            if (tbodyPend) {
                tbodyPend.innerHTML = '';
                if (snap.empty) tbodyPend.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum pendente.</td></tr>';
                snap.forEach(doc => {
                    var u = doc.data();
                    var tr = document.createElement('tr');
                    tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td><button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR</button></td>`;
                    tbodyPend.appendChild(tr);
                });
            }
        } catch(e) { console.error(e); }
    }
    
    var tbodyReq = document.getElementById('tabelaProfileRequests')?.querySelector('tbody');
    if(tbodyReq) {
        tbodyReq.innerHTML = '';
        CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE').forEach(req => {
            var f = buscarFuncionarioPorId(req.funcionarioId);
            var tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatarDataParaBrasileiro(req.data)}</td><td>${f?f.nome:'-'}</td><td>${req.campo}</td><td>${req.valorNovo}</td><td><button class="btn-mini btn-success" onclick="aprovarProfileRequest('${req.id}')">OK</button></td>`;
            tbodyReq.appendChild(tr);
        });
    }
};

window.aprovarUsuario = async function(uid) {
    if(!confirm("Aprovar acesso?")) return;
    try { 
        await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true }); 
        renderizarPainelEquipe(); 
    } catch(e){ alert(e.message); }
};

window.aprovarProfileRequest = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if (!req) return;
    
    var func = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(req.funcionarioId));
    if (func) {
        if (req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if (req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if (req.campo === 'PIX') func.pix = req.valorNovo;
        
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    req.status = 'APROVADO';
    await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
    renderizarPainelEquipe();
};

// -----------------------------------------------------------------------------
// GERAÇÃO DE RELATÓRIOS
// -----------------------------------------------------------------------------

function filtrarOperacoesParaRelatorio() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    if (!inicio || !fim) { alert("Selecione o período."); return null; }
    var mId = document.getElementById('selectMotoristaRelatorio').value;
    var vPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var cCnpj = document.getElementById('selectContratanteRelatorio').value;
    var aId = document.getElementById('selectAtividadeRelatorio').value;

    return CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < inicio || op.data > fim) return false;
        if (mId && op.motoristaId !== mId) return false;
        if (vPlaca && op.veiculoPlaca !== vPlaca) return false;
        if (cCnpj && op.contratanteCNPJ !== cCnpj) return false;
        if (aId && op.atividadeId !== aId) return false;
        return true;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));
}

window.gerarRelatorioGeral = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var veiculoSelecionado = document.getElementById('selectVeiculoRelatorio').value;
    var htmlCabecalho = '';

    if (veiculoSelecionado) {
        var vStats = { fat:0, custo:0, km:0, litros:0, lucro:0 };
        ops.forEach(op => {
            var rec = Number(op.faturamento)||0;
            var cust = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
            if (!op.checkins || !op.checkins.faltaMotorista) cust += (Number(op.comissao)||0);
            if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) cust += (Number(aj.diaria)||0); });
            vStats.fat += rec; vStats.custo += cust; vStats.lucro += (rec - cust); vStats.km += (Number(op.kmRodado)||0);
            var preco = Number(op.precoLitro)||0; var comb = Number(op.combustivel)||0;
            if(preco > 0 && comb > 0) vStats.litros += (comb/preco);
        });
        
        var mediaKmL = vStats.litros > 0 ? (vStats.km / vStats.litros) : 0;
        htmlCabecalho = `<div style="background:#e3f2fd; padding:15px; margin-bottom:20px; border-radius:8px;"><h3>VEÍCULO: ${veiculoSelecionado}</h3><p>Faturamento: ${formatarValorMoeda(vStats.fat)} | Lucro: ${formatarValorMoeda(vStats.lucro)} | Média: ${mediaKmL.toFixed(2)} Km/L</p></div>`;
    }

    var html = `<div style="text-align:center; margin-bottom:20px;"><h3>RELATÓRIO FINANCEIRO GERAL</h3></div>${htmlCabecalho}<table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>CLIENTE</th><th>FATURAMENTO</th><th>LUCRO</th></tr></thead><tbody>`;

    var totalFat = 0; var totalLucro = 0;
    ops.forEach(op => {
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var receita = Number(op.faturamento)||0;
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
        if (!op.checkins || !op.checkins.faltaMotorista) custo += (Number(op.comissao)||0);
        if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) custo += (Number(aj.diaria)||0); });
        var lucro = receita - custo; totalFat += receita; totalLucro += lucro;
        html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${cli ? cli.razaoSocial.substring(0,15) : '-'}</td><td>${formatarValorMoeda(receita)}</td><td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td></tr>`;
    });
    html += `<tr style="background:#f5f5f5; font-weight:bold;"><td colspan="3" style="text-align:right;">TOTAIS:</td><td>${formatarValorMoeda(totalFat)}</td><td style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</td></tr></tbody></table>`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarRelatorioCobranca = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var porCliente = {};
    ops.forEach(op => {
        var cNome = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'DESCONHECIDO';
        if (!porCliente[cNome]) porCliente[cNome] = { ops: [], totalFat: 0, totalAdiant: 0 };
        porCliente[cNome].ops.push(op);
        porCliente[cNome].totalFat += (Number(op.faturamento)||0);
        porCliente[cNome].totalAdiant += (Number(op.adiantamento)||0);
    });

    var html = `<div style="text-align:center; margin-bottom:30px;"><h2>RELATÓRIO DE COBRANÇA (LÍQUIDO)</h2></div>`;
    for (var cliente in porCliente) {
        var liquido = porCliente[cliente].totalFat - porCliente[cliente].totalAdiant;
        html += `<div style="margin-bottom:30px; border:1px solid #ccc; padding:15px;"><h3 style="background:#eee; padding:10px;">${cliente}</h3><table class="data-table" style="width:100%;"><thead><tr><th>DATA</th><th>PLACA</th><th>VALOR SERVIÇO</th><th>ADIANTAMENTO</th></tr></thead><tbody>`;
        porCliente[cliente].ops.forEach(op => {
            html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${formatarValorMoeda(op.faturamento)}</td><td style="color:red;">${op.adiantamento > 0 ? '- '+formatarValorMoeda(op.adiantamento) : '-'}</td></tr>`;
        });
        html += `</tbody><tfoot><tr style="background:#333; color:white;"><td colspan="3" style="text-align:right; font-weight:bold;">LÍQUIDO A RECEBER:</td><td style="font-weight:bold; font-size:1.1rem; color:#4caf50;">${formatarValorMoeda(liquido)}</td></tr></tfoot></table></div>`;
    }
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') { alert("Gere um relatório primeiro."); return; }
    html2pdf().set({ margin: 10, filename: 'Relatorio_LogiMaster.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).save();
};

// -----------------------------------------------------------------------------
// RECIBOS DE PAGAMENTO (ADMIN)
// -----------------------------------------------------------------------------

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!motId || !dataIni || !dataFim) return alert("Preencha todos os campos.");
    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário inválido.");

    var totalValor = 0; var opsEnvolvidas = [];
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA' || op.data < dataIni || op.data > dataFim) return;
        var valorGanho = 0;
        if (op.motoristaId === motId && (!op.checkins || !op.checkins.faltaMotorista)) valorGanho = Number(op.comissao) || 0;
        else if (op.ajudantes) {
            var aj = op.ajudantes.find(a => a.id === motId);
            if (aj && !(op.checkins?.faltas?.[motId])) valorGanho = Number(aj.diaria) || 0;
        }
        if (valorGanho > 0) {
            totalValor += valorGanho;
            opsEnvolvidas.push({ data: op.data, cliente: buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Avulso', valor: valorGanho });
        }
    });

    var htmlRecibo = `<div style="border:2px solid #333; padding:20px; font-family:'Courier New'; background:#fff;"><h3 style="text-align:center;">RECIBO</h3><p><strong>BENEFICIÁRIO:</strong> ${funcionario.nome}</p><p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dataIni)} A ${formatarDataParaBrasileiro(dataFim)}</p><table style="width:100%;"><tr><th align="left">DATA</th><th align="right">VALOR</th></tr>${opsEnvolvidas.map(o=>`<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td align="right">${formatarValorMoeda(o.valor)}</td></tr>`).join('')}</table><h3 style="text-align:right; border-top:2px solid #000;">TOTAL: ${formatarValorMoeda(totalValor)}</h3></div>`;
    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    document.getElementById('modalReciboActions').innerHTML = `<button class="btn-success" onclick="salvarReciboNoHistorico('${funcionario.id}', '${funcionario.nome}', '${dataIni}', '${dataFim}', ${totalValor})"><i class="fas fa-save"></i> SALVAR E GERAR</button>`;
    document.getElementById('modalRecibo').style.display = 'flex';
};

window.salvarReciboNoHistorico = async function(funcId, funcNome, ini, fim, valor) {
    var novoRecibo = { 
        id: Date.now().toString(), 
        dataEmissao: new Date().toISOString(), 
        funcionarioId: funcId, 
        funcionarioNome: funcNome, 
        periodo: `${formatarDataParaBrasileiro(ini)} a ${formatarDataParaBrasileiro(fim)}`, 
        valorTotal: valor, 
        enviado: false 
    };
    
    var lista = CACHE_RECIBOS || [];
    lista.push(novoRecibo);
    
    await salvarListaRecibos(lista);
    alert("Recibo salvo! Disponível no histórico para envio.");
    document.getElementById('modalRecibo').style.display = 'none';
    renderizarHistoricoRecibos();
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (CACHE_RECIBOS || []).sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        var statusLabel = r.enviado ? '<span class="status-pill pill-active">ENVIADO</span>' : '<span class="status-pill pill-pending">NÃO ENVIADO</span>';
        var btnEnviar = r.enviado ? '' : `<button class="btn-mini btn-primary" onclick="enviarReciboFuncionario('${r.id}')" title="Enviar para Funcionario"><i class="fas fa-paper-plane"></i></button>`;
        tbody.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${statusLabel}</td><td>${btnEnviar}</td></tr>`;
    });
};

window.enviarReciboFuncionario = async function(reciboId) {
    if(!confirm("Enviar este recibo para o painel do funcionário?")) return;
    var rec = CACHE_RECIBOS.find(r => r.id === reciboId);
    if(rec) {
        rec.enviado = true;
        await salvarListaRecibos(CACHE_RECIBOS); // Sincroniza
        renderizarHistoricoRecibos();
        alert("Enviado com sucesso!");
    }
};

// -----------------------------------------------------------------------------
// LÓGICA DO FUNCIONÁRIO (CHECK-IN E BUSCA DE SERVIÇOS)
// -----------------------------------------------------------------------------

// CHECK-IN REAL
window.renderizarCheckinFuncionario = function() {
    var container = document.getElementById('checkin-container'); 
    if (!container) return;
    var uid = window.USUARIO_ATUAL.uid;
    
    // Busca na memória JÁ SINCRONIZADA
    var opsPendentes = CACHE_OPERACOES.filter(op => {
        return (op.motoristaId === uid && op.status !== 'CANCELADA' && (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'));
    });

    if (opsPendentes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Nenhuma viagem pendente no momento.</p>';
        return;
    }

    var html = '';
    opsPendentes.forEach(op => {
        var btnAcao = '';
        if (op.status === 'AGENDADA') {
            btnAcao = `<button class="btn-success" style="width:100%; margin-top:10px;" onclick="confirmarInicioViagem('${op.id}')">INICIAR VIAGEM</button>`;
        } else if (op.status === 'EM_ANDAMENTO') {
            btnAcao = `<button class="btn-warning" style="width:100%; margin-top:10px;" onclick="finalizarViagem('${op.id}')">FINALIZAR VIAGEM</button>`;
        }
        html += `<div style="background:white; border:1px solid #ddd; padding:15px; border-radius:8px; margin-bottom:15px; border-left:5px solid var(--primary-color);"><h4>${op.veiculoPlaca} - ${formatarDataParaBrasileiro(op.data)}</h4><p><strong>Rota:</strong> ${buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE'}</p>${btnAcao}</div>`;
    });
    container.innerHTML = html;
};

window.confirmarInicioViagem = async function(id) {
    if(!confirm("Iniciar viagem?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) {
        op.status = 'EM_ANDAMENTO';
        if(!op.checkins) op.checkins = {};
        op.checkins.motorista = true;
        await salvarListaOperacoes(CACHE_OPERACOES); // Sincroniza
        renderizarCheckinFuncionario();
    }
};

window.finalizarViagem = async function(id) {
    var kmFinal = prompt("Digite o KM Final:");
    if(!kmFinal) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) {
        op.status = 'FINALIZADA';
        op.kmFinal = kmFinal;
        op.kmRodado = (Number(kmFinal) - Number(op.kmInicial || 0));
        await salvarListaOperacoes(CACHE_OPERACOES); // Sincroniza
        renderizarCheckinFuncionario();
        alert("Viagem finalizada!");
    }
};

// BUSCA DE SERVIÇOS (FILTRO POR DATA)
window.filtrarServicosFuncionario = function(uid) {
    // Tenta pegar datas dos inputs
    var dataInicio = document.getElementById('dataInicioServicosFunc')?.value;
    var dataFim = document.getElementById('dataFimServicosFunc')?.value;

    var minhasOps = CACHE_OPERACOES.filter(op => {
        var ehMotorista = (op.motoristaId === uid);
        var ehAjudante = (op.ajudantes && op.ajudantes.some(aj => aj.id === uid));
        
        var dataOk = true;
        if (dataInicio && op.data < dataInicio) dataOk = false;
        if (dataFim && op.data > dataFim) dataOk = false;

        return (ehMotorista || ehAjudante) && op.status !== 'CANCELADA' && dataOk;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    var tbody = document.getElementById('tabelaMeusServicos')?.querySelector('tbody');
    if(tbody) {
        tbody.innerHTML = '';
        if(minhasOps.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="4">Nenhum serviço encontrado no período.</td></tr>'; 
        } else {
            minhasOps.forEach(op => {
                var papel = (op.motoristaId === uid) ? 'MOTORISTA' : 'AJUDANTE';
                var valor = 0;
                if(papel === 'MOTORISTA') valor = Number(op.comissao)||0;
                else { var aj = op.ajudantes.find(x => x.id === uid); if(aj) valor = Number(aj.diaria)||0; }

                var faltou = false;
                if (papel === 'MOTORISTA' && op.checkins && op.checkins.faltaMotorista) faltou = true;
                if (papel === 'AJUDANTE' && op.checkins && op.checkins.faltas && op.checkins.faltas[uid]) faltou = true;
                var valDisplay = faltou ? '<span style="color:red; text-decoration:line-through;">FALTA</span>' : formatarValorMoeda(valor);

                tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${papel}</td><td>${valDisplay}</td></tr>`;
            });
        }
    }

    // MEUS RECIBOS (Apenas os que têm enviado === true)
    var tbodyRec = document.getElementById('tabelaMeusRecibos')?.querySelector('tbody');
    if(tbodyRec) {
        var meusRecibos = CACHE_RECIBOS.filter(r => String(r.funcionarioId) === String(uid) && r.enviado === true);
        tbodyRec.innerHTML = '';
        if(meusRecibos.length === 0) tbodyRec.innerHTML = '<tr><td colspan="4">Nenhum recibo disponível.</td></tr>';
        meusRecibos.forEach(r => {
            tbodyRec.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.periodo}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td><button class="btn-mini btn-primary"><i class="fas fa-eye"></i></button></td></tr>`;
        });
    }
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO
// =============================================================================

const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// -----------------------------------------------------------------------------
// PAINEL SUPER ADMIN (VISUAL LIMPO E CORRIGIDO)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Atualizando lista...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        
        // Busca Forçada na Nuvem
        const companiesSnap = await getDocs(collection(db, "companies"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        const users = [];
        usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if(companies.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma empresa encontrada.</div>';
            return;
        }

        // Renderização Simples e Funcional (Estilo Accordion)
        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            // Tratamento de Status
            let statusBadge = comp.isBlocked ? 
                `<span class="status-pill pill-paused">BLOQUEADO</span>` : 
                (comp.isVitalicio ? `<span class="status-pill pill-active">VITALÍCIO</span>` : 
                (comp.systemValidity && new Date(comp.systemValidity) < new Date() ? `<span class="status-pill pill-blocked">VENCIDO</span>` : `<span class="status-pill pill-active">ATIVO</span>`));
            
            let validadeTexto = comp.isVitalicio ? "VITALÍCIO" : (comp.systemValidity ? formatarDataParaBrasileiro(comp.systemValidity) : "SEM DADOS");
            let borderColor = comp.isBlocked ? "var(--danger-color)" : (comp.isVitalicio ? "gold" : "#ddd");

            // Valores seguros para o modal
            const safeValidity = comp.systemValidity || '';
            const safeVitalicio = comp.isVitalicio || false;
            const safeBlocked = comp.isBlocked || false;

            const div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = `margin-bottom:15px; border:1px solid ${borderColor}; border-radius:8px; background:white; overflow:hidden;`;

            div.innerHTML = `
                <div class="company-header" onclick="this.nextElementSibling.style.display = (this.nextElementSibling.style.display === 'none' ? 'block' : 'none')" style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#f8f9fa;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="background:var(--primary-color); color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                            ${comp.id.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                            <h4 style="margin:0; text-transform:uppercase;">${comp.id}</h4>
                            <small style="color:#666;">Admin: ${admin ? admin.email : '<span style="color:red">Erro</span>'}</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="text-align:right;">
                            <div style="font-size:0.7rem; color:#888;">VALIDADE</div>
                            <strong style="font-size:0.9rem;">${validadeTexto}</strong>
                        </div>
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="company-body" style="display:none; padding:20px; border-top:1px solid #eee;">
                    <div style="margin-bottom:15px; display:flex; gap:10px;">
                        <button class="btn-mini btn-primary" onclick="abrirModalCreditos('${comp.id}', '${safeValidity}', ${safeVitalicio}, ${safeBlocked})">
                            <i class="fas fa-edit"></i> GERENCIAR ACESSO
                        </button>
                        <button class="btn-mini btn-danger" onclick="excluirEmpresaTotal('${comp.id}')">
                            <i class="fas fa-trash"></i> EXCLUIR EMPRESA
                        </button>
                    </div>
                    
                    <h5 style="color:#666; margin-bottom:10px;">USUÁRIOS (${usersDaEmpresa.length})</h5>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>NOME</th><th>EMAIL</th><th>SENHA</th><th>AÇÃO</th></tr></thead>
                        <tbody>
                            ${usersDaEmpresa.map(u => `
                                <tr>
                                    <td>${u.name}</td>
                                    <td>${u.email}</td>
                                    <td style="font-family:monospace; color:#007bff;">${u.senhaVisual || '***'}</td>
                                    <td>
                                        <button class="btn-mini btn-warning" onclick="resetarSenhaComMigracao('${u.uid}', '${u.email}', '${u.name}')">RESET</button>
                                        <button class="btn-mini btn-danger" onclick="excluirUsuarioGlobal('${u.uid}')">DEL</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red">Erro: ${e.message}</p>`;
    }
};

// CRIAÇÃO DE EMPRESA (COM RECUPERAÇÃO DE ERRO)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("Domínio inválido.");

        const { db, doc, setDoc } = window.dbRef;

        try {
            // Tenta criar Auth
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            
            // Cria Admin
            await setDoc(doc(db, "users", uid), {
                uid: uid, name: "ADMIN " + dominio.toUpperCase(), email: email, role: 'admin', 
                company: dominio, createdAt: new Date().toISOString(), approved: true, 
                isVitalicio: false, isBlocked: false, senhaVisual: senha,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            });

        } catch (erro) {
            // Se o e-mail já existe
            if (erro.code === 'auth/email-already-in-use') {
                if(!confirm(`O e-mail ${email} JÁ EXISTE.\n\nDeseja criar apenas a empresa "${dominio}"?`)) {
                    return;
                }
            } else {
                return alert("Erro fatal: " + erro.message);
            }
        }

        try {
            // Cria Documento da Empresa
            await setDoc(doc(db, "companies", dominio), { 
                id: dominio, createdAt: new Date().toISOString(),
                isBlocked: false, isVitalicio: false,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            }, { merge: true });

            alert(`Empresa "${dominio}" registrada!`);
            e.target.reset();
            carregarPainelSuperAdmin();

        } catch (dbError) {
            alert("Erro DB: " + dbError.message);
        }
    }
});

// MODAL CRÉDITOS SEGURO (CORREÇÃO ERRO NULL)
window.abrirModalCreditos = function(companyId, validade, isVitalicio, isBlocked) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    
    var texto = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade.split('T')[0]) : "SEM REGISTRO");
    document.getElementById('validadeAtualCredito').textContent = texto;
    
    // Verificações de segurança
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var elDivAdd = document.getElementById('divAddCreditos');

    if(elVitalicio) elVitalicio.checked = isVitalicio;
    if(elBloqueado) elBloqueado.checked = isBlocked;
    if(elDivAdd) elDivAdd.style.display = isVitalicio ? 'none' : 'block';
    
    if(elVitalicio) {
        elVitalicio.onchange = function() { 
            if(elDivAdd) elDivAdd.style.display = this.checked ? 'none' : 'block'; 
        };
    }
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var isVitalicio = elVitalicio ? elVitalicio.checked : false;
    var isBloqueado = elBloqueado ? elBloqueado.checked : false;
    var meses = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        const { db, collection, query, where, getDocs, updateDoc, doc, setDoc, writeBatch } = window.dbRef;
        
        var dadosEmpresa = { isVitalicio: isVitalicio, isBlocked: isBloqueado };
        var novaData = null;

        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            var base = new Date();
            if(!snap.empty) {
                var adm = snap.docs[0].data();
                if(adm.systemValidity && new Date(adm.systemValidity) > base) base = new Date(adm.systemValidity);
            }
            if (meses > 0) base.setDate(base.getDate() + (meses * 30));
            
            novaData = base.toISOString();
            dadosEmpresa.systemValidity = novaData;
        }

        // Atualiza Empresa e Usuários (Batch)
        await setDoc(doc(db, "companies", companyId), dadosEmpresa, { merge: true });
        
        const qUsers = query(collection(db, "users"), where("company", "==", companyId));
        const snapUsers = await getDocs(qUsers);
        const batch = writeBatch(db);
        
        snapUsers.forEach(uDoc => {
            let updateData = { isBlocked: isBloqueado, isVitalicio: isVitalicio };
            if (novaData) updateData.systemValidity = novaData;
            batch.update(uDoc.ref, updateData);
        });
        await batch.commit();

        alert("Atualizado!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();
    } catch(e) { alert("Erro: " + e.message); }
};

window.excluirEmpresaTotal = async function(companyId) {
    if (prompt(`Digite "DELETAR" para apagar a empresa ${companyId}:`) !== "DELETAR") return;
    try {
        const { db, collection, query, where, getDocs, doc, writeBatch } = window.dbRef;
        const batch = writeBatch(db);
        
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
        batch.delete(doc(db, "companies", companyId));
        await batch.commit();
        
        alert("Excluído!");
        carregarPainelSuperAdmin();
    } catch (e) { alert("Erro: " + e.message); }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(!confirm("Remover usuário?")) return;
    try { 
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid)); 
        carregarPainelSuperAdmin(); 
    } catch(e) { alert(e.message); }
};

window.resetarSenhaComMigracao = async function(uid, email, nome) {
    var p = prompt("Nova senha:");
    if(p) {
        try {
            let nid = await window.dbRef.criarAuthUsuario(email, p);
            var old = await window.dbRef.getDoc(window.dbRef.doc(window.dbRef.db, "users", uid));
            if(old.exists()){
                var d = old.data(); d.uid=nid; d.senhaVisual=p;
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", nid), d);
                await window.dbRef.deleteDoc(old.ref);
            }
            alert("Senha alterada!"); carregarPainelSuperAdmin();
        } catch(e){ alert(e.message); }
    }
};

// -----------------------------------------------------------------------------
// MEUS DADOS (FUNCIONÁRIO)
// -----------------------------------------------------------------------------

window.renderizarMeusDados = function() {
    var user = window.USUARIO_ATUAL;
    var dados = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(user.uid)) || user;
    
    var html = `
        <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
            <div style="text-align:center; margin-bottom:20px;">
                <i class="fas fa-user-circle" style="font-size:3rem; color:var(--primary-color);"></i>
                <h3>${dados.nome || dados.name}</h3>
                <span class="status-pill pill-active">${dados.funcao || dados.role}</span>
            </div>
            ${makeLine('Telefone', dados.telefone, 'TELEFONE')}
            ${makeLine('Endereço', dados.endereco, 'ENDERECO')}
            ${makeLine('PIX', dados.pix, 'PIX')}
            ${makeLine('Email', dados.email, 'EMAIL')}
    `;
    if(dados.funcao === 'motorista') {
        html += `<h4 style="margin-top:20px;">DADOS CNH</h4>${makeLine('CNH', dados.cnh, 'CNH')}${makeLine('Validade', formatarDataParaBrasileiro(dados.validadeCNH), 'VALIDADE_CNH')}`;
    }
    html += `</div>`;
    
    var container = document.getElementById('meusDadosContainer');
    if(container) container.innerHTML = html;
};

function makeLine(label, val, field) {
    return `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #eee;">
        <div><strong>${label}:</strong> ${val||'-'}</div>
        <button class="btn-mini btn-secondary" onclick="solicitarAlteracao('${field}', '${val}')"><i class="fas fa-pen"></i></button>
    </div>`;
}

window.solicitarAlteracao = function(campo, atual) {
    var novo = prompt("Novo valor:", atual);
    if(novo && novo !== atual) {
        var req = { id: Date.now().toString(), data: new Date().toISOString(), funcionarioId: window.USUARIO_ATUAL.uid, funcionarioEmail: window.USUARIO_ATUAL.email, campo: campo, valorAntigo: atual, valorNovo: novo, status: 'PENDENTE' };
        var lista = CACHE_PROFILE_REQUESTS || [];
        lista.push(req);
        salvarProfileRequests(lista).then(() => alert("Solicitação enviada!"));
    }
};

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO E ROTEAMENTO (FINAL)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> INIT SYSTEM:", user.role);
    window.USUARIO_ATUAL = user;

    // 1. Ocultar tudo inicialmente
    document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // 2. Roteamento SUPER ADMIN
    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        var p = document.getElementById('super-admin');
        p.style.display = 'block'; setTimeout(() => p.classList.add('active'), 50);
        carregarPainelSuperAdmin();
        return; 
    }

    // 3. Sincronia de Dados
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects();

    // 4. Roteamento ADMIN
    if (user.role === 'admin') {
        if (user.isBlocked) return document.body.innerHTML = "<div style='text-align:center;padding:50px;color:red'><h1>BLOQUEADO</h1></div>";
        
        if (!user.isVitalicio) {
            if (!user.systemValidity || new Date(user.systemValidity) < new Date()) {
                document.body.innerHTML = "<div style='text-align:center; padding:50px; color:red'><h1>SISTEMA VENCIDO</h1><button onclick='logoutSystem()'>SAIR</button></div>";
                return;
            }
        }

        document.getElementById('menu-admin').style.display = 'block';
        
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            document.querySelector('[data-page="home"]')?.classList.add('active');
        }
        atualizarDashboard();
        renderizarCalendario();

    } else {
        // 5. Roteamento FUNCIONÁRIO
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        var empHome = document.getElementById('employee-home');
        if(empHome) { 
            empHome.style.display = 'block'; 
            setTimeout(() => empHome.classList.add('active'), 50);
            document.querySelector('[data-page="employee-home"]')?.classList.add('active');
        }
        
        renderizarCheckinFuncionario();
        renderizarMeusDados();
    }
};

// -----------------------------------------------------------------------------
// NAVEGAÇÃO E BACKUP
// -----------------------------------------------------------------------------

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => { page.classList.remove('active'); page.style.display = 'none'; });
        this.classList.add('active');
        var target = document.getElementById(this.getAttribute('data-page'));
        if (target) { target.style.display = 'block'; setTimeout(() => target.classList.add('active'), 10); }
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
        
        var pg = this.getAttribute('data-page');
        if (pg === 'home') atualizarDashboard();
        if (pg === 'meus-dados') renderizarMeusDados();
        if (pg === 'employee-checkin') renderizarCheckinFuncionario();
    });
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));

window.exportDataBackup = function() {
    var data = { meta: { date: new Date(), user: window.USUARIO_ATUAL.email }, data: { funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, operacoes: CACHE_OPERACOES, despesas: CACHE_DESPESAS } };
    var a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = "backup.json"; a.click();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(e) {
        if(confirm("Restaurar backup?")) {
            var json = JSON.parse(e.target.result);
            if(json.data) {
                localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(json.data.funcionarios));
                localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(json.data.veiculos));
                localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(json.data.operacoes));
                localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(json.data.despesas));
                alert("Backup restaurado! Recarregando...");
                window.location.reload();
            }
        }
    };
    reader.readAsText(event.target.files[0]);
};
