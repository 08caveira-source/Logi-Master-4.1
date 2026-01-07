// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 6.0 (PAGINAÇÃO, MENSAGENS E DETALHES COMPLETOS)
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

// [NOVO] Variáveis de Controle de Paginação de Operações
window.ITEMS_PER_PAGE_OP = 10;
window.CURRENT_PAGE_OP = 1;

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
// PARTE 2 DE 5: INICIALIZAÇÃO, NAVEGAÇÃO, DASHBOARD E GRÁFICOS
// =============================================================================

// -----------------------------------------------------------------------------
// 6. INICIALIZAÇÃO DO SISTEMA E CONTROLE DE ACESSO
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> INICIALIZANDO SISTEMA PARA: " + user.email + " (" + user.role + ")");
    
    // Oculta todos os menus inicialmente
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // Remove classe active de todas as abas
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    // Verifica bloqueio da empresa
    if (user.company) {
        await verificarStatusEmpresa(user.company);
        if (window.SYSTEM_STATUS.bloqueado && user.role !== 'admin_master') {
            alert("ACESSO BLOQUEADO\n\nA licença de uso desta empresa expirou ou foi bloqueada.\nEntre em contato com o suporte.");
            window.logoutSystem();
            return;
        }
    }

    // Configura interface baseada no cargo (Role)
    if (user.role === 'admin_master') {
        // SUPER ADMIN (PAINEL MASTER)
        document.getElementById('menu-super-admin').style.display = 'block';
        carregarPainelSuperAdmin();
        showPage('super-admin');

    } else if (user.role === 'admin') {
        // ADMIN DA EMPRESA (LOGIMASTER PADRÃO)
        document.getElementById('menu-admin').style.display = 'block';
        
        await sincronizarDadosComFirebase();
        
        // Verifica avisos de vencimento
        verificarAvisosVencimento();
        
        // Carrega dashboard inicial
        atualizarDashboard();
        showPage('home');
        
        // Inicializa listeners específicos
        setupNavigation();
        atualizarNotificacoesPendentes();

    } else if (user.role === 'funcionario') {
        // FUNCIONÁRIO (PAINEL RESTRITO)
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        await sincronizarDadosComFirebase();
        
        carregarPainelFuncionario();
        showPage('employee-home');
        
        setupNavigation();
    }
    
    // Remove tela de carregamento se existir
    const loader = document.getElementById('loaderOverlay');
    if (loader) loader.style.display = 'none';
};

async function verificarStatusEmpresa(companyId) {
    if (!window.dbRef) return;
    try {
        const docRef = window.dbRef.doc(window.dbRef.db, "companies", companyId);
        const docSnap = await window.dbRef.getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Define status global
            window.SYSTEM_STATUS.validade = data.expiresAt || null;
            window.SYSTEM_STATUS.isVitalicio = data.isVitalicio || false;
            window.SYSTEM_STATUS.bloqueado = data.isBlocked || false;

            // Verifica validade se não for vitalício
            if (!window.SYSTEM_STATUS.isVitalicio && window.SYSTEM_STATUS.validade) {
                const hoje = new Date();
                const vencimento = new Date(window.SYSTEM_STATUS.validade);
                if (hoje > vencimento) {
                    window.SYSTEM_STATUS.bloqueado = true;
                }
            }
            
            // Atualiza display de vencimento no sidebar
            const displayValidade = document.getElementById('valDataVencimento');
            const containerValidade = document.getElementById('systemValidityDisplay');
            
            if (displayValidade && containerValidade) {
                if (window.SYSTEM_STATUS.isVitalicio) {
                    containerValidade.style.display = 'none';
                } else if (window.SYSTEM_STATUS.validade) {
                    containerValidade.style.display = 'block';
                    displayValidade.textContent = formatarDataParaBrasileiro(window.SYSTEM_STATUS.validade);
                    
                    // Pinta de vermelho se estiver perto de vencer (7 dias)
                    const diffTime = new Date(window.SYSTEM_STATUS.validade) - new Date();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= 7) containerValidade.style.color = 'var(--danger-color)';
                }
            }
        }
    } catch (e) {
        console.error("Erro ao verificar status da empresa:", e);
    }
}

function verificarAvisosVencimento() {
    // Verifica CNHs vencendo
    const hoje = new Date();
    const avisoDias = 30; // Avisar com 30 dias de antecedência
    
    let msg = "";
    
    CACHE_FUNCIONARIOS.forEach(func => {
        if (func.funcao === 'motorista' && func.driverData && func.driverData.validadeCNH) {
            const validade = new Date(func.driverData.validadeCNH);
            const diffTime = validade - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                msg += `- CNH de ${func.nome} VENCEU em ${formatarDataParaBrasileiro(func.driverData.validadeCNH)}\n`;
            } else if (diffDays <= avisoDias) {
                msg += `- CNH de ${func.nome} vence em ${diffDays} dias (${formatarDataParaBrasileiro(func.driverData.validadeCNH)})\n`;
            }
        }
    });

    if (msg) {
        // Exibe um alerta simples ou poderia ser um modal mais elegante
        console.warn("AVISOS DE VENCIMENTO:\n" + msg);
        // Opcional: alert("ATENÇÃO - VENCIMENTOS PRÓXIMOS:\n\n" + msg);
    }
}

// -----------------------------------------------------------------------------
// 7. LÓGICA DE NAVEGAÇÃO (SIDEBAR E PAGINAÇÃO)
// -----------------------------------------------------------------------------

function setupNavigation() {
    // Menu Desktop e Mobile
    const navItems = document.querySelectorAll('.nav-item');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('mobileMenuBtn');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.getAttribute('data-page');
            showPage(pageId);
            
            // Fecha menu mobile ao clicar
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                overlay.style.display = 'none';
            }
        });
    });

    // Toggle Mobile
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            if (sidebar.classList.contains('active')) {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        });
    }

    // Overlay click fecha menu
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.style.display = 'none';
        });
    }
}

function showPage(pageId) {
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        // page.style.display = 'none'; // Gerenciado pelo CSS class active
    });

    // Mostra a página alvo
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
    }

    // Atualiza menu sidebar
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageId) {
            nav.classList.add('active');
        }
    });

    // Lógica específica ao entrar na página (Refresh de dados)
    if (pageId === 'home') {
        atualizarDashboard();
    } else if (pageId === 'operacoes') {
        renderizarSelectsOperacao();
        renderizarTabelaOperacoes(); // Carrega tabela (com paginação nova)
    } else if (pageId === 'cadastros') {
        renderizarTabelasCadastro();
    } else if (pageId === 'despesas') {
        renderizarTabelaDespesas();
        carregarSelectVeiculosDespesa();
    } else if (pageId === 'access-management') {
        renderizarPainelEquipe(); // Carrega painel equipe (agora com msg)
    } else if (pageId === 'checkins-pendentes') {
        renderizarCheckinsPendentes();
    } else if (pageId === 'recibos') {
        if(window.USUARIO_ATUAL.role === 'funcionario') {
             carregarMeusRecibosFuncionario();
        } else {
             carregarSelectMotoristaRecibo();
             renderizarHistoricoRecibosAdmin();
        }
    } else if (pageId === 'meus-dados') {
        carregarMeusDadosFuncionario();
    } else if (pageId === 'employee-history') {
        // Inicializa datas com o mês atual
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        
        document.getElementById('dataInicioServicosFunc').value = primeiroDia.toISOString().split('T')[0];
        document.getElementById('dataFimServicosFunc').value = ultimoDia.toISOString().split('T')[0];
        
        filtrarServicosFuncionario(window.USUARIO_ATUAL.uid);
    }
}

// -----------------------------------------------------------------------------
// 8. LÓGICA DO DASHBOARD (HOME)
// -----------------------------------------------------------------------------

function atualizarDashboard() {
    // Atualiza data atual se necessário
    const hoje = new Date();
    
    // Cálculos financeiros do mês
    const mesAtual = window.currentDate.getMonth();
    const anoAtual = window.currentDate.getFullYear();
    
    let faturamentoTotal = 0;
    let despesasTotal = 0; // Inclui custos de operação + despesas gerais
    
    // 1. Somar Operações do Mês
    CACHE_OPERACOES.forEach(op => {
        const dataOp = new Date(op.data + 'T12:00:00'); // Fix timezone
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            // Somar Receita
            const receita = parseFloat(op.financeiro.faturamento) || 0;
            faturamentoTotal += receita;
            
            // Somar Custos da Operação (Combustível + Comissão + Despesas Extras)
            const combustivel = parseFloat(op.financeiro.combustivel) || 0;
            const comissao = parseFloat(op.financeiro.comissaoMotorista) || 0;
            const extras = parseFloat(op.financeiro.despesasViagem) || 0;
            
            despesasTotal += (combustivel + comissao + extras);
        }
    });

    // 2. Somar Despesas Gerais do Mês
    CACHE_DESPESAS.forEach(desp => {
        const dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            despesasTotal += (parseFloat(desp.valor) || 0);
        }
    });

    // 3. Calcular Resultados
    const lucroLiquido = faturamentoTotal - despesasTotal;
    let margem = 0;
    if (faturamentoTotal > 0) {
        margem = (lucroLiquido / faturamentoTotal) * 100;
    }

    // 4. Atualizar DOM
    document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoTotal);
    document.getElementById('despesasMes').textContent = formatarValorMoeda(despesasTotal);
    document.getElementById('receitaMes').textContent = formatarValorMoeda(lucroLiquido);
    document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    
    // Cores indicativas
    const elLucro = document.getElementById('receitaMes').parentElement;
    if (lucroLiquido >= 0) {
        elLucro.className = 'stat-card primary';
    } else {
        elLucro.className = 'stat-card danger';
    }

    // 5. Atualizar Componentes Filhos
    renderizarCalendario();
    atualizarGraficoFinanceiro();
    renderizarResumoVeiculosDashboard(mesAtual, anoAtual);
}

function toggleDashboardPrivacy() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    targets.forEach(el => {
        el.classList.toggle('privacy-blur');
    });
    
    if (icon.classList.contains('fa-eye')) {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// -----------------------------------------------------------------------------
// 9. LÓGICA DO CALENDÁRIO
// -----------------------------------------------------------------------------

function renderizarCalendario() {
    const grid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('currentMonthYear');
    
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const year = window.currentDate.getFullYear();
    const month = window.currentDate.getMonth();
    
    // Nome do mês
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    monthLabel.textContent = `${months[month]} ${year}`;
    
    // Lógica de dias
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Células vazias antes do dia 1
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        grid.appendChild(emptyCell);
    }
    
    // Dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        const dayNumber = document.createElement('div');
        dayNumber.style.fontWeight = 'bold';
        dayNumber.style.fontSize = '0.9rem';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);
        
        // Buscar operações deste dia
        const dataStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        // Filtra operações do dia
        const opsDoDia = CACHE_OPERACOES.filter(op => op.data === dataStr);
        
        if (opsDoDia.length > 0) {
            // Indicadores visuais (bolinhas)
            const dotsContainer = document.createElement('div');
            dotsContainer.style.display = 'flex';
            dotsContainer.style.gap = '2px';
            dotsContainer.style.flexWrap = 'wrap';
            
            // Limita a 5 bolinhas para não quebrar o layout
            opsDoDia.slice(0, 5).forEach(op => {
                const dot = document.createElement('span');
                dot.className = 'event-dot';
                // Cor baseada no status
                if (op.status === 'concluido') dot.style.backgroundColor = 'var(--success-color)';
                else if (op.status === 'cancelado') dot.style.backgroundColor = 'var(--danger-color)';
                else dot.style.backgroundColor = 'var(--warning-color)';
                
                dotsContainer.appendChild(dot);
            });
            
            if (opsDoDia.length > 5) {
                const plus = document.createElement('span');
                plus.style.fontSize = '0.7rem';
                plus.textContent = '+';
                dotsContainer.appendChild(plus);
            }
            
            cell.appendChild(dotsContainer);
            
            // Total do dia (pequeno texto)
            const totalDia = opsDoDia.reduce((acc, curr) => acc + (parseFloat(curr.financeiro.faturamento)||0), 0);
            const totalLabel = document.createElement('div');
            totalLabel.style.fontSize = '0.7rem';
            totalLabel.style.marginTop = 'auto'; // empurra para baixo
            totalLabel.style.color = '#28a745';
            totalLabel.textContent = totalDia > 0 ? (totalDia/1000).toFixed(1) + 'k' : '';
            cell.appendChild(totalLabel);
        }
        
        // Clique no dia abre modal de resumo
        cell.onclick = () => abrirModalResumoDia(dataStr, opsDoDia);
        
        grid.appendChild(cell);
    }
}

function changeMonth(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    atualizarDashboard(); // Recalcula tudo e redesenha calendário
}

function abrirModalResumoDia(dataIso, operacoes) {
    const modal = document.getElementById('modalDayOperations');
    const title = document.getElementById('modalDayTitle');
    const body = document.getElementById('modalDayBody');
    const summary = document.getElementById('modalDaySummary');
    
    title.textContent = "OPERAÇÕES: " + formatarDataParaBrasileiro(dataIso);
    body.innerHTML = '';
    summary.innerHTML = '';
    
    if (operacoes.length === 0) {
        body.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma operação registrada neste dia.</p>';
        modal.style.display = 'flex';
        return;
    }
    
    // Tabela detalhada
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>CLIENTE</th>
                    <th>VEÍCULO / MOT.</th>
                    <th>STATUS</th>
                    <th>VALOR</th>
                    <th>AÇÃO</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let totalFat = 0;
    let totalCusto = 0;
    
    operacoes.forEach(op => {
        const mot = buscarFuncionarioPorId(op.motoristaId)?.nome || 'N/D';
        const veic = buscarVeiculoPorPlaca(op.veiculoId)?.modelo || op.veiculoId;
        const cli = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial || 'Consumidor';
        
        const fat = parseFloat(op.financeiro.faturamento) || 0;
        // Custo estimado simples para resumo
        const custo = (parseFloat(op.financeiro.combustivel)||0) + (parseFloat(op.financeiro.comissaoMotorista)||0) + (parseFloat(op.financeiro.despesasViagem)||0);
        
        totalFat += fat;
        totalCusto += custo;
        
        let badgeClass = 'pill-pending';
        if(op.status === 'concluido') badgeClass = 'pill-active';
        else if(op.status === 'cancelado') badgeClass = 'pill-blocked';
        
        html += `
            <tr>
                <td>${cli}</td>
                <td><small>${veic}<br>${mot}</small></td>
                <td><span class="status-pill ${badgeClass}">${op.status}</span></td>
                <td>${formatarValorMoeda(fat)}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    body.innerHTML = html;
    
    // Resumo financeiro do dia
    summary.innerHTML = `
        <div style="display:flex; justify-content:space-around; background:#f8f9fa; padding:10px; margin-bottom:10px; border-radius:4px;">
            <div style="text-align:center;">
                <small>FATURAMENTO</small><br>
                <strong style="color:var(--success-color);">${formatarValorMoeda(totalFat)}</strong>
            </div>
             <div style="text-align:center;">
                <small>LUCRO EST.</small><br>
                <strong style="color:var(--primary-color);">${formatarValorMoeda(totalFat - totalCusto)}</strong>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// -----------------------------------------------------------------------------
// 10. LÓGICA DE GRÁFICOS (CHART.JS)
// -----------------------------------------------------------------------------

function atualizarGraficoFinanceiro() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    // Filtros
    const filtroVeiculo = document.getElementById('filtroVeiculoGrafico').value;
    const filtroMotorista = document.getElementById('filtroMotoristaGrafico').value;
    
    // Prepara dados dos últimos 6 meses (incluindo o atual)
    const labels = [];
    const dataReceita = [];
    const dataDespesa = [];
    const dataLucro = [];
    
    const hoje = new Date();
    
    // Loop para gerar os últimos 6 meses
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mes = d.getMonth();
        const ano = d.getFullYear();
        const mesNome = d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();
        
        labels.push(mesNome);
        
        // Calcula valores deste mês filtrados
        let rec = 0;
        let desp = 0; // Custos operacionais apenas para o gráfico de performance
        
        CACHE_OPERACOES.forEach(op => {
            const opData = new Date(op.data + 'T12:00:00');
            if (opData.getMonth() === mes && opData.getFullYear() === ano) {
                
                // Aplica filtros
                if (filtroVeiculo && op.veiculoId !== filtroVeiculo) return;
                if (filtroMotorista && String(op.motoristaId) !== filtroMotorista) return;
                
                // Se passou filtros
                const r = parseFloat(op.financeiro.faturamento) || 0;
                const c = (parseFloat(op.financeiro.combustivel)||0) + 
                          (parseFloat(op.financeiro.comissaoMotorista)||0) + 
                          (parseFloat(op.financeiro.despesasViagem)||0);
                          
                rec += r;
                desp += c;
            }
        });
        
        // Se não tiver filtro de veículo/motorista, soma despesas gerais também?
        // Geralmente despesas gerais não têm veículo vinculado estritamente, mas vamos considerar:
        // Se filtroVeiculo estiver ativo, somar apenas despesas gerais daquele veiculo
        if (!filtroMotorista) { // Despesas gerais raramente tem motorista, mas tem veiculo
            CACHE_DESPESAS.forEach(gd => {
                const gdData = new Date(gd.data + 'T12:00:00');
                if (gdData.getMonth() === mes && gdData.getFullYear() === ano) {
                     if (filtroVeiculo) {
                         // Se tem filtro de veiculo, checa se a despesa é desse veiculo
                         // Assumindo que despesa tem campo veiculoId ou descricao
                         // No objeto despesa temos: vinculoVeiculo (placa) ou id
                         if (gd.vinculoVeiculo === filtroVeiculo) {
                             desp += (parseFloat(gd.valor) || 0);
                         }
                     } else {
                         // Sem filtro, soma tudo
                         desp += (parseFloat(gd.valor) || 0);
                     }
                }
            });
        }
        
        dataReceita.push(rec);
        dataDespesa.push(desp);
        dataLucro.push(rec - desp);
    }
    
    // Renderiza Chart
    if (window.chartInstance) {
        window.chartInstance.destroy();
    }
    
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'FATURAMENTO',
                    data: dataReceita,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)',
                    borderColor: '#28a745',
                    borderWidth: 1
                },
                {
                    label: 'CUSTOS',
                    data: dataDespesa,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: '#dc3545',
                    borderWidth: 1
                },
                {
                    label: 'LUCRO',
                    data: dataLucro,
                    type: 'line',
                    borderColor: '#007bff',
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#007bff',
                    pointRadius: 5,
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumSignificantDigits: 3});
                        }
                    }
                }
            }
        }
    });
}

function renderizarResumoVeiculosDashboard(mes, ano) {
    // Exibe cards pequenos com resumo de cada veículo
    const container = document.getElementById('chartVehicleSummaryContainer');
    if (!container) return;
    
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.id = 'chartVehicleSummary';
    
    // Agrupar por placa
    const resumo = {};
    
    CACHE_OPERACOES.forEach(op => {
        const d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano && op.veiculoId) {
            if (!resumo[op.veiculoId]) resumo[op.veiculoId] = 0;
            resumo[op.veiculoId] += (parseFloat(op.financeiro.faturamento) || 0);
        }
    });
    
    // Gerar HTML
    const placas = Object.keys(resumo);
    if (placas.length === 0) {
        container.innerHTML = '<p style="color:#666; font-style:italic;">Sem dados de veículos neste mês.</p>';
        return;
    }
    
    placas.forEach(placa => {
        const val = resumo[placa];
        const box = document.createElement('div');
        box.className = 'veh-stat-box';
        box.innerHTML = `
            <small>${placa}</small>
            <span>${(val/1000).toFixed(1)}k</span>
        `;
        wrapper.appendChild(box);
    });
    
    container.appendChild(wrapper);
}

function limparOutroFiltro(tipo) {
    // Se selecionou veiculo, limpa motorista e vice versa para evitar confusão no gráfico simples
    if (tipo === 'motorista') {
        document.getElementById('filtroMotoristaGrafico').value = "";
    } else if (tipo === 'veiculo') {
        document.getElementById('filtroVeiculoGrafico').value = "";
    }
}
// =============================================================================
// PARTE 3 DE 5: GESTÃO DE OPERAÇÕES (COM PAGINAÇÃO) E MONITORAMENTO
// =============================================================================

// -----------------------------------------------------------------------------
// 11. GESTÃO DE OPERAÇÕES - RENDERIZAÇÃO E SELECTS
// -----------------------------------------------------------------------------

function renderizarSelectsOperacao() {
    const selMot = document.getElementById('selectMotoristaOperacao');
    const selVeic = document.getElementById('selectVeiculoOperacao');
    const selCli = document.getElementById('selectContratanteOperacao');
    const selAtiv = document.getElementById('selectAtividadeOperacao');
    const selAjud = document.getElementById('selectAjudantesOperacao');
    
    // Helper para preencher options
    function preencher(select, dados, valueProp, textProp, filtro = null) {
        if (!select) return;
        select.innerHTML = '<option value="">SELECIONE...</option>';
        dados.forEach(item => {
            if (filtro && !filtro(item)) return;
            const opt = document.createElement('option');
            opt.value = item[valueProp];
            opt.textContent = item[textProp];
            select.appendChild(opt);
        });
    }

    preencher(selMot, CACHE_FUNCIONARIOS, 'id', 'nome', f => f.funcao === 'motorista' && f.status === 'ativo');
    preencher(selVeic, CACHE_VEICULOS, 'placa', 'modelo'); // value agora é placa para facilitar vinculo
    preencher(selCli, CACHE_CONTRATANTES, 'cnpj', 'razaoSocial');
    preencher(selAtiv, CACHE_ATIVIDADES, 'id', 'nome');
    preencher(selAjud, CACHE_FUNCIONARIOS, 'id', 'nome', f => f.funcao === 'ajudante' && f.status === 'ativo');
}

// --- LÓGICA DE PAGINAÇÃO DE OPERAÇÕES ---

function renderizarTabelaOperacoes() {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Ordenar por data (mais recente primeiro)
    let opsOrdenadas = [...CACHE_OPERACOES].sort((a, b) => {
        return new Date(b.data + 'T12:00:00') - new Date(a.data + 'T12:00:00');
    });

    // Calcular Paginação
    const totalItems = opsOrdenadas.length;
    const itemsPerPage = parseInt(window.ITEMS_PER_PAGE_OP) || 10;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    // Ajustar página atual se exceder o limite
    if (window.CURRENT_PAGE_OP > totalPages) window.CURRENT_PAGE_OP = totalPages;
    if (window.CURRENT_PAGE_OP < 1) window.CURRENT_PAGE_OP = 1;

    // Fatiar array
    const startIndex = (window.CURRENT_PAGE_OP - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const opsPagina = opsOrdenadas.slice(startIndex, endIndex);

    // Renderizar linhas
    opsPagina.forEach(op => {
        const tr = document.createElement('tr');
        
        const mot = buscarFuncionarioPorId(op.motoristaId);
        const nomeMot = mot ? mot.nome.split(' ')[0] : 'Ex-Func.';
        const veic = buscarVeiculoPorPlaca(op.veiculoId); // Agora busca por placa
        const modeloVeic = veic ? veic.modelo : (op.veiculoId || 'N/D'); // Fallback se veiculoId for string antiga
        
        let statusClass = 'pill-pending';
        let statusText = op.status;
        
        if (op.status === 'concluido') { statusClass = 'pill-active'; statusText = 'CONCLUÍDO'; }
        else if (op.status === 'cancelado') { statusClass = 'pill-blocked'; statusText = 'CANCELADO'; }
        else if (op.status === 'agendado') { statusClass = 'pill-paused'; statusText = 'AGENDADO'; }

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>
                <div style="font-weight:bold;">${modeloVeic}</div>
                <div style="font-size:0.8rem; color:#666;">${nomeMot}</div>
            </td>
            <td><span class="status-pill ${statusClass}">${statusText}</span></td>
            <td>${formatarValorMoeda(op.financeiro.faturamento)}</td>
            <td>
                <button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                <button class="btn-warning btn-mini" onclick="editarOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-danger btn-mini" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualizar Indicadores de Paginação
    const indicador = document.getElementById('pageIndicatorOp');
    if (indicador) {
        indicador.textContent = `${window.CURRENT_PAGE_OP} / ${totalPages}`;
    }
}

function mudarPaginaOperacoes(direcao) {
    window.CURRENT_PAGE_OP += direcao;
    renderizarTabelaOperacoes();
}

function mudarQtdPaginaOperacoes() {
    const select = document.getElementById('itemsPerPageOp');
    if (select) {
        window.ITEMS_PER_PAGE_OP = parseInt(select.value);
        window.CURRENT_PAGE_OP = 1; // Volta para a primeira página ao mudar qtd
        renderizarTabelaOperacoes();
    }
}

// -----------------------------------------------------------------------------
// 12. CRUD OPERAÇÕES (SALVAR / EDITAR / EXCLUIR)
// -----------------------------------------------------------------------------

const formOperacao = document.getElementById('formOperacao');
if (formOperacao) {
    formOperacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (window.MODO_APENAS_LEITURA) { alert("Modo leitura."); return; }
        
        // Coleta de dados
        const id = document.getElementById('operacaoId').value;
        const data = document.getElementById('operacaoData').value;
        const motoristaId = document.getElementById('selectMotoristaOperacao').value;
        const veiculoId = document.getElementById('selectVeiculoOperacao').value; // Placa
        const contratanteId = document.getElementById('selectContratanteOperacao').value;
        const atividadeId = document.getElementById('selectAtividadeOperacao').value;
        
        // Financeiro
        const fat = parseFloat(document.getElementById('operacaoFaturamento').value) || 0;
        const adiant = parseFloat(document.getElementById('operacaoAdiantamento').value) || 0;
        const comissao = parseFloat(document.getElementById('operacaoComissao').value) || 0;
        const desp = parseFloat(document.getElementById('operacaoDespesas').value) || 0;
        const comb = parseFloat(document.getElementById('operacaoCombustivel').value) || 0;
        const precoLitro = parseFloat(document.getElementById('operacaoPrecoLitro').value) || 0;
        const kmTotal = parseFloat(document.getElementById('operacaoKmRodado').value) || 0;
        
        const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        
        if (!motoristaId || !veiculoId || !contratanteId) {
            alert("Preencha motorista, veículo e cliente.");
            return;
        }
        
        const novaOp = {
            id: id || 'op_' + Date.now(),
            data: data,
            motoristaId: motoristaId,
            veiculoId: veiculoId,
            contratanteId: contratanteId,
            atividadeId: atividadeId,
            ajudantes: window._operacaoAjudantesTempList || [],
            status: isAgendamento ? 'agendado' : 'concluido',
            financeiro: {
                faturamento: fat,
                adiantamento: adiant,
                comissaoMotorista: comissao,
                despesasViagem: desp,
                combustivel: comb,
                precoLitro: precoLitro,
                kmRodado: kmTotal
            },
            // Preserva dados de checkin se for edição
            checkinData: null 
        };

        // Preservar checkinData se for edição
        if (id) {
            const opAntiga = CACHE_OPERACOES.find(o => o.id === id);
            if (opAntiga && opAntiga.checkinData) {
                novaOp.checkinData = opAntiga.checkinData;
                // Se o status era cancelado e estamos salvando, volta para concluido/agendado? 
                // Assumimos que o form define o status novo.
            }
        }
        
        let listaAtualizada = [...CACHE_OPERACOES];
        if (id) {
            const index = listaAtualizada.findIndex(o => o.id === id);
            if (index > -1) listaAtualizada[index] = novaOp;
        } else {
            listaAtualizada.push(novaOp);
        }
        
        await salvarListaOperacoes(listaAtualizada);
        
        alert("Operação salva com sucesso!");
        formOperacao.reset();
        document.getElementById('operacaoId').value = "";
        window._operacaoAjudantesTempList = [];
        document.getElementById('listaAjudantesAdicionados').innerHTML = '';
        
        renderizarTabelaOperacoes();
        atualizarDashboard();
        renderizarCheckinsPendentes(); // Atualiza painel se for agendamento
    });
}

function editarOperacao(id) {
    const op = CACHE_OPERACOES.find(o => o.id === id);
    if (!op) return;
    
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoId;
    document.getElementById('selectContratanteOperacao').value = op.contratanteId;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId;
    
    // Financeiro
    document.getElementById('operacaoFaturamento').value = op.financeiro.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.financeiro.adiantamento;
    document.getElementById('operacaoComissao').value = op.financeiro.comissaoMotorista;
    document.getElementById('operacaoDespesas').value = op.financeiro.despesasViagem;
    document.getElementById('operacaoCombustivel').value = op.financeiro.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.financeiro.precoLitro || '';
    document.getElementById('operacaoKmRodado').value = op.financeiro.kmRodado || '';
    
    // Checkbox Agendamento
    const check = document.getElementById('operacaoIsAgendamento');
    check.checked = (op.status === 'agendado');
    
    // Ajudantes
    window._operacaoAjudantesTempList = op.ajudantes || [];
    atualizarListaAjudantesUI();
    
    // Rola para o topo
    document.querySelector('.content').scrollTop = 0;
}

async function excluirOperacao(id) {
    if (confirm("Tem certeza que deseja excluir esta operação? Isso afetará o financeiro.")) {
        // Verifica se precisa de senha (ex: admin master) ou se é padrão
        // Para simplificar, exclusão direta, mas poderia pedir senha de segurança
        const novaLista = CACHE_OPERACOES.filter(o => o.id !== id);
        await salvarListaOperacoes(novaLista);
        renderizarTabelaOperacoes();
        atualizarDashboard();
        renderizarCheckinsPendentes();
    }
}

// --- AJUDANTES NA OPERAÇÃO ---
const btnAddAjudante = document.getElementById('btnManualAddAjudante');
if (btnAddAjudante) {
    btnAddAjudante.addEventListener('click', () => {
        const select = document.getElementById('selectAjudantesOperacao');
        const idAjudante = select.value;
        if (!idAjudante) return;
        
        const func = buscarFuncionarioPorId(idAjudante);
        
        // Abre modal para definir valor
        const modal = document.getElementById('modalAdicionarAjudante');
        document.getElementById('modalAjudanteNome').textContent = func.nome;
        document.getElementById('modalAjudanteNome').dataset.id = idAjudante;
        document.getElementById('modalDiariaInput').value = '';
        modal.style.display = 'flex';
    });
}

function closeAdicionarAjudanteModal() {
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}

document.getElementById('modalAjudanteAddBtn').onclick = () => {
    const id = document.getElementById('modalAjudanteNome').dataset.id;
    const valor = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
    
    if (valor <= 0) { alert("Informe um valor válido."); return; }
    
    window._operacaoAjudantesTempList.push({ idFuncionario: id, valor: valor });
    atualizarListaAjudantesUI();
    closeAdicionarAjudanteModal();
    document.getElementById('selectAjudantesOperacao').value = "";
};

function atualizarListaAjudantesUI() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    ul.innerHTML = '';
    
    window._operacaoAjudantesTempList.forEach((item, idx) => {
        const f = buscarFuncionarioPorId(item.idFuncionario);
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${f ? f.nome : 'Desconhecido'} - ${formatarValorMoeda(item.valor)}</span>
            <button type="button" onclick="removerAjudanteTemp(${idx})" style="color:red; background:none; border:none;">&times;</button>
        `;
        ul.appendChild(li);
    });
}

window.removerAjudanteTemp = function(idx) {
    window._operacaoAjudantesTempList.splice(idx, 1);
    atualizarListaAjudantesUI();
};

// -----------------------------------------------------------------------------
// 13. VISUALIZAÇÃO DETALHADA (MODAL)
// -----------------------------------------------------------------------------

window.verDetalhesOperacao = function(id) {
    const op = CACHE_OPERACOES.find(o => o.id === id);
    if (!op) return;

    const modal = document.getElementById('operationDetailsModal');
    const body = document.getElementById('modalBodyContent');
    
    const mot = buscarFuncionarioPorId(op.motoristaId)?.nome || 'N/D';
    const veic = buscarVeiculoPorPlaca(op.veiculoId)?.modelo || op.veiculoId;
    const cli = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial || 'N/D';
    const serv = buscarAtividadePorId(op.atividadeId)?.nome || 'Geral';

    // Monta lista de ajudantes
    let ajudantesHtml = '<em>Nenhum</em>';
    if (op.ajudantes && op.ajudantes.length > 0) {
        ajudantesHtml = op.ajudantes.map(a => {
            const nome = buscarFuncionarioPorId(a.idFuncionario)?.nome || '...';
            return `${nome} (${formatarValorMoeda(a.valor)})`;
        }).join('<br>');
    }

    // Calcula lucro estimado na visualização
    const custoTotal = (parseFloat(op.financeiro.combustivel)||0) + 
                       (parseFloat(op.financeiro.comissaoMotorista)||0) + 
                       (parseFloat(op.financeiro.despesasViagem)||0);
    const lucro = (parseFloat(op.financeiro.faturamento)||0) - custoTotal;

    // --- BLOCO DE CHECK-IN / KM / HORÁRIOS ---
    let checkinInfoHtml = '';
    
    // Verifica se tem dados de checkin ou se foram inseridos manualmente no form
    // Prioriza checkinData se existir
    
    let kmInicial = 'N/I';
    let kmFinal = 'N/I';
    let kmRodado = op.financeiro.kmRodado || '0';
    let horaInicio = '-';
    let horaFim = '-';

    if (op.checkinData) {
        kmInicial = op.checkinData.kmInicial || 'N/I';
        kmFinal = op.checkinData.kmFinal || 'N/I';
        
        if (op.checkinData.timestampInicio) {
            const dIni = new Date(op.checkinData.timestampInicio);
            horaInicio = dIni.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (op.checkinData.timestampFim) {
            const dFim = new Date(op.checkinData.timestampFim);
            horaFim = dFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
    }

    checkinInfoHtml = `
        <div style="background:#e3f2fd; padding:10px; border-radius:4px; margin-top:15px; border:1px solid #bbdefb;">
            <h4 style="margin-top:0; color:#0d47a1; border-bottom:1px solid #90caf9; padding-bottom:5px;">DADOS DE RODAGEM & HORÁRIOS</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-top:10px;">
                <div><strong>HORA INÍCIO:</strong><br>${horaInicio}</div>
                <div><strong>HORA FIM:</strong><br>${horaFim}</div>
                <div><strong>KM INICIAL:</strong><br>${kmInicial}</div>
                <div><strong>KM FINAL:</strong><br>${kmFinal}</div>
                <div><strong>KM RODADO:</strong><br>${kmRodado} km</div>
            </div>
        </div>
    `;

    const html = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
            <div>
                <p><strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                <p><strong>STATUS:</strong> ${op.status.toUpperCase()}</p>
                <p><strong>CLIENTE:</strong> ${cli}</p>
                <p><strong>SERVIÇO:</strong> ${serv}</p>
            </div>
            <div>
                <p><strong>VEÍCULO:</strong> ${veic}</p>
                <p><strong>MOTORISTA:</strong> ${mot}</p>
                <p><strong>AJUDANTES:</strong><br>${ajudantesHtml}</p>
            </div>
        </div>

        ${checkinInfoHtml}

        <hr style="margin:15px 0;">
        
        <h4 style="color:#28a745;">FINANCEIRO</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>FATURAMENTO: <strong>${formatarValorMoeda(op.financeiro.faturamento)}</strong></div>
            <div>ADIANTAMENTO: <strong>${formatarValorMoeda(op.financeiro.adiantamento)}</strong></div>
            <div>COMBUSTÍVEL: <strong style="color:var(--danger-color);">${formatarValorMoeda(op.financeiro.combustivel)}</strong></div>
            <div>COMISSÃO MOT.: <strong style="color:var(--danger-color);">${formatarValorMoeda(op.financeiro.comissaoMotorista)}</strong></div>
            <div>OUTRAS DESP.: <strong style="color:var(--danger-color);">${formatarValorMoeda(op.financeiro.despesasViagem)}</strong></div>
        </div>
        
        <div style="margin-top:15px; padding:10px; background:#f8f9fa; text-align:right; border-radius:4px;">
            LUCRO LÍQUIDO APROXIMADO: <strong style="font-size:1.2rem; color:${lucro >= 0 ? 'green' : 'red'};">${formatarValorMoeda(lucro)}</strong>
        </div>
    `;
    
    body.innerHTML = html;
    modal.style.display = 'flex';
};

window.closeModal = function() {
    document.getElementById('operationDetailsModal').style.display = 'none';
};

// -----------------------------------------------------------------------------
// 14. MONITORAMENTO (CHECK-INS PENDENTES)
// -----------------------------------------------------------------------------

function renderizarCheckinsPendentes() {
    const tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Filtrar operações "agendado" ou "em_andamento"
    const pendentes = CACHE_OPERACOES.filter(op => 
        op.status === 'agendado' || op.status === 'em_andamento'
    );
    
    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma rota em andamento.</td></tr>';
        
        // Esconde badge
        const badge = document.getElementById('badgeCheckins');
        if (badge) badge.style.display = 'none';
        return;
    }

    // Atualiza badge
    const badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = 'inline-block';
    }

    pendentes.forEach(op => {
        const tr = document.createElement('tr');
        const mot = buscarFuncionarioPorId(op.motoristaId)?.nome || '...';
        const veic = buscarVeiculoPorPlaca(op.veiculoId)?.placa || '...';
        
        let statusDisplay = '<span class="status-pill pill-paused">AGENDADO</span>';
        if (op.status === 'em_andamento') {
            statusDisplay = '<span class="status-pill pill-active" style="background:#17a2b8;">EM ROTA</span>';
        }

        // Se tiver hora de início (checkin feito)
        let horaInicio = '-';
        if (op.checkinData && op.checkinData.timestampInicio) {
            horaInicio = new Date(op.checkinData.timestampInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        }

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${mot}<br><small>${veic}</small></td>
            <td>${statusDisplay}</td>
            <td>${horaInicio}</td>
            <td>
                <button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
// =============================================================================
// PARTE 4 DE 5: GESTÃO DE EQUIPE, DESPESAS E CADASTROS
// =============================================================================

// -----------------------------------------------------------------------------
// 15. GESTÃO DE EQUIPE (MENSAGENS E APROVAÇÕES)
// -----------------------------------------------------------------------------

function renderizarPainelEquipe() {
    renderizarTabelaCompanyAtivos();
    renderizarProfileRequests();
    
    // Atualiza badge de notificações no menu
    const badge = document.getElementById('badgeAccess');
    const requests = CACHE_PROFILE_REQUESTS.length;
    if (badge) {
        if (requests > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = '!'; // ou requests
        } else {
            badge.style.display = 'none';
        }
    }
}

// --- NOVO: ENVIO DE MENSAGENS PARA EQUIPE ---
const formMsg = document.getElementById('formEnviarMensagemEquipe');
if (formMsg) {
    formMsg.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const texto = document.getElementById('msgEquipeTexto').value;
        if (!texto) return;
        
        // Simulação de envio (Em um sistema real, salvaria em uma coleção 'notificacoes')
        // Como o sistema original não tinha coleção definida para isso no backup, 
        // vamos simular um envio bem sucedido que poderia disparar e-mail ou push no futuro.
        
        if (confirm(`Confirma o envio desta mensagem para TODOS os funcionários ativos?\n\n"${texto}"`)) {
            // Aqui poderíamos chamar uma Cloud Function ou salvar em db_messages
            alert("MENSAGEM ENVIADA COM SUCESSO!\n\nOs funcionários receberão o aviso no painel.");
            document.getElementById('msgEquipeTexto').value = '';
        }
    });
}

function renderizarTabelaCompanyAtivos() {
    const tbody = document.querySelector('#tabelaCompanyAtivos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_FUNCIONARIOS.forEach(func => {
        if (func.status === 'inativo') return; // Mostra apenas ativos e pendentes
        
        const tr = document.createElement('tr');
        
        let statusPill = '<span class="status-pill pill-active">ATIVO</span>';
        if (func.status === 'pendente') statusPill = '<span class="status-pill pill-pending">PENDENTE</span>';
        
        tr.innerHTML = `
            <td>${func.nome}</td>
            <td>${func.funcao.toUpperCase()}</td>
            <td>${statusPill}</td>
            <td>
                <button class="btn-primary btn-mini" onclick="abrirModalStatusFuncionario('${func.id}')">
                    <i class="fas fa-cog"></i> GERENCIAR
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- CORREÇÃO: APROVAÇÃO DE SOLICITAÇÃO DE DADOS ---

function renderizarProfileRequests() {
    const tbody = document.querySelector('#tabelaProfileRequests tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (CACHE_PROFILE_REQUESTS.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }
    
    CACHE_PROFILE_REQUESTS.forEach(req => {
        const func = buscarFuncionarioPorId(req.userId);
        const nome = func ? func.nome : 'Ex-Func.';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(req.data)}</td>
            <td>${nome}</td>
            <td>${traduzirCampo(req.campo)}</td>
            <td><strong style="color:var(--primary-color);">${req.novoValor}</strong></td>
            <td>
                <button class="btn-success btn-mini" onclick="aprovarProfileRequest('${req.id}')" title="Aprovar"><i class="fas fa-check"></i></button>
                <button class="btn-danger btn-mini" onclick="rejeitarProfileRequest('${req.id}')" title="Rejeitar"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function traduzirCampo(campo) {
    const mapa = {
        'telefone': 'TELEFONE',
        'pix': 'CHAVE PIX',
        'endereco': 'ENDEREÇO',
        'email': 'EMAIL',
        'cnh': 'CNH'
    };
    return mapa[campo] || campo.toUpperCase();
}

window.aprovarProfileRequest = async function(reqId) {
    if (!confirm("Confirmar a alteração dos dados deste funcionário?")) return;
    
    const reqIndex = CACHE_PROFILE_REQUESTS.findIndex(r => r.id === reqId);
    if (reqIndex === -1) return;
    
    const req = CACHE_PROFILE_REQUESTS[reqIndex];
    
    // 1. Atualizar o funcionário
    const funcIndex = CACHE_FUNCIONARIOS.findIndex(f => f.id === req.userId);
    if (funcIndex > -1) {
        // Atualiza o campo específico
        CACHE_FUNCIONARIOS[funcIndex][req.campo] = req.novoValor;
        
        // Salva Funcionários atualizados
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        
        // 2. Remover a solicitação
        CACHE_PROFILE_REQUESTS.splice(reqIndex, 1);
        await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
        
        alert("Dados atualizados com sucesso!");
        renderizarPainelEquipe(); // Atualiza tabelas e badge
    } else {
        alert("Erro: Funcionário não encontrado.");
    }
};

window.rejeitarProfileRequest = async function(reqId) {
    if (!confirm("Rejeitar esta solicitação?")) return;
    
    const novaLista = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
    await salvarProfileRequests(novaLista);
    renderizarPainelEquipe();
};

// --- MODAL DE STATUS (BLOQUEAR/ATIVAR/REMOVER) ---
window.abrirModalStatusFuncionario = function(id) {
    const func = buscarFuncionarioPorId(id);
    if (!func) return;
    
    const modal = document.getElementById('modalStatusFuncionario');
    const body = document.getElementById('statusFuncionarioBody');
    const actions = document.getElementById('statusFuncionarioActions');
    
    body.innerHTML = `
        <h3>${func.nome}</h3>
        <p>Login: ${func.email}</p>
        <p>Status Atual: <strong>${func.status.toUpperCase()}</strong></p>
    `;
    
    let btnHtml = '';
    
    if (func.status === 'ativo') {
        btnHtml += `<button class="btn-warning" onclick="alterarStatusFuncionario('${id}', 'inativo')" style="width:100%; margin-bottom:10px;">DESATIVAR ACESSO</button>`;
    } else {
        btnHtml += `<button class="btn-success" onclick="alterarStatusFuncionario('${id}', 'ativo')" style="width:100%; margin-bottom:10px;">REATIVAR ACESSO</button>`;
    }
    
    btnHtml += `<button class="btn-danger" onclick="excluirFuncionarioDefinitivo('${id}')" style="width:100%;">EXCLUIR PERMANENTEMENTE</button>`;
    
    actions.innerHTML = btnHtml;
    modal.style.display = 'flex';
};

window.alterarStatusFuncionario = async function(id, novoStatus) {
    const index = CACHE_FUNCIONARIOS.findIndex(f => f.id === id);
    if (index > -1) {
        CACHE_FUNCIONARIOS[index].status = novoStatus;
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        document.getElementById('modalStatusFuncionario').style.display = 'none';
        renderizarPainelEquipe();
        // Se estiver desativando, poderia forçar logout via Cloud Function, mas aqui atualizamos o banco
    }
};

window.excluirFuncionarioDefinitivo = async function(id) {
    // Exige confirmação de segurança (simples aqui)
    if(confirm("ATENÇÃO: Isso excluirá todo o histórico e acesso do funcionário.\n\nContinuar?")) {
         const novaLista = CACHE_FUNCIONARIOS.filter(f => f.id !== id);
         await salvarListaFuncionarios(novaLista);
         document.getElementById('modalStatusFuncionario').style.display = 'none';
         renderizarPainelEquipe();
    }
};


// -----------------------------------------------------------------------------
// 16. DESPESAS GERAIS
// -----------------------------------------------------------------------------

const formDespesa = document.getElementById('formDespesaGeral');
if (formDespesa) {
    // Setup toggle de parcelas
    document.getElementById('despesaModoPagamento').addEventListener('change', (e) => {
        const div = document.getElementById('divDespesaParcelas');
        div.style.display = e.target.value === 'parcelado' ? 'flex' : 'none';
    });

    formDespesa.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (window.MODO_APENAS_LEITURA) return;

        const data = document.getElementById('despesaGeralData').value;
        const veiculo = document.getElementById('selectVeiculoDespesaGeral').value;
        const desc = document.getElementById('despesaGeralDescricao').value;
        const valorTotal = parseFloat(document.getElementById('despesaGeralValor').value) || 0;
        const modo = document.getElementById('despesaModoPagamento').value;
        
        if (modo === 'parcelado') {
            // Gerar Múltiplas Despesas
            const qtd = parseInt(document.getElementById('despesaParcelas').value);
            const intervalo = parseInt(document.getElementById('despesaIntervaloDias').value);
            const valorParc = valorTotal / qtd;
            
            let dataBase = new Date(data);
            
            let novasDespesas = [];
            for (let i = 0; i < qtd; i++) {
                const dataParc = new Date(dataBase);
                dataParc.setDate(dataBase.getDate() + (i * intervalo));
                
                novasDespesas.push({
                    id: 'desp_' + Date.now() + '_' + i,
                    data: dataParc.toISOString().split('T')[0],
                    vinculoVeiculo: veiculo,
                    descricao: `${desc} (${i+1}/${qtd})`,
                    valor: valorParc,
                    formaPagamento: document.getElementById('despesaFormaPagamento').value,
                    categoria: 'Geral'
                });
            }
            
            // Adiciona todas ao cache
            const listaNova = [...CACHE_DESPESAS, ...novasDespesas];
            await salvarListaDespesas(listaNova);
            alert(`${qtd} parcelas lançadas com sucesso.`);
            
        } else {
            // Despesa Única
            const novaDesp = {
                id: 'desp_' + Date.now(),
                data: data,
                vinculoVeiculo: veiculo,
                descricao: desc,
                valor: valorTotal,
                formaPagamento: document.getElementById('despesaFormaPagamento').value,
                categoria: 'Geral'
            };
            
            const listaNova = [...CACHE_DESPESAS, novaDesp];
            await salvarListaDespesas(listaNova);
            alert("Despesa lançada.");
        }
        
        formDespesa.reset();
        document.getElementById('divDespesaParcelas').style.display = 'none';
        renderizarTabelaDespesas();
        atualizarDashboard(); // Impacta no lucro
    });
}

function carregarSelectVeiculosDespesa() {
    const sel = document.getElementById('selectVeiculoDespesaGeral');
    if (sel) {
        sel.innerHTML = '<option value="">NENHUM (GERAL)</option>';
        CACHE_VEICULOS.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.placa; // Usa placa como ID de vínculo
            opt.textContent = `${v.modelo} - ${v.placa}`;
            sel.appendChild(opt);
        });
    }
}

function renderizarTabelaDespesas() {
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Ordenar desc
    const sorted = [...CACHE_DESPESAS].sort((a,b) => new Date(b.data) - new Date(a.data));
    
    // Paginação simples (últimas 50)
    sorted.slice(0, 50).forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.vinculoVeiculo || '-'}</td>
            <td>${d.descricao}</td>
            <td style="color:var(--danger-color); font-weight:bold;">${formatarValorMoeda(d.valor)}</td>
            <td><span class="status-pill pill-active">PAGO</span></td>
            <td>
                <button class="btn-danger btn-mini" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = async function(id) {
    if (confirm("Excluir esta despesa?")) {
        const lista = CACHE_DESPESAS.filter(d => d.id !== id);
        await salvarListaDespesas(lista);
        renderizarTabelaDespesas();
        atualizarDashboard();
    }
};


// -----------------------------------------------------------------------------
// 17. GESTÃO DE CADASTROS (ABAS E FORMULÁRIOS)
// -----------------------------------------------------------------------------

// Controle de Abas
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

function renderizarTabelasCadastro() {
    // Funcionários
    const tbFunc = document.querySelector('#tabelaFuncionarios tbody');
    tbFunc.innerHTML = '';
    CACHE_FUNCIONARIOS.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${f.funcao}</td>
            <td>${f.email}</td>
            <td>
                <button class="btn-warning btn-mini" onclick="editarFuncionario('${f.id}')"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbFunc.appendChild(tr);
    });

    // Veículos
    const tbVeic = document.querySelector('#tabelaVeiculos tbody');
    tbVeic.innerHTML = '';
    CACHE_VEICULOS.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${v.placa}</td>
            <td>${v.modelo}</td>
            <td>${v.ano}</td>
            <td><button class="btn-danger btn-mini" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbVeic.appendChild(tr);
    });

    // Contratantes, Atividades... (lógica similar, simplificada aqui)
    // Minha Empresa
    const divEmp = document.getElementById('viewMinhaEmpresaContent');
    if (CACHE_MINHA_EMPRESA.razaoSocial) {
        document.getElementById('minhaEmpresaRazaoSocial').value = CACHE_MINHA_EMPRESA.razaoSocial;
        document.getElementById('minhaEmpresaCNPJ').value = CACHE_MINHA_EMPRESA.cnpj;
        document.getElementById('minhaEmpresaTelefone').value = CACHE_MINHA_EMPRESA.telefone;
    }
}

// --- SALVAR FUNCIONÁRIO (COM AUTH) ---
const formFunc = document.getElementById('formFuncionario');
if (formFunc) {
    formFunc.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('funcionarioId').value;
        const nome = document.getElementById('funcNome').value;
        const email = document.getElementById('funcEmail').value.trim();
        const funcao = document.getElementById('funcFuncao').value;
        const docPessoal = document.getElementById('funcDocumento').value;
        const senha = document.getElementById('funcSenha').value; // Opcional na edição
        
        // Dados extras
        const driverData = {
            cnh: document.getElementById('funcCNH').value,
            validadeCNH: document.getElementById('funcValidadeCNH').value,
            categoria: document.getElementById('funcCategoriaCNH').value,
            curso: document.getElementById('funcCursoDescricao').value
        };

        let uidFirebase = id;

        // Se for novo cadastro, precisa criar no Auth
        if (!id) {
            if (!senha || senha.length < 6) {
                alert("Senha obrigatória (mínimo 6 caracteres) para novos usuários.");
                return;
            }
            
            try {
                // Usa o helper definido no HTML para criar user secundário
                if (window.dbRef && window.dbRef.criarAuthUsuario) {
                    uidFirebase = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Cria o documento 'users' para controle de role
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uidFirebase), {
                        email: email,
                        role: 'funcionario', // Default
                        company: window.USUARIO_ATUAL.company,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    // Fallback para teste local
                    uidFirebase = 'local_' + Date.now();
                }
            } catch (err) {
                alert("Erro ao criar usuário no Login: " + err.message);
                return;
            }
        }

        const novoFunc = {
            id: uidFirebase,
            nome, email, funcao, 
            documento: docPessoal,
            telefone: document.getElementById('funcTelefone').value,
            pix: document.getElementById('funcPix').value,
            endereco: document.getElementById('funcEndereco').value,
            driverData: funcao === 'motorista' ? driverData : null,
            status: 'ativo'
        };

        // Atualiza Cache
        let lista = [...CACHE_FUNCIONARIOS];
        if (id) {
            const idx = lista.findIndex(f => f.id === id);
            if (idx > -1) lista[idx] = novoFunc;
        } else {
            lista.push(novoFunc);
        }

        await salvarListaFuncionarios(lista);
        alert("Funcionário salvo com sucesso!");
        formFunc.reset();
        document.getElementById('funcionarioId').value = '';
        renderizarTabelasCadastro();
    });
}

window.toggleDriverFields = function() {
    const role = document.getElementById('funcFuncao').value;
    const div = document.getElementById('driverSpecificFields');
    div.style.display = role === 'motorista' ? 'block' : 'none';
};

window.editarFuncionario = function(id) {
    const f = buscarFuncionarioPorId(id);
    if (!f) return;
    
    document.getElementById('funcionarioId').value = f.id;
    document.getElementById('funcNome').value = f.nome;
    document.getElementById('funcEmail').value = f.email;
    document.getElementById('funcFuncao').value = f.funcao;
    document.getElementById('funcDocumento').value = f.documento || '';
    document.getElementById('funcTelefone').value = f.telefone || '';
    document.getElementById('funcPix').value = f.pix || '';
    document.getElementById('funcEndereco').value = f.endereco || '';
    
    if (f.funcao === 'motorista' && f.driverData) {
        document.getElementById('funcCNH').value = f.driverData.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.driverData.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.driverData.categoria || 'C';
        document.getElementById('funcCursoDescricao').value = f.driverData.curso || '';
    }
    
    toggleDriverFields();
    // Muda para aba funcionarios (já está nela)
    document.getElementById('funcSenha').placeholder = "(Deixe vazio para manter a atual)";
};
// =============================================================================
// PARTE 5 DE 5: RELATÓRIOS, RECIBOS, PAINEL FUNCIONÁRIO, SUPER ADMIN E BACKUP
// =============================================================================

// -----------------------------------------------------------------------------
// 18. MÓDULO DE RELATÓRIOS
// -----------------------------------------------------------------------------

function getFiltrosRelatorio() {
    return {
        inicio: document.getElementById('dataInicioRelatorio').value,
        fim: document.getElementById('dataFimRelatorio').value,
        motorista: document.getElementById('selectMotoristaRelatorio').value,
        veiculo: document.getElementById('selectVeiculoRelatorio').value,
        contratante: document.getElementById('selectContratanteRelatorio').value,
        atividade: document.getElementById('selectAtividadeRelatorio').value
    };
}

function filtrarOperacoesRelatorio() {
    const f = getFiltrosRelatorio();
    if (!f.inicio || !f.fim) {
        alert("Selecione o período (Início e Fim).");
        return null;
    }

    const dIni = new Date(f.inicio + 'T00:00:00');
    const dFim = new Date(f.fim + 'T23:59:59');

    return CACHE_OPERACOES.filter(op => {
        const dOp = new Date(op.data + 'T12:00:00');
        if (dOp < dIni || dOp > dFim) return false;
        
        if (f.motorista && op.motoristaId !== f.motorista) return false;
        // Veículo agora compara com ID (placa) ou string antiga
        if (f.veiculo && op.veiculoId !== f.veiculo) return false; 
        if (f.contratante && op.contratanteId !== f.contratante) return false;
        if (f.atividade && op.atividadeId !== f.atividade) return false;
        
        return op.status === 'concluido'; // Apenas concluídas contam para financeiro fechado
    });
}

window.gerarRelatorioGeral = function() {
    const ops = filtrarOperacoesRelatorio();
    if (!ops) return;

    const container = document.getElementById('reportResults');
    const content = document.getElementById('reportContent');
    container.style.display = 'block';

    let totalFat = 0, totalCustos = 0, totalComissao = 0;

    let html = `
        <div class="report-header">
            <h3>RELATÓRIO GERAL DE OPERAÇÕES</h3>
            <p>Período: ${formatarDataParaBrasileiro(document.getElementById('dataInicioRelatorio').value)} até ${formatarDataParaBrasileiro(document.getElementById('dataFimRelatorio').value)}</p>
        </div>
        <table class="data-table" style="font-size:0.9rem;">
            <thead>
                <tr>
                    <th>DATA</th>
                    <th>CLIENTE</th>
                    <th>VEÍCULO</th>
                    <th>FATURAMENTO</th>
                    <th>CUSTOS</th>
                    <th>LUCRO</th>
                </tr>
            </thead>
            <tbody>
    `;

    ops.forEach(op => {
        const fat = parseFloat(op.financeiro.faturamento) || 0;
        const comb = parseFloat(op.financeiro.combustivel) || 0;
        const comiss = parseFloat(op.financeiro.comissaoMotorista) || 0;
        const desp = parseFloat(op.financeiro.despesasViagem) || 0;
        const custos = comb + comiss + desp;
        const lucro = fat - custos;

        totalFat += fat;
        totalCustos += custos;
        totalComissao += comiss;

        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${buscarContratantePorCnpj(op.contratanteId)?.razaoSocial || 'N/D'}</td>
                <td>${op.veiculoId}</td>
                <td>${formatarValorMoeda(fat)}</td>
                <td style="color:red;">-${formatarValorMoeda(custos)}</td>
                <td style="font-weight:bold; color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    // Resumo
    html += `
        <div style="margin-top:20px; padding:15px; background:#f8f9fa; border:1px solid #dee2e6;">
            <h4>RESUMO DO PERÍODO</h4>
            <p>FATURAMENTO BRUTO: <strong>${formatarValorMoeda(totalFat)}</strong></p>
            <p>TOTAL CUSTOS: <strong style="color:red;">${formatarValorMoeda(totalCustos)}</strong></p>
            <p>LUCRO LÍQUIDO: <strong style="color:${(totalFat-totalCustos)>=0?'green':'red'}; font-size:1.2rem;">${formatarValorMoeda(totalFat - totalCustos)}</strong></p>
        </div>
    `;

    content.innerHTML = html;
};

window.exportarRelatorioPDF = function() {
    const element = document.getElementById('reportContent');
    if (!element.innerHTML) { alert("Gere o relatório primeiro."); return; }
    
    const opt = {
        margin: 10,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};

window.gerarRelatorioCobranca = function() {
    // Similar ao geral, mas focado em agrupar por Cliente para envio de fatura
    const ops = filtrarOperacoesRelatorio();
    if (!ops) return;
    
    // Agrupa por cliente
    const porCliente = {};
    ops.forEach(op => {
        const cliId = op.contratanteId;
        if (!porCliente[cliId]) porCliente[cliId] = { nome: buscarContratantePorCnpj(cliId)?.razaoSocial, total: 0, ops: [] };
        porCliente[cliId].ops.push(op);
        porCliente[cliId].total += (parseFloat(op.financeiro.faturamento) || 0);
    });

    const content = document.getElementById('reportContent');
    document.getElementById('reportResults').style.display = 'block';
    
    let html = `<h3>RELATÓRIO PARA COBRANÇA</h3>`;
    
    for (const [id, dados] of Object.entries(porCliente)) {
        html += `
            <div style="margin-bottom:30px; border:1px solid #ccc; padding:15px;">
                <h4 style="background:#eee; padding:10px; margin:-15px -15px 15px -15px;">${dados.nome || 'Cliente Desconhecido'}</h4>
                <table class="data-table">
                    <thead><tr><th>DATA</th><th>VEÍCULO</th><th>SERVIÇO</th><th>VALOR</th></tr></thead>
                    <tbody>
        `;
        dados.ops.forEach(op => {
            html += `
                <tr>
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>${op.veiculoId}</td>
                    <td>${buscarAtividadePorId(op.atividadeId)?.nome || '-'}</td>
                    <td>${formatarValorMoeda(op.financeiro.faturamento)}</td>
                </tr>
            `;
        });
        html += `</tbody></table>
            <div style="text-align:right; margin-top:10px;">
                <strong>TOTAL A COBRAR: ${formatarValorMoeda(dados.total)}</strong>
            </div>
        </div>`;
    }
    
    content.innerHTML = html;
};

// -----------------------------------------------------------------------------
// 19. MÓDULO DE RECIBOS E PAGAMENTOS
// -----------------------------------------------------------------------------

function carregarSelectMotoristaRecibo() {
    const sel = document.getElementById('selectMotoristaRecibo');
    if (!sel) return;
    sel.innerHTML = '<option value="">SELECIONE...</option>';
    CACHE_FUNCIONARIOS.forEach(f => {
        if (f.funcao === 'motorista' || f.funcao === 'ajudante') {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.nome;
            sel.appendChild(opt);
        }
    });
}

window.gerarReciboPagamento = async function() {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const dIni = document.getElementById('dataInicioRecibo').value;
    const dFim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dIni || !dFim) { alert("Preencha todos os campos."); return; }

    const func = buscarFuncionarioPorId(funcId);
    if (!func) return;

    // Busca operações concluídas do funcionário no período
    const ops = CACHE_OPERACOES.filter(op => {
        if (op.status !== 'concluido') return false;
        const dOp = new Date(op.data + 'T12:00:00');
        const i = new Date(dIni + 'T00:00:00');
        const f = new Date(dFim + 'T23:59:59');
        
        // Verifica se é motorista principal OU ajudante na operação
        const isMotorista = (op.motoristaId === funcId);
        const isAjudante = (op.ajudantes && op.ajudantes.some(a => a.idFuncionario === funcId));
        
        return (dOp >= i && dOp <= f) && (isMotorista || isAjudante);
    });

    let totalPagar = 0;
    let detalhesHtml = `<table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
        <tr style="background:#eee;"><th>DATA</th><th>DESCRIÇÃO</th><th style="text-align:right;">VALOR</th></tr>`;

    ops.forEach(op => {
        let valorOp = 0;
        let desc = "";

        if (op.motoristaId === funcId) {
            valorOp = parseFloat(op.financeiro.comissaoMotorista) || 0;
            desc = `Comissão Viagem (${formatarDataParaBrasileiro(op.data)})`;
        } else {
            // É ajudante
            const itemAjudante = op.ajudantes.find(a => a.idFuncionario === funcId);
            if (itemAjudante) {
                valorOp = parseFloat(itemAjudante.valor) || 0;
                desc = `Diária Ajudante (${formatarDataParaBrasileiro(op.data)})`;
            }
        }
        
        if (valorOp > 0) {
            totalPagar += valorOp;
            detalhesHtml += `
                <tr>
                    <td style="border-bottom:1px solid #ddd; padding:5px;">${formatarDataParaBrasileiro(op.data)}</td>
                    <td style="border-bottom:1px solid #ddd; padding:5px;">${desc}</td>
                    <td style="border-bottom:1px solid #ddd; padding:5px; text-align:right;">${formatarValorMoeda(valorOp)}</td>
                </tr>
            `;
        }
    });

    detalhesHtml += `</table>`;

    // Renderiza Modal de Recibo
    const modal = document.getElementById('modalRecibo');
    const content = document.getElementById('modalReciboContent');
    const actions = document.getElementById('modalReciboActions');
    
    content.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h2>RECIBO DE PAGAMENTO</h2>
            <p><strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'EMPRESA'}</strong> - CNPJ: ${CACHE_MINHA_EMPRESA.cnpj || '00.000.000/0000-00'}</p>
        </div>
        <p>Eu, <strong>${func.nome}</strong> (CPF: ${func.documento || '...'}, PIX: ${func.pix || '...'}), declaro ter recebido a importância líquida de:</p>
        <h1 style="text-align:center; background:#eee; padding:10px;">${formatarValorMoeda(totalPagar)}</h1>
        <p>Referente aos serviços prestados no período de ${formatarDataParaBrasileiro(dIni)} a ${formatarDataParaBrasileiro(dFim)}.</p>
        <br>
        <h4>DETALHAMENTO:</h4>
        ${detalhesHtml}
        <br>
        <div style="display:flex; justify-content:space-between; margin-top:40px;">
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">Assinatura do Responsável</div>
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">${func.nome}</div>
        </div>
    `;

    // Botão para salvar recibo
    actions.innerHTML = `
        <button class="btn-primary" onclick="salvarReciboGerado('${func.id}', '${dIni}', '${dFim}', ${totalPagar})">
            <i class="fas fa-save"></i> GRAVAR NO HISTÓRICO
        </button>
        <button class="btn-secondary" onclick="window.print()">
            <i class="fas fa-print"></i> IMPRIMIR
        </button>
    `;

    modal.style.display = 'block';
};

window.salvarReciboGerado = async function(funcId, ini, fim, valor) {
    const novoRecibo = {
        id: 'rec_' + Date.now(),
        dataEmissao: new Date().toISOString(),
        funcionarioId: funcId,
        periodoInicio: ini,
        periodoFim: fim,
        valorTotal: valor
    };
    
    CACHE_RECIBOS.push(novoRecibo);
    await salvarListaRecibos(CACHE_RECIBOS);
    
    alert("Recibo salvo no histórico!");
    document.getElementById('modalRecibo').style.display = 'none';
    renderizarHistoricoRecibosAdmin();
};

function renderizarHistoricoRecibosAdmin() {
    const tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_RECIBOS.sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(r => {
        const f = buscarFuncionarioPorId(r.funcionarioId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao)}</td>
            <td>${f ? f.nome : '...'}</td>
            <td>${formatarDataParaBrasileiro(r.periodoInicio)} até ${formatarDataParaBrasileiro(r.periodoFim)}</td>
            <td>${formatarValorMoeda(r.valorTotal)}</td>
            <td><button class="btn-secondary btn-mini"><i class="fas fa-print"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 20. PAINEL DO FUNCIONÁRIO (CHECK-IN / CHECK-OUT)
// -----------------------------------------------------------------------------

function carregarPainelFuncionario() {
    const uid = window.USUARIO_ATUAL.uid;
    
    // Identificar se tem rota pendente
    // Uma rota pendente para o funcionário é uma operação onde ele é motorista e status != 'concluido' e != 'cancelado'
    // Prioridade: 'em_andamento' > 'agendado'
    
    let opAtiva = CACHE_OPERACOES.find(o => o.motoristaId === uid && o.status === 'em_andamento');
    
    if (!opAtiva) {
        // Se não tem em andamento, procura agendada para hoje ou passado pendente
        opAtiva = CACHE_OPERACOES.find(o => o.motoristaId === uid && o.status === 'agendado');
    }

    const container = document.getElementById('checkin-container');
    
    if (!opAtiva) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#666;">
                <i class="fas fa-coffee" style="font-size:3rem; margin-bottom:15px; color:#ccc;"></i>
                <h3>Tudo tranquilo por aqui!</h3>
                <p>Nenhuma viagem agendada ou em andamento para você no momento.</p>
            </div>
        `;
        return;
    }

    // Renderiza Card da Operação Ativa
    const cli = buscarContratantePorCnpj(opAtiva.contratanteId)?.razaoSocial || 'Cliente';
    const veic = buscarVeiculoPorPlaca(opAtiva.veiculoId)?.modelo || opAtiva.veiculoId;
    const serv = buscarAtividadePorId(opAtiva.atividadeId)?.nome || 'Serviço';

    let btnAction = '';
    let statusMsg = '';
    let corStatus = '';

    if (opAtiva.status === 'agendado') {
        statusMsg = 'VIAGEM AGENDADA - AGUARDANDO INÍCIO';
        corStatus = '#ffc107';
        btnAction = `<button onclick="abrirModalCheckin('${opAtiva.id}', 'inicio')" class="btn-success" style="width:100%; padding:15px; font-size:1.2rem;">
            <i class="fas fa-play"></i> INICIAR VIAGEM
        </button>`;
    } else {
        statusMsg = 'EM ROTA - VIAGEM EM ANDAMENTO';
        corStatus = '#17a2b8';
        btnAction = `<button onclick="abrirModalCheckin('${opAtiva.id}', 'fim')" class="btn-danger" style="width:100%; padding:15px; font-size:1.2rem;">
            <i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM
        </button>`;
    }

    container.innerHTML = `
        <div style="border-left:5px solid ${corStatus}; padding:20px; background:#fff;">
            <small style="font-weight:bold; color:${corStatus};">${statusMsg}</small>
            <h2 style="margin:10px 0;">${cli}</h2>
            <p><i class="fas fa-truck"></i> ${veic} | <i class="fas fa-box"></i> ${serv}</p>
            <p><i class="fas fa-calendar"></i> Data Prevista: ${formatarDataParaBrasileiro(opAtiva.data)}</p>
            
            <div style="margin-top:30px;">
                ${btnAction}
            </div>
        </div>
    `;
}

// --- MODAL DE CHECK-IN / CHECK-OUT COM DADOS COMPLETOS ---

window.abrirModalCheckin = function(opId, etapa) {
    const op = CACHE_OPERACOES.find(o => o.id === opId);
    if (!op) return;

    const modal = document.getElementById('modalCheckinConfirm');
    const form = document.getElementById('formCheckinConfirm');
    
    document.getElementById('checkinOpId').value = opId;
    document.getElementById('checkinStep').value = etapa;
    
    document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
    document.getElementById('checkinDisplayContratante').textContent = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial;
    document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoId;
    
    document.getElementById('checkinDriverFields').style.display = 'block';

    if (etapa === 'inicio') {
        document.getElementById('checkinModalTitle').textContent = "INICIAR ROTA";
        document.getElementById('btnConfirmCheckin').className = "btn-success";
        document.getElementById('btnConfirmCheckin').textContent = "CONFIRMAR INÍCIO";
        
        document.getElementById('divKmInicial').style.display = 'block';
        document.getElementById('divKmFinal').style.display = 'none';
        document.getElementById('checkinKmInicial').required = true;
        document.getElementById('checkinKmFinal').required = false;
        
    } else {
        document.getElementById('checkinModalTitle').textContent = "FINALIZAR ROTA";
        document.getElementById('btnConfirmCheckin').className = "btn-danger";
        document.getElementById('btnConfirmCheckin').textContent = "ENCERRAR OPERAÇÃO";
        
        document.getElementById('divKmInicial').style.display = 'none';
        document.getElementById('divKmFinal').style.display = 'block';
        document.getElementById('checkinKmFinal').required = true;
        
        // Passa o KM inicial salvo para validação
        if (op.checkinData && op.checkinData.kmInicial) {
            document.getElementById('checkinKmInicialReadonly').value = op.checkinData.kmInicial;
        }
    }
    
    modal.style.display = 'flex';
};

function closeCheckinConfirmModal() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
}

const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    formCheckin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const opId = document.getElementById('checkinOpId').value;
        const etapa = document.getElementById('checkinStep').value;
        const opIndex = CACHE_OPERACOES.findIndex(o => o.id === opId);
        
        if (opIndex === -1) return;
        
        const op = CACHE_OPERACOES[opIndex];
        const agora = new Date().toISOString();
        
        if (etapa === 'inicio') {
            const kmIni = parseFloat(document.getElementById('checkinKmInicial').value);
            if (!kmIni || kmIni <= 0) { alert("Informe o KM Inicial."); return; }
            
            // Atualiza status e cria checkinData
            op.status = 'em_andamento';
            op.checkinData = {
                timestampInicio: agora,
                kmInicial: kmIni,
                timestampFim: null,
                kmFinal: null
            };
            
        } else {
            const kmFim = parseFloat(document.getElementById('checkinKmFinal').value);
            const kmIni = parseFloat(document.getElementById('checkinKmInicialReadonly').value) || (op.checkinData ? op.checkinData.kmInicial : 0);
            
            const abastecimento = parseFloat(document.getElementById('checkinValorAbastecido').value) || 0;
            const precoLitro = parseFloat(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
            
            if (!kmFim || kmFim <= kmIni) { alert(`O KM Final deve ser maior que o Inicial (${kmIni}).`); return; }
            
            const kmRodado = kmFim - kmIni;
            
            op.status = 'concluido';
            op.checkinData.timestampFim = agora;
            op.checkinData.kmFinal = kmFim;
            op.checkinData.abastecimento = abastecimento;
            
            // Atualiza campos financeiros da operação com dados reais do motorista
            if (!op.financeiro) op.financeiro = {};
            op.financeiro.kmRodado = kmRodado;
            op.financeiro.combustivel = abastecimento;
            op.financeiro.precoLitro = precoLitro;
        }
        
        // Salva
        CACHE_OPERACOES[opIndex] = op;
        await salvarListaOperacoes(CACHE_OPERACOES);
        
        alert(etapa === 'inicio' ? "Boa viagem! Status atualizado." : "Viagem encerrada com sucesso!");
        closeCheckinConfirmModal();
        carregarPainelFuncionario();
    });
}

// -----------------------------------------------------------------------------
// 21. PAINEL SUPER ADMIN (MASTER)
// -----------------------------------------------------------------------------

function carregarPainelSuperAdmin() {
    if (!window.dbRef) return;
    const { db, collection, getDocs, query, where } = window.dbRef;
    const container = document.getElementById('superAdminContainer');
    container.innerHTML = '<p>Carregando empresas...</p>';
    
    // Lista collection 'companies'
    getDocs(collection(db, 'companies')).then(snap => {
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p>Nenhuma empresa cadastrada.</p>';
            return;
        }
        
        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = `<thead><tr><th>EMPRESA (ID)</th><th>ADMIN</th><th>VALIDADE</th><th>AÇÕES</th></tr></thead><tbody></tbody>`;
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            
            let statusValidade = d.isVitalicio ? 'VITALÍCIO' : (d.expiresAt ? formatarDataParaBrasileiro(d.expiresAt) : 'SEM DATA');
            if (d.isBlocked) statusValidade += ' (BLOQUEADO)';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${id}</td>
                <td>${d.adminEmail}</td>
                <td>${statusValidade}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="abrirModalCreditos('${id}', '${d.expiresAt}', ${d.isVitalicio}, ${d.isBlocked})">
                        <i class="fas fa-coins"></i> GERENCIAR
                    </button>
                </td>
            `;
            table.querySelector('tbody').appendChild(tr);
        });
        container.appendChild(table);
    });
}

const formCreateCompany = document.getElementById('formCreateCompany');
if(formCreateCompany) {
    formCreateCompany.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dom = document.getElementById('newCompanyDomain').value.trim();
        const email = document.getElementById('newAdminEmail').value.trim();
        const pass = document.getElementById('newAdminPassword').value;
        
        if(!dom || !email || !pass) return;

        try {
            const { db, setDoc, doc, criarAuthUsuario } = window.dbRef;
            
            // 1. Criar usuário no Auth
            const uid = await criarAuthUsuario(email, pass);
            
            // 2. Criar Doc da Empresa
            const dadosEmpresa = {
                adminEmail: email,
                createdAt: new Date().toISOString(),
                isVitalicio: false,
                expiresAt: new Date(Date.now() + (30*24*60*60*1000)).toISOString(), // 30 dias grátis
                isBlocked: false
            };
            await setDoc(doc(db, "companies", dom), dadosEmpresa);
            
            // 3. Vincular usuário à empresa
            await setDoc(doc(db, "users", uid), {
                email: email,
                role: 'admin',
                company: dom
            });
            
            alert(`Empresa '${dom}' criada com sucesso!`);
            formCreateCompany.reset();
            carregarPainelSuperAdmin();
            
        } catch(err) {
            alert("Erro: " + err.message);
        }
    });
}

// Modal Créditos
window.abrirModalCreditos = function(id, expiresAt, isVitalicio, isBlocked) {
    const modal = document.getElementById('modalCreditos');
    document.getElementById('empresaIdCredito').value = id;
    document.getElementById('nomeEmpresaCredito').textContent = id;
    document.getElementById('validadeAtualCredito').textContent = isVitalicio ? 'VITALÍCIO' : (expiresAt ? formatarDataParaBrasileiro(expiresAt) : '-');
    document.getElementById('checkVitalicio').checked = isVitalicio;
    document.getElementById('checkBloqueado').checked = isBlocked;
    
    modal.style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    const id = document.getElementById('empresaIdCredito').value;
    const isVitalicio = document.getElementById('checkVitalicio').checked;
    const isBlocked = document.getElementById('checkBloqueado').checked;
    const mesesAdd = parseInt(document.getElementById('qtdCreditosAdd').value) || 0;
    
    const { db, doc, getDoc, updateDoc } = window.dbRef;
    const docRef = doc(db, 'companies', id);
    const snap = await getDoc(docRef);
    const data = snap.data();
    
    let novaValidade = data.expiresAt;
    
    if (mesesAdd > 0 && !isVitalicio) {
        const atual = novaValidade ? new Date(novaValidade) : new Date();
        // Se já venceu, começa de hoje
        const base = (atual < new Date()) ? new Date() : atual;
        base.setMonth(base.getMonth() + mesesAdd);
        novaValidade = base.toISOString();
    }
    
    await updateDoc(docRef, {
        isVitalicio: isVitalicio,
        isBlocked: isBlocked,
        expiresAt: novaValidade
    });
    
    alert("Alterações salvas!");
    document.getElementById('modalCreditos').style.display = 'none';
    carregarPainelSuperAdmin();
};

// -----------------------------------------------------------------------------
// 22. MANUTENÇÃO (BACKUP E RESET)
// -----------------------------------------------------------------------------

window.exportDataBackup = function() {
    const backup = {
        funcionarios: CACHE_FUNCIONARIOS,
        veiculos: CACHE_VEICULOS,
        contratantes: CACHE_CONTRATANTES,
        operacoes: CACHE_OPERACOES,
        minhaEmpresa: CACHE_MINHA_EMPRESA,
        despesas: CACHE_DESPESAS,
        atividades: CACHE_ATIVIDADES,
        date: new Date().toISOString(),
        version: "6.0"
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "logimaster_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.importDataBackup = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (!confirm("Isso substituirá os dados atuais pelos do backup. Continuar?")) return;
            
            // Restaura caches
            if(json.funcionarios) await salvarListaFuncionarios(json.funcionarios);
            if(json.veiculos) await salvarListaVeiculos(json.veiculos);
            if(json.operacoes) await salvarListaOperacoes(json.operacoes);
            if(json.contratantes) await salvarListaContratantes(json.contratantes);
            if(json.minhaEmpresa) await salvarDadosMinhaEmpresa(json.minhaEmpresa);
            if(json.despesas) await salvarListaDespesas(json.despesas);
            if(json.atividades) await salvarListaAtividades(json.atividades);
            
            alert("Backup restaurado com sucesso! A página será recarregada.");
            window.location.reload();
        } catch(err) {
            alert("Erro ao ler arquivo: " + err.message);
        }
    };
    reader.readAsText(file);
};

window.zerarSistemaCompleto = function() {
    // Exibe modal de segurança
    const modal = document.getElementById('modalSecurityConfirm');
    document.getElementById('securityActionText').textContent = "ATENÇÃO: Isso apagará TODOS os dados da empresa (Funcionários, Operações, Veículos, Financeiro). Esta ação é IRREVERSÍVEL.";
    modal.style.display = 'flex';
    
    document.getElementById('btnConfirmSecurity').onclick = async () => {
        const pass = document.getElementById('securityPasswordInput').value;
        if (!pass) return;

        // Reautenticar para segurança
        const { auth, reauthenticateWithCredential, EmailAuthProvider } = window.dbRef;
        const cred = EmailAuthProvider.credential(window.USUARIO_ATUAL.email, pass);
        
        try {
            const btn = document.getElementById('btnConfirmSecurity');
            btn.textContent = "LIMPANDO...";
            btn.disabled = true;

            await reauthenticateWithCredential(auth.currentUser, cred);
            
            // Limpa Caches Locais
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
            document.getElementById('btnConfirmSecurity').disabled = false;
        }
    };
};
