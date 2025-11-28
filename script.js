/* ==============================================================
   🚀 SCRIPT GERAL DO SITE (Versão Final: Com Adicionar ao Carrinho)
   ============================================================== */

// CONFIGURAÇÕES GLOBAIS
const API_URL = ''; // Vazio = usa o mesmo domínio (Render)
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

// Atualiza a bolinha vermelha do carrinho
function atualizarIconeCarrinho() {
    const carrinho = getCarrinho();
    const totalItens = carrinho.reduce((acc, item) => acc + (item.quantidade || 1), 0);
    const icon = document.querySelector('.cart-button span:last-child');
    
    if(icon) {
        icon.textContent = totalItens;
        icon.style.display = totalItens > 0 ? 'grid' : 'none';
    }
}

// --- FUNÇÃO QUE FALTAVA: ADICIONAR AO CARRINHO ---
function adicionarAoCarrinho(id, qtd) {
    let c = getCarrinho();
    // Procura se já tem o item (converte id para numero para garantir)
    let item = c.find(p => p.id == id);
    
    if (item) {
        item.quantidade = (item.quantidade || 1) + qtd;
    } else {
        c.push({ id: parseInt(id), quantidade: qtd });
    }
    
    localStorage.setItem('nossoCarrinho', JSON.stringify(c));
    atualizarIconeCarrinho();
}

// ==============================================================
// 🏁 INICIALIZAÇÃO (QUANDO A PÁGINA CARREGA)
// ==============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🚀 Script Iniciado");

    // 1. MODO PARCEIRO
    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    if (afiliadoLogado) {
        const margemSalva = parseFloat(localStorage.getItem('minhaMargem') || 0);
        FATOR_PRECO = 1 + (margemSalva / 100);
        ativarModoParceiro(afiliadoLogado);
    } 
    else {
        // 2. MODO CLIENTE
        const paramsURL = new URLSearchParams(window.location.search);
        const refCode = paramsURL.get('ref') || localStorage.getItem('afiliadoCodigo');

        if (refCode) {
            localStorage.setItem('afiliadoCodigo', refCode);
            await carregarMargemDoCodigo(refCode);
        }
    }

    // 3. RECUPERAÇÃO DE CARRINHO VIA LINK
    const paramsURL = new URLSearchParams(window.location.search);
    const restoreData = paramsURL.get('restore'); 
    
    if (restoreData) {
        try {
            const jsonLimpo = decodeURIComponent(restoreData);
            const itensResgatados = JSON.parse(jsonLimpo);
            if (Array.isArray(itensResgatados)) {
                localStorage.setItem('nossoCarrinho', JSON.stringify(itensResgatados));
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.error("Erro link:", e); }
    }

    // 4. INICIALIZAÇÃO DAS PÁGINAS
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

    setupGlobalSearch(); // Configura busca e categorias
    
    if (document.getElementById("promocoes-track")) buscarProdutosPromocao();
    
    // Inicia o Slider se existir
    iniciarSlider();
});


/* ==============================================================
   🔎 BUSCA INTELIGENTE (TEXTO + CATEGORIA)
   ============================================================== */
function setupGlobalSearch() {
    const btn = document.getElementById('search-button');
    const input = document.getElementById('search-input');
    
    if(btn && input) {
        btn.onclick = (e) => { 
            e.preventDefault(); 
            fazerPesquisa(input.value, ''); 
        };

        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                fazerPesquisa(input.value, '');
            }
        });
    }

    // Configura os cards de categoria
    const linksCategoria = document.querySelectorAll('.category-card'); 
    linksCategoria.forEach(link => {
        link.addEventListener('click', (e) => {
            let categoriaNome = link.dataset.categoria;
            if(!categoriaNome) {
                const span = link.querySelector('span');
                categoriaNome = span ? span.innerText : '';
            }

            const textoDigitado = input ? input.value.trim() : '';
            
            if(textoDigitado !== '') {
                e.preventDefault();
                fazerPesquisa(textoDigitado, categoriaNome);
            }
        });
    });
}

function fazerPesquisa(texto, categoria) {
    if(!texto && !categoria) return;

    let url = `busca.html?`;
    if(texto) url += `q=${encodeURIComponent(texto)}&`;
    if(categoria) url += `categoria=${encodeURIComponent(categoria)}`;

    window.location.href = url;
}

function setupSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');           
    const categoria = params.get('categoria'); 
    
    if(q || categoria) executarBusca(q, categoria);
}

async function executarBusca(q, categoria) {
    try {
        let url = `${API_URL}/search?`;
        if (q) url += `q=${encodeURIComponent(q)}&`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;

        const res = await fetch(url);
        const data = await res.json();
        const track = document.getElementById("search-track");
        
        if(track) {
            track.innerHTML = '';
            if (data.length === 0) {
                track.innerHTML = '<p style="padding:20px; width:100%; text-align:center;">Nenhum produto encontrado.</p>';
                return;
            }
            data.forEach(p => {
                track.innerHTML += `
                <a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'"></div>
                    <h3>${p.name||p.titulo}</h3>
                    <p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>
                </a>`;
            });
        }
    } catch(e){
        console.error("Erro busca:", e);
    }
}


/* ==============================================================
   🛒 CARRINHO & CHECKOUT
   ============================================================== */
async function carregarPaginaCarrinho() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    if (!cartItemsContainer) return;

    let cart = getCarrinho();
    cartItemsContainer.innerHTML = ''; 

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Carrinho vazio.</td></tr>';
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
            const qtd = item.quantidade || 1; 

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
            
            const titulo = p.name || p.titulo;
            const precoBase = parseFloat(p.price || p.preco_novo);
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

            html += `<div class="summary-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>(${item.quantidade}x) ${titulo}</span>
                <strong>${Number(totalItem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>
            </div>`;
        } catch (e) {}
    }

    listaResumo.innerHTML = html;
    if(totalEl) totalEl.textContent = Number(subtotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    const containerAntigo = document.getElementById('container-botoes-dinamicos');
    if(containerAntigo) containerAntigo.remove();

    const container = document.createElement('div');
    container.id = "container-botoes-dinamicos";
    container.style.marginTop = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";

    const afiliadoLogado = JSON.parse(localStorage.getItem('afiliadoLogado'));

    if (afiliadoLogado) {
        const btnZap = document.createElement('button');
        btnZap.className = "btn-place-order";
        btnZap.style.background = "#27ae60"; 
        btnZap.innerHTML = `<i class="ph ph-whatsapp-logo"></i> Finalizar no WhatsApp`;
        btnZap.onclick = () => finalizarNoZap(itensParaProcessar, subtotal);

        const btnPDF = document.createElement('button');
        btnPDF.className = "btn-place-order";
        btnPDF.style.background = "#34495e"; 
        btnPDF.innerHTML = `<i class="ph ph-file-pdf"></i> Baixar Orçamento PDF`;
        btnPDF.onclick = () => gerarOrcamentoPDF(itensParaProcessar, subtotal);

        container.appendChild(btnZap);
        container.appendChild(btnPDF);
    } else {
        const btnPagar = document.createElement('button');
        btnPagar.className = "btn-place-order"; 
        btnPagar.innerHTML = `✅ Finalizar Pedido`;
        btnPagar.dataset.itens = JSON.stringify(itensParaProcessar);
        btnPagar.onclick = finalizarPedido; 
        container.appendChild(btnPagar);
    }
    
    if(areaBotoes) areaBotoes.appendChild(container);
    const btnOriginal = document.querySelector('.btn-place-order:not(#container-botoes-dinamicos button)');
    if(btnOriginal) btnOriginal.style.display = 'none';
}

async function finalizarPedido() {
    const btn = document.querySelector('#container-botoes-dinamicos button');
    const email = document.getElementById('email').value; 
    const rua = document.getElementById('rua').value;
    
    if(!email || !rua) return alert("Preencha Nome e Endereço.");

    const afiliadoCodigo = localStorage.getItem('afiliadoCodigo');
    btn.innerText = "Processando...";
    btn.disabled = true;

    try {
        const body = {
            cliente: { nome: email, email: email, endereco: rua },
            itens: JSON.parse(btn.dataset.itens),
            afiliadoCodigo: afiliadoCodigo
        };

        const res = await fetch(`${API_URL}/finalizar-pedido`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if(!res.ok) throw new Error(data.erro || 'Erro ao processar');

        alert(`Sucesso! Pedido #${data.id} realizado.`);
        localStorage.removeItem('nossoCarrinho');
        window.location.href = 'index.html';
    } catch (e) {
        alert("Erro: " + e.message);
        btn.innerText = "Tentar Novamente";
        btn.disabled = false;
    }
}

function gerarOrcamentoPDF(itens, totalGeral) {
    if (!window.jspdf) return alert("Erro: jsPDF não carregado.");
    const doc = new window.jspdf.jsPDF();
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    
    doc.setFontSize(22); doc.setTextColor(230, 126, 34); doc.text("AutoPeças Veloz", 20, 20);
    doc.setFontSize(12); doc.setTextColor(0); doc.text("Orçamento Oficial", 20, 30);
    doc.text(`Vendedor: ${afiliado ? afiliado.nome : 'Site'}`, 20, 36); 
    
    let y = 50;
    itens.forEach(item => {
        doc.text(`${item.qtd}x ${item.nome} - R$ ${item.total.toFixed(2)}`, 20, y);
        y += 10;
    });

    doc.text(`Total: R$ ${totalGeral.toFixed(2)}`, 20, y + 10);

    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '').replace('cart.html', '') + 'checkout.html';
    let linkPagamento = `${baseUrl}?restore=${dadosCarrinho}`;
    if(afiliado) linkPagamento += `&ref=${afiliado.codigo}`;

    y += 30;
    doc.setTextColor(0, 0, 255);
    doc.textWithLink("CLIQUE AQUI PARA PAGAR", 20, y, { url: linkPagamento });
    doc.save(`Orcamento.pdf`);
}

function finalizarNoZap(itens, total) {
    const afiliado = JSON.parse(localStorage.getItem('afiliadoLogado'));
    let msg = `*Orçamento - AutoPeças Veloz*\n`;
    itens.forEach(i => msg += `${i.qtd}x ${i.nome} - R$ ${i.total.toFixed(2)}\n`);
    msg += `Total: R$ ${total.toFixed(2)}\n`;
    
    const dadosCarrinho = encodeURIComponent(JSON.stringify(itens.map(i => ({id: i.id, quantidade: i.qtd}))));
    const baseUrl = window.location.origin + window.location.pathname.replace('checkout.html', '') + 'checkout.html';
    let link = `${baseUrl}?restore=${dadosCarrinho}`;
    if(afiliado) link += `&ref=${afiliado.codigo}`;
    
    msg += `Link: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// =======================================================
// 🦊 FUNÇÕES DO PARCEIRO
// =======================================================
function ativarModoParceiro(afiliado) {
    const btnLogin = document.getElementById('btn-login-header');
    if (btnLogin) {
        btnLogin.innerHTML = `<i class="ph ph-sign-out"></i><span>Sair (${afiliado.nome})</span>`;
        btnLogin.href = "#";
        btnLogin.style.color = "#e67e22"; 
        btnLogin.onclick = (e) => {
            e.preventDefault();
            if(confirm(`Sair do modo parceiro?`)) {
                localStorage.removeItem('afiliadoLogado');
                localStorage.removeItem('minhaMargem'); 
                window.location.reload();
            }
        };
    }

    const margemAtual = localStorage.getItem('minhaMargem') || 0;
    const barraAntiga = document.getElementById('barra-parceiro');
    if (barraAntiga) barraAntiga.remove();

    const barra = document.createElement('div');
    barra.id = "barra-parceiro";
    barra.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 50px; background: #2c3e50; color: white; z-index: 999999; display: flex; justify-content: center; align-items: center; gap: 15px; font-family: sans-serif;`;
    
    barra.innerHTML = `
        <span style="font-weight:bold; color:#f39c12;">🦊 ${afiliado.nome}</span>
        <a href="afiliado_dashboard.html" style="color: white; border: 1px solid white; padding: 2px 10px; text-decoration: none; border-radius: 4px;">Meu Painel</a>
        <input type="number" id="input-margem" value="${margemAtual}" style="width:50px; text-align:center;"> %
        <button id="btn-aplicar-margem">Aplicar</button>
    `;

    document.body.prepend(barra); 
    document.body.style.paddingTop = "50px"; 

    document.getElementById('btn-aplicar-margem').addEventListener('click', async () => {
        const novaMargem = parseFloat(document.getElementById('input-margem').value);
        localStorage.setItem('minhaMargem', novaMargem);
        try {
            if(afiliado.token) await fetch('/afiliado/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${afiliado.token}` }, body: JSON.stringify({ novaMargem }) });
        } catch(e) {}
        window.location.reload(); 
    });
}

async function carregarMargemDoCodigo(codigo) {
    try {
        const res = await fetch(`${API_URL}/afiliado/check/${codigo}`);
        if (res.ok) {
            const data = await res.json();
            if (data.margem) {
                FATOR_PRECO = 1 + (data.margem / 100);
            }
        }
    } catch (e) {}
}

function setupProductPage() {
    const pId = new URLSearchParams(window.location.search).get('id');
    if(pId) {
        buscarProdutoPorId(pId);
        const btn = document.querySelector('.btn-add-cart');
        const qtdInput = document.getElementById('quantity-input');
        
        if(btn) {
            // Remove listeners antigos (clone) para evitar duplicação
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', () => {
                const qtd = qtdInput ? parseInt(qtdInput.value) : 1;
                adicionarAoCarrinho(pId, qtd);
                alert('Produto adicionado ao carrinho!');
            });
        }
    }
}
async function buscarProdutoPorId(id) {
    try {
        const res = await fetch(`${API_URL}/products/${id}`);
        const p = await res.json();
        document.getElementById('product-title').textContent = p.name || p.titulo;
        document.getElementById('main-product-image').src = p.image || p.imagem;
        document.getElementById('product-price-new').textContent = formatarMoeda(parseFloat(p.price || p.preco_novo));
    } catch(e) {}
}
async function buscarProdutosPromocao() {
    try {
        const res = await fetch(`${API_URL}/search?q=`);
        const data = await res.json();
        const track = document.getElementById("promocoes-track");
        if(track) {
            track.innerHTML = '';
            data.slice(0, 4).forEach(p => {
                track.innerHTML += `<a href="product.html?id=${p.id}" class="product-card">
                    <div class="product-image"><img src="${p.image||p.imagem}" onerror="this.src='https://placehold.co/150'"></div>
                    <h3>${p.name||p.titulo}</h3>
                    <p class="price-new">${formatarMoeda(parseFloat(p.price||p.preco_novo))}</p>
                </a>`;
            });
        }
    } catch(e) {}
}

/* ==============================================================
   🖼️ SLIDER DA HOME
   ============================================================== */
let slideIndex = 0;
let slideInterval;

function iniciarSlider() {
    const slides = document.querySelectorAll('.slide');
    if(slides.length > 0) {
        mostrarSlide(slideIndex);
        slideInterval = setInterval(() => mudarSlide(1), 5000);
    }
}

function mudarSlide(n) {
    slideIndex += n;
    mostrarSlide(slideIndex);
    clearInterval(slideInterval);
    slideInterval = setInterval(() => mudarSlide(1), 5000);
}

function mostrarSlide(n) {
    const slides = document.querySelectorAll('.slide');
    if (slides.length === 0) return;

    if (n >= slides.length) slideIndex = 0;
    if (n < 0) slideIndex = slides.length - 1;

    slides.forEach(slide => slide.classList.remove('active'));
    slides[slideIndex].classList.add('active');
}
window.mudarSlide = mudarSlide;
window.iniciarSlider = iniciarSlider;