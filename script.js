// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 1/5
// ========================================
// Sistema de Gestão de Frotas e Logística
// Frontend: HTML5, CSS3, Vanilla JS
// Backend: Firebase (Firestore + Auth)
// ========================================

// ========================================
// VARIÁVEIS GLOBAIS E CONFIGURAÇÃO INICIAL
// ========================================

let currentUser = null;
let currentDomain = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let allOperations = [];
let allDespesas = [];
let globalUsersCache = []; // Cache para Super Admin
let globalCompaniesCache = []; // Cache de empresas para Super Admin

// ========================================
// FUNÇÃO DE INICIALIZAÇÃO DO SISTEMA
// ========================================

window.initSystemByRole = async function(userData) {
    currentUser = userData;
    currentDomain = userData.domain;

    console.log("🚀 Inicializando sistema para:", userData.email, "| Função:", userData.role);

    // ========================================
    // VERIFICAÇÃO DE CRÉDITOS DA EMPRESA
    // ========================================
    if (userData.role !== 'super_admin') {
        const creditStatus = await verificarCreditosEmpresa(currentDomain);
        
        if (!creditStatus.valid) {
            // EMPRESA SEM CRÉDITOS - BLOQUEAR ACESSO
            alert("⚠️ ACESSO BLOQUEADO\n\nSua empresa não possui créditos válidos.\nEntre em contato com o administrador do sistema.");
            await window.logoutSystem();
            return; // Impede carregamento do sistema
        }

        // Se for Admin, exibir data de validade dos créditos
        if (userData.role === 'admin') {
            exibirValidadeCreditosAdmin(creditStatus);
        }
    }

    // ========================================
    // CARREGAMENTO POR PERFIL
    // ========================================
    
    if (userData.role === 'super_admin') {
        // SUPER ADMIN - PAINEL GLOBAL
        showMenu('menu-super-admin');
        showPage('super-admin');
        await carregarPainelSuperAdmin();
        
    } else if (userData.role === 'admin') {
        // ADMIN DA EMPRESA
        showMenu('menu-admin');
        showPage('home');
        await carregarDadosAdmin();
        iniciarListenersAdmin();
        
    } else if (userData.role === 'motorista' || userData.role === 'ajudante') {
        // FUNCIONÁRIO (MOTORISTA OU AJUDANTE)
        showMenu('menu-employee');
        showPage('employee-home');
        await carregarDadosFuncionario();
        iniciarListenersFuncionario();
    }

    // Inicializar navegação e eventos gerais
    inicializarNavegacao();
    inicializarMobileMenu();
};

// ========================================
// VERIFICAÇÃO DE CRÉDITOS DA EMPRESA
// ========================================

async function verificarCreditosEmpresa(domain) {
    try {
        const companyRef = window.dbRef.doc(window.dbRef.db, 'companies', domain);
        const companySnap = await window.dbRef.getDoc(companyRef);

        if (!companySnap.exists()) {
            console.error("❌ Empresa não encontrada:", domain);
            return { valid: false, message: "Empresa não encontrada" };
        }

        const companyData = companySnap.data();
        
        // Se tiver "lifetime" ativo, libera acesso
        if (companyData.creditLifetime === true) {
            console.log("✅ Empresa com CRÉDITO VITALÍCIO");
            return { 
                valid: true, 
                lifetime: true,
                message: "CRÉDITO VITALÍCIO"
            };
        }

        // Verificar créditos e data de validade
        const credits = companyData.credits || 0;
        const validUntil = companyData.creditValidUntil ? new Date(companyData.creditValidUntil) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (credits > 0 && validUntil && validUntil >= today) {
            console.log("✅ Empresa com créditos válidos até:", validUntil.toLocaleDateString('pt-BR'));
            return {
                valid: true,
                lifetime: false,
                validUntil: validUntil,
                credits: credits,
                message: `VÁLIDO ATÉ: ${validUntil.toLocaleDateString('pt-BR')}`
            };
        }

        // Sem créditos ou vencidos
        console.warn("⚠️ Empresa SEM créditos válidos");
        return {
            valid: false,
            lifetime: false,
            validUntil: validUntil,
            credits: credits,
            message: "CRÉDITOS EXPIRADOS"
        };

    } catch (error) {
        console.error("❌ Erro ao verificar créditos:", error);
        return { valid: false, message: "Erro ao verificar créditos" };
    }
}

// ========================================
// EXIBIR VALIDADE DE CRÉDITOS PARA ADMIN
// ========================================

function exibirValidadeCreditosAdmin(creditStatus) {
    const creditDisplay = document.getElementById('creditValidityDisplay');
    if (!creditDisplay) return;

    if (creditStatus.lifetime) {
        creditDisplay.innerHTML = `
            <i class="fas fa-infinity" style="color: var(--success-color);"></i>
            <span style="color: var(--success-color); font-weight: bold;">CRÉDITO VITALÍCIO</span>
        `;
    } else if (creditStatus.valid) {
        const dataFormatada = creditStatus.validUntil.toLocaleDateString('pt-BR');
        creditDisplay.innerHTML = `
            <i class="fas fa-calendar-check" style="color: var(--info-color);"></i>
            <span style="color: #555;">VÁLIDO ATÉ: <strong>${dataFormatada}</strong></span>
        `;
    } else {
        creditDisplay.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--danger-color);"></i>
            <span style="color: var(--danger-color); font-weight: bold;">CRÉDITOS EXPIRADOS</span>
        `;
    }

    creditDisplay.style.display = 'block';
}

// ========================================
// PAINEL SUPER ADMIN - CARREGAMENTO GLOBAL
// ========================================

window.carregarPainelSuperAdmin = async function(forceReload = false) {
    console.log("🌐 Carregando Painel Super Admin...");

    const container = document.getElementById('superAdminContainer');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> CARREGANDO DADOS GLOBAIS...</p>';

    try {
        // Buscar todas as empresas (companies)
        const companiesRef = window.dbRef.collection(window.dbRef.db, 'companies');
        const companiesSnap = await window.dbRef.getDocs(companiesRef);

        if (companiesSnap.empty) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:30px;">Nenhuma empresa cadastrada ainda.</p>';
            return;
        }

        globalCompaniesCache = [];
        globalUsersCache = [];

        // Processar cada empresa
        for (const companyDoc of companiesSnap.docs) {
            const companyId = companyDoc.id;
            const companyData = companyDoc.data();

            // Dados da empresa
            const companyInfo = {
                id: companyId,
                domain: companyId,
                credits: companyData.credits || 0,
                creditLifetime: companyData.creditLifetime || false,
                creditValidUntil: companyData.creditValidUntil || null,
                razaoSocial: companyData.razaoSocial || companyId.toUpperCase(),
                cnpj: companyData.cnpj || 'N/A'
            };

            globalCompaniesCache.push(companyInfo);

            // Buscar usuários desta empresa
            const usersRef = window.dbRef.collection(window.dbRef.db, 'users');
            const qUsers = window.dbRef.query(usersRef, window.dbRef.where('domain', '==', companyId));
            const usersSnap = await window.dbRef.getDocs(qUsers);

            usersSnap.forEach(userDoc => {
                const userData = userDoc.data();
                globalUsersCache.push({
                    uid: userDoc.id,
                    email: userData.email,
                    role: userData.role,
                    domain: userData.domain,
                    nome: userData.nome || 'N/A',
                    status: userData.status || 'ativo',
                    companyInfo: companyInfo
                });
            });
        }

        console.log("✅ Dados globais carregados:", globalCompaniesCache.length, "empresas,", globalUsersCache.length, "usuários");

        // Renderizar interface
        renderizarPainelSuperAdmin();

    } catch (error) {
        console.error("❌ Erro ao carregar painel Super Admin:", error);
        container.innerHTML = '<p style="text-align:center; color:red; padding:30px;">Erro ao carregar dados. Verifique o console.</p>';
    }
};

// ========================================
// RENDERIZAR PAINEL SUPER ADMIN
// ========================================

function renderizarPainelSuperAdmin() {
    const container = document.getElementById('superAdminContainer');
    if (!container) return;

    let html = '';

    if (globalCompaniesCache.length === 0) {
        html = '<p style="text-align:center; color:#999; padding:30px;">Nenhuma empresa encontrada.</p>';
    } else {
        globalCompaniesCache.forEach(company => {
            // Status de crédito
            let creditStatusHTML = '';
            let creditClass = '';

            if (company.creditLifetime) {
                creditClass = 'tag-lifetime';
                creditStatusHTML = '<span class="credit-status-tag tag-lifetime"><i class="fas fa-infinity"></i> VITALÍCIO</span>';
            } else {
                const validUntil = company.creditValidUntil ? new Date(company.creditValidUntil) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (validUntil && validUntil >= today) {
                    creditClass = 'tag-active';
                    creditStatusHTML = `<span class="credit-status-tag tag-active"><i class="fas fa-check-circle"></i> ATIVO ATÉ ${validUntil.toLocaleDateString('pt-BR')}</span>`;
                } else {
                    creditClass = 'tag-expired';
                    creditStatusHTML = '<span class="credit-status-tag tag-expired"><i class="fas fa-times-circle"></i> EXPIRADO</span>';
                }
            }

            // Usuários desta empresa
            const companyUsers = globalUsersCache.filter(u => u.domain === company.domain);

            html += `
                <div class="company-block" style="border: 2px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #fafafa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div>
                            <h3 style="margin: 0; color: var(--primary-color);">
                                <i class="fas fa-building"></i> ${company.razaoSocial}
                            </h3>
                            <p style="margin: 5px 0 0 0; color: #666; font-size: 0.9rem;">
                                <strong>Domínio:</strong> ${company.domain} | <strong>CNPJ:</strong> ${company.cnpj}
                            </p>
                        </div>
                        <div>
                            ${creditStatusHTML}
                        </div>
                    </div>

                    <!-- GESTÃO DE CRÉDITOS -->
                    <div class="credit-management-box" style="background: #fff; border: 1px solid #ccc; border-radius: 6px; padding: 15px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: var(--secondary-color); font-size: 1rem;">
                            <i class="fas fa-coins"></i> GESTÃO DE CRÉDITOS
                        </h4>
                        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lifetime_${company.domain}" ${company.creditLifetime ? 'checked' : ''} 
                                    onchange="toggleLifetimeCredit('${company.domain}', this.checked)" 
                                    style="width: 20px; height: 20px; cursor: pointer;">
                                <span style="font-weight: bold; color: var(--success-color);">CRÉDITO VITALÍCIO</span>
                            </label>

                            <div style="flex-grow: 1; display: flex; gap: 10px; align-items: center;">
                                <label style="font-weight: bold; color: #555;">Adicionar Créditos (30 dias cada):</label>
                                <input type="number" id="addCredits_${company.domain}" min="1" value="1" 
                                    style="width: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                <button class="btn-primary btn-mini" onclick="adicionarCreditos('${company.domain}')">
                                    <i class="fas fa-plus"></i> ADICIONAR
                                </button>
                            </div>
                        </div>
                        <p style="margin: 10px 0 0 0; font-size: 0.85rem; color: #666;">
                            <strong>Créditos atuais:</strong> ${company.credits} | 
                            <strong>Validade:</strong> ${company.creditValidUntil ? new Date(company.creditValidUntil).toLocaleDateString('pt-BR') : 'N/A'}
                        </p>
                    </div>

                    <!-- LISTA DE USUÁRIOS -->
                    <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #555; font-size: 0.95rem;">
                            <i class="fas fa-users"></i> USUÁRIOS (${companyUsers.length})
                        </h4>
                        ${companyUsers.length === 0 ? '<p style="color:#999; font-size:0.9rem;">Nenhum usuário cadastrado.</p>' : ''}
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${companyUsers.map(user => `
                                <li style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong>${user.nome}</strong> 
                                        <span style="color: #666;">(${user.email})</span>
                                        <span style="background: var(--info-color); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">
                                            ${user.role.toUpperCase()}
                                        </span>
                                    </div>
                                    <button class="btn-danger btn-mini" onclick="excluirUsuarioGlobal('${user.uid}', '${user.email}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}

// ========================================
// ADICIONAR CRÉDITOS (SUPER ADMIN)
// ========================================

window.adicionarCreditos = async function(domain) {
    const inputCredits = document.getElementById(`addCredits_${domain}`);
    const qtdCreditos = parseInt(inputCredits.value) || 0;

    if (qtdCreditos <= 0) {
        alert("⚠️ Informe uma quantidade válida de créditos.");
        return;
    }

    if (!confirm(`Adicionar ${qtdCreditos} crédito(s) (${qtdCreditos * 30} dias) para ${domain}?`)) return;

    try {
        const companyRef = window.dbRef.doc(window.dbRef.db, 'companies', domain);
        const companySnap = await window.dbRef.getDoc(companyRef);

        if (!companySnap.exists()) {
            alert("❌ Empresa não encontrada.");
            return;
        }

        const companyData = companySnap.data();
        const currentCredits = companyData.credits || 0;
        const currentValidUntil = companyData.creditValidUntil ? new Date(companyData.creditValidUntil) : new Date();

        // Calcular nova data de validade
        let newValidUntil = new Date(currentValidUntil);
        if (newValidUntil < new Date()) {
            newValidUntil = new Date(); // Se expirado, começa de hoje
        }
        newValidUntil.setDate(newValidUntil.getDate() + (qtdCreditos * 30));

        // Atualizar Firestore
        await window.dbRef.updateDoc(companyRef, {
            credits: currentCredits + qtdCreditos,
            creditValidUntil: newValidUntil.toISOString().split('T')[0]
        });

        alert(`✅ ${qtdCreditos} crédito(s) adicionado(s) com sucesso!\nNova validade: ${newValidUntil.toLocaleDateString('pt-BR')}`);
        
        // Recarregar painel
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("❌ Erro ao adicionar créditos:", error);
        alert("❌ Erro ao adicionar créditos. Verifique o console.");
    }
};

// ========================================
// ATIVAR/DESATIVAR CRÉDITO VITALÍCIO
// ========================================

window.toggleLifetimeCredit = async function(domain, isLifetime) {
    if (!confirm(`${isLifetime ? 'ATIVAR' : 'DESATIVAR'} crédito vitalício para ${domain}?`)) {
        // Reverter checkbox
        document.getElementById(`lifetime_${domain}`).checked = !isLifetime;
        return;
    }

    try {
        const companyRef = window.dbRef.doc(window.dbRef.db, 'companies', domain);
        await window.dbRef.updateDoc(companyRef, {
            creditLifetime: isLifetime
        });

        alert(`✅ Crédito vitalício ${isLifetime ? 'ATIVADO' : 'DESATIVADO'} com sucesso!`);
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("❌ Erro ao alterar crédito vitalício:", error);
        alert("❌ Erro ao processar. Verifique o console.");
        document.getElementById(`lifetime_${domain}`).checked = !isLifetime;
    }
};

// ========================================
// EXCLUIR USUÁRIO GLOBAL (SUPER ADMIN)
// ========================================

window.excluirUsuarioGlobal = async function(uid, email) {
    if (!confirm(`⚠️ EXCLUIR PERMANENTEMENTE o usuário:\n${email}\n\nEsta ação não pode ser desfeita!`)) return;

    try {
        const userRef = window.dbRef.doc(window.dbRef.db, 'users', uid);
        await window.dbRef.deleteDoc(userRef);

        alert(`✅ Usuário ${email} excluído com sucesso!`);
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("❌ Erro ao excluir usuário:", error);
        alert("❌ Erro ao excluir usuário. Verifique o console.");
    }
};

// ========================================
// FILTRAR USUÁRIOS GLOBAIS (BUSCA)
// ========================================

window.filterGlobalUsers = function() {
    const searchTerm = document.getElementById('superAdminSearch').value.toLowerCase().trim();

    if (searchTerm === '') {
        renderizarPainelSuperAdmin();
        return;
    }

    // Filtrar empresas e usuários
    const filteredCompanies = globalCompaniesCache.filter(company => {
        const companyMatch = company.razaoSocial.toLowerCase().includes(searchTerm) || 
                             company.domain.toLowerCase().includes(searchTerm) ||
                             company.cnpj.includes(searchTerm);

        const usersMatch = globalUsersCache.some(user => 
            user.domain === company.domain && 
            (user.email.toLowerCase().includes(searchTerm) || user.nome.toLowerCase().includes(searchTerm))
        );

        return companyMatch || usersMatch;
    });

    // Renderizar apenas empresas filtradas
    const container = document.getElementById('superAdminContainer');
    if (!container) return;

    if (filteredCompanies.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:30px;">Nenhum resultado encontrado.</p>';
        return;
    }

    // Usar mesma lógica de renderização, mas com filteredCompanies
    const originalCache = [...globalCompaniesCache];
    globalCompaniesCache = filteredCompanies;
    renderizarPainelSuperAdmin();
    globalCompaniesCache = originalCache;
};

// ========================================
// FIM DA PARTE 1/5
// ========================================
// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 2/5
// ========================================
// Navegação, carregamento ADMIN e FUNCIONÁRIO
// ========================================

// ========================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ========================================

function showMenu(menuId) {
    const menus = ['menu-admin', 'menu-super-admin', 'menu-employee'];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === menuId) ? 'block' : 'none';
    });
}

function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.display = (page.id === pageId) ? 'block' : 'none';
    });

    // Atualizar classe active do menu
    const allNavItems = document.querySelectorAll('.nav-item');
    allNavItems.forEach(item => {
        const page = item.getAttribute('data-page');
        if (page === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function inicializarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.getAttribute('data-page');
            if (!pageId) return;
            showPage(pageId);

            // Fechar sidebar em mobile ao trocar de página
            fecharSidebarMobile();
        });
    });

    // Tabs de cadastro
    const cadastroTabs = document.querySelectorAll('.cadastro-tab-btn');
    cadastroTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            if (!tab) return;

            cadastroTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const forms = document.querySelectorAll('.cadastro-form');
            forms.forEach(form => {
                form.classList.remove('active');
                if (form.id === tab) {
                    form.classList.add('active');
                }
            });
        });
    });
}

// ========================================
// MENU MOBILE
// ========================================

function inicializarMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (!btn || !sidebar || !overlay) return;

    btn.onclick = () => {
        sidebar.classList.toggle('open');
        overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    };

    overlay.onclick = () => {
        fecharSidebarMobile();
    };
}

function fecharSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
}

// ========================================
// CARREGAMENTO DE DADOS PARA ADMIN
// ========================================

async function carregarDadosAdmin() {
    console.log("📊 Carregando dados para ADMIN...");

    try {
        await Promise.all([
            carregarDashboardFinanceiro(),
            carregarCalendarioOperacoes(),
            carregarCadastrosIniciais(),
            carregarPendentesAprovacao(),
            carregarFuncionariosAtivos(),
            carregarDespesasGerais(),
            carregarMensagemBadge()
        ]);
    } catch (error) {
        console.error("❌ Erro ao carregar dados do Admin:", error);
    }
}

// DASHBOARD (RESUMO FINANCEIRO)
async function carregarDashboardFinanceiro() {
    // Esta função deve buscar operações e despesas no período do mês atual
    // e alimentar: faturamentoMes, despesasMes, receitaMes
    const spanFat = document.getElementById('faturamentoMes');
    const spanDesp = document.getElementById('despesasMes');
    const spanRec = document.getElementById('receitaMes');

    if (!spanFat || !spanDesp || !spanRec || !currentDomain) return;

    try {
        const db = window.dbRef.db;
        const { collection, query, where, getDocs } = window.dbRef;

        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

        const opsRef = collection(db, 'companies', currentDomain, 'operacoes');
        const q = query(
            opsRef,
            where('data', '>=', startOfMonth.toISOString().split('T')[0]),
            where('data', '<=', endOfMonth.toISOString().split('T')[0])
        );
        const snap = await getDocs(q);

        let totalFat = 0;
        let totalDespesas = 0;

        allOperations = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            allOperations.push({ id: docSnap.id, ...data });

            const fat = Number(data.faturamento || 0);
            const desp = Number(data.custosTotais || 0);
            totalFat += fat;
            totalDespesas += desp;
        });

        const totalReceita = totalFat - totalDespesas;

        spanFat.textContent = formatCurrency(totalFat);
        spanDesp.textContent = formatCurrency(totalDespesas);
        spanRec.textContent = formatCurrency(totalReceita);

    } catch (error) {
        console.error("Erro ao carregar dashboard financeiro:", error);
    }
}

// CALENDÁRIO DE OPERAÇÕES
async function carregarCalendarioOperacoes() {
    atualizarTituloMesCalendario();
    montarGridCalendario();
}

function atualizarTituloMesCalendario() {
    const label = document.getElementById('currentMonthYear');
    if (!label) return;
    const data = new Date(currentYear, currentMonth, 1);
    const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    label.textContent = nomeMes;
}

window.changeMonth = function(offset) {
    currentMonth += offset;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    carregarCalendarioOperacoes();
};

function montarGridCalendario() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startWeekDay = firstDay.getDay(); // 0 = domingo
    const totalDays = lastDay.getDate();

    // Cabeçalho de dias
    const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    weekDays.forEach(dia => {
        const cell = document.createElement('div');
        cell.className = 'calendar-header-cell';
        cell.textContent = dia;
        grid.appendChild(cell);
    });

    // Espaços em branco antes do primeiro dia
    for (let i = 0; i < startWeekDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        grid.appendChild(emptyCell);
    }

    // Dias do mês
    for (let dia = 1; dia <= totalDays; dia++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dateObj = new Date(currentYear, currentMonth, dia);
        const dateStr = dateObj.toISOString().split('T')[0];

        cell.innerHTML = `
            <div class="calendar-date">${dia}</div>
            <div class="calendar-badge" id="cal_badge_${dateStr}" style="display:none;"></div>
        `;

        cell.addEventListener('click', () => {
            abrirModalOperacoesDoDia(dateStr);
        });

        grid.appendChild(cell);
    }

    // Marcar dias com operações (usa allOperations em memória)
    marcarDiasComOperacoes();
}

function marcarDiasComOperacoes() {
    if (!allOperations || allOperations.length === 0) return;

    const mapPorDia = {};
    allOperations.forEach(op => {
        if (!op.data) return;
        const dateStr = op.data;
        if (!mapPorDia[dateStr]) mapPorDia[dateStr] = 0;
        mapPorDia[dateStr]++;
    });

    Object.keys(mapPorDia).forEach(dateStr => {
        const badge = document.getElementById(`cal_badge_${dateStr}`);
        if (!badge) return;
        badge.textContent = mapPorDia[dateStr];
        badge.style.display = 'inline-flex';
    });
}

async function abrirModalOperacoesDoDia(dateStr) {
    const modal = document.getElementById('modalDayOperations');
    const title = document.getElementById('modalDayTitle');
    const body = document.getElementById('modalDayBody');
    const summary = document.getElementById('modalDaySummary');

    if (!modal || !title || !body || !summary) return;

    title.textContent = `OPERAÇÕES EM ${formatDateBR(dateStr)}`;
    summary.innerHTML = '';
    body.innerHTML = '<p style="text-align:center;">Carregando...</p>';
    modal.style.display = 'block';

    try {
        const db = window.dbRef.db;
        const { collection, query, where, getDocs } = window.dbRef;

        const opsRef = collection(db, 'companies', currentDomain, 'operacoes');
        const q = query(opsRef, where('data', '==', dateStr));
        const snap = await getDocs(q);

        let html = '';
        let totalFat = 0;
        let totalDesp = 0;

        if (snap.empty) {
            body.innerHTML = '<p style="text-align:center; color:#777;">Nenhuma operação neste dia.</p>';
            return;
        }

        html += `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>MOTORISTA</th>
                        <th>VEÍCULO</th>
                        <th>CONTRATANTE</th>
                        <th>FATURAMENTO</th>
                        <th>CUSTOS</th>
                        <th>STATUS</th>
                    </tr>
                </thead>
                <tbody>
        `;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const fat = Number(data.faturamento || 0);
            const desp = Number(data.custosTotais || 0);
            totalFat += fat;
            totalDesp += desp;

            html += `
                <tr>
                    <td>${data.motoristaNome || '-'}</td>
                    <td>${data.veiculoPlaca || '-'}</td>
                    <td>${data.contratanteNome || '-'}</td>
                    <td>${formatCurrency(fat)}</td>
                    <td>${formatCurrency(desp)}</td>
                    <td>${(data.status || 'N/A').toUpperCase()}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        body.innerHTML = html;

        const lucro = totalFat - totalDesp;
        summary.innerHTML = `
            <div>
                <span>Faturamento Total:</span>
                <strong>${formatCurrency(totalFat)}</strong>
            </div>
            <div>
                <span>Custos Totais:</span>
                <strong>${formatCurrency(totalDesp)}</strong>
            </div>
            <div>
                <span>Lucro do Dia:</span>
                <strong>${formatCurrency(lucro)}</strong>
            </div>
        `;

    } catch (error) {
        console.error("Erro ao carregar operações do dia:", error);
        body.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar dados.</p>';
    }
}

// ========================================
// CARREGAR CADASTROS INICIAIS (ADMIN)
// ========================================

async function carregarCadastrosIniciais() {
    await Promise.all([
        carregarFuncionariosBase(),
        carregarVeiculosBase(),
        carregarContratantesBase(),
        carregarAtividadesBase()
    ]);
}

// FUNCIONÁRIOS BÁSICO (para selects etc.)
async function carregarFuncionariosBase() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const funcRef = collection(db, 'companies', currentDomain, 'funcionarios');
        const snap = await getDocs(funcRef);

        const selectMotoristaOperacao = document.getElementById('selectMotoristaOperacao');
        const selectMotoristaRelatorio = document.getElementById('selectMotoristaRelatorio');
        const selectMotoristaRecibo = document.getElementById('selectMotoristaRecibo');
        const selectAjudantesOperacao = document.getElementById('selectAjudantesOperacao');
        const msgRecipientSelect = document.getElementById('msgRecipientSelect');

        if (selectMotoristaOperacao) selectMotoristaOperacao.innerHTML = '<option value="">SELECIONE...</option>';
        if (selectMotoristaRelatorio) selectMotoristaRelatorio.innerHTML = '<option value="">TODOS</option>';
        if (selectMotoristaRecibo) selectMotoristaRecibo.innerHTML = '<option value="">SELECIONE...</option>';
        if (selectAjudantesOperacao) selectAjudantesOperacao.innerHTML = '<option value="">SELECIONE...</option>';
        if (msgRecipientSelect) msgRecipientSelect.innerHTML = '<option value="all">TODOS OS FUNCIONÁRIOS</option>';

        snap.forEach(docSnap => {
            const f = { id: docSnap.id, ...docSnap.data() };
            const isMotorista = f.funcao === 'motorista';
            const isAjudante = f.funcao === 'ajudante';

            const optText = `${f.nome} (${f.funcao || '-'})`;

            if (isMotorista && selectMotoristaOperacao) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = optText;
                selectMotoristaOperacao.appendChild(opt);
            }

            if (selectMotoristaRelatorio) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = optText;
                selectMotoristaRelatorio.appendChild(opt);
            }

            if (selectMotoristaRecibo) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = optText;
                selectMotoristaRecibo.appendChild(opt);
            }

            if (isAjudante && selectAjudantesOperacao) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = optText;
                selectAjudantesOperacao.appendChild(opt);
            }

            if (msgRecipientSelect) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                msgRecipientSelect.appendChild(opt);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar funcionários base:", error);
    }
}

// VEÍCULOS BÁSICO
async function carregarVeiculosBase() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'veiculos');
        const snap = await getDocs(ref);

        const selectVeiculoOperacao = document.getElementById('selectVeiculoOperacao');
        const selectVeiculoDespesa = document.getElementById('selectVeiculoDespesaGeral');
        const selectVeiculoRelatorio = document.getElementById('selectVeiculoRelatorio');

        if (selectVeiculoOperacao) selectVeiculoOperacao.innerHTML = '<option value="">SELECIONE...</option>';
        if (selectVeiculoDespesa) selectVeiculoDespesa.innerHTML = '<option value="">NENHUM</option>';
        if (selectVeiculoRelatorio) selectVeiculoRelatorio.innerHTML = '<option value="">TODOS</option>';

        snap.forEach(docSnap => {
            const v = { id: docSnap.id, ...docSnap.data() };
            const label = `${v.placa || v.id} - ${v.modelo || ''}`.trim();

            if (selectVeiculoOperacao) {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = label;
                selectVeiculoOperacao.appendChild(opt);
            }

            if (selectVeiculoDespesa) {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = label;
                selectVeiculoDespesa.appendChild(opt);
            }

            if (selectVeiculoRelatorio) {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = label;
                selectVeiculoRelatorio.appendChild(opt);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar veículos base:", error);
    }
}

// CONTRATANTES BÁSICO
async function carregarContratantesBase() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'contratantes');
        const snap = await getDocs(ref);

        const selectContratanteOperacao = document.getElementById('selectContratanteOperacao');
        const selectContratanteRelatorio = document.getElementById('selectContratanteRelatorio');

        if (selectContratanteOperacao) selectContratanteOperacao.innerHTML = '<option value="">SELECIONE...</option>';
        if (selectContratanteRelatorio) selectContratanteRelatorio.innerHTML = '<option value="">TODOS</option>';

        snap.forEach(docSnap => {
            const c = { id: docSnap.id, ...docSnap.data() };
            const label = `${c.razaoSocial || c.nome || c.id}`;

            if (selectContratanteOperacao) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = label;
                selectContratanteOperacao.appendChild(opt);
            }

            if (selectContratanteRelatorio) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = label;
                selectContratanteRelatorio.appendChild(opt);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar contratantes base:", error);
    }
}

// ATIVIDADES BÁSICO
async function carregarAtividadesBase() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'atividades');
        const snap = await getDocs(ref);

        const selectAtividadeOperacao = document.getElementById('selectAtividadeOperacao');
        const selectAtividadeRelatorio = document.getElementById('selectAtividadeRelatorio');

        if (selectAtividadeOperacao) selectAtividadeOperacao.innerHTML = '<option value="">SELECIONE...</option>';
        if (selectAtividadeRelatorio) selectAtividadeRelatorio.innerHTML = '<option value="">TODOS</option>';

        snap.forEach(docSnap => {
            const a = { id: docSnap.id, ...docSnap.data() };
            const label = a.nome || a.id;

            if (selectAtividadeOperacao) {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = label;
                selectAtividadeOperacao.appendChild(opt);
            }

            if (selectAtividadeRelatorio) {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = label;
                selectAtividadeRelatorio.appendChild(opt);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar atividades base:", error);
    }
}

// ========================================
// PENDENTES, ATIVOS E DESPESAS (ADMIN)
// ========================================

async function carregarPendentesAprovacao() {
    const db = window.dbRef.db;
    const { collection, query, where, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'users');
        const q = query(ref, where('domain', '==', currentDomain), where('status', '==', 'pending'));
        const snap = await getDocs(q);

        const tabela = document.getElementById('tabelaCompanyPendentes').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        let hasPendentes = false;

        snap.forEach(docSnap => {
            hasPendentes = true;
            const u = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.nome || '-'}</td>
                <td>${u.email || '-'}</td>
                <td>${(u.role || '-').toUpperCase()}</td>
                <td>${u.createdAt ? formatDateTimeBR(u.createdAt) : '-'}</td>
                <td>
                    <button class="btn-success btn-mini" onclick="aprovarUsuarioPendentes('${docSnap.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="recusarUsuarioPendentes('${docSnap.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

        const badge = document.getElementById('badgeAccess');
        if (badge) badge.style.display = hasPendentes ? 'inline-block' : 'none';

    } catch (error) {
        console.error("Erro ao carregar pendentes aprovação:", error);
    }
}

async function carregarFuncionariosAtivos() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'funcionarios');
        const snap = await getDocs(ref);

        const tabela = document.getElementById('tabelaCompanyAtivos').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        snap.forEach(docSnap => {
            const f = { id: docSnap.id, ...docSnap.data() };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.nome || '-'}</td>
                <td>${f.email || '-'}</td>
                <td>${(f.funcao || '-').toUpperCase()}</td>
                <td>${(f.status || 'ATIVO').toUpperCase()}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarFuncionario('${f.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirFuncionario('${f.id}', '${f.nome || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar funcionários ativos:", error);
    }
}

async function carregarDespesasGerais() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'despesas_gerais');
        const snap = await getDocs(ref);

        const tabela = document.getElementById('tabelaDespesasGerais').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        allDespesas = [];

        snap.forEach(docSnap => {
            const d = { id: docSnap.id, ...docSnap.data() };
            allDespesas.push(d);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.data ? formatDateBR(d.data) : '-'}</td>
                <td>${d.veiculoPlaca || '-'}</td>
                <td>${d.descricao || '-'}</td>
                <td>${formatCurrency(d.valor || 0)}</td>
                <td>${(d.status || 'ABERTO').toUpperCase()}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarDespesaGeral('${d.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirDespesaGeral('${d.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar despesas gerais:", error);
    }
}

async function carregarMensagemBadge() {
    // Pode ser usado para mostrar badge em "EQUIPE & AVISOS"
    // Exemplo: se houver mensagens não lidas
    // Por enquanto, apenas placeholder
}

// ========================================
// LISTENERS DO ADMIN (FORMULÁRIOS BÁSICOS)
// ========================================

function iniciarListenersAdmin() {
    // Form Funcionário
    const formFuncionario = document.getElementById('formFuncionario');
    if (formFuncionario) {
        formFuncionario.addEventListener('submit', onSubmitFuncionario);
    }

    // Form Veículo
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', onSubmitVeiculo);
    }

    // Form Contratante
    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', onSubmitContratante);
    }

    // Form Atividade
    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', onSubmitAtividade);
    }

    // Form Despesa Geral
    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', onSubmitDespesaGeral);
    }

    // Form Empresa
    const formEmpresa = document.getElementById('formMinhaEmpresa');
    if (formEmpresa) {
        formEmpresa.addEventListener('submit', onSubmitMinhaEmpresa);
        carregarMinhaEmpresaView();
    }

    // Form mensagem equipe
    const formMsg = document.getElementById('formAdminMessage');
    if (formMsg) {
        formMsg.addEventListener('submit', onSubmitAdminMessage);
    }
}

// ========================================
// FUNCIONÁRIO - CRUD BÁSICO (ESQUELETO)
// (a lógica de remover da LISTA DE ATIVOS
// será implementada aqui + Firestore)
// ========================================

async function onSubmitFuncionario(e) {
    e.preventDefault();

    const id = document.getElementById('funcionarioId').value || null;
    const nome = document.getElementById('funcNome').value.trim();
    const funcao = document.getElementById('funcFuncao').value;
    const documento = document.getElementById('funcDocumento').value.trim();
    const email = document.getElementById('funcEmail').value.trim().toLowerCase();
    const senha = document.getElementById('funcSenha').value;
    const telefone = document.getElementById('funcTelefone').value.trim();
    const pix = document.getElementById('funcPix').value.trim();
    const endereco = document.getElementById('funcEndereco').value.trim();

    const cnh = document.getElementById('funcCNH').value.trim();
    const validadeCNH = document.getElementById('funcValidadeCNH').value;
    const categoriaCNH = document.getElementById('funcCategoriaCNH').value;
    const cursoDesc = document.getElementById('funcCursoDescricao').value.trim();

    if (!nome || !funcao || !documento || !email) {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, collection, addDoc } = window.dbRef;

        let funcionarioId = id;

        const dataToSave = {
            nome,
            funcao,
            documento,
            email,
            telefone,
            pix,
            endereco,
            cnh,
            validadeCNH,
            categoriaCNH,
            cursoDesc,
            status: 'ATIVO',
            updatedAt: new Date().toISOString()
        };

        if (id) {
            // UPDATE FUNCIONÁRIO
            const funcRef = doc(db, 'companies', currentDomain, 'funcionarios', id);
            await updateDoc(funcRef, dataToSave);
        } else {
            // CRIAR FUNCIONÁRIO
            dataToSave.createdAt = new Date().toISOString();
            const funcRef = await addDoc(collection(db, 'companies', currentDomain, 'funcionarios'), dataToSave);
            funcionarioId = funcRef.id;
        }

        // CRIAR/ATUALIZAR USUÁRIO DE LOGIN SE TIVER SENHA
        if (!id && senha && senha.length >= 6) {
            // Novo funcionário + cria usuário de auth
            const uid = await window.dbRef.criarAuthUsuario(email, senha);
            const userRef = doc(db, 'users', uid);
            await setDoc(userRef, {
                uid,
                email,
                nome,
                role: funcao,
                domain: currentDomain,
                status: 'active',
                createdAt: new Date().toISOString()
            });
        } else if (id && senha && senha.length >= 6) {
            // Funcionário já existe e quer redefinir senha: apenas alerta para fazê-lo manualmente,
            // pois aqui não temos o UID do auth. (opcional melhorar depois)
            alert("Senha provisória informada, mas redefinição de senha via Auth não está ligada a este fluxo ainda.");
        }

        alert("✅ Funcionário salvo com sucesso!");
        document.getElementById('formFuncionario').reset();
        document.getElementById('funcionarioId').value = '';
        carregarFuncionariosAtivos();
        carregarFuncionariosBase();

    } catch (error) {
        console.error("Erro ao salvar funcionário:", error);
        alert("❌ Erro ao salvar funcionário. Verifique o console.");
    }
}

// EDITAR FUNCIONÁRIO
window.editarFuncionario = async function(funcionarioId) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'funcionarios', funcionarioId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Funcionário não encontrado.");
            return;
        }

        const f = snap.data();

        document.getElementById('funcionarioId').value = funcionarioId;
        document.getElementById('funcNome').value = f.nome || '';
        document.getElementById('funcFuncao').value = f.funcao || '';
        document.getElementById('funcDocumento').value = f.documento || '';
        document.getElementById('funcEmail').value = f.email || '';
        document.getElementById('funcTelefone').value = f.telefone || '';
        document.getElementById('funcPix').value = f.pix || '';
        document.getElementById('funcEndereco').value = f.endereco || '';
        document.getElementById('funcCNH').value = f.cnh || '';
        document.getElementById('funcValidadeCNH').value = f.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = f.cursoDesc || '';

        toggleDriverFields();

        // Ir para aba Funcionários
        showPage('cadastros');
        const tabBtns = document.querySelectorAll('.cadastro-tab-btn');
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === 'funcionarios');
        });
        const forms = document.querySelectorAll('.cadastro-form');
        forms.forEach(form => {
            form.classList.toggle('active', form.id === 'funcionarios');
        });

    } catch (error) {
        console.error("Erro ao editar funcionário:", error);
        alert("❌ Erro ao buscar dados do funcionário.");
    }
};

// EXCLUIR FUNCIONÁRIO (GANCHO PARA TIRAR DA LISTA DE ATIVOS)
// A lógica completa (incluindo remoção da LISTA DE FUNCIONÁRIOS ATIVOS
// e qualquer coleção auxiliar) será detalhada na PARTE 3.
window.excluirFuncionario = async function(funcionarioId, nome) {
    if (!confirm(`⚠️ Deseja realmente excluir o funcionário:\n${nome} ?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'funcionarios', funcionarioId);
        await deleteDoc(ref);

        // IMPORTANTE: Remover também da LISTA DE FUNCIONÁRIOS ATIVOS
        // e de qualquer outra estrutura relacionada (se houver) será
        // implementado na sequência (PARTE 3) juntamente com as
        // coleções auxiliares e listeners.

        alert("✅ Funcionário excluído com sucesso!");
        carregarFuncionariosAtivos();
        carregarFuncionariosBase();

    } catch (error) {
        console.error("Erro ao excluir funcionário:", error);
        alert("❌ Erro ao excluir funcionário. Verifique o console.");
    }
};

// Mostrar/ocultar campos específicos de motorista
window.toggleDriverFields = function() {
    const funcao = document.getElementById('funcFuncao').value;
    const driverFields = document.getElementById('driverSpecificFields');
    if (!driverFields) return;

    if (funcao === 'motorista') {
        driverFields.style.display = 'block';
    } else {
        driverFields.style.display = 'none';
    }
};

// ========================================
// FUNÇÕES COMUNS DE FORMATAÇÃO
// ========================================

function formatCurrency(value) {
    const num = Number(value || 0);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dateStr) {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
}

function formatDateTimeBR(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr;
    return d.toLocaleString('pt-BR');
}

// ========================================
// FIM DA PARTE 2/5
// ========================================
// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 3/5
// ========================================
// CRUD Veículos, Contratantes, Atividades,
// Despesas, Minha Empresa, Mensagens,
// e parte de Operações/Ajudantes
// ========================================

// ========================================
// CRUD VEÍCULOS
// ========================================

async function onSubmitVeiculo(e) {
    e.preventDefault();

    const id = document.getElementById('veiculoId').value || null;
    const placa = document.getElementById('veiculoPlaca').value.trim().toUpperCase();
    const modelo = document.getElementById('veiculoModelo').value.trim();
    const ano = document.getElementById('veiculoAno').value.trim();
    const renavam = document.getElementById('veiculoRenavam').value.trim();
    const chassi = document.getElementById('veiculoChassi').value.trim();

    if (!placa || !modelo) {
        alert("Preencha PLACA e MODELO.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, collection, addDoc } = window.dbRef;

        const dataToSave = {
            placa,
            modelo,
            ano,
            renavam,
            chassi,
            updatedAt: new Date().toISOString()
        };

        if (id) {
            const ref = doc(db, 'companies', currentDomain, 'veiculos', id);
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'companies', currentDomain, 'veiculos'), dataToSave);
        }

        alert("✅ Veículo salvo com sucesso!");
        document.getElementById('formVeiculo').reset();
        document.getElementById('veiculoId').value = '';
        await carregarVeiculosBase();
        await carregarListaVeiculosTabela();

    } catch (error) {
        console.error("Erro ao salvar veículo:", error);
        alert("❌ Erro ao salvar veículo. Verifique o console.");
    }
}

async function carregarListaVeiculosTabela() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'veiculos');
        const snap = await getDocs(ref);

        const tabela = document.getElementById('tabelaVeiculos').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        snap.forEach(docSnap => {
            const v = { id: docSnap.id, ...docSnap.data() };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${v.placa || '-'}</td>
                <td>${v.modelo || '-'}</td>
                <td>${v.ano || '-'}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarVeiculo('${v.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirVeiculo('${v.id}', '${v.placa || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar tabela de veículos:", error);
    }
}

window.editarVeiculo = async function(id) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'veiculos', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Veículo não encontrado.");
            return;
        }

        const v = snap.data();
        document.getElementById('veiculoId').value = id;
        document.getElementById('veiculoPlaca').value = v.placa || '';
        document.getElementById('veiculoModelo').value = v.modelo || '';
        document.getElementById('veiculoAno').value = v.ano || '';
        document.getElementById('veiculoRenavam').value = v.renavam || '';
        document.getElementById('veiculoChassi').value = v.chassi || '';

    } catch (error) {
        console.error("Erro ao editar veículo:", error);
        alert("❌ Erro ao buscar dados do veículo.");
    }
};

window.excluirVeiculo = async function(id, placa) {
    if (!confirm(`Excluir o veículo ${placa}?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'veiculos', id);
        await deleteDoc(ref);

        alert("✅ Veículo excluído com sucesso!");
        await carregarVeiculosBase();
        await carregarListaVeiculosTabela();

    } catch (error) {
        console.error("Erro ao excluir veículo:", error);
        alert("❌ Erro ao excluir veículo. Verifique o console.");
    }
};

// ========================================
// CRUD CONTRATANTES
// ========================================

async function onSubmitContratante(e) {
    e.preventDefault();

    const id = document.getElementById('contratanteId').value || null;
    const razaoSocial = document.getElementById('contratanteRazaoSocial').value.trim();
    const cnpj = document.getElementById('contratanteCNPJ').value.trim();
    const telefone = document.getElementById('contratanteTelefone').value.trim();

    if (!razaoSocial || !cnpj) {
        alert("Preencha RAZÃO SOCIAL e CNPJ.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, collection, addDoc } = window.dbRef;

        const dataToSave = {
            razaoSocial,
            cnpj,
            telefone,
            updatedAt: new Date().toISOString()
        };

        if (id) {
            const ref = doc(db, 'companies', currentDomain, 'contratantes', id);
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'companies', currentDomain, 'contratantes'), dataToSave);
        }

        alert("✅ Contratante salvo com sucesso!");
        document.getElementById('formContratante').reset();
        document.getElementById('contratanteId').value = '';
        await carregarContratantesBase();
        await carregarListaContratantesTabela();

    } catch (error) {
        console.error("Erro ao salvar contratante:", error);
        alert("❌ Erro ao salvar contratante. Verifique o console.");
    }
}

async function carregarListaContratantesTabela() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'contratantes');
        const snap = await getDocs(ref);

        const tabela = document.getElementById('tabelaContratantes').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        snap.forEach(docSnap => {
            const c = { id: docSnap.id, ...docSnap.data() };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.razaoSocial || '-'}</td>
                <td>${c.cnpj || '-'}</td>
                <td>${c.telefone || '-'}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarContratante('${c.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirContratante('${c.id}', '${c.razaoSocial || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar tabela de contratantes:", error);
    }
}

window.editarContratante = async function(id) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'contratantes', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Contratante não encontrado.");
            return;
        }

        const c = snap.data();
        document.getElementById('contratanteId').value = id;
        document.getElementById('contratanteRazaoSocial').value = c.razaoSocial || '';
        document.getElementById('contratanteCNPJ').value = c.cnpj || '';
        document.getElementById('contratanteTelefone').value = c.telefone || '';

    } catch (error) {
        console.error("Erro ao editar contratante:", error);
        alert("❌ Erro ao buscar dados do contratante.");
    }
};

window.excluirContratante = async function(id, nome) {
    if (!confirm(`Excluir o contratante ${nome}?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'contratantes', id);
        await deleteDoc(ref);

        alert("✅ Contratante excluído com sucesso!");
        await carregarContratantesBase();
        await carregarListaContratantesTabela();

    } catch (error) {
        console.error("Erro ao excluir contratante:", error);
        alert("❌ Erro ao excluir contratante. Verifique o console.");
    }
};

// ========================================
// CRUD ATIVIDADES
// ========================================

async function onSubmitAtividade(e) {
    e.preventDefault();

    const id = document.getElementById('atividadeId').value || null;
    const nome = document.getElementById('atividadeNome').value.trim();

    if (!nome) {
        alert("Informe o NOME DA ATIVIDADE.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, collection, addDoc } = window.dbRef;

        const dataToSave = {
            nome,
            updatedAt: new Date().toISOString()
        };

        if (id) {
            const ref = doc(db, 'companies', currentDomain, 'atividades', id);
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'companies', currentDomain, 'atividades'), dataToSave);
        }

        alert("✅ Atividade salva com sucesso!");
        document.getElementById('formAtividade').reset();
        document.getElementById('atividadeId').value = '';
        await carregarAtividadesBase();
        await carregarListaAtividadesTabela();

    } catch (error) {
        console.error("Erro ao salvar atividade:", error);
        alert("❌ Erro ao salvar atividade. Verifique o console.");
    }
}

async function carregarListaAtividadesTabela() {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'companies', currentDomain, 'atividades');
        const snap = await getDocs(ref);

        const tabela = document.getElementById('tabelaAtividades').querySelector('tbody');
        if (!tabela) return;
        tabela.innerHTML = '';

        snap.forEach(docSnap => {
            const a = { id: docSnap.id, ...docSnap.data() };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${a.id}</td>
                <td>${a.nome || '-'}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarAtividade('${a.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirAtividade('${a.id}', '${a.nome || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar tabela de atividades:", error);
    }
}

window.editarAtividade = async function(id) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'atividades', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Atividade não encontrada.");
            return;
        }

        const a = snap.data();
        document.getElementById('atividadeId').value = id;
        document.getElementById('atividadeNome').value = a.nome || '';

    } catch (error) {
        console.error("Erro ao editar atividade:", error);
        alert("❌ Erro ao buscar dados da atividade.");
    }
};

window.excluirAtividade = async function(id, nome) {
    if (!confirm(`Excluir a atividade ${nome}?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'atividades', id);
        await deleteDoc(ref);

        alert("✅ Atividade excluída com sucesso!");
        await carregarAtividadesBase();
        await carregarListaAtividadesTabela();

    } catch (error) {
        console.error("Erro ao excluir atividade:", error);
        alert("❌ Erro ao excluir atividade. Verifique o console.");
    }
};

// ========================================
// DESPESA GERAL
// ========================================

window.toggleDespesaParcelas = function() {
    const select = document.getElementById('despesaModoPagamento');
    const divParcelas = document.getElementById('divDespesaParcelas');
    if (!select || !divParcelas) return;

    if (select.value === 'parcelado') {
        divParcelas.style.display = 'flex';
    } else {
        divParcelas.style.display = 'none';
    }
};

async function onSubmitDespesaGeral(e) {
    e.preventDefault();

    const id = document.getElementById('despesaGeralId').value || null;
    const data = document.getElementById('despesaGeralData').value;
    const veiculoId = document.getElementById('selectVeiculoDespesaGeral').value;
    const descricao = document.getElementById('despesaGeralDescricao').value.trim();
    const valor = Number(document.getElementById('despesaGeralValor').value || 0);
    const formaPag = document.getElementById('despesaFormaPagamento').value;
    const modoPag = document.getElementById('despesaModoPagamento').value;

    if (!data || !descricao || !valor) {
        alert("Preencha DATA, DESCRIÇÃO e VALOR.");
        return;
    }

    const parcelas = modoPag === 'parcelado' ? Number(document.getElementById('despesaParcelas').value || 2) : 1;
    const intervaloDias = Number(document.getElementById('despesaIntervaloDias').value || 30);
    const parcelasPagas = Number(document.getElementById('despesaParcelasPagas').value || 0);

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, collection, addDoc } = window.dbRef;

        const dataToSave = {
            data,
            veiculoId: veiculoId || null,
            descricao,
            valor,
            formaPagamento: formaPag,
            modoPagamento: modoPag,
            parcelas,
            intervaloDias,
            parcelasPagas,
            status: parcelasPagas >= parcelas ? 'PAGO' : 'ABERTO',
            updatedAt: new Date().toISOString()
        };

        if (id) {
            const ref = doc(db, 'companies', currentDomain, 'despesas_gerais', id);
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'companies', currentDomain, 'despesas_gerais'), dataToSave);
        }

        alert("✅ Despesa salva com sucesso!");
        document.getElementById('formDespesaGeral').reset();
        document.getElementById('despesaGeralId').value = '';
        toggleDespesaParcelas();
        await carregarDespesasGerais();

    } catch (error) {
        console.error("Erro ao salvar despesa geral:", error);
        alert("❌ Erro ao salvar despesa. Verifique o console.");
    }
}

window.editarDespesaGeral = async function(id) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'despesas_gerais', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Despesa não encontrada.");
            return;
        }

        const d = snap.data();
        document.getElementById('despesaGeralId').value = id;
        document.getElementById('despesaGeralData').value = d.data || '';
        document.getElementById('selectVeiculoDespesaGeral').value = d.veiculoId || '';
        document.getElementById('despesaGeralDescricao').value = d.descricao || '';
        document.getElementById('despesaGeralValor').value = d.valor || 0;
        document.getElementById('despesaFormaPagamento').value = d.formaPagamento || 'dinheiro';
        document.getElementById('despesaModoPagamento').value = d.modoPagamento || 'avista';

        if (d.modoPagamento === 'parcelado') {
            document.getElementById('despesaParcelas').value = d.parcelas || 2;
            document.getElementById('despesaIntervaloDias').value = d.intervaloDias || 30;
            document.getElementById('despesaParcelasPagas').value = d.parcelasPagas || 0;
        }

        toggleDespesaParcelas();

    } catch (error) {
        console.error("Erro ao editar despesa:", error);
        alert("❌ Erro ao buscar dados da despesa.");
    }
};

window.excluirDespesaGeral = async function(id) {
    if (!confirm(`Excluir esta despesa definitivamente?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'despesas_gerais', id);
        await deleteDoc(ref);

        alert("✅ Despesa excluída com sucesso!");
        await carregarDespesasGerais();

    } catch (error) {
        console.error("Erro ao excluir despesa:", error);
        alert("❌ Erro ao excluir despesa. Verifique o console.");
    }
};

// ========================================
// MINHA EMPRESA
// ========================================

async function onSubmitMinhaEmpresa(e) {
    e.preventDefault();

    const razaoSocial = document.getElementById('minhaEmpresaRazaoSocial').value.trim();
    const cnpj = document.getElementById('minhaEmpresaCNPJ').value.trim();
    const telefone = document.getElementById('minhaEmpresaTelefone').value.trim();

    try {
        const db = window.dbRef.db;
        const { doc, setDoc, updateDoc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain);
        const snap = await getDoc(ref);

        const dataToSave = {
            razaoSocial,
            cnpj,
            telefone,
            updatedAt: new Date().toISOString()
        };

        if (snap.exists()) {
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            dataToSave.credits = 0;
            dataToSave.creditLifetime = false;
            dataToSave.creditValidUntil = null;
            await setDoc(ref, dataToSave);
        }

        alert("✅ Dados da empresa salvos com sucesso!");
        carregarMinhaEmpresaView();

    } catch (error) {
        console.error("Erro ao salvar dados da empresa:", error);
        alert("❌ Erro ao salvar dados da empresa. Verifique o console.");
    }
}

async function carregarMinhaEmpresaView() {
    const viewDiv = document.getElementById('viewMinhaEmpresaContent');
    if (!viewDiv || !currentDomain) return;

    viewDiv.innerHTML = 'Carregando dados...';

    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            viewDiv.innerHTML = '<p style="color:#999;">Nenhum dado cadastrado ainda.</p>';
            return;
        }

        const d = snap.data();

        document.getElementById('minhaEmpresaRazaoSocial').value = d.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = d.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = d.telefone || '';

        viewDiv.innerHTML = `
            <p><strong>Razão Social:</strong> ${d.razaoSocial || '-'}</p>
            <p><strong>CNPJ:</strong> ${d.cnpj || '-'}</p>
            <p><strong>Telefone:</strong> ${d.telefone || '-'}</p>
        `;

    } catch (error) {
        console.error("Erro ao carregar dados da empresa:", error);
        viewDiv.innerHTML = '<p style="color:red;">Erro ao carregar dados.</p>';
    }
}

// ========================================
// MENSAGENS PARA EQUIPE (ADMIN)
// ========================================

async function onSubmitAdminMessage(e) {
    e.preventDefault();

    const recipientId = document.getElementById('msgRecipientSelect').value;
    const messageText = document.getElementById('msgTextAdmin').value.trim();

    if (!messageText) {
        alert("Digite uma mensagem.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { collection, addDoc } = window.dbRef;

        const msgRef = collection(db, 'companies', currentDomain, 'messages');
        await addDoc(msgRef, {
            recipient: recipientId, // "all" ou id do funcionário
            text: messageText,
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.uid || null,
            createdByName: currentUser?.nome || currentUser?.email || 'Admin'
        });

        alert("✅ Mensagem enviada com sucesso!");
        document.getElementById('formAdminMessage').reset();

    } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        alert("❌ Erro ao enviar mensagem. Verifique o console.");
    }
}

// ========================================
// APROVAR / RECUSAR USUÁRIOS PENDENTES
// (ADMIN)
// ========================================

window.aprovarUsuarioPendentes = async function(uid) {
    if (!confirm("Aprovar o acesso deste usuário?")) return;

    try {
        const db = window.dbRef.db;
        const { doc, updateDoc } = window.dbRef;

        const ref = doc(db, 'users', uid);
        await updateDoc(ref, {
            status: 'active',
            approvedAt: new Date().toISOString()
        });

        alert("✅ Usuário aprovado com sucesso!");
        carregarPendentesAprovacao();

    } catch (error) {
        console.error("Erro ao aprovar usuário:", error);
        alert("❌ Erro ao aprovar usuário. Verifique o console.");
    }
};

window.recusarUsuarioPendentes = async function(uid) {
    if (!confirm("Recusar e excluir este usuário pendente?")) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'users', uid);
        await deleteDoc(ref);

        alert("✅ Usuário removido com sucesso!");
        carregarPendentesAprovacao();

    } catch (error) {
        console.error("Erro ao recusar usuário:", error);
        alert("❌ Erro ao recusar usuário. Verifique o console.");
    }
};

// ========================================
// AJUSTE: EXCLUSÃO DE FUNCIONÁRIO
// E REMOÇÃO DA LISTA DE ATIVOS
// ========================================
//
// OBS: A "LISTA DE FUNCIONÁRIOS ATIVOS" é alimentada
// diretamente pela coleção `companies/{domain}/funcionarios`.
// Ao excluir o documento, ele some da lista na próxima
// recarga (carregarFuncionariosAtivos).
//
// Se você tiver em outro ponto da aplicação uma
// "lista auxiliar" de ativos (ex: subcoleção ou campo
// em outro doc), ela deve ser ajustada AQUI usando
// batch ou updateDoc.
//
// Acima já estamos chamando:
//   - deleteDoc(funcionario)
//   - carregarFuncionariosAtivos()
//   - carregarFuncionariosBase()
// que garantem que a tabela e os selects sejam atualizados.
//
// Se quiser manter um campo "status" em vez de deletar
// definitivamente, bastaria trocar o delete por:
//   await updateDoc(ref, { status: 'INATIVO' });
// e ajustar o filtro em carregarFuncionariosAtivos()
// para trazer apenas status === 'ATIVO'.

// ========================================
// OPERAÇÕES & AJUDANTES - ESQUELETO
// (detalhes de check-in e financeiro
// virão na PARTE 4)
// ========================================

let equipeAjudantesSelecionados = [];

window.initOperacaoForm = function() {
    const btnManualAddAjudante = document.getElementById('btnManualAddAjudante');
    const selectAjudantes = document.getElementById('selectAjudantesOperacao');

    if (btnManualAddAjudante) {
        btnManualAddAjudante.onclick = () => {
            const selectedId = selectAjudantes.value;
            const selectedText = selectAjudantes.options[selectAjudantes.selectedIndex]?.text || '';
            if (!selectedId) {
                alert("Selecione um ajudante na lista.");
                return;
            }
            abrirModalAdicionarAjudante(selectedId, selectedText);
        };
    }
};

function abrirModalAdicionarAjudante(ajudanteId, ajudanteNome) {
    const modal = document.getElementById('modalAdicionarAjudante');
    const nomeElem = document.getElementById('modalAjudanteNome');
    const diariaInput = document.getElementById('modalDiariaInput');
    const btnConfirm = document.getElementById('modalAjudanteAddBtn');

    if (!modal || !nomeElem || !diariaInput || !btnConfirm) return;

    nomeElem.textContent = ajudanteNome;
    diariaInput.value = '';

    btnConfirm.onclick = () => {
        const diaria = Number(diariaInput.value || 0);
        if (diaria <= 0) {
            alert("Informe o valor da diária.");
            return;
        }

        equipeAjudantesSelecionados.push({
            id: ajudanteId,
            nome: ajudanteNome,
            diaria
        });

        atualizarListaAjudantesUI();
        closeAdicionarAjudanteModal();
    };

    modal.style.display = 'block';
}

window.closeAdicionarAjudanteModal = function() {
    const modal = document.getElementById('modalAdicionarAjudante');
    if (modal) modal.style.display = 'none';
};

function atualizarListaAjudantesUI() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;

    ul.innerHTML = '';

    equipeAjudantesSelecionados.forEach((aj, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            ${aj.nome} - ${formatCurrency(aj.diaria)}
            <button class="btn-danger btn-mini" style="margin-left:10px;" onclick="removerAjudante(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        ul.appendChild(li);
    });
}

window.removerAjudante = function(index) {
    equipeAjudantesSelecionados.splice(index, 1);
    atualizarListaAjudantesUI();
};

// ========================================
// FIM DA PARTE 3/5
// ========================================
// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 4/5
// ========================================
// Operações, Check-ins, Relatórios e Recibos
// ========================================

// ========================================
// OPERAÇÕES (LANÇAR / EDITAR / LISTAR)
// ========================================

async function onSubmitOperacao(e) {
    e.preventDefault();

    const id = document.getElementById('operacaoId').value || null;
    const data = document.getElementById('operData').value;
    const horario = document.getElementById('operHorario').value;
    const motoristaId = document.getElementById('selectMotoristaOperacao').value;
    const veiculoId = document.getElementById('selectVeiculoOperacao').value;
    const contratanteId = document.getElementById('selectContratanteOperacao').value;
    const atividadeId = document.getElementById('selectAtividadeOperacao').value;
    const localSaida = document.getElementById('operLocalSaida').value.trim();
    const localChegada = document.getElementById('operLocalChegada').value.trim();
    const observacoes = document.getElementById('operObservacoes').value.trim();

    const faturamento = Number(document.getElementById('operFaturamento').value || 0);
    const custosTotais = Number(document.getElementById('operCustosTotais').value || 0);
    const status = document.getElementById('operStatus').value || 'AGENDADO';

    if (!data || !motoristaId || !veiculoId || !contratanteId || !atividadeId) {
        alert("Preencha DATA, MOTORISTA, VEÍCULO, CONTRATANTE e ATIVIDADE.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, updateDoc, collection, addDoc, getDoc } = window.dbRef;

        // Carrega dados de referência para armazenar nomes/placas
        const motoristaInfo = await getRefData('funcionarios', motoristaId);
        const veiculoInfo = await getRefData('veiculos', veiculoId);
        const contratanteInfo = await getRefData('contratantes', contratanteId);
        const atividadeInfo = await getRefData('atividades', atividadeId);

        const dataToSave = {
            data,
            horario,
            motoristaId,
            motoristaNome: motoristaInfo?.nome || '',
            veiculoId,
            veiculoPlaca: veiculoInfo?.placa || '',
            contratanteId,
            contratanteNome: contratanteInfo?.razaoSocial || contratanteInfo?.nome || '',
            atividadeId,
            atividadeNome: atividadeInfo?.nome || '',
            localSaida,
            localChegada,
            observacoes,
            faturamento,
            custosTotais,
            status, // AGENDADO, EM_ANDAMENTO, CONCLUIDO, CANCELADO
            ajudantes: equipeAjudantesSelecionados.map(a => ({
                id: a.id,
                nome: a.nome,
                diaria: a.diaria
            })),
            updatedAt: new Date().toISOString()
        };

        if (id) {
            const ref = doc(db, 'companies', currentDomain, 'operacoes', id);
            await updateDoc(ref, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            const ref = await addDoc(collection(db, 'companies', currentDomain, 'operacoes'), dataToSave);
            // integração simples com "check-ins pendentes":
            await criarCheckinPendente(ref.id, data, horario, motoristaId, veiculoId);
        }

        alert("✅ Operação salva com sucesso!");
        document.getElementById('formOperacao').reset();
        document.getElementById('operacaoId').value = '';
        equipeAjudantesSelecionados = [];
        atualizarListaAjudantesUI();

        await carregarDashboardFinanceiro();
        await carregarCalendarioOperacoes();
        await carregarCheckinsPendentes();

    } catch (error) {
        console.error("Erro ao salvar operação:", error);
        alert("❌ Erro ao salvar operação. Verifique o console.");
    }
}

// Utilitário para buscar docs por ID em subcoleções da company
async function getRefData(collectionName, id) {
    if (!id) return null;

    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, collectionName, id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return snap.data();
    } catch (e) {
        console.error(`Erro ao buscar referência de ${collectionName}/${id}:`, e);
        return null;
    }
}

// Carregar operações em uma tabela (lista geral)
async function carregarListaOperacoesTabela() {
    const tabela = document.getElementById('tabelaOperacoes')?.querySelector('tbody');
    if (!tabela) return;

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, orderBy, query } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');
        // Caso queira ordenar por data:
        const q = query(ref, orderBy('data', 'desc'));
        const snap = await getDocs(q);

        tabela.innerHTML = '';
        allOperations = [];

        snap.forEach(docSnap => {
            const op = { id: docSnap.id, ...docSnap.data() };
            allOperations.push(op);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${op.data ? formatDateBR(op.data) : '-'}</td>
                <td>${op.motoristaNome || '-'}</td>
                <td>${op.veiculoPlaca || '-'}</td>
                <td>${op.contratanteNome || '-'}</td>
                <td>${op.atividadeNome || '-'}</td>
                <td>${formatCurrency(op.faturamento || 0)}</td>
                <td>${formatCurrency(op.custosTotais || 0)}</td>
                <td>${(op.status || 'N/A').toUpperCase()}</td>
                <td>
                    <button class="btn-primary btn-mini" onclick="editarOperacao('${op.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-mini" onclick="excluirOperacao('${op.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar lista de operações:", error);
    }
}

window.editarOperacao = async function(id) {
    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'operacoes', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Operação não encontrada.");
            return;
        }

        const op = snap.data();

        document.getElementById('operacaoId').value = id;
        document.getElementById('operData').value = op.data || '';
        document.getElementById('operHorario').value = op.horario || '';
        document.getElementById('selectMotoristaOperacao').value = op.motoristaId || '';
        document.getElementById('selectVeiculoOperacao').value = op.veiculoId || '';
        document.getElementById('selectContratanteOperacao').value = op.contratanteId || '';
        document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
        document.getElementById('operLocalSaida').value = op.localSaida || '';
        document.getElementById('operLocalChegada').value = op.localChegada || '';
        document.getElementById('operObservacoes').value = op.observacoes || '';
        document.getElementById('operFaturamento').value = op.faturamento || 0;
        document.getElementById('operCustosTotais').value = op.custosTotais || 0;
        document.getElementById('operStatus').value = op.status || 'AGENDADO';

        // Recarrega ajudantes da operação
        equipeAjudantesSelecionados = Array.isArray(op.ajudantes) ? op.ajudantes.map(a => ({
            id: a.id,
            nome: a.nome,
            diaria: a.diaria
        })) : [];
        atualizarListaAjudantesUI();

        // Vai para a página de operação, se houver
        showPage('lancar-operacao');

    } catch (error) {
        console.error("Erro ao editar operação:", error);
        alert("❌ Erro ao buscar dados da operação.");
    }
};

window.excluirOperacao = async function(id) {
    if (!confirm("Excluir esta operação definitivamente?")) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'operacoes', id);
        await deleteDoc(ref);

        // Também remover check-in pendente relacionado, se existir
        await excluirCheckinPorOperacao(id);

        alert("✅ Operação excluída com sucesso!");
        await carregarListaOperacoesTabela();
        await carregarDashboardFinanceiro();
        await carregarCalendarioOperacoes();
        await carregarCheckinsPendentes();

    } catch (error) {
        console.error("Erro ao excluir operação:", error);
        alert("❌ Erro ao excluir operação. Verifique o console.");
    }
};

// ========================================
// CHECK-INS (MONITORAMENTO)
// ========================================

// Cria registro de check-in pendente quando uma nova operação é lançada
async function criarCheckinPendente(operacaoId, data, horario, motoristaId, veiculoId) {
    try {
        const db = window.dbRef.db;
        const { collection, addDoc } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'checkins_pendentes');
        await addDoc(ref, {
            operacaoId,
            data,
            horarioPrevisto: horario || null,
            motoristaId,
            veiculoId,
            status: 'PENDENTE',
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Erro ao criar check-in pendente:", error);
    }
}

// Remove check-in pendente por operação (quando exclui operação ou conclui total)
async function excluirCheckinPorOperacao(operacaoId) {
    try {
        const db = window.dbRef.db;
        const { collection, getDocs, query, where, deleteDoc, doc } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'checkins_pendentes');
        const q = query(ref, where('operacaoId', '==', operacaoId));
        const snap = await getDocs(q);

        for (const d of snap.docs) {
            await deleteDoc(doc(db, 'companies', currentDomain, 'checkins_pendentes', d.id));
        }
    } catch (error) {
        console.error("Erro ao excluir check-ins da operação:", error);
    }
}

// Carregamento da tabela de MONITORAMENTO & CHECK-INS
async function carregarCheckinsPendentes() {
    const tabela = document.getElementById('tabelaCheckinsPendentes')?.querySelector('tbody');
    if (!tabela) return;

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, query, where } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'checkins_pendentes');
        const q = query(ref, where('status', '==', 'PENDENTE'));
        const snap = await getDocs(q);

        tabela.innerHTML = '';

        if (snap.empty) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align:center; color:#777;">Nenhum check-in pendente.</td>`;
            tabela.appendChild(tr);
            return;
        }

        for (const docSnap of snap.docs) {
            const c = { id: docSnap.id, ...docSnap.data() };

            const motoristaInfo = await getRefData('funcionarios', c.motoristaId);
            const veiculoInfo = await getRefData('veiculos', c.veiculoId);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.data ? formatDateBR(c.data) : '-'}</td>
                <td>${c.horarioPrevisto || '-'}</td>
                <td>${motoristaInfo?.nome || '-'}</td>
                <td>${veiculoInfo?.placa || '-'}</td>
                <td>${(c.status || 'PENDENTE').toUpperCase()}</td>
                <td>
                    <button class="btn-success btn-mini" onclick="confirmarCheckin('${c.id}', '${c.operacaoId || ''}')">
                        <i class="fas fa-check"></i> CHECK-IN
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        }

    } catch (error) {
        console.error("Erro ao carregar check-ins pendentes:", error);
    }
}

window.confirmarCheckin = async function(checkinId, operacaoId) {
    if (!confirm("Confirmar check-in desta operação?")) return;

    try {
        const db = window.dbRef.db;
        const { doc, updateDoc, deleteDoc } = window.dbRef;

        // marca check-in como concluído ou apaga
        const ref = doc(db, 'companies', currentDomain, 'checkins_pendentes', checkinId);
        await deleteDoc(ref);

        // opcional: atualizar status da operação para EM_ANDAMENTO
        if (operacaoId) {
            const opRef = doc(db, 'companies', currentDomain, 'operacoes', operacaoId);
            await updateDoc(opRef, {
                status: 'EM_ANDAMENTO',
                checkinConfirmadoEm: new Date().toISOString()
            });
        }

        alert("✅ Check-in confirmado com sucesso!");
        await carregarCheckinsPendentes();
        await carregarListaOperacoesTabela();
        await carregarCalendarioOperacoes();

    } catch (error) {
        console.error("Erro ao confirmar check-in:", error);
        alert("❌ Erro ao confirmar check-in. Verifique o console.");
    }
};

// ========================================
// RELATÓRIOS & FILTROS (ESQUELETO)
// ========================================

async function gerarRelatorioOperacoes() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const motoristaId = document.getElementById('selectMotoristaRelatorio').value;
    const veiculoId = document.getElementById('selectVeiculoRelatorio').value;
    const contratanteId = document.getElementById('selectContratanteRelatorio').value;
    const atividadeId = document.getElementById('selectAtividadeRelatorio').value;

    const tabela = document.getElementById('tabelaRelatorioOperacoes')?.querySelector('tbody');
    const resumo = document.getElementById('relatorioResumo');
    if (!tabela || !resumo) return;

    tabela.innerHTML = '';
    resumo.innerHTML = 'Gerando relatório...';

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, query, where } = window.dbRef;

        let ref = collection(db, 'companies', currentDomain, 'operacoes');

        // NOTA: Firestore não aceita N where-ineficientes; se houver complexidade
        // maior, será necessário montar filtros em memória. Aqui fazemos approach simples:
        const snap = await getDocs(ref);

        let totalFat = 0;
        let totalDesp = 0;
        let contador = 0;

        snap.forEach(docSnap => {
            const op = { id: docSnap.id, ...docSnap.data() };

            // filtros em memória
            if (dataInicio && op.data < dataInicio) return;
            if (dataFim && op.data > dataFim) return;
            if (motoristaId && op.motoristaId !== motoristaId) return;
            if (veiculoId && op.veiculoId !== veiculoId) return;
            if (contratanteId && op.contratanteId !== contratanteId) return;
            if (atividadeId && op.atividadeId !== atividadeId) return;

            contador++;
            totalFat += Number(op.faturamento || 0);
            totalDesp += Number(op.custosTotais || 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${op.data ? formatDateBR(op.data) : '-'}</td>
                <td>${op.motoristaNome || '-'}</td>
                <td>${op.veiculoPlaca || '-'}</td>
                <td>${op.contratanteNome || '-'}</td>
                <td>${op.atividadeNome || '-'}</td>
                <td>${formatCurrency(op.faturamento || 0)}</td>
                <td>${formatCurrency(op.custosTotais || 0)}</td>
                <td>${(op.status || 'N/A').toUpperCase()}</td>
            `;
            tabela.appendChild(tr);
        });

        const lucro = totalFat - totalDesp;
        resumo.innerHTML = `
            <p><strong>Operações:</strong> ${contador}</p>
            <p><strong>Faturamento Total:</strong> ${formatCurrency(totalFat)}</p>
            <p><strong>Custos Totais:</strong> ${formatCurrency(totalDesp)}</p>
            <p><strong>Lucro:</strong> ${formatCurrency(lucro)}</p>
        `;

    } catch (error) {
        console.error("Erro ao gerar relatório:", error);
        resumo.innerHTML = '<p style="color:red;">Erro ao gerar relatório.</p>';
    }
}

// ========================================
// RECIBOS (ESQUELETO BÁSICO)
// ========================================

async function carregarDadosParaRecibo() {
    const opSelect = document.getElementById('selectOperacaoRecibo');
    if (!opSelect) return;

    opSelect.innerHTML = '<option value="">Selecione uma operação...</option>';

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, query, where } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');
        const q = query(ref, where('status', '==', 'CONCLUIDO'));
        const snap = await getDocs(q);

        snap.forEach(docSnap => {
            const op = { id: docSnap.id, ...docSnap.data() };
            const label = `${op.data || ''} - ${op.motoristaNome || ''} - ${formatCurrency(op.faturamento || 0)}`;

            const opt = document.createElement('option');
            opt.value = op.id;
            opt.textContent = label;
            opSelect.appendChild(opt);
        });

    } catch (error) {
        console.error("Erro ao carregar operações para recibo:", error);
    }
}

async function gerarRecibo() {
    const opId = document.getElementById('selectOperacaoRecibo').value;
    const motoristaId = document.getElementById('selectMotoristaRecibo').value;

    if (!opId || !motoristaId) {
        alert("Selecione a operação e o motorista para gerar o recibo.");
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, getDoc } = window.dbRef;

        const opRef = doc(db, 'companies', currentDomain, 'operacoes', opId);
        const opSnap = await getDoc(opRef);
        if (!opSnap.exists()) {
            alert("Operação não encontrada.");
            return;
        }
        const op = opSnap.data();

        const funcRef = doc(db, 'companies', currentDomain, 'funcionarios', motoristaId);
        const funcSnap = await getDoc(funcRef);
        if (!funcSnap.exists()) {
            alert("Funcionário não encontrado.");
            return;
        }
        const f = funcSnap.data();

        // Aqui você pode montar o HTML de recibo em um modal ou nova janela.
        // Exemplo simples em um modal:
        const modal = document.getElementById('modalRecibo');
        const body = document.getElementById('modalReciboBody');

        if (!modal || !body) {
            alert("Estrutura de modal de recibo não encontrada.");
            return;
        }

        body.innerHTML = `
            <h3 style="margin-bottom:10px;">RECIBO DE PAGAMENTO - MOTORISTA</h3>
            <p><strong>Funcionário:</strong> ${f.nome || '-'}</p>
            <p><strong>Documento:</strong> ${f.documento || '-'}</p>
            <p><strong>Data da Operação:</strong> ${op.data ? formatDateBR(op.data) : '-'}</p>
            <p><strong>Atividade:</strong> ${op.atividadeNome || '-'}</p>
            <p><strong>Contratante:</strong> ${op.contratanteNome || '-'}</p>
            <p><strong>Valor Pago:</strong> ${formatCurrency( calcularDiariaMotorista(op, f) )}</p>
            <br/>
            <p>____________________________________</p>
            <p>Assinatura</p>
        `;

        modal.style.display = 'block';

    } catch (error) {
        console.error("Erro ao gerar recibo:", error);
        alert("❌ Erro ao gerar recibo. Verifique o console.");
    }
}

function calcularDiariaMotorista(op, funcionario) {
    // Aqui você define a regra de cálculo da diária para o motorista.
    // Pode ser: percentual do faturamento, valor fixo salvo no funcionário etc.
    // Por enquanto, retorno exemplo: 20% do faturamento.
    const fat = Number(op.faturamento || 0);
    return fat * 0.20;
}

window.closeReciboModal = function() {
    const modal = document.getElementById('modalRecibo');
    if (modal) modal.style.display = 'none';
};

// ========================================
// FIM DA PARTE 4/5
// ========================================
// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 5/5
// ========================================
// Autenticação, Roteamento por Perfil,
// Sistema de Créditos, Inicialização Geral
// ========================================

// ========================================
// LOGIN / LOGOUT
// ========================================

async function loginWithEmailPassword(email, password) {
    try {
        const auth = window.dbRef.auth;
        const { signInWithEmailAndPassword } = window.dbRef;

        const userCred = await signInWithEmailAndPassword(auth, email, password);
        return userCred.user;
    } catch (error) {
        console.error("Erro no login:", error);
        let msg = "Erro ao fazer login. Verifique e-mail e senha.";
        if (error.code === 'auth/user-not-found') msg = "Usuário não encontrado.";
        if (error.code === 'auth/wrong-password') msg = "Senha incorreta.";
        if (error.code === 'auth/too-many-requests') msg = "Muitas tentativas. Tente novamente mais tarde.";
        alert(msg);
        throw error;
    }
}

async function carregarDadosUsuarioLogado(uid) {
    const db = window.dbRef.db;
    const { doc, getDoc } = window.dbRef;

    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
        uid,
        ...data
    };
}

// Handler do botão de login (login.html → index.html)
async function handleLoginSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    if (!emailInput || !passInput) return;

    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value;

    if (!email || !password) {
        alert("Informe e-mail e senha.");
        return;
    }

    try {
        const userAuth = await loginWithEmailPassword(email, password);
        const userData = await carregarDadosUsuarioLogado(userAuth.uid);

        if (!userData) {
            alert("Conta de usuário não configurada no banco de dados.");
            return;
        }

        currentUser = userData;
        currentDomain = userData.domain || null;

        if (!currentDomain) {
            alert("Usuário sem domínio configurado. Contate o suporte.");
            return;
        }

        // Verifica créditos da empresa ANTES de abrir o painel
        const creditStatus = await verificarCreditosEmpresa(currentDomain);
        if (!creditStatus.isActive && !creditStatus.lifetime) {
            // verificarCreditosEmpresa já exibe bloqueio e faz signOut.
            return;
        }

        // Se for ADMIN, exibe validade de créditos de forma discreta
        if (userData.role === 'admin') {
            exibirValidadeCreditosAdmin(creditStatus);
        }

        // Redireciona para index.html (ou mostra painel, se já estiver nele)
        if (window.location.pathname.toLowerCase().includes('login.html')) {
            window.location.href = 'index.html';
        } else {
            // Se já estiver no index (ex: refresh), apenas roteia
            await roteamentoPosLogin(userData);
        }

    } catch (error) {
        console.error("Falha no processo de login:", error);
        // alert já foi exibido dentro de loginWithEmailPassword ou verificarCreditosEmpresa
    }
}

window.handleLoginSubmit = handleLoginSubmit;

// LOGOUT
window.handleLogout = async function() {
    try {
        const auth = window.dbRef.auth;
        const { signOut } = window.dbRef;

        await signOut(auth);
        currentUser = null;
        currentDomain = null;

        // Voltar para tela de login
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        alert("❌ Erro ao fazer logout. Verifique o console.");
    }
};

// ========================================
// SISTEMA DE CRÉDITOS - INTEGRAÇÃO LOGIN
// (Funções base foram criadas na PARTE 1)
// ========================================
//
// verificarCreditosEmpresa(domain):
//    - busca o doc de companies/{domain}
//    - verifica creditLifetime ou creditValidUntil
//    - se expirado, bloqueia todos os usuários da empresa
//      e impede o uso do sistema.
//    - retorna objeto { isActive, lifetime, validUntil, raw }
//
// exibirValidadeCreditosAdmin(creditStatus):
//    - exibe, no painel do admin, a informação de
//      validade de créditos de forma discreta.
//
// Aqui, apenas garantimos que TUDO passe por
// verificarCreditosEmpresa antes de carregar o painel.

// ========================================
// ROTEAMENTO POR PERFIL
// ========================================

async function roteamentoPosLogin(userData) {
    if (!userData) return;
    const role = (userData.role || '').toLowerCase();

    // Exibe nome no topo/side
    const nomeSpan = document.getElementById('userNameDisplay');
    if (nomeSpan) nomeSpan.textContent = userData.nome || userData.email || 'Usuário';

    // Zera menus
    showMenu(null);
    showPage(null);

    if (role === 'super_admin' || role === 'superadmin') {
        await inicializarSuperAdmin(userData);
    } else if (role === 'admin') {
        await inicializarAdmin(userData);
    } else if (role === 'motorista') {
        await inicializarMotorista(userData);
    } else if (role === 'ajudante') {
        await inicializarAjudante(userData);
    } else {
        alert("Perfil de usuário não reconhecido. Contate o administrador.");
    }
}

// Inicialização SUPER ADMIN
async function inicializarSuperAdmin(userData) {
    showMenu('menu-super-admin');
    showPage('super-admin-dashboard');

    await carregarPainelSuperAdmin(true); // função definida na Parte 1

    // Exibir info no topo
    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Super Admin';
}

// Inicialização ADMIN
async function inicializarAdmin(userData) {
    showMenu('menu-admin');
    showPage('dashboard');

    // Role display
    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Admin';

    // Carregar dados de empresa, cadastros e telas
    await carregarDadosAdmin();
    await carregarListaVeiculosTabela();
    await carregarListaContratantesTabela();
    await carregarListaAtividadesTabela();
    await carregarListaOperacoesTabela();
    await carregarCheckinsPendentes();
    await carregarDadosParaRecibo();

    iniciarListenersAdmin();
    inicializarNavegacao();
    inicializarMobileMenu();
    initOperacaoForm();
}

// Inicialização MOTORISTA
async function inicializarMotorista(userData) {
    showMenu('menu-employee');
    showPage('employee-dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Motorista';

    // Aqui você pode carregar:
    // - Minhas operações (onde motoristaId == currentUser.uid ou funcionarioId vinculado)
    // - Minhas mensagens
    await carregarPainelFuncionario(userData);
}

// Inicialização AJUDANTE
async function inicializarAjudante(userData) {
    showMenu('menu-employee');
    showPage('employee-dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Ajudante';

    await carregarPainelFuncionario(userData);
}

// Painel genérico do funcionário (motorista/ajudante)
async function carregarPainelFuncionario(userData) {
    const listaOps = document.getElementById('listaOperacoesFuncionario');
    if (!listaOps) return;

    listaOps.innerHTML = 'Carregando...';

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, query, where } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');

        // Caso você tenha salvo qual é o "funcionarioId" no user:
        const funcionarioId = userData.funcionarioId || null;

        const snap = await getDocs(ref);
        let html = '';

        snap.forEach(docSnap => {
            const op = { id: docSnap.id, ...docSnap.data() };

            const isMotoristaDaOp = (op.motoristaId === funcionarioId);
            const isAjudanteDaOp = Array.isArray(op.ajudantes) && op.ajudantes.some(a => a.id === funcionarioId);

            if (!isMotoristaDaOp && !isAjudanteDaOp) return;

            html += `
                <div class="func-op-card">
                    <div class="func-op-header">
                        <span>${op.data ? formatDateBR(op.data) : '-'}</span>
                        <span class="tag-status ${op.status || 'N/A'}">${(op.status || 'N/A').toUpperCase()}</span>
                    </div>
                    <div class="func-op-body">
                        <p><strong>Atividade:</strong> ${op.atividadeNome || '-'}</p>
                        <p><strong>Contratante:</strong> ${op.contratanteNome || '-'}</p>
                        <p><strong>Saída:</strong> ${op.localSaida || '-'}</p>
                        <p><strong>Chegada:</strong> ${op.localChegada || '-'}</p>
                    </div>
                </div>
            `;
        });

        if (!html) {
            html = '<p style="color:#777;">Nenhuma operação vinculada a você.</p>';
        }

        listaOps.innerHTML = html;

    } catch (error) {
        console.error("Erro ao carregar painel do funcionário:", error);
        listaOps.innerHTML = '<p style="color:red;">Erro ao carregar operações.</p>';
    }
}

// ========================================
// OBSERVADOR DE AUTENTICAÇÃO (AUTO LOGIN)
// ========================================

function inicializarAuthObserver() {
    const auth = window.dbRef.auth;
    const { onAuthStateChanged } = window.dbRef;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Se estiver na index e usuário não logado, manda para login
            if (window.location.pathname.toLowerCase().includes('index.html')) {
                window.location.href = 'login.html';
            }
            return;
        }

        try {
            const userData = await carregarDadosUsuarioLogado(user.uid);
            if (!userData) {
                // Sem documento em /users
                await handleLogout();
                return;
            }

            currentUser = userData;
            currentDomain = userData.domain || null;

            if (!currentDomain) {
                alert("Usuário sem domínio configurado. Contate o suporte.");
                await handleLogout();
                return;
            }

            // Verifica créditos antes de carregar qualquer painel
            const creditStatus = await verificarCreditosEmpresa(currentDomain);
            if (!creditStatus.isActive && !creditStatus.lifetime) {
                return; // verificarCreditosEmpresa já bloqueou
            }

            if (userData.role === 'admin') {
                exibirValidadeCreditosAdmin(creditStatus);
            }

            // Se já está no index.html, roteia pro painel.
            // Se está em login.html e já logado, manda para index.
            const path = window.location.pathname.toLowerCase();
            if (path.includes('login.html')) {
                window.location.href = 'index.html';
            } else {
                await roteamentoPosLogin(userData);
            }

        } catch (error) {
            console.error("Erro no observer de autenticação:", error);
        }
    });
}

// ========================================
// HANDLERS GERAIS DE UI
// ========================================

function inicializarHandlersUI() {
    // Botão logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Botão gerar relatório
    const btnRel = document.getElementById('btnGerarRelatorio');
    if (btnRel) {
        btnRel.addEventListener('click', gerarRelatorioOperacoes);
    }

    // Botão gerar recibo
    const btnRecibo = document.getElementById('btnGerarRecibo');
    if (btnRecibo) {
        btnRecibo.addEventListener('click', gerarRecibo);
    }

    // Fechar modal de recibo (botão X)
    const closeRecibo = document.getElementById('closeReciboModalBtn');
    if (closeRecibo) {
        closeRecibo.addEventListener('click', closeReciboModal);
    }

    // Fechar modal operações do dia
    const closeDayModal = document.getElementById('closeDayOperationsModalBtn');
    if (closeDayModal) {
        closeDayModal.addEventListener('click', () => {
            const modal = document.getElementById('modalDayOperations');
            if (modal) modal.style.display = 'none';
        });
    }

    // Fecha modais ao clicar no fundo (se desejar)
    window.addEventListener('click', (e) => {
        const modRec = document.getElementById('modalRecibo');
        const modAjud = document.getElementById('modalAdicionarAjudante');
        const modOpsDia = document.getElementById('modalDayOperations');

        if (e.target === modRec) closeReciboModal();
        if (e.target === modAjud) closeAdicionarAjudanteModal();
        if (e.target === modOpsDia && modOpsDia) modOpsDia.style.display = 'none';
    });
}

// ========================================
// INICIALIZAÇÃO GERAL
// ========================================

window.addEventListener('load', () => {
    try {
        // Verifica se estamos na TELA DE LOGIN
        const isLoginPage = window.location.pathname.toLowerCase().includes('login.html');

        if (isLoginPage) {
            // bind do submit do form de login
            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
        } else {
            // Estamos no index.html (painel)
            inicializarAuthObserver();
            inicializarHandlersUI();
            inicializarNavegacao();
            inicializarMobileMenu();
        }

    } catch (error) {
        console.error("Erro na inicialização geral:", error);
    }
});

// ========================================
// FIM DO SCRIPT.JS - LOGIMASTER V22.0
// ========================================