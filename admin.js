const API_URL = '';

document.addEventListener("DOMContentLoaded", () => {
    // Verifica Login
    const token = localStorage.getItem('adminToken');
    if (!token && !window.location.pathname.includes('admin_login.html')) {
        window.location.href = 'admin_login.html';
        return;
    }

    // Logout
    const btnLogout = document.getElementById('logout-button');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
        });
    }

    // Roteamento das páginas
    const path = window.location.pathname;
    if (path.endsWith('admin_dashboard.html') || path.endsWith('/admin/')) {
        carregarDashboard();
    } else if (path.endsWith('admin_produtos.html')) {
        carregarProdutos();
        setupFormProduto(); // Configura o botão de salvar
    } else if (path.endsWith('admin_pedidos.html')) {
        carregarPedidos();
    } else if (path.endsWith('admin_afiliados.html')) {
        carregarAfiliados();
    }

    // Login Form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;
            try {
                const res = await fetch(`${API_URL}/admin/login`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('adminToken', data.token);
                    window.location.href = 'admin_dashboard.html';
                } else { alert("Login inválido"); }
            } catch (e) { alert("Erro de conexão"); }
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