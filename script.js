// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (CORREÇÃO DE INICIALIZAÇÃO)
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
// Lista de e-mails com permissão de Super Admin (Master)
const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// Variáveis de controle de sessão e interface
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// Status do Sistema (Controle de Licença)
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Mantém dados na RAM para performance)
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

// Formata valor monetário (R$ 1.000,00)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Formata data ISO (YYYY-MM-DD) para Brasileiro (DD/MM/AAAA)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    var partes = dataIso.split('T')[0].split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

// Formata telefone (XX) XXXXX-XXXX
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// Remove acentos para facilitar buscas
function removerAcentos(texto) {
    if(!texto) return "";
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Limpa objetos para salvar no Firebase (remove undefined)
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// -----------------------------------------------------------------------------
// 5. SINCRONIZAÇÃO DE DADOS (NUVEM <-> LOCAL)
// -----------------------------------------------------------------------------

// Baixa todos os dados ao iniciar
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Modo Offline ou Sem Empresa. Usando dados locais.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função interna para baixar uma coleção específica
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Verifica se é objeto único (Empresa) ou Lista (Outros)
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(data.items || []);
                }
                // Salva backup local
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]);
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave}:`, e);
        }
    }

    // Executa todos os downloads em paralelo
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

    console.log(">>> SINCRONIA CONCLUÍDA.");
}

// Carrega dados locais se estiver offline
function carregarTodosDadosLocais() {
    function load(k) { 
        try { return JSON.parse(localStorage.getItem(k)) || []; } catch(e){ return []; } 
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

// Função Genérica de Salvamento
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória
    atualizarCacheCallback(dados);
    // 2. Atualiza LocalStorage
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 3. Atualiza Firebase (se online e ativo)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') return;

        const { db, doc, setDoc } = window.dbRef;
        try {
            var payload = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), payload);
        } catch (erro) {
            console.error("Erro Firebase:", erro);
        }
    }
}

// Atalhos para salvar cada tipo de dado
async function salvarListaFuncionarios(l) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, l, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(l) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, l, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(l) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, l, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(l) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, l, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(d) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, d, (v) => CACHE_MINHA_EMPRESA = v); }
async function salvarListaDespesas(l) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, l, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(l) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, l, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(l) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, l, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(l) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, l, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas Rápidas (Helpers)
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO (LÓGICA FINANCEIRA CORRIGIDA)
// =============================================================================

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES DO DASHBOARD
// -----------------------------------------------------------------------------

// Função para Ocultar/Mostrar valores sensíveis (Privacidade)
window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    if (targets.length === 0) return;

    // Verifica o estado atual baseado no primeiro elemento encontrado
    const isBlurred = targets[0].classList.contains('privacy-blur');

    targets.forEach(el => {
        if (isBlurred) {
            el.classList.remove('privacy-blur');
        } else {
            el.classList.add('privacy-blur');
        }
    });

    // Alterna o ícone do olho
    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

// -----------------------------------------------------------------------------
// CÁLCULOS FINANCEIROS AVANÇADOS (MÉDIA E CONSUMO REAL)
// -----------------------------------------------------------------------------

// Calcula a média de consumo histórica de um veículo (Km Total / Litros Totais)
// Baseado apenas em viagens confirmadas ou finalizadas
window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        var matchPlaca = (o.veiculoPlaca === placa);
        var matchStatus = (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
        return matchPlaca && matchStatus;
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var precoLitro = Number(op.precoLitro) || 0;
        
        // Só considera para a média se houve abastecimento real E rodagem registrada
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

// Obtém o preço médio do combustível pago nas últimas 5 viagens do veículo
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && Number(o.precoLitro) > 0;
    });

    if (ops.length === 0) return 6.00; // Valor de fallback seguro se não houver histórico

    var ultimas = ops.slice(-5); // Pega as últimas 5 viagens
    var somaPrecos = ultimas.reduce(function(acc, curr) {
        return acc + Number(curr.precoLitro);
    }, 0);

    return somaPrecos / ultimas.length;
};

// FUNÇÃO PRINCIPAL DE CUSTO: Calcula o custo de combustível proporcional ao KM rodado
// Fórmula: (KM da Viagem / Média Histórica Km/L) * Preço do Litro
window.calcularCustoCombustivelOperacao = function(op) {
    // Se não tem KM rodado, retorna o valor do abastecimento direto (ou 0)
    if (!op.kmRodado || op.kmRodado <= 0) {
        return Number(op.combustivel) || 0; 
    }
    
    // Se não tem veículo vinculado
    if (!op.veiculoPlaca) {
        return Number(op.combustivel) || 0;
    }

    // Busca a média histórica do veículo
    var mediaConsumo = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    
    // Se não tem histórico (veículo novo ou sem dados suficientes), usa o abastecimento lançado
    if (mediaConsumo <= 0) {
        return Number(op.combustivel) || 0;
    }

    // Define o preço do litro (da operação atual ou média histórica)
    var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // Cálculo final
    return (op.kmRodado / mediaConsumo) * precoLitro;
};

// -----------------------------------------------------------------------------
// LÓGICA CENTRAL DO DASHBOARD
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    // Bloqueia execução se for Super Admin (para não misturar dados globais)
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    console.log("Calculando métricas do Dashboard (Lógica de Consumo Real)...");
    
    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // 1. Processar Operações (Viagens)
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // Custo Combustível Real (Proporcional)
        var custoCombustivelCalculado = window.calcularCustoCombustivelOperacao(op);

        // Custos da Operação (Despesas + Combustível Calculado)
        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        // Comissão Motorista (se não faltou)
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        // Ajudantes (se não faltaram)
        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var ajudanteFaltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!ajudanteFaltou) {
                    custoOp += (Number(aj.diaria) || 0);
                }
            });
        }

        // Receita Total (Histórico Vitalício) - Apenas confirmadas/finalizadas
        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        // Somar ao Mês Atual se coincidir a data
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
            // À Vista: Soma total se for no mês atual
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += valorTotal;
            }
        }
    });

    // Cálculos Finais
    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    // Atualiza Elementos do DOM (Cards Coloridos)
    if (document.getElementById('faturamentoMes')) {
        document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoMes);
        document.getElementById('despesasMes').textContent = formatarValorMoeda(custosMes);
        document.getElementById('receitaMes').textContent = formatarValorMoeda(lucroMes);
        document.getElementById('receitaTotalHistorico').textContent = formatarValorMoeda(receitaHistorico); // Se existir esse ID no HTML
        document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    }

    // Atualiza o Gráfico após calcular os dados
    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// -----------------------------------------------------------------------------
// GRÁFICOS (Chart.js)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    // Filtros do Gráfico
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
        litrosTotal: 0 // Para cálculo de média no resumo
    };

    var gReceita = 0;
    var gCombustivel = 0;
    var gPessoal = 0; 
    var gManutencao = 0; 

    // 1. Processar Operações para o Gráfico
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        
        // Aplica Filtros
        if (filtroVeiculo && op.veiculoPlaca !== filtroVeiculo) return;
        if (filtroMotorista && op.motoristaId !== filtroMotorista) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            
            // Contagem de Faltas (se filtro motorista ativo)
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
                     if (!faltou) comissaoOp += (Number(aj.diaria)||0);
                });
            }

            stats.viagens++;
            stats.faturamento += receitaOp;
            stats.custos += (combustivelOp + despesasOp + comissaoOp);
            stats.kmTotal += (Number(op.kmRodado) || 0);

            // Categorias do Gráfico
            gReceita += receitaOp;
            gCombustivel += combustivelOp;
            gPessoal += comissaoOp; 
            gManutencao += despesasOp; 

            // Litros reais para estatística de média no resumo (não custo)
            var precoReal = Number(op.precoLitro) || 0;
            if (precoReal > 0 && Number(op.combustivel) > 0) {
                stats.litrosTotal += (Number(op.combustivel) / precoReal);
            }
        }
    });

    // 2. Processar Despesas Gerais para o Gráfico
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

            // Categorização simples por palavra-chave
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

    // Renderiza Resumo Acima do Gráfico
    if (summaryContainer) {
        summaryContainer.innerHTML = ''; 
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
                    <div class="veh-stat-box"><small>${tituloBox}</small><span>${valorTitulo}</span></div>
                    <div class="veh-stat-box"><small>VIAGENS (MÊS)</small><span>${stats.viagens}</span></div>
                    <div class="veh-stat-box"><small>FATURAMENTO</small><span style="color:var(--success-color)">${formatarValorMoeda(stats.faturamento)}</span></div>
                    <div class="veh-stat-box"><small>${boxExtraLabel}</small><span style="color:${boxExtraColor}">${boxExtraValue}</span></div>
                    <div class="veh-stat-box"><small>LUCRO EST.</small><span style="color:${stats.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatarValorMoeda(stats.lucro)}</span></div>
                </div>
            `;
        }
    }

    // Destrói gráfico antigo e cria novo
    if (window.chartInstance) window.chartInstance.destroy();
    
    var lucroFinal = gReceita - (gCombustivel + gPessoal + gManutencao);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL (REAL)', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
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
// 6. LÓGICA DO CALENDÁRIO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

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

    // Dias vazios do início do mês
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
            
            // Closure para garantir que o clique abra o dia correto
            (function(ds) {
                cell.onclick = function() { abrirModalDetalhesDia(ds); };
            })(dateStr);
        } else {
            // Se não tem operação, clica para criar nova
            (function(ds) {
                cell.onclick = function() { 
                    document.getElementById('operacaoData').value = ds;
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
        if (!op.checkins || !op.checkins.faltaMotorista) custoOp += (Number(op.comissao)||0);
        if (op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) custoOp += (Number(aj.diaria)||0); });
        
        totalCustos += custoOp;
    });

    var totalLucro = totalFat - totalCustos;

    if (modalSummary) {
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px; text-align:center; background:#f5f5f5; padding:8px; border-radius:6px; font-size:0.85rem;">
                <div><small>FAT</small><br><strong style="color:var(--success-color)">${formatarValorMoeda(totalFat)}</strong></div>
                <div><small>CUSTO</small><br><strong style="color:var(--danger-color)">${formatarValorMoeda(totalCustos)}</strong></div>
                <div><small>LUCRO</small><br><strong style="color:${totalLucro >= 0 ? 'var(--primary-color)' : 'red'}">${formatarValorMoeda(totalLucro)}</strong></div>
            </div>
        `;
    }

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;">';
    
    if(operacoesDoDia.length === 0) {
        htmlLista += '<p style="text-align:center; color:#666;">Nenhuma operação.</p>';
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
                    ${op.veiculoPlaca} | Mot: ${nomeMot}
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
// CONTROLE DE ABAS (TABS)
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
            // Isso garante que os dados estejam sempre frescos na tela
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
        
        // Feedback visual no botão
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
            
            // Verifica se é um novo cadastro com criação de login (Senha preenchida)
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                
                try {
                    // Tenta criar o usuário no Firebase Authentication
                    novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Se sucesso, salva o perfil do usuário no Firestore
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
                    // TRATAMENTO ESPECÍFICO: Se o e-mail já existe no Auth
                    if (authError.code === 'auth/email-already-in-use') {
                        var confirmar = confirm(`O e-mail "${email}" JÁ POSSUI UM LOGIN no sistema.\n\nDeseja cadastrar os dados do funcionário mesmo assim? (O login antigo será mantido).`);
                        
                        if (!confirmar) {
                            throw new Error("Operação cancelada pelo usuário.");
                        }
                        // Se confirmar, prossegue usando o ID gerado por data, sem criar novo Auth
                    } else {
                        throw authError; // Lança outros erros (ex: senha fraca)
                    }
                }
            }

            // Monta o objeto do funcionário
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
            
            // Atualiza senha visual se foi alterada
            if (senha) { 
                funcionarioObj.senhaVisual = senha; 
            }

            // Atualiza a lista local (Remove antigo se existir e adiciona novo)
            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            
            // Salva na nuvem
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário Salvo com Sucesso!");
            e.target.reset(); 
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); 
            preencherTodosSelects(); // Atualiza tabelas

        } catch (erro) { 
            // Ignora erro se foi cancelamento intencional
            if (erro.message !== "Operação cancelada pelo usuário.") {
                alert("Erro: " + erro.message); 
            }
        } finally { 
            // Restaura o botão
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
        
        // Define status inicial
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
        // Preserva status de andamento se estiver editando
        if (opAntiga && !isAgendamento) {
            if (opAntiga.status === 'EM_ANDAMENTO' || opAntiga.status === 'FINALIZADA') {
                statusFinal = opAntiga.status; 
            }
        }
        
        // Preserva check-ins existentes
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
            
            // Atualiza toda a interface impactada
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

// Mostra/Oculta campos de CNH se função for Motorista
window.toggleDriverFields = function() { 
    var select = document.getElementById('funcFuncao'); 
    var div = document.getElementById('driverSpecificFields'); 
    if (select && div) {
        div.style.display = (select.value === 'motorista') ? 'block' : 'none';
    }
};

// Mostra/Oculta campos de Parcelamento
window.toggleDespesaParcelas = function() { 
    var modo = document.getElementById('despesaModoPagamento').value; 
    var div = document.getElementById('divDespesaParcelas'); 
    if (div) {
        div.style.display = (modo === 'parcelado') ? 'flex' : 'none';
    }
};

// Renderiza lista de ajudantes adicionados na tela de operação
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
    if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Este ajudante já foi adicionado.");
    
    var valor = prompt("Valor da Diária:"); 
    if (valor) { 
        window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); 
        renderizarListaAjudantesAdicionados(); 
        sel.value = ""; 
    } 
});

// Limpa filtro cruzado nos gráficos
window.limparOutroFiltro = function(tipo) { 
    if (tipo === 'motorista') { 
        document.getElementById('filtroMotoristaGrafico').value = ""; 
    } else { 
        document.getElementById('filtroVeiculoGrafico').value = ""; 
    } 
};

// -----------------------------------------------------------------------------
// 9. RENDERIZAÇÃO DE TABELAS E SELECTS (FUNÇÃO MESTRE)
// -----------------------------------------------------------------------------

function preencherTodosSelects() {
    console.log("Atualizando tabelas e selects da interface...");
    
    // Helper interno para preencher selects
    const fill = (id, dados, valKey, textKey, defText) => { 
        var el = document.getElementById(id); 
        if (!el) return; 
        var atual = el.value; 
        el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); 
        if(atual) el.value = atual; 
    };
    
    // Preenche Selects
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

    // Renderiza Tabelas
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    // Renderiza Paineis Dinâmicos se as funções existirem
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
                <button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> 
                <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `; 
        tbody.appendChild(tr);
    }); 
}

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

function renderizarTabelaOperacoes() { 
    var tbody = document.querySelector('#tabelaOperacoes tbody'); 
    if(tbody) { 
        tbody.innerHTML=''; 
        var lista = CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)); 
        lista.forEach(op => { 
            if(op.status==='CANCELADA') return; 
            var m = buscarFuncionarioPorId(op.motoristaId)?.nome || 'Excluído'; 
            
            // Botões de Ação na Tabela de Operações
            var btns = window.MODO_APENAS_LEITURA ? '' : `
                <button class="btn-mini btn-info" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            `;

            var tr=document.createElement('tr'); 
            tr.innerHTML=`<td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td>${btns}</td>`; 
            tbody.appendChild(tr); 
        }); 
    } 
}

// Modal de Visualização de Operação (Detalhes Completos)
window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    // Recupera dados relacionados
    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'Não encontrado';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Não encontrado';
    var servico = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    
    // Lista de Ajudantes
    var htmlAjudantes = 'Nenhum';
    if (op.ajudantes && op.ajudantes.length > 0) {
        htmlAjudantes = '<ul style="margin:5px 0 0 20px; padding:0;">' + 
            op.ajudantes.map(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                return `<li>${f ? f.nome : 'Excluído'} (Diária: ${formatarValorMoeda(aj.diaria)})</li>`;
            }).join('') + '</ul>';
    }

    // CUSTO REAL NO MODAL
    var custoComb = window.calcularCustoCombustivelOperacao(op);
    var custoTotal = (Number(op.despesas)||0) + custoComb + (Number(op.comissao)||0);
    if(op.ajudantes) op.ajudantes.forEach(aj => custoTotal += (Number(aj.diaria)||0));
    var lucro = (Number(op.faturamento)||0) - custoTotal;

    var html = `
        <div style="font-size: 0.9rem; color:#333;">
            <div style="background:#f8f9fa; padding:15px; border-radius:6px; margin-bottom:15px; border-left: 5px solid var(--primary-color);">
                <h3 style="margin:0 0 5px 0; color:var(--primary-color);">OPERAÇÃO #${op.id.substr(-4)}</h3>
                <p><strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                <p><strong>STATUS:</strong> ${op.status}</p>
                <p><strong>CLIENTE:</strong> ${cliente}</p>
                <p><strong>SERVIÇO:</strong> ${servico}</p>
            </div>

            <div style="margin-bottom:15px;">
                <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">VEÍCULO & EQUIPE</h4>
                <p><strong>VEÍCULO:</strong> ${op.veiculoPlaca}</p>
                <p><strong>MOTORISTA:</strong> ${nomeMot}</p>
                <p><strong>AJUDANTES:</strong></p>
                ${htmlAjudantes}
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#e8f5e9; padding:10px; border-radius:6px;">
                    <h4 style="margin:0 0 5px 0; color:var(--success-color);">RECEITA</h4>
                    <p style="font-size:1.1rem; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</p>
                    <small>Adiantamento: ${formatarValorMoeda(op.adiantamento)}</small>
                </div>
                <div style="background:#ffebee; padding:10px; border-radius:6px;">
                    <h4 style="margin:0 0 5px 0; color:var(--danger-color);">CUSTOS REAIS</h4>
                    <p>Combustível (Est.): ${formatarValorMoeda(custoComb)}</p>
                    <p>Despesas: ${formatarValorMoeda(op.despesas)}</p>
                    <hr>
                    <p><strong>TOTAL: ${formatarValorMoeda(custoTotal)}</strong></p>
                </div>
            </div>
            
            <div style="background:#e3f2fd; padding:10px; border-radius:6px; text-align:center;">
                <small>LUCRO LÍQUIDO</small><br>
                <strong style="font-size:1.3rem; color:${lucro>=0?'#007bff':'red'}">${formatarValorMoeda(lucro)}</strong>
            </div>
        </div>
    `;

    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'flex';
};

// Funções de Exclusão (Helpers)
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

// Funções de Preenchimento de Formulário (Edição)
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

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra apenas viagens Agendadas ou Em Andamento
    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    // Atualiza contador no menu lateral (Badge Vermelho)
    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
    }

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa no momento.</td></tr>';
        return;
    }

    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        
        // Status Visual
        var statusHtml = op.status === 'EM_ANDAMENTO' 
            ? '<span class="status-pill" style="background:orange; color:white; animation: pulse 2s infinite;">EM ROTA</span>' 
            : '<span class="status-pill pill-pending">AGENDADA</span>';

        // 1. Linha do Motorista Principal
        var mot = buscarFuncionarioPorId(op.motoristaId);
        if (mot) {
            var faltouMot = (op.checkins && op.checkins.faltaMotorista);
            var checkInFeito = (op.checkins && op.checkins.motorista); 
            
            var statusEquipe = checkInFeito 
                ? '<span style="color:green"><i class="fas fa-check"></i> INICIADO</span>' 
                : '<span style="color:#999">AGUARDANDO</span>';
            
            if (faltouMot) {
                statusEquipe = '<span style="color:red; font-weight:bold;">FALTA</span>';
            }

            var btnFaltaMot = faltouMot 
                ? '-' 
                : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${mot.id}', 'motorista')">FALTA</button>`;

            var nomeDisplay = faltouMot ? `<s style="color:#999;">${mot.nome}</s>` : `<strong>${mot.nome}</strong> (Mot)`;

            var trM = document.createElement('tr');
            trM.innerHTML = `
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${nomeDisplay}<br><small>${op.veiculoPlaca}</small></td>
                <td>${cliente}</td>
                <td>${statusHtml}</td>
                <td>${statusEquipe}</td>
                <td>${btnFaltaMot}</td>
            `;
            tbody.appendChild(trM);
        }

        // 2. Linhas dos Ajudantes (Vinculados à mesma operação)
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(ajItem => {
                var aj = buscarFuncionarioPorId(ajItem.id);
                if (aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = faltouAj
                        ? '-'
                        : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}', '${aj.id}', 'ajudante')">FALTA</button>`;
                    
                    var nomeAjDisplay = faltouAj ? `<s style="color:#999;">${aj.nome}</s>` : `${aj.nome} (Ajud)`;

                    var trA = document.createElement('tr');
                    trA.style.background = "#f9f9f9"; 
                    trA.innerHTML = `
                        <td style="border:none;"></td>
                        <td>${nomeAjDisplay}</td>
                        <td style="color:#777;"><small>^ Vinculado</small></td>
                        <td>${statusHtml}</td>
                        <td>-</td>
                        <td>${btnFaltaAj}</td>
                    `;
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

    // Inicializa estrutura de checkins se não existir
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
        
        // Faltas de Motoristas
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) {
                var tr = document.createElement('tr');
                tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td>`;
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
                        tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${a.nome}</td><td>AJUDANTE</td><td>FALTA</td><td>-</td>`;
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
                // (Sem Editar/Excluir aqui, conforme regra)
                var btnBloquear = isBlocked 
                    ? `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR ACESSO"><i class="fas fa-lock"></i></button>`
                    : `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR ACESSO"><i class="fas fa-unlock"></i></button>`;

                var btnStatus = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="VER STATUS"><i class="fas fa-eye"></i></button>`;

                tr.innerHTML = `
                    <td>${f.nome}</td>
                    <td>${f.funcao.toUpperCase()}</td>
                    <td>${isBlocked ? '<span style="color:red; font-weight:bold;">BLOQUEADO</span>' : '<span style="color:green;">ATIVO</span>'}</td>
                    <td>
                        ${btnBloquear}
                        ${btnStatus}
                    </td>
                `;
                tbodyAtivos.appendChild(tr);
            });
        }
    }

    // 2. Tabela de Pendentes (Aprovação de novos cadastros)
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
    
    // 3. Tabela de Solicitações de Dados (Profile Requests)
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

// Modal de Status do Funcionário
window.verStatusFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var container = document.getElementById('statusFuncionarioBody');
    var actions = document.getElementById('statusFuncionarioActions');
    
    container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando status...';
    document.getElementById('modalStatusFuncionario').style.display = 'flex';

    // Verifica se está em rota atualmente
    var emRota = false;
    var veiculoRota = "";
    var opAtiva = CACHE_OPERACOES.find(o => o.status === 'EM_ANDAMENTO' && (o.motoristaId === id || (o.ajudantes && o.ajudantes.some(a=>a.id===id))));
    if (opAtiva) {
        emRota = true;
        veiculoRota = opAtiva.veiculoPlaca;
    }

    var isBlocked = f.isBlocked || false;

    // Renderiza HTML do Status
    var html = `
        <h2 style="color:var(--primary-color); margin:0 0 5px 0;">${f.nome}</h2>
        <p style="color:#666;">${f.funcao.toUpperCase()}</p>
        <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
            <div style="background:#f8f9fa; padding:10px; border-radius:6px;">
                <small style="display:block; font-weight:bold; color:#555;">SITUAÇÃO</small>
                ${isBlocked ? '<span style="color:red; font-weight:bold; font-size:1.2rem;">BLOQUEADO</span>' : '<span style="color:green; font-weight:bold; font-size:1.2rem;">ATIVO</span>'}
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:6px;">
                <small style="display:block; font-weight:bold; color:#555;">ROTA ATUAL</small>
                ${emRota ? `<span style="color:orange; font-weight:bold; font-size:1.1rem;">EM ROTA<br><small style="color:#333">${veiculoRota}</small></span>` : '<span style="color:#999; font-weight:bold; font-size:1.2rem;">DISPONÍVEL</span>'}
            </div>
        </div>
    `;
    container.innerHTML = html;

    // Ação Rápida no Modal
    var btnLabel = isBlocked ? 'DESBLOQUEAR ACESSO' : 'BLOQUEAR ACESSO';
    var btnClass = isBlocked ? 'btn-success' : 'btn-danger';
    
    actions.innerHTML = `<button class="${btnClass}" style="width:100%; padding:12px; font-size:1rem;" onclick="toggleBloqueioFunc('${f.id}')"><i class="fas fa-power-off"></i> ${btnLabel}</button>`;
};

// Toggle de Bloqueio
window.toggleBloqueioFunc = async function(id) {
    var f = buscarFuncionarioPorId(id);
    if (!f) return;

    var newStatus = !f.isBlocked;
    var actionName = newStatus ? "BLOQUEAR" : "DESBLOQUEAR";
    
    if (!confirm(`Tem certeza que deseja ${actionName} o funcionário ${f.nome}?`)) return;

    // Atualiza na Nuvem (Auth control)
    if (window.dbRef) {
        try {
            await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { isBlocked: newStatus });
        } catch(e) {
            alert("Erro ao atualizar: " + e.message);
            return;
        }
    }

    // Atualiza Cache Local
    f.isBlocked = newStatus;
    await salvarListaFuncionarios(CACHE_FUNCIONARIOS);

    alert(`Usuário ${newStatus ? 'BLOQUEADO' : 'DESBLOQUEADO'}.`);
    document.getElementById('modalStatusFuncionario').style.display = 'none';
    renderizarPainelEquipe();
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
// 3. RELATÓRIOS (COM CÁLCULO DE COMBUSTÍVEL PROPORCIONAL)
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
            
            // CUSTO COMBUSTÍVEL REAL (PROPORCIONAL)
            var custoComb = window.calcularCustoCombustivelOperacao(op);
            
            var cust = (Number(op.despesas)||0) + custoComb;
            
            if (!op.checkins || !op.checkins.faltaMotorista) cust += (Number(op.comissao)||0);
            if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) cust += (Number(aj.diaria)||0); });
            
            vStats.fat += rec; 
            vStats.custo += cust; 
            vStats.lucro += (rec - cust); 
            vStats.km += (Number(op.kmRodado)||0);
            
            // Dados para média histórica
            var preco = Number(op.precoLitro)||0; 
            var comb = Number(op.combustivel)||0;
            if(preco > 0 && comb > 0) vStats.litros += (comb/preco);
        });
        
        var mediaKmL = vStats.litros > 0 ? (vStats.km / vStats.litros) : 0;
        
        htmlCabecalho = `
            <div style="background:#e3f2fd; padding:15px; margin-bottom:20px; border-radius:8px;">
                <h3 style="color:#1565c0;">VEÍCULO: ${veiculoSelecionado}</h3>
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-top:10px;">
                    <div><strong>Fat:</strong> ${formatarValorMoeda(vStats.fat)}</div>
                    <div><strong>Custo Real:</strong> ${formatarValorMoeda(vStats.custo)}</div>
                    <div><strong>Lucro:</strong> <span style="color:${vStats.lucro>=0?'green':'red'}">${formatarValorMoeda(vStats.lucro)}</span></div>
                    <div><strong>KM:</strong> ${vStats.km}</div>
                    <div><strong>Média Geral:</strong> ${mediaKmL.toFixed(2)} Km/L</div>
                </div>
            </div>`;
    }

    var html = `
        <div style="text-align:center; margin-bottom:20px;"><h3>RELATÓRIO FINANCEIRO (CUSTO REAL)</h3></div>
        ${htmlCabecalho}
        <table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>CLIENTE</th><th>FATURAMENTO</th><th>CUSTO (EST.)</th><th>LUCRO</th></tr></thead><tbody>
    `;

    var totalFat = 0; var totalLucro = 0; var totalCusto = 0;
    
    ops.forEach(op => {
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var receita = Number(op.faturamento)||0;
        
        // CUSTO REAL NA TABELA
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        var custo = (Number(op.despesas)||0) + custoComb;
        
        if (!op.checkins || !op.checkins.faltaMotorista) custo += (Number(op.comissao)||0);
        if(op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins?.faltas?.[aj.id])) custo += (Number(aj.diaria)||0); });
        
        var lucro = receita - custo; 
        totalFat += receita; totalCusto += custo; totalLucro += lucro;
        
        html += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${cli ? cli.razaoSocial.substring(0,15) : '-'}</td><td>${formatarValorMoeda(receita)}</td><td>${formatarValorMoeda(custo)}</td><td style="color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td></tr>`;
    });
    html += `<tr style="background:#f5f5f5; font-weight:bold;"><td colspan="3" style="text-align:right;">TOTAIS:</td><td>${formatarValorMoeda(totalFat)}</td><td>${formatarValorMoeda(totalCusto)}</td><td style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</td></tr></tbody></table>`;

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
    html2pdf().set({ margin: 10, filename: 'Relatorio.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).save();
};

// -----------------------------------------------------------------------------
// 4. RECIBOS E LÓGICA DO FUNCIONÁRIO
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
            opsEnvolvidas.push({ data: op.data, valor: valorGanho });
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
    alert("Recibo salvo!"); document.getElementById('modalRecibo').style.display = 'none'; renderizarHistoricoRecibos();
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (CACHE_RECIBOS || []).sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        var statusLabel = r.enviado ? '<span class="status-pill pill-active">ENVIADO</span>' : '<span class="status-pill pill-pending">NÃO ENVIADO</span>';
        var btnEnviar = r.enviado ? '' : `<button class="btn-mini btn-primary" onclick="enviarReciboFuncionario('${r.id}')" title="Enviar"><i class="fas fa-paper-plane"></i></button>`;
        tbody.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${statusLabel}</td><td>${btnEnviar}</td></tr>`;
    });
};

window.enviarReciboFuncionario = async function(reciboId) {
    if(!confirm("Enviar recibo?")) return;
    var rec = CACHE_RECIBOS.find(r => r.id === reciboId);
    if(rec) {
        rec.enviado = true;
        await salvarListaRecibos(CACHE_RECIBOS);
        renderizarHistoricoRecibos();
        alert("Enviado com sucesso!");
    }
};

window.renderizarCheckinFuncionario = function() {
    var container = document.getElementById('checkin-container'); 
    if (!container) return;
    var uid = window.USUARIO_ATUAL.uid;
    
    var opsPendentes = CACHE_OPERACOES.filter(op => {
        return (op.motoristaId === uid && op.status !== 'CANCELADA' && (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO'));
    });

    if (opsPendentes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma viagem.</p>';
        return;
    }

    var html = '';
    opsPendentes.forEach(op => {
        var btnAcao = op.status === 'AGENDADA' 
            ? `<button class="btn-success" style="width:100%;" onclick="confirmarInicioViagem('${op.id}')">INICIAR VIAGEM</button>`
            : `<button class="btn-warning" style="width:100%;" onclick="finalizarViagem('${op.id}')">FINALIZAR VIAGEM</button>`;
        html += `<div style="background:white; border:1px solid #ddd; padding:15px; margin-bottom:15px;"><h4>${op.veiculoPlaca}</h4><p>${formatarDataParaBrasileiro(op.data)}</p>${btnAcao}</div>`;
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
        await salvarListaOperacoes(CACHE_OPERACOES);
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
        await salvarListaOperacoes(CACHE_OPERACOES);
        renderizarCheckinFuncionario();
        alert("Finalizada!");
    }
};

window.filtrarServicosFuncionario = function(uid) {
    var dataInicio = document.getElementById('dataInicioServicosFunc')?.value;
    var dataFim = document.getElementById('dataFimServicosFunc')?.value;

    var minhasOps = CACHE_OPERACOES.filter(op => {
        var ehMotorista = (op.motoristaId === uid);
        var ehAjudante = (op.ajudantes && op.ajudantes.some(aj => aj.id === uid));
        var dataOk = (!dataInicio || op.data >= dataInicio) && (!dataFim || op.data <= dataFim);
        return (ehMotorista || ehAjudante) && op.status !== 'CANCELADA' && dataOk;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    var tbody = document.getElementById('tabelaMeusServicos')?.querySelector('tbody');
    if(tbody) {
        tbody.innerHTML = '';
        minhasOps.forEach(op => {
            var val = (op.motoristaId === uid) ? (Number(op.comissao)||0) : (Number(op.ajudantes.find(x => x.id === uid).diaria)||0);
            tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${formatarValorMoeda(val)}</td></tr>`;
        });
    }

    var tbodyRec = document.getElementById('tabelaMeusRecibos')?.querySelector('tbody');
    if(tbodyRec) {
        var meusRecibos = CACHE_RECIBOS.filter(r => String(r.funcionarioId) === String(uid) && r.enviado === true);
        tbodyRec.innerHTML = '';
        meusRecibos.forEach(r => {
            tbodyRec.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.periodo}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>OK</td></tr>`;
        });
    }
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 1. PAINEL SUPER ADMIN (VISUAL LIMPO E FUNCIONAL)
// -----------------------------------------------------------------------------

// Carrega a lista de empresas e usuários para o Super Admin
window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando dados globais...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        
        // Busca todas as empresas e todos os usuários do banco de dados
        const companiesSnap = await getDocs(collection(db, "companies"));
        const usersSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        companiesSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        
        const users = [];
        usersSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if(companies.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma empresa encontrada no sistema.</div>';
            return;
        }

        // Renderiza cada empresa como um item de lista expansível (Accordion)
        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            // Lógica de Status para exibição visual
            let statusBadge = "";
            let borderColor = "#ddd"; // Cinza padrão

            if (comp.isBlocked) {
                statusBadge = '<span class="status-pill pill-blocked">BLOQUEADO</span>';
                borderColor = "var(--danger-color)";
            } else if (comp.isVitalicio) {
                statusBadge = '<span class="status-pill pill-active">VITALÍCIO</span>';
                borderColor = "gold";
            } else {
                // Verifica vencimento
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

            // Valores seguros para passar na função onclick
            const safeValidity = comp.systemValidity || '';
            const safeVitalicio = comp.isVitalicio || false;
            const safeBlocked = comp.isBlocked || false;

            const div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = `margin-bottom:15px; border:1px solid ${borderColor}; border-radius:8px; background:white; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.05);`;

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
                        <div>
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

// Formulário de Criação de Empresa (Super Admin)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("O domínio da empresa deve ter pelo menos 3 letras.");

        try {
            // 1. Cria o usuário Admin no Auth e no Firestore
            var uid = await window.dbRef.criarAuthUsuario(email, senha);
            
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
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString() // 30 dias grátis inicial
            });

        } catch (erro) {
            // Se o e-mail já existe, permite criar só a empresa (caso seja um admin reaproveitado ou erro de digitação anterior)
            if (erro.code === 'auth/email-already-in-use') {
                if(!confirm(`O e-mail ${email} JÁ EXISTE no sistema.\n\nDeseja criar apenas a estrutura da empresa "${dominio}"?`)) {
                    return;
                }
            } else {
                return alert("Erro fatal ao criar usuário: " + erro.message);
            }
        }

        try {
            // 2. Cria o documento da Empresa
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
            alert("Erro ao salvar empresa no banco: " + dbError.message);
        }
    }
});

// Modal de Gerenciamento de Créditos e Status da Empresa
window.abrirModalCreditos = function(companyId, validade, isVitalicio, isBlocked) {
    document.getElementById('empresaIdCredito').value = companyId;
    document.getElementById('nomeEmpresaCredito').textContent = companyId.toUpperCase();
    
    var textoValidade = isVitalicio ? "VITALÍCIO" : (validade ? formatarDataParaBrasileiro(validade.split('T')[0]) : "SEM REGISTRO");
    document.getElementById('validadeAtualCredito').textContent = textoValidade;
    
    // Configura Checkboxes com segurança
    var elVitalicio = document.getElementById('checkVitalicio');
    var elBloqueado = document.getElementById('checkBloqueado');
    var elDivAdd = document.getElementById('divAddCreditos');

    if(elVitalicio) {
        elVitalicio.checked = isVitalicio;
        // Mostra/Oculta campo de meses baseado no checkbox vitalício
        elVitalicio.onchange = function() { 
            if(elDivAdd) elDivAdd.style.display = this.checked ? 'none' : 'block'; 
        };
        // Estado inicial
        if(elDivAdd) elDivAdd.style.display = isVitalicio ? 'none' : 'block';
    }
    
    if(elBloqueado) elBloqueado.checked = isBlocked;
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

// Salvar alterações de créditos/status da empresa
window.salvarCreditosEmpresa = async function() {
    var companyId = document.getElementById('empresaIdCredito').value;
    var isVitalicio = document.getElementById('checkVitalicio').checked;
    var isBloqueado = document.getElementById('checkBloqueado').checked;
    var meses = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        const { db, collection, query, where, getDocs, doc, setDoc, writeBatch } = window.dbRef;
        
        var dadosEmpresa = { isVitalicio: isVitalicio, isBlocked: isBloqueado };
        var novaData = null;

        // Se não for vitalício nem bloqueado, calcula nova data de validade
        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            
            var base = new Date();
            // Tenta pegar a data atual do admin para somar (não perder dias já pagos)
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

        // 1. Atualiza documento da Empresa
        await setDoc(doc(db, "companies", companyId), dadosEmpresa, { merge: true });
        
        // 2. Atualiza TODOS os usuários da empresa (Batch Update) para refletir o status
        const qUsers = query(collection(db, "users"), where("company", "==", companyId));
        const snapUsers = await getDocs(qUsers);
        const batch = writeBatch(db);
        
        snapUsers.forEach(uDoc => {
            let updateData = { isBlocked: isBloqueado, isVitalicio: isVitalicio };
            if (novaData) updateData.systemValidity = novaData;
            batch.update(uDoc.ref, updateData);
        });
        
        await batch.commit();

        alert("Alterações salvas com sucesso!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();

    } catch(e) { 
        alert("Erro ao salvar: " + e.message); 
    }
};

window.excluirEmpresaTotal = async function(companyId) {
    var confirmacao = prompt(`ATENÇÃO PERIGO:\nIsso apagará TODOS os dados, usuários e registros da empresa "${companyId}".\n\nPara confirmar, digite "DELETAR":`);
    
    if (confirmacao !== "DELETAR") return;
    
    try {
        const { db, collection, query, where, getDocs, doc, writeBatch } = window.dbRef;
        const batch = writeBatch(db);
        
        // 1. Deleta usuários
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
        // 2. Deleta documento da empresa
        batch.delete(doc(db, "companies", companyId));
        
        await batch.commit();
        
        alert("Empresa excluída permanentemente.");
        carregarPainelSuperAdmin();
    } catch (e) { 
        alert("Erro ao excluir: " + e.message); 
    }
};

window.excluirUsuarioGlobal = async function(uid) {
    if(!confirm("Tem certeza que deseja excluir este usuário do banco de dados?")) return;
    try { 
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid)); 
        carregarPainelSuperAdmin(); 
    } catch(e) { 
        alert(e.message); 
    }
};

// Reset de senha forçado (Recria o Auth mantendo o ID se possível, ou migrando dados)
window.resetarSenhaComMigracao = async function(uid, email, nome) {
    var novaSenha = prompt(`Digite a nova senha para ${email}:`);
    if(novaSenha) {
        try {
            // Cria novo Auth
            let novoUid = await window.dbRef.criarAuthUsuario(email, novaSenha);
            
            // Lê dados antigos
            var oldDocRef = window.dbRef.doc(window.dbRef.db, "users", uid);
            var oldDoc = await window.dbRef.getDoc(oldDocRef);
            
            if(oldDoc.exists()){
                var dados = oldDoc.data();
                dados.uid = novoUid; // Atualiza ID
                dados.senhaVisual = novaSenha;
                
                // Salva com novo ID
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUid), dados);
                
                // Apaga antigo
                await window.dbRef.deleteDoc(oldDocRef);
            }
            alert("Senha alterada com sucesso!"); 
            carregarPainelSuperAdmin();
        } catch(e){ 
            alert("Erro ao resetar: " + e.message); 
        }
    }
};

// -----------------------------------------------------------------------------
// 2. MEUS DADOS (PERFIL DO USUÁRIO)
// -----------------------------------------------------------------------------

window.renderizarMeusDados = function() {
    var user = window.USUARIO_ATUAL;
    // Tenta pegar dados completos do cache local se disponível
    var dados = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(user.uid)) || user;
    
    var container = document.getElementById('meusDadosContainer');
    if(!container) return;

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

// Helper para criar linha de dados com botão de edição
function makeLine(label, val, fieldCode) {
    var btn = fieldCode ? 
        `<button class="btn-mini btn-secondary" onclick="solicitarAlteracao('${fieldCode}', '${val}')" title="Solicitar Alteração"><i class="fas fa-pen"></i></button>` : 
        '';
        
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f8f9fa;">
            <div>
                <span style="font-size:0.8rem; color:#888; display:block;">${label}</span>
                <span style="font-size:1rem; color:#333; font-weight:600;">${val || '-'}</span>
            </div>
            ${btn}
        </div>
    `;
}

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
        
        salvarProfileRequests(lista).then(() => alert("Solicitação enviada para aprovação do administrador."));
    }
};

// -----------------------------------------------------------------------------
// 3. INICIALIZAÇÃO E ROTEAMENTO (ESSENCIAL)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> SISTEMA INICIADO. PERFIL:", user.role);
    window.USUARIO_ATUAL = user;

    // 1. Reseta a interface (Esconde tudo inicialmente para evitar flash)
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = 'none'; 
        p.classList.remove('active'); 
    });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // 2. Verifica se é Super Admin (Master)
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

    // 3. Carrega dados da empresa (Sync)
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects(); // Popula selects e tabelas com os dados baixados

    // 4. Roteamento Comum (Admin ou Funcionário)
    if (user.role === 'admin') {
        // Verifica Bloqueio
        if (user.isBlocked) {
            document.body.innerHTML = "<div style='display:flex; height:100vh; justify-content:center; align-items:center; flex-direction:column; background:#f8d7da; color:#721c24;'><h1>ACESSO BLOQUEADO</h1><p>Sua conta foi suspensa pelo administrador.</p><button onclick='logoutSystem()'>SAIR</button></div>";
            return;
        }
        
        // Verifica Validade
        if (!user.isVitalicio) {
            if (!user.systemValidity || new Date(user.systemValidity) < new Date()) {
                document.body.innerHTML = "<div style='display:flex; height:100vh; justify-content:center; align-items:center; flex-direction:column; background:#fff3cd; color:#856404;'><h1>SISTEMA VENCIDO</h1><p>Sua licença expirou. Entre em contato para renovar.</p><button onclick='logoutSystem()'>SAIR</button></div>";
                return;
            }
        }

        // Mostra Menu Admin
        document.getElementById('menu-admin').style.display = 'block';
        
        // Abre Dashboard por padrão
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            
            // Marca menu ativo
            var menuHome = document.querySelector('.nav-item[data-page="home"]');
            if(menuHome) menuHome.classList.add('active');
        }
        
        atualizarDashboard();
        renderizarCalendario();

    } else {
        // Perfil Funcionário
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
// 4. EVENTOS DE NAVEGAÇÃO E SISTEMA
// -----------------------------------------------------------------------------

// Clique no Menu Lateral
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Remove ativo de todos os menus
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        
        // Esconde todas as páginas
        document.querySelectorAll('.page').forEach(page => { 
            page.classList.remove('active'); 
            page.style.display = 'none'; 
        });
        
        // Ativa o clicado
        this.classList.add('active');
        
        // Mostra a página alvo
        var targetId = this.getAttribute('data-page');
        var targetPage = document.getElementById(targetId);
        
        if (targetPage) { 
            targetPage.style.display = 'block'; 
            setTimeout(() => targetPage.classList.add('active'), 10); 
        }
        
        // Fecha menu no mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('active');
        }
        
        // Atualizações específicas por página para garantir dados frescos
        if (targetId === 'home') atualizarDashboard();
        if (targetId === 'meus-dados') renderizarMeusDados();
        if (targetId === 'employee-checkin') renderizarCheckinFuncionario();
    });
});

// Menu Mobile
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
});

// Fechar Menu ao clicar fora (Overlay)
document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
});

// Funções de Backup
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
        if(confirm("Tem certeza? Isso substituirá os dados atuais pelo backup.")) {
            try {
                var json = JSON.parse(e.target.result);
                if(json.data) {
                    localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(json.data.funcionarios));
                    localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(json.data.veiculos));
                    localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(json.data.operacoes));
                    localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(json.data.despesas));
                    
                    alert("Backup restaurado com sucesso! O sistema será recarregado.");
                    window.location.reload();
                } else {
                    alert("Arquivo de backup inválido.");
                }
            } catch(err) {
                alert("Erro ao ler arquivo: " + err.message);
            }
        }
    };
    reader.readAsText(event.target.files[0]);
};