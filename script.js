// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 21.0 (CORREÇÃO DE MODAIS E OPERAÇÕES)
// PARTE 1: CONFIGURAÇÕES, VARIÁVEIS GLOBAIS E CAMADA DE DADOS
// =============================================================================

// 1. CONSTANTES DE ARMAZENAMENTO (CHAVES DO BANCO DE DADOS)
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';

// 2. VARIÁVEIS GLOBAIS DE ESTADO
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); // Data base para o calendário e dashboard
window.chartInstance = null; // Instância do gráfico
window._operacaoAjudantesTempList = []; // Lista temporária de ajudantes na operação
window.MEDIA_KM_L_GLOBAL = 0; // Armazena a média global da frota para uso nos modais

// 3. CACHE LOCAL (Para evitar leituras repetitivas e lentidão)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];

// 4. FUNÇÕES DE FORMATAÇÃO (HELPERS)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    // Espera formato YYYY-MM-DD
    var partes = dataIso.split('-');
    if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
    return dataIso; // Retorna original se não for data válida
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

// 5. CAMADA DE DADOS (PERSISTÊNCIA LOCAL + FIREBASE)
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

// Função Mestra de Salvamento (Sincroniza LocalStorage e Firebase)
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e LocalStorage
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Sincroniza com Firebase (Se logado e com empresa definida)
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        const { db, doc, setDoc } = window.dbRef;
        try {
            // Salva dentro da subcoleção 'data' da empresa
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), { 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            console.log("Sincronizado com nuvem: " + chave);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
        }
    }
}

// Wrappers específicos
async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

// Buscas Rápidas
function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }

// Inicialização de Dados
carregarTodosDadosLocais();
// =============================================================================
// PARTE 2: LÓGICA DE DASHBOARD, CÁLCULOS E VISUALIZAÇÃO
// =============================================================================

// 6. CÁLCULOS FINANCEIROS E ATUALIZAÇÃO DO DASHBOARD
window.atualizarDashboard = function() {
    console.log("Calculando métricas do Dashboard...");
    
    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var despesasCaixaMes = 0;
    var receitaHistorico = 0;
    var kmTotalGeral = 0;
    var litrosTotaisGeral = 0;
    
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;

        var valorFat = Number(op.faturamento) || 0;
        var kmOp = Number(op.kmRodado) || 0;
        
        var custoFinanceiroOp = (Number(op.despesas) || 0) + 
                                (Number(op.combustivel) || 0) + 
                                (Number(op.comissao) || 0);
        
        if (op.ajudantes) op.ajudantes.forEach(aj => custoFinanceiroOp += (Number(aj.diaria) || 0));

        // Acumuladores Globais (Para Média KM/L)
        if (kmOp > 0 && (Number(op.combustivel) > 0)) {
            kmTotalGeral += kmOp;
            var precoL = Number(op.precoLitro);
            if (precoL > 0) litrosTotaisGeral += (Number(op.combustivel) / precoL);
        }

        receitaHistorico += valorFat;

        // Filtro Mês Atual
        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            despesasCaixaMes += custoFinanceiroOp;
        }
    });

    CACHE_DESPESAS.forEach(function(desp) {
        var dt = new Date(desp.data + 'T12:00:00');
        if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
            despesasCaixaMes += (Number(desp.valor) || 0);
        }
    });

    var mediaKmL = litrosTotaisGeral > 0 ? (kmTotalGeral / litrosTotaisGeral) : 0;
    window.MEDIA_KM_L_GLOBAL = mediaKmL || 0; 

    // Atualiza DOM
    var lucroMes = faturamentoMes - despesasCaixaMes;
    var elFat = document.getElementById('faturamentoMes');
    var elDesp = document.getElementById('despesasMes');
    var elLucro = document.getElementById('receitaMes');
    var elHist = document.getElementById('receitaTotalHistorico');
    var elMargem = document.getElementById('margemLucroMedia');

    if (elFat) elFat.textContent = formatarValorMoeda(faturamentoMes);
    if (elDesp) elDesp.textContent = formatarValorMoeda(despesasCaixaMes);
    
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucroMes);
        elLucro.style.color = lucroMes >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    
    if (elMargem) elMargem.textContent = mediaKmL > 0 ? mediaKmL.toFixed(2) + ' KM/L (MÉDIA)' : '0.0 KM/L';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

// 7. GRÁFICOS (CHART.JS)
function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    var receita = 0;
    var combustivel = 0;
    var pessoal = 0; 
    var manutencaoGeral = 0; 
    
    CACHE_OPERACOES.forEach(op => {
        var d = new Date(op.data + 'T12:00:00');
        if (op.status !== 'CANCELADA' && d.getMonth() === mes && d.getFullYear() === ano) {
            receita += Number(op.faturamento || 0);
            combustivel += Number(op.combustivel || 0);
            pessoal += Number(op.comissao || 0);
            if (op.ajudantes) op.ajudantes.forEach(aj => pessoal += (Number(aj.diaria)||0));
            manutencaoGeral += Number(op.despesas || 0);
        }
    });

    CACHE_DESPESAS.forEach(d => {
        var dt = new Date(d.data + 'T12:00:00');
        if (dt.getMonth() === mes && dt.getFullYear() === ano) {
            manutencaoGeral += Number(d.valor || 0);
        }
    });

    var lucro = receita - (combustivel + pessoal + manutencaoGeral);

    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'GERAL', 'LUCRO'],
            datasets: [{
                label: 'Resultados (R$)',
                data: [receita, combustivel, pessoal, manutencaoGeral, lucro],
                backgroundColor: ['#2e7d32', '#c62828', '#f57c00', '#6a1b9a', (lucro>=0?'#00c853':'#b71c1c')]
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 8. LÓGICA DO CALENDÁRIO (CORRIGIDA)
window.renderizarCalendario = function() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = '';
    
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    var nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.textContent = nomeMes.toUpperCase();

    var primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    var diasNoMes = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < primeiroDiaSemana; i++) {
        var emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        grid.appendChild(emptyCell);
    }

    for (var dia = 1; dia <= diasNoMes; dia++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // CORREÇÃO CRÍTICA: Formatação correta da DataString
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        
        var cellContent = `<span>${dia}</span>`;
        
        var opsDoDia = CACHE_OPERACOES.filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            
            cellContent += `<div class="event-dot"></div>`;
            cellContent += `<div style="font-size:0.7em; margin-top:auto; color:var(--primary-dark); font-weight:bold;">${opsDoDia.length} VIAGENS</div>`;
            cellContent += `<div style="font-size:0.65em; color:green;">${formatarValorMoeda(totalDia)}</div>`;
            
            // CORREÇÃO: Passa apenas a dataString para a função nova
            cell.onclick = (function(dStr) {
                return function() { abrirModalDetalhesDia(dStr); };
            })(dateStr);
        } else {
            // Mantido o comportamento original para dias vazios
            cell.onclick = (function(dStr) {
                return function() { 
                    document.getElementById('operacaoData').value = dStr;
                    var btnOperacoes = document.querySelector('[data-page="operacoes"]');
                    if(btnOperacoes) btnOperacoes.click();
                };
            })(dateStr);
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
// =============================================================================
// PARTE 3: GESTÃO DE CADASTROS (CRUD) E MODAIS GLOBAIS
// =============================================================================

// FUNÇÕES GLOBAIS (Necessárias para o modal)
window.calcularMediaGlobalVeiculo = function(placa) {
    if (!CACHE_OPERACOES) return 0;
    var ops = CACHE_OPERACOES.filter(function(op) {
        return op.veiculoPlaca === placa && op.status !== 'CANCELADA' && Number(op.kmRodado) > 0 && Number(op.combustivel) > 0;
    });
    if (ops.length === 0) return 0;
    var totalKm = 0;
    var totalLitros = 0;
    ops.forEach(function(op) {
        var preco = Number(op.precoLitro) || 0;
        if (preco > 0) {
            totalKm += Number(op.kmRodado);
            totalLitros += (Number(op.combustivel) / preco);
        }
    });
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

window.abrirModalDetalhesDia = function(dataString) {
    var ops = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
    var modal = document.getElementById('modalDayOperations');
    
    if (!modal) return;
    
    document.getElementById('modalDayTitle').textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);
    var corpo = document.getElementById('modalDayBody');
    var resumo = document.getElementById('modalDaySummary');

    var totalFat = 0;
    var totalLucro = 0;
    var html = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%"><thead><tr style="background:#263238; color:white;"><th>CLIENTE/VEÍCULO</th><th>FATURAMENTO</th><th>CUSTOS</th><th>LUCRO</th></tr></thead><tbody>';

    ops.forEach(op => {
        var receita = Number(op.faturamento)||0;
        var custo = (Number(op.combustivel)||0) + (Number(op.despesas)||0) + (Number(op.comissao)||0);
        if(op.ajudantes) op.ajudantes.forEach(aj => custo += (Number(aj.diaria)||0));
        
        var lucro = receita - custo;
        totalFat += receita;
        totalLucro += lucro;
        
        var media = window.calcularMediaGlobalVeiculo(op.veiculoPlaca);
        var nomeCli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';

        html += `<tr>
            <td><strong>${nomeCli.substr(0,15)}</strong><br>${op.veiculoPlaca} <small style="color:blue">(${media>0?media.toFixed(1)+' km/l':'-'})</small></td>
            <td style="color:green; font-weight:bold;">${formatarValorMoeda(receita)}</td>
            <td style="color:red;">${formatarValorMoeda(custo)}</td>
            <td><strong>${formatarValorMoeda(lucro)}</strong></td>
        </tr>`;
    });
    html += '</tbody></table></div>';

    if(resumo) resumo.innerHTML = `<div style="display:flex; justify-content:space-around; background:#e0f2f1; padding:10px; border-radius:6px; margin-bottom:10px;"><div style="text-align:center"><small>Faturamento</small><br><strong style="color:#004d40">${formatarValorMoeda(totalFat)}</strong></div><div style="text-align:center"><small>Lucro Op.</small><br><strong style="color:${totalLucro>=0?'green':'red'}">${formatarValorMoeda(totalLucro)}</strong></div></div>`;
    
    corpo.innerHTML = html;
    modal.style.display = 'block';
};

// LISTENERS DE FORMULÁRIOS

// Salvar Funcionário
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        var txtOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'SALVANDO...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value;
            var funcao = document.getElementById('funcFuncao').value;
            var nome = document.getElementById('funcNome').value.toUpperCase();
            
            var novoUID = id; 
            // Se novo cadastro com senha, cria no Firebase
            if (!document.getElementById('funcionarioId').value && senha) {
                if(senha.length < 6) throw new Error("Senha curta (min 6).");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, name: nome, email: email, role: funcao,
                    company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(), approved: true
                });
            }

            var novo = {
                id: novoUID, nome: nome, funcao: funcao, documento: document.getElementById('funcDocumento').value,
                email: email, telefone: document.getElementById('funcTelefone').value, pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                cnh: funcao === 'motorista' ? document.getElementById('funcCNH').value : '',
                validadeCNH: funcao === 'motorista' ? document.getElementById('funcValidadeCNH').value : '',
                categoriaCNH: funcao === 'motorista' ? document.getElementById('funcCategoriaCNH').value : '',
                cursoDescricao: funcao === 'motorista' ? document.getElementById('funcCursoDescricao').value : ''
            };

            var lista = CACHE_FUNCIONARIOS.filter(f => f.id !== String(id));
            lista.push(novo);
            await salvarListaFuncionarios(lista);
            
            alert("Funcionário salvo!");
            e.target.reset(); document.getElementById('funcionarioId').value = '';
            preencherTodosSelects();

        } catch (err) { alert("Erro: " + err.message); } 
        finally { btn.disabled = false; btn.innerHTML = txtOriginal; }
    }
});

// Salvar Operação (BLINDADO)
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        
        var idHidden = document.getElementById('operacaoId').value;
        var antiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;

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
            status: isAgendamento ? 'AGENDADA' : 'CONFIRMADA',
            checkins: antiga ? antiga.checkins : { motorista: false, ajudantes: [] },
            ajudantes: window._operacaoAjudantesTempList || []
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert(isAgendamento ? "Agendada!" : "Salva!");
            e.target.reset();
            document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = [];
            
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects();
            renderizarCalendario();
            atualizarDashboard();
        });
    }
});

// Salvar Veículo
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formVeiculo') {
        e.preventDefault();
        var placa = document.getElementById('veiculoPlaca').value.toUpperCase();
        var novo = {
            placa: placa, modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value, renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value
        };
        var lista = CACHE_VEICULOS.filter(v => v.placa !== placa);
        lista.push(novo);
        salvarListaVeiculos(lista).then(() => { alert("Veículo Salvo!"); e.target.reset(); preencherTodosSelects(); });
    }
});

// Salvar Contratante
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formContratante') {
        e.preventDefault();
        var cnpj = document.getElementById('contratanteCNPJ').value;
        var novo = {
            cnpj: cnpj, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        };
        var lista = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj);
        lista.push(novo);
        salvarListaContratantes(lista).then(() => { alert("Cliente Salvo!"); e.target.reset(); preencherTodosSelects(); });
    }
});

// Salvar Atividade
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formAtividade') {
        e.preventDefault();
        var id = document.getElementById('atividadeId').value || Date.now().toString();
        var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() };
        var lista = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id));
        lista.push(novo);
        salvarListaAtividades(lista).then(() => { alert("Atividade Salva!"); e.target.reset(); document.getElementById('atividadeId').value = ''; preencherTodosSelects(); });
    }
});

// UI Helpers
window.renderizarListaAjudantesAdicionados = function() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if(!ul) return;
    ul.innerHTML = (window._operacaoAjudantesTempList || []).map(a => {
        var f = buscarFuncionarioPorId(a.id);
        return `<li>${f?f.nome:'?'} (${formatarValorMoeda(a.diaria)}) <button type="button" class="btn-mini delete-btn" onclick="window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!='${a.id}');renderizarListaAjudantesAdicionados()">X</button></li>`;
    }).join('');
};

document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() {
    var sel = document.getElementById('selectAjudantesOperacao');
    if(!sel.value) return alert("Selecione...");
    var v = prompt("Valor Diária?", "0");
    if(v) {
        if(!window._operacaoAjudantesTempList) window._operacaoAjudantesTempList=[];
        window._operacaoAjudantesTempList.push({id:sel.value, diaria:Number(v.replace(',','.'))});
        renderizarListaAjudantesAdicionados();
    }
});
// =============================================================================
// PARTE 4: RELATÓRIOS, SUPER ADMIN E INICIALIZAÇÃO
// =============================================================================

// MÓDULO SUPER ADMIN
window.carregarPainelSuperAdmin = async function(force) {
    var container = document.getElementById('superAdminContainer');
    if (!container) return;
    if(force) container.innerHTML = 'Carregando...';
    
    const { db, collection, getDocs } = window.dbRef;
    try {
        var usersSnap = await getDocs(collection(db, "users"));
        var mapEmpresas = {};
        usersSnap.forEach(d => {
            var u = d.data();
            var dom = u.company || 'SEM_EMPRESA';
            if(!mapEmpresas[dom]) mapEmpresas[dom] = [];
            mapEmpresas[dom].push({...u, uid:d.id});
        });
        
        container.innerHTML = '';
        Object.keys(mapEmpresas).sort().forEach(dom => {
            var users = mapEmpresas[dom];
            var div = document.createElement('div');
            div.className = 'company-block';
            div.innerHTML = `<div class="company-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display=='block'?'none':'block'"><h4>${dom.toUpperCase()}</h4><span>${users.length} Users</span></div><div class="company-content"><table class="data-table" style="width:100%"><tbody>${users.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn-mini delete-btn" onclick="superAdminDeleteUser('${u.uid}','${dom}')">X</button></td></tr>`).join('')}</tbody></table></div>`;
            container.appendChild(div);
        });
    } catch(e) { container.innerHTML = "Erro: " + e.message; }
};

window.superAdminDeleteUser = async function(uid, dom) {
    if(!confirm("Excluir?")) return;
    try {
        await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", uid));
        alert("Removido."); carregarPainelSuperAdmin(true);
    } catch(e) { alert("Erro: " + e.message); }
};

document.addEventListener('submit', async function(e) {
    if(e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dom = document.getElementById('newCompanyDomain').value.trim();
        var email = document.getElementById('newAdminEmail').value.trim();
        try {
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, 'companies', dom, 'data', 'db_funcionarios'), {
                items: [{ id: 'admin_'+Date.now(), nome: 'ADMIN', email: email, funcao: 'admin' }]
            });
            alert("Empresa preparada! Cadastre o admin com email: " + email);
        } catch(err) { alert("Erro: " + err.message); }
    }
});

// FILL SELECTS & INIT
function preencherTodosSelects() {
    const fill = (id, dados, val, txt, def) => {
        var el = document.getElementById(id);
        if(!el) return;
        var old = el.value;
        el.innerHTML = `<option value="">${def}</option>` + dados.map(d => `<option value="${d[val]}">${d[txt]}</option>`).join('');
        if(old) el.value = old;
    };
    
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='motorista'), 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='ajudante'), 'id', 'nome', 'ADD AJUDANTE...');
    
    // Relatorios
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('selectAtividadeRelatorio', CACHE_ATIVIDADES, 'id', 'nome', 'TODAS');

    renderizarTabelaOperacoes();
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarInformacoesEmpresa();
}

// TABELA RENDERERS (SIMPLIFICADOS)
function renderizarTabelaOperacoes() {
    var tbody = document.querySelector('#tabelaOperacoes tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)).forEach(op => {
        if(op.status === 'CANCELADA') return;
        var mot = buscarFuncionarioPorId(op.motoristaId);
        tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${mot?mot.nome:'-'} / ${op.veiculoPlaca}</td><td>${op.status}</td><td style="color:green">${formatarValorMoeda(op.faturamento)}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
}
function renderizarTabelaFuncionarios() {
    var tb = document.querySelector('#tabelaFuncionarios tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_FUNCIONARIOS.forEach(f => tb.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button></td></tr>`);
}
function renderizarTabelaVeiculos() {
    var tb = document.querySelector('#tabelaVeiculos tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_VEICULOS.forEach(v => tb.innerHTML += `<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')"><i class="fas fa-trash"></i></button></td></tr>`);
}
function renderizarTabelaContratantes() {
    var tb = document.querySelector('#tabelaContratantes tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_CONTRATANTES.forEach(c => tb.innerHTML += `<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')"><i class="fas fa-trash"></i></button></td></tr>`);
}
function renderizarTabelaAtividades() {
    var tb = document.querySelector('#tabelaAtividades tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_ATIVIDADES.forEach(a => tb.innerHTML += `<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')"><i class="fas fa-trash"></i></button></td></tr>`);
}
function renderizarInformacoesEmpresa() {
    var d = document.getElementById('viewMinhaEmpresaContent');
    if(d) d.innerHTML = CACHE_MINHA_EMPRESA.razaoSocial ? `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong>` : 'Sem dados.';
}

// EDIÇÃO/EXCLUSÃO
window.preencherFormularioOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o=>String(o.id)===String(id));
    if(!op) return;
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId;
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');
    
    window._operacaoAjudantesTempList = op.ajudantes || [];
    renderizarListaAjudantesAdicionados();
    document.querySelector('[data-page="operacoes"]').click();
};

window.excluirOperacao = function(id) { if(confirm("Excluir?")) salvarListaOperacoes(CACHE_OPERACOES.filter(o=>o.id!==id)).then(()=>{ preencherTodosSelects(); atualizarDashboard(); renderizarCalendario(); }); };
window.excluirFuncionario = function(id) { if(confirm("Excluir?")) salvarListaFuncionarios(CACHE_FUNCIONARIOS.filter(f=>f.id!==id)).then(preencherTodosSelects); };
window.excluirVeiculo = function(placa) { if(confirm("Excluir?")) salvarListaVeiculos(CACHE_VEICULOS.filter(v=>v.placa!==placa)).then(preencherTodosSelects); };
window.excluirContratante = function(cnpj) { if(confirm("Excluir?")) salvarListaContratantes(CACHE_CONTRATANTES.filter(c=>c.cnpj!==cnpj)).then(preencherTodosSelects); };
window.excluirAtividade = function(id) { if(confirm("Excluir?")) salvarListaAtividades(CACHE_ATIVIDADES.filter(a=>a.id!==id)).then(preencherTodosSelects); };

window.preencherFormularioFuncionario = function(id) { var f=buscarFuncionarioPorId(id); if(f){ document.getElementById('funcionarioId').value=f.id; document.getElementById('funcNome').value=f.nome; document.getElementById('funcFuncao').value=f.funcao; document.getElementById('funcDocumento').value=f.documento; document.getElementById('funcEmail').value=f.email; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="funcionarios"]').click(); toggleDriverFields(); }};
window.preencherFormularioVeiculo = function(placa) { var v=buscarVeiculoPorPlaca(placa); if(v){ document.getElementById('veiculoPlaca').value=v.placa; document.getElementById('veiculoModelo').value=v.modelo; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="veiculos"]').click(); }};
window.preencherFormularioContratante = function(cnpj) { var c=buscarContratantePorCnpj(cnpj); if(c){ document.getElementById('contratanteCNPJ').value=c.cnpj; document.getElementById('contratanteRazaoSocial').value=c.razaoSocial; document.querySelector('[data-page="cadastros"]').click(); document.querySelector('[data-tab="contratantes"]').click(); }};

// SYSTEM INIT
window.initSystemByRole = function(user) {
    window.USUARIO_ATUAL = user;
    if(user.email.toUpperCase() === 'ADMIN@LOGIMASTER.COM') {
        document.getElementById('menu-admin').style.display='none';
        document.getElementById('menu-super-admin').style.display='block';
        configurarNavegacao();
        document.querySelector('[data-page="super-admin"]').click();
        carregarPainelSuperAdmin(true);
        return;
    }
    carregarTodosDadosLocais();
    if(user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        window.MODO_APENAS_LEITURA = false;
        preencherTodosSelects(); renderizarCalendario(); atualizarDashboard();
        document.querySelector('[data-page="home"]').click();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        if(typeof carregarDadosMeuPerfil === 'function') carregarDadosMeuPerfil(user.email);
        document.querySelector('[data-page="employee-home"]').click();
    }
    configurarNavegacao();
};

function configurarNavegacao() {
    document.querySelectorAll('.nav-item').forEach(i => i.onclick = function() {
        var pid = this.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p=> { p.style.display='none'; p.classList.remove('active'); });
        var tg = document.getElementById(pid); if(tg) { tg.style.display='block'; setTimeout(()=>tg.classList.add('active'),10); }
        if(pid==='home') { renderizarCalendario(); atualizarDashboard(); }
    });
    document.querySelectorAll('.cadastro-tab-btn').forEach(t => t.onclick = function() {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f=>f.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.getAttribute('data-tab')).classList.add('active');
    });
}

// Force reload on start
document.addEventListener('DOMContentLoaded', configurarNavegacao);