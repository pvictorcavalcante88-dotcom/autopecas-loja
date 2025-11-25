const API_URL = '';

// Variáveis Globais para o Orçamento
let itensOrcamento = [];
let MARGEM_ATUAL = 0;
let CODIGO_AFILIADO = '';

document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;
    
    if (path.endsWith('afiliado_login.html')) {
        setupLogin();
        setupRegister();
    } else if (path.endsWith('afiliado_dashboard.html')) {
        loadDashboard();
        
        const btnLogout = document.getElementById('logout-btn');
        if(btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('afiliadoToken');
                window.location.href = 'afiliado_login.html';
            });
        }

        // Evento de Busca do Orçamento
        const inputBusca = document.getElementById('search-orcamento');
        if(inputBusca) {
            inputBusca.addEventListener('input', (e) => {
                buscarProdutosOrcamento(e.target.value);
            });
        }
        // Fechar busca se clicar fora
        document.addEventListener('click', (e) => {
            const results = document.getElementById('search-results');
            if(results && !results.contains(e.target) && e.target !== inputBusca) {
                results.style.display = 'none';
            }
        });
    }
});

/* --- LOGIN & REGISTER (MANTIDOS IGUAIS) --- */
function setupLogin() {
    const form = document.getElementById('login-form'); if(!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const telefone = document.getElementById('login-telefone').value;
        const senha = document.getElementById('login-senha').value;
        const btn = form.querySelector('button');
        btn.textContent = "Entrando..."; btn.disabled = true;
        try {
            const res = await fetch(`${API_URL}/afiliado/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ telefone, senha }) });
            const data = await res.json();
            if(!res.ok) throw new Error(data.erro);
            localStorage.setItem('afiliadoToken', data.token);
            window.location.href = 'afiliado_dashboard.html';
        } catch (err) { alert(err.message); btn.textContent = "Acessar Painel"; btn.disabled = false; }
    });
}

function setupRegister() {
    const form = document.getElementById('register-form'); if(!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { nome: document.getElementById('reg-nome').value, telefone: document.getElementById('reg-telefone').value, codigo: document.getElementById('reg-codigo').value, chavePix: document.getElementById('reg-pix').value, senha: document.getElementById('reg-senha').value };
        const btn = form.querySelector('button');
        btn.textContent = "Criando..."; btn.disabled = true;
        try {
            const res = await fetch(`${API_URL}/afiliado/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
            const data = await res.json();
            if(!res.ok) throw new Error(data.erro);
            alert("Conta criada! Aguarde aprovação."); location.reload();
        } catch (err) { alert(err.message); btn.textContent = "Cadastrar"; btn.disabled = false; }
    });
}

/* --- DASHBOARD --- */
async function loadDashboard() {
    const token = localStorage.getItem('afiliadoToken');
    if(!token) { window.location.href='afiliado_login.html'; return; }

    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, { headers: { 'Authorization': `Bearer ${token}` } });
        if(!res.ok) throw new Error("Sessão expirada");
        const data = await res.json();

        // Salva dados globais para o PDF
        MARGEM_ATUAL = data.margem || 0;
        CODIGO_AFILIADO = data.codigo;

        document.getElementById('afiliado-nome').textContent = data.nome;
        document.getElementById('afiliado-saldo').textContent = Number(data.saldo).toLocaleString('pt-BR',{style:'currency', currency:'BRL'});
        document.getElementById('afiliado-pix').textContent = data.chavePix || 'Não cadastrada';
        document.getElementById('afiliado-margem').value = MARGEM_ATUAL;

        const baseUrl = window.location.href.replace('afiliado_dashboard.html', 'index.html').split('?')[0];
        const link = `${baseUrl}?ref=${data.codigo}`;
        document.getElementById('afiliado-link').value = link;

        const tbody = document.getElementById('vendas-list');
        if(tbody) {
            if(data.pedidos.length === 0) tbody.innerHTML = '<tr><td colspan="3">Nenhuma venda ainda.</td></tr>';
            else {
                tbody.innerHTML = '';
                data.pedidos.forEach(p => {
                    tbody.innerHTML += `<tr><td>${new Date(p.createdAt).toLocaleDateString('pt-BR')}</td><td>${Number(p.valorTotal).toLocaleString('pt-BR',{style:'currency', currency:'BRL'})}</td><td style="color:green; font-weight:bold;">+ ${Number(p.comissaoGerada).toLocaleString('pt-BR',{style:'currency', currency:'BRL'})}</td></tr>`;
                });
            }
        }

    } catch (err) {
        console.error(err); alert("Erro ao carregar: " + err.message); window.location.href = 'afiliado_login.html';
    }
}

async function salvarMargem() {
    const novaMargem = document.getElementById('afiliado-margem').value;
    const token = localStorage.getItem('afiliadoToken');
    if(novaMargem < 0 || novaMargem > 30) return alert("A margem deve ser entre 0% e 30%");
    try {
        const res = await fetch(`${API_URL}/afiliado/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ novaMargem }) });
        if(!res.ok) throw new Error();
        alert("Margem atualizada! Atualize a página.");
        location.reload();
    } catch (e) { alert("Erro ao atualizar"); }
}

function copiarLink() {
    const t = document.getElementById("afiliado-link"); t.select(); t.setSelectionRange(0,99999); navigator.clipboard.writeText(t.value); alert("Link copiado!");
}

/* ========================================================================
   SISTEMA DE ORÇAMENTO
   ======================================================================== */

async function buscarProdutosOrcamento(termo) {
    const resultsDiv = document.getElementById('search-results');
    if(termo.length < 2) { resultsDiv.style.display = 'none'; return; }

    try {
        const res = await fetch(`${API_URL}/search?q=${termo}`);
        const produtos = await res.json();
        
        resultsDiv.innerHTML = '';
        if(produtos.length > 0 && !produtos.erro) {
            resultsDiv.style.display = 'block';
            produtos.forEach(p => {
                // Calcula preço com margem
                const precoComMargem = p.preco_novo * (1 + MARGEM_ATUAL/100);
                
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<span>${p.titulo}</span> <strong>${Number(precoComMargem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>`;
                div.onclick = () => adicionarAoOrcamento(p);
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.style.display = 'none';
        }
    } catch (e) { console.error(e); }
}

function adicionarAoOrcamento(produto) {
    // Verifica se já existe
    const existe = itensOrcamento.find(i => i.id === produto.id);
    if(existe) {
        existe.qtd++;
    } else {
        itensOrcamento.push({
            id: produto.id,
            titulo: produto.titulo,
            precoBase: produto.preco_novo,
            qtd: 1
        });
    }
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('search-orcamento').value = '';
    renderizarTabelaOrcamento();
}

function removerDoOrcamento(index) {
    itensOrcamento.splice(index, 1);
    renderizarTabelaOrcamento();
}

function renderizarTabelaOrcamento() {
    const tbody = document.getElementById('lista-orcamento');
    const totalEl = document.getElementById('total-orcamento');
    tbody.innerHTML = '';
    
    let totalGeral = 0;

    itensOrcamento.forEach((item, index) => {
        const precoUnitario = item.precoBase * (1 + MARGEM_ATUAL/100);
        const totalItem = precoUnitario * item.qtd;
        totalGeral += totalItem;

        tbody.innerHTML += `
            <tr>
                <td>${item.titulo}</td>
                <td><input type="number" value="${item.qtd}" min="1" style="width:50px" onchange="atualizarQtdOrcamento(${index}, this.value)"></td>
                <td>${Number(precoUnitario).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                <td>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                <td><button class="btn-danger" onclick="removerDoOrcamento(${index})">X</button></td>
            </tr>
        `;
    });

    totalEl.textContent = Number(totalGeral).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function atualizarQtdOrcamento(index, novaQtd) {
    if(novaQtd < 1) novaQtd = 1;
    itensOrcamento[index].qtd = parseInt(novaQtd);
    renderizarTabelaOrcamento();
}

/* --- GERADOR DE PDF (JSPDF) --- */
function gerarPDF() {
    if(itensOrcamento.length === 0) return alert("Adicione itens ao orçamento primeiro.");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Cabeçalho
    doc.setFontSize(20);
    doc.setTextColor(0, 95, 185);
    doc.text("AutoPeças Veloz - Orçamento", 14, 22);
    
    // 2. Dados
    const cliente = document.getElementById('cliente-nome').value || "Cliente";
    const nomeAfiliado = document.getElementById('afiliado-nome').textContent;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Cliente: ${cliente}`, 14, 32);
    doc.text(`Consultor: ${nomeAfiliado}`, 14, 38);
    doc.text(`Data: ${dataHoje}`, 14, 44);

    // 3. Tabela
    let totalFinal = 0;
    
    // Preparar dados para URL (Array simplificado: só ID e QTD)
    const itensParaLink = [];

    const tableData = itensOrcamento.map(item => {
        const unit = item.precoBase * (1 + MARGEM_ATUAL/100);
        const tot = unit * item.qtd;
        totalFinal += tot;
        
        // CORREÇÃO: Garante que ID e Quantidade são números inteiros
        itensParaLink.push({ 
            id: parseInt(item.id), 
            quantidade: parseInt(item.qtd) 
        });

        return [
            item.titulo,
            item.qtd,
            Number(unit).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
            Number(tot).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
        ];
    });

    doc.autoTable({
        head: [['Produto', 'Qtd', 'Valor Unit.', 'Total']],
        body: tableData,
        startY: 50,
        theme: 'striped',
        headStyles: { fillColor: [0, 95, 185] }
    });

    // 4. Gerar o Link Inteligente (Direto pro Checkout + Produtos)
    const finalY = doc.lastAutoTable.finalY + 10;
    
   // --- MUDANÇA: FORÇAMOS O ENDEREÇO DO SERVIDOR ---
    // Em vez de tentar adivinhar, dizemos exatamente onde o site está.
    const baseUrl = window.location.origin; 
    // ------------------------------------------------
    
    // Codifica os itens em formato JSON para caber na URL
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itensParaLink));
    
    // Monta a URL Final:
    // http://localhost:3000/checkout.html?ref=CODIGO&restore=DADOS
    const linkCompra = `${baseUrl}/checkout.html?ref=${CODIGO_AFILIADO}&restore=${dadosCarrinho}`;

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: ${Number(totalFinal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 14, finalY);

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 95, 185);
    
    // Adiciona o link no PDF
    doc.textWithLink("CLIQUE AQUI PARA PAGAR AGORA (CHECKOUT)", 14, finalY + 10, { url: linkCompra });
    
    doc.save(`Orcamento_${cliente}.pdf`);
}