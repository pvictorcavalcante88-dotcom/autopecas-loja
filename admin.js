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
// 📊 FUNÇÃO: CARREGAR DASHBOARD (CORRIGIDA)
// ======================================================
async function carregarDashboard() {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/dashboard-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if(!res.ok) throw new Error("Falha ao buscar dados");

        const data = await res.json();

        // --- AQUI ESTÁ A CORREÇÃO DOS IDs ---
        
        // 1. Faturamento (Agora busca 'total-vendas')
        const elFat = document.getElementById('total-vendas');
        if(elFat) elFat.innerText = formatarMoeda(data.faturamento);
        
        // 2. Pedidos
        const elPed = document.getElementById('total-pedidos');
        if(elPed) elPed.innerText = data.totalPedidos;

        // 3. Produtos
        const elProd = document.getElementById('total-produtos');
        if(elProd) elProd.innerText = data.produtos;

        // 4. Estoque
        const elEst = document.getElementById('estoque-baixo');
        if(elEst) elEst.innerText = data.estoqueBaixo;

        // 5. Tabela de Últimos Pedidos (Agora busca 'ultimos-pedidos-list')
        const tbody = document.getElementById('ultimos-pedidos-list');
        if(tbody && data.ultimosPedidos) {
            tbody.innerHTML = '';
            data.ultimosPedidos.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${p.id}</td>
                    <td>${p.clienteNome || 'Cliente'}</td>
                    <td>${formatarMoeda(p.valorTotal)}</td>
                    <td>${formatarData(p.createdAt)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) { console.error("Erro no Dashboard:", e); }
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