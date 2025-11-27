/* ==============================================================
   🚀 SCRIPT GERAL DO SITE (Versão Final: PDF + Link de Pagamento)
   ============================================================== */

// CONFIGURAÇÕES GLOBAIS
const API_URL = ''; // Vazio = usa o mesmo domínio
let FATOR_PRECO = 1.0; // Padrão

// --- FUNÇÕES UTILITÁRIAS ---
function formatarMoeda(valorBase) {
    if (valorBase == null || isNaN(valorBase)) return 'R$ 0,00';
    const valorFinal = valorBase * FATOR_PRECO;
    return Number(valorFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
}

// ==============================================================
// 🏁 INICIALIZAÇÃO (QUANDO A PÁGINA CARREGA)
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🚀 Script Iniciado");

    // 1. MODO PARCEIRO (Se for o Vendedor Logado)
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_PRECO = 1 + (margemSalva / 100);
        console.log(`🦊 Parceiro Logado: ${afiliadoLogado.nome} (+${margemSalva}%)`);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        // 2. MODO CLIENTE (Verifica se veio por link de afiliado)
        const paramsURL = new URLSearchParams(window.location.search);
        // Tenta pegar o código da URL ou do que já ficou salvo antes
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');

        if (refCode) {
            // Salva para não perder se ele atualizar a página
            localStorage.setItem('afiliadoCodigo', refCode);
            // BUSCA A MARGEM NO SERVIDOR ANTES DE CONTINUAR
            await carregarMargemDoCodigo(refCode);
        }
    }

    // 3. RECUPERAÇÃO DE CARRINHO VIA LINK (PDF)
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) {
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            }
            // Limpa a URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
    }

    // 4. INICIALIZAÇÃO DAS PÁGINAS (Agora já com o preço certo!)
    atualizarIconeCarrinho();
    const path = window.location.pathname;

    if (path.includes('checkout.html')) {
        await carregarPaginaCheckout();
    } 
    else if (path.includes('cart.html')) {
        carregarPaginaCarrinho();
    }
    else if (path.includes('product.html')) {
        setupProductPage();
    }
    else if (path.includes('busca.html') || path.includes('search')) {
        setupSearchPage();
    }

    setupGlobalSearch();
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


/* ==============================================================
   🛒 LÓGICA DO CARRINHO (CART.HTML)
   ============================================================== */
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    if (!cartItemsContainer) return;

    let cart = getCarrinho();
    cartItemsContainer.innerHTML = ''; 

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Seu carrinho está vazio.</td></tr>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        return;
    }

    let total = 0;

    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();

            const nome = p.name || p.titulo;
            const precoBase = parseFloat(p.price || p.preco_novo);
            const imagem = p.image || p.imagem;
            const qtd = item.quantidade || item.quantity || 1; 

            const precoFinal = precoBase * FATOR_PRECO;
            const subtotal = precoFinal * qtd;
            total += subtotal;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><img src="${imagem}" width="60" style="border-radius:4px;"></td>
                <td>${nome}</td>
                <td>${Number(precoFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
                        <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                        <strong>${qtd}</strong>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td>${Number(subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td><button onclick="removerItem(${item.id})" style="color:red; border:none; cursor:pointer;">&times;</button></td>
            `;
            cartItemsContainer.appendChild(row);
        } catch (e) {}
    }
    if (cartTotalElement) cartTotalElement.innerText = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function alterarQuantidade(id, delta) {
    let c = getCarrinho();
    const i = c.find(p => p.id === id);
    if (i) {
        i.quantidade = (i.quantidade || 1) + delta;
        delete i.quantity;
        if (i.quantidade <= 0) c = c.filter(p => p.id !== id);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho();
        atualizarIconeCarrinho();
    }
}
function removerItem(id) {
    let c = getCarrinho().filter(p => p.id !== id);
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    carregarPaginaCarrinho();
    atualizarIconeCarrinho();
}


/* ==============================================================
   💳 CHECKOUT INTELIGENTE (Separa Vendedor de Cliente)
   ============================================================== */
async function carregarPaginaCheckout() {
    const listaResumo = document.querySelector('.summary-item-list');
    const areaBotoes = document.querySelector('.order-summary-box');
    const totalEl = document.getElementById('cart-total');

    if (!listaResumo) return;

    const carrinho = getCarrinho();
    
    // Se carrinho vazio
    if (carrinho.length === 0) {
        listaResumo.innerHTML = '<p>Seu carrinho está vazio.</p>';
        // Esconde qualquer botão que existir
        const btns = document.querySelectorAll('.btn-place-order');
        btns.forEach(b => b.style.display = 'none');
        return;
    }

    listaResumo.innerHTML = '<p>Carregando itens...</p>';
    
    let html = '';
    let subtotal = 0;
    let itensParaProcessar = []; 

    // 1. Monta a lista visual e calcula totais
    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();
            
            const titulo = p.name || p.titulo;
            const precoBase = parseFloat(p.price || p.preco_novo);
            // Aqui o FATOR_PRECO já foi definido no inicio do script (seja pelo login ou pelo link restaurado)
            const precoFinal = precoBase * FATOR_PRECO;
            const totalItem = precoFinal * item.quantidade;

            subtotal += totalItem;
            
            itensParaProcessar.push({
                nome: titulo,
                qtd: item.quantidade,
                unitario: precoFinal,
                total: totalItem,
                id: p.id
            });

            html += `
            <div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${titulo}</span>
                <strong>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>
            </div>`;
        } catch (e) {}
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = Number(subtotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    // === 2. DECISÃO: QUEM ESTÁ VENDO A TELA? ===
    
    // Limpa botões antigos para não duplicar
    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    // Cria container novo
    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";

    // Verifica se é AFILIADO (Vendedor) ou CLIENTE
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));

    if (afiliadoLogado) {
        // --- VISÃO DO VENDEDOR (Gera Link/PDF) ---
        console.log("Modo Vendedor: Mostrando ferramentas de orçamento");

        const btnZap = document.createElement('button');
        btnZap.className = "btn-place-order";
        btnZap.style.background = "#27ae60"; // Verde
        btnZap.innerHTML = `<i class="ph ph-whatsapp-logo"></i> Finalizar no WhatsApp`;
        btnZap.onclick = () => finalizarNoZap(itensParaProcessar, subtotal);

        const btnPDF = document.createElement('button');
        btnPDF.className = "btn-place-order";
        btnPDF.style.background = "#34495e"; // Azul Escuro
        btnPDF.innerHTML = `<i class="ph ph-file-pdf"></i> Baixar Orçamento PDF`;
        btnPDF.onclick = () => gerarOrcamentoPDF(itensParaProcessar, subtotal);

        container.appendChild(btnZap);
        container.appendChild(btnPDF);

    } else {
        // --- VISÃO DO CLIENTE (Paga a conta) ---
        console.log("Modo Cliente: Mostrando botão de pagamento");

        const btnPagar = document.createElement('button');
        btnPagar.className = "btn-place-order"; // Estilo padrão Laranja
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        
        // Colocamos os dados no botão para a função finalizarPedido usar
        btnPagar.dataset.itens = JSON.stringify(itensParaProcessar);
        
        btnPagar.onclick = finalizarPedido; // Chama a função que salva no banco

        container.appendChild(btnPagar);
    }
    
    // Adiciona na tela
    if(areaBotoes) areaBotoes.appendChild(container);
    
    // Esconde o botão original estático do HTML (aquele que vem no código base)
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- FUNÇÃO PARA GERAR O PDF COM LINK ---
function gerarOrcamentoPDF(itens, totalGeral) {
    if (!window.jspdf) return alert("Erro: Biblioteca jsPDF não carregou. Verifique o HTML.");
    
    const doc = new window.jspdf.jsPDF();
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    const nomeVendedor = afiliado ? afiliado.nome : "Vendas Online";
    const codigoVendedor = afiliado ? afiliado.codigo : "";

    // 1. Cabeçalho
    doc.setFontSize(22);
    doc.setTextColor(230, 126, 34); // Laranja
    doc.text("AutoPeças Veloz", 20, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Orçamento Oficial", 20, 30);
    doc.text(`Vendedor: ${nomeVendedor}`, 20, 36);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 20, 42);

    doc.line(20, 45, 190, 45); // Linha separadora

    // 2. Lista de Itens
    let y = 55;
    doc.setFontSize(10);
    doc.text("QTD   PRODUTO", 20, y);
    doc.text("TOTAL", 170, y, { align: "right" });
    y += 5;

    itens.forEach(item => {
        const nomeCurto = item.nome.substring(0, 40);
        const linha = `${item.qtd}x    ${nomeCurto}`;
        const preco = item.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        
        doc.text(linha, 20, y);
        doc.text(preco, 170, y, { align: "right" });
        y += 7;
    });

    doc.line(20, y, 190, y);
    y += 10;

    // 3. Total
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL A PAGAR: ${totalGeral.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 170, y, { align: "right" });

    // 4. LINK MÁGICO DE PAGAMENTO
    // Cria um link que restaura o carrinho e aplica o código do afiliado
    // Link aponta para o checkout.html do seu site atual
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '').replace('cart.html', '') + 'checkout.html';
    
    // Monta a URL: meussite.com/checkout.html?restore=[JSON]&ref=[CODIGO]
    let linkPagamento = `${baseUrl}?restore=${dadosCarrinho}`;
    if (codigoVendedor) linkPagamento += `&ref=${codigoVendedor}`;

    y += 20;
    doc.setTextColor(0, 0, 255); // Azul Link
    doc.setFontSize(11);
    doc.textWithLink("CLIQUE AQUI PARA PAGAR AGORA", 105, y, { url: linkPagamento, align: "center" });
    
    doc.setTextColor(100);
    doc.setFontSize(9);
    doc.text("(Ao clicar, você será direcionado para o pagamento seguro)", 105, y + 5, { align: "center" });

    // Salva o arquivo
    doc.save(`Orcamento_${new Date().getTime()}.pdf`);
}

function finalizarNoZap(itens, total) {
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (!afiliado) return alert("Faça login como parceiro para usar essa função ou use o PDF.");

    let msg = `*🏎️ Orçamento - AutoPeças Veloz*\n`;
    msg += `*Vendedor:* ${afiliado.nome}\n`;
    msg += `----------------------------------\n`;
    
    itens.forEach(item => {
        msg += `✅ ${item.qtd}x ${item.nome}\n`;
        msg += `   R$ ${item.total.toFixed(2).replace('.',',')}\n`;
    });
    
    msg += `----------------------------------\n`;
    msg += `*TOTAL: R$ ${total.toFixed(2).replace('.',',')}*\n`;
    
    // Adiciona o mesmo link do PDF no Zap para facilitar
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    const link = `${baseUrl}?restore=${dadosCarrinho}&ref=${afiliado.codigo}`;
    
    msg += `\n🔗 *Link para pagamento:* \n${link}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}


/* ==============================================================
   PRODUTOS, BUSCA E EXTRAS
   ============================================================== */
function setupProductPage() {
    const pId = new URLSearchParams(window.location.search).get('id');
    if(pId) {
        buscarProdutoPorId(pId);
        const btn = document.querySelector('.btn-add-cart');
        if(btn) btn.addEventListener('click', () => {
            adicionarAoCarrinho(pId, parseInt(document.getElementById('quantity-input').value || 1));
            alert('Adicionado ao carrinho!');
        });
    }
}
async function buscarProdutoPorId(id) {
    try {
        const res = await fetch(`${API_URL}/products/${id}`);
        const p = await res.json();
        document.getElementById('product-title').textContent = p.name || p.titulo;
        document.getElementById('main-product-image').src = p.image || p.imagem || '';
        document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo));
        if((p.quantity || p.estoque) > 0) document.querySelector('.btn-add-cart').disabled = false;
    } catch(e) {}
}
function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let i = c.find(p=>p.id==id);
    if(i){ i.quantidade=(i.quantidade||1)+qtd; delete i.quantity; }
    else c.push({id:parseInt(id), quantidade:qtd});
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
}
function atualizarIconeCarrinho() {
    const tot=getCarrinho().reduce((a,b)=>a+(b.quantidade||1),0);
    const i=document.querySelector('.cart-button span:last-child');
    if(i){ i.textContent=tot; i.style.display=tot>0?'grid':'none'; }
}
function setupGlobalSearch() {
    const btn = document.getElementById('search-button');
    const input = document.getElementById('search-input');
    if(btn && input) {
        btn.onclick=()=>{if(input.value)window.location.href=`busca.html?q=${input.value}`};
    }
}
function setupSearchPage() {
    const q=new URLSearchParams(window.location.search).get('q');
    if(q) executarBusca(q);
}
async function executarBusca(q) {
    try {
        const res=await fetch(`${API_URL}/search?q=${q}`);
        const d=await res.json();
        const t=document.getElementById("search-track");
        if(t){
            t.innerHTML='';
            d.forEach(p=>{
                t.innerHTML+=`<a href="product.html?id=${p.id}" class="product-card">
                <div class="product-image"><img src="${p.image||p.imagem}"></div>
                <h3>${p.name||p.titulo}</h3>
                <p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p></a>`;
            });
        }
    } catch(e){}
}

// BARRA DO PARCEIRO
function ativarModoParceiro(afiliado) {
    const btn = document.getElementById('btn-login-header');
    if(btn) {
        btn.innerHTML = `<i class="ph ph-sign-out"></i> Sair`;
        btn.href="#";
        btn.onclick=(e)=>{
            e.preventDefault();
            if(confirm("Sair do modo parceiro?")){
                localStorage.removeItem('afiliadoLogado');
                localStorage.removeItem('minhaMargem');
                window.location.reload();
            }
        };
    }
    const m = localStorage.getItem('minhaMargem')||0;
    const b = document.createElement('div');
    b.style.cssText = "position:fixed;top:0;left:0;width:100%;height:50px;background:#2c3e50;color:#fff;z-index:99999;display:flex;justify-content:center;align-items:center;gap:15px;";
    b.innerHTML = `<span>🦊 ${afiliado.nome}</span>
    <input type="number" id="imargem" value="${m}" style="width:50px;text-align:center;"> %
    <button id="bap" style="background:#27ae60;border:none;color:#fff;padding:5px 10px;cursor:pointer;">APLICAR</button>`;
    document.body.prepend(b);
    document.body.style.marginTop="50px";
    document.getElementById('bap').onclick=()=>{
        const v=parseFloat(document.getElementById('imargem').value);
        localStorage.setItem('minhaMargem',v);
        alert('Atualizado!');
        window.location.reload();
    };
}

// --- Função para buscar a margem do afiliado pelo código (Para o Cliente) ---
async function carregarMargemDoCodigo(codigo) {
    try {
        console.log(`🔍 Buscando comissão do parceiro: ${codigo}...`);
        const res = await fetch(`${API_URL}/afiliado/check/${codigo}`); // Essa rota já existe no seu server.js
        if (res.ok) {
            const data = await res.json();
            if (data.margem) {
                // ATUALIZA O PREÇO GLOBAL
                FATOR_PRECO = 1 + (data.margem / 100);
                console.log(`✅ Preços atualizados! Margem de +${data.margem}% aplicada.`);
            }
        }
    } catch (e) {
        console.error("Erro ao carregar margem:", e);
    }
}