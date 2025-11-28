/* =======================================================
   SCRIPT DO PAINEL DO AFILIADO (Versão: Margem Individual)
   ======================================================= */

const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// Variáveis Globais
let ITENS_ORCAMENTO = [];
let MARGEM_PADRAO = 0; // A margem configurada no perfil (apenas como sugestão inicial)
let AFILIADO_DADOS = null;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
    carregarDashboard();
    setupBuscaOrcamento();
});

// 1. Verifica Login
function verificarLogin() {
    const dados = localStorage.getItem('afiliadoLogado');
    if (!dados) {
        alert("Você precisa fazer login.");
        window.location.href = 'login.html'; // Ajuste para sua página de login
        return;
    }
    AFILIADO_DADOS = JSON.parse(dados);
    
    document.getElementById('afiliado-nome').textContent = AFILIADO_DADOS.nome;
    
    document.getElementById('logout-btn').onclick = (e) => {
        e.preventDefault();
        localStorage.removeItem('afiliadoLogado');
        localStorage.removeItem('minhaMargem');
        window.location.href = 'login.html';
    };
}

// 2. Carrega Dashboard
async function carregarDashboard() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const data = await res.json();
        
        // Atualiza Interface
        document.getElementById('afiliado-saldo').textContent = parseFloat(data.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        document.getElementById('afiliado-pix').textContent = data.chavePix || "Chave não cadastrada";
        
        // Define a margem padrão para novos itens
        MARGEM_PADRAO = data.margem || 0;
        document.getElementById('afiliado-margem').value = MARGEM_PADRAO;
        
        // Link de Vendas (Geral)
        const baseUrl = window.location.origin + '/index.html';
        const linkCompleto = `${baseUrl}?ref=${data.codigo}`;
        document.getElementById('afiliado-link').value = linkCompleto;

        renderizarVendas(data.pedidos);

    } catch (error) {
        console.error(error);
    }
}

function renderizarVendas(pedidos) {
    const tbody = document.getElementById('vendas-list');
    tbody.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma venda realizada ainda.</td></tr>';
        return;
    }

    pedidos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    pedidos.forEach(p => {
        const data = new Date(p.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(p.valorTotal).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        const comissao = parseFloat(p.comissaoGerada).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${data}</td><td>${valor}</td><td style="color:#27ae60; font-weight:bold;">+ ${comissao}</td>`;
        tbody.appendChild(tr);
    });
}

// Atualiza a Margem Padrão (No perfil)
async function salvarMargem() {
    const novaMargem = parseFloat(document.getElementById('afiliado-margem').value);
    if (novaMargem < 0 || novaMargem > 100) return alert("Margem inválida.");

    try {
        const res = await fetch(`${API_URL}/afiliado/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_DADOS.token}` },
            body: JSON.stringify({ novaMargem })
        });

        if (res.ok) {
            MARGEM_PADRAO = novaMargem;
            localStorage.setItem('minhaMargem', novaMargem);
            alert("Margem padrão atualizada! Novos itens usarão este valor.");
        } else alert("Erro ao salvar.");
    } catch (error) { alert("Erro de conexão."); }
}

// =======================================================
// 🛒 SISTEMA DE ORÇAMENTO COM MARGEM INDIVIDUAL
// =======================================================

function setupBuscaOrcamento() {
    const input = document.getElementById('search-orcamento');
    const results = document.getElementById('search-results');
    let timeout = null;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const termo = input.value;
        if (termo.length < 2) { results.style.display = 'none'; return; }

        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/search?q=${termo}`);
                const produtos = await res.json();
                results.innerHTML = '';
                if (produtos.length > 0) {
                    results.style.display = 'block';
                    produtos.forEach(p => {
                        const div = document.createElement('div');
                        div.className = 'search-item';
                        div.innerHTML = `<span>${p.titulo}</span> <small>${parseFloat(p.preco_novo).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</small>`;
                        div.onclick = () => { adicionarAoOrcamento(p); input.value = ''; results.style.display = 'none'; };
                        results.appendChild(div);
                    });
                } else results.style.display = 'none';
            } catch (e) {}
        }, 500);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
    });
}

function adicionarAoOrcamento(produto) {
    // Verifica se já existe
    const existente = ITENS_ORCAMENTO.find(i => i.id === produto.id);
    
    if (existente) {
        existente.qtd++;
    } else {
        // AQUI ESTÁ O SEGRED: Cada item nasce com sua própria margem (a padrão atual)
        ITENS_ORCAMENTO.push({
            id: produto.id,
            nome: produto.titulo || produto.name,
            precoBase: parseFloat(produto.preco_novo || produto.price),
            qtd: 1,
            margemIndividual: parseFloat(MARGEM_PADRAO) // Copia a margem padrão para este item
        });
    }
    renderizarTabelaOrcamento();
}

function renderizarTabelaOrcamento() {
    const tbody = document.getElementById('lista-orcamento');
    const totalEl = document.getElementById('total-orcamento');
    tbody.innerHTML = '';

    let totalGeral = 0;

    ITENS_ORCAMENTO.forEach((item, index) => {
        // CÁLCULO INDIVIDUAL: Preço Base * Margem Deste Item
        const precoFinalUnitario = item.precoBase * (1 + item.margemIndividual / 100);
        const totalItem = precoFinalUnitario * item.qtd;
        totalGeral += totalItem;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>
                <button onclick="mudarQtd(${index}, -1)" style="padding:2px 6px;">-</button> 
                ${item.qtd} 
                <button onclick="mudarQtd(${index}, 1)" style="padding:2px 6px;">+</button>
            </td>
            
            <td>
                <input type="number" 
                       value="${item.margemIndividual}" 
                       onchange="atualizarMargemItem(${index}, this.value)"
                       style="width: 50px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; text-align: center;"> %
            </td>

            <td>${precoFinalUnitario.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
            <td>${totalItem.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
            <td><button onclick="removerItem(${index})" class="btn-danger">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });

    totalEl.textContent = totalGeral.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}

// Função nova para atualizar margem de um item só
function atualizarMargemItem(index, novaMargem) {
    let valor = parseFloat(novaMargem);
    if(isNaN(valor) || valor < 0) valor = 0;
    
    ITENS_ORCAMENTO[index].margemIndividual = valor;
    renderizarTabelaOrcamento(); // Recalcula tudo
}

function mudarQtd(index, delta) {
    ITENS_ORCAMENTO[index].qtd += delta;
    if (ITENS_ORCAMENTO[index].qtd <= 0) ITENS_ORCAMENTO.splice(index, 1);
    renderizarTabelaOrcamento();
}

function removerItem(index) {
    ITENS_ORCAMENTO.splice(index, 1);
    renderizarTabelaOrcamento();
}

// 5. Gerar PDF (Com preços personalizados)
function gerarPDF() {
    if (ITENS_ORCAMENTO.length === 0) return alert("Adicione itens primeiro.");
    const cliente = document.getElementById('cliente-nome').value || "Cliente";

    if (!window.jspdf) return alert("Erro: jsPDF não carregado.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFillColor(0, 95, 185); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("AutoPeças Veloz", 15, 20);
    doc.setFontSize(12);
    doc.text(`Orçamento para: ${cliente}`, 15, 30);
    doc.text(`Consultor: ${AFILIADO_DADOS.nome}`, 140, 30);

    // Tabela
    let totalValor = 0;
    
    // Monta linhas usando os preços INDIVIDUAIS
    let linhas = ITENS_ORCAMENTO.map(item => {
        const precoFinal = item.precoBase * (1 + item.margemIndividual / 100);
        const total = precoFinal * item.qtd;
        totalValor += total;
        
        return [
            item.nome,
            item.qtd,
            precoFinal.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}),
            total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})
        ];
    });

    linhas.push(["", "", "TOTAL", totalValor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})]);

    doc.autoTable({
        head: [['Produto', 'Qtd', 'Preço Unit.', 'Total']],
        body: linhas,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [0, 95, 185] }
    });

    // --- ATENÇÃO SOBRE O LINK ---
    // O Checkout online usa a margem GLOBAL do seu perfil.
    // Como você personalizou preços individuais neste PDF, o link de pagamento 
    // pode dar uma pequena diferença se o cliente clicar (pois vai aplicar sua margem global em tudo).
    // O PDF, entretanto, está EXATO conforme você configurou.
    
    const finalY = doc.lastAutoTable.finalY + 20;
    
    const dadosParaRestaurar = ITENS_ORCAMENTO.map(i => ({id: i.id, quantidade: i.qtd}));
    const jsonRestore = encodeURIComponent(JSON.stringify(dadosParaRestaurar));
    
    const baseUrl = window.location.origin + '/checkout.html'; 
    const linkPagamento = `${baseUrl}?restore=${jsonRestore}&ref=${AFILIADO_DADOS.codigo}`;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text("Para pagar online com cartão ou pix, clique abaixo:", 15, finalY);
    
    doc.setTextColor(0, 0, 255);
    doc.setFontSize(11);
    doc.textWithLink("LINK DE PAGAMENTO SEGURO", 15, finalY + 7, { url: linkPagamento });
    
    // Aviso de validade
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text("* Este orçamento possui valores promocionais exclusivos para este documento.", 15, finalY + 15);

    doc.save(`Orcamento_${cliente}.pdf`);
}

function copiarLink() {
    const input = document.getElementById('afiliado-link');
    input.select();
    document.execCommand('copy');
    alert("Link copiado!");
}