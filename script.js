/* ==============================================================
   🚀 SCRIPT GERAL (Versão: Margens Individuais + Edição no Carrinho)
   ============================================================== */

const API_URL = ''; 
let FATOR_GLOBAL = 1.0; // Margem padrão do perfil

// --- FUNÇÕES UTILITÁRIAS ---

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCarrinho() {
    try { return JSON.parse(localStorage.getItem('nossoCarrinho') || '[]'); } 
    catch (e) { return []; }
}

function atualizarIconeCarrinho() {
    const carrinho = getCarrinho();
    const totalItens = carrinho.reduce((acc, item) => acc + (item.quantidade || 1), 0);
    const icon = document.querySelector('.cart-button span:last-child');
    if(icon) {
        icon.textContent = totalItens;
        icon.style.display = totalItens > 0 ? 'grid' : 'none';
    }
}

// Adiciona item (Respeita margem global inicialmente)
function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    
    // Se for afiliado logado, pega a margem atual do perfil para iniciar
    const margemInicial = parseFloat(localStorage.getItem('minhaMargem') || 0);

    if (item) {
        item.quantidade = (item.quantidade || 1) + qtd;
    } else {
        c.push({ 
            id: parseInt(id), 
            quantidade: qtd,
            customMargin: margemInicial // Salva a margem no item
        });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
}

// ==============================================================
// 🏁 INICIALIZAÇÃO
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    
    // 1. MODO PARCEIRO
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_GLOBAL = 1 + (margemSalva / 100);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        // 2. MODO CLIENTE (Via Link)
        const paramsURL = new URLSearchParams(window.location.search);
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');
        if (refCode) {
            localStorage.setItem('afiliadoCodigo', refCode);
            await carregarMargemDoCodigo(refCode);
        }
    }

    // 3. RECUPERAÇÃO DO CARRINHO (AGORA COM MARGENS INDIVIDUAIS)
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) {
                // Aqui os itens já vêm com { id, quantidade, customMargin } do link
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            }
            // Limpa a URL para ficar bonita
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
    }

    // 4. ROTEAMENTO
    atualizarIconeCarrinho();
    const path = window.location.pathname;

    if (path.includes('checkout.html')) await carregarPaginaCheckout();
    else if (path.includes('cart.html')) carregarPaginaCarrinho();
    else if (path.includes('product.html')) setupProductPage();
    else if (path.includes('busca.html')) setupSearchPage();

    setupGlobalSearch();
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    if (typeof iniciarSlider === 'function') iniciarSlider();
});


/* ==============================================================
   🛒 CARRINHO INTELIGENTE (COM EDIÇÃO DE MARGEM)
   ============================================================== */
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    if (!cartItemsContainer) return;

    let cart = getCarrinho();
    cartItemsContainer.innerHTML = ''; 
    let total = 0;

    // Verifica se é afiliado para mostrar coluna de edição
    const isAfiliado = !!localStorage.getItem('afiliadoLogado');

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Carrinho vazio.</td></tr>';
        if (cartTotalElement) cartTotalElement.innerText = 'R$ 0,00';
        return;
    }

    for (const item of cart) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();

            const precoBase = parseFloat(p.price || p.preco_novo);
            
            // LÓGICA DE PREÇO: Se o item tem margem customizada, usa ela. Se não, usa a global.
            let margemAplicada = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            
            const precoFinal = precoBase * (1 + (margemAplicada / 100));
            const subtotal = precoFinal * item.quantidade;
            total += subtotal;

            // HTML DA MARGEM (Input se for afiliado, Texto invisível se for cliente)
            let htmlMargem = '';
            if(isAfiliado) {
                htmlMargem = `
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.8rem;">
                        <span style="color:#e67e22; font-weight:bold;">Lucro:</span>
                        <input type="number" value="${margemAplicada}" 
                            onchange="atualizarMargemCarrinho(${item.id}, this.value)"
                            style="width:50px; padding:5px; border:1px solid #ccc; border-radius:4px; text-align:center;"> %
                    </div>
                `;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><img src="${p.image||p.imagem}" width="60" style="border-radius:4px;"></td>
                <td>
                    ${p.name || p.titulo}
                    ${htmlMargem} </td>
                <td>${formatarMoeda(precoFinal)}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
                        <button onclick="alterarQuantidade(${item.id}, -1)">-</button>
                        <strong>${item.quantidade}</strong>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td>${formatarMoeda(subtotal)}</td>
                <td><button onclick="removerItem(${item.id})" style="color:red; border:none; cursor:pointer;">&times;</button></td>
            `;
            cartItemsContainer.appendChild(row);
        } catch (e) {}
    }
    if (cartTotalElement) cartTotalElement.innerText = formatarMoeda(total);

    // Se for afiliado, mostra botões de gerar link direto no carrinho
    if(isAfiliado) renderizarBotoesAfiliadoCarrinho();
}

// NOVA FUNÇÃO: Atualiza a margem de um item específico no LocalStorage
function atualizarMargemCarrinho(id, novaMargem) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    if(item) {
        item.customMargin = parseFloat(novaMargem);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho(); // Recarrega para atualizar totais
    }
}

function renderizarBotoesAfiliadoCarrinho() {
    const areaTotal = document.querySelector('.cart-total-box'); // Precisa existir no HTML ou vamos criar
    if(!areaTotal) return;

    // Remove botões antigos
    const oldBtns = document.getElementById('afiliado-cart-actions');
    if(oldBtns) oldBtns.remove();

    const div = document.createElement('div');
    div.id = 'afiliado-cart-actions';
    div.style.marginTop = '15px';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.flexDirection = 'column';

    div.innerHTML = `
        <button onclick="irParaCheckoutAfiliado()" style="background:#34495e; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; width:100%;">
            <i class="ph ph-share-network"></i> Gerar Link / PDF (Checkout)
        </button>
    `;
    areaTotal.appendChild(div);
}

function irParaCheckoutAfiliado() {
    window.location.href = 'checkout.html';
}

/* ==============================================================
   💳 CHECKOUT (PREPARADO PARA LINK ROBUSTO)
   ============================================================== */
async function carregarPaginaCheckout() {
    const listaResumo = document.querySelector('.summary-item-list');
    const areaBotoes = document.querySelector('.order-summary-box');
    const totalEl = document.getElementById('cart-total');

    if (!listaResumo) return;

    const carrinho = getCarrinho();
    if (carrinho.length === 0) {
        listaResumo.innerHTML = '<p>Carrinho vazio.</p>';
        return;
    }

    let subtotal = 0;
    let itensParaProcessar = []; 
    let html = '';

    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();
            
            const precoBase = parseFloat(p.price || p.preco_novo);
            
            // Usa margem customizada se existir, senão usa global
            let margem = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            
            const precoFinal = precoBase * (1 + (margem / 100));
            const totalItem = precoFinal * item.quantidade;

            subtotal += totalItem;
            
            itensParaProcessar.push({
                nome: p.name || p.titulo,
                qtd: item.quantidade,
                unitario: precoFinal,
                total: totalItem,
                id: p.id,
                customMargin: margem // Importante para o PDF saber
            });

            html += `<div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${p.name || p.titulo}</span>
                <strong>${formatarMoeda(totalItem)}</strong>
            </div>`;
        } catch (e) {}
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = formatarMoeda(subtotal);

    // Renderiza Botões
    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex"; container.style.flexDirection = "column"; container.style.gap = "10px";

    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));

    if (afiliadoLogado) {
        // MODO AFILIADO: Gera Link com as margens embutidas
        container.innerHTML = `
            <button onclick="gerarLinkZap('${afiliadoLogado.codigo}', ${subtotal})" class="btn-place-order" style="background:#27ae60;">
                <i class="ph ph-whatsapp-logo"></i> Mandar no WhatsApp
            </button>
            <button onclick="gerarPDFCustom()" class="btn-place-order" style="background:#34495e;">
                <i class="ph ph-file-pdf"></i> Baixar PDF
            </button>
        `;
        // Salvamos os itens no window para as funções usarem
        window.ITENS_CHECKOUT = itensParaProcessar;
    } else {
        // MODO CLIENTE
        const btnPagar = document.createElement('button');
        btnPagar.className = "btn-place-order"; 
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        btnPagar.onclick = () => finalizarPedido(itensParaProcessar); 
        container.appendChild(btnPagar);
    }
    if(areaBotoes) areaBotoes.appendChild(container);
    
    // Esconde botão padrão
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- NOVAS FUNÇÕES DE GERAÇÃO DE LINK (COM MARGEM NO URL) ---

function gerarPayloadUrl() {
    // Cria um JSON leve apenas com o necessário: [{id:1, qtd:2, customMargin:10}]
    const itens = window.ITENS_CHECKOUT || [];
    const payload = itens.map(i => ({
        id: i.id,
        quantidade: i.qtd,
        customMargin: i.customMargin
    }));
    return encodeURIComponent(JSON.stringify(payload));
}

function gerarLinkZap(codigo, total) {
    const payload = gerarPayloadUrl();
    const baseUrl = window.location.origin + window.location.pathname; // Pega URL atual (checkout.html)
    const link = `${baseUrl}?restore=${payload}&ref=${codigo}`;
    
    let msg = `*Orçamento AutoPeças Veloz*\n`;
    window.ITENS_CHECKOUT.forEach(i => {
        msg += `${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}\n`;
    });
    msg += `*Total: ${formatarMoeda(total)}*\n\n`;
    msg += `Pague aqui: ${link}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function gerarPDFCustom() {
    if (!window.jspdf) return alert("Erro JS PDF");
    const doc = new window.jspdf.jsPDF();
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    const itens = window.ITENS_CHECKOUT;

    doc.setFontSize(20); doc.text("AutoPeças Veloz", 20, 20);
    doc.setFontSize(12); doc.text(`Consultor: ${afiliado.nome}`, 20, 30);
    
    let y = 50;
    let total = 0;
    itens.forEach(i => {
        doc.text(`${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}`, 20, y);
        total += i.total;
        y += 10;
    });
    doc.text(`TOTAL: ${formatarMoeda(total)}`, 20, y+10);
    
    // Link Mágico
    const payload = gerarPayloadUrl();
    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?restore=${payload}&ref=${afiliado.codigo}`;
    
    y += 30;
    doc.setTextColor(0,0,255);
    doc.textWithLink("CLIQUE AQUI PARA PAGAR", 20, y, {url: link});
    
    doc.save("Orcamento.pdf");
}

async function finalizarPedido(itens) {
    const email = document.getElementById('email').value;
    const rua = document.getElementById('rua').value;
    if(!email || !rua) return alert("Preencha dados.");
    
    try {
        const body = {
            cliente: { nome: email, email: email, endereco: rua },
            itens: itens,
            afiliadoCodigo: localStorage.getItem('afiliadoCodigo')
        };
        const res = await fetch(`${API_URL}/finalizar-pedido`, {
            method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
        });
        if(res.ok) {
            alert("Pedido Realizado!");
            localStorage.removeItem('nossoCarrinho');
            window.location.href = 'index.html';
        } else alert("Erro ao finalizar.");
    } catch(e) { alert("Erro conexão."); }
}

// Funções de Carrinho (Remover/Alterar)
function alterarQuantidade(id, delta) {
    let c = getCarrinho();
    let i = c.find(p => p.id == id);
    if(i) {
        i.quantidade += delta;
        if(i.quantidade<=0) c = c.filter(p=>p.id!=id);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho(); atualizarIconeCarrinho();
    }
}
function removerItem(id) {
    let c = getCarrinho().filter(p => p.id != id);
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    carregarPaginaCarrinho(); atualizarIconeCarrinho();
}

// Resto das funções (Busca, Slider, etc - MANTIDAS IGUAIS, só vou abreviar pra caber)
function setupGlobalSearch() { /* ... código da busca ... */ }
function fazerPesquisa(t, c) { window.location.href = `busca.html?q=${t}&categoria=${c}`; }
function setupSearchPage() { /* ... código da pagina busca ... */ }
function setupProductPage() { /* ... código produto ... */ }
async function carregarMargemDoCodigo(c) { /* ... check margem ... */ }
function ativarModoParceiro(a) { /* ... barra preta ... */ }
function iniciarSlider() { /* ... slider ... */ }