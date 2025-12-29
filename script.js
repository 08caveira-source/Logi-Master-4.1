// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO FINAL 3.1 (ESTÁVEL)
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
const CHAVE_DB_RECIBOS = 'db_recibos';

// 2. VARIÁVEIS GLOBAIS
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// STATUS DO SISTEMA
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// 3. CACHE LOCAL (Memória RAM)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// 4. HELPERS DE FORMATAÇÃO
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
    if (numeros.length > 10) return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    else if (numeros.length > 6) return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    return telefone;
}

function removerAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// 5. CAMADA DE DADOS (SYNC FIREBASE OBRIGATÓRIO)

function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

// FUNÇÃO VITAL: Sincroniza dados da Nuvem para o Local ao iniciar
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Offline ou sem empresa. Usando cache local.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const lista = data.items || [];
                if (chave === CHAVE_DB_MINHA_EMPRESA) setter(data.items || {}); 
                else setter(lista);
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]);
            }
        } catch (e) {
            console.error(`Erro ao baixar ${chave}:`, e);
        }
    }

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

    console.log(">>> SINCRONIA CONCLUÍDA.");
}

function carregarTodosDadosLocais() {
    function load(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch(e){ return []; } }
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

async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') return;

        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) { console.error("Erro Firebase (" + chave + "):", erro); }
    }
}

async function salvarListaFuncionarios(lista) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, lista, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(lista) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, lista, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(lista) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, lista, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(lista) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, lista, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(dados) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, dados, (d) => CACHE_MINHA_EMPRESA = d); }
async function salvarListaDespesas(lista) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, lista, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(lista) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, lista, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(lista) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, lista, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(lista) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, lista, (d) => CACHE_PROFILE_REQUESTS = d); }

function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO (NOVA LÓGICA DE COMBUSTÍVEL)
// =============================================================================

window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    if (!targets.length) return;
    const isBlurred = targets[0].classList.contains('privacy-blur');
    targets.forEach(el => el.classList.toggle('privacy-blur'));
    if(icon) icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
};

// HELPER: MÉDIA GLOBAL DE CONSUMO (BASEADO NO HISTÓRICO)
window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA'));
    if (ops.length === 0) return 0;
    
    var totalKm = 0; 
    var totalLitros = 0;
    
    ops.forEach(op => {
        var km = Number(op.kmRodado) || 0;
        var combReais = Number(op.combustivel) || 0; // Valor abastecido em R$
        var preco = Number(op.precoLitro) || 0;
        
        // Só considera para média se houve abastecimento real e KM rodado
        if (km > 0 && combReais > 0 && preco > 0) { 
            totalKm += km; 
            totalLitros += (combReais / preco); 
        }
    });
    
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

// DASHBOARD
window.atualizarDashboard = function() {
    if (window.USUARIO_ATUAL && (window.USUARIO_ATUAL.role === 'admin_master' || window.EMAILS_MESTRES && window.EMAILS_MESTRES.includes(window.USUARIO_ATUAL.email))) return;

    var mesAtual = window.currentDate.getMonth(); 
    var anoAtual = window.currentDate.getFullYear();

    var faturamentoMes = 0;
    var custosMes = 0; 
    var receitaHistorico = 0;
    
    // 1. Processar Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;
        
        var teveFalta = (op.checkins && op.checkins.faltaMotorista);
        var valorFat = Number(op.faturamento) || 0;
        
        // --- CÁLCULO DE COMBUSTÍVEL PELA MÉDIA ---
        var custoCombustivelCalculado = 0;
        
        // Se a viagem tem KM e Veículo, usa a média global para diluir o custo
        if (op.kmRodado > 0 && op.veiculoPlaca) {
            var mediaVeiculo = calcularMediaGlobalVeiculo(op.veiculoPlaca); 
            var precoLitro = Number(op.precoLitro) || 6.00; // Se não tiver no registro, chuta 6.00 ou pega média
            
            if (mediaVeiculo > 0) {
                var litrosEstimados = op.kmRodado / mediaVeiculo;
                custoCombustivelCalculado = litrosEstimados * precoLitro;
            } else {
                // Sem histórico, usa o valor abastecido direto (fallback)
                custoCombustivelCalculado = Number(op.combustivel) || 0;
            }
        }

        var custoOp = (Number(op.despesas) || 0) + custoCombustivelCalculado;
        
        if (!teveFalta) custoOp += (Number(op.comissao) || 0);

        if (op.ajudantes && Array.isArray(op.ajudantes)) {
            op.ajudantes.forEach(aj => {
                var faltou = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                if (!faltou) custoOp += (Number(aj.diaria) || 0);
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') receitaHistorico += valorFat;

        var dataOp = new Date(op.data + 'T12:00:00'); 
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // 2. Despesas Gerais (Parceladas)
    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        
        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtd = Number(desp.parcelasTotal);
            var valParc = valorTotal / qtd;
            var intervalo = Number(desp.intervaloDias) || 30;
            for (var i = 0; i < qtd; i++) {
                var dt = new Date(dataDesp);
                dt.setDate(dt.getDate() + (i * intervalo));
                if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
                    custosMes += valParc;
                }
            }
        } else {
            if (dataDesp.getMonth() === mesAtual && dataDesp.getFullYear() === anoAtual) {
                custosMes += valorTotal;
            }
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
    if (elLucro) elLucro.textContent = formatarValorMoeda(lucroMes);
    if (elHist) elHist.textContent = formatarValorMoeda(receitaHistorico);
    if (elMargem) elMargem.textContent = margem.toFixed(1) + '%';

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

function atualizarGraficoPrincipal(mes, ano) {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;
    var ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    var stats = { faturamento: 0, custos: 0, lucro: 0, viagens: 0, faltas: 0, kmTotal: 0, litrosTotal: 0 };
    var gReceita = 0; var gCombustivel = 0; var gPessoal = 0; var gManutencao = 0;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            var rec = Number(op.faturamento)||0;
            var des = Number(op.despesas)||0;
            var com = 0;
            
            // Combustível pela média
            var custoComb = 0;
            if (op.kmRodado > 0 && op.veiculoPlaca) {
                var media = calcularMediaGlobalVeiculo(op.veiculoPlaca);
                var preco = Number(op.precoLitro) || 6.00;
                if(media>0) custoComb = (op.kmRodado / media) * preco;
                else custoComb = Number(op.combustivel)||0;
            }

            if (!op.checkins || !op.checkins.faltaMotorista) com += (Number(op.comissao)||0);
            if (op.ajudantes) op.ajudantes.forEach(aj => { if(!(op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id])) com += (Number(aj.diaria)||0); });

            gReceita += rec; gCombustivel += custoComb; gPessoal += com; gManutencao += des;
        }
    });

    CACHE_DESPESAS.forEach(desp => {
        var valor = 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');
        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var qtd = Number(desp.parcelasTotal);
            var valParc = (Number(desp.valor)||0) / qtd;
            for(var i=0; i<qtd; i++){
                var dt = new Date(dataDesp); dt.setDate(dt.getDate() + (i * 30));
                if(dt.getMonth()===mes && dt.getFullYear()===ano) valor += valParc;
            }
        } else {
            if(dataDesp.getMonth()===mes && dataDesp.getFullYear()===ano) valor = Number(desp.valor)||0;
        }

        if(valor > 0) {
            var desc = removerAcentos(desp.descricao || "");
            if (desc.includes("manutencao") || desc.includes("oleo") || desc.includes("pneu")) gManutencao += valor;
            else if (desc.includes("comida") || desc.includes("hotel")) gPessoal += valor;
            else gManutencao += valor;
        }
    });

    if (window.chartInstance) window.chartInstance.destroy();
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'R$',
                data: [gReceita, gCombustivel, gPessoal, gManutencao, (gReceita - (gCombustivel+gPessoal+gManutencao))],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// CALENDÁRIO
window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; 
    var now = window.currentDate || new Date();
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

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
        var dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        var cellContent = `<span>${dia}</span>`;
        
        var opsDoDia = (CACHE_OPERACOES||[]).filter(o => o.data === dateStr && o.status !== 'CANCELADA');
        
        if (opsDoDia.length > 0) {
            cell.classList.add('has-operation');
            var totalDia = opsDoDia.reduce((acc, curr) => acc + (Number(curr.faturamento)||0), 0);
            var dotColor = opsDoDia.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';
            cellContent += `<div class="event-dot" style="background:${dotColor}"></div><div style="font-size:0.6em; color:green; margin-top:auto;">${formatarValorMoeda(totalDia)}</div>`;
            (function(d){ cell.onclick = function() { abrirModalDetalhesDia(d); }; })(dateStr);
        } else {
            (function(d){ cell.onclick = function() { 
                var btn = document.querySelector('[data-page="operacoes"]');
                if(btn) btn.click();
                document.getElementById('operacaoData').value = d;
            }; })(dateStr);
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

window.abrirModalDetalhesDia = function(dataString) {
    var ops = CACHE_OPERACOES.filter(o => o.data === dataString && o.status !== 'CANCELADA');
    var mb = document.getElementById('modalDayBody');
    var mt = document.getElementById('modalDayTitle');
    if (!mb) return;
    if (mt) mt.textContent = 'DETALHES: ' + formatarDataParaBrasileiro(dataString);
    var html = '<div style="max-height:400px; overflow-y:auto;"><table class="data-table" style="width:100%; font-size:0.75rem;"><thead><tr style="background:#263238; color:white;"><th>CLIENTE</th><th>VEÍCULO</th><th>MOTORISTA</th><th>VALOR</th></tr></thead><tbody>';
    ops.forEach(op => {
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        html += `<tr><td>${c}</td><td>${op.veiculoPlaca}</td><td>${m}</td><td>${formatarValorMoeda(op.faturamento)}</td></tr>`;
    });
    html += '</tbody></table></div>';
    mb.innerHTML = html;
    document.getElementById('modalDayOperations').style.display = 'block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE
// =============================================================================

// SALVAR FUNCIONÁRIO
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerHTML = 'AGUARDE...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.toLowerCase().trim();
            var senha = document.getElementById('funcSenha').value; 
            var funcao = document.getElementById('funcFuncao').value;
            var novoUID = id; 

            if (!document.getElementById('funcionarioId').value && senha) {
                if(senha.length < 6) throw new Error("Senha mín 6 dígitos.");
                novoUID = await window.dbRef.criarAuthUsuario(email, senha);
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", novoUID), {
                    uid: novoUID, name: document.getElementById('funcNome').value.toUpperCase(), email: email, role: funcao,
                    company: window.USUARIO_ATUAL.company, createdAt: new Date().toISOString(), approved: true, senhaVisual: senha
                });
            }

            var obj = {
                id: novoUID, nome: document.getElementById('funcNome').value.toUpperCase(), funcao: funcao,
                documento: document.getElementById('funcDocumento').value, email: email,
                telefone: document.getElementById('funcTelefone').value, pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value, cnh: document.getElementById('funcCNH').value,
                validadeCNH: document.getElementById('funcValidadeCNH').value, categoriaCNH: document.getElementById('funcCategoriaCNH').value
            };
            if (senha) obj.senhaVisual = senha;

            var lista = CACHE_FUNCIONARIOS.filter(f => f.email !== email && f.id !== id);
            lista.push(obj);
            await salvarListaFuncionarios(lista);
            
            alert("Salvo!"); e.target.reset(); document.getElementById('funcionarioId').value = '';
            preencherTodosSelects();

        } catch (erro) { alert("Erro: " + erro.message); } finally { btn.disabled = false; btn.innerHTML = 'SALVAR'; }
    }
});

// OUTROS LISTENERS (VEÍCULO, CLIENTE, ETC - MANTIDOS PADRÃO)
document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formVeiculo') { 
        e.preventDefault(); 
        var placa = document.getElementById('veiculoPlaca').value.toUpperCase(); 
        var novo = { placa: placa, modelo: document.getElementById('veiculoModelo').value.toUpperCase(), ano: document.getElementById('veiculoAno').value, renavam: document.getElementById('veiculoRenavam').value, chassi: document.getElementById('veiculoChassi').value }; 
        var lista = CACHE_VEICULOS.filter(v => v.placa !== placa); lista.push(novo); 
        salvarListaVeiculos(lista).then(() => { alert("Veículo Salvo!"); e.target.reset(); preencherTodosSelects(); }); 
    } 
});

document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formContratante') { e.preventDefault(); var cnpj = document.getElementById('contratanteCNPJ').value; var novo = { cnpj: cnpj, razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone: document.getElementById('contratanteTelefone').value }; var lista = CACHE_CONTRATANTES.filter(c => c.cnpj !== cnpj); lista.push(novo); salvarListaContratantes(lista).then(() => { alert("Cliente Salvo!"); e.target.reset(); preencherTodosSelects(); }); } 
});

document.addEventListener('submit', function(e) { 
    if (e.target.id === 'formAtividade') { e.preventDefault(); var id = document.getElementById('atividadeId').value || Date.now().toString(); var novo = { id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() }; var lista = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id)); lista.push(novo); salvarListaAtividades(lista).then(() => { alert("Serviço Salvo!"); e.target.reset(); document.getElementById('atividadeId').value=''; preencherTodosSelects(); }); } 
});

// SALVAR OPERAÇÃO
document.addEventListener('submit', function(e) {
    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var idHidden = document.getElementById('operacaoId').value;
        var opAntiga = idHidden ? CACHE_OPERACOES.find(o => String(o.id) === String(idHidden)) : null;
        var statusFinal = document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA';
        if (opAntiga && statusFinal === 'CONFIRMADA' && (opAntiga.status === 'EM_ANDAMENTO' || opAntiga.status === 'FINALIZADA')) statusFinal = opAntiga.status;
        
        var checkinsData = (opAntiga && opAntiga.checkins) ? opAntiga.checkins : { motorista: false, faltaMotorista: false, ajudantes: {} };

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
            checkins: checkinsData,
            ajudantes: window._operacaoAjudantesTempList || []
        };

        var lista = CACHE_OPERACOES.filter(o => String(o.id) !== String(novaOp.id));
        lista.push(novaOp);
        
        salvarListaOperacoes(lista).then(() => {
            alert("Operação Salva!");
            e.target.reset(); document.getElementById('operacaoId').value = '';
            document.getElementById('operacaoIsAgendamento').checked = false;
            window._operacaoAjudantesTempList = [];
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects(); atualizarDashboard(); renderizarCalendario();
        });
    }
});

// UI HELPERS E TABELAS
window.toggleDriverFields = function() { var s = document.getElementById('funcFuncao'); var d = document.getElementById('driverSpecificFields'); if(s && d) d.style.display = (s.value === 'motorista') ? 'block' : 'none'; };
window.toggleDespesaParcelas = function() { var m = document.getElementById('despesaModoPagamento').value; var d = document.getElementById('divDespesaParcelas'); if(d) d.style.display = (m === 'parcelado') ? 'flex' : 'none'; };
window.renderizarListaAjudantesAdicionados = function() { var ul = document.getElementById('listaAjudantesAdicionados'); if (!ul) return; ul.innerHTML = ''; (window._operacaoAjudantesTempList || []).forEach(item => { var f = buscarFuncionarioPorId(item.id); var n = f ? f.nome : 'Unknown'; ul.innerHTML += `<li>${n} (R$ ${formatarValorMoeda(item.diaria)}) <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${item.id}')">X</button></li>`; }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => String(x.id) !== String(id)); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var s = document.getElementById('selectAjudantesOperacao'); var id = s.value; if (!id) return alert("Selecione ajudante"); var v = prompt("Valor Diária:"); if (v) { window._operacaoAjudantesTempList.push({ id: id, diaria: Number(v.replace(',', '.')) }); renderizarListaAjudantesAdicionados(); s.value=""; } });

function preencherTodosSelects() {
    const fill = (id, dados, valKey, textKey, defText) => { var el = document.getElementById(id); if (!el) return; var v = el.value; el.innerHTML = `<option value="">${defText}</option>` + dados.map(d => `<option value="${d[valKey]}">${d[textKey]}</option>`).join(''); if(v) el.value = v; };
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADICIONAR...');
    fill('selectMotoristaRelatorio', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectVeiculoRelatorio', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('selectContratanteRelatorio', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'TODOS');
    fill('filtroVeiculoGrafico', CACHE_VEICULOS, 'placa', 'placa', 'TODOS');
    fill('filtroMotoristaGrafico', CACHE_FUNCIONARIOS, 'id', 'nome', 'TODOS');
    fill('selectMotoristaRecibo', CACHE_FUNCIONARIOS, 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoDespesaGeral', CACHE_VEICULOS, 'placa', 'placa', 'GERAL');

    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaAtividades();
    renderizarTabelaOperacoes();
    if(typeof renderizarTabelaMonitoramento === 'function') { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
    if(typeof renderizarPainelEquipe === 'function') renderizarPainelEquipe();
}

function renderizarTabelaFuncionarios() { 
    var tbody = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!tbody) return; 
    tbody.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => { 
        tbody.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')">EDITAR</button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')">DEL</button></td></tr>`; 
    }); 
}
function renderizarTabelaVeiculos() { var t = document.querySelector('#tabelaVeiculos tbody'); if(t) { t.innerHTML=''; CACHE_VEICULOS.forEach(v => t.innerHTML+=`<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td></tr>`); } }
function renderizarTabelaContratantes() { var t = document.querySelector('#tabelaContratantes tbody'); if(t) { t.innerHTML=''; CACHE_CONTRATANTES.forEach(c => t.innerHTML+=`<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td></tr>`); } }
function renderizarTabelaAtividades() { var t = document.querySelector('#tabelaAtividades tbody'); if(t) { t.innerHTML=''; CACHE_ATIVIDADES.forEach(a => t.innerHTML+=`<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td></tr>`); } }
function renderizarTabelaOperacoes() { 
    var t = document.querySelector('#tabelaOperacoes tbody'); 
    if(t) { 
        t.innerHTML=''; 
        var lista = CACHE_OPERACOES.slice().sort((a,b) => new Date(b.data) - new Date(a.data)); 
        lista.forEach(op => { 
            if(op.status==='CANCELADA') return;
            var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
            t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td><button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')">DEL</button></td></tr>`; 
        }); 
    } 
}

window.excluirFuncionario = async function(id) { if(confirm("Excluir?")) { var l = CACHE_FUNCIONARIOS.filter(f=>String(f.id)!==String(id)); await salvarListaFuncionarios(l); preencherTodosSelects(); }};
window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if(!f) return; document.getElementById('funcionarioId').value=f.id; document.getElementById('funcNome').value=f.nome; document.getElementById('funcFuncao').value=f.funcao; document.getElementById('funcDocumento').value=f.documento; document.getElementById('funcEmail').value=f.email; document.querySelector('[data-tab="funcionarios"]').click(); };
window.excluirOperacao = async function(id) { if(confirm("Excluir viagem?")) { var l = CACHE_OPERACOES.filter(o=>String(o.id)!==String(id)); await salvarListaOperacoes(l); preencherTodosSelects(); atualizarDashboard(); renderizarCalendario(); }};
// =============================================================================
// PARTE 4: MONITORAMENTO E FUNCIONÁRIO
// =============================================================================

window.renderizarTabelaMonitoramento = function() {
    var tbody = document.querySelector('#tabelaCheckinsPendentes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var pendentes = CACHE_OPERACOES.filter(function(op) {
        return (op.status === 'AGENDADA' || op.status === 'EM_ANDAMENTO');
    }).sort((a,b) => new Date(a.data) - new Date(b.data));

    if (pendentes.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa.</td></tr>';

    var badge = document.getElementById('badgeCheckins');
    if (badge) { badge.textContent = pendentes.length; badge.style.display = pendentes.length > 0 ? 'inline-block' : 'none'; }

    pendentes.forEach(function(op) {
        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || 'CLIENTE';
        var statusHtml = op.status === 'EM_ANDAMENTO' ? '<span class="status-pill" style="background:orange;">EM ROTA</span>' : '<span class="status-pill pill-pending">AGENDADA</span>';

        var mot = buscarFuncionarioPorId(op.motoristaId);
        if (mot) {
            var checkInFeito = (op.checkins && op.checkins.motorista);
            var faltou = (op.checkins && op.checkins.faltaMotorista);
            var statusEq = faltou ? '<span style="color:red">FALTA</span>' : (checkInFeito ? '<span style="color:green">OK</span>' : 'AGUARDANDO');
            var btnFalta = faltou ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${mot.id}','motorista')">FALTA</button>`;
            tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${mot.nome}<br><small>${op.veiculoPlaca}</small></td><td>${cliente}</td><td>${statusHtml}</td><td>${statusEq}</td><td>${btnFalta}</td></tr>`;
        }
        
        if (op.ajudantes) {
            op.ajudantes.forEach(ajItem => {
                var aj = buscarFuncionarioPorId(ajItem.id);
                if(aj) {
                    var faltouAj = (op.checkins && op.checkins.faltas && op.checkins.faltas[aj.id]);
                    var btnFaltaAj = faltouAj ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${aj.id}','ajudante')">FALTA</button>`;
                    tbody.innerHTML += `<tr style="background:#f9f9f9"><td style="border:none;"></td><td>${aj.nome} (Ajud)</td><td colspan="3" style="color:#777;"><small>^ Vinculado</small></td><td>${btnFaltaAj}</td></tr>`;
                }
            });
        }
    });
};

window.registrarFalta = async function(opId, funcId, tipo) {
    if (!confirm("Confirmar FALTA?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(opId));
    if (!op) return;
    if (!op.checkins) op.checkins = { motorista: false, faltaMotorista: false, faltas: {} };
    if (!op.checkins.faltas) op.checkins.faltas = {};

    if (tipo === 'motorista') { op.checkins.faltaMotorista = true; op.checkins.motorista = false; }
    else { op.checkins.faltas[funcId] = true; }
    
    await salvarListaOperacoes(CACHE_OPERACOES);
    renderizarTabelaMonitoramento();
    atualizarDashboard();
};

window.renderizarTabelaFaltas = function() {
    var tbody = document.querySelector('#tabelaFaltas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    CACHE_OPERACOES.forEach(function(op) {
        if (!op.checkins) return;
        if (op.checkins.faltaMotorista) {
            var m = buscarFuncionarioPorId(op.motoristaId);
            if(m) tbody.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red;">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td></tr>`;
        }
    });
};

// RECIBOS (ADMIN)
window.gerarReciboPagamento = function() {
    var motId = document.getElementById('selectMotoristaRecibo').value;
    var ini = document.getElementById('dataInicioRecibo').value;
    var fim = document.getElementById('dataFimRecibo').value;
    if (!motId || !ini || !fim) return alert("Preencha tudo.");
    var func = buscarFuncionarioPorId(motId);
    
    var total = 0; var lista = [];
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA' || op.data < ini || op.data > fim) return;
        var val = 0;
        if (op.motoristaId === motId && (!op.checkins || !op.checkins.faltaMotorista)) val = Number(op.comissao)||0;
        else if (op.ajudantes && op.ajudantes.find(a=>a.id===motId) && !(op.checkins?.faltas?.[motId])) val = Number(op.ajudantes.find(a=>a.id===motId).diaria)||0;
        
        if (val > 0) { total += val; lista.push({d:op.data, v:val}); }
    });

    var html = `<div style="padding:20px; font-family:monospace;"><h3>RECIBO - ${func.nome}</h3><p>Período: ${formatarDataParaBrasileiro(ini)} a ${formatarDataParaBrasileiro(fim)}</p><hr>${lista.map(i=>`<div style="display:flex;justify-content:space-between;"><span>${formatarDataParaBrasileiro(i.d)}</span><span>${formatarValorMoeda(i.v)}</span></div>`).join('')}<hr><h3>TOTAL: ${formatarValorMoeda(total)}</h3></div>`;
    document.getElementById('modalReciboContent').innerHTML = html;
    document.getElementById('modalReciboActions').innerHTML = `<button class="btn-success" onclick="salvarRecibo('${func.id}','${func.nome}','${ini}','${fim}',${total})">SALVAR E DISPONIBILIZAR</button>`;
    document.getElementById('modalRecibo').style.display = 'flex';
};

window.salvarRecibo = async function(id, nome, i, f, val) {
    CACHE_RECIBOS.push({ id: Date.now().toString(), dataEmissao: new Date().toISOString(), funcionarioId: id, funcionarioNome: nome, periodo: i+' a '+f, valorTotal: val, enviado: false });
    await salvarListaRecibos(CACHE_RECIBOS);
    alert("Salvo!"); document.getElementById('modalRecibo').style.display='none'; renderizarHistoricoRecibos();
};

window.renderizarHistoricoRecibos = function() {
    var t = document.querySelector('#tabelaHistoricoRecibos tbody'); if(!t) return;
    t.innerHTML = '';
    CACHE_RECIBOS.forEach(r => {
        var btn = r.enviado ? 'ENVIADO' : `<button class="btn-primary" onclick="enviarRecibo('${r.id}')">ENVIAR</button>`;
        t.innerHTML += `<tr><td>${new Date(r.dataEmissao).toLocaleDateString()}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${btn}</td></tr>`;
    });
};

window.enviarRecibo = async function(id) {
    var r = CACHE_RECIBOS.find(x => x.id === id);
    if(r) { r.enviado = true; await salvarListaRecibos(CACHE_RECIBOS); renderizarHistoricoRecibos(); alert("Enviado ao funcionário!"); }
};

// CHECK-IN FUNCIONÁRIO
window.renderizarCheckinFuncionario = function() {
    var c = document.getElementById('checkin-container'); if(!c) return;
    var uid = window.USUARIO_ATUAL.uid;
    var ops = CACHE_OPERACOES.filter(o => o.motoristaId === uid && o.status !== 'CANCELADA' && (o.status === 'AGENDADA' || o.status === 'EM_ANDAMENTO'));
    
    if (ops.length === 0) { c.innerHTML = '<p style="text-align:center;">Nenhuma viagem pendente.</p>'; return; }
    
    var html = '';
    ops.forEach(op => {
        var btn = op.status === 'AGENDADA' ? `<button class="btn-success" onclick="iniciarViagem('${op.id}')">INICIAR VIAGEM</button>` : `<button class="btn-warning" onclick="finalizarViagem('${op.id}')">FINALIZAR VIAGEM</button>`;
        html += `<div style="border:1px solid #ccc; padding:15px; margin-bottom:10px; border-radius:5px;"><h4>${op.veiculoPlaca} - ${formatarDataParaBrasileiro(op.data)}</h4><p>Rota: ${buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial}</p>${btn}</div>`;
    });
    c.innerHTML = html;
};

window.iniciarViagem = async function(id) {
    if(!confirm("Iniciar?")) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) { op.status = 'EM_ANDAMENTO'; if(!op.checkins) op.checkins={}; op.checkins.motorista=true; await salvarListaOperacoes(CACHE_OPERACOES); renderizarCheckinFuncionario(); }
};

window.finalizarViagem = async function(id) {
    var km = prompt("KM Final:"); if(!km) return;
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id));
    if(op) { 
        op.status = 'FINALIZADA'; op.kmFinal = km; 
        op.kmRodado = Number(km) - Number(op.kmInicial || 0); // Ajuste se houver km inicial
        await salvarListaOperacoes(CACHE_OPERACOES); renderizarCheckinFuncionario(); 
    }
};

window.filtrarServicosFuncionario = function(uid) {
    var ini = document.getElementById('dataInicioServicosFunc')?.value;
    var fim = document.getElementById('dataFimServicosFunc')?.value;
    
    var ops = CACHE_OPERACOES.filter(o => {
        var isMe = (o.motoristaId === uid) || (o.ajudantes && o.ajudantes.some(a=>a.id===uid));
        var dateOk = (!ini || o.data >= ini) && (!fim || o.data <= fim);
        return isMe && o.status !== 'CANCELADA' && dateOk;
    });

    var t = document.getElementById('tabelaMeusServicos')?.querySelector('tbody');
    if(t) {
        t.innerHTML = '';
        ops.forEach(o => {
            var val = (o.motoristaId === uid) ? (Number(o.comissao)||0) : (Number(o.ajudantes.find(a=>a.id===uid).diaria)||0);
            t.innerHTML += `<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatarValorMoeda(val)}</td></tr>`;
        });
    }
    
    var tr = document.getElementById('tabelaMeusRecibos')?.querySelector('tbody');
    if(tr) {
        tr.innerHTML = '';
        CACHE_RECIBOS.filter(r => String(r.funcionarioId) === String(uid) && r.enviado).forEach(r => {
            tr.innerHTML += `<tr><td>${formatarDataParaBrasileiro(r.dataEmissao.split('T')[0])}</td><td>${r.periodo}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>OK</td></tr>`;
        });
    }
};

window.renderizarPainelEquipe = async function() {
    var t = document.querySelector('#tabelaCompanyAtivos tbody');
    if(t) {
        t.innerHTML = '';
        CACHE_FUNCIONARIOS.forEach(f => t.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>ATIVO</td><td>-</td></tr>`);
    }
    
    // Busca Pendentes
    if (window.dbRef) {
        try {
            const q = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", window.USUARIO_ATUAL.company), window.dbRef.where("approved", "==", false));
            const snap = await window.dbRef.getDocs(q);
            var tp = document.querySelector('#tabelaCompanyPendentes tbody');
            if(tp) {
                tp.innerHTML = '';
                snap.forEach(d => {
                    var u = d.data();
                    tp.innerHTML += `<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-success" onclick="aprovarUsuario('${u.uid}')">APROVAR</button></td></tr>`;
                });
            }
        } catch(e) {}
    }
};
window.aprovarUsuario = async function(uid) {
    await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", uid), { approved: true });
    renderizarPainelEquipe();
};
// =============================================================================
// PARTE 5: SUPER ADMIN, MEUS DADOS E INICIALIZAÇÃO (FIXED)
// =============================================================================

const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// SUPER ADMIN
window.carregarPainelSuperAdmin = async function() {
    const c = document.getElementById('superAdminContainer'); if(!c) return;
    c.innerHTML = 'Carregando...';
    try {
        const { db, collection, getDocs } = window.dbRef;
        const compSnap = await getDocs(collection(db, "companies"));
        const userSnap = await getDocs(collection(db, "users"));
        const comps = []; compSnap.forEach(d => comps.push({id:d.id, ...d.data()}));
        const users = []; userSnap.forEach(d => users.push({uid:d.id, ...d.data()}));
        
        c.innerHTML = '';
        if(comps.length === 0) c.innerHTML = 'Nada encontrado.';

        comps.forEach(cp => {
            const uss = users.filter(u => u.company === cp.id);
            const adm = uss.find(u => u.role === 'admin');
            
            // Segurança contra NULL no modal
            const safeVal = cp.systemValidity || '';
            const safeVit = cp.isVitalicio || false;
            const safeBlk = cp.isBlocked || false;

            var div = document.createElement('div');
            div.className = 'company-wrapper';
            div.style.cssText = "margin-bottom:10px; border:1px solid #ccc; padding:10px; background:white;";
            div.innerHTML = `
                <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer; font-weight:bold; display:flex; justify-content:space-between;">
                    <span>${cp.id.toUpperCase()} (Admin: ${adm?adm.email:'-'})</span>
                    <span>${safeBlk?'BLOQUEADO':(safeVit?'VITALICIO':'ATIVO')}</span>
                </div>
                <div style="display:none; padding-top:10px;">
                    <button class="btn-primary" onclick="abrirModalCreditos('${cp.id}','${safeVal}',${safeVit},${safeBlk})">EDITAR</button>
                    <button class="btn-danger" onclick="excluirEmpresaTotal('${cp.id}')">EXCLUIR</button>
                    <hr>
                    <small>USUÁRIOS:</small>
                    ${uss.map(u=>`<div>${u.name} (${u.email}) - Pass: ${u.senhaVisual||'***'}</div>`).join('')}
                </div>
            `;
            c.appendChild(div);
        });
    } catch(e) { c.innerHTML = 'Erro: '+e.message; }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var dom = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var email = document.getElementById('newAdminEmail').value.trim();
        var pass = document.getElementById('newAdminPassword').value.trim();
        
        if (dom.length < 3) return alert("Domínio curto.");
        
        try {
            var uid = await window.dbRef.criarAuthUsuario(email, pass);
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                uid: uid, name: "ADMIN "+dom.toUpperCase(), email: email, role: 'admin', company: dom,
                createdAt: new Date().toISOString(), approved: true, isVitalicio: false, isBlocked: false, senhaVisual: pass,
                systemValidity: new Date(new Date().setDate(new Date().getDate()+30)).toISOString()
            });
        } catch (erro) {
            if (erro.code !== 'auth/email-already-in-use') return alert(erro.message);
            if(!confirm("Email já existe. Criar apenas a empresa?")) return;
        }

        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", dom), { 
            id: dom, createdAt: new Date().toISOString(), isBlocked: false, isVitalicio: false,
            systemValidity: new Date(new Date().setDate(new Date().getDate()+30)).toISOString()
        }, { merge: true });

        alert("Criado!"); e.target.reset(); carregarPainelSuperAdmin();
    }
});

// MODAL CRÉDITOS SEGURO
window.abrirModalCreditos = function(id, val, vit, blk) {
    document.getElementById('empresaIdCredito').value = id;
    document.getElementById('nomeEmpresaCredito').textContent = id.toUpperCase();
    
    var elVit = document.getElementById('checkVitalicio');
    var elBlk = document.getElementById('checkBloqueado');
    if(elVit) elVit.checked = vit;
    if(elBlk) elBlk.checked = blk;
    
    document.getElementById('modalCreditos').style.display = 'flex';
};

window.salvarCreditosEmpresa = async function() {
    var id = document.getElementById('empresaIdCredito').value;
    var vit = document.getElementById('checkVitalicio').checked;
    var blk = document.getElementById('checkBloqueado').checked;
    var mes = parseInt(document.getElementById('qtdCreditosAdd').value);
    
    try {
        var data = { isVitalicio: vit, isBlocked: blk };
        var novaData = null;
        
        if(!vit && !blk) {
            var base = new Date();
            // Tenta pegar data atual
            const q = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", id), window.dbRef.where("role", "==", "admin"));
            const s = await window.dbRef.getDocs(q);
            if(!s.empty && s.docs[0].data().systemValidity) {
                var dv = new Date(s.docs[0].data().systemValidity);
                if(dv > base) base = dv;
            }
            if(mes > 0) base.setDate(base.getDate() + (mes * 30));
            novaData = base.toISOString();
            data.systemValidity = novaData;
        }
        
        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", id), data, { merge: true });
        
        // Atualiza usuarios em batch
        const qu = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", id));
        const su = await window.dbRef.getDocs(qu);
        const b = window.dbRef.writeBatch(window.dbRef.db);
        su.forEach(doc => {
            let up = { isBlocked: blk, isVitalicio: vit };
            if(novaData) up.systemValidity = novaData;
            b.update(doc.ref, up);
        });
        await b.commit();
        
        alert("Salvo!"); document.getElementById('modalCreditos').style.display = 'none'; carregarPainelSuperAdmin();
    } catch(e) { alert(e.message); }
};

window.excluirEmpresaTotal = async function(id) {
    if(prompt(`Digite DELETAR para apagar ${id}:`) !== "DELETAR") return;
    const b = window.dbRef.writeBatch(window.dbRef.db);
    const q = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", id));
    const s = await window.dbRef.getDocs(q);
    s.forEach(d => b.delete(d.ref));
    b.delete(window.dbRef.doc(window.dbRef.db, "companies", id));
    await b.commit();
    alert("Excluído!"); carregarPainelSuperAdmin();
};

// MEUS DADOS
window.renderizarMeusDados = function() {
    var u = window.USUARIO_ATUAL;
    var d = CACHE_FUNCIONARIOS.find(f => String(f.id) === String(u.uid)) || u;
    var c = document.getElementById('meusDadosContainer');
    if(c) c.innerHTML = `<div style="text-align:center; padding:20px; background:white;"><h3>${d.nome||d.name}</h3><p>${d.funcao||d.role}</p><hr><p>Tel: ${d.telefone||'-'}</p><p>End: ${d.endereco||'-'}</p><p>Pix: ${d.pix||'-'}</p></div>`;
};

// INICIALIZAÇÃO
window.initSystemByRole = async function(user) {
    console.log("INIT:", user.role);
    window.USUARIO_ATUAL = user;
    
    document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sidebar ul').forEach(ul => ul.style.display = 'none');

    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        var p = document.getElementById('super-admin');
        p.style.display = 'block'; setTimeout(() => p.classList.add('active'), 50);
        carregarPainelSuperAdmin();
        return;
    }

    await sincronizarDadosComFirebase();
    preencherTodosSelects();

    if (user.role === 'admin') {
        if(user.isBlocked) return document.body.innerHTML = "<h1 style='text-align:center;margin-top:50px;color:red'>BLOQUEADO</h1>";
        document.getElementById('menu-admin').style.display = 'block';
        var h = document.getElementById('home');
        if(h) { h.style.display='block'; setTimeout(()=>h.classList.add('active'), 50); }
        atualizarDashboard();
        renderizarCalendario();
    } else {
        document.getElementById('menu-employee').style.display = 'block';
        window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home');
        if(eh) { eh.style.display='block'; setTimeout(()=>eh.classList.add('active'), 50); }
        renderizarCheckinFuncionario();
        renderizarMeusDados();
    }
};

// NAVEGAÇÃO E BACKUP
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
        this.classList.add('active');
        var t = document.getElementById(this.getAttribute('data-page'));
        if(t) { t.style.display='block'; setTimeout(()=>t.classList.add('active'), 10); }
        if(window.innerWidth<=768) document.getElementById('sidebar').classList.remove('active');
        var pg = this.getAttribute('data-page');
        if(pg==='home') atualizarDashboard();
        if(pg==='meus-dados') renderizarMeusDados();
        if(pg==='employee-checkin') renderizarCheckinFuncionario();
    });
});
document.getElementById('mobileMenuBtn')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.remove('active'));

window.exportDataBackup = function() {
    var data = { meta: { date: new Date(), user: window.USUARIO_ATUAL.email }, data: { funcionarios: CACHE_FUNCIONARIOS, veiculos: CACHE_VEICULOS, operacoes: CACHE_OPERACOES, despesas: CACHE_DESPESAS } };
    var a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = "backup.json"; a.click();
};

window.importDataBackup = function(event) {
    var reader = new FileReader();
    reader.onload = function(e) {
        if(confirm("Restaurar backup?")) {
            var json = JSON.parse(e.target.result);
            if(json.data) {
                localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(json.data.funcionarios));
                localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(json.data.veiculos));
                localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(json.data.operacoes));
                localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(json.data.despesas));
                alert("Backup restaurado! Recarregando...");
                window.location.reload();
            }
        }
    };
    reader.readAsText(event.target.files[0]);
};