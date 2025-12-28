// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 1/5
// Globais, Sistema de Créditos e Super Admin
// ========================================

// Variáveis globais
let currentUser = null;
let currentDomain = null;

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// Caches em memória
let allOperations = [];
let allDespesas = [];
let globalCompaniesCache = [];
let globalUsersCache = [];

// ----------------------------------------
// SISTEMA DE CRÉDITOS POR EMPRESA
// ----------------------------------------
// Regra: TODAS as empresas/domínios precisam de créditos
// ou "vitalício", EXCETO o SUPER ADMIN, que é SEMPRE
// vitalício de natureza e nunca é bloqueado.

// domain: string (id do doc em 'companies')
// role: papel do usuário logado ("super_admin", "admin", etc.)
async function verificarCreditosEmpresa(domain, role = null) {
    const db = window.dbRef.db;
    const { doc, getDoc } = window.dbRef;

    // SUPER ADMIN: nunca é bloqueado por crédito
    if (role && role.toLowerCase().includes('super')) {
        return {
            isActive: true,
            lifetime: true,
            validUntil: null,
            raw: null
        };
    }

    try {
        const companyRef = doc(db, 'companies', domain);
        const snap = await getDoc(companyRef);

        if (!snap.exists()) {
            alert("Empresa não encontrada. Contate o suporte.");
            return {
                isActive: false,
                lifetime: false,
                validUntil: null,
                raw: null
            };
        }

        const data = snap.data();
        const lifetime = !!data.creditLifetime;
        const validUntil = data.creditValidUntil ? new Date(data.creditValidUntil) : null;

        let isActive = false;

        if (lifetime) {
            isActive = true;
        } else {
            const today = new Date();
            const hojeSemHora = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            if (validUntil && validUntil >= hojeSemHora) {
                isActive = true;
            }
        }

        if (!isActive) {
            // Bloqueia acesso de qualquer usuário NÃO-superadmin
            alert("Os créditos da sua empresa expiraram. Contate o administrador para renovar.");
            try {
                const auth = window.dbRef.auth;
                const { signOut } = window.dbRef;
                await signOut(auth);
            } catch (e) {
                console.error("Erro ao realizar signOut após expiração de créditos:", e);
            }
        }

        return {
            isActive,
            lifetime,
            validUntil,
            raw: data
        };

    } catch (error) {
        console.error("Erro ao verificar créditos da empresa:", error);
        alert("Erro ao verificar créditos da empresa. Contate o suporte.");
        return {
            isActive: false,
            lifetime: false,
            validUntil: null,
            raw: null
        };
    }
}

// Exibir validade de créditos discretamente no painel do ADMIN
function exibirValidadeCreditosAdmin(creditStatus) {
    const div = document.getElementById('creditValidityDisplay');
    if (!div) return;

    if (creditStatus.lifetime) {
        div.textContent = "Plano: VITALÍCIO";
        div.className = 'credit-info-display tag-lifetime';
        return;
    }

    if (!creditStatus.validUntil) {
        div.textContent = "Sem créditos ativos";
        div.className = 'credit-info-display tag-expired';
        return;
    }

    const d = creditStatus.validUntil;
    const dataStr = d.toLocaleDateString('pt-BR');
    div.textContent = `Créditos válidos até: ${dataStr}`;

    const today = new Date();
    const hojeSemHora = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (d < hojeSemHora) {
        div.className = 'credit-info-display tag-expired';
    } else {
        div.className = 'credit-info-display tag-active';
    }
}

// ----------------------------------------
// PAINEL SUPER ADMIN - CARREGAR DADOS
// ----------------------------------------

async function carregarPainelSuperAdmin(forceReload = false) {
    const db = window.dbRef.db;
    const { collection, getDocs } = window.dbRef;

    try {
        const loading = document.getElementById('superAdminLoading');
        if (loading) loading.style.display = 'block';

        if (!forceReload && globalCompaniesCache.length > 0 && globalUsersCache.length > 0) {
            renderizarPainelSuperAdmin();
            if (loading) loading.style.display = 'none';
            return;
        }

        // Carregar empresas
        const compRef = collection(db, 'companies');
        const compSnap = await getDocs(compRef);

        globalCompaniesCache = [];
        compSnap.forEach(docSnap => {
            globalCompaniesCache.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Carregar todos os usuários
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);

        globalUsersCache = [];
        usersSnap.forEach(docSnap => {
            globalUsersCache.push({
                uid: docSnap.id,
                ...docSnap.data()
            });
        });

        renderizarPainelSuperAdmin();
        if (loading) loading.style.display = 'none';

    } catch (error) {
        console.error("Erro ao carregar painel do Super Admin:", error);
        const container = document.getElementById('superAdminCompaniesContainer');
        if (container) {
            container.innerHTML = '<p style="color:red;">Erro ao carregar dados. Verifique o console.</p>';
        }
    }
}

// Renderizar painel do Super Admin (lista de empresas + usuários)
function renderizarPainelSuperAdmin(filterTerm = '') {
    const container = document.getElementById('superAdminCompaniesContainer');
    if (!container) return;

    const termo = (filterTerm || '').trim().toLowerCase();
    container.innerHTML = '';

    if (!globalCompaniesCache.length) {
        container.innerHTML = '<p style="color:#777;">Nenhuma empresa cadastrada.</p>';
        return;
    }

    globalCompaniesCache.forEach(company => {
        const domain = company.id;
        const razao = company.razaoSocial || domain;
        const cnpj = company.cnpj || '-';

        // Determinar status de créditos
        const lifetime = !!company.creditLifetime;
        const validUntil = company.creditValidUntil ? new Date(company.creditValidUntil) : null;

        let creditStatusLabel = '';
        let creditStatusClass = 'credit-status-tag';

        if (lifetime) {
            creditStatusLabel = 'VITALÍCIO';
            creditStatusClass += ' tag-lifetime';
        } else if (validUntil) {
            const today = new Date();
            const hojeSemHora = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            if (validUntil >= hojeSemHora) {
                creditStatusLabel = `Ativo até ${validUntil.toLocaleDateString('pt-BR')}`;
                creditStatusClass += ' tag-active';
            } else {
                creditStatusLabel = `Expirado em ${validUntil.toLocaleDateString('pt-BR')}`;
                creditStatusClass += ' tag-expired';
            }
        } else {
            creditStatusLabel = 'Sem créditos';
            creditStatusClass += ' tag-expired';
        }

        // Filtrar empresa/usuários pelo termo
        const usersDaEmpresa = globalUsersCache.filter(u => u.domain === domain);
        const textoBuscaEmpresa = `${razao} ${cnpj} ${domain}`.toLowerCase();
        const textoBuscaUsuarios = usersDaEmpresa.map(u =>
            `${u.nome || ''} ${u.email || ''} ${u.role || ''}`
        ).join(' ').toLowerCase();

        if (termo &&
            !textoBuscaEmpresa.includes(termo) &&
            !textoBuscaUsuarios.includes(termo)) {
            return;
        }

        // Montar HTML
        const card = document.createElement('div');
        card.className = 'credit-management-box';

        card.innerHTML = `
            <div class="credit-box-header">
                <div>
                    <h3>${razao}</h3>
                    <p>Domínio: <strong>${domain}</strong></p>
                    <p>CNPJ: <strong>${cnpj}</strong></p>
                </div>
                <div class="credit-box-status">
                    <span class="${creditStatusClass}">${creditStatusLabel}</span>
                </div>
            </div>
            <div class="credit-box-body">
                <div class="credit-actions">
                    <label>Gerenciar créditos:</label>
                    <div class="credit-actions-row">
                        <input type="number" id="creditsInput_${domain}" min="1" placeholder="Qtd créditos (30 dias)" />
                        <button class="btn-primary btn-mini" onclick="adicionarCreditos('${domain}')">
                            + ADICIONAR
                        </button>
                    </div>
                    <div class="credit-actions-row">
                        <label class="checkbox-inline">
                            <input type="checkbox" id="lifetimeCheckbox_${domain}" onchange="toggleLifetimeCredit('${domain}', this.checked)" ${lifetime ? 'checked' : ''}/>
                            VITALÍCIO
                        </label>
                    </div>
                </div>
                <div class="credit-users-list">
                    <h4>Usuários deste domínio</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Função</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersDaEmpresa.map(u => `
                                <tr>
                                    <td>${u.nome || '-'}</td>
                                    <td>${u.email || '-'}</td>
                                    <td>${(u.role || '-').toUpperCase()}</td>
                                    <td>${(u.status || 'active').toUpperCase()}</td>
                                    <td>
                                        <button class="btn-danger btn-mini" onclick="excluirUsuarioGlobal('${u.uid}', '${u.email || ''}')">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || `
                                <tr>
                                    <td colspan="5" style="text-align:center; color:#777;">
                                        Nenhum usuário vinculado.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// ----------------------------------------
// SUPER ADMIN - AÇÕES DE CRÉDITO
// ----------------------------------------

// Adiciona créditos (cada crédito = 30 dias)
window.adicionarCreditos = async function(domain) {
    const input = document.getElementById(`creditsInput_${domain}`);
    if (!input) {
        alert("Campo de créditos não encontrado.");
        return;
    }

    const qtd = Number(input.value || 0);
    if (!qtd || qtd <= 0) {
        alert("Informe a quantidade de créditos (cada 1 = 30 dias).");
        return;
    }

    if (!confirm(`Adicionar ${qtd} crédito(s) para o domínio ${domain}?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, getDoc, updateDoc } = window.dbRef;

        const ref = doc(db, 'companies', domain);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            alert("Empresa não encontrada.");
            return;
        }

        const data = snap.data();
        const hoje = new Date();
        const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        let baseDate = hojeSemHora;

        if (data.creditValidUntil) {
            const atual = new Date(data.creditValidUntil);
            if (atual >= hojeSemHora) {
                baseDate = atual;
            }
        }

        const diasAdicionar = qtd * 30;
        const novaData = new Date(baseDate);
        novaData.setDate(novaData.getDate() + diasAdicionar);

        await updateDoc(ref, {
            credits: Number(data.credits || 0) + qtd,
            creditValidUntil: novaData.toISOString().substring(0, 10), // yyyy-MM-dd
            creditLifetime: !!data.creditLifetime // mantém flag
        });

        alert("✅ Créditos adicionados com sucesso!");
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("Erro ao adicionar créditos:", error);
        alert("❌ Erro ao adicionar créditos. Verifique o console.");
    }
};

// Liga/desliga modo vitalício
window.toggleLifetimeCredit = async function(domain, isLifetime) {
    if (!confirm(`Deseja realmente ${isLifetime ? 'ATIVAR' : 'DESATIVAR'} o modo VITALÍCIO para ${domain}?`)) {
        // se usuário desistiu, recarrega painel para voltar checkbox
        await carregarPainelSuperAdmin(true);
        return;
    }

    try {
        const db = window.dbRef.db;
        const { doc, updateDoc } = window.dbRef;

        const ref = doc(db, 'companies', domain);
        await updateDoc(ref, {
            creditLifetime: isLifetime
        });

        alert("✅ Configuração de vitalício atualizada!");
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("Erro ao atualizar vitalício:", error);
        alert("❌ Erro ao atualizar modo vitalício. Verifique o console.");
    }
};

// Excluir usuário globalmente (apenas doc em /users)
window.excluirUsuarioGlobal = async function(uid, email) {
    if (!confirm(`Excluir permanentemente o usuário:\n${email}?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'users', uid);
        await deleteDoc(ref);

        alert("✅ Usuário excluído com sucesso!");
        await carregarPainelSuperAdmin(true);

    } catch (error) {
        console.error("Erro ao excluir usuário global:", error);
        alert("❌ Erro ao excluir usuário. Verifique o console.");
    }
};

// Filtro de busca (Super Admin)
window.filterGlobalUsers = function() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;
    const termo = input.value || '';
    renderizarPainelSuperAdmin(termo);
};

// ========================================
// FIM DA PARTE 1/5
// ========================================
// ========================================
// LOGIMASTER V22.0 - SCRIPT.JS - PARTE 2/5
// Navegação, Dashboard Admin, Funcionários
// ========================================

// ----------------------------------------
// NAVEGAÇÃO ENTRE PÁGINAS
// ----------------------------------------

function showMenu(menuId) {
    const menus = ['menu-admin', 'menu-super-admin', 'menu-employee'];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!menuId) {
            el.style.display = 'none';
        } else {
            el.style.display = (id === menuId) ? 'block' : 'none';
        }
    });
}

function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        if (!pageId) {
            page.style.display = 'none';
        } else {
            page.style.display = (page.id === pageId) ? 'block' : 'none';
        }
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

// ----------------------------------------
// MENU MOBILE
// ----------------------------------------

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

// ----------------------------------------
// CARREGAMENTO DE DADOS PARA ADMIN
// ----------------------------------------

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

    const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    weekDays.forEach(dia => {
        const cell = document.createElement('div');
        cell.className = 'calendar-header-cell';
        cell.textContent = dia;
        grid.appendChild(cell);
    });

    for (let i = 0; i < startWeekDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        grid.appendChild(emptyCell);
    }

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

// ----------------------------------------
// CADASTROS INICIAIS (ADMIN)
// ----------------------------------------

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

    if (!currentDomain) return;

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
    if (!currentDomain) return;

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
    if (!currentDomain) return;

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
    if (!currentDomain) return;

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

// ----------------------------------------
// PENDENTES, ATIVOS E DESPESAS (ADMIN)
// ----------------------------------------

async function carregarPendentesAprovacao() {
    const db = window.dbRef.db;
    const { collection, query, where, getDocs } = window.dbRef;

    try {
        const ref = collection(db, 'users');
        const q = query(ref, where('domain', '==', currentDomain), where('status', '==', 'pending'));
        const snap = await getDocs(q);

        const tabela = document.getElementById('tabelaCompanyPendentes')?.querySelector('tbody');
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

        const tabela = document.getElementById('tabelaCompanyAtivos')?.querySelector('tbody');
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

        const tabela = document.getElementById('tabelaDespesasGerais')?.querySelector('tbody');
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
    // Placeholder para badge em "EQUIPE & AVISOS"
}

// ----------------------------------------
// LISTENERS DO ADMIN (FORMULÁRIOS BÁSICOS)
// ----------------------------------------

function iniciarListenersAdmin() {
    const formFuncionario = document.getElementById('formFuncionario');
    if (formFuncionario) formFuncionario.addEventListener('submit', onSubmitFuncionario);

    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) formVeiculo.addEventListener('submit', onSubmitVeiculo);

    const formContratante = document.getElementById('formContratante');
    if (formContratante) formContratante.addEventListener('submit', onSubmitContratante);

    const formAtividade = document.getElementById('formAtividade');
    if (formAtividade) formAtividade.addEventListener('submit', onSubmitAtividade);

    const formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) formDespesa.addEventListener('submit', onSubmitDespesaGeral);

    const formEmpresa = document.getElementById('formMinhaEmpresa');
    if (formEmpresa) {
        formEmpresa.addEventListener('submit', onSubmitMinhaEmpresa);
        carregarMinhaEmpresaView();
    }

    const formMsg = document.getElementById('formAdminMessage');
    if (formMsg) formMsg.addEventListener('submit', onSubmitAdminMessage);
}

// ----------------------------------------
// FUNCIONÁRIO - CRUD
// ----------------------------------------

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
            const funcRef = doc(db, 'companies', currentDomain, 'funcionarios', id);
            await updateDoc(funcRef, dataToSave);
        } else {
            dataToSave.createdAt = new Date().toISOString();
            const funcRef = await addDoc(collection(db, 'companies', currentDomain, 'funcionarios'), dataToSave);
            funcionarioId = funcRef.id;
        }

        // Cria usuário de login se for novo e tiver senha
        if (!id && senha && senha.length >= 6) {
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
            alert("Senha informada, mas redefinição via Auth não está automatizada neste fluxo.");
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

window.excluirFuncionario = async function(funcionarioId, nome) {
    if (!confirm(`⚠️ Deseja realmente excluir o funcionário:\n${nome} ?`)) return;

    try {
        const db = window.dbRef.db;
        const { doc, deleteDoc } = window.dbRef;

        const ref = doc(db, 'companies', currentDomain, 'funcionarios', funcionarioId);
        await deleteDoc(ref);

        // Como a "LISTA DE FUNCIONÁRIOS ATIVOS" é baseada
        // diretamente nesta coleção, ao deletar o doc
        // e recarregar, ele some automaticamente.
        alert("✅ Funcionário excluído com sucesso!");
        carregarFuncionariosAtivos();
        carregarFuncionariosBase();

    } catch (error) {
        console.error("Erro ao excluir funcionário:", error);
        alert("❌ Erro ao excluir funcionário. Verifique o console.");
    }
};

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

// ----------------------------------------
// FUNÇÕES COMUNS DE FORMATAÇÃO
// ----------------------------------------

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
// Veículos, Contratantes, Atividades,
// Despesas, Minha Empresa, Mensagens,
// e Ajudantes na Operação
// ========================================

// ----------------------------------------
// CRUD VEÍCULOS
// ----------------------------------------

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
        const { doc, updateDoc, collection, addDoc } = window.dbRef;

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

        const tabela = document.getElementById('tabelaVeiculos')?.querySelector('tbody');
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

// ----------------------------------------
// CRUD CONTRATANTES
// ----------------------------------------

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
        const { doc, updateDoc, collection, addDoc } = window.dbRef;

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

        const tabela = document.getElementById('tabelaContratantes')?.querySelector('tbody');
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

// ----------------------------------------
// CRUD ATIVIDADES
// ----------------------------------------

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
        const { doc, updateDoc, collection, addDoc } = window.dbRef;

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

        const tabela = document.getElementById('tabelaAtividades')?.querySelector('tbody');
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

// ----------------------------------------
// DESPESA GERAL
// ----------------------------------------

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
        const { doc, updateDoc, collection, addDoc } = window.dbRef;

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

// ----------------------------------------
// MINHA EMPRESA
// ----------------------------------------

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

// ----------------------------------------
// MENSAGENS PARA EQUIPE (ADMIN)
// ----------------------------------------

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

// ----------------------------------------
// APROVAR / RECUSAR USUÁRIOS PENDENTES
// ----------------------------------------

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

// ----------------------------------------
// AJUDANTES NA OPERAÇÃO
// ----------------------------------------

let equipeAjudantesSelecionados = [];

window.initOperacaoForm = function() {
    const btnManualAddAjudante = document.getElementById('btnManualAddAjudante');
    const selectAjudantes = document.getElementById('selectAjudantesOperacao');

    if (btnManualAddAjudante && selectAjudantes) {
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
// Operações, Check-ins, Relatórios, Recibos
// ========================================

// ----------------------------------------
// OPERAÇÕES (LANÇAR / EDITAR / LISTAR)
// ----------------------------------------

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
        const { doc, updateDoc, collection, addDoc } = window.dbRef;

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
            status,
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
        await carregarListaOperacoesTabela();

    } catch (error) {
        console.error("Erro ao salvar operação:", error);
        alert("❌ Erro ao salvar operação. Verifique o console.");
    }
}

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

async function carregarListaOperacoesTabela() {
    const tabela = document.getElementById('tabelaOperacoes')?.querySelector('tbody');
    if (!tabela) return;

    try {
        const db = window.dbRef.db;
        const { collection, getDocs, orderBy, query } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');
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

        equipeAjudantesSelecionados = Array.isArray(op.ajudantes) ? op.ajudantes.map(a => ({
            id: a.id,
            nome: a.nome,
            diaria: a.diaria
        })) : [];
        atualizarListaAjudantesUI();

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

// ----------------------------------------
// CHECK-INS (MONITORAMENTO)
// ----------------------------------------

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

        const ref = doc(db, 'companies', currentDomain, 'checkins_pendentes', checkinId);
        await deleteDoc(ref);

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

// ----------------------------------------
// RELATÓRIOS
// ----------------------------------------

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
        const { collection, getDocs } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');
        const snap = await getDocs(ref);

        let totalFat = 0;
        let totalDesp = 0;
        let contador = 0;

        snap.forEach(docSnap => {
            const op = { id: docSnap.id, ...docSnap.data() };

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

// ----------------------------------------
// RECIBOS
// ----------------------------------------

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
            <p><strong>Valor Pago:</strong> ${formatCurrency(calcularDiariaMotorista(op, f))}</p>
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
    const fat = Number(op.faturamento || 0);
    return fat * 0.20; // regra simples: 20% do faturamento
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
// Login, Créditos, Roteamento, Auth Observer
// ========================================

// ----------------------------------------
// LOGIN / LOGOUT
// ----------------------------------------

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
    return { uid, ...data };
}

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
        const creditStatus = await verificarCreditosEmpresa(currentDomain, userData.role);

        // Se NÃO for super admin e créditos não estiverem ativos, sai
        if (!creditStatus.isActive && !creditStatus.lifetime && !userData.role.toLowerCase().includes('super')) {
            return;
        }

        // ADMIN vê validade de créditos discretamente
        if (userData.role.toLowerCase() === 'admin') {
            exibirValidadeCreditosAdmin(creditStatus);
        }

        if (window.location.pathname.toLowerCase().includes('login.html')) {
            window.location.href = 'index.html';
        } else {
            await roteamentoPosLogin(userData);
        }

    } catch (error) {
        console.error("Falha no processo de login:", error);
    }
}

window.handleLoginSubmit = handleLoginSubmit;

window.handleLogout = async function() {
    try {
        const auth = window.dbRef.auth;
        const { signOut } = window.dbRef;

        await signOut(auth);
        currentUser = null;
        currentDomain = null;

        window.location.href = 'login.html';
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        alert("❌ Erro ao fazer logout. Verifique o console.");
    }
};

// ----------------------------------------
// ROTEAMENTO POR PERFIL
// ----------------------------------------

async function roteamentoPosLogin(userData) {
    if (!userData) return;
    const role = (userData.role || '').toLowerCase();

    const nomeSpan = document.getElementById('userNameDisplay');
    if (nomeSpan) nomeSpan.textContent = userData.nome || userData.email || 'Usuário';

    showMenu(null);
    showPage(null);

    if (role.includes('super')) {
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

async function inicializarSuperAdmin(userData) {
    showMenu('menu-super-admin');
    showPage('super-admin-dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Super Admin';

    await carregarPainelSuperAdmin(true);
}

async function inicializarAdmin(userData) {
    showMenu('menu-admin');
    showPage('dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Admin';

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

async function inicializarMotorista(userData) {
    showMenu('menu-employee');
    showPage('employee-dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Motorista';

    await carregarPainelFuncionario(userData);
}

async function inicializarAjudante(userData) {
    showMenu('menu-employee');
    showPage('employee-dashboard');

    const roleSpan = document.getElementById('userRoleDisplay');
    if (roleSpan) roleSpan.textContent = 'Ajudante';

    await carregarPainelFuncionario(userData);
}

async function carregarPainelFuncionario(userData) {
    const listaOps = document.getElementById('listaOperacoesFuncionario');
    if (!listaOps) return;

    listaOps.innerHTML = 'Carregando...';

    try {
        const db = window.dbRef.db;
        const { collection, getDocs } = window.dbRef;

        const ref = collection(db, 'companies', currentDomain, 'operacoes');

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

// ----------------------------------------
// OBSERVADOR DE AUTENTICAÇÃO
// ----------------------------------------

function inicializarAuthObserver() {
    const auth = window.dbRef.auth;
    const { onAuthStateChanged } = window.dbRef;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            if (window.location.pathname.toLowerCase().includes('index.html')) {
                window.location.href = 'login.html';
            }
            return;
        }

        try {
            const userData = await carregarDadosUsuarioLogado(user.uid);
            if (!userData) {
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

            const creditStatus = await verificarCreditosEmpresa(currentDomain, userData.role);
            if (!creditStatus.isActive && !creditStatus.lifetime && !userData.role.toLowerCase().includes('super')) {
                return;
            }

            if (userData.role.toLowerCase() === 'admin') {
                exibirValidadeCreditosAdmin(creditStatus);
            }

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

// ----------------------------------------
// HANDLERS GERAIS DE UI
// ----------------------------------------

function inicializarHandlersUI() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    const btnRel = document.getElementById('btnGerarRelatorio');
    if (btnRel) btnRel.addEventListener('click', gerarRelatorioOperacoes);

    const btnRecibo = document.getElementById('btnGerarRecibo');
    if (btnRecibo) btnRecibo.addEventListener('click', gerarRecibo);

    const closeRecibo = document.getElementById('closeReciboModalBtn');
    if (closeRecibo) closeRecibo.addEventListener('click', closeReciboModal);

    const closeDayModal = document.getElementById('closeDayOperationsModalBtn');
    if (closeDayModal) {
        closeDayModal.addEventListener('click', () => {
            const modal = document.getElementById('modalDayOperations');
            if (modal) modal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        const modRec = document.getElementById('modalRecibo');
        const modAjud = document.getElementById('modalAdicionarAjudante');
        const modOpsDia = document.getElementById('modalDayOperations');

        if (e.target === modRec) closeReciboModal();
        if (e.target === modAjud) closeAdicionarAjudanteModal();
        if (e.target === modOpsDia && modOpsDia) modOpsDia.style.display = 'none';
    });

    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterGlobalUsers);
    }
}

// ----------------------------------------
// INICIALIZAÇÃO GERAL
// ----------------------------------------

window.addEventListener('load', () => {
    try {
        const isLoginPage = window.location.pathname.toLowerCase().includes('login.html');

        if (isLoginPage) {
            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
        } else {
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