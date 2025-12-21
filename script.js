// =============================================================================
// NOME DO ARQUIVO: script.js
// VERSÃO: 16.0 (RESTAURAÇÃO COMPLETA - MODELO EXTENSO E EXPLÍCITO)
// PARTE 1: INFRAESTRUTURA, VARIÁVEIS GLOBAIS E UTILITÁRIOS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES E CHAVES DE BANCO DE DADOS
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE CONTROLE DE SESSÃO
// -----------------------------------------------------------------------------

// Define se o usuário atual tem permissão apenas de leitura
window.IS_READ_ONLY = false;

// Armazena o objeto do usuário logado atualmente
window.CURRENT_USER = null;

// Armazena a data atual selecionada no calendário (padrão: hoje)
window.currentDate = new Date();

// Cache global para evitar leituras repetitivas no LocalStorage
const APP_CACHE = {
    funcionarios: [],
    veiculos: [],
    contratantes: [],
    operacoes: [],
    minhaEmpresa: {},
    despesas: [],
    atividades: [],
    checkins: []
};

// -----------------------------------------------------------------------------
// 3. INICIALIZAÇÃO DO CACHE (CARREGAMENTO SÍNCRONO)
// -----------------------------------------------------------------------------

// Carrega Funcionários
try {
    const saved = localStorage.getItem(DB_KEYS.FUNCIONARIOS);
    APP_CACHE.funcionarios = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Funcionários:", e);
    APP_CACHE.funcionarios = [];
}

// Carrega Veículos
try {
    const saved = localStorage.getItem(DB_KEYS.VEICULOS);
    APP_CACHE.veiculos = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Veículos:", e);
    APP_CACHE.veiculos = [];
}

// Carrega Contratantes
try {
    const saved = localStorage.getItem(DB_KEYS.CONTRATANTES);
    APP_CACHE.contratantes = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Contratantes:", e);
    APP_CACHE.contratantes = [];
}

// Carrega Operações
try {
    const saved = localStorage.getItem(DB_KEYS.OPERACOES);
    APP_CACHE.operacoes = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Operações:", e);
    APP_CACHE.operacoes = [];
}

// Carrega Minha Empresa
try {
    const saved = localStorage.getItem(DB_KEYS.MINHA_EMPRESA);
    APP_CACHE.minhaEmpresa = saved ? JSON.parse(saved) : {};
} catch (e) {
    console.error("Erro ao carregar Minha Empresa:", e);
    APP_CACHE.minhaEmpresa = {};
}

// Carrega Despesas Gerais
try {
    const saved = localStorage.getItem(DB_KEYS.DESPESAS_GERAIS);
    APP_CACHE.despesas = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Despesas:", e);
    APP_CACHE.despesas = [];
}

// Carrega Atividades
try {
    const saved = localStorage.getItem(DB_KEYS.ATIVIDADES);
    APP_CACHE.atividades = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Erro ao carregar Atividades:", e);
    APP_CACHE.atividades = [];
}

// -----------------------------------------------------------------------------
// 4. FUNÇÕES DE SUPORTE A BANCO DE DADOS (HELPER FUNCTIONS)
// -----------------------------------------------------------------------------

/**
 * Função auxiliar para salvar dados no LocalStorage e no Firebase.
 * Esta é a única função genérica que manteremos para a camada de transporte.
 */
async function persistirDados(chave, dados) {
    // 1. Atualiza Cache Local
    if (chave === DB_KEYS.FUNCIONARIOS) APP_CACHE.funcionarios = dados;
    if (chave === DB_KEYS.VEICULOS) APP_CACHE.veiculos = dados;
    if (chave === DB_KEYS.CONTRATANTES) APP_CACHE.contratantes = dados;
    if (chave === DB_KEYS.OPERACOES) APP_CACHE.operacoes = dados;
    if (chave === DB_KEYS.MINHA_EMPRESA) APP_CACHE.minhaEmpresa = dados;
    if (chave === DB_KEYS.DESPESAS_GERAIS) APP_CACHE.despesas = dados;
    if (chave === DB_KEYS.ATIVIDADES) APP_CACHE.atividades = dados;

    // 2. Salva no LocalStorage
    localStorage.setItem(chave, JSON.stringify(dados));

    // 3. Sincroniza com Firebase (apenas se usuário tiver empresa definida e não for super-admin)
    if (window.dbRef && window.CURRENT_USER && window.CURRENT_USER.email !== 'admin@logimaster.com') {
        const { db, doc, setDoc } = window.dbRef;
        const dominioEmpresa = window.CURRENT_USER.company;
        
        if (dominioEmpresa) {
            try {
                await setDoc(doc(db, 'companies', dominioEmpresa, 'data', chave), { 
                    items: dados,
                    lastUpdate: new Date().toISOString()
                });
            } catch (erro) {
                console.error(`Erro crítico ao sincronizar ${chave} com Firebase:`, erro);
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 5. FUNÇÕES DE FORMATAÇÃO DE TEXTO (FORMATTERS)
// -----------------------------------------------------------------------------

// Formata valor para Moeda Brasileira (R$)
window.formatarMoeda = function(valor) {
    let numero = Number(valor);
    if (isNaN(numero)) numero = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numero);
};

// Formata Data ISO para formato brasileiro (DD/MM/AAAA)
window.formatarDataBrasileira = function(dataIso) {
    if (!dataIso) return '-';
    // Corrige problema de fuso horário criando a data com timezone compensado
    const partes = dataIso.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const dataObj = new Date(dataIso);
    if (isNaN(dataObj.getTime())) return '-';
    return dataObj.toLocaleDateString('pt-BR');
};

// Formata Data e Hora (DD/MM/AAAA HH:MM)
window.formatarDataHoraBrasileira = function(dataIso) {
    if (!dataIso) return '-';
    const dataObj = new Date(dataIso);
    if (isNaN(dataObj.getTime())) return '-';
    return dataObj.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Remove caracteres não numéricos
window.limparMascara = function(texto) {
    return String(texto || '').replace(/\D/g, '');
};

// Formata CPF ou CNPJ apenas visualmente (Maiúsculas)
window.formatarDocumento = function(doc) {
    return String(doc || '').toUpperCase();
};

// Formata Telefone (Celular e Fixo)
window.formatarTelefone = function(telefone) {
    const numeros = window.limparMascara(telefone);
    if (numeros.length > 10) {
        // Celular: (XX) XXXXX-XXXX
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`;
    } else if (numeros.length > 6) {
        // Fixo: (XX) XXXX-XXXX
        return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }
    return telefone;
};

// -----------------------------------------------------------------------------
// 6. FUNÇÕES DE BUSCA ESPECÍFICAS (GETTERS)
// -----------------------------------------------------------------------------

// Busca Funcionário por ID
window.buscarFuncionarioPorId = function(id) {
    const lista = APP_CACHE.funcionarios;
    if (!lista || lista.length === 0) return null;
    return lista.find(f => String(f.id) === String(id));
};

// Busca Motorista por ID (filtra função)
window.buscarMotoristaPorId = function(id) {
    const func = window.buscarFuncionarioPorId(id);
    if (func && func.funcao === 'motorista') {
        return func;
    }
    return null;
};

// Busca Ajudante por ID (filtra função)
window.buscarAjudantePorId = function(id) {
    const func = window.buscarFuncionarioPorId(id);
    if (func && func.funcao === 'ajudante') {
        return func;
    }
    return null;
};

// Busca Veículo por Placa
window.buscarVeiculoPorPlaca = function(placa) {
    const lista = APP_CACHE.veiculos;
    if (!lista || lista.length === 0) return null;
    return lista.find(v => v.placa === placa);
};

// Busca Contratante por CNPJ
window.buscarContratantePorCNPJ = function(cnpj) {
    const lista = APP_CACHE.contratantes;
    if (!lista || lista.length === 0) return null;
    return lista.find(c => String(c.cnpj) === String(cnpj));
};

// Busca Atividade por ID
window.buscarAtividadePorId = function(id) {
    const lista = APP_CACHE.atividades;
    if (!lista || lista.length === 0) return null;
    return lista.find(a => String(a.id) === String(id));
};

// Busca dados da Minha Empresa
window.buscarMinhaEmpresa = function() {
    return APP_CACHE.minhaEmpresa || {};
};

// -----------------------------------------------------------------------------
// 7. FUNÇÕES DE CÁLCULO DE FROTA
// -----------------------------------------------------------------------------

// Obtém o último KM registrado para um veículo
window.calcularUltimoKmVeiculo = function(placa) {
    if (!placa) return 0;
    const operacoes = APP_CACHE.operacoes;
    const opsVeiculo = operacoes.filter(op => op.veiculoPlaca === placa && Number(op.kmFinal) > 0);
    
    if (opsVeiculo.length === 0) return 0;
    
    // Retorna o maior KM encontrado
    return Math.max(...opsVeiculo.map(o => Number(o.kmFinal)));
};

// Calcula a média de consumo baseada no histórico
window.calcularMediaConsumoVeiculo = function(placa) {
    if (!placa) return 3.5; // Valor padrão conservador
    const operacoes = APP_CACHE.operacoes;
    const opsValidas = operacoes.filter(op => op.veiculoPlaca === placa && op.status === 'CONFIRMADA');
    
    let totalQuilometros = 0;
    let totalLitros = 0;

    opsValidas.forEach(op => {
        if (op.kmRodado && Number(op.kmRodado) > 0) {
            totalQuilometros += Number(op.kmRodado);
        }
        
        const litros = Number(op.combustivel) / Number(op.precoLitro);
        if (!isNaN(litros) && litros > 0) {
            totalLitros += litros;
        }
    });

    if (totalLitros > 0) {
        return totalQuilometros / totalLitros;
    }
    return 3.5; // Retorno padrão caso não haja histórico
};

// Calcula custo estimado de viagem
window.calcularCustoViagem = function(operacao) {
    if (!operacao || operacao.status !== 'CONFIRMADA') return 0;

    // Se houver valor abastecido real, usa ele
    if (operacao.combustivel && Number(operacao.combustivel) > 0) {
        return Number(operacao.combustivel);
    }

    // Caso contrário, estima
    const kmPercorrido = Number(operacao.kmRodado);
    if (!kmPercorrido || kmPercorrido <= 0) return 0;

    const mediaVeiculo = window.calcularMediaConsumoVeiculo(operacao.veiculoPlaca);
    const precoLitro = Number(operacao.precoLitro) || 6.00; // Preço médio padrão se não informado

    if (mediaVeiculo > 0) {
        const litrosEstimados = kmPercorrido / mediaVeiculo;
        return litrosEstimados * precoLitro;
    }
    return 0;
};
// =============================================================================
// PARTE 2: INTERFACE DE USUÁRIO (UI) - TABELAS E LISTAGENS
// =============================================================================

// -----------------------------------------------------------------------------
// 8. RENDERIZAÇÃO DA TABELA DE FUNCIONÁRIOS
// -----------------------------------------------------------------------------
window.renderizarTabelaFuncionarios = function() {
    const tabela = document.getElementById('tabelaFuncionarios');
    if (!tabela) return;

    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = ''; // Limpa conteúdo anterior

    const listaFuncionarios = APP_CACHE.funcionarios;

    if (listaFuncionarios.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="text-align:center; padding:15px;">Nenhum funcionário cadastrado no sistema.</td>';
        tbody.appendChild(row);
        return;
    }

    listaFuncionarios.forEach(function(funcionario) {
        const tr = document.createElement('tr');
        
        // Coluna Nome
        const tdNome = document.createElement('td');
        tdNome.textContent = funcionario.nome;
        tr.appendChild(tdNome);

        // Coluna Função
        const tdFuncao = document.createElement('td');
        tdFuncao.textContent = funcionario.funcao.toUpperCase();
        tr.appendChild(tdFuncao);

        // Coluna Telefone
        const tdTelefone = document.createElement('td');
        tdTelefone.textContent = window.formatarTelefone(funcionario.telefone);
        tr.appendChild(tdTelefone);

        // Coluna Ações
        const tdAcoes = document.createElement('td');
        tdAcoes.style.whiteSpace = 'nowrap';

        if (!window.IS_READ_ONLY) {
            // Botão Editar
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.title = 'Editar Funcionário';
            btnEditar.onclick = function() {
                window.preencherFormularioFuncionario(funcionario.id);
            };
            tdAcoes.appendChild(btnEditar);

            // Espaçamento
            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.title = 'Excluir Funcionário';
            btnExcluir.onclick = function() {
                window.excluirFuncionario(funcionario.id);
            };
            tdAcoes.appendChild(btnExcluir);
        } else {
            // Apenas visualização para funcionários comuns
            const btnVer = document.createElement('button');
            btnVer.className = 'btn-mini btn-primary';
            btnVer.innerHTML = '<i class="fas fa-lock"></i>';
            btnVer.disabled = true;
            tdAcoes.appendChild(btnVer);
        }

        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 9. RENDERIZAÇÃO DA TABELA DE VEÍCULOS
// -----------------------------------------------------------------------------
window.renderizarTabelaVeiculos = function() {
    const tabela = document.getElementById('tabelaVeiculos');
    if (!tabela) return;

    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    const listaVeiculos = APP_CACHE.veiculos;

    if (listaVeiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhum veículo cadastrado.</td></tr>';
        return;
    }

    listaVeiculos.forEach(function(veiculo) {
        const tr = document.createElement('tr');

        // Coluna Placa
        const tdPlaca = document.createElement('td');
        tdPlaca.textContent = veiculo.placa;
        tdPlaca.style.fontWeight = 'bold';
        tr.appendChild(tdPlaca);

        // Coluna Modelo
        const tdModelo = document.createElement('td');
        tdModelo.textContent = veiculo.modelo;
        tr.appendChild(tdModelo);

        // Coluna Ano
        const tdAno = document.createElement('td');
        tdAno.textContent = veiculo.ano;
        tr.appendChild(tdAno);

        // Coluna Ações
        const tdAcoes = document.createElement('td');
        
        if (!window.IS_READ_ONLY) {
            // Botão Editar
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() {
                window.preencherFormularioVeiculo(veiculo.placa);
            };
            tdAcoes.appendChild(btnEditar);

            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.onclick = function() {
                window.excluirVeiculo(veiculo.placa);
            };
            tdAcoes.appendChild(btnExcluir);
        }

        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 10. RENDERIZAÇÃO DA TABELA DE CONTRATANTES (CLIENTES)
// -----------------------------------------------------------------------------
window.renderizarTabelaContratantes = function() {
    const tabela = document.getElementById('tabelaContratantes');
    if (!tabela) return;

    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    const listaContratantes = APP_CACHE.contratantes;

    if (listaContratantes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

    listaContratantes.forEach(function(cliente) {
        const tr = document.createElement('tr');

        const tdRazao = document.createElement('td');
        tdRazao.textContent = cliente.razaoSocial;
        tr.appendChild(tdRazao);

        const tdCNPJ = document.createElement('td');
        tdCNPJ.textContent = window.formatarDocumento(cliente.cnpj);
        tr.appendChild(tdCNPJ);

        const tdTel = document.createElement('td');
        tdTel.textContent = window.formatarTelefone(cliente.telefone);
        tr.appendChild(tdTel);

        const tdAcoes = document.createElement('td');
        if (!window.IS_READ_ONLY) {
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() { window.preencherFormularioContratante(cliente.cnpj); };
            
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.style.marginLeft = '5px';
            btnExcluir.onclick = function() { window.excluirContratante(cliente.cnpj); };

            tdAcoes.appendChild(btnEditar);
            tdAcoes.appendChild(btnExcluir);
        }
        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 11. RENDERIZAÇÃO DA TABELA DE ATIVIDADES
// -----------------------------------------------------------------------------
window.renderizarTabelaAtividades = function() {
    const tabela = document.getElementById('tabelaAtividades');
    if (!tabela) return;
    
    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';
    
    const lista = APP_CACHE.atividades;
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma atividade cadastrada.</td></tr>';
        return;
    }
    
    lista.forEach(function(ativ) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${ativ.id}</td>
            <td>${ativ.nome}</td>
            <td>
                ${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="window.excluirAtividade('${ativ.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 12. RENDERIZAÇÃO DA TABELA DE HISTÓRICO DE OPERAÇÕES
// -----------------------------------------------------------------------------
window.renderizarTabelaOperacoes = function() {
    const tabela = document.getElementById('tabelaOperacoes');
    if (!tabela) return;

    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    // Filtrar apenas operações ativas (não canceladas e não faltas isoladas)
    // O histórico mostra Agendadas, Em Andamento e Confirmadas
    const operacoes = APP_CACHE.operacoes.filter(function(op) {
        return ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'].includes(op.status);
    });

    // Ordenar por data (mais recente primeiro)
    operacoes.sort(function(a, b) {
        return new Date(b.data) - new Date(a.data);
    });

    if (operacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma operação no histórico recente.</td></tr>';
        return;
    }

    operacoes.forEach(function(op) {
        const tr = document.createElement('tr');

        // Data
        const tdData = document.createElement('td');
        tdData.textContent = window.formatarDataBrasileira(op.data);
        tr.appendChild(tdData);

        // Motorista e Veículo
        const tdInfo = document.createElement('td');
        const motorista = window.buscarMotoristaPorId(op.motoristaId);
        const nomeMot = motorista ? motorista.nome : '(Excluído)';
        tdInfo.innerHTML = `<strong>${nomeMot}</strong><br><small style="color:#666">${op.veiculoPlaca}</small>`;
        tr.appendChild(tdInfo);

        // Status (Badge)
        const tdStatus = document.createElement('td');
        let statusClass = 'pill-pending';
        let statusText = op.status;
        
        if (op.status === 'CONFIRMADA') {
            statusClass = 'pill-active';
        } else if (op.status === 'EM_ANDAMENTO') {
            statusClass = 'pill-active'; // Usa azul/verde
            statusText = 'EM ANDAMENTO'; // Texto amigável
        }
        
        tdStatus.innerHTML = `<span class="status-pill ${statusClass}" ${op.status === 'EM_ANDAMENTO' ? 'style="background:orange; color:white;"' : ''}>${statusText}</span>`;
        tr.appendChild(tdStatus);

        // Valor
        const tdValor = document.createElement('td');
        tdValor.textContent = window.formatarMoeda(op.faturamento);
        tdValor.style.fontWeight = 'bold';
        tdValor.style.color = 'var(--success-color)';
        tr.appendChild(tdValor);

        // Ações
        const tdAcoes = document.createElement('td');
        
        // Botão Ver Detalhes (Todos veem)
        const btnVer = document.createElement('button');
        btnVer.className = 'btn-mini btn-primary';
        btnVer.innerHTML = '<i class="fas fa-eye"></i>';
        btnVer.title = 'Ver Detalhes';
        btnVer.onclick = function() {
            window.visualizarDetalhesOperacao(op.id);
        };
        tdAcoes.appendChild(btnVer);

        if (!window.IS_READ_ONLY) {
            tdAcoes.appendChild(document.createTextNode(' '));
            
            // Botão Editar
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() {
                window.preencherFormularioOperacao(op.id);
            };
            tdAcoes.appendChild(btnEditar);

            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.onclick = function() {
                window.excluirOperacao(op.id);
            };
            tdAcoes.appendChild(btnExcluir);
        }
        
        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 13. RENDERIZAÇÃO DE MONITORAMENTO DE CHECK-IN E FALTAS (IMPORTANTE)
// Separa em duas tabelas: Rotas Ativas (Topo) e Ocorrências/Faltas (Fim)
// -----------------------------------------------------------------------------
window.renderizarTabelaMonitoramento = function() {
    const tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    const tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    // Se a tabela de ativos não existir na página atual, aborta
    if (!tbodyAtivos) return;

    const todasOperacoes = APP_CACHE.operacoes.filter(o => o.status !== 'CANCELADA');
    
    // Limpa as tabelas
    tbodyAtivos.innerHTML = '';
    if (tbodyFaltas) tbodyFaltas.innerHTML = '';

    let encontrouAtivos = false;
    let encontrouFaltas = false;

    // --- LÓGICA DE SEPARAÇÃO ---
    
    todasOperacoes.forEach(function(op) {
        const motorista = window.buscarMotoristaPorId(op.motoristaId);
        const nomeMot = motorista ? motorista.nome : 'Motorista Excluído';
        const dataFormatada = window.formatarDataBrasileira(op.data);

        // Verifica se é uma operação "velha" já confirmada (ex: mais de 5 dias) para não poluir
        const isAntiga = (new Date() - new Date(op.data)) > (5 * 24 * 60 * 60 * 1000);
        const isConfirmada = op.status === 'CONFIRMADA';

        // 1. PROCESSAMENTO DE FALTAS (TABELA INFERIOR)
        // Falta do Motorista
        if (op.checkins && op.checkins.faltaMotorista) {
            encontrouFaltas = true;
            if (tbodyFaltas) {
                const trFalta = document.createElement('tr');
                trFalta.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${nomeMot}</td>
                    <td>MOTORISTA</td>
                    <td><span style="color:white; background:red; padding:3px 8px; border-radius:10px; font-size:0.8em;">FALTA</span></td>
                    <td>
                        ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="window.desfazerFalta('${op.id}', 'motorista', '${op.motoristaId}')">Desfazer</button>` : ''}
                    </td>
                `;
                tbodyFaltas.appendChild(trFalta);
            }
        }

        // Faltas de Ajudantes
        if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.length > 0) {
            op.checkins.faltasAjudantes.forEach(ajId => {
                encontrouFaltas = true;
                if (tbodyFaltas) {
                    const ajudante = window.buscarAjudantePorId(ajId);
                    const nomeAj = ajudante ? ajudante.nome : 'Excluído';
                    const trFaltaAj = document.createElement('tr');
                    trFaltaAj.innerHTML = `
                        <td>${dataFormatada}</td>
                        <td>${nomeAj}</td>
                        <td>AJUDANTE</td>
                        <td><span style="color:white; background:red; padding:3px 8px; border-radius:10px; font-size:0.8em;">FALTA</span></td>
                        <td>
                            ${!window.IS_READ_ONLY ? `<button class="btn-mini edit-btn" onclick="window.desfazerFalta('${op.id}', 'ajudante', '${ajId}')">Desfazer</button>` : ''}
                        </td>
                    `;
                    tbodyFaltas.appendChild(trFaltaAj);
                }
            });
        }

        // 2. PROCESSAMENTO DE ROTAS ATIVAS (TABELA SUPERIOR)
        // Condições para aparecer no monitoramento:
        // - Não ser antiga confirmada
        // - Motorista NÃO ter faltado (se faltou, a rota "morreu" ou precisa de substituição, aparece na lista de falta)
        if (!isAntiga && (!op.checkins || !op.checkins.faltaMotorista)) {
            encontrouAtivos = true;
            
            // Linha do Motorista
            const trMot = document.createElement('tr');
            trMot.style.borderLeft = '4px solid var(--primary-color)';
            trMot.style.backgroundColor = '#fcfcfc'; // Leve destaque

            let statusMotVisual = '<span class="status-pill pill-pending">AGUARDANDO</span>';
            if (op.checkins && op.checkins.motorista) statusMotVisual = '<span class="status-pill pill-active">EM ROTA</span>';
            if (isConfirmada) statusMotVisual = '<span class="status-pill pill-active">FINALIZADO</span>';

            let botoesAdminMot = '';
            if (!window.IS_READ_ONLY && !isConfirmada) {
                botoesAdminMot = `
                    <button class="btn-mini btn-success" title="Forçar Início" onclick="window.forcarCheckin('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-play"></i></button>
                    <button class="btn-mini btn-danger" title="Marcar Falta" onclick="window.marcarFalta('${op.id}', 'motorista', '${op.motoristaId}')"><i class="fas fa-user-times"></i></button>
                `;
            }

            trMot.innerHTML = `
                <td><strong>${dataFormatada}</strong></td>
                <td>Op #${op.id}<br><small>${op.veiculoPlaca}</small></td>
                <td>${nomeMot} <small style="color:#666">(MOTORISTA)</small></td>
                <td>${op.status}</td>
                <td>${statusMotVisual}</td>
                <td>${botoesAdminMot}</td>
            `;
            tbodyAtivos.appendChild(trMot);

            // Linhas dos Ajudantes (Vinculados a esta operação)
            if (op.ajudantes && op.ajudantes.length > 0) {
                op.ajudantes.forEach(aj => {
                    // Se o ajudante faltou, não mostra aqui (já foi pra tabela de baixo)
                    if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(aj.id))) {
                        return;
                    }

                    const funcAj = window.buscarAjudantePorId(aj.id);
                    const nomeAj = funcAj ? funcAj.nome : '---';
                    const isPresente = op.checkins && op.checkins.ajudantes && op.checkins.ajudantes.includes(String(aj.id));
                    
                    let statusAj = isPresente ? '<span class="status-pill pill-active">PRESENTE</span>' : '<span class="status-pill pill-pending">AGUARDANDO</span>';
                    if (isConfirmada) statusAj = '<span class="status-pill pill-active">OK</span>';

                    let botoesAdminAj = '';
                    if (!window.IS_READ_ONLY && !isConfirmada && !isPresente) {
                        botoesAdminAj = `
                            <button class="btn-mini btn-success" title="Confirmar Presença" onclick="window.forcarCheckin('${op.id}', 'ajudante', '${aj.id}')"><i class="fas fa-check"></i></button>
                            <button class="btn-mini btn-danger" title="Marcar Falta" onclick="window.marcarFalta('${op.id}', 'ajudante', '${aj.id}')"><i class="fas fa-user-times"></i></button>
                        `;
                    }

                    const trAj = document.createElement('tr');
                    trAj.innerHTML = `
                        <td style="border:none;"></td>
                        <td style="border:none;"></td>
                        <td>${nomeAj} <small style="color:#666">(AJUDANTE)</small></td>
                        <td style="color:#aaa;">-</td>
                        <td>${statusAj}</td>
                        <td>${botoesAdminAj}</td>
                    `;
                    tbodyAtivos.appendChild(trAj);
                });
            }
        }
    });

    if (!encontrouAtivos) {
        tbodyAtivos.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma rota ativa no momento.</td></tr>';
    }

    if (tbodyFaltas && !encontrouFaltas) {
        tbodyFaltas.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">Nenhuma falta ou ocorrência registrada.</td></tr>';
    }
};

// -----------------------------------------------------------------------------
// 14. RENDERIZAÇÃO DE DESPESAS GERAIS
// -----------------------------------------------------------------------------
window.renderizarTabelaDespesas = function() {
    const tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela) return;
    const tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';
    
    const lista = APP_CACHE.despesas;
    // Ordena por data
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));

    if(lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    lista.forEach(function(d) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${window.formatarDataBrasileira(d.data)}</td>
            <td>${d.veiculoRef}</td>
            <td>${d.descricao}</td>
            <td style="color:var(--danger-color); font-weight:bold;">${window.formatarMoeda(d.valor)}</td>
            <td><span class="status-pill pill-active">${d.formaPagamento}</span></td>
            <td>
                ${!window.IS_READ_ONLY ? `<button class="btn-mini delete-btn" onclick="window.excluirDespesa(${d.id})"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// -----------------------------------------------------------------------------
// 15. RENDERIZAÇÃO DE DADOS "MINHA EMPRESA"
// -----------------------------------------------------------------------------
window.renderizarInformacoesEmpresa = function() {
    const empresa = APP_CACHE.minhaEmpresa;
    
    // 1. Atualiza formulário de edição
    if (document.getElementById('minhaEmpresaRazaoSocial')) {
        document.getElementById('minhaEmpresaRazaoSocial').value = empresa.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = empresa.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = empresa.telefone || '';
    }

    // 2. Atualiza a visualização no card (se existir o elemento de display)
    const displayDiv = document.getElementById('dadosMinhaEmpresaDisplay');
    if (displayDiv) {
        if (empresa.razaoSocial) {
            displayDiv.innerHTML = `
                <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; border: 1px solid #90caf9; margin-bottom: 20px;">
                    <h3 style="margin-top:0; color:#1565c0;">${empresa.razaoSocial}</h3>
                    <p style="margin:5px 0;"><strong>CNPJ:</strong> ${empresa.cnpj}</p>
                    <p style="margin:5px 0;"><strong>Contato:</strong> ${window.formatarTelefone(empresa.telefone)}</p>
                </div>
            `;
        } else {
            displayDiv.innerHTML = '<p style="color:#666; font-style:italic;">Nenhuma empresa configurada. Preencha os dados abaixo.</p>';
        }
    }
};

// -----------------------------------------------------------------------------
// 16. FUNÇÃO DE POPULAÇÃO DE MENUS SUSPENSOS (SELECTS)
// Esta função é chamada sempre que algo muda para manter os selects atualizados
// -----------------------------------------------------------------------------
window.preencherTodosSelects = function() {
    // Carrega dados atualizados
    const funcionarios = APP_CACHE.funcionarios;
    const motoristas = funcionarios.filter(f => f.funcao === 'motorista');
    const ajudantes = funcionarios.filter(f => f.funcao === 'ajudante');
    const veiculos = APP_CACHE.veiculos;
    const contratantes = APP_CACHE.contratantes;
    const atividades = APP_CACHE.atividades;

    // Função interna auxiliar para preencher um select específico
    function preencherSelectEspecifico(elementId, dados, chaveValor, chaveTexto, textoPadrao) {
        const select = document.getElementById(elementId);
        if (select) {
            const valorSelecionado = select.value; // Tenta manter a seleção atual
            select.innerHTML = `<option value="">${textoPadrao}</option>`;
            
            dados.forEach(item => {
                const option = document.createElement('option');
                option.value = item[chaveValor];
                option.textContent = item[chaveTexto];
                select.appendChild(option);
            });

            if (valorSelecionado) select.value = valorSelecionado;
        }
    }

    // 1. Selects da Tela de Operação
    preencherSelectEspecifico('selectMotoristaOperacao', motoristas, 'id', 'nome', 'SELECIONE O MOTORISTA...');
    preencherSelectEspecifico('selectVeiculoOperacao', veiculos, 'placa', 'placa', 'SELECIONE O VEÍCULO...');
    preencherSelectEspecifico('selectContratanteOperacao', contratantes, 'cnpj', 'razaoSocial', 'SELECIONE O CLIENTE...');
    preencherSelectEspecifico('selectAtividadeOperacao', atividades, 'id', 'nome', 'SELECIONE A ATIVIDADE (OPCIONAL)...');
    preencherSelectEspecifico('selectAjudantesOperacao', ajudantes, 'id', 'nome', 'ADICIONAR AJUDANTE...');

    // 2. Selects da Tela de Relatórios
    // CORREÇÃO: "selectMotoristaRelatorio" agora lista TODOS os funcionários, não só motoristas
    preencherSelectEspecifico('selectMotoristaRelatorio', funcionarios, 'id', 'nome', 'TODOS OS FUNCIONÁRIOS');
    preencherSelectEspecifico('selectVeiculoRelatorio', veiculos, 'placa', 'placa', 'TODOS OS VEÍCULOS');
    preencherSelectEspecifico('selectContratanteRelatorio', contratantes, 'cnpj', 'razaoSocial', 'TODOS OS CLIENTES');

    // 3. Select da Tela de Recibo
    preencherSelectEspecifico('selectMotoristaRecibo', funcionarios, 'id', 'nome', 'SELECIONE O FUNCIONÁRIO...');

    // 4. Select da Tela de Despesas
    preencherSelectEspecifico('selectVeiculoDespesaGeral', veiculos, 'placa', 'placa', 'VINCULAR VEÍCULO (OPCIONAL)...');

    // 5. Atualiza todas as tabelas visuais também
    window.renderizarTabelaFuncionarios();
    window.renderizarTabelaVeiculos();
    window.renderizarTabelaContratantes();
    window.renderizarTabelaOperacoes();
    window.renderizarTabelaMonitoramento();
    window.renderizarTabelaDespesas();
    window.renderizarTabelaAtividades();
    window.renderizarInformacoesEmpresa();
};
// =============================================================================
// PARTE 3: LÓGICA DO CALENDÁRIO, CRUD ESPECÍFICO E AÇÕES ADMINISTRATIVAS
// =============================================================================

// -----------------------------------------------------------------------------
// 17. LÓGICA DO CALENDÁRIO INTERATIVO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    const gridCalendario = document.getElementById('calendarGrid');
    const labelMesAno = document.getElementById('currentMonthYear');
    
    if (!gridCalendario || !labelMesAno) return;

    // Limpa o grid
    gridCalendario.innerHTML = '';

    const dataAtual = window.currentDate;
    const mes = dataAtual.getMonth();
    const ano = dataAtual.getFullYear();

    // Atualiza o título (Ex: DEZEMBRO 2025)
    labelMesAno.textContent = dataAtual.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).toUpperCase();

    // Dados para construção do grid
    const primeiroDiaDaSemana = new Date(ano, mes, 1).getDay(); // 0 = Domingo
    const totalDiasNoMes = new Date(ano, mes + 1, 0).getDate();
    const listaOperacoes = APP_CACHE.operacoes;

    // Cria células vazias para o início do mês (offset)
    for (let i = 0; i < primeiroDiaDaSemana; i++) {
        const celulaVazia = document.createElement('div');
        celulaVazia.className = 'day-cell empty';
        gridCalendario.appendChild(celulaVazia);
    }

    // Cria os dias do mês
    for (let dia = 1; dia <= totalDiasNoMes; dia++) {
        const celulaDia = document.createElement('div');
        celulaDia.className = 'day-cell';
        
        // Número do dia
        const spanNumero = document.createElement('span');
        spanNumero.textContent = dia;
        celulaDia.appendChild(spanNumero);

        // Formata data para busca YYYY-MM-DD
        const stringData = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

        // Filtra operações deste dia (Exclui canceladas)
        const operacoesDoDia = listaOperacoes.filter(function(op) {
            return op.data === stringData && op.status !== 'CANCELADA';
        });

        // Se houver operações, adiciona indicadores visuais
        if (operacoesDoDia.length > 0) {
            celulaDia.classList.add('has-operation');

            // 1. Bolinha indicadora
            const divDot = document.createElement('div');
            divDot.className = 'event-dot';
            celulaDia.appendChild(divDot);

            // 2. Total Financeiro do Dia (Soma Faturamento)
            const faturamentoDia = operacoesDoDia.reduce(function(total, op) {
                return total + (Number(op.faturamento) || 0);
            }, 0);

            const divValor = document.createElement('div');
            divValor.style.fontSize = '0.7em';
            divValor.style.color = 'green';
            divValor.style.marginTop = 'auto';
            divValor.style.fontWeight = 'bold';
            divValor.textContent = window.formatarMoeda(faturamentoDia);
            celulaDia.appendChild(divValor);

            // 3. Evento de Clique para abrir detalhes
            celulaDia.onclick = function() {
                window.abrirModalDetalhesDia(stringData);
            };
        }

        gridCalendario.appendChild(celulaDia);
    }
};

// Navegação de Mês (Anterior/Próximo)
window.mudarMes = function(direcao) {
    // direcao: -1 para anterior, 1 para próximo
    window.currentDate.setMonth(window.currentDate.getMonth() + direcao);
    window.renderizarCalendario();
    
    // Se existir a função de atualizar gráficos, chama ela
    if (typeof window.atualizarDashboard === 'function') {
        window.atualizarDashboard();
    }
};

// Modal de Detalhes do Dia
window.abrirModalDetalhesDia = function(dataString) {
    const listaOperacoes = APP_CACHE.operacoes;
    
    // Filtra novamente para garantir dados frescos
    const operacoesDoDia = listaOperacoes.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    const modalBody = document.getElementById('modalDayBody');
    const modalTitle = document.getElementById('modalDayTitle');
    const modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    // Título do Modal
    const dataFormatada = dataString.split('-').reverse().join('/');
    if (modalTitle) modalTitle.textContent = `DETALHES DE ${dataFormatada}`;

    // Resumo Financeiro do Dia
    let totalFat = 0;
    let totalCusto = 0;

    let htmlLista = '';

    operacoesDoDia.forEach(function(op) {
        // Cálculos individuais
        const fat = Number(op.faturamento) || 0;
        
        let custoDiesel = window.calcularCustoConsumoViagem(op);
        let custoExtra = Number(op.despesas) || 0;
        let custoPessoal = 0;

        // Soma comissão motorista se não faltou
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoPessoal += (Number(op.comissao) || 0);
        }

        // Soma diária ajudantes se não faltaram
        if (op.ajudantes && op.ajudantes.length > 0) {
            op.ajudantes.forEach(function(aj) {
                if (!op.checkins || !op.checkins.faltasAjudantes || !op.checkins.faltasAjudantes.includes(String(aj.id))) {
                    custoPessoal += (Number(aj.diaria) || 0);
                }
            });
        }

        totalFat += fat;
        totalCusto += (custoDiesel + custoExtra + custoPessoal);

        // HTML do Card da Operação
        const nomeMot = window.getMotorista(op.motoristaId)?.nome || 'Sem Motorista';
        
        htmlLista += `
            <div style="background:#fff; padding:12px; border:1px solid #eee; margin-bottom:10px; border-left: 4px solid var(--primary-color); border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <strong>Operação #${op.id}</strong><br>
                        <span style="color:#666; font-size:0.9em;">${op.veiculoPlaca} - ${nomeMot}</span><br>
                        <span class="status-pill pill-${op.status === 'CONFIRMADA' ? 'active' : 'pending'}" style="font-size:0.7em;">${op.status}</span>
                    </div>
                    <div style="text-align:right;">
                        <strong style="color:var(--success-color);">${window.formatarMoeda(fat)}</strong>
                    </div>
                </div>
                <div style="margin-top:10px; text-align:right;">
                    <button class="btn-mini edit-btn" onclick="window.preencherFormularioOperacao('${op.id}'); document.getElementById('modalDayOperations').style.display='none';">
                        <i class="fas fa-edit"></i> VER / EDITAR
                    </button>
                </div>
            </div>
        `;
    });

    // Atualiza o Resumo no topo do modal
    if (modalSummary) {
        const lucroLiquido = totalFat - totalCusto;
        modalSummary.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div class="finance-box success" style="padding:10px; background:#e8f5e9; border-radius:5px; text-align:center;">
                    <small>Faturamento</small><br>
                    <strong>${window.formatarMoeda(totalFat)}</strong>
                </div>
                <div class="finance-box gasto" style="padding:10px; background:#ffebee; border-radius:5px; text-align:center;">
                    <small>Custos Est.</small><br>
                    <strong style="color:#c62828;">${window.formatarMoeda(totalCusto)}</strong>
                </div>
                <div class="finance-box lucro" style="padding:10px; background:#e3f2fd; border-radius:5px; text-align:center;">
                    <small>Lucro</small><br>
                    <strong style="color:${lucroLiquido >= 0 ? '#2e7d32' : '#c62828'};">${window.formatarMoeda(lucroLiquido)}</strong>
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = htmlLista || '<p style="text-align:center; color:#999;">Nenhuma operação ativa neste dia.</p>';
    
    // Exibe o modal
    document.getElementById('modalDayOperations').style.display = 'block';
};

// -----------------------------------------------------------------------------
// 18. FUNÇÕES DE EXCLUSÃO (CRUD - DELETE)
// -----------------------------------------------------------------------------

window.excluirFuncionario = function(id) {
    if (window.IS_READ_ONLY) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este funcionário?")) return;

    const novaLista = APP_CACHE.funcionarios.filter(f => String(f.id) !== String(id));
    persistirDados(DB_KEYS.FUNCIONARIOS, novaLista).then(() => {
        window.preencherTodosSelects();
        alert("Funcionário excluído com sucesso.");
    });
};

window.excluirVeiculo = function(placa) {
    if (window.IS_READ_ONLY) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este veículo?")) return;

    const novaLista = APP_CACHE.veiculos.filter(v => v.placa !== placa);
    persistirDados(DB_KEYS.VEICULOS, novaLista).then(() => {
        window.preencherTodosSelects();
        alert("Veículo excluído com sucesso.");
    });
};

window.excluirContratante = function(cnpj) {
    if (window.IS_READ_ONLY) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este contratante?")) return;

    const novaLista = APP_CACHE.contratantes.filter(c => String(c.cnpj) !== String(cnpj));
    persistirDados(DB_KEYS.CONTRATANTES, novaLista).then(() => {
        window.preencherTodosSelects();
        alert("Contratante excluído com sucesso.");
    });
};

window.excluirOperacao = function(id) {
    if (window.IS_READ_ONLY) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir esta operação? Isso afetará o financeiro.")) return;

    const novaLista = APP_CACHE.operacoes.filter(o => String(o.id) !== String(id));
    persistirDados(DB_KEYS.OPERACOES, novaLista).then(() => {
        window.preencherTodosSelects(); // Atualiza tudo
        if(window.atualizarDashboard) window.atualizarDashboard();
        window.renderizarCalendario();
        alert("Operação excluída.");
    });
};

window.excluirDespesa = function(id) {
    if (window.IS_READ_ONLY) return alert("Sem permissão.");
    if (!confirm("Excluir despesa?")) return;

    const novaLista = APP_CACHE.despesas.filter(d => String(d.id) !== String(id));
    persistirDados(DB_KEYS.DESPESAS_GERAIS, novaLista).then(() => {
        window.renderizarTabelaDespesas();
        if(window.atualizarDashboard) window.atualizarDashboard();
        alert("Despesa excluída.");
    });
};

window.excluirAtividade = function(id) {
    if (window.IS_READ_ONLY) return alert("Sem permissão.");
    if (!confirm("Excluir atividade?")) return;

    const novaLista = APP_CACHE.atividades.filter(a => String(a.id) !== String(id));
    persistirDados(DB_KEYS.ATIVIDADES, novaLista).then(() => {
        window.renderizarTabelaAtividades();
        window.preencherTodosSelects(); // Atualiza dropdowns
        alert("Atividade excluída.");
    });
};

// -----------------------------------------------------------------------------
// 19. FUNÇÕES DE PREENCHIMENTO DE FORMULÁRIO (CRUD - EDIT)
// -----------------------------------------------------------------------------

window.preencherFormularioFuncionario = function(id) {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");
    
    const funcionario = window.buscarFuncionarioPorId(id);
    if (!funcionario) return alert("Erro: Funcionário não encontrado.");

    // Preenche campos
    document.getElementById('funcionarioId').value = funcionario.id;
    document.getElementById('funcNome').value = funcionario.nome;
    document.getElementById('funcFuncao').value = funcionario.funcao;
    document.getElementById('funcDocumento').value = funcionario.documento;
    document.getElementById('funcTelefone').value = funcionario.telefone;
    document.getElementById('funcPix').value = funcionario.pix || '';
    document.getElementById('funcEndereco').value = funcionario.endereco || '';
    document.getElementById('funcEmail').value = funcionario.email || '';
    
    // O email é a chave de login, se já existe, bloqueia edição ou avisa
    if(funcionario.email) document.getElementById('funcEmail').readOnly = true;

    // Lógica específica para Motorista
    const divDriverFields = document.getElementById('driverFields') || document.getElementById('camposMotorista'); // Fallback de ID
    
    if (funcionario.funcao === 'motorista') {
        if(divDriverFields) divDriverFields.style.display = 'block';
        // Alternativamente chama a função de toggle se existir
        if(window.toggleDriverFields) window.toggleDriverFields();

        document.getElementById('funcCNH').value = funcionario.cnh || '';
        document.getElementById('funcValidadeCNH').value = funcionario.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = funcionario.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = funcionario.cursoDescricao || '';
    } else {
        if(divDriverFields) divDriverFields.style.display = 'none';
        if(window.toggleDriverFields) window.toggleDriverFields();
    }

    // Rola a página e troca a aba
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const tabBtn = document.querySelector('[data-tab="funcionarios"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioVeiculo = function(placa) {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");

    const veiculo = window.buscarVeiculoPorPlaca(placa);
    if (!veiculo) return alert("Veículo não encontrado.");

    document.getElementById('veiculoId').value = veiculo.placa; // ID oculto para saber que é edição
    document.getElementById('veiculoPlaca').value = veiculo.placa;
    document.getElementById('veiculoModelo').value = veiculo.modelo;
    document.getElementById('veiculoAno').value = veiculo.ano;
    document.getElementById('veiculoRenavam').value = veiculo.renavam || '';
    document.getElementById('veiculoChassi').value = veiculo.chassi || '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    const tabBtn = document.querySelector('[data-tab="veiculos"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioContratante = function(cnpj) {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");

    const cliente = window.buscarContratantePorCNPJ(cnpj);
    if (!cliente) return alert("Cliente não encontrado.");

    document.getElementById('contratanteId').value = cliente.cnpj;
    document.getElementById('contratanteRazaoSocial').value = cliente.razaoSocial;
    document.getElementById('contratanteCNPJ').value = cliente.cnpj;
    document.getElementById('contratanteTelefone').value = cliente.telefone;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    const tabBtn = document.querySelector('[data-tab="contratantes"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioOperacao = function(id) {
    if (window.IS_READ_ONLY) return alert("Apenas leitura.");

    // Busca operação pelo ID (convertendo para string para segurança)
    const op = APP_CACHE.operacoes.find(o => String(o.id) === String(id));
    if (!op) return alert("Operação não encontrada.");

    // 1. Dados Principais
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

    // 3. Abastecimento e Km
    document.getElementById('operacaoCombustivel').value = op.combustivel;
    document.getElementById('operacaoPrecoLitro').value = op.precoLitro;
    document.getElementById('operacaoKmRodado').value = op.kmRodado;

    // 4. Status (Checkbox Agendamento)
    const checkAgendamento = document.getElementById('operacaoIsAgendamento');
    if (checkAgendamento) {
        checkAgendamento.checked = (op.status === 'AGENDADA');
    }

    // 5. Equipe (Ajudantes)
    // Importante: Restaura a lista temporária global para que o usuário veja e edite os ajudantes
    window._operacaoAjudantesTempList = op.ajudantes ? [...op.ajudantes] : [];
    window.renderizarListaAjudantesAdicionados(); // Atualiza a lista visual na tela

    // 6. Navegação
    // Abre a página de lançamentos e rola para o topo
    const navItem = document.querySelector('[data-page="operacoes"]'); // Ou 'home' dependendo do seu layout
    if (navItem) navItem.click();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Feedback visual (borda piscando)
    const formCard = document.querySelector('#formOperacao')?.parentElement;
    if (formCard) {
        formCard.style.borderColor = 'orange';
        setTimeout(() => { formCard.style.borderColor = ''; }, 2000);
    }
};

// -----------------------------------------------------------------------------
// 20. AÇÕES ADMINISTRATIVAS (INTERVENÇÃO EM ROTAS)
// -----------------------------------------------------------------------------

// Forçar Check-in (Quando o motorista não consegue usar o app)
window.forcarCheckin = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("ATENÇÃO: Você está prestes a realizar um check-in manual.\nConfirma a presença deste funcionário?")) return;

    let operacoes = APP_CACHE.operacoes.slice(); // Cópia
    const index = operacoes.findIndex(o => String(o.id) === String(opId));
    
    if (index < 0) return alert("Erro: Operação não encontrada.");
    
    let op = operacoes[index];

    // Garante estrutura de checkins
    if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false };

    if (tipoUsuario === 'motorista') {
        op.checkins.motorista = true;
        op.checkins.faltaMotorista = false; // Remove falta se existir
        op.status = 'EM_ANDAMENTO';
        
        // Se não tiver data de início, define agora
        if (!op.dataHoraInicio) op.dataHoraInicio = new Date().toISOString();
        
        // Se KM Inicial for zero, tenta pegar do veículo
        if (!op.kmInicial || op.kmInicial === 0) {
            op.kmInicial = window.obterUltimoKmFinal(op.veiculoPlaca);
        }
    } 
    else if (tipoUsuario === 'ajudante') {
        const uidStr = String(usuarioId);
        
        // Adiciona aos presentes se não estiver
        if (!op.checkins.ajudantes.includes(uidStr)) {
            op.checkins.ajudantes.push(uidStr);
        }
        
        // Remove da lista de faltas se estiver
        if (op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(id => id !== uidStr);
        }
    }

    // Salva e atualiza tela
    persistirDados(DB_KEYS.OPERACOES, operacoes).then(() => {
        window.renderizarCheckinsTable();
        window.renderizarTabelaOperacoes(); // Atualiza status no histórico também
        alert("Presença confirmada manualmente.");
    });
};

// Desfazer Falta (Correção de erro)
window.desfazerFalta = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("Deseja remover esta falta? O funcionário voltará a ficar pendente ou presente.")) return;

    let operacoes = APP_CACHE.operacoes.slice();
    const index = operacoes.findIndex(o => String(o.id) === String(opId));
    if (index < 0) return;

    let op = operacoes[index];

    if (tipoUsuario === 'motorista') {
        op.checkins.faltaMotorista = false;
        // Se o checkin real não foi feito, volta status para agendada (ou mantem em andamento se ja iniciou)
        if (!op.checkins.motorista) {
            // Pode voltar para AGENDADA se ninguém iniciou
            op.status = 'AGENDADA'; 
        }
    } 
    else if (tipoUsuario === 'ajudante') {
        const uidStr = String(usuarioId);
        if (op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(id => id !== uidStr);
        }
    }

    persistirDados(DB_KEYS.OPERACOES, operacoes).then(() => {
        window.renderizarCheckinsTable();
        alert("Falta removida.");
    });
};

// Marcar Falta (Desconto Financeiro)
window.marcarFalta = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("CONFIRMAR FALTA?\n\nO valor da diária/comissão NÃO será pago a este funcionário.")) return;

    let operacoes = APP_CACHE.operacoes.slice();
    const index = operacoes.findIndex(o => String(o.id) === String(opId));
    if (index < 0) return;

    let op = operacoes[index];
    if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false };

    if (tipoUsuario === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; // Remove presença
        // Não muda status da operação para cancelada, pois a operação pode acontecer com outro motorista ou continuar
    } 
    else if (tipoUsuario === 'ajudante') {
        const uidStr = String(usuarioId);
        if (!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes = [];
        
        // Adiciona à lista de faltas
        if (!op.checkins.faltasAjudantes.includes(uidStr)) {
            op.checkins.faltasAjudantes.push(uidStr);
        }
        
        // Remove da lista de presentes
        op.checkins.ajudantes = op.checkins.ajudantes.filter(id => id !== uidStr);
    }

    persistirDados(DB_KEYS.OPERACOES, operacoes).then(() => {
        window.renderizarCheckinsTable();
        alert("Falta registrada com sucesso.");
    });
};

// -----------------------------------------------------------------------------
// 21. PAINEL DO FUNCIONÁRIO (LÓGICA DE DADOS INLINE)
// -----------------------------------------------------------------------------

// Função para preencher os campos "Meus Dados" para edição inline
window.renderizarPainelMeusDados = function() {
    if (!window.CURRENT_USER) return;

    // Busca os dados reais do funcionário logado
    const meuPerfil = APP_CACHE.funcionarios.find(f => f.email === window.CURRENT_USER.email);
    
    if (!meuPerfil) {
        console.error("Perfil de funcionário não encontrado para o email logado.");
        return;
    }

    // Preenche os inputs do formulário criado no HTML
    const campoNome = document.getElementById('meuPerfilNome');
    const campoFuncao = document.getElementById('meuPerfilFuncao');
    const campoDoc = document.getElementById('meuPerfilDoc');
    const campoTel = document.getElementById('meuPerfilTel');
    const campoPix = document.getElementById('meuPerfilPix');
    const campoEnd = document.getElementById('meuPerfilEndereco');
    
    if (campoNome) campoNome.value = meuPerfil.nome;
    if (campoFuncao) campoFuncao.value = meuPerfil.funcao;
    if (campoDoc) campoDoc.value = meuPerfil.documento;
    if (campoTel) campoTel.value = meuPerfil.telefone;
    if (campoPix) campoPix.value = meuPerfil.pix || '';
    if (campoEnd) campoEnd.value = meuPerfil.endereco || '';

    // Campos específicos de motorista
    const groupCNH = document.getElementById('meuPerfilCNHGroup');
    const groupValidade = document.getElementById('meuPerfilValidadeCNHGroup');
    const campoCNH = document.getElementById('meuPerfilCNH');
    const campoValidade = document.getElementById('meuPerfilValidadeCNH');

    if (meuPerfil.funcao === 'motorista') {
        if (groupCNH) groupCNH.style.display = 'block';
        if (groupValidade) groupValidade.style.display = 'block';
        if (campoCNH) campoCNH.value = meuPerfil.cnh || '';
        if (campoValidade) campoValidade.value = meuPerfil.validadeCNH || '';
    } else {
        if (groupCNH) groupCNH.style.display = 'none';
        if (groupValidade) groupValidade.style.display = 'none';
    }
};
// =============================================================================
// PARTE 4: FORMULÁRIOS, RELATÓRIOS, DASHBOARD E INICIALIZAÇÃO
// =============================================================================

// -----------------------------------------------------------------------------
// 22. CONFIGURAÇÃO DE LISTENERS DE FORMULÁRIOS (O "SALVAR")
// -----------------------------------------------------------------------------

function configurarFormularios() {

    // --- A. SALVAR DADOS "MINHA EMPRESA" ---
    const formEmpresa = document.getElementById('formMinhaEmpresa');
    if (formEmpresa) {
        formEmpresa.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const dadosEmpresa = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };

            persistirDados(DB_KEYS.MINHA_EMPRESA, dadosEmpresa).then(function() {
                window.renderizarInformacoesEmpresa(); // Atualiza a visualização na hora
                alert("Dados da empresa atualizados com sucesso!");
            });
        });
    }

    // --- B. SALVAR DADOS PESSOAIS (PAINEL DO FUNCIONÁRIO - INLINE) ---
    const formMeusDados = document.getElementById('formMeusDadosFuncionario');
    if (formMeusDados) {
        formMeusDados.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (!window.CURRENT_USER) return alert("Erro de sessão.");

            // Carrega lista completa para editar o registro correto
            let listaFuncionarios = APP_CACHE.funcionarios.slice();
            const indice = listaFuncionarios.findIndex(f => f.email === window.CURRENT_USER.email);

            if (indice >= 0) {
                // Atualiza apenas os campos permitidos
                listaFuncionarios[indice].nome = document.getElementById('meuPerfilNome').value.toUpperCase();
                listaFuncionarios[indice].documento = document.getElementById('meuPerfilDoc').value;
                listaFuncionarios[indice].telefone = document.getElementById('meuPerfilTel').value;
                listaFuncionarios[indice].pix = document.getElementById('meuPerfilPix').value;
                listaFuncionarios[indice].endereco = document.getElementById('meuPerfilEndereco').value.toUpperCase();

                // Se for motorista, salva dados de CNH
                if (listaFuncionarios[indice].funcao === 'motorista') {
                    listaFuncionarios[indice].cnh = document.getElementById('meuPerfilCNH').value.toUpperCase();
                    listaFuncionarios[indice].validadeCNH = document.getElementById('meuPerfilValidadeCNH').value;
                }

                persistirDados(DB_KEYS.FUNCIONARIOS, listaFuncionarios).then(function() {
                    alert("Seus dados foram atualizados com sucesso!");
                });
            } else {
                alert("Erro: Seu perfil não foi encontrado no banco de dados.");
            }
        });
    }

    // --- C. SALVAR FUNCIONÁRIO (ADMIN) ---
    const formFuncionario = document.getElementById('formFuncionario');
    if (formFuncionario) {
        formFuncionario.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btnSalvar = formFuncionario.querySelector('button[type="submit"]');
            const textoOriginal = btnSalvar.innerText;
            btnSalvar.innerText = "SALVANDO...";
            btnSalvar.disabled = true;

            try {
                const idOculto = document.getElementById('funcionarioId').value;
                const emailInput = document.getElementById('funcEmail').value.trim().toLowerCase();
                const senhaInput = document.getElementById('funcSenha').value;
                const funcaoInput = document.getElementById('funcFuncao').value;

                let listaFuncionarios = APP_CACHE.funcionarios.slice();

                // Validação de Email Único
                if (!idOculto && listaFuncionarios.some(f => f.email === emailInput)) {
                    throw new Error("Este e-mail já está cadastrado.");
                }

                let novoId = idOculto ? idOculto : String(Date.now());
                let firebaseUid = null;

                // Criação de Usuário no Firebase Auth (Apenas se houver senha)
                if (window.dbRef && !idOculto && senhaInput) {
                    if (senhaInput.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
                    
                    const { getAuth, createUserWithEmailAndPassword, secondaryApp, setDoc, doc, db, signOut } = window.dbRef;
                    
                    // Usa app secundário para não deslogar o admin atual
                    const authSecundario = getAuth(secondaryApp);
                    const userCredential = await createUserWithEmailAndPassword(authSecundario, emailInput, senhaInput);
                    firebaseUid = userCredential.user.uid;

                    // Salva metadados de acesso
                    await setDoc(doc(db, "users", firebaseUid), {
                        uid: firebaseUid,
                        name: document.getElementById('funcNome').value.toUpperCase(),
                        email: emailInput,
                        role: funcaoInput,
                        company: window.CURRENT_USER.company,
                        approved: true
                    });
                    
                    await signOut(authSecundario);
                }

                // Objeto Funcionário
                const objetoFuncionario = {
                    id: novoId,
                    uid: firebaseUid || (idOculto ? (listaFuncionarios.find(f => String(f.id) === String(idOculto))?.uid || '') : ''),
                    nome: document.getElementById('funcNome').value.toUpperCase(),
                    funcao: funcaoInput,
                    email: emailInput,
                    documento: document.getElementById('funcDocumento').value,
                    telefone: document.getElementById('funcTelefone').value,
                    pix: document.getElementById('funcPix').value,
                    endereco: document.getElementById('funcEndereco').value.toUpperCase(),
                    // Campos Motorista
                    cnh: document.getElementById('funcCNH').value.toUpperCase(),
                    validadeCNH: document.getElementById('funcValidadeCNH').value,
                    categoriaCNH: document.getElementById('funcCategoriaCNH').value,
                    cursoDescricao: document.getElementById('funcCursoDescricao').value.toUpperCase()
                };

                // Insere ou Atualiza na Lista
                if (idOculto) {
                    const index = listaFuncionarios.findIndex(f => String(f.id) === String(idOculto));
                    if (index >= 0) listaFuncionarios[index] = objetoFuncionario;
                } else {
                    listaFuncionarios.push(objetoFuncionario);
                }

                await persistirDados(DB_KEYS.FUNCIONARIOS, listaFuncionarios);
                
                formFuncionario.reset();
                document.getElementById('funcionarioId').value = '';
                window.preencherTodosSelects(); // Atualiza listas
                alert("Funcionário salvo com sucesso!");

            } catch (erro) {
                alert("Erro ao salvar: " + erro.message);
            } finally {
                btnSalvar.innerText = textoOriginal;
                btnSalvar.disabled = false;
            }
        });
    }

    // --- D. SALVAR VEÍCULO ---
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const placaInput = document.getElementById('veiculoPlaca').value.toUpperCase();
            if (!placaInput) return alert("Placa obrigatória.");

            let listaVeiculos = APP_CACHE.veiculos.slice();
            const idOculto = document.getElementById('veiculoId').value;

            // Se a placa mudou na edição, remove a antiga
            if (idOculto && idOculto !== placaInput) {
                listaVeiculos = listaVeiculos.filter(v => v.placa !== idOculto);
            }

            const objetoVeiculo = {
                placa: placaInput,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value.toUpperCase()
            };

            const index = listaVeiculos.findIndex(v => v.placa === placaInput);
            if (index >= 0) listaVeiculos[index] = objetoVeiculo;
            else listaVeiculos.push(objetoVeiculo);

            persistirDados(DB_KEYS.VEICULOS, listaVeiculos).then(function() {
                formVeiculo.reset();
                document.getElementById('veiculoId').value = '';
                window.preencherTodosSelects();
                alert("Veículo salvo com sucesso!");
            });
        });
    }

    // --- E. SALVAR CONTRATANTE ---
    const formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const cnpjInput = window.limparMascara(document.getElementById('contratanteCNPJ').value);
            if (!cnpjInput) return alert("CNPJ obrigatório.");

            let listaContratantes = APP_CACHE.contratantes.slice();
            const idOculto = document.getElementById('contratanteId').value;

            if (idOculto && String(idOculto) !== String(cnpjInput)) {
                listaContratantes = listaContratantes.filter(c => String(c.cnpj) !== String(idOculto));
            }

            const objetoCliente = {
                cnpj: cnpjInput,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };

            const index = listaContratantes.findIndex(c => String(c.cnpj) === String(cnpjInput));
            if (index >= 0) listaContratantes[index] = objetoCliente;
            else listaContratantes.push(objetoCliente);

            persistirDados(DB_KEYS.CONTRATANTES, listaContratantes).then(function() {
                formContratante.reset();
                document.getElementById('contratanteId').value = '';
                window.preencherTodosSelects();
                alert("Contratante salvo com sucesso!");
            });
        });
    }

    // --- F. SALVAR OPERAÇÃO (O CORAÇÃO DO SISTEMA) ---
    const formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', function(e) {
            e.preventDefault();

            const motId = document.getElementById('selectMotoristaOperacao').value;
            const veicPlaca = document.getElementById('selectVeiculoOperacao').value;

            if (!motId || !veicPlaca) return alert("Selecione obrigatoriamente um Motorista e um Veículo.");

            const idOculto = document.getElementById('operacaoId').value;
            let listaOperacoes = APP_CACHE.operacoes.slice();
            
            // Tenta encontrar a operação antiga para preservar dados vitais
            let operacaoAntiga = idOculto ? listaOperacoes.find(o => String(o.id) === String(idOculto)) : null;

            // Define Status
            const isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            let novoStatus = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            // Se já estava em andamento, não muda o status para não travar o app do motorista
            if (operacaoAntiga && operacaoAntiga.status === 'EM_ANDAMENTO') {
                novoStatus = 'EM_ANDAMENTO';
            }

            const objetoOperacao = {
                id: idOculto ? Number(idOculto) : Date.now(),
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
                
                // Rodagem
                combustivel: Number(document.getElementById('operacaoCombustivel').value),
                precoLitro: Number(document.getElementById('operacaoPrecoLitro').value),
                kmRodado: Number(document.getElementById('operacaoKmRodado').value),

                status: novoStatus,
                
                // CRÍTICO: Preserva a estrutura de check-ins
                checkins: operacaoAntiga ? operacaoAntiga.checkins : { 
                    motorista: false, 
                    ajudantes: [], 
                    faltasAjudantes: [], 
                    faltaMotorista: false,
                    ajudantesLog: {} 
                },
                
                // Preserva KM Inicial se já começou
                kmInicial: operacaoAntiga ? operacaoAntiga.kmInicial : 0,
                kmFinal: operacaoAntiga ? operacaoAntiga.kmFinal : 0,
                dataHoraInicio: operacaoAntiga ? operacaoAntiga.dataHoraInicio : null,

                // Salva a lista de ajudantes que está visualmente na tela
                ajudantes: window._operacaoAjudantesTempList || []
            };

            // Atualiza o array
            if (idOculto) {
                // Mapeia substituindo o antigo pelo novo
                listaOperacoes = listaOperacoes.map(o => String(o.id) === String(idOculto) ? objetoOperacao : o);
            } else {
                listaOperacoes.push(objetoOperacao);
            }

            persistirDados(DB_KEYS.OPERACOES, listaOperacoes).then(function() {
                formOperacao.reset();
                document.getElementById('operacaoId').value = '';
                
                // Limpa lista temporária de ajudantes
                window._operacaoAjudantesTempList = [];
                document.getElementById('listaAjudantesAdicionados').innerHTML = '';
                
                // Atualiza telas
                window.preencherTodosSelects();
                window.renderizarCalendario();
                if(window.atualizarDashboard) window.atualizarDashboard();
                
                alert("Operação lançada com sucesso!");
            });
        });
    }

    // --- G. SALVAR CHECK-IN (APP MOBILE FUNCIONÁRIO) ---
    const formCheckin = document.getElementById('formCheckinConfirm');
    if (formCheckin) {
        formCheckin.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const opId = document.getElementById('checkinOpId').value;
            const step = document.getElementById('checkinStep').value;
            
            let listaOperacoes = APP_CACHE.operacoes.slice();
            const index = listaOperacoes.findIndex(o => String(o.id) === String(opId));
            
            if (index < 0) return alert("Erro: Operação não encontrada.");
            
            let op = listaOperacoes[index];
            
            // Identifica quem está fazendo o check-in
            const usuarioLogado = APP_CACHE.funcionarios.find(f => 
                f.uid === window.CURRENT_USER.uid || f.email === window.CURRENT_USER.email
            );

            if (!usuarioLogado) return alert("Erro de perfil de usuário.");

            // Lógica para MOTORISTA
            if (usuarioLogado.funcao === 'motorista') {
                if (step === 'start') {
                    const kmInformado = Number(document.getElementById('checkinKmInicial').value);
                    const ultimoKm = window.obterUltimoKmFinal(op.veiculoPlaca);
                    
                    if (!kmInformado || kmInformado < ultimoKm) {
                        return alert(`KM Inválido. O odômetro não pode ser menor que o último registrado (${ultimoKm}).`);
                    }
                    
                    op.kmInicial = kmInformado;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = new Date().toISOString();
                } else {
                    const kmFinal = Number(document.getElementById('checkinKmFinal').value);
                    if (!kmFinal || kmFinal <= op.kmInicial) {
                        return alert("KM Final deve ser maior que o Inicial.");
                    }
                    
                    op.kmFinal = kmFinal;
                    op.kmRodado = kmFinal - (op.kmInicial || 0);
                    op.combustivel = Number(document.getElementById('checkinValorAbastecido').value);
                    op.precoLitro = Number(document.getElementById('checkinPrecoLitroConfirm').value);
                    op.status = 'CONFIRMADA';
                }
            } 
            // Lógica para AJUDANTE
            else {
                if (!op.checkins.ajudantes) op.checkins.ajudantes = [];
                
                // Evita duplicidade
                if (!op.checkins.ajudantes.includes(String(usuarioLogado.id))) {
                    op.checkins.ajudantes.push(String(usuarioLogado.id));
                    
                    // Log de horário
                    if(!op.checkins.ajudantesLog) op.checkins.ajudantesLog = {};
                    op.checkins.ajudantesLog[usuarioLogado.id] = new Date().toISOString();
                }
            }
            
            persistirDados(DB_KEYS.OPERACOES, listaOperacoes).then(function() {
                window.closeCheckinConfirmModal(); // Fecha modal se existir função global
                window.renderizarCheckinsTable();
                alert("Check-in registrado com sucesso!");
            });
        });
    }
}

// -----------------------------------------------------------------------------
// 23. RELATÓRIOS E RECIBOS
// -----------------------------------------------------------------------------

// Gerar Relatório Geral Detalhado
window.gerarRelatorioGeral = function() {
    const dataInicio = document.getElementById('dataInicioRelatorio').value;
    const dataFim = document.getElementById('dataFimRelatorio').value;
    const filtroFuncionarioId = document.getElementById('selectMotoristaRelatorio').value;
    const filtroPlaca = document.getElementById('selectVeiculoRelatorio').value;
    const filtroCliente = document.getElementById('selectContratanteRelatorio').value;

    if (!dataInicio || !dataFim) return alert("Por favor, selecione as datas de início e fim.");

    // Filtra Operações
    const operacoes = APP_CACHE.operacoes.filter(function(op) {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < dataInicio || op.data > dataFim) return false;
        
        // Filtro de Funcionário (Motorista OU Ajudante)
        if (filtroFuncionarioId) {
            const ehMotorista = String(op.motoristaId) === String(filtroFuncionarioId);
            const ehAjudante = (op.ajudantes || []).some(aj => String(aj.id) === String(filtroFuncionarioId));
            if (!ehMotorista && !ehAjudante) return false;
        }

        if (filtroPlaca && op.veiculoPlaca !== filtroPlaca) return false;
        if (filtroCliente && op.contratanteCNPJ !== filtroCliente) return false;
        
        return true;
    });

    let html = `
        <h3 style="text-align:center;">RELATÓRIO DE SERVIÇOS DETALHADO</h3>
        <p style="text-align:center;">Período: ${window.formatarDataBrasileira(dataInicio)} a ${window.formatarDataBrasileira(dataFim)}</p>
        <table class="data-table" style="width:100%; font-size:0.85rem;">
            <thead>
                <tr style="background:#eee;">
                    <th>DATA</th>
                    <th>ID</th>
                    <th>VEÍCULO</th>
                    <th>CLIENTE</th>
                    <th>FATURAMENTO</th>
                    <th>CUSTO TOTAL</th>
                    <th>LUCRO</th>
                </tr>
            </thead>
            <tbody>
    `;

    let totalFaturamento = 0;
    let totalLucro = 0;

    operacoes.forEach(function(op) {
        const faturamento = Number(op.faturamento) || 0;
        
        // Custo = Diesel + Despesas + Equipe
        let custoTotal = window.calcularCustoConsumoViagem(op) + (Number(op.despesas) || 0);
        
        // Soma equipe se não faltou
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoTotal += (Number(op.comissao) || 0);
        }
        (op.ajudantes || []).forEach(aj => {
            if (!op.checkins || !op.checkins.faltasAjudantes || !op.checkins.faltasAjudantes.includes(String(aj.id))) {
                custoTotal += (Number(aj.diaria) || 0);
            }
        });

        const lucro = faturamento - custoTotal;
        totalFaturamento += faturamento;
        totalLucro += lucro;

        const nomeCliente = window.buscarContratantePorCNPJ(op.contratanteCNPJ)?.razaoSocial || '-';

        html += `
            <tr>
                <td>${window.formatarDataBrasileira(op.data)}</td>
                <td>#${op.id}</td>
                <td>${op.veiculoPlaca}</td>
                <td>${nomeCliente}</td>
                <td>${window.formatarMoeda(faturamento)}</td>
                <td>${window.formatarMoeda(custoTotal)}</td>
                <td style="color:${lucro >= 0 ? 'green' : 'red'}; font-weight:bold;">${window.formatarMoeda(lucro)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot>
                <tr style="background:#37474f; color:white; font-weight:bold;">
                    <td colspan="4" style="text-align:right; padding-right:10px;">TOTAIS</td>
                    <td>${window.formatarMoeda(totalFaturamento)}</td>
                    <td>-</td>
                    <td>${window.formatarMoeda(totalLucro)}</td>
                </tr>
            </tfoot>
        </table>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// Gerar Recibo de Pagamento (2 vias)
window.gerarReciboPagamento = function() {
    const funcId = document.getElementById('selectMotoristaRecibo').value;
    const dataIni = document.getElementById('dataInicioRecibo').value;
    const dataFim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dataIni || !dataFim) return alert("Preencha funcionário e datas.");

    const funcionario = window.buscarFuncionarioPorId(funcId);
    const dadosEmpresa = window.buscarMinhaEmpresa();

    // Filtra serviços
    const ops = APP_CACHE.operacoes.filter(o => o.status === 'CONFIRMADA' && o.data >= dataIni && o.data <= dataFim);
    
    let valorTotal = 0;
    let detalhesHtml = '';

    ops.forEach(op => {
        let valor = 0;
        let obs = '';

        // Verifica se é motorista nesta op
        if (String(op.motoristaId) === String(funcId)) {
            if (op.checkins && op.checkins.faltaMotorista) {
                obs = ' (FALTA - DESCONTADO)';
                valor = 0;
            } else {
                valor = Number(op.comissao) || 0;
            }
        } 
        // Verifica se é ajudante
        else if (op.ajudantes) {
            const aj = op.ajudantes.find(a => String(a.id) === String(funcId));
            if (aj) {
                if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(funcId))) {
                    obs = ' (FALTA - DESCONTADO)';
                    valor = 0;
                } else {
                    valor = Number(aj.diaria) || 0;
                }
            }
        }

        if (valor > 0 || obs !== '') {
            valorTotal += valor;
            detalhesHtml += `<li>Data: ${window.formatarDataBrasileira(op.data)} - Veículo: ${op.veiculoPlaca} - Valor: <strong>${window.formatarMoeda(valor)}</strong>${obs}</li>`;
        }
    });

    // Função interna para gerar o HTML de uma via
    function criarVia(titulo) {
        return `
            <div style="border:1px solid #000; padding:20px; margin-bottom:20px;">
                <h3 style="text-align:center; text-decoration:underline;">RECIBO DE PAGAMENTO - ${titulo}</h3>
                <p style="text-align:justify; margin-top:20px;">
                    Eu, <strong>${funcionario.nome}</strong>, inscrito(a) no CPF/CNH sob nº <strong>${funcionario.documento}</strong>, 
                    declaro ter recebido da empresa <strong>${dadosEmpresa.razaoSocial || 'A EMPRESA'}</strong> 
                    (CNPJ: ${dadosEmpresa.cnpj || 'ND'}), a importância líquida de 
                    <span style="font-size:1.2em; font-weight:bold;">${window.formatarMoeda(valorTotal)}</span>, 
                    referente aos serviços de transporte/diárias prestados no período de 
                    ${window.formatarDataBrasileira(dataIni)} a ${window.formatarDataBrasileira(dataFim)}, 
                    conforme detalhamento abaixo:
                </p>
                <ul style="font-size:0.9em; border:1px dashed #ccc; padding:10px 20px;">
                    ${detalhesHtml || '<li>Nenhum serviço remunerado no período.</li>'}
                </ul>
                <p style="text-align:justify;">
                    Pelo que firmo o presente recibo dando plena, rasa e geral quitação das obrigações acima discriminadas.
                </p>
                <br><br>
                <div style="display:flex; justify-content:space-between; margin-top:30px;">
                    <div style="text-align:center;">
                        __________________________________________<br>
                        <strong>${dadosEmpresa.razaoSocial || 'Assinatura Empregador'}</strong>
                    </div>
                    <div style="text-align:center;">
                        __________________________________________<br>
                        <strong>${funcionario.nome}</strong><br>
                        (Funcionário/Prestador)
                    </div>
                </div>
                <p style="text-align:center; margin-top:20px; font-size:0.8em;">
                    Emitido em: ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}
                </p>
            </div>
        `;
    }

    const htmlCompleto = criarVia("1ª VIA (EMPREGADOR)") + 
                         `<div style="text-align:center; margin:20px 0; border-bottom:2px dashed #000; position:relative;">
                            <span style="position:absolute; top:-10px; left:45%; background:white; padding:0 10px;">CORTE AQUI</span>
                          </div>` + 
                         criarVia("2ª VIA (FUNCIONÁRIO)");

    document.getElementById('reciboContent').innerHTML = htmlCompleto;
};

// Gerar Relatório de Cobrança
window.gerarRelatorioCobranca = function() {
    const clienteId = document.getElementById('selectContratanteRelatorio').value;
    const ini = document.getElementById('dataInicioRelatorio').value;
    const fim = document.getElementById('dataFimRelatorio').value;

    if (!clienteId) return alert("Selecione um Cliente.");
    
    const cliente = window.buscarContratantePorCNPJ(clienteId);
    const ops = APP_CACHE.operacoes.filter(o => 
        o.contratanteCNPJ === clienteId && 
        o.status === 'CONFIRMADA' &&
        o.data >= ini && o.data <= fim
    );

    let total = 0;
    ops.forEach(o => total += (Number(o.faturamento) || 0));

    let html = `
        <div style="border:2px solid #000; padding:30px;">
            <h2 style="text-align:center;">DEMONSTRATIVO DE SERVIÇOS (FATURA)</h2>
            <div style="display:flex; justify-content:space-between; margin-top:20px;">
                <div>
                    <strong>DE:</strong> ${window.buscarMinhaEmpresa()?.razaoSocial || 'TRANSPORTADORA'}<br>
                    <strong>PARA:</strong> ${cliente.razaoSocial}<br>
                    <strong>CNPJ:</strong> ${cliente.cnpj}
                </div>
                <div style="text-align:right;">
                    Data Emissão: ${new Date().toLocaleDateString()}<br>
                    Vencimento: À VISTA
                </div>
            </div>
            <table style="width:100%; border-collapse:collapse; margin-top:30px;">
                <thead>
                    <tr style="border-bottom:2px solid #000;">
                        <th style="text-align:left;">DATA</th>
                        <th style="text-align:left;">VEÍCULO</th>
                        <th style="text-align:right;">VALOR</th>
                    </tr>
                </thead>
                <tbody>
    `;

    ops.forEach(o => {
        html += `
            <tr style="border-bottom:1px solid #ccc;">
                <td style="padding:8px 0;">${window.formatarDataBrasileira(o.data)}</td>
                <td>${o.veiculoPlaca}</td>
                <td style="text-align:right;">${window.formatarMoeda(o.faturamento)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <h3 style="text-align:right; margin-top:40px;">TOTAL A PAGAR: ${window.formatarMoeda(total)}</h3>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// Exportar PDF
window.exportarRelatorioPDF = function() {
    const el = document.getElementById('reportContent');
    if (el && el.innerText.trim() !== '') {
        const opt = {
            margin: 10,
            filename: 'relatorio_logimaster.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(el).save();
    } else {
        alert("Gere o relatório primeiro.");
    }
};

// -----------------------------------------------------------------------------
// 24. DASHBOARD E GRÁFICOS
// -----------------------------------------------------------------------------

window.atualizarDashboard = function() {
    if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'admin') return;

    const operacoes = APP_CACHE.operacoes;
    const dataRef = window.currentDate || new Date();
    
    // Filtra mês atual
    const opsMes = operacoes.filter(function(op) {
        if (op.status !== 'CONFIRMADA') return false;
        const d = new Date(op.data);
        return d.getMonth() === dataRef.getMonth() && d.getFullYear() === dataRef.getFullYear();
    });

    let fatTotal = 0;
    let custoTotal = 0;

    opsMes.forEach(function(op) {
        fatTotal += (Number(op.faturamento) || 0);
        
        let cDiesel = window.calcularCustoConsumoViagem(op);
        let cDesp = Number(op.despesas) || 0;
        let cPessoal = 0;
        
        if (!op.checkins?.faltaMotorista) cPessoal += (Number(op.comissao) || 0);
        (op.ajudantes || []).forEach(aj => {
            if (!op.checkins?.faltasAjudantes?.includes(String(aj.id))) {
                cPessoal += (Number(aj.diaria) || 0);
            }
        });

        custoTotal += (cDiesel + cDesp + cPessoal);
    });

    const lucro = fatTotal - custoTotal;

    // Atualiza Labels
    if(document.getElementById('faturamentoMes')) document.getElementById('faturamentoMes').textContent = window.formatarMoeda(fatTotal);
    if(document.getElementById('despesasMes')) document.getElementById('despesasMes').textContent = window.formatarMoeda(custoTotal);
    
    const elLucro = document.getElementById('receitaMes');
    if (elLucro) {
        elLucro.textContent = window.formatarMoeda(lucro);
        elLucro.style.color = lucro >= 0 ? '#2e7d32' : '#c62828';
    }

    // Atualiza Chart.js
    const ctx = document.getElementById('mainChart');
    if (ctx) {
        if (window.myChartInstance) window.myChartInstance.destroy();
        
        window.myChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['FATURAMENTO', 'CUSTOS TOTAIS', 'LUCRO LÍQUIDO'],
                datasets: [{
                    label: 'Resultados do Mês (R$)',
                    data: [fatTotal, custoTotal, lucro],
                    backgroundColor: [
                        'rgba(0, 150, 136, 0.8)', // Verde Teal
                        'rgba(244, 67, 54, 0.8)', // Vermelho
                        lucro >= 0 ? 'rgba(76, 175, 80, 0.8)' : 'rgba(183, 28, 28, 0.8)' // Verde ou Vermelho Escuro
                    ],
                    borderColor: [
                        'rgba(0, 150, 136, 1)',
                        'rgba(244, 67, 54, 1)',
                        'rgba(76, 175, 80, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
};

// -----------------------------------------------------------------------------
// 25. INICIALIZAÇÃO DO SISTEMA E NAVEGAÇÃO
// -----------------------------------------------------------------------------

// Configura navegação do menu lateral
function configurarNavegacao() {
    const itensMenu = document.querySelectorAll('.nav-item');
    
    itensMenu.forEach(function(item) {
        // Clona e substitui para remover listeners antigos e evitar duplicação
        const novoItem = item.cloneNode(true);
        item.parentNode.replaceChild(novoItem, item);
        
        novoItem.addEventListener('click', function() {
            const paginaAlvoId = novoItem.getAttribute('data-page');
            
            // 1. Remove classe active de tudo
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            // 2. Ativa alvo
            novoItem.classList.add('active');
            const paginaAlvo = document.getElementById(paginaAlvoId);
            if (paginaAlvo) paginaAlvo.classList.add('active');
            
            // 3. Fecha menu mobile
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
            
            // 4. Ações específicas ao abrir página
            if (paginaAlvoId === 'home') {
                window.renderizarCalendario();
                window.atualizarDashboard();
            }
            if (paginaAlvoId === 'checkins-pendentes') {
                window.renderizarTabelaMonitoramento();
            }
            if (paginaAlvoId === 'meus-dados') {
                window.renderizarPainelMeusDados();
            }
        });
    });

    // Configura abas internas (ex: Cadastro -> Veiculos vs Funcionarios)
    document.querySelectorAll('.cadastro-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cadastro-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cadastro-form').forEach(f => f.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Função Principal de Login/Inicialização
window.initSystemByRole = function(user) {
    window.CURRENT_USER = user;
    console.log("Sistema iniciado para:", user.role);

    // Esconde todos os menus
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';

    let paginaInicial = 'home';

    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        paginaInicial = 'super-admin';
    } 
    else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        paginaInicial = 'home';
        
        window.preencherTodosSelects();
        window.renderizarCalendario();
        window.atualizarDashboard();
        window.renderizarInformacoesEmpresa();
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        paginaInicial = 'employee-home';
        window.IS_READ_ONLY = true;
        
        // Carrega dados específicos do funcionário
        window.renderizarPainelMeusDados();
        window.renderizarTabelaMonitoramento(); // Vê seus próprios checkins
    }

    // Configura cliques do menu
    configurarNavegacao();

    // Simula clique na página inicial
    const linkInicial = document.querySelector(`.nav-item[data-page="${paginaInicial}"]`);
    if (linkInicial) linkInicial.click();

    // Inicia ouvintes do Firebase
    if (window.dbRef && user.company) {
        const { db, doc, onSnapshot } = window.dbRef;
        const dominio = user.company;

        Object.values(DB_KEYS).forEach(chave => {
            onSnapshot(doc(db, 'companies', dominio, 'data', chave), (snap) => {
                if (snap.exists()) {
                    const dados = snap.data().items;
                    // Atualiza cache silenciosamente
                    if (chave === DB_KEYS.MINHA_EMPRESA) APP_CACHE.minhaEmpresa = dados || {};
                    else if (chave === DB_KEYS.FUNCIONARIOS) APP_CACHE.funcionarios = dados || [];
                    else if (chave === DB_KEYS.OPERACOES) APP_CACHE.operacoes = dados || [];
                    else if (chave === DB_KEYS.VEICULOS) APP_CACHE.veiculos = dados || [];
                    // ... mapear outros se necessário ...
                    
                    // Se for alteração crítica, re-renderiza
                    if (chave === DB_KEYS.OPERACOES) {
                        window.renderizarTabelaOperacoes();
                        window.renderizarCalendario();
                        window.atualizarDashboard();
                        window.renderizarTabelaMonitoramento();
                    } else {
                        window.preencherTodosSelects();
                    }
                }
            });
        });
    }
};

// Evento DOM Ready (Boot)
document.addEventListener('DOMContentLoaded', () => {
    configurarFormularios();
    configurarNavegacao();

    // Toggle Menu Mobile
    const btnMobile = document.getElementById('mobileMenuBtn');
    if (btnMobile) {
        btnMobile.addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('active');
            document.getElementById('sidebarOverlay').classList.add('active');
        });
    }
    
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Helper: Adicionar Ajudante na Tela de Operação
    window._operacaoAjudantesTempList = [];
    const btnAddAjudante = document.getElementById('btnManualAddAjudante');
    if (btnAddAjudante) {
        btnAddAjudante.addEventListener('click', function() {
            const select = document.getElementById('selectAjudantesOperacao');
            const idAj = select.value;
            if (!idAj) return alert("Selecione um ajudante.");
            
            const funcAj = window.buscarFuncionarioPorId(idAj);
            const valorDiaria = prompt(`Qual o valor da diária para ${funcAj.nome}?`, "0");
            
            if (valorDiaria !== null) {
                window._operacaoAjudantesTempList.push({
                    id: idAj,
                    diaria: Number(valorDiaria.replace(',', '.'))
                });
                window.renderizarListaAjudantesAdicionados();
                select.value = ''; // Reseta
            }
        });
    }
});

// Renderiza a lista visual de ajudantes na tela de lançamento
window.renderizarListaAjudantesAdicionados = function() {
    const ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    
    ul.innerHTML = window._operacaoAjudantesTempList.map(item => {
        const f = window.buscarFuncionarioPorId(item.id);
        const nome = f ? f.nome : 'Desconhecido';
        return `
            <li>
                ${nome} (${window.formatarMoeda(item.diaria)})
                <button type="button" class="btn-mini delete-btn" onclick="
                    window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(x => x.id !== '${item.id}');
                    window.renderizarListaAjudantesAdicionados();
                ">Remover</button>
            </li>
        `;
    }).join('');
};