/* ==============================================================
   ADMIN.JS (CORRIGIDO PARA O SEU DASHBOARD)
   ============================================================== */
// admin.js (Na nova pasta)

// SUBSTITUA PELO SEU LINK REAL DO RENDER (SEM A BARRA NO FINAL)
const API_URL = "https://vunn.com.br"; 

// ... resto do código ...

// Funções de Ajuda (Formatar dinheiro e data)
function formatarMoeda(val) { return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarData(isoDate) { return new Date(isoDate).toLocaleDateString('pt-BR'); }

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Verifica se está logado
    const token = localStorage.getItem('adminToken');
    const isLoginPage = window.location.pathname.includes('admin_login.html');

    if (!token && !isLoginPage) {
        window.location.href = 'admin_login.html';
        return;
    }

    // 2. Configura o botão de Sair
    const btnLogout = document.getElementById('logout-button');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if(confirm("Sair do Painel Admin?")) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
            }
        });
    }

    // 3. Descobre em qual página estamos e roda a função certa
    const path = window.location.pathname;
    
    if (path.includes('admin_dashboard.html') || path.endsWith('/admin/')) {
        carregarDashboard(); // <--- AQUI ESTAVA O PROBLEMA, AGORA VAI FUNCIONAR
        carregarResumoDevedores();
    } 
    else if (path.includes('admin_produtos.html')) {
        if(typeof carregarProdutos === 'function') carregarProdutos();
    } 
    else if (path.includes('admin_pedidos.html')) {
        carregarPedidos();
    } 
    else if (path.includes('admin_afiliados.html')) {
        carregarAfiliados();
    }

    // 4. Lógica de Login (Para a tela de entrar)
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('adminToken', data.token);
                    window.location.href = 'admin_dashboard.html'; 
                } else { 
                    alert("Erro: " + (data.erro || "Login inválido")); 
                }
            } catch (e) { alert("Erro de conexão."); }
        });
    }
});

// ======================================================
// 📊 FUNÇÃO: CARREGAR DASHBOARD (VERSÃO BLINDADA)
// ======================================================
// ======================================================
// 📊 FUNÇÃO: CARREGAR DASHBOARD (COM FILTRO E LUCRO)
// ======================================================
async function carregarDashboard() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    // 1. Pega o valor do filtro de tempo (ex: 'hoje', '30dias')
    const filtroSelect = document.getElementById('filtro-tempo-dashboard');
    const periodo = filtroSelect ? filtroSelect.value : 'total';

    try {
        // Envia o período na URL para o Backend filtrar
        const res = await fetch(`${API_URL}/admin/dashboard-stats?periodo=${periodo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Falha ao buscar dados do Dashboard");

        const dados = await res.json();
        console.log("Dados Dashboard:", dados);

        // --- PREENCHIMENTO DOS CARDS ---

        // 1. Faturamento
        const elFat = document.getElementById('faturamento-total');
        if(elFat) elFat.innerText = formatarMoeda(dados.faturamento);

        // 2. Lucro Líquido (NOVO)
        // Se o backend ainda não mandar 'lucroLiquido', calculamos aqui provisoriamente:
        // Lucro = Faturamento - Comissões
        const lucroReal = dados.lucroLiquido !== undefined ? dados.lucroLiquido : (dados.faturamento - (dados.comissoesTotais || 0));
        
        const elLucro = document.getElementById('lucro-liquido-total');
        if(elLucro) elLucro.innerText = formatarMoeda(lucroReal);

        // 3. Total de Pedidos
        const elPed = document.getElementById('total-pedidos');
        if(elPed) elPed.innerText = dados.totalPedidos;

        // 4. Comissões (Custo)
        // ... (dentro de carregarDashboard, logo após atualizar o total de pedidos)

        // 4. Comissões (CARD DETALHADO E NOVO)
        const cardComissao = document.getElementById('card-comissoes-container');
        
        if (cardComissao) {
            // Formata os valores que vieram da API
            const pagas = formatarMoeda(dados.comissoesPagas || 0);
            const geradas = formatarMoeda(dados.comissoesGeradas || 0);
            const pendentes = formatarMoeda(dados.comissoesPendentes || 0); // Saldo acumulado

            // Desenha o HTML interno do Card
            cardComissao.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <span style="font-size:0.9rem; color:#c0392b; font-weight:bold;">Comissões Pagas</span>
                        <div class="value" style="color: #c0392b; font-size:1.6rem; margin:5px 0;">${pagas}</div>
                    </div>
                    <div style="background:#fcebe6; color:#c0392b; padding:8px; border-radius:50%;">
                        <i class="ph ph-users"></i>
                    </div>
                </div>
                
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid #eee; font-size:0.85rem; display:flex; flex-direction:column; gap:5px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#666;">Gerado (Período):</span>
                        <strong style="color:#2c3e50;">${geradas}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#666;">Falta Pagar (Geral):</span>
                        <strong style="color:#e67e22;">${pendentes}</strong>
                    </div>
                </div>
            `;
        }

        // --- PREENCHE TABELA DE PEDIDOS RECENTES ---
        // (Mantive sua lógica original aqui)
        const tabela = document.querySelector('table tbody');
        if (tabela && dados.ultimosPedidos) {
            tabela.innerHTML = '';
            if(dados.ultimosPedidos.length === 0) {
                tabela.innerHTML = '<tr><td colspan="5" align="center">Sem vendas neste período.</td></tr>';
            } else {
                dados.ultimosPedidos.forEach(p => {
                    const statusClass = p.status ? p.status.toLowerCase() : 'pendente';
                    let clienteHtml = `<strong>${p.clienteNome || 'Cliente'}</strong>`;
                    if(p.afiliado) clienteHtml += `<br><small style="color:#e67e22">Via: ${p.afiliado.nome}</small>`;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>#${p.id}</td>
                        <td>${clienteHtml}</td>
                        <td>${formatarMoeda(p.valorTotal)}</td>
                        <td>${formatarData(p.createdAt)}</td>
                        <td><span class="status-badge ${statusClass}">${p.status || 'PENDENTE'}</span></td>
                    `;
                    tabela.appendChild(tr);
                });
            }
        }

    } catch(e) { 
        console.error("Erro ao carregar Dashboard:", e);
    }
}

async function carregarPedidos() {
    try {
        const res = await fetch(`${API_URL}/admin/pedidos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const lista = await res.json();
        
        const tbody = document.querySelector('tbody'); 
        if(!tbody) return;
        tbody.innerHTML = '';

        lista.forEach(p => {
            const vendedor = p.afiliado ? `<span style="color:#e67e22">🦊 ${p.afiliado.nome}</span>` : 'Loja Oficial';
            
            // Define a cor baseada no status atual
            let corSelect = '#f39c12'; // Laranja (Pendente)
            if(p.status === 'APROVADO') corSelect = '#27ae60'; // Verde
            if(p.status === 'CANCELADO') corSelect = '#c0392b'; // Vermelho
            if(p.status === 'ENTREGUE') corSelect = '#2980b9'; // Azul

            const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${p.id}</td>
                    <td>
                        <strong>${p.clienteNome}</strong><br>
                        <small>${p.clienteEmail}</small>
                    </td>
                    <td>${vendedor}</td>
                    <td>${formatarMoeda(p.valorTotal)}</td>
                    <td>${formatarData(p.createdAt)}</td>
                    <td style="display:flex; gap:5px; align-items:center;">
                        <button onclick="abrirModalPedido(${p.id})" style="background:#3498db; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;" title="Ver Detalhes">
                            <i class="ph ph-eye" style="font-size:1.2rem;"></i>
                        </button>
                    <select onchange="mudarStatusPedido(${p.id}, this.value)" 
                            style="padding:5px; border-radius:4px; font-weight:bold; color:white; background-color:${corSelect}; border:none; cursor:pointer;">
                        <option value="PENDENTE" ${p.status === 'PENDENTE' ? 'selected' : ''}>⏳ Pendente</option>
                        <option value="APROVADO" ${p.status === 'APROVADO' ? 'selected' : ''}>✅ Aprovado</option>
                        <option value="ENTREGUE" ${p.status === 'ENTREGUE' ? 'selected' : ''}>🚚 Entregue</option>
                        <option value="CANCELADO" ${p.status === 'CANCELADO' ? 'selected' : ''}>🚫 Cancelado</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

// Nova função para enviar a mudança pro servidor
async function mudarStatusPedido(id, novoStatus) {
    // Muda a cor do select na hora para dar feedback visual
    const select = event.target;
    if(novoStatus === 'APROVADO') select.style.backgroundColor = '#27ae60';
    else if(novoStatus === 'CANCELADO') select.style.backgroundColor = '#c0392b';
    else if(novoStatus === 'ENTREGUE') select.style.backgroundColor = '#2980b9';
    else select.style.backgroundColor = '#f39c12';

    try {
        const token = localStorage.getItem('adminToken');
        await fetch(`${API_URL}/admin/orders/${id}/status`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: novoStatus })
        });
        // Não precisa recarregar a tela toda, pois já mudamos a cor visualmente
        console.log("Status salvo com sucesso!");
    } catch (e) {
        alert("Erro ao salvar status.");
        console.error(e);
    }
}



// 2. CARREGAR LISTA GERAL (COM BOTÃO DE APROVAR)
        async function carregarTodosAfiliados() {
            const token = localStorage.getItem('adminToken');
            try {
                const res = await fetch(`${API_URL}/admin/afiliados`, { headers: { 'Authorization': `Bearer ${token}` } });
                const lista = await res.json();
                const tbody = document.getElementById('lista-afiliados');
                tbody.innerHTML = '';

                lista.forEach(a => {
                    // Lógica do Status
                    const statusHtml = a.aprovado 
                        ? '<span style="color:green; font-weight:bold; background:#d4edda; padding:2px 6px; border-radius:4px;">Ativo</span>' 
                        : '<span style="color:#856404; font-weight:bold; background:#fff3cd; padding:2px 6px; border-radius:4px;">Pendente</span>';

                    // Lógica do Botão
                    let btnAcao = '';
                    if (!a.aprovado) {
                        // Se não aprovado, mostra botão VERDE de Aprovar
                        btnAcao = `<button onclick="alterarStatusAfiliado(${a.id}, true)" class="btn-action" style="background:#27ae60; cursor:pointer;">✔ Aprovar</button>`;
                    } else {
                        // Se já aprovado, mostra botão VERMELHO de Bloquear (Opcional)
                        btnAcao = `<button onclick="alterarStatusAfiliado(${a.id}, false)" class="btn-action" style="background:#c0392b; cursor:pointer;">✖ Bloquear</button>`;
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${a.nome}</td>
                        <td>${a.telefone}</td>
                        <td><strong>${a.codigo}</strong></td>
                        <td>${parseFloat(a.vendasTotais || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                        <td>${statusHtml}</td>
                        <td>${btnAcao}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch(e) { console.error(e); }
        }

        // NOVA FUNÇÃO: CHAMAR O SERVIDOR PARA APROVAR
        async function alterarStatusAfiliado(id, novoStatus) {
            const acao = novoStatus ? "Aprovar" : "Bloquear";
            if(!confirm(`Tem certeza que deseja ${acao} este afiliado?`)) return;

            try {
                const token = localStorage.getItem('adminToken');
                const res = await fetch(`${API_URL}/admin/afiliados/${id}/status`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ aprovado: novoStatus })
                });

                if(res.ok) {
                    alert(`Afiliado ${novoStatus ? 'ativado' : 'bloqueado'} com sucesso!`);
                    carregarTodosAfiliados(); // Atualiza a lista na hora
                } else {
                    alert("Erro ao atualizar status.");
                }
            } catch(e) {
                alert("Erro de conexão.");
            }
        }

async function alterarStatusAfiliado(id, novoStatus) {
    if(!confirm("Alterar status?")) return;
    try {
        await fetch(`${API_URL}/admin/afiliados/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
            body: JSON.stringify({ aprovado: novoStatus })
        });
        carregarAfiliados();
    } catch(e) { alert("Erro ao atualizar."); }
}

// ===========================================
// FUNÇÕES DO MODAL DE PEDIDOS
// ===========================================
let PEDIDO_ATUAL_ID = null; // Para saber qual pedido estamos editando no modal

async function abrirModalPedido(id) {
    const token = localStorage.getItem('adminToken');
    
    // 1. Abre o modal e mostra carregando
    document.getElementById('modal-pedido').style.display = 'flex';
    document.getElementById('modal-pedido-titulo').innerText = `Carregando Pedido #${id}...`;
    PEDIDO_ATUAL_ID = id;

    let btnTiny = '';

    if (p.tinyId) {
        btnTiny = `<button class="btn-tiny" style="background:#7f8c8d;">🧾 Pedido já no ERP</button>`;
    } else {
        btnTiny = `<button onclick="enviarParaTiny(${p.id})" class="btn-tiny" style="background:#34495e;">🚀 Enviar para Tiny (NF)</button>`;
    }

    try {
        // 2. Busca os detalhes completos
        const res = await fetch(`${API_URL}/admin/orders/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const p = await res.json();

        // 3. Preenche Dados do Cliente
        document.getElementById('modal-pedido-titulo').innerText = `Pedido #${p.id} - Detalhes`;
        document.getElementById('det-cliente').innerText = p.clienteNome;
        document.getElementById('det-email').innerText = p.clienteEmail;
        document.getElementById('det-telefone').innerText = p.clienteTelefone || '-';
        document.getElementById('det-doc').innerText = p.clienteDoc || '-'; // Se você salvar CPF/CNPJ

        // 4. Preenche Endereço e Afiliado
        // Tenta fazer o parse do endereço se for JSON, senão mostra string normal
        let enderecoTexto = p.enderecoEntrega;
        try {
            const endObj = JSON.parse(p.enderecoEntrega);
            enderecoTexto = `${endObj.rua}, ${endObj.numero} - ${endObj.bairro}\n${endObj.cidade}/${endObj.estado}\nCEP: ${endObj.cep}\nRef: ${endObj.complemento || ''}`;
        } catch(e) {} // Se não for JSON, usa o texto puro mesmo
        
        document.getElementById('det-endereco').innerText = enderecoTexto || 'Retirada na Loja / Não informado';

        // Afiliado
        if (p.afiliado) {
            document.getElementById('det-afiliado').innerHTML = `🦊 ${p.afiliado.nome} <br> <small>Tel: ${p.afiliado.telefone}</small>`;
        } else {
            document.getElementById('det-afiliado').innerHTML = `<span style="color:#2980b9">🏢 Venda Direta (Loja Oficial)</span>`;
        }

        // 5. Preenche os Produtos (Itens)
        const tbody = document.getElementById('lista-itens-pedido');
        tbody.innerHTML = '';
        
        let itens = [];
        try {
            itens = typeof p.itens === 'string' ? JSON.parse(p.itens) : p.itens;
        } catch(e) { itens = []; }

        if(itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" align="center">Erro ao ler itens.</td></tr>';
        } else {
            itens.forEach(item => {
                const totalItem = parseFloat(item.preco) * parseInt(item.qtd);
                tbody.innerHTML += `
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #eee;">
                            <div style="font-weight:bold; font-size:0.9rem;">${item.titulo || item.nome}</div>
                            <small style="color:#7f8c8d;">Ref: ${item.id}</small>
                        </td>
                        <td style="text-align:center; padding:8px; border-bottom:1px solid #eee;">${item.qtd}</td>
                        <td style="text-align:right; padding:8px; border-bottom:1px solid #eee;">${formatarMoeda(item.preco)}</td>
                        <td style="text-align:right; padding:8px; border-bottom:1px solid #eee; font-weight:bold;">${formatarMoeda(totalItem)}</td>
                    </tr>
                `;
            });
        }

        // 6. Totais
        document.getElementById('det-total').innerText = formatarMoeda(p.valorTotal);

    } catch (e) {
        alert("Erro ao carregar detalhes.");
        fecharModalPedido();
        console.error(e);
    }
}

function fecharModalPedido() {
    document.getElementById('modal-pedido').style.display = 'none';
    PEDIDO_ATUAL_ID = null;
}

// Atalho para mudar status de dentro do modal
function mudarStatusModal(status) {
    if(PEDIDO_ATUAL_ID) {
        if(confirm(`Mudar status para ${status}?`)) {
            mudarStatusPedido(PEDIDO_ATUAL_ID, status).then(() => {
                alert("Status atualizado!");
                abrirModalPedido(PEDIDO_ATUAL_ID); // Recarrega o modal para ver mudança (opcional)
                carregarPedidos(); // Atualiza a lista no fundo
            });
        }
    }
}

        // ============================================
        // 2. NOVA FUNÇÃO: CARREGA DÍVIDAS DOS AFILIADOS
        // ============================================
        async function carregarResumoDevedores() {
            const token = localStorage.getItem('adminToken');
            try {
                const res = await fetch(`${API_URL}/admin/devedores-resumo`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if(res.ok) {
                    const dados = await res.json();
                    
                    // Atualiza o Card Vermelho
                    document.getElementById('total-recuperar').innerText = 
                        parseFloat(dados.totalRecuperar || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
                    
                    document.getElementById('qtd-devedores').innerText = 
                        `${dados.qtdDevedores || 0} afiliados no vermelho`;
                }
            } catch(e) {
                console.error("Erro ao carregar dívidas:", e);
                document.getElementById('total-recuperar').innerText = "Erro";
            }
        }


async function limparBancoDeTestes() {
    if (!confirm("TEM CERTEZA ABSOLUTA? Isso apagará todas as vendas, saques e afiliados de teste!")) return;
    if (!confirm("Última chance: Isso não tem volta. Produtos e Admin serão mantidos. Continuar?")) return;

    const token = localStorage.getItem('token'); // Ou onde você guarda o token admin

    const res = await fetch('/admin/limpar-banco-testes', {
        method: 'DELETE',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    const dados = await res.json();
    alert(dados.mensagem || dados.erro);
    if(dados.sucesso) window.location.reload();
}