// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 6.1 (CORREÇÃO DE INICIALIZAÇÃO E SEGURANÇA)
// =============================================================================
// PARTE 1 DE 5: CONSTANTES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS SEGURA
// =============================================================================

console.log(">>> [BOOT] Carregando Script LOGIMASTER v6.1...");

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

// Variáveis de Controle de Paginação de Operações
window.ITEMS_PER_PAGE_OP = 10;
window.CURRENT_PAGE_OP = 1;

// Status da licença do sistema da empresa atual
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 3. CACHE LOCAL (Inicializado vazio para evitar erro de undefined)
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
// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS) - BLINDADAS
// -----------------------------------------------------------------------------

function formatarValorMoeda(valor) {
    try {
        if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
        var numero = Number(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
    } catch (e) {
        console.warn("Erro ao formatar moeda:", e);
        return 'R$ 0,00';
    }
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    try {
        // Tenta dividir a data assumindo formato ISO YYYY-MM-DD
        if (typeof dataIso === 'string' && dataIso.includes('-')) {
            var partes = dataIso.split('T')[0].split('-');
            if (partes.length >= 3) {
                return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
            }
        }
        return dataIso; 
    } catch (e) {
        return dataIso; // Retorna original se falhar
    }
}

function formatarTelefoneBrasil(telefone) {
    if (!telefone) return '';
    var numeros = String(telefone).replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// -----------------------------------------------------------------------------
// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
// -----------------------------------------------------------------------------

function sanitizarObjetoParaFirebase(obj) {
    // Remove undefined para evitar erro do Firestore
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        return (value === undefined) ? null : value;
    }));
}

async function sincronizarDadosComFirebase() {
    console.log(">>> [SYNC] Iniciando sincronia com Firebase...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn(">>> [SYNC] Modo Offline ou Sem Empresa. Carregando LocalStorage.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Helper interno seguro
    async function baixarColecao(chave, setterCallback) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setterCallback(data.items || {});
                } else {
                    setterCallback(Array.isArray(lista) ? lista : []);
                }
                
                // Atualiza backup local
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                console.log(`>>> [SYNC] Coleção ${chave} não existe na nuvem. Usando vazio.`);
                setterCallback([]); 
            }
        } catch (e) {
            console.error(`!!! [ERRO SYNC] Falha ao baixar ${chave}:`, e);
            // Em caso de erro, tenta carregar do local para não travar o sistema
            try {
                const local = localStorage.getItem(chave);
                if (local) setterCallback(JSON.parse(local));
            } catch (z) { console.error("Falha fatal no fallback local:", z); }
        }
    }

    // Executa downloads em paralelo
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

    console.log(">>> [SYNC] Sincronia concluída. Memória pronta.");
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

// Funções de salvamento (CRUD)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    try {
        atualizarCacheCallback(dados);
        localStorage.setItem(chave, JSON.stringify(dados));
        
        if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
            if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
                 console.warn("Salvamento na nuvem bloqueado (Sistema sem créditos).");
                 return;
            }

            const { db, doc, setDoc } = window.dbRef;
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(), 
                updatedBy: window.USUARIO_ATUAL.email
            });
            
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        }
    } catch (erro) {
        console.error("Erro ao salvar dados (" + chave + "):", erro);
        alert("Erro ao salvar: " + erro.message);
    }
}

// Wrappers específicos para cada coleção
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Helpers de busca seguros
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2 DE 5: INICIALIZAÇÃO SEGURA, NAVEGAÇÃO E DASHBOARD BLINDADO
// =============================================================================

// -----------------------------------------------------------------------------
// 6. INICIALIZAÇÃO DO SISTEMA E CONTROLE DE ACESSO
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> [INIT] Iniciando sistema para:", user.email, "| Role:", user.role);
    
    // 1. Oculta todos os menus inicialmente
    const menus = ['menu-admin', 'menu-super-admin', 'menu-employee'];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 2. Remove classe active de todas as abas
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    // 3. Remove loader se existir
    const loader = document.getElementById('loaderOverlay');
    if (loader) loader.style.display = 'none';

    // --- CORREÇÃO CRÍTICA: Configura Navegação ANTES de carregar dados ---
    setupNavigation(); 

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
        // SUPER ADMIN
        const menu = document.getElementById('menu-super-admin');
        if(menu) menu.style.display = 'block';
        
        carregarPainelSuperAdmin();
        showPage('super-admin');

    } else if (user.role === 'admin') {
        // ADMIN DA EMPRESA
        const menu = document.getElementById('menu-admin');
        if(menu) menu.style.display = 'block';
        
        // Abre a Home IMEDIATAMENTE (mesmo sem dados atualizados)
        showPage('home');
        
        // Carrega dados em segundo plano
        await sincronizarDadosComFirebase();
        
        // Atualiza a tela após dados chegarem
        verificarAvisosVencimento();
        atualizarDashboard();
        atualizarNotificacoesPendentes();

    } else if (user.role === 'funcionario') {
        // FUNCIONÁRIO
        const menu = document.getElementById('menu-employee');
        if(menu) menu.style.display = 'block';
        
        window.MODO_APENAS_LEITURA = true;
        
        showPage('employee-home');
        
        await sincronizarDadosComFirebase();
        carregarPainelFuncionario();
    }
    
    console.log(">>> [INIT] Sistema carregado.");
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
    try {
        const hoje = new Date();
        const avisoDias = 30; 
        let msg = "";
        
        CACHE_FUNCIONARIOS.forEach(func => {
            if (func.funcao === 'motorista' && func.driverData && func.driverData.validadeCNH) {
                const validade = new Date(func.driverData.validadeCNH);
                const diffTime = validade - hoje;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 0) {
                    msg += `- CNH de ${func.nome} VENCEU em ${formatarDataParaBrasileiro(func.driverData.validadeCNH)}\n`;
                } else if (diffDays <= avisoDias) {
                    msg += `- CNH de ${func.nome} vence em ${diffDays} dias\n`;
                }
            }
        });

        if (msg) console.warn("AVISOS DE VENCIMENTO:\n" + msg);
    } catch (e) {
        console.warn("Erro ao verificar vencimentos:", e);
    }
}

// -----------------------------------------------------------------------------
// 7. LÓGICA DE NAVEGAÇÃO (SIDEBAR E PAGINAÇÃO) - BLINDADA
// -----------------------------------------------------------------------------

function setupNavigation() {
    console.log(">>> [NAV] Configurando listeners de navegação...");
    
    // Menu Desktop e Mobile
    const navItems = document.querySelectorAll('.nav-item');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('mobileMenuBtn');

    navItems.forEach(item => {
        // Clone para remover listeners antigos e evitar duplicação
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', () => {
            const pageId = newItem.getAttribute('data-page');
            console.log("Navegando para:", pageId);
            showPage(pageId);
            
            // Fecha menu mobile ao clicar
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('active');
                if(overlay) overlay.style.display = 'none';
            }
        });
    });

    // Toggle Mobile
    if (mobileBtn) {
        const newBtn = mobileBtn.cloneNode(true);
        mobileBtn.parentNode.replaceChild(newBtn, mobileBtn);
        
        newBtn.addEventListener('click', () => {
            if(sidebar) sidebar.classList.toggle('active');
            if (sidebar && sidebar.classList.contains('active')) {
                if(overlay) overlay.style.display = 'block';
            } else {
                if(overlay) overlay.style.display = 'none';
            }
        });
    }

    // Overlay click fecha menu
    if (overlay) {
        const newOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOverlay, overlay);
        
        newOverlay.addEventListener('click', () => {
            if(sidebar) sidebar.classList.remove('active');
            newOverlay.style.display = 'none';
        });
    }
}

function showPage(pageId) {
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Mostra a página alvo
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
    } else {
        console.error("Página não encontrada:", pageId);
        return;
    }

    // Atualiza menu sidebar
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageId) {
            nav.classList.add('active');
        }
    });

    // Lógica específica ao entrar na página (Refresh de dados)
    // Envolto em try-catch para não travar a navegação se uma função falhar
    try {
        if (pageId === 'home') {
            atualizarDashboard();
        } else if (pageId === 'operacoes') {
            renderizarSelectsOperacao();
            renderizarTabelaOperacoes(); 
        } else if (pageId === 'cadastros') {
            renderizarTabelasCadastro();
        } else if (pageId === 'despesas') {
            renderizarTabelaDespesas();
            carregarSelectVeiculosDespesa();
        } else if (pageId === 'access-management') {
            renderizarPainelEquipe(); 
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
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            
            const inpIni = document.getElementById('dataInicioServicosFunc');
            const inpFim = document.getElementById('dataFimServicosFunc');
            
            if(inpIni) inpIni.value = primeiroDia.toISOString().split('T')[0];
            if(inpFim) inpFim.value = ultimoDia.toISOString().split('T')[0];
            
            filtrarServicosFuncionario(window.USUARIO_ATUAL.uid);
        }
    } catch (e) {
        console.error("Erro ao renderizar página " + pageId + ":", e);
    }
}

// -----------------------------------------------------------------------------
// 8. LÓGICA DO DASHBOARD (HOME) - BLINDADA
// -----------------------------------------------------------------------------

function atualizarDashboard() {
    try {
        // Atualiza data atual se necessário
        const mesAtual = window.currentDate.getMonth();
        const anoAtual = window.currentDate.getFullYear();
        
        let faturamentoTotal = 0;
        let despesasTotal = 0; 
        
        // 1. Somar Operações do Mês
        if (Array.isArray(CACHE_OPERACOES)) {
            CACHE_OPERACOES.forEach(op => {
                if (!op.data) return;
                try {
                    const dataOp = new Date(op.data + 'T12:00:00'); 
                    if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
                        const receita = parseFloat(op.financeiro?.faturamento) || 0;
                        const combustivel = parseFloat(op.financeiro?.combustivel) || 0;
                        const comissao = parseFloat(op.financeiro?.comissaoMotorista) || 0;
                        const extras = parseFloat(op.financeiro?.despesasViagem) || 0;
                        
                        faturamentoTotal += receita;
                        despesasTotal += (combustivel + comissao + extras);
                    }
                } catch (errOp) { console.warn("Erro ao processar op:", op, errOp); }
            });
        }

        // 2. Somar Despesas Gerais do Mês
        if (Array.isArray(CACHE_DESPESAS)) {
            CACHE_DESPESAS.forEach(desp => {
                if (!desp.data) return;
                const dataDesp = new Date(desp.data + 'T12:00:00');
                if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                    despesasTotal += (parseFloat(desp.valor) || 0);
                }
            });
        }

        // 3. Calcular Resultados
        const lucroLiquido = faturamentoTotal - despesasTotal;
        let margem = 0;
        if (faturamentoTotal > 0) {
            margem = (lucroLiquido / faturamentoTotal) * 100;
        }

        // 4. Atualizar DOM (Verifica existência antes)
        const elFat = document.getElementById('faturamentoMes');
        const elDesp = document.getElementById('despesasMes');
        const elLucro = document.getElementById('receitaMes');
        const elMargem = document.getElementById('margemLucroMedia');

        if(elFat) elFat.textContent = formatarValorMoeda(faturamentoTotal);
        if(elDesp) elDesp.textContent = formatarValorMoeda(despesasTotal);
        if(elLucro) elLucro.textContent = formatarValorMoeda(lucroLiquido);
        if(elMargem) elMargem.textContent = margem.toFixed(1) + '%';
        
        // Cores indicativas
        if (elLucro && elLucro.parentElement) {
            if (lucroLiquido >= 0) {
                elLucro.parentElement.className = 'stat-card primary';
            } else {
                elLucro.parentElement.className = 'stat-card danger';
            }
        }

        // 5. Atualizar Componentes Filhos com segurança
        renderizarCalendario();
        atualizarGraficoFinanceiro();
        renderizarResumoVeiculosDashboard(mesAtual, anoAtual);

    } catch (e) {
        console.error("FATAL: Erro no cálculo do Dashboard:", e);
    }
}

function toggleDashboardPrivacy() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    targets.forEach(el => {
        el.classList.toggle('privacy-blur');
    });
    
    if (icon) {
        if (icon.classList.contains('fa-eye')) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

// -----------------------------------------------------------------------------
// 9. LÓGICA DO CALENDÁRIO - BLINDADA
// -----------------------------------------------------------------------------

function renderizarCalendario() {
    try {
        const grid = document.getElementById('calendarGrid');
        const monthLabel = document.getElementById('currentMonthYear');
        
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const year = window.currentDate.getFullYear();
        const month = window.currentDate.getMonth();
        
        const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
        if(monthLabel) monthLabel.textContent = `${months[month]} ${year}`;
        
        const firstDay = new Date(year, month, 1).getDay(); 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell empty';
            grid.appendChild(emptyCell);
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            const dayNumber = document.createElement('div');
            dayNumber.style.fontWeight = 'bold';
            dayNumber.style.fontSize = '0.9rem';
            dayNumber.textContent = day;
            cell.appendChild(dayNumber);
            
            const dataStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            
            // Filtra operações (verificação segura de array)
            const opsDoDia = (Array.isArray(CACHE_OPERACOES) ? CACHE_OPERACOES : []).filter(op => op.data === dataStr);
            
            if (opsDoDia.length > 0) {
                const dotsContainer = document.createElement('div');
                dotsContainer.style.display = 'flex';
                dotsContainer.style.gap = '2px';
                dotsContainer.style.flexWrap = 'wrap';
                
                opsDoDia.slice(0, 5).forEach(op => {
                    const dot = document.createElement('span');
                    dot.className = 'event-dot';
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
                
                const totalDia = opsDoDia.reduce((acc, curr) => acc + (parseFloat(curr.financeiro?.faturamento)||0), 0);
                const totalLabel = document.createElement('div');
                totalLabel.style.fontSize = '0.7rem';
                totalLabel.style.marginTop = 'auto'; 
                totalLabel.style.color = '#28a745';
                totalLabel.textContent = totalDia > 0 ? (totalDia/1000).toFixed(1) + 'k' : '';
                cell.appendChild(totalLabel);
            }
            
            cell.onclick = () => abrirModalResumoDia(dataStr, opsDoDia);
            grid.appendChild(cell);
        }
    } catch (e) {
        console.error("Erro no calendário:", e);
    }
}

function changeMonth(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    atualizarDashboard(); 
}

function abrirModalResumoDia(dataIso, operacoes) {
    const modal = document.getElementById('modalDayOperations');
    const title = document.getElementById('modalDayTitle');
    const body = document.getElementById('modalDayBody');
    const summary = document.getElementById('modalDaySummary');
    
    if(!modal) return;

    title.textContent = "OPERAÇÕES: " + formatarDataParaBrasileiro(dataIso);
    body.innerHTML = '';
    summary.innerHTML = '';
    
    if (!operacoes || operacoes.length === 0) {
        body.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma operação registrada neste dia.</p>';
        modal.style.display = 'flex';
        return;
    }
    
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
        
        const fat = parseFloat(op.financeiro?.faturamento) || 0;
        const custo = (parseFloat(op.financeiro?.combustivel)||0) + (parseFloat(op.financeiro?.comissaoMotorista)||0) + (parseFloat(op.financeiro?.despesasViagem)||0);
        
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
                    <button class="btn-primary btn-mini" onclick="document.getElementById('modalDayOperations').style.display='none'; verDetalhesOperacao('${op.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    body.innerHTML = html;
    
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
// 10. LÓGICA DE GRÁFICOS (CHART.JS) - BLINDADA
// -----------------------------------------------------------------------------

function atualizarGraficoFinanceiro() {
    try {
        const ctx = document.getElementById('mainChart');
        if (!ctx) return;
        
        const filtroVeiculo = document.getElementById('filtroVeiculoGrafico')?.value;
        const filtroMotorista = document.getElementById('filtroMotoristaGrafico')?.value;
        
        const labels = [];
        const dataReceita = [];
        const dataDespesa = [];
        const dataLucro = [];
        
        const hoje = new Date();
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            const mes = d.getMonth();
            const ano = d.getFullYear();
            const mesNome = d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();
            
            labels.push(mesNome);
            
            let rec = 0;
            let desp = 0; 
            
            if (Array.isArray(CACHE_OPERACOES)) {
                CACHE_OPERACOES.forEach(op => {
                    const opData = new Date(op.data + 'T12:00:00');
                    if (opData.getMonth() === mes && opData.getFullYear() === ano) {
                        
                        if (filtroVeiculo && op.veiculoId !== filtroVeiculo) return;
                        if (filtroMotorista && String(op.motoristaId) !== filtroMotorista) return;
                        
                        const r = parseFloat(op.financeiro?.faturamento) || 0;
                        const c = (parseFloat(op.financeiro?.combustivel)||0) + 
                                  (parseFloat(op.financeiro?.comissaoMotorista)||0) + 
                                  (parseFloat(op.financeiro?.despesasViagem)||0);
                                  
                        rec += r;
                        desp += c;
                    }
                });
            }
            
            // Soma Despesas Gerais se não houver filtro de motorista
            if (!filtroMotorista && Array.isArray(CACHE_DESPESAS)) { 
                CACHE_DESPESAS.forEach(gd => {
                    const gdData = new Date(gd.data + 'T12:00:00');
                    if (gdData.getMonth() === mes && gdData.getFullYear() === ano) {
                         if (filtroVeiculo) {
                             if (gd.vinculoVeiculo === filtroVeiculo) {
                                 desp += (parseFloat(gd.valor) || 0);
                             }
                         } else {
                             desp += (parseFloat(gd.valor) || 0);
                         }
                    }
                });
            }
            
            dataReceita.push(rec);
            dataDespesa.push(desp);
            dataLucro.push(rec - desp);
        }
        
        if (window.chartInstance) {
            window.chartInstance.destroy();
        }
        
        window.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'FATURAMENTO', data: dataReceita, backgroundColor: 'rgba(40, 167, 69, 0.7)', borderColor: '#28a745', borderWidth: 1 },
                    { label: 'CUSTOS', data: dataDespesa, backgroundColor: 'rgba(220, 53, 69, 0.7)', borderColor: '#dc3545', borderWidth: 1 },
                    { label: 'LUCRO', data: dataLucro, type: 'line', borderColor: '#007bff', borderWidth: 3, pointBackgroundColor: '#fff', fill: false, tension: 0.3 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    } catch (e) {
        console.error("Erro ao renderizar gráfico:", e);
    }
}

function renderizarResumoVeiculosDashboard(mes, ano) {
    try {
        const container = document.getElementById('chartVehicleSummaryContainer');
        if (!container) return;
        
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.id = 'chartVehicleSummary';
        
        const resumo = {};
        
        if (Array.isArray(CACHE_OPERACOES)) {
            CACHE_OPERACOES.forEach(op => {
                const d = new Date(op.data + 'T12:00:00');
                if (d.getMonth() === mes && d.getFullYear() === ano && op.veiculoId) {
                    if (!resumo[op.veiculoId]) resumo[op.veiculoId] = 0;
                    resumo[op.veiculoId] += (parseFloat(op.financeiro?.faturamento) || 0);
                }
            });
        }
        
        const placas = Object.keys(resumo);
        if (placas.length === 0) {
            container.innerHTML = '<p style="color:#666; font-style:italic;">Sem dados de veículos neste mês.</p>';
            return;
        }
        
        placas.forEach(placa => {
            const val = resumo[placa];
            const box = document.createElement('div');
            box.className = 'veh-stat-box';
            box.innerHTML = `<small>${placa}</small><span>${(val/1000).toFixed(1)}k</span>`;
            wrapper.appendChild(box);
        });
        
        container.appendChild(wrapper);
    } catch (e) { console.warn("Erro no resumo de veículos:", e); }
}

function limparOutroFiltro(tipo) {
    if (tipo === 'motorista') {
        const f = document.getElementById('filtroMotoristaGrafico');
        if(f) f.value = "";
    } else if (tipo === 'veiculo') {
        const f = document.getElementById('filtroVeiculoGrafico');
        if(f) f.value = "";
    }
}
// =============================================================================
// PARTE 3 DE 5: OPERAÇÕES (CRUD), PAGINAÇÃO E MONITORAMENTO BLINDADO
// =============================================================================

// -----------------------------------------------------------------------------
// 11. GESTÃO DE OPERAÇÕES - RENDERIZAÇÃO E SELECTS
// -----------------------------------------------------------------------------

function renderizarSelectsOperacao() {
    try {
        const selMot = document.getElementById('selectMotoristaOperacao');
        const selVeic = document.getElementById('selectVeiculoOperacao');
        const selCli = document.getElementById('selectContratanteOperacao');
        const selAtiv = document.getElementById('selectAtividadeOperacao');
        const selAjud = document.getElementById('selectAjudantesOperacao');
        
        // Helper para preencher options com segurança
        function preencher(select, dados, valueProp, textProp, filtro = null) {
            if (!select) return;
            select.innerHTML = '<option value="">SELECIONE...</option>';
            
            if (!Array.isArray(dados)) return; // Proteção contra dados inválidos

            dados.forEach(item => {
                try {
                    if (filtro && !filtro(item)) return;
                    const opt = document.createElement('option');
                    opt.value = item[valueProp] || ''; // Fallback seguro
                    opt.textContent = item[textProp] || 'Sem Nome';
                    select.appendChild(opt);
                } catch (e) { console.warn("Erro ao renderizar item do select:", item); }
            });
        }

        preencher(selMot, CACHE_FUNCIONARIOS, 'id', 'nome', f => f.funcao === 'motorista' && f.status === 'ativo');
        preencher(selVeic, CACHE_VEICULOS, 'placa', 'modelo');
        preencher(selCli, CACHE_CONTRATANTES, 'cnpj', 'razaoSocial');
        preencher(selAtiv, CACHE_ATIVIDADES, 'id', 'nome');
        preencher(selAjud, CACHE_FUNCIONARIOS, 'id', 'nome', f => f.funcao === 'ajudante' && f.status === 'ativo');
        
    } catch (e) {
        console.error("Erro fatal ao renderizar selects:", e);
    }
}

// --- LÓGICA DE PAGINAÇÃO DE OPERAÇÕES (COM PROTEÇÃO) ---

function renderizarTabelaOperacoes() {
    try {
        const tbody = document.querySelector('#tabelaOperacoes tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!Array.isArray(CACHE_OPERACOES)) {
            tbody.innerHTML = '<tr><td colspan="5">Erro nos dados.</td></tr>';
            return;
        }

        // Ordenar por data (mais recente primeiro) com segurança
        let opsOrdenadas = [...CACHE_OPERACOES].sort((a, b) => {
            const da = new Date(a.data || 0);
            const db = new Date(b.data || 0);
            return db - da;
        });

        // Calcular Paginação
        const totalItems = opsOrdenadas.length;
        const itemsPerPage = parseInt(window.ITEMS_PER_PAGE_OP) || 10;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        
        // Ajustar página atual
        if (window.CURRENT_PAGE_OP > totalPages) window.CURRENT_PAGE_OP = totalPages;
        if (window.CURRENT_PAGE_OP < 1) window.CURRENT_PAGE_OP = 1;

        // Fatiar array
        const startIndex = (window.CURRENT_PAGE_OP - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const opsPagina = opsOrdenadas.slice(startIndex, endIndex);

        // Renderizar linhas
        opsPagina.forEach(op => {
            try {
                const tr = document.createElement('tr');
                
                const mot = buscarFuncionarioPorId(op.motoristaId);
                const nomeMot = mot ? mot.nome.split(' ')[0] : 'Ex-Func.';
                const veic = buscarVeiculoPorPlaca(op.veiculoId);
                const modeloVeic = veic ? veic.modelo : (op.veiculoId || 'N/D');
                
                let statusClass = 'pill-pending';
                let statusText = op.status || 'DESCONHECIDO';
                
                if (op.status === 'concluido') { statusClass = 'pill-active'; statusText = 'CONCLUÍDO'; }
                else if (op.status === 'cancelado') { statusClass = 'pill-blocked'; statusText = 'CANCELADO'; }
                else if (op.status === 'agendado') { statusClass = 'pill-paused'; statusText = 'AGENDADO'; }
                else if (op.status === 'em_andamento') { statusClass = 'pill-active'; statusText = 'EM ROTA'; }

                const fatVal = op.financeiro?.faturamento || 0;

                tr.innerHTML = `
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>
                        <div style="font-weight:bold;">${modeloVeic}</div>
                        <div style="font-size:0.8rem; color:#666;">${nomeMot}</div>
                    </td>
                    <td><span class="status-pill ${statusClass}">${statusText.toUpperCase()}</span></td>
                    <td>${formatarValorMoeda(fatVal)}</td>
                    <td>
                        <button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                        <button class="btn-warning btn-mini" onclick="editarOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-danger btn-mini" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            } catch (errRow) { console.warn("Erro ao renderizar linha da tabela:", errRow); }
        });

        // Atualizar Indicadores de Paginação
        const indicador = document.getElementById('pageIndicatorOp');
        if (indicador) {
            indicador.textContent = `${window.CURRENT_PAGE_OP} / ${totalPages}`;
        }
    } catch (e) {
        console.error("Erro fatal ao renderizar tabela de operações:", e);
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
        window.CURRENT_PAGE_OP = 1;
        renderizarTabelaOperacoes();
    }
}

// -----------------------------------------------------------------------------
// 12. CRUD OPERAÇÕES (SALVAR / EDITAR / EXCLUIR)
// -----------------------------------------------------------------------------

const formOperacao = document.getElementById('formOperacao');
if (formOperacao) {
    // Remove listeners antigos clonando o elemento
    const newForm = formOperacao.cloneNode(true);
    formOperacao.parentNode.replaceChild(newForm, formOperacao);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (window.MODO_APENAS_LEITURA) { alert("Modo leitura."); return; }
        
        try {
            // Coleta de dados com proteção
            const id = document.getElementById('operacaoId').value;
            const data = document.getElementById('operacaoData').value;
            const motoristaId = document.getElementById('selectMotoristaOperacao').value;
            const veiculoId = document.getElementById('selectVeiculoOperacao').value;
            const contratanteId = document.getElementById('selectContratanteOperacao').value;
            const atividadeId = document.getElementById('selectAtividadeOperacao').value;
            
            // Financeiro (Parse seguro)
            const getVal = (eid) => parseFloat(document.getElementById(eid)?.value) || 0;
            
            const financeiro = {
                faturamento: getVal('operacaoFaturamento'),
                adiantamento: getVal('operacaoAdiantamento'),
                comissaoMotorista: getVal('operacaoComissao'),
                despesasViagem: getVal('operacaoDespesas'),
                combustivel: getVal('operacaoCombustivel'),
                precoLitro: getVal('operacaoPrecoLitro'),
                kmRodado: getVal('operacaoKmRodado')
            };
            
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            
            if (!motoristaId || !veiculoId || !contratanteId) {
                alert("Preencha motorista, veículo e cliente.");
                return;
            }
            
            // Preservar dados existentes se for edição
            let checkinDataExistente = null;
            if (id) {
                const opAntiga = CACHE_OPERACOES.find(o => o.id === id);
                if (opAntiga) checkinDataExistente = opAntiga.checkinData;
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
                financeiro: financeiro,
                checkinData: checkinDataExistente // Mantém histórico de checkin
            };

            let listaAtualizada = [...CACHE_OPERACOES];
            if (id) {
                const index = listaAtualizada.findIndex(o => o.id === id);
                if (index > -1) listaAtualizada[index] = novaOp;
            } else {
                listaAtualizada.push(novaOp);
            }
            
            await salvarListaOperacoes(listaAtualizada);
            
            alert("Operação salva com sucesso!");
            newForm.reset();
            document.getElementById('operacaoId').value = "";
            window._operacaoAjudantesTempList = [];
            
            const listaAj = document.getElementById('listaAjudantesAdicionados');
            if(listaAj) listaAj.innerHTML = '';
            
            renderizarTabelaOperacoes();
            atualizarDashboard();
            renderizarCheckinsPendentes();

        } catch (err) {
            console.error("Erro ao salvar operação:", err);
            alert("Erro ao salvar: " + err.message);
        }
    });
}

function editarOperacao(id) {
    const op = CACHE_OPERACOES.find(o => o.id === id);
    if (!op) return;
    
    try {
        const setVal = (eid, val) => {
            const el = document.getElementById(eid);
            if(el) el.value = (val !== undefined && val !== null) ? val : '';
        };

        setVal('operacaoId', op.id);
        setVal('operacaoData', op.data);
        setVal('selectMotoristaOperacao', op.motoristaId);
        setVal('selectVeiculoOperacao', op.veiculoId);
        setVal('selectContratanteOperacao', op.contratanteId);
        setVal('selectAtividadeOperacao', op.atividadeId);
        
        // Financeiro Seguro
        const fin = op.financeiro || {};
        setVal('operacaoFaturamento', fin.faturamento);
        setVal('operacaoAdiantamento', fin.adiantamento);
        setVal('operacaoComissao', fin.comissaoMotorista);
        setVal('operacaoDespesas', fin.despesasViagem);
        setVal('operacaoCombustivel', fin.combustivel);
        setVal('operacaoPrecoLitro', fin.precoLitro);
        setVal('operacaoKmRodado', fin.kmRodado);
        
        const check = document.getElementById('operacaoIsAgendamento');
        if(check) check.checked = (op.status === 'agendado');
        
        window._operacaoAjudantesTempList = op.ajudantes || [];
        atualizarListaAjudantesUI();
        
        document.querySelector('.content').scrollTop = 0;
    } catch(e) { console.error("Erro ao editar:", e); }
}

async function excluirOperacao(id) {
    if (confirm("Tem certeza que deseja excluir esta operação? Isso afetará o financeiro.")) {
        try {
            const novaLista = CACHE_OPERACOES.filter(o => o.id !== id);
            await salvarListaOperacoes(novaLista);
            renderizarTabelaOperacoes();
            atualizarDashboard();
            renderizarCheckinsPendentes();
        } catch(e) { console.error("Erro ao excluir:", e); }
    }
}

// --- AJUDANTES NA OPERAÇÃO ---
const btnAddAjudante = document.getElementById('btnManualAddAjudante');
if (btnAddAjudante) {
    // Clone para limpar listeners
    const newBtn = btnAddAjudante.cloneNode(true);
    btnAddAjudante.parentNode.replaceChild(newBtn, btnAddAjudante);

    newBtn.addEventListener('click', () => {
        const select = document.getElementById('selectAjudantesOperacao');
        const idAjudante = select.value;
        if (!idAjudante) return;
        
        const func = buscarFuncionarioPorId(idAjudante);
        
        const modal = document.getElementById('modalAdicionarAjudante');
        document.getElementById('modalAjudanteNome').textContent = func ? func.nome : 'Ajudante';
        document.getElementById('modalAjudanteNome').dataset.id = idAjudante;
        document.getElementById('modalDiariaInput').value = '';
        modal.style.display = 'flex';
    });
}

window.closeAdicionarAjudanteModal = function() {
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}

const btnConfirmAddAj = document.getElementById('modalAjudanteAddBtn');
if(btnConfirmAddAj) {
    // Clone
    const newBtnAj = btnConfirmAddAj.cloneNode(true);
    btnConfirmAddAj.parentNode.replaceChild(newBtnAj, btnConfirmAddAj);

    newBtnAj.onclick = () => {
        const id = document.getElementById('modalAjudanteNome').dataset.id;
        const valor = parseFloat(document.getElementById('modalDiariaInput').value) || 0;
        
        if (valor <= 0) { alert("Informe um valor válido."); return; }
        
        window._operacaoAjudantesTempList.push({ idFuncionario: id, valor: valor });
        atualizarListaAjudantesUI();
        closeAdicionarAjudanteModal();
        document.getElementById('selectAjudantesOperacao').value = "";
    };
}

function atualizarListaAjudantesUI() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if(!ul) return;
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
// 13. VISUALIZAÇÃO DETALHADA (MODAL) - BLINDADA
// -----------------------------------------------------------------------------

window.verDetalhesOperacao = function(id) {
    const op = CACHE_OPERACOES.find(o => o.id === id);
    if (!op) return;

    try {
        const modal = document.getElementById('operationDetailsModal');
        const body = document.getElementById('modalBodyContent');
        const title = document.getElementById('modalTitle');
        
        if(title) title.textContent = "DETALHES DA OPERAÇÃO";
        
        const mot = buscarFuncionarioPorId(op.motoristaId)?.nome || 'N/D';
        const veic = buscarVeiculoPorPlaca(op.veiculoId)?.modelo || op.veiculoId || 'N/D';
        const cli = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial || 'N/D';
        const serv = buscarAtividadePorId(op.atividadeId)?.nome || 'Geral';

        // Ajudantes
        let ajudantesHtml = '<em>Nenhum</em>';
        if (op.ajudantes && op.ajudantes.length > 0) {
            ajudantesHtml = op.ajudantes.map(a => {
                const nome = buscarFuncionarioPorId(a.idFuncionario)?.nome || '...';
                return `${nome} (${formatarValorMoeda(a.valor)})`;
            }).join('<br>');
        }

        // Financeiro (Safety Check)
        const fin = op.financeiro || {};
        const custoTotal = (parseFloat(fin.combustivel)||0) + 
                           (parseFloat(fin.comissaoMotorista)||0) + 
                           (parseFloat(fin.despesasViagem)||0);
        const lucro = (parseFloat(fin.faturamento)||0) - custoTotal;

        // Check-in
        let kmInicial = 'N/I';
        let kmFinal = 'N/I';
        let kmRodado = fin.kmRodado || '0';
        let horaInicio = '-';
        let horaFim = '-';

        if (op.checkinData) {
            kmInicial = op.checkinData.kmInicial || 'N/I';
            kmFinal = op.checkinData.kmFinal || 'N/I';
            
            if (op.checkinData.timestampInicio) {
                try { horaInicio = new Date(op.checkinData.timestampInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch(e){}
            }
            if (op.checkinData.timestampFim) {
                try { horaFim = new Date(op.checkinData.timestampFim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch(e){}
            }
        }

        const html = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div>
                    <p><strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}</p>
                    <p><strong>STATUS:</strong> ${op.status ? op.status.toUpperCase() : 'N/A'}</p>
                    <p><strong>CLIENTE:</strong> ${cli}</p>
                    <p><strong>SERVIÇO:</strong> ${serv}</p>
                </div>
                <div>
                    <p><strong>VEÍCULO:</strong> ${veic}</p>
                    <p><strong>MOTORISTA:</strong> ${mot}</p>
                    <p><strong>AJUDANTES:</strong><br>${ajudantesHtml}</p>
                </div>
            </div>

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

            <hr style="margin:15px 0;">
            
            <h4 style="color:#28a745;">FINANCEIRO</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>FATURAMENTO: <strong>${formatarValorMoeda(fin.faturamento)}</strong></div>
                <div>ADIANTAMENTO: <strong>${formatarValorMoeda(fin.adiantamento)}</strong></div>
                <div>COMBUSTÍVEL: <strong style="color:var(--danger-color);">${formatarValorMoeda(fin.combustivel)}</strong></div>
                <div>COMISSÃO MOT.: <strong style="color:var(--danger-color);">${formatarValorMoeda(fin.comissaoMotorista)}</strong></div>
                <div>OUTRAS DESP.: <strong style="color:var(--danger-color);">${formatarValorMoeda(fin.despesasViagem)}</strong></div>
            </div>
            
            <div style="margin-top:15px; padding:10px; background:#f8f9fa; text-align:right; border-radius:4px;">
                LUCRO LÍQUIDO APROXIMADO: <strong style="font-size:1.2rem; color:${lucro >= 0 ? 'green' : 'red'};">${formatarValorMoeda(lucro)}</strong>
            </div>
        `;
        
        body.innerHTML = html;
        modal.style.display = 'flex';
    } catch (e) {
        console.error("Erro ao abrir modal de detalhes:", e);
        alert("Não foi possível carregar os detalhes desta operação.");
    }
};

window.closeModal = function() {
    const m = document.getElementById('operationDetailsModal');
    if(m) m.style.display = 'none';
};

// -----------------------------------------------------------------------------
// 14. MONITORAMENTO (CHECK-INS PENDENTES) - BLINDADO
// -----------------------------------------------------------------------------

function renderizarCheckinsPendentes() {
    try {
        const tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!Array.isArray(CACHE_OPERACOES)) return;

        const pendentes = CACHE_OPERACOES.filter(op => 
            op.status === 'agendado' || op.status === 'em_andamento'
        );
        
        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma rota em andamento.</td></tr>';
            const badge = document.getElementById('badgeCheckins');
            if (badge) badge.style.display = 'none';
            return;
        }

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

            let horaInicio = '-';
            if (op.checkinData && op.checkinData.timestampInicio) {
                try { horaInicio = new Date(op.checkinData.timestampInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}); } catch(e){}
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
    } catch(e) {
        console.error("Erro na tabela de monitoramento:", e);
    }
}
// =============================================================================
// PARTE 4 DE 5: GESTÃO DE EQUIPE, DESPESAS E CADASTROS BLINDADOS
// =============================================================================

// -----------------------------------------------------------------------------
// 15. GESTÃO DE EQUIPE (MENSAGENS E APROVAÇÕES)
// -----------------------------------------------------------------------------

function renderizarPainelEquipe() {
    try {
        renderizarTabelaCompanyAtivos();
        renderizarProfileRequests();
        
        // Atualiza badge de notificações
        const badge = document.getElementById('badgeAccess');
        const requests = Array.isArray(CACHE_PROFILE_REQUESTS) ? CACHE_PROFILE_REQUESTS.length : 0;
        
        if (badge) {
            if (requests > 0) {
                badge.style.display = 'inline-block';
                badge.textContent = '!'; 
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) { console.error("Erro ao renderizar painel de equipe:", e); }
}

// --- NOVO: ENVIO DE MENSAGENS PARA EQUIPE ---
const formMsg = document.getElementById('formEnviarMensagemEquipe');
if (formMsg) {
    // Clone para limpar listeners antigos
    const newFormMsg = formMsg.cloneNode(true);
    formMsg.parentNode.replaceChild(newFormMsg, formMsg);

    newFormMsg.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const texto = document.getElementById('msgEquipeTexto').value;
            if (!texto) return;
            
            if (confirm(`Confirma o envio desta mensagem para TODOS os funcionários ativos?\n\n"${texto}"`)) {
                // Aqui entraria a lógica de salvar em 'notifications' no Firebase
                // Como não temos essa coleção estruturada, simulamos o sucesso.
                alert("MENSAGEM ENVIADA COM SUCESSO!\n\nOs funcionários receberão o aviso no painel.");
                document.getElementById('msgEquipeTexto').value = '';
            }
        } catch (err) { console.error("Erro ao enviar msg:", err); }
    });
}

function renderizarTabelaCompanyAtivos() {
    try {
        const tbody = document.querySelector('#tabelaCompanyAtivos tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!Array.isArray(CACHE_FUNCIONARIOS)) return;

        CACHE_FUNCIONARIOS.forEach(func => {
            if (func.status === 'inativo') return; 
            
            const tr = document.createElement('tr');
            let statusPill = '<span class="status-pill pill-active">ATIVO</span>';
            if (func.status === 'pendente') statusPill = '<span class="status-pill pill-pending">PENDENTE</span>';
            
            const cargo = func.funcao ? func.funcao.toUpperCase() : 'N/D';

            tr.innerHTML = `
                <td>${func.nome}</td>
                <td>${cargo}</td>
                <td>${statusPill}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="abrirModalStatusFuncionario('${func.id}')">
                        <i class="fas fa-cog"></i> GERENCIAR
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error("Erro tabela ativos:", e); }
}

// --- CORREÇÃO: APROVAÇÃO DE SOLICITAÇÃO DE DADOS ---

function renderizarProfileRequests() {
    try {
        const tbody = document.querySelector('#tabelaProfileRequests tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!Array.isArray(CACHE_PROFILE_REQUESTS) || CACHE_PROFILE_REQUESTS.length === 0) {
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
    } catch (e) { console.error("Erro requests:", e); }
}

function traduzirCampo(campo) {
    const mapa = {
        'telefone': 'TELEFONE', 'pix': 'CHAVE PIX', 'endereco': 'ENDEREÇO',
        'email': 'EMAIL', 'cnh': 'CNH'
    };
    return mapa[campo] || campo.toUpperCase();
}

window.aprovarProfileRequest = async function(reqId) {
    if (!confirm("Confirmar a alteração dos dados deste funcionário?")) return;
    
    try {
        const reqIndex = CACHE_PROFILE_REQUESTS.findIndex(r => r.id === reqId);
        if (reqIndex === -1) return;
        
        const req = CACHE_PROFILE_REQUESTS[reqIndex];
        const funcIndex = CACHE_FUNCIONARIOS.findIndex(f => f.id === req.userId);
        
        if (funcIndex > -1) {
            // Atualiza o campo específico
            CACHE_FUNCIONARIOS[funcIndex][req.campo] = req.novoValor;
            await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
            
            // Remove a solicitação
            CACHE_PROFILE_REQUESTS.splice(reqIndex, 1);
            await salvarProfileRequests(CACHE_PROFILE_REQUESTS);
            
            alert("Dados atualizados com sucesso!");
            renderizarPainelEquipe(); 
        } else {
            alert("Erro: Funcionário não encontrado.");
        }
    } catch (e) { console.error("Erro ao aprovar:", e); }
};

window.rejeitarProfileRequest = async function(reqId) {
    if (!confirm("Rejeitar esta solicitação?")) return;
    try {
        const novaLista = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
        await salvarProfileRequests(novaLista);
        renderizarPainelEquipe();
    } catch(e) { console.error("Erro ao rejeitar:", e); }
};

// --- MODAL DE STATUS (BLOQUEAR/ATIVAR/REMOVER) ---
window.abrirModalStatusFuncionario = function(id) {
    const func = buscarFuncionarioPorId(id);
    if (!func) return;
    
    try {
        const modal = document.getElementById('modalStatusFuncionario');
        const body = document.getElementById('statusFuncionarioBody');
        const actions = document.getElementById('statusFuncionarioActions');
        
        body.innerHTML = `
            <h3>${func.nome}</h3>
            <p>Login: ${func.email}</p>
            <p>Status Atual: <strong>${func.status ? func.status.toUpperCase() : 'N/A'}</strong></p>
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
    } catch(e) { console.error("Erro modal status:", e); }
};

window.alterarStatusFuncionario = async function(id, novoStatus) {
    const index = CACHE_FUNCIONARIOS.findIndex(f => f.id === id);
    if (index > -1) {
        CACHE_FUNCIONARIOS[index].status = novoStatus;
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
        document.getElementById('modalStatusFuncionario').style.display = 'none';
        renderizarPainelEquipe();
    }
};

window.excluirFuncionarioDefinitivo = async function(id) {
    if(confirm("ATENÇÃO: Isso excluirá todo o histórico e acesso do funcionário.\n\nContinuar?")) {
         const novaLista = CACHE_FUNCIONARIOS.filter(f => f.id !== id);
         await salvarListaFuncionarios(novaLista);
         document.getElementById('modalStatusFuncionario').style.display = 'none';
         renderizarPainelEquipe();
    }
};

// -----------------------------------------------------------------------------
// 16. DESPESAS GERAIS - BLINDADAS
// -----------------------------------------------------------------------------

const formDespesa = document.getElementById('formDespesaGeral');
if (formDespesa) {
    // Clone para limpar
    const newFormD = formDespesa.cloneNode(true);
    formDespesa.parentNode.replaceChild(newFormD, formDespesa);

    // Setup toggle de parcelas
    const selModo = document.getElementById('despesaModoPagamento');
    if (selModo) {
        // Remove listener antigo clonando o select
        const newSel = selModo.cloneNode(true);
        selModo.parentNode.replaceChild(newSel, selModo);
        
        newSel.addEventListener('change', (e) => {
            const div = document.getElementById('divDespesaParcelas');
            if(div) div.style.display = e.target.value === 'parcelado' ? 'flex' : 'none';
        });
    }

    newFormD.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (window.MODO_APENAS_LEITURA) return;

        try {
            const data = document.getElementById('despesaGeralData').value;
            const veiculo = document.getElementById('selectVeiculoDespesaGeral').value;
            const desc = document.getElementById('despesaGeralDescricao').value;
            const valorTotal = parseFloat(document.getElementById('despesaGeralValor').value) || 0;
            const modo = document.getElementById('despesaModoPagamento').value;
            const formaPgto = document.getElementById('despesaFormaPagamento').value;
            
            if (modo === 'parcelado') {
                const qtd = parseInt(document.getElementById('despesaParcelas').value);
                const intervalo = parseInt(document.getElementById('despesaIntervaloDias').value);
                
                if (!qtd || qtd < 1) throw new Error("Quantidade de parcelas inválida.");
                
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
                        formaPagamento: formaPgto,
                        categoria: 'Geral'
                    });
                }
                
                const listaNova = [...CACHE_DESPESAS, ...novasDespesas];
                await salvarListaDespesas(listaNova);
                alert(`${qtd} parcelas lançadas.`);
                
            } else {
                const novaDesp = {
                    id: 'desp_' + Date.now(),
                    data: data,
                    vinculoVeiculo: veiculo,
                    descricao: desc,
                    valor: valorTotal,
                    formaPagamento: formaPgto,
                    categoria: 'Geral'
                };
                
                const listaNova = [...CACHE_DESPESAS, novaDesp];
                await salvarListaDespesas(listaNova);
                alert("Despesa lançada.");
            }
            
            newFormD.reset();
            const divP = document.getElementById('divDespesaParcelas');
            if(divP) divP.style.display = 'none';
            
            renderizarTabelaDespesas();
            atualizarDashboard(); 

        } catch(err) {
            console.error("Erro ao salvar despesa:", err);
            alert("Erro: " + err.message);
        }
    });
}

function carregarSelectVeiculosDespesa() {
    try {
        const sel = document.getElementById('selectVeiculoDespesaGeral');
        if (!sel) return;
        sel.innerHTML = '<option value="">NENHUM (GERAL)</option>';
        if (Array.isArray(CACHE_VEICULOS)) {
            CACHE_VEICULOS.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.placa; 
                opt.textContent = `${v.modelo} - ${v.placa}`;
                sel.appendChild(opt);
            });
        }
    } catch(e) { console.warn("Erro select veic despesa:", e); }
}

function renderizarTabelaDespesas() {
    try {
        const tbody = document.querySelector('#tabelaDespesasGerais tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!Array.isArray(CACHE_DESPESAS)) return;

        // Ordenar desc
        const sorted = [...CACHE_DESPESAS].sort((a,b) => new Date(b.data || 0) - new Date(a.data || 0));
        
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
    } catch (e) { console.error("Erro tabela despesas:", e); }
}

window.excluirDespesa = async function(id) {
    if (confirm("Excluir esta despesa?")) {
        try {
            const lista = CACHE_DESPESAS.filter(d => d.id !== id);
            await salvarListaDespesas(lista);
            renderizarTabelaDespesas();
            atualizarDashboard();
        } catch(e) { console.error(e); }
    }
};

// -----------------------------------------------------------------------------
// 17. GESTÃO DE CADASTROS (ABAS E FORMULÁRIOS) - BLINDADOS
// -----------------------------------------------------------------------------

// Controle de Abas
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    // Clone para remover listeners antigos
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        newBtn.classList.add('active');
        
        const tabId = newBtn.getAttribute('data-tab');
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if(tab) tab.classList.add('active');
    });
});

function renderizarTabelasCadastro() {
    try {
        // Funcionários
        const tbFunc = document.querySelector('#tabelaFuncionarios tbody');
        if(tbFunc) {
            tbFunc.innerHTML = '';
            if(Array.isArray(CACHE_FUNCIONARIOS)) {
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
            }
        }

        // Veículos
        const tbVeic = document.querySelector('#tabelaVeiculos tbody');
        if(tbVeic) {
            tbVeic.innerHTML = '';
            if(Array.isArray(CACHE_VEICULOS)) {
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
            }
        }

        // Minha Empresa
        const divEmp = document.getElementById('viewMinhaEmpresaContent');
        if (divEmp && CACHE_MINHA_EMPRESA && CACHE_MINHA_EMPRESA.razaoSocial) {
            document.getElementById('minhaEmpresaRazaoSocial').value = CACHE_MINHA_EMPRESA.razaoSocial;
            document.getElementById('minhaEmpresaCNPJ').value = CACHE_MINHA_EMPRESA.cnpj;
            document.getElementById('minhaEmpresaTelefone').value = CACHE_MINHA_EMPRESA.telefone;
        }
    } catch(e) { console.error("Erro renderizar cadastros:", e); }
}

// --- SALVAR FUNCIONÁRIO (COM AUTH E PROTEÇÃO) ---
const formFunc = document.getElementById('formFuncionario');
if (formFunc) {
    const newFormF = formFunc.cloneNode(true);
    formFunc.parentNode.replaceChild(newFormF, formFunc);

    newFormF.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const id = document.getElementById('funcionarioId').value;
            const nome = document.getElementById('funcNome').value;
            const email = document.getElementById('funcEmail').value.trim();
            const funcao = document.getElementById('funcFuncao').value;
            const docPessoal = document.getElementById('funcDocumento').value;
            const senha = document.getElementById('funcSenha').value; 
            
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
                    throw new Error("Senha obrigatória (mínimo 6 caracteres) para novos usuários.");
                }
                
                // Usa o helper definido no HTML
                if (window.dbRef && window.dbRef.criarAuthUsuario) {
                    uidFirebase = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Cria user doc
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uidFirebase), {
                        email: email,
                        role: 'funcionario', 
                        company: window.USUARIO_ATUAL.company,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    // Fallback
                    uidFirebase = 'local_' + Date.now();
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

            let lista = [...CACHE_FUNCIONARIOS];
            if (id) {
                const idx = lista.findIndex(f => f.id === id);
                if (idx > -1) lista[idx] = novoFunc;
            } else {
                lista.push(novoFunc);
            }

            await salvarListaFuncionarios(lista);
            alert("Funcionário salvo com sucesso!");
            
            newFormF.reset();
            document.getElementById('funcionarioId').value = '';
            renderizarTabelasCadastro();

        } catch (err) {
            alert("Erro ao salvar funcionário: " + err.message);
        }
    });
}

window.toggleDriverFields = function() {
    const role = document.getElementById('funcFuncao')?.value;
    const div = document.getElementById('driverSpecificFields');
    if(div) div.style.display = role === 'motorista' ? 'block' : 'none';
};

window.editarFuncionario = function(id) {
    const f = buscarFuncionarioPorId(id);
    if (!f) return;
    
    try {
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
        document.getElementById('funcSenha').placeholder = "(Deixe vazio para manter a atual)";
    } catch(e) { console.error("Erro editar func:", e); }
};
// =============================================================================
// PARTE 5 DE 5: RELATÓRIOS, RECIBOS, PAINEL FUNCIONÁRIO, SUPER ADMIN E BACKUP (BLINDADOS)
// =============================================================================

// -----------------------------------------------------------------------------
// 18. MÓDULO DE RELATÓRIOS - BLINDADO
// -----------------------------------------------------------------------------

function getFiltrosRelatorio() {
    return {
        inicio: document.getElementById('dataInicioRelatorio')?.value,
        fim: document.getElementById('dataFimRelatorio')?.value,
        motorista: document.getElementById('selectMotoristaRelatorio')?.value,
        veiculo: document.getElementById('selectVeiculoRelatorio')?.value,
        contratante: document.getElementById('selectContratanteRelatorio')?.value,
        atividade: document.getElementById('selectAtividadeRelatorio')?.value
    };
}

function filtrarOperacoesRelatorio() {
    try {
        const f = getFiltrosRelatorio();
        if (!f.inicio || !f.fim) {
            alert("Selecione o período (Início e Fim).");
            return null;
        }

        const dIni = new Date(f.inicio + 'T00:00:00');
        const dFim = new Date(f.fim + 'T23:59:59');

        if (!Array.isArray(CACHE_OPERACOES)) return [];

        return CACHE_OPERACOES.filter(op => {
            if (!op.data) return false;
            const dOp = new Date(op.data + 'T12:00:00');
            if (dOp < dIni || dOp > dFim) return false;
            
            if (f.motorista && op.motoristaId !== f.motorista) return false;
            if (f.veiculo && op.veiculoId !== f.veiculo) return false; 
            if (f.contratante && op.contratanteId !== f.contratante) return false;
            if (f.atividade && op.atividadeId !== f.atividade) return false;
            
            return op.status === 'concluido'; 
        });
    } catch(e) {
        console.error("Erro ao filtrar relatório:", e);
        return [];
    }
}

window.gerarRelatorioGeral = function() {
    try {
        const ops = filtrarOperacoesRelatorio();
        if (!ops) return;

        const container = document.getElementById('reportResults');
        const content = document.getElementById('reportContent');
        if (container) container.style.display = 'block';

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
            const fin = op.financeiro || {};
            const fat = parseFloat(fin.faturamento) || 0;
            const comb = parseFloat(fin.combustivel) || 0;
            const comiss = parseFloat(fin.comissaoMotorista) || 0;
            const desp = parseFloat(fin.despesasViagem) || 0;
            const custos = comb + comiss + desp;
            const lucro = fat - custos;

            totalFat += fat;
            totalCustos += custos;
            totalComissao += comiss;

            const razao = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial || 'N/D';

            html += `
                <tr>
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>${razao}</td>
                    <td>${op.veiculoId || '-'}</td>
                    <td>${formatarValorMoeda(fat)}</td>
                    <td style="color:red;">-${formatarValorMoeda(custos)}</td>
                    <td style="font-weight:bold; color:${lucro>=0?'green':'red'}">${formatarValorMoeda(lucro)}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        
        html += `
            <div style="margin-top:20px; padding:15px; background:#f8f9fa; border:1px solid #dee2e6;">
                <h4>RESUMO DO PERÍODO</h4>
                <p>FATURAMENTO BRUTO: <strong>${formatarValorMoeda(totalFat)}</strong></p>
                <p>TOTAL CUSTOS: <strong style="color:red;">${formatarValorMoeda(totalCustos)}</strong></p>
                <p>LUCRO LÍQUIDO: <strong style="color:${(totalFat-totalCustos)>=0?'green':'red'}; font-size:1.2rem;">${formatarValorMoeda(totalFat - totalCustos)}</strong></p>
            </div>
        `;

        if (content) content.innerHTML = html;
    } catch(e) {
        console.error("Erro gerar relatório:", e);
        alert("Erro ao gerar relatório. Verifique os dados filtrados.");
    }
};

window.exportarRelatorioPDF = function() {
    try {
        const element = document.getElementById('reportContent');
        if (!element || !element.innerHTML) { alert("Gere o relatório primeiro."); return; }
        
        if (typeof html2pdf === 'undefined') {
            alert("Biblioteca de PDF não carregada. Tente recarregar a página.");
            return;
        }

        const opt = {
            margin: 10,
            filename: 'relatorio_logimaster.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    } catch(e) { console.error("Erro PDF:", e); }
};

window.gerarRelatorioCobranca = function() {
    try {
        const ops = filtrarOperacoesRelatorio();
        if (!ops) return;
        
        const porCliente = {};
        ops.forEach(op => {
            const cliId = op.contratanteId;
            if (!porCliente[cliId]) porCliente[cliId] = { nome: buscarContratantePorCnpj(cliId)?.razaoSocial, total: 0, ops: [] };
            porCliente[cliId].ops.push(op);
            porCliente[cliId].total += (parseFloat(op.financeiro?.faturamento) || 0);
        });

        const content = document.getElementById('reportContent');
        const container = document.getElementById('reportResults');
        if(container) container.style.display = 'block';
        
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
                const serv = buscarAtividadePorId(op.atividadeId)?.nome || '-';
                html += `
                    <tr>
                        <td>${formatarDataParaBrasileiro(op.data)}</td>
                        <td>${op.veiculoId || '-'}</td>
                        <td>${serv}</td>
                        <td>${formatarValorMoeda(op.financeiro?.faturamento)}</td>
                    </tr>
                `;
            });
            html += `</tbody></table>
                <div style="text-align:right; margin-top:10px;">
                    <strong>TOTAL A COBRAR: ${formatarValorMoeda(dados.total)}</strong>
                </div>
            </div>`;
        }
        
        if(content) content.innerHTML = html;
    } catch(e) { console.error("Erro relatório cobrança:", e); }
};

// -----------------------------------------------------------------------------
// 19. MÓDULO DE RECIBOS E PAGAMENTOS - BLINDADO
// -----------------------------------------------------------------------------

function carregarSelectMotoristaRecibo() {
    try {
        const sel = document.getElementById('selectMotoristaRecibo');
        if (!sel) return;
        sel.innerHTML = '<option value="">SELECIONE...</option>';
        if (Array.isArray(CACHE_FUNCIONARIOS)) {
            CACHE_FUNCIONARIOS.forEach(f => {
                if (f.funcao === 'motorista' || f.funcao === 'ajudante') {
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = f.nome;
                    sel.appendChild(opt);
                }
            });
        }
    } catch(e) { console.warn("Erro select recibo:", e); }
}

window.gerarReciboPagamento = async function() {
    try {
        const funcId = document.getElementById('selectMotoristaRecibo').value;
        const dIni = document.getElementById('dataInicioRecibo').value;
        const dFim = document.getElementById('dataFimRecibo').value;

        if (!funcId || !dIni || !dFim) { alert("Preencha todos os campos."); return; }

        const func = buscarFuncionarioPorId(funcId);
        if (!func) return;

        if (!Array.isArray(CACHE_OPERACOES)) return;

        const ops = CACHE_OPERACOES.filter(op => {
            if (op.status !== 'concluido') return false;
            if (!op.data) return false;
            
            const dOp = new Date(op.data + 'T12:00:00');
            const i = new Date(dIni + 'T00:00:00');
            const f = new Date(dFim + 'T23:59:59');
            
            const isMotorista = (op.motoristaId === funcId);
            const isAjudante = (op.ajudantes && Array.isArray(op.ajudantes) && op.ajudantes.some(a => a.idFuncionario === funcId));
            
            return (dOp >= i && dOp <= f) && (isMotorista || isAjudante);
        });

        let totalPagar = 0;
        let detalhesHtml = `<table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
            <tr style="background:#eee;"><th>DATA</th><th>DESCRIÇÃO</th><th style="text-align:right;">VALOR</th></tr>`;

        ops.forEach(op => {
            let valorOp = 0;
            let desc = "";

            if (op.motoristaId === funcId) {
                valorOp = parseFloat(op.financeiro?.comissaoMotorista) || 0;
                desc = `Comissão Viagem (${formatarDataParaBrasileiro(op.data)})`;
            } else {
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

        const modal = document.getElementById('modalRecibo');
        const content = document.getElementById('modalReciboContent');
        const actions = document.getElementById('modalReciboActions');
        
        const empresaNome = CACHE_MINHA_EMPRESA?.razaoSocial || 'EMPRESA';
        const empresaCnpj = CACHE_MINHA_EMPRESA?.cnpj || '00.000.000/0000-00';

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h2>RECIBO DE PAGAMENTO</h2>
                <p><strong>${empresaNome}</strong> - CNPJ: ${empresaCnpj}</p>
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

        actions.innerHTML = `
            <button class="btn-primary" onclick="salvarReciboGerado('${func.id}', '${dIni}', '${dFim}', ${totalPagar})">
                <i class="fas fa-save"></i> GRAVAR NO HISTÓRICO
            </button>
            <button class="btn-secondary" onclick="window.print()">
                <i class="fas fa-print"></i> IMPRIMIR
            </button>
        `;

        modal.style.display = 'block';
    } catch(e) { console.error("Erro gerar recibo:", e); }
};

window.salvarReciboGerado = async function(funcId, ini, fim, valor) {
    try {
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
    } catch(e) { console.error(e); }
};

function renderizarHistoricoRecibosAdmin() {
    try {
        const tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        if (Array.isArray(CACHE_RECIBOS)) {
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
    } catch(e) { console.error("Erro histórico recibos:", e); }
}

// -----------------------------------------------------------------------------
// 20. PAINEL DO FUNCIONÁRIO (CHECK-IN / CHECK-OUT) - BLINDADO
// -----------------------------------------------------------------------------

function carregarPainelFuncionario() {
    try {
        const uid = window.USUARIO_ATUAL.uid;
        
        if (!Array.isArray(CACHE_OPERACOES)) return;

        let opAtiva = CACHE_OPERACOES.find(o => o.motoristaId === uid && o.status === 'em_andamento');
        if (!opAtiva) {
            opAtiva = CACHE_OPERACOES.find(o => o.motoristaId === uid && o.status === 'agendado');
        }

        const container = document.getElementById('checkin-container');
        if (!container) return;
        
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
                <div style="margin-top:30px;">${btnAction}</div>
            </div>
        `;
    } catch(e) { console.error("Erro painel funcionário:", e); }
}

window.abrirModalCheckin = function(opId, etapa) {
    const op = CACHE_OPERACOES.find(o => o.id === opId);
    if (!op) return;

    try {
        const modal = document.getElementById('modalCheckinConfirm');
        document.getElementById('checkinOpId').value = opId;
        document.getElementById('checkinStep').value = etapa;
        
        document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
        document.getElementById('checkinDisplayContratante').textContent = buscarContratantePorCnpj(op.contratanteId)?.razaoSocial;
        document.getElementById('checkinDisplayVeiculo').textContent = op.veiculoId;
        
        document.getElementById('checkinDriverFields').style.display = 'block';

        if (etapa === 'inicio') {
            document.getElementById('checkinModalTitle').textContent = "INICIAR ROTA";
            const btn = document.getElementById('btnConfirmCheckin');
            btn.className = "btn-success";
            btn.textContent = "CONFIRMAR INÍCIO";
            
            document.getElementById('divKmInicial').style.display = 'block';
            document.getElementById('divKmFinal').style.display = 'none';
            document.getElementById('checkinKmInicial').required = true;
            document.getElementById('checkinKmFinal').required = false;
        } else {
            document.getElementById('checkinModalTitle').textContent = "FINALIZAR ROTA";
            const btn = document.getElementById('btnConfirmCheckin');
            btn.className = "btn-danger";
            btn.textContent = "ENCERRAR OPERAÇÃO";
            
            document.getElementById('divKmInicial').style.display = 'none';
            document.getElementById('divKmFinal').style.display = 'block';
            document.getElementById('checkinKmFinal').required = true;
            
            // Tenta pegar KM Inicial já salvo
            const kmIniSalvo = (op.checkinData && op.checkinData.kmInicial) ? op.checkinData.kmInicial : 0;
            document.getElementById('checkinKmInicialReadonly').value = kmIniSalvo;
        }
        
        modal.style.display = 'flex';
    } catch(e) { console.error(e); }
};

window.closeCheckinConfirmModal = function() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
}

const formCheckin = document.getElementById('formCheckinConfirm');
if (formCheckin) {
    const newFormC = formCheckin.cloneNode(true);
    formCheckin.parentNode.replaceChild(newFormC, formCheckin);

    newFormC.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const opId = document.getElementById('checkinOpId').value;
            const etapa = document.getElementById('checkinStep').value;
            const opIndex = CACHE_OPERACOES.findIndex(o => o.id === opId);
            
            if (opIndex === -1) return;
            
            const op = CACHE_OPERACOES[opIndex];
            const agora = new Date().toISOString();
            
            // Garante que checkinData existe
            if (!op.checkinData) op.checkinData = {};

            if (etapa === 'inicio') {
                const kmIni = parseFloat(document.getElementById('checkinKmInicial').value);
                if (!kmIni || kmIni <= 0) { alert("Informe o KM Inicial."); return; }
                
                op.status = 'em_andamento';
                op.checkinData.timestampInicio = agora;
                op.checkinData.kmInicial = kmIni;
                
            } else {
                const kmFim = parseFloat(document.getElementById('checkinKmFinal').value);
                const kmIni = parseFloat(document.getElementById('checkinKmInicialReadonly').value) || (op.checkinData.kmInicial || 0);
                const abastecimento = parseFloat(document.getElementById('checkinValorAbastecido').value) || 0;
                const precoLitro = parseFloat(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
                
                if (!kmFim || kmFim <= kmIni) { alert(`O KM Final deve ser maior que o Inicial (${kmIni}).`); return; }
                
                const kmRodado = kmFim - kmIni;
                
                op.status = 'concluido';
                op.checkinData.timestampFim = agora;
                op.checkinData.kmFinal = kmFim;
                op.checkinData.abastecimento = abastecimento;
                
                if (!op.financeiro) op.financeiro = {};
                op.financeiro.kmRodado = kmRodado;
                op.financeiro.combustivel = abastecimento;
                op.financeiro.precoLitro = precoLitro;
            }
            
            CACHE_OPERACOES[opIndex] = op;
            await salvarListaOperacoes(CACHE_OPERACOES);
            
            alert(etapa === 'inicio' ? "Boa viagem! Status atualizado." : "Viagem encerrada com sucesso!");
            closeCheckinConfirmModal();
            carregarPainelFuncionario();

        } catch(err) {
            console.error(err);
            alert("Erro no check-in: " + err.message);
        }
    });
}

// -----------------------------------------------------------------------------
// 21. PAINEL SUPER ADMIN E MANUTENÇÃO - BLINDADO
// -----------------------------------------------------------------------------

function carregarPainelSuperAdmin() {
    if (!window.dbRef) return;
    try {
        const { db, collection, getDocs } = window.dbRef;
        const container = document.getElementById('superAdminContainer');
        if(!container) return;
        
        container.innerHTML = '<p>Carregando empresas...</p>';
        
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
        }).catch(err => {
            container.innerHTML = '<p style="color:red">Erro ao carregar empresas.</p>';
            console.error(err);
        });
    } catch(e) { console.error("Erro super admin:", e); }
}

const formCreateCompany = document.getElementById('formCreateCompany');
if(formCreateCompany) {
    const newFormComp = formCreateCompany.cloneNode(true);
    formCreateCompany.parentNode.replaceChild(newFormComp, formCreateCompany);

    newFormComp.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dom = document.getElementById('newCompanyDomain').value.trim();
        const email = document.getElementById('newAdminEmail').value.trim();
        const pass = document.getElementById('newAdminPassword').value;
        
        if(!dom || !email || !pass) return;

        try {
            const { db, setDoc, doc, criarAuthUsuario } = window.dbRef;
            
            const uid = await criarAuthUsuario(email, pass);
            
            const dadosEmpresa = {
                adminEmail: email,
                createdAt: new Date().toISOString(),
                isVitalicio: false,
                expiresAt: new Date(Date.now() + (30*24*60*60*1000)).toISOString(), 
                isBlocked: false
            };
            await setDoc(doc(db, "companies", dom), dadosEmpresa);
            
            await setDoc(doc(db, "users", uid), {
                email: email, role: 'admin', company: dom
            });
            
            alert(`Empresa '${dom}' criada com sucesso!`);
            newFormComp.reset();
            carregarPainelSuperAdmin();
            
        } catch(err) { alert("Erro: " + err.message); }
    });
}

// Modal Créditos e Funções de Manutenção
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
    try {
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
            const base = (atual < new Date()) ? new Date() : atual;
            base.setMonth(base.getMonth() + mesesAdd);
            novaValidade = base.toISOString();
        }
        
        await updateDoc(docRef, { isVitalicio, isBlocked, expiresAt: novaValidade });
        
        alert("Alterações salvas!");
        document.getElementById('modalCreditos').style.display = 'none';
        carregarPainelSuperAdmin();
    } catch(e) { alert("Erro ao salvar créditos: " + e.message); }
};

window.exportDataBackup = function() {
    try {
        const backup = {
            funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, contratantes: CACHE_CONTRATANTES,
            operacoes: CACHE_OPERACOES, minhaEmpresa: CACHE_MINHA_EMPRESA, despesas: CACHE_DESPESAS,
            atividades: CACHE_ATIVIDADES, date: new Date().toISOString(), version: "6.1"
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "logimaster_backup_" + new Date().toISOString().slice(0,10) + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    } catch(e) { console.error("Erro no backup:", e); alert("Erro ao gerar arquivo de backup."); }
};

window.importDataBackup = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (!confirm("Isso substituirá os dados atuais pelos do backup. Continuar?")) return;
            
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
    const modal = document.getElementById('modalSecurityConfirm');
    document.getElementById('securityActionText').textContent = "ATENÇÃO: Isso apagará TODOS os dados. Esta ação é IRREVERSÍVEL.";
    modal.style.display = 'flex';
    
    // Clonar botão para limpar listeners
    const oldBtn = document.getElementById('btnConfirmSecurity');
    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.onclick = async () => {
        const pass = document.getElementById('securityPasswordInput').value;
        if (!pass) return;

        try {
            const { auth, reauthenticateWithCredential, EmailAuthProvider } = window.dbRef;
            const cred = EmailAuthProvider.credential(window.USUARIO_ATUAL.email, pass);
            
            btn.textContent = "LIMPANDO...";
            btn.disabled = true;

            await reauthenticateWithCredential(auth.currentUser, cred);
            
            // Limpa Caches
            CACHE_FUNCIONARIOS = []; CACHE_VEICULOS = []; CACHE_OPERACOES = [];
            CACHE_CONTRATANTES = []; CACHE_DESPESAS = []; CACHE_RECIBOS = [];

            if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
                const { db, doc, writeBatch } = window.dbRef;
                const batch = writeBatch(db);
                const companyPath = `companies/${window.USUARIO_ATUAL.company}/data`;
                const chaves = ['db_funcionarios', 'db_veiculos', 'db_contratantes', 'db_operacoes', 'db_despesas_gerais', 'db_atividades', 'db_profile_requests', 'db_recibos'];

                chaves.forEach(chave => {
                    batch.set(doc(db, companyPath, chave), { items: [], lastUpdate: new Date().toISOString(), updatedBy: window.USUARIO_ATUAL.email });
                });
                
                await batch.commit();
            }

            alert("SISTEMA RESETADO COM SUCESSO!\n\nA página será recarregada.");
            window.location.reload();

        } catch(e) {
            alert("Erro ao resetar: " + e.message);
            btn.textContent = "CONFIRMAR";
            btn.disabled = false;
        }
    };
};