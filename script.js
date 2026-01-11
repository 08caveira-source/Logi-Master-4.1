// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (CORREÇÃO DASHBOARD E GRÁFICO)
// =============================================================================
// PARTE 1 DE 5: CONSTANTES, VARIÁVEIS GLOBAIS, HELPERS E CAMADA DE DADOS
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

// Lista de e-mails que possuem acesso total ao Painel Master
const EMAILS_MESTRES = [
    "admin@logimaster.com", 
    "suporte@logimaster.com", 
    "08caveira@gmail.com"
]; 

// Armazena o usuário logado atualmente
window.USUARIO_ATUAL = null;

// Define se o usuário é apenas funcionário (leitura) ou admin
window.MODO_APENAS_LEITURA = false; 

// Data atual para controle do calendário e dashboard
window.currentDate = new Date(); 

// Instância do gráfico para poder destruir e recriar
window.chartInstance = null; 

// Lista temporária para adicionar ajudantes em uma operação antes de salvar
window._operacaoAjudantesTempList = []; 

// Status da licença do sistema da empresa atual
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Sincronizado com a memória RAM)
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

// Formata um número para o padrão de moeda brasileiro (R$ 1.000,00)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Converte data ISO (YYYY-MM-DD) para Brasileiro (DD/MM/YYYY)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    // Tenta dividir a data assumindo formato ISO
    var partes = dataIso.split('T')[0].split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

// Formata telefone para padrão (XX) XXXXX-XXXX
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    
    return telefone;
}

// Remove acentos de textos (útil para buscas e filtros)
function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// -----------------------------------------------------------------------------
// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
// -----------------------------------------------------------------------------

function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Usuário offline ou sem empresa definida. Carregando dados locais de backup.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(lista);
                }
                
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]); 
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave} do Firebase:`, e);
        }
    }

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

function carregarTodosDadosLocais() {
    function load(chave) {
        try {
            var dados = localStorage.getItem(chave);
            return dados ? JSON.parse(dados) : [];
        } catch (erro) {
            console.error("Erro ao ler localStorage:", erro);
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

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
             console.warn("Salvamento na nuvem bloqueado: Sistema sem créditos ou bloqueado.");
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
            alert("Atenção: Erro ao salvar na nuvem. Verifique sua conexão.");
        }
    }
}

async function salvarListaFuncionarios(lista) { 
    await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); 
}

async function salvarListaVeiculos(lista) { 
    await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); 
}

async function salvarListaContratantes(lista) { 
    await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); 
}

async function salvarListaOperacoes(lista) { 
    await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); 
}

async function salvarDadosMinhaEmpresa(dados) { 
    await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); 
}

async function salvarListaDespesas(lista) { 
    await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); 
}

async function salvarListaAtividades(lista) { 
    await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); 
}

async function salvarListaRecibos(lista) { 
    await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); 
}

async function salvarProfileRequests(lista) { 
    await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); 
}

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
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO (LÓGICA FINANCEIRA E GRÁFICOS CORRIGIDOS)
// =============================================================================

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES DO DASHBOARD
// -----------------------------------------------------------------------------

/**
 * Alterna a visibilidade dos valores financeiros no dashboard (Modo Privacidade)
 * Oculta/Mostra elementos com a classe .privacy-target
 */
window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    // Se não houver elementos alvo, encerra
    if (targets.length === 0) {
        return;
    }

    // Verifica o estado atual baseado no primeiro elemento encontrado
    const isBlurred = targets[0].classList.contains('privacy-blur');

    // Aplica a alteração em todos os elementos alvo
    targets.forEach(el => {
        if (isBlurred) {
            el.classList.remove('privacy-blur');
        } else {
            el.classList.add('privacy-blur');
        }
    });

    // Alterna o ícone do botão (Olho aberto / cortado)
    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

// -----------------------------------------------------------------------------
// CÁLCULOS FINANCEIROS AVANÇADOS (MÉDIA E CONSUMO REAL)
// -----------------------------------------------------------------------------

/**
 * Calcula a média de consumo histórica de um veículo (Km Total / Litros Totais)
 * Baseado apenas em viagens confirmadas ou finalizadas para garantir precisão.
 * @param {string} placa - Placa do veículo
 * @returns {number} - Média em Km/L
 */
// =============================================================================
// CORREÇÃO: CÁLCULO DE MÉDIA DE CONSUMO GLOBAL (HISTÓRICO VITALÍCIO)
// =============================================================================

/**
 * Calcula a média global do veículo somando TODO o histórico de KM e TODO o histórico de Litros.
 * Isso garante que dias onde só houve "KM Rodado" (sem abastecimento) sejam contabilizados na eficiência.
 */
window.calcularMediaGlobalVeiculo = function(placa) {
    // 1. Filtra todas as viagens válidas (CONFIRMADA ou FINALIZADA) deste veículo
    var ops = CACHE_OPERACOES.filter(function(o) {
        var matchPlaca = (o.veiculoPlaca === placa);
        var matchStatus = (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
        return matchPlaca && matchStatus;
    });

    if (ops.length === 0) {
        return 0; // Sem histórico
    }

    var totalKmAcumulado = 0;
    var totalLitrosAcumulado = 0;

    // 2. Itera sobre o histórico completo para somar totais
    ops.forEach(function(op) {
        // Soma TODO km rodado registrado na vida do veículo
        // Mesmo que o dia não tenha abastecimento, o KM entra na conta da eficiência
        totalKmAcumulado += (Number(op.kmRodado) || 0);

        // Soma TODO abastecimento registrado na vida do veículo
        var valorAbastecido = Number(op.combustivel) || 0;
        var precoLitro = Number(op.precoLitro) || 0;
        
        // Só soma litros se houve abastecimento e temos o preço para converter R$ em Litros
        if (valorAbastecido > 0 && precoLitro > 0) {
            totalLitrosAcumulado += (valorAbastecido / precoLitro);
        }
    });

    // 3. Cálculo da Média Global Real (Km Totais / Litros Totais)
    if (totalLitrosAcumulado > 0) {
        var media = totalKmAcumulado / totalLitrosAcumulado;
        
        // Trava de segurança para evitar médias absurdas (ex: erro de digitação de 1km com 1000 litros)
        // Se a média for muito fora da realidade, você pode ajustar aqui, mas deixaremos puro por enquanto.
        return media;
    } else {
        return 0; // Ainda não abasteceu o suficiente para formar uma média
    }
};

/**
 * Calcula o custo da viagem atual baseando-se na MÉDIA GLOBAL do veículo.
 * Se o dia só teve KM rodado, ele pega a média histórica e estima quanto gastou.
 */
window.calcularCustoCombustivelOperacao = function(op) {
    // Cenário 1: Se não tem KM rodado informado, usamos o valor real do abastecimento do dia (se houver)
    if (!op.kmRodado || op.kmRodado <= 0) {
        return Number(op.combustivel) || 0; 
    }
    
    if (!op.veiculoPlaca) {
        return Number(op.combustivel) || 0;
    }

    // Cenário 2: Tem KM rodado. Vamos calcular o consumo estimado.
    
    // Busca a média histórica corrigida (Global)
    var mediaConsumo = window.calcularMediaGlobalVeiculo(op.veiculoPlaca);
    
    // Se não tem histórico suficiente (veículo novo), usa o abastecimento lançado nesta operação como custo
    if (mediaConsumo <= 0) {
        return Number(op.combustivel) || 0;
    }

    // Define o preço do litro para o cálculo (usa o da operação ou a média histórica de preço)
    var precoLitro = Number(op.precoLitro) || window.obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // CÁLCULO FINAL: (Km da Viagem / Média Global Km/L) * Preço do Litro
    var custoEstimado = (op.kmRodado / mediaConsumo) * precoLitro;
    
    return custoEstimado;
};

/**
 * Obtém o preço médio do combustível pago nas últimas 5 viagens do veículo.
 * Útil para calcular custos quando o preço do litro não foi informado na viagem atual.
 * @param {string} placa - Placa do veículo
 * @returns {number} - Preço médio do litro
 */
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && Number(o.precoLitro) > 0;
    });

    // Valor de fallback seguro se não houver histórico (R$ 6.00)
    if (ops.length === 0) {
        return 6.00; 
    }

    // Pega as últimas 5 viagens para ter um preço atualizado
    var ultimas = ops.slice(-5); 
    
    var somaPrecos = ultimas.reduce(function(acc, curr) {
        return acc + Number(curr.precoLitro);
    }, 0);

    return somaPrecos / ultimas.length;
};

/**
 * FUNÇÃO PRINCIPAL DE CUSTO: Calcula o custo de combustível proporcional ao KM rodado.
 * Esta função evita que um abastecimento de tanque cheio seja debitado inteiro em uma única viagem curta.
 * Fórmula: (KM da Viagem / Média Histórica Km/L) * Preço do Litro
 * @param {object} op - Objeto da operação
 * @returns {number} - Custo estimado do combustível para a viagem
 */
window.calcularCustoCombustivelOperacao = function(op) {
    // 1. Se não tem KM rodado, assumimos o valor do abastecimento direto (lançamento manual) ou 0
    if (!op.kmRodado || op.kmRodado <= 0) {
        return Number(op.combustivel) || 0; 
    }
    
    // 2. Se não tem veículo vinculado, retorna o valor declarado
    if (!op.veiculoPlaca) {
        return Number(op.combustivel) || 0;
    }

    // 3. Busca a média histórica do veículo
    var mediaConsumo = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    
    // 4. Se não tem histórico (veículo novo ou sem dados suficientes), usa o abastecimento lançado
    if (mediaConsumo <= 0) {
        return Number(op.combustivel) || 0;
    }

    // 5. Define o preço do litro (da operação atual ou média histórica)
    var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // 6. Cálculo final proporcional
    return (op.kmRodado / mediaConsumo) * precoLitro;
};

// -----------------------------------------------------------------------------
// LÓGICA CENTRAL DO DASHBOARD
// -----------------------------------------------------------------------------

/**
 * Atualiza todos os indicadores do Dashboard (Cards Superiores e Gráfico Principal).
 * Filtra dados pelo mês atual.
 */
window.atualizarDashboard = function() {
    // [CORREÇÃO]: Removida a trava que impedia Admins Mestres de verem o dashboard operacional
    
    console.log("Calculando métricas do Dashboard (Lógica de Consumo Real)...");
    
    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    // Variáveis acumuladoras
    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // 1. PROCESSAR OPERAÇÕES (VIAGENS)
    CACHE_OPERACOES.forEach(function(op) {
        // Ignora canceladas
        if (op.status === 'CANCELADA') {
            return;
        }
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // --- Custo Combustível Real (Proporcional) ---
        var custoCombustivelCalculado = window.calcularCustoCombustivelOperacao(op);

        // --- Custos da Operação ---
        // (Despesas Gerais da Viagem + Combustível Calculado)
        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        // --- Comissão Motorista ---
        // Só soma se não tiver falta registrada
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        // --- Ajudantes ---
        // Só soma diária se o ajudante específico não faltou
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) {
                    custoOp += (Number(aj.diaria) || 0);
                }
            });
        }

        // --- Receita Total (Histórico Vitalício) ---
        // Apenas confirmadas/finalizadas entram no histórico global
        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        // --- Somar ao Mês Atual ---
        var dataOp = new Date(op.data + 'T12:00:00'); // Força meio-dia para evitar fuso horário
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // 2. PROCESSAR DESPESAS GERAIS (COM LÓGICA DE PARCELAMENTO)
    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        
        // Se for parcelado, distribui o custo nos meses subsequentes
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
            // Se for à vista: Soma total apenas se a data for no mês atual
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += valorTotal;
            }
        }
    });

    // Cálculos Finais de Lucro e Margem
    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza Elementos do DOM (Cards Coloridos)
    // Verifica se o elemento existe antes de tentar atualizar para evitar erros
    if (document.getElementById('faturamentoMes')) {
        document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoMes);
        document.getElementById('despesasMes').textContent = formatarValorMoeda(custosMes);
        document.getElementById('receitaMes').textContent = formatarValorMoeda(lucroMes);
        
        // Define cor do lucro (Verde/Vermelho)
        var elLucro = document.getElementById('receitaMes');
        if (lucroMes >= 0) {
            elLucro.style.color = "var(--success-color)";
        } else {
            elLucro.style.color = "var(--danger-color)";
        }

        // Se existir o elemento de histórico total, atualiza
        if(document.getElementById('receitaTotalHistorico')) {
             document.getElementById('receitaTotalHistorico').textContent = formatarValorMoeda(receitaHistorico); 
        }
        document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    }

    // Atualiza o Gráfico após calcular os dados numéricos
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// GRÁFICOS (Chart.js)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    // [CORREÇÃO]: Removida a trava que impedia a renderização do gráfico para Admins Mestres

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    // Recupera Filtros da Tela (se existirem)
    var filtroVeiculo = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var filtroMotorista = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    
    var summaryContainer = document.getElementById('chartVehicleSummaryContainer');

    // Inicializa estatísticas
    var stats = {
        faturamento: 0,
        custos: 0, 
        lucro: 0,
        viagens: 0,
        faltas: 0,
        kmTotal: 0,
        litrosTotal: 0 // Usado apenas para cálculo de média no resumo visual
    };

    // Categorias do Gráfico
    var gReceita = 0;
    var gCombustivel = 0;
    var gPessoal = 0; 
    var gManutencao = 0; 

    // 1. Processar Operações para o Gráfico
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        // Aplica Filtros de Veículo/Motorista
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            // Contagem de Faltas (relevante se filtro motorista ativo)
            if (filtroMotorista && op.checkins && op.checkins.faltaMotorista) {
                stats.faltas++;
            }

            var receitaOp = Number(op.faturamento) || 0;
            
            // Custo Combustível (Logica de Média Real)
            var combustivelOp = window.calcularCustoCombustivelOperacao(op);

            var despesasOp = Number(op.despesas) || 0; 
            var comissaoOp = 0;

            if (!op.checkins || !op.checkins.faltaMotorista) {
                comissaoOp = Number(op.comissao) || 0;
            }
            
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                     var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                     if (!faltou) {
                         comissaoOp += (Number(aj.diaria)||0);
                     }
                });
            }

            // Acumula totais
            stats.viagens++;
            stats.faturamento += receitaOp;
            stats.custos += (combustivelOp + despesasOp + comissaoOp);
            stats.kmTotal += (Number(op.kmRodado) || 0);

            // Distribui nas categorias do gráfico
            gReceita += receitaOp;
            gCombustivel += combustivelOp;
            gPessoal += comissaoOp; 
            gManutencao += despesasOp; 

            // Acumula Litros reais para estatística de média no resumo (não custo)
            var precoReal = Number(op.precoLitro) || 0;
            if (precoReal > 0 && Number(op.combustivel) > 0) {
                stats.litrosTotal += (Number(op.combustivel) / precoReal);
            }
        }
    });

    // 2. Processar Despesas Gerais para o Gráfico
    CACHE_DESPESAS.forEach(desp => {
        // Aplica filtro de veículo (despesas gerais não costumam ter motorista vinculado, mas têm veículo)
        if (filtroVeiculo && desp.veiculoPlaca && desp.veiculoPlaca !== filtroVeiculo) return;
        
        var valorComputado = 0;
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');

        // Lógica de parcelamento para o gráfico
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

            // Categorização simples por palavra-chave na descrição
            var desc = removerAcentos(desp.descricao || "");
            
            if (desc.includes("manutencao") || desc.includes("oleo") || desc.includes("pneu") || desc.includes("peca")) {
                gManutencao += valorComputado;
            } 
            else if (desc.includes("comida") || desc.includes("hotel") || desc.includes("outros") || desc.includes("alimentacao")) {
                gPessoal += valorComputado;
            } 
            else {
                // Se não identificar, joga em manutenção/geral
                gManutencao += valorComputado; 
            }
        }
    });

    stats.lucro = stats.faturamento - stats.custos;

    // Renderiza o Resumo em Texto Acima do Gráfico
    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
        
        // Só mostra resumo se houver filtro ativo
        if (filtroVeiculo || filtroMotorista) {
            var tituloBox = filtroVeiculo ? "VEÍCULO" : "MOTORISTA";
            var valorTitulo = filtroVeiculo || (CACHE_FUNCIONARIOS.find(f => f.id == filtroMotorista)?.nome || "Desconhecido");
            
            var boxExtraLabel = filtroMotorista ? "FALTAS" : "MÉDIA REAL";
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
                    <div class="veh-stat-box">
                        <small>${tituloBox}</small>
                        <span>${valorTitulo}</span>
                    </div>
                    <div class="veh-stat-box">
                        <small>VIAGENS (MÊS)</small>
                        <span>${stats.viagens}</span>
                    </div>
                    <div class="veh-stat-box">
                        <small>FATURAMENTO</small>
                        <span style="color:var(--success-color)">${formatarValorMoeda(stats.faturamento)}</span>
                    </div>
                    <div class="veh-stat-box">
                        <small>${boxExtraLabel}</small>
                        <span style="color:${boxExtraColor}">${boxExtraValue}</span>
                    </div>
                    <div class="veh-stat-box">
                        <small>LUCRO EST.</small>
                        <span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span>
                    </div>
                </div>
            `;
        }
    }

    // Destrói gráfico antigo se existir e cria um novo
    if (window.chartInstance) {
        window.chartInstance.destroy();
    }
    
    var lucroFinal = gReceita - (gCombustivel + gPessoal + gManutencao);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL (REAL)', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'Valores do Mês',
                data: [gReceita, gCombustivel, gPessoal, gManutencao, lucroFinal],
                backgroundColor: [
                    '#28a745', // Verde (Fat)
                    '#dc3545', // Vermelho (Combustível)
                    '#ffc107', // Amarelo (Pessoal)
                    '#17a2b8', // Azul (Manutenção)
                    (lucroFinal >= 0 ? '#20c997' : '#e83e8c') // Verde Água (Lucro) ou Rosa (Prejuízo)
                ]
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
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
// 6. LÓGICA DO CALENDÁRIO OPERACIONAL
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    // [CORREÇÃO]: Removida a trava do calendário para Admins Mestres

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    // Garante que existe uma data válida definida
    if (!window.currentDate) window.currentDate = new Date();

    grid.innerHTML = ''; 
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    // Atualiza o título do mês
    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    // Calcula dias
    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 = Dom, 1 = Seg...
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Preenche dias vazios do início do mês
    for (var i = 0; i < primeiroDiaSemana; i++) {
        var e = document.createElement('div');
        e.className = 'day-cell empty';
        grid.appendChild(e);
    }

    // Preenche dias do mês
    for (var d = 1; d <= diasNoMes; d++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        var dStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        var cellContent = `<span>${d}</span>`;
        
        // Filtra operações deste dia
        var opsDoDia = (CACHE_OPERACOES || []).filter(o => o.data === dStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            // Define cor do indicador
            var temEmAndamento = opsDoDia.some(o => o.status === 'EM_ANDAMENTO');
            var temPendente = opsDoDia.some(o => o.status === 'AGENDADA');
            var dotColor = temEmAndamento ? 'orange' : (temPendente ? '#999' : 'green');

            cellContent += `<div class="event-dot" style="background:${dotColor}"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // Adiciona evento de clique para abrir detalhes
            (function(dataString) {
                cell.onclick = function() { abrirModalDetalhesDia(dataString); };
            })(dStr);
        } else {
            // Se não tem operação, clica para criar nova nessa data
            (function(dataString) {
                cell.onclick = function() { 
                    var btnOperacoes = document.querySelector('[data-page="operacoes"]');
                    if (btnOperacoes) {
                        btnOperacoes.click();
                        // Aguarda a tela carregar para preencher a data
                        setTimeout(() => {
                            var inputData = document.getElementById('operacaoData');
                            if(inputData) inputData.value = dataString;
                        }, 100);
                    }
                };
            })(dStr);
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

// --- MODAL DE DETALHES DO DIA (COM CORREÇÃO DO BOTÃO "VER DETALHES") ---
window.abrirModalDetalhesDia = function(dataString) {
    var operacoesDoDia = CACHE_OPERACOES.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'OPERAÇÕES: ' + dataFormatada;
    
    // Calcula totais do dia para o resumo
    var totalFat = 0;
    var totalCustos = 0;
    
    operacoesDoDia.forEach(op => {
        totalFat += Number(op.faturamento) || 0;
        
        // Custo Combustível Real
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        
        var custoOp = (Number(op.despesas)||0) + custoComb;
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoOp += (Number(op.comissao)||0);
        }
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => { 
                if(!op.checkins?.faltas?.[aj.id]) {
                    custoOp += (Number(aj.diaria)||0);
                } 
            });
        }
        
        totalCustos += custoOp;
    });

    var totalLucro = totalFat - totalCustos;

    // Renderiza o cabeçalho de resumo financeiro do dia
    if (modalSummary) {
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px; text-align:center; background:#f5f5f5; padding:8px; border-radius:6px; font-size:0.85rem;">
                <div><small>FATURAMENTO</small><br><strong style="color:var(--success-color)">${formatarValorMoeda(totalFat)}</strong></div>
                <div><small>CUSTO REAL</small><br><strong style="color:var(--danger-color)">${formatarValorMoeda(totalCustos)}</strong></div>
                <div><small>LUCRO</small><br><strong style="color:${totalLucro >= 0 ? 'var(--primary-color)' : 'red'}">${formatarValorMoeda(totalLucro)}</strong></div>
            </div>
        `;
    }

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;">';
    
    if(operacoesDoDia.length === 0) {
        htmlLista += '<p style="text-align:center; color:#666;">Nenhuma operação encontrada para esta data.</p>';
    }

    operacoesDoDia.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome.split(' ')[0] : '-';
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        
        htmlLista += `
            <div style="border:1px solid #ddd; margin-bottom:10px; border-radius:5px; padding:10px; background:white;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;">
                    <span>${cli}</span> <span style="color:${op.status==='EM_ANDAMENTO'?'orange':'#666'}">${op.status}</span>
                </div>
                <div style="font-size:0.85rem; color:#555; margin:5px 0;">
                    <i class="fas fa-truck"></i> ${op.veiculoPlaca} | <i class="fas fa-user"></i> ${nomeMot}
                </div>
                <button class="btn-mini btn-secondary" style="width:100%" onclick="document.getElementById('modalDayOperations').style.display='none'; visualizarOperacao('${op.id}')">VER DETALHES COMPLETOS</button>
            </div>
        `;
    });
    
    htmlLista += '</div>';
    
    modalBody.innerHTML = htmlLista;
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE
// =============================================================================

// -----------------------------------------------------------------------------
// CONTROLE DE ABAS (TABS) DE CADASTRO
// -----------------------------------------------------------------------------
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove a classe 'active' de todos os botões e formulários
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        
        // Ativa o botão clicado
        btn.classList.add('active');
        
        // Mostra o formulário correspondente
        const targetId = btn.getAttribute('data-tab');
        const targetForm = document.getElementById(targetId);
        
        if (targetForm) {
            targetForm.classList.add('active');
            
            // Força a atualização da tabela correspondente ao abrir a aba
            if(targetId === 'funcionarios') renderizarTabelaFuncionarios();
            if(targetId === 'veiculos') renderizarTabelaVeiculos();
            if(targetId === 'contratantes') renderizarTabelaContratantes();
            if(targetId === 'atividades') renderizarTabelaAtividades();
            if(targetId === 'minhaEmpresa') renderizarInformacoesEmpresa();
        }
    });
});

// -----------------------------------------------------------------------------
// 1. CADASTRO DE FUNCIONÁRIOS (COM TRATAMENTO DE EMAIL DUPLICADO)
// -----------------------------------------------------------------------------
// =============================================================================
// ATUALIZAÇÃO: CADASTRO COM RECUPERAÇÃO DE PERFIL PERDIDO
// =============================================================================

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        
        var btnSubmit = e.target.querySelector('button[type="submit"]');
        var textoOriginal = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value; 
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            // Objeto base do funcionário
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

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                try {
                    // 1. Tenta criar novo usuário
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    funcionarioObj.id = novoUID; // Atualiza ID com o UID real do Auth

                    // 2. Cria o Perfil no Firestore (Sucesso)
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                        uid: novoUID, name: nome, email: email, role: funcao,
                        company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(),
                        approved: true, isBlocked: false, senhaVisual: senha
                    });

                } catch (authError) {
                    // SE O EMAIL JÁ EXISTE NO AUTH (Erro comum após resetar sistema)
                    if (authError.code === 'auth/email-already-in-use') {
                        
                        var confirmar = confirm(`O e-mail "${email}" já possui login no sistema (provavelmente de um cadastro anterior).\n\nDeseja restaurar o acesso deste usuário com os dados informados agora?`);
                        
                        if (confirmar) {
                            // TENTATIVA DE RECUPERAÇÃO:
                            // Como não temos o UID do usuário antigo (segurança do firebase),
                            // Vamos salvar com o ID gerado (timestamp) localmente,
                            // MAS avisar que o login pode precisar de reset de senha ou backup.
                            
                            // Porém, se o usuário estiver no Cache (backup), usamos o ID dele!
                            var usuarioExistenteCache = CACHE_FUNCIONARIOS.find(f => f.email === email);
                            if (usuarioExistenteCache) {
                                funcionarioObj.id = usuarioExistenteCache.id; // Usa o UID correto
                                
                                // Recria o documento na nuvem usando o ID correto do backup/cache
                                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", funcionarioObj.id), {
                                    uid: funcionarioObj.id, name: nome, email: email, role: funcao,
                                    company: window.USUARIO_ATUAL.company, approved: true, isBlocked: false,
                                    senhaVisual: senha
                                }, { merge: true });
                                
                                alert("Perfil de acesso restaurado com sucesso! O usuário deve conseguir logar agora.");
                            } else {
                                alert("ATENÇÃO: O login existe no servidor, mas não foi possível recuperar o ID original automaticamente.\n\nRecomendação: Use a opção 'IMPORTAR BACKUP' para restaurar os usuários corretamente ou contate o suporte para limpeza do banco.");
                            }
                        } else {
                            throw new Error("Operação cancelada.");
                        }
                    } else {
                        throw authError;
                    }
                }
            }

            // Atualiza lista local
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== funcionarioObj.id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Dados salvos com sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            preencherTodosSelects();

        } catch (erro) { 
            if (erro.message !== "Operação cancelada.") {
                alert("Erro: " + erro.message); 
            }
        } finally { 
            btnSubmit.disabled = false; 
            btnSubmit.innerHTML = textoOriginal; 
        }
    }
});


// -----------------------------------------------------------------------------
// 2. CADASTRO DE VEÍCULOS
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 3. CADASTRO DE CLIENTES
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 4. CADASTRO DE SERVIÇOS (ATIVIDADES)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 5. CADASTRO MINHA EMPRESA
// -----------------------------------------------------------------------------
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
// 6. CADASTRO DE DESPESAS GERAIS
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 7. CADASTRO DE OPERAÇÕES (VIAGENS)
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Se estiver editando e não for agendamento novo, mantém status de andamento
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
            var msg = isAgendamento ? "Operação Agendada!" : "Operação Salva!";
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

// -----------------------------------------------------------------------------
// 8. HELPERS DE INTERFACE (UI)
// -----------------------------------------------------------------------------

// Mostra campos de CNH apenas para Motoristas
window.toggleDriverFields = function() { 
    var select = document.getElementById('funcFuncao'); 
    var div = document.getElementById('driverSpecificFields'); 
    if (select && div) {
        div.style.display = (select.value === 'motorista') ? 'block' : 'none';
    }
};

// Mostra campos de parcelas apenas se selecionado "Parcelado"
window.toggleDespesaParcelas = function() { 
    var modo = document.getElementById('despesaModoPagamento').value; 
    var div = document.getElementById('divDespesaParcelas'); 
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
    }
};

// Renderiza lista de ajudantes na tela de cadastro de operação
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

// Remove ajudante da lista temporária
window.removerAjudanteTemp = function(id) { 
    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); 
    renderizarListaAjudantesAdicionados(); 
};

// Adiciona ajudante manualmente
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

// Limpa filtro cruzado
window.limparOutroFiltro = function(tipo) { 
    if (tipo === 'motorista') { 
        document.getElementById('filtroMotoristaGrafico').value = ""; 
    } else { 
        document.getElementById('filtroVeiculoGrafico').value = ""; 
    } 
};

// -----------------------------------------------------------------------------
// 9. RENDERIZAÇÃO DE TABELAS E SELECTS (Mestre)
// -----------------------------------------------------------------------------

function preencherTodosSelects() {
    console.log("Atualizando tabelas e selects...");
    
    const fill = (id, dados, valKey, textKey, defText) => { 
        var el = document.getElementById(id); 
        if (!el) return; 
        var atual = el.value; 
        el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); 
        if(atual) el.value = atual; 
    };
    
    // Selects
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

    // Tabelas
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    if(typeof renderizarTabelaDespesasGerais === 'function') renderizarTabelaDespesasGerais();
    if(typeof renderizarTabelaMonitoramento === 'function') { 
        renderizarTabelaMonitoramento(); 
        renderizarTabelaFaltas(); 
    }
    if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
}

// -----------------------------------------------------------------------------
// 10. RENDERIZAÇÃO ESPECÍFICA DAS TABELAS
// -----------------------------------------------------------------------------

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = '';
    
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var textoPgto = d.modoPagamento === 'parcelado' ? `PARCELADO (${d.parcelasTotal}x)` : 'À VISTA';
        
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.veiculoPlaca || 'GERAL'}</td>
            <td>${d.descricao}</td>
            <td style="color:var(--danger-color); font-weight:bold;">${formatarValorMoeda(d.valor)}</td>
            <td>${textoPgto}</td>
            <td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = function(id) { 
    if(!confirm("Excluir esta despesa?")) return; 
    var lista = CACHE_DESPESAS.filter(d => String(d.id) !== String(id)); 
    salvarListaDespesas(lista).then(() => { 
        renderizarTabelaDespesasGerais(); 
        atualizarDashboard(); 
    }); 
};

// ATUALIZAÇÃO: TABELA FUNCIONÁRIOS (COM BOTÃO VISUALIZAR)
function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${f.funcao}</td>
            <td>${f.email || '-'}</td>
            <td>
                <button class="btn-mini btn-info" onclick="visualizarFuncionarioDetalhes('${f.id}')" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')" title="Editar"><i class="fas fa-edit"></i></button> 
                <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `; 
        tbody.appendChild(tr);
    }); 
}

// ATUALIZAÇÃO: TABELA VEÍCULOS (COM BOTÃO VISUALIZAR)
function renderizarTabelaVeiculos() { 
    var tbody = document.querySelector('#tabelaVeiculos tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_VEICULOS.forEach(v => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`
                <td>${v.placa}</td>
                <td>${v.modelo}</td>
                <td>${v.ano}</td>
                <td>
                    <button class="btn-mini btn-info" onclick="visualizarVeiculoDetalhes('${v.placa}')" title="Visualizar"><i class="fas fa-eye"></i></button>
                    <button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')" title="Editar"><i class="fas fa-edit"></i></button> 
                    <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// ATUALIZAÇÃO: TABELA CLIENTES (COM BOTÃO VISUALIZAR)
function renderizarTabelaContratantes() { 
    var tbody = document.querySelector('#tabelaContratantes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_CONTRATANTES.forEach(c => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`
                <td>${c.razaoSocial}</td>
                <td>${c.cnpj}</td>
                <td>${c.telefone}</td>
                <td>
                    <button class="btn-mini btn-info" onclick="visualizarContratanteDetalhes('${c.cnpj}')" title="Visualizar"><i class="fas fa-eye"></i></button>
                    <button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')" title="Editar"><i class="fas fa-edit"></i></button> 
                    <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// Funções de Exclusão
window.excluirFuncionario = async function(id) { 
    if(!confirm("Excluir funcionário?")) return; 
    if (window.dbRef) { 
        try { 
            await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); 
        } catch(e) {} 
    }
    var lista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id)); 
    await salvarListaFuncionarios(lista); 
    alert("Funcionário removido."); 
    preencherTodosSelects(); 
};

window.excluirVeiculo = function(placa) { 
    if(!confirm("Excluir veículo?")) return; 
    salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); 
};

window.excluirContratante = function(cnpj) { 
    if(!confirm("Excluir cliente?")) return; 
    salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); 
};

window.excluirAtividade = function(id) { 
    if(!confirm("Excluir serviço?")) return; 
    salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); 
};

window.excluirOperacao = function(id) { 
    if(!confirm("Excluir operação?")) return; 
    salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { 
        preencherTodosSelects(); 
        renderizarCalendario(); 
        atualizarDashboard(); 
    }); 
};

// Funções de Preenchimento (Edição)
window.preencherFormularioFuncionario = function(id) { 
    var f = buscarFuncionarioPorId(id); if (!f) return; 
    document.getElementById('funcionarioId').value = f.id; 
    document.getElementById('funcNome').value = f.nome; 
    document.getElementById('funcFuncao').value = f.funcao; 
    document.getElementById('funcDocumento').value = f.documento; 
    document.getElementById('funcEmail').value = f.email || ''; 
    document.getElementById('funcTelefone').value = f.telefone; 
    document.getElementById('funcPix').value = f.pix || ''; 
    document.getElementById('funcEndereco').value = f.endereco || ''; 
    toggleDriverFields(); 
    if (f.funcao === 'motorista') { 
        document.getElementById('funcCNH').value = f.cnh || ''; 
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; 
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; 
        document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; 
    } 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="funcionarios"]').click(); 
};

window.preencherFormularioVeiculo = function(placa) { 
    var v = buscarVeiculoPorPlaca(placa); if (!v) return; 
    document.getElementById('veiculoPlaca').value = v.placa; 
    document.getElementById('veiculoModelo').value = v.modelo; 
    document.getElementById('veiculoAno').value = v.ano; 
    document.getElementById('veiculoRenavam').value = v.renavam || ''; 
    document.getElementById('veiculoChassi').value = v.chassi || ''; 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="veiculos"]').click(); 
};

window.preencherFormularioContratante = function(cnpj) { 
    var c = buscarContratantePorCnpj(cnpj); if (!c) return; 
    document.getElementById('contratanteCNPJ').value = c.cnpj; 
    document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; 
    document.getElementById('contratanteTelefone').value = c.telefone; 
    document.querySelector('[data-page="cadastros"]').click(); 
    document.querySelector('[data-tab="contratantes"]').click(); 
};

window.preencherFormularioOperacao = function(id) { 
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return; 
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
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'); 
    document.querySelector('[data-page="operacoes"]').click(); 
};

function renderizarTabelaVeiculos() { 
    var tbody = document.querySelector('#tabelaVeiculos tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_VEICULOS.forEach(v => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

function renderizarTabelaContratantes() { 
    var tbody = document.querySelector('#tabelaContratantes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_CONTRATANTES.forEach(c => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

function renderizarTabelaAtividades() { 
    var tbody = document.querySelector('#tabelaAtividades tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        CACHE_ATIVIDADES.forEach(a => { 
            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// TABELA DE HISTÓRICO DE OPERAÇÕES (BOTÕES: VISUALIZAR, EDITAR, EXCLUIR)
function renderizarTabelaOperacoes() { 
    var tbody = document.querySelector('#tabelaOperacoes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        var lista = CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)); 
        
        lista.forEach(op => { 
            if(op.status==='CANCELADA') return; 
            var m = buscarFuncionarioPorId(op.motoristaId)?.nome || 'Excluído'; 
            
            // Botões de Ação Atualizados
            var btns = window.MODO_APENAS_LEITURA ? '' : `
                <button class="btn-mini btn-info" onclick="visualizarOperacao('${op.id}')" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            `;

            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td>${btns}</td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// MODAL DE VISUALIZAÇÃO DE OPERAÇÃO (COM CÁLCULO REAL)
// =============================================================================
// ATUALIZAÇÃO: MODAL DE VISUALIZAÇÃO (ADMIN) COM CHECK-IN E CUSTO REAL
// =============================================================================

// =============================================================================
// ATUALIZAÇÃO: VISUALIZAR OPERAÇÃO COM DADOS DE KM E HORÁRIOS (CHECK-IN)
// =============================================================================

window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'Não encontrado';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Não encontrado';
    var servico = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    
    // --- LÓGICA DE FORMATAÇÃO DO CHECK-IN E HORÁRIOS ---
    var horaInicial = '-';
    var horaFinal = '-';

    function formatarStatusCheckin(valor, isFalta) {
        if (isFalta) return '<span style="color:red; font-weight:bold;">FALTA REGISTRADA</span>';
        if (!valor) return '<span style="color:#999; font-style:italic;">Pendente</span>';
        if (valor === true) return '<span style="color:green;">Confirmado (Legado)</span>';
        
        if (typeof valor === 'string' && valor.includes('T')) {
            var dataObj = new Date(valor);
            var dataF = dataObj.toLocaleDateString('pt-BR');
            var horaF = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> ${dataF} às ${horaF}</span>`;
        }
        return valor;
    }

    // Extração de Horários para o Painel de KM
    if (op.checkins && op.checkins.motorista && typeof op.checkins.motorista === 'string' && op.checkins.motorista.includes('T')) {
        let d = new Date(op.checkins.motorista);
        horaInicial = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // Tenta obter hora final (Se existir no check-in ou se foi salvo separadamente)
    // Nota: O check-in deve salvar 'checkins.fim' ou similar para aparecer aqui. 
    // Se não houver, tentamos pegar da data da operação se estiver finalizada, ou mantemos '-'
    if (op.checkins && op.checkins.fim && typeof op.checkins.fim === 'string') {
        let d = new Date(op.checkins.fim);
        horaFinal = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    var checkinMotData = (op.checkins && op.checkins.motorista) ? op.checkins.motorista : null;
    var faltaMot = (op.checkins && op.checkins.faltaMotorista);
    var textoCheckinMot = formatarStatusCheckin(checkinMotData, faltaMot);

    // Lista de Ajudantes
    var htmlAjudantes = '<span style="color:#888;">Nenhum ajudante.</span>';
    if (op.ajudantes && op.ajudantes.length > 0) {
        htmlAjudantes = '<ul style="margin:5px 0 0 0; padding:0; list-style:none;">' + 
            op.ajudantes.map(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                var checkAj = (op.checkins && op.checkins.ajudantes) ? op.checkins.ajudantes[aj.id] : null;
                var faltaAj = (op.checkins && op.checkins.faltas) ? op.checkins.faltas[aj.id] : false;
                return `
                    <li style="padding:4px 0; border-bottom:1px dashed #eee;">
                        <div><strong>${f ? f.nome : 'Excluído'}</strong> <small>(Diária: ${formatarValorMoeda(aj.diaria)})</small></div>
                        <div style="font-size:0.8rem;">Status: ${formatarStatusCheckin(checkAj, faltaAj)}</div>
                    </li>`;
            }).join('') + '</ul>';
    }

    // --- CÁLCULOS FINANCEIROS ---
    var custoComb = window.calcularCustoCombustivelOperacao(op);
    var custoTotal = (Number(op.despesas)||0) + custoComb;
    
    if (!faltaMot) custoTotal += (Number(op.comissao)||0);
    if(op.ajudantes) {
        op.ajudantes.forEach(aj => { 
            if(!(op.checkins?.faltas?.[aj.id])) custoTotal += (Number(aj.diaria)||0); 
        });
    }
    
    var lucro = (Number(op.faturamento)||0) - custoTotal;

    // --- RENDERIZAÇÃO DO MODAL ---
    var html = `
        <div style="font-size: 0.9rem; color:#333;">
            <div style="background:#f8f9fa; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid var(--primary-color);">
                <div style="display:flex; justify-content:space-between;">
                    <h3 style="margin:0 0 5px 0; color:var(--primary-color);">OPERAÇÃO #${op.id.substr(-4)}</h3>
                    <span style="background:#eee; padding:2px 8px; border-radius:4px; font-size:0.8rem;">${op.status}</span>
                </div>
                <p><strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                <p><strong>CLIENTE:</strong> ${cliente}</p>
                <p><strong>SERVIÇO:</strong> ${servico}</p>
            </div>

            <div style="background:#e8f5e9; padding:10px; border-radius:6px; margin-bottom:15px; border:1px solid #c8e6c9;">
                <h4 style="margin:0 0 10px 0; color:#2e7d32; font-size:0.85rem; border-bottom:1px solid #a5d6a7; padding-bottom:5px;">
                    <i class="fas fa-tachometer-alt"></i> DADOS DE RODAGEM (CHECK-IN)
                </h4>
                <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:5px; text-align:center; font-size:0.8rem;">
                    <div><small style="color:#555;">H. INICIAL</small><br><strong>${horaInicial}</strong></div>
                    <div><small style="color:#555;">KM INICIAL</small><br><strong>${op.kmInicial || '-'}</strong></div>
                    <div><small style="color:#555;">KM FINAL</small><br><strong>${op.kmFinal || '-'}</strong></div>
                    <div><small style="color:#555;">KM RODADO</small><br><strong style="color:var(--primary-color);">${op.kmRodado || '-'}</strong></div>
                    <div><small style="color:#555;">H. FINAL</small><br><strong>${horaFinal}</strong></div>
                </div>
            </div>

            <div style="margin-bottom:15px; display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div>
                    <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px; color:#555;">EQUIPE & STATUS</h4>
                    <div style="margin-bottom:10px;">
                        <small style="display:block; color:#888;">VEÍCULO</small>
                        <strong>${op.veiculoPlaca}</strong>
                    </div>
                    <div style="margin-bottom:10px;">
                        <small style="display:block; color:#888;">MOTORISTA</small>
                        <strong>${nomeMot}</strong><br>
                        <small>${textoCheckinMot}</small>
                    </div>
                    <div>
                        <small style="display:block; color:#888;">AJUDANTES</small>
                        ${htmlAjudantes}
                    </div>
                </div>

                <div>
                    <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px; color:#555;">FINANCEIRO DA OPERAÇÃO</h4>
                    <div style="background:#fff; border:1px solid #ddd; padding:10px; border-radius:6px; margin-bottom:10px;">
                        <h4 style="margin:0 0 5px 0; color:var(--success-color);">RECEITA</h4>
                        <p style="font-size:1.1rem; font-weight:bold; margin:0;">${formatarValorMoeda(op.faturamento)}</p>
                        ${op.adiantamento > 0 ? `<small style="color:#d32f2f;">(Adiantamento: ${formatarValorMoeda(op.adiantamento)})</small>` : ''}
                    </div>
                    <div style="background:#fff; border:1px solid #ddd; padding:10px; border-radius:6px;">
                        <h4 style="margin:0 0 5px 0; color:var(--danger-color);">CUSTOS REAIS</h4>
                        <div style="font-size:0.85rem;">
                            <div style="display:flex; justify-content:space-between;"><span>Combustível (Prop.):</span> <strong>${formatarValorMoeda(custoComb)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Despesas:</span> <strong>${formatarValorMoeda(op.despesas)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Pessoal:</span> <strong>${formatarValorMoeda(custoTotal - custoComb - (Number(op.despesas)||0))}</strong></div>
                        </div>
                        <hr style="margin:5px 0; border-color:#eee;">
                        <p style="text-align:right; margin:0;"><strong>TOTAL: ${formatarValorMoeda(custoTotal)}</strong></p>
                    </div>
                </div>
            </div>
            
            <div style="background:#e3f2fd; padding:15px; border-radius:6px; text-align:center; margin-top:10px;">
                <small style="text-transform:uppercase; color:#1565c0; font-weight:bold;">Lucro Líquido Real</small><br>
                <strong style="font-size:1.5rem; color:${lucro>=0?'#007bff':'red'}">${formatarValorMoeda(lucro)}</strong>
                <br>
                <small style="color:#666;">(Baseado na média Km/L histórica do veículo)</small>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'flex';
};

function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };
// =============================================================================
// PARTE 4: GESTÃO DE EQUIPE, RELATÓRIOS E RECIBOS
// =============================================================================

// -----------------------------------------------------------------------------
// 11. PAINEL DE EQUIPE E SOLICITAÇÕES (COM ALTERAÇÃO: BOTÃO REJEITAR)
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = function() {
    // 1. Renderiza Lista de Funcionários Ativos (Com Status de Bloqueio)
    var grid = document.getElementById('gridEquipe');
    if (grid) {
        grid.innerHTML = '';
        
        CACHE_FUNCIONARIOS.forEach(f => {
            // Verifica se está bloqueado no Auth (Propriedade isBlocked salva no Firestore)
            var isBlocked = f.isBlocked === true;
            
            var card = document.createElement('div');
            card.className = 'team-card';
            card.style.borderLeft = isBlocked ? '4px solid var(--danger-color)' : '4px solid var(--success-color)';
            
            var btnBloqueioLabel = isBlocked ? 'DESBLOQUEAR' : 'BLOQUEAR';
            var btnBloqueioClass = isBlocked ? 'btn-success' : 'btn-danger';
            var btnBloqueioIcon = isBlocked ? 'fa-unlock' : 'fa-ban';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <strong>${f.nome}</strong><br>
                        <small>${f.funcao.toUpperCase()}</small><br>
                        <small style="color:#666;">${f.email || 'Sem e-mail'}</small>
                    </div>
                    ${isBlocked ? '<span class="status-pill pill-blocked">BLOQUEADO</span>' : '<span class="status-pill pill-active">ATIVO</span>'}
                </div>
                <div style="margin-top:10px; display:flex; gap:5px;">
                    <button class="btn-mini btn-info" onclick="resetarSenhaFuncionario('${f.id}', '${f.email}')" title="Redefinir Senha"><i class="fas fa-key"></i></button>
                    <button class="btn-mini ${btnBloqueioClass}" onclick="alternarBloqueioFuncionario('${f.id}', ${!isBlocked})">
                        <i class="fas ${btnBloqueioIcon}"></i> ${btnBloqueioLabel}
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // 2. Renderiza Tabela de Solicitações Pendentes (ATUALIZADO COM REJEIÇÃO)
    var tbodyReq = document.querySelector('#tabelaRequests tbody');
    if (tbodyReq) {
        tbodyReq.innerHTML = '';
        
        if (CACHE_PROFILE_REQUESTS.length === 0) {
            tbodyReq.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        } else {
            CACHE_PROFILE_REQUESTS.forEach(req => {
                var tr = document.createElement('tr');
                
                // Botões de Ação: Aprovar e Rejeitar
                var actions = `
                    <div style="display:flex; gap:5px;">
                        <button class="btn-mini btn-success" onclick="aprovarSolicitacao('${req.id}')" title="Aprovar Cadastro">
                            <i class="fas fa-check"></i> APROVAR
                        </button>
                        <button class="btn-mini btn-danger" onclick="rejeitarSolicitacao('${req.id}')" title="Rejeitar Solicitação">
                            <i class="fas fa-times"></i> REJEITAR
                        </button>
                    </div>
                `;
                
                tr.innerHTML = `
                    <td>${req.nome}</td>
                    <td>${req.email}</td>
                    <td>${req.role || 'Funcionário'}</td>
                    <td>${actions}</td>
                `;
                tbodyReq.appendChild(tr);
            });
        }
    }
};

// --- FUNÇÕES DE GERENCIAMENTO DE ACESSO ---

window.alternarBloqueioFuncionario = async function(uid, bloquear) {
    if (!confirm(bloquear ? "Bloquear acesso deste usuário ao sistema?" : "Liberar acesso deste usuário?")) return;

    try {
        // Atualiza no Firestore
        if (window.dbRef) {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                isBlocked: bloquear
            });
        }

        // Atualiza Localmente
        var func = CACHE_FUNCIONARIOS.find(f => f.id === uid);
        if (func) {
            func.isBlocked = bloquear;
            await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        }

        renderizarPainelEquipe();
        alert(bloquear ? "Usuário Bloqueado." : "Usuário Desbloqueado.");

    } catch (e) {
        console.error(e);
        alert("Erro ao atualizar status: " + e.message);
    }
};

window.resetarSenhaFuncionario = async function(uid, email) {
    if (!email || email.length < 5) return alert("Este funcionário não possui e-mail válido para reset.");
    
    if (!confirm(`Enviar e-mail de redefinição de senha para ${email}?`)) return;

    try {
        if (window.dbRef && window.dbRef.sendReset) {
            await window.dbRef.sendReset(email);
            alert("Link de redefinição enviado para o e-mail do funcionário.");
        } else {
            alert("Funcionalidade indisponível offline.");
        }
    } catch (e) {
        alert("Erro: " + e.message);
    }
};

window.aprovarSolicitacao = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if (!req) return;

    if (!confirm(`Aprovar entrada de "${req.nome}" na equipe?`)) return;

    try {
        // 1. Cria o registro oficial em CACHE_FUNCIONARIOS
        var novoFunc = {
            id: req.uid, // O ID do funcionário será o UID do Auth que veio na request
            nome: req.nome.toUpperCase(),
            email: req.email,
            funcao: req.role || 'funcionario',
            telefone: '',
            isBlocked: false,
            admitidoEm: new Date().toISOString()
        };

        CACHE_FUNCIONARIOS.push(novoFunc);
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);

        // 2. Atualiza o status no Firestore (collection 'users') para approved: true
        if (window.dbRef) {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", req.uid), {
                approved: true,
                company: window.USUARIO_ATUAL.company
            });
            
            // 3. Remove da lista de solicitações (deleteDoc na subcoleção profile_requests)
            // Nota: Se a arquitetura usa subcoleção, deletamos. Se usa flag, atualizamos.
            // Assumindo lista separada baseada na lógica de "Requests":
            await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, 'companies', window.USUARIO_ATUAL.company, 'data', CHAVE_DB_PROFILE_REQUESTS, 'items', reqId)); // Lógica simulada, mas abaixo removemos do cache local que sobrescreve
        }

        // 4. Remove do Cache de Requests e Salva
        var novaListaReq = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
        await salvarProfileRequests(novaListaReq);

        renderizarPainelEquipe();
        renderizarTabelaFuncionarios();
        alert("Funcionário aprovado com sucesso!");

    } catch (e) {
        console.error(e);
        // Fallback local se der erro no firebase específico
        var novaListaReq = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
        await salvarProfileRequests(novaListaReq);
        renderizarPainelEquipe();
    }
};

// =============================================================================
// NOVA FUNÇÃO: REJEITAR SOLICITAÇÃO
// =============================================================================
window.rejeitarSolicitacao = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if (!req) return;

    if (!confirm(`Rejeitar a solicitação de "${req.nome}"?\n\nIsso removerá o pedido da lista.`)) return;

    try {
        // 1. Remove do Firestore (Se possível, deleta o usuário criado ou apenas nega o vinculo)
        // Por segurança, apenas removemos o convite/solicitação da empresa.
        
        // 2. Remove do Cache Local
        var novaListaReq = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
        await salvarProfileRequests(novaListaReq);

        renderizarPainelEquipe();
        alert("Solicitação rejeitada.");

    } catch (e) {
        console.error(e);
        alert("Erro ao rejeitar: " + e.message);
    }
};

// -----------------------------------------------------------------------------
// 12. GERAÇÃO DE RELATÓRIOS (PDF)
// -----------------------------------------------------------------------------

window.gerarRelatorioPDF = function() {
    var tipo = document.getElementById('tipoRelatorio').value;
    var dtInicio = document.getElementById('relatorioDataInicio').value;
    var dtFim = document.getElementById('relatorioDataFim').value;

    if (!dtInicio || !dtFim) return alert("Selecione o período.");

    var dInicio = new Date(dtInicio + 'T00:00:00');
    var dFim = new Date(dtFim + 'T23:59:59');

    // Filtros Opcionais
    var fMot = document.getElementById('selectMotoristaRelatorio').value;
    var fVei = document.getElementById('selectVeiculoRelatorio').value;
    var fCli = document.getElementById('selectContratanteRelatorio').value;
    var fAtv = document.getElementById('selectAtividadeRelatorio').value;

    var dadosFiltrados = CACHE_OPERACOES.filter(op => {
        if (op.status === 'CANCELADA') return false;
        var dOp = new Date(op.data + 'T12:00:00');
        
        var periodoOk = (dOp >= dInicio && dOp <= dFim);
        if (!periodoOk) return false;

        if (fMot && op.motoristaId !== fMot) return false;
        if (fVei && op.veiculoPlaca !== fVei) return false;
        if (fCli && op.contratanteCNPJ !== fCli) return false;
        if (fAtv && op.atividadeId !== fAtv) return false;

        return true;
    });

    if (dadosFiltrados.length === 0) return alert("Nenhum dado encontrado para este filtro.");

    // Montagem do HTML para PDF
    var conteudo = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="text-align:center; margin-bottom:20px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h2 style="margin:0;">LOGIMASTER - RELATÓRIO OPERACIONAL</h2>
                <p style="margin:5px 0;">Período: ${formatarDataParaBrasileiro(dtInicio)} a ${formatarDataParaBrasileiro(dtFim)}</p>
                <small>Gerado em: ${new Date().toLocaleString()}</small>
            </div>
            
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead>
                    <tr style="background-color:#eee;">
                        <th style="border:1px solid #999; padding:5px;">DATA</th>
                        <th style="border:1px solid #999; padding:5px;">VEÍCULO</th>
                        <th style="border:1px solid #999; padding:5px;">MOTORISTA</th>
                        <th style="border:1px solid #999; padding:5px;">CLIENTE</th>
                        <th style="border:1px solid #999; padding:5px;">FATURAMENTO</th>
                        <th style="border:1px solid #999; padding:5px;">CUSTOS (EST.)</th>
                        <th style="border:1px solid #999; padding:5px;">LUCRO</th>
                    </tr>
                </thead>
                <tbody>
    `;

    var tFat = 0, tCust = 0, tLuc = 0;

    dadosFiltrados.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        
        var fat = Number(op.faturamento)||0;
        
        // Custo Combustível Real
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        
        var custoOp = (Number(op.despesas)||0) + custoComb + (Number(op.comissao)||0);
        
        // Soma Ajudantes
        if(op.ajudantes) {
             op.ajudantes.forEach(aj => { 
                 if(!op.checkins?.faltas?.[aj.id]) custoOp += (Number(aj.diaria)||0);
             });
        }

        var luc = fat - custoOp;

        tFat += fat; tCust += custoOp; tLuc += luc;

        conteudo += `
            <tr>
                <td style="border:1px solid #ddd; padding:4px;">${formatarDataParaBrasileiro(op.data)}</td>
                <td style="border:1px solid #ddd; padding:4px;">${op.veiculoPlaca}</td>
                <td style="border:1px solid #ddd; padding:4px;">${mot}</td>
                <td style="border:1px solid #ddd; padding:4px;">${cli}</td>
                <td style="border:1px solid #ddd; padding:4px;">${formatarValorMoeda(fat)}</td>
                <td style="border:1px solid #ddd; padding:4px;">${formatarValorMoeda(custoOp)}</td>
                <td style="border:1px solid #ddd; padding:4px;">${formatarValorMoeda(luc)}</td>
            </tr>
        `;
    });

    conteudo += `
                </tbody>
                <tfoot>
                    <tr style="background-color:#eee; font-weight:bold;">
                        <td colspan="4" style="border:1px solid #999; padding:5px; text-align:right;">TOTAIS:</td>
                        <td style="border:1px solid #999; padding:5px;">${formatarValorMoeda(tFat)}</td>
                        <td style="border:1px solid #999; padding:5px;">${formatarValorMoeda(tCust)}</td>
                        <td style="border:1px solid #999; padding:5px;">${formatarValorMoeda(tLuc)}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div style="margin-top:30px; font-size:11px; color:#666; text-align:center;">
                Sistema LOGIMASTER - Gestão Inteligente
            </div>
        </div>
    `;

    var opt = {
        margin: 10,
        filename: `relatorio_${new Date().getTime()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(conteudo).save();
};

// -----------------------------------------------------------------------------
// 13. EMISSÃO DE RECIBOS
// -----------------------------------------------------------------------------

window.gerarReciboPDF = function() {
    var beneficiarioId = document.getElementById('selectMotoristaRecibo').value;
    var dataRecibo = document.getElementById('reciboData').value;
    var valorRecibo = document.getElementById('reciboValor').value;
    var descricaoRecibo = document.getElementById('reciboDescricao').value;

    if (!beneficiarioId || !valorRecibo) return alert("Preencha o beneficiário e o valor.");

    var func = buscarFuncionarioPorId(beneficiarioId);
    var nomeBeneficiario = func ? func.nome : "BENEFICIÁRIO AVULSO";
    var docBeneficiario = func ? func.documento : "";

    // Salva no histórico
    var novoRecibo = {
        id: Date.now().toString(),
        data: dataRecibo || new Date().toISOString().split('T')[0],
        beneficiario: nomeBeneficiario,
        valor: valorRecibo,
        descricao: descricaoRecibo
    };
    
    var lista = CACHE_RECIBOS || [];
    lista.push(novoRecibo);
    salvarListaRecibos(lista);

    // Gera PDF
    var conteudo = `
        <div style="font-family: 'Courier New', Courier, monospace; padding: 40px; border: 2px solid #000; width: 100%; max-width:800px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:30px;">
                <h1 style="margin:0;">RECIBO DE PAGAMENTO</h1>
                <p style="margin:5px 0;">${CACHE_MINHA_EMPRESA.razaoSocial || 'MINHA EMPRESA DE LOGÍSTICA'}</p>
                <p style="font-size:12px;">CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '00.000.000/0000-00'}</p>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; background:#eee; padding:10px;">
                <h2 style="margin:0;">VALOR: ${formatarValorMoeda(valorRecibo)}</h2>
                <span>Nº ${novoRecibo.id.substr(-6)}</span>
            </div>

            <p style="line-height:1.6; font-size:14px; margin-bottom:30px;">
                Recebi(emos) de <strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'A EMPRESA'}</strong> 
                a importância de <strong>${formatarValorMoeda(valorRecibo)}</strong>, 
                referente a:
                <br><br>
                <em>${descricaoRecibo || 'SERVIÇOS PRESTADOS'}</em>
            </p>

            <p style="margin-bottom:50px;">
                Para clareza, firmo(amos) o presente.
            </p>

            <div style="text-align:center; margin-top:50px;">
                <p style="margin-bottom:0;">_________________________________________________</p>
                <p style="margin-top:5px;"><strong>${nomeBeneficiario}</strong></p>
                <p style="font-size:12px;">CPF/CNPJ: ${docBeneficiario || 'Não informado'}</p>
            </div>

            <div style="text-align:right; margin-top:50px; font-size:12px;">
                ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </div>
    `;

    var opt = {
        margin: 10,
        filename: `recibo_${nomeBeneficiario.split(' ')[0]}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(conteudo).save();
    
    // Limpa form
    document.getElementById('reciboValor').value = '';
    document.getElementById('reciboDescricao').value = '';
};
// =============================================================================
// PARTE 5: PAINEL SUPER ADMIN, NAVEGAÇÃO E INICIALIZAÇÃO (FINAL)
// =============================================================================

// -----------------------------------------------------------------------------
// 14. PAINEL SUPER ADMIN (CONTROLE SaaS)
// -----------------------------------------------------------------------------

window.renderizarPainelMaster = function() {
    // Verifica se é admin mestre
    if (!EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email)) return;

    // Atualiza status visual
    var statusDiv = document.getElementById('systemStatusDisplay');
    var validade = window.SYSTEM_STATUS.validade;
    var isVitalicio = window.SYSTEM_STATUS.isVitalicio;
    
    var textoValidade = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade) : "INDEFINIDO");
    var classeStatus = window.SYSTEM_STATUS.bloqueado ? "status-bloqueado" : "status-ativo";
    var textoStatus = window.SYSTEM_STATUS.bloqueado ? "BLOQUEADO" : "ATIVO";

    if (statusDiv) {
        statusDiv.innerHTML = `
            <div class="status-box ${classeStatus}">
                <span>STATUS: ${textoStatus}</span>
            </div>
            <div class="status-box">
                <span>VENCIMENTO: ${textoValidade}</span>
            </div>
        `;
    }

    // Preenche formulário com dados atuais
    document.getElementById('adminMasterValidade').value = validade || '';
    document.getElementById('adminMasterBloqueado').checked = window.SYSTEM_STATUS.bloqueado;
    document.getElementById('adminMasterVitalicio').checked = isVitalicio;
};

// Salvar Configurações do Sistema (Apenas Mestre)
document.getElementById('formAdminMaster')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email)) {
        return alert("Acesso negado.");
    }

    var novaValidade = document.getElementById('adminMasterValidade').value;
    var isBloqueado = document.getElementById('adminMasterBloqueado').checked;
    var isVitalicio = document.getElementById('adminMasterVitalicio').checked;

    var config = {
        validade: novaValidade,
        bloqueado: isBloqueado,
        isVitalicio: isVitalicio,
        updatedAt: new Date().toISOString(),
        updatedBy: window.USUARIO_ATUAL.email
    };

    try {
        if (window.dbRef) {
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, 'companies', window.USUARIO_ATUAL.company, 'config', 'license'), config);
        }
        
        // Atualiza local
        window.SYSTEM_STATUS = config;
        localStorage.setItem('sys_config', JSON.stringify(config));
        
        alert("Configurações do Sistema Atualizadas!");
        renderizarPainelMaster();
        verificarStatusSistema(); // Reaplica regras de bloqueio se necessário

    } catch (erro) {
        alert("Erro ao salvar config: " + erro.message);
    }
});

// Verifica se o sistema está operante ou vencido
window.verificarStatusSistema = async function() {
    // 1. Tenta buscar config online
    if (window.dbRef && window.USUARIO_ATUAL.company) {
        try {
            const docSnap = await window.dbRef.getDoc(window.dbRef.doc(window.dbRef.db, 'companies', window.USUARIO_ATUAL.company, 'config', 'license'));
            if (docSnap.exists()) {
                window.SYSTEM_STATUS = docSnap.data();
                localStorage.setItem('sys_config', JSON.stringify(window.SYSTEM_STATUS));
            }
        } catch (e) {
            console.warn("Offline: Usando config de licença local.");
            var localConf = localStorage.getItem('sys_config');
            if (localConf) window.SYSTEM_STATUS = JSON.parse(localConf);
        }
    }

    // 2. Lógica de Bloqueio
    var hoje = new Date().toISOString().split('T')[0];
    var vencido = false;

    if (!window.SYSTEM_STATUS.isVitalicio && window.SYSTEM_STATUS.validade) {
        if (window.SYSTEM_STATUS.validade < hoje) {
            vencido = true;
        }
    }

    if (window.SYSTEM_STATUS.bloqueado || vencido) {
        // Se for admin mestre, avisa mas deixa entrar para corrigir
        if (EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email)) {
            alert("AVISO DE SISTEMA:\n\nA licença expirou ou está bloqueada via painel.\nComo Super Admin, você tem acesso para renovar.");
        } else {
            // Bloqueio total para usuários comuns
            document.body.innerHTML = `
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; background:#222; color:white; flex-direction:column; text-align:center;">
                    <h1 style="color:red;">SISTEMA BLOQUEADO</h1>
                    <p>A licença de uso expirou ou foi suspensa.</p>
                    <p>Entre em contato com o suporte: (11) 99999-9999</p>
                    <button onclick="window.location.reload()" style="padding:10px 20px; cursor:pointer;">Tentar Novamente</button>
                </div>
            `;
            throw new Error("Sistema Bloqueado"); // Para a execução
        }
    }
};

// -----------------------------------------------------------------------------
// 15. NAVEGAÇÃO E CONTROLE DE UI
// -----------------------------------------------------------------------------

// Controle do Menu Lateral
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        
        // Add active
        link.classList.add('active');
        const targetPage = link.getAttribute('data-page');
        document.getElementById(targetPage).classList.add('active');
        
        // Callbacks específicos de atualização de página
        if (targetPage === 'dashboard') atualizarDashboard();
        if (targetPage === 'calendario') renderizarCalendario();
        if (targetPage === 'equipe') renderizarPainelEquipe();
        if (targetPage === 'adminMaster') renderizarPainelMaster();

        // Fecha menu mobile se estiver aberto
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('active');
            document.querySelector('.overlay').classList.remove('active');
        }
    });
});

// Menu Mobile Toggle
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.overlay').classList.toggle('active');
});

document.querySelector('.overlay')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.remove('active');
    document.querySelector('.overlay').classList.remove('active');
});

// -----------------------------------------------------------------------------
// 16. INICIALIZAÇÃO DO SISTEMA
// -----------------------------------------------------------------------------

/**
 * Função chamada pelo index.html após autenticação no Firebase
 */
window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema para: " + user.email);
    window.USUARIO_ATUAL = user;
    
    // Define permissões
    var isMaster = EMAILS_MESTRES.includes(user.email);
    var isAdmin = user.role === 'admin' || user.role === 'admin_master' || isMaster;
    
    // Modo Apenas Leitura (Funcionários comuns e Motoristas)
    window.MODO_APENAS_LEITURA = !isAdmin;

    // Configura UI baseada em permissão
    if (!isAdmin) {
        // Esconde botões de exclusão/edição sensíveis via CSS
        document.body.classList.add('user-read-only');
        
        // Remove acesso a menus administrativos
        document.querySelectorAll('[data-role="admin"]').forEach(el => el.style.display = 'none');
    }
    
    if (isMaster) {
        // Mostra menu Master
        document.querySelectorAll('[data-role="master"]').forEach(el => el.style.display = 'block');
    }

    // Carrega Configurações da Empresa
    await verificarStatusSistema();

    // Sincroniza Dados
    await sincronizarDadosComFirebase();

    // Atualiza Interface Inicial
    atualizarDashboard();
    renderizarCalendario();
    preencherTodosSelects();

    // Identificação visual no menu
    var userDisplay = document.querySelector('.user-info h4');
    if (userDisplay) userDisplay.textContent = user.name || "Usuário";
    
    console.log("Sistema inicializado. Versão 5.0");
};

// -----------------------------------------------------------------------------
// 17. RESET DE FÁBRICA (LIMPEZA TOTAL)
// -----------------------------------------------------------------------------

document.getElementById('btnFactoryReset')?.addEventListener('click', async function() {
    var confirmacao = prompt("ATENÇÃO: ISSO APAGARÁ TODOS OS DADOS DA EMPRESA!\n\nPara confirmar, digite 'DELETAR TUDO':");
    
    if (confirmacao === 'DELETAR TUDO') {
        var btn = this;
        btn.innerHTML = "APAGANDO...";
        btn.disabled = true;

        try {
            // Limpa LocalStorage
            localStorage.clear();
            
            // Limpa Variáveis
            CACHE_FUNCIONARIOS = []; CACHE_VEICULOS = []; CACHE_OPERACOES = [];
            CACHE_CONTRATANTES = []; CACHE_DESPESAS = []; CACHE_RECIBOS = [];

            // Limpa Firebase
            if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
                const { db, doc, writeBatch } = window.dbRef;
                const batch = writeBatch(db);
                const companyPath = `companies/${window.USUARIO_ATUAL.company}/data`;

                const chaves = [
                    'db_funcionarios', 'db_veiculos', 'db_contratantes', 
                    'db_operacoes', 'db_despesas_gerais', 'db_atividades', 
                    'db_profile_requests', 'db_recibos'
                ];

                chaves.forEach(chave => {
                    batch.set(doc(db, companyPath, chave), { 
                        items: [], 
                        lastUpdate: new Date().toISOString(), 
                        updatedBy: window.USUARIO_ATUAL.email 
                    });
                });
                
                await batch.commit();
            }

            alert("SISTEMA RESETADO COM SUCESSO!\n\nA página será recarregada.");
            window.location.reload();

        } catch(e) {
            alert("Erro ao resetar: " + e.message);
            if(btn) btn.innerHTML = "RESETAR SISTEMA (DELETAR TUDO)";
            btn.disabled = false;
        }
    } else {
        alert("Ação cancelada. O texto de confirmação estava incorreto.");
    }
});

// Inicialização de Listeners Globais (Logout)
document.getElementById('btnLogout')?.addEventListener('click', function() {
    if (window.logoutSystem) window.logoutSystem();
});