/* ==============================================================
   ADMIN.JS COMPLETO (Login + Dashboard + Tabelas)
   ============================================================== */
const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// Funções Utilitárias
function formatarMoeda(val) { return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarData(isoDate) { return new Date(isoDate).toLocaleDateString('pt-BR'); }

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Verifica Token de Acesso
    const token = localStorage.getItem('adminToken');
    const isLoginPage = window.location.pathname.includes('admin_login.html');

    if (!token && !isLoginPage) {
        window.location.href = 'admin_login.html';
        return;
    }

    // 2. Configura Logout
    const btnLogout = document.getElementById('logout-button') || document.querySelector('.logout-link'); // Tenta achar o botão ou link
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if(confirm("Sair do Painel Admin?")) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
            }
        });
    }

    // 3. Roteamento Inteligente (Executa a função certa pra cada página)
    const path = window.location.pathname;
    
    if (path.includes('admin_dashboard.html') || path.endsWith('/admin/')) {
        carregarDashboard();
    } 
    else if (path.includes('admin_produtos.html')) {
        carregarProdutos(); // Certifique-se que tem essa função ou script separado para produtos
    } 
    else if (path.includes('admin_pedidos.html')) {
        carregarPedidos();
    } 
    else if (path.includes('admin_afiliados.html')) {
        carregarAfiliados();
    }

    // 4. Lógica de Login (Para a página de login)
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            try {
                // Rota de login (ajustada para /login conforme seu server.js)
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
// 📊 FUNÇÃO: CARREGAR DASHBOARD
// ======================================================
async function carregarDashboard() {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/dashboard-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if(!res.ok) throw new Error("Falha ao buscar dados");

        const data = await res.json();

        // Preenche os Cards (Verifique se os IDs no seu HTML batem com esses)
        const elFat = document.querySelector('.card h3:nth-of-type(1)') || document.getElementById('faturamento-total'); // Tenta achar genericamente ou por ID
        if(elFat) elFat.innerText = formatarMoeda(data.faturamento);
        
        // Se você usar IDs específicos nos cards, ajuste aqui:
        if(document.getElementById('total-pedidos')) document.getElementById('total-pedidos').innerText = data.totalPedidos;
        if(document.getElementById('total-produtos')) document.getElementById('total-produtos').innerText = data.produtos;
        if(document.getElementById('estoque-baixo')) document.getElementById('estoque-baixo').innerText = data.estoqueBaixo;

        // Preenche Tabela de Últimos Pedidos
        const tbody = document.querySelector('table tbody'); // Pega o primeiro corpo de tabela que achar
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
    } catch(e) { console.error(e); }
}

// ======================================================
// 📦 FUNÇÃO: CARREGAR PEDIDOS
// ======================================================
async function carregarPedidos() {
    try {
        const res = await fetch(`${API_URL}/admin/pedidos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const lista = await res.json();
        
        // Procura tbody da tabela
        const tbody = document.querySelector('.table-container tbody') || document.querySelector('table tbody');
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
// 🦊 FUNÇÃO: CARREGAR AFILIADOS (Com Mensagem e Banco)
// ======================================================
// Variável global para saber para quem mandar msg
let ID_DESTINATARIO_ATUAL = null;

async function carregarAfiliados() {
    try {
        const res = await fetch(`${API_URL}/admin/afiliados`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const lista = await res.json();
        
        const tbody = document.querySelector('table tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        lista.forEach(af => {
            // Verifica se tem dados bancários
            let infoBancaria = `<span style="color:#bdc3c7; font-size:0.8rem;">Pendente</span>`;
            if (af.chavePix || af.banco) {
                infoBancaria = `
                    <div style="font-size:0.75rem; color:#555; line-height:1.2;">
                        ${af.chavePix ? `Pix: <b>${af.chavePix}</b><br>` : ''}
                        ${af.banco ? `Banco: ${af.banco}` : ''}
                        ${af.agencia ? ` Ag: ${af.agencia}` : ''}
                        ${af.conta ? ` Cc: ${af.conta}` : ''}
                    </div>
                `;
            }

            const statusLabel = af.aprovado 
                ? `<span style="color:#27ae60; background:#e8f5e9; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem;">Ativo</span>` 
                : `<span style="color:#e74c3c; background:#fadbd8; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem;">Bloqueado</span>`;

            const btnStatus = !af.aprovado
                ? `<button onclick="alterarStatusAfiliado(${af.id}, true)" style="background:#27ae60; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;" title="Aprovar"><i class="ph ph-check"></i></button>`
                : `<button onclick="alterarStatusAfiliado(${af.id}, false)" style="background:#e74c3c; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;" title="Bloquear"><i class="ph ph-prohibit"></i></button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:bold;">${af.nome}</div>
                    <div style="font-size:0.8rem; color:#777;">${af.telefone}</div>
                    ${infoBancaria}
                </td>
                <td><b>${af.codigo}</b></td>
                <td>${statusLabel}</td>
                <td>${formatarMoeda(af.vendasTotais)}</td>
                <td><strong style="color:#27ae60;">${formatarMoeda(af.saldo)}</strong></td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button onclick="abrirModalMsg(${af.id}, '${af.nome}')" style="background:#3498db; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;" title="Mensagem">
                            <i class="ph ph-envelope-simple"></i>
                        </button>
                        ${btnStatus}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) { console.error(e); }
}

// Ações de Afiliado
async function alterarStatusAfiliado(id, novoStatus) {
    if(!confirm(novoStatus ? "Aprovar este parceiro?" : "Bloquear este parceiro?")) return;
    try {
        await fetch(`${API_URL}/admin/afiliados/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
            body: JSON.stringify({ aprovado: novoStatus })
        });
        carregarAfiliados();
    } catch(e) { alert("Erro ao atualizar."); }
}

// Modal de Mensagem
function abrirModalMsg(id, nome) {
    ID_DESTINATARIO_ATUAL = id;
    const modal = document.getElementById('modal-mensagem');
    if(modal) {
        document.getElementById('msg-destinatario').innerText = nome;
        document.getElementById('msg-texto').value = '';
        modal.style.display = 'flex';
    } else {
        alert("Erro: Modal de mensagem não encontrado no HTML.");
    }
}

function fecharModalMsg() {
    document.getElementById('modal-mensagem').style.display = 'none';
    ID_DESTINATARIO_ATUAL = null;
}

async function enviarMensagemConfirmada() {
    const texto = document.getElementById('msg-texto').value;
    if(!texto.trim()) return alert("Digite algo!");
    
    try {
        const res = await fetch(`${API_URL}/admin/mensagens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
            body: JSON.stringify({ afiliadoId: ID_DESTINATARIO_ATUAL, texto })
        });
        if(res.ok) { alert("Enviado!"); fecharModalMsg(); }
        else alert("Erro ao enviar.");
    } catch(e) { alert("Erro de conexão."); }
}

// ======================================================
// 🛒 FUNÇÃO: CARREGAR PRODUTOS (Básica)
// ======================================================
async function carregarProdutos() {
    // Se você tiver uma lógica específica de produtos, mantenha ela.
    // Esta é uma genérica caso tenha perdido.
    try {
        const res = await fetch(`${API_URL}/search?q=`); // Usa a busca pra pegar tudo
        const produtos = await res.json();
        const tbody = document.querySelector('table tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        produtos.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${p.image||p.imagem}" width="40"></td>
                <td>${p.name||p.titulo}</td>
                <td>${formatarMoeda(p.price||p.preco_novo)}</td>
                <td>${p.quantidade || 0}</td>
                <td>
                    <button style="background:#f39c12; border:none; padding:5px; border-radius:4px; color:white;"><i class="ph ph-pencil"></i></button>
                    <button style="background:#e74c3c; border:none; padding:5px; border-radius:4px; color:white;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e){}
}