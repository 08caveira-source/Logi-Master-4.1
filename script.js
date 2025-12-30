// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 5.0 (INTEGRAL, SEM MINIFICAÇÃO)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES E VARIÁVEIS GLOBAIS
// -----------------------------------------------------------------------------

// Chaves para armazenamento no Banco de Dados (Firestore e LocalStorage)
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';
const CHAVE_DB_RECIBOS = 'db_recibos';

// Lista de E-mails com permissão de Super Admin (Master)
const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// Variáveis de Estado Global
window.USUARIO_ATUAL = null;
window.MODO_APENAS_LEITURA = false; 
window.currentDate = new Date(); 
window.chartInstance = null; 
window._operacaoAjudantesTempList = []; 

// Status de Licença do Sistema
window.SYSTEM_STATUS = {
    validade: null,
    isVitalicio: false,
    bloqueado: false
};

// Cache Local (Mantém os dados na memória RAM para acesso rápido)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// -----------------------------------------------------------------------------
// 2. FUNÇÕES AUXILIARES (HELPERS)
// -----------------------------------------------------------------------------

// Formata números para moeda brasileira (R$ 1.000,00)
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// Converte datas ISO (YYYY-MM-DD) para Brasileiro (DD/MM/YYYY)
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) {
        return '-';
    }
    var partes = dataIso.split('T')[0].split('-');
    if (partes.length >= 3) {
        return partes[2].substring(0, 2) + '/' + partes[1] + '/' + partes[0];
    }
    return dataIso; 
}

// Formata telefone (XX) XXXXX-XXXX
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// Remove acentos para buscas
function removerAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Remove campos 'undefined' para evitar erros no Firebase
function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) {
            return null;
        }
        return value;
    }));
}

// -----------------------------------------------------------------------------
// 3. CÁLCULOS FINANCEIROS AVANÇADOS (COMBUSTÍVEL REAL)
// -----------------------------------------------------------------------------

// Calcula a média de consumo histórica de um veículo (Km Total / Litros Totais)
window.calcularMediaGlobalVeiculo = function(placa) {
    // Filtra viagens finalizadas ou confirmadas deste veículo
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA');
    });

    if (ops.length === 0) return 0;

    var totalKm = 0;
    var totalLitros = 0;

    ops.forEach(function(op) {
        var km = Number(op.kmRodado) || 0;
        var valorAbastecido = Number(op.combustivel) || 0;
        var precoLitro = Number(op.precoLitro) || 0;
        
        // Só considera para a média se houve abastecimento E rodagem
        if (km > 0 && valorAbastecido > 0 && precoLitro > 0) {
            totalKm += km;
            totalLitros += (valorAbastecido / precoLitro);
        }
    });

    if (totalLitros > 0) {
        return totalKm / totalLitros;
    } else {
        return 0;
    }
};

// Obtém o preço médio do combustível pago nas últimas viagens
window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(function(o) {
        return o.veiculoPlaca === placa && Number(o.precoLitro) > 0;
    });

    if (ops.length === 0) return 6.00; // Valor padrão se não houver histórico

    var ultimas = ops.slice(-5); // Pega as últimas 5 viagens
    var somaPrecos = ultimas.reduce(function(acc, curr) {
        return acc + Number(curr.precoLitro);
    }, 0);

    return somaPrecos / ultimas.length;
};

// Função Principal: Calcula o custo de combustível proporcional ao KM rodado
window.calcularCustoCombustivelOperacao = function(op) {
    // Se não tem KM rodado, retorna 0 (ou o valor cheio se preferir, aqui focamos no consumo real)
    if (!op.kmRodado || op.kmRodado <= 0) {
        return Number(op.combustivel) || 0; 
    }
    
    // Se não tem veículo vinculado
    if (!op.veiculoPlaca) {
        return Number(op.combustivel) || 0;
    }

    // Busca a média histórica
    var mediaConsumo = calcularMediaGlobalVeiculo(op.veiculoPlaca);
    
    // Se não tem histórico (veículo novo), usa o abastecimento lançado
    if (mediaConsumo <= 0) {
        return Number(op.combustivel) || 0;
    }

    var precoLitro = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca);
    
    // FÓRMULA: (KM da Viagem / Média Km/L) * Preço do Litro
    return (op.kmRodado / mediaConsumo) * precoLitro;
};

// -----------------------------------------------------------------------------
// 4. SINCRONIZAÇÃO DE DADOS (NUVEM <-> LOCAL)
// -----------------------------------------------------------------------------

// Baixa todos os dados do Firebase antes de iniciar a tela
async function sincronizarDadosComFirebase() {
    console.log(">>> INICIANDO SINCRONIA COM A NUVEM...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Offline ou sem empresa. Carregando dados locais.");
        carregarTodosDadosLocais(); 
        return;
    }

    const { db, doc, getDoc } = window.dbRef;
    const companyId = window.USUARIO_ATUAL.company;

    // Função genérica para baixar uma coleção
    async function baixarColecao(chave, setter) {
        try {
            const docRef = doc(db, 'companies', companyId, 'data', chave);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Tratamento especial para "Minha Empresa" (Objeto x Array)
                if (chave === CHAVE_DB_MINHA_EMPRESA) {
                    setter(data.items || {});
                } else {
                    setter(data.items || []);
                }
                
                // Salva backup no LocalStorage
                localStorage.setItem(chave, JSON.stringify(data.items || []));
            } else {
                setter([]);
            }
        } catch (e) {
            console.error("Erro ao baixar " + chave + ":", e);
        }
    }

    // Executa todos os downloads simultaneamente (Promise.all)
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

// Carrega do LocalStorage (Fallback)
function carregarTodosDadosLocais() {
    function load(chave) {
        try { return JSON.parse(localStorage.getItem(chave)) || []; } catch(e){ return []; }
    }
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

// Salva dados na Nuvem e no Local
async function salvarDadosGenerico(chave, dados, atualizarCacheCallback) {
    // 1. Atualiza Memória e Local
    atualizarCacheCallback(dados);
    localStorage.setItem(chave, JSON.stringify(dados));
    
    // 2. Atualiza Nuvem
    if (window.dbRef && window.USUARIO_ATUAL && window.USUARIO_ATUAL.company) {
        if (window.SYSTEM_STATUS.bloqueado && window.USUARIO_ATUAL.role !== 'admin_master') {
             return; // Bloqueio de escrita se conta suspensa
        }

        const { db, doc, setDoc } = window.dbRef;
        try {
            var dadosLimpos = sanitizarObjetoParaFirebase({ 
                items: dados, 
                lastUpdate: new Date().toISOString(),
                updatedBy: window.USUARIO_ATUAL.email
            });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) {
            console.error("Erro ao salvar no Firebase (" + chave + "):", erro);
        }
    }
}

// Funções Específicas de Salvamento (Atalhos)
const saveFuncionarios = (l) => salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, l, (d) => CACHE_FUNCIONARIOS = d);
const saveVeiculos = (l) => salvarDadosGenerico(CHAVE_DB_VEICULOS, l, (d) => CACHE_VEICULOS = d);
const saveContratantes = (l) => salvarDadosGenerico(CHAVE_DB_CONTRATANTES, l, (d) => CACHE_CONTRATANTES = d);
const saveOperacoes = (l) => salvarDadosGenerico(CHAVE_DB_OPERACOES, l, (d) => CACHE_OPERACOES = d);
const saveDespesas = (l) => salvarDadosGenerico(CHAVE_DB_DESPESAS, l, (d) => CACHE_DESPESAS = d);
const saveAtividades = (l) => salvarDadosGenerico(CHAVE_DB_ATIVIDADES, l, (d) => CACHE_ATIVIDADES = d);
const saveRecibos = (l) => salvarDadosGenerico(CHAVE_DB_RECIBOS, l, (d) => CACHE_RECIBOS = d);
const saveProfileRequests = (l) => salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, l, (d) => CACHE_PROFILE_REQUESTS = d);
const saveMinhaEmpresa = (d) => salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, d, (v) => CACHE_MINHA_EMPRESA = v);

// Buscas Rápidas
const buscarFuncionarioPorId = (id) => CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id));
const buscarVeiculoPorPlaca = (placa) => CACHE_VEICULOS.find(v => v.placa === placa);
const buscarContratantePorCnpj = (cnpj) => CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj));
const buscarAtividadePorId = (id) => CACHE_ATIVIDADES.find(a => String(a.id) === String(id));

// -----------------------------------------------------------------------------
// 5. DASHBOARD E GRÁFICOS
// -----------------------------------------------------------------------------

window.toggleDashboardPrivacy = function() {
    document.querySelectorAll('.privacy-target').forEach(el => el.classList.toggle('privacy-blur'));
    var icon = document.getElementById('btnPrivacyIcon');
    if (icon) {
        icon.className = icon.className.includes('slash') ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
};

window.atualizarDashboard = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var mesAtual = window.currentDate.getMonth();
    var anoAtual = window.currentDate.getFullYear();
    var faturamentoMes = 0;
    var custosMes = 0;
    var receitaHistorico = 0;

    // Processa Operações
    CACHE_OPERACOES.forEach(function(op) {
        if (op.status === 'CANCELADA') return;

        var valorFat = Number(op.faturamento) || 0;
        
        // Custo Combustível Real
        var custoComb = window.calcularCustoCombustivelOperacao(op);
        var custoOp = (Number(op.despesas) || 0) + custoComb;

        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoOp += (Number(op.comissao) || 0);
        }
        
        if (op.ajudantes) {
            op.ajudantes.forEach(aj => {
                if (!op.checkins || !op.checkins.faltas || !op.checkins.faltas[aj.id]) {
                    custoOp += (Number(aj.diaria) || 0);
                }
            });
        }

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') {
            receitaHistorico += valorFat;
        }

        var dataOp = new Date(op.data + 'T12:00:00');
        if (dataOp.getMonth() === mesAtual && dataOp.getFullYear() === anoAtual) {
            faturamentoMes += valorFat;
            custosMes += custoOp;
        }
    });

    // Processa Despesas Gerais
    CACHE_DESPESAS.forEach(function(desp) {
        var valorTotal = Number(desp.valor) || 0;
        var dataDesp = new Date(desp.data + 'T12:00:00');

        if (desp.modoPagamento === 'parcelado' && desp.parcelasTotal > 1) {
            var valorParcela = valorTotal / Number(desp.parcelasTotal);
            for (var i = 0; i < desp.parcelasTotal; i++) {
                var dt = new Date(dataDesp);
                dt.setDate(dt.getDate() + (i * 30)); // Aproximação de 30 dias
                if (dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual) {
                    custosMes += valorParcela;
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

    // Atualiza HTML
    if (document.getElementById('faturamentoMes')) {
        document.getElementById('faturamentoMes').textContent = formatarValorMoeda(faturamentoMes);
        document.getElementById('despesasMes').textContent = formatarValorMoeda(custosMes);
        document.getElementById('receitaMes').textContent = formatarValorMoeda(lucroMes);
        document.getElementById('receitaTotalHistorico').textContent = formatarValorMoeda(receitaHistorico);
        document.getElementById('margemLucroMedia').textContent = margem.toFixed(1) + '%';
    }

    atualizarGraficoPrincipal(mesAtual, anoAtual);
};

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart');
    if (!ctx) return;

    var filtroV = document.getElementById('filtroVeiculoGrafico') ? document.getElementById('filtroVeiculoGrafico').value : "";
    var filtroM = document.getElementById('filtroMotoristaGrafico') ? document.getElementById('filtroMotoristaGrafico').value : "";

    var gFat = 0, gComb = 0, gPes = 0, gMan = 0;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (filtroV && op.veiculoPlaca !== filtroV) return;
        if (filtroM && op.motoristaId !== filtroM) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            gFat += (Number(op.faturamento) || 0);
            gMan += (Number(op.despesas) || 0);
            gComb += window.calcularCustoCombustivelOperacao(op);

            if (!op.checkins || !op.checkins.faltaMotorista) {
                gPes += (Number(op.comissao) || 0);
            }
            if (op.ajudantes) {
                op.ajudantes.forEach(aj => {
                    if (!op.checkins?.faltas?.[aj.id]) gPes += (Number(aj.diaria) || 0);
                });
            }
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (filtroV && d.veiculoPlaca && d.veiculoPlaca !== filtroV) return;
        
        var val = 0;
        var dt = new Date(d.data + 'T12:00:00');
        
        if (d.modoPagamento === 'parcelado') {
            var vp = (Number(d.valor) || 0) / Number(d.parcelasTotal);
            for (var i = 0; i < d.parcelasTotal; i++) {
                var pDt = new Date(dt);
                pDt.setDate(pDt.getDate() + (i * 30));
                if (pDt.getMonth() === mes && pDt.getFullYear() === ano) val += vp;
            }
        } else {
            if (dt.getMonth() === mes && dt.getFullYear() === ano) val = (Number(d.valor) || 0);
        }

        if (val > 0) {
            var txt = removerAcentos(d.descricao || "");
            if (txt.includes("manutencao") || txt.includes("peca") || txt.includes("oleo")) gMan += val;
            else if (txt.includes("salario") || txt.includes("alimentacao")) gPes += val;
            else gMan += val;
        }
    });

    if (window.chartInstance) window.chartInstance.destroy();
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{
                label: 'R$',
                data: [gFat, gComb, gPes, gMan, (gFat - (gComb + gPes + gMan))],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#17a2b8', '#20c997']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// -----------------------------------------------------------------------------
// 6. CALENDÁRIO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = '';
    var now = window.currentDate;
    var mes = now.getMonth();
    var ano = now.getFullYear();

    label.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    var firstDay = new Date(ano, mes, 1).getDay();
    var daysInMonth = new Date(ano, mes + 1, 0).getDate();

    for (var i = 0; i < firstDay; i++) {
        var e = document.createElement('div');
        e.className = 'day-cell empty';
        grid.appendChild(e);
    }

    for (var d = 1; d <= daysInMonth; d++) {
        var cell = document.createElement('div');
        cell.className = 'day-cell';
        var dStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        var ops = CACHE_OPERACOES.filter(o => o.data === dStr && o.status !== 'CANCELADA');

        var html = `<span>${d}</span>`;
        if (ops.length > 0) {
            cell.classList.add('has-operation');
            var tot = ops.reduce((a, b) => a + (Number(b.faturamento) || 0), 0);
            var col = ops.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';
            html += `<div class="event-dot" style="background:${col}"></div><div style="font-size:0.6em;color:green;margin-top:auto">${formatarValorMoeda(tot)}</div>`;
            
            // Closure para clique
            (function(ds) {
                cell.onclick = function() { abrirModalDetalhesDia(ds); };
            })(dStr);
        } else {
            (function(ds) {
                cell.onclick = function() {
                    document.getElementById('operacaoData').value = ds;
                    var btn = document.querySelector('[data-page="operacoes"]');
                    if (btn) btn.click();
                };
            })(dStr);
        }
        cell.innerHTML = html;
        grid.appendChild(cell);
    }
};

window.changeMonth = function(d) {
    window.currentDate.setMonth(window.currentDate.getMonth() + d);
    renderizarCalendario();
    atualizarDashboard();
};

window.abrirModalDetalhesDia = function(ds) {
    var ops = CACHE_OPERACOES.filter(o => o.data === ds && o.status !== 'CANCELADA');
    var mb = document.getElementById('modalDayBody');
    var ms = document.getElementById('modalDaySummary');
    if (!mb) return;

    document.getElementById('modalDayTitle').textContent = 'OPERAÇÕES: ' + formatarDataParaBrasileiro(ds);

    // Resumo Financeiro do Dia
    var tFat = 0, tCust = 0;
    ops.forEach(o => {
        tFat += (Number(o.faturamento) || 0);
        
        var cComb = window.calcularCustoCombustivelOperacao(o);
        var cOutros = (Number(o.despesas) || 0);
        
        if (!o.checkins || !o.checkins.faltaMotorista) cOutros += (Number(o.comissao) || 0);
        if (o.ajudantes) o.ajudantes.forEach(aj => { if (!o.checkins?.faltas?.[aj.id]) cOutros += (Number(aj.diaria) || 0); });
        
        tCust += (cComb + cOutros);
    });

    if (ms) {
        ms.innerHTML = `
            <div style="display:flex;justify-content:space-between;padding:10px;background:#f5f5f5;border-radius:5px;text-align:center">
                <div><small>FATURAMENTO</small><br><strong style="color:green">${formatarValorMoeda(tFat)}</strong></div>
                <div><small>CUSTO REAL</small><br><strong style="color:red">${formatarValorMoeda(tCust)}</strong></div>
                <div><small>LUCRO</small><br><strong style="color:${(tFat - tCust) >= 0 ? 'blue' : 'red'}">${formatarValorMoeda(tFat - tCust)}</strong></div>
            </div>
        `;
    }

    var html = '<div style="max-height:400px;overflow-y:auto">';
    if (ops.length === 0) html += '<p style="text-align:center">Nenhuma operação.</p>';
    
    ops.forEach(op => {
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        
        html += `
            <div style="border:1px solid #ddd;margin-bottom:10px;border-radius:5px;padding:10px;background:white">
                <div style="display:flex;justify-content:space-between;font-weight:bold">
                    <span>${c}</span><span style="color:${op.status === 'EM_ANDAMENTO' ? 'orange' : '#666'}">${op.status}</span>
                </div>
                <div style="font-size:0.85em;color:#555;margin:5px 0">
                    ${op.veiculoPlaca} | Mot: ${m.split(' ')[0]}
                </div>
                <button class="btn-mini btn-secondary" style="width:100%" onclick="document.getElementById('modalDayOperations').style.display='none'; visualizarOperacao('${op.id}')">VER DETALHES COMPLETOS</button>
            </div>
        `;
    });
    
    html += '</div>';
    mb.innerHTML = html;
    document.getElementById('modalDayOperations').style.display = 'block';
};

// -----------------------------------------------------------------------------
// 7. CADASTROS, FORMULÁRIOS E UI
// -----------------------------------------------------------------------------

// Logica de Abas
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        var tgt = document.getElementById(btn.getAttribute('data-tab'));
        if (tgt) {
            tgt.classList.add('active');
            preencherTodosSelects();
        }
    });
});

// Cadastro Funcionário (Tratamento de Email)
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '...';

        try {
            var id = document.getElementById('funcionarioId').value || Date.now().toString();
            var email = document.getElementById('funcEmail').value.trim().toLowerCase();
            var senha = document.getElementById('funcSenha').value;
            var uid = id;

            // Se é novo cadastro com senha
            if (!document.getElementById('funcionarioId').value && senha) {
                if (senha.length < 6) throw new Error("Senha min 6 dígitos.");
                
                try {
                    uid = await window.dbRef.criarAuthUsuario(email, senha);
                    // Salva metadados do login
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                        uid: uid,
                        name: document.getElementById('funcNome').value.toUpperCase(),
                        email: email,
                        role: document.getElementById('funcFuncao').value,
                        company: window.USUARIO_ATUAL.company,
                        createdAt: new Date().toISOString(),
                        approved: true,
                        senhaVisual: senha
                    });
                } catch (err) {
                    if (err.code === 'auth/email-already-in-use') {
                        if (!confirm("O e-mail já existe no sistema. Deseja cadastrar os dados do funcionário mesmo assim?")) {
                            throw new Error("Cancelado pelo usuário.");
                        }
                    } else {
                        throw err;
                    }
                }
            }

            var obj = {
                id: uid,
                nome: document.getElementById('funcNome').value.toUpperCase(),
                funcao: document.getElementById('funcFuncao').value,
                documento: document.getElementById('funcDocumento').value,
                email: email,
                telefone: document.getElementById('funcTelefone').value,
                pix: document.getElementById('funcPix').value,
                endereco: document.getElementById('funcEndereco').value,
                cnh: document.getElementById('funcCNH').value,
                validadeCNH: document.getElementById('funcValidadeCNH').value,
                categoriaCNH: document.getElementById('funcCategoriaCNH').value,
                cursoDescricao: document.getElementById('funcCursoDescricao').value
            };

            if (senha) obj.senhaVisual = senha;

            // Filtra antigo e adiciona novo
            var lista = CACHE_FUNCIONARIOS.filter(f => f.id !== id && f.email !== email);
            lista.push(obj);

            await saveFuncionarios(lista);
            
            alert("Salvo!");
            e.target.reset();
            document.getElementById('funcionarioId').value = '';
            toggleDriverFields();
            preencherTodosSelects();

        } catch (er) {
            if (er.message !== 'Cancelado pelo usuário.') alert(er.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'SALVAR';
        }
    }

    // Outros submits
    if (e.target.id === 'formVeiculo') {
        e.preventDefault();
        var pl = document.getElementById('veiculoPlaca').value.toUpperCase();
        var l = CACHE_VEICULOS.filter(v => v.placa !== pl);
        l.push({
            placa: pl,
            modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
            ano: document.getElementById('veiculoAno').value,
            renavam: document.getElementById('veiculoRenavam').value,
            chassi: document.getElementById('veiculoChassi').value
        });
        saveVeiculos(l).then(() => { alert("Salvo!"); e.target.reset(); preencherTodosSelects(); });
    }

    if (e.target.id === 'formContratante') {
        e.preventDefault();
        var c = document.getElementById('contratanteCNPJ').value;
        var l = CACHE_CONTRATANTES.filter(x => x.cnpj !== c);
        l.push({
            cnpj: c,
            razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
            telefone: document.getElementById('contratanteTelefone').value
        });
        saveContratantes(l).then(() => { alert("Salvo!"); e.target.reset(); preencherTodosSelects(); });
    }

    if (e.target.id === 'formAtividade') {
        e.preventDefault();
        var id = document.getElementById('atividadeId').value || Date.now().toString();
        var l = CACHE_ATIVIDADES.filter(a => String(a.id) !== String(id));
        l.push({ id: id, nome: document.getElementById('atividadeNome').value.toUpperCase() });
        saveAtividades(l).then(() => { alert("Salvo!"); e.target.reset(); document.getElementById('atividadeId').value = ''; preencherTodosSelects(); });
    }

    if (e.target.id === 'formMinhaEmpresa') {
        e.preventDefault();
        saveMinhaEmpresa({
            razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
            cnpj: document.getElementById('minhaEmpresaCNPJ').value,
            telefone: document.getElementById('minhaEmpresaTelefone').value
        }).then(() => { alert("Salvo!"); renderizarInformacoesEmpresa(); });
    }

    if (e.target.id === 'formOperacao') {
        e.preventDefault();
        var id = document.getElementById('operacaoId').value;
        var old = id ? CACHE_OPERACOES.find(o => String(o.id) === String(id)) : null;
        var st = document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA';
        
        if (old && !document.getElementById('operacaoIsAgendamento').checked && (old.status === 'EM_ANDAMENTO' || old.status === 'FINALIZADA')) {
            st = old.status;
        }

        var op = {
            id: id || Date.now().toString(),
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
            status: st,
            checkins: old ? old.checkins : { motorista: false, faltaMotorista: false, ajudantes: {} },
            ajudantes: window._operacaoAjudantesTempList || [],
            kmInicial: old ? old.kmInicial : 0,
            kmFinal: old ? old.kmFinal : 0
        };

        var l = CACHE_OPERACOES.filter(o => String(o.id) !== String(op.id));
        l.push(op);
        
        saveOperacoes(l).then(() => {
            alert("Salvo!");
            e.target.reset();
            document.getElementById('operacaoId').value = '';
            window._operacaoAjudantesTempList = [];
            renderizarListaAjudantesAdicionados();
            preencherTodosSelects();
            renderizarCalendario();
            atualizarDashboard();
        });
    }

    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault();
        var id = document.getElementById('despesaGeralId').value || Date.now().toString();
        var d = {
            id: id,
            data: document.getElementById('despesaGeralData').value,
            veiculoPlaca: document.getElementById('selectVeiculoDespesaGeral').value,
            descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
            valor: Number(document.getElementById('despesaGeralValor').value),
            formaPagamento: document.getElementById('despesaFormaPagamento').value,
            modoPagamento: document.getElementById('despesaModoPagamento').value,
            parcelasTotal: document.getElementById('despesaParcelas').value,
            parcelasPagas: document.getElementById('despesaParcelasPagas').value,
            intervaloDias: document.getElementById('despesaIntervaloDias').value
        };
        var l = CACHE_DESPESAS.filter(x => String(x.id) !== String(id));
        l.push(d);
        saveDespesas(l).then(() => {
            alert("Salvo!");
            e.target.reset();
            document.getElementById('despesaGeralId').value = '';
            renderizarTabelaDespesasGerais();
            atualizarDashboard();
        });
    }
});

// UI Helpers
window.toggleDriverFields = function() { var s = document.getElementById('funcFuncao'), d = document.getElementById('driverSpecificFields'); if (s && d) d.style.display = s.value === 'motorista' ? 'block' : 'none'; };
window.toggleDespesaParcelas = function() { var s = document.getElementById('despesaModoPagamento'), d = document.getElementById('divDespesaParcelas'); if (s && d) d.style.display = s.value === 'parcelado' ? 'flex' : 'none'; };
window.renderizarListaAjudantesAdicionados = function() { var u = document.getElementById('listaAjudantesAdicionados'); if (!u) return; u.innerHTML = ''; (window._operacaoAjudantesTempList || []).forEach(i => { var f = buscarFuncionarioPorId(i.id); u.innerHTML += `<li>${f ? f.nome : '-'} (R$ ${formatarValorMoeda(i.diaria)}) <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${i.id}')">X</button></li>`; }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => x.id !== id); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var s = document.getElementById('selectAjudantesOperacao'), id = s.value, v = prompt("Diária:"); if (id && v) { window._operacaoAjudantesTempList.push({ id: id, diaria: Number(v.replace(',', '.')) }); renderizarListaAjudantesAdicionados(); s.value = ''; } });
window.limparOutroFiltro = function(t) { if (t === 'motorista') document.getElementById('filtroMotoristaGrafico').value = ''; else document.getElementById('filtroVeiculoGrafico').value = ''; };

// Preencher Listas
function preencherTodosSelects() {
    console.log("Atualizando UI...");
    const fill = (i, d, vk, tk, def) => { var e = document.getElementById(i); if (!e) return; var v = e.value; e.innerHTML = `<option value="">${def}</option>` + d.map(x => `<option value="${x[vk]}">${x[tk]}</option>`).join(''); if (v) e.value = v; };
    
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'motorista'), 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f => f.funcao === 'ajudante'), 'id', 'nome', 'ADD...');
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
    renderizarInformacoesEmpresa();
    
    if (window.renderizarTabelaDespesasGerais) renderizarTabelaDespesasGerais();
    if (window.renderizarTabelaMonitoramento) {
        renderizarTabelaMonitoramento();
        renderizarTabelaFaltas();
    }
    if (window.renderizarPainelEquipe) renderizarPainelEquipe();
}

function renderizarTabelaFuncionarios() { 
    var t = document.querySelector('#tabelaFuncionarios tbody'); 
    if (!t) return; 
    t.innerHTML = ''; 
    CACHE_FUNCIONARIOS.forEach(f => {
        // Correção de Botões na Tabela
        var btns = `<button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')"><i class="fas fa-edit"></i></button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>`;
        t.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email || '-'}</td><td>${btns}</td></tr>`;
    });
}

function renderizarTabelaVeiculos() { var t = document.querySelector('#tabelaVeiculos tbody'); if (!t) return; t.innerHTML = ''; CACHE_VEICULOS.forEach(v => { t.innerHTML += `<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioVeiculo('${v.placa}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td></tr>`; }); }
function renderizarTabelaContratantes() { var t = document.querySelector('#tabelaContratantes tbody'); if (!t) return; t.innerHTML = ''; CACHE_CONTRATANTES.forEach(c => { t.innerHTML += `<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioContratante('${c.cnpj}')">EDIT</button> <button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td></tr>`; }); }
function renderizarTabelaAtividades() { var t = document.querySelector('#tabelaAtividades tbody'); if (!t) return; t.innerHTML = ''; CACHE_ATIVIDADES.forEach(a => { t.innerHTML += `<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td></tr>`; }); }
function renderizarTabelaDespesasGerais() { var t = document.querySelector('#tabelaDespesasGerais tbody'); if (!t) return; t.innerHTML = ''; CACHE_DESPESAS.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(d => { t.innerHTML += `<tr><td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca || 'GERAL'}</td><td>${d.descricao}</td><td>${formatarValorMoeda(d.valor)}</td><td>${d.modoPagamento}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">X</button></td></tr>`; }); }
function renderizarInformacoesEmpresa() { var d = document.getElementById('viewMinhaEmpresaContent'); if (d && CACHE_MINHA_EMPRESA.razaoSocial) d.innerHTML = `<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>${CACHE_MINHA_EMPRESA.cnpj}`; }

// TABELA OPERAÇÕES (BOTÕES: VER, EDITAR, EXCLUIR)
function renderizarTabelaOperacoes() {
    var t = document.querySelector('#tabelaOperacoes tbody'); 
    if (!t) return; 
    t.innerHTML = ''; 
    var l = CACHE_OPERACOES.slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    l.forEach(op => {
        if (op.status === 'CANCELADA') return;
        var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
        var btns = window.MODO_APENAS_LEITURA ? '' : `
            <button class="btn-mini btn-info" onclick="visualizarOperacao('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
            <button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        `;
        t.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td>${btns}</td></tr>`;
    });
}

// Modal Operação (Custo Real)
window.visualizarOperacao = function(id) {
    var op = CACHE_OPERACOES.find(o => String(o.id) === String(id)); if (!op) return;
    var m = buscarFuncionarioPorId(op.motoristaId)?.nome || '-';
    var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
    
    // Custo Real
    var cComb = window.calcularCustoCombustivelOperacao(op);
    var cTotal = (Number(op.despesas) || 0) + cComb + (Number(op.comissao) || 0);
    if (op.ajudantes) op.ajudantes.forEach(aj => { cTotal += (Number(aj.diaria) || 0); });
    
    var hAj = op.ajudantes ? op.ajudantes.map(a => buscarFuncionarioPorId(a.id)?.nome).join(', ') : 'Nenhum';
    
    var html = `
        <div style="font-size:0.9rem">
            <div style="background:#f5f5f5;padding:10px;border-radius:5px;margin-bottom:10px">
                <h3>VIAGEM #${op.id.substr(-4)}</h3>
                <p><strong>Status:</strong> ${op.status}</p>
                <p><strong>Cliente:</strong> ${c}</p>
                <p><strong>Veículo:</strong> ${op.veiculoPlaca}</p>
                <p><strong>Motorista:</strong> ${m}</p>
                <p><strong>Ajudantes:</strong> ${hAj}</p>
            </div>
            <div style="background:#e8f5e9;padding:10px;border-radius:5px;margin-bottom:10px">
                <h4>FINANCEIRO</h4>
                <div style="display:flex;justify-content:space-between"><span>Faturamento:</span><strong>${formatarValorMoeda(op.faturamento)}</strong></div>
                <div style="display:flex;justify-content:space-between"><span>Combustível (Real):</span><span>${formatarValorMoeda(cComb)}</span></div>
                <div style="display:flex;justify-content:space-between"><span>Outros Custos:</span><span>${formatarValorMoeda(cTotal - cComb)}</span></div>
                <hr>
                <div style="display:flex;justify-content:space-between"><span>LUCRO:</span><strong style="color:${(op.faturamento - cTotal) >= 0 ? 'blue' : 'red'}">${formatarValorMoeda(op.faturamento - cTotal)}</strong></div>
            </div>
            <div style="background:#fff3e0;padding:10px;border-radius:5px">
                <h4>ROTA</h4>
                <p>KM Inicial: ${op.kmInicial || '-'} | KM Final: ${op.kmFinal || '-'} | Rodado: ${op.kmRodado || '-'}</p>
            </div>
        </div>
    `;
    document.getElementById('viewItemBody').innerHTML = html;
    document.getElementById('viewItemModal').style.display = 'flex';
};

// Funções de Exclusão
window.excluirFuncionario = async function(id) { if (confirm("Excluir?")) { if (window.dbRef) try { await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db, "users", id)); } catch (e) {} await saveFuncionarios(CACHE_FUNCIONARIOS.filter(f => f.id !== id)); alert("OK"); preencherTodosSelects(); } };
window.excluirVeiculo = function(pl) { if (confirm("Excluir?")) saveVeiculos(CACHE_VEICULOS.filter(v => v.placa !== pl)).then(preencherTodosSelects); };
window.excluirContratante = function(c) { if (confirm("Excluir?")) saveContratantes(CACHE_CONTRATANTES.filter(x => x.cnpj !== c)).then(preencherTodosSelects); };
window.excluirAtividade = function(id) { if (confirm("Excluir?")) saveAtividades(CACHE_ATIVIDADES.filter(a => a.id !== id)).then(preencherTodosSelects); };
window.excluirOperacao = function(id) { if (confirm("Excluir?")) saveOperacoes(CACHE_OPERACOES.filter(o => o.id !== id)).then(() => { preencherTodosSelects(); atualizarDashboard(); renderizarCalendario(); }); };
window.excluirDespesa = function(id) { if (confirm("Excluir?")) saveDespesas(CACHE_DESPESAS.filter(d => d.id !== id)).then(() => { renderizarTabelaDespesasGerais(); atualizarDashboard(); }); };

window.preencherFormularioFuncionario = function(id) { var f = buscarFuncionarioPorId(id); if (f) { document.getElementById('funcionarioId').value = f.id; document.getElementById('funcNome').value = f.nome; document.getElementById('funcFuncao').value = f.funcao; document.getElementById('funcDocumento').value = f.documento; document.getElementById('funcEmail').value = f.email; document.querySelector('[data-tab="funcionarios"]').click(); } };
window.preencherFormularioVeiculo = function(pl) { var v = buscarVeiculoPorPlaca(pl); if (v) { document.getElementById('veiculoPlaca').value = v.placa; document.getElementById('veiculoModelo').value = v.modelo; document.querySelector('[data-tab="veiculos"]').click(); } };
window.preencherFormularioContratante = function(c) { var x = buscarContratantePorCnpj(c); if (x) { document.getElementById('contratanteCNPJ').value = x.cnpj; document.getElementById('contratanteRazaoSocial').value = x.razaoSocial; document.querySelector('[data-tab="contratantes"]').click(); } };
window.preencherFormularioOperacao = function(id) { var o = CACHE_OPERACOES.find(x => x.id === id); if (o) { document.getElementById('operacaoId').value = o.id; document.getElementById('operacaoData').value = o.data; document.getElementById('selectMotoristaOperacao').value = o.motoristaId; document.getElementById('operacaoFaturamento').value = o.faturamento; document.querySelector('[data-page="operacoes"]').click(); } };

window.closeModal = function() { document.getElementById('operationDetailsModal').style.display = 'none'; };
window.closeViewModal = function() { document.getElementById('viewItemModal').style.display = 'none'; };
window.closeCheckinConfirmModal = function() { document.getElementById('modalCheckinConfirm').style.display = 'none'; };
window.closeAdicionarAjudanteModal = function() { document.getElementById('modalAdicionarAjudante').style.display = 'none'; };

// -----------------------------------------------------------------------------
// 8. MONITORAMENTO E EQUIPE
// -----------------------------------------------------------------------------
window.renderizarTabelaMonitoramento = function() {
    var tb = document.querySelector('#tabelaCheckinsPendentes tbody'); if (!tb) return; tb.innerHTML = '';
    var pend = CACHE_OPERACOES.filter(o => o.status === 'AGENDADA' || o.status === 'EM_ANDAMENTO').sort((a, b) => new Date(a.data) - new Date(b.data));
    var bg = document.getElementById('badgeCheckins'); if (bg) { bg.textContent = pend.length; bg.style.display = pend.length > 0 ? 'inline-block' : 'none'; }
    if (pend.length === 0) tb.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhuma rota.</td></tr>';
    pend.forEach(op => {
        var c = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-', m = buscarFuncionarioPorId(op.motoristaId);
        var stH = op.status === 'EM_ANDAMENTO' ? '<span style="color:orange">EM ROTA</span>' : 'AGENDADA';
        if (m) {
            var stE = op.checkins?.faltaMotorista ? '<b style="color:red">FALTA</b>' : (op.checkins?.motorista ? '<b style="color:green">OK</b>' : '...');
            var btn = op.checkins?.faltaMotorista ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${m.id}','motorista')">FALTA</button>`;
            tb.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m.nome}<br><small>${op.veiculoPlaca}</small></td><td>${c}</td><td>${stH}</td><td>${stE}</td><td>${btn}</td></tr>`;
        }
    });
};
window.registrarFalta = async function(oid, fid, t) { if (confirm("Confirmar Falta?")) { var o = CACHE_OPERACOES.find(x => x.id === oid); if (t === 'motorista') { if (!o.checkins) o.checkins = {}; o.checkins.faltaMotorista = true; o.checkins.motorista = false; } await saveOperacoes(CACHE_OPERACOES); renderizarTabelaMonitoramento(); } };
window.renderizarTabelaFaltas = function() { var t = document.querySelector('#tabelaFaltas tbody'); if (!t) return; t.innerHTML = ''; CACHE_OPERACOES.forEach(o => { if (o.checkins?.faltaMotorista) { var m = buscarFuncionarioPorId(o.motoristaId); if (m) t.innerHTML += `<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td style="color:red">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td></tr>`; } }); };

// EQUIPE (BOTÕES DE BLOQUEIO E STATUS)
window.renderizarPainelEquipe = function() {
    var t = document.querySelector('#tabelaCompanyAtivos tbody'); if (t) { t.innerHTML = ''; CACHE_FUNCIONARIOS.forEach(f => {
        var blk = f.isBlocked || false;
        var btnBlk = blk ? `<button class="btn-mini btn-danger" onclick="toggleBloqueioFunc('${f.id}')" title="DESBLOQUEAR"><i class="fas fa-lock"></i></button>` : `<button class="btn-mini btn-success" onclick="toggleBloqueioFunc('${f.id}')" title="BLOQUEAR"><i class="fas fa-unlock"></i></button>`;
        var btnSt = `<button class="btn-mini btn-info" onclick="verStatusFunc('${f.id}')" title="STATUS"><i class="fas fa-eye"></i></button>`;
        t.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${blk ? '<b style="color:red">BLOQUEADO</b>' : 'ATIVO'}</td><td>${btnBlk} ${btnSt}</td></tr>`;
    }); }
    
    if (window.dbRef) {
        window.dbRef.getDocs(window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", window.USUARIO_ATUAL.company), window.dbRef.where("approved", "==", false))).then(s => {
            var tp = document.querySelector('#tabelaCompanyPendentes tbody'); if (tp) { tp.innerHTML = ''; s.forEach(d => { var u = d.data(); tp.innerHTML += `<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-success" onclick="aprovarUsuario('${u.uid}')">OK</button></td></tr>`; }); }
        });
    }
    
    var tr = document.getElementById('tabelaProfileRequests')?.querySelector('tbody'); if (tr) { tr.innerHTML = ''; CACHE_PROFILE_REQUESTS.filter(x => x.status === 'PENDENTE').forEach(r => { var f = buscarFuncionarioPorId(r.funcionarioId); tr.innerHTML += `<tr><td>${r.campo}</td><td>${r.valorNovo}</td><td><button class="btn-success" onclick="aprovarProfileRequest('${r.id}')">OK</button></td></tr>`; }); }
};

window.verStatusFunc = async function(id) {
    var f = buscarFuncionarioPorId(id); if (!f) return;
    document.getElementById('modalStatusFuncionario').style.display = 'flex';
    var emRota = CACHE_OPERACOES.find(o => o.status === 'EM_ANDAMENTO' && (o.motoristaId === id || o.ajudantes?.some(a => a.id === id)));
    var blk = f.isBlocked || false;
    document.getElementById('statusFuncionarioBody').innerHTML = `<h3>${f.nome}</h3><p>Status: ${blk ? '<b style="color:red">BLOQUEADO</b>' : '<b style="color:green">ATIVO</b>'}</p><p>Rota: ${emRota ? '<b style="color:orange">EM ROTA</b>' : 'LIVRE'}</p>`;
    document.getElementById('statusFuncionarioActions').innerHTML = `<button class="btn-danger" style="width:100%" onclick="toggleBloqueioFunc('${f.id}')">${blk ? 'DESBLOQUEAR' : 'BLOQUEAR'}</button>`;
};

window.toggleBloqueioFunc = async function(id) {
    var f = buscarFuncionarioPorId(id); if (!confirm("Alterar bloqueio?")) return;
    f.isBlocked = !f.isBlocked; await saveFuncionarios(CACHE_FUNCIONARIOS);
    if (window.dbRef) await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { isBlocked: f.isBlocked });
    alert("Alterado."); document.getElementById('modalStatusFuncionario').style.display = 'none'; renderizarPainelEquipe();
};
window.aprovarUsuario = async function(id) { await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "users", id), { approved: true }); renderizarPainelEquipe(); };
window.aprovarProfileRequest = async function(id) { var r = CACHE_PROFILE_REQUESTS.find(x => x.id === id); if (r) { r.status = 'APROVADO'; await saveProfileRequests(CACHE_PROFILE_REQUESTS); renderizarPainelEquipe(); } };

// -----------------------------------------------------------------------------
// 9. RELATÓRIOS E RECIBOS
// -----------------------------------------------------------------------------
window.gerarRelatorioGeral = function() {
    var ops = CACHE_OPERACOES.filter(o => o.status !== 'CANCELADA');
    var h = '<table class="data-table"><thead><tr><th>DATA</th><th>VEÍCULO</th><th>FATURAMENTO</th><th>CUSTO REAL</th><th>LUCRO</th></tr></thead><tbody>';
    ops.forEach(o => {
        var c = window.calcularCustoCombustivelOperacao(o);
        h += `<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatarValorMoeda(o.faturamento)}</td><td>${formatarValorMoeda(c)}</td><td>${formatarValorMoeda((Number(o.faturamento) || 0) - c)}</td></tr>`;
    });
    document.getElementById('reportContent').innerHTML = h + '</tbody></table>'; document.getElementById('reportResults').style.display = 'block';
};
window.exportarRelatorioPDF = function() { var e = document.getElementById('reportContent'); if (e) html2pdf().from(e).save(); };
window.gerarReciboPagamento = function() { var id = document.getElementById('selectMotoristaRecibo').value; if (!id) return alert("Selecione"); var ops = CACHE_OPERACOES.filter(o => o.motoristaId === id && o.status !== 'CANCELADA'); var t = ops.reduce((a, b) => a + (Number(b.comissao) || 0), 0); document.getElementById('modalReciboContent').innerHTML = `<h3>TOTAL: ${formatarValorMoeda(t)}</h3>`; document.getElementById('modalRecibo').style.display = 'flex'; };
window.salvarReciboNoHistorico = async function(id, nm, i, f, v) { CACHE_RECIBOS.push({ id: Date.now().toString(), dataEmissao: new Date().toISOString(), funcionarioId: id, funcionarioNome: nm, periodo: i + ' a ' + f, valorTotal: v, enviado: false }); await saveRecibos(CACHE_RECIBOS); alert("Salvo!"); document.getElementById('modalRecibo').style.display = 'none'; renderizarHistoricoRecibos(); };
window.renderizarHistoricoRecibos = function() { var t = document.querySelector('#tabelaHistoricoRecibos tbody'); if (!t) return; t.innerHTML = ''; CACHE_RECIBOS.forEach(r => { var b = r.enviado ? 'ENVIADO' : `<button class="btn-primary" onclick="enviarReciboFuncionario('${r.id}')">ENVIAR</button>`; t.innerHTML += `<tr><td>${formatarDataParaBrasileiro(r.dataEmissao)}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${b}</td></tr>`; }); };
window.enviarReciboFuncionario = async function(id) { var r = CACHE_RECIBOS.find(x => x.id === id); if (r) { r.enviado = true; await saveRecibos(CACHE_RECIBOS); renderizarHistoricoRecibos(); alert("Enviado!"); } };

// -----------------------------------------------------------------------------
// 10. SUPER ADMIN E INICIALIZAÇÃO
// -----------------------------------------------------------------------------
window.carregarPainelSuperAdmin = async function() {
    const c = document.getElementById('superAdminContainer'); if (!c) return; c.innerHTML = '...';
    const { db, collection, getDocs } = window.dbRef; const s = await getDocs(collection(db, "companies")); const u = await getDocs(collection(db, "users"));
    const users = []; u.forEach(d => users.push(d.data()));
    c.innerHTML = ''; s.forEach(d => { var cp = d.data(); var adm = users.find(x => x.company === cp.id && x.role === 'admin'); c.innerHTML += `<div style="border:1px solid #ccc;margin:5px;padding:10px;background:white"><b>${cp.id.toUpperCase()}</b> (Admin: ${adm ? adm.email : '-'}) - ${cp.isBlocked ? 'BLOQUEADO' : 'ATIVO'} <button class="btn-mini btn-primary" onclick="abrirModalCreditos('${d.id}',null,${cp.isVitalicio || false},${cp.isBlocked || false})">EDITAR</button></div>`; });
};
window.abrirModalCreditos = function(id, v, vit, blk) { document.getElementById('empresaIdCredito').value = id; document.getElementById('checkVitalicio').checked = vit; document.getElementById('checkBloqueado').checked = blk; document.getElementById('modalCreditos').style.display = 'flex'; };
window.salvarCreditosEmpresa = async function() { var id = document.getElementById('empresaIdCredito').value, v = document.getElementById('checkVitalicio').checked, b = document.getElementById('checkBloqueado').checked; await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db, "companies", id), { isVitalicio: v, isBlocked: b }); alert("OK"); document.getElementById('modalCreditos').style.display = 'none'; carregarPainelSuperAdmin(); };
document.addEventListener('submit', async function(e) { if (e.target.id === 'formCreateCompany') { e.preventDefault(); var d = document.getElementById('newCompanyDomain').value.toLowerCase(), em = document.getElementById('newAdminEmail').value, p = document.getElementById('newAdminPassword').value; try { var u = await window.dbRef.criarAuthUsuario(em, p); await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", u), { uid: u, name: "ADMIN " + d, email: em, role: 'admin', company: d, approved: true, createdAt: new Date().toISOString() }); await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "companies", d), { id: d, createdAt: new Date().toISOString() }); alert("OK"); e.target.reset(); } catch (x) { alert(x.message); } } });

window.renderizarMeusDados = function() { var u = window.USUARIO_ATUAL; var d = CACHE_FUNCIONARIOS.find(f => f.id === u.uid) || u; document.getElementById('meusDadosContainer').innerHTML = `<div style="text-align:center;padding:20px;background:white"><h3>${d.nome || d.name}</h3><p>${d.funcao || d.role}</p><hr><p>Email: ${d.email}</p></div>`; };

window.initSystemByRole = async function(user) {
    console.log("INIT:", user.role); window.USUARIO_ATUAL = user;
    document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sidebar ul').forEach(u => u.style.display = 'none');

    if (EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').style.display = 'block'; setTimeout(() => document.getElementById('super-admin').classList.add('active'), 50);
        carregarPainelSuperAdmin(); return;
    }

    await sincronizarDadosComFirebase(); preencherTodosSelects();

    if (user.role === 'admin') {
        if (user.isBlocked) return document.body.innerHTML = "<h1 style='text-align:center;color:red;margin-top:50px'>BLOQUEADO</h1>";
        document.getElementById('menu-admin').style.display = 'block';
        var h = document.getElementById('home'); if (h) { h.style.display = 'block'; setTimeout(() => h.classList.add('active'), 50); }
        atualizarDashboard(); renderizarCalendario();
    } else {
        document.getElementById('menu-employee').style.display = 'block'; window.MODO_APENAS_LEITURA = true;
        var eh = document.getElementById('employee-home'); if (eh) { eh.style.display = 'block'; setTimeout(() => eh.classList.add('active'), 50); }
        renderizarCheckinFuncionario(); renderizarMeusDados();
    }
};

// Navegação
document.querySelectorAll('.nav-item').forEach(i => {
    i.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        this.classList.add('active'); var t = document.getElementById(this.getAttribute('data-page'));
        if (t) { t.style.display = 'block'; setTimeout(() => t.classList.add('active'), 10); }
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
        var p = this.getAttribute('data-page'); if (p === 'home') atualizarDashboard(); if (p === 'meus-dados') renderizarMeusDados(); if (p === 'employee-checkin') renderizarCheckinFuncionario();
    });
});
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));
window.exportDataBackup = function() { var d = { meta: { d: new Date() }, data: { f: CACHE_FUNCIONARIOS, v: CACHE_VEICULOS, o: CACHE_OPERACOES } }; var a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(d)); a.download = "bkp.json"; a.click(); };
window.importDataBackup = function(e) { var r = new FileReader(); r.onload = function(ev) { if (confirm("Restaurar?")) { var j = JSON.parse(ev.target.result); if (j.data) { localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(j.data.f)); localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(j.data.v)); localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(j.data.o)); alert("OK"); window.location.reload(); } } }; r.readAsText(e.target.files[0]); };
