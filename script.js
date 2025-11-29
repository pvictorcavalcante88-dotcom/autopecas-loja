/* ==============================================================
   🚀 SCRIPT GERAL (SALVAMENTO AUTOMÁTICO NO CHECKOUT)
   ============================================================== */

const API_URL = ''; 
let FATOR_GLOBAL = 1.0; 

// --- FUNÇÕES UTILITÁRIAS ---
function formatarMoeda(valor) {
    if (valor == null || isNaN(valor)) return 'R$ 0,00';
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

function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    const margemInicial = parseFloat(localStorage.getItem('minhaMargem') || 0);

    if (item) {
        item.quantidade = (item.quantidade || 1) + qtd;
    } else {
        c.push({ id: parseInt(id), quantidade: qtd, customMargin: margemInicial });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
    alert("Adicionado ao carrinho!");
}

// ==============================================================
// 🏁 INICIALIZAÇÃO
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_GLOBAL = 1 + (margemSalva / 100);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        const paramsURL = new URLSearchParams(window.location.search);
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');
        if (refCode) {
            localStorage.setItem('afiliadoCodigo', refCode);
            await carregarMargemDoCodigo(refCode);
        }
    }

    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
    }

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

// ==============================================================
// 🛒 CARRINHO
// ==============================================================
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    if (!cartItemsContainer) return;

    let cart = getCarrinho();
    cartItemsContainer.innerHTML = ''; 
    let total = 0;
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
            let margemAplicada = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            const precoFinal = precoBase * (1 + (margemAplicada / 100));
            const subtotal = precoFinal * item.quantidade;
            total += subtotal;

            let htmlMargem = '';
            if(isAfiliado) {
                htmlMargem = `
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.8rem; margin-top:5px;">
                        <span style="color:#e67e22; font-weight:bold;">Lucro:</span>
                        <input type="number" value="${margemAplicada}" 
                            onchange="atualizarMargemCarrinho(${item.id}, this.value)"
                            style="width:50px; padding:5px; border:1px solid #ccc; border-radius:4px; text-align:center;"> %
                    </div>
                `;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><img src="${p.image||p.imagem}" width="60" onerror="this.src='https://placehold.co/100'"></td>
                <td><strong>${p.name || p.titulo}</strong>${htmlMargem}</td>
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
    if(isAfiliado) renderizarBotoesAfiliadoCarrinho();
}

function atualizarMargemCarrinho(id, novaMargem) {
    let c = getCarrinho();
    let item = c.find(p => p.id == id);
    if(item) {
        item.customMargin = parseFloat(novaMargem);
        localStorage.setItem('nossoCarrinho', JSON.stringify(c));
        carregarPaginaCarrinho(); 
    }
}

// Botão Simples no Carrinho (apenas leva ao checkout, onde a mágica acontece)
function renderizarBotoesAfiliadoCarrinho() {
    const areaTotal = document.querySelector('.cart-total-box'); 
    if(!areaTotal) return;

    const oldBtns = document.getElementById('afiliado-cart-actions');
    if(oldBtns) oldBtns.remove();

    const div = document.createElement('div');
    div.id = 'afiliado-cart-actions';
    div.style.marginTop = '15px';
    
    div.innerHTML = `
        <button onclick="irParaCheckoutAfiliado()" style="background:#34495e; color:white; padding:12px; border:none; border-radius:5px; cursor:pointer; width:100%; font-weight:bold;">
            <i class="ph ph-share-network"></i> Finalizar / Gerar Link
        </button>
    `;
    areaTotal.appendChild(div);
}

function irParaCheckoutAfiliado() { window.location.href = 'checkout.html'; }


/* ==============================================================
   💳 CHECKOUT (MÁGICA DO SALVAMENTO AUTOMÁTICO)
   ============================================================== */
async function carregarPaginaCheckout() {
    const listaResumo = document.querySelector('.summary-item-list');
    const areaBotoes = document.querySelector('.order-summary-box');
    const totalEl = document.getElementById('cart-total');
    if (!listaResumo) return;

    const carrinho = getCarrinho();
    if (carrinho.length === 0) { listaResumo.innerHTML = '<p>Carrinho vazio.</p>'; return; }

    let subtotal = 0;
    let itensParaProcessar = []; 
    let html = '';

    for (const item of carrinho) {
        try {
            const response = await fetch(`${API_URL}/products/${item.id}`);
            if (!response.ok) continue;
            const p = await response.json();
            const precoBase = parseFloat(p.price || p.preco_novo);
            let margem = (item.customMargin !== undefined) ? item.customMargin : ((FATOR_GLOBAL - 1) * 100);
            const precoFinal = precoBase * (1 + (margem / 100));
            const totalItem = precoFinal * item.quantidade;
            subtotal += totalItem;
            
            itensParaProcessar.push({
                nome: p.name || p.titulo, qtd: item.quantidade, unitario: precoFinal, total: totalItem, id: p.id, customMargin: margem 
            });
            html += `<div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${p.name || p.titulo}</span><strong>${formatarMoeda(totalItem)}</strong></div>`;
        } catch (e) {}
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = formatarMoeda(subtotal);

    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex"; container.style.flexDirection = "column"; container.style.gap = "10px";

    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));

    if (afiliadoLogado) {
        // BOTÕES QUE SALVAM AUTOMATICAMENTE
        container.innerHTML = `
            <button id="btn-zap" onclick="gerarLinkZap('${afiliadoLogado.codigo}', ${subtotal})" class="btn-place-order" style="background:#27ae60;">
                <i class="ph ph-whatsapp-logo"></i> Mandar no WhatsApp
            </button>
            <button id="btn-pdf" onclick="gerarPDFCustom()" class="btn-place-order" style="background:#34495e;">
                <i class="ph ph-file-pdf"></i> Baixar PDF
            </button>
        `;
        window.ITENS_CHECKOUT = itensParaProcessar;
    } else {
        const btnPagar = document.createElement('button');
        btnPagar.className = "btn-place-order"; 
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        btnPagar.onclick = () => finalizarPedido(itensParaProcessar); 
        container.appendChild(btnPagar);
    }
    if(areaBotoes) areaBotoes.appendChild(container);
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

// --- FUNÇÃO "SILENCIOSA" PARA SALVAR ORÇAMENTO ---
async function salvarOrcamentoSilencioso(tipo) {
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if(!afiliado || !afiliado.token) return;

    // Tenta pegar o nome do input "Nome" (se tiver preenchido)
    // Se não tiver, gera um nome automático: "Orçamento WhatsApp - 29/11 10:30"
    const inputNome = document.getElementById('email'); // Usando o campo email/nome do form
    let nomeCliente = inputNome ? inputNome.value.trim() : "";
    
    const dataHora = new Date().toLocaleString('pt-BR', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'});
    
    let nomeFinal = nomeCliente ? `${nomeCliente} (${tipo})` : `Orçamento ${tipo} - ${dataHora}`;

    const carrinho = getCarrinho(); 
    if(carrinho.length === 0) return;

    // Feedback visual rápido (troca texto do botão)
    const btnId = tipo === 'WhatsApp' ? 'btn-zap' : 'btn-pdf';
    const btn = document.getElementById(btnId);
    let textoOriginal = "";
    if(btn) {
        textoOriginal = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-spinner"></i> Salvando...`;
    }

    try {
        await fetch(`${API_URL}/orcamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${afiliado.token}` },
            body: JSON.stringify({ nome: nomeFinal, itens: carrinho, total: 0 })
        });
        console.log("✅ Orçamento salvo automaticamente: " + nomeFinal);
    } catch(e) { 
        console.error("Erro ao salvar auto", e); 
    } finally {
        if(btn) btn.innerHTML = textoOriginal; // Restaura botão
    }
}

// --- AÇÕES DO AFILIADO (COM SAVE AUTOMÁTICO) ---
async function gerarLinkZap(codigo, total) {
    // 1. Salva Primeiro
    await salvarOrcamentoSilencioso('WhatsApp');

    // 2. Gera depois
    const payload = gerarPayloadUrl();
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    const link = `${baseUrl}?restore=${payload}&ref=${codigo}`;
    
    let msg = `*Orçamento AutoPeças Veloz*\n`; 
    window.ITENS_CHECKOUT.forEach(i => { msg += `${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}\n`; });
    msg += `*Total: ${formatarMoeda(total)}*\n\n`;
    msg += `Pague aqui: ${link}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

async function gerarPDFCustom() {
    // 1. Salva Primeiro
    await salvarOrcamentoSilencioso('PDF');

    // 2. Gera depois
    if (!window.jspdf) return alert("Erro JS PDF");
    const doc = new window.jspdf.jsPDF(); const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado')); const itens = window.ITENS_CHECKOUT;
    doc.setFontSize(20); doc.text("AutoPeças Veloz", 20, 20); doc.setFontSize(12); doc.text(`Consultor: ${afiliado.nome}`, 20, 30);
    let y = 50; let total = 0; itens.forEach(i => { doc.text(`${i.qtd}x ${i.nome} - ${formatarMoeda(i.total)}`, 20, y); total += i.total; y += 10; });
    doc.text(`TOTAL: ${formatarMoeda(total)}`, 20, y+10);
    const payload = gerarPayloadUrl(); const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html'; const link = `${baseUrl}?restore=${payload}&ref=${afiliado.codigo}`;
    y += 30; doc.setTextColor(0,0,255); doc.textWithLink("CLIQUE AQUI PARA PAGAR", 20, y, {url: link}); doc.save("Orcamento.pdf");
}

function gerarPayloadUrl() {
    const itens = window.ITENS_CHECKOUT || [];
    const payload = itens.map(i => ({ id: i.id, quantidade: i.qtd, customMargin: i.customMargin }));
    return encodeURIComponent(JSON.stringify(payload));
}

// FINALIZAR PEDIDO (CLIENTE)
async function finalizarPedido(itens) {
    const email = document.getElementById('email').value;
    const rua = document.getElementById('rua').value;
    if(!email || !rua) return alert("Preencha dados.");

    let afiliadoCodigo = localStorage.getItem('afiliadoCodigo');
    const logado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (!afiliadoCodigo && logado && logado.codigo) afiliadoCodigo = logado.codigo;

    try {
        const body = { cliente: { nome: email, email: email, endereco: rua }, itens: itens, afiliadoCodigo: afiliadoCodigo };
        const res = await fetch(`${API_URL}/finalizar-pedido`, { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if(res.ok) { alert("Pedido Realizado!"); localStorage.removeItem('nossoCarrinho'); window.location.href = 'index.html'; } 
        else alert("Erro ao finalizar.");
    } catch(e) { alert("Erro conexão."); }
}

// RESTO (Busca, Slider, etc - MANTIDOS)
function alterarQuantidade(id, delta) { let c = getCarrinho(); let i = c.find(p => p.id == id); if(i) { i.quantidade += delta; if(i.quantidade<=0) c = c.filter(p=>p.id!=id); localStorage.setItem('nossoCarrinho', JSON.stringify(c)); carregarPaginaCarrinho(); atualizarIconeCarrinho(); } }
function removerItem(id) { let c = getCarrinho().filter(p => p.id != id); localStorage.setItem('nossoCarrinho', JSON.stringify(c)); carregarPaginaCarrinho(); atualizarIconeCarrinho(); }
function setupGlobalSearch() {
    const btn = document.getElementById('search-button'); const input = document.getElementById('search-input');
    if(btn && input) { btn.onclick = (e) => { e.preventDefault(); fazerPesquisa(input.value, ''); }; input.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); fazerPesquisa(input.value, ''); } }); }
    document.querySelectorAll('.category-card').forEach(link => { link.addEventListener('click', (e) => { let cat = link.dataset.categoria; if(!cat) cat = link.querySelector('span') ? link.querySelector('span').innerText : ''; const val = input ? input.value.trim() : ''; if(val !== '') { e.preventDefault(); fazerPesquisa(val, cat); } }); });
}
function fazerPesquisa(t, c) { window.location.href = `busca.html?q=${encodeURIComponent(t)}&categoria=${encodeURIComponent(c)}`; }
function setupSearchPage() { const params = new URLSearchParams(window.location.search); if(params.get('q') || params.get('categoria')) executarBusca(params.get('q'), params.get('categoria')); }
async function executarBusca(q, c) { try { let url = `${API_URL}/search?`; if (q) url += `q=${encodeURIComponent(q)}&`; if (c) url += `categoria=${encodeURIComponent(c)}`; const res = await fetch(url); const data = await res.json(); const track = document.getElementById("search-track"); if(track) { track.innerHTML = ''; if (data.length === 0) { track.innerHTML = '<p style="padding:20px; text-align:center;">Nenhum produto encontrado.</p>'; return; } data.forEach(p => { track.innerHTML += `<a href="product.html?id=${p.id}" class="product-card"><div class="product-image"><img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'"></div><h3>${p.name||p.titulo}</h3><p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p></a>`; }); } } catch(e) {} }
function setupProductPage() { const pId = new URLSearchParams(window.location.search).get('id'); if(pId) { buscarProdutoPorId(pId); const btn = document.querySelector('.btn-add-cart'); const qtd = document.getElementById('quantity-input'); if(btn) { const n = btn.cloneNode(true); btn.parentNode.replaceChild(n, btn); n.addEventListener('click', () => { adicionarAoCarrinho(pId, qtd ? parseInt(qtd.value) : 1); }); } } }
async function buscarProdutoPorId(id) { try { const res = await fetch(`${API_URL}/products/${id}`); const p = await res.json(); document.getElementById('product-title').textContent = p.name || p.titulo; document.getElementById('main-product-image').src = p.image || p.imagem; document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo)); } catch(e) {} }
async function buscarProdutosPromocao() { try { const res = await fetch(`${API_URL}/search?q=`); const data = await res.json(); const track = document.getElementById("promocoes-track"); if(track) { track.innerHTML = ''; data.slice(0, 4).forEach(p => { track.innerHTML += `<a href="product.html?id=${p.id}" class="product-card"><div class="product-image"><img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'"></div><h3>${p.name||p.titulo}</h3><p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p></a>`; }); } } catch(e) {} }
async function carregarMargemDoCodigo(c) { try { const res = await fetch(`${API_URL}/afiliado/check/${c}`); if(res.ok) { const d = await res.json(); if(d.margem) FATOR_GLOBAL = 1 + (d.margem/100); } } catch(e) {} }
function ativarModoParceiro(afiliado) { const btnLogin = document.getElementById('btn-login-header'); if (btnLogin) { btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair</span>`; btnLogin.href = "#"; btnLogin.style.color = "#e67e22"; btnLogin.onclick = (e) => { e.preventDefault(); if(confirm(`Sair da conta de parceiro?`)) { localStorage.removeItem('afiliadoLogado'); localStorage.removeItem('minhaMargem'); window.location.reload(); } }; } const barraAntiga = document.getElementById('barra-parceiro'); if (barraAntiga) barraAntiga.remove(); const barra = document.createElement('div'); barra.id = "barra-parceiro"; barra.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 45px; background: linear-gradient(90deg, #1a252f 0%, #2c3e50 100%); color: white; z-index: 999999; display: flex; justify-content: space-between; align-items: center; padding: 0 5%; box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-family: sans-serif; box-sizing: border-box;`; barra.innerHTML = `<div style="display:flex; align-items:center; gap: 10px;"><div style="background:rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px; display:flex; align-items:center; gap:6px;"><span style="font-size: 1.1rem;">🦊</span><span style="font-size: 0.9rem; color: #ecf0f1;">Olá, <strong>${afiliado.nome}</strong></span></div><span style="font-size: 0.75rem; background:#27ae60; padding:2px 6px; border-radius:4px; font-weight:bold;">PARCEIRO ATIVO</span></div><a href="afiliado_dashboard.html" style="text-decoration: none; color: white; background: rgba(255,255,255,0.15); padding: 6px 15px; border-radius: 30px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.1);"><i class="ph ph-gauge"></i><span>Acessar Meu Painel</span></a>`; document.body.prepend(barra); document.body.style.paddingTop = "45px"; }
let slideIndex = 0; let slideInterval; function iniciarSlider() { const slides = document.querySelectorAll('.slide'); if(slides.length > 0) { mostrarSlide(slideIndex); slideInterval = setInterval(() => mudarSlide(1), 5000); } } function mudarSlide(n) { slideIndex += n; mostrarSlide(slideIndex); clearInterval(slideInterval); slideInterval = setInterval(() => mudarSlide(1), 5000); } function mostrarSlide(n) { const slides = document.querySelectorAll('.slide'); if (slides.length === 0) return; if (n >= slides.length) slideIndex = 0; if (n < 0) slideIndex = slides.length - 1; slides.forEach(slide => slide.classList.remove('active')); slides[slideIndex].classList.add('active'); } window.mudarSlide = mudarSlide; window.iniciarSlider = iniciarSlider;