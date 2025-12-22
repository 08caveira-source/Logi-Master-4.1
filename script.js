// =============================================================================
// LOGIMASTER - CORE LOGIC (CORRIGIDO)
// =============================================================================

// CONFIGURAÇÃO GLOBAL
const DB_KEY = 'logimaster_data'; 
// Em produção com Firebase, os dados viriam do onSnapshot. 
// Para simplificar a lógica local + sync, usamos uma variável global de Cache.

var CACHE = {
    funcionarios: [],
    veiculos: [],
    clientes: [],
    operacoes: [],
    despesas: []
};

// DATA ATUAL PARA CALENDÁRIO
var dataCalendario = new Date();

// --- 1. INICIALIZAÇÃO E FIREBASE SYNC ---

window.initSystem = function(user) {
    console.log("Sistema iniciado para: ", user.role);
    
    // Controle de Menu por Permissão
    if (user.role === 'admin' || user.email === 'admin@logimaster.com') {
        document.getElementById('menuAdmin').style.display = 'block';
        navTo('home');
    } else {
        document.getElementById('menuFunc').style.display = 'block';
        document.getElementById('funcWelcome').innerText = user.name;
        navTo('func-home');
    }

    // Carregar dados do Firebase (Firestore)
    carregarDadosFirebase(user.company);
};

async function carregarDadosFirebase(companyId) {
    if(!window.dbRef || !companyId) return;
    const { db, doc, getDoc } = window.dbRef;

    try {
        const docSnap = await getDoc(doc(db, 'companies', companyId, 'data', 'geral'));
        if (docSnap.exists()) {
            const data = docSnap.data();
            CACHE = data; // Carrega tudo para memória
            console.log("Dados carregados:", CACHE);
        } else {
            console.log("Nenhum dado encontrado, iniciando vazio.");
        }
        atualizarInterface();
    } catch (e) {
        console.error("Erro ao carregar:", e);
    }
}

async function salvarNoFirebase() {
    if(!window.currentUser) return;
    const { db, doc, setDoc } = window.dbRef;
    try {
        await setDoc(doc(db, 'companies', window.currentUser.company, 'data', 'geral'), JSON.parse(JSON.stringify(CACHE)));
        console.log("Salvo no Firebase.");
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro de sincronização. Verifique internet.");
    }
}

// --- 2. NAVEGAÇÃO E ABAS ---

window.navTo = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    document.getElementById(pageId).classList.add('active');
    
    // Atualiza dados específicos ao abrir a página
    if(pageId === 'home') renderizarDashboard();
    if(pageId === 'operacoes') atualizarInterface(); 
};

window.openTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    // Adiciona classe active no botão correspondente (lógica simples baseada em ordem ou query selector seria melhor, mas aqui funciona pelo clique)
    event.target.classList.add('active');
};

window.logout = function() {
    window.dbRef.signOut(window.dbRef.auth);
};

// --- 3. CRUD: FUNCIONÁRIOS (COM CRIAÇÃO DE LOGIN) ---

document.getElementById('formFunc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('funcId').value;
    const email = document.getElementById('funcEmail').value.trim();
    const senha = document.getElementById('funcSenha').value.trim();
    const docCPF = document.getElementById('funcDoc').value.trim();

    // Validação de Duplicidade
    const duplicado = CACHE.funcionarios.find(f => (f.email === email || f.documento === docCPF) && f.id !== id);
    if (duplicado) {
        return alert("ERRO: Já existe um funcionário com este E-mail ou CPF!");
    }

    // Criação no Firebase Auth (Apenas se for novo e tiver senha)
    if (!id && senha) {
        if (senha.length < 6) return alert("A senha deve ter no mínimo 6 dígitos.");
        try {
            // Usa Auth Secundária para não deslogar o admin
            const userCred = await window.dbRef.createUser(window.dbRef.secondaryAuth, email, senha);
            const uid = userCred.user.uid;
            
            // Cria perfil público 'users'
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                uid: uid,
                name: document.getElementById('funcNome').value.toUpperCase(),
                email: email,
                role: 'funcionario', // padrão
                company: window.currentUser.company
            });
            alert("Login criado com sucesso para o funcionário!");
        } catch (err) {
            console.error(err);
            return alert("Erro ao criar login: " + err.code);
        }
    }

    const novoFunc = {
        id: id || Date.now().toString(),
        nome: document.getElementById('funcNome').value.toUpperCase(),
        funcao: document.getElementById('funcFuncao').value,
        email: email,
        documento: docCPF,
        telefone: document.getElementById('funcTel').value
    };

    if (id) {
        const idx = CACHE.funcionarios.findIndex(f => f.id === id);
        CACHE.funcionarios[idx] = novoFunc;
    } else {
        CACHE.funcionarios.push(novoFunc);
    }

    salvarNoFirebase();
    alert("Funcionário salvo!");
    e.target.reset();
    document.getElementById('funcId').value = '';
    atualizarInterface();
});

// --- 4. CRUD: OPERAÇÕES ---

document.getElementById('formOperacao').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('opId').value;
    
    const op = {
        id: id || Date.now().toString(),
        data: document.getElementById('opData').value,
        motoristaId: document.getElementById('opMotorista').value,
        veiculo: document.getElementById('opVeiculo').value,
        cliente: document.getElementById('opCliente').value,
        faturamento: parseFloat(document.getElementById('opFat').value) || 0,
        combustivel: parseFloat(document.getElementById('opComb').value) || 0,
        despesas: parseFloat(document.getElementById('opDesp').value) || 0,
        status: document.getElementById('opStatus').value,
        ajudantes: document.getElementById('opAjudantesInput').value
    };

    if(id) {
        const idx = CACHE.operacoes.findIndex(o => o.id === id);
        CACHE.operacoes[idx] = op;
    } else {
        CACHE.operacoes.push(op);
    }

    salvarNoFirebase();
    alert("Operação salva!");
    limparFormOp();
    atualizarInterface();
});

window.limparFormOp = function() {
    document.getElementById('formOperacao').reset();
    document.getElementById('opId').value = '';
};

window.editarOp = function(id) {
    const op = CACHE.operacoes.find(o => o.id === id);
    if(!op) return;
    document.getElementById('opId').value = op.id;
    document.getElementById('opData').value = op.data;
    document.getElementById('opMotorista').value = op.motoristaId;
    document.getElementById('opVeiculo').value = op.veiculo;
    document.getElementById('opCliente').value = op.cliente;
    document.getElementById('opFat').value = op.faturamento;
    document.getElementById('opComb').value = op.combustivel;
    document.getElementById('opDesp').value = op.despesas;
    document.getElementById('opStatus').value = op.status;
    document.getElementById('opAjudantesInput').value = op.ajudantes || '';
    window.scrollTo(0,0);
};

window.excluirOp = function(id) {
    if(confirm("Deseja excluir esta operação?")) {
        CACHE.operacoes = CACHE.operacoes.filter(o => o.id !== id);
        salvarNoFirebase();
        atualizarInterface();
    }
};

window.verDetalhes = function(id) {
    const op = CACHE.operacoes.find(o => o.id === id);
    if(!op) return;
    const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '?';
    
    const html = `
        <p><strong>Data:</strong> ${formatarData(op.data)}</p>
        <p><strong>Cliente:</strong> ${op.cliente}</p>
        <p><strong>Veículo:</strong> ${op.veiculo}</p>
        <p><strong>Motorista:</strong> ${mot}</p>
        <p><strong>Ajudantes:</strong> ${op.ajudantes || '-'}</p>
        <hr>
        <p><strong>Faturamento:</strong> ${formatarMoeda(op.faturamento)}</p>
        <p><strong>Custos:</strong> ${formatarMoeda(op.combustivel + op.despesas)}</p>
        <p><strong>Lucro:</strong> <span style="color:green; font-weight:bold">${formatarMoeda(op.faturamento - (op.combustivel + op.despesas))}</span></p>
        <p><strong>Status:</strong> ${op.status}</p>
    `;
    document.getElementById('modalCorpo').innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
};

window.fecharModal = function() { document.getElementById('modalDetalhes').style.display = 'none'; };

// --- 5. RENDERIZAÇÃO E UI ---

function atualizarInterface() {
    preencherSelects();
    renderizarTabelaOperacoes();
    renderizarEquipe();
    renderizarCadastrosAuxiliares();
    renderizarDashboard();
}

function preencherSelects() {
    const preencher = (id, lista, val, txt) => {
        const el = document.getElementById(id);
        el.innerHTML = '<option value="">Selecione...</option>';
        lista.forEach(i => el.innerHTML += `<option value="${i[val]}">${i[txt]}</option>`);
    };
    preencher('opMotorista', CACHE.funcionarios.filter(f=>f.funcao==='motorista'), 'id', 'nome');
    preencher('relMot', CACHE.funcionarios, 'id', 'nome');
    
    // Veículos e Clientes (Simples string ou objetos)
    const elVeic = document.getElementById('opVeiculo');
    elVeic.innerHTML = '<option value="">Selecione...</option>';
    CACHE.veiculos.forEach(v => elVeic.innerHTML += `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`);

    const elCli = document.getElementById('opCliente');
    elCli.innerHTML = '<option value="">Selecione...</option>';
    CACHE.clientes.forEach(c => elCli.innerHTML += `<option value="${c.razaoSocial}">${c.razaoSocial}</option>`);
}

function renderizarTabelaOperacoes() {
    const tbody = document.getElementById('tabelaOperacoes');
    tbody.innerHTML = '';
    // Ordena por data
    const lista = [...CACHE.operacoes].sort((a,b) => new Date(b.data) - new Date(a.data));
    
    lista.forEach(op => {
        const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '?';
        tbody.innerHTML += `
            <tr>
                <td>${formatarData(op.data)}</td>
                <td>${op.cliente}</td>
                <td>${op.veiculo}<br><small>${mot}</small></td>
                <td><span class="pill ${op.status==='CONFIRMADA'?'ok':'pending'}">${op.status}</span></td>
                <td>${formatarMoeda(op.faturamento)}</td>
                <td>
                    <button class="btn-mini btn-primary" onclick="verDetalhes('${op.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-mini btn-warning" onclick="editarOp('${op.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-mini btn-danger" onclick="excluirOp('${op.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function renderizarEquipe() {
    const tbody = document.getElementById('tabelaEquipeFull');
    tbody.innerHTML = '';
    CACHE.funcionarios.forEach(f => {
        tbody.innerHTML += `
            <tr>
                <td>${f.nome}</td>
                <td><span class="pill ok">${f.funcao}</span></td>
                <td>${f.email}</td>
                <td>
                    <button class="btn-mini btn-warning" onclick="alert('Edite na aba Cadastros')"><i class="fas fa-edit"></i></button>
                    <button class="btn-mini btn-danger" onclick="excluirFunc('${f.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function renderizarCadastrosAuxiliares() {
    // Veículos
    const tbV = document.getElementById('listaVeiculos');
    tbV.innerHTML = '';
    CACHE.veiculos.forEach((v, i) => {
        tbV.innerHTML += `<tr><td>${v.placa}</td><td>${v.modelo}</td><td><button class="btn-mini btn-danger" onclick="CACHE.veiculos.splice(${i},1); salvarNoFirebase(); atualizarInterface();">X</button></td></tr>`;
    });

    // Clientes
    const tbC = document.getElementById('listaClientes');
    tbC.innerHTML = '';
    CACHE.clientes.forEach((c, i) => {
        tbC.innerHTML += `<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td><button class="btn-mini btn-danger" onclick="CACHE.clientes.splice(${i},1); salvarNoFirebase(); atualizarInterface();">X</button></td></tr>`;
    });
}

// --- 6. RELATÓRIOS E RECIBOS (CORRIGIDO) ---

window.gerarRecibo = function() {
    const motId = document.getElementById('relMot').value;
    const ini = document.getElementById('relInicio').value;
    const fim = document.getElementById('relFim').value;

    if(!motId || !ini || !fim) return alert("Preencha Motorista e Datas.");

    const mot = CACHE.funcionarios.find(f => f.id == motId);
    const ops = CACHE.operacoes.filter(o => o.motoristaId == motId && o.data >= ini && o.data <= fim && o.status === 'CONFIRMADA');

    let html = `<h3>RECIBO DE PAGAMENTO</h3><p>Beneficiário: ${mot.nome}</p><hr><ul>`;
    let total = 0; // Aqui você somaria comissões reais se tivesse o campo, vou simular 10%
    ops.forEach(o => {
        const comissao = o.faturamento * 0.10; 
        total += comissao;
        html += `<li>${formatarData(o.data)} - ${o.cliente}: ${formatarMoeda(comissao)}</li>`;
    });
    html += `</ul><hr><h4>TOTAL A PAGAR: ${formatarMoeda(total)}</h4>`;
    
    const area = document.getElementById('areaRelatorio');
    area.innerHTML = html;
    area.style.display = 'block';
};

window.baixarPDF = function() {
    const el = document.getElementById('areaRelatorio');
    if(el.style.display === 'none') return alert("Gere um relatório primeiro.");
    html2pdf().from(el).save('documento.pdf');
};

// --- 7. BACKUP E IMPORTAÇÃO ---

window.exportarBackup = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(CACHE));
    const el = document.createElement('a');
    el.setAttribute("href", dataStr);
    el.setAttribute("download", "backup_logimaster.json");
    document.body.appendChild(el);
    el.click();
    el.remove();
};

window.importarBackup = function(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            CACHE = json;
            await salvarNoFirebase();
            atualizarInterface();
            alert("Backup restaurado com sucesso!");
        } catch(err) {
            alert("Erro ao ler arquivo JSON.");
        }
    };
    reader.readAsText(file);
};

// --- 8. DASHBOARD E CALENDÁRIO ---

function renderizarDashboard() {
    // Totais
    const fat = CACHE.operacoes.reduce((acc, o) => acc + (o.faturamento||0), 0);
    const cust = CACHE.operacoes.reduce((acc, o) => acc + (o.combustivel||0) + (o.despesas||0), 0);
    
    document.getElementById('dashFat').innerText = formatarMoeda(fat).replace('R$','');
    document.getElementById('dashCust').innerText = formatarMoeda(cust).replace('R$','');
    document.getElementById('dashLucro').innerText = formatarMoeda(fat - cust).replace('R$','');

    // Calendário
    renderizarCalendario();
}

function renderizarCalendario() {
    const grid = document.getElementById('calendarGrid');
    const display = document.getElementById('mesAnoDisplay');
    grid.innerHTML = '';
    
    const mes = dataCalendario.getMonth();
    const ano = dataCalendario.getFullYear();
    
    display.innerText = `${ano}/${mes+1}`;

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes+1, 0).getDate();

    for(let i=0; i<primeiroDia; i++) {
        grid.innerHTML += `<div class="day-cell empty"></div>`;
    }

    for(let d=1; d<=totalDias; d++) {
        const dataStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const opsDia = CACHE.operacoes.filter(o => o.data === dataStr);
        
        let html = `<span style="color:#999">${d}</span>`;
        if(opsDia.length > 0) {
            const totalDia = opsDia.reduce((acc, o) => acc + (o.faturamento||0), 0);
            html += `<div class="day-value">${formatarMoeda(totalDia)}</div>`;
        }
        
        const div = document.createElement('div');
        div.className = `day-cell ${opsDia.length>0 ? 'has-event' : ''}`;
        div.innerHTML = html;
        if(opsDia.length > 0) {
            div.onclick = () => {
                // Mostra detalhes do dia no modal
                let lista = '';
                opsDia.forEach(o => lista += `<p>Op #${o.id.substr(-4)} - ${o.cliente} - ${formatarMoeda(o.faturamento)}</p>`);
                document.getElementById('modalCorpo').innerHTML = lista;
                document.getElementById('modalDetalhes').style.display = 'flex';
            };
        }
        grid.appendChild(div);
    }
}

window.mudarMes = function(dir) {
    dataCalendario.setMonth(dataCalendario.getMonth() + dir);
    renderizarCalendario();
};

// --- 9. HELPERS ---
function formatarMoeda(v) { return (v||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function formatarData(d) { if(!d) return '-'; const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }

// Listeners de Forms Auxiliares
document.getElementById('formVeic').addEventListener('submit', (e) => {
    e.preventDefault();
    CACHE.veiculos.push({ placa: document.getElementById('veicPlaca').value, modelo: document.getElementById('veicModelo').value });
    salvarNoFirebase(); atualizarInterface(); e.target.reset();
});
document.getElementById('formCli').addEventListener('submit', (e) => {
    e.preventDefault();
    CACHE.clientes.push({ razaoSocial: document.getElementById('cliNome').value, cnpj: document.getElementById('cliDoc').value });
    salvarNoFirebase(); atualizarInterface(); e.target.reset();
});
document.getElementById('formDespesa').addEventListener('submit', (e) => {
    e.preventDefault();
    CACHE.despesas.push({ 
        id: Date.now().toString(),
        data: document.getElementById('despData').value,
        desc: document.getElementById('despDesc').value,
        valor: parseFloat(document.getElementById('despValor').value)
    });
    salvarNoFirebase(); atualizarInterface(); e.target.reset();
});