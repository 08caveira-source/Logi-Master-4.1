// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0 (CORREÇÃO FINAL - SISTEMA COMPLETO)
// PARTE 1: INFRAESTRUTURA, DADOS E CÁLCULOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE BANCO DE DADOS (CHAVES)
 */
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',
    PROFILE_REQUESTS: 'db_profile_requests'
};

/**
 * 2. CACHE GLOBAL E VARIÁVEIS DE ESTADO
 * Inicializa com o que tiver no LocalStorage para evitar "piscar" tela branca.
 */
const APP_CACHE = {};

// Carregamento inicial síncrono para UI imediata
Object.values(DB_KEYS).forEach(key => {
    const saved = localStorage.getItem(key);
    // Se for 'minha empresa' é objeto {}, senão é array []
    const defaultVal = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
    try {
        APP_CACHE[key] = saved ? JSON.parse(saved) : defaultVal;
    } catch (e) {
        APP_CACHE[key] = defaultVal;
    }
});

// Variáveis de Controle
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
window.currentDate = new Date(); // Data base para o calendário

// =============================================================================
// I/O: ENTRADA E SAÍDA DE DADOS (LOCAL E FIREBASE)
// =============================================================================

function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    // Garante sempre retorno de array para as demais chaves
    return Array.isArray(APP_CACHE[key]) ? APP_CACHE[key] : [];
}

async function saveData(key, value) {
    // 1. Persistência Local Imediata (Performance)
    APP_CACHE[key] = value;
    localStorage.setItem(key, JSON.stringify(value));

    // 2. Persistência em Nuvem (Firebase) - Assíncrono
    // Bloqueia gravação do super-admin na área da empresa para evitar conflito
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Caminho: companies/{dominio}/data/{colecao}
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { items: value });
            } catch (e) {
                console.error(`[SYNC ERROR] Falha ao salvar ${key}:`, e);
            }
        }
    }
}

// =============================================================================
// FORMATADORES (VISUALIZAÇÃO DE DADOS)
// =============================================================================

// Formata Dinheiro (R$)
window.formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Formata Data e Hora (dd/mm/aaaa hh:mm)
window.formatDateTimeBr = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
};

// Formata Telefone (Celular e Fixo)
window.formatPhoneBr = (value) => {
    const v = (value || '').replace(/\D/g, '');
    if (v.length > 10) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
    if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return v;
};

window.formatCPF_CNPJ = (v) => (v || '').toUpperCase();

// =============================================================================
// GETTERS (BUSCA RELACIONAL SIMPLIFICADA)
// =============================================================================

// Helper para garantir comparação de ID como string
const safeStr = (v) => String(v || '');

window.getFuncionario = (id) => loadData(DB_KEYS.FUNCIONARIOS).find(f => safeStr(f.id) === safeStr(id));

window.getMotorista = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'motorista') ? f : null;
};

window.getAjudante = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'ajudante') ? f : null;
};

window.getVeiculo = (placa) => loadData(DB_KEYS.VEICULOS).find(v => v.placa === placa);

window.getContratante = (cnpj) => loadData(DB_KEYS.CONTRATANTES).find(c => safeStr(c.cnpj) === safeStr(cnpj));

window.getAtividade = (id) => loadData(DB_KEYS.ATIVIDADES).find(a => safeStr(a.id) === safeStr(id));

window.getMinhaEmpresa = () => loadData(DB_KEYS.MINHA_EMPRESA);


// =============================================================================
// LÓGICA MATEMÁTICA DE FROTA
// =============================================================================

/**
 * Retorna o maior KM final registrado para um veículo, para impedir volta de odômetro.
 */
window.obterUltimoKmFinal = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && Number(op.kmFinal) > 0);
    
    if (opsVeiculo.length === 0) return 0;
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * Calcula o custo estimado de Diesel para uma viagem específica.
 * Se tiver valor real lançado, usa o real. Se não, tenta estimar pela média.
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || op.status !== 'CONFIRMADA') return 0;

    // Se o usuário lançou o valor gasto em R$, usamos ele (mais preciso)
    if (op.combustivel && Number(op.combustivel) > 0) {
        return Number(op.combustivel);
    }
    
    // Fallback: Se não lançou R$, mas tem KM rodado e preço do litro, calculamos
    const km = Number(op.kmRodado);
    if (km > 0) {
        // Tenta achar média histórica (Total KM / Total Litros)
        const opsAntigas = loadData(DB_KEYS.OPERACOES).filter(o => o.veiculoPlaca === op.veiculoPlaca && Number(o.combustivel) > 0);
        let media = 3.5; // Valor padrão conservador para caminhão leve se não tiver histórico
        
        if (opsAntigas.length > 0) {
            let sKm = 0, sLitros = 0;
            opsAntigas.forEach(x => {
                sKm += (Number(x.kmRodado)||0);
                const p = Number(x.precoLitro)||0;
                if(p>0) sLitros += (Number(x.combustivel)/p);
            });
            if (sLitros > 0) media = sKm / sLitros;
        }
        
        const preco = Number(op.precoLitro) || 0; // Se for 0, o custo sai 0
        return (km / media) * preco;
    }

    return 0;
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0
// PARTE 2: RENDERIZAÇÃO DE TABELAS E INTERFACE VISUAL
// =============================================================================

// --- 3. RENDERIZAÇÃO DE TABELAS DE CADASTRO (GENÉRICA) ---

window.renderCadastroTable = (key) => {
    const data = loadData(key);
    let tabelaId = '';
    let idKey = 'id'; // Padrão

    if (key === DB_KEYS.FUNCIONARIOS) tabelaId = 'tabelaFuncionarios';
    else if (key === DB_KEYS.VEICULOS) { tabelaId = 'tabelaVeiculos'; idKey = 'placa'; }
    else if (key === DB_KEYS.CONTRATANTES) { tabelaId = 'tabelaContratantes'; idKey = 'cnpj'; }

    const tbody = document.querySelector(`#${tabelaId} tbody`);
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        // SEGURANÇA: Converter ID para string para evitar erros no onclick
        const safeId = String(item[idKey]);
        
        let col1 = item.nome || item.modelo || item.razaoSocial || '-';
        let col2 = item.funcao || item.placa || window.formatCPF_CNPJ(item.cnpj) || '-';
        let col3 = item.email || item.ano || window.formatPhoneBr(item.telefone) || '-';

        // Botões de Ação (Só exibe se não for apenas leitura)
        // Nota: As aspas simples em '${safeId}' são cruciais para funcionar!
        const btnEdit = `<button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${safeId}')" title="Editar"><i class="fas fa-edit"></i></button>`;
        const btnDel = `<button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${safeId}')" title="Excluir"><i class="fas fa-trash"></i></button>`;
        const actions = window.IS_READ_ONLY ? '' : (btnEdit + ' ' + btnDel);

        return `<tr>
            <td>${col1}</td>
            <td>${col2}</td>
            <td>${col3}</td>
            <td style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join('');
};

window.renderAtividadesTable = () => {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tbody = document.querySelector('#tabelaAtividades tbody');
    if(!tbody) return;
    
    if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">SEM ATIVIDADES.</td></tr>`;
    else {
        tbody.innerHTML = data.map(i => `
            <tr>
                <td>${i.id}</td>
                <td>${i.nome}</td>
                <td>${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button>` : ''}</td>
            </tr>`).join('');
    }
};

// --- 4. RENDERIZAÇÃO DA TABELA DE OPERAÇÕES (HISTÓRICO RECENTE) ---

window.renderOperacaoTable = () => {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;

    // FILTRO RIGOROSO: Apenas Agendada, Em Andamento e Confirmada
    // Faltas e Canceladas não aparecem aqui (aparecem no monitoramento ou relatório)
    const ops = loadData(DB_KEYS.OPERACOES)
        .filter(o => ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'].includes(o.status))
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhuma operação ativa lançada.</td></tr>';
        return;
    }

    tbody.innerHTML = ops.map(op => {
        const mot = window.getMotorista(op.motoristaId)?.nome || '(Motorista Excluído)';
        
        let statusBadge = `<span class="status-pill pill-active">${op.status}</span>`;
        if (op.status === 'AGENDADA') statusBadge = `<span class="status-pill pill-pending">AGENDADA</span>`;
        if (op.status === 'EM_ANDAMENTO') statusBadge = `<span class="status-pill" style="background:var(--info-color)">EM ANDAMENTO</span>`;

        // Botões de ação
        const btnView = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails('${op.id}')"><i class="fas fa-eye"></i></button>`;
        const btnEdit = !window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="editOperacaoItem('${op.id}')"><i class="fas fa-edit"></i></button>` : '';
        const btnDel  = !window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', '${op.id}')"><i class="fas fa-trash"></i></button>` : '';

        return `
            <tr>
                <td>${op.data.split('-').reverse().join('/')}</td>
                <td><strong>${mot}</strong><br><small style="color:#666;">${op.veiculoPlaca}</small></td>
                <td>${statusBadge}</td>
                <td style="font-weight:bold; color:var(--success-color);">${window.formatCurrency(op.faturamento)}</td>
                <td>${btnView} ${btnEdit} ${btnDel}</td>
            </tr>
        `;
    }).join('');
};

window.viewOperacaoDetails = (id) => {
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(id));
    if (!op) return;

    const mot = window.getMotorista(op.motoristaId)?.nome || '-';
    const cli = window.getContratante(op.contratanteCNPJ)?.razaoSocial || '-';
    
    const equipeHtml = (op.ajudantes || []).map(aj => {
        const nome = window.getFuncionario(aj.id)?.nome || '???';
        let status = 'OK';
        if (op.checkins?.faltasAjudantes?.includes(String(aj.id))) status = '<span style="color:red; font-weight:bold;">FALTOU</span>';
        return `<li>${nome} (R$ ${window.formatCurrency(aj.diaria)}) - ${status}</li>`;
    }).join('') || '<li>Sem ajudantes</li>';

    const html = `
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <p><strong>STATUS:</strong> ${op.status}</p>
            <p><strong>MOTORISTA:</strong> ${mot}</p>
            <p><strong>CLIENTE:</strong> ${cli}</p>
            <p><strong>PLACA:</strong> ${op.veiculoPlaca}</p>
        </div>
        <div style="margin-bottom:15px;">
            <h4 style="border-bottom:1px solid #ddd;">EQUIPE & CUSTOS</h4>
            <ul class="simple-list">${equipeHtml}</ul>
            <p style="margin-top:10px;"><strong>COMISSÃO MOT.:</strong> ${window.formatCurrency(op.comissao)}</p>
        </div>
        <div style="background:#e0f2f1; padding:15px; border-radius:8px;">
            <p><strong>FATURAMENTO:</strong> ${window.formatCurrency(op.faturamento)}</p>
            <p><strong>DESPESAS VIAGEM:</strong> ${window.formatCurrency(op.despesas)}</p>
            <p><strong>COMBUSTÍVEL:</strong> ${window.formatCurrency(op.combustivel)} (${op.kmRodado} KM)</p>
        </div>
    `;
    window.openOperationDetails(`OPERAÇÃO #${op.id}`, html);
};

// --- 5. RENDERIZAÇÃO DO MONITORAMENTO (ROTAS ATIVAS + LISTA DE FALTAS) ---

window.renderCheckinsTable = () => {
    const tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    const tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    if (!tbodyAtivos || !tbodyFaltas) return;

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'CANCELADA');
    
    // --- PARTE A: ROTAS ATIVAS (Agendadas, Em Andamento, ou Recém Finalizadas) ---
    // Filtramos para não mostrar operações muito antigas na tela de monitoramento
    const hoje = new Date();
    hoje.setDate(hoje.getDate() - 5); // Mostra até 5 dias atrás
    const dataCorte = hoje.toISOString().split('T')[0];

    const ativas = ops.filter(o => {
        // Se for antiga E confirmada, esconde do monitoramento (já foi)
        if (o.status === 'CONFIRMADA' && o.data < dataCorte) return false;
        // Se tiver falta de motorista, não é ativa, vai pra lista de faltas
        if (o.checkins?.faltaMotorista) return false;
        return true;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    let htmlAtivos = '';
    
    ativas.forEach(op => {
        const mot = window.getMotorista(op.motoristaId)?.nome || '---';
        
        // Status Motorista
        let stMot = '<span class="status-pill pill-pending">PENDENTE</span>';
        if (op.checkins?.motorista) stMot = '<span class="status-pill pill-active">EM ROTA</span>';
        if (op.status === 'CONFIRMADA') stMot = '<span class="status-pill pill-active">FINALIZADO</span>';

        // Botões de Ação do Admin (Só aparecem se não estiver finalizado)
        let btnAcao = '';
        if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA') {
            btnAcao = `
                <button class="btn-mini btn-success" title="Forçar Início" onclick="forceCheckin('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-play"></i></button>
                <button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-user-times"></i></button>
            `;
        }

        // Linha Principal (Motorista/Operação)
        htmlAtivos += `
            <tr style="border-left:4px solid var(--primary-color); background:#fafafa;">
                <td><strong>${op.data.split('-').reverse().join('/')}</strong></td>
                <td>Op #${op.id} <br> <small>${op.veiculoPlaca}</small></td>
                <td>${mot} <small>(MOT)</small></td>
                <td>${op.status}</td>
                <td>${stMot}</td>
                <td>${btnAcao}</td>
            </tr>
        `;

        // Linhas dos Ajudantes (Vinculados a esta operação)
        (op.ajudantes || []).forEach(aj => {
            // Se ajudante faltou, não mostra aqui, vai pra lista de faltas
            if (op.checkins?.faltasAjudantes?.includes(String(aj.id))) return;

            const nomeAj = window.getFuncionario(aj.id)?.nome || '---';
            const isPresente = op.checkins?.ajudantes?.includes(String(aj.id));
            
            let stAj = isPresente ? '<span class="status-pill pill-active">PRESENTE</span>' : '<span class="status-pill pill-pending">AGUARDANDO</span>';
            if (op.status === 'CONFIRMADA') stAj = '<span class="status-pill pill-active">OK</span>';

            let btnAj = '';
            if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA' && !isPresente) {
                btnAj = `
                    <button class="btn-mini btn-success" title="Confirmar Presença" onclick="forceCheckin('${op.id}', 'ajudante', '${aj.id}')"><i class="fas fa-check"></i></button>
                    <button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent('${op.id}', 'ajudante', '${aj.id}')"><i class="fas fa-user-times"></i></button>
                `;
            }

            htmlAtivos += `
                <tr>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td>${nomeAj} <small>(AJU)</small></td>
                    <td style="color:#aaa;">-</td>
                    <td>${stAj}</td>
                    <td>${btnAj}</td>
                </tr>
            `;
        });
    });

    tbodyAtivos.innerHTML = htmlAtivos || '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma rota ativa no momento.</td></tr>';

    // --- PARTE B: LISTA DE FALTAS E OCORRÊNCIAS (FIXA) ---
    let htmlFaltas = '';
    
    // Varre todas as operações procurando faltas
    ops.forEach(op => {
        // 1. Falta de Motorista
        if (op.checkins?.faltaMotorista) {
            const m = window.getMotorista(op.motoristaId)?.nome || 'Motorista Excluído';
            htmlFaltas += `
                <tr>
                    <td>${op.data.split('-').reverse().join('/')}</td>
                    <td>${m}</td>
                    <td>MOTORISTA</td>
                    <td><span class="status-pill pill-absent">FALTA REGISTRADA</span></td>
                    <td>
                        ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="undoFalta('${op.id}', 'motorista', '${op.motoristaId}')">DESFAZER</button>` : ''}
                    </td>
                </tr>
            `;
        }
        
        // 2. Faltas de Ajudantes
        (op.checkins?.faltasAjudantes || []).forEach(ajId => {
            const a = window.getFuncionario(ajId)?.nome || 'Ajudante Excluído';
            htmlFaltas += `
                <tr>
                    <td>${op.data.split('-').reverse().join('/')}</td>
                    <td>${a}</td>
                    <td>AJUDANTE</td>
                    <td><span class="status-pill pill-absent">FALTA REGISTRADA</span></td>
                    <td>
                        ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="undoFalta('${op.id}', 'ajudante', '${ajId}')">DESFAZER</button>` : ''}
                    </td>
                </tr>
            `;
        });
    });

    tbodyFaltas.innerHTML = htmlFaltas || '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhuma falta registrada no histórico.</td></tr>';
};

// --- 6. TABELA DE DESPESAS GERAIS ---
window.renderDespesasTable = () => {
    const tbody = document.querySelector('#tabelaDespesasGerais tbody');
    if (!tbody) return;

    const dados = loadData(DB_KEYS.DESPESAS_GERAIS).slice();
    dados.sort((a,b) => new Date(b.data) - new Date(a.data));

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    tbody.innerHTML = dados.map(d => {
        const btnDel = !window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', ${d.id})"><i class="fas fa-trash"></i></button>` : '';
        return `
            <tr>
                <td>${d.data.split('-').reverse().join('/')}</td>
                <td>${d.veiculoRef || 'GERAL'}</td>
                <td>${d.descricao}</td>
                <td style="color:var(--danger-color); font-weight:bold;">${window.formatCurrency(d.valor)}</td>
                <td><span class="status-pill pill-active">PAGO (${d.formaPagamento})</span></td>
                <td>${btnDel}</td>
            </tr>
        `;
    }).join('');
};

window.renderProfileRequestsTable = () => {
    const tbody = document.querySelector('#tabelaProfileRequests tbody');
    if(!tbody) return;
    const reqs = loadData(DB_KEYS.PROFILE_REQUESTS).filter(r => r.status === 'PENDENTE');
    if(reqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação pendente.</td></tr>';
        return;
    }
    tbody.innerHTML = reqs.map(r => `
        <tr>
            <td>${window.formatDateTimeBr(r.dataSolicitacao)}</td>
            <td>${window.getFuncionario(r.funcionarioId)?.nome || '-'}</td>
            <td>${r.campo}</td>
            <td style="font-weight:bold; color:var(--primary-color);">${r.novoValor}</td>
            <td>
                <button class="btn-mini btn-success" onclick="approveProfileRequest('${r.id}')"><i class="fas fa-check"></i></button>
                <button class="btn-mini btn-danger" onclick="rejectProfileRequest('${r.id}')"><i class="fas fa-times"></i></button>
            </td>
        </tr>
    `).join('');
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0
// PARTE 3: CALENDÁRIO, CRUD E AÇÕES ADMINISTRATIVAS
// =============================================================================

// --- 6. LÓGICA DO CALENDÁRIO (CORRIGIDA) ---

window.renderCalendar = () => {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = ''; // Limpa grid anterior
    
    const date = window.currentDate;
    const month = date.getMonth();
    const year = date.getFullYear();

    // Atualiza título do mês
    document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    // Cria espaços em branco para o início do mês
    const firstDay = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        grid.appendChild(div);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);

    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.innerHTML = `<span>${i}</span>`;
        
        // Formata data YYYY-MM-DD para comparação
        const dataStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        
        // Filtra operações do dia (exclui canceladas)
        const opsDia = ops.filter(o => o.data === dataStr && o.status !== 'CANCELADA');

        if (opsDia.length > 0) {
            cell.classList.add('has-operation');
            
            // Soma faturamento do dia para exibir no quadradinho
            const total = opsDia.reduce((a, b) => a + (Number(b.faturamento)||0), 0);
            
            cell.innerHTML += `<div class="event-dot"></div>`;
            cell.innerHTML += `<div style="font-size:0.7rem; color:green; margin-top:auto; font-weight:bold;">${window.formatCurrency(total)}</div>`;
            
            // IMPORTANTE: Passa a string da data, não o objeto, para evitar erro de referência
            cell.onclick = () => window.openDayDetails(dataStr);
        }
        grid.appendChild(cell);
    }
};

window.changeMonth = (delta) => {
    window.currentDate.setMonth(window.currentDate.getMonth() + delta);
    window.renderCalendar();
    window.updateDashboardStats(); // Atualiza também os gráficos
};

// Abre o Modal com Detalhes do Dia
window.openDayDetails = (dataStr) => {
    // Busca dados atualizados
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === dataStr && o.status !== 'CANCELADA');
    
    // Cálculos Financeiros do Dia
    let fat = 0, custo = 0;
    ops.forEach(o => {
        fat += (o.faturamento || 0);
        
        // Custo = Diesel + Despesas + Equipe (apenas quem não faltou)
        let custoDiesel = window.calcularCustoConsumoViagem(o);
        let custoEquipe = 0;
        
        if(!o.checkins?.faltaMotorista) custoEquipe += (o.comissao || 0);
        
        (o.ajudantes||[]).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) {
                custoEquipe += (a.diaria || 0);
            }
        });
        
        custo += (custoDiesel + (o.despesas || 0) + custoEquipe);
    });

    const lucro = fat - custo;

    // Preenche o Modal
    const summary = document.getElementById('modalDaySummary');
    if (summary) {
        summary.innerHTML = `
            <div class="finance-box success"><strong>FATURAMENTO</strong><span>${window.formatCurrency(fat)}</span></div>
            <div class="finance-box gasto"><strong>CUSTOS TOTAIS</strong><span>${window.formatCurrency(custo)}</span></div>
            <div class="finance-box lucro"><strong>LUCRO LÍQUIDO</strong><span style="color:${lucro>=0?'green':'red'}">${window.formatCurrency(lucro)}</span></div>
        `;
    }

    const body = document.getElementById('modalDayBody');
    if (body) {
        body.innerHTML = ops.map(o => `
            <div style="background:#fff; padding:10px; border:1px solid #eee; margin-bottom:5px; border-left: 3px solid var(--primary-color);">
                <strong>Op #${o.id}</strong> - ${o.veiculoPlaca}<br>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Fat: ${window.formatCurrency(o.faturamento)}</span>
                    <button class="btn-mini btn-primary" onclick="editOperacaoItem('${o.id}'); document.getElementById('modalDayOperations').style.display='none';">VER / EDITAR</button>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('modalDayTitle').textContent = `DETALHES DO DIA ${dataStr.split('-').reverse().join('/')}`;
    document.getElementById('modalDayOperations').style.display = 'block';
};


// --- 7. AÇÕES DE EDIÇÃO E EXCLUSÃO (CRUD) ---

window.deleteItem = (key, id) => {
    if (!confirm("Tem certeza que deseja EXCLUIR este registro permanentemente?")) return;
    
    let arr = loadData(key);
    // Identifica qual campo é a chave única (id, placa ou cnpj)
    let idKey = (key === DB_KEYS.VEICULOS) ? 'placa' : (key === DB_KEYS.CONTRATANTES ? 'cnpj' : 'id');
    
    const newArr = arr.filter(i => String(i[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        window.populateAllSelects(); // Atualiza tudo
        alert("Registro excluído com sucesso.");
    });
};

window.editCadastroItem = (key, id) => {
    window.scrollTo({top:0, behavior:'smooth'});
    
    // Busca o item correto baseado na chave
    const item = (key === DB_KEYS.FUNCIONARIOS) ? window.getFuncionario(id) : 
                 (key === DB_KEYS.VEICULOS ? window.getVeiculo(id) : window.getContratante(id));
    
    if(!item) return alert("Erro ao carregar dados do item.");

    if(key === DB_KEYS.FUNCIONARIOS) {
        document.getElementById('funcionarioId').value = item.id;
        document.getElementById('funcNome').value = item.nome;
        document.getElementById('funcFuncao').value = item.funcao;
        document.getElementById('funcDocumento').value = item.documento;
        document.getElementById('funcTelefone').value = item.telefone;
        document.getElementById('funcEmail').value = item.email || '';
        
        document.querySelector('[data-tab="funcionarios"]').click();
        
        if(item.funcao === 'motorista') {
            window.toggleDriverFields(); // Mostra campos de CNH
            document.getElementById('funcCNH').value = item.cnh || '';
            document.getElementById('funcValidadeCNH').value = item.validadeCNH || '';
        }
    } else if(key === DB_KEYS.VEICULOS) {
        document.getElementById('veiculoId').value = item.placa;
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.querySelector('[data-tab="veiculos"]').click();
    } else {
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteTelefone').value = item.telefone;
        document.querySelector('[data-tab="contratantes"]').click();
    }
};

window.editOperacaoItem = (id) => {
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(id));
    if(!op) return;
    
    // Preenche formulário principal
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    
    // Financeiro
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    
    // Dados de Rodagem
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    // Restaura lista temporária de ajudantes para visualização na edição
    window._operacaoAjudantesTempList = op.ajudantes || [];
    window.renderAjudantesAdicionadosList();

    // Vai para a tela
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({top:0, behavior:'smooth'});
};


// --- 8. AÇÕES ADMINISTRATIVAS (Check-in Forçado, Faltas e Desfazer) ---

window.undoFalta = (opId, type, userId) => {
    if(!confirm("Remover esta falta e permitir que o funcionário receba/trabalhe?")) return;
    
    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    
    let op = ops[idx];

    if(type === 'motorista') {
        op.checkins.faltaMotorista = false;
        // Retorna para Agendada se não tiver checkin real, ou mantem finalizada se for o caso
        if(!op.checkins.motorista) op.status = 'AGENDADA'; 
    } else {
        // Remove ID da lista de faltas
        op.checkins.faltasAjudantes = (op.checkins.faltasAjudantes || []).filter(id => String(id) !== String(userId));
    }
    
    saveData(DB_KEYS.OPERACOES, ops).then(() => { 
        window.renderCheckinsTable(); 
        alert("Falta removida com sucesso."); 
    });
};

window.forceCheckin = (opId, type, userId) => {
    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    let op = ops[idx];
    
    if(type === 'motorista') {
        op.checkins.motorista = true;
        op.status = 'EM_ANDAMENTO';
        op.dataHoraInicio = new Date().toISOString();
        // Se não tiver KM inicial, tenta pegar o ultimo
        if(!op.kmInicial) op.kmInicial = window.obterUltimoKmFinal(op.veiculoPlaca);
    } else {
        // Adiciona se não estiver
        if(!op.checkins.ajudantes.includes(String(userId))) {
            op.checkins.ajudantes.push(String(userId));
        }
    }
    
    saveData(DB_KEYS.OPERACOES, ops).then(() => { 
        window.renderCheckinsTable(); 
        alert("Check-in forçado realizado."); 
    });
};

window.markAbsent = (opId, type, userId) => {
    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    let op = ops[idx];
    
    // Garante estrutura
    if(!op.checkins) op.checkins = {};

    if(type === 'motorista') {
        op.checkins.faltaMotorista = true;
    } else {
        if(!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes = [];
        // Evita duplicidade
        if(!op.checkins.faltasAjudantes.includes(String(userId))) {
            op.checkins.faltasAjudantes.push(String(userId));
        }
        // Remove da lista de presentes
        if(op.checkins.ajudantes) {
            op.checkins.ajudantes = op.checkins.ajudantes.filter(id => String(id) !== String(userId));
        }
    }
    
    saveData(DB_KEYS.OPERACOES, ops).then(() => { 
        window.renderCheckinsTable(); 
        alert("Falta registrada (movida para tabela de ocorrências)."); 
    });
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0
// PARTE 4: FORMULÁRIOS, RELATÓRIOS, GRÁFICOS E INICIALIZAÇÃO
// =============================================================================

// --- 9. EVENT LISTENERS DE FORMULÁRIOS (O "CÉREBRO" DE SALVAMENTO) ---

function setupFormHandlers() {

    // A. SALVAR FUNCIONÁRIO
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formFunc.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.innerText = "SALVANDO..."; btn.disabled = true;

            try {
                const idHidden = document.getElementById('funcionarioId').value;
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                let arr = loadData(DB_KEYS.FUNCIONARIOS).slice(); // Cópia segura
                
                // Validação de e-mail único
                if (!idHidden && arr.some(f => f.email === email)) throw new Error("E-mail já cadastrado.");

                let newId = idHidden ? idHidden : String(Date.now());
                let novoUid = null;

                // Integração com Firebase Auth (Se houver senha nova)
                if (window.dbRef && !idHidden && senha) {
                    if (senha.length < 6) throw new Error("Senha deve ter no mínimo 6 dígitos.");
                    const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                    const auth2 = getAuth(secondaryApp); // Usa app secundário para não deslogar o admin
                    const cred = await createUserWithEmailAndPassword(auth2, email, senha);
                    novoUid = cred.user.uid;
                    
                    // Salva metadados do usuário
                    await setDoc(doc(db, "users", novoUid), {
                        uid: novoUid, name: document.getElementById('funcNome').value.toUpperCase(), 
                        email: email, role: funcao, company: window.CURRENT_USER.company, approved: true
                    });
                    await signOut(auth2);
                }

                const obj = {
                    id: newId,
                    uid: novoUid || (idHidden ? (arr.find(f => String(f.id) === String(idHidden))?.uid || '') : ''),
                    nome: document.getElementById('funcNome').value.toUpperCase(),
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    // Campos específicos de motorista
                    cnh: document.getElementById('funcCNH').value.toUpperCase(),
                    validadeCNH: document.getElementById('funcValidadeCNH').value,
                    categoriaCNH: document.getElementById('funcCategoriaCNH').value,
                    cursoDescricao: document.getElementById('funcCursoDescricao').value.toUpperCase()
                };

                // Atualiza ou Adiciona
                const idx = arr.findIndex(f => String(f.id) === String(newId));
                if (idx >= 0) arr[idx] = obj; else arr.push(obj);

                await saveData(DB_KEYS.FUNCIONARIOS, arr);
                
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                window.populateAllSelects();
                alert("Funcionário salvo com sucesso!");

            } catch (err) {
                alert("Erro: " + err.message);
            } finally {
                btn.innerText = originalText; btn.disabled = false;
            }
        });
    }

    // B. SALVAR VEÍCULO
    const formVeic = document.getElementById('formVeiculo');
    if (formVeic) {
        formVeic.addEventListener('submit', (e) => {
            e.preventDefault();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            if (!placa) return alert("Placa obrigatória.");

            let arr = loadData(DB_KEYS.VEICULOS).slice();
            const idHidden = document.getElementById('veiculoId').value;

            // Remove anterior se a placa mudou na edição
            if (idHidden && idHidden !== placa) arr = arr.filter(v => v.placa !== idHidden);
            
            const obj = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };

            const idx = arr.findIndex(v => v.placa === placa);
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);

            saveData(DB_KEYS.VEICULOS, arr).then(() => {
                formVeic.reset(); document.getElementById('veiculoId').value = '';
                window.populateAllSelects();
                alert("Veículo salvo!");
            });
        });
    }

    // C. SALVAR CONTRATANTE
    const formCli = document.getElementById('formContratante');
    if (formCli) {
        formCli.addEventListener('submit', (e) => {
            e.preventDefault();
            const cnpj = document.getElementById('contratanteCNPJ').value.replace(/\D/g,''); // Limpa formatação
            if(!cnpj) return alert("CNPJ obrigatório.");

            let arr = loadData(DB_KEYS.CONTRATANTES).slice();
            const idHidden = document.getElementById('contratanteId').value;

            if (idHidden && String(idHidden) !== String(cnpj)) arr = arr.filter(c => String(c.cnpj) !== String(idHidden));

            const obj = {
                cnpj: cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };
            
            const idx = arr.findIndex(c => String(c.cnpj) === String(cnpj));
            if (idx >= 0) arr[idx] = obj; else arr.push(obj);

            saveData(DB_KEYS.CONTRATANTES, arr).then(() => {
                formCli.reset(); document.getElementById('contratanteId').value = '';
                window.populateAllSelects();
                alert("Contratante salvo!");
            });
        });
    }

    // D. SALVAR OPERAÇÃO (CRÍTICO)
    const formOp = document.getElementById('formOperacao');
    if (formOp) {
        formOp.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const motId = document.getElementById('selectMotoristaOperacao').value;
            const veicPlaca = document.getElementById('selectVeiculoOperacao').value;
            
            if (!motId || !veicPlaca) return alert("Selecione Motorista e Veículo.");

            const idHidden = document.getElementById('operacaoId').value;
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            let opExistente = idHidden ? arr.find(o => String(o.id) === String(idHidden)) : null;

            // Lógica de Status
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            let status = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            if (opExistente && opExistente.status === 'EM_ANDAMENTO') status = 'EM_ANDAMENTO';

            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
                data: document.getElementById('operacaoData').value,
                motoristaId: motId,
                veiculoPlaca: veicPlaca,
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
                atividadeId: document.getElementById('selectAtividadeOperacao').value,
                
                // Financeiro
                faturamento: Number(document.getElementById('operacaoFaturamento').value),
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
                comissao: Number(document.getElementById('operacaoComissao').value),
                despesas: Number(document.getElementById('operacaoDespesas').value),
                
                // Dados Rodagem
                combustivel: Number(document.getElementById('operacaoCombustivel').value),
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
                kmRodado: Number(document.getElementById('operacaoKmRodado').value),

                status: status,
                
                // Preserva estrutura de check-ins e Faltas
                checkins: opExistente ? opExistente.checkins : { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false },
                
                // Lista de Ajudantes (usa a lista temporária da tela)
                ajudantes: window._operacaoAjudantesTempList || []
            };

            // Remove versão antiga e insere nova
            if (idHidden) arr = arr.filter(o => String(o.id) !== String(idHidden));
            arr.push(obj);

            saveData(DB_KEYS.OPERACOES, arr).then(() => {
                formOp.reset(); 
                document.getElementById('operacaoId').value = ''; 
                window._operacaoAjudantesTempList = [];
                document.getElementById('listaAjudantesAdicionados').innerHTML = '';
                
                window.renderOperacaoTable();
                window.renderCheckinsTable();
                window.updateDashboardStats();
                
                alert("Operação salva com sucesso!");
            });
        });
    }

    // E. SALVAR CHECK-IN (FUNCIONÁRIO)
    const formCheck = document.getElementById('formCheckinConfirm');
    if (formCheck) {
        formCheck.addEventListener('submit', (e) => {
            e.preventDefault();
            const opId = document.getElementById('checkinOpId').value;
            const step = document.getElementById('checkinStep').value; // 'start' ou 'end'
            
            let arr = loadData(DB_KEYS.OPERACOES).slice();
            let idx = arr.findIndex(o => String(o.id) === String(opId));
            if (idx < 0) return alert("Operação não encontrada.");
            
            let op = arr[idx];
            
            // Verifica se é motorista ou ajudante
            const currentUserFunc = loadData(DB_KEYS.FUNCIONARIOS).find(f => f.uid === window.CURRENT_USER.uid || f.email === window.CURRENT_USER.email);
            if (!currentUserFunc) return alert("Perfil não encontrado.");

            if (currentUserFunc.funcao === 'motorista') {
                if (step === 'start') {
                    const kmIni = Number(document.getElementById('checkinKmInicial').value);
                    if (!kmIni) return alert("Informe o KM Inicial.");
                    
                    op.kmInicial = kmIni;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = new Date().toISOString();
                } else {
                    const kmFim = Number(document.getElementById('checkinKmFinal').value);
                    if (!kmFim || kmFim < op.kmInicial) return alert("KM Final inválido.");
                    
                    op.kmFinal = kmFim;
                    op.kmRodado = kmFim - (op.kmInicial || 0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
                    op.status = 'CONFIRMADA';
                }
            } else {
                // Ajudante
                if (!op.checkins.ajudantes) op.checkins.ajudantes = [];
                if (!op.checkins.ajudantes.includes(String(currentUserFunc.id))) {
                    op.checkins.ajudantes.push(String(currentUserFunc.id));
                }
            }
            
            saveData(DB_KEYS.OPERACOES, arr).then(() => {
                window.closeCheckinConfirmModal();
                if(window.renderCheckinsTable) window.renderCheckinsTable();
                alert("Check-in realizado!");
            });
        });
    }
}


// --- 10. RELATÓRIOS E RECIBOS (FUNÇÕES QUE ESTAVAM FALTANDO) ---

window.generateGeneralReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    
    if(!ini || !fim) return alert("Selecione data inicial e final.");

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.status === 'CONFIRMADA' && o.data >= ini && o.data <= fim
    );

    let html = `<h3>RELATÓRIO GERAL (${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')})</h3>`;
    html += `<table class="data-table"><thead><tr><th>DATA</th><th>PLACA</th><th>FATURAMENTO</th><th>LUCRO EST.</th></tr></thead><tbody>`;
    
    let totalFat = 0, totalLucro = 0;

    ops.forEach(o => {
        const fat = Number(o.faturamento)||0;
        let custo = window.calcularCustoConsumoViagem(o) + (Number(o.despesas)||0);
        
        // Custo Equipe (Só conta se não faltou)
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao)||0);
        (o.ajudantes||[]).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) custo += (Number(a.diaria)||0);
        });

        const lucro = fat - custo;
        totalFat += fat;
        totalLucro += lucro;

        html += `<tr>
            <td>${o.data.split('-').reverse().join('/')}</td>
            <td>${o.veiculoPlaca}</td>
            <td>${window.formatCurrency(fat)}</td>
            <td>${window.formatCurrency(lucro)}</td>
        </tr>`;
    });

    html += `<tr style="font-weight:bold; background:#eee;">
        <td colspan="2">TOTAIS</td>
        <td>${window.formatCurrency(totalFat)}</td>
        <td>${window.formatCurrency(totalLucro)}</td>
    </tr></tbody></table>`;

    const container = document.getElementById('reportContent');
    if(container) {
        container.innerHTML = html;
        document.getElementById('reportResults').style.display = 'block';
    }
};

window.generateBillingReport = () => {
    // Relatório focado em cobrança (Cliente)
    const cnpj = document.getElementById('selectContratanteRelatorio').value;
    if(!cnpj) return alert("Selecione um contratante.");
    const cli = window.getContratante(cnpj);
    
    // Filtra ops deste cliente
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.contratanteCNPJ === cnpj && o.status === 'CONFIRMADA');
    
    let html = `<div style="padding:20px; border:1px solid #000;">
        <h2 style="text-align:center;">FATURA DE SERVIÇOS</h2>
        <p><strong>CLIENTE:</strong> ${cli?.razaoSocial || cnpj}</p>
        <table style="width:100%; margin-top:20px; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #000;"><th>DATA</th><th>VEÍCULO</th><th style="text-align:right;">VALOR</th></tr>`;
    
    let total = 0;
    ops.forEach(o => {
        total += (Number(o.faturamento)||0);
        html += `<tr>
            <td style="padding:5px;">${o.data.split('-').reverse().join('/')}</td>
            <td>${o.veiculoPlaca}</td>
            <td style="text-align:right;">${window.formatCurrency(o.faturamento)}</td>
        </tr>`;
    });
    html += `</table><h3 style="text-align:right; margin-top:20px;">TOTAL: ${window.formatCurrency(total)}</h3></div>`;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.exportReportToPDF = () => {
    const el = document.getElementById('reportContent');
    if(!el || !el.innerText) return alert("Gere um relatório primeiro.");
    
    const opt = { margin: 10, filename: 'relatorio_logimaster.pdf', html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    html2pdf().set(opt).from(el).save();
};

window.generateReceipt = () => {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;
    
    if(!funcId || !ini || !fim) return alert("Preencha todos os campos.");
    const func = window.getFuncionario(funcId);
    
    // Busca serviços
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data >= ini && o.data <= fim && o.status === 'CONFIRMADA');
    
    let html = `<div style="border:2px dashed #333; padding:30px; background:#fff;">
        <h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>
        <p>Beneficiário: <strong>${func.nome}</strong> (${func.funcao})</p>
        <ul>`;
        
    let total = 0;
    ops.forEach(o => {
        let val = 0;
        let obs = '';
        
        if (func.funcao === 'motorista' && String(o.motoristaId) === String(funcId)) {
            if (o.checkins?.faltaMotorista) obs = ' (FALTA - R$ 0,00)';
            else val = Number(o.comissao)||0;
        } else {
            // Ajudante
            const item = (o.ajudantes||[]).find(a => String(a.id) === String(funcId));
            if (item) {
                if (o.checkins?.faltasAjudantes?.includes(String(funcId))) obs = ' (FALTA - R$ 0,00)';
                else val = Number(item.diaria)||0;
            }
        }
        
        if (val > 0 || obs) {
            total += val;
            html += `<li>${o.data.split('-').reverse().join('/')} - Placa ${o.veiculoPlaca}: <strong>${window.formatCurrency(val)}</strong>${obs}</li>`;
        }
    });
    
    html += `</ul><h3 style="text-align:right;">TOTAL LÍQUIDO: ${window.formatCurrency(total)}</h3></div>
    <div style="text-align:center; margin-top:10px;"><button class="btn-primary" onclick="window.print()">IMPRIMIR</button></div>`;
    
    document.getElementById('reciboContent').innerHTML = html;
};


// --- 11. DASHBOARD E INICIALIZAÇÃO DO SISTEMA ---

window.updateDashboardStats = () => {
    // Só roda se for admin
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const date = window.currentDate || new Date();
    
    // Filtra ops do mês atual do calendário
    const opsMes = ops.filter(o => {
        const d = new Date(o.data);
        return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear() && o.status === 'CONFIRMADA';
    });
    
    const fat = opsMes.reduce((acc, o) => acc + (Number(o.faturamento)||0), 0);
    let custo = 0;
    
    opsMes.forEach(o => {
        custo += window.calcularCustoConsumoViagem(o) + (Number(o.despesas)||0);
        // Equipe (só paga se não faltou)
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao)||0);
        (o.ajudantes||[]).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) custo += (Number(a.diaria)||0);
        });
    });

    const lucro = fat - custo;
    
    // Atualiza DOM
    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elLucro = document.getElementById('receitaMes');
    
    if(elFat) elFat.textContent = window.formatCurrency(fat);
    if(elDesp) elDesp.textContent = window.formatCurrency(custo);
    if(elLucro) {
        elLucro.textContent = window.formatCurrency(lucro);
        elLucro.style.color = lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    // Renderiza Gráfico
    const ctx = document.getElementById('mainChart');
    if(ctx) {
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Faturamento', 'Custos', 'Lucro'],
                datasets: [{
                    label: 'Resumo do Mês',
                    data: [fat, custo, lucro],
                    backgroundColor: ['#00796b', '#c62828', (lucro>=0?'#2e7d32':'#c62828')]
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
};

// Entry Point - Chamado pelo index.html após autenticação
window.initSystemByRole = (user) => {
    window.CURRENT_USER = user;
    
    // Oculta todos os menus
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    
    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
    } 
    else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        window.populateAllSelects();
        window.renderCalendar();
        window.updateDashboardStats();
    } 
    else {
        // Funcionário
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        // Funcionário vê check-ins na home dele
        window.renderCheckinsTable(); 
    }

    // Inicia Listeners Realtime se houver empresa
    if (window.dbRef && user.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        Object.values(DB_KEYS).forEach(k => {
            onSnapshot(doc(db, 'companies', user.company, 'data', k), snap => {
                if (snap.exists()) {
                    APP_CACHE[k] = snap.data().items || [];
                    // Atualiza UI reativamente
                    window.populateAllSelects();
                }
            });
        });
    }
};

// Listeners de Inicialização
document.addEventListener('DOMContentLoaded', () => {
    if(setupFormHandlers) setupFormHandlers();
    
    // Navegação Mobile
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
    
    // Handler para adicionar Ajudante Manualmente na Operação
    document.getElementById('btnManualAddAjudante')?.addEventListener('click', window.handleManualAddAjudante);
});

// Helper de Ajudante Manual
window.handleManualAddAjudante = () => {
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;
    if(!id) return alert("Selecione um ajudante.");
    
    const aj = window.getFuncionario(id);
    const val = prompt(`Valor da diária para ${aj.nome}?`, "0");
    if (val !== null) {
        if(!window._operacaoAjudantesTempList) window._operacaoAjudantesTempList = [];
        window._operacaoAjudantesTempList.push({ id: id, diaria: Number(val.replace(',','.')) });
        window.renderAjudantesAdicionadosList();
        sel.value = '';
    }
};

window.renderAjudantesAdicionadosList = () => {
    const list = document.getElementById('listaAjudantesAdicionados');
    if(!list) return;
    list.innerHTML = (window._operacaoAjudantesTempList||[]).map(a => {
        const f = window.getFuncionario(a.id);
        return `<li>${f?f.nome:'-'} (R$ ${a.diaria}) <button type="button" onclick="window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!='${a.id}');window.renderAjudantesAdicionadosList()">Remover</button></li>`;
    }).join('');
};