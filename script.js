// =============================================================================
// ARQUIVO: script.js
// VERSÃO: 18.0 (MODELO ORIGINAL EXTENSO - SEM ABREVIAÇÕES)
// PARTE 1: VARIÁVEIS, CONSTANTES, FORMATAÇÃO E CÁLCULOS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONSTANTES DE CHAVES DE ARMAZENAMENTO (BANCO DE DADOS)
// -----------------------------------------------------------------------------
const CHAVE_DB_FUNCIONARIOS = 'db_funcionarios';
const CHAVE_DB_VEICULOS = 'db_veiculos';
const CHAVE_DB_CONTRATANTES = 'db_contratantes';
const CHAVE_DB_OPERACOES = 'db_operacoes';
const CHAVE_DB_MINHA_EMPRESA = 'db_minha_empresa';
const CHAVE_DB_DESPESAS = 'db_despesas_gerais';
const CHAVE_DB_ATIVIDADES = 'db_atividades';
const CHAVE_DB_CHECKINS = 'db_checkins'; // Logs brutos
const CHAVE_DB_PROFILE_REQUESTS = 'db_profile_requests';

// -----------------------------------------------------------------------------
// 2. VARIÁVEIS GLOBAIS DE ESTADO
// -----------------------------------------------------------------------------
window.USUARIO_ATUAL = null; // Armazena o objeto do usuário logado
window.MODO_APENAS_LEITURA = false; // Define se é admin ou funcionário
window.DATA_CALENDARIO_ATUAL = new Date(); // Data selecionada no calendário

// Cache local para performance (evita ler localStorage toda hora)
var CACHE_FUNCIONARIOS = [];
var CACHE_VEICULOS = [];
var CACHE_CONTRATANTES = [];
var CACHE_OPERACOES = [];
var CACHE_MINHA_EMPRESA = {};
var CACHE_DESPESAS = [];
var CACHE_ATIVIDADES = [];

// -----------------------------------------------------------------------------
// 3. FUNÇÕES DE FORMATAÇÃO (ÚTEIS)
// -----------------------------------------------------------------------------

/**
 * Formata um número para o padrão de moeda brasileiro (R$ 1.000,00)
 */
function formatarValorMoeda(valor) {
    var numero = Number(valor);
    if (isNaN(numero)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numero);
}

/**
 * Converte uma data ISO (YYYY-MM-DD) para o formato brasileiro (DD/MM/AAAA)
 * Resolve problemas de fuso horário criando a data com componentes locais.
 */
function formatarDataParaBrasileiro(dataIso) {
    if (!dataIso) return '-';
    // Divide a string para evitar conversão de fuso horário do browser
    var partes = dataIso.split('-');
    if (partes.length === 3) {
        var ano = partes[0];
        var mes = partes[1];
        var dia = partes[2];
        return dia + '/' + mes + '/' + ano;
    }
    return dataIso;
}

/**
 * Formata Data e Hora completa
 */
function formatarDataHoraBrasileira(dataIsoString) {
    if (!dataIsoString) return '-';
    var dataObj = new Date(dataIsoString);
    if (isNaN(dataObj.getTime())) return '-';
    
    return dataObj.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formata CPF ou CNPJ (apenas remove caracteres não numéricos e coloca em Maiúsculo se houver letras)
 */
function formatarDocumento(doc) {
    if (!doc) return '';
    return String(doc).toUpperCase();
}

/**
 * Formata Telefone para padrão (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
function formatarTelefoneBrasil(telefone) {
    var numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.length > 10) {
        // Celular (11 dígitos)
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 7) + '-' + numeros.slice(7, 11);
    } else if (numeros.length > 6) {
        // Fixo (10 dígitos)
        return '(' + numeros.slice(0, 2) + ') ' + numeros.slice(2, 6) + '-' + numeros.slice(6);
    }
    return telefone;
}

// -----------------------------------------------------------------------------
// 4. FUNÇÕES DE CARREGAMENTO DE DADOS (INDIVIDUAIS E EXPLÍCITAS)
// -----------------------------------------------------------------------------

function carregarListaFuncionarios() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_FUNCIONARIOS);
        if (dados) {
            CACHE_FUNCIONARIOS = JSON.parse(dados);
        } else {
            CACHE_FUNCIONARIOS = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar funcionários:", erro);
        CACHE_FUNCIONARIOS = [];
    }
    return CACHE_FUNCIONARIOS;
}

function carregarListaVeiculos() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_VEICULOS);
        if (dados) {
            CACHE_VEICULOS = JSON.parse(dados);
        } else {
            CACHE_VEICULOS = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar veículos:", erro);
        CACHE_VEICULOS = [];
    }
    return CACHE_VEICULOS;
}

function carregarListaContratantes() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_CONTRATANTES);
        if (dados) {
            CACHE_CONTRATANTES = JSON.parse(dados);
        } else {
            CACHE_CONTRATANTES = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar contratantes:", erro);
        CACHE_CONTRATANTES = [];
    }
    return CACHE_CONTRATANTES;
}

function carregarListaOperacoes() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_OPERACOES);
        if (dados) {
            CACHE_OPERACOES = JSON.parse(dados);
        } else {
            CACHE_OPERACOES = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar operações:", erro);
        CACHE_OPERACOES = [];
    }
    return CACHE_OPERACOES;
}

function carregarDadosMinhaEmpresa() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_MINHA_EMPRESA);
        if (dados) {
            CACHE_MINHA_EMPRESA = JSON.parse(dados);
        } else {
            CACHE_MINHA_EMPRESA = {};
        }
    } catch (erro) {
        console.error("Erro ao carregar minha empresa:", erro);
        CACHE_MINHA_EMPRESA = {};
    }
    return CACHE_MINHA_EMPRESA;
}

function carregarListaDespesas() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_DESPESAS);
        if (dados) {
            CACHE_DESPESAS = JSON.parse(dados);
        } else {
            CACHE_DESPESAS = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar despesas:", erro);
        CACHE_DESPESAS = [];
    }
    return CACHE_DESPESAS;
}

function carregarListaAtividades() {
    try {
        var dados = localStorage.getItem(CHAVE_DB_ATIVIDADES);
        if (dados) {
            CACHE_ATIVIDADES = JSON.parse(dados);
        } else {
            CACHE_ATIVIDADES = [];
        }
    } catch (erro) {
        console.error("Erro ao carregar atividades:", erro);
        CACHE_ATIVIDADES = [];
    }
    return CACHE_ATIVIDADES;
}

// Inicializa todos os carregamentos ao iniciar o script
carregarListaFuncionarios();
carregarListaVeiculos();
carregarListaContratantes();
carregarListaOperacoes();
carregarDadosMinhaEmpresa();
carregarListaDespesas();
carregarListaAtividades();

// -----------------------------------------------------------------------------
// 5. FUNÇÕES DE PERSISTÊNCIA DE DADOS (INDIVIDUAIS E EXPLÍCITAS)
// -----------------------------------------------------------------------------

async function salvarListaFuncionarios(novaLista) {
    // 1. Atualiza memória
    CACHE_FUNCIONARIOS = novaLista;
    // 2. Salva localmente
    localStorage.setItem(CHAVE_DB_FUNCIONARIOS, JSON.stringify(novaLista));
    // 3. Sincroniza com Firebase (se aplicável)
    await sincronizarComFirebase(CHAVE_DB_FUNCIONARIOS, novaLista);
}

async function salvarListaVeiculos(novaLista) {
    CACHE_VEICULOS = novaLista;
    localStorage.setItem(CHAVE_DB_VEICULOS, JSON.stringify(novaLista));
    await sincronizarComFirebase(CHAVE_DB_VEICULOS, novaLista);
}

async function salvarListaContratantes(novaLista) {
    CACHE_CONTRATANTES = novaLista;
    localStorage.setItem(CHAVE_DB_CONTRATANTES, JSON.stringify(novaLista));
    await sincronizarComFirebase(CHAVE_DB_CONTRATANTES, novaLista);
}

async function salvarListaOperacoes(novaLista) {
    CACHE_OPERACOES = novaLista;
    localStorage.setItem(CHAVE_DB_OPERACOES, JSON.stringify(novaLista));
    await sincronizarComFirebase(CHAVE_DB_OPERACOES, novaLista);
}

async function salvarDadosMinhaEmpresa(objetoEmpresa) {
    CACHE_MINHA_EMPRESA = objetoEmpresa;
    localStorage.setItem(CHAVE_DB_MINHA_EMPRESA, JSON.stringify(objetoEmpresa));
    await sincronizarComFirebase(CHAVE_DB_MINHA_EMPRESA, objetoEmpresa);
}

async function salvarListaDespesas(novaLista) {
    CACHE_DESPESAS = novaLista;
    localStorage.setItem(CHAVE_DB_DESPESAS, JSON.stringify(novaLista));
    await sincronizarComFirebase(CHAVE_DB_DESPESAS, novaLista);
}

async function salvarListaAtividades(novaLista) {
    CACHE_ATIVIDADES = novaLista;
    localStorage.setItem(CHAVE_DB_ATIVIDADES, JSON.stringify(novaLista));
    await sincronizarComFirebase(CHAVE_DB_ATIVIDADES, novaLista);
}

// Função auxiliar exclusiva para a conexão com o Firebase
async function sincronizarComFirebase(chave, dados) {
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
                console.error("Erro de sincronização Firebase (" + chave + "):", erro);
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 6. FUNÇÕES DE BUSCA (GETTERS)
// -----------------------------------------------------------------------------

function buscarFuncionarioPorId(id) {
    // Converte para string para garantir comparação correta
    var idBusca = String(id).trim();
    return CACHE_FUNCIONARIOS.find(function(f) {
        return String(f.id).trim() === idBusca;
    });
}

function buscarVeiculoPorPlaca(placa) {
    var placaBusca = String(placa).toUpperCase().trim();
    return CACHE_VEICULOS.find(function(v) {
        return String(v.placa).toUpperCase().trim() === placaBusca;
    });
}

function buscarContratantePorCnpj(cnpj) {
    var cnpjBusca = String(cnpj).trim();
    return CACHE_CONTRATANTES.find(function(c) {
        return String(c.cnpj).trim() === cnpjBusca;
    });
}

// -----------------------------------------------------------------------------
// 7. CÁLCULOS MATEMÁTICOS DE FROTA
// -----------------------------------------------------------------------------

/**
 * Busca o maior KM final registrado para um veículo no banco de operações.
 * Usado para validar se o motorista não está inserindo um KM menor que o anterior.
 */
function obterUltimoKmRegistrado(placa) {
    if (!placa) return 0;
    
    var operacoesDoVeiculo = CACHE_OPERACOES.filter(function(op) {
        return op.veiculoPlaca === placa && Number(op.kmFinal) > 0;
    });

    if (operacoesDoVeiculo.length === 0) {
        return 0;
    }

    // Mapeia para pegar apenas os KMs e encontra o máximo
    var kms = operacoesDoVeiculo.map(function(op) {
        return Number(op.kmFinal);
    });

    return Math.max.apply(null, kms);
}

/**
 * Calcula o custo estimado de combustível para uma viagem.
 * Prioriza o valor real abastecido. Se não houver, estima pela média do veículo.
 */
function calcularCustoViagemDiesel(operacao) {
    if (!operacao || operacao.status !== 'CONFIRMADA') {
        return 0;
    }

    // 1. Se o motorista informou o valor abastecido, usamos esse valor real
    if (operacao.combustivel && Number(operacao.combustivel) > 0) {
        return Number(operacao.combustivel);
    }

    // 2. Se não, tentamos estimar pelo KM percorrido
    var kmPercorrido = Number(operacao.kmRodado);
    if (!kmPercorrido || kmPercorrido <= 0) {
        return 0;
    }

    // Média padrão conservadora
    var mediaConsumo = 3.5; 
    var precoLitro = Number(operacao.precoLitro) || 0;

    // Se o preço não foi informado na operação, usamos um padrão médio de mercado
    if (precoLitro <= 0) {
        precoLitro = 6.00; 
    }

    var litrosEstimados = kmPercorrido / mediaConsumo;
    return litrosEstimados * precoLitro;
}
// =============================================================================
// PARTE 2: INTERFACE DE USUÁRIO (UI) - TABELAS E LISTAGENS
// =============================================================================

// -----------------------------------------------------------------------------
// 8. RENDERIZAÇÃO DA TABELA DE FUNCIONÁRIOS
// -----------------------------------------------------------------------------
function renderizarTabelaFuncionarios() {
    var tabela = document.getElementById('tabelaFuncionarios');
    if (!tabela) return;

    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = ''; // Limpa conteúdo anterior

    var listaFuncionarios = CACHE_FUNCIONARIOS;

    if (listaFuncionarios.length === 0) {
        var row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="text-align:center; padding:15px;">Nenhum funcionário cadastrado no sistema.</td>';
        tbody.appendChild(row);
        return;
    }

    listaFuncionarios.forEach(function(funcionario) {
        var tr = document.createElement('tr');
        
        // Coluna Nome
        var tdNome = document.createElement('td');
        tdNome.textContent = funcionario.nome;
        tr.appendChild(tdNome);

        // Coluna Função
        var tdFuncao = document.createElement('td');
        tdFuncao.textContent = funcionario.funcao.toUpperCase();
        tr.appendChild(tdFuncao);

        // Coluna Telefone
        var tdTelefone = document.createElement('td');
        tdTelefone.textContent = formatarTelefoneBrasil(funcionario.telefone);
        tr.appendChild(tdTelefone);

        // Coluna Ações
        var tdAcoes = document.createElement('td');
        tdAcoes.style.whiteSpace = 'nowrap';

        if (!window.MODO_APENAS_LEITURA) {
            // Botão Editar
            var btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.title = 'Editar Funcionário';
            btnEditar.onclick = function() {
                preencherFormularioFuncionario(funcionario.id);
            };
            tdAcoes.appendChild(btnEditar);

            // Espaçamento
            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            var btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.title = 'Excluir Funcionário';
            btnExcluir.onclick = function() {
                excluirFuncionario(funcionario.id);
            };
            tdAcoes.appendChild(btnExcluir);
        } else {
            // Apenas visualização para funcionários comuns
            var btnVer = document.createElement('button');
            btnVer.className = 'btn-mini btn-primary';
            btnVer.innerHTML = '<i class="fas fa-lock"></i>';
            btnVer.disabled = true;
            tdAcoes.appendChild(btnVer);
        }

        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 9. RENDERIZAÇÃO DA TABELA DE VEÍCULOS
// -----------------------------------------------------------------------------
function renderizarTabelaVeiculos() {
    var tabela = document.getElementById('tabelaVeiculos');
    if (!tabela) return;

    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    var listaVeiculos = CACHE_VEICULOS;

    if (listaVeiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhum veículo cadastrado.</td></tr>';
        return;
    }

    listaVeiculos.forEach(function(veiculo) {
        var tr = document.createElement('tr');

        // Coluna Placa
        var tdPlaca = document.createElement('td');
        tdPlaca.textContent = veiculo.placa;
        tdPlaca.style.fontWeight = 'bold';
        tr.appendChild(tdPlaca);

        // Coluna Modelo
        var tdModelo = document.createElement('td');
        tdModelo.textContent = veiculo.modelo;
        tr.appendChild(tdModelo);

        // Coluna Ano
        var tdAno = document.createElement('td');
        tdAno.textContent = veiculo.ano;
        tr.appendChild(tdAno);

        // Coluna Ações
        var tdAcoes = document.createElement('td');
        
        if (!window.MODO_APENAS_LEITURA) {
            // Botão Editar
            var btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() {
                preencherFormularioVeiculo(veiculo.placa);
            };
            tdAcoes.appendChild(btnEditar);

            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            var btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.onclick = function() {
                excluirVeiculo(veiculo.placa);
            };
            tdAcoes.appendChild(btnExcluir);
        }

        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 10. RENDERIZAÇÃO DA TABELA DE CONTRATANTES (CLIENTES)
// -----------------------------------------------------------------------------
function renderizarTabelaContratantes() {
    var tabela = document.getElementById('tabelaContratantes');
    if (!tabela) return;

    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    var listaContratantes = CACHE_CONTRATANTES;

    if (listaContratantes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

    listaContratantes.forEach(function(cliente) {
        var tr = document.createElement('tr');

        var tdRazao = document.createElement('td');
        tdRazao.textContent = cliente.razaoSocial;
        tr.appendChild(tdRazao);

        var tdCNPJ = document.createElement('td');
        tdCNPJ.textContent = formatarDocumento(cliente.cnpj);
        tr.appendChild(tdCNPJ);

        var tdTel = document.createElement('td');
        tdTel.textContent = formatarTelefoneBrasil(cliente.telefone);
        tr.appendChild(tdTel);

        var tdAcoes = document.createElement('td');
        if (!window.MODO_APENAS_LEITURA) {
            var btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() { preencherFormularioContratante(cliente.cnpj); };
            
            var btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.style.marginLeft = '5px';
            btnExcluir.onclick = function() { excluirContratante(cliente.cnpj); };

            tdAcoes.appendChild(btnEditar);
            tdAcoes.appendChild(btnExcluir);
        }
        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 11. RENDERIZAÇÃO DA TABELA DE ATIVIDADES
// -----------------------------------------------------------------------------
function renderizarTabelaAtividades() {
    var tabela = document.getElementById('tabelaAtividades');
    if (!tabela) return;
    
    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';
    
    var lista = CACHE_ATIVIDADES;
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma atividade cadastrada.</td></tr>';
        return;
    }
    
    lista.forEach(function(ativ) {
        var tr = document.createElement('tr');
        var btnDel = '';
        if (!window.MODO_APENAS_LEITURA) {
            btnDel = '<button class="btn-mini delete-btn" onclick="excluirAtividade(\'' + ativ.id + '\')"><i class="fas fa-trash"></i></button>';
        }
        
        tr.innerHTML = '<td>' + ativ.id + '</td>' +
                       '<td>' + ativ.nome + '</td>' +
                       '<td>' + btnDel + '</td>';
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 12. RENDERIZAÇÃO DA TABELA DE HISTÓRICO DE OPERAÇÕES
// -----------------------------------------------------------------------------
function renderizarTabelaOperacoes() {
    var tabela = document.getElementById('tabelaOperacoes');
    if (!tabela) return;

    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';

    // Filtrar apenas operações ativas (não canceladas e não faltas isoladas)
    // O histórico mostra Agendadas, Em Andamento e Confirmadas
    var operacoes = CACHE_OPERACOES.filter(function(op) {
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
        var tr = document.createElement('tr');

        // Data
        var tdData = document.createElement('td');
        tdData.textContent = formatarDataParaBrasileiro(op.data);
        tr.appendChild(tdData);

        // Motorista e Veículo
        var tdInfo = document.createElement('td');
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome : '(Excluído)';
        tdInfo.innerHTML = '<strong>' + nomeMot + '</strong><br><small style="color:#666">' + op.veiculoPlaca + '</small>';
        tr.appendChild(tdInfo);

        // Status (Badge)
        var tdStatus = document.createElement('td');
        var statusClass = 'pill-pending';
        var statusText = op.status;
        
        if (op.status === 'CONFIRMADA') {
            statusClass = 'pill-active';
        } else if (op.status === 'EM_ANDAMENTO') {
            statusClass = 'pill-active'; // Usa azul/verde
            statusText = 'EM ANDAMENTO'; // Texto amigável
        }
        
        tdStatus.innerHTML = '<span class="status-pill ' + statusClass + '" ' + (op.status === 'EM_ANDAMENTO' ? 'style="background:orange; color:white;"' : '') + '>' + statusText + '</span>';
        tr.appendChild(tdStatus);

        // Valor
        var tdValor = document.createElement('td');
        tdValor.textContent = formatarValorMoeda(op.faturamento);
        tdValor.style.fontWeight = 'bold';
        tdValor.style.color = 'var(--success-color)';
        tr.appendChild(tdValor);

        // Ações
        var tdAcoes = document.createElement('td');
        
        // Botão Ver Detalhes (Todos veem)
        var btnVer = document.createElement('button');
        btnVer.className = 'btn-mini btn-primary';
        btnVer.innerHTML = '<i class="fas fa-eye"></i>';
        btnVer.title = 'Ver Detalhes';
        btnVer.onclick = function() {
            visualizarDetalhesOperacao(op.id);
        };
        tdAcoes.appendChild(btnVer);

        if (!window.MODO_APENAS_LEITURA) {
            tdAcoes.appendChild(document.createTextNode(' '));
            
            // Botão Editar
            var btnEditar = document.createElement('button');
            btnEditar.className = 'btn-mini edit-btn';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i>';
            btnEditar.onclick = function() {
                preencherFormularioOperacao(op.id);
            };
            tdAcoes.appendChild(btnEditar);

            tdAcoes.appendChild(document.createTextNode(' '));

            // Botão Excluir
            var btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-mini delete-btn';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.onclick = function() {
                excluirOperacao(op.id);
            };
            tdAcoes.appendChild(btnExcluir);
        }
        
        tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 13. RENDERIZAÇÃO DE MONITORAMENTO DE CHECK-IN E FALTAS (IMPORTANTE)
// Separa em duas tabelas: Rotas Ativas (Topo) e Ocorrências/Faltas (Fim)
// -----------------------------------------------------------------------------
function renderizarTabelaMonitoramento() {
    var tbodyAtivos = document.querySelector('#tabelaCheckinsPendentes tbody');
    var tbodyFaltas = document.querySelector('#tabelaFaltas tbody');
    
    // Se a tabela de ativos não existir na página atual, aborta
    if (!tbodyAtivos) return;

    var todasOperacoes = CACHE_OPERACOES.filter(function(o) { return o.status !== 'CANCELADA'; });
    
    // Limpa as tabelas
    tbodyAtivos.innerHTML = '';
    if (tbodyFaltas) tbodyFaltas.innerHTML = '';

    var encontrouAtivos = false;
    var encontrouFaltas = false;

    // --- LÓGICA DE SEPARAÇÃO ---
    
    todasOperacoes.forEach(function(op) {
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome : 'Motorista Excluído';
        var dataFormatada = formatarDataParaBrasileiro(op.data);

        // Verifica se é uma operação "velha" já confirmada (ex: mais de 5 dias) para não poluir
        var isAntiga = (new Date() - new Date(op.data)) > (5 * 24 * 60 * 60 * 1000);
        var isConfirmada = op.status === 'CONFIRMADA';

        // 1. PROCESSAMENTO DE FALTAS (TABELA INFERIOR)
        // Falta do Motorista
        if (op.checkins && op.checkins.faltaMotorista) {
            encontrouFaltas = true;
            if (tbodyFaltas) {
                var trFalta = document.createElement('tr');
                trFalta.innerHTML = 
                    '<td>' + dataFormatada + '</td>' +
                    '<td>' + nomeMot + '</td>' +
                    '<td>MOTORISTA</td>' +
                    '<td><span style="color:white; background:red; padding:3px 8px; border-radius:10px; font-size:0.8em;">FALTA</span></td>' +
                    '<td>' +
                        (!window.MODO_APENAS_LEITURA ? '<button class="btn-mini edit-btn" onclick="desfazerFalta(\'' + op.id + '\', \'motorista\', \'' + op.motoristaId + '\')">Desfazer</button>' : '') +
                    '</td>';
                tbodyFaltas.appendChild(trFalta);
            }
        }

        // Faltas de Ajudantes
        if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.length > 0) {
            op.checkins.faltasAjudantes.forEach(function(ajId) {
                encontrouFaltas = true;
                if (tbodyFaltas) {
                    var ajudante = buscarFuncionarioPorId(ajId);
                    var nomeAj = ajudante ? ajudante.nome : 'Excluído';
                    var trFaltaAj = document.createElement('tr');
                    trFaltaAj.innerHTML = 
                        '<td>' + dataFormatada + '</td>' +
                        '<td>' + nomeAj + '</td>' +
                        '<td>AJUDANTE</td>' +
                        '<td><span style="color:white; background:red; padding:3px 8px; border-radius:10px; font-size:0.8em;">FALTA</span></td>' +
                        '<td>' +
                            (!window.MODO_APENAS_LEITURA ? '<button class="btn-mini edit-btn" onclick="desfazerFalta(\'' + op.id + '\', \'ajudante\', \'' + ajId + '\')">Desfazer</button>' : '') +
                        '</td>';
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
            var trMot = document.createElement('tr');
            trMot.style.borderLeft = '4px solid var(--primary-color)';
            trMot.style.backgroundColor = '#fcfcfc'; // Leve destaque

            var statusMotVisual = '<span class="status-pill pill-pending">AGUARDANDO</span>';
            if (op.checkins && op.checkins.motorista) statusMotVisual = '<span class="status-pill pill-active">EM ROTA</span>';
            if (isConfirmada) statusMotVisual = '<span class="status-pill pill-active">FINALIZADO</span>';

            var botoesAdminMot = '';
            if (!window.MODO_APENAS_LEITURA && !isConfirmada) {
                botoesAdminMot = 
                    '<button class="btn-mini btn-success" title="Forçar Início" onclick="forcarCheckin(\'' + op.id + '\', \'motorista\', \'' + op.motoristaId + '\')"><i class="fas fa-play"></i></button> ' +
                    '<button class="btn-mini btn-danger" title="Marcar Falta" onclick="marcarFalta(\'' + op.id + '\', \'motorista\', \'' + op.motoristaId + '\')"><i class="fas fa-user-times"></i></button>';
            }

            trMot.innerHTML = 
                '<td><strong>' + dataFormatada + '</strong></td>' +
                '<td>Op #' + op.id + '<br><small>' + op.veiculoPlaca + '</small></td>' +
                '<td>' + nomeMot + ' <small style="color:#666">(MOTORISTA)</small></td>' +
                '<td>' + op.status + '</td>' +
                '<td>' + statusMotVisual + '</td>' +
                '<td>' + botoesAdminMot + '</td>';
            tbodyAtivos.appendChild(trMot);

            // Linhas dos Ajudantes (Vinculados a esta operação)
            if (op.ajudantes && op.ajudantes.length > 0) {
                op.ajudantes.forEach(function(aj) {
                    // Se o ajudante faltou, não mostra aqui (já foi pra tabela de baixo)
                    if (op.checkins && op.checkins.faltasAjudantes && op.checkins.faltasAjudantes.includes(String(aj.id))) {
                        return;
                    }

                    var funcAj = buscarFuncionarioPorId(aj.id);
                    var nomeAj = funcAj ? funcAj.nome : '---';
                    var isPresente = op.checkins && op.checkins.ajudantes && op.checkins.ajudantes.includes(String(aj.id));
                    
                    var statusAj = isPresente ? '<span class="status-pill pill-active">PRESENTE</span>' : '<span class="status-pill pill-pending">AGUARDANDO</span>';
                    if (isConfirmada) statusAj = '<span class="status-pill pill-active">OK</span>';

                    var botoesAdminAj = '';
                    if (!window.MODO_APENAS_LEITURA && !isConfirmada && !isPresente) {
                        botoesAdminAj = 
                            '<button class="btn-mini btn-success" title="Confirmar Presença" onclick="forcarCheckin(\'' + op.id + '\', \'ajudante\', \'' + aj.id + '\')"><i class="fas fa-check"></i></button> ' +
                            '<button class="btn-mini btn-danger" title="Marcar Falta" onclick="marcarFalta(\'' + op.id + '\', \'ajudante\', \'' + aj.id + '\')"><i class="fas fa-user-times"></i></button>';
                    }

                    var trAj = document.createElement('tr');
                    trAj.innerHTML = 
                        '<td style="border:none;"></td>' +
                        '<td style="border:none;"></td>' +
                        '<td>' + nomeAj + ' <small style="color:#666">(AJUDANTE)</small></td>' +
                        '<td style="color:#aaa;">-</td>' +
                        '<td>' + statusAj + '</td>' +
                        '<td>' + botoesAdminAj + '</td>';
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
}

// -----------------------------------------------------------------------------
// 14. RENDERIZAÇÃO DE DESPESAS GERAIS
// -----------------------------------------------------------------------------
function renderizarTabelaDespesas() {
    var tabela = document.getElementById('tabelaDespesasGerais');
    if (!tabela) return;
    var tbody = tabela.querySelector('tbody');
    tbody.innerHTML = '';
    
    var lista = CACHE_DESPESAS;
    // Ordena por data
    lista.sort(function(a,b) { return new Date(b.data) - new Date(a.data); });

    if(lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma despesa registrada.</td></tr>';
        return;
    }

    lista.forEach(function(d) {
        var tr = document.createElement('tr');
        var btnExcluir = '';
        if (!window.MODO_APENAS_LEITURA) {
            btnExcluir = '<button class="btn-mini delete-btn" onclick="excluirDespesa(' + d.id + ')"><i class="fas fa-trash"></i></button>';
        }

        tr.innerHTML = 
            '<td>' + formatarDataParaBrasileiro(d.data) + '</td>' +
            '<td>' + d.veiculoRef + '</td>' +
            '<td>' + d.descricao + '</td>' +
            '<td style="color:var(--danger-color); font-weight:bold;">' + formatarValorMoeda(d.valor) + '</td>' +
            '<td><span class="status-pill pill-active">' + d.formaPagamento + '</span></td>' +
            '<td>' + btnExcluir + '</td>';
        tbody.appendChild(tr);
    });
}

// -----------------------------------------------------------------------------
// 15. RENDERIZAÇÃO DE DADOS "MINHA EMPRESA"
// -----------------------------------------------------------------------------
function renderizarInformacoesEmpresa() {
    var empresa = CACHE_MINHA_EMPRESA;
    
    // 1. Atualiza formulário de edição
    if (document.getElementById('minhaEmpresaRazaoSocial')) {
        document.getElementById('minhaEmpresaRazaoSocial').value = empresa.razaoSocial || '';
        document.getElementById('minhaEmpresaCNPJ').value = empresa.cnpj || '';
        document.getElementById('minhaEmpresaTelefone').value = empresa.telefone || '';
    }

    // 2. Atualiza a visualização no card (se existir o elemento de display)
    var displayDiv = document.getElementById('dadosMinhaEmpresaDisplay');
    if (displayDiv) {
        if (empresa.razaoSocial) {
            displayDiv.innerHTML = 
                '<div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; border: 1px solid #90caf9; margin-bottom: 20px;">' +
                    '<h3 style="margin-top:0; color:#1565c0;">' + empresa.razaoSocial + '</h3>' +
                    '<p style="margin:5px 0;"><strong>CNPJ:</strong> ' + empresa.cnpj + '</p>' +
                    '<p style="margin:5px 0;"><strong>Contato:</strong> ' + formatarTelefoneBrasil(empresa.telefone) + '</p>' +
                '</div>';
        } else {
            displayDiv.innerHTML = '<p style="color:#666; font-style:italic;">Nenhuma empresa configurada. Preencha os dados abaixo.</p>';
        }
    }
}

// -----------------------------------------------------------------------------
// 16. FUNÇÃO DE POPULAÇÃO DE MENUS SUSPENSOS (SELECTS)
// Esta função é chamada sempre que algo muda para manter os selects atualizados
// -----------------------------------------------------------------------------
function preencherTodosSelects() {
    // Carrega dados atualizados
    var funcionarios = CACHE_FUNCIONARIOS;
    var motoristas = funcionarios.filter(function(f) { return f.funcao === 'motorista'; });
    var ajudantes = funcionarios.filter(function(f) { return f.funcao === 'ajudante'; });
    var veiculos = CACHE_VEICULOS;
    var contratantes = CACHE_CONTRATANTES;
    var atividades = CACHE_ATIVIDADES;

    // Função interna auxiliar para preencher um select específico
    function preencherSelectEspecifico(elementId, dados, chaveValor, chaveTexto, textoPadrao) {
        var select = document.getElementById(elementId);
        if (select) {
            var valorSelecionado = select.value; // Tenta manter a seleção atual
            select.innerHTML = '<option value="">' + textoPadrao + '</option>';
            
            dados.forEach(function(item) {
                var option = document.createElement('option');
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

    // 5. Atualiza todas as tabelas visuais também (chain reaction)
    renderizarTabelaFuncionarios();
    renderizarTabelaVeiculos();
    renderizarTabelaContratantes();
    renderizarTabelaOperacoes();
    renderizarTabelaMonitoramento();
    renderizarTabelaDespesas();
    renderizarTabelaAtividades();
    renderizarInformacoesEmpresa();
}
// =============================================================================
// PARTE 3: LÓGICA DO CALENDÁRIO, CRUD ESPECÍFICO E AÇÕES ADMINISTRATIVAS
// =============================================================================

// -----------------------------------------------------------------------------
// 17. LÓGICA DO CALENDÁRIO INTERATIVO
// -----------------------------------------------------------------------------

window.renderizarCalendario = function() {
    var gridCalendario = document.getElementById('calendarGrid');
    var labelMesAno = document.getElementById('currentMonthYear');
    
    if (!gridCalendario || !labelMesAno) return;

    // Limpa o grid
    gridCalendario.innerHTML = '';

    var dataAtual = window.currentDate;
    var mes = dataAtual.getMonth();
    var ano = dataAtual.getFullYear();

    // Atualiza o título (Ex: DEZEMBRO 2025)
    labelMesAno.textContent = dataAtual.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).toUpperCase();

    // Dados para construção do grid
    var primeiroDiaDaSemana = new Date(ano, mes, 1).getDay(); // 0 = Domingo
    var totalDiasNoMes = new Date(ano, mes + 1, 0).getDate();
    var listaOperacoes = CACHE_OPERACOES;

    // Cria células vazias para o início do mês (offset)
    for (var i = 0; i < primeiroDiaDaSemana; i++) {
        var celulaVazia = document.createElement('div');
        celulaVazia.className = 'day-cell empty';
        gridCalendario.appendChild(celulaVazia);
    }

    // Cria os dias do mês
    for (var dia = 1; dia <= totalDiasNoMes; dia++) {
        (function(diaAtual) { // Closure para capturar o dia correto no loop
            var celulaDia = document.createElement('div');
            celulaDia.className = 'day-cell';
            
            // Número do dia
            var spanNumero = document.createElement('span');
            spanNumero.textContent = diaAtual;
            celulaDia.appendChild(spanNumero);

            // Formata data para busca YYYY-MM-DD
            var stringData = ano + '-' + String(mes + 1).padStart(2, '0') + '-' + String(diaAtual).padStart(2, '0');

            // Filtra operações deste dia (Exclui canceladas)
            var operacoesDoDia = listaOperacoes.filter(function(op) {
                return op.data === stringData && op.status !== 'CANCELADA';
            });

            // Se houver operações, adiciona indicadores visuais
            if (operacoesDoDia.length > 0) {
                celulaDia.classList.add('has-operation');

                // 1. Bolinha indicadora
                var divDot = document.createElement('div');
                divDot.className = 'event-dot';
                celulaDia.appendChild(divDot);

                // 2. Total Financeiro do Dia (Soma Faturamento)
                var faturamentoDia = operacoesDoDia.reduce(function(total, op) {
                    return total + (Number(op.faturamento) || 0);
                }, 0);

                var divValor = document.createElement('div');
                divValor.style.fontSize = '0.7em';
                divValor.style.color = 'green';
                divValor.style.marginTop = 'auto';
                divValor.style.fontWeight = 'bold';
                divValor.textContent = formatarValorMoeda(faturamentoDia);
                celulaDia.appendChild(divValor);

                // 3. Evento de Clique para abrir detalhes
                celulaDia.onclick = function() {
                    abrirModalDetalhesDia(stringData);
                };
            }

            gridCalendario.appendChild(celulaDia);
        })(dia);
    }
};

// Navegação de Mês (Anterior/Próximo)
window.mudarMes = function(direcao) {
    // direcao: -1 para anterior, 1 para próximo
    window.currentDate.setMonth(window.currentDate.getMonth() + direcao);
    renderizarCalendario();
    
    // Se existir a função de atualizar gráficos, chama ela
    if (typeof atualizarDashboard === 'function') {
        atualizarDashboard();
    }
};

// Modal de Detalhes do Dia
window.abrirModalDetalhesDia = function(dataString) {
    var listaOperacoes = CACHE_OPERACOES;
    
    // Filtra novamente para garantir dados frescos
    var operacoesDoDia = listaOperacoes.filter(function(op) {
        return op.data === dataString && op.status !== 'CANCELADA';
    });

    var modalBody = document.getElementById('modalDayBody');
    var modalTitle = document.getElementById('modalDayTitle');
    var modalSummary = document.getElementById('modalDaySummary');

    if (!modalBody) return;

    // Título do Modal
    var dataFormatada = formatarDataParaBrasileiro(dataString);
    if (modalTitle) modalTitle.textContent = 'DETALHES DE ' + dataFormatada;

    // Resumo Financeiro do Dia
    var totalFat = 0;
    var totalCusto = 0;

    var htmlLista = '';

    operacoesDoDia.forEach(function(op) {
        // Cálculos individuais
        var fat = Number(op.faturamento) || 0;
        
        var custoDiesel = calcularCustoViagemDiesel(op);
        var custoExtra = Number(op.despesas) || 0;
        var custoPessoal = 0;

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
        var motorista = buscarFuncionarioPorId(op.motoristaId);
        var nomeMot = motorista ? motorista.nome : 'Sem Motorista';
        
        htmlLista += 
            '<div style="background:#fff; padding:12px; border:1px solid #eee; margin-bottom:10px; border-left: 4px solid var(--primary-color); border-radius:4px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                    '<div>' +
                        '<strong>Operação #' + op.id + '</strong><br>' +
                        '<span style="color:#666; font-size:0.9em;">' + op.veiculoPlaca + ' - ' + nomeMot + '</span><br>' +
                        '<span class="status-pill ' + (op.status === 'CONFIRMADA' ? 'pill-active' : 'pill-pending') + '" style="font-size:0.7em;">' + op.status + '</span>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<strong style="color:var(--success-color);">' + formatarValorMoeda(fat) + '</strong>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-top:10px; text-align:right;">' +
                    '<button class="btn-mini edit-btn" onclick="preencherFormularioOperacao(\'' + op.id + '\'); document.getElementById(\'modalDayOperations\').style.display=\'none\';">' +
                        '<i class="fas fa-edit"></i> VER / EDITAR' +
                    '</button>' +
                '</div>' +
            '</div>';
    });

    // Atualiza o Resumo no topo do modal
    if (modalSummary) {
        var lucroLiquido = totalFat - totalCusto;
        modalSummary.innerHTML = 
            '<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:15px;">' +
                '<div class="finance-box success" style="padding:10px; background:#e8f5e9; border-radius:5px; text-align:center;">' +
                    '<small>Faturamento</small><br>' +
                    '<strong>' + formatarValorMoeda(totalFat) + '</strong>' +
                '</div>' +
                '<div class="finance-box gasto" style="padding:10px; background:#ffebee; border-radius:5px; text-align:center;">' +
                    '<small>Custos Est.</small><br>' +
                    '<strong style="color:#c62828;">' + formatarValorMoeda(totalCusto) + '</strong>' +
                '</div>' +
                '<div class="finance-box lucro" style="padding:10px; background:#e3f2fd; border-radius:5px; text-align:center;">' +
                    '<small>Lucro</small><br>' +
                    '<strong style="color:' + (lucroLiquido >= 0 ? '#2e7d32' : '#c62828') + ';">' + formatarValorMoeda(lucroLiquido) + '</strong>' +
                '</div>' +
            '</div>';
    }

    modalBody.innerHTML = htmlLista || '<p style="text-align:center; color:#999;">Nenhuma operação ativa neste dia.</p>';
    
    // Exibe o modal
    document.getElementById('modalDayOperations').style.display = 'block';
};

// -----------------------------------------------------------------------------
// 18. FUNÇÕES DE EXCLUSÃO (CRUD - DELETE - INDIVIDUAIS)
// -----------------------------------------------------------------------------

window.excluirFuncionario = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este funcionário?")) return;

    var novaLista = CACHE_FUNCIONARIOS.filter(function(f) { return String(f.id) !== String(id); });
    salvarListaFuncionarios(novaLista).then(function() {
        preencherTodosSelects();
        alert("Funcionário excluído com sucesso.");
    });
};

window.excluirVeiculo = function(placa) {
    if (window.MODO_APENAS_LEITURA) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este veículo?")) return;

    var novaLista = CACHE_VEICULOS.filter(function(v) { return v.placa !== placa; });
    salvarListaVeiculos(novaLista).then(function() {
        preencherTodosSelects();
        alert("Veículo excluído com sucesso.");
    });
};

window.excluirContratante = function(cnpj) {
    if (window.MODO_APENAS_LEITURA) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir este contratante?")) return;

    var novaLista = CACHE_CONTRATANTES.filter(function(c) { return String(c.cnpj) !== String(cnpj); });
    salvarListaContratantes(novaLista).then(function() {
        preencherTodosSelects();
        alert("Contratante excluído com sucesso.");
    });
};

window.excluirOperacao = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Você não tem permissão para excluir.");
    if (!confirm("Tem certeza que deseja excluir esta operação? Isso afetará o financeiro.")) return;

    var novaLista = CACHE_OPERACOES.filter(function(o) { return String(o.id) !== String(id); });
    salvarListaOperacoes(novaLista).then(function() {
        preencherTodosSelects(); // Atualiza tudo
        if(typeof atualizarDashboard === 'function') atualizarDashboard();
        renderizarCalendario();
        alert("Operação excluída.");
    });
};

window.excluirDespesa = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Sem permissão.");
    if (!confirm("Excluir despesa?")) return;

    var novaLista = CACHE_DESPESAS.filter(function(d) { return String(d.id) !== String(id); });
    salvarListaDespesas(novaLista).then(function() {
        renderizarTabelaDespesas();
        if(typeof atualizarDashboard === 'function') atualizarDashboard();
        alert("Despesa excluída.");
    });
};

window.excluirAtividade = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Sem permissão.");
    if (!confirm("Excluir atividade?")) return;

    var novaLista = CACHE_ATIVIDADES.filter(function(a) { return String(a.id) !== String(id); });
    salvarListaAtividades(novaLista).then(function() {
        renderizarTabelaAtividades();
        preencherTodosSelects();
        alert("Atividade excluída.");
    });
};

// -----------------------------------------------------------------------------
// 19. FUNÇÕES DE PREENCHIMENTO DE FORMULÁRIO (CRUD - EDIT - INDIVIDUAIS)
// -----------------------------------------------------------------------------

window.preencherFormularioFuncionario = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Apenas leitura.");
    
    var funcionario = buscarFuncionarioPorId(id);
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
    var divDriverFields = document.getElementById('driverFields') || document.getElementById('camposMotorista'); 
    
    if (funcionario.funcao === 'motorista') {
        if(divDriverFields) divDriverFields.style.display = 'block';
        // Alternativamente chama a função de toggle se existir
        if(typeof toggleDriverFields === 'function') toggleDriverFields();

        document.getElementById('funcCNH').value = funcionario.cnh || '';
        document.getElementById('funcValidadeCNH').value = funcionario.validadeCNH || '';
        document.getElementById('funcCategoriaCNH').value = funcionario.categoriaCNH || '';
        document.getElementById('funcCursoDescricao').value = funcionario.cursoDescricao || '';
    } else {
        if(divDriverFields) divDriverFields.style.display = 'none';
        if(typeof toggleDriverFields === 'function') toggleDriverFields();
    }

    // Rola a página e troca a aba
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var tabBtn = document.querySelector('[data-tab="funcionarios"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioVeiculo = function(placa) {
    if (window.MODO_APENAS_LEITURA) return alert("Apenas leitura.");

    var veiculo = buscarVeiculoPorPlaca(placa);
    if (!veiculo) return alert("Veículo não encontrado.");

    document.getElementById('veiculoId').value = veiculo.placa; // ID oculto para saber que é edição
    document.getElementById('veiculoPlaca').value = veiculo.placa;
    document.getElementById('veiculoModelo').value = veiculo.modelo;
    document.getElementById('veiculoAno').value = veiculo.ano;
    document.getElementById('veiculoRenavam').value = veiculo.renavam || '';
    document.getElementById('veiculoChassi').value = veiculo.chassi || '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    var tabBtn = document.querySelector('[data-tab="veiculos"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioContratante = function(cnpj) {
    if (window.MODO_APENAS_LEITURA) return alert("Apenas leitura.");

    var cliente = buscarContratantePorCnpj(cnpj);
    if (!cliente) return alert("Cliente não encontrado.");

    document.getElementById('contratanteId').value = cliente.cnpj;
    document.getElementById('contratanteRazaoSocial').value = cliente.razaoSocial;
    document.getElementById('contratanteCNPJ').value = cliente.cnpj;
    document.getElementById('contratanteTelefone').value = cliente.telefone;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    var tabBtn = document.querySelector('[data-tab="contratantes"]');
    if(tabBtn) tabBtn.click();
};

window.preencherFormularioOperacao = function(id) {
    if (window.MODO_APENAS_LEITURA) return alert("Apenas leitura.");

    // Busca operação pelo ID
    var op = CACHE_OPERACOES.find(function(o) { return String(o.id) === String(id); });
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
    var checkAgendamento = document.getElementById('operacaoIsAgendamento');
    if (checkAgendamento) {
        checkAgendamento.checked = (op.status === 'AGENDADA');
    }

    // 5. Equipe (Ajudantes)
    // Importante: Restaura a lista temporária global para que o usuário veja e edite os ajudantes
    window._operacaoAjudantesTempList = op.ajudantes ? JSON.parse(JSON.stringify(op.ajudantes)) : [];
    if (typeof renderizarListaAjudantesAdicionados === 'function') {
        renderizarListaAjudantesAdicionados(); 
    }

    // 6. Navegação
    // Abre a página de lançamentos e rola para o topo
    var navItem = document.querySelector('[data-page="operacoes"]');
    if (navItem) navItem.click();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Feedback visual (borda piscando)
    var formCard = document.querySelector('#formOperacao').parentElement;
    if (formCard) {
        formCard.style.borderColor = 'orange';
        setTimeout(function() { formCard.style.borderColor = ''; }, 2000);
    }
};

// -----------------------------------------------------------------------------
// 20. AÇÕES ADMINISTRATIVAS (INTERVENÇÃO EM ROTAS)
// -----------------------------------------------------------------------------

// Forçar Check-in (Quando o motorista não consegue usar o app)
window.forcarCheckin = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("ATENÇÃO: Você está prestes a realizar um check-in manual.\nConfirma a presença deste funcionário?")) return;

    var operacoes = JSON.parse(JSON.stringify(CACHE_OPERACOES)); // Deep copy
    var index = operacoes.findIndex(function(o) { return String(o.id) === String(opId); });
    
    if (index < 0) return alert("Erro: Operação não encontrada.");
    
    var op = operacoes[index];

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
            op.kmInicial = obterUltimoKmRegistrado(op.veiculoPlaca);
        }
    } 
    else if (tipoUsuario === 'ajudante') {
        var uidStr = String(usuarioId);
        
        // Adiciona aos presentes se não estiver
        if (!op.checkins.ajudantes.includes(uidStr)) {
            op.checkins.ajudantes.push(uidStr);
        }
        
        // Remove da lista de faltas se estiver
        if (op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(function(id) { return id !== uidStr; });
        }
    }

    // Salva e atualiza tela
    salvarListaOperacoes(operacoes).then(function() {
        renderizarTabelaMonitoramento();
        renderizarTabelaOperacoes(); // Atualiza status no histórico também
        alert("Presença confirmada manualmente.");
    });
};

// Desfazer Falta (Correção de erro)
window.desfazerFalta = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("Deseja remover esta falta? O funcionário voltará a ficar pendente ou presente.")) return;

    var operacoes = JSON.parse(JSON.stringify(CACHE_OPERACOES));
    var index = operacoes.findIndex(function(o) { return String(o.id) === String(opId); });
    if (index < 0) return;

    var op = operacoes[index];

    if (tipoUsuario === 'motorista') {
        op.checkins.faltaMotorista = false;
        // Se o checkin real não foi feito, volta status para agendada (ou mantem em andamento se ja iniciou)
        if (!op.checkins.motorista) {
            op.status = 'AGENDADA'; 
        }
    } 
    else if (tipoUsuario === 'ajudante') {
        var uidStr = String(usuarioId);
        if (op.checkins.faltasAjudantes) {
            op.checkins.faltasAjudantes = op.checkins.faltasAjudantes.filter(function(id) { return id !== uidStr; });
        }
    }

    salvarListaOperacoes(operacoes).then(function() {
        renderizarTabelaMonitoramento();
        alert("Falta removida.");
    });
};

// Marcar Falta (Desconto Financeiro)
window.marcarFalta = function(opId, tipoUsuario, usuarioId) {
    if (!confirm("CONFIRMAR FALTA?\n\nO valor da diária/comissão NÃO será pago a este funcionário.")) return;

    var operacoes = JSON.parse(JSON.stringify(CACHE_OPERACOES));
    var index = operacoes.findIndex(function(o) { return String(o.id) === String(opId); });
    if (index < 0) return;

    var op = operacoes[index];
    if (!op.checkins) op.checkins = { motorista: false, ajudantes: [], faltasAjudantes: [], faltaMotorista: false };

    if (tipoUsuario === 'motorista') {
        op.checkins.faltaMotorista = true;
        op.checkins.motorista = false; // Remove presença
    } 
    else if (tipoUsuario === 'ajudante') {
        var uidStr = String(usuarioId);
        if (!op.checkins.faltasAjudantes) op.checkins.faltasAjudantes = [];
        
        // Adiciona à lista de faltas
        if (!op.checkins.faltasAjudantes.includes(uidStr)) {
            op.checkins.faltasAjudantes.push(uidStr);
        }
        
        // Remove da lista de presentes
        op.checkins.ajudantes = op.checkins.ajudantes.filter(function(id) { return id !== uidStr; });
    }

    salvarListaOperacoes(operacoes).then(function() {
        renderizarTabelaMonitoramento();
        alert("Falta registrada com sucesso.");
    });
};

// -----------------------------------------------------------------------------
// 21. PAINEL DO FUNCIONÁRIO (LÓGICA DE DADOS INLINE)
// -----------------------------------------------------------------------------

// Função para preencher os campos "Meus Dados" para edição inline
window.renderizarPainelMeusDados = function() {
    if (!window.USUARIO_ATUAL) return;

    // Busca os dados reais do funcionário logado
    var meuPerfil = CACHE_FUNCIONARIOS.find(function(f) { return f.email === window.USUARIO_ATUAL.email; });
    
    if (!meuPerfil) {
        console.error("Perfil de funcionário não encontrado para o email logado.");
        return;
    }

    // Preenche os inputs do formulário criado no HTML
    var campoNome = document.getElementById('meuPerfilNome');
    var campoFuncao = document.getElementById('meuPerfilFuncao');
    var campoDoc = document.getElementById('meuPerfilDoc');
    var campoTel = document.getElementById('meuPerfilTel');
    var campoPix = document.getElementById('meuPerfilPix');
    var campoEnd = document.getElementById('meuPerfilEndereco');
    
    if (campoNome) campoNome.value = meuPerfil.nome;
    if (campoFuncao) campoFuncao.value = meuPerfil.funcao;
    if (campoDoc) campoDoc.value = meuPerfil.documento;
    if (campoTel) campoTel.value = meuPerfil.telefone;
    if (campoPix) campoPix.value = meuPerfil.pix || '';
    if (campoEnd) campoEnd.value = meuPerfil.endereco || '';

    // Campos específicos de motorista
    var groupCNH = document.getElementById('meuPerfilCNHGroup');
    var groupValidade = document.getElementById('meuPerfilValidadeCNHGroup');
    var campoCNH = document.getElementById('meuPerfilCNH');
    var campoValidade = document.getElementById('meuPerfilValidadeCNH');

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
    var formEmpresa = document.getElementById('formMinhaEmpresa');
    if (formEmpresa) {
        formEmpresa.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var dadosEmpresa = {
                razaoSocial: document.getElementById('minhaEmpresaRazaoSocial').value.toUpperCase(),
                cnpj: document.getElementById('minhaEmpresaCNPJ').value,
                telefone: document.getElementById('minhaEmpresaTelefone').value
            };

            salvarDadosMinhaEmpresa(dadosEmpresa).then(function() {
                renderizarInformacoesEmpresa(); // Atualiza a visualização na hora
                alert("Dados da empresa atualizados com sucesso!");
            });
        });
    }

    // --- B. SALVAR DADOS PESSOAIS (PAINEL DO FUNCIONÁRIO - INLINE) ---
    var formMeusDados = document.getElementById('formMeusDadosFuncionario');
    if (formMeusDados) {
        formMeusDados.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (!window.USUARIO_ATUAL) return alert("Erro de sessão.");

            // Carrega lista completa para editar o registro correto
            var listaFuncionarios = JSON.parse(JSON.stringify(CACHE_FUNCIONARIOS)); // Cópia segura
            var indice = listaFuncionarios.findIndex(function(f) {
                return f.email === window.USUARIO_ATUAL.email;
            });

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

                salvarListaFuncionarios(listaFuncionarios).then(function() {
                    alert("Seus dados foram atualizados com sucesso!");
                });
            } else {
                alert("Erro: Seu perfil não foi encontrado no banco de dados.");
            }
        });
    }

    // --- C. SALVAR FUNCIONÁRIO (ADMIN) ---
    var formFuncionario = document.getElementById('formFuncionario');
    if (formFuncionario) {
        formFuncionario.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            var btnSalvar = formFuncionario.querySelector('button[type="submit"]');
            var textoOriginal = btnSalvar.innerText;
            btnSalvar.innerText = "SALVANDO...";
            btnSalvar.disabled = true;

            try {
                var idOculto = document.getElementById('funcionarioId').value;
                var emailInput = document.getElementById('funcEmail').value.trim().toLowerCase();
                var senhaInput = document.getElementById('funcSenha').value;
                var funcaoInput = document.getElementById('funcFuncao').value;

                var listaFuncionarios = CACHE_FUNCIONARIOS.slice();

                // Validação de Email Único
                if (!idOculto && listaFuncionarios.some(function(f) { return f.email === emailInput; })) {
                    throw new Error("Este e-mail já está cadastrado.");
                }

                var novoId = idOculto ? idOculto : String(Date.now());
                var firebaseUid = null;

                // Criação de Usuário no Firebase Auth (Apenas se houver senha e não for edição sem troca de senha)
                if (window.dbRef && !idOculto && senhaInput) {
                    if (senhaInput.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
                    
                    var auth = window.dbRef.getAuth(window.dbRef.secondaryApp);
                    var userCredential = await window.dbRef.createUserWithEmailAndPassword(auth, emailInput, senhaInput);
                    firebaseUid = userCredential.user.uid;

                    // Salva metadados de acesso
                    await window.dbRef.setDoc(window.dbRef.doc(window.dbRef.db, "users", firebaseUid), {
                        uid: firebaseUid,
                        name: document.getElementById('funcNome').value.toUpperCase(),
                        email: emailInput,
                        role: funcaoInput,
                        company: window.USUARIO_ATUAL.company,
                        approved: true
                    });
                    
                    await window.dbRef.signOut(auth);
                }

                // Objeto Funcionário
                var objetoFuncionario = {
                    id: novoId,
                    uid: firebaseUid || (idOculto ? (listaFuncionarios.find(function(f) { return String(f.id) === String(idOculto); })?.uid || '') : ''),
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
                    var index = listaFuncionarios.findIndex(function(f) { return String(f.id) === String(idOculto); });
                    if (index >= 0) listaFuncionarios[index] = objetoFuncionario;
                } else {
                    listaFuncionarios.push(objetoFuncionario);
                }

                await salvarListaFuncionarios(listaFuncionarios);
                
                formFuncionario.reset();
                document.getElementById('funcionarioId').value = '';
                preencherTodosSelects(); // Atualiza listas
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
    var formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var placaInput = document.getElementById('veiculoPlaca').value.toUpperCase();
            if (!placaInput) return alert("Placa obrigatória.");

            var listaVeiculos = CACHE_VEICULOS.slice();
            var idOculto = document.getElementById('veiculoId').value;

            // Se a placa mudou na edição, remove a antiga
            if (idOculto && idOculto !== placaInput) {
                listaVeiculos = listaVeiculos.filter(function(v) { return v.placa !== idOculto; });
            }

            var objetoVeiculo = {
                placa: placaInput,
                modelo: document.getElementById('veiculoModelo').value.toUpperCase(),
                ano: document.getElementById('veiculoAno').value,
                renavam: document.getElementById('veiculoRenavam').value,
                chassi: document.getElementById('veiculoChassi').value.toUpperCase()
            };

            var index = listaVeiculos.findIndex(function(v) { return v.placa === placaInput; });
            if (index >= 0) listaVeiculos[index] = objetoVeiculo;
            else listaVeiculos.push(objetoVeiculo);

            salvarListaVeiculos(listaVeiculos).then(function() {
                formVeiculo.reset();
                document.getElementById('veiculoId').value = '';
                preencherTodosSelects();
                alert("Veículo salvo com sucesso!");
            });
        });
    }

    // --- E. SALVAR CONTRATANTE ---
    var formContratante = document.getElementById('formContratante');
    if (formContratante) {
        formContratante.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var cnpjInput = limparMascara(document.getElementById('contratanteCNPJ').value);
            if (!cnpjInput) return alert("CNPJ obrigatório.");

            var listaContratantes = CACHE_CONTRATANTES.slice();
            var idOculto = document.getElementById('contratanteId').value;

            if (idOculto && String(idOculto) !== String(cnpjInput)) {
                listaContratantes = listaContratantes.filter(function(c) { return String(c.cnpj) !== String(idOculto); });
            }

            var objetoCliente = {
                cnpj: cnpjInput,
                razaoSocial: document.getElementById('contratanteRazaoSocial').value.toUpperCase(),
                telefone: document.getElementById('contratanteTelefone').value
            };

            var index = listaContratantes.findIndex(function(c) { return String(c.cnpj) === String(cnpjInput); });
            if (index >= 0) listaContratantes[index] = objetoCliente;
            else listaContratantes.push(objetoCliente);

            salvarListaContratantes(listaContratantes).then(function() {
                formContratante.reset();
                document.getElementById('contratanteId').value = '';
                preencherTodosSelects();
                alert("Contratante salvo com sucesso!");
            });
        });
    }

    // --- F. SALVAR OPERAÇÃO (O CORAÇÃO DO SISTEMA) ---
    var formOperacao = document.getElementById('formOperacao');
    if (formOperacao) {
        formOperacao.addEventListener('submit', function(e) {
            e.preventDefault();

            var motId = document.getElementById('selectMotoristaOperacao').value;
            var veicPlaca = document.getElementById('selectVeiculoOperacao').value;

            if (!motId || !veicPlaca) return alert("Selecione obrigatoriamente um Motorista e um Veículo.");

            var idOculto = document.getElementById('operacaoId').value;
            var listaOperacoes = CACHE_OPERACOES.slice();
            
            // Tenta encontrar a operação antiga para preservar dados vitais
            var operacaoAntiga = idOculto ? listaOperacoes.find(function(o) { return String(o.id) === String(idOculto); }) : null;

            // Define Status
            var isAgendamento = document.getElementById('operacaoIsAgendamento').checked;
            var novoStatus = isAgendamento ? 'AGENDADA' : 'CONFIRMADA';
            
            // Se já estava em andamento, não muda o status para não travar o app do motorista
            if (operacaoAntiga && operacaoAntiga.status === 'EM_ANDAMENTO') {
                novoStatus = 'EM_ANDAMENTO';
            }

            var objetoOperacao = {
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
                listaOperacoes = listaOperacoes.map(function(o) { return String(o.id) === String(idOculto) ? objetoOperacao : o; });
            } else {
                listaOperacoes.push(objetoOperacao);
            }

            salvarListaOperacoes(listaOperacoes).then(function() {
                formOperacao.reset();
                document.getElementById('operacaoId').value = '';
                
                // Limpa lista temporária de ajudantes
                window._operacaoAjudantesTempList = [];
                renderizarListaAjudantesAdicionados();
                
                // Atualiza telas
                preencherTodosSelects();
                renderizarCalendario();
                if (typeof atualizarDashboard === 'function') atualizarDashboard();
                
                alert("Operação lançada com sucesso!");
            });
        });
    }

    // --- G. SALVAR CHECK-IN (APP MOBILE FUNCIONÁRIO) ---
    var formCheckin = document.getElementById('formCheckinConfirm');
    if (formCheckin) {
        formCheckin.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var opId = document.getElementById('checkinOpId').value;
            var step = document.getElementById('checkinStep').value;
            
            var listaOperacoes = CACHE_OPERACOES.slice();
            var index = listaOperacoes.findIndex(function(o) { return String(o.id) === String(opId); });
            
            if (index < 0) return alert("Erro: Operação não encontrada.");
            
            var op = listaOperacoes[index];
            
            // Identifica quem está fazendo o check-in
            var usuarioLogado = CACHE_FUNCIONARIOS.find(function(f) { 
                return f.uid === window.USUARIO_ATUAL.uid || f.email === window.USUARIO_ATUAL.email;
            });

            if (!usuarioLogado) return alert("Erro de perfil de usuário.");

            // Lógica para MOTORISTA
            if (usuarioLogado.funcao === 'motorista') {
                if (step === 'start') {
                    var kmInformado = Number(document.getElementById('checkinKmInicial').value);
                    var ultimoKm = obterUltimoKmRegistrado(op.veiculoPlaca);
                    
                    if (!kmInformado || kmInformado < ultimoKm) {
                        return alert("KM Inválido. O odômetro não pode ser menor que o último registrado (" + ultimoKm + ").");
                    }
                    
                    op.kmInicial = kmInformado;
                    op.status = 'EM_ANDAMENTO';
                    op.checkins.motorista = true;
                    op.dataHoraInicio = new Date().toISOString();
                } else {
                    var kmFinal = Number(document.getElementById('checkinKmFinal').value);
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
            
            salvarListaOperacoes(listaOperacoes).then(function() {
                window.closeCheckinConfirmModal(); // Fecha modal se existir função global
                renderizarTabelaMonitoramento();
                alert("Check-in registrado com sucesso!");
            });
        });
    }

    // --- H. SALVAR DESPESA GERAL ---
    var formDespesa = document.getElementById('formDespesaGeral');
    if (formDespesa) {
        formDespesa.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var novaDespesa = {
                id: Date.now(),
                data: document.getElementById('despesaGeralData').value,
                veiculoRef: document.getElementById('selectVeiculoDespesaGeral').value || 'GERAL',
                descricao: document.getElementById('despesaGeralDescricao').value.toUpperCase(),
                valor: Number(document.getElementById('despesaGeralValor').value),
                formaPagamento: document.getElementById('despesaFormaPagamento').value
            };

            var lista = CACHE_DESPESAS.slice();
            lista.push(novaDespesa);

            salvarListaDespesas(lista).then(function() {
                formDespesa.reset();
                renderizarTabelaDespesas();
                if (typeof atualizarDashboard === 'function') atualizarDashboard();
                alert("Despesa lançada!");
            });
        });
    }

    // --- I. SALVAR ATIVIDADE ---
    var formAtividade = document.getElementById('formAtividade');
    if (formAtividade) {
        formAtividade.addEventListener('submit', function(e) {
            e.preventDefault();
            var novaAtiv = {
                id: Date.now(),
                nome: document.getElementById('atividadeNome').value.toUpperCase()
            };
            var lista = CACHE_ATIVIDADES.slice();
            lista.push(novaAtiv);
            
            salvarListaAtividades(lista).then(function() {
                formAtividade.reset();
                renderizarTabelaAtividades();
                preencherTodosSelects();
                alert("Atividade Salva.");
            });
        });
    }
}

// -----------------------------------------------------------------------------
// 23. RELATÓRIOS E RECIBOS (FUNÇÕES COMPLETAS)
// -----------------------------------------------------------------------------

// Gerar Relatório Geral Detalhado
window.gerarRelatorioGeral = function() {
    var dataInicio = document.getElementById('dataInicioRelatorio').value;
    var dataFim = document.getElementById('dataFimRelatorio').value;
    var filtroFuncionarioId = document.getElementById('selectMotoristaRelatorio').value;
    var filtroPlaca = document.getElementById('selectVeiculoRelatorio').value;
    var filtroCliente = document.getElementById('selectContratanteRelatorio').value;

    if (!dataInicio || !dataFim) return alert("Por favor, selecione as datas de início e fim.");

    // Filtra Operações
    var operacoes = CACHE_OPERACOES.filter(function(op) {
        if (op.status !== 'CONFIRMADA') return false;
        if (op.data < dataInicio || op.data > dataFim) return false;
        
        // Filtro de Funcionário (Motorista OU Ajudante)
        if (filtroFuncionarioId) {
            var ehMotorista = String(op.motoristaId) === String(filtroFuncionarioId);
            var ehAjudante = (op.ajudantes || []).some(function(aj) { return String(aj.id) === String(filtroFuncionarioId); });
            if (!ehMotorista && !ehAjudante) return false;
        }

        if (filtroPlaca && op.veiculoPlaca !== filtroPlaca) return false;
        if (filtroCliente && op.contratanteCNPJ !== filtroCliente) return false;
        
        return true;
    });

    var html = 
        '<h3 style="text-align:center;">RELATÓRIO DE SERVIÇOS DETALHADO</h3>' +
        '<p style="text-align:center;">Período: ' + formatarDataParaBrasileiro(dataInicio) + ' a ' + formatarDataParaBrasileiro(dataFim) + '</p>' +
        '<table class="data-table" style="width:100%; font-size:0.85rem;">' +
            '<thead>' +
                '<tr style="background:#eee;">' +
                    '<th>DATA</th>' +
                    '<th>ID</th>' +
                    '<th>VEÍCULO</th>' +
                    '<th>CLIENTE</th>' +
                    '<th>FATURAMENTO</th>' +
                    '<th>CUSTO TOTAL</th>' +
                    '<th>LUCRO</th>' +
                '</tr>' +
            '</thead>' +
            '<tbody>';

    var totalFaturamento = 0;
    var totalLucro = 0;

    operacoes.forEach(function(op) {
        var faturamento = Number(op.faturamento) || 0;
        
        // Custo = Diesel + Despesas + Equipe
        var custoTotal = calcularCustoViagemDiesel(op) + (Number(op.despesas) || 0);
        
        // Soma equipe se não faltou
        if (!op.checkins || !op.checkins.faltaMotorista) {
            custoTotal += (Number(op.comissao) || 0);
        }
        (op.ajudantes || []).forEach(function(aj) {
            if (!op.checkins || !op.checkins.faltasAjudantes || !op.checkins.faltasAjudantes.includes(String(aj.id))) {
                custoTotal += (Number(aj.diaria) || 0);
            }
        });

        var lucro = faturamento - custoTotal;
        totalFaturamento += faturamento;
        totalLucro += lucro;

        var cliente = buscarContratantePorCnpj(op.contratanteCNPJ);
        var nomeCliente = cliente ? cliente.razaoSocial : '-';

        html += 
            '<tr>' +
                '<td>' + formatarDataParaBrasileiro(op.data) + '</td>' +
                '<td>#' + op.id + '</td>' +
                '<td>' + op.veiculoPlaca + '</td>' +
                '<td>' + nomeCliente + '</td>' +
                '<td>' + formatarValorMoeda(faturamento) + '</td>' +
                '<td>' + formatarValorMoeda(custoTotal) + '</td>' +
                '<td style="color:' + (lucro >= 0 ? 'green' : 'red') + '; font-weight:bold;">' + formatarValorMoeda(lucro) + '</td>' +
            '</tr>';
    });

    html += 
            '</tbody>' +
            '<tfoot>' +
                '<tr style="background:#37474f; color:white; font-weight:bold;">' +
                    '<td colspan="4" style="text-align:right; padding-right:10px;">TOTAIS</td>' +
                    '<td>' + formatarValorMoeda(totalFaturamento) + '</td>' +
                    '<td>-</td>' +
                    '<td>' + formatarValorMoeda(totalLucro) + '</td>' +
                '</tr>' +
            '</tfoot>' +
        '</table>';

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// Gerar Recibo de Pagamento (2 vias)
window.gerarReciboPagamento = function() {
    var funcId = document.getElementById('selectMotoristaRecibo').value;
    var dataIni = document.getElementById('dataInicioRecibo').value;
    var dataFim = document.getElementById('dataFimRecibo').value;

    if (!funcId || !dataIni || !dataFim) return alert("Preencha funcionário e datas.");

    var funcionario = buscarFuncionarioPorId(funcId);
    var dadosEmpresa = buscarMinhaEmpresa();

    // Filtra serviços
    var ops = CACHE_OPERACOES.filter(function(o) { return o.status === 'CONFIRMADA' && o.data >= dataIni && o.data <= dataFim; });
    
    var valorTotal = 0;
    var detalhesHtml = '';

    ops.forEach(function(op) {
        var valor = 0;
        var obs = '';

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
            var aj = op.ajudantes.find(function(a) { return String(a.id) === String(funcId); });
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
            detalhesHtml += '<li>Data: ' + formatarDataParaBrasileiro(op.data) + ' - Veículo: ' + op.veiculoPlaca + ' - Valor: <strong>' + formatarValorMoeda(valor) + '</strong>' + obs + '</li>';
        }
    });

    // Função interna para gerar o HTML de uma via
    function criarVia(titulo) {
        return '<div style="border:1px solid #000; padding:20px; margin-bottom:20px;">' +
                '<h3 style="text-align:center; text-decoration:underline;">RECIBO DE PAGAMENTO - ' + titulo + '</h3>' +
                '<p style="text-align:justify; margin-top:20px;">' +
                    'Eu, <strong>' + funcionario.nome + '</strong>, inscrito(a) no CPF/CNH sob nº <strong>' + funcionario.documento + '</strong>, ' +
                    'declaro ter recebido da empresa <strong>' + (dadosEmpresa.razaoSocial || 'A EMPRESA') + '</strong> ' +
                    '(CNPJ: ' + (dadosEmpresa.cnpj || 'ND') + '), a importância líquida de ' +
                    '<span style="font-size:1.2em; font-weight:bold;">' + formatarValorMoeda(valorTotal) + '</span>, ' +
                    'referente aos serviços de transporte/diárias prestados no período de ' +
                    formatarDataParaBrasileiro(dataIni) + ' a ' + formatarDataParaBrasileiro(dataFim) + ', ' +
                    'conforme detalhamento abaixo:' +
                '</p>' +
                '<ul style="font-size:0.9em; border:1px dashed #ccc; padding:10px 20px;">' +
                    (detalhesHtml || '<li>Nenhum serviço remunerado no período.</li>') +
                '</ul>' +
                '<p style="text-align:justify;">' +
                    'Pelo que firmo o presente recibo dando plena, rasa e geral quitação das obrigações acima discriminadas.' +
                '</p>' +
                '<br><br>' +
                '<div style="display:flex; justify-content:space-between; margin-top:30px;">' +
                    '<div style="text-align:center;">' +
                        '__________________________________________<br>' +
                        '<strong>' + (dadosEmpresa.razaoSocial || 'Assinatura Empregador') + '</strong>' +
                    '</div>' +
                    '<div style="text-align:center;">' +
                        '__________________________________________<br>' +
                        '<strong>' + funcionario.nome + '</strong><br>' +
                        '(Funcionário/Prestador)' +
                    '</div>' +
                '</div>' +
                '<p style="text-align:center; margin-top:20px; font-size:0.8em;">' +
                    'Emitido em: ' + new Date().toLocaleDateString() + ' às ' + new Date().toLocaleTimeString() +
                '</p>' +
            '</div>';
    }

    var htmlCompleto = criarVia("1ª VIA (EMPREGADOR)") + 
                         '<div style="text-align:center; margin:20px 0; border-bottom:2px dashed #000; position:relative;">' +
                            '<span style="position:absolute; top:-10px; left:45%; background:white; padding:0 10px;">CORTE AQUI</span>' +
                          '</div>' + 
                         criarVia("2ª VIA (FUNCIONÁRIO)");

    document.getElementById('reciboContent').innerHTML = htmlCompleto;
};

// Gerar Relatório de Cobrança
window.gerarRelatorioCobranca = function() {
    var clienteId = document.getElementById('selectContratanteRelatorio').value;
    var ini = document.getElementById('dataInicioRelatorio').value;
    var fim = document.getElementById('dataFimRelatorio').value;

    if (!clienteId) return alert("Selecione um Cliente.");
    
    var cliente = buscarContratantePorCnpj(clienteId);
    var ops = CACHE_OPERACOES.filter(function(o) { 
        return o.contratanteCNPJ === clienteId && 
               o.status === 'CONFIRMADA' &&
               o.data >= ini && o.data <= fim;
    });

    var total = 0;
    ops.forEach(function(o) { total += (Number(o.faturamento) || 0); });

    var html = 
        '<div style="border:2px solid #000; padding:30px;">' +
            '<h2 style="text-align:center;">DEMONSTRATIVO DE SERVIÇOS (FATURA)</h2>' +
            '<div style="display:flex; justify-content:space-between; margin-top:20px;">' +
                '<div>' +
                    '<strong>DE:</strong> ' + (buscarMinhaEmpresa()?.razaoSocial || 'TRANSPORTADORA') + '<br>' +
                    '<strong>PARA:</strong> ' + cliente.razaoSocial + '<br>' +
                    '<strong>CNPJ:</strong> ' + cliente.cnpj +
                '</div>' +
                '<div style="text-align:right;">' +
                    'Data Emissão: ' + new Date().toLocaleDateString() + '<br>' +
                    'Vencimento: À VISTA' +
                '</div>' +
            '</div>' +
            '<table style="width:100%; border-collapse:collapse; margin-top:30px;">' +
                '<thead>' +
                    '<tr style="border-bottom:2px solid #000;">' +
                        '<th style="text-align:left;">DATA</th>' +
                        '<th style="text-align:left;">VEÍCULO</th>' +
                        '<th style="text-align:right;">VALOR</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>';

    ops.forEach(function(o) {
        html += 
            '<tr style="border-bottom:1px solid #ccc;">' +
                '<td style="padding:8px 0;">' + formatarDataParaBrasileiro(o.data) + '</td>' +
                '<td>' + o.veiculoPlaca + '</td>' +
                '<td style="text-align:right;">' + formatarValorMoeda(o.faturamento) + '</td>' +
            '</tr>';
    });

    html += 
                '</tbody>' +
            '</table>' +
            '<h3 style="text-align:right; margin-top:40px;">TOTAL A PAGAR: ' + formatarValorMoeda(total) + '</h3>' +
        '</div>';

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportResults').style.display = 'block';
};

// Exportar PDF
window.exportarRelatorioPDF = function() {
    var el = document.getElementById('reportContent');
    if (el && el.innerText.trim() !== '') {
        var opt = {
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
    if (!window.USUARIO_ATUAL || window.USUARIO_ATUAL.role !== 'admin') return;

    var operacoes = CACHE_OPERACOES;
    var dataRef = window.currentDate || new Date();
    
    // Filtra mês atual
    var opsMes = operacoes.filter(function(op) {
        if (op.status !== 'CONFIRMADA') return false;
        var d = new Date(op.data);
        return d.getMonth() === dataRef.getMonth() && d.getFullYear() === dataRef.getFullYear();
    });

    var fatTotal = 0;
    var custoTotal = 0;

    opsMes.forEach(function(op) {
        fatTotal += (Number(op.faturamento) || 0);
        
        var cDiesel = calcularCustoViagemDiesel(op);
        var cDesp = Number(op.despesas) || 0;
        var cPessoal = 0;
        
        if (!op.checkins?.faltaMotorista) cPessoal += (Number(op.comissao) || 0);
        (op.ajudantes || []).forEach(function(aj) {
            if (!op.checkins?.faltasAjudantes?.includes(String(aj.id))) {
                cPessoal += (Number(aj.diaria) || 0);
            }
        });

        custoTotal += (cDiesel + cDesp + cPessoal);
    });

    var lucro = fatTotal - custoTotal;

    // Atualiza Labels
    if(document.getElementById('faturamentoMes')) document.getElementById('faturamentoMes').textContent = formatarValorMoeda(fatTotal);
    if(document.getElementById('despesasMes')) document.getElementById('despesasMes').textContent = formatarValorMoeda(custoTotal);
    
    var elLucro = document.getElementById('receitaMes');
    if (elLucro) {
        elLucro.textContent = formatarValorMoeda(lucro);
        elLucro.style.color = lucro >= 0 ? '#2e7d32' : '#c62828';
    }

    // Atualiza Chart.js
    var ctx = document.getElementById('mainChart');
    if (ctx) {
        if (window.meuGraficoInstance) window.meuGraficoInstance.destroy();
        
        window.meuGraficoInstance = new Chart(ctx, {
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
    var itensMenu = document.querySelectorAll('.nav-item');
    
    itensMenu.forEach(function(item) {
        // Clona e substitui para remover listeners antigos e evitar duplicação
        var novoItem = item.cloneNode(true);
        item.parentNode.replaceChild(novoItem, item);
        
        novoItem.addEventListener('click', function() {
            var paginaAlvoId = novoItem.getAttribute('data-page');
            
            // 1. Remove classe active de tudo
            document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
            document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
            
            // 2. Ativa alvo
            novoItem.classList.add('active');
            var paginaAlvo = document.getElementById(paginaAlvoId);
            if (paginaAlvo) paginaAlvo.classList.add('active');
            
            // 3. Fecha menu mobile
            var sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('active');
            var overlay = document.getElementById('sidebarOverlay');
            if (overlay) overlay.classList.remove('active');
            
            // 4. Ações específicas ao abrir página
            if (paginaAlvoId === 'home') {
                renderizarCalendario();
                atualizarDashboard();
            }
            if (paginaAlvoId === 'checkins-pendentes') {
                renderizarTabelaMonitoramento();
            }
            if (paginaAlvoId === 'meus-dados') {
                renderizarPainelMeusDados();
            }
        });
    });

    // Configura abas internas (ex: Cadastro -> Veiculos vs Funcionarios)
    document.querySelectorAll('.cadastro-tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.cadastro-tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.cadastro-form').forEach(function(f) { f.classList.remove('active'); });
            
            btn.classList.add('active');
            var tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Função Principal de Login/Inicialização
window.iniciarSistemaPorPapel = function(user) {
    window.USUARIO_ATUAL = user;
    console.log("Sistema iniciado para:", user.role);

    // Esconde todos os menus
    document.getElementById('menu-admin').style.display = 'none';
    document.getElementById('menu-employee').style.display = 'none';
    document.getElementById('menu-super-admin').style.display = 'none';

    var paginaInicial = 'home';

    if (user.email === 'admin@logimaster.com') {
        document.getElementById('menu-super-admin').style.display = 'block';
        paginaInicial = 'super-admin';
    } 
    else if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
        paginaInicial = 'home';
        
        preencherTodosSelects();
        renderizarCalendario();
        atualizarDashboard();
        renderizarInformacoesEmpresa();
    } 
    else {
        document.getElementById('menu-employee').style.display = 'block';
        paginaInicial = 'employee-home';
        window.MODO_APENAS_LEITURA = true;
        
        // Carrega dados específicos do funcionário
        renderizarPainelMeusDados();
        renderizarTabelaMonitoramento(); // Vê seus próprios checkins
    }

    // Configura cliques do menu
    configurarNavegacao();

    // Simula clique na página inicial
    var linkInicial = document.querySelector('.nav-item[data-page="' + paginaInicial + '"]');
    if (linkInicial) linkInicial.click();

    // Inicia ouvintes do Firebase
    if (window.dbRef && user.company) {
        var db = window.dbRef.db;
        var doc = window.dbRef.doc;
        var onSnapshot = window.dbRef.onSnapshot;
        var dominio = user.company;

        Object.values(DB_KEYS).forEach(function(chave) {
            onSnapshot(doc(db, 'companies', dominio, 'data', chave), function(snap) {
                if (snap.exists()) {
                    var dados = snap.data().items;
                    // Atualiza cache silenciosamente
                    if (chave === DB_KEYS.MINHA_EMPRESA) CACHE_MINHA_EMPRESA = dados || {};
                    else if (chave === DB_KEYS.FUNCIONARIOS) CACHE_FUNCIONARIOS = dados || [];
                    else if (chave === DB_KEYS.OPERACOES) CACHE_OPERACOES = dados || [];
                    else if (chave === DB_KEYS.VEICULOS) CACHE_VEICULOS = dados || [];
                    else if (chave === DB_KEYS.CONTRATANTES) CACHE_CONTRATANTES = dados || [];
                    else if (chave === DB_KEYS.DESPESAS_GERAIS) CACHE_DESPESAS = dados || [];
                    else if (chave === DB_KEYS.ATIVIDADES) CACHE_ATIVIDADES = dados || [];
                    
                    // Se for alteração crítica, re-renderiza
                    if (chave === DB_KEYS.OPERACOES) {
                        renderizarTabelaOperacoes();
                        renderizarCalendario();
                        atualizarDashboard();
                        renderizarTabelaMonitoramento();
                    } else {
                        preencherTodosSelects();
                    }
                }
            });
        });
    }
};

// Evento DOM Ready (Boot)
document.addEventListener('DOMContentLoaded', function() {
    configurarFormularios();
    configurarNavegacao();

    // Vínculo dos botões de Relatórios e Recibos (CORREÇÃO DE BOTÕES QUE NÃO FUNCIONAVAM)
    var btnRel = document.getElementById('btnGerarRelatorio');
    if (btnRel) btnRel.onclick = window.gerarRelatorioGeral;

    var btnRec = document.getElementById('btnGerarRecibo');
    if (btnRec) btnRec.onclick = window.gerarReciboPagamento;

    var btnCob = document.getElementById('btnGerarCobranca');
    if (btnCob) btnCob.onclick = window.gerarRelatorioCobranca;

    var btnPdf = document.getElementById('btnExportarPDF');
    if (btnPdf) btnPdf.onclick = window.exportarRelatorioPDF;

    // Toggle Menu Mobile
    var btnMobile = document.getElementById('mobileMenuBtn');
    if (btnMobile) {
        btnMobile.addEventListener('click', function() {
            document.getElementById('sidebar').classList.add('active');
            document.getElementById('sidebarOverlay').classList.add('active');
        });
    }
    
    var overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
    }

    // Helper: Adicionar Ajudante na Tela de Operação
    window._operacaoAjudantesTempList = [];
    var btnAddAjudante = document.getElementById('btnManualAddAjudante');
    if (btnAddAjudante) {
        btnAddAjudante.addEventListener('click', function() {
            var select = document.getElementById('selectAjudantesOperacao');
            var idAj = select.value;
            if (!idAj) return alert("Selecione um ajudante.");
            
            var funcAj = buscarFuncionarioPorId(idAj);
            var valorDiaria = prompt("Qual o valor da diária para " + funcAj.nome + "?", "0");
            
            if (valorDiaria !== null) {
                window._operacaoAjudantesTempList.push({
                    id: idAj,
                    diaria: Number(valorDiaria.replace(',', '.'))
                });
                renderizarListaAjudantesAdicionados();
                select.value = ''; // Reseta
            }
        });
    }
});

// Renderiza a lista visual de ajudantes na tela de lançamento
window.renderizarListaAjudantesAdicionados = function() {
    var ul = document.getElementById('listaAjudantesAdicionados');
    if (!ul) return;
    
    var html = window._operacaoAjudantesTempList.map(function(item) {
        var f = buscarFuncionarioPorId(item.id);
        var nome = f ? f.nome : 'Desconhecido';
        // Atenção: Escapando as aspas corretamente para o onclick
        return '<li>' + nome + ' (' + formatarValorMoeda(item.diaria) + ') ' +
               '<button type="button" class="btn-mini delete-btn" onclick="window._operacaoAjudantesTempList = window._operacaoAjudantesTempList.filter(function(x){return x.id !== \'' + item.id + '\'}); renderizarListaAjudantesAdicionados();">Remover</button>' +
               '</li>';
    }).join('');
    
    ul.innerHTML = html;
};