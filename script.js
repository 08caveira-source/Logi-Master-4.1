// =============================================================================
// LOGIMASTER - SISTEMA DE GESTÃO (SCRIPT.JS)
// VERSÃO: 10.0 (CORREÇÃO DE BUGS: CALENDÁRIO, ABAS, CADASTROS)
// =============================================================================

// --- 1. CONFIGURAÇÕES E VARIÁVEIS GLOBAIS ---
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades'
};

// Cache Local
var CACHE = {
    funcionarios: [],
    veiculos: [],
    contratantes: [],
    operacoes: [],
    despesas: [],
    atividades: [],
    ajudantesTemp: [] 
};

// Estado do Sistema
var ESTADO = {
    usuarioAtual: null,
    dataCalendario: new Date(),
    chartInstance: null
};

// --- 2. FORMATADORES E UTILITÁRIOS ---

function formatarMoeda(valor) {
    if (valor === undefined || valor === null || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarDataBr(dataIso) {
    if (!dataIso) return '-';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatarTelefone(v) {
    if (!v) return '';
    v = v.replace(/\D/g, "");
    if (v.length > 10) return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    if (v.length > 5) return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    return v;
}

function gerarIdUnico() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- 3. MOTOR DE BANCO DE DADOS (FIREBASE) ---

async function salvarDados(chave, dados) {
    // Atualiza memória
    if (chave === DB_KEYS.FUNCIONARIOS) CACHE.funcionarios = dados;
    if (chave === DB_KEYS.VEICULOS) CACHE.veiculos = dados;
    if (chave === DB_KEYS.OPERACOES) CACHE.operacoes = dados;
    if (chave === DB_KEYS.CONTRATANTES) CACHE.contratantes = dados;
    if (chave === DB_KEYS.DESPESAS_GERAIS) CACHE.despesas = dados;
    if (chave === DB_KEYS.ATIVIDADES) CACHE.atividades = dados;
    
    // Envia para Firebase
    if (window.dbRef && ESTADO.usuarioAtual && ESTADO.usuarioAtual.company) {
        try {
            const docRef = window.dbRef.doc(window.dbRef.db, 'companies', ESTADO.usuarioAtual.company, 'data', chave);
            // Deep copy para remover referências indesejadas
            const payload = JSON.parse(JSON.stringify(dados));
            
            await window.dbRef.setDoc(docRef, { 
                items: payload,
                lastUpdate: new Date().toISOString(),
                updatedBy: ESTADO.usuarioAtual.email
            });
            console.log(`[SYNC] ${chave} salvo com sucesso.`);
        } catch (erro) {
            console.error(`[ERRO] Falha ao salvar ${chave}:`, erro);
            alert("Erro de conexão com o banco de dados.");
        }
    }
}

// --- 4. LÓGICA DE INTERFACE (UI) ---

// A. Abas de Cadastro (CORRIGIDO)
window.setupTabs = function() {
    const tabs = document.querySelectorAll('.cadastro-tab-btn');
    const forms = document.querySelectorAll('.cadastro-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove ativo de todos
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            
            // Ativa o clicado
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            const targetForm = document.getElementById(targetId);
            if(targetForm) targetForm.classList.add('active');
        });
    });
};

// B. Selects Dropdown
window.preencherSelects = function() {
    const fill = (id, lista, keyVal, keyText, defaultText) => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = `<option value="">${defaultText}</option>`;
        lista.forEach(item => {
            el.innerHTML += `<option value="${item[keyVal]}">${item[keyText]}</option>`;
        });
        if(currentVal) el.value = currentVal; // Tenta manter seleção
    };

    const motoristas = CACHE.funcionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = CACHE.funcionarios.filter(f => f.funcao === 'ajudante');

    fill('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE.veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    fill('selectContratanteOperacao', CACHE.contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    fill('selectAtividadeOperacao', CACHE.atividades, 'id', 'nome', 'SELECIONE (OPCIONAL)...');
    fill('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');

    fill('selectMotoristaRelatorio', CACHE.funcionarios, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE.veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE.contratantes, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectVeiculoDespesaGeral', CACHE.veiculos, 'placa', 'placa', 'VINCULAR VEÍCULO');
    fill('selectMotoristaRecibo', CACHE.funcionarios, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
};

// C. Renderização de Tabelas
window.renderizarTabelas = function() {
    // 1. Tabela de Funcionários (CORRIGIDO)
    const tbodyFunc = document.querySelector('#tabelaFuncionarios tbody');
    if (tbodyFunc) {
        tbodyFunc.innerHTML = '';
        if (CACHE.funcionarios.length === 0) tbodyFunc.innerHTML = '<tr><td colspan="4" align="center">Nenhum funcionário cadastrado.</td></tr>';
        
        CACHE.funcionarios.forEach(f => {
            tbodyFunc.innerHTML += `
                <tr>
                    <td>${f.nome}</td>
                    <td><span class="status-pill pill-active">${f.funcao}</span></td>
                    <td>${formatarTelefone(f.telefone)}</td>
                    <td>
                        <button class="btn-mini edit-btn" onclick="preencherFormFunc('${f.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    }

    // 2. Tabela de Veículos
    const tbodyVeic = document.querySelector('#tabelaVeiculos tbody');
    if (tbodyVeic) {
        tbodyVeic.innerHTML = '';
        CACHE.veiculos.forEach(v => {
            tbodyVeic.innerHTML += `<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }

    // 3. Tabela de Contratantes
    const tbodyCont = document.querySelector('#tabelaContratantes tbody');
    if (tbodyCont) {
        tbodyCont.innerHTML = '';
        CACHE.contratantes.forEach(c => {
            tbodyCont.innerHTML += `<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }

    // 4. Histórico de Operações
    const tbodyOp = document.querySelector('#tabelaOperacoes tbody');
    if (tbodyOp) {
        tbodyOp.innerHTML = '';
        const ops = [...CACHE.operacoes].sort((a, b) => new Date(b.data) - new Date(a.data));
        ops.forEach(op => {
            const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '---';
            const statusClass = op.status === 'CONFIRMADA' ? 'pill-active' : 'pill-pending';
            tbodyOp.innerHTML += `
                <tr>
                    <td>${formatarDataBr(op.data)}</td>
                    <td>${mot}<br><small>${op.veiculoPlaca}</small></td>
                    <td><span class="status-pill ${statusClass}">${op.status}</span></td>
                    <td style="color:green; font-weight:bold;">${formatarMoeda(op.faturamento)}</td>
                    <td>
                        <button class="btn-mini edit-btn" onclick="editarOperacao('${op.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    }

    // 5. Despesas
    const tbodyDesp = document.querySelector('#tabelaDespesasGerais tbody');
    if (tbodyDesp) {
        tbodyDesp.innerHTML = '';
        CACHE.despesas.forEach(d => {
            tbodyDesp.innerHTML += `<tr><td>${formatarDataBr(d.data)}</td><td>${d.veiculoRef||'-'}</td><td>${d.descricao}</td><td style="color:red;">${formatarMoeda(d.valor)}</td><td>${d.formaPagamento}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td></tr>`;
        });
    }
};

// --- 5. CALENDÁRIO (CORRIGIDO) ---
window.renderizarCalendario = function() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('currentMonthYear');
    if (!grid || !title) return;

    grid.innerHTML = '';
    const agora = ESTADO.dataCalendario;
    const mes = agora.getMonth();
    const ano = agora.getFullYear();

    title.innerText = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Dias Vazios
    for (let i = 0; i < primeiroDia; i++) {
        grid.innerHTML += `<div class="day-cell empty"></div>`;
    }

    // Dias Reais
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        // Filtra operações do dia
        const opsDia = CACHE.operacoes.filter(op => op.data === dataStr && op.status !== 'CANCELADA');
        
        let htmlConteudo = `<span style="font-size:0.8rem; color:#888;">${dia}</span>`;
        
        if (opsDia.length > 0) {
            const totalDia = opsDia.reduce((acc, op) => acc + (op.faturamento || 0), 0);
            htmlConteudo += `
                <div class="event-dot"></div>
                <div style="margin-top:auto; font-size:0.7rem; color:green; font-weight:bold;">
                    ${formatarMoeda(totalDia)}
                </div>`;
        }

        const div = document.createElement('div');
        div.className = `day-cell ${opsDia.length > 0 ? 'has-operation' : ''}`;
        div.innerHTML = htmlConteudo;
        div.onclick = () => alert(`Detalhes do dia ${formatarDataBr(dataStr)}:\nTotal de ${opsDia.length} operações.`);
        
        grid.appendChild(div);
    }
};

window.mudarMes = function(delta) {
    ESTADO.dataCalendario.setMonth(ESTADO.dataCalendario.getMonth() + delta);
    renderizarCalendario();
    atualizarDashboard(); // Para atualizar o gráfico se o ano mudar
};

// --- 6. DASHBOARD E GRÁFICOS ---
window.atualizarDashboard = function() {
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    // Filtra dados do mês
    const opsMes = CACHE.operacoes.filter(op => {
        const d = new Date(op.data);
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual && op.status === 'CONFIRMADA';
    });

    const faturamento = opsMes.reduce((s, op) => s + (op.faturamento || 0), 0);
    const custos = opsMes.reduce((s, op) => s + (op.combustivel || 0) + (op.despesas || 0) + (op.comissao || 0), 0);
    const despesasGerais = CACHE.despesas.reduce((s, d) => {
        const dt = new Date(d.data);
        return (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) ? s + d.valor : s;
    }, 0);

    const totalCustos = custos + despesasGerais;

    // Atualiza Cards
    if(document.getElementById('faturamentoMes')) document.getElementById('faturamentoMes').innerText = formatarMoeda(faturamento);
    if(document.getElementById('despesasMes')) document.getElementById('despesasMes').innerText = formatarMoeda(totalCustos);
    if(document.getElementById('receitaMes')) document.getElementById('receitaMes').innerText = formatarMoeda(faturamento - totalCustos);

    renderizarGrafico(anoAtual);
};

window.renderizarGrafico = function(ano) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    const receitas = Array(12).fill(0);
    const despesas = Array(12).fill(0);

    CACHE.operacoes.forEach(op => {
        const d = new Date(op.data);
        if (d.getFullYear() === ano && op.status === 'CONFIRMADA') {
            receitas[d.getMonth()] += (op.faturamento || 0);
            despesas[d.getMonth()] += ((op.combustivel||0) + (op.despesas||0) + (op.comissao||0));
        }
    });

    if (ESTADO.chartInstance) ESTADO.chartInstance.destroy();
    ESTADO.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'],
            datasets: [
                { label: 'Faturamento', data: receitas, backgroundColor: '#2e7d32' },
                { label: 'Custos', data: despesas, backgroundColor: '#c62828' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

// --- 7. PAINEL DO FUNCIONÁRIO (CORRIGIDO) ---
window.preencherMeusDados = function() {
    if (!ESTADO.usuarioAtual) return;
    
    // Busca o funcionário pelo email do usuário logado
    const emailLogado = ESTADO.usuarioAtual.email.toLowerCase();
    const meuPerfil = CACHE.funcionarios.find(f => f.email && f.email.toLowerCase() === emailLogado);

    if (!meuPerfil) {
        console.warn("Perfil de funcionário não encontrado para: " + emailLogado);
        return;
    }

    // Preenche os campos do HTML (Parte 1 do Fix)
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    
    setVal('meuPerfilNome', meuPerfil.nome);
    setVal('meuPerfilFuncao', meuPerfil.funcao);
    setVal('meuPerfilDoc', meuPerfil.documento);
    setVal('meuPerfilTel', meuPerfil.telefone);
    setVal('meuPerfilPix', meuPerfil.pix);
    setVal('meuPerfilEndereco', meuPerfil.endereco);

    if (meuPerfil.funcao === 'motorista') {
        const divCnh = document.getElementById('meuPerfilCNHGroup');
        if(divCnh) divCnh.style.display = 'block';
        setVal('meuPerfilCNH', meuPerfil.cnh);
        setVal('meuPerfilValidadeCNH', meuPerfil.validadeCNH);
    }
};

window.abrirModalSolicitacao = function() {
    const motivo = prompt("Descreva qual dado deseja alterar e o novo valor:");
    if (motivo) {
        // Em um sistema real, salvaríamos em 'db_solicitacoes'
        alert("Solicitação enviada ao administrador!\n\nDados: " + motivo);
    }
};

// --- 8. RELATÓRIOS E COBRANÇA (CORRIGIDO) ---
window.gerarRelatorioCobranca = function() {
    const clienteId = document.getElementById('selectContratanteRelatorio').value;
    const inicio = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;

    if (!clienteId || !inicio || !fim) return alert("Selecione Cliente e Datas.");

    const cliente = CACHE.contratantes.find(c => String(c.cnpj) === clienteId);
    const ops = CACHE.operacoes.filter(op => 
        op.contratanteCNPJ === clienteId && 
        op.data >= inicio && op.data <= fim && 
        op.status === 'CONFIRMADA'
    );

    if (ops.length === 0) return alert("Nenhuma operação encontrada para este cliente no período.");

    let total = 0;
    let linhas = '';
    ops.forEach(op => {
        total += op.faturamento;
        linhas += `<li>${formatarDataBr(op.data)} - Placa: ${op.veiculoPlaca} - <strong>${formatarMoeda(op.faturamento)}</strong></li>`;
    });

    const html = `
        <div style="font-family: Arial; padding: 40px;">
            <h1>FATURA DE COBRANÇA</h1>
            <hr>
            <h3>CLIENTE: ${cliente.razaoSocial}</h3>
            <p>CNPJ: ${cliente.cnpj}</p>
            <p>Período: ${formatarDataBr(inicio)} a ${formatarDataBr(fim)}</p>
            <hr>
            <ul>${linhas}</ul>
            <hr>
            <h2>TOTAL A PAGAR: ${formatarMoeda(total)}</h2>
            <br>
            <p>Por favor, efetuar pagamento via PIX ou Boleto Bancário.</p>
        </div>
    `;

    const win = window.open('', '', 'width=800,height=600');
    win.document.write(html);
    win.print();
};

window.gerarRelatorioGeral = function() {
    const inicio = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const filtroMot = document.getElementById('selectMotoristaRelatorio').value;

    if (!inicio || !fim) return alert("Defina as datas.");

    let ops = CACHE.operacoes.filter(op => op.data >= inicio && op.data <= fim && op.status === 'CONFIRMADA');
    if (filtroMot) ops = ops.filter(op => String(op.motoristaId) === filtroMot);

    let html = `<h3>RELATÓRIO GERAL (${formatarDataBr(inicio)} - ${formatarDataBr(fim)})</h3>`;
    html += `<table border="1" width="100%" cellspacing="0" cellpadding="5"><thead><tr><th>DATA</th><th>MOTORISTA</th><th>VALOR</th></tr></thead><tbody>`;
    
    let total = 0;
    ops.forEach(op => {
        const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '-';
        total += op.faturamento;
        html += `<tr><td>${formatarDataBr(op.data)}</td><td>${mot}</td><td>${formatarMoeda(op.faturamento)}</td></tr>`;
    });
    html += `</tbody></table><h3>TOTAL: ${formatarMoeda(total)}</h3>`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// --- 9. CRUD E SALVAMENTO ---
window.salvarOperacao = async function(e) {
    e.preventDefault();
    const id = document.getElementById('operacaoId').value;
    
    const novaOp = {
        id: id || gerarIdUnico(),
        data: document.getElementById('operacaoData').value,
        motoristaId: document.getElementById('selectMotoristaOperacao').value,
        veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
        contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
        status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA',
        faturamento: parseFloat(document.getElementById('operacaoFaturamento').value) || 0,
        combustivel: parseFloat(document.getElementById('operacaoCombustivel').value) || 0,
        despesas: parseFloat(document.getElementById('operacaoDespesas').value) || 0,
        comissao: parseFloat(document.getElementById('operacaoComissao').value) || 0,
        adiantamento: parseFloat(document.getElementById('operacaoAdiantamento').value) || 0,
        precoLitro: parseFloat(document.getElementById('operacaoPrecoLitro').value) || 0,
        kmRodado: parseFloat(document.getElementById('operacaoKmRodado').value) || 0,
        ajudantes: CACHE.ajudantesTemp || []
    };

    if (!novaOp.motoristaId || !novaOp.veiculoPlaca) return alert("Preencha Motorista e Veículo.");

    let lista = [...CACHE.operacoes];
    if (id) {
        const idx = lista.findIndex(o => o.id === id);
        if (idx > -1) lista[idx] = novaOp;
    } else {
        lista.push(novaOp);
    }

    await salvarDados(DB_KEYS.OPERACOES, lista);
    document.getElementById('formOperacao').reset();
    document.getElementById('operacaoId').value = '';
    CACHE.ajudantesTemp = [];
    renderizarListaAjudantes();
    alert("Operação Salva!");
    atualizarDashboard();
    renderizarTabelas();
};

window.salvarFuncionario = async function(e) {
    e.preventDefault();
    const id = document.getElementById('funcionarioId').value;
    const novo = {
        id: id || gerarIdUnico(),
        nome: document.getElementById('funcNome').value.toUpperCase(),
        funcao: document.getElementById('funcFuncao').value,
        email: document.getElementById('funcEmail').value.toLowerCase(),
        documento: document.getElementById('funcDocumento').value,
        telefone: document.getElementById('funcTelefone').value,
        pix: document.getElementById('funcPix').value,
        endereco: document.getElementById('funcEndereco').value,
        cnh: document.getElementById('funcCNH')?.value || '',
        validadeCNH: document.getElementById('funcValidadeCNH')?.value || ''
    };

    let lista = [...CACHE.funcionarios];
    if (id) {
        const idx = lista.findIndex(f => f.id === id);
        if(idx > -1) lista[idx] = novo;
    } else {
        lista.push(novo);
    }

    await salvarDados(DB_KEYS.FUNCIONARIOS, lista);
    document.getElementById('formFuncionario').reset();
    preencherSelects();
    renderizarTabelas();
    alert("Funcionário Salvo!");
};

// Funções Auxiliares de Exclusão e Edição
window.excluirOperacao = async (id) => {
    if(!confirm("Excluir?")) return;
    const lista = CACHE.operacoes.filter(o => o.id !== id);
    await salvarDados(DB_KEYS.OPERACOES, lista);
    atualizarDashboard();
    renderizarTabelas();
};

window.excluirFuncionario = async (id) => {
    if(!confirm("Excluir?")) return;
    const lista = CACHE.funcionarios.filter(f => f.id !== id);
    await salvarDados(DB_KEYS.FUNCIONARIOS, lista);
    preencherSelects();
    renderizarTabelas();
};

window.excluirVeiculo = async (placa) => {
    if(!confirm("Excluir?")) return;
    const lista = CACHE.veiculos.filter(v => v.placa !== placa);
    await salvarDados(DB_KEYS.VEICULOS, lista);
    preencherSelects();
    renderizarTabelas();
};

window.excluirContratante = async (cnpj) => {
    if(!confirm("Excluir?")) return;
    const lista = CACHE.contratantes.filter(c => c.cnpj !== cnpj);
    await salvarDados(DB_KEYS.CONTRATANTES, lista);
    preencherSelects();
    renderizarTabelas();
};

window.preencherFormFunc = (id) => {
    const f = CACHE.funcionarios.find(i => i.id === id);
    if(f) {
        document.getElementById('funcionarioId').value = f.id;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcEmail').value = f.email;
        document.getElementById('funcTelefone').value = f.telefone;
        // ... outros campos
        alert("Edite os dados e clique em Salvar.");
    }
};

window.editarOperacao = (id) => {
    const op = CACHE.operacoes.find(o => o.id === id);
    if(op) {
        document.getElementById('operacaoId').value = op.id;
        document.getElementById('operacaoData').value = op.data;
        document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
        document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
        // ... preencher financeiro
        window.mostrarPagina('operacoes');
    }
};

// --- Ajudantes Temporários ---
window.renderizarListaAjudantes = function() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if(!ul) return;
    ul.innerHTML = '';
    CACHE.ajudantesTemp.forEach((a, i) => {
        const nome = CACHE.funcionarios.find(f => f.id == a.id)?.nome || '?';
        ul.innerHTML += `<li>${nome} (R$ ${a.diaria}) <button type="button" onclick="CACHE.ajudantesTemp.splice(${i},1);renderizarListaAjudantes()">X</button></li>`;
    });
};

// --- 10. INICIALIZAÇÃO E BOOTSTRAP ---

window.mostrarPagina = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    
    const navLink = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if(navLink) navLink.classList.add('active');

    if (pageId === 'home') atualizarDashboard();
    if (pageId === 'meus-dados') preencherMeusDados();
};

window.initSystemByRole = function(user) {
    ESTADO.usuarioAtual = user;
    console.log("Sistema iniciado para: " + user.role);

    // Menu por Perfil
    document.querySelectorAll('nav ul').forEach(u => u.style.display = 'none');
    if (user.role === 'admin' || user.email === 'admin@logimaster.com') {
        document.getElementById('menu-admin').style.display = 'block';
        window.mostrarPagina('home');
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.mostrarPagina('employee-home');
    }

    // Inicializa Listeners do Firebase
    iniciarOuvintes(user.company);
    
    // Configura Abas
    setupTabs();
};

function iniciarOuvintes(companyId) {
    if (!window.dbRef || !companyId) return;
    const { db, doc, onSnapshot } = window.dbRef;

    Object.values(DB_KEYS).forEach(chave => {
        onSnapshot(doc(db, 'companies', companyId, 'data', chave), (snap) => {
            if (snap.exists()) {
                const dados = snap.data().items || [];
                if (chave === DB_KEYS.FUNCIONARIOS) CACHE.funcionarios = dados;
                if (chave === DB_KEYS.VEICULOS) CACHE.veiculos = dados;
                if (chave === DB_KEYS.OPERACOES) {
                    CACHE.operacoes = dados;
                    renderizarCalendario();
                    atualizarDashboard();
                }
                if (chave === DB_KEYS.CONTRATANTES) CACHE.contratantes = dados;
                if (chave === DB_KEYS.DESPESAS_GERAIS) CACHE.despesas = dados;
                if (chave === DB_KEYS.ATIVIDADES) CACHE.atividades = dados;

                preencherSelects();
                renderizarTabelas();
                
                // Atualiza painel do funcionário se for o caso
                if (document.getElementById('meus-dados').classList.contains('active')) {
                    preencherMeusDados();
                }
            }
        });
    });
}

// Event Listeners Globais
document.addEventListener('DOMContentLoaded', () => {
    // Forms
    document.getElementById('formOperacao')?.addEventListener('submit', salvarOperacao);
    document.getElementById('formFuncionario')?.addEventListener('submit', salvarFuncionario);
    document.getElementById('formVeiculo')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pl = document.getElementById('veiculoPlaca').value.toUpperCase();
        if(!pl) return;
        let lista = CACHE.veiculos.filter(v => v.placa !== pl);
        lista.push({
            placa: pl,
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value
        });
        await salvarDados(DB_KEYS.VEICULOS, lista);
        document.getElementById('formVeiculo').reset();
        alert("Veículo salvo.");
    });
    
    document.getElementById('formContratante')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cnpj = document.getElementById('contratanteCNPJ').value;
        let lista = CACHE.contratantes.filter(c => c.cnpj !== cnpj);
        lista.push({
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            cnpj: cnpj,
            telefone: document.getElementById('contratanteTelefone').value
        });
        await salvarDados(DB_KEYS.CONTRATANTES, lista);
        document.getElementById('formContratante').reset();
        alert("Contratante salvo.");
    });
    
    // Meus Dados (Edição Parcial)
    document.getElementById('formMeusDadosFuncionario')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!ESTADO.usuarioAtual) return;
        const email = ESTADO.usuarioAtual.email;
        const idx = CACHE.funcionarios.findIndex(f => f.email === email);
        if(idx > -1) {
            CACHE.funcionarios[idx].telefone = document.getElementById('meuPerfilTel').value;
            CACHE.funcionarios[idx].pix = document.getElementById('meuPerfilPix').value;
            CACHE.funcionarios[idx].endereco = document.getElementById('meuPerfilEndereco').value;
            await salvarDados(DB_KEYS.FUNCIONARIOS, CACHE.funcionarios);
            alert("Dados atualizados com sucesso!");
        }
    });

    // Navegação Principal
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            mostrarPagina(page);
        });
    });

    // Botões Especiais
    document.getElementById('btnManualAddAjudante')?.addEventListener('click', () => {
        const sel = document.getElementById('selectAjudantesOperacao');
        const diaria = prompt("Valor Diária R$:");
        if(sel.value && diaria) {
            CACHE.ajudantesTemp.push({id: sel.value, diaria: parseFloat(diaria.replace(',','.'))});
            renderizarListaAjudantes();
        }
    });
    
    // Relatórios
    document.getElementById('btnGerarRelatorio')?.addEventListener('click', gerarRelatorioGeral);
    document.getElementById('btnGerarCobranca')?.addEventListener('click', gerarRelatorioCobranca);
});