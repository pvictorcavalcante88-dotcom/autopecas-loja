/* ==============================================================
   ADMIN.JS (CORRIGIDO PARA O SEU DASHBOARD)
   ============================================================== */
const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

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
async function carregarDashboard() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
        // Chama a rota que conta tudo no banco de dados
        const res = await fetch(`${API_URL}/admin/dashboard-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Falha ao buscar dados do Dashboard");

        const dados = await res.json();
        console.log("Dados do Dashboard recebidos:", dados); // Olhe no F12 para ver os números reais

        // --- 1. PREENCHE OS CARDS (ESTRATÉGIA DUPLA) ---
        // Tenta achar pelo ID correto OU pela posição do Card na tela
        
        // Faturamento (1º Card)
        const elFat = document.getElementById('faturamento-total') || 
                      document.getElementById('total-vendas') || 
                      document.querySelector('.card:nth-child(1) h2'); 
                      // ^ Procura o h2 dentro do primeiro card
        if(elFat) elFat.innerText = formatarMoeda(dados.faturamento);
        
        // Total de Pedidos (2º Card)
        const elPed = document.getElementById('total-pedidos') || 
                      document.querySelector('.card:nth-child(2) h2');
        if(elPed) elPed.innerText = dados.totalPedidos;

        // Total de Produtos (3º Card)
        const elProd = document.getElementById('total-produtos') || 
                      document.querySelector('.card:nth-child(3) h2');
        if(elProd) elProd.innerText = dados.produtos;

        // Estoque Baixo (4º Card)
        const elEst = document.getElementById('estoque-baixo') || 
                      document.querySelector('.card:nth-child(4) h2');
        if(elEst) elEst.innerText = dados.estoqueBaixo;


        // --- 2. PREENCHE A TABELA DE ÚLTIMOS PEDIDOS ---
        const tabela = document.querySelector('.recent-orders table tbody') || document.querySelector('table tbody');
        
        if (tabela) {
            tabela.innerHTML = ''; // Limpa antes de preencher
            
            if(!dados.ultimosPedidos || dados.ultimosPedidos.length === 0) {
                tabela.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhum pedido recente.</td></tr>';
            } else {
                dados.ultimosPedidos.forEach(p => {
                    const statusClass = p.status ? p.status.toLowerCase() : 'pendente';
                    
                    // Verifica se veio de afiliado
                    let clienteHtml = `<strong>${p.clienteNome || 'Cliente'}</strong>`;
                    if(p.afiliado) {
                        clienteHtml += `<br><small style="color:#e67e22">Via: ${p.afiliado.nome}</small>`;
                    }

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
                <td>
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

// Adicione esta chamada dentro do seu "document.addEventListener" ou "carregarDashboard"
    carregarTotalComissoes();

    // --- FUNÇÃO PARA BUSCAR O TOTAL DE COMISSÕES ---
    async function carregarTotalComissoes() {
        const token = localStorage.getItem('adminToken');
        try {
            const res = await fetch(`${API_URL}/admin/comissoes-totais`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if(res.ok) {
                const data = await res.json();
                
                // Formata para Real (R$ 1.250,00)
                const valorFormatado = parseFloat(data.total).toLocaleString('pt-BR', {
                    style: 'currency', 
                    currency: 'BRL'
                });

                document.getElementById('total-comissoes').innerText = valorFormatado;
            }
        } catch(e) {
            console.error("Erro ao carregar comissões:", e);
            document.getElementById('total-comissoes').innerText = "Erro";
        }
    }