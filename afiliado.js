/* =======================================================
   SCRIPT DO PAINEL DO AFILIADO (Versão Fusão: CRM + Orçamentos)
   ======================================================= */

const API_URL = ''; 
let AFILIADO_DADOS = null;

// INICIALIZAÇÃO
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
});

function verificarLogin() {
    const dados = localStorage.getItem('afiliadoLogado');
    if (!dados) {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'index.html'; // Ou afiliado_login.html
        return;
    }
    AFILIADO_DADOS = JSON.parse(dados);
    
    // Configura o botão de Sair
    const btnLogout = document.getElementById('logout-btn') || document.querySelector('.btn-sair'); // Tenta pegar dos dois jeitos
    if(btnLogout) {
        btnLogout.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('minhaMargem'); // Se usar margem personalizada
            window.location.href = 'index.html';
        };
    }

    // Carrega tudo
    carregarDashboardCompleto();
    carregarMeusOrcamentos();
    iniciarNotificacoes();
}

// Navegação entre abas (Para o novo HTML)
function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));

    const tab = document.getElementById(abaId);
    const nav = document.getElementById('nav-' + abaId);

    if(tab) tab.classList.add('active');
    if(nav) nav.classList.add('active');

    if(abaId === 'clientes') carregarMeusClientes();
}


// ============================================================
// 1. DASHBOARD GERAL (Saldo, Nome, Vendas Recentes)
// ============================================================
async function carregarDashboardCompleto() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados do dashboard");

        const data = await res.json();
        
        // --- PREENCHE O HTML NOVO ---

        // 1. Nome e Saldo
        const elNome = document.getElementById('nome-afiliado') || document.getElementById('afiliado-nome');
        if(elNome) elNome.textContent = `Olá, ${data.nome}!`;

        const elSaldo = document.getElementById('saldo-total') || document.getElementById('afiliado-saldo');
        if(elSaldo) elSaldo.textContent = parseFloat(data.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        // 2. Contador de Vendas
        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd) elQtd.innerText = data.vendas ? data.vendas.length : 0;

        // 3. Preencher Tabelas de Vendas
        // Tabela Resumida (Aba Dashboard)
        renderizarTabelaVendas('lista-ultimas-vendas', data.vendas.slice(0, 5));
        // Tabela Completa (Aba Vendas)
        renderizarTabelaVendas('lista-todas-vendas', data.vendas);

        // 4. Preenche Inputs de Banco (Se existirem na tela)
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = data.chavePix || '';
        if(document.getElementById('input-banco')) document.getElementById('input-banco').value = data.banco || '';
        if(document.getElementById('input-agencia')) document.getElementById('input-agencia').value = data.agencia || '';
        if(document.getElementById('input-conta')) document.getElementById('input-conta').value = data.conta || '';

    } catch (error) {
        console.error("Erro Dashboard:", error);
    }
}

// Função Auxiliar para Desenhar Tabelas de Vendas
function renderizarTabelaVendas(elementId, vendas) {
    const tbody = document.getElementById(elementId);
    if(!tbody) return;

    tbody.innerHTML = '';
    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhuma venda realizada.</td></tr>';
        return;
    }
    
    // Ordena por data (mais recente primeiro)
    vendas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    vendas.forEach(v => {
        const tr = document.createElement('tr');
        
        // Cores dos Status
        let statusClass = 'pendente'; // css class
        let corStatus = '#f39c12'; // fallback color
        
        if(v.status === 'APROVADO') { statusClass = 'aprovado'; corStatus = '#27ae60'; }
        if(v.status === 'CANCELADO') { statusClass = 'cancelado'; corStatus = '#c0392b'; }

        // HTML compatível com o novo layout
        tr.innerHTML = `
            <td>${new Date(v.createdAt).toLocaleDateString('pt-BR')}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${parseFloat(v.valorTotal).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
            <td style="color:#27ae60; font-weight:bold;">+ ${parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
            <td><span class="status ${statusClass}" style="color:${corStatus}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}


// ============================================================
// 2. MEUS CLIENTES (NOVIDADE CRM)
// ============================================================
async function carregarMeusClientes() {
    const tbody = document.getElementById('lista-clientes');
    if(!tbody) return; // Se não tiver a tabela na tela, sai

    tbody.innerHTML = '<tr><td colspan="5" align="center">Carregando...</td></tr>';
    
    try {
        const res = await fetch(`${API_URL}/afiliado/meus-clientes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        const clientes = await res.json();

        tbody.innerHTML = '';
        if(clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center">Nenhum cliente na sua carteira ainda. Gere orçamentos!</td></tr>';
            return;
        }

        clientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nome}</strong></td>
                <td>
                    ${c.email}<br>
                    <a href="https://wa.me/?text=Olá ${c.nome}, tudo bem?" target="_blank" style="color:#27ae60; font-size:0.8rem; text-decoration:none;">
                        <i class="ph ph-whatsapp-logo"></i> Contatar
                    </a>
                </td>
                <td>${parseFloat(c.totalGasto).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
                <td>
                    <button onclick="alert('Total gasto: ' + '${parseFloat(c.totalGasto).toFixed(2)}')" style="cursor:pointer; padding:5px;">Ver</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:red">Erro ao carregar clientes.</td></tr>';
    }
}


// ============================================================
// 3. MEUS ORÇAMENTOS (MANTIDO DO ANTIGO)
// ============================================================
async function carregarMeusOrcamentos() {
    try {
        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        
        const lista = await res.json();
        const tbody = document.getElementById('lista-orcamentos-salvos');
        if(!tbody) return;

        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Nenhum orçamento salvo.<br><small>Faça um orçamento na Loja e ele aparecerá aqui.</small></td></tr>';
            return;
        }

        lista.forEach(orc => {
            const data = new Date(orc.createdAt).toLocaleDateString('pt-BR');
            // Tenta pegar o total se existir, senão mostra texto
            const totalDisplay = orc.total > 0 ? parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : "Ver detalhes";
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${orc.nome}</strong></td>
                <td>${data}</td>
                <td style="color:#27ae60;">${totalDisplay}</td>
                <td>
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}')" style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Abrir na Loja">
                        <i class="ph ph-shopping-cart"></i> Abrir
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left:5px;" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) { console.error("Erro Orçamentos:", e); }
}

function restaurarOrcamento(itensJsonEncoded) {
    if(!confirm("Isso vai substituir o carrinho atual pelo deste orçamento. Continuar?")) return;
    window.location.href = `index.html?restore=${itensJsonEncoded}`; // Ajustei para index.html pois é lá que carrega a loja
}

async function excluirOrcamento(id) {
    if(!confirm("Tem certeza que deseja apagar este orçamento?")) return;
    try {
        const res = await fetch(`${API_URL}/orcamentos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        if(res.ok) carregarMeusOrcamentos();
    } catch(e) { alert("Erro ao excluir"); }
}


// ============================================================
// 4. DADOS BANCÁRIOS E NOTIFICAÇÕES (MANTIDOS)
// ============================================================
async function salvarDadosBancarios() {
    const dados = {
        chavePix: document.getElementById('input-pix').value,
        banco: document.getElementById('input-banco').value,
        agencia: document.getElementById('input-agencia').value,
        conta: document.getElementById('input-conta').value
    };

    try {
        const res = await fetch(`${API_URL}/afiliado/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_DADOS.token}` },
            body: JSON.stringify(dados)
        });

        if(res.ok) alert("✅ Dados salvos com sucesso!");
        else alert("Erro ao salvar dados.");

    } catch(e) { alert("Erro de conexão."); }
}

// --- NOTIFICAÇÕES ---
function iniciarNotificacoes() {
    verificarNotificacoes();
    setInterval(verificarNotificacoes, 30000); // Checa a cada 30s
}

async function verificarNotificacoes() {
    try {
        if(!AFILIADO_DADOS) return;
        
        const res = await fetch(`${API_URL}/afiliado/notificacoes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        const dados = await res.json();
        
        const total = dados.mensagens.length + dados.vendas.length;
        const badge = document.querySelector('.badge-dot'); // ID novo do HTML
        
        // Lógica visual para o novo HTML (badge-dot) ou antigo (badge)
        if(badge) {
            badge.style.display = total > 0 ? 'block' : 'none';
        } else {
            // Tenta achar pelo ID antigo caso use layout misto
            const oldBadge = document.getElementById('notif-badge');
            if(oldBadge) {
                oldBadge.style.display = total > 0 ? 'flex' : 'none';
                oldBadge.innerText = total;
            }
        }
        
        // Nota: A lista de notificações não é renderizada aqui automaticamente para não atrapalhar
        // Ela só aparece quando o usuário clica no sino (pode adicionar lógica de click aqui se quiser)

    } catch(e) { console.error("Erro notif:", e); }
}