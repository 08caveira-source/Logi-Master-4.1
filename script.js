// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0 (RECONSTRUÇÃO COMPLETA E DETALHADA)
// PARTE 1: INFRAESTRUTURA, VARIÁVEIS GLOBAIS, FORMATADORES E CÁLCULOS
// =============================================================================

/**
 * 1. MAPEAMENTO DE CHAVES DO BANCO DE DADOS (LOCAL STORAGE E FIREBASE)
 * Estas constantes definem onde cada tipo de dado é salvo.
 */
const DB_KEYS = {
    FUNCIONARIOS: 'db_funcionarios',
    VEICULOS: 'db_veiculos',
    CONTRATANTES: 'db_contratantes',
    OPERACOES: 'db_operacoes',
    MINHA_EMPRESA: 'db_minha_empresa',
    DESPESAS_GERAIS: 'db_despesas_gerais',
    ATIVIDADES: 'db_atividades',
    CHECKINS: 'db_checkins',            // Armazena logs específicos de check-in
    PROFILE_REQUESTS: 'db_profile_requests' // Armazena pedidos de alteração de dados
};

/**
 * 2. CACHE GLOBAL (ESTADO DA APLICAÇÃO)
 * Carregamos os dados do LocalStorage imediatamente ao iniciar o script
 * para evitar que a tela pisque ou apareça vazia enquanto o Firebase carrega.
 */
const APP_CACHE = {
    [DB_KEYS.FUNCIONARIOS]: [],
    [DB_KEYS.VEICULOS]: [],
    [DB_KEYS.CONTRATANTES]: [],
    [DB_KEYS.OPERACOES]: [],
    [DB_KEYS.MINHA_EMPRESA]: {},
    [DB_KEYS.DESPESAS_GERAIS]: [],
    [DB_KEYS.ATIVIDADES]: [],
    [DB_KEYS.CHECKINS]: [],
    [DB_KEYS.PROFILE_REQUESTS]: []
};

// Inicialização do Cache Local
Object.keys(DB_KEYS).forEach(keyName => {
    const key = DB_KEYS[keyName];
    const savedData = localStorage.getItem(key);
    
    if (savedData) {
        try {
            APP_CACHE[key] = JSON.parse(savedData);
        } catch (e) {
            console.error(`Erro ao ler cache local para ${key}:`, e);
            // Se der erro, define o padrão
            APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
        }
    } else {
        // Se não existir, define o padrão
        APP_CACHE[key] = (key === DB_KEYS.MINHA_EMPRESA) ? {} : [];
    }
});

// Variáveis de Controle de Sessão e Interface
window.IS_READ_ONLY = false; // Define se o usuário pode editar ou apenas ver
window.CURRENT_USER = null;  // Armazena os dados do usuário logado
window.currentDate = new Date(); // Data base para o calendário (Mês Atual)


// =============================================================================
// 3. FUNÇÕES DE ENTRADA E SAÍDA DE DADOS (I/O)
// =============================================================================

/**
 * Função para carregar dados do Cache.
 * Garante que sempre retorne um Array (ou Objeto para Empresa), nunca null.
 */
function loadData(key) {
    if (key === DB_KEYS.MINHA_EMPRESA) {
        return APP_CACHE[key] || {};
    }
    // Para todas as outras chaves, retorna Array
    if (!Array.isArray(APP_CACHE[key])) {
        return [];
    }
    return APP_CACHE[key];
}

/**
 * Função Principal de Salvamento.
 * Salva no LocalStorage (Instantâneo) e no Firebase (Se houver conexão).
 */
async function saveData(key, value) {
    // 1. Atualiza a memória e o armazenamento local do navegador
    APP_CACHE[key] = value;
    localStorage.setItem(key, JSON.stringify(value));

    // 2. Sincronização com Nuvem (Firebase)
    // Só tenta salvar na nuvem se o sistema de banco de dados estiver carregado
    if (window.dbRef && window.CURRENT_USER) {
        
        // Regra de Segurança: Super Admin não altera dados da empresa visualizada
        if (window.CURRENT_USER.email === 'admin@logimaster.com') {
            return; 
        }

        const { db, doc, setDoc } = window.dbRef;
        const companyDomain = window.CURRENT_USER.company; 

        if (companyDomain) {
            try {
                // Salva dentro da coleção da empresa específica
                await setDoc(doc(db, 'companies', companyDomain, 'data', key), { 
                    items: value,
                    lastUpdate: new Date().toISOString()
                });
                // Console log removido para produção, mas o salvamento ocorre aqui.
            } catch (e) {
                console.error(`[ERRO DE SINCRONIZAÇÃO] Falha ao salvar ${key} no Firebase:`, e);
            }
        }
    }
}


// =============================================================================
// 4. FORMATADORES DE TEXTO E MÁSCARAS
// =============================================================================

// Remove tudo que não é dígito
const onlyDigits = (v) => (v || '').toString().replace(/\D/g, '');

// Formata valor monetário (Ex: R$ 1.200,50)
window.formatCurrency = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Formata Data e Hora Brasileira (Ex: 25/12/2023 14:30)
window.formatDateTimeBr = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
};

// Formata CPF ou CNPJ
window.formatCPF_CNPJ = (value) => {
    // Retorna em caixa alta para padronizar
    return (value || '').toUpperCase();
};

// Formata Telefone (Celular e Fixo)
window.formatPhoneBr = (value) => {
    const d = onlyDigits(value);
    if (d.length > 10) { // Celular (11 dígitos)
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
    } else if (d.length > 6) { // Fixo (10 dígitos)
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return value;
};

// Copiar para área de transferência
window.copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
        () => alert('Copiado para a área de transferência!'),
        () => alert('Erro ao copiar.')
    );
};


// =============================================================================
// 5. FUNÇÕES DE BUSCA (GETTERS)
// Funções auxiliares para buscar dados completos a partir de IDs
// =============================================================================

// Helper para converter ID em string segura para comparação
const safeIdStr = (id) => String(id || '').trim();

window.getFuncionario = (id) => {
    const lista = loadData(DB_KEYS.FUNCIONARIOS);
    return lista.find(f => safeIdStr(f.id) === safeIdStr(id));
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
    const lista = loadData(DB_KEYS.VEICULOS);
    return lista.find(v => v.placa === placa);
};

window.getContratante = (cnpj) => {
    const lista = loadData(DB_KEYS.CONTRATANTES);
    return lista.find(c => safeIdStr(c.cnpj) === safeIdStr(cnpj));
};

window.getAtividade = (id) => {
    const lista = loadData(DB_KEYS.ATIVIDADES);
    return lista.find(a => safeIdStr(a.id) === safeIdStr(id));
};

window.getMinhaEmpresa = () => {
    return loadData(DB_KEYS.MINHA_EMPRESA);
};


// =============================================================================
// 6. CÁLCULOS MATEMÁTICOS DE FROTA E CUSTOS
// Lógica crítica para garantir precisão financeira
// =============================================================================

/**
 * OBTER ÚLTIMO KM VÁLIDO:
 * Percorre todas as operações do veículo para achar a maior quilometragem final registrada.
 * Usado para impedir que o motorista digite um KM menor que o anterior.
 */
window.obterUltimoKmFinal = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    
    // Filtra apenas operações deste veículo que tenham KM Final registrado
    const opsVeiculo = todasOps.filter(op => 
        op.veiculoPlaca === placa && 
        op.kmFinal && 
        Number(op.kmFinal) > 0
    );
    
    if (opsVeiculo.length === 0) return 0;
    
    // Retorna o maior valor encontrado
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

/**
 * CALCULAR MÉDIA HISTÓRICA DO VEÍCULO (KM/L):
 * Baseado em todo o histórico de abastecimentos válidos.
 */
window.calcularMediaHistoricaVeiculo = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    
    // Considera apenas operações CONFIRMADAS
    const opsVeiculo = todasOps.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalKmAcumulado = 0;
    let totalLitrosAbastecidos = 0;

    opsVeiculo.forEach(op => {
        if(op.kmRodado && Number(op.kmRodado) > 0) {
            totalKmAcumulado += Number(op.kmRodado);
        }
        
        const vlrCombustivel = Number(op.combustivel) || 0;
        const vlrPreco = Number(op.precoLitro) || 0;
        
        // Se houve abastecimento (Valor > 0 e Preço > 0), calcula litros
        if (vlrCombustivel > 0 && vlrPreco > 0) {
            totalLitrosAbastecidos += (vlrCombustivel / vlrPreco);
        }
    });

    if (totalLitrosAbastecidos <= 0) return 0; 
    
    // Retorna média (Ex: 3.5 km/l)
    return totalKmAcumulado / totalLitrosAbastecidos; 
};

/**
 * OBTER ÚLTIMO PREÇO DO COMBUSTÍVEL:
 * Útil para estimar custos quando não houve abastecimento no dia.
 */
window.obterUltimoPrecoCombustivel = (placa) => {
    if (!placa) return 0;
    const todasOps = loadData(DB_KEYS.OPERACOES);
    
    // Filtra ops com preço de litro válido
    const opsComPreco = todasOps.filter(op => 
        op.veiculoPlaca === placa && op.precoLitro && Number(op.precoLitro) > 0
    );
    
    if (opsComPreco.length === 0) return 0;
    
    // Ordena da mais recente para a mais antiga
    opsComPreco.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    return Number(opsComPreco[0].precoLitro) || 0;
};

/**
 * CUSTO ESTIMADO DA VIAGEM (DIESEL):
 * Se o motorista abasteceu no dia, usa o valor real.
 * Se não abasteceu, estima baseado no KM rodado e na média do veículo.
 */
window.calcularCustoConsumoViagem = (op) => {
    if (!op || !op.veiculoPlaca) return 0;
    if (op.status !== 'CONFIRMADA') return 0;
    
    // 1. Prioridade: Valor Real abastecido na operação
    if (op.combustivel && Number(op.combustivel) > 0) {
        return Number(op.combustivel);
    }
    
    // 2. Estimativa: Baseado em KM Rodado / Média do Veículo
    const kmRodado = Number(op.kmRodado) || 0;
    if (kmRodado <= 0) return 0;
    
    const mediaKmL = window.calcularMediaHistoricaVeiculo(op.veiculoPlaca);
    if (mediaKmL <= 0) return 0;

    // Busca preço do litro (do dia ou histórico)
    let precoParaCalculo = Number(op.precoLitro) || 0;
    if (precoParaCalculo <= 0) {
        precoParaCalculo = window.obterUltimoPrecoCombustivel(op.veiculoPlaca);
    }

    if (precoParaCalculo <= 0) return 0;

    const litrosTeoricos = kmRodado / mediaKmL;
    return litrosTeoricos * precoParaCalculo;
};
// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 10.0
// PARTE 2: INTERFACE DE USUÁRIO (UI) E RENDERIZAÇÃO DE TABELAS
// =============================================================================

// --- 7. RENDERIZAÇÃO DE TABELAS DE CADASTRO (FUNCIONÁRIOS, VEÍCULOS, ETC.) ---

window.renderCadastroTable = (key) => {
    const data = loadData(key);
    let tabelaId = '';
    let idKey = 'id'; // Chave padrão para identificação

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
        // CONVERSÃO DE SEGURANÇA: Garante que o ID seja string para evitar erros no HTML
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
        // Só aparecem se o usuário NÃO for apenas leitura (funcionário comum)
        let actionButtons = '';
        if (!window.IS_READ_ONLY) {
            actionButtons = `
                <button class="btn-mini edit-btn" onclick="editCadastroItem('${key}', '${safeId}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-mini delete-btn" onclick="deleteItem('${key}', '${safeId}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            // Funcionário pode apenas visualizar detalhes
            actionButtons = `
                <button class="btn-mini btn-primary" onclick="viewCadastro('${key}', '${safeId}')" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
            `;
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

// Tabela de Atividades (Separada por ser simples)
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


// --- 8. RENDERIZAÇÃO DA TABELA DE HISTÓRICO DE OPERAÇÕES ---
// Exibe apenas: AGENDADA, EM_ANDAMENTO e CONFIRMADA.
// Oculta FALTAS (que vão para outra lista) e CANCELADAS.

window.renderOperacaoTable = () => {
    const tbody = document.querySelector('#tabelaOperacoes tbody');
    if (!tbody) return;

    // 1. Carrega dados
    const todasOps = loadData(DB_KEYS.OPERACOES);
    
    // 2. Filtra Status permitidos
    const statusPermitidos = ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'];
    
    const opsFiltradas = todasOps.filter(o => statusPermitidos.includes(o.status));

    // 3. Ordena por Data (Mais recente primeiro)
    opsFiltradas.sort((a, b) => new Date(b.data) - new Date(a.data));

    if (opsFiltradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhuma operação no histórico recente.</td></tr>';
        return;
    }

    // 4. Gera HTML
    let html = '';
    opsFiltradas.forEach(op => {
        // Busca nome do motorista para exibir (em vez do ID)
        const motoristaObj = window.getMotorista(op.motoristaId);
        const nomeMot = motoristaObj ? motoristaObj.nome : '(Motorista não encontrado)';
        
        // Cria o Badge colorido de status
        let statusBadge = '';
        if (op.status === 'CONFIRMADA') {
            statusBadge = '<span class="status-pill pill-active">CONFIRMADA</span>';
        } else if (op.status === 'AGENDADA') {
            statusBadge = '<span class="status-pill pill-pending">AGENDADA</span>';
        } else if (op.status === 'EM_ANDAMENTO') {
            statusBadge = '<span class="status-pill" style="background:var(--info-color)">EM ANDAMENTO</span>';
        }

        // Botões
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


// --- 9. MONITORAMENTO DE ROTAS E LISTA DE FALTAS ---
// Esta é a função complexa que divide a visualização em duas tabelas.

window.renderCheckinsTable = () => {
    const tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    const tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    if (!tbodyAtivos) return;

    // Carrega todas as operações
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => o.status !== 'CANCELADA');
    
    // =========================================================================
    // PARTE A: ROTAS ATIVAS (AGENDADAS / EM ANDAMENTO / CONFIRMADAS RECENTES)
    // =========================================================================
    
    // Filtro de tempo: Não mostrar confirmadas muito antigas (ex: > 5 dias) no monitoramento
    const dataLimiteAntigas = new Date();
    dataLimiteAntigas.setDate(dataLimiteAntigas.getDate() - 5);
    const strDataLimite = dataLimiteAntigas.toISOString().split('T')[0];

    const rotasAtivas = ops.filter(op => {
        // Se já foi confirmada e é antiga, esconde
        if (op.status === 'CONFIRMADA' && op.data < strDataLimite) return false;
        
        // Se o MOTORISTA faltou, esta rota não está ativa, está na lista de faltas
        if (op.checkins && op.checkins.faltaMotorista) return false;

        return true;
    });

    // Ordena: Em Andamento > Agendada > Confirmada
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

        // Botões de Intervenção (Admin)
        let botoesAdmin = '';
        if (!window.IS_READ_ONLY && op.status !== 'CONFIRMADA') {
            botoesAdmin = `
                <button class="btn-mini btn-success" title="Forçar Início/Presença" onclick="forceCheckin('${op.id}', 'motorista', '${op.motoristaId}')">
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
                <td>
                    Op #${op.id}<br>
                    <small>${op.veiculoPlaca}</small>
                </td>
                <td>${nomeMot} <small style="color:#666">(MOTORISTA)</small></td>
                <td>${op.status}</td>
                <td>${statusMot}</td>
                <td>${botoesAdmin}</td>
            </tr>
        `;

        // --- 2. LINHAS DOS AJUDANTES ---
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(aj => {
                // Verifica se este ajudante específico faltou. Se sim, não mostra aqui (vai pra lista de faltas)
                if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(aj.id))) {
                    return; // Pula este ajudante nesta lista
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
            // Verifica Falta do Motorista
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

            // Verifica Faltas de Ajudantes
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

// --- 11. ATUALIZAÇÃO DE SELECTS (Dropdowns) ---
// Preenche todas as listas suspensas do sistema
window.populateAllSelects = () => {
    // Carrega dados
    const motoristas = loadData(DB_KEYS.FUNCIONARIOS).filter(f => f.funcao === 'motorista');
    const ajudantes = loadData(DB_KEYS.FUNCIONARIOS).filter(f => f.funcao === 'ajudante');
    const veiculos = loadData(DB_KEYS.VEICULOS);
    const contratantes = loadData(DB_KEYS.CONTRATANTES);
    const atividades = loadData(DB_KEYS.ATIVIDADES);

    // Função auxiliar para preencher um select
    const fill = (id, dataArray, valKey, textKey, defaultOption) => {
        const el = document.getElementById(id); 
        if(el) { 
            const currentVal = el.value;
            el.innerHTML = `<option value="">${defaultOption}</option>` + 
                           dataArray.map(i => `<option value="${i[valKey]}">${i[textKey]}</option>`).join(''); 
            if(currentVal) el.value = currentVal; // Tenta manter seleção
        }
    };

    // Preenchimento
    fill('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    fill('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    fill('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    fill('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE...');
    fill('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'SELECIONE UM AJUDANTE...');
    
    fill('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR PLACA (OPCIONAL)...');
    fill('selectMotoristaRelatorio', motoristas, 'id', 'nome', 'TODOS OS MOTORISTAS');
    fill('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    fill('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');

    // Select de Recibos (Todos os funcionários)
    const selRecibo = document.getElementById('selectMotoristaRecibo');
    if (selRecibo) {
        const allFuncs = loadData(DB_KEYS.FUNCIONARIOS);
        selRecibo.innerHTML = '<option value="">SELECIONE O FUNCIONÁRIO...</option>';
        allFuncs.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.funcao.toUpperCase()} - ${f.nome}`;
            selRecibo.appendChild(opt);
        });
    }

    // Atualiza visualização das tabelas
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
// VERSÃO: 10.0
// PARTE 3: CALENDÁRIO, AÇÕES DE EDIÇÃO (CRUD) E GESTÃO DE EQUIPE
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
            
            // Calcula faturamento total do dia para exibir no calendário
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
    window.updateDashboardStats(); // Atualiza gráficos ao mudar o mês
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

    document.getElementById('modalDayTitle').textContent = `DIA ${dataStr.split('-').reverse().join('/')}`;
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
    if(!confirm("Deseja remover esta falta? O funcionário voltará a ter direito ao pagamento desta operação.")) return;
    
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
// VERSÃO: 10.0
// PARTE 4: FORMULÁRIOS, RELATÓRIOS, GRÁFICOS E INICIALIZAÇÃO
// =============================================================================

// --- 13. GERENCIAMENTO DE FORMULÁRIOS (SALVAR DADOS) ---

function setupFormHandlers() {

    // --- A. SALVAR FUNCIONÁRIO ---
    const formFunc = document.getElementById('formFuncionario');
    if (formFunc) {
        formFunc.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = formFunc.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerText;
            btnSubmit.innerText = "SALVANDO...";
            btnSubmit.disabled = true;

            try {
                const idHidden = document.getElementById('funcionarioId').value;
                const email = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senha = document.getElementById('funcSenha').value;
                const funcao = document.getElementById('funcFuncao').value;
                
                // Carrega lista atual
                let listaFuncionarios = loadData(DB_KEYS.FUNCIONARIOS);
                
                // Verifica duplicidade de e-mail (se for novo)
                if (!idHidden && listaFuncionarios.some(f => f.email === email)) {
                    throw new Error("Este e-mail já está cadastrado para outro funcionário.");
                }

                let newId = idHidden ? idHidden : String(Date.now());
                let novoUid = null;

                // --- CRIAÇÃO DE USUÁRIO NO FIREBASE (AUTH) ---
                if (window.dbRef && !idHidden && senha) {
                    if (senha.length < 6) throw new Error("A senha deve ter no mínimo 6 dígitos.");
                    
                    const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                    
                    // Usa app secundário para não deslogar o admin atual
                    const auth2 = getAuth(secondaryApp);
                    const userCredential = await createUserWithEmailAndPassword(auth2, email, senha);
                    novoUid = userCredential.user.uid;
                    
                    // Salva perfil de acesso na coleção 'users'
                    await setDoc(doc(db, "users", novoUid), {
                        uid: novoUid,
                        name: document.getElementById('funcNome').value.toUpperCase(),
                        email: email,
                        role: funcao,
                        company: window.CURRENT_USER.company,
                        approved: true,
                        createdAt: new Date().toISOString()
                    });
                    
                    await signOut(auth2); // Desloga o secundário
                }

                // Monta o objeto Funcionário
                const objFuncionario = {
                    id: newId,
                    // Se for edição, mantém o UID antigo. Se novo, usa o criado.
                    uid: novoUid || (idHidden ? (listaFuncionarios.find(f => String(f.id) === String(idHidden))?.uid || '') : ''),
                    
                    nome: document.getElementById('funcNome').value.toUpperCase(),
                    funcao: funcao,
                    email: email,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    
                    // Campos exclusivos de Motorista
                    cnh: document.getElementById('funcCNH').value.toUpperCase(),
                    validadeCNH: document.getElementById('funcValidadeCNH').value,
                    categoriaCNH: document.getElementById('funcCategoriaCNH').value,
                    cursoDescricao: document.getElementById('funcCursoDescricao').value.toUpperCase()
                };

                // Atualiza (se existir) ou Adiciona (se novo)
                if (idHidden) {
                    const index = listaFuncionarios.findIndex(f => String(f.id) === String(idHidden));
                    if (index >= 0) listaFuncionarios[index] = objFuncionario;
                } else {
                    listaFuncionarios.push(objFuncionario);
                }

                await saveData(DB_KEYS.FUNCIONARIOS, listaFuncionarios);
                
                // Limpa e reseta
                formFunc.reset();
                document.getElementById('funcionarioId').value = '';
                window.populateAllSelects(); // Atualiza listas
                alert("Funcionário salvo com sucesso!");

            } catch (err) {
                console.error(err);
                alert("Erro ao salvar: " + err.message);
            } finally {
                btnSubmit.innerText = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    // --- B. SALVAR VEÍCULO ---
    const formVeic = document.getElementById('formVeiculo');
    if (formVeic) {
        formVeic.addEventListener('submit', (e) => {
            e.preventDefault();
            const placa = document.getElementById('veiculoPlaca').value.toUpperCase();
            if (!placa) return alert("A Placa é obrigatória.");

            let listaVeiculos = loadData(DB_KEYS.VEICULOS);
            const idHidden = document.getElementById('veiculoId').value;

            // Se mudou a placa na edição, remove a antiga para não duplicar
            if (idHidden && idHidden !== placa) {
                listaVeiculos = listaVeiculos.filter(v => v.placa !== idHidden);
            }
            
            const objVeiculo = {
                placa: placa,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value
            };

            const index = listaVeiculos.findIndex(v => v.placa === placa);
            if (index >= 0) listaVeiculos[index] = objVeiculo;
            else listaVeiculos.push(objVeiculo);

            saveData(DB_KEYS.VEICULOS, listaVeiculos).then(() => {
                formVeic.reset();
                document.getElementById('veiculoId').value = '';
                window.populateAllSelects();
                alert("Veículo salvo com sucesso!");
            });
        });
    }

    // --- C. SALVAR CONTRATANTE ---
    const formCli = document.getElementById('formContratante');
    if (formCli) {
        formCli.addEventListener('submit', (e) => {
            e.preventDefault();
            const cnpj = document.getElementById('contratanteCNPJ').value.replace(/\D/g, '');
            if (!cnpj) return alert("CNPJ é obrigatório.");

            let lista = loadData(DB_KEYS.CONTRATANTES);
            const idHidden = document.getElementById('contratanteId').value;

            if (idHidden && String(idHidden) !== String(cnpj)) {
                lista = lista.filter(c => String(c.cnpj) !== String(idHidden));
            }

            const obj = {
                cnpj: cnpj,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };
            
            const index = lista.findIndex(c => String(c.cnpj) === String(cnpj));
            if (index >= 0) lista[index] = obj;
            else lista.push(obj);

            saveData(DB_KEYS.CONTRATANTES, lista).then(() => {
                formCli.reset();
                document.getElementById('contratanteId').value = '';
                window.populateAllSelects();
                alert("Contratante salvo!");
            });
        });
    }

    // --- D. SALVAR OPERAÇÃO (LANÇAMENTO PRINCIPAL) ---
    const formOp = document.getElementById('formOperacao');
    if (formOp) {
        formOp.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const motId = document.getElementById('selectMotoristaOperacao').value;
            const veicPlaca = document.getElementById('selectVeiculoOperacao').value;
            
            if (!motId || !veicPlaca) return alert("Selecione obrigatoriamente um Motorista e um Veículo.");
            
            // Verifica CNH
            window.verificarValidadeCNH(motId);

            const idHidden = document.getElementById('operacaoId').value;
            let listaOps = loadData(DB_KEYS.OPERACOES);
            
            // Verifica se é edição e recupera dados antigos para não perder histórico
            let opExistente = idHidden ? listaOps.find(o => String(o.id) === String(idHidden)) : null;

            // Define Status
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            let novoStatus = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            // Se estava em andamento, mantém em andamento para não travar o motorista
            if (opExistente && opExistente.status === 'EM_ANDAMENTO') {
                novoStatus = 'EM_ANDAMENTO';
            }

            const objOperacao = {
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
                
                // Dados de Rodagem
                combustivel: Number(document.getElementById('operacaoCombustivel').value),
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
                kmRodado: Number(document.getElementById('operacaoKmRodado').value),

                status: novoStatus,
                
                // Preserva a estrutura de Check-in ou cria nova
                checkins: opExistente ? opExistente.checkins : { 
                    motorista: false, 
                    ajudantes: [], 
                    faltasAjudantes: [], 
                    faltaMotorista: false,
                    ajudantesLog: {} 
                },
                
                // Preserva KM Inicial/Final se já existiam
                kmInicial: opExistente ? opExistente.kmInicial : 0,
                kmFinal: opExistente ? opExistente.kmFinal : 0,
                dataHoraInicio: opExistente ? opExistente.dataHoraInicio : null,

                // Salva a lista de ajudantes que está na tela (array temporário)
                ajudantes: window._operacaoAjudantesTempList || []
            };

            // Remove a antiga se for edição
            if (idHidden) {
                listaOps = listaOps.filter(o => String(o.id) !== String(idHidden));
            }
            // Adiciona a nova
            listaOps.push(objOperacao);

            saveData(DB_KEYS.OPERACOES, listaOps).then(() => {
                formOp.reset(); 
                document.getElementById('operacaoId').value = ''; 
                window._operacaoAjudantesTempList = []; // Limpa lista temp
                document.getElementById('listaAjudantesAdicionados').innerHTML = '';
                
                // Atualiza tudo
                window.renderOperacaoTable();
                window.renderCheckinsTable();
                window.updateDashboardStats();
                window.renderCalendar();
                
                alert("Operação lançada com sucesso!");
            });
        });
    }

    // --- E. SALVAR CHECK-IN (MODAL) ---
    const formCheck = document.getElementById('formCheckinConfirm');
    if (formCheck) {
        formCheck.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const opId = document.getElementById('checkinOpId').value;
            const step = document.getElementById('checkinStep').value; // 'start' ou 'end'
            
            let listaOps = loadData(DB_KEYS.OPERACOES);
            let index = listaOps.findIndex(o => String(o.id) === String(opId));
            
            if (index < 0) return alert("Operação não encontrada ou removida.");
            
            let op = listaOps[index];
            
            // Identifica o funcionário logado
            const user = loadData(DB_KEYS.FUNCIONARIOS).find(f => 
                f.uid === window.CURRENT_USER.uid || f.email === window.CURRENT_USER.email
            );
            
            if (!user) return alert("Erro de perfil de usuário.");

            // Lógica para MOTORISTA
            if (user.funcao === 'motorista') {
                if (step === 'start') {
                    const kmIni = Number(document.getElementById('checkinKmInicial').value);
                    if (!kmIni) return alert("Informe o KM do painel.");
                    
                    const ultimo = window.obterUltimoKmFinal(op.veiculoPlaca);
                    if (kmIni < ultimo) return alert(`KM inválido! O odômetro não pode ser menor que ${ultimo}.`);

                    op.kmInicial = kmIni;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = new Date().toISOString();
                } else {
                    const kmFim = Number(document.getElementById('checkinKmFinal').value);
                    if (!kmFim || kmFim <= op.kmInicial) return alert("KM Final deve ser maior que o Inicial.");
                    
                    op.kmFinal = kmFim;
                    op.kmRodado = kmFim - (op.kmInicial || 0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
                    op.status = 'CONFIRMADA';
                }
            } 
            // Lógica para AJUDANTE
            else {
                if (!op.checkins.ajudantes) op.checkins.ajudantes = [];
                // Evita duplicar ID
                if (!op.checkins.ajudantes.includes(String(user.id))) {
                    op.checkins.ajudantes.push(String(user.id));
                    if (!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
                    op.checkins.ajudantesLog[user.id] = new Date().toISOString();
                }
            }
            
            saveData(DB_KEYS.OPERACOES, listaOps).then(() => {
                window.closeCheckinConfirmModal();
                if(window.renderCheckinsTable) window.renderCheckinsTable();
                alert("Registro salvo com sucesso!");
            });
        });
    }
}


// --- 14. RELATÓRIOS E RECIBOS ---

// GERA RELATÓRIO GERAL (Tabela HTML)
window.generateGeneralReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const motId = document.getElementById('selectMotoristaRelatorio').value;
    const placa = document.getElementById('selectVeiculoRelatorio').value;
    const cnpj = document.getElementById('selectContratanteRelatorio').value;

    if (!ini || !fim) return alert("Selecione a Data Inicial e Final.");

    const ops = loadData(DB_KEYS.OPERACOES).filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        if (o.data < ini || o.data > fim) return false;
        if (motId && String(o.motoristaId) !== String(motId)) return false;
        if (placa && o.veiculoPlaca !== placa) return false;
        if (cnpj && String(o.contratanteCNPJ) !== String(cnpj)) return false;
        return true;
    });

    let html = `
        <div style="text-align:center; margin-bottom:20px;">
            <h3>RELATÓRIO GERAL DE OPERAÇÕES</h3>
            <small>Período: ${ini.split('-').reverse().join('/')} até ${fim.split('-').reverse().join('/')}</small>
        </div>
        <table class="data-table" style="width:100%; border-collapse:collapse;">
            <thead>
                <tr style="background:#eee;">
                    <th>DATA</th>
                    <th>PLACA</th>
                    <th>CLIENTE</th>
                    <th>FATURAMENTO</th>
                    <th>CUSTOS</th>
                    <th>LUCRO</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let totalFat = 0;
    let totalLucro = 0;

    ops.forEach(o => {
        const fat = Number(o.faturamento) || 0;
        
        // Calcula custos considerando faltas
        let custo = window.calcularCustoConsumoViagem(o) + (Number(o.despesas) || 0);
        
        if(!o.checkins?.faltaMotorista) custo += (Number(o.comissao) || 0);
        
        (o.ajudantes || []).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) {
                custo += (Number(a.diaria) || 0);
            }
        });

        const lucro = fat - custo;
        totalFat += fat;
        totalLucro += lucro;

        html += `
            <tr style="border-bottom:1px solid #ddd;">
                <td>${o.data.split('-').reverse().join('/')}</td>
                <td>${o.veiculoPlaca}</td>
                <td>${window.getContratante(o.contratanteCNPJ)?.razaoSocial || '-'}</td>
                <td>${window.formatCurrency(fat)}</td>
                <td>${window.formatCurrency(custo)}</td>
                <td style="color:${lucro >= 0 ? 'green' : 'red'}; font-weight:bold;">${window.formatCurrency(lucro)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot>
                <tr style="background:#263238; color:white; font-weight:bold;">
                    <td colspan="3" style="padding:10px;">TOTAIS GERAIS</td>
                    <td>${window.formatCurrency(totalFat)}</td>
                    <td>-</td>
                    <td>${window.formatCurrency(totalLucro)}</td>
                </tr>
            </tfoot>
        </table>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// GERA RELATÓRIO DE COBRANÇA (Fatura)
window.generateBillingReport = () => {
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;
    const cnpj = document.getElementById('selectContratanteRelatorio').value;
    
    if(!cnpj) return alert("Selecione um Cliente para gerar a cobrança.");
    if(!ini || !fim) return alert("Selecione o período.");
    
    const cliente = window.getContratante(cnpj);
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.contratanteCNPJ === cnpj && 
        o.status === 'CONFIRMADA' && 
        o.data >= ini && o.data <= fim
    );
    
    let total = 0;
    
    let html = `
        <div style="padding:30px; border:1px solid #333;">
            <h2 style="text-align:center;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</h2>
            <hr>
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <div>
                    <strong>DE:</strong> ${window.getMinhaEmpresa()?.razaoSocial || 'MINHA TRANSPORTADORA'}<br>
                    <strong>PARA:</strong> ${cliente?.razaoSocial || cnpj}
                </div>
                <div style="text-align:right;">
                    <strong>EMISSÃO:</strong> ${new Date().toLocaleDateString()}<br>
                    <strong>PERÍODO:</strong> ${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}
                </div>
            </div>
            
            <table style="width:100%; border-collapse:collapse; margin-top:20px;">
                <thead>
                    <tr style="border-bottom:2px solid #000;">
                        <th style="text-align:left;">DATA</th>
                        <th style="text-align:left;">VEÍCULO</th>
                        <th style="text-align:left;">SERVIÇO</th>
                        <th style="text-align:right;">VALOR</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    ops.forEach(o => {
        total += (Number(o.faturamento) || 0);
        html += `
            <tr style="border-bottom:1px solid #ccc;">
                <td style="padding:8px 0;">${o.data.split('-').reverse().join('/')}</td>
                <td>${o.veiculoPlaca}</td>
                <td>${window.getAtividade(o.atividadeId)?.nome || 'FRETE / TRANSPORTE'}</td>
                <td style="text-align:right;">${window.formatCurrency(o.faturamento)}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <h3 style="text-align:right; margin-top:30px;">TOTAL A PAGAR: ${window.formatCurrency(total)}</h3>
        </div>
    `;
    
    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// EXPORTAR PDF
window.exportReportToPDF = () => {
    const element = document.getElementById('reportContent');
    if (!element || element.innerText.trim() === '') return alert("Gere um relatório primeiro.");
    
    const opt = {
        margin: 10,
        filename: 'relatorio_logimaster.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};

// GERA RECIBO DE PAGAMENTO
window.generateReceipt = () => {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const ini = document.getElementById('dataInicioRecibo').value;
    const fim = document.getElementById('dataFimRecibo').value;
    
    if(!funcId || !ini || !fim) return alert("Preencha funcionário e datas.");
    
    const func = window.getFuncionario(funcId);
    if (!func) return alert("Funcionário inválido.");
    
    const ops = loadData(DB_KEYS.OPERACOES).filter(o => 
        o.status === 'CONFIRMADA' && o.data >= ini && o.data <= fim
    );
    
    let total = 0;
    let itensHtml = '';
    
    ops.forEach(o => {
        let valor = 0;
        let obs = '';
        
        // Verifica se é motorista desta op
        if (func.funcao === 'motorista' && String(o.motoristaId) === String(funcId)) {
            if (o.checkins && o.checkins.faltaMotorista) {
                obs = ' <span style="color:red">(FALTA - R$ 0,00)</span>';
                valor = 0;
            } else {
                valor = Number(o.comissao) || 0;
            }
        } 
        // Verifica se é ajudante desta op
        else if (o.ajudantes) {
            const aj = o.ajudantes.find(a => String(a.id) === String(funcId));
            if (aj) {
                if (o.checkins && o.checkins.faltasAjudantes && o.checkins.faltasAjudantes.includes(String(funcId))) {
                    obs = ' <span style="color:red">(FALTA - R$ 0,00)</span>';
                    valor = 0;
                } else {
                    valor = Number(aj.diaria) || 0;
                }
            }
        }
        
        if (valor > 0 || obs !== '') {
            total += valor;
            itensHtml += `<li>${o.data.split('-').reverse().join('/')} - Placa ${o.veiculoPlaca}: <strong>${window.formatCurrency(valor)}</strong>${obs}</li>`;
        }
    });
    
    const html = `
        <div style="border:2px dashed #000; padding:40px; background:#fff; margin:20px 0;">
            <h1 style="text-align:center; margin-bottom:30px;">RECIBO DE PAGAMENTO</h1>
            <p style="font-size:1.1rem;">
                Recebi de <strong>${window.getMinhaEmpresa()?.razaoSocial || 'EMPRESA'}</strong> a importância de 
                <strong style="background:#eee; padding:5px;">${window.formatCurrency(total)}</strong> referente aos serviços prestados abaixo:
            </p>
            <ul style="line-height:1.8; margin:20px 0; border-top:1px solid #eee; padding-top:20px;">
                ${itensHtml || '<li>Nenhum serviço remunerado no período.</li>'}
            </ul>
            <div style="text-align:center; margin-top:50px;">
                ______________________________________<br>
                <strong>${func.nome}</strong><br>
                CPF: ${func.documento}<br>
                Data: ${new Date().toLocaleDateString()}
            </div>
        </div>
        <div style="text-align:center;">
            <button class="btn-primary" onclick="window.print()"><i class="fas fa-print"></i> IMPRIMIR RECIBO</button>
        </div>
    `;
    
    document.getElementById('reciboContent').innerHTML = html;
};


// --- 15. DASHBOARD E GRÁFICOS ---

window.updateDashboardStats = () => {
    // Apenas Admin vê dashboard
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;
    
    const ops = loadData(DB_KEYS.OPERACOES);
    const date = window.currentDate || new Date(); // Data do calendário
    
    // Filtra operações CONFIRMADAS do mês exibido no calendário
    const opsMes = ops.filter(o => {
        if (o.status !== 'CONFIRMADA') return false;
        const d = new Date(o.data);
        // Ajuste simples de fuso horário pegando partes da data
        const [ano, mes, dia] = o.data.split('-');
        return Number(mes) === (date.getMonth() + 1) && Number(ano) === date.getFullYear();
    });

    let fatTotal = 0;
    let custoTotal = 0;
    
    opsMes.forEach(o => {
        fatTotal += (Number(o.faturamento) || 0);
        
        let cDiesel = window.calcularCustoConsumoViagem(o);
        let cOutros = Number(o.despesas) || 0;
        let cPessoal = 0;
        
        if(!o.checkins?.faltaMotorista) cPessoal += (Number(o.comissao) || 0);
        (o.ajudantes || []).forEach(a => {
            if(!o.checkins?.faltasAjudantes?.includes(String(a.id))) cPessoal += (Number(a.diaria) || 0);
        });
        
        custoTotal += (cDiesel + cOutros + cPessoal);
    });

    const lucroLiquido = fatTotal - custoTotal;
    
    // Atualiza cards
    const elFat = document.getElementById('faturamentoMes');
    const elDesp = document.getElementById('despesasMes');
    const elLucro = document.getElementById('receitaMes');
    
    if(elFat) elFat.textContent = window.formatCurrency(fatTotal);
    if(elDesp) elDesp.textContent = window.formatCurrency(custoTotal);
    if(elLucro) {
        elLucro.textContent = window.formatCurrency(lucroLiquido);
        elLucro.style.color = lucroLiquido >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    }

    // Renderiza Gráfico
    const ctx = document.getElementById('mainChart');
    if (ctx) {
        if (window.myChartInstance) window.myChartInstance.destroy();

        window.myChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['RECEITA', 'CUSTOS', 'LUCRO'],
                datasets: [{
                    label: 'Valores do Mês (R$)',
                    data: [fatTotal, custoTotal, lucroLiquido],
                    backgroundColor: [
                        '#00796b', // Receita (Verde)
                        '#c62828', // Custo (Vermelho)
                        lucroLiquido >= 0 ? '#2e7d32' : '#d32f2f' // Lucro
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
};


// --- 16. INICIALIZAÇÃO E BOOTSTRAP ---

/**
 * Função chamada pelo index.html quando o Firebase autentica o usuário.
 * Define o que aparece na tela (Admin vs Funcionário).
 */
window.initSystemByRole = (user) => {
    window.CURRENT_USER = user;
    
    // Esconde todos os menus primeiro
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';
    
    // Lógica de Perfil
    if (user.email === 'admin@logimaster.com') {
        // SUPER ADMIN
        document.getElementById('menu-super-admin').style.display = 'block';
        document.getElementById('super-admin').classList.add('active');
        
    } else if (user.role === 'admin') {
        // ADMINISTRADOR DA EMPRESA
        document.getElementById('menu-admin').style.display = 'block';
        document.getElementById('home').classList.add('active');
        
        // Inicializa dados e tela
        window.populateAllSelects();
        window.renderCalendar();
        window.updateDashboardStats();
        window.renderCheckinsTable();
        
    } else {
        // FUNCIONÁRIO (MOTORISTA/AJUDANTE)
        document.getElementById('menu-employee').style.display = 'block';
        document.getElementById('employee-home').classList.add('active');
        window.IS_READ_ONLY = true;
        
        // Funcionário também vê o monitoramento (seus check-ins)
        window.renderCheckinsTable();
        if(window.renderEmployeeProfileView) window.renderEmployeeProfileView();
    }

    // Inicia ouvintes de banco de dados em tempo real (Firebase)
    if (window.dbRef && user.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        const companyDomain = user.company;
        
        Object.values(DB_KEYS).forEach(key => {
            onSnapshot(doc(db, 'companies', companyDomain, 'data', key), (docSnap) => {
                if (docSnap.exists()) {
                    APP_CACHE[key] = docSnap.data().items || [];
                    
                    // Reações automáticas a mudanças
                    if (key === DB_KEYS.OPERACOES) {
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

// LISTENERS DE INICIALIZAÇÃO DO DOM
document.addEventListener('DOMContentLoaded', () => {
    // Configura os formulários
    if (typeof setupFormHandlers === 'function') {
        setupFormHandlers();
    }
    
    // Menu Mobile
    const btnMobile = document.getElementById('mobileMenuBtn');
    if(btnMobile) {
        btnMobile.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('active');
        });
    }
    
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Helper para Adicionar Ajudante Manualmente na Tela de Operação
    const btnAddAj = document.getElementById('btnManualAddAjudante');
    if(btnAddAj) {
        btnAddAj.addEventListener('click', window.handleManualAddAjudante);
    }
});

// Helper: Adicionar Ajudante à Lista Temporária
window._operacaoAjudantesTempList = [];
window.handleManualAddAjudante = () => {
    const sel = document.getElementById('selectAjudantesOperacao');
    const id = sel.value;
    if (!id) return alert("Selecione um ajudante na lista.");
    
    const func = window.getFuncionario(id);
    const valor = prompt(`Qual o valor da diária para ${func.nome}?`, "0");
    
    if (valor !== null) {
        window._operacaoAjudantesTempList.push({
            id: id,
            diaria: Number(valor.replace(',', '.'))
        });
        window.renderAjudantesAdicionadosList();
        sel.value = ''; // Limpa seleção
    }
};

window.renderAjudantesAdicionadosList = () => {
    const list = document.getElementById('listaAjudantesAdicionados');
    if (!list) return;
    
    list.innerHTML = window._operacaoAjudantesTempList.map(item => {
        const f = window.getFuncionario(item.id);
        const nome = f ? f.nome : 'Desconhecido';
        return `
            <li>
                ${nome} (R$ ${window.formatCurrency(item.diaria)})
                <button type="button" class="btn-mini delete-btn" 
                    onclick="window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => x.id !== '${item.id}'); window.renderAjudantesAdicionadosList();">
                    <i class="fas fa-times"></i>
                </button>
            </li>
        `;
    }).join('');
};