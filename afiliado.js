/* =======================================================
   SCRIPT DO PAINEL DO AFILIADO (Versão: Financeiro + Mensagens)
   ======================================================= */

const API_URL = ''; // Deixe vazio se estiver no mesmo domínio
let AFILIADO_DADOS = null;

document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
});

function verificarLogin() {
    const dados = localStorage.getItem('afiliadoLogado');
    if (!dados) {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'index.html'; 
        return;
    }
    AFILIADO_DADOS = JSON.parse(dados);
    
    // Preenche o nome no topo
    const nomeEl = document.getElementById('afiliado-nome');
    if(nomeEl) nomeEl.textContent = AFILIADO_DADOS.nome;
    
    // Configura o botão de Sair
    const btnLogout = document.getElementById('logout-btn');
    if(btnLogout) {
        btnLogout.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('minhaMargem');
            window.location.href = 'index.html';
        };
    }

    // Carrega todas as seções
    carregarDashboard();
    carregarMeusOrcamentos();
    carregarMensagens(); 
}

// 1. Carrega Saldo e Dados Bancários
async function carregarDashboard() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const data = await res.json();
        
        // Atualiza Saldo
        const saldoEl = document.getElementById('afiliado-saldo');
        if(saldoEl) saldoEl.textContent = parseFloat(data.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        
        // Preenche Dados Bancários (se já tiver salvo)
        if(data.chavePix) document.getElementById('input-pix').value = data.chavePix;
        if(data.banco) document.getElementById('input-banco').value = data.banco;
        if(data.agencia) document.getElementById('input-agencia').value = data.agencia;
        if(data.conta) document.getElementById('input-conta').value = data.conta;

        // Renderiza Vendas
        renderizarVendas(data.pedidos);

    } catch (error) {
        console.error("Erro Dashboard:", error);
    }
}

// 2. Salvar Dados Bancários
async function salvarDadosBancarios() {
    const dados = {
        chavePix: document.getElementById('input-pix').value,
        banco: document.getElementById('input-banco').value,
        agencia: document.getElementById('input-agencia').value,
        conta: document.getElementById('input-conta').value
    };

    try {
        const btn = document.querySelector('.btn-save');
        const textoOriginal = btn.textContent;
        btn.textContent = "Salvando...";
        btn.disabled = true;

        const res = await fetch(`${API_URL}/afiliado/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_DADOS.token}` },
            body: JSON.stringify(dados)
        });

        if(res.ok) {
            alert("✅ Dados salvos com sucesso!");
        } else {
            alert("Erro ao salvar dados.");
        }
        
        btn.textContent = textoOriginal;
        btn.disabled = false;

    } catch(e) { 
        alert("Erro de conexão."); 
    }
}

// 3. Carregar Mensagens do Admin
async function carregarMensagens() {
    try {
        const res = await fetch(`${API_URL}/afiliado/mensagens`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        const msgs = await res.json();
        const box = document.getElementById('lista-mensagens');
        
        if(msgs.length > 0) {
            box.innerHTML = '';
            msgs.forEach(m => {
                const data = new Date(m.createdAt).toLocaleDateString('pt-BR');
                box.innerHTML += `
                                <div class="msg-item">
                                <span class="msg-date">${data}</span>
                                <div class="msg-text">
                                    ${m.texto}
                                    ${m.arquivo ? `<br><a href="${API_URL}/${m.arquivo}" target="_blank" style="color:#3498db; font-weight:bold; display:inline-flex; align-items:center; gap:5px; margin-top:5px;"><i class="ph ph-file-pdf"></i> Ver Anexo</a>` : ''}
                                </div>
                </div>`;
            });
        } else {
            box.innerHTML = '<div class="empty-msg">Nenhuma mensagem nova.</div>';
        }
    } catch(e) { console.error("Erro msg:", e); }
}

// 4. Renderizar Tabela de Vendas
function renderizarVendas(pedidos) {
    const tbody = document.getElementById('vendas-list');
    if(!tbody) return;

    tbody.innerHTML = '';
    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px;">Nenhuma venda realizada.</td></tr>';
        return;
    }
    
    pedidos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    pedidos.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td>${parseFloat(p.valorTotal).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                        <td style="color:#27ae60; font-weight:bold;">+ ${parseFloat(p.comissaoGerada).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>`;
        tbody.appendChild(tr);
    });
}

// 5. Carregar Orçamentos Salvos
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
            // Como salvamos total=0 na versão automática, aqui tentamos calcular ou mostramos "Ver Detalhes"
            // Se você quiser mostrar o total real, precisaria salvar o total calculado no backend.
            const totalDisplay = orc.total > 0 ? parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : "Sob Consulta";
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${orc.nome}</strong></td>
                <td>${data}</td>
                <td style="color:#27ae60;">${totalDisplay}</td>
                <td>
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}')" class="btn-action btn-blue" title="Abrir na Loja">
                        <i class="ph ph-shopping-cart"></i> Abrir
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" class="btn-action btn-red" title="Excluir">
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
    window.location.href = `cart.html?restore=${itensJsonEncoded}`;
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

// --- LÓGICA DE NOTIFICAÇÕES ---

function iniciarNotificacoes() {
    verificarNotificacoes();
    // Verifica de novo a cada 30 segundos
    setInterval(verificarNotificacoes, 30000);
}

async function verificarNotificacoes() {
    try {
        if(!AFILIADO_DADOS) return; // Se não estiver logado, para.
        
        const res = await fetch(`${API_URL}/afiliado/notificacoes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });
        const dados = await res.json();
        
        const total = dados.mensagens.length + dados.vendas.length;
        const badge = document.getElementById('notif-badge');
        const lista = document.getElementById('notif-list');
        
        // Atualiza a bolinha vermelha
        if(total > 0) {
            badge.style.display = 'flex';
            badge.innerText = total > 9 ? '9+' : total;
        } else {
            badge.style.display = 'none';
        }

        // Monta a lista
        lista.innerHTML = '';
        
        if(total === 0) {
            lista.innerHTML = '<div style="padding:15px; text-align:center; color:#999;">Nada novo por aqui. 💤</div>';
            return;
        }

        // Adiciona Vendas
        dados.vendas.forEach(v => {
            lista.innerHTML += `
                <div class="notif-item notif-sale">
                    <i class="ph ph-currency-circle-dollar" style="font-size:1.2rem;"></i>
                    <div>
                        <strong>Venda Realizada!</strong><br>
                        Pedido #${v.id} gerou comissão.<br>
                        <small style="color:#aaa;">Agora mesmo</small>
                    </div>
                </div>`;
        });

        // Adiciona Mensagens
        dados.mensagens.forEach(m => {
            lista.innerHTML += `
                <div class="notif-item notif-msg">
                    <i class="ph ph-chat-centered-text" style="font-size:1.2rem;"></i>
                    <div>
                        <strong>Nova Mensagem do Admin</strong><br>
                        "${m.texto.substring(0, 30)}..."<br>
                        <small style="color:#aaa;">Veja no painel</small>
                    </div>
                </div>`;
        });

    } catch(e) { console.error("Erro notif:", e); }
}

async function abrirNotificacoes() {
    const dropdown = document.getElementById('notif-dropdown');
    const badge = document.getElementById('notif-badge');
    
    // Se estiver fechado, abre e marca como lido
    if (dropdown.style.display !== 'block') {
        dropdown.style.display = 'block';
        
        // Limpa no servidor
        if(badge.style.display !== 'none') {
            await fetch(`${API_URL}/afiliado/notificacoes/ler`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
            });
            badge.style.display = 'none'; // Some a bolinha na hora
        }
    } else {
        dropdown.style.display = 'none';
    }
}

// Fecha o dropdown se clicar fora
window.addEventListener('click', (e) => {
    const container = document.querySelector('.notification-container');
    const dropdown = document.getElementById('notif-dropdown');
    if (container && !container.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// INICIA TUDO
document.addEventListener('DOMContentLoaded', () => {
    // ... suas outras inits ...
    iniciarNotificacoes();
});