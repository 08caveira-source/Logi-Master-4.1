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
window.calcularMediaGlobalVeiculo = function(placa) {
    // Filtra viagens válidas deste veículo
    var ops = CACHE_OPERACOES.filter(function(o) {
        var matchPlaca = (o.veiculoPlaca === placa);
        var matchStatus = (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
        return matchPlaca && matchStatus;
    });

    if (ops.length === 0) {
        return 0;
    }

    var totalKm = 0;
    var totalLitros = 0;

    // Itera sobre as operações para somar KM e Litros
    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var precoLitro = Number(op.precoLitro) || 0;
        
        // Só considera para a média se houve abastecimento real E rodagem registrada
        // Isso evita distorções com lançamentos parciais
        if (km > 0 && valorAbastecido > 0 && precoLitro > 0) {
            totalKm += km;
            totalLitros += (valorAbastecido / precoLitro);
        }
    });

    if (totalLitros > 0) {
        return totalKm / totalLitros;
    } else {
        return 0;
    }
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
            
            // Verifica se é criação de novo login (Sem ID prévio + Senha preenchida)
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                try {
                    // Tenta criar usuário no Auth
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Salva metadados do usuário
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
                    // SE O EMAIL JÁ EXISTE: Permite salvar apenas os dados cadastrais
                    if (authError.code === 'auth/email-already-in-use') {
                        var confirmar = confirm(`O e-mail "${email}" JÁ POSSUI UM LOGIN no sistema.\n\nDeseja cadastrar apenas os dados do funcionário? (O login antigo será mantido).`);
                        
                        if (!confirmar) {
                            throw new Error("Operação cancelada pelo usuário.");
                        }
                        // Segue usando o ID gerado por data, sem criar novo Auth
                    } else {
                        throw authError; // Outros erros (ex: senha fraca) param o processo
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
            
            if (senha) { 
                funcionarioObj.senhaVisual = senha; 
            }

            // Atualiza lista local (Remove anterior e adiciona novo)
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo com Sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            preencherTodosSelects();

        } catch (erro) { 
            if (erro.message !== "Operação cancelada pelo usuário.") {
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

window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'Não encontrado';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Não encontrado';
    var servico = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    
    // --- LÓGICA DE FORMATAÇÃO DO CHECK-IN ---
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

    var checkinMotData = (op.checkins && op.checkins.motorista) ? op.checkins.motorista : null;
    var faltaMot = (op.checkins && op.checkins.faltaMotorista);
    var textoCheckinMot = formatarStatusCheckin(checkinMotData, faltaMot);

    // Lista de Ajudantes com Status
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

    // --- CÁLCULO REAL (PROPORCIONAL / MÉDIA GLOBAL) ---
    // Esta função já consulta a média histórica do veículo no banco
    var custoComb = window.calcularCustoCombustivelOperacao(op);
    
    var custoTotal = (Number(op.despesas)||0) + custoComb;
    
    // Soma comissão apenas se não faltou
    if (!faltaMot) {
        custoTotal += (Number(op.comissao)||0);
    }
    
    // Soma diárias dos ajudantes que não faltaram
    if(op.ajudantes) {
        op.ajudantes.forEach(aj => { 
            if(!(op.checkins?.faltas?.[aj.id])) {
                custoTotal += (Number(aj.diaria)||0);
            }
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

            <div style="margin-bottom:15px; display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div>
                    <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px; color:#555;">EQUIPE & CHECK-IN</h4>
                    
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
                    
                    <div style="background:#e8f5e9; padding:10px; border-radius:6px; margin-bottom:10px;">
                        <h4 style="margin:0 0 5px 0; color:var(--success-color);">RECEITA</h4>
                        <p style="font-size:1.1rem; font-weight:bold; margin:0;">${formatarValorMoeda(op.faturamento)}</p>
                        ${op.adiantamento > 0 ? `<small style="color:#d32f2f;">(Adiantamento: ${formatarValorMoeda(op.adiantamento)})</small>` : ''}
                    </div>

                    <div style="background:#ffebee; padding:10px; border-radius:6px;">
                        <h4 style="margin:0 0 5px 0; color:var(--danger-color);">CUSTOS REAIS</h4>
                        <div style="font-size:0.85rem;">
                            <div style="display:flex; justify-content:space-between;"><span>Combustível (Proporcional):</span> <strong>${formatarValorMoeda(custoComb)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Despesas / Pedágios:</span> <strong>${formatarValorMoeda(op.despesas)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Comissões / Diárias:</span> <strong>${formatarValorMoeda(custoTotal - custoComb - (Number(op.despesas)||0))}</strong></div>
                        </div>
                        <hr style="margin:5px 0; border-color:rgba(0,0,0,0.1);">
                        <p style="text-align:right; margin:0;"><strong>TOTAL: ${formatarValorMoeda(custoTotal)}</strong></p>
                    </div>
                </div>
            </div>
            
            <div style="background:#e3f2fd; padding:15px; border-radius:6px; text-align:center; margin-top:10px;">
                <small style="text-transform:uppercase; color:#1565c0; font-weight:bold;">Lucro Líquido Real</small><br>
                <strong style="font-size:1.5rem; color:${lucro>=0?'#007bff':'red'}">${formatarValorMoeda(lucro)}</strong>
                <br>
                <small style="color:#666;">(Considerando a média km/l do veículo e não o abastecimento cheio)</small>
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
// PARTE 4: MONITORAMENTO, EQUIPE, RELATÓRIOS E RECIBOS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. MONITORAMENTO DE ROTAS (DASHBOARD OPERACIONAL)
// -----------------------------------------------------------------------------

/**
 * Renderiza a tabela de viagens em andamento ou agendadas.
 * Permite ao admin ver quem está na rua e registrar faltas.
 */
window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    
    // Proteção se a tabela não existir na tela atual
    if (!tbody) {
        return;
    }
    
    tbody.innerHTML = '';

    // Filtra apenas viagens Agendadas ou Em Andamento
    // Remove canceladas e finalizadas desta visualização
    var pendentes = CACHE_OPERACOES.filter(function(op) {
        var isAgendada = (op.status === 'AGENDADA');
        var isAndamento = (op.status === 'EM_ANDAMENTO');
        return isAgendada || isAndamento;
    });

    // Ordena por data (mais antigas primeiro)
    pendentes.sort(function(a, b) {
        return new Date(a.data) - new Date(b.data);
    });

    // Atualiza contador no menu lateral (Badge Vermelho)
    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        if (pendentes.length > 0) {
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    // Se não houver rotas, exibe mensagem
    if (pendentes.length === 0) {
        var trVazia = document.createElement('tr');
        trVazia.innerHTML = '<td colspan="6" style="text-align:center; padding:20px; color:#666;">Nenhuma rota ativa ou agendada no momento.</td>';
        tbody.appendChild(trVazia);
        return;
    }

    // Itera sobre as operações pendentes para criar as linhas da tabela
    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCliente = cliente ? cliente.razaoSocial : 'CLIENTE NÃO ENCONTRADO';
        
        // Define o HTML do Status Visual (Pílula)
        var statusHtml = '';
        if (op.status === 'EM_ANDAMENTO') {
            statusHtml = '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>';
        } else {
            statusHtml = '<span class="status-pill pill-pending">AGENDADA</span>';
        }

        // --- 1. Linha do Motorista Principal ---
        var mot = buscarFuncionarioPorId(op.motoristaId);
        
        if (mot) {
            // Verifica status de presença/falta
            var faltouMot = (op.checkins && op.checkins.faltaMotorista);
            var checkInFeito = (op.checkins && op.checkins.motorista); 
            
            var statusEquipe = '';
            
            if (faltouMot) {
                statusEquipe = '<span style="color:red; font-weight:bold;">FALTA REGISTRADA</span>';
            } else if (checkInFeito) {
                statusEquipe = '<span style="color:green"><i class="fas fa-check"></i> INICIADO</span>';
            } else {
                statusEquipe = '<span style="color:#999">AGUARDANDO INÍCIO</span>';
            }

            // Botão de Falta (Só aparece se não tiver falta registrada)
            var btnFaltaMot = '';
            if (faltouMot) {
                btnFaltaMot = '-';
            } else {
                btnFaltaMot = `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${mot.id}', 'motorista')">LANÇAR FALTA</button>`;
            }

            // Formatação do nome (riscado se faltou)
            var nomeDisplay = mot.nome;
            if (faltouMot) {
                nomeDisplay = `<s style="color:#999;">${mot.nome}</s>`;
            } else {
                nomeDisplay = `<strong>${mot.nome}</strong> <small>(Motorista)</small>`;
            }

            var trM = document.createElement('tr');
            trM.innerHTML = `
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>
                    ${nomeDisplay}
                    <br>
                    <small style="color:#666;"><i class="fas fa-truck"></i> ${op.veiculoPlaca}</small>
                </td>
                <td>${nomeCliente}</td>
                <td>${statusHtml}</td>
                <td>${statusEquipe}</td>
                <td>${btnFaltaMot}</td>
            `;
            tbody.appendChild(trM);
        }

        // --- 2. Linhas dos Ajudantes (Vinculados à mesma operação) ---
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(function(ajItem) {
                var aj = buscarFuncionarioPorId(ajItem.id);
                
                if (aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = '';
                    
                    if (faltouAj) {
                        btnFaltaAj = '-';
                    } else {
                        btnFaltaAj = `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${aj.id}', 'ajudante')">LANÇAR FALTA</button>`;
                    }
                    
                    var nomeAjDisplay = aj.nome;
                    if (faltouAj) {
                        nomeAjDisplay = `<s style="color:#999;">${aj.nome}</s>`;
                    } else {
                        nomeAjDisplay = `${aj.nome} <small>(Ajudante)</small>`;
                    }

                    var trA = document.createElement('tr');
                    trA.style.background = "#f9f9f9"; // Fundo levemente diferente para diferenciar
                    trA.innerHTML = `
                        <td style="border:none;"></td> <td style="padding-left: 20px;">
                            <i class="fas fa-level-up-alt fa-rotate-90" style="margin-right:5px; color:#ccc;"></i> 
                            ${nomeAjDisplay}
                        </td>
                        <td style="color:#777; font-size:0.8rem;">^ Vinculado à rota acima</td>
                        <td>${statusHtml}</td>
                        <td>${faltouAj ? '<span style="color:red; font-weight:bold;">FALTA</span>' : '-'}</td>
                        <td>${btnFaltaAj}</td>
                    `;
                    tbody.appendChild(trA);
                }
            });
        }
    });
};

/**
 * Registra a falta de um funcionário em uma operação específica.
 * Isso remove o custo da diária/comissão do cálculo financeiro.
 */
window.registrarFalta = async function(opId, funcId, tipo) {
    if (!confirm("ATENÇÃO: Confirmar FALTA para este funcionário?\n\nO valor da diária/comissão será removido do cálculo desta operação.")) {
        return;
    }
    
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    // Inicializa estrutura de checkins se não existir
    if (!op.checkins) {
        op.checkins = { 
            motorista: false, 
            faltaMotorista: false, 
            faltas: {} 
        };
    }
    
    if (!op.checkins.faltas) {
        op.checkins.faltas = {};
    }

    if (tipo === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; // Remove presença se tiver
    } else {
        op.checkins.faltas[funcId] = true;
    }
    
    // Salva e atualiza a interface
    await salvarListaOperacoes(CACHE_OPERACOES);
    
    renderizarTabelaMonitoramento();
    renderizarTabelaFaltas();
    atualizarDashboard(); 
    
    alert("Falta registrada com sucesso.");
};

/**
 * Renderiza o histórico de faltas na aba de Monitoramento.
 */
window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;
        
        // Faltas de Motoristas
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) {
                var tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td style="color:var(--danger-color); font-weight:bold;">${m.nome}</td>
                    <td>MOTORISTA</td>
                    <td><span class="status-pill pill-blocked">FALTA</span></td>
                    <td>-</td>
                `;
                tbody.appendChild(tr);
            }
        }
        
        // Faltas de Ajudantes
        if (op.checkins.faltas) {
            Object.keys(op.checkins.faltas).forEach(k => {
                if(op.checkins.faltas[k]) {
                    var a = buscarFuncionarioPorId(k);
                    if(a) {
                        var tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${formatarDataParaBrasileiro(op.data)}</td>
                            <td style="color:var(--danger-color); font-weight:bold;">${a.nome}</td>
                            <td>AJUDANTE</td>
                            <td><span class="status-pill pill-blocked">FALTA</span></td>
                            <td>-</td>
                        `;
                        tbody.appendChild(tr);
                    }
                }
            });
        }
    });
};

// -----------------------------------------------------------------------------
// 2. GESTÃO DE EQUIPE (BOTÕES PERSONALIZADOS: BLOQUEAR E STATUS)
// -----------------------------------------------------------------------------

window.renderizarPainelEquipe = async function() {
    // 1. Tabela de Funcionários Ativos
    var tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '';
        
        if (CACHE_FUNCIONARIOS.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
        } else {
            CACHE_FUNCIONARIOS.forEach(f => {
                var tr = document.createElement('tr');
                
                var isBlocked = f.isBlocked || false;
                
                // Botões Exclusivos Solicitados: Bloquear e Status
                // (Sem Editar/Excluir aqui, pois já existem na aba Cadastros)
                
                var btnBloquear = '';
                if (isBlocked) {
                    btnBloquear = `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR ACESSO"><i class="fas fa-lock"></i></button>`;
                } else {
                    btnBloquear = `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR ACESSO"><i class="fas fa-unlock"></i></button>`;
                }

                var btnStatus = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="VER STATUS DETALHADO"><i class="fas fa-eye"></i></button>`;

                var statusTexto = isBlocked ? 
                    '<span style="color:red; font-weight:bold;">BLOQUEADO</span>' : 
                    '<span style="color:green;">ATIVO</span>';

                tr.innerHTML = `
                    <td>${f.nome}</td>
                    <td>${f.funcao.toUpperCase()}</td>
                    <td>${statusTexto}</td>
                    <td>
                        ${btnBloquear}
                        ${btnStatus}
                    </td>
                `;
                tbodyAtivos.appendChild(tr);
            });
        }
    }

    // 2. Tabela de Pendentes (Aprovação de novos cadastros feitos na tela de login)
    if (window.dbRef && window.USUARIO_ATUAL) {
        try {
            const { db, collection, query, where, getDocs } = window.dbRef;
            
            // Busca usuários não aprovados desta empresa
            const q = query(
                collection(db, "users"), 
                where("company", "==", window.USUARIO_ATUAL.company), 
                where("approved", "==", false)
            );
            
            const snap = await getDocs(q);
            var tbodyPend = document.querySelector('#tabelaCompanyPendentes tbody');
            
            if (tbodyPend) {
                tbodyPend.innerHTML = '';
                
                if (snap.empty) {
                    tbodyPend.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum cadastro pendente.</td></tr>';
                } else {
                    snap.forEach(doc => {
                        var u = doc.data();
                        var tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${u.name}</td>
                            <td>${u.email}</td>
                            <td><button class="btn-mini btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR ACESSO</button></td>
                        `;
                        tbodyPend.appendChild(tr);
                    });
                }
            }
        } catch(e) { 
            console.error("Erro ao buscar pendentes:", e); 
        }
    }
    
    // 3. Tabela de Solicitações de Alteração de Dados (Profile Requests)
    var tbodyReq = document.getElementById('tabelaProfileRequests')?.querySelector('tbody');
    if(tbodyReq) {
        tbodyReq.innerHTML = '';
        
        var pendentes = CACHE_PROFILE_REQUESTS.filter(r => r.status === 'PENDENTE');
        
        if (pendentes.length === 0) {
            tbodyReq.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação.</td></tr>';
        } else {
            pendentes.forEach(req => {
                var f = buscarFuncionarioPorId(req.funcionarioId);
                var nomeFunc = f ? f.nome : 'Desconhecido';
                
                var tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatarDataParaBrasileiro(req.data)}</td>
                    <td>${nomeFunc}</td>
                    <td>${req.campo}</td>
                    <td>${req.valorNovo}</td>
                    <td><button class="btn-mini btn-success" onclick="aprovarProfileRequest('${req.id}')">APROVAR</button></td>
                `;
                tbodyReq.appendChild(tr);
            });
        }
    }
};

// Modal de Status Detalhado do Funcionário
window.verStatusFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var container = document.getElementById('statusFuncionarioBody');
    var actions = document.getElementById('statusFuncionarioActions');
    
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Analisando rota e status...</div>';
    document.getElementById('modalStatusFuncionario').style.display = 'flex';

    // Verifica se está em alguma rota ativa (Motorista ou Ajudante)
    var emRota = false;
    var veiculoRota = "";
    var dataRota = "";
    
    var opAtiva = CACHE_OPERACOES.find(o => 
        o.status === 'EM_ANDAMENTO' && 
        (o.motoristaId === id || (o.ajudantes && o.ajudantes.some(a => a.id === id)))
    );
    
    if (opAtiva) {
        emRota = true;
        veiculoRota = opAtiva.veiculoPlaca;
        dataRota = formatarDataParaBrasileiro(opAtiva.data);
    }

    var isBlocked = f.isBlocked || false;

    // Renderiza HTML do Status
    var html = `
        <h2 style="color:var(--primary-color); margin:0 0 5px 0;">${f.nome}</h2>
        <p style="color:#666; margin-bottom:15px;">${f.funcao.toUpperCase()}</p>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; text-align:center;">
            
            <div style="background:${isBlocked ? '#ffebee' : '#e8f5e9'}; padding:15px; border-radius:8px; border:1px solid ${isBlocked ? 'red' : 'green'};">
                <small style="display:block; font-weight:bold; color:#555; margin-bottom:5px;">SITUAÇÃO DA CONTA</small>
                ${isBlocked ? 
                    '<span style="color:red; font-weight:bold; font-size:1.2rem;"><i class="fas fa-lock"></i> BLOQUEADO</span>' : 
                    '<span style="color:green; font-weight:bold; font-size:1.2rem;"><i class="fas fa-check"></i> ATIVO</span>'}
            </div>
            
            <div style="background:${emRota ? '#fff3e0' : '#f5f5f5'}; padding:15px; border-radius:8px; border:1px solid ${emRota ? 'orange' : '#ccc'};">
                <small style="display:block; font-weight:bold; color:#555; margin-bottom:5px;">STATUS OPERACIONAL</small>
                ${emRota ? 
                    `<span style="color:orange; font-weight:bold; font-size:1.1rem;"><i class="fas fa-road"></i> EM ROTA<br><small style="color:#333; font-size:0.8rem;">${veiculoRota}</small></span>` : 
                    '<span style="color:#999; font-weight:bold; font-size:1.2rem;"><i class="fas fa-home"></i> DISPONÍVEL</span>'}
            </div>
            
        </div>
        
        ${emRota ? `<p style="margin-top:15px; font-size:0.9rem; color:#666;">Iniciou viagem em: ${dataRota}</p>` : ''}
    `;
    
    container.innerHTML = html;

    // Botão de Ação Rápida no Modal
    var btnLabel = isBlocked ? 'DESBLOQUEAR ACESSO' : 'BLOQUEAR ACESSO';
    var btnClass = isBlocked ? 'btn-success' : 'btn-danger';
    var btnIcon = isBlocked ? 'fa-unlock' : 'fa-lock';
    
    actions.innerHTML = `
        <button class="${btnClass}" style="width:100%; padding:15px; font-size:1rem; border-radius:6px; margin-top:10px;" onclick="toggleBloqueioFunc('${f.id}')">
            <i class="fas ${btnIcon}"></i> ${btnLabel}
        </button>
    `;
};

// Função para Alternar Bloqueio (Ativo/Bloqueado)
window.toggleBloqueioFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var newStatus = !f.isBlocked;
    var actionName = newStatus ? "BLOQUEAR" : "DESBLOQUEAR";
    
    if (!confirm(`Tem certeza que deseja ${actionName} o funcionário ${f.nome}?\n\nEle ${newStatus ? 'perderá' : 'ganhará'} acesso ao sistema imediatamente.`)) {
        return;
    }

    // 1. Atualiza na Nuvem (Isso impede login futuro)
    if (window.dbRef) {
        try {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { isBlocked: newStatus });
        } catch(e) {
            alert("Erro ao atualizar status na nuvem: " + e.message);
            return;
        }
    }

    // 2. Atualiza Cache Local e Salva
    f.isBlocked = newStatus;
    await salvarListaFuncionarios(CACHE_FUNCIONARIOS);

    alert(`Usuário ${newStatus ? 'BLOQUEADO' : 'DESBLOQUEADO'} com sucesso.`);
    
    // Fecha modal e atualiza tabela
    document.getElementById('modalStatusFuncionario').style.display = 'none';
    renderizarPainelEquipe();
};

window.aprovarUsuario = async function(uid) {
    if(!confirm("Deseja aprovar o acesso deste usuário ao sistema?")) return;
    
    try { 
        await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true }); 
        alert("Usuário aprovado!");
        renderizarPainelEquipe(); 
    } catch(e){ 
        alert("Erro ao aprovar: " + e.message); 
    }
};

window.aprovarProfileRequest = async function(reqId) {
    var req = CACHE_PROFILE_REQUESTS.find(r => r.id === reqId);
    if (!req) return;
    
    var func = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(req.funcionarioId));
    
    if (func) {
        // Atualiza o campo solicitado
        if (req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if (req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if (req.campo === 'PIX') func.pix = req.valorNovo;
        
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    // Marca solicitação como aprovada
    req.status = 'APROVADO';
    await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
    
    renderizarPainelEquipe();
    alert("Dados atualizados.");
};

// -----------------------------------------------------------------------------
// 3. RELATÓRIOS (COM CÁLCULO DE COMBUSTÍVEL PROPORCIONAL)
// -----------------------------------------------------------------------------

function filtrarOperacoesParaRelatorio() {
    var inicio = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;
    
    if (!inicio || !fim) { 
        alert("Por favor, selecione o período (Início e Fim)."); 
        return null; 
    }
    
    var mId = document.getElementById('selectMotoristaRelatorio').value;
    var vPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var cCnpj = document.getElementById('selectContratanteRelatorio').value;
    var aId = document.getElementById('selectAtividadeRelatorio').value;

    // Filtra e Ordena
    return CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        
        // Filtro de Data
        if (op.data < inicio || op.data > fim) return false;
        
        // Filtros Opcionais
        if (mId && op.motoristaId !== mId) return false;
        if (vPlaca && op.veiculoPlaca !== vPlaca) return false;
        if (cCnpj && op.contratanteCNPJ !== cCnpj) return false;
        if (aId && op.atividadeId !== aId) return false;
        
        return true;
    }).sort((a,b) => new Date(a.data) - new Date(b.data));
}

window.gerarRelatorioGeral = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return; // Se usuário cancelou ou erro

    var veiculoSelecionado = document.getElementById('selectVeiculoRelatorio').value;
    var htmlCabecalho = '';

    // Se um veículo específico foi selecionado, mostra resumo de desempenho
    if (veiculoSelecionado) {
        var vStats = { fat:0, custo:0, km:0, litros:0, lucro:0 };
        
        ops.forEach(op => {
            var rec = Number(op.faturamento)||0;
            
            // CUSTO COMBUSTÍVEL REAL (PROPORCIONAL)
            var custoComb = window.calcularCustoCombustivelOperacao(op);
            
            var cust = (Number(op.despesas)||0) + custoComb;
            
            if (!op.checkins || !op.checkins.faltaMotorista) {
                cust += (Number(op.comissao)||0);
            }
            if(op.ajudantes) {
                op.ajudantes.forEach(aj => { 
                    if(!(op.checkins?.faltas?.[aj.id])) cust += (Number(aj.diaria)||0); 
                });
            }
            
            vStats.fat += rec; 
            vStats.custo += cust; 
            vStats.lucro += (rec - cust); 
            vStats.km += (Number(op.kmRodado)||0);
            
            // Dados para média histórica
            var preco = Number(op.precoLitro)||0; 
            var comb = Number(op.combustivel)||0;
            if(preco > 0 && comb > 0) {
                vStats.litros += (comb/preco);
            }
        });
        
        var mediaKmL = vStats.litros > 0 ? (vStats.km / vStats.litros) : 0;
        
        htmlCabecalho = `
            <div style="background:#e3f2fd; padding:15px; margin-bottom:20px; border-radius:8px;">
                <h3 style="color:#1565c0; margin-top:0;">RESUMO DO VEÍCULO: ${veiculoSelecionado}</h3>
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-top:10px;">
                    <div><strong>Faturamento:</strong> ${formatarValorMoeda(vStats.fat)}</div>
                    <div><strong>Custo Real:</strong> ${formatarValorMoeda(vStats.custo)}</div>
                    <div><strong>Lucro:</strong> <span style="color:${vStats.lucro>=0?'green':'red'}">${formatarValorMoeda(vStats.lucro)}</span></div>
                    <div><strong>KM Rodado:</strong> ${vStats.km}</div>
                    <div><strong>Média Geral:</strong> ${mediaKmL.toFixed(2)} Km/L</div>
                </div>
            </div>`;
    }

    var html = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO FINANCEIRO (CUSTO REAL)</h3>
            <small>Período: ${formatarDataParaBrasileiro(document.getElementById('dataInicioRelatorio').value)} a ${formatarDataParaBrasileiro(document.getElementById('dataFimRelatorio').value)}</small>
        </div>
        ${htmlCabecalho}
        <table class="data-table">
            <thead>
                <tr>
                    <th>DATA</th>
                    <th>VEÍCULO</th>
                    <th>CLIENTE</th>
                    <th>FATURAMENTO</th>
                    <th>CUSTO (EST.)</th>
                    <th>LUCRO</th>
                </tr>
            </thead>
            <tbody>
    `;

    var totalFat = 0; var totalLucro = 0; var totalCusto = 0;
    
    if (ops.length === 0) {
        html += '<tr><td colspan="6" style="text-align:center">Nenhuma operação no período.</td></tr>';
    }

    ops.forEach(op => {
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var receita = Number(op.faturamento)||0;
        
        // CUSTO REAL NA TABELA LINHA A LINHA
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        var custo = (Number(op.despesas)||0) + custoComb;
        
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custo += (Number(op.comissao)||0);
        }
        if(op.ajudantes) {
            op.ajudantes.forEach(aj => { 
                if(!(op.checkins?.faltas?.[aj.id])) custo += (Number(aj.diaria)||0); 
            });
        }
        
        var lucro = receita - custo; 
        
        totalFat += receita; 
        totalCusto += custo; 
        totalLucro += lucro;
        
        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${cli ? cli.razaoSocial.substring(0,15) : '-'}</td>
                <td>${formatarValorMoeda(receita)}</td>
                <td>${formatarValorMoeda(custo)}</td>
                <td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td>
            </tr>
        `;
    });
    
    html += `
            <tr style="background:#f5f5f5; font-weight:bold; border-top:2px solid #ccc;">
                <td colspan="3" style="text-align:right;">TOTAIS:</td>
                <td>${formatarValorMoeda(totalFat)}</td>
                <td>${formatarValorMoeda(totalCusto)}</td>
                <td style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</td>
            </tr>
        </tbody>
    </table>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarRelatorioCobranca = function() {
    var ops = filtrarOperacoesParaRelatorio();
    if (!ops) return;

    var porCliente = {};
    
    // Agrupa por cliente
    ops.forEach(op => {
        var cNome = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE DESCONHECIDO';
        
        if (!porCliente[cNome]) {
            porCliente[cNome] = { ops: [], totalFat: 0, totalAdiant: 0 };
        }
        
        porCliente[cNome].ops.push(op);
        porCliente[cNome].totalFat += (Number(op.faturamento)||0);
        porCliente[cNome].totalAdiant += (Number(op.adiantamento)||0);
    });

    var html = `<div style="text-align:center; margin-bottom:30px;"><h2>RELATÓRIO DE COBRANÇA (LÍQUIDO A RECEBER)</h2></div>`;
    
    for (var cliente in porCliente) {
        var liquido = porCliente[cliente].totalFat - porCliente[cliente].totalAdiant;
        
        html += `
            <div style="margin-bottom:30px; border:1px solid #ccc; padding:15px; page-break-inside: avoid;">
                <h3 style="background:#eee; padding:10px; margin-top:0;">${cliente}</h3>
                <table class="data-table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>PLACA</th>
                            <th>VALOR SERVIÇO</th>
                            <th>ADIANTAMENTO</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        porCliente[cliente].ops.forEach(op => {
            html += `
                <tr>
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${formatarValorMoeda(op.faturamento)}</td>
                    <td style="color:red;">${op.adiantamento > 0 ? '- '+formatarValorMoeda(op.adiantamento) : '-'}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                    <tfoot>
                        <tr style="background:#333; color:white;">
                            <td colspan="3" style="text-align:right; font-weight:bold;">LÍQUIDO A RECEBER:</td>
                            <td style="font-weight:bold; font-size:1.1rem; color:#4caf50;">${formatarValorMoeda(liquido)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') { 
        alert("Por favor, gere um relatório primeiro antes de exportar."); 
        return; 
    }
    
    var opt = {
        margin: 10,
        filename: 'Relatorio_Logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// -----------------------------------------------------------------------------
// 4. EMISSÃO DE RECIBOS DE PAGAMENTO
// -----------------------------------------------------------------------------

// =============================================================================
// ATUALIZAÇÃO: LAYOUT DO RECIBO COM DADOS DA EMPRESA (PAGADOR)
// =============================================================================

// 1. ATUALIZAÇÃO DA GERAÇÃO DO NOVO RECIBO (CÁLCULO)
// =============================================================================
// CORREÇÃO: BOTÃO SALVAR RECIBO E PROTEÇÃO DE DADOS
// =============================================================================

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!motId || !dataIni || !dataFim) {
        return alert("Preencha o funcionário e o período completo.");
    }
    
    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário inválido.");

    // Busca dados da Empresa (Pagador)
    var empresa = CACHE_MINHA_EMPRESA || {};
    var razaoSocial = empresa.razaoSocial || "EMPRESA NÃO CADASTRADA";
    var cnpjEmpresa = empresa.cnpj || "-";
    var telEmpresa = empresa.telefone ? formatarTelefoneBrasil(empresa.telefone) : "-";

    var totalValor = 0; 
    var opsEnvolvidas = [];
    
    // Calcula comissões ou diárias no período
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA' || op.data < dataIni || op.data > dataFim) return;
        
        var valorGanho = 0;
        
        // Se for o Motorista
        if (op.motoristaId === motId && (!op.checkins || !op.checkins.faltaMotorista)) {
            valorGanho = Number(op.comissao) || 0;
        }
        // Se for Ajudante
        else if (op.ajudantes) {
            var aj = op.ajudantes.find(a => a.id === motId);
            if (aj && !(op.checkins?.faltas?.[motId])) {
                valorGanho = Number(aj.diaria) || 0;
            }
        }
        
        if (valorGanho > 0) {
            totalValor += valorGanho;
            opsEnvolvidas.push({ data: op.data, valor: valorGanho });
        }
    });

    // Gera HTML do Recibo (Com Cabeçalho da Empresa)
    var htmlRecibo = `
        <div style="border:2px solid #333; padding:20px; font-family:'Courier New', monospace; background:#fff; max-width:400px; margin:0 auto;">
            
            <div style="text-align:center; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:15px;">
                <strong style="font-size:1.1rem; text-transform:uppercase;">${razaoSocial}</strong><br>
                <span style="font-size:0.85rem;">CNPJ: ${cnpjEmpresa}</span><br>
                <span style="font-size:0.85rem;">Tel: ${telEmpresa}</span>
            </div>

            <h3 style="text-align:center; border-bottom:1px dashed #333; padding-bottom:10px; margin-bottom:15px;">RECIBO DE PAGAMENTO</h3>
            
            <p><strong>BENEFICIÁRIO:</strong><br> ${funcionario.nome}</p>
            <p style="font-size:0.9rem;">CPF: ${funcionario.documento || '-'}</p>
            <p><strong>PERÍODO:</strong><br> ${formatarDataParaBrasileiro(dataIni)} A ${formatarDataParaBrasileiro(dataFim)}</p>
            
            <table style="width:100%; border-top:1px solid #333; border-bottom:1px solid #333; margin:10px 0; font-size:0.9rem;">
                <tr style="background:#eee;"><th align="left">DATA</th><th align="right">VALOR</th></tr>
                ${opsEnvolvidas.map(o => `<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td align="right">${formatarValorMoeda(o.valor)}</td></tr>`).join('')}
            </table>
            
            <h3 style="text-align:right; margin-top:15px;">TOTAL: ${formatarValorMoeda(totalValor)}</h3>
            
            <div style="margin-top:40px; text-align:center;">
                <div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div>
                <div style="padding-top:5px; font-size:0.8rem;">ASSINATURA DO RECEBEDOR</div>
                <div style="font-weight:bold; font-size:0.9rem;">${funcionario.nome}</div>
            </div>
            
            <div style="text-align:center; margin-top:20px; font-size:0.6rem; color:#999;">EMITIDO PELO SISTEMA LOGIMASTER</div>
        </div>
    `;
    
    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    
    // CORREÇÃO CRÍTICA: Tratamento de aspas no nome para não quebrar o botão
    var nomeSafe = funcionario.nome.replace(/'/g, "\\'"); 
    
    // Botão para Salvar no Histórico
    document.getElementById('modalReciboActions').innerHTML = `
        <button class="btn-success" onclick="salvarReciboNoHistorico('${funcionario.id}', '${nomeSafe}', '${dataIni}', '${dataFim}', ${totalValor})">
            <i class="fas fa-save"></i> SALVAR E REGISTRAR
        </button>
    `;
    
    document.getElementById('modalRecibo').style.display = 'flex';
};

window.salvarReciboNoHistorico = async function(funcId, funcNome, ini, fim, valor) {
    try {
        var novoRecibo = { 
            id: Date.now().toString(), 
            dataEmissao: new Date().toISOString(), 
            funcionarioId: funcId, 
            funcionarioNome: funcNome, 
            periodo: `${formatarDataParaBrasileiro(ini)} a ${formatarDataParaBrasileiro(fim)}`, 
            valorTotal: Number(valor), 
            enviado: false 
        };
        
        var lista = CACHE_RECIBOS || [];
        lista.push(novoRecibo);
        
        await salvarListaRecibos(lista);
        
        alert("Recibo salvo no histórico com sucesso!"); 
        document.getElementById('modalRecibo').style.display = 'none'; 
        
        // Verifica qual função de renderização usar (para compatibilidade)
        if (typeof renderizarPaginaRecibos === 'function') {
            renderizarPaginaRecibos(); // Usa a nova lógica centralizada
        } else if (typeof renderizarHistoricoRecibosAdmin === 'function') {
            renderizarHistoricoRecibosAdmin(); // Usa a lógica do admin
        } else {
            // Fallback (se as partes anteriores não foram carregadas corretamente)
            if(document.querySelector('#tabelaHistoricoRecibos tbody')) {
               // Recarrega a página para garantir atualização se as funções não existirem
               window.location.reload(); 
            }
        }
    } catch (erro) {
        console.error(erro);
        alert("Erro ao salvar recibo: " + erro.message);
    }
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 1. PAINEL SUPER ADMIN (ACESSO RESTRITO)
// -----------------------------------------------------------------------------

/**
 * Carrega a lista de todas as empresas e usuários do sistema.
 * Exclusivo para os e-mails listados em EMAILS_MESTRES.
 */
window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando dados globais do sistema...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        
        // Busca todas as coleções de empresas e usuários
        const companiesSnap = await getDocs(collection(db, "companies"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        
        const users = [];
        usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if (companies.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma empresa encontrada no banco de dados.</div>';
            return;
        }

        // Renderiza lista de empresas
        companies.forEach(comp => {
            // Filtra usuários desta empresa
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            // Define visual do status
            let statusBadge = "";
            let borderColor = "#ddd"; 

            if (comp.isBlocked) {
                statusBadge = '<span class="status-pill pill-blocked">BLOQUEADO</span>';
                borderColor = "var(--danger-color)";
            } else if (comp.isVitalicio) {
                statusBadge = '<span class="status-pill pill-active">VITALÍCIO</span>';
                borderColor = "gold";
            } else {
                // Verifica data de vencimento
                let vencido = comp.systemValidity && new Date(comp.systemValidity) < new Date();
                if (vencido) {
                    statusBadge = '<span class="status-pill pill-blocked">VENCIDO</span>';
                    borderColor = "orange";
                } else {
                    statusBadge = '<span class="status-pill pill-active">ATIVO</span>';
                    borderColor = "var(--success-color)";
                }
            }
            
            let validadeTexto = comp.isVitalicio ? "VITALÍCIO" : (comp.systemValidity ? formatarDataParaBrasileiro(comp.systemValidity) : "SEM DADOS");

            // Prepara variáveis seguras para o HTML
            const safeValidity = comp.systemValidity || '';
            const safeVitalicio = comp.isVitalicio || false;
            const safeBlocked = comp.isBlocked || false;

            const div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = `margin-bottom:15px; border:1px solid ${borderColor}; border-radius:8px; background:white; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.05);`;

            // HTML Interno do Card da Empresa
            div.innerHTML = `
                <div class="company-header" onclick="this.nextElementSibling.style.display = (this.nextElementSibling.style.display === 'none' ? 'block' : 'none')" style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#f8f9fa;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="background:var(--primary-color); color:white; width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.2rem;">
                            ${comp.id.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                            <h4 style="margin:0; text-transform:uppercase; color:#333;">${comp.id}</h4>
                            <small style="color:#666;">Admin: ${admin ? admin.email : '<span style="color:red">Não encontrado</span>'}</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px; text-align:right;">
                        <div class="mobile-hide">
                            <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Validade</div>
                            <strong style="font-size:0.9rem; color:#333;">${validadeTexto}</strong>
                        </div>
                        ${statusBadge}
                        <i class="fas fa-chevron-down" style="color:#999;"></i>
                    </div>
                </div>
                
                <div class="company-body" style="display:none; padding:20px; border-top:1px solid #eee; background:white;">
                    <div style="margin-bottom:20px; display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="btn-primary" onclick="abrirModalCreditos('${comp.id}', '${safeValidity}', ${safeVitalicio}, ${safeBlocked})">
                            <i class="fas fa-edit"></i> GERENCIAR ACESSO / CRÉDITOS
                        </button>
                        <button class="btn-danger" onclick="excluirEmpresaTotal('${comp.id}')">
                            <i class="fas fa-trash"></i> EXCLUIR EMPRESA E DADOS
                        </button>
                    </div>
                    
                    <h5 style="color:#666; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">USUÁRIOS CADASTRADOS (${usersDaEmpresa.length})</h5>
                    <div class="table-responsive">
                        <table class="data-table" style="width:100%;">
                            <thead><tr><th>NOME</th><th>EMAIL</th><th>FUNÇÃO</th><th>SENHA VISUAL</th><th>AÇÃO</th></tr></thead>
                            <tbody>
                                ${usersDaEmpresa.map(u => `
                                    <tr>
                                        <td>${u.name}</td>
                                        <td>${u.email}</td>
                                        <td>${u.role}</td>
                                        <td style="font-family:monospace; color:#007bff;">${u.senhaVisual || '***'}</td>
                                        <td>
                                            <button class="btn-mini btn-warning" onclick="resetarSenhaComMigracao('${u.uid}', '${u.email}', '${u.name}')" title="Resetar Senha"><i class="fas fa-key"></i></button>
                                            <button class="btn-mini btn-danger" onclick="excluirUsuarioGlobal('${u.uid}')" title="Excluir Usuário"><i class="fas fa-trash"></i></button>
                                        </td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger">Erro ao carregar dados: ${e.message}</div>`;
    }
};

// Formulário de Criação de Empresa
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("O domínio da empresa deve ter pelo menos 3 letras.");

        try {
            // 1. Cria o usuário Admin no Auth
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            
            // 2. Salva o usuário no Firestore
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                uid: uid, 
                name: "ADMIN " + dominio.toUpperCase(), 
                email: email, 
                role: 'admin', 
                company: dominio, 
                createdAt: new Date().toISOString(), 
                approved: true, 
                isVitalicio: false, 
                isBlocked: false, 
                senhaVisual: senha,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString() // 30 dias grátis
            });

        } catch (erro) {
            if (erro.code === 'auth/email-already-in-use') {
                if(!confirm(`O e-mail ${email} JÁ EXISTE no sistema.\n\nDeseja criar apenas a estrutura da empresa "${dominio}"?`)) {
                    return;
                }
            } else {
                return alert("Erro fatal ao criar usuário: " + erro.message);
            }
        }

        try {
            // 3. Cria a estrutura da Empresa
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", dominio), { 
                id: dominio, 
                createdAt: new Date().toISOString(),
                isBlocked: false, 
                isVitalicio: false,
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
            }, { merge: true });

            alert(`Empresa "${dominio}" criada com sucesso!`);
            e.target.reset();
            carregarPainelSuperAdmin();

        } catch (dbError) {
            alert("Erro ao salvar empresa: " + dbError.message);
        }
    }
});

// Modal de Gerenciamento de Créditos
window.abrirModalCreditos = function(companyId, validade, isVitalicio, isBlocked) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    
    var textoValidade = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade.split('T')[0]) : "SEM REGISTRO");
    document.getElementById('validadeAtualCredito').textContent = textoValidade;
    
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var elDivAdd = document.getElementById('divAddCreditos');

    if(elVitalicio) {
        elVitalicio.checked = isVitalicio;
        elVitalicio.onchange = function() { 
            if(elDivAdd) elDivAdd.style.display = this.checked ? 'none' : 'block'; 
        };
        // Estado inicial
        if(elDivAdd) elDivAdd.style.display = isVitalicio ? 'none' : 'block';
    }
    
    if(elBloqueado) elBloqueado.checked = isBlocked;
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    var isVitalicio = document.getElementById('checkVitalicio').checked;
    var isBloqueado = document.getElementById('checkBloqueado').checked;
    var meses = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        const { db, collection, query, where, getDocs, doc, setDoc, writeBatch } = window.dbRef;
        
        var dadosEmpresa = { isVitalicio: isVitalicio, isBlocked: isBloqueado };
        var novaData = null;

        // Cálculo de nova data se não for vitalício
        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            
            var base = new Date();
            // Pega a data atual do admin para somar e não perder dias
            if(!snap.empty) {
                var adm = snap.docs[0].data();
                if(adm.systemValidity && new Date(adm.systemValidity) > base) {
                    base = new Date(adm.systemValidity);
                }
            }
            
            if (meses > 0) {
                base.setDate(base.getDate() + (meses * 30));
            }
            
            novaData = base.toISOString();
            dadosEmpresa.systemValidity = novaData;
        }

        // 1. Atualiza Empresa
        await setDoc(doc(db, "companies", companyId), dadosEmpresa, { merge: true });
        
        // 2. Atualiza Usuários (Batch)
        const qUsers = query(collection(db, "users"), where("company", "==", companyId));
        const snapUsers = await getDocs(qUsers);
        const batch = writeBatch(db);
        
        snapUsers.forEach(uDoc => {
            let updateData = { isBlocked: isBloqueado, isVitalicio: isVitalicio };
            if (novaData) updateData.systemValidity = novaData;
            batch.update(uDoc.ref, updateData);
        });
        
        await batch.commit();

        alert("Atualizado com sucesso!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();

    } catch(e) { 
        alert("Erro: " + e.message); 
    }
};

window.excluirEmpresaTotal = async function(companyId) {
    var confirmacao = prompt(`ATENÇÃO: Isso apagará TODOS os dados da empresa "${companyId}".\nDigite "DELETAR" para confirmar:`);
    
    if (confirmacao !== "DELETAR") return;
    
    try {
        const { db, collection, query, where, getDocs, doc, writeBatch } = window.dbRef;
        const batch = writeBatch(db);
        
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
        batch.delete(doc(db, "companies", companyId));
        
        await batch.commit();
        
        alert("Empresa excluída.");
        carregarPainelSuperAdmin();
    } catch (e) { 
        alert("Erro: " + e.message); 
    }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(!confirm("Excluir este usuário permanentemente?")) return;
    try { 
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid)); 
        carregarPainelSuperAdmin(); 
    } catch(e) { 
        alert(e.message); 
    }
};

window.resetarSenhaComMigracao = async function(uid, email, nome) {
    var novaSenha = prompt(`Nova senha para ${email}:`);
    if(novaSenha) {
        try {
            let novoUid = await window.dbRef.criarAuthUsuario(email, novaSenha);
            
            var oldDocRef = window.dbRef.doc(window.dbRef.db, "users", uid);
            var oldDoc = await window.dbRef.getDoc(oldDocRef);
            
            if(oldDoc.exists()){
                var dados = oldDoc.data();
                dados.uid = novoUid;
                dados.senhaVisual = novaSenha;
                
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUid), dados);
                await window.dbRef.deleteDoc(oldDocRef);
            }
            alert("Senha alterada!"); 
            carregarPainelSuperAdmin();
        } catch(e){ 
            alert("Erro: " + e.message); 
        }
    }
};

// -----------------------------------------------------------------------------
// 2. MEUS DADOS
// -----------------------------------------------------------------------------

window.renderizarMeusDados = function() {
    var user = window.USUARIO_ATUAL;
    var dados = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(user.uid)) || user;
    var container = document.getElementById('meusDadosContainer');
    
    if(!container) return;

    // Helper para criar linha de dados
    const makeLine = (label, val, fieldCode) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f8f9fa;">
            <div>
                <span style="font-size:0.8rem; color:#888; display:block;">${label}</span>
                <span style="font-size:1rem; color:#333; font-weight:600;">${val || '-'}</span>
            </div>
            ${fieldCode ? `<button class="btn-mini btn-secondary" onclick="solicitarAlteracao('${fieldCode}', '${val}')"><i class="fas fa-pen"></i></button>` : ''}
        </div>`;

    var html = `
        <div style="background:white; padding:30px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.05); max-width:600px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:30px;">
                <div style="width:80px; height:80px; background:var(--primary-color); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; margin:0 auto 15px auto;">
                    <i class="fas fa-user"></i>
                </div>
                <h3 style="margin:0; color:#333;">${dados.nome || dados.name}</h3>
                <span class="status-pill pill-active" style="margin-top:5px; display:inline-block;">${dados.funcao || dados.role || 'Usuário'}</span>
            </div>
            
            <div style="border-top:1px solid #eee; padding-top:20px;">
                ${makeLine('Email de Acesso', dados.email, null)}
                ${makeLine('Telefone', dados.telefone, 'TELEFONE')}
                ${makeLine('Endereço', dados.endereco, 'ENDERECO')}
                ${makeLine('Chave PIX', dados.pix, 'PIX')}
            </div>
    `;
    
    if(dados.funcao === 'motorista') {
        html += `
            <div style="margin-top:30px;">
                <h4 style="color:#666; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:15px;">DADOS DE HABILITAÇÃO</h4>
                ${makeLine('Nº CNH', dados.cnh, 'CNH')}
                ${makeLine('Validade', formatarDataParaBrasileiro(dados.validadeCNH), 'VALIDADE_CNH')}
                ${makeLine('Categoria', dados.categoriaCNH, 'CATEGORIA_CNH')}
            </div>
        `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
};

window.solicitarAlteracao = function(campo, atual) {
    var novo = prompt(`Digite o novo valor para ${campo}:`, atual);
    if(novo && novo !== atual) {
        var req = { 
            id: Date.now().toString(), 
            data: new Date().toISOString(), 
            funcionarioId: window.USUARIO_ATUAL.uid, 
            funcionarioEmail: window.USUARIO_ATUAL.email, 
            campo: campo, 
            valorAntigo: atual, 
            valorNovo: novo, 
            status: 'PENDENTE' 
        };
        var lista = CACHE_PROFILE_REQUESTS || [];
        lista.push(req);
        salvarProfileRequests(lista).then(() => alert("Solicitação enviada."));
    }
};

// -----------------------------------------------------------------------------
// 3. INICIALIZAÇÃO DO SISTEMA (CORREÇÃO DE FLASH E CALENDÁRIO)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> INIT SISTEMA:", user.role);
    window.USUARIO_ATUAL = user;

    // 1. Reseta a interface (Esconde todas as páginas)
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = 'none'; 
        p.classList.remove('active'); 
    });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // 2. Verifica se é Super Admin
    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        var page = document.getElementById('super-admin');
        if(page) {
            page.style.display = 'block'; 
            setTimeout(() => page.classList.add('active'), 50);
        }
        carregarPainelSuperAdmin();
        return; 
    }

    // 3. Sincroniza dados antes de abrir
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects(); 

    // 4. Lógica de Roteamento
    if (user.role === 'admin') {
        // Bloqueios
        if (user.isBlocked) {
            document.body.innerHTML = "<div style='display:flex;height:100vh;justify-content:center;align-items:center;color:red;flex-direction:column'><h1>ACESSO BLOQUEADO</h1><p>Contate o suporte.</p><button onclick='logoutSystem()'>SAIR</button></div>";
            return;
        }
        if (!user.isVitalicio) {
            if (!user.systemValidity || new Date(user.systemValidity) < new Date()) {
                document.body.innerHTML = "<div style='display:flex;height:100vh;justify-content:center;align-items:center;color:orange;flex-direction:column'><h1>SISTEMA VENCIDO</h1><p>Renove sua licença.</p><button onclick='logoutSystem()'>SAIR</button></div>";
                return;
            }
        }

        // Mostra Menu
        document.getElementById('menu-admin').style.display = 'block';
        
        // Abre Home
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            
            var menuHome = document.querySelector('.nav-item[data-page="home"]');
            if(menuHome) menuHome.classList.add('active');
        }
        
        // CORREÇÃO CRÍTICA DO CALENDÁRIO:
        // Aguarda 300ms para garantir que o DOM (div#calendarGrid) está visível e dimensionado
        // antes de desenhar o grid. Isso previne o bug de precisar navegar para aparecer.
        window.currentDate = new Date();
        setTimeout(() => {
            console.log("Renderizando Calendário e Dashboard com delay...");
            renderizarCalendario();
            atualizarDashboard();
        }, 300);

    } else {
        // Funcionário
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        var empHome = document.getElementById('employee-home');
        if(empHome) { 
            empHome.style.display = 'block'; 
            setTimeout(() => empHome.classList.add('active'), 50);
            
            var menuEmp = document.querySelector('.nav-item[data-page="employee-home"]');
            if(menuEmp) menuEmp.classList.add('active');
        }
        
        renderizarCheckinFuncionario();
        renderizarMeusDados();
    }
};

// -----------------------------------------------------------------------------
// 4. EVENTOS DE NAVEGAÇÃO E BACKUP
// -----------------------------------------------------------------------------

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(page => { 
            page.classList.remove('active'); 
            page.style.display = 'none'; 
        });
        
        this.classList.add('active');
        var targetId = this.getAttribute('data-page');
        var targetPage = document.getElementById(targetId);
        
        if (targetPage) { 
            targetPage.style.display = 'block'; 
            setTimeout(() => targetPage.classList.add('active'), 10); 
        }
        
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('active');
        }
        
        // Recarrega componentes específicos ao navegar
        if (targetId === 'home') {
            // Pequeno delay também na navegação para garantir renderização correta
            setTimeout(() => {
                atualizarDashboard();
                renderizarCalendario();
            }, 100);
        }
        if (targetId === 'meus-dados') renderizarMeusDados();
        if (targetId === 'employee-checkin') renderizarCheckinFuncionario();
    });
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
});

window.exportDataBackup = function() {
    var data = { 
        meta: { date: new Date(), user: window.USUARIO_ATUAL.email }, 
        data: { 
            funcionarios: CACHE_FUNCIONARIOS, 
            veiculos: CACHE_VEICULOS, 
            operacoes: CACHE_OPERACOES, 
            despesas: CACHE_DESPESAS 
        } 
    };
    var a = document.createElement('a'); 
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); 
    a.download = "backup_logimaster.json"; 
    a.click();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(e) {
        if(confirm("Tem certeza? Isso substituirá os dados atuais.")) {
            try {
                var json = JSON.parse(e.target.result);
                if(json.data) {
                    localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(json.data.funcionarios));
                    localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(json.data.veiculos));
                    localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(json.data.operacoes));
                    localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(json.data.despesas));
                    alert("Restaurado com sucesso! Recarregando...");
                    window.location.reload();
                } else {
                    alert("Arquivo inválido.");
                }
            } catch(err) {
                alert("Erro ao ler arquivo: " + err.message);
            }
        }
    };
    reader.readAsText(event.target.files[0]);
};

// =============================================================================
// PARTE 6: FUNÇÕES DO PAINEL DO FUNCIONÁRIO (CORREÇÃO CHECK-IN)
// =============================================================================

/**
 * Renderiza o Painel de Check-in do Funcionário (Motorista ou Ajudante).
 * Mostra viagens agendadas ou em andamento vinculadas ao usuário logado.
 */
window.renderizarCheckinFuncionario = function() {
    var container = document.getElementById('checkin-container');
    if (!container || !window.USUARIO_ATUAL) return;

    var uid = window.USUARIO_ATUAL.uid;
    container.innerHTML = '';

    // Filtra operações onde o usuário é motorista ou ajudante
    // E que não estejam canceladas ou finalizadas (apenas ativas)
    var minhasOps = CACHE_OPERACOES.filter(function(op) {
        var souMotorista = (String(op.motoristaId) === String(uid));
        var souAjudante = (op.ajudantes && op.ajudantes.some(a => String(a.id) === String(uid)));
        
        var isAtiva = (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
        
        return (souMotorista || souAjudante) && isAtiva;
    });

    if (minhasOps.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#888;">
                <i class="fas fa-clipboard-check" style="font-size:3rem; margin-bottom:15px; opacity:0.5;"></i>
                <p>Nenhuma viagem agendada ou em andamento para você no momento.</p>
            </div>`;
        return;
    }

    minhasOps.forEach(function(op) {
        var souMotorista = (String(op.motoristaId) === String(uid));
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Cliente não identificado';
        var veiculo = op.veiculoPlaca || 'Sem Veículo';
        
        // Determina o estado do botão de ação
        var btnHtml = '';
        var statusLabel = '';

        // Lógica para MOTORISTA
        if (souMotorista) {
            var checkInFeito = (op.checkins && op.checkins.motorista);
            
            if (!checkInFeito) {
                // Cenário 1: Viagem Agendada, precisa Iniciar
                statusLabel = '<span class="status-pill pill-pending">AGUARDANDO INÍCIO</span>';
                btnHtml = `<button class="btn-primary" style="width:100%; padding:15px; font-size:1.1rem;" onclick="abrirModalCheckin('${op.id}', 'INICIO')"><i class="fas fa-play"></i> INICIAR VIAGEM (CHECK-IN)</button>`;
            } else {
                // Cenário 2: Viagem em Andamento, precisa Finalizar
                statusLabel = '<span class="status-pill" style="background:orange; color:white;">EM ROTA</span>';
                btnHtml = `<button class="btn-warning" style="width:100%; padding:15px; font-size:1.1rem;" onclick="abrirModalCheckin('${op.id}', 'FIM')"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
            }
        } 
        // Lógica para AJUDANTE
        else {
            var jaConfirmou = (op.checkins && op.checkins.ajudantes && op.checkins.ajudantes[uid]);
            
            if (!jaConfirmou) {
                statusLabel = '<span class="status-pill pill-pending">PENDENTE</span>';
                btnHtml = `<button class="btn-success" style="width:100%; padding:15px;" onclick="confirmarCheckinAjudante('${op.id}')"><i class="fas fa-check-circle"></i> CONFIRMAR PRESENÇA</button>`;
            } else {
                statusLabel = '<span class="status-pill pill-active">PRESENÇA CONFIRMADA</span>';
                btnHtml = `<button disabled class="btn-secondary" style="width:100%; opacity:0.7;"><i class="fas fa-check"></i> VOCÊ JÁ FEZ O CHECK-IN</button>`;
            }
        }

        // Renderiza o Card
        var card = document.createElement('div');
        card.style.border = '1px solid #ddd';
        card.style.borderRadius = '8px';
        card.style.padding = '15px';
        card.style.marginBottom = '20px';
        card.style.background = '#fff';
        card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <h3 style="margin:0; color:var(--primary-color); font-size:1.1rem;">${cliente}</h3>
                    <small style="color:#666;">Data: ${formatarDataParaBrasileiro(op.data)}</small>
                </div>
                ${statusLabel}
            </div>
            
            <div style="background:#f8f9fa; padding:10px; border-radius:5px; margin-bottom:15px; font-size:0.95rem;">
                <p style="margin:5px 0;"><i class="fas fa-truck"></i> <strong>Veículo:</strong> ${veiculo}</p>
                <p style="margin:5px 0;"><i class="fas fa-user-tag"></i> <strong>Sua Função:</strong> ${souMotorista ? 'MOTORISTA' : 'AJUDANTE'}</p>
            </div>
            
            ${btnHtml}
        `;
        
        container.appendChild(card);
    });
};

/**
 * Abre o Modal de Confirmação de Check-in para o Motorista.
 * @param {string} opId - ID da Operação
 * @param {string} step - 'INICIO' ou 'FIM'
 */
window.abrirModalCheckin = function(opId, step) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';

    // Preenche dados do modal
    document.getElementById('checkinOpId').value = opId;
    document.getElementById('checkinStep').value = step;
    
    document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
    document.getElementById('checkinDisplayContratante').textContent = cliente;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoPlaca;
    
    var divDriver = document.getElementById('checkinDriverFields');
    var divKmIni = document.getElementById('divKmInicial');
    var divKmFim = document.getElementById('divKmFinal');
    var btn = document.getElementById('btnConfirmCheckin');

    divDriver.style.display = 'block';

    if (step === 'INICIO') {
        document.getElementById('checkinModalTitle').textContent = "INICIAR VIAGEM";
        divKmIni.style.display = 'block';
        divKmFim.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-play"></i> CONFIRMAR INÍCIO';
        btn.className = 'btn-primary';
        
        // Tenta preencher KM inicial com base no KM final da última viagem do veículo
        var kmSugerido = op.veiculoPlaca ? buscarUltimoKmVeiculo(op.veiculoPlaca) : '';
        document.getElementById('checkinKmInicial').value = kmSugerido;
        
    } else {
        document.getElementById('checkinModalTitle').textContent = "FINALIZAR VIAGEM";
        divKmIni.style.display = 'none';
        divKmFim.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-flag-checkered"></i> CONFIRMAR TÉRMINO';
        btn.className = 'btn-warning';
        
        // Passa o KM inicial que foi salvo para validação
        document.getElementById('checkinKmInicialReadonly').value = op.kmInicial || 0;
    }

    document.getElementById('modalCheckinConfirm').style.display = 'flex';
};

/**
 * Busca o último KM registrado de um veículo para sugerir no input.
 */
function buscarUltimoKmVeiculo(placa) {
    var opsDoVeiculo = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && o.kmFinal > 0);
    if (opsDoVeiculo.length === 0) return '';
    
    // Ordena para pegar a mais recente
    opsDoVeiculo.sort((a,b) => new Date(b.data) - new Date(a.data));
    return opsDoVeiculo[0].kmFinal;
}

/**
 * Processa o formulário de Check-in do Motorista (Início ou Fim).
 */
document.getElementById('formCheckinConfirm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    var opId = document.getElementById('checkinOpId').value;
    var step = document.getElementById('checkinStep').value;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    
    if (!op) return;

    if (!op.checkins) op.checkins = {};

    // Atualização dos dados
    if (step === 'INICIO') {
        var kmIni = Number(document.getElementById('checkinKmInicial').value);
        if (kmIni <= 0) return alert("Informe o KM Inicial válido.");

        op.kmInicial = kmIni;
        op.checkins.motorista = true; // Marca que iniciou
        op.status = 'EM_ANDAMENTO';
        
    } else { // FIM
        var kmFinal = Number(document.getElementById('checkinKmFinal').value);
        var kmIni = Number(document.getElementById('checkinKmInicialReadonly').value);
        var abastecido = Number(document.getElementById('checkinValorAbastecido').value);
        var preco = Number(document.getElementById('checkinPrecoLitroConfirm').value);

        if (kmFinal <= kmIni) return alert(`O KM Final deve ser maior que o Inicial (${kmIni}).`);

        op.kmFinal = kmFinal;
        op.kmRodado = kmFinal - (op.kmInicial || 0); // Calcula KM Rodado automaticamente
        
        if (abastecido > 0) op.combustivel = abastecido;
        if (preco > 0) op.precoLitro = preco;

        op.status = 'FINALIZADA'; // Ou 'CONFIRMADA' se preferir fluxo de aprovação
    }

    await salvarListaOperacoes(CACHE_OPERACOES);
    
    alert(step === 'INICIO' ? "Viagem Iniciada!" : "Viagem Finalizada com Sucesso!");
    closeCheckinConfirmModal();
    renderizarCheckinFuncionario();
});

/**
 * Ajudante confirma presença com um clique.
 */
window.confirmarCheckinAjudante = async function(opId) {
    if (!confirm("Confirmar sua presença nesta operação?")) return;

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    if (!op.checkins) op.checkins = {};
    if (!op.checkins.ajudantes) op.checkins.ajudantes = {};

    var uid = window.USUARIO_ATUAL.uid;
    op.checkins.ajudantes[uid] = true;

    await salvarListaOperacoes(CACHE_OPERACOES);
    
    alert("Presença Confirmada!");
    renderizarCheckinFuncionario();
};

// =============================================================================
// ATUALIZAÇÃO: PAINEL MEUS SERVIÇOS E REGISTRO DE HORÁRIO DE CHECK-IN
// =============================================================================

// 1. FUNÇÃO ATUALIZADA: FILTRO E EXIBIÇÃO DETALHADA DOS SERVIÇOS
window.filtrarServicosFuncionario = function(uid) {
    var tabela = document.getElementById('tabelaMeusServicos');
    if (!tabela) return;
    
    var thead = tabela.querySelector('thead');
    var tbody = tabela.querySelector('tbody');
    
    // Atualiza os cabeçalhos da tabela dinamicamente para comportar as novas colunas
    thead.innerHTML = `
        <tr>
            <th>DATA</th>
            <th>VEÍCULO</th>
            <th>FUNÇÃO</th>
            <th>CHECK-IN</th>
            <th>STATUS</th>
            <th style="text-align:right;">MEU GANHO</th>
        </tr>
    `;
    
    tbody.innerHTML = '';
    
    var ini = document.getElementById('dataInicioServicosFunc').value;
    var fim = document.getElementById('dataFimServicosFunc').value;
    
    if (!ini || !fim) return alert("Selecione o período (Início e Fim).");

    var totalGanho = 0;
    var encontrouRegistros = false;

    // Ordena por data (mais recente primeiro)
    var listaOrdenada = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data));

    listaOrdenada.forEach(op => {
        // Filtra Operações Canceladas ou fora da data
        if (op.status === 'CANCELADA' || op.data < ini || op.data > fim) return;
        
        var souMotorista = (String(op.motoristaId) === String(uid));
        var souAjudante = (op.ajudantes && op.ajudantes.some(a => String(a.id) === String(uid)));
        
        // Se não participei dessa operação, pula
        if (!souMotorista && !souAjudante) return;

        encontrouRegistros = true;

        var valorGanho = 0;
        var funcaoTexto = '-';
        var teveFalta = false;
        var horarioCheckin = '-';
        var statusTexto = '<span class="status-pill pill-active">REALIZADO</span>'; // Padrão

        // --- LÓGICA PARA MOTORISTA ---
        if (souMotorista) {
            funcaoTexto = 'MOTORISTA';
            
            // Verifica Falta
            if (op.checkins && op.checkins.faltaMotorista) {
                teveFalta = true;
                statusTexto = '<span class="status-pill pill-blocked">FALTA</span>';
                valorGanho = 0; // Se faltou, não recebe
            } else {
                valorGanho = Number(op.comissao) || 0;
            }

            // Verifica Horário Check-in
            if (op.checkins && op.checkins.motorista) {
                // Suporte retroativo: Se for boolean (true), é antigo. Se for string, é data ISO.
                var dadoCheckin = op.checkins.motorista;
                if (typeof dadoCheckin === 'string' && dadoCheckin.includes('T')) {
                    // Pega hora e minuto do ISO String
                    var dataObj = new Date(dadoCheckin);
                    horarioCheckin = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                } else {
                    horarioCheckin = 'CONFIRMADO';
                }
            } else {
                horarioCheckin = 'PENDENTE';
                if (!teveFalta) statusTexto = '<span class="status-pill pill-pending">AGENDADO</span>';
            }
        } 
        
        // --- LÓGICA PARA AJUDANTE ---
        else if (souAjudante) {
            funcaoTexto = 'AJUDANTE';
            var ajData = op.ajudantes.find(a => String(a.id) === String(uid));
            
            // Verifica Falta
            if (op.checkins && op.checkins.faltas && op.checkins.faltas[uid]) {
                teveFalta = true;
                statusTexto = '<span class="status-pill pill-blocked">FALTA</span>';
                valorGanho = 0;
            } else {
                valorGanho = Number(ajData.diaria) || 0;
            }

            // Verifica Horário Check-in
            if (op.checkins && op.checkins.ajudantes && op.checkins.ajudantes[uid]) {
                var dadoCheckin = op.checkins.ajudantes[uid];
                // Verifica se é falta (às vezes o sistema marca falta no objeto de checkin, mas aqui já validamos acima)
                if (teveFalta) {
                    horarioCheckin = '-';
                } else if (typeof dadoCheckin === 'string' && dadoCheckin.includes('T')) {
                    var dataObj = new Date(dadoCheckin);
                    horarioCheckin = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                } else if (dadoCheckin === true) {
                    horarioCheckin = 'CONFIRMADO';
                } else {
                    horarioCheckin = 'PENDENTE';
                }
            } else {
                horarioCheckin = 'PENDENTE';
                if (!teveFalta) statusTexto = '<span class="status-pill pill-pending">AGENDADO</span>';
            }
        }

        totalGanho += valorGanho;
        
        // Renderiza Linha
        var tr = document.createElement('tr');
        // Se teve falta, deixa a linha com opacidade reduzida ou cor de alerta
        if (teveFalta) tr.style.background = '#fff0f0';

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${op.veiculoPlaca || 'N/A'}</td>
            <td style="font-size:0.85rem;">${funcaoTexto}</td>
            <td style="font-weight:bold; color:var(--primary-color);">${horarioCheckin}</td>
            <td>${statusTexto}</td>
            <td style="text-align:right; font-weight:bold; color:${teveFalta ? 'red' : 'green'};">
                ${formatarValorMoeda(valorGanho)}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (!encontrouRegistros) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum registro encontrado neste período.</td></tr>';
    } else {
        // Linha de Totalização
        var trTotal = document.createElement('tr');
        trTotal.style.background = '#e8f5e9';
        trTotal.style.borderTop = '2px solid var(--success-color)';
        trTotal.innerHTML = `
            <td colspan="5" style="text-align:right; font-weight:bold; color:#333;">TOTAL RECEBIDO NO PERÍODO:</td>
            <td style="text-align:right; font-weight:bold; font-size:1.1rem; color:var(--success-color);">${formatarValorMoeda(totalGanho)}</td>
        `;
        tbody.appendChild(trTotal);
    }
};

// 2. ATUALIZAÇÃO DO CHECK-IN DE AJUDANTE (PARA SALVAR DATA/HORA)
window.confirmarCheckinAjudante = async function(opId) {
    if (!confirm("Confirmar sua presença nesta operação agora?")) return;

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;

    if (!op.checkins) op.checkins = {};
    if (!op.checkins.ajudantes) op.checkins.ajudantes = {};

    var uid = window.USUARIO_ATUAL.uid;
    
    // ATUALIZAÇÃO: Salva a data ISO em vez de apenas 'true'
    op.checkins.ajudantes[uid] = new Date().toISOString();

    await salvarListaOperacoes(CACHE_OPERACOES);
    
    alert("Presença Confirmada com horário!");
    renderizarCheckinFuncionario();
};

// 3. ATUALIZAÇÃO DO CHECK-IN DE MOTORISTA (PARA SALVAR DATA/HORA)
// Nota: Removemos o listener antigo substituindo-o por este novo bloco.
// Como não podemos remover eventos anônimos facilmente, certifique-se de que este código
// seja carregado após o anterior ou substitua o bloco do formulário 'formCheckinConfirm'.

var formCheckin = document.getElementById('formCheckinConfirm');
// Clona e substitui o elemento para remover listeners antigos e evitar duplicação
var newFormCheckin = formCheckin.cloneNode(true);
formCheckin.parentNode.replaceChild(newFormCheckin, formCheckin);

newFormCheckin.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    var opId = document.getElementById('checkinOpId').value;
    var step = document.getElementById('checkinStep').value;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    
    if (!op) return;
    if (!op.checkins) op.checkins = {};

    var agora = new Date().toISOString();

    // Atualização dos dados
    if (step === 'INICIO') {
        var kmIni = Number(document.getElementById('checkinKmInicial').value);
        if (kmIni <= 0) return alert("Informe o KM Inicial válido.");

        op.kmInicial = kmIni;
        
        // ATUALIZAÇÃO: Salva data/hora
        op.checkins.motorista = agora; 
        
        op.status = 'EM_ANDAMENTO';
        
    } else { // FIM
        var kmFinal = Number(document.getElementById('checkinKmFinal').value);
        var kmIni = Number(document.getElementById('checkinKmInicialReadonly').value);
        var abastecido = Number(document.getElementById('checkinValorAbastecido').value);
        var preco = Number(document.getElementById('checkinPrecoLitroConfirm').value);

        if (kmFinal <= kmIni) return alert(`O KM Final deve ser maior que o Inicial (${kmIni}).`);

        op.kmFinal = kmFinal;
        op.kmRodado = kmFinal - (op.kmInicial || 0);
        
        if (abastecido > 0) op.combustivel = abastecido;
        if (preco > 0) op.precoLitro = preco;

        op.status = 'FINALIZADA';
    }

    await salvarListaOperacoes(CACHE_OPERACOES);
    
    alert(step === 'INICIO' ? "Viagem Iniciada!" : "Viagem Finalizada com Sucesso!");
    closeCheckinConfirmModal();
    renderizarCheckinFuncionario();
});

// =============================================================================
// PARTE 7: GESTÃO AVANÇADA DE RECIBOS (ADMIN VS FUNCIONÁRIO)
// =============================================================================

// 1. FUNÇÃO CENTRALIZADORA (CHAMADA AO CLICAR NO MENU "RECIBOS" OU "MEUS RECIBOS")
window.renderizarPaginaRecibos = function() {
    var user = window.USUARIO_ATUAL;
    var adminPanel = document.getElementById('adminRecibosPanel');
    var empPanel = document.getElementById('employeeRecibosPanel');
    
    // Reseta visibilidade
    if(adminPanel) adminPanel.style.display = 'none';
    if(empPanel) empPanel.style.display = 'none';

    if (user.role === 'admin' || user.role === 'admin_master') {
        // VISÃO DO ADMIN
        if(adminPanel) adminPanel.style.display = 'block';
        renderizarHistoricoRecibosAdmin(); // Renderiza tabela completa
    } else {
        // VISÃO DO FUNCIONÁRIO
        if(empPanel) empPanel.style.display = 'block';
        renderizarMeusRecibosFuncionario(); // Renderiza apenas os seus
    }
};

// 2. VISÃO DO ADMIN: HISTÓRICO COMPLETO COM TODAS AS AÇÕES
window.renderizarHistoricoRecibosAdmin = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Ordena por data de emissão (mais recente primeiro)
    var lista = (CACHE_RECIBOS || []).slice().sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao));
    
    lista.forEach(r => {
        // Status Visual
        var statusLabel = r.enviado ? 
            '<span class="status-pill pill-active"><i class="fas fa-check"></i> ENVIADO</span>' : 
            '<span class="status-pill pill-pending">RASCUNHO</span>';
            
        // Botões de Ação
        var btnVisualizar = `<button class="btn-mini btn-info" onclick="visualizarReciboExistente('${r.id}')" title="Visualizar/Imprimir"><i class="fas fa-eye"></i></button>`;
        var btnEditar = `<button class="btn-mini btn-secondary" onclick="editarRecibo('${r.id}')" title="Editar (Recalcular)"><i class="fas fa-edit"></i></button>`;
        var btnExcluir = `<button class="btn-mini btn-danger" onclick="excluirRecibo('${r.id}')" title="Excluir Permanentemente"><i class="fas fa-trash"></i></button>`;
        
        // Botão de Enviar (Só aparece se ainda não foi enviado)
        var btnEnviar = r.enviado ? '' : 
            `<button class="btn-mini btn-success" onclick="enviarReciboFuncionario('${r.id}')" title="Enviar para Funcionário"><i class="fas fa-paper-plane"></i></button>`;
            
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao)}</td>
            <td>${r.funcionarioNome}</td>
            <td style="font-size:0.85rem;">${r.periodo}</td>
            <td style="font-weight:bold;">${formatarValorMoeda(r.valorTotal)}</td>
            <td>${statusLabel}</td>
            <td>
                ${btnVisualizar}
                ${btnEnviar}
                ${btnEditar}
                ${btnExcluir}
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum recibo gerado ainda.</td></tr>';
    }
};

// 3. VISÃO DO FUNCIONÁRIO: APENAS RECIBOS ENVIADOS PELO ADMIN
window.renderizarMeusRecibosFuncionario = function() {
    var tbody = document.querySelector('#tabelaMeusRecibos tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    var uid = window.USUARIO_ATUAL.uid;

    // Filtra: Pertence a mim E já foi enviado pelo admin
    var meusRecibos = (CACHE_RECIBOS || []).filter(r => String(r.funcionarioId) === String(uid) && r.enviado === true);
    
    // Ordena
    meusRecibos.sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao));

    meusRecibos.forEach(r => {
        var btnImprimir = `<button class="btn-mini btn-info" onclick="visualizarReciboExistente('${r.id}')"><i class="fas fa-print"></i> IMPRIMIR</button>`;
        
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao)}</td>
            <td>${r.periodo}</td>
            <td style="font-weight:bold; color:var(--success-color);">${formatarValorMoeda(r.valorTotal)}</td>
            <td>${btnImprimir}</td>
        `;
        tbody.appendChild(tr);
    });

    if (meusRecibos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhum recibo disponível no momento.</td></tr>';
    }
};

// 4. FUNÇÕES DE AÇÃO (CRUD RECIBOS)

// Visualizar Recibo (Serve tanto para Admin quanto para Funcionário)
window.visualizarReciboExistente = function(reciboId) {
    var r = CACHE_RECIBOS.find(x => x.id === reciboId);
    if(!r) return;

    // Reconstrói o HTML do recibo baseado nos dados salvos
    var htmlRecibo = `
        <div id="printAreaRecibo" style="border:2px solid #333; padding:20px; font-family:'Courier New', monospace; background:#fff; max-width:400px; margin:0 auto;">
            <h3 style="text-align:center; border-bottom:2px dashed #333; padding-bottom:10px;">RECIBO DE PAGAMENTO</h3>
            <p style="text-align:right; font-size:0.8rem;">Emissão: ${formatarDataParaBrasileiro(r.dataEmissao)}</p>
            <p><strong>BENEFICIÁRIO:</strong><br> ${r.funcionarioNome}</p>
            <p><strong>PERÍODO REF.:</strong><br> ${r.periodo}</p>
            
            <div style="margin:20px 0; border:1px solid #ccc; padding:10px; text-align:center;">
                <span style="display:block; font-size:0.9rem;">VALOR LÍQUIDO RECEBIDO</span>
                <strong style="font-size:1.4rem;">${formatarValorMoeda(r.valorTotal)}</strong>
            </div>

            <p style="font-size:0.8rem; text-align:justify;">
                Declaro ter recebido a importância supra citada, referente aos serviços prestados (comissões/diárias) no período descrito.
            </p>
            <br><br>
            <div style="text-align:center; border-top:1px solid #333; margin-top:20px; padding-top:5px;">Assinatura do Beneficiário</div>
            <div style="text-align:center; margin-top:30px; font-size:0.7rem; color:#999;">LOGIMASTER SYSTEM</div>
        </div>
    `;

    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    
    // Ações do Modal (Apenas Imprimir)
    document.getElementById('modalReciboActions').innerHTML = `
        <button class="btn-secondary" onclick="imprimirElemento('printAreaRecibo')">
            <i class="fas fa-print"></i> IMPRIMIR
        </button>
    `;
    
    document.getElementById('modalRecibo').style.display = 'flex';
};

// Função auxiliar de impressão
window.imprimirElemento = function(elemId) {
    var conteudo = document.getElementById(elemId).innerHTML;
    var telaImpressao = window.open('', '', 'height=600,width=800');
    telaImpressao.document.write('<html><head><title>Imprimir Recibo</title>');
    telaImpressao.document.write('</head><body >');
    telaImpressao.document.write(conteudo);
    telaImpressao.document.write('</body></html>');
    telaImpressao.document.close();
    telaImpressao.print();
};

// Excluir Recibo
window.excluirRecibo = async function(reciboId) {
    if(!confirm("Tem certeza que deseja EXCLUIR este recibo do histórico?\nIsso não afetará as operações, apenas o registro do documento.")) return;
    
    var novaLista = CACHE_RECIBOS.filter(r => r.id !== reciboId);
    await salvarListaRecibos(novaLista);
    
    alert("Recibo excluído.");
    renderizarHistoricoRecibosAdmin();
};

// Editar Recibo (Recarrega dados no formulário para gerar novo)
window.editarRecibo = function(reciboId) {
    var r = CACHE_RECIBOS.find(x => x.id === reciboId);
    if(!r) return;

    if(!confirm("A edição carregará os dados para o formulário de 'Novo Recibo'.\n\nVocê deverá clicar em 'CALCULAR' novamente para gerar uma versão atualizada.")) return;

    // Tenta extrair datas da string de período (Ex: "01/01/2024 a 31/01/2024")
    try {
        var partes = r.periodo.split(' a ');
        if(partes.length === 2) {
            // Helper reverso de data (BR -> ISO)
            const brToIso = (d) => {
                var p = d.split('/');
                return `${p[2]}-${p[1]}-${p[0]}`;
            };
            document.getElementById('dataInicioRecibo').value = brToIso(partes[0].trim());
            document.getElementById('dataFimRecibo').value = brToIso(partes[1].trim());
        }
    } catch(e) { console.log("Não foi possível preencher datas auto."); }

    document.getElementById('selectMotoristaRecibo').value = r.funcionarioId;
    
    // Rola para o topo do formulário
    document.getElementById('formRecibo').scrollIntoView({behavior: "smooth"});
};

// 5. UPDATE NO EVENTO DE NAVEGAÇÃO
// Adicione este trecho para garantir que ao clicar no menu, a função correta seja chamada
document.querySelectorAll('.nav-item[data-page="recibos"]').forEach(btn => {
    btn.addEventListener('click', function() {
        // Pequeno delay para garantir que o container da página "recibos" já está visível
        setTimeout(renderizarPaginaRecibos, 100);
    });
});

// =============================================================================
// CORREÇÃO: FUNÇÃO DE ENVIAR RECIBO (ADMIN -> FUNCIONÁRIO)
// =============================================================================

window.enviarReciboFuncionario = async function(reciboId) {
    // 1. Confirmação de Segurança
    if(!confirm("Deseja disponibilizar este recibo para o funcionário visualizar?")) {
        return;
    }
    
    // 2. Busca o recibo no Cache
    var rec = CACHE_RECIBOS.find(r => String(r.id) === String(reciboId));
    
    if(rec) {
        // 3. Marca como enviado
        rec.enviado = true;
        
        // 4. Salva no Banco de Dados
        await salvarListaRecibos(CACHE_RECIBOS);
        
        alert("Recibo enviado com sucesso! O funcionário já pode visualizar.");
        
        // 5. Atualiza a Tabela na Tela
        // Verifica qual função de renderização está disponível para atualizar a tela sem recarregar
        if (typeof renderizarPaginaRecibos === 'function') {
            renderizarPaginaRecibos(); 
        } else if (typeof renderizarHistoricoRecibosAdmin === 'function') {
            renderizarHistoricoRecibosAdmin();
        } else {
            // Se as funções de renderização falharem, recarrega a página
            window.location.reload();
        }
    } else {
        alert("Erro: Recibo não encontrado no sistema.");
    }
};
// =============================================================================
// NOVO: VISUALIZAÇÃO DETALHADA DE CADASTROS (COM CÓPIA)
// =============================================================================

// Helper para Copiar Texto
window.copiarDadosTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => {
        alert("Dados copiados para a área de transferência!");
    }).catch(err => {
        console.error('Erro ao copiar:', err);
        alert("Não foi possível copiar automaticamente. Tente selecionar e copiar manualmente.");
    });
};

// 1. VISUALIZAR FUNCIONÁRIO
window.visualizarFuncionarioDetalhes = function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var dadosTexto = `NOME: ${f.nome}\nFUNÇÃO: ${f.funcao}\nDOC: ${f.documento}\nEMAIL: ${f.email}\nTEL: ${f.telefone}\nPIX: ${f.pix || '-'}\nENDEREÇO: ${f.endereco || '-'}`;
    
    if (f.funcao === 'motorista') {
        dadosTexto += `\nCNH: ${f.cnh || '-'}\nVALIDADE: ${f.validadeCNH || '-'}\nCATEGORIA: ${f.categoriaCNH || '-'}`;
    }

    var html = `
        <div style="font-size:0.9rem; color:#333;">
            <div style="background:#e3f2fd; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid var(--primary-color);">
                <h3 style="margin:0; color:var(--primary-color);">${f.nome}</h3>
                <span class="status-pill pill-active">${f.funcao.toUpperCase()}</span>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><strong>DOCUMENTO:</strong><br>${f.documento}</div>
                <div><strong>TELEFONE:</strong><br>${f.telefone}</div>
                <div style="grid-column: span 2;"><strong>EMAIL:</strong><br>${f.email || '-'}</div>
                <div style="grid-column: span 2;"><strong>ENDEREÇO:</strong><br>${f.endereco || '-'}</div>
                <div style="grid-column: span 2;"><strong>PIX:</strong><br>${f.pix || '-'}</div>
            </div>

            ${f.funcao === 'motorista' ? `
            <div style="margin-top:15px; padding-top:10px; border-top:1px dashed #ccc;">
                <strong>DADOS CNH:</strong><br>
                Nº ${f.cnh || '-'} | Cat: ${f.categoriaCNH || '-'} | Val: ${formatarDataParaBrasileiro(f.validadeCNH)}
            </div>` : ''}
            
            <div style="margin-top:20px; text-align:center;">
                <button class="btn-info" style="width:100%; justify-content:center;" onclick="copiarDadosTexto(\`${dadosTexto}\`)">
                    <i class="fas fa-copy"></i> COPIAR DADOS
                </button>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemTitle').textContent = "DADOS DO FUNCIONÁRIO";
    document.getElementById('viewItemModal').style.display = 'flex';
};

// 2. VISUALIZAR VEÍCULO
window.visualizarVeiculoDetalhes = function(placa) {
    var v = buscarVeiculoPorPlaca(placa);
    if (!v) return;

    var dadosTexto = `VEÍCULO: ${v.modelo}\nPLACA: ${v.placa}\nANO: ${v.ano}\nRENAVAM: ${v.renavam || '-'}\nCHASSI: ${v.chassi || '-'}`;

    var html = `
        <div style="font-size:0.9rem; color:#333;">
            <div style="background:#fff3e0; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid orange;">
                <h3 style="margin:0; color:#e65100;">${v.placa}</h3>
                <span>${v.modelo}</span>
            </div>
            
            <div style="margin-bottom:10px;"><strong>ANO:</strong> ${v.ano}</div>
            <div style="margin-bottom:10px;"><strong>RENAVAM:</strong> ${v.renavam || '-'}</div>
            <div style="margin-bottom:10px;"><strong>CHASSI:</strong> ${v.chassi || '-'}</div>
            
            <div style="margin-top:20px; text-align:center;">
                <button class="btn-info" style="width:100%; justify-content:center;" onclick="copiarDadosTexto(\`${dadosTexto}\`)">
                    <i class="fas fa-copy"></i> COPIAR DADOS
                </button>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemTitle').textContent = "DADOS DO VEÍCULO";
    document.getElementById('viewItemModal').style.display = 'flex';
};

// 3. VISUALIZAR CLIENTE
window.visualizarContratanteDetalhes = function(cnpj) {
    var c = buscarContratantePorCnpj(cnpj);
    if (!c) return;

    var dadosTexto = `CLIENTE: ${c.razaoSocial}\nCNPJ: ${c.cnpj}\nTELEFONE: ${c.telefone}`;

    var html = `
        <div style="font-size:0.9rem; color:#333;">
            <div style="background:#e8f5e9; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid green;">
                <h3 style="margin:0; color:green;">${c.razaoSocial}</h3>
            </div>
            
            <div style="margin-bottom:10px;"><strong>CNPJ:</strong> ${c.cnpj}</div>
            <div style="margin-bottom:10px;"><strong>TELEFONE:</strong> ${c.telefone}</div>
            
            <div style="margin-top:20px; text-align:center;">
                <button class="btn-info" style="width:100%; justify-content:center;" onclick="copiarDadosTexto(\`${dadosTexto}\`)">
                    <i class="fas fa-copy"></i> COPIAR DADOS
                </button>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemTitle').textContent = "DADOS DO CLIENTE";
    document.getElementById('viewItemModal').style.display = 'flex';
};