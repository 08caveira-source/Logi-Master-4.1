// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.3 (CHECK-IN EQUIPE COMPLETO)
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
// =============================================================================

// 1. CONSTANTES DE ARMAZENAMENTO
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';

// 2. VARIÁVEIS GLOBAIS
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 
window._mensagemAtualId = null; 

// 3. CACHE LOCAL
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];

// 4. FUNÇÕES DE FORMATAÇÃO
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    var partes = dataIso.split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// 5. CAMADA DE DADOS

function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

function carregarDadosGenerico(chave, variavelCache, valorPadrao) {
    try {
        var dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : valorPadrao;
    } catch (erro) {
        console.error("Erro ao carregar " + chave, erro);
        return valorPadrao;
    }
}

function carregarTodosDadosLocais() {
    console.log("Carregando dados locais...");
    CACHE_FUNCIONARIOS = carregarDadosGenerico(CHAVE_DB_FUNCIONARIOS, [], []);
    CACHE_VEICULOS = carregarDadosGenerico(CHAVE_DB_VEICULOS, [], []);
    CACHE_CONTRATANTES = carregarDadosGenerico(CHAVE_DB_CONTRATANTES, [], []);
    CACHE_OPERACOES = carregarDadosGenerico(CHAVE_DB_OPERACOES, [], []);
    CACHE_MINHA_EMPRESA = carregarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, {}, {});
    CACHE_DESPESAS = carregarDadosGenerico(CHAVE_DB_DESPESAS, [], []);
    CACHE_ATIVIDADES = carregarDadosGenerico(CHAVE_DB_ATIVIDADES, [], []);
    CACHE_PROFILE_REQUESTS = carregarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, [], []);
}

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
            console.log("Sincronizado: " + chave);
        } catch (erro) {
            console.error("Erro nuvem:", erro);
        }
    }
}

// Wrappers
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }

carregarTodosDadosLocais();
// =============================================================================
// ARQUIVO: script.js
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS E VISUALIZAÇÃO
// =============================================================================

window.atualizarDashboard = function() {
    console.log("Calculando métricas...");
    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;

        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        var custoOp = (Number(op.despesas) || 0) + (Number(op.combustivel) || 0);
        
        if (!teveFalta) {
            custoOp += (Number(op.comissao) || 0);
        }

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => custoOp += (Number(aj.diaria) || 0));
        }

        receitaHistorico += valorFat;

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    CACHE_DESPESAS.forEach(function(desp) {
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
            custosMes += (Number(desp.valor) || 0);
        }
    });

    var lucroMes = faturamentoMes - custosMes;
    var margem = faturamentoMes > 0 ? ((lucroMes / faturamentoMes) * 100) : 0;

    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(custosMes);
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }
    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 
    if (window.chartInstance) window.chartInstance.destroy();

    var receita = 0;
    var combustivel = 0;
    var pessoal = 0; 
    var manutencaoGeral = 0; 
    
    CACHE_OPERACOES.forEach(op => {
        var d = new Date(op.data + 'T12:00:00');
        if (op.status !== 'CANCELADA' && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            
            if (!op.checkins || !op.checkins.faltaMotorista) {
                pessoal += Number(op.comissao || 0);
            }
            if (op.ajudantes) op.ajudantes.forEach(aj => pessoal += (Number(aj.diaria)||0));
            manutencaoGeral += Number(op.despesas || 0);
        }
    });

    CACHE_DESPESAS.forEach(d => {
        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) manutencaoGeral += Number(d.valor || 0);
    });

    var lucro = receita - (combustivel + pessoal + manutencaoGeral);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'CUSTO COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO/GERAL', 'LUCRO LÍQUIDO'],
            datasets: [{
                label: 'Resultados do Mês (R$)',
                data: [receita, combustivel, pessoal, manutencaoGeral, lucro],
                backgroundColor: ['rgba(46, 125, 50, 0.7)', 'rgba(198, 40, 40, 0.7)', 'rgba(255, 152, 0, 0.7)', 'rgba(156, 39, 176, 0.7)', (lucro >= 0 ? 'rgba(0, 200, 83, 0.9)' : 'rgba(183, 28, 28, 0.9)')],
                borderColor: [ '#1b5e20', '#b71c1c', '#e65100', '#4a148c', '#000' ],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

window.renderizarCalendario = function() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay(); 
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        grid.appendChild(emptyCell);
    }

    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        var cellContent = `<span>${dia}</span>`;
        var opsDoDia = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            cellContent += `<div class="event-dot"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            cell.onclick = (function(ds) { return function() { abrirModalDetalhesDia(ds); }; })(dateStr);
        } else {
            cell.onclick = (function(dateString) { return function() { document.getElementById('operacaoData').value = dateString; var btnOperacoes = document.querySelector('[data-page="operacoes"]'); if(btnOperacoes) btnOperacoes.click(); }; })(dateStr);
        }
        cell.innerHTML = cellContent;
        grid.appendChild(cell);
    }
};

window.changeMonth = function(direction) {
    window.currentDate.setMonth(window.currentDate.getMonth() + direction);
    renderizarCalendario();
    atualizarDashboard(); 
};

window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(op) { return op.veiculoPlaca === placa && op.status !== 'CANCELADA'; });
    if (ops.length === 0) return 0;
    var totalKm = 0; var totalLitros = 0;
    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var preco = Number(op.precoLitro) || 0;
        totalKm += km;
        if (valorAbastecido > 0 && preco > 0) { totalLitros += (valorAbastecido / preco); }
    });
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-10);
    var somaPrecos = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return somaPrecos / ultimas.length;
};

window.abrirModalDetalhesDia = function(dataString) {
    var listaOperacoes = CACHE_OPERACOES;
    var operacoesDoDia = listaOperacoes.filter(function(op) { return op.data === dataString && op.status !== 'CANCELADA'; });
    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');
    if (!modalBody) return;

    if (modalTitle) modalTitle.textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);

    var totalFaturamento = 0;
    var totalCustoCalculadoDiesel = 0;
    var totalOutrasDespesas = 0;

    var htmlLista = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%; font-size:0.75rem;"><thead><tr style="background:#263238; color:white;"><th width="15%">CLIENTE</th><th width="15%">VEÍCULO</th><th width="20%">EQUIPE</th><th width="30%">FINANCEIRO</th><th width="20%">CONSUMO</th></tr></thead><tbody>';

    operacoesDoDia.forEach(function(op) {
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome.split(' ')[0] : '---';
        var nomesAjudantes = [];
        if(op.ajudantes) op.ajudantes.forEach(aj => { var f = buscarFuncionarioPorId(aj.id); if(f) nomesAjudantes.push(f.nome.split(' ')[0]); });
        
        var stringEquipe = '';
        if (op.checkins && op.checkins.faltaMotorista) { stringEquipe = `<strong style="color:red;">MOT: FALTA</strong>`; } else { stringEquipe = `<strong>Mot:</strong> ${nomeMot}`; }
        if(nomesAjudantes.length > 0) stringEquipe += `<br><strong>Ajud:</strong> ${nomesAjudantes.join(', ')}`;
        
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial.substring(0, 15) : 'CLIENTE';

        var receita = Number(op.faturamento) || 0;
        var custoPessoal = 0;
        if (!op.checkins || !op.checkins.faltaMotorista) { custoPessoal = Number(op.comissao) || 0; }
        if(op.ajudantes) op.ajudantes.forEach(aj => custoPessoal += (Number(aj.diaria)||0));
        var custoExtra = Number(op.despesas) || 0;
        
        var kmNaViagem = Number(op.kmRodado) || 0;
        var mediaGlobal = calcularMediaGlobalVeiculo(op.veiculoPlaca);
        var precoLitroRef = Number(op.precoLitro) > 0 ? Number(op.precoLitro) : obterPrecoMedioCombustivel(op.veiculoPlaca);
        var custoDieselCalculado = 0;
        if (mediaGlobal > 0 && kmNaViagem > 0 && precoLitroRef > 0) { custoDieselCalculado = (kmNaViagem / mediaGlobal) * precoLitroRef; }

        var custoTotalViagem = custoPessoal + custoExtra + custoDieselCalculado;
        var lucroOp = receita - custoTotalViagem;

        totalFaturamento += receita;
        totalCustoCalculadoDiesel += custoDieselCalculado;
        totalOutrasDespesas += (custoPessoal + custoExtra);

        htmlLista += `<tr style="border-bottom:1px solid #ddd;"><td><span style="font-weight:bold; color:#555;">${nomeCli}</span></td><td><strong>${op.veiculoPlaca}</strong><br><small style="color:blue">G: ${mediaGlobal > 0 ? mediaGlobal.toFixed(2) : '-'} Km/L</small></td><td>${stringEquipe}</td><td><div style="display:flex; justify-content:space-between;"><span style="color:var(--success-color);">Fat: ${formatarValorMoeda(receita)}</span><span style="color:var(--danger-color);">Op: ${formatarValorMoeda(custoTotalViagem)}</span></div><div><strong>Lucro: <span style="color:${lucroOp>=0?'green':'red'}">${formatarValorMoeda(lucroOp)}</span></strong></div></td><td style="text-align:center; background:#fff8e1;"><strong style="color:#f57f17;">${formatarValorMoeda(custoDieselCalculado)}</strong><br><small>Ref: ${kmNaViagem}km</small></td></tr>`;
    });

    htmlLista += '</tbody></table></div>';
    var totalLucroLiquido = totalFaturamento - (totalCustoCalculadoDiesel + totalOutrasDespesas);

    if (modalSummary) {
        modalSummary.innerHTML = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; background:#e0f2f1; padding:10px; border-radius:6px; margin-bottom:10px;"><div style="text-align:center;"><small>FATURAMENTO</small><br><span style="font-weight:800; color:#004d40;">${formatarValorMoeda(totalFaturamento)}</span></div><div style="text-align:center;"><small>DESPESAS OPER.</small><br><span style="font-weight:800; color:#c62828;">${formatarValorMoeda(totalOutrasDespesas)}</span></div><div style="text-align:center;"><small>DIESEL (CALC)</small><br><span style="font-weight:800; color:#f57f17;">${formatarValorMoeda(totalCustoCalculadoDiesel)}</span></div><div style="text-align:center; background:${totalLucroLiquido>=0?'#c8e6c9':'#ffcdd2'};"><small>LUCRO LÍQUIDO</small><br><span style="font-weight:800; color:${totalLucroLiquido>=0?'#1b5e20':'#b71c1c'};">${formatarValorMoeda(totalLucroLiquido)}</span></div></div>`;
    }

    modalBody.innerHTML = htmlLista;
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// ARQUIVO: script.js
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E INTERFACE DE FORMULÁRIOS
// =============================================================================

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
            var criarLogin = (!document.getElementById('funcionarioId').value && senha);
            var novoUID = id; 

            if (criarLogin) {
                if(senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                console.log("Criando usuário no Auth...");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, name: nome, email: email, role: funcao,
                    company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(), approved: true
                });
            }

            var funcionarioObj = {
                id: novoUID, nome: nome, funcao: funcao, documento: document.getElementById('funcDocumento').value,
                email: email, telefone: document.getElementById('funcTelefone').value, pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                cnh: document.getElementById('funcCNH').value, validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoriaCNH: document.getElementById('funcCategoriaCNH').value, cursoDescricao: document.getElementById('funcCursoDescricao').value
            };

            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(funcionarioObj);
            await salvarListaFuncionarios(lista);
            alert("Salvo com sucesso!");
            e.target.reset(); document.getElementById('funcionarioId').value = '';
            toggleDriverFields(); preencherTodosSelects();

        } catch (erro) { console.error(erro); alert("Erro: " + erro.message); } 
        finally { btnSubmit.disabled = false; btnSubmit.innerHTML = textoOriginal; }
    }
});

// Listeners Padrão
document.addEventListener('submit', function(e) { if (e.target.id === 'formVeiculo') { e.preventDefault(); var placa = document.getElementById('veiculoPlaca').value.toUpperCase(); var novo = { placa: placa, modelo: document.getElementById('veiculoModelo').value.toUpperCase(), ano: document.getElementById('veiculoAno').value, renavam: document.getElementById('veiculoRenavam').value, chassi: document.getElementById('veiculoChassi').value }; var lista = CACHE_VEICULOS.filter(v => v.placa !== placa); lista.push(novo); salvarListaVeiculos(lista).then(() => { alert("Veículo Salvo!"); e.target.reset(); preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formContratante') { e.preventDefault(); var cnpj = document.getElementById('contratanteCNPJ').value; var novo = { cnpj: cnpj, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value }; var lista = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj); lista.push(novo); salvarListaContratantes(lista).then(() => { alert("Cliente Salvo!"); e.target.reset(); preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formAtividade') { e.preventDefault(); var id = document.getElementById('atividadeId').value || Date.now().toString(); var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() }; var lista = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id)); lista.push(novo); salvarListaAtividades(lista).then(() => { alert("Atividade Salva!"); e.target.reset(); document.getElementById('atividadeId').value = ''; preencherTodosSelects(); }); } });
document.addEventListener('submit', function(e) { if (e.target.id === 'formMinhaEmpresa') { e.preventDefault(); var dados = { razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj: document.getElementById('minhaEmpresaCNPJ').value, telefone: document.getElementById('minhaEmpresaTelefone').value }; salvarDadosMinhaEmpresa(dados).then(() => { alert("Dados da Empresa Atualizados!"); renderizarInformacoesEmpresa(); }); } });

// -----------------------------------------------------------------------------
// SALVAR OPERAÇÃO (COM INICIALIZAÇÃO DE CHECKINS)
// -----------------------------------------------------------------------------
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
        var statusFinal = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
        
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
            
            // GARANTE QUE O OBJETO CHECKINS EXISTA PARA TODOS (MOT E AJUDANTES)
            checkins: opAntiga ? opAntiga.checkins : { 
                motorista: false, 
                faltaMotorista: false,
                ajudantes: {} // Objeto para checkin de ajudantes (id: bool)
            },
            ajudantes: window._operacaoAjudantesTempList || [],
            kmInicial: opAntiga ? opAntiga.kmInicial : 0,
            kmFinal: opAntiga ? opAntiga.kmFinal : 0
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert(isAgendamento ? "Operação Agendada!" : "Operação Salva e Confirmada!");
            e.target.reset(); document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = []; 
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects(); renderizarCalendario(); atualizarDashboard();
        });
    }
});

// EXCLUSÃO
window.excluirFuncionario = async function(id) {
    if(!confirm("ATENÇÃO: Excluir remove acesso e dados. Continuar?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", id));
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        alert("Removido com sucesso.");
        preencherTodosSelects();
    } catch (e) {
        alert("Erro na nuvem: " + e.message + ". Removendo localmente.");
        const novaLista = CACHE_FUNCIONARIOS.filter(f => String(f.id) !== String(id));
        await salvarListaFuncionarios(novaLista);
        preencherTodosSelects();
    }
};

window.excluirVeiculo = function(placa) { if(!confirm("Excluir Veículo?")) return; salvarListaVeiculos(CACHE_VEICULOS.filter(v => v.placa !== placa)).then(() => preencherTodosSelects()); };
window.excluirContratante = function(cnpj) { if(!confirm("Excluir Cliente?")) return; salvarListaContratantes(CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj)).then(() => preencherTodosSelects()); };
window.excluirAtividade = function(id) { if(!confirm("Excluir este tipo de serviço?")) return; salvarListaAtividades(CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id))).then(() => preencherTodosSelects()); };
window.excluirOperacao = function(id) { if(!confirm("Remover operação?")) return; salvarListaOperacoes(CACHE_OPERACOES.filter(o => String(o.id) !== String(id))).then(() => { preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); }); };

window.toggleDriverFields = function() { var select = document.getElementById('funcFuncao'); var divMotorista = document.getElementById('driverSpecificFields'); if (select && divMotorista) { divMotorista.style.display = (select.value === 'motorista') ? 'block' : 'none'; } };
window.toggleDespesaParcelas = function() { var modo = document.getElementById('despesaModoPagamento').value; var div = document.getElementById('divDespesaParcelas'); if (div) div.style.display = (modo === 'parcelado') ? 'flex' : 'none'; };
window.renderizarListaAjudantesAdicionados = function() { var ul = document.getElementById('listaAjudantesAdicionados'); if (!ul) return; ul.innerHTML = ''; (window._operacaoAjudantesTempList || []).forEach(item => { var func = buscarFuncionarioPorId(item.id); var nome = func ? func.nome : 'Desconhecido'; var li = document.createElement('li'); li.innerHTML = `<span>${nome} <small>(Diária: ${formatarValorMoeda(item.diaria)})</small></span><button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button>`; ul.appendChild(li); }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var sel = document.getElementById('selectAjudantesOperacao'); var idAj = sel.value; if (!idAj) return alert("Selecione um ajudante."); if (window._operacaoAjudantesTempList.find(x => x.id === idAj)) return alert("Já está na lista."); var valor = prompt("Valor da Diária:"); if (valor) { window._operacaoAjudantesTempList.push({ id: idAj, diaria: Number(valor.replace(',', '.')) }); renderizarListaAjudantesAdicionados(); sel.value = ""; } });

function preencherTodosSelects() {
    const fill = (id, dados, valKey, textKey, defText) => { var el = document.getElementById(id); if (!el) return; var atual = el.value; el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); if(atual) el.value = atual; };
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE MOTORISTA...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE VEÍCULO...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE CLIENTE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE TIPO DE SERVIÇO...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR AJUDANTE...');
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS AS ATIVIDADES');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');
    fill('selectVeiculoRecibo', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRecibo', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'SEM VÍNCULO (GERAL)');
    fill('msgRecipientSelect', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');

    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    renderizarInformacoesEmpresa();
    
    if(typeof renderizarTabelaProfileRequests === 'function') renderizarTabelaProfileRequests();
    if(typeof renderizarTabelaMonitoramento === 'function') {
        renderizarTabelaMonitoramento();
        renderizarTabelaFaltas(); 
    }
}

function renderizarTabelaFuncionarios() { var tbody = document.querySelector('#tabelaFuncionarios tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_FUNCIONARIOS.forEach(f => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaVeiculos() { var tbody = document.querySelector('#tabelaVeiculos tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_VEICULOS.forEach(v => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaContratantes() { var tbody = document.querySelector('#tabelaContratantes tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_CONTRATANTES.forEach(c => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${formatarTelefoneBrasil(c.telefone)}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaAtividades() { var tbody = document.querySelector('#tabelaAtividades tbody'); if (!tbody) return; tbody.innerHTML = ''; CACHE_ATIVIDADES.forEach(a => { var tr = document.createElement('tr'); var btnActions = window.MODO_APENAS_LEITURA ? '' : `<button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button>`; tr.innerHTML = `<td>${a.id.substr(-4)}</td><td>${a.nome}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarTabelaOperacoes() { var tbody = document.querySelector('#tabelaOperacoes tbody'); if (!tbody) return; tbody.innerHTML = ''; var lista = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data)); lista.forEach(op => { if(op.status === 'CANCELADA') return; var mot = buscarFuncionarioPorId(op.motoristaId); var nomeMot = mot ? mot.nome : 'Excluído'; var statusClass = op.status === 'CONFIRMADA' ? 'pill-active' : (op.status === 'EM_ANDAMENTO' ? 'pill-active' : 'pill-pending'); var statusStyle = op.status === 'EM_ANDAMENTO' ? 'style="background:orange;"' : ''; var btnActions = `<button class="btn-mini btn-primary" onclick="alert('Detalhes no calendário.')"><i class="fas fa-eye"></i></button>`; if (!window.MODO_APENAS_LEITURA) { btnActions = `<button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button><button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button>`; } var tr = document.createElement('tr'); tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td><strong>${nomeMot}</strong><br><small>${op.veiculoPlaca}</small></td><td><span class="status-pill ${statusClass}" ${statusStyle}>${op.status}</span></td><td style="color:green; font-weight:bold;">${formatarValorMoeda(op.faturamento)}</td><td>${btnActions}</td>`; tbody.appendChild(tr); }); }
function renderizarInformacoesEmpresa() { var div = document.getElementById('viewMinhaEmpresaContent'); if (CACHE_MINHA_EMPRESA.razaoSocial) { div.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>CNPJ: ${CACHE_MINHA_EMPRESA.cnpj}<br>Tel: ${formatarTelefoneBrasil(CACHE_MINHA_EMPRESA.telefone)}`; } else { div.innerHTML = "Nenhum dado cadastrado."; } }
window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (!f) return; document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email || ''; document.getElementById('funcTelefone').value = f.telefone; document.getElementById('funcPix').value = f.pix || ''; document.getElementById('funcEndereco').value = f.endereco || ''; toggleDriverFields(); if (f.funcao === 'motorista') { document.getElementById('funcCNH').value = f.cnh || ''; document.getElementById('funcValidadeCNH').value = f.validadeCNH || ''; document.getElementById('funcCategoriaCNH').value = f.categoriaCNH || ''; document.getElementById('funcCursoDescricao').value = f.cursoDescricao || ''; } document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); window.scrollTo(0,0); };
window.preencherFormularioVeiculo = function(placa) { var v = buscarVeiculoPorPlaca(placa); if (!v) return; document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.getElementById('veiculoAno').value = v.ano; document.getElementById('veiculoRenavam').value = v.renavam || ''; document.getElementById('veiculoChassi').value = v.chassi || ''; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); };
window.preencherFormularioContratante = function(cnpj) { var c = buscarContratantePorCnpj(cnpj); if (!c) return; document.getElementById('contratanteCNPJ').value = c.cnpj; document.getElementById('contratanteRazaoSocial').value = c.razaoSocial; document.getElementById('contratanteTelefone').value = c.telefone; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); };
// Preencher operação mantido acima mas com correção do KM
// =============================================================================
// ARQUIVO: script.js
// PARTE 4: RELATÓRIOS, RECIBOS E SISTEMA (FINAL)
// =============================================================================

// -----------------------------------------------------------------------------
// RENDERIZAÇÃO DE TABELAS ESPECÍFICAS (ADMIN - MONITORAMENTO E EQUIPE)
// -----------------------------------------------------------------------------

// Tabela 1: Rotas Ativas (Sem Faltas)
window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra: Ativas E SEM Falta
    var ativas = CACHE_OPERACOES.filter(op => 
        (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO') && 
        op.status !== 'CANCELADA' && 
        (!op.checkins || !op.checkins.faltaMotorista)
    );

    if (ativas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhuma rota ativa no momento.</td></tr>';
        return;
    }

    ativas.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = mot ? mot.nome : 'N/A';
        
        var statusCheckin = 'AGUARDANDO';
        if (op.status === 'EM_ANDAMENTO') {
            statusCheckin = `<span style="color:#2e7d32; font-weight:bold;">EM ROTA (KM ${op.kmInicial || '?'})</span>`;
        }

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td><strong>${op.veiculoPlaca}</strong></td>
            <td>${nomeMot}</td>
            <td>${statusCheckin}</td>
            <td>
                <button class="btn-mini btn-danger" onclick="registrarFaltaMotorista('${op.id}')" title="Registrar Falta"><i class="fas fa-user-times"></i> FALTA</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// Tabela 2: Faltas Registradas (Abaixo)
window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var faltas = CACHE_OPERACOES.filter(op => op.checkins && op.checkins.faltaMotorista);

    if (faltas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma falta registrada.</td></tr>';
        return;
    }

    faltas.forEach(op => {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var tr = document.createElement('tr');
        tr.style.backgroundColor = '#ffebee';
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(op.data)}</td>
            <td>${mot ? mot.nome : 'N/A'}</td>
            <td>MOTORISTA</td>
            <td style="color:red; font-weight:bold;">FALTA (Viagem #${op.id.substr(-4)})</td>
            <td>
                <button class="btn-mini btn-secondary" onclick="removerFaltaMotorista('${op.id}')" title="Desfazer"><i class="fas fa-undo"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.registrarFaltaMotorista = function(opId) {
    if(!confirm("Confirmar FALTA do motorista? A viagem continuará sem custo de mão-de-obra.")) return;
    
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        if(!op.checkins) op.checkins = {};
        op.checkins.faltaMotorista = true;
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            preencherTodosSelects(); // Atualiza ambas as tabelas
        });
    }
};

window.removerFaltaMotorista = function(opId) {
    if(!confirm("Remover a falta e restaurar pagamento?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op && op.checkins) {
        op.checkins.faltaMotorista = false;
        salvarListaOperacoes(CACHE_OPERACOES).then(() => preencherTodosSelects());
    }
};

// Tabela 3: Solicitações de Perfil (Conectada ao Funcionário)
window.renderizarTabelaProfileRequests = function() {
    var tbody = document.querySelector('#tabelaProfileRequests tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtra apenas pendentes
    var pendentes = CACHE_PROFILE_REQUESTS.filter(req => req.status === 'PENDENTE');

    if (pendentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }

    pendentes.forEach((req, index) => {
        var realIndex = CACHE_PROFILE_REQUESTS.indexOf(req);
        var funcionario = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
        var nomeFunc = funcionario ? funcionario.nome : req.funcionarioEmail;

        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataParaBrasileiro(req.data.split('T')[0])}</td>
            <td>${nomeFunc}</td>
            <td>${req.campo}</td>
            <td>${req.valorNovo}</td>
            <td>
                <button class="btn-mini btn-success" onclick="aprovarSolicitacaoPerfil(${realIndex})" title="Aprovar"><i class="fas fa-check"></i></button>
                <button class="btn-mini btn-danger" onclick="rejeitarSolicitacaoPerfil(${realIndex})" title="Recusar"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.aprovarSolicitacaoPerfil = function(index) {
    var req = CACHE_PROFILE_REQUESTS[index];
    if(!confirm("Aprovar alteração de " + req.campo + " para " + req.valorNovo + "?")) return;
    
    var func = CACHE_FUNCIONARIOS.find(f => f.email === req.funcionarioEmail);
    if(func) {
        if(req.campo === 'TELEFONE') func.telefone = req.valorNovo;
        if(req.campo === 'ENDERECO') func.endereco = req.valorNovo;
        if(req.campo === 'PIX') func.pix = req.valorNovo;
        if(req.campo === 'CNH') func.cnh = req.valorNovo; 
        
        salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    
    req.status = 'APROVADO';
    salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => renderizarTabelaProfileRequests());
};

window.rejeitarSolicitacaoPerfil = function(index) {
    if(!confirm("Recusar solicitação?")) return;
    CACHE_PROFILE_REQUESTS[index].status = 'REJEITADO';
    salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => renderizarTabelaProfileRequests());
};

// ... (Restante das funções de Relatório/Recibo mantidas) ...
window.gerarRelatorioGeral = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var motId = document.getElementById('selectMotoristaRelatorio').value;
    var veiculo = document.getElementById('selectVeiculoRelatorio').value;
    var contratante = document.getElementById('selectContratanteRelatorio').value;
    var atividadeId = document.getElementById('selectAtividadeRelatorio').value;

    if (!dataIni || !dataFim) return alert("Selecione as datas inicial e final.");

    var divResultados = document.getElementById('reportResults');
    var divConteudo = document.getElementById('reportContent');
    divResultados.style.display = 'block';

    var opsFiltradas = CACHE_OPERACOES.filter(function(op) {
        if (op.status === 'CANCELADA') return false;
        if (op.data < dataIni || op.data > dataFim) return false;
        
        if (motId && String(op.motoristaId) !== String(motId)) return false;
        if (veiculo && op.veiculoPlaca !== veiculo) return false;
        if (contratante && op.contratanteCNPJ !== contratante) return false;
        if (atividadeId && String(op.atividadeId) !== String(atividadeId)) return false;
        return true;
    });

    var html = '<h3 style="text-align:center; border-bottom:2px solid #ccc; padding-bottom:10px;">RELATÓRIO GERAL DE OPERAÇÕES</h3>';
    html += '<p><strong>Período:</strong> ' + formatarDataParaBrasileiro(dataIni) + ' a ' + formatarDataParaBrasileiro(dataFim) + '</p>';
    
    var filtrosTexto = [];
    if(motId) filtrosTexto.push("Motorista: " + (buscarFuncionarioPorId(motId)?.nome || motId));
    if(veiculo) filtrosTexto.push("Veículo: " + veiculo);
    if(contratante) filtrosTexto.push("Cliente: " + (buscarContratantePorCnpj(contratante)?.razaoSocial || contratante));
    if(atividadeId) filtrosTexto.push("Atividade: " + (buscarAtividadePorId(atividadeId)?.nome || atividadeId));
    if(filtrosTexto.length > 0) html += '<p style="font-size:0.85rem; color:#666;">Filtros: ' + filtrosTexto.join(' | ') + '</p>';

    html += '<table class="data-table" style="width:100%; border-collapse:collapse; margin-top:15px; font-size:0.85rem;">';
    html += '<thead><tr style="background:#eee;"><th>DATA</th><th>CLIENTE / ATIVIDADE</th><th>VEÍCULO</th><th>MOTORISTA</th><th>FATURAMENTO</th><th>CUSTOS TOTAIS</th><th>LUCRO</th></tr></thead><tbody>';

    var totalFat = 0;
    var totalCusto = 0;
    var totalLucro = 0;

    opsFiltradas.forEach(function(op) {
        var mot = buscarFuncionarioPorId(op.motoristaId);
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ);
        var ativ = buscarAtividadePorId(op.atividadeId);
        
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0);
        // Só soma comissão se não faltou
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custo += (Number(op.comissao)||0);
        }
        
        if(op.ajudantes) op.ajudantes.forEach(aj => custo += (Number(aj.diaria)||0));

        var lucro = (Number(op.faturamento)||0) - custo;

        totalFat += (Number(op.faturamento)||0);
        totalCusto += custo;
        totalLucro += lucro;

        html += '<tr>';
        html += '<td>' + formatarDataParaBrasileiro(op.data) + '</td>';
        html += '<td>' + (cli ? cli.razaoSocial : op.contratanteCNPJ) + '<br><small>' + (ativ ? ativ.nome : '') + '</small></td>';
        html += '<td>' + op.veiculoPlaca + '</td>';
        html += '<td>' + (mot ? mot.nome : 'N/A') + '</td>';
        html += '<td style="color:green;">' + formatarValorMoeda(op.faturamento) + '</td>';
        html += '<td style="color:red;">' + formatarValorMoeda(custo) + '</td>';
        html += '<td><strong>' + formatarValorMoeda(lucro) + '</strong></td>';
        html += '</tr>';
    });

    html += '</tbody><tfoot><tr style="background:#ddd; font-weight:bold;">';
    html += '<td colspan="4" style="text-align:right;">TOTAIS GERAIS:</td>';
    html += '<td style="color:green;">' + formatarValorMoeda(totalFat) + '</td>';
    html += '<td style="color:red;">' + formatarValorMoeda(totalCusto) + '</td>';
    html += '<td style="background:#ccc;">' + formatarValorMoeda(totalLucro) + '</td>';
    html += '</tr></tfoot></table>';

    divConteudo.innerHTML = html;
};

window.gerarRelatorioCobranca = function() {
    var dataIni = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var contratante = document.getElementById('selectContratanteRelatorio').value;

    if (!contratante) return alert("Para relatório de cobrança, selecione um CONTRATANTE específico.");
    if (!dataIni || !dataFim) return alert("Selecione as datas.");

    var divResultados = document.getElementById('reportResults');
    var divConteudo = document.getElementById('reportContent');
    divResultados.style.display = 'block';

    var cliData = buscarContratantePorCnpj(contratante);
    var nomeCli = cliData ? cliData.razaoSocial : contratante;

    var ops = CACHE_OPERACOES.filter(op => 
        op.contratanteCNPJ === contratante && 
        op.data >= dataIni && 
        op.data <= dataFim && 
        op.status !== 'CANCELADA'
    );

    var html = `<div style="padding:20px; font-family:Arial;">
        <h2 style="text-align:center;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</h2>
        <p><strong>CLIENTE:</strong> ${nomeCli}</p>
        <p><strong>CNPJ:</strong> ${contratante}</p>
        <p><strong>PERÍODO:</strong> ${formatarDataParaBrasileiro(dataIni)} a ${formatarDataParaBrasileiro(dataFim)}</p>
        <hr>
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <tr style="border-bottom:2px solid #000;"><th>DATA</th><th>VEÍCULO</th><th>SERVIÇO</th><th>VALOR</th></tr>`;
            
    var total = 0;
    ops.forEach(op => {
        var ativ = buscarAtividadePorId(op.atividadeId);
        html += `<tr>
            <td style="padding:8px;">${formatarDataParaBrasileiro(op.data)}</td>
            <td>${op.veiculoPlaca}</td>
            <td>${ativ ? ativ.nome : 'FRETE'}</td>
            <td>${formatarValorMoeda(op.faturamento)}</td>
        </tr>`;
        total += (Number(op.faturamento)||0);
    });

    html += `<tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="3" style="padding-top:10px;">TOTAL A PAGAR</td>
        <td style="padding-top:10px;">${formatarValorMoeda(total)}</td>
    </tr></table>
    <br><br>
    <p style="text-align:center; font-size:0.8rem;">Emitido por: ${CACHE_MINHA_EMPRESA.razaoSocial || 'LOGIMASTER SISTEMAS'}</p>
    </div>`;

    divConteudo.innerHTML = html;
};

window.exportarRelatorioPDF = function() {
    var element = document.getElementById('reportContent');
    if (!element || element.innerHTML.trim() === '') return alert("Gere um relatório primeiro.");
    var opt = { margin: 0.5, filename: 'relatorio_logimaster.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' } };
    html2pdf().set(opt).from(element).save();
};

window.gerarReciboPagamento = function() {
    var funcId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dataIni || !dataFim) return alert("Preencha funcionário e datas.");

    var func = buscarFuncionarioPorId(funcId);
    if (!func) return alert("Funcionário não encontrado.");

    var ops = CACHE_OPERACOES.filter(o => o.data >= dataIni && o.data <= dataFim && o.status !== 'CANCELADA');
    
    var totalPagar = 0;
    var descritivo = '';

    ops.forEach(op => {
        if (String(op.motoristaId) === String(funcId)) {
            if (!op.checkins || !op.checkins.faltaMotorista) {
                var com = Number(op.comissao) || 0;
                if (com > 0) {
                    totalPagar += com;
                    descritivo += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>COMISSÃO (Placa ${op.veiculoPlaca})</td><td align="right">${formatarValorMoeda(com)}</td></tr>`;
                }
            }
        }
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                if (String(aj.id) === String(funcId)) {
                     var diaria = Number(aj.diaria) || 0;
                     totalPagar += diaria;
                     descritivo += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>DIÁRIA AJUDANTE (Placa ${op.veiculoPlaca})</td><td align="right">${formatarValorMoeda(diaria)}</td></tr>`;
                }
            });
        }
    });

    var divRecibo = document.getElementById('reciboContent');
    var html = `
    <div style="border:2px solid #000; padding:30px; font-family:'Courier New', monospace; background:#fff;">
        <h2 style="text-align:center; margin-bottom:5px;">RECIBO DE PAGAMENTO</h2>
        <p style="text-align:center; font-size:0.8rem; margin-top:0;">${CACHE_MINHA_EMPRESA.razaoSocial || 'MINHA EMPRESA'}</p>
        <hr style="border:1px dashed #000;">
        <p><strong>BENEFICIÁRIO:</strong> ${func.nome}</p>
        <p><strong>CPF:</strong> ${func.documento} | <strong>PIX:</strong> ${func.pix || '-'}</p>
        <br>
        <table style="width:100%;">
            <tr style="border-bottom:1px solid #000;">
                <th align="left">DATA</th><th align="left">DESCRIÇÃO</th><th align="right">VALOR</th>
            </tr>
            ${descritivo || '<tr><td colspan="3" align="center">Nenhum serviço encontrado no período.</td></tr>'}
        </table>
        <br>
        <hr style="border:1px solid #000;">
        <h3 style="text-align:right;">TOTAL LÍQUIDO: ${formatarValorMoeda(totalPagar)}</h3>
        <br><br><br>
        <div style="display:flex; justify-content:space-between; margin-top:30px;">
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">ASSINATURA DO EMPREGADOR</div>
            <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:5px;">ASSINATURA DO BENEFICIÁRIO</div>
        </div>
        <p style="text-align:center; font-size:0.8em; margin-top:20px;">Data de Emissão: ${new Date().toLocaleDateString()}</p>
    </div>
    <button onclick="var c=document.getElementById('reciboContent').innerHTML; var w=window.open(); w.document.write(c); w.print();" class="btn-primary" style="margin-top:15px; width:100%;">
        <i class="fas fa-print"></i> IMPRIMIR RECIBO
    </button>
    `;

    divRecibo.innerHTML = html;
};

document.addEventListener('submit', function(e) {
    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault();
        var novo = {
            id: Date.now().toString(),
            data: document.getElementById('despesaGeralData').value,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
            valor: document.getElementById('despesaGeralValor').value,
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelas: document.getElementById('despesaParcelas').value,
            parcelasPagas: document.getElementById('despesaParcelasPagas').value
        };
        CACHE_DESPESAS.push(novo);
        salvarListaDespesas(CACHE_DESPESAS).then(() => { alert("Despesa Lançada!"); e.target.reset(); renderizarTabelaDespesasGerais(); atualizarDashboard(); });
    }
});

function renderizarTabelaDespesasGerais() {
    var tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    CACHE_DESPESAS.sort((a,b) => new Date(b.data) - new Date(a.data)).forEach(d => {
        var status = (d.modoPagamento === 'parcelado') ? `PARCELADO (${d.parcelasPagas}/${d.parcelas})` : 'À VISTA';
        var tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td style="color:red;">${formatarValorMoeda(d.valor)}</td><td><small>${status}</small></td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td>`;
        tbody.appendChild(tr);
    });
}

window.excluirDespesa = function(id) {
    if(!confirm("Excluir despesa?")) return;
    CACHE_DESPESAS = CACHE_DESPESAS.filter(d => d.id !== String(id));
    salvarListaDespesas(CACHE_DESPESAS).then(() => { renderizarTabelaDespesasGerais(); atualizarDashboard(); });
};

window.exportDataBackup = function() {
    var dataFull = { funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, contratantes: CACHE_CONTRATANTES, operacoes: CACHE_OPERACOES, minhaEmpresa: CACHE_MINHA_EMPRESA, despesas: CACHE_DESPESAS, atividades: CACHE_ATIVIDADES, profileRequests: CACHE_PROFILE_REQUESTS };
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataFull));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "backup_logimaster_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(event) {
        try {
            var jsonObj = JSON.parse(event.target.result);
            if (confirm("Isso substituirá TODOS os dados atuais. Confirmar importação?")) {
                CACHE_FUNCIONARIOS = jsonObj.funcionarios || []; CACHE_VEICULOS = jsonObj.veiculos || []; CACHE_CONTRATANTES = jsonObj.contratantes || []; CACHE_OPERACOES = jsonObj.operacoes || []; CACHE_MINHA_EMPRESA = jsonObj.minhaEmpresa || {}; CACHE_DESPESAS = jsonObj.despesas || []; CACHE_ATIVIDADES = jsonObj.atividades || []; CACHE_PROFILE_REQUESTS = jsonObj.profileRequests || [];
                salvarListaFuncionarios(CACHE_FUNCIONARIOS); salvarListaVeiculos(CACHE_VEICULOS); salvarListaContratantes(CACHE_CONTRATANTES); salvarListaOperacoes(CACHE_OPERACOES); salvarDadosMinhaEmpresa(CACHE_MINHA_EMPRESA); salvarListaDespesas(CACHE_DESPESAS); salvarListaAtividades(CACHE_ATIVIDADES);
                alert("Importação Concluída com Sucesso!"); window.location.reload();
            }
        } catch (e) { alert("Erro ao ler arquivo JSON: " + e); }
    };
    reader.readAsText(event.target.files[0]);
};

window.resetSystemData = function() { if (confirm("ATENÇÃO: ISSO APAGARÁ TUDO! TEM CERTEZA ABSOLUTA?")) { localStorage.clear(); alert("Sistema zerado. A página será recarregada."); window.location.reload(); } };

window.renderizarPainelEquipe = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs, doc, updateDoc } = window.dbRef;
    const empresa = window.USUARIO_ATUAL.company;
    const tbodyAtivos = document.querySelector('#tabelaCompanyAtivos tbody');
    if (tbodyAtivos) {
        tbodyAtivos.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando dados da nuvem...</td></tr>';
        try {
            const q = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", true));
            const querySnapshot = await getDocs(q);
            tbodyAtivos.innerHTML = '';
            if (querySnapshot.empty) { tbodyAtivos.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum usuário ativo com login encontrado.</td></tr>'; }
            querySnapshot.forEach((docSnap) => {
                const u = docSnap.data();
                const localData = CACHE_FUNCIONARIOS.find(f => f.email === u.email) || {};
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td><span class="status-pill pill-active">${u.role}</span></td><td>${localData.telefone ? formatarTelefoneBrasil(localData.telefone) : '-'}</td><td><button class="btn-mini delete-btn" onclick="bloquearAcessoUsuario('${docSnap.id}')" title="Revogar Acesso"><i class="fas fa-ban"></i></button></td>`;
                tbodyAtivos.appendChild(tr);
            });
        } catch (e) { console.error("Erro ao listar ativos:", e); tbodyAtivos.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Erro de conexão.</td></tr>'; }
    }
    const tbodyPendentes = document.querySelector('#tabelaCompanyPendentes tbody');
    if (tbodyPendentes) {
        try {
            const qP = query(collection(db, "users"), where("company", "==", empresa), where("approved", "==", false));
            const snapP = await getDocs(qP);
            tbodyPendentes.innerHTML = '';
            if (snapP.empty) { tbodyPendentes.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma solicitação pendente.</td></tr>'; } else { const badge = document.getElementById('badgeAccess'); if(badge) { badge.style.display = 'inline-block'; badge.textContent = snapP.size; } }
            snapP.forEach((docSnap) => {
                const u = docSnap.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td><td><button class="btn-mini btn-success" onclick="aprovarUsuario('${docSnap.id}')"><i class="fas fa-check"></i></button><button class="btn-mini btn-danger" onclick="excluirUsuarioPendente('${docSnap.id}')"><i class="fas fa-trash"></i></button></td>`;
                tbodyPendentes.appendChild(tr);
            });
        } catch (e) { console.error(e); }
    }
};

window.aprovarUsuario = async function(uid) { if(!confirm("Aprovar acesso deste usuário?")) return; try { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db, "users", uid), { approved: true }); alert("Usuário aprovado!"); renderizarPainelEquipe(); } catch(e) { alert("Erro: " + e.message); } };
window.bloquearAcessoUsuario = async function(uid) { if(!confirm("Bloquear acesso? O usuário não conseguirá mais logar.")) return; try { const { db, doc, updateDoc } = window.dbRef; await updateDoc(doc(db, "users", uid), { approved: false }); alert("Acesso revogado."); renderizarPainelEquipe(); } catch(e) { alert("Erro: " + e.message); } };

window.excluirUsuarioPendente = async function(uid) {
    if(!confirm("Excluir esta solicitação de acesso?")) return;
    try {
        const { db, doc, deleteDoc } = window.dbRef;
        await deleteDoc(doc(db, "users", uid));
        alert("Solicitação excluída.");
        renderizarPainelEquipe();
    } catch(e) { alert("Erro: " + e.message); }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formAdminMessage') {
        e.preventDefault();
        var texto = document.getElementById('msgTextAdmin').value;
        var destinatario = document.getElementById('msgRecipientSelect').value;
        if (!texto) return;
        try {
            const { db, collection, addDoc } = window.dbRef;
            await addDoc(collection(db, "messages"), { company: window.USUARIO_ATUAL.company, from: window.USUARIO_ATUAL.email, to: destinatario, content: texto, createdAt: new Date().toISOString(), readBy: [] });
            alert("Mensagem enviada com sucesso!"); e.target.reset();
        } catch (err) { alert("Erro ao enviar mensagem: " + err.message); }
    }
});
// =============================================================================
// ARQUIVO: script.js
// PARTE 5: NAVEGAÇÃO, INICIALIZAÇÃO, SUPER ADMIN E PERFIL FUNCIONÁRIO (FINAL)
// =============================================================================

function configurarNavegacao() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.onclick = function() {
            var pageId = this.getAttribute('data-page');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
            this.classList.add('active');
            var target = document.getElementById(pageId);
            if (target) { target.style.display = 'block'; setTimeout(() => target.classList.add('active'), 10); }
            
            if (pageId === 'home') { renderizarCalendario(); atualizarDashboard(); }
            if (pageId === 'despesas') renderizarTabelaDespesasGerais();
            if (pageId === 'checkins-pendentes') preencherTodosSelects(); 
            if (pageId === 'access-management') { renderizarPainelEquipe(); renderizarTabelaProfileRequests(); }
            
            if (pageId === 'employee-home' && window.USUARIO_ATUAL && window.USUARIO_ATUAL.role !== 'admin') { 
                verificarNovasMensagens();
                sincronizarDadosDaNuvem().then(() => renderizarPainelCheckinFuncionario());
            }
            if (pageId === 'meus-dados') { carregarDadosMeuPerfil(window.USUARIO_ATUAL.email); }
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
        };
    });

    var tabs = document.querySelectorAll('.cadastro-tab-btn');
    tabs.forEach(tab => {
        tab.onclick = function() {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            var formId = this.getAttribute('data-tab');
            document.getElementById(formId).classList.add('active');
        };
    });
}

// -----------------------------------------------------------------------------
// SISTEMA DE MENSAGENS PARA FUNCIONÁRIOS
// -----------------------------------------------------------------------------

window._idsLidosLocalmente = []; 

window.verificarNovasMensagens = async function() {
    if (!window.dbRef || !window.USUARIO_ATUAL) return;
    const { db, collection, query, where, getDocs } = window.dbRef;
    
    if(document.getElementById('modalNotification').style.display === 'block') return;

    try {
        const q = query(
            collection(db, "messages"), 
            where("company", "==", window.USUARIO_ATUAL.company)
        );
        
        const snap = await getDocs(q);
        
        for (const msgDoc of snap.docs) {
            const data = msgDoc.data();
            const myId = window.USUARIO_ATUAL.uid;
            const msgId = msgDoc.id;
            
            const isForMe = (data.to === 'all' || data.to === myId);
            const alreadyReadDB = data.readBy && data.readBy.includes(myId);
            const justReadLocal = window._idsLidosLocalmente.includes(msgId);
            
            if (isForMe && !alreadyReadDB && !justReadLocal) {
                window._mensagemAtualId = msgId; 
                document.getElementById('notificationMessageText').innerText = data.content;
                document.getElementById('notificationSender').innerText = "Enviado por: " + data.from;
                document.getElementById('modalNotification').style.display = 'block';
                break; 
            }
        }
    } catch (e) { console.error("Erro msg:", e); }
};

window.confirmarLeituraMensagem = async function() {
    document.getElementById('modalNotification').style.display = 'none';

    if(!window._mensagemAtualId || !window.dbRef || !window.USUARIO_ATUAL) return;
    
    const msgId = window._mensagemAtualId;
    const myId = window.USUARIO_ATUAL.uid;

    window._idsLidosLocalmente.push(msgId);
    
    const { db, doc, updateDoc, arrayUnion } = window.dbRef;
    try {
        await updateDoc(doc(db, "messages", msgId), {
            readBy: arrayUnion(myId)
        });
        window._mensagemAtualId = null;
        setTimeout(window.verificarNovasMensagens, 1500);
    } catch(e) { console.error("Erro ao confirmar leitura no banco:", e); }
};

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.querySelector('#modalNotification button');
    if(btn) { 
        btn.removeAttribute('onclick');
        btn.onclick = window.confirmarLeituraMensagem;
    }
    configurarNavegacao();
});

// -----------------------------------------------------------------------------
// FUNÇÕES DO PERFIL DE FUNCIONÁRIO (CHECK-IN E HISTÓRICO)
// -----------------------------------------------------------------------------

window.renderizarPainelCheckinFuncionario = function() {
    if (!window.USUARIO_ATUAL) return;
    var container = document.getElementById('listaServicosAgendados');
    if (!container) return;

    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    
    if (!funcionario) { 
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#c62828;"><strong>PERFIL NÃO VINCULADO</strong><br><small>Seu email não foi encontrado.</small><br><button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)">Sincronizar</button></div>`; 
        return; 
    }

    // LISTA OPERAÇÕES ONDE SOU MOTORISTA OU AJUDANTE
    var minhasOps = CACHE_OPERACOES.filter(op => {
        var souMotorista = String(op.motoristaId) === String(funcionario.id);
        var souAjudante = op.ajudantes && op.ajudantes.some(a => String(a.id) === String(funcionario.id));
        
        if (!souMotorista && !souAjudante) return false;
        
        // Regra de Exibição:
        // 1. Se estiver EM ANDAMENTO, mostra sempre (para finalizar)
        // 2. Se estiver AGENDADA, mostra se for hoje ou futuro
        if (op.status === 'EM_ANDAMENTO') return true;
        // Ajuste simples para hoje (compara string YYYY-MM-DD)
        var hojeStr = new Date().toISOString().split('T')[0];
        if (op.status === 'AGENDADA' && op.data >= hojeStr) return true;
        
        return false;
    });

    var btnRefresh = `<button class="btn-secondary btn-mini" onclick="sincronizarDadosDaNuvem(true)" style="width:100%; margin-bottom:15px;"><i class="fas fa-sync"></i> ATUALIZAR VIAGENS</button>`;

    if (minhasOps.length === 0) {
        container.innerHTML = btnRefresh + '<p style="text-align:center; padding:20px; color:#666;">Nenhuma viagem agendada ou em andamento.</p>';
        return;
    }

    var html = btnRefresh;
    minhasOps.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCli = cliente ? cliente.razaoSocial : 'Cliente Diversos';
        var statusColor = op.status==='AGENDADA' ? '#ff9800' : '#4caf50';
        
        // Verifica papel nesta operação
        var souMotorista = String(op.motoristaId) === String(funcionario.id);
        var btnAcao = '';

        if (souMotorista) {
            // LÓGICA DO MOTORISTA
            if (op.status === 'AGENDADA') {
                btnAcao = `<button class="btn-primary" onclick="iniciarViagemFuncionario('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">INICIAR VIAGEM <i class="fas fa-play"></i></button>`;
            } else {
                var infoAndamento = `<div style="text-align:center; margin-bottom:10px; color:#2e7d32;"><strong>KM INICIAL:</strong> ${op.kmInicial || 'Não informado'}</div>`;
                btnAcao = infoAndamento + `<button class="btn-danger" onclick="prepararFinalizacaoDriver('${op.id}')" style="width:100%; padding:15px; font-size:1.1rem;">FINALIZAR VIAGEM <i class="fas fa-flag-checkered"></i></button>`;
            }
        } else {
            // LÓGICA DO AJUDANTE (APENAS CONFIRMA PRESENÇA)
            // Verifica se já fez checkin (simulado aqui, idealmente salvaria num array dentro de checkins)
            // Como o status global não muda, apenas mostramos o botão
            if (op.status === 'AGENDADA') {
                btnAcao = `<button class="btn-success" onclick="alert('Presença confirmada na rota!')" style="width:100%; padding:15px;">CONFIRMAR PRESENÇA NA ROTA</button>`;
            } else {
                btnAcao = `<div style="text-align:center; color:green; font-weight:bold;">VIAGEM EM ANDAMENTO</div>`;
            }
        }

        html += `
            <div style="background:#fff; border-left:6px solid ${statusColor}; padding:20px; margin-bottom:20px; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#37474f;">${nomeCli}</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; font-size:0.9rem;">
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Veículo:</strong><br>${op.veiculoPlaca}</div>
                    <div style="background:#f5f5f5; padding:8px; border-radius:4px;"><strong>Data:</strong><br>${formatarDataParaBrasileiro(op.data)}</div>
                </div>
                ${btnAcao}
            </div>
        `;
    });
    container.innerHTML = html;
};

// --- LOGICA DE CHECK-IN DO MOTORISTA (KM INICIAL / FINAL / CUSTOS) ---

window.iniciarViagemFuncionario = function(opId) {
    var kmPainel = prompt("Por favor, informe a QUILOMETRAGEM (KM) ATUAL do painel:");
    if(!kmPainel) return;
    
    if(isNaN(Number(kmPainel))) return alert("Por favor, digite apenas números.");

    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(op) {
        op.status = 'EM_ANDAMENTO';
        op.kmInicial = Number(kmPainel); 
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Boa viagem! KM Inicial registrado.");
            renderizarPainelCheckinFuncionario();
        });
    }
};

// Abre um prompt sequencial para colher os dados de finalização
window.prepararFinalizacaoDriver = function(opId) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if(!op) return;

    // 1. KM Final
    var kmFinal = prompt(`KM Inicial foi: ${op.kmInicial}.\nInforme o KM FINAL do painel:`);
    if(!kmFinal) return;
    if(Number(kmFinal) < op.kmInicial) return alert("Erro: KM Final menor que Inicial!");

    // 2. Pedágios/Despesas
    var despesas = prompt("Valor total de Pedágios/Despesas (R$)? (Se não houve, digite 0)", "0");
    if(despesas === null) return;

    // 3. Abastecimento
    var abastecimento = prompt("Valor total Abastecido (R$)? (Se não houve, digite 0)", "0");
    if(abastecimento === null) return;

    // 4. Preço Litro (só se abasteceu)
    var precoLitro = "0";
    if(Number(abastecimento) > 0) {
        precoLitro = prompt("Preço do Litro (R$)?", "0");
        if(precoLitro === null) return;
    }

    // Confirmação
    var rodado = Number(kmFinal) - op.kmInicial;
    var msg = `CONFIRMAR FINALIZAÇÃO?\n\nKM Rodado: ${rodado} km\nDespesas: R$ ${despesas}\nAbastecimento: R$ ${abastecimento}`;
    
    if(confirm(msg)) {
        op.kmFinal = Number(kmFinal);
        op.kmRodado = rodado;
        op.despesas = Number(despesas.replace(',','.'));
        op.combustivel = Number(abastecimento.replace(',','.'));
        op.precoLitro = Number(precoLitro.replace(',','.'));
        op.status = 'FINALIZADA'; // Encerra a viagem
        
        salvarListaOperacoes(CACHE_OPERACOES).then(() => {
            alert("Viagem Finalizada com Sucesso! Dados enviados.");
            renderizarPainelCheckinFuncionario();
        });
    }
};

// ... (Restante das funções de Histórico e Sync mantidas) ...
window.filtrarHistoricoFuncionario = function() {
    var tbody = document.querySelector('#tabelaHistoricoCompleto tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!window.USUARIO_ATUAL) return;
    var emailLogado = window.USUARIO_ATUAL.email.trim().toLowerCase();
    var funcionario = CACHE_FUNCIONARIOS.find(f => f.email && f.email.trim().toLowerCase() === emailLogado);
    if (!funcionario) return;
    var dataIni = document.getElementById('empDataInicio').value;
    var dataFim = document.getElementById('empDataFim').value;
    var historico = CACHE_OPERACOES.filter(op => {
        var isMyOp = String(op.motoristaId) === String(funcionario.id);
        if (!isMyOp) return false;
        if (dataIni && op.data < dataIni) return false;
        if (dataFim && op.data > dataFim) return false;
        return op.status === 'CONFIRMADA' || op.status === 'FINALIZADA' || (op.checkins && op.checkins.faltaMotorista);
    });
    var total = 0;
    historico.forEach(op => {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var valor = Number(op.comissao) || 0;
        var statusHtml = '<span class="status-pill pill-active">REALIZADO</span>';
        var linhaStyle = '';
        if (op.checkins && op.checkins.faltaMotorista) { statusHtml = '<span class="status-pill pill-blocked">FALTA</span>'; valor = 0; linhaStyle = 'background-color:#ffebee; color:#c62828;'; } else { total += valor; }
        var tr = document.createElement('tr'); tr.style = linhaStyle; tr.innerHTML = `<td>${formatarDataParaBrasileiro(op.data)}</td><td>${op.veiculoPlaca}</td><td>${cliente}</td><td>${formatarValorMoeda(valor)}</td><td>${statusHtml}</td>`; tbody.appendChild(tr);
    });
    var elTotal = document.getElementById('empTotalReceber'); if(elTotal) elTotal.textContent = formatarValorMoeda(total);
};

window.sincronizarDadosDaNuvem = async function(manual = false) {
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) return;
    if(manual) { var btn = document.querySelector('button[onclick*="sincronizar"]'); if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...'; }
    const { db, doc, getDoc } = window.dbRef; const company = window.USUARIO_ATUAL.company;
    const carregarColecao = async (chave, varCache, callback) => { try { const docRef = doc(db, 'companies', company, 'data', chave); const snap = await getDoc(docRef); if (snap.exists()) { const dados = snap.data().items || []; localStorage.setItem(chave, JSON.stringify(dados)); callback(dados); } } catch (e) { console.error(`Erro sync ${chave}:`, e); } };
    await Promise.all([ carregarColecao(CHAVE_DB_FUNCIONARIOS, CACHE_FUNCIONARIOS, (d) => CACHE_FUNCIONARIOS = d), carregarColecao(CHAVE_DB_OPERACOES, CACHE_OPERACOES, (d) => CACHE_OPERACOES = d), carregarColecao(CHAVE_DB_VEICULOS, CACHE_VEICULOS, (d) => CACHE_VEICULOS = d), carregarColecao(CHAVE_DB_CONTRATANTES, CACHE_CONTRATANTES, (d) => CACHE_CONTRATANTES = d), carregarColecao(CHAVE_DB_ATIVIDADES, CACHE_ATIVIDADES, (d) => CACHE_ATIVIDADES = d), carregarColecao(CHAVE_DB_MINHA_EMPRESA, CACHE_MINHA_EMPRESA, (d) => CACHE_MINHA_EMPRESA = d), carregarColecao(CHAVE_DB_PROFILE_REQUESTS, CACHE_PROFILE_REQUESTS, (d) => CACHE_PROFILE_REQUESTS = d) ]);
    if(manual) { alert("Dados sincronizados com sucesso!"); if(btn) btn.innerHTML = '<i class="fas fa-sync"></i> ATUALIZAR VIAGENS'; renderizarPainelCheckinFuncionario(); carregarDadosMeuPerfil(window.USUARIO_ATUAL.email); }
};

window.initSystemByRole = async function(user) {
    console.log("Inicializando sistema para:", user.email, "| Role:", user.role);
    window.USUARIO_ATUAL = user;
    configurarNavegacao();
    if (user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') { document.getElementById('menu-admin').style.display = 'none'; document.getElementById('menu-employee').style.display = 'none'; document.getElementById('menu-super-admin').style.display = 'block'; document.querySelector('[data-page="super-admin"]').click(); setTimeout(carregarPainelSuperAdmin, 500); return; }
    carregarTodosDadosLocais();
    if (CACHE_FUNCIONARIOS.length === 0 || user.role !== 'admin') { await sincronizarDadosDaNuvem(); }
    if (user.role === 'admin') { document.getElementById('menu-admin').style.display = 'block'; window.MODO_APENAS_LEITURA = false; preencherTodosSelects(); setTimeout(() => { var btnHome = document.querySelector('[data-page="home"]'); if(btnHome) btnHome.click(); }, 100); } else if (user.role === 'motorista' || user.role === 'ajudante') { document.getElementById('menu-employee').style.display = 'block'; window.MODO_APENAS_LEITURA = true; setTimeout(() => { verificarNovasMensagens(); }, 2000); renderizarPainelCheckinFuncionario(); setTimeout(() => { var btnHomeEmp = document.querySelector('[data-page="employee-home"]'); if(btnHomeEmp) btnHomeEmp.click(); }, 100); }
};

document.getElementById('mobileMenuBtn').onclick = function() { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebarOverlay').classList.add('active'); };
document.getElementById('sidebarOverlay').onclick = function() { document.getElementById('sidebar').classList.remove('active'); this.classList.remove('active'); };

function carregarDadosMeuPerfil(email) {
    var emailLogado = email.trim().toLowerCase();
    var f = CACHE_FUNCIONARIOS.find(x => x.email && x.email.trim().toLowerCase() === emailLogado);
    var container = document.getElementById('meus-dados'); container.innerHTML = '<h2>MEUS DADOS PESSOAIS</h2>';
    if (f) {
        var cardHtml = `<div class="card" style="border-top: 5px solid var(--primary-color);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><div style="display:flex; align-items:center; gap:15px;"><div style="background:#eee; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#888;"><i class="fas fa-user" style="font-size:30px;"></i></div><div><h3 style="margin:0; color:#37474f;">${f.nome}</h3><span class="status-pill pill-active">${f.funcao}</span></div></div><button class="btn-warning btn-mini" onclick="document.getElementById('modalRequestProfileChange').style.display='block'"><i class="fas fa-edit"></i> SOLICITAR ALTERAÇÃO</button></div><div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:20px; background:#fafafa; padding:20px; border-radius:8px; border:1px solid #eee;"><div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">CPF</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.documento}</div></div><div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">TELEFONE</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${formatarTelefoneBrasil(f.telefone)}</div></div><div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">EMAIL</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.email}</div></div><div><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">PIX</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.pix || '-'}</div></div><div style="grid-column: 1 / -1;"><label style="font-size:0.75rem; color:#888; font-weight:bold; display:block;">ENDEREÇO</label><div style="font-size:1.1rem; color:#333; padding:5px 0; border-bottom:1px solid #ddd;">${f.endereco || '-'}</div></div>${ f.funcao === 'motorista' ? `<div style="background:#e8f5e9; padding:10px; border-radius:6px; border:1px solid #c8e6c9;"><label style="font-size:0.7rem; color:#2e7d32; font-weight:bold;">CNH</label><div style="font-weight:bold; color:#1b5e20;">${f.cnh || '-'}</div></div><div style="background:#e8f5e9; padding:10px; border-radius:6px; border:1px solid #c8e6c9;"><label style="font-size:0.7rem; color:#2e7d32; font-weight:bold;">VALIDADE</label><div style="font-weight:bold; color:#1b5e20;">${formatarDataParaBrasileiro(f.validadeCNH) || '-'}</div></div>` : '' }</div></div>`;
        container.innerHTML += cardHtml;
    } else { container.innerHTML += '<div class="card"><p>Dados não encontrados.</p></div>'; }
}

// SUPER ADMIN E OUTROS - MANTIDO
window.GLOBAL_DATA_CACHE = {}; 
window.carregarPainelSuperAdmin = async function(forceRefresh = false) { /* ... */ };
window.toggleCompanyBlock = function(header) { /* ... */ };
window.filterGlobalUsers = function() { /* ... */ };
window.superAdminResetPass = function(email) { /* ... */ };
window.superAdminDeleteUser = async function(uid, domain) { /* ... */ };

document.addEventListener('submit', async function(e) { if (e.target.id === 'formCreateCompany') { /* ... */ } });
document.addEventListener('submit', async function(e) { if (e.target.id === 'formRequestProfileChange') { e.preventDefault(); var tipo = document.getElementById('reqFieldType').value; var novoValor = document.getElementById('reqNewValue').value; if (!window.USUARIO_ATUAL) return; var novaReq = { id: Date.now().toString(), data: new Date().toISOString(), funcionarioEmail: window.USUARIO_ATUAL.email, campo: tipo, valorNovo: novoValor, status: 'PENDENTE' }; CACHE_PROFILE_REQUESTS.push(novaReq); salvarProfileRequests(CACHE_PROFILE_REQUESTS).then(() => { alert("Solicitação enviada para o administrador com sucesso!"); document.getElementById('modalRequestProfileChange').style.display='none'; e.target.reset(); }); } });
document.addEventListener('DOMContentLoaded', function() { configurarNavegacao(); });