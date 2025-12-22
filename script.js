// =============================================================================
// LOGIMASTER - SISTEMA DE GESTÃO (SCRIPT.JS)
// PARTE 1: NÚCLEO LÓGICO, FORMATADORES E BANCO DE DADOS
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

// Cache de Dados (Memória RAM para velocidade)
var CACHE = {
    funcionarios: [],
    veiculos: [],
    contratantes: [],
    operacoes: [],
    despesas: [],
    atividades: [],
    minhaEmpresa: {},
    ajudantesTemp: [] // Lista temporária para criação de operação
};

// Variáveis de Estado
var ESTADO = {
    usuarioAtual: null,
    modoLeitura: false,
    dataCalendario: new Date(),
    chartInstance: null // Instância do Gráfico Chart.js
};

// --- 2. FORMATADORES E UTILITÁRIOS ---

function formatarMoeda(valor) {
    if (valor === undefined || valor === null || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarDataBr(dataIso) {
    if (!dataIso) return '-';
    // Corrige o problema de fuso horário criando a data com componentes locais
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

function obterDataAtualISO() {
    return new Date().toISOString().split('T')[0];
}

function gerarIdUnico() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- 3. MOTOR DE BANCO DE DADOS (FIREBASE SYNC) ---

// Função genérica para salvar qualquer coleção
async function salvarDados(chave, dados) {
    // 1. Atualiza Memória Local
    if (chave === DB_KEYS.FUNCIONARIOS) CACHE.funcionarios = dados;
    if (chave === DB_KEYS.VEICULOS) CACHE.veiculos = dados;
    if (chave === DB_KEYS.OPERACOES) CACHE.operacoes = dados;
    if (chave === DB_KEYS.CONTRATANTES) CACHE.contratantes = dados;
    if (chave === DB_KEYS.DESPESAS_GERAIS) CACHE.despesas = dados;
    
    // 2. Envia para o Firebase (Se estiver logado e tiver empresa vinculada)
    if (window.dbRef && ESTADO.usuarioAtual && ESTADO.usuarioAtual.company) {
        try {
            const docRef = window.dbRef.doc(window.dbRef.db, 'companies', ESTADO.usuarioAtual.company, 'data', chave);
            await window.dbRef.setDoc(docRef, { 
                items: JSON.parse(JSON.stringify(dados)), // Remove referências cíclicas
                lastUpdate: new Date().toISOString(),
                updatedBy: ESTADO.usuarioAtual.email
            });
            console.log(`[SYNC] ${chave} sincronizado com sucesso.`);
        } catch (erro) {
            console.error(`[ERRO SYNC] Falha ao salvar ${chave}:`, erro);
            alert("Erro de conexão. Verifique sua internet.");
        }
    }
}

// --- 4. FUNÇÕES CRUD (CRIAR, LER, ATUALIZAR, DELETAR) ---

// A. OPERAÇÕES (O Coração do Sistema)
window.salvarOperacao = async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('operacaoId').value;
    const isEdit = !!id;
    
    // Coleta dos dados do formulário
    const novaOp = {
        id: id || gerarIdUnico(),
        data: document.getElementById('operacaoData').value,
        motoristaId: document.getElementById('selectMotoristaOperacao').value,
        veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
        contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
        atividadeId: document.getElementById('selectAtividadeOperacao').value,
        status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA',
        
        // Financeiro
        faturamento: parseFloat(document.getElementById('operacaoFaturamento').value) || 0,
        adiantamento: parseFloat(document.getElementById('operacaoAdiantamento').value) || 0,
        comissao: parseFloat(document.getElementById('operacaoComissao').value) || 0,
        despesas: parseFloat(document.getElementById('operacaoDespesas').value) || 0,
        
        // Custos Variáveis
        combustivel: parseFloat(document.getElementById('operacaoCombustivel').value) || 0,
        precoLitro: parseFloat(document.getElementById('operacaoPrecoLitro').value) || 0,
        kmRodado: parseFloat(document.getElementById('operacaoKmRodado').value) || 0,
        
        // Equipe Extra
        ajudantes: CACHE.ajudantesTemp || [],
        
        // Metadados de Check-in (Preservar se for edição)
        checkins: { motorista: false, ajudantes: [], faltas: [] }
    };

    // Validação Básica
    if (!novaOp.motoristaId || !novaOp.veiculoPlaca || !novaOp.contratanteCNPJ) {
        return alert("Preencha Motorista, Veículo e Cliente!");
    }

    let lista = [...CACHE.operacoes];

    if (isEdit) {
        // Preserva dados sensíveis que não estão no form
        const index = lista.findIndex(o => String(o.id) === String(id));
        if (index > -1) {
            novaOp.checkins = lista[index].checkins; // Mantém histórico de checkin
            lista[index] = novaOp;
        }
    } else {
        lista.push(novaOp);
    }

    await salvarDados(DB_KEYS.OPERACOES, lista);
    
    // Limpeza
    document.getElementById('formOperacao').reset();
    document.getElementById('operacaoId').value = '';
    CACHE.ajudantesTemp = []; // Zera lista temporária
    renderizarListaAjudantes(); // Atualiza UI vazia
    
    alert("Operação Salva com Sucesso!");
    if(typeof atualizarDashboard === 'function') atualizarDashboard(); // Chama Parte 2
    if(typeof renderizarTabelas === 'function') renderizarTabelas(); // Chama Parte 2
};

window.excluirOperacao = async function(id) {
    if (!confirm("Tem certeza? Isso afetará o financeiro.")) return;
    const lista = CACHE.operacoes.filter(o => String(o.id) !== String(id));
    await salvarDados(DB_KEYS.OPERACOES, lista);
    if(typeof atualizarDashboard === 'function') atualizarDashboard();
    if(typeof renderizarTabelas === 'function') renderizarTabelas();
};

window.editarOperacao = function(id) {
    const op = CACHE.operacoes.find(o => String(o.id) === String(id));
    if (!op) return;

    // Preenche Formulário
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // Restaura Ajudantes
    CACHE.ajudantesTemp = op.ajudantes ? [...op.ajudantes] : [];
    renderizarListaAjudantes();

    // Navega para aba
    mostrarPagina('operacoes');
    window.scrollTo(0,0);
};

// B. FUNCIONÁRIOS
window.salvarFuncionario = async function(e) {
    e.preventDefault();
    const id = document.getElementById('funcionarioId').value;
    
    const novoFunc = {
        id: id || gerarIdUnico(),
        nome: document.getElementById('funcNome').value.toUpperCase(),
        funcao: document.getElementById('funcFuncao').value, // motorista/ajudante
        email: document.getElementById('funcEmail').value.toLowerCase(), // Chave de vínculo
        documento: document.getElementById('funcDocumento').value,
        telefone: document.getElementById('funcTelefone').value,
        pix: document.getElementById('funcPix').value,
        endereco: document.getElementById('funcEndereco').value,
        
        // Dados Específicos Motorista
        cnh: document.getElementById('funcCNH').value || '',
        validadeCNH: document.getElementById('funcValidadeCNH').value || '',
        categoriaCNH: document.getElementById('funcCategoriaCNH').value || '',
        cursoDescricao: document.getElementById('funcCursoDescricao').value || ''
    };

    let lista = [...CACHE.funcionarios];
    if (id) {
        const index = lista.findIndex(f => String(f.id) === String(id));
        if (index > -1) lista[index] = novoFunc;
    } else {
        lista.push(novoFunc);
    }

    await salvarDados(DB_KEYS.FUNCIONARIOS, lista);
    document.getElementById('formFuncionario').reset();
    document.getElementById('funcionarioId').value = '';
    preencherSelects(); // Atualiza listas dropdown
    renderizarTabelas();
    alert("Funcionário Salvo!");
};

window.excluirFuncionario = async function(id) {
    if (!confirm("Excluir funcionário?")) return;
    const lista = CACHE.funcionarios.filter(f => String(f.id) !== String(id));
    await salvarDados(DB_KEYS.FUNCIONARIOS, lista);
    preencherSelects();
    renderizarTabelas();
};

// C. VEÍCULOS
window.salvarVeiculo = async function(e) {
    e.preventDefault();
    const id = document.getElementById('veiculoId').value; // Usado para saber se é edição
    
    const novoVeiculo = {
        placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
        modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
        ano: document.getElementById('veiculoAno').value,
        renavam: document.getElementById('veiculoRenavam').value,
        chassi: document.getElementById('veiculoChassi').value
    };

    let lista = [...CACHE.veiculos];
    // Se estiver editando e mudou a placa, removemos a antiga
    if (id && id !== novoVeiculo.placa) {
        lista = lista.filter(v => v.placa !== id);
    } else if (id) {
        lista = lista.filter(v => v.placa !== id);
    }
    
    lista.push(novoVeiculo);
    
    await salvarDados(DB_KEYS.VEICULOS, lista);
    document.getElementById('formVeiculo').reset();
    document.getElementById('veiculoId').value = '';
    preencherSelects();
    renderizarTabelas();
    alert("Veículo Salvo!");
};

// D. DESPESAS GERAIS
window.salvarDespesa = async function(e) {
    e.preventDefault();
    const novaDespesa = {
        id: gerarIdUnico(),
        data: document.getElementById('despesaGeralData').value,
        veiculoRef: document.getElementById('selectVeiculoDespesaGeral').value,
        descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
        valor: parseFloat(document.getElementById('despesaGeralValor').value),
        formaPagamento: document.getElementById('despesaFormaPagamento').value
    };

    let lista = [...CACHE.despesas];
    lista.push(novaDespesa);
    await salvarDados(DB_KEYS.DESPESAS_GERAIS, lista);
    
    document.getElementById('formDespesaGeral').reset();
    renderizarTabelas();
    atualizarDashboard();
    alert("Despesa Lançada!");
};

// --- FIM DA PARTE 1 ---

// --- 5. RENDERIZAÇÃO DE UI (TABELAS E SELECTS) ---

window.preencherSelects = function() {
    // Helper para preencher um <select>
    const fill = (id, lista, keyVal, keyText, defaultText) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${defaultText}</option>`;
        lista.forEach(item => {
            el.innerHTML += `<option value="${item[keyVal]}">${item[keyText]}</option>`;
        });
    };

    // Filtros
    const motoristas = CACHE.funcionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = CACHE.funcionarios.filter(f => f.funcao === 'ajudante');

    // Selects de Operação
    fill('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE.veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    fill('selectContratanteOperacao', CACHE.contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    fill('selectAtividadeOperacao', CACHE.atividades, 'id', 'nome', 'SELECIONE (OPCIONAL)...');
    fill('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');

    // Selects de Relatórios e Despesas
    fill('selectMotoristaRelatorio', CACHE.funcionarios, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    fill('selectVeiculoRelatorio', CACHE.veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE.contratantes, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectVeiculoDespesaGeral', CACHE.veiculos, 'placa', 'placa', 'VINCULAR VEÍCULO (OPCIONAL)');
    fill('selectMotoristaRecibo', CACHE.funcionarios, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
};

window.renderizarListaAjudantes = function() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    ul.innerHTML = '';
    CACHE.ajudantesTemp.forEach((item, index) => {
        const func = CACHE.funcionarios.find(f => String(f.id) === String(item.id));
        const nome = func ? func.nome : 'Desconhecido';
        ul.innerHTML += `
            <li>
                ${nome} (Diária: ${formatarMoeda(item.diaria)})
                <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp(${index})">X</button>
            </li>`;
    });
};

window.removerAjudanteTemp = function(index) {
    CACHE.ajudantesTemp.splice(index, 1);
    renderizarListaAjudantes();
};

window.renderizarTabelas = function() {
    // 1. Tabela de Operações (Histórico Recente)
    const tbodyOp = document.querySelector('#tabelaOperacoes tbody');
    if (tbodyOp) {
        tbodyOp.innerHTML = '';
        // Ordena por data (mais recente primeiro)
        const opsRecentes = [...CACHE.operacoes].sort((a, b) => new Date(b.data) - new Date(a.data)); // Top 20
        
        opsRecentes.forEach(op => {
            const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '---';
            const statusClass = op.status === 'CONFIRMADA' ? 'pill-active' : (op.status === 'AGENDADA' ? 'pill-pending' : 'pill-blocked');
            
            tbodyOp.innerHTML += `
                <tr>
                    <td>${formatarDataBr(op.data)}</td>
                    <td>${mot}<br><small>${op.veiculoPlaca}</small></td>
                    <td><span class="status-pill ${statusClass}">${op.status}</span></td>
                    <td style="color:var(--success-color); font-weight:bold;">${formatarMoeda(op.faturamento)}</td>
                    <td>
                        <button class="btn-mini edit-btn" onclick="editarOperacao('${op.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    }

    // 2. Tabela de Funcionários
    const tbodyFunc = document.querySelector('#tabelaFuncionarios tbody');
    if (tbodyFunc) {
        tbodyFunc.innerHTML = '';
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

    // 3. Tabela de Despesas
    const tbodyDesp = document.querySelector('#tabelaDespesasGerais tbody');
    if (tbodyDesp) {
        tbodyDesp.innerHTML = '';
        CACHE.despesas.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
            tbodyDesp.innerHTML += `
                <tr>
                    <td>${formatarDataBr(d.data)}</td>
                    <td>${d.veiculoRef || '-'}</td>
                    <td>${d.descricao}</td>
                    <td style="color:red; font-weight:bold;">${formatarMoeda(d.valor)}</td>
                    <td>${d.formaPagamento}</td>
                    <td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td>
                </tr>`;
        });
    }

    // 4. Veículos, Contratantes, etc. (Padrão similar)
    renderizarTabelaGenerica('#tabelaVeiculos tbody', CACHE.veiculos, ['placa', 'modelo', 'ano']);
    renderizarTabelaGenerica('#tabelaContratantes tbody', CACHE.contratantes, ['razaoSocial', 'cnpj', 'telefone']);
    
    // 5. Monitoramento (Check-ins)
    renderizarTabelaMonitoramento();
};

// Renderizador Genérico Auxiliar
function renderizarTabelaGenerica(selector, data, keys) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(item => {
        let cols = keys.map(k => `<td>${item[k] || '-'}</td>`).join('');
        tbody.innerHTML += `<tr>${cols}<td><button class="btn-mini delete-btn">X</button></td></tr>`;
    });
}

window.renderizarTabelaMonitoramento = function() {
    const tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    const hoje = obterDataAtualISO();
    // Filtra operações de hoje ou agendadas futuras
    const opsAtivas = CACHE.operacoes.filter(op => op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');

    if(opsAtivas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma rota ativa.</td></tr>';
        return;
    }

    opsAtivas.forEach(op => {
        const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '---';
        let statusCheckin = '<span class="status-pill pill-pending">AGUARDANDO</span>';
        if(op.status === 'EM_ANDAMENTO') statusCheckin = '<span class="status-pill pill-active">EM ROTA</span>';

        tbody.innerHTML += `
            <tr>
                <td>${formatarDataBr(op.data)}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${mot}</td>
                <td>${statusCheckin}</td>
                <td>
                    <button class="btn-mini btn-success" title="Forçar Checkin" onclick="forcarCheckin('${op.id}')"><i class="fas fa-check"></i></button>
                </td>
            </tr>
        `;
    });
};

// --- 6. DASHBOARD E GRÁFICOS ---

window.atualizarDashboard = function() {
    // Filtra operações do mês atual
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    const opsMes = CACHE.operacoes.filter(op => {
        const d = new Date(op.data);
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual && op.status === 'CONFIRMADA';
    });

    // Cálculos
    const faturamento = opsMes.reduce((sum, op) => sum + (op.faturamento || 0), 0);
    
    // Custos (Combustível + Despesas Operacionais + Despesas Gerais do Mês)
    const custosOp = opsMes.reduce((sum, op) => {
        let c = (op.combustivel || 0) + (op.despesas || 0) + (op.comissao || 0);
        // Soma diárias de ajudantes
        if(op.ajudantes) op.ajudantes.forEach(a => c += (a.diaria || 0));
        return sum + c;
    }, 0);

    const despesasGeraisMes = CACHE.despesas.filter(d => {
        const dDate = new Date(d.data);
        return dDate.getMonth() === mesAtual && dDate.getFullYear() === anoAtual;
    }).reduce((sum, d) => sum + (d.valor || 0), 0);

    const custoTotal = custosOp + despesasGeraisMes;
    const lucro = faturamento - custoTotal;

    // Atualiza HTML
    document.getElementById('faturamentoMes').innerText = formatarMoeda(faturamento);
    document.getElementById('despesasMes').innerText = formatarMoeda(custoTotal);
    document.getElementById('receitaMes').innerText = formatarMoeda(lucro);

    renderizarGrafico(anoAtual);
    renderizarCalendario();
};

window.renderizarGrafico = function(ano) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    // Prepara dados por mês (0-11)
    const receitas = Array(12).fill(0);
    const despesas = Array(12).fill(0);

    CACHE.operacoes.forEach(op => {
        const d = new Date(op.data);
        if (d.getFullYear() === ano && op.status === 'CONFIRMADA') {
            receitas[d.getMonth()] += (op.faturamento || 0);
            despesas[d.getMonth()] += ((op.combustivel || 0) + (op.despesas || 0) + (op.comissao || 0));
        }
    });
    
    CACHE.despesas.forEach(d => {
        const dt = new Date(d.data);
        if(dt.getFullYear() === ano) despesas[dt.getMonth()] += (d.valor || 0);
    });

    if (ESTADO.chartInstance) ESTADO.chartInstance.destroy();

    ESTADO.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'],
            datasets: [
                { label: 'Receitas', data: receitas, backgroundColor: '#2e7d32' },
                { label: 'Despesas', data: despesas, backgroundColor: '#c62828' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

// --- 7. RELATÓRIOS E RECIBOS ---

window.gerarRelatorioGeral = function() {
    const inicio = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const motId = document.getElementById('selectMotoristaRelatorio').value;

    if (!inicio || !fim) return alert("Selecione o período.");

    const opsFiltradas = CACHE.operacoes.filter(op => {
        return op.data >= inicio && op.data <= fim && 
               (motId === "" || String(op.motoristaId) === motId) &&
               op.status === 'CONFIRMADA';
    });

    let totalFat = 0;
    let html = `<h3>RELATÓRIO DE ${formatarDataBr(inicio)} A ${formatarDataBr(fim)}</h3>
                <table class="data-table" style="width:100%; margin-top:15px;">
                <thead><tr><th>DATA</th><th>MOTORISTA</th><th>VEÍCULO</th><th>VALOR</th></tr></thead><tbody>`;

    opsFiltradas.forEach(op => {
        totalFat += op.faturamento;
        const mot = CACHE.funcionarios.find(f => f.id == op.motoristaId)?.nome || '-';
        html += `<tr>
                    <td>${formatarDataBr(op.data)}</td>
                    <td>${mot}</td>
                    <td>${op.veiculoPlaca}</td>
                    <td>${formatarMoeda(op.faturamento)}</td>
                 </tr>`;
    });

    html += `</tbody></table>
             <div style="margin-top:20px; text-align:right; font-size:1.2rem;">
                <strong>TOTAL FATURADO: ${formatarMoeda(totalFat)}</strong>
             </div>`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.gerarReciboPagamento = function() {
    const motId = document.getElementById('selectMotoristaRecibo').value;
    const inicio = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;

    if (!motId || !inicio || !fim) return alert("Preencha todos os campos.");

    const func = CACHE.funcionarios.find(f => String(f.id) === String(motId));
    
    // Calcula comissões ou diárias
    let totalPagar = 0;
    let itensHtml = '';

    CACHE.operacoes.forEach(op => {
        if (op.data >= inicio && op.data <= fim && op.status === 'CONFIRMADA') {
            // Se for Motorista
            if (String(op.motoristaId) === motId) {
                totalPagar += (op.comissao || 0);
                if (op.comissao > 0) {
                    itensHtml += `<li>${formatarDataBr(op.data)} - Viagem ${op.veiculoPlaca}: ${formatarMoeda(op.comissao)}</li>`;
                }
            }
            // Se for Ajudante
            if (op.ajudantes) {
                const aj = op.ajudantes.find(a => String(a.id) === motId);
                if (aj) {
                    totalPagar += (aj.diaria || 0);
                    itensHtml += `<li>${formatarDataBr(op.data)} - Diária (Ajudante): ${formatarMoeda(aj.diaria)}</li>`;
                }
            }
        }
    });

    const htmlRecibo = `
        <div style="border:2px solid #000; padding:30px; background:#fff; font-family:Courier;">
            <h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>
            <p><strong>BENEFICIÁRIO:</strong> ${func.nome}</p>
            <p><strong>CPF:</strong> ${func.documento || '-'}</p>
            <hr>
            <p>Recebi a importância de <strong>${formatarMoeda(totalPagar)}</strong> referente aos serviços prestados no período de ${formatarDataBr(inicio)} a ${formatarDataBr(fim)}.</p>
            <ul>${itensHtml}</ul>
            <br><br>
            <div style="text-align:center;">
                ___________________________________<br>
                ASSINATURA
            </div>
            <div style="text-align:center; margin-top:10px;">
                Data: ${formatarDataBr(obterDataAtualISO())}
            </div>
        </div>
    `;

    const win = window.open('', '', 'width=800,height=600');
    win.document.write(htmlRecibo);
    win.print();
};

window.exportarRelatorioPDF = function() {
    const el = document.getElementById('reportContent');
    if (!el.innerText) return alert("Gere um relatório primeiro.");
    html2pdf().set({ margin: 10, filename: 'relatorio_logimaster.pdf' }).from(el).save();
};

// --- 8. INICIALIZAÇÃO E NAVEGAÇÃO ---

window.mostrarPagina = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        // Fecha menu mobile se estiver aberto
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
};

window.initSystemByRole = function(user) {
    ESTADO.usuarioAtual = user;
    console.log("Inicializando sistema para: " + user.role);

    // 1. Controle de Acesso (Menu)
    document.querySelectorAll('nav ul').forEach(ul => ul.style.display = 'none');
    
    if (user.role === 'admin' || user.email === 'admin@logimaster.com') {
        document.getElementById('menu-admin').style.display = 'block';
        mostrarPagina('home');
        // Inicia Listeners do Firebase (Tempo Real)
        iniciarOuvintesFirebase(user.company);
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        mostrarPagina('employee-home');
        // Funcionário vê apenas dados limitados (Implementar lógica específica se necessário)
        iniciarOuvintesFirebase(user.company); 
    }
};

function iniciarOuvintesFirebase(companyId) {
    if (!window.dbRef || !companyId) return;
    const { db, doc, onSnapshot } = window.dbRef;

    // Função auxiliar para criar ouvinte
    const ouvir = (chave) => {
        onSnapshot(doc(db, 'companies', companyId, 'data', chave), (snap) => {
            if (snap.exists()) {
                const dados = snap.data().items || [];
                // Atualiza cache
                if (chave === DB_KEYS.OPERACOES) {
                    CACHE.operacoes = dados;
                    atualizarDashboard(); // Recalcula tudo quando entra dado novo
                }
                else if (chave === DB_KEYS.FUNCIONARIOS) CACHE.funcionarios = dados;
                else if (chave === DB_KEYS.VEICULOS) CACHE.veiculos = dados;
                else if (chave === DB_KEYS.CONTRATANTES) CACHE.contratantes = dados;
                else if (chave === DB_KEYS.DESPESAS_GERAIS) CACHE.despesas = dados;
                else if (chave === DB_KEYS.ATIVIDADES) CACHE.atividades = dados;

                // Atualiza UI
                preencherSelects();
                renderizarTabelas();
            }
        });
    };

    // Inicia todos os ouvintes
    Object.values(DB_KEYS).forEach(chave => ouvir(chave));
}

// Binds de Eventos (Quando o DOM carrega)
document.addEventListener('DOMContentLoaded', () => {
    // Formulários
    document.getElementById('formOperacao')?.addEventListener('submit', salvarOperacao);
    document.getElementById('formFuncionario')?.addEventListener('submit', salvarFuncionario);
    document.getElementById('formVeiculo')?.addEventListener('submit', salvarVeiculo);
    document.getElementById('formDespesaGeral')?.addEventListener('submit', salvarDespesa);

    // Botões manuais
    document.getElementById('btnManualAddAjudante')?.addEventListener('click', () => {
        const sel = document.getElementById('selectAjudantesOperacao');
        const diaria = prompt("Valor da Diária (R$):");
        if (sel.value && diaria) {
            CACHE.ajudantesTemp.push({ id: sel.value, diaria: parseFloat(diaria.replace(',','.')) });
            renderizarListaAjudantes();
        }
    });

    // Navegação (Links do Menu)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            mostrarPagina(page);
            // Atualiza classe active no menu
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Menu Mobile
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebarOverlay').classList.add('active');
    });

    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
    
    // Botões de Relatório (IDs adicionados no HTML corrigido)
    document.getElementById('btnGerarRelatorio')?.addEventListener('click', gerarRelatorioGeral);
    document.getElementById('btnGerarRecibo')?.addEventListener('click', gerarReciboPagamento);
    document.getElementById('btnExportarPDF')?.addEventListener('click', exportarRelatorioPDF);
});

// Helper de Edição (Placeholder)
window.preencherFormFunc = function(id) {
    alert("Função de edição: Implemente o preenchimento dos campos buscando pelo ID: " + id);
    // Dica: Use CACHE.funcionarios.find(...) e document.getElementById(...).value = ...
};

window.excluirDespesa = async function(id) {
    if(!confirm("Excluir despesa?")) return;
    const lista = CACHE.despesas.filter(d => d.id !== id);
    await salvarDados(DB_KEYS.DESPESAS_GERAIS, lista);
    renderizarTabelas();
    atualizarDashboard();
};