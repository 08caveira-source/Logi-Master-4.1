// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 11.0 (CÓDIGO COMPLETO - SEM ABREVIAÇÕES)
// PARTE 1: INFRAESTRUTURA, DADOS E CÁLCULOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE CHAVES DO BANCO DE DADOS
 * Define as chaves usadas no LocalStorage e no Firebase.
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
 * 2. CACHE GLOBAL (ESTADO DA APLICAÇÃO)
 * Inicializa lendo do LocalStorage para garantir performance imediata.
 */
const APP_CACHE = {};

// Carregamento inicial síncrono
Object.values(DB_KEYS).forEach(key => {
    const saved = localStorage.getItem(key);
    // Se for 'minha empresa' o padrão é objeto {}, para os outros é array []
    const defaultVal = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
    
    if (saved) {
        try {
            APP_CACHE[key] = JSON.parse(saved);
        } catch (e) {
            console.error(`Erro ao parsear cache para ${key}`, e);
            APP_CACHE[key] = defaultVal;
        }
    } else {
        APP_CACHE[key] = defaultVal;
    }
});

// Variáveis Globais de Controle
window.IS_READ_ONLY = false;
window.CURRENT_USER = null;
window.currentDate = new Date(); // Data base para o calendário

// =============================================================================
// 3. FUNÇÕES DE ENTRADA E SAÍDA (I/O)
// =============================================================================

/**
 * Carrega dados do cache.
 * Retorna sempre o tipo de dado correto (Array ou Objeto) para evitar erros de .map ou .filter
 */
function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    // Garante retorno de array
    if (Array.isArray(APP_CACHE[key])) {
        return APP_CACHE[key];
    }
    return [];
}

/**
 * Salva dados no Cache Local e no Firebase.
 */
async function saveData(key, value) {
    // 1. Atualiza Cache e LocalStorage (Instantâneo)
    APP_CACHE[key] = value;
    localStorage.setItem(key, JSON.stringify(value));

    // 2. Sincroniza com Firebase (Se estiver logado e online)
    // Admin Global não salva dados na empresa para evitar corrupção
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Salva no caminho: companies/{dominio}/data/{colecao}
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { 
                    items: value,
                    lastUpdate: new Date().toISOString()
                });
            } catch (e) {
                console.error(`Erro de sincronização em ${key}:`, e);
            }
        }
    }
}

// =============================================================================
// 4. FORMATADORES (UTILS)
// =============================================================================

// Remove formatação, mantendo apenas números
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata Moeda (R$)
window.formatCurrency = (value) => {
    let val = Number(value);
    if (isNaN(val)) val = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(val);
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

// Formata CPF ou CNPJ (apenas uppercase para visualização simples)
window.formatCPF_CNPJ = (value) => {
    return (value || '').toUpperCase();
};

// Formata Telefone
window.formatPhoneBr = (value) => {
    const v = onlyDigits(value);
    if (v.length > 10) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
    if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return value;
};

// =============================================================================
// 5. GETTERS (BUSCA DE DADOS)
// =============================================================================

// Helper para converter ID em string segura
const safeStr = (v) => String(v || '').trim();

window.getFuncionario = (id) => {
    const list = loadData(DB_KEYS.FUNCIONARIOS);
    return list.find(f => safeStr(f.id) === safeStr(id));
};

window.getMotorista = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'motorista') ? f : null;
};

window.getAjudante = (id) => {
    const f = window.getFuncionario(id);
    return (f && f.funcao === 'ajudante') ? f : null;
};

window.getVeiculo = (placa) => {
    const list = loadData(DB_KEYS.VEICULOS);
    return list.find(v => v.placa === placa);
};

window.getContratante = (cnpj) => {
    const list = loadData(DB_KEYS.CONTRATANTES);
    return list.find(c => safeStr(c.cnpj) === safeStr(cnpj));
};

window.getAtividade = (id) => {
    const list = loadData(DB_KEYS.ATIVIDADES);
    return list.find(a => safeStr(a.id) === safeStr(id));
};

window.getMinhaEmpresa = () => {
    return loadData(DB_KEYS.MINHA_EMPRESA);
};

// =============================================================================
// 6. CÁLCULOS FINANCEIROS E DE FROTA
// =============================================================================

/**
 * Retorna o maior KM Final registrado para um veículo.
 * Impede que o motorista registre um KM menor que o anterior.
 */
window.obterUltimoKmFinal = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    const opsVeiculo = ops.filter(op => op.veiculoPlaca === placa && Number(op.kmFinal) > 0);
    
    if (opsVeiculo.length === 0) return 0;
    
    // Retorna o maior valor encontrado
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * Calcula a média histórica de consumo (KM/L) do veículo.
 */
window.calcularMediaHistoricaVeiculo = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    // Usa apenas operações confirmadas para a média
    const opsVeiculo = ops.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKm = 0;
    let totalLitros = 0;

    opsVeiculo.forEach(op => {
        if (op.kmRodado && Number(op.kmRodado) > 0) {
            totalKm += Number(op.kmRodado);
        }
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitros += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitros <= 0) return 3.5; // Retorna uma média padrão segura se não tiver histórico
    return totalKm / totalLitros;
};

/**
 * Obtém o último preço de combustível pago por este veículo.
 */
window.obterUltimoPrecoCombustivel = (placa) => {
    if (!placa) return 0;
    const ops = loadData(DB_KEYS.OPERACOES);
    const opsComPreco = ops.filter(op => op.veiculoPlaca === placa && Number(op.precoLitro) > 0);
    
    if (opsComPreco.length === 0) return 0;
    
    // Ordena por data decrescente
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    return Number(opsComPreco[0].precoLitro);
};

/**
 * Calcula o Custo da Viagem (Diesel).
 * Se o valor foi informado manualmente, usa ele. Se não, estima pela média.
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || op.status !== 'CONFIRMADA') return 0;

    // 1. Se tem valor real de abastecimento, usa ele
    if (op.combustivel && Number(op.combustivel) > 0) {
        return Number(op.combustivel);
    }
    
    // 2. Se não, estima pelo KM Rodado
    const km = Number(op.kmRodado) || 0;
    if (km <= 0) return 0;

    const media = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    let preco = Number(op.precoLitro) || 0;
    
    if (preco <= 0) {
        preco = window.obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }
    
    if (media > 0 && preco > 0) {
        return (km / media) * preco;
    }

    return 0;
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 11.0 (CÓDIGO COMPLETO - SEM ABREVIAÇÕES)
// PARTE 2: INTERFACE DE USUÁRIO (UI) E TABELAS
// =============================================================================

// --- 7. RENDERIZAÇÃO DE TABELAS DE CADASTRO (GENÉRICA) ---
// Preenche as tabelas de Funcionários, Veículos e Contratantes

window.renderCadastroTable = (key) => {
    const data = loadData(key);
    let tabelaId = '';
    let idKey = 'id'; // Chave padrão

    // Define qual tabela HTML preencher baseado na chave do banco
    if (key === DB_KEYS.FUNCIONARIOS) {
        tabelaId = 'tabelaFuncionarios';
    } else if (key === DB_KEYS.VEICULOS) {
        tabelaId = 'tabelaVeiculos';
        idKey = 'placa'; // Veículos usam PLACA como ID
    } else if (key === DB_KEYS.CONTRATANTES) {
        tabelaId = 'tabelaContratantes';
        idKey = 'cnpj'; // Contratantes usam CNPJ como ID
    }

    const tabelaElement = document.getElementById(tabelaId);
    if (!tabelaElement) return; // Se a tabela não existir no HTML, para aqui.

    const tbody = tabelaElement.querySelector('tbody');
    tbody.innerHTML = ''; // Limpa conteúdo anterior

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    // Gera as linhas da tabela
    let htmlContent = '';
    
    data.forEach(item => {
        // SEGURANÇA: Converte ID para string para evitar erros no HTML
        const safeId = String(item[idKey]);
        
        let col1 = '-', col2 = '-', col3 = '-';

        if (key === DB_KEYS.FUNCIONARIOS) {
            col1 = item.nome;
            col2 = item.funcao;
            col3 = item.email || 'Sem acesso';
        } else if (key === DB_KEYS.VEICULOS) {
            col1 = item.placa;
            col2 = item.modelo;
            col3 = item.ano || '-';
        } else if (key === DB_KEYS.CONTRATANTES) {
            col1 = item.razaoSocial;
            col2 = window.formatCPF_CNPJ(item.cnpj);
            col3 = window.formatPhoneBr(item.telefone);
        }

        // Botões de Ação (Editar / Excluir)
        let actionButtons = '';
        
        if (!window.IS_READ_ONLY) {
            // Admin vê Editar e Excluir
            actionButtons = `
                <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${safeId}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${safeId}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            // Funcionário vê apenas Visualizar (exceto em dados sensíveis)
            actionButtons = `<button class="btn-mini btn-primary" onclick="alert('Acesso restrito.')"><i class="fas fa-lock"></i></button>`;
        }

        htmlContent += `
            <tr>
                <td>${col1}</td>
                <td>${col2}</td>
                <td>${col3}</td>
                <td style="white-space:nowrap;">${actionButtons}</td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlContent;
};

// Tabela de Atividades (Simples)
window.renderAtividadesTable = () => {
    const data = loadData(DB_KEYS.ATIVIDADES);
    const tbody = document.querySelector('#tabelaAtividades tbody');
    if(!tbody) return;
    
    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">SEM ATIVIDADES CADASTRADAS.</td></tr>`;
        return;
    }
    
    let html = '';
    data.forEach(i => {
        const btnDel = !window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.ATIVIDADES}', '${i.id}')"><i class="fas fa-trash"></i></button>` : '';
        html += `
            <tr>
                <td>${i.id}</td>
                <td>${i.nome}</td>
                <td>${btnDel}</td>
            </tr>`;
    });
    tbody.innerHTML = html;
};


// --- 8. RENDERIZAÇÃO DO HISTÓRICO DE OPERAÇÕES ---
// Exibe apenas: AGENDADA, EM_ANDAMENTO e CONFIRMADA.
// Faltas e Canceladas NÃO aparecem aqui.

window.renderOperacaoTable = () => {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;

    // 1. Carrega dados
    const todasOps = loadData(DB_KEYS.OPERACOES);
    
    // 2. Filtra Status permitidos (Esconde Faltas e Cancelados)
    const statusPermitidos = ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'];
    const opsFiltradas = todasOps.filter(o => statusPermitidos.includes(o.status));

    // 3. Ordena por Data (Mais recente primeiro)
    opsFiltradas.sort((a, b) => new Date(b.data) - new Date(a.data));

    if (opsFiltradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhuma operação ativa.</td></tr>';
        return;
    }

    // 4. Gera HTML
    let html = '';
    opsFiltradas.forEach(op => {
        const motoristaObj = window.getMotorista(op.motoristaId);
        const nomeMot = motoristaObj ? motoristaObj.nome : '(Motorista não encontrado)';
        
        let statusBadge = '';
        if (op.status === 'CONFIRMADA') {
            statusBadge = '<span class="status-pill pill-active">CONFIRMADA</span>';
        } else if (op.status === 'AGENDADA') {
            statusBadge = '<span class="status-pill pill-pending">AGENDADA</span>';
        } else if (op.status === 'EM_ANDAMENTO') {
            statusBadge = '<span class="status-pill" style="background:var(--info-color)">EM ANDAMENTO</span>';
        }

        // Botões de Ação
        // Ver Detalhes sempre disponível. Editar/Excluir apenas para Admin.
        const btnView = `<button class="btn-mini btn-primary" onclick="viewOperacaoDetails('${op.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>`;
        let btnEdit = '';
        let btnDel = '';
        
        if (!window.IS_READ_ONLY) {
             btnEdit = `<button class="btn-mini edit-btn" onclick="editOperacaoItem('${op.id}')" title="Editar"><i class="fas fa-edit"></i></button>`;
             btnDel  = `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.OPERACOES}', '${op.id}')" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        html += `
            <tr>
                <td>${op.data.split('-').reverse().join('/')}</td>
                <td>
                    <strong>${nomeMot}</strong><br>
                    <small style="color:#666;">${op.veiculoPlaca}</small>
                </td>
                <td>${statusBadge}</td>
                <td style="font-weight:bold; color:var(--success-color);">${window.formatCurrency(op.faturamento)}</td>
                <td>${btnView} ${btnEdit} ${btnDel}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};


// --- 9. MONITORAMENTO DE ROTAS (ATIVAS + FALTAS) ---
// Divide a tela em: Rotas em Curso e Lista de Faltas (no rodapé)

window.renderCheckinsTable = () => {
    const tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    const tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    if (!tbodyAtivos) return;

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'CANCELADA');
    
    // =========================================================================
    // PARTE A: ROTAS ATIVAS (AGENDADAS / EM ANDAMENTO / CONFIRMADAS RECENTES)
    // =========================================================================
    
    // Filtro de tempo: Esconde confirmadas antigas (> 5 dias) para limpar a visão
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 5);
    const strDataLimite = dataLimite.toISOString().split('T')[0];

    const rotasAtivas = ops.filter(op => {
        // Se confirmada e antiga, esconde
        if (op.status === 'CONFIRMADA' && op.data < strDataLimite) return false;
        
        // Se o MOTORISTA faltou, não é ativa, vai para lista de faltas
        if (op.checkins && op.checkins.faltaMotorista) return false;

        return true;
    });

    // Ordenação: Em Andamento > Agendada > Confirmada
    rotasAtivas.sort((a, b) => {
        const peso = { 'EM_ANDAMENTO': 3, 'AGENDADA': 2, 'CONFIRMADA': 1 };
        return (peso[b.status] || 0) - (peso[a.status] || 0) || new Date(b.data) - new Date(a.data);
    });

    let htmlAtivos = '';
    
    rotasAtivas.forEach(op => {
        const mot = window.getMotorista(op.motoristaId);
        const nomeMot = mot ? mot.nome : '---';
        
        // --- 1. LINHA DO MOTORISTA ---
        let statusMot = '<span class="status-pill pill-pending">AGUARDANDO</span>';
        if (op.checkins && op.checkins.motorista) {
            statusMot = '<span class="status-pill pill-active">EM ROTA</span>';
        }
        if (op.status === 'CONFIRMADA') {
            statusMot = '<span class="status-pill pill-active">FINALIZADO</span>';
        }

        // Botões Admin (Forçar / Marcar Falta)
        let botoesAdmin = '';
        if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA') {
            botoesAdmin = `
                <button class="btn-mini btn-success" title="Forçar Início" onclick="forceCheckin('${op.id}', 'motorista', '${op.motoristaId}')">
                    <i class="fas fa-play"></i>
                </button>
                <button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent('${op.id}', 'motorista', '${op.motoristaId}')">
                    <i class="fas fa-user-times"></i>
                </button>
            `;
        }

        htmlAtivos += `
            <tr style="border-left: 4px solid var(--primary-color); background-color: #fcfcfc;">
                <td><strong>${op.data.split('-').reverse().join('/')}</strong></td>
                <td>Op #${op.id}<br><small>${op.veiculoPlaca}</small></td>
                <td>${nomeMot} <small style="color:#666">(MOTORISTA)</small></td>
                <td>${op.status}</td>
                <td>${statusMot}</td>
                <td>${botoesAdmin}</td>
            </tr>
        `;

        // --- 2. LINHAS DOS AJUDANTES ---
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(aj => {
                // Se o ajudante faltou, não mostra aqui, mostra na lista de faltas
                if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(aj.id))) {
                    return; 
                }

                const funcAj = window.getFuncionario(aj.id);
                const nomeAj = funcAj ? funcAj.nome : '---';
                
                const isPresente = op.checkins && op.checkins.ajudantes && op.checkins.ajudantes.includes(String(aj.id));
                
                let statusAj = isPresente ? '<span class="status-pill pill-active">PRESENTE</span>' : '<span class="status-pill pill-pending">AGUARDANDO</span>';
                if (op.status === 'CONFIRMADA') statusAj = '<span class="status-pill pill-active">OK</span>';

                let botoesAj = '';
                if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA' && !isPresente) {
                    botoesAj = `
                        <button class="btn-mini btn-success" title="Confirmar Presença" onclick="forceCheckin('${op.id}', 'ajudante', '${aj.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-mini btn-danger" title="Marcar Falta" onclick="markAbsent('${op.id}', 'ajudante', '${aj.id}')">
                            <i class="fas fa-user-times"></i>
                        </button>
                    `;
                }

                htmlAtivos += `
                    <tr>
                        <td style="border:none;"></td>
                        <td style="border:none;"></td>
                        <td>${nomeAj} <small style="color:#666">(AJUDANTE)</small></td>
                        <td style="color:#aaa;">-</td>
                        <td>${statusAj}</td>
                        <td>${botoesAj}</td>
                    </tr>
                `;
            });
        }
    });

    if (rotasAtivas.length === 0) {
        htmlAtivos = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma rota ativa no momento.</td></tr>';
    }
    tbodyAtivos.innerHTML = htmlAtivos;


    // =========================================================================
    // PARTE B: LISTA DE FALTAS E OCORRÊNCIAS (FIXA NO RODAPÉ)
    // =========================================================================
    
    if (tbodyFaltas) {
        let htmlFaltas = '';
        let contagemFaltas = 0;

        ops.forEach(op => {
            // 1. Falta Motorista
            if (op.checkins && op.checkins.faltaMotorista) {
                const mot = window.getMotorista(op.motoristaId)?.nome || 'Motorista';
                contagemFaltas++;
                htmlFaltas += `
                    <tr>
                        <td>${op.data.split('-').reverse().join('/')}</td>
                        <td>${mot}</td>
                        <td>MOTORISTA</td>
                        <td><span class="status-pill pill-absent">FALTA REGISTRADA</span></td>
                        <td>
                            ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="undoFalta('${op.id}', 'motorista', '${op.motoristaId}')">DESFAZER</button>` : ''}
                        </td>
                    </tr>
                `;
            }

            // 2. Faltas Ajudantes
            if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.length > 0) {
                op.checkins.faltasAjudantes.forEach(ajId => {
                    const func = window.getFuncionario(ajId)?.nome || 'Ajudante';
                    contagemFaltas++;
                    htmlFaltas += `
                        <tr>
                            <td>${op.data.split('-').reverse().join('/')}</td>
                            <td>${func}</td>
                            <td>AJUDANTE</td>
                            <td><span class="status-pill pill-absent">FALTA REGISTRADA</span></td>
                            <td>
                                ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="undoFalta('${op.id}', 'ajudante', '${ajId}')">DESFAZER</button>` : ''}
                            </td>
                        </tr>
                    `;
                });
            }
        });

        if (contagemFaltas === 0) {
            htmlFaltas = '<tr><td colspan="5" style="text-align:center; color:#999; padding:15px;">Nenhuma falta registrada no histórico.</td></tr>';
        }

        tbodyFaltas.innerHTML = htmlFaltas;
    }
};

// --- 10. TABELA DE DESPESAS GERAIS ---
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
        const btnDel = !window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="deleteItem('${DB_KEYS.DESPESAS_GERAIS}', '${d.id}')"><i class="fas fa-trash"></i></button>` : '';
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

// --- 11. TABELA DE SOLICITAÇÕES DE PERFIL ---
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

// --- 12. POPULAR MENUS (SELECTS) ---
window.populateAllSelects = () => {
    const motoristas = loadData(DB_KEYS.FUNCIONARIOS).filter(f => f.funcao === 'motorista');
    const ajudantes = loadData(DB_KEYS.FUNCIONARIOS).filter(f => f.funcao === 'ajudante');
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    const fill = (id, list, val, txt, def) => {
        const el = document.getElementById(id);
        if(el) {
            const oldVal = el.value;
            el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i[val]}">${i[txt]}</option>`).join('');
            if(oldVal) el.value = oldVal;
        }
    };

    fill('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    fill('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    fill('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    fill('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    fill('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    // Outros selects
    fill('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR PLACA (OPCIONAL)...');
    fill('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');

    // Recibos (Todos)
    const allFuncs = loadData(DB_KEYS.FUNCIONARIOS);
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        selRecibo.innerHTML = '<option value="">SELECIONE...</option>';
        allFuncs.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.funcao.toUpperCase()} - ${f.nome}`;
            selRecibo.appendChild(opt);
        });
    }

    // Atualiza todas as tabelas
    window.renderCadastroTable(DB_KEYS.FUNCIONARIOS);
    window.renderCadastroTable(DB_KEYS.VEICULOS);
    window.renderCadastroTable(DB_KEYS.CONTRATANTES);
    window.renderAtividadesTable();
    window.renderOperacaoTable();
    window.renderCheckinsTable();
    window.renderDespesasTable();
    if(window.renderMinhaEmpresaInfo) window.renderMinhaEmpresaInfo();
    if(window.renderProfileRequestsTable) window.renderProfileRequestsTable();
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 11.0 (CÓDIGO COMPLETO)
// PARTE 3: CALENDÁRIO, AÇÕES DE CRUD E GESTÃO DE EQUIPE
// =============================================================================

// --- 10. LÓGICA DO CALENDÁRIO VISUAL ---

window.renderCalendar = () => {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    
    // Limpa o grid para redesenhar
    grid.innerHTML = ''; 
    
    const date = window.currentDate;
    const month = date.getMonth();
    const year = date.getFullYear();

    // Atualiza o título do mês (Ex: DEZEMBRO 2025)
    document.getElementById('currentMonthYear').textContent = date.toLocaleDateString('pt-BR', { 
        month: 'long', 
        year: 'numeric' 
    }).toUpperCase();

    // Adiciona células vazias para alinhar o dia da semana
    const firstDay = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        grid.appendChild(div);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const ops = loadData(DB_KEYS.OPERACOES);

    // Cria os dias do mês
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.innerHTML = `<span>${i}</span>`;
        
        // Formata a data atual do loop para YYYY-MM-DD
        const dataStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        
        // Busca operações deste dia (ignorando canceladas)
        const opsDia = ops.filter(o => o.data === dataStr && o.status !== 'CANCELADA');

        // Se houver operações, adiciona indicadores visuais
        if (opsDia.length > 0) {
            cell.classList.add('has-operation');
            
            // Calcula faturamento total do dia para exibir no quadradinho
            const totalFaturamentoDia = opsDia.reduce((acc, op) => acc + (Number(op.faturamento) || 0), 0);
            
            cell.innerHTML += `<div class="event-dot"></div>`;
            cell.innerHTML += `<div style="font-size:0.7rem; color:green; margin-top:auto; font-weight:bold;">${window.formatCurrency(totalFaturamentoDia)}</div>`;
            
            // Evento de clique: Passa a string da data para abrir o modal
            cell.onclick = function() {
                window.openDayDetails(dataStr);
            };
        }
        
        grid.appendChild(cell);
    }
};

window.changeMonth = (delta) => {
    window.currentDate.setMonth(window.currentDate.getMonth() + delta);
    window.renderCalendar();
    if(window.updateDashboardStats) window.updateDashboardStats(); 
};

// Abre o Modal com o Resumo Financeiro do Dia
window.openDayDetails = (dataStr) => {
    // 1. Busca operações do dia
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.data === dataStr && o.status !== 'CANCELADA');
    
    // 2. Calcula Totais Financeiros (Faturamento vs Custos Reais)
    let faturamentoTotal = 0;
    let custoTotal = 0;

    ops.forEach(o => {
        faturamentoTotal += (Number(o.faturamento) || 0);
        
        // Custo 1: Diesel
        let custoDiesel = window.calcularCustoConsumoViagem(o);
        
        // Custo 2: Despesas de Viagem (Pedágio, Chapa)
        let custoViagem = Number(o.despesas) || 0;
        
        // Custo 3: Equipe (Só soma se NÃO tiver falta registrada)
        let custoEquipe = 0;
        
        // Motorista
        if (!o.checkins || !o.checkins.faltaMotorista) {
            custoEquipe += (Number(o.comissao) || 0);
        }
        
        // Ajudantes
        if (o.ajudantes && o.ajudantes.length > 0) {
            o.ajudantes.forEach(aj => {
                // Se o ajudante NÃO estiver na lista de faltas, soma a diária
                if (!o.checkins || !o.checkins.faltasAjudantes || !o.checkins.faltasAjudantes.includes(String(aj.id))) {
                    custoEquipe += (Number(aj.diaria) || 0);
                }
            });
        }
        
        custoTotal += (custoDiesel + custoViagem + custoEquipe);
    });

    const lucroLiquido = faturamentoTotal - custoTotal;

    // 3. Renderiza o Resumo no Topo do Modal
    const summaryDiv = document.getElementById('modalDaySummary');
    if (summaryDiv) {
        summaryDiv.innerHTML = `
            <div class="finance-box success">
                <strong>FATURAMENTO</strong>
                <span>${window.formatCurrency(faturamentoTotal)}</span>
            </div>
            <div class="finance-box gasto">
                <strong>CUSTOS TOTAIS</strong>
                <span>${window.formatCurrency(custoTotal)}</span>
            </div>
            <div class="finance-box lucro">
                <strong>LUCRO LÍQUIDO</strong>
                <span style="color:${lucroLiquido >= 0 ? 'green' : 'red'}">${window.formatCurrency(lucroLiquido)}</span>
            </div>
        `;
    }

    // 4. Renderiza a Lista de Operações do Dia
    const bodyDiv = document.getElementById('modalDayBody');
    if (bodyDiv) {
        bodyDiv.innerHTML = ops.map(o => {
            const mot = window.getMotorista(o.motoristaId)?.nome || '---';
            return `
            <div style="background:#fff; padding:10px; border:1px solid #eee; margin-bottom:8px; border-left: 3px solid var(--primary-color);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <strong>Op #${o.id}</strong> - ${o.veiculoPlaca}<br>
                        <small>Mot: ${mot}</small>
                    </div>
                    <div style="text-align:right;">
                        <strong>${window.formatCurrency(o.faturamento)}</strong><br>
                        <small>${o.status}</small>
                    </div>
                </div>
                <button class="btn-mini btn-primary" style="width:100%; margin-top:5px;" 
                    onclick="editOperacaoItem('${o.id}'); document.getElementById('modalDayOperations').style.display='none';">
                    VER / EDITAR
                </button>
            </div>
            `;
        }).join('');
    }

    document.getElementById('modalDayTitle').textContent = `DETALHES DO DIA ${dataStr.split('-').reverse().join('/')}`;
    document.getElementById('modalDayOperations').style.display = 'block';
};


// --- 11. FUNÇÕES DE EDIÇÃO E EXCLUSÃO (CRUD) ---

// Função Genérica de Exclusão
window.deleteItem = (key, id) => {
    if (window.IS_READ_ONLY) return alert("Permissão negada.");
    
    if (!confirm("Tem certeza que deseja EXCLUIR este registro permanentemente?")) return;
    
    let arr = loadData(key);
    // Identifica qual campo é a chave única
    let idKey = 'id';
    if (key === DB_KEYS.VEICULOS) idKey = 'placa';
    if (key === DB_KEYS.CONTRATANTES) idKey = 'cnpj';
    
    // Filtra removendo o item
    const newArr = arr.filter(i => String(i[idKey]) !== String(id));
    
    saveData(key, newArr).then(() => {
        window.populateAllSelects(); // Atualiza selects e tabelas
        alert("Registro excluído com sucesso.");
    });
};

// Editar Cadastros (Funcionário, Veículo, Contratante)
window.editCadastroItem = (key, id) => {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");
    window.scrollTo({top:0, behavior:'smooth'});
    
    if(key === DB_KEYS.FUNCIONARIOS) {
        const item = window.getFuncionario(id);
        if(!item) return;
        
        document.getElementById('funcionarioId').value = item.id;
        document.getElementById('funcNome').value = item.nome;
        document.getElementById('funcFuncao').value = item.funcao;
        document.getElementById('funcDocumento').value = item.documento;
        document.getElementById('funcTelefone').value = item.telefone;
        document.getElementById('funcEmail').value = item.email || '';
        document.getElementById('funcPix').value = item.pix || '';
        document.getElementById('funcEndereco').value = item.endereco || '';
        
        // Campos específicos de motorista
        if(item.funcao === 'motorista') {
            window.toggleDriverFields(); 
            document.getElementById('funcCNH').value = item.cnh || '';
            document.getElementById('funcValidadeCNH').value = item.validadeCNH || '';
            document.getElementById('funcCategoriaCNH').value = item.categoriaCNH || '';
            document.getElementById('funcCursoDescricao').value = item.cursoDescricao || '';
        }
        // Abre a aba correta
        document.querySelector('[data-tab="funcionarios"]').click();
        
    } else if(key === DB_KEYS.VEICULOS) {
        const item = window.getVeiculo(id);
        if(!item) return;
        
        document.getElementById('veiculoId').value = item.placa;
        document.getElementById('veiculoPlaca').value = item.placa;
        document.getElementById('veiculoModelo').value = item.modelo;
        document.getElementById('veiculoAno').value = item.ano;
        document.getElementById('veiculoRenavam').value = item.renavam || '';
        document.getElementById('veiculoChassi').value = item.chassi || '';
        document.querySelector('[data-tab="veiculos"]').click();
        
    } else if(key === DB_KEYS.CONTRATANTES) {
        const item = window.getContratante(id);
        if(!item) return;
        
        document.getElementById('contratanteId').value = item.cnpj;
        document.getElementById('contratanteRazaoSocial').value = item.razaoSocial;
        document.getElementById('contratanteCNPJ').value = item.cnpj;
        document.getElementById('contratanteTelefone').value = item.telefone;
        document.querySelector('[data-tab="contratantes"]').click();
    }
};

// Editar Operação (Carrega dados no formulário principal)
window.editOperacaoItem = (id) => {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");
    
    const op = loadData(DB_KEYS.OPERACOES).find(o => String(o.id) === String(id));
    if(!op) return alert("Operação não encontrada.");
    
    // 1. Dados Básicos
    document.getElementById('operacaoId').value = op.id;
    document.getElementById('operacaoData').value = op.data;
    document.getElementById('selectMotoristaOperacao').value = op.motoristaId;
    document.getElementById('selectVeiculoOperacao').value = op.veiculoPlaca;
    document.getElementById('selectContratanteOperacao').value = op.contratanteCNPJ;
    document.getElementById('selectAtividadeOperacao').value = op.atividadeId || '';
    
    // 2. Financeiro
    document.getElementById('operacaoFaturamento').value = op.faturamento;
    document.getElementById('operacaoAdiantamento').value = op.adiantamento;
    document.getElementById('operacaoComissao').value = op.comissao;
    document.getElementById('operacaoDespesas').value = op.despesas;
    
    // 3. Rodagem
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;
    
    // 4. Status (Agendamento)
    document.getElementById('operacaoIsAgendamento').checked = (op.status === 'AGENDADA');

    // 5. Equipe (Ajudantes)
    // Carrega os ajudantes salvos para a lista temporária de edição
    window._operacaoAjudantesTempList = op.ajudantes ? [...op.ajudantes] : [];
    window.renderAjudantesAdicionadosList();

    // Navega para a tela
    document.querySelector('[data-page="operacoes"]').click();
    window.scrollTo({top:0, behavior:'smooth'});
    
    // Feedback visual
    const formCard = document.getElementById('formOperacao').parentElement;
    formCard.style.border = "2px solid orange";
    setTimeout(() => { formCard.style.border = "1px solid #eef2f6"; }, 2000);
};


// --- 12. AÇÕES DE MONITORAMENTO (ADMINISTRADOR) ---

// Desfazer Falta (Restaura o funcionário para a operação)
window.undoFalta = (opId, type, userId) => {
    if(!confirm("Deseja remover esta falta e permitir que o funcionário receba/trabalhe?")) return;
    
    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    
    let op = ops[idx];

    if(type === 'motorista') {
        op.checkins.faltaMotorista = false;
        // Se ainda não tinha iniciado, volta para agendada. Se já tinha, volta para andamento/confirmada
        if(!op.checkins.motorista) op.status = 'AGENDADA'; 
    } else {
        // Remove ID da lista de faltas de ajudantes
        if(op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(id => String(id) !== String(userId));
        }
    }
    
    saveData(DB_KEYS.OPERACOES, ops).then(() => { 
        window.renderCheckinsTable(); 
        alert("Falta removida com sucesso."); 
    });
};

// Forçar Check-in (Quando o funcionário não consegue usar o app)
window.forceCheckin = (opId, type, userId) => {
    if(!confirm("Confirmar presença manualmente?")) return;

    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    let op = ops[idx];
    
    // Garante que o objeto checkins existe
    if(!op.checkins) op.checkins = { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false };

    if(type === 'motorista') {
        op.checkins.motorista = true;
        op.checkins.faltaMotorista = false;
        op.status = 'EM_ANDAMENTO';
        op.dataHoraInicio = new Date().toISOString();
        
        // Se não tiver KM Inicial, tenta estimar pelo último
        if(!op.kmInicial || op.kmInicial === 0) {
            op.kmInicial = window.obterUltimoKmFinal(op.veiculoPlaca);
        }
    } else {
        // Ajudante
        // Remove de faltas se estiver lá
        if(op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(id => String(id) !== String(userId));
        }
        // Adiciona em presentes
        if(!op.checkins.ajudantes.includes(String(userId))) {
            op.checkins.ajudantes.push(String(userId));
        }
    }
    
    saveData(DB_KEYS.OPERACOES, ops).then(() => { 
        window.renderCheckinsTable(); 
        window.renderOperacaoTable();
        alert("Presença confirmada manualmente."); 
    });
};

// Marcar Falta (Remove o valor do funcionário no financeiro)
window.markAbsent = (opId, type, userId) => {
    if(!confirm("Atenção: Ao marcar FALTA, o valor desta diária/comissão será descontado do recibo e relatório.\n\nConfirmar falta?")) return;

    let ops = loadData(DB_KEYS.OPERACOES).slice();
    let idx = ops.findIndex(o => String(o.id) === String(opId));
    if(idx < 0) return;
    let op = ops[idx];
    
    if(!op.checkins) op.checkins = { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false };

    if(type === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false;
    } else {
        if(!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes = [];
        
        // Adiciona à lista de faltas
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
        alert("Falta registrada. Verifique a lista de ocorrências no final da página."); 
    });
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 11.0 (CÓDIGO COMPLETO)
// PARTE 4: FORMULÁRIOS, RELATÓRIOS, DASHBOARD E INICIALIZAÇÃO
// =============================================================================

// --- 13. GERENCIAMENTO DE FORMULÁRIOS (SALVAR DADOS) ---

function setupFormHandlers() {

    // --- A. SALVAR FUNCIONÁRIO ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.onsubmit = async (e) => {
            e.preventDefault();
            const btn = formFunc.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.innerText = "SALVANDO..."; btn.disabled = true;

            try {
                const idHidden = document.getElementById('funcionarioId').value;
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                let lista = loadData(DB_KEYS.FUNCIONARIOS);
                
                // Validação de Email Único
                if (!idHidden && lista.some(f => f.email === email)) {
                    throw new Error("E-mail já cadastrado.");
                }

                let newId = idHidden ? idHidden : String(Date.now());
                let novoUid = null;

                // Integração Firebase Auth (se houver senha e for novo/atualização de senha)
                if (window.dbRef && !idHidden && senha) {
                    if (senha.length < 6) throw new Error("Senha muito curta (min 6).");
                    const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                    const auth2 = getAuth(secondaryApp);
                    const cred = await createUserWithEmailAndPassword(auth2, email, senha);
                    novoUid = cred.user.uid;
                    
                    // Salva metadados de acesso
                    await setDoc(doc(db, "users", novoUid), {
                        uid: novoUid, name: document.getElementById('funcNome').value.toUpperCase(),
                        email: email, role: funcao, company: window.CURRENT_USER.company, approved: true
                    });
                    await signOut(auth2);
                }

                const obj = {
                    id: newId,
                    uid: novoUid || (idHidden ? (lista.find(f => safeStr(f.id) === safeStr(idHidden))?.uid || '') : ''),
                    nome: document.getElementById('funcNome').value.toUpperCase(),
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    cnh: document.getElementById('funcCNH').value.toUpperCase(),
                    validadeCNH: document.getElementById('funcValidadeCNH').value,
                    categoriaCNH: document.getElementById('funcCategoriaCNH').value,
                    cursoDescricao: document.getElementById('funcCursoDescricao').value.toUpperCase()
                };

                if (idHidden) {
                    const idx = lista.findIndex(f => safeStr(f.id) === safeStr(idHidden));
                    if (idx >= 0) lista[idx] = obj;
                } else {
                    lista.push(obj);
                }

                await saveData(DB_KEYS.FUNCIONARIOS, lista);
                formFunc.reset(); document.getElementById('funcionarioId').value = '';
                window.populateAllSelects();
                alert("Funcionário salvo com sucesso!");

            } catch (err) { alert("Erro: " + err.message); } 
            finally { btn.innerText = originalText; btn.disabled = false; }
        };
    }

    // --- B. SALVAR VEÍCULO ---
    const formVeic = document.getElementById('formVeiculo');
    if (formVeic) {
        formVeic.onsubmit = (e) => {
            e.preventDefault();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            if(!placa) return alert("Placa obrigatória.");

            let lista = loadData(DB_KEYS.VEICULOS);
            const idHidden = document.getElementById('veiculoId').value;

            if (idHidden && idHidden !== placa) lista = lista.filter(v => v.placa !== idHidden);

            const obj = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };

            const idx = lista.findIndex(v => v.placa === placa);
            if (idx >= 0) lista[idx] = obj; else lista.push(obj);

            saveData(DB_KEYS.VEICULOS, lista).then(() => {
                formVeic.reset(); document.getElementById('veiculoId').value = '';
                window.populateAllSelects();
                alert("Veículo salvo!");
            });
        };
    }

    // --- C. SALVAR CONTRATANTE ---
    const formCli = document.getElementById('formContratante');
    if (formCli) {
        formCli.onsubmit = (e) => {
            e.preventDefault();
            const cnpj = document.getElementById('contratanteCNPJ').value.replace(/\D/g,'');
            if(!cnpj) return alert("CNPJ obrigatório.");

            let lista = loadData(DB_KEYS.CONTRATANTES);
            const idHidden = document.getElementById('contratanteId').value;

            if (idHidden && String(idHidden) !== String(cnpj)) lista = lista.filter(c => String(c.cnpj) !== String(idHidden));

            const obj = {
                cnpj: cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };
            
            const idx = lista.findIndex(c => String(c.cnpj) === String(cnpj));
            if (idx >= 0) lista[idx] = obj; else lista.push(obj);

            saveData(DB_KEYS.CONTRATANTES, lista).then(() => {
                formCli.reset(); document.getElementById('contratanteId').value = '';
                window.populateAllSelects();
                alert("Contratante salvo!");
            });
        };
    }

    // --- D. SALVAR OPERAÇÃO (LANÇAMENTO) ---
    const formOp = document.getElementById('formOperacao');
    if (formOp) {
        formOp.onsubmit = (e) => {
            e.preventDefault();
            
            const motId = document.getElementById('selectMotoristaOperacao').value;
            const veicPlaca = document.getElementById('selectVeiculoOperacao').value;
            
            if (!motId || !veicPlaca) return alert("Selecione Motorista e Veículo.");
            
            // Verifica validade CNH (apenas alerta)
            window.verificarValidadeCNH && window.verificarValidadeCNH(motId);

            const idHidden = document.getElementById('operacaoId').value;
            let lista = loadData(DB_KEYS.OPERACOES);
            let opAntiga = idHidden ? lista.find(o => String(o.id) === String(idHidden)) : null;

            // Define Status (Agendada ou Confirmada)
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            let status = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            // Se já estava em andamento, mantém para não quebrar fluxo do motorista
            if (opAntiga && opAntiga.status === 'EM_ANDAMENTO') status = 'EM_ANDAMENTO';

            const obj = {
                id: idHidden ? Number(idHidden) : Date.now(),
                data: document.getElementById('operacaoData').value,
                
                motoristaId: motId,
                veiculoPlaca: veicPlaca,
                contratanteCNPJ: document.getElementById('selectContratanteOperacao').value,
                atividadeId: document.getElementById('selectAtividadeOperacao').value,
                
                faturamento: Number(document.getElementById('operacaoFaturamento').value),
                adiantamento: Number(document.getElementById('operacaoAdiantamento').value),
                comissao: Number(document.getElementById('operacaoComissao').value),
                despesas: Number(document.getElementById('operacaoDespesas').value),
                
                combustivel: Number(document.getElementById('operacaoCombustivel').value),
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
                kmRodado: Number(document.getElementById('operacaoKmRodado').value),

                status: status,
                
                // Preserva Check-ins e Faltas anteriores
                checkins: opAntiga ? opAntiga.checkins : { 
                    motorista: false, 
                    ajudantes: [], 
                    faltasAjudantes: [], 
                    faltaMotorista: false,
                    ajudantesLog: {} 
                },
                
                kmInicial: opAntiga ? opAntiga.kmInicial : 0,
                kmFinal: opAntiga ? opAntiga.kmFinal : 0,
                dataHoraInicio: opAntiga ? opAntiga.dataHoraInicio : null,

                // Salva Equipe da Tela
                ajudantes: window._operacaoAjudantesTempList || []
            };

            if (idHidden) lista = lista.filter(o => String(o.id) !== String(idHidden));
            lista.push(obj);

            saveData(DB_KEYS.OPERACOES, lista).then(() => {
                formOp.reset(); 
                document.getElementById('operacaoId').value = ''; 
                window._operacaoAjudantesTempList = [];
                document.getElementById('listaAjudantesAdicionados').innerHTML = '';
                
                window.renderOperacaoTable();
                window.renderCheckinsTable();
                window.updateDashboardStats();
                window.renderCalendar();
                
                alert("Operação lançada com sucesso!");
            });
        };
    }

    // --- E. SALVAR CHECK-IN (APP DO MOTORISTA) ---
    const formCheck = document.getElementById('formCheckinConfirm');
    if (formCheck) {
        formCheck.onsubmit = (e) => {
            e.preventDefault();
            const opId = document.getElementById('checkinOpId').value;
            const step = document.getElementById('checkinStep').value;
            
            let lista = loadData(DB_KEYS.OPERACOES);
            let index = lista.findIndex(o => String(o.id) === String(opId));
            if (index < 0) return alert("Erro: Operação não encontrada.");
            
            let op = lista[index];
            const user = loadData(DB_KEYS.FUNCIONARIOS).find(f => 
                f.uid === window.CURRENT_USER.uid || f.email === window.CURRENT_USER.email
            );

            if (!user) return alert("Usuário não identificado.");

            // Motorista
            if (user.funcao === 'motorista') {
                if (step === 'start') {
                    const kmIni = Number(document.getElementById('checkinKmInicial').value);
                    const ultimo = window.obterUltimoKmFinal(op.veiculoPlaca);
                    if (!kmIni || kmIni < ultimo) return alert(`KM Inválido. Deve ser maior que ${ultimo}.`);
                    
                    op.kmInicial = kmIni;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = new Date().toISOString();
                } else {
                    const kmFim = Number(document.getElementById('checkinKmFinal').value);
                    if (!kmFim || kmFim <= op.kmInicial) return alert("KM Final inválido.");
                    
                    op.kmFinal = kmFim;
                    op.kmRodado = kmFim - (op.kmInicial || 0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
                    op.status = 'CONFIRMADA';
                }
            } 
            // Ajudante
            else {
                if (!op.checkins.ajudantes) op.checkins.ajudantes = [];
                if (!op.checkins.ajudantes.includes(String(user.id))) {
                    op.checkins.ajudantes.push(String(user.id));
                    if(!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
                    op.checkins.ajudantesLog[user.id] = new Date().toISOString();
                }
            }
            
            saveData(DB_KEYS.OPERACOES, lista).then(() => {
                window.closeCheckinConfirmModal();
                if(window.renderCheckinsTable) window.renderCheckinsTable();
                alert("Check-in realizado com sucesso!");
            });
        };
    }

    // --- F. SALVAR DESPESA GERAL ---
    const formDesp = document.getElementById('formDespesaGeral');
    if (formDesp) {
        formDesp.onsubmit = (e) => {
            e.preventDefault();
            let lista = loadData(DB_KEYS.DESPESAS_GERAIS);
            
            const obj = {
                id: Date.now(),
                data: document.getElementById('despesaGeralData').value,
                veiculoRef: document.getElementById('selectVeiculoDespesaGeral').value || 'GERAL',
                descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
                valor: Number(document.getElementById('despesaGeralValor').value),
                formaPagamento: document.getElementById('despesaFormaPagamento').value
            };
            
            lista.push(obj);
            saveData(DB_KEYS.DESPESAS_GERAIS, lista).then(() => {
                formDesp.reset();
                window.renderDespesasTable();
                window.updateDashboardStats();
                alert("Despesa lançada!");
            });
        };
    }
    
    // --- G. SALVAR ATIVIDADE ---
    const formAtiv = document.getElementById('formAtividade');
    if (formAtiv) {
        formAtiv.onsubmit = (e) => {
            e.preventDefault();
            let lista = loadData(DB_KEYS.ATIVIDADES);
            const obj = { id: Date.now(), nome: document.getElementById('atividadeNome').value.toUpperCase() };
            lista.push(obj);
            saveData(DB_KEYS.ATIVIDADES, lista).then(() => {
                formAtiv.reset();
                window.populateAllSelects();
                alert("Atividade salva.");
            });
        };
    }
    
    // --- H. SALVAR MINHA EMPRESA ---
    const formEmp = document.getElementById('formMinhaEmpresa');
    if (formEmp) {
        formEmp.onsubmit = (e) => {
            e.preventDefault();
            const obj = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };
            saveData(DB_KEYS.MINHA_EMPRESA, obj).then(() => alert("Dados da empresa atualizados."));
        };
    }
}


// --- 14. FUNÇÕES DE RELATÓRIOS E GRÁFICOS ---

window.generateGeneralReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    
    if(!ini || !fim) return alert("Selecione o período.");

    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const placa = document.getElementById('selectVeiculoRelatorio').value;
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        if (o.data < ini || o.data > fim) return false;
        if (motId && String(o.motoristaId) !== String(motId)) return false;
        if (placa && o.veiculoPlaca !== placa) return false;
        return true;
    });

    let totalFat = 0, totalLucro = 0;
    
    let html = `<h3>RELATÓRIO GERAL (${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')})</h3>`;
    html += `<table class="data-table"><thead><tr><th>DATA</th><th>PLACA</th><th>FATURAMENTO</th><th>LUCRO EST.</th></tr></thead><tbody>`;
    
    ops.forEach(o => {
        const fat = Number(o.faturamento) || 0;
        let custo = window.calcularCustoConsumoViagem(o) + (Number(o.despesas)||0);
        
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao)||0);
        (o.ajudantes||[]).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) custo += (Number(a.diaria)||0);
        });

        const lucro = fat - custo;
        totalFat += fat;
        totalLucro += lucro;

        html += `<tr><td>${o.data.split('-').reverse().join('/')}</td><td>${o.veiculoPlaca}</td><td>${window.formatCurrency(fat)}</td><td>${window.formatCurrency(lucro)}</td></tr>`;
    });

    html += `<tr style="font-weight:bold; background:#eee;"><td colspan="2">TOTAIS</td><td>${window.formatCurrency(totalFat)}</td><td>${window.formatCurrency(totalLucro)}</td></tr></tbody></table>`;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

window.generateReceipt = () => {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;
    
    if(!funcId || !ini || !fim) return alert("Preencha todos os campos.");
    const func = window.getFuncionario(funcId);
    if (!func) return alert("Funcionário inválido.");
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status === 'CONFIRMADA' && o.data >= ini && o.data <= fim);
    
    let total = 0;
    let itensHtml = '';
    
    ops.forEach(o => {
        let val = 0;
        let obs = '';
        
        if (func.funcao === 'motorista' && String(o.motoristaId) === String(funcId)) {
            if (o.checkins?.faltaMotorista) obs = ' (FALTA - R$ 0,00)';
            else val = Number(o.comissao)||0;
        } else if (o.ajudantes) {
            const aj = o.ajudantes.find(a => String(a.id) === String(funcId));
            if (aj) {
                if (o.checkins?.faltasAjudantes?.includes(String(funcId))) obs = ' (FALTA - R$ 0,00)';
                else val = Number(aj.diaria)||0;
            }
        }
        
        if (val > 0 || obs !== '') {
            total += val;
            itensHtml += `<li>${o.data.split('-').reverse().join('/')} - Placa ${o.veiculoPlaca}: <strong>${window.formatCurrency(val)}</strong>${obs}</li>`;
        }
    });
    
    const html = `
        <div style="border:2px dashed #000; padding:30px; background:#fff;">
            <h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>
            <p>Beneficiário: <strong>${func.nome}</strong></p>
            <ul>${itensHtml || '<li>Nenhum valor no período.</li>'}</ul>
            <h3 style="text-align:right;">TOTAL LÍQUIDO: ${window.formatCurrency(total)}</h3>
            <p style="text-align:center; margin-top:40px;">__________________________________<br>Assinatura</p>
        </div>
        <div style="text-align:center; margin-top:10px;"><button class="btn-primary" onclick="window.print()">IMPRIMIR</button></div>
    `;
    
    document.getElementById('reciboContent').innerHTML = html;
};

// ATUALIZAÇÃO DO DASHBOARD (GRÁFICOS)
window.updateDashboardStats = () => {
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const date = window.currentDate || new Date();
    
    const opsMes = ops.filter(o => {
        const d = new Date(o.data);
        return o.status === 'CONFIRMADA' && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });
    
    const fat = opsMes.reduce((acc, o) => acc + (Number(o.faturamento)||0), 0);
    let custo = 0;
    
    opsMes.forEach(o => {
        custo += window.calcularCustoConsumoViagem(o) + (Number(o.despesas)||0);
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao)||0);
        (o.ajudantes||[]).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) custo += (Number(a.diaria)||0);
        });
    });

    const lucro = fat - custo;
    
    document.getElementById('faturamentoMes').textContent = window.formatCurrency(fat);
    document.getElementById('despesasMes').textContent = window.formatCurrency(custo);
    document.getElementById('receitaMes').textContent = window.formatCurrency(lucro);
    
    const ctx = document.getElementById('mainChart');
    if(ctx) {
        if(window.myChartInst) window.myChartInst.destroy();
        window.myChartInst = new Chart(ctx, {
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


// --- 15. INICIALIZAÇÃO E NAVEGAÇÃO ---

// Configuração do Menu Lateral
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const newItem = item.cloneNode(true); // Remove listeners antigos
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', () => {
            const pageId = newItem.getAttribute('data-page');
            
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            newItem.classList.add('active');
            const pageEl = document.getElementById(pageId);
            if(pageEl) pageEl.classList.add('active');
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
            
            if(pageId === 'home') { window.renderCalendar(); window.updateDashboardStats(); }
            if(pageId === 'checkins-pendentes') window.renderCheckinsTable();
        });
    });
    
    // Abas de Cadastro
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });
}

// Inicializa Sistema (Pós Login)
window.initSystemByRole = (user) => {
    window.CURRENT_USER = user;
    
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    
    let startPage = 'home';
    
    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        startPage = 'super-admin';
    } 
    else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        startPage = 'home';
        window.populateAllSelects();
        window.renderCalendar();
        window.updateDashboardStats();
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        startPage = 'employee-home';
        window.IS_READ_ONLY = true;
        window.renderCheckinsTable();
    }
    
    setupNavigation();
    
    // Ativa página inicial
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pInicial = document.getElementById(startPage);
    if(pInicial) pInicial.classList.add('active');
    
    const menuLink = document.querySelector(`.nav-item[data-page="${startPage}"]`);
    if(menuLink) menuLink.classList.add('active');

    // Listeners Firebase
    if (window.dbRef && user.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        Object.values(DB_KEYS).forEach(k => {
            onSnapshot(doc(db, 'companies', user.company, 'data', k), s => {
                if(s.exists()) {
                    APP_CACHE[k] = s.data().items || [];
                    if(k===DB_KEYS.OPERACOES) { 
                        window.renderOperacaoTable(); 
                        window.renderCheckinsTable(); 
                        window.renderCalendar(); 
                        window.updateDashboardStats(); 
                    } else {
                        window.populateAllSelects();
                    }
                }
            });
        });
    }
};

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    if(typeof setupFormHandlers === 'function') setupFormHandlers();
    setupNavigation();
    
    // Mobile
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebarOverlay').classList.add('active');
    });
    
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
    
    // Helper para Ajudante Manual
    window._operacaoAjudantesTempList = [];
    document.getElementById('btnManualAddAjudante')?.addEventListener('click', () => {
        const sel = document.getElementById('selectAjudantesOperacao');
        const id = sel.value;
        if (!id) return alert("Selecione um ajudante.");
        const aj = window.getFuncionario(id);
        const val = prompt(`Valor da diária para ${aj.nome}?`, "0");
        if(val !== null) {
            window._operacaoAjudantesTempList.push({id: id, diaria: Number(val.replace(',','.'))});
            window.renderAjudantesAdicionadosList();
            sel.value = '';
        }
    });
});

window.renderAjudantesAdicionadosList = () => {
    const l = document.getElementById('listaAjudantesAdicionados');
    if(l) l.innerHTML = window._operacaoAjudantesTempList.map(a => `<li>${window.getFuncionario(a.id)?.nome} (R$ ${a.diaria}) <button type="button" class="btn-mini delete-btn" onclick="window._operacaoAjudantesTempList=window._operacaoAjudantesTempList.filter(x=>x.id!='${a.id}');window.renderAjudantesAdicionadosList()">X</button></li>`).join('');
};