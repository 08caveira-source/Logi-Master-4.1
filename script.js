// =============================================================================
// ARQUIVO: script.js
// SISTEMA LOGIMASTER - VERSÃO 4.0 (CORREÇÃO DE ABAS E VISUAL)
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

// 3. CACHE LOCAL
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];
var CACHE_PROFILE_REQUESTS = [];
var CACHE_RECIBOS = [];

// 4. HELPERS
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    var partes = dataIso.split('T')[0].split('-');
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

function sanitizarObjetoParaFirebase(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value === undefined) return null;
        return value;
    }));
}

// SINCRONIA COM A NUVEM
async function sincronizarDadosComFirebase() {
    console.log(">>> SYNC FIREBASE INICIADO...");
    
    if (!window.dbRef || !window.USUARIO_ATUAL || !window.USUARIO_ATUAL.company) {
        console.warn("Offline/Sem Empresa. Usando Local.");
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
            console.error(`Erro sync ${chave}:`, e);
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
    console.log(">>> SYNC OK.");
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
            var dadosLimpos = sanitizarObjetoParaFirebase({ items: dados, lastUpdate: new Date().toISOString() });
            await setDoc(doc(db, 'companies', window.USUARIO_ATUAL.company, 'data', chave), dadosLimpos);
        } catch (erro) { console.error("Erro Firebase:", erro); }
    }
}

async function salvarListaFuncionarios(l) { await salvarDadosGenerico(CHAVE_DB_FUNCIONARIOS, l, (d) => CACHE_FUNCIONARIOS = d); }
async function salvarListaVeiculos(l) { await salvarDadosGenerico(CHAVE_DB_VEICULOS, l, (d) => CACHE_VEICULOS = d); }
async function salvarListaContratantes(l) { await salvarDadosGenerico(CHAVE_DB_CONTRATANTES, l, (d) => CACHE_CONTRATANTES = d); }
async function salvarListaOperacoes(l) { await salvarDadosGenerico(CHAVE_DB_OPERACOES, l, (d) => CACHE_OPERACOES = d); }
async function salvarDadosMinhaEmpresa(d) { await salvarDadosGenerico(CHAVE_DB_MINHA_EMPRESA, d, (v) => CACHE_MINHA_EMPRESA = v); }
async function salvarListaDespesas(l) { await salvarDadosGenerico(CHAVE_DB_DESPESAS, l, (d) => CACHE_DESPESAS = d); }
async function salvarListaAtividades(l) { await salvarDadosGenerico(CHAVE_DB_ATIVIDADES, l, (d) => CACHE_ATIVIDADES = d); }
async function salvarListaRecibos(l) { await salvarDadosGenerico(CHAVE_DB_RECIBOS, l, (d) => CACHE_RECIBOS = d); }
async function salvarProfileRequests(l) { await salvarDadosGenerico(CHAVE_DB_PROFILE_REQUESTS, l, (d) => CACHE_PROFILE_REQUESTS = d); }

function buscarFuncionarioPorId(id) { return CACHE_FUNCIONARIOS.find(f => String(f.id) === String(id)); }
function buscarVeiculoPorPlaca(placa) { return CACHE_VEICULOS.find(v => v.placa === placa); }
function buscarContratantePorCnpj(cnpj) { return CACHE_CONTRATANTES.find(c => String(c.cnpj) === String(cnpj)); }
function buscarAtividadePorId(id) { return CACHE_ATIVIDADES.find(a => String(a.id) === String(id)); }
// =============================================================================
// PARTE 2: DASHBOARD E FINANCEIRO
// =============================================================================

window.toggleDashboardPrivacy = function() {
    const targets = document.querySelectorAll('.privacy-target');
    const icon = document.getElementById('btnPrivacyIcon');
    if (targets.length === 0) return;
    const isBlurred = targets[0].classList.contains('privacy-blur');
    targets.forEach(el => el.classList.toggle('privacy-blur'));
    if(icon) icon.className = isBlurred ? 'fas fa-eye' : 'fas fa-eye-slash';
};

window.calcularMediaGlobalVeiculo = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && (o.status === 'CONFIRMADA' || o.status === 'FINALIZADA'));
    if (ops.length === 0) return 0;
    var totalKm = 0; var totalLitros = 0;
    ops.forEach(op => {
        var km = Number(op.kmRodado)||0; var comb = Number(op.combustivel)||0; var pr = Number(op.precoLitro)||0;
        if (km > 0 && comb > 0 && pr > 0) { totalKm += km; totalLitros += (comb / pr); }
    });
    return totalLitros > 0 ? (totalKm / totalLitros) : 0;
};

window.obterPrecoMedioCombustivel = function(placa) {
    var ops = CACHE_OPERACOES.filter(o => o.veiculoPlaca === placa && Number(o.precoLitro) > 0);
    if (ops.length === 0) return 0;
    var ultimas = ops.slice(-5);
    var soma = ultimas.reduce((acc, curr) => acc + Number(curr.precoLitro), 0);
    return soma / ultimas.length;
};

window.atualizarDashboard = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;

    var mes = window.currentDate.getMonth(); var ano = window.currentDate.getFullYear();
    var fat = 0; var cus = 0; var hist = 0;
    
    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        var opFat = Number(op.faturamento)||0;
        var opCus = 0;
        
        // Combustível por Média
        if (op.kmRodado > 0 && op.veiculoPlaca) {
            var med = calcularMediaGlobalVeiculo(op.veiculoPlaca);
            var pr = Number(op.precoLitro) || obterPrecoMedioCombustivel(op.veiculoPlaca) || 6.00;
            if(med > 0) opCus += (op.kmRodado / med) * pr;
            else opCus += Number(op.combustivel)||0;
        }

        opCus += (Number(op.despesas)||0);
        if (!op.checkins || !op.checkins.faltaMotorista) opCus += (Number(op.comissao)||0);
        if (op.ajudantes) op.ajudantes.forEach(aj => { if(!op.checkins?.faltas?.[aj.id]) opCus += (Number(aj.diaria)||0); });

        if (op.status === 'CONFIRMADA' || op.status === 'FINALIZADA') hist += opFat;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) { fat += opFat; cus += opCus; }
    });

    CACHE_DESPESAS.forEach(d => {
        var v = Number(d.valor)||0;
        var dt = new Date(d.data + 'T12:00:00');
        if (d.modoPagamento === 'parcelado' && d.parcelasTotal > 1) {
            var parc = v / Number(d.parcelasTotal);
            for (var i=0; i<d.parcelasTotal; i++) {
                var pDt = new Date(dt); pDt.setDate(pDt.getDate() + (i*30));
                if (pDt.getMonth()===mes && pDt.getFullYear()===ano) cus += parc;
            }
        } else {
            if (dt.getMonth()===mes && dt.getFullYear()===ano) cus += v;
        }
    });

    var luc = fat - cus;
    var mar = fat > 0 ? (luc/fat)*100 : 0;

    var setTxt = (id, val) => { var e = document.getElementById(id); if(e) e.textContent = val; };
    setTxt('faturamentoMes', formatarValorMoeda(fat));
    setTxt('despesasMes', formatarValorMoeda(cus));
    setTxt('receitaMes', formatarValorMoeda(luc));
    setTxt('receitaTotalHistorico', formatarValorMoeda(hist));
    setTxt('margemLucroMedia', mar.toFixed(1) + '%');

    atualizarGraficoPrincipal(mes, ano);
};

function atualizarGraficoPrincipal(mes, ano) {
    var ctx = document.getElementById('mainChart'); if (!ctx) return; 
    var fV = document.getElementById('filtroVeiculoGrafico')?.value;
    var fM = document.getElementById('filtroMotoristaGrafico')?.value;

    var gFat=0, gCom=0, gPes=0, gMan=0;

    CACHE_OPERACOES.forEach(op => {
        if (op.status === 'CANCELADA') return;
        if (fV && op.veiculoPlaca !== fV) return;
        if (fM && op.motoristaId !== fM) return;

        var d = new Date(op.data + 'T12:00:00');
        if (d.getMonth() === mes && d.getFullYear() === ano) {
            gFat += (Number(op.faturamento)||0);
            gMan += (Number(op.despesas)||0);
            
            if (op.kmRodado > 0 && op.veiculoPlaca) {
                var med = calcularMediaGlobalVeiculo(op.veiculoPlaca);
                var pr = Number(op.precoLitro) || 6.00;
                if(med>0) gCom += (op.kmRodado / med) * pr;
                else gCom += (Number(op.combustivel)||0);
            }

            if (!op.checkins?.faltaMotorista) gPes += (Number(op.comissao)||0);
            if (op.ajudantes) op.ajudantes.forEach(aj => { if(!op.checkins?.faltas?.[aj.id]) gPes += (Number(aj.diaria)||0); });
        }
    });

    CACHE_DESPESAS.forEach(d => {
        if (fV && d.veiculoPlaca && d.veiculoPlaca !== fV) return;
        var v = 0;
        var dt = new Date(d.data + 'T12:00:00');
        if (d.modoPagamento === 'parcelado') {
            var qtd = Number(d.parcelasTotal);
            var vp = (Number(d.valor)||0) / qtd;
            for(var i=0; i<qtd; i++){ var pDt=new Date(dt); pDt.setDate(pDt.getDate()+(i*30)); if(pDt.getMonth()===mes && pDt.getFullYear()===ano) v+=vp; }
        } else { if(dt.getMonth()===mes && dt.getFullYear()===ano) v = Number(d.valor)||0; }

        if(v>0) {
            var txt = removerAcentos(d.descricao||"");
            if (txt.includes("manutencao")||txt.includes("peca")||txt.includes("pneu")||txt.includes("oleo")) gMan+=v;
            else if (txt.includes("salario")||txt.includes("comida")||txt.includes("hotel")) gPes+=v;
            else gMan+=v;
        }
    });

    if (window.chartInstance) window.chartInstance.destroy();
    window.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FATURAMENTO', 'COMBUSTÍVEL', 'PESSOAL', 'MANUTENÇÃO', 'LUCRO'],
            datasets: [{ label: 'R$', data: [gFat, gCom, gPes, gMan, (gFat-(gCom+gPes+gMan))], backgroundColor: ['#28a745','#dc3545','#ffc107','#17a2b8','#20c997'] }]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
}

window.renderizarCalendario = function() {
    if (window.USUARIO_ATUAL && window.USUARIO_ATUAL.role === 'admin_master') return;
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('currentMonthYear');
    if (!grid || !label) return;

    grid.innerHTML = ''; var now = window.currentDate;
    var mes = now.getMonth(); var ano = now.getFullYear();
    label.textContent = now.toLocaleDateString('pt-BR', { month:'long', year:'numeric' }).toUpperCase();

    var firstDay = new Date(ano, mes, 1).getDay();
    var daysInMonth = new Date(ano, mes+1, 0).getDate();

    for(var i=0; i<firstDay; i++) { var e=document.createElement('div'); e.className='day-cell empty'; grid.appendChild(e); }
    for(var d=1; d<=daysInMonth; d++) {
        var cell = document.createElement('div'); cell.className='day-cell';
        var dStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        var ops = CACHE_OPERACOES.filter(o => o.data === dStr && o.status !== 'CANCELADA');
        
        var html = `<span>${d}</span>`;
        if(ops.length > 0) {
            cell.classList.add('has-operation');
            var tot = ops.reduce((a,b) => a+(Number(b.faturamento)||0), 0);
            var color = ops.some(o => o.status === 'EM_ANDAMENTO') ? 'orange' : 'green';
            html += `<div class="event-dot" style="background:${color}"></div><div style="font-size:0.6em; color:green; margin-top:auto;">${formatarValorMoeda(tot)}</div>`;
            (function(ds){ cell.onclick = function() { abrirModalDetalhesDia(ds); }; })(dStr);
        } else {
            (function(ds){ cell.onclick = function() { var b=document.querySelector('[data-page="operacoes"]'); if(b) b.click(); document.getElementById('operacaoData').value=ds; }; })(dStr);
        }
        cell.innerHTML = html; grid.appendChild(cell);
    }
};
window.changeMonth = function(d) { window.currentDate.setMonth(window.currentDate.getMonth()+d); renderizarCalendario(); atualizarDashboard(); };
window.abrirModalDetalhesDia = function(ds) {
    var ops = CACHE_OPERACOES.filter(o=>o.data===ds && o.status!=='CANCELADA');
    var mb = document.getElementById('modalDayBody'); if(!mb) return;
    document.getElementById('modalDayTitle').textContent = 'DIA ' + formatarDataParaBrasileiro(ds);
    var h = '<table class="data-table" style="width:100%;font-size:0.8rem"><thead><tr><th>CLIENTE</th><th>VEÍCULO</th><th>MOTORISTA</th><th>VALOR</th></tr></thead><tbody>';
    ops.forEach(o => { h += `<tr><td>${buscarContratantePorCnpj(o.contratanteCNPJ)?.razaoSocial}</td><td>${o.veiculoPlaca}</td><td>${buscarFuncionarioPorId(o.motoristaId)?.nome}</td><td>${formatarValorMoeda(o.faturamento)}</td></tr>`; });
    h += '</tbody></table>'; mb.innerHTML = h; document.getElementById('modalDayOperations').style.display='block';
};
// =============================================================================
// PARTE 3: CADASTROS E INTERFACE (COM CORREÇÃO DAS ABAS)
// =============================================================================

// *** CORREÇÃO DAS ABAS DE CADASTRO ***
document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove ativo de todos os botões e formulários
        document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
        
        // Ativa o clicado
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetForm = document.getElementById(targetId);
        if (targetForm) {
            targetForm.classList.add('active');
            // Força atualização da tabela correspondente ao abrir a aba
            if(targetId === 'funcionarios') renderizarTabelaFuncionarios();
            if(targetId === 'veiculos') renderizarTabelaVeiculos();
            if(targetId === 'contratantes') renderizarTabelaContratantes();
            if(targetId === 'atividades') renderizarTabelaAtividades();
            if(targetId === 'minhaEmpresa') renderizarInformacoesEmpresa();
        }
    });
});

// FORMULÁRIOS
document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formFuncionario') {
        e.preventDefault(); var btn=e.target.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='AGUARDE...';
        try {
            var id=document.getElementById('funcionarioId').value || Date.now().toString();
            var email=document.getElementById('funcEmail').value.toLowerCase().trim();
            var pass=document.getElementById('funcSenha').value;
            var uid=id;

            if(!document.getElementById('funcionarioId').value && pass) {
                if(pass.length<6) throw new Error("Senha curta (min 6).");
                uid = await window.dbRef.criarAuthUsuario(email, pass);
                await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", uid), {
                    uid:uid, name:document.getElementById('funcNome').value.toUpperCase(), email:email, role:document.getElementById('funcFuncao').value,
                    company:window.USUARIO_ATUAL.company, createdAt:new Date().toISOString(), approved:true, senhaVisual:pass
                });
            }
            
            var obj = {
                id:uid, nome:document.getElementById('funcNome').value.toUpperCase(), funcao:document.getElementById('funcFuncao').value,
                documento:document.getElementById('funcDocumento').value, email:email, telefone:document.getElementById('funcTelefone').value,
                pix:document.getElementById('funcPix').value, endereco:document.getElementById('funcEndereco').value,
                cnh:document.getElementById('funcCNH').value, validadeCNH:document.getElementById('funcValidadeCNH').value, categoriaCNH:document.getElementById('funcCategoriaCNH').value, cursoDescricao:document.getElementById('funcCursoDescricao').value
            };
            if(pass) obj.senhaVisual=pass;

            var l = CACHE_FUNCIONARIOS.filter(f => f.id !== id && f.email !== email); l.push(obj);
            await salvarListaFuncionarios(l); alert("Salvo!"); e.target.reset(); document.getElementById('funcionarioId').value=''; preencherTodosSelects();
        } catch(err) { alert(err.message); } finally { btn.disabled=false; btn.textContent='SALVAR'; }
    }
    
    if (e.target.id === 'formVeiculo') { e.preventDefault(); var pl = document.getElementById('veiculoPlaca').value.toUpperCase(); var nv = { placa:pl, modelo:document.getElementById('veiculoModelo').value.toUpperCase(), ano:document.getElementById('veiculoAno').value, renavam:document.getElementById('veiculoRenavam').value, chassi:document.getElementById('veiculoChassi').value }; var l = CACHE_VEICULOS.filter(v=>v.placa!==pl); l.push(nv); salvarListaVeiculos(l).then(()=>{ alert("Salvo!"); e.target.reset(); preencherTodosSelects(); }); }
    
    if (e.target.id === 'formContratante') { e.preventDefault(); var c = document.getElementById('contratanteCNPJ').value; var nv = { cnpj:c, razaoSocial:document.getElementById('contratanteRazaoSocial').value.toUpperCase(), telefone:document.getElementById('contratanteTelefone').value }; var l = CACHE_CONTRATANTES.filter(x=>x.cnpj!==c); l.push(nv); salvarListaContratantes(l).then(()=>{ alert("Salvo!"); e.target.reset(); preencherTodosSelects(); }); }
    
    if (e.target.id === 'formAtividade') { e.preventDefault(); var id = document.getElementById('atividadeId').value||Date.now().toString(); var nv = { id:id, nome:document.getElementById('atividadeNome').value.toUpperCase() }; var l = CACHE_ATIVIDADES.filter(a=>String(a.id)!==String(id)); l.push(nv); salvarListaAtividades(l).then(()=>{ alert("Salvo!"); e.target.reset(); document.getElementById('atividadeId').value=''; preencherTodosSelects(); }); }
    
    if (e.target.id === 'formMinhaEmpresa') { e.preventDefault(); salvarDadosMinhaEmpresa({ razaoSocial:document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(), cnpj:document.getElementById('minhaEmpresaCNPJ').value, telefone:document.getElementById('minhaEmpresaTelefone').value }).then(()=>{ alert("Atualizado!"); renderizarInformacoesEmpresa(); }); }

    if (e.target.id === 'formOperacao') {
        e.preventDefault(); var id=document.getElementById('operacaoId').value;
        var old = id ? CACHE_OPERACOES.find(o=>String(o.id)===String(id)) : null;
        var st = document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA' : 'CONFIRMADA';
        if(old && !document.getElementById('operacaoIsAgendamento').checked && (old.status==='EM_ANDAMENTO'||old.status==='FINALIZADA')) st=old.status;
        var cks = (old && old.checkins) ? old.checkins : { motorista:false, faltaMotorista:false, ajudantes:{} };

        var nv = {
            id: id||Date.now().toString(), data:document.getElementById('operacaoData').value,
            motoristaId:document.getElementById('selectMotoristaOperacao').value, veiculoPlaca:document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ:document.getElementById('selectContratanteOperacao').value, atividadeId:document.getElementById('selectAtividadeOperacao').value,
            faturamento:document.getElementById('operacaoFaturamento').value, adiantamento:document.getElementById('operacaoAdiantamento').value,
            comissao:document.getElementById('operacaoComissao').value, despesas:document.getElementById('operacaoDespesas').value,
            combustivel:document.getElementById('operacaoCombustivel').value, precoLitro:document.getElementById('operacaoPrecoLitro').value,
            kmRodado:document.getElementById('operacaoKmRodado').value, status:st, checkins:cks, ajudantes:window._operacaoAjudantesTempList||[],
            kmInicial:old?old.kmInicial:0, kmFinal:old?old.kmFinal:0
        };
        var l = CACHE_OPERACOES.filter(o=>String(o.id)!==String(nv.id)); l.push(nv);
        salvarListaOperacoes(l).then(()=>{ alert("Salvo!"); e.target.reset(); document.getElementById('operacaoId').value=''; window._operacaoAjudantesTempList=[]; renderizarListaAjudantesAdicionados(); preencherTodosSelects(); renderizarCalendario(); atualizarDashboard(); });
    }

    if (e.target.id === 'formDespesaGeral') {
        e.preventDefault(); var id = document.getElementById('despesaGeralId').value || Date.now().toString();
        var nv = {
            id:id, data:document.getElementById('despesaGeralData').value, veiculoPlaca:document.getElementById('selectVeiculoDespesaGeral').value,
            descricao:document.getElementById('despesaGeralDescricao').value.toUpperCase(), valor:Number(document.getElementById('despesaGeralValor').value),
            formaPagamento:document.getElementById('despesaFormaPagamento').value, modoPagamento:document.getElementById('despesaModoPagamento').value,
            parcelasTotal:document.getElementById('despesaParcelas').value, parcelasPagas:document.getElementById('despesaParcelasPagas').value, intervaloDias:document.getElementById('despesaIntervaloDias').value
        };
        var l = CACHE_DESPESAS.filter(d=>String(d.id)!==String(id)); l.push(nv);
        salvarListaDespesas(l).then(()=>{ alert("Salvo!"); e.target.reset(); document.getElementById('despesaGeralId').value=''; renderizarTabelaDespesasGerais(); atualizarDashboard(); });
    }
});

// RENDERIZAÇÃO
function preencherTodosSelects() {
    console.log("Atualizando Selects e Tabelas...");
    const fill = (id, arr, vk, tk, def) => { var e=document.getElementById(id); if(!e) return; var v=e.value; e.innerHTML=`<option value="">${def}</option>`+arr.map(x=>`<option value="${x[vk]}">${x[tk]}</option>`).join(''); if(v) e.value=v; };
    
    fill('selectMotoristaOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='motorista'), 'id', 'nome', 'SELECIONE...');
    fill('selectVeiculoOperacao', CACHE_VEICULOS, 'placa', 'placa', 'SELECIONE...');
    fill('selectContratanteOperacao', CACHE_CONTRATANTES, 'cnpj', 'razaoSocial', 'SELECIONE...');
    fill('selectAtividadeOperacao', CACHE_ATIVIDADES, 'id', 'nome', 'SELECIONE...');
    fill('selectAjudantesOperacao', CACHE_FUNCIONARIOS.filter(f=>f.funcao==='ajudante'), 'id', 'nome', 'ADD AJUDANTE...');
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
    if(window.renderizarTabelaMonitoramento) { renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); }
    if(window.renderizarPainelEquipe) renderizarPainelEquipe();
    if(window.renderizarTabelaDespesasGerais) renderizarTabelaDespesasGerais();
}

function renderizarTabelaFuncionarios() { var t=document.querySelector('#tabelaFuncionarios tbody'); if(t) { t.innerHTML=''; CACHE_FUNCIONARIOS.forEach(f=>{ t.innerHTML+=`<tr><td>${f.nome}</td><td>${f.funcao}</td><td>${f.email||'-'}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioFuncionario('${f.id}')">EDT</button> <button class="btn-mini delete-btn" onclick="excluirFuncionario('${f.id}')">DEL</button></td></tr>`; }); } }
function renderizarTabelaVeiculos() { var t=document.querySelector('#tabelaVeiculos tbody'); if(t) { t.innerHTML=''; CACHE_VEICULOS.forEach(v=>{ t.innerHTML+=`<tr><td>${v.placa}</td><td>${v.modelo}</td><td>${v.ano}</td><td><button class="btn-mini delete-btn" onclick="excluirVeiculo('${v.placa}')">DEL</button></td></tr>`; }); } }
function renderizarTabelaContratantes() { var t=document.querySelector('#tabelaContratantes tbody'); if(t) { t.innerHTML=''; CACHE_CONTRATANTES.forEach(c=>{ t.innerHTML+=`<tr><td>${c.razaoSocial}</td><td>${c.cnpj}</td><td>${c.telefone}</td><td><button class="btn-mini delete-btn" onclick="excluirContratante('${c.cnpj}')">DEL</button></td></tr>`; }); } }
function renderizarTabelaAtividades() { var t=document.querySelector('#tabelaAtividades tbody'); if(t) { t.innerHTML=''; CACHE_ATIVIDADES.forEach(a=>{ t.innerHTML+=`<tr><td>${a.id.substr(-4)}</td><td>${a.nome}</td><td><button class="btn-mini delete-btn" onclick="excluirAtividade('${a.id}')">DEL</button></td></tr>`; }); } }
function renderizarTabelaOperacoes() { var t=document.querySelector('#tabelaOperacoes tbody'); if(t) { t.innerHTML=''; var l=CACHE_OPERACOES.slice().sort((a,b)=>new Date(b.data)-new Date(a.data)); l.forEach(op=>{ if(op.status==='CANCELADA') return; var m=buscarFuncionarioPorId(op.motoristaId)?.nome||'-'; t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m}<br><small>${op.veiculoPlaca}</small></td><td>${op.status}</td><td>${formatarValorMoeda(op.faturamento)}</td><td><button class="btn-mini edit-btn" onclick="preencherFormularioOperacao('${op.id}')">EDT</button> <button class="btn-mini delete-btn" onclick="excluirOperacao('${op.id}')">DEL</button></td></tr>`; }); } }
function renderizarTabelaDespesasGerais() { var t=document.querySelector('#tabelaDespesasGerais tbody'); if(t) { t.innerHTML=''; CACHE_DESPESAS.sort((a,b)=>new Date(b.data)-new Date(a.data)).forEach(d=>{ t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(d.data)}</td><td>${d.veiculoPlaca||'GERAL'}</td><td>${d.descricao}</td><td>${formatarValorMoeda(d.valor)}</td><td>${d.modoPagamento}</td><td><button class="btn-mini delete-btn" onclick="excluirDespesa('${d.id}')">DEL</button></td></tr>`; }); } }
function renderizarInformacoesEmpresa() { var d=document.getElementById('viewMinhaEmpresaContent'); if(d && CACHE_MINHA_EMPRESA.razaoSocial) d.innerHTML=`<strong>${CACHE_MINHA_EMPRESA.razaoSocial}</strong><br>${CACHE_MINHA_EMPRESA.cnpj}<br>${CACHE_MINHA_EMPRESA.telefone}`; }

window.excluirFuncionario = async function(id) { if(confirm("Excluir?")) { if(window.dbRef) try{ await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db,"users",id)); }catch(e){} var l=CACHE_FUNCIONARIOS.filter(f=>String(f.id)!==String(id)); await salvarListaFuncionarios(l); preencherTodosSelects(); } };
window.excluirVeiculo = function(pl) { if(confirm("Excluir?")) { var l=CACHE_VEICULOS.filter(v=>v.placa!==pl); salvarListaVeiculos(l).then(()=>preencherTodosSelects()); } };
window.excluirContratante = function(c) { if(confirm("Excluir?")) { var l=CACHE_CONTRATANTES.filter(x=>x.cnpj!==c); salvarListaContratantes(l).then(()=>preencherTodosSelects()); } };
window.excluirAtividade = function(id) { if(confirm("Excluir?")) { var l=CACHE_ATIVIDADES.filter(a=>String(a.id)!==String(id)); salvarListaAtividades(l).then(()=>preencherTodosSelects()); } };
window.excluirOperacao = function(id) { if(confirm("Excluir?")) { var l=CACHE_OPERACOES.filter(o=>String(o.id)!==String(id)); salvarListaOperacoes(l).then(()=>{ preencherTodosSelects(); atualizarDashboard(); renderizarCalendario(); }); } };
window.excluirDespesa = function(id) { if(confirm("Excluir?")) { var l=CACHE_DESPESAS.filter(d=>String(d.id)!==String(id)); salvarListaDespesas(l).then(()=>{ renderizarTabelaDespesasGerais(); atualizarDashboard(); }); } };

window.preencherFormularioFuncionario = function(id) { var f=buscarFuncionarioPorId(id); if(!f) return; document.getElementById('funcionarioId').value=f.id; document.getElementById('funcNome').value=f.nome; document.getElementById('funcFuncao').value=f.funcao; document.getElementById('funcDocumento').value=f.documento; document.getElementById('funcEmail').value=f.email; document.getElementById('funcTelefone').value=f.telefone; document.querySelector('[data-tab="funcionarios"]').click(); };
window.preencherFormularioOperacao = function(id) { var op=CACHE_OPERACOES.find(o=>String(o.id)===String(id)); if(!op) return; document.getElementById('operacaoId').value=op.id; document.getElementById('operacaoData').value=op.data; document.getElementById('selectMotoristaOperacao').value=op.motoristaId; document.getElementById('selectVeiculoOperacao').value=op.veiculoPlaca; document.getElementById('operacaoFaturamento').value=op.faturamento; document.querySelector('[data-page="operacoes"]').click(); };

window.toggleDriverFields = function() { var s=document.getElementById('funcFuncao'); var d=document.getElementById('driverSpecificFields'); if(s&&d) d.style.display=(s.value==='motorista')?'block':'none'; };
window.toggleDespesaParcelas = function() { var s=document.getElementById('despesaModoPagamento'); var d=document.getElementById('divDespesaParcelas'); if(s&&d) d.style.display=(s.value==='parcelado')?'flex':'none'; };
window.renderizarListaAjudantesAdicionados = function() { var ul=document.getElementById('listaAjudantesAdicionados'); if(!ul) return; ul.innerHTML=''; (window._operacaoAjudantesTempList||[]).forEach(i=>{ var f=buscarFuncionarioPorId(i.id); ul.innerHTML+=`<li>${f?f.nome:'-'} (R$ ${i.diaria}) <button type="button" class="btn-mini delete-btn" onclick="removerAjudanteTemp('${i.id}')">X</button></li>`; }); };
window.removerAjudanteTemp = function(id) { window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x=>String(x.id)!==String(id)); renderizarListaAjudantesAdicionados(); };
document.getElementById('btnManualAddAjudante')?.addEventListener('click', function() { var s=document.getElementById('selectAjudantesOperacao'); var id=s.value; if(!id) return alert("Selecione"); var v=prompt("Valor:"); if(v) { window._operacaoAjudantesTempList.push({id:id, diaria:Number(v.replace(',','.'))}); renderizarListaAjudantesAdicionados(); s.value=''; } });
window.closeModal=function(){document.getElementById('operationDetailsModal').style.display='none';}; window.closeViewModal=function(){document.getElementById('viewItemModal').style.display='none';}; window.closeCheckinConfirmModal=function(){document.getElementById('modalCheckinConfirm').style.display='none';}; window.closeAdicionarAjudanteModal=function(){document.getElementById('modalAdicionarAjudante').style.display='none';};
// =============================================================================
// PARTE 4: MONITORAMENTO, RECIBOS E FUNCIONÁRIO
// =============================================================================

window.renderizarTabelaMonitoramento = function() {
    var tb = document.querySelector('#tabelaCheckinsPendentes tbody'); if(!tb) return; tb.innerHTML = '';
    var pend = CACHE_OPERACOES.filter(o => o.status === 'AGENDADA' || o.status === 'EM_ANDAMENTO').sort((a,b)=>new Date(a.data)-new Date(b.data));
    
    var bg = document.getElementById('badgeCheckins'); if(bg) { bg.textContent=pend.length; bg.style.display=pend.length>0?'inline-block':'none'; }
    if(pend.length===0) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma rota ativa.</td></tr>';

    pend.forEach(op => {
        var cli = buscarContratantePorCnpj(op.contratanteCNPJ)?.razaoSocial || '-';
        var stHtml = op.status === 'EM_ANDAMENTO' ? '<span class="status-pill" style="background:orange;">EM ROTA</span>' : '<span class="status-pill pill-pending">AGENDADA</span>';
        var m = buscarFuncionarioPorId(op.motoristaId);
        if(m) {
            var stEq = op.checkins?.faltaMotorista ? '<span style="color:red">FALTA</span>' : (op.checkins?.motorista ? '<span style="color:green">OK</span>' : 'AGUARDANDO');
            var btn = op.checkins?.faltaMotorista ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${m.id}','motorista')">FALTA</button>`;
            tb.innerHTML += `<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td>${m.nome}<br><small>${op.veiculoPlaca}</small></td><td>${cli}</td><td>${stHtml}</td><td>${stEq}</td><td>${btn}</td></tr>`;
        }
        if(op.ajudantes) op.ajudantes.forEach(aj=>{
            var a = buscarFuncionarioPorId(aj.id); if(a) {
                var btnAj = op.checkins?.faltas?.[aj.id] ? '-' : `<button class="btn-mini btn-danger" onclick="registrarFalta('${op.id}','${aj.id}','ajudante')">FALTA</button>`;
                tb.innerHTML += `<tr style="background:#f9f9f9"><td style="border:none"></td><td>${a.nome} (Ajud)</td><td colspan="3" style="color:#777"><small>^ Vinculado</small></td><td>${btnAj}</td></tr>`;
            }
        });
    });
};

window.registrarFalta = async function(opId, fId, tipo) {
    if(!confirm("Marcar Falta?")) return;
    var op = CACHE_OPERACOES.find(o=>String(o.id)===String(opId)); if(!op) return;
    if(!op.checkins) op.checkins = {motorista:false, faltaMotorista:false, faltas:{}};
    if(tipo==='motorista') { op.checkins.faltaMotorista=true; op.checkins.motorista=false; }
    else { if(!op.checkins.faltas) op.checkins.faltas={}; op.checkins.faltas[fId]=true; }
    await salvarListaOperacoes(CACHE_OPERACOES);
    renderizarTabelaMonitoramento(); renderizarTabelaFaltas(); atualizarDashboard();
};

window.renderizarTabelaFaltas = function() {
    var tb = document.querySelector('#tabelaFaltas tbody'); if(!tb) return; tb.innerHTML='';
    CACHE_OPERACOES.forEach(op=>{
        if(op.checkins?.faltaMotorista) { var m=buscarFuncionarioPorId(op.motoristaId); if(m) tb.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red">${m.nome}</td><td>MOTORISTA</td><td>FALTA</td><td>-</td></tr>`; }
        if(op.checkins?.faltas) Object.keys(op.checkins.faltas).forEach(k=>{ if(op.checkins.faltas[k]) { var a=buscarFuncionarioPorId(k); if(a) tb.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(op.data)}</td><td style="color:red">${a.nome}</td><td>AJUDANTE</td><td>FALTA</td><td>-</td></tr>`; }});
    });
};

window.renderizarPainelEquipe = function() {
    var tA = document.querySelector('#tabelaCompanyAtivos tbody'); 
    if (tA) {
        tA.innerHTML = '';
        if(CACHE_FUNCIONARIOS.length===0) tA.innerHTML = '<tr><td colspan="4" style="text-align:center">Nenhum funcionário.</td></tr>';
        else CACHE_FUNCIONARIOS.forEach(f => tA.innerHTML += `<tr><td>${f.nome}</td><td>${f.funcao.toUpperCase()}</td><td><span class="status-pill pill-active">ATIVO</span></td><td>-</td></tr>`);
    }
    // Pendentes
    if (window.dbRef) {
        const q = window.dbRef.query(window.dbRef.collection(window.dbRef.db, "users"), window.dbRef.where("company", "==", window.USUARIO_ATUAL.company), window.dbRef.where("approved", "==", false));
        window.dbRef.getDocs(q).then(s => {
            var tP = document.querySelector('#tabelaCompanyPendentes tbody');
            if(tP) {
                tP.innerHTML = '';
                if(s.empty) tP.innerHTML = '<tr><td colspan="3" style="text-align:center">Nenhum pendente.</td></tr>';
                s.forEach(d => { var u=d.data(); tP.innerHTML+=`<tr><td>${u.name}</td><td>${u.email}</td><td><button class="btn-success" onclick="aprovarUser('${u.uid}')">OK</button></td></tr>`; });
            }
        });
    }
    // Requests
    var tR = document.getElementById('tabelaProfileRequests')?.querySelector('tbody');
    if(tR) {
        tR.innerHTML = '';
        CACHE_PROFILE_REQUESTS.filter(r=>r.status==='PENDENTE').forEach(r=>{
            var f = buscarFuncionarioPorId(r.funcionarioId);
            tR.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(r.data)}</td><td>${f?f.nome:'-'}</td><td>${r.campo}</td><td>${r.valorNovo}</td><td><button class="btn-success" onclick="aprovarRequest('${r.id}')">OK</button></td></tr>`;
        });
    }
};
window.aprovarUser = async function(id) { await window.dbRef.updateDoc(window.dbRef.doc(window.dbRef.db,"users",id),{approved:true}); renderizarPainelEquipe(); };
window.aprovarRequest = async function(id) {
    var r = CACHE_PROFILE_REQUESTS.find(x=>x.id===id); if(!r) return;
    var f = CACHE_FUNCIONARIOS.find(x=>String(x.id)===String(r.funcionarioId));
    if(f) {
        if(r.campo==='TELEFONE') f.telefone=r.valorNovo;
        if(r.campo==='ENDERECO') f.endereco=r.valorNovo;
        if(r.campo==='PIX') f.pix=r.valorNovo;
        await salvarListaFuncionarios(CACHE_FUNCIONARIOS);
    }
    r.status='APROVADO'; await salvarProfileRequests(CACHE_PROFILE_REQUESTS); renderizarPainelEquipe();
};

window.gerarReciboPagamento = function() {
    var id=document.getElementById('selectMotoristaRecibo').value; var i=document.getElementById('dataInicioRecibo').value; var f=document.getElementById('dataFimRecibo').value;
    if(!id||!i||!f) return alert("Preencha tudo.");
    var func = buscarFuncionarioPorId(id);
    var tot=0; var l=[];
    CACHE_OPERACOES.forEach(op=>{
        if(op.status==='CANCELADA'||op.data<i||op.data>f) return;
        var v=0;
        if(op.motoristaId===id && !op.checkins?.faltaMotorista) v=Number(op.comissao)||0;
        else if(op.ajudantes && op.ajudantes.find(a=>a.id===id) && !op.checkins?.faltas?.[id]) v=Number(op.ajudantes.find(a=>a.id===id).diaria)||0;
        if(v>0) { tot+=v; l.push({d:op.data, v:v}); }
    });
    var h = `<div style="padding:20px;font-family:monospace"><h3>RECIBO: ${func.nome}</h3><p>${formatarDataParaBrasileiro(i)} a ${formatarDataParaBrasileiro(f)}</p><hr>${l.map(x=>`<div style="display:flex;justify-content:space-between"><span>${formatarDataParaBrasileiro(x.d)}</span><span>${formatarValorMoeda(x.v)}</span></div>`).join('')}<hr><h3>TOTAL: ${formatarValorMoeda(tot)}</h3></div>`;
    document.getElementById('modalReciboContent').innerHTML=h;
    document.getElementById('modalReciboActions').innerHTML=`<button class="btn-success" onclick="salvarRecibo('${id}','${func.nome}','${i}','${f}',${tot})">GERAR</button>`;
    document.getElementById('modalRecibo').style.display='flex';
};
window.salvarRecibo = async function(id,nm,i,f,v) { CACHE_RECIBOS.push({id:Date.now().toString(), dataEmissao:new Date().toISOString(), funcionarioId:id, funcionarioNome:nm, periodo:i+' a '+f, valorTotal:v, enviado:false}); await salvarListaRecibos(CACHE_RECIBOS); alert("Salvo!"); document.getElementById('modalRecibo').style.display='none'; renderizarHistoricoRecibos(); };
window.renderizarHistoricoRecibos = function() {
    var t=document.querySelector('#tabelaHistoricoRecibos tbody'); if(!t) return; t.innerHTML='';
    CACHE_RECIBOS.forEach(r=>{ var b=r.enviado?'ENVIADO':`<button class="btn-primary" onclick="enviarRecibo('${r.id}')">ENVIAR</button>`; t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(r.dataEmissao)}</td><td>${r.funcionarioNome}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>${b}</td></tr>`; });
};
window.enviarRecibo = async function(id) { var r=CACHE_RECIBOS.find(x=>x.id===id); if(r) { r.enviado=true; await salvarListaRecibos(CACHE_RECIBOS); renderizarHistoricoRecibos(); alert("Enviado!"); } };

window.renderizarCheckinFuncionario = function() {
    var c=document.getElementById('checkin-container'); if(!c) return;
    var uid=window.USUARIO_ATUAL.uid;
    var ops=CACHE_OPERACOES.filter(o=>o.motoristaId===uid && o.status!=='CANCELADA' && (o.status==='AGENDADA'||o.status==='EM_ANDAMENTO'));
    if(ops.length===0) { c.innerHTML='<p style="text-align:center">Sem viagens.</p>'; return; }
    var h='';
    ops.forEach(op=>{
        var btn=op.status==='AGENDADA' ? `<button class="btn-success" onclick="iniV('${op.id}')">INICIAR</button>` : `<button class="btn-warning" onclick="fimV('${op.id}')">FINALIZAR</button>`;
        h+=`<div style="border:1px solid #ccc;padding:15px;margin-bottom:10px;border-radius:5px"><h4>${op.veiculoPlaca}</h4><p>${formatarDataParaBrasileiro(op.data)}</p>${btn}</div>`;
    });
    c.innerHTML=h;
};
window.iniV = async function(id) { if(!confirm("Iniciar?")) return; var o=CACHE_OPERACOES.find(x=>String(x.id)===String(id)); if(o) { o.status='EM_ANDAMENTO'; if(!o.checkins) o.checkins={}; o.checkins.motorista=true; await salvarListaOperacoes(CACHE_OPERACOES); renderizarCheckinFuncionario(); } };
window.fimV = async function(id) { var km=prompt("KM Final:"); if(!km) return; var o=CACHE_OPERACOES.find(x=>String(x.id)===String(id)); if(o) { o.status='FINALIZADA'; o.kmFinal=km; o.kmRodado=Number(km)-Number(o.kmInicial||0); await salvarListaOperacoes(CACHE_OPERACOES); renderizarCheckinFuncionario(); } };
window.filtrarServicosFuncionario = function(uid) {
    var i=document.getElementById('dataInicioServicosFunc').value; var f=document.getElementById('dataFimServicosFunc').value;
    var ops=CACHE_OPERACOES.filter(o=>{ var me=(o.motoristaId===uid || (o.ajudantes && o.ajudantes.some(a=>a.id===uid))); var dt=(!i||o.data>=i) && (!f||o.data<=f); return me && o.status!=='CANCELADA' && dt; });
    var t=document.getElementById('tabelaMeusServicos').querySelector('tbody'); t.innerHTML='';
    ops.forEach(o=>{ var v=(o.motoristaId===uid)?(Number(o.comissao)||0):(Number(o.ajudantes.find(a=>a.id===uid).diaria)||0); t.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(o.data)}</td><td>${o.veiculoPlaca}</td><td>${formatarValorMoeda(v)}</td></tr>`; });
    var tr=document.getElementById('tabelaMeusRecibos').querySelector('tbody'); tr.innerHTML='';
    CACHE_RECIBOS.filter(r=>String(r.funcionarioId)===String(uid) && r.enviado).forEach(r=>{ tr.innerHTML+=`<tr><td>${formatarDataParaBrasileiro(r.dataEmissao)}</td><td>${r.periodo}</td><td>${formatarValorMoeda(r.valorTotal)}</td><td>OK</td></tr>`; });
};
// =============================================================================
// PARTE 5: SUPER ADMIN E INICIALIZAÇÃO (VISUAL LIMPO E CORRIGIDO)
// =============================================================================

const EMAILS_MESTRES = ["admin@logimaster.com", "suporte@logimaster.com", "08caveira@gmail.com"]; 

// SUPER ADMIN (VISUAL LIMPO)
window.carregarPainelSuperAdmin = async function() {
    const c = document.getElementById('superAdminContainer'); if(!c) return;
    c.innerHTML = '<p style="text-align:center;padding:20px;">Carregando...</p>';
    try {
        const { db, collection, getDocs } = window.dbRef;
        const compSnap = await getDocs(collection(db, "companies"));
        const userSnap = await getDocs(collection(db, "users"));
        const comps=[]; compSnap.forEach(d=>comps.push({id:d.id, ...d.data()}));
        const users=[]; userSnap.forEach(d=>users.push({uid:d.id, ...d.data()}));
        c.innerHTML = '';
        if(comps.length===0) c.innerHTML='Nenhuma empresa.';

        comps.forEach(cp => {
            const uss = users.filter(u=>u.company===cp.id);
            const adm = uss.find(u=>u.role==='admin');
            
            // Segurança
            const sVal = cp.systemValidity||''; const sVit=cp.isVitalicio||false; const sBlk=cp.isBlocked||false;
            const statusLabel = sBlk ? '<span style="color:red;font-weight:bold">BLOQUEADO</span>' : (sVit ? '<span style="color:green;font-weight:bold">VITALÍCIO</span>' : '<span style="color:#666">ATIVO</span>');

            // HTML Limpo (Estilo Accordion)
            var div = document.createElement('div');
            div.style.cssText = "border:1px solid #ccc; background:white; margin-bottom:10px; border-radius:5px; overflow:hidden;";
            div.innerHTML = `
                <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="padding:15px; cursor:pointer; background:#f8f9fa; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1.1rem;">${cp.id.toUpperCase()}</strong>
                        <div style="font-size:0.85rem; color:#555;">Admin: ${adm?adm.email:'-'}</div>
                    </div>
                    <div style="text-align:right;">
                        ${statusLabel}<br>
                        <small>Validade: ${sVit?'∞':formatarDataParaBrasileiro(sVal)}</small>
                    </div>
                </div>
                <div style="display:none; padding:15px; border-top:1px solid #eee;">
                    <div style="margin-bottom:10px;">
                        <button class="btn-primary" onclick="abrirModalCreditos('${cp.id}','${sVal}',${sVit},${sBlk})">GERENCIAR EMPRESA</button>
                        <button class="btn-danger" onclick="excluirEmpresaTotal('${cp.id}')">EXCLUIR TUDO</button>
                    </div>
                    <table class="data-table" style="width:100%; font-size:0.9rem;">
                        <thead><tr><th>NOME</th><th>EMAIL</th><th>SENHA</th><th>AÇÃO</th></tr></thead>
                        <tbody>
                            ${uss.map(u=>`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.senhaVisual||'***'}</td><td><button class="btn-mini btn-warning" onclick="resetarSenhaComMigracao('${u.uid}','${u.email}','${u.name}')">RESET</button> <button class="btn-mini btn-danger" onclick="excluirUsuarioGlobal('${u.uid}')">DEL</button></td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            c.appendChild(div);
        });
    } catch(e) { c.innerHTML='Erro: '+e.message; }
};

document.addEventListener('submit', async function(e) {
    if (e.target.id === 'formCreateCompany') {
        e.preventDefault();
        var d = document.getElementById('newCompanyDomain').value.trim().toLowerCase();
        var em = document.getElementById('newAdminEmail').value.trim();
        var pw = document.getElementById('newAdminPassword').value.trim();
        if(d.length<3) return alert("Domínio curto.");
        
        try {
            var uid = await window.dbRef.criarAuthUsuario(em, pw);
            await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"users",uid),{
                uid:uid, name:"ADMIN "+d.toUpperCase(), email:em, role:'admin', company:d,
                createdAt:new Date().toISOString(), approved:true, isVitalicio:false, isBlocked:false, senhaVisual:pw,
                systemValidity:new Date(new Date().setDate(new Date().getDate()+30)).toISOString()
            });
        } catch(err) {
            if(err.code!=='auth/email-already-in-use') return alert(err.message);
            if(!confirm("Email existe. Criar empresa mesmo assim?")) return;
        }
        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"companies",d),{
            id:d, createdAt:new Date().toISOString(), isBlocked:false, isVitalicio:false,
            systemValidity:new Date(new Date().setDate(new Date().getDate()+30)).toISOString()
        },{merge:true});
        alert("Criado!"); e.target.reset(); carregarPainelSuperAdmin();
    }
});

// AÇÕES SUPER ADMIN
window.abrirModalCreditos=function(id, val, vit, blk) {
    document.getElementById('empresaIdCredito').value=id; document.getElementById('nomeEmpresaCredito').textContent=id.toUpperCase(); document.getElementById('validadeAtualCredito').textContent=vit?'VITALÍCIO':formatarDataParaBrasileiro(val);
    var ev=document.getElementById('checkVitalicio'); var eb=document.getElementById('checkBloqueado');
    if(ev) ev.checked=vit; if(eb) eb.checked=blk;
    document.getElementById('modalCreditos').style.display='flex';
};
window.salvarCreditosEmpresa=async function() {
    var id=document.getElementById('empresaIdCredito').value; var vit=document.getElementById('checkVitalicio').checked; var blk=document.getElementById('checkBloqueado').checked; var mes=parseInt(document.getElementById('qtdCreditosAdd').value);
    try {
        var data={isVitalicio:vit, isBlocked:blk}; var novaData=null;
        if(!vit && !blk) {
            var base=new Date();
            const q=window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"),window.dbRef.where("company","==",id),window.dbRef.where("role","==","admin"));
            const s=await window.dbRef.getDocs(q);
            if(!s.empty && s.docs[0].data().systemValidity) { var dv=new Date(s.docs[0].data().systemValidity); if(dv>base) base=dv; }
            if(mes>0) base.setDate(base.getDate()+(mes*30));
            novaData=base.toISOString(); data.systemValidity=novaData;
        }
        await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"companies",id),data,{merge:true});
        const qu=window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"),window.dbRef.where("company","==",id));
        const su=await window.dbRef.getDocs(qu); const b=window.dbRef.writeBatch(window.dbRef.db);
        su.forEach(d=>{ let up={isBlocked:blk, isVitalicio:vit}; if(novaData) up.systemValidity=novaData; b.update(d.ref,up); });
        await b.commit(); alert("Salvo!"); document.getElementById('modalCreditos').style.display='none'; carregarPainelSuperAdmin();
    } catch(e) { alert(e.message); }
};
window.excluirEmpresaTotal=async function(id) {
    if(prompt("Digite DELETAR:")!=="DELETAR") return;
    const b=window.dbRef.writeBatch(window.dbRef.db);
    const q=window.dbRef.query(window.dbRef.collection(window.dbRef.db,"users"),window.dbRef.where("company","==",id));
    const s=await window.dbRef.getDocs(q); s.forEach(d=>b.delete(d.ref));
    b.delete(window.dbRef.doc(window.dbRef.db,"companies",id));
    await b.commit(); alert("Excluído!"); carregarPainelSuperAdmin();
};
window.excluirUsuarioGlobal=async function(uid){if(confirm("Del?")){await window.dbRef.deleteDoc(window.dbRef.doc(window.dbRef.db,"users",uid));carregarPainelSuperAdmin();}};
window.resetarSenhaComMigracao=async function(uid,em,nm){var p=prompt("Nova senha:");if(p){var nuid=await window.dbRef.criarAuthUsuario(em,p);var old=await window.dbRef.getDoc(window.dbRef.doc(window.dbRef.db,"users",uid));if(old.exists()){var d=old.data();d.uid=nuid;d.senhaVisual=p;await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db,"users",nuid),d);await window.dbRef.deleteDoc(old.ref);}alert("OK");carregarPainelSuperAdmin();}};

// MEUS DADOS E INIT
window.renderizarMeusDados = function() {
    var u=window.USUARIO_ATUAL; var d=CACHE_FUNCIONARIOS.find(f=>String(f.id)===String(u.uid))||u;
    var c=document.getElementById('meusDadosContainer'); if(c) c.innerHTML=`<div style="padding:20px;text-align:center;background:white"><h3>${d.nome||d.name}</h3><p>${d.funcao||d.role}</p><hr><p>Tel: ${d.telefone||'-'}</p><p>End: ${d.endereco||'-'}</p><p>Pix: ${d.pix||'-'}</p></div>`;
};

window.initSystemByRole = async function(user) {
    console.log("INIT:", user.role); window.USUARIO_ATUAL = user;
    document.querySelectorAll('.page').forEach(p=>{p.style.display='none';p.classList.remove('active');});
    document.querySelectorAll('.sidebar ul').forEach(ul=>ul.style.display='none');

    if(EMAILS_MESTRES.includes(user.email) || user.role === 'admin_master') {
        document.getElementById('menu-super-admin').style.display='block';
        var p=document.getElementById('super-admin'); p.style.display='block'; setTimeout(()=>p.classList.add('active'),50);
        carregarPainelSuperAdmin(); return;
    }

    await sincronizarDadosComFirebase(); preencherTodosSelects();

    if(user.role === 'admin') {
        if(user.isBlocked) return document.body.innerHTML="<h1 style='text-align:center;color:red;margin-top:50px'>BLOQUEADO</h1>";
        document.getElementById('menu-admin').style.display='block';
        var h=document.getElementById('home'); if(h){h.style.display='block';setTimeout(()=>h.classList.add('active'),50);}
        atualizarDashboard(); renderizarCalendario();
    } else {
        document.getElementById('menu-employee').style.display='block';
        window.MODO_APENAS_LEITURA = true;
        var eh=document.getElementById('employee-home'); if(eh){eh.style.display='block';setTimeout(()=>eh.classList.add('active'),50);}
        renderizarCheckinFuncionario(); renderizarMeusDados();
    }
};

// NAVEGAÇÃO
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
        this.classList.add('active');
        var t = document.getElementById(this.getAttribute('data-page'));
        if(t) { t.style.display='block'; setTimeout(()=>t.classList.add('active'), 10); }
        if(window.innerWidth<=768) document.getElementById('sidebar').classList.remove('active');
        var pg = this.getAttribute('data-page');
        if(pg==='home') atualizarDashboard(); if(pg==='meus-dados') renderizarMeusDados(); if(pg==='employee-checkin') renderizarCheckinFuncionario();
    });
});
document.getElementById('mobileMenuBtn')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('active'));
document.getElementById('sidebarOverlay')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.remove('active'));
window.exportDataBackup = function() { var d={meta:{date:new Date(),u:window.USUARIO_ATUAL.email},data:{funcionarios:CACHE_FUNCIONARIOS,veiculos:CACHE_VEICULOS,operacoes:CACHE_OPERACOES,despesas:CACHE_DESPESAS}}; var a=document.createElement('a'); a.href="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(d)); a.download="backup.json"; a.click(); };
window.importDataBackup = function(e) { var r=new FileReader(); r.onload=function(ev){ if(confirm("Restaurar?")){ var j=JSON.parse(ev.target.result); if(j.data){ localStorage.setItem(CHAVE_DB_FUNCIONARIOS,JSON.stringify(j.data.funcionarios)); localStorage.setItem(CHAVE_DB_VEICULOS,JSON.stringify(j.data.veiculos)); localStorage.setItem(CHAVE_DB_OPERACOES,JSON.stringify(j.data.operacoes)); localStorage.setItem(CHAVE_DB_DESPESAS,JSON.stringify(j.data.despesas)); alert("OK! Recarregando..."); window.location.reload(); }}}; r.readAsText(e.target.files[0]); };
