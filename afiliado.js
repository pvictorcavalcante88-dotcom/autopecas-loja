/* =======================================================
   SCRIPT DO PAINEL DO AFILIADO (Corrigido)
   ======================================================= */

const API_URL = ''; // Deixe vazio se estiver no mesmo domínio
let AFILIADO_DADOS = null;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    console.log("🦊 Painel Iniciado");
    verificarLogin();
});

function verificarLogin() {
    const dados = localStorage.getItem('afiliadoLogado');
    if (!dados) {
        alert("Você precisa fazer login.");
        window.location.href = 'index.html'; 
        return;
    }
    AFILIADO_DADOS = JSON.parse(dados);
    
    // Preenche nome
    const nomeEl = document.getElementById('afiliado-nome');
    if(nomeEl) nomeEl.textContent = AFILIADO_DADOS.nome;

    // Configura Botão Sair
    const btnLogout = document.getElementById('logout-btn');
    if(btnLogout) {
        btnLogout.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('minhaMargem');
            window.location.href = 'index.html';
        };
    }

    // Carrega dados
    carregarDashboard();
    carregarMeusOrcamentos();
}

// 1. Carrega Saldo, Link e Vendas
async function carregarDashboard() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados do dashboard");

        const data = await res.json();
        
        // Atualiza Saldo
        const saldoEl = document.getElementById('afiliado-saldo');
        if(saldoEl) saldoEl.textContent = parseFloat(data.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        
        // Atualiza Margem Input
        const margemEl = document.getElementById('afiliado-margem');
        if(margemEl) margemEl.value = data.margem || 0;
        
        // Atualiza Link
        const linkEl = document.getElementById('afiliado-link');
        if(linkEl) {
            const baseUrl = window.location.origin + '/index.html';
            linkEl.value = `${baseUrl}?ref=${data.codigo}`;
        }

        // Renderiza Vendas
        renderizarVendas(data.pedidos);

    } catch (error) {
        console.error("Erro Dashboard:", error);
    }
}

function renderizarVendas(pedidos) {
    const tbody = document.getElementById('vendas-list');
    if(!tbody) return;
    
    tbody.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma venda realizada ainda.</td></tr>';
        return;
    }

    // Ordena por mais recente
    pedidos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    pedidos.forEach(p => {
        const data = new Date(p.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(p.valorTotal).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        const comissao = parseFloat(p.comissaoGerada).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${valor}</td>
            <td style="color:#27ae60; font-weight:bold;">+ ${comissao}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 2. Carrega Orçamentos Salvos
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
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Você ainda não salvou nenhum orçamento.<br><small>Vá na Loja, monte um carrinho e clique em "Salvar Orçamento".</small></td></tr>';
            return;
        }

        lista.forEach(orc => {
            const data = new Date(orc.createdAt).toLocaleDateString('pt-BR');
            const total = parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${orc.nome}</strong></td>
                <td>${data}</td>
                <td style="color:#27ae60; font-weight:bold;">${total}</td>
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

// Funções de Ação
function restaurarOrcamento(itensJsonEncoded) {
    if(!confirm("Isso vai substituir os itens atuais do seu carrinho pela lista deste orçamento. Continuar?")) return;
    
    // Redireciona para o Carrinho com os dados
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

async function salvarMargem() {
    const input = document.getElementById('afiliado-margem');
    const novaMargem = parseFloat(input.value);
    
    try {
        await fetch(`${API_URL}/afiliado/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_DADOS.token}` },
            body: JSON.stringify({ novaMargem })
        });
        localStorage.setItem('minhaMargem', novaMargem);
        alert("Margem padrão atualizada!");
    } catch (error) { alert("Erro ao salvar."); }
}

function copiarLink() {
    const input = document.getElementById('afiliado-link');
    input.select();
    document.execCommand('copy');
    alert("Link copiado!");
}