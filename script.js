// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (INTEGRAL, LEGÍVEL E EXPANDIDA)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
// -----------------------------------------------------------------------------
// Estas chaves são usadas tanto no LocalStorage quanto nas coleções do Firebase
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
// Estas variáveis mantêm os dados carregados para acesso rápido sem ler o disco/rede toda hora
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

function parseValorBrasileiro(valor) {
    if (typeof valor === 'number') return valor;
    if (!valor) return 0;
    // Remove R$, espaços e converte 1.000,00 para 1000.00
    var str = String(valor).replace('R$', '').trim();
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    var num = parseFloat(str);
    return isNaN(num) ? 0 : num;
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

// Remove valores 'undefined' de objetos, pois o Firestore não aceita
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// FUNÇÃO CRÍTICA: Baixa TODOS os dados da nuvem ao iniciar o sistema
// Isso garante que o usuário veja os dados mais recentes ao abrir a tela
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COMPLETA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Usuário offline ou sem empresa definida. Carregando dados locais de backup.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função auxiliar interna para baixar uma coleção específica
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                
                // Define se é objeto único (dados da empresa) ou lista (cadastros)
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(lista);
                }
                
                // Atualiza o localStorage como backup para uso offline
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                // Se não existe na nuvem, define como vazio
                setter([]); 
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave} do Firebase:`, e);
        }
    }

    // Executa todos os downloads simultaneamente para agilizar o carregamento
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

// Carrega dados do LocalStorage (Fallback caso esteja offline ou erro no firebase)
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

// Função Genérica de Salvamento (Atualiza Memória -> LocalStorage -> Firebase)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e LocalStorage imediatamente
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Atualiza Nuvem (Se estiver logado e com empresa ativa)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Bloqueio de escrita se o sistema estiver bloqueado/vencido (exceto super admin)
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
             console.warn("Salvamento na nuvem bloqueado: Sistema sem créditos ou bloqueado.");
             return;
        }

        const { db, doc, setDoc } = window.dbRef;
        try {
            // Sanitiza para garantir que não vão campos inválidos
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            
            // Salva no caminho: companies/{empresa}/data/{colecao}
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
            alert("Atenção: Erro ao salvar na nuvem. Verifique sua conexão.");
        }
    }
}

// Funções Específicas de Salvamento (Atalhos para facilitar o uso no código)
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

// Buscas Helpers (Para evitar repetição de código de busca)
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
// PARTE 2: DASHBOARD E FINANCEIRO (VERSÃO 5.3 - CÁLCULOS SEGUROS)
// =============================================================================

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES E PARSERS (ESSENCIAL PARA CORRIGIR VALORES ZERADOS)
// -----------------------------------------------------------------------------

// Função Helper: Converte String Brasileira (R$ 1.000,00) para Float JS (1000.00)
// Resolve o problema de cálculos resultarem em NaN ou Zero
function parseValorBrasileiro(valor) {
    if (typeof valor === 'number') {
        return valor;
    }
    
    if (!valor) {
        return 0;
    }
    
    var str = String(valor).trim();
    
    // Remove R$ e espaços extras
    str = str.replace('R$', '').trim();
    
    // Tratamento para milhar e decimal (1.200,50)
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, ''); // Remove ponto de milhar
        str = str.replace(',', '.');  // Troca vírgula por ponto
    } 
    // Tratamento apenas decimal (1200,50)
    else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    
    var numero = parseFloat(str);
    
    // Retorna 0 se der erro na conversão
    if (isNaN(numero)) {
        return 0;
    }
    
    return numero;
}

window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    if (targets.length === 0) return;

    const isBlurred = targets[0].classList.contains('privacy-blur');
    targets.forEach(el => {
        if (isBlurred) el.classList.remove('privacy-blur');
        else el.classList.add('privacy-blur');
    });

    if (icon) {
        icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

// -----------------------------------------------------------------------------
// CÁLCULOS FINANCEIROS AVANÇADOS
// -----------------------------------------------------------------------------

window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
    });

    if (ops.length === 0) return 0;

    var tKm = 0;
    var tLit = 0;

    ops.forEach(function(op) {
        // Usa o parseValorBrasileiro para garantir números válidos
        var km = parseValorBrasileiro(op.kmRodado);
        var abastecido = parseValorBrasileiro(op.combustivel);
        var preco = parseValorBrasileiro(op.precoLitro);
        
        if (km > 0 && abastecido > 0 && preco > 0) {
            tKm += km;
            tLit += (abastecido / preco);
        }
    });

    return tLit > 0 ? (tKm / tLit) : 0;
};

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && parseValorBrasileiro(o.precoLitro) > 0;
    });

    if (ops.length === 0) return 6.00;

    var ultimas = ops.slice(-5);
    var soma = ultimas.reduce(function(acc, curr) {
        return acc + parseValorBrasileiro(curr.precoLitro);
    }, 0);

    return soma / ultimas.length;
};

window.calcularCustoCombustivelOperacao = function(op) {
    var km = parseValorBrasileiro(op.kmRodado);
    var valorComb = parseValorBrasileiro(op.combustivel);
    
    // Se não rodou, retorna valor cheio lançado
    if (km <= 0) return valorComb;
    
    if (!op.veiculoPlaca) return valorComb;

    var media = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    if (media <= 0) return valorComb;

    var preco = parseValorBrasileiro(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // Cálculo Proporcional
    return (km / media) * preco;
};

// -----------------------------------------------------------------------------
// LÓGICA CENTRAL DO DASHBOARD (COM PARSE SEGURO)
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) {
        return;
    }

    console.log("Calculando Dashboard com Parse Seguro...");
    
    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();
    var faturamentoMes = 0;
    var custosMes = 0;
    var receitaHistorico = 0;

    // 1. Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;

        var valFat = parseValorBrasileiro(op.faturamento);
        
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        var custoOp = parseValorBrasileiro(op.despesas) + custoComb;

        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoOp += parseValorBrasileiro(op.comissao);
        }
        
        if (op.ajudantes) {
            op.ajudantes.forEach(function(aj) {
                if (!op.checkins || !op.checkins.faltas || !op.checkins.faltas[aj.id]) {
                    custoOp += parseValorBrasileiro(aj.diaria);
                }
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valFat;
        }

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
            faturamentoMes += valFat;
            custosMes += custoOp;
        }
    });

    // 2. Despesas Gerais
    CACHE_DESPESAS.forEach(function(d) {
        var val = parseValorBrasileiro(d.valor);
        var dt = new Date(d.data + 'T12:00:00');
        
        if (d.modoPagamento === 'parcelado') {
            var qtd = parseValorBrasileiro(d.parcelasTotal) || 1;
            var valParc = val / qtd;
            for (var i = 0; i < qtd; i++) {
                var pDt = new Date(dt);
                pDt.setDate(pDt.getDate() + (i * 30));
                if (pDt.getMonth() === mesAtual && pDt.getFullYear() === anoAtual) {
                    custosMes += valParc;
                }
            }
        } else {
            if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
                custosMes += val;
            }
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = 0;
    if (faturamentoMes > 0) {
        margem = (lucroMes / faturamentoMes) * 100;
    }

    // Atualiza HTML
    if (document.getElementById('faturamentoMes')) {
        document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoMes);
        document.getElementById('despesasMes').textContent = formatarValorMoeda(custosMes);
        
        var elLucro = document.getElementById('receitaMes');
        if(elLucro) {
            elLucro.textContent = formatarValorMoeda(lucroMes);
            elLucro.style.color = lucroMes >= 0 ? "var(--success-color)" : "var(--danger-color)";
        }

        document.getElementById('receitaTotalHistorico').textContent = formatarValorMoeda(receitaHistorico);
        document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    }

    atualizarGraficoPrincipal(mesAtual, anoAtual);
    
    // Tenta renderizar o gráfico de performance se ele estiver visível na tela
    if(document.getElementById('performanceChart')) {
        window.renderizarGraficoPerformance();
    }
};

// -----------------------------------------------------------------------------
// GRÁFICOS (Chart.js)
// -----------------------------------------------------------------------------

function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 
    
    var fV = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var fM = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";
    
    var gFat = 0, gComb = 0, gPes = 0, gMan = 0;

    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        if (fV && op.veiculoPlaca !== fV) return;
        if (fM && op.motoristaId !== fM) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            var rec = parseValorBrasileiro(op.faturamento);
            var comb = window.calcularCustoCombustivelOperacao(op);
            var desp = parseValorBrasileiro(op.despesas);
            var com = 0;
            
            if (!op.checkins || !op.checkins.faltaMotorista) com += parseValorBrasileiro(op.comissao);
            if (op.ajudantes) op.ajudantes.forEach(aj => { if (!op.checkins?.faltas?.[aj.id]) com += parseValorBrasileiro(aj.diaria); });

            gFat += rec; gComb += comb; gPes += com; gMan += desp;
        }
    });

    CACHE_DESPESAS.forEach(function(d) {
        if (fV && d.veiculoPlaca && d.veiculoPlaca !== fV) return;
        var val = 0;
        var dt = new Date(d.data + 'T12:00:00');
        
        if (d.modoPagamento === 'parcelado') {
            var qtd = parseValorBrasileiro(d.parcelasTotal)||1;
            var vp = parseValorBrasileiro(d.valor) / qtd;
            for(var i=0; i<qtd; i++) {
                var pDt = new Date(dt); pDt.setDate(pDt.getDate() + (i*30));
                if (pDt.getMonth() === mes && pDt.getFullYear() === ano) val += vp;
            }
        } else {
            if (dt.getMonth() === mes && dt.getFullYear() === ano) val = parseValorBrasileiro(d.valor);
        }
        
        if(val > 0) {
            var desc = removerAcentos(d.descricao||"");
            if (desc.includes("manutencao") || desc.includes("peca")) gMan += val;
            else if (desc.includes("salario") || desc.includes("alim")) gPes += val;
            else gMan += val;
        }
    });

    var gLucro = gFat - (gComb + gPes + gMan);

    if (window.chartInstance) window.chartInstance.destroy();
    
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'Valores (R$)',
                data: [gFat, gComb, gPes, gMan, gLucro],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', (gLucro >= 0 ? '#20c997' : '#e83e8c')]
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// --- GRÁFICO DE PERFORMANCE OPERACIONAL (GLOBAL E CORRIGIDO) ---
window.renderizarGraficoPerformance = function() {
    var ctx = document.getElementById('performanceChart');
    if (!ctx) return; // Se não houver canvas no HTML, para.

    console.log("Renderizando Gráfico de Performance (Parse Seguro)...");

    var dadosVeiculos = {};

    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        var placa = op.veiculoPlaca || 'GERAL';
        
        if (!dadosVeiculos[placa]) {
            dadosVeiculos[placa] = { fat: 0, cust: 0 };
        }
        
        var fat = parseValorBrasileiro(op.faturamento);
        var cust = parseValorBrasileiro(op.despesas) + window.calcularCustoCombustivelOperacao(op);
        
        if (!op.checkins || !op.checkins.faltaMotorista) {
            cust += parseValorBrasileiro(op.comissao);
        }
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => { 
                if(!op.checkins?.faltas?.[aj.id]) cust += parseValorBrasileiro(aj.diaria); 
            });
        }

        dadosVeiculos[placa].fat += fat;
        dadosVeiculos[placa].cust += cust;
    });

    var labels = Object.keys(dadosVeiculos);
    var dataFat = labels.map(function(k) { return dadosVeiculos[k].fat; });
    var dataCust = labels.map(function(k) { return dadosVeiculos[k].cust; });

    if (window.chartPerformanceInstance) {
        window.chartPerformanceInstance.destroy();
    }

    window.chartPerformanceInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Faturamento', data: dataFat, backgroundColor: '#28a745' },
                { label: 'Custos', data: dataCust, backgroundColor: '#dc3545' }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true } } 
        }
    });
};

// -----------------------------------------------------------------------------
// LÓGICA DO CALENDÁRIO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    if (!window.currentDate) window.currentDate = new Date();

    grid.innerHTML = ''; 
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); 
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDiaSemana; i++) {
        var e = document.createElement('div'); e.className = 'day-cell empty'; grid.appendChild(e);
    }

    for (var d = 1; d <= diasNoMes; d++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        var dStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        var ops = CACHE_OPERACOES.filter(o => o.data === dStr && o.status !== 'CANCELADA');
        
        var h = `<span>${d}</span>`;
        if (ops.length > 0) {
            cell.classList.add('has-operation');
            var tot = ops.reduce((acc, curr) => acc + parseValorBrasileiro(curr.faturamento), 0);
            var col = ops.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';
            h += `<div class="event-dot" style="background:${col}"></div><div style="font-size:0.65em; color:green; margin-top:auto;">${formatarValorMoeda(tot)}</div>`;
            (function(dat){ cell.onclick = function(){ abrirModalDetalhesDia(dat); }; })(dStr);
        } else {
            (function(dat){ 
                cell.onclick = function(){ 
                    var btn = document.querySelector('[data-page="operacoes"]'); 
                    if(btn) { btn.click(); setTimeout(() => { var inp = document.getElementById('operacaoData'); if(inp) inp.value = dat; }, 100); } 
                }; 
            })(dStr);
        }
        cell.innerHTML = h; grid.appendChild(cell);
    }
};

window.changeMonth = function(d) {
    window.currentDate.setMonth(window.currentDate.getMonth() + d);
    renderizarCalendario();
    atualizarDashboard(); 
};

window.abrirModalDetalhesDia = function(ds) {
    var ops = CACHE_OPERACOES.filter(o => o.data === ds && o.status !== 'CANCELADA');
    var mb = document.getElementById('modalDayBody');
    var ms = document.getElementById('modalDaySummary');
    if (!mb) return;

    document.getElementById('modalDayTitle').textContent = 'OPERAÇÕES: ' + formatarDataParaBrasileiro(ds);
    
    var tFat = 0; var tCust = 0;
    ops.forEach(o => {
        tFat += parseValorBrasileiro(o.faturamento);
        var cComb = window.calcularCustoCombustivelOperacao(o);
        var cOut = parseValorBrasileiro(o.despesas);
        if (!o.checkins?.faltaMotorista) cOut += parseValorBrasileiro(o.comissao);
        if (o.ajudantes) o.ajudantes.forEach(aj => { if(!o.checkins?.faltas?.[aj.id]) cOut += parseValorBrasileiro(aj.diaria); });
        tCust += (cComb + cOut);
    });

    if (ms) {
        ms.innerHTML = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px; text-align:center; background:#f5f5f5; padding:8px; border-radius:6px; font-size:0.85rem;"><div><small>FATURAMENTO</small><br><strong style="color:var(--success-color)">${formatarValorMoeda(tFat)}</strong></div><div><small>CUSTO REAL</small><br><strong style="color:var(--danger-color)">${formatarValorMoeda(tCust)}</strong></div><div><small>LUCRO</small><br><strong style="color:${(tFat-tCust)>=0 ? 'var(--primary-color)' : 'red'}">${formatarValorMoeda(tFat-tCust)}</strong></div></div>`;
    }

    var h = '<div style="max-height:400px; overflow-y:auto;">';
    ops.forEach(op => {
        var m = CACHE_FUNCIONARIOS.find(f => f.id === op.motoristaId)?.nome.split(' ')[0] || '-';
        var c = CACHE_CONTRATANTES.find(cl => cl.cnpj === op.contratanteCNPJ)?.razaoSocial || '-';
        h += `<div style="border:1px solid #ddd; margin-bottom:10px; border-radius:5px; padding:10px; background:white;"><div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;"><span>${c}</span> <span style="color:${op.status==='EM_ANDAMENTO'?'orange':'#666'}">${op.status}</span></div><div style="font-size:0.85rem; color:#555; margin:5px 0;">${op.veiculoPlaca} | Mot: ${m}</div><button class="btn-mini btn-secondary" style="width:100%" onclick="document.getElementById('modalDayOperations').style.display='none'; visualizarOperacao('${op.id}')">VER DETALHES COMPLETOS</button></div>`;
    });
    mb.innerHTML = h + '</div>';
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

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    
    CACHE_FUNCIONARIOS.forEach(f => { 
        var tr = document.createElement('tr');
        // Botões de CRUD Padrão na Aba de Cadastros
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
window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if (!op) return;

    var mot = buscarFuncionarioPorId(op.motoristaId);
    var nomeMot = mot ? mot.nome : 'Não encontrado';
    var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'Não encontrado';
    var servico = buscarAtividadePorId(op.atividadeId)?.nome || '-';
    
    var htmlAjudantes = 'Nenhum';
    if (op.ajudantes && op.ajudantes.length > 0) {
        htmlAjudantes = '<ul style="margin:5px 0 0 20px; padding:0;">' + 
            op.ajudantes.map(aj => {
                var f = buscarFuncionarioPorId(aj.id);
                return `<li>${f ? f.nome : 'Excluído'} (Diária: ${formatarValorMoeda(aj.diaria)})</li>`;
            }).join('') + '</ul>';
    }

    // CÁLCULO REAL (PROPORCIONAL) PARA O MODAL
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

window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!motId || !dataIni || !dataFim) {
        return alert("Preencha o funcionário e o período completo.");
    }
    
    var funcionario = buscarFuncionarioPorId(motId);
    if (!funcionario) return alert("Funcionário inválido.");

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

    // Gera HTML do Recibo (Estilo Papel)
    var htmlRecibo = `
        <div style="border:2px solid #333; padding:20px; font-family:'Courier New', monospace; background:#fff; max-width:400px; margin:0 auto;">
            <h3 style="text-align:center; border-bottom:2px dashed #333; padding-bottom:10px;">RECIBO DE PAGAMENTO</h3>
            <p><strong>BENEFICIÁRIO:</strong><br> ${funcionario.nome}</p>
            <p><strong>PERÍODO:</strong><br> ${formatarDataParaBrasileiro(dataIni)} A ${formatarDataParaBrasileiro(dataFim)}</p>
            <table style="width:100%; border-top:1px solid #333; border-bottom:1px solid #333; margin:10px 0;">
                <tr><th align="left">DATA</th><th align="right">VALOR</th></tr>
                ${opsEnvolvidas.map(o => `<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td align="right">${formatarValorMoeda(o.valor)}</td></tr>`).join('')}
            </table>
            <h3 style="text-align:right;">TOTAL: ${formatarValorMoeda(totalValor)}</h3>
            <br>
            <br>
            <div style="text-align:center; border-top:1px solid #333; margin-top:20px; padding-top:5px;">Assinatura</div>
        </div>
    `;
    
    document.getElementById('modalReciboContent').innerHTML = htmlRecibo;
    
    // Botão para Salvar no Histórico
    document.getElementById('modalReciboActions').innerHTML = `
        <button class="btn-success" onclick="salvarReciboNoHistorico('${funcionario.id}', '${funcionario.nome}', '${dataIni}', '${dataFim}', ${totalValor})">
            <i class="fas fa-save"></i> SALVAR E REGISTRAR
        </button>
    `;
    
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
    
    alert("Recibo salvo no histórico!"); 
    document.getElementById('modalRecibo').style.display = 'none'; 
    renderizarHistoricoRecibos();
};

window.renderizarHistoricoRecibos = function() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    (CACHE_RECIBOS || []).sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        var statusLabel = r.enviado ? 
            '<span class="status-pill pill-active">ENVIADO</span>' : 
            '<span class="status-pill pill-pending">NÃO ENVIADO</span>';
            
        var btnEnviar = r.enviado ? '' : 
            `<button class="btn-mini btn-primary" onclick="enviarReciboFuncionario('${r.id}')" title="Marcar como Enviado"><i class="fas fa-paper-plane"></i></button>`;
            
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(r.dataEmissao).toLocaleDateString()}</td>
            <td>${r.funcionarioNome}</td>
            <td>${formatarValorMoeda(r.valorTotal)}</td>
            <td>${statusLabel}</td>
            <td>${btnEnviar}</td>
        `;
        tbody.appendChild(tr);
    });
};

window.enviarReciboFuncionario = async function(reciboId) {
    if(!confirm("Marcar este recibo como ENVIADO para o funcionário?")) return;
    
    var rec = CACHE_RECIBOS.find(r => r.id === reciboId);
    if(rec) {
        rec.enviado = true;
        await salvarListaRecibos(CACHE_RECIBOS);
        
        renderizarHistoricoRecibos();
        alert("Status atualizado!");
    }
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 1. PAINEL SUPER ADMIN (VISUAL LIMPO E FUNCIONAL)
// -----------------------------------------------------------------------------

window.carregarPainelSuperAdmin = async function() {
    const container = document.getElementById('superAdminContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando dados globais...</p>';

    try {
        const { db, collection, getDocs } = window.dbRef;
        const cSnap = await getDocs(collection(db, "companies"));
        const uSnap = await getDocs(collection(db, "users"));
        
        const companies = [];
        cSnap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));
        const users = [];
        uSnap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));

        container.innerHTML = '';

        if(companies.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma empresa encontrada.</div>';
            return;
        }

        companies.forEach(comp => {
            const usersDaEmpresa = users.filter(u => u.company === comp.id);
            const admin = usersDaEmpresa.find(u => u.role === 'admin');
            
            let statusBadge = "";
            let borderColor = "#ddd"; 

            if (comp.isBlocked) {
                statusBadge = '<span class="status-pill pill-blocked">BLOQUEADO</span>';
                borderColor = "var(--danger-color)";
            } else if (comp.isVitalicio) {
                statusBadge = '<span class="status-pill pill-active">VITALÍCIO</span>';
                borderColor = "gold";
            } else {
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
                            <i class="fas fa-edit"></i> GERENCIAR
                        </button>
                        <button class="btn-danger" onclick="excluirEmpresaTotal('${comp.id}')">
                            <i class="fas fa-trash"></i> EXCLUIR EMPRESA
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
        container.innerHTML = `<div class="alert alert-danger">Erro ao carregar dados: ${e.message}</div>`;
    }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        
        var dominio = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var senha = document.getElementById('newAdminPassword').value.trim();
        
        if (dominio.length < 3) return alert("O domínio da empresa deve ter pelo menos 3 letras.");

        try {
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
                systemValidity: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString()
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

        if (!isVitalicio && !isBloqueado) {
            const q = query(collection(db, "users"), where("company", "==", companyId), where("role", "==", "admin"));
            const snap = await getDocs(q);
            
            var base = new Date();
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

        alert("Atualizado com sucesso!");
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
        
        const q = query(collection(db, "users"), where("company", "==", companyId));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
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

window.resetarSenhaComMigracao = async function(uid, email, nome) {
    var novaSenha = prompt(`Digite a nova senha para ${email}:`);
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
            alert("Senha alterada com sucesso!"); 
            carregarPainelSuperAdmin();
        } catch(e){ 
            alert("Erro ao resetar: " + e.message); 
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
// 3. INICIALIZAÇÃO DO SISTEMA (INIT)
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> SISTEMA INICIADO. PERFIL:", user.role);
    window.USUARIO_ATUAL = user;

    // Reseta a interface
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = 'none'; 
        p.classList.remove('active'); 
    });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    // Verifica se é Super Admin
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

    // Sincroniza dados
    await sincronizarDadosComFirebase(); 
    preencherTodosSelects(); 

    // Roteamento Admin/Employee
    if (user.role === 'admin') {
        if (user.isBlocked) {
            document.body.innerHTML = "<div style='display:flex;height:100vh;justify-content:center;align-items:center;color:red;flex-direction:column'><h1>ACESSO BLOQUEADO</h1><p>Contate o suporte.</p><button onclick='logoutSystem()'>SAIR</button></div>";
            return;
        }
        if (!user.isVitalicio && (!user.systemValidity || new Date(user.systemValidity) < new Date())) {
            document.body.innerHTML = "<div style='display:flex;height:100vh;justify-content:center;align-items:center;color:orange;flex-direction:column'><h1>SISTEMA VENCIDO</h1><p>Renove sua licença.</p><button onclick='logoutSystem()'>SAIR</button></div>";
            return;
        }

        document.getElementById('menu-admin').style.display = 'block';
        
        var home = document.getElementById('home');
        if(home) { 
            home.style.display = 'block'; 
            setTimeout(() => home.classList.add('active'), 50); 
            
            var menuHome = document.querySelector('.nav-item[data-page="home"]');
            if(menuHome) menuHome.classList.add('active');
        }
        
        // Delay para garantir renderização correta do calendário e dashboard
        window.currentDate = new Date();
        setTimeout(() => {
            console.log("Renderizando Calendário e Dashboard...");
            renderizarCalendario();
            atualizarDashboard();
        }, 300);

    } else {
        // Funcionário
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home');
        if(eh) { eh.style.display = 'block'; setTimeout(() => eh.classList.add('active'), 50); }
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
        
        // GATILHOS DE ATUALIZAÇÃO
        if (targetId === 'home') {
            setTimeout(() => {
                atualizarDashboard();
                renderizarCalendario();
            }, 100);
        }
        
        // GATILHO DO GRÁFICO DE PERFORMANCE (IMPORTANTE)
        // Certifique-se de que o ID da sua página no HTML seja 'performance' ou 'analise-grafica'
        if (targetId === 'performance' || targetId === 'analise-grafica') {
            setTimeout(renderizarGraficoPerformance, 300);
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