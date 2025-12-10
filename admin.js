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

// ======================================================
// 📦 FUNÇÃO: CARREGAR PEDIDOS (COMPLETO)
// ======================================================
async function carregarPedidos() {
    try {
        const res = await fetch(`${API_URL}/admin/pedidos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const lista = await res.json();
        
        // Tenta achar o corpo da tabela de várias formas para não dar erro
        const tbody = document.querySelector('tbody'); 
        if(!tbody) return;
        tbody.innerHTML = '';

        lista.forEach(p => {
            const vendedor = p.afiliado ? `<span style="color:#e67e22">🦊 ${p.afiliado.nome}</span>` : 'Loja Oficial';
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
                <td><span style="background:#2ecc71; color:white; padding:3px 8px; border-radius:4px; font-size:0.8rem;">Pago</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

// ======================================================
// 🦊 FUNÇÃO: CARREGAR AFILIADOS
// ======================================================
async function carregarAfiliados() {
    try {
        const res = await fetch(`${API_URL}/admin/afiliados`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const lista = await res.json();
        
        const tbody = document.querySelector('tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        lista.forEach(af => {
            let infoBancaria = `<span style="color:#bdc3c7; font-size:0.8rem;">Pendente</span>`;
            if (af.chavePix || af.banco) {
                infoBancaria = `Pix: ${af.chavePix || '-'} | Banco: ${af.banco || '-'}`;
            }

            const statusLabel = af.aprovado 
                ? `<span style="color:#27ae60; background:#e8f5e9; padding:2px 6px; border-radius:4px;">Ativo</span>` 
                : `<span style="color:#e74c3c; background:#fadbd8; padding:2px 6px; border-radius:4px;">Bloqueado</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${af.nome}<br><small>${af.telefone}</small></td>
                <td>${infoBancaria}</td>
                <td><b>${af.codigo}</b></td>
                <td>${statusLabel}</td>
                <td>${formatarMoeda(af.vendasTotais)}</td>
                <td><strong>${formatarMoeda(af.saldo)}</strong></td>
                <td>
                    ${!af.aprovado ? `<button onclick="alterarStatusAfiliado(${af.id}, true)">✅</button>` : `<button onclick="alterarStatusAfiliado(${af.id}, false)">🚫</button>`}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
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