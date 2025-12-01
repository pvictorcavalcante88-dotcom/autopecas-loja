const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Verifica se já tem Token (Se não tiver, chuta pro login)
    const token = localStorage.getItem('adminToken');
    const isLoginPage = window.location.pathname.includes('admin_login.html');

    if (!token && !isLoginPage) {
        window.location.href = 'admin_login.html';
        return;
    }

    // 2. Configura o botão de Logout
    const btnLogout = document.getElementById('logout-button'); // Verifique se o ID no HTML é esse mesmo
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if(confirm("Tem certeza que deseja sair?")) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
            }
        });
    }

    // 3. Roteamento (Carrega as funções de cada página)
    const path = window.location.pathname;
    
    if (path.includes('admin_dashboard.html') || path.endsWith('/admin/')) {
        if(typeof carregarDashboard === 'function') carregarDashboard();
    } 
    else if (path.includes('admin_produtos.html')) {
        if(typeof carregarProdutos === 'function') carregarProdutos();
        if(typeof setupFormProduto === 'function') setupFormProduto(); 
    } 
    else if (path.includes('admin_pedidos.html')) {
        if(typeof carregarPedidos === 'function') carregarPedidos();
    } 
    else if (path.includes('admin_afiliados.html')) {
        if(typeof carregarAfiliados === 'function') carregarAfiliados();
    }

    // 4. LÓGICA DO LOGIN (AQUI ESTAVA O ERRO)
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            console.log("Tentando logar com:", email, senha);

            try {
                // CORREÇÃO: A rota no server.js é '/login', não '/admin/login'
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });

                const data = await res.json();

                if (res.ok) {
                    console.log("Login Sucesso! Token:", data.token);
                    localStorage.setItem('adminToken', data.token);
                    
                    // IMPORTANTE: Verifique se o nome do seu arquivo principal é esse mesmo
                    window.location.href = 'admin_dashboard.html'; 
                } else { 
                    alert("Erro: " + (data.erro || "Login inválido")); 
                }
            } catch (e) { 
                console.error(e);
                alert("Erro de conexão com o servidor."); 
            }
        });
    }
});

// =======================================================
// PRODUTOS (LISTAR, EDITAR, SALVAR)
// =======================================================
async function carregarProdutos() {
    const tbody = document.getElementById('produtos-list');
    const token = localStorage.getItem('adminToken');
    
    try {
        const res = await fetch(`${API_URL}/admin/produtos`, { headers: { 'Authorization': `Bearer ${token}` } });
        const produtos = await res.json();
        
        tbody.innerHTML = '';
        produtos.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${p.id}</td>
                    <td>${p.titulo}</td>
                    <td>R$ ${p.preco_novo.toFixed(2)}</td>
                    <td style="color: ${p.estoque < 5 ? 'red' : 'green'}; font-weight:bold;">${p.estoque}</td>
                    <td>
                        <button onclick="editarProduto(${p.id})" style="cursor:pointer; padding:5px;">✏️ Editar</button>
                        <button onclick="deletarProduto(${p.id})" style="cursor:pointer; padding:5px; color:red;">🗑️ Excluir</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) { tbody.innerHTML = 'Erro ao carregar produtos.'; }
}

// ABRIR MODAL PARA EDITAR
async function editarProduto(id) {
    const token = localStorage.getItem('adminToken');
    try {
        // Busca os dados do produto
        const res = await fetch(`${API_URL}/admin/produtos/${id}`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if(!res.ok) throw new Error("Erro ao buscar");
        const p = await res.json();

        // Preenche o formulário
        document.getElementById('edit-id').value = p.id;
        document.getElementById('edit-titulo').value = p.titulo;
        document.getElementById('edit-preco').value = p.preco_novo;
        document.getElementById('edit-estoque').value = p.estoque;
        document.getElementById('edit-imagem').value = p.imagem || '';
        document.getElementById('edit-categoria').value = p.categoria || '';
        document.getElementById('edit-referencia').value = p.referencia || '';

        // Abre o modal
        document.getElementById('modal-title').textContent = "Editar Produto #" + p.id;
        document.getElementById('modal-produto').classList.add('active');

    } catch (e) {
        alert("Erro ao buscar produto: " + e.message);
    }
}

// ABRIR MODAL PARA CRIAR NOVO
function abrirModalCriar() {
    // Limpa o formulário
    document.getElementById('form-produto').reset();
    document.getElementById('edit-id').value = ''; // ID vazio = criar novo
    
    document.getElementById('modal-title').textContent = "Novo Produto";
    document.getElementById('modal-produto').classList.add('active');
}

function fecharModal() {
    document.getElementById('modal-produto').classList.remove('active');
}

// SALVAR (CRIAR OU EDITAR)
function setupFormProduto() {
    const form = document.getElementById('form-produto');
    if(!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('adminToken');
        
        const id = document.getElementById('edit-id').value;
        const dados = {
            titulo: document.getElementById('edit-titulo').value,
            preco_novo: parseFloat(document.getElementById('edit-preco').value),
            estoque: parseInt(document.getElementById('edit-estoque').value),
            imagem: document.getElementById('edit-imagem').value,
            categoria: document.getElementById('edit-categoria').value,
            referencia: document.getElementById('edit-referencia').value
        };

        try {
            let url = `${API_URL}/admin/produtos`;
            let method = 'POST';

            // Se tem ID, é Edição (PUT)
            if(id) {
                url += `/${id}`;
                method = 'PUT';
            }

            const res = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dados)
            });

            if(res.ok) {
                alert("Produto salvo com sucesso!");
                fecharModal();
                carregarProdutos(); // Recarrega a lista
            } else {
                alert("Erro ao salvar.");
            }
        } catch(e) { alert("Erro no servidor."); }
    });
}

async function deletarProduto(id) {
    if(!confirm("Tem certeza que deseja excluir?")) return;
    const token = localStorage.getItem('adminToken');
    try {
        await fetch(`${API_URL}/admin/produtos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        carregarProdutos();
    } catch(e) { alert("Erro ao deletar"); }
}

// =======================================================
// OUTRAS FUNÇÕES (AFILIADOS, PEDIDOS...)
// =======================================================

// Afiliados
async function carregarAfiliados() {
    const token = localStorage.getItem('adminToken');
    const tbody = document.getElementById('afiliados-list');
    if(!tbody) return;

    try {
        const response = await fetch(`${API_URL}/admin/afiliados`, { headers: { 'Authorization': `Bearer ${token}` } });
        const afiliados = await response.json();
        if (afiliados.length === 0) { tbody.innerHTML = '<tr><td colspan="6">Nenhum afiliado.</td></tr>'; return; }
        tbody.innerHTML = '';
        afiliados.forEach(af => {
            const totalVendido = af.pedidos ? af.pedidos.reduce((a, p) => a + p.valorTotal, 0) : 0;
            let btn = !af.aprovado ? `<button onclick="acaoAfiliado(${af.id}, 'aprovar')">Aprovar</button>` : 
                      (af.saldo > 0 ? `<button onclick="acaoAfiliado(${af.id}, 'pagar')">Marcar Pago</button>` : '-');
            
            tbody.innerHTML += `<tr><td>${af.nome}</td><td>${af.codigo}</td><td>${af.aprovado?'Ativo':'Pendente'}</td><td>R$ ${totalVendido}</td><td>R$ ${af.saldo}</td><td>${btn}</td></tr>`;
        });
    } catch (e) {}
}
async function acaoAfiliado(id, acao) {
    const token = localStorage.getItem('adminToken');
    await fetch(`${API_URL}/admin/afiliados/${id}/${acao}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
    carregarAfiliados();
}

// Pedidos
async function carregarPedidos() {
    const token = localStorage.getItem('adminToken');
    const tbody = document.getElementById('pedidos-list');
    try {
        const res = await fetch(`${API_URL}/admin/pedidos`, { headers: { 'Authorization': `Bearer ${token}` } });
        const pedidos = await res.json();
        tbody.innerHTML = '';
        pedidos.forEach(p => {
            tbody.innerHTML += `<tr><td>#${p.id}</td><td>${p.clienteNome}</td><td>R$ ${p.valorTotal}</td><td>${new Date(p.createdAt).toLocaleDateString()}</td></tr>`;
        });
    } catch(e){}
}

// Dashboard
async function carregarDashboard() {
    const token = localStorage.getItem('adminToken');
    
    try {
        const res = await fetch(`${API_URL}/admin/stats`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (!res.ok) throw new Error("Erro ao buscar dados");
        
        const data = await res.json();

        // 1. Preenche os Cards (Números Grandes)
        if(document.getElementById('total-vendas')) 
            document.getElementById('total-vendas').innerText = Number(data.totalVendas).toLocaleString('pt-BR',{style:'currency', currency:'BRL'});
        
        if(document.getElementById('total-pedidos')) 
            document.getElementById('total-pedidos').innerText = data.totalPedidos;
        
        if(document.getElementById('total-produtos')) 
            document.getElementById('total-produtos').innerText = data.totalProdutos;

        if(document.getElementById('estoque-baixo')) 
            document.getElementById('estoque-baixo').innerText = data.estoqueBaixo || 0;

        // 2. Preenche a Tabela de Últimos Pedidos
        const tbody = document.getElementById('ultimos-pedidos-list');
        if (tbody && data.ultimosPedidos) {
            if (data.ultimosPedidos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">Nenhum pedido recente.</td></tr>';
            } else {
                tbody.innerHTML = '';
                data.ultimosPedidos.forEach(p => {
                    tbody.innerHTML += `
                        <tr>
                            <td>#${p.id}</td>
                            <td>${p.clienteNome}</td>
                            <td>${Number(p.valorTotal).toLocaleString('pt-BR',{style:'currency', currency:'BRL'})}</td>
                            <td>${new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                        </tr>
                    `;
                });
            }
        }

    } catch(e) {
        console.error("Erro Dashboard:", e);
        // Se der erro, mostra aviso na tela
        if(document.getElementById('total-vendas')) 
            document.getElementById('total-vendas').innerText = "Erro";
    }
}