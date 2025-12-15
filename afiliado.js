const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
});

let AFILIADO_TOKEN = null;

function verificarLogin() {
    // Tenta pegar o login do jeito antigo (JSON completo)
    const dadosAntigos = localStorage.getItem('afiliadoLogado');
    
    // Tenta pegar do jeito novo (Só o token)
    const tokenSimples = localStorage.getItem('afiliadoToken');

    if (dadosAntigos) {
        // Se achou o JSON (Seu caso no print)
        const dados = JSON.parse(dadosAntigos);
        AFILIADO_TOKEN = dados.token;
    } else if (tokenSimples) {
        // Se achou só o token
        AFILIADO_TOKEN = tokenSimples;
    } else {
        // Se não achou nada, manda pro login
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'index.html'; // Ou afiliado_login.html
        return;
    }

    // Configura Botão Sair
    const btnSair = document.getElementById('logout-btn') || document.querySelector('.btn-sair') || document.querySelector('a[href="#sair"]');
    if(btnSair) {
        btnSair.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('afiliadoToken');
            window.location.href = 'index.html';
        }
    }

    // Carrega os dados
    carregarDashboardCompleto();
}

// ============================================================
// 1. CARREGAR DADOS DO DASHBOARD
// ============================================================
async function carregarDashboardCompleto() {
    try {
        // Busca os dados no servidor
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        if (!res.ok) {
            if(res.status === 404) throw new Error("Rota /afiliado/dashboard não encontrada no servidor!");
            throw new Error("Erro ao buscar dados");
        }

        const dados = await res.json();

        // --- PREENCHE O HTML NOVO (IDs do seu print 5) ---

        // 1. Nome do Parceiro
        // Procura pelo ID novo 'nome-afiliado' ou antigo 'afiliado-nome'
        const elNome = document.getElementById('nome-afiliado') || document.querySelector('.welcome h1') || document.getElementById('afiliado-nome');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        // 2. Saldo
        const elSaldo = document.getElementById('saldo-total') || document.getElementById('afiliado-saldo');
        if(elSaldo) elSaldo.innerText = parseFloat(dados.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        // 3. Vendas Aprovadas (Contador)
        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            const aprovadas = dados.vendas.filter(v => v.status === 'APROVADO').length;
            elQtd.innerText = aprovadas;
        }

        // 4. Link de Divulgação
        const elLink = document.getElementById('link-afiliado');
        if(elLink) {
            if(dados.codigo) {
                // Monta o link: site.com/index.html?ref=CODIGO
                elLink.value = `${window.location.origin}/index.html?ref=${dados.codigo}`;
            } else {
                elLink.value = "Código não encontrado";
            }
        }

        // 5. Tabelas
        renderizarTabela(dados.vendas);

        // 6. Dados Bancários (se existirem na tela)
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';

    } catch (error) {
        console.error("Erro Fatal:", error);
        // Mostra o erro na tela para ajudar a debugar
        const header = document.querySelector('header');
        if(header) {
            const aviso = document.createElement('div');
            aviso.style.background = 'red';
            aviso.style.color = 'white';
            aviso.style.padding = '10px';
            aviso.style.textAlign = 'center';
            aviso.innerText = `Erro: ${error.message}. Verifique se adicionou a rota no server.js!`;
            header.insertAdjacentElement('afterend', aviso);
        }
    }
}

// ============================================================
// AUXILIAR: DESENHAR TABELA
// ============================================================
function renderizarTabela(vendas) {
    // Tenta achar qualquer ID de tabela que você possa estar usando
    const tbody = document.getElementById('lista-ultimas-vendas') || document.getElementById('vendas-list') || document.querySelector('tbody');
    
    if(!tbody) return;
    tbody.innerHTML = '';

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma venda encontrada.</td></tr>';
        return;
    }

    vendas.forEach(v => {
        const data = new Date(v.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        const comissao = parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        // Status Colorido
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${valor}</td>
            <td><span style="color:#27ae60; font-weight:bold;">+ ${comissao}</span></td>
            <td><span style="padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${statusStyle}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Navegação de Abas (Se tiver)
function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    
    const tab = document.getElementById(abaId);
    if(tab) tab.classList.add('active');
    
    const nav = document.getElementById('nav-' + abaId);
    if(nav) nav.classList.add('active');
}