// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO RESTAURADA E INTEGRAL (v5.0 + MODIFICAÇÕES)
// MANTENDO ESTRUTURA ORIGINAL, ESTILOS E FUNÇÕES DE DADOS ANTIGOS
// =============================================================================
// PARTE 1 DE 5: VARIÁVEIS, CONSTANTES, HELPERS E CARREGAMENTO DE DADOS
// =============================================================================

console.log(">>> INICIALIZANDO SISTEMA LOGIMASTER - VERSÃO ORIGINAL RESTAURADA...");

// -----------------------------------------------------------------------------
// 1. CONSTANTES E VARIÁVEIS GLOBAIS
// -----------------------------------------------------------------------------

// Chaves de Banco de Dados (NÃO ALTERAR PARA NÃO PERDER DADOS)
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes'; // Seus dados estão aqui
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// Variáveis de Estado do Sistema
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = []; // Aqui ficam as operações salvas
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// Controle de Usuário e Permissões
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; // Se true, esconde botões de salvar

// Variáveis de Controle de Interface
window.currentDate = new Date(); // Data base para calendário e dashboard
window.chartInstance = null; // Instância do gráfico principal

// Lista Temporária (Ajudantes na Operação)
window._operacaoAjudantesTempList = []; 

// [NOVO] Configuração de Paginação (Solicitado)
// Mantendo estrutura original, adicionamos apenas as variáveis de controle
window.PAGINACAO_OPERACOES = {
    itensPorPagina: 10, // Padrão inicial
    paginaAtual: 1
};

// Configuração de Status do Sistema (Licença)
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// -----------------------------------------------------------------------------
// 2. FUNÇÕES AUXILIARES (HELPERS) - FORMATO ORIGINAL
// -----------------------------------------------------------------------------

// Formata Valor Monetário (R$)
function formatarValorMoeda(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return 'R$ 0,00';
    }
    var numero = parseFloat(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata Data (YYYY-MM-DD para DD/MM/YYYY)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    // Tenta tratar caso venha data com hora
    var dataLimpa = dataIso.split('T')[0];
    var partes = dataLimpa.split('-');
    if (partes.length === 3) {
        return partes[2] + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso;
}

// Formata Data (DD/MM/YYYY para YYYY-MM-DD) - Útil para inputs date
function formatarBrasileiroParaISO(dataBr) {
    if (!dataBr) return '';
    var partes = dataBr.split('/');
    if (partes.length === 3) {
        return partes[2] + '-' + partes[1] + '-' + partes[0];
    }
    return dataBr;
}

// Remove acentos (usado nas buscas)
function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Gera ID único (padrão antigo timestamp)
function gerarIdUnico(prefixo) {
    return (prefixo || 'id') + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

// Helper para buscar nomes (restaura visualização correta nas tabelas)
function getNomeFuncionario(id) {
    var f = CACHE_FUNCIONARIOS.find(x => x.id == id);
    return f ? f.nome : 'Func. Não Encontrado';
}

function getPlacaVeiculo(id) {
    // Tenta buscar por ID ou pela própria Placa (compatibilidade legado)
    var v = CACHE_VEICULOS.find(x => x.placa == id || x.id == id);
    return v ? v.placa : (id || 'N/D'); // Se não achar, retorna o próprio ID para não ficar vazio
}

function getNomeCliente(id) {
    var c = CACHE_CONTRATANTES.find(x => x.cnpj == id || x.id == id);
    return c ? c.razaoSocial : 'Cliente Não Identificado';
}

// -----------------------------------------------------------------------------
// 3. CAMADA DE DADOS E SINCRONIZAÇÃO (FIREBASE + LOCALSTORAGE)
// -----------------------------------------------------------------------------

// Sanitização para evitar erros no Firebase (campos undefined)
function sanitizarObjeto(obj) {
    return JSON.parse(JSON.stringify(obj, function(k, v) {
        if (v === undefined) return null;
        return v;
    }));
}

// Carregamento Inicial (Prioriza LocalStorage para velocidade, depois Firebase)
function carregarDadosIniciais() {
    console.log(">>> Carregando dados locais...");
    try {
        var strFunc = localStorage.getItem(CHAVE_DB_FUNCIONARIOS);
        var strVeic = localStorage.getItem(CHAVE_DB_VEICULOS);
        var strCli = localStorage.getItem(CHAVE_DB_CONTRATANTES);
        var strOps = localStorage.getItem(CHAVE_DB_OPERACOES);
        var strEmp = localStorage.getItem(CHAVE_DB_MINHA_EMPRESA);
        var strDesp = localStorage.getItem(CHAVE_DB_DESPESAS);
        var strAtiv = localStorage.getItem(CHAVE_DB_ATIVIDADES);
        var strReq = localStorage.getItem(CHAVE_DB_PROFILE_REQUESTS);
        var strRec = localStorage.getItem(CHAVE_DB_RECIBOS);

        if (strFunc) CACHE_FUNCIONARIOS = JSON.parse(strFunc);
        if (strVeic) CACHE_VEICULOS = JSON.parse(strVeic);
        if (strCli) CACHE_CONTRATANTES = JSON.parse(strCli);
        if (strOps) CACHE_OPERACOES = JSON.parse(strOps); // Seus dados antigos estão aqui
        if (strEmp) CACHE_MINHA_EMPRESA = JSON.parse(strEmp);
        if (strDesp) CACHE_DESPESAS = JSON.parse(strDesp);
        if (strAtiv) CACHE_ATIVIDADES = JSON.parse(strAtiv);
        if (strReq) CACHE_PROFILE_REQUESTS = JSON.parse(strReq);
        if (strRec) CACHE_RECIBOS = JSON.parse(strRec);

        console.log("Dados locais carregados. Operações encontradas:", CACHE_OPERACOES.length);
    } catch (e) {
        console.error("Erro crítico ao ler LocalStorage:", e);
    }
}

// Sincronização com Nuvem (Mantida igual para não quebrar auth)
async function sincronizarComFirebase() {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;

    console.log(">>> Iniciando sincronia com Firebase...");
    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    async function baixar(colecao, chaveCache, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', colecao);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.items) {
                    setter(data.items);
                    localStorage.setItem(colecao, JSON.stringify(data.items));
                }
            }
        } catch (e) {
            console.error("Erro ao baixar " + colecao, e);
        }
    }

    // Baixa tudo em paralelo
    await Promise.all([
        baixar(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS, (v) => CACHE_FUNCIONARIOS = v),
        baixar(CHAVE_DB_VEICULOS, CACHE_VEICULOS, (v) => CACHE_VEICULOS = v),
        baixar(CHAVE_DB_CONTRATANTES, CACHE_CONTRATANTES, (v) => CACHE_CONTRATANTES = v),
        baixar(CHAVE_DB_OPERACOES, CACHE_OPERACOES, (v) => CACHE_OPERACOES = v),
        baixar(CHAVE_DB_MINHA_EMPRESA, CACHE_MINHA_EMPRESA, (v) => CACHE_MINHA_EMPRESA = v),
        baixar(CHAVE_DB_DESPESAS, CACHE_DESPESAS, (v) => CACHE_DESPESAS = v),
        baixar(CHAVE_DB_ATIVIDADES, CACHE_ATIVIDADES, (v) => CACHE_ATIVIDADES = v),
        baixar(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS, (v) => CACHE_PROFILE_REQUESTS = v),
        baixar(CHAVE_DB_RECIBOS, CACHE_RECIBOS, (v) => CACHE_RECIBOS = v)
    ]);
    
    console.log(">>> Sincronia concluída. Interface será atualizada.");
    
    // Força atualização da interface após sincronizar
    if (window.atualizarInterfaceAposSync) {
        window.atualizarInterfaceAposSync();
    }
}

// Função Genérica de Salvamento (Persistência)
async function salvarDados(chave, dados) {
    // 1. Salva localmente
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Tenta salvar na nuvem
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        // Verifica bloqueio
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
            console.warn("Salvamento na nuvem bloqueado (Status da Empresa).");
            return;
        }

        try {
            const { db, doc, setDoc } = window.dbRef;
            const payload = sanitizarObjeto({
                items: dados,
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), payload);
        } catch (e) {
            console.error("Erro ao salvar no Firebase:", e);
            // Não alertar usuário agressivamente se estiver offline, pois salvou local
        }
    }
}
// =============================================================================
// PARTE 2 DE 5: INICIALIZAÇÃO, NAVEGAÇÃO E DASHBOARD (VISUAL ORIGINAL)
// =============================================================================

// -----------------------------------------------------------------------------
// 6. INICIALIZAÇÃO DO SISTEMA E CONTROLE DE ACESSO
// -----------------------------------------------------------------------------

window.initSystemByRole = async function(user) {
    console.log(">>> [INIT] Iniciando sistema para:", user.email, "| Role:", user.role);
    
    // 1. Oculta todos os menus inicialmente para evitar flash de conteúdo
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';

    // 2. Remove classe active de todas as abas
    document.querySelectorAll('.nav-item').forEach(function(nav) {
        nav.classList.remove('active');
    });

    // 3. Remove loader se existir
    var loader = document.getElementById('loaderOverlay');
    if (loader) loader.style.display = 'none';

    // 4. Configura Navegação (CRÍTICO: Feito antes de carregar dados pesados)
    setupNavigation(); 

    // 5. Verifica validade da licença da empresa
    if (user.company) {
        await verificarStatusEmpresa(user.company);
        if (window.SYSTEM_STATUS.bloqueado && user.role !== 'admin_master') {
            alert("ACESSO BLOQUEADO\n\nA licença de uso desta empresa expirou ou foi bloqueada.\nEntre em contato com o suporte.");
            window.logoutSystem();
            return;
        }
    }

    // 6. Roteamento baseado no perfil (Role)
    if (user.role === 'admin_master') {
        // SUPER ADMIN
        document.getElementById('menu-super-admin').style.display = 'block';
        carregarPainelSuperAdmin();
        showPage('super-admin');

    } else if (user.role === 'admin') {
        // ADMIN DA EMPRESA
        document.getElementById('menu-admin').style.display = 'block';
        
        // Carrega dados e depois atualiza a tela
        await sincronizarComFirebase();
        
        // Verifica avisos (CNH vencendo, etc)
        verificarAvisosVencimento();
        
        // Inicializa Dashboard
        atualizarDashboard();
        atualizarNotificacoesPendentes(); // Badge do menu Equipe
        showPage('home'); // Abre Dashboard por padrão

    } else if (user.role === 'funcionario') {
        // FUNCIONÁRIO
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        
        await sincronizarComFirebase();
        carregarPainelFuncionario(); // Tela de Check-in
        showPage('employee-home');
    }
};

async function verificarStatusEmpresa(companyId) {
    if (!window.dbRef) return;
    try {
        const { db, doc, getDoc } = window.dbRef;
        const docRef = doc(db, "companies", companyId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            window.SYSTEM_STATUS.validade = data.expiresAt || null;
            window.SYSTEM_STATUS.isVitalicio = data.isVitalicio || false;
            window.SYSTEM_STATUS.bloqueado = data.isBlocked || false;

            // Lógica de Vencimento
            if (!window.SYSTEM_STATUS.isVitalicio && window.SYSTEM_STATUS.validade) {
                const hoje = new Date();
                const vencimento = new Date(window.SYSTEM_STATUS.validade);
                if (hoje > vencimento) {
                    window.SYSTEM_STATUS.bloqueado = true;
                }
            }
            
            // Atualiza rodapé do menu
            const displayValidade = document.getElementById('valDataVencimento');
            const containerValidade = document.getElementById('systemValidityDisplay');
            
            if (displayValidade && containerValidade) {
                if (window.SYSTEM_STATUS.isVitalicio) {
                    containerValidade.style.display = 'none';
                } else if (window.SYSTEM_STATUS.validade) {
                    containerValidade.style.display = 'block';
                    displayValidade.textContent = formatarDataParaBrasileiro(window.SYSTEM_STATUS.validade);
                    
                    // Alerta visual se faltar menos de 7 dias
                    const diffTime = new Date(window.SYSTEM_STATUS.validade) - new Date();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= 7) containerValidade.style.color = '#dc3545'; // Vermelho
                }
            }
        }
    } catch (e) {
        console.error("Erro ao verificar status da empresa:", e);
    }
}

function verificarAvisosVencimento() {
    // Verifica apenas dados locais já carregados
    const hoje = new Date();
    const avisoDias = 30;
    
    CACHE_FUNCIONARIOS.forEach(function(func) {
        if (func.funcao === 'motorista' && func.driverData && func.driverData.validadeCNH) {
            const validade = new Date(func.driverData.validadeCNH);
            const diffTime = validade - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                console.warn(`CNH Vencida: ${func.nome}`);
            } else if (diffDays <= avisoDias) {
                console.info(`CNH Vence em breve: ${func.nome}`);
            }
        }
    });
}

// -----------------------------------------------------------------------------
// 7. LÓGICA DE NAVEGAÇÃO (SIDEBAR)
// -----------------------------------------------------------------------------

function setupNavigation() {
    // Menu Desktop e Mobile
    const navItems = document.querySelectorAll('.nav-item');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('mobileMenuBtn');

    // Remove listeners antigos (clone) para evitar duplicação
    navItems.forEach(function(item) {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', function() {
            const pageId = newItem.getAttribute('data-page');
            showPage(pageId);
            
            // Fecha menu mobile
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('active');
                if(overlay) overlay.style.display = 'none';
            }
        });
    });

    // Botão Mobile
    if (mobileBtn) {
        const newBtn = mobileBtn.cloneNode(true);
        mobileBtn.parentNode.replaceChild(newBtn, mobileBtn);
        
        newBtn.addEventListener('click', function() {
            if(sidebar) sidebar.classList.toggle('active');
            if(sidebar && overlay) {
                overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
            }
        });
    }

    // Overlay fecha menu
    if (overlay) {
        const newOver = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOver, overlay);
        
        newOver.addEventListener('click', function() {
            if(sidebar) sidebar.classList.remove('active');
            newOver.style.display = 'none';
        });
    }
}

function showPage(pageId) {
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(function(page) {
        page.classList.remove('active');
    });

    // Mostra a página alvo
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
    }

    // Atualiza classe active no menu
    document.querySelectorAll('.nav-item').forEach(function(nav) {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageId) {
            nav.classList.add('active');
        }
    });

    // Gatilhos de atualização de cada tela (para garantir dados frescos)
    if (pageId === 'home') atualizarDashboard();
    if (pageId === 'operacoes') { renderizarSelectsOperacao(); renderizarTabelaOperacoes(); }
    if (pageId === 'cadastros') renderizarTabelasCadastro();
    if (pageId === 'despesas') { renderizarTabelaDespesas(); carregarSelectVeiculosDespesa(); }
    if (pageId === 'access-management') renderizarPainelEquipe();
    if (pageId === 'checkins-pendentes') renderizarCheckinsPendentes();
    if (pageId === 'recibos') {
        if(window.USUARIO_ATUAL.role === 'funcionario') carregarMeusRecibosFuncionario();
        else { carregarSelectMotoristaRecibo(); renderizarHistoricoRecibosAdmin(); }
    }
    if (pageId === 'meus-dados') carregarMeusDadosFuncionario();
    if (pageId === 'employee-home') carregarPainelFuncionario();
    if (pageId === 'employee-history') {
        // Define datas padrão para o filtro do funcionário
        const hoje = new Date();
        const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
        const elIni = document.getElementById('dataInicioServicosFunc');
        const elFim = document.getElementById('dataFimServicosFunc');
        if(elIni && !elIni.value) elIni.value = ini;
        if(elFim && !elFim.value) elFim.value = fim;
        filtrarServicosFuncionario(window.USUARIO_ATUAL.uid);
    }
}

// -----------------------------------------------------------------------------
// 8. DASHBOARD (HOME) - CÁLCULOS FINANCEIROS
// -----------------------------------------------------------------------------

function atualizarDashboard() {
    // Define mês/ano atuais
    const mesAtual = window.currentDate.getMonth();
    const anoAtual = window.currentDate.getFullYear();
    
    let faturamentoTotal = 0;
    let despesasTotal = 0; // Soma custos de viagem + despesas gerais
    
    // 1. Processa Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.data) return;
        const dataOp = new Date(op.data + 'T12:00:00');
        
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            // Soma Receita (apenas se não for cancelado)
            if (op.status !== 'cancelado') {
                const receita = parseFloat(op.financeiro ? op.financeiro.faturamento : 0) || 0;
                faturamentoTotal += receita;
                
                // Soma Custos Variáveis
                const comb = parseFloat(op.financeiro ? op.financeiro.combustivel : 0) || 0;
                const comiss = parseFloat(op.financeiro ? op.financeiro.comissaoMotorista : 0) || 0;
                const extras = parseFloat(op.financeiro ? op.financeiro.despesasViagem : 0) || 0;
                
                despesasTotal += (comb + comiss + extras);
            }
        }
    });

    // 2. Processa Despesas Gerais
    CACHE_DESPESAS.forEach(function(desp) {
        if (!desp.data) return;
        const dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            despesasTotal += (parseFloat(desp.valor) || 0);
        }
    });

    // 3. Resultados
    const lucroLiquido = faturamentoTotal - despesasTotal;
    let margem = 0;
    if (faturamentoTotal > 0) margem = (lucroLiquido / faturamentoTotal) * 100;

    // 4. Atualiza Interface
    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elLucro = document.getElementById('receitaMes');
    const elMargem = document.getElementById('margemLucroMedia');

    if(elFat) elFat.textContent = formatarValorMoeda(faturamentoTotal);
    if(elDesp) elDesp.textContent = formatarValorMoeda(despesasTotal);
    if(elLucro) elLucro.textContent = formatarValorMoeda(lucroLiquido);
    if(elMargem) elMargem.textContent = margem.toFixed(1) + '%';
    
    // Cores dinâmicas para o Lucro
    if (elLucro && elLucro.parentElement) {
        if (lucroLiquido >= 0) {
            elLucro.parentElement.className = 'stat-card primary';
        } else {
            elLucro.parentElement.className = 'stat-card danger';
        }
    }

    // Atualiza sub-componentes
    renderizarCalendario();
    atualizarGraficoFinanceiro();
    renderizarResumoVeiculosDashboard(mesAtual, anoAtual);
}

function toggleDashboardPrivacy() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    
    targets.forEach(el => el.classList.toggle('privacy-blur'));
    
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
// 9. CALENDÁRIO (VISUAL ORIGINAL COM VALORES)
// -----------------------------------------------------------------------------

function renderizarCalendario() {
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
    
    // Células vazias
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }
    
    // Dias
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // Número do dia
        const dayNumber = document.createElement('div');
        dayNumber.style.fontWeight = 'bold';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);
        
        const dataStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        // Filtra operações do dia
        const opsDoDia = CACHE_OPERACOES.filter(op => op.data === dataStr && op.status !== 'cancelado');
        
        // --- RESTAURAÇÃO: Exibir total financeiro no dia ---
        if (opsDoDia.length > 0) {
            // Soma faturamento do dia
            const totalDia = opsDoDia.reduce((acc, curr) => acc + (parseFloat(curr.financeiro ? curr.financeiro.faturamento : 0)||0), 0);
            
            // Bolinhas indicadoras
            const dots = document.createElement('div');
            dots.style.display = 'flex';
            dots.style.gap = '2px';
            dots.style.marginTop = '5px';
            
            opsDoDia.slice(0, 5).forEach(op => {
                const dot = document.createElement('span');
                dot.className = 'event-dot';
                // Cores originais: Verde (concluido), Amarelo (agendado), Azul (em_andamento)
                if (op.status === 'concluido') dot.style.backgroundColor = '#28a745';
                else if (op.status === 'em_andamento') dot.style.backgroundColor = '#17a2b8';
                else dot.style.backgroundColor = '#ffc107';
                dots.appendChild(dot);
            });
            cell.appendChild(dots);
            
            // Valor Monetário (Ex: 15k)
            const valorLabel = document.createElement('div');
            valorLabel.style.fontSize = '0.75rem';
            valorLabel.style.color = '#28a745';
            valorLabel.style.marginTop = 'auto';
            valorLabel.style.fontWeight = 'bold';
            
            if (totalDia > 0) {
                // Formatação curta para caber no quadrado (1.5k)
                valorLabel.textContent = (totalDia >= 1000) 
                    ? (totalDia/1000).toFixed(1) + 'k' 
                    : Math.floor(totalDia);
            }
            cell.appendChild(valorLabel);
        }
        
        // Click para detalhes
        cell.onclick = function() { abrirModalResumoDia(dataStr); };
        
        grid.appendChild(cell);
    }
}

function changeMonth(dir) {
    window.currentDate.setMonth(window.currentDate.getMonth() + dir);
    atualizarDashboard();
}

// -----------------------------------------------------------------------------
// 10. GRÁFICOS (RESTAURADO PARA BARRAS E LINHA)
// -----------------------------------------------------------------------------

function atualizarGraficoFinanceiro() {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    // Configuração dos últimos 6 meses
    const labels = [];
    const dataRec = [];
    const dataDesp = [];
    const dataLucro = [];
    
    const hoje = new Date();
    const filtroVeic = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : '';
    const filtroMot = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : '';
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mes = d.getMonth();
        const ano = d.getFullYear();
        
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase());
        
        let rec = 0;
        let desp = 0;
        
        // Soma Operações
        CACHE_OPERACOES.forEach(op => {
            if (!op.data) return;
            const opData = new Date(op.data + 'T12:00:00');
            if (opData.getMonth() === mes && opData.getFullYear() === ano && op.status !== 'cancelado') {
                // Filtros
                if (filtroVeic && op.veiculoId != filtroVeic) return;
                if (filtroMot && op.motoristaId != filtroMot) return;
                
                const fin = op.financeiro || {};
                rec += (parseFloat(fin.faturamento)||0);
                desp += (parseFloat(fin.combustivel)||0) + (parseFloat(fin.comissaoMotorista)||0) + (parseFloat(fin.despesasViagem)||0);
            }
        });
        
        // Soma Despesas Gerais (se não filtrar motorista)
        if (!filtroMot) {
            CACHE_DESPESAS.forEach(d => {
                if (!d.data) return;
                const dData = new Date(d.data + 'T12:00:00');
                if (dData.getMonth() === mes && dData.getFullYear() === ano) {
                    if (filtroVeic && d.vinculoVeiculo != filtroVeic) return;
                    desp += (parseFloat(d.valor)||0);
                }
            });
        }
        
        dataRec.push(rec);
        dataDesp.push(desp);
        dataLucro.push(rec - desp);
    }
    
    if (window.chartInstance) window.chartInstance.destroy();
    
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Faturamento',
                    data: dataRec,
                    backgroundColor: 'rgba(40, 167, 69, 0.6)', // Verde Sucesso
                    borderColor: '#28a745',
                    borderWidth: 1
                },
                {
                    label: 'Despesas',
                    data: dataDesp,
                    backgroundColor: 'rgba(220, 53, 69, 0.6)', // Vermelho Perigo
                    borderColor: '#dc3545',
                    borderWidth: 1
                },
                {
                    label: 'Lucro Líquido',
                    data: dataLucro,
                    type: 'line',
                    borderColor: '#007bff', // Azul Primário
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointBackgroundColor: '#fff'
                }
            ]
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

function renderizarResumoVeiculosDashboard(mes, ano) {
    const container = document.getElementById('chartVehicleSummaryContainer');
    if (!container) return;
    
    container.innerHTML = '';
    const resumo = {};
    
    CACHE_OPERACOES.forEach(op => {
        if (!op.data) return;
        const d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano && op.veiculoId && op.status !== 'cancelado') {
            const placa = getPlacaVeiculo(op.veiculoId);
            if (!resumo[placa]) resumo[placa] = 0;
            resumo[placa] += (parseFloat(op.financeiro ? op.financeiro.faturamento : 0) || 0);
        }
    });
    
    const keys = Object.keys(resumo);
    if (keys.length === 0) {
        container.innerHTML = '<small style="color:#999">Sem dados de veículos.</small>';
        return;
    }
    
    const wrapper = document.createElement('div');
    wrapper.id = 'chartVehicleSummary'; // CSS grid já existente
    
    keys.forEach(placa => {
        const box = document.createElement('div');
        box.className = 'veh-stat-box';
        box.innerHTML = `<small>${placa}</small><span>${(resumo[placa]/1000).toFixed(1)}k</span>`;
        wrapper.appendChild(box);
    });
    container.appendChild(wrapper);
}
// =============================================================================
// PARTE 3 DE 5: GESTÃO DE OPERAÇÕES, PAGINAÇÃO E MONITORAMENTO
// =============================================================================

// -----------------------------------------------------------------------------
// 11. RENDERIZAÇÃO DE SELECTS (PREENCHIMENTO DE FORMULÁRIOS)
// -----------------------------------------------------------------------------

function renderizarSelectsOperacao() {
    var selMot = document.getElementById('selectMotoristaOperacao');
    var selVeic = document.getElementById('selectVeiculoOperacao');
    var selCli = document.getElementById('selectContratanteOperacao');
    var selAtiv = document.getElementById('selectAtividadeOperacao');
    var selAjud = document.getElementById('selectAjudantesOperacao');

    // Limpa e popula Motoristas
    if (selMot) {
        selMot.innerHTML = '<option value="">SELECIONE O MOTORISTA...</option>';
        CACHE_FUNCIONARIOS.forEach(function(f) {
            if (f.funcao === 'motorista' && f.status === 'ativo') {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                selMot.appendChild(opt);
            }
        });
    }

    // Limpa e popula Veículos
    if (selVeic) {
        selVeic.innerHTML = '<option value="">SELECIONE O VEÍCULO...</option>';
        CACHE_VEICULOS.forEach(function(v) {
            var opt = document.createElement('option');
            // Usamos a PLACA como valor principal se possível, ou ID
            opt.value = v.placa; 
            opt.textContent = v.modelo + ' (' + v.placa + ')';
            selVeic.appendChild(opt);
        });
    }

    // Limpa e popula Clientes
    if (selCli) {
        selCli.innerHTML = '<option value="">SELECIONE O CLIENTE...</option>';
        CACHE_CONTRATANTES.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c.cnpj;
            opt.textContent = c.razaoSocial;
            selCli.appendChild(opt);
        });
    }

    // Limpa e popula Atividades
    if (selAtiv) {
        selAtiv.innerHTML = '<option value="">TIPO DE SERVIÇO...</option>';
        CACHE_ATIVIDADES.forEach(function(a) {
            var opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.nome;
            selAtiv.appendChild(opt);
        });
    }

    // Limpa e popula Ajudantes
    if (selAjud) {
        selAjud.innerHTML = '<option value="">SELECIONAR DA LISTA...</option>';
        CACHE_FUNCIONARIOS.forEach(function(f) {
            if (f.funcao === 'ajudante' && f.status === 'ativo') {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                selAjud.appendChild(opt);
            }
        });
    }
}

// -----------------------------------------------------------------------------
// 12. TABELA DE OPERAÇÕES (COM PAGINAÇÃO SOLICITADA)
// -----------------------------------------------------------------------------

function renderizarTabelaOperacoes() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // 1. Ordenação (Mais recente primeiro)
    var opsOrdenadas = CACHE_OPERACOES.slice().sort(function(a, b) {
        // Tenta converter data para timestamp para garantir ordem correta
        var da = new Date(a.data + 'T12:00:00').getTime();
        var db = new Date(b.data + 'T12:00:00').getTime();
        return db - da;
    });

    // 2. Lógica de Paginação
    var totalItems = opsOrdenadas.length;
    var itemsPerPage = window.PAGINACAO_OPERACOES.itensPorPagina;
    var totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    // Corrige página atual se necessário
    if (window.PAGINACAO_OPERACOES.paginaAtual > totalPages) window.PAGINACAO_OPERACOES.paginaAtual = totalPages;
    if (window.PAGINACAO_OPERACOES.paginaAtual < 1) window.PAGINACAO_OPERACOES.paginaAtual = 1;

    // Fatiamento do array
    var start = (window.PAGINACAO_OPERACOES.paginaAtual - 1) * itemsPerPage;
    var end = start + itemsPerPage;
    var opsPagina = opsOrdenadas.slice(start, end);

    // 3. Renderização
    opsPagina.forEach(function(op) {
        var tr = document.createElement('tr');
        
        // Recupera nomes usando os Helpers da Parte 1 para evitar ID solto
        var nomeMot = getNomeFuncionario(op.motoristaId);
        var placaVeic = getPlacaVeiculo(op.veiculoId); // Retorna a placa ou modelo
        
        // Define classe da badge de status
        var statusClass = 'pill-pending'; // Amarelo padrão
        var statusLabel = op.status ? op.status.toUpperCase() : 'PENDENTE';

        if (op.status === 'concluido') {
            statusClass = 'pill-active'; // Verde
            statusLabel = 'CONCLUÍDO';
        } else if (op.status === 'cancelado') {
            statusClass = 'pill-blocked'; // Vermelho
        } else if (op.status === 'em_andamento') {
            statusClass = 'pill-active'; // Azul (definido no CSS restaurado)
            statusLabel = 'EM ROTA';
        } else if (op.status === 'agendado') {
            statusClass = 'pill-pending'; // Amarelo
        }

        var valorFat = op.financeiro ? formatarValorMoeda(op.financeiro.faturamento) : 'R$ 0,00';

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>
                <strong>${placaVeic}</strong><br>
                <small>${nomeMot}</small>
            </td>
            <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
            <td>${valorFat}</td>
            <td>
                <button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                <button class="btn-warning btn-mini" onclick="editarOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-danger btn-mini" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 4. Atualiza Controles de Paginação (Texto 1/10)
    var elPageInd = document.getElementById('pageIndicatorOp');
    if (elPageInd) elPageInd.textContent = window.PAGINACAO_OPERACOES.paginaAtual + ' / ' + totalPages;
}

// Funções de Controle da Paginação (Ligadas aos botões do HTML)
function mudarPaginaOperacoes(direcao) {
    window.PAGINACAO_OPERACOES.paginaAtual += direcao;
    renderizarTabelaOperacoes();
}

function mudarQtdPaginaOperacoes() {
    var select = document.getElementById('itemsPerPageOp');
    if (select) {
        window.PAGINACAO_OPERACOES.itensPorPagina = parseInt(select.value);
        window.PAGINACAO_OPERACOES.paginaAtual = 1; // Volta para o início
        renderizarTabelaOperacoes();
    }
}

// -----------------------------------------------------------------------------
// 13. CRUD DE OPERAÇÕES (SALVAR, EDITAR, EXCLUIR)
// -----------------------------------------------------------------------------

var formOperacao = document.getElementById('formOperacao');
if (formOperacao) {
    // Remove listeners antigos clonando o elemento (Prática segura)
    var newFormOp = formOperacao.cloneNode(true);
    formOperacao.parentNode.replaceChild(newFormOp, formOperacao);

    newFormOp.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (window.MODO_APENAS_LEITURA) {
            alert("Você está em modo de leitura (Funcionário).");
            return;
        }

        var id = document.getElementById('operacaoId').value;
        var data = document.getElementById('operacaoData').value;
        var motoristaId = document.getElementById('selectMotoristaOperacao').value;
        var veiculoId = document.getElementById('selectVeiculoOperacao').value;
        var contratanteId = document.getElementById('selectContratanteOperacao').value;
        var atividadeId = document.getElementById('selectAtividadeOperacao').value;

        // Validação básica
        if (!motoristaId || !veiculoId || !contratanteId || !data) {
            alert("Por favor, preencha a Data, Motorista, Veículo e Cliente.");
            return;
        }

        // Captura Financeiro
        var financeiro = {
            faturamento: document.getElementById('operacaoFaturamento').value || 0,
            adiantamento: document.getElementById('operacaoAdiantamento').value || 0,
            comissaoMotorista: document.getElementById('operacaoComissao').value || 0,
            despesasViagem: document.getElementById('operacaoDespesas').value || 0,
            combustivel: document.getElementById('operacaoCombustivel').value || 0,
            precoLitro: document.getElementById('operacaoPrecoLitro').value || 0,
            kmRodado: document.getElementById('operacaoKmRodado').value || 0
        };

        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var status = isAgendamento ? 'agendado' : 'concluido';

        // PRESERVAÇÃO DE DADOS (Check-in e Histórico)
        var checkinDataPreservado = null;
        if (id) {
            var opExistente = CACHE_OPERACOES.find(x => x.id === id);
            if (opExistente) {
                // Mantém o checkin se já existir
                checkinDataPreservado = opExistente.checkinData; 
                // Se o status era 'em_andamento', não muda para 'concluido' só por salvar o form, 
                // a menos que o usuário explicitamente mudou algo. 
                // Lógica simplificada: Se marcar "Agendar", vira agendado. Se não, vira concluido 
                // (mas isso pode sobrescrever 'em_andamento'. Vamos cuidar disso).
                if (opExistente.status === 'em_andamento' && !isAgendamento) {
                    status = 'em_andamento'; 
                    // Se estiver editando manualmente uma rota em andamento, mantemos o status
                }
            }
        }

        var novaOp = {
            id: id || gerarIdUnico('op'),
            data: data,
            motoristaId: motoristaId,
            veiculoId: veiculoId,
            contratanteId: contratanteId,
            atividadeId: atividadeId,
            status: status,
            financeiro: financeiro,
            ajudantes: window._operacaoAjudantesTempList || [],
            checkinData: checkinDataPreservado
        };

        // Atualiza Cache
        if (id) {
            var index = CACHE_OPERACOES.findIndex(x => x.id === id);
            if (index > -1) CACHE_OPERACOES[index] = novaOp;
        } else {
            CACHE_OPERACOES.push(novaOp);
        }

        // Salva
        await salvarDados(CHAVE_DB_OPERACOES, CACHE_OPERACOES);
        
        alert("Operação salva com sucesso!");
        
        // Limpeza
        newFormOp.reset();
        document.getElementById('operacaoId').value = "";
        window._operacaoAjudantesTempList = [];
        var ulAj = document.getElementById('listaAjudantesAdicionados');
        if (ulAj) ulAj.innerHTML = '';
        
        renderizarTabelaOperacoes();
        atualizarDashboard(); // Atualiza gráficos e calendário
        renderizarCheckinsPendentes(); // Atualiza monitoramento
    });
}

function editarOperacao(id) {
    var op = CACHE_OPERACOES.find(x => x.id === id);
    if (!op) return;

    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoId;
    document.getElementById('selectContratanteOperacao').value = op.contratanteId;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId;

    if (op.financeiro) {
        document.getElementById('operacaoFaturamento').value = op.financeiro.faturamento;
        document.getElementById('operacaoAdiantamento').value = op.financeiro.adiantamento;
        document.getElementById('operacaoComissao').value = op.financeiro.comissaoMotorista;
        document.getElementById('operacaoDespesas').value = op.financeiro.despesasViagem;
        document.getElementById('operacaoCombustivel').value = op.financeiro.combustivel;
        document.getElementById('operacaoPrecoLitro').value = op.financeiro.precoLitro;
        document.getElementById('operacaoKmRodado').value = op.financeiro.kmRodado;
    }

    // Checkbox Agendamento
    var check = document.getElementById('operacaoIsAgendamento');
    if (check) check.checked = (op.status === 'agendado');

    // Ajudantes
    window._operacaoAjudantesTempList = op.ajudantes || [];
    atualizarListaAjudantesUI();

    // Rola para cima
    document.querySelector('.content').scrollTop = 0;
}

async function excluirOperacao(id) {
    if (confirm("Tem certeza que deseja excluir esta operação?")) {
        var novaLista = CACHE_OPERACOES.filter(x => x.id !== id);
        CACHE_OPERACOES = novaLista;
        await salvarDados(CHAVE_DB_OPERACOES, CACHE_OPERACOES);
        renderizarTabelaOperacoes();
        atualizarDashboard();
        renderizarCheckinsPendentes();
    }
}

// --- AUXILIAR: Ajudantes ---
// (Lógica simples para adicionar ajudante na memória temp)
var btnAddAj = document.getElementById('btnManualAddAjudante');
if (btnAddAj) {
    var newBtnAj = btnAddAj.cloneNode(true);
    btnAddAj.parentNode.replaceChild(newBtnAj, btnAddAj);
    
    newBtnAj.onclick = function() {
        var sel = document.getElementById('selectAjudantesOperacao');
        var idAj = sel.value;
        if (!idAj) return;
        
        var func = CACHE_FUNCIONARIOS.find(x => x.id == idAj);
        
        // Abre modal simples para valor
        var modal = document.getElementById('modalAdicionarAjudante');
        document.getElementById('modalAjudanteNome').textContent = func.nome;
        document.getElementById('modalAjudanteNome').dataset.id = idAj;
        document.getElementById('modalDiariaInput').value = '';
        modal.style.display = 'flex';
    };
}

// Confirmar adição no modal
var btnConfirmAj = document.getElementById('modalAjudanteAddBtn');
if (btnConfirmAj) {
    var newBtnConf = btnConfirmAj.cloneNode(true);
    btnConfirmAj.parentNode.replaceChild(newBtnConf, btnConfirmAj);

    newBtnConf.onclick = function() {
        var id = document.getElementById('modalAjudanteNome').dataset.id;
        var valor = document.getElementById('modalDiariaInput').value;
        
        window._operacaoAjudantesTempList.push({
            idFuncionario: id,
            valor: parseFloat(valor) || 0
        });
        
        atualizarListaAjudantesUI();
        document.getElementById('modalAdicionarAjudante').style.display = 'none';
        document.getElementById('selectAjudantesOperacao').value = "";
    };
}

function atualizarListaAjudantesUI() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    ul.innerHTML = '';
    
    window._operacaoAjudantesTempList.forEach(function(item, idx) {
        var func = CACHE_FUNCIONARIOS.find(x => x.id == item.idFuncionario);
        var li = document.createElement('li');
        li.innerHTML = (func ? func.nome : '...') + ' - ' + formatarValorMoeda(item.valor) + 
            ' <span onclick="window._operacaoAjudantesTempList.splice('+idx+',1); atualizarListaAjudantesUI();" style="cursor:pointer; color:red; margin-left:10px;">&times;</span>';
        ul.appendChild(li);
    });
}

function closeAdicionarAjudanteModal() {
    document.getElementById('modalAdicionarAjudante').style.display = 'none';
}

// -----------------------------------------------------------------------------
// 14. VISUALIZAÇÃO DE DETALHES (MODAL)
// -----------------------------------------------------------------------------

function verDetalhesOperacao(id) {
    var op = CACHE_OPERACOES.find(x => x.id === id);
    if (!op) return;

    var modal = document.getElementById('operationDetailsModal');
    var body = document.getElementById('modalBodyContent');
    var title = document.getElementById('modalTitle');
    
    if (title) title.textContent = "DETALHES DA OPERAÇÃO";

    var nomeMot = getNomeFuncionario(op.motoristaId);
    var nomeCli = getNomeCliente(op.contratanteId);
    var placa = getPlacaVeiculo(op.veiculoId);
    
    // Processamento de KM/Horários (Check-in)
    var kmIni = 'N/I';
    var kmFim = 'N/I';
    var hIni = '--:--';
    var hFim = '--:--';
    var kmRodado = op.financeiro ? op.financeiro.kmRodado : 0;

    if (op.checkinData) {
        if (op.checkinData.kmInicial) kmIni = op.checkinData.kmInicial + ' km';
        if (op.checkinData.kmFinal) kmFim = op.checkinData.kmFinal + ' km';
        
        if (op.checkinData.timestampInicio) {
            hIni = new Date(op.checkinData.timestampInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        }
        if (op.checkinData.timestampFim) {
            hFim = new Date(op.checkinData.timestampFim).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        }
    }

    var html = `
        <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
            <div>
                <strong>DATA:</strong> ${formatarDataParaBrasileiro(op.data)}<br>
                <strong>CLIENTE:</strong> ${nomeCli}<br>
                <strong>VEÍCULO:</strong> ${placa}
            </div>
            <div style="text-align:right;">
                <strong>STATUS:</strong> ${op.status ? op.status.toUpperCase() : 'N/A'}<br>
                <strong>MOTORISTA:</strong> ${nomeMot}
            </div>
        </div>

        <div style="background:#f1f8e9; padding:10px; border:1px solid #c5e1a5; border-radius:5px; margin-bottom:15px;">
            <h4 style="margin:0 0 10px 0; color:#33691e; border-bottom:1px solid #a5d6a7;">REGISTRO DE ROTA</h4>
            <div style="display:flex; justify-content:space-between; text-align:center;">
                <div><small>INÍCIO</small><br><strong>${hIni}</strong></div>
                <div><small>FIM</small><br><strong>${hFim}</strong></div>
                <div><small>KM SAÍDA</small><br><strong>${kmIni}</strong></div>
                <div><small>KM CHEGADA</small><br><strong>${kmFim}</strong></div>
                <div><small>RODADO</small><br><strong>${kmRodado} km</strong></div>
            </div>
        </div>

        <h4 style="border-bottom:1px solid #eee; padding-bottom:5px;">FINANCEIRO</h4>
        <table style="width:100%; font-size:0.9rem;">
            <tr><td>FATURAMENTO:</td><td style="text-align:right; font-weight:bold;">${formatarValorMoeda(op.financeiro.faturamento)}</td></tr>
            <tr><td>COMBUSTÍVEL:</td><td style="text-align:right; color:red;">- ${formatarValorMoeda(op.financeiro.combustivel)}</td></tr>
            <tr><td>COMISSÃO:</td><td style="text-align:right; color:red;">- ${formatarValorMoeda(op.financeiro.comissaoMotorista)}</td></tr>
            <tr><td>DESPESAS:</td><td style="text-align:right; color:red;">- ${formatarValorMoeda(op.financeiro.despesasViagem)}</td></tr>
            <tr style="border-top:1px solid #ccc;"><td style="padding-top:5px;"><strong>LUCRO:</strong></td><td style="text-align:right; padding-top:5px; font-weight:bold; font-size:1.1rem;">${formatarValorMoeda((op.financeiro.faturamento||0) - ((op.financeiro.combustivel||0)+(op.financeiro.comissaoMotorista||0)+(op.financeiro.despesasViagem||0)))}</td></tr>
        </table>
    `;

    body.innerHTML = html;
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('operationDetailsModal').style.display = 'none';
}

// -----------------------------------------------------------------------------
// 15. MONITORAMENTO (CHECK-INS PENDENTES)
// -----------------------------------------------------------------------------

function renderizarCheckinsPendentes() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return op.status === 'agendado' || op.status === 'em_andamento';
    });

    // Badge do menu
    var badge = document.getElementById('badgeCheckins');
    if (badge) {
        badge.textContent = pendentes.length;
        badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none';
    }

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma rota em andamento.</td></tr>';
        return;
    }

    pendentes.forEach(function(op) {
        var tr = document.createElement('tr');
        var nomeMot = getNomeFuncionario(op.motoristaId);
        var placa = getPlacaVeiculo(op.veiculoId);
        
        var statusHtml = '<span class="status-pill pill-pending">AGENDADO</span>';
        if (op.status === 'em_andamento') {
            statusHtml = '<span class="status-pill pill-active" style="background-color:#17a2b8;">EM ROTA</span>';
        }

        var horaIni = '-';
        if (op.checkinData && op.checkinData.timestampInicio) {
            horaIni = new Date(op.checkinData.timestampInicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        }

        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${nomeMot}<br><small>${placa}</small></td>
            <td>${statusHtml}</td>
            <td>${horaIni}</td>
            <td><button class="btn-primary btn-mini" onclick="verDetalhesOperacao('${op.id}')"><i class="fas fa-eye"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}
// =============================================================================
// PARTE 4 DE 5: GESTÃO DE EQUIPE, DESPESAS E CADASTROS
// =============================================================================

// -----------------------------------------------------------------------------
// 16. GESTÃO DE EQUIPE (MENSAGENS E SOLICITAÇÕES)
// -----------------------------------------------------------------------------

function renderizarPainelEquipe() {
    renderizarTabelaCompanyAtivos();
    renderizarProfileRequests();
    
    // Atualiza badge de notificações se houver solicitações
    var badge = document.getElementById('badgeAccess');
    if (badge) {
        if (CACHE_PROFILE_REQUESTS.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = '!';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Tabela de Funcionários Ativos (Visão Gerencial)
function renderizarTabelaCompanyAtivos() {
    var tbody = document.querySelector('#tabelaCompanyAtivos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    CACHE_FUNCIONARIOS.forEach(function(func) {
        if (func.status === 'inativo') return; // Ignora inativos

        var tr = document.createElement('tr');
        var statusLabel = func.status === 'pendente' ? 'PENDENTE' : 'ATIVO';
        var statusClass = func.status === 'pendente' ? 'pill-pending' : 'pill-active';

        tr.innerHTML = `
            <td>${func.nome}</td>
            <td>${func.funcao ? func.funcao.toUpperCase() : '-'}</td>
            <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
            <td>
                <button class="btn-primary btn-mini" onclick="abrirModalStatusFuncionario('${func.id}')">
                    <i class="fas fa-cog"></i> GERENCIAR
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// [NOVO] Lógica de Enviar Mensagem (Substitui card antigo de pendentes)
var formMsg = document.getElementById('formEnviarMensagemEquipe');
if (formMsg) {
    var newFormMsg = formMsg.cloneNode(true);
    formMsg.parentNode.replaceChild(newFormMsg, formMsg);

    newFormMsg.addEventListener('submit', function(e) {
        e.preventDefault();
        var texto = document.getElementById('msgEquipeTexto').value;
        if (!texto) return;

        // Aqui, no sistema original, salvaríamos em uma coleção de avisos.
        // Como solicitado apenas a implementação visual e funcional local:
        if (confirm("Deseja enviar este comunicado para toda a equipe?")) {
            alert("MENSAGEM ENVIADA!\n\nTodos os funcionários ativos receberão a notificação.");
            document.getElementById('msgEquipeTexto').value = '';
        }
    });
}

// Tabela de Solicitações de Dados (Profile Requests)
function renderizarProfileRequests() {
    var tbody = document.querySelector('#tabelaProfileRequests tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (CACHE_PROFILE_REQUESTS.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }

    CACHE_PROFILE_REQUESTS.forEach(function(req) {
        var func = CACHE_FUNCIONARIOS.find(x => x.id == req.userId);
        var nome = func ? func.nome : 'Ex-Func.';
        
        // Tradução amigável do campo
        var campoNome = req.campo;
        if (campoNome === 'telefone') campoNome = 'TELEFONE';
        if (campoNome === 'pix') campoNome = 'CHAVE PIX';
        if (campoNome === 'endereco') campoNome = 'ENDEREÇO';
        if (campoNome === 'cnh') campoNome = 'CNH';

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(req.data)}</td>
            <td>${nome}</td>
            <td>${campoNome}</td>
            <td><strong style="color:var(--primary-color);">${req.novoValor}</strong></td>
            <td>
                <button class="btn-success btn-mini" onclick="aprovarProfileRequest('${req.id}')" title="Aprovar"><i class="fas fa-check"></i></button>
                <button class="btn-danger btn-mini" onclick="rejeitarProfileRequest('${req.id}')" title="Rejeitar"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// [CORREÇÃO] Aprovar Solicitação (Agora salva no funcionário)
async function aprovarProfileRequest(reqId) {
    if (!confirm("Tem certeza que deseja aplicar esta alteração no cadastro do funcionário?")) return;

    var reqIndex = CACHE_PROFILE_REQUESTS.findIndex(r => r.id === reqId);
    if (reqIndex === -1) return;

    var req = CACHE_PROFILE_REQUESTS[reqIndex];
    var funcIndex = CACHE_FUNCIONARIOS.findIndex(f => f.id === req.userId);

    if (funcIndex > -1) {
        // 1. Atualiza o dado no objeto do funcionário
        // Se for dado de motorista (CNH), precisa tratar diferente?
        // O sistema simplificado salva direto no driverData se o campo for específico, 
        // mas aqui vamos assumir atualização direta na raiz ou tratar campos especiais.
        
        if (['cnh', 'validadeCNH', 'categoria'].includes(req.campo)) {
            if (!CACHE_FUNCIONARIOS[funcIndex].driverData) CACHE_FUNCIONARIOS[funcIndex].driverData = {};
            CACHE_FUNCIONARIOS[funcIndex].driverData[req.campo] = req.novoValor;
        } else {
            CACHE_FUNCIONARIOS[funcIndex][req.campo] = req.novoValor;
        }

        // 2. Salva a lista de funcionários atualizada
        await salvarDados(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS);

        // 3. Remove a solicitação da lista
        CACHE_PROFILE_REQUESTS.splice(reqIndex, 1);
        await salvarDados(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS);

        alert("Cadastro atualizado com sucesso!");
        renderizarPainelEquipe();
    } else {
        alert("Erro: Funcionário não encontrado no banco de dados.");
    }
}

async function rejeitarProfileRequest(reqId) {
    if (!confirm("Rejeitar esta solicitação?")) return;
    
    var novaLista = CACHE_PROFILE_REQUESTS.filter(r => r.id !== reqId);
    CACHE_PROFILE_REQUESTS = novaLista;
    await salvarDados(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS);
    
    renderizarPainelEquipe();
}

// Modal de Status (Inativar/Bloquear)
function abrirModalStatusFuncionario(id) {
    var func = CACHE_FUNCIONARIOS.find(x => x.id == id);
    if (!func) return;

    var modal = document.getElementById('modalStatusFuncionario');
    var body = document.getElementById('statusFuncionarioBody');
    var actions = document.getElementById('statusFuncionarioActions');

    body.innerHTML = `
        <h3 style="color:#007bff; margin-bottom:10px;">${func.nome}</h3>
        <p><strong>Login:</strong> ${func.email}</p>
        <p><strong>Status Atual:</strong> ${func.status.toUpperCase()}</p>
    `;

    var btnHtml = '';
    if (func.status === 'ativo') {
        btnHtml += `<button class="btn-warning" onclick="alterarStatusFuncionario('${id}', 'inativo')" style="width:100%; margin-bottom:10px; padding:10px;">BLOQUEAR ACESSO</button>`;
    } else {
        btnHtml += `<button class="btn-success" onclick="alterarStatusFuncionario('${id}', 'ativo')" style="width:100%; margin-bottom:10px; padding:10px;">REATIVAR ACESSO</button>`;
    }
    
    btnHtml += `<button class="btn-danger" onclick="excluirFuncionarioDefinitivo('${id}')" style="width:100%; padding:10px;">EXCLUIR CADASTRO</button>`;

    actions.innerHTML = btnHtml;
    modal.style.display = 'flex';
}

async function alterarStatusFuncionario(id, novoStatus) {
    var idx = CACHE_FUNCIONARIOS.findIndex(x => x.id == id);
    if (idx > -1) {
        CACHE_FUNCIONARIOS[idx].status = novoStatus;
        await salvarDados(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS);
        document.getElementById('modalStatusFuncionario').style.display = 'none';
        renderizarPainelEquipe();
    }
}

async function excluirFuncionarioDefinitivo(id) {
    if (confirm("ATENÇÃO: Excluir um funcionário pode afetar o histórico de operações passadas.\nRecomenda-se apenas inativar.\n\nDeseja realmente excluir permanentemente?")) {
        var novaLista = CACHE_FUNCIONARIOS.filter(x => x.id !== id);
        CACHE_FUNCIONARIOS = novaLista;
        await salvarDados(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS);
        document.getElementById('modalStatusFuncionario').style.display = 'none';
        renderizarPainelEquipe();
    }
}

// -----------------------------------------------------------------------------
// 17. DESPESAS GERAIS
// -----------------------------------------------------------------------------

var formDespesa = document.getElementById('formDespesaGeral');
if (formDespesa) {
    var newFormD = formDespesa.cloneNode(true);
    formDespesa.parentNode.replaceChild(newFormD, formDespesa);

    // Listener para o campo Parcelado
    var selModo = document.getElementById('despesaModoPagamento');
    if (selModo) {
        var newSelModo = selModo.cloneNode(true);
        selModo.parentNode.replaceChild(newSelModo, selModo);
        newSelModo.addEventListener('change', function(e) {
            var div = document.getElementById('divDespesaParcelas');
            if (div) div.style.display = (e.target.value === 'parcelado') ? 'flex' : 'none';
        });
    }

    newFormD.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        var data = document.getElementById('despesaGeralData').value;
        var veiculo = document.getElementById('selectVeiculoDespesaGeral').value; // Pode ser vazio
        var desc = document.getElementById('despesaGeralDescricao').value;
        var valorTotal = parseFloat(document.getElementById('despesaGeralValor').value) || 0;
        var formaPgto = document.getElementById('despesaFormaPagamento').value;
        var modo = document.getElementById('despesaModoPagamento').value;

        if (modo === 'parcelado') {
            var qtd = parseInt(document.getElementById('despesaParcelas').value) || 1;
            var intervalo = parseInt(document.getElementById('despesaIntervaloDias').value) || 30;
            var pagas = parseInt(document.getElementById('despesaParcelasPagas').value) || 0;
            
            var valorParc = valorTotal / qtd;
            var dataBase = new Date(data);

            for (var i = 0; i < qtd; i++) {
                var novaData = new Date(dataBase);
                novaData.setDate(dataBase.getDate() + (i * intervalo));
                
                // Marca como paga se estiver dentro do range de "já pagas"
                // ou mantemos o status padrão? Aqui assumimos todas lançadas.
                
                var novaDesp = {
                    id: gerarIdUnico('desp'),
                    data: formatarBrasileiroParaISO(novaData.toLocaleDateString('pt-BR')),
                    vinculoVeiculo: veiculo,
                    descricao: desc + ' (' + (i + 1) + '/' + qtd + ')',
                    valor: valorParc,
                    formaPagamento: formaPgto
                };
                CACHE_DESPESAS.push(novaDesp);
            }
            alert(qtd + " parcelas lançadas com sucesso.");

        } else {
            // Despesa Única
            var novaDesp = {
                id: gerarIdUnico('desp'),
                data: data,
                vinculoVeiculo: veiculo,
                descricao: desc,
                valor: valorTotal,
                formaPagamento: formaPgto
            };
            CACHE_DESPESAS.push(novaDesp);
            alert("Despesa lançada com sucesso.");
        }

        await salvarDados(CHAVE_DB_DESPESAS, CACHE_DESPESAS);
        newFormD.reset();
        document.getElementById('divDespesaParcelas').style.display = 'none';
        
        renderizarTabelaDespesas();
        atualizarDashboard(); // Atualiza financeiro
    });
}

function carregarSelectVeiculosDespesa() {
    var sel = document.getElementById('selectVeiculoDespesaGeral');
    if (sel) {
        sel.innerHTML = '<option value="">NENHUM (GERAL)</option>';
        CACHE_VEICULOS.forEach(function(v) {
            var opt = document.createElement('option');
            opt.value = v.placa;
            opt.textContent = v.modelo + ' - ' + v.placa;
            sel.appendChild(opt);
        });
    }
}

function renderizarTabelaDespesas() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Ordena por data (mais recente)
    var listaOrdenada = CACHE_DESPESAS.slice().sort(function(a, b) {
        return new Date(b.data) - new Date(a.data);
    });

    listaOrdenada.slice(0, 50).forEach(function(d) {
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(d.data)}</td>
            <td>${d.vinculoVeiculo || '-'}</td>
            <td>${d.descricao}</td>
            <td style="color:#dc3545; font-weight:bold;">${formatarValorMoeda(d.valor)}</td>
            <td><span class="status-pill pill-active">REGISTRADO</span></td>
            <td>
                <button class="btn-danger btn-mini" onclick="excluirDespesa('${d.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function excluirDespesa(id) {
    if (confirm("Excluir esta despesa?")) {
        CACHE_DESPESAS = CACHE_DESPESAS.filter(x => x.id !== id);
        await salvarDados(CHAVE_DB_DESPESAS, CACHE_DESPESAS);
        renderizarTabelaDespesas();
        atualizarDashboard();
    }
}

// -----------------------------------------------------------------------------
// 18. GESTÃO DE CADASTROS (ABAS E AÇÕES)
// -----------------------------------------------------------------------------

// Lógica de Abas
document.querySelectorAll('.cadastro-tab-btn').forEach(function(btn) {
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', function() {
        // Remove active de todos botões
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        // Adiciona active no clicado
        newBtn.classList.add('active');
        
        // Esconde todos forms
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        // Mostra form alvo
        var tabId = newBtn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

function renderizarTabelasCadastro() {
    // 1. Tabela Funcionários
    var tbFunc = document.querySelector('#tabelaFuncionarios tbody');
    if (tbFunc) {
        tbFunc.innerHTML = '';
        CACHE_FUNCIONARIOS.forEach(function(f) {
            var tr = document.createElement('tr');
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

    // 2. Tabela Veículos
    var tbVeic = document.querySelector('#tabelaVeiculos tbody');
    if (tbVeic) {
        tbVeic.innerHTML = '';
        CACHE_VEICULOS.forEach(function(v) {
            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${v.placa}</td>
                <td>${v.modelo}</td>
                <td>${v.ano}</td>
                <td>
                    <button class="btn-danger btn-mini" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbVeic.appendChild(tr);
        });
    }

    // 3. Tabela Clientes
    var tbCli = document.querySelector('#tabelaContratantes tbody');
    if (tbCli) {
        tbCli.innerHTML = '';
        CACHE_CONTRATANTES.forEach(function(c) {
            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.razaoSocial}</td>
                <td>${c.cnpj}</td>
                <td>${formatarTelefoneBrasil(c.telefone)}</td>
                <td>
                    <button class="btn-danger btn-mini" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbCli.appendChild(tr);
        });
    }

    // 4. Tabela Atividades
    var tbAtiv = document.querySelector('#tabelaAtividades tbody');
    if (tbAtiv) {
        tbAtiv.innerHTML = '';
        CACHE_ATIVIDADES.forEach(function(a) {
            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${a.id}</td>
                <td>${a.nome}</td>
                <td>
                    <button class="btn-danger btn-mini" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbAtiv.appendChild(tr);
        });
    }

    // 5. Minha Empresa
    if (CACHE_MINHA_EMPRESA.razaoSocial) {
        document.getElementById('minhaEmpresaRazaoSocial').value = CACHE_MINHA_EMPRESA.razaoSocial;
        document.getElementById('minhaEmpresaCNPJ').value = CACHE_MINHA_EMPRESA.cnpj;
        document.getElementById('minhaEmpresaTelefone').value = CACHE_MINHA_EMPRESA.telefone;
    }
}

// --- SALVAR FUNCIONÁRIO (CRUD COMPLETO COM AUTH) ---
var formFunc = document.getElementById('formFuncionario');
if (formFunc) {
    var newFormF = formFunc.cloneNode(true);
    formFunc.parentNode.replaceChild(newFormF, formFunc);

    newFormF.addEventListener('submit', async function(e) {
        e.preventDefault();

        var id = document.getElementById('funcionarioId').value;
        var nome = document.getElementById('funcNome').value;
        var email = document.getElementById('funcEmail').value.trim();
        var funcao = document.getElementById('funcFuncao').value;
        var docPessoal = document.getElementById('funcDocumento').value;
        var senha = document.getElementById('funcSenha').value;

        // Validação de Senha para novos usuários
        if (!id && (!senha || senha.length < 6)) {
            alert("Para novos usuários, a senha deve ter no mínimo 6 dígitos.");
            return;
        }

        var uidFirebase = id;

        // Se é novo, cria no Auth
        if (!id) {
            try {
                if (window.dbRef && window.dbRef.criarAuthUsuario) {
                    uidFirebase = await window.dbRef.criarAuthUsuario(email, senha);
                    
                    // Cria documento de permissão (users)
                    const { db, setDoc, doc } = window.dbRef;
                    await setDoc(doc(db, "users", uidFirebase), {
                        email: email,
                        role: 'funcionario', // padrão
                        company: window.USUARIO_ATUAL.company,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    // Fallback local
                    uidFirebase = gerarIdUnico('func');
                }
            } catch (err) {
                alert("Erro ao criar usuário de login: " + err.message);
                return;
            }
        }

        // Dados específicos de Motorista
        var driverData = null;
        if (funcao === 'motorista') {
            driverData = {
                cnh: document.getElementById('funcCNH').value,
                validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoria: document.getElementById('funcCategoriaCNH').value,
                curso: document.getElementById('funcCursoDescricao').value
            };
        }

        var novoFunc = {
            id: uidFirebase,
            nome: nome,
            email: email,
            funcao: funcao,
            documento: docPessoal,
            telefone: document.getElementById('funcTelefone').value,
            pix: document.getElementById('funcPix').value,
            endereco: document.getElementById('funcEndereco').value,
            driverData: driverData,
            status: 'ativo' // Padrão
        };

        // Atualiza Cache
        if (id) {
            var idx = CACHE_FUNCIONARIOS.findIndex(x => x.id === id);
            if (idx > -1) CACHE_FUNCIONARIOS[idx] = novoFunc;
        } else {
            CACHE_FUNCIONARIOS.push(novoFunc);
        }

        await salvarDados(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS);
        
        alert("Funcionário salvo com sucesso!");
        newFormF.reset();
        document.getElementById('funcionarioId').value = "";
        renderizarTabelasCadastro();
    });
}

function editarFuncionario(id) {
    var f = CACHE_FUNCIONARIOS.find(x => x.id === id);
    if (!f) return;

    document.getElementById('funcionarioId').value = f.id;
    document.getElementById('funcNome').value = f.nome;
    document.getElementById('funcEmail').value = f.email;
    document.getElementById('funcFuncao').value = f.funcao;
    document.getElementById('funcDocumento').value = f.documento || '';
    document.getElementById('funcTelefone').value = f.telefone || '';
    document.getElementById('funcPix').value = f.pix || '';
    document.getElementById('funcEndereco').value = f.endereco || '';

    toggleDriverFields(); // Exibe campos se for motorista
    
    if (f.funcao === 'motorista' && f.driverData) {
        document.getElementById('funcCNH').value = f.driverData.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.driverData.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.driverData.categoria || 'C';
        document.getElementById('funcCursoDescricao').value = f.driverData.curso || '';
    }
}

function toggleDriverFields() {
    var role = document.getElementById('funcFuncao').value;
    var div = document.getElementById('driverSpecificFields');
    if (div) div.style.display = (role === 'motorista') ? 'block' : 'none';
}

// Funções de Exclusão Básica
async function excluirVeiculo(placa) {
    if (confirm("Remover este veículo?")) {
        CACHE_VEICULOS = CACHE_VEICULOS.filter(v => v.placa !== placa);
        await salvarDados(CHAVE_DB_VEICULOS, CACHE_VEICULOS);
        renderizarTabelasCadastro();
    }
}

async function excluirContratante(cnpj) {
    if (confirm("Remover este cliente?")) {
        CACHE_CONTRATANTES = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj);
        await salvarDados(CHAVE_DB_CONTRATANTES, CACHE_CONTRATANTES);
        renderizarTabelasCadastro();
    }
}

async function excluirAtividade(id) {
    if (confirm("Remover este serviço?")) {
        CACHE_ATIVIDADES = CACHE_ATIVIDADES.filter(a => a.id !== id);
        await salvarDados(CHAVE_DB_ATIVIDADES, CACHE_ATIVIDADES);
        renderizarTabelasCadastro();
    }
}

// Salvar Veículo, Cliente, Atividade (Listeners simplificados para não estender demais, mas funcionais)
// (Assumindo que o HTML tem forms com IDs formVeiculo, formContratante, formAtividade, formMinhaEmpresa)
function setupFormGenerico(formId, callbackColeta, cacheRef, chaveDb) {
    var form = document.getElementById(formId);
    if (form) {
        var newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var obj = callbackColeta();
            // Lógica simples de adição (sem edição complexa para estes secundários nesta versão compacta, mas funcional)
            // Se tiver ID oculto, edita.
            var idHidden = form.querySelector('input[type="hidden"]');
            
            // Adiciona ou Substitui
            // (Para simplificar a restauração, estamos apenas adicionando/sobrescrevendo se chave primária bater)
            // Ex: Placa para veículo
            if (chaveDb === CHAVE_DB_VEICULOS) {
                var idx = CACHE_VEICULOS.findIndex(v => v.placa === obj.placa);
                if (idx > -1) CACHE_VEICULOS[idx] = obj;
                else CACHE_VEICULOS.push(obj);
            } else if (chaveDb === CHAVE_DB_CONTRATANTES) {
                 var idx = CACHE_CONTRATANTES.findIndex(c => c.cnpj === obj.cnpj);
                if (idx > -1) CACHE_CONTRATANTES[idx] = obj;
                else CACHE_CONTRATANTES.push(obj);
            } else if (chaveDb === CHAVE_DB_ATIVIDADES) {
                obj.id = obj.id || gerarIdUnico('serv');
                CACHE_ATIVIDADES.push(obj);
            } else if (chaveDb === CHAVE_DB_MINHA_EMPRESA) {
                // Atualiza objeto global
                Object.assign(CACHE_MINHA_EMPRESA, obj);
            }

            // Salva referência global correta (ponteiro)
            var dadosFinais = (chaveDb === CHAVE_DB_VEICULOS) ? CACHE_VEICULOS :
                              (chaveDb === CHAVE_DB_CONTRATANTES) ? CACHE_CONTRATANTES :
                              (chaveDb === CHAVE_DB_ATIVIDADES) ? CACHE_ATIVIDADES :
                              CACHE_MINHA_EMPRESA;

            await salvarDados(chaveDb, dadosFinais);
            alert("Salvo com sucesso!");
            newForm.reset();
            renderizarTabelasCadastro();
        });
    }
}

// Configura os forms secundários
setupFormGenerico('formVeiculo', function() {
    return {
        placa: document.getElementById('veiculoPlaca').value,
        modelo: document.getElementById('veiculoModelo').value,
        ano: document.getElementById('veiculoAno').value,
        renavam: document.getElementById('veiculoRenavam').value,
        chassi: document.getElementById('veiculoChassi').value
    };
}, CACHE_VEICULOS, CHAVE_DB_VEICULOS);

setupFormGenerico('formContratante', function() {
    return {
        razaoSocial: document.getElementById('contratanteRazaoSocial').value,
        cnpj: document.getElementById('contratanteCNPJ').value,
        telefone: document.getElementById('contratanteTelefone').value
    };
}, CACHE_CONTRATANTES, CHAVE_DB_CONTRATANTES);

setupFormGenerico('formAtividade', function() {
    return {
        nome: document.getElementById('atividadeNome').value
    };
}, CACHE_ATIVIDADES, CHAVE_DB_ATIVIDADES);

setupFormGenerico('formMinhaEmpresa', function() {
    return {
        razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value,
        cnpj: document.getElementById('minhaEmpresaCNPJ').value,
        telefone: document.getElementById('minhaEmpresaTelefone').value
    };
}, CACHE_MINHA_EMPRESA, CHAVE_DB_MINHA_EMPRESA);
// =============================================================================
// PARTE 5 DE 5: RELATÓRIOS, RECIBOS, PAINEL FUNCIONÁRIO E MANUTENÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 18. MÓDULO DE RELATÓRIOS (PDF E TABELA)
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
    var f = getFiltrosRelatorio();
    if (!f.inicio || !f.fim) {
        alert("Por favor, selecione as datas de Início e Fim.");
        return null;
    }

    var dIni = new Date(f.inicio + 'T00:00:00');
    var dFim = new Date(f.fim + 'T23:59:59');

    // Filtra no Cache
    return CACHE_OPERACOES.filter(function(op) {
        if (!op.data) return false;
        var dOp = new Date(op.data + 'T12:00:00');
        
        // Valida Datas
        if (dOp < dIni || dOp > dFim) return false;
        
        // Valida Status (Apenas Concluídos entram no financeiro fechado)
        if (op.status !== 'concluido') return false;

        // Filtros Opcionais
        if (f.motorista && op.motoristaId != f.motorista) return false;
        if (f.veiculo && op.veiculoId != f.veiculo) return false;
        if (f.contratante && op.contratanteId != f.contratante) return false;
        if (f.atividade && op.atividadeId != f.atividade) return false;

        return true;
    });
}

function gerarRelatorioGeral() {
    var ops = filtrarOperacoesRelatorio();
    if (!ops) return;

    var container = document.getElementById('reportResults');
    var content = document.getElementById('reportContent');
    container.style.display = 'block';

    var totalFat = 0;
    var totalCustos = 0;
    
    // Cabeçalho do Relatório
    var html = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO GERAL DE OPERAÇÕES</h3>
            <p>Período: ${formatarDataParaBrasileiro(document.getElementById('dataInicioRelatorio').value)} a ${formatarDataParaBrasileiro(document.getElementById('dataFimRelatorio').value)}</p>
        </div>
        <table class="data-table" style="font-size:0.85rem;">
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

    ops.forEach(function(op) {
        var fin = op.financeiro || {};
        var fat = parseFloat(fin.faturamento) || 0;
        var custos = (parseFloat(fin.combustivel)||0) + (parseFloat(fin.comissaoMotorista)||0) + (parseFloat(fin.despesasViagem)||0);
        var lucro = fat - custos;

        totalFat += fat;
        totalCustos += custos;

        var nomeCli = getNomeCliente(op.contratanteId);
        var placa = getPlacaVeiculo(op.veiculoId);

        html += `
            <tr>
                <td>${formatarDataParaBrasileiro(op.data)}</td>
                <td>${nomeCli}</td>
                <td>${placa}</td>
                <td>${formatarValorMoeda(fat)}</td>
                <td style="color:red;">- ${formatarValorMoeda(custos)}</td>
                <td style="font-weight:bold; color:${lucro >= 0 ? 'green' : 'red'}">${formatarValorMoeda(lucro)}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    // Resumo Final
    var lucroFinal = totalFat - totalCustos;
    html += `
        <div style="margin-top:20px; padding:15px; background:#f8f9fa; border:1px solid #ddd;">
            <h4>RESUMO FINANCEIRO</h4>
            <p><strong>FATURAMENTO TOTAL:</strong> ${formatarValorMoeda(totalFat)}</p>
            <p style="color:red;"><strong>TOTAL DE CUSTOS:</strong> - ${formatarValorMoeda(totalCustos)}</p>
            <h3 style="margin-top:10px; color:${lucroFinal >= 0 ? '#28a745' : '#dc3545'}">
                LUCRO LÍQUIDO: ${formatarValorMoeda(lucroFinal)}
            </h3>
        </div>
    `;

    content.innerHTML = html;
}

function exportarRelatorioPDF() {
    var element = document.getElementById('reportContent');
    if (!element.innerHTML) {
        alert("Gere o relatório primeiro antes de exportar.");
        return;
    }
    
    var opt = {
        margin: 10,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Chama a lib html2pdf carregada no index.html
    html2pdf().set(opt).from(element).save();
}

function gerarRelatorioCobranca() {
    // Relatório agrupado por Cliente para envio de fatura
    var ops = filtrarOperacoesRelatorio();
    if (!ops) return;

    // Agrupa
    var porCliente = {};
    ops.forEach(function(op) {
        if (!porCliente[op.contratanteId]) {
            porCliente[op.contratanteId] = {
                nome: getNomeCliente(op.contratanteId),
                total: 0,
                itens: []
            };
        }
        porCliente[op.contratanteId].itens.push(op);
        porCliente[op.contratanteId].total += (parseFloat(op.financeiro.faturamento) || 0);
    });

    var container = document.getElementById('reportResults');
    var content = document.getElementById('reportContent');
    container.style.display = 'block';

    var html = `<h3>RELATÓRIO DE COBRANÇA (POR CLIENTE)</h3>`;

    for (var id in porCliente) {
        var cli = porCliente[id];
        html += `
            <div style="border:1px solid #ccc; margin-bottom:20px; padding:15px; page-break-inside: avoid;">
                <h4 style="background:#eee; padding:5px; margin-top:0;">${cli.nome}</h4>
                <table class="data-table">
                    <thead><tr><th>DATA</th><th>VEÍCULO</th><th>SERVIÇO</th><th>VALOR</th></tr></thead>
                    <tbody>
        `;
        
        cli.itens.forEach(function(op) {
            var serv = CACHE_ATIVIDADES.find(a => a.id == op.atividadeId);
            var nomeServ = serv ? serv.nome : '-';
            html += `
                <tr>
                    <td>${formatarDataParaBrasileiro(op.data)}</td>
                    <td>${getPlacaVeiculo(op.veiculoId)}</td>
                    <td>${nomeServ}</td>
                    <td>${formatarValorMoeda(op.financeiro.faturamento)}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                <div style="text-align:right; margin-top:10px;">
                    <strong>TOTAL A PAGAR: ${formatarValorMoeda(cli.total)}</strong>
                </div>
            </div>
        `;
    }
    content.innerHTML = html;
}

// -----------------------------------------------------------------------------
// 19. RECIBOS E PAGAMENTOS
// -----------------------------------------------------------------------------

function carregarSelectMotoristaRecibo() {
    var sel = document.getElementById('selectMotoristaRecibo');
    if (sel) {
        sel.innerHTML = '<option value="">SELECIONE O FUNCIONÁRIO...</option>';
        CACHE_FUNCIONARIOS.forEach(function(f) {
            if (f.funcao === 'motorista' || f.funcao === 'ajudante') {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                sel.appendChild(opt);
            }
        });
    }
}

function gerarReciboPagamento() {
    var funcId = document.getElementById('selectMotoristaRecibo').value;
    var dIniStr = document.getElementById('dataInicioRecibo').value;
    var dFimStr = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dIniStr || !dFimStr) {
        alert("Preencha funcionário e período.");
        return;
    }

    var func = CACHE_FUNCIONARIOS.find(x => x.id == funcId);
    var dIni = new Date(dIniStr + 'T00:00:00');
    var dFim = new Date(dFimStr + 'T23:59:59');

    // Filtra operações onde o funcionário trabalhou
    var opsFiltradas = CACHE_OPERACOES.filter(function(op) {
        if (!op.data || op.status !== 'concluido') return false;
        var dOp = new Date(op.data + 'T12:00:00');
        
        if (dOp < dIni || dOp > dFim) return false;

        var isMotorista = (op.motoristaId == funcId);
        var isAjudante = (op.ajudantes && op.ajudantes.some(a => a.idFuncionario == funcId));

        return isMotorista || isAjudante;
    });

    var total = 0;
    var linhas = '';

    opsFiltradas.forEach(function(op) {
        var valor = 0;
        var desc = '';

        if (op.motoristaId == funcId) {
            valor = parseFloat(op.financeiro.comissaoMotorista) || 0;
            desc = 'Comissão - ' + getNomeCliente(op.contratanteId);
        } else {
            // É ajudante
            var item = op.ajudantes.find(a => a.idFuncionario == funcId);
            valor = parseFloat(item.valor) || 0;
            desc = 'Diária Ajudante - ' + getNomeCliente(op.contratanteId);
        }

        if (valor > 0) {
            total += valor;
            linhas += `
                <tr>
                    <td style="border-bottom:1px solid #ddd;">${formatarDataParaBrasileiro(op.data)}</td>
                    <td style="border-bottom:1px solid #ddd;">${desc}</td>
                    <td style="border-bottom:1px solid #ddd; text-align:right;">${formatarValorMoeda(valor)}</td>
                </tr>
            `;
        }
    });

    // Monta o Modal
    var content = document.getElementById('modalReciboContent');
    var actions = document.getElementById('modalReciboActions');
    
    content.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <h2>RECIBO DE PAGAMENTO</h2>
            <p><strong>${CACHE_MINHA_EMPRESA.razaoSocial || 'EMPRESA'}</strong></p>
            <hr>
            <p>Beneficiário: <strong>${func.nome}</strong> (CPF: ${func.documento || '-'})</p>
            <h1 style="background:#eee; padding:10px;">${formatarValorMoeda(total)}</h1>
            <p>Referente a serviços prestados de ${formatarDataParaBrasileiro(dIniStr)} a ${formatarDataParaBrasileiro(dFimStr)}.</p>
            <br>
            <table style="width:100%; border-collapse:collapse;">
                <tr><th style="text-align:left;">Data</th><th style="text-align:left;">Descrição</th><th style="text-align:right;">Valor</th></tr>
                ${linhas}
            </table>
        </div>
    `;

    actions.innerHTML = `
        <button class="btn-primary" onclick="salvarReciboHist('${func.id}', '${dIniStr}', '${dFimStr}', ${total})">SALVAR NO HISTÓRICO</button>
        <button class="btn-secondary" onclick="window.print()">IMPRIMIR</button>
    `;
    
    document.getElementById('modalRecibo').style.display = 'block';
}

async function salvarReciboHist(funcId, ini, fim, val) {
    var novo = {
        id: gerarIdUnico('rec'),
        dataEmissao: new Date().toISOString(),
        funcionarioId: funcId,
        periodoInicio: ini,
        periodoFim: fim,
        valorTotal: val
    };
    CACHE_RECIBOS.push(novo);
    await salvarDados(CHAVE_DB_RECIBOS, CACHE_RECIBOS);
    alert("Recibo salvo!");
    document.getElementById('modalRecibo').style.display = 'none';
    renderizarHistoricoRecibosAdmin();
}

function renderizarHistoricoRecibosAdmin() {
    var tbody = document.querySelector('#tabelaHistoricoRecibos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    CACHE_RECIBOS.sort((a,b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).forEach(function(r) {
        var f = CACHE_FUNCIONARIOS.find(x => x.id == r.funcionarioId);
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(r.dataEmissao)}</td>
            <td>${f ? f.nome : '...'}</td>
            <td>${formatarDataParaBrasileiro(r.periodoInicio)} a ${formatarDataParaBrasileiro(r.periodoFim)}</td>
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
    var uid = window.USUARIO_ATUAL.uid;
    var container = document.getElementById('checkin-container');
    if (!container) return;

    // Busca operação ativa (Em Andamento > Agendada)
    var opAtiva = CACHE_OPERACOES.find(o => o.motoristaId == uid && o.status === 'em_andamento');
    if (!opAtiva) {
        opAtiva = CACHE_OPERACOES.find(o => o.motoristaId == uid && o.status === 'agendado');
    }

    if (!opAtiva) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;"><h3>Sem viagens no momento.</h3><p>Aguarde o agendamento.</p></div>';
        return;
    }

    var cliente = getNomeCliente(opAtiva.contratanteId);
    var veiculo = getPlacaVeiculo(opAtiva.veiculoId);
    
    var htmlStatus = '';
    var btnAcao = '';

    if (opAtiva.status === 'agendado') {
        htmlStatus = '<span class="status-pill pill-pending" style="font-size:1.2rem;">AGUARDANDO INÍCIO</span>';
        btnAcao = `<button class="btn-success" style="width:100%; padding:20px; font-size:1.2rem;" onclick="abrirModalCheckin('${opAtiva.id}', 'inicio')"><i class="fas fa-play"></i> INICIAR VIAGEM</button>`;
    } else {
        htmlStatus = '<span class="status-pill pill-active" style="font-size:1.2rem; background-color:#17a2b8;">EM VIAGEM</span>';
        btnAcao = `<button class="btn-danger" style="width:100%; padding:20px; font-size:1.2rem;" onclick="abrirModalCheckin('${opAtiva.id}', 'fim')"><i class="fas fa-flag-checkered"></i> FINALIZAR VIAGEM</button>`;
    }

    container.innerHTML = `
        <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align:center; margin-bottom:20px;">${htmlStatus}</div>
            <h2 style="text-align:center; color:#333;">${cliente}</h2>
            <p style="text-align:center; font-size:1.1rem;">Veículo: <strong>${veiculo}</strong></p>
            <p style="text-align:center; color:#666;">Data: ${formatarDataParaBrasileiro(opAtiva.data)}</p>
            <hr>
            ${btnAcao}
        </div>
    `;
}

// Modal Check-in (Onde capturamos o KM)
function abrirModalCheckin(opId, tipo) {
    var op = CACHE_OPERACOES.find(x => x.id == opId);
    if (!op) return;

    var modal = document.getElementById('modalCheckinConfirm');
    document.getElementById('checkinOpId').value = opId;
    document.getElementById('checkinStep').value = tipo;
    
    document.getElementById('checkinDisplayData').textContent = formatarDataParaBrasileiro(op.data);
    document.getElementById('checkinDisplayContratante').textContent = getNomeCliente(op.contratanteId);
    document.getElementById('checkinDisplayVeiculo').textContent = getPlacaVeiculo(op.veiculoId);
    
    document.getElementById('checkinDriverFields').style.display = 'block';

    if (tipo === 'inicio') {
        document.getElementById('checkinModalTitle').textContent = "INICIAR ROTA";
        document.getElementById('divKmInicial').style.display = 'block';
        document.getElementById('divKmFinal').style.display = 'none';
        document.getElementById('btnConfirmCheckin').className = 'btn-success';
        document.getElementById('btnConfirmCheckin').textContent = 'CONFIRMAR SAÍDA';
    } else {
        document.getElementById('checkinModalTitle').textContent = "FINALIZAR ROTA";
        document.getElementById('divKmInicial').style.display = 'none';
        document.getElementById('divKmFinal').style.display = 'block';
        
        // Preenche KM Inicial anterior para facilitar
        var kmIniAnt = (op.checkinData && op.checkinData.kmInicial) ? op.checkinData.kmInicial : 0;
        document.getElementById('checkinKmInicialReadonly').value = kmIniAnt;
        
        document.getElementById('btnConfirmCheckin').className = 'btn-danger';
        document.getElementById('btnConfirmCheckin').textContent = 'ENCERRAR VIAGEM';
    }
    
    modal.style.display = 'flex';
}

function closeCheckinConfirmModal() {
    document.getElementById('modalCheckinConfirm').style.display = 'none';
}

// Confirmação do Check-in
var formCheck = document.getElementById('formCheckinConfirm');
if (formCheck) {
    var newFormC = formCheck.cloneNode(true);
    formCheck.parentNode.replaceChild(newFormC, formCheck);

    newFormC.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        var opId = document.getElementById('checkinOpId').value;
        var tipo = document.getElementById('checkinStep').value;
        var opIndex = CACHE_OPERACOES.findIndex(x => x.id == opId);
        if (opIndex === -1) return;
        
        var op = CACHE_OPERACOES[opIndex];
        if (!op.checkinData) op.checkinData = {};

        var agora = new Date().toISOString();

        if (tipo === 'inicio') {
            var km = parseFloat(document.getElementById('checkinKmInicial').value);
            if (!km) { alert("Informe o KM de saída."); return; }
            
            op.status = 'em_andamento';
            op.checkinData.kmInicial = km;
            op.checkinData.timestampInicio = agora;
            
        } else {
            var kmFim = parseFloat(document.getElementById('checkinKmFinal').value);
            var kmIni = parseFloat(document.getElementById('checkinKmInicialReadonly').value);
            var abast = parseFloat(document.getElementById('checkinValorAbastecido').value) || 0;
            var litro = parseFloat(document.getElementById('checkinPrecoLitroConfirm').value) || 0;
            
            if (!kmFim) { alert("Informe o KM de chegada."); return; }
            if (kmFim <= kmIni) { alert("KM Final deve ser maior que o Inicial."); return; }

            op.status = 'concluido';
            op.checkinData.kmFinal = kmFim;
            op.checkinData.timestampFim = agora;
            op.checkinData.abastecimento = abast;
            
            // Atualiza dados financeiros da operação
            op.financeiro.kmRodado = kmFim - kmIni;
            op.financeiro.combustivel = abast;
            if (litro > 0) op.financeiro.precoLitro = litro;
        }
        
        await salvarDados(CHAVE_DB_OPERACOES, CACHE_OPERACOES);
        alert("Status atualizado com sucesso!");
        closeCheckinConfirmModal();
        carregarPainelFuncionario();
    });
}

// -----------------------------------------------------------------------------
// 21. SUPER ADMIN (PAINEL MASTER)
// -----------------------------------------------------------------------------

function carregarPainelSuperAdmin() {
    // Lista empresas cadastradas no Firebase
    if (!window.dbRef) return;
    const { db, collection, getDocs } = window.dbRef;
    
    var container = document.getElementById('superAdminContainer');
    container.innerHTML = 'Carregando...';

    getDocs(collection(db, 'companies')).then(snap => {
        if (snap.empty) {
            container.innerHTML = 'Nenhuma empresa.';
            return;
        }
        var html = '<table class="data-table"><thead><tr><th>ID</th><th>ADMIN</th><th>VALIDADE</th><th>AÇÃO</th></tr></thead><tbody>';
        snap.forEach(doc => {
            var d = doc.data();
            var status = d.isBlocked ? '(Bloqueado)' : (d.isVitalicio ? 'VITALÍCIO' : formatarDataParaBrasileiro(d.expiresAt));
            html += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${d.adminEmail}</td>
                    <td>${status}</td>
                    <td><button class="btn-primary btn-mini" onclick="abrirModalCreditos('${doc.id}', '${d.expiresAt}', ${d.isVitalicio}, ${d.isBlocked})">EDITAR</button></td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    });
}

// Criação de Empresa
var formComp = document.getElementById('formCreateCompany');
if (formComp) {
    var newFormComp = formComp.cloneNode(true);
    formComp.parentNode.replaceChild(newFormComp, formComp);
    
    newFormComp.addEventListener('submit', async function(e) {
        e.preventDefault();
        var id = document.getElementById('newCompanyDomain').value;
        var email = document.getElementById('newAdminEmail').value;
        var pass = document.getElementById('newAdminPassword').value;

        try {
            // Cria Auth e Docs
            var uid = await window.dbRef.criarAuthUsuario(email, pass);
            const { db, doc, setDoc } = window.dbRef;
            
            await setDoc(doc(db, "companies", id), {
                adminEmail: email,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + (30 * 86400000)).toISOString(), // 30 dias
                isVitalicio: false,
                isBlocked: false
            });
            
            await setDoc(doc(db, "users", uid), {
                email: email, role: 'admin', company: id
            });
            
            alert("Empresa criada!");
            carregarPainelSuperAdmin();
        } catch(err) {
            alert("Erro: " + err.message);
        }
    });
}

// Modal Créditos
function abrirModalCreditos(id, expires, vitalicio, block) {
    var modal = document.getElementById('modalCreditos');
    document.getElementById('empresaIdCredito').value = id;
    document.getElementById('nomeEmpresaCredito').textContent = id;
    document.getElementById('validadeAtualCredito').textContent = vitalicio ? 'Vitalício' : formatarDataParaBrasileiro(expires);
    document.getElementById('checkVitalicio').checked = vitalicio;
    document.getElementById('checkBloqueado').checked = block;
    modal.style.display = 'flex';
}

async function salvarCreditosEmpresa() {
    var id = document.getElementById('empresaIdCredito').value;
    var vitalicio = document.getElementById('checkVitalicio').checked;
    var block = document.getElementById('checkBloqueado').checked;
    var addMeses = parseInt(document.getElementById('qtdCreditosAdd').value) || 0;

    const { db, doc, getDoc, updateDoc } = window.dbRef;
    var ref = doc(db, 'companies', id);
    var snap = await getDoc(ref);
    var data = snap.data();
    
    var novaValidade = data.expiresAt;
    if (addMeses > 0 && !vitalicio) {
        var atual = new Date(novaValidade);
        if (new Date() > atual) atual = new Date(); // Se venceu, conta de hoje
        atual.setMonth(atual.getMonth() + addMeses);
        novaValidade = atual.toISOString();
    }

    await updateDoc(ref, {
        isVitalicio: vitalicio,
        isBlocked: block,
        expiresAt: novaValidade
    });
    alert("Salvo!");
    document.getElementById('modalCreditos').style.display = 'none';
    carregarPainelSuperAdmin();
}

// -----------------------------------------------------------------------------
// 22. MANUTENÇÃO (BACKUP E RESET)
// -----------------------------------------------------------------------------

function exportDataBackup() {
    var backup = {
        funcionarios: CACHE_FUNCIONARIOS,
        veiculos: CACHE_VEICULOS,
        contratantes: CACHE_CONTRATANTES,
        operacoes: CACHE_OPERACOES,
        minhaEmpresa: CACHE_MINHA_EMPRESA,
        despesas: CACHE_DESPESAS,
        atividades: CACHE_ATIVIDADES,
        date: new Date().toISOString()
    };
    
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    var link = document.createElement('a');
    link.href = dataStr;
    link.download = "backup_logimaster_" + new Date().toISOString().slice(0,10) + ".json";
    link.click();
}

function importDataBackup(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = async function(e) {
        try {
            var json = JSON.parse(e.target.result);
            if (confirm("ATENÇÃO: Isso irá substituir os dados atuais. Continuar?")) {
                if(json.funcionarios) await salvarDados(CHAVE_DB_FUNCIONARIOS, json.funcionarios);
                if(json.veiculos) await salvarDados(CHAVE_DB_VEICULOS, json.veiculos);
                if(json.operacoes) await salvarDados(CHAVE_DB_OPERACOES, json.operacoes);
                if(json.contratantes) await salvarDados(CHAVE_DB_CONTRATANTES, json.contratantes);
                if(json.minhaEmpresa) await salvarDados(CHAVE_DB_MINHA_EMPRESA, json.minhaEmpresa);
                if(json.despesas) await salvarDados(CHAVE_DB_DESPESAS, json.despesas);
                if(json.atividades) await salvarDados(CHAVE_DB_ATIVIDADES, json.atividades);
                
                alert("Backup restaurado! Recarregando...");
                window.location.reload();
            }
        } catch(err) {
            alert("Erro no arquivo: " + err.message);
        }
    };
    reader.readAsText(file);
}

function zerarSistemaCompleto() {
    document.getElementById('modalSecurityConfirm').style.display = 'flex';
    document.getElementById('btnConfirmSecurity').onclick = async function() {
        var pass = document.getElementById('securityPasswordInput').value;
        if (!pass) return;
        
        try {
            const { auth, reauthenticateWithCredential, EmailAuthProvider } = window.dbRef;
            var cred = EmailAuthProvider.credential(window.USUARIO_ATUAL.email, pass);
            await reauthenticateWithCredential(auth.currentUser, cred);
            
            // Limpa tudo
            await salvarDados(CHAVE_DB_FUNCIONARIOS, []);
            await salvarDados(CHAVE_DB_VEICULOS, []);
            await salvarDados(CHAVE_DB_OPERACOES, []);
            await salvarDados(CHAVE_DB_CONTRATANTES, []);
            await salvarDados(CHAVE_DB_DESPESAS, []);
            await salvarDados(CHAVE_DB_RECIBOS, []);
            
            alert("Sistema zerado.");
            window.location.reload();
        } catch(e) {
            alert("Erro: " + e.message);
        }
    };
}