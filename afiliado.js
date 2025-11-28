/* =======================================================
   SCRIPT DO PAINEL DO AFILIADO
   ======================================================= */

const API_URL = ''; // Deixe vazio se estiver no mesmo domínio
let ITENS_ORCAMENTO = [];
let AFILIADO_DADOS = null;

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
    carregarDashboard();
    setupBuscaOrcamento();
});

// 1. Verifica se está logado
function verificarLogin() {
    const dados = localStorage.getItem('afiliadoLogado');
    if (!dados) {
        alert("Você precisa fazer login.");
        window.location.href = 'login.html';
        return;
    }
    AFILIADO_DADOS = JSON.parse(dados);
    
    // Preenche nome e link básico
    document.getElementById('afiliado-nome').textContent = AFILIADO_DADOS.nome;
    document.getElementById('afiliado-pix').textContent = "Carregando...";
    
    // Configura botão de sair
    document.getElementById('logout-btn').onclick = (e) => {
        e.preventDefault();
        localStorage.removeItem('afiliadoLogado');
        localStorage.removeItem('minhaMargem');
        window.location.href = 'login.html';
    };
}

// 2. Carrega Dados do Dashboard (API)
async function carregarDashboard() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_DADOS.token}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const data = await res.json(); // Retorna { afiliado, pedidos }
        
        // Atualiza Interface
        document.getElementById('afiliado-saldo').textContent = parseFloat(data.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        document.getElementById('afiliado-pix').textContent = data.chavePix || "Chave não cadastrada";
        document.getElementById('afiliado-margem').value = data.margem || 0;
        
        // Atualiza Link de Vendas
        const baseUrl = window.location.origin + '/index.html'; // Ajuste se seu index estiver em outra pasta
        const linkCompleto = `${baseUrl}?ref=${data.codigo}`;
        document.getElementById('afiliado-link').value = linkCompleto;

        // Renderiza Tabela de Vendas
        renderizarVendas(data.pedidos);

    } catch (error) {
        console.error(error);
        alert("Erro de conexão com o servidor.");
    }
}

// 3. Renderiza Tabela de Vendas (Histórico)
function renderizarVendas(pedidos) {
    const tbody = document.getElementById('vendas-list');
    tbody.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma venda realizada ainda.</td></tr>';
        return;
    }

    // Ordena por data (mais recente primeiro)
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

// 4. Salvar Margem de Lucro
async function salvarMargem() {
    const novaMargem = parseFloat(document.getElementById('afiliado-margem').value);
    
    if (novaMargem < 0 || novaMargem > 30) {
        return alert("A margem deve ser entre 0% e 30%.");
    }

    try {
        const res = await fetch(`${API_URL}/afiliado/config`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AFILIADO_DADOS.token}`
            },
            body: JSON.stringify({ novaMargem })
        });

        if (res.ok) {
            alert("Margem atualizada com sucesso!");
            localStorage.setItem('minhaMargem', novaMargem); // Atualiza local também
        } else {
            alert("Erro ao salvar.");
        }
    } catch (error) {
        alert("Erro de conexão.");
    }
}

// =======================================================
// 🛒 SISTEMA DE ORÇAMENTO (BUSCA E CÁLCULO)
// =======================================================

function setupBuscaOrcamento() {
    const input = document.getElementById('search-orcamento');
    const results = document.getElementById('search-results');
    let timeout = null;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const termo = input.value;
        
        if (termo.length < 2) {
            results.style.display = 'none';
            return;
        }

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
                        
                        div.onclick = () => {
                            adicionarAoOrcamento(p);
                            input.value = '';
                            results.style.display = 'none';
                        };
                        results.appendChild(div);
                    });
                } else {
                    results.style.display = 'none';
                }
            } catch (e) {}
        }, 500); // Espera 500ms para buscar
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.style.display = 'none';
        }
    });
}

function adicionarAoOrcamento(produto) {
    const margemInput = parseFloat(document.getElementById('afiliado-margem').value) || 0;
    const fator = 1 + (margemInput / 100);

    const precoBase = parseFloat(produto.preco_novo);
    const precoFinal = precoBase * fator;

    // Verifica se já existe
    const existente = ITENS_ORCAMENTO.find(i => i.id === produto.id);
    if (existente) {
        existente.qtd++;
        existente.total = existente.qtd * existente.unitario;
    } else {
        ITENS_ORCAMENTO.push({
            id: produto.id,
            nome: produto.titulo,
            qtd: 1,
            unitario: precoFinal,
            total: precoFinal
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
        totalGeral += item.total;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>
                <button onclick="mudarQtd(${index}, -1)" style="padding:2px 6px;">-</button> 
                ${item.qtd} 
                <button onclick="mudarQtd(${index}, 1)" style="padding:2px 6px;">+</button>
            </td>
            <td>${item.unitario.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
            <td>${item.total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
            <td><button onclick="removerItem(${index})" class="btn-danger">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });

    totalEl.textContent = totalGeral.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}

function mudarQtd(index, delta) {
    const item = ITENS_ORCAMENTO[index];
    item.qtd += delta;
    if (item.qtd <= 0) {
        ITENS_ORCAMENTO.splice(index, 1);
    } else {
        item.total = item.qtd * item.unitario;
    }
    renderizarTabelaOrcamento();
}

function removerItem(index) {
    ITENS_ORCAMENTO.splice(index, 1);
    renderizarTabelaOrcamento();
}

// 5. Gerar PDF com Link de Pagamento
function gerarPDF() {
    if (ITENS_ORCAMENTO.length === 0) return alert("Adicione itens ao orçamento primeiro.");
    const cliente = document.getElementById('cliente-nome').value || "Cliente";

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFillColor(0, 95, 185); // Azul
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("AutoPeças Veloz", 15, 20);
    doc.setFontSize(12);
    doc.text(`Orçamento para: ${cliente}`, 15, 30);
    doc.text(`Consultor: ${AFILIADO_DADOS.nome}`, 140, 30);

    // Tabela
    let linhas = ITENS_ORCAMENTO.map(item => [
        item.nome,
        item.qtd,
        item.unitario.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}),
        item.total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})
    ]);

    // Total
    const totalValor = ITENS_ORCAMENTO.reduce((acc, i) => acc + i.total, 0);
    linhas.push(["", "", "TOTAL", totalValor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})]);

    doc.autoTable({
        head: [['Produto', 'Qtd', 'Preço Unit.', 'Total']],
        body: linhas,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [0, 95, 185] }
    });

    // Link de Pagamento
    const finalY = doc.lastAutoTable.finalY + 20;
    
    // Monta o link mágico (Checkout + Restore + Ref)
    // Precisamos apenas do ID e QTD para restaurar, não precisa do preço (o site recalcula na hora com o ref)
    const dadosParaRestaurar = ITENS_ORCAMENTO.map(i => ({id: i.id, quantidade: i.qtd}));
    const jsonRestore = encodeURIComponent(JSON.stringify(dadosParaRestaurar));
    
    const baseUrl = window.location.origin + '/checkout.html'; // Ajuste se necessário
    const linkPagamento = `${baseUrl}?restore=${jsonRestore}&ref=${AFILIADO_DADOS.codigo}`;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Clique abaixo para finalizar seu pedido com segurança:", 15, finalY);
    
    doc.setTextColor(0, 0, 255);
    doc.setFontSize(11);
    doc.textWithLink("CLIQUE AQUI PARA PAGAR", 15, finalY + 10, { url: linkPagamento });

    doc.save(`Orcamento_${cliente}.pdf`);
}

function copiarLink() {
    const input = document.getElementById('afiliado-link');
    input.select();
    document.execCommand('copy');
    alert("Link copiado!");
}

// Função Extra de Filtragem (Se adicionar os inputs no HTML)
function filtrarVendas() {
    const termo = document.getElementById('filtro-cliente').value.toLowerCase();
    const data = document.getElementById('filtro-data').value; // Formato YYYY-MM-DD
    
    const linhas = document.querySelectorAll('#vendas-list tr');
    
    linhas.forEach(linha => {
        // Pega o texto da linha (Data está na coluna 0, mas cliente não está na tabela simples,
        // se quiser filtrar por cliente, precisa mandar o nome do cliente na renderização da tabela no passo 3)
        const textoLinha = linha.innerText.toLowerCase();
        
        let mostrar = true;
        
        // Verifica Cliente (se tiver nome na tabela)
        if(termo && !textoLinha.includes(termo)) mostrar = false;
        
        // Verifica Data (Data na tabela é DD/MM/YYYY, input é YYYY-MM-DD)
        if(data) {
            // Converte input YYYY-MM-DD para DD/MM/YYYY para comparar simples
            const [ano, mes, dia] = data.split('-');
            const dataFmt = `${dia}/${mes}/${ano}`;
            if(!textoLinha.includes(dataFmt)) mostrar = false;
        }

        linha.style.display = mostrar ? '' : 'none';
    });
}