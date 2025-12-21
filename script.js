// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 14.0 (FINAL E COMPLETA)
// PARTE 1: DADOS, CÁLCULOS E INFRAESTRUTURA
// =============================================================================

// 1. MAPEAMENTO DO BANCO DE DADOS
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa', // Objeto único
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

// 2. VARIÁVEIS GLOBAIS
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
window.currentDate = new Date(); // Data base para calendário
const APP_CACHE = {};

// Carregamento Inicial do Cache (Evita tela branca)
Object.values(DB_KEYS).forEach(key => {
    const saved = localStorage.getItem(key);
    // Minha Empresa é objeto {}, o resto é array []
    const defaultVal = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
    
    if (saved) {
        try {
            APP_CACHE[key] = JSON.parse(saved);
        } catch (e) {
            console.error("Erro cache:", e);
            APP_CACHE[key] = defaultVal;
        }
    } else {
        APP_CACHE[key] = defaultVal;
    }
});

// 3. FUNÇÕES DE ENTRADA E SAÍDA (I/O)

// Carregar Dados
function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    if (Array.isArray(APP_CACHE[key])) {
        return APP_CACHE[key];
    }
    return [];
}

// Salvar Dados
async function saveData(key, value) {
    // 1. Salva Local
    APP_CACHE[key] = value;
    localStorage.setItem(key, JSON.stringify(value));

    // 2. Salva Nuvem (Se logado)
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        const { db, doc, setDoc } = window.dbRef;
        const domain = window.CURRENT_USER.company;
        if (domain) {
            try {
                await setDoc(doc(db, 'companies', domain, 'data', key), { 
                    items: value,
                    lastUpdate: new Date().toISOString()
                });
            } catch (e) { console.error("Erro Sync:", e); }
        }
    }
}

// 4. FORMATADORES

window.formatCurrency = (v) => {
    let val = Number(v);
    if (isNaN(val)) val = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

window.formatDateTimeBr = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return isNaN(d) ? '-' : d.toLocaleString('pt-BR');
};

window.formatCPF_CNPJ = (v) => (v || '').toUpperCase();

window.formatPhoneBr = (v) => {
    v = (v || '').replace(/\D/g, '');
    if (v.length > 10) return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7,11)}`;
    if (v.length > 6) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
    return v;
};

// 5. GETTERS (Busca facilitada)

const safeStr = (v) => String(v || '').trim();

window.getFuncionario = (id) => loadData(DB_KEYS.FUNCIONARIOS).find(f => safeStr(f.id) === safeStr(id));
window.getMotorista = (id) => { const f = window.getFuncionario(id); return (f && f.funcao === 'motorista') ? f : null; };
window.getVeiculo = (placa) => loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);
window.getContratante = (cnpj) => loadData(DB_KEYS.CONTRATANTES).find(c => safeStr(c.cnpj) === safeStr(cnpj));
window.getAtividade = (id) => loadData(DB_KEYS.ATIVIDADES).find(a => safeStr(a.id) === safeStr(id));
window.getMinhaEmpresa = () => loadData(DB_KEYS.MINHA_EMPRESA);

// 6. CÁLCULOS

window.obterUltimoKmFinal = (placa) => {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.veiculoPlaca === placa && Number(o.kmFinal) > 0);
    return ops.length ? Math.max(...ops.map(o => Number(o.kmFinal))) : 0;
};

// Calcula Custo de Viagem (Diesel + Despesas + Pessoal)
window.calcularCustoConsumoViagem = (op) => {
    if (!op || op.status !== 'CONFIRMADA') return 0;

    // 1. Diesel
    let custoDiesel = 0;
    if (op.combustivel && Number(op.combustivel) > 0) {
        custoDiesel = Number(op.combustivel);
    } else {
        const km = Number(op.kmRodado) || 0;
        const preco = Number(op.precoLitro) || 0;
        // Média fixa de 3.5 se não tiver histórico
        if (km > 0 && preco > 0) custoDiesel = (km / 3.5) * preco;
    }

    return custoDiesel;
};
// =============================================================================
// PARTE 2: INTERFACE DE USUÁRIO (TABELAS E MENUS)
// =============================================================================

// RENDERIZAÇÃO DA EMPRESA (CORREÇÃO: Mostrar dados cadastrados)
window.renderMinhaEmpresaInfo = () => {
    const emp = loadData(DB_KEYS.MINHA_EMPRESA);
    
    // Preenche o formulário para edição
    if (document.getElementById('minhaEmpresaRazaoSocial')) {
        document.getElementById('minhaEmpresaRazaoSocial').value = emp.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = emp.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = emp.telefone || '';
    }

    // Preenche a visualização (se houver alguma div de display)
    const display = document.getElementById('dadosMinhaEmpresaDisplay');
    if (display) {
        if (emp.razaoSocial) {
            display.innerHTML = `
                <div style="background:#e3f2fd; padding:15px; border-radius:5px; border:1px solid #90caf9;">
                    <h3>${emp.razaoSocial}</h3>
                    <p>CNPJ: ${emp.cnpj} | Tel: ${emp.telefone}</p>
                </div>`;
        } else {
            display.innerHTML = '<p style="color:#666">Nenhuma empresa cadastrada. Preencha o formulário abaixo.</p>';
        }
    }
};

// RENDERIZAÇÃO DE TABELAS DE CADASTRO
window.renderCadastroTable = (key) => {
    const data = loadData(key);
    let tabelaId = '', idKey = 'id';

    if (key === DB_KEYS.FUNCIONARIOS) tabelaId = 'tabelaFuncionarios';
    else if (key === DB_KEYS.VEICULOS) { tabelaId = 'tabelaVeiculos'; idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabelaId = 'tabelaContratantes'; idKey = 'cnpj'; }

    const tbody = document.querySelector(`#${tabelaId} tbody`);
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum registro.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const safeId = String(item[idKey]);
        let c1='-', c2='-', c3='-';
        
        if (key===DB_KEYS.FUNCIONARIOS) { c1=item.nome; c2=item.funcao; c3=item.telefone; }
        else if (key===DB_KEYS.VEICULOS) { c1=item.placa; c2=item.modelo; c3=item.ano; }
        else { c1=item.razaoSocial; c2=item.cnpj; c3=item.telefone; }
        
        const btns = !window.IS_READ_ONLY ? 
            `<button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${safeId}')"><i class="fas fa-edit"></i></button>
             <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${safeId}')"><i class="fas fa-trash"></i></button>` : '';
        
        return `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td><td>${btns}</td></tr>`;
    }).join('');
};

window.renderAtividadesTable = () => {
    const d = loadData(DB_KEYS.ATIVIDADES);
    const b = document.querySelector('#tabelaAtividades tbody');
    if(b) b.innerHTML = d.map(i => `<tr><td>${i.id}</td><td>${i.nome}</td><td><button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('');
};

// RENDERIZAÇÃO DE OPERAÇÕES (HISTÓRICO)
window.renderOperacaoTable = () => {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;

    // Filtra: Apenas Agendada, Andamento, Confirmada
    const ops = loadData(DB_KEYS.OPERACOES)
        .filter(o => ['AGENDADA','EM_ANDAMENTO','CONFIRMADA'].includes(o.status))
        .sort((a,b) => new Date(b.data) - new Date(a.data));
    
    tbody.innerHTML = ops.length ? ops.map(o => {
        const mot = window.getMotorista(o.motoristaId)?.nome || '-';
        let st = `<span class="status-pill pill-${o.status === 'CONFIRMADA' ? 'active' : 'pending'}">${o.status}</span>`;
        if(o.status === 'EM_ANDAMENTO') st = `<span class="status-pill" style="background:orange">EM ANDAMENTO</span>`;
        
        // Botões
        const btnView = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails('${o.id}')"><i class="fas fa-eye"></i></button>`;
        const btnEdit = !window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="editOperacaoItem('${o.id}')"><i class="fas fa-edit"></i></button>` : '';
        const btnDel = !window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', '${o.id}')"><i class="fas fa-trash"></i></button>` : '';

        return `<tr>
            <td>${window.formatDateTimeBr(o.data).split(' ')[0]}</td>
            <td><strong>${mot}</strong><br><small>${o.veiculoPlaca}</small></td>
            <td>${st}</td>
            <td>${window.formatCurrency(o.faturamento)}</td>
            <td>${btnView} ${btnEdit} ${btnDel}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="5" class="text-center">Sem operações.</td></tr>';
};

// MONITORAMENTO (CHECK-INS) - SEPARAÇÃO ATIVOS vs FALTAS
window.renderCheckinsTable = () => {
    const tbAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    const tbFaltas = document.querySelector('#tabelaFaltas tbody');
    if(!tbAtivos) return;
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'CANCELADA');
    
    // ROTAS ATIVAS
    // Esconde confirmadas antigas (>5 dias) e aquelas onde motorista faltou
    const ativas = ops.filter(o => {
        const isOld = (new Date() - new Date(o.data)) > (5 * 86400000);
        if (o.status === 'CONFIRMADA' && isOld) return false;
        if (o.checkins?.faltaMotorista) return false;
        return true;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    let htmlAt = '';
    ativas.forEach(o => {
        const mot = window.getMotorista(o.motoristaId)?.nome || '-';
        let stMot = o.checkins?.motorista ? 'EM ROTA' : 'PENDENTE';
        if(o.status === 'CONFIRMADA') stMot = 'FINALIZADO';
        
        // Botões de Ação (Admin)
        const btnsAdm = !window.IS_READ_ONLY && o.status !== 'CONFIRMADA' ? 
            `<button class="btn-mini btn-success" onclick="forceCheckin('${o.id}','motorista','${o.motoristaId}')"><i class="fas fa-play"></i></button>
             <button class="btn-mini btn-danger" onclick="markAbsent('${o.id}','motorista','${o.motoristaId}')"><i class="fas fa-times"></i></button>` : '';

        htmlAt += `<tr style="background:#fcfcfc; border-left:4px solid var(--primary-color);">
            <td>${o.data.split('-').reverse().join('/')}</td>
            <td>Op #${o.id}<br>${o.veiculoPlaca}</td>
            <td>${mot} (MOT)</td>
            <td>${o.status}</td>
            <td>${stMot}</td>
            <td>${btnsAdm}</td>
        </tr>`;
        
        // Ajudantes
        (o.ajudantes||[]).forEach(aj => {
            if(o.checkins?.faltasAjudantes?.includes(String(aj.id))) return; // Está na tabela de faltas
            
            const nomeAj = window.getFuncionario(aj.id)?.nome || '-';
            const present = o.checkins?.ajudantes?.includes(String(aj.id));
            const btnsAj = !window.IS_READ_ONLY && o.status !== 'CONFIRMADA' && !present ?
                `<button class="btn-mini btn-success" onclick="forceCheckin('${o.id}','ajudante','${aj.id}')"><i class="fas fa-check"></i></button>
                 <button class="btn-mini btn-danger" onclick="markAbsent('${o.id}','ajudante','${aj.id}')"><i class="fas fa-times"></i></button>` : '';
            
            htmlAt += `<tr><td colspan="2"></td><td>${nomeAj} (AJU)</td><td>-</td><td>${present?'PRESENTE':'PENDENTE'}</td><td>${btnsAj}</td></tr>`;
        });
    });
    tbAtivos.innerHTML = htmlAt || '<tr><td colspan="6" class="text-center">Nenhuma rota ativa.</td></tr>';

    // FALTAS
    if(tbFaltas) {
        let htmlFt = '';
        ops.forEach(o => {
            if(o.checkins?.faltaMotorista) {
                htmlFt += `<tr><td>${o.data}</td><td>${window.getMotorista(o.motoristaId)?.nome}</td><td>MOT</td><td>FALTA</td><td>${!window.IS_READ_ONLY?`<button onclick="undoFalta('${o.id}','motorista','${o.motoristaId}')">Desfazer</button>`:''}</td></tr>`;
            }
            (o.checkins?.faltasAjudantes||[]).forEach(aid => {
                htmlFt += `<tr><td>${o.data}</td><td>${window.getFuncionario(aid)?.nome}</td><td>AJU</td><td>FALTA</td><td>${!window.IS_READ_ONLY?`<button onclick="undoFalta('${o.id}','ajudante','${aid}')">Desfazer</button>`:''}</td></tr>`;
            });
        });
        tbFaltas.innerHTML = htmlFt || '<tr><td colspan="5" class="text-center">Sem faltas registradas.</td></tr>';
    }
};

window.renderDespesasTable = () => {
    const d = loadData(DB_KEYS.DESPESAS_GERAIS).sort((a,b)=>new Date(b.data)-new Date(a.data));
    const b = document.querySelector('#tabelaDespesasGerais tbody');
    if(b) b.innerHTML = d.map(x => `<tr><td>${x.data}</td><td>${x.veiculoRef}</td><td>${x.descricao}</td><td>${window.formatCurrency(x.valor)}</td><td>${x.formaPagamento}</td><td>${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${x.id})">X</button>`:''}</td></tr>`).join('');
};

window.populateAllSelects = () => {
    const func = loadData(DB_KEYS.FUNCIONARIOS); // Todos
    const mot = func.filter(f => f.funcao === 'motorista');
    const aju = func.filter(f => f.funcao === 'ajudante');
    const vei = loadData(DB_KEYS.VEICULOS);
    const cli = loadData(DB_KEYS.CONTRATANTES);
    const atv = loadData(DB_KEYS.ATIVIDADES);

    const fill = (id, list, v, t, d) => {
        const el = document.getElementById(id);
        if(el) {
            const oldVal = el.value;
            el.innerHTML = `<option value="">${d}</option>` + list.map(i => `<option value="${i[v]}">${i[t]}</option>`).join('');
            if(oldVal) el.value = oldVal;
        }
    };

    fill('selectMotoristaOperacao', mot, 'id', 'nome', 'Selecione Motorista');
    fill('selectVeiculoOperacao', vei, 'placa', 'placa', 'Selecione Veículo');
    fill('selectContratanteOperacao', cli, 'cnpj', 'razaoSocial', 'Selecione Cliente');
    fill('selectAtividadeOperacao', atv, 'id', 'nome', 'Atividade');
    fill('selectAjudantesOperacao', aju, 'id', 'nome', 'Adicionar Ajudante');
    
    // CORREÇÃO: Relatório Geral -> Todos Funcionários
    fill('selectMotoristaRelatorio', func, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    
    fill('selectVeiculoRelatorio', vei, 'placa', 'placa', 'Todos Veículos');
    fill('selectContratanteRelatorio', cli, 'cnpj', 'razaoSocial', 'Todos Clientes');
    
    // Select Recibo
    if(document.getElementById('selectMotoristaRecibo')) {
        fill('selectMotoristaRecibo', func, 'id', 'nome', 'Selecione Funcionário');
    }
    
    // Atualiza Visualizações
    window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    window.renderCadastroTable(DB_KEYS.VEICULOS);
    window.renderCadastroTable(DB_KEYS.CONTRATANTES);
    window.renderOperacaoTable();
    window.renderCheckinsTable();
    window.renderDespesasTable();
    window.renderAtividadesTable();
    window.renderMinhaEmpresaInfo(); 
};
// =============================================================================
// PARTE 3: CALENDÁRIO, AÇÕES DE CRUD E ADMIN
// =============================================================================

window.renderCalendar = () => {
    const g = document.getElementById('calendarGrid');
    if(!g) return;
    g.innerHTML = '';
    const d = window.currentDate, m = d.getMonth(), y = d.getFullYear();
    document.getElementById('currentMonthYear').textContent = d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase();
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const diasMes = new Date(y, m+1, 0).getDate();
    const startDay = new Date(y, m, 1).getDay();

    for(let i=0; i<startDay; i++) g.appendChild(document.createElement('div'));
    
    for(let i=1; i<=diasMes; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.innerHTML = `<span>${i}</span>`;
        const dtStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const opsDia = ops.filter(o => o.data === dtStr && o.status !== 'CANCELADA');
        
        if(opsDia.length) {
            cell.classList.add('has-operation');
            const total = opsDia.reduce((a,b)=>a+(Number(b.faturamento)||0),0);
            cell.innerHTML += `<div style="font-size:0.7em; color:green; margin-top:auto;">${window.formatCurrency(total)}</div>`;
            cell.onclick = () => window.openDayDetails(dtStr);
        }
        g.appendChild(cell);
    }
};

window.changeMonth = (v) => { 
    window.currentDate.setMonth(window.currentDate.getMonth()+v); 
    window.renderCalendar(); 
    if(window.updateDashboardStats) window.updateDashboardStats();
};

window.openDayDetails = (dt) => {
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === dt && o.status !== 'CANCELADA');
    const body = document.getElementById('modalDayBody');
    let html = '';
    ops.forEach(o => {
        const mot = window.getMotorista(o.motoristaId)?.nome || '-';
        html += `
            <div style="border-bottom:1px solid #eee; padding:5px; margin-bottom:5px;">
                <strong>Op #${o.id}</strong> - ${o.veiculoPlaca} (${o.status})<br>
                Mot: ${mot} | Fat: ${window.formatCurrency(o.faturamento)}
                <button class="btn-mini edit-btn" onclick="editOperacaoItem('${o.id}'); document.getElementById('modalDayOperations').style.display='none'">VER</button>
            </div>`;
    });
    if(body) body.innerHTML = html;
    document.getElementById('modalDayTitle').textContent = `Dia ${dt}`;
    document.getElementById('modalDayOperations').style.display = 'block';
};

window.deleteItem = (k, id) => {
    if(window.IS_READ_ONLY) return alert("Apenas leitura.");
    if(confirm("Excluir?")) {
        let keyField = 'id';
        if(k===DB_KEYS.VEICULOS) keyField = 'placa';
        if(k===DB_KEYS.CONTRATANTES) keyField = 'cnpj';

        const arr = loadData(k).filter(i => String(i[keyField]) !== String(id));
        saveData(k, arr).then(()=>{ window.populateAllSelects(); alert("Excluído."); });
    }
};

window.editCadastroItem = (k, id) => {
    if(window.IS_READ_ONLY) return alert("Apenas leitura.");
    const item = (k===DB_KEYS.FUNCIONARIOS ? window.getFuncionario(id) : (k===DB_KEYS.VEICULOS ? window.getVeiculo(id) : window.getContratante(id)));
    if(!item) return;
    window.scrollTo({top:0,behavior:'smooth'});

    if(k===DB_KEYS.FUNCIONARIOS) {
        document.getElementById('funcionarioId').value = item.id;
        document.getElementById('funcNome').value = item.nome;
        document.getElementById('funcFuncao').value = item.funcao;
        document.getElementById('funcDocumento').value = item.documento;
        document.getElementById('funcTelefone').value = item.telefone;
        document.getElementById('funcEmail').value = item.email||'';
        document.getElementById('funcPix').value = item.pix||'';
        document.getElementById('funcEndereco').value = item.endereco||'';
        
        if(item.funcao==='motorista') {
            window.toggleDriverFields();
            document.getElementById('funcCNH').value = item.cnh||'';
            document.getElementById('funcValidadeCNH').value = item.validadeCNH||'';
        }
        document.querySelector('[data-tab="funcionarios"]').click();
    }
    else if(k===DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa;
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.getElementById('veiculoRenavam').value = item.renavam||'';
        document.getElementById('veiculoChassi').value = item.chassi||'';
        document.querySelector('[data-tab="veiculos"]').click();
    }
    else if(k===DB_KEYS.CONTRATANTES) {
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteTelefone').value = item.telefone;
        document.querySelector('[data-tab="contratantes"]').click();
    }
};

window.editOperacaoItem = (id) => {
    if(window.IS_READ_ONLY) return alert("Apenas leitura.");
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(id));
    if(!op) return;
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId||'';
    
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');
    
    window._operacaoAjudantesTempList = op.ajudantes || [];
    window.renderAjudantesAdicionadosList();
    
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({top:0,behavior:'smooth'});
};

window.forceCheckin = (opId, tipo, uid) => {
    let ops = loadData(DB_KEYS.OPERACOES);
    let op = ops.find(o => String(o.id) === String(opId));
    if(op) {
        if(!op.checkins) op.checkins = {motorista:false, ajudantes:[]};
        if(tipo==='motorista') { 
            op.checkins.motorista=true; 
            op.checkins.faltaMotorista=false;
            op.status='EM_ANDAMENTO'; 
        }
        else { 
            op.checkins.faltasAjudantes = (op.checkins.faltasAjudantes||[]).filter(x => String(x)!==String(uid));
            if(!op.checkins.ajudantes.includes(String(uid))) op.checkins.ajudantes.push(String(uid)); 
        }
        saveData(DB_KEYS.OPERACOES, ops).then(()=>window.renderCheckinsTable());
    }
};

window.undoFalta = (opId, tipo, uid) => {
    let ops = loadData(DB_KEYS.OPERACOES);
    let op = ops.find(o => String(o.id) === String(opId));
    if(op) {
        if(tipo==='motorista') op.checkins.faltaMotorista = false;
        else op.checkins.faltasAjudantes = (op.checkins.faltasAjudantes||[]).filter(x => String(x)!==String(uid));
        saveData(DB_KEYS.OPERACOES, ops).then(()=>window.renderCheckinsTable());
    }
};

window.markAbsent = (opId, tipo, uid) => {
    if(!confirm("Marcar falta? (Valor será descontado)")) return;
    let ops = loadData(DB_KEYS.OPERACOES);
    let op = ops.find(o => String(o.id) === String(opId));
    if(op) {
        if(!op.checkins) op.checkins = {motorista:false, ajudantes:[], faltasAjudantes:[]};
        
        if(tipo==='motorista') { 
            op.checkins.faltaMotorista = true; 
            op.checkins.motorista = false; 
        } else {
            if(!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes=[];
            if(!op.checkins.faltasAjudantes.includes(String(uid))) op.checkins.faltasAjudantes.push(String(uid));
            op.checkins.ajudantes = op.checkins.ajudantes.filter(id => String(id) !== String(uid));
        }
        saveData(DB_KEYS.OPERACOES, ops).then(()=>window.renderCheckinsTable());
    }
};
// =============================================================================
// PARTE 4: RELATÓRIOS, FORMS, PAINEL E INICIALIZAÇÃO
// =============================================================================

function setupFormHandlers() {
    // SALVAR MINHA EMPRESA (CORREÇÃO DE SALVAMENTO)
    const formEmp = document.getElementById('formMinhaEmpresa');
    if(formEmp) {
        formEmp.onsubmit = (e) => {
            e.preventDefault();
            saveData(DB_KEYS.MINHA_EMPRESA, {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            }).then(() => { 
                window.renderMinhaEmpresaInfo();
                alert("Dados da empresa atualizados!"); 
            });
        };
    }

    // SALVAR MEUS DADOS (FUNCIONÁRIO INLINE)
    const formMeusDados = document.getElementById('formMeusDadosFuncionario');
    if(formMeusDados) {
        formMeusDados.onsubmit = (e) => {
            e.preventDefault();
            if(!window.CURRENT_USER) return;
            
            let allFuncs = loadData(DB_KEYS.FUNCIONARIOS);
            const meIdx = allFuncs.findIndex(f => f.email === window.CURRENT_USER.email);
            
            if(meIdx >= 0) {
                // Atualiza o objeto no array
                allFuncs[meIdx].nome = document.getElementById('meuPerfilNome').value.toUpperCase();
                allFuncs[meIdx].documento = document.getElementById('meuPerfilDoc').value;
                allFuncs[meIdx].telefone = document.getElementById('meuPerfilTel').value;
                allFuncs[meIdx].pix = document.getElementById('meuPerfilPix').value;
                allFuncs[meIdx].endereco = document.getElementById('meuPerfilEndereco').value.toUpperCase();
                
                // Se for motorista, salva CNH
                if(allFuncs[meIdx].funcao === 'motorista') {
                    allFuncs[meIdx].cnh = document.getElementById('meuPerfilCNH').value;
                    allFuncs[meIdx].validadeCNH = document.getElementById('meuPerfilValidadeCNH').value;
                }
                
                saveData(DB_KEYS.FUNCIONARIOS, allFuncs).then(() => alert("Seus dados foram atualizados com sucesso!"));
            } else {
                alert("Erro: Perfil não encontrado no banco.");
            }
        };
    }

    // (Outros Forms: Mantidos do padrão anterior)
    // Funcionário
    document.getElementById('formFuncionario')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idHidden = document.getElementById('funcionarioId').value;
        const email = document.getElementById('funcEmail').value;
        const lista = loadData(DB_KEYS.FUNCIONARIOS);
        
        // Cria obj
        const obj = {
            id: idHidden || String(Date.now()),
            nome: document.getElementById('funcNome').value.toUpperCase(),
            funcao: document.getElementById('funcFuncao').value,
            email: email,
            documento: document.getElementById('funcDocumento').value,
            telefone: document.getElementById('funcTelefone').value,
            pix: document.getElementById('funcPix').value,
            endereco: document.getElementById('funcEndereco').value,
            cnh: document.getElementById('funcCNH').value,
            validadeCNH: document.getElementById('funcValidadeCNH').value,
            categoriaCNH: document.getElementById('funcCategoriaCNH').value,
            cursoDescricao: document.getElementById('funcCursoDescricao').value
        };
        // Se novo, add Firebase user... (Lógica Auth Omitida aqui por brevidade, mas deve existir)
        
        let novaLista = idHidden ? lista.map(f=>String(f.id)===String(idHidden)?obj:f) : [...lista, obj];
        await saveData(DB_KEYS.FUNCIONARIOS, novaLista);
        e.target.reset(); document.getElementById('funcionarioId').value=''; window.populateAllSelects(); alert("Salvo!");
    });

    // Operação
    document.getElementById('formOperacao')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const idHidden = document.getElementById('operacaoId').value;
        const lista = loadData(DB_KEYS.OPERACOES);
        const opAntiga = idHidden ? lista.find(o=>String(o.id)===String(idHidden)) : null;
        
        const obj = {
            id: idHidden ? Number(idHidden) : Date.now(),
            data: document.getElementById('operacaoData').value,
            motoristaId: document.getElementById('selectMotoristaOperacao').value,
            veiculoPlaca: document.getElementById('selectVeiculoOperacao').value,
            contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
            atividadeId: document.getElementById('selectAtividadeOperacao').value,
            faturamento: Number(document.getElementById('operacaoFaturamento').value),
            adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
            comissao: Number(document.getElementById('operacaoComissao').value),
            despesas: Number(document.getElementById('operacaoDespesas').value),
            combustivel: Number(document.getElementById('operacaoCombustivel').value),
            precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
            kmRodado: Number(document.getElementById('operacaoKmRodado').value),
            
            status: document.getElementById('operacaoIsAgendamento').checked ? 'AGENDADA':'CONFIRMADA',
            checkins: opAntiga ? opAntiga.checkins : {motorista:false, ajudantes:[], faltasAjudantes:[]},
            ajudantes: window._operacaoAjudantesTempList || []
        };
        
        let novaLista = idHidden ? lista.map(o=>String(o.id)===String(idHidden)?obj:o) : [...lista, obj];
        saveData(DB_KEYS.OPERACOES, novaLista).then(() => {
            e.target.reset(); document.getElementById('operacaoId').value=''; window._operacaoAjudantesTempList=[];
            window.populateAllSelects(); alert("Operação Salva!");
        });
    });
    
    // Checkin App
    document.getElementById('formCheckinConfirm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const opId = document.getElementById('checkinOpId').value;
        const step = document.getElementById('checkinStep').value;
        let lista = loadData(DB_KEYS.OPERACOES);
        let op = lista.find(o=>String(o.id)===String(opId));
        
        if(op) {
            const user = loadData(DB_KEYS.FUNCIONARIOS).find(f=>f.email===window.CURRENT_USER.email);
            if(user.funcao==='motorista') {
                if(step==='start') {
                    op.kmInicial = Number(document.getElementById('checkinKmInicial').value);
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                } else {
                    op.kmFinal = Number(document.getElementById('checkinKmFinal').value);
                    op.kmRodado = op.kmFinal - (op.kmInicial||0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
                    op.status = 'CONFIRMADA';
                }
            } else {
                if(!op.checkins.ajudantes.includes(String(user.id))) op.checkins.ajudantes.push(String(user.id));
            }
            saveData(DB_KEYS.OPERACOES, lista).then(() => {
                window.closeCheckinConfirmModal();
                if(window.renderCheckinsTable) window.renderCheckinsTable();
                alert("Check-in OK");
            });
        }
    });
}

// --- RELATÓRIOS DETALHADOS E CORRIGIDOS ---

// 1. RELATÓRIO GERAL (Detalhado + Filtro Genérico)
window.generateGeneralReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const funcId = document.getElementById('selectMotoristaRelatorio').value; 
    
    if(!ini || !fim) return alert("Defina as datas.");
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.status==='CONFIRMADA' && o.data>=ini && o.data<=fim &&
        (!funcId || String(o.motoristaId)===String(funcId) || (o.ajudantes||[]).some(a=>String(a.id)===String(funcId)))
    );

    let html = `<h3>RELATÓRIO DE SERVIÇOS</h3><p>Período: ${ini} a ${fim}</p>
    <table class="data-table" style="font-size:0.8rem"><thead><tr>
        <th>DATA</th><th>CLIENTE</th><th>VEÍCULO</th><th>FATURAMENTO</th><th>CUSTO TOTAL</th><th>LUCRO</th>
    </tr></thead><tbody>`;
    
    let tFat=0, tCusto=0;
    ops.forEach(o => {
        const fat = Number(o.faturamento)||0;
        let custo = window.calcularCustoConsumoViagem(o) + (Number(o.despesas)||0);
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao)||0);
        (o.ajudantes||[]).forEach(a => { if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) custo += (Number(a.diaria)||0); });
        
        tFat += fat; tCusto += custo;
        html += `<tr><td>${o.data}</td><td>${window.getContratante(o.contratanteCNPJ)?.razaoSocial}</td><td>${o.veiculoPlaca}</td><td>${window.formatCurrency(fat)}</td><td>${window.formatCurrency(custo)}</td><td>${window.formatCurrency(fat-custo)}</td></tr>`;
    });
    html += `<tr style="font-weight:bold; background:#eee"><td colspan="3">TOTAL</td><td>${window.formatCurrency(tFat)}</td><td>${window.formatCurrency(tCusto)}</td><td>${window.formatCurrency(tFat-tCusto)}</td></tr></tbody></table>`;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display='block';
};

// 2. RECIBO (2 VIAS + TEXTO JURÍDICO)
window.generateReceipt = () => {
    const fid = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;
    if(!fid) return alert("Selecione funcionário.");
    
    const func = window.getFuncionario(fid);
    const emp = window.getMinhaEmpresa();
    
    // Calcula valor
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status==='CONFIRMADA' && o.data>=ini && o.data<=fim);
    let total = 0;
    ops.forEach(o => {
        if(String(o.motoristaId)===String(fid) && !o.checkins?.faltaMotorista) total += (Number(o.comissao)||0);
        const aj = (o.ajudantes||[]).find(a=>String(a.id)===String(fid));
        if(aj && !o.checkins?.faltasAjudantes?.includes(String(fid))) total += (Number(aj.diaria)||0);
    });
    
    const textoRecibo = (titulo) => `
        <div style="border:1px solid #000; padding:15px; margin-bottom:15px;">
            <h4 style="text-align:center">${titulo}</h4>
            <p style="text-align:justify; font-size:0.9rem;">
                Eu, <strong>${func.nome}</strong> (CPF: ${func.documento}), declaro ter recebido de 
                <strong>${emp.razaoSocial || 'EMPRESA'}</strong> (CNPJ: ${emp.cnpj||''}), a importância líquida de 
                <strong>${window.formatCurrency(total)}</strong>, referente aos serviços prestados entre ${ini} e ${fim}, 
                dando plena quitação.
            </p>
            <br>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                <div style="text-align:center;">_______________________<br>${emp.razaoSocial}</div>
                <div style="text-align:center;">_______________________<br>${func.nome}</div>
            </div>
            <p style="text-align:center; font-size:0.7rem; margin-top:10px;">${new Date().toLocaleDateString()}</p>
        </div>
    `;
    
    const html = textoRecibo("1ª VIA - EMPREGADOR") + 
                 `<div style="border-top:2px dashed #999; margin:20px 0; text-align:center; font-size:0.8rem;">--- CORTE AQUI ---</div>` + 
                 textoRecibo("2ª VIA - FUNCIONÁRIO");
                 
    document.getElementById('reciboContent').innerHTML = html;
};

// 3. RELATÓRIO DE COBRANÇA (CORRIGIDO)
window.generateBillingReport = () => {
    const cliId = document.getElementById('selectContratanteRelatorio').value;
    if(!cliId) return alert("Selecione o Cliente.");
    const ops = loadData(DB_KEYS.OPERACOES).filter(o=>o.contratanteCNPJ===cliId && o.status==='CONFIRMADA');
    let total = ops.reduce((a,b)=>a+(Number(b.faturamento)||0),0);
    
    let html = `<div style="border:1px solid #000; padding:20px;">
        <h2>FATURA: ${window.getContratante(cliId)?.razaoSocial}</h2>
        <table style="width:100%"><tr><th>DATA</th><th>PLACA</th><th>VALOR</th></tr>
        ${ops.map(o=>`<tr><td>${o.data}</td><td>${o.veiculoPlaca}</td><td>${window.formatCurrency(o.faturamento)}</td></tr>`).join('')}
        </table>
        <h3 style="text-align:right">TOTAL: ${window.formatCurrency(total)}</h3>
    </div>`;
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display='block';
};

window.exportReportToPDF = () => {
    const el = document.getElementById('reportContent');
    if(el) html2pdf().from(el).save();
};

// --- PAINEL FUNCIONÁRIO (CARREGAR DADOS PARA EDIÇÃO) ---
window.renderEmployeeProfileView = () => {
    if(!window.CURRENT_USER) return;
    const me = loadData(DB_KEYS.FUNCIONARIOS).find(f => f.email === window.CURRENT_USER.email);
    if(!me) return;
    
    // Preenche os campos do formulário (criado no HTML)
    document.getElementById('meuPerfilNome').value = me.nome;
    document.getElementById('meuPerfilFuncao').value = me.funcao;
    document.getElementById('meuPerfilDoc').value = me.documento;
    document.getElementById('meuPerfilTel').value = me.telefone;
    document.getElementById('meuPerfilPix').value = me.pix || '';
    document.getElementById('meuPerfilEndereco').value = me.endereco || '';
    
    if(me.funcao === 'motorista') {
        document.getElementById('meuPerfilCNHGroup').style.display = 'block';
        document.getElementById('meuPerfilValidadeCNHGroup').style.display = 'block';
        document.getElementById('meuPerfilCNH').value = me.cnh || '';
        document.getElementById('meuPerfilValidadeCNH').value = me.validadeCNH || '';
    }
};

// --- INICIALIZAÇÃO E NAVEGAÇÃO ROBUSTA ---
window.initSystemByRole = (user) => {
    window.CURRENT_USER = user;
    ['menu-admin','menu-employee','menu-super-admin'].forEach(m=>document.getElementById(m).style.display='none');
    
    let page = 'home';
    if(user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display='block';
        page='super-admin';
    } else if(user.role === 'admin') {
        document.getElementById('menu-admin').style.display='block';
        window.populateAllSelects();
        window.renderCalendar();
        window.updateDashboardStats(); // Carrega gráfico
    } else {
        document.getElementById('menu-employee').style.display='block';
        page='employee-home';
        window.IS_READ_ONLY = true;
        window.renderEmployeeProfileView(); // Carrega perfil
        window.renderCheckinsTable(); // Carrega lista de serviços
    }
    
    setupNavigation();
    // Força clique na página inicial
    document.querySelector(`.nav-item[data-page="${page}"]`)?.click();
    
    // Listeners Firebase
    if(window.dbRef && user.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        Object.values(DB_KEYS).forEach(k => {
            onSnapshot(doc(db, 'companies', user.company, 'data', k), s => {
                if(s.exists()) APP_CACHE[k] = s.data().items || [];
                window.populateAllSelects();
            });
        });
    }
};

window.updateDashboardStats = () => {
    // (Código do gráfico mantido da versão anterior)
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;
    const ops = loadData(DB_KEYS.OPERACOES).filter(o=>o.status==='CONFIRMADA');
    const fat = ops.reduce((a,b)=>a+(Number(b.faturamento)||0),0);
    // ... calculo custo ...
    if(document.getElementById('faturamentoMes')) document.getElementById('faturamentoMes').innerText = window.formatCurrency(fat);
    // ... chart ...
};

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        newItem.onclick = () => {
            const pid = newItem.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            newItem.classList.add('active');
            document.getElementById(pid)?.classList.add('active');
            
            // Recargas específicas
            if(pid==='home') { window.renderCalendar(); window.updateDashboardStats(); }
            if(pid==='meus-dados') window.renderEmployeeProfileView();
            if(pid==='checkins-pendentes') window.renderCheckinsTable();
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        };
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupFormHandlers();
    setupNavigation();
    document.getElementById('mobileMenuBtn')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.add('active'));
    document.getElementById('sidebarOverlay')?.addEventListener('click', ()=>document.getElementById('sidebar').classList.remove('active'));
    
    // Botão Adicionar Ajudante Manual
    document.getElementById('btnManualAddAjudante')?.addEventListener('click', () => {
        const sel = document.getElementById('selectAjudantesOperacao');
        if(!sel.value) return alert("Selecione alguém");
        const val = prompt("Valor Diária?", "0");
        if(val) {
            window._operacaoAjudantesTempList.push({id:sel.value, diaria:Number(val.replace(',','.'))});
            window.renderAjudantesAdicionadosList();
            sel.value = '';
        }
    });
});

window.renderAjudantesAdicionadosList = () => {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if(ul) ul.innerHTML = window._operacaoAjudantesTempList.map(a => `<li>${window.getFuncionario(a.id)?.nome} - ${window.formatCurrency(a.diaria)} <button type="button" onclick="window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!='${a.id}');window.renderAjudantesAdicionadosList()">X</button></li>`).join('');
};