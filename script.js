// =============================================================================
// LOGIMASTER SYSTEM - NÚCLEO LÓGICO EXTENSO (CORRIGIDO)
// =============================================================================

// --- 1. VARIÁVEIS GLOBAIS E CACHE ---
var CACHE = {
    funcionarios: [],
    veiculos: [],
    clientes: [],
    operacoes: [],
    despesas: [],
    mensagens: ""
};

var ESTADO = {
    dataCalendario: new Date(),
    graficoInstance: null,
    usuario: null
};

// --- 2. INICIALIZAÇÃO E SINCRONIZAÇÃO ---

window.iniciarSistema = function(userData) {
    ESTADO.usuario = userData;
    console.log("Sistema Iniciado. Perfil:", userData.role);

    // Controle de Acesso ao Menu
    if (userData.role === 'admin' || userData.role === 'escritorio') {
        document.getElementById('menu-admin').style.display = 'block';
        navegarPara('home');
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('funcNomeDisplay').innerText = userData.name;
        navegarPara('func-home');
    }

    // Carregar Dados do Banco
    sincronizarDadosFirebase(userData.company);
};

window.sincronizarDadosFirebase = async function(companyId) {
    if(!window.dbRef) return;
    const { db, doc, getDoc } = window.dbRef;

    try {
        const docRef = doc(db, 'companies', companyId, 'data', 'sistema_completo');
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            const dados = snap.data();
            // Carrega para memória ou inicia arrays vazios
            CACHE.funcionarios = dados.funcionarios || [];
            CACHE.veiculos = dados.veiculos || [];
            CACHE.clientes = dados.clientes || [];
            CACHE.operacoes = dados.operacoes || [];
            CACHE.despesas = dados.despesas || [];
            CACHE.mensagens = dados.mensagens || "Bem-vindo ao sistema.";
            
            console.log("Dados sincronizados com sucesso. Itens:", CACHE.operacoes.length);
        } else {
            console.log("Primeiro acesso da empresa. Iniciando banco vazio.");
        }
        
        atualizarTodaInterface();

    } catch (error) {
        console.error("Erro no sync:", error);
        alert("Erro ao carregar dados. Verifique sua conexão.");
    }
};

window.salvarNoFirebase = async function() {
    if(!window.dbRef || !ESTADO.usuario) return;
    const { db, doc, setDoc } = window.dbRef;

    try {
        // Salva o objeto CACHE inteiro dentro do documento da empresa
        await setDoc(doc(db, 'companies', ESTADO.usuario.company, 'data', 'sistema_completo'), JSON.parse(JSON.stringify(CACHE)));
        console.log("Backup automático realizado no Firebase.");
    } catch (error) {
        console.error("Falha ao salvar:", error);
        alert("Atenção: Falha ao salvar dados na nuvem.");
    }
};

// --- 3. NAVEGAÇÃO E UI ---

window.navegarPara = function(pageId) {
    // Esconde todas as seções
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Mostra a desejada
    const target = document.getElementById(pageId);
    if(target) target.classList.add('active');

    // Atualiza menu
    // (Lógica simplificada para destacar ícone)
    
    if(pageId === 'home') renderizarDashboard();
    if(pageId === 'operacoes') preencherSelectsOperacao();
    if(pageId === 'func-home') document.getElementById('avisoEquipeDisplay').innerText = CACHE.mensagens;
};

window.abrirAba = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

window.logoutSistema = async function() {
    await window.dbRef.signOut(window.dbRef.auth);
    window.location.href = "login.html";
};

window.atualizarTodaInterface = function() {
    renderizarTabelasCadastro();
    renderizarTabelaOperacoes();
    renderizarTabelaDespesas();
    renderizarDashboard();
    renderizarEquipeView();
    preencherSelectsOperacao();
};

// --- 4. FUNÇÕES DE CRUD (CADASTROS DETALHADOS) ---

// A. CADASTRO DE FUNCIONÁRIOS COM CRIAÇÃO DE LOGIN
document.getElementById('formCadastroFuncionario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cadFuncId').value;
    const email = document.getElementById('cadFuncEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadFuncSenha').value;
    const nome = document.getElementById('cadFuncNome').value.toUpperCase();
    
    // 1. Verificação de Duplicidade
    const existe = CACHE.funcionarios.find(f => f.email === email && f.id !== id);
    if (existe) return alert("ERRO: Este e-mail já está cadastrado para outro funcionário.");

    // 2. Criação de Login no Firebase (Somente se for novo e tiver senha)
    if (!id && senha) {
        if(senha.length < 6) return alert("A senha deve ter no mínimo 6 caracteres.");
        try {
            // Usa App Secundária para não deslogar o admin
            const userCred = await window.dbRef.createUserWithEmailAndPassword(window.dbRef.secondaryAuth, email, senha);
            const uid = userCred.user.uid;
            
            // Cria perfil público 'users' vinculado à empresa
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                uid: uid,
                name: nome,
                email: email,
                role: document.getElementById('cadFuncFuncao').value,
                company: ESTADO.usuario.company
            });
            alert("Login de acesso criado com sucesso!");
            
            // Logout da app secundária para limpar memória
            await window.dbRef.signOut(window.dbRef.secondaryAuth);
            
        } catch (err) {
            console.error(err);
            return alert("Erro ao criar login no servidor: " + err.code);
        }
    }

    // 3. Salvar no Banco de Dados da Empresa
    const novoFunc = {
        id: id || Date.now().toString(),
        nome: nome,
        funcao: document.getElementById('cadFuncFuncao').value,
        email: email,
        cpf: document.getElementById('cadFuncCPF').value,
        telefone: document.getElementById('cadFuncTel').value,
        cnh: document.getElementById('cadFuncCNH').value
    };

    if (id) {
        const index = CACHE.funcionarios.findIndex(f => f.id === id);
        if(index > -1) CACHE.funcionarios[index] = novoFunc;
    } else {
        CACHE.funcionarios.push(novoFunc);
    }

    await salvarNoFirebase();
    alert("Funcionário salvo com sucesso!");
    e.target.reset();
    document.getElementById('cadFuncId').value = '';
    renderizarTabelasCadastro();
});

// B. VEÍCULOS E CLIENTES
document.getElementById('formCadastroVeiculo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const veiculo = {
        placa: document.getElementById('cadVeicPlaca').value.toUpperCase(),
        modelo: document.getElementById('cadVeicModelo').value.toUpperCase(),
        ano: document.getElementById('cadVeicAno').value
    };
    // Verifica duplicidade de placa
    if(CACHE.veiculos.find(v => v.placa === veiculo.placa)) return alert("Placa já cadastrada!");
    
    CACHE.veiculos.push(veiculo);
    await salvarNoFirebase();
    e.target.reset();
    renderizarTabelasCadastro();
    alert("Veículo Salvo!");
});

document.getElementById('formCadastroCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cliente = {
        razaoSocial: document.getElementById('cadCliNome').value.toUpperCase(),
        cnpj: document.getElementById('cadCliCNPJ').value
    };
    CACHE.clientes.push(cliente);
    await salvarNoFirebase();
    e.target.reset();
    renderizarTabelasCadastro();
    alert("Cliente Salvo!");
});

// --- 5. OPERAÇÕES E FINANCEIRO ---

document.getElementById('formOperacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('operacaoId').value;
    
    const op = {
        id: id || Date.now().toString(),
        data: document.getElementById('opData').value,
        status: document.getElementById('opStatus').value,
        cliente: document.getElementById('opCliente').value,
        motoristaId: document.getElementById('opMotorista').value,
        veiculo: document.getElementById('opVeiculo').value,
        faturamento: parseFloat(document.getElementById('opValor').value) || 0,
        combustivel: parseFloat(document.getElementById('opCombustivel').value) || 0,
        despesas: parseFloat(document.getElementById('opDespesas').value) || 0,
        comissao: parseFloat(document.getElementById('opComissao').value) || 0,
        obs: document.getElementById('opObs').value
    };

    if(id) {
        const idx = CACHE.operacoes.findIndex(o => o.id === id);
        if(idx > -1) CACHE.operacoes[idx] = op;
    } else {
        CACHE.operacoes.push(op);
    }

    await salvarNoFirebase();
    limparFormOperacao();
    atualizarTodaInterface();
    alert("Operação Registrada!");
});

document.getElementById('formDespesaGeral').addEventListener('submit', async (e) => {
    e.preventDefault();
    const desp = {
        id: Date.now().toString(),
        data: document.getElementById('despData').value,
        descricao: document.getElementById('despDesc').value.toUpperCase(),
        valor: parseFloat(document.getElementById('despValor').value)
    };
    CACHE.despesas.push(desp);
    await salvarNoFirebase();
    e.target.reset();
    atualizarTodaInterface();
});

// --- 6. RENDERIZAÇÃO DE TABELAS (HTML GENERATORS) ---

function renderizarTabelasCadastro() {
    // Funcionários
    const tbFunc = document.getElementById('tabelaCadFuncionarios');
    tbFunc.innerHTML = '';
    CACHE.funcionarios.forEach(f => {
        tbFunc.innerHTML += `
            <tr>
                <td>${f.nome}</td>
                <td><span class="badge">${f.funcao}</span></td>
                <td>${f.email}</td>
                <td>
                    <button class="btn-mini edit" onclick="editarFunc('${f.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-mini delete" onclick="excluirFunc('${f.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });

    // Veículos
    const tbVeic = document.getElementById('tabelaCadVeiculos');
    tbVeic.innerHTML = '';
    CACHE.veiculos.forEach((v, i) => {
        tbVeic.innerHTML += `<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini delete" onclick="excluirVeic(${i})"><i class="fas fa-trash"></i></button></td></tr>`;
    });

    // Clientes
    const tbCli = document.getElementById('tabelaCadClientes');
    tbCli.innerHTML = '';
    CACHE.clientes.forEach((c, i) => {
        tbCli.innerHTML += `<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td><button class="btn-mini delete" onclick="excluirCli(${i})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
}

function renderizarTabelaOperacoes() {
    const tbody = document.getElementById('listaOperacoesBody');
    tbody.innerHTML = '';
    
    // Ordenar por data (mais recente primeiro)
    const lista = [...CACHE.operacoes].sort((a,b) => new Date(b.data) - new Date(a.data));

    lista.forEach(op => {
        const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '---';
        let statusClass = op.status === 'CONFIRMADA' ? 'success' : (op.status === 'CANCELADA' ? 'danger' : 'warning');
        
        tbody.innerHTML += `
            <tr>
                <td>${formatarData(op.data)}</td>
                <td>${op.cliente}</td>
                <td>${op.veiculo}<br><small>${mot}</small></td>
                <td><span class="badge badge-${statusClass}">${op.status}</span></td>
                <td style="font-weight:bold; color:var(--success-color)">${formatarMoeda(op.faturamento)}</td>
                <td>
                    <button class="btn-mini info" onclick="verDetalhesOp('${op.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-mini edit" onclick="editarOp('${op.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-mini delete" onclick="excluirOp('${op.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

function renderizarTabelaDespesas() {
    const tbody = document.getElementById('tabelaDespesasGerais');
    tbody.innerHTML = '';
    CACHE.despesas.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${formatarData(d.data)}</td>
                <td>${d.descricao}</td>
                <td style="color:red">${formatarMoeda(d.valor)}</td>
                <td><button class="btn-mini delete" onclick="excluirDespesa('${d.id}')">X</button></td>
            </tr>`;
    });
}

// --- 7. DASHBOARD E CALENDÁRIO ---

window.renderizarDashboard = function() {
    // 1. KPIs
    const totalFat = CACHE.operacoes.reduce((acc, o) => o.status === 'CONFIRMADA' ? acc + (o.faturamento||0) : acc, 0);
    const custosOp = CACHE.operacoes.reduce((acc, o) => o.status === 'CONFIRMADA' ? acc + (o.combustivel||0) + (o.despesas||0) + (o.comissao||0) : acc, 0);
    const despGerais = CACHE.despesas.reduce((acc, d) => acc + (d.valor||0), 0);
    const totalCustos = custosOp + despGerais;

    document.getElementById('kpiFaturamento').innerText = formatarMoeda(totalFat);
    document.getElementById('kpiCustos').innerText = formatarMoeda(totalCustos);
    document.getElementById('kpiLucro').innerText = formatarMoeda(totalFat - totalCustos);

    // 2. Calendário
    renderizarCalendario();
    
    // 3. Gráfico Chart.js
    atualizarGrafico(totalFat, totalCustos);
};

window.renderizarCalendario = function() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    if(!grid) return;
    grid.innerHTML = '';

    const ano = ESTADO.dataCalendario.getFullYear();
    const mes = ESTADO.dataCalendario.getMonth();
    
    title.innerText = `${ano} / ${mes + 1}`;

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();

    // Espaços vazios
    for(let i=0; i<primeiroDiaSemana; i++) {
        grid.innerHTML += `<div class="day-cell empty"></div>`;
    }

    // Dias
    for(let dia=1; dia<=ultimoDiaMes; dia++) {
        const dataIso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const opsDia = CACHE.operacoes.filter(o => o.data === dataIso && o.status !== 'CANCELADA');
        
        let htmlContent = `<span class="day-number">${dia}</span>`;
        if(opsDia.length > 0) {
            const totalDia = opsDia.reduce((acc, o) => acc + (o.faturamento||0), 0);
            htmlContent += `<div class="day-event">${opsDia.length} ops<br><small>${formatarMoeda(totalDia)}</small></div>`;
        }

        const div = document.createElement('div');
        div.className = `day-cell ${opsDia.length > 0 ? 'has-data' : ''}`;
        div.innerHTML = htmlContent;
        if(opsDia.length > 0) {
            div.onclick = () => {
                let msg = `Operações do dia ${dia}:\n`;
                opsDia.forEach(o => msg += `- ${o.cliente} (${o.veiculo}): ${formatarMoeda(o.faturamento)}\n`);
                alert(msg);
            };
        }
        grid.appendChild(div);
    }
};

window.mudarMesCalendario = function(delta) {
    ESTADO.dataCalendario.setMonth(ESTADO.dataCalendario.getMonth() + delta);
    renderizarCalendario();
};

function atualizarGrafico(receitas, despesas) {
    const ctx = document.getElementById('graficoFinanceiro');
    if(!ctx) return;
    
    if(ESTADO.graficoInstance) ESTADO.graficoInstance.destroy();

    ESTADO.graficoInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{
                data: [receitas, despesas],
                backgroundColor: ['#00796b', '#c62828']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- 8. HELPERS E INTERAÇÕES ---

window.preencherSelectsOperacao = function() {
    const fill = (id, list, val, txt) => {
        const el = document.getElementById(id);
        el.innerHTML = '<option value="">Selecione...</option>';
        list.forEach(i => el.innerHTML += `<option value="${i[val]}">${i[txt]}</option>`);
    };
    
    fill('opMotorista', CACHE.funcionarios.filter(f => f.funcao === 'motorista'), 'id', 'nome');
    fill('relMotorista', CACHE.funcionarios, 'id', 'nome');
    
    // Veículos (array de objetos simples)
    const elVeic = document.getElementById('opVeiculo');
    elVeic.innerHTML = '<option value="">Selecione...</option>';
    CACHE.veiculos.forEach(v => elVeic.innerHTML += `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`);
    
    // Clientes
    const elCli = document.getElementById('opCliente');
    elCli.innerHTML = '<option value="">Selecione...</option>';
    CACHE.clientes.forEach(c => elCli.innerHTML += `<option value="${c.razaoSocial}">${c.razaoSocial}</option>`);
};

window.verDetalhesOp = function(id) {
    const op = CACHE.operacoes.find(o => o.id === id);
    if(!op) return;
    const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '---';

    const html = `
        <table style="width:100%; text-align:left;">
            <tr><td><strong>Data:</strong></td><td>${formatarData(op.data)}</td></tr>
            <tr><td><strong>Cliente:</strong></td><td>${op.cliente}</td></tr>
            <tr><td><strong>Motorista:</strong></td><td>${mot}</td></tr>
            <tr><td><strong>Veículo:</strong></td><td>${op.veiculo}</td></tr>
            <tr><td><strong>Status:</strong></td><td>${op.status}</td></tr>
            <tr><td colspan="2"><hr></td></tr>
            <tr><td><strong>Faturamento:</strong></td><td style="color:green">${formatarMoeda(op.faturamento)}</td></tr>
            <tr><td><strong>Combustível:</strong></td><td style="color:red">${formatarMoeda(op.combustivel)}</td></tr>
            <tr><td><strong>Despesas:</strong></td><td style="color:red">${formatarMoeda(op.despesas)}</td></tr>
            <tr><td><strong>Lucro Estimado:</strong></td><td><strong>${formatarMoeda(op.faturamento - op.combustivel - op.despesas - op.comissao)}</strong></td></tr>
            <tr><td colspan="2"><hr></td></tr>
            <tr><td><strong>Obs:</strong></td><td>${op.obs || '-'}</td></tr>
        </table>
    `;
    document.getElementById('conteudoModal').innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
};

window.fecharModal = function() { document.getElementById('modalDetalhes').style.display = 'none'; };

window.editarOp = function(id) {
    const op = CACHE.operacoes.find(o => o.id === id);
    if(!op) return;
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('opData').value = op.data;
    document.getElementById('opStatus').value = op.status;
    document.getElementById('opCliente').value = op.cliente;
    document.getElementById('opMotorista').value = op.motoristaId;
    document.getElementById('opVeiculo').value = op.veiculo;
    document.getElementById('opValor').value = op.faturamento;
    document.getElementById('opCombustivel').value = op.combustivel;
    document.getElementById('opDespesas').value = op.despesas;
    document.getElementById('opComissao').value = op.comissao;
    document.getElementById('opObs').value = op.obs;
    document.querySelector('.content-area').scrollTop = 0; // Sobe para o form
};

window.excluirOp = function(id) {
    if(confirm("Confirma exclusão? Isso afetará o financeiro.")) {
        CACHE.operacoes = CACHE.operacoes.filter(o => o.id !== id);
        salvarNoFirebase();
        atualizarTodaInterface();
    }
};

window.limparFormOperacao = function() {
    document.getElementById('formOperacao').reset();
    document.getElementById('operacaoId').value = '';
};

window.enviarAvisoEquipe = async function() {
    const msg = document.getElementById('msgAviso').value;
    if(msg) {
        CACHE.mensagens = msg + " (Enviado em " + new Date().toLocaleDateString() + ")";
        await salvarNoFirebase();
        alert("Aviso enviado para o painel de todos!");
    }
};

window.renderizarEquipeView = function() {
    const tbody = document.getElementById('listaEquipeView');
    tbody.innerHTML = '';
    CACHE.funcionarios.forEach(f => {
        tbody.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.telefone}</td><td>${f.email}</td></tr>`;
    });
};

// --- 9. RELATÓRIOS E PDF ---

window.gerarRelatorioGeral = function() {
    const ini = document.getElementById('relIni').value;
    const fim = document.getElementById('relFim').value;
    const motId = document.getElementById('relMotorista').value;
    
    if(!ini || !fim) return alert("Selecione o período.");

    const ops = CACHE.operacoes.filter(o => o.data >= ini && o.data <= fim && o.status === 'CONFIRMADA' && (!motId || o.motoristaId === motId));
    
    let total = 0;
    let html = `<h3>RELATÓRIO (${formatarData(ini)} a ${formatarData(fim)})</h3><table style="width:100%; border-collapse:collapse;" border="1"><tr><th>Data</th><th>Cliente</th><th>Valor</th></tr>`;
    
    ops.forEach(o => {
        total += o.faturamento;
        html += `<tr><td>${formatarData(o.data)}</td><td>${o.cliente}</td><td>${formatarMoeda(o.faturamento)}</td></tr>`;
    });
    html += `</table><h4>TOTAL: ${formatarMoeda(total)}</h4>`;

    const area = document.getElementById('areaImpressao');
    area.innerHTML = html;
    area.style.display = 'block';
    document.getElementById('btnBaixarPdf').style.display = 'block';
};

window.baixarPDF = function() {
    const element = document.getElementById('areaImpressao');
    html2pdf(element);
};

// --- UTILITÁRIOS ---
function formatarMoeda(v) { return (v||0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}); }
function formatarData(d) { if(!d) return '-'; const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }

window.fazerBackup = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(CACHE));
    const el = document.createElement('a');
    el.href = dataStr;
    el.download = "backup_sistema.json";
    el.click();
};

window.restaurarBackup = function(input) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            CACHE = JSON.parse(e.target.result);
            await salvarNoFirebase();
            atualizarTodaInterface();
            alert("Backup restaurado!");
        } catch(err) { alert("Erro no arquivo."); }
    };
    reader.readAsText(file);
};